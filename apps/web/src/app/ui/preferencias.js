// Portado del MVP 3.8.9 (app.js) sin cambios de lógica — fase 1.
import { $ } from '../dom.js';
import { state } from '../estado.js';
import { abrirPanel } from '../paneles/cajon.js';

// Persistencia del estado de la UI (paneles colapsados) entre recargas
const UI_KEY = 'processiq.ui';
function saveUiState() {
  try {
    const activa = $('.tab[data-tab].active');
    localStorage.setItem(UI_KEY, JSON.stringify({
      // Solo se recuerda un cajón abierto A MANO; el automático (selección) no
      panelOpen: document.body.classList.contains('panel-open') && !state._panelAuto,
      tab: activa ? activa.dataset.tab : 'properties'
    }));
  } catch (e) { /* ignore */ }
}
function restoreUiState() {
  try {
    const ui = JSON.parse(localStorage.getItem(UI_KEY) || '{}');
    if (ui.panelOpen && ui.tab) abrirPanel(ui.tab, false);
  } catch (e) { /* ignore */ }
}

export { restoreUiState, saveUiState };
