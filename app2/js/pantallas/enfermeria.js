// Perfiles nuevos del mapa COMPLEX.1 (Fabio, 22-oct-2026):
//  - Enfermería: tablero, búsqueda de estudiantes (ficha médica y contactos), permisos de salida, prerreportes.
//  - Director de sección ("Administrador 2"): tablero de su sección (grados asignados en Personas).
//  - Permisos de salida: los autorizan admin, enfermería y director de sección; los ven la familia y los profesores.
//  - Planeación para la familia: las planeaciones APROBADAS de los cursos de sus hijos, con búsqueda.
// La seguridad la pone la base de datos (RLS); estas pantallas solo muestran lo que cada quien puede ver.
import { E, base, perfiles, fotos, misEstudiantes, personaActiva } from '../estado.js';
import { esc, aviso, ventana, leerForm, confirmar, nombre, nombreLista, vacio, fecha, fechaHora, hoy, avatarHTML } from '../ui.js';
import { cabecera, buscar, conectarBuscador } from './comun.js';

const ESTADO_SALIDA = { autorizado: ['🟡 Autorizada', 'alerta'], salio: ['✅ Salió', 'ok'], anulado: ['✖ Anulada', 'tachado'] };
const MOTIVOS = ['Cita médica', 'Enfermedad o malestar', 'Calamidad familiar', 'Actividad deportiva o cultural', 'Trámite personal', 'Otro'];
export const puedeAutorizarSalidas = () => ['admin', 'enfermeria', 'director_seccion'].includes(E.rol);

// Grados y cursos de mi sección (director de sección)
export const gradosSeccion = () => E.membresias.filter((m) => m.colegio_id === E.colegio?.id && m.rol === 'director_seccion' && m.activo).flatMap((m) => m.seccion_grados || []);
export const cursosSeccion = (b) => b.cursos.filter((c) => gradosSeccion().includes(c.grado_id));

// Estudiantes activos que puedo ver (la RLS filtra: enfermería y admin, todos; director de sección, su sección)
async function estudiantesVisibles() {
  const b = await base();
  const cursos = E.rol === 'director_seccion' ? cursosSeccion(b) : b.cursos;
  const ids = new Set(cursos.map((c) => c.id));
  const mats = (await E.db.select('matriculas', { eq: { colegio_id: E.colegio.id } })).filter((x) => x.estado === 'activa' && ids.has(x.curso_id));
  await perfiles(mats.map((x) => x.estudiante_id));
  return mats.map((x) => ({ id: x.estudiante_id, p: E.perfiles.get(x.estudiante_id), curso: b.cursoPorId.get(x.curso_id) }))
    .filter((x) => x.p).sort((a, z) => (a.curso?.nombre || '').localeCompare(z.curso?.nombre || '') || nombreLista(a.p).localeCompare(nombreLista(z.p)));
}

const listaEstudiantes = (ests, fot) => `${buscar('Buscar estudiante por nombre o curso…')}
  <div class="lista">${ests.map((x) => `<a class="fila fila-boton" href="#/estudiante/${x.id}?tab=ficha" data-buscar="${esc(nombreLista(x.p) + ' ' + (x.curso?.nombre || ''))}">
    ${avatarHTML(x.p, fot.get(x.id))}<span class="crece"><b>${esc(nombreLista(x.p))}</b><small>${esc(x.curso?.nombre || '')}</small></span><span class="flecha">›</span></a>`).join('')}</div>`;

// ---------------------------------------------------------------- Tableros
export async function inicioEnfermeria(m) {
  const [ests, hoyS] = await Promise.all([estudiantesVisibles(), E.db.select('permisos_salida', { eq: { colegio_id: E.colegio.id, fecha: hoy() } })]);
  const fot = await fotos(ests.map((x) => x.id));
  m.innerHTML = cabecera('Enfermería', { acciones: '<a class="btn btn-primario" href="#/salidas">🚪 Permisos de salida</a>' }) + `
    <div class="cifras">
      <a class="cifra" href="#/salidas"><b>${hoyS.filter((x) => x.estado === 'autorizado').length}</b><span>Salidas por confirmar hoy</span></a>
      <a class="cifra" href="#/salidas"><b>${hoyS.filter((x) => x.estado === 'salio').length}</b><span>Salieron hoy</span></a>
      <a class="cifra" href="#/seguimientos"><b>📋</b><span>Prerreportes</span></a>
    </div>
    <section class="tarjeta"><h2>Estudiantes</h2><p class="ayuda">Toca un estudiante para ver su ficha médica y los contactos de su familia.</p>
      ${ests.length ? listaEstudiantes(ests, fot) : vacio('Aún no hay estudiantes matriculados.')}</section>`;
  conectarBuscador(m);
}

