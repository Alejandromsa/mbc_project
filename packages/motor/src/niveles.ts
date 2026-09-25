// Niveles de detalle: el proceso se genera una vez al máximo detalle y se
// colapsa localmente en Ejecutivo (1), Actividad (2) y Detalle (3). Cambiar de
// vista no vuelve a llamar a la IA.
// Si la IA etiquetó `nivel` y `padre`, manda esa jerarquía; si no, se deduce.
// Portado del MVP 3.8.9 sin cambios de cálculo.
import { FORMAS_POR_DEFECTO, type Arista, type FormaPorDefecto, type Nodo } from '@processiq/dominio';

type Formas = Readonly<Record<string, FormaPorDefecto>>;

export const NIVELES = [
  { id: 1, nombre: 'Ejecutivo', desc: 'Un paso por actor entre decisiones' },
  { id: 2, nombre: 'Actividad', desc: 'Agrupa tareas consecutivas del mismo actor' },
  { id: 3, nombre: 'Detalle', desc: 'Todas las tareas, como se levantó' }
] as const;

/** Techo de cajas de la vista Ejecutiva: por encima de 10 deja de leerse de un vistazo. */
export const EJEC_MAX_CAJAS = 10;

export interface ModeloProceso { nodes: Nodo[]; edges: Arista[] }

/** Inicio, fin, decisión y eventos intermedios: los hitos que sostienen cada vista. */
export function esHito(n: Pick<Nodo, 'type'>): boolean {
  return n.type === 'decision' || n.type === 'start' || n.type === 'end' || n.type === 'intermediate';
}

type Agrupacion = { grupos: Nodo[]; grupoDe: Record<string, string> };

/** Cadenas de tareas consecutivas del mismo carril (minTareas o más) -> un subproceso. */
export function gruposPorCadena(
  nodes: readonly Nodo[], edges: readonly Arista[], minTareas: number,
  carrilDe: (n: Nodo) => string, formas: Formas = FORMAS_POR_DEFECTO
): Agrupacion {
  const salida: Record<string, string[]> = {}, entrada: Record<string, string[]> = {};
  edges.forEach((e) => {
    (salida[e.from] = salida[e.from] || []).push(e.to);
    (entrada[e.to] = entrada[e.to] || []).push(e.from);
  });
  const porId: Record<string, Nodo> = {}; nodes.forEach((n) => { porId[n.id] = n; });
  const grupoDe: Record<string, string> = {}, grupos: Nodo[] = [], visitado: Record<string, boolean> = {};

  nodes.forEach((n) => {
    if (visitado[n.id] || esHito(n)) return;
    // Retrocede hasta el principio de la cadena
    let ini = n;
    for (;;) {
      const prev = (entrada[ini.id] || []).map((id) => porId[id]).filter(Boolean) as Nodo[];
      if (prev.length !== 1) break;
      const p = prev[0]!;
      if (esHito(p) || carrilDe(p) !== carrilDe(n)) break;
      if ((salida[p.id] || []).length !== 1) break;
      if (visitado[p.id]) break;
      ini = p;
    }
    // Avanza recogiendo la cadena
    const cadena: Nodo[] = [];
    let cur: Nodo | undefined = ini;
    for (;;) {
      if (!cur || visitado[cur.id] || esHito(cur) || carrilDe(cur) !== carrilDe(n)) break;
      cadena.push(cur); visitado[cur.id] = true;
      const sig = (salida[cur.id] || []).map((id) => porId[id]).filter(Boolean) as Nodo[];
      if (sig.length !== 1) break;
      if ((entrada[sig[0]!.id] || []).length !== 1) break;
      cur = sig[0];
    }
    if (cadena.length >= minTareas) {
      const g = {
        id: 'grp_' + cadena[0]!.id,
        label: cadena.length + ' pasos · ' + carrilDe(n),
        type: 'task', marker: 'subprocess',
        // Geometría obligatoria: sin w/h el layout calcula NaN y el lienzo queda vacío
        x: cadena[0]!.x, y: cadena[0]!.y,
        w: formas.task!.w, h: formas.task!.h,
        owner: cadena[0]!.owner, role: cadena[0]!.role,
        _hijos: cadena.map((c) => c.id),
        _detalle: cadena.map((c) => c.label).filter(Boolean),
        pains: cadena.reduce((a, c) => a.concat(c.pains || []), [] as NonNullable<Nodo['pains']>)
      } as unknown as Nodo;
      grupos.push(g);
      cadena.forEach((c) => { grupoDe[c.id] = g.id; });
    }
  });
  return { grupos, grupoDe };
}

