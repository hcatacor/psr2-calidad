/**
 * LOG de registros de liberación de Calidad (Excel "LOG", columnas A–AC).
 *
 * Carga inicial: se sube el MISMO Excel del LOG; cada fila entra tal cual (para imprimir igual a como se llenó).
 *  - Correlativo ingeniero válido y nuevo → se crea el código como Histórico (bloquea su número) y el contador sube.
 *  - Correlativo CPC: el sistema guarda el corregido (acrónimo con error de tipeo, fase G2, 3 dígitos → 4) para que la
 *    numeración no choque; el original queda en CPC_Original y es el que se imprime.
 *  - Toda fila con un problema queda OBSERVADA con su motivo (sin correlativo, repetido, salto grande, corregido…).
 *    La revisa su dueño (columna QC) o Control Documentario.
 * Descarga: el mismo Excel con las filas del LOG (iniciales tal cual + las nuevas de la app).
 * ESTATUS, TRANSMITAL y FECHA ENVÍO ACONEX solo los cambia Control Documentario o superiores.
 */

/** Columna del Excel → campo de la hoja Log. */
var COLS_LOG = {
  A: 'N', B: 'Codigo_Completo', C: 'Rev', D: 'CPC_Original', E: 'Descripcion', F: 'Componente', G: 'Especialidad', H: 'Fase',
  I: 'Tramo', J: 'Cliente', K: 'Partida', L: 'Localizacion', M: 'Ubicacion', N: 'PK_Inicial', O: 'PK_Final', P: 'Fecha', Q: 'Capa',
  R: 'Protocolo_Topografico', S: 'Anexos', T: 'Planos', U: 'Valorizacion', V: 'Estatus', W: 'Observacion', X: 'Transmital',
  Y: 'Fecha_Aconex', Z: 'QC', AB: 'Prefijo_Titulo', AC: 'Titulo_Aconex',
};
var FECHAS_LOG = { P: true, U: true, Y: true };
/** Solo Control Documentario o superiores. */
var CAMPOS_LOG_CONTROL = ['Estatus', 'Transmital', 'Fecha_Aconex'];
/** Los corrige el dueño del código (o Control Documentario). */
var CAMPOS_LOG_DUENO = ['Rev', 'Descripcion', 'Especialidad', 'Tramo', 'Partida', 'Localizacion', 'Ubicacion', 'PK_Inicial', 'PK_Final',
  'Fecha', 'Capa', 'Protocolo_Topografico', 'Anexos', 'Planos', 'Valorizacion', 'Observacion'];
/** Un salto mayor a esto (correlativos que faltan seguidos) se observa. */
var SALTO_MAX_LOG = 10;
/** Errores de tipeo ya analizados en el LOG (hoja ANÁLISIS): acrónimo → correcto. */
var CORRIGE_ACRONIMO = { GNTI: 'GNT1', ENT1: 'GNT1', CPRE: 'CPREM', COM: 'CON', CONT: 'MCONT' };

// ---------------------------------------------------------------- Lógica pura (se prueba sin Google)

/** Excel guarda las fechas como número de días desde 30/12/1899. */
function fechaSerialADmy(v) {
  var s = String(v || '').trim();
  if (!/^\d{4,6}(\.\d+)?$/.test(s)) return s;
  var d = new Date(Date.UTC(1899, 11, 30) + Math.floor(+s) * 86400000);
  return ('0' + d.getUTCDate()).slice(-2) + '/' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '/' + d.getUTCFullYear();
}
function dmyASerial(s) {
  var m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(s || '').trim());
  if (!m) return null;
  return Math.round((Date.UTC(+m[3], +m[2] - 1, +m[1]) - Date.UTC(1899, 11, 30)) / 86400000);
}

/** Corrige un correlativo CPC: solo acrónimos con error de tipeo ya analizado y fase G2 → F2. El número NO se cambia. */
function corregirCPC(cpc) {
  var t = String(cpc || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!t) return { cpc: '', cambios: [] };
  var m = /^(.+)-(\d{1,4})(A?)$/.exec(t);
  if (!m) return { cpc: t, cambios: [], invalido: true };
  var partes = m[1].split('-'), cambios = [];
  var fase = partes[partes.length - 1];
  if (/^G\d$/.test(fase)) { partes[partes.length - 1] = 'F' + fase.substring(1); cambios.push('fase ' + fase + '→F' + fase.substring(1)); }
  for (var i = 0; i < partes.length - 1; i++) {
    var c = CORRIGE_ACRONIMO[partes[i]];
    if (c && !(i === 0 && partes[i] === 'CONT')) { cambios.push(partes[i] + '→' + c); partes[i] = c; }
  }
  var pref = partes.join('-');
  return { cpc: pref + '-' + m[2] + m[3], cambios: cambios, prefijo: pref, n: +m[2], digitos: m[2].length, rep: !!m[3], acronimos: partes.slice(0, -1) };
}

function normNombre_(t) {
  return String(t || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z ]/g, ' ').split(/\s+/).filter(function (x) { return x; });
}
/** Usuario del proyecto cuyo nombre contiene todas las palabras del nombre en QC ("JENNY SANCHEZ" → Jenny Sánchez Vásquez). */
function duenoPorNombre(qc, usuarios) {
  var q = normNombre_(qc);
  if (!q.length) return '';
  for (var i = 0; i < usuarios.length; i++) {
    var u = normNombre_(usuarios[i].Nombre);
    if (q.every(function (p) { return u.indexOf(p) >= 0; })) return usuarios[i].Correo;
  }
  return '';
}

// ---------------------------------------------------------------- Corrección con las listas de la app (sin inventar)

