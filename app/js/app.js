// Complex_ — arranque, enrutador y armazón de la app.
import { crearDbSupabase, crearDbDemo, huellaEnEsteEquipo } from './db.js';
import { E, pref, base, cargarYo, elegirColegio, cambiarRol, cargarPersonas, elegirPersona, personaActiva, viendoHijo, logoHTML, aplicarMarca } from './estado.js';
import { esc, $, aviso, ventana, leerForm, confirmar, ROL, nombre, iniciales, etiquetarTablas, fecha, fechaHora } from './ui.js';
import { APP_VERSION } from './config.js';
import * as admin from './pantallas/admin.js';
import * as profe from './pantallas/profesor.js';
import * as planillaP from './pantallas/planilla.js';
import * as boletinD from './pantallas/boletin_docente.js';
import * as seguimientosP from './pantallas/seguimientos.js';
import * as docencia from './pantallas/docencia.js';
import * as famPerfil from './pantallas/familia_perfil.js';
import * as familia from './pantallas/familia.js';
import * as circulares from './pantallas/circulares.js';
import * as planeaciones from './pantallas/planeaciones.js';
import * as mensajeria from './pantallas/mensajeria.js';
import * as aula from './pantallas/aula.js';
import * as calendario from './pantallas/calendario.js';
import * as tesoreria from './pantallas/tesoreria.js';
import * as comunidad from './pantallas/comunidad.js';
import * as procesos from './pantallas/procesos.js';
import * as certificados from './pantallas/certificados.js';
import * as horario from './pantallas/horario.js';
import * as reportes from './pantallas/reportes.js';
import * as examenesP from './pantallas/examenes.js';
import * as ayudaP from './pantallas/ayuda.js';
import * as carnetP from './pantallas/carnet.js';

const main = () => $('#principal');

// ---------------------------------------------------------------- Instalar (como Relax: Chrome crea la app sola)
let instalador = null;
// Bloqueo con huella: true cuando la persona ya se identificó en esta apertura de la app
// (contraseña, huella o enlace de recuperación de contraseña). Al cerrar y volver a abrir, se pide otra vez.
let desbloqueada = /type=recovery/.test(location.hash);
const MIN_FUERA = 5; // minutos en segundo plano tras los que se vuelve a pedir la huella
const claveBloqueo = () => 'bloqueo_' + E.sesion?.user?.id;
const instalada = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); instalador = e; });
window.addEventListener('appinstalled', () => { instalador = null; document.querySelectorAll('[data-instalar]').forEach((b) => b.remove()); aviso('Complex_ quedó instalada en tu equipo.'); });
const botonInstalar = (clase = 'btn btn-ancho') => (instalada() ? '' : `<button class="${clase}" data-instalar>📲 Instalar Complex_</button>`);
export async function instalarApp() {
  if (instalada()) return aviso('Ya estás usando Complex_ instalada.');
  if (instalador) {
    instalador.prompt();
    const r = await instalador.userChoice.catch(() => null);
    if (r?.outcome === 'accepted') instalador = null;
    return;
  }
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  await ventana({
    titulo: 'Instalar Complex_',
    html: `<p>Complex_ se instala como una app, sin descargar archivos:</p>
      <ol class="pasos-instalar">${ios
        ? '<li>Abre Complex_ en <b>Safari</b>.</li><li>Toca el botón <b>Compartir</b> (cuadro con flecha).</li><li>Elige <b>"Agregar a inicio"</b> y luego <b>Agregar</b>.</li>'
        : '<li>Abre Complex_ en <b>Chrome</b>.</li><li>Toca el menú <b>⋮</b> (arriba a la derecha).</li><li>Elige <b>"Instalar app"</b> o <b>"Agregar a la pantalla principal"</b> y confirma.</li><li>En el computador también sirve: el ícono de instalar aparece en la barra de dirección.</li>'}</ol>
      <p class="ayuda">Queda con su ícono en la pantalla de inicio y abre a pantalla completa, como Relax.</p>`,
    botones: [{ texto: 'Entendido', valor: true }],
  });
}
document.addEventListener('click', (e) => { if (e.target.closest('[data-instalar]')) instalarApp(); });

// ---------------------------------------------------------------- Tema
export function aplicarTema() {
  const t = pref('tema') || 'auto';
  document.documentElement.dataset.theme = t === 'auto' ? '' : t;
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
}

// ---------------------------------------------------------------- Rutas
const RUTAS = [
  ['inicio', () => inicio()],
  ['estructura', (p) => admin.estructura(main(), p)],
  ['personas', (p) => admin.personas(main(), p)],
  ['curso/:id', (p) => admin.curso(main(), p)],
  ['ajustes-colegio', () => admin.ajustesColegio(main())],
  ['clases', () => docencia.clases(main())],
  ['grupo/:asig', (p) => docencia.grupo(main(), p)],
  ['direccion', () => docencia.direccion(main())],
  ['consolidado/:asig', (p) => docencia.consolidado(main(), p)],
  ['info-personal', (p) => famPerfil.infoPersonal(main(), p)],
  ['edocs', () => famPerfil.edocs(main())],
  ['obligaciones', () => famPerfil.obligaciones(main())],
  ['bandeja-hijo', () => famPerfil.bandejaHijo(main())],
  ['notas/:asig', (p) => planillaP.planilla(main(), p)],
  ['observaciones-boletin/:asig', (p) => boletinD.observaciones(main(), p)],
  ['remediales/:asig', (p) => boletinD.remediales(main(), p)],
  ['seguimientos', () => seguimientosP.lista(main())],
  ['seguimiento/:id', (p) => seguimientosP.seguimiento(main(), p)],
  ['asistencia/:asig', (p) => profe.asistencia(main(), p)],
  ['observador/:est', (p) => familia.observador(main(), p)],
  ['estudiante/:est', (p) => familia.estudiante(main(), p)],
  ['boletin/:est/:periodo', (p) => familia.boletin(main(), p)],
  ['circulares', () => circulares.lista(main())],
  ['circular/:id', (p) => circulares.detalle(main(), p)],
  ['planeaciones', (p) => planeaciones.lista(main(), p)],
  ['bandeja', (p) => mensajeria.bandeja(main(), p)],
  ['enviados', () => mensajeria.enviados(main())],
  ['redactar', (p) => mensajeria.redactar(main(), p)],
  ['mensaje/:id', (p) => mensajeria.detalle(main(), p)],
  ['cartelera', () => mensajeria.cartelera(main())],
  ['aula', () => aula.aula(main())],
  ['aula/:asig', (p) => aula.materia(main(), p)],
  ['tarea/:id', (p) => aula.tarea(main(), p)],
  ['calendario', (p) => calendario.calendario(main(), p)],
  ['tesoreria', (p) => tesoreria.tesoreria(main(), p)],
  ['estado-cuenta/:est', (p) => tesoreria.estadoCuenta(main(), p)],
  ['ausencias', () => comunidad.ausencias(main())],
  ['archivos', (p) => comunidad.archivos(main(), p)],
  ['pasarelas', () => comunidad.pasarelas(main())],
  ['procesos', (p) => procesos.lista(main(), p)],
  ['proceso/:id', (p) => procesos.responder(main(), p)],
  ['proceso/:id/respuestas', (p) => procesos.respuestas(main(), p)],
  ['certificado/:tipo/:est', (p) => certificados.certificado(main(), p)],
  ['horario', (p) => horario.horario(main(), p)],
  ['reportes', (p) => reportes.reportes(main(), p)],
  ['examen/:id', (p) => examenesP.examen(main(), p)],
  ['ayuda', () => ayudaP.ayuda(main())],
  ['carnet/:est', (p) => carnetP.carnet(main(), p)],
  ['perfil', () => perfil()],
];