/** Rank por camino más largo (Kahn); los nodos en ciclo heredan del predecesor resuelto más avanzado. */
export function ranksLocales(nodes: readonly Nodo[], edges: readonly Arista[]): Record<string, number> {
  const salida: Record<string, string[]> = {}, grado: Record<string, number> = {};
  nodes.forEach((n) => { grado[n.id] = 0; });
  edges.forEach((e) => {
    if (grado[e.from] === undefined || grado[e.to] === undefined) return;
    (salida[e.from] = salida[e.from] || []).push(e.to);
    grado[e.to]!++;
  });
  const rank: Record<string, number> = {}, cola: string[] = [];
  nodes.forEach((n) => { rank[n.id] = 0; if (!grado[n.id]) cola.push(n.id); });
  const listos: Record<string, boolean> = {};
  while (cola.length) {
    const id = cola.shift()!;
    listos[id] = true;
    (salida[id] || []).forEach((t) => {
      rank[t] = Math.max(rank[t]!, rank[id]! + 1);
      if (--grado[t]! === 0) cola.push(t);
    });
  }
  nodes.forEach((n) => {
    if (listos[n.id]) return;
    let m = 0;
    edges.forEach((e) => { if (e.to === n.id && listos[e.from]) m = Math.max(m, rank[e.from]! + 1); });
    rank[n.id] = m;
  });
  return rank;
}

/**
 * Etapas ejecutivas: el proceso de punta a punta en pocas etapas. No mira
 * carriles (una etapa cruza actores) y absorbe los gateways; conserva inicio y fines.
 */
export function etapasEjecutivas(nodes: readonly Nodo[], edges: readonly Arista[], maxCajas: number, formas: Formas = FORMAS_POR_DEFECTO): Agrupacion {
  const rank = ranksLocales(nodes, edges);
  const eventos = nodes.filter((n) => n.type === 'start' || n.type === 'end');
  const resto = nodes.filter((n) => n.type !== 'start' && n.type !== 'end')
                     .sort((a, b) => (rank[a.id]! - rank[b.id]!) || 0);
  const grupos: Nodo[] = [], grupoDe: Record<string, string> = {};
  if (resto.length < 2) return { grupos, grupoDe };

  // Etapas que caben: el techo menos los eventos, y nunca menos de 3
  const etapas = Math.max(3, Math.min(maxCajas - eventos.length, resto.length));
  const tam = Math.ceil(resto.length / etapas);
  for (let i = 0; i < resto.length; i += tam) {
    const miembros = resto.slice(i, i + tam);
    if (miembros.length < 2) continue;      // etapa de un solo paso: se deja tal cual
    const cabeza = miembros.find((m) => m.type !== 'decision') || miembros[0]!;
    const g = {
      id: 'eta_' + miembros[0]!.id,
      label: (cabeza.label || 'Etapa') + ' (+' + (miembros.length - 1) + ' pasos)',
      type: 'task', marker: 'subprocess',
      x: miembros[0]!.x, y: miembros[0]!.y,
      w: formas.task!.w, h: formas.task!.h,
      _hijos: miembros.map((m) => m.id),
      _detalle: miembros.map((m) => m.label).filter(Boolean),
      pains: miembros.reduce((a, m) => a.concat(m.pains || []), [] as NonNullable<Nodo['pains']>)
    } as unknown as Nodo;
    grupos.push(g);
    miembros.forEach((m) => { grupoDe[m.id] = g.id; });
  }
  return { grupos, grupoDe };
}

/**
 * Si todas las ramas de una compuerta exclusiva acaban en el mismo paso, ya no
 * decide nada: se elimina y sus entradas van directas al destino.
 */
