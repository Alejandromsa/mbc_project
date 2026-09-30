// Export BPMN 2.0: adaptador de la app sobre @processiq/bpmn.
import { generarBpmnXml } from '@processiq/bpmn';
import { state } from '../estado.js';
import { download, filename } from '../exportar/archivos.js';
import { tr } from '../i18n.js';

function exportBpmn() {
  if (state.nodes.length === 0) { alert(tr('exportar.sinProceso')); return; }
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
