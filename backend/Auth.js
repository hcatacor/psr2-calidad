/**
 * Autenticación con usuario y contraseña propios de la app (sin cuenta de Google):
 *  1) login: usuario + contraseña. La contraseña se guarda solo como hash con sal (HMAC-SHA256 iterado), nunca en claro.
 *     5 intentos fallidos bloquean el usuario 15 minutos.
 *  2) El jefe de área (o superior) crea el usuario con una contraseña temporal; el usuario la cambia al primer ingreso
 *     (mientras no la cambie, la API solo le permite cambiarla).
 *  3) Se emite un token de sesión propio firmado con HMAC (válido APP.SESION_HORAS). Cada llamada valida la firma y
 *     recalcula el rol EN EL PROYECTO pedido (si lo desactivan o le quitan el acceso, lo pierde al instante).
 *  El correo queda solo como identificador interno y contacto: no se usa para ingresar.
 */

var CLAVE_ITERACIONES = 2000, CLAVE_MAX_INTENTOS = 5, CLAVE_BLOQUEO_MIN = 15;

function normUsuario_(t) { return txt_(t).toLowerCase(); }

function hashClave_(clave, sal) {
  var h = sal;
  for (var i = 0; i < CLAVE_ITERACIONES; i++) h = Utilities.base64Encode(Utilities.computeHmacSha256Signature(h + String(clave), sal));
  return h;
}

/** Contraseña temporal legible (sin 0/O, 1/l/I). */
function claveTemporal_() {
  var a = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz', d = '23456789', s = '';
  for (var i = 0; i < 6; i++) s += a.charAt(Math.floor(Math.random() * a.length));
  for (var j = 0; j < 4; j++) s += d.charAt(Math.floor(Math.random() * d.length));
  return s;
}

function validarClaveNueva_(clave, usuario) {
  var c = String(clave || '');
  if (c.length < 8 || !/[A-Za-zÑñ]/.test(c) || !/\d/.test(c)) throw err_('La contraseña debe tener al menos 8 caracteres, con letras y números.', 'VALIDACION');
  if (usuario && c.toLowerCase().indexOf(String(usuario).toLowerCase()) >= 0) throw err_('La contraseña no puede contener tu usuario.', 'VALIDACION');
}

/** Pone la contraseña (en el objeto; quien llama guarda la fila). */
function ponerClave_(u, clave, cambiar) {
  u.Clave_Sal = Utilities.getUuid().replace(/-/g, '');
  u.Clave_Hash = hashClave_(clave, u.Clave_Sal);
  u.Cambiar_Clave = cambiar ? 'TRUE' : 'FALSE';
  u.Intentos = '0';
  u.Bloqueado_Hasta = '';
}

function buscarPorUsuario_(usuario) {
  var n = normUsuario_(usuario), us = leer_(SH.USUARIOS);
  for (var i = 0; i < us.length; i++) if (normUsuario_(us[i].Usuario) === n) return us[i];
  return null;
}

/** Usuario de ingreso libre a partir de una base (nombre o correo): minúsculas, sin tildes ni espacios. */
function usuarioLibre_(base, correoPropio) {
  var b = String(base || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/@.*$/, '').replace(/[^a-z0-9._-]/g, '').substring(0, 24) || 'usuario';
  if (b.length < 3) b = (b + 'usr').substring(0, 3);
  var n = b, k = 1, x;
  while ((x = buscarPorUsuario_(n)) && correo_(x.Correo) !== correo_(correoPropio)) n = b + (++k);
  return n;
}

function secreto_() {
  return prop_('SESSION_SECRET');
}

function firmar_(payload) {
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(payload, secreto_()));
}

function crearSesion_(correo) {
  var payload = Utilities.base64EncodeWebSafe(JSON.stringify({ e: correo, x: Date.now() + APP.SESION_HORAS * 3600000 }));
  return payload + '.' + firmar_(payload);
}

function leerSesion_(token) {
  var partes = String(token || '').split('.');
  if (partes.length !== 2) throw err_('Inicia sesión.', 'SESION');
  if (firmar_(partes[0]) !== partes[1]) throw err_('Sesión no válida. Inicia sesión otra vez.', 'SESION');
  var p = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(partes[0])).getDataAsString());
  if (!p.x || p.x < Date.now()) throw err_('Tu sesión expiró. Inicia sesión otra vez.', 'SESION');
  return p.e;
}

