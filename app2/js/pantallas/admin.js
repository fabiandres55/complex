// Pantallas del administrador del colegio.
import { E, base, recargarBase, perfiles, pref, logoHTML, aplicarMarca } from '../estado.js';
import { esc, aviso, ventana, leerForm, confirmar, ROL, nombre, nombreLista, iniciales, vacio, fecha } from '../ui.js';
import { editar, cabecera, pestanas, buscar, conectarBuscador, camposHTML } from './comun.js';
import { pendientesAdmin } from './tablero.js';
import { agregarPersona, importar, restablecer } from './usuarios.js';

const personasColegio = () => E.db.rpc('personas_colegio', { p_colegio: E.colegio.id });

// ---------------------------------------------------------------- Inicio
export async function inicio(m) {
  const b = await base();
  const gente = await personasColegio();
  const cuenta = (r) => new Set(gente.filter((g) => g.rol === r && g.activo).map((g) => g.perfil_id)).size;
  const circ = await E.db.select('circulares', { eq: { colegio_id: E.colegio.id }, order: 'creado_en desc', limit: 3 });
  const pasos = [
    ['Sedes', b.sedes.length, '#/estructura?tab=sedes'],
    ['Año lectivo y periodos', b.anio && b.periodos.length, '#/estructura?tab=anio'],
    ['Grados', b.grados.length, '#/estructura?tab=grados'],
    ['Materias', b.materias.length, '#/estructura?tab=materias'],
    ['Cursos', b.cursos.length, '#/estructura?tab=cursos'],
    ['Profesores', cuenta('profesor'), '#/personas?tab=profesor'],
    ['Estudiantes', cuenta('estudiante'), '#/personas?tab=estudiante'],
    ['Profesores asignados a materias', b.asignaciones.some((a) => a.profesor_id), '#/estructura?tab=cursos'],
  ];
  const faltan = pasos.filter((p) => !p[1]);
  m.innerHTML = `
    <h1 class="titulo">Hola, ${esc(E.yo.nombres || 'administrador')}</h1>
    ${await pendientesAdmin()}
    <div class="cifras">
      <a href="#/personas?tab=estudiante" class="cifra"><b>${cuenta('estudiante')}</b><span>Estudiantes</span></a>
      <a href="#/personas?tab=profesor" class="cifra"><b>${cuenta('profesor')}</b><span>Profesores</span></a>
      <a href="#/estructura?tab=cursos" class="cifra"><b>${b.cursos.length}</b><span>Cursos</span></a>
      <a href="#/personas?tab=acudiente" class="cifra"><b>${cuenta('acudiente')}</b><span>Acudientes</span></a>
    </div>
    ${faltan.length ? `
      <section class="tarjeta">
        <h2>Para dejar listo tu colegio</h2>
        <div class="lista">${pasos.map(([t, ok, h]) => `<a class="fila fila-boton" href="${h}"><span class="paso ${ok ? 'hecho' : ''}">${ok ? '✓' : ''}</span><span><b>${t}</b></span><span class="flecha">›</span></a>`).join('')}</div>
      </section>` : ''}
    <section class="tarjeta">
      <div class="tarjeta-cab"><h2>Circulares recientes</h2><a class="btn btn-chico" href="#/circulares">Ver todas</a></div>
      ${circ.length ? `<div class="lista">${circ.map((c) => `<a class="fila fila-boton" href="#/circular/${c.id}"><span>📣</span><span><b>${esc(c.titulo)}</b><small>${c.publicada_en ? 'Publicada ' + fecha(c.publicada_en) : 'Borrador'}</small></span></a>`).join('')}</div>` : vacio('Aún no hay circulares.')}
    </section>
    <section class="tarjeta">
      <h2>Cursos ${b.anio ? b.anio.anio : ''}</h2>
      ${b.cursos.length ? `<div class="rejilla">${b.cursos.map((c) => `<a class="mini" href="#/curso/${c.id}"><b>${esc(c.nombre)}</b><small>${esc(b.gradoPorId.get(c.grado_id)?.nombre || '')}</small></a>`).join('')}</div>` : vacio('Todavía no hay cursos.')}
    </section>`;
}

// ---------------------------------------------------------------- Estructura
const TABS = [['sedes', 'Sedes'], ['anio', 'Año y periodos'], ['grados', 'Grados'], ['materias', 'Materias'], ['cursos', 'Cursos']];

