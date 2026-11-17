// LOG de liberaciones de Calidad (columnas A–AC del Excel). Carga inicial tal cual, filas observadas, corrección y descarga.
// Corrige cada fila su dueño (QC) o Control Documentario; ESTATUS, TRANSMITAL y FECHA ENVÍO ACONEX solo Control Documentario o superiores.
import { api } from '../api.js';
import { S, puede, soyYo } from '../state.js';
import { $, esc, ico, modal, toast, tarea, confirmar, nombreDe, fFechaHora, base64ABlob, descargarBlob, archivoParaApi } from '../util.js';
import { recargarBootstrap, refrescarVista } from '../app.js';

let filas = null;
const f = { q: '', ver: 'obs', estatus: '', limite: 200 };

const CAMPOS = [
  ['Rev', 'Rev.'], ['Descripcion', 'Descripción / estructura', 'ancho'], ['Especialidad', 'Especialidad / disciplina'], ['Tramo', 'Tramo'],
  ['Partida', 'Partida / actividad', 'ancho'], ['Localizacion', 'Localización'], ['Ubicacion', 'Ubicación'], ['PK_Inicial', 'PK inicial'],
  ['PK_Final', 'PK final'], ['Fecha', 'Fecha (dd/mm/aaaa)'], ['Capa', 'Capa'], ['Protocolo_Topografico', 'Protocolo topográfico'],
  ['Anexos', 'Anexos', 'ancho'], ['Planos', 'Planos', 'ancho'], ['Valorizacion', 'Valorización (dd/mm/aaaa)'], ['Observacion', 'Observación', 'ancho'],
];
const CONTROL = [['Estatus', 'Estatus'], ['Transmital', 'Transmital CPC'], ['Fecha_Aconex', 'Fecha envío Aconex (dd/mm/aaaa)']];

// ---------------------------------------------------------------- Resumen "Estado por grupo" (EMD · GLB · PTS)
const GRUPOS = [['EMD', 'Muros'], ['GLB', 'Todo'], ['PTS', 'Puente Santa Rosa']];
const grupoDe = (l) => { const p = String(l.Codigo_Completo || '').split('-'); if (p.length >= 7) return p[4];
  const t = String(l.Tramo || '').toUpperCase(); return /PUENTE/.test(t) ? 'PTS' : /ACCESO|DU[AÁ]REZ|MURO/.test(t) ? 'EMD' : 'GLB'; };
// Calidad: solo la columna V (Estatus). CERRADO = concluido · ABIERTO = abierto (rojo) · vacío = pendiente
const estadoDe = (l) => { const e = String(l.Estatus || '').trim().toUpperCase(); return e === 'CERRADO' ? 'concluidos' : e === 'ABIERTO' ? 'observados' : 'pendientes'; };
const NOTA_CALIDAD = 'Según la columna V (Estatus) del LOG: Concluido = CERRADO · Abierto = ABIERTO · Pendiente = sin estatus.';
const pct = (a, b) => (b ? ((a / b) * 100).toFixed(1) : '0.0');

/** Tarjeta con una barra por grupo: concluidos (verde) · pendientes (ámbar) · observados (rojo). */
export function htmlResumen(titulo, grupos, nota = '', rojo = 'Observados') {
  return `<div class="card card-pad resumen-g"><h2 style="margin:0 0 4px">${esc(titulo)}</h2>
    ${grupos.map((g) => `<div class="rg">
      <div class="rg-head"><b>${esc(g.grupo)} <span class="muted" style="font-weight:500">· ${esc(g.nombre)}</span></b></div>
      <div class="rg-sub"><span>Total usados: ${g.total}</span><span class="rg-pct">${pct(g.concluidos, g.total)}% concluidos</span></div>
      <div class="rg-bar">${g.total ? ['concluidos', 'pendientes', 'observados'].map((k) => g[k] ? `<i class="rg-${k}" style="width:${(g[k] / g.total) * 100}%" title="${g[k]} ${k === 'observados' ? rojo.toLowerCase() : k}"></i>` : '').join('') : ''}</div>
      <div class="rg-ley"><span class="rg-t-concluidos">● ${g.concluidos} Concluidos</span><span class="rg-t-pendientes">● ${g.pendientes} Pendientes</span><span class="rg-t-observados">● ${g.observados} ${rojo}</span></div>
    </div>`).join('')}
    ${nota ? `<div class="rg-nota small muted">${nota}</div>` : ''}</div>`;
}
const resumenDe = (lista) => GRUPOS.map(([g, n]) => {
  const x = { grupo: g, nombre: n, total: 0, concluidos: 0, pendientes: 0, observados: 0 };
  lista.filter((l) => grupoDe(l) === g).forEach((l) => { x.total++; x[estadoDe(l)]++; });
  return x;
});

