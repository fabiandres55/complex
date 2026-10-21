// Capa de datos de Complex_.
// Dos implementaciones con la MISMA interfaz:
//   - Supabase (real): la seguridad la pone la RLS.
//   - Demo (en el navegador): datos de ejemplo para probar sin cuentas.
//
// Interfaz:
//   db.auth.session() → { user: {id, email} } | null
//   db.auth.signIn(email, pass) / signUp(email, pass, meta) / signOut() / resetPassword(email)
//   db.select(tabla, { eq, in, order, limit }) → filas
//   db.insert(tabla, filas) → filas
//   db.upsert(tabla, filas, onConflict) → filas
//   db.update(tabla, cambios, eq) → filas
//   db.remove(tabla, eq)
//   db.rpc(nombre, args) → resultado

import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { crearSemillaDemo } from './demo-semilla.js';

// ---------------------------------------------------------------- Supabase
export async function crearDbSupabase() {
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm');
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'complex_auth' },
  });

  const falla = (error) => {
    if (!error) return;
    throw new Error(traducirError(error.message || String(error)));
  };

  const aplicar = (q, { eq, in: en, order, limit } = {}) => {
    for (const [k, v] of Object.entries(eq || {})) q = v === null ? q.is(k, null) : q.eq(k, v);
    for (const [k, v] of Object.entries(en || {})) q = q.in(k, v);
    if (order) {
      for (const o of [].concat(order)) {
        const [col, dir] = o.split(' ');
        q = q.order(col, { ascending: dir !== 'desc' });
      }
    }
    if (limit) q = q.limit(limit);
    return q;
  };

  return {
    modo: 'real',
    auth: {
      async session() {
        const { data } = await sb.auth.getSession();
        const u = data.session?.user;
        return u ? { user: { id: u.id, email: u.email } } : null;
      },
      async signIn(email, pass) {
        const { error } = await sb.auth.signInWithPassword({ email, password: pass });
        falla(error);
      },
      async signUp(email, pass, meta) {
        const { data, error } = await sb.auth.signUp({ email, password: pass, options: { data: meta } });
        falla(error);
        return { necesitaConfirmar: !data.session };
      },
      async signOut() { await sb.auth.signOut(); },
      async resetPassword(email) {
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
        falla(error);
      },
      onChange(cb) { sb.auth.onAuthStateChange(() => cb()); },
    },
    async select(tabla, q = {}) {
      const { data, error } = await aplicar(sb.from(tabla).select('*'), q);
      falla(error);
      return data;
    },
    async insert(tabla, filas) {
      const { data, error } = await sb.from(tabla).insert(filas).select();
      falla(error);
      return data;
    },
    async upsert(tabla, filas, onConflict) {
      const { data, error } = await sb.from(tabla).upsert(filas, { onConflict }).select();
      falla(error);
      return data;
    },
    async update(tabla, cambios, eq) {
      const { data, error } = await aplicar(sb.from(tabla).update(cambios), { eq }).select();
      falla(error);
      return data;
    },
    async remove(tabla, eq) {
      const { error } = await aplicar(sb.from(tabla).delete(), { eq });
      falla(error);
    },
    async rpc(nombre, args) {
      const { data, error } = await sb.rpc(nombre, args);
      falla(error);
      return data;
    },
    async funcion(nombre, cuerpo) {
      const { data, error } = await sb.functions.invoke(nombre, { body: cuerpo });
      if (error) {
        let msg = error.message;
        try { msg = (await error.context.json()).error || msg; } catch {}
        throw new Error(traducirError(msg));
      }
      if (data?.error) throw new Error(data.error);
      return data;
    },
    // Archivos (Storage)
    async subirArchivo(bucket, ruta, archivo) {
      const { error } = await sb.storage.from(bucket).upload(ruta, archivo, { upsert: false, contentType: archivo.type || 'application/octet-stream' });
      falla(error);
    },
    urlPublica(bucket, ruta) { return sb.storage.from(bucket).getPublicUrl(ruta).data.publicUrl; },
    async urlArchivo(bucket, ruta) {
      const { data, error } = await sb.storage.from(bucket).createSignedUrl(ruta, 600);
      falla(error);
      return data.signedUrl;
    },
    async borrarArchivo(bucket, ruta) {
      const { error } = await sb.storage.from(bucket).remove([ruta]);
      falla(error);
    },
  };
}