var SINONIMOS_LISTA = { INTERSECCION: 'INT', INC: 'INCLUYE', IZQUIERDO: 'IZQUIERDA', DERECHO: 'DERECHA', AV: '' };
var VACIAS_LISTA = { DE: 1, DEL: 1, Y: 1, LA: 1, EL: 1, EN: 1, PARA: 1, A: 1 };
/** Palabras de un texto, sin tildes ni signos; numeración de partida ("3.1.7.") y códigos "(1.3.4…)" fuera; plurales y sinónimos unificados. */
function palabrasLista(t) {
  var x = String(t || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/²/g, '2').replace(/[´’']/g, '')
    .replace(/^\s*\d+(\.\d+)*\.?\s+/, '').replace(/\(\s*\d+(\.\d+)+[A-Z.]*\s*\)/g, ' ')
    .replace(/\bM?-?N°?\s*0?(\d)\b/g, 'MN0$1')            // MURO N01 / N°1 / M-N01 → MN01
    .replace(/(\d)([A-Z])/g, '$1 $2')
    .replace(/[^A-Z0-9 ]/g, ' ');
  return x.split(/\s+/).filter(function (w) { return w; }).map(function (w) {
    if (SINONIMOS_LISTA[w] !== undefined) w = SINONIMOS_LISTA[w];
    if (w.length > 4 && /S$/.test(w)) w = w.slice(0, -1);
    return w;
  }).filter(function (w) { return w && !VACIAS_LISTA[w]; });
}
/**
 * Opción de la lista que corresponde al valor, solo si es UNA: igual (sin tildes/signos), o el valor está contenido en una sola opción
 * sin que falten números (no se agrega "FY 4200" ni "280" que el valor no tenga). Si no, '' (queda tal cual).
 */
function opcionDeLista(valor, opciones) {
  var v = palabrasLista(valor);
  if (!v.length) return '';
  var clave = function (l) { return l.slice().sort().join(' '); };
  var kv = clave(v);
  var iguales = opciones.filter(function (o) { return clave(palabrasLista(o)) === kv; });
  if (iguales.length === 1) return iguales[0];
  if (iguales.length > 1) return '';
  if (/\s\/\s/.test(String(valor))) return ''; // "A / B": dos opciones a la vez, no se decide por el usuario
  var cand = opciones.filter(function (o) {
    var p = palabrasLista(o);
    if (!v.every(function (w) { return p.indexOf(w) >= 0; })) return false;
    return !p.some(function (w) { return v.indexOf(w) < 0 && /\d/.test(w); });
  });
  return cand.length === 1 ? cand[0] : '';
}

/** Marca los saltos: números que faltan seguidos (más de `max`) antes de un número usado. grupos: { clave: [{n, fila}] }. */
function marcarSaltos_(grupos, max, motivo) {
  Object.keys(grupos).forEach(function (k) {
    var l = grupos[k].slice().sort(function (a, b) { return a.n - b.n; });
    var prev = 0;
    l.forEach(function (x) {
      if (x.n - prev - 1 > max) motivo(x.fila, 'Salto de ' + (x.n - prev - 1) + ' números antes de este en ' + k + ' (faltan del ' + (prev + 1) + ' al ' + (x.n - 1) + ')');
      if (x.n > prev) prev = x.n;
    });
  });
}

/**
 * Analiza las filas del LOG. filas: [{ fila, A..AC }] (fechas ya en dd/mm/aaaa).
 * o: { prefijos: { 'PSR2-F2-CPC-DRB-GLB-RGI': 'F2-DRB-GLB-RGI' }, existentes: { codigo: true }, enLog: { codigo: true },
 *      cpcUsados: { cpc: true }, acronimos: { COD: true }, usuarios: [{ Correo, Nombre }], salto }
 * Devuelve { filas: [{ fila, log, motivos, crear, serie, numero, omitida }], contadores: { serie: max } }.
 */
function analizarLog(filas, o) {
  var salto = o.salto || SALTO_MAX_LOG;
  var out = filas.map(function (f) {
    var log = {};
    Object.keys(COLS_LOG).forEach(function (col) { log[COLS_LOG[col]] = String(f[col] === undefined ? '' : f[col]).trim(); });
    log.Codigo_Completo = log.Codigo_Completo.toUpperCase().replace(/\s+/g, '');
    return { fila: f.fila, log: log, motivos: [], corregidos: {}, crear: false, serie: '', numero: 0, omitida: '' };
  });
  var porFila = {};
  out.forEach(function (x) { porFila[x.fila] = x; });
  var motivo = function (fila, t) { var x = porFila[fila]; if (x.motivos.indexOf(t) < 0) x.motivos.push(t); };

  // Correlativo ingeniero
  var vistos = {};
  out.forEach(function (x) {
    var cod = x.log.Codigo_Completo;
    if (!cod) {
      if (o.enLog[claveSinCodigo(x.log)]) { x.omitida = 'Ya está en el LOG de la app'; return; }
      x.motivos.push('Sin correlativo ingeniero'); return;
    }
    if (o.enLog[cod]) { x.omitida = 'Ya está en el LOG de la app'; return; }
    (vistos[cod] = vistos[cod] || []).push(x);
    var m = /^(.+)-(\d{4})$/.exec(cod);
    if (!m || !o.prefijos[m[1]]) { x.motivos.push('Correlativo ingeniero con serie no reconocida en la app'); return; }
    x.serie = o.prefijos[m[1]];
    x.numero = +m[2];
    if (o.existentes[cod]) { x.motivos.push('El correlativo ya existe en la app (no viene del LOG)'); return; }
    x.crear = true;
  });
  Object.keys(vistos).forEach(function (cod) {
    var l = vistos[cod];
    if (l.length < 2) return;
    var ns = l.map(function (x) { return x.log.N || ('fila ' + x.fila); }).join(', ');
    l.forEach(function (x, i) { x.motivos.push('Correlativo ingeniero repetido en el LOG (N° ' + ns + ')'); if (i > 0) x.crear = false; });
  });
  var activas = out.filter(function (x) { return !x.omitida; });
  var gruposIng = {};
  activas.forEach(function (x) { if (x.serie) (gruposIng[x.serie] = gruposIng[x.serie] || []).push({ n: x.numero, fila: x.fila }); });
  marcarSaltos_(gruposIng, salto, motivo);

  // Correlativo CPC: se corrige solo el acrónimo ya analizado (no es observación: queda en violeta); el número no se toca.
  // Repetidos se comparan por acrónimos + número (RG-F2-001 = RG-F2-0001).
  var cpcs = {}, gruposCPC = {};
  activas.forEach(function (x) {
    var orig = x.log.CPC_Original;
    if (!orig) { x.log.CPC = ''; x.motivos.push('Sin correlativo CPC'); return; }
    var c = corregirCPC(orig);
    x.log.CPC = c.cpc;
    if (c.invalido) { x.motivos.push('CPC con formato no reconocido'); return; }
    if (c.cambios.length) x.corregidos.CPC = orig;
    if (c.digitos !== 4) x.motivos.push('CPC con ' + c.digitos + ' dígitos (la regla es 4; no se cambia)');
    c.acronimos.forEach(function (a) { if (!o.acronimos[a]) x.motivos.push('Acrónimo ' + a + ' fuera de la lista de acrónimos CPC'); });
    var k = c.prefijo + '-' + c.n + (c.rep ? 'A' : '');
    (cpcs[k] = cpcs[k] || []).push(x);
    if (!c.rep) (gruposCPC[c.prefijo] = gruposCPC[c.prefijo] || []).push({ n: c.n, fila: x.fila });
  });
  Object.keys(cpcs).forEach(function (k) {
    var l = cpcs[k];
    var ya = l.some(function (x) { return o.cpcUsados[x.log.CPC]; });
    if (l.length < 2 && !ya) return;
    var ns = l.map(function (x) { return x.log.N || ('fila ' + x.fila); }).join(', ');
    var vals = l.map(function (y) { return y.log.CPC_Original; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).join(' / ');
    l.forEach(function (x) { x.motivos.push(ya ? 'CPC ' + x.log.CPC + ' ya usado en la app' : 'CPC repetido ' + vals + ' (N° ' + ns + ')'); });
  });
  marcarSaltos_(gruposCPC, salto, motivo);

  // Ubicación, localización, partida y especialidad: se pasan a la opción de la lista de la app cuando corresponde a UNA sola
  var listas = o.listas || {};
  activas.forEach(function (x) {
    [['Ubicacion', 'Ubicacion'], ['Localizacion', 'Localizacion'], ['Partida', 'Partida'], ['Especialidad', 'Disciplina']].forEach(function (par) {
      var campo = par[0], lista = listas[par[1]] || [], v = x.log[campo];
      if (!v || !lista.length || lista.indexOf(v) >= 0) return;
      var op = opcionDeLista(v, lista);
      if (op && op !== v) { x.corregidos[campo] = v; x.log[campo] = op; }
    });
    // Especialidad con el título "ESPECIALIDAD/ DISCIPLINA" pegado en vez del dato: la de su correlativo (código del Anexo A)
    var esp = x.log.Codigo_Completo.split('-')[3] || '';
    if (/^ESPECIALIDAD/i.test(x.log.Especialidad) && o.disciplinas && o.disciplinas[esp]) {
      x.corregidos.Especialidad = x.log.Especialidad; x.log.Especialidad = o.disciplinas[esp];
    }
  });

  // Dueño = quien figura en QC (si es usuario de la app)
  activas.forEach(function (x) { x.log.Usuario = duenoPorNombre(x.log.QC, o.usuarios || []); });

  var contadores = {};
  activas.forEach(function (x) { if (x.crear && x.numero > (contadores[x.serie] || 0)) contadores[x.serie] = x.numero; });
  return { filas: out, contadores: contadores };
}

/** Las filas sin correlativo ingeniero se reconocen por N° + CPC + descripción (para no duplicarlas al volver a cargar). */
function claveSinCodigo(l) { return 'SIN|' + l.N + '|' + l.CPC_Original + '|' + l.Descripcion; }

/** Título Aconex como lo arma la fórmula del Excel: AB & " " & E & " - " & K & " - " & L & " - " & N & " @ " & O. */
function tituloAconex(l) {
  return (l.Prefijo_Titulo || 'REGISTRO DE') + '  ' + l.Descripcion + ' - ' + l.Partida + ' - ' + l.Localizacion + ' - ' + l.PK_Inicial + ' @ ' + l.PK_Final;
}

// ---------------------------------------------------------------- Lectura y escritura del Excel

/** Partes del xlsx y ruta de la hoja llamada `nombre` (o la primera). */
function hojaPorNombre_(partes, nombre) {
  var wb = '', rels = '';
  partes.forEach(function (p) {
    if (p.getName() === 'xl/workbook.xml') wb = p.getDataAsString('UTF-8');
    if (p.getName() === 'xl/_rels/workbook.xml.rels') rels = p.getDataAsString('UTF-8');
  });
  var hojas = wb.match(/<sheet\b[^>]*>/g) || [];
  var elegida = hojas.filter(function (s) { return new RegExp('name="' + nombre + '"', 'i').test(s); })[0] || hojas[0];
  if (!elegida) return '';
  var id = /r:id="([^"]+)"/.exec(elegida)[1];
  var rel = new RegExp('<Relationship\\b[^>]*Id="' + id + '"[^>]*>').exec(rels);
  var t = rel && /Target="([^"]+)"/.exec(rel[0]);
  return t ? 'xl/' + t[1].replace(/^\/?xl\//, '') : '';
}

