// Portado del MVP 3.8.9 (app.js) sin cambios de lógica — fase 1.
import { medirCalidad } from '@processiq/motor';
import { copilotPost } from '../copiloto/copiloto.js';
import { state } from '../estado.js';
import { tr } from '../i18n.js';
import { autoLayout } from '../layout/auto-layout.js';
import { astReset, invalidarRutas, smartEdgePath } from './ruteo.js';
import { maybeFitOnLoad } from './zoom.js';

// ============================================================
// AUTOAJUSTE — mide la calidad del diagrama y elige la mejor disposición
// Cuenta flechas que pisan cajas y cruces flecha-flecha sobre el ruteo REAL
// (el mismo que dibuja el canvas), prueba variantes de layout y aplica la
// que menos defectos produce. Es lo que corre el botón "Autoajustar".
// ============================================================
// Diagnóstico de calidad del diagrama actual, sobre el ruteo real (el mismo
// que dibuja el lienzo). La medición está en @processiq/motor.
function diagramQuality() {
  invalidarRutas();
  if (state._astar) astReset();   // el A* sólo entra si está activado
  return medirCalidad(state.nodes, state.edges, (a, b, e) => smartEdgePath(a, b, e));
}
// Prueba variantes de disposición y se queda con la mejor
function autoFitDiagram(opts) {
  opts = opts || {};
  if (state.nodes.length === 0) { if (!opts.silent) alert(tr('autoajuste.sinDiagrama')); return null; }
  const variantes = [undefined, true, false];   // wrap: auto / forzado / desactivado
  let mejor = null;
  variantes.forEach(w => {
    state._wrap = w;
    autoLayout();
    const q = diagramQuality();
    if (!mejor || q.score < mejor.q.score) mejor = { wrap: w, q };
  });
  state._wrap = mejor.wrap;
  autoLayout();
  const q = mejor.q;
  if (!opts.silent) {
    maybeFitOnLoad();
    const L = state._lanes || {};
    const limpio = (q.sobreCajas === 0 && q.cruces === 0);
    copilotPost('ai',
      tr('autoajuste.titulo') +
      (limpio
        ? tr('autoajuste.limpio', { disposicion: L.wrap ? tr('autoajuste.bandas', { bandas: L.bands, columnas: L.wrapAt }) : tr('autoajuste.unaBanda'), carriles: (L.list || []).length })
        : tr('autoajuste.defectos', { sobreCajas: q.sobreCajas, cruces: q.cruces, variantes: variantes.length })) +
      tr('autoajuste.tamano', { ancho: q.ancho, alto: q.alto }));
  }
  return q;
}

export { autoFitDiagram, diagramQuality };
