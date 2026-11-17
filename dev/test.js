/**
 * Pruebas de reglas de negocio ejecutando el backend real sobre el simulador.
 * Uso: node dev/test.js
 */
const assert = require('assert');
const { crearEntorno } = require('./gas-mock');

const env = crearEntorno();
env.contexto.setup();

let ok = 0;
const t = (nombre, fn) => {
  try { fn(); ok++; console.log('  ✓ ' + nombre); } catch (e) { console.error('  ✗ ' + nombre + '\n    ' + (e.stack || e).split('\n').slice(0, 3).join('\n    ')); process.exitCode = 1; }
};
const exito = (r) => { if (!r.ok) throw new Error('Se esperaba OK y vino: ' + r.code + ' ' + r.error); return r.data; };
const falla = (r, code) => { assert.strictEqual(r.ok, false, 'Se esperaba error ' + code); if (code) assert.strictEqual(r.code, code, r.error); return r; };

const PROP = 'propietario@usuarios.app', JEFE = 'eduardo@usuarios.app', LES = 'lsalazar@usuarios.app', JEN = 'jsanchez@usuarios.app';
const tk = {};
const DRB = 'PSR2-F2-CPC-DRB-GLB-RGI-';
const S_DRB = 'F2-DRB-GLB-RGI';

