/** Administración: usuarios (jerárquica), catálogos, series, cambio de fase, proyectos. */

// ---------------------------------------------------------------- Usuarios
/**
 * Regla jerárquica: cada uno gestiona solo usuarios de nivel INFERIOR al suyo y asigna roles inferiores.
 *   Propietario → Coordinador General → Jefe de Área → Control Documentario → Auditor/Operador → Visitante
 * Roles de proyecto se guardan en Accesos (por proyecto). Coordinador General es global (Usuarios.Rol_Global).
 */
/** Datos de un usuario que pueden salir de la API (nunca la contraseña ni su hash). */
function usuarioPublico_(u, extra) {
  var o = { Correo: u.Correo, Nombre: u.Nombre, Usuario: u.Usuario, Rol_Global: u.Rol_Global, Activo: u.Activo };
  for (var k in (extra || {})) o[k] = extra[k];
  return o;
}

/**
 * Alta / edición de usuarios. d: { Nombre (completo), Usuario (para ingresar), Clave (inicial, opcional: si no, se genera),
 *   Correo (opcional: solo identificador interno / contacto), Rol, Area, Activo, Carga_Data }.
 * Sin correo, el identificador interno es <usuario>@usuarios.app (no se muestra ni se usa para ingresar).
 */
function guardarUsuario_(ctx, d) {
  exigir_(ctx, 'administrar');
  var nombre = txt_(d.Nombre);
  if (!nombre) throw err_('Indica el nombre completo.', 'VALIDACION');
  var existente = d.Correo ? buscarUsuario_(d.Correo) : null;
  var usuarioIng = normUsuario_(d.Usuario) || (existente ? normUsuario_(existente.Usuario) : '');
  if (!usuarioIng && !existente) usuarioIng = usuarioLibre_(txt_(d.Correo) || nombre.split(' ')[0], txt_(d.Correo));
  if (usuarioIng && !/^[a-z0-9._-]{3,30}$/.test(usuarioIng)) throw err_('Usuario inválido: 3 a 30 caracteres, solo letras minúsculas, números, punto, guion o guion bajo.', 'VALIDACION');
  var correo = existente ? correo_(existente.Correo) : correo_(d.Correo) || (usuarioIng + '@usuarios.app');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) throw err_('Correo inválido.', 'VALIDACION');
  var otro = usuarioIng ? buscarPorUsuario_(usuarioIng) : null;
  if (otro && (!existente || correo_(otro.Correo) !== correo)) throw err_('El usuario "' + usuarioIng + '" ya existe. Elige otro.', 'VALIDACION');
  var claveInicial = txt_(d.Clave);
  if (claveInicial) validarClaveNueva_(claveInicial, usuarioIng);
  var rol = txt_(d.Rol);
  var activo = d.Activo === false || String(d.Activo).toUpperCase() === 'FALSE' ? 'FALSE' : 'TRUE';
  var area = txt_(d.Area);
  var cargaData = d.Carga_Data === true || String(d.Carga_Data).toUpperCase() === 'TRUE' ? 'TRUE' : 'FALSE';
  var miNivel = NIVEL[ctx.usuario.Rol];
  var yo = correo_(ctx.usuario.Correo);

  return conLock_(function () {
    var u = buscarUsuario_(correo);
    var acceso = buscarAcceso_(correo, ctx.proyecto);
    var rolActual = u ? (u.Rol_Global || (acceso ? acceso.Rol : '')) : '';
    var ahora = iso_();

    // Uno mismo: solo nombre (y área en su proyecto)
    if (correo === yo) {
      if (activo === 'FALSE') throw err_('No puedes desactivarte a ti mismo.', 'VALIDACION');
      u.Nombre = nombre;
      actualizar_(SH.USUARIOS, u);
      if (acceso) { acceso.Area = area; actualizar_(SH.ACCESOS, acceso); }
      registrarHist_(hist_(ctx, 'Usuario actualizado', null, (u.Usuario || u.Nombre) + ': datos propios', ''));
      return usuarioPublico_(u);
    }
    if (rolActual && NIVEL[rolActual] >= miNivel) throw err_('No puedes modificar a un usuario de tu mismo nivel o superior (' + rolActual + ').', 'PERMISO');
    if (NIVEL[rol] === undefined || rol === ROL.PROPIETARIO) throw err_('Rol inválido. El Propietario es único y no se asigna.', 'VALIDACION');
    if (NIVEL[rol] >= miNivel) throw err_('Solo puedes asignar roles inferiores al tuyo.', 'PERMISO');

    var cambios = [], temporal = '';
    if (!u) {
      u = { Correo: correo, Nombre: nombre, Usuario: usuarioIng, Rol_Global: '', Activo: 'TRUE', Fecha_Alta: ahora, Alta_Por: yo };
      temporal = claveInicial || claveTemporal_();
      ponerClave_(u, temporal, true); // la cambia al primer ingreso
      agregar_(SH.USUARIOS, [u]);
      cambios.push('alta como "' + usuarioIng + '"');
    } else {
      if (u.Nombre !== nombre) { u.Nombre = nombre; cambios.push('nombre'); }
      if (usuarioIng && normUsuario_(u.Usuario) !== usuarioIng) { cambios.push('usuario ' + (u.Usuario || '—') + ' → ' + usuarioIng); u.Usuario = usuarioIng; }
    }

    if (ROLES_GLOBALES.indexOf(rol) >= 0) {
      // Coordinador General: global
      if (u.Rol_Global !== rol) cambios.push('rol ' + (rolActual || '—') + ' → ' + rol);
      if (esTrue_(u.Activo) !== (activo === 'TRUE')) cambios.push(activo === 'TRUE' ? 'activado' : 'desactivado');
      u.Rol_Global = rol;
      u.Activo = activo;
      actualizar_(SH.USUARIOS, u);
    } else {
      if (u.Rol_Global) { cambios.push('deja de ser ' + u.Rol_Global); u.Rol_Global = ''; }
      if (!esTrue_(u.Activo) && activo === 'TRUE') { u.Activo = 'TRUE'; cambios.push('cuenta reactivada'); }
      actualizar_(SH.USUARIOS, u);
      if (acceso) {
        if (acceso.Rol !== rol) cambios.push('rol ' + acceso.Rol + ' → ' + rol);
        if (esTrue_(acceso.Activo) !== (activo === 'TRUE')) cambios.push(activo === 'TRUE' ? 'activado en ' + ctx.proyecto : 'desactivado en ' + ctx.proyecto);
        if (txt_(acceso.Area) !== area) cambios.push('área');
        if (esTrue_(acceso.Carga_Data) !== (cargaData === 'TRUE')) cambios.push(cargaData === 'TRUE' ? 'habilitada carga de data' : 'retirada carga de data');
        acceso.Rol = rol; acceso.Area = area; acceso.Activo = activo; acceso.Carga_Data = cargaData;
        actualizar_(SH.ACCESOS, acceso);
      } else {
        agregar_(SH.ACCESOS, [{ Correo: correo, Proyecto: ctx.proyecto, Rol: rol, Area: area, Activo: activo, Fecha_Alta: ahora, Alta_Por: yo, Carga_Data: cargaData }]);
        cambios.push('acceso a ' + ctx.proyecto + ' como ' + rol + (cargaData === 'TRUE' ? ' con carga de data' : ''));
      }
    }
    registrarHist_(hist_(ctx, rolActual ? 'Usuario actualizado' : 'Usuario creado', null, (u.Usuario || correo) + ' (' + u.Nombre + '): ' + (cambios.join(', ') || 'sin cambios'), ''));
    return usuarioPublico_(u, temporal ? { Clave_Temporal: temporal } : null);
  });
}

