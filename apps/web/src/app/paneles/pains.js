// Portado del MVP 3.8.9 (app.js) sin cambios de lógica — fase 1.
import { $ } from '../dom.js';
import { state } from '../estado.js';
import { etiquetaPain, tr } from '../i18n.js';
import { getNode } from '../lienzo/interaccion.js';
import { render } from '../lienzo/render.js';
import { persist } from '../persistencia.js';
import { escapeHtml } from '../util.js';

// =================== PAINS PANEL ===================
function attachPainListeners() {
  $('#btnAddPain').addEventListener('click', () => {
    const n = getNode(state.selectedNodeId);
    if (!n) return;
    const desc = $('#painDescription').value.trim();
    if (!desc) { alert(tr('pains.describe')); return; }
    n.pains.push({
      id: 'p' + (state.nextId++),
      category: $('#painCategory').value,
      description: desc,
      severity: parseInt($('#painSeverity').value, 10),
      frequency: parseInt($('#painFrequency').value, 10)
    });
    $('#painDescription').value = '';
    persist();
    render();
  });
}

function renderPains() {
  const list = $('#painsList');
  const add = $('#painsAdd');
  list.innerHTML = '';
  const n = getNode(state.selectedNodeId);
  if (!n) {
    add.hidden = true;
    list.innerHTML = '<div class="empty-state">' + tr('pains.selecciona') + '</div>';
    return;
  }
  add.hidden = false;
  if (n.pains.length === 0) {
    list.innerHTML = '<div class="panel-hint">' + tr('pains.sinPains') + '</div>';
  } else {
    n.pains.forEach(p => {
      const cat = window.PAIN_CATEGORIES.find(c => c.id === p.category) || { label: '?', color: '#999', icon: '•' };
      const score = p.severity * p.frequency;
      const card = document.createElement('div');
      card.className = 'pain-card';
      card.style.borderLeftColor = cat.color;
      card.innerHTML = `
          <div class="pain-cat" style="color:${cat.color}">${cat.icon} ${cat.id ? etiquetaPain(cat) : cat.label}</div>
          <div class="pain-desc">${escapeHtml(p.description)}</div>
          <div class="pain-meta">${tr('pains.meta', { sev: p.severity, frec: p.frequency, score })}</div>
          <button class="pain-remove" data-id="${p.id}" title="${tr('pains.eliminar')}">✕</button>`;
      card.querySelector('.pain-remove').addEventListener('click', () => {
        n.pains = n.pains.filter(x => x.id !== p.id);
        persist(); render();
      });
      list.appendChild(card);
    });
  }
}

export { attachPainListeners, renderPains };
