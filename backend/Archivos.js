/**
 * Archivos en Drive (cuenta hcat). Los usuarios NUNCA reciben acceso a Drive:
 * todo se sube/descarga a través de la API en base64.
 *
 * Estructura:  <Raíz>/Finales/<Serie>/   <Raíz>/Plantillas/   <Raíz>/Temporal/
 */

var MIMES_FINAL = ['application/pdf', 'image/jpeg', 'image/png'];
var MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
var MIME_XLS = 'application/vnd.ms-excel';
var MIME_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
var MIME_DOC = 'application/msword';

function carpeta_(clave) {
  return DriveApp.getFolderById(prop_(clave));
}

function subcarpeta_(padre, nombre) {
  var it = padre.getFoldersByName(nombre);
  return it.hasNext() ? it.next() : padre.createFolder(nombre);
}

// ---------------------------------------------------------------- Formato final (escaneado firmado)

function subirFinal_(ctx, d) {
  var mime = txt_(d.mime);
  if (MIMES_FINAL.indexOf(mime) < 0) throw err_('Formato no permitido. Usa PDF, JPG o PNG.', 'ARCHIVO');
  if (!d.base64) throw err_('Archivo vacío.', 'ARCHIVO');

  return conLock_(function () {
    var regs = leer_(SH.REGISTROS);
    var reg = buscarRegistro_(regs, d.codigo, ctx.proyecto);
    exigirDuenoOAdmin_(ctx, reg);
    if (reg.Estado !== ESTADO.ACTIVO) throw err_('El código está liberado. Reutilízalo antes de cargar el formato.', 'NEGOCIO');
    if (reg.Estado_Doc === DOC.VALIDADO && !puede_(ctx, 'administrar')) {
      throw err_('El formato ya fue validado. Solo un administrador puede reemplazarlo.', 'NEGOCIO');
    }
    var nombre = reg.Codigo_Completo + '_' + sello_() + '.' + extDe_(d.nombre, mime);
    var blob = blobDeBase64_(d.base64, mime, nombre);
    var archivo = subcarpeta_(carpeta_('FINALES_ID'), reg.Serie).createFile(blob);

    var reemplaza = reg.Archivo_ID ? ' (reemplaza ' + reg.Archivo_Nombre + ')' : '';
    if (reg.Archivo_ID) {
      try { DriveApp.getFileById(reg.Archivo_ID).setName('[REEMPLAZADO] ' + reg.Archivo_Nombre); } catch (e) { /* se conserva igual */ }
    }
    var previo = reg.Estado_Doc;
    reg.Archivo_ID = archivo.getId();
    reg.Archivo_Nombre = nombre;
    reg.Archivo_Mime = mime;
    reg.Fecha_Carga = iso_();
    reg.Cargado_Por = ctx.usuario.Correo;
    reg.Estado_Doc = DOC.CARGADO;
    reg.Validado_Por = '';
    reg.Fecha_Validacion = '';
    reg.Observacion_Auditor = '';
    reg.Modificado_Por = ctx.usuario.Correo;
    reg.Fecha_Modificacion = reg.Fecha_Carga;
    actualizar_(SH.REGISTROS, reg);
    registrarHist_(hist_(ctx, 'Carga de final', reg,
      'Archivo: ' + nombre + reemplaza + (previo === DOC.OBSERVADO ? '. Corrige observación.' : '')));
    return publico_(reg);
  });
}

function descargarFinal_(ctx, d) {
  var reg = buscarRegistro_(leer_(SH.REGISTROS), d.codigo, ctx.proyecto);
  if (!reg.Archivo_ID) throw err_('Este código no tiene formato final cargado.', 'NO_EXISTE');
  var blob = DriveApp.getFileById(reg.Archivo_ID).getBlob();
  return { nombre: reg.Archivo_Nombre, mime: reg.Archivo_Mime || blob.getContentType(), base64: Utilities.base64Encode(blob.getBytes()) };
}

