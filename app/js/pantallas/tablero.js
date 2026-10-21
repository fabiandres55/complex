// Tablero (REA Phidias §1.3): accesos directos con lo pendiente de cada módulo.
import { E, base, misAsignaciones } from '../estado.js';
import { esc, fecha } from '../ui.js';
import { contarNoLeidos } from './mensajeria.js';
import { estadoCobro, dinero } from './tesoreria.js';

const diaLocal = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const tarjeta = (href, ic, n, texto, alerta = false) =>
  `<a class="pendiente ${alerta && n ? 'con-pendiente' : ''}" href="${href}"><span class="ic">${ic}</span><b>${n}</b><span>${esc(texto)}</span></a>`;

const proximosEventos = async () => {
  const evs = await E.db.select('eventos', { eq: { colegio_id: E.colegio.id } });
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  return evs.filter((e) => new Date(e.inicio) >= hoy).sort((a, z) => (a.inicio > z.inicio ? 1 : -1)).slice(0, 4);
};
const htmlEventos = (evs) => evs.length ? `<section class="tarjeta"><div class="tarjeta-cab"><h2>Próximos eventos</h2><a class="btn btn-chico" href="#/calendario?vista=agenda">Calendario</a></div>
  <div class="lista">${evs.map((e) => `<a class="fila fila-boton" href="#/calendario?fecha=${diaLocal(e.inicio)}"><span>📅</span><span><b>${esc(e.titulo)}</b><small>${fecha(e.inicio)}</small></span></a>`).join('')}</div></section>` : '';

export async function pendientesAdmin() {
  const c = E.colegio.id;
  const [noLeidos, aus, plan, procs, resp, cobros, pagos] = await Promise.all([
    contarNoLeidos(),
    E.db.select('reportes_ausencia', { eq: { colegio_id: c, estado: 'recibido' } }),
    E.db.select('planeaciones', { eq: { colegio_id: c, estado: 'enviada' } }),
    E.db.select('procesos', { eq: { colegio_id: c } }),
    E.db.select('proceso_respuestas', { eq: { colegio_id: c } }),
    E.db.select('cobros', { eq: { colegio_id: c } }),
    E.db.select('pagos', { eq: { colegio_id: c } }),
  ]);
  const abiertos = procs.filter((x) => x.publicado && new Date(x.abre) <= new Date() && (!x.cierra || new Date(x.cierra) > new Date()));
  const vencido = cobros.filter((x) => !x.anulado).reduce((s, x) => { const e = estadoCobro(x, pagos, E.colegio); return s + (e.vencido ? e.saldo : 0); }, 0);
  return `<div class="pendientes">
    ${tarjeta('#/bandeja', '✉️', noLeidos, 'Mensajes sin leer', true)}
    ${tarjeta('#/planeaciones?tab=enviada', '📂', plan.length, 'Planeaciones por revisar', true)}
    ${tarjeta('#/ausencias', '🤒', aus.length, 'Ausencias por revisar', true)}
    ${tarjeta('#/procesos', '📋', abiertos.length, `Procesos abiertos · ${resp.filter((r) => r.terminado && abiertos.some((p) => p.id === r.proceso_id)).length} respuestas`)}
    <a class="pendiente ${vencido ? 'con-pendiente' : ''}" href="#/tesoreria?tab=cartera&vencidos=1"><span class="ic">💰</span><b>${dinero(vencido)}</b><span>Cartera vencida</span></a>
  </div>${htmlEventos(await proximosEventos())}`;
}

export async function pendientesProfesor() {
  const b = await base();
  const mias = misAsignaciones(b).map((a) => a.id);
  const [noLeidos, tareas, plan] = await Promise.all([
    contarNoLeidos(),
    mias.length ? E.db.select('tareas', { in: { asignacion_id: mias } }) : [],
    E.db.select('planeaciones', { eq: { colegio_id: E.colegio.id, profesor_id: E.yo.id } }),
  ]);
  const entregas = tareas.length ? await E.db.select('tarea_entregas', { in: { tarea_id: tareas.map((t) => t.id) } }) : [];
  const sinRevisar = entregas.filter((e) => !e.revisada_en).length;
  return `<div class="pendientes">
    ${tarjeta('#/bandeja', '✉️', noLeidos, 'Mensajes sin leer', true)}
    ${tarjeta('#/aula', '📝', sinRevisar, 'Entregas por revisar', true)}
    ${tarjeta('#/planeaciones?tab=devuelta', '↩️', plan.filter((x) => x.estado === 'devuelta').length, 'Planeaciones devueltas', true)}
    ${tarjeta('#/planeaciones?tab=enviada', '🕓', plan.filter((x) => x.estado === 'enviada').length, 'Planeaciones en revisión')}
  </div>${htmlEventos(await proximosEventos())}`;
}

