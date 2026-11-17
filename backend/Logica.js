/**
 * Lógica pura (sin servicios de Google) — testeable con Node: tests/logica.test.js
 */

/**
 * Revisión de integridad por serie.
 * @param {Array} series   filas de Series del proyecto
 * @param {Array} regs     filas de Registros del proyecto
 * @param {Object} opts    { diasLiberado, diasPendiente, ahora (ms) }
 */
function calcularIntegridad(series, regs, opts) {
  var ahora = opts.ahora || Date.now();
  var dias = function (isoTxt) {
    if (!isoTxt) return 0;
    var t = new Date(String(isoTxt).replace(' ', 'T')).getTime();
    return isNaN(t) ? 0 : Math.floor((ahora - t) / 86400000);
  };
  var porSerie = [];
  var alertas = { duplicados: 0, huecos: 0, descuadres: 0, sinDueno: 0, liberadosViejos: 0, pendientesViejos: 0, porValidar: 0, observados: 0, codigoMalFormado: 0 };
  var liberadosViejos = [];
  var pendientesViejos = [];

  series.forEach(function (s) {
    var rs = regs.filter(function (r) { return r.Serie === s.Codigo_Serie; });
    var conteo = {};
    var maximo = 0;
    var malFormados = [];
    rs.forEach(function (r) {
      var n = parseInt(r.Correlativo_Numero, 10);
      conteo[n] = (conteo[n] || 0) + 1;
      if (n > maximo) maximo = n;
      var esperado = s.Prefijo_Completo + '-' + ('000' + n).slice(-Math.max(4, String(n).length));
      if (r.Codigo_Completo !== esperado) malFormados.push(r.Codigo_Completo);
    });
    var duplicados = Object.keys(conteo).filter(function (n) { return conteo[n] > 1; }).map(Number);
    var ultimo = parseInt(s.Ultimo_Correlativo, 10) || 0;
    var huecos = [];
    for (var i = 1; i <= ultimo; i++) if (!conteo[i]) huecos.push(i);
    var fila = {
      serie: s.Codigo_Serie,
      prefijo: s.Prefijo_Completo,
      ultimo: ultimo,
      maximoReal: maximo,
      total: rs.length,
      duplicados: duplicados,
      huecos: huecos,
      descuadre: maximo > ultimo,
      malFormados: malFormados,
      sinDueno: rs.filter(function (r) { return !r.Usuario; }).length,
      liberados: rs.filter(function (r) { return r.Estado === 'Liberado'; }).length,
      pendientes: rs.filter(function (r) { return r.Estado === 'Activo' && r.Estado_Doc === 'Pendiente'; }).length,
      porValidar: rs.filter(function (r) { return r.Estado_Doc === 'Cargado'; }).length,
      observados: rs.filter(function (r) { return r.Estado_Doc === 'Observado'; }).length,
      validados: rs.filter(function (r) { return r.Estado_Doc === 'Validado'; }).length,
      historicos: rs.filter(function (r) { return r.Estado_Doc === 'Histórico'; }).length,
    };
    fila.ok = !duplicados.length && !huecos.length && !fila.descuadre && !malFormados.length;
    porSerie.push(fila);

    alertas.duplicados += duplicados.length;
    alertas.huecos += huecos.length;
    alertas.descuadres += fila.descuadre ? 1 : 0;
    alertas.sinDueno += fila.sinDueno;
    alertas.porValidar += fila.porValidar;
    alertas.observados += fila.observados;
    alertas.codigoMalFormado += malFormados.length;

    rs.forEach(function (r) {
      if (r.Estado === 'Liberado') {
        var dl = dias(r.Fecha_Liberacion);
        if (dl >= opts.diasLiberado) liberadosViejos.push({ codigo: r.Codigo_Completo, usuario: r.Usuario, dias: dl, motivo: r.Motivo_Liberacion });
      } else if (r.Estado_Doc === 'Pendiente') {
        var dp = dias(r.Fecha_Creacion);
        if (dp >= opts.diasPendiente) pendientesViejos.push({ codigo: r.Codigo_Completo, usuario: r.Usuario, dias: dp });
      }
    });
  });

  // Códigos cuyo prefijo no corresponde a ninguna serie
  var conocidas = {};
  series.forEach(function (s) { conocidas[s.Codigo_Serie] = true; });
  var huerfanos = regs.filter(function (r) { return !conocidas[r.Serie]; }).map(function (r) { return r.Codigo_Completo; });

  // Duplicado global del código (no debería existir nunca)
  var vistos = {};
  var codigosRepetidos = [];
  regs.forEach(function (r) {
    if (vistos[r.Codigo_Completo]) codigosRepetidos.push(r.Codigo_Completo);
    vistos[r.Codigo_Completo] = true;
  });

  alertas.liberadosViejos = liberadosViejos.length;
  alertas.pendientesViejos = pendientesViejos.length;
  var criticas = alertas.duplicados + alertas.descuadres + codigosRepetidos.length + huerfanos.length + alertas.codigoMalFormado;

  return {
    ok: criticas === 0,
    criticas: criticas,
    alertas: alertas,
    series: porSerie,
    liberadosViejos: liberadosViejos.sort(function (a, b) { return b.dias - a.dias; }),
    pendientesViejos: pendientesViejos.sort(function (a, b) { return b.dias - a.dias; }),
    huerfanos: huerfanos,
    codigosRepetidos: codigosRepetidos,
    totalCodigos: regs.length,
  };
}

/**
 * Valida filas de importación. Devuelve { filas:[{n, codigo, ok, errores[] , reg}], errores, validas, maxPorSerie }
 * @param {Array} filas          objetos del CSV
 * @param {Array} series         Series del proyecto
 * @param {Object} existentes    mapa codigo → true
 * @param {Object} usuarios      mapa correo → usuario
 */
