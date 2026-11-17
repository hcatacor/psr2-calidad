/**
 * Carga inicial / importación de códigos ya auditados.
 * Columnas: Serie (F2-DRB-GLB-RGI, o DRB-GLB-RGI + columna Fase), Correlativo, Usuario, Estado, Estado_Doc,
 *           Fecha, Actividad, Ubicacion, PK_Inicial, PK_Final, Protocolo_Topografico, Valorizacion
 * Todo o nada: si hay una fila con error, no se importa nada.
 */

function prepararImport_(ctx, d) {
  exigirData_(ctx);
  var filas = d.filas || [];
  if (!filas.length) throw err_('El archivo no tiene filas.', 'VALIDACION');
  if (filas.length > APP.MAX_IMPORTAR) throw err_('Máximo ' + APP.MAX_IMPORTAR + ' filas por importación.', 'VALIDACION');
  // Un usuario delegado solo importa en series de su área; gestión importa en todas
  var series = leer_(SH.SERIES).filter(function (s) { return s.Proyecto === ctx.proyecto && (puede_(ctx, 'documentar') || serieDeMiArea_(ctx, s)); });
  var existentes = {};
  var regs = leer_(SH.REGISTROS);
  regs.forEach(function (r) { existentes[r.Codigo_Completo] = true; });
  var usuarios = {};
  usuariosDelProyecto_(ctx.proyecto).forEach(function (u) { if (u.Activo) usuarios[correo_(u.Correo)] = u; });
  var v = validarImportacion(filas, series, existentes, usuarios, fechaImport_);
  v.series = series;
  return v;
}

function previsualizarImport_(ctx, d) {
  var v = prepararImport_(ctx, d);
  var ajustes = v.series.map(function (s) {
    var max = v.maxPorSerie[s.Codigo_Serie] || 0;
    var actual = int_(s.Ultimo_Correlativo, 0);
    return { serie: s.Codigo_Serie, actual: actual, nuevo: Math.max(actual, max) };
  }).filter(function (a) { return a.nuevo !== a.actual; });
  return {
    total: v.filas.length, validas: v.validas, errores: v.errores, ajustes: ajustes,
    filas: v.filas.map(function (f) { return { n: f.n, codigo: f.codigo, ok: f.ok, errores: f.errores }; }),
  };
}

function ejecutarImport_(ctx, d) {
  return conLock_(function () {
    var v = prepararImport_(ctx, d);
    if (v.errores) throw err_('Hay ' + v.errores + ' filas con error. Corrige el archivo y vuelve a previsualizar.', 'VALIDACION');
    var ahora = iso_();
    var lote = 'IMP-' + sello_();
    var nuevos = v.filas.map(function (f) {
      var r = f.reg;
      r.Proyecto = ctx.proyecto;
      r.Origen = 'Importado';
      r.Creado_Por = ctx.usuario.Correo;
      if (!r.Fecha_Creacion) r.Fecha_Creacion = ahora;
      r.Veces_Reutilizado = '0';
      if (r.Estado === ESTADO.LIBERADO) { r.Motivo_Liberacion = 'Importado como liberado'; r.Fecha_Liberacion = ahora; }
      return r;
    });
    agregar_(SH.REGISTROS, nuevos);

    var ajustes = [];
    v.series.forEach(function (s) {
      var max = v.maxPorSerie[s.Codigo_Serie] || 0;
      var actual = int_(s.Ultimo_Correlativo, 0);
      if (max > actual) {
        s.Ultimo_Correlativo = String(max);
        actualizar_(SH.SERIES, s);
        ajustes.push(s.Codigo_Serie + ' ' + actual + '→' + max);
      }
    });

    var hist = nuevos.map(function (r) { return hist_(ctx, 'Importación', r, 'Lote ' + lote); });
    hist.push(hist_(ctx, 'Importación', null, 'Lote ' + lote + ': ' + nuevos.length + ' códigos. Contadores: ' + (ajustes.join(', ') || 'sin cambios'), 'OK'));
    registrarHist_(hist);
    return { importados: nuevos.length, lote: lote, ajustes: ajustes };
  });
}