export async function inicioSeccion(m) {
  const b = await base();
  const grados = gradosSeccion();
  const cursos = cursosSeccion(b);
  if (!grados.length) { m.innerHTML = cabecera('Mi sección') + vacio('El administrador aún no te ha asignado los grados de tu sección (Personas → tu nombre → Sección).'); return; }
  const [ests, hoyS, plans] = await Promise.all([
    estudiantesVisibles(),
    E.db.select('permisos_salida', { eq: { colegio_id: E.colegio.id, fecha: hoy() } }),
    E.db.select('planeaciones', { eq: { colegio_id: E.colegio.id } }).catch(() => []),
  ]);
  const fot = await fotos(ests.map((x) => x.id));
  const asigsSec = new Set(b.asignaciones.filter((a) => cursos.some((c) => c.id === a.curso_id)).map((a) => a.id));
  const plansSec = plans.filter((x) => asigsSec.has(x.asignacion_id));
  m.innerHTML = cabecera('Mi sección') + `
    <p class="ayuda">Grados: <b>${esc(b.grados.filter((g) => grados.includes(g.id)).map((g) => g.nombre).join(', '))}</b> · ${cursos.length} curso(s) · ${ests.length} estudiante(s)</p>
    <div class="cifras">
      <a class="cifra" href="#/planeaciones"><b>${plansSec.filter((x) => x.estado === 'enviada').length}</b><span>Planeaciones por revisar</span></a>
      <a class="cifra" href="#/salidas"><b>${hoyS.length}</b><span>Permisos de salida hoy</span></a>
      <a class="cifra" href="#/seguimientos"><b>📋</b><span>Seguimientos</span></a>
    </div>
    <section class="tarjeta"><h2>Estudiantes de la sección</h2>${ests.length ? listaEstudiantes(ests, fot) : vacio('Aún no hay estudiantes en estos grados.')}</section>`;
  conectarBuscador(m);
}

// ---------------------------------------------------------------- Permisos de salida
export async function salidas(m, p) {
  const b = await base();
  const puede = puedeAutorizarSalidas();
  const dia = p.dia || hoy();
  // quien autoriza mira por día; la familia y los profesores ven las últimas de sus estudiantes
  let lista = puede
    ? await E.db.select('permisos_salida', { eq: { colegio_id: E.colegio.id, fecha: dia }, order: 'creado_en desc' })
    : await E.db.select('permisos_salida', { eq: { colegio_id: E.colegio.id }, order: 'creado_en desc', limit: 60 });
  // la familia y el estudiante: solo los suyos (la RLS ya lo hace; el demo no)
  if (E.rol === 'acudiente' || E.rol === 'estudiante') { const mios = new Set(await misEstudiantes()); lista = lista.filter((x) => mios.has(x.estudiante_id)); }
  const [, fot, mats] = await Promise.all([
    perfiles([...lista.map((x) => x.estudiante_id), ...lista.map((x) => x.autorizado_por)]),
    fotos(lista.map((x) => x.estudiante_id)),
    lista.length ? E.db.select('matriculas', { in: { estudiante_id: lista.map((x) => x.estudiante_id) } }) : [],
  ]);
  const cursoDe = (est) => b.cursoPorId.get(mats.find((x) => x.estudiante_id === est && x.estado === 'activa')?.curso_id)?.nombre || '';
  m.innerHTML = cabecera('Permisos de salida', { acciones: puede ? '<button class="btn btn-primario" data-nueva>＋ Autorizar salida</button>' : '' }) + `
    ${puede ? `<div class="tarjeta-cab"><label class="en-linea">Fecha <input type="date" value="${dia}" max="${hoy()}" data-dia></label></div>` : '<p class="ayuda">Salidas del colegio autorizadas por enfermería o coordinación.</p>'}
    ${lista.length ? `<div class="lista">${lista.map((x) => {
      const pe = E.perfiles.get(x.estudiante_id);
      const [et, cl] = ESTADO_SALIDA[x.estado] || [x.estado, ''];
      return `<div class="fila fila-salida">
        ${avatarHTML(pe, fot.get(x.estudiante_id))}
        <span class="crece"><b>${esc(nombreLista(pe))}</b> <small>${esc(cursoDe(x.estudiante_id))}</small>
          <small>${puede ? '' : fecha(x.fecha) + ' · '}${x.hora ? 'Sale a las ' + esc(x.hora) + ' · ' : ''}${esc(x.motivo)}</small>
          ${x.recoge ? `<small>Lo recoge: ${esc(x.recoge)}${x.recoge_documento ? ' (' + esc(x.recoge_documento) + ')' : ''}</small>` : ''}
          ${x.observacion ? `<small>${esc(x.observacion)}</small>` : ''}
          <small>Autorizó: ${esc(nombre(E.perfiles.get(x.autorizado_por)))}${x.salio_en ? ' · salió ' + fechaHora(x.salio_en) : ''}</small></span>
        <span class="chip ${cl}">${et}</span>
        ${puede && x.estado === 'autorizado' ? `<span class="acciones"><button class="btn btn-chico" data-salio="${x.id}">✅ Salió</button><button class="btn btn-chico btn-peligro" data-anular="${x.id}">✖ Anular</button></span>` : ''}
      </div>`;
    }).join('')}</div>` : vacio(puede ? 'No hay permisos de salida este día.' : 'No hay permisos de salida.')}`;
  m.querySelector('[data-dia]')?.addEventListener('change', (e) => { location.hash = '#/salidas?dia=' + e.target.value; });
  m.querySelector('[data-nueva]')?.addEventListener('click', async () => { if (await nuevaSalida()) salidas(m, p); });
  m.querySelectorAll('[data-salio]').forEach((bt) => (bt.onclick = async () => {
    try { await E.db.update('permisos_salida', { estado: 'salio' }, { id: bt.dataset.salio }); aviso('Salida registrada'); salidas(m, p); } catch (e) { aviso(e.message, 'error'); }
  }));
  m.querySelectorAll('[data-anular]').forEach((bt) => (bt.onclick = async () => {
    if (!(await confirmar('¿Anular el permiso?', 'El estudiante ya no está autorizado para salir.', 'Anular'))) return;
    try { await E.db.update('permisos_salida', { estado: 'anulado' }, { id: bt.dataset.anular }); aviso('Permiso anulado'); salidas(m, p); } catch (e) { aviso(e.message, 'error'); }
  }));
}

