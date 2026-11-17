// Protocolo listo para imprimir/enviar: PDF armado al momento con los datos guardados (no se almacena ningún archivo).
// Si el formato lleva reporte fotográfico, la foto sale del teléfono del usuario (fotos.js) solo para armar la hoja.
import { api } from '../api.js';
import { $, esc, modal, toast, tarea, base64ABlob, descargarBlob } from '../util.js';
import { numFormato, nombreFormato, estructuraDe } from './formulario.js';
import { fotoParaApi, capturarFoto } from './fotos.js';

const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
const cache = new Map(); // codigo → { firma, file } (se invalida al volver a guardar o al cambiar la foto)

const firmaDe = (r, foto) => `${r.Formato}|${r.Fecha_Modificacion || ''}|${(r.Datos_Formulario || '').length}|${foto ? foto.t : ''}`;

/** ¿El formato lleva foto? → la foto local del código (o null). */
async function fotoDe(r) {
  const est = await estructuraDe(r.Formato).catch(() => null);
  if (!est || !est.foto) return { lleva: false, foto: null };
  return { lleva: true, foto: await fotoParaApi(r.Codigo_Completo) };
}

async function hoja(r, salida, foto) {
  const datos = { codigo: r.Codigo_Completo, formato: r.Formato, salida };
  if (foto) datos.foto = { base64: foto.base64, mime: foto.mime, ancho: foto.ancho, alto: foto.alto };
  return api('archivos.descargarFormato', datos);
}

/** PDF del protocolo como File (cacheado mientras no cambien los datos ni la foto). */
export async function pdfDe(r) {
  const { foto } = await fotoDe(r);
  const c = cache.get(r.Codigo_Completo);
  if (c && c.firma === firmaDe(r, foto)) return c.file;
  const f = await tarea(() => hoja(r, 'pdf', foto), 'Armando el PDF…');
  if (!f) return null;
  const file = new File([base64ABlob(f.base64, f.mime)], f.nombre, { type: f.mime });
  cache.set(r.Codigo_Completo, { firma: firmaDe(r, foto), file });
  return file;
}

export async function descargarPDF(r) {
  const file = await pdfDe(r);
  if (file) descargarBlob(file, file.name);
}

/** Excel (xlsx) lleno con los datos guardados (y la foto, si el formato la lleva y está en este equipo). */
export async function descargarXlsx(r) {
  const { foto } = await fotoDe(r);
  const f = await tarea(() => hoja(r, undefined, foto), 'Armando el Excel…');
  if (f) descargarBlob(base64ABlob(f.base64, f.mime), f.nombre);
}

/** Enviar por WhatsApp / correo (menú compartir del celular). Si no se puede, lo descarga. */
export async function enviarPDF(r) {
  const file = await pdfDe(r);
  if (!file) return;
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: file.name, text: `${nombreFormato(r.Formato)} · ${r.Codigo_Completo}` }); } catch (e) { /* cancelado */ }
  } else {
    descargarBlob(file, file.name);
    toast('Este equipo no permite compartir directo: se descargó el PDF para que lo envíes.');
  }
}

let pdfjs = null;
function cargarPdfJs() {
  if (pdfjs) return pdfjs;
  pdfjs = new Promise((ok, mal) => {
    const s = document.createElement('script');
    s.src = PDFJS + 'pdf.min.js';
    s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.js'; ok(window.pdfjsLib); };
    s.onerror = () => { pdfjs = null; mal(new Error('sin visor')); };
    document.head.appendChild(s);
  });
  return pdfjs;
}

/** Vista previa en la app; desde ahí se descarga, se envía o se vuelve a editar. */
export async function vistaPrevia(r, opciones = {}) {
  const { onEditar } = opciones;
  const ft = await fotoDe(r);
  const file = await pdfDe(r);
  if (!file) return;
  const m = modal({
    grande: true,
    titulo: `Vista previa · ${esc(numFormato(r.Formato))}`,
    cuerpo: `<div class="small muted mono">${esc(r.Codigo_Completo)}</div>
      ${ft.lleva && !ft.foto ? `<div class="aviso aviso-warn">Este protocolo lleva <b>reporte fotográfico</b> y en este equipo no hay foto guardada:
          la hoja sale con el recuadro vacío para adjuntarla después. <button class="btn btn-sm" id="vp-foto" type="button">Agregar foto</button></div>` : ''}
      <div class="vp-hojas" id="vp"><div class="vacio">Cargando vista previa…</div></div>`,
    pie: `${onEditar ? '<button class="btn" id="vp-editar">Editar</button>' : ''}
      <button class="btn" id="vp-enviar">Enviar</button><button class="btn btn-primary" id="vp-pdf">Descargar PDF</button>`,
  });
  $('#vp-pdf', m.el).onclick = () => descargarPDF(r);
  $('#vp-enviar', m.el).onclick = () => enviarPDF(r);
  if (onEditar) $('#vp-editar', m.el).onclick = () => { m.cerrar(); onEditar(); };
  const bf = $('#vp-foto', m.el);
  if (bf) bf.onclick = async () => { if (await capturarFoto(r.Codigo_Completo, { camara: false })) { m.cerrar(); vistaPrevia(r, opciones); } };
  const cont = $('#vp', m.el);
  try {
    const lib = await cargarPdfJs();
    const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    cont.innerHTML = '';
    for (let i = 1; i <= doc.numPages; i++) {
      const pag = await doc.getPage(i);
      const base = pag.getViewport({ scale: 1 });
      const escala = Math.min(2.5, (cont.clientWidth || 360) / base.width) * (window.devicePixelRatio || 1);
      const vp = pag.getViewport({ scale: escala });
      const cv = document.createElement('canvas');
      cv.width = vp.width; cv.height = vp.height; cv.className = 'vp-hoja';
      cont.appendChild(cv);
      await pag.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
    }
  } catch (e) {
    const url = URL.createObjectURL(file);
    cont.innerHTML = `<iframe class="vp-frame" src="${url}" title="Vista previa"></iframe>`;
  }
}
