// Pantallas del profesor: mis clases, planilla de notas y asistencia.
import { E, base, perfiles, misAsignaciones, pref } from '../estado.js';
import { esc, aviso, ventana, leerForm, confirmar, nombre, nombreLista, vacio, fecha, hoy } from '../ui.js';
import { cabecera, camposHTML } from './comun.js';
import { visiblesParaMi } from './circulares.js';
import { pendientesProfesor, previaBandeja } from './tablero.js';
import { notaPeriodo, notaConIndicadores, definitiva, mostrarNota, desempeno, sumaPorcentajes, redondear } from '../calculos.js';

export const etiquetaAsig = (b, a) => `${b.materiaPorId.get(a.materia_id)?.nombre || 'Materia'} · ${b.cursoPorId.get(a.curso_id)?.nombre || ''}`;

// ---------------------------------------------------------------- Inicio
export async function inicio(m) {
  const b = await base();
  const mias = misAsignaciones(b);
  const dirijo = b.cursos.filter((c) => c.director_id === E.yo.id);
  const circ = (await visiblesParaMi(b, await E.db.select('circulares', { eq: { colegio_id: E.colegio.id }, order: 'publicada_en desc' }))).slice(0, 3);
  m.innerHTML = `
    <h1 class="titulo">Hola, ${esc(E.yo.nombres || 'profe')}</h1>
    ${await pendientesProfesor()}
    ${await previaBandeja()}
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
    <span class="botones-fila"><a class="btn btn-chico" href="#/grupo/${a.id}">⚙️ Administrar</a><a class="btn btn-chico" href="#/notas/${a.id}">📝 Notas</a><a class="btn btn-chico" href="#/asistencia/${a.id}">✅ Asistencia</a><a class="btn btn-chico" href="#/planeaciones?asig=${a.id}">📂 Planeaciones</a></span>
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
export async function estudiantesDe(asig) {
  const mats = (await E.db.select('matriculas', { eq: { curso_id: asig.curso_id } })).filter((x) => x.estado === 'activa');
  await perfiles(mats.map((x) => x.estudiante_id));
  return mats.map((x) => E.perfiles.get(x.estudiante_id) || { id: x.estudiante_id, nombres: '(sin nombre)', apellidos: '' })
    .sort((x, y) => nombreLista(x).localeCompare(nombreLista(y)));
}

// La planilla de notas está en planilla.js (criterios → experiencias → actividades)

export const DIMENSIONES = ['Cognitiva', 'Procedimental', 'Actitudinal', 'Comunicativa', 'Socioafectiva', 'Valorativa', 'Corporal', 'Estética'];
export const MENCIONES = ['Mérito', 'Excelencia académica', 'Esfuerzo', 'Liderazgo', 'Compañerismo', 'Creatividad', 'Puntualidad', 'Participación'];

// ---------------------------------------------------------------- Asistencia
const ESTADOS = [['presente', 'P', 'Presente'], ['ausente', 'A', 'Ausente'], ['tarde', 'T', 'Llegó tarde'], ['excusa', 'E', 'Con excusa']];
const CATEGORIA = Object.fromEntries(ESTADOS.map(([k, , t]) => [k, t]));

// Asistencia a clase (REA Phidias): si el colegio definió TIPOS de asistencia, cada estudiante tiene una lista
// con esos tipos, contadores por tipo que filtran, "Todos" para marcar el grupo, observación y el historial
// del día (lo que registraron otros docentes). Sin tipos, se usan P / A / T / E.
export async function asistencia(m, p) {
  const b = await base();
  const asig = b.asignacionPorId.get(p.asig);
  if (!asig) { m.innerHTML = vacio('Esa clase no existe.'); return; }
  const dia = p.fecha || hoy();
  const puede = asig.profesor_id === E.yo.id || E.rol === 'admin';
  const [ests, filas, tipos0] = await Promise.all([
    estudiantesDe(asig),
    E.db.select('asistencia', { eq: { asignacion_id: asig.id, fecha: dia } }),
    E.db.select('tipos_asistencia', { eq: { colegio_id: E.colegio.id }, order: 'orden' }).catch(() => []),
  ]);
  const tipos = tipos0.filter((x) => x.activo !== false);
  const usaTipos = tipos.length > 0;
  const tipoPorId = new Map(tipos0.map((x) => [x.id, x]));
  const tipoDefecto = tipos.find((x) => x.categoria === 'presente') || tipos[0];
  const prev = new Map(filas.map((f) => [f.estudiante_id, f]));
  const tomada = filas.length > 0;
  // valor elegido por estudiante: id del tipo (con tipos) o la categoría (sin tipos)
  const valor = new Map(ests.map((e) => { const f = prev.get(e.id); return [e.id, usaTipos ? (f?.tipo_id && tipoPorId.has(f.tipo_id) ? f.tipo_id : (tipos.find((t) => t.categoria === f?.estado)?.id || tipoDefecto.id)) : f?.estado || 'presente']; }));
  const nota = new Map(ests.map((e) => [e.id, prev.get(e.id)?.nota || '']));
  // Historial del día: lo que registraron en otras clases
  const otras = ests.length ? (await E.db.select('asistencia', { eq: { fecha: dia }, in: { estudiante_id: ests.map((e) => e.id) } }).catch(() => [])).filter((x) => x.asignacion_id !== asig.id) : [];
  await perfiles(otras.map((x) => b.asignacionPorId.get(x.asignacion_id)?.profesor_id).filter(Boolean));
  const etiquetaDe = (f) => (f.tipo_id && tipoPorId.get(f.tipo_id)?.nombre) || CATEGORIA[f.estado] || f.estado;
  let filtro = '';

  const opcionesLista = usaTipos ? tipos.map((t) => [t.id, t.nombre]) : ESTADOS.map(([k, , t]) => [k, t]);
  const pintarResumen = () => {
    const c = new Map(opcionesLista.map(([k]) => [k, 0]));
    for (const v of valor.values()) c.set(v, (c.get(v) || 0) + 1);
    m.querySelector('[data-resumen]').innerHTML = `<button class="chip ${filtro === '' ? 'activo' : ''}" data-filtro="">Todos (${ests.length})</button> ` + opcionesLista.map(([k, t]) => {
      const cat = usaTipos ? tipoPorId.get(k)?.categoria : k;
      return `<button class="chip as-${cat} ${filtro === k ? 'activo' : ''}" data-filtro="${esc(k)}">${esc(t)} (${c.get(k) || 0})</button>`;
    }).join(' ');
    m.querySelectorAll('[data-filtro]').forEach((bt) => (bt.onclick = () => { filtro = bt.dataset.filtro; aplicarFiltro(); pintarResumen(); }));
  };
  const aplicarFiltro = () => m.querySelectorAll('.fila-asistencia').forEach((f) => { f.hidden = !!filtro && valor.get(f.dataset.est) !== filtro; });

  const control = (e) => usaTipos
    ? `<select class="sel-asistencia" data-tipo aria-label="Asistencia de ${esc(nombreLista(e))}" ${puede ? '' : 'disabled'}>${tipos.map((t) => `<option value="${t.id}" ${valor.get(e.id) === t.id ? 'selected' : ''}>${esc(t.nombre)}</option>`).join('')}</select>`
    : `<div class="botones-as" role="radiogroup" aria-label="Asistencia de ${esc(nombreLista(e))}">${ESTADOS.map(([k, l, t]) => `<button role="radio" class="as as-${k} ${valor.get(e.id) === k ? 'activo' : ''}" aria-checked="${valor.get(e.id) === k}" data-estado="${k}" title="${t}" ${puede ? '' : 'disabled'}>${l}</button>`).join('')}</div>`;

  m.innerHTML = cabecera('Asistencia a clase', { volver: E.rol === 'admin' ? `#/curso/${asig.curso_id}` : '#/clases', acciones: `<a class="btn" href="#/notas/${asig.id}">Notas</a>` }) + `
    <p class="sub-titulo">${esc(etiquetaAsig(b, asig))}</p>
    <div class="tarjeta-cab">
      <label class="en-linea">Fecha <input type="date" value="${dia}" max="${hoy()}" data-fecha></label>
      ${puede && ests.length ? `<label class="en-linea">Todos ${usaTipos ? `<select data-todos><option value="">—</option>${tipos.map((t) => `<option value="${t.id}">${esc(t.nombre)}</option>`).join('')}</select>` : `<select data-todos><option value="">—</option>${ESTADOS.map(([k, , t]) => `<option value="${k}">${t}</option>`).join('')}</select>`}</label>` : ''}
    </div>
    <div class="resumen-asistencia" data-resumen></div>
    ${tomada ? `<p class="aviso-caja ok">Asistencia ya tomada para el ${fecha(dia)}. Puedes corregirla.</p>` : ''}
    ${ests.length ? `<div class="lista">${ests.map((e, i) => {
      const hist = otras.filter((x) => x.estudiante_id === e.id);
      return `<div class="fila fila-asistencia ${usaTipos ? 'con-tipos' : ''}" data-est="${e.id}">
        <span class="num">${i + 1}</span>
        <span class="crece"><b>${esc(nombreLista(e))}</b>${hist.length ? `<details class="hist-dia"><summary>Historial del día (${hist.length})</summary>${hist.map((x) => { const a2 = b.asignacionPorId.get(x.asignacion_id); return `<small>• ${esc(etiquetaDe(x))} — ${esc(b.materiaPorId.get(a2?.materia_id)?.nombre || 'Otra clase')}${a2?.profesor_id ? ' · ' + esc(nombre(E.perfiles.get(a2.profesor_id)) || '') : ''}${x.nota ? ' · ' + esc(x.nota) : ''}</small>`; }).join('')}</details>` : ''}</span>
        ${control(e)}
        <input class="obs-asistencia" data-nota placeholder="Observación" value="${esc(nota.get(e.id))}" aria-label="Observación de ${esc(nombreLista(e))}" ${puede ? '' : 'disabled'}>
      </div>`;
    }).join('')}</div>
      ${puede ? '<div class="pie-fijo"><button class="btn btn-primario btn-ancho" data-guardar>Guardar asistencia</button></div>' : ''}
      <p class="ayuda">${usaTipos ? `Todos empiezan en "${esc(tipoDefecto.nombre)}". Los tipos los define el colegio en Ajustes → Tipos de asistencia.` : 'P = presente · A = ausente · T = llegó tarde · E = con excusa. Todos empiezan en "presente".'}</p>` : vacio('Este curso no tiene estudiantes.')}`;
  pintarResumen();

  m.querySelector('[data-fecha]').onchange = (e) => { location.hash = `#/asistencia/${asig.id}?fecha=${e.target.value}`; };
  m.querySelector('[data-todos]')?.addEventListener('change', (e) => {
    const v = e.target.value; if (!v) return;
    for (const fila of m.querySelectorAll('.fila-asistencia')) {
      valor.set(fila.dataset.est, v);
      const s = fila.querySelector('[data-tipo]'); if (s) s.value = v;
      fila.querySelectorAll('[data-estado]').forEach((x) => { x.classList.toggle('activo', x.dataset.estado === v); x.setAttribute('aria-checked', x.dataset.estado === v); });
    }
    e.target.value = ''; pintarResumen(); aplicarFiltro();
  });
  m.querySelectorAll('.fila-asistencia').forEach((fila) => {
    fila.querySelector('[data-tipo]')?.addEventListener('change', (e) => { valor.set(fila.dataset.est, e.target.value); pintarResumen(); });
    fila.querySelectorAll('[data-estado]').forEach((bt) => (bt.onclick = () => {
      valor.set(fila.dataset.est, bt.dataset.estado);
      fila.querySelectorAll('[data-estado]').forEach((x) => { x.classList.toggle('activo', x === bt); x.setAttribute('aria-checked', x === bt); });
      pintarResumen();
    }));
    fila.querySelector('[data-nota]')?.addEventListener('input', (e) => nota.set(fila.dataset.est, e.target.value));
  });
  m.querySelector('[data-guardar]')?.addEventListener('click', async (ev) => {
    ev.target.disabled = true;
    try {
      const nuevas = [], cambios = [];
      for (const [est, v] of valor) {
        const f = prev.get(est);
        const datos = usaTipos ? { tipo_id: v, estado: tipoPorId.get(v)?.categoria || 'presente' } : { estado: v, tipo_id: null };
        const n = (nota.get(est) || '').trim() || null;
        if (!f) nuevas.push({ colegio_id: E.colegio.id, asignacion_id: asig.id, estudiante_id: est, fecha: dia, ...datos, nota: n, registrado_por: E.yo.id });
        else if (f.estado !== datos.estado || (f.tipo_id || null) !== datos.tipo_id || (f.nota || null) !== n) cambios.push([f.id, { ...datos, nota: n }]);
      }
      if (nuevas.length) await E.db.insert('asistencia', nuevas);
      for (const [id, d] of cambios) await E.db.update('asistencia', { ...d, registrado_por: E.yo.id }, { id });
      aviso('Asistencia guardada');
      asistencia(m, p);
    } catch (e) { aviso(e.message, 'error'); ev.target.disabled = false; }
  });
}