function resolver(hash) {
  const [ruta, qs] = hash.replace(/^#\/?/, '').split('?');
  const partes = ruta.split('/');
  for (const [patron, fn] of RUTAS) {
    const pp = patron.split('/');
    if (pp.length !== partes.length) continue;
    const params = {};
    if (pp.every((x, i) => (x.startsWith(':') ? ((params[x.slice(1)] = decodeURIComponent(partes[i])), true) : x === partes[i]))) {
      for (const [k, v] of new URLSearchParams(qs || '')) params[k] = v;
      return { patron, fn, params };
    }
  }
  return null;
}

export const ir = (h) => { if (location.hash === h) navegar(); else location.hash = h; };

let navegando = 0;
async function navegar() {
  const yo = ++navegando;
  if (!E.sesion) return pantallaEntrar();
  if (!E.colegio) return pantallaColegios();
  if (E._personasDe !== E.colegio.id + E.rol) { await cargarPersonas(); E._personasDe = E.colegio.id + E.rol; }
  const r = resolver(location.hash || '#/inicio') || resolver('#/inicio');
  pintarArmazon(r.patron);
  main().innerHTML = '<div class="cargando" aria-label="Cargando"><span></span></div>';
  try {
    await r.fn(r.params);
  } catch (err) {
    console.error(err);
    if (yo === navegando) main().innerHTML = `<div class="vacio"><p>No se pudo cargar: ${esc(err.message)}</p><button class="btn" onclick="location.reload()">Reintentar</button></div>`;
  }
  if (yo === navegando) { main().scrollTop = 0; window.scrollTo(0, 0); etiquetarTablas(main()); const bx = $('#btn-exportar'); if (bx) bx.hidden = !main().querySelector('table'); }
}

// Llegaron datos más nuevos del servidor para la pantalla que se está viendo (db.js los pidió por detrás):
// se vuelve a pintar sin la rueda de carga y sin perder el scroll. No se toca si hay una ventana abierta,
// si la persona está escribiendo o si la app está bloqueada; en ese caso la siguiente navegación ya trae lo nuevo.
window.addEventListener('complex:datos-nuevos', async () => {
  window.dispatchEvent(new Event('complex:mensajes')); // contadores del menú
  if (!E.sesion || !E.colegio || !desbloqueada || document.querySelector('.ventana')) return;
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
  const r = resolver(location.hash || '#/inicio') || resolver('#/inicio');
  const yo = ++navegando;
  const m = main(), y = m.scrollTop, wy = window.scrollY;
  try { await r.fn(r.params); } catch (err) { console.warn(err); return; }
  if (yo !== navegando) return;
  m.scrollTop = y; window.scrollTo(0, wy);
  etiquetarTablas(m);
});

// ---------------------------------------------------------------- Armazón (REA Phidias §1.2)
// Menú lateral izquierdo agrupado (Tablero · Comunicación · Comunidad · Academia · Perfil),
// con buscador "Filtrar menú" y, para acudientes, pestañas de persona (yo + cada hijo).
const COMUNICACION = { t: 'Comunicación', ic: '💬', items: [['bandeja', 'Bandeja de entrada', 'noLeidos'], ['redactar', 'Redactar mensaje'], ['enviados', 'Enviados'], ['cartelera', 'Cartelera'], ['circulares', 'Circulares']] };
// Orden como Phidias: Tablero · Perfil · Comunicación · Comunidad · … · Pasarelas (al final)
function menuDe() {
  const lista = menuBase();
  const i = lista.findIndex((g) => g.t === 'Perfil');
  if (i > 1) lista.splice(1, 0, ...lista.splice(i, 1));
  lista.push({ r: 'pasarelas', ic: '⛓', t: 'Pasarelas' });
  return lista;
}
function menuBase() {
  const est = personaActiva();
  const hist = est ? [[`estudiante/${est}?tab=notas`, 'Historial de notas'], [`estudiante/${est}?tab=asistencia`, 'Asistencia']] : [];
  const tablero = { r: 'inicio', ic: '▦', t: 'Tablero' };
  const perfilG = (extra = []) => ({ t: 'Perfil', ic: '👤', items: [['info-personal', 'Información personal'], ...(E.rol === 'acudiente' || E.rol === 'estudiante' ? [['edocs', 'E-docs']] : []), ['perfil', 'Mi cuenta y ajustes'], ...extra, ['ayuda', 'Ayuda']] });
  if (E.rol === 'admin') return [tablero, COMUNICACION,
    { t: 'Comunidad', ic: '👥', items: [['calendario', 'Calendario'], ['personas', 'Personas'], ['seguimientos', 'Seguimientos'], ['ausencias', 'Ausencias reportadas'], ['procesos', 'Procesos en línea'], ['archivos', 'Archivos']] },
    { t: 'Académico', ic: '🎓', items: [['estructura', 'Estructura del colegio'], ['horario', 'Horarios'], ['planeaciones', 'Planeaciones'], ['reportes', 'Reportes']] },
    { t: 'Tesorería', ic: '💰', items: [['tesoreria?tab=cartera', 'Cartera'], ['tesoreria?tab=facturar', 'Facturar'], ['tesoreria?tab=pagos', 'Pagos'], ['tesoreria?tab=conceptos', 'Conceptos']] },
    perfilG([['ajustes-colegio', 'Ajustes del colegio']])];
  if (E.rol === 'profesor') return [tablero, COMUNICACION,
    { t: 'Comunidad', ic: '👥', items: [['calendario', 'Calendario'], ['seguimientos', 'Seguimientos'], ['procesos', 'Procesos en línea'], ['archivos', 'Archivos globales']] },
    { t: 'Docencia', ic: '🧑‍🏫', items: [['direccion', 'Dirección de grupo'], ['clases', 'Clases']] },
    { t: 'Academia', ic: '🎓', items: [['aula', 'Aula'], ['horario', 'Mi horario'], ['planeaciones', 'Planeaciones']] },
    perfilG()];
  if (E.rol === 'estudiante') return [tablero, COMUNICACION,
    { t: 'Comunidad', ic: '👥', items: [['calendario', 'Calendario'], [`estudiante/${E.yo.id}?tab=observador`, 'Seguimientos'], ['procesos', 'Procesos en línea'], ['archivos', 'Archivos']] },
    { t: 'Academia', ic: '🎓', items: [['aula', 'Aula'], ['horario', 'Horario'], ...hist] },
    perfilG()];
  // acudiente
  if (viendoHijo()) return [tablero,
    { t: 'Perfil', ic: '👤', items: [['info-personal', 'Información personal'], [`estudiante/${est}?tab=ficha`, 'Ficha médica'], ['edocs', 'E-docs']] },
    { t: 'Comunicación', ic: '💬', items: [['bandeja-hijo', 'Bandeja de entrada del estudiante'], ['circulares', 'Circulares']] },
    { t: 'Comunidad', ic: '👥', items: [['calendario', 'Calendario'], [`estudiante/${est}?tab=observador`, 'Seguimientos'], ['procesos', 'Procesos en línea'], ['archivos', 'Archivos globales']] },
    { t: 'Academia', ic: '🎓', items: [['aula', 'Aula'], [`estudiante/${est}?tab=notas`, 'Historial'], ['horario', 'Horario'], [`estudiante/${est}?tab=asistencia`, 'Asistencia']] },
    { t: 'Matrícula', ic: '🎒', items: [['obligaciones', 'Obligaciones']] },
    { t: 'Tesorería', ic: '💰', items: [[`estado-cuenta/${est}`, 'Consolidado']] }];
  return [tablero, perfilG(), COMUNICACION, { t: 'Comunidad', ic: '👥', items: [['calendario', 'Calendario'], ['procesos', 'Procesos'], ['archivos', 'Archivos globales']] }, { t: 'Matrícula', ic: '🎒', items: [['obligaciones', 'Obligaciones']] }, { t: 'Tesorería', ic: '💰', items: [['tesoreria', 'Consolidado']] }];
}
const SECCION = { 'curso/:id': 'estructura', 'notas/:asig': 'clases', 'asistencia/:asig': 'clases', 'circular/:id': 'circulares', 'mensaje/:id': 'bandeja', 'aula/:asig': 'aula', 'tarea/:id': 'aula', 'examen/:id': 'aula', 'estado-cuenta/:est': 'tesoreria', 'proceso/:id': 'procesos', 'proceso/:id/respuestas': 'procesos', 'seguimiento/:id': 'seguimientos', 'grupo/:asig': 'clases', 'consolidado/:asig': 'clases', 'observaciones-boletin/:asig': 'clases', 'remediales/:asig': 'clases' };

function itemActivo(ruta, patron) {
  const h = (location.hash || '#/inicio').slice(2);
  const [rp, rq] = ruta.split('?');
  const [hp, hq] = h.split('?');
  if (rq) return hp === rp && new URLSearchParams(hq).get('tab') === new URLSearchParams(rq).get('tab');
  return hp === rp || SECCION[patron] === rp;
}

function pintarArmazon(patron) {
  const app = $('#app');
  if (!app.dataset.armado) {
    app.dataset.armado = '1';
    app.innerHTML = `
      <header class="barra">
        <button class="btn-icono btn-menu" id="btn-menu" aria-label="Abrir menú" aria-controls="menu" aria-expanded="false">☰</button>
        <button class="barra-colegio" id="btn-colegio" title="Cambiar de colegio"></button>
        <button class="btn-icono" id="btn-exportar" title="Exportar esta pantalla a Excel (CSV)" aria-label="Exportar a Excel" hidden>⬇</button>
        <button class="chip-rol" id="btn-rol"></button>
      </header>
      <div class="menu-fondo" id="menu-fondo"></div>
      <nav class="menu" id="menu" aria-label="Menú principal"></nav>
      <div class="contenedor-principal">
        <div class="personas" id="personas" role="tablist" aria-label="Persona"></div>
        <main id="principal" tabindex="-1"></main>
      </div>`;
    $('#btn-colegio').onclick = () => { if (E.colegios.length > 1 || E.roles.includes('admin')) { E.colegio = null; navegar(); } };
    $('#btn-rol').onclick = elegirRol;
    $('#btn-exportar').onclick = exportarPantalla;
    $('#btn-menu').onclick = () => abrirMenu(!app.classList.contains('menu-abierto'));
    $('#menu-fondo').onclick = () => abrirMenu(false);
    $('#menu').addEventListener('click', (e) => {
      if (e.target.closest('a')) abrirMenu(false);
      if (e.target.closest('[data-salir]')) salir();
      if (e.target.closest('[data-ver-como]')) { abrirMenu(false); elegirRol(); }
    });
    const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    $('#menu').addEventListener('input', (e) => {
      if (!e.target.matches('.filtro-menu')) return;
      const q = norm(e.target.value.trim());
      $('#menu').querySelectorAll('[data-texto]').forEach((a) => (a.hidden = !!q && !norm(a.dataset.texto).includes(q)));
      $('#menu').querySelectorAll('details.menu-grupo').forEach((d) => { d.hidden = !!q && ![...d.querySelectorAll('[data-texto]')].some((a) => !a.hidden); if (q) d.open = true; });
    });
    $('#personas').addEventListener('click', (e) => {
      const b = e.target.closest('[data-persona]');
      if (!b) return;
      elegirPersona(b.dataset.persona);
      ir('#/inicio');
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') abrirMenu(false); });
    window.addEventListener('complex:mensajes', pintarContadores);
  }
  aplicarMarca();
  $('#btn-colegio').innerHTML = `${logoHTML('logo-mini')}<span class="nombre-colegio">${esc(E.colegio.nombre)}</span>${E.db.modo === 'demo' ? '<span class="etiqueta-demo">DEMO</span>' : ''}`;
  $('#btn-rol').textContent = ROL[E.rol] + (E.roles.length > 1 ? ' ▾' : '');
  $('#btn-rol').disabled = E.roles.length < 2;

  // Pestañas de persona (acudiente)
  const pp = $('#personas');
  pp.hidden = !(E.personas?.length > 1);
  if (!pp.hidden) pp.innerHTML = E.personas.map((x) => {
    const pe = E.perfiles.get(x.id) || {};
    const act = x.id === E.persona;
    return `<button role="tab" aria-selected="${act}" class="persona ${act ? 'activa' : ''}" data-persona="${x.id}">
      <span class="avatar">${esc(iniciales(pe))}</span><span><b>${esc(pe.nombres || nombre(pe))}</b><small>${x.familiar ? 'familiar' : 'estudiante'}</small></span></button>`;
  }).join('');

  $('#menu').innerHTML = `
    <div class="menu-cab">
      <span class="avatar grande">${esc(iniciales(E.yo))}</span>
      <span><b>${esc(nombre(E.yo))}</b><small>${ROL[E.rol]} · ${esc(E.colegio.nombre)}</small></span>
    </div>
    <input class="filtro-menu" type="search" placeholder="🔍 Filtrar menú" aria-label="Filtrar menú">
    ${menuDe().map((g) => g.r
      ? `<a href="#/${g.r}" data-texto="${esc(g.t)}" class="${itemActivo(g.r, patron) ? 'activo' : ''}"><span class="ic">${g.ic}</span><span>${g.t}</span></a>`
      : `<details class="menu-grupo" open><summary><span class="ic">${g.ic}</span><span>${g.t}</span></summary>
          ${g.items.map(([r, t, badge]) => `<a href="#/${r}" data-texto="${esc(g.t + ' ' + t)}" class="sub ${itemActivo(r, patron) ? 'activo' : ''}" ${itemActivo(r, patron) ? 'aria-current="page"' : ''}><span>${t}</span>${badge ? `<span class="contador" data-contador="${badge}" hidden></span>` : ''}</a>`).join('')}
        </details>`).join('')}
    <div class="menu-pie">
      ${E.roles.length > 1 ? '<button class="menu-boton" data-ver-como><span class="ic">🔁</span><span>Ver como…</span></button>' : ''}
      <button class="menu-boton" data-salir><span class="ic">🚪</span><span>Cerrar sesión</span></button>
    </div>`;
  pintarContadores();
}

async function pintarContadores() {
  const n = await mensajeria.contarNoLeidos();
  document.querySelectorAll('[data-contador="noLeidos"]').forEach((el) => { el.textContent = n; el.hidden = !n; });
  $('#btn-menu')?.classList.toggle('con-aviso', n > 0);
}

function abrirMenu(si) {
  const app = $('#app');
  app.classList.toggle('menu-abierto', si);
  $('#btn-menu')?.setAttribute('aria-expanded', si);
}

async function elegirRol() {
  if (E.roles.length < 2) return;
  const r = await ventana({
    titulo: 'Ver como',
    html: `<div class="lista">${E.roles.map((r) => `<button class="fila fila-boton" data-r="${r}"><b>${ROL[r]}</b>${r === E.rol ? '<span class="ok">✓</span>' : ''}</button>`).join('')}</div>`,
    alAbrir: (caja, cerrar) => caja.querySelectorAll('[data-r]').forEach((b) => (b.onclick = () => cerrar(b.dataset.r))),
  });
  if (r) { cambiarRol(r); ir('#/inicio'); }
}

// ---------------------------------------------------------------- Inicio por rol
async function inicio() {
  if (E.rol === 'admin') return admin.inicio(main());
  if (E.rol === 'profesor') return profe.inicio(main());
  if (viendoHijo()) return familia.estudiante(main(), { est: E.persona, inicio: 1 });
  return familia.inicio(main());
}

// ---------------------------------------------------------------- Entrar
function pantallaEntrar(modo = 'entrar') {
  const app = $('#app');
  delete app.dataset.armado;
  const registro = modo === 'registro';
  app.innerHTML = `
    <div class="entrada">
      <div class="entrada-caja">
        <div class="marca"><img class="logo-grande" src="img/logo-complex.svg" alt="Complex_"><p>Tu colegio, en un solo lugar.</p></div>
        <form id="f-entrar" class="form" novalidate>
          ${registro ? `
            <label>Nombres<input name="nombres" autocomplete="given-name" required></label>
            <label>Apellidos<input name="apellidos" autocomplete="family-name" required></label>` : ''}
          <label>${registro ? 'Correo' : 'Correo o número de documento'}<input name="correo" type="${registro ? 'email' : 'text'}" autocomplete="username" ${registro ? 'inputmode="email"' : ''} autocapitalize="off" required></label>
          <label>Contraseña<input name="clave" type="password" autocomplete="${registro ? 'new-password' : 'current-password'}" minlength="6" required></label>
          <button class="btn btn-primario btn-ancho" type="submit">${registro ? 'Crear cuenta' : 'Entrar'}</button>
          <p class="error" id="err-entrar" role="alert"></p>
        </form>
        ${registro ? '' : '<button class="btn btn-ancho" id="btn-huella" hidden>👆 Entrar con huella</button>'}
        <div class="entrada-pie">
          ${registro ? '<button class="btn-link" data-ir="entrar">Ya tengo cuenta</button>' : '<button class="btn-link" data-ir="registro">Crear cuenta</button> · <button class="btn-link" data-ir="olvido">Olvidé mi contraseña</button>'}
        </div>
        <div class="separador"><span>o</span></div>
        <button class="btn btn-ancho" id="btn-demo">Probar el modo demo</button>
        ${botonInstalar('btn btn-ancho btn-instalar')}
        <p class="nota-pie">v${esc(APP_VERSION)}</p>
      </div>
    </div>`;
  app.querySelectorAll('[data-ir]').forEach((b) => (b.onclick = () => (b.dataset.ir === 'olvido' ? olvido() : pantallaEntrar(b.dataset.ir))));
  $('#btn-demo').onclick = entrarDemo;
  // Entrar con huella (llave de acceso): solo si el equipo la tiene
  const bHuella = $('#btn-huella');
  if (bHuella) huellaEnEsteEquipo().then((si) => { bHuella.hidden = !si; });
  bHuella?.addEventListener('click', async () => {
    const err = $('#err-entrar');
    err.textContent = '';
    bHuella.disabled = true;
    try {
      if (E.db.modo !== 'real') E.db = await crearDbSupabase();
      await E.db.auth.entrarConHuella();
      pref('modo', 'real');
      desbloqueada = true;
      await arrancarSesion();
    } catch (er) { err.textContent = er.message; } finally { bHuella.disabled = false; }
  });
  $('#f-entrar').onsubmit = async (e) => {
    e.preventDefault();
    const d = leerForm(e.target);
    const err = $('#err-entrar');
    err.textContent = '';
    if (!d.correo || !d.clave) return (err.textContent = 'Escribe tu correo y tu contraseña.');
    if (registro && (!d.nombres || !d.apellidos)) return (err.textContent = 'Escribe tus nombres y apellidos.');
    const b = e.target.querySelector('[type=submit]');
    b.disabled = true;
    try {
      if (E.db.modo !== 'real') E.db = await crearDbSupabase();
      if (registro) {
        const r = await E.db.auth.signUp(d.correo, d.clave, { nombres: d.nombres, apellidos: d.apellidos });
        if (r.necesitaConfirmar) {
          await ventana({ titulo: 'Revisa tu correo', html: `<p>Te enviamos un enlace a <b>${esc(d.correo)}</b> para confirmar tu cuenta. Después vuelve y entra.</p>`, botones: [{ texto: 'Entendido' }] });
          return pantallaEntrar('entrar');
        }
      } else {
        // Las personas creadas por el colegio entran con su número de documento
        const usuario = d.correo.includes('@') ? d.correo : d.correo.replace(/[^\dA-Za-z]/g, '').toLowerCase() + '@usuarios.complex';
        await E.db.auth.signIn(usuario, d.clave);
      }
      pref('modo', 'real');
      desbloqueada = true;
      await arrancarSesion();
      if (!registro) ofrecerHuella();
    } catch (er) {
      err.textContent = er.message;
    } finally { b.disabled = false; }
  };
}

// ¿Esta persona pidió la huella al abrir Complex_ EN ESTE dispositivo? Solo si la activó aquí
// (una llave creada en otro celular no basta: este podría no tenerla y quedaría bloqueado).
async function pideHuella() {
  return E.db.modo === 'real' && !!window.PublicKeyCredential && pref(claveBloqueo()) === true;
}

function pantallaBloqueo() {
  const app = $('#app');
  delete app.dataset.armado;
  app.innerHTML = `
    <div class="entrada">
      <div class="entrada-caja">
        <div class="marca"><img class="logo-grande" src="img/logo-complex.svg" alt="Complex_"><p>🔒 Complex_ está bloqueada</p></div>
        <button class="btn btn-primario btn-ancho" id="btn-desbloquear">👆 Desbloquear con huella</button>
        <p class="error" id="err-bloqueo" role="alert"></p>
        <div class="entrada-pie"><button class="btn-link" id="btn-otra-cuenta">Entrar con contraseña u otra cuenta</button></div>
      </div>
    </div>`;
  const b = $('#btn-desbloquear');
  const intentar = async (silencioso) => {
    b.disabled = true;
    $('#err-bloqueo').textContent = '';
    try {
      await E.db.auth.entrarConHuella(); // verificación real en el servidor (renueva la sesión)
      desbloqueada = true;
      await arrancarSesion();
    } catch (e) { if (!silencioso) $('#err-bloqueo').textContent = e.message; }
    finally { b.disabled = false; }
  };
  b.onclick = () => intentar(false);
  $('#btn-otra-cuenta').onclick = salir;
  intentar(true); // la pide de una vez; si el navegador exige un toque, queda el botón
}

// Al volver a la app después de MIN_FUERA minutos en segundo plano, se bloquea otra vez
let fueraDesde = 0;
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'hidden') { fueraDesde = Date.now(); return; }
  if (!fueraDesde || !E.sesion || !desbloqueada || Date.now() - fueraDesde < MIN_FUERA * 60000) return;
  fueraDesde = 0;
  if (await pideHuella()) { desbloqueada = false; pantallaBloqueo(); }
});

