// Portado del MVP 3.8.9 (app.js) sin cambios de lógica — fase 1.
import { FORMAS_POR_DEFECTO, fichaVacia, normalizarFicha } from '@processiq/dominio';

// =================== STATE ===================
const STORAGE_KEY = 'processiq.v1';
const state = {
  meta: { name: '', industry: '', macroprocess: '', client: '', owner: '' },
  // Ficha de proceso corporativa (formato Minsait/cliente) — ver deriveFicha()/exportFicha()
  ficha: {
    code: '',            // p.ej. PR-DU-COM-02
    version: '',         // p.ej. 6
    objetivo: '',
    alcanceAreas: '',    // áreas involucradas
    alcanceDesde: '',    // hito de inicio (autosugerido del nodo start)
    alcanceHasta: '',    // hito de fin (autosugerido del nodo end)
    alcanceIncluye: '',  // qué abarca / excluye
    descripcion: '',
    gobernanza: [],      // [{ rol:'Dueño|Editor|Revisor|Aprobador', cargo, nombre, fecha }]
    sistemas: [],        // [{ nombre, uso }] — sistemas a nivel proceso (además de los de cada nodo)
    terminos: [],        // [{ termino, definicion }]
    anexos: [],          // [{ codigo, nombre }]
    cambios: []          // [{ version, fecha, descripcion }]
  },
  nodes: [],   // { id, type, x, y, w, h, label, owner, system, time, volume, va, notes, pains:[] }
  edges: [],   // { id, from, to, label }
  activeView: 'asis',         // 'asis' | 'tobe'
  _views: { asis: null, tobe: null },  // snapshots de la vista inactiva
  selectedNodeId: null,
  selectedEdgeId: null,
  mode: 'edit', // 'edit' | 'connect'
  connectSourceId: null,
  drag: null,   // { id, offsetX, offsetY }
  nextId: 1
};

const SHAPE_DEFAULTS = FORMAS_POR_DEFECTO;
const emptyFicha = fichaVacia;
const normalizeFicha = normalizarFicha;

export { SHAPE_DEFAULTS, STORAGE_KEY, emptyFicha, normalizeFicha, state };
