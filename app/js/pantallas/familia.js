// Vista de estudiante / acudiente: notas, asistencia, observador y boletín.
// También la usan el admin y los profesores para ver a un estudiante.
import { E, base, perfiles, misEstudiantes, logoHTML } from '../estado.js';
import { esc, aviso, ventana, leerForm, confirmar, nombre, nombreLista, iniciales, vacio, fecha, hoy, ROL } from '../ui.js';
import { cabecera, pestanas, camposHTML } from './comun.js';
import { visiblesParaMi } from './circulares.js';
import { contarNoLeidos } from './mensajeria.js';
import { novedadesFamilia, obligacionesFamilia } from './tablero.js';
import { htmlFicha, conectarFicha, htmlAusencias, conectarAusencias } from './comunidad.js';
import { notaPeriodo, notaConIndicadores, notaIndicador, definitiva, notaFinal, mostrarNota, desempeno, resumenAsistencia } from '../calculos.js';

// Junta todo lo académico de un estudiante en el año activo
async function cargarEstudiante(estId) {
  const b = await base();
  await perfiles([estId]);
  const est = E.perfiles.get(estId);
  const mats = await E.db.select('matriculas', { eq: { estudiante_id: estId } });
  const mat = mats.find((x) => x.estado === 'activa' && b.cursos.some((c) => c.id === x.curso_id)) || mats.find((x) => b.cursos.some((c) => c.id === x.curso_id));
  const curso = mat && b.cursoPorId.get(mat.curso_id);
  const asigs = curso ? b.asignaciones.filter((a) => a.curso_id === curso.id) : [];
  const acts = asigs.length ? await E.db.select('actividades', { in: { asignacion_id: asigs.map((a) => a.id) }, order: ['fecha', 'nombre'] }) : [];
  const [notas, asis, inds, recs, ments] = await Promise.all([
    E.db.select('calificaciones', { eq: { estudiante_id: estId } }),
    E.db.select('asistencia', { eq: { estudiante_id: estId }, order: 'fecha desc' }),
    asigs.length ? E.db.select('indicadores', { in: { asignacion_id: asigs.map((a) => a.id) }, order: 'numero' }) : [],
    E.db.select('recuperaciones', { eq: { estudiante_id: estId } }),
    E.db.select('menciones', { eq: { estudiante_id: estId }, order: 'fecha desc' }),
  ]);
  const nota = Object.fromEntries(notas.map((n) => [n.actividad_id, n.valor]));
  // por materia: nota de cada periodo y final
  const materias = asigs.map((a) => {
    const porPeriodo = {};
    const recuperada = {};
    for (const p of b.periodos) {
      const base = notaConIndicadores(inds.filter((x) => x.asignacion_id === a.id && x.periodo_id === p.id), acts.filter((x) => x.asignacion_id === a.id && x.periodo_id === p.id), nota);
      const r = recs.find((x) => x.asignacion_id === a.id && x.periodo_id === p.id);
      const d = definitiva(base, r?.nota);
      porPeriodo[p.id] = d.valor;
      recuperada[p.id] = d.recuperada;
    }
    return { asig: a, materia: b.materiaPorId.get(a.materia_id), porPeriodo, recuperada, final: notaFinal(b.periodos, porPeriodo) };
  }).sort((x, y) => (x.materia?.nombre || '').localeCompare(y.materia?.nombre || ''));
  const asisAnio = asis.filter((f) => asigs.some((a) => a.id === f.asignacion_id));
  await perfiles(asigs.map((a) => a.profesor_id));
  return { b, est, curso, asigs, acts, nota, materias, asis: asisAnio, inds, ments };
}

const promedioGeneral = (materias, key) => {
  const v = materias.map((x) => (key ? x.porPeriodo[key] : x.final)).filter((x) => x != null);
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
};

const insignia = (v) => {
  const d = desempeno(v, E.colegio);
  return `<span class="insignia nota-${d.clase}"><b>${mostrarNota(v, E.colegio)}</b><small>${d.nombre}</small></span>`;
};