// Después de entrar con contraseña: ofrecer la huella una sola vez por persona y dispositivo (como las apps de bancos)
async function ofrecerHuella() {
  const clave = 'huella_ofrecida_' + E.sesion?.user?.id;
  if (E.db.modo !== 'real' || !E.sesion || pref(clave)) return;
  if (pref(claveBloqueo()) === true || !(await E.db.auth.huellaDisponible())) return;
  try { await E.db.auth.huellas(); } catch { return; } // sin huella activada en el servidor: no molestar
  pref(clave, 1);
  const si = await ventana({
    titulo: 'Entrar con tu huella',
    html: '<p>¿Quieres que Complex_ te pida la huella cada vez que la abras en este dispositivo, en vez de la contraseña?</p><p class="ayuda">Tu huella no sale del celular: Complex_ solo guarda una llave de acceso. Puedes quitarla cuando quieras en "Más".</p>',
    botones: [{ texto: 'Ahora no' }, { texto: '👆 Activar', valor: true }],
  });
  if (si) await activarHuella();
}

async function activarHuella() {
  try { await E.db.auth.registrarHuella(); }
  catch (e) { if (!/ya tiene tu huella registrada/.test(e.message)) { aviso(e.message, 'error'); return false; } }
  pref(claveBloqueo(), true);
  aviso('Listo: Complex_ te pedirá la huella cada vez que la abras en este dispositivo');
  return true;
}

