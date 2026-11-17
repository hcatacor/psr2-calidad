/**
 * API JSON. El frontend hace POST (Content-Type text/plain para evitar preflight CORS) con:
 *   { action: 'registros.generar', token: '...', proyecto: 'PSR2', data: {...} }
 * Respuesta: { ok: true, data } | { ok: false, error, code, extra }
 */

function doGet() {
  return json_({ ok: true, data: { app: APP.NOMBRE, version: APP.VERSION } });
}

function doPost(e) {
  var res;
  try {
    var req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    res = { ok: true, data: despachar_(req) };
  } catch (ex) {
    if (!ex.code) console.error(ex && ex.stack ? ex.stack : ex);
    res = { ok: false, error: (ex && ex.message) || String(ex), code: ex.code || 'ERROR', extra: ex.extra || null };
  }
  return json_(res);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function rutas_() {
  return {
    'bootstrap': bootstrap_,
    'registros.listar': listarRegistros_,
    'registros.generar': generar_,
    'registros.editar': editar_,
    'registros.liberar': liberar_,
    'registros.reutilizar': reutilizar_,
    'registros.reasignar': reasignar_,
    'registros.historial': historialCodigo_,
    'archivos.subirFinal': subirFinal_,
    'archivos.descargarFinal': descargarFinal_,
    'archivos.descargarFormato': descargarFormato_,
    'auditoria.integridad': integridad_,
    'auditoria.validar': validarDoc_,
    'historial.listar': listarHistorial_,
    'usuarios.guardar': guardarUsuario_,
    'catalogos.guardar': guardarCatalogo_,
    'catalogos.agregarLista': agregarALista_,
    'registros.codigosTopografia': codigosTopografia_,
    'registros.codigosCPC': codigosCPC_,
    'series.guardar': guardarSerie_,
    'series.clonarFase': clonarFase_,
    'series.ajustarContador': ajustarContador_,
    'formatos.guardar': guardarFormato_,
    'formularios.estructura': estructuraFormulario_,
    'formularios.guardar': guardarFormulario_,
    'proyecto.guardar': guardarProyecto_,
    'proyecto.crear': crearProyecto_,
    'importar.previsualizar': previsualizarImport_,
    'importar.ejecutar': ejecutarImport_,
    'log.previsualizar': previsualizarLog_,
    'log.ejecutar': ejecutarLog_,
    'log.listar': listarLog_,
    'log.editar': editarLog_,
    'log.revisar': revisarLog_,
    'log.descargar': descargarLog_,
    'log.resumen': resumenGruposLog_,
    'cuenta.cambiarClave': cambiarClave_,
    'usuarios.restablecerClave': restablecerClave_,
  };
}

function despachar_(req) {
  if (req.action === 'login') return login_(req.data || {});
  var fn = rutas_()[req.action];
  if (!fn) throw err_('Acción desconocida: ' + req.action, 'ACCION');
  var ctx = contexto_(req.token, req.proyecto, req.action !== 'bootstrap');
  if (ctx.cambiarClave && req.action !== 'cuenta.cambiarClave') throw err_('Antes de seguir, cambia tu contraseña temporal.', 'CAMBIAR_CLAVE');
  return fn(ctx, req.data || {});
}

/** Roles que el usuario actual puede asignar (estrictamente por debajo de su nivel). */
function rolesAsignables_(ctx) {
  if (!puede_(ctx, 'administrar')) return [];
  var mio = NIVEL[ctx.usuario.Rol];
  return ROLES_PROYECTO.concat([ROL.COORDINADOR]).filter(function (r) { return NIVEL[r] < mio; });
}

/** Datos iniciales que necesita el frontend (tras login o al cambiar de proyecto). */
function bootstrap_(ctx, d) {
  var b = bootstrapBase_(ctx);
  // Ingreso en un solo viaje: con { inicio: true } trae también los códigos y el resumen del panel
  if (d && d.inicio) {
    b.registros = listarRegistros_(ctx);
    try { b.resumen = resumenGruposLog_(ctx); } catch (e) { b.resumen = null; }
  }
  return b;
}

function bootstrapBase_(ctx) {
  // Series visibles: todas las de mi área (activas y cerradas); gestión y control ven todas.
  var series = leer_(SH.SERIES).filter(function (s) {
    return s.Proyecto === ctx.proyecto && serieDeMiArea_(ctx, s);
  }).map(publico_);
  var catalogos = leer_(SH.CATALOGOS).filter(function (c) { return c.Proyecto === ctx.proyecto; }).map(publico_);
  var permisos = {};
  for (var k in CAPACIDADES) permisos[k] = puede_(ctx, k);
  permisos.data = puedeData_(ctx);
  return {
    app: { nombre: APP.NOMBRE, version: APP.VERSION, maxArchivoMB: APP.MAX_ARCHIVO_MB, maxGenerar: APP.MAX_GENERAR },
    usuario: ctx.usuario,
    permisos: permisos,
    rolesAsignables: rolesAsignables_(ctx),
    config: ctx.config,
    proyecto: ctx.proyecto,
    proyectos: ctx.proyectos,
    series: series,
    catalogos: catalogos,
    formatos: formatosVisibles_(ctx),
    usuarios: usuariosDelProyecto_(ctx.proyecto),
    marcadores: MARCADORES,
  };
}
