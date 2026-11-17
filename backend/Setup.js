/**
 * INSTALACIÓN — ejecutar UNA VEZ desde el editor de Apps Script con la cuenta hcat:
 *   Seleccionar función "setup" → Ejecutar → autorizar permisos.
 * Es idempotente: si ya existe, solo completa lo que falte (no borra datos).
 */

var SEMILLA_PROYECTO = { ID_Proyecto: 'PSR2', Nombre: 'PSR2 - Consorcio Puente Chalaco', Empresa: 'CPC', Cliente: 'PROVIAS NACIONAL' };

var SEMILLA_USUARIOS = [
  // El Propietario se toma de la cuenta que ejecuta setup() (hcat).
  { Correo: 'eduardo@usuarios.app', Nombre: 'Eduardo', Usuario: 'eduardo', Rol: 'Jefe de Área', Area: 'Calidad' },
  { Correo: 'lsalazar@usuarios.app', Nombre: 'Lesllye Salazar', Usuario: 'lsalazar', Rol: 'Operador', Area: 'Calidad' },
  { Correo: 'jsanchez@usuarios.app', Nombre: 'Jenny Sánchez Vásquez', Usuario: 'jsanchez', Rol: 'Operador', Area: 'Calidad' },
];

/** Catálogos del Anexo A (las descripciones vacías las completa Control Documentario). */
var SEMILLA_CATALOGOS = {
  Fase: [['F1', 'Fase 1 - Revisión de perfil'], ['F2', 'Fase 2 - Estudio definitivo de ingeniería y construcción'],
    ['F3', 'Fase 3 - Construcción'], ['GB', 'Global'], ['TC', 'Transferencia de conocimiento']],
  Especialidad: [['DRB', ''], ['EST', ''], ['MVT', ''], ['TRF', ''], ['TOP', 'Topografía']],
  Tramo: [['GLB', 'Global'], ['EMD', ''], ['PTS', '']],
  Tipo_Documento: [['RGI', ''], ['PRC', 'Protocolo'], ['HOJ', ''], ['FCH', '']],
  // ---- Listas para llenar protocolos (de "resumen log-acronimos-análisis")
  // Partida: [n°, partida]. El acrónimo CPC lo elige el usuario al llenar el protocolo.
  Partida: [['01', 'GEOTEXTIL NO TEJIDO CLASE 1'], ['02', 'ENROCADO DE PROTECCIÓN'],
    ['03', 'ENROCADO D50 = 50 CM CON CONCRETO'], ['04', 'MURO DE CONCRETO CICLÓPEO F\'C = 280 KG/CM² + 60% PG (10")'],
    ['05', 'EXCAVACIÓN NO CLASIFICADA PARA ESTRUCTURAS'], ['06', 'CONCRETO PARA PREPARACIÓN DE CIMENTACIONES'],
    ['07', 'ENCOFRADO Y DESENCOFRADO'], ['08', 'CONCRETO F\'C = 280 KG/CM²'],
    ['09', 'JUNTA DE DILATACIÓN CON WATERSTOP (INCLUYE SELLADO)'], ['10', 'ACERO DE REFUERZO FY = 4200 KG/CM²'],
    ['11', 'CONCRETO DE NIVELACIÓN'], ['12', 'DESCABEZADO DE PILOTE'],
    ['13', 'EXCAVACIÓN CLASIFICADA EN MATERIAL SUELTO'], ['14', 'DEMOLICIONES'], ['15', 'EXCAVACIÓN CLASIFICADA'],
    ['16', 'RELLENO PARA ESTRUCTURAS'], ['17', 'RELLENO GRANULAR CON MATERIAL DE CANTERA'], ['18', 'SUBBASE GRANULAR'],
    ['19', 'PAVIMENTO DE CONCRETO HIDRÁULICO F\'C = 280 KG/CM²'], ['20', 'MARCAS EN EL PAVIMENTO'],
    ['21', 'BACHEO SUPERFICIAL (E = 3 CM)'], ['22', 'PODIO DE CONCRETO PARA SEMÁFOROS'], ['23', 'CIMENTACIÓN DE ZAPATA']],
  Acronimo: [['EXCNC', 'EXCAVACIÓN NO CLASIFICADA'], ['RG', 'RELLENO GRANULAR'], ['SB', 'SUBBASE'], ['BG', 'BASE GRANULAR'],
    ['MEJ', 'MEJORAMIENTO DEL SUELO'], ['IMP', 'IMPRIMACIÓN CON MC-30'], ['RLIG', 'RIEGO DE LIGA'], ['MASF', 'MORTERO ASFALTICO TIPO II'],
    ['PAVRIG', 'PAVIMENTO DE CONCRETO HIDRAULICO'], ['PAVFLEX', 'PAVIMENTO DE CONCRETO ASFALTICO EN CALIENTE'],
    ['JTRN', 'JUNTA TRANSVERSAL DE PAVIMIENTO (SIN ACERO)'], ['JLONG', 'JUNTA LONGITUDINAL DE PAVIMENTO (SIN ACERO)'],
    ['AJT', 'ACERO PARA JUNTA TRANSVERSAL'], ['AJL', 'ACERO PARA JUNTA LONGITUDINAL'], ['BACH', 'BACHEO'], ['SHORIZ', 'MARCAS EN EL PAVIMENTO'],
    ['SVERT', 'SEÑALIZACIÓN VERTICAL'], ['BSEGV', 'BARRERAS DE SEGURIDAD VIAL'], ['BSEGP', 'BARRERAS DE SEGURIDAD SOBRE PUENTE'],
    ['TERR', 'TERRAPLENES'], ['SR', 'SUB RASANTE'], ['DEM', 'DEMOLICION'], ['REST', 'RELLENO ESTRUCTURAL'], ['PIL', 'PILOTES'],
    ['MPIL', 'MICRO PILOTES'], ['MCONT', 'MUROS DE CONTENCIÓN'], ['MPANT', 'MURO PANTALLA'], ['SREF', 'SUELO REFORZADO'], ['GMALL', 'GEOMALLA'],
    ['MBER', 'MURO TIPO BERLINES'], ['CPREM', 'CONCRETO PREMEZCLADO'], ['CCIC', 'CONCRETO CICLOPEO'], ['ACE', 'ACERO DE REFUERZO'],
    ['GCOMP', 'GEOCOMPUESTO DE DRENAJE'], ['GMB', 'GEOMEMBRANA'], ['GTX', 'GEOTEXTIL'], ['ENC', 'ENCOFRADO'], ['TDREN', 'TUBO DE DRENAJE'],
    ['TPERF', 'TUBO PERFORADO'], ['PB', 'PINTURA BITUMINOSA'], ['PRE', 'PRE ESFORZADO (PRE TENSADO)'], ['JLOSA', 'JUNTA LOSA DE APROXIMACION'],
    ['JD', 'JUNTA DE DILATACIÓN LOSA DE FONDO'], ['JC', 'JUNTA DE CONTRACCIÓN LOSA DE FONDO'], ['JCONS', 'JUNTA DE CONSTRUCCIÓN LOSA DE FONDO'],
    ['AIS', 'AISLADOR ANTISISMICO'], ['PEST', 'POLI ESTIRENO'], ['JTRANS', 'JUNTAS TRANSFLEX'], ['JBARR', 'JUNTAS BARRERA DE SEGURIDAD'],
    ['PANC', 'PERNOS DE ANCLAJE'], ['GROU', 'GROUTING'], ['EMP', 'EMPALMES METALICOS'], ['POST', 'POSTENSADO DE LOSA'],
    ['MONT', 'MONTAJE DE ESTRUCTURA METALICA'], ['PCARG', 'PRUEBA DE CARGA DE ESTRUCTURA'], ['ANEO', 'APOYO DE NEOPRENO'], ['WSTOP', 'WATER STOP'],
    ['CHIDRO', 'CORDON HIDROEXPANSIVO CONTINUO'], ['IMPER', 'SISTEMA DE IMPERMABILIZACIÓN EN LOSA DE CUBIERTA'], ['ENR', 'ENROCADO DE DEFENSA RIBEREÑA'],
    ['TPVC', 'TUBERIA PVC'], ['CARE', 'CAMA DE ARENA'], ['RARE', 'RELLENO DE ARENA PARA ZANJA DE DRENAJE'], ['RPRO', 'RELLENO DE MATERIAL PROPIO'],
    ['RSELE', 'RELLENO DE MATERIAL SELECCIONADO'], ['SUM', 'INSTALACION DE SUMIDERO CON REJILLA'], ['CUN', 'INSTALACIÓN DE CUNETA O ALCANTARILLA'],
    ['RNER', 'INSTALACIÓN DE REJILLA NERVADA'], ['ARQ', 'INSTALACIÓN DE ARQUETA'], ['EQBOM', 'EQUIPAMIENTO DE SISTEMA DE BOMBEO'],
    ['IMPM', 'IMPERMEABILIZACIÓN DE MUROS'], ['PVAC', 'POST VACIADO'], ['APE', 'APEOS PARA MONTAJE DE PUENTE'],
    // Adicionales usados en el LOG (descripción por confirmar)
    ['GNT1', 'GEOTEXTIL NO TEJIDO CLASE 1', 'LOG'], ['CON', 'CONCRETO', 'LOG'], ['COM', '(por confirmar)', 'LOG'], ['CPRE', '(por confirmar; CPREM truncado)', 'LOG'],
    ['CONH', 'CONCRETO PODIO', 'LOG'], ['ANC', 'ANCLAJE', 'LOG'], ['DEPC', 'DESCABEZADO DE PILOTE', 'LOG']],
  // Disciplina: código = Especialidad del Anexo A; descripción = lo que se escribe en ESPECIALIDAD de la ficha
  // Localización (hoja LOCALIZACION del Excel resumen, 14/11)
  Localizacion: [['L01', 'RÍO RÍMAC - MI (MARGEN IZQUIERDA)'], ['L02', 'RÍO RÍMAC - MD (MARGEN DERECHA)'], ['L03', 'RÍO RÍMAC - CAUCE'],
    ['L04', 'MURO MN01 - TRAMO 1'], ['L05', 'MURO MN01 - TRAMO 2'], ['L06', 'MURO MN01 - TRAMO 3'],
    ['L07', 'MURO MN03 - TRAMO 1'], ['L08', 'MURO MN03 - TRAMO 2'], ['L09', 'ESTRIBO 1'], ['L10', 'ESTRIBO 2'],
    ['L11', 'AV. MORALES DUÁREZ'], ['L12', 'AV. MORALES DUÁREZ - LADO ESTE'], ['L13', 'AV. MORALES DUÁREZ - LADO OESTE'],
    ['L14', 'AV. SANTA ROSA'], ['L15', 'INT. AV. MORALES DUÁREZ - AV. SANTA ROSA']],
  // Ubicación: solo 3 opciones
  Ubicacion: [['U01', 'RÍO RÍMAC'], ['U02', 'EJE VIAL MORALES DUÁREZ'], ['U03', 'EJE VIAL SANTA ROSA']],
  Disciplina: [['DRB', 'GEOTECNIA'], ['EST', 'ESTRUCTURAS'], ['MVT', 'MOVIMIENTO DE TIERRAS'], ['TRF', 'GESTIÓN DE TRÁFICO'], ['TOP', 'TOPOGRAFÍA']],
};

