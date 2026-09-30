// Portado del MVP 3.8.9 (app.js) sin cambios de lógica — fase 1.
import { SHAPE_DEFAULTS, state } from '../estado.js';
import { tr } from '../i18n.js';
import { autoLayout } from '../layout/auto-layout.js';
import { render } from '../lienzo/render.js';
import { persist } from '../persistencia.js';
import { ensureDecisionBranches } from '../proceso/operaciones.js';

// F7 — Edición por lenguaje natural. Interpreta comandos y los aplica al diagrama.
// Devuelve un string de confirmación, o null si no es un comando de edición.
function tryNlCommand(prompt) {
  const p = prompt.trim();
  const low = p.toLowerCase();
  // Busca nodo por coincidencia de etiqueta (substring, case-insensitive)
  const findNode = (q) => {
    if (!q) return null;
    const ql = q.toLowerCase().trim().replace(/^["']|["']$/g, '');
    // exacto primero, luego substring
    return state.nodes.find(n => (n.label || '').toLowerCase() === ql) ||
           state.nodes.find(n => (n.label || '').toLowerCase().includes(ql)) ||
           state.nodes.find(n => ql.includes((n.label || '').toLowerCase()) && n.label);
  };
  const clean = (s) => s.replace(/^["']|["']$/g, '').replace(/^(el |la |paso |actividad |tarea |la actividad |el paso )/i, '').trim();

  // 1) Agregar/insertar X después/antes de Y
  let m = low.match(/^(?:agregar|añadir|anadir|insertar|crear)\s+(?:paso|actividad|tarea)?\s*(.+?)\s+(despu[eé]s|antes)\s+de\s+(.+)$/i);
  if (m) {
    const after = m[2].startsWith('desp');
    const ref = findNode(m[3]);
    if (!ref) return tr('comando.noActividad', { nombre: clean(m[3]) });
    const def = SHAPE_DEFAULTS.task;
    const node = { id: 'n' + (state.nextId++), type: 'task', x: ref.x, y: ref.y, w: def.w, h: def.h,
      label: titleCaseFirst(clean(m[1])), executionType: 'manual', activityCode: '',
      owner: ref.owner || '', system: '', time: '', volume: '', va: '', sla: '', docsIn: '', docsOut: '', rules: '', notes: '', pains: [] };
    state.nodes.push(node);
    if (after) {
      // Redirige las salidas de ref hacia el nuevo nodo
      const outs = state.edges.filter(e => e.from === ref.id);
      outs.forEach(e => { e.from = node.id; });
      state.edges.push({ id: 'e' + (state.nextId++), from: ref.id, to: node.id, label: '' });
    } else {
      const ins = state.edges.filter(e => e.to === ref.id);
      ins.forEach(e => { e.to = node.id; });
      state.edges.push({ id: 'e' + (state.nextId++), from: node.id, to: ref.id, label: '' });
    }
    ensureDecisionBranches(); persist(); autoLayout();
    return tr(after ? 'comando.agregadoDespues' : 'comando.agregadoAntes', { nuevo: node.label, ref: ref.label });
  }

  // 2) Eliminar / borrar / quitar X
  m = low.match(/^(?:eliminar|borrar|quitar|remover)\s+(?:el |la |paso |actividad |tarea )?(.+)$/i);
  if (m) {
    const ref = findNode(m[1]);
    if (!ref) return tr('comando.noEliminar', { nombre: clean(m[1]) });
    // Reconecta: predecesores → sucesores
    const preds = state.edges.filter(e => e.to === ref.id).map(e => e.from);
    const succs = state.edges.filter(e => e.from === ref.id).map(e => e.to);
    state.edges = state.edges.filter(e => e.from !== ref.id && e.to !== ref.id);
    preds.forEach(pr => succs.forEach(su => {
      if (!state.edges.some(e => e.from === pr && e.to === su)) state.edges.push({ id: 'e' + (state.nextId++), from: pr, to: su, label: '' });
    }));
    state.nodes = state.nodes.filter(n => n.id !== ref.id);
    persist(); autoLayout();
    return tr('comando.eliminado', { nombre: ref.label });
  }

  // 3) Renombrar / cambiar X a/por Y
  m = low.match(/^(?:renombrar|renombra|cambiar|cambia)\s+(.+?)\s+(?:a|por)\s+(.+)$/i);
  if (m) {
    const ref = findNode(m[1]);
    if (!ref) return tr('comando.noRenombrar', { nombre: clean(m[1]) });
    const oldL = ref.label;
    ref.label = titleCaseFirst(clean(m[2]));
    persist(); render();
    return tr('comando.renombrado', { antes: oldL, ahora: ref.label });
  }

  // 4) Conectar X con/a Y
  m = low.match(/^(?:conectar|conecta|une|unir)\s+(.+?)\s+(?:con|a|hacia|y)\s+(.+)$/i);
  if (m) {
    const a = findNode(m[1]), b = findNode(m[2]);
    if (!a || !b) return tr('comando.noEncontre', { nombre: !a ? clean(m[1]) : clean(m[2]) });
    if (!state.edges.some(e => e.from === a.id && e.to === b.id)) {
      state.edges.push({ id: 'e' + (state.nextId++), from: a.id, to: b.id, label: '' });
      persist(); autoLayout();
      return tr('comando.conectado', { a: a.label, b: b.label });
    }
    return tr('comando.yaExiste');
  }

  // 5) Marcar X como [tipo de ejecución]
  m = low.match(/^(?:marcar|marca|cambiar tipo de|poner)\s+(.+?)\s+como\s+(autom[aá]tic[oa]|manual|sistema|rpa|bot|ia|correo|email|tel[eé]fono|documental)/i);
  if (m) {
    const ref = findNode(m[1]);
    if (!ref) return tr('comando.noEncontre', { nombre: clean(m[1]) });
    const map = { 'automatico':'automatic','manual':'manual','sistema':'system','rpa':'rpa','bot':'rpa','ia':'ai','correo':'email','email':'email','telefono':'phone','documental':'document' };
    // Normaliza acentos para el lookup (automático → automatico)
    const key = m[2].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const exec = map[key] || 'manual';
    ref.executionType = exec; ref.activityCode = '';
    ensureDecisionBranches(); persist(); autoLayout();
    const t = (window.EXECUTION_TYPES || []).find(x => x.id === exec);
    return tr('comando.marcada', { nombre: ref.label, tipo: t ? t.bpmn : exec });
  }

  return null; // no es un comando de edición
}

function titleCaseFirst(s) { s = (s || '').trim(); return s.charAt(0).toUpperCase() + s.slice(1); }

export { tryNlCommand };
