// Cálculo de notas y desempeños (escala configurable por colegio).

export function redondear(v, dec = 1) {
  if (v == null || Number.isNaN(v)) return null;
  const f = 10 ** dec;
  return Math.round((v + Number.EPSILON) * f) / f;
}

export const mostrarNota = (v, colegio) => (v == null ? '—' : redondear(v, colegio?.decimales ?? 1).toFixed(colegio?.decimales ?? 1));

// Nota de un periodo: promedio ponderado por el % de cada actividad,
// usando solo las actividades que ya tienen nota (se normaliza por la suma de %).
// Si ninguna actividad tiene %, se usa promedio simple.
export function notaPeriodo(actividades, notasPorActividad) {
  let suma = 0, pesos = 0, simples = [];
  for (const a of actividades) {
    const v = notasPorActividad[a.id];
    if (v == null) continue;
    simples.push(v);
    const p = Number(a.porcentaje) || 0;
    suma += v * p;
    pesos += p;
  }
  if (!simples.length) return null;
  if (pesos > 0) return suma / pesos;
  return simples.reduce((x, y) => x + y, 0) / simples.length;
}

// Nota de un indicador / de un periodo con indicadores (REA Phidias):
// cada indicador = promedio ponderado de sus actividades; el periodo = promedio ponderado
// (peso del indicador; si ninguno tiene peso, simple) de los indicadores con nota.
// Si la materia no tiene indicadores en el periodo, se usa notaPeriodo() con todas las actividades.
export function notaIndicador(ind, actividades, notasPorActividad) {
  return notaPeriodo(actividades.filter((a) => a.indicador_id === ind.id), notasPorActividad);
}
export function notaConIndicadores(indicadores, actividades, notasPorActividad) {
  if (!indicadores?.length) return notaPeriodo(actividades, notasPorActividad);
  let suma = 0, pesos = 0; const simples = [];
  for (const ind of indicadores) {
    const v = notaIndicador(ind, actividades, notasPorActividad);
    if (v == null) continue;
    simples.push(v);
    const w = Number(ind.peso) || 0;
    suma += v * w; pesos += w;
  }
  if (!simples.length) return null;
  return pesos > 0 ? suma / pesos : simples.reduce((x, y) => x + y, 0) / simples.length;
}
// Definitiva con recuperación: si hay recuperación, queda la mayor de las dos.
export function definitiva(base, recuperacion) {
  if (recuperacion == null) return { valor: base, recuperada: false };
  const r = Number(recuperacion);
  return base == null || r > base ? { valor: r, recuperada: true } : { valor: base, recuperada: false };
}

// Nota del año: promedio ponderado por el peso de cada periodo que tenga nota.
export function notaFinal(periodos, notaPorPeriodo) {
  let suma = 0, pesos = 0;
  for (const p of periodos) {
    const v = notaPorPeriodo[p.id];
    if (v == null) continue;
    const w = p.peso == null ? 1 : Number(p.peso);
    if (!(w > 0)) continue;
    suma += v * w;
    pesos += w;
  }
  return pesos ? suma / pesos : null;
}

// Desempeño (escala nacional, Decreto 1290): Bajo / Básico / Alto / Superior.
// Con la escala 1.0–5.0 y aprobación 3.0 queda: Bajo < 3.0, Básico 3.0–3.9, Alto 4.0–4.5, Superior 4.6–5.0.
export function desempeno(v, colegio) {
  if (v == null) return { nombre: 'Sin nota', clase: 'sin' };
  const min = Number(colegio?.nota_min ?? 1), max = Number(colegio?.nota_max ?? 5), ap = Number(colegio?.nota_aprobacion ?? 3);
  const r = redondear(v, colegio?.decimales ?? 1);
  const tramo = max - ap;
  if (r < ap) return { nombre: 'Bajo', clase: 'bajo' };
  if (r < ap + tramo * 0.5) return { nombre: 'Básico', clase: 'basico' };
  if (r < ap + tramo * 0.8) return { nombre: 'Alto', clase: 'alto' };
  return { nombre: 'Superior', clase: 'superior' };
}

export const sumaPorcentajes = (acts) => acts.reduce((s, a) => s + (Number(a.porcentaje) || 0), 0);

export function resumenAsistencia(filas) {
  const r = { presente: 0, ausente: 0, tarde: 0, excusa: 0, total: filas.length };
  for (const f of filas) r[f.estado] = (r[f.estado] || 0) + 1;
  return r;
}
