// Docencia (REA Phidias, perfil docente):
//  * Clases: tarjetas por materia y curso (grado) con sus grupos.
//  * Administración de grupo: el centro de cada clase (materia × grupo × periodo) con el resumen de
//    estudiantes, actividades, asistencia, recuperaciones, observaciones, seguimientos y menciones.
//  * Dirección de grupo: para el director de curso (directorio, asistencia del día, academia, seguimientos, menciones).
import { E, base, perfiles, misAsignaciones, pref } from '../estado.js';
import { esc, nombre, nombreLista, vacio, fecha, fechaHora, hoy } from '../ui.js';
import { cabecera } from './comun.js';
import { enVentana, mostrarNota, desempeno, verNotaEscala } from '../calculos.js';
import { notasDeAsignacion } from './notas_util.js';

const pct = (a, b) => (b ? Math.round((a * 100) / b * 10) / 10 : 0);

// ---------------------------------------------------------------- Clases
export async function clases(m) {
  const b = await base();
  const mias = E.rol === 'admin' ? b.asignaciones : misAsignaciones(b);
  // agrupar por materia + grado (como "Matemáticas · SÉPTIMO" con sus grupos A, B, C)
  const grupos = new Map();
  for (const a of mias) {
    const cu = b.cursoPorId.get(a.curso_id);
    const k = a.materia_id + '|' + (cu?.grado_id || '');
    if (!grupos.has(k)) grupos.set(k, { materia: b.materiaPorId.get(a.materia_id), grado: b.grados.find((g) => g.id === cu?.grado_id), asigs: [] });
    grupos.get(k).asigs.push(a);
  }
  const lista = [...grupos.values()].sort((x, y) => (x.materia?.nombre || '').localeCompare(y.materia?.nombre || '') || (x.grado?.orden ?? 0) - (y.grado?.orden ?? 0));
  m.innerHTML = cabecera('Clases') + `
    ${b.anio ? `<p class="ayuda">Año ${esc(String(b.anio.anio))}</p>` : ''}
    ${lista.length ? `<div class="rejilla-clases">${lista.map((g) => `
      <section class="tarjeta clase-curso">
        <h2>${esc(g.materia?.nombre || 'Materia')}</h2><p class="ayuda">${esc(g.grado?.nombre || '')}</p>
        <div class="lista">${g.asigs.sort((x, y) => (b.cursoPorId.get(x.curso_id)?.nombre || '').localeCompare(b.cursoPorId.get(y.curso_id)?.nombre || '')).map((a) => `
          <a class="fila fila-boton" href="#/grupo/${a.id}"><span class="avatar grupo-av">${esc(b.cursoPorId.get(a.curso_id)?.nombre || '')}</span><span class="crece"><b>${esc(b.cursoPorId.get(a.curso_id)?.nombre || '')}</b><small>Administración de grupo</small></span><span class="flecha">›</span></a>`).join('')}</div>
      </section>`).join('')}</div>` : vacio('Aún no tienes materias asignadas. El administrador te las asigna en cada curso.')}`;
}

