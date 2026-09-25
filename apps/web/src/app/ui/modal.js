// Portado del MVP 3.8.9 (app.js) sin cambios de lógica — fase 1.
import { $ } from '../dom.js';

// =================== MODAL ===================
function openModal(title, bodyHtml, onOk) {
  const modal = $('#modal');
  $('#modalTitle').textContent = title;
  $('#modalBody').innerHTML = bodyHtml;
  modal.hidden = false;

  const cancel = () => { modal.hidden = true; };

  $('#modalCancel').onclick = cancel;
  $('#modalOk').onclick = () => {
    try { onOk(); } catch (err) { console.error('[ProcessIQ] modal onOk error:', err); alert('Error: ' + err.message); }
    cancel();
  };
  // Click outside (sobre el backdrop) cierra el modal
  modal.onclick = (e) => { if (e.target === modal) cancel(); };
  // ESC cierra
  const escHandler = (e) => { if (e.key === 'Escape') { cancel(); document.removeEventListener('keydown', escHandler); } };
  document.addEventListener('keydown', escHandler);
  // Auto-focus primer input/textarea del body
  requestAnimationFrame(() => {
    const first = $('#modalBody').querySelector('textarea, input:not([type=hidden]), select');
    if (first) first.focus();
  });
}

export { openModal };
