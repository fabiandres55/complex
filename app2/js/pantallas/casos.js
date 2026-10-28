// "Avisar caso preocupante" (mapa COMPLEX.1 §3: Clases → avisar casos preocupantes).
// Desde la clase, el docente reporta a un estudiante en un toque: queda en el observador como
// "Caso preocupante" (solo para el colegio) y sale un mensaje al director(a) de curso y a
// coordinación (y a Enfermería si es de salud). Solo se avisa a quien está en mis contactos:
// la base de datos lo exige para los mensajes.
import { E, base, perfiles } from '../estado.js';
import { esc, aviso, ventana, leerForm, nombre, nombreLista } from '../ui.js';

export const MOTIVOS_CASO = ['Académico', 'Emocional o de ánimo', 'Convivencia', 'Salud', 'Asistencia', 'Familiar', 'Otro'];

export async function avisarCaso(asigId) {
  const b = await base();
  const a = b.asignacionPorId.get(asigId);
  const cu = a && b.cursoPorId.get(a.curso_id);
  if (!cu) return aviso('Esa clase no existe.', 'error');
  const mats = (await E.db.select('matriculas', { eq: { curso_id: cu.id } })).filter((x) => x.estado === 'activa');
  await perfiles(mats.map((x) => x.estudiante_id));
  const ests = mats.map((x) => E.perfiles.get(x.estudiante_id)).filter(Boolean).sort((x, y) => nombreLista(x).localeCompare(nombreLista(y)));
  if (!ests.length) return aviso('Este curso no tiene estudiantes.', 'error');
  const materia = b.materiaPorId.get(a.materia_id)?.nombre || '';
  const r = await ventana({
    titulo: '🚩 Avisar caso preocupante',
    html: `<div class="form">
      <label>Estudiante<select name="estudiante_id"><option value="">Elige…</option>${ests.map((e) => `<option value="${e.id}">${esc(nombreLista(e))}</option>`).join('')}</select></label>
      <label>Motivo<select name="motivo">${MOTIVOS_CASO.map((x) => `<option>${esc(x)}</option>`).join('')}</select></label>
      <label>¿Qué está pasando?<textarea name="descripcion" rows="5" placeholder="Describe lo que observaste, desde cuándo y qué has hecho."></textarea></label>
      <label class="check"><input type="checkbox" name="urgente"> ⚠️ Es urgente (requiere atención hoy)</label>
      <p class="ayuda">Queda en el observador del estudiante como "Caso preocupante", solo visible para el colegio, y avisa al director(a) de curso y a coordinación. Si el motivo es de salud, también a Enfermería.</p>
    </div>`,
    botones: [{ texto: 'Cancelar' }, { texto: 'Avisar', antes: async (caja) => {
      const d = leerForm(caja);
      if (!d.estudiante_id) throw new Error('Elige el estudiante.');
      if (!d.descripcion?.trim()) throw new Error('Cuenta qué está pasando.');
      const est = E.perfiles.get(d.estudiante_id);
      const texto = `${d.urgente ? '[URGENTE] ' : ''}[${d.motivo}] ${d.descripcion.trim()}`;
      await E.db.insert('observaciones', [{ colegio_id: E.colegio.id, estudiante_id: d.estudiante_id, autor_id: E.yo.id, tipo: 'seguimiento', categoria: 'Caso preocupante', fecha: new Date().toISOString().slice(0, 10), descripcion: texto, visible_acudiente: false }]);
      const avisados = await avisar({ est, cu, materia, motivo: d.motivo, urgente: d.urgente, descripcion: d.descripcion.trim() });
      return { avisados };
    } }],
  });
  if (r) aviso(r.avisados ? `🚩 Caso registrado y avisado a ${r.avisados} persona(s)` : '🚩 Caso registrado en el observador (no había a quién avisar por mensaje)');
}

async function avisar({ est, cu, materia, motivo, urgente, descripcion }) {
  const contactos = await E.db.rpc('mis_contactos', { p_colegio: E.colegio.id });
  const puedo = new Set(contactos.map((c) => c.perfil_id));
  const grupo = (g) => contactos.filter((c) => c.grupo === g).map((c) => c.perfil_id);
  const para = [...new Set([cu.director_id, ...grupo('Administración'), ...(motivo === 'Salud' ? grupo('Enfermería') : [])].filter((id) => id && id !== E.yo.id && puedo.has(id)))];
  if (!para.length) return 0;
  const [x] = await E.db.insert('mensajes', [{
    colegio_id: E.colegio.id, autor_id: E.yo.id, permite_respuesta: true, ocultar_destinatarios: false,
    asunto: `🚩 ${urgente ? 'URGENTE · ' : ''}Caso preocupante — ${nombre(est)} (${cu.nombre})`,
    cuerpo: `${nombre(est)}, del curso ${cu.nombre}${materia ? `, en la clase de ${materia}` : ''}.\n\nMotivo: ${motivo}${urgente ? ' (urgente)' : ''}\n\n${descripcion}\n\nReporta: ${nombre(E.yo)}. Quedó registrado en el observador del estudiante como "Caso preocupante" (solo lo ve el colegio).`,
  }]);
  await E.db.insert('mensaje_destinatarios', para.map((id) => ({ mensaje_id: x.id, colegio_id: E.colegio.id, perfil_id: id })));
  return para.length;
}
