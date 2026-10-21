// Comunidad > Procesos en línea (REA Phidias §3.8): matrícula, autorizaciones, encuestas, inscripciones.
// El admin arma pasos y campos (con plantillas), fechas de apertura/cierre y audiencia;
// la familia inicia, avanza con "Siguiente" (se guarda el borrador) y termina.
import { E, base, perfiles, misEstudiantes } from '../estado.js';
import { esc, aviso, ventana, leerForm, confirmar, nombre, nombreLista, vacio, fecha, fechaHora, ROL } from '../ui.js';
import { cabecera, pestanas, camposHTML } from './comun.js';

const TIPOS = { texto: 'Texto corto', parrafo: 'Párrafo', numero: 'Número', fecha: 'Fecha', opcion: 'Una opción', multiple: 'Varias opciones', acepto: 'Aceptación (casilla)', archivo: 'Archivo', info: 'Texto informativo' };
const nid = () => Math.random().toString(36).slice(2, 9);
const nombreSeguro = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.\-]+/g, '_').slice(-120);
const local = (iso) => { if (!iso) return ''; const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
const abierto = (p) => p.publicado && new Date(p.abre) <= new Date() && (!p.cierra || new Date(p.cierra) > new Date());
const campo = (etiqueta, tipo = 'texto', extra = {}) => ({ id: nid(), etiqueta, tipo, obligatorio: tipo !== 'info' && tipo !== 'archivo', opciones: [], ...extra });

const PLANTILLAS = {
  matricula: () => ({
    titulo: `Matrícula ${new Date().getFullYear() + 1}`, descripcion: 'Proceso de matrícula en línea para el próximo año.',
    instrucciones: 'Complete cada paso y oprima "Siguiente". Puede guardar y continuar después. Al final revise la lista y oprima "Terminar".',
    pasos: [
      { titulo: 'Datos del estudiante', campos: [campo('Dirección de residencia'), campo('Barrio'), campo('Teléfono fijo', 'texto', { obligatorio: false }), campo('EPS'), campo('¿Necesita transporte escolar?', 'opcion', { opciones: ['Sí', 'No'] })] },
      { titulo: 'Datos de los acudientes', campos: [campo('Nombre del acudiente principal'), campo('Celular'), campo('Correo electrónico'), campo('Responsable económico (quién paga)')] },
      { titulo: 'Salud', campos: [campo('Recuerde actualizar la Ficha médica del estudiante en su perfil.', 'info'), campo('¿Alguna condición de salud nueva este año?', 'parrafo', { obligatorio: false })] },
      { titulo: 'Documentos', campos: [campo('Registro civil o tarjeta de identidad', 'archivo'), campo('Certificado de afiliación a EPS', 'archivo'), campo('Paz y salvo del año anterior', 'archivo')] },
      { titulo: 'Contrato y pagaré', campos: [campo('Lea el contrato de prestación de servicios educativos y el pagaré disponibles en Archivos del colegio.', 'info'), campo('Acepto el contrato de prestación de servicios educativos', 'acepto'), campo('Acepto firmar el pagaré', 'acepto'), campo('Observaciones y sugerencias', 'parrafo', { obligatorio: false })] },
    ], roles: ['acudiente'], por_estudiante: true,
  }),
  salida: () => ({
    titulo: 'Autorización de salida pedagógica', descripcion: 'Autorización para que el estudiante participe en la salida.',
    pasos: [{ titulo: 'Autorización', campos: [campo('Autorizo la participación de mi hijo(a)', 'opcion', { opciones: ['Sí autorizo', 'No autorizo'] }), campo('Contacto de emergencia ese día'), campo('Celular del contacto'), campo('Recomendaciones (alergias, medicamentos…)', 'parrafo', { obligatorio: false }), campo('Declaro que la información es verídica', 'acepto')] }],
    roles: ['acudiente'], por_estudiante: true,
  }),
  encuesta: () => ({
    titulo: 'Encuesta de satisfacción', descripcion: 'Ayúdenos a mejorar. Es anónima para los profesores.',
    pasos: [{ titulo: 'Su opinión', campos: [campo('Comunicación del colegio', 'opcion', { opciones: ['1', '2', '3', '4', '5'] }), campo('Calidad académica', 'opcion', { opciones: ['1', '2', '3', '4', '5'] }), campo('Atención administrativa', 'opcion', { opciones: ['1', '2', '3', '4', '5'] }), campo('¿Qué podemos mejorar?', 'parrafo', { obligatorio: false })] }],
    roles: ['acudiente'], por_estudiante: false,
  }),
  blanco: () => ({ titulo: 'Nuevo proceso', descripcion: '', pasos: [{ titulo: 'Paso 1', campos: [campo('Pregunta 1')] }], roles: ['acudiente'], por_estudiante: true }),
};

// ---------------------------------------------------------------- Lista
export async function lista(m, p) {
  const admin = E.rol === 'admin';
  const procs = await E.db.select('procesos', { eq: { colegio_id: E.colegio.id }, order: 'creado_en desc' });
  const visibles = admin ? procs : procs.filter((x) => x.publicado && x.roles?.includes(E.rol));
  const resp = await E.db.select('proceso_respuestas', admin ? { eq: { colegio_id: E.colegio.id } } : { eq: { perfil_id: E.yo.id } });
  const ests = !admin ? (E.rol === 'estudiante' ? [E.yo.id] : await misEstudiantes()) : [];
  await perfiles(ests);
  const tab = p.tab === 'terminados' ? 'terminados' : 'abiertos';

  if (admin) {
    m.innerHTML = cabecera('Procesos en línea', { acciones: '<button class="btn btn-primario" data-nuevo>＋ Nuevo proceso</button>' }) + `
      <p class="ayuda">Matrículas, autorizaciones, encuestas, inscripciones… La familia los ve en "Procesos" mientras estén abiertos.</p>
      ${visibles.length ? `<div class="lista">${visibles.map((x) => {
        const rs = resp.filter((r) => r.proceso_id === x.id);
        const term = rs.filter((r) => r.terminado).length;
        const estado = !x.publicado ? '📝 Borrador' : abierto(x) ? '🟢 Abierto' : new Date(x.abre) > new Date() ? '🕓 Programado' : '🔒 Cerrado';
        return `<div class="fila fila-clase"><span class="avatar">📋</span><span class="crece"><b>${esc(x.titulo)}</b><small>${estado} · ${fecha(x.abre)}${x.cierra ? ' → ' + fecha(x.cierra) : ''} · ${x.roles.map((r) => ROL[r]).join(', ')} · ${term} terminado(s), ${rs.length - term} en curso</small></span>
          <span class="botones-fila"><button class="btn btn-chico" data-editar="${x.id}">Editar</button><a class="btn btn-chico" href="#/proceso/${x.id}/respuestas">Respuestas</a><button class="btn btn-chico" data-publicar="${x.id}">${x.publicado ? 'Despublicar' : 'Publicar'}</button></span></div>`;
      }).join('')}</div>` : vacio('Aún no hay procesos. Crea uno desde una plantilla (Matrícula, Autorización, Encuesta).')}`;
    m.querySelector('[data-nuevo]').onclick = async () => {
      const t = await ventana({ titulo: 'Nuevo proceso', html: `<p class="ayuda">Empieza desde una plantilla:</p><div class="lista">${[['matricula', '🎓 Matrícula (5 pasos)'], ['salida', '🚌 Autorización de salida pedagógica'], ['encuesta', '📊 Encuesta de satisfacción'], ['blanco', '📄 En blanco']].map(([k, t2]) => `<button class="fila fila-boton" data-t="${k}"><span><b>${t2}</b></span><span class="flecha">›</span></button>`).join('')}</div>`, alAbrir: (c, cerrar) => c.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => cerrar(b.dataset.t))) });
      if (t && (await editor(PLANTILLAS[t]()))) lista(m, p);
    };
    m.querySelectorAll('[data-editar]').forEach((b) => (b.onclick = async () => { if (await editor(procs.find((x) => x.id === b.dataset.editar))) lista(m, p); }));
    m.querySelectorAll('[data-publicar]').forEach((b) => (b.onclick = async () => {
      const x = procs.find((y) => y.id === b.dataset.publicar);
      try { await E.db.update('procesos', { publicado: !x.publicado }, { id: x.id }); aviso(x.publicado ? 'Proceso despublicado' : 'Proceso publicado'); lista(m, p); } catch (e) { aviso(e.message, 'error'); }
    }));
    return;
  }

  // Familia / estudiante: una fila por proceso (y por estudiante si aplica)
  const filas = [];
  for (const x of visibles) {
    const quienes = x.por_estudiante ? (E.rol === 'estudiante' ? [E.yo.id] : ests) : [null];
    for (const est of quienes) {
      const r = resp.find((y) => y.proceso_id === x.id && (y.estudiante_id || null) === est);
      filas.push({ x, est, r });
    }
  }
  const lst = filas.filter(({ x, r }) => (tab === 'terminados' ? r?.terminado || !abierto(x) : abierto(x) && !r?.terminado));
  m.innerHTML = cabecera('Procesos en línea') + pestanas([['abiertos', 'Abiertos'], ['terminados', 'Terminados o cerrados']], tab, '#/procesos?tab=') + `
    <div class="contenido">${lst.length ? `<div class="lista">${lst.map(({ x, est, r }) => `
      <div class="fila fila-clase"><span class="avatar">📋</span><span class="crece"><b>${esc(x.titulo)}${est ? ' · ' + esc(E.perfiles.get(est)?.nombres || '') : ''}</b><small>${x.cierra ? 'Cierra ' + fechaHora(x.cierra) : 'Sin fecha de cierre'}${r ? (r.terminado ? ` · ✅ Terminado ${fecha(r.terminado_en)}` : ` · En curso (paso ${r.paso + 1} de ${x.pasos.length})`) : ''}</small></span>
        <span class="botones-fila">${abierto(x) ? `<a class="btn btn-chico ${r ? '' : 'btn-primario'}" href="#/proceso/${x.id}${est ? '?est=' + est : ''}">${r ? (r.terminado ? 'Editar' : 'Continuar') : 'Iniciar'}</a>` : r ? `<a class="btn btn-chico" href="#/proceso/${x.id}${est ? '?est=' + est : ''}">Ver</a>` : '<span class="chip">Cerrado</span>'}</span></div>`).join('')}</div>`
      : vacio(tab === 'abiertos' ? 'No tienes procesos pendientes. 🎉' : 'No hay procesos terminados.')}</div>`;
}

