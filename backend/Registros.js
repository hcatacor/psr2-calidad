/**
 * Núcleo de correlativos.
 * RN-01 Código = Prefijo-NNNN, único.   RN-02 Correlativo = último + 1, atómico (LockService).
 * RN-03 Nunca se borra un código.       RN-04/05 Liberar/Reutilizar: dueño (o Propietario).
 * RN-05 Un código liberado queda libre para CUALQUIER usuario: al generar en esa serie, el liberado de número más bajo
 *       es la primera opción (se reutiliza antes de crear uno nuevo). Liberar: dueño o administrador.
 * RN-06 Reasignar: Admin/Propietario.   RN-07 Todo queda en Historial (append-only).
 */

// ---------------------------------------------------------------- Áreas
/** Área válida de una serie (por defecto Calidad). */
function areaSerie_(v) {
  var a = txt_(v) || 'Calidad';
  if (AREAS_SERIE.indexOf(a) < 0) throw err_('Área inválida: ' + a, 'VALIDACION');
  return a;
}

/** Roles de gestión/control ven todas las áreas; Operador y Visitante solo la suya. */
function veTodasLasAreas_(ctx) {
  return puede_(ctx, 'documentar') || puede_(ctx, 'historial') || puede_(ctx, 'auditar');
}

function serieDeMiArea_(ctx, serie) {
  return veTodasLasAreas_(ctx) || (serie.Area || 'Calidad') === (ctx.usuario.Area || 'Calidad');
}

function listarRegistros_(ctx) {
  var visibles = {};
  leer_(SH.SERIES).forEach(function (s) { if (s.Proyecto === ctx.proyecto && serieDeMiArea_(ctx, s)) visibles[s.Codigo_Serie] = true; });
  return leer_(SH.REGISTROS).filter(function (r) { return r.Proyecto === ctx.proyecto && visibles[r.Serie]; }).map(publico_);
}

function serieDe_(ctx, codigoSerie) {
  var series = leer_(SH.SERIES);
  for (var i = 0; i < series.length; i++) {
    if (series[i].Codigo_Serie === codigoSerie && series[i].Proyecto === ctx.proyecto) return series[i];
  }
  throw err_('Serie no encontrada: ' + codigoSerie, 'NO_EXISTE');
}

function camposDescriptivos_(d) {
  var o = {};
  CAMPOS_EDITABLES.forEach(function (c) { if (d[c] !== undefined) o[c] = txt_(d[c]).substring(0, 500); });
  return o;
}

function generar_(ctx, d) {
  exigir_(ctx, 'generar');
  var cantidad = Math.max(1, Math.min(APP.MAX_GENERAR, int_(d.cantidad, 1)));
  var campos = camposDescriptivos_(d.campos || {});

  return conLock_(function () {
    var serie = serieDe_(ctx, txt_(d.serie));
    if (!esTrue_(serie.Activa)) throw err_('La serie ' + serie.Codigo_Serie + ' está inactiva.', 'NEGOCIO');
    if (!puede_(ctx, 'documentar') && !serieDeMiArea_(ctx, serie)) {
      throw err_('La serie ' + serie.Codigo_Serie + ' es del área ' + serie.Area + '; no está habilitada para tu área.', 'PERMISO');
    }

    var formato = txt_(d.formato).toUpperCase();
    if (formato && !esTrue_(formatoDe_(ctx, formato).Activo)) throw err_('El formato ' + formato + ' está inactivo.', 'NEGOCIO');
    var regs = leer_(SH.REGISTROS);
    var yo = correo_(ctx.usuario.Correo);
    // Liberados de la serie (de cualquier usuario), del número más bajo al más alto: primera opción al generar
    var libres = regs.filter(function (r) { return r.Proyecto === ctx.proyecto && r.Serie === serie.Codigo_Serie && r.Estado === ESTADO.LIBERADO; })
      .sort(function (a, b) { return int_(a.Correlativo_Numero, 0) - int_(b.Correlativo_Numero, 0); });

    var existentes = {};
    regs.forEach(function (r) { existentes[r.Codigo_Completo] = true; });
    var ultimo = int_(serie.Ultimo_Correlativo, 0);
    var ahora = iso_();
    var nuevos = [];
    var historial = [];

    var reusados = [];
    for (var k = 0; k < cantidad; k++) {
      if (libres.length) {
        var lib = libres.shift();
        var anterior = correo_(lib.Usuario);
        lib.Usuario_Anterior = anterior;
        lib.Usuario = yo;
        lib.Estado = ESTADO.ACTIVO;
        lib.Veces_Reutilizado = String(int_(lib.Veces_Reutilizado, 0) + 1);
        lib.Fecha_Liberacion = '';
        lib.Formato = formato;
        CAMPOS_EDITABLES.forEach(function (c) { lib[c] = campos[c] !== undefined ? campos[c] : ''; });
        lib.Valorizacion = periodoValorizacion(ahora, ctx.config.Dia_Inicio_Ciclo);
        lib.Modificado_Por = yo;
        lib.Fecha_Modificacion = ahora;
        reusados.push(lib);
        historial.push(hist_(ctx, 'Reutilización', lib, 'Liberado tomado al generar (primera opción de la serie). Vez N° ' +
          lib.Veces_Reutilizado + '. Antes: ' + (anterior || 'sin dueño') + '. Motivo de liberación: ' + txt_(lib.Motivo_Liberacion)));
        continue;
      }
      var n = ultimo + 1;
      var codigo = codigoDe_(serie.Prefijo_Completo, n);
      while (existentes[codigo]) { n++; codigo = codigoDe_(serie.Prefijo_Completo, n); } // defensa extra
      ultimo = n;
      existentes[codigo] = true;
      var reg = {
        Codigo_Completo: codigo, Proyecto: ctx.proyecto, Serie: serie.Codigo_Serie, Correlativo_Numero: String(n),
        Usuario: yo, Estado: ESTADO.ACTIVO, Estado_Doc: DOC.PENDIENTE,
        Origen: 'App', Creado_Por: yo, Fecha_Creacion: ahora, Veces_Reutilizado: '0', Formato: formato,
      };
      reg.Valorizacion = periodoValorizacion(ahora, ctx.config.Dia_Inicio_Ciclo); // automática (26→25); editable
      for (var c in campos) reg[c] = campos[c];
      if (campos.Valorizacion && !/^\d{4}-\d{2}$/.test(campos.Valorizacion)) throw err_('Valorización inválida (aaaa-mm).', 'VALIDACION');
      nuevos.push(reg);
      historial.push(hist_(ctx, 'Creación', reg, 'Correlativo creado'));
    }

    reusados.forEach(function (r) { actualizar_(SH.REGISTROS, r); });
    if (nuevos.length) agregar_(SH.REGISTROS, nuevos);
    serie.Ultimo_Correlativo = String(ultimo);
    actualizar_(SH.SERIES, serie);
    registrarHist_(historial);
    return reusados.concat(nuevos).map(publico_);
  });
}

