// Asistente de mensajería (mapa COMPLEX.1: "formatos sugeridos: citaciones, reportes y mensajes predefinidos").
// El docente o el colegio elige un formato, llena 3 o 4 datos y el asunto y el cuerpo quedan escritos;
// si elige un estudiante, puede agregar a sus acudientes como destinatarios. Todo se puede corregir antes de enviar.
import { E } from '../estado.js';
import { esc, ventana, leerForm, nombre, nombreLista, fecha, hoy } from '../ui.js';

const firma = () => `\n\nCordialmente,\n${nombre(E.yo)}${E.colegio?.nombre ? '\n' + E.colegio.nombre : ''}`;
const fechaLarga = (d) => (d ? fecha(d) : '');
const conCurso = (v) => v.estudiante + (v.curso ? ` (${v.curso})` : '');

export const PLANTILLAS = [
  { id: 'citacion', icono: '📅', titulo: 'Citación a reunión', campos: ['estudiante', 'fecha', 'hora', 'lugar', 'motivo'],
    asunto: (v) => `Citación a reunión — ${v.estudiante}`,
    cuerpo: (v) => `Estimada familia de ${conCurso(v)}:\n\nLos citamos a una reunión el ${fechaLarga(v.fecha)}${v.hora ? ' a las ' + v.hora : ''}${v.lugar ? ' en ' + v.lugar : ''}${v.motivo ? ', para hablar sobre ' + v.motivo : ''}.\n\nPor favor confirmen su asistencia respondiendo este mensaje. Si no pueden asistir, propongan otra fecha.` + firma() },
  { id: 'academico', icono: '📚', titulo: 'Reporte académico', campos: ['estudiante', 'materia', 'detalle', 'recomendacion'],
    asunto: (v) => `Reporte académico — ${v.estudiante}${v.materia ? ' · ' + v.materia : ''}`,
    cuerpo: (v) => `Estimada familia de ${conCurso(v)}:\n\nQueremos contarles cómo va ${v.estudiante}${v.materia ? ' en ' + v.materia : ''}:\n\n${v.detalle || '…'}${v.recomendacion ? `\n\nLes recomendamos: ${v.recomendacion}` : ''}\n\nQuedamos atentos para acompañarlo(a) juntos.` + firma() },
  { id: 'convivencia', icono: '🤝', titulo: 'Reporte de convivencia', campos: ['estudiante', 'fecha', 'detalle', 'recomendacion'],
    asunto: (v) => `Reporte de convivencia — ${v.estudiante}`,
    cuerpo: (v) => `Estimada familia de ${conCurso(v)}:\n\nLes informamos una situación de convivencia ocurrida el ${fechaLarga(v.fecha)}:\n\n${v.detalle || '…'}\n\n${v.recomendacion ? `Acciones acordadas: ${v.recomendacion}\n\n` : ''}Les pedimos conversar en casa sobre lo ocurrido. Si desean, podemos acordar una reunión.` + firma() },
  { id: 'felicitacion', icono: '🌟', titulo: 'Felicitación', campos: ['estudiante', 'detalle'],
    asunto: (v) => `¡Felicitaciones! — ${v.estudiante}`,
    cuerpo: (v) => `Estimada familia de ${conCurso(v)}:\n\nQueremos felicitar a ${v.estudiante} ${v.detalle ? 'por ' + v.detalle : 'por su esfuerzo y su buen trabajo'}. ¡Es un orgullo verlo(a) crecer así!\n\nGracias por acompañarlo(a).` + firma() },
  { id: 'inasistencia', icono: '❌', titulo: 'Inasistencia', campos: ['estudiante', 'fecha', 'materia'],
    asunto: (v) => `Inasistencia — ${v.estudiante} · ${fechaLarga(v.fecha)}`,
    cuerpo: (v) => `Estimada familia de ${conCurso(v)}:\n\nLes informamos que ${v.estudiante} no asistió ${v.materia ? 'a la clase de ' + v.materia + ' ' : ''}el ${fechaLarga(v.fecha)}.\n\nSi hubo una razón (cita médica, enfermedad u otra), por favor envíen la excusa respondiendo este mensaje o desde "Ausencias" en la app.` + firma() },
  { id: 'tareas', icono: '📝', titulo: 'Tareas pendientes', campos: ['estudiante', 'materia', 'detalle', 'fecha_limite'],
    asunto: (v) => `Tareas pendientes — ${v.estudiante}${v.materia ? ' · ' + v.materia : ''}`,
    cuerpo: (v) => `Estimada familia de ${conCurso(v)}:\n\n${v.estudiante} tiene pendiente${v.materia ? ' en ' + v.materia : ''}:\n\n${v.detalle || '…'}${v.fecha_limite ? `\n\nPuede entregarlo hasta el ${fechaLarga(v.fecha_limite)}.` : ''}\n\nGracias por ayudarnos a que se ponga al día.` + firma() },
  { id: 'recordatorio', icono: '🔔', titulo: 'Recordatorio general', campos: ['tema', 'fecha', 'hora', 'detalle'], sinEstudiante: true,
    asunto: (v) => `Recordatorio: ${v.tema || 'actividad del colegio'}`,
    cuerpo: (v) => `Estimadas familias:\n\nLes recordamos ${v.tema ? v.tema.charAt(0).toLowerCase() + v.tema.slice(1) : 'la actividad'}${v.fecha ? ' el ' + fechaLarga(v.fecha) : ''}${v.hora ? ' a las ' + v.hora : ''}.${v.detalle ? '\n\n' + v.detalle : ''}` + firma() },
];

