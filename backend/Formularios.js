/**
 * Protocolos como formulario: el usuario llena la ficha en la app (encabezado, lista de control, comentarios)
 * y descarga el MISMO Excel aprobado ya lleno. Las firmas quedan a mano.
 *
 * La estructura de cada ficha se detecta del propio xlsx (Logica.js → analizarFicha), así que cada formato nuevo
 * funciona sin configurarlo, mientras respete el diseño estándar de "FICHA DE INSPECCIÓN".
 */

/** Campos del encabezado que escribe el usuario (el resto los pone la app). */
var CLAVES_FORM = ['fase', 'cliente', 'partida', 'descripcion', 'especialidad', 'ubicacion', 'localizacion', 'pk_inicial', 'pk_final',
  'capa', 'documentos', 'protocolo_topo'];

/** Correlativos CPC ya usados en el proyecto (para elegir el original de una reparación). */
function codigosCPC_(ctx) {
  exigir_(ctx, 'generar');
  return cpcUsados_(ctx.proyecto, leer_(SH.REGISTROS)).sort();
}

/** CPC ya usados: los de los códigos y los del LOG (filas sin correlativo ingeniero incluidas), sin repetir. */
function cpcUsados_(proyecto, regs) {
  var u = {};
  regs.forEach(function (r) { if (r.Proyecto === proyecto && r.Correlativo_CPC) u[r.Correlativo_CPC] = true; });
  leer_(SH.LOG).forEach(function (l) { if (l.Proyecto === proyecto && l.CPC) u[l.CPC] = true; });
  return Object.keys(u);
}

/** Códigos de Topografía del proyecto (para vincular el protocolo topográfico del LOG; no se imprime en el FOR). */
function codigosTopografia_(ctx) {
  exigir_(ctx, 'generar');
  var topo = {};
  leer_(SH.SERIES).forEach(function (s) { if (s.Proyecto === ctx.proyecto && (s.Area || 'Calidad') === 'Topografía') topo[s.Codigo_Serie] = true; });
  return leer_(SH.REGISTROS).filter(function (r) { return r.Proyecto === ctx.proyecto && topo[r.Serie]; })
    .map(function (r) { return r.Codigo_Completo; }).sort();
}
var MARCA_CHECK = '✓';

function cache_() { try { return CacheService.getScriptCache(); } catch (e) { return null; } }

/** Abre el xlsx y ubica la hoja de la ficha. Devuelve { partes, indice, cadenas, estructura }. */
function abrirFicha_(blob) {
  var partes = Utilities.unzip(blob.setContentType('application/zip'));
  var cadenas = [];
  var hojas = [];
  partes.forEach(function (p, i) {
    var n = p.getName();
    if (n === 'xl/sharedStrings.xml') cadenas = leerCadenas(p.getDataAsString('UTF-8'));
    var m = /^xl\/worksheets\/sheet(\d+)\.xml$/.exec(n);
    if (m) hojas.push({ i: i, n: +m[1] });
  });
  hojas.sort(function (a, b) { return b.n - a.n; }); // la ficha suele ser la última hoja (las PPIE van antes)
  var ocultas = hojasOcultas_(partes); // copias ocultas (p. ej. "FI (2)") no son la ficha
  hojas = hojas.filter(function (h) { return !ocultas[partes[h.i].getName()]; });
  for (var k = 0; k < hojas.length; k++) {
    try {
      var xmlHoja = partes[hojas[k].i].getDataAsString('UTF-8');
      var est = analizarFicha(leerHoja(xmlHoja, cadenas));
      return { partes: partes, indice: hojas[k].i, estructura: est, posicion: posicionHoja_(partes, partes[hojas[k].i].getName()),
        horizontal: /<pageSetup[^>]*orientation="landscape"/.test(xmlHoja) };
    } catch (e) { /* no es la ficha; sigue */ }
  }
  return { partes: partes, indice: -1, estructura: null };
}

