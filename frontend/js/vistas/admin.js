import { api } from '../api.js';
import { S, puede, soyYo } from '../state.js';
import { $, esc, ico, opciones, modal, toast, tarea, confirmar, archivoParaApi,
  serieActiva, TIPOS_CAT, etiquetaCat, codigoVisual } from '../util.js';
import { recargarBootstrap } from '../app.js';
import { CONFIG } from '../config.js';

const ORDEN_ROLES = ['Propietario', 'Coordinador General', 'Jefe de Área', 'Control Documentario', 'Auditor', 'Operador', 'Visitante'];
const AREAS = ['Calidad', 'Topografía', 'Control documentario', 'Otro'];
const AREAS_SERIE = ['Calidad', 'Topografía'];
const TIPOS_PROTO = [['Partida', 'Partidas (actividad del protocolo)'], ['Acronimo', 'Acrónimos CPC'], ['Disciplina', 'Especialidad en la ficha'], ['Localizacion', 'Localización']];
const etiquetaTipo = (t) => (TIPOS_CAT.concat(TIPOS_PROTO).find((x) => x[0] === t) || [t, t])[1];
let tab = '';

function pestanas() {
  return [
    ['usuarios', 'Usuarios', puede('administrar')],
    ['catalogos', 'Catálogos', puede('documentar')],
    ['series', 'Series y fases', puede('documentar')],
    ['formatos', 'Formatos', puede('plantillas')],
    ['proyecto', 'Proyecto', puede('administrar')],
  ].filter((x) => x[2]);
}

export function render(el) {
  const tabs = pestanas();
  if (!tabs.some((t) => t[0] === tab)) tab = tabs[0][0];
  el.innerHTML = `
    <div class="page-head"><div><h1>Administración</h1><p>${esc(S.config.Nombre || S.proyecto)} · ${esc(S.usuario.Rol)}</p></div></div>
    <div class="tabs" role="tablist">${tabs.map(([k, t]) => `<button data-tab="${k}" class="${tab === k ? 'activo' : ''}">${t}</button>`).join('')}</div>
    <div id="adm"></div>`;
  el.querySelectorAll('[data-tab]').forEach((b) => { b.onclick = () => { tab = b.dataset.tab; render(el); }; });
  ({ usuarios, catalogos, series, formatos, proyecto })[tab]($('#adm', el), el);
}

const recargar = async (el) => { await recargarBootstrap(); render(el); };
const editable = (u) => soyYo(u.Correo) || ORDEN_ROLES.indexOf(u.Rol) > ORDEN_ROLES.indexOf(S.usuario.Rol);

// ---------------------------------------------------------------- Usuarios
function usuarios(c, root) {
  const lista = [...S.usuarios].sort((a, b) => ORDEN_ROLES.indexOf(a.Rol) - ORDEN_ROLES.indexOf(b.Rol) || a.Nombre.localeCompare(b.Nombre));
  const cuenta = (correo) => S.registros.filter((r) => r.Usuario === correo).length;
  c.innerHTML = `<div class="card">
    <div class="card-head"><h2>Usuarios de ${esc(S.proyecto)} (${lista.length})</h2>${CONFIG.ENTORNO ? '' : `<button class="btn btn-primary btn-sm" id="u-nuevo">${ico('mas')}Nuevo usuario</button>`}</div>
    ${CONFIG.ENTORNO ? '<div class="card-pad small" style="padding-top:0"><b>Período de pruebas:</b> estos son los mismos usuarios de la App real. Para crear usuarios, cambiar roles o contraseñas, hazlo en la <b>App real</b>; aquí se actualizan solos.</div>' : ''}
    <div class="tabla-wrap"><table class="tabla stack"><thead><tr><th>Nombre completo</th><th>Usuario</th><th>Rol</th><th>Área</th><th>Estado</th><th class="num">Códigos</th></tr></thead><tbody>
      ${lista.map((u) => `<tr class="${!CONFIG.ENTORNO && editable(u) ? 'click' : ''}" data-correo="${esc(u.Correo)}"><td class="td-main">${esc(u.Nombre)}</td>
        <td data-l="Usuario" class="mono">${esc(u.Usuario) || '<span class="muted">sin usuario</span>'}${u.Bloqueado ? ' <span class="badge b-Observado">Bloqueado</span>' : ''}</td>
        <td data-l="Rol"><span class="badge b-rol">${esc(u.Rol)}</span>${u.Global ? ' <span class="badge b-off">Todos los proyectos</span>' : ''}${u.Carga_Data ? ' <span class="badge b-Cargado">DATA</span>' : ''}</td><td data-l="Área">${esc(u.Area)}</td>
        <td data-l="Estado">${u.Activo ? '<span class="badge b-Validado">Activo</span>' : '<span class="badge b-off">Inactivo</span>'}</td>
        <td data-l="Códigos" class="num">${cuenta(u.Correo)}</td></tr>`).join('')}
    </tbody></table></div></div>
    <div class="card card-pad small muted">
      <b>Jerarquía:</b> Propietario → Coordinador General (ambos proyectos) → Jefe de Área → Control Documentario → Auditor / Operador → Visitante.
      Cada uno gestiona solo a usuarios de nivel inferior. Una misma persona puede tener un rol distinto en cada proyecto.
      Se ingresa con <b>usuario y contraseña</b>: al crear el usuario se le da una contraseña inicial y la cambia en su primer ingreso.
      Si la olvida, ábrelo y usa <b>Restablecer contraseña</b>. Los usuarios nunca acceden al Sheet ni a Drive: todo es a través de la aplicación.
    </div>`;
  if (CONFIG.ENTORNO) return; // en Pruebas los usuarios solo se ven: se gestionan en la App real
  $('#u-nuevo', c).onclick = () => editarUsuario(null, root);
  c.querySelectorAll('tr.click[data-correo]').forEach((tr) => { tr.onclick = () => editarUsuario(S.usuarios.find((u) => u.Correo === tr.dataset.correo), root); });
}