console.log('Instalación y acceso');
t('setup: propietario global, 3 usuarios, catálogos del Anexo A y 12 series F2 en 0 (7 Calidad + 5 Topografía)', () => {
  tk.prop = env.login(PROP);
  const b = exito(env.llamar('bootstrap', {}, tk.prop));
  assert.strictEqual(b.usuario.Rol, 'Propietario');
  assert.strictEqual(b.usuarios.length, 4);
  assert.strictEqual(b.usuarios.find((u) => u.Correo === JEFE).Rol, 'Jefe de Área');
  assert.strictEqual(b.series.length, 12);
  assert.strictEqual(b.series.filter((s) => s.Area === 'Topografía').length, 5);
  assert.ok(b.series.some((s) => s.Codigo_Serie === 'F2-TOP-GLB-HOJ'));
  assert.ok(b.series.every((s) => s.Ultimo_Correlativo === '0' && s.Fase === 'F2'));
  assert.strictEqual(b.series.find((s) => s.Codigo_Serie === S_DRB).Prefijo_Completo, 'PSR2-F2-CPC-DRB-GLB-RGI');
  assert.deepStrictEqual(b.catalogos.filter((c) => c.Tipo === 'Fase').map((c) => c.Codigo), ['F1', 'F2', 'F3', 'GB', 'TC']);
  assert.strictEqual(b.config.Empresa, 'CPC');
});
t('setup es idempotente', () => {
  env.contexto.setup();
  const b = exito(env.llamar('bootstrap', {}, tk.prop));
  assert.strictEqual(b.usuarios.length, 4);
  assert.strictEqual(b.series.length, 12);
  assert.strictEqual(b.catalogos.filter((c) => ['Fase', 'Especialidad', 'Tramo', 'Tipo_Documento'].includes(c.Tipo)).length, 17);
  assert.strictEqual(b.catalogos.filter((c) => c.Tipo === 'Partida').length, 23);
  assert.strictEqual(b.config.Cliente, 'PROVIAS NACIONAL');
});
t('ingreso con usuario y contraseña: usuario inexistente o contraseña errada no entran (mismo mensaje)', () => {
  const a = falla(env.llamar('login', { usuario: 'extrano', clave: 'Cualquiera123' }), 'AUTH');
  env.prepararDev(LES);
  const b = falla(env.llamar('login', { usuario: 'lsalazar', clave: 'Equivocada99' }), 'AUTH');
  assert.strictEqual(a.error, b.error, 'no revela si el usuario existe');
  falla(env.llamar('login', { idToken: 'dev:' + LES }), 'AUTH');
});
t('5 intentos fallidos bloquean el usuario; la contraseña nunca se guarda en claro', () => {
  env.prepararDev(JEN);
  for (let i = 0; i < 5; i++) falla(env.llamar('login', { usuario: 'jsanchez', clave: 'mala' + i + 'xx1' }), 'AUTH');
  falla(env.llamar('login', { usuario: 'jsanchez', clave: env.CLAVE_DEV }), 'BLOQUEADO');
  const u = env.contexto.buscarUsuario_(JEN);
  assert.ok(u.Clave_Hash && u.Clave_Hash !== env.CLAVE_DEV && !JSON.stringify(u).includes(env.CLAVE_DEV));
  env.prepararDev(JEN); // desbloquea para el resto de pruebas
});
t('setup entrega usuario + contraseña temporal; con la temporal solo se puede cambiar la contraseña', () => {
  const e2 = crearEntorno(); const cred = e2.contexto.setup();
  assert.deepStrictEqual(JSON.parse(JSON.stringify(cred.map((c) => c.Usuario).sort())), ['carlos', 'eduardo', 'jsanchez', 'lsalazar']);
  const les = cred.find((c) => c.Usuario === 'lsalazar');
  const r = e2.llamar('login', { usuario: 'LSalazar', clave: les.Clave_Temporal });
  assert.ok(r.ok && r.data.cambiarClave === true);
  const r0 = e2.llamar('login', { usuario: 'LSalazar', clave: les.Clave_Temporal, inicio: true });
  assert.strictEqual(r0.data.registros, undefined, 'con la temporal no se entregan códigos');
  falla(e2.llamar('registros.listar', {}, r.data.token), 'CAMBIAR_CLAVE');
  falla(e2.llamar('cuenta.cambiarClave', { actual: les.Clave_Temporal, nueva: 'corta1' }, r.data.token), 'VALIDACION');
  falla(e2.llamar('cuenta.cambiarClave', { actual: les.Clave_Temporal, nueva: 'lsalazar2026' }, r.data.token), 'VALIDACION');
  assert.ok(e2.llamar('cuenta.cambiarClave', { actual: les.Clave_Temporal, nueva: 'Puente2026x' }, r.data.token).ok);
  assert.ok(e2.llamar('registros.listar', {}, r.data.token).ok, 'ya cambió: entra normal');
  falla(e2.llamar('login', { usuario: 'lsalazar', clave: les.Clave_Temporal }), 'AUTH');
  const r2 = e2.llamar('login', { usuario: 'lsalazar', clave: 'Puente2026x' });
  assert.ok(r2.ok && r2.data.cambiarClave === false);
});
t('PRUEBAS usa los usuarios y contraseñas de la real, sin escribir nunca en la real', () => {
  const e = crearEntorno(); const cred = e.contexto.setup(); const c = e.contexto;
  const P = c.PropertiesService.getScriptProperties(), real = P.getProperty('SS_ID');
  const pr = c.DriveApp.getFileById(real).makeCopy('PSR2 Calidad - Base de datos (PRUEBAS)', c.DriveApp.getFolderById(P.getProperty('ROOT_ID')));
  const les = cred.find((x) => x.Usuario === 'lsalazar'), edu = cred.find((x) => x.Usuario === 'eduardo');
  // en la real Lesllye crea su contraseña; Pruebas quedó con la temporal
  const r = e.llamar('login', { usuario: 'lsalazar', clave: les.Clave_Temporal });
  assert.ok(e.llamar('cuenta.cambiarClave', { actual: les.Clave_Temporal, nueva: 'Puente2026x' }, r.data.token).ok);
  const fotoReal = () => JSON.stringify(e.sheetsPorId[real].hojas.filter((h) => ['Usuarios', 'Accesos'].includes(h.nombre)).map((h) => h.datos));
  const antes = fotoReal();
  P.setProperty('SS_ID', pr.getId()); P.setProperty('ENTORNO', 'PRUEBAS'); P.setProperty('SS_ID_REAL', real); c.__ss = null;
  const r2 = e.llamar('login', { usuario: 'lsalazar', clave: 'Puente2026x' });
  assert.ok(r2.ok && r2.data.cambiarClave === false, 'entra a Pruebas con la contraseña de la real');
  falla(e.llamar('login', { usuario: 'lsalazar', clave: les.Clave_Temporal }), 'AUTH');
  falla(e.llamar('cuenta.cambiarClave', { actual: 'Puente2026x', nueva: 'Otra2026xx' }, r2.data.token), 'NEGOCIO');
  falla(e.llamar('usuarios.guardar', { Nombre: 'Karla Prueba', Usuario: 'karla', Clave: 'Karla2026xx', Rol: 'Operador', Area: 'Calidad' }, r2.data.token), 'NEGOCIO');
  const r3 = e.llamar('login', { usuario: 'eduardo', clave: edu.Clave_Temporal });
  assert.ok(!r3.ok && /App real/.test(r3.error), 'con temporal: primero la real');
  assert.strictEqual(fotoReal(), antes, 'la real no se tocó desde Pruebas');
});
t('el jefe restablece la contraseña de un nivel inferior (temporal); no la de su nivel o superior', () => {
  const tj = env.login(JEFE), tl = env.login(LES), tn = env.login(JEN);
  const r = exito(env.llamar('usuarios.restablecerClave', { Correo: LES }, tj));
  assert.strictEqual(r.Usuario, 'lsalazar'); assert.ok(r.Clave_Temporal.length >= 10);
  falla(env.llamar('registros.listar', {}, tl), 'CAMBIAR_CLAVE');
  falla(env.llamar('usuarios.restablecerClave', { Correo: PROP }, tj), 'PERMISO');
  falla(env.llamar('usuarios.restablecerClave', { Correo: JEFE }, tn), 'PERMISO');
  env.prepararDev(LES);
});
t('alta sin correo: nombre completo + usuario + contraseña inicial; la API nunca devuelve el hash', () => {
  const tj = env.login(JEFE);
  const r = exito(env.llamar('usuarios.guardar', { Nombre: 'Jonathan Camarena', Usuario: 'jcamarena', Clave: 'Inicio2026', Rol: 'Operador', Area: 'Calidad', Activo: true }, tj));
  assert.strictEqual(r.Usuario, 'jcamarena'); assert.strictEqual(r.Clave_Temporal, 'Inicio2026');
  assert.ok(!('Clave_Hash' in r) && !('Clave_Sal' in r));
  falla(env.llamar('usuarios.guardar', { Nombre: 'Otro', Usuario: 'jcamarena', Rol: 'Operador', Area: 'Calidad' }, tj), 'VALIDACION');
  const l = env.llamar('login', { usuario: 'jcamarena', clave: 'Inicio2026' });
  assert.ok(l.ok && l.data.cambiarClave);
  const b = exito(env.llamar('bootstrap', {}, tj));
  assert.ok(!JSON.stringify(b).includes('Clave_Hash') && !JSON.stringify(b).includes('Clave_Sal'));
});
t('sesión manipulada se rechaza', () => {
  tk.les = env.login(LES); tk.jen = env.login(JEN); tk.jefe = env.login(JEFE);
  const [p, f] = tk.les.split('.');
  const falsa = Buffer.from(JSON.stringify({ e: PROP, x: Date.now() + 1e7 })).toString('base64').replace(/\+/g, '-').replace(/\//g, '_') + '.' + f;
  falla(env.llamar('bootstrap', {}, falsa), 'SESION');
  falla(env.llamar('bootstrap', {}, p + '.xxx'), 'SESION');
});

console.log('Correlativos');
t('genera 0001 y luego un lote 0002-0004', () => {
  const a = exito(env.llamar('registros.generar', { serie: S_DRB, campos: { Actividad: 'Cuneta', PK_Inicial: '1+200' } }, tk.les));
  assert.strictEqual(a[0].Codigo_Completo, DRB + '0001');
  const b = exito(env.llamar('registros.generar', { serie: S_DRB, cantidad: 3 }, tk.les));
  assert.deepStrictEqual(b.map((x) => x.Correlativo_Numero), ['2', '3', '4']);
});
t('otro usuario continúa la secuencia sin duplicar', () => {
  assert.strictEqual(exito(env.llamar('registros.generar', { serie: S_DRB }, tk.jen))[0].Codigo_Completo, DRB + '0005');
});
t('cantidad se limita al máximo permitido', () => assert.strictEqual(exito(env.llamar('registros.generar', { serie: 'F2-TRF-GLB-RGI', cantidad: 999 }, tk.jen)).length, 10));
t('fórmula inyectada se guarda como texto', () => {
  const a = exito(env.llamar('registros.generar', { serie: 'F2-MVT-PTS-RGI', campos: { Actividad: '=HYPERLINK("x")' } }, tk.jen));
  const l = exito(env.llamar('registros.listar', {}, tk.jen)).find((r) => r.Codigo_Completo === a[0].Codigo_Completo);
  assert.strictEqual(l.Actividad, '=HYPERLINK("x")');
});
t('Visitante y Auditor no generan', () => {
  exito(env.llamar('usuarios.guardar', { Correo: 'visita@ejemplo.com', Nombre: 'Visita', Rol: 'Visitante', Activo: true }, tk.jefe));
  exito(env.llamar('usuarios.guardar', { Correo: 'audi@ejemplo.com', Nombre: 'Audi', Rol: 'Auditor', Activo: true }, tk.jefe));
  tk.vis = env.login('visita@ejemplo.com'); tk.aud = env.login('audi@ejemplo.com');
  falla(env.llamar('registros.generar', { serie: S_DRB }, tk.vis), 'PERMISO');
  falla(env.llamar('registros.generar', { serie: S_DRB }, tk.aud), 'PERMISO');
});
t('serie cerrada no genera', () => {
  exito(env.llamar('series.guardar', { Codigo_Serie: 'F2-EST-PTS-RGI', Activa: false }, tk.jefe));
  falla(env.llamar('registros.generar', { serie: 'F2-EST-PTS-RGI' }, tk.les), 'NEGOCIO');
  exito(env.llamar('series.guardar', { Codigo_Serie: 'F2-EST-PTS-RGI', Activa: true }, tk.jefe));
});

console.log('Liberar / reutilizar (RN-04, RN-05: liberado = primera opción para cualquiera)');
t('liberar exige motivo', () => falla(env.llamar('registros.liberar', { codigo: DRB + '0002', motivo: '' }, tk.les), 'VALIDACION'));
t('solo el dueño libera (otro operador no)', () => falla(env.llamar('registros.liberar', { codigo: DRB + '0002', motivo: 'anulado' }, tk.jen), 'PERMISO'));
t('dueño libera', () => assert.strictEqual(exito(env.llamar('registros.liberar', { codigo: DRB + '0002', motivo: 'Actividad reprogramada' }, tk.les)).Estado, 'Liberado'));
t('el liberado es la primera opción para CUALQUIER usuario al generar en la serie', () => {
  const r = exito(env.llamar('registros.generar', { serie: S_DRB }, tk.jen))[0];
  assert.strictEqual(r.Codigo_Completo, DRB + '0002');
  assert.strictEqual(r.Estado, 'Activo');
  assert.strictEqual(r.Veces_Reutilizado, '1');
  assert.strictEqual(r.Usuario, JEN);
  assert.strictEqual(r.Usuario_Anterior, LES);
});
t('con varios liberados, se toma el de número más bajo; luego sigue la numeración', () => {
  exito(env.llamar('registros.liberar', { codigo: DRB + '0004', motivo: 'no se usó' }, tk.les));
  exito(env.llamar('registros.liberar', { codigo: DRB + '0003', motivo: 'no se usó' }, tk.les));
  const g = exito(env.llamar('registros.generar', { serie: S_DRB, cantidad: 3 }, tk.les));
  assert.deepStrictEqual(g.map((x) => x.Correlativo_Numero), ['3', '4', '6']);
});
t('administrador (Jefe de Área) libera un código ajeno; queda anotado y libre para todos', () => {
  exito(env.llamar('registros.liberar', { codigo: DRB + '0005', motivo: 'Separado y no llenado' }, tk.jefe));
  const h = exito(env.llamar('registros.historial', { codigo: DRB + '0005' }, tk.jefe));
  assert.ok(h[0].Detalle.includes('por administrador'));
  assert.strictEqual(exito(env.llamar('registros.generar', { serie: S_DRB }, tk.les))[0].Codigo_Completo, DRB + '0005');
});

console.log('Formato final y auditoría');
const pdf = Buffer.from('%PDF-1.4 prueba').toString('base64');
t('Visitante no carga formatos', () => falla(env.llamar('archivos.subirFinal', { codigo: DRB + '0001', nombre: 'a.pdf', mime: 'application/pdf', base64: pdf }, tk.vis), 'PERMISO'));
t('tipo de archivo no permitido', () => falla(env.llamar('archivos.subirFinal', { codigo: DRB + '0001', nombre: 'a.exe', mime: 'application/x-msdownload', base64: pdf }, tk.les), 'ARCHIVO'));
t('dueño carga el final → Cargado', () => assert.strictEqual(exito(env.llamar('archivos.subirFinal', { codigo: DRB + '0001', nombre: 'escaneo.pdf', mime: 'application/pdf', base64: pdf }, tk.les)).Estado_Doc, 'Cargado'));
t('con formato cargado ya no se puede liberar', () => falla(env.llamar('registros.liberar', { codigo: DRB + '0001', motivo: 'error' }, tk.les), 'NEGOCIO'));
t('cualquier rol puede ver el final (sin acceso a Drive)', () => {
  assert.strictEqual(Buffer.from(exito(env.llamar('archivos.descargarFinal', { codigo: DRB + '0001' }, tk.vis)).base64, 'base64').toString(), '%PDF-1.4 prueba');
});
t('Operador no valida', () => falla(env.llamar('auditoria.validar', { codigo: DRB + '0001', resultado: 'Validado' }, tk.jen), 'PERMISO'));
t('observar exige texto', () => falla(env.llamar('auditoria.validar', { codigo: DRB + '0001', resultado: 'Observado' }, tk.aud), 'VALIDACION'));
t('auditor observa → vuelve al operador', () => assert.strictEqual(exito(env.llamar('auditoria.validar', { codigo: DRB + '0001', resultado: 'Observado', observacion: 'Falta firma del supervisor' }, tk.aud)).Estado_Doc, 'Observado'));
t('operador recarga → Cargado y se limpia la observación', () => {
  const r = exito(env.llamar('archivos.subirFinal', { codigo: DRB + '0001', nombre: 'v2.pdf', mime: 'application/pdf', base64: pdf }, tk.les));
  assert.strictEqual(r.Estado_Doc, 'Cargado');
  assert.strictEqual(r.Observacion_Auditor, '');
});
t('auditor valida', () => assert.strictEqual(exito(env.llamar('auditoria.validar', { codigo: DRB + '0001', resultado: 'Validado' }, tk.aud)).Estado_Doc, 'Validado'));
t('validado: el operador ya no edita ni reemplaza; el jefe sí edita', () => {
  falla(env.llamar('registros.editar', { codigo: DRB + '0001', campos: { Ubicacion: 'X' } }, tk.les), 'NEGOCIO');
  falla(env.llamar('archivos.subirFinal', { codigo: DRB + '0001', nombre: 'v3.pdf', mime: 'application/pdf', base64: pdf }, tk.les), 'NEGOCIO');
  const r = exito(env.llamar('registros.editar', { codigo: DRB + '0001', campos: { Ubicacion: 'Tramo 1' } }, tk.jefe));
  assert.strictEqual(r.Modificado_Por, JEFE);
});
t('editar registra el detalle del cambio', () => {
  exito(env.llamar('registros.editar', { codigo: DRB + '0003', campos: { Ubicacion: 'Tramo 4' } }, tk.les));
  assert.ok(exito(env.llamar('registros.historial', { codigo: DRB + '0003' }, tk.les))[0].Detalle.includes('Tramo 4'));
});

console.log('Reasignación');
t('jefe reasigna a operador activo', () => {
  const r = exito(env.llamar('registros.reasignar', { codigo: DRB + '0004', usuario: JEN, motivo: 'Cambio de frente' }, tk.jefe));
  assert.strictEqual(r.Usuario, JEN);
  assert.strictEqual(r.Usuario_Anterior, LES);
});
t('no se reasigna a Visitante ni Auditor', () => {
  falla(env.llamar('registros.reasignar', { codigo: DRB + '0004', usuario: 'visita@ejemplo.com' }, tk.jefe), 'VALIDACION');
  falla(env.llamar('registros.reasignar', { codigo: DRB + '0004', usuario: 'audi@ejemplo.com' }, tk.jefe), 'VALIDACION');
});
t('operador no reasigna', () => falla(env.llamar('registros.reasignar', { codigo: DRB + '0004', usuario: LES }, tk.jen), 'PERMISO'));

console.log('Roles: jerarquía');
t('Jefe crea Control Documentario; no crea otro Jefe ni Coordinador', () => {
  exito(env.llamar('usuarios.guardar', { Correo: 'cdoc@ejemplo.com', Nombre: 'Asistente CD', Rol: 'Control Documentario', Activo: true }, tk.jefe));
  tk.cd = env.login('cdoc@ejemplo.com');
  falla(env.llamar('usuarios.guardar', { Correo: 'jefe2@ejemplo.com', Nombre: 'J2', Rol: 'Jefe de Área', Activo: true }, tk.jefe), 'PERMISO');
  falla(env.llamar('usuarios.guardar', { Correo: 'coord@ejemplo.com', Nombre: 'C', Rol: 'Coordinador General', Activo: true }, tk.jefe), 'PERMISO');
});
t('Propietario crea al Coordinador General (global)', () => {
  exito(env.llamar('usuarios.guardar', { Correo: 'coord@ejemplo.com', Nombre: 'Coordinador', Rol: 'Coordinador General', Activo: true }, tk.prop));
  tk.coord = env.login('coord@ejemplo.com');
  assert.strictEqual(exito(env.llamar('bootstrap', {}, tk.coord)).usuario.Rol, 'Coordinador General');
});
t('Coordinador crea Jefes; no toca al Propietario ni a otro Coordinador', () => {
  exito(env.llamar('usuarios.guardar', { Correo: 'jefe2@ejemplo.com', Nombre: 'J2', Rol: 'Jefe de Área', Activo: true }, tk.coord));
  falla(env.llamar('usuarios.guardar', { Correo: PROP, Nombre: 'X', Rol: 'Visitante', Activo: false }, tk.coord), 'PERMISO');
  falla(env.llamar('usuarios.guardar', { Correo: 'coord2@ejemplo.com', Nombre: 'C2', Rol: 'Coordinador General', Activo: true }, tk.coord), 'PERMISO');
});
t('Jefe no modifica a otro Jefe; nadie asigna Propietario', () => {
  falla(env.llamar('usuarios.guardar', { Correo: 'jefe2@ejemplo.com', Nombre: 'J2', Rol: 'Operador', Activo: true }, tk.jefe), 'PERMISO');
  falla(env.llamar('usuarios.guardar', { Correo: 'x@ejemplo.com', Nombre: 'X', Rol: 'Propietario' }, tk.prop), 'VALIDACION');
});
t('Propietario cambia su nombre y conserva el rol', () => {
  exito(env.llamar('usuarios.guardar', { Correo: PROP, Nombre: 'Carlos C.', Rol: 'Visitante' }, tk.prop));
  assert.strictEqual(exito(env.llamar('bootstrap', {}, tk.prop)).usuario.Rol, 'Propietario');
});
t('desactivar corta el acceso al instante', () => {
  exito(env.llamar('usuarios.guardar', { Correo: 'visita@ejemplo.com', Nombre: 'Visita', Rol: 'Visitante', Activo: false }, tk.jefe));
  falla(env.llamar('bootstrap', {}, tk.vis), 'INACTIVO');
});
t('Control Documentario: historial e integridad sí; validar formatos y usuarios no', () => {
  exito(env.llamar('historial.listar', {}, tk.cd));
  exito(env.llamar('auditoria.integridad', {}, tk.cd));
  falla(env.llamar('auditoria.validar', { codigo: DRB + '0003', resultado: 'Validado' }, tk.cd), 'PERMISO');
  falla(env.llamar('usuarios.guardar', { Correo: 'z@ejemplo.com', Nombre: 'Z', Rol: 'Operador' }, tk.cd), 'PERMISO');
  falla(env.llamar('historial.listar', {}, tk.les), 'PERMISO');
});

console.log('Catálogos, series y cambio de fase');
t('CD agrega una especialidad y arma una serie desde el catálogo', () => {
  exito(env.llamar('catalogos.guardar', { Tipo: 'Especialidad', Codigo: 'top', Descripcion: 'Topografía y control' }, tk.cd)); // existe → actualiza
  const nuevo = exito(env.llamar('catalogos.guardar', { Tipo: 'Tipo_Documento', Codigo: 'inf', Descripcion: 'Informe' }, tk.cd));
  assert.strictEqual(nuevo.Codigo, 'INF');
  const s = exito(env.llamar('series.guardar', { Fase: 'F2', Especialidad: 'TOP', Tramo: 'GLB', Tipo_Documento: 'PRC', Area: 'Topografía', Descripcion: 'Protocolos topográficos' }, tk.cd));
  assert.strictEqual(s.Codigo_Serie, 'F2-TOP-GLB-PRC');
  assert.strictEqual(s.Prefijo_Completo, 'PSR2-F2-CPC-TOP-GLB-PRC');
  assert.strictEqual(s.Area, 'Topografía');
  assert.strictEqual(exito(env.llamar('registros.generar', { serie: 'F2-TOP-GLB-PRC' }, tk.cd))[0].Codigo_Completo, 'PSR2-F2-CPC-TOP-GLB-PRC-0001');
});
t('series de Topografía: solo las ve y usa el asistente; el operador de Calidad no', () => {
  falla(env.llamar('registros.generar', { serie: 'F2-TOP-GLB-PRC' }, tk.les), 'PERMISO');
  const b = exito(env.llamar('bootstrap', {}, tk.les));
  assert.ok(!b.series.some((x) => x.Area === 'Topografía'));
  assert.ok(!exito(env.llamar('registros.listar', {}, tk.les)).some((r) => r.Serie === 'F2-TOP-GLB-PRC'));
  assert.ok(exito(env.llamar('registros.listar', {}, tk.aud)).some((r) => r.Serie === 'F2-TOP-GLB-PRC'), 'el auditor ve todas las áreas');
  falla(env.llamar('series.guardar', { Fase: 'F2', Especialidad: 'TOP', Tramo: 'EMD', Tipo_Documento: 'PRC', Area: 'Marte' }, tk.cd), 'VALIDACION');
});
t('un operador de Topografía sí usa sus series y no las de Calidad', () => {
  exito(env.llamar('usuarios.guardar', { Correo: 'topo@ejemplo.com', Nombre: 'Topógrafo', Rol: 'Operador', Area: 'Topografía', Activo: true }, tk.jefe));
  tk.topo = env.login('topo@ejemplo.com');
  exito(env.llamar('registros.generar', { serie: 'F2-TOP-GLB-PRC' }, tk.topo));
  falla(env.llamar('registros.generar', { serie: S_DRB }, tk.topo), 'PERMISO');
});
t('código de catálogo inexistente o con guion se rechaza', () => {
  falla(env.llamar('series.guardar', { Fase: 'F2', Especialidad: 'XXX', Tramo: 'GLB', Tipo_Documento: 'PRC' }, tk.cd), 'VALIDACION');
  falla(env.llamar('catalogos.guardar', { Tipo: 'Tramo', Codigo: 'A-B' }, tk.cd), 'VALIDACION');
  falla(env.llamar('series.guardar', { Fase: 'F2', Especialidad: 'TOP', Tramo: 'GLB', Tipo_Documento: 'PRC' }, tk.cd), 'VALIDACION');
});
t('Operador no gestiona catálogos ni series', () => {
  falla(env.llamar('catalogos.guardar', { Tipo: 'Tramo', Codigo: 'T1' }, tk.les), 'PERMISO');
  falla(env.llamar('series.guardar', { Fase: 'F2', Especialidad: 'TOP', Tramo: 'EMD', Tipo_Documento: 'PRC' }, tk.les), 'PERMISO');
});
t('cambio de fase F2 → F3: mismas series desde 0001 y F2 queda cerrada', () => {
  const r = exito(env.llamar('series.clonarFase', { origen: 'F2', destino: 'F3', cerrarOrigen: true }, tk.cd));
  assert.strictEqual(r.creadas, 13);
  assert.strictEqual(r.cerradas, 13);
  falla(env.llamar('registros.generar', { serie: S_DRB }, tk.les), 'NEGOCIO');
  const g = exito(env.llamar('registros.generar', { serie: 'F3-DRB-GLB-RGI' }, tk.les));
  assert.strictEqual(g[0].Codigo_Completo, 'PSR2-F3-CPC-DRB-GLB-RGI-0001');
  // los códigos F2 siguen consultables y operables
  exito(env.llamar('registros.editar', { codigo: DRB + '0003', campos: { Actividad: 'post fase' } }, tk.les));
  // repetir no duplica
  falla(env.llamar('series.clonarFase', { origen: 'F2', destino: 'F3' }, tk.cd), 'VALIDACION');
});

console.log('Integridad, contador e importación');
t('integridad sin errores (F2 cerrada y F3 nueva)', () => {
  const r = exito(env.llamar('auditoria.integridad', {}, tk.aud));
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.alertas.huecos, 0);
});
t('contador solo sube; los saltos aparecen como huecos', () => {
  falla(env.llamar('series.ajustarContador', { serie: 'F3-MVT-EMD-RGI', valor: 0, motivo: 'x' }, tk.cd), 'VALIDACION');
  exito(env.llamar('series.ajustarContador', { serie: 'F3-MVT-EMD-RGI', valor: 3, motivo: 'Auditoría: 3 usados en papel' }, tk.cd));
  assert.deepStrictEqual(exito(env.llamar('auditoria.integridad', {}, tk.aud)).series.find((s) => s.serie === 'F3-MVT-EMD-RGI').huecos, [1, 2, 3]);
  assert.strictEqual(exito(env.llamar('registros.generar', { serie: 'F3-MVT-EMD-RGI' }, tk.les))[0].Correlativo_Numero, '4');
});
t('importación detecta errores y no guarda nada', () => {
  const filas = [
    { Serie: 'F3-MVT-EMD-RGI', Correlativo: '1' }, { Serie: 'F3-MVT-EMD-RGI', Correlativo: '1' },
    { Serie: 'NO-EXISTE', Correlativo: '5' }, { Serie: 'F3-MVT-EMD-RGI', Correlativo: '4' },
    { Serie: 'F3-MVT-EMD-RGI', Correlativo: '2', Usuario: 'nadie@ejemplo.com' }, { Serie: 'F3-MVT-EMD-RGI', Correlativo: '2', Fecha: '2026/99/99' },
  ];
  assert.strictEqual(exito(env.llamar('importar.previsualizar', { filas }, tk.cd)).errores, 5);
  falla(env.llamar('importar.ejecutar', { filas }, tk.cd), 'VALIDACION');
});
t('importación válida (Serie con fase o columna Fase): históricos y contadores', () => {
  const filas = [
    { Serie: 'F3-MVT-EMD-RGI', Correlativo: '1', Fecha: '15/09/2026' },
    { Serie: 'MVT-EMD-RGI', Fase: 'F3', Correlativo: '2' },
    { Serie: 'F3-MVT-EMD-RGI', Correlativo: '3' },
    { Serie: 'EST-EMD-RGI', Fase: 'F2', Correlativo: '0024', Usuario: LES },
  ];
  const p = exito(env.llamar('importar.previsualizar', { filas }, tk.cd));
  assert.strictEqual(p.errores, 0, JSON.stringify(p.filas));
  assert.deepStrictEqual(p.ajustes, [{ serie: 'F2-EST-EMD-RGI', actual: 0, nuevo: 24 }]);
  assert.strictEqual(exito(env.llamar('importar.ejecutar', { filas }, tk.cd)).importados, 4);
  const h = exito(env.llamar('registros.listar', {}, tk.cd)).find((x) => x.Codigo_Completo === 'PSR2-F3-CPC-MVT-EMD-RGI-0001');
  assert.strictEqual(h.Estado_Doc, 'Histórico');
  assert.strictEqual(h.Fecha_Creacion, '2026-09-15T00:00:00');
  assert.deepStrictEqual(exito(env.llamar('auditoria.integridad', {}, tk.aud)).series.find((s) => s.serie === 'F3-MVT-EMD-RGI').huecos, []);
});
t('histórico importado no se libera; operador no importa', () => {
  falla(env.llamar('registros.liberar', { codigo: 'PSR2-F2-CPC-EST-EMD-RGI-0024', motivo: 'prueba' }, tk.les), 'NEGOCIO');
  falla(env.llamar('importar.previsualizar', { filas: [{ Serie: 'X', Correlativo: '1' }] }, tk.les), 'PERMISO');
});

