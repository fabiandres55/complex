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
// Con EXPERIENCIAS (Phidias: Criterio → Experiencias → Actividades): el criterio = promedio ponderado
// (por el % de cada experiencia) de sus experiencias con nota; cada experiencia = promedio de sus actividades.
// Las actividades del criterio que no tienen experiencia forman un grupo aparte sin peso propio.
function promedioPonderado(pares) {
  const con = pares.filter(([v]) => v != null);
  if (!con.length) return null;
  const pesos = con.reduce((t, [, w]) => t + (w > 0 ? w : 0), 0);
  if (pesos > 0) return con.filter(([, w]) => w > 0).reduce((t, [v, w]) => t + v * w, 0) / pesos;
  return con.reduce((t, [v]) => t + v, 0) / con.length;
}
export function notaExperiencia(exp, actividades, notasPorActividad) {
  return notaPeriodo(actividades.filter((a) => a.experiencia_id === exp.id), notasPorActividad);
}
export function notaIndicador(ind, actividades, notasPorActividad, experiencias = []) {
  const delInd = actividades.filter((a) => a.indicador_id === ind.id);
  const exps = (experiencias || []).filter((x) => x.indicador_id === ind.id);
  if (!exps.length) return notaPeriodo(delInd, notasPorActividad);
  const pares = exps.map((x) => [notaExperiencia(x, delInd, notasPorActividad), Number(x.porcentaje) || 0]);
  const sueltas = delInd.filter((a) => !a.experiencia_id);
  if (sueltas.length) pares.push([notaPeriodo(sueltas, notasPorActividad), 0]);
  return promedioPonderado(pares);
}
export function notaConIndicadores(indicadores, actividades, notasPorActividad, experiencias = []) {
  if (!indicadores?.length) return notaPeriodo(actividades, notasPorActividad);
  let suma = 0, pesos = 0; const simples = [];
  for (const ind of indicadores) {
    const v = notaIndicador(ind, actividades, notasPorActividad, experiencias);
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

// Estadísticas de una actividad (como Phidias): evaluados, perdidos (< nota de aprobación), promedio y desviación.
export function estadisticas(valores, colegio) {
  const v = valores.filter((x) => x != null).map(Number);
  const ap = Number(colegio?.nota_aprobacion ?? 3);
  if (!v.length) return { n: 0, perdidos: 0, promedio: null, desv: null };
  const prom = v.reduce((t, x) => t + x, 0) / v.length;
  const desv = Math.sqrt(v.reduce((t, x) => t + (x - prom) ** 2, 0) / v.length);
  return { n: v.length, perdidos: v.filter((x) => redondear(x, colegio?.decimales ?? 1) < ap).length, promedio: prom, desv };
}

// Escala cualitativa del colegio (S/A/BS/BJ…): cada sigla tiene su valor numérico
export const escalaCualitativa = (colegio) => colegio?.escala_tipo === 'cualitativa' && Array.isArray(colegio?.escala) && colegio.escala.length ? colegio.escala : null;
// Sigla para un valor: la de valor más cercano
// Con "desde" (rango de cada sigla): la sigla de mayor "desde" que no supere la nota. Sin "desde": la de valor más cercano.
export function siglaDe(valor, colegio) {
  const esc = escalaCualitativa(colegio);
  if (!esc || valor == null) return null;
  if (esc.every((x) => x.desde != null && x.desde !== '')) {
    const v = redondear(valor, colegio?.decimales ?? 1);
    const orden = [...esc].sort((x, y) => Number(y.desde) - Number(x.desde));
    return orden.find((x) => v >= Number(x.desde)) || orden.at(-1);
  }
  return [...esc].sort((x, y) => Math.abs(x.valor - valor) - Math.abs(y.valor - valor))[0];
}

// Ventanas de fechas del colegio (Phidias: "Fechas importantes"). Sin fechas = siempre abierta.
// hoy: 'AAAA-MM-DD' (fecha local). Devuelve { abierta, texto }.
export function enVentana(desde, hasta, hoy) {
  const abierta = (!desde || hoy >= desde) && (!hasta || hoy <= hasta);
  const f = (x) => x.split('-').reverse().join('/');
  const texto = !desde && !hasta ? 'Sin límite de fechas' : desde && hasta ? `del ${f(desde)} al ${f(hasta)}` : desde ? `desde el ${f(desde)}` : `hasta el ${f(hasta)}`;
  return { abierta, texto, definida: !!(desde || hasta) };
}

// Para mostrar (no para campos de edición): la sigla si el colegio usa escala cualitativa; si no, el número.
export const verNotaEscala = (v, colegio) => (v == null ? '—' : escalaCualitativa(colegio) ? siglaDe(v, colegio)?.sigla ?? mostrarNota(v, colegio) : mostrarNota(v, colegio));
