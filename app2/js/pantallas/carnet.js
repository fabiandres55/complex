// Carnet estudiantil digital con código QR (REA Phidias: carnet con QR).
// Lo ven el estudiante, su familia y el colegio; se muestra en el celular o se imprime.
import { E, base, perfiles, logoHTML, fotos } from '../estado.js';
import { esc, nombre, iniciales, vacio, fecha, hoy } from '../ui.js';

let cargaQR = null;
function cargarQR() {
  // Librería pequeña de QR (sin dependencias), versión fija desde un CDN permitido
  cargaQR ||= new Promise((ok, mal) => {
    if (window.qrcode) return ok(window.qrcode);
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js';
    // Integridad (SRI): si el CDN entregara un archivo distinto, el navegador no lo ejecuta
    s.integrity = 'sha384-8FWZA6BGMXhsfO+BLtrJK0We6gg5o1JyO8xQm6peWDEUs17ACA5ziE/NIAkl9z2k'; s.crossOrigin = 'anonymous';
    s.onload = () => ok(window.qrcode); s.onerror = () => { cargaQR = null; mal(new Error('No se pudo cargar el generador de QR (¿sin internet?)')); };
    document.head.appendChild(s);
  });
  return cargaQR;
}

export async function carnet(m, p) {
  const b = await base();
  await perfiles([p.est]);
  const est = E.perfiles.get(p.est);
  if (!est) { m.innerHTML = vacio('No encontré a ese estudiante.'); return; }
  const mats = (await E.db.select('matriculas', { eq: { estudiante_id: p.est } })).filter((x) => x.estado === 'activa');
  const mat = mats.find((x) => b.cursos.some((c) => c.id === x.curso_id));
  const curso = mat && b.cursoPorId.get(mat.curso_id);
  const grado = curso && b.gradoPorId.get(curso.grado_id);
  const [ficha] = await E.db.select('fichas_medicas', { eq: { estudiante_id: p.est } }).catch(() => []);
  const doc = [est.tipo_documento, est.numero_documento].filter(Boolean).join(' ');
  const foto = (await fotos([est.id])).get(est.id);
  const codigo = `COMPLEX|${E.colegio.id}|${est.id}|${b.anio?.anio || new Date().getFullYear()}`;
  m.innerHTML = `
    <div class="cabecera no-imprimir"><a class="btn-icono" href="#/estudiante/${esc(p.est)}" aria-label="Volver">←</a><h1 class="titulo">Carnet estudiantil</h1>
      <div class="acciones"><button class="btn btn-primario" data-imprimir>🖨 Imprimir</button></div></div>
    <article class="carnet">
      <header>${logoHTML('logo')}<div><b>${esc(E.colegio.nombre)}</b><small>${esc([E.colegio.nit ? 'NIT ' + E.colegio.nit : '', E.colegio.ciudad].filter(Boolean).join(' · '))}</small></div></header>
      <div class="carnet-cuerpo">
        <span class="carnet-foto">${foto ? `<img src="${esc(foto)}" alt="Foto de ${esc(nombre(est))}">` : esc(iniciales(est))}</span>
        <div class="carnet-datos">
          <b class="carnet-nombre">${esc(nombre(est))}</b>
          <span>${esc(doc || 'Documento sin registrar')}</span>
          <span>${curso ? `Curso <b>${esc(curso.nombre)}</b> · ${esc(grado?.nombre || '')}` : 'Sin curso este año'}</span>
          ${ficha?.tipo_sangre ? `<span>RH <b>${esc(ficha.tipo_sangre)}</b></span>` : ''}
          <span class="carnet-rol">ESTUDIANTE ${esc(b.anio?.anio || '')}</span>
        </div>
        <div class="carnet-qr" data-qr aria-label="Código QR del carnet"></div>
      </div>
      <footer><small>Válido para el año lectivo ${esc(b.anio?.anio || '')} · Expedido ${fecha(hoy())}</small>${ficha?.contacto_telefono ? `<small>En caso de emergencia: ${esc(ficha.contacto_nombre || '')} ${esc(ficha.contacto_telefono)}</small>` : ''}</footer>
    </article>
    <p class="ayuda no-imprimir">Muestra este carnet en la portería o la biblioteca. El código QR identifica al estudiante en el colegio.</p>`;
  const caja = m.querySelector('[data-qr]');
  try {
    const qrcode = await cargarQR();
    const q = qrcode(0, 'M');
    q.addData(codigo);
    q.make();
    caja.innerHTML = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  } catch (e) {
    caja.innerHTML = `<small>${esc(e.message)}</small>`;
  }
}
