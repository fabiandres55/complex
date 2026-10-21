// Comunicación (REA Phidias §3.1): Bandeja de entrada, Redactar mensaje, Enviados.
// Mensajes privados con acuse de lectura por destinatario, archivar/eliminar,
// respuestas (si el autor las permite), reenviar, adjuntos y "destacar en cartelera".
import { E, perfiles } from '../estado.js';
import { esc, aviso, ventana, confirmar, nombre, nombreLista, iniciales, vacio, fechaHora, fecha, $$ } from '../ui.js';
import { cabecera, pestanas, buscar, conectarBuscador } from './comun.js';

const BUCKET = 'mensajes';
const peso = (n) => (n == null ? '' : n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
const nombreSeguro = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.\-]+/g, '_').slice(-120);
const corto = (s, n = 90) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n) + '…' : t; };

// Mis filas de destinatario (bandeja)
async function misFilas() {
  return E.db.select('mensaje_destinatarios', { eq: { colegio_id: E.colegio.id, perfil_id: E.yo.id } });
}

export async function contarNoLeidos() {
  try { return (await misFilas()).filter((d) => !d.leido_en && !d.eliminado && !d.archivado).length; } catch { return 0; }
}

// ---------------------------------------------------------------- Bandeja
const TABS = [['entrada', 'Entrada'], ['archivados', 'Archivados'], ['eliminados', 'Eliminados']];

export async function bandeja(m, p) {
  const tab = TABS.some((t) => t[0] === p.tab) ? p.tab : 'entrada';
  const filas = (await misFilas()).filter((d) => (tab === 'eliminados' ? d.eliminado : !d.eliminado && (tab === 'archivados' ? d.archivado : !d.archivado)));
  const msgs = filas.length ? await E.db.select('mensajes', { in: { id: filas.map((d) => d.mensaje_id) }, order: 'creado_en desc' }) : [];
  await perfiles(msgs.map((x) => x.autor_id));
  const fila = new Map(filas.map((d) => [d.mensaje_id, d]));
  const noLeidos = filas.filter((d) => !d.leido_en).length;

  m.innerHTML = cabecera('Bandeja de entrada', { acciones: '<a class="btn btn-primario" href="#/redactar">✏️ Redactar</a>' }) +
    pestanas(TABS, tab, '#/bandeja?tab=') + `
    <div class="contenido">
      ${msgs.length ? `
        <div class="barra-acciones" data-acciones hidden>
          <span data-cuantos></span>
          ${tab !== 'archivados' && tab !== 'eliminados' ? '<button class="btn btn-chico" data-accion="archivar">🗄 Archivar</button>' : ''}
          ${tab !== 'entrada' ? '<button class="btn btn-chico" data-accion="mover">📥 Mover a entrada</button>' : ''}
          ${tab !== 'eliminados' ? '<button class="btn btn-chico btn-peligro" data-accion="eliminar">🗑 Eliminar</button>' : ''}
          <button class="btn btn-chico" data-accion="leido">✓ Marcar leído</button>
        </div>
        ${tab === 'entrada' && noLeidos ? `<p class="ayuda">${noLeidos} sin leer</p>` : ''}
        ${buscar('Buscar en mensajes…')}
        <div class="lista bandeja">${msgs.map((x) => {
          const d = fila.get(x.id);
          const autor = E.perfiles.get(x.autor_id);
          return `
          <div class="fila fila-mensaje ${d.leido_en ? '' : 'sin-leer'}" data-buscar="${esc(nombre(autor) + ' ' + x.asunto + ' ' + x.cuerpo)}">
            <input type="checkbox" data-sel="${x.id}" aria-label="Seleccionar mensaje">
            <a class="crece" href="#/mensaje/${x.id}">
              <span class="linea1"><b>${esc(nombre(autor))}</b><small>${fechaHora(x.creado_en)}</small></span>
              <span class="asunto">${x.destacado ? '📌 ' : ''}${esc(x.asunto)}</span>
              <small>${esc(corto(x.cuerpo))}</small>
            </a>
          </div>`;
        }).join('')}</div>` : vacio(tab === 'entrada' ? 'No tienes mensajes.' : 'No hay mensajes aquí.')}
    </div>`;
  conectarBuscador(m);
  const barra = m.querySelector('[data-acciones]');
  const sel = () => $$('[data-sel]:checked', m).map((c) => c.dataset.sel);
  m.querySelectorAll('[data-sel]').forEach((c) => (c.onchange = () => {
    const n = sel().length;
    barra.hidden = !n;
    barra.querySelector('[data-cuantos]').textContent = `${n} seleccionado(s)`;
  }));
  m.querySelectorAll('[data-accion]').forEach((b) => (b.onclick = async () => {
    const ids = sel();
    const cambio = { archivar: { archivado: true }, eliminar: { eliminado: true }, mover: { archivado: false, eliminado: false }, leido: { leido_en: new Date().toISOString() } }[b.dataset.accion];
    if (b.dataset.accion === 'eliminar' && !(await confirmar('¿Eliminar?', `${ids.length} mensaje(s) pasarán a "Eliminados".`, 'Eliminar'))) return;
    try {
      for (const id of ids) await E.db.update('mensaje_destinatarios', cambio, { mensaje_id: id, perfil_id: E.yo.id });
      aviso('Listo');
      bandeja(m, p);
      window.dispatchEvent(new Event('complex:mensajes'));
    } catch (e) { aviso(e.message, 'error'); }
  }));
}