export function colapsarGatewaysDegenerados(nodes: Nodo[], edges: Arista[]): ModeloProceso {
  let ns = nodes.slice(), es = edges.slice();
  for (let vuelta = 0; vuelta < 20; vuelta++) {
    const cand = ns.find((n) => {
      if (n.type !== 'decision' || n.gatewayType === 'parallel' || n.gatewayType === 'inclusive') return false;
      const outs = es.filter((e) => e.from === n.id);
      return outs.length > 0 && new Set(outs.map((e) => e.to)).size === 1;
    });
    if (!cand) break;
    const destino = es.find((e) => e.from === cand.id)!.to;
    ns = ns.filter((n) => n.id !== cand.id);
    const vistas: Record<string, boolean> = {};
    es = es.filter((e) => e.from !== cand.id)
           .map((e) => (e.to === cand.id ? { ...e, to: destino } : e))
           .filter((e) => {
             if (e.from === e.to) return false;
             const k = e.from + '>' + e.to;
             if (vistas[k]) return false;
             vistas[k] = true;
             return true;
           });
  }
  return { nodes: ns, edges: es };
}

export interface ContextoNivel {
  /** Carril de cada nodo (el de la vista actual, o su owner). */
  carrilDe: (n: Nodo) => string;
  /** Carril único de la vista ejecutiva (el macroproceso). */
  macroproceso: string;
  formas?: Formas;
}

/** Proyecta el modelo completo al nivel pedido (copias: el modelo no se modifica). */
export function proyectarNivel(full: ModeloProceso, nivel: number, ctx: ContextoNivel): ModeloProceso {
  if (nivel >= 3) {
    return { nodes: full.nodes.map((n) => ({ ...n })), edges: full.edges.map((e) => ({ ...e })) };
  }
  const formas = ctx.formas ?? FORMAS_POR_DEFECTO;
  const conNivel = full.nodes.filter((n) => n.nivel);
  let grupos: Nodo[] = [], grupoDe: Record<string, string> = {};
  if (conNivel.length > full.nodes.length * 0.5) {
    // Jerarquía explícita de la IA
    const visibles: Record<string, boolean> = {};
    full.nodes.forEach((n) => { if ((n.nivel || 3) <= nivel) visibles[n.id] = true; });
    full.nodes.forEach((n) => {
      if (visibles[n.id]) return;
      let p = n.padre as string | undefined;
      while (p && !visibles[p]) { const pn = full.nodes.find((x) => x.id === p); p = pn && (pn.padre as string | undefined); }
      if (p) grupoDe[n.id] = p;
    });
  } else {
    const r = nivel === 1
      ? etapasEjecutivas(full.nodes, full.edges, EJEC_MAX_CAJAS, formas)
      : gruposPorCadena(full.nodes, full.edges, 2, ctx.carrilDe, formas);
    grupos = r.grupos; grupoDe = r.grupoDe;
  }

  const repr = (id: string) => grupoDe[id] || id;
  const nodes: Nodo[] = [], puestos: Record<string, boolean> = {};
  full.nodes.forEach((n) => {
    const r = repr(n.id);
    if (r === n.id) { nodes.push({ ...n }); puestos[n.id] = true; }
    else if (!puestos[r]) {
      const g = grupos.find((x) => x.id === r);
      if (g) { nodes.push({ ...g }); puestos[r] = true; }
    }
  });

  const vistas: Record<string, boolean> = {}, edges: Arista[] = [];
  full.edges.forEach((e) => {
    const a = repr(e.from), b = repr(e.to);
    if (a === b) return;                       // arista interna al grupo
    const k = a + '>' + b;
    if (vistas[k]) return;
    vistas[k] = true;
    edges.push({ ...e, id: 'v_' + e.id, from: a, to: b });
  });
  if (nivel !== 1) return { nodes, edges };
  // Una etapa que cruza actores no cabe en el carril de ninguno: un solo carril, el del proceso
  nodes.forEach((n) => { n.owner = ctx.macroproceso; n.role = ''; });
  return colapsarGatewaysDegenerados(nodes, edges);
}