function editarUsuario(u, root) {
  const propio = u && soyYo(u.Correo);
  const roles = S.rolesAsignables;
  const m = modal({
    titulo: u ? 'Editar usuario' : 'Nuevo usuario',
    cuerpo: `
      ${propio ? '<div class="aviso aviso-info">Es tu propio usuario: solo puedes cambiar tu nombre y área. Tu contraseña la cambias tocando tu nombre arriba.</div>' : ''}
      <div class="form-grid">
        <div class="field span-all"><label>Nombre completo</label><input id="u-nombre" value="${esc(u?.Nombre)}" maxlength="100" placeholder="Nombres y apellidos"></div>
        <div class="field"><label>Usuario (para ingresar)</label><input id="u-usuario" value="${esc(u?.Usuario)}" maxlength="30" autocapitalize="none" spellcheck="false" placeholder="ej. lsalazar" ${propio ? 'readonly' : ''}>
          <span class="hint">Minúsculas, números, punto o guion.</span></div>
        ${u ? '' : `<div class="field"><label>Contraseña inicial</label><div style="display:flex;gap:6px"><input id="u-clave" maxlength="40" autocomplete="off" style="flex:1"><button class="btn btn-sm" type="button" id="u-gen">Generar</button></div>
          <span class="hint">Mín. 8, con letras y números. La cambiará al primer ingreso.</span></div>`}
        <div class="field"><label>Rol</label><select id="u-rol" ${propio ? 'disabled' : ''}>${propio ? opciones([u.Rol], u.Rol) : opciones(roles, u?.Rol || 'Operador')}</select>
          <span class="hint" id="u-hint"></span></div>
        <div class="field"><label>Área</label><select id="u-area">${opciones(AREAS, u?.Area || 'Calidad')}</select></div>
        ${propio ? '' : `<label class="chk span-all"><input type="checkbox" id="u-activo" ${!u || u.Activo ? 'checked' : ''}> Activo (puede ingresar)</label>
        <label class="chk span-all" id="u-data-row"><input type="checkbox" id="u-data" ${u?.Carga_Data ? 'checked' : ''}> Encargado de DATA: puede cargar y descargar data de su área</label>`}
      </div>`,
    pie: `${u && !propio ? '<button class="btn" id="u-reset" style="margin-right:auto">Restablecer contraseña</button>' : ''}<button class="btn" data-cerrar>Cancelar</button><button class="btn btn-primary" id="u-ok">Guardar</button>`,
  });
  const genClave = () => { const a = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz', d = '23456789'; let s = '';
    for (let i = 0; i < 6; i++) s += a[Math.floor(Math.random() * a.length)]; for (let i = 0; i < 4; i++) s += d[Math.floor(Math.random() * d.length)]; return s; };
  const sugerirUsuario = () => { const n = $('#u-nombre', m.el).value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/\s+/).filter(Boolean);
    return n.length > 1 ? (n[0][0] + n[1]).replace(/[^a-z0-9._-]/g, '') : (n[0] || '').replace(/[^a-z0-9._-]/g, ''); };
  if (!u) {
    $('#u-clave', m.el).value = genClave();
    $('#u-gen', m.el).onclick = () => { $('#u-clave', m.el).value = genClave(); };
    $('#u-nombre', m.el).oninput = () => { const x = $('#u-usuario', m.el); if (!x.dataset.tocado) x.value = sugerirUsuario(); };
    $('#u-usuario', m.el).oninput = (e) => { e.target.dataset.tocado = '1'; };
  }
  const reset = $('#u-reset', m.el);
  if (reset) reset.onclick = async () => {
    if (!(await confirmar({ titulo: 'Restablecer contraseña', mensaje: `Se le dará a <b>${esc(u.Nombre)}</b> una contraseña temporal nueva; la anterior deja de funcionar y deberá cambiarla al ingresar. ¿Continuar?`, boton: 'Restablecer' }))) return;
    const r = await tarea(() => api('usuarios.restablecerClave', { Correo: u.Correo }), 'Restableciendo…');
    if (r) { m.cerrar(); mostrarCredenciales(r.Nombre, r.Usuario, r.Clave_Temporal); recargar(root); }
  };
  const hint = () => {
    const r = $('#u-rol', m.el).value;
    $('#u-hint', m.el).textContent = r === 'Coordinador General' ? 'Rol global: acceso a todos los proyectos.' : `Acceso solo a ${S.proyecto}.`;
    // La delegación de DATA aplica a Operadores (Control Documentario y superiores ya la tienen)
    const fila = $('#u-data-row', m.el);
    if (fila) fila.hidden = r !== 'Operador';
  };
  $('#u-rol', m.el).onchange = hint; hint();
  $('#u-ok', m.el).onclick = async () => {
    const data = {
      Correo: u ? u.Correo : '', Nombre: $('#u-nombre', m.el).value.trim(), Usuario: $('#u-usuario', m.el).value.trim().toLowerCase(),
      Clave: u ? '' : $('#u-clave', m.el).value.trim(),
      Rol: $('#u-rol', m.el).value, Area: $('#u-area', m.el).value, Activo: propio ? true : $('#u-activo', m.el).checked,
      Carga_Data: !propio && $('#u-rol', m.el).value === 'Operador' && $('#u-data', m.el).checked,
    };
    const r = await tarea(() => api('usuarios.guardar', data), 'Guardando…');
    if (r) { m.cerrar(); toast('Usuario guardado', 'ok'); if (r.Clave_Temporal) mostrarCredenciales(r.Nombre, r.Usuario, r.Clave_Temporal); recargar(root); }
  };
}