// ---------------------------------------------------------------- Enviados
export async function enviados(m) {
  const msgs = (await E.db.select('mensajes', { eq: { colegio_id: E.colegio.id, autor_id: E.yo.id }, order: 'creado_en desc' })).filter((x) => !x.autor_eliminado);
  const dest = msgs.length ? await E.db.select('mensaje_destinatarios', { in: { mensaje_id: msgs.map((x) => x.id) } }) : [];
  await perfiles(dest.map((d) => d.perfil_id));
  m.innerHTML = cabecera('Enviados', { acciones: '<a class="btn btn-primario" href="#/redactar">✏️ Redactar</a>' }) + `
    <div class="contenido">
      ${msgs.length ? `${buscar('Buscar en enviados…')}<div class="lista bandeja">${msgs.map((x) => {
        const ds = dest.filter((d) => d.mensaje_id === x.id);
        const leidos = ds.filter((d) => d.leido_en).length;
        const para = ds.slice(0, 3).map((d) => nombre(E.perfiles.get(d.perfil_id))).join(', ') + (ds.length > 3 ? ` y ${ds.length - 3} más` : '');
        return `
          <a class="fila fila-boton fila-mensaje" href="#/mensaje/${x.id}" data-buscar="${esc(para + ' ' + x.asunto + ' ' + x.cuerpo)}">
            <span class="crece">
              <span class="linea1"><b>Para: ${esc(para || '—')}</b><small>${fechaHora(x.creado_en)}</small></span>
              <span class="asunto">${x.destacado ? '📌 ' : ''}${esc(x.asunto)}</span>
              <small class="${leidos === ds.length && ds.length ? 'ok' : ''}">${leidos === ds.length && ds.length ? '✓✓ Leído por todos' : `✓ Leído por ${leidos} de ${ds.length}`}</small>
            </span>
          </a>`;
      }).join('')}</div>` : vacio('No has enviado mensajes.')}
    </div>`;
  conectarBuscador(m);
}