/** Rutas (xl/worksheets/sheetN.xml) de las hojas ocultas del libro. */
function hojasOcultas_(partes) {
  var wb = '', rels = '', out = {};
  partes.forEach(function (p) {
    if (p.getName() === 'xl/workbook.xml') wb = p.getDataAsString('UTF-8');
    if (p.getName() === 'xl/_rels/workbook.xml.rels') rels = p.getDataAsString('UTF-8');
  });
  (wb.match(/<sheet\b[^>]*>/g) || []).forEach(function (s) {
    if (!/state="(hidden|veryHidden)"/.test(s)) return;
    var id = /r:id="([^"]+)"/.exec(s);
    var rel = id && new RegExp('<Relationship\\b[^>]*Id="' + id[1] + '"[^>]*>').exec(rels);
    var t = rel && /Target="([^"]+)"/.exec(rel[0]);
    if (t) out['xl/' + t[1].replace(/^\/?xl\//, '')] = true;
  });
  return out;
}

/** Posición (0..n) de una hoja dentro del libro, según el orden de workbook.xml. */
function posicionHoja_(partes, ruta) {
  var wb = '', rels = '';
  partes.forEach(function (p) {
    if (p.getName() === 'xl/workbook.xml') wb = p.getDataAsString('UTF-8');
    if (p.getName() === 'xl/_rels/workbook.xml.rels') rels = p.getDataAsString('UTF-8');
  });
  var objetivo = ruta.replace(/^xl\//, '');
  var ids = [], re = /<sheet\b[^>]*?r:id="([^"]+)"/g, m;
  while ((m = re.exec(wb))) ids.push(m[1]);
  for (var i = 0; i < ids.length; i++) {
    var rel = new RegExp('<Relationship\\b[^>]*Id="' + ids[i] + '"[^>]*>').exec(rels);
    var t = rel && /Target="([^"]+)"/.exec(rel[0]);
    if (t && t[1].replace(/^\/?xl\//, '') === objetivo) return i;
  }
  return 0;
}

function estructuraDe_(formato) {
  if (formato.Plantilla_Tipo !== 'xlsx') return null;
  var c = cache_(), clave = 'ficha4_' + formato.Plantilla_ID;
  var g = c && c.get(clave);
  if (g) return JSON.parse(g);
  var est = abrirFicha_(DriveApp.getFileById(formato.Plantilla_ID).getBlob()).estructura;
  if (c && est) c.put(clave, JSON.stringify(est), 21600);
  return est;
}

/** Estructura del formulario de un formato (para pintarlo en la app). */
function estructuraFormulario_(ctx, d) {
  var formato = formatoDe_(ctx, txt_(d.formato).toUpperCase());
  var est = estructuraDe_(formato);
  if (!est) throw err_('El formato ' + formato.Codigo_Formato + ' no tiene formulario: debe ser una ficha de inspección en Excel.', 'NEGOCIO');
  var opciones = opcionesDe_(est);
  return {
    formato: { Codigo_Formato: formato.Codigo_Formato, Nombre: formato.Nombre || est.titulo || '' },
    campos: est.campos.map(function (c) { return c.clave; }),
    extras: (est.extras || []).map(function (x) { return { clave: x.clave, etiqueta: x.etiqueta }; }),
    items: est.items.map(function (i) { return { n: i.n, grupo: i.grupo, descripcion: i.descripcion, pc: i.pc, barras: i.barras || [] }; }),
    modo: est.modo || 'marca',
    valores: est.valores || [],
    opciones: opciones.map(function (o) { return { v: o.v, e: o.e, d: o.d || '' }; }),
    columnas: { na: opciones.some(function (o) { return o.v === 'NA'; }), reg: !!est.cols.reg, res: !!est.cols.res, obs: !!est.cols.obs },
    etiquetas: est.etiquetas || {},
    enCelda: (est.enCelda || []).map(function (c) { return { celda: c.celda, fila: c.fila, item: c.item, etiqueta: c.etiqueta, huecos: c.huecos, casillas: c.casillas }; }),
    foto: !!est.foto,
    comentarios: est.comentarios.length > 0,
  };
}

/** Opciones por ítem (estructuras antiguas en caché no las traen: SI / NO / N/A). */
function opcionesDe_(est) {
  if (est.modo === 'columnas') return [];
  if (est.opciones && est.opciones.length) return est.opciones;
  return [{ v: 'SI', e: 'SI', col: est.cols.si }, { v: 'NO', e: 'NO', col: est.cols.no }]
    .concat(est.cols.na ? [{ v: 'NA', e: 'N/A', col: est.cols.na }] : []);
}

