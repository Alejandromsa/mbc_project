// Auto-layout por carriles: flujo de izquierda a derecha, un carril por responsable.
// Portado del MVP 3.8.9 (autoLayout) sin cambios de cálculo. Coloca los nodos
// que recibe (modifica x, y y _band) y devuelve la metadata de carriles.
import { FORMAS_POR_DEFECTO, type Arista, type FormaPorDefecto, type Nodo } from '@processiq/dominio';

type Formas = Readonly<Record<string, FormaPorDefecto>>;

/** Metadata de carriles que usan el lienzo, el ruteo, el BPMN y el PPTX (state._lanes). */
export interface Carriles {
  list: string[];
  laneOf: Record<string, string>;
  ranks: Record<string, number>;
  headerW: number;
  colW: number;
  laneH: number;
  laneHs: number[];
  laneTops: number[];
  padX: number;
  padY: number;
  innerPadL: number;
  colX: Record<number, number>;
  rankW: Record<number, number>;
  bandH: number;
  wrap: boolean;
  wrapAt: number;
  bands: number;
  totalRanks: number;
  inferredCount: number;
}

/**
 * Red de seguridad: un solo nodo sin w/h finitos propaga NaN al ancho de su
 * columna y deja sin coordenadas a todo el diagrama (lienzo en blanco).
 */
export function normalizarGeometria(nodes: readonly Nodo[], formas: Formas = FORMAS_POR_DEFECTO): void {
  nodes.forEach((n) => {
    const d = formas[n.type] || formas.task!;
    if (!isFinite(n.w) || n.w <= 0) n.w = d.w;
    if (!isFinite(n.h) || n.h <= 0) n.h = d.h;
    if (!isFinite(n.x)) n.x = 0;
    if (!isFinite(n.y)) n.y = 0;
  });
}

// Parámetros del layout
const HEADER_W = 140;     // ancho de la cabecera del carril
const LANE_H = 170;       // alto MÍNIMO de un carril (caja 76 + meta + holgura)
const STACK_GAP = 26;     // hueco entre cajas apiladas en la misma columna
const LANE_PAD = 56;      // aire arriba+abajo cuando el carril crece por apilado
const PAD_X = 30;
const PAD_Y = 30;
const INNER_PAD_L = 30;
const BASE_GAP = 58;      // hueco mínimo entre columnas
const LABEL_GAP = 96;     // hueco cuando la flecha lleva etiqueta (Sí/No…)
const WRAP_AT = 14;       // ranks por banda en modo envolvente

/**
 * Coloca los nodos:
 * 1. back-edges por DFS (los bucles de reproceso no inflan los ranks);
 * 2. rank por camino más largo sobre el DAG (Kahn);
 * 3. carriles por responsable, reordenados por baricentro para cortar cruces;
 * 4. columnas compactas (cada rank ocupa lo que necesita) y apilado dentro del carril.
 * @param ownerMap responsable final de cada nodo (inferirResponsables)
 * @param wrap modo envolvente (bandas de 14 columnas)
 */
