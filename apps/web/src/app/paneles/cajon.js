// Portado del MVP 3.8.9 (app.js) sin cambios de lógica — fase 1.
import { $, $$ } from '../dom.js';
import { state } from '../estado.js';
import { saveUiState } from '../ui/preferencias.js';
import { renderFichaTab } from './ficha.js';

// =================== TABS ===================
function attachTabListeners() {
  // Riel: clic en el icono activo con el cajón abierto lo cierra; cualquier
  // otro clic abre ese panel (y lo deja fijo aunque se deseleccione).
  $$('.tab[data-tab]').forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      const abierto = document.body.classList.contains('panel-open');
      if (abierto && tab.classList.contains('active')) cerrarPanel();
      else abrirPanel(target, false);
    });
  });
  const cierra = $('#btnDrawerClose');
  if (cierra) cierra.addEventListener('click', () => cerrarPanel());
}

// Quien pide una pestaña quiere verla: el cajón se abre y queda fijo.
function activateTab(name) {
  abrirPanel(name, false);
}

// Cajón derecho. `auto` marca que lo abrió la selección (y que por tanto
// puede cerrarse solo al deseleccionar).
function abrirPanel(name, auto) {
  document.body.classList.add('panel-open');
  state._panelAuto = !!auto;
  $$('.tab[data-tab]').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  $$('.tab-panel').forEach(p => p.classList.toggle('active', p.dataset.panel === name));
  const t = $('.tab[data-tab="' + name + '"]');
  const titulo = $('#drawerTitle');
  if (t && titulo) titulo.textContent = t.dataset.title || t.textContent.trim();
  if (name === 'ficha') renderFichaTab();
  saveUiState();
}
function cerrarPanel() {
  document.body.classList.remove('panel-open');
  state._panelAuto = false;
  saveUiState();
}

export { abrirPanel, activateTab, attachTabListeners, cerrarPanel };