/** Filas del LOG del Excel: [{ fila, A..AC }] y la fila de títulos. */
function leerLogXlsx_(blob) {
  var partes = Utilities.unzip(blob.setContentType('application/zip'));
  var ruta = hojaPorNombre_(partes, 'LOG');
  var cadenas = [], xml = '';
  partes.forEach(function (p) {
    if (p.getName() === 'xl/sharedStrings.xml') cadenas = leerCadenas(p.getDataAsString('UTF-8'));
    if (p.getName() === ruta) xml = p.getDataAsString('UTF-8');
  });
  if (!xml) throw err_('El archivo no tiene la hoja LOG.', 'VALIDACION');
  var h = leerHoja(xml, cadenas);
  var filas = {};
  Object.keys(h.celdas).forEach(function (ref) {
    var m = /^([A-Z]+)(\d+)$/.exec(ref);
    (filas[+m[2]] = filas[+m[2]] || {})[m[1]] = h.celdas[ref];
  });
  var titulos = 0;
  Object.keys(filas).map(Number).sort(function (a, b) { return a - b; }).some(function (f) {
    var r = filas[f];
    if (/^CORRELATIVO/i.test(r.B || '') && /^CORRELATIVO/i.test(r.D || '')) { titulos = f; return true; }
    return false;
  });
  if (!titulos) throw err_('No se encontró la fila de títulos del LOG (CORRELATIVO (INGENIERO) / CORRELATIVO (CPC)).', 'VALIDACION');
  var out = [];
  Object.keys(filas).map(Number).sort(function (a, b) { return a - b; }).forEach(function (f) {
    if (f <= titulos) return;
    var r = filas[f];
    if (!(r.A || r.B || r.D || r.E)) return; // filas vacías (solo fórmulas de relleno)
    var o = { fila: f };
    Object.keys(COLS_LOG).forEach(function (c) { o[c] = FECHAS_LOG[c] ? fechaSerialADmy(r[c]) : (r[c] || ''); });
    out.push(o);
  });
  return { filas: out, titulos: titulos };
}

