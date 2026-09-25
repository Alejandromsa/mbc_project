// Portado del MVP 3.8.9 (app.js) sin cambios de lógica — fase 1.
import { medirCalidad } from '@processiq/motor';
import { copilotPost } from '../copiloto/copiloto.js';
import { state } from '../estado.js';
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
  if (state.nodes.length === 0) { if (!opts.silent) alert('No hay diagrama que ajustar.'); return null; }
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
      `**Diagrama autoajustado.**\n\n` +
      (limpio
        ? `Sin flechas sobre cajas ni cruces. Disposición: ${L.wrap ? `${L.bands} bandas de hasta ${L.wrapAt} columnas` : 'una sola banda'}, ${(L.list || []).length} carriles.\n\n`
        : `Quedan **${q.sobreCajas} flecha(s) sobre cajas** y **${q.cruces} cruce(s)**; es la mejor de ${variantes.length} disposiciones probadas. Suele deberse a varias ramas que apuntan al mismo nodo final.\n\n`) +
      `Tamaño: ${q.ancho} × ${q.alto} px. Pulsa **deshacer** (Ctrl+Z) si prefieres la disposición anterior.`);
  }
  return q;
}

export { autoFitDiagram, diagramQuality };