function validarImportacion(filas, series, existentes, usuarios, normFecha) {
  var mapaSerie = {};
  var porPrefijo = {};
  series.forEach(function (s) { mapaSerie[s.Codigo_Serie] = s; porPrefijo[s.Prefijo_Completo] = s; });
  var enLote = {};
  var res = [];
  var maxPorSerie = {};
  var errores = 0;

  filas.forEach(function (f, i) {
    var e = [];
    /*
     * Formas aceptadas para identificar el código:
     *  a) Codigo (o Codigo_Completo): PSR2-F2-CPC-TOP-EMD-RGI-0001
     *  b) Nomenclatura (prefijo completo) + Correlativo: PSR2-F2-CPC-TOP-EMD-RGI + 1
     *  c) Serie F2-TOP-EMD-RGI + Correlativo, o Serie TOP-EMD-RGI + Fase F2 + Correlativo
     */
    var serieTxt = String(f.Serie || f.Nomenclatura || '').trim().toUpperCase();
    var corrTxt = String(f.Correlativo || f.Correlativo_Numero || '').trim();
    var codTxt = String(f.Codigo || f.Codigo_Completo || '').trim().toUpperCase();
    if (codTxt) {
      var m = codTxt.match(/^(.+)-(\d+)$/);
      if (m) { serieTxt = m[1]; corrTxt = m[2]; } else { serieTxt = codTxt; corrTxt = ''; }
    }
    var fase = String(f.Fase || '').trim().toUpperCase();
    var s = mapaSerie[serieTxt] || porPrefijo[serieTxt] || (fase ? mapaSerie[fase + '-' + serieTxt] : null);
    var serie = s ? s.Codigo_Serie : serieTxt;
    var n = parseInt(corrTxt, 10);
    var usuario = String(f.Usuario || '').trim().toLowerCase();
    var estado = String(f.Estado || 'Activo').trim() || 'Activo';
    var estadoDoc = String(f.Estado_Doc || '').trim() || (estado === 'Liberado' ? 'Pendiente' : 'Histórico');
    if (estadoDoc.toLowerCase() === 'historico') estadoDoc = 'Histórico';
    var fecha = normFecha(f.Fecha || f.Fecha_Creacion);
    var codigo = '';

    if (!s) e.push('Serie "' + (serie || '(vacía)') + '" no existe o no está habilitada para ti');
    if (isNaN(n) || n < 1 || !/^\d+$/.test(corrTxt)) e.push('Correlativo inválido');
    if (s && !isNaN(n) && n >= 1) {
      codigo = s.Prefijo_Completo + '-' + ('000' + n).slice(-Math.max(4, String(n).length));
      if (existentes[codigo]) e.push('Ya existe en el sistema');
      if (enLote[codigo]) e.push('Repetido en el archivo (fila ' + enLote[codigo] + ')');
    }
    if (usuario && !usuarios[usuario]) e.push('Usuario ' + usuario + ' sin acceso activo al proyecto');
    if (['Activo', 'Liberado'].indexOf(estado) < 0) e.push('Estado debe ser Activo o Liberado');
    if (estado === 'Liberado' && !usuario) e.push('Un código Liberado necesita Usuario');
    if (['Histórico', 'Pendiente'].indexOf(estadoDoc) < 0) e.push('Estado_Doc debe ser Histórico o Pendiente');
    if (estado === 'Liberado' && estadoDoc !== 'Pendiente') e.push('Un código Liberado debe tener Estado_Doc Pendiente');
    if (fecha === null) e.push('Fecha inválida (use dd/mm/aaaa)');

    if (codigo && !enLote[codigo]) enLote[codigo] = i + 2;
    if (!e.length) {
      maxPorSerie[serie] = Math.max(maxPorSerie[serie] || 0, n);
    } else {
      errores++;
    }
    res.push({
      n: i + 2, codigo: codigo, ok: !e.length, errores: e,
      reg: e.length ? null : {
        Codigo_Completo: codigo, Serie: serie, Correlativo_Numero: String(n), Usuario: usuario,
        Estado: estado, Estado_Doc: estadoDoc, Fecha_Creacion: fecha || '',
        Actividad: f.Actividad || '', Ubicacion: f.Ubicacion || '', PK_Inicial: f.PK_Inicial || '',
        PK_Final: f.PK_Final || '', Protocolo_Topografico: f.Protocolo_Topografico || '', Valorizacion: f.Valorizacion || '',
      },
    });
  });
  return { filas: res, errores: errores, validas: res.length - errores, maxPorSerie: maxPorSerie };
}

/**
 * Reemplaza {MARCADOR} dentro del XML de un xlsx/docx (celdas, cadenas compartidas, cuadros de texto).
 * Los valores se escapan para XML. Devuelve el XML nuevo.
 */
function reemplazarMarcadoresXml(xml, valores) {
  return String(xml).replace(/\{([A-Z_]+)\}/g, function (todo, m) {
    if (!Object.prototype.hasOwnProperty.call(valores, m)) return todo;
    return String(valores[m] == null ? '' : valores[m])
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  });
}

/** Progresiva legible a partir de PK inicial/final. */
function progresiva(pkIni, pkFin) {
  pkIni = String(pkIni || '').trim(); pkFin = String(pkFin || '').trim();
  if (pkIni && pkFin) return pkIni + ' – ' + pkFin;
  return pkIni || pkFin;
}

// ---------------------------------------------------------------- Fichas de inspección (xlsx) como formulario
//
// Todas las fichas comparten estructura: encabezado con rótulos ("CLIENTE:", "FASE:"…) y su valor a la derecha;
// tabla de control con columnas SI / NO / N/A, REGISTROS ASOCIADOS y RESULTADOS; luego COMENTARIOS y firmas.
// analizarFicha() detecta todo eso del propio Excel, sin configurar cada protocolo a mano.

