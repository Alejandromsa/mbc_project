// Portado del MVP 3.8.9 (app.js) sin cambios de lógica — fase 1.

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

export { escapeHtml };
