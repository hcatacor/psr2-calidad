import { S } from './state.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------------------------------------------------------------- Fechas (se guardan ISO local, se muestran DD/MM/AAAA)
export function fFecha(iso) {
  if (!iso) return '';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}
export function fFechaHora(iso) {
  if (!iso) return '';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : fFecha(iso);
}
export function diasDesde(iso) {
  if (!iso) return 0;
  const t = new Date(String(iso).replace(' ', 'T')).getTime();
  return isNaN(t) ? 0 : Math.floor((Date.now() - t) / 86400000);
}

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Set', 'Oct', 'Nov', 'Dic'];

/** Periodo estadístico (ciclo 26→25): devuelve clave 'AAAA-MM' del mes en que CIERRA el ciclo. */
export function periodoDe(iso, diaInicio = 26) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '';
  let a = +m[1], mes = +m[2];
  if (+m[3] >= diaInicio) { mes++; if (mes > 12) { mes = 1; a++; } }
  return `${a}-${String(mes).padStart(2, '0')}`;
}
/** Valorización del código: la guardada (automática 26→25 o editada) o, si no hay, la calculada por fecha de creación. */
export const valorizacionDe = (r) => (/^\d{4}-\d{2}$/.test(r.Valorizacion || '') ? r.Valorizacion : periodoDe(r.Fecha_Creacion, +S.config.Dia_Inicio_Ciclo || 26));
export function etiquetaPeriodo(clave, diaInicio = 26, diaFin = 25) {
  if (!clave) return 'Sin fecha';
  const [a, m] = clave.split('-').map(Number);
  const pm = m === 1 ? 12 : m - 1;
  return `${MESES[m - 1]} ${a} (${diaInicio}/${String(pm).padStart(2, '0')} – ${diaFin}/${String(m).padStart(2, '0')})`;
}
export function periodoActual() {
  const d = new Date();
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return periodoDe(iso, +S.config.Dia_Inicio_Ciclo || 26);
}

// ---------------------------------------------------------------- Dominio
export const ESTADOS_VISIBLES = ['Pendiente', 'Cargado', 'Observado', 'Validado', 'Histórico', 'Liberado'];
export const estadoVisible = (r) => (r.Estado === 'Liberado' ? 'Liberado' : r.Estado_Doc || 'Pendiente');
export const badge = (estado) => `<span class="badge b-${esc(estado)}">${esc(estado)}</span>`;
export function nombreDe(correo) {
  if (!correo) return '';
  const u = S.usuarios.find((x) => x.Correo.toLowerCase() === String(correo).toLowerCase());
  return u ? u.Nombre : correo;
}
export const serieDe = (cod) => S.series.find((s) => s.Codigo_Serie === cod);
export const serieActiva = (s) => String(s.Activa).toUpperCase() === 'TRUE';
/** Nombre corto como lo conocen los usuarios: "DRB-GLB-RGI" + fase. */
export const nombreSerie = (s) => `${s.Especialidad}-${s.Tramo}-${s.Tipo_Documento} (${s.Fase})`;
export const ordenSeries = (lista) => [...lista].sort((a, b) =>
  `${a.Especialidad}-${a.Tramo}-${a.Tipo_Documento}`.localeCompare(`${b.Especialidad}-${b.Tramo}-${b.Tipo_Documento}`) || a.Fase.localeCompare(b.Fase));