// ---------------------------------------------------------------- Editor (admin)
async function editor(proc) {
  const x = JSON.parse(JSON.stringify(proc));
  x.pasos ||= [];
  const pintar = (caja) => {
    caja.querySelector('[data-pasos]').innerHTML = x.pasos.map((ps, i) => `
      <fieldset class="paso-editor" data-paso="${i}">
        <legend>Paso ${i + 1}</legend>
        <div class="fila-editor"><input data-p-titulo value="${esc(ps.titulo)}" aria-label="Título del paso"><button class="btn-icono" data-p-arriba aria-label="Subir paso">↑</button><button class="btn-icono" data-p-borrar aria-label="Quitar paso">🗑</button></div>
        ${ps.campos.map((c, j) => `
          <div class="campo-editor" data-campo="${j}">
            <input data-c-etiqueta value="${esc(c.etiqueta)}" aria-label="Pregunta" placeholder="Pregunta o texto">
            <select data-c-tipo aria-label="Tipo">${Object.entries(TIPOS).map(([k, t]) => `<option value="${k}" ${k === c.tipo ? 'selected' : ''}>${t}</option>`).join('')}</select>
            ${['opcion', 'multiple'].includes(c.tipo) ? `<input data-c-opciones value="${esc((c.opciones || []).join(', '))}" placeholder="Opciones separadas por coma" aria-label="Opciones">` : ''}
            ${c.tipo !== 'info' ? `<label class="check"><input type="checkbox" data-c-obligatorio ${c.obligatorio ? 'checked' : ''}> Obligatorio</label>` : ''}
            <button class="btn-icono" data-c-borrar aria-label="Quitar campo">✕</button>
          </div>`).join('')}
        <button class="btn btn-chico" data-c-nuevo>＋ Campo</button>
      </fieldset>`).join('');
  };
  const leerPasos = (caja) => {
    caja.querySelectorAll('[data-paso]').forEach((fs) => {
      const ps = x.pasos[+fs.dataset.paso];
      ps.titulo = fs.querySelector('[data-p-titulo]').value.trim() || 'Paso';
      fs.querySelectorAll('[data-campo]').forEach((ce) => {
        const c = ps.campos[+ce.dataset.campo];
        c.etiqueta = ce.querySelector('[data-c-etiqueta]').value.trim();
        c.tipo = ce.querySelector('[data-c-tipo]').value;
        const op = ce.querySelector('[data-c-opciones]');
        if (op) c.opciones = op.value.split(',').map((s) => s.trim()).filter(Boolean);
        c.obligatorio = !!ce.querySelector('[data-c-obligatorio]')?.checked;
      });
    });
  };
  const r = await ventana({
    titulo: x.id ? 'Editar proceso' : 'Nuevo proceso',
    html: camposHTML([
      { name: 'titulo', label: 'Título' },
      { name: 'descripcion', label: 'Descripción corta' },
      { name: 'instrucciones', label: 'Instrucciones (se muestran al iniciar)', tipo: 'textarea', filas: 3 },
      { name: 'abre', label: 'Abre', tipo: 'datetime-local', def: local(x.abre || new Date().toISOString()) },
      { name: 'cierra', label: 'Cierra (opcional)', tipo: 'datetime-local', def: local(x.cierra) },
      { name: 'por_estudiante', label: 'Se responde una vez por cada estudiante (si no, una vez por persona)', tipo: 'checkbox', def: x.por_estudiante ?? true },
    ], { ...x, abre: local(x.abre || new Date().toISOString()), cierra: local(x.cierra) }) + `
      <fieldset class="form"><legend>Para</legend>${Object.entries(ROL).filter(([k]) => k !== 'admin').map(([k, t]) => `<label class="check"><input type="checkbox" name="roles" data-multi="1" value="${k}" ${x.roles?.includes(k) ? 'checked' : ''}> ${t}</label>`).join('')}</fieldset>
      <h3 class="sub">Pasos y campos</h3><div data-pasos></div><button class="btn" data-p-nuevo>＋ Paso</button>`,
    alAbrir: (caja) => {
      pintar(caja);
      caja.addEventListener('click', (e) => {
        const fs = e.target.closest('[data-paso]');
        const i = fs ? +fs.dataset.paso : -1;
        if (e.target.closest('[data-p-nuevo]')) { leerPasos(caja); x.pasos.push({ titulo: `Paso ${x.pasos.length + 1}`, campos: [campo('Pregunta')] }); pintar(caja); }
        else if (e.target.closest('[data-p-borrar]')) { leerPasos(caja); x.pasos.splice(i, 1); pintar(caja); }
        else if (e.target.closest('[data-p-arriba]') && i > 0) { leerPasos(caja); [x.pasos[i - 1], x.pasos[i]] = [x.pasos[i], x.pasos[i - 1]]; pintar(caja); }
        else if (e.target.closest('[data-c-nuevo]')) { leerPasos(caja); x.pasos[i].campos.push(campo('')); pintar(caja); }
        else if (e.target.closest('[data-c-borrar]')) { leerPasos(caja); x.pasos[i].campos.splice(+e.target.closest('[data-campo]').dataset.campo, 1); pintar(caja); }
      });
      caja.addEventListener('change', (e) => { if (e.target.matches('[data-c-tipo]')) { leerPasos(caja); pintar(caja); } });
    },
    botones: [
      ...(x.id ? [{ texto: 'Eliminar', clase: 'btn-peligro', antes: async () => { if (!(await confirmar('¿Eliminar el proceso?', 'Se borrarán también todas las respuestas.', 'Eliminar'))) return false; await E.db.remove('procesos', { id: x.id }); return true; } }] : []),
      { texto: 'Cancelar' },
      { texto: 'Guardar', antes: async (caja) => {
        leerPasos(caja);
        const d = leerForm(caja);
        if (!d.titulo) throw new Error('Escribe el título.');
        if (!d.roles?.length) throw new Error('Elige para quién es el proceso.');
        if (!x.pasos.length || x.pasos.some((ps) => !ps.campos.length)) throw new Error('Cada paso necesita al menos un campo.');
        if (x.pasos.some((ps) => ps.campos.some((c) => !c.etiqueta))) throw new Error('Hay campos sin texto.');
        if (x.pasos.some((ps) => ps.campos.some((c) => ['opcion', 'multiple'].includes(c.tipo) && !c.opciones?.length))) throw new Error('Los campos de opciones necesitan opciones.');
        const datos = { titulo: d.titulo, descripcion: d.descripcion || null, instrucciones: d.instrucciones || null, abre: d.abre ? new Date(d.abre).toISOString() : new Date().toISOString(), cierra: d.cierra ? new Date(d.cierra).toISOString() : null, por_estudiante: !!d.por_estudiante, roles: d.roles, pasos: x.pasos };
        if (x.id) await E.db.update('procesos', datos, { id: x.id });
        else await E.db.insert('procesos', [{ colegio_id: E.colegio.id, creado_por: E.yo.id, publicado: false, ...datos }]);
        return true;
      } },
    ],
  });
  if (r) aviso(x.id ? 'Proceso guardado' : 'Proceso creado (en borrador: publícalo cuando esté listo)');
  return r;
}