// ---------------------------------------------------------------- Catálogos (Fase, Especialidad, Tramo, Tipo_Documento)
function catalogo_(proyecto, tipo) {
  return leer_(SH.CATALOGOS).filter(function (c) { return c.Proyecto === proyecto && (!tipo || c.Tipo === tipo); });
}

function guardarCatalogo_(ctx, d) {
  exigir_(ctx, 'documentar');
  var tipo = txt_(d.Tipo);
  var codigo = txt_(d.Codigo).toUpperCase();
  if (TIPOS_CATALOGO.concat(TIPOS_CATALOGO_PROTOCOLO).indexOf(tipo) < 0) throw err_('Tipo de catálogo inválido.', 'VALIDACION');
  if (!/^[A-Z0-9]{1,8}$/.test(codigo)) throw err_('Código inválido: solo letras y números, máximo 8 (sin guiones).', 'VALIDACION');
  var activo = d.Activo === false || String(d.Activo).toUpperCase() === 'FALSE' ? 'FALSE' : 'TRUE';
  return conLock_(function () {
    var existente = null;
    catalogo_(ctx.proyecto, tipo).forEach(function (c) { if (c.Codigo === codigo) existente = c; });
    if (existente) {
      existente.Descripcion = txt_(d.Descripcion);
      existente.Activo = activo;
      if (d.Relacion !== undefined) existente.Relacion = txt_(d.Relacion).toUpperCase();
      actualizar_(SH.CATALOGOS, existente);
      registrarHist_(hist_(ctx, 'Catálogo actualizado', null, tipo + ' ' + codigo + (activo === 'TRUE' ? '' : ' (inactivo)'), ''));
      return publico_(existente);
    }
    var nuevo = { Proyecto: ctx.proyecto, Tipo: tipo, Codigo: codigo, Descripcion: txt_(d.Descripcion), Activo: activo, Relacion: txt_(d.Relacion).toUpperCase() };
    agregar_(SH.CATALOGOS, [nuevo]);
    registrarHist_(hist_(ctx, 'Catálogo creado', null, tipo + ' ' + codigo + ' = ' + nuevo.Descripcion, ''));
    return publico_(nuevo);
  });
}

