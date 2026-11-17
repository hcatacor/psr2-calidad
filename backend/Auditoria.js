/** Auditor: validación de integridad y validación/observación de formatos finales. */

function integridad_(ctx) {
  exigir_(ctx, 'historial');
  var series = leer_(SH.SERIES).filter(function (s) { return s.Proyecto === ctx.proyecto; });
  var regs = leer_(SH.REGISTROS).filter(function (r) { return r.Proyecto === ctx.proyecto; });
  var res = calcularIntegridad(series, regs, {
    diasLiberado: int_(ctx.config.Dias_Alerta_Liberado, 7),
    diasPendiente: int_(ctx.config.Dias_Alerta_Pendiente, 15),
  });
  res.fecha = iso_();
  res.auditor = ctx.usuario.Correo;
  var a = res.alertas;
  conLock_(function () {
    registrarHist_(hist_(ctx, 'Validación de integridad', null,
      (res.ok ? 'SIN ERRORES CRÍTICOS' : res.criticas + ' ERRORES CRÍTICOS') +
      '. Códigos: ' + res.totalCodigos + ', duplicados: ' + a.duplicados + ', huecos: ' + a.huecos +
      ', descuadres: ' + a.descuadres + ', liberados en alerta: ' + a.liberadosViejos +
      ', pendientes en alerta: ' + a.pendientesViejos + ', por validar: ' + a.porValidar, res.ok ? 'OK' : 'CON ERRORES'));
  });
  return res;
}

function validarDoc_(ctx, d) {
  exigir_(ctx, 'auditar');
  var resultado = txt_(d.resultado);
  var obs = txt_(d.observacion);
  if ([DOC.VALIDADO, DOC.OBSERVADO].indexOf(resultado) < 0) throw err_('Resultado inválido.', 'VALIDACION');
  if (resultado === DOC.OBSERVADO && obs.length < 3) throw err_('Escribe la observación para el operador.', 'VALIDACION');
  return conLock_(function () {
    var reg = buscarRegistro_(leer_(SH.REGISTROS), d.codigo, ctx.proyecto);
    if (reg.Estado_Doc !== DOC.CARGADO) throw err_('Solo se validan formatos en estado Cargado (actual: ' + reg.Estado_Doc + ').', 'NEGOCIO');
    reg.Estado_Doc = resultado;
    reg.Validado_Por = ctx.usuario.Correo;
    reg.Fecha_Validacion = iso_();
    reg.Observacion_Auditor = obs.substring(0, 1000);
    actualizar_(SH.REGISTROS, reg);
    registrarHist_(hist_(ctx, resultado === DOC.VALIDADO ? 'Validación' : 'Observación', reg, obs || 'Formato validado'));
    return publico_(reg);
  });
}