/**
 * Series vigentes (Fase-Especialidad-Tramo-Tipo) y su área. Arrancan en 0; la carga de DATA
 * (códigos ya usados) ajusta los contadores. Topografía: solo la ve el asistente (o usuarios del área).
 */
var SEMILLA_SERIES = [
  ['F2-DRB-GLB-RGI', 'Calidad'], ['F2-EST-EMD-RGI', 'Calidad'], ['F2-EST-PTS-RGI', 'Calidad'], ['F2-MVT-EMD-RGI', 'Calidad'],
  ['F2-MVT-GLB-RGI', 'Calidad'], ['F2-MVT-PTS-RGI', 'Calidad'], ['F2-TRF-GLB-RGI', 'Calidad'],
  ['F2-TOP-EMD-RGI', 'Topografía'], ['F2-TOP-GLB-RGI', 'Topografía'], ['F2-TOP-GLB-HOJ', 'Topografía'],
  ['F2-TOP-PTS-RGI', 'Topografía'], ['F2-TOP-GLB-FCH', 'Topografía'],
];

function setup() {
  var props = PropertiesService.getScriptProperties();
  var dueno = Session.getEffectiveUser().getEmail().toLowerCase();

  // 1. Carpetas en Drive
  // Ambiente de PRUEBAS (copia independiente de la app): sus carpetas y hoja llevan " (PRUEBAS)" en el nombre
  var suf = props.getProperty('ENTORNO') === 'PRUEBAS' ? ' (PRUEBAS)' : '';
  var raiz = obtenerOCrearCarpeta_(props, 'ROOT_ID', null, 'PSR2 Calidad - Sistema' + suf);
  obtenerOCrearCarpeta_(props, 'FINALES_ID', raiz, 'Finales');
  obtenerOCrearCarpeta_(props, 'PLANTILLAS_ID', raiz, 'Plantillas');
  obtenerOCrearCarpeta_(props, 'TEMPORAL_ID', raiz, 'Temporal');

  // 2. Hoja de cálculo
  var ss;
  var ssId = props.getProperty('SS_ID');
  if (ssId) {
    ss = SpreadsheetApp.openById(ssId);
  } else {
    ss = SpreadsheetApp.create('PSR2 Calidad - Base de datos' + suf);
    DriveApp.getFileById(ss.getId()).moveTo(raiz);
    props.setProperty('SS_ID', ss.getId());
  }
  ss.setSpreadsheetTimeZone('America/Lima');

  Object.keys(HEADERS).forEach(function (nombre) {
    var sh = ss.getSheetByName(nombre) || ss.insertSheet(nombre);
    var h = HEADERS[nombre];
    if (sh.getMaxColumns() < h.length) sh.insertColumnsAfter(sh.getMaxColumns(), h.length - sh.getMaxColumns());
    sh.getRange(1, 1, sh.getMaxRows(), h.length).setNumberFormat('@');
    sh.getRange(1, 1, 1, h.length).setValues([h]).setFontWeight('bold').setBackground('#1f3a5f').setFontColor('#ffffff');
    sh.setFrozenRows(1);
  });
  var hoja1 = ss.getSheetByName('Hoja 1') || ss.getSheetByName('Sheet1');
  if (hoja1 && ss.getSheets().length > 1) ss.deleteSheet(hoja1);

  // Protección: solo el dueño puede editar (aunque nadie más tiene acceso al archivo).
  ss.getSheets().forEach(function (sh) {
    if (sh.getProtections(SpreadsheetApp.ProtectionType.SHEET).length) return;
    var p = sh.protect().setDescription('Solo vía aplicación');
    p.getEditors().forEach(function (ed) { if (ed.getEmail().toLowerCase() !== dueno) p.removeEditor(ed); });
  });

  // 3. Secreto de sesión
  if (!props.getProperty('SESSION_SECRET')) props.setProperty('SESSION_SECRET', Utilities.getUuid() + Utilities.getUuid());

  __ss = ss;
  var ahora = iso_();
  var P = SEMILLA_PROYECTO.ID_Proyecto;

  // 4. Proyecto
  if (!buscarProyecto_(P)) {
    var p = { ID_Proyecto: P, Nombre: SEMILLA_PROYECTO.Nombre, Empresa: SEMILLA_PROYECTO.Empresa, Activo: 'TRUE', Fecha_Alta: ahora, Cliente: SEMILLA_PROYECTO.Cliente };
    for (var k in PARAMS_PROYECTO) p[k] = PARAMS_PROYECTO[k];
    agregar_(SH.PROYECTOS, [p]);
  }

  // 5. Usuarios: Propietario (global) + semilla con acceso a PSR2
  var correos = {};
  var usuarios = leer_(SH.USUARIOS);
  usuarios.forEach(function (u) { correos[correo_(u.Correo)] = true; });
  var hayPropietario = usuarios.some(function (u) { return u.Rol_Global === ROL.PROPIETARIO; });
  var nuevosU = [];
  var nuevosA = [];
  if (!hayPropietario && !correos[dueno]) {
    nuevosU.push({ Correo: dueno, Nombre: 'Carlos', Usuario: 'carlos', Rol_Global: ROL.PROPIETARIO, Activo: 'TRUE', Fecha_Alta: ahora, Alta_Por: 'setup' });
    correos[dueno] = true;
  }
  SEMILLA_USUARIOS.forEach(function (u) {
    if (correos[u.Correo] || buscarPorUsuario_(u.Usuario)) return; // ya existe (por identificador o por usuario)
    nuevosU.push({ Correo: u.Correo, Nombre: u.Nombre, Usuario: u.Usuario, Rol_Global: '', Activo: 'TRUE', Fecha_Alta: ahora, Alta_Por: 'setup' });
    nuevosA.push({ Correo: u.Correo, Proyecto: P, Rol: u.Rol, Area: u.Area, Activo: 'TRUE', Fecha_Alta: ahora, Alta_Por: 'setup' });
  });
  agregar_(SH.USUARIOS, nuevosU);
  agregar_(SH.ACCESOS, nuevosA);

  // 5b. Credenciales: cada usuario sin contraseña recibe usuario + contraseña temporal (la cambia al primer ingreso).
  // Se muestran SOLO en el registro de ejecución de este setup (lo ve hcat) para entregarlas a cada persona.
  var credenciales = [];
  leer_(SH.USUARIOS).forEach(function (u) {
    if (u.Clave_Hash) return;
    if (!u.Usuario) u.Usuario = usuarioLibre_(u.Nombre.split(' ')[0], u.Correo);
    var temporal = claveTemporal_();
    ponerClave_(u, temporal, true);
    actualizar_(SH.USUARIOS, u);
    credenciales.push({ Nombre: u.Nombre, Usuario: u.Usuario, Clave_Temporal: temporal });
  });

  // 6. Catálogos
  var cat = {};
  leer_(SH.CATALOGOS).forEach(function (c) { if (c.Proyecto === P) cat[c.Tipo + '|' + c.Codigo] = true; });
  var nuevosC = [];
  Object.keys(SEMILLA_CATALOGOS).forEach(function (tipo) {
    SEMILLA_CATALOGOS[tipo].forEach(function (x) {
      if (!cat[tipo + '|' + x[0]]) nuevosC.push({ Proyecto: P, Tipo: tipo, Codigo: x[0], Descripcion: x[1], Activo: 'TRUE', Relacion: x[2] || '' });
    });
  });
  agregar_(SH.CATALOGOS, nuevosC);

  // 7. Series
  var seriesExist = {};
  leer_(SH.SERIES).forEach(function (s) { if (s.Proyecto === P) seriesExist[s.Codigo_Serie] = true; });
  agregar_(SH.SERIES, SEMILLA_SERIES.filter(function (c) { return !seriesExist[c[0]]; }).map(function (c) {
    var x = c[0].split('-');
    return { Codigo_Serie: c[0], Proyecto: P, Fase: x[0], Especialidad: x[1], Tramo: x[2], Tipo_Documento: x[3],
      Prefijo_Completo: [P, x[0], SEMILLA_PROYECTO.Empresa, x[1], x[2], x[3]].join('-'), Ultimo_Correlativo: '0', Activa: 'TRUE', Descripcion: '', Area: c[1] };
  }));

  agregar_(SH.HISTORIAL, [{ ID: uid_(), Fecha_Hora: ahora, Usuario: dueno, Accion: 'Instalación', Codigo_Completo: '', Serie: '', Correlativo: '',
    Estado_Resultante: 'OK', Detalle: 'setup() ejecutado. Versión ' + APP.VERSION, Proyecto: P }]);

  console.log('Listo. Base de datos: ' + ss.getUrl());
  console.log('Carpeta: ' + raiz.getUrl());
  console.log('Propietario: ' + dueno);
  if (credenciales.length) {
    console.log('USUARIOS Y CONTRASEÑAS TEMPORALES (entregar a cada persona; la cambian al primer ingreso):');
    credenciales.forEach(function (c) { console.log('  ' + c.Nombre + ' → usuario: ' + c.Usuario + ' · contraseña temporal: ' + c.Clave_Temporal); });
  }
  return credenciales;
}