function hoyDmy_() { var f = iso_().substring(0, 10).split('-'); return f[2] + '/' + f[1] + '/' + f[0]; }

/**
 * Guarda lo llenado. d: { codigo, formato, datos: { campos, items: { n: {v, reg, res, obs} }, comentarios },
 *   cpc: { acronimo, elemento } | { reparaDe: 'CPC original' }, conforme: true|false }.  El CPC se asigna una sola vez (atómico).
 */
function guardarFormulario_(ctx, d) {
  var codFormato = txt_(d.formato).toUpperCase();
  return conLock_(function () {
    var regs = leer_(SH.REGISTROS);
    var reg = buscarRegistro_(regs, d.codigo, ctx.proyecto);
    exigirDuenoOAdmin_(ctx, reg);
    if (reg.Estado !== ESTADO.ACTIVO) throw err_('El código está liberado: queda para quien genere en su serie. Genera un código para tomarlo.', 'NEGOCIO');
    if (reg.Estado_Doc === DOC.VALIDADO && !puede_(ctx, 'administrar')) {
      throw err_('El protocolo ya fue validado. Solo un administrador puede modificarlo.', 'NEGOCIO');
    }
    var formato = formatoDe_(ctx, codFormato);
    if (!esTrue_(formato.Activo)) throw err_('El formato ' + codFormato + ' está inactivo.', 'NEGOCIO');
    var est = estructuraDe_(formato);
    if (!est) throw err_('El formato ' + codFormato + ' no tiene formulario.', 'NEGOCIO');
    var serie = serieDe_(ctx, reg.Serie);

    var previo = {};
    try { previo = reg.Datos_Formulario ? JSON.parse(reg.Datos_Formulario) : {}; } catch (e) { previo = {}; }
    var datos = d.datos || {};
    var campos = {};
    var claves = CLAVES_FORM.concat((est.extras || []).map(function (x) { return x.clave; }));
    claves.forEach(function (k) { if (datos.campos && datos.campos[k] !== undefined) campos[k] = txt_(datos.campos[k]).substring(0, 300); });
    var items = {};
    var validos = {};
    est.items.forEach(function (i) { validos[i.n] = true; });
    var permitidas = opcionesDe_(est).map(function (o) { return o.v; });
    Object.keys(datos.items || {}).forEach(function (n) {
      if (!validos[n]) return;
      var x = datos.items[n] || {};
      var v = txt_(x.v).toUpperCase();
      items[n] = { v: permitidas.indexOf(v) >= 0 ? v : '', reg: txt_(x.reg).substring(0, 200), res: txt_(x.res).substring(0, 200), obs: txt_(x.obs).substring(0, 200) };
      if (est.modo === 'columnas') { // un valor por columna del formato (Apoyo 1…4)
        var cv = {};
        (est.valores || []).forEach(function (o) { var t = txt_((x.c || {})[o.col]).substring(0, 100); if (t) cv[o.col] = t; });
        items[n].c = cv;
      }
    });
    // Celdas que se llenan dentro de su texto (medidas A-B-C-D, conclusiones, casillas SÍ [ ] NO [ ])
    var celdas = {};
    (est.enCelda || []).forEach(function (c) {
      var x = (datos.celdas || {})[c.celda];
      if (!x) return;
      var h = (x.h || []).slice(0, c.huecos.length).map(function (t) { return txt_(t).substring(0, 150); });
      var xi = x.x === '' || x.x === undefined || x.x === null ? '' : String(+x.x);
      if (xi !== '' && !(+xi >= 0 && +xi < c.casillas.length)) xi = '';
      if (h.some(function (t) { return t; }) || xi !== '') celdas[c.celda] = { h: h, x: xi };
    });

    // Protocolo topográfico (solo LOG): si no existe en la app NO impide guardar; se guarda el resto y se avisa.
    var aviso = '';
    if (campos.protocolo_topo !== undefined) {
      var pt = campos.protocolo_topo.toUpperCase();
      if (pt && pt !== 'NA' && codigosTopografia_(ctx).indexOf(pt) < 0) {
        aviso = 'El protocolo topográfico ' + pt + ' no existe en la app: se guardó el registro sin ese dato (cárgalo por DATA y vuelve a elegirlo).';
        pt = (previo.campos && previo.campos.protocolo_topo) || '';
      }
      campos.protocolo_topo = pt;
    }

    // Fase: elegible (por defecto la de la serie, F2); debe existir en el catálogo de fases
    if (campos.fase !== undefined) {
      campos.fase = campos.fase.toUpperCase();
      if (campos.fase && !catalogo_(ctx.proyecto, 'Fase').some(function (x) { return x.Codigo === campos.fase; }))
        throw err_('La fase ' + campos.fase + ' no existe en el catálogo.', 'VALIDACION');
    }
    var faseProto = campos.fase || (previo.campos && previo.campos.fase) || serie.Fase;

    // Fecha del protocolo: la pone la app en el primer guardado; solo quien creó el código o un administrador la cambia.
    var fecha = previo.fecha || hoyDmy_();
    if (datos.fecha && txt_(datos.fecha) !== fecha) {
      if (!(esDueno_(ctx, reg) || puede_(ctx, 'administrar'))) throw err_('Solo quien creó el código o un administrador cambia la fecha.', 'PERMISO');
      if (!/^\d{2}\/\d{2}\/\d{4}$/.test(txt_(datos.fecha))) throw err_('Fecha inválida (dd/mm/aaaa).', 'VALIDACION');
      fecha = txt_(datos.fecha);
    }

    // Valorización: automática según la fecha del protocolo (26→25 = mes siguiente), salvo que el usuario la edite.
    var di = ctx.config.Dia_Inicio_Ciclo;
    var autoAntes = periodoValorizacion(previo.fecha || reg.Fecha_Creacion, di);
    if (datos.valorizacion !== undefined && txt_(datos.valorizacion) !== txt_(reg.Valorizacion)) {
      if (!/^\d{4}-\d{2}$/.test(txt_(datos.valorizacion))) throw err_('Valorización inválida (aaaa-mm).', 'VALIDACION');
      reg.Valorizacion = txt_(datos.valorizacion);
    } else if (!reg.Valorizacion || reg.Valorizacion === autoAntes) {
      reg.Valorizacion = periodoValorizacion(fecha, di);
    }

    // Correlativo CPC (una sola vez): [ACRÓNIMO]-[ACRÓNIMO opcional]-[FASE]-####.
    // Reparación: se elige el CPC original y se repite con sufijo A (conserva sus acrónimos y número).
    var nuevoCPC = '';
    var usados = cpcUsados_(ctx.proyecto, regs);
    if (!reg.Correlativo_CPC && d.cpc && txt_(d.cpc.reparaDe)) {
      var orig = txt_(d.cpc.reparaDe).toUpperCase();
      if (usados.indexOf(orig) < 0) throw err_('El correlativo CPC ' + orig + ' no existe; elige el original de la lista.', 'VALIDACION');
      if (/A$/.test(orig)) throw err_('Elige el correlativo original (sin la A de reparación).', 'VALIDACION');
      if (usados.indexOf(orig + 'A') >= 0) throw err_('La reparación ' + orig + 'A ya existe.', 'VALIDACION');
      nuevoCPC = orig + 'A';
    } else if (!reg.Correlativo_CPC && d.cpc && txt_(d.cpc.acronimo)) {
      var acr = catalogo_(ctx.proyecto, 'Acronimo');
      var existe = function (c) { return acr.some(function (a) { return a.Codigo === c && esTrue_(a.Activo); }); };
      var a1 = txt_(d.cpc.acronimo).toUpperCase(), a2 = txt_(d.cpc.elemento).toUpperCase();
      if (!existe(a1)) throw err_('El acrónimo ' + a1 + ' no está en la lista de acrónimos CPC.', 'VALIDACION');
      if (a2 && !existe(a2)) throw err_('El segundo acrónimo ' + a2 + ' no está en la lista.', 'VALIDACION');
      var prefijo = [a1].concat(a2 ? [a2] : []).concat([faseProto]).join('-');
      nuevoCPC = siguienteCPC(prefijo, usados);
    }
    if (nuevoCPC) reg.Correlativo_CPC = nuevoCPC;

    // Conforme: al cerrar, el usuario confirma que revisó y llenó el protocolo (queda quién y cuándo).
    var conforme = d.conforme ? { por: ctx.usuario.Correo, fecha: iso_() } : (previo.conforme || null);

    reg.Formato = codFormato;
    reg.Datos_Formulario = JSON.stringify({
      campos: campos, items: items, celdas: celdas, comentarios: txt_(datos.comentarios).substring(0, 1500),
      fecha: fecha, guardado: iso_(), por: ctx.usuario.Correo, conforme: conforme,
    });
    // Sincroniza los datos principales del código (lista, búsquedas, DATA, LOG)
    if (campos.partida !== undefined) reg.Actividad = campos.partida;
    if (campos.ubicacion !== undefined) reg.Ubicacion = campos.ubicacion;
    if (campos.pk_inicial !== undefined) reg.PK_Inicial = campos.pk_inicial;
    if (campos.pk_final !== undefined) reg.PK_Final = campos.pk_final;
    if (campos.protocolo_topo !== undefined) reg.Protocolo_Topografico = campos.protocolo_topo;
    reg.Modificado_Por = ctx.usuario.Correo;
    reg.Fecha_Modificacion = iso_();
    actualizar_(SH.REGISTROS, reg);
    if (conforme) sincronizarLog_(ctx, reg, serie, JSON.parse(reg.Datos_Formulario)); // su fila del LOG
    var marcados = Object.keys(items).filter(function (n) { return items[n].v || (items[n].c && Object.keys(items[n].c).length); }).length;
    registrarHist_(hist_(ctx, 'Protocolo llenado', reg, codFormato + ' · ' + marcados + '/' + est.items.length + ' ítems' +
      (nuevoCPC ? ' · CPC ' + nuevoCPC : '') + (d.conforme ? ' · CONFORME' : ' · avance')));
    var out = publico_(reg);
    if (aviso) out.Aviso = aviso;
    return out;
  });
}

