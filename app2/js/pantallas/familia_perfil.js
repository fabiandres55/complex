// Perfil de la familia y del estudiante (REA Phidias, F1/F2/F3):
//  * Información personal: ficha con datos, "Editar información personal", "Cambiar contraseña" y el núcleo familiar
//    (parentesco, vive con, responsable económico, acudiente).
//  * E-docs: documentos generados (boletines, certificados, carnet, procesos terminados).
//  * Matrícula → Obligaciones.
//  * Bandeja de entrada del hijo (solo lectura), desde la pestaña del hijo.
import { E, base, perfiles, personaActiva, viendoHijo, fotos, olvidarFoto } from '../estado.js';
import { esc, aviso, ventana, nombre, nombreLista, iniciales, vacio, fecha, fechaHora, avatarHTML } from '../ui.js';
import { cabecera, camposHTML } from './comun.js';
import { obligacionesFamilia } from './tablero.js';

const misEstudiantes = async () => {
  if (E.rol === 'estudiante') return [E.yo.id];
  if (E.rol !== 'acudiente') return [];
  return (await E.db.select('acudientes', { eq: { acudiente_id: E.yo.id } })).map((x) => x.estudiante_id);
};

// ---------------------------------------------------------------- Información personal
export async function infoPersonal(m, p) {
  const b = await base();
  const id = p.persona || (viendoHijo() ? personaActiva() : E.yo.id);
  await perfiles([id]);
  const pe = E.perfiles.get(id) || (id === E.yo.id ? E.yo : null);
  if (!pe) { m.innerHTML = vacio('No encontré esa persona.'); return; }
  const esYo = id === E.yo.id;
  const puedeEditar = esYo || E.rol === 'admin' || (E.rol === 'acudiente' && viendoHijo());
  // Datos de contacto en tabla aparte (solo los ven la persona, su familia, el admin y sus profesores)
  const [datos] = await E.db.select('datos_personales', { eq: { perfil_id: id } }).catch(() => []);
  const dp = datos || {};
  const [comoEst, comoAcu, mats] = await Promise.all([
    E.db.select('acudientes', { eq: { estudiante_id: id } }),
    E.db.select('acudientes', { eq: { acudiente_id: id } }),
    E.db.select('matriculas', { eq: { estudiante_id: id } }),
  ]);
  const mat = mats.find((x) => x.estado === 'activa' && b.cursoPorId.get(x.curso_id));
  const curso = mat && b.cursoPorId.get(mat.curso_id);
  const grado = curso && b.grados.find((g) => g.id === curso.grado_id);
  const hijosMats = comoAcu.length ? await E.db.select('matriculas', { in: { estudiante_id: comoAcu.map((x) => x.estudiante_id) } }) : [];
  const [, fot] = await Promise.all([
    perfiles([...comoEst.map((x) => x.acudiente_id), ...comoAcu.map((x) => x.estudiante_id)]),
    fotos([id, ...comoEst.map((x) => x.acudiente_id), ...comoAcu.map((x) => x.estudiante_id)]),
  ]);
  const correo = esYo ? E.sesion?.user?.email : null;
  const filaDato = (t, v) => `<tr><th>${t}</th><td>${v ? esc(v) : '<span class="ayuda">—</span>'}</td></tr>`;
  const familiar = (persona, parentesco, extra, ics = '') => `<div class="fila">${avatarHTML(persona, fot.get(persona?.id))}<span class="crece"><small>${esc(parentesco || '')}</small><b>${esc(nombre(persona) || '')}</b>${extra ? `<small>${extra}</small>` : ''}</span>${ics}</div>`;
  const iconos = (x) => `<span class="iconos-familia">${x.vive_con !== false ? '<span title="Vive con el estudiante">🏠</span>' : ''}${x.responsable_pagos ? '<span title="Responsable económico">💰</span>' : ''}${x.principal ? '<span title="Acudiente">⭐</span>' : ''}</span>`;
  m.innerHTML = cabecera('Información personal') + `
    <section class="tarjeta ficha-persona">
      <div class="ficha-cab">${avatarHTML(pe, fot.get(id), 'avatar-grande')}
        <div><h2>${esc(nombre(pe))}</h2>
        <p class="ayuda">${curso ? `Estudiante activo en ${esc(grado?.nombre || '')} ${esc(curso.nombre)}` : comoAcu.length ? 'Familiar' : esc(E.rol === 'profesor' && esYo ? 'Docente' : '')}</p>
        <div class="acciones">${puedeEditar ? '<button class="btn" data-editar>✏️ Editar información personal</button>' : ''}${puedeEditar && E.db.modo ? `<button class="btn" data-foto>📷 ${fot.get(id) ? 'Cambiar foto' : 'Poner foto'}</button>` : ''}${esYo ? '<button class="btn" data-clave>🔑 Cambiar contraseña</button>' : ''}</div></div>
      </div>
      <table class="tabla tabla-ficha"><tbody>
        ${filaDato(pe.tipo_documento || 'Documento', pe.numero_documento)}
        ${filaDato('Dirección', dp.direccion)}${filaDato('Barrio', dp.barrio)}${filaDato('Ciudad', dp.ciudad)}
        ${filaDato('Teléfono', pe.telefono)}${filaDato('Celular', dp.celular)}
        ${correo ? filaDato('Correo', correo.endsWith('@usuarios.complex') ? '' : correo) : ''}
        ${filaDato('Fecha de nacimiento', dp.fecha_nacimiento ? fecha(dp.fecha_nacimiento) + (dp.lugar_nacimiento ? ' · ' + dp.lugar_nacimiento : '') : '')}
      </tbody></table>
    </section>
    ${comoEst.length ? `<section class="tarjeta"><h2>Familiares</h2><p class="ayuda">🏠 vive con el estudiante · 💰 responsable económico · ⭐ acudiente</p><div class="lista">${comoEst.map((x) => familiar(E.perfiles.get(x.acudiente_id), x.parentesco || 'Familiar', '', iconos(x))).join('')}</div></section>` : ''}
    ${comoAcu.length ? `<section class="tarjeta"><h2>Familiares</h2><div class="lista">${comoAcu.map((x) => { const mt = hijosMats.find((y) => y.estudiante_id === x.estudiante_id && y.estado === 'activa'); const c = mt && b.cursoPorId.get(mt.curso_id); return familiar(E.perfiles.get(x.estudiante_id), 'Estudiante', c ? `${esc(b.grados.find((g) => g.id === c.grado_id)?.nombre || '')} ${esc(c.nombre)}${b.anio ? ` (${b.anio.anio})` : ''}` : '', iconos(x)); }).join('')}</div></section>` : ''}`;
  m.querySelector('[data-clave]')?.addEventListener('click', async () => { const { cambiarClave } = await import('../app.js'); cambiarClave(false); });
  m.querySelector('[data-foto]')?.addEventListener('click', async (ev) => {
    ev.target.disabled = true;
    try { if (await cambiarFoto(id)) { aviso('Foto guardada'); infoPersonal(m, p); } }
    catch (e) { aviso(e.message, 'error'); }
    finally { ev.target.disabled = false; }
  });
  m.querySelector('[data-editar]')?.addEventListener('click', async () => {
    const campos = [
      { name: 'direccion', label: 'Dirección' }, { name: 'barrio', label: 'Barrio' }, { name: 'ciudad', label: 'Ciudad' },
      ...(esYo || E.rol === 'admin' ? [{ name: 'telefono', label: 'Teléfono' }] : []), { name: 'celular', label: 'Celular' },
      { name: 'fecha_nacimiento', label: 'Fecha de nacimiento', tipo: 'date' }, { name: 'lugar_nacimiento', label: 'Lugar de nacimiento' },
    ];
    const r = await ventana({
      titulo: 'Editar información personal', html: camposHTML(campos, { ...dp, telefono: pe.telefono }),
      botones: [{ texto: 'Cancelar' }, { texto: 'Guardar', antes: async (caja) => {
        const d = Object.fromEntries(campos.map((c) => [c.name, caja.querySelector(`[name=${c.name}]`).value.trim() || null]));
        const { telefono, ...privados } = d;
        await E.db.upsert('datos_personales', [{ perfil_id: id, ...privados, actualizado_en: new Date().toISOString() }], 'perfil_id');
        if ('telefono' in d) { const [r2] = await E.db.update('perfiles', { telefono }, { id }); Object.assign(pe, r2 || { telefono }); if (esYo) E.yo.telefono = telefono; }
        return true;
      } }],
    });
    if (r) { aviso('Información guardada'); infoPersonal(m, p); }
  });
}

