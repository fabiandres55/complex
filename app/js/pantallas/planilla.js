// Planilla de notas (REA del perfil docente de Phidias, 2026-10-21):
//   CRITERIO (indicador; lo define coordinación) → EXPERIENCIAS (las arma el docente) → ACTIVIDADES.
// Regla de Fabio: todo suma 100 % (criterios en el periodo, experiencias en su criterio, actividades en su experiencia).
// Una actividad puede contar en varios criterios: al crearla se marca "Contar también en…" y se crea una copia en cada uno.
// Actividad opcional (si no tiene nota no cuenta) y privada (no la ven las familias).
// Escala numérica o cualitativa (S/A/BS/BJ…) según el colegio. Estadísticas por actividad.
import { E, base, pref } from '../estado.js';
import { esc, aviso, ventana, leerForm, confirmar, nombre, nombreLista, vacio, fecha, hoy } from '../ui.js';
import { cabecera, camposHTML, editar } from './comun.js';
import { etiquetaAsig, estudiantesDe, DIMENSIONES, MENCIONES } from './profesor.js';
import { notaConIndicadores, definitiva, mostrarNota, desempeno, redondear, estadisticas, escalaCualitativa, siglaDe, enVentana } from '../calculos.js';

const r2 = (v) => Math.round(v * 100) / 100;
const num = (s) => Number(String(s ?? '').replace(',', '.'));
const faltaSobra = (t) => (t < 100 ? `faltan ${r2(100 - t)}%` : `sobran ${r2(t - 100)}%`);