// ---------------------------------------------------------------- Inicio acudiente / estudiante
export async function inicio(m) {
  const ids = await misEstudiantes();
  if (E.rol === 'estudiante') return estudiante(m, { est: E.yo.id, inicio: 1 });
  const b = await base();
  const datos = await Promise.all(ids.map(cargarEstudiante));
  const circ = await visiblesParaMi(b, await E.db.select('circulares', { eq: { colegio_id: E.colegio.id } }));
  const leidas = new Set((await E.db.select('circular_lecturas', { eq: { perfil_id: E.yo.id } })).map((l) => l.circular_id));
  const sinLeer = circ.filter((c) => !leidas.has(c.id));
  const noLeidos = await contarNoLeidos();
  const novedades = await novedadesFamilia(ids);
  const obligaciones = await obligacionesFamilia(ids);
  m.innerHTML = `
    <h1 class="titulo">Hola, ${esc(E.yo.nombres || '')}</h1>
    ${noLeidos ? `<a class="aviso-caja enlace" href="#/bandeja">✉️ Tienes <b>${noLeidos}</b> mensaje(s) sin leer</a>` : ''}
    ${sinLeer.length ? `<a class="aviso-caja enlace" href="#/circulares">📣 Tienes <b>${sinLeer.length}</b> circular(es) sin leer</a>` : ''}
    ${obligaciones}
    ${datos.length ? datos.map((d) => {
      const per = b.periodos.filter((p) => d.materias.some((x) => x.porPeriodo[p.id] != null)).at(-1);
      const prom = per ? promedioGeneral(d.materias, per.id) : null;
      const bajas = per ? d.materias.filter((x) => x.porPeriodo[per.id] != null && desempeno(x.porPeriodo[per.id], E.colegio).clase === 'bajo') : [];
      const fallas = d.asis.filter((f) => f.estado === 'ausente').length;
      return `
        <a class="tarjeta tarjeta-hijo" href="#/estudiante/${d.est?.id}">
          <div class="fila"><span class="avatar grande">${esc(iniciales(d.est))}</span><span class="crece"><b>${esc(nombre(d.est))}</b><small>${d.curso ? 'Curso ' + esc(d.curso.nombre) : 'Sin curso este año'}</small></span>${insignia(prom)}</div>
          <div class="cifras pequenas">
            <span class="cifra"><b>${per ? esc(per.nombre) : '—'}</b><span>Último periodo</span></span>
            <span class="cifra"><b class="${bajas.length ? 'alerta' : ''}">${bajas.length}</b><span>Materias en bajo</span></span>
            <span class="cifra"><b class="${fallas ? 'alerta' : ''}">${fallas}</b><span>Fallas</span></span>
          </div>
        </a>`;
    }).join('') : vacio('Aún no estás vinculado a ningún estudiante. Pídele al colegio que te vincule como acudiente.')}
    ${novedades}`;
}

// ---------------------------------------------------------------- Ficha del estudiante
const TABS = [['notas', 'Notas'], ['asistencia', 'Asistencia'], ['observador', 'Seguimientos'], ['ficha', 'Ficha médica']];

