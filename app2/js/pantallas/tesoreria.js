// Tesorería (REA Phidias §3.11).
// Familia: "Consolidado" con facturas pendientes (deuda, intereses, total; vencidas en rojo),
// pagados recientemente, pagos recientes, estado de cuenta y orden de pago imprimible.
// Admin: cartera, facturación masiva, conceptos, registro de pagos y anulaciones.
import { E, base, perfiles, misEstudiantes, logoHTML } from '../estado.js';
import { esc, aviso, ventana, leerForm, confirmar, nombre, nombreLista, vacio, fecha, hoy } from '../ui.js';
import { cabecera, pestanas, camposHTML, buscar, conectarBuscador } from './comun.js';

const cop = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
export const dinero = (v) => cop.format(Math.round(Number(v) || 0));
// "450.000" y "450000" → 450000 · "4,5" y "4.5" → 4.5 · "450000.00" (de la base de datos) → 450000
const num = (v) => {
  let s = String(v ?? '').trim().replace(/[^\d.,-]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/\.\d{3}(\.|$)/.test(s)) s = s.replace(/\./g, '');
  return Number(s);
};
const MEDIOS = { efectivo: 'Efectivo', transferencia: 'Transferencia', consignacion: 'Consignación', pse: 'PSE', tarjeta: 'Tarjeta', otro: 'Otro' };
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// Estado de cada cobro: pagado, saldo, intereses de mora (simple: % mensual por mes o fracción vencida)
export function estadoCobro(c, pagos, colegio) {
  const pagado = pagos.filter((p) => p.cobro_id === c.id && !p.anulado).reduce((s, p) => s + Number(p.valor), 0);
  const saldo = Math.max(0, Number(c.valor) - pagado);
  const dias = Math.floor((new Date(hoy() + 'T12:00:00') - new Date(c.vence + 'T12:00:00')) / 864e5);
  const vencido = saldo > 0 && dias > 0;
  const tasa = Number(colegio?.interes_mora_mensual || 0);
  const interes = vencido && tasa ? Math.round(saldo * (tasa / 100) * Math.ceil(dias / 30)) : 0;
  return { pagado, saldo, interes, total: saldo + interes, vencido, dias };
}

async function cargar(ests) {
  if (!ests.length) return { cobros: [], pagos: [] };
  const [cobros, pagos] = await Promise.all([
    E.db.select('cobros', { in: { estudiante_id: ests }, order: 'vence' }),
    E.db.select('pagos', { in: { estudiante_id: ests }, order: 'fecha desc' }),
  ]);
  return { cobros: cobros.filter((c) => !c.anulado), pagos };
}

// ---------------------------------------------------------------- Entrada
export async function tesoreria(m, p) {
  if (E.rol === 'admin') return admin(m, p);
  return consolidado(m);
}

