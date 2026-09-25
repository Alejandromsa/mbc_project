// Validaciones del Playbook MBB (la pestaña "Validaciones"/Lint del MVP).
// Portado del MVP 3.8.9 (lintProcess) con los mismos textos y el mismo orden.
import { VERBS_ALLOWED, VERBS_FORBIDDEN } from './catalogos.js';
import type { Arista, Nodo } from './modelo.js';

export type Severidad = 'critical' | 'high' | 'medium' | 'low';

export interface Hallazgo {
  sev: Severidad;
  title: string;
  detail: string;
  /** Id del nodo afectado, si lo hay (clic en el hallazgo -> selecciona el nodo). */
  target?: string;
}

export const PESO_SEVERIDAD: Readonly<Record<Severidad, number>> = { critical: 4, high: 3, medium: 2, low: 1 };

export interface CatalogoVerbos {
  permitidos: readonly string[];
  prohibidos: Readonly<Record<string, string>>;
}

const CATALOGO: CatalogoVerbos = { permitidos: VERBS_ALLOWED, prohibidos: VERBS_FORBIDDEN };

export function validarProceso(
  nodes: readonly Nodo[], edges: readonly Arista[], catalogo: CatalogoVerbos = CATALOGO
): Hallazgo[] {
  const issues: Hallazgo[] = [];
  if (nodes.length === 0) return issues;
  const allowed = catalogo.permitidos;
  const forbidden = catalogo.prohibidos;

  const inDeg: Record<string, number> = {}, outDeg: Record<string, number> = {};
  edges.forEach((e) => {
    outDeg[e.from] = (outDeg[e.from] || 0) + 1;
    inDeg[e.to] = (inDeg[e.to] || 0) + 1;
  });

  const starts = nodes.filter((n) => n.type === 'start');
  const ends = nodes.filter((n) => n.type === 'end');

  // R1: al menos 1 inicio
  if (starts.length === 0) issues.push({ sev: 'critical', title: 'Falta evento Start', detail: 'Todo proceso debe iniciar en un evento "Inicio".' });
  // R2: al menos 1 fin
  if (ends.length === 0) issues.push({ sev: 'critical', title: 'Falta evento End', detail: 'Todo proceso debe cerrar en al menos un "Fin".' });
  // R3: fin genérico
  ends.forEach((n) => {
    const lower = (n.label || '').toLowerCase().trim();
    if (!lower || lower === 'fin' || lower === 'final' || lower === 'fin del proceso') {
      issues.push({ sev: 'medium', title: 'End event genérico', detail: 'Cada "Fin" debe describir un outcome distinto (ej. "Crédito aprobado", "Solicitud rechazada").', target: n.id });
    }
  });

  nodes.forEach((n) => {
    const label = (n.label || '').trim();
    const lower = label.toLowerCase();
    const firstWord = (lower.split(/\s+/)[0] ?? '').replace(/[^a-záéíóúñ]/g, '');

    // R4: nodo sin etiqueta
    if (!label) issues.push({ sev: 'high', title: 'Nodo sin etiqueta', detail: 'Asigna un nombre descriptivo al nodo.', target: n.id });

    if (n.type === 'task' || n.type === 'system') {
      // R5: verbo prohibido
      if (firstWord && forbidden[firstWord]) {
        issues.push({ sev: 'medium', title: `Verbo prohibido: "${firstWord}"`, detail: forbidden[firstWord]!, target: n.id });
      } else if (firstWord && !allowed.some((a) => firstWord.startsWith(a))) {
        // R6: verbo fuera de catálogo (aviso bajo)
        issues.push({ sev: 'low', title: `Verbo fuera de catálogo: "${firstWord}"`, detail: 'Considera un verbo del catálogo MBB (registrar, validar, aprobar…).', target: n.id });
      }

      // R7: etiqueta demasiado larga
      const words = label.split(/\s+/).length;
      if (label.length > 50 || words > 8) {
        issues.push({ sev: 'medium', title: 'Etiqueta demasiado larga', detail: `"${label}" tiene ${label.length} car / ${words} pal. Máx 50/8 → considera descomponer.`, target: n.id });
      }

      // R8: sin responsable
      if (!n.owner) issues.push({ sev: 'high', title: 'Actividad sin responsable', detail: `"${label}" debe tener un rol asignado.`, target: n.id });

      // R9: sin tipo de ejecución
      if (!n.executionType) issues.push({ sev: 'high', title: 'Actividad sin tipo de ejecución', detail: `Asigna manual/sistema/automático/IA/etc. a "${label}".`, target: n.id });

      // R10: manual de más de 2 horas
      if (n.executionType === 'manual' && parseFloat(n.time ?? '') > 120) {
        issues.push({ sev: 'low', title: 'Actividad manual >120 min', detail: `"${label}" es manual y dura más de 2 horas — considera descomponer.`, target: n.id });
      }

      // R11: automática con responsable humano
      if (n.executionType === 'automatic' && n.owner && !/sistema|bot|auto/i.test(n.owner)) {
        issues.push({ sev: 'low', title: 'Automático con responsable humano', detail: `"${label}" es automática pero tiene responsable "${n.owner}". ¿Es correcto?`, target: n.id });
      }
    }

    // R12: compuerta sin pregunta
    if (n.type === 'decision') {
      if (label && !label.startsWith('¿') && !label.endsWith('?')) {
        issues.push({ sev: 'medium', title: 'Gateway sin pregunta', detail: `"${label}" debe formularse como pregunta cerrada (¿Sí/No?) o ramificación (¿Qué tipo?).`, target: n.id });
      }
    }

    // R13: nodos sin entrada o sin salida
    if (n.type !== 'start' && (inDeg[n.id] || 0) === 0) {
      issues.push({ sev: 'critical', title: 'Nodo sin entrada', detail: `"${label || n.id}" no tiene conexión entrante. Conecta o elimina.`, target: n.id });
    }
    if (n.type !== 'end' && (outDeg[n.id] || 0) === 0) {
      issues.push({ sev: 'critical', title: 'Nodo sin salida', detail: `"${label || n.id}" no tiene conexión saliente. Conecta o márcalo como Fin.`, target: n.id });
    }
  });

  // R14: salidas de compuerta sin etiquetar o demasiadas
  nodes.filter((n) => n.type === 'decision').forEach((g) => {
    const out = edges.filter((e) => e.from === g.id);
    if (out.length >= 2) {
      const unlabeled = out.filter((e) => !e.label || !e.label.trim()).length;
      if (unlabeled > 0) issues.push({ sev: 'medium', title: `Gateway con ${unlabeled} salida(s) sin etiquetar`, detail: `"${g.label}" — etiqueta cada salida (Sí/No o valor específico).`, target: g.id });
    }
    if (out.length > 4) issues.push({ sev: 'low', title: 'Gateway con >4 salidas', detail: `"${g.label}" tiene ${out.length} salidas. Considera descomponer o usar subproceso.`, target: g.id });
  });

  // R15: tamaño del proceso
  if (nodes.length > 15) {
    issues.push({ sev: 'low', title: `Proceso con ${nodes.length} nodos`, detail: 'Más de 15 nodos visibles → considera extraer secciones a subprocesos.' });
  }
  if (nodes.length < 3) {
    issues.push({ sev: 'low', title: 'Proceso muy simple', detail: 'Menos de 3 nodos. ¿Falta detalle?' });
  }

  // R16: demasiados roles
  const roles = [...new Set(nodes.map((n) => n.owner).filter(Boolean))];
  if (roles.length > 6) {
    issues.push({ sev: 'low', title: `${roles.length} roles distintos`, detail: 'Considera agrupar roles o dividir el proceso para mejorar claridad.' });
  }

  return issues;
}