function traducirError(m) {
  if (/Invalid login credentials/i.test(m)) return 'Correo o contraseña incorrectos.';
  if (/Email not confirmed/i.test(m)) return 'Aún no confirmas tu correo. Revisa tu bandeja de entrada.';
  if (/User already registered/i.test(m)) return 'Ese correo ya tiene cuenta. Inicia sesión.';
  if (/Password should be at least/i.test(m)) return 'La contraseña debe tener al menos 6 caracteres.';
  if (/row-level security/i.test(m)) return 'No tienes permiso para hacer esto.';
  if (/duplicate key/i.test(m)) return 'Ese dato ya existe.';
  if (/violates foreign key/i.test(m)) return 'No se puede: hay otros datos que dependen de este.';
  if (/usuario_no_existe/i.test(m)) return m.replace(/^.*usuario_no_existe:\s*/, '') + '. Pídele que se registre primero.';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'Sin conexión a internet.';
  return m;
}

// ---------------------------------------------------------------- Demo
const CLAVE_DEMO = 'complex_demo_v1';
const CLAVE_DEMO_USUARIO = 'complex_demo_usuario';
const CLAVE_DEMO_ARCHIVOS = 'complex_demo_archivos';
const leerArchivos = () => { try { return JSON.parse(localStorage.getItem(CLAVE_DEMO_ARCHIVOS)) || {}; } catch { return {}; } };

const LLAVES = {
  miembros: ['colegio_id', 'perfil_id', 'rol'],
  acudientes: ['colegio_id', 'acudiente_id', 'estudiante_id'],
  calificaciones: ['actividad_id', 'estudiante_id'],
  circular_lecturas: ['circular_id', 'perfil_id'],
  mensaje_destinatarios: ['mensaje_id', 'perfil_id'],
  tarea_entregas: ['tarea_id', 'estudiante_id'],
  recuperaciones: ['asignacion_id', 'periodo_id', 'estudiante_id'],
  fichas_medicas: ['estudiante_id'],
  examen_claves: ['examen_id'],
  examen_preguntas: ['examen_id'],
  examen_intentos: ['examen_id', 'estudiante_id'],
};