/** Resumen para el Panel: Calidad (LOG) y Topografía (sus códigos), según lo que ve el usuario. */
export async function pintarResumenPanel(cont) {
  if (!cont) return;
  // Pinta al instante lo que ya se tiene (llegó con el ingreso) y solo consulta si tiene más de 1 minuto
  if (S.resumen) pintarResumen(cont, S.resumen);
  if (S.resumen && Date.now() - S.resumenEn < 60000) return;
  try { S.resumen = await api('log.resumen', {}); S.resumenEn = Date.now(); } catch (e) { if (!S.resumen) cont.innerHTML = ''; return; }
  if (cont.isConnected) pintarResumen(cont, S.resumen);
}

function pintarResumen(cont, r) {
  const cards = [];
  if (r.calidad) cards.push(htmlResumen('Calidad · estado por grupo', r.calidad,
    r.calidadFilas ? NOTA_CALIDAD : 'Aún no se ha cargado el LOG.', 'Abiertos'));
  if (r.topografia) cards.push(htmlResumen('Topografía · estado por grupo', r.topografia, 'Desde los códigos de Topografía (resumen). Concluido = histórico, cargado o validado.'));
  cont.innerHTML = cards.length ? `<div class="grid ${cards.length > 1 ? 'grid-2' : ''}" style="margin-top:16px">${cards.join('')}</div>` : '';
}

export const veLog = () => puede('historial') || puede('auditar') || puede('documentar') || (S.usuario.Area || 'Calidad') === 'Calidad';
export const cargaLog = () => puede('data') && (puede('documentar') || (S.usuario.Area || 'Calidad') === 'Calidad');
const observada = (l) => !!l.Motivos && !l.Revisado_Por;
const puedeEditar = (l) => puede('documentar') || (puede('generar') && soyYo(l.Usuario));

export function render(el) {
  el.innerHTML = `
    <div class="page-head"><div><h1>LOG de liberaciones</h1><p>Registro A–AC de Calidad. Las filas observadas las revisa su dueño (QC) o Control Documentario.</p></div>
      <div class="btn-row">${cargaLog() ? `<button class="btn" id="g-cargar">${ico('subir')}Cargar LOG</button>` : ''}
        <button class="btn btn-primary" id="g-bajar">${ico('bajar')}Descargar LOG</button></div></div>
    <div id="g-resumen" style="margin-bottom:16px"></div>
    <div class="card">
      <div class="toolbar">
        <input id="g-q" class="grow" type="search" placeholder="Correlativo, CPC, descripción, partida…" value="${esc(f.q)}">
        <select id="g-ver" style="max-width:220px">
          ${[['obs', 'Observadas por revisar'], ['todas', 'Todas'], ['mias', 'Mis filas'], ['revisadas', 'Observadas ya revisadas'], ['sindueno', 'Sin dueño']]
            .map(([v, t]) => `<option value="${v}" ${f.ver === v ? 'selected' : ''}>${t}</option>`).join('')}</select>
        <select id="g-est" style="max-width:160px"><option value="">Todo estatus</option>
          ${['ABIERTO', 'CERRADO'].map((v) => `<option ${f.estatus === v ? 'selected' : ''}>${v}</option>`).join('')}</select>
      </div>
      <div id="g-lista"><div class="vacio">Cargando…</div></div>
    </div>`;
  const pintarYa = () => { f.q = $('#g-q', el).value.trim(); f.ver = $('#g-ver', el).value; f.estatus = $('#g-est', el).value; f.limite = 200; pintar(el); };
  $('#g-q', el).oninput = pintarYa; $('#g-ver', el).onchange = pintarYa; $('#g-est', el).onchange = pintarYa;
  $('#g-bajar', el).onclick = descargarLog;
  if ($('#g-cargar', el)) $('#g-cargar', el).onclick = () => abrirCargaLog(() => cargar(el));
  cargar(el);
}

async function cargar(el) {
  const r = await tarea(() => api('log.listar', {}), 'Cargando LOG…');
  if (!r) return;
  filas = r;
  pintar(el);
}