export async function planilla(m, p) {
  const b = await base();
  const asig = b.asignacionPorId.get(p.asig);
  if (!asig) { m.innerHTML = vacio('Esa clase no existe.'); return; }
  if (!b.periodos.length) { m.innerHTML = cabecera(esc(etiquetaAsig(b, asig)), { volver: '#/clases' }) + vacio('El colegio aún no ha creado los periodos del año.'); return; }
  const clave = 'periodo_' + asig.id;
  const per = b.periodos.find((x) => x.id === (p.periodo || pref(clave))) || b.periodos.find((x) => !x.cerrado) || b.periodos[0];
  pref(clave, per.id);
  const esAdmin = E.rol === 'admin';
  const puedeEditar = (!per.cerrado && asig.profesor_id === E.yo.id) || esAdmin;
  // Fechas importantes del periodo: fuera de la ventana el profesor no registra (el admin sí)
  const hoyL = hoy();
  const vNotas = enVentana(per.notas_desde, per.notas_hasta, hoyL);
  const vObs = enVentana(per.obs_desde, per.obs_hasta, hoyL);
  const vPlan = enVentana(per.plan_desde, per.plan_hasta, hoyL);
  const vRecup = enVentana(per.recup_desde, per.recup_hasta, hoyL);
  const vRem = enVentana(b.anio?.remedial_desde, b.anio?.remedial_hasta, hoyL);
  const puedeNotas = esAdmin || (puedeEditar && vNotas.abierta);
  const puedeRecup = esAdmin || (puedeEditar && vRecup.abierta);
  const filaFecha = (t, v) => `<tr><th>${t}</th><td>${v.texto}</td><td>${v.definida ? (v.abierta ? '<span class="chip ok">Abierto</span>' : '<span class="chip">Cerrado</span>') : ''}</td></tr>`;
  const fechasHTML = `<details class="tarjeta fechas-importantes" ${!esAdmin && (!vNotas.abierta || !vRecup.abierta) ? 'open' : ''}><summary><b>📅 Fechas importantes para ${esc(per.nombre)}</b>${!esAdmin && !vNotas.abierta ? ' <span class="chip">Registro de notas cerrado</span>' : ''}</summary>
    <table class="tabla"><tbody>${filaFecha('Registro de notas', vNotas)}${filaFecha('Registro de observaciones', vObs)}${filaFecha('Modificación de planeaciones', vPlan)}${filaFecha('Registro de recuperaciones', vRecup)}${filaFecha('Registro de remediales (año)', vRem.definida ? vRem : { texto: 'No se han definido fechas', definida: false })}</tbody></table>
    ${esAdmin ? '<p class="ayuda">Se cambian en Colegio → Estructura → Año y periodos.</p>' : ''}</details>`;

  const [ests, acts0, inds, recs] = await Promise.all([
    estudiantesDe(asig),
    E.db.select('actividades', { eq: { asignacion_id: asig.id, periodo_id: per.id }, order: ['fecha', 'nombre'] }),
    E.db.select('indicadores', { eq: { asignacion_id: asig.id, periodo_id: per.id }, order: 'numero' }),
    E.db.select('recuperaciones', { eq: { asignacion_id: asig.id, periodo_id: per.id } }),
  ]);
  // experiencias y notas a la vez (las dos solo dependen de lo anterior)
  const [exps0, notas] = await Promise.all([
    inds.length ? E.db.select('experiencias', { in: { indicador_id: inds.map((x) => x.id) } }) : [],
    acts0.length ? E.db.select('calificaciones', { in: { actividad_id: acts0.map((a) => a.id) } }) : [],
  ]);
  const exps = [...exps0].sort((x, y) => x.numero - y.numero);
  const expsDe = (indId) => exps.filter((x) => x.indicador_id === indId);
  const ordenInd = new Map(inds.map((x, i) => [x.id, i]));
  const ordenExp = new Map(exps.map((x, i) => [x.id, i]));
  // columnas: criterio → experiencia → fecha
  const acts = [...acts0].sort((a, z) => (ordenInd.get(a.indicador_id) ?? 999) - (ordenInd.get(z.indicador_id) ?? 999)
    || (ordenExp.get(a.experiencia_id) ?? 999) - (ordenExp.get(z.experiencia_id) ?? 999));
  const nota = new Map(notas.map((n) => [n.actividad_id + '|' + n.estudiante_id, n.valor]));
  const rec = new Map(recs.map((r) => [r.estudiante_id, r.nota]));
  const col = E.colegio;
  const escala = escalaCualitativa(col);

  // ---- "Destinos" donde puede ir una actividad: el periodo (sin criterios), un criterio sin experiencias, o una experiencia
  const destinos = !inds.length ? [{ k: 'p', t: 'Periodo' }] : inds.flatMap((ind) => {
    const xs = expsDe(ind.id);
    return xs.length ? xs.map((x) => ({ k: 'e:' + x.id, t: `I${ind.numero} · ${x.nombre} (${Number(x.porcentaje)}%)`, ind, exp: x }))
      : [{ k: 'i:' + ind.id, t: `I${ind.numero} · ${ind.dimension} — ${ind.descripcion.slice(0, 50)}`, ind }];
  });
  const destinoDe = (a) => (a.experiencia_id ? 'e:' + a.experiencia_id : inds.length ? (a.indicador_id ? 'i:' + a.indicador_id : '') : 'p');
  const enDestino = (k) => (a) => destinoDe(a) === k;
  const sumaDestino = (k, excluir = null) => r2(acts.filter((a) => a.id !== excluir && enDestino(k)(a)).reduce((t, a) => t + (Number(a.porcentaje) || 0), 0));
  const datosDestino = (k) => destinos.find((d) => d.k === k);
  const pesoInd = r2(inds.reduce((s, x) => s + (Number(x.peso) || 0), 0));
  const sumaExps = (indId, excluir = null) => r2(expsDe(indId).filter((x) => x.id !== excluir).reduce((t, x) => t + (Number(x.porcentaje) || 0), 0));
  const sinDestino = inds.length ? acts.filter((a) => !a.indicador_id) : [];
  // Lo que vale cada actividad en la nota del periodo
  const valeEnPeriodo = (a) => {
    const ind = inds.find((x) => x.id === a.indicador_id);
    const exp = exps.find((x) => x.id === a.experiencia_id);
    let v = Number(a.porcentaje) || 0;
    if (!exp && a.indicador_id && expsDe(a.indicador_id).length) return 0; // suelta: no está en ninguna experiencia
    if (exp) v = v * (Number(exp.porcentaje) || 0) / 100;
    if (inds.length) v = v * (Number(ind?.peso) || 0) / 100;
    return r2(v);
  };
  // Avisos de sumas que no dan 100
  const descuadres = [];
  if (inds.length && pesoInd !== 100) descuadres.push(`los criterios suman ${pesoInd}% (${faltaSobra(pesoInd)})`);
  for (const ind of inds) {
    const xs = expsDe(ind.id);
    const sueltas = xs.length ? acts.filter((a) => a.indicador_id === ind.id && !a.experiencia_id).length : 0;
    if (sueltas) descuadres.push(`I${ind.numero}: ${sueltas} actividad(es) no están en ninguna experiencia (edítalas y elige su experiencia)`);
    if (xs.length && sumaExps(ind.id) !== 100) descuadres.push(`I${ind.numero}: sus experiencias suman ${sumaExps(ind.id)}% (${faltaSobra(sumaExps(ind.id))})`);
  }
  for (const d of destinos) {
    const n = acts.filter(enDestino(d.k)).length;
    const t = sumaDestino(d.k);
    if (n && t !== 100) descuadres.push(`${d.k === 'p' ? 'las actividades' : esc(d.t.replace(/ \(\d.*$/, ''))}: actividades suman ${t}% (${faltaSobra(t)})`);
  }

  const calc = (est) => {
    const mias = Object.fromEntries(acts.map((a) => [a.id, nota.get(a.id + '|' + est) ?? null]));
    return definitiva(notaConIndicadores(inds, acts, mias, exps), rec.get(est));
  };
  const mostrar = (v) => (v == null ? '' : escala ? siglaDe(v, col)?.sigla ?? mostrarNota(v, col) : mostrarNota(v, col));
  const celda = (attrs, v, etiqueta, habil = puedeNotas) => escala
    ? `<select class="nota nota-sel" ${attrs} aria-label="${esc(etiqueta)}" ${habil ? '' : 'disabled'}><option value="">—</option>${escala.map((x) => `<option value="${x.valor}" ${v != null && siglaDe(v, col)?.sigla === x.sigla ? 'selected' : ''}>${esc(x.sigla)}</option>`).join('')}</select>`
    : `<input class="nota" ${attrs} inputmode="decimal" aria-label="${esc(etiqueta)}" value="${v == null ? '' : mostrarNota(v, col)}" ${habil ? '' : 'disabled'}>`;

  const filaEst = (e, i) => {
    const d0 = calc(e.id);
    const d = desempeno(d0.valor, col);
    return `<tr data-est="${e.id}">
      <th scope="row"><button class="btn-link" data-alumno="${e.id}"><span class="num">${i + 1}</span> ${esc(nombreLista(e))}</button></th>
      ${acts.map((a) => `<td>${celda(`data-act="${a.id}"`, nota.get(a.id + '|' + e.id), `Nota ${a.nombre} de ${nombreLista(e)}`)}</td>`).join('')}
      <td class="col-rec">${celda('data-rec="1"', rec.get(e.id), `Recuperación de ${nombreLista(e)}`, puedeRecup)}</td>
      <td class="def"><b class="nota-${d.clase}" data-def>${mostrar(d0.valor) || '—'}${d0.recuperada ? '<sup title="Definitiva con recuperación">✱</sup>' : ''}</b></td>
    </tr>`;
  };

  // ---- Cabecera: criterios / experiencias / actividades
  const tramos = (clave) => {
    const out = [];
    for (const a of acts) { const k = clave(a); if (!out.length || out.at(-1).k !== k) out.push({ k, n: 0 }); out.at(-1).n++; }
    return out;
  };
  const cabInd = inds.length ? `<tr class="fila-ind"><th></th>${tramos((a) => (a.indicador_id && ordenInd.has(a.indicador_id) ? a.indicador_id : '')).map((g) => {
    const ind = inds.find((x) => x.id === g.k);
    return `<th colspan="${g.n}">${ind ? `<button class="btn-link" data-criterio="${ind.id}">I${ind.numero} · ${esc(ind.dimension)}</button><small>${Number(ind.peso)}%</small>` : '<small class="alerta">Sin criterio (no cuenta)</small>'}</th>`;
  }).join('')}<th></th><th></th></tr>` : '';
  const hayExps = acts.some((a) => a.experiencia_id);
  const cabExp = hayExps ? `<tr class="fila-exp"><th></th>${tramos((a) => a.experiencia_id || '·' + (a.indicador_id || '')).map((g) => {
    const x = exps.find((e) => e.id === g.k);
    const t = x ? sumaDestino('e:' + x.id) : 0;
    return `<th colspan="${g.n}">${x ? `${esc(x.nombre)} <small>${Number(x.porcentaje)}% · act. <b class="${t === 100 ? 'ok' : 'alerta'}">${t}%</b></small>` : ''}</th>`;
  }).join('')}<th></th><th></th></tr>` : '';
  const insignias = (a) => `${a.opcional ? '<span class="insignia" title="Opcional: si no tiene nota no cuenta">opc.</span>' : ''}${a.privada ? '<span class="insignia" title="Privada: no la ven las familias ni los estudiantes">🔒</span>' : ''}`;
  const cabAct = `<tr><th>Estudiante</th>${acts.map((a) => `<th><button class="btn-link" data-act-edit="${a.id}" ${puedeEditar ? '' : 'disabled'}>${esc(a.nombre)}</button>${insignias(a)}<small title="Vale ${valeEnPeriodo(a)}% de la nota del periodo">${Number(a.porcentaje)}%${inds.length && a.indicador_id ? ` · ${valeEnPeriodo(a)}% def.` : ''}</small>${a.fecha ? `<small>${fecha(a.fecha)}</small>` : ''}</th>`).join('')}<th title="Recuperación">Recup.</th><th>Def.</th></tr>`;
  // ---- Estadísticas por actividad (pie de la tabla)
  const pie = () => {
    const filas = acts.map((a) => estadisticas(ests.map((e) => nota.get(a.id + '|' + e.id) ?? null), col));
    const prom = (s) => (s.promedio == null ? '—' : escala ? siglaDe(s.promedio, col)?.sigla : mostrarNota(s.promedio, col));
    return `<tfoot>
      <tr class="fila-est"><th>Evaluados</th>${filas.map((s) => `<td>${s.n} de ${ests.length}</td>`).join('')}<td></td><td></td></tr>
      <tr class="fila-est"><th>Perdidos</th>${filas.map((s) => `<td class="${s.perdidos ? 'alerta' : ''}">${s.perdidos}${s.n ? ` (${Math.round((s.perdidos * 100) / s.n)}%)` : ''}</td>`).join('')}<td></td><td></td></tr>
      <tr class="fila-est"><th>Promedio</th>${filas.map((s) => `<td>${prom(s)}</td>`).join('')}<td></td><td></td></tr>
      <tr class="fila-est"><th>Desv.</th>${filas.map((s) => `<td>${s.desv == null ? '—' : redondear(s.desv, 1)}</td>`).join('')}<td></td><td></td></tr>
    </tfoot>`;
  };

  const resumen = inds.length
    ? `${inds.length} criterio(s) · pesos suman <b class="${pesoInd === 100 ? 'ok' : 'alerta'}">${pesoInd}%</b> · ${exps.length} experiencia(s) · ${acts.length} actividad(es) · ${notas.length} nota(s)`
    : `${acts.length} actividad(es) · suman <b class="${sumaDestino('p') === 100 ? 'ok' : 'alerta'}">${sumaDestino('p')}%</b> · ${notas.length} nota(s)`;

  m.innerHTML = cabecera(esc(etiquetaAsig(b, asig)), { volver: esAdmin ? `#/curso/${asig.curso_id}` : '#/clases', acciones: `<a class="btn" href="#/asistencia/${asig.id}">Asistencia</a>` }) + `
    <div class="segmentos" role="tablist" aria-label="Periodo">${b.periodos.map((x) => `<a role="tab" href="#/notas/${asig.id}?periodo=${x.id}" class="${x.id === per.id ? 'activo' : ''}" aria-selected="${x.id === per.id}">${esc(x.nombre)}${x.cerrado ? ' 🔒' : ''}</a>`).join('')}</div>
    ${fechasHTML}
    ${per.cerrado ? `<p class="aviso-caja">Este periodo está cerrado. ${esAdmin ? 'Como administrador sí puedes cambiar notas.' : 'Solo el administrador puede cambiar notas.'}</p>` : ''}
    <div class="tarjeta-cab">
      <p class="ayuda">${resumen}${descuadres.length ? `<br><span class="alerta">Deben sumar 100%: ${descuadres.join(' · ')}</span>` : ''}${sinDestino.length ? `<br><span class="alerta">${sinDestino.length} actividad(es) sin criterio no cuentan</span>` : ''}</p>
      <div class="acciones">
        <button class="btn" data-criterios>🎯 Criterios y experiencias</button>
        <a class="btn" href="#/consolidado/${asig.id}?periodo=${per.id}">📊 Consolidado</a>
        <a class="btn" href="#/observaciones-boletin/${asig.id}?periodo=${per.id}">📝 Observaciones</a>
        <a class="btn" href="#/remediales/${asig.id}">🏁 Remediales</a>
        ${puedeEditar ? '<button class="btn btn-primario" data-nueva-act>＋ Actividad</button>' : ''}
      </div>
    </div>
    ${!inds.length && !esAdmin ? '<p class="ayuda">Esta materia no tiene criterios en este periodo: las actividades suman 100% del periodo. Coordinación puede definir los criterios.</p>' : ''}
    ${!ests.length ? vacio('Este curso no tiene estudiantes matriculados.') : !acts.length ? vacio(inds.length ? 'Ya están los criterios. Arma las experiencias de cada criterio (🎯) y luego crea las actividades.' : 'Crea la primera actividad del periodo (taller, quiz, examen…) con su porcentaje.') : `
    <div class="tabla-envoltura planilla">
      <table class="tabla tabla-notas">
        <thead>${cabInd}${cabExp}${cabAct}</thead>
        <tbody>${ests.map(filaEst).join('')}</tbody>
        ${pie()}
      </table>
    </div>
    <p class="ayuda">${escala ? `Elige el desempeño (${escala.map((x) => `${esc(x.sigla)} = ${esc(x.nombre)}`).join(', ')}); se guarda solo.` : `Escribe la nota (${col.nota_min} a ${col.nota_max}) y pasa a la siguiente con Enter; se guarda sola.`} ${inds.length ? 'Cada experiencia promedia sus actividades (según su %), cada criterio promedia sus experiencias y la definitiva promedia los criterios según su peso.' : 'La definitiva usa los porcentajes de las actividades calificadas.'} Si el estudiante presentó <b>recuperación</b>, escríbela en "Recup.": queda la mayor (✱). Toca un nombre para darle una mención.</p>`}`;

  const repintarDef = (tr) => {
    const d0 = calc(tr.dataset.est);
    const el = tr.querySelector('[data-def]');
    el.innerHTML = (mostrar(d0.valor) || '—') + (d0.recuperada ? '<sup title="Definitiva con recuperación">✱</sup>' : '');
    el.className = 'nota-' + desempeno(d0.valor, col).clase;
  };

  // ---- Guardado automático de cada nota (y de la recuperación)
  const guardar = async (inp) => {
    const tr = inp.closest('tr');
    const est = tr.dataset.est, act = inp.dataset.act, esRec = !!inp.dataset.rec;
    const txt = String(inp.value).trim();
    const previo = esRec ? rec.get(est) ?? null : nota.get(act + '|' + est) ?? null;
    const valor = txt === '' ? null : num(txt);
    if (valor != null && (Number.isNaN(valor) || valor < col.nota_min || valor > col.nota_max)) {
      inp.classList.add('mal');
      aviso(`La nota debe estar entre ${col.nota_min} y ${col.nota_max}`, 'error');
      return;
    }
    inp.classList.remove('mal');
    if (valor === (previo == null ? null : Number(previo))) return;
    inp.classList.add('guardando');
    try {
      if (esRec) {
        if (valor == null) await E.db.remove('recuperaciones', { asignacion_id: asig.id, periodo_id: per.id, estudiante_id: est });
        else await E.db.upsert('recuperaciones', [{ colegio_id: E.colegio.id, asignacion_id: asig.id, periodo_id: per.id, estudiante_id: est, nota: valor, registrado_por: E.yo.id }], 'asignacion_id,periodo_id,estudiante_id');
        if (valor == null) rec.delete(est); else rec.set(est, valor);
      } else {
        if (valor == null) await E.db.remove('calificaciones', { actividad_id: act, estudiante_id: est });
        else await E.db.upsert('calificaciones', [{ colegio_id: E.colegio.id, actividad_id: act, estudiante_id: est, valor }], 'actividad_id,estudiante_id');
        if (valor == null) nota.delete(act + '|' + est); else nota.set(act + '|' + est, valor);
      }
      if (valor != null && !escala) inp.value = mostrarNota(valor, col);
      repintarDef(tr);
      const tf = m.querySelector('.tabla-notas tfoot');
      if (tf) tf.outerHTML = pie();
      inp.classList.add('guardado');
      setTimeout(() => inp.classList.remove('guardado'), 900);
    } catch (e) {
      inp.classList.add('mal');
      aviso(e.message, 'error');
    } finally { inp.classList.remove('guardando'); }
  };
  m.querySelectorAll('.nota').forEach((inp) => {
    inp.addEventListener('change', () => guardar(inp));
    inp.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      if (inp.tagName === 'SELECT' && e.key !== 'Enter') return; // en la lista las flechas cambian la opción
      e.preventDefault();
      const td = inp.closest('td');
      const idx = [...td.parentNode.children].indexOf(td);
      const tr = e.key === 'ArrowUp' ? td.parentNode.previousElementSibling : td.parentNode.nextElementSibling;
      const sig = tr?.children[idx]?.querySelector('.nota');
      if (sig) { sig.focus(); sig.select?.(); } else inp.blur();
    });
    if (inp.tagName === 'INPUT') inp.addEventListener('focus', () => inp.select());
  });

  const recargar = () => planilla(m, { ...p, periodo: per.id });

  // ---- Actividad: crear / editar (con "Disponible X %" y "Contar también en…")
  const formAct = async (a) => {
    const nueva = !a?.id;
    const k0 = nueva ? (destinos.find((d) => sumaDestino(d.k) < 100) || destinos[0])?.k : destinoDe(a);
    const falta = (k) => Math.max(0, r2(100 - sumaDestino(k, a?.id)));
    const destinosForm = !nueva && k0 && !destinos.some((d) => d.k === k0) && k0.startsWith('i:') ? [{ k: k0, t: (() => { const ind = inds.find((x) => 'i:' + x.id === k0); return `I${ind?.numero} · sin experiencia (elige una)`; })(), ind: inds.find((x) => 'i:' + x.id === k0) }, ...destinos] : destinos;
    const opciones = destinosForm.map((d) => `<option value="${esc(d.k)}" ${d.k === k0 ? 'selected' : ''}>${esc(d.t)}</option>`).join('');
    const sinCrit = inds.length && !nueva && !a.indicador_id;
    const html = `<div class="form">
      <label>Nombre (ej. Taller 1, Quiz, Examen)<input name="nombre" value="${esc(a?.nombre || '')}" required></label>
      ${destinos.length > 1 || inds.length ? `<label>${inds.length ? (exps.length ? 'Criterio y experiencia' : 'Criterio') : 'Dónde cuenta'}<select name="destino">${sinCrit ? '<option value="" selected>Sin criterio (no cuenta)</option>' : ''}${opciones}</select></label>` : ''}
      <label>Peso (%) dentro de ${inds.length ? (exps.length ? 'la experiencia' : 'el criterio') : 'el periodo'}<input name="porcentaje" inputmode="decimal" autocomplete="off" value="${esc(nueva ? (falta(k0) || '') : String(a.porcentaje).replace('.', ','))}"><small class="ayuda disponible" data-disp></small></label>
      <label>Fecha<input name="fecha" type="date" value="${esc(a?.fecha || hoy())}"></label>
      <label class="fila-check"><input type="checkbox" name="opcional" ${a?.opcional ? 'checked' : ''}> <span><b>Opcional</b><small>Si el estudiante no tiene nota, no cuenta.</small></span></label>
      <label class="fila-check"><input type="checkbox" name="privada" ${a?.privada ? 'checked' : ''}> <span><b>Privada</b><small>Ocultar para los padres de familia y estudiantes.</small></span></label>
      ${nueva && destinos.length > 1 ? `<fieldset class="tambien"><legend>Contar también en (se califica por separado en cada uno)</legend>${destinos.map((d) => `<label class="fila-check" data-tambien-k="${esc(d.k)}"><input type="checkbox" name="tambien" value="${esc(d.k)}"> <span>${esc(d.t)} <small data-tambien-disp></small></span></label>`).join('')}</fieldset>` : ''}
    </div>`;
    const botones = [];
    if (!nueva) botones.push({ texto: 'Eliminar', clase: 'btn-peligro', antes: async () => {
      const n = notas.filter((x) => x.actividad_id === a.id).length;
      if (!(await confirmar('¿Eliminar la actividad?', n ? `Se borran también sus ${n} nota(s). No se puede deshacer.` : 'No se puede deshacer.', 'Eliminar'))) return false;
      await E.db.remove('actividades', { id: a.id });
      aviso('Actividad eliminada');
      return 'borrado';
    } });
    botones.push({ texto: 'Cancelar' });
    botones.push({ texto: nueva ? 'Crear' : 'Guardar', antes: async (caja) => {
      const d = leerForm(caja);
      const k = caja.querySelector('[name=destino]')?.value ?? k0;
      const pct = num(d.porcentaje);
      if (!String(d.nombre || '').trim()) throw new Error('Escribe el nombre de la actividad.');
      // destino lleno: el peso se recortó a 0, así que se explica por qué (no "debe ser mayor que 0")
      if (k && !(pct > 0) && Math.max(0, r2(100 - sumaDestino(k, a?.id))) === 0) throw new Error(`En ${datosDestino(k)?.t || 'ese destino'} las actividades ya suman 100%. Primero baja el % de otra actividad.`);
      if (!(pct > 0) || pct > 100) throw new Error('El peso debe ser mayor que 0 y máximo 100.');
      const extras = nueva ? [...caja.querySelectorAll('[name=tambien]:checked')].map((x) => x.value).filter((x) => x !== k) : [];
      for (const kk of [k, ...extras].filter(Boolean)) {
        const disp = Math.max(0, r2(100 - sumaDestino(kk, a?.id)));
        if (pct > disp) {
          const dd = datosDestino(kk);
          throw new Error(disp === 0 ? `En ${dd?.t || 'ese destino'} las actividades ya suman 100%. Primero baja el % de otra actividad.` : `En ${dd?.t || 'ese destino'} solo quedan ${disp}% disponibles.`);
        }
      }
      const fila = (kk) => {
        const dd = destinosForm.find((x) => x.k === kk);
        return { nombre: d.nombre.trim(), porcentaje: pct, fecha: d.fecha || null, opcional: !!d.opcional, privada: !!d.privada,
          indicador_id: dd?.ind?.id || null, experiencia_id: dd?.exp?.id || null };
      };
      if (nueva) {
        await E.db.insert('actividades', [k, ...extras].filter((kk) => kk !== '').map((kk) => ({ colegio_id: E.colegio.id, asignacion_id: asig.id, periodo_id: per.id, ...fila(kk) })));
        aviso(extras.length ? `Actividad creada en ${extras.length + 1} criterios` : 'Actividad creada');
      } else {
        const cambios = k === '' ? { nombre: d.nombre.trim(), porcentaje: pct, fecha: d.fecha || null, opcional: !!d.opcional, privada: !!d.privada } : fila(k);
        await E.db.update('actividades', cambios, { id: a.id });
        aviso('Guardado');
      }
      return true;
    } });
    const r = await ventana({
      titulo: nueva ? 'Nueva actividad' : 'Actividad', html, botones,
      alAbrir: (caja) => {
        const sel = caja.querySelector('[name=destino]');
        const inp = caja.querySelector('[name=porcentaje]');
        const nota = caja.querySelector('[data-disp]');
        const pintar = (recortar) => {
          const k = sel ? sel.value : k0;
          if (k === '') { nota.innerHTML = 'Sin criterio: esta actividad no cuenta en la nota.'; nota.className = 'ayuda disponible alerta'; return; }
          const dd = destinosForm.find((x) => x.k === k);
          const otros = sumaDestino(k, a?.id);
          const max = Math.max(0, r2(100 - otros));
          if (recortar && num(inp.value) > max) { inp.value = String(max).replace('.', ','); aviso(`Máximo ${max}%: las otras actividades ya suman ${otros}%.`, 'error'); }
          const queda = r2(max - (num(inp.value) || 0));
          const vale = dd?.exp ? ` (la experiencia vale ${Number(dd.exp.porcentaje)}% del criterio I${dd.ind.numero}, que vale ${Number(dd.ind.peso)}% del periodo)` : dd?.ind ? ` (el criterio I${dd.ind.numero} vale ${Number(dd.ind.peso)}% del periodo)` : '';
          nota.innerHTML = `Disponible <b>${max}%</b>${vale} · las otras actividades suman ${otros}%${inp.value ? ` · después de esta quedan <b>${Math.max(0, queda)}%</b>` : ''}`;
          nota.className = 'ayuda disponible' + (max === 0 ? ' alerta' : '');
          caja.querySelectorAll('[data-tambien-k]').forEach((l) => {
            const kk = l.dataset.tambienK;
            l.hidden = kk === k;
            const disp = Math.max(0, r2(100 - sumaDestino(kk)));
            l.querySelector('[data-tambien-disp]').textContent = `· disponible ${disp}%`;
            l.querySelector('input').disabled = disp === 0;
          });
        };
        inp.addEventListener('input', () => pintar(true));
        sel?.addEventListener('change', () => pintar(true));
        pintar(false);
      },
    });
    if (r) recargar();
  };
  m.querySelector('[data-nueva-act]')?.addEventListener('click', () => formAct(null));
  m.querySelectorAll('[data-act-edit]').forEach((bt) => (bt.onclick = () => formAct(acts.find((a) => a.id === bt.dataset.actEdit))));

  // ---- Experiencias de un criterio (las arma el docente)
  const editarExp = async (ind, x) => {
    const otrosDe = () => sumaExps(ind.id, x?.id);
    const ok = await editar({
      titulo: x?.id ? 'Experiencia' : `Nueva experiencia · I${ind.numero}`, tabla: 'experiencias',
      campos: [{ name: 'nombre', label: 'Nombre', req: true }, { name: 'porcentaje', label: 'Peso (%) dentro del criterio', tipo: 'number', req: true }],
      fila: x || { nombre: `Experiencias ${expsDe(ind.id).length + 1}`, porcentaje: Math.max(0, r2(100 - sumaExps(ind.id))) || '' },
      extra: { indicador_id: ind.id, numero: (expsDe(ind.id).at(-1)?.numero || 0) + 1 },
      borrable: true,
      validar: (d) => {
        const w = Number(d.porcentaje);
        const otros = otrosDe();
        if (!(w > 0) && otros >= 100) throw new Error(`Las experiencias de I${ind.numero} ya suman 100%. Primero baja el % de otra.`);
        if (!(w > 0) || w > 100) throw new Error('El peso debe ser mayor que 0 y máximo 100.');
        if (r2(otros + w) > 100) throw new Error(otros >= 100 ? `Las experiencias de I${ind.numero} ya suman 100%. Primero baja el % de otra.` : `Las experiencias de I${ind.numero} deben sumar 100%. Las otras ya suman ${otros}%: a esta le puedes dar máximo ${r2(100 - otros)}%.`);
      },
      alAbrir: (caja) => {
        const inp = caja.querySelector('[name=porcentaje]');
        const nota = document.createElement('small');
        nota.className = 'ayuda disponible';
        inp.after(nota);
        const otros = otrosDe(), max = Math.max(0, r2(100 - otros));
        const pintar = (recortar) => {
          if (recortar && num(inp.value) > max) { inp.value = String(max).replace('.', ','); aviso(`Máximo ${max}%: las otras experiencias ya suman ${otros}%.`, 'error'); }
          nota.innerHTML = `Disponible <b>${max}%</b> en I${ind.numero} · las otras experiencias suman ${otros}%`;
          nota.className = 'ayuda disponible' + (max === 0 ? ' alerta' : '');
        };
        inp.addEventListener('input', () => pintar(true));
        pintar(false);
      },
    }).catch((e) => { aviso(/restrict|foreign|violates/i.test(e.message) ? 'No se puede eliminar: la experiencia tiene actividades. Elimínalas o muévelas primero.' : e.message, 'error'); return null; });
    if (ok) recargar();
  };

  // ---- Criterios (los define coordinación; el docente los ve y arma sus experiencias)
  const camposInd = [
    { name: 'numero', label: 'Número', tipo: 'number', req: true },
    { name: 'descripcion', label: 'Descripción del criterio / logro', tipo: 'textarea', filas: 3, req: true },
    { name: 'dimension', label: 'Dimensión (tipo de evaluación)', tipo: 'select', opciones: DIMENSIONES.map((d) => [d, d]) },
    { name: 'peso', label: 'Peso en la nota del periodo (%)', tipo: 'number', req: true },
  ];
  const editarInd = async (fila) => {
    const nuevo = !fila?.id;
    const otros = r2(inds.filter((x) => x.id !== fila?.id).reduce((t, x) => t + (Number(x.peso) || 0), 0));
    const max = Math.max(0, r2(100 - otros));
    // Otros cursos del mismo grado con la misma materia (para crear el criterio en todos a la vez)
    const curso = b.cursoPorId.get(asig.curso_id);
    let chkHermanas = null;
    const hermanas = b.asignaciones.filter((x) => x.id !== asig.id && x.materia_id === asig.materia_id && b.cursoPorId.get(x.curso_id)?.grado_id === curso?.grado_id);
    const ok = await editar({
      titulo: nuevo ? 'Nuevo criterio' : `Criterio I${fila.numero}`, tabla: 'indicadores', campos: camposInd, fila,
      extra: { asignacion_id: asig.id, periodo_id: per.id },
      validar: (d) => {
        if (!d.descripcion) throw new Error('Escribe la descripción.');
        const w = Number(d.peso);
        if (!(w > 0) && otros >= 100) throw new Error('Los criterios del periodo ya suman 100%. Primero baja el peso de otro.');
        if (!(w > 0) || w > 100) throw new Error('El peso debe ser mayor que 0 y máximo 100.');
        if (r2(otros + w) > 100) throw new Error(otros >= 100 ? 'Los criterios del periodo ya suman 100%. Primero baja el peso de otro.' : `Los criterios del periodo deben sumar 100%. Los otros ya suman ${otros}%: a este le puedes dar máximo ${max}%.`);
      },
      alAbrir: (caja) => {
        const inp = caja.querySelector('[name=peso]');
        const nota = document.createElement('small');
        nota.className = 'ayuda disponible';
        inp.after(nota);
        const pintar = (recortar) => {
          if (recortar && num(inp.value) > max) { inp.value = String(max).replace('.', ','); aviso(`Máximo ${max}%: los otros criterios ya suman ${otros}%.`, 'error'); }
          nota.innerHTML = `Disponible <b>${max}%</b> · los otros criterios suman ${otros}%`;
          nota.className = 'ayuda disponible' + (max === 0 ? ' alerta' : '');
        };
        inp.addEventListener('input', () => pintar(true));
        pintar(false);
        if (nuevo && hermanas.length) {
          const l = document.createElement('label');
          l.className = 'fila-check';
          l.innerHTML = `<input type="checkbox" name="hermanas" checked> <span><b>Crear también en ${hermanas.map((x) => esc(b.cursoPorId.get(x.curso_id)?.nombre)).join(', ')}</b><small>Mismo criterio para todos los cursos del grado en esta materia (como en Phidias).</small></span>`;
          caja.querySelector('.form').appendChild(l);
          chkHermanas = l.querySelector('input');
        }
      },
    }).catch((e) => { aviso(/restrict|foreign|violates/i.test(e.message) ? 'No se puede eliminar: el criterio tiene actividades en sus experiencias. Elimínalas primero.' : e.message, 'error'); return null; });
    // Copia en los otros cursos del grado (si se marcó)
    if (ok && nuevo && hermanas.length && ok.id && chkHermanas?.checked) {
      let n = 0;
      for (const h of hermanas) {
        try { await E.db.insert('indicadores', [{ colegio_id: E.colegio.id, asignacion_id: h.id, periodo_id: per.id, numero: ok.numero, descripcion: ok.descripcion, dimension: ok.dimension, peso: ok.peso }]); n++; }
        catch (e) { aviso(`${b.cursoPorId.get(h.curso_id)?.nombre}: ${e.message}`, 'error'); }
      }
      if (n) aviso(`Criterio creado también en ${n} curso(s)`);
    }
    if (ok) recargar();
  };

  const verCriterios = async (enfocar) => {
    const r = await ventana({
      titulo: `Criterios y experiencias · ${per.nombre}`,
      html: `<p class="ayuda">Los <b>criterios</b> los define coordinación${esAdmin ? ' (tú, como administrador)' : ''}; cada uno tiene un peso en la nota del periodo y entre todos suman 100%.
        Dentro de cada criterio armas tus <b>experiencias</b> (suman 100% dentro del criterio) y en cada experiencia van las <b>actividades</b> (suman 100% dentro de la experiencia).</p>
        <p class="ayuda">Criterios: <b class="${pesoInd === 100 ? 'ok' : 'alerta'}">${pesoInd}%</b> de 100%</p>
        ${inds.length ? inds.map((ind) => {
          const xs = expsDe(ind.id);
          return `<section class="tarjeta criterio ${enfocar === ind.id ? 'enfocado' : ''}">
            <div class="tarjeta-cab"><h3>I${ind.numero} · ${esc(ind.dimension)} <small>${Number(ind.peso)}%</small></h3>${esAdmin ? `<button class="btn btn-chico" data-editar-ind="${ind.id}">Editar</button>` : ''}</div>
            <p>${esc(ind.descripcion)}</p>
            ${xs.length ? `<div class="lista">${xs.map((x) => `<button class="fila fila-boton" data-exp="${x.id}" ${puedeEditar ? '' : 'disabled'}><span class="num">${x.numero}</span><span><b>${esc(x.nombre)}</b><small>${Number(x.porcentaje)}% · ${acts.filter((a) => a.experiencia_id === x.id).length} actividad(es) que suman ${sumaDestino('e:' + x.id)}%</small></span></button>`).join('')}</div>
              <p class="ayuda">Experiencias: <b class="${sumaExps(ind.id) === 100 ? 'ok' : 'alerta'}">${sumaExps(ind.id)}%</b> de 100%</p>` : '<p class="ayuda">Sin experiencias: las actividades van directo al criterio.</p>'}
            ${puedeEditar ? `<button class="btn btn-chico" data-nueva-exp="${ind.id}">＋ Experiencia</button>` : ''}
          </section>`;
        }).join('') : vacio(esAdmin ? 'Aún no hay criterios en este periodo. Créalos con "＋ Criterio".' : 'Coordinación aún no ha definido los criterios de esta materia en este periodo.')}`,
      alAbrir: (caja, cerrar) => {
        caja.querySelectorAll('[data-exp]').forEach((el) => (el.onclick = () => { cerrar(null); const x = exps.find((e) => e.id === el.dataset.exp); editarExp(inds.find((i) => i.id === x.indicador_id), x); }));
        caja.querySelectorAll('[data-nueva-exp]').forEach((el) => (el.onclick = () => { cerrar(null); editarExp(inds.find((i) => i.id === el.dataset.nuevaExp), null); }));
        caja.querySelectorAll('[data-editar-ind]').forEach((el) => (el.onclick = () => { cerrar(null); editarInd(inds.find((i) => i.id === el.dataset.editarInd)); }));
        caja.querySelector('.enfocado')?.scrollIntoView({ block: 'center' });
      },
      botones: [{ texto: 'Cerrar' }, ...(esAdmin ? [{ texto: '＋ Criterio', valor: 'nuevo' }] : [])],
    });
    if (r === 'nuevo') editarInd({ numero: (inds.at(-1)?.numero || 0) + 1, dimension: 'Cognitiva', peso: Math.max(0, r2(100 - pesoInd)) || '' });
  };
  m.querySelector('[data-criterios]')?.addEventListener('click', () => verCriterios());
  m.querySelectorAll('[data-criterio]').forEach((bt) => (bt.onclick = () => verCriterios(bt.dataset.criterio)));

  // ---- Menciones al tocar el nombre del estudiante
  m.querySelectorAll('[data-alumno]').forEach((bt) => (bt.onclick = async () => {
    const est = bt.dataset.alumno;
    const ments = (await E.db.select('menciones', { eq: { estudiante_id: est } })).filter((x) => x.asignacion_id === asig.id);
    const r = await ventana({
      titulo: nombre(E.perfiles.get(est)),
      html: `<p><a class="btn btn-chico" href="#/estudiante/${est}?tab=observador" data-cerrar>📒 Observador</a> <a class="btn btn-chico" href="#/estudiante/${est}" data-cerrar>📊 Todas sus notas</a></p>
        <h3 class="sub">Menciones en ${esc(b.materiaPorId.get(asig.materia_id)?.nombre || '')}</h3>
        ${ments.length ? `<div class="lista">${ments.map((x) => `<div class="fila"><span>🏅</span><span><b>${esc(x.tipo)}</b><small>${fecha(x.fecha)}${x.descripcion ? ' · ' + esc(x.descripcion) : ''}</small></span></div>`).join('')}</div>` : '<p class="ayuda">Sin menciones.</p>'}
        ${camposHTML([{ name: 'tipo', label: 'Nueva mención', tipo: 'select', opciones: MENCIONES.map((x) => [x, x]) }, { name: 'descripcion', label: 'Motivo (opcional)' }])}`,
      botones: [{ texto: 'Cerrar' }, { texto: '🏅 Dar mención', antes: async (caja) => {
        const d = leerForm(caja);
        await E.db.insert('menciones', [{ colegio_id: E.colegio.id, estudiante_id: est, asignacion_id: asig.id, periodo_id: per.id, tipo: d.tipo, descripcion: d.descripcion || null, autor_id: E.yo.id }]);
        return true;
      } }],
    });
    if (r === true) aviso('Mención registrada');
  }));
}