// ---------------------------------------------------------------- Ver mensaje
export async function detalle(m, p) {
  const [x] = await E.db.select('mensajes', { eq: { id: p.id } });
  if (!x) { m.innerHTML = vacio('Ese mensaje no existe o no tienes acceso.'); return; }
  const soyAutor = x.autor_id === E.yo.id;
  const [dest, adj] = await Promise.all([
    E.db.select('mensaje_destinatarios', { eq: { mensaje_id: x.id } }),
    E.db.select('mensaje_adjuntos', { eq: { mensaje_id: x.id } }),
  ]);
  const mia = dest.find((d) => d.perfil_id === E.yo.id);
  if (mia && !mia.leido_en) {
    try { await E.db.update('mensaje_destinatarios', { leido_en: new Date().toISOString() }, { mensaje_id: x.id, perfil_id: E.yo.id }); window.dispatchEvent(new Event('complex:mensajes')); } catch {}
  }
  // hilo: el mensaje al que responde
  const [original] = x.responde_a ? await E.db.select('mensajes', { eq: { id: x.responde_a } }) : [];
  await perfiles([x.autor_id, original?.autor_id, ...dest.map((d) => d.perfil_id)]);
  const autor = E.perfiles.get(x.autor_id);
  const visibles = soyAutor || !x.ocultar_destinatarios ? dest : dest.filter((d) => d.perfil_id === E.yo.id);
  const puedeResponder = !soyAutor && x.permite_respuesta;

  m.innerHTML = cabecera('', { volver: soyAutor ? '#/enviados' : '#/bandeja', acciones: `
      ${puedeResponder ? `<a class="btn btn-primario" href="#/redactar?responder=${x.id}">↩️ Responder</a>` : ''}
      <a class="btn" href="#/redactar?reenviar=${x.id}">↪️ Reenviar</a>
      ${mia ? `<button class="btn" data-archivar>${mia.archivado ? '📥 A entrada' : '🗄 Archivar'}</button>` : ''}
      <button class="btn" onclick="window.print()">🖨</button>
      <button class="btn btn-peligro" data-eliminar aria-label="Eliminar">🗑</button>` }) + `
    <article class="tarjeta mensaje">
      <h1 class="titulo">${x.destacado ? '📌 ' : ''}${esc(x.asunto)}</h1>
      <div class="fila">
        <span class="avatar">${esc(iniciales(autor))}</span>
        <span><b>${esc(nombre(autor))}</b><small>${fechaHora(x.creado_en)}</small></span>
      </div>
      <p class="ayuda">Para: ${visibles.map((d) => `${esc(nombre(E.perfiles.get(d.perfil_id)))}${soyAutor ? (d.leido_en ? ` <span class="ok" title="Leído ${fechaHora(d.leido_en)}">✓✓</span>` : ' <span title="Sin leer">✓</span>') : ''}`).join(', ')}${x.ocultar_destinatarios && !soyAutor ? ' (destinatarios ocultos)' : ''}</p>
      <div class="mensaje-cuerpo">${esc(x.cuerpo).replace(/\n/g, '<br>')}</div>
      ${adj.length ? `<h3 class="sub">Adjuntos</h3><div class="lista">${adj.map((a) => `<button class="fila fila-boton tarjeta-archivo" data-adj="${a.id}"><span class="avatar">📎</span><span><b>${esc(a.nombre)}</b><small>${peso(a.bytes)}</small></span><span class="flecha">↗</span></button>`).join('')}</div>` : ''}
      ${!x.permite_respuesta && !soyAutor ? '<p class="ayuda">Este mensaje no admite respuestas.</p>' : ''}
      ${original ? `<details class="hilo"><summary>Mensaje original de ${esc(nombre(E.perfiles.get(original.autor_id)))} · ${fecha(original.creado_en)}</summary><p><b>${esc(original.asunto)}</b></p><div class="mensaje-cuerpo">${esc(original.cuerpo).replace(/\n/g, '<br>')}</div></details>` : ''}
    </article>
    ${soyAutor ? `<section class="tarjeta"><h2>Confirmación de lectura</h2><div class="lista">${dest.map((d) => `<div class="fila"><span class="crece"><b>${esc(nombreLista(E.perfiles.get(d.perfil_id)))}</b></span>${d.leido_en ? `<small class="ok">✓✓ ${fechaHora(d.leido_en)}</small>` : '<small>Sin leer</small>'}</div>`).join('')}</div></section>` : ''}`;

  m.querySelectorAll('[data-adj]').forEach((b) => (b.onclick = () => abrirAdjunto(adj.find((a) => a.id === b.dataset.adj))));
  m.querySelector('[data-archivar]')?.addEventListener('click', async () => {
    await E.db.update('mensaje_destinatarios', { archivado: !mia.archivado }, { mensaje_id: x.id, perfil_id: E.yo.id });
    aviso(mia.archivado ? 'Movido a la entrada' : 'Archivado');
    location.hash = '#/bandeja';
  });
  m.querySelector('[data-eliminar]').onclick = async () => {
    if (!(await confirmar('¿Eliminar el mensaje?', 'Pasará a "Eliminados".', 'Eliminar'))) return;
    if (mia) await E.db.update('mensaje_destinatarios', { eliminado: true }, { mensaje_id: x.id, perfil_id: E.yo.id });
    else if (soyAutor) await E.db.update('mensajes', { autor_eliminado: true }, { id: x.id });
    aviso('Eliminado');
    location.hash = soyAutor && !mia ? '#/enviados' : '#/bandeja';
  };
}

