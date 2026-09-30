// Portado del MVP 3.8.9 (app.js) sin cambios de lógica — fase 1.
import { PESO_SEVERIDAD, validarProceso } from '@processiq/dominio';
import { $ } from '../dom.js';
import { state } from '../estado.js';
import { traducirDe, tr } from '../i18n.js';
import { render } from '../lienzo/render.js';
import { activateTab } from '../paneles/cajon.js';
import { LINT_EN } from '../textos/en.js';
import { escapeHtml } from '../util.js';

// ============================================================
// LINTER MBB — validaciones automáticas del playbook
// ============================================================
const SEV = PESO_SEVERIDAD;

// Reglas del Playbook MBB: @processiq/dominio (validarProceso).
function lintProcess() {
  return validarProceso(state.nodes, state.edges);
}

function runLinter() {
  const issues = lintProcess();
  renderLintPanel(issues);
  const critHigh = issues.filter(i => i.sev === 'critical' || i.sev === 'high').length;
  const badge = $('#lintBadge');
  if (!badge) return;
  if (issues.length === 0) {
    badge.hidden = true;
    badge.textContent = '';
  } else {
    badge.hidden = false;
    badge.textContent = issues.length;
    badge.style.background = critHigh > 0 ? 'var(--danger)' : 'var(--warning)';
  }
}

function renderLintPanel(issues) {
  const list = $('#lintList');
  const score = $('#lintScore');
  if (!list || !score) return;

  if (state.nodes.length === 0) {
    list.innerHTML = '<div class="panel-hint">' + tr('lint.vacio') + '</div>';
    score.innerHTML = '';
    return;
  }

  if (issues.length === 0) {
    list.innerHTML = '<div class="lint-empty">' + tr('lint.cero') + '</div>';
    score.className = 'lint-score good';
    score.innerHTML = '<div><div class="score-num">100</div><div class="score-detail">' + tr('lint.scoreSin') + '</div></div>';
    return;
  }

  // Score: 100 - 15*crit - 8*high - 3*medium - 1*low (mín 0)
  const c = { critical: 0, high: 0, medium: 0, low: 0 };
  issues.forEach(i => c[i.sev]++);
  const scoreVal = Math.max(0, 100 - 15 * c.critical - 8 * c.high - 3 * c.medium - 1 * c.low);
  const cls = scoreVal >= 80 ? 'good' : (scoreVal >= 50 ? 'warn' : 'bad');
  score.className = 'lint-score ' + cls;
  score.innerHTML = `
      <div><div class="score-num">${scoreVal}</div><div class="score-detail">${tr('lint.score')}</div></div>
      <div style="flex:1;text-align:right">
        <div style="display:flex;gap:6px;justify-content:flex-end;margin-bottom:3px">
          ${c.critical ? `<span class="sev-tag sev-critical">${tr('lint.crit', { n: c.critical })}</span>` : ''}
          ${c.high ? `<span class="sev-tag sev-high">${tr('lint.alto', { n: c.high })}</span>` : ''}
          ${c.medium ? `<span class="sev-tag sev-medium">${tr('lint.medio', { n: c.medium })}</span>` : ''}
          ${c.low ? `<span class="sev-tag sev-low">${tr('lint.bajo', { n: c.low })}</span>` : ''}
        </div>
        <div class="score-detail">${tr(issues.length === 1 ? 'lint.detectado' : 'lint.detectados', { n: issues.length })}</div>
      </div>`;

  // Ordena por severidad
  const sevOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  const sorted = issues.slice().sort((a, b) => sevOrder[a.sev] - sevOrder[b.sev]);
  const icons = { critical: '✕', high: '!', medium: '⚠', low: 'ⓘ' };

  list.innerHTML = sorted.map(i => `
      <div class="lint-item sev-${i.sev}" data-target="${i.target || ''}">
        <div class="lint-icon">${icons[i.sev]}</div>
        <div class="lint-body">
          <div class="lint-title">${escapeHtml(traducirDe(LINT_EN, i.title))}</div>
          <div class="lint-detail">${escapeHtml(traducirDe(LINT_EN, i.detail))}</div>
          ${i.target ? '<div class="lint-target">' + tr('lint.irAlNodo') + '</div>' : ''}
        </div>
      </div>`).join('');

  list.querySelectorAll('.lint-item[data-target]').forEach(el => {
    const tid = el.dataset.target;
    if (!tid) return;
    el.addEventListener('click', () => {
      state.selectedNodeId = tid;
      state.selectedEdgeId = null;
      activateTab('properties');
      render();
    });
  });
}

export { lintProcess, runLinter };
