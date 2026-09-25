// Portado del MVP 3.8.9 (app.js) sin cambios de lógica — fase 1.
import { $ } from '../dom.js';
import { openExamplesModal } from '../ejemplos/galeria.js';
import { state } from '../estado.js';
import { openIngestModal } from '../ingesta/modal.js';
import { setZoom, zoomToFit } from '../lienzo/zoom.js';
import { activateTab } from '../paneles/cajon.js';

// Onboarding: botones del empty-state
function attachOnboardListeners() {
  const onb = (id, fn) => { const el = $('#' + id); if (el) el.addEventListener('click', fn); };
  onb('onbIngest', () => openIngestModal());
  onb('onbDemo', () => openExamplesModal());
  onb('onbDraw', () => { activateTab('copilot'); });

  // Toggle de la leyenda BPMN sobre el canvas
  const legend = $('#bpmnLegend'), legendBtn = $('#btnLegend');
  const setLegend = (show) => {
    if (!legend) return;
    legend.hidden = !show;
    if (legendBtn) legendBtn.classList.toggle('active', show);
  };
  if (legendBtn) legendBtn.addEventListener('click', () => setLegend(legend.hidden));
  onb('btnLegendClose', () => setLegend(false));

  // Controles de zoom
  onb('btnZoomIn', () => setZoom((state.zoom || 1) * 1.2));
  onb('btnZoomOut', () => setZoom((state.zoom || 1) / 1.2));
  onb('btnZoomLevel', () => setZoom(1));
  onb('btnZoomFit', () => zoomToFit());

  // Desplegables: formas (riel izquierdo) e industria/macroproceso (cabecera).
  // Se cierran al hacer clic fuera, con Esc, y el de formas al empezar a arrastrar.
  const flyout = $('#shapesFlyout'), btnShapes = $('#btnShapes');
  const popover = $('#metaPopover'), btnMeta = $('#btnMeta');
  const pon = (btn, caja, abierto) => {
    if (!btn || !caja) return;
    caja.hidden = !abierto;
    btn.setAttribute('aria-expanded', abierto ? 'true' : 'false');
  };
  window.cerrarDesplegables = () => { pon(btnShapes, flyout, false); pon(btnMeta, popover, false); };
  onb('btnShapes', () => { const ab = flyout && flyout.hidden; pon(btnMeta, popover, false); pon(btnShapes, flyout, !!ab); });
  onb('btnMeta',   () => { const ab = popover && popover.hidden; pon(btnShapes, flyout, false); pon(btnMeta, popover, !!ab); });
  if (flyout) flyout.addEventListener('dragstart', () => setTimeout(() => pon(btnShapes, flyout, false), 0));
  document.addEventListener('mousedown', (ev) => {
    if (flyout && !flyout.hidden && !flyout.contains(ev.target) && !(btnShapes && btnShapes.contains(ev.target))) pon(btnShapes, flyout, false);
    if (popover && !popover.hidden && !popover.contains(ev.target) && !(btnMeta && btnMeta.contains(ev.target))) pon(btnMeta, popover, false);
  });
}

export { attachOnboardListeners };
