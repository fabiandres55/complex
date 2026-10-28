// Planeaciones: el profesor sube su planeación (archivo) por clase y periodo;
// el administrador / coordinación la revisa: la aprueba o la devuelve con comentario.
import { E, base, perfiles, misAsignaciones, pref } from '../estado.js';
import { esc, aviso, ventana, leerForm, confirmar, nombre, nombreLista, vacio, fecha, fechaHora } from '../ui.js';
import { cabecera, pestanas, camposHTML } from './comun.js';

const BUCKET = 'planeaciones';
const ESTADO = { enviada: ['🕓', 'Por revisar', ''], aprobada: ['✅', 'Aprobada', 'ok'], devuelta: ['↩️', 'Devuelta', 'alerta'] };
const ACEPTA = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.jpg,.jpeg,.png,.webp,.txt';
const MAX = 20 * 1024 * 1024;

const etiqueta = (b, asigId) => {
  const a = b.asignacionPorId.get(asigId);
  return a ? `${b.materiaPorId.get(a.materia_id)?.nombre || 'Materia'} · ${b.cursoPorId.get(a.curso_id)?.nombre || ''}` : '—';
};
const peso = (n) => (n == null ? '' : n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
const nombreSeguro = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.\-]+/g, '_').slice(-120);
const icono = (tipo = '', nombreArch = '') => /pdf/.test(tipo) || /\.pdf$/i.test(nombreArch) ? '📕' : /word|document|\.docx?$/i.test(tipo + nombreArch) ? '📘' : /sheet|excel|\.xlsx?$/i.test(tipo + nombreArch) ? '📗' : /presentation|powerpoint/i.test(tipo) ? '📙' : /image/.test(tipo) ? '🖼️' : '📄';

const TABS = [['enviada', 'Por revisar'], ['devuelta', 'Devueltas'], ['aprobada', 'Aprobadas'], ['todas', 'Todas']];

