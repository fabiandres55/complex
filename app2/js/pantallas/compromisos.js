// Compromisos del estudiante (mapa COMPLEX.1 §3: "Inf estudiantes → compromisos").
// Los registran el administrador, el director de sección y los docentes del estudiante; tienen fecha
// límite y cumplimiento (pendiente / cumplido / no cumplido). La familia o el estudiante los firman
// desde la app para dejar constancia de que los conocen. La seguridad la pone la base de datos (RLS).
import { E, base, perfiles } from '../estado.js';
import { esc, aviso, ventana, leerForm, confirmar, nombre, nombreLista, vacio, fecha, fechaHora, hoy } from '../ui.js';
import { cabecera, pestanas, buscar, conectarBuscador, camposHTML } from './comun.js';
import { cursosSeccion } from './enfermeria.js';

export const llevaCompromisos = () => ['admin', 'profesor', 'director_seccion'].includes(E.rol);
const CATEGORIAS = ['Académico', 'Convivencia', 'Asistencia', 'Otro'];
const ESTADO = { pendiente: ['⏳ Pendiente', 'alerta'], cumplido: ['✅ Cumplido', 'ok'], no_cumplido: ['✖ No cumplido', 'error'] };
const vencido = (c) => c.estado === 'pendiente' && c.fecha_limite && c.fecha_limite < hoy();
const chipEstado = (c) => vencido(c) ? '<span class="chip error">⚠️ Vencido</span>' : `<span class="chip ${ESTADO[c.estado][1]}">${ESTADO[c.estado][0]}</span>`;

// Estudiantes cuyos compromisos llevo (igual que private.lleva_compromisos en la base)
async function misEstudiantesCompromiso() {
  const b = await base();
  const cursos = E.rol === 'admin' ? b.cursos
    : E.rol === 'director_seccion' ? cursosSeccion(b)
    : b.cursos.filter((c) => c.director_id === E.yo.id || b.asignaciones.some((a) => a.curso_id === c.id && a.profesor_id === E.yo.id));
  const ids = new Set(cursos.map((c) => c.id));
  const mats = (await E.db.select('matriculas', { eq: { colegio_id: E.colegio.id } })).filter((x) => x.estado === 'activa' && ids.has(x.curso_id));
  await perfiles(mats.map((x) => x.estudiante_id));
  return mats.map((x) => ({ id: x.estudiante_id, p: E.perfiles.get(x.estudiante_id), curso: b.cursoPorId.get(x.curso_id) }))
    .filter((x) => x.p).sort((a, z) => (a.curso?.nombre || '').localeCompare(z.curso?.nombre || '') || nombreLista(a.p).localeCompare(nombreLista(z.p)));
}

const tarjeta = (c, { conEstudiante = false } = {}) => `
  <article class="obs compromiso compromiso-${vencido(c) ? 'vencido' : c.estado}">
    <header><span>🤝 <b>${esc(c.categoria)}</b> ${chipEstado(c)}</span><small>${fecha(c.fecha)}</small></header>
    ${conEstudiante ? `<p><a href="#/estudiante/${c.estudiante_id}?tab=compromisos"><b>${esc(nombreLista(E.perfiles.get(c.estudiante_id)))}</b></a></p>` : ''}
    <p>${esc(c.descripcion)}</p>
    ${c.fecha_limite ? `<p class="ayuda">📅 Fecha límite: <b>${fecha(c.fecha_limite)}</b></p>` : ''}
    ${c.estado !== 'pendiente' ? `<p class="ayuda">${ESTADO[c.estado][0]} el ${fechaHora(c.cerrado_en)}${c.cierre_nota ? ': ' + esc(c.cierre_nota) : ''}</p>` : ''}
    <footer><small>Por ${esc(nombre(E.perfiles.get(c.autor_id)))}${!c.visible_familia ? ' · 🔒 solo para el colegio' : c.firmado_en ? ` · ✍️ Firmado por ${esc(nombre(E.perfiles.get(c.firmado_por)))} el ${fechaHora(c.firmado_en)}` : ' · Sin firma de la familia'}</small>
      <span class="acciones">
        ${llevaCompromisos() ? `<button class="btn-link" data-editar-comp="${c.id}">Editar</button>${c.estado === 'pendiente' ? `<button class="btn btn-chico" data-cerrar-comp="${c.id}">Cerrar</button>` : ''}` : ''}
        ${!llevaCompromisos() && c.visible_familia && !c.firmado_en ? `<button class="btn btn-chico btn-primario" data-firmar-comp="${c.id}">✍️ Firmar</button>` : ''}
      </span></footer>
  </article>`;

