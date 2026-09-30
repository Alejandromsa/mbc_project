// Artefactos de la fidelidad que la app nueva cambia a propósito respecto al MVP
// (docs/fase1-divergencias.md) y que no se pueden traducir con un reemplazo de
// texto (textos-divergentes.mjs): cambia el diagrama entero. No es una tolerancia:
// - solo estos artefactos de estos casos, uno por uno;
// - comparar.mjs exige que de verdad difieran: si un día coinciden, la lista está
//   vieja y la prueba falla;
// - divergencias.spec.mjs comprueba con exactitud en qué difieren (la prueba de su divergencia).
const MERGE_GATEWAYS = ['merge-gateways/mensajes.html', 'merge-gateways/resumen.json', 'merge-gateways/diagrama.svg'];

export const ARTEFACTOS_DIVERGENTES = [
  // D12: «Insertar compuertas de convergencia» ya no deja un fin «Caso no procede»
  // colgando de cada compuerta de cierre (el MVP se lo inventaba: asegurarRamasDeDecision)
  { d: 'D12', caso: 'copiloto-loadComplex', claves: MERGE_GATEWAYS },
  { d: 'D12', caso: 'copiloto-loadComplex11', claves: MERGE_GATEWAYS },
  { d: 'D12', caso: 'copiloto-loadFichaVentaLotes', claves: MERGE_GATEWAYS }
];

/** Claves de un caso que se comparan en su prueba de divergencia y no aquí: clave -> divergencia. */
export function divergentesDe(caso) {
  const m = new Map();
  for (const a of ARTEFACTOS_DIVERGENTES) if (a.caso === caso) for (const k of a.claves) m.set(k, a.d);
  return m;
}