// ---------------------------------------------------------------- Administración de grupo
export async function grupo(m, p) {
  const b = await base();
  const a = b.asignacionPorId.get(p.asig);
  if (!a) { m.innerHTML = vacio('Esa clase no existe.'); return; }
  if (!b.periodos.length) { m.innerHTML = cabecera('Administración de grupo', { volver: '#/clases' }) + vacio('El colegio aún no ha creado los periodos.'); return; }
  const clave = 'periodo_' + a.id;
  const per = b.periodos.find((x) => x.id === (p.periodo || pref(clave))) || b.periodos.find((x) => !x.cerrado) || b.periodos[0];
  pref(clave, per.id);
  const cu = b.cursoPorId.get(a.curso_id);
  const mat = b.materiaPorId.get(a.materia_id);
  const grado = b.grados.find((g) => g.id === cu?.grado_id);
  const mats = (await E.db.select('matriculas', { eq: { curso_id: a.curso_id } })).filter((x) => x.estado === 'activa');
  const ests = mats.map((x) => x.estudiante_id);
  const [acts, inds, recs, obs, asisHoy, ments, segs] = await Promise.all([
    E.db.select('actividades', { eq: { asignacion_id: a.id, periodo_id: per.id } }),
    E.db.select('indicadores', { eq: { asignacion_id: a.id, periodo_id: per.id } }),
    E.db.select('recuperaciones', { eq: { asignacion_id: a.id, periodo_id: per.id } }),
    E.db.select('observaciones_boletin', { eq: { asignacion_id: a.id, periodo_id: per.id } }).catch(() => []),
    E.db.select('asistencia', { eq: { asignacion_id: a.id, fecha: hoy() } }),
    E.db.select('menciones', { eq: { asignacion_id: a.id, periodo_id: per.id } }).catch(() => []),
    ests.length ? E.db.select('seguimiento_registros', { in: { estudiante_id: ests } }).catch(() => []) : [],
  ]);
  const notas = acts.length ? (await E.db.select('calificaciones', { in: { actividad_id: acts.map((x) => x.id) } })).filter((n) => !acts.find((x) => x.id === n.actividad_id)?.opcional) : [];
  const posibles = acts.filter((x) => !x.opcional).length * ests.length; // las opcionales no cuentan como pendientes
  const anotHoy = asisHoy.filter((x) => x.estado !== 'presente').length;
  const segPropios = segs.filter((r) => r.autor_id === E.yo.id).length;
  const hoyL = hoy();
  const fila = (href, ic, titulo, dato) => `<a class="fila fila-boton" href="${href}"><span class="avatar">${ic}</span><span class="crece"><b>${titulo}</b><small>${dato}</small></span><span class="flecha">›</span></a>`;
  const vRec = enVentana(per.recup_desde, per.recup_hasta, hoyL);
  const vNotas = enVentana(per.notas_desde, per.notas_hasta, hoyL);
  m.innerHTML = cabecera(`${esc(mat?.nombre || '')} · ${esc(cu?.nombre || '')}`, { volver: '#/clases', acciones: `<a class="btn" href="#/aula/${a.id}?tab=tablero">🖥 Modo aula</a>` }) + `
    <p class="ruta"><a href="#/clases">Clases</a> → ${esc(mat?.nombre || '')} ${esc(grado?.nombre || '')} → ${esc(cu?.nombre || '')}</p>
    <div class="segmentos" role="tablist" aria-label="Periodo">${b.periodos.map((x) => `<a role="tab" href="#/grupo/${a.id}?periodo=${x.id}" class="${x.id === per.id ? 'activo' : ''}">${esc(x.nombre)}${x.cerrado ? ' 🔒' : ''}</a>`).join('')}</div>
    <nav class="pestanas" role="tablist"><a role="tab" aria-selected="true" class="activo" href="#/grupo/${a.id}">Administración</a><a role="tab" href="#/aula/${a.id}?tab=tablero">Tablero</a><a role="tab" href="#/aula/${a.id}?tab=tareas">Tareas</a><a role="tab" href="#/aula/${a.id}?tab=examenes">Exámenes</a><a role="tab" href="#/calendario">Calendario</a></nav>
    <div class="acciones-grupo"><a class="btn btn-primario" href="#/notas/${a.id}?periodo=${per.id}">📝 Calificar</a><a class="btn" href="#/asistencia/${a.id}">✅ Asistencia</a><a class="btn" href="#/aula/${a.id}?tab=tareas&nueva=1">＋ Agregar tarea</a><a class="btn" href="#/aula/${a.id}?tab=examenes">＋ Agregar examen</a></div>
    <section class="tarjeta"><div class="lista resumen-grupo">
      ${fila(`#/notas/${a.id}?periodo=${per.id}`, '👥', 'Estudiantes', `${ests.length} estudiantes activos`)}
      ${fila(`#/consolidado/${a.id}?periodo=${per.id}`, '📊', 'Consolidado por criterios', 'Nota de cada estudiante en cada criterio, promedio y definitiva')}
      ${fila(`#/notas/${a.id}?periodo=${per.id}`, '📝', 'Actividades', `${inds.length} criterios, ${acts.length} actividades, ${notas.length} notas registradas (${pct(notas.length, posibles)}%)${!vNotas.abierta ? ' · registro de notas cerrado' : ''}`)}
      ${fila(`#/asistencia/${a.id}`, '✅', 'Asistencia a clase', `${asisHoy.length ? `${anotHoy} anotaciones hoy` : 'Sin tomar hoy'}`)}
      ${fila(`#/notas/${a.id}?periodo=${per.id}`, '🔁', 'Recuperaciones de periodo', `${recs.length} recuperaciones${vRec.definida ? ` · ${vRec.abierta ? 'abierto' : 'cerrado'} (${vRec.texto})` : ''}`)}
      ${fila(`#/observaciones-boletin/${a.id}?periodo=${per.id}`, '💬', 'Observaciones', `${obs.length} de ${ests.length} observaciones (${pct(obs.length, ests.length)}%)`)}
      ${fila('#/seguimientos', '📋', 'Seguimientos', `${segPropios} seguimientos propios, ${segs.length - segPropios} seguimientos del colegio`)}
      ${fila(`#/notas/${a.id}?periodo=${per.id}`, '🏅', 'Menciones', `${new Set(ments.map((x) => x.estudiante_id)).size} estudiantes en menciones`)}
      ${fila(`#/remediales/${a.id}`, '🏁', 'Remediales', 'Fin de año')}
      ${fila(`#/planeaciones?asig=${a.id}`, '📂', 'Planeaciones', 'Planeaciones de esta clase')}
    </div></section>`;
}

// ---------------------------------------------------------------- Dirección de grupo
export async function direccion(m) {
  const b = await base();
  const dirijo = b.cursos.filter((c) => c.director_id === E.yo.id);
  if (!dirijo.length) { m.innerHTML = cabecera('Dirección de grupo') + vacio('No eres director(a) de ningún curso este año.'); return; }
  const cu = dirijo[0];
  const mats = (await E.db.select('matriculas', { eq: { curso_id: cu.id } })).filter((x) => x.estado === 'activa');
  const ests = mats.map((x) => x.estudiante_id);
  await perfiles(ests);
  const lista = ests.map((id) => E.perfiles.get(id)).filter(Boolean).sort((x, y) => nombreLista(x).localeCompare(nombreLista(y)));
  const asigs = b.asignaciones.filter((a) => a.curso_id === cu.id);
  const per = b.periodos.find((x) => !x.cerrado) || b.periodos.at(-1);
  const [asisHoy, acus, segs, ments] = await Promise.all([
    ests.length ? E.db.select('asistencia', { eq: { fecha: hoy() }, in: { estudiante_id: ests } }) : [],
    ests.length ? E.db.select('acudientes', { in: { estudiante_id: ests } }) : [],
    ests.length ? E.db.select('seguimiento_registros', { in: { estudiante_id: ests } }).catch(() => []) : [],
    ests.length ? E.db.select('menciones', { in: { estudiante_id: ests } }).catch(() => []) : [],
  ]);
  await perfiles([...acus.map((x) => x.acudiente_id), ...asigs.map((a) => a.profesor_id)]);
  // Academia: definitiva del periodo actual por materia
  const notas = new Map();
  if (per) for (const a of asigs) notas.set(a.id, await notasDeAsignacion(a, b.periodos.filter((x) => x.numero <= per.numero), ests));
  const tab = location.hash.includes('tab=academia') ? 'academia' : location.hash.includes('tab=directorio') ? 'directorio' : 'resumen';
  const anot = asisHoy.filter((x) => x.estado !== 'presente');
  let cuerpo = '';
  if (tab === 'directorio') {
    cuerpo = `<div class="lista">${lista.map((e, i) => `<a class="fila fila-boton" href="#/estudiante/${e.id}"><span class="num">${i + 1}</span><span class="crece"><b>${esc(nombreLista(e))}</b><small>${acus.filter((x) => x.estudiante_id === e.id).map((x) => esc(nombre(E.perfiles.get(x.acudiente_id)) || '')).join(', ') || 'Sin acudiente'}</small></span><span class="flecha">›</span></a>`).join('')}</div>`;
  } else if (tab === 'academia') {
    cuerpo = per ? `<p class="ayuda">${esc(per.nombre)} · definitiva por materia</p><div class="tabla-envoltura"><table class="tabla tabla-notas"><thead><tr><th>Estudiante</th>${asigs.map((a) => `<th>${esc(b.materiaPorId.get(a.materia_id)?.nombre || '')}</th>`).join('')}</tr></thead>
      <tbody>${lista.map((e) => `<tr><th scope="row">${esc(nombreLista(e))}</th>${asigs.map((a) => { const v = notas.get(a.id)?.get(e.id)?.porPeriodo[per.id]; return `<td><b class="nota-${desempeno(v, E.colegio).clase}">${verNotaEscala(v, E.colegio)}</b></td>`; }).join('')}</tr>`).join('')}</tbody></table></div>` : vacio('Sin periodos.');
  } else {
    cuerpo = `<div class="lista resumen-grupo">
      <a class="fila fila-boton" href="#/calendario"><span class="avatar">📅</span><span class="crece"><b>Calendario</b></span><span class="flecha">›</span></a>
      <a class="fila fila-boton" href="#/direccion?tab=directorio"><span class="avatar">👥</span><span class="crece"><b>Directorio de curso</b><small>${lista.length} estudiantes activos</small></span><span class="flecha">›</span></a>
      <div class="fila"><span class="avatar">✅</span><span class="crece"><b>Asistencia al colegio</b><small>${anot.length} anotaciones hoy${anot.length ? ': ' + anot.slice(0, 4).map((x) => esc(nombre(E.perfiles.get(x.estudiante_id)) || '')).join(', ') + (anot.length > 4 ? '…' : '') : ''}</small></span></div>
      <a class="fila fila-boton" href="#/direccion?tab=academia"><span class="avatar">🎓</span><span class="crece"><b>Academia</b><small>Notas del periodo en todas las materias</small></span><span class="flecha">›</span></a>
      <a class="fila fila-boton" href="#/seguimientos"><span class="avatar">📋</span><span class="crece"><b>Seguimientos</b><small>${segs.filter((r) => r.autor_id === E.yo.id).length} seguimientos propios, ${segs.filter((r) => r.autor_id !== E.yo.id).length} seguimientos del colegio</small></span><span class="flecha">›</span></a>
      <div class="fila"><span class="avatar">🏅</span><span class="crece"><b>Menciones</b><small>${new Set(ments.map((x) => x.estudiante_id)).size} estudiantes en ${ments.length} menciones</small></span></div>
    </div>`;
  }
  m.innerHTML = cabecera('Dirección de grupo', { volver: tab === 'resumen' ? '' : '#/direccion' }) + `
    <p class="ayuda"><b>${esc(cu.nombre)}</b>${b.anio ? ' · ' + esc(String(b.anio.anio)) : ''}${dirijo.length > 1 ? ` · también diriges ${dirijo.slice(1).map((x) => esc(x.nombre)).join(', ')}` : ''}</p>
    <section class="tarjeta">${cuerpo}</section>`;
}

// ---------------------------------------------------------------- Consolidado por criterios (Phidias)
// Tabla del grupo: estudiante × criterios del periodo, promedio de los criterios y definitiva (con recuperación).
export async function consolidado(m, p) {
  const b = await base();
  const a = b.asignacionPorId.get(p.asig);
  if (!a) { m.innerHTML = vacio('Esa clase no existe.'); return; }
  const per = b.periodos.find((x) => x.id === p.periodo) || b.periodos.find((x) => !x.cerrado) || b.periodos[0];
  if (!per) { m.innerHTML = cabecera('Consolidado por criterios') + vacio('Sin periodos.'); return; }
  const { notaIndicador, definitiva, notaConIndicadores } = await import('../calculos.js');
  const mats = (await E.db.select('matriculas', { eq: { curso_id: a.curso_id } })).filter((x) => x.estado === 'activa');
  await perfiles(mats.map((x) => x.estudiante_id));
  const ests = mats.map((x) => E.perfiles.get(x.estudiante_id)).filter(Boolean).sort((x, y) => nombreLista(x).localeCompare(nombreLista(y)));
  const [acts, inds, recs] = await Promise.all([
    E.db.select('actividades', { eq: { asignacion_id: a.id, periodo_id: per.id } }),
    E.db.select('indicadores', { eq: { asignacion_id: a.id, periodo_id: per.id }, order: 'numero' }),
    E.db.select('recuperaciones', { eq: { asignacion_id: a.id, periodo_id: per.id } }),
  ]);
  const [exps, cal] = await Promise.all([
    inds.length ? E.db.select('experiencias', { in: { indicador_id: inds.map((x) => x.id) } }) : [],
    acts.length ? E.db.select('calificaciones', { in: { actividad_id: acts.map((x) => x.id) } }) : [],
  ]);
  const nota = new Map(cal.map((c) => [c.actividad_id + '|' + c.estudiante_id, c.valor]));
  const v = (x) => `<b class="nota-${desempeno(x, E.colegio).clase}">${verNotaEscala(x, E.colegio)}</b>`;
  const filas = ests.map((e) => {
    const mias = Object.fromEntries(acts.map((x) => [x.id, nota.get(x.id + '|' + e.id) ?? null]));
    const porInd = inds.map((ind) => notaIndicador(ind, acts, mias, exps));
    const con = porInd.filter((x) => x != null);
    const prom = con.length ? con.reduce((t, x) => t + x, 0) / con.length : null;
    const d = definitiva(notaConIndicadores(inds, acts, mias, exps), recs.find((r) => r.estudiante_id === e.id)?.nota);
    return { e, porInd, prom, d };
  });
  const csv = () => {
    const celda = (x) => { let t = String(x ?? ''); if (/^[=+\-@\t\r]/.test(t) && !/^-?\d+([.,]\d+)?$/.test(t)) t = "'" + t; return `"${t.replace(/"/g, '""')}"`; };
    const linea = (arr) => arr.map(celda).join(';');
    const num = (x) => (x == null ? '' : String(Math.round(x * 100) / 100).replace('.', ','));
    const txt = [linea(['Estudiante', ...inds.map((i) => `I${i.numero} ${i.dimension}`), 'Promedio', 'Definitiva']), ...filas.map((f) => linea([nombreLista(f.e), ...f.porInd.map(num), num(f.prom), num(f.d.valor)]))].join('\r\n');
    const url = URL.createObjectURL(new Blob(['\ufeff' + txt], { type: 'text/csv;charset=utf-8' }));
    const l = document.createElement('a'); l.href = url; l.download = `consolidado_${b.cursoPorId.get(a.curso_id)?.nombre || ''}_${per.nombre}.csv`; l.click(); URL.revokeObjectURL(url);
  };
  m.innerHTML = cabecera('Consolidado por criterios', { volver: `#/grupo/${a.id}?periodo=${per.id}`, acciones: '<button class="btn" data-csv>⬇ Excel</button>' }) + `
    <p class="ayuda"><b>${esc(b.materiaPorId.get(a.materia_id)?.nombre || '')} · ${esc(b.cursoPorId.get(a.curso_id)?.nombre || '')}</b> · un criterio sin notas queda vacío y no cuenta en el promedio.</p>
    <div class="segmentos" role="tablist">${b.periodos.map((x) => `<a role="tab" href="#/consolidado/${a.id}?periodo=${x.id}" class="${x.id === per.id ? 'activo' : ''}">${esc(x.nombre)}</a>`).join('')}</div>
    ${!inds.length ? vacio('Esta materia no tiene criterios en este periodo.') : `<div class="tabla-envoltura"><table class="tabla tabla-notas">
      <thead><tr><th>Estudiante</th>${inds.map((i) => `<th title="${esc(i.descripcion)}">I${i.numero}<small>${esc(i.dimension)} · ${Number(i.peso)}%</small></th>`).join('')}<th>Promedio</th><th>Definitiva</th></tr></thead>
      <tbody>${filas.map((f) => `<tr><th scope="row">${esc(nombreLista(f.e))}</th>${f.porInd.map((x) => `<td>${x == null ? '' : v(x)}</td>`).join('')}<td>${v(f.prom)}</td><td>${v(f.d.valor)}${f.d.recuperada ? '<sup>✱</sup>' : ''}</td></tr>`).join('')}</tbody></table></div>`}`;
  m.querySelector('[data-csv]').onclick = csv;
}
