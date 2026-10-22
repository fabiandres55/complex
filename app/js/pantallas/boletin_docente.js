// Pantallas del docente para el cierre (REA Phidias, perfil docente):
//  * Observaciones de boletín: un texto por estudiante en cada materia y periodo, con "copiar hacia abajo".
//  * Remediales (fin de año): para quienes perdieron la materia; "Definitiva → Remedial".
import { E, base } from '../estado.js';
import { esc, aviso, confirmar, nombreLista, vacio, hoy } from '../ui.js';
import { cabecera } from './comun.js';
import { etiquetaAsig, estudiantesDe } from './profesor.js';
import { notasDeAsignacion } from './notas_util.js';
import { mostrarNota, desempeno, enVentana, siglaDe, escalaCualitativa, redondear } from '../calculos.js';

const verNota = (v) => {
  if (v == null) return '—';
  const s = escalaCualitativa(E.colegio) ? siglaDe(v, E.colegio)?.sigla : null;
  return `<b class="nota-${desempeno(v, E.colegio).clase}">${s || mostrarNota(v, E.colegio)}</b>`;
};

// ---------------------------------------------------------------- Observaciones de boletín
export async function observaciones(m, p) {
  const b = await base();
  const asig = b.asignacionPorId.get(p.asig);
  if (!asig) { m.innerHTML = vacio('Esa clase no existe.'); return; }
  const per = b.periodos.find((x) => x.id === p.periodo) || b.periodos.find((x) => !x.cerrado) || b.periodos[0];
  if (!per) { m.innerHTML = cabecera('Observaciones') + vacio('El colegio aún no tiene periodos.'); return; }
  const esAdmin = E.rol === 'admin';
  const v = enVentana(per.obs_desde, per.obs_hasta, hoy());
  const puede = esAdmin || (asig.profesor_id === E.yo.id && !per.cerrado && v.abierta);
  const ests = await estudiantesDe(asig);
  const [obs, notas] = await Promise.all([
    E.db.select('observaciones_boletin', { eq: { asignacion_id: asig.id, periodo_id: per.id } }),
    notasDeAsignacion(asig, b.periodos.filter((x) => x.numero <= per.numero), ests.map((e) => e.id)),
  ]);
  const texto = new Map(obs.map((o) => [o.estudiante_id, o.texto]));
  const hechas = () => ests.filter((e) => (texto.get(e.id) || '').trim()).length;
  m.innerHTML = cabecera('Observaciones', { volver: `#/notas/${asig.id}?periodo=${per.id}` }) + `
    <p class="ayuda"><b>${esc(etiquetaAsig(b, asig))}</b> · Lo que escribas aquí sale en el boletín de cada estudiante.</p>
    <div class="segmentos" role="tablist">${b.periodos.map((x) => `<a role="tab" href="#/observaciones-boletin/${asig.id}?periodo=${x.id}" class="${x.id === per.id ? 'activo' : ''}">${esc(x.nombre)}${x.cerrado ? ' 🔒' : ''}</a>`).join('')}</div>
    <p class="ayuda">Registro de observaciones: ${v.texto}${v.definida ? (v.abierta ? ' · <span class="chip ok">Abierto</span>' : ' · <span class="chip">Cerrado</span>') : ''} · <b data-avance></b></p>
    ${!puede && !esAdmin ? `<p class="aviso-caja">${per.cerrado ? 'El periodo está cerrado.' : !v.abierta ? `El registro de observaciones está cerrado (${v.texto}).` : 'Solo el profesor de la materia puede escribir observaciones.'}</p>` : ''}
    ${!ests.length ? vacio('Este curso no tiene estudiantes.') : `
    <div class="tabla-envoltura"><table class="tabla tabla-obs">
      <thead><tr><th>Estudiante</th><th>Nota</th><th>Acumulado</th><th>Observación</th></tr></thead>
      <tbody>${ests.map((e, i) => {
        const n = notas.get(e.id);
        return `<tr data-est="${e.id}"><th scope="row"><span class="num">${i + 1}</span> ${esc(nombreLista(e))}</th><td>${verNota(n?.porPeriodo[per.id])}</td><td>${verNota(n?.final0)}</td>
          <td><div class="obs-celda"><textarea rows="2" data-obs aria-label="Observación de ${esc(nombreLista(e))}" ${puede ? '' : 'disabled'}>${esc(texto.get(e.id) || '')}</textarea>
          ${puede && i < ests.length - 1 ? `<button class="btn-icono" data-copiar title="Copiar este texto a todos los de abajo" aria-label="Copiar hacia abajo">⤓</button>` : ''}</div></td></tr>`;
      }).join('')}</tbody></table></div>`}`;
  const avance = () => { const el = m.querySelector('[data-avance]'); if (el) el.textContent = `${hechas()} de ${ests.length} observaciones (${ests.length ? Math.round((hechas() * 100) / ests.length) : 0}%)`; };
  avance();
  const guardar = async (tr, t) => {
    const est = tr.dataset.est;
    const previo = texto.get(est) || '';
    if (t === previo) return true;
    const ta = tr.querySelector('[data-obs]');
    ta.classList.add('guardando');
    try {
      if (!t) await E.db.remove('observaciones_boletin', { asignacion_id: asig.id, periodo_id: per.id, estudiante_id: est });
      else await E.db.upsert('observaciones_boletin', [{ colegio_id: E.colegio.id, asignacion_id: asig.id, periodo_id: per.id, estudiante_id: est, texto: t, autor_id: E.yo.id }], 'asignacion_id,periodo_id,estudiante_id');
      if (t) texto.set(est, t); else texto.delete(est);
      ta.classList.add('guardado'); setTimeout(() => ta.classList.remove('guardado'), 900);
      avance();
      return true;
    } catch (e) { ta.classList.add('mal'); aviso(e.message, 'error'); return false; }
    finally { ta.classList.remove('guardando'); }
  };
  m.querySelectorAll('[data-obs]').forEach((ta) => ta.addEventListener('change', () => guardar(ta.closest('tr'), ta.value.trim())));
  m.querySelectorAll('[data-copiar]').forEach((bt) => (bt.onclick = async () => {
    const tr = bt.closest('tr');
    const t = tr.querySelector('[data-obs]').value.trim();
    if (!t) return aviso('Primero escribe la observación que quieres copiar.', 'error');
    const abajo = [];
    for (let x = tr.nextElementSibling; x; x = x.nextElementSibling) abajo.push(x);
    const conTexto = abajo.filter((x) => x.querySelector('[data-obs]').value.trim()).length;
    if (conTexto && !(await confirmar('¿Copiar hacia abajo?', `${conTexto} estudiante(s) de abajo ya tienen observación y se reemplazará.`, 'Copiar'))) return;
    await guardar(tr, t);
    let n = 0;
    for (const x of abajo) { x.querySelector('[data-obs]').value = t; if (await guardar(x, t)) n++; }
    aviso(`Observación copiada a ${n} estudiante(s)`);
  }));
}