// ---------------------------------------------------------------- Pestaña en la ficha del estudiante
export async function htmlCompromisos(estId) {
  let filas = await E.db.select('compromisos', { eq: { estudiante_id: estId }, order: ['fecha desc', 'creado_en desc'] }).catch(() => []);
  if (!llevaCompromisos()) filas = filas.filter((c) => c.visible_familia); // en modo real ya lo filtra la RLS; así el demo se comporta igual
  await perfiles(filas.flatMap((c) => [c.autor_id, c.firmado_por]).filter(Boolean));
  const pend = filas.filter((c) => c.estado === 'pendiente');
  return `${llevaCompromisos() ? '<button class="btn btn-primario" data-nuevo-comp>＋ Compromiso</button>' : ''}
    ${filas.length ? `<p class="ayuda">${pend.length} pendiente(s)${pend.filter(vencido).length ? `, <b class="alerta">${pend.filter(vencido).length} vencido(s)</b>` : ''} · ${filas.length - pend.length} cerrado(s)</p>
      <div class="lista linea-tiempo">${filas.map((c) => tarjeta(c)).join('')}</div>` : vacio('No hay compromisos registrados.')}`;
}

export function conectarCompromisos(m, estId, recargar) {
  m.querySelector('[data-nuevo-comp]')?.addEventListener('click', async () => { if (await editar(null, estId)) recargar(); });
  conectarAcciones(m, recargar);
}

function conectarAcciones(m, recargar) {
  m.querySelectorAll('[data-editar-comp]').forEach((b) => (b.onclick = async () => {
    const [c] = await E.db.select('compromisos', { eq: { id: b.dataset.editarComp } });
    if (c && await editar(c, c.estudiante_id)) recargar();
  }));
  m.querySelectorAll('[data-cerrar-comp]').forEach((b) => (b.onclick = async () => {
    const r = await ventana({
      titulo: 'Cerrar compromiso',
      html: `<div class="form"><label>Resultado<select name="estado"><option value="cumplido">✅ Cumplido</option><option value="no_cumplido">✖ No cumplido</option></select></label>
        <label>Observación (opcional)<textarea name="cierre_nota" rows="3"></textarea></label></div>`,
      botones: [{ texto: 'Cancelar' }, { texto: 'Guardar', antes: async (caja) => {
        const d = leerForm(caja);
        await E.db.update('compromisos', { estado: d.estado, cierre_nota: d.cierre_nota || null }, { id: b.dataset.cerrarComp });
        return true;
      } }],
    });
    if (r) { aviso('Compromiso cerrado'); recargar(); }
  }));
  m.querySelectorAll('[data-firmar-comp]').forEach((b) => (b.onclick = async () => {
    if (!(await confirmar('¿Firmar el compromiso?', 'Tu firma deja constancia de que conoces este compromiso y lo acompañarás.', 'Firmar'))) return;
    try { await E.db.rpc('firmar_compromiso', { p_id: b.dataset.firmarComp }); aviso('✍️ Compromiso firmado'); recargar(); } catch (e) { aviso(e.message, 'error'); }
  }));
}

