// Foto del reporte fotográfico (p. ej. PTS-FOR-0016). La app NO la guarda: queda en el teléfono del usuario
// (en este navegador y, si se tomó con la cámara, también como archivo en el teléfono) y se usa solo al armar la hoja.
// Si se imprime desde otro equipo, la hoja sale con el recuadro vacío para adjuntar la foto después.
import { descargarBlob, toast } from '../util.js';

const DB = 'calidad-fotos', ST = 'fotos';
const MAX_PX = 1600;

function abrir() {
  return new Promise((ok, mal) => {
    const rq = indexedDB.open(DB, 1);
    rq.onupgradeneeded = () => rq.result.createObjectStore(ST);
    rq.onsuccess = () => ok(rq.result);
    rq.onerror = () => mal(rq.error);
  });
}
async function tx(modo, fn) {
  const db = await abrir();
  return new Promise((ok) => {
    const rq = fn(db.transaction(ST, modo).objectStore(ST));
    rq.onsuccess = () => ok(rq.result ?? null);
    rq.onerror = () => ok(null);
  });
}

/** { blob, ancho, alto, t } o null. */
export async function leerFoto(codigo) { try { return await tx('readonly', (s) => s.get(codigo)); } catch (e) { return null; } }
export async function borrarFoto(codigo) { try { await tx('readwrite', (s) => s.delete(codigo)); } catch (e) { /* sin almacenamiento */ } }
async function guardarFoto(codigo, foto) {
  try { await tx('readwrite', (s) => s.put(foto, codigo)); return true; } catch (e) { return false; }
}

/** Abre la cámara (camara: true) o la galería. Devuelve el archivo elegido o null. */
function elegirArchivo(camara) {
  return new Promise((ok) => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*';
    if (camara) inp.setAttribute('capture', 'environment');
    inp.onchange = () => ok(inp.files[0] || null);
    inp.click();
  });
}

/** Reduce la foto a JPEG de máx. 1600 px (respeta la orientación del celular). */
async function preparar(file) {
  let img;
  try { img = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) {
    img = await new Promise((ok, mal) => { const i = new Image(); i.onload = () => ok(i); i.onerror = mal; i.src = URL.createObjectURL(file); });
  }
  const w0 = img.width, h0 = img.height, k = Math.min(1, MAX_PX / Math.max(w0, h0));
  const cv = document.createElement('canvas');
  cv.width = Math.round(w0 * k); cv.height = Math.round(h0 * k);
  cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
  const blob = await new Promise((ok) => cv.toBlob(ok, 'image/jpeg', 0.82));
  return { blob, ancho: cv.width, alto: cv.height, t: Date.now() };
}

/**
 * Toma o elige la foto del protocolo. Con la cámara, además la descarga al teléfono para que quede guardada allí.
 * Devuelve la foto guardada o null.
 */
export async function capturarFoto(codigo, { camara }) {
  const file = await elegirArchivo(camara);
  if (!file) return null;
  const foto = await preparar(file);
  await guardarFoto(codigo, foto);
  if (camara) {
    descargarBlob(foto.blob, `${codigo}-foto.jpg`);
    toast('Foto guardada en tu teléfono. Se usará al imprimir este protocolo.', 'ok');
  } else toast('Foto lista. Se usará al imprimir este protocolo desde este equipo.', 'ok');
  return foto;
}

/** Foto lista para enviar a la API (solo para armar la hoja). */
export async function fotoParaApi(codigo) {
  const f = await leerFoto(codigo);
  if (!f || !f.blob) return null;
  const base64 = await new Promise((ok) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result).split(',')[1]); fr.readAsDataURL(f.blob); });
  return { base64, mime: 'image/jpeg', ancho: f.ancho, alto: f.alto, t: f.t };
}