// ---------------------------------------------------------------- API

function exigirLogCalidad_(ctx) {
  exigirData_(ctx);
  if (!puede_(ctx, 'documentar') && (ctx.usuario.Area || 'Calidad') !== 'Calidad') throw err_('El LOG es de Calidad: tu carga de data es de otra área.', 'PERMISO');
}

function prepararLog_(ctx, d) {
  exigirLogCalidad_(ctx);
  if (!d.base64) throw err_('Elige el Excel del LOG.', 'VALIDACION');
  var bytes = Utilities.base64Decode(d.base64);
  var leido = leerLogXlsx_(Utilities.newBlob(bytes, MIME_XLSX, 'LOG.xlsx'));
  if (!leido.filas.length) throw err_('La hoja LOG no tiene filas.', 'VALIDACION');
  var prefijos = {};
  leer_(SH.SERIES).forEach(function (s) {
    if (s.Proyecto === ctx.proyecto && (s.Area || 'Calidad') === 'Calidad') prefijos[s.Prefijo_Completo] = s.Codigo_Serie;
  });
  var existentes = {}, cpcUsados = {}, enLog = {};
  leer_(SH.REGISTROS).forEach(function (r) {
    if (r.Proyecto !== ctx.proyecto) return;
    existentes[r.Codigo_Completo] = true;
    if (r.Correlativo_CPC && r.Origen !== 'LOG') cpcUsados[r.Correlativo_CPC] = true;
  });
  leer_(SH.LOG).forEach(function (l) { if (l.Proyecto === ctx.proyecto) enLog[l.Codigo_Completo || claveSinCodigo(l)] = true; });
  var acronimos = {};
  catalogo_(ctx.proyecto, 'Acronimo').forEach(function (a) { if (esTrue_(a.Activo)) acronimos[a.Codigo] = true; });
  var listas = {}, disciplinas = {};
  ['Ubicacion', 'Localizacion', 'Partida', 'Disciplina'].forEach(function (t) {
    listas[t] = catalogo_(ctx.proyecto, t).filter(function (c) { return esTrue_(c.Activo) && c.Descripcion; }).map(function (c) { return c.Descripcion; });
  });
  catalogo_(ctx.proyecto, 'Disciplina').forEach(function (c) { disciplinas[c.Codigo] = c.Descripcion; });
  var an = analizarLog(leido.filas, { prefijos: prefijos, existentes: existentes, enLog: enLog, cpcUsados: cpcUsados, acronimos: acronimos, listas: listas, disciplinas: disciplinas,
    usuarios: usuariosDelProyecto_(ctx.proyecto).filter(function (u) { return u.Activo; }) });
  an.bytes = bytes;
  return an;
}