export function crearDbDemo() {
  let t;
  const cargar = () => {
    try { t = JSON.parse(localStorage.getItem(CLAVE_DEMO)); } catch { t = null; }
    if (!t || !t.colegios) { t = crearSemillaDemo(); guardar(); }
  };
  const guardar = () => { try { localStorage.setItem(CLAVE_DEMO, JSON.stringify(t)); } catch {} };
  cargar();

  const usuario = () => { try { return localStorage.getItem(CLAVE_DEMO_USUARIO); } catch { return null; } };
  const tabla = (n) => (t[n] ||= []);
  const coincide = (f, { eq, in: en } = {}) =>
    Object.entries(eq || {}).every(([k, v]) => (f[k] ?? null) === v) &&
    Object.entries(en || {}).every(([k, v]) => v.includes(f[k]));
  const copia = (x) => JSON.parse(JSON.stringify(x));
  const ahora = () => new Date().toISOString();
  const err = (m) => { throw new Error(m); };

  const esAdmin = (colegio) => tabla('miembros').some((m) => m.colegio_id === colegio && m.perfil_id === usuario() && m.rol === 'admin' && m.activo);

  // Valores por defecto (los mismos que pone la base de datos real)
  const hoyLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const siguiente = (n) => 1000 + tabla(n).reduce((s, x) => Math.max(s, (x.numero || 1000) - 1000), 0) + 1;
  const DEF = {
    colegios: () => ({ nota_min: 1, nota_max: 5, nota_aprobacion: 3, decimales: 1 }),
    perfiles: () => ({ nombres: '', apellidos: '' }),
    anios_lectivos: () => ({ activo: false }),
    periodos: () => ({ peso: 33.33, cerrado: false }),
    matriculas: () => ({ estado: 'activa', fecha: hoyLocal() }),
    asistencia: () => ({ estado: 'presente', fecha: hoyLocal() }),
    observaciones: () => ({ fecha: hoyLocal(), visible_acudiente: true, categoria: 'Observador' }),
    planeaciones: () => ({ estado: "enviada" }),
    mensajes: () => ({ cuerpo: '', permite_respuesta: true, ocultar_destinatarios: false, destacado: false, autor_archivado: false, autor_eliminado: false, responde_a: null }),
    mensaje_destinatarios: () => ({ leido_en: null, archivado: false, eliminado: false }),
    tareas: () => ({ descripcion: '', requiere_entrega: true, publicada_en: new Date().toISOString() }),
    tarea_entregas: () => ({ entregada_en: new Date().toISOString(), nota: null, revisada_en: null }),
    eventos: () => ({ todo_el_dia: true, tipo: 'institucional' }),
    conceptos_cobro: () => ({ activo: true, valor_defecto: 0 }),
    indicadores: () => ({ numero: 1, dimension: 'Cognitiva', peso: 0 }),
    recuperaciones: () => ({ fecha: hoyLocal() }),
    menciones: () => ({ tipo: 'Mérito', fecha: hoyLocal() }),
    reportes_ausencia: () => ({ estado: 'recibido', tipo: 'enfermedad' }),
    archivos: () => ({ anio: new Date().getFullYear(), carpeta: 'General' }),
    examenes: () => ({ num_preguntas: 0, resultados_publicados: false, publicado: false, mostrar_resultado: true, abre: new Date().toISOString(), cierra: null, duracion_min: null }),
    examen_intentos: () => ({ respuestas: {}, iniciado_en: new Date().toISOString(), entregado_en: null, pendiente_revision: false, fuera_de_tiempo: false }),
    aula_publicaciones: () => ({ fijada: false, enlace: null }),
    horario_bloques: () => ({ asignacion_id: null, titulo: null, aula: null }),
    procesos: () => ({ pasos: [], roles: ['acudiente'], por_estudiante: true, publicado: false, abre: new Date().toISOString(), cierra: null }),
    proceso_respuestas: () => ({ datos: {}, paso: 0, terminado: false }),
    actividades: () => ({ porcentaje: 0, indicador_id: null }),
    cobros: () => ({ anulado: false, numero: siguiente('cobros') }),
    pagos: () => ({ anulado: false, medio: 'efectivo', fecha: hoyLocal(), numero: siguiente('pagos') }),
    acudientes: () => ({ principal: false, responsable_pagos: false }),
  };

  const completar = (n, f) => {
    const r = { ...(DEF[n]?.() || {}), ...Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined)) };
    if (!LLAVES[n] && !r.id) r.id = crypto.randomUUID();
    if (n === 'miembros') r.activo ??= true;
    if (n === 'calificaciones') {
      const co = tabla('colegios').find((c) => c.id === r.colegio_id);
      if (r.valor != null && co && (r.valor < co.nota_min || r.valor > co.nota_max))
        err(`La nota ${r.valor} está fuera de la escala (${co.nota_min} a ${co.nota_max})`);
      const act = tabla('actividades').find((a) => a.id === r.actividad_id);
      const per = act && tabla('periodos').find((p) => p.id === act.periodo_id);
      if (per?.cerrado && !esAdmin(r.colegio_id)) err('El periodo está cerrado; solo el administrador puede cambiar notas');
      r.actualizado_en = ahora();
    }
    if (['colegios', 'perfiles', 'miembros', 'observaciones', 'circulares', 'planeaciones', 'mensajes', 'tareas', 'eventos', 'cobros', 'pagos', 'menciones', 'reportes_ausencia', 'archivos', 'procesos', 'aula_publicaciones'].includes(n)) r.creado_en ??= ahora();
    if (n === 'circular_lecturas') r.leida_en ??= ahora();
    if (n === 'circulares' && r.publicada_en && !r.numero) r.numero = 1 + tabla(n).filter((x) => x.colegio_id === r.colegio_id).reduce((s, x) => Math.max(s, x.numero || 0), 0);
    if (n === 'proceso_respuestas') { r.actualizado_en = ahora(); const antes = tabla(n).find((x) => x.id === r.id); if (r.terminado && !antes?.terminado) r.terminado_en = ahora(); }
    if (n === 'recuperaciones') {
      const co = tabla('colegios').find((c) => c.id === r.colegio_id);
      if (co && (r.nota < co.nota_min || r.nota > co.nota_max)) err(`La nota ${r.nota} está fuera de la escala (${co.nota_min} a ${co.nota_max})`);
      const per = tabla('periodos').find((p) => p.id === r.periodo_id);
      if (per?.cerrado && !esAdmin(r.colegio_id)) err('El periodo está cerrado; solo el administrador puede registrar recuperaciones');
    }
    if (n === 'planeaciones') {
      r.actualizado_en = ahora();
      const antes = tabla(n).find((x) => x.id === r.id);
      if (antes && antes.estado !== r.estado && ['aprobada', 'devuelta'].includes(r.estado)) { r.revisado_por = usuario(); r.revisado_en = ahora(); }
    }
    return r;
  };

  const ordenar = (filas, order) => {
    for (const o of [].concat(order || []).reverse()) {
      const [col, dir] = o.split(' ');
      const s = dir === 'desc' ? -1 : 1;
      filas.sort((a, b) => ((a[col] ?? '') > (b[col] ?? '') ? s : (a[col] ?? '') < (b[col] ?? '') ? -s : 0));
    }
    return filas;
  };

  // Mismas reglas que public.mis_contactos() en la base de datos
  function contactosDemo(col, yo) {
    const M = tabla('miembros').filter((m) => m.colegio_id === col && m.activo);
    const roles = new Set(M.filter((m) => m.perfil_id === yo).map((m) => m.rol));
    const P = new Map(tabla('perfiles').map((p) => [p.id, p]));
    const cursos = tabla('cursos').filter((c) => c.colegio_id === col);
    const nomCurso = (id) => cursos.find((c) => c.id === id)?.nombre || '';
    const asig = tabla('asignaciones').filter((a) => a.colegio_id === col);
    const mats = tabla('matriculas').filter((m) => m.colegio_id === col && m.estado === 'activa');
    const acu = tabla('acudientes').filter((a) => a.colegio_id === col);
    const out = [];
    const add = (id, grupo, detalle = '') => id && id !== yo && out.push({ perfil_id: id, grupo, detalle });
    if (roles.size) M.filter((m) => m.rol === 'admin').forEach((m) => add(m.perfil_id, 'Administración', 'Administrador'));
    if (roles.has('admin')) M.filter((m) => m.rol !== 'admin').forEach((m) => add(m.perfil_id, { profesor: 'Profesores', acudiente: 'Acudientes', estudiante: 'Estudiantes' }[m.rol]));
    if (roles.has('profesor')) {
      M.filter((m) => m.rol === 'profesor').forEach((m) => add(m.perfil_id, 'Profesores'));
      const mios = new Set([...asig.filter((a) => a.profesor_id === yo).map((a) => a.curso_id), ...cursos.filter((c) => c.director_id === yo).map((c) => c.id)]);
      for (const mt of mats.filter((x) => mios.has(x.curso_id))) {
        add(mt.estudiante_id, 'Curso ' + nomCurso(mt.curso_id), 'Estudiante');
        acu.filter((a) => a.estudiante_id === mt.estudiante_id).forEach((a) => add(a.acudiente_id, 'Curso ' + nomCurso(mt.curso_id), 'Acudiente de ' + (P.get(mt.estudiante_id)?.nombres || '')));
      }
    }
    if (roles.has('acudiente') || roles.has('estudiante')) {
      const ests = new Set([...acu.filter((a) => a.acudiente_id === yo).map((a) => a.estudiante_id), yo]);
      for (const mt of mats.filter((x) => ests.has(x.estudiante_id))) {
        const g = (P.get(mt.estudiante_id)?.nombres || 'Estudiante') + ' · ' + nomCurso(mt.curso_id);
        asig.filter((a) => a.curso_id === mt.curso_id && a.profesor_id).forEach((a) => add(a.profesor_id, g, tabla('materias').find((x) => x.id === a.materia_id)?.nombre || ''));
        const dir = cursos.find((c) => c.id === mt.curso_id)?.director_id;
        add(dir, g, 'Director(a) de curso');
      }
      acu.filter((a) => a.estudiante_id === yo).forEach((a) => add(a.acudiente_id, 'Mi familia', a.parentesco || 'Acudiente'));
    }
    const vistos = new Set();
    return out.filter((c) => !vistos.has(c.perfil_id + c.grupo) && vistos.add(c.perfil_id + c.grupo))
      .map((c) => ({ ...c, nombres: P.get(c.perfil_id)?.nombres || '', apellidos: P.get(c.perfil_id)?.apellidos || '' }));
  }

  const db = {
    modo: 'demo',
    auth: {
      async session() {
        const id = usuario();
        const p = id && tabla('perfiles').find((x) => x.id === id);
        return p ? { user: { id: p.id, email: p.correo } } : null;
      },
      async signIn(idDemo) { localStorage.setItem(CLAVE_DEMO_USUARIO, idDemo); },
      async signUp() { err('En el modo demo no se crean cuentas.'); },
      async signOut() { localStorage.removeItem(CLAVE_DEMO_USUARIO); },
      async resetPassword() {},
      onChange() {},
    },
    usuariosDemo() {
      return tabla('perfiles').map((p) => ({
        ...p,
        roles: tabla('miembros').filter((m) => m.perfil_id === p.id).map((m) => m.rol),
      }));
    },
    reiniciarDemo() { t = crearSemillaDemo(); guardar(); },
    async select(n, q = {}) {
      let filas = tabla(n).filter((f) => coincide(f, q));
      filas = ordenar(copia(filas), q.order);
      return q.limit ? filas.slice(0, q.limit) : filas;
    },
    async insert(n, filas) {
      const out = [];
      for (const f of [].concat(filas)) {
        const r = completar(n, f);
        const k = LLAVES[n];
        if (k && tabla(n).some((x) => k.every((c) => x[c] === r[c]))) err('Ese dato ya existe.');
        tabla(n).push(r);
        out.push(copia(r));
      }
      guardar();
      return out;
    },
    async upsert(n, filas, onConflict) {
      const k = onConflict ? onConflict.split(',').map((s) => s.trim()) : LLAVES[n] || ['id'];
      const out = [];
      for (const f of [].concat(filas)) {
        const i = tabla(n).findIndex((x) => k.every((c) => x[c] === f[c]));
        const r = completar(n, i >= 0 ? { ...tabla(n)[i], ...f } : f);
        if (i >= 0) tabla(n)[i] = r; else tabla(n).push(r);
        out.push(copia(r));
      }
      guardar();
      return out;
    },
    async update(n, cambios, eq) {
      const out = [];
      tabla(n).forEach((f, i) => {
        if (coincide(f, { eq })) { tabla(n)[i] = completar(n, { ...f, ...cambios }); out.push(copia(tabla(n)[i])); }
      });
      guardar();
      return out;
    },
    async remove(n, eq) {
      t[n] = tabla(n).filter((f) => !coincide(f, { eq }));
      if (n === 'colegios') {
        for (const k of Object.keys(t)) if (k !== 'perfiles' && k !== 'colegios') t[k] = t[k].filter((f) => f.colegio_id !== eq.id);
      }
      guardar();
    },
    async rpc(nombre, a) {
      const yo = usuario();
      if (nombre === 'crear_colegio') {
        const [c] = await db.insert('colegios', [{ nombre: a.p_nombre, ciudad: a.p_ciudad ?? null, nota_min: 1, nota_max: 5, nota_aprobacion: 3, decimales: 1 }]);
        await db.insert('miembros', [{ colegio_id: c.id, perfil_id: yo, rol: 'admin' }]);
        return c.id;
      }
      if (nombre === 'agregar_miembro') {
        if (!esAdmin(a.p_colegio)) err('Solo el administrador puede agregar personas');
        const correo = a.p_correo.trim().toLowerCase();
        let p = tabla('perfiles').find((x) => x.correo === correo);
        if (!p) {
          // En el demo la persona "se registra sola" para poder seguir probando.
          [p] = await db.insert('perfiles', [{ correo, nombres: a.p_nombres || correo.split('@')[0], apellidos: a.p_apellidos || '' }]);
        }
        await db.upsert('miembros', [{ colegio_id: a.p_colegio, perfil_id: p.id, rol: a.p_rol, activo: true }], 'colegio_id,perfil_id,rol');
        return p.id;
      }
      if (nombre === 'personas_colegio') {
        if (!esAdmin(a.p_colegio)) return [];
        return tabla('miembros').filter((m) => m.colegio_id === a.p_colegio).map((m) => {
          const p = tabla('perfiles').find((x) => x.id === m.perfil_id) || {};
          return { perfil_id: m.perfil_id, correo: p.correo, nombres: p.nombres, apellidos: p.apellidos, rol: m.rol, activo: m.activo };
        }).sort((x, y) => (x.apellidos + x.nombres).localeCompare(y.apellidos + y.nombres));
      }
      if (nombre === 'mis_contactos') return contactosDemo(a.p_colegio, yo);
      // Exámenes: mismas reglas que iniciar_examen / entregar_examen en el servidor
      if (nombre === 'mi_intento') { const it = tabla('examen_intentos').find((x) => x.examen_id === a.p_examen && x.estudiante_id === yo); return it ? { iniciado_en: it.iniciado_en, entregado_en: it.entregado_en, ahora: new Date().toISOString() } : null; }
      if (nombre === 'iniciar_examen' || nombre === 'entregar_examen') {
        const ex = tabla('examenes').find((x) => x.id === a.p_examen);
        const asig = ex && tabla('asignaciones').find((x) => x.id === ex.asignacion_id);
        const alumno = asig && tabla('matriculas').some((x) => x.curso_id === asig.curso_id && x.estudiante_id === yo && x.estado === 'activa');
        if (!alumno) err('Este examen no es tuyo');
        let it = tabla('examen_intentos').find((x) => x.examen_id === ex.id && x.estudiante_id === yo);
        if (nombre === 'iniciar_examen') {
          const ab = ex.publicado && new Date(ex.abre) <= new Date() && (!ex.cierra || new Date(ex.cierra) > new Date());
          if (!ab) err('Este examen no está disponible');
          if (!it) [it] = await db.insert('examen_intentos', [{ examen_id: ex.id, colegio_id: ex.colegio_id, estudiante_id: yo }]);
          const lims = [ex.duracion_min ? new Date(new Date(it.iniciado_en).getTime() + ex.duracion_min * 60000).toISOString() : null, ex.cierra].filter(Boolean).sort();
          return { iniciado_en: it.iniciado_en, ahora: new Date().toISOString(), limite: lims[0] || null, preguntas: tabla('examen_preguntas').find((x) => x.examen_id === ex.id)?.preguntas || [] };
        }
        if (!it) err('Primero debes iniciar el examen');
        if (it.entregado_en) err('Ya entregaste este examen');
        const cl = tabla('examen_claves').find((x) => x.examen_id === ex.id)?.claves || {};
        let total = 0, ok = 0, abiertas = false; const det = {};
        if (!ex.publicado) err('Este examen no es tuyo');
        const tarde = (ex.cierra && Date.now() > new Date(ex.cierra).getTime() + 120000) || (ex.duracion_min && Date.now() > new Date(it.iniciado_en).getTime() + (ex.duracion_min + 2) * 60000);
        for (const q of tabla('examen_preguntas').find((x) => x.examen_id === ex.id)?.preguntas || []) {
          const pts = Number(q.puntos ?? 1); total += pts;
          const r = a.p_respuestas[q.id];
          if (q.tipo === 'abierta') { abiertas = true; det[q.id] = null; }
          else if (r != null && String(r) === String(cl[q.id])) { ok += pts; det[q.id] = true; }
          else det[q.id] = false;
        }
        const co = tabla('colegios').find((x) => x.id === ex.colegio_id);
        const nota = total ? Math.round((co.nota_min + (co.nota_max - co.nota_min) * ok / total) * 100) / 100 : null;
        await db.update('examen_intentos', { respuestas: a.p_respuestas, entregado_en: new Date().toISOString(), puntaje: ok, puntaje_max: total, nota, detalle: det, pendiente_revision: abiertas, fuera_de_tiempo: !!tarde }, { examen_id: ex.id, estudiante_id: yo });
        return ex.mostrar_resultado ? { nota, puntaje: ok, puntaje_max: total, pendiente_revision: abiertas, detalle: det } : { entregado: true, pendiente_revision: abiertas };
      }
      err('Función desconocida: ' + nombre);
    },
    // Imita la Edge Function admin-usuarios
    async funcion(nombre, a) {
      if (nombre !== 'admin-usuarios') err('Función desconocida');
      if (!esAdmin(a.colegio_id)) err('Solo el administrador del colegio puede hacer esto');
      const clave = () => Math.random().toString(36).slice(2, 6).replace(/^./, (c) => c.toUpperCase()) + String(1000 + Math.floor(Math.random() * 9000));
      if (a.accion === 'clave') { const p = tabla('perfiles').find((x) => x.id === a.perfil_id); return { usuario: p?.correo, clave: clave() }; }
      const resultados = [];
      for (const p of a.personas || []) {
        try {
          if (!['admin', 'profesor', 'acudiente', 'estudiante'].includes(p.rol)) err('Rol no válido');
          if (!p.nombres) err('Falta el nombre');
          const doc = String(p.documento || '').replace(/[^\dA-Za-z]/g, '');
          const correo = String(p.correo || '').trim().toLowerCase();
          if (!correo && !doc) err('Necesita correo o número de documento');
          const usuario = correo || doc.toLowerCase() + '@usuarios.complex';
          let per = tabla('perfiles').find((x) => x.correo === usuario), cl = null;
          if (!per) { cl = clave(); [per] = await db.insert('perfiles', [{ correo: usuario, nombres: p.nombres, apellidos: p.apellidos || '', numero_documento: doc || null, tipo_documento: p.tipo_documento || null, telefono: p.telefono || null }]); }
          await db.upsert('miembros', [{ colegio_id: a.colegio_id, perfil_id: per.id, rol: p.rol, activo: true }], 'colegio_id,perfil_id,rol');
          resultados.push({ ok: true, usuario, clave: cl, perfil_id: per.id, ya_existia: !cl, nombres: p.nombres, apellidos: p.apellidos, rol: p.rol });
        } catch (e) { resultados.push({ ok: false, error: e.message, nombres: p.nombres, apellidos: p.apellidos }); }
      }
      return { resultados };
    },
    // Archivos: en el demo se guardan en el navegador (máx. ~2 MB cada uno)
    async subirArchivo(bucket, ruta, archivo) {
      if (archivo.size > 2 * 1024 * 1024) err('En el modo demo los archivos pueden pesar máximo 2 MB.');
      const url = await new Promise((ok, mal) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = mal; r.readAsDataURL(archivo); });
      const a = leerArchivos();
      a[bucket + '/' + ruta] = url;
      try { localStorage.setItem(CLAVE_DEMO_ARCHIVOS, JSON.stringify(a)); } catch { err('No hay espacio en este navegador para el archivo (modo demo).'); }
    },
    urlPublica(bucket, ruta) { return leerArchivos()[bucket + '/' + ruta] || null; },
    async urlArchivo(bucket, ruta) {
      const url = leerArchivos()[bucket + '/' + ruta];
      if (!url) err('Archivo no encontrado');
      return url;
    },
    async borrarArchivo(bucket, ruta) {
      const a = leerArchivos();
      delete a[bucket + '/' + ruta];
      try { localStorage.setItem(CLAVE_DEMO_ARCHIVOS, JSON.stringify(a)); } catch {}
    },
  };
  return db;
}
