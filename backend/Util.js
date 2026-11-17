/** Utilidades generales. */

function err_(mensaje, codigo, extra) {
  var e = new Error(mensaje);
  e.code = codigo || 'NEGOCIO';
  e.extra = extra || null;
  return e;
}

function prop_(clave) {
  var v = PropertiesService.getScriptProperties().getProperty(clave);
  if (!v) throw err_('Sistema no inicializado (falta ' + clave + '). Ejecute setup().', 'CONFIG');
  return v;
}

/** Fecha/hora local (America/Lima) en ISO sin zona: 2026-11-12T10:15:00 */
function iso_(fecha) {
  return Utilities.formatDate(fecha || new Date(), 'America/Lima', "yyyy-MM-dd'T'HH:mm:ss");
}

function sello_() {
  return Utilities.formatDate(new Date(), 'America/Lima', 'yyyyMMdd-HHmmss');
}

function uid_() {
  return Utilities.getUuid().replace(/-/g, '').substring(0, 12);
}

function esTrue_(v) {
  return v === true || String(v).toUpperCase() === 'TRUE';
}

function txt_(v) {
  return v === null || v === undefined ? '' : String(v).trim();
}

function int_(v, def) {
  var n = parseInt(v, 10);
  return isNaN(n) ? (def === undefined ? 0 : def) : n;
}

function correo_(v) {
  return txt_(v).toLowerCase();
}

function codigoDe_(prefijo, n) {
  var s = String(n);
  while (s.length < 4) s = '0' + s;
  return prefijo + '-' + s;
}

/** Días completos entre una fecha ISO local y ahora. */
function diasDesde_(isoTxt) {
  if (!isoTxt) return 0;
  var d = new Date(String(isoTxt).replace(' ', 'T'));
  if (isNaN(d.getTime())) return 0;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

/** Normaliza fecha dd/mm/aaaa o aaaa-mm-dd → aaaa-mm-ddT00:00:00. Devuelve '' si vacía, null si inválida. */
function fechaImport_(v) {
  var s = txt_(v);
  if (!s) return '';
  var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(\s+\d{1,2}:\d{2}(:\d{2})?)?$/); // admite hora (exportación)
  if (m) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2) + 'T00:00:00';
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[1] + '-' + m[2] + '-' + m[3] + 'T00:00:00';
  return null;
}

/** Ejecuta fn bajo bloqueo global (evita correlativos duplicados por concurrencia). */
function conLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw err_('El sistema está ocupado. Intenta de nuevo en unos segundos.', 'OCUPADO');
  try {
    var r = fn();
    SpreadsheetApp.flush();
    return r;
  } finally {
    lock.releaseLock();
  }
}

/** Quita metadatos internos antes de enviar al cliente. */
function publico_(obj) {
  var o = {};
  for (var k in obj) if (k.charAt(0) !== '_') o[k] = obj[k];
  return o;
}

function extDe_(nombre, mime) {
  var m = String(nombre || '').match(/\.([A-Za-z0-9]{2,5})$/);
  if (m) return m[1].toLowerCase();
  var map = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' };
  return map[mime] || 'bin';
}

function blobDeBase64_(b64, mime, nombre) {
  var bytes = Utilities.base64Decode(b64);
  if (bytes.length > APP.MAX_ARCHIVO_MB * 1024 * 1024) {
    throw err_('El archivo supera ' + APP.MAX_ARCHIVO_MB + ' MB.', 'ARCHIVO');
  }
  return Utilities.newBlob(bytes, mime, nombre);
}