async function nuevaSalida() {
  const ests = await estudiantesVisibles();
  if (!ests.length) { aviso('No hay estudiantes para elegir.', 'error'); return false; }
  const ahora = new Date();
  const hora = `${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`;
  const porCurso = new Map();
  for (const x of ests) { const k = x.curso?.nombre || 'Sin curso'; if (!porCurso.has(k)) porCurso.set(k, []); porCurso.get(k).push(x); }
  return ventana({
    titulo: 'Autorizar salida',
    html: `<div class="form">
      <label>Estudiante<select name="estudiante_id"><option value="">Elige…</option>${[...porCurso].map(([c, l]) => `<optgroup label="${esc(c)}">${l.map((x) => `<option value="${x.id}">${esc(nombreLista(x.p))}</option>`).join('')}</optgroup>`).join('')}</select></label>
      <label>Hora de salida<input type="time" name="hora" value="${hora}"></label>
      <label>Motivo<select name="motivo">${MOTIVOS.map((x) => `<option>${x}</option>`).join('')}</select></label>
      <label>Detalle (opcional)<textarea name="observacion" rows="2" maxlength="1000"></textarea></label>
      <label>Quién lo recoge<input name="recoge" maxlength="120" placeholder="Ej. Andrea Lozano (mamá)"></label>
      <label>Documento de quien lo recoge<input name="recoge_documento" maxlength="40"></label>
      <label class="check"><input type="checkbox" name="avisar" checked> Avisar a la familia y al director de curso (mensaje)</label>
    </div>`,
    botones: [{ texto: 'Cancelar' }, { texto: 'Autorizar', antes: async (c) => {
      const d = leerForm(c);
      if (!d.estudiante_id) throw new Error('Elige el estudiante.');
      const fila = { colegio_id: E.colegio.id, estudiante_id: d.estudiante_id, hora: d.hora || null, motivo: d.motivo, observacion: d.observacion?.trim() || null, recoge: d.recoge?.trim() || null, recoge_documento: d.recoge_documento?.trim() || null, autorizado_por: E.yo.id };
      await E.db.insert('permisos_salida', [fila]);
      if (d.avisar) avisarSalida(fila, ests.find((x) => x.id === d.estudiante_id)).catch((e) => aviso('El permiso quedó, pero el aviso no se envió: ' + e.message, 'error'));
      aviso('Salida autorizada');
      return true;
    } }],
  });
}

