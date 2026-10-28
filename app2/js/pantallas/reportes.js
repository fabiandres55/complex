// Reportes para coordinación / rectoría (REA Phidias §2.4–2.5: reportes dinámicos,
// seguimiento al cargue de notas, analítica por curso). Todo exportable a CSV (Excel).
// Mapa COMPLEX.1: reportes de asistencia y de convivencia también para el docente (sus cursos)
// y el director de sección (su sección). Lo que cada quien ve lo decide la base de datos (RLS).
import { E, base, perfiles, pref } from '../estado.js';
import { esc, aviso, nombreLista, nombre, vacio, fecha } from '../ui.js';
import { cabecera, pestanas } from './comun.js';
import { cursosSeccion } from './enfermeria.js';
import { notaConIndicadores, definitiva, notaFinal, mostrarNota, desempeno, redondear } from '../calculos.js';

const TABS = [['sabana', 'Sábana de notas'], ['cumplimiento', 'Cumplimiento docente'], ['asistencia', 'Asistencia'], ['convivencia', 'Convivencia'], ['estudiantes', 'Listado de estudiantes']];
// Cursos y pestañas según el perfil: el docente, sus cursos (la sábana y el cumplimiento solo de los que dirige)
function alcance(b) {
  if (E.rol === 'admin') return { cursos: b.cursos, tabs: TABS };
  if (E.rol === 'director_seccion') return { cursos: cursosSeccion(b), tabs: TABS };
  const cursos = b.cursos.filter((c) => c.director_id === E.yo.id || b.asignaciones.some((a) => a.curso_id === c.id && a.profesor_id === E.yo.id));
  return { cursos, tabs: TABS, dirige: new Set(cursos.filter((c) => c.director_id === E.yo.id).map((c) => c.id)) };
}
const enRango = (d, desde, hasta) => (!desde || d >= desde) && (!hasta || d <= hasta);

function csv(nombreArchivo, filas) {
  const q = (s) => {
    let t = typeof s === 'number' ? String(s).replace('.', ',') : String(s ?? '');
    if (typeof s !== 'number' && /^[=+\-@]/.test(t)) t = "'" + t; // que Excel no lo tome como fórmula
    return `"${t.replace(/"/g, '""')}"`;
  };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + filas.map((f) => f.map(q).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  a.download = nombreArchivo.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.\-]+/g, '_') + '.csv';
  document.body.appendChild(a); a.click(); a.remove();
  aviso('Archivo descargado');
}

async function datosCurso(b, cursoId) {
  const mats = (await E.db.select('matriculas', { eq: { curso_id: cursoId } })).filter((x) => x.estado === 'activa');
  const ests = mats.map((x) => x.estudiante_id);
  const asigs = b.asignaciones.filter((a) => a.curso_id === cursoId);
  const ids = asigs.map((a) => a.id);
  const [acts, inds, recs] = await Promise.all([
    ids.length ? E.db.select('actividades', { in: { asignacion_id: ids } }) : [],
    ids.length ? E.db.select('indicadores', { in: { asignacion_id: ids } }) : [],
    ids.length ? E.db.select('recuperaciones', { in: { asignacion_id: ids } }) : [],
  ]);
  const cal = acts.length ? await E.db.select('calificaciones', { in: { actividad_id: acts.map((a) => a.id) } }) : [];
  const exps = inds.length ? await E.db.select('experiencias', { in: { indicador_id: inds.map((x) => x.id) } }) : [];
  await perfiles([...ests, ...asigs.map((a) => a.profesor_id)]);
  return { ests, asigs, acts, inds, recs, cal, exps };
}