// ---------------------------------------------------------------- Biblioteca de formatos (plantillas)
//
// Cada formato aprobado (p. ej. PSR2-F2-CPC-CAL-EMD-FOR-0001 "Reparación de juntas de waterstop") se sube una vez.
// Al descargarlo para un código, la app escribe los datos del código en los {MARCADORES}.
//  - Excel (.xlsx): se rellena el archivo ORIGINAL (XML), así conserva logos, bordes y cuadros de firma tal cual.
//  - Word (.docx): se convierte a Google Docs, se reemplaza y se exporta a Word o PDF.
//  - PDF: se entrega tal cual (sin marcadores).

var RE_CODIGO_FORMATO = /^[A-Z0-9]+(-[A-Z0-9]+){2,9}$/;

function formatosDe_(proyecto) {
  return leer_(SH.FORMATOS).filter(function (f) { return f.Proyecto === proyecto; });
}

/** Lista para el frontend: el Propietario ve también los inactivos. */
function formatosVisibles_(ctx) {
  return formatosDe_(ctx.proyecto).filter(function (f) { return puede_(ctx, 'plantillas') || esTrue_(f.Activo); }).map(function (f) {
    return { Codigo_Formato: f.Codigo_Formato, Nombre: f.Nombre, Revision: f.Revision, Plantilla_Tipo: f.Plantilla_Tipo,
      Plantilla_Nombre: f.Plantilla_Nombre, Activo: f.Activo };
  });
}

function formatoDe_(ctx, codigo) {
  var fs = formatosDe_(ctx.proyecto);
  for (var i = 0; i < fs.length; i++) if (fs[i].Codigo_Formato === codigo) return fs[i];
  throw err_('El formato ' + codigo + ' no existe.', 'NO_EXISTE');
}

function tipoPlantilla_(nombre, mime) {
  var ext = extDe_(nombre, mime);
  if (ext === 'xlsx' || mime === MIME_XLSX) return 'xlsx';
  if (ext === 'docx' || ext === 'doc' || mime === MIME_DOCX || mime === MIME_DOC) return 'doc';
  if (ext === 'pdf') return 'archivo';
  throw err_('Plantilla no soportada. Usa Excel (.xlsx), Word (.docx) o PDF. Si es .xls antiguo, guárdalo como .xlsx.', 'ARCHIVO');
}

/** Crea o actualiza un formato. d: { Codigo_Formato, Nombre, Revision, Activo, archivo?: {nombre, mime, base64} } */
function guardarFormato_(ctx, d) {
  exigir_(ctx, 'plantillas');
  var codigo = txt_(d.Codigo_Formato).toUpperCase();
  var nombre = txt_(d.Nombre);
  if (!RE_CODIGO_FORMATO.test(codigo)) throw err_('Código de formato inválido (ej.: PSR2-F2-CPC-CAL-EMD-FOR-0001).', 'VALIDACION');
  var a = d.archivo || null;
  var tipo = a ? tipoPlantilla_(a.nombre, a.mime) : '';

  return conLock_(function () {
    var existente = null;
    formatosDe_(ctx.proyecto).forEach(function (f) { if (f.Codigo_Formato === codigo) existente = f; });
    if (!existente && !a) throw err_('Adjunta el archivo del formato.', 'VALIDACION');
    var f = existente || { Codigo_Formato: codigo, Proyecto: ctx.proyecto, Fecha_Alta: iso_(), Alta_Por: ctx.usuario.Correo };
    // Nombre visible = título del propio Excel (p. ej. "REPARACIÓN DE JUNTAS DE WATERSTOP"), salvo que se escriba otro
    if (nombre) f.Nombre = nombre;
    else if (a && tipo === 'xlsx') {
      try { var fi = abrirFicha_(blobDeBase64_(a.base64, MIME_XLSX, txt_(a.nombre))); if (fi.estructura && fi.estructura.titulo) f.Nombre = fi.estructura.titulo; } catch (e) { }
    }
    f.Nombre = f.Nombre || '';
    f.Revision = txt_(d.Revision).toUpperCase();
    f.Activo = d.Activo === undefined ? 'TRUE' : (esTrue_(d.Activo) ? 'TRUE' : 'FALSE');

    if (a) {
      if (!a.base64) throw err_('Archivo vacío.', 'ARCHIVO');
      var blob = blobDeBase64_(a.base64, a.mime || 'application/octet-stream', txt_(a.nombre));
      var titulo = 'FORMATO ' + codigo + ' - ' + txt_(a.nombre);
      var carpeta = carpeta_('PLANTILLAS_ID');
      var id = tipo === 'doc'
        ? Drive.Files.create({ name: titulo, mimeType: MimeType.GOOGLE_DOCS, parents: [carpeta.getId()] }, blob).id
        : carpeta.createFile(blob).setName(titulo).getId();
      if (existente && existente.Plantilla_ID) {
        try { DriveApp.getFileById(existente.Plantilla_ID).setName('[ANTERIOR ' + sello_() + '] ' + existente.Plantilla_Nombre); } catch (e) { }
      }
      f.Plantilla_ID = id;
      f.Plantilla_Nombre = txt_(a.nombre);
      f.Plantilla_Tipo = tipo;
      f.Plantilla_Mime = txt_(a.mime);
    }

    if (existente) actualizar_(SH.FORMATOS, f); else agregar_(SH.FORMATOS, [f]);
    registrarHist_(hist_(ctx, existente ? 'Formato actualizado' : 'Formato creado', null,
      codigo + ' ' + nombre + (a ? ' · archivo ' + f.Plantilla_Nombre : '') + (f.Activo === 'TRUE' ? '' : ' · inactivo'), ''));
    return publico_(f);
  });
}