console.log('DATA: carga y descarga');
t('el asistente carga códigos de Topografía pegando el código completo', () => {
  const filas = ['0001', '0002', '0003'].map((n) => ({ Codigo: 'PSR2-F2-CPC-TOP-EMD-RGI-' + n }));
  filas.push({ Nomenclatura: 'PSR2-F2-CPC-TOP-GLB-FCH', Correlativo: '1' });
  const p = exito(env.llamar('importar.previsualizar', { filas }, tk.cd));
  assert.strictEqual(p.errores, 0, JSON.stringify(p.filas));
  exito(env.llamar('importar.ejecutar', { filas }, tk.cd));
  const b = exito(env.llamar('bootstrap', {}, tk.cd));
  assert.strictEqual(b.series.find((s) => s.Codigo_Serie === 'F2-TOP-EMD-RGI').Ultimo_Correlativo, '3');
  assert.strictEqual(b.series.find((s) => s.Codigo_Serie === 'F2-TOP-GLB-FCH').Ultimo_Correlativo, '1');
});
t('código mal escrito o de serie inexistente se reporta por fila', () => {
  const p = exito(env.llamar('importar.previsualizar', { filas: [{ Codigo: 'PSR2-F2-CPC-TOP-XXX-RGI-0001' }, { Codigo: 'PSR2-F2-CPC-TOP-EMD-RGI-ABC' }] }, tk.cd));
  assert.strictEqual(p.errores, 2);
});
t('el jefe delega la carga de data a un usuario: carga solo en series de su área', () => {
  falla(env.llamar('importar.previsualizar', { filas: [{ Codigo: 'PSR2-F2-CPC-TOP-PTS-RGI-0001' }] }, tk.topo), 'PERMISO');
  assert.strictEqual(exito(env.llamar('bootstrap', {}, tk.topo)).permisos.data, false);
  exito(env.llamar('usuarios.guardar', { Correo: 'topo@ejemplo.com', Nombre: 'Topógrafo', Rol: 'Operador', Area: 'Topografía', Activo: true, Carga_Data: true }, tk.jefe));
  assert.strictEqual(exito(env.llamar('bootstrap', {}, tk.topo)).permisos.data, true);
  exito(env.llamar('importar.ejecutar', { filas: [{ Codigo: 'PSR2-F2-CPC-TOP-PTS-RGI-0001' }, { Codigo: 'PSR2-F2-CPC-TOP-PTS-RGI-0002' }] }, tk.topo));
  const p = exito(env.llamar('importar.previsualizar', { filas: [{ Codigo: 'PSR2-F2-CPC-DRB-GLB-RGI-0090' }] }, tk.topo));
  assert.strictEqual(p.errores, 1, 'no puede cargar en series de Calidad');
  assert.strictEqual(exito(env.llamar('bootstrap', {}, tk.les)).permisos.data, false);
});