export async function estructura(m, p) {
  const tab = TABS.some((t) => t[0] === p.tab) ? p.tab : (pref('tab_estructura') || 'cursos');
  pref('tab_estructura', tab);
  const b = await base();
  let html = '', acciones = '';
  if (tab === 'sedes') {
    acciones = '<button class="btn btn-primario" data-nuevo>＋ Sede</button>';
    html = b.sedes.length ? `<div class="lista">${b.sedes.map((s) => `<button class="fila fila-boton" data-edit="${s.id}"><span>🏢</span><span><b>${esc(s.nombre)}</b><small>${esc(s.direccion || '')}</small></span></button>`).join('')}</div>` : vacio('Agrega al menos una sede (por ejemplo "Sede Principal").');
  }
  if (tab === 'anio') {
    acciones = '<button class="btn" data-nuevo>＋ Año lectivo</button>';
    html = `
      ${b.anios.length ? `<div class="lista">${b.anios.map((a) => `<button class="fila fila-boton" data-edit="${a.id}"><span>📅</span><span><b>${a.anio}</b><small>${a.fecha_inicio ? fecha(a.fecha_inicio) + ' – ' + fecha(a.fecha_fin) : 'Sin fechas'}</small></span>${a.activo ? '<span class="chip ok">Activo</span>' : ''}</button>`).join('')}</div>` : vacio('Crea el año lectivo (por ejemplo 2026).')}
      ${b.anio ? `
        <div class="tarjeta-cab"><h2>Periodos de ${b.anio.anio}</h2><div>${b.periodos.length ? '' : '<button class="btn btn-chico" data-tres>Crear 3 periodos</button> <button class="btn btn-chico" data-cuatro>Crear 4</button>'} <button class="btn btn-chico" data-nuevo-periodo>＋ Periodo</button></div></div>
        ${b.periodos.length ? `<div class="lista">${b.periodos.map((x) => `<button class="fila fila-boton" data-periodo="${x.id}"><span>${x.cerrado ? '🔒' : '🟢'}</span><span><b>${esc(x.nombre)}</b><small>Peso ${Number(x.peso)}%${x.fecha_inicio ? ' · ' + fecha(x.fecha_inicio) + ' – ' + fecha(x.fecha_fin) : ''}</small></span><span class="chip ${x.cerrado ? '' : 'ok'}">${x.cerrado ? 'Cerrado' : 'Abierto'}</span></button>`).join('')}</div>
          <p class="ayuda">Cuando cierras un periodo, los profesores ya no pueden cambiar las notas (solo el administrador).</p>` : ''}` : ''}`;
  }
  if (tab === 'grados') {
    acciones = '<button class="btn btn-primario" data-nuevo>＋ Grado</button>';
    html = b.grados.length ? `<div class="lista">${b.grados.map((g) => `<button class="fila fila-boton" data-edit="${g.id}"><span class="num">${g.orden}</span><span><b>${esc(g.nombre)}</b></span></button>`).join('')}</div>`
      : vacio('Aún no hay grados.', '<button class="btn" data-grados-col>Agregar de Transición a Once</button>');
  }
  if (tab === 'materias') {
    acciones = '<button class="btn btn-primario" data-nuevo>＋ Materia</button>';
    html = b.materias.length ? `<div class="lista">${b.materias.map((x) => `<button class="fila fila-boton" data-edit="${x.id}"><span>📘</span><span><b>${esc(x.nombre)}</b><small>${esc(x.area || '')}</small></span></button>`).join('')}</div>`
      : vacio('Aún no hay materias.', '<button class="btn" data-materias-col>Agregar las materias más comunes</button>');
  }
  if (tab === 'cursos') {
    acciones = '<button class="btn btn-primario" data-nuevo>＋ Curso</button>';
    const porGrado = b.grados.map((g) => [g, b.cursos.filter((c) => c.grado_id === g.id)]).filter(([, l]) => l.length);
    html = !b.anio || !b.sedes.length || !b.grados.length
      ? vacio('Antes de crear cursos necesitas: una sede, el año lectivo y los grados.', `<a class="btn" href="#/estructura?tab=${!b.sedes.length ? 'sedes' : !b.anio ? 'anio' : 'grados'}">Ir</a>`)
      : porGrado.length ? porGrado.map(([g, l]) => `<h3 class="sub">${esc(g.nombre)}</h3><div class="rejilla">${l.map((c) => `<a class="mini" href="#/curso/${c.id}"><b>${esc(c.nombre)}</b><small>${esc(b.sedePorId.get(c.sede_id)?.nombre || '')}</small></a>`).join('')}</div>`).join('')
      : vacio(`Aún no hay cursos en ${b.anio.anio}.`);
  }
  m.innerHTML = cabecera('Colegio', { acciones }) + pestanas(TABS, tab, '#/estructura?tab=') + `<div class="contenido">${html}</div>`;

  const recargar = async () => { await recargarBase(); estructura(m, { tab }); };
  const def = {
    sedes: { tabla: 'sedes', titulo: 'Sede', lista: b.sedes, campos: [{ name: 'nombre', label: 'Nombre', req: true }, { name: 'direccion', label: 'Dirección', opcional: true }] },
    anio: { tabla: 'anios_lectivos', titulo: 'Año lectivo', lista: b.anios, campos: [{ name: 'anio', label: 'Año', tipo: 'number', req: true, def: new Date().getFullYear() }, { name: 'fecha_inicio', label: 'Inicia', tipo: 'date' }, { name: 'fecha_fin', label: 'Termina', tipo: 'date' }, { name: 'activo', label: 'Es el año actual', tipo: 'checkbox', def: !b.anios.length }, { name: 'remedial_desde', label: 'Registro de remediales (fin de año): desde', tipo: 'date' }, { name: 'remedial_hasta', label: 'Registro de remediales: hasta', tipo: 'date' }] },
    grados: { tabla: 'grados', titulo: 'Grado', lista: b.grados, campos: [{ name: 'nombre', label: 'Nombre', req: true }, { name: 'orden', label: 'Orden (0 = Transición, 11 = Once)', tipo: 'number', req: true, def: (b.grados.at(-1)?.orden ?? -1) + 1 }] },
    materias: { tabla: 'materias', titulo: 'Materia', lista: b.materias, campos: [{ name: 'nombre', label: 'Nombre', req: true }, { name: 'area', label: 'Área', opcional: true }] },
  }[tab];

  m.querySelector('[data-nuevo]')?.addEventListener('click', async () => {
    if (tab === 'cursos') return nuevoCurso(b, recargar);
    const r = await editar({ titulo: 'Nuevo: ' + def.titulo, tabla: def.tabla, campos: def.campos });
    if (r) { if (tab === 'anio' && r.activo) await soloUnAnioActivo(r.id); recargar(); }
  });
  m.querySelectorAll('[data-edit]').forEach((el) => el.addEventListener('click', async () => {
    const fila = def.lista.find((x) => x.id === el.dataset.edit);
    const r = await editar({ titulo: def.titulo, tabla: def.tabla, campos: def.campos, fila });
    if (r) { if (tab === 'anio' && r.activo) await soloUnAnioActivo(r.id); recargar(); }
  }));

  const camposPeriodo = [{ name: 'numero', label: 'Número', tipo: 'number', req: true }, { name: 'nombre', label: 'Nombre', req: true }, { name: 'fecha_inicio', label: 'Inicia', tipo: 'date' }, { name: 'fecha_fin', label: 'Termina', tipo: 'date' }, { name: 'peso', label: 'Peso en la nota final (%)', tipo: 'number', req: true }, { name: 'cerrado', label: 'Periodo cerrado (los profesores ya no editan notas)', tipo: 'checkbox' },
    // Fechas importantes (como Phidias): fuera de estas fechas el profesor no puede registrar; vacío = sin límite
    { name: 'notas_desde', label: 'Registro de notas: desde', tipo: 'date' }, { name: 'notas_hasta', label: 'Registro de notas: hasta', tipo: 'date' },
    { name: 'obs_desde', label: 'Registro de observaciones: desde', tipo: 'date' }, { name: 'obs_hasta', label: 'Registro de observaciones: hasta', tipo: 'date' },
    { name: 'plan_desde', label: 'Modificación de planeaciones: desde', tipo: 'date' }, { name: 'plan_hasta', label: 'Modificación de planeaciones: hasta', tipo: 'date' },
    { name: 'recup_desde', label: 'Registro de recuperaciones: desde', tipo: 'date' }, { name: 'recup_hasta', label: 'Registro de recuperaciones: hasta', tipo: 'date' }];
  m.querySelector('[data-nuevo-periodo]')?.addEventListener('click', async () => {
    const k = b.periodos.length + 1;
    if (await editar({ titulo: 'Nuevo periodo', tabla: 'periodos', campos: camposPeriodo, fila: { numero: k, nombre: `Periodo ${k}`, peso: 25 }, extra: { anio_lectivo_id: b.anio.id } })) recargar();
  });
  m.querySelectorAll('[data-periodo]').forEach((el) => el.addEventListener('click', async () => {
    if (await editar({ titulo: 'Periodo', tabla: 'periodos', campos: camposPeriodo, fila: b.periodos.find((x) => x.id === el.dataset.periodo) })) recargar();
  }));
  for (const [sel, k] of [['[data-tres]', 3], ['[data-cuatro]', 4]]) m.querySelector(sel)?.addEventListener('click', async () => {
    try {
      await E.db.insert('periodos', Array.from({ length: k }, (_, i) => ({ colegio_id: E.colegio.id, anio_lectivo_id: b.anio.id, numero: i + 1, nombre: `Periodo ${i + 1}`, peso: Math.round(10000 / k) / 100 })));
      aviso(`${k} periodos creados`); recargar();
    } catch (e) { aviso(e.message, 'error'); }
  });
  m.querySelector('[data-grados-col]')?.addEventListener('click', async () => {
    const g = ['Transición', 'Primero', 'Segundo', 'Tercero', 'Cuarto', 'Quinto', 'Sexto', 'Séptimo', 'Octavo', 'Noveno', 'Décimo', 'Once'];
    try { await E.db.insert('grados', g.map((nombre, orden) => ({ colegio_id: E.colegio.id, nombre, orden }))); aviso('Grados agregados'); recargar(); } catch (e) { aviso(e.message, 'error'); }
  });
  m.querySelector('[data-materias-col]')?.addEventListener('click', async () => {
    const l = [['Matemáticas', 'Matemáticas'], ['Lengua Castellana', 'Humanidades'], ['Inglés', 'Humanidades'], ['Ciencias Naturales', 'Ciencias Naturales'], ['Ciencias Sociales', 'Ciencias Sociales'], ['Educación Artística', 'Artística'], ['Educación Física', 'Educación Física'], ['Ética y Valores', 'Ética'], ['Religión', 'Religión'], ['Tecnología e Informática', 'Tecnología']];
    try { await E.db.insert('materias', l.map(([nombre, area]) => ({ colegio_id: E.colegio.id, nombre, area }))); aviso('Materias agregadas'); recargar(); } catch (e) { aviso(e.message, 'error'); }
  });
}