/** Valores del encabezado de la ficha para un código. */
function valoresFicha_(ctx, reg, serie) {
  var datos = {};
  try { datos = reg.Datos_Formulario ? JSON.parse(reg.Datos_Formulario) : {}; } catch (e) { datos = {}; }
  var c = datos.campos || {};
  var disc = catalogo_(ctx.proyecto, 'Disciplina').filter(function (x) { return x.Codigo === serie.Especialidad; })[0];
  var f = (reg.Fecha_Creacion || iso_()).substring(0, 10).split('-');
  var extras = {};
  Object.keys(c).forEach(function (k) { if (/^x_/.test(k)) extras[k] = c[k]; });
  return {
    datos: datos,
    extras: extras,
    valores: {
      cliente: c.cliente || ctx.config.Cliente || '',
      fase: c.fase || serie.Fase,
      partida: c.partida || reg.Actividad || '',
      descripcion: c.descripcion || '',
      especialidad: c.especialidad || (disc ? disc.Descripcion : ''),
      ubicacion: c.ubicacion || reg.Ubicacion || '',
      localizacion: c.localizacion || '',
      progresiva: progresiva(c.pk_inicial !== undefined ? c.pk_inicial : reg.PK_Inicial, c.pk_final !== undefined ? c.pk_final : reg.PK_Final),
      fecha: datos.fecha || (f.length === 3 ? f[2] + '/' + f[1] + '/' + f[0] : ''),
      codigo: reg.Codigo_Completo,
      capa: c.capa || '',
      cpc: reg.Correlativo_CPC || '',
      documentos: c.documentos || '',
    },
  };
}

