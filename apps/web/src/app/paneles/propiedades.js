// Portado del MVP 3.8.9 (app.js) sin cambios de lógica — fase 1.
import { $ } from '../dom.js';
import { SHAPE_DEFAULTS, state } from '../estado.js';
import { autoLayout } from '../layout/auto-layout.js';
import { ayudaEjecucion, tr } from '../i18n.js';
import { getNode } from '../lienzo/interaccion.js';
import { render } from '../lienzo/render.js';
import { persist } from '../persistencia.js';
import { runLinter } from '../validacion/lint.js';

// =================== PROPERTIES PANEL ===================
function attachPropertyListeners() {
  const fields = [
    ['Label', 'label'],
    ['ExecType', 'executionType'],
    ['Owner', 'owner'],
    ['System', 'system'],
    ['Time', 'time'],
    ['Volume', 'volume'],
    ['VA', 'va'],
    ['Sla', 'sla'],
    ['DocsIn', 'docsIn'],
    ['DocsOut', 'docsOut'],
    ['Rules', 'rules'],
    ['Notes', 'notes']
  ];
  fields.forEach(([id, key]) => {
    const el = $('#prop' + id);
    if (!el) return;
    el.addEventListener('input', () => {
      const n = getNode(state.selectedNodeId);
      if (!n) return;
      n[key] = el.value;
      if (id === 'Label')    showLabelHint(el.value);
      if (id === 'ExecType') {
        showExecHint(el.value);
        // Re-asigna código si cambia el tipo de tarea (prefijo nuevo)
        const exec = (window.EXECUTION_TYPES || []).find(t => t.id === el.value);
        if (exec && n.activityCode) {
          const numMatch = n.activityCode.match(/-(\d+)$/);
          const num = numMatch ? numMatch[1] : '01';
          n.activityCode = exec.codePrefix + '-' + num;
          $('#propActivityCode').value = n.activityCode;
        }
      }
      persist();
      render();
      runLinter();
    });
  });

  // Edición manual del código de actividad
  const codeEl = $('#propActivityCode');
  if (codeEl) {
    codeEl.addEventListener('input', () => {
      const n = getNode(state.selectedNodeId);
      if (!n) return;
      n.activityCode = codeEl.value.trim().toUpperCase().replace(/[\[\]]/g, '');
      persist();
      render();
    });
  }

  // Edición manual del tipo de bloque BPMN (start/task/decision/…)
  const typeEl = $('#propNodeType');
  if (typeEl) {
    typeEl.addEventListener('change', () => {
      const n = getNode(state.selectedNodeId);
      if (!n) return;
      const newType = typeEl.value;
      const def = SHAPE_DEFAULTS[newType];
      n.type = newType;
      // Ajusta tamaño al nuevo tipo (preserva posición del centro)
      if (def) {
        const cx = n.x + n.w / 2, cy = n.y + n.h / 2;
        n.w = def.w; n.h = def.h;
        n.x = cx - n.w / 2; n.y = cy - n.h / 2;
      }
      // Si pasa a evento, limpia tipo de ejecución y código
      if (newType === 'start' || newType === 'end' || newType === 'decision' || newType === 'intermediate') {
        n.executionType = ''; n.activityCode = '';
      } else if (!n.executionType) {
        n.executionType = newType === 'system' ? 'system' : 'manual';
      }
      // Limpia eventType si deja de ser evento
      if (newType !== 'start' && newType !== 'end' && newType !== 'intermediate') {
        n.eventType = '';
      } else if (!n.eventType) {
        n.eventType = 'none';
      }
      persist();
      renderProperties();
      render();
      runLinter();
    });
  }

  // Tipo de gateway BPMN (exclusivo/paralelo/inclusivo)
  const gwEl = $('#propGatewayType');
  if (gwEl) {
    gwEl.addEventListener('change', () => {
      const n = getNode(state.selectedNodeId);
      if (!n) return;
      n.gatewayType = gwEl.value;
      persist();
      autoLayout();   // re-evalúa ramas (paralelo no fuerza Sí/No)
    });
  }

  // Tipo de evento BPMN (mensaje/timer/error/señal) para start/end/intermediate
  const evEl = $('#propEventType');
  if (evEl) {
    evEl.addEventListener('change', () => {
      const n = getNode(state.selectedNodeId);
      if (!n) return;
      n.eventType = evEl.value === 'none' ? '' : evEl.value;
      persist();
      render();
    });
  }

  // Marcador de actividad BPMN (subproceso/loop/multi-instancia) para tareas
  const mkEl = $('#propMarker');
  if (mkEl) {
    mkEl.addEventListener('change', () => {
      const n = getNode(state.selectedNodeId);
      if (!n) return;
      n.marker = mkEl.value === 'none' ? '' : mkEl.value;
      persist();
      render();
    });
  }

  // Evento de borde BPMN (boundary) para tareas: "tipo|interrumpe"
  const bdEl = $('#propBoundary');
  if (bdEl) {
    bdEl.addEventListener('change', () => {
      const n = getNode(state.selectedNodeId);
      if (!n) return;
      if (bdEl.value === 'none') {
        n.boundary = undefined;
      } else {
        const [type, interr] = bdEl.value.split('|');
        n.boundary = { type, interrupting: interr === 'true' };
      }
      persist();
      render();
    });
  }

  // Evento de terminación BPMN (solo para fin)
  const termEl = $('#propTerminate');
  if (termEl) {
    termEl.addEventListener('change', () => {
      const n = getNode(state.selectedNodeId);
      if (!n) return;
      n.terminate = termEl.checked || undefined;
      persist();
      render();
    });
  }
}