async function editar(fila, estId) {
  const ests = estId ? null : await misEstudiantesCompromiso();
  if (ests && !ests.length) { aviso('No tienes estudiantes para registrar compromisos.', 'error'); return false; }
  const campos = [
    { name: 'categoria', label: 'Tipo', tipo: 'select', opciones: CATEGORIAS.map((c) => [c, c]), def: 'Académico' },
    { name: 'descripcion', label: 'Compromiso', tipo: 'textarea', filas: 4 },
    { name: 'fecha', label: 'Fecha', tipo: 'date', def: hoy() },
    { name: 'fecha_limite', label: 'Fecha límite (opcional)', tipo: 'date' },
    { name: 'visible_familia', label: 'Visible para el estudiante y su familia (pueden firmarlo)', tipo: 'checkbox', def: true },
  ];
  return ventana({
    titulo: fila ? 'Editar compromiso' : 'Nuevo compromiso',
    html: (ests ? `<label>Estudiante<select name="estudiante_id"><option value="">Elige…</option>${ests.map((x) => `<option value="${x.id}">${esc(nombreLista(x.p))} · ${esc(x.curso?.nombre || '')}</option>`).join('')}</select></label>` : '') + camposHTML(campos, fila || {}),
    botones: [
      ...(fila && E.rol === 'admin' ? [{ texto: 'Eliminar', clase: 'btn-peligro', antes: async () => {
        if (!(await confirmar('¿Eliminar el compromiso?', 'No se puede deshacer.', 'Eliminar'))) return false;
        await E.db.remove('compromisos', { id: fila.id }); return true;
      } }] : []),
      { texto: 'Cancelar' },
      { texto: 'Guardar', antes: async (caja) => {
        const d = leerForm(caja);
        const est = estId || d.estudiante_id;
        delete d.estudiante_id;
        if (!est) throw new Error('Elige el estudiante.');
        if (!d.descripcion?.trim()) throw new Error('Escribe el compromiso.');
        d.fecha ||= hoy();
        d.fecha_limite ||= null;
        if (d.fecha_limite && d.fecha_limite < d.fecha) throw new Error('La fecha límite no puede ser antes de la fecha del compromiso.');
        if (fila) await E.db.update('compromisos', d, { id: fila.id });
        else await E.db.insert('compromisos', [{ colegio_id: E.colegio.id, estudiante_id: est, autor_id: E.yo.id, ...d }]);
        aviso(fila ? 'Compromiso actualizado' : 'Compromiso registrado');
        return true;
      } },
    ],
  });
}

// ---------------------------------------------------------------- Lista del colegio / del docente
const TABS = [['pendientes', 'Pendientes'], ['vencidos', 'Vencidos'], ['cerrados', 'Cerrados'], ['todos', 'Todos']];
export async function lista(m, p) {
  const tab = TABS.some((t) => t[0] === p.tab) ? p.tab : 'pendientes';
  const [todas, mios] = await Promise.all([
    E.db.select('compromisos', { eq: { colegio_id: E.colegio.id }, order: ['fecha desc', 'creado_en desc'] }).catch(() => []),
    misEstudiantesCompromiso(),
  ]);
  const visibles = new Set(mios.map((x) => x.id));
  // en modo real la RLS ya deja solo los míos; así el demo se comporta igual
  const filas0 = E.rol === 'admin' ? todas : todas.filter((c) => visibles.has(c.estudiante_id));
  const filas = filas0.filter((c) => tab === 'todos' || (tab === 'pendientes' ? c.estado === 'pendiente' : tab === 'vencidos' ? vencido(c) : c.estado !== 'pendiente'));
  await perfiles(filas.flatMap((c) => [c.estudiante_id, c.autor_id, c.firmado_por]).filter(Boolean));
  const n = { pendientes: filas0.filter((c) => c.estado === 'pendiente').length, vencidos: filas0.filter(vencido).length };
  m.innerHTML = cabecera('Compromisos', { acciones: '<button class="btn btn-primario" data-nuevo-comp>＋ Compromiso</button>' }) +
    pestanas(TABS.map(([k, t]) => [k, n[k] ? `${t} (${n[k]})` : t]), tab, '#/compromisos?tab=') + `
    <div class="contenido">
      <p class="ayuda">Compromisos de ${E.rol === 'admin' ? 'los estudiantes del colegio' : E.rol === 'director_seccion' ? 'los estudiantes de tu sección' : 'tus estudiantes'}, con fecha límite y firma de la familia.</p>
      ${filas.length ? `${buscar('Buscar por estudiante o texto…')}<div class="lista linea-tiempo">${filas.map((c) => `<div data-buscar="${esc(nombreLista(E.perfiles.get(c.estudiante_id)) + ' ' + c.descripcion + ' ' + c.categoria)}">${tarjeta(c, { conEstudiante: true })}</div>`).join('')}</div>`
        : vacio(tab === 'vencidos' ? 'No hay compromisos vencidos. 🎉' : 'No hay compromisos aquí.')}
    </div>`;
  conectarBuscador(m);
  const recargar = () => lista(m, p);
  m.querySelector('[data-nuevo-comp]').onclick = async () => { if (await editar(null, null)) recargar(); };
  conectarAcciones(m, recargar);
}