function resumenLog_(an) {
  var act = an.filas.filter(function (x) { return !x.omitida; });
  var motivos = {};
  act.forEach(function (x) { x.motivos.forEach(function (m) { var k = m.replace(/\s*[:(].*$/, '').replace(/ \S+-F\d.*$/, ''); motivos[k] = (motivos[k] || 0) + 1; }); });
  return {
    total: an.filas.length, cargar: act.length, omitidas: an.filas.length - act.length,
    observadas: act.filter(function (x) { return x.motivos.length; }).length,
    codigos: act.filter(function (x) { return x.crear; }).length,
    sinDueno: act.filter(function (x) { return !x.log.Usuario; }).length,
    corregidas: act.filter(function (x) { return Object.keys(x.corregidos).length; }).length,
    correcciones: (function () { var c = {}; act.forEach(function (x) { Object.keys(x.corregidos).forEach(function (k) { c[k] = (c[k] || 0) + 1; }); }); return c; })(),
    motivos: Object.keys(motivos).sort().map(function (k) { return { motivo: k, filas: motivos[k] }; }),
    contadores: an.contadores,
    filas: act.filter(function (x) { return x.motivos.length; }).slice(0, 600).map(function (x) {
      return { fila: x.fila, n: x.log.N, codigo: x.log.Codigo_Completo, cpc: x.log.CPC_Original, motivos: x.motivos };
    }),
  };
}

function previsualizarLog_(ctx, d) {
  return resumenLog_(prepararLog_(ctx, d));
}

function ejecutarLog_(ctx, d) {
  return conLock_(function () {
    var an = prepararLog_(ctx, d);
    var ahora = iso_(), lote = 'LOG-' + sello_();
    var act = an.filas.filter(function (x) { return !x.omitida; });
    var orden = leer_(SH.LOG).filter(function (l) { return l.Proyecto === ctx.proyecto; }).length;
    var logs = act.map(function (x, i) {
      var l = x.log;
      l.ID = lote + '-' + ('000' + (i + 1)).slice(-4);
      l.Proyecto = ctx.proyecto;
      l.Orden = String(orden + i + 1);
      l.Origen = 'Carga inicial';
      l.Motivos = x.motivos.join(' | ');
      l.Corregidos = Object.keys(x.corregidos).length ? JSON.stringify(x.corregidos) : '';
      l.Lote = lote;
      l.Creado_Por = ctx.usuario.Correo;
      l.Fecha_Creacion = ahora;
      return l;
    });
    agregar_(SH.LOG, logs);

    // Códigos del LOG: quedan como Histórico (no se vuelven a generar) con su dueño y datos principales
    var regs = act.filter(function (x) { return x.crear; }).map(function (x) {
      var l = x.log, f = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(l.Fecha), v = /^\d{2}\/(\d{2})\/(\d{4})$/.exec(l.Valorizacion);
      return {
        Codigo_Completo: l.Codigo_Completo, Proyecto: ctx.proyecto, Serie: x.serie, Correlativo_Numero: String(x.numero),
        Usuario: l.Usuario, Estado: ESTADO.ACTIVO, Estado_Doc: DOC.HISTORICO, Actividad: l.Partida, Ubicacion: l.Ubicacion,
        PK_Inicial: l.PK_Inicial, PK_Final: l.PK_Final, Protocolo_Topografico: l.Protocolo_Topografico,
        Valorizacion: v ? v[2] + '-' + v[1] : '', Origen: 'LOG', Creado_Por: ctx.usuario.Correo,
        Fecha_Creacion: f ? f[3] + '-' + f[2] + '-' + f[1] + 'T00:00:00' : ahora, Veces_Reutilizado: '0', Correlativo_CPC: l.CPC,
      };
    });
    agregar_(SH.REGISTROS, regs);

    var ajustes = [];
    leer_(SH.SERIES).forEach(function (s) {
      var max = an.contadores[s.Codigo_Serie];
      if (s.Proyecto !== ctx.proyecto || !max) return;
      var actual = int_(s.Ultimo_Correlativo, 0);
      if (max > actual) { s.Ultimo_Correlativo = String(max); actualizar_(SH.SERIES, s); ajustes.push(s.Codigo_Serie + ' ' + actual + '→' + max); }
    });

    // El Excel queda como plantilla para descargar el LOG con el mismo formato
    var arch = carpeta_('PLANTILLAS_ID').createFile(Utilities.newBlob(an.bytes, MIME_XLSX, 'LOG ' + ctx.proyecto + ' ' + sello_() + '.xlsx'));
    PropertiesService.getScriptProperties().setProperty('LOG_PLANTILLA_' + ctx.proyecto, arch.getId());

    var obs = logs.filter(function (l) { return l.Motivos; }).length;
    registrarHist_([hist_(ctx, 'Carga LOG', null, 'Lote ' + lote + ': ' + logs.length + ' filas (' + obs + ' observadas), ' + regs.length +
      ' códigos. Contadores: ' + (ajustes.join(', ') || 'sin cambios'), 'OK')]);
    return { filas: logs.length, observadas: obs, codigos: regs.length, ajustes: ajustes, lote: lote };
  });
}

/** El LOG del proyecto (lo ve todo usuario de Calidad, incluido el cliente). */
/**
 * Filas del LOG sin dueño (su QC no era usuario de la app al cargarlas): si ahora existe un usuario del proyecto
 * con ese nombre, pasan a ser suyas. Solo escribe la columna Usuario y solo en filas vacías (nunca cambia un dueño).
 */
function vincularLogSinDueno_(proyecto) {
  var us = usuariosDelProyecto_(proyecto);
  var pend = leer_(SH.LOG).filter(function (l) { return l.Proyecto === proyecto && !l.Usuario && l.QC && duenoPorNombre(l.QC, us); });
  if (!pend.length) return 0;
  return conLock_(function () {
    var col = HEADERS[SH.LOG].indexOf('Usuario') + 1, n = 0;
    var logs = leer_(SH.LOG);
    if (!logs.length) return 0;
    var sh = hoja_(SH.LOG), primera = 2, ultima = logs[logs.length - 1]._fila;
    var rg = sh.getRange(primera, col, ultima - primera + 1, 1), vals = rg.getValues();
    logs.forEach(function (l) {
      if (l.Proyecto !== proyecto || l.Usuario || !l.QC) return;
      var c = duenoPorNombre(l.QC, us);
      if (c) { vals[l._fila - primera][0] = c; n++; }
    });
    if (n) { rg.setNumberFormat('@'); rg.setValues(vals.map(function (v) { return [celda_(v[0])]; })); }
    return n;
  });
}

function listarLog_(ctx) {
  if (!veTodasLasAreas_(ctx) && (ctx.usuario.Area || 'Calidad') !== 'Calidad') throw err_('El LOG es de Calidad.', 'PERMISO');
  vincularLogSinDueno_(ctx.proyecto);
  return leer_(SH.LOG).filter(function (l) { return l.Proyecto === ctx.proyecto; })
    .sort(function (a, b) { return int_(a.Orden, 0) - int_(b.Orden, 0); }).map(publico_);
}

function filaLog_(ctx, id) {
  var l = leer_(SH.LOG).filter(function (x) { return x.Proyecto === ctx.proyecto && x.ID === txt_(id); })[0];
  if (!l) throw err_('Fila del LOG no encontrada.', 'NO_EXISTE');
  return l;
}
function esDuenoLog_(ctx, l) { return puede_(ctx, 'generar') && !!l.Usuario && correo_(l.Usuario) === correo_(ctx.usuario.Correo); }

/** Corrige una fila: el dueño sus datos; ESTATUS, TRANSMITAL y FECHA ACONEX solo Control Documentario o superiores. */
function editarLog_(ctx, d) {
  return conLock_(function () {
    var l = filaLog_(ctx, d.id);
    var control = puede_(ctx, 'documentar');
    if (!control && !esDuenoLog_(ctx, l)) throw err_('Solo el dueño de la fila o Control Documentario la corrige.', 'PERMISO');
    var c = d.cambios || {}, hechos = [];
    CAMPOS_LOG_DUENO.concat(CAMPOS_LOG_CONTROL).forEach(function (k) {
      if (c[k] === undefined || txt_(c[k]) === l[k]) return;
      if (CAMPOS_LOG_CONTROL.indexOf(k) >= 0 && !control) throw err_(k.replace('_', ' ') + ' lo cambia solo Control Documentario o superiores.', 'PERMISO');
      var v = txt_(c[k]).substring(0, 500);
      if (k === 'Estatus') { v = v.toUpperCase(); if (['ABIERTO', 'CERRADO'].indexOf(v) < 0) throw err_('Estatus: ABIERTO o CERRADO.', 'VALIDACION'); }
      if ((k === 'Fecha' || k === 'Fecha_Aconex' || k === 'Valorizacion') && v && !/^\d{2}\/\d{2}\/\d{4}$/.test(v)) throw err_('Fecha inválida (dd/mm/aaaa).', 'VALIDACION');
      hechos.push(k + ': ' + (l[k] || '—') + ' → ' + (v || '—'));
      l[k] = v;
      var co = {}; try { co = l.Corregidos ? JSON.parse(l.Corregidos) : {}; } catch (e) { co = {}; }
      if (co[k] !== undefined) { delete co[k]; l.Corregidos = Object.keys(co).length ? JSON.stringify(co) : ''; }
    });
    if (!hechos.length) return publico_(l);
    if (/^Carga inicial|^App/.test(l.Origen) && (c.Descripcion !== undefined || c.Partida !== undefined || c.Localizacion !== undefined || c.PK_Inicial !== undefined || c.PK_Final !== undefined)) {
      l.Titulo_Aconex = tituloAconex(l);
    }
    l.Modificado_Por = ctx.usuario.Correo;
    l.Fecha_Modificacion = iso_();
    actualizar_(SH.LOG, l);
    registrarHist_(hist_(ctx, 'LOG corregido', l.Codigo_Completo ? { Codigo_Completo: l.Codigo_Completo, Serie: '', Correlativo_Numero: '' } : null,
      'N° ' + l.N + ' · ' + hechos.join(' · ')));
    return publico_(l);
  });
}

/** Marca revisada una fila observada (queda quién y cuándo; los motivos se conservan). */
function revisarLog_(ctx, d) {
  return conLock_(function () {
    var l = filaLog_(ctx, d.id);
    if (!puede_(ctx, 'documentar') && !esDuenoLog_(ctx, l)) throw err_('Solo el dueño de la fila o Control Documentario la revisa.', 'PERMISO');
    if (!l.Motivos) throw err_('La fila no está observada.', 'NEGOCIO');
    l.Revisado_Por = ctx.usuario.Correo;
    l.Fecha_Revision = iso_();
    actualizar_(SH.LOG, l);
    registrarHist_(hist_(ctx, 'LOG revisado', l.Codigo_Completo ? { Codigo_Completo: l.Codigo_Completo, Serie: '', Correlativo_Numero: '' } : null,
      'N° ' + l.N + ' · ' + txt_(d.nota).substring(0, 300)));
    return publico_(l);
  });
}

/** Al cerrar un protocolo (Conforme) su fila del LOG se crea o actualiza con lo llenado; lo de Control Documentario se conserva. */
function sincronizarLog_(ctx, reg, serie, datos) {
  var c = datos.campos || {};
  var todos = leer_(SH.LOG).filter(function (l) { return l.Proyecto === ctx.proyecto; });
  var l = todos.filter(function (x) { return x.Codigo_Completo === reg.Codigo_Completo; })[0];
  if (l && l.Origen === 'Carga inicial') return; // las iniciales quedan tal cual se llenaron
  var nuevo = !l;
  if (nuevo) {
    var maxN = 0, maxO = 0;
    todos.forEach(function (x) { maxN = Math.max(maxN, int_(x.N, 0)); maxO = Math.max(maxO, int_(x.Orden, 0)); });
    var base = todos[todos.length - 1] || {};
    l = { ID: 'APP-' + reg.Codigo_Completo, Proyecto: ctx.proyecto, Orden: String(maxO + 1), N: String(maxN + 1), Codigo_Completo: reg.Codigo_Completo,
      Rev: 'A', Componente: base.Componente || '', Estatus: 'ABIERTO', Prefijo_Titulo: 'REGISTRO DE', Origen: 'App',
      Creado_Por: ctx.usuario.Correo, Fecha_Creacion: iso_() };
  }
  var tramo = catalogo_(ctx.proyecto, 'Tramo').filter(function (x) { return x.Codigo === serie.Tramo; })[0];
  var duenio = usuariosDelProyecto_(ctx.proyecto).filter(function (u) { return correo_(u.Correo) === correo_(reg.Usuario); })[0];
  var v = /^(\d{4})-(\d{2})$/.exec(reg.Valorizacion || '');
  l.CPC = l.CPC_Original = reg.Correlativo_CPC || '';
  l.Descripcion = c.descripcion || '';
  l.Especialidad = c.especialidad || '';
  l.Fase = c.fase || serie.Fase;
  l.Tramo = l.Tramo || (tramo ? (tramo.Descripcion || tramo.Codigo) : serie.Tramo);
  l.Cliente = c.cliente || ctx.config.Cliente || '';
  l.Partida = c.partida || '';
  l.Localizacion = c.localizacion || '';
  l.Ubicacion = c.ubicacion || '';
  l.PK_Inicial = c.pk_inicial || '';
  l.PK_Final = c.pk_final || '';
  l.Fecha = datos.fecha || '';
  l.Capa = c.capa || '';
  l.Protocolo_Topografico = c.protocolo_topo || 'NA';
  l.Planos = c.documentos || l.Planos || '';
  l.Valorizacion = v ? fechaSerialADmy(String(dmyASerial('01/' + v[2] + '/' + v[1]))) : '';
  l.QC = duenio ? String(duenio.Nombre).toUpperCase() : l.QC || '';
  l.Usuario = reg.Usuario;
  l.Titulo_Aconex = tituloAconex(l);
  l.Modificado_Por = ctx.usuario.Correo;
  l.Fecha_Modificacion = iso_();
  if (nuevo) agregar_(SH.LOG, [l]); else actualizar_(SH.LOG, l);
}

// ---------------------------------------------------------------- Resumen por grupo (EMD · GLB · PTS)

/** Grupos del resumen = tramo del código del protocolo. */
var GRUPOS_RESUMEN = [['EMD', 'Muros'], ['GLB', 'Todo'], ['PTS', 'Puente Santa Rosa']];

/** Tramo de una fila del LOG: el del correlativo; si no tiene, se deduce de la columna TRAMO. */
function estadoCalidadLog(l) {
  var e = String(l.Estatus || '').trim().toUpperCase();
  return e === 'CERRADO' ? 'concluidos' : e === 'ABIERTO' ? 'observados' : 'pendientes';
}

function grupoDeLog(l) {
  var p = String(l.Codigo_Completo || '').split('-');
  if (p.length >= 7) return p[4];
  var t = String(l.Tramo || '').toUpperCase();
  if (/PUENTE/.test(t)) return 'PTS';
  if (/ACCESO|DU[AÁ]REZ|MURO/.test(t)) return 'EMD';
  return 'GLB';
}

/** Concluido = CERRADO; observado = con observación sin revisar; el resto pendiente. */
function resumenGrupos(items, grupoDe, estadoDe) {
  var g = {};
  GRUPOS_RESUMEN.forEach(function (x) { g[x[0]] = { grupo: x[0], nombre: x[1], total: 0, concluidos: 0, pendientes: 0, observados: 0 }; });
  items.forEach(function (it) {
    var k = grupoDe(it), e = estadoDe(it);
    if (!e) return;
    if (!g[k]) g[k] = { grupo: k, nombre: k, total: 0, concluidos: 0, pendientes: 0, observados: 0 };
    g[k].total++; g[k][e]++;
  });
  return Object.keys(g).map(function (k) { return g[k]; });
}

/** Resumen para el panel: Calidad (desde el LOG) y Topografía (desde sus códigos), según lo que ve el usuario. */
function resumenGruposLog_(ctx) {
  var out = {};
  var todas = veTodasLasAreas_(ctx), area = ctx.usuario.Area || 'Calidad';
  if (todas || area === 'Calidad') {
    var logs = leer_(SH.LOG).filter(function (l) { return l.Proyecto === ctx.proyecto; });
    // Calidad se mide SOLO por la columna V (Estatus): CERRADO = concluido (verde), ABIERTO = abierto (rojo, clave
    // 'observados'), vacío = pendiente. Las observaciones de la carga se siguen viendo en la vista LOG.
    out.calidad = resumenGrupos(logs, grupoDeLog, estadoCalidadLog);
    out.calidadFilas = logs.length;
  }
  if (todas || area === 'Topografía') {
    var topo = {};
    leer_(SH.SERIES).forEach(function (s) { if (s.Proyecto === ctx.proyecto && (s.Area || 'Calidad') === 'Topografía') topo[s.Codigo_Serie] = s.Tramo; });
    var regs = leer_(SH.REGISTROS).filter(function (r) { return r.Proyecto === ctx.proyecto && topo[r.Serie] !== undefined; });
    out.topografia = resumenGrupos(regs, function (r) { return topo[r.Serie]; }, function (r) {
      if (r.Estado === ESTADO.LIBERADO) return '';            // liberado = no usado
      if (r.Estado_Doc === DOC.OBSERVADO) return 'observados';
      return [DOC.HISTORICO, DOC.CARGADO, DOC.VALIDADO].indexOf(r.Estado_Doc) >= 0 ? 'concluidos' : 'pendientes';
    });
  }
  return out;
}

// ---------------------------------------------------------------- Descarga (mismo Excel del LOG)

function celdaLogXml_(ref, valor, estilo, numero) {
  var s = estilo ? ' s="' + estilo + '"' : '';
  if (valor === '' || valor === null || valor === undefined) return '<c r="' + ref + '"' + s + '/>';
  if (numero) return '<c r="' + ref + '"' + s + '><v>' + valor + '</v></c>';
  return '<c r="' + ref + '"' + s + ' t="inlineStr"><is><t xml:space="preserve">' + escXml_(valor) + '</t></is></c>';
}

/** Reescribe las filas de datos de la hoja LOG (desde la fila siguiente a los títulos) con las filas del sistema. */
function escribirFilasLog(xml, titulos, filas) {
  var reFila = new RegExp('<row r="' + (titulos + 1) + '"[^>]*>([\\s\\S]*?)</row>');
  var modelo = reFila.exec(xml);
  var estilos = {}, altoFila = '';
  if (modelo) {
    var rc = /<c r="([A-Z]+)\d+"[^>]*?\ss="(\d+)"/g, m;
    while ((m = rc.exec(modelo[1]))) estilos[m[1]] = m[2];
    var ht = /\sht="([\d.]+)"/.exec(modelo[0]);
    if (ht) altoFila = ' ht="' + ht[1] + '" customHeight="1"';
  }
  var cols = Object.keys(COLS_LOG);
  var filasXml = filas.map(function (l, i) {
    var f = titulos + 1 + i, orig = {};
    try { orig = l.Corregidos ? JSON.parse(l.Corregidos) : {}; } catch (e) { orig = {}; }
    return '<row r="' + f + '"' + altoFila + '>' + cols.map(function (c) {
      var campo = COLS_LOG[c], v = orig[campo] !== undefined ? orig[campo] : l[campo]; // lo corregido por la app sale como se llenó
      if (c === 'D') v = l.CPC_Original;
      if (c === 'A' && /^\d+$/.test(v || '')) return celdaLogXml_(c + f, v, estilos[c], true);
      if (FECHAS_LOG[c] && dmyASerial(v) !== null) return celdaLogXml_(c + f, dmyASerial(v), estilos[c], true);
      return celdaLogXml_(c + f, v, estilos[c], false);
    }).join('') + '</row>';
  }).join('');
  var ini = xml.indexOf('<sheetData>') >= 0 ? xml.indexOf('<sheetData>') + 11 : xml.indexOf('<sheetData');
  var fin = xml.indexOf('</sheetData>');
  var datos = xml.substring(ini, fin);
  // conserva las filas de encabezado y títulos; el resto se reemplaza
  var cabecera = (datos.match(/<row r="(\d+)"[\s\S]*?<\/row>|<row r="(\d+)"[^>]*\/>/g) || []).filter(function (r) { return +/r="(\d+)"/.exec(r)[1] <= titulos; }).join('');
  var ultima = titulos + filas.length;
  var out = xml.substring(0, ini) + cabecera + filasXml + xml.substring(fin);
  out = out.replace(/<dimension ref="([A-Z]+\d+):([A-Z]+)\d+"\/>/, '<dimension ref="$1:$2' + ultima + '"/>')
    .replace(/<autoFilter ref="([A-Z]+\d+):([A-Z]+)\d+"/, '<autoFilter ref="$1:$2' + ultima + '"');
  return out;
}

function descargarLog_(ctx) {
  var filas = listarLog_(ctx);
  var id = PropertiesService.getScriptProperties().getProperty('LOG_PLANTILLA_' + ctx.proyecto);
  if (!id) throw err_('Aún no se ha cargado el LOG inicial: la descarga usa ese mismo Excel como formato.', 'NEGOCIO');
  var partes = Utilities.unzip(DriveApp.getFileById(id).getBlob().setContentType('application/zip'));
  var ruta = hojaPorNombre_(partes, 'LOG');
  var cadenas = [];
  partes.forEach(function (p) { if (p.getName() === 'xl/sharedStrings.xml') cadenas = leerCadenas(p.getDataAsString('UTF-8')); });
  var salida = [];
  partes.forEach(function (p) {
    var n = p.getName();
    if (n === 'xl/calcChain.xml') return; // las fórmulas de la hoja se reemplazan por valores
    if (n === ruta) {
      var xml = p.getDataAsString('UTF-8');
      var titulos = leerLogTitulos_(xml, cadenas);
      salida.push(Utilities.newBlob(escribirFilasLog(xml, titulos, filas), 'application/xml', n));
    } else if (n === '[Content_Types].xml') {
      salida.push(Utilities.newBlob(p.getDataAsString('UTF-8').replace(/<Override[^>]*calcChain[^>]*\/>/, ''), 'application/xml', n));
    } else if (n === 'xl/_rels/workbook.xml.rels') {
      salida.push(Utilities.newBlob(p.getDataAsString('UTF-8').replace(/<Relationship[^>]*calcChain[^>]*\/>/, ''), 'application/xml', n));
    } else salida.push(p);
  });
  var nombre = 'LOG ' + ctx.proyecto + ' ' + Utilities.formatDate(new Date(), 'America/Lima', 'yyyy-MM-dd') + '.xlsx';
  var zip = Utilities.zip(salida, nombre);
  return { nombre: nombre, mime: MIME_XLSX, base64: Utilities.base64Encode(zip.getBytes()), filas: filas.length };
}

function leerLogTitulos_(xml, cadenas) {
  var h = leerHoja(xml, cadenas);
  for (var f = 1; f < 50; f++) if (/^CORRELATIVO/i.test(h.celdas['B' + f] || '') && /^CORRELATIVO/i.test(h.celdas['D' + f] || '')) return f;
  throw err_('La plantilla del LOG no tiene la fila de títulos.', 'CONFIG');
}

if (typeof module !== 'undefined') module.exports = { opcionDeLista: opcionDeLista, palabrasLista: palabrasLista, resumenGrupos: resumenGrupos, grupoDeLog: grupoDeLog, analizarLog: analizarLog, corregirCPC: corregirCPC, duenoPorNombre: duenoPorNombre };
