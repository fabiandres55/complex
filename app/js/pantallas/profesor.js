// Pantallas del profesor: mis clases, planilla de notas y asistencia.
import { E, base, perfiles, misAsignaciones, pref } from '../estado.js';
import { esc, aviso, ventana, leerForm, confirmar, nombre, nombreLista, vacio, fecha, hoy } from '../ui.js';
import { cabecera, camposHTML } from './comun.js';
import { visiblesParaMi } from './circulares.js';
import { pendientesProfesor } from './tablero.js';
import { notaPeriodo, notaConIndicadores, definitiva, mostrarNota, desempeno, sumaPorcentajes, redondear } from '../calculos.js';

const etiquetaAsig = (b, a) => `${b.materiaPorId.get(a.materia_id)?.nombre || 'Materia'} · ${b.cursoPorId.get(a.curso_id)?.nombre || ''}`;

// ---------------------------------------------------------------- Inicio
export async function inicio(m) {
  const b = await base();
  const mias = misAsignaciones(b);
  const dirijo = b.cursos.filter((c) => c.director_id === E.yo.id);
  const circ = (await visiblesParaMi(b, await E.db.select('circulares', { eq: { colegio_id: E.colegio.id }, order: 'publicada_en desc' }))).slice(0, 3);
  m.innerHTML = `
    <h1 class="titulo">Hola, ${esc(E.yo.nombres || 'profe')}</h1>
    ${await pendientesProfesor()}
    ${dirijo.length ? `<section class="tarjeta"><h2>Director de curso</h2><div class="rejilla">${dirijo.map((c) => `<a class="mini" href="#/inicio" data-director="${c.id}"><b>${esc(c.nombre)}</b><small>Ver estudiantes</small></a>`).join('')}</div></section>` : ''}
    <section class="tarjeta">
      <div class="tarjeta-cab"><h2>Mis clases</h2><a class="btn btn-chico" href="#/clases">Ver todas</a></div>
      ${mias.length ? `<div class="lista">${mias.map((a) => tarjetaClase(b, a)).join('')}</div>` : vacio('Aún no tienes materias asignadas. El administrador te las asigna en cada curso.')}
    </section>
    <section class="tarjeta">
      <div class="tarjeta-cab"><h2>Circulares</h2><a class="btn btn-chico" href="#/circulares">Ver todas</a></div>
      ${circ.filter((c) => c.publicada_en).length ? `<div class="lista">${circ.filter((c) => c.publicada_en).map((c) => `<a class="fila fila-boton" href="#/circular/${c.id}"><span>📣</span><span><b>${esc(c.titulo)}</b><small>${fecha(c.publicada_en)}</small></span></a>`).join('')}</div>` : vacio('Sin circulares.')}
    </section>`;
  m.querySelectorAll('[data-director]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); verCursoDirector(b, a.dataset.director); }));
}

const tarjetaClase = (b, a) => `
  <div class="fila fila-clase">
    <span class="avatar">📘</span>
    <span class="crece"><b>${esc(b.materiaPorId.get(a.materia_id)?.nombre)}</b><small>Curso ${esc(b.cursoPorId.get(a.curso_id)?.nombre)}</small></span>
    <span class="botones-fila"><a class="btn btn-chico" href="#/notas/${a.id}">📝 Notas</a><a class="btn btn-chico" href="#/asistencia/${a.id}">✅ Asistencia</a><a class="btn btn-chico" href="#/planeaciones?asig=${a.id}">📂 Planeaciones</a></span>
  </div>`;

export async function clases(m) {
  const b = await base();
  const mias = misAsignaciones(b);
  m.innerHTML = cabecera('Mis clases') + (mias.length ? `<div class="lista">${mias.map((a) => tarjetaClase(b, a)).join('')}</div>` : vacio('Aún no tienes materias asignadas.'));
}

async function verCursoDirector(b, cursoId) {
  const mats = (await E.db.select('matriculas', { eq: { curso_id: cursoId } })).filter((x) => x.estado === 'activa');
  await perfiles(mats.map((x) => x.estudiante_id));
  const lista = mats.map((x) => E.perfiles.get(x.estudiante_id)).filter(Boolean).sort((x, y) => nombreLista(x).localeCompare(nombreLista(y)));
  await ventana({
    titulo: `Curso ${b.cursoPorId.get(cursoId)?.nombre}`,
    html: lista.length ? `<div class="lista">${lista.map((e, i) => `<a class="fila fila-boton" href="#/estudiante/${e.id}" data-cerrar><span class="num">${i + 1}</span><span><b>${esc(nombreLista(e))}</b></span><span class="flecha">›</span></a>`).join('')}</div>` : vacio('Sin estudiantes.'),
  });
}

// Estudiantes activos del curso de una asignación, ordenados por apellido
async function estudiantesDe(asig) {
  const mats = (await E.db.select('matriculas', { eq: { curso_id: asig.curso_id } })).filter((x) => x.estado === 'activa');
  await perfiles(mats.map((x) => x.estudiante_id));
  return mats.map((x) => E.perfiles.get(x.estudiante_id) || { id: x.estudiante_id, nombres: '(sin nombre)', apellidos: '' })
    .sort((x, y) => nombreLista(x).localeCompare(nombreLista(y)));
}

// ---------------------------------------------------------------- Planilla de notas
export async function planilla(m, p) {
  const b = await base();
  const asig = b.asignacionPorId.get(p.asig);
  if (!asig) { m.innerHTML = vacio('Esa clase no existe.'); return; }
  if (!b.periodos.length) { m.innerHTML = cabecera(esc(etiquetaAsig(b, asig)), { volver: '#/clases' }) + vacio('El colegio aún no ha creado los periodos del año.'); return; }
  const clave = 'periodo_' + asig.id;
  const per = b.periodos.find((x) => x.id === (p.periodo || pref(clave))) || b.periodos.find((x) => !x.cerrado) || b.periodos[0];
  pref(clave, per.id);
  const puedeEditar = (!per.cerrado && asig.profesor_id === E.yo.id) || E.rol === 'admin';

  const [ests, acts0, inds, recs] = await Promise.all([
    estudiantesDe(asig),
    E.db.select('actividades', { eq: { asignacion_id: asig.id, periodo_id: per.id }, order: ['fecha', 'nombre'] }),
    E.db.select('indicadores', { eq: { asignacion_id: asig.id, periodo_id: per.id }, order: 'numero' }),
    E.db.select('recuperaciones', { eq: { asignacion_id: asig.id, periodo_id: per.id } }),
  ]);
  // actividades ordenadas por indicador (como en Phidias: indicadores → evaluaciones)
  const ordenInd = new Map(inds.map((x, i) => [x.id, i]));
  const acts = [...acts0].sort((a, z) => (ordenInd.get(a.indicador_id) ?? 999) - (ordenInd.get(z.indicador_id) ?? 999));
  const notas = acts.length ? await E.db.select('calificaciones', { in: { actividad_id: acts.map((a) => a.id) } }) : [];
  const nota = new Map(notas.map((n) => [n.actividad_id + '|' + n.estudiante_id, n.valor]));
  const rec = new Map(recs.map((r) => [r.estudiante_id, r.nota]));
  const col = E.colegio;
  const pct = sumaPorcentajes(acts);
  const pesoInd = inds.reduce((s, x) => s + (Number(x.peso) || 0), 0);
  const sinInd = inds.length ? acts.filter((a) => !a.indicador_id) : [];
  const calc = (est) => {
    const mias = Object.fromEntries(acts.map((a) => [a.id, nota.get(a.id + '|' + est) ?? null]));
    return definitiva(notaConIndicadores(inds, acts, mias), rec.get(est));
  };

  const filaEst = (e, i) => {
    const d0 = calc(e.id);
    const d = desempeno(d0.valor, col);
    return `<tr data-est="${e.id}">
      <th scope="row"><button class="btn-link" data-alumno="${e.id}"><span class="num">${i + 1}</span> ${esc(nombreLista(e))}</button></th>
      ${acts.map((a) => { const v = nota.get(a.id + '|' + e.id); return `<td><input class="nota" data-act="${a.id}" inputmode="decimal" aria-label="Nota ${esc(a.nombre)} de ${esc(nombreLista(e))}" value="${v == null ? '' : mostrarNota(v, col)}" ${puedeEditar ? '' : 'disabled'}></td>`; }).join('')}
      <td class="col-rec"><input class="nota rec" data-rec="1" inputmode="decimal" aria-label="Recuperación de ${esc(nombreLista(e))}" value="${rec.has(e.id) ? mostrarNota(rec.get(e.id), col) : ''}" ${puedeEditar ? '' : 'disabled'}></td>
      <td class="def"><b class="nota-${d.clase}" data-def>${mostrarNota(d0.valor, col)}${d0.recuperada ? '<sup title="Definitiva con recuperación">✱</sup>' : ''}</b></td>
    </tr>`;
  };

  // cabecera: una fila de indicadores (si hay) y una de actividades
  const grupos = [];
  for (const a of acts) {
    const k = a.indicador_id && ordenInd.has(a.indicador_id) ? a.indicador_id : '';
    if (!grupos.length || grupos.at(-1).k !== k) grupos.push({ k, n: 0 });
    grupos.at(-1).n++;
  }
  const cabInd = inds.length ? `<tr class="fila-ind"><th></th>${grupos.map((g) => {
    const ind = inds.find((x) => x.id === g.k);
    return `<th colspan="${g.n}">${ind ? `<button class="btn-link" data-ind-edit="${ind.id}" ${puedeEditar ? '' : 'disabled'}>I${ind.numero} · ${esc(ind.dimension)}</button><small>${Number(ind.peso)}%</small>` : '<small class="alerta">Sin indicador</small>'}</th>`;
  }).join('')}<th></th><th></th></tr>` : '';

  m.innerHTML = cabecera(esc(etiquetaAsig(b, asig)), { volver: E.rol === 'admin' ? `#/curso/${asig.curso_id}` : '#/clases', acciones: `<a class="btn" href="#/asistencia/${asig.id}">Asistencia</a>` }) + `
    <div class="segmentos" role="tablist" aria-label="Periodo">${b.periodos.map((x) => `<a role="tab" href="#/notas/${asig.id}?periodo=${x.id}" class="${x.id === per.id ? 'activo' : ''}" aria-selected="${x.id === per.id}">${esc(x.nombre)}${x.cerrado ? ' 🔒' : ''}</a>`).join('')}</div>
    ${per.cerrado ? `<p class="aviso-caja">Este periodo está cerrado. ${E.rol === 'admin' ? 'Como administrador sí puedes cambiar notas.' : 'Solo el administrador puede cambiar notas.'}</p>` : ''}
    <div class="tarjeta-cab">
      <p class="ayuda">${inds.length
        ? `${inds.length} indicador(es) · pesos suman <b class="${pesoInd === 100 ? 'ok' : 'alerta'}">${redondear(pesoInd, 2)}%</b>${sinInd.length ? ` · <span class="alerta">${sinInd.length} actividad(es) sin indicador no cuentan</span>` : ''}`
        : `${acts.length} actividad(es) · suman <b class="${pct === 100 ? 'ok' : 'alerta'}">${redondear(pct, 2)}%</b>${pct !== 100 && acts.length ? ' (deberían sumar 100%)' : ''}`}</p>
      <div class="acciones">${puedeEditar ? '<button class="btn" data-indicadores>🎯 Indicadores</button><button class="btn btn-primario" data-nueva-act>＋ Actividad</button>' : ''}</div>
    </div>
    ${!ests.length ? vacio('Este curso no tiene estudiantes matriculados.') : !acts.length ? vacio(inds.length ? 'Ya tienes indicadores. Ahora crea las actividades (evaluaciones) de cada uno.' : 'Crea la primera actividad del periodo (taller, quiz, examen…) con su porcentaje. Si trabajas por logros, crea primero los Indicadores.') : `
    <div class="tabla-envoltura planilla">
      <table class="tabla tabla-notas">
        <thead>${cabInd}<tr><th>Estudiante</th>${acts.map((a) => `<th><button class="btn-link" data-act-edit="${a.id}" ${puedeEditar ? '' : 'disabled'}>${esc(a.nombre)}</button><small>${Number(a.porcentaje)}%</small></th>`).join('')}<th title="Recuperación">Recup.</th><th>Def.</th></tr></thead>
        <tbody>${ests.map(filaEst).join('')}</tbody>
      </table>
    </div>
    <p class="ayuda">Escribe la nota (${col.nota_min} a ${col.nota_max}) y pasa a la siguiente con Enter; se guarda sola. ${inds.length ? 'Cada indicador promedia sus actividades (según su %) y la definitiva promedia los indicadores según su peso.' : 'La definitiva usa los porcentajes de las actividades calificadas.'} Si el estudiante presentó <b>recuperación</b>, escríbela en "Recup.": queda la mayor (✱ = definitiva con recuperación). Toca un nombre para darle una mención.</p>`}`;

  const repintarDef = (tr) => {
    const d0 = calc(tr.dataset.est);
    const el = tr.querySelector('[data-def]');
    el.innerHTML = mostrarNota(d0.valor, col) + (d0.recuperada ? '<sup title="Definitiva con recuperación">✱</sup>' : '');
    el.className = 'nota-' + desempeno(d0.valor, col).clase;
  };

  // Guardado automático de cada nota (y de la recuperación)
  const guardar = async (inp) => {
    const tr = inp.closest('tr');
    const est = tr.dataset.est, act = inp.dataset.act, esRec = !!inp.dataset.rec;
    const txt = inp.value.trim().replace(',', '.');
    const previo = esRec ? rec.get(est) ?? null : nota.get(act + '|' + est) ?? null;
    const valor = txt === '' ? null : Number(txt);
    if (valor != null && (Number.isNaN(valor) || valor < col.nota_min || valor > col.nota_max)) {
      inp.classList.add('mal');
      aviso(`La nota debe estar entre ${col.nota_min} y ${col.nota_max}`, 'error');
      return;
    }
    inp.classList.remove('mal');
    if (valor === (previo == null ? null : Number(previo))) return;
    inp.classList.add('guardando');
    try {
      if (esRec) {
        if (valor == null) await E.db.remove('recuperaciones', { asignacion_id: asig.id, periodo_id: per.id, estudiante_id: est });
        else await E.db.upsert('recuperaciones', [{ colegio_id: E.colegio.id, asignacion_id: asig.id, periodo_id: per.id, estudiante_id: est, nota: valor, registrado_por: E.yo.id }], 'asignacion_id,periodo_id,estudiante_id');
        if (valor == null) rec.delete(est); else rec.set(est, valor);
      } else {
        if (valor == null) await E.db.remove('calificaciones', { actividad_id: act, estudiante_id: est });
        else await E.db.upsert('calificaciones', [{ colegio_id: E.colegio.id, actividad_id: act, estudiante_id: est, valor }], 'actividad_id,estudiante_id');
        nota.set(act + '|' + est, valor);
      }
      if (valor != null) inp.value = mostrarNota(valor, col);
      repintarDef(tr);
      inp.classList.add('guardado');
      setTimeout(() => inp.classList.remove('guardado'), 900);
    } catch (e) {
      inp.classList.add('mal');
      aviso(e.message, 'error');
    } finally { inp.classList.remove('guardando'); }
  };
  m.querySelectorAll('input.nota').forEach((inp) => {
    inp.addEventListener('change', () => guardar(inp));
    inp.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      const td = inp.closest('td');
      const idx = [...td.parentNode.children].indexOf(td);
      const tr = e.key === 'ArrowUp' ? td.parentNode.previousElementSibling : td.parentNode.nextElementSibling;
      const sig = tr?.children[idx]?.querySelector('input');
      if (sig) sig.focus(), sig.select(); else inp.blur();
    });
    inp.addEventListener('focus', () => inp.select());
  });

  const recargar = () => planilla(m, { ...p, periodo: per.id });
  const { editar } = await import('./comun.js');
  const camposAct = () => [
    { name: 'nombre', label: 'Nombre (ej. Taller 1, Quiz, Examen)', req: true },
    ...(inds.length ? [{ name: 'indicador_id', label: 'Indicador', tipo: 'select', vacio: 'Sin indicador', opciones: inds.map((x) => [x.id, `I${x.numero} · ${x.dimension} — ${x.descripcion.slice(0, 60)}`]) }] : []),
    { name: 'porcentaje', label: inds.length ? 'Porcentaje dentro del indicador (%)' : 'Porcentaje dentro del periodo (%)', tipo: 'number', req: true },
    { name: 'fecha', label: 'Fecha', tipo: 'date' },
  ];
  m.querySelector('[data-nueva-act]')?.addEventListener('click', async () => {
    const falta = inds.length ? '' : Math.max(0, 100 - pct);
    if (await editar({ titulo: 'Nueva actividad', tabla: 'actividades', campos: camposAct(), fila: { porcentaje: falta || '', fecha: hoy(), indicador_id: inds[0]?.id }, extra: { asignacion_id: asig.id, periodo_id: per.id } })) recargar();
  });
  m.querySelectorAll('[data-act-edit]').forEach((bt) => (bt.onclick = async () => {
    if (await editar({ titulo: 'Actividad', tabla: 'actividades', campos: camposAct(), fila: acts.find((a) => a.id === bt.dataset.actEdit) })) recargar();
  }));
  const camposInd = [
    { name: 'numero', label: 'Número', tipo: 'number', req: true },
    { name: 'descripcion', label: 'Descripción del logro / indicador', tipo: 'textarea', filas: 3, req: true },
    { name: 'dimension', label: 'Dimensión (tipo de evaluación)', tipo: 'select', opciones: DIMENSIONES.map((d) => [d, d]) },
    { name: 'peso', label: 'Peso en la nota del periodo (%)', tipo: 'number', req: true },
  ];
  const editarInd = async (fila) => {
    if (await editar({ titulo: fila?.id ? 'Indicador' : 'Nuevo indicador', tabla: 'indicadores', campos: camposInd, fila, extra: { asignacion_id: asig.id, periodo_id: per.id }, validar: (d) => { if (!d.descripcion) throw new Error('Escribe la descripción.'); } })) recargar();
  };
  m.querySelectorAll('[data-ind-edit]').forEach((bt) => (bt.onclick = () => editarInd(inds.find((x) => x.id === bt.dataset.indEdit))));
  m.querySelector('[data-indicadores]')?.addEventListener('click', async () => {
    const r = await ventana({
      titulo: `Indicadores · ${per.nombre}`,
      html: `<p class="ayuda">Los indicadores (logros) agrupan las actividades. Cada uno pertenece a una dimensión y tiene un peso en la nota del periodo.</p>
        ${inds.length ? `<div class="lista">${inds.map((x) => `<button class="fila fila-boton" data-i="${x.id}"><span class="num">I${x.numero}</span><span><b>${esc(x.descripcion)}</b><small>${esc(x.dimension)} · ${Number(x.peso)}% · ${acts.filter((a) => a.indicador_id === x.id).length} actividad(es)</small></span></button>`).join('')}</div>` : vacio('Aún no hay indicadores en este periodo.')}`,
      alAbrir: (caja, cerrar) => caja.querySelectorAll('[data-i]').forEach((el) => (el.onclick = () => { cerrar(null); editarInd(inds.find((x) => x.id === el.dataset.i)); })),
      botones: [{ texto: 'Cerrar' }, { texto: '＋ Indicador', valor: 'nuevo' }],
    });
    if (r === 'nuevo') editarInd({ numero: (inds.at(-1)?.numero || 0) + 1, dimension: 'Cognitiva', peso: inds.length ? '' : 100 });
  });
  // Menciones (Mérito, etc.) al tocar el nombre del estudiante
  m.querySelectorAll('[data-alumno]').forEach((bt) => (bt.onclick = async () => {
    const est = bt.dataset.alumno;
    const ments = (await E.db.select('menciones', { eq: { estudiante_id: est } })).filter((x) => x.asignacion_id === asig.id);
    const r = await ventana({
      titulo: nombre(E.perfiles.get(est)),
      html: `<p><a class="btn btn-chico" href="#/estudiante/${est}?tab=observador" data-cerrar>📒 Observador</a> <a class="btn btn-chico" href="#/estudiante/${est}" data-cerrar>📊 Todas sus notas</a></p>
        <h3 class="sub">Menciones en ${esc(b.materiaPorId.get(asig.materia_id)?.nombre || '')}</h3>
        ${ments.length ? `<div class="lista">${ments.map((x) => `<div class="fila"><span>🏅</span><span><b>${esc(x.tipo)}</b><small>${fecha(x.fecha)}${x.descripcion ? ' · ' + esc(x.descripcion) : ''}</small></span></div>`).join('')}</div>` : '<p class="ayuda">Sin menciones.</p>'}
        ${camposHTML([{ name: 'tipo', label: 'Nueva mención', tipo: 'select', opciones: MENCIONES.map((x) => [x, x]) }, { name: 'descripcion', label: 'Motivo (opcional)' }])}`,
      botones: [{ texto: 'Cerrar' }, { texto: '🏅 Dar mención', antes: async (caja) => {
        const d = leerForm(caja);
        await E.db.insert('menciones', [{ colegio_id: E.colegio.id, estudiante_id: est, asignacion_id: asig.id, periodo_id: per.id, tipo: d.tipo, descripcion: d.descripcion || null, autor_id: E.yo.id }]);
        return true;
      } }],
    });
    if (r === true) aviso('Mención registrada');
  }));
}