export async function reportes(m, p) {
  const b = await base();
  const al = alcance(b);
  const cand = p.curso || pref('rep_curso');
  if (!al.cursos.length) { m.innerHTML = cabecera('Reportes') + vacio(E.rol === 'admin' ? 'Primero crea los cursos.' : 'No tienes cursos este año.'); return; }
  const cursoId = al.cursos.some((c) => c.id === cand) ? cand : al.cursos[0].id;
  // el docente ve sábana y cumplimiento solo del curso que dirige
  const tabs = al.dirige && !al.dirige.has(cursoId) ? TABS.filter(([k]) => !['sabana', 'cumplimiento'].includes(k)) : TABS;
  const tab = tabs.some((t) => t[0] === p.tab) ? p.tab : tabs[0][0];
  pref('rep_curso', cursoId);
  const curso = b.cursoPorId.get(cursoId);
  const per = b.periodos.find((x) => x.id === p.periodo) || b.periodos.find((x) => !x.cerrado) || b.periodos.at(-1);
  const selCurso = `<label class="en-linea">Curso <select data-curso>${al.cursos.map((c) => `<option value="${c.id}" ${c.id === cursoId ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}</select></label>`;
  const selPer = per ? `<label class="en-linea">Periodo <select data-periodo><option value="final" ${p.periodo === 'final' ? 'selected' : ''}>Acumulado del año</option>${b.periodos.map((x) => `<option value="${x.id}" ${p.periodo !== 'final' && x.id === per.id ? 'selected' : ''}>${esc(x.nombre)}</option>`).join('')}</select></label>` : '';
  let html = '', exportar = null;
  const perR = p.periodo && p.periodo !== 'final' ? b.periodos.find((x) => x.id === p.periodo) : null; // null = todo el año
  const desde = perR?.fecha_inicio || null, hasta = perR?.fecha_fin || null;
  const textoRango = perR ? `${perR.nombre}${desde || hasta ? ` (${desde ? fecha(desde) : '…'} – ${hasta ? fecha(hasta) : '…'})` : ''}` : 'Todo el año';

  if ((tab === 'sabana' || tab === 'cumplimiento') && !per) html = vacio('El colegio aún no tiene periodos en el año activo.');
  else if (tab === 'sabana' || tab === 'cumplimiento') {
    const d = await datosCurso(b, cursoId);
    const nota = new Map(d.cal.map((c) => [c.actividad_id + '|' + c.estudiante_id, c.valor]));
    const notaDe = (a, pr, est) => {
      const acts = d.acts.filter((x) => x.asignacion_id === a.id && x.periodo_id === pr.id);
      const porAct = Object.fromEntries(acts.map((x) => [x.id, nota.get(x.id + '|' + est) ?? null]));
      const base0 = notaConIndicadores(d.inds.filter((x) => x.asignacion_id === a.id && x.periodo_id === pr.id), acts, porAct, d.exps);
      return definitiva(base0, d.recs.find((r) => r.asignacion_id === a.id && r.periodo_id === pr.id && r.estudiante_id === est)?.nota).valor;
    };
    const asigs = [...d.asigs].sort((x, z) => (b.materiaPorId.get(x.materia_id)?.nombre || '').localeCompare(b.materiaPorId.get(z.materia_id)?.nombre || ''));

    if (tab === 'sabana') {
      const final = p.periodo === 'final';
      const valor = (a, est) => (final ? notaFinal(b.periodos, Object.fromEntries(b.periodos.map((pr) => [pr.id, notaDe(a, pr, est)]))) : notaDe(a, per, est));
      const filas = d.ests.map((est) => {
        const vs = asigs.map((a) => valor(a, est));
        const con = vs.filter((v) => v != null);
        return { est, vs, prom: con.length ? con.reduce((s, v) => s + v, 0) / con.length : null, bajas: vs.filter((v) => v != null && desempeno(v, E.colegio).clase === 'bajo').length };
      }).sort((x, z) => (z.prom ?? -1) - (x.prom ?? -1));
      const r2 = (v) => (v == null ? null : redondear(v, E.colegio.decimales ?? 1));
      filas.forEach((f) => (f.puesto = f.prom == null ? '—' : 1 + filas.filter((o) => o.prom != null && r2(o.prom) > r2(f.prom)).length));
      const promMat = asigs.map((a, j) => { const v = filas.map((f) => f.vs[j]).filter((x) => x != null); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; });
      const titulo = `Sábana ${curso.nombre} · ${final ? 'Acumulado' : per?.nombre || ''}`;
      html = `<div class="tabla-envoltura planilla"><table class="tabla tabla-notas tabla-sabana">
        <thead><tr><th>#</th><th>Estudiante</th>${asigs.map((a) => `<th title="${esc(nombre(E.perfiles.get(a.profesor_id)))}">${esc((b.materiaPorId.get(a.materia_id)?.nombre || '').slice(0, 14))}</th>`).join('')}<th>Prom.</th><th>Bajas</th></tr></thead>
        <tbody>${filas.map((f) => `<tr><td>${f.puesto}</td><th scope="row"><a href="#/estudiante/${f.est}">${esc(nombreLista(E.perfiles.get(f.est)))}</a></th>${f.vs.map((v) => `<td><span class="nota-${desempeno(v, E.colegio).clase}">${mostrarNota(v, E.colegio)}</span></td>`).join('')}<td><b>${mostrarNota(f.prom, E.colegio)}</b></td><td class="${f.bajas ? 'alerta' : ''}">${f.bajas || ''}</td></tr>`).join('')}</tbody>
        <tfoot><tr><td></td><th>Promedio del curso</th>${promMat.map((v) => `<td>${mostrarNota(v, E.colegio)}</td>`).join('')}<td></td><td></td></tr></tfoot>
      </table></div>
      <p class="ayuda">Ordenado por promedio (puesto). En rojo las materias en desempeño bajo. Toca un estudiante para ver su detalle.</p>`;
      exportar = () => csv(titulo, [['Puesto', 'Estudiante', 'Documento', ...asigs.map((a) => b.materiaPorId.get(a.materia_id)?.nombre), 'Promedio', 'Materias en bajo'],
        ...filas.map((f) => [f.puesto, nombreLista(E.perfiles.get(f.est)), E.perfiles.get(f.est)?.numero_documento || '', ...f.vs.map((v) => (v == null ? '' : redondear(v, E.colegio.decimales))), f.prom == null ? '' : redondear(f.prom, E.colegio.decimales), f.bajas])]);
    }

    if (tab === 'cumplimiento') {
      // Por materia del curso: actividades creadas en el periodo y % de notas cargadas
      const filas = asigs.map((a) => {
        const acts = per ? d.acts.filter((x) => x.asignacion_id === a.id && x.periodo_id === per.id) : [];
        const esperadas = acts.length * d.ests.length;
        const cargadas = acts.reduce((s, x) => s + d.ests.filter((e) => nota.get(x.id + '|' + e) != null).length, 0);
        const pct = acts.reduce((s, x) => s + (Number(x.porcentaje) || 0), 0);
        const inds = per ? d.inds.filter((x) => x.asignacion_id === a.id && x.periodo_id === per.id).length : 0;
        return { a, acts: acts.length, inds, avance: esperadas ? Math.round((cargadas * 100) / esperadas) : 0, pct };
      });
      html = `<div class="tabla-envoltura"><table class="tabla"><thead><tr><th>Materia</th><th>Profesor</th><th>Indicadores</th><th>Actividades</th><th>% de actividades</th><th>Notas cargadas</th></tr></thead>
        <tbody>${filas.map((f) => `<tr><th scope="row"><a href="#/notas/${f.a.id}">${esc(b.materiaPorId.get(f.a.materia_id)?.nombre)}</a></th><td>${esc(f.a.profesor_id ? nombre(E.perfiles.get(f.a.profesor_id)) : 'Sin profesor')}</td><td>${f.inds}</td><td>${f.acts}</td><td class="${f.pct === 100 || f.inds ? '' : 'alerta'}">${f.inds ? '—' : f.pct + '%'}</td>
          <td><div class="barra-avance"><span style="width:${f.avance}%" class="${f.avance < 60 ? 'baja' : ''}"></span></div><small>${f.avance}%</small></td></tr>`).join('')}</tbody></table></div>
        <p class="ayuda">"Notas cargadas" = celdas de la planilla con nota sobre el total esperado (actividades × estudiantes) en ${esc(per?.nombre || 'el periodo')}.</p>`;
      exportar = () => csv(`Cumplimiento ${curso.nombre} ${per?.nombre || ''}`, [['Materia', 'Profesor', 'Indicadores', 'Actividades', '% actividades', '% notas cargadas'], ...filas.map((f) => [b.materiaPorId.get(f.a.materia_id)?.nombre, f.a.profesor_id ? nombre(E.perfiles.get(f.a.profesor_id)) : '', f.inds, f.acts, f.pct, f.avance])]);
    }
  }

  if (tab === 'asistencia') {
    const mats = (await E.db.select('matriculas', { eq: { curso_id: cursoId } })).filter((x) => x.estado === 'activa');
    await perfiles([...mats.map((x) => x.estudiante_id), ...b.asignaciones.filter((a) => a.curso_id === cursoId).map((a) => a.profesor_id).filter(Boolean)]);
    const asigs = b.asignaciones.filter((a) => a.curso_id === cursoId).map((a) => a.id);
    const filasA = (asigs.length ? await E.db.select('asistencia', { in: { asignacion_id: asigs } }) : []).filter((f) => enRango(f.fecha, desde, hasta));
    const porEst = mats.map((mt) => {
      const l = filasA.filter((f) => f.estudiante_id === mt.estudiante_id);
      const c = { presente: 0, ausente: 0, tarde: 0, excusa: 0 };
      l.forEach((f) => c[f.estado]++);
      return { est: mt.estudiante_id, ...c, total: l.length };
    }).sort((x, z) => z.ausente - x.ausente);
    html = `<div class="tabla-envoltura"><table class="tabla"><thead><tr><th>Estudiante</th><th>Registros</th><th>Fallas</th><th>Excusas</th><th>Tarde</th><th>% asistencia</th></tr></thead>
      <tbody>${porEst.map((f) => `<tr class="${f.ausente >= 3 ? 'vencido' : ''}"><th scope="row"><a href="#/estudiante/${f.est}?tab=asistencia">${esc(nombreLista(E.perfiles.get(f.est)))}</a></th><td>${f.total}</td><td>${f.ausente}</td><td>${f.excusa}</td><td>${f.tarde}</td><td>${f.total ? Math.round(((f.presente + f.tarde) * 100) / f.total) + '%' : '—'}</td></tr>`).join('')}</tbody></table></div>
      <p class="ayuda">${esc(textoRango)}. En rojo, estudiantes con 3 o más fallas sin excusa (alerta temprana).</p>
      <h3 class="sub">Fallas por materia</h3>
      <div class="tabla-envoltura"><table class="tabla"><thead><tr><th>Materia</th><th>Profesor</th><th>Clases con asistencia</th><th>Fallas</th><th>Tarde</th><th>Excusas</th></tr></thead>
      <tbody>${b.asignaciones.filter((a) => a.curso_id === cursoId).map((a) => {
        const l = filasA.filter((f) => f.asignacion_id === a.id);
        return `<tr><th scope="row">${esc(b.materiaPorId.get(a.materia_id)?.nombre || '')}</th><td>${esc(a.profesor_id ? nombre(E.perfiles.get(a.profesor_id)) : '—')}</td><td>${new Set(l.map((f) => f.fecha)).size}</td><td>${l.filter((f) => f.estado === 'ausente').length}</td><td>${l.filter((f) => f.estado === 'tarde').length}</td><td>${l.filter((f) => f.estado === 'excusa').length}</td></tr>`;
      }).join('')}</tbody></table></div>`;
    exportar = () => csv(`Asistencia ${curso.nombre} ${textoRango}`, [['Estudiante', 'Registros', 'Fallas', 'Excusas', 'Tarde', '% asistencia'], ...porEst.map((f) => [nombreLista(E.perfiles.get(f.est)), f.total, f.ausente, f.excusa, f.tarde, f.total ? Math.round(((f.presente + f.tarde) * 100) / f.total) : ''])]);
  }

  if (tab === 'convivencia') {
    const mats = (await E.db.select('matriculas', { eq: { curso_id: cursoId } })).filter((x) => x.estado === 'activa');
    const ests = mats.map((x) => x.estudiante_id);
    const [obs, comps, regs, segs] = ests.length ? await Promise.all([
      E.db.select('observaciones', { in: { estudiante_id: ests } }).catch(() => []),
      E.db.select('compromisos', { in: { estudiante_id: ests } }).catch(() => []),
      E.db.select('seguimiento_registros', { in: { estudiante_id: ests } }).catch(() => []),
      E.db.select('seguimientos', { eq: { colegio_id: E.colegio.id } }).catch(() => []),
    ]) : [[], [], [], []];
    await perfiles(ests);
    const hoyS = new Date().toISOString().slice(0, 10);
    const o2 = obs.filter((o) => enRango(o.fecha, desde, hasta));
    const c2 = comps.filter((c) => enRango(c.fecha, desde, hasta));
    const r2 = regs.filter((r) => enRango(String(r.creado_en).slice(0, 10), desde, hasta));
    const nomSeg = new Map(segs.map((s) => [s.id, s.nombre]));
    const filas = ests.map((est) => {
      const o = o2.filter((x) => x.estudiante_id === est), c = c2.filter((x) => x.estudiante_id === est);
      return {
        est, llamados: o.filter((x) => x.tipo === 'negativa').length, positivas: o.filter((x) => x.tipo === 'positiva').length,
        casos: o.filter((x) => x.categoria === 'Caso preocupante').length,
        compPend: c.filter((x) => x.estado === 'pendiente').length, compVenc: c.filter((x) => x.estado === 'pendiente' && x.fecha_limite && x.fecha_limite < hoyS).length,
        compOk: c.filter((x) => x.estado === 'cumplido').length, compNo: c.filter((x) => x.estado === 'no_cumplido').length,
        registros: r2.filter((x) => x.estudiante_id === est).length,
      };
    }).sort((x, z) => (z.llamados + z.casos * 2 + z.compVenc) - (x.llamados + x.casos * 2 + x.compVenc) || nombreLista(E.perfiles.get(x.est)).localeCompare(nombreLista(E.perfiles.get(z.est))));
    const alerta = (f) => f.llamados >= 3 || f.casos > 0 || f.compVenc > 0 || f.compNo > 0;
    const porSeg = [...r2.reduce((mm, r) => mm.set(r.seguimiento_id, (mm.get(r.seguimiento_id) || 0) + 1), new Map())];
    const tot = (k) => filas.reduce((s, f) => s + f[k], 0);
    html = `<div class="cifras pequenas">
        <span class="cifra"><b class="${tot('llamados') ? 'alerta' : ''}">${tot('llamados')}</b><span>Llamados de atención</span></span>
        <span class="cifra"><b>${tot('positivas')}</b><span>Anotaciones positivas</span></span>
        <span class="cifra"><b class="${tot('casos') ? 'alerta' : ''}">${tot('casos')}</b><span>Casos preocupantes</span></span>
        <span class="cifra"><b class="${tot('compVenc') ? 'alerta' : ''}">${tot('compPend')}</b><span>Compromisos pendientes (${tot('compVenc')} vencidos)</span></span>
      </div>
      <div class="tabla-envoltura"><table class="tabla"><thead><tr><th>Estudiante</th><th>Llamados de atención</th><th>Positivas</th><th>Casos preocupantes</th><th>Compromisos pendientes</th><th>Vencidos</th><th>Cumplidos</th><th>No cumplidos</th><th>Registros de seguimiento</th></tr></thead>
      <tbody>${filas.map((f) => `<tr class="${alerta(f) ? 'vencido' : ''}"><th scope="row"><a href="#/estudiante/${f.est}?tab=observador">${esc(nombreLista(E.perfiles.get(f.est)))}</a></th><td>${f.llamados}</td><td>${f.positivas}</td><td>${f.casos}</td><td><a href="#/estudiante/${f.est}?tab=compromisos">${f.compPend}</a></td><td>${f.compVenc}</td><td>${f.compOk}</td><td>${f.compNo}</td><td>${f.registros}</td></tr>`).join('')}</tbody></table></div>
      <p class="ayuda">${esc(textoRango)}. En rojo, quien tiene 3 o más llamados de atención, un caso preocupante o un compromiso vencido o no cumplido. Solo cuenta lo que tu perfil puede ver.</p>
      ${porSeg.length ? `<h3 class="sub">Registros por formulario de seguimiento</h3><div class="lista">${porSeg.map(([id, n]) => `<div class="fila"><span class="crece"><b>${esc(nomSeg.get(id) || 'Formulario')}</b></span><b>${n}</b></div>`).join('')}</div>` : ''}`;
    exportar = () => csv(`Convivencia ${curso.nombre} ${textoRango}`, [['Estudiante', 'Documento', 'Llamados de atención', 'Positivas', 'Casos preocupantes', 'Compromisos pendientes', 'Vencidos', 'Cumplidos', 'No cumplidos', 'Registros de seguimiento'],
      ...filas.map((f) => [nombreLista(E.perfiles.get(f.est)), E.perfiles.get(f.est)?.numero_documento || '', f.llamados, f.positivas, f.casos, f.compPend, f.compVenc, f.compOk, f.compNo, f.registros])]);
  }

  if (tab === 'estudiantes') {
    const mats = (await E.db.select('matriculas', { eq: { curso_id: cursoId } })).filter((x) => x.estado === 'activa');
    const acus = await E.db.select('acudientes', { eq: { colegio_id: E.colegio.id } });
    await perfiles([...mats.map((x) => x.estudiante_id), ...acus.map((a) => a.acudiente_id)]);
    const filas = mats.map((mt) => ({ e: E.perfiles.get(mt.estudiante_id), acs: acus.filter((a) => a.estudiante_id === mt.estudiante_id).map((a) => ({ ...a, p: E.perfiles.get(a.acudiente_id) })) }))
      .sort((x, z) => nombreLista(x.e).localeCompare(nombreLista(z.e)));
    html = `<div class="tabla-envoltura"><table class="tabla"><thead><tr><th>#</th><th>Estudiante</th><th>Documento</th><th>Acudientes</th><th>Teléfonos</th></tr></thead>
      <tbody>${filas.map((f, i) => `<tr><td>${i + 1}</td><th scope="row"><a href="#/estudiante/${f.e?.id}">${esc(nombreLista(f.e))}</a></th><td>${esc([f.e?.tipo_documento, f.e?.numero_documento].filter(Boolean).join(' '))}</td>
        <td>${f.acs.map((a) => `${esc(nombre(a.p))}${a.parentesco ? ' (' + esc(a.parentesco) + ')' : ''}${a.responsable_pagos ? ' 💲' : ''}`).join('<br>') || '<span class="alerta">Sin acudiente</span>'}</td>
        <td>${f.acs.map((a) => esc(a.p?.telefono || '—')).join('<br>')}</td></tr>`).join('')}</tbody></table></div>
      <p class="ayuda">💲 = responsable de pagos.</p>`;
    exportar = () => csv(`Estudiantes ${curso.nombre}`, [['#', 'Estudiante', 'Tipo doc.', 'Documento', 'Acudiente', 'Parentesco', 'Teléfono', 'Responsable de pagos'],
      ...filas.flatMap((f, i) => (f.acs.length ? f.acs : [null]).map((a) => [i + 1, nombreLista(f.e), f.e?.tipo_documento || '', f.e?.numero_documento || '', a ? nombre(a.p) : '', a?.parentesco || '', a?.p?.telefono || '', a?.responsable_pagos ? 'Sí' : '']))]);
  }

  m.innerHTML = cabecera('Reportes', { acciones: exportar ? '<button class="btn" data-exportar>⬇ Exportar (Excel)</button><button class="btn" data-imprimir>🖨</button>' : '' }) +
    pestanas(tabs, tab, `#/reportes?curso=${cursoId}&tab=`) + `
    <div class="tarjeta-cab no-imprimir">${selCurso}${tab === 'sabana' || tab === 'cumplimiento' ? selPer : ['asistencia', 'convivencia'].includes(tab) && b.periodos.length ? `<label class="en-linea">Periodo <select data-periodo><option value="final">Todo el año</option>${b.periodos.map((x) => `<option value="${x.id}" ${perR?.id === x.id ? 'selected' : ''}>${esc(x.nombre)}</option>`).join('')}</select></label>` : ''}</div>
    <div class="contenido">${html}</div>`;
  m.querySelector('[data-curso]').onchange = (e) => { location.hash = `#/reportes?tab=${tab}&curso=${e.target.value}${p.periodo ? '&periodo=' + p.periodo : ''}`; };
  m.querySelector('[data-periodo]')?.addEventListener('change', (e) => { location.hash = `#/reportes?tab=${tab}&curso=${cursoId}&periodo=${e.target.value}`; });
  m.querySelector('[data-exportar]')?.addEventListener('click', exportar);
}