// ---------------------------------------------------------------- Codificación (Anexo A)
export const TIPOS_CAT = [['Fase', 'Fase'], ['Especialidad', 'Especialidad'], ['Tramo', 'Tramo'], ['Tipo_Documento', 'Tipo de documento']];
export const PARTES = [
  ['Proyecto', 'pr', 'Proy'], ['Fase', 'fa', 'Fase'], ['Empresa ejecutora', 'em', 'Emp'], ['Especialidad', 'es', 'Esp'],
  ['Tramo', 'tr', 'Tramo'], ['Tipo de documento', 'ti', 'Tipo'], ['Correlativo', 'co', 'Corr'],
];
export function descCat(tipo, codigo) {
  const c = S.catalogos.find((x) => x.Tipo === tipo && x.Codigo === codigo);
  return c && c.Descripcion ? c.Descripcion : '';
}
export function etiquetaCat(tipo, codigo) {
  const d = descCat(tipo, codigo);
  return d ? `${codigo} · ${d}` : codigo;
}
/** Código dividido en sus 7 partes con los títulos y colores del Anexo A. */
export function codigoVisual(codigo, { chico = false } = {}) {
  const p = String(codigo).split('-');
  if (p.length !== 7) return `<span class="det-code">${esc(codigo)}</span>`;
  const tipos = [null, 'Fase', null, 'Especialidad', 'Tramo', 'Tipo_Documento', null];
  return `<div class="codvis ${chico ? 'chico' : ''}" aria-label="${esc(codigo)}">${p.map((v, i) => {
    const d = tipos[i] ? descCat(tipos[i], v) : '';
    return `${i ? '<span class="codvis-sep">-</span>' : ''}<div class="codvis-p cv-${PARTES[i][1]}" title="${esc(PARTES[i][0] + (d ? ': ' + d : ''))}">
      <span class="codvis-t"><span class="largo">${PARTES[i][0]}</span><span class="corto">${PARTES[i][2]}</span></span><span class="codvis-v">${esc(v)}</span></div>`;
  }).join('')}</div>`;
}

// ---------------------------------------------------------------- UI
export function toast(msg, tipo = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + tipo;
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), tipo === 'err' ? 7000 : 3500);
}

let cargas = 0;
export function cargando(on, txt = 'Procesando…') {
  cargas = Math.max(0, cargas + (on ? 1 : -1));
  $('#cargando-txt').textContent = txt;
  $('#cargando').hidden = cargas === 0;
}

/** Ejecuta una promesa con indicador de carga y toast de error. Devuelve undefined si falla. */
export async function tarea(promesa, txt) {
  cargando(true, txt);
  try { return await promesa(); } catch (e) { toast(e.message || String(e), 'err'); return undefined; } finally { cargando(false); }
}

/**
 * Modal genérico. Devuelve { el, cerrar }. opts: { titulo, cuerpo (html), pie (html), grande, alCerrar }
 */
