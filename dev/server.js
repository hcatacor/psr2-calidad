/**
 * Servidor de desarrollo: sirve frontend/ y simula la API de Apps Script en memoria.
 * Uso: node dev/server.js   →  http://localhost:5173
 * Login de desarrollo: elige un usuario (no usa Google). Los datos se pierden al cerrar.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const { crearEntorno } = require('./gas-mock');

const PUERTO = +process.env.PORT || 5173;
const env = crearEntorno();
env.contexto.setup();

// PDF en desarrollo: el backend real convierte con Google Sheets; aquí se usa Excel local (Windows) si existe.
env.contexto.xlsxAPdf_ = function (xlsxBlob, posicion) {
  const os = require('os');
  const { execFileSync } = require('child_process');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-'));
  const ent = path.join(dir, 'f.xlsx'), sal = path.join(dir, 'f.pdf');
  try {
    fs.writeFileSync(ent, xlsxBlob.bytes);
    execFileSync('cscript', ['//nologo', path.join(__dirname, 'xlsx-a-pdf.vbs'), ent, sal, String((posicion || 0) + 1)], { timeout: 60000 });
    return [...fs.readFileSync(sal)].map((x) => (x > 127 ? x - 256 : x));
  } catch (e) {
    throw env.contexto.err_('Vista previa PDF no disponible en la demo local (requiere Excel). En la app publicada la arma Google.', 'INTERNO');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
};

const USUARIOS_DEV = [];
// Solo datos reales (data/ no se versiona): instalación (usuarios reales, catálogos, series), los formatos aprobados y el LOG de Calidad.
// Nada inventado: sin códigos, usuarios ni proyectos de ejemplo.
(function semilla() {
  const ok = (r) => { if (!r.ok) throw new Error('Semilla: ' + r.error); return r.data; };
  const prop = env.login('propietario@usuarios.app');
  // Usuarios reales con la contraseña de prueba (solo demo local): acceso rápido en la pantalla de ingreso
  ['propietario@usuarios.app', 'eduardo@usuarios.app', 'lsalazar@usuarios.app', 'jsanchez@usuarios.app'].forEach((c) => {
    const usuario = env.prepararDev(c);
    USUARIOS_DEV.push({ correo: c, usuario, nombre: env.contexto.buscarUsuario_(c).Nombre });
  });
  // Todos los protocolos de data/FORMATOS CALIDAD/<código>/ (el .xls antiguo se convierte con Excel; el nombre sale del título del Excel)
  const baseFmt = path.join(__dirname, '..', 'data', 'FORMATOS CALIDAD');
  if (fs.existsSync(baseFmt)) {
    fs.readdirSync(baseFmt).filter((d) => /^PSR2-.*-FOR-\d{4}$/.test(d)).sort().forEach((cod) => {
      const dir = path.join(baseFmt, cod);
      const files = fs.readdirSync(dir).filter((f) => !/PLANTILLA/i.test(f));
      let xlsx = files.find((f) => f.toUpperCase() === cod + '.XLSX') || files.find((f) => /\.xlsx$/i.test(f));
      let ruta = xlsx && path.join(dir, xlsx);
      if (!ruta) {
        const xls = files.find((f) => /\.xls$/i.test(f));
        if (!xls) return;
        ruta = path.join(os.tmpdir(), 'appweb-formatos', cod + '.xlsx');
        if (!fs.existsSync(ruta)) {
          fs.mkdirSync(path.dirname(ruta), { recursive: true });
          try { execFileSync('cscript', ['//nologo', path.join(__dirname, 'xls-a-xlsx.vbs'), path.join(dir, xls), ruta], { timeout: 120000 }); } catch (e) { console.warn('No se pudo convertir', xls); return; }
        }
      }
      try {
        ok(env.llamar('formatos.guardar', { Codigo_Formato: cod,
          archivo: { nombre: cod + '.xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', base64: fs.readFileSync(ruta).toString('base64') } }, prop));
      } catch (e) { console.warn('Formato', cod, e.message); }
    });
  }
  // LOG real de Calidad: se carga igual que en la app (pantalla LOG → Cargar LOG)
  const logXlsx = path.join(__dirname, '..', 'data', 'FORMATOS CALIDAD', 'resumen log-acronimos- analisis.xlsx');
  if (fs.existsSync(logXlsx)) {
    const r = ok(env.llamar('log.ejecutar', { base64: fs.readFileSync(logXlsx).toString('base64'), nombre: 'LOG.xlsx' }, prop));
    console.log(`LOG de Calidad cargado: ${r.filas} filas (${r.observadas} observadas), ${r.codigos} códigos`);
  }
})();

const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
const raiz = path.join(__dirname, '..', 'frontend');

http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (req.method === 'POST' && url === '/api') {
    let cuerpo = '';
    req.on('data', (c) => { cuerpo += c; if (cuerpo.length > 40e6) req.destroy(); });
    req.on('end', () => {
      const out = env.contexto.doPost({ postData: { contents: cuerpo } }).contenido;
      setTimeout(() => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(out); }, 250); // latencia simulada
    });
    return;
  }
  if (url === '/js/config.js') {
    res.writeHead(200, { 'Content-Type': TIPOS['.js'] });
    res.end(`export const CONFIG = { API_URL: '/api', DEV: true, DEV_CLAVE: '${env.CLAVE_DEV}', DEV_USUARIOS: ${JSON.stringify(USUARIOS_DEV)} };`);
    return;
  }
  const archivo = path.normalize(path.join(raiz, url === '/' ? 'index.html' : url));
  if (!archivo.startsWith(raiz) || !fs.existsSync(archivo) || fs.statSync(archivo).isDirectory()) { res.writeHead(404); res.end('No encontrado'); return; }
  res.writeHead(200, { 'Content-Type': TIPOS[path.extname(archivo)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(archivo).pipe(res);
}).listen(PUERTO, () => console.log(`Servidor de desarrollo: http://localhost:${PUERTO}`));
