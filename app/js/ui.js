// Ayudas de interfaz: escapar texto, avisos, ventanas a pantalla completa, fechas.

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const $ = (sel, raiz = document) => raiz.querySelector(sel);
export const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

export function aviso(msg, tipo = 'ok') {
  const el = document.createElement('div');
  el.className = `aviso aviso-${tipo}`;
  el.setAttribute('role', 'status');
  el.textContent = msg;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('ver'));
  setTimeout(() => { el.classList.remove('ver'); setTimeout(() => el.remove(), 300); }, tipo === 'error' ? 5000 : 2600);
}

// Ventana a pantalla completa. Devuelve una promesa con el valor del botón pulsado
// (o null si se cierra). `alAbrir(caja, cerrar)` permite conectar eventos del contenido.
export function ventana({ titulo, html, botones = [], alAbrir }) {
  return new Promise((resolver) => {
    const fondo = document.createElement('div');
    fondo.className = 'ventana';
    fondo.innerHTML = `
      <div class="ventana-caja" role="dialog" aria-modal="true" aria-label="${esc(titulo)}">
        <header class="ventana-cab">
          <button class="btn-icono" data-cerrar aria-label="Cerrar">✕</button>
          <h2>${esc(titulo)}</h2>
        </header>
        <div class="ventana-cuerpo">${html}</div>
        ${botones.length ? `<footer class="ventana-pie">${botones.map((b, i) => `<button class="btn ${b.clase || (i === botones.length - 1 ? 'btn-primario' : '')}" data-valor="${i}">${esc(b.texto)}</button>`).join('')}</footer>` : ''}
      </div>`;
    const cerrar = (v) => { fondo.remove(); document.removeEventListener('keydown', tecla); resolver(v); };
    const tecla = (e) => { if (e.key === 'Escape') cerrar(null); };
    document.addEventListener('keydown', tecla);
    fondo.addEventListener('click', async (e) => {
      if (e.target.closest('[data-cerrar]')) return cerrar(null);
      const b = e.target.closest('[data-valor]');
      if (!b) return;
      const def = botones[+b.dataset.valor];
      if (def.antes) {
        b.disabled = true;
        try { const r = await def.antes(fondo); if (r === false) { b.disabled = false; return; } cerrar(r ?? def.valor); }
        catch (err) { b.disabled = false; aviso(err.message, 'error'); }
        return;
      }
      cerrar(def.valor);
    });
    document.body.appendChild(fondo);
    alAbrir?.(fondo, cerrar);
    const primero = fondo.querySelector('.ventana-cuerpo input, .ventana-cuerpo select, .ventana-cuerpo textarea');
    (primero || fondo.querySelector('[data-cerrar]')).focus();
  });
}

export const confirmar = (titulo, texto, si = 'Aceptar') =>
  ventana({ titulo, html: `<p>${esc(texto)}</p>`, botones: [{ texto: 'Cancelar', valor: false }, { texto: si, valor: true }] });

// Lee los campos [name] de un contenedor
export function leerForm(raiz) {
  const d = {};
  for (const el of $$('[name]', raiz)) {
    if (el.type === 'checkbox') {
      if (el.dataset.multi) (d[el.name] ||= []), el.checked && d[el.name].push(el.value);
      else d[el.name] = el.checked;
    } else d[el.name] = el.value.trim();
  }
  return d;
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export function fecha(f) {
  if (!f) return '';
  const d = new Date(f.length === 10 ? f + 'T12:00:00' : f);
  return `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`;
}
export function fechaHora(f) {
  if (!f) return '';
  const d = new Date(f);
  const h = d.getHours(), m = String(d.getMinutes()).padStart(2, '0');
  return `${fecha(f)}, ${h % 12 || 12}:${m} ${h < 12 ? 'a. m.' : 'p. m.'}`;
}
export const hoy = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const nombre = (p) => (p ? `${p.nombres || ''} ${p.apellidos || ''}`.trim() || p.correo || 'Sin nombre' : '—');
export const nombreLista = (p) => (p ? `${p.apellidos || ''} ${p.nombres || ''}`.trim() || p.correo || 'Sin nombre' : '—');
export const iniciales = (p) => (nombre(p).split(/\s+/).slice(0, 2).map((x) => x[0]).join('') || '?').toUpperCase();

export const ROL = { admin: 'Administrador', profesor: 'Profesor', acudiente: 'Acudiente', estudiante: 'Estudiante' };

export const vacio = (texto, extra = '') => `<div class="vacio"><p>${esc(texto)}</p>${extra}</div>`;

// En celular las tablas marcadas con .tabla-tarjetas se ven como tarjetas:
// copiamos el título de cada columna a data-label para que el CSS lo muestre.
export function etiquetarTablas(raiz = document) {
  for (const t of raiz.querySelectorAll('table.tabla-dinero, table.tabla-tareas')) {
    const cab = [...(t.tHead?.rows[t.tHead.rows.length - 1]?.cells || [])].map((c) => c.textContent.trim());
    for (const tr of t.tBodies[0]?.rows || []) [...tr.cells].forEach((c, i) => { if (!c.dataset.label && cab[i]) c.dataset.label = cab[i]; });
  }
}
