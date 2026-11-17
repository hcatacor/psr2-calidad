// Zip mínimo (lectura/escritura) para simular Utilities.unzip / Utilities.zip en desarrollo. Sin dependencias.
const zlib = require('zlib');

function unzip(buf) {
  // Localiza el "end of central directory"
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('No es un archivo zip válido');
  const total = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = [];
  for (let n = 0; n < total; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Directorio zip corrupto');
    const metodo = buf.readUInt16LE(p + 10);
    const tamComp = buf.readUInt32LE(p + 20);
    const lenNom = buf.readUInt16LE(p + 28), lenExtra = buf.readUInt16LE(p + 30), lenCom = buf.readUInt16LE(p + 32);
    const offLocal = buf.readUInt32LE(p + 42);
    const nombre = buf.slice(p + 46, p + 46 + lenNom).toString('utf8');
    p += 46 + lenNom + lenExtra + lenCom;
    const inicio = offLocal + 30 + buf.readUInt16LE(offLocal + 26) + buf.readUInt16LE(offLocal + 28);
    const comp = buf.slice(inicio, inicio + tamComp);
    if (nombre.endsWith('/')) continue;
    out.push({ nombre, datos: metodo === 0 ? Buffer.from(comp) : zlib.inflateRawSync(comp) });
  }
  return out;
}

function zip(archivos) {
  const locales = [], central = [];
  let off = 0;
  for (const a of archivos) {
    const nom = Buffer.from(a.nombre, 'utf8');
    const comp = zlib.deflateRawSync(a.datos);
    const crc = zlib.crc32(a.datos) >>> 0;
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(8, 8);
    h.writeUInt32LE(0, 10); h.writeUInt32LE(crc, 14); h.writeUInt32LE(comp.length, 18); h.writeUInt32LE(a.datos.length, 22);
    h.writeUInt16LE(nom.length, 26); h.writeUInt16LE(0, 28);
    locales.push(h, nom, comp);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(8, 10);
    c.writeUInt32LE(0, 12); c.writeUInt32LE(crc, 16); c.writeUInt32LE(comp.length, 20); c.writeUInt32LE(a.datos.length, 24);
    c.writeUInt16LE(nom.length, 28); c.writeUInt32LE(off, 42);
    central.push(c, nom);
    off += 30 + nom.length + comp.length;
  }
  const cd = Buffer.concat(central);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0); fin.writeUInt16LE(archivos.length, 8); fin.writeUInt16LE(archivos.length, 10);
  fin.writeUInt32LE(cd.length, 12); fin.writeUInt32LE(off, 16);
  return Buffer.concat([...locales, cd, fin]);
}

module.exports = { zip, unzip };
