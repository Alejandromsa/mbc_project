// Portado del MVP 3.8.9 (app.js) sin cambios de lógica — fase 1.
import { copilotPost } from '../copiloto/copiloto.js';
import { state } from '../estado.js';
import { persist } from '../persistencia.js';
import { openModal } from '../ui/modal.js';
import { escapeHtml } from '../util.js';

// ============================================================
// RACI matrix (modal)
// ============================================================
function generateRaci() {
  const tasks = state.nodes.filter(n => n.type === 'task' || n.type === 'system' || n.type === 'decision');
  if (tasks.length === 0) { copilotPost('ai', 'Necesito actividades en el diagrama para generar RACI.'); return; }

  // Roles únicos detectados en owner; si no hay, usar genéricos
  let roles = [...new Set(tasks.map(t => t.owner).filter(Boolean))];
  if (roles.length === 0) roles = ['Frontline', 'Back Office', 'Gerencia', 'Sistemas'];

  // Inicia matriz
  state._raci = state._raci || {};
  tasks.forEach(t => {
    state._raci[t.id] = state._raci[t.id] || {};
    roles.forEach(r => {
      if (!state._raci[t.id][r]) {
        state._raci[t.id][r] = (t.owner === r) ? 'R/A' : '';
      }
    });
  });

  let html = '<table class="raci-table"><thead><tr><th>Actividad</th>';
  roles.forEach(r => html += `<th>${escapeHtml(r)}</th>`);
  html += '</tr></thead><tbody>';
  tasks.forEach(t => {
    html += `<tr><td>${escapeHtml(t.label)}</td>`;
    roles.forEach(r => {
      const val = state._raci[t.id][r] || '';
      html += `<td class="cell-center"><select class="raci-pick" data-tid="${t.id}" data-role="${escapeHtml(r)}">
          <option value="">—</option>
          <option value="R" ${val==='R'?'selected':''}>R · Responsable</option>
          <option value="A" ${val==='A'?'selected':''}>A · Accountable</option>
          <option value="R/A" ${val==='R/A'?'selected':''}>R/A</option>
          <option value="C" ${val==='C'?'selected':''}>C · Consulta</option>
          <option value="I" ${val==='I'?'selected':''}>I · Informado</option>
        </select></td>`;
    });
    html += '</tr>';
  });
  html += '</tbody></table><p class="panel-hint" style="margin-top:8px">R=Responsable · A=Accountable · C=Consultado · I=Informado. La matriz se exportará al PPTX automáticamente.</p>';

  openModal('Matriz RACI · ' + (state.meta.name || 'Proceso'), html, () => {
    // Captura cambios
    document.querySelectorAll('.raci-pick').forEach(sel => {
      const tid = sel.dataset.tid, role = sel.dataset.role;
      state._raci[tid] = state._raci[tid] || {};
      state._raci[tid][role] = sel.value;
    });
    persist();
    copilotPost('ai', `Matriz RACI guardada con ${tasks.length} actividades × ${roles.length} roles. Se incluirá en el próximo export PPTX.`);
  });
}

export { generateRaci };