async function olvido() {
  await ventana({
    titulo: 'Recuperar contraseña',
    html: `<div class="form"><label>Correo<input name="correo" type="email" inputmode="email"></label><p class="ayuda">Te enviaremos un enlace para crear una contraseña nueva.</p></div>`,
    botones: [{ texto: 'Cancelar' }, { texto: 'Enviar enlace', antes: async (c) => {
      const { correo } = leerForm(c);
      if (!correo) throw new Error('Escribe tu correo.');
      if (E.db.modo !== 'real') E.db = await crearDbSupabase();
      await E.db.auth.resetPassword(correo);
      aviso('Listo. Revisa tu correo.');
    } }],
  });
}

async function entrarDemo() {
  const db = crearDbDemo();
  const usuarios = db.usuariosDemo();
  const grupos = ['admin', 'profesor', 'acudiente', 'estudiante'].map((r) => [r, usuarios.filter((u) => u.roles[0] === r)]);
  const id = await ventana({
    titulo: 'Modo demo: ¿quién eres?',
    html: `<p class="ayuda">Es un colegio inventado para probar Complex_. Lo que cambies se guarda solo en este equipo.</p>
      ${grupos.map(([r, l]) => `<h3 class="sub">${ROL[r]}</h3><div class="lista">${l.map((u) => `
        <button class="fila fila-boton" data-id="${u.id}"><span class="avatar">${esc(iniciales(u))}</span><span><b>${esc(nombre(u))}</b>${u.roles.length > 1 ? `<small>${u.roles.map((x) => ROL[x]).join(' · ')}</small>` : ''}</span></button>`).join('')}</div>`).join('')}
      <button class="btn-link" id="btn-reiniciar-demo">Reiniciar los datos del demo</button>`,
    alAbrir: (caja, cerrar) => {
      caja.querySelectorAll('[data-id]').forEach((b) => (b.onclick = () => cerrar(b.dataset.id)));
      caja.querySelector('#btn-reiniciar-demo').onclick = () => { db.reiniciarDemo(); aviso('Demo reiniciado'); cerrar(null); entrarDemo(); };
    },
  });
  if (!id) return;
  E.db = db;
  await db.auth.signIn(id);
  pref('modo', 'demo');
  await arrancarSesion();
}