/**
 * AMBIENTE DE PRUEBAS: en el proyecto de Apps Script de pruebas (no en el real) ejecutar esta función en lugar de setup.
 * Crea su propia hoja y carpeta con " (PRUEBAS)" en el nombre; los datos no se mezclan con la app real.
 */
function setupPruebas() {
  var props = PropertiesService.getScriptProperties();
  var ent = props.getProperty('ENTORNO');
  if (props.getProperty('SS_ID') && ent !== 'PRUEBAS') throw new Error('Este proyecto ya tiene datos de la app REAL: setupPruebas solo va en el proyecto de pruebas.');
  props.setProperty('ENTORNO', 'PRUEBAS');
  return setup();
}

/**
 * CARGA INICIAL (ejecutar desde el editor con la cuenta hcat, después de setup / setupPruebas):
 *  0) Subir a Drive la carpeta "CARGA INICIAL" (con 1-FORMATOS y 2-LOG); sirve una sola vez para real y pruebas.
 *  1) Función "cargaInicial" → Ejecutar: registra los formatos de a 10 por ejecución. Repetir hasta que diga
 *     "FORMATOS COMPLETOS" (lo ya cargado se salta; no duplica).
 *  2) Función "cargaInicialLog" → Ejecutar: carga el LOG (si ya estaba, no duplica).
 * Usa la misma lógica que la app (Administración → Formatos y LOG → Cargar LOG). El registro muestra cada paso con su tiempo.
 */
