// Calidad del diagrama sobre el ruteo real: flechas que pisan cajas y cruces.
// Portado del MVP 3.8.9 (diagramQuality) sin cambios de cálculo.
import type { Arista, Nodo } from '@processiq/dominio';
import { segmentoPisaCaja, segmentosDePath, segmentosSeCruzan } from './geometria.js';

export interface CalidadDiagrama {
  sobreCajas: number;
  cruces: number;
  ancho: number;
  alto: number;
  /** Menor es mejor: pisar cajas pesa 10, un cruce 3, y el exceso de ancho sobre 3 500 px un poco. */
  score: number;
}

/**
 * @param rutaDe devuelve el path SVG de una arista (el mismo que dibuja el lienzo)
 */
export function medirCalidad(
  nodes: readonly Nodo[], edges: readonly Arista[], rutaDe: (a: Nodo, b: Nodo, e: Arista) => string
): CalidadDiagrama {
  const nodo = (id: string) => nodes.find((n) => n.id === id);
  const paths: { segs: ReturnType<typeof segmentosDePath>; ends: string[] }[] = [];
  edges.forEach((e) => {
    const a = nodo(e.from), b = nodo(e.to);
    if (!a || !b) return;
    paths.push({ segs: segmentosDePath(rutaDe(a, b, e)), ends: [e.from, e.to] });
  });
  let sobreCajas = 0;
  paths.forEach((p) => nodes.forEach((n) => {
    if (p.ends.indexOf(n.id) >= 0) return;
    p.segs.forEach((sg) => { if (segmentoPisaCaja(sg[0], sg[1], n, 2)) sobreCajas++; });
  }));
  let cruces = 0;
  for (let i = 0; i < paths.length; i++) for (let j = i + 1; j < paths.length; j++) {
    if (paths[i]!.ends.some((x) => paths[j]!.ends.indexOf(x) >= 0)) continue;
    paths[i]!.segs.forEach((s1) => paths[j]!.segs.forEach((s2) => { if (segmentosSeCruzan(s1, s2)) cruces++; }));
  }
  let ancho = 0, alto = 0;
  nodes.forEach((n) => { ancho = Math.max(ancho, n.x + n.w); alto = Math.max(alto, n.y + n.h); });
  const score = sobreCajas * 10 + cruces * 3 + Math.max(0, ancho - 3500) / 500;
  return { sobreCajas, cruces, ancho: Math.round(ancho), alto: Math.round(alto), score };
}