/** Valores para reemplazar {MARCADOR} en la plantilla. */
function valoresMarcadores_(ctx, reg, serie, formato) {
  var dueno = reg.Usuario ? buscarUsuario_(reg.Usuario) : null;
  var f = (reg.Fecha_Creacion || iso_()).substring(0, 10).split('-');
  var desc = {};
  catalogo_(ctx.proyecto).forEach(function (c) { desc[c.Tipo + '|' + c.Codigo] = c.Descripcion || c.Codigo; });
  var d = function (tipo, cod) { return desc[tipo + '|' + cod] || cod || ''; };
  return {
    CODIGO: reg.Codigo_Completo, SERIE: reg.Serie, CORRELATIVO: ('000' + reg.Correlativo_Numero).slice(-4), PROYECTO: reg.Proyecto,
    FASE: serie.Fase, FASE_DESC: d('Fase', serie.Fase), EMPRESA: ctx.config.Empresa,
    ESPECIALIDAD: serie.Especialidad, ESPECIALIDAD_DESC: d('Especialidad', serie.Especialidad),
    TRAMO: serie.Tramo, TRAMO_DESC: d('Tramo', serie.Tramo),
    TIPO_DOCUMENTO: serie.Tipo_Documento, TIPO_DESC: d('Tipo_Documento', serie.Tipo_Documento),
    FECHA: f.length === 3 ? f[2] + '/' + f[1] + '/' + f[0] : '',
    USUARIO: reg.Usuario, NOMBRE_USUARIO: dueno ? dueno.Nombre : '',
    ACTIVIDAD: reg.Actividad, UBICACION: reg.Ubicacion, PK_INICIAL: reg.PK_Inicial, PK_FINAL: reg.PK_Final,
    PROGRESIVA: progresiva(reg.PK_Inicial, reg.PK_Final),
    PROTOCOLO: reg.Protocolo_Topografico, VALORIZACION: reg.Valorizacion,
    FORMATO: formato ? formato.Codigo_Formato : '', FORMATO_NOMBRE: formato ? formato.Nombre : '',
  };
}

/**
 * Rellena un xlsx original: escribe la ficha (encabezado, checks, comentarios) y reemplaza {MARCADORES}
 * en su XML (hojas, cadenas, cuadros de texto). Todo lo demás del archivo queda intacto.
 */
/**
 * Convierte el Excel lleno a PDF (solo la hoja de la ficha). Se convierte en una copia temporal de Google Sheets que se
 * envía a la papelera al terminar: no queda ningún archivo guardado.
 */