// ---------------------------------------------------------------- Responder (asistente por pasos)
export async function responder(m, p) {
  const [x] = await E.db.select('procesos', { eq: { id: p.id } });
  if (!x) { m.innerHTML = vacio('Ese proceso no existe.'); return; }
  const est = x.por_estudiante ? p.est || (E.rol === 'estudiante' ? E.yo.id : null) : null;
  if (x.por_estudiante && !est) { m.innerHTML = vacio('Elige el estudiante desde la lista de procesos.'); return; }
  if (est) await perfiles([est]);
  const todas = await E.db.select('proceso_respuestas', { eq: { proceso_id: x.id, perfil_id: E.yo.id } });
  let r = todas.find((y) => (y.estudiante_id || null) === est) || null;
  const datos = { ...(r?.datos || {}) };
  const editable = abierto(x);
  const n = x.pasos.length;
  let paso = Math.min(Number(p.paso ?? (r && !r.terminado ? r.paso : 0)) || 0, n); // n = revisión final

  const guardar = async (terminar = false) => {
    const fila = { datos, paso: Math.min(paso, n - 1), terminado: terminar || !!r?.terminado };
    if (r) { const [nr] = await E.db.update('proceso_respuestas', fila, { id: r.id }); if (nr) r = nr; else Object.assign(r, fila); }
    else [r] = await E.db.insert('proceso_respuestas', [{ colegio_id: E.colegio.id, proceso_id: x.id, perfil_id: E.yo.id, estudiante_id: est, ...fila }]);
  };
  const faltan = (ps) => ps.campos.filter((c) => c.obligatorio && c.tipo !== 'info' && (c.tipo === 'acepto' ? !datos[c.id] : c.tipo === 'multiple' ? !datos[c.id]?.length : !String(datos[c.id] ?? '').trim()));

  const campoHTML = (c) => {
    const v = datos[c.id];
    const dis = editable ? '' : 'disabled';
    const req = c.obligatorio ? ' <span class="alerta">*</span>' : '';
    if (c.tipo === 'info') return `<div class="aviso-caja">${esc(c.etiqueta)}</div>`;
    if (c.tipo === 'parrafo') return `<label>${esc(c.etiqueta)}${req}<textarea data-campo="${esc(c.id)}" rows="4" ${dis}>${esc(v || '')}</textarea></label>`;
    if (c.tipo === 'opcion') return `<fieldset><legend>${esc(c.etiqueta)}${req}</legend>${c.opciones.map((o) => `<label class="check"><input type="radio" name="r_${esc(c.id)}" data-campo="${esc(c.id)}" value="${esc(o)}" ${v === o ? 'checked' : ''} ${dis}> ${esc(o)}</label>`).join('')}</fieldset>`;
    if (c.tipo === 'multiple') return `<fieldset><legend>${esc(c.etiqueta)}${req}</legend>${c.opciones.map((o) => `<label class="check"><input type="checkbox" data-campo="${esc(c.id)}" data-multi value="${esc(o)}" ${(v || []).includes(o) ? 'checked' : ''} ${dis}> ${esc(o)}</label>`).join('')}</fieldset>`;
    if (c.tipo === 'acepto') return `<label class="check acepto"><input type="checkbox" data-campo="${esc(c.id)}" ${v ? 'checked' : ''} ${dis}> ${esc(c.etiqueta)}${req}</label>`;
    if (c.tipo === 'archivo') return `<label>${esc(c.etiqueta)}${req}${v?.nombre ? `<span class="ayuda">📎 ${esc(v.nombre)} (subido)</span>` : ''}${editable ? `<input type="file" data-campo="${esc(c.id)}" data-archivo>` : ''}</label>`;
    const tipo = c.tipo === 'fecha' ? 'date' : 'text';
    return `<label>${esc(c.etiqueta)}${req}<input type="${tipo}" data-campo="${esc(c.id)}" ${c.tipo === 'numero' ? 'inputmode="decimal"' : ''} value="${esc(v || '')}" ${dis}></label>`;
  };

  const leer = () => {
    m.querySelectorAll('[data-campo]').forEach((el) => {
      const id = el.dataset.campo;
      if (el.type === 'radio') { if (el.checked) datos[id] = el.value; }
      else if (el.dataset.multi !== undefined) { datos[id] = [...m.querySelectorAll(`[data-campo="${CSS.escape(id)}"][data-multi]:checked`)].map((c) => c.value); }
      else if (el.type === 'checkbox') datos[id] = el.checked;
      else if (!el.dataset.archivo) datos[id] = el.value.trim();
    });
  };
  const subirArchivos = async () => {
    for (const el of m.querySelectorAll('[data-archivo]')) {
      const f = el.files[0];
      if (!f) continue;
      if (f.size > 20 * 1024 * 1024) throw new Error(`"${f.name}" pesa más de 20 MB.`);
      const ruta = `${E.colegio.id}/${x.id}/${E.yo.id}/${Date.now()}_${nombreSeguro(f.name)}`;
      await E.db.subirArchivo('procesos', ruta, f);
      datos[el.dataset.campo] = { ruta, nombre: f.name, bytes: f.size };
    }
  };

  const pintar = () => {
    const pasoActual = x.pasos[paso];
    const enRevision = paso >= n;
    m.innerHTML = cabecera(esc(x.titulo), { volver: '#/procesos' }) + `
      <p class="sub-titulo">${est ? 'Estudiante: <b>' + esc(nombre(E.perfiles.get(est))) + '</b> · ' : ''}${x.cierra ? 'Cierra ' + fechaHora(x.cierra) : ''}${r?.terminado ? ' · ✅ Terminado ' + fecha(r.terminado_en) : ''}</p>
      ${!editable ? '<p class="aviso-caja">Este proceso está cerrado. Solo puedes ver tus respuestas.</p>' : ''}
      <ol class="pasos-barra">${x.pasos.map((ps, i) => `<li class="${i < paso ? 'hecho' : i === paso ? 'actual' : ''}"><button data-ir="${i}">${i + 1}</button><span>${esc(ps.titulo)}</span></li>`).join('')}<li class="${enRevision ? 'actual' : ''}"><button data-ir="${n}">✓</button><span>Revisión</span></li></ol>
      ${paso === 0 && x.instrucciones && !r ? `<div class="aviso-caja">${esc(x.instrucciones)}</div>` : ''}
      <section class="tarjeta">
        ${enRevision ? `<h2>Revisión final</h2>${x.pasos.map((ps, i) => { const f = faltan(ps); return `<div class="fila"><span>${f.length ? '⚠️' : '✅'}</span><span class="crece"><b>${esc(ps.titulo)}</b><small>${f.length ? 'Falta: ' + f.map((c) => esc(c.etiqueta)).join(', ') : 'Completo'}</small></span><button class="btn btn-chico" data-ir="${i}">Revisar</button></div>`; }).join('')}`
          : `<h2>Paso ${paso + 1} de ${n}: ${esc(pasoActual.titulo)}</h2><div class="form">${pasoActual.campos.map(campoHTML).join('')}</div>`}
      </section>
      <div class="pie-fijo botones-asistente">
        ${paso > 0 ? '<button class="btn" data-anterior>← Anterior</button>' : '<span></span>'}
        ${editable ? (enRevision ? '<button class="btn btn-primario" data-terminar>✅ Terminar</button>' : `<button class="btn btn-primario" data-siguiente>Siguiente →</button>`) : (enRevision ? '' : '<button class="btn" data-siguiente>Siguiente →</button>')}
      </div>`;
    const mover = async (a) => {
      if (editable && paso < n) { leer(); try { await subirArchivos(); await guardar(); } catch (e) { return aviso(e.message, 'error'); } }
      paso = a; pintar(); window.scrollTo(0, 0);
    };
    m.querySelectorAll('[data-ir]').forEach((b) => (b.onclick = () => mover(+b.dataset.ir)));
    m.querySelector('[data-anterior]')?.addEventListener('click', () => mover(paso - 1));
    m.querySelector('[data-siguiente]')?.addEventListener('click', () => {
      if (editable) { leer(); const f = faltan(x.pasos[paso]).filter((c) => c.tipo !== 'archivo' || !m.querySelector(`[data-campo="${CSS.escape(c.id)}"]`)?.files?.length); if (f.length) return aviso('Falta: ' + f.map((c) => c.etiqueta).join(', '), 'error'); }
      mover(paso + 1);
    });
    m.querySelector('[data-terminar]')?.addEventListener('click', async (ev) => {
      const f = x.pasos.flatMap(faltan);
      if (f.length) return aviso('Aún faltan campos obligatorios. Revisa los pasos marcados con ⚠️.', 'error');
      ev.target.disabled = true;
      try { await guardar(true); aviso('¡Proceso terminado!'); location.hash = '#/procesos?tab=terminados'; }
      catch (e) { aviso(e.message, 'error'); ev.target.disabled = false; }
    });
  };
  pintar();
}

