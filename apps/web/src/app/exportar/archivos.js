// Portado del MVP 3.8.9 (app.js) sin cambios de lógica — fase 1, salvo el JSON
// completo (divergencia D7 en docs/fase1-divergencias.md).
import { $, canvas } from '../dom.js';
import { normalizeFicha, state } from '../estado.js';
import { autoLayout } from '../layout/auto-layout.js';
import { render } from '../lienzo/render.js';
import { renderKpiLibrary } from '../paneles/kpis.js';
import { persist } from '../persistencia.js';
import { updateViewUi } from '../vistas/comparador.js';

// =================== EXPORT / IMPORT ===================
// D7: el MVP exportaba solo meta, ficha y la vista activa (nodes, edges). Ahora
// el JSON lleva lo mismo que una revisión de un proyecto (contenidoDe en
// plataforma/proyecto.js): las dos vistas, KPIs, RACI, SIPOC, la simulación y
// los carriles. Sigue sin schemaVersion (formato del MVP), así que lo leen igual
// el editor, «Nuevo proceso → JSON» del shell y la importación asistida.
function exportJson() {
  const data = {
    meta: state.meta, ficha: state.ficha, nodes: state.nodes, edges: state.edges,
    activeView: state.activeView,
    views: { ...state._views, [state.activeView]: { nodes: state.nodes, edges: state.edges } },
    raci: state._raci || null, sipoc: state._sipoc || null, simResults: state._simResults || null,
    kpiValues: state._kpiValues || null, lanes: state._lanes || null,
    exportedAt: new Date().toISOString()
  };
  download(JSON.stringify(data, null, 2), filename('json'), 'application/json');
}

/** JSON completo (D7): trae las dos vistas. Los del MVP no. */
const esJsonCompleto = (data) => !!data.views && typeof data.views === 'object' && !Array.isArray(data.views);

/** Siguiente id libre mirando nodos, aristas y pains de las dos vistas (los ids son letra + número). */
function siguienteIdDeTodo() {
  let max = 0;
  const ver = (o) => { const m = /(\d+)$/.exec(String(o && o.id != null ? o.id : '')); if (m) max = Math.max(max, Number(m[1])); };
  const vista = (v) => {
    if (!v) return;
    (v.nodes || []).forEach((n) => { ver(n); (Array.isArray(n && n.pains) ? n.pains : []).forEach(ver); });
    (v.edges || []).forEach(ver);
  };
  vista({ nodes: state.nodes, edges: state.edges });
  Object.values(state._views || {}).forEach(vista);
  return max + 1;
}

function importJson(e) {
  const f = e.target.files[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      state.meta = data.meta || state.meta;
      state.ficha = normalizeFicha(data.ficha);
      state.nodes = data.nodes || [];
      state.edges = data.edges || [];
      const completo = esJsonCompleto(data);
      if (completo) {
        // D7: vistas y análisis del JSON completo. Un JSON del MVP sigue el camino de siempre.
        state.activeView = data.activeView === 'tobe' ? 'tobe' : 'asis';
        state._views = { asis: data.views.asis || null, tobe: data.views.tobe || null };
        state._raci = data.raci || null;
        state._sipoc = data.sipoc || null;
        state._simResults = data.simResults || null;
        state._kpiValues = data.kpiValues || {};
        state._lanes = data.lanes || null;
        state.selectedNodeId = null;
        state.selectedEdgeId = null;
        state.nextId = siguienteIdDeTodo();
      } else {
        state.nextId = (Math.max(0, ...state.nodes.map(n => parseInt(n.id.slice(1), 10) || 0)) || 0) + 1;
      }
      $('#processName').value = state.meta.name || '';
      $('#processIndustry').value = state.meta.industry || '';
      $('#processMacro').value = state.meta.macroprocess || '';
      if (completo) { updateViewUi(); renderKpiLibrary(); }
      persist();
      // Sin carriles guardados, se calculan (como al abrir datos de una versión vieja)
      if (completo && state.nodes.length > 0 && !state._lanes) autoLayout(); else render();
    } catch (err) { alert('Archivo JSON inválido.'); }
  };
  reader.readAsText(f);
  e.target.value = '';
}