function xlsxAPdf_(xlsxBlob, posicion, horizontal) {
  var meta = Drive.Files.create({ name: 'TMP PDF ' + sello_(), mimeType: 'application/vnd.google-apps.spreadsheet', parents: [carpeta_('TEMPORAL_ID').getId()] },
    xlsxBlob.setContentType(MIME_XLSX));
  try {
    var hojas = SpreadsheetApp.openById(meta.id).getSheets();
    var gid = (hojas[posicion] || hojas[0]).getSheetId();
    // scale=4: la ficha completa (cuadros de firma incluidos) entra en UNA página, igual que en Excel; nunca se corta
    var url = 'https://docs.google.com/spreadsheets/d/' + meta.id + '/export?format=pdf&gid=' + gid + '&size=A4&portrait=' + (!horizontal) +
      '&scale=4&gridlines=false&printtitle=false&sheetnames=false&pagenum=UNDEFINED&fzr=false&horizontal_alignment=CENTER&vertical_alignment=TOP' +
      '&top_margin=0.4&bottom_margin=0.4&left_margin=0.4&right_margin=0.4';
    var resp = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
    if (resp.getResponseCode() !== 200) throw err_('No se pudo generar el PDF (HTTP ' + resp.getResponseCode() + ').', 'INTERNO');
    return resp.getBlob().getBytes();
  } finally {
    DriveApp.getFileById(meta.id).setTrashed(true);
  }
}

function llenarXlsx_(blob, valores, nombre, ficha) {
  var f = abrirFicha_(blob);
  llenarXlsx_.ultimo = { posicion: f.posicion || 0, horizontal: !!f.horizontal };
  var hojaFicha = null, iEstilos = -1, estilos = null;
  if (f.indice >= 0 && ficha) {
    f.partes.forEach(function (p, i) { if (p.getName() === 'xl/styles.xml') iEstilos = i; });
    estilos = estilosFicha_(iEstilos >= 0 ? f.partes[iEstilos].getDataAsString('UTF-8') : '');
    hojaFicha = escribirFicha_(f.partes[f.indice].getDataAsString('UTF-8'), f.estructura, ficha.valores, ficha.datos, estilos, ficha.extras);
  }
  var salida = f.partes.map(function (p, i) {
    var n = p.getName();
    if (i === iEstilos && estilos) return Utilities.newBlob(estilos.xml, 'application/xml', n);
    if (!/^xl\/(sharedStrings\.xml|worksheets\/[^/]+\.xml|drawings\/[^/]+\.xml)$/.test(n)) return p;
    var xml = i === f.indice && hojaFicha !== null ? hojaFicha : p.getDataAsString('UTF-8');
    return Utilities.newBlob(reemplazarMarcadoresXml(xml, valores), 'application/xml', n);
  });
  // Foto del reporte fotográfico: viene del teléfono del usuario solo para armar esta hoja (no se guarda)
  if (ficha && ficha.foto && f.estructura && f.estructura.foto) {
    salida = insertarFoto_(salida, f.partes[f.indice].getName(), f.estructura.foto, ficha.foto);
  }
  return Utilities.zip(salida, nombre).setContentType(MIME_XLSX);
}

// ---------------------------------------------------------------- Foto dentro del recuadro del formato

var NS_REL_ = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

