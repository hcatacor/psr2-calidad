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
  var raiz = obtenerOCrearCarpeta_(props, 'ROOT_ID', null, 'PSR2 Calidad - Sistema');
  obtenerOCrearCarpeta_(props, 'FINALES_ID', raiz, 'Finales');
  obtenerOCrearCarpeta_(props, 'PLANTILLAS_ID', raiz, 'Plantillas');
  obtenerOCrearCarpeta_(props, 'TEMPORAL_ID', raiz, 'Temporal');

  // 2. Hoja de cálculo
  var ss;
  var ssId = props.getProperty('SS_ID');
  if (ssId) {
    ss = SpreadsheetApp.openById(ssId);
  } else {
    ss = SpreadsheetApp.create('PSR2 Calidad - Base de datos');
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
