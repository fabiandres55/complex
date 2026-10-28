// Seguimientos (REA Phidias, perfil docente): formularios configurables.
//  * "Seguimientos del colegio": los crea el administrador (ej. académico, convivencia, enfermería).
//  * "Seguimientos propios": los crea cada docente.
// Cada uno tiene nombre, descripción, año, fechas, registro único, visibilidad para la familia,
// campos (constructor) y reglas de notificación (persona, padres, profesores, director de grupo).
import { E, base, perfiles, avisarPorCorreo } from '../estado.js';
import { esc, aviso, ventana, confirmar, nombre, nombreLista, vacio, fecha, fechaHora, hoy } from '../ui.js';
import { cabecera } from './comun.js';

const TIPOS_CAMPO = [['texto', 'Texto corto'], ['parrafo', 'Párrafo'], ['opcion', 'Una opción (lista)'], ['varias', 'Varias opciones (casillas)'], ['si_no', 'Sí / No'], ['fecha', 'Fecha'], ['numero', 'Número']];
const nid = () => Math.random().toString(36).slice(2, 9);
const esPersonal = () => ['admin', 'profesor', 'enfermeria', 'director_seccion'].includes(E.rol);
const verTodos = () => ['admin', 'enfermeria'].includes(E.rol); // ven/registran a cualquier estudiante del colegio

// Estudiantes con los que puedo registrar: admin = todos; profesor = los de sus cursos (o los que dirige)
async function misEstudiantes(b) {
  const grados = E.membresias.filter((x) => x.colegio_id === E.colegio.id && x.rol === 'director_seccion' && x.activo).flatMap((x) => x.seccion_grados || []);
  const cursos = verTodos() ? b.cursos : E.rol === 'director_seccion' ? b.cursos.filter((c) => grados.includes(c.grado_id)) : b.cursos.filter((c) => c.director_id === E.yo.id || b.asignaciones.some((a) => a.curso_id === c.id && a.profesor_id === E.yo.id));
  const mats = cursos.length ? (await E.db.select('matriculas', { in: { curso_id: cursos.map((c) => c.id) } })).filter((x) => x.estado === 'activa') : [];
  await perfiles(mats.map((x) => x.estudiante_id));
  return mats.map((x) => ({ e: E.perfiles.get(x.estudiante_id), curso: b.cursoPorId.get(x.curso_id) })).filter((x) => x.e)
    .sort((x, y) => (x.curso?.nombre || '').localeCompare(y.curso?.nombre || '') || nombreLista(x.e).localeCompare(nombreLista(y.e)));
}

// ---------------------------------------------------------------- Lista
export async function lista(m) {
  const b = await base();
  if (!esPersonal()) { m.innerHTML = vacio('Los seguimientos del estudiante están en su ficha.'); return; }
  const todos = await E.db.select('seguimientos', { eq: { colegio_id: E.colegio.id }, order: 'creado_en desc' });
  // enfermería solo trabaja con los seguimientos marcados para enfermería (prerreportes)
  const delColegio = todos.filter((s) => !s.propio && (E.rol !== 'enfermeria' || s.enfermeria));
  const propios = todos.filter((s) => s.propio && s.creado_por === E.yo.id);
  const regs = todos.length ? await E.db.select('seguimiento_registros', { in: { seguimiento_id: todos.map((s) => s.id) } }) : [];
  const fila = (s) => {
    const n = regs.filter((r) => r.seguimiento_id === s.id).length;
    const propiosN = regs.filter((r) => r.seguimiento_id === s.id && r.autor_id === E.yo.id).length;
    return `<a class="fila fila-boton" href="#/seguimiento/${s.id}"><span class="avatar">📋</span><span class="crece"><b>${esc(s.nombre)}</b><small>${esc((s.descripcion || '').slice(0, 90))}</small><small>${s.anio ? s.anio + ' · ' : ''}${n} registro(s)${E.rol === 'profesor' ? ` · ${propiosN} míos` : ''}${s.registro_unico ? ' · registro único' : ''}${s.visible_familia ? ' · visible para la familia' : ''}${s.activo ? '' : ' · inactivo'}</small></span><span class="flecha">›</span></a>`;
  };
  m.innerHTML = cabecera('Seguimientos', { acciones: '<button class="btn btn-primario" data-nuevo>＋ Agregar seguimiento</button>' }) + `
    ${E.rol === 'profesor' ? `<section class="tarjeta"><h2>Seguimientos propios</h2>${propios.length ? `<div class="lista">${propios.map(fila).join('')}</div>` : '<p class="ayuda">No hay nada aquí. Con "Agregar seguimiento" armas tu propio formulario (ej. lectura diaria, tareas pendientes).</p>'}</section>` : ''}
    <section class="tarjeta"><h2>Seguimientos del colegio</h2>${delColegio.length ? `<div class="lista">${delColegio.map(fila).join('')}</div>` : `<p class="ayuda">${E.rol === 'admin' ? 'Crea los seguimientos del colegio: académico, convivencia, enfermería, psicología…' : 'El colegio aún no ha creado seguimientos.'}</p>`}</section>
    ${E.rol === 'admin' && todos.some((s) => s.propio) ? `<section class="tarjeta"><h2>Seguimientos propios de los docentes</h2><div class="lista">${todos.filter((s) => s.propio).map(fila).join('')}</div></section>` : ''}`;
  m.querySelector('[data-nuevo]').onclick = async () => { const r = await editarPlantilla(b, null); if (r?.id) location.hash = '#/seguimiento/' + r.id; else if (r) lista(m); };
}

