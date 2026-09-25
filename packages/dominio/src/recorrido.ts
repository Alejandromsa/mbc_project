import type { Arista, Nodo } from './modelo.js';

/** Centro geométrico de un nodo en coordenadas del lienzo. */
export function centroNodo(n: Pick<Nodo, 'x' | 'y' | 'w' | 'h'>): { x: number; y: number } {
  return { x: n.x + n.w / 2, y: n.y + n.h / 2 };
}

/** Traspasos (handoffs): aristas entre nodos con responsables distintos, ambos asignados. */
export function contarTraspasos(nodes: readonly Pick<Nodo, 'id' | 'owner'>[], edges: readonly Pick<Arista, 'from' | 'to'>[]): number {
  let count = 0;
  edges.forEach((e) => {
    const a = nodes.find((n) => n.id === e.from), b = nodes.find((n) => n.id === e.to);
    if (a && b && a.owner && b.owner && a.owner !== b.owner) count++;
  });
  return count;
}

/**
 * Orden de recorrido del flujo: BFS estable desde los nodos de inicio (o, si no
 * hay, desde los que no tienen entradas). Los nodos no alcanzados (islas) van
 * al final en orden de creación. Es el orden de la Ficha, del informe Word y
 * de los textos que se envían a la IA.
 */
export function ordenDeFlujo<N extends Pick<Nodo, 'id' | 'type'>>(
  nodes: readonly N[], edges: readonly Pick<Arista, 'from' | 'to'>[]
): N[] {
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const out: N[] = [], seen = new Set<string>();
  const outEdges = (id: string) => edges.filter((e) => e.from === id);
  const starts = nodes.filter((n) => n.type === 'start');
  const roots = starts.length ? starts : nodes.filter((n) => !edges.some((e) => e.to === n.id));
  const queue: (N | undefined)[] = [...(roots.length ? roots : nodes.slice(0, 1))];
  while (queue.length) {
    const n = queue.shift();
    if (!n || seen.has(n.id)) continue;
    seen.add(n.id); out.push(n);
    outEdges(n.id).forEach((e) => { const t = byId[e.to]; if (t && !seen.has(t.id)) queue.push(t); });
  }
  nodes.forEach((n) => { if (!seen.has(n.id)) { seen.add(n.id); out.push(n); } });
  return out;
}