// Novedades de los últimos días para la familia (como las Notificaciones de Phidias):
// notas nuevas, tareas publicadas, fallas/tardanzas, anotaciones y menciones.
export async function novedadesFamilia(ests) {
  if (!ests.length) return '';
  const b = await base();
  const desde = new Date(Date.now() - 14 * 864e5).toISOString();
  const desdeDia = desde.slice(0, 10);
  const mats = (await E.db.select('matriculas', { in: { estudiante_id: ests } })).filter((x) => x.estado === 'activa');
  const asigPorEst = new Map(ests.map((e) => [e, b.asignaciones.filter((a) => mats.some((mt) => mt.estudiante_id === e && mt.curso_id === a.curso_id)).map((a) => a.id)]));
  const todasAsig = [...new Set([...asigPorEst.values()].flat())];
  const [cal, tareas, asis, obs, ments] = await Promise.all([
    E.db.select('calificaciones', { in: { estudiante_id: ests } }),
    todasAsig.length ? E.db.select('tareas', { in: { asignacion_id: todasAsig } }) : [],
    E.db.select('asistencia', { in: { estudiante_id: ests } }),
    E.db.select('observaciones', { in: { estudiante_id: ests } }),
    E.db.select('menciones', { in: { estudiante_id: ests } }),
  ]);
  const acts = cal.length ? await E.db.select('actividades', { in: { id: [...new Set(cal.map((c) => c.actividad_id))] } }) : [];
  const nomEst = (id) => E.perfiles.get(id)?.nombres || '';
  const materia = (asigId) => b.materiaPorId.get(b.asignacionPorId.get(asigId)?.materia_id)?.nombre || '';
  const varios = ests.length > 1;
  const items = [];
  for (const c of cal.filter((x) => x.actualizado_en >= desde)) {
    const a = acts.find((x) => x.id === c.actividad_id);
    if (a) items.push({ cuando: c.actualizado_en, ic: '📝', t: `Nota ${c.valor != null ? Number(c.valor).toFixed(E.colegio.decimales ?? 1) : ''} en ${a.nombre}`, s: materia(a.asignacion_id) + (varios ? ' · ' + nomEst(c.estudiante_id) : ''), href: `#/estudiante/${c.estudiante_id}?tab=notas` });
  }
  for (const t of tareas.filter((x) => x.publicada_en >= desde && x.publicada_en <= new Date().toISOString())) {
    const quien = ests.filter((e) => asigPorEst.get(e).includes(t.asignacion_id)).map(nomEst).join(', ');
    items.push({ cuando: t.publicada_en, ic: '📚', t: `Nueva tarea: ${t.titulo}`, s: materia(t.asignacion_id) + (varios ? ' · ' + quien : '') + (t.entrega_en ? ' · entregar ' + fecha(t.entrega_en) : ''), href: `#/tarea/${t.id}` });
  }
  for (const x of asis.filter((f) => f.fecha >= desdeDia && f.estado !== 'presente')) {
    items.push({ cuando: x.fecha + 'T12:00:00', ic: x.estado === 'ausente' ? '❌' : x.estado === 'tarde' ? '⏰' : '📄', t: { ausente: 'Falla', tarde: 'Llegada tarde', excusa: 'Ausencia con excusa' }[x.estado], s: materia(x.asignacion_id) + (varios ? ' · ' + nomEst(x.estudiante_id) : ''), href: `#/estudiante/${x.estudiante_id}?tab=asistencia` });
  }
  for (const o of obs.filter((f) => f.creado_en >= desde && f.visible_acudiente)) items.push({ cuando: o.creado_en, ic: '📒', t: `Seguimiento: ${o.categoria || 'Observador'}`, s: (o.descripcion || '').slice(0, 70) + (varios ? ' · ' + nomEst(o.estudiante_id) : ''), href: `#/estudiante/${o.estudiante_id}?tab=observador` });
  for (const x of ments.filter((f) => (f.creado_en || f.fecha) >= desde)) items.push({ cuando: x.creado_en || x.fecha, ic: '🏅', t: `Mención: ${x.tipo}`, s: (x.descripcion || '') + (varios ? ' · ' + nomEst(x.estudiante_id) : ''), href: `#/estudiante/${x.estudiante_id}?tab=notas` });
  items.sort((a, z) => (a.cuando < z.cuando ? 1 : -1));
  if (!items.length) return '';
  return `<section class="tarjeta"><h2>🔔 Novedades (últimos 14 días)</h2><div class="lista">${items.slice(0, 12).map((x) => `
    <a class="fila fila-boton" href="${x.href}"><span>${x.ic}</span><span><b>${esc(x.t)}</b><small>${esc(x.s)} · ${fecha(x.cuando)}</small></span></a>`).join('')}</div>
    ${items.length > 12 ? `<p class="ayuda">y ${items.length - 12} más…</p>` : ''}</section>`;
}

