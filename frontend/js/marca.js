// Identidad visual por proyecto. La clave es el código de proyecto (ID_Proyecto).
// Para un proyecto nuevo: agregar su logo en frontend/img/ y una línea aquí.
export const MARCAS = {
  PSR2: { logo: 'img/logo-cpc.png', consorcio: 'Consorcio Puente Chalaco' },
  VERS: { logo: 'img/logo-proyecto2.png', consorcio: 'Consorcio Viaducto Chalaco' },
};

// Logos de la pantalla de ingreso: izquierda CPC, derecha segundo proyecto.
export const LOGOS_INGRESO = [MARCAS.PSR2, MARCAS.VERS];

export const marcaDe = (proyecto) => MARCAS[proyecto] || null;
