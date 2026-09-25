// Portado del MVP 3.8.9 (app.js) sin cambios de lógica — fase 1.
import { copilotPost } from '../copiloto/copiloto.js';
import { $ } from '../dom.js';
import { state } from '../estado.js';
import { autoLayout } from '../layout/auto-layout.js';
import { activateTab } from '../paneles/cajon.js';
import { openModal } from '../ui/modal.js';
import { setView } from './comparador.js';

// ============================================================
// TRANSFORMAR A TO-BE por nivel (Operativo / Táctico / Estratégico)
// Inspirado en MBC Process Disruptor: "Generar To-Be · Mantener Nivel"
// ============================================================
const TOBE_LEVELS = {
  operativo: {
    label: 'Operativo — Quick wins',
    desc: 'Automatiza tareas manuales repetitivas, elimina reprocesos. Cambios de bajo riesgo, 0-3 meses.'
  },
  tactico: {
    label: 'Táctico — Rediseño de flujo',
    desc: 'Elimina handoffs, paraleliza, consolida controles duplicados. 3-9 meses.'
  },
  estrategico: {
    label: 'Estratégico — Reimaginar',
    desc: 'Self-service digital, elimina pasos sin valor, repensar el proceso end-to-end. 9-18 meses.'
  }
};

function openTransformToBeModal() {
  const asisNodes = state.activeView === 'asis' ? state.nodes : (state._views.asis?.nodes || []);
  if (asisNodes.length === 0) { alert('Genera o dibuja un proceso As-Is primero.'); return; }
  const html = `
      <p class="panel-hint" style="margin-bottom:10px">ProcessIQ clona el As-Is y aplica palancas de reingeniería según el <strong>nivel</strong> elegido. Luego puedes editar manualmente el resultado.</p>
      <label style="display:block;margin-bottom:8px;font-size:12px;font-weight:600">Nivel de transformación
        <select id="tobeLevelSel" style="width:100%;padding:7px;border:1px solid #ddd;border-radius:6px;margin-top:3px">
          <option value="operativo">${TOBE_LEVELS.operativo.label}</option>
          <option value="tactico">${TOBE_LEVELS.tactico.label}</option>
          <option value="estrategico">${TOBE_LEVELS.estrategico.label}</option>
        </select>
      </label>
      <div id="tobeLevelDesc" class="field-hint info" style="margin-bottom:10px">${TOBE_LEVELS.operativo.desc}</div>
      <label style="display:block;font-size:12px;font-weight:600">Cambios específicos (opcional)
        <textarea id="tobeChanges" rows="3" placeholder="Ej. 'Eliminar la validación manual del paso 3', 'Añadir autoservicio en la captura'…" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;margin-top:3px;font-family:inherit"></textarea>
      </label>`;
  openModal('✨ Transformar a To-Be por nivel', html, () => {
    const level = $('#tobeLevelSel').value;
    const changes = $('#tobeChanges').value.trim();
    transformToBe(level, changes);
  });
  // Actualiza descripción al cambiar nivel
  setTimeout(() => {
    const sel = $('#tobeLevelSel');
    if (sel) sel.addEventListener('change', () => {
      $('#tobeLevelDesc').textContent = TOBE_LEVELS[sel.value].desc;
    });
  }, 50);
}

function transformToBe(level, changes) {
  // Asegura as-is guardado
  if (state.activeView === 'asis') {
    state._views.asis = { nodes: JSON.parse(JSON.stringify(state.nodes)), edges: JSON.parse(JSON.stringify(state.edges)) };
  }
  if (!state._views.asis) { alert('No hay As-Is que transformar.'); return; }

  // Clona profundo
  const tobe = JSON.parse(JSON.stringify(state._views.asis));
  const changeLog = [];

  if (level === 'operativo') {
    // Automatiza tareas manuales de alto volumen / repetitivas
    tobe.nodes.forEach(n => {
      if (n.type === 'task' && n.executionType === 'manual') {
        // Convierte a RPA/automático si parece rule-based (registrar, validar, calcular…)
        const lbl = (n.label || '').toLowerCase();
        if (/registr|ingres|valid|calcul|consult|verific|notific|envi|gener/.test(lbl)) {
          n.executionType = /notific|envi|correo/.test(lbl) ? 'automatic' : 'rpa';
          n.activityCode = '';  // se re-asignará
          changeLog.push(`Automatizada: "${n.label}" → ${n.executionType === 'rpa' ? 'RPA/Bot' : 'Service Task'}`);
        }
      }
    });
  } else if (level === 'tactico') {
    // Elimina handoffs: une tareas consecutivas del mismo responsable; convierte manuales en sistema
    const owners = {};
    tobe.nodes.forEach(n => { owners[n.id] = n.owner; });
    tobe.nodes.forEach(n => {
      if (n.type === 'task' && n.executionType === 'manual') {
        n.executionType = 'system';
        n.activityCode = '';
        changeLog.push(`Digitalizada: "${n.label}" → User Task (sistema)`);
      }
    });
    // Marca decisiones para codificar como reglas (DMN)
    tobe.nodes.filter(n => n.type === 'decision').forEach(d => {
      if (!/regla|dmn/i.test(d.notes || '')) {
        d.notes = (d.notes ? d.notes + ' ' : '') + '[To-Be: codificar como regla DMN]';
        changeLog.push(`Decisión "${d.label}" → regla codificada (DMN)`);
      }
    });
  } else if (level === 'estrategico') {
    // Self-service: marca tareas de captura/cliente como automáticas/IA; elimina algunos handoffs
    tobe.nodes.forEach(n => {
      if (n.type === 'task') {
        const lbl = (n.label || '').toLowerCase();
        if (/solicit|captur|ingres|registr|complet|llen/.test(lbl)) {
          n.executionType = 'automatic';
          n.activityCode = '';
          n.label = n.label.replace(/^(Solicitar|Capturar|Ingresar|Registrar|Completar|Llenar)/i, 'Autoservicio:');
          changeLog.push(`Self-service: "${n.label}"`);
        } else if (/valid|verific|evalu|analiz|diagnostic|scoring/.test(lbl)) {
          n.executionType = 'ai';
          n.activityCode = '';
          changeLog.push(`IA-assisted: "${n.label}" → Script/IA Task`);
        }
      }
    });
  }

  if (changes) changeLog.push(`Cambios manuales solicitados: ${changes}`);

  // Aplica el to-be
  state._views.tobe = tobe;
  setView('tobe');
  autoLayout();  // re-asigna códigos y layout

  activateTab('copilot');
  const lv = TOBE_LEVELS[level];
  copilotPost('ai',
    `**To-Be generado · nivel ${lv.label.split(' — ')[0]}**\n\n` +
    `${lv.desc}\n\n` +
    `**${changeLog.length} cambio(s) aplicado(s):**\n` +
    (changeLog.slice(0, 12).map(c => '• ' + c).join('\n') || '• Sin cambios automáticos — edita manualmente.') +
    (changeLog.length > 12 ? `\n• …y ${changeLog.length - 12} más.` : '') +
    `\n\nEdita manualmente cualquier nodo en Props. Exporta a PPTX para el comparativo As-Is vs To-Be.`);
}

export { openTransformToBeModal };