/** Se muestra una sola vez: el administrador se la entrega a la persona (la cambiará al primer ingreso). */
function mostrarCredenciales(nombre, usuario, clave) {
  const m = modal({
    titulo: 'Datos de ingreso',
    cuerpo: `<p style="margin:0">Entrégale a <b>${esc(nombre)}</b> estos datos. Al ingresar, la app le pedirá crear su propia contraseña.</p>
      <div class="credenciales"><div><span class="small muted">Usuario</span><b class="mono">${esc(usuario)}</b></div>
        <div><span class="small muted">Contraseña temporal</span><b class="mono">${esc(clave)}</b></div></div>
      <p class="small muted" style="margin:0">Esta contraseña no se vuelve a mostrar. Si se pierde, usa "Restablecer contraseña".</p>`,
    pie: '<button class="btn" id="cr-copiar">Copiar</button><button class="btn btn-primary" data-cerrar>Listo</button>',
  });
  $('#cr-copiar', m.el).onclick = async () => {
    try { await navigator.clipboard.writeText(`Usuario: ${usuario}\nContraseña temporal: ${clave}`); toast('Copiado', 'ok'); } catch (e) { toast('No se pudo copiar', 'err'); }
  };
}

// ---------------------------------------------------------------- Catálogos
function catalogos(c, root) {
  c.innerHTML = `<div class="card card-pad small muted" style="margin-bottom:16px">
      Partes del código según el <b>Anexo A</b>. Proyecto (<b>${esc(S.proyecto)}</b>) y Empresa (<b>${esc(S.config.Empresa)}</b>) son fijos del proyecto;
      el correlativo lo asigna el sistema. Los códigos no se pueden borrar ni renombrar (ya pueden estar en códigos emitidos); se pueden desactivar.
    </div>
    <div class="grid grid-2">${TIPOS_CAT.map(([t, l]) => {
      const items = S.catalogos.filter((x) => x.Tipo === t);
      return `<div class="card"><div class="card-head"><h2>${l}</h2><button class="btn btn-sm" data-nuevo="${t}">${ico('mas')}Agregar</button></div>
        <div class="tabla-wrap"><table class="tabla"><tbody>${items.map((x) => `<tr class="click" data-tipo="${t}" data-cod="${esc(x.Codigo)}">
          <td class="mono" style="width:80px"><b>${esc(x.Codigo)}</b></td><td>${esc(x.Descripcion) || '<span class="muted">Sin descripción</span>'}</td>
          <td style="width:80px">${String(x.Activo).toUpperCase() === 'TRUE' ? '' : '<span class="badge b-off">Inactivo</span>'}</td></tr>`).join('') || '<tr><td class="vacio">Vacío</td></tr>'}
        </tbody></table></div></div>`;
    }).join('')}</div>
    <h2 style="margin:22px 0 8px">Listas para llenar protocolos</h2>
    <div class="grid grid-2">${TIPOS_PROTO.map(([t, l]) => {
      const items = S.catalogos.filter((x) => x.Tipo === t);
      return `<div class="card"><div class="card-head"><h2>${l} (${items.length})</h2><button class="btn btn-sm" data-nuevo="${t}">${ico('mas')}Agregar</button></div>
        <div class="tabla-wrap" style="max-height:360px;overflow-y:auto"><table class="tabla"><tbody>${items.map((x) => `<tr class="click" data-tipo="${t}" data-cod="${esc(x.Codigo)}">
          <td class="mono" style="width:80px"><b>${esc(x.Codigo)}</b></td><td>${esc(x.Descripcion) || '<span class="muted">Sin descripción</span>'}
          ${t === 'Partida' && x.Relacion ? `<div class="small muted">CPC: <span class="mono">${esc(x.Relacion)}</span></div>` : ''}
          ${t === 'Acronimo' && String(x.Relacion).toUpperCase() === 'LOG' ? '<span class="badge b-off">Usado en el LOG · lista aparte</span>' : ''}</td>
          <td style="width:80px">${String(x.Activo).toUpperCase() === 'TRUE' ? '' : '<span class="badge b-off">Inactivo</span>'}</td></tr>`).join('') || '<tr><td class="vacio">Vacío</td></tr>'}
        </tbody></table></div></div>`;
    }).join('')}</div>`;
  c.querySelectorAll('[data-nuevo]').forEach((b) => { b.onclick = () => editarCatalogo(b.dataset.nuevo, null, root); });
  c.querySelectorAll('tr[data-tipo]').forEach((tr) => { tr.onclick = () => editarCatalogo(tr.dataset.tipo, S.catalogos.find((x) => x.Tipo === tr.dataset.tipo && x.Codigo === tr.dataset.cod), root); });
}

