// Protocolo como formulario por pasos: 1 Datos · 2 Lista de control · 3 Cierre. Sale el Excel aprobado ya lleno (sin firmas).
import { api } from '../api.js';
import { S, upsertRegistros, puede, soyYo } from '../state.js';
import { $, esc, ico, modal, toast, tarea, opciones, base64ABlob, descargarBlob, serieDe, codigoVisual, pedirTexto, periodoDe, etiquetaPeriodo } from '../util.js';
import { refrescarVista } from '../app.js';
import { vistaPrevia, descargarPDF, enviarPDF, descargarXlsx } from './imprimir.js';
import { leerFoto, capturarFoto, borrarFoto } from './fotos.js';

const estructuras = {};
const activo = (x) => String(x.Activo).toUpperCase() === 'TRUE';
const cat = (tipo) => S.catalogos.filter((c) => c.Tipo === tipo && activo(c));

/** "PSR2-F2-CPC-CAL-EMD-FOR-0001" → "EMD-FOR-0001" (con el tramo: hay FOR-0001 en EMD, GLB y PTS) */
export const numFormato = (cod) => String(cod).split('-').slice(-3).join('-');
const tramoDe = (cod) => String(cod).split('-').slice(-3)[0];
/** "EMD-FOR-0001 · REPARACIÓN DE JUNTAS DE WATERSTOP" (el título sale del propio Excel) */
export const nombreFormato = (cod) => {
  const f = S.formatos.find((x) => x.Codigo_Formato === cod);
  return numFormato(cod) + (f && f.Nombre ? ' · ' + f.Nombre : '');
};
const az = (a, b) => String(a).localeCompare(String(b), 'es', { numeric: true });
const norm = (t) => String(t || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
export const tieneFormulario = (cod) => S.formatos.some((f) => f.Codigo_Formato === cod && f.Plantilla_Tipo === 'xlsx' && activo(f));

/** Estructura del formulario de un formato (cacheada). */
export async function estructuraDe(formato) {
  if (!estructuras[formato]) estructuras[formato] = await api('formularios.estructura', { formato });
  return estructuras[formato];
}

/**
 * Opciones de protocolo agrupadas: primero los del tramo del código y los generales (GLB), en orden;
 * los de otros tramos van aparte, al final. filtro: busca por número o título.
 */
export function opcionesFormato(lista, tramo, sel, filtro) {
  const q = norm(filtro);
  const vis = lista.filter((f) => !q || norm(`${numFormato(f.Codigo_Formato)} ${f.Nombre}`).includes(q))
    .sort((a, b) => az(numFormato(a.Codigo_Formato), numFormato(b.Codigo_Formato)));
  const op = (f) => `<option value="${esc(f.Codigo_Formato)}" ${f.Codigo_Formato === sel ? 'selected' : ''}>${esc(nombreFormato(f.Codigo_Formato))}</option>`;
  if (!tramo) return vis.map(op).join('');
  const propios = vis.filter((f) => [tramo, 'GLB'].includes(tramoDe(f.Codigo_Formato)));
  const otros = vis.filter((f) => !propios.includes(f));
  return (propios.length ? `<optgroup label="Tramo ${esc(tramo)}${tramo !== 'GLB' ? ' y generales (GLB)' : ''}">${propios.map(op).join('')}</optgroup>` : '') +
    (otros.length ? `<optgroup label="Otros tramos">${otros.map(op).join('')}</optgroup>` : '');
}

/** Buscador (por número o título) sobre un select de protocolos. vacio: texto de la primera opción. */
export function enlazarBuscadorFormato(inp, sel, lista, tramo, vacio) {
  const pintar = () => {
    const v = sel.value;
    sel.innerHTML = `<option value="">${esc(vacio)}</option>` + opcionesFormato(lista, tramo(), v, inp ? inp.value : '');
    sel.value = [...sel.options].some((o) => o.value === v) ? v : '';
  };
  // Al buscar, queda elegido el primer resultado (se puede cambiar en la lista)
  if (inp) inp.oninput = () => { sel.value = ''; pintar(); if (inp.value.trim()) { const p = sel.querySelector('option:not([value=""])'); if (p) sel.value = p.value; } sel.dispatchEvent(new Event('change')); };
  pintar();
  return pintar;
}

// tipo 'lista:<Catálogo>' = se elige de la lista (con opción de agregar una nueva); 'texto' = se escribe
const CAMPOS = {
  cliente: ['Cliente', 'texto'], partida: ['Actividad / partida', 'lista:Partida'], descripcion: ['Descripción / estructura', 'texto'],
  especialidad: ['Especialidad', 'lista:Disciplina'], ubicacion: ['Ubicación', 'lista:Ubicacion'], localizacion: ['Localización', 'lista:Localizacion'],
  capa: ['Capa', 'texto'], documentos: ['Documentos de referencia / plano', 'texto'],
};
const NUEVO = '__nuevo__';
let codigosTopo = null;
let codigosCPC = null;

/** PK "1+159.50" <-> { km: '1', m: '159.50' } */
const partirPK = (v) => {
  const x = /^\s*(\d{1,3})\s*\+\s*(\d{1,3}(?:[.,]\d{1,3})?)\s*$/.exec(String(v || ''));
  return x ? { km: x[1], m: x[2].replace(',', '.') } : { km: '', m: '' };
};
const unirPK = (km, m) => {
  if (km === '' && m === '') return '';
  const mm = Number(String(m || '0').replace(',', '.'));
  return `${Number(km || 0)}+${(isFinite(mm) ? mm : 0).toFixed(2).padStart(6, '0')}`;
};
const AUTO = { fase: 'Fase', fecha: 'Fecha', codigo: 'Correlativo N°' };

export async function abrirFormulario(codigo, formatoElegido) {
  const r = S.registros.find((x) => x.Codigo_Completo === codigo);
  if (!r) { toast('Código no encontrado. Actualiza los datos.', 'err'); return; }
  const formato = formatoElegido || r.Formato;
  if (!formato || !tieneFormulario(formato)) { elegirProtocolo(r); return; }
  const est = estructuras[formato] || await tarea(() => estructuraDe(formato), 'Abriendo protocolo…');
  if (!est) return;
  if (!codigosTopo) codigosTopo = await api('registros.codigosTopografia', {}).catch(() => []);
  if (!r.Correlativo_CPC) codigosCPC = await api('registros.codigosCPC', {}).catch(() => []);
  pintar(r, est, formato);
}

function elegirProtocolo(r) {
  const lista = S.formatos.filter((f) => f.Plantilla_Tipo === 'xlsx' && activo(f));
  if (!lista.length) { toast('Aún no hay protocolos cargados en la app.', 'err'); return; }
  const tramo = (serieDe(r.Serie) || {}).Tramo || '';
  const m = modal({
    titulo: 'Elegir protocolo',
    cuerpo: `<span class="small muted">Para <b class="mono">${esc(r.Codigo_Completo)}</b>${tramo ? ` · primero los del tramo <b>${esc(tramo)}</b> y los generales (GLB)` : ''}</span>
      <div class="field" style="margin-top:10px"><label>Protocolo</label>
        <input id="ep-q" type="search" placeholder="Buscar por número o nombre (p. ej. concreto)" autocomplete="off">
        <select id="ep"></select></div>`,
    pie: '<button class="btn" data-cerrar>Cancelar</button><button class="btn btn-primary" id="ep-ok">Continuar</button>',
  });
  enlazarBuscadorFormato($('#ep-q', m.el), $('#ep', m.el), lista, () => tramo, 'Elige…');
  $('#ep-ok', m.el).onclick = () => {
    const sel = $('#ep', m.el);
    if (!sel.value) { toast('Elige un protocolo', 'err'); return; }
    m.cerrar();
    abrirFormulario(r.Codigo_Completo, sel.value);
  };
}

function pintar(r, est, formato) {
  const serie = serieDe(r.Serie) || {};
  let previo = {};
  try { previo = r.Datos_Formulario ? JSON.parse(r.Datos_Formulario) : {}; } catch (e) { previo = {}; }
  const pc = previo.campos || {};
  const disc = cat('Disciplina').find((d) => d.Codigo === serie.Especialidad);
  const campos = {
    fase: pc.fase || serie.Fase || 'F2',
    cliente: pc.cliente ?? S.config.Cliente ?? '', partida: pc.partida ?? r.Actividad ?? '', descripcion: pc.descripcion ?? '',
    especialidad: pc.especialidad ?? (disc ? disc.Descripcion : ''), ubicacion: pc.ubicacion ?? r.Ubicacion ?? '', localizacion: pc.localizacion ?? '',
    pk_inicial: pc.pk_inicial ?? r.PK_Inicial ?? '', pk_final: pc.pk_final ?? r.PK_Final ?? '', capa: pc.capa ?? '', documentos: pc.documentos ?? '',
    protocolo_topo: pc.protocolo_topo ?? r.Protocolo_Topografico ?? '',
  };
  // Datos propios del formato (p. ej. recepción de materiales: descripción, guía, proveedor…)
  const extras = est.extras || [];
  extras.forEach((x) => { campos[x.clave] = pc[x.clave] ?? ''; });
  // Opciones por ítem según el formato: SI/NO/N/A · Conforme/No conforme/N/A · N/M/I/S
  const OPC = est.opciones && est.opciones.length ? est.opciones
    : [{ v: 'SI', e: 'SI' }, { v: 'NO', e: 'NO' }, ...(est.columnas.na ? [{ v: 'NA', e: 'N/A' }] : [])];
  const frase = (t) => (t && t === t.toUpperCase() ? t.charAt(0) + t.slice(1).toLowerCase() : t);
  const ETQ = { reg: frase(est.etiquetas?.reg) || 'Registro asociado', res: frase(est.etiquetas?.res) || 'Resultado', obs: frase(est.etiquetas?.obs) || 'Observación' };
  // Celdas que se llenan dentro de su texto (medidas A-B-C-D, conclusiones, SÍ [ ] NO [ ])
  const enCelda = est.enCelda || [];
  const celdas = JSON.parse(JSON.stringify(previo.celdas || {}));
  // Planos: casi todos empiezan igual (PSR2-F2-CPC-…); se precarga ese tramo y el usuario completa el resto
  const prefPlano = `${S.proyecto}-${campos.fase}-${S.config.Empresa}-`;
  if (!campos.documentos) campos.documentos = prefPlano;
  const items = JSON.parse(JSON.stringify(previo.items || {}));
  let comentarios = previo.comentarios || '';
  const cpc = { acronimo: '', elemento: '', reparacion: false, original: '' };
  let fechaProto = previo.fecha || new Date().toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const puedeFecha = soyYo(r.Usuario) || puede('administrar');
  // Valorización: automática por la fecha del protocolo (26→25 = mes siguiente); editable si corresponde otro mes
  const di = +S.config.Dia_Inicio_Ciclo || 26;
  const valAuto = () => periodoDe(aIso(fechaProto) || r.Fecha_Creacion, di);
  let valManual = false, valorizacion = ''; // se fija abajo, cuando existen aIso/aDmy
  let conforme = false;
  const aIso = (dmy) => { const x = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dmy || ''); return x ? `${x[3]}-${x[2]}-${x[1]}` : ''; };
  const aDmy = (iso) => { const x = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); return x ? `${x[3]}/${x[2]}/${x[1]}` : ''; };
  valManual = !!(r.Valorizacion && r.Valorizacion !== periodoDe(aIso(previo.fecha || '') || r.Fecha_Creacion, di));
  valorizacion = valManual ? r.Valorizacion : '';
  const fmt = S.formatos.find((f) => f.Codigo_Formato === formato) || { Nombre: est.formato.Nombre };
  let paso = 1;
  let listo = false; // tras "Guardar registro": queda en pantalla con vista previa / PDF / enviar / editar
  let solo = null;

  const m = modal({
    grande: true, fijo: true,
    titulo: esc(nombreFormato(formato)),
    cuerpo: `<div class="pasos" id="f-pasos"></div><div id="f-cuerpo"></div>`,
    pie: '<button class="btn" id="f-atras">Atrás</button><span class="small muted" id="f-prog"></span><button class="btn btn-primary" id="f-sig">Siguiente</button>',
  });
  const el = m.el;

  // ---- paso 1: datos
  const sugerirCPC = () => {
    const p = cat('Partida').find((x) => x.Descripcion === campos.partida);
    if (!p || !p.Relacion) return;
    const [a, e] = p.Relacion.split('-');
    cpc.acronimo = a || ''; cpc.elemento = e || '';
  };
  if (!r.Correlativo_CPC) sugerirCPC();

  const campoHtml = (k) => {
    const [l, tipo] = CAMPOS[k];
    const v = campos[k];
    if (tipo.startsWith('lista:')) {
      const lista = [...new Set(cat(tipo.slice(6)).map((x) => x.Descripcion))].sort(az);
      if (v && !lista.includes(v)) lista.unshift(v);
      const ancho = ['partida', 'localizacion', 'ubicacion'].includes(k) ? 'span-all' : '';
      return `<div class="field ${ancho}"><label>${l}</label><select data-c="${k}" data-lista="${tipo.slice(6)}">${opciones(lista, v, { vacio: 'Elige…' })}
        <option value="${NUEVO}">＋ Agregar nueva opción…</option></select></div>`;
    }
    const ancho = ['descripcion', 'documentos'].includes(k) ? 'span-all' : '';
    return `<div class="field ${ancho}"><label>${l}</label><input data-c="${k}" value="${esc(v)}" maxlength="300"></div>`;
  };
  const cpcHtml = () => {
    if (r.Correlativo_CPC) return `<div class="field"><label>CPC</label><input value="${esc(r.Correlativo_CPC)}" readonly class="mono"></div>`;
    const grupoAcr = (log) => cat('Acronimo').filter((x) => (String(x.Relacion).toUpperCase() === 'LOG') === log).sort((a, b) => az(a.Codigo, b.Codigo))
      .map((x) => [x.Codigo, `${x.Codigo} · ${x.Descripcion}`]);
    const acrSel = (sel, vacio) => `<option value="">${vacio}</option><optgroup label="Acrónimos CPC">${opciones(grupoAcr(false), sel)}</optgroup>
      <optgroup label="Usados en el LOG (lista aparte)">${opciones(grupoAcr(true), sel)}</optgroup>`;
    const pref = [cpc.acronimo, cpc.elemento, campos.fase].filter(Boolean).join('-');
    return `<div class="seccion span-all"><h3 style="margin:0">Correlativo CPC</h3>
      <div class="form-grid">
        <label class="chk span-all"><input type="checkbox" id="cpc-rep" ${cpc.reparacion ? 'checked' : ''}> Es una reparación de un protocolo anterior</label>
        ${cpc.reparacion
          ? `<div class="field span-all"><label>CPC original a reparar</label><select id="cpc-o">${opciones((codigosCPC || []).filter((c) => !/A$/.test(c)).sort(az), cpc.original, { vacio: 'Elige…' })}</select>
              <span class="hint">Conserva los acrónimos y el número del original, con sufijo A.</span></div>`
          : `<div class="field"><label>Acrónimo 1</label><select id="cpc-a">${acrSel(cpc.acronimo, 'Elige…')}</select></div>
             <div class="field"><label>Acrónimo 2 (opcional)</label><select id="cpc-e">${acrSel(cpc.elemento, '— Ninguno —')}</select></div>`}
      </div>
      <span class="small">Quedará: <b class="mono">${cpc.reparacion ? (cpc.original ? esc(cpc.original.toUpperCase()) + 'A' : '—') : (cpc.acronimo ? esc(pref) + '-####' : '—')}</b>
        <span class="muted">· ${cpc.reparacion ? 'reparación del original' : 'el número lo asigna la app al guardar, en orden y sin repetir'}.</span></span></div>`;
  };
  // Protocolo topográfico: PSR2-<FASE>-CPC- fijo (según la fase elegida) + serie TOP + N°
  const prefFase = () => `${S.proyecto}-${campos.fase}-${S.config.Empresa}-`;
  const topo = { serie: '', num: '' };
  const partirTopo = () => {
    const v = campos.protocolo_topo || '', p = prefFase();
    if (v.startsWith(p)) { const resto = v.slice(p.length).split('-'); topo.num = resto.pop(); topo.serie = resto.join('-'); } else { topo.serie = ''; topo.num = ''; }
  };
  partirTopo();
  const topoHtml = () => {
    const p = prefFase();
    const deFase = (codigosTopo || []).filter((c) => c.startsWith(p)).map((c) => c.slice(p.length));
    const series = [...new Set(deFase.map((c) => c.split('-').slice(0, -1).join('-')))].sort(az);
    const nums = topo.serie ? deFase.filter((c) => c.startsWith(topo.serie + '-')).map((c) => c.split('-').pop()).sort(az) : [];
    const ajeno = campos.protocolo_topo && campos.protocolo_topo !== 'NA' && !campos.protocolo_topo.startsWith(p);
    return `<div class="topo"><span class="mono topo-pref">${esc(p)}</span>
        <select id="topo-s">${opciones([['NA', 'N/A (no aplica)'], ...series.map((s) => [s, s])], campos.protocolo_topo === 'NA' ? 'NA' : topo.serie, { vacio: '— Ninguno —' })}</select>
        ${topo.serie && topo.serie !== 'NA' ? `<span>-</span><select id="topo-n">${opciones(nums, topo.num, { vacio: 'N°…' })}</select>` : ''}</div>
      ${ajeno ? `<div class="small muted">Guardado: <span class="mono">${esc(campos.protocolo_topo)}</span> (otra fase)</div>` : ''}`;
  };
  const pkHtml = () => {
    if (campos.pk_inicial === 'N/A') {
      return `<div class="field span-all"><label>Progresiva</label><div class="btn-row" style="align-items:center"><b>N/A</b>
        <button class="btn btn-sm" id="pk-si" type="button">Escribir progresiva</button></div></div>`;
    }
    const caja = (k, l) => {
      const x = partirPK(campos[k]);
      return `<div class="field"><label>${l}</label><div class="pk">
        <input data-pk="${k}" data-parte="km" type="number" inputmode="numeric" min="0" max="999" value="${esc(x.km)}" placeholder="0">
        <span>+</span><input data-pk="${k}" data-parte="m" type="number" inputmode="decimal" min="0" max="999.99" step="0.01" value="${esc(x.m)}" placeholder="000.00"></div></div>`;
    };
    return `${caja('pk_inicial', 'PK inicial')}${caja('pk_final', 'PK final')}
      <div class="span-all"><button class="btn btn-sm" id="pk-na" type="button">Progresiva N/A</button></div>`;
  };
  const paso1 = () => {
    const visibles = est.campos.filter((k) => CAMPOS[k]);
    return `<div class="seccion" style="margin-top:0">${codigoVisual(r.Codigo_Completo, { chico: true })}
        <div class="small muted">Correlativo N°: <b>${esc(r.Codigo_Completo)}</b> — lo pone la app.</div></div>
      ${est.campos.includes('fase') ? `<div class="field"><label>Fase</label><select data-c="fase">${opciones(cat('Fase').sort((a, b) => az(a.Codigo, b.Codigo)).map((x) => [x.Codigo, `${x.Codigo} · ${x.Descripcion}`]), campos.fase)}</select></div>` : ''}
      ${est.campos.includes('fecha') ? `<div class="field"><label>Fecha del protocolo</label>
        <input type="date" id="f-fecha" value="${esc(aIso(fechaProto))}" ${puedeFecha ? '' : 'disabled'}>
        <span class="hint">${puedeFecha ? 'La pone la app; solo quien creó el código o un administrador la cambia.' : 'Solo quien creó el código o un administrador la cambia.'}</span></div>` : ''}
      <div class="field"><label>Valorización</label>
        <input type="month" id="f-val" value="${esc(valManual ? valorizacion : valAuto())}" ${puedeFecha ? '' : 'disabled'}>
        <span class="hint">${valManual ? '<b>Editada a mano.</b> <a href="#" id="f-val-auto">Volver a automática</a>' : `Automática: ${esc(etiquetaPeriodo(valAuto(), di, +S.config.Dia_Fin_Ciclo || 25))}`}</span></div>
      <div class="form-grid">${visibles.map(campoHtml).join('')}
        ${est.campos.includes('progresiva') ? pkHtml() : ''}
        ${est.campos.includes('cpc') ? cpcHtml() : ''}
        <div class="field span-all"><label>Protocolo topográfico <span class="muted">(opcional · va al LOG, no sale en el ${esc(numFormato(formato))})</span></label>
          ${topoHtml()}
          <span class="hint">Empieza igual (<span class="mono">${esc(prefFase())}</span>); eliges la serie de Topografía y el N°. Solo códigos de la fase ${esc(campos.fase)} ya cargados en la app.</span></div></div>
      ${extras.length ? `<div class="seccion"><h3 style="margin:0">Datos del ${esc(numFormato(formato))}</h3><div class="form-grid">
        ${extras.map((x) => `<div class="field"><label>${esc(x.etiqueta)}</label><input data-c="${esc(x.clave)}" value="${esc(campos[x.clave])}" maxlength="300"></div>`).join('')}
        </div></div>` : ''}`;
  };

  // Campos dentro del texto de una celda: un cuadro por hueco ("A:", "Promedio = ____") y casillas (SÍ [ ] NO [ ])
  const celdaHtml = (c) => {
    const x = celdas[c.celda] || {};
    return `<div class="celda-f">${c.casillas.length ? `<span class="small">${esc(c.etiqueta)}</span>` : ''}
      ${c.huecos.map((h, j) => `<label class="celda-h${h.length > 18 ? ' largo' : ''}"><span>${esc(h)}</span><input data-cel="${esc(c.celda)}" data-h="${j}" value="${esc((x.h || [])[j] || '')}" maxlength="150"></label>`).join('')}
      ${c.casillas.length ? `<div class="segs">${c.casillas.map((t, j) => `<button type="button" class="seg ${x.x !== undefined && x.x !== '' && +x.x === j ? 'on' : ''}" data-celx="${esc(c.celda)}" data-j="${j}">${esc(t)}</button>`).join('')}</div>` : ''}</div>`;
  };
  // Los de una misma fila del formato van juntos (p. ej. A · B · C · D)
  const porFilas = (l) => [...new Set(l.map((c) => c.fila))].map((f) => `<div class="celdas-fila">${l.filter((c) => c.fila === f).map(celdaHtml).join('')}</div>`).join('');
  const celdasDe = (n) => { const l = enCelda.filter((c) => c.item === n); return l.length ? `<div class="celdas">${porFilas(l)}</div>` : ''; };

  // Reporte fotográfico: la foto queda en el teléfono del usuario (no en la app) y se usa al imprimir
  const fotoHtml = () => `<div class="seccion"><h3 style="margin:0">Reporte fotográfico</h3><div id="foto-zona" class="foto-zona"><span class="small muted">Buscando foto en este equipo…</span></div>
    <span class="hint">La foto se guarda en tu teléfono, no en la app, y sale en el recuadro del formato al imprimir desde este equipo.
      Si imprimes desde otro equipo, la hoja sale con el recuadro vacío para adjuntar la foto después.</span></div>`;
  const pintarFoto = async () => {
    const z = $('#foto-zona', el);
    if (!z) return;
    const f = await leerFoto(r.Codigo_Completo);
    if (!$('#foto-zona', el)) return;
    if (z.dataset.url) URL.revokeObjectURL(z.dataset.url);
    const url = f ? URL.createObjectURL(f.blob) : '';
    z.dataset.url = url;
    z.innerHTML = `${f ? `<img src="${url}" alt="Foto del protocolo" class="foto-min">` : '<span class="small muted">Sin foto en este equipo.</span>'}
      <div class="btn-row"><button class="btn btn-sm btn-primary" type="button" data-foto="camara">${f ? 'Tomar otra foto' : 'Tomar foto'}</button>
        <button class="btn btn-sm" type="button" data-foto="galeria">Elegir de la galería</button>
        ${f ? '<button class="btn btn-sm btn-danger" type="button" data-foto="quitar">Quitar</button>' : ''}</div>`;
    z.querySelectorAll('[data-foto]').forEach((b) => {
      b.onclick = async () => {
        if (b.dataset.foto === 'quitar') await borrarFoto(r.Codigo_Completo);
        else await capturarFoto(r.Codigo_Completo, { camara: b.dataset.foto === 'camara' });
        pintarFoto();
      };
    });
  };

  // ---- paso 2: lista de control
  const porCol = est.modo === 'columnas';
  const marcados = () => est.items.filter((i) => items[i.n]?.v || Object.values(items[i.n]?.c || {}).some((t) => t)).length;
  // Tabla por columnas (PTS-0018: Apoyo 1…4): un cuadro por columna; las secciones del formato como títulos
  const itemColumnas = (i, x, nuevaSeccion) => `${nuevaSeccion ? `<h3 class="sec-items">${esc(i.grupo)}</h3>` : ''}
    <div class="item"><div class="item-head"><span class="item-n">${esc(i.n)}</span><span class="item-d">${esc(i.descripcion)}</span></div>
      <div class="item-cols">${est.valores.map((c) => `<label class="celda-h"><span>${esc(c.etiqueta)}</span>
        <input data-ic="${esc(i.n)}" data-col="${esc(c.col)}" value="${esc((x.c || {})[c.col] || '')}" maxlength="100" ${(i.barras || []).includes(c.col) ? 'placeholder="x / y"' : ''}></label>`).join('')}</div>
      ${est.columnas.obs ? `<input data-io="${esc(i.n)}" value="${esc(x.obs)}" placeholder="${esc(ETQ.obs)}" maxlength="200">` : ''}</div>`;
  const paso2 = () => `<div class="btn-row" style="justify-content:space-between;align-items:center">
      <span class="small"><b>${marcados()}</b> de ${est.items.length} ${porCol ? 'llenados' : 'verificados'}</span>
      ${porCol ? '' : `<button class="btn btn-sm" id="todo-si" type="button">Marcar todo ${esc(OPC[0].e)}</button>`}</div>
    ${OPC.some((o) => o.d) ? `<div class="small muted">${OPC.map((o) => `<b>${esc(o.e)}</b> = ${esc(o.d)}`).join(' · ')}</div>` : ''}
    <div class="items">${est.items.map((i, k) => {
      const x = items[i.n] || {};
      if (porCol) return itemColumnas(i, x, i.grupo && i.grupo !== (est.items[k - 1] || {}).grupo);
      const b = (o) => `<button type="button" class="seg ${x.v === o.v ? 'on on-' + o.v : ''}" data-i="${esc(i.n)}" data-v="${esc(o.v)}" ${o.d ? `title="${esc(o.d)}"` : ''}>${esc(o.e)}</button>`;
      return `<div class="item"><div class="item-head"><span class="item-n">${esc(i.n)}</span><span class="item-d">${esc(i.descripcion)}</span>
          ${i.pc ? `<span class="badge b-off" title="Punto de control">${esc(i.pc)}</span>` : ''}</div>
        <div class="item-ctl"><div class="segs">${OPC.map(b).join('')}</div>
          ${est.columnas.reg ? `<input data-ir="${esc(i.n)}" value="${esc(x.reg)}" placeholder="${esc(ETQ.reg)}" maxlength="200">` : ''}
          ${est.columnas.res ? `<input data-is="${esc(i.n)}" value="${esc(x.res)}" placeholder="${esc(ETQ.res)}" maxlength="200">` : ''}
          ${est.columnas.obs ? `<input data-io="${esc(i.n)}" value="${esc(x.obs)}" placeholder="${esc(ETQ.obs)}" maxlength="200">` : ''}</div>
        ${celdasDe(i.n)}</div>`;
    }).join('')}</div>
    ${est.foto ? fotoHtml() : ''}`;

  // ---- paso 3: cierre
  const cierreCeldas = enCelda.filter((c) => !c.item);
  const paso3 = () => `${cierreCeldas.length ? `<div class="seccion"><h3 style="margin:0">Cierre del ${esc(numFormato(formato))}</h3><div class="celdas">${porFilas(cierreCeldas)}</div></div>` : ''}
    ${est.comentarios ? `<div class="field"><label>Comentarios</label><textarea id="f-com" maxlength="1500" rows="4">${esc(comentarios)}</textarea></div>` : ''}
    <div class="seccion"><h3 style="margin:0">Resumen</h3>
      <div class="small">${esc(campos.partida || 'Sin partida')} · ${esc(campos.ubicacion || 'sin ubicación')} · ${marcados()}/${est.items.length} ítems verificados</div>
      ${marcados() < est.items.length ? '<div class="aviso aviso-warn">Hay ítems sin marcar. Puedes guardar igual y completarlos después.</div>' : ''}
      ${previo.conforme ? `<div class="aviso aviso-ok">Conforme dado por <b>${esc(previo.conforme.por)}</b>.</div>` : ''}
      <label class="chk conforme"><input type="checkbox" id="f-conf" ${conforme ? 'checked' : ''}> <b>Conforme:</b> revisé y llené este protocolo; los datos son correctos.</label>
      <span class="small muted">Se guardan solo los datos (no se guarda ninguna hoja). Cuando alguien necesite imprimir el ${esc(numFormato(formato))},
        la app arma la hoja con estos datos al momento: botón <b>Descargar / Enviar</b> del código. Las firmas van a mano sobre el impreso.</span></div>`;

  // ---- guardado: queda en la misma pantalla para ver, imprimir o enviar el protocolo
  const pasoListo = () => `<div class="aviso aviso-ok"><b>Registro guardado (Conforme).</b> ${r.Correlativo_CPC ? `CPC <b class="mono">${esc(r.Correlativo_CPC)}</b>` : ''}</div>
    <div class="seccion">${codigoVisual(r.Codigo_Completo, { chico: true })}
      <span class="small muted">La hoja se arma ahora con los datos guardados (no se guarda ningún archivo). Las firmas van a mano sobre el impreso.</span>
      <div class="listo-acc">
        <button class="btn btn-primary" id="l-vista" type="button">${ico('ojo')}Vista previa</button>
        <button class="btn" id="l-pdf" type="button">${ico('bajar')}Descargar PDF (imprimir)</button>
        <button class="btn" id="l-enviar" type="button">Enviar (WhatsApp / correo)</button>
        <button class="btn" id="l-xlsx" type="button">${ico('bajar')}Descargar Excel (xlsx)</button>
      </div>
      <span class="small muted">¿Olvidaste algo? <b>Editar</b> vuelve al paso 1 y luego guardas otra vez.</span></div>`;

  const leer = () => {
    el.querySelectorAll('[data-c]').forEach((i) => { if (i.value !== NUEVO) campos[i.dataset.c] = i.value.trim(); });
    ['pk_inicial', 'pk_final'].forEach((k) => {
      const km = el.querySelector(`[data-pk="${k}"][data-parte="km"]`), mm = el.querySelector(`[data-pk="${k}"][data-parte="m"]`);
      if (km && mm) campos[k] = unirPK(km.value.trim(), mm.value.trim());
    });
    el.querySelectorAll('[data-ir]').forEach((i) => { (items[i.dataset.ir] = items[i.dataset.ir] || {}).reg = i.value.trim(); });
    el.querySelectorAll('[data-is]').forEach((i) => { (items[i.dataset.is] = items[i.dataset.is] || {}).res = i.value.trim(); });
    el.querySelectorAll('[data-io]').forEach((i) => { (items[i.dataset.io] = items[i.dataset.io] || {}).obs = i.value.trim(); });
    el.querySelectorAll('[data-ic]').forEach((i) => { const it = (items[i.dataset.ic] = items[i.dataset.ic] || {}); (it.c = it.c || {})[i.dataset.col] = i.value.trim(); });
    el.querySelectorAll('[data-cel]').forEach((i) => {
      const c = (celdas[i.dataset.cel] = celdas[i.dataset.cel] || {});
      (c.h = c.h || [])[+i.dataset.h] = i.value.trim();
    });
    if ($('#f-com', el)) comentarios = $('#f-com', el).value.trim();
    if ($('#cpc-rep', el)) cpc.reparacion = $('#cpc-rep', el).checked;
    if ($('#cpc-a', el)) { cpc.acronimo = $('#cpc-a', el).value; cpc.elemento = $('#cpc-e', el).value; }
    if ($('#cpc-o', el)) cpc.original = $('#cpc-o', el).value.trim();
    const autoPrev = valAuto(); // la automática que se mostraba (antes de un posible cambio de fecha)
    if ($('#f-fecha', el) && $('#f-fecha', el).value) fechaProto = aDmy($('#f-fecha', el).value);
    const fvv = $('#f-val', el) && $('#f-val', el).value;
    if (fvv && fvv !== (valManual ? valorizacion : autoPrev)) { valManual = true; valorizacion = fvv; }
    if ($('#f-conf', el)) conforme = $('#f-conf', el).checked;
    const ts = $('#topo-s', el);
    if (ts) {
      topo.serie = ts.value; topo.num = $('#topo-n', el) ? $('#topo-n', el).value : '';
      if (ts.value === 'NA') campos.protocolo_topo = 'NA';
      else if (ts.value && topo.num) campos.protocolo_topo = prefFase() + ts.value + '-' + topo.num;
      else campos.protocolo_topo = '';
    }
  };

  const render = () => {
    $('#f-pasos', el).innerHTML = ['Datos', 'Lista de control', 'Cierre'].map((t, k) =>
      `<button type="button" class="paso ${paso === k + 1 ? 'on' : ''}" data-paso="${k + 1}"><span>${k + 1}</span>${t}</button>`).join('');
    // Conserva la posición al marcar/elegir; solo sube al cambiar de paso
    const y = el.scrollTop, mismoPaso = render.paso === paso;
    render.paso = paso;
    $('#f-cuerpo', el).innerHTML = listo ? pasoListo() : paso === 1 ? paso1() : paso === 2 ? paso2() : paso3();
    $('#f-atras', el).hidden = paso === 1 && !listo;
    $('#f-atras', el).textContent = listo ? 'Editar' : 'Atrás';
    $('#f-prog', el).textContent = listo ? 'Guardado' : `Paso ${paso} de 3`;
    $('#f-sig', el).innerHTML = listo ? 'Cerrar' : paso < 3 ? 'Siguiente' : 'Guardar registro';
    if (solo) solo.hidden = paso === 3 || listo;
    if (listo) {
      $('#f-sig', el).disabled = false;
      const editar = () => { listo = false; paso = 1; render(); };
      $('#l-vista', el).onclick = () => vistaPrevia(r, { onEditar: editar });
      $('#l-pdf', el).onclick = () => descargarPDF(r);
      $('#l-enviar', el).onclick = () => enviarPDF(r);
      $('#l-xlsx', el).onclick = () => descargarXlsx(r);
      el.querySelectorAll('[data-paso]').forEach((b) => { b.onclick = () => { listo = false; paso = +b.dataset.paso; render(); }; });
      el.scrollTop = 0;
      return;
    }
    el.scrollTop = mismoPaso ? y : 0;
    // eventos del paso
    el.querySelectorAll('[data-paso]').forEach((b) => { b.onclick = () => { leer(); paso = +b.dataset.paso; render(); }; });
    el.querySelectorAll('select[data-lista]').forEach((sel) => {
      sel.onchange = async () => {
        if (sel.value === NUEVO) {
          const txt = await pedirTexto({ titulo: 'Agregar opción', etiqueta: CAMPOS[sel.dataset.c][0], ayuda: 'Quedará disponible en la lista para todos.', boton: 'Agregar' });
          if (!txt) { render(); return; }
          const nuevo = await tarea(() => api('catalogos.agregarLista', { Tipo: sel.dataset.lista, Descripcion: txt }), 'Agregando…');
          if (!nuevo) { render(); return; }
          if (!S.catalogos.some((c) => c.Tipo === nuevo.Tipo && c.Codigo === nuevo.Codigo)) S.catalogos.push(nuevo);
          leer(); campos[sel.dataset.c] = nuevo.Descripcion;
        } else leer();
        if (sel.dataset.c === 'partida' && !r.Correlativo_CPC) sugerirCPC();
        render();
      };
    });
    const pkSi = $('#pk-si', el); if (pkSi) pkSi.onclick = () => { campos.pk_inicial = ''; campos.pk_final = ''; render(); };
    const sf = el.querySelector('[data-c="fase"]'); if (sf) sf.onchange = () => { const ant = `${S.proyecto}-${campos.fase}-${S.config.Empresa}-`; leer(); if (campos.documentos === ant) campos.documentos = `${S.proyecto}-${campos.fase}-${S.config.Empresa}-`; if (campos.protocolo_topo.startsWith(ant)) campos.protocolo_topo = ''; partirTopo(); render(); };
    const tsel = $('#topo-s', el); if (tsel) tsel.onchange = () => { topo.num = ''; if ($('#topo-n', el)) $('#topo-n', el).value = ''; leer(); render(); };
    const tnum = $('#topo-n', el); if (tnum) tnum.onchange = () => { leer(); render(); };
    const ff = $('#f-fecha', el); if (ff) ff.onchange = () => { leer(); render(); };
    const fv = $('#f-val', el); if (fv) fv.onchange = () => { leer(); render(); };
    const fva = $('#f-val-auto', el); if (fva) fva.onclick = (e) => { e.preventDefault(); valManual = false; valorizacion = ''; render(); };
    ['#cpc-a', '#cpc-e', '#cpc-rep', '#cpc-o'].forEach((s) => { const x = $(s, el); if (x) x.onchange = () => { leer(); render(); }; });
    const fc = $('#f-conf', el); if (fc) fc.onchange = () => { conforme = fc.checked; $('#f-sig', el).disabled = !conforme; };
    if (paso === 3) $('#f-sig', el).disabled = !conforme;
    else $('#f-sig', el).disabled = false;
    const na = $('#pk-na', el); if (na) na.onclick = () => { leer(); campos.pk_inicial = 'N/A'; campos.pk_final = ''; render(); };
    el.querySelectorAll('.seg').forEach((b) => {
      b.onclick = () => { leer(); const it = (items[b.dataset.i] = items[b.dataset.i] || {}); it.v = it.v === b.dataset.v ? '' : b.dataset.v; render(); };
    });
    const ts = $('#todo-si', el); if (ts) ts.onclick = () => { leer(); est.items.forEach((i) => { (items[i.n] = items[i.n] || {}).v = items[i.n].v || OPC[0].v; }); render(); };
    el.querySelectorAll('[data-celx]').forEach((b) => {
      b.onclick = () => { leer(); const c = (celdas[b.dataset.celx] = celdas[b.dataset.celx] || {}); c.x = String(c.x) === b.dataset.j ? '' : b.dataset.j; render(); };
    });
    if (paso === 2 && est.foto) pintarFoto();
  };

  const guardar = async (descargar, final) => {
    leer();
    if (final && !conforme) { toast('Marca "Conforme" para guardar el registro', 'err'); return; }
    if (cpc.reparacion && !cpc.original) { toast('Elige el CPC original a reparar', 'err'); paso = 1; render(); return; }
    const cpcDatos = !est.campos.includes('cpc') || r.Correlativo_CPC ? null
      : cpc.reparacion ? { reparaDe: cpc.original } : cpc.acronimo ? { acronimo: cpc.acronimo, elemento: cpc.elemento } : null;
    const res = await tarea(async () => {
      const g = await api('formularios.guardar', {
        codigo: r.Codigo_Completo, formato, conforme: !!final,
        datos: { campos: { ...campos, documentos: campos.documentos === `${S.proyecto}-${campos.fase}-${S.config.Empresa}-` ? '' : campos.documentos }, items, celdas, comentarios, fecha: fechaProto,
          valorizacion: valManual ? valorizacion : valAuto() },
        cpc: cpcDatos,
      });
      const f = descargar ? await api('archivos.descargarFormato', { codigo: r.Codigo_Completo, formato }) : null;
      return { g, f };
    }, descargar ? 'Guardando y preparando el Excel…' : 'Guardando…');
    if (!res) return;
    const aviso = res.g.Aviso;
    delete res.g.Aviso;
    upsertRegistros(res.g);
    if (aviso) toast(aviso, 'err');
    if (res.f) descargarBlob(base64ABlob(res.f.base64, res.f.mime), res.f.nombre);
    toast((final ? 'Registro guardado (conforme)' : 'Avance guardado') + (res.g.Correlativo_CPC ? ` · CPC ${res.g.Correlativo_CPC}` : ''), 'ok');
    refrescarVista();
    if (final) { r = res.g; listo = true; render(); return; }
    m.cerrar();
  };

  $('#f-atras', el).onclick = () => { if (listo) { listo = false; paso = 1; render(); return; } leer(); paso = Math.max(1, paso - 1); render(); };
  $('#f-sig', el).onclick = () => { if (listo) { m.cerrar(); return; } leer(); if (paso < 3) { paso++; render(); } else guardar(false, true); };
  // Guardar avance (borrador) en los pasos 1 y 2
  const pie = el.querySelector('.modal-foot');
  solo = document.createElement('button');
  solo.className = 'btn'; solo.textContent = 'Guardar avance';
  solo.onclick = () => guardar(false, false);
  pie.insertBefore(solo, $('#f-sig', el));
  render();
}
