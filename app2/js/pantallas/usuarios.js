// Creación de usuarios por el colegio (como Phidias: cada persona tiene su usuario,
// aunque no tenga correo — entra con su número de documento), importación desde
// Excel/CSV y restablecimiento de contraseñas. Usa la Edge Function "admin-usuarios".
import { E, base, recargarBase } from '../estado.js';
import { esc, aviso, ventana, leerForm, confirmar, nombre, ROL } from '../ui.js';
import { camposHTML } from './comun.js';

const TIPOS_DOC = [['TI', 'Tarjeta de identidad'], ['CC', 'Cédula de ciudadanía'], ['RC', 'Registro civil'], ['CE', 'Cédula de extranjería'], ['PA', 'Pasaporte'], ['NUIP', 'NUIP']];
const usuarioVisible = (u) => (u?.endsWith('@usuarios.complex') ? u.split('@')[0] : u);

// Muestra las credenciales creadas, listas para imprimir y entregar
export function mostrarCredenciales(resultados) {
  const ok = resultados.filter((r) => r.ok), mal = resultados.filter((r) => !r.ok);
  return ventana({
    titulo: 'Usuarios creados',
    html: `
      <p class="ayuda">${ok.length} listo(s)${mal.length ? ` · <span class="alerta">${mal.length} con error</span>` : ''}. Entrega a cada persona su usuario y contraseña. <b>Las contraseñas solo se muestran ahora.</b></p>
      <div class="credenciales">${ok.map((r) => `
        <div class="credencial">
          <b>${esc(`${r.nombres || ''} ${r.apellidos || ''}`.trim())}</b><small>${ROL[r.rol] || ''} · ${esc(E.colegio.nombre)}</small>
          <div>Usuario: <code>${esc(usuarioVisible(r.usuario))}</code></div>
          <div>Contraseña: ${r.clave ? `<code>${esc(r.clave)}</code>` : '<i>ya tenía cuenta (usa su contraseña)</i>'}</div>
          <small>Entra en la app Complex_ → "Correo o número de documento".</small>
        </div>`).join('')}</div>
      ${mal.length ? `<h3 class="sub">Con error</h3><div class="lista">${mal.map((r) => `<div class="fila"><span class="crece"><b>${esc(`${r.nombres || ''} ${r.apellidos || ''}`)}</b><small class="alerta">${esc(r.error)}</small></span></div>`).join('')}</div>` : ''}`,
    botones: [{ texto: 'Cerrar' }, { texto: '🖨 Imprimir credenciales', antes: () => { document.body.classList.add('imprimiendo-ventana'); window.print(); document.body.classList.remove('imprimiendo-ventana'); return false; } }],
  });
}

// Diálogo "Agregar persona": crear usuario nuevo (por documento o correo) o agregar a alguien con cuenta
export async function agregarPersona(rolInicial, alListo) {
  const r = await ventana({
    titulo: 'Agregar persona',
    html: camposHTML([
      { name: 'rol', label: 'Rol', tipo: 'select', opciones: Object.entries(ROL), def: rolInicial || 'estudiante' },
      { name: 'nombres', label: 'Nombres' },
      { name: 'apellidos', label: 'Apellidos' },
      { name: 'tipo_documento', label: 'Tipo de documento', tipo: 'select', opciones: TIPOS_DOC, def: rolInicial === 'estudiante' || !rolInicial ? 'TI' : 'CC' },
      { name: 'documento', label: 'Número de documento' },
      { name: 'correo', label: 'Correo (opcional)', tipo: 'email' },
      { name: 'telefono', label: 'Celular (opcional)' },
    ]) + `<p class="ayuda">Se crea su usuario: entrará con su <b>número de documento</b> (o su correo, si lo pones) y una contraseña que verás al terminar. Si ya tiene cuenta en Complex_ con ese correo, solo se agrega al colegio.</p>`,
    botones: [{ texto: 'Cancelar' }, { texto: 'Crear usuario', antes: async (c) => {
      const d = leerForm(c);
      if (!d.nombres) throw new Error('Escribe los nombres.');
      if (!d.documento && !d.correo) throw new Error('Escribe el número de documento o el correo.');
      if (d.correo && !/^\S+@\S+\.\S+$/.test(d.correo)) throw new Error('El correo no es válido.');
      const { resultados } = await E.db.funcion('admin-usuarios', { accion: 'crear', colegio_id: E.colegio.id, personas: [d] });
      if (!resultados[0]?.ok) throw new Error(resultados[0]?.error || 'No se pudo crear');
      return resultados;
    } }],
  });
  if (r) { await mostrarCredenciales(r); alListo?.(); }
}