function carpetaCarga_() {
  var raiz = DriveApp.getFolderById(prop_('ROOT_ID'));
  var it = raiz.getFoldersByName('CARGA INICIAL');
  if (!it.hasNext()) it = DriveApp.getFoldersByName('CARGA INICIAL'); // también si se subió a otra carpeta del Drive
  if (!it.hasNext()) throw new Error('No está la carpeta "CARGA INICIAL" en el Drive de esta cuenta. Súbela y vuelve a ejecutar.');
  var carga = it.next();
  return { carpeta: carga, sub: function (n) { var x = carga.getFoldersByName(n); return x.hasNext() ? x.next() : null; } };
}

function ctxPropietario_() {
  return contextoPara_(Session.getEffectiveUser().getEmail().toLowerCase(), SEMILLA_PROYECTO.ID_Proyecto);
}

function cargaInicial() {
  var t0 = Date.now(), LOTE = 10, LIMITE_MS = 4 * 60 * 1000;
  var seg = function () { return ((Date.now() - t0) / 1000).toFixed(1) + ' s'; };
  console.log('Ambiente: ' + (PropertiesService.getScriptProperties().getProperty('ENTORNO') || 'REAL') + ' · buscando la carpeta CARGA INICIAL…');
  var c = carpetaCarga_();
  var fFor = c.sub('1-FORMATOS');
  if (!fFor) throw new Error('Falta la subcarpeta 1-FORMATOS dentro de CARGA INICIAL.');
  var ctx = ctxPropietario_();
  var ya = {};
  formatosDe_(ctx.proyecto).forEach(function (f) { ya[f.Codigo_Formato] = true; });
  var archivos = [], fi = fFor.getFiles();
  while (fi.hasNext()) archivos.push(fi.next());
  archivos.sort(function (a, b) { return a.getName() < b.getName() ? -1 : 1; });
  console.log('Archivos en 1-FORMATOS: ' + archivos.length + ' · ya registrados: ' + Object.keys(ya).length + ' (' + seg() + ')');
  var hechos = 0, pendientes = 0, avisos = [];
  for (var i = 0; i < archivos.length; i++) {
    var a = archivos[i], nom = a.getName();
    var m = /(PSR2-[A-Z0-9]+-[A-Z0-9]+-[A-Z0-9]+-[A-Z0-9]+-FOR-\d{4})/i.exec(nom);
    if (!m) { avisos.push('Sin código FOR en el nombre, no se cargó: ' + nom); continue; }
    var cod = m[1].toUpperCase();
    if (ya[cod]) continue;
    if (a.getMimeType() !== MIME_XLSX) { avisos.push(cod + ': no es .xlsx (' + a.getMimeType() + '). Súbelo de nuevo como archivo Excel.'); continue; }
    if (hechos >= LOTE || Date.now() - t0 > LIMITE_MS) { pendientes++; continue; }
    console.log('→ ' + cod + ': leyendo (' + Math.round(a.getSize() / 1024) + ' KB)… ' + seg());
    var b64 = Utilities.base64Encode(a.getBlob().getBytes());
    console.log('  registrando… ' + seg());
    var f = guardarFormato_(ctx, { Codigo_Formato: cod, archivo: { nombre: cod + '.xlsx', mime: MIME_XLSX, base64: b64 } });
    ya[cod] = true; hechos++;
    console.log('  ✓ ' + (f.Nombre || '(sin título)') + ' · ' + seg());
  }
  avisos.forEach(function (t) { console.warn(t); });
  console.log('Formatos registrados en esta ejecución: ' + hechos + ' · total en la app: ' + Object.keys(ya).length + ' (' + seg() + ')');
  if (pendientes) console.warn('Faltan ' + pendientes + ' formatos: vuelve a ejecutar cargaInicial (no duplica).');
  else console.log('FORMATOS COMPLETOS. Siguiente: ejecutar cargaInicialLog.');
  return { hechos: hechos, total: Object.keys(ya).length, pendientes: pendientes, avisos: avisos };
}

