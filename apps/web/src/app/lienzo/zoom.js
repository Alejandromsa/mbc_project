// Portado del MVP 3.8.9 (app.js) sin cambios de lógica — fase 1.
import { $ } from '../dom.js';
import { state } from '../estado.js';
import { render } from './render.js';

const ZOOM_MIN = 0.2, ZOOM_MAX = 3;
// setZoom(z, opts): opts puede ser {keepScroll:true} o {anchor:{clientX,clientY}} para zoom hacia el cursor.
function setZoom(z, opts) {
  opts = opts || {};
  z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
  const wrap = $('#canvasWrapper');
  if (!wrap) { state.zoom = z; render(); return; }
  const wrect = wrap.getBoundingClientRect();
  // Punto de contenido que debe quedar fijo tras el zoom
  let fixCx, fixCy, fixVpX, fixVpY;   // contenido (fix*) y su posición en viewport (fixVp*)
  if (opts.anchor) {
    // Zoom hacia el cursor: el punto bajo el cursor permanece bajo el cursor
    fixVpX = opts.anchor.clientX - wrect.left;
    fixVpY = opts.anchor.clientY - wrect.top;
  } else if (!opts.keepScroll) {
    // Zoom con botones: mantén el centro del viewport
    fixVpX = wrap.clientWidth / 2;
    fixVpY = wrap.clientHeight / 2;
  }
  const prev = state.zoom || 1;
  if (fixVpX != null) {
    fixCx = (wrap.scrollLeft + fixVpX) / prev;
    fixCy = (wrap.scrollTop + fixVpY) / prev;
  }
  state.zoom = z;
  render();
  const lvl = $('#btnZoomLevel');
  if (lvl) lvl.textContent = Math.round(z * 100) + '%';
  if (fixCx != null) {
    wrap.scrollLeft = fixCx * z - fixVpX;
    wrap.scrollTop = fixCy * z - fixVpY;
  }
}
// Atajos y rueda del mouse para manejar el zoom sobre el flujo
function attachZoomInteractions() {
  const wrap = $('#canvasWrapper');
  if (!wrap) return;
  // Ctrl/⌘ + rueda → zoom hacia el cursor (igual que Figma/draw.io; el pinch del trackpad envía ctrlKey)
  wrap.addEventListener('wheel', (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      setZoom((state.zoom || 1) * factor, { anchor: { clientX: e.clientX, clientY: e.clientY } });
      return;
    }
    // v3.8.8: el flujo crece a lo ANCHO (80 cajas = 17 m) y la rueda solo movia
    // en vertical, con unos pocos cientos de px de recorrido. Ahora la rueda
    // baja/sube mientras pueda y, al llegar al tope, sigue avanzando/retrocediendo
    // a lo largo del flujo. Shift+rueda y el trackpad (deltaX) quedan nativos.
    if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : (e.deltaMode === 2 ? e.deltaY * wrap.clientHeight : e.deltaY);
    const maxTop = wrap.scrollHeight - wrap.clientHeight;
    const puedeVertical = dy > 0 ? wrap.scrollTop < maxTop - 1 : wrap.scrollTop > 0;
    const maxLeft = wrap.scrollWidth - wrap.clientWidth;
    if (puedeVertical || maxLeft <= 0) return;   // scroll vertical normal del navegador
    e.preventDefault();
    wrap.scrollLeft = Math.max(0, Math.min(maxLeft, wrap.scrollLeft + dy));
  }, { passive: false });
  // Atajos de teclado: Ctrl/⌘ +/-/0 ; tecla "f" = ajustar
  document.addEventListener('keydown', (e) => {
    const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);
    if (typing) return;
    if ((e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '=')) { e.preventDefault(); setZoom((state.zoom || 1) * 1.2); }
    else if ((e.ctrlKey || e.metaKey) && e.key === '-') { e.preventDefault(); setZoom((state.zoom || 1) / 1.2); }
    else if ((e.ctrlKey || e.metaKey) && e.key === '0') { e.preventDefault(); setZoom(1); }
    else if (e.key === 'f' || e.key === 'F') { zoomToFit(); }
  });
}
function zoomToFit() {
  const wrap = $('#canvasWrapper');
  if (!wrap || state.nodes.length === 0) { setZoom(1); return; }
  // Extensión real del contenido (sin el padding del scroll)
  let minX = Infinity, minY = Infinity, maxX = 0, maxY = 0;
  state.nodes.forEach(n => {
    minX = Math.min(minX, n.x); minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + n.w); maxY = Math.max(maxY, n.y + n.h);
  });
  const margin = 80;
  const contentW = (maxX - minX) + margin * 2;
  const contentH = (maxY - minY) + margin * 2 + 40; // +40 por labels bajo nodos
  const z = Math.min(wrap.clientWidth / contentW, wrap.clientHeight / contentH);
  setZoom(z, { keepScroll: true });
  // Lleva el scroll al inicio del contenido (arriba-izquierda)
  const wrap2 = $('#canvasWrapper');
  if (wrap2) { wrap2.scrollLeft = Math.max(0, (minX - margin) * (state.zoom || 1)); wrap2.scrollTop = Math.max(0, (minY - margin) * (state.zoom || 1)); }
}

// Encuadra automáticamente el proceso recién cargado si no cabe a 100% en el viewport
function maybeFitOnLoad() {
  const wrap = $('#canvasWrapper');
  if (!wrap || state.nodes.length === 0) return;
  let minX = Infinity, maxX = 0, minY = Infinity, maxY = 0;
  state.nodes.forEach(n => { minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x + n.w); minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y + n.h); });
  const contentW = (maxX - minX) + 160, contentH = (maxY - minY) + 160;
  // Solo encuadra si desborda; procesos pequeños se quedan a 100%
  if (contentW > wrap.clientWidth || contentH > wrap.clientHeight) {
    zoomToFit();
  } else {
    setZoom(1, { keepScroll: true });
  }
}

export { attachZoomInteractions, maybeFitOnLoad, setZoom, zoomToFit };