const DIMENSIONES = ['Cognitiva', 'Procedimental', 'Actitudinal', 'Comunicativa', 'Socioafectiva', 'Valorativa', 'Corporal', 'Estética'];
const MENCIONES = ['Mérito', 'Excelencia académica', 'Esfuerzo', 'Liderazgo', 'Compañerismo', 'Creatividad', 'Puntualidad', 'Participación'];

// ---------------------------------------------------------------- Asistencia
const ESTADOS = [['presente', 'P', 'Presente'], ['ausente', 'A', 'Ausente'], ['tarde', 'T', 'Llegó tarde'], ['excusa', 'E', 'Con excusa']];

export async function asistencia(m, p) {
  const b = await base();
  const asig = b.asignacionPorId.get(p.asig);
  if (!asig) { m.innerHTML = vacio('Esa clase no existe.'); return; }
  const dia = p.fecha || hoy();
  const puede = asig.profesor_id === E.yo.id || E.rol === 'admin';
  const [ests, filas] = await Promise.all([estudiantesDe(asig), E.db.select('asistencia', { eq: { asignacion_id: asig.id, fecha: dia } })]);
  const prev = new Map(filas.map((f) => [f.estudiante_id, f]));
  const tomada = filas.length > 0;
  const estado = new Map(ests.map((e) => [e.id, prev.get(e.id)?.estado || 'presente']));

  const pintar = () => {
    const c = { presente: 0, ausente: 0, tarde: 0, excusa: 0 };
    for (const v of estado.values()) c[v]++;
    m.querySelector('[data-resumen]').innerHTML = ESTADOS.map(([k, l, t]) => `<span class="chip as-${k}" title="${t}">${l}: ${c[k]}</span>`).join(' ');
  };

  m.innerHTML = cabecera('Asistencia', { volver: E.rol === 'admin' ? `#/curso/${asig.curso_id}` : '#/clases', acciones: `<a class="btn" href="#/notas/${asig.id}">Notas</a>` }) + `
    <p class="sub-titulo">${esc(etiquetaAsig(b, asig))}</p>
    <div class="tarjeta-cab">
      <label class="en-linea">Fecha <input type="date" value="${dia}" max="${hoy()}" data-fecha></label>
      <span data-resumen></span>
    </div>
    ${tomada ? `<p class="aviso-caja ok">Asistencia ya tomada para el ${fecha(dia)}. Puedes corregirla.</p>` : ''}
    ${ests.length ? `<div class="lista">${ests.map((e, i) => `
      <div class="fila fila-asistencia" data-est="${e.id}">
        <span class="num">${i + 1}</span><span class="crece"><b>${esc(nombreLista(e))}</b></span>
        <div class="botones-as" role="radiogroup" aria-label="Asistencia de ${esc(nombreLista(e))}">
          ${ESTADOS.map(([k, l, t]) => `<button role="radio" class="as as-${k} ${estado.get(e.id) === k ? 'activo' : ''}" aria-checked="${estado.get(e.id) === k}" data-estado="${k}" title="${t}" ${puede ? '' : 'disabled'}>${l}</button>`).join('')}
        </div>
      </div>`).join('')}</div>
      ${puede ? '<div class="pie-fijo"><button class="btn btn-primario btn-ancho" data-guardar>Guardar asistencia</button></div>' : ''}
      <p class="ayuda">P = presente · A = ausente · T = llegó tarde · E = con excusa. Todos empiezan en "presente".</p>` : vacio('Este curso no tiene estudiantes.')}`;
  pintar();

  m.querySelector('[data-fecha]').onchange = (e) => { location.hash = `#/asistencia/${asig.id}?fecha=${e.target.value}`; };
  m.querySelectorAll('.fila-asistencia').forEach((fila) => fila.querySelectorAll('[data-estado]').forEach((bt) => (bt.onclick = () => {
    estado.set(fila.dataset.est, bt.dataset.estado);
    fila.querySelectorAll('[data-estado]').forEach((x) => { x.classList.toggle('activo', x === bt); x.setAttribute('aria-checked', x === bt); });
    pintar();
  })));
  m.querySelector('[data-guardar]')?.addEventListener('click', async (ev) => {
    ev.target.disabled = true;
    try {
      const nuevas = [], cambios = [];
      for (const [est, v] of estado) {
        const f = prev.get(est);
        if (!f) nuevas.push({ colegio_id: E.colegio.id, asignacion_id: asig.id, estudiante_id: est, fecha: dia, estado: v, registrado_por: E.yo.id });
        else if (f.estado !== v) cambios.push([f.id, v]);
      }
      if (nuevas.length) await E.db.insert('asistencia', nuevas);
      for (const [id, v] of cambios) await E.db.update('asistencia', { estado: v, registrado_por: E.yo.id }, { id });
      aviso('Asistencia guardada');
      asistencia(m, p);
    } catch (e) { aviso(e.message, 'error'); ev.target.disabled = false; }
  });
}