function editarCatalogo(tipo, item, root) {
  const l = etiquetaTipo(tipo);
  const m = modal({
    titulo: `${item ? 'Editar' : 'Agregar'} ${l.toLowerCase()}`,
    cuerpo: `<div class="form-grid">
      <div class="field"><label>Código</label><input id="c-cod" value="${esc(item?.Codigo)}" ${item ? 'readonly' : ''} maxlength="8" placeholder="Ej. TOP">
        <span class="hint">Letras y números, sin guiones.</span></div>
      <div class="field span-all"><label>Descripción</label><input id="c-desc" value="${esc(item?.Descripcion)}" maxlength="150" placeholder="Ej. Topografía"></div>
      ${tipo === 'Acronimo' ? `<label class="chk span-all"><input type="checkbox" id="c-log" ${String(item?.Relacion || '').toUpperCase() === 'LOG' ? 'checked' : ''}> Usado en el LOG (va en la lista aparte, al final)</label>` : ''}
      ${tipo === 'Partida' ? `<div class="field span-all"><label>Acrónimo CPC sugerido (opcional)</label><input id="c-rel" value="${esc(item?.Relacion)}" maxlength="30" placeholder="Ej. WSTOP-MCONT">
        <span class="hint">ACRÓNIMO o ACRÓNIMO-ELEMENTO. Al elegir esta partida en un protocolo, la app propone este CPC.</span></div>` : ''}
      <label class="chk span-all"><input type="checkbox" id="c-act" ${!item || String(item.Activo).toUpperCase() === 'TRUE' ? 'checked' : ''}> Activo</label>
    </div>`,
    pie: '<button class="btn" data-cerrar>Cancelar</button><button class="btn btn-primary" id="c-ok">Guardar</button>',
  });
  const cod = $('#c-cod', m.el);
  cod.oninput = () => { cod.value = cod.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); };
  $('#c-ok', m.el).onclick = async () => {
    const d = { Tipo: tipo, Codigo: cod.value, Descripcion: $('#c-desc', m.el).value.trim(), Activo: $('#c-act', m.el).checked };
    if ($('#c-rel', m.el)) d.Relacion = $('#c-rel', m.el).value.trim();
    if ($('#c-log', m.el)) d.Relacion = $('#c-log', m.el).checked ? 'LOG' : '';
    const r = await tarea(() => api('catalogos.guardar', d), 'Guardando…');
    if (r) { m.cerrar(); toast('Catálogo guardado', 'ok'); recargar(root); }
  };
}

// ---------------------------------------------------------------- Series y fases
function series(c, root) {
  const doc = puede('documentar');
  const lista = [...S.series].sort((a, b) => (serieActiva(b) - serieActiva(a)) || a.Codigo_Serie.localeCompare(b.Codigo_Serie));
  c.innerHTML = `<div class="card">
    <div class="card-head"><h2>Series (${S.series.length})</h2>
      ${doc ? `<span class="btn-row"><button class="btn btn-sm" id="s-fase">Cambio de fase</button><button class="btn btn-primary btn-sm" id="s-nueva">${ico('mas')}Nueva serie</button></span>` : ''}</div>
    <div class="tabla-wrap"><table class="tabla stack"><thead><tr><th>Serie</th><th>Área</th><th>Prefijo</th><th class="num">Último</th><th>Estado</th><th></th></tr></thead><tbody>
      ${lista.map((s) => `<tr><td class="td-main">${esc(s.Codigo_Serie)}${s.Descripcion ? `<div class="small muted">${esc(s.Descripcion)}</div>` : ''}</td>
        <td data-l="Área"><span class="badge ${s.Area === 'Topografía' ? 'b-Cargado' : 'b-rol'}">${esc(s.Area || 'Calidad')}</span></td>
        <td data-l="Prefijo" class="mono">${esc(s.Prefijo_Completo)}</td>
        <td data-l="Último" class="num">${esc(s.Ultimo_Correlativo)}</td>
        <td data-l="Estado">${serieActiva(s) ? '<span class="badge b-Validado">Activa</span>' : '<span class="badge b-off">Cerrada</span>'}</td>
        <td><div class="btn-row" style="justify-content:flex-end">
          ${doc ? `<button class="btn btn-sm" data-editar="${esc(s.Codigo_Serie)}">Editar</button>` : ''}
          ${doc ? `<button class="btn btn-sm" data-ajustar="${esc(s.Codigo_Serie)}">Ajustar contador</button>` : ''}</div></td></tr>`).join('')}
    </tbody></table></div></div>`;
  if ($('#s-nueva', c)) $('#s-nueva', c).onclick = () => nuevaSerie(root);
  if ($('#s-fase', c)) $('#s-fase', c).onclick = () => cambioFase(root);
  c.querySelectorAll('[data-editar]').forEach((b) => { b.onclick = () => editarSerie(S.series.find((s) => s.Codigo_Serie === b.dataset.editar), root); });
  c.querySelectorAll('[data-ajustar]').forEach((b) => { b.onclick = () => ajustarContador(S.series.find((s) => s.Codigo_Serie === b.dataset.ajustar), root); });
}

