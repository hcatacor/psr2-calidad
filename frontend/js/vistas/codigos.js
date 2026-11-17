import { api } from '../api.js';
import { S, puede, soyYo, upsertRegistros } from '../state.js';
import { $, esc, ico, opciones, estadoVisible, badge, nombreDe, fFecha, fFechaHora, ESTADOS_VISIBLES, modal, toast, tarea,
  csvGenerar, descargarBlob, serieDe, serieActiva, codigoVisual, nombreSerie, ordenSeries, TIPOS_CAT, etiquetaCat } from '../util.js';
import { abrirDetalle } from './detalle.js';
import { abrirFormulario, tieneFormulario, numFormato, enlazarBuscadorFormato } from './formulario.js';
import { abrirData } from './data.js';
import { misSinUsar, filasPendientes, enlazarPendientes, abrirNoUsados } from './pendientes.js';
import { refrescarVista } from '../app.js';

const f = { texto: '', Fase: '', Especialidad: '', Tramo: '', Tipo_Documento: '', estado: '', mios: false };
const limites = {};
const LIM = 50;

const az = (a, b) => String(a).localeCompare(String(b), 'es', { numeric: true });
const valoresDe = (tipo) => [...new Set(S.series.map((s) => s[tipo]).filter(Boolean))].sort(az);
const listaCat = (tipo) => [...new Set(S.catalogos.filter((c) => c.Tipo === tipo && String(c.Activo).toUpperCase() === 'TRUE').map((c) => c.Descripcion))].sort(az);

export function render(el, params) {
  if (params.has('estado') || params.has('serie')) {
    f.estado = params.get('estado') || '';
    const s = serieDe(params.get('serie') || '');
    TIPOS_CAT.forEach(([t]) => { f[t] = s ? s[t] : ''; });
    f.texto = ''; f.mios = false;
    history.replaceState(null, '', '#/codigos'); // los filtros ya se aplicaron; no reaplicarlos al refrescar
  }
  el.innerHTML = `
    <div class="page-head">
      <div><h1>Códigos de protocolo</h1><p>${S.registros.length} códigos en ${S.series.length} series · ${esc(S.config.Nombre || S.proyecto)}</p></div>
      <div class="btn-row">
        <button class="btn" id="btn-nousados">${ico('auditor')}Auditoría · no usados</button>
        ${puede('data') ? `<button class="btn" id="btn-data">${ico('subir')}DATA</button>` : ''}
        ${puede('generar') ? `<button class="btn btn-primary" id="btn-generar">${ico('mas')}Generar código</button>` : ''}
      </div>
    </div>
    <div class="card">
      <div class="toolbar">
        <input class="grow" id="f-texto" type="search" placeholder="Buscar código, actividad, ubicación, PK…" value="${esc(f.texto)}">
        ${TIPOS_CAT.map(([t, l]) => `<select data-f="${t}" style="max-width:170px" title="${l}">${opciones(valoresDe(t).map((v) => [v, etiquetaCat(t, v)]).sort((a, b) => az(a[1], b[1])), f[t], { vacio: l + ': todas' })}</select>`).join('')}
        <select data-f="estado" style="max-width:160px">${opciones(ESTADOS_VISIBLES, f.estado, { vacio: 'Estado: todos' })}</select>
        ${puede('generar') ? `<label class="chk"><input type="checkbox" id="f-mios" ${f.mios ? 'checked' : ''}> Solo míos</label>` : ''}
      </div>
      <div id="lista"></div>
    </div>`;

  $('#f-texto', el).oninput = (e) => { f.texto = e.target.value; pintar(el); };
  el.querySelectorAll('[data-f]').forEach((s) => { s.onchange = () => { f[s.dataset.f] = s.value; pintar(el); }; });
  if ($('#f-mios', el)) $('#f-mios', el).onchange = (e) => { f.mios = e.target.checked; pintar(el); };
  if ($('#btn-generar', el)) $('#btn-generar', el).onclick = () => abrirGenerar();
  if ($('#btn-data', el)) $('#btn-data', el).onclick = () => abrirData();
  $('#btn-nousados', el).onclick = () => abrirNoUsados();
  pintar(el);
}