function cargaInicialLog() {
  var t0 = Date.now();
  var seg = function () { return ((Date.now() - t0) / 1000).toFixed(1) + ' s'; };
  var c = carpetaCarga_();
  var fLog = c.sub('2-LOG');
  if (!fLog) throw new Error('Falta la subcarpeta 2-LOG dentro de CARGA INICIAL.');
  var li = fLog.getFiles(), xl = null;
  while (li.hasNext()) { var x = li.next(); if (x.getMimeType() === MIME_XLSX) { xl = x; break; } }
  if (!xl) throw new Error('No hay un .xlsx en 2-LOG.');
  var ctx = ctxPropietario_();
  console.log('LOG: leyendo ' + xl.getName() + ' (' + Math.round(xl.getSize() / 1024) + ' KB)… ' + seg());
  var b64 = Utilities.base64Encode(xl.getBlob().getBytes());
  console.log('LOG: revisando filas… ' + seg());
  var prev = previsualizarLog_(ctx, { base64: b64, nombre: xl.getName() });
  console.log('LOG: ' + prev.cargar + ' filas por cargar, ' + prev.observadas + ' observadas, ' + prev.omitidas + ' ya estaban (' + seg() + ')');
  if (!prev.cargar) { console.log('LOG YA ESTABA CARGADO.'); return prev; }
  console.log('LOG: guardando… ' + seg());
  var r = ejecutarLog_(ctx, { base64: b64, nombre: xl.getName() });
  console.log('LOG CARGADO: ' + r.filas + ' filas (' + r.observadas + ' observadas), ' + r.codigos + ' códigos · contadores: ' + (r.ajustes.join(', ') || 'sin cambios') + ' (' + seg() + ')');
  return r;
}

