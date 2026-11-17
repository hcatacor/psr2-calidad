// Códigos separados y no usados: alerta al generar, "Mis pendientes" y Auditoría de no usados (visible para todos).
// Regla: un código separado se llena o se libera. Liberado = libre para cualquier usuario y primera opción de su serie.
import { api } from '../api.js';
import { S, puede, soyYo, upsertRegistros } from '../state.js';
import { $, esc, modal, toast, tarea, pedirTexto, nombreDe, fFecha, diasDesde } from '../util.js';
import { refrescarVista } from '../app.js';
import { abrirDetalle } from './detalle.js';
import { abrirFormulario, tieneFormulario, numFormato } from './formulario.js';

const datosDe = (r) => { try { return r.Datos_Formulario ? JSON.parse(r.Datos_Formulario) : null; } catch (e) { return null; } };

/** Separado y sin usar: creado en la app, activo, sin formato final y sin protocolo conforme. */
export const sinUsar = (r) => r.Estado === 'Activo' && (r.Estado_Doc || 'Pendiente') === 'Pendiente' && r.Origen === 'App' && !(datosDe(r) || {}).conforme;
/** Desde cuándo está separado (si se reutilizó un liberado, desde que se tomó). */
export const separadoDesde = (r) => (+r.Veces_Reutilizado > 0 && r.Fecha_Modificacion ? r.Fecha_Modificacion : r.Fecha_Creacion);
export const llenadoDe = (r) => (r.Datos_Formulario ? 'En avance' : 'Sin llenar');
export const misSinUsar = () => S.registros.filter((r) => sinUsar(r) && soyYo(r.Usuario))
  .sort((a, b) => (b.Fecha_Creacion || '').localeCompare(a.Fecha_Creacion || '') || b.Codigo_Completo.localeCompare(a.Codigo_Completo));
export const puedeLiberar = (r) => sinUsar(r) && ((soyYo(r.Usuario) && puede('generar')) || puede('administrar'));

/** Liberar: queda libre para cualquier usuario (primera opción al generar en su serie). */
export async function liberarCodigo(codigo) {
  const motivo = await pedirTexto({
    titulo: 'Liberar código', etiqueta: 'Motivo de la liberación', boton: 'Liberar', peligro: true,
    ayuda: 'Queda libre para cualquier usuario y será la primera opción al generar en su serie. Lo avanzado del protocolo se descarta.',
  });
  if (!motivo) return null;
  const n = await tarea(() => api('registros.liberar', { codigo, motivo }), 'Liberando…');
  if (n) { upsertRegistros(n); toast(`Código ${codigo} liberado`); }
  return n;
}

export function llenar(r) {
  if (r.Formato && tieneFormulario(r.Formato)) abrirFormulario(r.Codigo_Completo);
  else abrirDetalle(r.Codigo_Completo);
}

/** Filas con acciones Llenar / Liberar (alerta al generar y Mis pendientes). */
export function filasPendientes(lista) {
  return `<div class="pend-lista">${lista.map((r) => `<div class="pend" data-cod="${esc(r.Codigo_Completo)}">
      <div><b class="mono">${esc(r.Codigo_Completo)}</b>
        <div class="small muted">${r.Formato ? esc(numFormato(r.Formato)) + ' · ' : ''}${llenadoDe(r)} · separado hace ${diasDesde(separadoDesde(r))} día(s)</div></div>
      <div class="btn-row"><button class="btn btn-sm btn-primary" data-llenar>Llenar</button>
        ${puedeLiberar(r) ? '<button class="btn btn-sm btn-danger" data-liberar>Liberar</button>' : ''}</div></div>`).join('')}</div>`;
}

export function enlazarPendientes(root, antes) {
  root.querySelectorAll('.pend').forEach((p) => {
    const r = S.registros.find((x) => x.Codigo_Completo === p.dataset.cod);
    const ll = p.querySelector('[data-llenar]'), lb = p.querySelector('[data-liberar]');
    if (ll) ll.onclick = () => { if (antes) antes(); llenar(r); };
    if (lb) lb.onclick = async () => { if (await liberarCodigo(r.Codigo_Completo)) { if (antes) antes(); refrescarVista(); } };
  });
}

