// "Destinos" de la planilla de una clase y periodo: dónde puede contar una actividad
// (el periodo si no hay criterios; un criterio sin experiencias; o una experiencia), con lo que ya suma cada uno.
// Lo usan las tareas y los exámenes para crear su actividad en la planilla (REA Phidias).
import { E } from '../estado.js';

const r2 = (v) => Math.round(v * 100) / 100;

export async function destinosDe(asigId, periodoId) {
  const [acts, inds] = await Promise.all([
    E.db.select('actividades', { eq: { asignacion_id: asigId, periodo_id: periodoId } }),
    E.db.select('indicadores', { eq: { asignacion_id: asigId, periodo_id: periodoId }, order: 'numero' }),
  ]);
  const exps = inds.length ? (await E.db.select('experiencias', { in: { indicador_id: inds.map((x) => x.id) } })).sort((x, y) => x.numero - y.numero) : [];
  const destinos = !inds.length ? [{ k: 'p', t: 'Periodo (sin criterios)' }] : inds.flatMap((ind) => {
    const xs = exps.filter((x) => x.indicador_id === ind.id);
    return xs.length ? xs.map((x) => ({ k: 'e:' + x.id, t: `I${ind.numero} · ${x.nombre} (${Number(x.porcentaje)}%)`, ind, exp: x }))
      : [{ k: 'i:' + ind.id, t: `I${ind.numero} · ${ind.dimension}`, ind }];
  });
  const destinoDe = (a) => (a.experiencia_id ? 'e:' + a.experiencia_id : inds.length ? (a.indicador_id ? 'i:' + a.indicador_id : '') : 'p');
  const suma = (k, excluir = null) => r2(acts.filter((a) => a.id !== excluir && destinoDe(a) === k).reduce((t, a) => t + (Number(a.porcentaje) || 0), 0));
  for (const d of destinos) d.disponible = Math.max(0, r2(100 - suma(d.k)));
  return { destinos, suma, acts };
}

// Crea la actividad de la planilla en un destino (devuelve su id)
export async function crearActividad({ asigId, periodoId, k, destinos, nombre, porcentaje, fecha }) {
  const d = destinos.find((x) => x.k === k);
  if (!d) return null;
  if (porcentaje > d.disponible) throw new Error(d.disponible === 0 ? `En ${d.t} las actividades ya suman 100%. Baja el % de otra actividad o elige otro destino.` : `En ${d.t} solo quedan ${d.disponible}% disponibles.`);
  const [a] = await E.db.insert('actividades', [{ colegio_id: E.colegio.id, asignacion_id: asigId, periodo_id: periodoId, nombre, porcentaje, fecha: fecha || null,
    indicador_id: d.ind?.id || null, experiencia_id: d.exp?.id || null }]);
  return a.id;
}

// Otros grupos del mismo curso (grado) y materia que también dicto yo (o todos, si soy admin)
export function gruposHermanos(b, asig) {
  const grado = b.cursoPorId.get(asig.curso_id)?.grado_id;
  return b.asignaciones.filter((x) => x.id !== asig.id && x.materia_id === asig.materia_id && b.cursoPorId.get(x.curso_id)?.grado_id === grado
    && (E.rol === 'admin' || x.profesor_id === E.yo.id));
}