export function modal({ titulo, cuerpo, pie = '', grande = false, alCerrar, fijo = false } = {}) {
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal ${grande ? 'lg' : ''}" role="dialog" aria-modal="true">
    <div class="modal-head"><h2>${titulo}</h2>
      <button class="btn btn-ghost btn-sm" data-cerrar aria-label="Cerrar"><svg class="ico" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
    <div class="modal-body">${cuerpo}</div>
    ${pie ? `<div class="modal-foot">${pie}</div>` : ''}</div>`;
  const cerrar = () => { bg.remove(); document.removeEventListener('keydown', onKey); alCerrar && alCerrar(); };
  const onKey = (e) => { if (e.key === 'Escape') cerrar(); };
  bg.addEventListener('click', (e) => { if ((e.target === bg && !fijo) || e.target.closest('[data-cerrar]')) cerrar(); });
  document.addEventListener('keydown', onKey);
  $('#modal-root').appendChild(bg);
  const primero = bg.querySelector('input:not([type=hidden]):not([readonly]), select, textarea');
  if (primero) setTimeout(() => primero.focus(), 30);
  return { el: bg, cerrar };
}

/** Pide un texto (motivo, observación…). Devuelve string o null. */
export function pedirTexto({ titulo, etiqueta, ayuda = '', boton = 'Aceptar', peligro = false, min = 3, valor = '' }) {
  return new Promise((resolve) => {
    let ok = false;
    const m = modal({
      titulo: esc(titulo),
      cuerpo: `<div class="field"><label>${esc(etiqueta)}</label><textarea id="pt-txt" maxlength="500">${esc(valor)}</textarea>
        ${ayuda ? `<span class="hint">${esc(ayuda)}</span>` : ''}</div>`,
      pie: `<button class="btn" data-cerrar>Cancelar</button><button class="btn ${peligro ? 'btn-danger' : 'btn-primary'}" id="pt-ok">${esc(boton)}</button>`,
      alCerrar: () => { if (!ok) resolve(null); },
    });
    $('#pt-ok', m.el).onclick = () => {
      const v = $('#pt-txt', m.el).value.trim();
      if (v.length < min) { toast(`Escribe al menos ${min} caracteres.`, 'err'); return; }
      ok = true; m.cerrar(); resolve(v);
    };
  });
}

export function confirmar({ titulo, mensaje, boton = 'Confirmar', peligro = false }) {
  return new Promise((resolve) => {
    let ok = false;
    const m = modal({
      titulo: esc(titulo), cuerpo: `<p style="margin:0">${mensaje}</p>`,
      pie: `<button class="btn" data-cerrar>Cancelar</button><button class="btn ${peligro ? 'btn-danger' : 'btn-primary'}" id="cf-ok">${esc(boton)}</button>`,
      alCerrar: () => { if (!ok) resolve(false); },
    });
    $('#cf-ok', m.el).onclick = () => { ok = true; m.cerrar(); resolve(true); };
  });
}

// ---------------------------------------------------------------- Archivos
export function base64ABlob(b64, mime) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export function descargarBlob(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function leerComoBase64(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result).split(',')[1]);
    fr.onerror = () => reject(new Error('No se pudo leer el archivo.'));
    fr.readAsDataURL(blob);
  });
}

/** Reduce fotos grandes del celular (máx. 2200 px, JPEG 85%) para subir rápido. */
async function comprimirImagen(file) {
  if (!file.type.startsWith('image/') || file.size < 1.5 * 1024 * 1024) return file;
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, 2200 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85));
    return blob && blob.size < file.size ? new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : file;
  } catch (e) { return file; }
}

/** Prepara un archivo para la API: { nombre, mime, base64 }. */
export async function archivoParaApi(file, { comprimir = false, maxMB = 20 } = {}) {
  const f = comprimir ? await comprimirImagen(file) : file;
  if (f.size > maxMB * 1024 * 1024) throw new Error(`El archivo pesa ${(f.size / 1048576).toFixed(1)} MB; el máximo es ${maxMB} MB.`);
  let mime = f.type;
  if (!mime || mime === 'image/jpg') mime = /\.pdf$/i.test(f.name) ? 'application/pdf' : /\.png$/i.test(f.name) ? 'image/png' : /\.jpe?g$/i.test(f.name) ? 'image/jpeg' : mime;
  return { nombre: f.name, mime, base64: await leerComoBase64(f) };
}

// ---------------------------------------------------------------- CSV
export function csvParse(texto) {
  texto = texto.replace(/^﻿/, '');
  const primera = texto.split(/\r?\n/)[0] || '';
  const sep = (primera.match(/;/g) || []).length > (primera.match(/,/g) || []).length ? ';' : ',';
  const filas = [];
  let fila = [], campo = '', comillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (comillas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') comillas = false;
      else campo += c;
    } else if (c === '"') comillas = true;
    else if (c === sep) { fila.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      fila.push(campo); filas.push(fila); fila = []; campo = '';
    } else campo += c;
  }
  if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila); }
  const datos = filas.filter((f) => f.some((x) => x.trim() !== ''));
  if (!datos.length) return [];
  const h = datos[0].map((x) => x.trim());
  return datos.slice(1).map((f) => Object.fromEntries(h.map((k, i) => [k, (f[i] ?? '').trim()])));
}

export function csvGenerar(columnas, filas) {
  const q = (v) => {
    const s = String(v ?? '');
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + [columnas.map(q).join(';'), ...filas.map((f) => columnas.map((c) => q(f[c])).join(';'))].join('\r\n');
}

export function opciones(lista, sel, { vacio } = {}) {
  return (vacio !== undefined ? `<option value="">${esc(vacio)}</option>` : '') +
    lista.map((o) => {
      const [v, t] = Array.isArray(o) ? o : [o, o];
      return `<option value="${esc(v)}" ${String(v) === String(sel ?? '') ? 'selected' : ''}>${esc(t)}</option>`;
    }).join('');
}

export const ICONOS = {
  panel: '<path d="M4 13h6V4H4zM14 20h6v-9h-6zM14 4v4h6V4zM4 20h6v-4H4z"/>',
  codigos: '<path d="M4 7h16M4 12h16M4 17h10"/>',
  auditor: '<path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
  historial: '<path d="M12 8v4l3 2"/><path d="M3.05 11a9 9 0 1 1 .5 4M3 4v7h7"/>',
  admin: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  mas: '<path d="M12 5v14M5 12h14"/>',
  log: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  bajar: '<path d="M12 4v12M6 10l6 6 6-6M4 20h16"/>',
  subir: '<path d="M12 20V8M6 14l6-6 6 6M4 4h16"/>',
  ojo: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  copiar: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
};
export const ico = (n) => `<svg class="ico" viewBox="0 0 24 24">${ICONOS[n]}</svg>`;
