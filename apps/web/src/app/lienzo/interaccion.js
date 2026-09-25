// Portado del MVP 3.8.9 (app.js) sin cambios de lógica — fase 1.
import { $, canvas, laneHeadersLayer } from '../dom.js';
import { SHAPE_DEFAULTS, state } from '../estado.js';
import { persist } from '../persistencia.js';
import { assignActivityCodes } from '../proceso/operaciones.js';
import { render } from './render.js';

// =================== CANVAS ===================
function updateStickyHeaders() {
  if (!laneHeadersLayer || !state._lanes) return;
  const wrapper = $('#canvasWrapper');
  if (!wrapper) return;
  laneHeadersLayer.setAttribute('transform', `translate(${wrapper.scrollLeft}, 0)`);
}

function attachCanvasListeners() {
  canvas.addEventListener('dragover', e => e.preventDefault());

  // Sticky headers de swimlanes: se trasladan con el scroll horizontal
  const wrapper = $('#canvasWrapper');
  if (wrapper) {
    wrapper.addEventListener('scroll', updateStickyHeaders, { passive: true });
  }
  canvas.addEventListener('drop', e => {
    e.preventDefault();
    const shape = e.dataTransfer.getData('shape');
    if (!shape) return;
    const pt = svgPoint(e.clientX, e.clientY);
    addNode(shape, pt.x, pt.y);
  });

  // v3.8.8: arrastrar sobre un espacio vacio (fondo, carril o su cabecera)
  // desplaza el lienzo, como en draw.io o Miro. Antes solo quitaba la
  // seleccion y un flujo de izquierda a derecha no se podia recorrer con el
  // raton. Un clic SIN arrastrar sigue quitando la seleccion.
  canvas.addEventListener('mousedown', e => {
    if (e.target.closest && (e.target.closest('#nodesLayer') || e.target.closest('#edgesLayer'))) return;
    if (e.button !== 0 && e.button !== 1) return;
    const wrap = $('#canvasWrapper');
    if (!wrap) return;
    e.preventDefault();   // que no se seleccione texto mientras se arrastra
    const ini = { x: e.clientX, y: e.clientY, left: wrap.scrollLeft, top: wrap.scrollTop };
    let movio = false;
    const mover = (ev) => {
      const dx = ev.clientX - ini.x, dy = ev.clientY - ini.y;
      if (!movio && Math.abs(dx) + Math.abs(dy) < 4) return;
      if (!movio) { movio = true; wrap.classList.add('panning'); }
      wrap.scrollLeft = ini.left - dx;
      wrap.scrollTop = ini.top - dy;
    };
    const soltar = () => {
      window.removeEventListener('mousemove', mover);
      window.removeEventListener('mouseup', soltar);
      wrap.classList.remove('panning');
      if (!movio && (state.selectedNodeId || state.selectedEdgeId)) {
        state.selectedNodeId = null;
        state.selectedEdgeId = null;
        render();
      }
    };
    window.addEventListener('mousemove', mover);
    window.addEventListener('mouseup', soltar);
  });

  canvas.addEventListener('mousemove', e => {
    if (!state.drag) return;
    const pt = svgPoint(e.clientX, e.clientY);
    const n = getNode(state.drag.id);
    if (!n) return;
    n.x = pt.x - state.drag.offsetX;
    n.y = pt.y - state.drag.offsetY;
    render();
  });

  canvas.addEventListener('mouseup', () => {
    if (state.drag) { state.drag = null; persist(); }
  });
  canvas.addEventListener('mouseleave', () => {
    if (state.drag) { state.drag = null; persist(); }
  });
}

function svgPoint(clientX, clientY) {
  // Conversión robusta vía matriz: respeta viewBox/zoom y scroll (necesario para el zoom).
  if (canvas.getScreenCTM) {
    const ctm = canvas.getScreenCTM();
    if (ctm) {
      const p = canvas.createSVGPoint();
      p.x = clientX; p.y = clientY;
      const inv = p.matrixTransform(ctm.inverse());
      return { x: inv.x, y: inv.y };
    }
  }
  const rect = canvas.getBoundingClientRect();
  return { x: clientX - rect.left, y: clientY - rect.top };
}

function addNode(type, x, y) {
  const def = SHAPE_DEFAULTS[type];
  // Tipo de ejecución por defecto según shape
  const defaultExec = type === 'system' ? 'system' : (type === 'task' ? 'manual' : '');
  const node = {
    id: 'n' + (state.nextId++),
    type,
    x: x - def.w / 2,
    y: y - def.h / 2,
    w: def.w,
    h: def.h,
    label: def.label,
    executionType: defaultExec,
    activityCode: '',
    owner: '', system: '', time: '', volume: '', va: '',
    sla: '', docsIn: '', docsOut: '', rules: '', notes: '',
    pains: []
  };
  state.nodes.push(node);
  state.selectedNodeId = node.id;
  assignActivityCodes();   // asigna [PREFIX-NN] al nuevo nodo
  persist();
  render();
}

function addEdge(fromId, toId) {
  if (fromId === toId) return;
  const exists = state.edges.some(e => e.from === fromId && e.to === toId);
  if (exists) return;
  state.edges.push({ id: 'e' + (state.nextId++), from: fromId, to: toId, label: '' });
  persist();
  render();
}

function deleteSelection() {
  if (state.selectedNodeId) {
    state.nodes = state.nodes.filter(n => n.id !== state.selectedNodeId);
    state.edges = state.edges.filter(e => e.from !== state.selectedNodeId && e.to !== state.selectedNodeId);
    state.selectedNodeId = null;
  } else if (state.selectedEdgeId) {
    state.edges = state.edges.filter(e => e.id !== state.selectedEdgeId);
    state.selectedEdgeId = null;
  }
  persist();
  render();
}

function getNode(id) { return state.nodes.find(n => n.id === id); }
function getEdge(id) { return state.edges.find(e => e.id === id); }

export { addEdge, attachCanvasListeners, deleteSelection, getNode, svgPoint, updateStickyHeaders };
