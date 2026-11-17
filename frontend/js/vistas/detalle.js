import { api } from '../api.js';
import { S, puede, soyYo, upsertRegistros } from '../state.js';
import { $, esc, ico, badge, estadoVisible, nombreDe, fFechaHora, modal, toast, tarea, pedirTexto, confirmar, opciones,
  base64ABlob, descargarBlob, archivoParaApi, serieDe, valorizacionDe, diasDesde, codigoVisual, etiquetaCat } from '../util.js';
import { refrescarVista } from '../app.js';
import { abrirFormulario, tieneFormulario, numFormato, nombreFormato } from './formulario.js';
import { vistaPrevia, descargarPDF, enviarPDF, descargarXlsx } from './imprimir.js';

const CAMPOS = [
  ['Actividad', 'Actividad', 'span-all'], ['Ubicacion', 'Ubicación', ''],
  ['PK_Inicial', 'PK inicial', ''], ['PK_Final', 'PK final', ''],
  ['Protocolo_Topografico', 'Ref. protocolo', ''], ['Valorizacion', 'Valorización', ''],
];

export function abrirDetalle(codigo) {
  const r = S.registros.find((x) => x.Codigo_Completo === codigo);
  if (!r) { toast('Código no encontrado. Actualiza los datos.', 'err'); return; }

  const e = estadoVisible(r);
  const dueno = soyYo(r.Usuario) && puede('generar');
  const admin = puede('administrar');
  const prop = puede('propietario');
  const activo = r.Estado === 'Activo';
  const serie = serieDe(r.Serie) || {};
  const formato = S.formatos.find((f) => f.Codigo_Formato === r.Formato);
  const hayFormatos = S.formatos.some(activoFmt);
  const hayFichas = S.formatos.some((f) => activoFmt(f) && f.Plantilla_Tipo === 'xlsx');
  const puedeCompartir = !!(navigator.canShare && navigator.canShare({ files: [new File([''], 'x.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })] }));

  const pEditar = (dueno || admin) && (r.Estado_Doc !== 'Validado' || admin);
  const pDescargarFormato = (dueno || admin) && activo;
  const pCargar = (dueno || admin) && activo && (r.Estado_Doc !== 'Validado' || admin);
  const pValidar = puede('auditar') && r.Estado_Doc === 'Cargado';
  const pLiberar = (dueno || admin) && activo && r.Estado_Doc === 'Pendiente' && !conformeDe(r);
  const pReutilizar = (dueno || prop) && r.Estado === 'Liberado';
  const pReasignar = admin;

  const m = modal({
    grande: true,
    titulo: `<span class="det-code">${esc(r.Codigo_Completo)}</span>`,
    cuerpo: `
      ${codigoVisual(r.Codigo_Completo)}
      <div class="btn-row" style="align-items:center">${badge(e)}
        ${r.Origen ? `<span class="badge b-off">Origen: ${esc(r.Origen)}</span>` : ''}
        ${+r.Veces_Reutilizado ? `<span class="badge b-off">Reutilizado ${esc(r.Veces_Reutilizado)}×</span>` : ''}
        <button class="btn btn-ghost btn-sm" id="d-copiar">${ico('copiar')}Copiar código</button></div>

      ${e === 'Observado' ? `<div class="aviso aviso-err"><b>Observación del auditor:</b> ${esc(r.Observacion_Auditor)}<br><span class="small">Por ${esc(nombreDe(r.Validado_Por))} el ${fFechaHora(r.Fecha_Validacion)}. Corrige y vuelve a cargar el formato.</span></div>` : ''}
      ${e === 'Liberado' ? `<div class="aviso aviso-warn"><b>Liberado</b> hace ${diasDesde(r.Fecha_Liberacion)} día(s). Motivo: ${esc(r.Motivo_Liberacion)}</div>` : ''}

      <dl class="kv">
        <div><dt>Fase</dt><dd>${esc(etiquetaCat('Fase', serie.Fase || ''))}</dd></div>
        <div><dt>Especialidad</dt><dd>${esc(etiquetaCat('Especialidad', serie.Especialidad || ''))}</dd></div>
        <div><dt>Tramo</dt><dd>${esc(etiquetaCat('Tramo', serie.Tramo || ''))}</dd></div>
        <div><dt>Tipo de documento</dt><dd>${esc(etiquetaCat('Tipo_Documento', serie.Tipo_Documento || ''))}</dd></div>
        <div><dt>Dueño</dt><dd>${esc(nombreDe(r.Usuario)) || '<span class="muted">Sin dueño</span>'}</dd></div>
        <div><dt>Creado</dt><dd>${fFechaHora(r.Fecha_Creacion) || '—'}</dd></div>
        ${r.Modificado_Por ? `<div><dt>Última modificación</dt><dd>${esc(nombreDe(r.Modificado_Por))} · ${fFechaHora(r.Fecha_Modificacion)}</dd></div>` : ''}
        ${r.Usuario_Anterior ? `<div><dt>Dueño anterior</dt><dd>${esc(nombreDe(r.Usuario_Anterior))}</dd></div>` : ''}
        ${r.Validado_Por && e === 'Validado' ? `<div><dt>Validado por</dt><dd>${esc(nombreDe(r.Validado_Por))} · ${fFechaHora(r.Fecha_Validacion)}</dd></div>` : ''}
      </dl>

      <div class="seccion">
        <h3>Formato</h3>
        <div class="btn-row">
          ${pDescargarFormato && hayFichas && (!r.Formato || tieneFormulario(r.Formato)) && (r.Estado_Doc !== 'Validado' || admin)
            ? `<button class="btn btn-primary" id="d-llenar">${r.Datos_Formulario ? 'Editar protocolo' : 'Llenar protocolo'}</button>` : ''}
          ${r.Formato && formato
            ? `${tieneFormulario(r.Formato) && r.Datos_Formulario ? `<button class="btn" id="d-vista">${ico('ojo')}Vista previa</button>
               <button class="btn" id="d-pdf">${ico('bajar')}Descargar PDF</button>
               <button class="btn" id="d-enviar">Enviar</button>` : ''}
               <button class="btn" id="d-bajar">${ico('bajar')}Descargar Excel</button>`
            : (pDescargarFormato && hayFormatos ? `<button class="btn" id="d-formato">${ico('bajar')}Descargar formato</button>` : '')}
          ${r.Archivo_ID ? `<button class="btn" id="d-ver">${ico('ojo')}Ver formato final</button>` : ''}
        </div>
        ${r.Formato ? `<span class="small">Protocolo: <b>${esc(nombreFormato(r.Formato))}</b>${r.Correlativo_CPC ? ` · CPC <b class="mono">${esc(r.Correlativo_CPC)}</b>` : ''}${r.Datos_Formulario ? (conformeDe(r) ? ' · <span class="badge b-Validado">Conforme</span>' : ' · <span class="badge b-Pendiente">En avance</span>') : ''}</span>` : ''}
        ${r.Archivo_ID ? `<span class="small muted">Final: ${esc(r.Archivo_Nombre)} · cargado por ${esc(nombreDe(r.Cargado_Por))} el ${fFechaHora(r.Fecha_Carga)}</span>` : ''}
        ${pCargar ? `<label class="file-drop" for="d-file">${ico('subir')}
            <div><b>${r.Archivo_ID ? 'Reemplazar formato final' : 'Cargar formato final firmado'}</b></div>
            <div class="small muted">PDF o foto (JPG/PNG), máx. ${S.app.maxArchivoMB} MB. En el celular puedes tomar la foto directamente.</div></label>
          <input type="file" id="d-file" accept="application/pdf,image/jpeg,image/png" hidden>` : ''}
        <div id="d-preview"></div>
        ${pValidar ? `<div class="btn-row"><button class="btn btn-ok" id="d-validar">Validar</button><button class="btn btn-danger" id="d-observar">Observar</button></div>` : ''}
      </div>

      <div class="seccion">
        <h3>Datos del protocolo</h3>
        <div class="form-grid">${CAMPOS.map(([k, l, cls]) => `<div class="field ${cls}"><label>${l}</label>
          ${k === 'Valorizacion'
            ? `<input data-campo="${k}" type="month" value="${esc(valorizacionDe(r))}" ${pEditar ? '' : 'readonly'}><span class="hint">Automática: del 26 al 25 = mes siguiente. Edítala solo si corresponde otro mes.</span>`
            : `<input data-campo="${k}" value="${esc(r[k])}" maxlength="300" ${pEditar ? '' : 'readonly'}>`}</div>`).join('')}</div>
        ${pEditar ? '<div><button class="btn btn-primary btn-sm" id="d-guardar">Guardar cambios</button></div>' : ''}
      </div>

      ${(pLiberar || pReutilizar || pReasignar) ? `<div class="seccion"><h3>Acciones del código</h3><div class="btn-row">
        ${pReutilizar ? '<button class="btn btn-primary" id="d-reutilizar">Reutilizar código</button>' : ''}
        ${pLiberar ? '<button class="btn btn-danger" id="d-liberar">Liberar código</button>' : ''}
        ${pReasignar ? '<button class="btn" id="d-reasignar">Reasignar dueño</button>' : ''}
      </div>
      ${pLiberar ? '<span class="small muted">Liberar: el código queda libre para cualquier usuario y será la primera opción al generar en esta serie. Lo avanzado del protocolo se descarta.</span>' : ''}
      ${!pLiberar && activo && (dueno || admin) ? '<span class="small muted">No se puede liberar: ya tiene Conforme, formato cargado o es histórico.</span>' : ''}
      </div>` : ''}

      <div class="seccion"><h3>Historial</h3><ul class="timeline" id="d-hist"><li class="muted">Cargando…</li></ul></div>`,
  });

  const el = m.el;
  const recargar = (nuevo) => { upsertRegistros(nuevo); m.cerrar(); refrescarVista(); abrirDetalle(codigo); };

  $('#d-copiar', el).onclick = async () => { try { await navigator.clipboard.writeText(codigo); toast('Copiado'); } catch (e) { toast('No se pudo copiar', 'err'); } };

  // Imprimir: la hoja se arma al momento con los datos guardados (no hay archivo almacenado)
  const bb = $('#d-bajar', el);
  if (bb) bb.onclick = () => descargarXlsx(r);
  const be = $('#d-enviar', el);
  if (be) be.onclick = () => enviarPDF(r);
  const bp = $('#d-pdf', el);
  if (bp) bp.onclick = () => descargarPDF(r);
  const bv = $('#d-vista', el);
  if (bv) bv.onclick = () => vistaPrevia(r, pEditar ? { onEditar: () => { m.cerrar(); abrirFormulario(codigo); } } : {});
  const bl = $('#d-llenar', el);
  if (bl) bl.onclick = () => { m.cerrar(); abrirFormulario(codigo); };
  const bf = $('#d-formato', el);
  if (bf) bf.onclick = () => elegirFormato(r, serie, () => recargar({ ...r }));

  const ver = $('#d-ver', el);
  if (ver) ver.onclick = async () => {
    const f = await tarea(() => api('archivos.descargarFinal', { codigo }), 'Descargando…');
    if (!f) return;
    const blob = base64ABlob(f.base64, f.mime);
    const url = URL.createObjectURL(blob);
    $('#d-preview', el).innerHTML = `<div class="preview">${f.mime === 'application/pdf'
      ? `<iframe src="${url}" title="Formato final"></iframe>` : `<img src="${url}" alt="Formato final">`}</div>
      <div><a class="btn btn-sm" href="${url}" download="${esc(f.nombre)}">${ico('bajar')}Descargar ${esc(f.nombre)}</a></div>`;
  };

  const file = $('#d-file', el);
  if (file) file.onchange = async () => {
    const fl = file.files[0];
    if (!fl) return;
    if (r.Archivo_ID && !(await confirmar({ titulo: 'Reemplazar formato', mensaje: 'El archivo anterior se conserva en el historial, pero el código quedará con el nuevo archivo y volverá a estado <b>Cargado</b> (por validar). ¿Continuar?', boton: 'Reemplazar' }))) { file.value = ''; return; }
    const nuevo = await tarea(async () => {
      const a = await archivoParaApi(fl, { comprimir: true, maxMB: S.app.maxArchivoMB });
      return api('archivos.subirFinal', { codigo, ...a });
    }, 'Subiendo formato…');
    file.value = '';
    if (nuevo) { toast('Formato cargado. Queda pendiente de validación.', 'ok'); recargar(nuevo); }
  };

  const val = $('#d-validar', el);
  if (val) val.onclick = async () => {
    if (!(await confirmar({ titulo: 'Validar formato', mensaje: `¿Confirmas que el formato final de <b class="mono">${esc(codigo)}</b> está correcto y completo?`, boton: 'Validar' }))) return;
    const n = await tarea(() => api('auditoria.validar', { codigo, resultado: 'Validado' }), 'Validando…');
    if (n) { toast('Formato validado', 'ok'); recargar(n); }
  };
  const obs = $('#d-observar', el);
  if (obs) obs.onclick = async () => {
    const t = await pedirTexto({ titulo: 'Observar formato', etiqueta: 'Observación para el operador', ayuda: 'Indica qué debe corregir. El código vuelve al operador.', boton: 'Enviar observación', peligro: true });
    if (!t) return;
    const n = await tarea(() => api('auditoria.validar', { codigo, resultado: 'Observado', observacion: t }), 'Guardando…');
    if (n) { toast('Observación registrada'); recargar(n); }
  };

  const guardar = $('#d-guardar', el);
  if (guardar) guardar.onclick = async () => {
    const campos = {};
    el.querySelectorAll('[data-campo]').forEach((i) => { campos[i.dataset.campo] = i.value.trim(); });
    const n = await tarea(() => api('registros.editar', { codigo, campos }), 'Guardando…');
    if (n) { toast('Cambios guardados', 'ok'); recargar(n); }
  };

  const lib = $('#d-liberar', el);
  if (lib) lib.onclick = async () => {
    const motivo = await pedirTexto({ titulo: 'Liberar código', etiqueta: 'Motivo de la liberación', ayuda: 'Ejemplo: protocolo anulado, actividad reprogramada. Queda libre para cualquier usuario.', boton: 'Liberar', peligro: true });
    if (!motivo) return;
    const n = await tarea(() => api('registros.liberar', { codigo, motivo }), 'Liberando…');
    if (n) { toast('Código liberado'); recargar(n); }
  };

  const reu = $('#d-reutilizar', el);
  if (reu) reu.onclick = async () => {
    if (!(await confirmar({ titulo: 'Reutilizar código', mensaje: `El código <b class="mono">${esc(codigo)}</b> vuelve a estado Activo para un nuevo protocolo. Actualiza luego los datos del protocolo.`, boton: 'Reutilizar' }))) return;
    const n = await tarea(() => api('registros.reutilizar', { codigo }), 'Reutilizando…');
    if (n) { toast('Código reutilizado', 'ok'); recargar(n); }
  };

  const rea = $('#d-reasignar', el);
  if (rea) rea.onclick = () => reasignar(r, recargar);

  api('registros.historial', { codigo }).then((h) => {
    const ul = $('#d-hist', el);
    if (!ul) return;
    ul.innerHTML = h.length ? h.map((x) => `<li><b>${esc(x.Accion)}</b> · ${fFechaHora(x.Fecha_Hora)} · ${esc(nombreDe(x.Usuario))}
      ${x.Detalle ? `<div class="muted">${esc(x.Detalle)}</div>` : ''}</li>`).join('') : '<li class="muted">Sin movimientos.</li>';
  }).catch((e) => { const ul = $('#d-hist', el); if (ul) ul.innerHTML = `<li class="muted">${esc(e.message)}</li>`; });
}

function reasignar(r, recargar) {
  const candidatos = S.usuarios.filter((u) => u.Activo && ['Operador', 'Control Documentario', 'Jefe de Área', 'Coordinador General', 'Propietario'].includes(u.Rol) && u.Correo !== r.Usuario);
  const m = modal({
    titulo: 'Reasignar dueño',
    cuerpo: `<p style="margin:0">Código <b class="mono">${esc(r.Codigo_Completo)}</b>. Dueño actual: <b>${esc(nombreDe(r.Usuario)) || 'sin dueño'}</b>.</p>
      <div class="field"><label>Nuevo dueño</label><select id="ra-u">${opciones(candidatos.map((u) => [u.Correo, `${u.Nombre} (${u.Rol})`]), '', { vacio: 'Elige un usuario…' })}</select></div>
      <div class="field"><label>Motivo (opcional)</label><input id="ra-m" maxlength="300"></div>`,
    pie: '<button class="btn" data-cerrar>Cancelar</button><button class="btn btn-primary" id="ra-ok">Reasignar</button>',
  });
  $('#ra-ok', m.el).onclick = async () => {
    const usuario = $('#ra-u', m.el).value;
    if (!usuario) { toast('Elige un usuario', 'err'); return; }
    const n = await tarea(() => api('registros.reasignar', { codigo: r.Codigo_Completo, usuario, motivo: $('#ra-m', m.el).value }), 'Reasignando…');
    if (n) { m.cerrar(); toast('Código reasignado', 'ok'); recargar(n); }
  };
}

// ---------------------------------------------------------------- Descargar formato (elegir de la biblioteca)
const conformeDe = (r) => { try { return JSON.parse(r.Datos_Formulario).conforme; } catch (e) { return null; } };
const activoFmt = (f) => String(f.Activo).toUpperCase() === 'TRUE';
const TIPO_FMT = { xlsx: 'Excel', doc: 'Word', archivo: 'PDF' };

function elegirFormato(r, serie, alTerminar) {
  // Primero los del tramo de la serie y los generales (GLB); luego los demás, en orden
  const propio = (f) => [serie.Tramo, 'GLB'].includes(numFormato(f.Codigo_Formato).split('-')[0]);
  const lista = S.formatos.filter(activoFmt).sort((a, b) =>
    (propio(b) - propio(a)) || numFormato(a.Codigo_Formato).localeCompare(numFormato(b.Codigo_Formato), 'es', { numeric: true }));
  const actual = lista.some((f) => f.Codigo_Formato === r.Formato) ? r.Formato : (lista.length === 1 ? lista[0].Codigo_Formato : '');
  const bloqueado = r.Estado_Doc === 'Validado' && !!r.Formato;
  const m = modal({
    titulo: 'Descargar formato',
    cuerpo: `<span class="small muted">Para <b class="mono">${esc(r.Codigo_Completo)}</b>. Sale con el código, fecha, actividad y demás datos ya escritos.</span>
      ${lista.length > 8 ? '<input id="fx-buscar" type="search" placeholder="Buscar formato…" autocomplete="off">' : ''}
      <div class="serie-lista">${lista.map((f) => `<label class="serie-op" data-txt="${esc((f.Codigo_Formato + ' ' + f.Nombre).toUpperCase())}">
        <input type="radio" name="fx" value="${esc(f.Codigo_Formato)}" ${f.Codigo_Formato === actual ? 'checked' : ''} ${bloqueado && f.Codigo_Formato !== r.Formato ? 'disabled' : ''}>
        <span class="serie-nom">${esc(nombreFormato(f.Codigo_Formato))}</span><span class="badge b-off">${TIPO_FMT[f.Plantilla_Tipo] || ''}</span>
        <span class="serie-desc small muted mono">${esc(f.Codigo_Formato)}</span></label>`).join('')}</div>
      ${bloqueado ? '<span class="small muted">El código ya está validado con este formato.</span>' : ''}`,
    pie: '<button class="btn" data-cerrar>Cancelar</button><span id="fx-btns" class="btn-row"></span>',
  });
  const btns = () => {
    const sel = m.el.querySelector('input[name="fx"]:checked');
    const f = sel && lista.find((x) => x.Codigo_Formato === sel.value);
    $('#fx-btns', m.el).innerHTML = !f ? '<button class="btn btn-primary" disabled>Descargar</button>'
      : f.Plantilla_Tipo === 'doc'
        ? `<button class="btn" data-sal="original">${ico('bajar')}Word</button><button class="btn btn-primary" data-sal="pdf">${ico('bajar')}PDF</button>`
        : `<button class="btn btn-primary" data-sal="original">${ico('bajar')}Descargar ${TIPO_FMT[f.Plantilla_Tipo]}</button>`;
    m.el.querySelectorAll('[data-sal]').forEach((b) => {
      b.onclick = async () => {
        if (f.Plantilla_Tipo === 'xlsx') { await descargarXlsx({ ...r, Formato: f.Codigo_Formato }); }
        else {
          const res = await tarea(() => api('archivos.descargarFormato', { codigo: r.Codigo_Completo, formato: f.Codigo_Formato, salida: b.dataset.sal }), 'Preparando formato…');
          if (!res) return;
          descargarBlob(base64ABlob(res.base64, res.mime), res.nombre);
        }
        if (!bloqueado) r.Formato = f.Codigo_Formato;
        m.cerrar();
        alTerminar();
      };
    });
  };
  m.el.querySelectorAll('input[name="fx"]').forEach((i) => { i.onchange = btns; });
  const q = $('#fx-buscar', m.el);
  if (q) q.oninput = () => { const t = q.value.trim().toUpperCase(); m.el.querySelectorAll('.serie-op').forEach((o) => { o.hidden = !!t && !o.dataset.txt.includes(t); }); };
  btns();
}