console.log('Formatos (biblioteca; solo el Propietario los sube)');
const zipLib = require('./zip');
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const xlsxDePrueba = () => zipLib.zip([
  { nombre: '[Content_Types].xml', datos: Buffer.from('<Types/>') },
  { nombre: 'xl/sharedStrings.xml', datos: Buffer.from('<sst><si><t>CORRELATIVO N°: {CODIGO}</t></si><si><t>{DESCONOCIDO}</t></si></sst>') },
  { nombre: 'xl/worksheets/sheet1.xml', datos: Buffer.from('<c r="D5" t="inlineStr"><is><t>{FASE}</t></is></c><c r="D6" t="inlineStr"><is><t>{ACTIVIDAD}</t></is></c><c r="H6"><is><t>{PROGRESIVA}</t></is></c>') },
  { nombre: 'xl/drawings/drawing1.xml', datos: Buffer.from('<a:t>Responsable: {NOMBRE_USUARIO}</a:t>') },
  { nombre: 'xl/media/image1.png', datos: Buffer.from([137, 80, 78, 71, 0, 255]) },
]).toString('base64');
const FMT = { Codigo_Formato: 'PSR2-F2-CPC-CAL-EMD-FOR-0001', Nombre: 'Reparación de juntas de waterstop', Revision: 'a' };
t('Jefe y Control Documentario no suben formatos', () => {
  const archivo = { nombre: 'f.xlsx', mime: XLSX, base64: xlsxDePrueba() };
  falla(env.llamar('formatos.guardar', { ...FMT, archivo }, tk.jefe), 'PERMISO');
  falla(env.llamar('formatos.guardar', { ...FMT, archivo }, tk.cd), 'PERMISO');
});
t('Propietario sube el xlsx; todos ven el formato en la biblioteca', () => {
  falla(env.llamar('formatos.guardar', { ...FMT }, tk.prop), 'VALIDACION');
  falla(env.llamar('formatos.guardar', { ...FMT, Codigo_Formato: 'mal codigo', archivo: { nombre: 'f.xlsx', mime: XLSX, base64: xlsxDePrueba() } }, tk.prop), 'VALIDACION');
  const f = exito(env.llamar('formatos.guardar', { ...FMT, archivo: { nombre: 'FOR-0001-A.xlsx', mime: XLSX, base64: xlsxDePrueba() } }, tk.prop));
  assert.strictEqual(f.Plantilla_Tipo, 'xlsx');
  assert.strictEqual(f.Revision, 'A');
  const b = exito(env.llamar('bootstrap', {}, tk.les));
  assert.deepStrictEqual(b.formatos.map((x) => x.Codigo_Formato), [FMT.Codigo_Formato]);
  assert.strictEqual(b.formatos[0].Plantilla_ID, undefined, 'no expone IDs de Drive');
});
t('el operador descarga el xlsx relleno: conserva el resto del archivo y queda asociado al código', () => {
  exito(env.llamar('registros.editar', { codigo: 'PSR2-F3-CPC-DRB-GLB-RGI-0001', campos: { Actividad: 'Juntas <eje 3> & losa', PK_Inicial: '0+100', PK_Final: '0+120' } }, tk.les));
  const f = exito(env.llamar('archivos.descargarFormato', { codigo: 'PSR2-F3-CPC-DRB-GLB-RGI-0001', formato: FMT.Codigo_Formato }, tk.les));
  assert.strictEqual(f.nombre, 'PSR2-F3-CPC-DRB-GLB-RGI-0001.xlsx');
  const partes = Object.fromEntries(zipLib.unzip(Buffer.from(f.base64, 'base64')).map((p) => [p.nombre, p.datos]));
  assert.ok(partes['xl/sharedStrings.xml'].toString().includes('CORRELATIVO N°: PSR2-F3-CPC-DRB-GLB-RGI-0001'));
  assert.ok(partes['xl/sharedStrings.xml'].toString().includes('{DESCONOCIDO}'), 'marcador desconocido se deja igual');
  const hoja = partes['xl/worksheets/sheet1.xml'].toString();
  assert.ok(hoja.includes('<t>F3</t>') && hoja.includes('Juntas &lt;eje 3&gt; &amp; losa') && hoja.includes('0+100 – 0+120'), hoja);
  assert.ok(partes['xl/drawings/drawing1.xml'].toString().includes('Responsable: Lesllye Salazar'));
  assert.deepStrictEqual([...partes['xl/media/image1.png']], [137, 80, 78, 71, 0, 255], 'imágenes intactas');
  const regs = exito(env.llamar('registros.listar', {}, tk.les));
  assert.strictEqual(regs.find((r) => r.Codigo_Completo === 'PSR2-F3-CPC-DRB-GLB-RGI-0001').Formato, FMT.Codigo_Formato);
  // la segunda vez no hace falta elegir: usa el asociado
  exito(env.llamar('archivos.descargarFormato', { codigo: 'PSR2-F3-CPC-DRB-GLB-RGI-0001' }, tk.les));
});
t('cualquiera del proyecto (visitante/cliente) descarga para imprimir; solo el dueño o admin elige el protocolo', () => {
  const c = 'PSR2-F3-CPC-DRB-GLB-RGI-0001';
  assert.ok(exito(env.llamar('archivos.descargarFormato', { codigo: c }, tk.aud)).base64);
  assert.ok(exito(env.llamar('archivos.descargarFormato', { codigo: c }, tk.jen)).base64);
  falla(env.llamar('archivos.descargarFormato', { codigo: c, formato: 'PSR2-F2-CPC-CAL-EMD-FOR-0099' }, tk.aud), 'PERMISO');
});
t('ingreso en un solo viaje: bootstrap con inicio trae los mismos códigos y el resumen', () => {
  const b = exito(env.llamar('bootstrap', { inicio: true }, tk.les));
  const regs = exito(env.llamar('registros.listar', {}, tk.les));
  assert.deepStrictEqual(b.registros.map((r) => r.Codigo_Completo), regs.map((r) => r.Codigo_Completo));
  assert.ok('resumen' in b);
  assert.strictEqual(exito(env.llamar('bootstrap', {}, tk.les)).registros, undefined, 'sin inicio no los trae');
});
t('PDF guardado: misma hoja = mismo PDF sin reconvertir; cualquier cambio lo regenera y reemplaza', () => {
  const c = 'PSR2-F3-CPC-DRB-GLB-RGI-0001';
  const conv = () => Object.values(env.archivos).filter((a) => /^TMP PDF/.test(a.nombre)).length;
  const guardados = () => Object.values(env.archivos).filter((a) => /\.pdf$/.test(a.nombre) && a.descripcion && !a.trashed);
  const n0 = conv();
  const p1 = exito(env.llamar('archivos.descargarFormato', { codigo: c, salida: 'pdf' }, tk.les));
  assert.strictEqual(conv(), n0 + 1);
  const p2 = exito(env.llamar('archivos.descargarFormato', { codigo: c, salida: 'pdf' }, tk.aud));
  assert.strictEqual(conv(), n0 + 1, 'segunda descarga: reutiliza, no convierte');
  assert.strictEqual(p2.base64, p1.base64);
  assert.strictEqual(guardados().length, 1);
  exito(env.llamar('registros.editar', { codigo: c, campos: { Actividad: 'Juntas eje 4' } }, tk.les));
  exito(env.llamar('archivos.descargarFormato', { codigo: c, salida: 'pdf' }, tk.les));
  assert.strictEqual(conv(), n0 + 2, 'cambió la hoja: se regenera');
  assert.strictEqual(guardados().length, 1, 'el anterior se reemplaza');
  // con foto no se guarda nada
  const foto = { base64: Buffer.from([255, 216, 255, 0]).toString('base64'), mime: 'image/jpeg', ancho: 10, alto: 10 };
  exito(env.llamar('archivos.descargarFormato', { codigo: c, salida: 'pdf', foto }, tk.les));
  assert.strictEqual(guardados().length, 1);
});
t('formato inactivo: no se descarga y el operador ya no lo ve', () => {
  exito(env.llamar('formatos.guardar', { ...FMT, Activo: false }, tk.prop));
  assert.strictEqual(exito(env.llamar('bootstrap', {}, tk.les)).formatos.length, 0);
  assert.strictEqual(exito(env.llamar('bootstrap', {}, tk.prop)).formatos.length, 1);
  falla(env.llamar('archivos.descargarFormato', { codigo: 'PSR2-F3-CPC-DRB-GLB-RGI-0001' }, tk.les), 'NEGOCIO');
  exito(env.llamar('formatos.guardar', { ...FMT, Activo: true }, tk.prop));
});