// ---------------------------------------------------------------- Colegios
async function pantallaColegios() {
  aplicarMarca();
  const app = $('#app');
  delete app.dataset.armado;
  app.innerHTML = `
    <div class="entrada">
      <div class="entrada-caja ancha">
        <div class="marca"><img class="logo logo-img logo-complex" src="img/simbolo.svg" alt="Complex_"><h1>Hola, ${esc(E.yo.nombres || E.sesion.user.email)}</h1></div>
        ${E.colegios.length ? `<p class="ayuda">Elige el colegio:</p><div class="lista">${E.colegios.map((c) => `
          <button class="fila fila-boton" data-id="${c.id}"><span class="avatar">🏫</span><span><b>${esc(c.nombre)}</b><small>${esc([...new Set(E.membresias.filter((m) => m.colegio_id === c.id).map((m) => ROL[m.rol]))].join(' · '))}</small></span></button>`).join('')}</div>`
        : `<div class="aviso-caja"><p><b>Todavía no perteneces a ningún colegio.</b></p><p>Si eres profesor, acudiente o estudiante, pídele al colegio que te agregue con tu correo <b>${esc(E.sesion.user.email || '')}</b>.</p><p>Si administras un colegio, créalo aquí:</p></div>`}
        <button class="btn btn-ancho" id="btn-nuevo-colegio">＋ Crear un colegio</button>
        <button class="btn-link" id="btn-salir">Cerrar sesión</button>
      </div>
    </div>`;
  app.querySelectorAll('[data-id]').forEach((b) => (b.onclick = async () => { await elegirColegio(b.dataset.id); location.hash = '#/inicio'; navegar(); }));
  $('#btn-salir').onclick = salir;
  $('#btn-nuevo-colegio').onclick = async () => {
    const id = await ventana({
      titulo: 'Crear colegio',
      html: `<div class="form"><label>Nombre del colegio<input name="nombre" required></label><label>Ciudad<input name="ciudad"></label><p class="ayuda">Quedarás como administrador. Luego podrás agregar sedes, cursos, profesores y familias.</p></div>`,
      botones: [{ texto: 'Cancelar' }, { texto: 'Crear', antes: async (c) => {
        const d = leerForm(c);
        if (!d.nombre) throw new Error('Escribe el nombre del colegio.');
        return await E.db.rpc('crear_colegio', { p_nombre: d.nombre, p_ciudad: d.ciudad || null });
      } }],
    });
    if (!id) return;
    await cargarYo();
    await elegirColegio(id);
    aviso('Colegio creado');
    location.hash = '#/estructura';
    navegar();
  };
}