/**
 * Agrega una opción a una lista abierta (Partida, Especialidad de ficha, Localización) desde el formulario.
 * La puede usar quien llena protocolos; el código se asigna solo. Si ya existe (mismo texto), devuelve la existente.
 */
function agregarALista_(ctx, d) {
  exigir_(ctx, 'generar');
  var tipo = txt_(d.Tipo);
  if (!LISTAS_ABIERTAS[tipo]) throw err_('Esa lista no admite agregar opciones desde el formulario.', 'VALIDACION');
  var desc = txt_(d.Descripcion).toUpperCase().replace(/\s+/g, ' ');
  if (desc.length < 3) throw err_('Escribe el texto de la nueva opción (mínimo 3 letras).', 'VALIDACION');
  if (desc.length > 150) throw err_('Texto demasiado largo (máximo 150).', 'VALIDACION');
  return conLock_(function () {
    var items = catalogo_(ctx.proyecto, tipo);
    var igual = items.filter(function (c) { return String(c.Descripcion).toUpperCase() === desc; })[0];
    if (igual) return publico_(igual);
    var pre = LISTAS_ABIERTAS[tipo], max = 0;
    items.forEach(function (c) { var m = new RegExp('^' + pre + '?(\\d+)$').exec(c.Codigo); if (m && +m[1] > max) max = +m[1]; });
    var codigo = (tipo === 'Partida' ? '' : pre) + ('0' + (max + 1)).slice(-2);
    var nuevo = { Proyecto: ctx.proyecto, Tipo: tipo, Codigo: codigo, Descripcion: desc, Activo: 'TRUE', Relacion: '' };
    agregar_(SH.CATALOGOS, [nuevo]);
    registrarHist_(hist_(ctx, 'Catálogo creado', null, tipo + ' ' + codigo + ' = ' + desc + ' (desde formulario)', ''));
    return publico_(nuevo);
  });
}

// ---------------------------------------------------------------- Series = Fase + Especialidad + Tramo + Tipo
function componerSerie_(ctx, fase, esp, tramo, tipo) {
  return {
    codigo: [fase, esp, tramo, tipo].join('-'),
    prefijo: [ctx.proyecto, fase, ctx.config.Empresa, esp, tramo, tipo].join('-'),
  };
}

function validarComponentes_(ctx, comp) {
  var cat = catalogo_(ctx.proyecto);
  TIPOS_CATALOGO.forEach(function (t) {
    var v = comp[t];
    var ok = cat.some(function (c) { return c.Tipo === t && c.Codigo === v && esTrue_(c.Activo); });
    if (!ok) throw err_(t.replace('_', ' de ') + ' "' + v + '" no existe o está inactivo en el catálogo.', 'VALIDACION');
  });
}

