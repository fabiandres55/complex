// Comunidad (REA Phidias): ficha médica, ausencias reportadas por la familia y archivos globales.
import { E, base, perfiles, misEstudiantes } from '../estado.js';
import { esc, aviso, ventana, leerForm, confirmar, nombre, nombreLista, vacio, fecha, fechaHora, hoy, ROL } from '../ui.js';
import { cabecera, camposHTML, buscar, conectarBuscador } from './comun.js';

const nombreSeguro = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.\-]+/g, '_').slice(-120);
const peso = (n) => (n == null ? '' : n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
async function abrirArchivo(bucket, ruta, nombreArch) {
  const w = E.db.modo === 'demo' ? null : window.open('', '_blank');
  try {
    const url = await E.db.urlArchivo(bucket, ruta);
    if (E.db.modo === 'demo') { const a = document.createElement('a'); a.href = url; a.download = nombreArch || 'archivo'; document.body.appendChild(a); a.click(); a.remove(); }
    else if (w) w.location = url; else location.href = url;
  } catch (e) { w?.close(); aviso(e.message, 'error'); }
}

// ---------------------------------------------------------------- Ficha médica
const CAMPOS_FICHA = [
  { name: 'tipo_sangre', label: 'Tipo de sangre (RH)', tipo: 'select', vacio: 'Sin dato', opciones: ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'].map((x) => [x, x]) },
  { name: 'eps', label: 'EPS / medicina prepagada' },
  { name: 'alergias', label: 'Alergias', tipo: 'textarea', filas: 2 },
  { name: 'enfermedades', label: 'Enfermedades o condiciones', tipo: 'textarea', filas: 2 },
  { name: 'medicamentos', label: 'Medicamentos que toma', tipo: 'textarea', filas: 2 },
  { name: 'restricciones', label: 'Restricciones (alimentación, actividad física…)', tipo: 'textarea', filas: 2 },
  { name: 'contacto_nombre', label: 'Contacto de emergencia' },
  { name: 'contacto_telefono', label: 'Teléfono del contacto' },
  { name: 'contacto_parentesco', label: 'Parentesco del contacto' },
  { name: 'observaciones', label: 'Otras observaciones', tipo: 'textarea', filas: 3 },
];

export async function htmlFicha(estId) {
  const [f] = await E.db.select('fichas_medicas', { eq: { estudiante_id: estId } });
  if (f?.actualizado_por) await perfiles([f.actualizado_por]);
  const puedeEditar = E.rol === 'admin' || E.rol === 'acudiente';
  const dato = (k, t) => `<div><dt>${t}</dt><dd>${f?.[k] ? esc(f[k]).replace(/\n/g, '<br>') : '—'}</dd></div>`;
  return `
    <section class="tarjeta">
      <div class="tarjeta-cab"><h2>🩺 Ficha médica</h2><div class="acciones">${puedeEditar ? `<button class="btn btn-primario" data-ficha-editar>${f ? 'Editar' : 'Llenar ficha'}</button>` : ''}<button class="btn" onclick="window.print()">🖨</button></div></div>
      ${f ? `<dl class="datos">${CAMPOS_FICHA.map((c) => dato(c.name, c.label)).join('')}</dl>
        <p class="ayuda">Actualizada ${fechaHora(f.actualizado_en)}${f.actualizado_por ? ' por ' + esc(nombre(E.perfiles.get(f.actualizado_por))) : ''}. Solo la ven el colegio y la familia.</p>`
        : vacio('Aún no se ha llenado la ficha médica.' + (E.rol === 'acudiente' ? ' Es importante para que el colegio pueda atender cualquier emergencia.' : ''))}
    </section>`;
}

export function conectarFicha(m, estId, recargar) {
  m.querySelector('[data-ficha-editar]')?.addEventListener('click', async () => {
    const [f] = await E.db.select('fichas_medicas', { eq: { estudiante_id: estId } });
    const r = await ventana({
      titulo: 'Ficha médica',
      html: camposHTML(CAMPOS_FICHA, f || {}),
      botones: [{ texto: 'Cancelar' }, { texto: 'Guardar', antes: async (c) => {
        const d = leerForm(c);
        for (const k of Object.keys(d)) if (d[k] === '') d[k] = null;
        await E.db.upsert('fichas_medicas', [{ estudiante_id: estId, colegio_id: E.colegio.id, ...d, actualizado_por: E.yo.id, actualizado_en: new Date().toISOString() }], 'estudiante_id');
        return true;
      } }],
    });
    if (r) { aviso('Ficha médica guardada'); recargar(); }
  });
}

// ---------------------------------------------------------------- Ausencias reportadas
const TIPOS_AUS = { enfermedad: '🤒 Enfermedad', cita: '🩺 Cita médica', calamidad: '⚠️ Calamidad familiar', viaje: '✈️ Viaje', otro: '📝 Otro' };
const ESTADO_AUS = { recibido: ['🕓 Recibido', ''], aceptado: ['✅ Aceptado', 'ok'], rechazado: ['✖ No aceptado', 'alerta'] };

export async function htmlAusencias(estId) {
  const filas = await E.db.select('reportes_ausencia', { eq: { estudiante_id: estId }, order: 'creado_en desc' });
  const puedeReportar = E.rol === 'acudiente';
  return `
    <section class="tarjeta">
      <div class="tarjeta-cab"><h2>Ausencias reportadas por la familia</h2>${puedeReportar ? '<button class="btn btn-primario" data-reportar>＋ Reportar ausencia</button>' : ''}</div>
      ${filas.length ? `<div class="lista">${filas.map((x) => `
        <div class="fila"><span class="crece"><b>${TIPOS_AUS[x.tipo]} · ${fecha(x.desde)}${x.hasta !== x.desde ? ' al ' + fecha(x.hasta) : ''}</b><small>${esc(x.observacion || '')}${x.respuesta ? ' · Respuesta: ' + esc(x.respuesta) : ''}</small></span>
        ${x.soporte_ruta ? `<button class="btn-icono" data-soporte="${x.id}" title="Ver soporte" aria-label="Ver soporte">📎</button>` : ''}
        <span class="chip ${ESTADO_AUS[x.estado][1]}">${ESTADO_AUS[x.estado][0]}</span></div>`).join('')}</div>` : '<p class="ayuda">No hay ausencias reportadas.</p>'}
    </section>`;
}

export function conectarAusencias(m, estId, recargar) {
  m.querySelectorAll('[data-soporte]').forEach((b) => (b.onclick = async () => {
    const [x] = await E.db.select('reportes_ausencia', { eq: { id: b.dataset.soporte } });
    abrirArchivo('ausencias', x.soporte_ruta, x.soporte_nombre);
  }));
  m.querySelector('[data-reportar]')?.addEventListener('click', async () => {
    const r = await ventana({
      titulo: 'Reportar ausencia',
      html: camposHTML([
        { name: 'tipo', label: 'Motivo', tipo: 'select', opciones: Object.entries(TIPOS_AUS) },
        { name: 'desde', label: 'Desde', tipo: 'date', def: hoy() },
        { name: 'hasta', label: 'Hasta', tipo: 'date', def: hoy() },
        { name: 'observacion', label: 'Observación', tipo: 'textarea', filas: 3 },
      ]) + `<div class="form"><label>Soporte (incapacidad, cita…) — opcional<input type="file" name="soporte" accept=".pdf,.jpg,.jpeg,.png,.webp"><small class="ayuda">PDF o foto, máximo 10 MB${E.db.modo === 'demo' ? ' (2 MB en el demo)' : ''}</small></label></div>`,
      botones: [{ texto: 'Cancelar' }, { texto: 'Enviar reporte', antes: async (c) => {
        const d = leerForm(c);
        const arch = c.querySelector('[name=soporte]').files[0];
        if (!d.desde || !d.hasta) throw new Error('Indica las fechas.');
        if (d.hasta < d.desde) throw new Error('"Hasta" no puede ser antes de "Desde".');
        if (arch && arch.size > 10 * 1024 * 1024) throw new Error('El soporte pesa más de 10 MB.');
        const datos = { colegio_id: E.colegio.id, estudiante_id: estId, tipo: d.tipo, desde: d.desde, hasta: d.hasta, observacion: d.observacion || null, reportado_por: E.yo.id };
        if (arch) {
          const ruta = `${E.colegio.id}/${estId}/${Date.now()}_${nombreSeguro(arch.name)}`;
          await E.db.subirArchivo('ausencias', ruta, arch);
          Object.assign(datos, { soporte_ruta: ruta, soporte_nombre: arch.name });
        }
        await E.db.insert('reportes_ausencia', [datos]);
        return true;
      } }],
    });
    if (r) { aviso('Ausencia reportada al colegio'); recargar(); }
  });
}

// Admin: bandeja de ausencias reportadas
export async function ausencias(m) {
  const b = await base();
  const filas = await E.db.select('reportes_ausencia', { eq: { colegio_id: E.colegio.id }, order: 'creado_en desc' });
  await perfiles([...filas.map((x) => x.estudiante_id), ...filas.map((x) => x.reportado_por)]);
  const mats = filas.length ? await E.db.select('matriculas', { in: { estudiante_id: [...new Set(filas.map((x) => x.estudiante_id))] } }) : [];
  const curso = (est) => b.cursoPorId.get(mats.find((x) => x.estudiante_id === est && x.estado === 'activa')?.curso_id)?.nombre || '';
  const pend = filas.filter((x) => x.estado === 'recibido').length;
  m.innerHTML = cabecera('Ausencias reportadas') + `
    <p class="ayuda">${pend ? `<b>${pend}</b> por revisar.` : 'Todo revisado.'} Las familias reportan aquí enfermedades, citas y calamidades.</p>
    ${filas.length ? `<div class="lista">${filas.map((x) => `
      <button class="fila fila-boton" data-ver="${x.id}">
        <span><b>${esc(nombreLista(E.perfiles.get(x.estudiante_id)))} <small>${esc(curso(x.estudiante_id))}</small></b><small>${TIPOS_AUS[x.tipo]} · ${fecha(x.desde)}${x.hasta !== x.desde ? ' al ' + fecha(x.hasta) : ''} · reportó ${esc(nombre(E.perfiles.get(x.reportado_por)))}</small></span>
        <span class="chip ${ESTADO_AUS[x.estado][1]}">${ESTADO_AUS[x.estado][0]}</span>
      </button>`).join('')}</div>` : vacio('No hay ausencias reportadas.')}`;
  m.querySelectorAll('[data-ver]').forEach((el) => (el.onclick = async () => {
    const x = filas.find((f) => f.id === el.dataset.ver);
    const r = await ventana({
      titulo: 'Ausencia reportada',
      html: `<dl class="datos">
          <div><dt>Estudiante</dt><dd>${esc(nombre(E.perfiles.get(x.estudiante_id)))} · ${esc(curso(x.estudiante_id))}</dd></div>
          <div><dt>Motivo</dt><dd>${TIPOS_AUS[x.tipo]}</dd></div>
          <div><dt>Fechas</dt><dd>${fecha(x.desde)}${x.hasta !== x.desde ? ' al ' + fecha(x.hasta) : ''}</dd></div>
          <div><dt>Reportó</dt><dd>${esc(nombre(E.perfiles.get(x.reportado_por)))} · ${fechaHora(x.creado_en)}</dd></div>
        </dl>
        ${x.observacion ? `<p class="texto-largo">${esc(x.observacion)}</p>` : ''}
        ${x.soporte_ruta ? `<button class="fila fila-boton tarjeta-archivo" data-soporte><span class="avatar">📎</span><span><b>${esc(x.soporte_nombre)}</b><small>Ver soporte</small></span></button>` : '<p class="ayuda">Sin soporte adjunto.</p>'}
        <div class="form"><label>Respuesta a la familia (opcional)<textarea name="respuesta" rows="3">${esc(x.respuesta || '')}</textarea></label></div>`,
      alAbrir: (caja) => caja.querySelector('[data-soporte]')?.addEventListener('click', () => abrirArchivo('ausencias', x.soporte_ruta, x.soporte_nombre)),
      botones: [
        { texto: '✖ No aceptar', clase: 'btn-peligro', antes: async (c) => { await E.db.update('reportes_ausencia', { estado: 'rechazado', respuesta: leerForm(c).respuesta || null, revisado_por: E.yo.id }, { id: x.id }); return true; } },
        { texto: '✅ Aceptar (justificada)', antes: async (c) => {
          // Primero las fallas de esos días pasan a "con excusa" (si alguna falla, se avisa pero se sigue);
          // al final se marca el reporte como aceptado.
          const asis = await E.db.select('asistencia', { eq: { estudiante_id: x.estudiante_id } });
          let noSePudo = 0;
          for (const a of asis.filter((f) => f.fecha >= x.desde && f.fecha <= x.hasta && f.estado === 'ausente')) {
            try { await E.db.update('asistencia', { estado: 'excusa', nota: 'Ausencia reportada por la familia' }, { id: a.id }); } catch { noSePudo++; }
          }
          await E.db.update('reportes_ausencia', { estado: 'aceptado', respuesta: leerForm(c).respuesta || null, revisado_por: E.yo.id }, { id: x.id });
          if (noSePudo) aviso(`${noSePudo} falla(s) no se pudieron justificar (¿estudiante retirado?)`, 'error');
          return true;
        } },
      ],
    });
    if (r) { aviso('Reporte actualizado'); ausencias(m); }
  }));
}

// ---------------------------------------------------------------- Archivos globales
export async function archivos(m, p) {
  const anioAct = Number(p.anio) || new Date().getFullYear();
  let filas = await E.db.select('archivos', { eq: { colegio_id: E.colegio.id }, order: ['carpeta', 'nombre'] });
  if (E.db.modo === 'demo' && E.rol !== 'admin') filas = filas.filter((x) => !x.roles?.length || x.roles.includes(E.rol));
  const anios = [...new Set([anioAct, ...filas.map((x) => x.anio)])].sort((a, z) => z - a);
  const delAnio = filas.filter((x) => x.anio === anioAct);
  const carpetas = new Map();
  for (const x of delAnio) { if (!carpetas.has(x.carpeta)) carpetas.set(x.carpeta, []); carpetas.get(x.carpeta).push(x); }
  const admin = E.rol === 'admin';
  m.innerHTML = cabecera('Archivos del colegio', { acciones: admin ? '<button class="btn btn-primario" data-subir>⬆ Subir archivo</button>' : '' }) + `
    <div class="tarjeta-cab"><label class="en-linea">Año <select data-anio>${anios.map((a) => `<option ${a === anioAct ? 'selected' : ''}>${a}</option>`).join('')}</select></label>${buscar('Buscar archivo…')}</div>
    ${carpetas.size ? [...carpetas.entries()].map(([carp, l]) => `
      <details class="grupo-contactos" open><summary>📁 <b>${esc(carp)}</b> <small>(${l.length})</small></summary>
        <div class="lista">${l.map((x) => `
          <div class="fila" data-buscar="${esc(x.nombre + ' ' + (x.descripcion || '') + ' ' + carp)}">
            <button class="fila-boton crece archivo-btn" data-abrir="${x.id}"><b>📄 ${esc(x.nombre)}</b><small>${esc(x.descripcion || '')}${x.descripcion ? ' · ' : ''}${peso(x.bytes)}${admin && x.roles?.length ? ' · Solo: ' + x.roles.map((r) => ROL[r]).join(', ') : ''}</small></button>
            ${admin ? `<button class="btn-icono" data-borrar="${x.id}" aria-label="Eliminar archivo">🗑</button>` : ''}
          </div>`).join('')}</div>
      </details>`).join('') : vacio(admin ? 'Sube documentos para la comunidad: manual de convivencia, lista de útiles, horarios, instructivos…' : 'No hay archivos publicados este año.')}`;
  conectarBuscador(m);
  m.querySelector('[data-anio]').onchange = (e) => { location.hash = '#/archivos?anio=' + e.target.value; };
  m.querySelectorAll('[data-abrir]').forEach((b) => (b.onclick = () => { const x = filas.find((f) => f.id === b.dataset.abrir); abrirArchivo('archivos', x.ruta, x.nombre); }));
  m.querySelectorAll('[data-borrar]').forEach((b) => (b.onclick = async () => {
    const x = filas.find((f) => f.id === b.dataset.borrar);
    if (!(await confirmar('¿Eliminar el archivo?', x.nombre, 'Eliminar'))) return;
    try { await E.db.borrarArchivo('archivos', x.ruta).catch(() => {}); await E.db.remove('archivos', { id: x.id }); aviso('Archivo eliminado'); archivos(m, p); } catch (e) { aviso(e.message, 'error'); }
  }));
  m.querySelector('[data-subir]')?.addEventListener('click', async () => {
    const existentes = [...new Set(filas.map((x) => x.carpeta))];
    const r = await ventana({
      titulo: 'Subir archivo',
      html: `<div class="form"><label>Archivo<input type="file" name="archivo"><small class="ayuda">Hasta 50 MB${E.db.modo === 'demo' ? ' (2 MB en el demo)' : ''}</small></label></div>` + camposHTML([
        { name: 'nombre', label: 'Nombre visible (opcional: por defecto el del archivo)' },
        { name: 'descripcion', label: 'Descripción (opcional)' },
        { name: 'carpeta', label: 'Carpeta', def: existentes[0] || 'General' },
        { name: 'anio', label: 'Año', tipo: 'number', def: anioAct },
      ]) + `<datalist id="carpetas">${existentes.map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
        <fieldset class="form"><legend>Solo para (si no marcas, lo ve todo el colegio)</legend>${Object.entries(ROL).map(([r, t]) => `<label class="check"><input type="checkbox" name="roles" data-multi="1" value="${r}"> ${t}</label>`).join('')}</fieldset>`,
      alAbrir: (c) => c.querySelector('[name=carpeta]').setAttribute('list', 'carpetas'),
      botones: [{ texto: 'Cancelar' }, { texto: 'Subir', antes: async (c) => {
        const d = leerForm(c);
        const arch = c.querySelector('[name=archivo]').files[0];
        if (!arch) throw new Error('Elige el archivo.');
        if (arch.size > 50 * 1024 * 1024) throw new Error('El archivo pesa más de 50 MB.');
        const ruta = `${E.colegio.id}/${Date.now()}_${nombreSeguro(arch.name)}`;
        await E.db.subirArchivo('archivos', ruta, arch);
        await E.db.insert('archivos', [{ colegio_id: E.colegio.id, anio: Number(d.anio) || anioAct, carpeta: d.carpeta || 'General', nombre: d.nombre || arch.name, descripcion: d.descripcion || null, ruta, tipo: arch.type || null, bytes: arch.size, roles: d.roles?.length ? d.roles : null, subido_por: E.yo.id }]);
        return true;
      } }],
    });
    if (r) { aviso('Archivo publicado'); archivos(m, p); }
  });
}

// ---------------------------------------------------------------- Pasarelas (enlaces externos)
export async function pasarelas(m) {
  const admin = E.rol === 'admin';
  let filas = await E.db.select('pasarelas', { eq: { colegio_id: E.colegio.id }, order: ['orden', 'nombre'] });
  if (E.db.modo === 'demo' && !admin) filas = filas.filter((x) => !x.roles?.length || x.roles.includes(E.rol));
  m.innerHTML = cabecera('Pasarelas', { acciones: admin ? '<button class="btn btn-primario" data-nueva>＋ Enlace</button>' : '' }) + `
    <p class="ayuda">Accesos a plataformas externas que usa el colegio (editoriales, bibliotecas, aulas virtuales…).</p>
    ${filas.length ? `<div class="rejilla pasarelas">${filas.map((x) => `
      <div class="mini pasarela">
        <a href="${/^https?:\/\//i.test(x.url) ? esc(x.url) : '#'}" target="_blank" rel="noopener noreferrer"><span class="ic">${esc(x.icono || '🔗')}</span><b>${esc(x.nombre)}</b><small>${esc(x.descripcion || '')}</small></a>
        ${admin ? `<button class="btn-link" data-editar="${x.id}">Editar${x.roles?.length ? ' · solo ' + x.roles.map((r) => ROL[r]).join(', ') : ''}</button>` : ''}
      </div>`).join('')}</div>` : vacio(admin ? 'Agrega enlaces a las plataformas externas que usan profesores, familias y estudiantes.' : 'El colegio no ha publicado enlaces.')}`;
  if (!admin) return;
  const editar = async (fila) => {
    const r = await ventana({
      titulo: fila ? 'Editar enlace' : 'Nuevo enlace',
      html: camposHTML([{ name: 'nombre', label: 'Nombre' }, { name: 'url', label: 'Dirección (https://…)', tipo: 'url' }, { name: 'descripcion', label: 'Descripción (opcional)' }, { name: 'icono', label: 'Ícono (un emoji)', def: '🔗' }, { name: 'orden', label: 'Orden', tipo: 'number', def: 0 }], fila || {}) +
        `<fieldset class="form"><legend>Solo para (si no marcas, lo ve todo el colegio)</legend>${Object.entries(ROL).map(([k, t]) => `<label class="check"><input type="checkbox" name="roles" data-multi="1" value="${k}" ${fila?.roles?.includes(k) ? 'checked' : ''}> ${t}</label>`).join('')}</fieldset>`,
      botones: [
        ...(fila ? [{ texto: 'Eliminar', clase: 'btn-peligro', antes: async () => { if (!(await confirmar('¿Eliminar el enlace?', fila.nombre, 'Eliminar'))) return false; await E.db.remove('pasarelas', { id: fila.id }); return true; } }] : []),
        { texto: 'Cancelar' },
        { texto: 'Guardar', antes: async (c) => {
          const d = leerForm(c);
          if (!d.nombre) throw new Error('Escribe el nombre.');
          if (!/^https?:\/\/\S+$/i.test(d.url)) throw new Error('La dirección debe empezar por https://');
          const datos = { nombre: d.nombre, url: d.url, descripcion: d.descripcion || null, icono: d.icono || '🔗', orden: Number(d.orden) || 0, roles: d.roles?.length ? d.roles : null };
          if (fila) await E.db.update('pasarelas', datos, { id: fila.id }); else await E.db.insert('pasarelas', [{ colegio_id: E.colegio.id, ...datos }]);
          return true;
        } },
      ],
    });
    if (r) { aviso('Pasarelas actualizadas'); pasarelas(m); }
  };
  m.querySelector('[data-nueva]').onclick = () => editar(null);
  m.querySelectorAll('[data-editar]').forEach((b) => (b.onclick = () => editar(filas.find((x) => x.id === b.dataset.editar))));
}