// ---------------------------------------------------------------- Remediales (fin de año)
export async function remediales(m, p) {
  const b = await base();
  const asig = b.asignacionPorId.get(p.asig);
  if (!asig) { m.innerHTML = vacio('Esa clase no existe.'); return; }
  const esAdmin = E.rol === 'admin';
  const v = enVentana(b.anio?.remedial_desde, b.anio?.remedial_hasta, hoy());
  const puede = esAdmin || (asig.profesor_id === E.yo.id && v.definida && v.abierta);
  const ests = await estudiantesDe(asig);
  const notas = await notasDeAsignacion(asig, b.periodos, ests.map((e) => e.id));
  const col = E.colegio;
  const ap = Number(col.nota_aprobacion ?? 3);
  const todos = p.todos === '1';
  const lista = ests.filter((e) => { const n = notas.get(e.id); return todos || n?.remedial != null || (n?.final0 != null && redondear(n.final0, col.decimales ?? 1) < ap); });
  const escala = escalaCualitativa(col);
  const campo = (e, n) => escala
    ? `<select class="nota nota-sel" data-rem ${puede ? '' : 'disabled'}><option value="">—</option>${escala.map((x) => `<option value="${x.valor}" ${n.remedial != null && siglaDe(n.remedial, col)?.sigla === x.sigla ? 'selected' : ''}>${esc(x.sigla)}</option>`).join('')}</select>`
    : `<input class="nota" data-rem inputmode="decimal" value="${n.remedial == null ? '' : mostrarNota(n.remedial, col)}" ${puede ? '' : 'disabled'} aria-label="Remedial de ${esc(nombreLista(e))}">`;
  m.innerHTML = cabecera('Remediales', { volver: `#/notas/${asig.id}` }) + `
    <p class="ayuda"><b>${esc(etiquetaAsig(b, asig))}</b> · Al final del año, el estudiante que perdió la materia presenta el remedial: si su nota es mayor, reemplaza la definitiva (<b>Definitiva → Remedial</b>).</p>
    <p class="ayuda">Registro de remediales: ${v.definida ? v.texto + (v.abierta ? ' · <span class="chip ok">Abierto</span>' : ' · <span class="chip">Cerrado</span>') : 'el colegio aún no ha definido las fechas'}</p>
    ${!puede && !esAdmin ? `<p class="aviso-caja">${!v.definida ? 'El colegio aún no ha abierto las fechas de remediales (Colegio → Estructura → Año lectivo).' : !v.abierta ? `El registro de remediales está cerrado (${v.texto}).` : 'Solo el profesor de la materia registra remediales.'}</p>` : ''}
    <p><a class="btn btn-chico" href="#/remediales/${asig.id}?todos=${todos ? '0' : '1'}">${todos ? 'Ver solo quienes perdieron' : 'Ver todos los estudiantes'}</a></p>
    ${!lista.length ? vacio(todos ? 'Este curso no tiene estudiantes.' : 'Nadie ha perdido la materia en el año. 🎉') : `
    <div class="tabla-envoltura"><table class="tabla tabla-notas">
      <thead><tr><th>Estudiante</th>${b.periodos.map((x) => `<th>${esc(x.nombre)}</th>`).join('')}<th>Definitiva</th><th>Remedial</th><th>Final</th></tr></thead>
      <tbody>${lista.map((e, i) => {
        const n = notas.get(e.id);
        return `<tr data-est="${e.id}"><th scope="row"><span class="num">${i + 1}</span> ${esc(nombreLista(e))}</th>${b.periodos.map((x) => `<td>${verNota(n.porPeriodo[x.id])}${n.recuperada[x.id] ? '<sup>✱</sup>' : ''}</td>`).join('')}
          <td>${verNota(n.final0)}</td><td>${campo(e, n)}</td><td data-final>${verNota(n.final)}${n.conRemedial ? ' <small>(remedial)</small>' : ''}</td></tr>`;
      }).join('')}</tbody></table></div>`}`;
  m.querySelectorAll('[data-rem]').forEach((inp) => inp.addEventListener('change', async () => {
    const tr = inp.closest('tr');
    const est = tr.dataset.est;
    const txt = String(inp.value).trim().replace(',', '.');
    const valor = txt === '' ? null : Number(txt);
    if (valor != null && (Number.isNaN(valor) || valor < col.nota_min || valor > col.nota_max)) { inp.classList.add('mal'); return aviso(`La nota debe estar entre ${col.nota_min} y ${col.nota_max}`, 'error'); }
    inp.classList.remove('mal');
    try {
      if (valor == null) await E.db.remove('remediales', { asignacion_id: asig.id, estudiante_id: est });
      else await E.db.upsert('remediales', [{ colegio_id: E.colegio.id, asignacion_id: asig.id, estudiante_id: est, nota: valor, registrado_por: E.yo.id }], 'asignacion_id,estudiante_id');
      const n = notas.get(est);
      n.remedial = valor;
      n.conRemedial = valor != null && (n.final0 == null || valor > n.final0);
      n.final = n.conRemedial ? valor : n.final0;
      tr.querySelector('[data-final]').innerHTML = verNota(n.final) + (n.conRemedial ? ' <small>(remedial)</small>' : '');
      inp.classList.add('guardado'); setTimeout(() => inp.classList.remove('guardado'), 900);
    } catch (e) { inp.classList.add('mal'); aviso(e.message, 'error'); }
  }));
}
