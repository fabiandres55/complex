// Circulares: el admin las escribe y publica a todo el colegio, una sede, un grado o un curso
// (y opcionalmente solo a ciertos roles). Cada persona marca la lectura.
import { E, base, perfiles } from '../estado.js';
import { esc, aviso, ventana, leerForm, confirmar, nombre, vacio, fechaHora, ROL } from '../ui.js';
import { cabecera, camposHTML } from './comun.js';

function destino(b, c) {
  const partes = [];
  if (c.curso_id) partes.push('Curso ' + (b.cursoPorId.get(c.curso_id)?.nombre || ''));
  else if (c.grado_id) partes.push('Grado ' + (b.gradoPorId.get(c.grado_id)?.nombre || ''));
  else if (c.sede_id) partes.push(b.sedePorId.get(c.sede_id)?.nombre || 'Sede');
  else partes.push('Todo el colegio');
  if (c.roles?.length) partes.push(c.roles.map((r) => ROL[r]).join(', '));
  return partes.join(' · ');
}

export async function lista(m) {
  const b = await base();
  const admin = E.rol === 'admin';
  let circ = await E.db.select('circulares', { eq: { colegio_id: E.colegio.id }, order: 'creado_en desc' });
  if (!admin) circ = await visiblesParaMi(b, circ);
  const leidas = new Set((await E.db.select('circular_lecturas', { eq: { perfil_id: E.yo.id } })).map((l) => l.circular_id));
  m.innerHTML = cabecera('Circulares', { acciones: admin ? '<button class="btn btn-primario" data-nueva>＋ Nueva</button>' : '' }) + (circ.length ? `
    <div class="lista">${circ.map((c) => `
      <a class="fila fila-boton ${!admin && !leidas.has(c.id) ? 'sin-leer' : ''}" href="#/circular/${c.id}">
        <span class="avatar">${c.publicada_en ? '📣' : '📝'}</span>
        <span class="crece"><b>${c.numero ? `<span class="num-circ">N.º ${c.numero}</span> ` : ""}${esc(c.titulo)}</b><small>${c.publicada_en ? fechaHora(c.publicada_en) : 'Borrador'}${admin ? ' · ' + esc(destino(b, c)) : ''}</small></span>
        ${!admin && !leidas.has(c.id) ? '<span class="punto" aria-label="Sin leer"></span>' : ''}
      </a>`).join('')}</div>` : vacio(admin ? 'Aún no has escrito circulares.' : 'No tienes circulares.'));
  m.querySelector('[data-nueva]')?.addEventListener('click', () => editarCircular(b, null));
}

// Circulares publicadas que me llegan (en el demo filtramos aquí como lo haría la RLS)
export async function visiblesParaMi(b, circ) {
  if (E.db.modo === 'demo') E._misCursos = await misCursos(b);
  return circ.filter((c) => c.publicada_en && new Date(c.publicada_en) <= new Date() && llegaA(b, c));
}

async function misCursos(b) {
  if (E.rol === 'profesor') return b.cursos.filter((c) => c.director_id === E.yo.id || b.asignaciones.some((a) => a.curso_id === c.id && a.profesor_id === E.yo.id)).map((c) => c.id);
  let ests = [E.yo.id];
  if (E.rol === 'acudiente') ests = (await E.db.select('acudientes', { eq: { colegio_id: E.colegio.id, acudiente_id: E.yo.id } })).map((a) => a.estudiante_id);
  const mats = await E.db.select('matriculas', { in: { estudiante_id: ests } });
  return mats.filter((x) => x.estado === 'activa').map((x) => x.curso_id);
}

// En el modo demo no hay RLS: filtramos aquí igual que lo hace la base de datos.
function llegaA(b, c) {
  if (E.db.modo !== 'demo') return true;
  if (c.roles?.length && !c.roles.includes(E.rol)) return false;
  if (!c.sede_id && !c.grado_id && !c.curso_id) return true;
  const misCursos = E._misCursos || [];
  return misCursos.some((id) => {
    const cu = b.cursoPorId.get(id);
    return cu && (!c.curso_id || cu.id === c.curso_id) && (!c.grado_id || cu.grado_id === c.grado_id) && (!c.sede_id || cu.sede_id === c.sede_id);
  });
}