export async function lista(m, p) {
  const b = await base();
  const admin = E.rol === 'admin';
  const lector = E.rol === 'director_seccion'; // ve las de su sección, sin aprobar ni subir
  const tab = TABS.some((t) => t[0] === p.tab) ? p.tab : (admin || lector ? 'enviada' : 'todas');
  let filas = await E.db.select('planeaciones', { eq: { colegio_id: E.colegio.id }, order: 'creado_en desc' });
  if (lector) {
    const grados = E.membresias.filter((x) => x.colegio_id === E.colegio.id && x.rol === 'director_seccion' && x.activo).flatMap((x) => x.seccion_grados || []);
    const asigs = new Set(b.asignaciones.filter((a) => grados.includes(b.cursoPorId.get(a.curso_id)?.grado_id)).map((a) => a.id));
    filas = filas.filter((x) => asigs.has(x.asignacion_id)); // la RLS ya lo hace; el demo no
  } else if (!admin) filas = filas.filter((x) => x.profesor_id === E.yo.id); // la RLS ya lo hace; el demo no
  if (p.asig) filas = filas.filter((x) => x.asignacion_id === p.asig);
  const cuenta = (e) => filas.filter((x) => x.estado === e).length;
  const visibles = tab === 'todas' ? filas : filas.filter((x) => x.estado === tab);
  await perfiles(filas.map((x) => x.profesor_id));
  const puedeSubir = !admin && !lector && misAsignaciones(b).length > 0;

  m.innerHTML = cabecera(p.asig ? `Planeaciones · ${esc(etiqueta(b, p.asig))}` : 'Planeaciones', {
    volver: p.asig ? '#/clases' : null,
    acciones: puedeSubir ? '<button class="btn btn-primario" data-subir>⬆ Subir planeación</button>' : '',
  }) + `
    <div class="cifras">
      ${['enviada', 'devuelta', 'aprobada'].map((e) => `<a class="cifra" href="#/planeaciones?tab=${e}${p.asig ? '&asig=' + p.asig : ''}"><b class="${ESTADO[e][2]}">${cuenta(e)}</b><span>${ESTADO[e][0]} ${ESTADO[e][1]}</span></a>`).join('')}
    </div>
    ${pestanas(TABS, tab, `#/planeaciones?${p.asig ? 'asig=' + p.asig + '&' : ''}tab=`)}
    <div class="contenido">
      ${visibles.length ? `<div class="lista">${visibles.map((x) => `
        <button class="fila fila-boton" data-ver="${x.id}">
          <span class="avatar">${icono(x.archivo_tipo, x.archivo_nombre)}</span>
          <span><b>${esc(x.titulo)}</b><small>${esc(etiqueta(b, x.asignacion_id))}${x.periodo_id ? ' · ' + esc(b.periodoPorId.get(x.periodo_id)?.nombre || '') : ''}${admin ? ' · ' + esc(nombre(E.perfiles.get(x.profesor_id))) : ''} · ${fecha(x.creado_en)}</small></span>
          <span class="chip ${ESTADO[x.estado][2]}">${ESTADO[x.estado][0]} ${ESTADO[x.estado][1]}</span>
        </button>`).join('')}</div>`
      : vacio(admin ? 'No hay planeaciones en esta lista.' : puedeSubir ? 'Aún no has subido planeaciones. Toca "Subir planeación".' : 'Aún no tienes clases asignadas.')}
    </div>`;
  const recargar = () => lista(m, p);
  m.querySelector('[data-subir]')?.addEventListener('click', async () => { if (await subir(b, null, p.asig)) recargar(); });
  m.querySelectorAll('[data-ver]').forEach((el) => (el.onclick = async () => {
    if (await detalle(b, filas.find((x) => x.id === el.dataset.ver))) recargar();
  }));
}

// Formulario para subir (o reemplazar) una planeación. Devuelve true si guardó.
export async function subir(b, fila, asigFija) {
  const mias = misAsignaciones(b);
  const perActual = b.periodos.find((x) => !x.cerrado) || b.periodos[0];
  const html = camposHTML([
    { name: 'asignacion_id', label: 'Clase', tipo: 'select', opciones: mias.map((a) => [a.id, etiqueta(b, a.id)]), def: fila?.asignacion_id || asigFija || pref('ultima_clase_plan') },
    { name: 'periodo_id', label: 'Periodo', tipo: 'select', vacio: 'Sin periodo', opciones: b.periodos.map((x) => [x.id, x.nombre]), def: fila?.periodo_id ?? perActual?.id },
    { name: 'titulo', label: 'Título (ej. Planeación semana 12 — Fracciones)' },
    { name: 'semana_inicio', label: 'Desde', tipo: 'date' },
    { name: 'semana_fin', label: 'Hasta', tipo: 'date' },
    { name: 'descripcion', label: 'Descripción / temas (opcional)', tipo: 'textarea', filas: 4 },
  ], fila || {}) + `
    <div class="form">
      <label>Archivo ${fila?.archivo_nombre ? '(deja vacío para conservar el actual)' : ''}
        <input type="file" name="archivo" accept="${ACEPTA}">
        <small class="ayuda">PDF, Word, Excel, PowerPoint o imagen · máximo 20 MB${E.db.modo === 'demo' ? ' (2 MB en el demo)' : ''}</small>
      </label>
      ${fila?.archivo_nombre ? `<p class="ayuda">Actual: ${icono(fila.archivo_tipo, fila.archivo_nombre)} ${esc(fila.archivo_nombre)} (${peso(fila.archivo_bytes)})</p>` : ''}
      ${fila?.estado === 'devuelta' ? '<p class="aviso-caja">Al guardar, la planeación vuelve a quedar <b>Por revisar</b>.</p>' : ''}
    </div>`;
  const r = await ventana({
    titulo: fila ? 'Editar planeación' : 'Subir planeación',
    html,
    botones: [{ texto: 'Cancelar' }, { texto: fila ? 'Guardar' : 'Subir', antes: async (caja) => {
      const d = leerForm(caja);
      const archivo = caja.querySelector('[name=archivo]').files[0];
      if (!d.asignacion_id) throw new Error('Elige la clase.');
      if (!d.titulo) throw new Error('Escribe un título.');
      if (!fila && !archivo) throw new Error('Adjunta el archivo de la planeación.');
      if (archivo && archivo.size > MAX) throw new Error('El archivo pesa más de 20 MB.');
      if (d.semana_inicio && d.semana_fin && d.semana_fin < d.semana_inicio) throw new Error('La fecha "Hasta" es anterior a "Desde".');
      pref('ultima_clase_plan', d.asignacion_id);
      const datos = { asignacion_id: d.asignacion_id, periodo_id: d.periodo_id || null, titulo: d.titulo, descripcion: d.descripcion || null, semana_inicio: d.semana_inicio || null, semana_fin: d.semana_fin || null, estado: 'enviada' };
      const boton = caja.querySelector('.ventana-pie .btn-primario');
      let id = fila?.id, creada = false;
      if (fila) await E.db.update('planeaciones', datos, { id });
      else { [{ id }] = await E.db.insert('planeaciones', [{ colegio_id: E.colegio.id, profesor_id: E.yo.id, ...datos }]); creada = true; }
      if (archivo) {
        boton.textContent = 'Subiendo…';
        const ruta = `${E.colegio.id}/${id}/${Date.now()}_${nombreSeguro(archivo.name)}`;
        try {
          await E.db.subirArchivo(BUCKET, ruta, archivo);
        } catch (e) {
          if (creada) await E.db.remove('planeaciones', { id }).catch(() => {});
          boton.textContent = fila ? 'Guardar' : 'Subir';
          throw e;
        }
        if (fila?.archivo_ruta) await E.db.borrarArchivo(BUCKET, fila.archivo_ruta).catch(() => {});
        await E.db.update('planeaciones', { archivo_ruta: ruta, archivo_nombre: archivo.name, archivo_tipo: archivo.type || null, archivo_bytes: archivo.size }, { id });
      }
      return true;
    } }],
  });
  if (r) aviso(fila ? 'Planeación actualizada' : 'Planeación enviada para revisión');
  return !!r;
}

async function abrirArchivo(x) {
  // La ventana se abre antes de pedir el enlace para que el navegador no la bloquee
  const w = window.open('', '_blank');
  try {
    const url = await E.db.urlArchivo(BUCKET, x.archivo_ruta);
    if (E.db.modo === 'demo') {
      // data: URL → descarga directa con su nombre
      w?.close();
      const a = document.createElement('a');
      a.href = url; a.download = x.archivo_nombre || 'planeacion';
      document.body.appendChild(a); a.click(); a.remove();
    } else if (w) w.location = url;
    else location.href = url;
  } catch (e) { w?.close(); aviso(e.message, 'error'); }
}

// Detalle con acciones según el rol. Devuelve true si algo cambió.
async function detalle(b, x) {
  const admin = E.rol === 'admin';
  const mio = x.profesor_id === E.yo.id;
  await perfiles([x.profesor_id, x.revisado_por]);
  const botones = [];
  if (admin) {
    botones.push({ texto: '↩️ Devolver', clase: 'btn-peligro', antes: async (caja) => {
      const { comentario } = leerForm(caja);
      if (!comentario) { caja.querySelector('[name=comentario]').focus(); throw new Error('Escribe qué debe corregir el profesor.'); }
      await E.db.update('planeaciones', { estado: 'devuelta', comentario }, { id: x.id });
      aviso('Planeación devuelta al profesor');
      return true;
    } });
    botones.push({ texto: '✅ Aprobar', antes: async (caja) => {
      const { comentario } = leerForm(caja);
      await E.db.update('planeaciones', { estado: 'aprobada', comentario: comentario || null }, { id: x.id });
      aviso('Planeación aprobada');
      return true;
    } });
  } else if (mio && x.estado !== 'aprobada') {
    botones.push({ texto: 'Eliminar', clase: 'btn-peligro', antes: async () => {
      if (!(await confirmar('¿Eliminar la planeación?', 'Se borrará también el archivo.', 'Eliminar'))) return false;
      if (x.archivo_ruta) await E.db.borrarArchivo(BUCKET, x.archivo_ruta).catch(() => {});
      await E.db.remove('planeaciones', { id: x.id });
      aviso('Planeación eliminada');
      return true;
    } });
    botones.push({ texto: x.estado === 'devuelta' ? 'Corregir y reenviar' : 'Editar', valor: 'editar' });
  }
  const r = await ventana({
    titulo: x.titulo,
    html: `
      <p><span class="chip ${ESTADO[x.estado][2]}">${ESTADO[x.estado][0]} ${ESTADO[x.estado][1]}</span></p>
      <dl class="datos">
        <div><dt>Clase</dt><dd>${esc(etiqueta(b, x.asignacion_id))}</dd></div>
        <div><dt>Periodo</dt><dd>${esc(b.periodoPorId.get(x.periodo_id)?.nombre || '—')}</dd></div>
        <div><dt>Profesor</dt><dd>${esc(nombre(E.perfiles.get(x.profesor_id)))}</dd></div>
        <div><dt>Semana</dt><dd>${x.semana_inicio ? fecha(x.semana_inicio) + (x.semana_fin ? ' – ' + fecha(x.semana_fin) : '') : '—'}</dd></div>
        <div><dt>Enviada</dt><dd>${fechaHora(x.creado_en)}</dd></div>
        ${x.revisado_en ? `<div><dt>Revisada</dt><dd>${fechaHora(x.revisado_en)} · ${esc(nombre(E.perfiles.get(x.revisado_por)))}</dd></div>` : ''}
      </dl>
      ${x.descripcion ? `<h3 class="sub">Descripción</h3><p class="texto-largo">${esc(x.descripcion)}</p>` : ''}
      <h3 class="sub">Archivo</h3>
      ${x.archivo_ruta ? `<button class="fila fila-boton tarjeta-archivo" data-abrir><span class="avatar">${icono(x.archivo_tipo, x.archivo_nombre)}</span><span><b>${esc(x.archivo_nombre)}</b><small>${peso(x.archivo_bytes)} · Toca para abrir</small></span><span class="flecha">↗</span></button>` : '<p class="ayuda">Sin archivo.</p>'}
      ${x.comentario && !admin ? `<h3 class="sub">Comentario de coordinación</h3><p class="aviso-caja">${esc(x.comentario)}</p>` : ''}
      ${admin ? `<div class="form"><label>Comentario para el profesor ${x.estado === 'enviada' ? '' : '(opcional)'}<textarea name="comentario" rows="4" placeholder="Obligatorio si la devuelves">${esc(x.comentario || '')}</textarea></label></div>` : ''}`,
    alAbrir: (caja) => caja.querySelector('[data-abrir]')?.addEventListener('click', () => abrirArchivo(x)),
    botones,
  });
  if (r === 'editar') return subir(b, x);
  return !!r;
}
