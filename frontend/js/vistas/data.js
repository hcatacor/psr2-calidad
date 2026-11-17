// DATA: carga y descarga masiva de códigos (Control Documentario o usuarios con la carga delegada).
import { api } from '../api.js';
import { S, puede } from '../state.js';
import { $, esc, ico, modal, toast, tarea, confirmar, csvParse, csvGenerar, descargarBlob, fFechaHora, serieDe } from '../util.js';
import { recargarBootstrap, refrescarVista } from '../app.js';
import { abrirCargaLog, descargarLog, cargaLog } from './log.js';

const COLS_CARGA = ['Codigo', 'Usuario', 'Estado', 'Estado_Doc', 'Fecha', 'Actividad', 'Ubicacion', 'PK_Inicial', 'PK_Final', 'Protocolo_Topografico', 'Valorizacion'];
const COLS_DESCARGA = ['Codigo', 'Proyecto', 'Fase', 'Empresa', 'Especialidad', 'Tramo', 'Tipo_Documento', 'Correlativo', 'Area', 'Usuario', 'Estado',
  'Estado_Doc', 'Fecha', 'Actividad', 'Ubicacion', 'PK_Inicial', 'PK_Final', 'Protocolo_Topografico', 'Valorizacion', 'Origen', 'Motivo_Liberacion',
  'Fecha_Liberacion', 'Veces_Reutilizado', 'Archivo_Nombre', 'Fecha_Carga', 'Validado_Por', 'Fecha_Validacion', 'Observacion_Auditor', 'Formato', 'Correlativo_CPC'];

const hoy = () => new Date().toISOString().slice(0, 10);

export function abrirData() {
  const series = S.series.filter((s) => puede('documentar') || (s.Area || 'Calidad') === (S.usuario.Area || 'Calidad'));
  const m = modal({
    grande: true,
    titulo: 'DATA · carga y descarga',
    cuerpo: `
      <div class="seccion">
        <h3>${ico('bajar')} Descargar data</h3>
        <p class="small muted" style="margin:0">Todos los códigos que ves en ${esc(S.proyecto)} (${S.registros.length}), en CSV para Excel. Incluye cada parte de la codificación del Anexo A.</p>
        <div class="btn-row"><button class="btn" id="d-todo">${ico('bajar')}Descargar códigos</button></div>
      </div>
      <div class="seccion">
        <h3>${ico('subir')} Cargar data</h3>
        <p class="small muted" style="margin:0">Registra códigos ya usados (por ejemplo, los de la auditoría). Basta una columna <b>Codigo</b> con el código completo
          (<span class="mono">PSR2-F2-CPC-TOP-EMD-RGI-0001</span>). Opcionales: Usuario (correo), Estado (Activo/Liberado), Estado_Doc (Histórico/Pendiente), Fecha (dd/mm/aaaa), Actividad, Ubicación, PK.
          También sirve <b>Nomenclatura</b> + <b>Correlativo</b>. Se valida todo antes: si una fila tiene error, no se carga nada. El contador de cada serie sube al número más alto cargado.</p>
        <p class="small" style="margin:0">Series en las que puedes cargar: ${series.map((s) => `<span class="badge b-off">${esc(s.Codigo_Serie)}</span>`).join(' ')}</p>
        <div class="btn-row"><button class="btn" id="d-plantilla">${ico('bajar')}Plantilla para cargar</button>
          <label class="btn btn-primary" for="d-file">${ico('subir')}Elegir archivo CSV</label><input type="file" id="d-file" accept=".csv,text/csv" hidden></div>
        <div id="d-res"></div>
      </div>
      ${cargaLog() ? `<div class="seccion">
        <h3>${ico('log')} LOG de Calidad (Excel A–AC)</h3>
        <p class="small muted" style="margin:0">Carga el LOG actual tal cual (hoja LOG): las filas con problemas quedan observadas para su dueño. La descarga es el mismo Excel con lo de la app.</p>
        <div class="btn-row"><button class="btn btn-primary" id="d-log-subir">${ico('subir')}Cargar LOG</button><button class="btn" id="d-log-bajar">${ico('bajar')}Descargar LOG</button></div>
      </div>` : ''}`,
    pie: '<button class="btn" data-cerrar>Cerrar</button>',
  });

  $('#d-todo', m.el).onclick = () => descargarTodo();
  if ($('#d-log-subir', m.el)) {
    $('#d-log-subir', m.el).onclick = () => { m.cerrar(); abrirCargaLog(() => { location.hash = '#/log'; refrescarVista(); }); };
    $('#d-log-bajar', m.el).onclick = () => descargarLog();
  }
  $('#d-plantilla', m.el).onclick = () => {
    const s = series[0];
    const ej = [{ Codigo: s ? s.Prefijo_Completo + '-0001' : 'PSR2-F2-CPC-DRB-GLB-RGI-0001', Estado: 'Activo', Estado_Doc: 'Histórico', Fecha: '15/09/2026', Actividad: 'Ejemplo: borrar esta fila' }];
    descargarBlob(new Blob([csvGenerar(COLS_CARGA, ej)], { type: 'text/csv;charset=utf-8' }), `plantilla_carga_${S.proyecto}.csv`);
  };
  $('#d-file', m.el).onchange = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const filas = csvParse(await file.text());
    if (!filas.length) { toast('El archivo está vacío', 'err'); return; }
    const cols = Object.keys(filas[0]);
    if (!['Codigo', 'Codigo_Completo', 'Nomenclatura', 'Serie'].some((c) => cols.includes(c))) {
      toast('Falta la columna Codigo (o Nomenclatura + Correlativo)', 'err'); return;
    }
    const r = await tarea(() => api('importar.previsualizar', { filas }), 'Validando archivo…');
    if (r) pintarPrevia(m, r, filas, file.name);
  };
}

