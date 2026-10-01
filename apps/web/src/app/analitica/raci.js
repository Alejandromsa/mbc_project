// Portado del MVP 3.8.9 (app.js) sin cambios de lógica — fase 1. La matriz que
// propone la IA (divergencia D12) se carga en el mismo diálogo editable.
import { copilotPost } from '../copiloto/copiloto.js';
import { $ } from '../dom.js';
import { state } from '../estado.js';
import { tr } from '../i18n.js';
import { persist } from '../persistencia.js';
import { openModal } from '../ui/modal.js';
import { escapeHtml } from '../util.js';

// ============================================================
// RACI matrix (modal)
// ============================================================
const actividadesRaci = () => state.nodes.filter(n => n.type === 'task' || n.type === 'system' || n.type === 'decision');

function generateRaci() {
  const tasks = actividadesRaci();
  if (tasks.length === 0) { copilotPost('ai', tr('raci.sinActividades')); return; }

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

  abrirRaci(tasks, roles, tr('raci.pista'));
}

// Diálogo editable: una fila por actividad y una columna por rol, leídas de state._raci
function abrirRaci(tasks, roles, pista) {
  let html = '<table class="raci-table"><thead><tr><th>' + tr('sim.colActividad') + '</th>';
  roles.forEach(r => html += `<th>${escapeHtml(r)}</th>`);
  html += '</tr></thead><tbody>';
  tasks.forEach(t => {
    html += `<tr><td>${escapeHtml(t.label)}</td>`;
    roles.forEach(r => {
      const val = state._raci[t.id][r] || '';
      html += `<td class="cell-center"><select class="raci-pick" data-tid="${t.id}" data-role="${escapeHtml(r)}">
          <option value="">—</option>
          <option value="R" ${val==='R'?'selected':''}>${tr('raci.r')}</option>
          <option value="A" ${val==='A'?'selected':''}>A · Accountable</option>
          <option value="R/A" ${val==='R/A'?'selected':''}>R/A</option>
          <option value="C" ${val==='C'?'selected':''}>${tr('raci.c')}</option>
          <option value="I" ${val==='I'?'selected':''}>${tr('raci.i')}</option>
        </select></td>`;
    });
    html += '</tr>';
  });
  html += '</tbody></table><p class="panel-hint" style="margin-top:8px">' + pista + '</p>';

  openModal(tr('raci.titulo', { nombre: state.meta.name || tr('raci.proceso') }), html, () => {
    // Captura cambios
    document.querySelectorAll('.raci-pick').forEach(sel => {
      const tid = sel.dataset.tid, role = sel.dataset.role;
      state._raci[tid] = state._raci[tid] || {};
      state._raci[tid][role] = sel.value;
    });
    persist();
    copilotPost('ai', tr('raci.guardada', { n: tasks.length, roles: roles.length }));
  });
}

/**
 * Matriz RACI propuesta por la IA (pedirMatrizIa de @processiq/ia, ya validada):
 * reemplaza la del proceso y queda guardada al momento (se pagó; deshacer la
 * quita). Filas: todas las actividades, como la heurística; columnas: los roles
 * de la IA, primero en el orden de los carriles. Después se abre para editarla.
 */
function cargarRaciIa(matriz) {
  const propia = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const tasks = actividadesRaci();
  const deIa = [...new Set(Object.values(matriz).flatMap(f => Object.keys(f)))];
  const carriles = (state._lanes && state._lanes.list) || [];
  const roles = [...carriles.filter(r => deIa.includes(r)), ...deIa.filter(r => !carriles.includes(r))];
  state._raci = {};
  tasks.forEach(t => {
    const fila = propia(matriz, t.id) ? matriz[t.id] : {};
    state._raci[t.id] = {};
    roles.forEach(r => { state._raci[t.id][r] = propia(fila, r) ? fila[r] : ''; });
  });
  persist();
  copilotPost('ai', tr('raci.generadaIa', { n: tasks.length, roles: roles.length }));
  abrirRaci(tasks, roles, tr('raci.pistaIa'));
  // Cada diálogo pone el texto de su botón (lección 21)
  $('#modalOk').textContent = tr('matriz.guardar');
}

export { cargarRaciIa, generateRaci };
