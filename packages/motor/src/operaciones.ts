// Operaciones sobre el grafo del proceso. Trabajan sobre los arrays que reciben
// (los modifican) y devuelven el siguiente id libre cuando crean elementos.
// Portado del MVP 3.8.9 sin cambios: mismos ids, claves y etiquetas.
import { EXECUTION_TYPES, FORMAS_POR_DEFECTO, type Arista, type DefinicionTipoEjecucion, type FormaPorDefecto, type Nodo } from '@processiq/dominio';

type Formas = Readonly<Record<string, FormaPorDefecto>>;

/**
 * Compuerta de convergencia: junta ramas y no decide nada. Es la que crea
 * `insertarCompuertasConvergencia` (`_merge`) o cualquier exclusiva con varias
 * entradas y una sola salida.
 */
export function esConvergencia(d: Nodo, edges: readonly Arista[]): boolean {
  if (edges.filter((e) => e.from === d.id).length !== 1) return false;
  return d._merge === true || edges.filter((e) => e.to === d.id).length >= 2;
}

/**
 * Cada compuerta exclusiva con una sola salida recibe una rama "No" hacia un
 * fin "Caso no procede" nuevo (en su mismo carril); las dos primeras salidas
 * sin etiqueta se rotulan "Sí" y "No". Las paralelas e inclusivas no se tocan,
 * ni las de convergencia (`esConvergencia`): una convergencia no es una
 * decisión. El MVP también les inventaba la rama "No" (divergencia D13).
 * @returns el siguiente id libre
 */
export function asegurarRamasDeDecision(nodes: Nodo[], edges: Arista[], siguienteId: number, formas: Formas = FORMAS_POR_DEFECTO): number {
  nodes.filter((n) => n.type === 'decision').forEach((d) => {
    if (d.gatewayType === 'parallel' || d.gatewayType === 'inclusive') return;
    const outs = edges.filter((e) => e.from === d.id);
    if (outs.length === 0) return; // huérfana: la validación lo señala
    if (esConvergencia(d, edges)) return;
    if (outs.length === 1) {
      if (!outs[0]!.label || !outs[0]!.label.trim()) outs[0]!.label = 'Sí';
      // Siempre un fin nuevo dedicado: queda en rank+1 de su decisión y en su carril
      const def = formas.end!;
      const altEnd = {
        id: 'n' + (siguienteId++),
        type: 'end',
        x: d.x + 180, y: d.y + 80,
        w: def.w, h: def.h,
        label: 'Caso no procede',
        executionType: '',
        owner: d.owner || '',
        system: '', time: '', volume: '', va: '',
        sla: '', docsIn: '', docsOut: '', rules: '', notes: '', pains: [],
        _autoGen: true
      } as Nodo;
      nodes.push(altEnd);
      edges.push({ id: 'e' + (siguienteId++), from: d.id, to: altEnd.id, label: 'No' });
    } else if (outs.length >= 2) {
      if (!outs[0]!.label || !outs[0]!.label.trim()) outs[0]!.label = 'Sí';
      if (!outs[1]!.label || !outs[1]!.label.trim()) outs[1]!.label = 'No';
    }
  });
  return siguienteId;
}

/**
 * Códigos de actividad estilo MBC ([USR-27], [RCV-18]…): solo a tareas sin
 * código, numerando por prefijo de izquierda a derecha según el rank. Respeta
 * los códigos existentes (edición manual) y continúa su numeración.
 */
export function asignarCodigosActividad(
  nodes: readonly Nodo[], ranks: Readonly<Record<string, number>> | undefined,
  tipos: readonly Pick<DefinicionTipoEjecucion, 'id' | 'codePrefix'>[] = EXECUTION_TYPES
): void {
  const counters: Record<string, number> = {};
  nodes.forEach((n) => {
    if (n.activityCode) {
      const m = n.activityCode.match(/^\[?([A-Z]+)-(\d+)\]?$/);
      if (m) counters[m[1]!] = Math.max(counters[m[1]!] || 0, parseInt(m[2]!, 10));
    }
  });
  const r = ranks || {};
  const ordered = nodes.slice().sort((a, b) => (r[a.id] || 0) - (r[b.id] || 0));
  ordered.forEach((n) => {
    if (n.type !== 'task' && n.type !== 'system') return;
    if (n.activityCode) return;
    const exec = tipos.find((t) => t.id === n.executionType);
    const prefix = (exec && exec.codePrefix) || 'ACT';
    counters[prefix] = (counters[prefix] || 0) + 1;
    n.activityCode = `${prefix}-${String(counters[prefix]).padStart(2, '0')}`;
  });
}

