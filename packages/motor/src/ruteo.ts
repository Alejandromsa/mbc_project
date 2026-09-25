// Ruteo de flechas: salen y entran por los bordes de las cajas, el codo cae en
// el hueco entre columnas y los retornos de reproceso viajan por un corredor
// inferior. Opcionalmente, A* ortogonal sobre una grilla de Hanan cuando la
// heurística pisa una caja (apagado por defecto: ver docs/mvp/HANDOFF.md, pendiente #3).
// Portado del MVP 3.8.9 sin cambios de cálculo. Las cachés (path por arista,
// corredores, canales ocupados) son del llamador.
import { centroNodo, type Arista, type Nodo } from '@processiq/dominio';
import { caminoRedondeado, segmentoPisaCaja, segmentosDePath, type Punto } from './geometria.js';

export const RADIO_CODO = 10;
/** Separación del primer corredor de retorno bajo su banda. */
export const LOOP_GAP = 26;
/** Separación entre corredores de retorno. */
export const LOOP_LANE_H = 16;

const AST_PAD = 10;         // holgura alrededor de cada caja
const AST_TURN = 18;        // coste de un giro
const AST_REUSE = 40;       // coste de meterse en un canal ya ocupado
const AST_MARGEN = 140;     // margen de la ventana de búsqueda
const AST_MAX_NODOS = 9000; // tope de expansión: si se pasa, cae a la heurística

/** Datos de carriles que produce el layout (state._lanes del MVP). */
export interface CarrilesRuteo {
  ranks?: Record<string, number>;
  colX?: Record<number, number>;
  rankW?: Record<number, number>;
  list?: string[];
  laneOf?: Record<string, string>;
  bandH?: number;
  laneTops?: number[];
  laneHs?: number[];
  laneH?: number;
  padY?: number;
}

export interface ContextoRuteo {
  nodes: readonly Nodo[];
  lanes: CarrilesRuteo | null | undefined;
  /** Altura del corredor de retorno de cada arista (id -> y). */
  corredores: () => Record<string, number>;
  /** Carga de cada canal del A* ('H:y' | 'V:x'); null = A* apagado. */
  canales: Map<string, number> | null;
}

/** Un corredor por banda, justo debajo de ella; los retornos más cortos, más cerca. */
export function corredoresDeRetorno(nodes: readonly Nodo[], edges: readonly Arista[]): Record<string, number> {
  const nodo = (id: string) => nodes.find((n) => n.id === id);
  const slots: Record<string, number> = {};
  const bandBottom: Record<number, number> = {};
  nodes.forEach((n) => {
    const bd = (n._band as number) || 0;
    bandBottom[bd] = Math.max(bandBottom[bd] || 0, n.y + n.h);
  });
  const backs = edges.filter((e) => {
    const a = nodo(e.from), b = nodo(e.to);
    return a && b && (b.x + b.w) <= (a.x + 4);
  });
  const perBand: Record<number, number> = {};
  backs.map((e) => {
    const a = nodo(e.from)!, b = nodo(e.to)!;
    // Banda superior: un salto de banda baja una sola vez y entra por arriba del destino
    return { id: e.id, band: Math.min((a._band as number) || 0, (b._band as number) || 0), span: Math.abs((a.x + a.w / 2) - (b.x + b.w / 2)) };
  }).sort((p, q) => p.span - q.span)
    .forEach((it) => {
      const i = (perBand[it.band] = (perBand[it.band] || 0));
      perBand[it.band]!++;
      slots[it.id] = (bandBottom[it.band] || 0) + LOOP_GAP + i * LOOP_LANE_H;
    });
  return slots;
}

// ¿La flecha salta columnas? (hay cajas intermedias que esquivar)
function saltaColumnas(a: Nodo, b: Nodo, L: CarrilesRuteo | null | undefined): boolean {
  const R = L && L.ranks;
  if (R && R[a.id] != null && R[b.id] != null) return (R[b.id]! - R[a.id]!) > 1;
  return (b.x - (a.x + a.w)) > 260;
}