function editar_(ctx, d) {
  return conLock_(function () {
    var regs = leer_(SH.REGISTROS);
    var reg = buscarRegistro_(regs, d.codigo, ctx.proyecto);
    exigirDuenoOAdmin_(ctx, reg);
    if (reg.Estado_Doc === DOC.VALIDADO && !puede_(ctx, 'administrar')) {
      throw err_('El código ya fue validado. Solo un administrador puede modificarlo.', 'NEGOCIO');
    }
    var campos = camposDescriptivos_(d.campos || {});
    if (campos.Valorizacion && !/^\d{4}-\d{2}$/.test(campos.Valorizacion)) throw err_('Valorización inválida (aaaa-mm).', 'VALIDACION');
    var cambios = [];
    for (var c in campos) {
      if (txt_(reg[c]) !== campos[c]) {
        cambios.push(c + ': "' + txt_(reg[c]) + '" → "' + campos[c] + '"');
        reg[c] = campos[c];
      }
    }
    if (!cambios.length) return publico_(reg);
    reg.Modificado_Por = ctx.usuario.Correo;
    reg.Fecha_Modificacion = iso_();
    actualizar_(SH.REGISTROS, reg);
    registrarHist_(hist_(ctx, 'Modificación', reg, cambios.join('; ')));
    return publico_(reg);
  });
}

function liberar_(ctx, d) {
  var motivo = txt_(d.motivo);
  if (motivo.length < 3) throw err_('Indica el motivo de la liberación.', 'VALIDACION');
  return conLock_(function () {
    var regs = leer_(SH.REGISTROS);
    var reg = buscarRegistro_(regs, d.codigo, ctx.proyecto);
    exigirDuenoOAdmin_(ctx, reg);
    if (reg.Estado !== ESTADO.ACTIVO) throw err_('El código no está activo.', 'NEGOCIO');
    if (reg.Estado_Doc !== DOC.PENDIENTE) {
      throw err_('El código ya tiene formato cargado o es histórico (' + reg.Estado_Doc + '); no se puede liberar.', 'NEGOCIO');
    }
    var datos = {};
    try { datos = reg.Datos_Formulario ? JSON.parse(reg.Datos_Formulario) : {}; } catch (e) { datos = {}; }
    if (datos.conforme) throw err_('El protocolo ya tiene Conforme; no se puede liberar.', 'NEGOCIO');
    var limpio = (reg.Datos_Formulario ? ' Se descartó el avance del protocolo ' + txt_(reg.Formato) + '.' : '') +
      (reg.Correlativo_CPC ? ' CPC anulado: ' + reg.Correlativo_CPC + '.' : '');
    reg.Datos_Formulario = '';
    reg.Correlativo_CPC = '';
    reg.Estado = ESTADO.LIBERADO;
    reg.Motivo_Liberacion = motivo.substring(0, 500);
    reg.Fecha_Liberacion = iso_();
    reg.Modificado_Por = ctx.usuario.Correo;
    reg.Fecha_Modificacion = reg.Fecha_Liberacion;
    actualizar_(SH.REGISTROS, reg);
    var ajeno = !esDueno_(ctx, reg) ? ' (por administrador, dueño: ' + (reg.Usuario || 'sin dueño') + ')' : '';
    registrarHist_(hist_(ctx, 'Liberación', reg, 'Motivo: ' + reg.Motivo_Liberacion + ajeno + limpio + ' Queda libre para cualquier usuario.'));
    return publico_(reg);
  });
}