export async function estudiante(m, p) {
  const tab = TABS.some((t) => t[0] === p.tab) ? p.tab : 'notas';
  const d = await cargarEstudiante(p.est);
  const { b } = d;
  const volver = p.inicio ? null : E.rol === 'admin' ? (d.curso ? `#/curso/${d.curso.id}` : '#/personas?tab=estudiante') : E.rol === 'profesor' ? '#/clases' : '#/inicio';
  const titulo = p.inicio && d.est?.id === E.yo.id ? `Hola, ${esc(E.yo.nombres || '')}` : esc(nombre(d.est));
  let html = '';

  if (tab === 'notas') {
    const conNota = b.periodos.filter((x) => d.materias.some((mm) => mm.porPeriodo[x.id] != null));
    html = !d.curso ? vacio('No tiene curso asignado este año.') : !d.materias.length ? vacio('El curso aún no tiene materias.') : `
      <div class="tabla-envoltura">
        <table class="tabla tabla-boletin">
          <thead><tr><th>Materia</th>${b.periodos.map((x) => `<th>${esc(x.nombre.replace('Periodo', 'P'))}</th>`).join('')}<th>Final</th></tr></thead>
          <tbody>${d.materias.map((mm) => `
            <tr><th scope="row"><button class="btn-link" data-materia="${mm.asig.id}">${esc(mm.materia?.nombre)}</button><small>${esc(nombre(E.perfiles.get(mm.asig.profesor_id)))}</small></th>
            ${b.periodos.map((x) => `<td><span class="nota-${desempeno(mm.porPeriodo[x.id], E.colegio).clase}">${mostrarNota(mm.porPeriodo[x.id], E.colegio)}${mm.recuperada[x.id] ? '<sup title="Definitiva con recuperación">✱</sup>' : ''}</span></td>`).join('')}
            <td><b class="nota-${desempeno(mm.final, E.colegio).clase}">${mostrarNota(mm.final, E.colegio)}</b></td></tr>`).join('')}
          </tbody>
          <tfoot><tr><th>Promedio</th>${b.periodos.map((x) => `<td><b>${mostrarNota(promedioGeneral(d.materias, x.id), E.colegio)}</b></td>`).join('')}<td><b>${mostrarNota(promedioGeneral(d.materias), E.colegio)}</b></td></tr></tfoot>
        </table>
      </div>
      <p class="ayuda">Toca una materia para ver el detalle de cada actividad. Desempeños: <span class="nota-bajo">Bajo</span> · <span class="nota-basico">Básico</span> · <span class="nota-alto">Alto</span> · <span class="nota-superior">Superior</span>.</p>
      ${conNota.length ? `<h3 class="sub">Boletines</h3><div class="rejilla">${conNota.map((x) => `<a class="mini" href="#/boletin/${d.est.id}/${x.id}"><b>📄 ${esc(x.nombre)}</b><small>${x.cerrado ? 'Definitivo' : 'Parcial'}</small></a>`).join('')}</div>` : ''}`;
  }

  if (tab === 'asistencia') {
    const r = resumenAsistencia(d.asis);
    html = `
      <div class="cifras">
        <span class="cifra"><b>${r.total ? Math.round((r.presente + r.tarde) * 100 / r.total) : 100}%</b><span>Asistencia</span></span>
        <span class="cifra"><b class="${r.ausente ? 'alerta' : ''}">${r.ausente}</b><span>Fallas</span></span>
        <span class="cifra"><b>${r.tarde}</b><span>Llegadas tarde</span></span>
        <span class="cifra"><b>${r.excusa}</b><span>Con excusa</span></span>
      </div>
      ${d.asis.filter((f) => f.estado !== 'presente').length ? `<div class="lista">${d.asis.filter((f) => f.estado !== 'presente').map((f) => `
        <div class="fila"><span class="chip as-${f.estado}">${{ ausente: 'Falla', tarde: 'Tarde', excusa: 'Excusa' }[f.estado]}</span><span class="crece"><b>${esc(b.materiaPorId.get(b.asignacionPorId.get(f.asignacion_id)?.materia_id)?.nombre || '')}</b><small>${fecha(f.fecha)}${f.nota ? ' · ' + esc(f.nota) : ''}</small></span></div>`).join('')}</div>` : vacio(r.total ? '¡Sin fallas ni llegadas tarde! 🎉' : 'Aún no hay registros de asistencia.')}`;
  }

  if (tab === 'observador') html = await htmlObservador(d.est.id);
  if (tab === 'ficha') html = E.rol === 'profesor' ? vacio('La ficha médica solo la ven el colegio y la familia.') : await htmlFicha(d.est.id);
  if (tab === 'asistencia') html += await htmlAusencias(d.est.id);

  const base = p.inicio ? '#/estudiante/' + d.est.id + '?inicio=1&tab=' : '#/estudiante/' + d.est.id + '?tab=';
  m.innerHTML = cabecera(titulo, { volver, acciones: (E.rol !== 'profesor' ? `<a class="btn" href="#/carnet/${d.est.id}">🪪 Carnet</a>` : '') + (E.rol === 'admin' ? `<button class="btn" data-certificados>📜 Certificados</button><a class="btn" href="#/estado-cuenta/${d.est.id}">💰 Estado de cuenta</a>` : '') }) +
    `<p class="sub-titulo">${d.curso ? `Curso ${esc(d.curso.nombre)} · ${esc(b.gradoPorId.get(d.curso.grado_id)?.nombre || '')}` : ''}${b.anio ? ' · ' + b.anio.anio : ''}</p>` +
    pestanas(TABS, tab, base) + `<div class="contenido">${html}</div>`;

  m.querySelectorAll('[data-materia]').forEach((bt) => (bt.onclick = () => detalleMateria(d, bt.dataset.materia)));
  m.querySelector('[data-certificados]')?.addEventListener('click', async () => {
    const { TIPOS_CERT } = await import('./certificados.js');
    const t = await ventana({ titulo: 'Expedir certificado', html: `<div class="lista">${Object.entries(TIPOS_CERT).map(([k, v]) => `<button class="fila fila-boton" data-t="${k}"><span>📜</span><span><b>${v}</b></span><span class="flecha">›</span></button>`).join('')}</div>`, alAbrir: (c, cerrar) => c.querySelectorAll('[data-t]').forEach((b2) => (b2.onclick = () => cerrar(b2.dataset.t))) });
    if (t) location.hash = `#/certificado/${t}/${d.est.id}`;
  });
  if (tab === 'observador') conectarObservador(m, d.est.id, () => estudiante(m, p));
  if (tab === 'ficha') conectarFicha(m, d.est.id, () => estudiante(m, p));
  if (tab === 'asistencia') conectarAusencias(m, d.est.id, () => estudiante(m, p));
}

