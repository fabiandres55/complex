// Datos de ejemplo del modo demo: un colegio ficticio completo.
// Todo es inventado; se regenera con "Reiniciar demo".

export function crearSemillaDemo() {
  let n = 0;
  const id = (p) => `${p}-${String(++n).padStart(4, '0')}`;
  // generador pseudoaleatorio fijo → el demo siempre se ve igual
  let s = 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const ahora = new Date();
  // fecha LOCAL (no UTC: en Colombia después de las 7 p. m. toISOString ya da el día siguiente)
  const dia = (d) => { const x = new Date(ahora); x.setDate(x.getDate() + d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };

  const t = {
    colegios: [], perfiles: [], miembros: [], sedes: [], anios_lectivos: [], periodos: [], grados: [],
    cursos: [], materias: [], asignaciones: [], matriculas: [], acudientes: [], actividades: [],
    calificaciones: [], asistencia: [], observaciones: [], circulares: [], circular_lecturas: [],
  };

  const col = { id: id('col'), nombre: 'Colegio Demo San José', nit: '900.000.000-1', ciudad: 'Ibagué', nota_min: 1, nota_max: 5, nota_aprobacion: 3, decimales: 1, creado_en: ahora.toISOString() };
  t.colegios.push(col);
  const c = col.id;

  const persona = (nombres, apellidos, rol, extra = {}) => {
    const p = { id: id('per'), nombres, apellidos, correo: `${nombres.split(' ')[0]}.${apellidos.split(' ')[0]}@demo.complex`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''), tipo_documento: rol === 'estudiante' ? 'TI' : 'CC', numero_documento: String(1000000 + n * 137), telefono: rol === 'estudiante' ? null : '300 000 ' + String(1000 + n).slice(-4), creado_en: ahora.toISOString(), ...extra };
    t.perfiles.push(p);
    t.miembros.push({ colegio_id: c, perfil_id: p.id, rol, activo: true, creado_en: ahora.toISOString() });
    return p;
  };

  const rectora = persona('Marta', 'Gómez Rojas', 'admin');
  const profes = [
    persona('Carlos', 'Ramírez Díaz', 'profesor'),
    persona('Luisa', 'Fernández Ortiz', 'profesor'),
    persona('Jorge', 'Castaño Vélez', 'profesor'),
  ];

  const sede = { id: id('sed'), colegio_id: c, nombre: 'Sede Principal', direccion: 'Calle 10 # 5-20' };
  t.sedes.push(sede);
  const anio = { id: id('ani'), colegio_id: c, anio: ahora.getFullYear(), fecha_inicio: `${ahora.getFullYear()}-01-20`, fecha_fin: `${ahora.getFullYear()}-11-28`, activo: true };
  t.anios_lectivos.push(anio);
  const periodos = [1, 2, 3].map((k) => ({ id: id('pdo'), colegio_id: c, anio_lectivo_id: anio.id, numero: k, nombre: `Periodo ${k}`, fecha_inicio: null, fecha_fin: null, peso: 33.33, cerrado: k === 1 }));
  t.periodos.push(...periodos);
  // Tipos de asistencia (como un colegio en Phidias)
  t.tipos_asistencia = [['Presente con uniforme', 'presente'], ['Presente sin uniforme', 'presente'], ['Ausencia injustificada', 'ausente'], ['Ausencia justificada', 'excusa'], ['Retardo injustificado', 'tarde'], ['Retardo justificado', 'tarde'], ['Salida temprano', 'excusa'], ['Reunión - asiste madre', 'presente'], ['Reunión - asiste padre', 'presente'], ['Ausente - reunión de padres', 'ausente']]
    .map(([nombre, categoria], i) => ({ id: `tas-${String(i + 1).padStart(2, '0')}`, colegio_id: c, nombre, categoria, orden: i + 1, activo: true })); // ids propios: no corren el contador
  // Tipos de mensaje (como Phidias: Circulares con consecutivo, Notificaciones, Seguimientos…)
  t.tipos_mensaje = [['Circulares', '#c0392b', ['admin'], false, true, 1], ['Mensajes', '#1f4fd1', null, true, false, 0], ['Notificaciones', '#d97706', ['admin', 'profesor'], true, false, 0], ['Seguimientos', '#0f9d58', ['admin', 'profesor'], true, false, 0], ['Transporte y permisos', '#7a3fd1', null, true, false, 0]]
    .map(([nombre, color, roles, permite_respuesta, numerar, consecutivo], i) => ({ id: `tms-0${i + 1}`, colegio_id: c, nombre, color, roles, permite_respuesta, numerar, consecutivo, orden: i + 1, activo: true }));
  // Fechas importantes (como Phidias): periodo 2 abierto ahora; periodo 3 abre en un mes; remediales sin fechas
  Object.assign(periodos[1], { notas_desde: dia(-50), notas_hasta: dia(25), obs_desde: dia(-50), obs_hasta: dia(25), plan_desde: dia(-50), plan_hasta: dia(25), recup_desde: dia(26), recup_hasta: dia(35) });
  Object.assign(periodos[2], { notas_desde: dia(30), notas_hasta: dia(100), obs_desde: dia(30), obs_hasta: dia(100), plan_desde: dia(20), plan_hasta: dia(100), recup_desde: dia(101), recup_hasta: dia(110) });

  const grados = [['Sexto', 6], ['Séptimo', 7]].map(([nombre, orden]) => ({ id: id('gra'), colegio_id: c, nombre, orden }));
  t.grados.push(...grados);
  const cursos = [
    { id: id('cur'), colegio_id: c, sede_id: sede.id, anio_lectivo_id: anio.id, grado_id: grados[0].id, nombre: '6A', director_id: profes[0].id },
    { id: id('cur'), colegio_id: c, sede_id: sede.id, anio_lectivo_id: anio.id, grado_id: grados[1].id, nombre: '7A', director_id: profes[1].id },
  ];
  t.cursos.push(...cursos);

  const materias = [['Matemáticas', 'Ciencias exactas'], ['Lengua Castellana', 'Humanidades'], ['Ciencias Naturales', 'Ciencias'], ['Inglés', 'Humanidades'], ['Educación Física', 'Deportes']]
    .map(([nombre, area]) => ({ id: id('mat'), colegio_id: c, nombre, area }));
  t.materias.push(...materias);

  const profeDe = [0, 1, 2, 1, 2];
  const asignaciones = [];
  for (const cu of cursos) for (const [i, m] of materias.entries()) {
    const a = { id: id('asg'), colegio_id: c, curso_id: cu.id, materia_id: m.id, profesor_id: profes[profeDe[i]].id, intensidad_horaria: [5, 4, 4, 3, 2][i] };
    asignaciones.push(a);
  }
  t.asignaciones.push(...asignaciones);

  const nombres6 = [['Valentina', 'Pérez Lozano'], ['Santiago', 'Rodríguez Gil'], ['Mariana', 'López Castro'], ['Samuel', 'Martínez Ruiz'], ['Isabella', 'Torres Mejía'], ['Matías', 'Herrera Arias']];
  const nombres7 = [['Sofía', 'Moreno Silva'], ['Juan José', 'Vargas León'], ['Daniela', 'Rojas Patiño'], ['Tomás', 'Cárdenas Ríos'], ['Gabriela', 'Ospina Mora'], ['Emiliano', 'Suárez Bernal']];
  const estudiantes = [];
  for (const [cu, lista] of [[cursos[0], nombres6], [cursos[1], nombres7]]) {
    for (const [nom, ape] of lista) {
      const e = persona(nom, ape, 'estudiante');
      estudiantes.push({ e, cu });
      t.matriculas.push({ id: id('mtr'), colegio_id: c, curso_id: cu.id, estudiante_id: e.id, estado: 'activa', fecha: anio.fecha_inicio });
    }
  }

  // Acudientes: los primeros 2 de cada curso tienen acudiente; uno tiene dos hijos (6A y 7A)
  const acu1 = persona('Andrea', 'Lozano Peña', 'acudiente');
  const acu2 = persona('Ricardo', 'Gil Barrera', 'acudiente');
  const acu3 = persona('Patricia', 'Silva Mora', 'acudiente');
  const ac = (a, e, parentesco) => t.acudientes.push({ colegio_id: c, acudiente_id: a.id, estudiante_id: e.id, parentesco, principal: true, responsable_pagos: true });
  ac(acu1, estudiantes[0].e, 'Madre');
  ac(acu2, estudiantes[1].e, 'Padre');
  ac(acu3, estudiantes[6].e, 'Madre');
  ac(acu1, estudiantes[8].e, 'Tía'); // Andrea también es acudiente de Daniela (7A)

  // Actividades y notas: periodo 1 completo, periodo 2 a medias
  for (const a of asignaciones) {
    const plan = [[periodos[0], [['Taller 1', 30], ['Quiz', 30], ['Evaluación final', 40]]], [periodos[1], [['Taller 1', 40], ['Quiz', 20]]]];
    for (const [per, acts] of plan) {
      for (const [k, [nombre, pct]] of acts.entries()) {
        const act = { id: id('act'), colegio_id: c, asignacion_id: a.id, periodo_id: per.id, nombre, porcentaje: pct, fecha: dia(per.numero === 1 ? -80 + k * 10 : -20 + k * 7) };
        t.actividades.push(act);
        for (const { e, cu } of estudiantes) {
          if (cu.id !== a.curso_id) continue;
          const base = 2.6 + rnd() * 2.4;
          t.calificaciones.push({ colegio_id: c, actividad_id: act.id, estudiante_id: e.id, valor: Math.round(Math.min(5, Math.max(1, base)) * 10) / 10, comentario: null, actualizado_en: act.fecha + 'T15:00:00' });
        }
      }
    }
  }

  // Asistencia de los últimos días en Matemáticas
  for (const a of asignaciones.filter((x) => x.materia_id === materias[0].id)) {
    for (let d = -6; d <= -1; d++) {
      for (const { e, cu } of estudiantes) {
        if (cu.id !== a.curso_id) continue;
        const r = rnd();
        t.asistencia.push({ id: id('asi'), colegio_id: c, asignacion_id: a.id, estudiante_id: e.id, fecha: dia(d), estado: r < 0.85 ? 'presente' : r < 0.93 ? 'tarde' : r < 0.97 ? 'ausente' : 'excusa', nota: null, registrado_por: a.profesor_id });
      }
    }
  }

  // Observador
  const obs = (e, autor, tipo, descripcion, visible = true, d = -10) =>
    t.observaciones.push({ id: id('obs'), colegio_id: c, estudiante_id: e.id, autor_id: autor.id, fecha: dia(d), tipo, descripcion, visible_acudiente: visible, creado_en: dia(d) + 'T10:00:00' });
  obs(estudiantes[0].e, profes[0], 'positiva', 'Excelente participación en clase y liderazgo en el trabajo en grupo.');
  obs(estudiantes[1].e, profes[0], 'negativa', 'No presentó el taller de Matemáticas. Se habló con el estudiante.', true, -5);
  obs(estudiantes[1].e, profes[0], 'compromiso', 'Se compromete a entregar las tareas a tiempo y a pedir ayuda cuando no entienda.', true, -4);
  obs(estudiantes[6].e, profes[1], 'seguimiento', 'Seguimiento interno: revisar con orientación escolar.', false, -3);
  t.observaciones.forEach((o) => (o.categoria = 'Observador'));
  t.observaciones.at(-1).categoria = 'Psicología';
  obs(estudiantes[0].e, rectora, 'seguimiento', 'Visita a enfermería: dolor de cabeza. Se le dio agua y descansó 20 minutos. Regresó a clase.', true, -2);
  t.observaciones.at(-1).categoria = 'Enfermería';

  // Circulares
  const circ = (titulo, cuerpo, extra = {}, d = -2) =>
    t.circulares.push({ id: id('cir'), colegio_id: c, autor_id: rectora.id, titulo, cuerpo, sede_id: null, grado_id: null, curso_id: null, roles: null, publicada_en: new Date(Date.now() + d * 864e5).toISOString(), creado_en: ahora.toISOString(), ...extra });
  circ('Bienvenidos a Complex_', 'Queridas familias: desde hoy pueden consultar notas, asistencia y circulares desde Complex_. Cualquier duda, escríbannos a secretaría.', {}, -15);
  circ('Entrega de boletines del Periodo 1', 'La entrega de boletines será el viernes a las 7:00 a. m. en el salón de cada curso. Es obligatoria la asistencia del acudiente.', { roles: ['acudiente', 'estudiante'] }, -6);
  circ('Salida pedagógica 7A', 'El curso 7A visitará el Jardín Botánico. Deben traer la autorización firmada y refrigerio.', { curso_id: cursos[1].id }, -1);
  circ('Reunión de profesores', 'Reunión general el miércoles a las 2:00 p. m. en la sala de profesores.', { roles: ['profesor'] }, -1);
  t.circulares.forEach((x, i) => (x.numero = i + 1));
  t.circulares.push({ id: id('cir'), colegio_id: c, autor_id: rectora.id, titulo: 'Jornada deportiva (borrador)', cuerpo: 'Pendiente confirmar fecha.', sede_id: null, grado_id: null, curso_id: null, roles: null, publicada_en: null, creado_en: ahora.toISOString() });

  // Planeaciones de ejemplo (sin archivo adjunto en la semilla)
  t.planeaciones = [];
  const plan = (a, per, titulo, estado, comentario = null, d = -3) => t.planeaciones.push({
    id: id('pla'), colegio_id: c, asignacion_id: a.id, periodo_id: per.id, profesor_id: a.profesor_id, titulo, descripcion: 'Objetivos, actividades y evaluación de la semana.',
    semana_inicio: dia(d - 4), semana_fin: dia(d), archivo_ruta: null, archivo_nombre: null, archivo_tipo: null, archivo_bytes: null,
    estado, comentario, revisado_por: estado === 'enviada' ? null : rectora.id, revisado_en: estado === 'enviada' ? null : ahora.toISOString(),
    creado_en: new Date(Date.now() + d * 864e5).toISOString(), actualizado_en: ahora.toISOString(),
  });
  plan(asignaciones[0], periodos[1], 'Semana 10 — Fracciones equivalentes', 'aprobada', 'Muy completa.', -14);
  plan(asignaciones[0], periodos[1], 'Semana 11 — Suma de fracciones', 'devuelta', 'Falta la rúbrica de evaluación.', -7);
  plan(asignaciones[5], periodos[1], 'Semana 12 — Ecuaciones lineales (7A)', 'enviada', null, -1);
  plan(asignaciones[1], periodos[1], 'Plan lector: cuento latinoamericano', 'enviada', null, -2);

  // Mensajería
  t.mensajes = []; t.mensaje_destinatarios = []; t.mensaje_adjuntos = [];
  const cuando = (d, h = 9) => { const x = new Date(ahora); x.setDate(x.getDate() + d); x.setHours(h, 15, 0, 0); return x.toISOString(); };
  const msj = (autor, para, asunto, cuerpo, extra = {}, d = -1, leidos = []) => {
    const m = { id: id('msj'), colegio_id: c, autor_id: autor.id, asunto, cuerpo, responde_a: null, permite_respuesta: true, ocultar_destinatarios: false, destacado: false, autor_archivado: false, autor_eliminado: false, creado_en: cuando(d), ...extra };
    t.mensajes.push(m);
    for (const p of para) t.mensaje_destinatarios.push({ mensaje_id: m.id, colegio_id: c, perfil_id: p.id, leido_en: leidos.includes(p) ? cuando(d, 11) : null, archivado: false, eliminado: false });
    return m;
  };
  const valentina = estudiantes[0].e, santiago = estudiantes[1].e;
  const m1 = msj(acu1, [profes[0]], 'Pregunta sobre el taller de fracciones', 'Buenas tardes profe Carlos. Valentina no entendió el punto 4 del taller. ¿Podría explicarlo de nuevo en clase? Gracias.', { tipo_id: 'tms-02' }, -3, [profes[0]]);
  msj(profes[0], [acu1], 'Re: Pregunta sobre el taller de fracciones', 'Con gusto, mañana lo repasamos al inicio de la clase. Cordial saludo.', { responde_a: m1.id, tipo_id: 'tms-02' }, -2);
  msj(profes[0], [acu2], 'Taller pendiente de Santiago', 'Señor Ricardo: Santiago no ha entregado el taller de Matemáticas. Tiene plazo hasta el viernes.', { permite_respuesta: true, tipo_id: 'tms-04' }, -1);
  msj(rectora, [...profes, acu1, acu2, acu3], 'Jornada pedagógica — no hay clases el lunes', 'Les recordamos que el lunes es jornada pedagógica. Los estudiantes no tienen clase.', { destacado: true, ocultar_destinatarios: true, permite_respuesta: false, tipo_id: 'tms-01', numero: 1 }, -4, [profes[0], acu1]);
  msj(rectora, [profes[0], profes[1], profes[2]], 'Entrega de planeaciones', 'Profes, recuerden subir las planeaciones de la semana en el módulo Planeaciones antes del viernes.', { tipo_id: 'tms-03' }, -1, [profes[1]]);

  // Tareas (en Matemáticas de 6A y 7A, y Lengua de 6A)
  t.tareas = []; t.tarea_entregas = [];
  const tarea = (a, titulo, descripcion, dEntrega, extra = {}) => {
    const x = { id: id('tar'), colegio_id: c, asignacion_id: a.id, periodo_id: periodos[1].id, titulo, descripcion, enlace: null, publicada_en: cuando(dEntrega - 7, 7), entrega_en: dEntrega == null ? null : cuando(dEntrega, 23), requiere_entrega: dEntrega != null, creado_por: a.profesor_id, creado_en: cuando(dEntrega - 7, 7), ...extra };
    t.tareas.push(x);
    return x;
  };
  const t1 = tarea(asignaciones[0], 'Taller de fracciones equivalentes', 'Resolver los ejercicios 1 al 10 de la página 45 del libro. Mostrar el procedimiento.', 2);
  tarea(asignaciones[0], 'Lectura: historia de los números', 'Leer el documento y traer 3 preguntas para la clase.', null, { requiere_entrega: false, publicada_en: cuando(-3, 7) });
  const t3 = tarea(asignaciones[1], 'Cuento corto', 'Escribir un cuento de una página con inicio, nudo y desenlace.', -1);
  tarea(asignaciones[5], 'Guía de ecuaciones', 'Resolver la guía de ecuaciones lineales.', 4);
  for (const { e, cu } of estudiantes) {
    if (cu.id === cursos[0].id && rnd() < 0.6) t.tarea_entregas.push({ tarea_id: t3.id, colegio_id: c, estudiante_id: e.id, texto: 'Adjunto mi cuento.', archivo_ruta: null, archivo_nombre: null, archivo_bytes: null, entregada_en: cuando(-2, 20), nota: e === valentina ? 4.6 : null, comentario: e === valentina ? '¡Muy creativo!' : null, revisada_en: e === valentina ? cuando(-1, 10) : null });
  }
  t.tarea_entregas.push({ tarea_id: t1.id, colegio_id: c, estudiante_id: valentina.id, texto: 'Ya resolví los 10 ejercicios.', archivo_ruta: null, archivo_nombre: null, archivo_bytes: null, entregada_en: cuando(-1, 19), nota: null, comentario: null, revisada_en: null });

  // Calendario
  t.eventos = [];
  const evento = (titulo, d, tipo, extra = {}) => t.eventos.push({ id: id('eve'), colegio_id: c, titulo, descripcion: null, inicio: cuando(d, 8), fin: null, todo_el_dia: true, tipo, curso_id: null, creado_por: rectora.id, creado_en: ahora.toISOString(), ...extra });
  evento('Izada de bandera', 1, 'cultural');
  evento('Jornada pedagógica (no hay clases)', 6, 'festivo');
  evento('Reunión de padres 6A', 3, 'reunion', { curso_id: cursos[0].id, todo_el_dia: false });
  evento('Evaluaciones bimestrales', 12, 'evaluacion');
  evento('Torneo intercursos de fútbol', 9, 'deportivo');
  evento('Entrega de boletines', -6, 'reunion');

  // Indicadores (logros) en Matemáticas 6A, periodo 2 — como trabaja Phidias
  t.indicadores = []; t.recuperaciones = []; t.menciones = [];
  const actsM = t.actividades.filter((x) => x.asignacion_id === asignaciones[0].id && x.periodo_id === periodos[1].id);
  const ind1 = { id: id('ind'), colegio_id: c, asignacion_id: asignaciones[0].id, periodo_id: periodos[1].id, numero: 1, descripcion: 'Reconoce y representa fracciones equivalentes en diferentes contextos.', dimension: 'Cognitiva', peso: 60 };
  const ind2 = { id: id('ind'), colegio_id: c, asignacion_id: asignaciones[0].id, periodo_id: periodos[1].id, numero: 2, descripcion: 'Resuelve problemas cotidianos usando operaciones con fracciones.', dimension: 'Procedimental', peso: 40 };
  t.indicadores.push(ind1, ind2);
  // Experiencias del criterio 1 (como Phidias: Criterio → Experiencias → Actividades)
  const exp1 = { id: id('exp'), colegio_id: c, indicador_id: ind1.id, numero: 1, nombre: 'Experiencias 1', porcentaje: 70 };
  const exp2 = { id: id('exp'), colegio_id: c, indicador_id: ind1.id, numero: 2, nombre: 'Experiencias 2', porcentaje: 30 };
  t.experiencias = [exp1, exp2];
  if (actsM[0]) Object.assign(actsM[0], { indicador_id: ind1.id, experiencia_id: exp1.id, porcentaje: 100, opcional: false, privada: false });
  if (actsM[1]) actsM[1].indicador_id = ind2.id, actsM[1].porcentaje = 100;
  // Una recuperación (Lengua 6A, periodo 1) y menciones
  t.recuperaciones.push({ colegio_id: c, asignacion_id: asignaciones[1].id, periodo_id: periodos[0].id, estudiante_id: estudiantes[1].e.id, nota: 3.5, observacion: 'Presentó taller de recuperación', fecha: dia(-40), registrado_por: profes[1].id });
  t.menciones.push({ id: id('men'), colegio_id: c, estudiante_id: estudiantes[0].e.id, asignacion_id: asignaciones[0].id, periodo_id: periodos[1].id, tipo: 'Mérito', descripcion: 'Mejor desempeño en la olimpiada de matemáticas del curso', autor_id: profes[0].id, fecha: dia(-5), creado_en: dia(-5) + 'T11:00:00' });

  // Ficha médica y ausencias reportadas por la familia
  t.fichas_medicas = [{ estudiante_id: estudiantes[0].e.id, colegio_id: c, tipo_sangre: 'O+', eps: 'Sanitas', alergias: 'Penicilina', medicamentos: null, enfermedades: 'Asma leve (usa inhalador)', restricciones: null, contacto_nombre: 'Andrea Lozano Peña', contacto_telefono: '300 000 1054', contacto_parentesco: 'Madre', observaciones: null, actualizado_por: acu1.id, actualizado_en: ahora.toISOString() }];
  t.reportes_ausencia = [
    { id: id('aus'), colegio_id: c, estudiante_id: estudiantes[1].e.id, tipo: 'enfermedad', desde: dia(-2), hasta: dia(-1), observacion: 'Fiebre y gripa. Adjunto incapacidad.', soporte_ruta: null, soporte_nombre: null, reportado_por: acu2.id, estado: 'recibido', respuesta: null, revisado_por: null, creado_en: cuando(-2, 7) },
    { id: id('aus'), colegio_id: c, estudiante_id: estudiantes[0].e.id, tipo: 'cita', desde: dia(-9), hasta: dia(-9), observacion: 'Cita con el odontólogo en la mañana.', soporte_ruta: null, soporte_nombre: null, reportado_por: acu1.id, estado: 'aceptado', respuesta: 'Recibido, gracias.', revisado_por: rectora.id, creado_en: cuando(-10, 7) },
  ];
  t.archivos = [];
  t.pasarelas = [
    { id: id('pas'), colegio_id: c, nombre: 'Biblioteca digital', url: 'https://www.bibliotecanacional.gov.co/', descripcion: 'Libros y recursos de la Biblioteca Nacional', icono: '📚', roles: null, orden: 1 },
    { id: id('pas'), colegio_id: c, nombre: 'Colombia Aprende', url: 'https://www.colombiaaprende.edu.co/', descripcion: 'Contenidos educativos del Ministerio de Educación', icono: '🎓', roles: null, orden: 2 },
    { id: id('pas'), colegio_id: c, nombre: 'Plataforma de inglés', url: 'https://www.duolingo.com/', descripcion: 'Práctica de inglés', icono: '🌎', roles: ['estudiante'], orden: 3 },
  ];

  // Procesos en línea: matrícula del próximo año (abierta) y una encuesta
  const f = (fid, etiqueta, tipo = 'texto', extra = {}) => ({ id: fid, etiqueta, tipo, obligatorio: !['info', 'archivo'].includes(tipo), opciones: [], ...extra });
  t.procesos = [
    { id: id('pro'), colegio_id: c, titulo: `Matrícula ${ahora.getFullYear() + 1}`, descripcion: 'Proceso de matrícula en línea para el próximo año.', instrucciones: 'Complete cada paso y oprima "Siguiente". Puede continuar después. Al final oprima "Terminar".',
      pasos: [
        { titulo: 'Datos del estudiante', campos: [f('dir', 'Dirección de residencia'), f('bar', 'Barrio'), f('eps', 'EPS'), f('tra', '¿Necesita transporte escolar?', 'opcion', { opciones: ['Sí', 'No'] })] },
        { titulo: 'Documentos', campos: [f('i1', 'Suba los documentos en PDF o foto.', 'info'), f('reg', 'Registro civil o tarjeta de identidad', 'archivo'), f('afi', 'Certificado de afiliación a EPS', 'archivo')] },
        { titulo: 'Contrato', campos: [f('i2', 'El contrato y el pagaré están en Archivos del colegio.', 'info'), f('con', 'Acepto el contrato de prestación de servicios educativos', 'acepto'), f('pag', 'Acepto firmar el pagaré', 'acepto'), f('obs', 'Observaciones y sugerencias', 'parrafo', { obligatorio: false })] },
      ], abre: cuando(-5, 7), cierra: cuando(25, 23), roles: ['acudiente'], por_estudiante: true, publicado: true, creado_por: rectora.id, creado_en: cuando(-6) },
    { id: id('pro'), colegio_id: c, titulo: 'Encuesta de satisfacción', descripcion: 'Ayúdenos a mejorar.', instrucciones: null,
      pasos: [{ titulo: 'Su opinión', campos: [f('e1', 'Comunicación del colegio', 'opcion', { opciones: ['1', '2', '3', '4', '5'] }), f('e2', 'Calidad académica', 'opcion', { opciones: ['1', '2', '3', '4', '5'] }), f('e3', '¿Qué podemos mejorar?', 'parrafo', { obligatorio: false })] }],
      abre: cuando(-2, 7), cierra: cuando(10, 23), roles: ['acudiente'], por_estudiante: false, publicado: true, creado_por: rectora.id, creado_en: cuando(-2) },
  ];
  t.proceso_respuestas = [];

  // Examen en línea abierto en Matemáticas 6A
  t.examenes = [{ id: id('exa'), colegio_id: c, asignacion_id: asignaciones[0].id, periodo_id: periodos[1].id, titulo: 'Quiz: fracciones equivalentes', instrucciones: 'Lee con atención. Tienes 15 minutos.',
    preguntas: [
      { id: 'q1', enunciado: '¿Cuál fracción es equivalente a 1/2?', tipo: 'unica', opciones: ['2/3', '3/6', '1/4'], puntos: 1 },
      { id: 'q2', enunciado: '4/8 es igual a 1/2', tipo: 'vf', opciones: ['Verdadero', 'Falso'], puntos: 1 },
      { id: 'q3', enunciado: '¿Cuál es mayor: 3/4 o 2/3?', tipo: 'unica', opciones: ['3/4', '2/3', 'Son iguales'], puntos: 1 },
      { id: 'q4', enunciado: 'Explica con tus palabras qué es una fracción equivalente.', tipo: 'abierta', opciones: [], puntos: 2 },
    ], abre: cuando(-1, 7), cierra: cuando(3, 23), duracion_min: 15, publicado: true, mostrar_resultado: true, creado_por: profes[0].id, creado_en: cuando(-1, 7) }];
  t.examen_claves = [{ examen_id: t.examenes[0].id, colegio_id: c, claves: { q1: 1, q2: 0, q3: 0 } }];
  t.examen_preguntas = t.examenes.map((x) => ({ examen_id: x.id, colegio_id: c, preguntas: x.preguntas }));
  t.examenes.forEach((x) => { x.num_preguntas = x.preguntas.length; x.resultados_publicados = false; delete x.preguntas; });
  t.examen_intentos = [];
  t.aula_publicaciones = [
    { id: id('pub'), colegio_id: c, asignacion_id: asignaciones[0].id, autor_id: profes[0].id, texto: 'Bienvenidos al periodo 2. Esta semana trabajamos fracciones equivalentes. Repasen el video antes de la clase del jueves.', enlace: 'https://www.youtube.com/results?search_query=fracciones+equivalentes', archivo_ruta: null, archivo_nombre: null, fijada: true, creado_en: cuando(-6, 7) },
    { id: id('pub'), colegio_id: c, asignacion_id: asignaciones[0].id, autor_id: profes[0].id, texto: 'Recuerden traer regla y colores para el taller de mañana.', enlace: null, archivo_ruta: null, archivo_nombre: null, fijada: false, creado_en: cuando(-1, 15) },
  ];

  // Horario de 6A y 7A: 6 clases de 55 min desde las 7:00 con descanso después de la 3.ª
  t.horario_bloques = [];
  const fmt = (x) => `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`;
  for (const cu of cursos) {
    const suyas = asignaciones.filter((a) => a.curso_id === cu.id);
    for (let dia = 1; dia <= 5; dia++) {
      let tm = 7 * 60;
      for (let k = 0; k < 6; k++) {
        const a = suyas[(k + dia * 2) % suyas.length];
        t.horario_bloques.push({ id: id('hor'), colegio_id: c, curso_id: cu.id, dia, hora_inicio: fmt(tm), hora_fin: fmt(tm + 55), asignacion_id: a.id, titulo: null, aula: 'Salón ' + cu.nombre });
        tm += 55;
        if (k === 2) { t.horario_bloques.push({ id: id('hor'), colegio_id: c, curso_id: cu.id, dia, hora_inicio: fmt(tm), hora_fin: fmt(tm + 30), asignacion_id: null, titulo: 'Descanso', aula: null }); tm += 30; }
      }
    }
  }

  // Tesorería: pensión de septiembre (pagada), octubre (vencida para algunos) y noviembre (por vencer)
  col.interes_mora_mensual = 1.5;
  t.conceptos_cobro = []; t.cobros = []; t.pagos = [];
  const concepto = (nombre, v) => { const x = { id: id('con'), colegio_id: c, nombre, valor_defecto: v, activo: true }; t.conceptos_cobro.push(x); return x; };
  const pension = concepto('Pensión', 450000); concepto('Matrícula', 600000); concepto('Transporte', 180000); concepto('Alimentación', 220000);
  let nCobro = 1000, nPago = 5000;
  const venc = (d) => dia(d);
  for (const { e } of estudiantes) {
    const meses = [['septiembre', -45, true], ['octubre', -15, rnd() < 0.7], ['noviembre', 15, false]];
    for (const [mesN, d, pagado] of meses) {
      const cb = { id: id('cob'), numero: ++nCobro, colegio_id: c, estudiante_id: e.id, concepto_id: pension.id, descripcion: `Pensión ${mesN} ${ahora.getFullYear()}`, valor: 450000, vence: venc(d), anulado: false, creado_por: rectora.id, creado_en: ahora.toISOString() };
      t.cobros.push(cb);
      if (pagado) t.pagos.push({ id: id('pag'), numero: ++nPago, colegio_id: c, cobro_id: cb.id, estudiante_id: e.id, valor: 450000, fecha: venc(d - 2), medio: rnd() < 0.5 ? 'transferencia' : 'pse', referencia: null, pagado_por: null, registrado_por: rectora.id, anulado: false, creado_en: ahora.toISOString() });
    }
  }

  // Seguimientos del colegio (formularios), como en Phidias
  t.seguimientos = [
    { id: 'seg-01', colegio_id: c, nombre: 'Seguimiento académico', descripcion: 'Registro de seguimientos académicos según el Sistema Institucional de Evaluación.', anio: anio.anio, fecha_inicial: anio.fecha_inicio, fecha_final: null, registro_unico: false, visible_familia: true, propio: false, activo: true, creado_por: rectora.id, creado_en: cuando(-30, 8),
      campos: [{ id: 'c1', etiqueta: 'Situación', tipo: 'opcion', opciones: ['Bajo rendimiento', 'Tareas pendientes', 'Inasistencia', 'Avance destacado'], requerido: true }, { id: 'c2', etiqueta: 'Descripción', tipo: 'parrafo', opciones: [], requerido: true }, { id: 'c3', etiqueta: 'Compromiso', tipo: 'texto', opciones: [], requerido: false }],
      notificar: { cuando: 'crear', persona: false, padres: true, profesor: false, director: true, cada: 1 } },
    { id: 'seg-02', colegio_id: c, nombre: 'Convivencia', descripcion: 'Registro según el Manual de Convivencia (situaciones tipo I, II y III).', anio: anio.anio, fecha_inicial: anio.fecha_inicio, fecha_final: null, registro_unico: false, visible_familia: true, propio: false, activo: true, creado_por: rectora.id, creado_en: cuando(-30, 8),
      campos: [{ id: 'c1', etiqueta: 'Tipo de situación', tipo: 'opcion', opciones: ['Tipo I', 'Tipo II', 'Tipo III'], requerido: true }, { id: 'c2', etiqueta: 'Descripción de lo ocurrido', tipo: 'parrafo', opciones: [], requerido: true }, { id: 'c3', etiqueta: '¿Se citó al acudiente?', tipo: 'si_no', opciones: [], requerido: false }],
      notificar: { cuando: 'crear_actualizar', persona: false, padres: true, profesor: false, director: true, cada: 1 } },
    { id: 'seg-03', colegio_id: c, nombre: 'Enfermería', descripcion: 'Atenciones en enfermería.', anio: anio.anio, fecha_inicial: anio.fecha_inicio, fecha_final: null, registro_unico: false, visible_familia: true, propio: false, activo: true, creado_por: rectora.id, creado_en: cuando(-30, 8),
      campos: [{ id: 'c1', etiqueta: 'Motivo', tipo: 'texto', opciones: [], requerido: true }, { id: 'c2', etiqueta: 'Atención', tipo: 'varias', opciones: ['Valoración', 'Curación', 'Reposo', 'Se llamó al acudiente', 'Remitido a casa'], requerido: false }, { id: 'c3', etiqueta: 'Observaciones', tipo: 'parrafo', opciones: [], requerido: false }],
      notificar: { cuando: 'crear', persona: false, padres: true, profesor: false, director: false, cada: 1 } },
  ];
  t.seguimiento_registros = [];
  // 6B: segundo grupo de sexto (como Phidias: un mismo curso con varios grupos que comparten criterios)
  const c6b = { id: id('cur'), colegio_id: c, sede_id: sede.id, anio_lectivo_id: anio.id, grado_id: grados[0].id, nombre: '6B', director_id: null };
  t.cursos.push(c6b);
  for (const [i, m] of materias.entries()) t.asignaciones.push({ id: id('asg'), colegio_id: c, curso_id: c6b.id, materia_id: m.id, profesor_id: profes[profeDe[i]].id, intensidad_horaria: [5, 4, 4, 3, 2][i] });
  for (const [nom, ape] of [['Lucía', 'Gómez Pardo'], ['Nicolás', 'Beltrán Quintero'], ['Antonella', 'Ramírez Cano'], ['Martín', 'Salazar Duque']]) {
    const e = persona(nom, ape, 'estudiante');
    t.matriculas.push({ id: id('mtr'), colegio_id: c, curso_id: c6b.id, estudiante_id: e.id, estado: 'activa', fecha: anio.fecha_inicio });
  }
  return t;
}