function filtrados() {
  const t = f.texto.trim().toUpperCase();
  return S.registros.filter((r) => {
    const s = serieDe(r.Serie) || {};
    return TIPOS_CAT.every(([k]) => !f[k] || s[k] === f[k]) &&
      (!f.estado || estadoVisible(r) === f.estado) &&
      (!f.mios || soyYo(r.Usuario)) &&
      (!t || [r.Codigo_Completo, r.Actividad, r.Ubicacion, r.PK_Inicial, r.PK_Final, r.Protocolo_Topografico, nombreDe(r.Usuario)]
        .some((x) => String(x || '').toUpperCase().includes(t)));
  }).sort((a, b) => (b.Fecha_Creacion || '').localeCompare(a.Fecha_Creacion || '') || b.Codigo_Completo.localeCompare(a.Codigo_Completo));
}

function pintar(el) {
  const lista = filtrados();
  // Desplegable por serie (no una lista sin fin); con búsqueda o filtros se abren solos
  const abiertos = new Set([...el.querySelectorAll('details.grupo[open]')].map((d) => d.dataset.serie));
  const filtrando = !!(f.texto.trim() || f.estado || f.mios || TIPOS_CAT.some(([k]) => f[k]));
  const grupos = {};
  lista.forEach((r) => { (grupos[r.Serie] = grupos[r.Serie] || []).push(r); });
  const nombres = Object.keys(grupos).sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
  $('#lista', el).innerHTML = lista.length ? `<div class="muted small" style="padding:8px 4px">${lista.length} código(s) en ${nombres.length} serie(s). Toca una serie para desplegarla.</div>
    ${nombres.map((sn) => {
      const rs = grupos[sn], lim = limites[sn] || LIM, ver = rs.slice(0, lim);
      return `<details class="grupo" data-serie="${esc(sn)}" ${filtrando || abiertos.has(sn) ? 'open' : ''}>
      <summary><b class="mono">${esc(sn)}</b> <span class="badge b-off">${rs.length}</span></summary>
    <div class="tabla-wrap"><table class="tabla stack">
      <thead><tr><th>Código</th><th>Estado</th><th>Usuario</th><th>Actividad / Ubicación</th><th>PK</th><th>Creado</th></tr></thead>
      <tbody>${ver.map((r) => `<tr class="click" data-cod="${esc(r.Codigo_Completo)}">
        <td class="td-main mono">${esc(r.Codigo_Completo)}</td>
        <td data-l="Estado">${badge(estadoVisible(r))}</td>
        <td data-l="Usuario">${esc(nombreDe(r.Usuario)) || '<span class="muted">Sin dueño</span>'}</td>
        <td data-l="Actividad">${esc([r.Actividad, r.Ubicacion].filter(Boolean).join(' · '))}</td>
        <td data-l="PK">${esc([r.PK_Inicial, r.PK_Final].filter(Boolean).join(' – '))}</td>
        <td data-l="Creado">${fFecha(r.Fecha_Creacion)}</td></tr>`).join('')}</tbody>
    </table></div>
    ${rs.length > lim ? `<div class="toolbar" style="border:0;justify-content:space-between"><span class="muted small">Mostrando ${ver.length} de ${rs.length}</span>
      <button class="btn btn-sm" data-mas="${esc(sn)}">Ver más</button></div>` : ''}</details>`;
    }).join('')}`
    : '<div class="vacio">No hay códigos con esos filtros.</div>';
  el.querySelectorAll('tr[data-cod]').forEach((tr) => { tr.onclick = () => abrirDetalle(tr.dataset.cod); });
  el.querySelectorAll('[data-mas]').forEach((b) => { b.onclick = () => { limites[b.dataset.mas] = (limites[b.dataset.mas] || LIM) + 200; pintar(el); }; });
}

// ---------------------------------------------------------------- Generar (cascada Fase → Especialidad → Tramo → Tipo)
/** Liberado de número más bajo de la serie (de cualquier usuario): primera opción al generar. */
function primerLiberado(serie) {
  return S.registros.filter((r) => r.Serie === serie && r.Estado === 'Liberado').sort((a, b) => (+a.Correlativo_Numero) - (+b.Correlativo_Numero))[0];
}