function detalleMateria(d, asigId) {
  const { b } = d;
  const mm = d.materias.find((x) => x.asig.id === asigId);
  ventana({
    titulo: mm.materia?.nombre || 'Materia',
    html: `<p class="ayuda">Profesor: ${esc(nombre(E.perfiles.get(mm.asig.profesor_id)))}</p>` + b.periodos.map((per) => {
      const acts = d.acts.filter((a) => a.asignacion_id === asigId && a.periodo_id === per.id);
      const inds = (d.inds || []).filter((x) => x.asignacion_id === asigId && x.periodo_id === per.id);
      const filaAct = (a) => `<div class="fila"><span class="crece"><b>${esc(a.nombre)}</b><small>${Number(a.porcentaje)}%${a.fecha ? ' · ' + fecha(a.fecha) : ''}</small></span><b class="nota-${desempeno(d.nota[a.id], E.colegio).clase}">${mostrarNota(d.nota[a.id], E.colegio)}</b></div>`;
      const ments = (d.ments || []).filter((x) => x.asignacion_id === asigId && x.periodo_id === per.id);
      // Como Phidias: indicadores numerados con su dimensión y nota; se despliegan sus evaluaciones
      const cuerpo = inds.length ? `<div class="lista">${inds.map((ind) => {
        const v = notaIndicador(ind, acts, d.nota);
        const suyas = acts.filter((a) => a.indicador_id === ind.id);
        return `<details class="indicador"><summary><span class="num">${ind.numero}</span><span class="crece"><b>${esc(ind.descripcion)}</b><small>${esc(ind.dimension)} · ${Number(ind.peso)}%</small></span><b class="nota-${desempeno(v, E.colegio).clase}">${mostrarNota(v, E.colegio)}</b></summary>
          ${suyas.length ? `<div class="lista">${suyas.map(filaAct).join('')}</div>` : '<p class="ayuda">Sin evaluaciones.</p>'}</details>`;
      }).join('')}</div>`
        : acts.length ? `<div class="lista">${acts.map(filaAct).join('')}</div>` : '<p class="ayuda">Sin actividades.</p>';
      return `<h3 class="sub">${esc(per.nombre)} ${insignia(mm.porPeriodo[per.id])}${mm.recuperada?.[per.id] ? ' <small>✱ Definitiva con recuperación</small>' : ''}</h3>${cuerpo}
        ${ments.length ? `<p class="menciones">${ments.map((x) => `🏅 <b>${esc(x.tipo)}</b>${x.descripcion ? ': ' + esc(x.descripcion) : ''} <small>(${fecha(x.fecha)})</small>`).join('<br>')}</p>` : ''}`;
    }).join(''),
  });
}

