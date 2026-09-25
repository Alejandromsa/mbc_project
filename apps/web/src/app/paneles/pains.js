// Portado del MVP 3.8.9 (app.js) sin cambios de lógica — fase 1.
import { $ } from '../dom.js';
import { state } from '../estado.js';
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
    if (!desc) { alert('Describe el pain.'); return; }
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
    list.innerHTML = '<div class="empty-state">Selecciona un nodo para capturar sus pain points.</div>';
    return;
  }
  add.hidden = false;
  if (n.pains.length === 0) {
    list.innerHTML = '<div class="panel-hint">Sin pains capturados aún.</div>';
  } else {
    n.pains.forEach(p => {
      const cat = window.PAIN_CATEGORIES.find(c => c.id === p.category) || { label: '?', color: '#999', icon: '•' };
      const score = p.severity * p.frequency;
      const card = document.createElement('div');
      card.className = 'pain-card';
      card.style.borderLeftColor = cat.color;
      card.innerHTML = `
          <div class="pain-cat" style="color:${cat.color}">${cat.icon} ${cat.label}</div>
          <div class="pain-desc">${escapeHtml(p.description)}</div>
          <div class="pain-meta">Sev ${p.severity} · Frec ${p.frequency} · Score ${score}</div>
          <button class="pain-remove" data-id="${p.id}" title="Eliminar">✕</button>`;
      card.querySelector('.pain-remove').addEventListener('click', () => {
        n.pains = n.pains.filter(x => x.id !== p.id);
        persist(); render();
      });
      list.appendChild(card);
    });
  }
}

export { attachPainListeners, renderPains };
