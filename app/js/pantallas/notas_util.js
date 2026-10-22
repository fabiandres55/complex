// Cálculo de las notas de una materia (asignación) para todos sus estudiantes:
// definitiva por periodo (con recuperación), acumulado del año y definitiva final con remedial.
import { E } from '../estado.js';
import { notaConIndicadores, definitiva, notaFinal } from '../calculos.js';

export async function notasDeAsignacion(asig, periodos, estIds) {
  const [acts, inds, recs, rems] = await Promise.all([
    E.db.select('actividades', { eq: { asignacion_id: asig.id } }),
    E.db.select('indicadores', { eq: { asignacion_id: asig.id } }),
    E.db.select('recuperaciones', { eq: { asignacion_id: asig.id } }),
    E.db.select('remediales', { eq: { asignacion_id: asig.id } }).catch(() => []),
  ]);
  const [exps, cal] = await Promise.all([
    inds.length ? E.db.select('experiencias', { in: { indicador_id: inds.map((x) => x.id) } }) : [],
    acts.length ? E.db.select('calificaciones', { in: { actividad_id: acts.map((a) => a.id) } }) : [],
  ]);
  const nota = new Map(cal.map((c) => [c.actividad_id + '|' + c.estudiante_id, c.valor]));
  const res = new Map();
  for (const est of estIds) {
    const porPeriodo = {}, recuperada = {};
    for (const per of periodos) {
      const a = acts.filter((x) => x.periodo_id === per.id);
      const mias = Object.fromEntries(a.map((x) => [x.id, nota.get(x.id + '|' + est) ?? null]));
      const d = definitiva(notaConIndicadores(inds.filter((x) => x.periodo_id === per.id), a, mias, exps), recs.find((r) => r.periodo_id === per.id && r.estudiante_id === est)?.nota);
      porPeriodo[per.id] = d.valor; recuperada[per.id] = d.recuperada;
    }
    const final0 = notaFinal(periodos, porPeriodo);
    const rem = rems.find((r) => r.estudiante_id === est);
    const conRem = rem && (final0 == null || Number(rem.nota) > final0);
    res.set(est, { porPeriodo, recuperada, final0, remedial: rem?.nota ?? null, final: conRem ? Number(rem.nota) : final0, conRemedial: !!conRem });
  }
  return res;
}
