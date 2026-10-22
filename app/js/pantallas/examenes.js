// Exámenes en línea (REA Phidias §3.3): el profesor arma el examen (única respuesta,
// verdadero/falso o abierta) y marca la correcta; el estudiante lo presenta y la nota
// la calcula el servidor (entregar_examen). Las abiertas las califica el profesor.
import { E, base, perfiles, personaActiva } from '../estado.js';
import { esc, aviso, ventana, leerForm, confirmar, nombre, nombreLista, vacio, fecha, fechaHora, hoy } from '../ui.js';
import { cabecera, camposHTML } from './comun.js';
import { destinosDe, crearActividad, gruposHermanos } from './destinos.js';
import { mostrarNota, desempeno } from '../calculos.js';

const TIPOS = { unica: 'Única respuesta', vf: 'Verdadero / Falso', abierta: 'Respuesta abierta' };
const nid = () => Math.random().toString(36).slice(2, 9);
const local = (iso) => { if (!iso) return ''; const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
const abierto = (x) => x.publicado && new Date(x.abre) <= new Date() && (!x.cierra || new Date(x.cierra) > new Date());

// Lista para la pestaña "Exámenes" de la materia (columnas como Phidias)
export async function htmlLista(a) {
  const soyProfe = E.rol === 'admin' || (E.rol === 'profesor' && a.profesor_id === E.yo.id);
  let exs = await E.db.select('examenes', { eq: { asignacion_id: a.id }, order: 'abre desc' });
  if (!soyProfe) exs = exs.filter((x) => x.publicado && new Date(x.abre) <= new Date());
  const est = soyProfe ? null : personaActiva();
  const ints = exs.length ? await E.db.select('examen_intentos', { in: { examen_id: exs.map((x) => x.id) } }) : [];
  // si la nota está oculta, la fila del intento no llega: se pide solo el estado (entregado o no)
  if (E.rol === 'estudiante') for (const x of exs.filter((y) => !ints.some((i) => i.examen_id === y.id))) { const st = await E.db.rpc('mi_intento', { p_examen: x.id }).catch(() => null); if (st) ints.push({ examen_id: x.id, estudiante_id: est, ...st, oculto: true }); }
  const mio = (x) => ints.find((i) => i.examen_id === x.id && i.estudiante_id === est);
  return `
    ${soyProfe ? '<p><button class="btn btn-primario" data-nuevo-examen>＋ Nuevo examen</button></p>' : ''}
    ${exs.length ? `<div class="tabla-envoltura"><table class="tabla tabla-tareas">
      <thead><tr><th>Examen</th><th>Fecha límite</th><th>${soyProfe ? 'Entregados' : 'Entregado en'}</th><th>${soyProfe ? 'Estado' : 'Nota'}</th></tr></thead>
      <tbody>${exs.map((x) => {
        const i = est && mio(x);
        const ent = ints.filter((y) => y.examen_id === x.id && y.entregado_en).length;
        return `<tr><th scope="row"><a href="#/examen/${x.id}">🧪 ${esc(x.titulo)}</a></th><td>${x.cierra ? fechaHora(x.cierra) : 'Sin límite'}</td>
          <td>${soyProfe ? ent : i?.entregado_en ? fechaHora(i.entregado_en) : '—'}</td>
          <td>${soyProfe ? (!x.publicado ? '📝 Borrador' : abierto(x) ? '🟢 Abierto' : '🔒 Cerrado') : i?.entregado_en ? (i.nota != null && !i.oculto && (x.mostrar_resultado || x.resultados_publicados) ? `<b class="nota-${desempeno(i.nota, E.colegio).clase}">${mostrarNota(i.nota, E.colegio)}</b>${i.pendiente_revision ? ' <small>(falta revisar)</small>' : ''}` : 'Pendiente') : abierto(x) ? '🆕 Por presentar' : 'No presentado'}</td></tr>`;
      }).join('')}</tbody></table></div>` : vacio('No hay exámenes.')}`;
}

export function conectarLista(m, a, b, recargar) {
  m.querySelector('[data-nuevo-examen]')?.addEventListener('click', async () => { if (await editor(b, a, null)) recargar(); });
}

// ---------------------------------------------------------------- Editor (profesor)
async function editor(b, a, ex) {
  const x = ex ? JSON.parse(JSON.stringify(ex)) : { titulo: '', instrucciones: '', preguntas: [{ id: nid(), enunciado: '', tipo: 'unica', opciones: ['', ''], puntos: 1 }], mostrar_resultado: true };
  let claves = {}, entregados = 0;
  if (ex) {
    const [[c], [pq], ints] = await Promise.all([E.db.select('examen_claves', { eq: { examen_id: ex.id } }), E.db.select('examen_preguntas', { eq: { examen_id: ex.id } }), E.db.select('examen_intentos', { eq: { examen_id: ex.id } })]);
    claves = c?.claves || {};
    x.preguntas = pq?.preguntas || [];
    entregados = ints.filter((i) => i.entregado_en).length;
  }
  const per = b.periodos.find((p) => !p.cerrado) || b.periodos.at(-1);
  // Vínculo con la planilla y copias en otros grupos (REA Phidias)
  const vinculada = ex?.actividad_id ? (await E.db.select('actividades', { eq: { id: ex.actividad_id } }))[0] : null;
  const hermanos = ex ? [] : gruposHermanos(b, a);
  const cacheDest = new Map();
  const cargarDestinos = async (asigId, perId) => { const k = asigId + '|' + perId; if (!cacheDest.has(k)) cacheDest.set(k, perId ? await destinosDe(asigId, perId) : { destinos: [] }); return cacheDest.get(k).destinos; };
  const pintar = (caja) => {
    caja.querySelector('[data-preguntas]').innerHTML = x.preguntas.map((q, i) => `
      <fieldset class="paso-editor" data-q="${i}">
        <legend>Pregunta ${i + 1}</legend>
        <div class="fila-editor"><select data-q-tipo aria-label="Tipo">${Object.entries(TIPOS).map(([k, t]) => `<option value="${k}" ${k === q.tipo ? 'selected' : ''}>${t}</option>`).join('')}</select>
          <label class="en-linea">Puntos <input data-q-puntos inputmode="decimal" value="${esc(q.puntos ?? 1)}" style="width:70px"></label>
          <button class="btn-icono" data-q-borrar aria-label="Quitar pregunta">🗑</button></div>
        <textarea data-q-enunciado rows="2" placeholder="Enunciado de la pregunta" aria-label="Enunciado">${esc(q.enunciado)}</textarea>
        ${q.tipo === 'abierta' ? '<p class="ayuda">La califica el profesor después de la entrega.</p>' : `
          <p class="ayuda">Marca la respuesta correcta:</p>
          ${(q.tipo === 'vf' ? ['Verdadero', 'Falso'] : q.opciones).map((o, j) => `
            <div class="fila-editor"><input type="radio" name="correcta_${q.id}" value="${j}" ${String(claves[q.id]) === String(j) ? 'checked' : ''} aria-label="Correcta">
            ${q.tipo === 'vf' ? `<span>${o}</span>` : `<input data-q-opcion="${j}" value="${esc(o)}" placeholder="Opción ${j + 1}" aria-label="Opción ${j + 1}"><button class="btn-icono" data-q-quitar-op="${j}" aria-label="Quitar opción">✕</button>`}</div>`).join('')}
          ${q.tipo === 'unica' ? '<button class="btn btn-chico" data-q-op>＋ Opción</button>' : ''}`}
      </fieldset>`).join('');
  };
  const leer = (caja) => {
    caja.querySelectorAll('[data-q]').forEach((fs) => {
      const q = x.preguntas[+fs.dataset.q];
      q.tipo = fs.querySelector('[data-q-tipo]').value;
      q.puntos = Number(String(fs.querySelector('[data-q-puntos]').value).replace(',', '.')) || 1;
      q.enunciado = fs.querySelector('[data-q-enunciado]').value.trim();
      if (q.tipo === 'unica') q.opciones = [...fs.querySelectorAll('[data-q-opcion]')].map((i) => i.value.trim());
      if (q.tipo === 'vf') q.opciones = ['Verdadero', 'Falso'];
      if (q.tipo === 'abierta') q.opciones = [];
      const c = fs.querySelector(`[name="correcta_${q.id}"]:checked`);
      if (q.tipo !== 'abierta' && c) claves[q.id] = Number(c.value); else if (q.tipo === 'abierta') delete claves[q.id];
    });
  };
  const r = await ventana({
    titulo: ex ? 'Editar examen' : 'Nuevo examen',
    html: camposHTML([
      { name: 'titulo', label: 'Título' },
      { name: 'instrucciones', label: 'Instrucciones', tipo: 'textarea', filas: 2 },
      { name: 'periodo_id', label: 'Periodo', tipo: 'select', vacio: 'Sin periodo', opciones: b.periodos.map((p) => [p.id, p.nombre]), def: x.periodo_id ?? per?.id },
      { name: 'abre', label: 'Disponible desde', tipo: 'datetime-local' },
      { name: 'cierra', label: 'Fecha límite', tipo: 'datetime-local' },
      { name: 'duracion_min', label: 'Duración en minutos (opcional)', tipo: 'number' },
      { name: 'mostrar_resultado', label: 'Mostrar la nota al estudiante al entregar', tipo: 'checkbox', def: x.mostrar_resultado },
      { name: 'publicado', label: 'Publicado (los estudiantes lo ven)', tipo: 'checkbox', def: !!x.publicado },
    ], { ...x, abre: local(x.abre || new Date().toISOString()), cierra: local(x.cierra) }) + (entregados ? `<p class="aviso-caja">⚠️ ${entregados} estudiante(s) ya entregaron. Si cambias preguntas u opciones, sus notas NO se recalculan.</p>` : '') + (vinculada ? `<section class="tarjeta planilla-vinculo"><h3>Calificación en la planilla</h3><p class="ayuda">Vinculado a la actividad <b>${esc(vinculada.nombre)}</b> (${Number(vinculada.porcentaje)}%). La nota del examen pasa sola a la planilla.</p></section>`
        : `<section class="tarjeta planilla-vinculo"><h3>Calificación en la planilla</h3>
          <label>Experiencia / criterio<select name="destino"><option value="">No crear evaluación</option></select></label>
          <label>Peso (%)<input name="peso" inputmode="decimal" autocomplete="off"><small class="ayuda disponible" data-disp></small></label>
          <p class="ayuda">Al guardar se crea la actividad en la planilla y la nota del examen pasa sola.</p></section>`)
      + (hermanos.length ? `<fieldset class="tambien"><legend>Crear copia en (las copias son independientes del original)</legend>${hermanos.map((h) => `<div class="copia-grupo" data-h="${h.id}"><label class="fila-check"><input type="checkbox" name="copia" value="${h.id}"> <span><b>${esc(b.cursoPorId.get(h.curso_id)?.nombre || '')}</b></span></label><label>Experiencia / criterio<select data-h-destino><option value="">No crear evaluación</option></select></label></div>`).join('')}</fieldset>` : '')
      + '<h3 class="sub">Preguntas</h3><div data-preguntas></div><button class="btn" data-q-nueva>＋ Pregunta</button>',
    alAbrir: (caja) => {
      pintar(caja);
      // Destinos de la planilla (como en las tareas)
      const perSel = caja.querySelector('[name=periodo_id]');
      const sel = caja.querySelector('[name=destino]');
      const peso = caja.querySelector('[name=peso]');
      const disp = caja.querySelector('[data-disp]');
      const llenar = (s2, ds) => { const v = s2.value; s2.innerHTML = '<option value="">No crear evaluación</option>' + ds.map((d) => `<option value="${esc(d.k)}" ${d.disponible === 0 ? 'disabled' : ''}>${esc(d.t)} · disponible ${d.disponible}%</option>`).join(''); if ([...s2.options].some((o) => o.value === v && !o.disabled)) s2.value = v; };
      const pintarDisp = async (recortar) => {
        if (!sel) return;
        const d = (await cargarDestinos(a.id, perSel.value)).find((x2) => x2.k === sel.value);
        peso.closest('label').hidden = !d;
        if (!d) { disp.textContent = ''; return; }
        if (!peso.value) peso.value = String(d.disponible).replace('.', ',');
        if (recortar && Number(String(peso.value).replace(',', '.')) > d.disponible) { peso.value = String(d.disponible).replace('.', ','); aviso(`Máximo ${d.disponible}% en ${d.t}.`, 'error'); }
        disp.innerHTML = `Disponible <b>${d.disponible}%</b> en ${esc(d.t)}`;
      };
      const recargarDest = async () => {
        if (sel) { llenar(sel, await cargarDestinos(a.id, perSel.value)); await pintarDisp(false); }
        for (const box of caja.querySelectorAll('[data-h]')) llenar(box.querySelector('[data-h-destino]'), await cargarDestinos(box.dataset.h, perSel.value));
      };
      perSel.addEventListener('change', recargarDest);
      sel?.addEventListener('change', () => { peso.value = ''; pintarDisp(false); });
      peso?.addEventListener('input', () => pintarDisp(true));
      recargarDest();
      caja.addEventListener('click', (e) => {
        const fs = e.target.closest('[data-q]'); const i = fs ? +fs.dataset.q : -1;
        if (e.target.closest('[data-q-nueva]')) { leer(caja); x.preguntas.push({ id: nid(), enunciado: '', tipo: 'unica', opciones: ['', ''], puntos: 1 }); pintar(caja); }
        else if (e.target.closest('[data-q-borrar]')) { leer(caja); delete claves[x.preguntas[i].id]; x.preguntas.splice(i, 1); pintar(caja); }
        else if (e.target.closest('[data-q-op]')) { leer(caja); x.preguntas[i].opciones.push(''); pintar(caja); }
        else if (e.target.closest('[data-q-quitar-op]')) { leer(caja); const j = +e.target.closest('[data-q-quitar-op]').dataset.qQuitarOp; x.preguntas[i].opciones.splice(j, 1); const q = x.preguntas[i]; if (claves[q.id] === j) delete claves[q.id]; else if (claves[q.id] > j) claves[q.id]--; pintar(caja); }
      });
      caja.addEventListener('change', (e) => { if (e.target.matches('[data-q-tipo]')) { leer(caja); const q = x.preguntas[+e.target.closest('[data-q]').dataset.q]; delete claves[q.id]; if (q.tipo === 'unica' && q.opciones.length < 2) q.opciones = ['', '']; pintar(caja); } });
    },
    botones: [
      ...(ex ? [{ texto: 'Eliminar', clase: 'btn-peligro', antes: async () => { if (!(await confirmar('¿Eliminar el examen?', 'Se borrarán también las respuestas de los estudiantes.', 'Eliminar'))) return false; await E.db.remove('examenes', { id: ex.id }); return 'borrado'; } }] : []),
      { texto: 'Cancelar' },
      { texto: 'Guardar', antes: async (caja) => {
        leer(caja);
        const d = leerForm(caja);
        if (!d.titulo) throw new Error('Escribe el título.');
        if (!x.preguntas.length) throw new Error('Agrega al menos una pregunta.');
        for (const [i, q] of x.preguntas.entries()) {
          if (!q.enunciado) throw new Error(`La pregunta ${i + 1} no tiene enunciado.`);
          if (q.tipo === 'unica' && q.opciones.filter(Boolean).length < 2) throw new Error(`La pregunta ${i + 1} necesita al menos 2 opciones.`);
          if (q.tipo === 'unica' && q.opciones.some((o) => !o)) throw new Error(`La pregunta ${i + 1} tiene una opción vacía.`);
          if (q.tipo !== 'abierta' && claves[q.id] == null) throw new Error(`Marca la respuesta correcta de la pregunta ${i + 1}.`);
        }
        if (d.cierra && d.abre && d.cierra <= d.abre) throw new Error('La fecha límite debe ser después de la fecha de inicio.');
        const datos = { titulo: d.titulo, instrucciones: d.instrucciones || null, periodo_id: d.periodo_id || null, abre: d.abre ? new Date(d.abre).toISOString() : new Date().toISOString(), cierra: d.cierra ? new Date(d.cierra).toISOString() : null, duracion_min: Number(d.duracion_min) || null, mostrar_resultado: !!d.mostrar_resultado, publicado: !!d.publicado, num_preguntas: x.preguntas.length };
        const pesoAct = Number(String(d.peso || '').replace(',', '.'));
        const fechaAct = hoy(datos.cierra || datos.abre);
        if (d.destino && !datos.periodo_id) throw new Error('Para crear la evaluación en la planilla elige el periodo.');
        // Esta clase + copias (las copias son independientes)
        const grupos = [{ asigId: a.id, k: d.destino || '' }];
        if (!ex) for (const box of caja.querySelectorAll('[data-h]')) if (box.querySelector('[name=copia]').checked) grupos.push({ asigId: box.dataset.h, k: box.querySelector('[data-h-destino]').value });
        for (const g of grupos) if (g.k) {
          if (!(pesoAct > 0)) throw new Error('Escribe el peso (%) de la evaluación en la planilla.');
          const dd = (await cargarDestinos(g.asigId, datos.periodo_id)).find((y) => y.k === g.k);
          if (dd && pesoAct > dd.disponible) throw new Error(`${b.cursoPorId.get(b.asignacionPorId.get(g.asigId)?.curso_id)?.nombre}: en ${dd.t} solo quedan ${dd.disponible}% disponibles.`);
        }
        let id = ex?.id;
        if (id) {
          let actividad_id = ex.actividad_id || null;
          if (!actividad_id && d.destino) actividad_id = await crearActividad({ asigId: a.id, periodoId: datos.periodo_id, k: d.destino, destinos: await cargarDestinos(a.id, datos.periodo_id), nombre: d.titulo, porcentaje: pesoAct, fecha: fechaAct });
          await E.db.update('examenes', { ...datos, actividad_id }, { id });
          if (vinculada && vinculada.nombre !== d.titulo) await E.db.update('actividades', { nombre: d.titulo }, { id: vinculada.id }).catch(() => {});
          await E.db.upsert('examen_preguntas', [{ examen_id: id, colegio_id: E.colegio.id, preguntas: x.preguntas }], 'examen_id');
          await E.db.upsert('examen_claves', [{ examen_id: id, colegio_id: E.colegio.id, claves }], 'examen_id');
          return true;
        }
        for (const g of grupos) {
          const actividad_id = g.k ? await crearActividad({ asigId: g.asigId, periodoId: datos.periodo_id, k: g.k, destinos: await cargarDestinos(g.asigId, datos.periodo_id), nombre: d.titulo, porcentaje: pesoAct, fecha: fechaAct }) : null;
          const [{ id: nid2 }] = await E.db.insert('examenes', [{ colegio_id: E.colegio.id, asignacion_id: g.asigId, creado_por: E.yo.id, ...datos, actividad_id }]);
          await E.db.upsert('examen_preguntas', [{ examen_id: nid2, colegio_id: E.colegio.id, preguntas: x.preguntas }], 'examen_id');
          await E.db.upsert('examen_claves', [{ examen_id: nid2, colegio_id: E.colegio.id, claves }], 'examen_id');
        }
        return grupos.length > 1 ? 'copias:' + grupos.length : true;
      } },
    ],
  });
  if (r) aviso(r === 'borrado' ? 'Examen eliminado' : String(r).startsWith('copias:') ? `Examen creado en ${String(r).split(':')[1]} grupos` : 'Examen guardado');
  return r;
}

// ---------------------------------------------------------------- Pantalla del examen
export async function examen(m, p) {
  const b = await base();
  const [x] = await E.db.select('examenes', { eq: { id: p.id } });
  if (!x) { m.innerHTML = vacio('Ese examen no existe o aún no está disponible.'); return; }
  const a = b.asignacionPorId.get(x.asignacion_id);
  if (!a) { m.innerHTML = vacio('Este examen es de una clase que ya no está activa.'); return; }
  const soyProfe = E.rol === 'admin' || (E.rol === 'profesor' && a.profesor_id === E.yo.id);
  const volver = `#/aula/${a.id}?tab=examenes`;
  const materia = b.materiaPorId.get(a.materia_id)?.nombre || '';
  if (soyProfe) return resultados(m, b, a, x, volver);

  const est = personaActiva();
  // La nota solo es visible si el profesor la muestra; el estado (entregado o no) siempre
  const [intento] = await E.db.select('examen_intentos', { eq: { examen_id: x.id, estudiante_id: est } });
  const estado = intento || (E.rol === 'estudiante' ? await E.db.rpc('mi_intento', { p_examen: x.id }) : null);
  const puedePresentar = E.rol === 'estudiante' && abierto(x) && !estado?.entregado_en;
  const cab = cabecera(esc(x.titulo), { volver }) + `<p class="sub-titulo">${esc(materia)} · ${x.num_preguntas || 0} pregunta(s)${x.cierra ? ' · Fecha límite ' + fechaHora(x.cierra) : ''}${x.duracion_min ? ' · ' + x.duracion_min + ' min' : ''}</p>`;

  if (estado?.entregado_en) {
    const verNota = intento && (x.mostrar_resultado || x.resultados_publicados);
    const [pq] = verNota ? await E.db.select('examen_preguntas', { eq: { examen_id: x.id } }) : [];
    const pregs = pq?.preguntas || [];
    const det = intento?.detalle || {};
    m.innerHTML = cab + `
      <section class="tarjeta"><h2>✅ Entregado ${fechaHora(estado.entregado_en)}</h2>
        ${verNota && intento.nota != null ? `<p class="resultado-examen"><b class="nota-${desempeno(intento.nota, E.colegio).clase}">${mostrarNota(intento.nota, E.colegio)}</b> <small>${esc(intento.puntaje ?? 0)} de ${esc(intento.puntaje_max ?? 0)} puntos${intento.pendiente_revision ? ' · faltan preguntas abiertas por revisar' : ''}</small></p>` : '<p class="ayuda">El profesor publicará la nota.</p>'}
        ${intento?.fuera_de_tiempo ? '<p class="alerta">Se entregó fuera de tiempo; el profesor decide si lo tiene en cuenta.</p>' : ''}
        ${verNota && intento.comentario ? `<p class="aviso-caja">${esc(intento.comentario)}</p>` : ''}
      </section>
      ${verNota && pregs.length ? `<section class="tarjeta"><h2>Respuestas</h2>${pregs.map((q, i) => {
        const r = intento.respuestas?.[q.id];
        const txt = q.tipo === 'abierta' ? (r || '—') : r == null ? '— sin responder —' : (q.tipo === 'vf' ? ['Verdadero', 'Falso'] : q.opciones)[r];
        return `<div class="fila"><span>${det[q.id] === true ? '✅' : det[q.id] === false ? '❌' : '📝'}</span><span><b>${i + 1}. ${esc(q.enunciado)}</b><small>${esc(txt)}</small></span></div>`;
      }).join('')}</section>` : ''}`;
    return;
  }
  if (!puedePresentar) {
    m.innerHTML = cab + vacio(E.rol !== 'estudiante' ? (estado ? 'Empezó, todavía no entrega.' : 'Aún no lo ha presentado.') : 'El examen ya cerró.');
    return;
  }

  const empezar = async () => {
    let ini;
    try { ini = await E.db.rpc('iniciar_examen', { p_examen: x.id }); } catch (e) { return aviso(e.message, 'error'); }
    const pregs = ini.preguntas || [];
    // límite según el reloj del SERVIDOR (corrige si el celular tiene la hora corrida)
    const desfase = ini.ahora ? Date.now() - new Date(ini.ahora).getTime() : 0;
    const limite = ini.limite ? new Date(new Date(ini.limite).getTime() + desfase) : null;
    const clave = 'examen_borrador_' + x.id;
    let resp = {}; try { resp = JSON.parse(localStorage.getItem(clave)) || {}; } catch {}
    m.innerHTML = cab + `
      ${limite ? '<div class="reloj-examen" data-reloj></div>' : ''}
      ${x.instrucciones ? `<div class="aviso-caja">${esc(x.instrucciones)}</div>` : ''}
      <form class="form" data-form>${pregs.map((q, i) => `
        <fieldset class="pregunta"><legend><b>${i + 1}.</b> ${esc(q.enunciado)} <small>(${esc(q.puntos ?? 1)} pt)</small></legend>
          ${q.tipo === 'abierta' ? `<textarea name="${esc(q.id)}" rows="4">${esc(resp[q.id] || '')}</textarea>`
            : (q.tipo === 'vf' ? ['Verdadero', 'Falso'] : q.opciones).map((o, j) => `<label class="check opcion"><input type="radio" name="${esc(q.id)}" value="${j}" ${String(resp[q.id]) === String(j) ? 'checked' : ''}> ${esc(o)}</label>`).join('')}
        </fieldset>`).join('')}</form>
      <div class="pie-fijo"><button class="btn btn-primario btn-ancho" data-entregar>📤 Entregar examen</button></div>`;
    const form = m.querySelector('[data-form]');
    const leerResp = () => {
      const r = {};
      for (const q of pregs) {
        if (q.tipo === 'abierta') { const v = form.querySelector(`[name="${CSS.escape(q.id)}"]`).value.trim(); if (v) r[q.id] = v; }
        else { const c = form.querySelector(`[name="${CSS.escape(q.id)}"]:checked`); if (c) r[q.id] = Number(c.value); }
      }
      return r;
    };
    // borrador local (sobrevive si se cierra la pestaña)
    form.addEventListener('input', () => { try { localStorage.setItem(clave, JSON.stringify(leerResp())); } catch {} });
    let entregando = false, terminado = false, timer = null;
    const entregar = async (auto = false) => {
      if (entregando || terminado) return;
      const r = leerResp();
      if (!auto) {
        const faltan = pregs.filter((q) => r[q.id] == null).length;
        const ok = await confirmar('¿Entregar el examen?', faltan ? `Tienes ${faltan} pregunta(s) sin responder.` : 'Después no podrás cambiar tus respuestas.', 'Entregar');
        if (!ok || entregando || terminado) return;
      }
      entregando = true;
      try {
        await E.db.rpc('entregar_examen', { p_examen: x.id, p_respuestas: r });
        terminado = true;
        clearInterval(timer);
        try { localStorage.removeItem(clave); } catch {}
        aviso(auto ? 'Se acabó el tiempo: examen entregado' : '¡Examen entregado!');
        examen(m, p);
      } catch (e) {
        entregando = false;
        if (auto) { terminado = true; clearInterval(timer); } // no reintentar en bucle
        aviso(e.message, 'error');
      }
    };
    m.querySelector('[data-entregar]').onclick = () => entregar(false);
    if (limite) {
      const reloj = m.querySelector('[data-reloj]');
      const tic = () => {
        if (!document.body.contains(reloj)) return clearInterval(timer);
        const s = Math.max(0, Math.round((limite - Date.now()) / 1000));
        reloj.textContent = s >= 3600 ? `⏱ ${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min` : `⏱ ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
        reloj.classList.toggle('poco', s < 120);
        if (s === 0) { clearInterval(timer); entregar(true); }
      };
      tic(); timer = setInterval(tic, 1000);
    }
  };
  m.innerHTML = cab + `<section class="tarjeta">
    ${x.instrucciones ? `<p class="texto-largo">${esc(x.instrucciones)}</p>` : ''}
    <p>${x.duracion_min ? `Tendrás <b>${x.duracion_min} minutos</b> desde que empieces. ` : ''}Las preguntas aparecen al empezar. Al entregar ${x.mostrar_resultado ? 'verás tu nota' : 'el profesor publicará tu nota'}. Solo se puede presentar <b>una vez</b>.</p>
    <button class="btn btn-primario" data-empezar>▶ ${estado ? 'Continuar' : 'Empezar'} el examen</button></section>`;
  m.querySelector('[data-empezar]').onclick = empezar;
}

// Resultados para el profesor
async function resultados(m, b, a, x, volver) {
  const [ints, mats, [pq], [cl]] = await Promise.all([
    E.db.select('examen_intentos', { eq: { examen_id: x.id } }),
    E.db.select('matriculas', { eq: { curso_id: a.curso_id } }),
    E.db.select('examen_preguntas', { eq: { examen_id: x.id } }),
    E.db.select('examen_claves', { eq: { examen_id: x.id } }),
  ]);
  const pregs = pq?.preguntas || [];
  const claves = cl?.claves || {};
  const ests = mats.filter((y) => y.estado === 'activa').map((y) => y.estudiante_id);
  await perfiles(ests);
  const lista = ests.map((id) => ({ id, e: E.perfiles.get(id), i: ints.find((y) => y.estudiante_id === id) })).sort((p1, p2) => nombreLista(p1.e).localeCompare(nombreLista(p2.e)));
  const ent = ints.filter((y) => y.entregado_en);
  const conNota = ent.filter((y) => y.nota != null);
  const prom = conNota.length ? conNota.reduce((s, y) => s + Number(y.nota), 0) / conNota.length : null;
  m.innerHTML = cabecera('🧪 ' + esc(x.titulo), { volver, acciones: `${!x.mostrar_resultado ? `<button class="btn" data-publicar-notas>${x.resultados_publicados ? '🙈 Ocultar notas' : '📢 Publicar notas'}</button>` : ''}<button class="btn" data-editar>Editar</button>` }) + `
    <div class="cifras">
      <span class="cifra"><b>${ent.length} / ${ests.length}</b><span>Entregados</span></span>
      <span class="cifra"><b>${prom != null ? mostrarNota(prom, E.colegio) : '—'}</b><span>Promedio</span></span>
      <span class="cifra"><b class="${ent.some((y) => y.pendiente_revision) ? 'alerta' : ''}">${ent.filter((y) => y.pendiente_revision).length}</b><span>Por revisar (abiertas)</span></span>
      <span class="cifra"><b>${x.publicado ? (abierto(x) ? '🟢' : '🔒') : '📝'}</b><span>${x.publicado ? (abierto(x) ? 'Abierto' : new Date(x.abre) > new Date() ? 'Programado' : 'Cerrado') : 'Borrador'}</span></span>
    </div>
    ${!x.mostrar_resultado ? `<p class="ayuda">${x.resultados_publicados ? '📢 Las notas ya son visibles para estudiantes y familias.' : '🙈 Las notas están ocultas para estudiantes y familias hasta que las publiques.'}</p>` : ''}
    <div class="lista">${lista.map(({ id, e, i }) => `
      <div class="fila"><span class="crece"><b>${esc(nombreLista(e))}</b><small>${i?.entregado_en ? 'Entregó ' + fechaHora(i.entregado_en) + ` · ${esc(i.puntaje ?? 0)}/${esc(i.puntaje_max ?? 0)} pts${i.fuera_de_tiempo ? ' · <span class="alerta">fuera de tiempo</span>' : ''}` : i ? 'Empezó, sin entregar' : 'No ha empezado'}</small></span>
      ${i?.entregado_en ? `<button class="btn btn-chico" data-ver="${id}">${i.pendiente_revision ? '📝 Revisar' : mostrarNota(i.nota, E.colegio)}</button>` : ''}</div>`).join('')}</div>`;
  m.querySelector('[data-editar]').onclick = async () => { const r = await editor(b, a, x); if (r === 'borrado') location.hash = volver; else if (r) examen(m, { id: x.id }); };
  m.querySelector('[data-publicar-notas]')?.addEventListener('click', async () => {
    try { await E.db.update('examenes', { resultados_publicados: !x.resultados_publicados }, { id: x.id }); aviso(x.resultados_publicados ? 'Notas ocultas' : 'Notas publicadas'); examen(m, { id: x.id }); } catch (e) { aviso(e.message, 'error'); }
  });
  m.querySelectorAll('[data-ver]').forEach((bt) => (bt.onclick = async () => {
    const i = ints.find((y) => y.estudiante_id === bt.dataset.ver);
    const abiertas = pregs.filter((q) => q.tipo === 'abierta');
    const r = await ventana({
      titulo: nombre(E.perfiles.get(i.estudiante_id)),
      html: (i.fuera_de_tiempo ? '<p class="aviso-caja">Entregado fuera de tiempo.</p>' : '') + pregs.map((q, n) => {
        const resp = i.respuestas?.[q.id];
        const ops = q.tipo === 'vf' ? ['Verdadero', 'Falso'] : q.opciones;
        return `<div class="fila"><span>${q.tipo === 'abierta' ? '📝' : i.detalle?.[q.id] ? '✅' : '❌'}</span><span><b>${n + 1}. ${esc(q.enunciado)}</b>
          <small>Respuesta: ${esc(q.tipo === 'abierta' ? resp || '—' : resp == null ? '— sin responder —' : ops[resp])}${q.tipo !== 'abierta' && !i.detalle?.[q.id] ? ' · Correcta: ' + esc(ops[claves[q.id]] ?? '?') : ''}</small>
          ${q.tipo === 'abierta' ? `<label class="en-linea">Puntos (máx. ${esc(q.puntos ?? 1)}) <input data-pts="${esc(q.id)}" inputmode="decimal" style="width:70px" value="${esc(i.detalle?.['_' + q.id] ?? '')}"></label>` : ''}</span></div>`;
      }).join('') + `<div class="form"><label>Comentario para el estudiante<textarea name="comentario" rows="2">${esc(i.comentario || '')}</textarea></label></div>`,
      botones: [{ texto: 'Cerrar' }, { texto: 'Guardar calificación', antes: async (caja) => {
        let extra = 0; const det = { ...(i.detalle || {}) };
        for (const q of abiertas) {
          const v = Number(String(caja.querySelector(`[data-pts="${CSS.escape(q.id)}"]`).value || '0').replace(',', '.'));
          if (Number.isNaN(v) || v < 0 || v > Number(q.puntos ?? 1)) throw new Error(`Puntos no válidos en "${q.enunciado.slice(0, 30)}…"`);
          extra += v; det['_' + q.id] = v;
        }
        const cerradas = pregs.filter((q) => q.tipo !== 'abierta' && i.detalle?.[q.id]).reduce((s, q) => s + Number(q.puntos ?? 1), 0);
        const puntaje = cerradas + extra, max = Number(i.puntaje_max) || pregs.reduce((s, q) => s + Number(q.puntos ?? 1), 0);
        const nota = Math.round((Number(E.colegio.nota_min) + (Number(E.colegio.nota_max) - Number(E.colegio.nota_min)) * puntaje / max) * 100) / 100;
        await E.db.update('examen_intentos', { puntaje, nota, detalle: det, pendiente_revision: false, comentario: leerForm(caja).comentario || null }, { examen_id: x.id, estudiante_id: i.estudiante_id });
        return true;
      } }],
    });
    if (r) { aviso('Calificación guardada'); examen(m, { id: x.id }); }
  }));
}