const activosCat = (t) => S.catalogos.filter((x) => x.Tipo === t && String(x.Activo).toUpperCase() === 'TRUE');

function nuevaSerie(root) {
  const m = modal({
    titulo: 'Nueva serie',
    cuerpo: `<div class="form-grid">
        ${TIPOS_CAT.map(([t, l]) => `<div class="field"><label>${l}</label><select id="n-${t}">${opciones(activosCat(t).map((x) => [x.Codigo, etiquetaCat(t, x.Codigo)]), '', { vacio: 'Elige…' })}</select></div>`).join('')}
        <div class="field"><label>Área que la usa</label><select id="n-area">${opciones(AREAS_SERIE, 'Calidad')}</select>
          <span class="hint">Los operadores solo ven las series de su área.</span></div>
        <div class="field span-all"><label>Descripción (opcional)</label><input id="n-desc" maxlength="200" placeholder="Ej. Protocolos topográficos globales"></div>
      </div>
      <div id="n-prev" class="seccion"><span class="small muted">Elige las cuatro partes para ver el código.</span></div>
      <span class="small muted">¿Falta una opción? Agrégala primero en la pestaña Catálogos.</span>`,
    pie: '<button class="btn" data-cerrar>Cancelar</button><button class="btn btn-primary" id="n-ok" disabled>Crear serie</button>',
  });
  const val = () => Object.fromEntries(TIPOS_CAT.map(([t]) => [t, $('#n-' + t, m.el).value]));
  const prev = () => {
    const v = val();
    const listo = TIPOS_CAT.every(([t]) => v[t]);
    const existe = listo && S.series.some((s) => TIPOS_CAT.every(([t]) => s[t] === v[t]));
    $('#n-prev', m.el).innerHTML = listo
      ? `${codigoVisual([S.proyecto, v.Fase, S.config.Empresa, v.Especialidad, v.Tramo, v.Tipo_Documento, '0001'].join('-'))}
         ${existe ? '<div class="aviso aviso-err">Esta serie ya existe.</div>' : '<span class="small muted">El primer código será 0001.</span>'}`
      : '<span class="small muted">Elige las cuatro partes para ver el código.</span>';
    $('#n-ok', m.el).disabled = !listo || existe;
  };
  TIPOS_CAT.forEach(([t]) => { $('#n-' + t, m.el).onchange = prev; });
  $('#n-ok', m.el).onclick = async () => {
    const r = await tarea(() => api('series.guardar', { ...val(), Area: $('#n-area', m.el).value, Descripcion: $('#n-desc', m.el).value.trim() }), 'Creando serie…');
    if (r) { m.cerrar(); toast(`Serie ${r.Codigo_Serie} creada`, 'ok'); recargar(root); }
  };
}

function editarSerie(s, root) {
  const m = modal({
    titulo: `Serie ${esc(s.Codigo_Serie)}`,
    cuerpo: `${codigoVisual(s.Prefijo_Completo + '-' + String(+s.Ultimo_Correlativo || 0).padStart(4, '0'), { chico: true })}
      <span class="small muted">Las partes del código no se modifican. Para otra combinación, crea una serie nueva.</span>
      <div class="field"><label>Área que la usa</label><select id="e-area">${opciones(AREAS_SERIE, s.Area || 'Calidad')}</select></div>
      <div class="field"><label>Descripción</label><input id="e-desc" value="${esc(s.Descripcion)}" maxlength="200"></div>
      <label class="chk"><input type="checkbox" id="e-act" ${serieActiva(s) ? 'checked' : ''}> Serie activa (se pueden generar códigos)</label>
      <span class="small muted">Una serie cerrada conserva sus códigos para consulta, carga de formatos y auditoría.</span>`,
    pie: '<button class="btn" data-cerrar>Cancelar</button><button class="btn btn-primary" id="e-ok">Guardar</button>',
  });
  $('#e-ok', m.el).onclick = async () => {
    const r = await tarea(() => api('series.guardar', { Codigo_Serie: s.Codigo_Serie, Area: $('#e-area', m.el).value, Descripcion: $('#e-desc', m.el).value.trim(), Activa: $('#e-act', m.el).checked }), 'Guardando…');
    if (r) { m.cerrar(); toast('Serie guardada', 'ok'); recargar(root); }
  };
}