/** Anchos (px) de columnas y altos (px) de filas de una hoja, para ubicar la foto dentro de su recuadro. */
function medidasHoja_(xml) {
  var fmt = /<sheetFormatPr\b[^>]*>/.exec(xml);
  fmt = fmt ? fmt[0] : '';
  var ancho0 = +((/defaultColWidth="([\d.]+)"/.exec(fmt) || [])[1] || (+((/baseColWidth="([\d.]+)"/.exec(fmt) || [])[1] || 8) + 0.71));
  var alto0 = +((/defaultRowHeight="([\d.]+)"/.exec(fmt) || [])[1] || 15);
  var cols = [], m, re = /<col\b[^>]*\/>/g;
  while ((m = re.exec(xml))) {
    var a = +/min="(\d+)"/.exec(m[0])[1], b = +/max="(\d+)"/.exec(m[0])[1], w = /width="([\d.]+)"/.exec(m[0]);
    for (var c = a; c <= Math.min(b, 200); c++) cols[c] = w ? +w[1] : ancho0;
  }
  var filas = [], rf = /<row\b[^>]*>/g;
  while ((m = rf.exec(xml))) { var h = /\sht="([\d.]+)"/.exec(m[0]); if (h) filas[+/\sr="(\d+)"/.exec(m[0])[1]] = +h[1]; }
  return {
    col: function (c) { return Math.floor((cols[c] || ancho0) * 7 + 5); },
    fila: function (f) { return Math.round((filas[f] || alto0) * 96 / 72); },
  };
}

function parte_(salida, nombre) { for (var i = 0; i < salida.length; i++) if (salida[i].getName() === nombre) return i; return -1; }
function texto_(salida, nombre) { var i = parte_(salida, nombre); return i >= 0 ? salida[i].getDataAsString('UTF-8') : ''; }
function poner_(salida, nombre, xml) {
  var i = parte_(salida, nombre), b = Utilities.newBlob(xml, 'application/xml', nombre);
  if (i >= 0) salida[i] = b; else salida.push(b);
}

/**
 * Inserta la foto (foto: {base64, mime, ancho, alto}) centrada y sin deformar dentro del recuadro area {desde, hasta}.
 * Usa el dibujo de la hoja si existe (logos, firmas); si no, lo crea.
 */