// ---------------------------------------------------------------- Familia: consolidado
async function consolidado(m) {
  const ests = await misEstudiantes();
  await perfiles(ests);
  const { cobros, pagos } = await cargar(ests);
  const est = (c) => estadoCobro(c, pagos, E.colegio);
  const pendientes = cobros.filter((c) => est(c).saldo > 0);
  const pagados = cobros.filter((c) => est(c).saldo === 0).sort((a, b) => (a.vence < b.vence ? 1 : -1)).slice(0, 8);
  const tot = pendientes.reduce((s, c) => { const e = est(c); s.deuda += e.saldo; s.interes += e.interes; s.total += e.total; return s; }, { deuda: 0, interes: 0, total: 0 });
  const recientes = pagos.filter((x) => !x.anulado).slice(0, 8);

  m.innerHTML = cabecera('Consolidado de tesorería', { acciones: `
      ${ests.map((id) => `<a class="btn" href="#/estado-cuenta/${id}">📄 Estado de cuenta${ests.length > 1 ? ' · ' + esc(E.perfiles.get(id)?.nombres || '') : ''}</a>`).join('')}
      ${pendientes.length ? '<button class="btn btn-primario" data-pagar>💳 Pagar obligaciones</button>' : ''}` }) + `
    <section class="tarjeta">
      <h2 class="${pendientes.length ? 'alerta' : ''}">Facturas pendientes</h2>
      ${pendientes.length ? `<div class="tabla-envoltura"><table class="tabla tabla-dinero">
        <thead><tr><th>Periodo</th><th>Vence</th><th>Estudiante</th><th>Deuda</th><th>Intereses</th><th>Deuda total</th></tr></thead>
        <tbody>${pendientes.map((c) => { const e = est(c); return `
          <tr class="${e.vencido ? 'vencido' : ''}"><th scope="row"><button class="btn-link" data-cobro="${c.id}">${esc(c.descripcion)} <small>#${c.numero}</small></button></th>
          <td>${fecha(c.vence)}${e.vencido ? ` <small class="alerta">(${e.dias} días)</small>` : ''}</td><td>${esc(nombre(E.perfiles.get(c.estudiante_id)))}</td>
          <td>${dinero(e.saldo)}</td><td>${dinero(e.interes)}</td><td><b>${dinero(e.total)}</b></td></tr>`; }).join('')}</tbody>
        <tfoot><tr><th colspan="3">Deuda total</th><td>${dinero(tot.deuda)}</td><td>${dinero(tot.interes)}</td><td><b>${dinero(tot.total)}</b></td></tr></tfoot>
      </table></div>` : '<p class="ok">✅ Estás al día. No tienes facturas pendientes.</p>'}
    </section>
    <section class="tarjeta">
      <h2>Facturas pagadas recientemente</h2>
      ${pagados.length ? `<div class="tabla-envoltura"><table class="tabla tabla-dinero"><thead><tr><th>Periodo</th><th>Vence</th><th>Estudiante</th><th>Valor pagado</th></tr></thead>
        <tbody>${pagados.map((c) => `<tr><th scope="row"><button class="btn-link" data-cobro="${c.id}">${esc(c.descripcion)} <small>#${c.numero}</small></button></th><td>${fecha(c.vence)}</td><td>${esc(nombre(E.perfiles.get(c.estudiante_id)))}</td><td>${dinero(est(c).pagado)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="ayuda">No hay facturas pagadas.</p>'}
    </section>
    <section class="tarjeta">
      <h2>Pagos recientes</h2>
      ${recientes.length ? `<div class="tabla-envoltura"><table class="tabla tabla-dinero"><thead><tr><th>Número</th><th>Fecha de pago</th><th>Medio</th><th>Aplicado</th></tr></thead>
        <tbody>${recientes.map((x) => `<tr><th scope="row">Pago #${x.numero}</th><td>${fecha(x.fecha)}</td><td>${MEDIOS[x.medio]}</td><td>${dinero(x.valor)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="ayuda">No hay pagos registrados.</p>'}
    </section>`;
  m.querySelectorAll('[data-cobro]').forEach((b) => (b.onclick = () => detalleCobro(cobros.find((c) => c.id === b.dataset.cobro), pagos)));
  m.querySelector('[data-pagar]')?.addEventListener('click', () => ordenDePago(pendientes, pagos));
}

function detalleCobro(c, pagos) {
  const e = estadoCobro(c, pagos, E.colegio);
  const ps = pagos.filter((p) => p.cobro_id === c.id && !p.anulado);
  return ventana({
    titulo: `${c.descripcion} · #${c.numero}`,
    html: `<dl class="datos">
        <div><dt>Estudiante</dt><dd>${esc(nombre(E.perfiles.get(c.estudiante_id)))}</dd></div>
        <div><dt>Vence</dt><dd class="${e.vencido ? 'alerta' : ''}">${fecha(c.vence)}</dd></div>
        <div><dt>Valor</dt><dd>${dinero(c.valor)}</dd></div>
        <div><dt>Pagado</dt><dd>${dinero(e.pagado)}</dd></div>
        <div><dt>Saldo</dt><dd>${dinero(e.saldo)}</dd></div>
        <div><dt>Intereses de mora</dt><dd>${dinero(e.interes)}</dd></div>
        <div><dt>Total a pagar</dt><dd><b>${dinero(e.total)}</b></dd></div>
      </dl>
      <h3 class="sub">Pagos aplicados</h3>
      ${ps.length ? `<div class="lista">${ps.map((p) => `<div class="fila"><span class="crece"><b>Pago #${p.numero} · ${dinero(p.valor)}</b><small>${fecha(p.fecha)} · ${MEDIOS[p.medio]}${p.referencia ? ' · Ref. ' + esc(p.referencia) : ''}</small></span></div>`).join('')}</div>` : '<p class="ayuda">Sin pagos.</p>'}`,
    botones: e.saldo > 0 && E.rol !== 'admin' ? [{ texto: '🖨 Orden de pago', valor: 'orden' }] : [],
  }).then((v) => v === 'orden' && ordenDePago([c], pagos));
}

// Orden de pago imprimible (para pagar en banco o corresponsal). PSE en línea queda pendiente de convenio.
function ordenDePago(cobros, pagos) {
  const filas = cobros.map((c) => ({ c, e: estadoCobro(c, pagos, E.colegio) }));
  const total = filas.reduce((s, f) => s + f.e.total, 0);
  const ref = 'CX' + Date.now().toString().slice(-8);
  ventana({
    titulo: 'Pagar obligaciones',
    html: `
      <div class="aviso-caja">💳 <b>Pago en línea (PSE):</b> se activará cuando el colegio configure su convenio con la pasarela de pagos. Mientras tanto, imprime o descarga esta orden y págala en el banco o corresponsal indicado por el colegio.</div>
      <article class="boletin orden-pago">
        <header class="boletin-cab"><div>${logoHTML('logo')}</div><div><h2>${esc(E.colegio.nombre)}</h2><p>${esc([E.colegio.nit ? 'NIT ' + E.colegio.nit : '', E.colegio.ciudad].filter(Boolean).join(' · '))}</p><p><b>Orden de pago · Ref. ${ref}</b> · ${fecha(hoy())}</p></div></header>
        <table class="tabla tabla-dinero"><thead><tr><th>Concepto</th><th>Estudiante</th><th>Vence</th><th>Saldo</th><th>Intereses</th><th>Total</th></tr></thead>
          <tbody>${filas.map(({ c, e }) => `<tr><th scope="row">${esc(c.descripcion)} #${c.numero}</th><td>${esc(nombreLista(E.perfiles.get(c.estudiante_id)))}</td><td>${fecha(c.vence)}</td><td>${dinero(e.saldo)}</td><td>${dinero(e.interes)}</td><td>${dinero(e.total)}</td></tr>`).join('')}</tbody>
          <tfoot><tr><th colspan="5">TOTAL A PAGAR</th><td><b>${dinero(total)}</b></td></tr></tfoot></table>
        <p class="codigo-barras" aria-hidden="true">${ref.split('').map((ch) => `<i style="width:${(ch.charCodeAt(0) % 3) + 1}px"></i>`).join('')}${'<i></i>'.repeat(30)}</p>
        <p class="escala">Presente esta orden en el banco. Referencia de pago: <b>${ref}</b>.</p>
      </article>`,
    botones: [{ texto: 'Cerrar' }, { texto: '🖨 Imprimir / PDF', antes: () => { document.body.classList.add('imprimiendo-ventana'); window.print(); document.body.classList.remove('imprimiendo-ventana'); return false; } }],
  });
}

// ---------------------------------------------------------------- Estado de cuenta (familia y admin)
export async function estadoCuenta(m, p) {
  await perfiles([p.est]);
  const est = E.perfiles.get(p.est);
  const { cobros, pagos } = await cargar([p.est]);
  const filas = cobros.map((c) => ({ c, e: estadoCobro(c, pagos, E.colegio) }));
  const tot = filas.reduce((s, { e }) => ({ valor: s.valor + e.saldo + e.pagado, pagado: s.pagado + e.pagado, saldo: s.saldo + e.saldo, interes: s.interes + e.interes }), { valor: 0, pagado: 0, saldo: 0, interes: 0 });
  const admin = E.rol === 'admin';
  m.innerHTML = `
    <div class="cabecera no-imprimir"><a class="btn-icono" href="#/tesoreria" aria-label="Volver">←</a><h1 class="titulo">Estado de cuenta</h1>
      <div class="acciones">${admin ? '<button class="btn" data-cobro-nuevo>＋ Cobro</button>' : ''}<button class="btn btn-primario" data-imprimir>🖨 Imprimir</button></div></div>
    <article class="boletin">
      <header class="boletin-cab"><div>${logoHTML('logo')}</div><div><h2>${esc(E.colegio.nombre)}</h2><p><b>Estado de cuenta a ${fecha(hoy())}</b></p><p>${esc(nombreLista(est))}</p></div></header>
      <div class="cifras pequenas no-borde">
        <span class="cifra"><b>${dinero(tot.valor)}</b><span>Facturado</span></span>
        <span class="cifra"><b>${dinero(tot.pagado)}</b><span>Pagado</span></span>
        <span class="cifra"><b class="${tot.saldo ? 'alerta' : 'ok'}">${dinero(tot.saldo + tot.interes)}</b><span>Saldo con intereses</span></span>
      </div>
      ${filas.length ? `<div class="tabla-envoltura"><table class="tabla tabla-dinero">
        <thead><tr><th>#</th><th>Concepto</th><th>Vence</th><th>Valor</th><th>Pagado</th><th>Saldo</th><th>Intereses</th>${admin ? '<th class="no-imprimir"></th>' : ''}</tr></thead>
        <tbody>${filas.map(({ c, e }) => `<tr class="${e.vencido ? 'vencido' : ''}"><td>${c.numero}</td><th scope="row">${esc(c.descripcion)}</th><td>${fecha(c.vence)}</td><td>${dinero(c.valor)}</td><td>${dinero(e.pagado)}</td><td>${e.saldo ? dinero(e.saldo) : '✅'}</td><td>${dinero(e.interes)}</td>
          ${admin ? `<td class="acciones-celda no-imprimir">${e.saldo ? `<button class="btn btn-chico" data-pagar="${c.id}">Registrar pago</button>` : ''}<button class="btn-icono" data-anular="${c.id}" title="Anular cobro" aria-label="Anular cobro">🗑</button></td>` : ''}</tr>`).join('')}</tbody>
      </table></div>` : vacio('Sin cobros registrados.')}
      <h3 class="sub">Pagos</h3>
      ${pagos.length ? `<div class="tabla-envoltura"><table class="tabla tabla-dinero"><thead><tr><th>Pago</th><th>Fecha</th><th>Aplicado a</th><th>Medio</th><th>Valor</th>${admin ? '<th class="no-imprimir"></th>' : ''}</tr></thead>
        <tbody>${pagos.map((x) => `<tr class="${x.anulado ? 'tachado' : ''}"><td>#${x.numero}</td><td>${fecha(x.fecha)}</td><td>${esc(cobros.find((c) => c.id === x.cobro_id)?.descripcion || '')}</td><td>${MEDIOS[x.medio]}${x.referencia ? ' · ' + esc(x.referencia) : ''}</td><td>${dinero(x.valor)}${x.anulado ? ' (anulado)' : ''}</td>
          ${admin ? `<td class="no-imprimir">${x.anulado ? '' : `<button class="btn-icono" data-anular-pago="${x.id}" title="Anular pago" aria-label="Anular pago">🗑</button>`}</td>` : ''}</tr>`).join('')}</tbody></table></div>` : '<p class="ayuda">Sin pagos.</p>'}
      ${Number(E.colegio.interes_mora_mensual) ? `<p class="escala">Intereses de mora: ${E.colegio.interes_mora_mensual}% mensual sobre el saldo vencido.</p>` : ''}
    </article>`;
  const recargar = () => estadoCuenta(m, p);
  m.querySelectorAll('[data-pagar]').forEach((b) => (b.onclick = async () => { if (await registrarPago(cobros.find((c) => c.id === b.dataset.pagar), pagos)) recargar(); }));
  m.querySelectorAll('[data-anular]').forEach((b) => (b.onclick = async () => {
    if (!(await confirmar('¿Anular el cobro?', 'Dejará de aparecer como deuda. Los pagos aplicados quedan en el historial.', 'Anular'))) return;
    try { await E.db.update('cobros', { anulado: true }, { id: b.dataset.anular }); aviso('Cobro anulado'); recargar(); } catch (e) { aviso(e.message, 'error'); }
  }));
  m.querySelectorAll('[data-anular-pago]').forEach((b) => (b.onclick = async () => {
    if (!(await confirmar('¿Anular el pago?', 'El saldo del cobro volverá a quedar pendiente.', 'Anular'))) return;
    try { await E.db.update('pagos', { anulado: true }, { id: b.dataset.anularPago }); aviso('Pago anulado'); recargar(); } catch (e) { aviso(e.message, 'error'); }
  }));
  m.querySelector('[data-cobro-nuevo]')?.addEventListener('click', async () => { if (await facturar(await base(), [p.est])) recargar(); });
}

async function registrarPago(c, pagos) {
  const e = estadoCobro(c, pagos, E.colegio);
  const r = await ventana({
    titulo: `Registrar pago · ${c.descripcion}`,
    html: `<p class="ayuda">Saldo: <b>${dinero(e.saldo)}</b>${e.interes ? ` + intereses ${dinero(e.interes)}` : ''}</p>` + camposHTML([
      { name: 'valor', label: 'Valor pagado (COP)', tipo: 'dinero', def: e.saldo },
      { name: 'fecha', label: 'Fecha del pago', tipo: 'date', def: hoy() },
      { name: 'medio', label: 'Medio de pago', tipo: 'select', opciones: Object.entries(MEDIOS) },
      { name: 'referencia', label: 'Referencia / número de recibo (opcional)' },
      { name: 'pagado_por', label: 'Pagó (nombre, opcional)' },
    ]),
    botones: [{ texto: 'Cancelar' }, { texto: 'Registrar', antes: async (caja) => {
      const d = leerForm(caja);
      const valor = num(d.valor);
      if (!(valor > 0)) throw new Error('Escribe el valor pagado.');
      if (valor > e.saldo + 0.5) throw new Error(`El valor supera el saldo (${dinero(e.saldo)}).`);
      await E.db.insert('pagos', [{ colegio_id: E.colegio.id, cobro_id: c.id, estudiante_id: c.estudiante_id, valor, fecha: d.fecha || hoy(), medio: d.medio, referencia: d.referencia || null, pagado_por: d.pagado_por || null, registrado_por: E.yo.id }]);
      return true;
    } }],
  });
  if (r) aviso('Pago registrado');
  return r;
}

// ---------------------------------------------------------------- Admin
const TABS = [['cartera', 'Cartera'], ['facturar', 'Facturar'], ['pagos', 'Pagos'], ['conceptos', 'Conceptos']];

async function estudiantesActivos(b) {
  const mats = (await E.db.select('matriculas', { eq: { colegio_id: E.colegio.id } })).filter((x) => x.estado === 'activa' && b.cursos.some((c) => c.id === x.curso_id));
  await perfiles(mats.map((x) => x.estudiante_id));
  return mats;
}

async function admin(m, p) {
  const tab = TABS.some((t) => t[0] === p.tab) ? p.tab : 'cartera';
  const b = await base();
  let html = '', acciones = '';
  if (tab === 'cartera') {
    const mats = await estudiantesActivos(b);
    const [cobros, pagos] = await Promise.all([E.db.select('cobros', { eq: { colegio_id: E.colegio.id } }), E.db.select('pagos', { eq: { colegio_id: E.colegio.id } })]);
    const vivos = cobros.filter((c) => !c.anulado);
    const porEst = new Map();
    for (const c of vivos) {
      const e = estadoCobro(c, pagos, E.colegio);
      const x = porEst.get(c.estudiante_id) || { saldo: 0, vencido: 0, interes: 0, n: 0 };
      x.saldo += e.saldo; x.interes += e.interes; if (e.vencido) { x.vencido += e.saldo; x.n++; }
      porEst.set(c.estudiante_id, x);
    }
    const soloVencidos = p.vencidos === '1';
    const filas = mats.map((mt) => ({ mt, x: porEst.get(mt.estudiante_id) || { saldo: 0, vencido: 0, interes: 0, n: 0 } }))
      .filter(({ x }) => !soloVencidos || x.vencido > 0)
      .sort((a, z) => z.x.vencido - a.x.vencido || nombreLista(E.perfiles.get(a.mt.estudiante_id)).localeCompare(nombreLista(E.perfiles.get(z.mt.estudiante_id))));
    const tot = [...porEst.values()].reduce((s, x) => ({ saldo: s.saldo + x.saldo, vencido: s.vencido + x.vencido, interes: s.interes + x.interes }), { saldo: 0, vencido: 0, interes: 0 });
    const recaudado = pagos.filter((x) => !x.anulado).reduce((s, x) => s + Number(x.valor), 0);
    html = `
      <div class="cifras">
        <span class="cifra"><b>${dinero(tot.saldo)}</b><span>Cartera total</span></span>
        <span class="cifra"><b class="${tot.vencido ? 'alerta' : ''}">${dinero(tot.vencido)}</b><span>Vencida</span></span>
        <span class="cifra"><b>${dinero(tot.interes)}</b><span>Intereses</span></span>
        <span class="cifra"><b class="ok">${dinero(recaudado)}</b><span>Recaudado</span></span>
      </div>
      <div class="tarjeta-cab">${buscar('Buscar estudiante…')}<label class="check"><input type="checkbox" data-vencidos ${soloVencidos ? 'checked' : ''}> Solo con deuda vencida</label></div>
      ${filas.length ? `<div class="tabla-envoltura"><table class="tabla tabla-dinero"><thead><tr><th>Estudiante</th><th>Curso</th><th>Saldo</th><th>Vencido</th><th></th></tr></thead>
        <tbody>${filas.map(({ mt, x }) => { const e = E.perfiles.get(mt.estudiante_id); return `<tr class="${x.vencido ? 'vencido' : ''}" data-buscar="${esc(nombreLista(e))}"><th scope="row">${esc(nombreLista(e))}</th><td>${esc(b.cursoPorId.get(mt.curso_id)?.nombre || '')}</td><td>${dinero(x.saldo)}</td><td>${x.vencido ? dinero(x.vencido) + ` <small>(${x.n})</small>` : '—'}</td><td><a class="btn btn-chico" href="#/estado-cuenta/${mt.estudiante_id}">Estado de cuenta</a></td></tr>`; }).join('')}</tbody></table></div>` : vacio('No hay estudiantes con esos criterios.')}`;
  }
  if (tab === 'facturar') {
    html = `<section class="tarjeta"><h2>Facturación masiva</h2><p class="ayuda">Crea el mismo cobro (por ejemplo la pensión del mes) para todos los estudiantes de un grupo.</p><button class="btn btn-primario" data-facturar>＋ Nueva facturación</button></section>`;
  }
  if (tab === 'pagos') {
    const pagos = await E.db.select('pagos', { eq: { colegio_id: E.colegio.id }, order: 'creado_en desc', limit: 100 });
    const cobros = pagos.length ? await E.db.select('cobros', { in: { id: [...new Set(pagos.map((x) => x.cobro_id))] } }) : [];
    await perfiles(pagos.map((x) => x.estudiante_id));
    html = pagos.length ? `<div class="tabla-envoltura"><table class="tabla tabla-dinero"><thead><tr><th>Pago</th><th>Fecha</th><th>Estudiante</th><th>Concepto</th><th>Medio</th><th>Valor</th></tr></thead>
      <tbody>${pagos.map((x) => `<tr class="${x.anulado ? 'tachado' : ''}"><td>#${x.numero}</td><td>${fecha(x.fecha)}</td><td><a href="#/estado-cuenta/${x.estudiante_id}">${esc(nombreLista(E.perfiles.get(x.estudiante_id)))}</a></td><td>${esc(cobros.find((c) => c.id === x.cobro_id)?.descripcion || '')}</td><td>${MEDIOS[x.medio]}</td><td>${dinero(x.valor)}${x.anulado ? ' (anulado)' : ''}</td></tr>`).join('')}</tbody></table></div>` : vacio('Aún no hay pagos registrados.');
  }
  if (tab === 'conceptos') {
    acciones = '<button class="btn btn-primario" data-concepto>＋ Concepto</button>';
    const cs = await E.db.select('conceptos_cobro', { eq: { colegio_id: E.colegio.id }, order: 'nombre' });
    html = `
      <section class="tarjeta"><h2>Intereses de mora</h2><div class="form en-fila">${camposHTML([{ name: 'interes_mora_mensual', label: '% mensual sobre saldo vencido (0 = sin intereses)', tipo: 'number' }], E.colegio)}<button class="btn" data-guardar-mora>Guardar</button></div></section>
      ${cs.length ? `<div class="lista">${cs.map((c) => `<button class="fila fila-boton ${c.activo ? '' : 'inactivo'}" data-editar-concepto="${c.id}"><span>🏷️</span><span><b>${esc(c.nombre)}</b><small>${dinero(c.valor_defecto)}${c.activo ? '' : ' · inactivo'}</small></span></button>`).join('')}</div>` : vacio('Crea conceptos como Pensión, Matrícula, Transporte, Alimentación…', '<button class="btn" data-conceptos-base>Agregar los más comunes</button>')}`;
  }
  m.innerHTML = cabecera('Tesorería', { acciones }) + pestanas(TABS, tab, '#/tesoreria?tab=') + `<div class="contenido">${html}</div>`;
  conectarBuscador(m);
  const recargar = () => admin(m, p);
  m.querySelector('[data-vencidos]')?.addEventListener('change', (e) => { location.hash = `#/tesoreria?tab=cartera${e.target.checked ? '&vencidos=1' : ''}`; });
  m.querySelector('[data-facturar]')?.addEventListener('click', async () => { if (await facturar(b, null)) location.hash = '#/tesoreria?tab=cartera'; });
  const camposC = [{ name: 'nombre', label: 'Nombre (ej. Pensión)', req: true }, { name: 'valor_defecto', label: 'Valor por defecto (COP)', tipo: 'dinero' }, { name: 'activo', label: 'Activo', tipo: 'checkbox', def: true }];
  const { editar } = await import('./comun.js');
  m.querySelector('[data-concepto]')?.addEventListener('click', async () => { if (await editar({ titulo: 'Nuevo concepto', tabla: 'conceptos_cobro', campos: camposC })) recargar(); });
  m.querySelectorAll('[data-editar-concepto]').forEach((b2) => (b2.onclick = async () => {
    const [fila] = await E.db.select('conceptos_cobro', { eq: { id: b2.dataset.editarConcepto } });
    if (await editar({ titulo: 'Concepto', tabla: 'conceptos_cobro', campos: camposC, fila })) recargar();
  }));
  m.querySelector('[data-conceptos-base]')?.addEventListener('click', async () => {
    try {
      await E.db.insert('conceptos_cobro', [['Pensión', 450000], ['Matrícula', 600000], ['Transporte', 180000], ['Alimentación', 220000], ['Salida pedagógica', 50000], ['Derechos de grado', 300000]].map(([nombre, v]) => ({ colegio_id: E.colegio.id, nombre, valor_defecto: v })));
      aviso('Conceptos agregados'); recargar();
    } catch (e) { aviso(e.message, 'error'); }
  });
  m.querySelector('[data-guardar-mora]')?.addEventListener('click', async () => {
    const v = num(m.querySelector('[name=interes_mora_mensual]').value || 0);
    if (Number.isNaN(v) || v < 0 || v > 10) return aviso('Escribe un porcentaje entre 0 y 10.', 'error');
    try { await E.db.update('colegios', { interes_mora_mensual: v }, { id: E.colegio.id }); E.colegio.interes_mora_mensual = v; aviso('Guardado'); } catch (e) { aviso(e.message, 'error'); }
  });
}

// Crea cobros para varios estudiantes (o uno). Devuelve true si creó.
async function facturar(b, soloEsts) {
  const conceptos = (await E.db.select('conceptos_cobro', { eq: { colegio_id: E.colegio.id }, order: 'nombre' })).filter((c) => c.activo);
  const mats = await estudiantesActivos(b);
  const mes = new Date();
  const vence = new Date(mes.getFullYear(), mes.getMonth() + 1, 5);
  const venceTxt = `${vence.getFullYear()}-${String(vence.getMonth() + 1).padStart(2, '0')}-05`;
  const r = await ventana({
    titulo: soloEsts ? 'Nuevo cobro' : 'Facturación masiva',
    html: camposHTML([
      { name: 'concepto_id', label: 'Concepto', tipo: 'select', vacio: 'Sin concepto', opciones: conceptos.map((c) => [c.id, c.nombre]) },
      { name: 'descripcion', label: 'Descripción (aparece en la factura)', def: `Pensión ${MESES[(mes.getMonth() + 1) % 12]} ${mes.getMonth() === 11 ? mes.getFullYear() + 1 : mes.getFullYear()}` },
      { name: 'valor', label: 'Valor (COP)', tipo: 'dinero', def: '' },
      { name: 'vence', label: 'Fecha de vencimiento', tipo: 'date', def: venceTxt },
      ...(soloEsts ? [] : [{ name: 'para', label: 'Para', tipo: 'select', opciones: [['todos', `Todos los estudiantes (${mats.length})`], ...b.grados.map((g) => ['g:' + g.id, 'Grado ' + g.nombre]), ...b.cursos.map((c) => ['c:' + c.id, 'Curso ' + c.nombre])] }]),
    ]) + '<p class="ayuda" data-cuantos></p>',
    alAbrir: (caja) => {
      const sel = caja.querySelector('[name=concepto_id]');
      sel.onchange = () => {
        const c = conceptos.find((x) => x.id === sel.value);
        if (c) { caja.querySelector('[name=valor]').value = c.valor_defecto; const d = caja.querySelector('[name=descripcion]'); if (!d.dataset.tocado) d.value = c.nombre + ' ' + MESES[(mes.getMonth() + 1) % 12] + ' ' + (mes.getMonth() === 11 ? mes.getFullYear() + 1 : mes.getFullYear()); }
      };
      caja.querySelector('[name=descripcion]').oninput = (e) => (e.target.dataset.tocado = '1');
      const para = caja.querySelector('[name=para]');
      const contar = () => { if (!para) return; caja.querySelector('[data-cuantos]').textContent = `Se crearán ${destinatarios(para.value).length} cobro(s).`; };
      para?.addEventListener('change', contar); contar();
    },
    botones: [{ texto: 'Cancelar' }, { texto: 'Crear cobros', antes: async (caja) => {
      const d = leerForm(caja);
      const valor = num(d.valor);
      if (!d.descripcion) throw new Error('Escribe la descripción.');
      if (!(valor > 0)) throw new Error('Escribe el valor.');
      if (!d.vence) throw new Error('Pon la fecha de vencimiento.');
      const ests = soloEsts || destinatarios(d.para).map((x) => x.estudiante_id);
      if (!ests.length) throw new Error('No hay estudiantes en ese grupo.');
      if (!soloEsts && !(await confirmar('¿Crear los cobros?', `${ests.length} cobro(s) de ${dinero(valor)} · vencen el ${fecha(d.vence)}.`, 'Crear'))) return false;
      const filas = ests.map((id) => ({ colegio_id: E.colegio.id, estudiante_id: id, concepto_id: d.concepto_id || null, descripcion: d.descripcion, valor, vence: d.vence, creado_por: E.yo.id }));
      for (let i = 0; i < filas.length; i += 200) await E.db.insert('cobros', filas.slice(i, i + 200));
      aviso(`${filas.length} cobro(s) creado(s)`);
      return true;
    } }],
  });
  function destinatarios(v) {
    if (!v || v === 'todos') return mats;
    if (v.startsWith('c:')) return mats.filter((x) => x.curso_id === v.slice(2));
    const g = v.slice(2);
    return mats.filter((x) => b.cursoPorId.get(x.curso_id)?.grado_id === g);
  }
  return r;
}