// ---------------------------------------------------------------- Constructor del formulario (plantilla)
async function editarPlantilla(b, s) {
  const x = s ? JSON.parse(JSON.stringify(s)) : { nombre: '', descripcion: '', anio: b.anio?.anio || new Date().getFullYear(), fecha_inicial: hoy(), fecha_final: null, registro_unico: false, visible_familia: false, campos: [{ id: nid(), etiqueta: 'Descripción', tipo: 'parrafo', opciones: [], requerido: true }], notificar: { cuando: 'crear_actualizar', persona: false, padres: false, profesor: false, director: false, cada: 1 }, activo: true };
  x.notificar ||= {};
  const anios = [...new Set([x.anio, ...b.anios.map((a) => a.anio)].filter(Boolean))].sort((p, q) => q - p);
  const pintarCampos = (caja) => {
    caja.querySelector('[data-campos]').innerHTML = x.campos.length ? x.campos.map((c, i) => `
      <fieldset class="paso-editor" data-c="${i}">
        <legend>Campo ${i + 1}</legend>
        <div class="fila-editor">
          <input data-c-etiqueta value="${esc(c.etiqueta)}" placeholder="Pregunta o nombre del campo" aria-label="Nombre del campo">
          <select data-c-tipo aria-label="Tipo">${TIPOS_CAMPO.map(([k, t]) => `<option value="${k}" ${k === c.tipo ? 'selected' : ''}>${t}</option>`).join('')}</select>
        </div>
        ${c.tipo === 'opcion' || c.tipo === 'varias' ? `<label>Opciones (una por línea)<textarea data-c-opciones rows="3">${esc((c.opciones || []).join('\n'))}</textarea></label>` : ''}
        <div class="fila-editor"><label class="fila-check"><input type="checkbox" data-c-req ${c.requerido ? 'checked' : ''}> <span>Obligatorio</span></label>
          <span class="crece"></span>
          <button class="btn-icono" data-c-subir ${i === 0 ? 'disabled' : ''} aria-label="Subir">↑</button><button class="btn-icono" data-c-bajar ${i === x.campos.length - 1 ? 'disabled' : ''} aria-label="Bajar">↓</button><button class="btn-icono" data-c-borrar aria-label="Quitar campo">✕</button></div>
      </fieldset>`).join('') : '<p class="ayuda">Agrega al menos un campo.</p>';
  };
  const leerCampos = (caja) => caja.querySelectorAll('[data-c]').forEach((fs) => {
    const c = x.campos[+fs.dataset.c];
    c.etiqueta = fs.querySelector('[data-c-etiqueta]').value.trim();
    c.tipo = fs.querySelector('[data-c-tipo]').value;
    c.requerido = fs.querySelector('[data-c-req]').checked;
    const op = fs.querySelector('[data-c-opciones]');
    c.opciones = op ? op.value.split('\n').map((v) => v.trim()).filter(Boolean) : c.tipo === 'opcion' || c.tipo === 'varias' ? c.opciones || [] : [];
  });
  const n = x.notificar;
  const html = `<div class="form">
      <fieldset><legend>Configuración general</legend>
        <label>Año<select name="anio">${anios.map((a) => `<option ${a === x.anio ? 'selected' : ''}>${a}</option>`).join('')}</select></label>
        <label>Nombre<input name="nombre" value="${esc(x.nombre)}" required></label>
        <label>Descripción<textarea name="descripcion" rows="2">${esc(x.descripcion || '')}</textarea></label>
        <label>Fecha inicial<input type="date" name="fecha_inicial" value="${esc(x.fecha_inicial || hoy())}"></label>
        <label class="fila-check"><input type="checkbox" name="usar_final" ${x.fecha_final ? 'checked' : ''}> <span>Usar fecha final</span></label>
        <label data-final ${x.fecha_final ? '' : 'hidden'}>Fecha final<input type="date" name="fecha_final" value="${esc(x.fecha_final || '')}"></label>
      </fieldset>
      <fieldset><legend>Ajustes especiales</legend>
        <label class="fila-check"><input type="checkbox" name="registro_unico" ${x.registro_unico ? 'checked' : ''}> <span><b>Registro único</b><small>Un solo registro por estudiante (se edita en lugar de crear otro).</small></span></label>
        <label class="fila-check"><input type="checkbox" name="visible_familia" ${x.visible_familia ? 'checked' : ''}> <span><b>Visible para la familia</b><small>El estudiante y sus acudientes ven los registros.</small></span></label>
        ${E.rol === 'admin' ? `<label class="fila-check"><input type="checkbox" name="enfermeria" ${x.enfermeria ? 'checked' : ''}> <span><b>Lo usa Enfermería</b><small>Prerreportes: enfermería puede registrar y ver este seguimiento para cualquier estudiante.</small></span></label>` : ''}
        <label>Notificar a las siguientes personas al<select name="cuando">${[['crear_actualizar', 'Crear y actualizar registros'], ['crear', 'Crear registros únicamente'], ['editar', 'Editar registros únicamente']].map(([k, t]) => `<option value="${k}" ${n.cuando === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <label class="fila-check"><input type="checkbox" name="n_persona" ${n.persona ? 'checked' : ''}> <span>Notificar a la persona (el estudiante)</span></label>
        <label class="fila-check"><input type="checkbox" name="n_padres" ${n.padres ? 'checked' : ''}> <span>Notificar a los padres / acudientes</span></label>
        <label class="fila-check"><input type="checkbox" name="n_profesor" ${n.profesor ? 'checked' : ''}> <span>Notificar a los profesores del estudiante</span></label>
        <label class="fila-check"><input type="checkbox" name="n_director" ${n.director ? 'checked' : ''}> <span>Notificar al director de grupo</span></label>
        <label>Notificar después de este número de registros<input name="cada" inputmode="numeric" value="${esc(String(n.cada || 1))}"><small class="ayuda">1 = en cada registro; 3 = cada 3 registros del mismo estudiante.</small></label>
        ${s ? `<label class="fila-check"><input type="checkbox" name="activo" ${x.activo !== false ? 'checked' : ''}> <span>Activo (se pueden agregar registros)</span></label>` : ''}
      </fieldset>
      <fieldset><legend>Campos</legend><div data-campos></div><button class="btn" data-c-nuevo>＋ Agregar campo</button></fieldset>
    </div>`;
  const r = await ventana({
    titulo: s ? 'Editar seguimiento' : 'Agregar seguimiento', html,
    alAbrir: (caja) => {
      pintarCampos(caja);
      caja.querySelector('[name=usar_final]').onchange = (e) => { caja.querySelector('[data-final]').hidden = !e.target.checked; };
      caja.addEventListener('click', (e) => {
        const fs = e.target.closest('[data-c]'); const i = fs ? +fs.dataset.c : -1;
        if (e.target.closest('[data-c-nuevo]')) { leerCampos(caja); x.campos.push({ id: nid(), etiqueta: '', tipo: 'texto', opciones: [], requerido: false }); pintarCampos(caja); }
        else if (e.target.closest('[data-c-borrar]')) { leerCampos(caja); x.campos.splice(i, 1); pintarCampos(caja); }
        else if (e.target.closest('[data-c-subir]') && i > 0) { leerCampos(caja); [x.campos[i - 1], x.campos[i]] = [x.campos[i], x.campos[i - 1]]; pintarCampos(caja); }
        else if (e.target.closest('[data-c-bajar]') && i < x.campos.length - 1) { leerCampos(caja); [x.campos[i + 1], x.campos[i]] = [x.campos[i], x.campos[i + 1]]; pintarCampos(caja); }
      });
      caja.addEventListener('change', (e) => { if (e.target.matches('[data-c-tipo]')) { leerCampos(caja); pintarCampos(caja); } });
    },
    botones: [
      ...(s ? [{ texto: 'Eliminar', clase: 'btn-peligro', antes: async () => { if (!(await confirmar('¿Eliminar el seguimiento?', 'Se borran también todos sus registros.', 'Eliminar'))) return false; await E.db.remove('seguimientos', { id: s.id }); return 'borrado'; } }] : []),
      { texto: 'Cancelar' },
      { texto: 'Guardar', antes: async (caja) => {
        leerCampos(caja);
        const v = (k) => caja.querySelector(`[name=${k}]`);
        const nombreS = v('nombre').value.trim();
        if (!nombreS) throw new Error('Escribe el nombre del seguimiento.');
        if (!x.campos.length) throw new Error('Agrega al menos un campo.');
        for (const [i, c] of x.campos.entries()) {
          if (!c.etiqueta) throw new Error(`El campo ${i + 1} no tiene nombre.`);
          if ((c.tipo === 'opcion' || c.tipo === 'varias') && c.opciones.length < 2) throw new Error(`El campo "${c.etiqueta}" necesita al menos 2 opciones.`);
        }
        const fi = v('fecha_inicial').value || hoy();
        const ff = v('usar_final').checked ? v('fecha_final').value || null : null;
        if (ff && ff < fi) throw new Error('La fecha final debe ser después de la inicial.');
        const datos = {
          nombre: nombreS, descripcion: v('descripcion').value.trim() || null, anio: Number(v('anio').value) || null, fecha_inicial: fi, fecha_final: ff,
          registro_unico: v('registro_unico').checked, visible_familia: v('visible_familia').checked, campos: x.campos,
          ...(E.rol === 'admin' ? { enfermeria: !!v('enfermeria')?.checked } : {}),
          notificar: { cuando: v('cuando').value, persona: v('n_persona').checked, padres: v('n_padres').checked, profesor: v('n_profesor').checked, director: v('n_director').checked, cada: Math.max(1, parseInt(v('cada').value, 10) || 1) },
          ...(s ? { activo: v('activo').checked } : {}),
        };
        if (s) { await E.db.update('seguimientos', datos, { id: s.id }); return true; }
        const [nuevo] = await E.db.insert('seguimientos', [{ colegio_id: E.colegio.id, creado_por: E.yo.id, propio: E.rol !== 'admin', activo: true, ...datos }]);
        return nuevo;
      } },
    ],
  });
  if (r) aviso(r === 'borrado' ? 'Seguimiento eliminado' : 'Seguimiento guardado');
  return r;
}

// ---------------------------------------------------------------- Un seguimiento: registros
export async function seguimiento(m, p) {
  const b = await base();
  const [s] = await E.db.select('seguimientos', { eq: { id: p.id } });
  if (!s) { m.innerHTML = vacio('Ese seguimiento no existe.'); return; }
  const puedoEditarPlantilla = E.rol === 'admin' || (s.propio && s.creado_por === E.yo.id);
  const puedoRegistrar = s.activo && (E.rol === 'admin' || (E.rol === 'profesor' && (!s.propio || s.creado_por === E.yo.id)) || (E.rol === 'enfermeria' && s.enfermeria && !s.propio));
  const [regs, ests] = await Promise.all([E.db.select('seguimiento_registros', { eq: { seguimiento_id: s.id }, order: 'creado_en desc' }), misEstudiantes(b)]);
  await perfiles([...regs.map((r) => r.estudiante_id), ...regs.map((r) => r.autor_id)]);
  const cursoDe = new Map(ests.map((x) => [x.e.id, x.curso]));
  const abierto = (!s.fecha_inicial || hoy() >= s.fecha_inicial) && (!s.fecha_final || hoy() <= s.fecha_final);
  const filtroCurso = p.curso || '';
  const vis = regs.filter((r) => !filtroCurso || cursoDe.get(r.estudiante_id)?.id === filtroCurso);
  const resumen = (r) => s.campos.slice(0, 2).map((c) => valorTexto(c, r.datos?.[c.id])).filter(Boolean).join(' · ').slice(0, 140);
  m.innerHTML = cabecera(esc(s.nombre), { volver: '#/seguimientos', acciones: `${puedoEditarPlantilla ? '<button class="btn" data-editar>Editar formulario</button>' : ''}${puedoRegistrar && abierto ? '<button class="btn btn-primario" data-nuevo>＋ Registro</button>' : ''}` }) + `
    ${s.descripcion ? `<p class="ayuda">${esc(s.descripcion)}</p>` : ''}
    <p class="ayuda">${s.propio ? 'Seguimiento propio' : 'Seguimiento del colegio'}${s.anio ? ' · ' + s.anio : ''} · Desde ${fecha(s.fecha_inicial)}${s.fecha_final ? ' hasta ' + fecha(s.fecha_final) : ''}${s.registro_unico ? ' · registro único' : ''}${s.visible_familia ? ' · la familia lo ve' : ' · privado (no lo ve la familia)'}${!abierto ? ' · <span class="chip">Cerrado</span>' : ''}${!s.activo ? ' · <span class="chip">Inactivo</span>' : ''}</p>
    <div class="tarjeta-cab"><label class="en-linea">Curso <select data-curso><option value="">Todos</option>${[...new Map(ests.map((x) => [x.curso?.id, x.curso])).values()].filter(Boolean).map((c) => `<option value="${c.id}" ${c.id === filtroCurso ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}</select></label><span>${vis.length} registro(s)</span></div>
    ${vis.length ? `<div class="lista">${vis.map((r) => `<button class="fila fila-boton" data-reg="${r.id}"><span class="avatar">📝</span><span class="crece"><b>${esc(nombreLista(E.perfiles.get(r.estudiante_id) || {}))}</b><small>${esc(resumen(r))}</small><small>${fechaHora(r.actualizado_en || r.creado_en)} · ${esc(nombre(E.perfiles.get(r.autor_id)) || '')}</small></span><span class="flecha">›</span></button>`).join('')}</div>` : vacio('Aún no hay registros.')}`;
  m.querySelector('[data-curso]').onchange = (e) => { location.hash = `#/seguimiento/${s.id}${e.target.value ? '?curso=' + e.target.value : ''}`; };
  m.querySelector('[data-editar]')?.addEventListener('click', async () => { const r = await editarPlantilla(b, s); if (r === 'borrado') location.hash = '#/seguimientos'; else if (r) seguimiento(m, p); });
  m.querySelector('[data-nuevo]')?.addEventListener('click', async () => { if (await editarRegistro(b, s, null, ests, regs)) seguimiento(m, p); });
  m.querySelectorAll('[data-reg]').forEach((bt) => (bt.onclick = async () => { if (await editarRegistro(b, s, regs.find((r) => r.id === bt.dataset.reg), ests, regs)) seguimiento(m, p); }));
}

export function valorTexto(c, v) {
  if (v == null || v === '' || (Array.isArray(v) && !v.length)) return '';
  if (c.tipo === 'si_no') return v ? 'Sí' : 'No';
  if (c.tipo === 'varias') return [].concat(v).join(', ');
  if (c.tipo === 'fecha') return fecha(v);
  return String(v);
}

const campoHTML = (c, v, soloLeer) => {
  const dis = soloLeer ? 'disabled' : '';
  const id = esc(c.id);
  const req = c.requerido ? ' *' : '';
  if (c.tipo === 'parrafo') return `<label>${esc(c.etiqueta)}${req}<textarea data-campo="${id}" rows="4" ${dis}>${esc(v ?? '')}</textarea></label>`;
  if (c.tipo === 'opcion') return `<label>${esc(c.etiqueta)}${req}<select data-campo="${id}" ${dis}><option value="">—</option>${c.opciones.map((o) => `<option ${o === v ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></label>`;
  if (c.tipo === 'varias') return `<fieldset data-campo="${id}" data-varias><legend>${esc(c.etiqueta)}${req}</legend>${c.opciones.map((o) => `<label class="fila-check"><input type="checkbox" value="${esc(o)}" ${[].concat(v || []).includes(o) ? 'checked' : ''} ${dis}> <span>${esc(o)}</span></label>`).join('')}</fieldset>`;
  if (c.tipo === 'si_no') return `<label>${esc(c.etiqueta)}${req}<select data-campo="${id}" ${dis}><option value="">—</option><option value="1" ${v === true ? 'selected' : ''}>Sí</option><option value="0" ${v === false ? 'selected' : ''}>No</option></select></label>`;
  if (c.tipo === 'fecha') return `<label>${esc(c.etiqueta)}${req}<input type="date" data-campo="${id}" value="${esc(v ?? '')}" ${dis}></label>`;
  if (c.tipo === 'numero') return `<label>${esc(c.etiqueta)}${req}<input data-campo="${id}" inputmode="decimal" value="${esc(v ?? '')}" ${dis}></label>`;
  return `<label>${esc(c.etiqueta)}${req}<input data-campo="${id}" value="${esc(v ?? '')}" ${dis}></label>`;
};

async function editarRegistro(b, s, reg, ests, regs) {
  const mio = !reg || reg.autor_id === E.yo.id || E.rol === 'admin';
  const est0 = reg?.estudiante_id;
  const html = `<div class="form">
    ${reg ? `<p><b>${esc(nombreLista(E.perfiles.get(est0) || {}))}</b> <small>${esc(ests.find((x) => x.e.id === est0)?.curso?.nombre || '')}</small></p>`
      : `<label>Estudiante<select name="estudiante"><option value="">Elige…</option>${ests.map((x) => `<option value="${x.e.id}">${esc(x.curso?.nombre || '')} · ${esc(nombreLista(x.e))}</option>`).join('')}</select></label>`}
    ${s.campos.map((c) => campoHTML(c, reg?.datos?.[c.id], !mio)).join('')}
    ${reg ? `<p class="ayuda">Creado ${fechaHora(reg.creado_en)} por ${esc(nombre(E.perfiles.get(reg.autor_id)) || '')}${reg.actualizado_en && reg.actualizado_en !== reg.creado_en ? ' · actualizado ' + fechaHora(reg.actualizado_en) : ''}</p>` : ''}
  </div>`;
  const r = await ventana({
    titulo: reg ? 'Registro' : `Nuevo registro · ${s.nombre}`, html,
    botones: mio ? [
      ...(reg ? [{ texto: 'Eliminar', clase: 'btn-peligro', antes: async () => { if (!(await confirmar('¿Eliminar el registro?', '', 'Eliminar'))) return false; await E.db.remove('seguimiento_registros', { id: reg.id }); return 'borrado'; } }] : []),
      { texto: 'Cancelar' },
      { texto: 'Guardar', antes: async (caja) => {
        const est = reg ? est0 : caja.querySelector('[name=estudiante]').value;
        if (!est) throw new Error('Elige el estudiante.');
        if (!reg && s.registro_unico) {
          const ya = regs.find((x) => x.estudiante_id === est);
          if (ya) throw new Error('Este seguimiento es de registro único y el estudiante ya tiene uno: ábrelo para editarlo.');
        }
        const datos = {};
        for (const c of s.campos) {
          const el = caja.querySelector(`[data-campo="${CSS.escape(String(c.id))}"]`);
          let v;
          if (c.tipo === 'varias') v = [...el.querySelectorAll('input:checked')].map((i) => i.value);
          else if (c.tipo === 'si_no') v = el.value === '' ? null : el.value === '1';
          else if (c.tipo === 'numero') v = el.value.trim() === '' ? null : Number(el.value.replace(',', '.'));
          else v = el.value.trim() || null;
          if (c.tipo === 'numero' && v != null && Number.isNaN(v)) throw new Error(`"${c.etiqueta}" debe ser un número.`);
          if (c.requerido && (v == null || v === '' || (Array.isArray(v) && !v.length))) throw new Error(`Falta: ${c.etiqueta}`);
          datos[c.id] = v;
        }
        let guardado;
        if (reg) [guardado] = await E.db.update('seguimiento_registros', { datos }, { id: reg.id });
        else [guardado] = await E.db.insert('seguimiento_registros', [{ colegio_id: E.colegio.id, seguimiento_id: s.id, estudiante_id: est, autor_id: E.yo.id, datos }]);
        await notificar(b, s, guardado || { ...reg, datos }, !reg, regs).catch((e) => aviso('El registro se guardó, pero no se pudo avisar: ' + e.message, 'error'));
        return true;
      } },
    ] : [{ texto: 'Cerrar' }],
  });
  if (r) aviso(r === 'borrado' ? 'Registro eliminado' : 'Registro guardado');
  return r;
}

// Aviso por mensaje interno (y por correo si está activo) según las reglas del seguimiento
async function notificar(b, s, reg, esNuevo, regs) {
  const n = s.notificar || {};
  if (!(n.persona || n.padres || n.profesor || n.director)) return;
  if ((n.cuando === 'crear' && !esNuevo) || (n.cuando === 'editar' && esNuevo)) return;
  const cada = Math.max(1, n.cada || 1);
  if (esNuevo && cada > 1) {
    const total = regs.filter((x) => x.estudiante_id === reg.estudiante_id).length + 1;
    if (total % cada !== 0) return;
  }
  const est = reg.estudiante_id;
  const dest = new Set();
  // a la familia solo se le avisa si el seguimiento es visible para ella
  if (n.persona && s.visible_familia) dest.add(est);
  if (n.padres && s.visible_familia) (await E.db.select('acudientes', { eq: { estudiante_id: est } })).forEach((a) => dest.add(a.acudiente_id));
  const mats = (await E.db.select('matriculas', { eq: { estudiante_id: est } })).filter((x) => x.estado === 'activa');
  const cursos = mats.map((x) => b.cursoPorId.get(x.curso_id)).filter(Boolean);
  if (n.profesor) b.asignaciones.filter((a) => cursos.some((c) => c.id === a.curso_id) && a.profesor_id).forEach((a) => dest.add(a.profesor_id));
  if (n.director) cursos.forEach((c) => c.director_id && dest.add(c.director_id));
  dest.delete(E.yo.id);
  if (!dest.size) return;
  const quien = nombre(E.perfiles.get(est));
  // en los seguimientos propios no se copia el contenido (los demás no pueden ver el registro)
  const cuerpo = `${esNuevo ? 'Nuevo registro' : 'Registro actualizado'} en "${s.nombre}" para ${quien}.` + (s.propio ? '' : '\n\n' + s.campos.map((c) => { const t = valorTexto(c, reg.datos?.[c.id]); return t ? `${c.etiqueta}: ${t}` : ''; }).filter(Boolean).join('\n'));
  const [msg] = await E.db.insert('mensajes', [{ colegio_id: E.colegio.id, autor_id: E.yo.id, asunto: `Seguimiento: ${s.nombre} · ${quien}`, cuerpo, permite_respuesta: true }]);
  await E.db.insert('mensaje_destinatarios', [...dest].map((id) => ({ mensaje_id: msg.id, colegio_id: E.colegio.id, perfil_id: id })));
  avisarPorCorreo('mensaje', msg.id);
}