// ---------------------------------------------------------------- E-docs
export async function edocs(m) {
  const b = await base();
  const ests = viendoHijo() ? [personaActiva()] : await misEstudiantes();
  await perfiles(ests);
  const { TIPOS_CERT } = await import('./certificados.js');
  const terminados = ests.length ? (await E.db.select('proceso_respuestas', { in: { estudiante_id: ests } }).catch(() => [])).filter((x) => x.terminado) : [];
  const procs = terminados.length ? await E.db.select('procesos', { in: { id: [...new Set(terminados.map((x) => x.proceso_id))] } }).catch(() => []) : [];
  m.innerHTML = cabecera('E-docs') + `<p class="ayuda">Documentos generados por el colegio: boletines, certificados, carnet y procesos en línea terminados.</p>
    ${ests.length ? ests.map((id) => `
      <section class="tarjeta"><h2>${esc(nombre(E.perfiles.get(id)) || '')}</h2>
        <h3 class="sub">Boletines</h3>
        <div class="lista">${b.periodos.map((x) => `<a class="fila fila-boton" href="#/boletin/${id}/${x.id}"><span class="avatar">📄</span><span class="crece"><b>Boletín · ${esc(x.nombre)}</b><small>${x.cerrado ? 'Definitivo' : 'Parcial'}</small></span><span class="flecha">›</span></a>`).join('')}</div>
        <h3 class="sub">Certificados</h3>
        <div class="lista">${Object.entries(TIPOS_CERT).map(([k, v]) => `<a class="fila fila-boton" href="#/certificado/${k}/${id}"><span class="avatar">📜</span><span class="crece"><b>${esc(v)}</b></span><span class="flecha">›</span></a>`).join('')}
          <a class="fila fila-boton" href="#/carnet/${id}"><span class="avatar">🪪</span><span class="crece"><b>Carnet estudiantil</b></span><span class="flecha">›</span></a></div>
        ${terminados.filter((x) => x.estudiante_id === id).length ? `<h3 class="sub">Procesos terminados</h3><div class="lista">${terminados.filter((x) => x.estudiante_id === id).map((x) => { const pr = procs.find((y) => y.id === x.proceso_id); return `<a class="fila fila-boton" href="#/proceso/${x.proceso_id}"><span class="avatar">📋</span><span class="crece"><b>${esc(pr?.titulo || pr?.nombre || 'Proceso')}</b><small>Terminado ${x.terminado_en ? fechaHora(x.terminado_en) : ''}</small></span><span class="flecha">›</span></a>`; }).join('')}</div>` : ''}
      </section>`).join('') : vacio('No hay documentos.')}`;
}