function insertarFoto_(salida, rutaHoja, area, foto) {
  var ext = /png/.test(foto.mime) ? 'png' : 'jpeg';
  var bytes = Utilities.base64Decode(foto.base64);
  var hojaXml = texto_(salida, rutaHoja);
  var base = rutaHoja.replace(/^.*\//, '');
  var rutaRelsHoja = 'xl/worksheets/_rels/' + base + '.rels';
  var relsHoja = texto_(salida, rutaRelsHoja) || '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
  var tipos = texto_(salida, '[Content_Types].xml');

  // Dibujo de la hoja
  var rutaDib = '', dr = /<drawing\s+r:id="([^"]+)"/.exec(hojaXml);
  if (dr) {
    var rel = new RegExp('<Relationship\\b[^>]*Id="' + dr[1] + '"[^>]*>').exec(relsHoja);
    var t = rel && /Target="([^"]+)"/.exec(rel[0]);
    if (t) rutaDib = t[1].charAt(0) === '/' ? t[1].substring(1) : 'xl/' + t[1].replace(/^\.\.\//, '');
  }
  if (!rutaDib) {
    rutaDib = 'xl/drawings/drawingApp.xml';
    poner_(salida, rutaDib, '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"></xdr:wsDr>');
    relsHoja = relsHoja.replace('</Relationships>', '<Relationship Id="rIdAppDib" Type="' + NS_REL_ + '/drawing" Target="../drawings/drawingApp.xml"/></Relationships>');
    poner_(salida, rutaRelsHoja, relsHoja);
    if (!/xmlns:r=/.test(hojaXml.substring(0, 600))) hojaXml = hojaXml.replace(/<worksheet\b/, '<worksheet xmlns:r="' + NS_REL_ + '"');
    var antes = /<(legacyDrawing|legacyDrawingHF|picture|oleObjects|controls|webPublishItems|tableParts|extLst)\b|<\/worksheet>/.exec(hojaXml);
    hojaXml = hojaXml.slice(0, antes.index) + '<drawing r:id="rIdAppDib"/>' + hojaXml.slice(antes.index);
    poner_(salida, rutaHoja, hojaXml);
    tipos = tipos.replace('</Types>', '<Override PartName="/' + rutaDib + '" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>');
  }
  if (!new RegExp('Extension="' + ext + '"', 'i').test(tipos)) tipos = tipos.replace('</Types>', '<Default Extension="' + ext + '" ContentType="image/' + ext + '"/></Types>');
  poner_(salida, '[Content_Types].xml', tipos);

  // Imagen y su relación desde el dibujo
  var rutaImg = 'xl/media/fotoApp.' + ext;
  salida.push(Utilities.newBlob(bytes, 'image/' + ext, rutaImg));
  var rutaRelsDib = rutaDib.replace(/([^/]+)$/, '_rels/$1.rels');
  var relsDib = texto_(salida, rutaRelsDib) || '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
  poner_(salida, rutaRelsDib, relsDib.replace('</Relationships>', '<Relationship Id="rIdAppFoto" Type="' + NS_REL_ + '/image" Target="../media/fotoApp.' + ext + '"/></Relationships>'));

  // Ubicación: centrada en el recuadro, conservando la proporción
  var med = medidasHoja_(hojaXml), a = partirRef_(area.desde), b = partirRef_(area.hasta);
  var W = 0, H = 0, c, f;
  for (c = a.c; c <= b.c; c++) W += med.col(c);
  for (f = a.f; f <= b.f; f++) H += med.fila(f);
  var pad = 6, s = Math.min((W - 2 * pad) / (+foto.ancho || 4), (H - 2 * pad) / (+foto.alto || 3));
  var iw = Math.max(1, Math.floor((+foto.ancho || 4) * s)), ih = Math.max(1, Math.floor((+foto.alto || 3) * s));
  var x0 = Math.floor((W - iw) / 2), y0 = Math.floor((H - ih) / 2);
  var EMU = 9525;
  var punto = function (px, desde, hasta, medida) {
    for (var k = desde; k <= hasta; k++) { var w = medida(k); if (px < w || k === hasta) return { i: k - 1, off: Math.min(px, w) * EMU }; px -= w; }
  };
  var de = { c: punto(x0, a.c, b.c, med.col), f: punto(y0, a.f, b.f, med.fila) };
  var al = { c: punto(x0 + iw, a.c, b.c, med.col), f: punto(y0 + ih, a.f, b.f, med.fila) };
  var dib = texto_(salida, rutaDib);
  var ids = (dib.match(/<xdr:cNvPr\b[^>]*\sid="(\d+)"/g) || []).map(function (x) { return +/id="(\d+)"/.exec(x)[1]; });
  var id = Math.max.apply(null, [1].concat(ids)) + 1;
  var ancla = '<xdr:twoCellAnchor editAs="oneCell">' +
    '<xdr:from><xdr:col>' + de.c.i + '</xdr:col><xdr:colOff>' + de.c.off + '</xdr:colOff><xdr:row>' + de.f.i + '</xdr:row><xdr:rowOff>' + de.f.off + '</xdr:rowOff></xdr:from>' +
    '<xdr:to><xdr:col>' + al.c.i + '</xdr:col><xdr:colOff>' + al.c.off + '</xdr:colOff><xdr:row>' + al.f.i + '</xdr:row><xdr:rowOff>' + al.f.off + '</xdr:rowOff></xdr:to>' +
    '<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="' + id + '" name="Foto ' + id + '"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr>' +
    '<xdr:blipFill><a:blip xmlns:r="' + NS_REL_ + '" r:embed="rIdAppFoto"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>' +
    '<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + iw * EMU + '" cy="' + ih * EMU + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic>' +
    '<xdr:clientData/></xdr:twoCellAnchor>';
  poner_(salida, rutaDib, dib.replace(/<\/xdr:wsDr>\s*$/, ancla + '</xdr:wsDr>'));
  return salida;
}

/**
 * Descarga un formato rellenado con los datos del código.
 * d: { codigo, formato (Codigo_Formato; por defecto el ya asociado), salida: 'pdf' | 'original' (solo Word) }
 * El formato elegido queda asociado al código (salvo que ya esté validado).
 */