function showLabelHint(value) {
  const hint = $('#propLabelHint');
  if (!hint) return;
  const v = (value || '').trim();
  if (!v) { hint.hidden = true; return; }

  const lower = v.toLowerCase();
  const firstWord = lower.split(/\s+/)[0].replace(/[^a-záéíóúñ]/g, '');

  // Verbo prohibido?
  const forbidden = window.VERBS_FORBIDDEN || {};
  if (forbidden[firstWord]) {
    hint.hidden = false;
    hint.className = 'field-hint error';
    hint.textContent = `"${firstWord}" → ${forbidden[firstWord]}`;
    return;
  }

  // Verbo permitido?
  const allowed = window.VERBS_ALLOWED || [];
  const isAllowed = allowed.some(a => firstWord.startsWith(a));

  // Longitud
  const words = v.split(/\s+/).length;
  if (v.length > 50 || words > 8) {
    hint.hidden = false;
    hint.className = 'field-hint warn';
    hint.textContent = tr('props.larga', { car: v.length, pal: words });
    return;
  }

  if (!isAllowed) {
    hint.hidden = false;
    hint.className = 'field-hint warn';
    hint.textContent = tr('props.fueraCatalogo', { verbo: firstWord });
    return;
  }

  hint.hidden = false;
  hint.className = 'field-hint ok';
  hint.textContent = tr('props.namingOk');
}

function showExecHint(value) {
  const hint = $('#propExecHint');
  if (!hint) return;
  if (!value) { hint.hidden = true; return; }
  const t = (window.EXECUTION_TYPES || []).find(x => x.id === value);
  if (!t) { hint.hidden = true; return; }
  hint.hidden = false;
  hint.className = 'field-hint info';
  hint.textContent = ayudaEjecucion(t);
}

function renderProperties() {
  const n = getNode(state.selectedNodeId);
  if (!n) {
    $('#propsEmpty').hidden = false;
    $('#propsForm').hidden = true;
    return;
  }
  $('#propsEmpty').hidden = true;
  $('#propsForm').hidden = false;
  if ($('#propNodeType')) $('#propNodeType').value = n.type || 'task';
  // Muestra el selector de gateway solo para decisiones
  if ($('#propGatewayWrap')) {
    $('#propGatewayWrap').hidden = n.type !== 'decision';
    if (n.type === 'decision' && $('#propGatewayType')) $('#propGatewayType').value = n.gatewayType || 'exclusive';
  }
  // Muestra el selector de evento solo para start/end/intermediate
  if ($('#propEventWrap')) {
    const isEvent = n.type === 'start' || n.type === 'end' || n.type === 'intermediate';
    $('#propEventWrap').hidden = !isEvent;
    if (isEvent && $('#propEventType')) $('#propEventType').value = n.eventType || 'none';
  }
  // Checkbox de terminación solo para eventos de fin
  if ($('#propTerminateWrap')) {
    $('#propTerminateWrap').hidden = n.type !== 'end';
    if (n.type === 'end' && $('#propTerminate')) $('#propTerminate').checked = !!n.terminate;
  }
  // Muestra el selector de marcador de actividad solo para tareas
  if ($('#propMarkerWrap')) {
    const isTaskType = n.type === 'task' || n.type === 'system';
    $('#propMarkerWrap').hidden = !isTaskType;
    if (isTaskType && $('#propMarker')) $('#propMarker').value = n.marker || 'none';
  }
  // Selector de evento de borde (boundary) solo para tareas
  if ($('#propBoundaryWrap')) {
    const isTaskType = n.type === 'task' || n.type === 'system';
    $('#propBoundaryWrap').hidden = !isTaskType;
    if (isTaskType && $('#propBoundary')) {
      const b = n.boundary;
      $('#propBoundary').value = b ? `${(typeof b === 'string' ? b : b.type)}|${(typeof b === 'object' ? b.interrupting !== false : true)}` : 'none';
    }
  }
  if ($('#propActivityCode')) $('#propActivityCode').value = n.activityCode || '';
  $('#propLabel').value = n.label || '';
  $('#propExecType').value = n.executionType || '';
  $('#propOwner').value = n.owner || '';
  $('#propSystem').value = n.system || '';
  $('#propTime').value = n.time || '';
  $('#propVolume').value = n.volume || '';
  $('#propVA').value = n.va || '';
  $('#propSla').value = n.sla || '';
  $('#propDocsIn').value = n.docsIn || '';
  $('#propDocsOut').value = n.docsOut || '';
  $('#propRules').value = n.rules || '';
  $('#propNotes').value = n.notes || '';
  showLabelHint(n.label || '');
  showExecHint(n.executionType || '');
}

export { attachPropertyListeners, renderProperties };