/** Proyectos activos a los que el usuario tiene acceso. */
function proyectosDe_(u) {
  var activos = leer_(SH.PROYECTOS).filter(function (p) { return esTrue_(p.Activo); });
  if (u.Rol_Global) return activos;
  var mios = {};
  leer_(SH.ACCESOS).forEach(function (a) {
    if (correo_(a.Correo) === correo_(u.Correo) && esTrue_(a.Activo)) mios[a.Proyecto] = true;
  });
  return activos.filter(function (p) { return mios[p.ID_Proyecto]; });
}

/** Construye el contexto de la llamada: usuario, proyecto elegido y rol efectivo en él. */
function contextoPara_(correo, proyectoPedido, estricto) {
  var u = buscarUsuario_(correo);
  if (!u) throw err_('La cuenta ' + correo + ' no está registrada. Pide acceso al jefe de área.', 'NO_REGISTRADO');
  if (!esTrue_(u.Activo)) throw err_('Tu usuario está desactivado. Contacta al jefe de área.', 'INACTIVO');
  var proyectos = proyectosDe_(u);
  if (!proyectos.length) throw err_('Tu cuenta no tiene acceso a ningún proyecto activo.', 'INACTIVO');
  var p = null;
  proyectos.forEach(function (x) { if (x.ID_Proyecto === proyectoPedido) p = x; });
  if (!p && estricto) throw err_('No tienes acceso al proyecto ' + (proyectoPedido || '(ninguno)') + '. Actualiza la página.', 'SIN_ACCESO');
  if (!p) p = proyectos[0];
  var acceso = u.Rol_Global ? null : buscarAcceso_(correo, p.ID_Proyecto);
  return {
    cambiarClave: esTrue_(u.Cambiar_Clave),
    usuario: { Correo: u.Correo, Usuario: u.Usuario, Nombre: u.Nombre, Rol: u.Rol_Global || acceso.Rol, Rol_Global: u.Rol_Global, Area: acceso ? acceso.Area : '',
      Carga_Data: !!acceso && esTrue_(acceso.Carga_Data) },
    proyecto: p.ID_Proyecto,
    proyectoInfo: p,
    config: paramsProyecto_(p),
    proyectos: proyectos.map(function (x) { return { ID_Proyecto: x.ID_Proyecto, Nombre: x.Nombre, Empresa: x.Empresa }; }),
  };
}

/** estricto=false solo para bootstrap: si el proyecto pedido ya no es accesible, se usa el primero disponible. */
function contexto_(token, proyecto, estricto) {
  return contextoPara_(leerSesion_(token), txt_(proyecto), estricto);
}

function puede_(ctx, capacidad) {
  return CAPACIDADES[capacidad].indexOf(ctx.usuario.Rol) >= 0;
}

function exigir_(ctx, capacidad) {
  if (!puede_(ctx, capacidad)) throw err_('No tienes permiso para esta acción.', 'PERMISO');
}

function esDueno_(ctx, reg) {
  return correo_(reg.Usuario) === correo_(ctx.usuario.Correo);
}

/** Dueño (con rol que genera) o Propietario. */
function exigirDuenoOPropietario_(ctx, reg) {
  if (puede_(ctx, 'propietario')) return;
  if (puede_(ctx, 'generar') && esDueno_(ctx, reg)) return;
  throw err_('Solo el dueño del código puede hacer esto.', 'PERMISO');
}

/** Dueño (con rol que genera) o Jefe de Área / Coordinador / Propietario. */
function exigirDuenoOAdmin_(ctx, reg) {
  if (puede_(ctx, 'administrar')) return;
  if (puede_(ctx, 'generar') && esDueno_(ctx, reg)) return;
  throw err_('Solo el dueño del código o el jefe de área puede hacer esto.', 'PERMISO');
}