function cambioFase(root) {
  const fasesConSeries = [...new Set(S.series.filter(serieActiva).map((s) => s.Fase))];
  const m = modal({
    titulo: 'Cambio de fase',
    cuerpo: `<p style="margin:0">Crea en la fase destino las mismas series (Especialidad-Tramo-Tipo) de la fase origen, con correlativo desde <b>0001</b>.</p>
      <div class="form-grid">
        <div class="field"><label>Fase origen</label><select id="f-ori">${opciones(fasesConSeries.map((f) => [f, etiquetaCat('Fase', f)]), fasesConSeries[0])}</select></div>
        <div class="field"><label>Fase destino</label><select id="f-des">${opciones(activosCat('Fase').map((x) => [x.Codigo, etiquetaCat('Fase', x.Codigo)]), '', { vacio: 'Elige…' })}</select></div>
        <label class="chk span-all"><input type="checkbox" id="f-cerrar" checked> Cerrar las series de la fase origen (quedan solo para consulta)</label>
      </div><div id="f-res" class="small muted"></div>`,
    pie: '<button class="btn" data-cerrar>Cancelar</button><button class="btn btn-primary" id="f-ok">Aplicar cambio de fase</button>',
  });
  const res = () => {
    const o = $('#f-ori', m.el).value, d = $('#f-des', m.el).value;
    const n = S.series.filter((s) => s.Fase === o && serieActiva(s)).length;
    $('#f-res', m.el).textContent = d ? `Se crearán hasta ${n} series ${d} (las que ya existan se omiten).` : '';
  };
  $('#f-ori', m.el).onchange = res; $('#f-des', m.el).onchange = res;
  $('#f-ok', m.el).onclick = async () => {
    const origen = $('#f-ori', m.el).value, destino = $('#f-des', m.el).value, cerrarOrigen = $('#f-cerrar', m.el).checked;
    if (!destino) { toast('Elige la fase destino', 'err'); return; }
    if (!(await confirmar({ titulo: 'Confirmar cambio de fase', mensaje: `${esc(origen)} → <b>${esc(destino)}</b>. ${cerrarOrigen ? `Las series ${esc(origen)} dejarán de generar códigos.` : ''} ¿Continuar?`, boton: 'Aplicar' }))) return;
    const r = await tarea(() => api('series.clonarFase', { origen, destino, cerrarOrigen }), 'Aplicando cambio de fase…');
    if (r) { m.cerrar(); toast(`${r.creadas} series creadas${r.cerradas ? `, ${r.cerradas} cerradas` : ''}`, 'ok'); recargar(root); }
  };
}

// ---------------------------------------------------------------- Formatos (biblioteca; solo Propietario)
const TIPO_FMT = { xlsx: 'Excel', doc: 'Word', archivo: 'PDF' };

function formatos(c, root) {
  const lista = [...S.formatos].sort((a, b) => a.Codigo_Formato.localeCompare(b.Codigo_Formato));
  c.innerHTML = `<div class="card">
    <div class="card-head"><h2>Formatos aprobados (${lista.length})</h2><button class="btn btn-primary btn-sm" id="f-nuevo">${ico('mas')}Nuevo formato</button></div>
    ${lista.length ? `<div class="tabla-wrap"><table class="tabla stack"><thead><tr><th>Formato</th><th>Rev.</th><th>Archivo</th><th>Estado</th><th></th></tr></thead><tbody>
      ${lista.map((f) => `<tr><td class="td-main"><b class="mono">${esc(f.Codigo_Formato.split('-').slice(-3).join('-'))}</b> ${esc(f.Nombre || '')}<div class="small muted mono">${esc(f.Codigo_Formato)}</div></td>
        <td data-l="Rev.">${esc(f.Revision || '—')}</td>
        <td data-l="Archivo">${esc(f.Plantilla_Nombre)} <span class="badge b-off">${TIPO_FMT[f.Plantilla_Tipo] || ''}</span></td>
        <td data-l="Estado">${String(f.Activo).toUpperCase() === 'TRUE' ? '<span class="badge b-Validado">Activo</span>' : '<span class="badge b-off">Inactivo</span>'}</td>
        <td><div class="btn-row" style="justify-content:flex-end"><button class="btn btn-sm" data-fmt="${esc(f.Codigo_Formato)}">Editar</button></div></td></tr>`).join('')}
    </tbody></table></div>` : '<div class="card-pad muted">Aún no hay formatos. Sube el primero con «Nuevo formato».</div>'}
    </div>
    <div class="card card-pad small">
      <h3 style="margin-bottom:6px">Cómo preparar el Excel</h3>
      <p class="muted" style="margin:0 0 6px">Sube el formato aprobado en <b>.xlsx</b> tal cual. En la celda donde va cada dato escribe su marcador; al descargar para un código,
        la app los reemplaza y entrega el mismo Excel con logo, bordes y firmas intactos. Ejemplo: en la celda junto a «CORRELATIVO N°:» escribe <span class="mono">{CODIGO}</span>.</p>
      <div class="mono">${S.marcadores.map((m) => `{${esc(m)}}`).join('  ')}</div>
    </div>`;
  $('#f-nuevo', c).onclick = () => editarFormato(null, root);
  c.querySelectorAll('[data-fmt]').forEach((b) => { b.onclick = () => editarFormato(S.formatos.find((f) => f.Codigo_Formato === b.dataset.fmt), root); });
}

