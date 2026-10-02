// Portado del MVP 3.8.9 (app.js) sin cambios de lógica — fase 1.
// Ola 5: con el editor en inglés entiende además las mismas órdenes en inglés
// (ORDENES_EN, abajo). Las órdenes en español y lo que hacen son las del MVP: las
// acciones se sacaron a funciones tal cual, para que las usen las dos lenguas.
import { SHAPE_DEFAULTS, state } from '../estado.js';
import { enIngles, tr } from '../i18n.js';
import { autoLayout } from '../layout/auto-layout.js';
import { render } from '../lienzo/render.js';
import { persist } from '../persistencia.js';
import { ensureDecisionBranches } from '../proceso/operaciones.js';

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

// F7 — Edición por lenguaje natural. Interpreta comandos y los aplica al diagrama.
// Devuelve un string de confirmación, o null si no es un comando de edición.
// Con el editor en inglés prueba primero las órdenes en inglés y después las de
// siempre, así que entiende las dos lenguas; en español, solo las de siempre.
// Las respuestas salen en el idioma del editor (tr).
function tryNlCommand(prompt) {
  const p = prompt.trim();
  const low = p.toLowerCase();

  if (enIngles()) {
    const r = ordenEnIngles(p);
    if (r !== null) return r;
  }

  // 1) Agregar/insertar X después/antes de Y
  let m = low.match(/^(?:agregar|añadir|anadir|insertar|crear)\s+(?:paso|actividad|tarea)?\s*(.+?)\s+(despu[eé]s|antes)\s+de\s+(.+)$/i);
  if (m) {
    const after = m[2].startsWith('desp');
    const ref = findNode(m[3]);
    if (!ref) return tr('comando.noActividad', { nombre: clean(m[3]) });
    return agregar(ref, titleCaseFirst(clean(m[1])), after);
  }

  // 2) Eliminar / borrar / quitar X
  m = low.match(/^(?:eliminar|borrar|quitar|remover)\s+(?:el |la |paso |actividad |tarea )?(.+)$/i);
  if (m) {
    const ref = findNode(m[1]);
    if (!ref) return tr('comando.noEliminar', { nombre: clean(m[1]) });
    return eliminar(ref);
  }

  // 3) Renombrar / cambiar X a/por Y
  m = low.match(/^(?:renombrar|renombra|cambiar|cambia)\s+(.+?)\s+(?:a|por)\s+(.+)$/i);
  if (m) {
    const ref = findNode(m[1]);
    if (!ref) return tr('comando.noRenombrar', { nombre: clean(m[1]) });
    return renombrar(ref, titleCaseFirst(clean(m[2])));
  }

  // 4) Conectar X con/a Y
  m = low.match(/^(?:conectar|conecta|une|unir)\s+(.+?)\s+(?:con|a|hacia|y)\s+(.+)$/i);
  if (m) {
    const a = findNode(m[1]), b = findNode(m[2]);
    if (!a || !b) return tr('comando.noEncontre', { nombre: !a ? clean(m[1]) : clean(m[2]) });
    return conectar(a, b);
  }

  // 5) Marcar X como [tipo de ejecución]
  m = low.match(/^(?:marcar|marca|cambiar tipo de|poner)\s+(.+?)\s+como\s+(autom[aá]tic[oa]|manual|sistema|rpa|bot|ia|correo|email|tel[eé]fono|documental)/i);
  if (m) {
    const ref = findNode(m[1]);
    if (!ref) return tr('comando.noEncontre', { nombre: clean(m[1]) });
    const map = { 'automatico':'automatic','manual':'manual','sistema':'system','rpa':'rpa','bot':'rpa','ia':'ai','correo':'email','email':'email','telefono':'phone','documental':'document' };
    // Normaliza acentos para el lookup (automático → automatico)
    const key = m[2].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    return marcar(ref, map[key] || 'manual');
  }

  return null; // no es un comando de edición
}

// =================== Acciones (las mismas en las dos lenguas) ===================