function login_(data) {
  var usuario = normUsuario_(data.usuario), clave = String(data.clave || '');
  if (!usuario || !clave) throw err_('Escribe tu usuario y contraseña.', 'AUTH');
  var u = conLock_(function () {
    var x = buscarPorUsuario_(usuario);
    var malo = err_('Usuario o contraseña incorrectos.', 'AUTH');
    if (!x || !x.Clave_Hash) throw malo;
    if (x.Bloqueado_Hasta && x.Bloqueado_Hasta > iso_()) {
      throw err_('Usuario bloqueado por intentos fallidos. Intenta en ' + CLAVE_BLOQUEO_MIN + ' minutos o pide al jefe de área que restablezca tu contraseña.', 'BLOQUEADO');
    }
    if (hashClave_(clave, x.Clave_Sal) !== x.Clave_Hash) {
      var n = int_(x.Intentos, 0) + 1;
      x.Intentos = String(n);
      if (n >= CLAVE_MAX_INTENTOS) { x.Intentos = '0'; x.Bloqueado_Hasta = iso_(new Date(Date.now() + CLAVE_BLOQUEO_MIN * 60000)); }
      actualizar_(SH.USUARIOS, x);
      throw malo;
    }
    if (int_(x.Intentos, 0) || x.Bloqueado_Hasta) { x.Intentos = '0'; x.Bloqueado_Hasta = ''; actualizar_(SH.USUARIOS, x); }
    return x;
  });
  var ctx = contextoPara_(u.Correo, txt_(data.proyecto));
  var res = bootstrap_(ctx);
  res.token = crearSesion_(u.Correo);
  res.cambiarClave = esTrue_(u.Cambiar_Clave);
  return res;
}

/** Cambio de contraseña del propio usuario (obligatorio en el primer ingreso). */
function cambiarClave_(ctx, d) {
  return conLock_(function () {
    var u = buscarUsuario_(ctx.usuario.Correo);
    if (!u.Clave_Hash || hashClave_(String(d.actual || ''), u.Clave_Sal) !== u.Clave_Hash) throw err_('La contraseña actual no es correcta.', 'VALIDACION');
    validarClaveNueva_(d.nueva, u.Usuario);
    if (String(d.nueva) === String(d.actual)) throw err_('La nueva contraseña debe ser distinta de la actual.', 'VALIDACION');
    ponerClave_(u, String(d.nueva), false);
    actualizar_(SH.USUARIOS, u);
    registrarHist_(hist_(ctx, 'Contraseña cambiada', null, u.Usuario, ''));
    return { ok: true };
  });
}

/** El jefe de área (o superior) restablece la contraseña de un usuario de nivel inferior: le da una temporal. */
function restablecerClave_(ctx, d) {
  exigir_(ctx, 'administrar');
  var correo = correo_(d.Correo);
  if (correo === correo_(ctx.usuario.Correo)) throw err_('Para tu propia contraseña usa "Cambiar contraseña".', 'VALIDACION');
  return conLock_(function () {
    var u = buscarUsuario_(correo);
    if (!u) throw err_('Usuario no encontrado.', 'NO_EXISTE');
    var rol = u.Rol_Global || (buscarAcceso_(correo, ctx.proyecto) || {}).Rol || '';
    if (!rol || NIVEL[rol] >= NIVEL[ctx.usuario.Rol]) throw err_('Solo puedes restablecer la contraseña de usuarios de nivel inferior.', 'PERMISO');
    if (!u.Usuario) u.Usuario = usuarioLibre_(u.Nombre.split(' ')[0], correo);
    var temporal = claveTemporal_();
    ponerClave_(u, temporal, true);
    actualizar_(SH.USUARIOS, u);
    registrarHist_(hist_(ctx, 'Contraseña restablecida', null, u.Usuario + ' (temporal entregada por ' + ctx.usuario.Nombre + ')', ''));
    return { Usuario: u.Usuario, Nombre: u.Nombre, Clave_Temporal: temporal };
  });
}

/**
 * DATA (carga y descarga masiva): Control Documentario y superiores siempre;
 * además, cualquier usuario que pueda generar y al que el jefe le haya delegado "Carga_Data" (solo en su área).
 */
function puedeData_(ctx) {
  return puede_(ctx, 'documentar') || (puede_(ctx, 'generar') && !!ctx.usuario.Carga_Data);
}

function exigirData_(ctx) {
  if (!puedeData_(ctx)) throw err_('No tienes habilitada la carga/descarga de data. Pídela al jefe de área.', 'PERMISO');
}