function descargarFormato_(ctx, d) {
  // Cualquier usuario del proyecto (incluido el cliente/Visitante) puede descargar la hoja para imprimir:
  // se arma al momento con los datos guardados; no se almacena ningún archivo.
  var reg = buscarRegistro_(leer_(SH.REGISTROS), d.codigo, ctx.proyecto);
  var puedeAsociar = esDueno_(ctx, reg) || puede_(ctx, 'administrar');
  var codFormato = txt_(d.formato).toUpperCase() || reg.Formato;
  if (codFormato !== reg.Formato && !puedeAsociar) throw err_('Solo el dueño del código o un administrador elige su protocolo.', 'PERMISO');
  if (!codFormato) throw err_('Elige el formato a descargar.', 'VALIDACION');
  var formato = formatoDe_(ctx, codFormato);
  if (!esTrue_(formato.Activo)) throw err_('El formato ' + codFormato + ' está inactivo.', 'NEGOCIO');
  var serie = serieDe_(ctx, reg.Serie);
  var base = reg.Codigo_Completo;
  var res;

  if (formato.Plantilla_Tipo === 'archivo') {
    var b0 = DriveApp.getFileById(formato.Plantilla_ID).getBlob();
    res = { nombre: base + '.pdf', mime: 'application/pdf', bytes: b0.getBytes(), ext: 'pdf' };
  } else if (formato.Plantilla_Tipo === 'xlsx') {
    var ficha = valoresFicha_(ctx, reg, serie);
    // Foto del reporte fotográfico: la manda el teléfono del usuario solo para armar esta hoja; no se guarda
    var ft = d.foto;
    if (ft && ft.base64 && /^image\/(jpeg|png)$/.test(txt_(ft.mime)) && String(ft.base64).length < 12000000) {
      ficha.foto = { base64: String(ft.base64), mime: txt_(ft.mime), ancho: +ft.ancho || 0, alto: +ft.alto || 0 };
    }
    var lleno = llenarXlsx_(DriveApp.getFileById(formato.Plantilla_ID).getBlob(), valoresMarcadores_(ctx, reg, serie, formato), base + '.xlsx', ficha);
    if (d.salida === 'pdf') {
      var u = llenarXlsx_.ultimo || {};
      res = { nombre: base + '.pdf', mime: 'application/pdf', bytes: xlsxAPdf_(lleno, u.posicion || 0, u.horizontal), ext: 'pdf' };
    } else res = { nombre: base + '.xlsx', mime: MIME_XLSX, bytes: lleno.getBytes(), ext: 'xlsx' };
  } else {
    var pdf = d.salida === 'pdf';
    var valores = valoresMarcadores_(ctx, reg, serie, formato);
    var copia = DriveApp.getFileById(formato.Plantilla_ID).makeCopy('TMP ' + base + ' ' + sello_(), carpeta_('TEMPORAL_ID'));
    try {
      var doc = DocumentApp.openById(copia.getId());
      [doc.getBody(), doc.getHeader(), doc.getFooter()].forEach(function (p) {
        if (p) MARCADORES.forEach(function (m) { p.replaceText('\\{' + m + '\\}', txt_(valores[m])); });
      });
      doc.saveAndClose();
      var url = 'https://docs.google.com/document/d/' + copia.getId() + '/export?format=' + (pdf ? 'pdf' : 'docx');
      var resp = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
      if (resp.getResponseCode() !== 200) throw err_('No se pudo generar el formato (HTTP ' + resp.getResponseCode() + ').', 'INTERNO');
      var ext = pdf ? 'pdf' : 'docx';
      res = { nombre: base + '.' + ext, mime: pdf ? 'application/pdf' : MIME_DOCX, bytes: resp.getBlob().getBytes(), ext: ext };
    } finally {
      copia.setTrashed(true);
    }
  }

  conLock_(function () {
    var r = buscarRegistro_(leer_(SH.REGISTROS), reg.Codigo_Completo, ctx.proyecto);
    if (puedeAsociar && r.Formato !== codFormato && r.Estado_Doc !== DOC.VALIDADO) { r.Formato = codFormato; actualizar_(SH.REGISTROS, r); }
    registrarHist_(hist_(ctx, 'Formato descargado', r, codFormato + ' (' + res.ext.toUpperCase() + ')'));
  });
  return { nombre: res.nombre, mime: res.mime, base64: Utilities.base64Encode(res.bytes) };
}
