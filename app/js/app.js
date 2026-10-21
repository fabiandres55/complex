// Complex_ — arranque, enrutador y armazón de la app.
import { crearDbSupabase, crearDbDemo } from './db.js';
import { E, pref, cargarYo, elegirColegio, cambiarRol, cargarPersonas, elegirPersona, personaActiva, viendoHijo, logoHTML, aplicarMarca } from './estado.js';
import { esc, $, aviso, ventana, leerForm, ROL, nombre, iniciales, etiquetarTablas } from './ui.js';
import { APP_VERSION } from './config.js';
import * as admin from './pantallas/admin.js';
import * as profe from './pantallas/profesor.js';
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
  ['clases', () => profe.clases(main())],
  ['notas/:asig', (p) => profe.planilla(main(), p)],
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
  if (yo === navegando) { main().scrollTop = 0; window.scrollTo(0, 0); etiquetarTablas(main()); }
}

// ---------------------------------------------------------------- Armazón (REA Phidias §1.2)
// Menú lateral izquierdo agrupado (Tablero · Comunicación · Comunidad · Academia · Perfil),
// con buscador "Filtrar menú" y, para acudientes, pestañas de persona (yo + cada hijo).
const COMUNICACION = { t: 'Comunicación', ic: '💬', items: [['bandeja', 'Bandeja de entrada', 'noLeidos'], ['redactar', 'Redactar mensaje'], ['enviados', 'Enviados'], ['cartelera', 'Cartelera'], ['circulares', 'Circulares']] };
function menuDe() {
  const lista = menuBase();
  const i = lista.findIndex((g) => g.t === 'Perfil');
  const pas = { r: 'pasarelas', ic: '⛓', t: 'Pasarelas' };
  if (i >= 0) lista.splice(i, 0, pas); else lista.push(pas);
  return lista;
}
function menuBase() {
  const est = personaActiva();
  const hist = est ? [[`estudiante/${est}?tab=notas`, 'Historial de notas'], [`estudiante/${est}?tab=asistencia`, 'Asistencia']] : [];
  const tablero = { r: 'inicio', ic: '▦', t: 'Tablero' };
  const perfilG = (extra = []) => ({ t: 'Perfil', ic: '👤', items: [['perfil', 'Mi cuenta y ajustes'], ...extra, ['ayuda', 'Ayuda']] });
  if (E.rol === 'admin') return [tablero, COMUNICACION,
    { t: 'Comunidad', ic: '👥', items: [['calendario', 'Calendario'], ['personas', 'Personas'], ['ausencias', 'Ausencias reportadas'], ['procesos', 'Procesos en línea'], ['archivos', 'Archivos']] },
    { t: 'Académico', ic: '🎓', items: [['estructura', 'Estructura del colegio'], ['horario', 'Horarios'], ['planeaciones', 'Planeaciones'], ['reportes', 'Reportes']] },
    { t: 'Tesorería', ic: '💰', items: [['tesoreria?tab=cartera', 'Cartera'], ['tesoreria?tab=facturar', 'Facturar'], ['tesoreria?tab=pagos', 'Pagos'], ['tesoreria?tab=conceptos', 'Conceptos']] },
    perfilG([['ajustes-colegio', 'Ajustes del colegio']])];
  if (E.rol === 'profesor') return [tablero, COMUNICACION,
    { t: 'Comunidad', ic: '👥', items: [['calendario', 'Calendario'], ['procesos', 'Procesos en línea'], ['archivos', 'Archivos']] },
    { t: 'Academia', ic: '🎓', items: [['aula', 'Aula'], ['horario', 'Mi horario'], ['clases', 'Notas y asistencia'], ['planeaciones', 'Planeaciones']] },
    perfilG()];
  if (E.rol === 'estudiante') return [tablero, COMUNICACION,
    { t: 'Comunidad', ic: '👥', items: [['calendario', 'Calendario'], [`estudiante/${E.yo.id}?tab=observador`, 'Seguimientos'], ['procesos', 'Procesos en línea'], ['archivos', 'Archivos']] },
    { t: 'Academia', ic: '🎓', items: [['aula', 'Aula'], ['horario', 'Horario'], ...hist] },
    perfilG()];
  // acudiente
  if (viendoHijo()) return [tablero,
    { t: 'Academia', ic: '🎓', items: [['aula', 'Aula'], ['horario', 'Horario'], ...hist] },
    { t: 'Comunidad', ic: '👥', items: [['calendario', 'Calendario'], [`estudiante/${est}?tab=observador`, 'Seguimientos'], ['procesos', 'Procesos en línea'], ['archivos', 'Archivos']] },
    { t: 'Perfil', ic: '👤', items: [[`estudiante/${est}?tab=ficha`, 'Ficha médica']] },
    { t: 'Comunicación', ic: '💬', items: [['bandeja', 'Bandeja de entrada', 'noLeidos'], ['circulares', 'Circulares']] },
    { t: 'Tesorería', ic: '💰', items: [[`estado-cuenta/${est}`, 'Estado de cuenta']] }];
  return [tablero, COMUNICACION, { t: 'Comunidad', ic: '👥', items: [['calendario', 'Calendario'], ['procesos', 'Procesos en línea'], ['archivos', 'Archivos']] }, { t: 'Tesorería', ic: '💰', items: [['tesoreria', 'Consolidado']] }, perfilG()];
}
const SECCION = { 'curso/:id': 'estructura', 'notas/:asig': 'clases', 'asistencia/:asig': 'clases', 'circular/:id': 'circulares', 'mensaje/:id': 'bandeja', 'aula/:asig': 'aula', 'tarea/:id': 'aula', 'examen/:id': 'aula', 'estado-cuenta/:est': 'tesoreria', 'proceso/:id': 'procesos', 'proceso/:id/respuestas': 'procesos' };

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
      await arrancarSesion();
    } catch (er) {
      err.textContent = er.message;
    } finally { b.disabled = false; }
  };
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
    ${E.rol === 'admin' ? `<section class="tarjeta"><h2>Colegio</h2><a class="fila fila-boton" href="#/ajustes-colegio"><span>⚙️</span><span><b>Ajustes del colegio</b><small>Nombre, escala de notas</small></span></a></section>` : ''}
    <section class="tarjeta">
      <h2>Apariencia</h2>
      <div class="segmentos" role="radiogroup" aria-label="Modo oscuro">
        ${[['auto', 'Automático'], ['light', 'Claro'], ['dark', 'Oscuro']].map(([v, t]) => `<button role="radio" aria-checked="${tema === v}" class="${tema === v ? 'activo' : ''}" data-tema="${v}">${t}</button>`).join('')}
      </div>
    </section>
    <section class="tarjeta">
      ${E.roles.length > 1 ? `<button class="fila fila-boton" id="btn-cambiar-rol"><span>🔁</span><span><b>Ver como…</b><small>Ahora: ${ROL[E.rol]}</small></span></button>` : ''}
      <button class="fila fila-boton" id="btn-cambiar-colegio"><span>🏫</span><span><b>Cambiar de colegio</b></span></button>
      ${instalada() ? '' : '<button class="fila fila-boton" data-instalar><span>📲</span><span><b>Instalar la app</b><small>Android, iPhone y computador</small></span></button>'}
      <button class="fila fila-boton peligro" id="btn-salir"><span>🚪</span><span><b>Cerrar sesión</b></span></button>
    </section>
    <p class="nota-pie">Complex_ v${esc(APP_VERSION)}${E.db.modo === 'demo' ? ' · modo demo' : ''}</p>`;
  m.querySelectorAll('[data-tema]').forEach((b) => (b.onclick = () => { pref('tema', b.dataset.tema); aplicarTema(); perfil(); }));
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
}

async function salir() {
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
  await cargarYo();
  const guardado = pref('colegio');
  if (E.colegios.some((c) => c.id === guardado)) await elegirColegio(guardado);
  else if (E.colegios.length === 1) await elegirColegio(E.colegios[0].id);
  else E.colegio = null;
  navegar();
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
  E.db.auth.onChange(async () => {
    const s = await E.db.auth.session();
    if (!!s !== !!E.sesion) arrancarSesion();
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
    navigator.serviceWorker.register('sw.js').catch(() => {});
    // Cuando se publica una versión nueva, se avisa (sin interrumpir lo que la persona está escribiendo)
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!habiaControlador) return;
      const b = document.createElement('button');
      b.className = 'aviso ver aviso-version';
      b.textContent = '🔄 Hay una versión nueva de Complex_. Toca para actualizar.';
      b.onclick = () => location.reload();
      document.body.appendChild(b);
    });
  }
}

window.complex = { E, ir }; // para depurar desde la consola
arrancar();
