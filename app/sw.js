// Service worker de Complex_: guarda la app para abrirla rápido y sin internet.
// Los datos (Supabase) siempre van a la red.
const VERSION = 'complex-20261022172802';
const ARCHIVOS = [
  './', './index.html', './estilos.css', './estilos-rea.css', './manifest.webmanifest', './img/icono.svg', './img/simbolo.svg', './img/logo-complex.svg',
  './js/app.js', './js/config.js', './js/db.js', './js/demo-semilla.js', './js/ui.js', './js/estado.js', './js/calculos.js',
  './js/pantallas/comun.js', './js/pantallas/admin.js', './js/pantallas/profesor.js', './js/pantallas/planilla.js', './js/pantallas/boletin_docente.js', './js/pantallas/notas_util.js', './js/pantallas/destinos.js', './js/pantallas/seguimientos.js', './js/pantallas/docencia.js', './js/pantallas/familia_perfil.js', './js/pantallas/familia.js', './js/pantallas/circulares.js', './js/pantallas/planeaciones.js', './js/pantallas/mensajeria.js', './js/pantallas/aula.js', './js/pantallas/calendario.js', './js/pantallas/tesoreria.js', './js/pantallas/comunidad.js', './js/pantallas/procesos.js', './js/pantallas/tablero.js', './js/pantallas/certificados.js', './js/pantallas/usuarios.js', './js/pantallas/horario.js', './js/pantallas/reportes.js', './js/pantallas/examenes.js', './js/pantallas/ayuda.js', './js/pantallas/carnet.js',
];

self.addEventListener('install', (e) => {
  // cache: 'reload': bajar los archivos frescos del servidor, no la copia de 10 min del navegador (GitHub Pages: max-age=600)
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ARCHIVOS.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // Red primero (para tener siempre lo último); si no hay internet, lo guardado.
  // cache: 'no-cache' revalida con el servidor (304 si no cambió): sin esto, tras publicar se seguían viendo archivos viejos hasta 10 min.
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' }).then((r) => {
      const copia = r.clone();
      caches.open(VERSION).then((c) => c.put(e.request, copia));
      return r;
    }).catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html')))
  );
});