function guardarSerie_(ctx, d) {
  exigir_(ctx, 'documentar');
  var activa = d.Activa === false || String(d.Activa).toUpperCase() === 'FALSE' ? 'FALSE' : 'TRUE';
  return conLock_(function () {
    var series = leer_(SH.SERIES);
    if (d.Codigo_Serie) {
      // Edición: solo estado y descripción (los componentes definen el código y no cambian)
      var s = null;
      series.forEach(function (x) { if (x.Codigo_Serie === txt_(d.Codigo_Serie) && x.Proyecto === ctx.proyecto) s = x; });
      if (!s) throw err_('Serie no encontrada.', 'NO_EXISTE');
      var cambios = [];
      if (esTrue_(s.Activa) !== (activa === 'TRUE')) cambios.push(activa === 'TRUE' ? 'activada' : 'cerrada');
      if (txt_(s.Descripcion) !== txt_(d.Descripcion)) cambios.push('descripción');
      var areaE = areaSerie_(d.Area);
      if ((s.Area || 'Calidad') !== areaE) cambios.push('área ' + (s.Area || 'Calidad') + ' → ' + areaE);
      s.Area = areaE;
      s.Activa = activa;
      s.Descripcion = txt_(d.Descripcion);
      actualizar_(SH.SERIES, s);
      registrarHist_(hist_(ctx, 'Serie actualizada', null, s.Codigo_Serie + ': ' + (cambios.join(', ') || 'sin cambios'), ''));
      return publico_(s);
    }
    var comp = { Fase: txt_(d.Fase).toUpperCase(), Especialidad: txt_(d.Especialidad).toUpperCase(), Tramo: txt_(d.Tramo).toUpperCase(), Tipo_Documento: txt_(d.Tipo_Documento).toUpperCase() };
    validarComponentes_(ctx, comp);
    var k = componerSerie_(ctx, comp.Fase, comp.Especialidad, comp.Tramo, comp.Tipo_Documento);
    series.forEach(function (x) {
      if (x.Prefijo_Completo === k.prefijo || (x.Codigo_Serie === k.codigo && x.Proyecto === ctx.proyecto)) throw err_('La serie ' + k.codigo + ' ya existe.', 'VALIDACION');
    });
    var nueva = { Codigo_Serie: k.codigo, Proyecto: ctx.proyecto, Area: areaSerie_(d.Area), Fase: comp.Fase, Especialidad: comp.Especialidad, Tramo: comp.Tramo,
      Tipo_Documento: comp.Tipo_Documento, Prefijo_Completo: k.prefijo, Ultimo_Correlativo: '0', Activa: activa, Descripcion: txt_(d.Descripcion) };
    agregar_(SH.SERIES, [nueva]);
    registrarHist_(hist_(ctx, 'Serie creada', null, k.codigo + ' (' + k.prefijo + ')', ''));
    return publico_(nueva);
  });
}

/**
 * Cambio de fase: crea en la fase destino las mismas series (Especialidad-Tramo-Tipo) que la fase origen,
 * con correlativo desde 0001. Opcionalmente cierra las series de la fase origen (quedan de consulta).
 */
function clonarFase_(ctx, d) {
  exigir_(ctx, 'documentar');
  var origen = txt_(d.origen).toUpperCase();
  var destino = txt_(d.destino).toUpperCase();
  if (!origen || !destino || origen === destino) throw err_('Elige fase de origen y destino distintas.', 'VALIDACION');
  return conLock_(function () {
    var okDestino = catalogo_(ctx.proyecto, 'Fase').some(function (c) { return c.Codigo === destino && esTrue_(c.Activo); });
    if (!okDestino) throw err_('La fase ' + destino + ' no existe o está inactiva en el catálogo.', 'VALIDACION');
    var series = leer_(SH.SERIES).filter(function (s) { return s.Proyecto === ctx.proyecto; });
    var existentes = {};
    series.forEach(function (s) { existentes[s.Codigo_Serie] = true; });
    var base = series.filter(function (s) { return s.Fase === origen && esTrue_(s.Activa); });
    if (!base.length) throw err_('La fase ' + origen + ' no tiene series activas.', 'VALIDACION');
    var nuevas = [];
    base.forEach(function (s) {
      var k = componerSerie_(ctx, destino, s.Especialidad, s.Tramo, s.Tipo_Documento);
      if (existentes[k.codigo]) return;
      nuevas.push({ Codigo_Serie: k.codigo, Proyecto: ctx.proyecto, Fase: destino, Especialidad: s.Especialidad, Tramo: s.Tramo,
        Tipo_Documento: s.Tipo_Documento, Prefijo_Completo: k.prefijo, Ultimo_Correlativo: '0', Activa: 'TRUE', Descripcion: s.Descripcion, Area: s.Area || 'Calidad' });
    });
    agregar_(SH.SERIES, nuevas);
    var cerradas = 0;
    if (d.cerrarOrigen) {
      base.forEach(function (s) { s.Activa = 'FALSE'; actualizar_(SH.SERIES, s); cerradas++; });
    }
    registrarHist_(hist_(ctx, 'Cambio de fase', null, origen + ' → ' + destino + ': ' + nuevas.length + ' series creadas desde 0001' +
      (cerradas ? ', ' + cerradas + ' series ' + origen + ' cerradas' : ''), 'OK'));
    return { creadas: nuevas.length, cerradas: cerradas };
  });
}

