// Portado del MVP 3.8.9 (app.js) sin cambios de lógica — fase 1. El SIPOC que
// propone la IA (divergencia D11) se carga en el mismo diálogo editable.
import { copilotPost } from '../copiloto/copiloto.js';
import { $ } from '../dom.js';
import { state } from '../estado.js';
import { tr } from '../i18n.js';
import { persist } from '../persistencia.js';
import { openModal } from '../ui/modal.js';
import { escapeHtml } from '../util.js';

// ============================================================
// SIPOC (modal)
// ============================================================
function generateSipoc() {
  if (state.nodes.length === 0) { copilotPost('ai', tr('sipoc.sinProceso')); return; }
  const dataNodes = state.nodes.filter(n => n.type === 'data' || n.type === 'document');
  const startNode = state.nodes.find(n => n.type === 'start');
  const endNode = state.nodes.find(n => n.type === 'end');
  const owners = [...new Set(state.nodes.map(n => n.owner).filter(Boolean))];
  const systems = [...new Set(state.nodes.map(n => n.system).filter(Boolean))];

  state._sipoc = state._sipoc || {
    suppliers: owners.slice(0, 3).join(', ') || 'Cliente, Proveedor',
    inputs: (dataNodes.map(d => d.label).slice(0, 4).join(', ') || 'Solicitud, Documentación'),
    process: state.meta.name || 'Proceso ProcessIQ',
    outputs: 'Resultado entregado, Notificación al cliente',
    customers: 'Cliente final, Áreas internas'
  };

  abrirSipoc(tr('sipoc.pista'));
}

// Diálogo editable con las cinco columnas de state._sipoc
function abrirSipoc(pista) {
  const s = state._sipoc;
  const html = `
      <table class="sipoc-table">
        <thead><tr><th>Supplier</th><th>Input</th><th>Process</th><th>Output</th><th>Customer</th></tr></thead>
        <tbody><tr>
          <td><textarea data-sipoc="suppliers" rows="4" style="width:100%;border:1px solid #ddd;border-radius:3px;padding:4px">${escapeHtml(s.suppliers)}</textarea></td>
          <td><textarea data-sipoc="inputs" rows="4" style="width:100%;border:1px solid #ddd;border-radius:3px;padding:4px">${escapeHtml(s.inputs)}</textarea></td>
          <td><textarea data-sipoc="process" rows="4" style="width:100%;border:1px solid #ddd;border-radius:3px;padding:4px">${escapeHtml(s.process)}</textarea></td>
          <td><textarea data-sipoc="outputs" rows="4" style="width:100%;border:1px solid #ddd;border-radius:3px;padding:4px">${escapeHtml(s.outputs)}</textarea></td>
          <td><textarea data-sipoc="customers" rows="4" style="width:100%;border:1px solid #ddd;border-radius:3px;padding:4px">${escapeHtml(s.customers)}</textarea></td>
        </tr></tbody>
      </table>
      <p class="panel-hint" style="margin-top:8px">${pista}</p>`;

  openModal('SIPOC · ' + (state.meta.name || tr('raci.proceso')), html, () => {
    document.querySelectorAll('[data-sipoc]').forEach(ta => {
      state._sipoc[ta.dataset.sipoc] = ta.value;
    });
    persist();
    copilotPost('ai', tr('sipoc.guardado'));
  });
}

/**
 * SIPOC propuesto por la IA (pedirMatrizIa de @processiq/ia, ya validado):
 * reemplaza el del proceso, queda guardado al momento (deshacer lo quita) y se
 * abre para editarlo.
 */
function cargarSipocIa(sipoc) {
  const { suppliers, inputs, process, outputs, customers } = sipoc;
  state._sipoc = { suppliers, inputs, process, outputs, customers };
  persist();
  copilotPost('ai', tr('sipoc.generadoIa'));
  abrirSipoc(tr('sipoc.pistaIa'));
  // Cada diálogo pone el texto de su botón (lección 21)
  $('#modalOk').textContent = tr('matriz.guardar');
}

export { cargarSipocIa, generateSipoc };
