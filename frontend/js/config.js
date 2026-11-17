// Configuración del frontend (ver README). La misma web se publica dos veces:
//   /psr2-calidad/          → app REAL
//   /psr2-calidad/pruebas/  → AMBIENTE DE PRUEBAS (otra implementación de Apps Script, otra hoja; no toca la real)
const PRUEBAS = /\/pruebas\//.test(location.pathname);
const API_REAL = 'https://script.google.com/macros/s/AKfycbxgTDVQma7IEpdcEF3wn7pxWQaKUkQR_tEM7ykcSzMwJXwvWxmWhfyhx-jCr1MilNYmLA/exec';
const API_PRUEBAS = 'PEGAR_AQUI_URL_PRUEBAS/exec';
export const CONFIG = {
  // URL de la implementación de Apps Script (termina en /exec)
  API_URL: PRUEBAS ? API_PRUEBAS : API_REAL,
  ENTORNO: PRUEBAS ? 'PRUEBAS' : '',
};