// ---------------------------------------------------------------- Observador
const TIPOS = { positiva: ['👍', 'Positiva'], negativa: ['⚠️', 'Llamado de atención'], compromiso: ['🤝', 'Compromiso'], seguimiento: ['🔎', 'Seguimiento'] };
const puedeEscribirObs = () => E.rol === 'admin' || E.rol === 'profesor';
// Seguimientos (Phidias): categorías de registro por estudiante
const CATEGORIAS = { Observador: '📒', Convivencia: '🤝', Enfermería: '🩹', Psicología: '🧠', Tutoría: '🎓', 'Reunión con padres': '👨‍👩‍👧', Anecdotario: '📝' };

async function htmlObservador(estId) {
  let todas = await E.db.select('observaciones', { eq: { estudiante_id: estId }, order: ['fecha desc', 'creado_en desc'] });
  // la familia solo ve lo marcado como visible (en modo real ya lo filtra la RLS; así el demo se comporta igual)
  if (!puedeEscribirObs()) todas = todas.filter((f) => f.visible_acudiente);
  await perfiles(todas.map((f) => f.autor_id));
  const cats = [...new Set(todas.map((f) => f.categoria || 'Observador'))];
  const sel = E._catSeg && cats.includes(E._catSeg) ? E._catSeg : '';
  const filas = sel ? todas.filter((f) => (f.categoria || 'Observador') === sel) : todas;
  return `
    ${puedeEscribirObs() ? '<button class="btn btn-primario" data-nueva-obs>＋ Registro</button>' : ''}
    ${cats.length > 1 ? `<div class="chips filtros-seg"><button class="chip ${sel ? '' : 'ok'}" data-cat="">Todos (${todas.length})</button>${cats.map((c) => `<button class="chip ${c === sel ? 'ok' : ''}" data-cat="${esc(c)}">${CATEGORIAS[c] || '📌'} ${esc(c)} (${todas.filter((f) => (f.categoria || 'Observador') === c).length})</button>`).join('')}</div>` : ''}
    ${filas.length ? `<div class="lista linea-tiempo">${filas.map((f) => `
      <article class="obs obs-${f.tipo}">
        <header><span>${TIPOS[f.tipo][0]} <b>${TIPOS[f.tipo][1]}</b> <small class="chip">${CATEGORIAS[f.categoria] || '📌'} ${esc(f.categoria || 'Observador')}</small></span><small>${fecha(f.fecha)}</small></header>
        <p>${esc(f.descripcion)}</p>
        <footer><small>Por ${esc(nombre(E.perfiles.get(f.autor_id)))}${!f.visible_acudiente ? ' · 🔒 solo para el colegio' : ''}</small>
        ${f.autor_id === E.yo.id || E.rol === 'admin' ? `<button class="btn-link" data-editar-obs="${f.id}">Editar</button>` : ''}</footer>
      </article>`).join('')}</div>` : vacio('No hay registros de seguimiento.')}`;
}

