// Portado del MVP 3.8.9 (app.js) sin cambios de lógica — fase 1.
import { copilotPost } from '../copiloto/copiloto.js';
import { state } from '../estado.js';
import { persist } from '../persistencia.js';
import { openModal } from '../ui/modal.js';
import { escapeHtml } from '../util.js';

// ============================================================
// SIPOC (modal)
// ============================================================
function generateSipoc() {
  if (state.nodes.length === 0) { copilotPost('ai', 'Genera o dibuja un proceso primero.'); return; }
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
      <p class="panel-hint" style="margin-top:8px">SIPOC pre-llenado desde el diagrama (roles, data nodes). Edita libremente. Se incluirá en el PPTX.</p>`;

  openModal('SIPOC · ' + (state.meta.name || 'Proceso'), html, () => {
    document.querySelectorAll('[data-sipoc]').forEach(ta => {
      state._sipoc[ta.dataset.sipoc] = ta.value;
    });
    persist();
    copilotPost('ai', 'SIPOC guardado. Se exportará junto al PPTX.');
  });
}

export { generateSipoc };
