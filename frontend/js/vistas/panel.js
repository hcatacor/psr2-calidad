import { S, soyYo, puede } from '../state.js';
import { $, esc, opciones, estadoVisible, badge, nombreDe, periodoDe, valorizacionDe, etiquetaPeriodo, periodoActual, fFecha, ESTADOS_VISIBLES, diasDesde } from '../util.js';
import { abrirDetalle } from './detalle.js';
import { sinUsar, filasPendientes, enlazarPendientes, abrirNoUsados } from './pendientes.js';
import { pintarResumenPanel } from './log.js';

const filtros = { periodo: '', serie: '', usuario: '' };

export function render(el) {
  const di = +S.config.Dia_Inicio_Ciclo || 26;
  const df = +S.config.Dia_Fin_Ciclo || 25;
  const periodos = [...new Set(S.registros.map((r) => valorizacionDe(r)).filter(Boolean).concat(periodoActual()))].sort().reverse();
  const usuariosConCodigos = [...new Set(S.registros.map((r) => r.Usuario).filter(Boolean))];

  el.innerHTML = `
    <div class="page-head">
      <div><h1>Panel de control</h1><p>Hola, ${esc(S.usuario.Nombre)}. Estado general de los códigos de protocolo.</p></div>
    </div>
    <div class="card"><div class="toolbar">
      <select id="f-periodo" style="max-width:280px">${opciones(periodos.map((p) => [p, etiquetaPeriodo(p, di, df)]), filtros.periodo, { vacio: 'Todos los periodos' })}</select>
      <select id="f-serie" style="max-width:200px">${opciones(S.series.map((s) => s.Codigo_Serie), filtros.serie, { vacio: 'Todas las series' })}</select>
      <select id="f-usuario" style="max-width:220px">${opciones(usuariosConCodigos.map((c) => [c, nombreDe(c)]), filtros.usuario, { vacio: 'Todos los usuarios' })}</select>
    </div></div>
    <div id="p-resumen"></div>
    <div id="panel-cuerpo"></div>`;

  ['periodo', 'serie', 'usuario'].forEach((k) => {
    $('#f-' + k, el).onchange = (e) => { filtros[k] = e.target.value; pintar(el); };
  });
  pintar(el);
  pintarResumenPanel($('#p-resumen', el));
}