/** Ajusta el contador de una serie SOLO hacia arriba (p. ej. tras auditoría de códigos usados fuera del sistema). */
function ajustarContador_(ctx, d) {
  exigir_(ctx, 'documentar');
  var nuevo = int_(d.valor, -1);
  var motivo = txt_(d.motivo);
  if (motivo.length < 3) throw err_('Indica el motivo del ajuste.', 'VALIDACION');
  return conLock_(function () {
    var s = serieDe_(ctx, txt_(d.serie));
    var actual = int_(s.Ultimo_Correlativo, 0);
    if (nuevo <= actual) throw err_('El contador solo puede aumentar (actual: ' + actual + ').', 'VALIDACION');
    s.Ultimo_Correlativo = String(nuevo);
    actualizar_(SH.SERIES, s);
    registrarHist_(hist_(ctx, 'Ajuste de contador', null,
      'Serie ' + s.Codigo_Serie + ': ' + actual + ' → ' + nuevo + '. Motivo: ' + motivo, ''));
    return publico_(s);
  });
}

// ---------------------------------------------------------------- Proyectos
function guardarProyecto_(ctx, d) {
  exigir_(ctx, 'administrar');
  return conLock_(function () {
    var p = buscarProyecto_(ctx.proyecto);
    var cambios = [];
    Object.keys(PARAMS_PROYECTO).forEach(function (k) {
      if (d[k] === undefined) return;
      var n = int_(d[k], -1);
      if (n < 1 || (/^Dia_/.test(k) && n > 31) || n > 365) throw err_('Valor inválido para ' + k, 'VALIDACION');
      if (txt_(p[k]) !== String(n)) { cambios.push(k + ': ' + (p[k] || '—') + ' → ' + n); p[k] = String(n); }
    });
    if (d.Cliente !== undefined && txt_(d.Cliente) !== txt_(p.Cliente)) {
      cambios.push('cliente: ' + (p.Cliente || '—') + ' → ' + txt_(d.Cliente)); p.Cliente = txt_(d.Cliente).toUpperCase();
    }
    if (d.Nombre !== undefined && txt_(d.Nombre) && txt_(d.Nombre) !== p.Nombre) {
      if (!puede_(ctx, 'propietario')) throw err_('Solo el Propietario cambia el nombre del proyecto.', 'PERMISO');
      cambios.push('nombre'); p.Nombre = txt_(d.Nombre);
    }
    actualizar_(SH.PROYECTOS, p);
    if (cambios.length) registrarHist_(hist_(ctx, 'Configuración', null, cambios.join('; '), ''));
    return paramsProyecto_(p);
  });
}

/** Crea un proyecto nuevo (p. ej. VERS). Opcionalmente copia los catálogos del proyecto actual. */
function crearProyecto_(ctx, d) {
  exigir_(ctx, 'propietario');
  var id = txt_(d.ID_Proyecto).toUpperCase();
  var empresa = txt_(d.Empresa).toUpperCase();
  if (!/^[A-Z0-9]{2,8}$/.test(id)) throw err_('Código de proyecto inválido (2 a 8 letras/números).', 'VALIDACION');
  if (!/^[A-Z0-9]{2,8}$/.test(empresa)) throw err_('Código de empresa inválido (2 a 8 letras/números).', 'VALIDACION');
  if (!txt_(d.Nombre)) throw err_('Indica el nombre del proyecto.', 'VALIDACION');
  return conLock_(function () {
    if (buscarProyecto_(id)) throw err_('El proyecto ' + id + ' ya existe.', 'VALIDACION');
    var p = { ID_Proyecto: id, Nombre: txt_(d.Nombre), Empresa: empresa, Activo: 'TRUE', Fecha_Alta: iso_(), Cliente: txt_(d.Cliente).toUpperCase() };
    for (var k in PARAMS_PROYECTO) p[k] = PARAMS_PROYECTO[k];
    agregar_(SH.PROYECTOS, [p]);
    var copiados = 0;
    if (d.copiarCatalogos) {
      var cat = catalogo_(ctx.proyecto).map(function (c) { return { Proyecto: id, Tipo: c.Tipo, Codigo: c.Codigo, Descripcion: c.Descripcion, Activo: c.Activo, Relacion: c.Relacion || '' }; });
      agregar_(SH.CATALOGOS, cat);
      copiados = cat.length;
    }
    registrarHist_(hist_(ctx, 'Proyecto creado', null, id + ' - ' + p.Nombre + ' (empresa ' + empresa + ')' + (copiados ? ', ' + copiados + ' ítems de catálogo copiados' : ''), 'OK'));
    return publico_(p);
  });
}