function exportSvg() {
  const svgString = serializeCanvasSvg();
  download(svgString, filename('svg'), 'image/svg+xml');
}

function exportPng() {
  const svgString = serializeCanvasSvg();
  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.onload = () => {
    const cnv = document.createElement('canvas');
    const padding = 20;
    cnv.width = img.width + padding * 2;
    cnv.height = img.height + padding * 2;
    const ctx = cnv.getContext('2d');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, cnv.width, cnv.height);
    ctx.drawImage(img, padding, padding);
    cnv.toBlob(b => {
      const u = URL.createObjectURL(b);
      const a = document.createElement('a');
      a.href = u; a.download = filename('png'); a.click();
      URL.revokeObjectURL(u);
    }, 'image/png');
    URL.revokeObjectURL(url);
  };
  img.src = url;
}

function serializeCanvasSvg() {
  // Bounding box de nodos
  if (state.nodes.length === 0) return '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"></svg>';
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  state.nodes.forEach(n => {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + n.w);
    maxY = Math.max(maxY, n.y + n.h + 20);
  });
  const w = maxX - minX + 40;
  const h = maxY - minY + 40;
  const clone = canvas.cloneNode(true);
  clone.setAttribute('width', w);
  clone.setAttribute('height', h);
  clone.setAttribute('viewBox', `${minX - 20} ${minY - 20} ${w} ${h}`);
  // Los estilos del lienzo viven en styles.css y el SVG serializado no los
  // lleva: sin ellos todo <path> se rellena de negro y el texto sale en
  // serifa (visto por el usuario en la descarga PNG: las flechas eran
  // poligonos negros). Se copian los estilos computados relevantes como
  // estilo inline, elemento a elemento, recorriendo original y clon en
  // paralelo (querySelectorAll devuelve el mismo orden en ambos).
  const PROPS = ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linecap',
                 'stroke-linejoin', 'opacity', 'font-family', 'font-size', 'font-weight', 'font-style',
                 'letter-spacing', 'text-anchor', 'dominant-baseline', 'paint-order', 'text-transform'];
  const orig = canvas.querySelectorAll('*'), cop = clone.querySelectorAll('*');
  const ocultar = [];
  for (let i = 0; i < orig.length && i < cop.length; i++) {
    const cs = getComputedStyle(orig[i]);
    if (cs.display === 'none' || cs.visibility === 'hidden') { ocultar.push(cop[i]); continue; }
    let st = '';
    PROPS.forEach(p => { const v = cs.getPropertyValue(p); if (v && v !== 'normal' && v !== 'auto') st += p + ':' + v + ';'; });
    if (st) cop[i].setAttribute('style', st);
  }
  ocultar.forEach(el => el.remove());
  // La rejilla se quita DESPUES del recorrido: si se quita antes, original y
  // clon dejan de ir en paralelo y cada elemento hereda el estilo del anterior
  // (todo salia negro).
  const grid = clone.querySelector('#gridBg');
  if (grid) grid.remove();
  // Fondo blanco explicito: un SVG suelto se abre transparente
  const fondo = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  fondo.setAttribute('x', minX - 20); fondo.setAttribute('y', minY - 20);
  fondo.setAttribute('width', w); fondo.setAttribute('height', h); fondo.setAttribute('fill', '#FFFFFF');
  clone.insertBefore(fondo, clone.firstChild);
  return new XMLSerializer().serializeToString(clone);
}

function filename(ext) {
  const name = (state.meta.name || 'proceso').replace(/[^a-zA-Z0-9-_]+/g, '_');
  const ts = new Date().toISOString().slice(0, 10);
  return `ProcessIQ_${name}_${ts}.${ext}`;
}

function download(content, name, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

export { download, exportJson, exportPng, exportSvg, filename, importJson, serializeCanvasSvg };