function reutilizar_(ctx, d) {
  return conLock_(function () {
    var regs = leer_(SH.REGISTROS);
    var reg = buscarRegistro_(regs, d.codigo, ctx.proyecto);
    exigirDuenoOPropietario_(ctx, reg);
    if (reg.Estado !== ESTADO.LIBERADO) throw err_('El código no está liberado.', 'NEGOCIO');
    reg.Estado = ESTADO.ACTIVO;
    reg.Veces_Reutilizado = String(int_(reg.Veces_Reutilizado, 0) + 1);
    reg.Fecha_Liberacion = '';
    reg.Modificado_Por = ctx.usuario.Correo;
    reg.Fecha_Modificacion = iso_();
    var campos = camposDescriptivos_(d.campos || {});
    for (var c in campos) reg[c] = campos[c];
    actualizar_(SH.REGISTROS, reg);
    var ajeno = !esDueno_(ctx, reg) ? ' (por Propietario)' : '';
    registrarHist_(hist_(ctx, 'Reutilización', reg,
      'Reutilizado. Vez N° ' + reg.Veces_Reutilizado + '. Motivo anterior: ' + reg.Motivo_Liberacion + ajeno));
    return publico_(reg);
  });
}

function reasignar_(ctx, d) {
  exigir_(ctx, 'administrar');
  var nuevo = correo_(d.usuario);
  return conLock_(function () {
    var destino = buscarUsuario_(nuevo);
    var rolDestino = rolEn_(nuevo, ctx.proyecto);
    if (!destino || CAPACIDADES.generar.indexOf(rolDestino) < 0) {
      throw err_('Solo se puede reasignar a un usuario activo del proyecto que pueda generar códigos (no Visitante ni Auditor).', 'VALIDACION');
    }
    var regs = leer_(SH.REGISTROS);
    var reg = buscarRegistro_(regs, d.codigo, ctx.proyecto);
    var anterior = correo_(reg.Usuario);
    if (anterior === nuevo) return publico_(reg);
    reg.Usuario_Anterior = anterior;
    reg.Usuario = nuevo;
    reg.Modificado_Por = ctx.usuario.Correo;
    reg.Fecha_Modificacion = iso_();
    actualizar_(SH.REGISTROS, reg);
    registrarHist_(hist_(ctx, 'Reasignación', reg,
      'Usuario reasignado: ' + (anterior || 'sin dueño') + ' → ' + nuevo + (d.motivo ? '. Motivo: ' + txt_(d.motivo) : '')));
    return publico_(reg);
  });
}

function historialCodigo_(ctx, d) {
  var codigo = txt_(d.codigo);
  return leer_(SH.HISTORIAL).filter(function (h) { return h.Codigo_Completo === codigo && h.Proyecto === ctx.proyecto; })
    .map(publico_).reverse();
}

function listarHistorial_(ctx, d) {
  exigir_(ctx, 'historial');
  var lim = Math.min(int_(d.limite, 500), 3000);
  var f = {
    codigo: txt_(d.codigo).toUpperCase(), usuario: correo_(d.usuario), accion: txt_(d.accion),
    desde: txt_(d.desde), hasta: txt_(d.hasta),
  };
  var out = leer_(SH.HISTORIAL).filter(function (h) {
    if (h.Proyecto && h.Proyecto !== ctx.proyecto) return false;
    if (f.codigo && h.Codigo_Completo.toUpperCase().indexOf(f.codigo) < 0) return false;
    if (f.usuario && correo_(h.Usuario) !== f.usuario) return false;
    if (f.accion && h.Accion !== f.accion) return false;
    if (f.desde && h.Fecha_Hora.substring(0, 10) < f.desde) return false;
    if (f.hasta && h.Fecha_Hora.substring(0, 10) > f.hasta) return false;
    return true;
  }).reverse();
  return { total: out.length, filas: out.slice(0, lim).map(publico_) };
}
