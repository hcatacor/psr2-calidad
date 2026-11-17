/**
 * Arma data/CARGA INICIAL/ con lo que se sube a la app publicada (cuenta hcat), en el orden de carga:
 *   1-FORMATOS/  los 29 FOR en .xlsx (los .xls antiguos convertidos con Excel, sin cambiar nada del formato)
 *   2-LOG/       el Excel del LOG de Calidad (hoja LOG) tal cual
 * data/ no se versiona (datos reales). Uso: node dev/preparar-carga.js
 */
const fs = require('fs'), path = require('path'), os = require('os');
const { execFileSync } = require('child_process');

const base = path.join(__dirname, '..', 'data', 'FORMATOS CALIDAD');
const destino = path.join(__dirname, '..', 'data', 'CARGA INICIAL');
const dFor = path.join(destino, '1-FORMATOS'), dLog = path.join(destino, '2-LOG');
[dFor, dLog].forEach((d) => fs.mkdirSync(d, { recursive: true }));

const lista = [];
fs.readdirSync(base).filter((d) => /^PSR2-.*-FOR-\d{4}$/.test(d)).sort().forEach((cod) => {
  const dir = path.join(base, cod);
  const files = fs.readdirSync(dir).filter((f) => !/PLANTILLA/i.test(f));
  let xlsx = files.find((f) => f.toUpperCase() === cod + '.XLSX') || files.find((f) => /\.xlsx$/i.test(f));
  let origen = xlsx ? path.join(dir, xlsx) : '';
  if (!origen) {
    const xls = files.find((f) => /\.xls$/i.test(f));
    if (!xls) { lista.push([cod, 'SIN ARCHIVO']); return; }
    origen = path.join(os.tmpdir(), 'appweb-formatos', cod + '.xlsx');
    if (!fs.existsSync(origen)) {
      fs.mkdirSync(path.dirname(origen), { recursive: true });
      execFileSync('cscript', ['//nologo', path.join(__dirname, 'xls-a-xlsx.vbs'), path.join(dir, xls), origen], { timeout: 120000 });
    }
    xlsx = xls + ' → convertido a .xlsx';
  }
  fs.copyFileSync(origen, path.join(dFor, cod + '.xlsx'));
  lista.push([cod, xlsx]);
});
const log = path.join(base, 'resumen log-acronimos- analisis.xlsx');
if (fs.existsSync(log)) fs.copyFileSync(log, path.join(dLog, 'LOG Calidad PSR2.xlsx'));

lista.forEach(([c, f]) => console.log(c.padEnd(30), f));
console.log(`\n${lista.filter((x) => x[1] !== 'SIN ARCHIVO').length} formatos en ${dFor}`);
console.log(fs.existsSync(log) ? `LOG en ${dLog}` : 'FALTA el Excel del LOG');