// Ejes verticales seguros: el centro del hueco entre columnas (el borde del nodo
// no basta: los nodos estrechos van centrados y a su lado hay cajas anchas).
function huecoTras(node: Nodo, L: CarrilesRuteo | null | undefined): number {
  const r = L && L.ranks ? L.ranks[node.id] : null;
  if (L && L.colX && L.rankW && r != null && L.colX[r] != null) return L.colX[r]! + L.rankW[r]! + 29;
  return node.x + node.w + 18;
}
function huecoAntes(node: Nodo, L: CarrilesRuteo | null | undefined): number {
  const r = L && L.ranks ? L.ranks[node.id] : null;
  if (L && L.colX && r != null && L.colX[r] != null) return L.colX[r]! - 29;
  return node.x - 18;
}

// Franja inferior libre del carril de un nodo (autopista para tramos largos)
function franjaDelCarril(node: Nodo, L: CarrilesRuteo | null | undefined): number | null {
  if (!L || !L.list || !L.laneOf) return null;
  const idx = L.list.indexOf(L.laneOf[node.id]!);
  if (idx < 0) return null;
  const bandY = ((node._band as number) || 0) * (L.bandH || 0);
  const top = (L.laneTops && L.laneTops[idx] != null) ? L.laneTops[idx]! : idx * L.laneH!;
  const lh = (L.laneHs && L.laneHs[idx]) || L.laneH!;
  return L.padY! + bandY + top + lh - 13;      // dentro del carril, bajo las cajas
}