function pintar(el) {
  const di = +S.config.Dia_Inicio_Ciclo || 26;
  const df = +S.config.Dia_Fin_Ciclo || 25;
  const regs = S.registros.filter((r) =>
    (!filtros.periodo || valorizacionDe(r) === filtros.periodo) &&
    (!filtros.serie || r.Serie === filtros.serie) &&
    (!filtros.usuario || r.Usuario === filtros.usuario));

  const cuenta = Object.fromEntries(ESTADOS_VISIBLES.map((e) => [e, 0]));
  regs.forEach((r) => cuenta[estadoVisible(r)]++);
  const utilizados = cuenta.Cargado + cuenta.Validado + cuenta.Observado + cuenta.Histórico;

  const kpis = [
    ['Total códigos', regs.length, 'c-total', ''],
    ['Pendientes de carga', cuenta.Pendiente, 'c-Pendiente', 'Pendiente'],
    ['Por validar', cuenta.Cargado, 'c-Cargado', 'Cargado'],
    ['Observados', cuenta.Observado, 'c-Observado', 'Observado'],
    ['Validados', cuenta.Validado, 'c-Validado', 'Validado'],
    ['Liberados (disponibles)', cuenta.Liberado, 'c-Liberado', 'Liberado'],
    ['Históricos', cuenta.Histórico, 'c-Histórico', 'Histórico'],
    ['Utilizados', utilizados, 'c-total', ''],
  ];

  // Por serie (barras apiladas por estado)
  const series = (filtros.serie ? S.series.filter((s) => s.Codigo_Serie === filtros.serie) : S.series).map((s) => {
    const rs = regs.filter((r) => r.Serie === s.Codigo_Serie);
    const c = Object.fromEntries(ESTADOS_VISIBLES.map((e) => [e, 0]));
    rs.forEach((r) => c[estadoVisible(r)]++);
    return { serie: s.Codigo_Serie, total: rs.length, c };
  });
  const maxSerie = Math.max(1, ...series.map((s) => s.total));

  // Por periodo (últimos 6 con datos)
  const porPeriodo = {};
  S.registros.filter((r) => (!filtros.serie || r.Serie === filtros.serie) && (!filtros.usuario || r.Usuario === filtros.usuario))
    .forEach((r) => { const p = valorizacionDe(r); if (p) porPeriodo[p] = (porPeriodo[p] || 0) + 1; });
  const periodos = Object.keys(porPeriodo).sort().slice(-6);
  const maxPer = Math.max(1, ...periodos.map((p) => porPeriodo[p]));

  // Mis pendientes (operador)
  const mios = S.registros.filter((r) => soyYo(r.Usuario) && ['Pendiente', 'Observado'].includes(estadoVisible(r)) && !sinUsar(r))
    .sort((a, b) => (a.Fecha_Creacion || '').localeCompare(b.Fecha_Creacion || ''));
  const separados = S.registros.filter((r) => soyYo(r.Usuario) && sinUsar(r))
    .sort((a, b) => (b.Fecha_Creacion || '').localeCompare(a.Fecha_Creacion || ''));
  const noUsados = S.registros.filter(sinUsar).length;

  $('#panel-cuerpo', el).innerHTML = `
    <div class="grid grid-kpi" style="margin-top:16px">
      ${kpis.map(([l, v, c, est]) => `<div class="card kpi" ${est ? `data-href="#/codigos?estado=${encodeURIComponent(est)}${filtros.serie ? '&serie=' + encodeURIComponent(filtros.serie) : ''}"` : ''}>
        <span class="kpi-label"><span class="kpi-dot ${c}"></span>${l}</span><span class="kpi-value">${v}</span></div>`).join('')}
    </div>

    ${puede('generar') ? `<div class="card">
      <details class="grupo" ${separados.length ? 'open' : ''}><summary><b>Mis pendientes · separados sin llenar</b> <span class="badge b-Pendiente">${separados.length}</span>
        <span class="small muted">· llénalos o libéralos</span></summary>
        ${separados.length ? filasPendientes(separados) : '<div class="vacio">No tienes códigos separados sin llenar.</div>'}</details>
      <details class="grupo"><summary><b>Mis pendientes · por cargar o corregir</b> <span class="badge b-off">${mios.length}</span></summary>
      ${mios.length ? `<div class="tabla-wrap"><table class="tabla stack"><thead><tr><th>Código</th><th>Estado</th><th>Creado</th><th>Acción sugerida</th></tr></thead><tbody>
        ${mios.map((r) => {
          const e = estadoVisible(r);
          const acc = e === 'Observado' ? 'Corregir y volver a cargar' : `Cargar formato final (${diasDesde(r.Fecha_Creacion)} días)`;
          return `<tr class="click" data-cod="${esc(r.Codigo_Completo)}"><td class="td-main mono">${esc(r.Codigo_Completo)}</td><td data-l="Estado">${badge(e)}</td>
            <td data-l="Creado">${fFecha(r.Fecha_Creacion)}</td><td data-l="Acción">${esc(acc)}</td></tr>`;
        }).join('')}
      </tbody></table></div>` : '<div class="vacio">Todo al día.</div>'}</details>
    </div>` : ''}
    <div class="card card-pad" style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
      <span><b>Auditoría · códigos no usados:</b> ${noUsados} separado(s) sin registro en el proyecto.</span>
      <button class="btn btn-sm" id="p-nousados">Ver lista</button></div>

    <div class="grid grid-2" style="margin-top:16px">
      <div class="card">
        <div class="card-head"><h2>Consumo por serie</h2></div>
        <div class="bars">${series.map((s) => `<div class="bar-row"><span class="lbl" title="${esc(s.serie)}">${esc(s.serie)}</span>
          <div class="bar-track" style="width:${Math.max(2, (s.total / maxSerie) * 100)}%">${ESTADOS_VISIBLES.map((e) => s.c[e] ? `<div class="bar-seg c-${e}" style="width:${(s.c[e] / s.total) * 100}%" title="${e}: ${s.c[e]}"></div>` : '').join('')}</div>
          <span class="val">${s.total}</span></div>`).join('') || '<div class="vacio">Sin series</div>'}</div>
        <div class="legend">${ESTADOS_VISIBLES.map((e) => `<span><i class="kpi-dot c-${e}"></i>${e}</span>`).join('')}</div>
      </div>
      <div class="card">
        <div class="card-head"><h2>Códigos por periodo</h2><span class="muted small">Ciclo ${di} → ${df}</span></div>
        <div class="bars">${periodos.map((p) => `<div class="bar-row"><span class="lbl" title="${esc(etiquetaPeriodo(p, di, df))}">${esc(etiquetaPeriodo(p, di, df).split(' (')[0])}</span>
          <div class="bar-track"><div class="bar-seg c-total" style="width:${(porPeriodo[p] / maxPer) * 100}%"></div></div>
          <span class="val">${porPeriodo[p]}</span></div>`).join('') || '<div class="vacio">Sin datos aún</div>'}</div>
      </div>
    </div>`;

  el.querySelectorAll('[data-href]').forEach((k) => { k.onclick = () => { location.hash = k.dataset.href; }; });
  el.querySelectorAll('tr[data-cod]').forEach((tr) => { tr.onclick = () => abrirDetalle(tr.dataset.cod); });
  enlazarPendientes(el);
  $('#p-nousados', el).onclick = () => abrirNoUsados();
}