export function abrirGenerar() {
  // Lista simple de series vigentes: el usuario solo elige una; el correlativo se asigna en orden de solicitud.
  const activas = S.series.filter(serieActiva).sort((a, b) => az(`${a.Especialidad}-${a.Tramo}-${a.Tipo_Documento}-${a.Fase}`, `${b.Especialidad}-${b.Tramo}-${b.Tipo_Documento}-${b.Fase}`));
  const pendientes = misSinUsar();
  const protocolos = S.formatos.filter((f) => String(f.Activo).toUpperCase() === 'TRUE').sort((a, b) => az(a.Codigo_Formato, b.Codigo_Formato));
  const m = modal({
    titulo: 'Generar código',
    cuerpo: `
      ${pendientes.length ? `<div class="aviso aviso-warn"><b>Tienes ${pendientes.length} código(s) separado(s) sin llenar.</b>
          Llénalo o libéralo antes de separar otro (al liberarlo queda libre para cualquier usuario).
          ${filasPendientes(pendientes.slice(0, 5))}
          ${pendientes.length > 5 ? `<div class="small muted">… y ${pendientes.length - 5} más (Panel → Mis pendientes).</div>` : ''}
          <label class="chk" style="margin-top:8px"><input type="checkbox" id="g-igual"> Igual necesito separar un código nuevo</label></div>` : ''}
      ${activas.length ? `<div class="field"><label>Serie</label>
          <select id="g-serie">${opciones(activas.map((s) => [s.Codigo_Serie, `${s.Especialidad}-${s.Tramo}-${s.Tipo_Documento} · ${s.Fase}${s.Descripcion ? ' · ' + s.Descripcion : ''}`]), '', { vacio: 'Elige la serie…' })}</select></div>`
        : '<div class="aviso aviso-warn">No hay series activas en este proyecto. Pide a Control Documentario que las cree.</div>'}
      ${protocolos.length ? `<div class="field"><label>Protocolo (formato)</label>
          ${protocolos.length > 8 ? '<input id="g-fq" type="search" placeholder="Buscar por número o nombre (p. ej. concreto)" autocomplete="off">' : ''}
          <select id="g-formato"></select>
          <span class="hint">Primero los del tramo de la serie y los generales (GLB). Con el protocolo elegido podrás llenarlo en la app y descargarlo listo.</span></div>` : ''}
      <div id="g-prev"></div>
      <div id="g-aviso"></div>
      <details class="seccion"><summary class="small"><b>Datos opcionales</b> (actividad, ubicación, PK, cantidad)</summary>
        <div class="form-grid" style="margin-top:10px">
          <div class="field span-all"><label>Actividad / partida</label><select id="g-Actividad">${opciones(listaCat('Partida'), '', { vacio: '— Sin actividad —' })}</select></div>
          <div class="field span-all"><label>Ubicación</label><select id="g-Ubicacion">${opciones(listaCat('Ubicacion'), '', { vacio: '— Sin ubicación —' })}</select></div>
          <div class="field"><label>PK inicial</label><input id="g-PK_Inicial" maxlength="50" placeholder="0+000"></div>
          <div class="field"><label>PK final</label><input id="g-PK_Final" maxlength="50" placeholder="0+100"></div>
          <div class="field"><label>Cantidad de códigos</label><input id="g-cant" type="number" min="1" max="${S.app.maxGenerar}" value="1"></div>
        </div></details>`,
    pie: '<button class="btn" data-cerrar>Cancelar</button><button class="btn btn-primary" id="g-ok" disabled>Generar</button>',
  });

  let serie = null;
  // Protocolos: agrupados por el tramo de la serie elegida (+ GLB), con buscador por número o título
  const pintarFormatos = $('#g-formato', m.el)
    ? enlazarBuscadorFormato($('#g-fq', m.el), $('#g-formato', m.el), protocolos, () => (serie ? serie.Tramo : ''), '— Elegir después —') : () => {};
  if ($('#g-serie', m.el)) $('#g-serie', m.el).onchange = () => { actualizar(); pintarFormatos(); };
  if ($('#g-igual', m.el)) $('#g-igual', m.el).onchange = () => actualizar();
  enlazarPendientes(m.el, () => m.cerrar());

  const actualizar = () => {
    const elegido = $('#g-serie', m.el)?.value;
    serie = elegido ? activas.find((s) => s.Codigo_Serie === elegido) : null;
    const lib = serie && primerLiberado(serie.Codigo_Serie);
    $('#g-prev', m.el).innerHTML = serie ? `<div class="seccion"><span class="small muted">Siguiente código (referencial, se confirma al guardar):</span>
      ${codigoVisual(lib ? lib.Codigo_Completo : serie.Prefijo_Completo + '-' + String(+serie.Ultimo_Correlativo + 1).padStart(4, '0'))}
      ${lib ? `<span class="small"><span class="badge b-Liberado">Liberado</span> Es la primera opción de la serie: se reutiliza antes de crear uno nuevo.</span>` : ''}</div>` : '';
    $('#g-aviso', m.el).innerHTML = '';
    const igual = $('#g-igual', m.el);
    $('#g-ok', m.el).disabled = !serie || (pendientes.length > 0 && !(igual && igual.checked));
  };
  actualizar();

  $('#g-ok', m.el).onclick = async () => {
    if (!serie) return;
    const cantidad = Math.max(1, Math.min(S.app.maxGenerar, +$('#g-cant', m.el).value || 1));
    const r = await tarea(async () => {
      try {
        return await api('registros.generar', { serie: serie.Codigo_Serie, cantidad, campos: camposForm(m), formato: $('#g-formato', m.el)?.value || '' });
      } catch (e) {
        if (e.code === 'REUTILIZAR') {
          await reutilizarDesdeGenerar(m, e.extra.codigo, camposForm(m), e.message);
          return null;
        }
        throw e;
      }
    }, 'Generando código…');
    if (!r) return;
    upsertRegistros(r);
    serie.Ultimo_Correlativo = String(Math.max(+serie.Ultimo_Correlativo || 0, ...r.map((x) => +x.Correlativo_Numero)));
    if (r.some((x) => +x.Veces_Reutilizado > 0 && x.Fecha_Creacion < x.Fecha_Modificacion)) toast('Se te asignó un código liberado (primera opción de la serie).');
    m.cerrar();
    refrescarVista();
    if (r.length === 1 && r[0].Formato && tieneFormulario(r[0].Formato)) {
      toast(`Código ${r[0].Codigo_Completo} generado`, 'ok');
      abrirFormulario(r[0].Codigo_Completo);
      return;
    }
    mostrarGenerados(r);
  };
}

