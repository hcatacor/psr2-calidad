import { api } from '../api.js';
import { S } from '../state.js';
import { $, esc, ico, badge, estadoVisible, nombreDe, fFechaHora, fFecha, tarea, diasDesde } from '../util.js';
import { abrirDetalle } from './detalle.js';

let ultimo = null; // último resultado de integridad en esta sesión

export function render(el) {
  const porValidar = S.registros.filter((r) => r.Estado_Doc === 'Cargado').sort((a, b) => (a.Fecha_Carga || '').localeCompare(b.Fecha_Carga || ''));
  const observados = S.registros.filter((r) => r.Estado_Doc === 'Observado');

  el.innerHTML = `
    <div class="page-head">
      <div><h1>Auditor</h1><p>Integridad de correlativos y validación de formatos finales.</p></div>
      <button class="btn btn-primary" id="btn-integridad">${ico('auditor')}Validar integridad</button>
    </div>
    <div id="integridad">${ultimo ? '' : `<div class="card card-pad muted">Pulsa <b>Validar integridad</b> para revisar duplicados, huecos, descuadres de contador, códigos mal formados, liberados y pendientes antiguos. Cada validación queda registrada en el historial.</div>`}</div>

    <div class="grid grid-2" style="margin-top:16px">
      <div class="card">
        <div class="card-head"><h2>Por validar</h2><span class="badge b-Cargado">${porValidar.length}</span></div>
        ${tablaCodigos(porValidar, 'Fecha_Carga', 'Cargado')}
      </div>
      <div class="card">
        <div class="card-head"><h2>Observados (en corrección)</h2><span class="badge b-Observado">${observados.length}</span></div>
        ${tablaCodigos(observados, 'Fecha_Validacion', 'Observado')}
      </div>
    </div>`;

  $('#btn-integridad', el).onclick = async () => {
    const r = await tarea(() => api('auditoria.integridad'), 'Validando integridad…');
    if (r) { ultimo = r; pintarIntegridad(el); }
  };
  if (ultimo) pintarIntegridad(el);
  el.querySelectorAll('tr[data-cod]').forEach((tr) => { tr.onclick = () => abrirDetalle(tr.dataset.cod); });
}

function tablaCodigos(lista, campoFecha, etiqueta) {
  if (!lista.length) return '<div class="vacio">Nada pendiente.</div>';
  return `<div class="tabla-wrap"><table class="tabla stack"><thead><tr><th>Código</th><th>Usuario</th><th>${etiqueta}</th><th>Días</th></tr></thead><tbody>
    ${lista.slice(0, 50).map((r) => `<tr class="click" data-cod="${esc(r.Codigo_Completo)}"><td class="td-main mono">${esc(r.Codigo_Completo)}</td>
      <td data-l="Usuario">${esc(nombreDe(r.Usuario))}</td><td data-l="${etiqueta}">${fFecha(r[campoFecha])}</td><td data-l="Días" class="num">${diasDesde(r[campoFecha])}</td></tr>`).join('')}
  </tbody></table></div>`;
}

function lista(nums, max = 30) {
  if (!nums.length) return '<span class="muted">—</span>';
  const v = nums.slice(0, max).join(', ');
  return esc(v) + (nums.length > max ? ` … (+${nums.length - max})` : '');
}