/** Del nombre de archivo saca código y revisión: PSR2-F2-CPC-CAL-EMD-FOR-0001-A.xlsx → código + "A". */
function datosDeNombre(nombre) {
  const m = String(nombre).toUpperCase().match(/([A-Z0-9]+(?:-[A-Z0-9]+)*?-[A-Z]{2,4}-\d{4})(?:-([A-Z])(?=[-_. ]|$))?/);
  return m ? { codigo: m[1], revision: m[2] || '' } : { codigo: '', revision: '' };
}

function editarFormato(f, root) {
  const m = modal({
    titulo: f ? `Formato ${esc(f.Codigo_Formato)}` : 'Nuevo formato',
    cuerpo: `<label class="file-drop" for="fm-file">${ico('subir')}<div><b>${f ? 'Reemplazar archivo (opcional)' : 'Elegir archivo del formato'}</b></div>
        <div class="small muted">Excel (.xlsx) recomendado · Word (.docx) · PDF · máx. ${S.app.maxArchivoMB} MB</div></label>
      <input type="file" id="fm-file" accept=".xlsx,.docx,.doc,.pdf" hidden><div id="fm-nombre" class="small"></div>
      <div class="form-grid">
        <div class="field span-all"><label>Código del formato</label><input id="fm-cod" class="mono" value="${esc(f ? f.Codigo_Formato : '')}" ${f ? 'disabled' : ''} placeholder="PSR2-F2-CPC-CAL-EMD-FOR-0001"></div>
        <div class="field"><label>Revisión</label><input id="fm-rev" value="${esc(f ? f.Revision : '')}" maxlength="5" placeholder="A"></div>
        ${f ? `<label class="chk"><input type="checkbox" id="fm-act" ${String(f.Activo).toUpperCase() === 'TRUE' ? 'checked' : ''}> Activo (los usuarios lo pueden descargar)</label>` : ''}
      </div>
      ${f ? '<div class="aviso aviso-info">Si reemplazas el archivo, el anterior se conserva en Drive marcado como [ANTERIOR].</div>' : ''}`,
    pie: `<button class="btn" data-cerrar>Cancelar</button><button class="btn btn-primary" id="fm-ok">${f ? 'Guardar' : 'Subir formato'}</button>`,
  });
  const inp = $('#fm-file', m.el);
  inp.onchange = () => {
    const a = inp.files[0];
    $('#fm-nombre', m.el).textContent = a ? a.name : '';
    if (a && !f) {
      const d = datosDeNombre(a.name);
      if (d.codigo && !$('#fm-cod', m.el).value) $('#fm-cod', m.el).value = d.codigo;
      if (d.revision && !$('#fm-rev', m.el).value) $('#fm-rev', m.el).value = d.revision;
    }
  };
  $('#fm-ok', m.el).onclick = async () => {
    const a = inp.files[0];
    if (!f && !a) { toast('Elige el archivo del formato', 'err'); return; }
    const datos = { Codigo_Formato: $('#fm-cod', m.el).value.trim(), Revision: $('#fm-rev', m.el).value.trim() };
    if (f) datos.Activo = $('#fm-act', m.el).checked;
    const r = await tarea(async () => api('formatos.guardar', { ...datos, archivo: a ? await archivoParaApi(a, { maxMB: S.app.maxArchivoMB }) : null }), 'Guardando formato…');
    if (r) { m.cerrar(); toast(`Formato ${r.Codigo_Formato} guardado`, 'ok'); recargar(root); }
  };
}

function ajustarContador(s, root) {
  const m = modal({
    titulo: `Ajustar contador · ${esc(s.Codigo_Serie)}`,
    cuerpo: `<div class="aviso aviso-warn">Úsalo solo cuando la auditoría confirme códigos usados fuera del sistema. El contador <b>solo puede aumentar</b>; los números saltados aparecerán como huecos en el Auditor (o impórtalos en Carga inicial).</div>
      <div class="form-grid"><div class="field"><label>Contador actual</label><input value="${esc(s.Ultimo_Correlativo)}" readonly></div>
      <div class="field"><label>Nuevo valor</label><input id="a-val" type="number" min="${+s.Ultimo_Correlativo + 1}"></div>
      <div class="field span-all"><label>Motivo</label><input id="a-mot" maxlength="300" placeholder="Ej. Auditoría 15/11: último código usado en obra = 120"></div></div>`,
    pie: '<button class="btn" data-cerrar>Cancelar</button><button class="btn btn-primary" id="a-ok">Ajustar</button>',
  });
  $('#a-ok', m.el).onclick = async () => {
    const r = await tarea(() => api('series.ajustarContador', { serie: s.Codigo_Serie, valor: $('#a-val', m.el).value, motivo: $('#a-mot', m.el).value }), 'Ajustando…');
    if (r) { m.cerrar(); toast('Contador ajustado', 'ok'); recargar(root); }
  };
}

