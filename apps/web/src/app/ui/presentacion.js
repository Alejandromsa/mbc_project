// Portado del MVP 3.8.9 (app.js) sin cambios de lógica — fase 1.
import { $ } from '../dom.js';
import { alCambiarIdioma, tr } from '../i18n.js';
import { render } from '../lienzo/render.js';
import { cerrarPanel } from '../paneles/cajon.js';

// Modo presentación: maximiza el lienzo ocultando paneles laterales
function togglePresentMode(force) {
  const on = force != null ? force : !document.body.classList.contains('present-mode');
  document.body.classList.toggle('present-mode', on);
  if (on) { cerrarPanel(); if (window.cerrarDesplegables) window.cerrarDesplegables(); }
  const btn = $('#btnPresent');
  if (btn) btn.innerHTML = on ? tr('presentar.salir') : tr('presentar.boton');
  // Re-render para recalcular dimensiones del SVG al nuevo viewport
  setTimeout(render, 60);
}

function attachPresentListeners() {
  const btn = $('#btnPresent');
  if (btn) btn.addEventListener('click', () => togglePresentMode());
}

alCambiarIdioma(() => {
  const btn = $('#btnPresent');
  if (btn) btn.innerHTML = document.body.classList.contains('present-mode') ? tr('presentar.salir') : tr('presentar.boton');
});

export { attachPresentListeners, togglePresentMode };