/** Heurística de codos (plan A). */
export function rutaHeuristica(a: Nodo, b: Nodo, edge: Arista | undefined, ctx: ContextoRuteo): string {
  const L = ctx.lanes;
  const ac = centroNodo(a), bc = centroNodo(b);
  const forward = b.x >= a.x + a.w - 4;
  const backward = (b.x + b.w) <= (a.x + 4);

  if (forward) {
    const from = { x: a.x + a.w, y: ac.y };
    const to = { x: b.x, y: bc.y };
    if (Math.abs(from.y - to.y) < 2 && !saltaColumnas(a, b, L)) {
      return `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
    }
    // Tramo largo: la recta pisaría las cajas intermedias; va por la franja libre del carril
    if (saltaColumnas(a, b, L)) {
      const gy = franjaDelCarril(a, L);
      if (gy != null && Math.abs(gy - from.y) > 8) {
        const x1 = huecoTras(a, L), x2 = huecoAntes(b, L);
        if (x2 > x1 + 10) {
          return caminoRedondeado([from, { x: x1, y: from.y }, { x: x1, y: gy },
                                   { x: x2, y: gy }, { x: x2, y: to.y }, to], RADIO_CODO);
        }
      }
    }
    // Codo en el hueco entre columnas: nunca cae dentro de una caja
    const mx = from.x + (to.x - from.x) / 2;
    return caminoRedondeado([from, { x: mx, y: from.y }, { x: mx, y: to.y }, to], RADIO_CODO);
  }

  if (backward) {
    // Retorno: baja al corredor, viaja horizontal y entra al destino por su
    // izquierda (la flecha apunta en el sentido del flujo, como en BPMN).
    const y = (ctx.corredores()[(edge && edge.id) as string]) ||
              (Math.max(a.y + a.h, b.y + b.h) + LOOP_GAP);
    const xOut = huecoTras(a, L);
    const xIn = huecoAntes(b, L);
    // Si el corredor queda arriba del origen (retorno que sube de banda), sale por el techo
    const exitTop = y < a.y;
    const from = { x: ac.x, y: exitTop ? a.y : a.y + a.h };
    const to = { x: b.x, y: bc.y };
    return caminoRedondeado([from, { x: xOut, y: from.y }, { x: xOut, y },
                             { x: xIn, y }, { x: xIn, y: to.y }, to], RADIO_CODO);
  }

  // Misma columna (o solape): conexión vertical por bordes
  if (bc.y >= ac.y) {
    const from = { x: ac.x, y: a.y + a.h }, to = { x: bc.x, y: b.y };
    if (Math.abs(from.x - to.x) < 2) return `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
    const my = from.y + (to.y - from.y) / 2;
    return caminoRedondeado([from, { x: from.x, y: my }, { x: to.x, y: my }, to], RADIO_CODO);
  }
  const from = { x: ac.x, y: a.y }, to = { x: bc.x, y: b.y + b.h };
  if (Math.abs(from.x - to.x) < 2) return `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
  const my = from.y + (to.y - from.y) / 2;
  return caminoRedondeado([from, { x: from.x, y: my }, { x: to.x, y: my }, to], RADIO_CODO);
}

// ------------------------------------------------------------------ A*
const carga = (ctx: ContextoRuteo, clave: string) => ctx.canales ? (ctx.canales.get(clave) || 0) : 0;
const ocupa = (ctx: ContextoRuteo, clave: string) => { if (ctx.canales) ctx.canales.set(clave, carga(ctx, clave) + 1); };

// ¿El segmento recto p→q atraviesa alguna caja que no sea origen ni destino?
function choca(p: Punto, q: Punto, exentos: string[], nodes: readonly Nodo[]): boolean {
  const x1 = Math.min(p.x, q.x), x2 = Math.max(p.x, q.x);
  const y1 = Math.min(p.y, q.y), y2 = Math.max(p.y, q.y);
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]!;
    if (exentos.indexOf(n.id) >= 0) continue;
    if (x1 < n.x + n.w + 2 && x2 > n.x - 2 && y1 < n.y + n.h + 2 && y2 > n.y - 2) return true;
  }
  return false;
}

// Líneas candidatas: bordes de cada caja (con holgura) dentro de la ventana
function lineas(a: Nodo, b: Nodo, nodes: readonly Nodo[]): { xs: number[]; ys: number[] } {
  const x0 = Math.min(a.x, b.x) - AST_MARGEN, x1 = Math.max(a.x + a.w, b.x + b.w) + AST_MARGEN;
  const y0 = Math.min(a.y, b.y) - AST_MARGEN, y1 = Math.max(a.y + a.h, b.y + b.h) + AST_MARGEN;
  const xs = new Set<number>(), ys = new Set<number>();
  nodes.forEach((n) => {
    const cx1 = n.x - AST_PAD, cx2 = n.x + n.w + AST_PAD;
    const cy1 = n.y - AST_PAD, cy2 = n.y + n.h + AST_PAD;
    if (cx1 > x0 && cx1 < x1) xs.add(cx1);
    if (cx2 > x0 && cx2 < x1) xs.add(cx2);
    if (cy1 > y0 && cy1 < y1) ys.add(cy1);
    if (cy2 > y0 && cy2 < y1) ys.add(cy2);
  });
  return { xs: [...xs].sort((p, q) => p - q), ys: [...ys].sort((p, q) => p - q) };
}

/** Polilínea de menor coste (longitud, giros, canales ocupados), o null si no encuentra o se pasa del tope. */
export function rutaAStar(a: Nodo, b: Nodo, desde: Punto, hasta: Punto, ctx: ContextoRuteo): Punto[] | null {
  const L = lineas(a, b, ctx.nodes);
  const xs = [...new Set(L.xs.concat([desde.x, hasta.x]))].sort((p, q) => p - q);
  const ys = [...new Set(L.ys.concat([desde.y, hasta.y]))].sort((p, q) => p - q);
  if (xs.length * ys.length > AST_MAX_NODOS) return null;

  const ix = (v: number) => xs.indexOf(v), iy = (v: number) => ys.indexOf(v);
  const si = ix(desde.x), sj = iy(desde.y), ti = ix(hasta.x), tj = iy(hasta.y);
  if (si < 0 || sj < 0 || ti < 0 || tj < 0) return null;

  const exentos = [a.id, b.id];
  const key = (i: number, j: number, d: number) => (j * xs.length + i) * 3 + d;   // d: 0 inicio, 1 horiz, 2 vert
  const g = new Map<number, number>(), padre = new Map<number, number>();
  const h = (i: number, j: number) => Math.abs(xs[i]! - hasta.x) + Math.abs(ys[j]! - hasta.y);

  const cola = [{ i: si, j: sj, d: 0, f: h(si, sj) }];
  g.set(key(si, sj, 0), 0);
  let expandidos = 0;

  while (cola.length) {
    let mejor = 0;
    for (let k = 1; k < cola.length; k++) if (cola[k]!.f < cola[mejor]!.f) mejor = k;
    const cur = cola.splice(mejor, 1)[0]!;
    const ck = key(cur.i, cur.j, cur.d);
    if (cur.i === ti && cur.j === tj) {
      const pts: Punto[] = [];
      let k: number | undefined = ck;
      while (k !== undefined) {
        const d = k % 3, resto = (k - d) / 3;
        const i = resto % xs.length, j = (resto - i) / xs.length;
        pts.unshift({ x: xs[i]!, y: ys[j]! });
        k = padre.get(k);
      }
      return pts;
    }
    if (++expandidos > AST_MAX_NODOS) return null;
    const gc = g.get(ck)!;

    const vecinos = [
      { i: cur.i + 1, j: cur.j, d: 1 }, { i: cur.i - 1, j: cur.j, d: 1 },
      { i: cur.i, j: cur.j + 1, d: 2 }, { i: cur.i, j: cur.j - 1, d: 2 }
    ];
    for (const v of vecinos) {
      if (v.i < 0 || v.j < 0 || v.i >= xs.length || v.j >= ys.length) continue;
      const p = { x: xs[cur.i]!, y: ys[cur.j]! }, q = { x: xs[v.i]!, y: ys[v.j]! };
      if (choca(p, q, exentos, ctx.nodes)) continue;
      const largo = Math.abs(q.x - p.x) + Math.abs(q.y - p.y);
      const giro = (cur.d !== 0 && cur.d !== v.d) ? AST_TURN : 0;
      const canal = v.d === 1 ? ('H:' + Math.round(q.y)) : ('V:' + Math.round(q.x));
      const reuso = carga(ctx, canal) * AST_REUSE;
      const ng = gc + largo + giro + reuso;
      const vk = key(v.i, v.j, v.d);
      if (g.has(vk) && g.get(vk)! <= ng) continue;
      g.set(vk, ng); padre.set(vk, ck);
      cola.push({ i: v.i, j: v.j, d: v.d, f: ng + h(v.i, v.j) });
    }
  }
  return null;
}

// ¿Este path pisa alguna caja que no sea su origen o su destino?
function pisaCaja(d: string, a: Nodo, b: Nodo, nodes: readonly Nodo[]): boolean {
  const segs = segmentosDePath(d);
  for (let i = 0; i < segs.length; i++) {
    for (let k = 0; k < nodes.length; k++) {
      const n = nodes[k]!;
      if (n.id === a.id || n.id === b.id) continue;
      if (segmentoPisaCaja(segs[i]![0], segs[i]![1], n, 2)) return true;
    }
  }
  return false;
}
function registraCanales(d: string, ctx: ContextoRuteo): void {
  segmentosDePath(d).forEach((sg) => {
    if (Math.abs(sg[0].y - sg[1].y) < 1) ocupa(ctx, 'H:' + Math.round(sg[1].y));
    else if (Math.abs(sg[0].x - sg[1].x) < 1) ocupa(ctx, 'V:' + Math.round(sg[1].x));
  });
}

/**
 * Path de una arista. Primero la heurística (barata y casi siempre limpia);
 * con el A* activo (ctx.canales), solo si la heurística pisa una caja, y solo
 * se acepta si de verdad mejora.
 */
export function rutaArista(a: Nodo, b: Nodo, edge: Arista | undefined, ctx: ContextoRuteo): string {
  const heur = rutaHeuristica(a, b, edge, ctx);
  if (!ctx.canales) return heur;
  if (!pisaCaja(heur, a, b, ctx.nodes)) { registraCanales(heur, ctx); return heur; }

  const ac = centroNodo(a), bc = centroNodo(b);
  const forward = b.x >= a.x + a.w - 4;
  const desde = forward ? { x: a.x + a.w + AST_PAD, y: ac.y } : { x: a.x - AST_PAD, y: ac.y };
  const hasta = forward ? { x: b.x - AST_PAD, y: bc.y } : { x: b.x + b.w + AST_PAD, y: bc.y };
  const pts = rutaAStar(a, b, desde, hasta, ctx);
  if (pts && pts.length >= 2) {
    const salida = { x: forward ? a.x + a.w : a.x, y: ac.y };
    const entrada = { x: forward ? b.x : b.x + b.w, y: bc.y };
    const d = caminoRedondeado([salida].concat(pts, [entrada]), RADIO_CODO);
    if (!pisaCaja(d, a, b, ctx.nodes)) { registraCanales(d, ctx); return d; }
  }
  registraCanales(heur, ctx);
  return heur;
}