// Obligaciones de la familia (Phidias: Matrícula > Obligaciones): lo que falta por hacer
export async function obligacionesFamilia(ests) {
  if (!ests.length) return '';
  const ahora = new Date().toISOString();
  const [procs, resp, fichas, cobros, pagos] = await Promise.all([
    E.db.select('procesos', { eq: { colegio_id: E.colegio.id } }),
    E.db.select('proceso_respuestas', { eq: { perfil_id: E.yo.id } }),
    E.db.select('fichas_medicas', { in: { estudiante_id: ests } }),
    E.db.select('cobros', { eq: { colegio_id: E.colegio.id }, in: { estudiante_id: ests } }),
    E.db.select('pagos', { eq: { colegio_id: E.colegio.id }, in: { estudiante_id: ests } }),
  ]);
  const nom = (id) => E.perfiles.get(id)?.nombres || '';
  const items = [];
  for (const p of procs.filter((x) => x.publicado && x.roles?.includes(E.rol) && x.abre <= ahora && (!x.cierra || x.cierra > ahora))) {
    for (const est of p.por_estudiante ? ests : [null]) {
      const r = resp.find((y) => y.proceso_id === p.id && (y.estudiante_id || null) === est);
      if (!r?.terminado) items.push({ ic: '📋', t: `${p.titulo}${est ? ' · ' + nom(est) : ''}`, s: (r ? 'En curso' : 'Sin iniciar') + (p.cierra ? ' · cierra ' + fecha(p.cierra) : ''), href: `#/proceso/${p.id}${est ? '?est=' + est : ''}` });
    }
  }
  for (const est of ests) if (!fichas.some((f) => f.estudiante_id === est)) items.push({ ic: '🩺', t: `Llenar la ficha médica de ${nom(est)}`, s: 'Para que el colegio pueda atender emergencias', href: `#/estudiante/${est}?tab=ficha` });
  const vencidos = cobros.filter((c) => !c.anulado).map((c) => ({ c, e: estadoCobro(c, pagos, E.colegio) })).filter((x) => x.e.vencido);
  if (vencidos.length) items.push({ ic: '💰', t: `Pagos vencidos: ${dinero(vencidos.reduce((s, x) => s + x.e.total, 0))}`, s: vencidos.map((x) => x.c.descripcion).slice(0, 3).join(', '), href: '#/tesoreria' });
  if (!items.length) return '';
  return `<section class="tarjeta obligaciones"><h2>⚠️ Obligaciones pendientes (${items.length})</h2><div class="lista">${items.map((x) => `
    <a class="fila fila-boton" href="${x.href}"><span>${x.ic}</span><span><b>${esc(x.t)}</b><small>${esc(x.s)}</small></span><span class="flecha">›</span></a>`).join('')}</div></section>`;
}
