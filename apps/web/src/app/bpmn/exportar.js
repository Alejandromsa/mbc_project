// Export BPMN 2.0: adaptador de la app sobre @processiq/bpmn.
import { generarBpmnXml } from '@processiq/bpmn';
import { state } from '../estado.js';
import { download, filename } from '../exportar/archivos.js';

function exportBpmn() {
  if (state.nodes.length === 0) { alert('No hay proceso para exportar.'); return; }
  const xml = generateBpmnXml();
  download(xml, filename('bpmn'), 'application/xml');
}

function generateBpmnXml() {
  return generarBpmnXml(
    { meta: state.meta, nodes: state.nodes, edges: state.edges, lanes: state._lanes },
    'Process_' + Date.now()
  );
}

export { exportBpmn, generateBpmnXml };
