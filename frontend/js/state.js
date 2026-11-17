import { CONFIG } from './config.js';
// Estado global de la sesión.
export const S = {
  token: null,
  app: null,
  usuario: null,
  permisos: {},
  rolesAsignables: [],
  config: {},
  proyecto: '',
  proyectos: [],
  series: [],
  catalogos: [],
  formatos: [],
  usuarios: [],
  marcadores: [],
  registros: [],
  registrosEn: 0,
  resumen: null,
  resumenEn: 0,
};

// Sesión separada por ambiente (real / período de pruebas): nunca se cruzan
const PREF = () => (CONFIG.ENTORNO ? 'psr2cal.pruebas.' : 'psr2cal.');
const CLAVE = () => PREF() + 'token';
const CLAVE_P = () => PREF() + 'proyecto';

function guardar(k, v) {
  try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch (e) { /* sin storage */ }
}
function leer(k) {
  try { return localStorage.getItem(k); } catch (e) { return null; }
}

export function guardarToken(t) { S.token = t; guardar(CLAVE(), t); }
export function leerToken() { return leer(CLAVE()); }
export function guardarProyecto(p) { S.proyecto = p; guardar(CLAVE_P(), p); }
export function leerProyecto() { return leer(CLAVE_P()) || ''; }

// Copia local de lo último que vio el usuario: la app abre al instante y se actualiza por detrás.
// Se borra al cerrar sesión.
const CLAVE_C = () => PREF() + 'copia';
const CAMPOS_COPIA = ['app', 'usuario', 'permisos', 'rolesAsignables', 'config', 'proyecto', 'proyectos', 'series', 'catalogos', 'formatos', 'usuarios', 'marcadores', 'registros', 'resumen'];
export function guardarCopia() {
  if (!S.usuario) return;
  const b = {};
  CAMPOS_COPIA.forEach((k) => { b[k] = S[k]; });
  try { localStorage.setItem(CLAVE_C(), JSON.stringify({ en: Date.now(), b })); } catch (e) { borrarCopia(); /* sin espacio: sin copia */ }
}
export function leerCopia() {
  try { const c = JSON.parse(localStorage.getItem(CLAVE_C()) || 'null'); return c && c.b && c.b.usuario ? c : null; } catch (e) { return null; }
}
export function borrarCopia() { try { localStorage.removeItem(CLAVE_C()); } catch (e) { /* sin storage */ } }

export function aplicarBootstrap(b, en = Date.now()) {
  if (b.registros) { S.registros = b.registros; S.registrosEn = en; }
  if ('resumen' in b) { S.resumen = b.resumen; S.resumenEn = en; }
  S.app = b.app;
  S.usuario = b.usuario;
  S.permisos = b.permisos;
  S.rolesAsignables = b.rolesAsignables || [];
  S.config = b.config;
  S.proyectos = b.proyectos || [];
  S.series = b.series;
  S.catalogos = b.catalogos || [];
  S.formatos = b.formatos || [];
  S.usuarios = b.usuarios;
  S.marcadores = b.marcadores || [];
  guardarProyecto(b.proyecto);
}

/** Reemplaza (o agrega) registros devueltos por el servidor en el estado local. */
export function upsertRegistros(lista) {
  [].concat(lista).forEach((r) => {
    const i = S.registros.findIndex((x) => x.Codigo_Completo === r.Codigo_Completo);
    if (i >= 0) S.registros[i] = r; else S.registros.push(r);
  });
}

export const puede = (cap) => !!S.permisos[cap];
export const soyYo = (correo) => !!correo && S.usuario && correo.toLowerCase() === S.usuario.Correo.toLowerCase();
