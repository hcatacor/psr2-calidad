import { CONFIG, pruebasDisponibles, elegirEntorno } from './config.js';
import { api, onSesionPerdida } from './api.js';
import { S, guardarToken, leerToken, aplicarBootstrap, puede, guardarProyecto, leerProyecto, guardarCopia, leerCopia, borrarCopia } from './state.js';
import { $, esc, ico, toast, cargando } from './util.js';
import { LOGOS_INGRESO, marcaDe } from './marca.js';
import * as panel from './vistas/panel.js';
import * as codigos from './vistas/codigos.js';
import * as auditor from './vistas/auditor.js';
import * as historial from './vistas/historial.js';
import * as admin from './vistas/admin.js';
import * as log from './vistas/log.js';

const VISTAS = [
  { id: 'panel', titulo: 'Panel', icono: 'panel', vista: panel, ver: () => true },
  { id: 'codigos', titulo: 'Códigos', icono: 'codigos', vista: codigos, ver: () => true },
  { id: 'log', titulo: 'LOG', icono: 'log', vista: log, ver: () => log.veLog() },
  { id: 'auditor', titulo: 'Auditor', icono: 'auditor', vista: auditor, ver: () => puede('historial') || puede('auditar') },
  { id: 'historial', titulo: 'Historial', icono: 'historial', vista: historial, ver: () => puede('historial') },
  { id: 'admin', titulo: 'Administración', icono: 'admin', vista: admin, ver: () => puede('administrar') || puede('documentar') || puede('plantillas') },
];

// ---------------------------------------------------------------- Datos
export async function cargarRegistros({ silencioso = false } = {}) {
  if (!silencioso) cargando(true, 'Cargando códigos…');
  try {
    S.registros = await api('registros.listar');
    S.registrosEn = Date.now();
  } finally {
    if (!silencioso) cargando(false);
  }
}

/** Recarga la configuración; con inicio=true trae también códigos y resumen en el mismo viaje. */
export async function recargarBootstrap(inicio = false) {
  aplicarBootstrap(await api('bootstrap', inicio ? { inicio: true } : {}));
  if (inicio) guardarCopia();
  pintarCabecera();
}

/** Vuelve a dibujar la vista actual (tras cambios de datos). */
export function refrescarVista() {
  router();
}

// ---------------------------------------------------------------- Login
// Período de pruebas: franja fija para que nadie lo confunda con la app real
const TITULO = document.title;
function pintarEntorno() {
  let f = document.querySelector('.franja-entorno');
  if (CONFIG.ENTORNO) {
    if (!f) { f = document.createElement('div'); f.className = 'franja-entorno'; document.body.prepend(f); }
    f.textContent = 'PERÍODO DE PRUEBAS · datos de práctica, no son registros reales';
    document.title = '[PRUEBAS] ' + TITULO;
  } else {
    if (f) f.remove();
    document.title = TITULO;
  }
}
pintarEntorno();

function mostrarLogin(mensaje = '', info = false) {
  $('#app').hidden = true;
  $('#elegir').hidden = true;
  $('#login').hidden = false;
  $('#logos-ingreso').innerHTML = LOGOS_INGRESO.map((m) => `<img src="${esc(m.logo)}" alt="${esc(m.consorcio)}">`).join('');
  const msg = $('#login-msg');
  msg.textContent = mensaje;
  msg.className = 'login-msg' + (info ? ' info' : '');
  $('#login-form').onsubmit = (e) => { e.preventDefault(); ingresar($('#l-usuario').value.trim(), $('#l-clave').value); };
  // Selector de ambiente (solo mientras dure el período de pruebas)
  const sel = $('#entorno-sel');
  if (pruebasDisponibles()) {
    const fin = CONFIG.PRUEBAS_HASTA.split('-').reverse().join('/');
    sel.innerHTML = `<span class="small muted">Ingresar a</span>
      <div class="segs"><button type="button" class="seg ${CONFIG.ENTORNO ? '' : 'on'}" data-ent="">App real</button>
        <button type="button" class="seg ${CONFIG.ENTORNO ? 'on on-NO' : ''}" data-ent="PRUEBAS">Período de pruebas</button></div>
      <span class="small muted">${CONFIG.ENTORNO ? 'Datos de práctica, separados de la app real. Entra con tu mismo usuario y contraseña de la App real.' : `Período de pruebas disponible hasta el ${fin}.`}</span>`;
    sel.querySelectorAll('[data-ent]').forEach((b) => {
      b.onclick = () => { elegirEntorno(b.dataset.ent); pintarEntorno(); S.token = leerToken(); mostrarLogin(); };
    });
  } else sel.innerHTML = '';
  if (CONFIG.DEV) {
    // Solo servidor de desarrollo local (dev/server.js): accesos rápidos con la contraseña de prueba.
    $('#dev-login').innerHTML = `<div style="display:flex;flex-direction:column;gap:8px;width:100%">
      <span class="small muted">Modo desarrollo: entrar como…</span>
      ${CONFIG.DEV_USUARIOS.map((u) => `<button class="btn btn-block" type="button" data-dev="${esc(u.correo)}" data-u="${esc(u.usuario)}">${esc(u.nombre)} · ${esc(u.usuario)}</button>`).join('')}</div>`;
    document.querySelectorAll('[data-dev]').forEach((b) => { b.onclick = () => ingresar(b.dataset.u, CONFIG.DEV_CLAVE); });
  } else if (CONFIG.API_URL.startsWith('PEGAR')) {
    msg.textContent = 'Falta configurar API_URL en js/config.js (ver README).';
    msg.className = 'login-msg';
  }
}

