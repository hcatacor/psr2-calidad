/**
 * Simulador mínimo de Google Apps Script para desarrollo/pruebas locales.
 * Carga los archivos REALES de backend/ en un contexto vm con servicios falsos en memoria.
 * Solo para desarrollo: no se despliega.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const zipLib = require('./zip');

function crearEntorno({ usuarioEfectivo = 'propietario@usuarios.app', clientId = 'DEV_CLIENT' } = {}) {
  const props = {};
  const sheetsPorId = {};
  const archivos = {}; // id -> { nombre, bytes, mime, carpeta, trashed }
  const carpetas = {}; // id -> { nombre, padre }
  let seq = 0;
  const nuevoId = (p) => p + (++seq).toString(36) + crypto.randomBytes(3).toString('hex');

  // ---------------- Sheets
  class Range {
    constructor(sh, r, c, nr, nc) { Object.assign(this, { sh, r, c, nr, nc }); }
    getValues() {
      const out = [];
      for (let i = 0; i < this.nr; i++) {
        const fila = this.sh.datos[this.r - 1 + i] || [];
        const o = [];
        for (let j = 0; j < this.nc; j++) o.push(fila[this.c - 1 + j] ?? '');
        out.push(o);
      }
      return out;
    }
    setValues(vals) {
      vals.forEach((fila, i) => {
        const idx = this.r - 1 + i;
        if (idx >= this.sh.maxRows) throw new Error('Fuera de rango: fila ' + (idx + 1));
        this.sh.datos[idx] = this.sh.datos[idx] || [];
        fila.forEach((v, j) => {
          let s = v === null || v === undefined ? '' : String(v);
          if (s.startsWith("'")) s = s.slice(1); // apóstrofo = texto literal
          this.sh.datos[idx][this.c - 1 + j] = s;
        });
      });
      return this;
    }
    setNumberFormat() { return this; }
    setFontWeight() { return this; }
    setBackground() { return this; }
    setFontColor() { return this; }
  }
  class Sheet {
    constructor(nombre) { this.nombre = nombre; this.datos = []; this.maxRows = 1000; this.maxCols = 26; this.protecciones = []; }
    getName() { return this.nombre; }
    getLastRow() { for (let i = this.datos.length - 1; i >= 0; i--) if (this.datos[i] && this.datos[i].some((x) => x !== '')) return i + 1; return 0; }
    getMaxRows() { return this.maxRows; }
    getMaxColumns() { return this.maxCols; }
    insertRowsAfter(_, n) { this.maxRows += n; }
    insertColumnsAfter(_, n) { this.maxCols += n; }
    getRange(r, c, nr = 1, nc = 1) { return new Range(this, r, c, nr, nc); }
    setFrozenRows() { }
    protect() { const p = { setDescription: () => p, getEditors: () => [], removeEditor: () => { } }; this.protecciones.push(p); return p; }
    getProtections() { return this.protecciones; }
  }
  class Spreadsheet {
    constructor(nombre) { this.id = nuevoId('ss'); this.nombre = nombre; this.hojas = [new Sheet('Hoja 1')]; sheetsPorId[this.id] = this; }
    getId() { return this.id; }
    getUrl() { return 'mock://ss/' + this.id; }
    getSheetByName(n) { return this.hojas.find((h) => h.nombre === n) || null; }
    insertSheet(n) { const h = new Sheet(n); this.hojas.push(h); return h; }
    deleteSheet(h) { this.hojas = this.hojas.filter((x) => x !== h); }
    getSheets() { return this.hojas; }
    setSpreadsheetTimeZone() { }
    createTextFinder(t) { const ss = this; return { replaceAllWith(v) { ss.hojas.forEach((h) => h.datos.forEach((f) => f && f.forEach((c, j) => { if (typeof c === 'string') f[j] = c.split(t).join(v); }))); } }; }
  }

  // ---------------- Drive
  const blob = (bytes, mime, nombre) => ({
    bytes: Buffer.from(bytes), mime, nombre,
    getBytes() { return [...this.bytes].map((b) => (b > 127 ? b - 256 : b)); },
    getContentType() { return this.mime; },
    setContentType(m) { this.mime = m; return this; },
    getDataAsString() { return this.bytes.toString('utf8'); },
    getName() { return this.nombre; },
  });
  const fileObj = (id) => {
    const a = archivos[id];
    if (!a) throw new Error('Archivo no existe ' + id);
    return {
      getId: () => id, getName: () => a.nombre, getMimeType: () => a.mime, getSize: () => a.bytes.length, setName: (n) => { a.nombre = n; return fileObj(id); },
      getBlob: () => blob(a.bytes, a.mime, a.nombre), setTrashed: (t) => { a.trashed = t; },
      makeCopy: (n, carpeta) => { const nid = nuevoId('f'); archivos[nid] = { ...a, nombre: n, carpeta: carpeta.getId() }; if (sheetsPorId[id]) { const c = new Spreadsheet(n); c.hojas = JSON.parse(JSON.stringify(sheetsPorId[id].hojas)).map((h) => Object.assign(new Sheet(h.nombre), h)); sheetsPorId[nid] = c; c.id = nid; } return fileObj(nid); },
      moveTo: () => { },
    };
  };
  const folderObj = (id) => {
    if (!carpetas[id]) throw new Error('Carpeta no existe');
    return {
      getId: () => id, getUrl: () => 'mock://folder/' + id,
      createFolder: (n) => { const nid = nuevoId('d'); carpetas[nid] = { nombre: n, padre: id }; return folderObj(nid); },
      getFoldersByName: (n) => { const ids = Object.keys(carpetas).filter((k) => carpetas[k].padre === id && carpetas[k].nombre === n); let i = 0; return { hasNext: () => i < ids.length, next: () => folderObj(ids[i++]) }; },
      createFile: (b) => { const nid = nuevoId('f'); archivos[nid] = { nombre: b.nombre, bytes: b.bytes, mime: b.mime, carpeta: id }; return fileObj(nid); },
      getFiles: () => { const ids = Object.keys(archivos).filter((k) => archivos[k].carpeta === id && !archivos[k].trashed); let i = 0; return { hasNext: () => i < ids.length, next: () => fileObj(ids[i++]) }; },
    };
  };
  const DriveApp = {
    createFolder: (n) => { const id = nuevoId('d'); carpetas[id] = { nombre: n, padre: null }; return folderObj(id); },
    getFolderById: folderObj,
    getFoldersByName: (n) => { const ids = Object.keys(carpetas).filter((k) => carpetas[k].nombre === n); let i = 0; return { hasNext: () => i < ids.length, next: () => folderObj(ids[i++]) }; },
    getFileById: (id) => { if (sheetsPorId[id] && !archivos[id]) archivos[id] = { nombre: sheetsPorId[id].nombre, bytes: Buffer.from(''), mime: 'application/vnd.google-apps.spreadsheet' }; return fileObj(id); },
  };
  const Drive = {
    Files: {
      create: (meta, b) => {
        const id = nuevoId('f');
        archivos[id] = { nombre: meta.name, bytes: b.bytes, mime: meta.mimeType, carpeta: meta.parents[0] };
        if (meta.mimeType === 'application/vnd.google-apps.spreadsheet') {
          const ss = new Spreadsheet(meta.name); ss.id = id; sheetsPorId[id] = ss;
          ss.hojas[0].datos = [['FORMATO DE PRUEBA'], ['Código:', '{CODIGO}'], ['Fecha:', '{FECHA}'], ['Responsable:', '{NOMBRE_USUARIO}']];
        }
        return { id };
      },
    },
  };

  // ---------------- Utilities y otros
  const toBytes = (x) => (typeof x === 'string' ? Buffer.from(x, 'utf8') : Buffer.from(x.map((b) => (b < 0 ? b + 256 : b))));
  const signed = (buf) => [...buf].map((b) => (b > 127 ? b - 256 : b));
  const Utilities = {
    formatDate: (d, tz, fmt) => {
      const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
        .formatToParts(d).reduce((o, x) => (o[x.type] = x.value, o), {});
      const h = p.hour === '24' ? '00' : p.hour;
      return fmt.replace('yyyy', p.year).replace('MM', p.month).replace('dd', p.day).replace('HH', h).replace('mm', p.minute).replace('ss', p.second).replace(/'/g, '');
    },
    getUuid: () => crypto.randomUUID(),
    base64Encode: (x) => toBytes(x).toString('base64'),
    base64Decode: (s) => signed(Buffer.from(s, 'base64')),
    base64EncodeWebSafe: (x) => toBytes(x).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
    base64DecodeWebSafe: (s) => signed(Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')),
    computeHmacSha256Signature: (v, k) => signed(crypto.createHmac('sha256', k).update(v).digest()),
    newBlob: (bytes, mime, nombre) => blob(typeof bytes === 'string' ? Buffer.from(bytes) : toBytes(bytes), mime, nombre),
    unzip: (b) => zipLib.unzip(b.bytes).map((a) => blob(a.datos, 'application/octet-stream', a.nombre)),
    zip: (blobs, nombre) => blob(zipLib.zip(blobs.map((x) => ({ nombre: x.getName(), datos: x.bytes }))), 'application/zip', nombre),
  };
  const UrlFetchApp = {
    fetch: (url) => {
      // exportación de plantillas: devuelve un "archivo" de texto con el contenido de la hoja
      const id = (url.match(/\/d\/([^/]+)\//) || [])[1];
      const ss = sheetsPorId[id];
      const txt = ss ? ss.hojas.map((h) => h.datos.map((f) => (f || []).join(' | ')).join('\n')).join('\n') : 'doc';
      return { getResponseCode: () => 200, getBlob: () => blob(Buffer.from(txt), 'application/octet-stream', 'export') };
    },
  };
  let bloqueado = false;
  const LockService = { getScriptLock: () => ({ tryLock: () => { if (bloqueado) return false; bloqueado = true; return true; }, releaseLock: () => { bloqueado = false; } }) };

  const contexto = {
    console,
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] || null, setProperty: (k, v) => { props[k] = v; } }) },
    SpreadsheetApp: {
      openById: (id) => { if (!sheetsPorId[id]) throw new Error('SS no existe'); return sheetsPorId[id]; },
      create: (n) => new Spreadsheet(n),
      flush: () => { },
      ProtectionType: { SHEET: 'SHEET' },
    },
    DocumentApp: { openById: () => { throw new Error('DocumentApp no simulado'); } },
    DriveApp, Drive, Utilities, UrlFetchApp, LockService,
    MimeType: { GOOGLE_SHEETS: 'application/vnd.google-apps.spreadsheet', GOOGLE_DOCS: 'application/vnd.google-apps.document' },
    ScriptApp: { getOAuthToken: () => 'mock' },
    Session: { getEffectiveUser: () => ({ getEmail: () => usuarioEfectivo }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ contenido: t, setMimeType() { return this; } }) },
  };
  vm.createContext(contexto);

  const dir = path.join(__dirname, '..', 'backend');
  const orden = ['Config.js', 'Util.js', 'Db.js', 'Logica.js', 'Auth.js', 'Main.js', 'Registros.js', 'Archivos.js', 'Formularios.js', 'Auditoria.js', 'Admin.js', 'Importacion.js', 'Log.js', 'Setup.js'];
  const todos = fs.readdirSync(dir).filter((f) => f.endsWith('.js'));
  const faltantes = todos.filter((f) => !orden.includes(f));
  if (faltantes.length) throw new Error('Agregar al orden de carga: ' + faltantes.join(', '));
  for (const f of orden) {
    let src = fs.readFileSync(path.join(dir, f), 'utf8');
    vm.runInContext(src, contexto, { filename: f });
  }

  /** Llama a la API como lo haría el frontend. */
  const llamar = (action, data, token, proyecto = 'PSR2') => JSON.parse(contexto.doPost({ postData: { contents: JSON.stringify({ action, data, token, proyecto }) } }).contenido);
  /** Solo simulador: deja al usuario con una contraseña conocida (sin cambio pendiente) e ingresa con usuario + contraseña. */
  const CLAVE_DEV = 'Prueba2026';
  const prepararDev = (email) => {
    const u = contexto.buscarUsuario_(email);
    if (!u) throw new Error('No existe ' + email);
    if (!u.Usuario) u.Usuario = contexto.usuarioLibre_(u.Nombre.split(' ')[0], u.Correo);
    contexto.ponerClave_(u, CLAVE_DEV, false);
    contexto.actualizar_('Usuarios', u);
    return u.Usuario;
  };
  const login = (email) => {
    const r = llamar('login', { usuario: prepararDev(email), clave: CLAVE_DEV });
    if (!r.ok) throw new Error(r.error);
    return r.data.token;
  };
  return { contexto, llamar, login, prepararDev, CLAVE_DEV, archivos, props, sheetsPorId };
}

module.exports = { crearEntorno };