// ---------------------------------------------------------------- Perfil / Más
async function perfil() {
  const m = main();
  const tema = pref('tema') || 'auto';
  m.innerHTML = `
    <h1 class="titulo">Más</h1>
    <section class="tarjeta">
      <div class="fila"><span class="avatar grande">${esc(iniciales(E.yo))}</span><span><b>${esc(nombre(E.yo))}</b><small>${esc(E.sesion.user.email || '')}</small></span></div>
      <div class="form" id="f-perfil">
        <label>Nombres<input name="nombres" value="${esc(E.yo.nombres)}"></label>
        <label>Apellidos<input name="apellidos" value="${esc(E.yo.apellidos)}"></label>
        <label>Teléfono<input name="telefono" inputmode="tel" value="${esc(E.yo.telefono || '')}"></label>
        <button class="btn" id="btn-guardar-perfil">Guardar mis datos</button>
      </div>
    </section>
    ${'avisos_correo' in E.yo || E.db.modo === 'demo' ? `<section class="tarjeta"><h2>Avisos por correo</h2>
      <label class="fila"><input type="checkbox" id="chk-avisos" ${E.yo.avisos_correo !== false ? 'checked' : ''}><span><b>Avisarme por correo</b><small>Te escribimos a ${esc(E.sesion?.user?.email?.endsWith('@usuarios.complex') ? 'tu correo (aún no tienes uno registrado)' : E.sesion?.user?.email || E.yo.correo || 'tu correo')} cuando te llegue un mensaje o una circular.</small></span></label>
    </section>` : ''}
    <section class="tarjeta" id="sec-huella" hidden>
      <h2>Entrar con huella</h2>
      <p class="ayuda">Entra a Complex_ con la huella o el rostro de tu celular, sin escribir la contraseña. Tu huella no sale del celular: Complex_ solo guarda una llave de acceso.</p>
      <div class="lista" data-huellas></div>
      <label class="fila" data-bloqueo-fila hidden><input type="checkbox" data-bloqueo><span><b>Pedir la huella al abrir Complex_</b><small>Solo en este dispositivo: cada vez que abras la app, o vuelvas después de ${MIN_FUERA} minutos.</small></span></label>
      <button class="btn" data-activar-huella>👆 Activar en este dispositivo</button>
    </section>
    ${E.rol === 'admin' ? `<section class="tarjeta"><h2>Colegio</h2><a class="fila fila-boton" href="#/ajustes-colegio"><span>⚙️</span><span><b>Ajustes del colegio</b><small>Nombre, escala de notas</small></span></a></section>` : ''}
    <section class="tarjeta">
      <h2>Apariencia</h2>
      <div class="segmentos" role="radiogroup" aria-label="Modo oscuro">
        ${[['auto', 'Automático'], ['light', 'Claro'], ['dark', 'Oscuro']].map(([v, t]) => `<button role="radio" aria-checked="${tema === v}" class="${tema === v ? 'activo' : ''}" data-tema="${v}">${t}</button>`).join('')}
      </div>
    </section>
    <section class="tarjeta">
      ${E.roles.length > 1 ? `<button class="fila fila-boton" id="btn-cambiar-rol"><span>🔁</span><span><b>Ver como…</b><small>Ahora: ${ROL[E.rol]}</small></span></button>` : ''}
      <button class="fila fila-boton" id="btn-cambiar-clave"><span>🔑</span><span><b>Cambiar contraseña</b></span></button>
      <button class="fila fila-boton" id="btn-cambiar-colegio"><span>🏫</span><span><b>Cambiar de colegio</b></span></button>
      ${instalada() ? '' : '<button class="fila fila-boton" data-instalar><span>📲</span><span><b>Instalar la app</b><small>Android, iPhone y computador</small></span></button>'}
      <button class="fila fila-boton peligro" id="btn-salir"><span>🚪</span><span><b>Cerrar sesión</b></span></button>
    </section>
    <p class="nota-pie">Complex_ v${esc(APP_VERSION)}${E.db.modo === 'demo' ? ' · modo demo' : ''}</p>`;
  m.querySelectorAll('[data-tema]').forEach((b) => (b.onclick = () => { pref('tema', b.dataset.tema); aplicarTema(); perfil(); }));
  $('#btn-cambiar-clave')?.addEventListener('click', () => cambiarClave(false));
  $('#btn-guardar-perfil').onclick = async () => {
    const d = leerForm($('#f-perfil'));
    try {
      const [p] = await E.db.update('perfiles', { nombres: d.nombres, apellidos: d.apellidos, telefono: d.telefono || null }, { id: E.yo.id });
      Object.assign(E.yo, p || d);
      aviso('Datos guardados');
    } catch (e) { aviso(e.message, 'error'); }
  };
  $('#chk-avisos')?.addEventListener('change', async (e) => {
    try { await E.db.update('perfiles', { avisos_correo: e.target.checked }, { id: E.yo.id }); E.yo.avisos_correo = e.target.checked; aviso(e.target.checked ? 'Te avisaremos por correo' : 'Ya no te avisaremos por correo'); }
    catch (err) { e.target.checked = !e.target.checked; aviso(err.message, 'error'); }
  });
  $('#btn-cambiar-rol')?.addEventListener('click', elegirRol);
  $('#btn-cambiar-colegio').onclick = () => { E.colegio = null; navegar(); };
  $('#btn-salir').onclick = salir;
  if (E.db.modo === 'real' && window.PublicKeyCredential) pintarHuellas(m);
}

