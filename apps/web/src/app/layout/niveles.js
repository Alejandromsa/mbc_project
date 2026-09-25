// Portado del MVP 3.8.9 (app.js) sin cambios de lógica — fase 1.
import { NIVELES, esHito, proyectarNivel as proyectar } from '@processiq/motor';
import { copilotPost } from '../copiloto/copiloto.js';
import { SHAPE_DEFAULTS, state } from '../estado.js';
import { render } from '../lienzo/render.js';
import { invalidarRutas } from '../lienzo/ruteo.js';
import { autoLayout } from './auto-layout.js';

// =================== AUTO LAYOUT (swimlanes horizontales + flow left-to-right) ===================
// Arriba-izquierda → abajo-derecha. Cada "carretera" horizontal = responsable.
// Las actividades se colocan en su carretera según su rank (BFS).
// ============================================================
// NIVEL DE GRANULARIDAD
//
// El proceso se genera UNA vez al máximo detalle y se colapsa localmente.
// Preguntar el nivel y regenerar era el bucle que hundió a la herramienta
// que evaluamos: cada cambio de opinión costaba otra llamada de IA y varios
// minutos. Aquí cambiar de vista es instantáneo y no gasta nada.
//
// Además baja la densidad, que es la causa real de que las flechas se pisen:
// un proceso de 154 nodos en vista ejecutiva son ~20 y el ruteo deja de ser
// un problema (ver pendiente #3 del HANDOFF).
//
// Si la IA etiquetó los nodos con `nivel` y `padre`, manda esa jerarquía.
// Si no —proceso importado o dibujado a mano— se deduce: lo que un mismo
// actor hace de corrido entre dos decisiones es UNA actividad de negocio.
// ============================================================
const _esHito = esHito;

// Carril de un nodo en la vista actual (los grupos por cadena no cruzan carriles)
function _carrilDe(n) {
  return (state._lanes && state._lanes.laneOf && state._lanes.laneOf[n.id]) ||
         n.owner || n.role || 'Sin asignar';
}

// Proyecta el modelo completo al nivel pedido (@processiq/motor)
function proyectarNivel(nivel) {
  const full = state._modeloCompleto;
  if (!full) return null;
  return proyectar(full, nivel, { carrilDe: _carrilDe, macroproceso: state.meta.macroprocess || 'Proceso', formas: SHAPE_DEFAULTS });
}

// ¿El modelo completo guardado sigue siendo el de este proceso? Si se cargó
// otro proceso (demo, ingesta, JSON) hay que recapturarlo: si no, colapsar
// devolvería los nodos del proceso anterior.
// Comparar ids no basta: las demos y los BPMN importados usan el mismo
// esquema de identificadores y un proceso nuevo parecia una proyeccion del
// anterior. Cada modelo completo lleva un sello y sus proyecciones lo heredan;
// un nodo sin sello significa que el proceso se reemplazo por otra via.
let _selloSeq = 0;
function _modeloVigente() {
  const full = state._modeloCompleto;
  if (!full || !full.nodes.length || !state.nodes.length) return false;
  // Los nodos que crea ensureDecisionBranches ("Caso no procede") nacen sin
  // sello: son artefactos de dibujo, no del modelo. Sin esta excepción, al
  // colapsar a nivel 1 el modelo se daba por ajeno y se recapturaba la vista
  // colapsada como si fuera el completo: volver a nivel 3 ya no restauraba.
  return state.nodes.every(n => n._autoGen || n._sello === state._selloModelo);
}

function aplicarNivel(nivel, opts) {
  opts = opts || {};
  if (!_modeloVigente()) { state.meta.nivelVista = 3; fijarModeloCompleto(); }
  const p = proyectarNivel(nivel);
  if (!p) return null;
  state.meta.nivelVista = nivel;
  p.nodes.forEach(n => { n._sello = state._selloModelo; });
  state.nodes = p.nodes; state.edges = p.edges;
  state._lanes = null; state._loopSlots = null;
  invalidarRutas();
  autoLayout();
  if (!opts.silent) { render(); actualizarSelectorNivel(); }
  return { nivel: nivel, nodos: p.nodes.length, aristas: p.edges.length };
}

// Se recaptura cada vez que el proceso cambia de verdad (ingesta, import, demo)
function fijarModeloCompleto() {
  state._selloModelo = 'm' + (++_selloSeq);
  state.nodes.forEach(n => { n._sello = state._selloModelo; });
  state._modeloCompleto = { nodes: state.nodes.map(n => ({ ...n })), edges: state.edges.map(e => ({ ...e })) };
  state.meta.nivelVista = state.meta.nivelVista || 3;
}

function cablearSelectorNivel() {
  const cont = document.getElementById('nivelVista');
  if (!cont) return;
  cont.addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-nivel]');
    if (!b) return;
    const n = +b.dataset.nivel;
    if (!state.nodes.length) return;
    const r = aplicarNivel(n);
    if (r) {
      const nv = NIVELES.find(x => x.id === n);
      copilotPost('ai', '**Vista ' + nv.nombre.toLowerCase() + '.** ' + nv.desc +
        '. Quedan **' + r.nodos + ' pasos** de ' + state._modeloCompleto.nodes.length +
        '. El proceso completo sigue guardado: cambiar de vista no pierde nada ni vuelve a llamar a la IA.');
    }
  });
}

function actualizarSelectorNivel() {
  const cont = document.getElementById('nivelVista');
  if (!cont) return;
  const activo = state.meta.nivelVista || 3;
  [].forEach.call(cont.querySelectorAll('button'), b => {
    b.classList.toggle('activo', +b.dataset.nivel === activo);
  });
  const info = document.getElementById('nivelInfo');
  if (info) {
    const full = state._modeloCompleto;
    info.textContent = full ? (state.nodes.length + ' de ' + full.nodes.length + ' pasos') : '';
  }
}

export { NIVELES, _esHito, actualizarSelectorNivel, aplicarNivel, cablearSelectorNivel, fijarModeloCompleto };
