import { api } from '../api.js';
import { S } from '../state.js';
import { $, esc, ico, opciones, nombreDe, fFechaHora, tarea, csvGenerar, descargarBlob } from '../util.js';
import { abrirDetalle } from './detalle.js';

const ACCIONES = ['Creación', 'Modificación', 'Liberación', 'Reutilización', 'Reasignación', 'Carga de final', 'Validación', 'Observación',
  'Formato descargado', 'Protocolo llenado', 'Validación de integridad', 'Importación', 'Ajuste de contador', 'Usuario creado', 'Usuario actualizado',
  'Serie creada', 'Serie actualizada', 'Cambio de fase', 'Catálogo creado', 'Catálogo actualizado', 'Formato creado', 'Formato actualizado',
  'Configuración', 'Proyecto creado', 'Instalación', 'Carga LOG', 'LOG corregido', 'LOG revisado'];

const f = { codigo: '', usuario: '', accion: '', desde: '', hasta: '' };
let datos = null;

export function render(el) {
  el.innerHTML = `
    <div class="page-head"><div><h1>Historial</h1><p>Bitácora inmutable: cada acción del sistema queda registrada.</p></div>
      <button class="btn" id="h-csv">${ico('bajar')}Exportar CSV</button></div>
    <div class="card">
      <div class="toolbar">
        <input id="h-codigo" class="grow" type="search" placeholder="Código o parte del código" value="${esc(f.codigo)}">
        <select id="h-usuario" style="max-width:200px">${opciones(S.usuarios.map((u) => [u.Correo, u.Nombre]), f.usuario, { vacio: 'Todos los usuarios' })}</select>
        <select id="h-accion" style="max-width:200px">${opciones(ACCIONES, f.accion, { vacio: 'Todas las acciones' })}</select>
        <input id="h-desde" type="date" style="max-width:160px" value="${esc(f.desde)}" title="Desde">
        <input id="h-hasta" type="date" style="max-width:160px" value="${esc(f.hasta)}" title="Hasta">
        <button class="btn btn-primary" id="h-buscar">Buscar</button>
      </div>
      <div id="h-lista"><div class="vacio">Cargando…</div></div>
    </div>`;
  const buscar = async () => {
    f.codigo = $('#h-codigo', el).value.trim(); f.usuario = $('#h-usuario', el).value; f.accion = $('#h-accion', el).value;
    f.desde = $('#h-desde', el).value; f.hasta = $('#h-hasta', el).value;
    const r = await tarea(() => api('historial.listar', { ...f, limite: 1000 }), 'Buscando…');
    if (r) { datos = r; pintar(el); }
  };
  $('#h-buscar', el).onclick = buscar;
  $('#h-codigo', el).onkeydown = (e) => { if (e.key === 'Enter') buscar(); };
  $('#h-csv', el).onclick = () => {
    if (!datos) return;
    const cols = ['Fecha_Hora', 'Usuario', 'Accion', 'Codigo_Completo', 'Serie', 'Correlativo', 'Estado_Resultante', 'Detalle'];
    descargarBlob(new Blob([csvGenerar(cols, datos.filas.map((h) => ({ ...h, Fecha_Hora: fFechaHora(h.Fecha_Hora) })))], { type: 'text/csv;charset=utf-8' }),
      `historial_${new Date().toISOString().slice(0, 10)}.csv`);
  };
  buscar();
}

function pintar(el) {
  $('#h-lista', el).innerHTML = datos.filas.length ? `
    <div class="tabla-wrap"><table class="tabla stack"><thead><tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Código</th><th>Detalle</th></tr></thead><tbody>
      ${datos.filas.map((h) => `<tr ${h.Codigo_Completo ? `class="click" data-cod="${esc(h.Codigo_Completo)}"` : ''}>
        <td class="td-main">${fFechaHora(h.Fecha_Hora)}</td><td data-l="Usuario">${esc(nombreDe(h.Usuario))}</td>
        <td data-l="Acción">${esc(h.Accion)}</td><td data-l="Código" class="mono">${esc(h.Codigo_Completo)}</td>
        <td data-l="Detalle" class="small">${esc(h.Detalle)}</td></tr>`).join('')}
    </tbody></table></div>
    <div class="toolbar" style="border:0"><span class="muted small">Mostrando ${datos.filas.length} de ${datos.total} movimientos</span></div>`
    : '<div class="vacio">Sin movimientos con esos filtros.</div>';
  el.querySelectorAll('tr[data-cod]').forEach((tr) => {
    tr.onclick = () => { if (S.registros.some((r) => r.Codigo_Completo === tr.dataset.cod)) abrirDetalle(tr.dataset.cod); };
  });
}
