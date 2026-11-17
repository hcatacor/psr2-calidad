import { CONFIG } from './config.js';
import { S } from './state.js';

export class ApiError extends Error {
  constructor(mensaje, code, extra) {
    super(mensaje);
    this.code = code || 'ERROR';
    this.extra = extra || null;
  }
}

let alPerderSesion = () => {};
export function onSesionPerdida(fn) { alPerderSesion = fn; }

/** Llama a la API de Apps Script. text/plain evita el preflight CORS. */
export async function api(action, data = {}) {
  let res;
  try {
    res = await fetch(CONFIG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, token: S.token, proyecto: S.proyecto, data }),
      redirect: 'follow',
    });
  } catch (e) {
    throw new ApiError('Sin conexión con el servidor. Revisa tu internet e intenta de nuevo.', 'RED');
  }
  if (!res.ok) throw new ApiError('Error del servidor (' + res.status + ').', 'RED');
  let j;
  try { j = await res.json(); } catch (e) { throw new ApiError('Respuesta inválida del servidor.', 'RED'); }
  if (!j.ok) {
    if (['SESION', 'NO_REGISTRADO', 'INACTIVO', 'CAMBIAR_CLAVE'].includes(j.code) && action !== 'login') alPerderSesion(j.error);
    throw new ApiError(j.error, j.code, j.extra);
  }
  return j.data;
}