function pintar(el) {
  const q = f.q.toUpperCase();
  const l = filas.filter((x) => {
    if (f.ver === 'obs' && !observada(x)) return false;
    if (f.ver === 'revisadas' && !(x.Motivos && x.Revisado_Por)) return false;
    if (f.ver === 'mias' && !soyYo(x.Usuario)) return false;
    if (f.ver === 'sindueno' && x.Usuario) return false;
    if (f.estatus && String(x.Estatus).trim().toUpperCase() !== f.estatus) return false;
    return !q || [x.Codigo_Completo, x.CPC, x.CPC_Original, x.Descripcion, x.Partida, x.N, x.QC].some((v) => String(v || '').toUpperCase().includes(q));
  });
  const nObs = filas.filter(observada).length;
  const rz = $('#g-resumen', el);
  if (rz) rz.innerHTML = filas.length ? htmlResumen('Estado por grupo', resumenDe(filas), NOTA_CALIDAD, 'Abiertos') : '';
  $('#g-lista', el).innerHTML = !filas.length
    ? `<div class="vacio">Aún no se ha cargado el LOG.${cargaLog() ? ' Usa <b>Cargar LOG</b> con el Excel actual (hoja LOG).' : ''}</div>`
    : `<div class="toolbar" style="border:0;flex-wrap:wrap"><span class="small muted">${filas.length} filas · <b>${nObs}</b> observadas por revisar · mostrando ${Math.min(l.length, f.limite)} de ${l.length}</span>
      <span class="small"><span class="corr">■ Corregido por la app</span> <span class="muted">(acrónimos y listas ya acordados; el Excel del LOG sale como se llenó)</span></span></div>
    ${l.length ? `<div class="tabla-wrap"><table class="tabla stack"><thead><tr><th>N°</th><th>Correlativo</th><th>CPC</th><th>Descripción</th><th>Localización</th><th>Fecha</th><th>Estatus</th><th>QC</th><th></th></tr></thead><tbody>
      ${l.slice(0, f.limite).map((x) => `<tr class="click" data-id="${esc(x.ID)}">
        <td class="td-main">${esc(x.N)}</td>
        <td data-l="Correlativo" class="mono small">${esc(x.Codigo_Completo) || '<span class="muted">sin correlativo</span>'}</td>
        <td data-l="CPC" class="mono small">${esc(x.CPC_Original) || '—'}${x.CPC && x.CPC !== x.CPC_Original ? `<div class="corr" title="Corregido por la app">→ ${esc(x.CPC)}</div>` : ''}</td>
        <td data-l="Descripción" class="small">${esc(x.Descripcion)}</td>
        <td data-l="Localización" class="small ${/"Localizacion"/.test(x.Corregidos || '') ? 'corr' : ''}">${esc(x.Localizacion)}</td>
        <td data-l="Fecha">${esc(x.Fecha)}</td>
        <td data-l="Estatus">${esc(x.Estatus)}</td>
        <td data-l="QC" class="small">${esc(x.QC)}</td>
        <td>${observada(x) ? '<span class="badge b-Observado">OBS</span>' : x.Motivos ? '<span class="badge b-Validado">Revisada</span>' : ''}</td></tr>`).join('')}
    </tbody></table></div>
    ${l.length > f.limite ? '<div class="btn-row" style="justify-content:center;padding:12px"><button class="btn" id="g-mas">Ver más</button></div>' : ''}`
    : '<div class="vacio">Ninguna fila con esos filtros.</div>'}`;
  el.querySelectorAll('tr[data-id]').forEach((tr) => { tr.onclick = () => abrirFila(filas.find((x) => x.ID === tr.dataset.id), el); });
  const mas = $('#g-mas', el);
  if (mas) mas.onclick = () => { f.limite += 200; pintar(el); };
}