console.log('Protocolos como formulario');
const ist = (r, t, s = 1) => `<c r="${r}" s="${s}" t="inlineStr"><is><t>${t}</t></is></c>`;
const num = (r, n) => `<c r="${r}" s="1"><v>${n}</v></c>`;
const vac = (r) => `<c r="${r}" s="2"/>`;
const hojaFicha = '<worksheet><sheetData>' +
  `<row r="4">${ist('A4', 'CLIENTE:')}${vac('D4')}${ist('E4', 'UBICACIÓN:')}${vac('H4')}</row>` +
  `<row r="5">${ist('A5', 'FASE:')}${vac('D5')}${ist('E5', 'CORRELATIVO N°:')}${vac('H5')}</row>` +
  `<row r="6">${ist('A6', 'ESPECIALIDAD:')}${vac('D6')}${ist('K6', 'CPC:')}${vac('L6')}</row>` +
  `<row r="12">${ist('A12', 'Grupo')}${ist('C12', 'Nº')}${ist('D12', 'Descripción')}${ist('E12', 'PC')}${ist('F12', 'CORRECTO')}${ist('I12', 'REGISTROS ASOCIADOS')}${ist('J12', 'RESULTADOS')}</row>` +
  `<row r="13">${ist('F13', 'SI')}${ist('G13', 'NO')}${ist('H13', 'N/A')}</row>` +
  `<row r="14">${num('A14', 1)}${num('C14', 1)}${ist('D14', 'Item uno')}${ist('E14', 'PE')}${vac('F14')}${vac('G14')}${vac('H14')}${vac('I14')}${vac('J14')}</row>` +
  `<row r="15">${num('A15', 3)}${num('C15', 2)}${ist('D15', 'Item dos')}${ist('E15', 'PC')}</row>` +
  `<row r="16">${ist('A16', 'COMENTARIOS:')}</row><row r="17">${vac('A17')}</row>` +
  '</sheetData><mergeCells><mergeCell ref="A4:C4"/><mergeCell ref="E4:G4"/><mergeCell ref="A5:C5"/><mergeCell ref="E5:G5"/>' +
  '<mergeCell ref="A6:C6"/><mergeCell ref="J12:L13"/><mergeCell ref="A16:L16"/><mergeCell ref="A17:L17"/></mergeCells></worksheet>';