// ---------------------------------------------------------------- Proyecto
function proyecto(c, root) {
  const campos = [
    ['Dia_Inicio_Ciclo', 'Día de inicio del periodo', 'Ej. 26'], ['Dia_Fin_Ciclo', 'Día de fin del periodo', 'Ej. 25'],
    ['Dias_Alerta_Liberado', 'Alerta: días de un código liberado', 'El Auditor lo marca en alerta'],
    ['Dias_Alerta_Pendiente', 'Alerta: días sin cargar formato final', 'El Auditor lo marca en alerta'],
  ];
  const prop = puede('propietario');
  c.innerHTML = `<div class="card card-pad"><div class="form-grid">
      <div class="field"><label>Código de proyecto</label><input value="${esc(S.proyecto)}" readonly></div>
      <div class="field"><label>Empresa ejecutora</label><input value="${esc(S.config.Empresa)}" readonly></div>
      <div class="field span-all"><label>Nombre</label><input id="p-nombre" value="${esc(S.config.Nombre)}" ${prop ? '' : 'readonly'} maxlength="120"></div>
      <div class="field span-all"><label>Cliente (se escribe en los protocolos)</label><input id="p-cliente" value="${esc(S.config.Cliente)}" maxlength="120" placeholder="PROVIAS NACIONAL"></div>
      ${campos.map(([k, l, h]) => `<div class="field"><label>${l}</label><input type="number" min="1" data-cfg="${k}" value="${esc(S.config[k])}"><span class="hint">${h}</span></div>`).join('')}
    </div><div style="margin-top:14px"><button class="btn btn-primary" id="c-ok">Guardar</button></div></div>
    ${prop ? `<div class="card card-pad">
      <h2>Proyectos</h2>
      <p class="muted">Una sola app para todos los proyectos: cada uno con su empresa, catálogos, series, usuarios y numeración. El Coordinador General y el Propietario ven todos.</p>
      <div class="btn-row" style="margin-bottom:10px">${S.proyectos.map((p) => `<span class="badge b-rol">${esc(p.ID_Proyecto)} · ${esc(p.Empresa)}</span>`).join('')}</div>
      <button class="btn" id="p-nuevo">${ico('mas')}Nuevo proyecto</button></div>` : ''}`;
  $('#c-ok', c).onclick = async () => {
    const d = { Nombre: $('#p-nombre', c).value.trim(), Cliente: $('#p-cliente', c).value.trim() };
    c.querySelectorAll('[data-cfg]').forEach((i) => { d[i.dataset.cfg] = i.value; });
    if (await tarea(() => api('proyecto.guardar', d), 'Guardando…')) { toast('Proyecto guardado', 'ok'); recargar(root); }
  };
  if ($('#p-nuevo', c)) $('#p-nuevo', c).onclick = () => nuevoProyecto(root);
}

function nuevoProyecto(root) {
  const m = modal({
    titulo: 'Nuevo proyecto',
    cuerpo: `<div class="form-grid">
      <div class="field"><label>Código de proyecto</label><input id="np-id" maxlength="8" placeholder="VERS"></div>
      <div class="field"><label>Código de empresa ejecutora</label><input id="np-emp" maxlength="8" placeholder="Ej. CPC"></div>
      <div class="field span-all"><label>Nombre</label><input id="np-nom" maxlength="120" placeholder="Vía de Evitamiento Santa Rosa"></div>
      <label class="chk span-all"><input type="checkbox" id="np-cat" checked> Copiar los catálogos de ${esc(S.proyecto)} (fases, especialidades, tramos, tipos)</label>
    </div>
    <div class="aviso aviso-info">El proyecto nace sin series ni usuarios. Luego cámbiate a él (selector arriba) para crear su Jefe de Área y sus series.</div>`,
    pie: '<button class="btn" data-cerrar>Cancelar</button><button class="btn btn-primary" id="np-ok">Crear proyecto</button>',
  });
  ['np-id', 'np-emp'].forEach((id) => { const i = $('#' + id, m.el); i.oninput = () => { i.value = i.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); }; });
  $('#np-ok', m.el).onclick = async () => {
    const r = await tarea(() => api('proyecto.crear', { ID_Proyecto: $('#np-id', m.el).value, Empresa: $('#np-emp', m.el).value, Nombre: $('#np-nom', m.el).value.trim(), copiarCatalogos: $('#np-cat', m.el).checked }), 'Creando proyecto…');
    if (r) { m.cerrar(); toast(`Proyecto ${r.ID_Proyecto} creado`, 'ok'); recargar(root); }
  };
}
