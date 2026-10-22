// Comunidad > Calendario (REA Phidias §3.2): vistas Mes y Agenda, capas de color
// (eventos del colegio por tipo y tareas por estudiante), navegación ‹ Hoy ›, exportar .ics.
import { E, base, misEstudiantes, perfiles, misAsignaciones, pref } from '../estado.js';
import { esc, aviso, ventana, leerForm, confirmar, nombre, vacio, fecha, fechaHora } from '../ui.js';
import { cabecera, camposHTML } from './comun.js';

const TIPOS = {
  institucional: ['Institucional', '#1f4fd1'], reunion: ['Reunión', '#7a4fa3'], festivo: ['Festivo / sin clases', '#c62828'],
  evaluacion: ['Evaluaciones', '#b26a00'], cultural: ['Cultural', '#2f8f6a'], deportivo: ['Deportivo', '#2f7f8f'],
};
const COLOR_TAREAS = ['#e0752d', '#8a5cf6', '#14a37f', '#d6457a'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
const clave = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

async function cargarItems(b) {
  const eventos = await E.db.select('eventos', { eq: { colegio_id: E.colegio.id } });
  const items = eventos.map((e) => ({ tipo: 'evento', capa: 'ev_' + e.tipo, color: TIPOS[e.tipo]?.[1] || '#1f4fd1', titulo: e.titulo, cuando: e.inicio, todo: e.todo_el_dia, dato: e,
    sub: e.curso_id ? 'Curso ' + (b.cursoPorId.get(e.curso_id)?.nombre || '') : '' }));
  const capas = Object.entries(TIPOS).map(([k, [t, c]]) => ({ id: 'ev_' + k, nombre: t, color: c }));
  // tareas: por cada estudiante visible (familia) o por mis clases (profesor)
  let grupos = [];
  if (E.rol === 'profesor') grupos = [{ id: 'yo', nombre: 'Mis tareas', asigs: misAsignaciones(b).map((a) => a.id) }];
  else if (E.rol !== 'admin') {
    const ests = await misEstudiantes();
    await perfiles(ests);
    const mats = ests.length ? (await E.db.select('matriculas', { in: { estudiante_id: ests } })).filter((x) => x.estado === 'activa') : [];
    grupos = ests.map((id) => {
      const cursos = new Set(mats.filter((x) => x.estudiante_id === id).map((x) => x.curso_id));
      return { id, nombre: 'Tareas de ' + (E.perfiles.get(id)?.nombres || ''), asigs: b.asignaciones.filter((a) => cursos.has(a.curso_id)).map((a) => a.id) };
    });
  }
  const todas = [...new Set(grupos.flatMap((g) => g.asigs))];
  const tareas = todas.length ? await E.db.select('tareas', { in: { asignacion_id: todas } }) : [];
  // Exámenes (capa propia por persona, como Phidias: "examenes (NOMBRE)")
  const examenes = todas.length ? (await E.db.select('examenes', { in: { asignacion_id: todas } }).catch(() => [])).filter((x) => (E.rol === 'profesor' || (x.publicado && new Date(x.abre) <= new Date())) && (x.cierra || x.abre)) : [];
  grupos.forEach((g, i) => {
    const c = COLOR_TAREAS[i % COLOR_TAREAS.length];
    capas.push({ id: 'ta_' + g.id, nombre: g.nombre, color: c });
    for (const t of tareas.filter((x) => g.asigs.includes(x.asignacion_id) && x.entrega_en)) {
      const a = b.asignacionPorId.get(t.asignacion_id);
      items.push({ tipo: 'tarea', capa: 'ta_' + g.id, color: c, titulo: '📝 ' + t.titulo, cuando: t.entrega_en, todo: false, dato: t,
        sub: (b.materiaPorId.get(a?.materia_id)?.nombre || '') + (E.rol === 'profesor' ? ' · ' + (b.cursoPorId.get(a?.curso_id)?.nombre || '') : '') });
    }
    const exG = examenes.filter((x) => g.asigs.includes(x.asignacion_id));
    if (exG.length) {
      const cE = COLOR_TAREAS[(i + 3) % COLOR_TAREAS.length];
      capas.push({ id: 'ex_' + g.id, nombre: g.nombre.replace(/^Tareas/, 'Exámenes').replace(/^Mis tareas/, 'Mis exámenes'), color: cE });
      for (const x of exG) {
        const a = b.asignacionPorId.get(x.asignacion_id);
        items.push({ tipo: 'examen', capa: 'ex_' + g.id, color: cE, titulo: '🧪 ' + x.titulo, cuando: x.cierra || x.abre, todo: false, dato: x,
          sub: (b.materiaPorId.get(a?.materia_id)?.nombre || '') + (x.cierra ? ' · fecha límite' : ' · disponible') });
      }
    }
  });
  // Mensajes "marcados en el calendario" (REA Phidias): los que recibí y los que envié
  const recibidos = (await E.db.select('mensaje_destinatarios', { eq: { perfil_id: E.yo.id } }).catch(() => [])).filter((d) => !d.eliminado).map((d) => d.mensaje_id);
  const [deOtros, mios] = await Promise.all([
    recibidos.length ? E.db.select('mensajes', { in: { id: recibidos } }).catch(() => []) : [],
    E.db.select('mensajes', { eq: { autor_id: E.yo.id } }).catch(() => []),
  ]);
  const ahoraIso = new Date().toISOString();
  const conEvento = [...new Map([...deOtros, ...mios].filter((x) => x.evento_inicio && (!x.expira_en || x.expira_en > ahoraIso || x.autor_id === E.yo.id)).map((x) => [x.id, x])).values()];
  if (conEvento.length) {
    // como Phidias: cada tipo de mensaje es una capa con su color
    const tiposMsg = await E.db.select('tipos_mensaje', { eq: { colegio_id: E.colegio.id }, order: 'orden' }).catch(() => []);
    for (const x of conEvento) {
      const tm = tiposMsg.find((t) => t.id === x.tipo_id);
      const capa = tm ? 'msg-' + tm.id : 'msg', color = tm?.color || '#7a3fd1';
      if (!capas.some((k) => k.id === capa)) capas.push({ id: capa, nombre: tm?.nombre || 'Mensajes', color });
      items.push({ tipo: 'mensaje', capa, color, titulo: '✉️ ' + x.asunto, cuando: x.evento_inicio, todo: x.evento_todo_el_dia !== false, dato: x, sub: tm?.nombre || 'Mensaje' });
    }
  }
  return { items, capas };
}

export async function calendario(m, p) {
  const b = await base();
  const vista = p.vista === 'agenda' ? 'agenda' : 'mes';
  const ref = p.fecha ? new Date(p.fecha + 'T12:00:00') : new Date();
  const { items, capas } = await cargarItems(b);
  const ocultas = new Set(pref('cal_ocultas') || []);
  const visibles = items.filter((x) => !ocultas.has(x.capa));
  const porDia = new Map();
  for (const x of visibles) { const k = clave(new Date(x.cuando)); if (!porDia.has(k)) porDia.set(k, []); porDia.get(k).push(x); }
  const mover = (meses) => { const d = new Date(ref); d.setDate(1); d.setMonth(d.getMonth() + meses); return clave(d); };
  const ruta = (f, v = vista) => `#/calendario?vista=${v}&fecha=${f}`;

  let cuerpo = '';
  if (vista === 'mes') {
    const ini = new Date(ref.getFullYear(), ref.getMonth(), 1);
    const desde = new Date(ini); desde.setDate(1 - ((ini.getDay() + 6) % 7)); // lunes
    const celdas = [];
    for (let i = 0; i < 42; i++) { const d = new Date(desde); d.setDate(desde.getDate() + i); celdas.push(d); }
    const hoyK = clave(new Date());
    cuerpo = `<div class="mes">${DIAS.map((d) => `<div class="mes-dia-nombre">${d}</div>`).join('')}${celdas.map((d) => {
      const k = clave(d), lista = porDia.get(k) || [];
      return `<button class="mes-celda ${d.getMonth() !== ref.getMonth() ? 'fuera' : ''} ${k === hoyK ? 'hoy' : ''} ${d.getDay() === 0 || d.getDay() === 6 ? 'finde' : ''}" data-dia="${k}" aria-label="${d.getDate()} de ${MESES[d.getMonth()]}${lista.length ? ', ' + lista.length + ' evento(s)' : ''}">
        <span class="mes-num">${d.getDate()}</span>
        ${lista.slice(0, 3).map((x) => `<span class="mes-ev" style="background:${x.color}">${esc(x.titulo)}</span>`).join('')}
        ${lista.length > 3 ? `<span class="mes-mas">+${lista.length - 3}</span>` : ''}
        ${lista.length ? `<span class="mes-puntos">${lista.slice(0, 4).map((x) => `<i style="background:${x.color}"></i>`).join('')}</span>` : ''}
      </button>`;
    }).join('')}</div>`;
  } else {
    const desde = new Date(ref); desde.setHours(0, 0, 0, 0);
    const prox = visibles.filter((x) => new Date(x.cuando) >= desde).sort((x, y) => (x.cuando > y.cuando ? 1 : -1)).slice(0, 60);
    const dias = new Map();
    for (const x of prox) { const k = clave(new Date(x.cuando)); if (!dias.has(k)) dias.set(k, []); dias.get(k).push(x); }
    cuerpo = dias.size ? [...dias.entries()].map(([k, l]) => `
      <h3 class="sub">${fecha(k)}</h3>
      <div class="lista">${l.map((x) => itemHTML(x)).join('')}</div>`).join('') : vacio('No hay eventos próximos.');
  }

  m.innerHTML = cabecera('Calendario', { acciones: `${E.rol === 'admin' ? '<button class="btn btn-primario" data-nuevo>＋ Evento</button>' : ''}<button class="btn" data-exportar>⬇ Exportar</button>` }) + `
    <div class="cal-barra">
      <div class="cal-nav">
        <a class="btn btn-chico" href="${ruta(vista === 'mes' ? mover(-1) : clave(new Date(ref.getTime() - 30 * 864e5)))}" aria-label="Anterior">‹</a>
        <a class="btn btn-chico" href="${ruta(clave(new Date()))}">Hoy</a>
        <a class="btn btn-chico" href="${ruta(vista === 'mes' ? mover(1) : clave(new Date(ref.getTime() + 30 * 864e5)))}" aria-label="Siguiente">›</a>
        <h2 class="${vista === "mes" ? "mes-titulo" : ""}">${vista === "mes" ? `${MESES[ref.getMonth()]} ${ref.getFullYear()}` : "Desde " + fecha(clave(ref))}</h2>
      </div>
      <div class="segmentos"><a href="${ruta(clave(ref), 'mes')}" class="${vista === 'mes' ? 'activo' : ''}">Mes</a><a href="${ruta(clave(ref), 'agenda')}" class="${vista === 'agenda' ? 'activo' : ''}">Agenda</a></div>
    </div>
    <div class="cal-cuerpo">
      <div class="cal-principal">${cuerpo}</div>
      <aside class="cal-capas"><h3 class="sub">Capas</h3>${capas.map((c) => `<label class="check"><input type="checkbox" data-capa="${c.id}" ${ocultas.has(c.id) ? '' : 'checked'}><i class="capa-color" style="background:${c.color}"></i> ${esc(c.nombre)}</label>`).join('')}</aside>
    </div>`;

  m.querySelectorAll('[data-capa]').forEach((c) => (c.onchange = () => {
    const s = new Set(pref('cal_ocultas') || []);
    c.checked ? s.delete(c.dataset.capa) : s.add(c.dataset.capa);
    pref('cal_ocultas', [...s]);
    calendario(m, p);
  }));
  m.querySelectorAll('[data-dia]').forEach((c) => (c.onclick = () => {
    const lista = porDia.get(c.dataset.dia) || [];
    if (!lista.length && E.rol !== 'admin') return;
    ventana({
      titulo: fecha(c.dataset.dia),
      html: lista.length ? `<div class="lista">${lista.map((x) => itemHTML(x)).join('')}</div>` : vacio('Sin eventos este día.'),
      botones: E.rol === 'admin' ? [{ texto: '＋ Evento este día', valor: 'nuevo' }] : [],
      alAbrir: (caja, cerrar) => conectarItems(caja, lista, () => { cerrar(null); calendario(m, p); }),
    }).then((v) => v === 'nuevo' && editarEvento(b, null, c.dataset.dia).then((r) => r && calendario(m, p)));
  }));
  conectarItems(m, visibles, () => calendario(m, p));
  m.querySelector('[data-nuevo]')?.addEventListener('click', async () => { if (await editarEvento(b, null, clave(ref))) calendario(m, p); });
  m.querySelector('[data-exportar]').onclick = () => exportarICS(visibles);
}

const itemHTML = (x) => `
  <button class="fila fila-boton" data-item="${x.dato.id}">
    <i class="capa-color" style="background:${x.color}"></i>
    <span><b>${esc(x.titulo)}</b><small>${x.todo ? 'Todo el día' : new Date(x.cuando).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' })}${x.sub ? ' · ' + esc(x.sub) : ''}</small></span>
    <span class="flecha">›</span>
  </button>`;

function conectarItems(raiz, lista, recargar) {
  raiz.querySelectorAll('[data-item]').forEach((el) => (el.onclick = async (e) => {
    e.stopPropagation();
    const x = lista.find((i) => i.dato.id === el.dataset.item);
    if (!x) return;
    if (x.tipo === 'tarea') { location.hash = '#/tarea/' + x.dato.id; document.querySelector('.ventana')?.remove(); return; }
    if (x.tipo === 'examen') { location.hash = '#/examen/' + x.dato.id; document.querySelector('.ventana')?.remove(); return; }
    if (x.tipo === 'mensaje') { location.hash = '#/mensaje/' + x.dato.id; document.querySelector('.ventana')?.remove(); return; }
    const ev = x.dato;
    const r = await ventana({
      titulo: ev.titulo,
      html: `<p><span class="chip" style="background:${x.color};color:#fff">${esc(TIPOS[ev.tipo]?.[0] || ev.tipo)}</span></p>
        <p><b>${ev.todo_el_dia ? fecha(ev.inicio) + ' · todo el día' : fechaHora(ev.inicio)}</b>${ev.fin ? ' → ' + (ev.todo_el_dia ? fecha(ev.fin) : fechaHora(ev.fin)) : ''}</p>
        ${x.sub ? `<p class="ayuda">${esc(x.sub)}</p>` : ''}
        ${ev.descripcion ? `<p class="texto-largo">${esc(ev.descripcion)}</p>` : ''}`,
      botones: E.rol === 'admin' ? [{ texto: 'Editar', valor: 'editar' }] : [],
    });
    if (r === 'editar' && (await editarEvento(await base(), ev))) recargar();
  }));
}

async function editarEvento(b, ev, dia) {
  const local = (iso) => { if (!iso) return ''; const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
  const r = await ventana({
    titulo: ev ? 'Editar evento' : 'Nuevo evento',
    html: camposHTML([
      { name: 'titulo', label: 'Título' },
      { name: 'tipo', label: 'Tipo', tipo: 'select', opciones: Object.entries(TIPOS).map(([k, [t]]) => [k, t]) },
      { name: 'todo_el_dia', label: 'Todo el día', tipo: 'checkbox', def: true },
      { name: 'inicio', label: 'Inicio', tipo: 'datetime-local', def: local(ev?.inicio || (dia ? dia + 'T08:00' : null)) || (dia ? dia + 'T08:00' : '') },
      { name: 'fin', label: 'Fin (opcional)', tipo: 'datetime-local', def: local(ev?.fin) },
      { name: 'curso_id', label: 'Para', tipo: 'select', vacio: 'Todo el colegio', opciones: b.cursos.map((c) => [c.id, 'Curso ' + c.nombre]) },
      { name: 'descripcion', label: 'Descripción', tipo: 'textarea', filas: 4 },
    ], ev ? { ...ev, inicio: local(ev.inicio), fin: local(ev.fin) } : {}),
    botones: [
      ...(ev ? [{ texto: 'Eliminar', clase: 'btn-peligro', antes: async () => { if (!(await confirmar('¿Eliminar el evento?', 'No se puede deshacer.', 'Eliminar'))) return false; await E.db.remove('eventos', { id: ev.id }); return true; } }] : []),
      { texto: 'Cancelar' },
      { texto: 'Guardar', antes: async (c) => {
        const d = leerForm(c);
        if (!d.titulo || !d.inicio) throw new Error('Escribe el título y la fecha de inicio.');
        const datos = { titulo: d.titulo, tipo: d.tipo, todo_el_dia: !!d.todo_el_dia, inicio: new Date(d.inicio).toISOString(), fin: d.fin ? new Date(d.fin).toISOString() : null, curso_id: d.curso_id || null, descripcion: d.descripcion || null };
        if (ev) await E.db.update('eventos', datos, { id: ev.id });
        else await E.db.insert('eventos', [{ colegio_id: E.colegio.id, creado_por: E.yo.id, ...datos }]);
        return true;
      } },
    ],
  });
  if (r) aviso('Calendario actualizado');
  return r;
}

// Exporta a un archivo .ics (Google Calendar, Outlook, iPhone)
function exportarICS(items) {
  const f = (iso, todo) => { const d = new Date(iso); return todo ? clave(d).replace(/-/g, '') : d.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, ''); };
  const limpiar = (s) => String(s || '').replace(/[\\,;]/g, (c) => '\\' + c).replace(/\n/g, '\\n');
  const lineas = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Complex_//Calendario//ES', `X-WR-CALNAME:${limpiar(E.colegio.nombre)}`];
  for (const x of items) {
    lineas.push('BEGIN:VEVENT', `UID:${x.dato.id}@complex`, `DTSTAMP:${f(new Date().toISOString())}`,
      x.todo ? `DTSTART;VALUE=DATE:${f(x.cuando, true)}` : `DTSTART:${f(x.cuando)}`,
      `SUMMARY:${limpiar(x.titulo)}`, x.sub ? `DESCRIPTION:${limpiar(x.sub)}` : 'DESCRIPTION:', 'END:VEVENT');
  }
  lineas.push('END:VCALENDAR');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([lineas.join('\r\n')], { type: 'text/calendar' }));
  a.download = 'calendario-complex.ics';
  document.body.appendChild(a); a.click(); a.remove();
  aviso('Calendario exportado');
}