const fichaXlsx = () => zipLib.zip([
  { nombre: '[Content_Types].xml', datos: Buffer.from('<Types/>') },
  { nombre: 'xl/sharedStrings.xml', datos: Buffer.from('<sst></sst>') },
  { nombre: 'xl/worksheets/sheet1.xml', datos: Buffer.from(hojaFicha) },
]).toString('base64');
const F2 = 'PSR2-F2-CPC-CAL-EMD-FOR-0002';
let codA, codB;
t('el Propietario sube la ficha y la app detecta su formulario', () => {
  exito(env.llamar('formatos.guardar', { Codigo_Formato: F2, Nombre: 'Ficha de prueba', archivo: { nombre: F2 + '.xlsx', mime: XLSX, base64: fichaXlsx() } }, tk.prop));
  const e = exito(env.llamar('formularios.estructura', { formato: F2 }, tk.les));
  assert.deepStrictEqual(e.campos, ['cliente', 'ubicacion', 'fase', 'codigo', 'especialidad', 'cpc']);
  assert.deepStrictEqual(e.items.map((i) => [i.n, i.pc, i.descripcion]), [['1', 'PE', 'Item uno'], ['2', 'PC', 'Item dos']]);
  assert.ok(e.columnas.reg && e.columnas.res && e.comentarios);
  falla(env.llamar('formularios.estructura', { formato: FMT.Codigo_Formato }, tk.les), 'NEGOCIO'); // el de prueba anterior no es ficha
});
t('guardar el formulario asigna el correlativo CPC (por prefijo, 4 dígitos) una sola vez', () => {
  const g = exito(env.llamar('registros.generar', { serie: 'F3-DRB-GLB-RGI', cantidad: 2 }, tk.les));
  [codA, codB] = g.map((r) => r.Codigo_Completo);
  falla(env.llamar('formularios.guardar', { codigo: codA, formato: F2, datos: {}, cpc: { acronimo: 'XXX' } }, tk.les), 'VALIDACION');
  const datos = { campos: { ubicacion: 'Margen derecho', pk_inicial: '0+045', pk_final: '0+060', partida: 'JUNTA DE DILATACIÓN CON WATERSTOP' },
    items: { 1: { v: 'SI', reg: 'PSR2-F2-CPC-TOP-PTS-RGI-0020', res: 'Conforme' }, 2: { v: 'NA' }, 99: { v: 'SI' } }, comentarios: 'Se adjunta registro fotográfico' };
  const a = exito(env.llamar('formularios.guardar', { codigo: codA, formato: F2, datos, cpc: { acronimo: 'WSTOP', elemento: 'MCONT' } }, tk.les));
  assert.strictEqual(a.Correlativo_CPC, 'WSTOP-MCONT-F3-0001');
  assert.strictEqual(a.Formato, F2);
  assert.strictEqual(a.Ubicacion, 'Margen derecho');
  assert.ok(!JSON.parse(a.Datos_Formulario).items[99], 'ítems inexistentes se ignoran');
  const a2 = exito(env.llamar('formularios.guardar', { codigo: codA, formato: F2, datos, cpc: { acronimo: 'ACE' } }, tk.les));
  assert.strictEqual(a2.Correlativo_CPC, 'WSTOP-MCONT-F3-0001', 'el CPC no cambia al volver a guardar');
  const b = exito(env.llamar('formularios.guardar', { codigo: codB, formato: F2, datos: {}, cpc: { acronimo: 'WSTOP', elemento: 'MCONT' } }, tk.les));
  assert.strictEqual(b.Correlativo_CPC, 'WSTOP-MCONT-F3-0002');
  falla(env.llamar('formularios.guardar', { codigo: codA, formato: F2, datos: {} }, tk.jen), 'PERMISO');
});
t('reparación: se elige el CPC original; conserva sus acrónimos y N° + A, sin duplicar', () => {
  const g = exito(env.llamar('registros.generar', { serie: 'F3-DRB-GLB-RGI', cantidad: 3 }, tk.les));
  assert.ok(exito(env.llamar('registros.codigosCPC', {}, tk.les)).includes('WSTOP-MCONT-F3-0001'));
  falla(env.llamar('formularios.guardar', { codigo: g[0].Codigo_Completo, formato: F2, datos: {}, cpc: { reparaDe: 'WSTOP-MCONT-F3-0099' } }, tk.les), 'VALIDACION');
  const r = exito(env.llamar('formularios.guardar', { codigo: g[0].Codigo_Completo, formato: F2, datos: {}, cpc: { reparaDe: 'wstop-mcont-f3-0001' } }, tk.les));
  assert.strictEqual(r.Correlativo_CPC, 'WSTOP-MCONT-F3-0001A');
  falla(env.llamar('formularios.guardar', { codigo: g[1].Codigo_Completo, formato: F2, datos: {}, cpc: { reparaDe: 'WSTOP-MCONT-F3-0001' } }, tk.les), 'VALIDACION');
  falla(env.llamar('formularios.guardar', { codigo: g[2].Codigo_Completo, formato: F2, datos: {}, cpc: { reparaDe: 'WSTOP-MCONT-F3-0001A' } }, tk.les), 'VALIDACION');
  // la serie normal sigue su numeración (la reparación no consume número)
  assert.strictEqual(exito(env.llamar('formularios.guardar', { codigo: g[1].Codigo_Completo, formato: F2, datos: {}, cpc: { acronimo: 'WSTOP', elemento: 'MCONT' } }, tk.les)).Correlativo_CPC, 'WSTOP-MCONT-F3-0003');
});
t('fase elegible: debe existir en el catálogo y va en el CPC', () => {
  const g = exito(env.llamar('registros.generar', { serie: 'F3-DRB-GLB-RGI', cantidad: 2 }, tk.les));
  falla(env.llamar('formularios.guardar', { codigo: g[0].Codigo_Completo, formato: F2, datos: { campos: { fase: 'F9' } } }, tk.les), 'VALIDACION');
  const r = exito(env.llamar('formularios.guardar', { codigo: g[0].Codigo_Completo, formato: F2, datos: { campos: { fase: 'f2' } }, cpc: { acronimo: 'WSTOP' } }, tk.les));
  assert.strictEqual(r.Correlativo_CPC, 'WSTOP-F2-0001');
  assert.strictEqual(JSON.parse(r.Datos_Formulario).campos.fase, 'F2');
});
t('liberar descarta el avance del protocolo (y su CPC); con Conforme ya no se libera', () => {
  const g = exito(env.llamar('registros.generar', { serie: 'F3-DRB-GLB-RGI', cantidad: 2 }, tk.les));
  exito(env.llamar('formularios.guardar', { codigo: g[0].Codigo_Completo, formato: F2, datos: { campos: { capa: '1' } }, cpc: { acronimo: 'ANC' } }, tk.les));
  const l = exito(env.llamar('registros.liberar', { codigo: g[0].Codigo_Completo, motivo: 'no se llenó' }, tk.les));
  assert.strictEqual(l.Datos_Formulario, '');
  assert.strictEqual(l.Correlativo_CPC, '');
  exito(env.llamar('formularios.guardar', { codigo: g[1].Codigo_Completo, formato: F2, datos: {}, conforme: true }, tk.les));
  falla(env.llamar('registros.liberar', { codigo: g[1].Codigo_Completo, motivo: 'error' }, tk.les), 'NEGOCIO');
});
t('valorización automática: del 26 al 25 = mes siguiente; sigue la fecha del protocolo salvo que se edite', () => {
  const L = require('../backend/Logica.js');
  assert.strictEqual(L.periodoValorizacion('26/10/2026', 26), '2026-11');
  assert.strictEqual(L.periodoValorizacion('25/11/2026', 26), '2026-11');
  assert.strictEqual(L.periodoValorizacion('26/12/2026', 26), '2027-01');
  assert.strictEqual(L.periodoValorizacion('2026-11-14T10:00:00', 26), '2026-11');
  const g = exito(env.llamar('registros.generar', { serie: 'F3-DRB-GLB-RGI' }, tk.les))[0];
  assert.ok(/^\d{4}-\d{2}$/.test(g.Valorizacion), 'se asigna al generar');
  const a = exito(env.llamar('formularios.guardar', { codigo: g.Codigo_Completo, formato: F2, datos: { fecha: '27/10/2026' } }, tk.les));
  assert.strictEqual(a.Valorizacion, '2026-11', 'sigue la fecha del protocolo');
  const b = exito(env.llamar('formularios.guardar', { codigo: g.Codigo_Completo, formato: F2, datos: { fecha: '27/10/2026', valorizacion: '2026-12' } }, tk.les));
  assert.strictEqual(b.Valorizacion, '2026-12', 'editada a mano');
  const c = exito(env.llamar('formularios.guardar', { codigo: g.Codigo_Completo, formato: F2, datos: { fecha: '05/10/2026' } }, tk.les));
  assert.strictEqual(c.Valorizacion, '2026-12', 'la editada no se pisa al cambiar la fecha');
  falla(env.llamar('formularios.guardar', { codigo: g.Codigo_Completo, formato: F2, datos: { valorizacion: 'nov' } }, tk.les), 'VALIDACION');
  falla(env.llamar('registros.editar', { codigo: g.Codigo_Completo, campos: { Valorizacion: '13/2026' } }, tk.les), 'VALIDACION');
});
t('conforme y fecha: queda quién dio conforme; la fecha la cambia solo quien creó el código o un admin', () => {
  const g = exito(env.llamar('registros.generar', { serie: 'F3-DRB-GLB-RGI' }, tk.les))[0].Codigo_Completo;
  const a = JSON.parse(exito(env.llamar('formularios.guardar', { codigo: g, formato: F2, datos: {} }, tk.les)).Datos_Formulario);
  assert.strictEqual(a.conforme, null, 'guardar avance no da conforme');
  assert.ok(/^\d{2}\/\d{2}\/\d{4}$/.test(a.fecha));
  falla(env.llamar('formularios.guardar', { codigo: g, formato: F2, datos: { fecha: '2026-11-01' } }, tk.les), 'VALIDACION');
  const b = JSON.parse(exito(env.llamar('formularios.guardar', { codigo: g, formato: F2, datos: { fecha: '01/11/2026' }, conforme: true }, tk.les)).Datos_Formulario);
  assert.strictEqual(b.fecha, '01/11/2026');
  assert.strictEqual(b.conforme.por, 'lsalazar@usuarios.app');
  const c = JSON.parse(exito(env.llamar('formularios.guardar', { codigo: g, formato: F2, datos: { fecha: '02/11/2026' } }, tk.jefe)).Datos_Formulario);
  assert.strictEqual(c.fecha, '02/11/2026', 'el administrador también la cambia');
  assert.strictEqual(c.conforme.por, 'lsalazar@usuarios.app', 'el conforme se conserva');
});
t('el Excel descargado sale lleno: encabezado, checks, registros, comentarios', () => {
  const f = exito(env.llamar('archivos.descargarFormato', { codigo: codA }, tk.les));
  const hoja = zipLib.unzip(Buffer.from(f.base64, 'base64')).find((p) => p.nombre === 'xl/worksheets/sheet1.xml').datos.toString();
  const celda = (ref) => { const m = new RegExp(`<c r="${ref}"[^>]*>(?:<is><t[^>]*>([^<]*)</t></is>)?`).exec(hoja); return m ? (m[1] || '') : null; };
  assert.strictEqual(celda('D4'), 'PROVIAS NACIONAL');
  assert.strictEqual(celda('H4'), 'Margen derecho');
  assert.strictEqual(celda('D5'), 'F3');
  assert.strictEqual(celda('H5'), codA);
  assert.strictEqual(celda('D6'), 'GEOTECNIA', 'especialidad por defecto según la serie (DRB)');
  assert.strictEqual(celda('L6'), 'WSTOP-MCONT-F3-0001');
  assert.strictEqual(celda('F14'), '✓');
  assert.strictEqual(celda('I14'), 'PSR2-F2-CPC-TOP-PTS-RGI-0020');
  assert.strictEqual(celda('J14'), 'Conforme');
  assert.strictEqual(celda('H15'), '✓', 'N/A marcado en fila 15 (celda creada)');
  assert.strictEqual(celda('A17'), 'Se adjunta registro fotográfico');
  assert.ok(/<c r="D4" s="2"/.test(hoja), 'conserva el estilo de la celda');
});

t('listas abiertas: el operador agrega una partida/localización desde el formulario (sin duplicar)', () => {
  const b0 = exito(env.llamar('bootstrap', {}, tk.les));
  assert.strictEqual(b0.catalogos.filter((c) => c.Tipo === 'Localizacion').length, 15);
  const p = exito(env.llamar('catalogos.agregarLista', { Tipo: 'Partida', Descripcion: 'sellado de juntas  con  poliuretano' }, tk.les));
  assert.strictEqual(p.Codigo, '24');
  assert.strictEqual(p.Descripcion, 'SELLADO DE JUNTAS CON POLIURETANO');
  assert.strictEqual(exito(env.llamar('catalogos.agregarLista', { Tipo: 'Partida', Descripcion: 'SELLADO DE JUNTAS CON POLIURETANO' }, tk.les)).Codigo, '24');
  assert.strictEqual(exito(env.llamar('catalogos.agregarLista', { Tipo: 'Localizacion', Descripcion: 'Estribo 2 - lado oeste' }, tk.les)).Codigo, 'L16');
  falla(env.llamar('catalogos.agregarLista', { Tipo: 'Fase', Descripcion: 'Fase 9' }, tk.les), 'VALIDACION');
  falla(env.llamar('catalogos.agregarLista', { Tipo: 'Partida', Descripcion: 'X' }, tk.les), 'VALIDACION');
  falla(env.llamar('catalogos.agregarLista', { Tipo: 'Partida', Descripcion: 'Algo nuevo' }, tk.aud), 'PERMISO');
});
t('protocolo topográfico: se elige de los códigos de Topografía cargados; va al LOG, no a la hoja', () => {
  const topo = exito(env.llamar('registros.codigosTopografia', {}, tk.les));
  assert.ok(topo.includes('PSR2-F2-CPC-TOP-PTS-RGI-0001'), topo.join());
  assert.ok(topo.every((c) => c.includes('-TOP-')));
  const x = exito(env.llamar('formularios.guardar', { codigo: codA, formato: F2, datos: { campos: { protocolo_topo: 'PSR2-F2-CPC-TOP-PTS-RGI-9999', capa: 'NA' } } }, tk.les));
  assert.ok(/no existe/.test(x.Aviso), 'avisa pero guarda');
  assert.strictEqual(JSON.parse(x.Datos_Formulario).campos.capa, 'NA', 'el resto se guardó');
  assert.strictEqual(JSON.parse(x.Datos_Formulario).campos.protocolo_topo, '', 'sin el dato inexistente');
  const r = exito(env.llamar('formularios.guardar', { codigo: codA, formato: F2, datos: { campos: { protocolo_topo: 'psr2-f2-cpc-top-pts-rgi-0001' } } }, tk.les));
  assert.strictEqual(r.Protocolo_Topografico, 'PSR2-F2-CPC-TOP-PTS-RGI-0001');
  const f = exito(env.llamar('archivos.descargarFormato', { codigo: codA }, tk.les));
  const hoja = zipLib.unzip(Buffer.from(f.base64, 'base64')).find((x) => x.nombre === 'xl/worksheets/sheet1.xml').datos.toString();
  assert.ok(!hoja.includes('TOP-PTS-RGI-0001'), 'no se imprime en el FOR');
});

