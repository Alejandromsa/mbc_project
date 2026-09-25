// Geometría de rutas: paths SVG ortogonales, segmentos, cruces y colisiones.
// Portado del MVP 3.8.9 sin cambios de cálculo.

export interface Punto { x: number; y: number }
export interface Caja { x: number; y: number; w: number; h: number }
export type Segmento = [Punto, Punto];

/** Polilínea -> path con esquinas redondeadas (radio r, acotado por la mitad de cada tramo). */
export function caminoRedondeado(pts: Punto[], r: number): string {
  pts = pts.filter((p, i) => i === 0 || Math.abs(p.x - pts[i - 1]!.x) > 0.5 || Math.abs(p.y - pts[i - 1]!.y) > 0.5);
  if (pts.length < 3) return `M ${pts[0]!.x} ${pts[0]!.y} L ${pts[pts.length - 1]!.x} ${pts[pts.length - 1]!.y}`;
  const dist = (a: Punto, b: Punto) => Math.hypot(b.x - a.x, b.y - a.y);
  const toward = (from: Punto, to: Punto, d: number) => {
    const len = dist(from, to) || 1;
    return { x: from.x + (to.x - from.x) * (d / len), y: from.y + (to.y - from.y) * (d / len) };
  };
  let d = `M ${pts[0]!.x} ${pts[0]!.y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i]!, prev = pts[i - 1]!, next = pts[i + 1]!;
    const rr = Math.min(r, dist(prev, p) / 2, dist(p, next) / 2);
    const a = toward(p, prev, rr), b = toward(p, next, rr);
    d += ` L ${a.x} ${a.y} Q ${p.x} ${p.y} ${b.x} ${b.y}`;
  }
  const last = pts[pts.length - 1]!;
  return d + ` L ${last.x} ${last.y}`;
}

/** Segmentos rectos de un path M/L/Q (de una curva Q se toma su punto final). */
export function segmentosDePath(d: string): Segmento[] {
  const pts: Punto[] = [], re = /([MLQ])\s*(-?[\d.]+)\s+(-?[\d.]+)(?:\s+(-?[\d.]+)\s+(-?[\d.]+))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(d))) {
    if (m[1] === 'Q') pts.push({ x: +m[4]!, y: +m[5]! });
    else pts.push({ x: +m[2]!, y: +m[3]! });
  }
  const segs: Segmento[] = [];
  for (let i = 1; i < pts.length; i++) segs.push([pts[i - 1]!, pts[i]!]);
  return segs;
}

/** ¿El segmento a-b toca la caja n (ampliada en pad)? */
export function segmentoPisaCaja(a: Punto, b: Punto, n: Caja, pad: number): boolean {
  const x1 = Math.min(a.x, b.x), x2 = Math.max(a.x, b.x);
  const y1 = Math.min(a.y, b.y), y2 = Math.max(a.y, b.y);
  return x1 < n.x + n.w + pad && x2 > n.x - pad && y1 < n.y + n.h + pad && y2 > n.y - pad;
}

/** Cruce estricto entre un segmento horizontal y uno vertical. */
export function segmentosSeCruzan(s1: Segmento, s2: Segmento): boolean {
  const isH = (s: Segmento) => Math.abs(s[0].y - s[1].y) < 1.5, isV = (s: Segmento) => Math.abs(s[0].x - s[1].x) < 1.5;
  let a = s1, b = s2;
  if (!((isH(a) && isV(b)) || (isV(a) && isH(b)))) return false;
  if (isV(a)) { const t = a; a = b; b = t; }
  const ax1 = Math.min(a[0].x, a[1].x), ax2 = Math.max(a[0].x, a[1].x), ay = a[0].y;
  const bx = b[0].x, by1 = Math.min(b[0].y, b[1].y), by2 = Math.max(b[0].y, b[1].y);
  return bx > ax1 + 1 && bx < ax2 - 1 && ay > by1 + 1 && ay < by2 - 1;
}