// Mensaje a la familia y al director de curso (si están en mis contactos: la base de datos lo exige)
async function avisarSalida(f, est) {
  const [acus, contactos] = await Promise.all([E.db.select('acudientes', { eq: { estudiante_id: f.estudiante_id } }), E.db.rpc('mis_contactos', { p_colegio: E.colegio.id })]);
  const puedo = new Set(contactos.map((c) => c.perfil_id));
  const para = [...new Set([...acus.map((a) => a.acudiente_id), est?.curso?.director_id].filter((id) => id && puedo.has(id)))];
  if (!para.length) return;
  const [x] = await E.db.insert('mensajes', [{ colegio_id: E.colegio.id, autor_id: E.yo.id, asunto: `Permiso de salida — ${nombre(est?.p)}`, permite_respuesta: true,
    cuerpo: `${nombre(est?.p)}${est?.curso ? ' (' + est.curso.nombre + ')' : ''} fue autorizado(a) para salir del colegio hoy${f.hora ? ' a las ' + f.hora : ''}.\n\nMotivo: ${f.motivo}${f.observacion ? '\nDetalle: ' + f.observacion : ''}${f.recoge ? '\nLo recoge: ' + f.recoge : ''}\n\nAutorizó: ${nombre(E.yo)} (${E.rol === 'enfermeria' ? 'Enfermería' : 'Coordinación'}).` }]);
  await E.db.insert('mensaje_destinatarios', para.map((id) => ({ mensaje_id: x.id, colegio_id: E.colegio.id, perfil_id: id })));
}

// ---------------------------------------------------------------- Planeación para la familia (búsqueda)
export async function planeacionFamilia(m) {
  const b = await base();
  const ests = E.rol === 'estudiante' ? [E.yo.id] : [personaActiva()].filter((x) => x && x !== E.yo.id);
  const hijos = ests.length ? ests : await misEstudiantes();
  const mats = hijos.length ? (await E.db.select('matriculas', { in: { estudiante_id: hijos } })).filter((x) => x.estado === 'activa') : [];
  const cursos = new Set(mats.map((x) => x.curso_id));
  const asigs = b.asignaciones.filter((a) => cursos.has(a.curso_id));
  const plans = asigs.length ? (await E.db.select('planeaciones', { in: { asignacion_id: asigs.map((a) => a.id) }, order: 'semana_inicio desc' })).filter((x) => x.estado === 'aprobada') : [];
  await perfiles(plans.map((x) => x.profesor_id));
  const asigDe = (id) => b.asignacionPorId.get(id);
  m.innerHTML = cabecera('Planeación') + `
    <p class="ayuda">Lo que los profesores tienen planeado para cada materia, aprobado por coordinación.</p>
    ${plans.length ? `${buscar('Buscar por materia, tema o semana…')}<div class="lista">${plans.map((x) => {
      const a = asigDe(x.asignacion_id);
      const mat = b.materiaPorId.get(a?.materia_id)?.nombre || '';
      const cur = b.cursoPorId.get(a?.curso_id)?.nombre || '';
      const semana = x.semana_inicio ? `Semana del ${fecha(x.semana_inicio)}${x.semana_fin ? ' al ' + fecha(x.semana_fin) : ''}` : '';
      return `<div class="fila" data-buscar="${esc(mat + ' ' + cur + ' ' + x.titulo + ' ' + (x.descripcion || '') + ' ' + semana)}">
        <span class="avatar">📘</span>
        <span class="crece"><b>${esc(x.titulo)}</b><small>${esc(mat)} · ${esc(cur)}${semana ? ' · ' + esc(semana) : ''}</small>
          ${x.descripcion ? `<small>${esc(x.descripcion.slice(0, 220))}</small>` : ''}<small>${esc(nombre(E.perfiles.get(x.profesor_id)) || '')}</small></span>
        ${x.archivo_ruta ? `<button class="btn btn-chico" data-archivo="${esc(x.archivo_ruta)}" data-nombre="${esc(x.archivo_nombre || 'planeacion')}">📎 Ver</button>` : ''}
      </div>`;
    }).join('')}</div>` : vacio('Aún no hay planeaciones aprobadas para mostrar.')}`;
  conectarBuscador(m);
  m.querySelectorAll('[data-archivo]').forEach((bt) => (bt.onclick = async () => {
    const w = E.db.modo === 'demo' ? null : window.open('', '_blank');
    try {
      const url = await E.db.urlArchivo('planeaciones', bt.dataset.archivo);
      if (w) w.location = url; else { const el = document.createElement('a'); el.href = url; el.download = bt.dataset.nombre; document.body.appendChild(el); el.click(); el.remove(); }
    } catch (e) { w?.close(); aviso(e.message, 'error'); }
  }));
}
