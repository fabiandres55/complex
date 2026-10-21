// Estado compartido de la app y consultas comunes.

export const E = {
  db: null,          // capa de datos (real o demo)
  sesion: null,      // { user: {id, email} }
  yo: null,          // mi perfil
  membresias: [],    // mis filas de miembros (todos los colegios)
  colegio: null,     // colegio activo
  roles: [],         // mis roles en el colegio activo
  rol: null,         // rol con el que estoy viendo la app
  base: null,        // estructura del colegio (sedes, cursos, materias…)
  perfiles: new Map(),
};

const CLAVE_PREF = 'complex_pref';
export function pref(k, v) {
  let p = {};
  try { p = JSON.parse(localStorage.getItem(CLAVE_PREF)) || {}; } catch {}
  if (v === undefined) return p[k];
  p[k] = v;
  try { localStorage.setItem(CLAVE_PREF, JSON.stringify(p)); } catch {}
}

export async function cargarYo() {
  const id = E.sesion.user.id;
  const [yo] = await E.db.select('perfiles', { eq: { id } });
  E.yo = yo || { id, nombres: '', apellidos: '' };
  E.perfiles.set(id, E.yo);
  E.membresias = (await E.db.select('miembros', { eq: { perfil_id: id } })).filter((m) => m.activo);
  const ids = [...new Set(E.membresias.map((m) => m.colegio_id))];
  E.colegios = ids.length ? await E.db.select('colegios', { in: { id: ids }, order: 'nombre' }) : [];
}

const ORDEN_ROLES = ['admin', 'profesor', 'acudiente', 'estudiante'];

export async function elegirColegio(id) {
  E.colegio = E.colegios.find((c) => c.id === id) || null;
  if (!E.colegio) return;
  E.roles = ORDEN_ROLES.filter((r) => E.membresias.some((m) => m.colegio_id === id && m.rol === r));
  const guardado = pref('rol_' + id);
  E.rol = E.roles.includes(guardado) ? guardado : E.roles[0];
  pref('colegio', id);
  E.base = null;
  E.perfiles = new Map([[E.yo.id, E.yo]]);
}

export function cambiarRol(r) {
  if (!E.roles.includes(r)) return;
  E.rol = r;
  pref('rol_' + E.colegio.id, r);
}

// Estructura del colegio (tablas pequeñas). Se recarga con recargarBase().
export async function base() {
  if (E.base) return E.base;
  const eq = { colegio_id: E.colegio.id };
  const [sedes, anios, periodos, grados, cursos, materias, asignaciones] = await Promise.all([
    E.db.select('sedes', { eq, order: 'nombre' }),
    E.db.select('anios_lectivos', { eq, order: 'anio desc' }),
    E.db.select('periodos', { eq, order: 'numero' }),
    E.db.select('grados', { eq, order: 'orden' }),
    E.db.select('cursos', { eq, order: 'nombre' }),
    E.db.select('materias', { eq, order: 'nombre' }),
    E.db.select('asignaciones', { eq }),
  ]);
  const anio = anios.find((a) => a.activo) || anios[0] || null;
  E.base = {
    sedes, anios, anio, grados, materias, asignaciones,
    periodos: periodos.filter((p) => !anio || p.anio_lectivo_id === anio.id),
    todosPeriodos: periodos,
    cursos: cursos.filter((c) => !anio || c.anio_lectivo_id === anio.id),
    todosCursos: cursos,
  };
  const porId = (l) => new Map(l.map((x) => [x.id, x]));
  E.base.cursoPorId = porId(cursos);
  E.base.materiaPorId = porId(materias);
  E.base.gradoPorId = porId(grados);
  E.base.sedePorId = porId(sedes);
  E.base.periodoPorId = porId(periodos);
  E.base.asignacionPorId = porId(asignaciones);
  return E.base;
}
export const recargarBase = () => { E.base = null; return base(); };

// Perfiles por id (con caché). La RLS decide cuáles se pueden ver.
export async function perfiles(ids) {
  const faltan = [...new Set(ids.filter((i) => i && !E.perfiles.has(i)))];
  for (let i = 0; i < faltan.length; i += 150) {
    const filas = await E.db.select('perfiles', { in: { id: faltan.slice(i, i + 150) } });
    for (const p of filas) E.perfiles.set(p.id, p);
  }
  return E.perfiles;
}

export const nombreCurso = (b, cursoId) => {
  const c = b.cursoPorId.get(cursoId);
  return c ? c.nombre : '—';
};

// Asignaciones que dicto yo (profesor)
export const misAsignaciones = (b) => b.asignaciones.filter((a) => a.profesor_id === E.yo.id && b.cursos.some((c) => c.id === a.curso_id));

// Estudiantes que puedo ver como acudiente / estudiante
export async function misEstudiantes() {
  if (E.rol === 'estudiante') return [E.yo.id];
  const filas = await E.db.select('acudientes', { eq: { colegio_id: E.colegio.id, acudiente_id: E.yo.id } });
  return filas.map((f) => f.estudiante_id);
}

// Pestañas de persona (como Phidias): el acudiente ve una pestaña propia y una por cada hijo.
export async function cargarPersonas() {
  E.personas = [];
  if (E.rol !== 'acudiente') { E.persona = E.yo.id; return; }
  const ids = await misEstudiantes();
  await perfiles(ids);
  E.personas = [{ id: E.yo.id, familiar: true }, ...ids.map((id) => ({ id }))];
  const guardada = pref('persona_' + E.colegio.id);
  E.persona = E.personas.some((p) => p.id === guardada) ? guardada : E.yo.id;
}
export function elegirPersona(id) {
  E.persona = id;
  pref('persona_' + E.colegio.id, id);
}
// El estudiante cuyo contenido académico se muestra
export function personaActiva() {
  if (E.rol === 'estudiante') return E.yo.id;
  if (E.rol === 'acudiente') return E.persona && E.persona !== E.yo.id ? E.persona : E.personas?.[1]?.id || null;
  return null;
}
export const viendoHijo = () => E.rol === 'acudiente' && E.persona && E.persona !== E.yo.id;

// ---------------------------------------------------------------- Marca del colegio (logo y color)
export function logoUrl() {
  if (!E.colegio?.logo_ruta) return null;
  try { return E.db.urlPublica('logos', E.colegio.logo_ruta); } catch { return null; }
}
const escA = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// HTML del logo: la imagen del colegio o el símbolo de Complex_ (√-1)
export function logoHTML(clase = 'logo-mini') {
  const u = logoUrl();
  return u ? `<img class="${clase} logo-img" src="${escA(u)}" alt="${escA(E.colegio?.nombre || '')}">` : `<img class="${clase} logo-img logo-complex" src="img/simbolo.svg" alt="Complex_">`;
}
// Aplica el color institucional a toda la app (claro y oscuro)
export function aplicarMarca() {
  let st = document.getElementById('estilo-marca');
  const c = E.colegio?.color;
  if (!c || !/^#[0-9a-f]{6}$/i.test(c)) { st?.remove(); return; }
  if (!st) { st = document.createElement('style'); st.id = 'estilo-marca'; document.head.appendChild(st); }
  const claro = `--marca: ${c}; --primario: ${c}; --primario-suave: color-mix(in srgb, ${c} 13%, white);`;
  const oscuro = `--primario: color-mix(in srgb, ${c} 55%, white); --primario-suave: color-mix(in srgb, ${c} 28%, #0f1420);`;
  st.textContent = `:root { ${claro} }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { ${oscuro} } }
:root[data-theme="dark"] { ${oscuro} }`;
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', c);
}