function camposForm(m) {
  const o = {};
  ['Actividad', 'Ubicacion', 'PK_Inicial', 'PK_Final'].forEach((k) => { const v = $('#g-' + k, m.el).value.trim(); if (v) o[k] = v; });
  return o;
}

async function reutilizarDesdeGenerar(m, codigo, campos, mensaje) {
  if (mensaje) toast(mensaje);
  const r = await tarea(() => api('registros.reutilizar', { codigo, campos }), 'Reutilizando…');
  if (!r) return;
  upsertRegistros(r);
  m.cerrar();
  toast(`Código ${codigo} reutilizado`, 'ok');
  refrescarVista();
  abrirDetalle(codigo);
}

function mostrarGenerados(regs) {
  const m = modal({
    titulo: regs.length > 1 ? `${regs.length} códigos generados` : 'Código generado',
    cuerpo: `<div class="aviso aviso-ok">Guardado. El código es tuyo y queda registrado de forma permanente.</div>
      ${regs.map((r) => `<div class="seccion">${codigoVisual(r.Codigo_Completo, { chico: regs.length > 1 })}
        <span class="btn-row"><button class="btn btn-sm" data-copiar="${esc(r.Codigo_Completo)}">${ico('copiar')}Copiar</button>
        <button class="btn btn-sm" data-abrir="${esc(r.Codigo_Completo)}">Abrir</button>
        ${r.Formato && tieneFormulario(r.Formato) ? `<button class="btn btn-sm btn-primary" data-llenar="${esc(r.Codigo_Completo)}">Llenar protocolo</button>` : ''}</span></div>`).join('')}`,
    pie: '<button class="btn btn-primary" data-cerrar>Listo</button>',
  });
  m.el.querySelectorAll('[data-copiar]').forEach((b) => {
    b.onclick = async () => { try { await navigator.clipboard.writeText(b.dataset.copiar); toast('Copiado'); } catch (e) { toast('No se pudo copiar', 'err'); } };
  });
  m.el.querySelectorAll('[data-abrir]').forEach((b) => { b.onclick = () => { m.cerrar(); abrirDetalle(b.dataset.abrir); }; });
  m.el.querySelectorAll('[data-llenar]').forEach((b) => { b.onclick = () => { m.cerrar(); abrirFormulario(b.dataset.llenar); }; });
}