// ---------------------------------------------------------------- Importar desde Excel (CSV)
const COLUMNAS = ['rol', 'nombres', 'apellidos', 'tipo_documento', 'documento', 'correo', 'telefono', 'curso', 'acudiente_de'];
const ROL_DE = { estudiante: 'estudiante', alumno: 'estudiante', alumna: 'estudiante', profesor: 'profesor', docente: 'profesor', profesora: 'profesor', acudiente: 'acudiente', padre: 'acudiente', madre: 'acudiente', familiar: 'acudiente', admin: 'admin', administrador: 'admin' };
const norm = (s) => String(s || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function leerCSV(texto) {
  const sep = (texto.split('\n')[0].match(/;/g) || []).length >= (texto.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
  const filas = []; let fila = [], campo = '', comillas = false;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (comillas) { if (ch === '"' && texto[i + 1] === '"') { campo += '"'; i++; } else if (ch === '"') comillas = false; else campo += ch; }
    else if (ch === '"') comillas = true;
    else if (ch === sep) { fila.push(campo); campo = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && texto[i + 1] === '\n') i++; fila.push(campo); filas.push(fila); fila = []; campo = ''; }
    else campo += ch;
  }
  if (campo || fila.length) { fila.push(campo); filas.push(fila); }
  const ALIAS = { tipo_de_documento: 'tipo_documento', numero_de_documento: 'documento', 'numero_documento': 'documento', acudiente_de_documento: 'acudiente_de', celular: 'telefono', email: 'correo', correo_electronico: 'correo' };
  const cab = (filas.shift() || []).map((h) => { const k = norm(h).replace(/\s+/g, '_'); return ALIAS[k] || k; });
  return filas.filter((f) => f.some((x) => x.trim())).map((f) => Object.fromEntries(cab.map((k, i) => [k, (f[i] || '').trim()])));
}

export function descargarPlantilla() {
  const ejemplo = [COLUMNAS.join(';'), 'estudiante;Valentina;Pérez Lozano;TI;1004110;;;6A;', 'acudiente;Andrea;Lozano Peña;CC;52123456;andrea@correo.com;3001234567;;1004110', 'profesor;Carlos;Ramírez Díaz;CC;79111222;carlos@colegio.edu.co;3009876543;;'];
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + ejemplo.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  a.download = 'plantilla_personas_complex.csv';
  document.body.appendChild(a); a.click(); a.remove();
}