async function ingresar(usuario, clave) {
  if (!usuario || !clave) { mostrarLogin('Escribe tu usuario y contraseña.'); return; }
  cargando(true, 'Verificando…');
  try {
    const r = await api('login', { usuario, clave, proyecto: leerProyecto(), inicio: true });
    guardarToken(r.token);
    S.registrosEn = 0;
    aplicarBootstrap(r);
    if (!r.cambiarClave) guardarCopia();
    $('#l-clave').value = '';
    if (r.cambiarClave) { pedirCambioClave(true); return; }
    await continuarIngreso();
  } catch (e) {
    mostrarLogin(e.message);
  } finally {
    cargando(false);
  }
}

async function continuarIngreso() {
  if (S.proyectos.length > 1) elegirProyecto();
  else await iniciarApp();
}

/** Cambio de contraseña: obligatorio tras la temporal; también desde el menú del usuario. */
export function pedirCambioClave(obligatorio = false) {
  $('#login').hidden = true; $('#elegir').hidden = true; $('#app').hidden = true; $('#cambiar').hidden = false;
  $('#cambiar-hola').textContent = obligatorio
    ? `Hola, ${S.usuario.Nombre}. Ingresaste con una contraseña temporal: crea una propia para continuar.`
    : `${S.usuario.Nombre}, cambia tu contraseña.`;
  $('#cambiar-msg').textContent = '';
  ['#c-actual', '#c-nueva', '#c-repite'].forEach((s) => { $(s).value = ''; });
  $('#cambiar-form').onsubmit = async (e) => {
    e.preventDefault();
    const actual = $('#c-actual').value, nueva = $('#c-nueva').value;
    if (nueva !== $('#c-repite').value) { $('#cambiar-msg').textContent = 'Las dos contraseñas nuevas no coinciden.'; return; }
    cargando(true, 'Guardando…');
    try {
      await api('cuenta.cambiarClave', { actual, nueva });
      $('#cambiar').hidden = true;
      toast('Contraseña actualizada', 'ok');
      if (obligatorio) await continuarIngreso(); else { $('#app').hidden = false; }
    } catch (er) { $('#cambiar-msg').textContent = er.message; } finally { cargando(false); }
  };
  setTimeout(() => $('#c-actual').focus(), 50);
}

/** Al ingresar, quien tiene acceso a varios proyectos elige a cuál entra. */
function elegirProyecto() {
  $('#login').hidden = true;
  $('#app').hidden = true;
  $('#elegir').hidden = false;
  $('#elegir-hola').textContent = `Hola, ${S.usuario.Nombre}. Tienes acceso a ${S.proyectos.length} proyectos.`;
  $('#elegir-lista').innerHTML = S.proyectos.map((p) => {
    const m = marcaDe(p.ID_Proyecto);
    return `<button class="elegir-op" data-p="${esc(p.ID_Proyecto)}">
      <span class="logo-box">${m ? `<img src="${esc(m.logo)}" alt="">` : `<b>${esc(p.ID_Proyecto)}</b>`}</span>
      <span><b>${esc(p.Nombre)}</b><span class="small muted">${esc(p.ID_Proyecto)} · ${esc(m ? m.consorcio : p.Empresa)}</span></span></button>`;
  }).join('');
  document.querySelectorAll('[data-p]').forEach((b) => {
    b.onclick = async () => {
      cargando(true, 'Ingresando…');
      try {
        if (b.dataset.p !== S.proyecto) { guardarProyecto(b.dataset.p); S.registrosEn = 0; await recargarBootstrap(true); }
        $('#elegir').hidden = true;
        location.hash = '#/panel';
        await iniciarApp();
      } catch (e) { toast(e.message, 'err'); } finally { cargando(false); }
    };
  });
}

function cerrarSesion(mensaje = '') {
  guardarToken(null);
  borrarCopia();
  S.registros = []; S.registrosEn = 0; S.resumen = null; S.resumenEn = 0;
  location.hash = '';
  mostrarLogin(mensaje, !!mensaje);
}

onSesionPerdida((msg) => cerrarSesion(msg));

