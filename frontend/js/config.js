// Configuración del frontend (ver README).
// Una sola web. Durante el período de pruebas, en la pantalla de ingreso se elige "App real" o "Período de pruebas".
// Pruebas usa OTRA implementación de Apps Script con OTRA hoja (sufijo "(PRUEBAS)"): nunca altera la app real.
const API_REAL = 'https://script.google.com/macros/s/AKfycbxgTDVQma7IEpdcEF3wn7pxWQaKUkQR_tEM7ykcSzMwJXwvWxmWhfyhx-jCr1MilNYmLA/exec';
const API_PRUEBAS = 'https://script.google.com/macros/s/AKfycbx4aqDwzUD04yOV9-Bt6hBFJE1m8vPPa1d6sU47p_eHJRELdODVaww4-Kd-BFVxntE7/exec';
// Desde esta fecha el selector desaparece solo y queda únicamente la app real (vaciar API_PRUEBAS lo quita antes).
const PRUEBAS_HASTA = '2026-12-01';

const CLAVE_ENT = 'psr2cal.entorno';
const leerEnt = () => { try { return localStorage.getItem(CLAVE_ENT) || ''; } catch (e) { return ''; } };

/** ¿Se ofrece el período de pruebas en la pantalla de ingreso? */
export const pruebasDisponibles = () => !!API_PRUEBAS && new Date().toISOString().slice(0, 10) < PRUEBAS_HASTA;
/** Guarda el ambiente elegido ('PRUEBAS' o '' = real). */
export function elegirEntorno(e) { try { e ? localStorage.setItem(CLAVE_ENT, e) : localStorage.removeItem(CLAVE_ENT); } catch (x) { /* sin storage */ } }

export const CONFIG = {
  get ENTORNO() { return pruebasDisponibles() && leerEnt() === 'PRUEBAS' ? 'PRUEBAS' : ''; },
  // URL de la implementación de Apps Script (termina en /exec)
  get API_URL() { return this.ENTORNO ? API_PRUEBAS : API_REAL; },
  PRUEBAS_HASTA,
};