function descargarTodo() {
  const filas = S.registros.map((r) => {
    const s = serieDe(r.Serie) || {};
    return { ...r, Codigo: r.Codigo_Completo, Fase: s.Fase, Empresa: S.config.Empresa, Especialidad: s.Especialidad, Tramo: s.Tramo,
      Tipo_Documento: s.Tipo_Documento, Area: s.Area || 'Calidad', Correlativo: String(r.Correlativo_Numero).padStart(4, '0'),
      Fecha: fFechaHora(r.Fecha_Creacion), Fecha_Liberacion: fFechaHora(r.Fecha_Liberacion), Fecha_Carga: fFechaHora(r.Fecha_Carga), Fecha_Validacion: fFechaHora(r.Fecha_Validacion) };
  }).sort((a, b) => a.Codigo.localeCompare(b.Codigo));
  descargarBlob(new Blob([csvGenerar(COLS_DESCARGA, filas)], { type: 'text/csv;charset=utf-8' }), `data_${S.proyecto}_${hoy()}.csv`);
}

function pintarPrevia(m, r, filas, nombre) {
  const errores = r.filas.filter((f) => !f.ok);
  $('#d-res', m.el).innerHTML = `
    <div class="btn-row" style="align-items:center"><b>${esc(nombre)}</b>
      <span class="badge b-Validado">${r.validas} válidas</span>${r.errores ? `<span class="badge b-Observado">${r.errores} con error</span>` : ''}</div>
    ${r.errores ? '<div class="aviso aviso-err">Corrige las filas con error y vuelve a elegir el archivo. No se cargará nada mientras haya errores.</div>'
      : `<div class="aviso aviso-ok">Todo correcto. Se cargarán <b>${r.validas}</b> códigos.</div>`}
    ${r.ajustes.length ? `<p class="small" style="margin:0"><b>Contadores que se ajustarán:</b> ${r.ajustes.map((a) => `${esc(a.serie)} ${a.actual} → ${a.nuevo}`).join(' · ')}</p>` : ''}
    ${errores.length ? `<div class="tabla-wrap"><table class="tabla stack"><thead><tr><th>Fila</th><th>Código</th><th>Errores</th></tr></thead><tbody>
      ${errores.slice(0, 200).map((f) => `<tr><td class="td-main">Fila ${f.n}</td><td data-l="Código" class="mono">${esc(f.codigo)}</td><td data-l="Errores">${esc(f.errores.join('; '))}</td></tr>`).join('')}
    </tbody></table></div>` : ''}
    ${!r.errores ? `<div><button class="btn btn-primary" id="d-ok">Cargar ${r.validas} códigos</button></div>` : ''}`;
  const ok = $('#d-ok', m.el);
  if (ok) ok.onclick = async () => {
    if (!(await confirmar({ titulo: 'Confirmar carga', mensaje: `Se registrarán <b>${r.validas}</b> códigos en ${esc(S.proyecto)} de forma permanente (no se pueden borrar). ¿Continuar?`, boton: 'Cargar' }))) return;
    const res = await tarea(() => api('importar.ejecutar', { filas }), 'Cargando data…');
    if (!res) return;
    toast(`${res.importados} códigos cargados (lote ${res.lote})`, 'ok');
    await tarea(async () => { await recargarBootstrap(true); }, 'Actualizando…');
    m.cerrar();
    refrescarVista();
  };
}
