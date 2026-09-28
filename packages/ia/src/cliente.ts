// Cliente de la API de mensajes de Anthropic en streaming (SSE).
// Portado del MVP 3.8.9 (callClaude) con los mismos mensajes de error. Lo que
// dependía del navegador (configuración en localStorage, cancelación de la
// ingesta, dominio actual) llega como parámetro.

export interface ConfigIa {
  /**
   * 'equipo' = vía intermediario con código; 'servidor' = desde la API/worker
   * con la clave del servidor (sin cabeceras de navegador); cualquier otro
   * valor = clave propia desde el navegador.
   */
  modo?: string;
  codigo?: string;
  key?: string;
  proxyUrl?: string;
  model?: string;
}

export interface UsoIa { modelo: string; entrada: number; salida: number }

export interface OpcionesLlamada {
  system?: string;
  effort?: string;
  maxTokens?: number;
  /** Límite de INACTIVIDAD (ms sin recibir datos); por defecto 90 s. */
  timeoutMs?: number;
  onProgress?: (caracteres: number) => void;
  /** Se llama antes de los errores: una respuesta cortada también se cobra. */
  onUsage?: (uso: UsoIa) => void;
  /**
   * Solo lo pasa el worker de la API. Si la respuesta se corta a mitad
   * (cancelación, inactividad, corte de red o apagado del worker), recibe lo
   * que se sabía hasta el corte: la entrada de message_start y la salida de
   * message_delta, si llegó. Anthropic cobra ese consumo aunque no termine.
   * El editor no lo pasa, así que su historial de costes no cambia.
   */
  onUsoParcial?: (uso: UsoIa) => void;
}

/** Clase de un fallo de la IA: decide si el worker lo reintenta (clasificarErrorIa). */
export type ClaseErrorIa = 'cancelado' | 'transitorio' | 'definitivo';

/**
 * Marca la clase en el propio error (propiedad `claseIa`) sin tocar el mensaje,
 * que el editor muestra y la fidelidad compara. No es enumerable: no aparece
 * al serializar ni al copiar el error.
 */
export function marcarErrorIa<E extends Error>(error: E, clase: ClaseErrorIa): E {
  Object.defineProperty(error, 'claseIa', { value: clase, enumerable: false, writable: true, configurable: true });
  return error;
}

const errorIa = (mensaje: string, clase: ClaseErrorIa) => marcarErrorIa(new Error(mensaje), clase);

/** Errores a mitad del stream (evento `error`) que suelen pasar solos: se reintentan. */
const TIPOS_SSE_TRANSITORIOS = new Set(['overloaded_error', 'api_error', 'rate_limit_error']);

export interface Entorno {
  /** Intermediario por defecto si la configuración no trae uno. */
  proxyPorDefecto: string;
  /** Host que se nombra en el error 403 (origen no permitido). */
  host: string;
  /** Señal del botón Cancelar, si hay un trabajo en curso al empezar la llamada. */
  senalCancelacion?: AbortSignal | null;
  /** ¿Canceló el usuario? Se consulta en el momento del error, no al empezar. */
  cancelado?: () => boolean;
  /** Lanza Error('CANCELLED') si el usuario canceló. */
  comprobarCancelado?: () => void;
  fetch?: typeof fetch;
  esperar?: (ms: number) => Promise<void>;
  /** Solo en modo servidor: base de la API de Anthropic (pruebas con un servidor falso). */
  urlApi?: string;
}