function conectarObservador(m, estId, recargar) {
  m.querySelectorAll('[data-cat]').forEach((b) => (b.onclick = () => { E._catSeg = b.dataset.cat; recargar(); }));
  const campos = [
    { name: 'categoria', label: 'Seguimiento', tipo: 'select', opciones: Object.keys(CATEGORIAS).map((c) => [c, `${CATEGORIAS[c]} ${c}`]), def: 'Observador' },
    { name: 'tipo', label: 'Tipo', tipo: 'select', opciones: Object.entries(TIPOS).map(([k, [ic, t]]) => [k, `${ic} ${t}`]) },
    { name: 'fecha', label: 'Fecha', tipo: 'date', def: hoy() },
    { name: 'descripcion', label: 'Descripción', tipo: 'textarea' },
    { name: 'visible_acudiente', label: 'Visible para el estudiante y su acudiente', tipo: 'checkbox', def: true },
  ];
  const guardar = async (fila) => {
    const r = await ventana({
      titulo: fila ? 'Editar anotación' : 'Nueva anotación',
      html: camposHTML(campos, fila || {}),
      botones: [
        ...(fila && E.rol === 'admin' ? [{ texto: 'Eliminar', clase: 'btn-peligro', antes: async () => {
          if (!(await confirmar('¿Eliminar la anotación?', 'No se puede deshacer.', 'Eliminar'))) return false;
          await E.db.remove('observaciones', { id: fila.id }); return true;
        } }] : []),
        { texto: 'Cancelar' },
        { texto: 'Guardar', antes: async (c) => {
          const d = leerForm(c);
          if (!d.descripcion) throw new Error('Escribe la descripción.');
          d.fecha ||= hoy();
          if (fila) await E.db.update('observaciones', d, { id: fila.id });
          else await E.db.insert('observaciones', [{ colegio_id: E.colegio.id, estudiante_id: estId, autor_id: E.yo.id, ...d }]);
          return true;
        } },
      ],
    });
    if (r) { aviso('Observador actualizado'); recargar(); }
  };
  m.querySelector('[data-nueva-obs]')?.addEventListener('click', () => guardar(null));
  m.querySelectorAll('[data-editar-obs]').forEach((bt) => (bt.onclick = async () => {
    const [fila] = await E.db.select('observaciones', { eq: { id: bt.dataset.editarObs } });
    guardar(fila);
  }));
}

export async function observador(m, p) {
  location.replace(`#/estudiante/${p.est}?tab=observador`);
}

