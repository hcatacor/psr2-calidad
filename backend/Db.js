/**
 * Capa de datos sobre Google Sheets.
 * Todas las celdas se guardan como TEXTO (formato '@') para evitar conversiones
 * automáticas de fechas/booleanos por el locale de la hoja.
 */

var __ss = null;

function db_() {
  if (!__ss) __ss = SpreadsheetApp.openById(prop_('SS_ID'));
  return __ss;
}

function hoja_(nombre) {
  var sh = db_().getSheetByName(nombre);
  if (!sh) throw err_('Falta la hoja "' + nombre + '". Ejecute setup().', 'CONFIG');
  return sh;
}

function celda_(v) {
  if (v instanceof Date) return iso_(v);
  if (v === null || v === undefined) return '';
  return String(v);
}

/** Lee toda la tabla como objetos { Header: valor, _fila: n }. */
function leer_(nombre) {
  return leerDe_(db_(), nombre);
}

/** Igual que leer_, pero de otra base (solo lectura: la usa Pruebas para leer los usuarios de la app real). */
function leerDe_(ss, nombre) {
  var sh = ss.getSheetByName(nombre);
  if (!sh) throw err_('Falta la hoja "' + nombre + '".', 'CONFIG');
  var headers = HEADERS[nombre];
  var last = sh.getLastRow();
  if (last < 2) return [];
  var vals = sh.getRange(2, 1, last - 1, headers.length).getValues();
  var out = [];
  for (var i = 0; i < vals.length; i++) {
    var r = vals[i];
    if (r.join('') === '') continue; // fila vacía
    var o = { _fila: i + 2 };
    for (var j = 0; j < headers.length; j++) o[headers[j]] = celda_(r[j]);
    out.push(o);
  }
  return out;
}

/** Evita inyección de fórmulas: valores que empiezan con = + - @ se guardan como texto literal. */
function seguro_(v) {
  var s = celda_(v);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}

function filaDe_(nombre, obj) {
  return HEADERS[nombre].map(function (h) { return seguro_(obj[h]); });
}

/** Agrega varias filas en una sola escritura. */
function agregar_(nombre, objs) {
  if (!objs || !objs.length) return;
  var sh = hoja_(nombre);
  var h = HEADERS[nombre];
  var inicio = sh.getLastRow() + 1;
  var faltan = inicio + objs.length - 1 - sh.getMaxRows();
  if (faltan > 0) sh.insertRowsAfter(sh.getMaxRows(), faltan);
  var rg = sh.getRange(inicio, 1, objs.length, h.length);
  rg.setNumberFormat('@');
  rg.setValues(objs.map(function (o) { return filaDe_(nombre, o); }));
  objs.forEach(function (o, i) { o._fila = inicio + i; });
}

/** Reemplaza todas las filas de datos de la tabla por objs (las sobrantes quedan vacías). */
function reescribir_(nombre, objs) {
  var sh = hoja_(nombre), h = HEADERS[nombre];
  var filas = objs.map(function (o) { return filaDe_(nombre, o); });
  var antes = Math.max(0, sh.getLastRow() - 1);
  var vacia = h.map(function () { return ''; });
  while (filas.length < antes) filas.push(vacia);
  if (!filas.length) return;
  var faltan = filas.length + 1 - sh.getMaxRows();
  if (faltan > 0) sh.insertRowsAfter(sh.getMaxRows(), faltan);
  var rg = sh.getRange(2, 1, filas.length, h.length);
  rg.setNumberFormat('@');
  rg.setValues(filas);
}

/** Reescribe una fila existente (obj debe traer _fila). */
function actualizar_(nombre, obj) {
  if (!obj._fila) throw err_('Fila no identificada', 'INTERNO');
  var rg = hoja_(nombre).getRange(obj._fila, 1, 1, HEADERS[nombre].length);
  rg.setNumberFormat('@');
  rg.setValues([filaDe_(nombre, obj)]);
}

function buscarUsuario_(correo) {
  var c = correo_(correo);
  var us = leer_(SH.USUARIOS);
  for (var i = 0; i < us.length; i++) if (correo_(us[i].Correo) === c) return us[i];
  return null;
}

function buscarAcceso_(correo, proyecto) {
  var c = correo_(correo);
  var as = leer_(SH.ACCESOS);
  for (var i = 0; i < as.length; i++) if (correo_(as[i].Correo) === c && as[i].Proyecto === proyecto) return as[i];
  return null;
}

function buscarProyecto_(id) {
  var ps = leer_(SH.PROYECTOS);
  for (var i = 0; i < ps.length; i++) if (ps[i].ID_Proyecto === id) return ps[i];
  return null;
}

/** Parámetros del proyecto con valores por defecto. */
function paramsProyecto_(p) {
  var o = { Proyecto: p.ID_Proyecto, Nombre: p.Nombre, Empresa: p.Empresa, Cliente: txt_(p.Cliente) };
  for (var k in PARAMS_PROYECTO) o[k] = txt_(p[k]) || PARAMS_PROYECTO[k];
  return o;
}

/**
 * Rol efectivo de un usuario en un proyecto ('' si no tiene acceso activo).
 * Roles globales (Propietario, Coordinador General) aplican a todos los proyectos.
 */
function rolEn_(correo, proyecto) {
  var u = buscarUsuario_(correo);
  if (!u || !esTrue_(u.Activo)) return '';
  if (u.Rol_Global) return u.Rol_Global;
  var a = buscarAcceso_(correo, proyecto);
  return a && esTrue_(a.Activo) ? a.Rol : '';
}

/** Usuarios con acceso al proyecto, con su rol efectivo. */
function usuariosDelProyecto_(proyecto) {
  var accesos = {};
  leer_(SH.ACCESOS).forEach(function (a) { if (a.Proyecto === proyecto) accesos[correo_(a.Correo)] = a; });
  var out = [];
  leer_(SH.USUARIOS).forEach(function (u) {
    var a = accesos[correo_(u.Correo)];
    if (!u.Rol_Global && !a) return;
    out.push({
      Correo: u.Correo, Nombre: u.Nombre, Usuario: u.Usuario, Bloqueado: !!u.Bloqueado_Hasta && u.Bloqueado_Hasta > iso_(),
      Rol: u.Rol_Global || a.Rol, Global: !!u.Rol_Global, Area: a ? a.Area : '', Carga_Data: !!a && esTrue_(a.Carga_Data),
      Activo: esTrue_(u.Activo) && (!!u.Rol_Global || esTrue_(a.Activo)),
    });
  });
  return out;
}

function buscarRegistro_(regs, codigo, proyecto) {
  var c = txt_(codigo);
  for (var i = 0; i < regs.length; i++) if (regs[i].Codigo_Completo === c && regs[i].Proyecto === proyecto) return regs[i];
  throw err_('Código no encontrado: ' + c, 'NO_EXISTE');
}

/** Crea una entrada de historial (no la escribe). */
function hist_(ctx, accion, reg, detalle, estado) {
  return {
    ID: uid_(),
    Fecha_Hora: iso_(),
    Usuario: ctx.usuario.Correo,
    Accion: accion,
    Codigo_Completo: reg ? reg.Codigo_Completo : '',
    Serie: reg ? reg.Serie : '',
    Correlativo: reg ? reg.Correlativo_Numero : '',
    Estado_Resultante: estado !== undefined ? estado : (reg ? reg.Estado + ' / ' + reg.Estado_Doc : ''),
    Detalle: detalle || '',
    Proyecto: ctx.proyecto,
  };
}

function registrarHist_(entradas) {
  agregar_(SH.HISTORIAL, [].concat(entradas));
}