export async function llamarClaude(userText: string, opts: OpcionesLlamada, cfg: ConfigIa, entorno: Entorno): Promise<string> {
  opts = opts || {};
  const hacerFetch = entorno.fetch ?? fetch;
  const esperar = entorno.esperar ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const senal = entorno.senalCancelacion ?? null;
  const cancelado = () => !!entorno.cancelado?.();
  const equipo = cfg.modo === 'equipo';
  const servidor = cfg.modo === 'servidor';
  const key = (cfg.key || '').trim(), codigo = (cfg.codigo || '').trim();
  if (equipo && !codigo) throw errorIa('Falta el código de acceso del equipo. Configúralo en Ajustes de IA (✨).', 'definitivo');
  if (!equipo && !key) {
    throw errorIa(servidor ? 'El servidor no tiene configurada la clave de Anthropic (ANTHROPIC_API_KEY).' : 'Falta la API key. Configúrala en Ajustes de IA (✨).', 'definitivo');
  }
  // Modo equipo: la clave NO sale del intermediario; aquí solo viaja el código.
  const destino = equipo
    ? (cfg.proxyUrl || entorno.proxyPorDefecto).replace(/\/+$/, '') + '/v1/messages'
    : servidor
      ? (entorno.urlApi || 'https://api.anthropic.com').replace(/\/+$/, '') + '/v1/messages'
      : 'https://api.anthropic.com/v1/messages';
  const cabeceras: Record<string, string> = equipo
    ? { 'content-type': 'application/json', 'x-processiq-code': codigo }
    : servidor
      ? { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' }
      : { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true' };
  const body: Record<string, unknown> & { model: string; max_tokens: number } = {
    model: cfg.model || 'claude-opus-5',
    max_tokens: opts.maxTokens || 16000,
    messages: [{ role: 'user', content: userText }]
  };
  if (opts.system) body.system = opts.system;
  if (opts.effort) body.output_config = { effort: opts.effort };
  // Si los clasificadores declinan, la API repite con el modelo de respaldo en
  // la misma llamada. En modo equipo la cabecera beta la pone el intermediario.
  if (String(body.model).indexOf('claude-opus-5') === 0) body.fallbacks = 'default';
  if (body.fallbacks && !equipo) cabeceras['anthropic-beta'] = 'server-side-fallback-2026-07-01';
  // Streaming: el límite es de INACTIVIDAD, no de duración total.
  body.stream = true;
  const ctrl = new AbortController();
  const timeoutMs = opts.timeoutMs || 90000;
  let timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const rearmar = () => { clearTimeout(timer); timer = setTimeout(() => ctrl.abort(), timeoutMs); };
  const onCancel = () => ctrl.abort();
  if (senal) senal.addEventListener('abort', onCancel);
  const limpiar = () => {
    clearTimeout(timer);
    if (senal) { try { senal.removeEventListener('abort', onCancel); } catch { /* nada */ } }
  };
  // Un fallo de RED al conectar suele ser pasajero: se reintenta UNA vez tras
  // una breve espera. No aplica a cancelación ni a inactividad.
  const conectar = async (intento: number): Promise<Response> => {
    try {
      return await hacerFetch(destino, { method: 'POST', headers: cabeceras, body: JSON.stringify(body), signal: ctrl.signal });
    } catch (e) {
      if ((e as Error).name !== 'AbortError' && intento === 1) {
        await esperar(1200);
        entorno.comprobarCancelado?.();
        return conectar(2);
      }
      throw e;
    }
  };
  let res: Response;
  try {
    res = await conectar(1);
  } catch (err) {
    const e = err as Error;
    limpiar();
    if (String(e.message) === 'CANCELLED') throw e;
    if (e.name === 'AbortError') {
      if (cancelado()) throw errorIa('CANCELLED', 'cancelado');
      throw errorIa('La IA tardó más de ' + Math.round(timeoutMs / 1000) + 's y se canceló. Prueba con un documento más corto o con el modelo Sonnet (más rápido) en Ajustes de IA.', 'transitorio');
    }
    // "Failed to fetch" no distingue la causa (el navegador la oculta).
    throw errorIa(equipo
      ? 'No se pudo conectar con el servicio de IA (' + destino.replace('/v1/messages', '') + ') tras dos intentos. Puede ser un corte de conexión, un proxy corporativo o un bloqueador de anuncios/privacidad del navegador. Vuelve a intentarlo; si persiste, prueba desde otra red. (' + e.message + ')'
      : 'No se pudo conectar con Anthropic tras dos intentos. Revisa tu conexión a internet. (' + e.message + ')', 'transitorio');
  }
  if (!res.ok) {
    let msg = 'Error ' + res.status;
    // any explícito: con los tipos de Node (la API compila esta fuente) json() devuelve unknown
    try { const j: any = await res.json(); msg += ': ' + (j.error?.message || JSON.stringify(j).slice(0, 200)); } catch { /* sin cuerpo */ }
    if (res.status === 401) msg = equipo ? 'Código de acceso del equipo incorrecto (401). Revísalo en Ajustes de IA.'
                                 : servidor ? 'La clave de Anthropic del servidor no es válida o fue revocada (401): revisa ANTHROPIC_API_KEY.'
                                 : 'API key inválida o revocada (401). Revísala en Ajustes de IA.';
    if (res.status === 403 && equipo) msg = 'El intermediario rechazó este origen (403): abre la app desde su dominio oficial (' + entorno.host + ' no esta en ALLOWED_ORIGINS).';
    if (res.status === 429) msg = 'Límite de uso alcanzado (429). Espera unos segundos y reintenta.';
    limpiar();
    // 429 y 5xx (529 = sobrecarga) pasan solos; el resto no cambia al repetir
    throw errorIa(msg, res.status === 429 || res.status >= 500 ? 'transitorio' : 'definitivo');
  }

  // Solo se acumulan los deltas de TEXTO (el razonamiento llega en bloques
  // thinking y se ignora). Un bloque 'fallback' descarta lo recibido: el modelo
  // de respaldo repite la respuesta entera.
  let texto = '', stop: string | null = null, errorSse: string | null = null, tipoErrorSse = '', buf = '';
  const uso: UsoIa = { modelo: body.model, entrada: 0, salida: 0 };
  const tokensEntrada = (u: Record<string, number>) => (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
  const lector = res.body!.getReader();
  const dec = new TextDecoder();
  try {
    for (;;) {
      const paso = await lector.read();
      if (paso.done) break;
      rearmar();
      buf += dec.decode(paso.value, { stream: true }).replace(/\r\n/g, '\n');
      let corte: number;
      while ((corte = buf.indexOf('\n\n')) !== -1) {
        const evento = buf.slice(0, corte);
        buf = buf.slice(corte + 2);
        const linea = evento.split('\n').find((l) => l.indexOf('data:') === 0);
        if (!linea) continue;
        let d: any;
        try { d = JSON.parse(linea.slice(5).trim()); } catch { continue; }
        if (d.type === 'message_start' && d.message) {
          if (d.message.usage) uso.entrada = Math.max(uso.entrada, tokensEntrada(d.message.usage));
          if (d.message.model) uso.modelo = d.message.model;
        } else if (d.type === 'content_block_start' && d.content_block && d.content_block.type === 'fallback') {
          texto = '';
        } else if (d.type === 'content_block_delta' && d.delta && d.delta.type === 'text_delta') {
          texto += d.delta.text;
          if (opts.onProgress) opts.onProgress(texto.length);
        } else if (d.type === 'message_delta') {
          if (d.delta && d.delta.stop_reason) stop = d.delta.stop_reason;
          if (d.usage) {
            uso.salida = Math.max(uso.salida, d.usage.output_tokens || 0);
            uso.entrada = Math.max(uso.entrada, tokensEntrada(d.usage));
          }
        } else if (d.type === 'error') {
          errorSse = (d.error && d.error.message) || 'error desconocido';
          tipoErrorSse = (d.error && typeof d.error.type === 'string') ? d.error.type : '';
        }
      }
    }
  } catch (err) {
    const e = err as Error;
    // Cortada a mitad: lo recibido hasta aquí también se cobra (solo el worker lo pide)
    if (opts.onUsoParcial && (uso.entrada || uso.salida)) { try { opts.onUsoParcial(uso); } catch { /* nada */ } }
    if (e.name === 'AbortError') {
      if (cancelado()) throw errorIa('CANCELLED', 'cancelado');
      throw errorIa('La IA dejó de responder durante ' + Math.round(timeoutMs / 1000) + ' s y se canceló. Vuelve a intentarlo; si se repite, prueba con un documento más corto o con el modelo Sonnet (más rápido) en Ajustes de IA.', 'transitorio');
    }
    throw errorIa('Se cortó la conexión mientras la IA respondía (' + e.message + ').', 'transitorio');
  } finally {
    limpiar();
  }
  if (opts.onUsage && (uso.entrada || uso.salida)) { try { opts.onUsage(uso); } catch { /* nada */ } }
  if (errorSse) {
    const e = new Error('La IA devolvió un error a mitad de la respuesta: ' + errorSse);
    // Sin tipo en el evento, clasificarErrorIa decide por el texto
    throw tipoErrorSse ? marcarErrorIa(e, TIPOS_SSE_TRANSITORIOS.has(tipoErrorSse) ? 'transitorio' : 'definitivo') : e;
  }
  if (stop === 'refusal') throw errorIa('El modelo rechazó la solicitud por políticas de seguridad.', 'definitivo');
  // Lo que se corta es la RESPUESTA, no el texto de entrada.
  if (stop === 'max_tokens') throw errorIa('El proceso que generó la IA es más largo de lo que puede devolver en una sola respuesta (' + body.max_tokens.toLocaleString('es-PE') + ' tokens). Tu texto está bien: vuelve a generarlo eligiendo el nivel "Actividad" o "Ejecutivo", o divide el procedimiento por capítulos.', 'definitivo');
  return texto.trim();
}

/** Primer objeto JSON de una respuesta (tolera ```json y prosa alrededor). */
export function extraerJson(txt: string | null | undefined): any {
  if (!txt) throw new Error('Respuesta vacía de la IA.');
  let s = txt.replace(/```json/gi, '```').trim();
  const fence = s.match(/```([\s\S]*?)```/);
  if (fence) s = fence[1]!.trim();
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a === -1 || b === -1) throw new Error('La IA no devolvió JSON.');
  return JSON.parse(s.slice(a, b + 1));
}
