// Gasto de cada llamada a Claude tal como lo informa el worker (log y Pulse).
import type { UsoIa } from '@processiq/ia';

/**
 * Tokens de una llamada para Pulse y el log. `inputTokens` son todos los de
 * entrada, como siempre; si hubo caché de prompts, van además aparte los
 * escritos y los leídos, que Anthropic cobra a otro precio (el intermediario
 * informa con los mismos nombres). Sin caché, el cuerpo es el de antes.
 */
export function tokensParaPulse(u: UsoIa) {
  return {
    inputTokens: u.entrada,
    outputTokens: u.salida,
    ...(u.cacheEscritura ? { cacheCreationInputTokens: u.cacheEscritura } : {}),
    ...(u.cacheEscritura1h ? { cacheCreation1hInputTokens: u.cacheEscritura1h } : {}),
    ...(u.cacheLectura ? { cacheReadInputTokens: u.cacheLectura } : {})
  };
}