function pintarIntegridad(el) {
  const r = ultimo;
  const a = r.alertas;
  $('#integridad', el).innerHTML = `
    <div class="aviso ${r.ok ? 'aviso-ok' : 'aviso-err'}" style="margin-bottom:16px">
      <b>${r.ok ? 'Sin errores críticos.' : `${r.criticas} error(es) crítico(s) detectados.`}</b>
      Revisión del ${fFechaHora(r.fecha)} por ${esc(nombreDe(r.auditor))} · ${r.totalCodigos} códigos.
    </div>
    <div class="grid grid-kpi">
      ${[['Duplicados', a.duplicados, a.duplicados ? 'c-Observado' : 'c-Validado'],
        ['Huecos', a.huecos, a.huecos ? 'c-Pendiente' : 'c-Validado'],
        ['Descuadres de contador', a.descuadres, a.descuadres ? 'c-Observado' : 'c-Validado'],
        ['Mal formados', a.codigoMalFormado, a.codigoMalFormado ? 'c-Observado' : 'c-Validado'],
        ['Sin dueño', a.sinDueno, 'c-Histórico'],
        ['Liberados en alerta', a.liberadosViejos, a.liberadosViejos ? 'c-Liberado' : 'c-Validado'],
        ['Pendientes en alerta', a.pendientesViejos, a.pendientesViejos ? 'c-Pendiente' : 'c-Validado'],
        ['Por validar', a.porValidar, 'c-Cargado']]
        .map(([l, v, c]) => `<div class="card kpi"><span class="kpi-label"><span class="kpi-dot ${c}"></span>${l}</span><span class="kpi-value">${v}</span></div>`).join('')}
    </div>
    <div class="card" style="margin-top:16px">
      <div class="card-head"><h2>Detalle por serie</h2></div>
      <div class="tabla-wrap"><table class="tabla stack"><thead><tr>
        <th>Serie</th><th class="num">Contador</th><th class="num">Máx. real</th><th class="num">Códigos</th><th>Duplicados</th><th>Huecos</th><th>Estado</th></tr></thead><tbody>
        ${r.series.map((s) => `<tr><td class="td-main">${esc(s.serie)}</td>
          <td data-l="Contador" class="num">${s.ultimo}</td><td data-l="Máx. real" class="num">${s.maximoReal}</td><td data-l="Códigos" class="num">${s.total}</td>
          <td data-l="Duplicados">${lista(s.duplicados)}</td><td data-l="Huecos">${lista(s.huecos)}</td>
          <td data-l="Estado">${s.ok ? '<span class="badge b-Validado">OK</span>' : `<span class="badge b-Observado">Revisar</span>${s.descuadre ? ' <span class="small">contador menor al máximo</span>' : ''}${s.malFormados.length ? ` <span class="small">${s.malFormados.length} mal formado(s)</span>` : ''}`}</td></tr>`).join('')}
      </tbody></table></div>
    </div>
    ${r.codigosRepetidos.length || r.huerfanos.length ? `<div class="card card-pad" style="margin-top:16px"><div class="aviso aviso-err">
      ${r.codigosRepetidos.length ? `<div><b>Códigos repetidos:</b> ${esc(r.codigosRepetidos.join(', '))}</div>` : ''}
      ${r.huerfanos.length ? `<div><b>Códigos de series inexistentes:</b> ${esc(r.huerfanos.join(', '))}</div>` : ''}</div></div>` : ''}
    <div class="grid grid-2" style="margin-top:16px">
      <div class="card"><div class="card-head"><h2>Liberados en alerta</h2><span class="muted small">≥ ${esc(S.config.Dias_Alerta_Liberado)} días</span></div>
        ${r.liberadosViejos.length ? `<div class="tabla-wrap"><table class="tabla stack"><thead><tr><th>Código</th><th>Usuario</th><th>Motivo</th><th class="num">Días</th></tr></thead><tbody>
          ${r.liberadosViejos.map((x) => `<tr class="click" data-cod="${esc(x.codigo)}"><td class="td-main mono">${esc(x.codigo)}</td><td data-l="Usuario">${esc(nombreDe(x.usuario))}</td>
            <td data-l="Motivo">${esc(x.motivo)}</td><td data-l="Días" class="num">${x.dias}</td></tr>`).join('')}</tbody></table></div>` : '<div class="vacio">Ninguno.</div>'}</div>
      <div class="card"><div class="card-head"><h2>Pendientes de carga en alerta</h2><span class="muted small">≥ ${esc(S.config.Dias_Alerta_Pendiente)} días</span></div>
        ${r.pendientesViejos.length ? `<div class="tabla-wrap"><table class="tabla stack"><thead><tr><th>Código</th><th>Usuario</th><th class="num">Días</th></tr></thead><tbody>
          ${r.pendientesViejos.slice(0, 100).map((x) => `<tr class="click" data-cod="${esc(x.codigo)}"><td class="td-main mono">${esc(x.codigo)}</td><td data-l="Usuario">${esc(nombreDe(x.usuario))}</td>
            <td data-l="Días" class="num">${x.dias}</td></tr>`).join('')}</tbody></table></div>` : '<div class="vacio">Ninguno.</div>'}</div>
    </div>`;
  $('#integridad', el).querySelectorAll('tr[data-cod]').forEach((tr) => { tr.onclick = () => abrirDetalle(tr.dataset.cod); });
}
