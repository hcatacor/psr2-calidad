/**
 * Configuración general — PSR2 Calidad (multiproyecto).
 * Codificación (Anexo A): PROYECTO-FASE-EMPRESA-ESPECIALIDAD-TRAMO-TIPO-CORRELATIVO
 *                         PSR2   -F2  -CPC    -TOP         -GLB  -PRC -0001
 * Ingreso con usuario y contraseña propios de la app (ver Auth.js): no requiere Google Cloud ni ID de cliente.
 */

var APP = {
  NOMBRE: 'PSR2 Calidad',
  VERSION: '1.1.0',
  SESION_HORAS: 12,
  MAX_ARCHIVO_MB: 20,
  MAX_GENERAR: 10,
  MAX_IMPORTAR: 5000,
};

/** Roles. Propietario y Coordinador General son GLOBALES (todos los proyectos); el resto es por proyecto. */
var ROL = {
  VISITANTE: 'Visitante',
  OPERADOR: 'Operador',
  AUDITOR: 'Auditor',
  CONTROL_DOC: 'Control Documentario',
  JEFE: 'Jefe de Área',
  COORDINADOR: 'Coordinador General',
  PROPIETARIO: 'Propietario',
};
var ROLES_GLOBALES = [ROL.PROPIETARIO, ROL.COORDINADOR];
var ROLES_PROYECTO = [ROL.VISITANTE, ROL.OPERADOR, ROL.AUDITOR, ROL.CONTROL_DOC, ROL.JEFE];

/** Jerarquía: solo se gestionan usuarios de nivel inferior al propio. */
var NIVEL = {};
NIVEL[ROL.VISITANTE] = 0;
NIVEL[ROL.OPERADOR] = 1;
NIVEL[ROL.AUDITOR] = 1;
NIVEL[ROL.CONTROL_DOC] = 2;
NIVEL[ROL.JEFE] = 3;
NIVEL[ROL.COORDINADOR] = 4;
NIVEL[ROL.PROPIETARIO] = 5;

/** Capacidades → roles que las tienen. */
var CAPACIDADES = {
  generar: [ROL.OPERADOR, ROL.CONTROL_DOC, ROL.JEFE, ROL.COORDINADOR, ROL.PROPIETARIO],   // generar/liberar/reutilizar propios, cargar finales propios
  auditar: [ROL.AUDITOR, ROL.JEFE, ROL.COORDINADOR, ROL.PROPIETARIO],                     // validar/observar formatos finales
  historial: [ROL.AUDITOR, ROL.CONTROL_DOC, ROL.JEFE, ROL.COORDINADOR, ROL.PROPIETARIO],  // integridad e historial completo
  documentar: [ROL.CONTROL_DOC, ROL.JEFE, ROL.COORDINADOR, ROL.PROPIETARIO],              // catálogos, series, cambio de fase, carga inicial, contador, exportar
  administrar: [ROL.JEFE, ROL.COORDINADOR, ROL.PROPIETARIO],                              // usuarios, reasignar, parámetros del proyecto
  plantillas: [ROL.PROPIETARIO],                                                          // formatos aprobados: solo el Propietario
  propietario: [ROL.PROPIETARIO],                                                         // crear proyectos, actuar sobre códigos ajenos
};

var ESTADO = { ACTIVO: 'Activo', LIBERADO: 'Liberado' };

var DOC = {
  PENDIENTE: 'Pendiente',   // código generado, sin formato final cargado
  CARGADO: 'Cargado',       // final cargado, por validar
  VALIDADO: 'Validado',     // aprobado por auditor
  OBSERVADO: 'Observado',   // devuelto al operador con observación
  HISTORICO: 'Histórico',   // código usado antes del sistema (importado), sin archivo
};

/** Componentes de la codificación administrados como catálogo (por proyecto). */
var TIPOS_CATALOGO = ['Fase', 'Especialidad', 'Tramo', 'Tipo_Documento'];
/** Listas para llenar protocolos: partidas, acrónimos CPC y especialidad/disciplina de la ficha. */
var TIPOS_CATALOGO_PROTOCOLO = ['Partida', 'Acronimo', 'Disciplina', 'Localizacion', 'Ubicacion'];
/** Listas a las que cualquier usuario que llena protocolos puede agregar una opción desde el formulario. */
var LISTAS_ABIERTAS = { Partida: 'P', Disciplina: 'D', Localizacion: 'L', Ubicacion: 'U' };

/** Área de cada serie: los usuarios sin rol de gestión solo ven y generan en las series de su área. */
var AREAS_SERIE = ['Calidad', 'Topografía'];

var CAMPOS_EDITABLES = ['Actividad', 'Ubicacion', 'PK_Inicial', 'PK_Final', 'Protocolo_Topografico', 'Valorizacion'];

var SH = {
  USUARIOS: 'Usuarios',
  ACCESOS: 'Accesos',
  PROYECTOS: 'Proyectos',
  CATALOGOS: 'Catalogos',
  SERIES: 'Series',
  REGISTROS: 'Registros',
  HISTORIAL: 'Historial',
  FORMATOS: 'Formatos',
  LOG: 'Log',
};

