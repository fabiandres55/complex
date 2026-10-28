// Horario de clases (REA Phidias §3.20): bloques día × hora por curso.
// Admin lo arma por curso; el profesor ve su semana (todas sus clases); la familia, la del estudiante.
import { E, base, perfiles, misAsignaciones, personaActiva, pref } from '../estado.js';
import { esc, aviso, ventana, leerForm, confirmar, nombre, vacio } from '../ui.js';
import { cabecera, camposHTML } from './comun.js';

const DIAS = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const hora = (t) => String(t || '').slice(0, 5);
const COLORES = ['#3f6ea5', '#2f8f6a', '#9a5b2e', '#7a4fa3', '#b0414f', '#2f7f8f', '#6b7a2c', '#a3477f'];
const color = (id) => (id ? COLORES[[...String(id)].reduce((s, c) => s + c.charCodeAt(0), 0) % COLORES.length] : '#8a94a6');

export async function horario(m, p) {
  const b = await base();
  let cursoId = null, bloques = [], titulo = 'Horario';
  if (E.rol === 'admin') {
    const cand = p.curso || pref('horario_curso');
    cursoId = b.cursos.some((c) => c.id === cand) ? cand : b.cursos[0]?.id;
    if (!b.cursos.length) { m.innerHTML = cabecera('Horario') + vacio('Primero crea los cursos.'); return; }
    pref('horario_curso', cursoId);
    bloques = await E.db.select('horario_bloques', { eq: { curso_id: cursoId } });
  } else if (E.rol === 'profesor') {
    const mias = misAsignaciones(b).map((a) => a.id);
    bloques = mias.length ? await E.db.select('horario_bloques', { in: { asignacion_id: mias } }) : [];
    titulo = 'Mi horario';
  } else {
    const est = personaActiva();
    const mats = est ? (await E.db.select('matriculas', { eq: { estudiante_id: est } })).filter((x) => x.estado === 'activa') : [];
    cursoId = mats.map((x) => x.curso_id).find((id) => b.cursoPorId.has(id) && b.cursos.some((c) => c.id === id));
    bloques = cursoId ? await E.db.select('horario_bloques', { eq: { curso_id: cursoId } }) : [];
    titulo = 'Horario' + (cursoId ? ' · ' + b.cursoPorId.get(cursoId)?.nombre : '');
  }
  await perfiles(bloques.map((x) => b.asignacionPorId.get(x.asignacion_id)?.profesor_id));
  const conSabado = bloques.some((x) => x.dia === 6);
  const dias = [1, 2, 3, 4, 5, ...(conSabado ? [6] : [])];
  const franjas = [...new Map(bloques.map((x) => [hora(x.hora_inicio) + '-' + hora(x.hora_fin), [hora(x.hora_inicio), hora(x.hora_fin)]])).values()].sort((a, z) => (a[0] > z[0] ? 1 : -1));
  const etiqueta = (x) => {
    const a = b.asignacionPorId.get(x.asignacion_id);
    const mat = a ? b.materiaPorId.get(a.materia_id)?.nombre : x.titulo || '—';
    const sub = E.rol === 'profesor' ? 'Curso ' + (b.cursoPorId.get(a?.curso_id)?.nombre || '') : a?.profesor_id ? nombre(E.perfiles.get(a.profesor_id)) : '';
    return { mat, sub };
  };
  const celda = (x) => {
    const { mat, sub } = etiqueta(x);
    return `<button class="bloque" style="--c:${color(x.asignacion_id && b.asignacionPorId.get(x.asignacion_id)?.materia_id)}" data-bloque="${x.id}" ${E.rol === 'admin' ? '' : 'tabindex="-1"'}>
      <b>${esc(mat)}</b><small>${esc(sub)}${x.aula ? ' · ' + esc(x.aula) : ''}</small></button>`;
  };
  const hoyDia = ((new Date().getDay() + 6) % 7) + 1;
  const diaMovil = Number(p.dia) || (hoyDia <= 6 ? Math.min(hoyDia, dias.at(-1)) : 1);

  m.innerHTML = cabecera(esc(titulo), { acciones: E.rol === 'admin' ? '<button class="btn btn-primario" data-nuevo>＋ Bloque</button><button class="btn" data-franjas>⏱ Generar franjas</button>' : '' }) + `
    ${E.rol === 'admin' ? `<div class="tarjeta-cab"><label class="en-linea">Curso <select data-curso>${b.cursos.map((c) => `<option value="${c.id}" ${c.id === cursoId ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}</select></label></div>` : ''}
    ${!bloques.length ? vacio(E.rol === 'admin' ? 'Este curso aún no tiene horario. Agrega bloques o genera las franjas del día.' : 'Aún no hay horario publicado.') : `
    <div class="horario-movil">
      <div class="segmentos">${dias.map((d) => `<a href="#/horario?dia=${d}${cursoId && E.rol === 'admin' ? '&curso=' + cursoId : ''}" class="${d === diaMovil ? 'activo' : ''}">${DIAS[d].slice(0, 3)}</a>`).join('')}</div>
      <div class="lista">${bloques.filter((x) => x.dia === diaMovil).sort((a, z) => (a.hora_inicio > z.hora_inicio ? 1 : -1)).map((x) => `<div class="fila"><span class="num">${hora(x.hora_inicio)}</span><span class="crece">${celda(x)}</span></div>`).join('') || '<p class="ayuda">Sin clases este día.</p>'}</div>
    </div>
    <div class="tabla-envoltura horario-tabla"><table class="tabla tabla-horario">
      <thead><tr><th>Hora</th>${dias.map((d) => `<th class="${d === hoyDia ? 'hoy' : ''}">${DIAS[d]}</th>`).join('')}</tr></thead>
      <tbody>${franjas.map(([ini, fin]) => `<tr><th scope="row">${ini}<small>${fin}</small></th>${dias.map((d) => {
        const enCelda = bloques.filter((x) => x.dia === d && hora(x.hora_inicio) === ini && hora(x.hora_fin) === fin);
        return `<td class="${d === hoyDia ? 'hoy' : ''}">${enCelda.map(celda).join('')}</td>`;
      }).join('')}</tr>`).join('')}</tbody>
    </table></div>`}`;

  if (E.rol !== 'admin') return;
  const recargar = () => horario(m, { ...p, curso: cursoId });
  m.querySelector('[data-curso]').onchange = (e) => { location.hash = '#/horario?curso=' + e.target.value; };
  const asigs = b.asignaciones.filter((a) => a.curso_id === cursoId);
  const campos = [
    { name: 'dia', label: 'Día', tipo: 'select', opciones: [1, 2, 3, 4, 5, 6].map((d) => [d, DIAS[d]]) },
    { name: 'hora_inicio', label: 'Empieza', tipo: 'time' },
    { name: 'hora_fin', label: 'Termina', tipo: 'time' },
    { name: 'asignacion_id', label: 'Materia', tipo: 'select', vacio: '— Otra actividad (descanso, dirección de curso…) —', opciones: asigs.map((a) => [a.id, b.materiaPorId.get(a.materia_id)?.nombre || 'Materia']) },
    { name: 'titulo', label: 'Nombre de la actividad (si no es una materia)' },
    { name: 'aula', label: 'Aula / salón (opcional)' },
  ];
  const editarBloque = async (fila) => {
    const r = await ventana({
      titulo: fila?.id ? 'Bloque del horario' : 'Nuevo bloque',
      html: camposHTML(campos, fila ? { ...fila, hora_inicio: hora(fila.hora_inicio), hora_fin: hora(fila.hora_fin) } : { dia: diaMovil }),
      botones: [
        ...(fila?.id ? [{ texto: 'Eliminar', clase: 'btn-peligro', antes: async () => { if (!(await confirmar('¿Quitar el bloque?', '', 'Quitar'))) return false; await E.db.remove('horario_bloques', { id: fila.id }); return true; } }] : []),
        { texto: 'Cancelar' },
        { texto: 'Guardar', antes: async (c) => {
          const d = leerForm(c);
          if (!d.hora_inicio || !d.hora_fin) throw new Error('Indica la hora de inicio y fin.');
          if (d.hora_fin <= d.hora_inicio) throw new Error('La hora de fin debe ser después del inicio.');
          if (!d.asignacion_id && !d.titulo) throw new Error('Elige la materia o escribe el nombre de la actividad.');
          // no se cruza con otro bloque del mismo curso y día
          const cruce = bloques.find((x) => x.id !== fila?.id && x.dia === Number(d.dia) && hora(x.hora_inicio) < d.hora_fin && hora(x.hora_fin) > d.hora_inicio);
          if (cruce) throw new Error(`Se cruza con ${etiqueta(cruce).mat} (${hora(cruce.hora_inicio)}–${hora(cruce.hora_fin)}).`);
          // el profesor no puede estar en dos cursos a la misma hora
          const prof = b.asignacionPorId.get(d.asignacion_id)?.profesor_id;
          if (prof) {
            const suyas = b.asignaciones.filter((x) => x.profesor_id === prof && x.curso_id !== cursoId).map((x) => x.id);
            const otros = suyas.length ? await E.db.select('horario_bloques', { in: { asignacion_id: suyas }, eq: { dia: Number(d.dia) } }) : [];
            const choque = otros.find((x) => hora(x.hora_inicio) < d.hora_fin && hora(x.hora_fin) > d.hora_inicio);
            if (choque) throw new Error(`${nombre(E.perfiles.get(prof))} ya tiene clase en ${b.cursoPorId.get(choque.curso_id)?.nombre || 'otro curso'} de ${hora(choque.hora_inicio)} a ${hora(choque.hora_fin)}.`);
          }
          const datos = { dia: Number(d.dia), hora_inicio: d.hora_inicio, hora_fin: d.hora_fin, asignacion_id: d.asignacion_id || null, titulo: d.asignacion_id ? null : d.titulo, aula: d.aula || null };
          if (fila?.id) await E.db.update('horario_bloques', datos, { id: fila.id });
          else await E.db.insert('horario_bloques', [{ colegio_id: E.colegio.id, curso_id: cursoId, ...datos }]);
          return true;
        } },
      ],
    });
    if (r) { aviso('Horario actualizado'); recargar(); }
  };
  m.querySelector('[data-nuevo]').onclick = () => editarBloque(null);
  m.querySelectorAll('[data-bloque]').forEach((el) => (el.onclick = () => editarBloque(bloques.find((x) => x.id === el.dataset.bloque))));
  m.querySelector('[data-franjas]').onclick = async () => {
    const r = await ventana({
      titulo: 'Generar franjas del día',
      html: camposHTML([
        { name: 'inicio', label: 'La jornada empieza', tipo: 'time', def: '07:00' },
        { name: 'duracion', label: 'Duración de cada clase (minutos)', tipo: 'number', def: 55 },
        { name: 'clases', label: 'Clases por día', tipo: 'number', def: 6 },
        { name: 'descanso_despues', label: 'Descanso después de la clase número', tipo: 'number', def: 3 },
        { name: 'descanso_min', label: 'Duración del descanso (minutos)', tipo: 'number', def: 30 },
      ]) + '<p class="ayuda">Crea, de lunes a viernes, los bloques vacíos ("Por asignar") y el descanso. Luego tocas cada bloque para ponerle la materia.</p>',
      botones: [{ texto: 'Cancelar' }, { texto: 'Generar', antes: async (c) => {
        const d = leerForm(c);
        const [hh, mm] = (d.inicio || '07:00').split(':').map(Number);
        let t = hh * 60 + mm;
        const fmt = (x) => `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`;
        const dur = Number(d.duracion) || 55, n = Math.min(12, Number(d.clases) || 6), des = Number(d.descanso_despues) || 0, desMin = Number(d.descanso_min) || 0;
        const filas = [];
        for (let i = 1; i <= n; i++) {
          for (let dia = 1; dia <= 5; dia++) filas.push({ colegio_id: E.colegio.id, curso_id: cursoId, dia, hora_inicio: fmt(t), hora_fin: fmt(t + dur), asignacion_id: null, titulo: 'Por asignar', aula: null });
          t += dur;
          if (i === des && desMin) { for (let dia = 1; dia <= 5; dia++) filas.push({ colegio_id: E.colegio.id, curso_id: cursoId, dia, hora_inicio: fmt(t), hora_fin: fmt(t + desMin), asignacion_id: null, titulo: 'Descanso', aula: null }); t += desMin; }
        }
        if (t > 23 * 60 + 59) throw new Error('La jornada pasa de la medianoche: revisa la hora de inicio, la duración o el número de clases.');
        if (bloques.length && !(await confirmar('¿Reemplazar el horario?', 'Se borrarán los bloques actuales de este curso.', 'Reemplazar'))) return false;
        // primero se insertan las franjas nuevas; solo si salió bien se borran las viejas
        const viejos = bloques.map((x) => x.id);
        await E.db.insert('horario_bloques', filas);
        for (const id of viejos) await E.db.remove('horario_bloques', { id });
        return true;
      } }],
    });
    if (r) { aviso('Franjas creadas'); recargar(); }
  };
}