async function soloUnAnioActivo(id) {
  const b = E.base;
  for (const a of b.anios) if (a.id !== id && a.activo) await E.db.update('anios_lectivos', { activo: false }, { id: a.id });
}

async function opcionesProfes() {
  const gente = await personasColegio();
  const vistos = new Set();
  return gente.filter((g) => g.rol === 'profesor' && g.activo && !vistos.has(g.perfil_id) && vistos.add(g.perfil_id)).map((g) => [g.perfil_id, nombreLista(g)]);
}

async function nuevoCurso(b, recargar) {
  const profes = await opcionesProfes();
  const r = await editar({
    titulo: 'Nuevo curso', tabla: 'cursos',
    campos: [
      { name: 'grado_id', label: 'Grado', tipo: 'select', opciones: b.grados.map((g) => [g.id, g.nombre]), req: true },
      { name: 'nombre', label: 'Nombre del curso (ej. 6A)', req: true },
      { name: 'sede_id', label: 'Sede', tipo: 'select', opciones: b.sedes.map((s) => [s.id, s.nombre]), req: true },
      { name: 'director_id', label: 'Director de curso', tipo: 'select', vacio: 'Sin director', opciones: profes },
    ],
    extra: { anio_lectivo_id: b.anio.id },
  });
  if (r) { await recargar(); location.hash = '#/curso/' + r.id; }
}