function colNum_(letras) { var n = 0; for (var i = 0; i < letras.length; i++) n = n * 26 + (letras.charCodeAt(i) - 64); return n; }
function colLetras_(n) { var s = ''; while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
function partirRef_(ref) { var m = /^([A-Z]+)(\d+)$/.exec(ref); return { c: colNum_(m[1]), f: +m[2] }; }
function desXml_(t) { return String(t).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&'); }
function escXml_(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function textoDeNodos_(xml) { var out = '', re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g, m; while ((m = re.exec(xml))) out += m[1]; return desXml_(out); }

/** Lista de cadenas compartidas de xl/sharedStrings.xml. */
function leerCadenas(xml) {
  var out = [], re = /<si>([\s\S]*?)<\/si>/g, m;
  while ((m = re.exec(xml || ''))) out.push(textoDeNodos_(m[1]));
  return out;
}

/** Celdas con texto y rangos combinados de una hoja. */
function leerHoja(xml, cadenas) {
  var celdas = {}, re = /<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, m;
  while ((m = re.exec(xml))) {
    var attrs = m[2], cuerpo = m[3] || '', val = '';
    var v = /<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(cuerpo); // <v xml:space="preserve"> en celdas con fórmula (títulos)
    if (/t="s"/.test(attrs) && v) val = cadenas[+v[1]] || '';
    else if (/t="inlineStr"/.test(attrs)) val = textoDeNodos_(cuerpo);
    else if (v) val = desXml_(v[1]);
    val = String(val).trim();
    if (val) celdas[m[1]] = val;
  }
  var combinadas = [], rm = /<mergeCell ref="([A-Z]+\d+):([A-Z]+\d+)"/g;
  while ((m = rm.exec(xml))) { var a = partirRef_(m[1]), b = partirRef_(m[2]); combinadas.push({ c1: a.c, f1: a.f, c2: b.c, f2: b.f }); }
  // Anchos de columna (en caracteres): sirven para ubicar el valor de un rótulo sin celda propia
  var fmt = /<sheetFormatPr\b[^>]*>/.exec(xml), anchos = [], rc = /<col\b[^>]*\/>/g;
  var ancho0 = fmt && /defaultColWidth="([\d.]+)"/.exec(fmt[0]) ? +/defaultColWidth="([\d.]+)"/.exec(fmt[0])[1] : 8.43;
  while ((m = rc.exec(xml))) {
    var a1 = +/min="(\d+)"/.exec(m[0])[1], a2 = +/max="(\d+)"/.exec(m[0])[1], w = /width="([\d.]+)"/.exec(m[0]);
    var oc = /\shidden="(1|true)"/.test(m[0]); // columna oculta: no se ve ni se imprime
    for (var cc = a1; cc <= Math.min(a2, 300); cc++) anchos[cc] = oc ? 0 : w ? +w[1] : ancho0;
  }
  return { celdas: celdas, combinadas: combinadas, ancho: function (c) { return anchos[c] !== undefined ? anchos[c] : ancho0; } };
}

function normRotulo_(t) {
  return String(t).toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[°º]/g, '')
    .replace(/\s*\/\s*/g, '/').replace(/\s+/g, ' ').replace(/\s*:\s*$/, '').trim();
}

var ROTULOS_FICHA = {
  'CLIENTE': 'cliente', 'FASE': 'fase', 'ACTIVIDAD/PARTIDA': 'partida', 'DESCRIPCION/ESTRUCTURA': 'descripcion',
  'ESPECIALIDAD': 'especialidad', 'UBICACION': 'ubicacion', 'LOCALIZACION': 'localizacion', 'PROGRESIVA': 'progresiva',
  'FECHA': 'fecha', 'FECHA DE VERIFICACION': 'fecha', 'CORRELATIVO N': 'codigo', 'CORRELATIVO': 'codigo', 'CAPA': 'capa', 'CPC': 'cpc',
  'DOCUMENTOS DE REFERENCIA/PLANO': 'documentos', 'DOCUMENTOS DE REFERENCIA': 'documentos',
};
/** Rótulos de firma: se llenan a mano, nunca desde la app. */
var RE_FIRMAS_ = /^(NOMBRE|FIRMA|FIRMA Y SELLO|FECHA|CARGO|POR|SELLO|DNI|CIP|HORA)$/;
/** Partes que se llenan dentro del propio texto de una celda: "____", ":" final y casillas "[ ]". */
var RE_HUECOS_ = /_{3,}|\[\s*\]|:\s*$/g;

function claveExtra_(t) {
  return 'x_' + normRotulo_(t).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').substring(0, 40);
}

/** Huecos (texto) y casillas (elegir una) de un texto de celda. */
function partesEnCelda(texto) {
  var huecos = [], casillas = [], ult = 0, m, re = new RegExp(RE_HUECOS_.source, 'g'), primera = -1;
  while ((m = re.exec(texto))) {
    var antes = texto.substring(ult, m.index).replace(/\s+/g, ' ').trim();
    if (m[0].charAt(0) === '[') {
      if (primera < 0) primera = m.index;
      var pal = antes.split(' ');
      casillas.push(pal[pal.length - 1] || String(casillas.length + 1));
    } else {
      // Rótulo = lo escrito justo antes del hueco (su última línea); unidad = palabra corta justo después ("____ m3")
      var lin = texto.substring(ult, m.index).split(/\r?\n/).map(function (s) { return s.replace(/\s+/g, ' ').trim(); })
        .filter(function (s) { return s; }).pop() || '';
      var rot = lin.replace(/^[⇒=>\-;,\s]+/, '').replace(/[=:\s]+$/, '');
      var resto = texto.substring(m.index + m[0].length).split(/_{3,}|\[\s*\]|\r?\n/)[0].trim().replace(/[,;.]+$/, '');
      if ((rot.match(/\(/g) || []).length > (rot.match(/\)/g) || []).length) rot = rot.replace(/\s*\(\s*/, ' - '); // "Niveles (cota: ___ )"
      if (m[0].charAt(0) === '_' && /^[^\s()]{1,8}$/.test(resto) && /[A-Za-z0-9°%]/.test(resto)) rot = (rot ? rot + ' ' : '') + '(' + resto + ')';
      huecos.push(rot || (huecos.length ? huecos[huecos.length - 1].replace(/ \(\d+\)$/, '') + ' (' + (huecos.length + 1) + ')' : 'Valor'));
    }
    ult = m.index + m[0].length;
  }
  var etiqueta = (casillas.length ? texto.substring(0, primera).replace(/\s+/g, ' ').trim().split(' ').slice(0, -1).join(' ') : '') ||
    texto.replace(RE_HUECOS_, ' ').replace(/\s+/g, ' ').trim();
  return { huecos: huecos, casillas: casillas, etiqueta: etiqueta };
}

/** Escribe lo llenado dentro del texto original de la celda. val: { h: [textos], x: índice de la casilla marcada }. */
function rellenarEnCelda(texto, val) {
  val = val || {};
  var h = val.h || [], ih = 0, ic = 0, marca = (val.x === '' || val.x === undefined || val.x === null) ? -1 : +val.x;
  return String(texto).replace(new RegExp(RE_HUECOS_.source, 'g'), function (t) {
    if (t.charAt(0) === '[') return (ic++ === marca) ? '[X]' : t;
    var v = String(h[ih++] || '').trim();
    if (!v) return t;
    return t.charAt(0) === ':' ? ': ' + v : v;
  });
}

/**
 * Estructura de una ficha: { titulo, campos: [{clave, etiqueta, celda}], extras: [{clave, etiqueta, celda, texto?}],
 *   items: [{fila, n, grupo, descripcion, pc}], opciones: [{v, e, d, col}], modo: 'marca'|'texto',
 *   cols: {si, no, na, reg, res, obs}, etiquetas: {reg, res, obs}, enCelda: [{celda, fila, texto, item, etiqueta, huecos, casillas}],
 *   comentarios: [celdas], foto: {desde, hasta} | null }.
 * Lanza error si no reconoce la tabla de control.
 * Opciones por ítem según el propio formato: SI/NO/N/A · CONFORME/NO CONFORME/N/A · N/M/I/S · CONFORMIDAD (se escribe SI/NO).
 */
function analizarFicha(hoja) {
  var porFila = {};
  Object.keys(hoja.celdas).forEach(function (ref) {
    var p = partirRef_(ref);
    (porFila[p.f] = porFila[p.f] || []).push({ ref: ref, c: p.c, f: p.f, t: hoja.celdas[ref], n: normRotulo_(hoja.celdas[ref]) });
  });
  var filas = Object.keys(porFila).map(Number).sort(function (a, b) { return a - b; });
  var rango = function (c, f) {
    for (var i = 0; i < hoja.combinadas.length; i++) { var r = hoja.combinadas[i]; if (c >= r.c1 && c <= r.c2 && f >= r.f1 && f <= r.f2) return r; }
    return { c1: c, f1: f, c2: c, f2: f };
  };
  var primeraLinea = function (t) { return String(t).split('\n')[0].replace(/\s+/g, ' ').replace(/\s*:\s*$/, '').trim(); };
  var tieneSiNo = function (f) {
    var x = {}; (porFila[f] || []).forEach(function (k) { if (k.n === 'SI') x.si = 1; if (k.n === 'NO') x.no = 1; });
    return x.si && x.no;
  };

  // Tabla de control: la fila que trae las opciones de cada ítem
  var filaSiNo = 0, opciones = null, modo = 'marca', columnasValor = [];
  for (var q = 0; q < filas.length && !filaSiNo; q++) {
    var f0 = filas[q], x = {};
    porFila[f0].forEach(function (k) {
      if (k.n === 'SI') x.si = k.c;
      if (k.n === 'NO') x.no = k.c;
      if (k.n === 'N/A' || k.n === 'NA' || k.n === 'NO APLICA') x.na = k.c;
      if (k.n === 'CONFORME') x.cf = k.c;
      if (k.n === 'NO CONFORME') x.ncf = k.c;
      if (/^[NMIS]$/.test(k.n)) x['l' + k.n] = k.c;
      if (k.n === 'CONFORMIDAD') x.cdad = k.c;
    });
    var na = x.na ? [{ v: 'NA', e: 'N/A', d: '', col: x.na }] : [];
    if (x.si && x.no) opciones = [{ v: 'SI', e: 'SI', d: '', col: x.si }, { v: 'NO', e: 'NO', d: '', col: x.no }].concat(na);
    else if (x.cf && x.ncf) opciones = [{ v: 'SI', e: 'Conforme', d: '', col: x.cf }, { v: 'NO', e: 'No conforme', d: '', col: x.ncf }].concat(na);
    else if (x.lN && x.lM && x.lI && x.lS) {
      var ley = {};
      (porFila[filas[q - 1]] || []).concat(porFila[f0]).forEach(function (k) {
        var re = /\b([NMIS])\s*=\s*([^|\n]+)/g, mm;
        while ((mm = re.exec(k.t))) ley[mm[1]] = mm[2].trim();
      });
      opciones = ['N', 'M', 'I', 'S'].map(function (l) { return { v: l, e: l, d: ley[l] || '', col: x['l' + l] }; });
    } else if (x.cdad && !tieneSiNo(filas[q + 1])) {
      opciones = [{ v: 'SI', e: 'SI', d: '', col: x.cdad }, { v: 'NO', e: 'NO', d: '', col: x.cdad }];
      modo = 'texto';
    } else {
      // Tabla por columnas (p. ej. PTS-0018: "Apoyo 1 · Apoyo 2 · Apoyo 3 · Apoyo 4"): cada ítem se escribe en cada columna
      var serieCol = {};
      porFila[f0].forEach(function (k) { var mc = /^(.+?)\s*(\d+)$/.exec(k.n); if (mc && mc[1].length > 2) (serieCol[mc[1]] = serieCol[mc[1]] || []).push(k); });
      var grupoCol = Object.keys(serieCol).filter(function (s) { return serieCol[s].length >= 2; })[0];
      if (grupoCol) {
        columnasValor = serieCol[grupoCol].sort(function (a, b) { return a.c - b.c; }).map(function (k) { return { c: k.c, etiqueta: primeraLinea(k.t) }; });
        opciones = [];
        modo = 'columnas';
      }
    }
    if (opciones) filaSiNo = f0;
  }
  if (!filaSiNo) throw new Error('No se encontró la tabla de control (columnas SI / NO / N/A) en el formato.');
  var colsOpc = {};
  opciones.forEach(function (o) { colsOpc[o.col] = true; });
  columnasValor.forEach(function (o) { colsOpc[o.c] = true; });

  var cols = {}, etiquetas = {}, filaTitulos = filaSiNo;
  [filaSiNo - 1, filaSiNo].forEach(function (f) {
    (porFila[f] || []).forEach(function (k) {
      if (colsOpc[k.c]) return;
      var usado = true;
      if (/^REGISTROS/.test(k.n)) { cols.reg = k.c; etiquetas.reg = primeraLinea(k.t); }
      else if (/^NOTAS?$/.test(k.n)) { cols.reg = k.c; etiquetas.reg = primeraLinea(k.t); }
      else if (/^RESULTADO/.test(k.n)) { cols.res = k.c; etiquetas.res = primeraLinea(k.t); }
      else if (/^(OBSERVACION|COMENTARIO)/.test(k.n)) { cols.obs = k.c; etiquetas.obs = primeraLinea(k.t); }
      else if (/^(DESCRIPCION|CHECK ?LIST|ELEM[A-Z]* DE INSPECCION)/.test(k.n)) cols.desc = k.c;
      else if (k.n === 'PC' || k.n === 'PUNTO CONTROL') cols.pc = k.c;
      else if (k.n === 'GRUPO') cols.grupo = k.c;
      else if (k.n === 'N' || k.n === 'NRO' || k.n === 'ITEM') cols.n = k.c;
      else usado = false;
      if (usado && f < filaTitulos) filaTitulos = f;
    });
  });
  if (modo === 'columnas' && !cols.desc && cols.n) { cols.desc = cols.n; cols.n = 0; } // "Item" es el texto del ítem
  if (!cols.desc) {
    // Sin título "Descripción": la columna con más textos debajo de la cabecera
    var cuenta = {};
    filas.filter(function (f) { return f > filaSiNo && f <= filaSiNo + 40; }).forEach(function (f) {
      porFila[f].forEach(function (k) { if (!colsOpc[k.c] && k.c !== cols.n && k.n.length > 3) cuenta[k.c] = (cuenta[k.c] || 0) + 1; });
    });
    Object.keys(cuenta).map(Number).sort(function (a, b) { return a - b; }).forEach(function (c) { if (!cols.desc || cuenta[c] > cuenta[cols.desc]) cols.desc = c; });
  }
  if (!cols.desc) throw new Error('No se encontró la columna "Descripción" de la tabla de control.');

  // Encabezado: rótulo → celda de valor (la primera a la derecha del rótulo combinado)
  var campos = [], vistos = {}, extras = [], filaRotulo = 0;
  // Ancho disponible (caracteres) desde la celda c: ella (o su rango combinado) + celdas vacías sin combinar a su derecha
  var libreDesde = function (c, f) {
    if (!hoja.ancho) return 0;
    var r = rango(c, f), w = 0, x;
    for (x = r.c1; x <= r.c2; x++) w += hoja.ancho(x);
    if (r.c1 !== r.c2 || r.f1 !== r.f2) return Math.floor(w);
    for (x = r.c2 + 1; x <= r.c2 + 30 && !hoja.celdas[colLetras_(x) + f]; x++) {
      var rx = rango(x, f);
      if (rx.c1 !== rx.c2 || rx.f1 !== rx.f2) break;
      w += hoja.ancho(x);
    }
    return Math.floor(w);
  };
  var celdaVaciaDerecha = function (k, f) {
    var r = rango(k.c, f);
    if (r.c1 === r.c2) {
      for (var c = r.c2 + 1; c <= r.c2 + 4; c++) {
        var rc = rango(c, f);
        if (rc.c1 === c && rc.c2 > c && !hoja.celdas[colLetras_(c) + f]) return colLetras_(c) + f;
        if (hoja.celdas[colLetras_(c) + f]) break;
      }
      return '';
    }
    var nx = rango(r.c2 + 1, f);
    return nx.c1 === r.c2 + 1 && nx.c2 > nx.c1 && !hoja.celdas[colLetras_(r.c2 + 1) + f] ? colLetras_(r.c2 + 1) + f : '';
  };
  filas.filter(function (f) { return f < filaTitulos; }).forEach(function (f) {
    porFila[f].forEach(function (k) {
      var clave = ROTULOS_FICHA[k.n];
      if (!clave || vistos[clave] || !/:\s*$/.test(k.t)) return;
      vistos[clave] = true;
      if (!filaRotulo || f < filaRotulo) filaRotulo = f;
      var r = rango(k.c, f), destino = r.c2 + 1, suelto = 0, enRotulo = false;
      if (r.c1 === r.c2) {
        // Rótulo sin combinar: su texto se desborda a la derecha; el valor va en la siguiente celda combinada vacía (si está cerca)
        var hallado = false;
        for (var c = r.c2 + 1; c <= r.c2 + 4; c++) {
          var rc = rango(c, f);
          if (rc.c1 === c && rc.c2 > c && !hoja.celdas[colLetras_(c) + f]) { destino = c; hallado = true; break; }
          if (hoja.celdas[colLetras_(c) + f]) break;
        }
        if (!hallado && hoja.ancho) {
          // Sin celda propia (formatos antiguos): el valor va en la primera columna libre después de donde termina el texto del rótulo
          var necesita = k.t.length * 1.1 + 1, pos = hoja.ancho(k.c);
          for (c = k.c + 1; c <= k.c + 8 && pos < necesita && !hoja.celdas[colLetras_(c) + f]; c++) pos += hoja.ancho(c);
          while (hoja.ancho(c) === 0 && c <= k.c + 12) c++; // columnas ocultas: no se imprimen
          if (hoja.celdas[colLetras_(c) + f] || rango(c, f).c1 !== c) enRotulo = true; // sin celda libre: el valor va tras el rótulo
          else {
            destino = c;
            // espacio libre a la derecha (hasta el siguiente rótulo): si el valor no entra, se reduce
            for (c = destino; c <= destino + 8 && !hoja.celdas[colLetras_(c) + f] && rango(c, f).c1 === c; c++) suelto += hoja.ancho(c);
          }
        }
      }
      var campo = { clave: clave, etiqueta: k.t.replace(/\s*:\s*$/, ''), celda: enRotulo ? k.ref : colLetras_(destino) + f };
      if (enRotulo) campo.rotulo = { celda: k.ref, texto: k.t, libre: libreDesde(k.c, f), solo: true };
      else if (suelto) { campo.libre = Math.floor(suelto); campo.rotulo = { celda: k.ref, texto: k.t, libre: libreDesde(k.c, f) }; }
      campos.push(campo);
    });
  });
  // Datos propios del formato (p. ej. recepción de materiales): rótulo con ":" que no es del encabezado estándar
  filas.filter(function (f) { return filaRotulo && f >= filaRotulo && f < filaTitulos; }).forEach(function (f) {
    porFila[f].forEach(function (k) {
      if (ROTULOS_FICHA[k.n] || !/:\s*$/.test(k.t) || RE_FIRMAS_.test(k.n)) return;
      var clave = claveExtra_(k.t);
      if (vistos[clave]) return;
      vistos[clave] = true;
      var dest = celdaVaciaDerecha(k, f), r = rango(k.c, f), sig = colLetras_(r.c2 + 1) + f;
      if (dest) extras.push({ clave: clave, etiqueta: primeraLinea(k.t), celda: dest });
      else if (r.c1 !== r.c2 && !hoja.celdas[sig] && rango(r.c2 + 1, f).c1 === r.c2 + 1 && libreDesde(r.c2 + 1, f) >= 8) {
        // rótulo combinado con espacio libre a su derecha (líneas para escribir): el valor va ahí, en una línea
        extras.push({ clave: clave, etiqueta: primeraLinea(k.t), celda: sig, libre: libreDesde(r.c2 + 1, f), estiloDe: k.ref });
      } else extras.push({ clave: clave, etiqueta: primeraLinea(k.t), celda: k.ref, texto: k.t, libre: libreDesde(k.c, f) });
    });
  });

  // Título: el nombre del protocolo en la cabecera (no el rótulo genérico, el código, la revisión ni la fecha)
  var titulo = '';
  filas.filter(function (f) { return f < (filaRotulo || filaTitulos); }).some(function (f) {
    var k = porFila[f].slice().sort(function (a, b) { return a.c - b.c; }).filter(function (k) {
      return k.n.length > 3 && !/^(FICHA DE INSPECCION|FORMATO|PSR2-|REV|FECHA|PAG|PROYECTO|CODIGO|REVISION)/.test(k.n);
    })[0];
    if (k) titulo = k.t.replace(/\s+/g, ' ').trim();
    return !!k;
  });

  // Ítems hasta COMENTARIOS / OBSERVACIONES (o hasta el recuadro del reporte fotográfico)
  var items = [], filaFin = 0, filaFoto = 0, foto = null, seccion = '';
  filas.filter(function (f) { return f > filaSiNo; }).some(function (f) {
    var fin = porFila[f].some(function (k) { return /^(COMENTARIO|OBSERVACIONES)/.test(k.n) && k.c <= cols.desc; });
    if (fin) { filaFin = f; return true; }
    var kf = porFila[f].filter(function (k) { return /FOTOGRAF|^FOTOS?\b/.test(k.n); })[0];
    if (kf) {
      var rf = rango(kf.c, f), ra = rango(rf.c1, rf.f2 + 1);
      if (ra.f2 - ra.f1 >= 3 && ra.c2 - ra.c1 >= 3) {
        foto = { desde: colLetras_(ra.c1) + ra.f1, hasta: colLetras_(ra.c2) + ra.f2 };
        filaFoto = f;
        return true;
      }
    }
    var celda = function (c) { var k = porFila[f].filter(function (x) { return x.c === c; })[0]; return k ? k.t : ''; };
    var desc = celda(cols.desc);
    if (desc && modo === 'columnas' && desc === desc.toUpperCase() && /[A-Z]/.test(desc)) { seccion = desc.replace(/\s+/g, ' ').trim(); return false; } // título de sección
    if (desc) {
      var it = { fila: f, n: (cols.n && celda(cols.n)) || String(items.length + 1), grupo: cols.grupo ? celda(cols.grupo) : seccion,
        descripcion: desc, pc: cols.pc ? celda(cols.pc) : '' };
      // celdas del formato con "/" (dos valores: x / y)
      if (modo === 'columnas') it.barras = columnasValor.filter(function (o) { return /^\s*\/\s*$/.test(celda(o.c)); }).map(function (o) { return colLetras_(o.c); });
      items.push(it);
    }
    return false;
  });

  // Celdas que se llenan dentro de su texto ("A:", "Promedio = ____", "SÍ [ ] NO [ ]"): van con su ítem o al cierre
  var enCelda = [], tope = filaFin || filaFoto || Infinity;
  var filaItem = {};
  items.forEach(function (i) { filaItem[i.fila] = true; });
  var ultimo = items.length ? items[items.length - 1] : null;
  var finUltimo = ultimo ? rango(cols.desc, ultimo.fila).f2 : 0;
  filas.filter(function (f) { return f > filaSiNo && f < tope; }).forEach(function (f) {
    porFila[f].forEach(function (k) {
      if (filaItem[f] && (k.c === cols.n || k.c === cols.grupo || k.c === cols.pc)) return;
      if (filaItem[f] && k.c === cols.desc && !/_{3,}/.test(k.t)) return; // la descripción solo si trae líneas "____" para escribir
      if (!new RegExp(RE_HUECOS_.source).test(k.t) || RE_FIRMAS_.test(k.n)) return;
      var p = partesEnCelda(k.t);
      if (!p.huecos.length && !p.casillas.length) return;
      var duenio = '';
      items.forEach(function (i, ix) {
        var sig = items[ix + 1];
        if (f >= i.fila && (sig ? f < sig.fila : f <= finUltimo)) duenio = i.n;
      });
      enCelda.push({ celda: k.ref, fila: f, texto: k.t, item: duenio, etiqueta: p.etiqueta, huecos: p.huecos, casillas: p.casillas, libre: libreDesde(k.c, f) });
    });
  });

  // Comentarios: si el rótulo ocupa todo el ancho, se escribe en las filas de abajo; si no, a su derecha.
  var comentarios = [], comentarioRotulo = '';
  if (filaFin) {
    var lab = porFila[filaFin].filter(function (k) { return /^(COMENTARIO|OBSERVACIONES)/.test(k.n); })[0];
    var r = rango(lab.c, filaFin);
    if (r.c2 - r.c1 >= 3) {
      for (var f = r.f2 + 1; f <= r.f2 + 3; f++) {
        var rr = rango(lab.c, f);
        // fila combinada a lo ancho, o fila sin combinar y vacía (el texto se desborda a la derecha)
        if ((rr.c2 - rr.c1 >= 3 || (rr.c1 === rr.c2 && rr.f1 === rr.f2)) && !(porFila[f] || []).length) comentarios.push(colLetras_(rr.c1) + f); else break;
      }
    } else {
      // en la misma celda, a continuación del rótulo ("COMENTARIOS: …"); si la fila de abajo está libre, también ahí
      comentarios.push(lab.ref); comentarioRotulo = lab.t;
      var fa = r.f2 + 1, ra = rango(lab.c, fa);
      if (ra.c1 === ra.c2 && ra.f1 === ra.f2 && !(porFila[fa] || []).length && fa < (filaFoto || Infinity)) comentarios.push(colLetras_(lab.c) + fa);
    }
  }

  var L = function (c) { return c ? colLetras_(c) : ''; };
  var colDe = function (v) { var o = opciones.filter(function (x) { return x.v === v; })[0]; return o && modo === 'marca' ? L(o.col) : ''; };
  return {
    titulo: titulo, campos: campos, extras: extras, items: items, comentarios: comentarios, comentarioRotulo: comentarioRotulo, enCelda: enCelda, foto: foto,
    opciones: opciones.map(function (o) { return { v: o.v, e: o.e, d: o.d, col: L(o.col) }; }), modo: modo, etiquetas: etiquetas,
    valores: columnasValor.map(function (o) { return { col: L(o.c), etiqueta: o.etiqueta }; }),
    cols: { si: colDe('SI'), no: colDe('NO'), na: colDe('NA'), reg: L(cols.reg), res: L(cols.res), obs: L(cols.obs) },
  };
}

/**
 * Estilos de celda: clona el formato idx de styles.xml cambiando solo la alineación
 * (modo 'ajustar' = reducir hasta ajustar; 'centrar' = centrado). Devuelve { xml, idx }.
 */
function clonarEstilo(stylesXml, idx, modo) {
  var m = /<cellXfs count="(\d+)">([\s\S]*?)<\/cellXfs>/.exec(stylesXml);
  if (!m) return { xml: stylesXml, idx: idx };
  var xfs = m[2].match(/<xf\b[^>]*\/>|<xf\b[^>]*>[\s\S]*?<\/xf>/g) || [];
  var base = xfs[idx] || xfs[0];
  if (!base) return { xml: stylesXml, idx: idx };
  var abre = /^<xf\b[^>]*?(?=\/?>)/.exec(base)[0].replace(/\s+applyAlignment="\d"/, '') + ' applyAlignment="1"';
  var al = /<alignment\b([^>]*)\/>/.exec(base);
  var attrs = (al ? al[1] : '').replace(/\s+(wrapText|shrinkToFit)="\d"/g, '');
  if (modo === 'centrar') attrs = attrs.replace(/\s+horizontal="[^"]*"/, '') + ' horizontal="center"';
  else if (modo === 'linea') attrs = attrs.replace(/\s+horizontal="[^"]*"/, '') + ' horizontal="left"';
  else if (modo === 'envolver') attrs += ' wrapText="1"'; // texto en varias líneas (respeta los saltos del original)
  else attrs += ' shrinkToFit="1"';
  if (!/vertical=/.test(attrs)) attrs += ' vertical="center"';
  var resto = base.replace(/^<xf\b[^>]*?(\/>|>)/, '').replace(/<\/xf>$/, '').replace(/<alignment\b[^>]*\/>/, '');
  var nuevo = abre + '><alignment' + attrs + '/>' + resto + '</xf>';
  var n = +m[1];
  var sec = '<cellXfs count="' + (n + 1) + '">' + m[2] + nuevo + '</cellXfs>';
  return { xml: stylesXml.slice(0, m.index) + sec + stylesXml.slice(m.index + m[0].length), idx: n };
}

/**
 * Escribe texto en una celda de la hoja (conserva su estilo). Crea la celda si no existe.
 * estiloFn(idx) opcional: devuelve el índice de estilo a usar en lugar del original.
 */
function escribirCelda(xml, ref, texto, estiloFn) {
  var nueva = function (s) {
    var idx = s === null ? 0 : s;
    if (estiloFn) idx = estiloFn(idx);
    return '<c r="' + ref + '"' + (idx || s !== null ? ' s="' + idx + '"' : '') + ' t="inlineStr"><is><t xml:space="preserve">' + escXml_(texto) + '</t></is></c>';
  };
  var re = new RegExp('<c r="' + ref + '"([^>]*?)(?:/>|>[\\s\\S]*?</c>)');
  var m = re.exec(xml);
  if (m) {
    var s = /\ss="(\d+)"/.exec(m[1]);
    return xml.slice(0, m.index) + nueva(s ? +s[1] : null) + xml.slice(m.index + m[0].length);
  }
  var p = partirRef_(ref);
  var rf = new RegExp('<row r="' + p.f + '"[^>]*?(?:/>|>([\\s\\S]*?)</row>)');
  var mr = rf.exec(xml);
  if (!mr) throw new Error('La fila ' + p.f + ' no existe en la hoja.');
  if (/\/>$/.test(mr[0])) {
    return xml.slice(0, mr.index) + mr[0].replace(/\/>$/, '>' + nueva(null) + '</row>') + xml.slice(mr.index + mr[0].length);
  }
  var cuerpo = mr[1], pos = cuerpo.length, rc = /<c r="([A-Z]+)\d+"/g, mc;
  while ((mc = rc.exec(cuerpo))) { if (colNum_(mc[1]) > p.c) { pos = mc.index; break; } }
  var inicio = mr.index + mr[0].indexOf('>') + 1;
  return xml.slice(0, inicio + pos) + nueva(null) + xml.slice(inicio + pos);
}

/** true si el texto entra en `libre` caracteres de ancho de columna (letra de formato ~8-9 pt). */
function entraEn(texto, libre) { return !!libre && String(texto).length * 0.9 <= libre; }

/** Corta un texto largo en hasta `cuantas` líneas de ~max caracteres (por palabras; la última acumula el resto). */
function partirLineas(texto, max, cuantas) {
  var palabras = String(texto || '').replace(/\s+/g, ' ').trim().split(' '), lineas = [''];
  palabras.forEach(function (w) {
    var i = lineas.length - 1;
    if (lineas[i] && (lineas[i] + ' ' + w).length > max && lineas.length < cuantas) lineas.push(w);
    else lineas[i] = lineas[i] ? lineas[i] + ' ' + w : w;
  });
  return lineas.filter(function (l) { return l; });
}

/**
 * Correlativo CPC: [ACRÓNIMO]-[ELEMENTO opcional]-[FASE]-#### (4 dígitos). Reparación = mismo N° + "A".
 * usados: correlativos CPC existentes. Devuelve el siguiente libre.
 */
function siguienteCPC(prefijo, usados, reparacionDe) {
  if (reparacionDe) {
    var n = parseInt(reparacionDe, 10);
    if (!(n > 0)) throw new Error('Número a reparar inválido.');
    var cod = prefijo + '-' + ('000' + n).slice(-4) + 'A';
    if (usados.indexOf(cod) >= 0) throw new Error('El correlativo CPC ' + cod + ' ya existe.');
    return cod;
  }
  var re = new RegExp('^' + prefijo.replace(/-/g, '\\-') + '-(\\d{1,4})A?$');
  var max = 0;
  usados.forEach(function (u) { var m = re.exec(String(u)); if (m && +m[1] > max) max = +m[1]; });
  return prefijo + '-' + ('000' + (max + 1)).slice(-4);
}

/**
 * Valorización automática: del día de inicio (26) al día anterior del mes siguiente (25) pertenece al mes siguiente.
 * Ej.: 26/10/2026 … 25/11/2026 → '2026-11'. Acepta 'dd/mm/aaaa' o ISO 'aaaa-mm-dd…'. Devuelve 'aaaa-mm' o ''.
 */
function periodoValorizacion(fecha, diaInicio) {
  var s = String(fecha || ''), a, m, d, x;
  if ((x = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(s))) { d = +x[1]; m = +x[2]; a = +x[3]; }
  else if ((x = /^(\d{4})-(\d{2})-(\d{2})/.exec(s))) { a = +x[1]; m = +x[2]; d = +x[3]; }
  else return '';
  if (d >= (+diaInicio || 26)) { m++; if (m > 12) { m = 1; a++; } }
  return a + '-' + (m < 10 ? '0' : '') + m;
}

if (typeof module !== 'undefined') {
  module.exports = { periodoValorizacion: periodoValorizacion, calcularIntegridad: calcularIntegridad, validarImportacion: validarImportacion,
    reemplazarMarcadoresXml: reemplazarMarcadoresXml, progresiva: progresiva, leerCadenas: leerCadenas, leerHoja: leerHoja,
    analizarFicha: analizarFicha, partesEnCelda: partesEnCelda, rellenarEnCelda: rellenarEnCelda, entraEn: entraEn, escribirCelda: escribirCelda, partirLineas: partirLineas, siguienteCPC: siguienteCPC, clonarEstilo: clonarEstilo };
}