// ---------------------------------------------------------------- Boletín (para imprimir / PDF)
export async function boletin(m, p) {
  const d = await cargarEstudiante(p.est);
  const { b } = d;
  const per = b.periodoPorId.get(p.periodo);
  if (!per) { m.innerHTML = vacio('Ese periodo no existe.'); return; }
  const hasta = b.periodos.filter((x) => x.numero <= per.numero);
  const prom = promedioGeneral(d.materias, per.id);
  const r = resumenAsistencia(d.asis.filter((x) => (!per.fecha_inicio || x.fecha >= per.fecha_inicio) && (!per.fecha_fin || x.fecha <= per.fecha_fin)));
  const obs = (await E.db.select('observaciones', { eq: { estudiante_id: d.est.id }, order: 'fecha desc' })).filter((o) => o.visible_acudiente).slice(0, 3);
  const director = d.curso?.director_id && (await perfiles([d.curso.director_id])).get(d.curso.director_id);
  m.innerHTML = `
    <div class="no-imprimir cabecera">
      <a class="btn-icono" href="#/estudiante/${d.est.id}" aria-label="Volver">←</a>
      <h1 class="titulo">Boletín</h1>
      <div class="acciones"><button class="btn btn-primario" onclick="window.print()">🖨 Imprimir / PDF</button></div>
    </div>
    <article class="boletin">
      <header class="boletin-cab">
        <div>${logoHTML('logo')}</div>
        <div><h2>${esc(E.colegio.nombre)}</h2><p>${esc([E.colegio.nit ? 'NIT ' + E.colegio.nit : '', E.colegio.ciudad].filter(Boolean).join(' · '))}</p>
        <p><b>Informe académico — ${esc(per.nombre)} ${b.anio ? b.anio.anio : ''}</b>${per.cerrado ? '' : ' <span class="chip">Parcial</span>'}</p></div>
      </header>
      <dl class="boletin-datos">
        <div><dt>Estudiante</dt><dd>${esc(nombreLista(d.est))}</dd></div>
        <div><dt>Documento</dt><dd>${esc([d.est?.tipo_documento, d.est?.numero_documento].filter(Boolean).join(' ') || '—')}</dd></div>
        <div><dt>Curso</dt><dd>${esc(d.curso?.nombre || '—')}</dd></div>
        <div><dt>Director(a)</dt><dd>${esc(director ? nombre(director) : '—')}</dd></div>
      </dl>
      <table class="tabla tabla-boletin">
        <thead><tr><th>Área / Materia</th><th>IH</th>${hasta.map((x) => `<th>${esc(x.nombre.replace('Periodo', 'P'))}</th>`).join('')}<th>Desempeño</th></tr></thead>
        <tbody>${d.materias.map((mm) => {
          const inds = (d.inds || []).filter((x) => x.asignacion_id === mm.asig.id && x.periodo_id === per.id);
          const actsP = d.acts.filter((x) => x.asignacion_id === mm.asig.id && x.periodo_id === per.id);
          return `<tr>
          <th scope="row">${esc(mm.materia?.nombre)}<small>${esc(mm.materia?.area || '')}${mm.asig.profesor_id ? ' · ' + esc(nombre(E.perfiles.get(mm.asig.profesor_id))) : ''}</small></th>
          <td>${mm.asig.intensidad_horaria ?? ''}</td>
          ${hasta.map((x) => `<td>${mostrarNota(mm.porPeriodo[x.id], E.colegio)}${mm.recuperada?.[x.id] ? '<sup>✱</sup>' : ''}</td>`).join('')}
          <td><b class="nota-${desempeno(mm.porPeriodo[per.id], E.colegio).clase}">${desempeno(mm.porPeriodo[per.id], E.colegio).nombre}</b></td></tr>
          ${inds.map((ind) => `<tr class="fila-logro"><td colspan="${hasta.length + 2}">${ind.numero}. ${esc(ind.descripcion)} <small>(${esc(ind.dimension)})</small></td><td>${mostrarNota(notaIndicador(ind, actsP, d.nota), E.colegio)}</td></tr>`).join('')}`;
        }).join('')}</tbody>
        <tfoot><tr><th>Promedio del periodo</th><td></td>${hasta.map((x) => `<td>${mostrarNota(promedioGeneral(d.materias, x.id), E.colegio)}</td>`).join('')}<td><b>${desempeno(prom, E.colegio).nombre}</b></td></tr></tfoot>
      </table>
      <section class="boletin-pie">
        <div><h3>Inasistencias</h3><p>Injustificadas: <b>${r.ausente}</b> · Justificadas: <b>${r.excusa}</b> · Llegadas tarde: <b>${r.tarde}</b></p></div>
        <div><h3>Observaciones</h3>${obs.length ? obs.map((o) => `<p>• ${esc(o.descripcion)}</p>`).join('') : '<p>Sin observaciones.</p>'}
          ${(d.ments || []).filter((x) => x.periodo_id === per.id).map((x) => `<p>🏅 <b>${esc(x.tipo)}</b>${x.descripcion ? ': ' + esc(x.descripcion) : ''}</p>`).join('')}</div>
        <p class="escala">Escala: ${E.colegio.nota_min} a ${E.colegio.nota_max}. Aprueba con ${E.colegio.nota_aprobacion}. Desempeños: Bajo · Básico · Alto · Superior (Decreto 1290 de 2009). ✱ = definitiva con recuperación.</p>
        <div class="firmas"><div><span></span>Rector(a)</div><div><span></span>Director(a) de curso</div></div>
      </section>
    </article>`;
}