function abrirFila(l, el) {
  const edita = puedeEditar(l), control = puede('documentar');
  let corr = {}; try { corr = l.Corregidos ? JSON.parse(l.Corregidos) : {}; } catch (e) { corr = {}; }
  const campo = ([k, t, ancho], habil) => `<div class="field ${ancho ? 'span-all' : ''}"><label class="${corr[k] !== undefined ? 'corr' : ''}">${esc(t)}</label>
    ${k === 'Estatus' ? `<select data-k="${k}" ${habil ? '' : 'disabled'}>${['ABIERTO', 'CERRADO'].map((v) => `<option ${String(l[k]).trim().toUpperCase() === v ? 'selected' : ''}>${v}</option>`).join('')}</select>`
      : `<input data-k="${k}" class="${corr[k] !== undefined ? 'corr-in' : ''}" value="${esc(l[k])}" maxlength="500" ${habil ? '' : 'disabled'}>`}
    ${corr[k] !== undefined ? `<span class="hint"><span class="corr">■ Corregido por la app</span> · se llenó: ${esc(corr[k])}</span>` : ''}</div>`;
  const m = modal({
    grande: true,
    titulo: `LOG N° ${esc(l.N)} · ${esc(l.Codigo_Completo || 'sin correlativo')}`,
    cuerpo: `
      ${Object.keys(corr).length ? `<p class="small" style="margin:0"><span class="corr">■ Corregido por la app</span> <span class="muted">según las listas y acrónimos ya acordados; el Excel del LOG sale con lo que se llenó.</span></p>` : ''}
      ${l.Motivos ? `<div class="aviso ${l.Revisado_Por ? 'aviso-ok' : 'aviso-err'}"><b>${l.Revisado_Por ? 'Observada · revisada' : 'Observada'}</b>
        <ul style="margin:6px 0 0 18px;padding:0">${l.Motivos.split(' | ').map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
        ${l.Revisado_Por ? `<div class="small">Revisó ${esc(nombreDe(l.Revisado_Por))} · ${fFechaHora(l.Fecha_Revision)}</div>` : ''}</div>` : ''}
      <div class="form-grid">
        <div class="field"><label>Correlativo (ingeniero)</label><input value="${esc(l.Codigo_Completo)}" disabled></div>
        <div class="field"><label>Correlativo CPC (como se llenó)</label><input value="${esc(l.CPC_Original)}" disabled></div>
        ${l.CPC && l.CPC !== l.CPC_Original ? `<div class="field"><label class="corr">CPC corregido por la app</label><input class="corr-in" value="${esc(l.CPC)}" disabled>
          <span class="hint"><span class="corr">■</span> Corregido por la app: con este se numera; en el impreso sale el original.</span></div>` : ''}
        <div class="field"><label>Dueño (QC)</label><input value="${esc(l.QC)}${l.Usuario ? '' : ' · sin usuario en la app'}" disabled></div>
        ${CAMPOS.map((c) => campo(c, edita)).join('')}
      </div>
      <div class="seccion"><h3 style="margin:0">Control Documentario</h3><div class="form-grid">${CONTROL.map((c) => campo(c, control)).join('')}</div>
        ${control ? '' : '<span class="hint">Estatus, transmital y fecha de envío a Aconex los registra Control Documentario o superiores.</span>'}</div>
      <p class="small muted" style="margin:0">Título Aconex: ${esc(l.Titulo_Aconex)}</p>
      <p class="small muted" style="margin:0">Origen: ${esc(l.Origen)}${l.Modificado_Por ? ` · última corrección: ${esc(nombreDe(l.Modificado_Por))} ${fFechaHora(l.Fecha_Modificacion)}` : ''}</p>`,
    pie: `<button class="btn" data-cerrar>Cerrar</button>
      ${edita && observada(l) ? '<button class="btn" id="l-rev">Marcar revisada</button>' : ''}
      ${edita || control ? '<button class="btn btn-primary" id="l-ok">Guardar cambios</button>' : ''}`,
  });
  const actualizar = (n) => { Object.assign(l, n); pintar(el); };
  const ok = $('#l-ok', m.el);
  if (ok) ok.onclick = async () => {
    const cambios = {};
    m.el.querySelectorAll('[data-k]:not([disabled])').forEach((i) => { if (i.value.trim() !== String(l[i.dataset.k] || '')) cambios[i.dataset.k] = i.value.trim(); });
    if (!Object.keys(cambios).length) { toast('Sin cambios'); return; }
    const n = await tarea(() => api('log.editar', { id: l.ID, cambios }), 'Guardando…');
    if (n) { S.resumenEn = 0; actualizar(n); toast('Fila del LOG actualizada', 'ok'); m.cerrar(); }
  };
  const rev = $('#l-rev', m.el);
  if (rev) rev.onclick = async () => {
    if (!(await confirmar({ titulo: 'Marcar revisada', mensaje: 'La fila deja de figurar como observada (los motivos quedan anotados). ¿Continuar?', boton: 'Marcar revisada' }))) return;
    const n = await tarea(() => api('log.revisar', { id: l.ID }), 'Guardando…');
    if (n) { S.resumenEn = 0; actualizar(n); toast('Fila revisada', 'ok'); m.cerrar(); }
  };
}

export async function descargarLog() {
  const r = await tarea(() => api('log.descargar', {}), 'Armando el LOG…');
  if (r) { descargarBlob(base64ABlob(r.base64, r.mime), r.nombre); toast(`LOG descargado (${r.filas} filas)`, 'ok'); }
}

/** Carga del LOG: el mismo Excel (hoja LOG). Se previsualiza y luego se carga. */
export function abrirCargaLog(despues) {
  const m = modal({
    grande: true,
    titulo: 'Cargar LOG de Calidad',
    cuerpo: `<p class="small muted" style="margin:0">Elige el Excel del LOG (hoja <b>LOG</b>, columnas A–AC). Cada fila entra <b>tal cual</b> está llenada, para imprimirla igual.
      Las que tengan un problema (sin correlativo, repetidos, saltos de más de 10, CPC corregido…) quedan <b>observadas</b> para que las revise su dueño.
      Los correlativos ingeniero quedan registrados (no se vuelven a generar) y el CPC sigue su numeración. Si vuelves a cargar, solo entra lo que no estaba.</p>
      <div class="btn-row"><label class="btn btn-primary" for="lg-file">${ico('subir')}Elegir Excel del LOG</label><input type="file" id="lg-file" accept=".xlsx" hidden></div>
      <div id="lg-res"></div>`,
    pie: '<button class="btn" data-cerrar>Cerrar</button>',
  });
  $('#lg-file', m.el).onchange = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    let arch;
    try { arch = await archivoParaApi(file); } catch (er) { toast(er.message, 'err'); return; }
    const r = await tarea(() => api('log.previsualizar', { base64: arch.base64, nombre: file.name }), 'Revisando el LOG…');
    if (!r) return;
    const cont = Object.entries(r.contadores);
    $('#lg-res', m.el).innerHTML = `
      <div class="btn-row" style="align-items:center"><b>${esc(file.name)}</b><span class="badge b-Validado">${r.cargar} filas a cargar</span>
        ${r.observadas ? `<span class="badge b-Observado">${r.observadas} observadas</span>` : ''}${r.omitidas ? `<span class="badge b-off">${r.omitidas} ya estaban</span>` : ''}
        ${r.cargar ? `<button class="btn btn-primary" id="lg-ok">Cargar ${r.cargar} filas</button>` : ''}</div>
      <p class="small" style="margin:0"><b>${r.codigos}</b> correlativos ingeniero quedan registrados como Histórico.
        ${r.corregidas ? `<b>${r.corregidas}</b> filas con correcciones según lo ya acordado (<span class="corr">violeta</span>: acrónimos, ubicación, localización, partida, especialidad).` : ''}
        ${r.sinDueno ? `<b>${r.sinDueno}</b> filas sin dueño en la app (QC sin usuario): las revisa Control Documentario.` : ''}</p>
      ${cont.length ? `<p class="small" style="margin:0"><b>Contadores:</b> ${cont.map(([s, n]) => `${esc(s)} → ${n}`).join(' · ')}</p>` : ''}
      ${r.motivos.length ? `<div class="tabla-wrap"><table class="tabla"><thead><tr><th>Observación</th><th>Filas</th></tr></thead><tbody>
        ${r.motivos.map((x) => `<tr><td>${esc(x.motivo)}</td><td>${x.filas}</td></tr>`).join('')}</tbody></table></div>` : ''}
      ${r.filas.length ? `<details><summary class="small">Ver filas observadas (${r.filas.length})</summary><div class="tabla-wrap"><table class="tabla stack"><thead><tr><th>N°</th><th>Correlativo</th><th>CPC</th><th>Motivos</th></tr></thead><tbody>
        ${r.filas.map((x) => `<tr><td class="td-main">${esc(x.n)}</td><td data-l="Correlativo" class="mono small">${esc(x.codigo)}</td><td data-l="CPC" class="mono small">${esc(x.cpc)}</td><td data-l="Motivos" class="small">${esc(x.motivos.join(' · '))}</td></tr>`).join('')}
      </tbody></table></div></details>` : ''}
      ${r.cargar ? '' : '<div class="aviso aviso-ok">Todo este LOG ya está cargado.</div>'}`;
    const ok = $('#lg-ok', m.el);
    if (ok) ok.onclick = async () => {
      if (!(await confirmar({ titulo: 'Cargar LOG', mensaje: `Se cargarán <b>${r.cargar}</b> filas (${r.observadas} observadas) y ${r.codigos} correlativos de forma permanente. ¿Continuar?`, boton: 'Cargar' }))) return;
      const res = await tarea(() => api('log.ejecutar', { base64: arch.base64, nombre: file.name }), 'Cargando LOG…');
      if (!res) return;
      toast(`LOG cargado: ${res.filas} filas, ${res.observadas} observadas`, 'ok');
      await tarea(async () => { await recargarBootstrap(true); }, 'Actualizando…');
      m.cerrar();
      if (despues) despues(); else refrescarVista();
    };
  };
}