const CAMPO = {
  fecha: (v) => `<label>Fecha<input type="date" name="fecha" value="${hoy()}"></label>`,
  fecha_limite: () => '<label>Fecha límite (opcional)<input type="date" name="fecha_limite"></label>',
  hora: () => '<label>Hora<input type="time" name="hora"></label>',
  lugar: () => '<label>Lugar<input name="lugar" placeholder="Ej. Coordinación, sala de profesores"></label>',
  motivo: () => '<label>Motivo<input name="motivo" placeholder="Ej. su rendimiento en el periodo"></label>',
  materia: () => '<label>Materia (opcional)<input name="materia"></label>',
  detalle: () => '<label>Detalle<textarea name="detalle" rows="4"></textarea></label>',
  recomendacion: () => '<label>Recomendación o acuerdo (opcional)<textarea name="recomendacion" rows="2"></textarea></label>',
  tema: () => '<label>¿Qué se recuerda?<input name="tema" placeholder="Ej. La reunión de padres del primer periodo"></label>',
};

// Devuelve { asunto, cuerpo, para: [ids] } o null
export async function asistenteMensaje(contactos) {
  // estudiantes que puedo nombrar: los de mis contactos (y su curso, por el grupo "Curso 6A")
  const ests = new Map();
  for (const c of contactos) if (c.detalle === 'Estudiante' || c.grupo === 'Estudiantes') {
    const prev = ests.get(c.perfil_id);
    ests.set(c.perfil_id, { ...c, curso: prev?.curso || (c.grupo.startsWith('Curso ') ? c.grupo.slice(6) : '') });
  }
  const listaEst = [...ests.values()].sort((a, b) => nombreLista(a).localeCompare(nombreLista(b)));
  const elegida = await ventana({
    titulo: '🪄 Asistente de mensajes',
    html: `<p class="ayuda">Elige un formato. Luego llenas unos datos y el mensaje queda escrito; puedes corregirlo antes de enviar.</p>
      <div class="lista">${PLANTILLAS.map((p) => `<button class="fila fila-boton" data-pl="${p.id}"><span class="avatar">${p.icono}</span><span class="crece"><b>${esc(p.titulo)}</b></span><span class="flecha">›</span></button>`).join('')}</div>`,
    alAbrir: (caja, cerrar) => caja.querySelectorAll('[data-pl]').forEach((b) => (b.onclick = () => cerrar(b.dataset.pl))),
  });
  const pl = PLANTILLAS.find((p) => p.id === elegida);
  if (!pl) return null;
  const conEst = !pl.sinEstudiante;
  return ventana({
    titulo: `${pl.icono} ${pl.titulo}`,
    html: `<div class="form">
      ${conEst ? (listaEst.length
        ? `<label>Estudiante<select name="estudiante_id"><option value="">Elige…</option>${listaEst.map((e) => `<option value="${e.perfil_id}">${esc(nombreLista(e))}${e.curso ? ' · ' + esc(e.curso) : ''}</option>`).join('')}</select></label>
           <label class="check"><input type="checkbox" name="a_acudientes" checked> Enviar a sus acudientes</label>`
        : '<label>Nombre del estudiante<input name="estudiante_libre"></label>') : ''}
      ${pl.campos.filter((c) => c !== 'estudiante').map((c) => CAMPO[c]()).join('')}
    </div>`,
    botones: [{ texto: 'Cancelar' }, { texto: 'Escribir mensaje', antes: async (caja) => {
      const v = leerForm(caja);
      let para = [];
      if (conEst) {
        const e = v.estudiante_id && ests.get(v.estudiante_id);
        if (listaEst.length && !e) throw new Error('Elige el estudiante.');
        v.estudiante = e ? nombre(e) : v.estudiante_libre || 'el estudiante';
        v.curso = e?.curso || '';
        if (e && v.a_acudientes) {
          const acus = await E.db.select('acudientes', { eq: { estudiante_id: e.perfil_id } }).catch(() => []);
          const puedo = new Set(contactos.map((c) => c.perfil_id));
          para = acus.map((a) => a.acudiente_id).filter((id) => puedo.has(id));
        }
      }
      return { asunto: pl.asunto(v), cuerpo: pl.cuerpo(v), para };
    } }],
  });
}