// ---------------------------------------------------------------- Curso
export async function curso(m, p) {
  const b = await base();
  const c = b.cursoPorId.get(p.id);
  if (!c) { m.innerHTML = vacio('Ese curso no existe.'); return; }
  const [mats, gente] = await Promise.all([E.db.select('matriculas', { eq: { curso_id: c.id } }), personasColegio()]);
  const asig = b.asignaciones.filter((a) => a.curso_id === c.id);
  await perfiles([...mats.map((x) => x.estudiante_id), ...asig.map((a) => a.profesor_id), c.director_id]);
  const P = E.perfiles;
  const activos = mats.filter((x) => x.estado === 'activa').sort((x, y) => nombreLista(P.get(x.estudiante_id)).localeCompare(nombreLista(P.get(y.estudiante_id))));
  const profes = await opcionesProfes();

  m.innerHTML = cabecera(`Curso ${esc(c.nombre)}`, { volver: '#/estructura?tab=cursos', acciones: '<button class="btn" data-editar-curso>Editar</button>' }) + `
    <p class="sub-titulo">${esc(b.gradoPorId.get(c.grado_id)?.nombre || '')} · ${esc(b.sedePorId.get(c.sede_id)?.nombre || '')} · Director: <b>${esc(c.director_id ? nombre(P.get(c.director_id)) : 'sin asignar')}</b></p>
    <section class="tarjeta">
      <div class="tarjeta-cab"><h2>Materias y profesores</h2><button class="btn btn-chico" data-agregar-materia>＋ Materia</button></div>
      ${asig.length ? `<div class="tabla-envoltura"><table class="tabla"><thead><tr><th>Materia</th><th>Profesor</th><th>Horas</th><th></th></tr></thead><tbody>
        ${asig.sort((x, y) => (b.materiaPorId.get(x.materia_id)?.nombre || '').localeCompare(b.materiaPorId.get(y.materia_id)?.nombre || '')).map((a) => `
          <tr><td><b>${esc(b.materiaPorId.get(a.materia_id)?.nombre)}</b></td>
          <td><select data-profe="${a.id}" aria-label="Profesor"><option value="">— Sin profesor —</option>${profes.map(([id, t]) => `<option value="${id}" ${id === a.profesor_id ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></td>
          <td>${a.intensidad_horaria ?? ''}</td>
          <td class="acciones-celda"><a class="btn btn-chico" href="#/notas/${a.id}">Notas</a><button class="btn-icono" data-quitar-asig="${a.id}" aria-label="Quitar materia">🗑</button></td></tr>`).join('')}
      </tbody></table></div>` : vacio('Este curso aún no tiene materias.', b.materias.length ? '<button class="btn" data-todas-materias>Agregar todas las materias</button>' : '<a class="btn" href="#/estructura?tab=materias">Crear materias</a>')}
    </section>
    <section class="tarjeta">
      <div class="tarjeta-cab"><h2>Estudiantes (${activos.length})</h2><button class="btn btn-chico" data-matricular>＋ Matricular</button></div>
      ${activos.length ? `<div class="lista">${activos.map((x, i) => {
        const e = P.get(x.estudiante_id);
        return `<div class="fila"><span class="num">${i + 1}</span><a class="crece" href="#/estudiante/${x.estudiante_id}"><b>${esc(nombreLista(e))}</b><small>${esc(e?.tipo_documento || '')} ${esc(e?.numero_documento || '')}</small></a><button class="btn btn-chico" data-retirar="${x.id}">Retirar</button></div>`;
      }).join('')}</div>` : vacio('Aún no hay estudiantes matriculados.')}
    </section>`;

  const recargar = async () => { await recargarBase(); curso(m, p); };
  m.querySelector('[data-editar-curso]').onclick = async () => {
    const r = await editar({ titulo: 'Curso', tabla: 'cursos', fila: c, campos: [
      { name: 'grado_id', label: 'Grado', tipo: 'select', opciones: b.grados.map((g) => [g.id, g.nombre]), req: true },
      { name: 'nombre', label: 'Nombre', req: true },
      { name: 'sede_id', label: 'Sede', tipo: 'select', opciones: b.sedes.map((s) => [s.id, s.nombre]), req: true },
      { name: 'director_id', label: 'Director de curso', tipo: 'select', vacio: 'Sin director', opciones: profes },
    ] });
    if (r === 'borrado') { await recargarBase(); location.hash = '#/estructura?tab=cursos'; } else if (r) recargar();
  };
  m.querySelectorAll('[data-profe]').forEach((s) => (s.onchange = async () => {
    try { await E.db.update('asignaciones', { profesor_id: s.value || null }, { id: s.dataset.profe }); aviso('Profesor asignado'); await recargarBase(); } catch (e) { aviso(e.message, 'error'); }
  }));
  m.querySelectorAll('[data-quitar-asig]').forEach((bt) => (bt.onclick = async () => {
    if (!(await confirmar('¿Quitar la materia del curso?', 'Se borrarán también sus actividades, notas y asistencia en este curso.', 'Quitar'))) return;
    try { await E.db.remove('asignaciones', { id: bt.dataset.quitarAsig }); aviso('Materia quitada'); recargar(); } catch (e) { aviso(e.message, 'error'); }
  }));
  const yaEsta = new Set(asig.map((a) => a.materia_id));
  m.querySelector('[data-todas-materias]')?.addEventListener('click', async () => {
    try { await E.db.insert('asignaciones', b.materias.filter((x) => !yaEsta.has(x.id)).map((x) => ({ colegio_id: E.colegio.id, curso_id: c.id, materia_id: x.id }))); aviso('Materias agregadas'); recargar(); } catch (e) { aviso(e.message, 'error'); }
  });
  m.querySelector('[data-agregar-materia]').onclick = async () => {
    const libres = b.materias.filter((x) => !yaEsta.has(x.id));
    if (!libres.length) return aviso(b.materias.length ? 'El curso ya tiene todas las materias.' : 'Primero crea materias.', 'error');
    const r = await editar({ titulo: 'Agregar materia', tabla: 'asignaciones', borrable: false, extra: { curso_id: c.id }, campos: [
      { name: 'materia_id', label: 'Materia', tipo: 'select', opciones: libres.map((x) => [x.id, x.nombre]), req: true },
      { name: 'profesor_id', label: 'Profesor', tipo: 'select', vacio: 'Sin profesor', opciones: profes },
      { name: 'intensidad_horaria', label: 'Horas por semana', tipo: 'number' },
    ] });
    if (r) recargar();
  };
  m.querySelectorAll('[data-retirar]').forEach((bt) => (bt.onclick = async () => {
    if (!(await confirmar('¿Retirar al estudiante?', 'Dejará de aparecer en el curso. Sus notas se conservan.', 'Retirar'))) return;
    try { await E.db.update('matriculas', { estado: 'retirada' }, { id: bt.dataset.retirar }); aviso('Estudiante retirado'); curso(m, p); } catch (e) { aviso(e.message, 'error'); }
  }));
  m.querySelector('[data-matricular]').onclick = async () => {
    // estudiantes del colegio sin matrícula activa este año
    const todasMats = await E.db.select('matriculas', { eq: { colegio_id: E.colegio.id } });
    const cursosAnio = new Set(b.cursos.map((x) => x.id));
    const ocupados = new Set(todasMats.filter((x) => x.estado === 'activa' && cursosAnio.has(x.curso_id)).map((x) => x.estudiante_id));
    const vistos = new Set();
    const libres = gente.filter((g) => g.rol === 'estudiante' && g.activo && !ocupados.has(g.perfil_id) && !vistos.has(g.perfil_id) && vistos.add(g.perfil_id));
    if (!libres.length) return ventana({ titulo: 'Matricular', html: '<p>No hay estudiantes sin curso. Agrégalos primero en <b>Personas</b>.</p>', botones: [{ texto: 'Ir a Personas', valor: 1 }] }).then((v) => v && (location.hash = '#/personas?tab=estudiante'));
    const ids = await ventana({
      titulo: `Matricular en ${c.nombre}`,
      html: `${buscar('Buscar estudiante…')}<div class="lista">${libres.map((g) => `<label class="fila check" data-buscar="${esc(nombreLista(g) + ' ' + (g.correo || ''))}"><input type="checkbox" name="est" data-multi="1" value="${g.perfil_id}"><span><b>${esc(nombreLista(g))}</b><small>${esc(g.correo || '')}</small></span></label>`).join('')}</div>`,
      alAbrir: (caja) => conectarBuscador(caja),
      botones: [{ texto: 'Cancelar' }, { texto: 'Matricular', antes: async (caja) => {
        const sel = leerForm(caja).est || [];
        if (!sel.length) throw new Error('Marca al menos un estudiante.');
        for (const id of sel) {
          const previa = todasMats.find((x) => x.curso_id === c.id && x.estudiante_id === id);
          if (previa) await E.db.update('matriculas', { estado: 'activa' }, { id: previa.id });
          else await E.db.insert('matriculas', [{ colegio_id: E.colegio.id, curso_id: c.id, estudiante_id: id }]);
        }
        return sel;
      } }],
    });
    if (ids) { aviso(`${ids.length} matriculado(s)`); curso(m, p); }
  };
}

// ---------------------------------------------------------------- Personas
const TABS_P = [['todos', 'Todos'], ['profesor', 'Profesores'], ['estudiante', 'Estudiantes'], ['acudiente', 'Acudientes'], ['admin', 'Admin']];

export async function personas(m, p) {
  const tab = TABS_P.some((t) => t[0] === p.tab) ? p.tab : 'todos';
  const gente = await personasColegio();
  const porPersona = new Map();
  for (const g of gente) {
    const x = porPersona.get(g.perfil_id) || { ...g, roles: [] };
    x.roles.push({ rol: g.rol, activo: g.activo });
    porPersona.set(g.perfil_id, x);
  }
  let lista = [...porPersona.values()];
  if (tab !== 'todos') lista = lista.filter((x) => x.roles.some((r) => r.rol === tab));
  lista.sort((x, y) => nombreLista(x).localeCompare(nombreLista(y)));

  m.innerHTML = cabecera('Personas', { acciones: '<button class="btn btn-primario" data-agregar>＋ Crear usuario</button><button class="btn" data-importar>⬆ Importar (Excel)</button><button class="btn" data-existente>Ya tiene cuenta</button>' }) +
    pestanas(TABS_P, tab, '#/personas?tab=') + `
    <div class="contenido">
      ${buscar('Buscar por nombre o correo…')}
      ${lista.length ? `<div class="lista">${lista.map((x) => `
        <button class="fila fila-boton ${x.roles.every((r) => !r.activo) ? 'inactivo' : ''}" data-persona="${x.perfil_id}" data-buscar="${esc(nombreLista(x) + ' ' + (x.correo || ''))}">
          <span class="avatar">${esc(iniciales(x))}</span>
          <span><b>${esc(nombreLista(x))}</b><small>${esc(x.correo || '')}</small></span>
          <span class="chips">${x.roles.map((r) => `<span class="chip ${r.activo ? '' : 'tachado'}">${ROL[r.rol]}</span>`).join('')}</span>
        </button>`).join('')}</div>` : vacio('No hay personas aquí todavía.')}
    </div>`;
  conectarBuscador(m);
  m.querySelector('[data-agregar]').onclick = () => agregarPersona(tab !== 'todos' ? tab : 'estudiante', () => personas(m, p));
  m.querySelector('[data-importar]').onclick = () => importar(() => personas(m, p));
  m.querySelector('[data-existente]').onclick = async () => {
    const demo = E.db.modo === 'demo';
    const r = await ventana({
      titulo: 'Agregar a alguien que ya tiene cuenta',
      html: camposHTML([
        { name: 'rol', label: 'Rol', tipo: 'select', opciones: Object.entries(ROL), def: tab !== 'todos' ? tab : 'acudiente' },
        { name: 'correo', label: 'Correo con el que se registró', tipo: 'email' },
        ...(demo ? [{ name: 'nombres', label: 'Nombres' }, { name: 'apellidos', label: 'Apellidos' }] : []),
      ]) + '<p class="ayuda">Para personas que crearon su propia cuenta en Complex_ ("Crear cuenta" al entrar).</p>',
      botones: [{ texto: 'Cancelar' }, { texto: 'Agregar', antes: async (c) => {
        const d = leerForm(c);
        if (!/^\S+@\S+\.\S+$/.test(d.correo)) throw new Error('Escribe un correo válido.');
        const args = { p_colegio: E.colegio.id, p_correo: d.correo, p_rol: d.rol };
        if (demo) Object.assign(args, { p_nombres: d.nombres, p_apellidos: d.apellidos });
        return await E.db.rpc('agregar_miembro', args);
      } }],
    });
    if (r) { aviso('Persona agregada'); personas(m, p); }
  };
  m.querySelectorAll('[data-persona]').forEach((el) => (el.onclick = () => fichaPersona(porPersona.get(el.dataset.persona), () => personas(m, p))));
}

async function fichaPersona(x, alCambiar) {
  const b = await base();
  const id = x.perfil_id;
  const esEst = x.roles.some((r) => r.rol === 'estudiante');
  const esAcu = x.roles.some((r) => r.rol === 'acudiente');
  const [acus, mats] = await Promise.all([
    E.db.select('acudientes', { eq: { colegio_id: E.colegio.id } }),
    esEst ? E.db.select('matriculas', { eq: { estudiante_id: id } }) : [],
  ]);
  const susAcud = acus.filter((a) => a.estudiante_id === id);
  const susHijos = acus.filter((a) => a.acudiente_id === id);
  await perfiles([...susAcud.map((a) => a.acudiente_id), ...susHijos.map((a) => a.estudiante_id)]);
  const P = E.perfiles;
  const mat = mats.find((mm) => mm.estado === 'activa' && b.cursos.some((c) => c.id === mm.curso_id));
  const todosRoles = Object.keys(ROL);
  const tiene = (r) => x.roles.find((y) => y.rol === r);

  await ventana({
    titulo: nombre(x),
    html: `
      <p class="ayuda">Usuario: <b>${esc((x.correo || '').endsWith('@usuarios.complex') ? x.correo.split('@')[0] : x.correo || '')}</b> <button class="btn btn-chico" data-clave>🔑 Restablecer contraseña</button></p>
      <h3 class="sub">Roles en el colegio</h3>
      <div class="lista">${todosRoles.map((r) => `<label class="fila check"><input type="checkbox" data-rol="${r}" ${tiene(r)?.activo ? 'checked' : ''} ${r === 'admin' && id === E.yo.id ? 'disabled' : ''}><span><b>${ROL[r]}</b></span></label>`).join('')}</div>
      ${tiene('profesor')?.activo ? `<p><a class="btn btn-chico" href="#/docente/${id}" data-cerrar>🧑‍🏫 Ficha del docente: clases, horario y planeaciones</a></p>` : ''}
      ${tiene('director_seccion')?.activo ? `<h3 class="sub">Sección (grados que dirige)</h3>
        <div class="lista">${b.grados.map((g) => `<label class="fila check"><input type="checkbox" data-grado-sec="${g.id}"><span><b>${esc(g.nombre)}</b></span></label>`).join('')}</div>
        <p class="ayuda">El director de sección ve los estudiantes, notas, asistencia, seguimientos y planeaciones de estos grados, y autoriza permisos de salida.</p>` : ''}
      ${esEst ? `
        <h3 class="sub">Curso</h3>
        <p>${mat ? `<a href="#/curso/${mat.curso_id}" data-cerrar>${esc(b.cursoPorId.get(mat.curso_id)?.nombre)}</a>` : 'Sin matrícula este año (matricúlalo desde el curso).'}</p>
        <h3 class="sub">Acudientes</h3>
        <div class="lista">${susAcud.map((a) => `<div class="fila"><span><b>${esc(nombre(P.get(a.acudiente_id)))}</b><small>${esc(a.parentesco || '')}</small></span><button class="btn-icono" data-quitar-acu="${a.acudiente_id}" aria-label="Quitar acudiente">🗑</button></div>`).join('') || '<p class="ayuda">Sin acudientes.</p>'}</div>
        <button class="btn btn-chico" data-agregar-acu>＋ Vincular acudiente</button>
        <p><a class="btn btn-chico" href="#/estudiante/${id}" data-cerrar>Ver notas y observador</a></p>` : ''}
      ${esAcu ? `<h3 class="sub">Acudiente de</h3><div class="lista">${susHijos.map((a) => `<a class="fila fila-boton" href="#/estudiante/${a.estudiante_id}" data-cerrar><span><b>${esc(nombre(P.get(a.estudiante_id)))}</b><small>${esc(a.parentesco || '')}</small></span></a>`).join('') || '<p class="ayuda">Aún no está vinculado a ningún estudiante.</p>'}</div>` : ''}`,
    alAbrir: (caja, cerrar) => {
      caja.querySelector('[data-clave]')?.addEventListener('click', () => restablecer(x));
      // grados de la sección (se leen de su fila de miembros y se guardan al marcar)
      const chkSec = [...caja.querySelectorAll('[data-grado-sec]')];
      if (chkSec.length) {
        E.db.select('miembros', { eq: { colegio_id: E.colegio.id, perfil_id: id, rol: 'director_seccion' } }).then(([fila]) => {
          const ya = new Set(fila?.seccion_grados || []);
          chkSec.forEach((c) => { c.checked = ya.has(c.dataset.gradoSec); });
        }).catch(() => {});
        chkSec.forEach((c) => (c.onchange = async () => {
          const sel = chkSec.filter((y) => y.checked).map((y) => y.dataset.gradoSec);
          try { await E.db.update('miembros', { seccion_grados: sel }, { colegio_id: E.colegio.id, perfil_id: id, rol: 'director_seccion' }); aviso('Sección actualizada'); }
          catch (e) { c.checked = !c.checked; aviso(e.message, 'error'); }
        }));
      }
      caja.querySelectorAll('[data-rol]').forEach((chk) => (chk.onchange = async () => {
        const rol = chk.dataset.rol;
        try {
          if (chk.checked) {
            if (tiene(rol)) await E.db.update('miembros', { activo: true }, { colegio_id: E.colegio.id, perfil_id: id, rol });
            else await E.db.insert('miembros', [{ colegio_id: E.colegio.id, perfil_id: id, rol }]);
          } else await E.db.update('miembros', { activo: false }, { colegio_id: E.colegio.id, perfil_id: id, rol });
          aviso('Rol actualizado');
          alCambiar();
        } catch (e) { chk.checked = !chk.checked; aviso(e.message, 'error'); }
      }));
      caja.querySelectorAll('[data-quitar-acu]').forEach((bt) => (bt.onclick = async () => {
        try { await E.db.remove('acudientes', { colegio_id: E.colegio.id, acudiente_id: bt.dataset.quitarAcu, estudiante_id: id }); bt.closest('.fila').remove(); aviso('Acudiente desvinculado'); } catch (e) { aviso(e.message, 'error'); }
      }));
      caja.querySelector('[data-agregar-acu]')?.addEventListener('click', async () => {
        const gente = await personasColegio();
        const vistos = new Set(susAcud.map((a) => a.acudiente_id));
        const ops = gente.filter((g) => g.rol === 'acudiente' && g.activo && !vistos.has(g.perfil_id) && vistos.add(g.perfil_id));
        if (!ops.length) return aviso('Primero agrega al acudiente en Personas (rol Acudiente).', 'error');
        const r = await ventana({ titulo: 'Vincular acudiente', html: camposHTML([
          { name: 'acudiente_id', label: 'Acudiente', tipo: 'select', opciones: ops.map((g) => [g.perfil_id, nombreLista(g)]) },
          { name: 'parentesco', label: 'Parentesco', tipo: 'select', opciones: ['Madre', 'Padre', 'Abuela', 'Abuelo', 'Tía', 'Tío', 'Hermana', 'Hermano', 'Otro'].map((v) => [v, v]) },
          { name: 'principal', label: 'Acudiente principal', tipo: 'checkbox', def: !susAcud.length },
        ]), botones: [{ texto: 'Cancelar' }, { texto: 'Vincular', antes: async (c) => {
          const d = leerForm(c);
          await E.db.insert('acudientes', [{ colegio_id: E.colegio.id, estudiante_id: id, ...d }]);
          return true;
        } }] });
        if (r) { aviso('Acudiente vinculado'); cerrar(null); fichaPersona(x, alCambiar); }
      });
    },
  });
}

// ---------------------------------------------------------------- Ajustes del colegio
const CATEGORIAS_AS = [['presente', 'Presente'], ['ausente', 'Ausente (falla)'], ['tarde', 'Llegó tarde'], ['excusa', 'Ausencia justificada']];
// Tipos de ejemplo (los de un colegio en Phidias)
const TIPOS_EJEMPLO = [
  ['Presente con uniforme', 'presente'], ['Presente sin uniforme', 'presente'], ['Ausencia injustificada', 'ausente'], ['Ausencia justificada', 'excusa'],
  ['Retardo injustificado', 'tarde'], ['Retardo justificado', 'tarde'], ['Salida temprano', 'excusa'],
  ['Reunión - asiste madre', 'presente'], ['Reunión - asiste padre', 'presente'], ['Reunión - asiste otro', 'presente'], ['Reunión - asisten (padre y madre)', 'presente'], ['Ausente - reunión de padres', 'ausente'],
];

// Tipos de mensaje (REA Phidias §3.1): los de un colegio en Phidias
const ROLES_MSG = [['admin', 'Administración'], ['profesor', 'Profesores'], ['acudiente', 'Familias'], ['estudiante', 'Estudiantes']];
const TIPOS_MSG_EJEMPLO = [
  ['Circulares', '#c0392b', ['admin'], false, true], ['Mensajes', '#1f4fd1', null, true, false], ['Notificaciones', '#d97706', ['admin', 'profesor'], true, false],
  ['Seguimientos', '#0f9d58', ['admin', 'profesor'], true, false], ['Transporte y permisos', '#7a3fd1', null, true, false],
];
const quienesEnvian = (roles) => (!roles?.length ? 'Todos' : ROLES_MSG.filter(([k]) => roles.includes(k)).map(([, t]) => t).join(', '));

function editarTipoMensaje(c, t) {
  const nuevo = !t?.id;
  const f = t || { color: '#1f4fd1', roles: null, permite_respuesta: true, numerar: false, activo: true, orden: 0 };
  return ventana({
    titulo: nuevo ? 'Nuevo tipo de mensaje' : 'Tipo de mensaje',
    html: `<div class="form">
      <label>Nombre<input name="nombre" maxlength="60" value="${esc(f.nombre || '')}"></label>
      <label class="en-linea">Color <input type="color" name="color" value="${esc(f.color)}"></label>
      <fieldset class="tambien"><legend>Quién puede enviarlo</legend>
        ${ROLES_MSG.map(([k, tx]) => `<label class="check"><input type="checkbox" name="rol_${k}" ${!f.roles?.length || f.roles.includes(k) ? 'checked' : ''} ${k === 'admin' ? 'checked disabled' : ''}> ${tx}</label>`).join('')}
        <small class="ayuda">El administrador siempre puede enviarlo.</small>
      </fieldset>
      <label class="check"><input type="checkbox" name="permite_respuesta" ${f.permite_respuesta !== false ? 'checked' : ''}> Admite respuestas</label>
      <label class="check"><input type="checkbox" name="numerar" ${f.numerar ? 'checked' : ''}> Número consecutivo (como las circulares: No. 1, No. 2…)</label>
      ${f.numerar && f.consecutivo ? `<p class="ayuda">Último número usado: ${f.consecutivo}.</p>` : ''}
      <label>Orden en la lista<input name="orden" inputmode="decimal" value="${esc(String(f.orden ?? 0))}"></label>
      <label class="check"><input type="checkbox" name="activo" ${f.activo !== false ? 'checked' : ''}> Activo</label>
    </div>`,
    botones: [
      ...(nuevo ? [] : [{ texto: 'Eliminar', clase: 'btn-peligro', antes: async () => {
        if (!(await confirmar('¿Eliminar el tipo?', 'Los mensajes ya enviados con este tipo quedan como mensajes sin tipo.', 'Eliminar'))) return false;
        await E.db.remove('tipos_mensaje', { id: t.id }); aviso('Eliminado'); return true;
      } }]),
      { texto: 'Cancelar' },
      { texto: nuevo ? 'Crear' : 'Guardar', antes: async (caja) => {
        const q = (n) => caja.querySelector(`[name=${n}]`);
        const nombreT = q('nombre').value.trim();
        if (!nombreT) throw new Error('Escribe el nombre del tipo.');
        const roles = ROLES_MSG.filter(([k]) => q('rol_' + k).checked).map(([k]) => k);
        const d = { nombre: nombreT, color: q('color').value, roles: roles.length === ROLES_MSG.length ? null : roles, permite_respuesta: q('permite_respuesta').checked, numerar: q('numerar').checked, orden: Number(String(q('orden').value).replace(',', '.')) || 0, activo: q('activo').checked };
        if (nuevo) await E.db.insert('tipos_mensaje', [{ colegio_id: c.id, ...d }]); else await E.db.update('tipos_mensaje', d, { id: t.id });
        aviso(nuevo ? 'Creado' : 'Guardado');
        return true;
      } },
    ],
  });
}

export async function ajustesColegio(m) {
  const c = E.colegio;
  const [tiposAs, tiposMsg] = await Promise.all([
    E.db.select('tipos_asistencia', { eq: { colegio_id: c.id }, order: 'orden' }).catch(() => []),
    E.db.select('tipos_mensaje', { eq: { colegio_id: c.id }, order: 'orden' }).catch(() => []),
  ]);
  m.innerHTML = cabecera('Ajustes del colegio', { volver: '#/perfil' }) + `
    <section class="tarjeta" id="f-colegio">
      ${camposHTML([
        { name: 'nombre', label: 'Nombre del colegio' },
        { name: 'nit', label: 'NIT' },
        { name: 'ciudad', label: 'Ciudad' },
      ], c)}
      <h2>Escala de notas</h2>
      ${camposHTML([
        { name: 'nota_min', label: 'Nota mínima', tipo: 'number', paso: '0.1' },
        { name: 'nota_max', label: 'Nota máxima', tipo: 'number', paso: '0.1' },
        { name: 'nota_aprobacion', label: 'Nota para aprobar', tipo: 'number', paso: '0.1' },
        { name: 'decimales', label: 'Decimales a mostrar', tipo: 'select', opciones: [[0, '0 (ej. 4)'], [1, '1 (ej. 4.3)'], [2, '2 (ej. 4.25)']] },
      ], c)}
      <p class="ayuda">Desempeños según el Decreto 1290: Bajo (por debajo de la nota para aprobar), Básico, Alto y Superior.</p>
      <h2>Cómo califican los profesores</h2>
      <div class="segmentos" role="radiogroup" aria-label="Tipo de escala">
        <label class="seg-radio"><input type="radio" name="escala_tipo" value="numerica" ${c.escala_tipo !== 'cualitativa' ? 'checked' : ''}> Con números (${esc(String(c.nota_min))} a ${esc(String(c.nota_max))})</label>
        <label class="seg-radio"><input type="radio" name="escala_tipo" value="cualitativa" ${c.escala_tipo === 'cualitativa' ? 'checked' : ''}> Con desempeños (siglas)</label>
      </div>
      <div data-escala-cual ${c.escala_tipo === 'cualitativa' ? '' : 'hidden'}>
        <p class="ayuda">Como en Phidias: el profesor elige la sigla de una lista (ej. S, A, BS, BJ). <b>Valor</b> es el número con que cuenta en los promedios y <b>Desde</b> la nota mínima de su rango (así un promedio de 2,8 sale como BJ si "BS" empieza en 3,0).</p>
        <table class="tabla tabla-escala"><thead><tr><th>Sigla</th><th>Nombre</th><th>Valor</th><th>Desde</th><th></th></tr></thead><tbody data-escala-filas></tbody></table>
        <button class="btn btn-chico" data-escala-mas>＋ Sigla</button>
      </div>
      <button class="btn btn-primario" data-guardar>Guardar</button>
    </section>
    <section class="tarjeta" id="f-marca">
      <h2>Marca del colegio</h2>
      <div class="marca-vista"><span data-logo-vista>${logoHTML('logo')}</span><span><b>${esc(c.nombre)}</b><small>Así se ve en la app, el boletín y los certificados</small></span></div>
      <div class="form">
        <label>Logo (PNG, JPG o SVG, máximo 1 MB)<input type="file" name="logo" accept="image/png,image/jpeg,image/webp,image/svg+xml"></label>
        <label class="en-linea">Color institucional <input type="color" name="color" value="${esc(c.color || '#1f4fd1')}"></label>
        <div class="acciones"><button class="btn btn-primario" data-guardar-marca>Guardar marca</button>${c.logo_ruta || c.color ? '<button class="btn" data-quitar-marca>Volver a la marca de Complex_</button>' : ''}</div>
      </div>
    </section>
    <section class="tarjeta" id="tipos-asistencia">
      <h2>Tipos de asistencia</h2>
      <p class="ayuda">Como en Phidias: los profesores eligen el tipo de cada estudiante (ej. "Presente con uniforme", "Retardo justificado"). Cada tipo cuenta como presente, falla, retardo o ausencia justificada. Sin tipos, se usa P / A / T / E.</p>
      ${tiposAs.length ? `<div class="lista">${tiposAs.map((t) => `<button class="fila fila-boton" data-tipo-as="${t.id}"><span class="num">${t.orden}</span><span class="crece"><b>${esc(t.nombre)}</b><small>${esc(CATEGORIAS_AS.find(([k]) => k === t.categoria)?.[1] || t.categoria)}${t.activo === false ? ' · inactivo' : ''}</small></span></button>`).join('')}</div>` : '<p class="ayuda">Aún no hay tipos: los profesores usan P / A / T / E.</p>'}
      <div class="acciones"><button class="btn" data-tipo-as-nuevo>＋ Tipo</button>${tiposAs.length ? '' : '<button class="btn" data-tipo-as-ejemplo>Cargar los tipos de ejemplo</button>'}</div>
    </section>
    <section class="tarjeta" id="tipos-mensaje">
      <h2>Tipos de mensaje</h2>
      <p class="ayuda">Como en Phidias: cada mensaje puede llevar un tipo (Circulares, Notificaciones, Transporte y permisos…) con su color en la bandeja y el calendario. Para cada tipo eliges quién puede enviarlo, si admite respuestas y si lleva número consecutivo. Sin tipos, todos los mensajes son iguales.</p>
      ${tiposMsg.length ? `<div class="lista">${tiposMsg.map((t) => `<button class="fila fila-boton" data-tipo-msg="${t.id}"><span class="avatar" style="background:${esc(t.color)}"></span><span class="crece"><b>${esc(t.nombre)}</b><small>Envían: ${esc(quienesEnvian(t.roles))}${t.permite_respuesta === false ? ' · sin respuestas' : ''}${t.numerar ? ` · numerado (va en ${t.consecutivo || 0})` : ''}${t.activo === false ? ' · inactivo' : ''}</small></span></button>`).join('')}</div>` : '<p class="ayuda">Aún no hay tipos de mensaje.</p>'}
      <div class="acciones"><button class="btn" data-tipo-msg-nuevo>＋ Tipo</button>${tiposMsg.length ? '' : '<button class="btn" data-tipo-msg-ejemplo>Cargar los tipos de ejemplo</button>'}</div>
    </section>`;
  m.querySelector('[data-tipo-msg-nuevo]').onclick = async () => { if (await editarTipoMensaje(c, { color: '#1f4fd1', roles: null, permite_respuesta: true, numerar: false, activo: true, orden: (tiposMsg.at(-1)?.orden || 0) + 1 })) ajustesColegio(m); };
  m.querySelectorAll('[data-tipo-msg]').forEach((bt) => (bt.onclick = async () => { if (await editarTipoMensaje(c, tiposMsg.find((t) => t.id === bt.dataset.tipoMsg))) ajustesColegio(m); }));
  m.querySelector('[data-tipo-msg-ejemplo]')?.addEventListener('click', async () => {
    try { await E.db.insert('tipos_mensaje', TIPOS_MSG_EJEMPLO.map(([nombre, color, roles, permite_respuesta, numerar], i) => ({ colegio_id: c.id, nombre, color, roles, permite_respuesta, numerar, orden: i + 1 }))); aviso('Tipos de mensaje cargados'); ajustesColegio(m); }
    catch (e) { aviso(e.message, 'error'); }
  });
  const camposTipo = [{ name: 'nombre', label: 'Nombre', req: true }, { name: 'categoria', label: 'Cuenta como', tipo: 'select', opciones: CATEGORIAS_AS }, { name: 'orden', label: 'Orden en la lista', tipo: 'number' }, { name: 'activo', label: 'Activo', tipo: 'checkbox' }];
  m.querySelector('[data-tipo-as-nuevo]').onclick = async () => { if (await editar({ titulo: 'Nuevo tipo de asistencia', tabla: 'tipos_asistencia', campos: camposTipo, fila: { categoria: 'presente', orden: (tiposAs.at(-1)?.orden || 0) + 1, activo: true } })) ajustesColegio(m); };
  m.querySelectorAll('[data-tipo-as]').forEach((bt) => (bt.onclick = async () => { if (await editar({ titulo: 'Tipo de asistencia', tabla: 'tipos_asistencia', campos: camposTipo, fila: tiposAs.find((t) => t.id === bt.dataset.tipoAs) })) ajustesColegio(m); }));
  m.querySelector('[data-tipo-as-ejemplo]')?.addEventListener('click', async () => {
    try { await E.db.insert('tipos_asistencia', TIPOS_EJEMPLO.map(([nombre, categoria], i) => ({ colegio_id: c.id, nombre, categoria, orden: i + 1, activo: true }))); aviso('Tipos de asistencia cargados'); ajustesColegio(m); }
    catch (e) { aviso(e.message, 'error'); }
  });
  m.querySelector('[data-guardar-marca]').onclick = async (ev) => {
    const caja = m.querySelector('#f-marca');
    const arch = caja.querySelector('[name=logo]').files[0];
    const color = caja.querySelector('[name=color]').value;
    if (arch && arch.size > 1024 * 1024) return aviso('El logo pesa más de 1 MB.', 'error');
    ev.target.disabled = true;
    try {
      const cambios = { color: /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : null };
      if (arch) {
        const ruta = `${c.id}/${Date.now()}_${arch.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.\-]+/g, '_').slice(-80)}`;
        await E.db.subirArchivo('logos', ruta, arch);
        if (c.logo_ruta) await E.db.borrarArchivo('logos', c.logo_ruta).catch(() => {});
        cambios.logo_ruta = ruta;
      }
      const [r] = await E.db.update('colegios', cambios, { id: c.id });
      Object.assign(E.colegio, r || cambios);
      aplicarMarca();
      aviso('Marca guardada');
      ajustesColegio(m);
    } catch (e) { aviso(e.message, 'error'); ev.target.disabled = false; }
  };
  m.querySelector('[data-quitar-marca]')?.addEventListener('click', async () => {
    try {
      if (c.logo_ruta) await E.db.borrarArchivo('logos', c.logo_ruta).catch(() => {});
      const [r] = await E.db.update('colegios', { color: null, logo_ruta: null }, { id: c.id });
      Object.assign(E.colegio, r || { color: null, logo_ruta: null });
      aplicarMarca(); aviso('Marca restablecida'); ajustesColegio(m);
    } catch (e) { aviso(e.message, 'error'); }
  });
  // Escala cualitativa: filas editables
  const filasEsc = m.querySelector('[data-escala-filas]');
  const filaEsc = (x = {}) => `<tr><td><input data-e="sigla" value="${esc(x.sigla || '')}" maxlength="4" aria-label="Sigla"></td><td><input data-e="nombre" value="${esc(x.nombre || '')}" aria-label="Nombre"></td><td><input data-e="valor" inputmode="decimal" value="${x.valor ?? ''}" aria-label="Valor"></td><td><input data-e="desde" inputmode="decimal" value="${x.desde ?? ''}" aria-label="Desde (nota mínima de la sigla)"></td><td><button class="btn-icono" data-escala-quitar aria-label="Quitar">✕</button></td></tr>`;
  filasEsc.innerHTML = (Array.isArray(c.escala) && c.escala.length ? c.escala : [{ sigla: 'S', nombre: 'Superior', valor: 5, desde: 4.6 }, { sigla: 'A', nombre: 'Alto', valor: 4.3, desde: 4 }, { sigla: 'BS', nombre: 'Básico', valor: 3.5, desde: 3 }, { sigla: 'BJ', nombre: 'Bajo', valor: 2, desde: 1 }]).map(filaEsc).join('');
  filasEsc.addEventListener('click', (e) => { if (e.target.closest('[data-escala-quitar]')) e.target.closest('tr').remove(); });
  m.querySelector('[data-escala-mas]').onclick = () => filasEsc.insertAdjacentHTML('beforeend', filaEsc());
  m.querySelectorAll('[name=escala_tipo]').forEach((r) => (r.onchange = () => { m.querySelector('[data-escala-cual]').hidden = m.querySelector('[name=escala_tipo]:checked').value !== 'cualitativa'; }));
  m.querySelector('[data-guardar]').onclick = async () => {
    const d = leerForm(m.querySelector('#f-colegio'));
    const num = (v) => Number(String(v).replace(',', '.'));
    const cambios = { nombre: d.nombre, nit: d.nit || null, ciudad: d.ciudad || null, nota_min: num(d.nota_min), nota_max: num(d.nota_max), nota_aprobacion: num(d.nota_aprobacion), decimales: +d.decimales };
    if (!cambios.nombre) return aviso('El colegio necesita un nombre.', 'error');
    if (!(cambios.nota_min < cambios.nota_max) || cambios.nota_aprobacion < cambios.nota_min || cambios.nota_aprobacion > cambios.nota_max) return aviso('Revisa la escala: mínima < aprobar ≤ máxima.', 'error');
    cambios.escala_tipo = m.querySelector('[name=escala_tipo]:checked')?.value === 'cualitativa' ? 'cualitativa' : 'numerica';
    const escala = [...filasEsc.querySelectorAll('tr')].map((tr) => ({ sigla: tr.querySelector('[data-e=sigla]').value.trim().toUpperCase(), nombre: tr.querySelector('[data-e=nombre]').value.trim(), valor: num(tr.querySelector('[data-e=valor]').value), desde: num(tr.querySelector('[data-e=desde]').value) })).filter((x) => x.sigla || x.nombre);
    if (cambios.escala_tipo === 'cualitativa') {
      if (escala.length < 2) return aviso('La escala con desempeños necesita al menos 2 siglas.', 'error');
      if (escala.some((x) => !x.sigla || !x.nombre || Number.isNaN(x.valor))) return aviso('Cada sigla necesita sigla, nombre y valor.', 'error');
      if (new Set(escala.map((x) => x.sigla)).size !== escala.length) return aviso('Hay siglas repetidas.', 'error');
      if (escala.some((x) => x.valor < cambios.nota_min || x.valor > cambios.nota_max)) return aviso(`Los valores deben estar entre ${cambios.nota_min} y ${cambios.nota_max}.`, 'error');
      if (escala.some((x) => Number.isNaN(x.desde) || x.desde < cambios.nota_min || x.desde > x.valor)) return aviso('Cada sigla necesita "Desde" (la nota mínima de su rango), entre la mínima de la escala y su valor.', 'error');
    }
    if (escala.length) cambios.escala = escala.sort((x, y) => y.valor - x.valor);
    try {
      const [r] = await E.db.update('colegios', cambios, { id: c.id });
      Object.assign(E.colegio, r || cambios);
      aviso('Ajustes guardados');
    } catch (e) { aviso(e.message, 'error'); }
  };
}