// ---------------------------------------------------------------- Respuestas (admin)
export async function respuestas(m, p) {
  const [x] = await E.db.select('procesos', { eq: { id: p.id } });
  if (!x) { m.innerHTML = vacio('Ese proceso no existe.'); return; }
  const rs = await E.db.select('proceso_respuestas', { eq: { proceso_id: x.id }, order: 'actualizado_en desc' });
  await perfiles([...rs.map((r) => r.perfil_id), ...rs.map((r) => r.estudiante_id)]);
  const campos = x.pasos.flatMap((ps) => ps.campos.filter((c) => c.tipo !== 'info'));
  const valor = (r, c) => { const v = r.datos?.[c.id]; return v == null ? '' : c.tipo === 'acepto' ? (v ? 'Sí' : 'No') : Array.isArray(v) ? v.join(', ') : typeof v === 'object' ? v.nombre || '' : String(v); };
  m.innerHTML = cabecera('Respuestas · ' + esc(x.titulo), { volver: '#/procesos', acciones: rs.length ? '<button class="btn" data-csv>⬇ Exportar (Excel/CSV)</button>' : '' }) + `
    <p class="ayuda">${rs.filter((r) => r.terminado).length} terminado(s) · ${rs.filter((r) => !r.terminado).length} en curso.</p>
    ${rs.length ? `<div class="tabla-envoltura"><table class="tabla tabla-respuestas"><thead><tr><th>Responde</th>${x.por_estudiante ? '<th>Estudiante</th>' : ''}<th>Estado</th>${campos.map((c) => `<th>${esc(c.etiqueta)}</th>`).join('')}</tr></thead>
      <tbody>${rs.map((r) => `<tr><th scope="row">${esc(nombreLista(E.perfiles.get(r.perfil_id)))}</th>${x.por_estudiante ? `<td>${esc(nombreLista(E.perfiles.get(r.estudiante_id)))}</td>` : ''}<td>${r.terminado ? '✅ ' + fecha(r.terminado_en) : `En curso (paso ${r.paso + 1})`}</td>
        ${campos.map((c) => c.tipo === 'archivo' && r.datos?.[c.id]?.ruta ? `<td><button class="btn-link" data-arch="${esc(r.datos[c.id].ruta)}" data-nom="${esc(r.datos[c.id].nombre)}">📎 ${esc(r.datos[c.id].nombre)}</button></td>` : `<td>${esc(valor(r, c))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : vacio('Nadie ha respondido todavía.')}`;
  m.querySelectorAll('[data-arch]').forEach((b) => (b.onclick = async () => {
    try {
      const url = await E.db.urlArchivo('procesos', b.dataset.arch);
      const a = document.createElement('a'); a.href = url; a.target = '_blank'; a.download = b.dataset.nom; document.body.appendChild(a); a.click(); a.remove();
    } catch (e) { aviso(e.message, 'error'); }
  }));
  m.querySelector('[data-csv]')?.addEventListener('click', () => {
    const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
    const cab = ['Responde', ...(x.por_estudiante ? ['Estudiante'] : []), 'Estado', 'Terminado en', ...campos.map((c) => c.etiqueta)];
    const lineas = [cab.map(q).join(';'), ...rs.map((r) => [nombreLista(E.perfiles.get(r.perfil_id)), ...(x.por_estudiante ? [nombreLista(E.perfiles.get(r.estudiante_id))] : []), r.terminado ? 'Terminado' : 'En curso', r.terminado_en ? fechaHora(r.terminado_en) : '', ...campos.map((c) => valor(r, c))].map(q).join(';'))];
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + lineas.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    a.download = nombreSeguro(x.titulo) + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
  });
}