// Llaves de acceso de la persona (una por celular o administrador de contraseñas)
async function pintarHuellas(m) {
  const s = m.querySelector('#sec-huella');
  let l;
  try { l = await E.db.auth.huellas(); } catch { return; } // sin huella activada en el servidor: la sección no se muestra
  s.hidden = false;
  s.querySelector('[data-huellas]').innerHTML = l.length ? l.map((h) => `
    <div class="fila"><span class="avatar">🔑</span><span class="crece"><b>${esc(h.friendly_name || 'Llave de acceso')}</b><small>Activada el ${fecha(h.created_at)}${h.last_used_at ? ' · usada ' + fechaHora(h.last_used_at) : ''}</small></span>
      <button class="btn btn-chico btn-peligro" data-quitar-huella="${esc(h.id)}">Quitar</button></div>`).join('') : '<p class="ayuda">Aún no la has activado.</p>';
  s.querySelector('[data-activar-huella]').hidden = !(await E.db.auth.huellaDisponible());
  const chk = s.querySelector('[data-bloqueo]');
  s.querySelector('[data-bloqueo-fila]').hidden = !l.length;
  if (!l.length) pref(claveBloqueo(), false);
  chk.checked = !!l.length && pref(claveBloqueo()) === true;
  chk.onchange = async () => {
    if (chk.checked) { chk.checked = await activarHuella(); return pintarHuellas(m); } // comprueba que este dispositivo pueda usar la llave
    pref(claveBloqueo(), false);
    aviso('Complex_ ya no te pedirá la huella al abrir en este dispositivo');
  };
  s.querySelector('[data-activar-huella]').onclick = async () => { if (await activarHuella()) pintarHuellas(m); };
  s.querySelectorAll('[data-quitar-huella]').forEach((b) => (b.onclick = async () => {
    if (!(await confirmar('¿Quitar esta llave?', 'Con ella ya no podrás entrar con huella en ese dispositivo. Podrás activarla de nuevo.', 'Quitar'))) return;
    try { await E.db.auth.borrarHuella(b.dataset.quitarHuella); aviso('Llave quitada'); pintarHuellas(m); } catch (e) { aviso(e.message, 'error'); }
  }));
}

async function salir() {
  dejarDeEscuchar?.();
  dejarDeEscuchar = null;
  await E.db.auth.signOut();
  E.sesion = null; E.colegio = null; E.yo = null;
  // que el siguiente usuario de este equipo no herede pestañas, hijos ni datos del anterior
  E._personasDe = null; E.personas = []; E.persona = null; E.base = null; E.perfiles = new Map(); E.colegios = []; E.membresias = [];
  pref('modo', null);
  location.hash = '';
  navegar();
}

// ---------------------------------------------------------------- Arranque
async function arrancarSesion() {
  E.sesion = await E.db.auth.session();
  if (!E.sesion) return navegar();
  if (!desbloqueada && (await pideHuella())) return pantallaBloqueo();
  desbloqueada = true;
  await cargarYo();
  const guardado = pref('colegio');
  if (E.colegios.some((c) => c.id === guardado)) await elegirColegio(guardado);
  else if (E.colegios.length === 1) await elegirColegio(E.colegios[0].id);
  else E.colegio = null;
  if (E.colegio) base().catch(() => {}); // los datos del colegio se piden ya, mientras se arma la pantalla
  escucharMensajes();
  navegar();
}

// Mensajes al instante: cuando le llega un mensaje a la persona, la bandeja y el contador se actualizan solos
let dejarDeEscuchar = null;
function escucharMensajes() {
  dejarDeEscuchar?.();
  dejarDeEscuchar = null;
  if (!E.sesion || !E.yo || E.db.modo !== 'real') return;
  dejarDeEscuchar = E.db.escuchar('mensaje_destinatarios', `perfil_id=eq.${E.yo.id}`, (p) => {
    if (p.eventType !== 'INSERT') return;
    E.db.olvidar();
    window.dispatchEvent(new Event('complex:mensajes'));
    if (/^#\/(bandeja|inicio|cartelera)?(\?|$)/.test(location.hash || '#/')) navegar();
    aviso('📩 Te llegó un mensaje nuevo');
  });
}

async function arrancar() {
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  aplicarTema();
  window.addEventListener('hashchange', navegar);
  try {
    E.db = pref('modo') === 'demo' ? crearDbDemo() : await crearDbSupabase();
  } catch (e) {
    // Sin internet al abrir: se puede seguir con el demo
    console.warn(e);
    E.db = crearDbDemo();
  }
  E.db.auth.onChange(async (evento) => {
    const s = await E.db.auth.session();
    if (!!s !== !!E.sesion) await arrancarSesion();
    // Llegó desde el enlace de "Olvidé mi contraseña": pedir la contraseña nueva
    if (evento === 'PASSWORD_RECOVERY') cambiarClave(true);
  });
  await arrancarSesion();
  if (new URLSearchParams(location.search).has('instalar') && !instalada()) {
    history.replaceState(null, '', location.pathname + location.hash);
    // El aviso de Chrome necesita un toque de la persona: se muestra un botón grande
    setTimeout(() => {
      const b = document.createElement('button');
      b.className = 'aviso ver aviso-version';
      b.textContent = '📲 Toca aquí para instalar Complex_';
      b.onclick = () => { b.remove(); instalarApp(); };
      document.body.appendChild(b);
    }, 800);
  }
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    const habiaControlador = !!navigator.serviceWorker.controller;
    // updateViaCache 'none': el navegador nunca usa una copia vieja de sw.js
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {});
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!habiaControlador || sessionStorage.getItem('complex_version_objetivo') === APP_VERSION) return; // esta página ya es la nueva
      if (Date.now() - cargadaEn < 20000) return location.reload(); // recién abierta: aún no hay nada que perder
      actualizacionPendiente = true;
      avisoVersion();
    });
  }
  buscarVersion(true);
}