/** Auditoría de no usados: lista para todos; se avisa al dueño o al administrador para liberarlo. */
export function abrirNoUsados() {
  const lista = S.registros.filter(sinUsar).sort((a, b) => (separadoDesde(a) || '').localeCompare(separadoDesde(b) || ''));
  const libres = S.registros.filter((r) => r.Estado === 'Liberado')
    .sort((a, b) => a.Serie.localeCompare(b.Serie) || (+a.Correlativo_Numero) - (+b.Correlativo_Numero));
  const m = modal({
    grande: true,
    titulo: 'Auditoría · códigos no usados',
    cuerpo: `<span class="small muted">Códigos separados que aún no tienen registro (protocolo sin Conforme ni formato final), del más antiguo al más reciente.
        Si alguno no se usará, avisa a su dueño o al administrador para que lo libere: queda libre para cualquiera y será la primera opción de su serie.</span>
      <details class="grupo" open><summary><b>No usados</b> <span class="badge b-Pendiente">${lista.length}</span></summary>
        ${lista.length ? `<div class="tabla-wrap"><table class="tabla stack"><thead><tr><th>Código</th><th>Dueño</th><th>Estado</th><th>Días</th><th></th></tr></thead><tbody>
          ${lista.map((r) => `<tr data-cod="${esc(r.Codigo_Completo)}"><td class="td-main mono">${esc(r.Codigo_Completo)}</td>
            <td data-l="Dueño">${esc(nombreDe(r.Usuario)) || '<span class="muted">Sin dueño</span>'}</td>
            <td data-l="Estado">${llenadoDe(r)}${r.Formato ? ' · ' + esc(numFormato(r.Formato)) : ''}</td>
            <td data-l="Días">${diasDesde(separadoDesde(r))} (${fFecha(separadoDesde(r))})</td>
            <td><span class="btn-row"><button class="btn btn-sm" data-abrir>Abrir</button><button class="btn btn-sm" data-avisar>Avisar</button>
              ${puedeLiberar(r) ? '<button class="btn btn-sm btn-danger" data-liberar>Liberar</button>' : ''}</span></td></tr>`).join('')}
        </tbody></table></div>` : '<div class="vacio">No hay códigos separados sin usar.</div>'}</details>
      <details class="grupo"><summary><b>Liberados disponibles</b> <span class="badge b-Liberado">${libres.length}</span>
          <span class="small muted">· al generar en su serie, el de número más bajo sale primero</span></summary>
        ${libres.length ? `<div class="tabla-wrap"><table class="tabla stack"><thead><tr><th>Código</th><th>Liberado por</th><th>Motivo</th></tr></thead><tbody>
          ${libres.map((r) => `<tr><td class="td-main mono">${esc(r.Codigo_Completo)}</td><td data-l="Liberado por">${esc(nombreDe(r.Usuario))}</td>
            <td data-l="Motivo">${esc(r.Motivo_Liberacion)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="vacio">No hay liberados.</div>'}</details>`,
    pie: '<button class="btn btn-primary" data-cerrar>Cerrar</button>',
  });
  m.el.querySelectorAll('tr[data-cod]').forEach((tr) => {
    const r = S.registros.find((x) => x.Codigo_Completo === tr.dataset.cod);
    tr.querySelector('[data-abrir]').onclick = () => { m.cerrar(); abrirDetalle(r.Codigo_Completo); };
    tr.querySelector('[data-avisar]').onclick = () => avisar(r);
    const lb = tr.querySelector('[data-liberar]');
    if (lb) lb.onclick = async () => { if (await liberarCodigo(r.Codigo_Completo)) { m.cerrar(); refrescarVista(); abrirNoUsados(); } };
  });
}

async function avisar(r) {
  const texto = `Código ${r.Codigo_Completo} separado el ${fFecha(separadoDesde(r))} (${diasDesde(separadoDesde(r))} días) y aún sin registro (${llenadoDe(r).toLowerCase()}). ` +
    'Por favor llénalo o libéralo en la app de Gestión de Calidad. Si no se usará, el administrador puede liberarlo para que quede disponible.';
  try {
    if (navigator.share) { await navigator.share({ title: 'Código sin usar', text: texto }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  location.href = `mailto:${encodeURIComponent(r.Usuario || '')}?subject=${encodeURIComponent('Código sin usar: ' + r.Codigo_Completo)}&body=${encodeURIComponent(texto)}`;
}