async function abrirAdjunto(a) {
  const w = E.db.modo === 'demo' ? null : window.open('', '_blank');
  try {
    const url = await E.db.urlArchivo(BUCKET, a.ruta);
    if (E.db.modo === 'demo') { const el = document.createElement('a'); el.href = url; el.download = a.nombre; document.body.appendChild(el); el.click(); el.remove(); }
    else if (w) w.location = url; else location.href = url;
  } catch (e) { w?.close(); aviso(e.message, 'error'); }
}

// ---------------------------------------------------------------- Redactar
export async function redactar(m, p) {
  const contactos = await E.db.rpc('mis_contactos', { p_colegio: E.colegio.id });
  const elegidos = new Set();
  let asunto = '', cuerpo = '', respondeA = null;
  if (p.para) p.para.split(',').forEach((id) => elegidos.add(id));
  const base = p.responder || p.reenviar;
  if (base) {
    const [x] = await E.db.select('mensajes', { eq: { id: base } });
    if (x) {
      await perfiles([x.autor_id]);
      const quien = nombre(E.perfiles.get(x.autor_id));
      if (p.responder) {
        elegidos.add(x.autor_id);
        respondeA = x.id;
        asunto = /^re:/i.test(x.asunto) ? x.asunto : 'Re: ' + x.asunto;
        cuerpo = `\n\n— El ${fechaHora(x.creado_en)}, ${quien} escribió:\n> ${x.cuerpo.replace(/\n/g, '\n> ')}`;
      } else {
        asunto = /^rv:/i.test(x.asunto) ? x.asunto : 'Rv: ' + x.asunto;
        cuerpo = `\n\n— Mensaje reenviado —\nDe: ${quien}\nFecha: ${fechaHora(x.creado_en)}\nAsunto: ${x.asunto}\n\n${x.cuerpo}`;
      }
    }
  }
  // Al responder, el autor puede no estar en mis contactos: lo agregamos a la lista
  const porId = new Map();
  for (const c of contactos) if (!porId.has(c.perfil_id)) porId.set(c.perfil_id, c);
  for (const id of elegidos) if (!porId.has(id)) {
    await perfiles([id]);
    const pe = E.perfiles.get(id) || {};
    contactos.push({ perfil_id: id, nombres: pe.nombres, apellidos: pe.apellidos, grupo: 'Conversación', detalle: '' });
    porId.set(id, contactos.at(-1));
  }
  const grupos = new Map();
  for (const c of contactos) { if (!grupos.has(c.grupo)) grupos.set(c.grupo, []); grupos.get(c.grupo).push(c); }
  const ordenGrupo = (g) => (g === 'Conversación' ? 0 : g === 'Administración' ? 2 : g === 'Mi familia' ? 1 : 3);
  const listaGrupos = [...grupos.entries()].sort((a, b) => ordenGrupo(a[0]) - ordenGrupo(b[0]) || a[0].localeCompare(b[0]));
  const puedeDestacar = E.rol === 'admin' || E.rol === 'profesor';

  m.innerHTML = cabecera(p.responder ? 'Responder' : p.reenviar ? 'Reenviar' : 'Redactar mensaje', { volver: '#/bandeja' }) + `
    <section class="tarjeta">
      <div class="para">
        <div class="para-cab"><b>Para:</b> <span data-chips></span></div>
        <button class="btn btn-chico" data-elegir>👥 Elegir destinatarios</button>
      </div>
      <div class="form">
        <label>Asunto<input name="asunto" value="${esc(asunto)}" maxlength="200"></label>
        <label>Mensaje<textarea name="cuerpo" rows="10">${esc(cuerpo)}</textarea></label>
        <label>Adjuntos<input type="file" name="adjuntos" multiple><small class="ayuda">Hasta 25 MB por archivo${E.db.modo === 'demo' ? ' (2 MB en el demo)' : ''}</small></label>
        <label class="check"><input type="checkbox" name="permite_respuesta" checked> Permitir respuestas</label>
        <label class="check"><input type="checkbox" name="ocultar_destinatarios"> Ocultar destinatarios (cada uno lo ve como mensaje individual)</label>
        ${puedeDestacar ? '<label class="check"><input type="checkbox" name="destacado"> 📌 Destacar en la cartelera</label>' : ''}
      </div>
      <div class="pie-fijo"><button class="btn btn-primario btn-ancho" data-enviar>Enviar</button></div>
    </section>`;

  const chips = m.querySelector('[data-chips]');
  const pintarChips = () => {
    chips.innerHTML = elegidos.size ? [...elegidos].map((id) => `<span class="chip chip-persona">${esc(nombre(porId.get(id)))} <button data-quitar="${id}" aria-label="Quitar">×</button></span>`).join(' ') : '<span class="ayuda">Nadie todavía</span>';
    chips.querySelectorAll('[data-quitar]').forEach((b) => (b.onclick = () => { elegidos.delete(b.dataset.quitar); pintarChips(); }));
  };
  pintarChips();

  m.querySelector('[data-elegir]').onclick = async () => {
    const sel = await ventana({
      titulo: 'Elegir destinatarios',
      html: `${buscar('Buscar persona…')}
        ${listaGrupos.length ? listaGrupos.map(([g, l]) => `
          <details class="grupo-contactos" ${listaGrupos.length <= 3 || l.some((c) => elegidos.has(c.perfil_id)) ? 'open' : ''}>
            <summary><b>${esc(g)}</b> <small>(${l.length})</small> <button class="btn-link" data-todos="${esc(g)}">Todos</button></summary>
            <div class="lista">${l.sort((a, b) => nombreLista(a).localeCompare(nombreLista(b))).map((c) => `
              <label class="fila check" data-buscar="${esc(nombreLista(c) + ' ' + g + ' ' + (c.detalle || ''))}"><input type="checkbox" data-c="${c.perfil_id}" data-g="${esc(g)}" ${elegidos.has(c.perfil_id) ? 'checked' : ''}><span><b>${esc(nombreLista(c))}</b>${c.detalle ? `<small>${esc(c.detalle)}</small>` : ''}</span></label>`).join('')}</div>
          </details>`).join('') : vacio('No tienes contactos todavía.')}`,
      alAbrir: (caja) => {
        conectarBuscador(caja);
        // marcar a alguien en un grupo lo marca en todos los grupos donde aparece
        caja.addEventListener('change', (e) => {
          const c = e.target.closest('[data-c]');
          if (c) caja.querySelectorAll(`[data-c="${c.dataset.c}"]`).forEach((o) => (o.checked = c.checked));
        });
        caja.querySelectorAll('[data-todos]').forEach((b) => (b.onclick = (e) => {
          e.preventDefault();
          const cs = [...caja.querySelectorAll(`[data-g="${CSS.escape(b.dataset.todos)}"]`)];
          const marcar = cs.some((c) => !c.checked);
          cs.forEach((c) => { caja.querySelectorAll(`[data-c="${c.dataset.c}"]`).forEach((o) => (o.checked = marcar)); });
        }));
      },
      botones: [{ texto: 'Cancelar' }, { texto: 'Listo', antes: (caja) => new Set([...caja.querySelectorAll('[data-c]:checked')].map((c) => c.dataset.c)) }],
    });
    if (sel) { elegidos.clear(); sel.forEach((id) => elegidos.add(id)); pintarChips(); }
  };

  m.querySelector('[data-enviar]').onclick = async (ev) => {
    const b = ev.target;
    const f = (n) => m.querySelector(`[name=${n}]`);
    const datos = {
      asunto: f('asunto').value.trim(), cuerpo: f('cuerpo').value.trim(),
      permite_respuesta: f('permite_respuesta').checked, ocultar_destinatarios: f('ocultar_destinatarios').checked,
      destacado: !!f('destacado')?.checked,
    };
    const archivos = [...f('adjuntos').files];
    if (!elegidos.size) return aviso('Elige al menos un destinatario.', 'error');
    if (!datos.asunto) return aviso('Escribe el asunto.', 'error');
    if (!datos.cuerpo && !archivos.length) return aviso('Escribe el mensaje.', 'error');
    if (archivos.some((a) => a.size > 25 * 1024 * 1024)) return aviso('Un adjunto pesa más de 25 MB.', 'error');
    b.disabled = true; b.textContent = 'Enviando…';
    try {
      const [x] = await E.db.insert('mensajes', [{ colegio_id: E.colegio.id, autor_id: E.yo.id, responde_a: respondeA, ...datos }]);
      await E.db.insert('mensaje_destinatarios', [...elegidos].map((id) => ({ mensaje_id: x.id, colegio_id: E.colegio.id, perfil_id: id })));
      for (const a of archivos) {
        const ruta = `${E.colegio.id}/${x.id}/${Date.now()}_${nombreSeguro(a.name)}`;
        await E.db.subirArchivo(BUCKET, ruta, a);
        await E.db.insert('mensaje_adjuntos', [{ colegio_id: E.colegio.id, mensaje_id: x.id, ruta, nombre: a.name, tipo: a.type || null, bytes: a.size }]);
      }
      aviso('Mensaje enviado');
      location.hash = '#/mensaje/' + x.id;
    } catch (e) {
      aviso(e.message, 'error');
      b.disabled = false; b.textContent = 'Enviar';
    }
  };
}