// ---------------------------------------------------------------- Versiones nuevas
// Al abrir la app y cada vez que vuelve al frente se compara con version.txt del servidor. Si hay una nueva:
//  - recién abierta (primeros 20 s): se recarga sola, una vez por versión;
//  - en uso: aviso "Toca para actualizar" (sin borrar lo que se está escribiendo) y se aplica sola
//    al volver después de MIN_FUERA minutos (cuando también se pide la huella otra vez).
const cargadaEn = Date.now();
let actualizacionPendiente = false;
let ocultaDesde = 0;

function avisoVersion() {
  if (document.querySelector('.aviso-version')) return;
  const b = document.createElement('button');
  b.className = 'aviso ver aviso-version';
  b.textContent = '🔄 Hay una versión nueva de Complex_. Toca para actualizar.';
  b.onclick = () => location.reload();
  document.body.appendChild(b);
}

async function buscarVersion(puedeRecargar) {
  if (!/^\d{14}$/.test(APP_VERSION) || !navigator.onLine) return; // en desarrollo (dev) o sin internet, nada
  let v;
  try { v = (await (await fetch('version.txt', { cache: 'no-store' })).text()).trim(); } catch { return; }
  if (!/^\d{14}$/.test(v) || v <= APP_VERSION) return;
  const reg = await navigator.serviceWorker?.getRegistration().catch(() => null);
  await reg?.update().catch(() => {});
  const k = 'complex_recarga_' + v;
  if (puedeRecargar && (Date.now() - cargadaEn < 20000 || !document.querySelector('.ventana')) && !sessionStorage.getItem(k)) {
    sessionStorage.setItem(k, '1');
    sessionStorage.setItem('complex_version_objetivo', v);
    setTimeout(() => location.reload(), 1500); // un momento para que el service worker nuevo tome los archivos
    return;
  }
  actualizacionPendiente = true;
  avisoVersion();
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { ocultaDesde = Date.now(); return; }
  const largo = !!ocultaDesde && Date.now() - ocultaDesde >= MIN_FUERA * 60000;
  ocultaDesde = 0;
  if (largo && actualizacionPendiente) return location.reload();
  buscarVersion(largo);
});

// Exportar a Excel (CSV) las tablas de la pantalla actual, como "Exportar xls / csv" de Phidias.
// Los campos de edición se exportan con su valor; separador ";" y coma decimal (Excel en español).
function exportarPantalla() {
  const tablas = [...main().querySelectorAll('table')].filter((t) => t.offsetParent !== null && !t.closest('.fechas-importantes, details:not([open])'));
  if (!tablas.length) return aviso('Esta pantalla no tiene tablas para exportar.', 'error');
  const valor = (celda) => {
    const campo = celda.querySelector('input, select, textarea');
    let t = campo ? (campo.tagName === 'SELECT' ? campo.selectedOptions[0]?.text || '' : campo.value) : celda.innerText;
    t = t.replace(/\s+/g, ' ').trim();
    if (/^-?\d+\.\d+$/.test(t)) t = t.replace('.', ',');
    if (/^[=+\-@\t\r]/.test(t) && !/^-?\d+([.,]\d+)?$/.test(t)) t = "'" + t; // que Excel no lo tome como fórmula
    return '"' + t.replace(/"/g, '""') + '"';
  };
  const lineas = [];
  for (const [i, t] of tablas.entries()) {
    if (i) lineas.push('');
    // Celdas combinadas (un criterio sobre varias actividades): ocupan sus columnas para que todo quede alineado en Excel
    const grilla = [];
    [...t.rows].forEach((tr, r) => {
      grilla[r] ??= [];
      let c = 0;
      for (const td of tr.cells) {
        while (grilla[r][c] !== undefined) c++;
        const cs = Math.max(1, td.colSpan || 1), rs = Math.max(1, td.rowSpan || 1), v = valor(td);
        for (let y = 0; y < rs; y++) for (let x = 0; x < cs; x++) (grilla[r + y] ??= [])[c + x] = y || x ? '""' : v;
        c += cs;
      }
    });
    for (const f of grilla) lineas.push(Array.from(f, (x) => x ?? '""').join(';'));
  }
  const titulo = (main().querySelector('h1')?.innerText || 'complex').replace(/[^\w\sáéíóúñÁÉÍÓÚÑ-]/g, '').trim().replace(/\s+/g, '_').slice(0, 60) || 'complex';
  const url = URL.createObjectURL(new Blob(['\ufeff' + lineas.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = `${titulo}.csv`; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  aviso('Exportado a Excel (CSV)');
}

// Cambiar contraseña (Perfil) o crear una nueva al llegar desde el enlace de recuperación
export async function cambiarClave(desdeEnlace) {
  await ventana({
    titulo: desdeEnlace ? 'Crea tu contraseña nueva' : 'Cambiar contraseña',
    html: `<div class="form">
      ${desdeEnlace ? '<p class="ayuda">Entraste con el enlace de recuperación. Escribe tu contraseña nueva.</p>' : ''}
      <label>Contraseña nueva<input type="password" name="clave1" autocomplete="new-password" minlength="8"></label>
      <label>Repítela<input type="password" name="clave2" autocomplete="new-password" minlength="8"></label>
      <p class="ayuda">Mínimo 8 caracteres. Usa letras y números.</p></div>`,
    botones: [{ texto: 'Cancelar' }, { texto: 'Guardar', antes: async (caja) => {
      const a = caja.querySelector('[name=clave1]').value, b2 = caja.querySelector('[name=clave2]').value;
      if (a.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres.');
      if (!/[A-Za-zÀ-ÿ]/.test(a) || !/\d/.test(a)) throw new Error('Usa letras y números.');
      if (a !== b2) throw new Error('Las dos contraseñas no coinciden.');
      await E.db.auth.updatePassword(a);
      aviso('Contraseña cambiada');
      return true;
    } }],
  });
}

window.complex = { E, ir }; // para depurar desde la consola
arrancar();