/**
 * REVISIÓN DE IMPRESIÓN: genera el PDF (como lo arma la app) de cada formato aprobado, vacío, en la carpeta
 * "REVISIÓN PDF" dentro de la carpeta del sistema, para revisar de una vez que ninguno se salga de la hoja.
 * Ejecutar desde el editor; hace hasta 8 por ejecución (repetir hasta "REVISIÓN COMPLETA"). Para rehacerlos, borra la carpeta.
 */
function revisarPdfs() {
  var t0 = Date.now(), LOTE = 8, LIMITE_MS = 4 * 60 * 1000;
  var raiz = DriveApp.getFolderById(prop_('ROOT_ID'));
  var it = raiz.getFoldersByName('REVISIÓN PDF');
  var dest = it.hasNext() ? it.next() : raiz.createFolder('REVISIÓN PDF');
  var ya = {}, fi = dest.getFiles();
  while (fi.hasNext()) ya[fi.next().getName()] = true;
  var hechos = 0, pendientes = 0;
  formatosDe_(SEMILLA_PROYECTO.ID_Proyecto).filter(function (f) { return f.Plantilla_Tipo === 'xlsx' && esTrue_(f.Activo); })
    .sort(function (a, b) { return a.Codigo_Formato < b.Codigo_Formato ? -1 : 1; })
    .forEach(function (f) {
      var nombre = f.Codigo_Formato.split('-').slice(-3).join('-') + ' · ' + (f.Nombre || '') + '.pdf';
      if (ya[nombre]) return;
      if (hechos >= LOTE || Date.now() - t0 > LIMITE_MS) { pendientes++; return; }
      var blob = DriveApp.getFileById(f.Plantilla_ID).getBlob();
      var fi2 = abrirFicha_(Utilities.newBlob(blob.getBytes(), MIME_XLSX, 'x.xlsx'));
      var bytes = xlsxAPdf_(Utilities.newBlob(blob.getBytes(), MIME_XLSX, 'x.xlsx'), fi2.posicion || 0, !!fi2.horizontal);
      dest.createFile(Utilities.newBlob(bytes, 'application/pdf', nombre));
      hechos++;
      console.log('✓ ' + nombre + ' (' + ((Date.now() - t0) / 1000).toFixed(1) + ' s)');
    });
  console.log('PDF generados ahora: ' + hechos + (pendientes ? ' · faltan ' + pendientes + ': vuelve a ejecutar revisarPdfs' : ' · REVISIÓN COMPLETA'));
  console.log('Carpeta: ' + dest.getUrl());
}

function obtenerOCrearCarpeta_(props, clave, padre, nombre) {
  var id = props.getProperty(clave);
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) { /* se recrea */ }
  }
  var c = padre ? padre.createFolder(nombre) : DriveApp.createFolder(nombre);
  props.setProperty(clave, c.getId());
  return c;
}

/** Mantenimiento: vacía la carpeta Temporal (copias de plantillas que hubieran quedado). Puede programarse diario. */
function limpiarTemporal() {
  var it = DriveApp.getFolderById(prop_('TEMPORAL_ID')).getFiles();
  while (it.hasNext()) it.next().setTrashed(true);
}

/** Diagnóstico rápido desde el editor. */
function diagnostico() {
  console.log(JSON.stringify({
    ss: prop_('SS_ID'), proyectos: leer_(SH.PROYECTOS).map(function (p) { return p.ID_Proyecto; }),
    usuarios: leer_(SH.USUARIOS).length, accesos: leer_(SH.ACCESOS).length, series: leer_(SH.SERIES).length, registros: leer_(SH.REGISTROS).length,
  }, null, 2));
}