// ---------------------------------------------------------------- Cartelera (destacados)
export async function cartelera(m) {
  const filas = (await misFilas()).filter((d) => !d.eliminado);
  const propios = await E.db.select('mensajes', { eq: { colegio_id: E.colegio.id, autor_id: E.yo.id, destacado: true } });
  const recibidos = filas.length ? (await E.db.select('mensajes', { in: { id: filas.map((d) => d.mensaje_id) } })).filter((x) => x.destacado) : [];
  const msgs = [...new Map([...recibidos, ...propios].map((x) => [x.id, x])).values()].sort((a, b) => (a.creado_en < b.creado_en ? 1 : -1));
  await perfiles(msgs.map((x) => x.autor_id));
  m.innerHTML = cabecera('Cartelera') + `
    <p class="ayuda">Mensajes destacados por el colegio y los profesores.</p>
    ${msgs.length ? msgs.map((x) => `
      <article class="tarjeta">
        <h2>📌 ${esc(x.asunto)}</h2>
        <p class="ayuda">Publicado ${fechaHora(x.creado_en)} · ${esc(nombre(E.perfiles.get(x.autor_id)))}</p>
        <div class="mensaje-cuerpo">${esc(x.cuerpo).replace(/\n/g, '<br>')}</div>
        <p><a class="btn btn-chico" href="#/mensaje/${x.id}">Abrir</a></p>
      </article>`).join('') : vacio('No hay publicaciones destacadas.')}`;
}
