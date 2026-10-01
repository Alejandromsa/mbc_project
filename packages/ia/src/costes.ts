// Modelos, precios y estimación de coste de una generación.
// Portado del MVP 3.8.9 (v3.8.6) sin cambios de cálculo.
import { PROMPT_GENERACION } from './prompts.js';

export const MODELOS_IA = [
  { id: 'claude-opus-5', label: 'Claude Opus — máxima calidad de interpretación' },
  { id: 'claude-sonnet-5', label: 'Claude Sonnet — rápido y económico' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku — ultrarrápido, tareas simples' }
] as const;

export interface PrecioModelo {
  entrada: number;
  salida: number;
  nombre: string;
  /** Caché de prompts: escribir con TTL de 5 minutos (1,25 × la entrada). */
  escrituraCache: number;
  /** Caché de prompts: escribir con TTL de 1 hora (2 × la entrada). */
  escrituraCache1h: number;
  /** Caché de prompts: leer (0,1 × la entrada en estos modelos). */
  lecturaCache: number;
}

/**
 * Precios de LISTA por millón de tokens, en US$ (tabla oficial del 24-jun-2026;
 * los de la caché de prompts, de la documentación de prompt caching del 1-oct-2026).
 * El respaldo automático de Opus 5 usa modelos de la misma tarifa.
 */
export const PRECIOS_IA: Readonly<Record<string, PrecioModelo>> = {
  'claude-opus-5':    { entrada: 5, salida: 25, nombre: 'Claude Opus 5', escrituraCache: 6.25, escrituraCache1h: 10, lecturaCache: 0.5 },
  'claude-sonnet-5':  { entrada: 2, salida: 10, nombre: 'Claude Sonnet 5', escrituraCache: 2.5, escrituraCache1h: 4, lecturaCache: 0.2 },
  'claude-haiku-4-5': { entrada: 1, salida: 5,  nombre: 'Claude Haiku 4.5', escrituraCache: 1.25, escrituraCache1h: 2, lecturaCache: 0.1 }
};

/**
 * Tokens de entrada de la caché de prompts. Son PARTE de los tokens de entrada
 * (UsoIa.entrada los suma todos), pero cuestan distinto. Faltan si no los hubo.
 */
export interface TokensCache {
  /** Escritos en la caché (cache_creation_input_tokens), con cualquier TTL. */
  cacheEscritura?: number;
  /** De esos, los escritos con TTL de 1 hora (usage.cache_creation.ephemeral_1h_input_tokens). */
  cacheEscritura1h?: number;
  /** Leídos de la caché (cache_read_input_tokens). */
  cacheLectura?: number;
}

/** Tope de tokens de respuesta de la generación de procesos. */
export const GEN_MAX_TOKENS = 64000;
// Supuestos solo hasta tener ejecuciones reales: ~3 caracteres por token en
// español y un rango de tokens de salida por nivel (incluye el razonamiento).
export const CAR_POR_TOKEN_INICIAL = 3;
export const SALIDA_INICIAL: Readonly<Record<number, readonly [number, number]>> = {
  1: [5000, 15000], 2: [10000, 30000], 3: [20000, 50000]
};

export function precioModelo(m: string | undefined): PrecioModelo {
  return PRECIOS_IA[m ?? ''] || PRECIOS_IA['claude-opus-5']!;
}

/**
 * Coste en US$. `tokensEntrada` son TODOS los de entrada, también los de la
 * caché; `cache` dice cuántos de ellos se escribieron o se leyeron de la caché,
 * que se cobran a su precio (escribir cuesta más que la entrada normal y leer,
 * mucho menos). Sin `cache`, todo a precio de entrada, como antes.
 */
export function usd(tokensEntrada: number, tokensSalida: number, modelo: string | undefined, cache?: TokensCache | null): number {
  const p = precioModelo(modelo);
  const escritura = Math.max(0, cache?.cacheEscritura || 0);
  const escritura1h = Math.min(escritura, Math.max(0, cache?.cacheEscritura1h || 0));
  const lectura = Math.max(0, cache?.cacheLectura || 0);
  const normal = Math.max(0, tokensEntrada - escritura - lectura);
  return (normal * p.entrada + (escritura - escritura1h) * p.escrituraCache + escritura1h * p.escrituraCache1h +
    lectura * p.lecturaCache + tokensSalida * p.salida) / 1e6;
}

export function fmtUsd(v: number): string {
  return 'US$ ' + (v < 0.1 ? v.toFixed(3) : v.toFixed(2));
}

export const mediana = (a: readonly number[]): number => {
  const s = a.slice().sort((x, y) => x - y), k = s.length >> 1;
  return s.length % 2 ? s[k]! : (s[k - 1]! + s[k]!) / 2;
};

/** Ejecución registrada (se guarda en el navegador para calibrar las estimaciones). */
export interface CosteEjecucion {
  fecha: string;
  modelo: string;
  nivel: number;
  chars: number;
  entrada: number;
  salida: number;
  usd: number;
}

export interface EstimacionCoste {
  modelo: string;
  precio: PrecioModelo;
  entrada: number;
  salida: [number, number];
  /** Ejecuciones reales del mismo nivel y modelo usadas para calibrar. */
  muestras: number;
  min: number;
  max: number;
  /** Máximo posible: entrada + el tope completo de respuesta (exacto). */
  tope: number;
}

/**
 * Coste ANTES de generar: rango probable y máximo posible. El rango se calibra
 * con el historial de ejecuciones reales (caracteres por token y salida/entrada).
 */
export function estimarCosteGeneracion(
  charsTexto: number, nivel: number, modelo: string,
  historial: readonly CosteEjecucion[], maxCharsEntrada: number
): EstimacionCoste {
  const charsEntrada = Math.min(charsTexto, maxCharsEntrada) + PROMPT_GENERACION.length + 800;   // +800: reglas de fusión y profundidad
  const h = historial.filter((x) => x.modelo === modelo && x.entrada > 0 && x.chars > 0);
  const carPorToken = h.length ? mediana(h.map((x) => x.chars / x.entrada)) : CAR_POR_TOKEN_INICIAL;
  const entrada = Math.round(charsEntrada / carPorToken);
  const delNivel = h.filter((x) => x.nivel === nivel && x.salida > 0);
  let salida: readonly number[];
  if (delNivel.length) {
    // salida por token de entrada observada en este nivel, aplicada a este texto, ±30 %
    const ratio = mediana(delNivel.map((x) => x.salida / x.entrada));
    salida = [entrada * ratio * 0.7, entrada * ratio * 1.3];
  } else {
    salida = SALIDA_INICIAL[nivel] || SALIDA_INICIAL[2]!;
  }
  const s = salida.map((t) => Math.round(Math.min(GEN_MAX_TOKENS, Math.max(500, t)))) as [number, number];
  return {
    modelo, precio: precioModelo(modelo), entrada, salida: s, muestras: delNivel.length,
    min: usd(entrada, s[0], modelo), max: usd(entrada, s[1], modelo),
    tope: usd(entrada, GEN_MAX_TOKENS, modelo)
  };
}