export async function importar(alListo) {
  const b = await base();
  const filas = await ventana({
    titulo: 'Importar personas (Excel / CSV)',
    html: `
      <ol class="ayuda pasos-lista">
        <li>Descarga la plantilla y ábrela en Excel o Google Sheets.</li>
        <li>Llena una fila por persona. Columnas: <code>${COLUMNAS.join(', ')}</code>.</li>
        <li><b>curso</b> (solo estudiantes): el nombre del curso, ej. <code>6A</code> → queda matriculado.<br><b>acudiente_de</b> (solo acudientes): el número de documento del estudiante → quedan vinculados.</li>
        <li>Guarda como <b>CSV</b> y súbelo aquí.</li>
      </ol>
      <p><button class="btn btn-chico" data-plantilla>⬇ Descargar plantilla</button></p>
      <div class="form"><label>Archivo CSV<input type="file" name="csv" accept=".csv,text/csv"></label></div>
      <div data-vista></div>`,
    alAbrir: (c) => {
      c.querySelector('[data-plantilla]').onclick = descargarPlantilla;
      c.querySelector('[name=csv]').onchange = async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        // Excel en español guarda el CSV en ANSI (windows-1252): si no es UTF-8 válido, se lee así
        const buf = await f.arrayBuffer();
        let texto;
        try { texto = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { texto = new TextDecoder('windows-1252').decode(buf); }
        const datos = leerCSV(texto.replace(/^﻿/, ''));
        c._filas = datos;
        const malos = datos.filter((x) => !ROL_DE[norm(x.rol)] || !x.nombres || (!x.documento && !x.correo));
        c.querySelector('[data-vista]').innerHTML = `<p class="ayuda"><b>${datos.length}</b> fila(s) leídas${malos.length ? ` · <span class="alerta">${malos.length} con datos incompletos (rol, nombres y documento o correo)</span>` : ''}.</p>
          <div class="tabla-envoltura"><table class="tabla"><thead><tr><th>Rol</th><th>Nombre</th><th>Documento</th><th>Curso / acudiente de</th></tr></thead><tbody>${datos.slice(0, 50).map((x) => `<tr class="${malos.includes(x) ? 'vencido' : ''}"><td>${esc(x.rol)}</td><td>${esc(x.nombres + ' ' + (x.apellidos || ''))}</td><td>${esc(x.documento || x.correo)}</td><td>${esc(x.curso || x.acudiente_de || '')}</td></tr>`).join('')}</tbody></table></div>`;
      };
    },
    botones: [{ texto: 'Cancelar' }, { texto: 'Importar', antes: async (c) => {
      const datos = c._filas || [];
      if (!datos.length) throw new Error('Sube el archivo CSV.');
      const validos = datos.filter((x) => ROL_DE[norm(x.rol)] && x.nombres && (x.documento || x.correo));
      if (!validos.length) throw new Error('Ninguna fila tiene los datos mínimos.');
      if (!(await confirmar('¿Importar?', `Se crearán o agregarán ${validos.length} persona(s).`, 'Importar'))) return false;
      return validos;
    } }],
  });
  if (!filas) return;
  aviso('Creando usuarios…');
  const resultados = [];
  for (let i = 0; i < filas.length; i += 50) {
    const lote = filas.slice(i, i + 50);
    try {
      const r = await E.db.funcion('admin-usuarios', { accion: 'crear', colegio_id: E.colegio.id, personas: lote.map((x) => ({ ...x, rol: ROL_DE[norm(x.rol)] })) });
      resultados.push(...r.resultados.map((res, j) => ({ ...res, _fila: lote[j] })));
    } catch (e) {
      resultados.push(...lote.map((x) => ({ ok: false, error: 'No se pudo crear (' + e.message + '). Vuelve a importar solo esta fila.', nombres: x.nombres, apellidos: x.apellidos })));
    }
  }
  // Matricular estudiantes y vincular acudientes
  const porDoc = new Map(resultados.filter((r) => r.ok && r._fila.documento).map((r) => [String(r._fila.documento).replace(/[^\dA-Za-z]/g, ''), r.perfil_id]));
  const cursoPorNombre = new Map(b.cursos.map((c) => [norm(c.nombre), c]));
  let matriculados = 0, vinculados = 0;
  const avisos = [];
  for (const r of resultados.filter((x) => x.ok)) {
    const f = r._fila;
    try {
      if (r.rol === 'estudiante' && f.curso) {
        const cu = cursoPorNombre.get(norm(f.curso));
        if (!cu) { avisos.push(`Curso "${f.curso}" no existe (${f.nombres})`); continue; }
        const ya = await E.db.select('matriculas', { eq: { curso_id: cu.id, estudiante_id: r.perfil_id } });
        if (!ya.length) { await E.db.insert('matriculas', [{ colegio_id: E.colegio.id, curso_id: cu.id, estudiante_id: r.perfil_id }]); matriculados++; }
      }
      if (r.rol === 'acudiente' && f.acudiente_de) {
        let est = porDoc.get(String(f.acudiente_de).replace(/[^\dA-Za-z]/g, ''));
        if (!est) {
          const cands = await E.db.select('perfiles', { eq: { numero_documento: String(f.acudiente_de).replace(/[^\dA-Za-z]/g, '') } });
          for (const c of cands) { const mm = await E.db.select('miembros', { eq: { colegio_id: E.colegio.id, perfil_id: c.id, rol: 'estudiante' } }); if (mm.length) { est = c.id; break; } }
        }
        if (!est) { avisos.push(`No encontré al estudiante ${f.acudiente_de} (acudiente ${f.nombres})`); continue; }
        const ya = await E.db.select('acudientes', { eq: { colegio_id: E.colegio.id, acudiente_id: r.perfil_id, estudiante_id: est } });
        if (!ya.length) {
          const otros = await E.db.select('acudientes', { eq: { colegio_id: E.colegio.id, estudiante_id: est } });
          await E.db.insert('acudientes', [{ colegio_id: E.colegio.id, acudiente_id: r.perfil_id, estudiante_id: est, principal: !otros.some((o) => o.principal), responsable_pagos: !otros.some((o) => o.responsable_pagos) }]);
          vinculados++;
        }
      }
    } catch (e) { avisos.push(`${f.nombres}: ${e.message}`); }
  }
  await recargarBase();
  if (matriculados || vinculados) aviso(`${matriculados} matriculado(s) · ${vinculados} acudiente(s) vinculado(s)`);
  if (avisos.length) resultados.push(...avisos.map((t) => ({ ok: false, error: t, nombres: '⚠️' })));
  await mostrarCredenciales(resultados);
  alListo?.();
}

export async function restablecer(perfil) {
  if (!(await confirmar('¿Restablecer la contraseña?', `${nombre(perfil)} recibirá una contraseña nueva. La anterior dejará de servir.`, 'Restablecer'))) return;
  try {
    const r = await E.db.funcion('admin-usuarios', { accion: 'clave', colegio_id: E.colegio.id, perfil_id: perfil.perfil_id || perfil.id });
    await mostrarCredenciales([{ ok: true, usuario: r.usuario, clave: r.clave, nombres: perfil.nombres, apellidos: perfil.apellidos, rol: perfil.roles?.[0]?.rol }]);
  } catch (e) { aviso(e.message, 'error'); }
}