/** Agrega la tarea `etiqueta` después (o antes) de `ref` y reencamina el flujo. */
function agregar(ref, etiqueta, after) {
  const def = SHAPE_DEFAULTS.task;
  const node = { id: 'n' + (state.nextId++), type: 'task', x: ref.x, y: ref.y, w: def.w, h: def.h,
    label: etiqueta, executionType: 'manual', activityCode: '',
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

/** Elimina `ref` y reconecta sus predecesores con sus sucesores. */
function eliminar(ref) {
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

function renombrar(ref, etiqueta) {
  const oldL = ref.label;
  ref.label = etiqueta;
  persist(); render();
  return tr('comando.renombrado', { antes: oldL, ahora: ref.label });
}

function conectar(a, b) {
  if (!state.edges.some(e => e.from === a.id && e.to === b.id)) {
    state.edges.push({ id: 'e' + (state.nextId++), from: a.id, to: b.id, label: '' });
    persist(); autoLayout();
    return tr('comando.conectado', { a: a.label, b: b.label });
  }
  return tr('comando.yaExiste');
}

/** `exec` es el id del tipo de ejecución (EXECUTION_TYPES). */
function marcar(ref, exec) {
  ref.executionType = exec; ref.activityCode = '';
  ensureDecisionBranches(); persist(); autoLayout();
  const t = (window.EXECUTION_TYPES || []).find(x => x.id === exec);
  return tr('comando.marcada', { nombre: ref.label, tipo: t ? t.bpmn : exec });
}

// =================== Órdenes en inglés (solo con el editor en inglés) ===================
// Las cinco órdenes de arriba, con sus mismas acciones y respuestas. Los nombres de los
// elementos no se traducen: se buscan igual (findNode, sin distinguir mayúsculas) y los
// nuevos se escriben tal cual, solo con la primera letra en mayúscula como en español
// (que, como el MVP, pasa el resto a minúsculas).
const COMILLAS = /^["'“”‘’]|["'“”‘’]$/g;
/** El nombre sin comillas ni «the / step / activity / task» delante. */
const limpiarEn = (s) => s.trim().replace(COMILLAS, '').replace(/^(?:the\s+)?(?:(?:step|activity|task)\s+)?/i, '').trim();

const ORDENES_EN = {
  // add|insert|create [a|an|the] [new] [step|activity|task] X after|before Y
  agregar: /^(?:add|insert|create)\s+(?:(?:a|an|the)\s+)?(?:new\s+)?(?:(?:step|activity|task)\s+)?(.+?)\s+(after|before)\s+(.+)$/i,
  // delete|remove|erase X
  eliminar: /^(?:delete|remove|erase)\s+(.+)$/i,
  // rename|change|replace X to|as|into|with Y; change the name of X to Y
  renombrar: /^(?:rename|change\s+(?:the\s+)?name\s+of|change|replace)\s+(.+?)\s+(?:to|as|into|with)\s+(.+)$/i,
  // connect|link|join X to|with|and|towards Y
  conectar: /^(?:connect|link|join)\s+(.+?)\s+(?:to|with|and|towards)\s+(.+)$/i,
  // mark|set|flag X as|to <tipo>; change|set the type of X to <tipo>
  marcar: /^(?:(?:change|set)\s+(?:the\s+)?(?:execution\s+)?type\s+of|mark|set|flag)\s+(.+?)\s+(?:as|to)\s+(?:an?\s+)?(automatic|automated|manual|system|rpa|bot|ai|e-?mail|phone|telephone|document)\b/i
};
// Palabra del tipo de ejecución -> id de EXECUTION_TYPES (los mismos que en español)
const EJECUCION_EN = {
  automatic: 'automatic', automated: 'automatic', manual: 'manual', system: 'system', rpa: 'rpa', bot: 'rpa',
  ai: 'ai', email: 'email', 'e-mail': 'email', phone: 'phone', telephone: 'phone', document: 'document'
};
// No son órdenes de editar elementos, aunque empiecen igual: «change the owner of X to
// Ana» no renombra X, y «remove the connection between A and B» no borra A (el español
// del MVP sí lo hace: «cambia el responsable de X a Ana» renombra X).
const OTRO_CAMPO = /^(?:the\s+)?(?:owner|responsible|role|lane|system|(?:execution\s+)?type|time|duration|volume|sla|code|notes?|description)\s+of\s/i;
const CONEXION = /^(?:the\s+)?(?:connection|link|arrow|edge|flow|line)s?\s+(?:between|from)\s/i;

/** La orden en inglés aplicada, o null si no es una. */
function ordenEnIngles(p) {
  let m = p.match(ORDENES_EN.agregar);
  if (m) {
    const ref = findNode(limpiarEn(m[3]));
    if (!ref) return tr('comando.noActividad', { nombre: limpiarEn(m[3]) });
    return agregar(ref, titleCaseFirst(limpiarEn(m[1])), m[2].toLowerCase() === 'after');
  }

  m = p.match(ORDENES_EN.eliminar);
  if (m && !CONEXION.test(m[1])) {
    const ref = findNode(limpiarEn(m[1]));
    if (!ref) return tr('comando.noEliminar', { nombre: limpiarEn(m[1]) });
    return eliminar(ref);
  }

  m = p.match(ORDENES_EN.renombrar);
  if (m && !OTRO_CAMPO.test(m[1])) {
    const ref = findNode(limpiarEn(m[1]));
    if (!ref) return tr('comando.noRenombrar', { nombre: limpiarEn(m[1]) });
    return renombrar(ref, titleCaseFirst(limpiarEn(m[2])));
  }

  m = p.match(ORDENES_EN.conectar);
  if (m) {
    const a = findNode(limpiarEn(m[1])), b = findNode(limpiarEn(m[2]));
    if (!a || !b) return tr('comando.noEncontre', { nombre: limpiarEn(!a ? m[1] : m[2]) });
    return conectar(a, b);
  }

  m = p.match(ORDENES_EN.marcar);
  if (m) {
    const ref = findNode(limpiarEn(m[1]));
    if (!ref) return tr('comando.noEncontre', { nombre: limpiarEn(m[1]) });
    return marcar(ref, EJECUCION_EN[m[2].toLowerCase()]);
  }

  return null;
}

function titleCaseFirst(s) { s = (s || '').trim(); return s.charAt(0).toUpperCase() + s.slice(1); }

export { tryNlCommand };
