// Portado del MVP 3.8.9 (app.js) sin cambios de lógica — fase 1.
import { state } from '../estado.js';
import { deleteSelection } from '../lienzo/interaccion.js';
import { render } from '../lienzo/render.js';
import { cerrarPanel } from '../paneles/cajon.js';
import { toggleConnectMode } from './cabecera.js';
import { togglePresentMode } from './presentacion.js';

// =================== KEYBOARD ===================
function attachKeyboardShortcuts() {
  document.addEventListener('keydown', e => {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;
    if (e.key === 'Delete' || e.key === 'Backspace') { deleteSelection(); e.preventDefault(); }
    if (e.key === 'c' || e.key === 'C') toggleConnectMode();
    if (e.key === 'Escape') {
      if (document.body.classList.contains('present-mode')) { togglePresentMode(false); return; }
      if (window.cerrarDesplegables) window.cerrarDesplegables();
      const habiaSeleccion = !!(state.selectedNodeId || state.selectedEdgeId);
      state.selectedNodeId = null; state.selectedEdgeId = null; state.connectSourceId = null; render();
      // Esc sin selección cierra el cajón (con selección, primero deselecciona)
      if (!habiaSeleccion && document.body.classList.contains('panel-open')) cerrarPanel();
    }
  });
}

export { attachKeyboardShortcuts };