console.log('Multiproyecto');
t('solo el Propietario crea proyectos (VERS) y puede copiar catálogos', () => {
  falla(env.llamar('proyecto.crear', { ID_Proyecto: 'VERS', Nombre: 'Vía Evitamiento Santa Rosa', Empresa: 'XYZ' }, tk.coord), 'PERMISO');
  exito(env.llamar('proyecto.crear', { ID_Proyecto: 'VERS', Nombre: 'Vía Evitamiento Santa Rosa', Empresa: 'XYZ', copiarCatalogos: true }, tk.prop));
  const b = exito(env.llamar('bootstrap', {}, tk.prop, 'VERS'));
  assert.strictEqual(b.proyecto, 'VERS');
  assert.strictEqual(b.series.length, 0);
  assert.ok(b.catalogos.length >= 17);
});
t('VERS tiene su propia numeración y prefijo con su empresa', () => {
  exito(env.llamar('usuarios.guardar', { Correo: 'jefevers@ejemplo.com', Nombre: 'Jefe VERS', Rol: 'Jefe de Área', Activo: true }, tk.coord, 'VERS'));
  tk.jv = env.login('jefevers@ejemplo.com');
  exito(env.llamar('series.guardar', { Fase: 'F2', Especialidad: 'DRB', Tramo: 'GLB', Tipo_Documento: 'RGI' }, tk.jv, 'VERS'));
  const g = exito(env.llamar('registros.generar', { serie: 'F2-DRB-GLB-RGI' }, tk.jv, 'VERS'));
  assert.strictEqual(g[0].Codigo_Completo, 'VERS-F2-XYZ-DRB-GLB-RGI-0001');
});
t('los proyectos están aislados', () => {
  const bj = exito(env.llamar('bootstrap', {}, tk.jv));
  assert.deepStrictEqual(bj.proyectos.map((p) => p.ID_Proyecto), ['VERS']);
  falla(env.llamar('registros.listar', {}, tk.jv, 'PSR2'), 'SIN_ACCESO');
  falla(env.llamar('registros.listar', {}, tk.les, 'VERS'), 'SIN_ACCESO');
  assert.ok(exito(env.llamar('registros.listar', {}, tk.les)).every((r) => r.Proyecto === 'PSR2'));
  // un código de otro proyecto no se encuentra aunque se conozca
  falla(env.llamar('registros.editar', { codigo: 'VERS-F2-XYZ-DRB-GLB-RGI-0001', campos: { Actividad: 'x' } }, tk.jefe), 'NO_EXISTE');
});
t('Coordinador y Propietario ven ambos proyectos', () => {
  assert.deepStrictEqual(exito(env.llamar('bootstrap', {}, tk.coord)).proyectos.map((p) => p.ID_Proyecto).sort(), ['PSR2', 'VERS']);
  assert.ok(exito(env.llamar('registros.listar', {}, tk.coord, 'VERS')).length === 1);
});
t('un usuario puede tener roles distintos por proyecto', () => {
  exito(env.llamar('usuarios.guardar', { Correo: LES, Nombre: 'Lesllye Salazar', Rol: 'Visitante', Activo: true }, tk.jv, 'VERS'));
  assert.strictEqual(exito(env.llamar('bootstrap', {}, tk.les, 'VERS')).usuario.Rol, 'Visitante');
  assert.strictEqual(exito(env.llamar('bootstrap', {}, tk.les, 'PSR2')).usuario.Rol, 'Operador');
  falla(env.llamar('registros.generar', { serie: 'F2-DRB-GLB-RGI' }, tk.les, 'VERS'), 'PERMISO');
});

console.log('Historial inmutable');
t('cada acción quedó registrada', () => {
  const acciones = new Set(exito(env.llamar('historial.listar', { limite: 3000 }, tk.prop)).filas.map((x) => x.Accion));
  ['Creación', 'Liberación', 'Reutilización', 'Modificación', 'Reasignación', 'Carga de final', 'Observación', 'Validación',
    'Validación de integridad', 'Importación', 'Ajuste de contador', 'Usuario creado', 'Formato creado', 'Formato descargado',
    'Catálogo creado', 'Serie creada', 'Cambio de fase'].forEach((a) => assert.ok(acciones.has(a), 'Falta ' + a));
});

console.log('Formatos especiales (lector del Excel)');
const C = env.contexto;
const igual = (a, b) => assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), b); // objetos del entorno simulado
t('celdas que se llenan dentro de su texto: huecos, ":" final y casillas', () => {
  const p = C.partesEnCelda('Promedio = (A+B+C+D)/4 = _____ ⇒ Conclusión:');
  igual([...p.huecos], ['Promedio = (A+B+C+D)/4', 'Conclusión']);
  assert.strictEqual(C.rellenarEnCelda('Promedio = (A+B+C+D)/4 = _____ ⇒ Conclusión:', { h: ['12.5', 'OK'] }), 'Promedio = (A+B+C+D)/4 = 12.5 ⇒ Conclusión: OK');
  const q = C.partesEnCelda('EN RESUMEN: ¿SE REQUIERE UNA ACCIÓN? SÍ [ ] NO [ ]');
  igual([...q.casillas], ['SÍ', 'NO']);
  assert.strictEqual(q.etiqueta, 'EN RESUMEN: ¿SE REQUIERE UNA ACCIÓN?');
  assert.strictEqual(C.rellenarEnCelda('SÍ [ ] NO [ ]', { x: '1' }), 'SÍ [ ] NO [X]');
  assert.strictEqual(C.rellenarEnCelda('SÍ [ ] NO [ ]', { x: '' }), 'SÍ [ ] NO [ ]');
  assert.strictEqual(C.rellenarEnCelda('A:', { h: ['10 mm'] }), 'A: 10 mm');
});
// Con los Excel reales (data/ no se versiona): cada formato con su tipo de lista de control
const fsT = require('fs'), pathT = require('path');
const baseT = pathT.join(__dirname, '..', 'data', 'FORMATOS CALIDAD');
const fichaReal = (cod) => {
  const dir = pathT.join(baseT, cod);
  if (!fsT.existsSync(dir)) return null;
  const x = fsT.readdirSync(dir).find((f) => /\.xlsx$/i.test(f) && !/PLANTILLA/i.test(f));
  if (!x) return null;
  const blob = C.Utilities.newBlob([...fsT.readFileSync(pathT.join(dir, x))], 'application/zip', x);
  return C.abrirFicha_(blob).estructura;
};
if (fsT.existsSync(baseT)) {
  t('FOR estándar (EMD-0001): SI / NO / N/A, título del Excel, sin datos extra', () => {
    const e = fichaReal('PSR2-F2-CPC-CAL-EMD-FOR-0001');
    assert.strictEqual(e.titulo, 'REPARACIÓN DE JUNTAS DE WATERSTOP');
    igual(e.opciones.map((o) => o.v), ['SI', 'NO', 'NA']);
    assert.strictEqual(e.extras.length, 0); assert.strictEqual(e.enCelda.length, 0); assert.strictEqual(e.foto, null);
  });
  t('título que viene de una fórmula (GLB-0001) y último ítem con fórmula (GLB-0005: 7 ítems)', () => {
    assert.strictEqual(fichaReal('PSR2-F2-CPC-CAL-GLB-FOR-0001').titulo, 'EXCAVACION NO CLASIFICADA PARA ESTRUCTURAS');
    assert.strictEqual(fichaReal('PSR2-F2-CPC-CAL-GLB-FOR-0005').items.length, 7);
  });
  t('PTS-0019: N / M / I / S, medidas A-B-C-D por ítem y cierre SÍ/NO; ignora la hoja oculta "FI (2)"', () => {
    const e = fichaReal('PSR2-F2-CPC-CAL-PTS-FOR-0019');
    igual(e.opciones.map((o) => o.v + '=' + o.d), ['N=Ninguna', 'M=Menor', 'I=Investigar', 'S=Sustancial']);
    assert.strictEqual(e.items.length, 11);
    assert.ok(!/\[12\.1\]/.test(e.items[0].descripcion), 'tomó la hoja oculta');
    igual(e.enCelda.filter((c) => c.item === '8').map((c) => c.huecos.join('/')), ['A', 'B', 'C', 'D', 'Conclusión']);
    const cierre = e.enCelda.filter((c) => !c.item);
    igual(cierre.map((c) => c.celda), ['A28', 'A29']);
  });
  t('PTS-0006: líneas "____" dentro de la descripción del ítem se llenan escribiendo (f\'c, volumen, aditivos…)', () => {
    const e = fichaReal('PSR2-F2-CPC-CAL-PTS-FOR-0006');
    igual(e.enCelda.map((c) => c.celda + '=' + c.item), ['D19=6', 'D20=7', 'D21=8', 'D22=9', 'D23=10', 'D24=11']);
    igual(e.enCelda[0].huecos, ["f'c (kg/cm2)"]);
    assert.strictEqual(e.enCelda[2].huecos.length, 2);
    assert.strictEqual(C.rellenarEnCelda(e.enCelda[1].texto, { h: ['12.5'] }), 'Volumen de concreto: 12.5 m3');
    igual(fichaReal('PSR2-F2-CPC-CAL-EMD-FOR-0001').enCelda, []);
  });
  t('PTS-0018: tabla por columnas (Apoyo 1…4), 3 secciones como títulos y celdas "/" (x / y); PTS-0002 estándar', () => {
    const e = fichaReal('PSR2-F2-CPC-CAL-PTS-FOR-0018');
    if (!e) return;
    assert.strictEqual(e.modo, 'columnas');
    igual(e.valores.map((v) => v.etiqueta), ['Apoyo 1', 'Apoyo 2', 'Apoyo 3', 'Apoyo 4']);
    assert.strictEqual(e.items.length, 28);
    igual([...new Set(e.items.map((i) => i.grupo))], ['ANTES DE LA INSTALACIÓN', 'INSTALACIÓN', 'A PARTIR DEL SERVICIO']);
    assert.strictEqual(e.items.filter((i) => i.barras.length).length, 4); // ítems 19, 21, 26 y 27
    assert.strictEqual(e.cols.obs, 'I');
    const d = fichaReal('PSR2-F2-CPC-CAL-PTS-FOR-0002');
    if (d) { assert.strictEqual(d.titulo, 'DEMOLICIÓN'); assert.strictEqual(d.items.length, 8); }
  });
  t('GLB-0007: Si/No/N/A y 8 datos propios de recepción de materiales', () => {
    const e = fichaReal('PSR2-F2-CPC-CAL-GLB-FOR-0007');
    assert.strictEqual(e.items.length, 19);
    igual(e.extras.map((x) => x.etiqueta), ['Descripción del material', 'Fecha de recepción', 'Cantidad recibida', 'N° Guía de remisión',
      'Frente de Aplicación', 'Certificado de Calidad', 'Fabricante', 'Proveedor']);
    assert.ok(e.campos.some((c) => c.clave === 'fecha'), 'FECHA DE VERIFICACIÓN = fecha');
  });
}