// ---------------------------------------------------------------- Matrícula → Obligaciones
export async function obligaciones(m) {
  const ests = viendoHijo() ? [personaActiva()] : await misEstudiantes();
  const html = ests.length ? await obligacionesFamilia(ests) : '';
  m.innerHTML = cabecera('Obligaciones') + (html || vacio('No tienes obligaciones pendientes. 🎉')) + '<p class="ayuda">Pendientes de matrícula y del colegio: procesos en línea, ficha médica y pagos vencidos.</p>';
}

// ---------------------------------------------------------------- Bandeja del hijo (solo lectura)
export async function bandejaHijo(m) {
  const est = personaActiva();
  if (!viendoHijo() || !est) { m.innerHTML = vacio('Elige la pestaña de tu hijo para ver su bandeja.'); return; }
  await perfiles([est]);
  const filas = (await E.db.select('mensaje_destinatarios', { eq: { perfil_id: est } })).filter((d) => !d.eliminado);
  const ahoraIso = new Date().toISOString();
  const msgs = (filas.length ? await E.db.select('mensajes', { in: { id: filas.map((d) => d.mensaje_id) }, order: 'creado_en desc' }) : []).filter((x) => !x.expira_en || x.expira_en > ahoraIso);
  await perfiles(msgs.map((x) => x.autor_id));
  const leido = new Map(filas.map((d) => [d.mensaje_id, !!d.leido_en]));
  m.innerHTML = cabecera(`Bandeja de entrada de ${esc(E.perfiles.get(est)?.nombres || '')}`) + `
    <p class="ayuda">Solo lectura: ves lo que recibe ${esc(nombre(E.perfiles.get(est)) || '')}. Al abrirlos no se marcan como leídos.</p>
    ${msgs.length ? `<div class="lista bandeja">${msgs.map((x) => `<a class="fila fila-boton ${leido.get(x.id) ? '' : 'no-leido'}" href="#/mensaje/${x.id}"><span class="avatar">${esc(iniciales(E.perfiles.get(x.autor_id) || {}))}</span><span class="crece"><b>${esc(x.asunto)}</b><small>${esc(nombre(E.perfiles.get(x.autor_id)) || '')} · ${fechaHora(x.creado_en)}${leido.get(x.id) ? '' : ' · sin leer'}</small></span><span class="flecha">›</span></a>`).join('')}</div>` : vacio('No hay mensajes.')}`;
}

// ---------------------------------------------------------------- Foto de la persona
// Se achica en el celular (480 px, JPEG) antes de subirla: ~40 KB en vez de varios MB.
async function achicarFoto(archivo, lado = 480) {
  const img = await createImageBitmap(archivo);
  const k = Math.min(1, lado / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return new Promise((ok, mal) => c.toBlob((b) => (b ? ok(b) : mal(new Error('No se pudo leer la imagen.'))), 'image/jpeg', 0.85));
}

async function cambiarFoto(id) {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = 'image/*';
  const archivo = await new Promise((ok) => { inp.onchange = () => ok(inp.files[0] || null); inp.click(); });
  if (!archivo) return false;
  if (!archivo.type.startsWith('image/')) throw new Error('Elige una imagen (foto).');
  const blob = await achicarFoto(archivo);
  const ruta = `${id}/${Date.now()}.jpg`;
  const [antes] = await E.db.select('fotos', { eq: { perfil_id: id } }).catch(() => []);
  await E.db.subirArchivo('fotos', ruta, new File([blob], 'foto.jpg', { type: 'image/jpeg' }));
  await E.db.upsert('fotos', [{ perfil_id: id, ruta, actualizado_en: new Date().toISOString() }], 'perfil_id');
  if (antes?.ruta && antes.ruta !== ruta) E.db.borrarArchivo('fotos', antes.ruta).catch(() => {});
  olvidarFoto(id);
  return true;
}