export async function detalle(m, p) {
  const b = await base();
  const [c] = await E.db.select('circulares', { eq: { id: p.id } });
  if (!c) { m.innerHTML = vacio('Esa circular no existe.'); return; }
  const admin = E.rol === 'admin';
  await perfiles([c.autor_id]);
  let lecturas = [];
  if (admin) {
    lecturas = await E.db.select('circular_lecturas', { eq: { circular_id: c.id } });
  } else if (c.publicada_en) {
    const ya = await E.db.select('circular_lecturas', { eq: { circular_id: c.id, perfil_id: E.yo.id } });
    if (!ya.length) { try { await E.db.insert('circular_lecturas', [{ colegio_id: E.colegio.id, circular_id: c.id, perfil_id: E.yo.id }]); } catch {} }
  }
  if (admin) await perfiles(lecturas.map((l) => l.perfil_id));
  m.innerHTML = cabecera('Circular', { volver: '#/circulares', acciones: admin ? `<button class="btn" data-editar>Editar</button>${c.publicada_en ? '' : '<button class="btn btn-primario" data-publicar>Publicar</button>'}` : '' }) + `
    <article class="tarjeta circular">
      <h2>${c.numero ? `Circular N.º ${c.numero} · ` : ""}${esc(c.titulo)}</h2>
      <p class="ayuda">${c.publicada_en ? 'Publicada ' + fechaHora(c.publicada_en) : 'Borrador (nadie la ve todavía)'} · ${esc(nombre(E.perfiles.get(c.autor_id)))}${admin ? ' · Para: ' + esc(destino(b, c)) : ''}</p>
      <div class="circular-cuerpo">${esc(c.cuerpo).replace(/\n/g, '<br>')}</div>
    </article>
    ${admin && c.publicada_en ? `<section class="tarjeta"><h2>Leída por ${lecturas.length}</h2>${lecturas.length ? `<div class="lista">${lecturas.map((l) => `<div class="fila"><span class="crece"><b>${esc(nombre(E.perfiles.get(l.perfil_id)))}</b></span><small>${fechaHora(l.leida_en)}</small></div>`).join('')}</div>` : '<p class="ayuda">Nadie la ha leído todavía.</p>'}</section>` : ''}`;
  m.querySelector('[data-editar]')?.addEventListener('click', () => editarCircular(b, c));
  m.querySelector('[data-publicar]')?.addEventListener('click', async () => {
    if (!(await confirmar('¿Publicar la circular?', `La verán: ${destino(b, c)}.`, 'Publicar'))) return;
    try { await E.db.update('circulares', { publicada_en: new Date().toISOString() }, { id: c.id }); aviso('Circular publicada'); detalle(m, p); } catch (e) { aviso(e.message, 'error'); }
  });
}

async function editarCircular(b, c) {
  const alcance = c?.curso_id ? 'curso' : c?.grado_id ? 'grado' : c?.sede_id ? 'sede' : 'todos';
  const html = camposHTML([{ name: 'titulo', label: 'Título' }, { name: 'cuerpo', label: 'Mensaje', tipo: 'textarea', filas: 8 }], c || {}) + `
    <div class="form">
      <label>Para<select name="alcance">
        ${[['todos', 'Todo el colegio'], ['sede', 'Una sede'], ['grado', 'Un grado'], ['curso', 'Un curso']].map(([v, t]) => `<option value="${v}" ${v === alcance ? 'selected' : ''}>${t}</option>`).join('')}
      </select></label>
      <label data-solo="sede">Sede<select name="sede_id">${b.sedes.map((s) => `<option value="${s.id}" ${s.id === c?.sede_id ? 'selected' : ''}>${esc(s.nombre)}</option>`).join('')}</select></label>
      <label data-solo="grado">Grado<select name="grado_id">${b.grados.map((g) => `<option value="${g.id}" ${g.id === c?.grado_id ? 'selected' : ''}>${esc(g.nombre)}</option>`).join('')}</select></label>
      <label data-solo="curso">Curso<select name="curso_id">${b.cursos.map((x) => `<option value="${x.id}" ${x.id === c?.curso_id ? 'selected' : ''}>${esc(x.nombre)}</option>`).join('')}</select></label>
      <fieldset><legend>Solo para (si no marcas ninguno, les llega a todos)</legend>
        ${Object.entries(ROL).map(([r, t]) => `<label class="check"><input type="checkbox" name="roles" data-multi="1" value="${r}" ${c?.roles?.includes(r) ? 'checked' : ''}> ${t}</label>`).join('')}
      </fieldset>
    </div>`;
  const leer = (caja) => {
    const d = leerForm(caja);
    if (!d.titulo || !d.cuerpo) throw new Error('Escribe el título y el mensaje.');
    return {
      titulo: d.titulo, cuerpo: d.cuerpo,
      sede_id: d.alcance === 'sede' ? d.sede_id || null : null,
      grado_id: d.alcance === 'grado' ? d.grado_id || null : null,
      curso_id: d.alcance === 'curso' ? d.curso_id || null : null,
      roles: d.roles?.length ? d.roles : null,
    };
  };
  const guardar = async (caja, publicar) => {
    const d = leer(caja);
    if (publicar) d.publicada_en = new Date().toISOString();
    if (c) await E.db.update('circulares', d, { id: c.id });
    else [c] = await E.db.insert('circulares', [{ colegio_id: E.colegio.id, autor_id: E.yo.id, ...d }]);
    return c.id;
  };
  const r = await ventana({
    titulo: c ? 'Editar circular' : 'Nueva circular',
    html,
    alAbrir: (caja) => {
      const sel = caja.querySelector('[name=alcance]');
      const ver = () => caja.querySelectorAll('[data-solo]').forEach((el) => (el.hidden = el.dataset.solo !== sel.value));
      sel.onchange = ver; ver();
    },
    botones: [
      ...(c ? [{ texto: 'Eliminar', clase: 'btn-peligro', antes: async () => {
        if (!(await confirmar('¿Eliminar la circular?', 'No se puede deshacer.', 'Eliminar'))) return false;
        await E.db.remove('circulares', { id: c.id }); return 'borrada';
      } }] : []),
      ...(!c?.publicada_en ? [{ texto: 'Guardar borrador', antes: (caja) => guardar(caja, false) }] : []),
      ...(!c?.publicada_en ? [{ texto: 'Publicar', antes: (caja) => guardar(caja, true) }] : [{ texto: 'Guardar', antes: (caja) => guardar(caja, false) }]),
    ],
  });
  if (r === 'borrada') { aviso('Circular eliminada'); location.hash = '#/circulares'; }
  else if (r) { aviso('Circular guardada'); location.hash = '#/circular/' + r; if (location.hash === '#/circular/' + r) window.dispatchEvent(new HashChangeEvent('hashchange')); }
}
