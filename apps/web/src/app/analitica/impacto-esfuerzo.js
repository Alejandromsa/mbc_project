// Portado del MVP 3.8.9 (app.js) sin cambios de lógica — fase 1.
import { painsDelProceso, posicionImpactoEsfuerzo } from '@processiq/analitica';
import { copilotPost } from '../copiloto/copiloto.js';
import { state } from '../estado.js';
import { openModal } from '../ui/modal.js';
import { escapeHtml } from '../util.js';

// ============================================================
// Matriz Impacto-Esfuerzo de pains
// ============================================================
function generateImpactEffort() {
  const allPains = painsDelProceso(state.nodes);
  if (allPains.length === 0) { copilotPost('ai', 'Captura pains primero (selecciona un nodo → tab Pains).'); return; }

  let html = `<svg viewBox="0 0 400 320" style="width:100%;background:#FAFAFA;border:1px solid #ddd">
      <line x1="40" y1="290" x2="380" y2="290" stroke="#999" stroke-width="1"/>
      <line x1="40" y1="20" x2="40" y2="290" stroke="#999" stroke-width="1"/>
      <line x1="210" y1="20" x2="210" y2="290" stroke="#ccc" stroke-dasharray="3 3"/>
      <line x1="40" y1="155" x2="380" y2="155" stroke="#ccc" stroke-dasharray="3 3"/>
      <text x="125" y="15" font-size="10" text-anchor="middle" fill="#2E7D32">QUICK WINS</text>
      <text x="295" y="15" font-size="10" text-anchor="middle" fill="#1565C0">PROYECTOS ESTRATÉGICOS</text>
      <text x="125" y="310" font-size="10" text-anchor="middle" fill="#999">FILL-INS</text>
      <text x="295" y="310" font-size="10" text-anchor="middle" fill="#C62828">RECONSIDERAR</text>
      <text x="210" y="305" font-size="9" text-anchor="middle" fill="#666">→ Esfuerzo</text>
      <text x="15" y="155" font-size="9" text-anchor="middle" fill="#666" transform="rotate(-90 15 155)">→ Impacto</text>`;

  allPains.forEach((p, i) => {
    // Impacto = sev × frec / 25; esfuerzo por categoría / 5 (ambos 0..1)
    const { impacto: impact, esfuerzo: effort } = posicionImpactoEsfuerzo(p);
    const x = 40 + effort * 340;
    const y = 290 - impact * 270;
    html += `<circle cx="${x}" cy="${y}" r="${6 + impact * 8}" fill="#FF0054" opacity="0.7" stroke="#fff" stroke-width="1.5"/>
               <text x="${x}" y="${y + 3}" font-size="10" text-anchor="middle" fill="white" font-weight="700">${i + 1}</text>`;
  });

  html += '</svg><div style="margin-top:12px"><strong>Leyenda</strong><ol style="margin:4px 0;padding-left:20px;font-size:12px">';
  allPains.forEach(p => {
    html += `<li><strong>${escapeHtml(p.activity)}</strong>: ${escapeHtml(p.description)} <span style="color:#b2a5ff">(sev ${p.severity} · frec ${p.frequency})</span></li>`;
  });
  html += '</ol></div>';

  state._impactEffort = allPains;
  openModal('Matriz Impacto · Esfuerzo · ' + allPains.length + ' pains', html, () => {
    copilotPost('ai', `Matriz impacto-esfuerzo lista con ${allPains.length} oportunidades. Quick wins (alto impacto / bajo esfuerzo) = candidatos para fase 0-3 meses.`);
  });
}

export { generateImpactEffort };