var HEADERS = {};
HEADERS[SH.USUARIOS] = ['Correo', 'Nombre', 'Rol_Global', 'Activo', 'Fecha_Alta', 'Alta_Por',
  'Usuario', 'Clave_Hash', 'Clave_Sal', 'Cambiar_Clave', 'Intentos', 'Bloqueado_Hasta'];
HEADERS[SH.ACCESOS] = ['Correo', 'Proyecto', 'Rol', 'Area', 'Activo', 'Fecha_Alta', 'Alta_Por', 'Carga_Data'];
HEADERS[SH.PROYECTOS] = ['ID_Proyecto', 'Nombre', 'Empresa', 'Activo', 'Dia_Inicio_Ciclo', 'Dia_Fin_Ciclo',
  'Dias_Alerta_Liberado', 'Dias_Alerta_Pendiente', 'Fecha_Alta', 'Cliente'];
HEADERS[SH.CATALOGOS] = ['Proyecto', 'Tipo', 'Codigo', 'Descripcion', 'Activo', 'Relacion'];
HEADERS[SH.SERIES] = ['Codigo_Serie', 'Proyecto', 'Fase', 'Especialidad', 'Tramo', 'Tipo_Documento', 'Prefijo_Completo',
  'Ultimo_Correlativo', 'Activa', 'Descripcion', 'Area'];
HEADERS[SH.REGISTROS] = ['Codigo_Completo', 'Proyecto', 'Serie', 'Correlativo_Numero', 'Usuario', 'Estado', 'Estado_Doc',
  'Actividad', 'Ubicacion', 'PK_Inicial', 'PK_Final', 'Protocolo_Topografico', 'Valorizacion',
  'Origen', 'Creado_Por', 'Fecha_Creacion', 'Modificado_Por', 'Fecha_Modificacion',
  'Motivo_Liberacion', 'Fecha_Liberacion', 'Veces_Reutilizado', 'Usuario_Anterior',
  'Archivo_ID', 'Archivo_Nombre', 'Archivo_Mime', 'Fecha_Carga', 'Cargado_Por',
  'Validado_Por', 'Fecha_Validacion', 'Observacion_Auditor', 'Formato', 'Correlativo_CPC', 'Datos_Formulario'];
/** Biblioteca de formatos aprobados (plantillas). Los sube solo el Propietario. */
HEADERS[SH.FORMATOS] = ['Codigo_Formato', 'Proyecto', 'Nombre', 'Revision', 'Plantilla_ID', 'Plantilla_Nombre', 'Plantilla_Tipo',
  'Plantilla_Mime', 'Activo', 'Fecha_Alta', 'Alta_Por'];
/** LOG de liberaciones de Calidad (columnas A–AC del Excel) + control de la app. */
HEADERS[SH.LOG] = ['ID', 'Proyecto', 'Orden', 'N', 'Codigo_Completo', 'Rev', 'CPC', 'CPC_Original', 'Descripcion', 'Componente', 'Especialidad',
  'Fase', 'Tramo', 'Cliente', 'Partida', 'Localizacion', 'Ubicacion', 'PK_Inicial', 'PK_Final', 'Fecha', 'Capa', 'Protocolo_Topografico',
  'Anexos', 'Planos', 'Valorizacion', 'Estatus', 'Observacion', 'Transmital', 'Fecha_Aconex', 'QC', 'Prefijo_Titulo', 'Titulo_Aconex',
  'Usuario', 'Origen', 'Motivos', 'Corregidos', 'Revisado_Por', 'Fecha_Revision', 'Lote', 'Creado_Por', 'Fecha_Creacion', 'Modificado_Por', 'Fecha_Modificacion'];
HEADERS[SH.HISTORIAL] = ['ID', 'Fecha_Hora', 'Usuario', 'Accion', 'Codigo_Completo', 'Serie', 'Correlativo',
  'Estado_Resultante', 'Detalle', 'Proyecto'];

/** Parámetros por proyecto (columnas de Proyectos) y sus valores por defecto. */
var PARAMS_PROYECTO = {
  Dia_Inicio_Ciclo: '26',
  Dia_Fin_Ciclo: '25',
  Dias_Alerta_Liberado: '7',
  Dias_Alerta_Pendiente: '15',
};

/** Marcadores que se reemplazan en las plantillas al descargar el formato. */
var MARCADORES = ['CODIGO', 'PROYECTO', 'FASE', 'FASE_DESC', 'EMPRESA', 'ESPECIALIDAD', 'ESPECIALIDAD_DESC', 'TRAMO', 'TRAMO_DESC',
  'TIPO_DOCUMENTO', 'TIPO_DESC', 'CORRELATIVO', 'SERIE', 'FECHA', 'USUARIO', 'NOMBRE_USUARIO', 'ACTIVIDAD', 'UBICACION',
  'PK_INICIAL', 'PK_FINAL', 'PROGRESIVA', 'PROTOCOLO', 'VALORIZACION', 'FORMATO', 'FORMATO_NOMBRE'];