console.log('LOG de liberaciones (Calidad)');
t('CPC: corrige acrónimos ya analizados, fase G2 y dígitos; el sufijo A se conserva', () => {
  assert.strictEqual(C.corregirCPC('GNTI-F2-0026').cpc, 'GNT1-F2-0026');
  assert.strictEqual(C.corregirCPC('GNT1-G2-0018').cpc, 'GNT1-F2-0018');
  assert.strictEqual(C.corregirCPC('ENC-CONT-F2-0003').cpc, 'ENC-MCONT-F2-0003');
  assert.strictEqual(C.corregirCPC('CPRE-MCONT-F2-0007').cpc, 'CPREM-MCONT-F2-0007');
  assert.strictEqual(C.corregirCPC('RG-F2-001').cpc, 'RG-F2-001', 'el número no se cambia');
  assert.strictEqual(C.corregirCPC('EXCNC-F2-001A').cpc, 'EXCNC-F2-001A');
  assert.strictEqual(C.opcionDeLista('MUROS M-N01 TRAMO 2', ['MURO MN01 - TRAMO 1', 'MURO MN01 - TRAMO 2']), 'MURO MN01 - TRAMO 2');
  assert.strictEqual(C.opcionDeLista('ACERO DE REFUERZO', ['ACERO DE REFUERZO FY = 4200 KG/CM²']), '', 'no agrega números');
  assert.strictEqual(C.opcionDeLista('RIO RIMAC', ['RÍO RÍMAC - MI (MARGEN IZQUIERDA)', 'RÍO RÍMAC - CAUCE']), '', 'dos opciones: queda tal cual');
  assert.strictEqual(C.opcionDeLista('3.1.7. SUBBASE GRANULAR', ['SUBBASE GRANULAR', 'BASE GRANULAR']), 'SUBBASE GRANULAR');
  assert.strictEqual(C.corregirCPC('WSTOP-MCONT-F2-0010A').cambios.length, 0);
  assert.strictEqual(C.duenoPorNombre('JENNY SANCHEZ', [{ Correo: 'j@x', Nombre: 'Jenny Sánchez Vásquez' }]), 'j@x');
});
t('análisis del LOG: sin correlativo, repetidos y saltos de más de 10 quedan observados; el dueño sale de QC', () => {
  const fila = (n, b, d, extra) => Object.assign({ fila: n + 3, A: String(n), B: b, D: d, E: 'X', Z: 'LESLLYE SALAZAR' }, extra || {});
  const a = C.analizarLog([fila(1, DRB + '0001', 'ENR-F2-0001'), fila(2, DRB + '0002', 'ENR-F2-0002'), fila(3, DRB + '0002', 'ENR-F2-0002'),
    fila(4, '', 'ENR-F2-0003'), fila(5, DRB + '0015', 'ENR-F2-0004'), fila(6, DRB + '0016', 'GNTI-F2-0001', { Z: 'JONATHAN CAMARENA' })], {
    prefijos: { 'PSR2-F2-CPC-DRB-GLB-RGI': S_DRB }, existentes: {}, enLog: {}, cpcUsados: {}, acronimos: { ENR: true, GNT1: true },
    usuarios: [{ Correo: LES, Nombre: 'Lesllye Salazar' }] });
  const m = (n) => a.filas[n - 1].motivos.join(' | ');
  assert.strictEqual(m(1), '');
  assert.ok(/repetido en el LOG/.test(m(2)) && /repetido en el LOG/.test(m(3)) && /CPC repetido/.test(m(3)));
  assert.ok(a.filas[1].crear && !a.filas[2].crear, 'el repetido se registra una sola vez');
  assert.ok(/Sin correlativo ingeniero/.test(m(4)));
  assert.ok(/Salto de 12/.test(m(5)), m(5));
  assert.strictEqual(a.filas[5].corregidos.CPC, 'GNTI-F2-0001'); assert.ok(!/GNTI/.test(m(6)), 'lo corregido no es observación');
  assert.strictEqual(a.filas[0].log.Usuario, LES); assert.strictEqual(a.filas[5].log.Usuario, '');
  assert.strictEqual(a.contadores[S_DRB], 16);
});
const logXlsx = pathT.join(baseT, 'resumen log-acronimos- analisis.xlsx');
if (fsT.existsSync(logXlsx)) {
  const env2 = crearEntorno(); env2.contexto.setup();
  const ok2 = (r) => { if (!r.ok) throw new Error(r.error); return r.data; };
  const p2 = env2.login(PROP), l2 = env2.login(LES), b64 = fsT.readFileSync(logXlsx).toString('base64');
  t('carga del LOG real: todo entra, observadas con motivo, contadores y CPC corregido en el sistema', () => {
    const e = ok2(env2.llamar('log.ejecutar', { base64: b64 }, p2));
    assert.ok(e.filas > 500 && e.observadas > 0 && e.codigos > 500);
    const l = ok2(env2.llamar('log.listar', {}, p2));
    assert.strictEqual(l.length, e.filas);
    const g = l.find((x) => x.CPC_Original === 'GNTI-F2-0026');
    assert.ok(g && g.CPC === 'GNT1-F2-0026' && /GNTI-F2-0026/.test(g.Corregidos));
    assert.ok(ok2(env2.llamar('registros.codigosCPC', {}, p2)).includes('GNT1-F2-0026'));
    assert.strictEqual(ok2(env2.llamar('log.previsualizar', { base64: b64 }, p2)).cargar, 0, 'volver a cargar no duplica');
  });
  t('al crear a Jonathan Camarena sus 107 filas del LOG (QC) pasan a ser suyas; no cambia dueños existentes', () => {
    const sinDueno = () => ok2(env2.llamar('log.listar', {}, p2)).filter((l) => /CAMARENA/.test(l.QC) && !l.Usuario).length;
    const antes = ok2(env2.llamar('log.listar', {}, p2));
    assert.strictEqual(sinDueno(), 107);
    const u = ok2(env2.llamar('usuarios.guardar', { Nombre: 'Jonathan Camarena', Usuario: 'jcamarena', Clave: 'Inicio2026', Rol: 'Operador', Area: 'Calidad', Activo: true }, p2));
    const despues = ok2(env2.llamar('log.listar', {}, p2));
    assert.strictEqual(despues.filter((l) => l.Usuario === u.Correo).length, 107);
    assert.strictEqual(sinDueno(), 0);
    let cambiadas = 0; antes.forEach((l, i) => { if (l.Usuario && l.Usuario !== despues[i].Usuario) cambiadas++; });
    assert.strictEqual(cambiadas, 0, 'los dueños que ya tenían no cambian');
  });
  t('resumen por grupo (EMD · GLB · PTS) según la columna V: CERRADO verde, ABIERTO rojo, vacío pendiente', () => {
    const r = ok2(env2.llamar('log.resumen', {}, p2));
    const g = Object.fromEntries(r.calidad.map((x) => [x.grupo, x]));
    igual([g.EMD.concluidos, g.EMD.observados, g.EMD.pendientes], [144, 0, 51]);
    igual([g.GLB.concluidos, g.GLB.observados], [239, 18]);
    igual([g.PTS.concluidos, g.PTS.observados, g.PTS.pendientes], [61, 26, 32]);
    const tot = r.calidad.reduce((a, g) => a + g.total, 0);
    assert.strictEqual(tot, r.calidadFilas);
    igual(r.calidad.map((g) => g.grupo), ['EMD', 'GLB', 'PTS']);
    r.calidad.forEach((g) => assert.strictEqual(g.concluidos + g.pendientes + g.observados, g.total));
    assert.ok(r.topografia && r.topografia.length === 3);
  });
  t('LOG: el dueño corrige su fila; ESTATUS/TRANSMITAL/ACONEX solo Control Documentario o superiores', () => {
    const l = ok2(env2.llamar('log.listar', {}, p2));
    const mia = l.find((x) => x.Usuario === LES), ajena = l.find((x) => x.Usuario && x.Usuario !== LES);
    assert.strictEqual(ok2(env2.llamar('log.editar', { id: mia.ID, cambios: { Observacion: 'ok' } }, l2)).Observacion, 'ok');
    const otro = mia.Estatus === 'ABIERTO' ? 'CERRADO' : 'ABIERTO';
    falla(env2.llamar('log.editar', { id: mia.ID, cambios: { Estatus: otro } }, l2), 'PERMISO');
    falla(env2.llamar('log.editar', { id: ajena.ID, cambios: { Observacion: 'x' } }, l2), 'PERMISO');
    const nuevo = ajena.Estatus === 'ABIERTO' ? 'CERRADO' : 'ABIERTO';
    assert.strictEqual(ok2(env2.llamar('log.editar', { id: ajena.ID, cambios: { Estatus: nuevo } }, p2)).Estatus, nuevo);
  });
  t('descarga del LOG: mismo Excel, filas iguales a las cargadas (salvo lo corregido)', () => {
    const d = ok2(env2.llamar('log.descargar', {}, p2));
    const leer = (b) => env2.contexto.leerLogXlsx_(env2.contexto.Utilities.newBlob([...b], 'x', 'x')).filas;
    const a = leer(Buffer.from(b64, 'base64')), z = leer(Buffer.from(d.base64, 'base64'));
    assert.strictEqual(z.length, a.length);
    let dif = 0; a.forEach((f, i) => Object.keys(f).forEach((k) => { if (k !== 'fila' && String(f[k]).trim() !== String(z[i][k]).trim()) dif++; }));
    assert.strictEqual(dif, 2, 'solo Observación y Estatus cambiados');
  });
}

console.log(`\n${ok} pruebas OK${process.exitCode ? ' — HAY FALLAS' : ''}`);
