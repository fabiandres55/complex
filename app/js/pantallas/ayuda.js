// Ayuda: guías cortas por rol (como el centro de ayuda de Phidias, dentro de la app).
import { E } from '../estado.js';
import { esc, ROL } from '../ui.js';
import { cabecera } from './comun.js';

const GUIAS = {
  admin: [
    ['Poner en marcha el colegio', ['Colegio → Estructura: crea la sede, el año lectivo con sus periodos, los grados, las materias y los cursos.', 'En cada curso agrega las materias y asigna el profesor; marca el director de curso.', 'Personas → "Importar (Excel)": descarga la plantilla, llénala y súbela. Se crean los usuarios (entran con su número de documento), se matriculan los estudiantes y se vinculan los acudientes.', 'Imprime las credenciales y entrégalas a cada familia y profesor.']],
    ['Comunicarse con las familias', ['Circulares: escribe, elige a quién va (todo el colegio, una sede, un grado o un curso) y publica. Se numeran solas.', 'En cada circular ves quién la leyó.', 'Bandeja de entrada / Redactar: mensajes uno a uno con confirmación de lectura.']],
    ['Notas y periodos', ['Estructura → Año y periodos: cierra un periodo cuando termine; los profesores ya no podrán cambiar notas (tú sí).', 'Reportes → Sábana de notas y Cumplimiento docente para hacer seguimiento.', 'Desde la ficha del estudiante: boletín por periodo y certificados.']],
    ['Tesorería', ['Conceptos: crea Pensión, Matrícula, Transporte… y define el % de interés de mora.', 'Facturar: crea el cobro del mes para todo el colegio, un grado o un curso.', 'Cartera: mira quién debe y registra los pagos desde el estado de cuenta.']],
    ['Revisar lo que llega', ['Tablero: planeaciones por revisar, ausencias reportadas por las familias y procesos abiertos.', 'Planeaciones: apruébalas o devuélvelas con un comentario.', 'Ausencias reportadas: acepta (la falla queda justificada) o no aceptes.']],
  ],
  profesor: [
    ['Calificar', ['Academia → Notas y asistencia → Notas de tu clase.', 'Si trabajas por logros, crea primero los Indicadores (con su dimensión y peso) y luego las actividades de cada uno.', 'Escribe la nota y pasa a la siguiente con Enter; se guarda sola. Acepta coma: 4,5.', 'Si un estudiante recupera, escribe la nota en "Recup.": queda la mayor (✱).', 'Toca el nombre de un estudiante para darle una mención (Mérito, Esfuerzo…).']],
    ['Asistencia', ['Notas y asistencia → Asistencia. Todos empiezan en P (presente): toca A, T o E según el caso y guarda.']],
    ['Aula virtual', ['En cada materia: Tablero (muro para anuncios, enlaces y material), Tareas (con fecha de entrega) y Exámenes.', 'Exámenes: preguntas de única respuesta, verdadero/falso o abiertas. Marca la correcta; la nota se calcula sola. Las abiertas las calificas tú.']],
    ['Planeaciones', ['Academia → Planeaciones → "Subir planeación": elige la clase, el periodo y adjunta el archivo. Coordinación la aprueba o te la devuelve con comentarios.']],
    ['Observador / seguimientos', ['Desde la ficha del estudiante → Seguimientos → "＋ Registro": elige la categoría (Observador, Convivencia, Tutoría…) y si la familia lo puede ver.']],
  ],
  acudiente: [
    ['Ver a tus hijos', ['Arriba están las pestañas: la tuya (familiar) y una por cada hijo. Toca la de tu hijo para ver su Aula, notas, asistencia, seguimientos y horario.', 'En el Tablero ves las novedades y lo que tienes pendiente.']],
    ['Notas y boletines', ['Pestaña del hijo → Historial de notas: notas por periodo y desempeño. Toca una materia para ver cada indicador y actividad.', 'Abajo están los boletines de cada periodo para imprimir o guardar en PDF.']],
    ['Reportar una ausencia', ['Pestaña del hijo → Asistencia → "Reportar ausencia": motivo, fechas y, si tienes, la incapacidad en foto o PDF.']],
    ['Pagos', ['Tesorería → Consolidado: lo que debes, lo vencido (en rojo) con intereses y lo pagado. "Pagar obligaciones" genera la orden de pago para el banco.']],
    ['Procesos y mensajes', ['Comunidad → Procesos en línea: matrícula, autorizaciones y encuestas. Se llenan por pasos y puedes continuar después.', 'Comunicación → Redactar: escribe a los profesores y al director de curso de tus hijos.']],
    ['Ficha médica', ['Pestaña del hijo → Ficha médica: llénala para que el colegio pueda atender una emergencia.']],
  ],
  estudiante: [
    ['Tu Aula', ['Academia → Aula: tus materias con las tareas y exámenes pendientes.', 'En cada materia: el muro del profesor, tus notas por indicador, las tareas (entrégalas en línea con texto o archivo) y los exámenes.']],
    ['Exámenes en línea', ['Las preguntas aparecen cuando tocas "Empezar". Si tiene tiempo, verás el reloj; al acabarse se entrega solo.', 'Solo se presenta una vez.']],
    ['Horario y calendario', ['Academia → Horario: tus clases de cada día.', 'Comunidad → Calendario: eventos del colegio y fechas de entrega.']],
  ],
};

export async function ayuda(m) {
  const g = GUIAS[E.rol] || [];
  m.innerHTML = cabecera('Ayuda') + `
    <p class="ayuda">Guía rápida para <b>${esc(ROL[E.rol])}</b>. ¿Algo no funciona? Escríbele a la administración del colegio desde Comunicación → Redactar.</p>
    ${g.map(([t, pasos], i) => `
      <details class="tarjeta guia" ${i === 0 ? 'open' : ''}>
        <summary><h2>${esc(t)}</h2></summary>
        <ol>${pasos.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>
      </details>`).join('')}
    <section class="tarjeta"><h2>Instalar Complex_ en el celular</h2><ol>
      <li><b>Android:</b> abre Complex_ en Chrome → menú ⋮ → "Instalar app" (o "Agregar a la pantalla principal").</li>
      <li><b>iPhone:</b> abre Complex_ en Safari → botón Compartir → "Agregar a inicio".</li>
    </ol></section>
    <p class="nota-pie">Entras con tu correo o con tu número de documento. Si olvidaste la contraseña, pídele al colegio que la restablezca o usa "Olvidé mi contraseña".</p>`;
}