/**
 * Responsable final de cada nodo: el explícito; si no, el del predecesor o
 * sucesor más cercano con responsable; si no, el más frecuente ("Por asignar"
 * si no hay ninguno). Marca `_inferredOwner` en cada nodo.
 */
export function inferirResponsables(nodes: readonly Nodo[], edges: readonly Arista[]): Record<string, string> {
  const final: Record<string, string> = {};
  nodes.forEach((n) => {
    n._inferredOwner = false;
    if (n.owner && n.owner.trim()) final[n.id] = n.owner.trim();
  });

  const counts: Record<string, number> = {};
  Object.values(final).forEach((o) => { counts[o] = (counts[o] || 0) + 1; });
  let mostFrequent: string | null = null, bestC = 0;
  Object.entries(counts).forEach(([k, c]) => { if (c > bestC) { mostFrequent = k; bestC = c; } });

  const inMap: Record<string, string[]> = {}, outMap: Record<string, string[]> = {};
  edges.forEach((e) => {
    (outMap[e.from] = outMap[e.from] || []).push(e.to);
    (inMap[e.to] = inMap[e.to] || []).push(e.from);
  });

  function walkPred(id: string, visited: Set<string>): string | null {
    if (final[id]) return final[id]!;
    if (visited.has(id)) return null;
    visited.add(id);
    for (const p of (inMap[id] || [])) {
      const o = walkPred(p, visited);
      if (o) return o;
    }
    return null;
  }
  function walkSucc(id: string, visited: Set<string>): string | null {
    if (final[id]) return final[id]!;
    if (visited.has(id)) return null;
    visited.add(id);
    for (const s of (outMap[id] || [])) {
      const o = walkSucc(s, visited);
      if (o) return o;
    }
    return null;
  }

  nodes.forEach((n) => {
    if (final[n.id]) return;
    let inferred: string | null;
    if (n.type === 'start') {
      inferred = walkSucc(n.id, new Set());
    } else {
      inferred = walkPred(n.id, new Set()) || walkSucc(n.id, new Set());
    }
    if (!inferred) inferred = mostFrequent || 'Por asignar';
    final[n.id] = inferred;
    n._inferredOwner = true;
  });
  return final;
}

/**
 * Compuertas de convergencia (BPMN riguroso): donde 2+ ramas que vienen de una
 * decisión vuelven a una actividad, se inserta una compuerta exclusiva de cierre.
 * @returns cuántas se insertaron y el siguiente id libre
 */
export function insertarCompuertasConvergencia(
  nodes: Nodo[], edges: Arista[], siguienteId: number, formas: Formas = FORMAS_POR_DEFECTO
): { insertadas: number; siguienteId: number } {
  const nodo = (id: string) => nodes.find((n) => n.id === id);
  const targets = nodes.filter((n) => {
    if (n.type === 'decision' || n.type === 'end' || n.type === 'start') return false;
    return edges.filter((e) => e.to === n.id).length >= 2;
  });
  let added = 0;
  targets.forEach((n) => {
    const ins = edges.filter((e) => e.to === n.id);
    if (ins.length < 2) return;
    // Solo si alguna entrada viene (directa o indirectamente) de una decisión
    const fromDecision = ins.some((e) => {
      const src = nodo(e.from);
      return src && (src.type === 'decision' || edges.some((x) => x.to === src.id && (nodo(x.from) || ({} as Nodo)).type === 'decision'));
    });
    if (!fromDecision) return;
    const def = formas.decision!;
    const merge = {
      id: 'n' + (siguienteId++), type: 'decision', gatewayType: 'exclusive', _merge: true,
      x: n.x - 120, y: n.y, w: def.w, h: def.h,
      label: '', executionType: '', activityCode: '',
      owner: n.owner || '', system: '', time: '', volume: '', va: '',
      sla: '', docsIn: '', docsOut: '', rules: '', notes: 'Convergencia de ramas', pains: []
    } as Nodo;
    nodes.push(merge);
    ins.forEach((e) => { e.to = merge.id; });
    edges.push({ id: 'e' + (siguienteId++), from: merge.id, to: n.id, label: '' });
    added++;
  });
  return { insertadas: added, siguienteId };
}