export function calcularLayout(
  nodes: readonly Nodo[], edges: readonly Arista[],
  opciones: { ownerMap: Record<string, string>; wrap: boolean }
): Carriles {
  const nodo = (id: string) => nodes.find((n) => n.id === id);
  const starts = nodes.filter((n) => n.type === 'start');
  const ranks: Record<string, number> = {};
  const outMap: Record<string, string[]> = {};
  edges.forEach((e) => { (outMap[e.from] = outMap[e.from] || []).push(e.to); });

  let roots = starts.map((n) => n.id);
  if (roots.length === 0) {
    const inMap: Record<string, boolean> = {};
    edges.forEach((e) => { inMap[e.to] = true; });
    const orphans = nodes.filter((n) => !inMap[n.id]);
    roots = (orphans.length ? orphans : [nodes[0]!]).map((n) => n.id);
  }

  // 1) Back-edges con DFS
  const color: Record<string, number> = {};
  const backEdges = new Set<string>();
  const dfs = (u: string) => {
    color[u] = 1;
    (outMap[u] || []).forEach((v) => {
      if (color[v] === 1) backEdges.add(u + '->' + v);
      else if (!color[v]) dfs(v);
    });
    color[u] = 2;
  };
  roots.forEach((r) => { if (!color[r]) dfs(r); });
  nodes.forEach((n) => { if (!color[n.id]) dfs(n.id); });

  // 2) Rank por camino más largo sobre el DAG
  const dagOut: Record<string, string[]> = {}, inDeg: Record<string, number> = {};
  nodes.forEach((n) => { inDeg[n.id] = 0; });
  edges.forEach((e) => {
    if (backEdges.has(e.from + '->' + e.to)) return;
    (dagOut[e.from] = dagOut[e.from] || []).push(e.to);
    inDeg[e.to] = (inDeg[e.to] || 0) + 1;
  });
  nodes.forEach((n) => { ranks[n.id] = 0; });
  const q2 = nodes.filter((n) => inDeg[n.id] === 0).map((n) => n.id);
  const indeg2: Record<string, number> = Object.assign({}, inDeg);
  let guard = 0;
  const maxGuard = nodes.length * 4 + 10;
  while (q2.length && guard++ < maxGuard) {
    const u = q2.shift()!;
    (dagOut[u] || []).forEach((v) => {
      if (ranks[u]! + 1 > ranks[v]!) ranks[v] = ranks[u]! + 1;
      if (--indeg2[v]! === 0) q2.push(v);
    });
  }

  // Los fines autogenerados ("Caso no procede") van justo tras su decisión
  nodes.filter((n) => n.type === 'end' && n._autoGen).forEach((n) => {
    const edge = edges.find((e) => e.to === n.id);
    if (edge && ranks[edge.from] !== undefined) ranks[n.id] = ranks[edge.from]! + 1;
  });

  const ownerMap = opciones.ownerMap;
  const laneOf = (n: Nodo) => ownerMap[n.id] || 'Por asignar';

  // Carriles en orden de aparición por rank
  const laneOrder: string[] = [];
  const ranksList = Object.keys(ranks).map((id) => ({ id, rank: ranks[id]! })).sort((a, b) => a.rank - b.rank);
  ranksList.forEach(({ id }) => {
    const n = nodo(id);
    if (!n) return;
    const lane = laneOf(n);
    if (!laneOrder.includes(lane)) laneOrder.push(lane);
  });

  // 3) Anti-cruces: reordena los carriles por baricentro (Sugiyama simplificado)
  if (laneOrder.length > 2) {
    const link: Record<string, Record<string, number>> = {};
    edges.forEach((e) => {
      const a = nodo(e.from), b = nodo(e.to);
      if (!a || !b) return;
      const la = laneOf(a), lb = laneOf(b);
      if (la === lb) return;
      (link[la] = link[la] || {})[lb] = ((link[la] || {})[lb] || 0) + 1;
      (link[lb] = link[lb] || {})[la] = ((link[lb] || {})[la] || 0) + 1;
    });
    const firstRankOf: Record<string, number> = {};   // desempate: conserva la lectura temporal
    laneOrder.forEach((l) => { firstRankOf[l] = Infinity; });
    nodes.forEach((n) => {
      const l = laneOf(n), r = ranks[n.id] || 0;
      if (r < firstRankOf[l]!) firstRankOf[l] = r;
    });
    for (let pass = 0; pass < 4; pass++) {
      const pos: Record<string, number> = {};
      laneOrder.forEach((l, i) => { pos[l] = i; });
      const bary = laneOrder.map((l) => {
        const nb = link[l] || {};
        let sum = 0, w = 0;
        Object.keys(nb).forEach((o) => { sum += pos[o]! * nb[o]!; w += nb[o]!; });
        return { lane: l, b: w ? sum / w : pos[l]! };
      });
      bary.sort((p, q) => (p.b - q.b) || (firstRankOf[p.lane]! - firstRankOf[q.lane]!));
      const next = bary.map((x) => x.lane);
      if (next.join('|') === laneOrder.join('|')) break;
      laneOrder.length = 0; next.forEach((l) => laneOrder.push(l));
    }
  }

  const totalRanks = Math.max(...Object.values(ranks), 0) + 1;

  // 4) Columnas compactas
  const rankW: Record<number, number> = {}, gapAfter: Record<number, number> = {};
  for (let r = 0; r < totalRanks; r++) { rankW[r] = 0; gapAfter[r] = BASE_GAP; }
  nodes.forEach((n) => {
    const r = ranks[n.id] || 0;
    rankW[r] = Math.max(rankW[r]!, n.w);
  });
  edges.forEach((e) => {
    if (!e.label) return;
    const rf = ranks[e.from]!, rt = ranks[e.to];
    if (rt === rf + 1) gapAfter[rf] = Math.max(gapAfter[rf]!, LABEL_GAP);
  });

  // Modo envolvente: el lienzo va en una banda salvo que se pida (la escalera es cosa del PPTX)
  const doWrap = opciones.wrap === true;
  const bandOf = (r: number) => doWrap ? Math.floor(r / WRAP_AT) : 0;

  // Grupos: varios nodos en el mismo rank + carril se apilan
  const groups: Record<string, Nodo[]> = {};
  nodes.forEach((n) => {
    const key = laneOf(n) + '|' + (ranks[n.id] || 0);
    (groups[key] = groups[key] || []).push(n);
  });
  // Cada carril mide lo que pida su pila más alta
  const laneHs = laneOrder.map(() => LANE_H);
  Object.values(groups).forEach((grp) => {
    const idx = laneOrder.indexOf(laneOf(grp[0]!));
    const pila = grp.reduce((a, n) => a + n.h, 0) + (grp.length - 1) * STACK_GAP + LANE_PAD;
    if (idx >= 0) laneHs[idx] = Math.max(laneHs[idx]!, pila);
  });
  const laneTops: number[] = [];
  laneHs.reduce((acc, h, i) => { laneTops[i] = acc; return acc + h; }, 0);
  const bandH = laneHs.reduce((a, h) => a + h, 0) + 70;   // alto de una banda + corredor

  const colX: Record<number, number> = {};
  let cx = PAD_X + HEADER_W + INNER_PAD_L;
  for (let r = 0; r < totalRanks; r++) {
    if (doWrap && r % WRAP_AT === 0) cx = PAD_X + HEADER_W + INNER_PAD_L;
    colX[r] = cx;
    cx += rankW[r]! + gapAfter[r]!;
  }

  // x = columna compacta (centrado), y = su carril (+ banda)
  nodes.forEach((n) => {
    const r = ranks[n.id] || 0;
    const laneIdx = Math.max(0, laneOrder.indexOf(laneOf(n)));
    const band = bandOf(r);
    n._band = band;
    n.x = colX[r]! + (rankW[r]! - n.w) / 2;
    n.y = PAD_Y + band * bandH + laneTops[laneIdx]! + (laneHs[laneIdx]! - n.h) / 2;
  });

  // Pilas: reparto vertical dentro del carril, ordenadas por la altura media de sus vecinos
  Object.values(groups).forEach((grp) => {
    if (grp.length < 2) return;
    const neighborY = (n: Nodo) => {
      const ys: number[] = [];
      edges.forEach((e) => {
        if (e.from === n.id) { const t = nodo(e.to); if (t) ys.push(t.y); }
        else if (e.to === n.id) { const s = nodo(e.from); if (s) ys.push(s.y); }
      });
      return ys.length ? ys.reduce((a, c) => a + c, 0) / ys.length : n.y;
    };
    grp.sort((p, q) => neighborY(p) - neighborY(q));
    const laneIdx = Math.max(0, laneOrder.indexOf(laneOf(grp[0]!)));
    const laneTop = PAD_Y + ((grp[0]!._band as number) || 0) * bandH + laneTops[laneIdx]!;
    const totalH = grp.reduce((a, n) => a + n.h, 0) + (grp.length - 1) * STACK_GAP;
    let y = laneTop + (laneHs[laneIdx]! - totalH) / 2;
    grp.forEach((n) => { n.y = y; y += n.h + STACK_GAP; });
  });

  return {
    list: laneOrder,
    laneOf: ownerMap,
    ranks,
    headerW: HEADER_W, colW: BASE_GAP + 158, laneH: LANE_H, laneHs, laneTops, padX: PAD_X, padY: PAD_Y, innerPadL: INNER_PAD_L,
    colX, rankW, bandH, wrap: doWrap, wrapAt: WRAP_AT,
    bands: doWrap ? Math.ceil(totalRanks / WRAP_AT) : 1,
    totalRanks,
    inferredCount: nodes.filter((n) => n._inferredOwner).length
  };
}
