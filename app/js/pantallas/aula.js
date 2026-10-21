// Academia > Aula (REA Phidias §3.3): tarjetas de materias con contadores de tareas,
// página de la materia con pestañas (Tablero · Notas · Tareas) y tareas con entrega en línea.
import { E, base, perfiles, misAsignaciones, personaActiva } from '../estado.js';
import { esc, aviso, ventana, leerForm, confirmar, nombre, nombreLista, iniciales, vacio, fecha, fechaHora, hoy } from '../ui.js';
import { cabecera, pestanas, camposHTML } from './comun.js';
import * as examenes from './examenes.js';
import { notaConIndicadores, notaIndicador, definitiva, mostrarNota, desempeno } from '../calculos.js';

const BUCKET = 'entregas';
const nombreSeguro = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.\-]+/g, '_').slice(-120);
const peso = (n) => (n == null ? '' : n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
const COLORES = ['#3f6ea5', '#2f8f6a', '#9a5b2e', '#7a4fa3', '#b0414f', '#2f7f8f', '#6b7a2c', '#a3477f'];
const color = (id) => COLORES[[...String(id)].reduce((s, c) => s + c.charCodeAt(0), 0) % COLORES.length];
const esProfe = () => E.rol === 'profesor' || E.rol === 'admin';
const vencida = (t) => t.entrega_en && new Date(t.entrega_en) < new Date();

// Asignaciones que ve la persona activa
async function asignacionesVisibles(b) {
  if (E.rol === 'profesor') return misAsignaciones(b);
  const est = personaActiva();
  if (!est) return [];
  const mats = (await E.db.select('matriculas', { eq: { estudiante_id: est } })).filter((x) => x.estado === 'activa');
  const cursos = new Set(mats.map((x) => x.curso_id).filter((id) => b.cursos.some((c) => c.id === id)));
  return b.asignaciones.filter((a) => cursos.has(a.curso_id));
}

const etiqueta = (b, a) => `${b.materiaPorId.get(a.materia_id)?.nombre || 'Materia'}${E.rol === 'profesor' ? ' · ' + (b.cursoPorId.get(a.curso_id)?.nombre || '') : ''}`;

// ---------------------------------------------------------------- Aula: tarjetas
export async function aula(m) {
  const b = await base();
  const asigs = await asignacionesVisibles(b);
  const tareas = asigs.length ? await E.db.select('tareas', { in: { asignacion_id: asigs.map((a) => a.id) } }) : [];
  const est = personaActiva();
  const entregas = est && tareas.length ? await E.db.select('tarea_entregas', { eq: { estudiante_id: est } }) : [];
  const entregada = new Set(entregas.map((x) => x.tarea_id));
  await perfiles(asigs.map((a) => a.profesor_id));
  const exs = asigs.length ? (await E.db.select('examenes', { in: { asignacion_id: asigs.map((a) => a.id) } })).filter((x) => x.publicado && new Date(x.abre) <= new Date() && (!x.cierra || new Date(x.cierra) > new Date())) : [];
  const intentos = est && exs.length ? await E.db.select('examen_intentos', { eq: { estudiante_id: est } }) : [];
  const nEx = (a) => exs.filter((x) => x.asignacion_id === a.id && !intentos.some((i) => i.examen_id === x.id && i.entregado_en)).length;
  const pendientes = (a) => tareas.filter((t) => t.asignacion_id === a.id && t.requiere_entrega && (esProfe() ? !vencida(t) : !entregada.has(t.id))).length;
  asigs.sort((x, y) => etiqueta(b, x).localeCompare(etiqueta(b, y)));
  m.innerHTML = cabecera('Aula') + `
    <p class="sub-titulo">${b.anio ? 'Año ' + b.anio.anio : ''}${E.rol !== 'profesor' && est ? ' · ' + esc(nombre(E.perfiles.get(est))) : ''}</p>
    ${asigs.length ? `<div class="aula">${asigs.map((a) => {
      const prof = E.perfiles.get(a.profesor_id);
      const n = pendientes(a);
      return `
        <a class="materia" href="#/aula/${a.id}">
          <div class="materia-cab" style="background:${color(a.materia_id)}"><b>${esc(etiqueta(b, a))}</b></div>
          <div class="materia-cuerpo">
            <span class="avatar" style="background:${color(a.profesor_id || 'x')}22;color:${color(a.profesor_id || 'x')}">${esc(iniciales(prof))}</span>
            <span><b>${esc(prof ? nombre(prof) : 'Sin profesor')}</b></span>
          </div>
          <div class="materia-pie"><span>📝 Tareas <b class="${n ? 'alerta' : ''}">${n}</b></span><span>🧪 Exámenes <b class="${nEx(a) ? 'alerta' : ''}">${nEx(a)}</b></span>${E.rol === 'profesor' ? `<span>${esc(b.cursoPorId.get(a.curso_id)?.nombre || '')}</span>` : ''}</div>
        </a>`;
    }).join('')}</div>` : vacio(E.rol === 'profesor' ? 'Aún no tienes clases asignadas.' : 'No hay materias para mostrar.')}`;
}

// ---------------------------------------------------------------- Materia
const TABS = [['tablero', 'Tablero'], ['notas', 'Notas'], ['tareas', 'Tareas'], ['examenes', 'Exámenes']];

export async function materia(m, p) {
  const b = await base();
  const a = b.asignacionPorId.get(p.asig);
  if (!a) { m.innerHTML = vacio('Esa materia no existe.'); return; }
  const tab = TABS.some((t) => t[0] === p.tab) ? p.tab : 'tablero';
  const per = b.periodos.find((x) => x.id === p.periodo) || b.periodos.find((x) => !x.cerrado) || b.periodos.at(-1);
  const est = esProfe() ? null : personaActiva();
  await perfiles([a.profesor_id]);
  const tareas = (await E.db.select('tareas', { eq: { asignacion_id: a.id }, order: 'publicada_en desc' })).filter((t) => esProfe() || new Date(t.publicada_en) <= new Date());
  const entregas = tareas.length ? await E.db.select('tarea_entregas', { in: { tarea_id: tareas.map((t) => t.id) } }) : [];
  const mia = (t) => entregas.find((x) => x.tarea_id === t.id && x.estudiante_id === est);
  let html = '';

  if (tab === 'tablero') {
    const proximas = tareas.filter((t) => t.entrega_en && !vencida(t)).sort((x, y) => (x.entrega_en > y.entrega_en ? 1 : -1)).slice(0, 5);
    let notaHtml = '';
    if (est && per) {
      const { v, recuperada } = await notaDe(a, per, est);
      const d = desempeno(v, E.colegio);
      notaHtml = `<div class="cifra"><b class="nota-${d.clase}">${mostrarNota(v, E.colegio)}${recuperada ? '<sup>✱</sup>' : ''}</b><span>${esc(per.nombre)} · ${d.nombre}</span></div>`;
    }
    html = `
      <div class="cifras">
        ${notaHtml}
        <div class="cifra"><b>${tareas.filter((t) => t.requiere_entrega && (est ? !mia(t) : !vencida(t))).length}</b><span>${est ? 'Tareas por entregar' : 'Tareas abiertas'}</span></div>
        <div class="cifra"><b>${tareas.length}</b><span>Tareas publicadas</span></div>
      </div>
      <section class="tarjeta"><h2>Próximas entregas</h2>
        ${proximas.length ? `<div class="lista">${proximas.map((t) => filaTarea(t, est && mia(t))).join('')}</div>` : '<p class="ayuda">No hay entregas próximas.</p>'}
      </section>
      ${esProfe() ? `<section class="tarjeta"><h2>Accesos</h2><div class="rejilla">
        <a class="mini" href="#/notas/${a.id}"><b>📝 Planilla de notas</b></a>
        <a class="mini" href="#/asistencia/${a.id}"><b>✅ Asistencia</b></a>
        <a class="mini" href="#/planeaciones?asig=${a.id}"><b>📂 Planeaciones</b></a>
      </div></section>` : ''}
      ${await htmlMuro(a)}`;
  }

  if (tab === 'notas') {
    if (esProfe()) html = `<p><a class="btn btn-primario" href="#/notas/${a.id}">Abrir la planilla de notas</a></p>`;
    else if (!per) html = vacio('El colegio aún no tiene periodos.');
    else {
      const { v, recuperada, acts, inds, nota, ments } = await notaDe(a, per, est);
      const filaAct = (x, i) => `<div class="fila"><span class="num">${i + 1}</span><span class="crece"><b>${esc(x.nombre)}</b><small>${Number(x.porcentaje)}%${x.fecha ? ' · ' + fecha(x.fecha) : ''}</small></span><b class="nota-${desempeno(nota[x.id], E.colegio).clase}">${mostrarNota(nota[x.id], E.colegio)}</b></div>`;
      // Como Phidias: indicadores numerados (descripción, dimensión, nota; en rojo si está en bajo) con sus evaluaciones
      const lista = inds.length ? `<div class="lista">${inds.map((ind) => {
        const vi = notaIndicador(ind, acts, nota);
        const suyas = acts.filter((x) => x.indicador_id === ind.id);
        return `<details class="indicador"><summary><span class="num">${ind.numero}</span><span class="crece"><b>${esc(ind.descripcion)}</b><small>${esc(ind.dimension)}</small></span><b class="nota-${desempeno(vi, E.colegio).clase}">${mostrarNota(vi, E.colegio)}</b></summary>
          ${suyas.length ? `<div class="lista">${suyas.map(filaAct).join('')}</div>` : '<p class="ayuda">Sin evaluaciones.</p>'}</details>`;
      }).join('')}</div>` : `<div class="lista">${acts.map(filaAct).join('')}</div>`;
      html = `
        <div class="segmentos">${b.periodos.map((x) => `<a href="#/aula/${a.id}?tab=notas&periodo=${x.id}" class="${x.id === per.id ? 'activo' : ''}">${esc(x.nombre)}</a>`).join('')}</div>
        ${acts.length ? `${lista}
          ${ments.length ? `<p class="menciones"><b>Menciones:</b><br>${ments.map((x) => `🏅 ${esc(x.tipo)}${x.descripcion ? ': ' + esc(x.descripcion) : ''} <small>(${fecha(x.fecha)} · ${esc(nombre(E.perfiles.get(x.autor_id)))})</small>`).join('<br>')}</p>` : ''}
          <div class="tarjeta-cab total-periodo"><b>${esc(per.nombre)}</b><b class="nota-${desempeno(v, E.colegio).clase}">${mostrarNota(v, E.colegio)}${recuperada ? '✱' : ''} · ${desempeno(v, E.colegio).nombre}</b></div>
          ${recuperada ? '<p class="ayuda">✱ Definitiva con recuperación</p>' : ''}`
        : vacio('Aún no hay notas en este periodo.')}`;
    }
  }

  if (tab === 'examenes') html = await examenes.htmlLista(a);

  if (tab === 'tareas') {
    html = `
      ${E.rol === 'profesor' && a.profesor_id === E.yo.id || E.rol === 'admin' ? '<p><button class="btn btn-primario" data-nueva-tarea>＋ Nueva tarea</button></p>' : ''}
      ${tareas.length ? `<div class="tabla-envoltura"><table class="tabla tabla-tareas">
        <thead><tr><th>Tarea</th><th>Publicada</th><th>Para entregar</th><th>Estado</th></tr></thead>
        <tbody>${tareas.map((t) => {
          const e = est && mia(t);
          const nEnt = entregas.filter((x) => x.tarea_id === t.id).length;
          const estado = esProfe() ? `${nEnt} entrega(s)` : !t.requiere_entrega ? 'Sin entrega' : e ? (e.revisada_en ? `✅ Calificada${e.nota != null ? ' · ' + mostrarNota(e.nota, E.colegio) : ''}` : '📤 Entregada') : vencida(t) ? '<span class="alerta">⚠️ Vencida</span>' : '🆕 Pendiente';
          return `<tr><th scope="row"><a href="#/tarea/${t.id}">✏️ ${esc(t.titulo)}</a></th><td>${fecha(t.publicada_en)}</td><td>${t.requiere_entrega && t.entrega_en ? fechaHora(t.entrega_en) : 'No requiere entrega'}</td><td>${estado}</td></tr>`;
        }).join('')}</tbody></table></div>` : vacio('No hay tareas publicadas.')}`;
  }

  m.innerHTML = `
    <div class="banner-materia" style="background:${color(a.materia_id)}">
      <a class="btn-icono" href="#/aula" aria-label="Volver">←</a>
      <div><h1>${esc(b.materiaPorId.get(a.materia_id)?.nombre || '')}</h1><p>${esc(b.cursoPorId.get(a.curso_id)?.nombre || '')} · ${esc(nombre(E.perfiles.get(a.profesor_id)))}</p></div>
    </div>` + pestanas(TABS, tab, `#/aula/${a.id}?tab=`) + `<div class="contenido">${html}</div>`;

  if (tab === 'examenes') examenes.conectarLista(m, a, b, () => materia(m, { ...p, tab: 'examenes' }));
  if (tab === 'tablero') conectarMuro(m, a, () => materia(m, { ...p, tab: 'tablero' }));
  m.querySelector('[data-nueva-tarea]')?.addEventListener('click', async () => { if (await editarTarea(b, a, null)) materia(m, { ...p, tab: 'tareas' }); });
}

// Nota de un estudiante en una materia y periodo (con indicadores y recuperación)
async function notaDe(a, per, est) {
  const [acts, inds, cal, recs, ments] = await Promise.all([
    E.db.select('actividades', { eq: { asignacion_id: a.id, periodo_id: per.id }, order: ['fecha', 'nombre'] }),
    E.db.select('indicadores', { eq: { asignacion_id: a.id, periodo_id: per.id }, order: 'numero' }),
    E.db.select('calificaciones', { eq: { estudiante_id: est } }),
    E.db.select('recuperaciones', { eq: { asignacion_id: a.id, periodo_id: per.id, estudiante_id: est } }),
    E.db.select('menciones', { eq: { estudiante_id: est, asignacion_id: a.id, periodo_id: per.id } }),
  ]);
  await perfiles(ments.map((x) => x.autor_id));
  const nota = Object.fromEntries(cal.map((c) => [c.actividad_id, c.valor]));
  const d = definitiva(notaConIndicadores(inds, acts, nota), recs[0]?.nota);
  return { v: d.valor, recuperada: d.recuperada, acts, inds, nota, ments };
}

function filaTarea(t, entrega) {
  return `<a class="fila fila-boton" href="#/tarea/${t.id}"><span>📝</span><span><b>${esc(t.titulo)}</b><small>Entregar: ${fechaHora(t.entrega_en)}${entrega ? ' · ✅ entregada' : ''}</small></span><span class="flecha">›</span></a>`;
}

async function editarTarea(b, a, t) {
  const per = b.periodos.find((x) => !x.cerrado) || b.periodos.at(-1);
  const local = (iso) => { if (!iso) return ''; const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
  const r = await ventana({
    titulo: t ? 'Editar tarea' : 'Nueva tarea',
    html: camposHTML([
      { name: 'titulo', label: 'Título' },
      { name: 'descripcion', label: 'Instrucciones', tipo: 'textarea', filas: 6 },
      { name: 'enlace', label: 'Enlace (opcional: video, documento, Meet…)', tipo: 'url' },
      { name: 'periodo_id', label: 'Periodo', tipo: 'select', vacio: 'Sin periodo', opciones: b.periodos.map((x) => [x.id, x.nombre]), def: t?.periodo_id ?? per?.id },
      { name: 'publicada_en', label: 'Publicar desde', tipo: 'datetime-local', def: local(t?.publicada_en || new Date().toISOString()) },
      { name: 'requiere_entrega', label: 'Requiere entrega en línea', tipo: 'checkbox', def: t ? t.requiere_entrega : true },
      { name: 'entrega_en', label: 'Fecha límite de entrega', tipo: 'datetime-local', def: local(t?.entrega_en) },
    ], t ? { ...t, publicada_en: local(t.publicada_en), entrega_en: local(t.entrega_en) } : {}),
    botones: [
      ...(t ? [{ texto: 'Eliminar', clase: 'btn-peligro', antes: async () => {
        if (!(await confirmar('¿Eliminar la tarea?', 'Se borrarán también las entregas.', 'Eliminar'))) return false;
        await E.db.remove('tareas', { id: t.id }); return 'borrada';
      } }] : []),
      { texto: 'Cancelar' },
      { texto: t ? 'Guardar' : 'Publicar', antes: async (c) => {
        const d = leerForm(c);
        if (!d.titulo) throw new Error('Escribe el título.');
        if (d.requiere_entrega && !d.entrega_en) throw new Error('Pon la fecha límite de entrega.');
        const datos = {
          titulo: d.titulo, descripcion: d.descripcion || '', enlace: /^https?:\/\//i.test(d.enlace || '') ? d.enlace : null, periodo_id: d.periodo_id || null,
          publicada_en: d.publicada_en ? new Date(d.publicada_en).toISOString() : new Date().toISOString(),
          requiere_entrega: !!d.requiere_entrega, entrega_en: d.requiere_entrega && d.entrega_en ? new Date(d.entrega_en).toISOString() : null,
        };
        if (t) await E.db.update('tareas', datos, { id: t.id });
        else await E.db.insert('tareas', [{ colegio_id: E.colegio.id, asignacion_id: a.id, creado_por: E.yo.id, ...datos }]);
        return true;
      } },
    ],
  });
  if (r) aviso(r === 'borrada' ? 'Tarea eliminada' : t ? 'Tarea guardada' : 'Tarea publicada');
  return r;
}

// ---------------------------------------------------------------- Tarea
export async function tarea(m, p) {
  const b = await base();
  const [t] = await E.db.select('tareas', { eq: { id: p.id } });
  if (!t) { m.innerHTML = vacio('Esa tarea no existe.'); return; }
  const a = b.asignacionPorId.get(t.asignacion_id);
  if (!a) { m.innerHTML = vacio('Esa tarea es de una clase que ya no está activa.'); return; }
  const soyProfe = E.rol === 'admin' || (E.rol === 'profesor' && a?.profesor_id === E.yo.id);
  const est = soyProfe ? null : personaActiva();
  const puedeEntregar = E.rol === 'estudiante' && t.requiere_entrega;
  const entregas = await E.db.select('tarea_entregas', { eq: { tarea_id: t.id } });

  let cuerpo = '';
  if (soyProfe) {
    const mats = (await E.db.select('matriculas', { eq: { curso_id: a.curso_id } })).filter((x) => x.estado === 'activa');
    await perfiles(mats.map((x) => x.estudiante_id));
    const lista = mats.map((x) => E.perfiles.get(x.estudiante_id)).filter(Boolean).sort((x, y) => nombreLista(x).localeCompare(nombreLista(y)));
    const porEst = new Map(entregas.map((x) => [x.estudiante_id, x]));
    cuerpo = `
      <section class="tarjeta"><h2>Entregas (${entregas.length} de ${lista.length})</h2>
        ${t.requiere_entrega ? `<div class="lista">${lista.map((e) => {
          const x = porEst.get(e.id);
          return `<div class="fila fila-entrega">
            <span class="crece"><b>${esc(nombreLista(e))}</b><small>${x ? `Entregó ${fechaHora(x.entregada_en)}${t.entrega_en && x.entregada_en > t.entrega_en ? ' · <span class="alerta">tarde</span>' : ''}` : 'Sin entregar'}</small></span>
            ${x ? `<button class="btn btn-chico" data-revisar="${e.id}">${x.revisada_en ? `✅ ${mostrarNota(x.nota, E.colegio)}` : 'Revisar'}</button>` : ''}
          </div>`;
        }).join('')}</div>` : '<p class="ayuda">Esta tarea no requiere entrega en línea.</p>'}
      </section>`;
  } else if (est) {
    const x = entregas.find((e) => e.estudiante_id === est);
    cuerpo = !t.requiere_entrega ? '<p class="aviso-caja">Esta tarea no requiere entrega en línea.</p>' : `
      <section class="tarjeta"><h2>${E.rol === 'estudiante' ? 'Mi entrega' : 'Entrega'}</h2>
        ${x ? `
          <p>📤 Entregada ${fechaHora(x.entregada_en)}${t.entrega_en && x.entregada_en > t.entrega_en ? ' <span class="alerta">(tarde)</span>' : ''}</p>
          ${x.texto ? `<p class="texto-largo">${esc(x.texto)}</p>` : ''}
          ${x.archivo_ruta ? `<button class="fila fila-boton tarjeta-archivo" data-archivo><span class="avatar">📎</span><span><b>${esc(x.archivo_nombre)}</b><small>${peso(x.archivo_bytes)}</small></span></button>` : ''}
          ${x.revisada_en ? `<div class="aviso-caja ok"><b>Calificación: ${mostrarNota(x.nota, E.colegio)}</b>${x.comentario ? `<p>${esc(x.comentario)}</p>` : ''}</div>` : '<p class="ayuda">Pendiente de revisión.</p>'}`
        : `<p>${vencida(t) ? '<span class="alerta">⚠️ La fecha de entrega ya pasó.</span>' : '🆕 Aún no se ha entregado.'}</p>`}
        ${puedeEntregar && !x?.revisada_en ? `
          <div class="form" id="f-entrega">
            <label>Respuesta / comentario<textarea name="texto" rows="4">${esc(x?.texto || '')}</textarea></label>
            <label>Archivo (opcional)<input type="file" name="archivo"><small class="ayuda">Hasta 25 MB${E.db.modo === 'demo' ? ' (2 MB en el demo)' : ''}</small></label>
            <button class="btn btn-primario" data-entregar>${x ? 'Actualizar entrega' : '📤 Entregar tarea'}</button>
          </div>` : ''}
      </section>`;
  }

  m.innerHTML = cabecera(esc(t.titulo), { volver: `#/aula/${t.asignacion_id}?tab=tareas`, acciones: soyProfe ? '<button class="btn" data-editar>Editar</button>' : '' }) + `
    <p class="sub-titulo">${esc(etiqueta(b, a))} · Publicada ${fecha(t.publicada_en)}${t.entrega_en ? ' · Entregar hasta <b>' + fechaHora(t.entrega_en) + '</b>' : ''}</p>
    <section class="tarjeta"><h2>Instrucciones</h2><p class="texto-largo">${esc(t.descripcion || 'Sin instrucciones.')}</p>
      ${/^https?:\/\//i.test(t.enlace || '') ? `<p><a class="btn btn-chico" href="${esc(t.enlace)}" target="_blank" rel="noopener">🔗 Abrir enlace</a></p>` : ''}</section>
    ${cuerpo}`;

  m.querySelector('[data-editar]')?.addEventListener('click', async () => {
    const r = await editarTarea(b, a, t);
    if (r === 'borrada') location.hash = `#/aula/${t.asignacion_id}?tab=tareas`; else if (r) tarea(m, p);
  });
  m.querySelector('[data-archivo]')?.addEventListener('click', () => abrir(entregas.find((e) => e.estudiante_id === est)));
  m.querySelector('[data-entregar]')?.addEventListener('click', async (ev) => {
    const f = m.querySelector('#f-entrega');
    const texto = f.querySelector('[name=texto]').value.trim();
    const archivo = f.querySelector('[name=archivo]').files[0];
    const previa = entregas.find((e) => e.estudiante_id === est);
    if (!texto && !archivo && !previa?.archivo_ruta) return aviso('Escribe tu respuesta o adjunta un archivo.', 'error');
    if (archivo && archivo.size > 25 * 1024 * 1024) return aviso('El archivo pesa más de 25 MB.', 'error');
    ev.target.disabled = true; ev.target.textContent = 'Enviando…';
    try {
      const datos = { texto: texto || null, entregada_en: new Date().toISOString() };
      if (archivo) {
        const ruta = `${E.colegio.id}/${t.id}/${est}/${Date.now()}_${nombreSeguro(archivo.name)}`;
        await E.db.subirArchivo(BUCKET, ruta, archivo);
        Object.assign(datos, { archivo_ruta: ruta, archivo_nombre: archivo.name, archivo_bytes: archivo.size });
      }
      if (previa) await E.db.update('tarea_entregas', datos, { tarea_id: t.id, estudiante_id: est });
      else await E.db.insert('tarea_entregas', [{ tarea_id: t.id, colegio_id: E.colegio.id, estudiante_id: est, ...datos }]);
      aviso('¡Tarea entregada!');
      tarea(m, p);
    } catch (e) { aviso(e.message, 'error'); ev.target.disabled = false; ev.target.textContent = 'Entregar tarea'; }
  });
  m.querySelectorAll('[data-revisar]').forEach((bt) => (bt.onclick = async () => {
    const x = entregas.find((e) => e.estudiante_id === bt.dataset.revisar);
    const r = await ventana({
      titulo: 'Revisar entrega · ' + nombre(E.perfiles.get(x.estudiante_id)),
      html: `<p class="ayuda">Entregó ${fechaHora(x.entregada_en)}</p>
        ${x.texto ? `<p class="texto-largo">${esc(x.texto)}</p>` : ''}
        ${x.archivo_ruta ? `<button class="fila fila-boton tarjeta-archivo" data-ver-archivo><span class="avatar">📎</span><span><b>${esc(x.archivo_nombre)}</b><small>${peso(x.archivo_bytes)}</small></span></button>` : ''}
        ${camposHTML([{ name: 'nota', label: `Nota (${E.colegio.nota_min} a ${E.colegio.nota_max}, opcional)`, tipo: 'number', paso: '0.1' }, { name: 'comentario', label: 'Comentario para el estudiante', tipo: 'textarea', filas: 3 }], x)}`,
      alAbrir: (caja) => caja.querySelector('[data-ver-archivo]')?.addEventListener('click', () => abrir(x)),
      botones: [{ texto: 'Cancelar' }, { texto: 'Guardar revisión', antes: async (caja) => {
        const d = leerForm(caja);
        const nota = d.nota === '' ? null : Number(String(d.nota).replace(',', '.'));
        if (nota != null && (Number.isNaN(nota) || nota < E.colegio.nota_min || nota > E.colegio.nota_max)) throw new Error(`La nota debe estar entre ${E.colegio.nota_min} y ${E.colegio.nota_max}.`);
        await E.db.update('tarea_entregas', { nota, comentario: d.comentario || null, revisada_en: new Date().toISOString() }, { tarea_id: t.id, estudiante_id: x.estudiante_id });
        return true;
      } }],
    });
    if (r) { aviso('Revisión guardada'); tarea(m, p); }
  }));
}

async function abrir(x) {
  const w = E.db.modo === 'demo' ? null : window.open('', '_blank');
  try {
    const url = await E.db.urlArchivo(BUCKET, x.archivo_ruta);
    if (E.db.modo === 'demo') { const el = document.createElement('a'); el.href = url; el.download = x.archivo_nombre; document.body.appendChild(el); el.click(); el.remove(); }
    else if (w) w.location = url; else location.href = url;
  } catch (e) { w?.close(); aviso(e.message, 'error'); }
}

// ---------------------------------------------------------------- Muro de la materia (Tablero del docente)
const puedePublicar = (a) => E.rol === 'admin' || (E.rol === 'profesor' && a.profesor_id === E.yo.id);

async function htmlMuro(a) {
  const pubs = await E.db.select('aula_publicaciones', { eq: { asignacion_id: a.id }, order: 'creado_en desc' });
  pubs.sort((x, z) => (z.fijada ? 1 : 0) - (x.fijada ? 1 : 0));
  await perfiles(pubs.map((x) => x.autor_id));
  return `<section class="tarjeta muro">
    <div class="tarjeta-cab"><h2>📌 Muro de la materia</h2>${puedePublicar(a) ? '<button class="btn btn-primario btn-chico" data-publicar>＋ Publicar</button>' : ''}</div>
    ${pubs.length ? pubs.map((x) => `
      <article class="publicacion ${x.fijada ? 'fijada' : ''}">
        <header><span class="avatar">${esc(iniciales(E.perfiles.get(x.autor_id)))}</span><span><b>${esc(nombre(E.perfiles.get(x.autor_id)))}</b><small>${fechaHora(x.creado_en)}${x.fijada ? ' · 📌 fijada' : ''}</small></span>
          ${puedePublicar(a) ? `<button class="btn-link" data-pub-editar="${x.id}">Editar</button>` : ''}</header>
        <p class="texto-largo">${esc(x.texto)}</p>
        ${/^https?:\/\//i.test(x.enlace || '') ? `<p><a class="btn btn-chico" href="${esc(x.enlace)}" target="_blank" rel="noopener noreferrer">🔗 Abrir enlace</a></p>` : ''}
        ${x.archivo_ruta ? `<button class="fila fila-boton tarjeta-archivo" data-pub-archivo="${x.id}"><span class="avatar">📎</span><span><b>${esc(x.archivo_nombre)}</b><small>Material de la clase</small></span></button>` : ''}
      </article>`).join('') : '<p class="ayuda">El profesor aún no ha publicado nada.</p>'}
  </section>`;
}

function conectarMuro(m, a, recargar) {
  const editar = async (fila) => {
    const r = await ventana({
      titulo: fila ? 'Editar publicación' : 'Nueva publicación',
      html: camposHTML([{ name: 'texto', label: 'Mensaje (anuncio, indicaciones, material…)', tipo: 'textarea', filas: 5 }, { name: 'enlace', label: 'Enlace (opcional: video, Meet, documento)', tipo: 'url' }, { name: 'fijada', label: '📌 Fijar arriba', tipo: 'checkbox' }], fila || {}) +
        `<div class="form"><label>Archivo (opcional)<input type="file" name="archivo"><small class="ayuda">Hasta 25 MB${E.db.modo === 'demo' ? ' (2 MB en el demo)' : ''}</small></label></div>`,
      botones: [
        ...(fila ? [{ texto: 'Eliminar', clase: 'btn-peligro', antes: async () => { if (!(await confirmar('¿Eliminar la publicación?', '', 'Eliminar'))) return false; if (fila.archivo_ruta) await E.db.borrarArchivo('aula', fila.archivo_ruta).catch(() => {}); await E.db.remove('aula_publicaciones', { id: fila.id }); return true; } }] : []),
        { texto: 'Cancelar' },
        { texto: 'Publicar', antes: async (c) => {
          const d = leerForm(c);
          const arch = c.querySelector('[name=archivo]').files[0];
          if (!d.texto) throw new Error('Escribe el mensaje.');
          if (d.enlace && !/^https?:\/\/\S+$/i.test(d.enlace)) throw new Error('El enlace debe empezar por https://');
          const datos = { texto: d.texto, enlace: d.enlace || null, fijada: !!d.fijada };
          if (arch) {
            if (arch.size > 25 * 1024 * 1024) throw new Error('El archivo pesa más de 25 MB.');
            const ruta = `${E.colegio.id}/${a.id}/${Date.now()}_${nombreSeguro(arch.name)}`;
            await E.db.subirArchivo('aula', ruta, arch);
            Object.assign(datos, { archivo_ruta: ruta, archivo_nombre: arch.name });
          }
          if (fila) {
            await E.db.update('aula_publicaciones', datos, { id: fila.id });
            if (arch && fila.archivo_ruta) await E.db.borrarArchivo('aula', fila.archivo_ruta).catch(() => {}); // el archivo anterior no queda huérfano
          } else await E.db.insert('aula_publicaciones', [{ colegio_id: E.colegio.id, asignacion_id: a.id, autor_id: E.yo.id, ...datos }]);
          return true;
        } },
      ],
    });
    if (r) { aviso('Muro actualizado'); recargar(); }
  };
  m.querySelector('[data-publicar]')?.addEventListener('click', () => editar(null));
  m.querySelectorAll('[data-pub-editar]').forEach((b) => (b.onclick = async () => { const [f] = await E.db.select('aula_publicaciones', { eq: { id: b.dataset.pubEditar } }); editar(f); }));
  m.querySelectorAll('[data-pub-archivo]').forEach((b) => (b.onclick = async () => {
    const [f] = await E.db.select('aula_publicaciones', { eq: { id: b.dataset.pubArchivo } });
    const w = E.db.modo === 'demo' ? null : window.open('', '_blank');
    try {
      const url = await E.db.urlArchivo('aula', f.archivo_ruta);
      if (E.db.modo === 'demo') { const el = document.createElement('a'); el.href = url; el.download = f.archivo_nombre; document.body.appendChild(el); el.click(); el.remove(); }
      else if (w) w.location = url; else location.href = url;
    } catch (e) { w?.close(); aviso(e.message, 'error'); }
  }));
}
