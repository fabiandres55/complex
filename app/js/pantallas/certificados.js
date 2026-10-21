// Certificados (REA Phidias §3.5): constancia de estudio, certificado de notas y paz y salvo,
// listos para imprimir o guardar como PDF. Los emite el administrador / secretaría.
import { E, base, perfiles, logoHTML } from '../estado.js';
import { esc, nombre, nombreLista, vacio, fecha, hoy } from '../ui.js';
import { notaConIndicadores, definitiva, notaFinal, mostrarNota, desempeno } from '../calculos.js';
import { estadoCobro, dinero } from './tesoreria.js';

export const TIPOS_CERT = { estudio: 'Constancia de estudio', notas: 'Certificado de notas', paz: 'Paz y salvo' };
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const fechaLarga = (d = new Date()) => `${d.getDate()} días del mes de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
// Código de verificación corto (se puede validar con la secretaría)
const codigo = (tipo, est) => { let h = 0; for (const ch of tipo + est + hoy()) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return 'CX-' + h.toString(36).toUpperCase().padStart(7, '0'); };

export async function certificado(m, p) {
  if (E.rol !== 'admin') { m.innerHTML = vacio('Los certificados los expide la secretaría del colegio.'); return; }
  const b = await base();
  await perfiles([p.est]);
  const est = E.perfiles.get(p.est);
  const mats = await E.db.select('matriculas', { eq: { estudiante_id: p.est } });
  const mat = mats.find((x) => x.estado === 'activa' && b.cursos.some((c) => c.id === x.curso_id)) || mats.find((x) => b.cursos.some((c) => c.id === x.curso_id));
  const curso = mat && b.cursoPorId.get(mat.curso_id);
  const grado = curso && b.gradoPorId.get(curso.grado_id);
  const doc = [est?.tipo_documento, est?.numero_documento].filter(Boolean).join(' No. ') || 'sin documento registrado';
  const encabezado = `<header class="boletin-cab"><div>${logoHTML('logo')}</div><div><h2>${esc(E.colegio.nombre)}</h2><p>${esc([E.colegio.nit ? 'NIT ' + E.colegio.nit : '', E.colegio.ciudad].filter(Boolean).join(' · '))}</p></div></header>`;
  const pie = `<div class="firmas"><div><span></span>Rector(a)</div><div><span></span>Secretaría académica</div></div>
    <p class="escala">Código de verificación: <b>${codigo(p.tipo, p.est)}</b> · Expedido el ${fecha(hoy())}.</p>`;
  let cuerpo = '';

  if (p.tipo === 'estudio') {
    cuerpo = `<h3 class="cert-titulo">LA RECTORÍA Y LA SECRETARÍA ACADÉMICA<br>HACEN CONSTAR</h3>
      <p class="cert-texto">Que <b>${esc(nombreLista(est).toUpperCase())}</b>, identificado(a) con ${esc(doc)}, ${mat?.estado === 'activa' ? 'se encuentra matriculado(a)' : 'estuvo matriculado(a)'} en esta institución en el grado <b>${esc(grado?.nombre || '—')}</b>, curso <b>${esc(curso?.nombre || '—')}</b>, durante el año lectivo <b>${b.anio?.anio || new Date().getFullYear()}</b>${mat?.fecha ? `, con fecha de matrícula ${fecha(mat.fecha)}` : ''}.</p>
      <p class="cert-texto">La presente se expide a solicitud del interesado, a los ${fechaLarga()}.</p>`;
  }

  if (p.tipo === 'notas') {
    const asigs = curso ? b.asignaciones.filter((a) => a.curso_id === curso.id) : [];
    const ids = asigs.map((a) => a.id);
    const [acts, inds, cal, recs] = await Promise.all([
      ids.length ? E.db.select('actividades', { in: { asignacion_id: ids } }) : [],
      ids.length ? E.db.select('indicadores', { in: { asignacion_id: ids } }) : [],
      E.db.select('calificaciones', { eq: { estudiante_id: p.est } }),
      E.db.select('recuperaciones', { eq: { estudiante_id: p.est } }),
    ]);
    const nota = Object.fromEntries(cal.map((c) => [c.actividad_id, c.valor]));
    const filas = asigs.map((a) => {
      const pp = {};
      for (const per of b.periodos) {
        const base0 = notaConIndicadores(inds.filter((x) => x.asignacion_id === a.id && x.periodo_id === per.id), acts.filter((x) => x.asignacion_id === a.id && x.periodo_id === per.id), nota);
        pp[per.id] = definitiva(base0, recs.find((r) => r.asignacion_id === a.id && r.periodo_id === per.id)?.nota).valor;
      }
      return { a, materia: b.materiaPorId.get(a.materia_id), pp, final: notaFinal(b.periodos, pp) };
    }).sort((x, z) => (x.materia?.nombre || '').localeCompare(z.materia?.nombre || ''));
    cuerpo = `<h3 class="cert-titulo">CERTIFICADO DE CALIFICACIONES</h3>
      <p class="cert-texto">La rectoría y la secretaría académica certifican que <b>${esc(nombreLista(est).toUpperCase())}</b>, identificado(a) con ${esc(doc)}, cursó en el año lectivo <b>${b.anio?.anio || ''}</b> el grado <b>${esc(grado?.nombre || '—')}</b> (curso ${esc(curso?.nombre || '—')}) con las siguientes valoraciones:</p>
      <table class="tabla tabla-boletin"><thead><tr><th>Área / Materia</th><th>IH</th>${b.periodos.map((x) => `<th>${esc(x.nombre.replace('Periodo', 'P'))}</th>`).join('')}<th>Final</th><th>Desempeño</th></tr></thead>
        <tbody>${filas.map((f) => `<tr><th scope="row">${esc(f.materia?.nombre)}<small>${esc(f.materia?.area || '')}</small></th><td>${f.a.intensidad_horaria ?? ''}</td>${b.periodos.map((x) => `<td>${mostrarNota(f.pp[x.id], E.colegio)}</td>`).join('')}<td><b>${mostrarNota(f.final, E.colegio)}</b></td><td>${desempeno(f.final, E.colegio).nombre}</td></tr>`).join('')}</tbody></table>
      <p class="escala">Escala: ${E.colegio.nota_min} a ${E.colegio.nota_max}; aprueba con ${E.colegio.nota_aprobacion}. Desempeños según el Decreto 1290 de 2009. Las notas de periodos sin cerrar son parciales.</p>
      <p class="cert-texto">Se expide a los ${fechaLarga()}.</p>`;
  }

  if (p.tipo === 'paz') {
    const [cobros, pagos] = await Promise.all([E.db.select('cobros', { eq: { colegio_id: E.colegio.id, estudiante_id: p.est } }), E.db.select('pagos', { eq: { colegio_id: E.colegio.id, estudiante_id: p.est } })]);
    // Paz y salvo "a la fecha": cuentan las obligaciones ya vencidas
    const pend = cobros.filter((c) => !c.anulado).map((c) => ({ c, e: estadoCobro(c, pagos, E.colegio) })).filter((x) => x.e.vencido);
    const deuda = pend.reduce((s, x) => s + x.e.total, 0);
    cuerpo = deuda > 0 ? `<h3 class="cert-titulo">NO SE PUEDE EXPEDIR PAZ Y SALVO</h3>
        <p class="cert-texto">${esc(nombreLista(est))} tiene obligaciones pendientes por <b>${dinero(deuda)}</b>:</p>
        <ul>${pend.map(({ c, e }) => `<li>${esc(c.descripcion)} (#${c.numero}) — ${dinero(e.total)}</li>`).join('')}</ul>`
      : `<h3 class="cert-titulo">PAZ Y SALVO</h3>
        <p class="cert-texto">La tesorería de ${esc(E.colegio.nombre)} certifica que <b>${esc(nombreLista(est).toUpperCase())}</b>, identificado(a) con ${esc(doc)}, del grado ${esc(grado?.nombre || '—')}, <b>se encuentra a paz y salvo</b> por todo concepto con la institución a la fecha.</p>
        <p class="cert-texto">Se expide a los ${fechaLarga()}.</p>`;
  }

  if (!cuerpo) { m.innerHTML = vacio('Tipo de certificado desconocido.'); return; }
  m.innerHTML = `
    <div class="no-imprimir cabecera"><a class="btn-icono" href="#/estudiante/${esc(p.est)}" aria-label="Volver">←</a><h1 class="titulo">${TIPOS_CERT[p.tipo]}</h1>
      <div class="acciones"><button class="btn btn-primario" onclick="window.print()">🖨 Imprimir / PDF</button></div></div>
    <article class="boletin certificado">${encabezado}${cuerpo}${pie}</article>`;
}