/**
 * Formatos de celda derivados (styles.xml): 'ajustar' reduce el texto para que entre en la celda;
 * 'centrar' centra el check. Se crean una sola vez por estilo original.
 */
function estilosFicha_(stylesXml) {
  var o = { xml: stylesXml, cache: {} };
  o.fn = function (modo) {
    if (!o.xml) return null;
    return function (idx) {
      var k = modo + '|' + idx;
      if (o.cache[k] === undefined) { var r = clonarEstilo(o.xml, idx, modo); o.xml = r.xml; o.cache[k] = r.idx; }
      return o.cache[k];
    };
  };
  return o;
}

/** Escribe encabezado, checks, registros/resultados y comentarios en la hoja de la ficha. */
function escribirFicha_(xml, est, valores, datos, estilos, extras) {
  var ajustar = estilos ? estilos.fn('ajustar') : null;
  var centrar = estilos ? estilos.fn('centrar') : null;
  var linea = estilos ? estilos.fn('linea') : null;
  var envolver = estilos ? estilos.fn('envolver') : null;
  est.campos.forEach(function (c) {
    var v = valores[c.clave];
    if (!v) return;
    var junto = c.rotulo ? c.rotulo.texto.replace(/\s*$/, '') + ' ' + v : '';
    // Sin celda libre para el valor (p. ej. el rótulo llega hasta el siguiente): se escribe a continuación del rótulo
    if (c.rotulo && c.rotulo.solo) { xml = escribirCelda(xml, c.rotulo.celda, junto, entraEn(junto, c.rotulo.libre) ? linea : ajustar); return; }
    if (!c.libre) { xml = escribirCelda(xml, c.celda, v, ajustar); return; }
    // Celda suelta (formatos antiguos): el valor va en una línea y se desborda a la derecha. Si no entra,
    // se escribe a continuación del rótulo ("CORRELATIVO N°: …"); solo como último recurso se reduce la letra.
    if (entraEn(v, c.libre)) xml = escribirCelda(xml, c.celda, v, linea);
    else if (junto && entraEn(junto, c.rotulo.libre)) xml = escribirCelda(xml, c.rotulo.celda, junto, linea);
    else xml = escribirCelda(xml, c.celda, v, ajustar);
  });
  (est.extras || []).forEach(function (c) {
    var v = (extras || {})[c.clave];
    if (!v) return;
    // Si el rótulo no tiene casilla propia, el dato va a continuación del rótulo en la misma celda
    var t = c.texto ? c.texto.replace(/\s*$/, '') + ' ' + v : v;
    var fn = c.libre && entraEn(t, c.libre) ? linea : ajustar;
    // valor en la línea libre junto al rótulo: con la misma letra que el rótulo (esas celdas suelen tener letra mínima)
    var sr = c.estiloDe && new RegExp('<c r="' + c.estiloDe + '"[^>]*?\\ss="(\\d+)"').exec(xml);
    if (sr && fn) { var base = +sr[1], f0 = fn; fn = function () { return f0(base); }; }
    xml = escribirCelda(xml, c.celda, t, fn);
  });
  var opciones = opcionesDe_(est);
  var items = datos.items || {};
  est.items.forEach(function (i) {
    var x = items[i.n];
    if (!x) return;
    var o = opciones.filter(function (k) { return k.v === x.v; })[0];
    // modo 'texto' (columna única CONFORMIDAD): se escribe SI / NO; si no, se marca el check en la columna de la opción
    if (o && o.col) xml = escribirCelda(xml, o.col + i.fila, est.modo === 'texto' ? o.e : MARCA_CHECK, centrar);
    if (est.modo === 'columnas') (est.valores || []).forEach(function (c) { if (x.c && x.c[c.col]) xml = escribirCelda(xml, c.col + i.fila, x.c[c.col], centrar); });
    if (x.reg && est.cols.reg) xml = escribirCelda(xml, est.cols.reg + i.fila, x.reg, ajustar);
    if (x.res && est.cols.res) xml = escribirCelda(xml, est.cols.res + i.fila, x.res, ajustar);
    if (x.obs && est.cols.obs) xml = escribirCelda(xml, est.cols.obs + i.fila, x.obs, ajustar);
  });
  (est.enCelda || []).forEach(function (c) {
    var val = (datos.celdas || {})[c.celda];
    if (!val) return;
    var t = rellenarEnCelda(c.texto, val);
    xml = escribirCelda(xml, c.celda, t, /\n/.test(t) ? envolver : entraEn(t, c.libre) ? linea : ajustar);
  });
  if (datos.comentarios && est.comentarios.length) {
    var lineas = partirLineas(datos.comentarios, 140, est.comentarios.length);
    if (est.comentarioRotulo) lineas[0] = est.comentarioRotulo.replace(/\s*$/, ' ') + lineas[0]; // va tras el rótulo, en su celda
    lineas.forEach(function (l, k) { xml = escribirCelda(xml, est.comentarios[k], l); });
  }
  return xml;
}
