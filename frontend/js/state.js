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
};

const CLAVE = 'psr2cal.token';
const CLAVE_P = 'psr2cal.proyecto';

function guardar(k, v) {
  try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch (e) { /* sin storage */ }
}
function leer(k) {
  try { return localStorage.getItem(k); } catch (e) { return null; }
}

export function guardarToken(t) { S.token = t; guardar(CLAVE, t); }
export function leerToken() { return leer(CLAVE); }
export function guardarProyecto(p) { S.proyecto = p; guardar(CLAVE_P, p); }
export function leerProyecto() { return leer(CLAVE_P) || ''; }

export function aplicarBootstrap(b) {
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
