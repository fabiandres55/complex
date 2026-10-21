// Piezas reutilizables entre pantallas.
import { esc, ventana, leerForm, aviso, confirmar } from '../ui.js';
import { E } from '../estado.js';

// Formulario genérico. campos: [{ name, label, tipo: 'text'|'number'|'date'|'select'|'checkbox'|'textarea', opciones: [[valor, texto]], req, ayuda, paso }]
export function camposHTML(campos, fila = {}) {
  return `<div class="form">${campos.map((c) => {
    const v = fila[c.name] ?? c.def ?? '';
    if (c.tipo === 'select') return `<label>${esc(c.label)}<select name="${c.name}">${c.vacio ? `<option value="">${esc(c.vacio)}</option>` : ''}${c.opciones.map(([val, t]) => `<option value="${esc(val)}" ${String(val) === String(v) ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>${c.ayuda ? `<small class="ayuda">${esc(c.ayuda)}</small>` : ''}</label>`;
    if (c.tipo === 'checkbox') return `<label class="check"><input type="checkbox" name="${c.name}" ${v ? 'checked' : ''}> ${esc(c.label)}</label>`;
    if (c.tipo === 'textarea') return `<label>${esc(c.label)}<textarea name="${c.name}" rows="${c.filas || 5}">${esc(v)}</textarea></label>`;
    // Los números van como texto con teclado decimal: así se acepta la coma ("4,5"), que type=number rechaza.
    const tipo = c.tipo === 'number' || c.tipo === 'dinero' ? 'text' : c.tipo || 'text';
    return `<label>${esc(c.label)}<input name="${c.name}" type="${tipo}" ${c.tipo === 'number' || c.tipo === 'dinero' ? 'inputmode="decimal" autocomplete="off"' : ''} value="${esc(v)}">${c.ayuda ? `<small class="ayuda">${esc(c.ayuda)}</small>` : ''}</label>`;
  }).join('')}</div>`;
}

// Pesos colombianos: "450.000" y "450000" → 450000 · "4,5" → 4.5 · "450000.00" (de la base) → 450000
export function numeroCOP(v) {
  let s = String(v ?? '').trim().replace(/[^\d.,-]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/\.\d{3}(\.|$)/.test(s)) s = s.replace(/\./g, '');
  return Number(s);
}

function convertir(campos, d) {
  const r = {};
  for (const c of campos) {
    let v = d[c.name];
    if (c.req && (v === '' || v == null)) throw new Error(`Falta: ${c.label}`);
    if (c.tipo === 'number') v = v === '' ? null : Number(String(v).replace(',', '.'));
    if (c.tipo === 'dinero') v = v === '' ? null : numeroCOP(v);
    if ((c.tipo === 'number' || c.tipo === 'dinero') && v != null && Number.isNaN(v)) throw new Error(`${c.label}: número no válido`);
    if ((c.tipo === 'select' || c.tipo === 'date' || c.opcional) && v === '') v = null;
    r[c.name] = v;
  }
  return r;
}

// Crea o edita una fila de una tabla con colegio_id. Devuelve la fila guardada o null.
export async function editar({ titulo, tabla, campos, fila, extra = {}, borrable = true, validar, alAbrir }) {
  const nuevo = !fila?.id;
  const botones = [];
  if (!nuevo && borrable) botones.push({ texto: 'Eliminar', clase: 'btn-peligro', antes: async () => {
    if (!(await confirmar('¿Eliminar?', 'Esta acción no se puede deshacer.', 'Eliminar'))) return false;
    await E.db.remove(tabla, { id: fila.id });
    aviso('Eliminado');
    return 'borrado';
  } });
  botones.push({ texto: 'Cancelar' });
  botones.push({ texto: nuevo ? 'Crear' : 'Guardar', antes: async (c) => {
    const d = convertir(campos, leerForm(c));
    validar?.(d);
    if (nuevo) {
      const [r] = await E.db.insert(tabla, [{ colegio_id: E.colegio.id, ...extra, ...d }]);
      aviso('Creado');
      return r;
    }
    const [r] = await E.db.update(tabla, d, { id: fila.id });
    aviso('Guardado');
    return r || { ...fila, ...d };
  } });
  return ventana({ titulo, html: camposHTML(campos, fila || {}), botones, alAbrir });
}

export const cabecera = (titulo, { volver, acciones = '' } = {}) => `
  <div class="cabecera">
    ${volver ? `<a class="btn-icono" href="${volver}" aria-label="Volver">←</a>` : ''}
    <h1 class="titulo">${titulo}</h1>
    <div class="acciones">${acciones}</div>
  </div>`;

export const pestanas = (lista, actual, base) => `
  <div class="pestanas" role="tablist">${lista.map(([k, t]) => `<a role="tab" aria-selected="${k === actual}" class="${k === actual ? 'activo' : ''}" href="${base}${k}">${esc(t)}</a>`).join('')}</div>`;

export const buscar = (ph = 'Buscar…') => `<input class="buscador" type="search" placeholder="${esc(ph)}" aria-label="${esc(ph)}">`;

// Filtra filas [data-buscar] de un contenedor según el buscador
export function conectarBuscador(raiz) {
  const inp = raiz.querySelector('.buscador');
  if (!inp) return;
  const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  inp.oninput = () => {
    const q = norm(inp.value.trim());
    raiz.querySelectorAll('[data-buscar]').forEach((el) => (el.hidden = q && !norm(el.dataset.buscar).includes(q)));
  };
}
