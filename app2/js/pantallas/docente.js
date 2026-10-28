// Ficha del docente (mapa COMPLEX.1 §2: "Inf docentes"; §5: Enfermería ve la información de los docentes).
// Datos de contacto, dirección de grupo, clases con el avance de notas del periodo, horario de la
// semana y planeaciones por estado. La ven el admin, el director de sección (sus cursos) y Enfermería
// (solo contacto, clases y horario). Lo que llega lo decide la base de datos (RLS).
import { E, base, perfiles, fotos } from '../estado.js';
import { esc, nombre, nombreLista, vacio, avatarHTML } from '../ui.js';
import { cabecera, buscar, conectarBuscador } from './comun.js';
import { cursosSeccion } from './enfermeria.js';

const DIAS = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const hora = (h) => String(h || '').slice(0, 5);
export const puedeVerDocentes = () => ['admin', 'director_seccion', 'enfermeria'].includes(E.rol);

export async function ficha(m, p) {
  if (!puedeVerDocentes()) { m.innerHTML = vacio('No tienes acceso a la ficha de los docentes.'); return; }
  const b = await base();
  const id = p.id;
  await perfiles([id]);
  const doc = E.perfiles.get(id);
  if (!doc) { m.innerHTML = vacio('Esa persona no existe o no tienes acceso.'); return; }
  const completo = E.rol !== 'enfermeria';
  // el director de sección: solo las clases de los cursos de su sección
  const cursosVisibles = E.rol === 'director_seccion' ? new Set(cursosSeccion(b).map((c) => c.id)) : null;
  const asigs = b.asignaciones.filter((a) => a.profesor_id === id && (!cursosVisibles || cursosVisibles.has(a.curso_id)))
    .sort((x, z) => (b.cursoPorId.get(x.curso_id)?.nombre || '').localeCompare(b.cursoPorId.get(z.curso_id)?.nombre || '') || (b.materiaPorId.get(x.materia_id)?.nombre || '').localeCompare(b.materiaPorId.get(z.materia_id)?.nombre || ''));
  const dirige = b.cursos.filter((c) => c.director_id === id);
  const per = b.periodos.find((x) => !x.cerrado) || b.periodos.at(-1);
  const ids = asigs.map((a) => a.id);
  const [bloques, acts, plans, mats, fot] = await Promise.all([
    ids.length ? E.db.select('horario_bloques', { in: { asignacion_id: ids } }).catch(() => []) : [],
    completo && per && ids.length ? E.db.select('actividades', { in: { asignacion_id: ids }, eq: { periodo_id: per.id } }).catch(() => []) : [],
    completo ? E.db.select('planeaciones', { eq: { colegio_id: E.colegio.id, profesor_id: id } }).catch(() => []) : [],
    completo && ids.length ? E.db.select('matriculas', { in: { curso_id: [...new Set(asigs.map((a) => a.curso_id))] } }).catch(() => []) : [],
    fotos([id]),
  ]);
  const notas = completo && acts.length ? await E.db.select('calificaciones', { in: { actividad_id: acts.map((a) => a.id) } }).catch(() => []) : [];
  const nEst = (cursoId) => mats.filter((x) => x.curso_id === cursoId && x.estado === 'activa').length;
  const avance = (a) => {
    const ac = acts.filter((x) => x.asignacion_id === a.id && !x.opcional);
    const esperadas = ac.length * nEst(a.curso_id);
    const cargadas = notas.filter((n) => ac.some((x) => x.id === n.actividad_id)).length;
    return { acts: ac.length, pct: esperadas ? Math.min(100, Math.round((cargadas * 100) / esperadas)) : 0 };
  };
  const plan = (e) => plans.filter((x) => x.estado === e && (!cursosVisibles || ids.includes(x.asignacion_id))).length;
  const horas = bloques.reduce((s, x) => s + Math.max(0, (Date.parse('1970-01-01T' + hora(x.hora_fin)) - Date.parse('1970-01-01T' + hora(x.hora_inicio))) / 3600000), 0);
  const etiqueta = (a) => `${b.materiaPorId.get(a.materia_id)?.nombre || ''} · ${b.cursoPorId.get(a.curso_id)?.nombre || ''}`;

  m.innerHTML = cabecera('Ficha del docente', { volver: E.rol === 'admin' ? '#/personas?tab=profesor' : '#/inicio' }) + `
    <section class="tarjeta">
      <div class="fila">${avatarHTML(doc, fot.get(id), 'grande')}<span class="crece"><b>${esc(nombre(doc))}</b>
        <small>${esc([doc.correo && !doc.correo.endsWith('@usuarios.complex') ? doc.correo : '', doc.telefono].filter(Boolean).join(' · ') || 'Sin datos de contacto')}</small></span></div>
      <div class="cifras pequenas">
        <span class="cifra"><b>${asigs.length}</b><span>Clases</span></span>
        <span class="cifra"><b>${new Set(asigs.map((a) => a.curso_id)).size}</b><span>Cursos</span></span>
        <span class="cifra"><b>${Math.round(horas * 10) / 10}</b><span>Horas por semana</span></span>
        ${dirige.length ? `<span class="cifra"><b>${esc(dirige.map((c) => c.nombre).join(', '))}</b><span>Director(a) de grupo</span></span>` : ''}
      </div>
    </section>
    <section class="tarjeta"><h2>Clases${completo && per ? ` · avance de notas en ${esc(per.nombre)}` : ''}</h2>
      ${asigs.length ? `<div class="lista">${asigs.map((a) => {
        const av = completo ? avance(a) : null;
        return `<div class="fila"><span class="crece"><b>${esc(etiqueta(a))}</b>${av ? `<small>${av.acts} actividades · ${nEst(a.curso_id)} estudiantes</small>` : ''}</span>
          ${av ? `<span class="avance-docente"><span class="barra-avance"><span style="width:${av.pct}%" class="${av.pct < 60 ? 'baja' : ''}"></span></span><small>${av.pct}%</small></span>` : ''}
          ${E.rol === 'admin' ? `<a class="btn btn-chico" href="#/grupo/${a.id}">Abrir</a>` : ''}</div>`;
      }).join('')}</div>` : vacio('No tiene clases asignadas este año.')}
    </section>
    <section class="tarjeta"><h2>Horario de la semana</h2>
      ${bloques.length ? `<div class="horario-docente">${[1, 2, 3, 4, 5, 6].filter((d) => bloques.some((x) => x.dia === d)).map((d) => `
        <div><h3 class="sub">${DIAS[d]}</h3>${bloques.filter((x) => x.dia === d).sort((x, z) => (x.hora_inicio > z.hora_inicio ? 1 : -1)).map((x) => {
          const a = b.asignacionPorId.get(x.asignacion_id);
          return `<p><b>${hora(x.hora_inicio)}–${hora(x.hora_fin)}</b> ${esc(a ? etiqueta(a) : x.titulo || '')}${x.aula ? ` <small>(${esc(x.aula)})</small>` : ''}</p>`;
        }).join('')}</div>`).join('')}</div>` : '<p class="ayuda">Aún no tiene horario publicado.</p>'}
    </section>
    ${completo ? `<section class="tarjeta"><h2>Planeaciones</h2>
      <div class="cifras pequenas">
        <span class="cifra"><b>${plan('enviada')}</b><span>Por revisar</span></span>
        <span class="cifra"><b class="${plan('devuelta') ? 'alerta' : ''}">${plan('devuelta')}</b><span>Devueltas</span></span>
        <span class="cifra"><b>${plan('aprobada')}</b><span>Aprobadas</span></span>
      </div>
      <p><a class="btn btn-chico" href="#/planeaciones">Ir a planeaciones</a></p></section>` : ''}`;
}

// Lista de docentes: el admin la tiene en Personas; Enfermería y el director de sección, desde sus contactos
export async function lista(m) {
  if (!puedeVerDocentes()) { m.innerHTML = vacio('No tienes acceso a la lista de docentes.'); return; }
  const contactos = await E.db.rpc('mis_contactos', { p_colegio: E.colegio.id });
  const docs = [...new Map(contactos.filter((c) => c.grupo === 'Profesores').map((c) => [c.perfil_id, c])).values()]
    .sort((x, z) => nombreLista(x).localeCompare(nombreLista(z)));
  const fot = await fotos(docs.map((d) => d.perfil_id));
  m.innerHTML = cabecera('Docentes') + `<div class="contenido">
    ${docs.length ? `${buscar('Buscar docente…')}<div class="lista">${docs.map((d) => `<a class="fila fila-boton" href="#/docente/${d.perfil_id}" data-buscar="${esc(nombreLista(d))}">
      ${avatarHTML(d, fot.get(d.perfil_id))}<span class="crece"><b>${esc(nombreLista(d))}</b></span><span class="flecha">›</span></a>`).join('')}</div>` : vacio('No hay docentes en tus contactos.')}
  </div>`;
  conectarBuscador(m);
}