// ---------------------------------------------------------------- Layout
function pintarCabecera() {
  $('#brand-proyecto').textContent = S.config.Nombre || S.proyecto;
  const m = marcaDe(S.proyecto);
  $('#brand-logo').innerHTML = m ? `<img src="${esc(m.logo)}" alt="${esc(m.consorcio)}">`
    : '<span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 32 32"><rect width="32" height="32" rx="7"/><path d="M9 16.5l4.5 4.5L23 11.5"/></svg></span>';
  $('#user-chip').innerHTML = `<b>${esc(S.usuario.Nombre)}</b><span>${esc(S.usuario.Rol)}</span>`;
  // En Pruebas la contraseña es la de la App real: se cambia allá
  $('#user-chip').title = CONFIG.ENTORNO ? 'Tu contraseña se cambia en la App real' : 'Cambiar mi contraseña';
  $('#user-chip').onclick = CONFIG.ENTORNO ? () => toast('Tu contraseña es la misma de la App real: cámbiala allí.') : () => pedirCambioClave(false);
  const sel = $('#sel-proyecto');
  sel.hidden = S.proyectos.length < 2;
  sel.innerHTML = S.proyectos.map((p) => `<option value="${esc(p.ID_Proyecto)}" ${p.ID_Proyecto === S.proyecto ? 'selected' : ''}>${esc(p.ID_Proyecto)}</option>`).join('');
  const actual = (location.hash.replace(/^#\/?/, '').split('?')[0]) || 'panel';
  $('#nav').innerHTML = VISTAS.filter((v) => v.ver()).map((v) =>
    `<a href="#/${v.id}" class="${v.id === actual ? 'activo' : ''}">${ico(v.icono)}<span>${v.titulo}</span></a>`).join('');
}

async function iniciarApp() {
  $('#login').hidden = true;
  $('#elegir').hidden = true;
  $('#app').hidden = false;
  pintarCabecera();
  if (!S.registrosEn) await cargarRegistros(); // normalmente ya llegaron con el ingreso (un solo viaje)
  router();
}

export function router() {
  const [ruta, qs] = location.hash.replace(/^#\/?/, '').split('?');
  let v = VISTAS.find((x) => x.id === ruta && x.ver());
  if (!v) { v = VISTAS[0]; if (ruta) { location.hash = '#/panel'; return; } }
  pintarCabecera();
  const cont = $('#vista');
  cont.innerHTML = '';
  v.vista.render(cont, new URLSearchParams(qs || ''));
  document.title = v.titulo + ' · PSR2 Calidad';
}

window.addEventListener('hashchange', () => { if (S.token && S.usuario) router(); });

$('#btn-salir').onclick = () => cerrarSesion('Sesión cerrada.');
$('#sel-proyecto').onchange = async (e) => {
  try {
    cargando(true, 'Cambiando de proyecto…');
    guardarProyecto(e.target.value);
    S.registros = []; S.registrosEn = 0;
    await recargarBootstrap(true);
    location.hash = '#/panel';
    router();
    toast('Proyecto ' + S.proyecto);
  } catch (err) { toast(err.message, 'err'); } finally { cargando(false); }
};
$('#btn-refrescar').onclick = async () => {
  try {
    cargando(true, 'Actualizando…');
    await recargarBootstrap(true);
    router();
    toast('Datos actualizados');
  } catch (e) { toast(e.message, 'err'); } finally { cargando(false); }
};

// ---------------------------------------------------------------- Arranque
// Al ocultar la app (cambiar de pestaña, bloquear el celular) se guarda la copia con lo último visto
document.addEventListener('visibilitychange', () => { if (document.hidden && S.token && S.usuario) guardarCopia(); });

/** Trae los datos frescos sin bloquear la pantalla; solo redibuja si el usuario no está escribiendo ni en un diálogo. */
async function actualizarPorDetras() {
  const ruta = location.hash, btn = $('#btn-refrescar');
  btn.classList.add('girando');
  try {
    aplicarBootstrap(await api('bootstrap', { inicio: true }));
    guardarCopia();
    const ocupado = document.querySelector('.modal') || ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement && document.activeElement.tagName);
    if (location.hash === ruta && !ocupado) router(); else pintarCabecera();
  } catch (e) {
    if (e.code === 'RED') toast('Sin conexión: estás viendo los últimos datos guardados en este equipo.', 'err');
  } finally { btn.classList.remove('girando'); }
}

(async function arrancar() {
  const t = leerToken();
  if (!t) return mostrarLogin();
  guardarToken(t);
  S.proyecto = leerProyecto();
  const copia = leerCopia();
  if (copia && copia.b.proyecto === S.proyecto) {
    // Pantalla inmediata con lo último visto y actualización por detrás
    aplicarBootstrap(copia.b, copia.en);
    await iniciarApp();
    actualizarPorDetras();
    return;
  }
  cargando(true, 'Cargando…');
  try {
    aplicarBootstrap(await api('bootstrap', { inicio: true }));
    guardarCopia();
    await iniciarApp();
  } catch (e) {
    if (e.code === 'RED') mostrarLogin(e.message);
    else cerrarSesion();
  } finally {
    cargando(false);
  }
})();
