/* ============================================================
 * ProcessIQ — intermediario de la API de Anthropic (contenedor Node)
 *
 * Por que existe: la web es publica. Una API key escrita en ella la podria
 * copiar cualquiera. Aqui la clave vive como variable de entorno del
 * contenedor; el navegador nunca la ve. Los usuarios entran con un codigo de
 * equipo.
 *
 * Es el port del Cloudflare Worker del MVP (worker/processiq-api.js) con el
 * MISMO contrato, para que app.js no cambie:
 *   POST /v1/messages   cabecera x-processiq-code + JSON de la API de Anthropic
 *                       respuesta: la de Anthropic tal cual (SSE incluido)
 *   GET  /health        { ok, configurado, formatoClave }  (sin codigo)
 * Caddy lo publica bajo {DOMINIO}/ia/* (mismo origen que la web).
 *
 * Sirve al editor libre (/, sin proyecto) en el modo "Clave del equipo". Los
 * procesos de proyectos no lo usan: su IA pasa por la API, con sesion,
 * permisos y presupuesto (docs/arquitectura.md §8). Se podra retirar cuando el
 * editor libre deje de ofrecer ese modo.
 *
 * Variables de entorno:
 *   ANTHROPIC_API_KEY  clave de console.anthropic.com
 *   ACCESS_CODE        codigo que se reparte al equipo
 *   ALLOWED_ORIGINS    origenes permitidos, separados por coma. Sin ninguno
 *                      rechaza todo. En Docker, por defecto https://$DOMINIO;
 *                      en desarrollo, http://localhost:5173 (la web de Vite)
 *   PULSE_URL          (opcional) endpoint donde reportar el gasto de IA
 *   PULSE_TOKEN        (opcional) credencial para PULSE_URL (Bearer)
 *   PORT               (opcional) por defecto 8787
 *
 * Desarrollo: pnpm --filter @processiq/intermediario dev (scripts/dev.mjs) lee
 * .env.dev, o .env si no existe.
 * ============================================================ */

import { serve } from '@hono/node-server';
import { Hono } from 'hono';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODELOS = new Set(['claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5']);
const MAX_TOKENS = 64000;
const MAX_BODY = 2 * 1024 * 1024;

// Recortados: un espacio o salto de linea pegado por error al cargarlos
// invalidaria la clave o el codigo sin que se viera.
const CLAVE = (process.env.ANTHROPIC_API_KEY ?? '').trim();
const CODIGO = (process.env.ACCESS_CODE ?? '').trim();
const ORIGENES = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',').map((s) => s.trim()).filter(Boolean);
const PULSE_URL = (process.env.PULSE_URL ?? '').trim();
const PULSE_TOKEN = (process.env.PULSE_TOKEN ?? '').trim();
const PUERTO = Number(process.env.PORT ?? 8787);

type Uso = { inputTokens: number; outputTokens: number };

// Lee la copia del stream (no la que ve el usuario) y saca los tokens reales.
// Nunca lanza: sin dato, null.
async function extraerUso(stream: ReadableStream<Uint8Array>, esStreaming: boolean): Promise<Uso | null> {
  try {
    const texto = await new Response(stream).text();
    if (!esStreaming) {
      const u = JSON.parse(texto).usage;
      return u ? { inputTokens: u.input_tokens || 0, outputTokens: u.output_tokens || 0 } : null;
    }
    // SSE: el input llega en message_start; el output final, en el ultimo
    // message_delta (su usage.output_tokens es acumulado, no incremental).
    let inputTokens = 0, outputTokens = 0, visto = false;
    for (const linea of texto.split('\n')) {
      if (!linea.startsWith('data:')) continue;
      let ev: any;
      try { ev = JSON.parse(linea.slice(5).trim()); } catch { continue; }
      if (ev.type === 'message_start' && ev.message?.usage) {
        inputTokens = ev.message.usage.input_tokens || 0; visto = true;
      } else if (ev.type === 'message_delta' && ev.usage) {
        outputTokens = ev.usage.output_tokens || 0; visto = true;
      }
    }
    return visto ? { inputTokens, outputTokens } : null;
  } catch {
    return null;
  }
}

async function registrarGasto(model: string, uso: Uso | null): Promise<void> {
  if (!uso) return;
  console.info(JSON.stringify({ evento: 'gasto_ia', model, ...uso }));
  if (!PULSE_URL) return;
  try {
    await fetch(PULSE_URL, {
      method: 'POST',
      headers: Object.assign(
        { 'content-type': 'application/json' },
        PULSE_TOKEN ? { authorization: 'Bearer ' + PULSE_TOKEN } : {}
      ),
      body: JSON.stringify({ tool: 'processiq', provider: 'anthropic', model, ...uso })
    });
  } catch { /* el registro de gasto nunca debe afectar la respuesta al usuario */ }
}

function origenPermitido(req: Request): string | null {
  const origen = req.headers.get('Origin') || '';
  return ORIGENES.includes(origen) ? origen : null;
}

function cabecerasCors(origen: string | null): Record<string, string> {
  const h: Record<string, string> = { Vary: 'Origin' };
  if (origen) {
    h['Access-Control-Allow-Origin'] = origen;
    h['Access-Control-Allow-Methods'] = 'POST, GET, OPTIONS';
    h['Access-Control-Allow-Headers'] = 'content-type, x-processiq-code';
    h['Access-Control-Max-Age'] = '86400';
  }
  return h;
}

function responderJson(obj: unknown, status: number, extra?: Record<string, string>): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: Object.assign({ 'content-type': 'application/json; charset=utf-8' }, extra || {})
  });
}

function error(msg: string, status: number, cors: Record<string, string>): Response {
  return responderJson({ type: 'error', error: { type: 'processiq_proxy', message: msg } }, status, cors);
}

// Comparacion en tiempo constante: que el tiempo de respuesta no delate
// cuantos caracteres del codigo son correctos.
function igualSeguro(a: string, b: string): boolean {
  const te = new TextEncoder();
  const x = te.encode(a || ''), y = te.encode(b || '');
  let dif = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) dif |= (x[i] || 0) ^ (y[i] || 0);
  return dif === 0;
}

export const app = new Hono();

app.get('/health', (c) => {
  const cors = cabecerasCors(origenPermitido(c.req.raw));
  return responderJson({
    ok: true, servicio: 'processiq-intermediario',
    configurado: !!(CLAVE && CODIGO),
    // Solo dice si el valor TIENE FORMATO de clave de Anthropic; no revela nada.
    formatoClave: !CLAVE ? 'vacia' : (/^sk-ant-[A-Za-z0-9_-]{80,}$/.test(CLAVE) ? 'ok' : 'sospechoso')
  }, 200, cors);
});

app.options('*', (c) => {
  const origen = origenPermitido(c.req.raw);
  return new Response(null, { status: origen ? 204 : 403, headers: cabecerasCors(origen) });
});

app.post('/v1/messages', async (c) => {
  const req = c.req.raw;
  const origen = origenPermitido(req);
  const cors = cabecerasCors(origen);
  if (!origen) return error('Origen no permitido', 403, cors);
  if (!CLAVE || !CODIGO) return error('El intermediario no tiene configurados sus secretos', 500, cors);
  if (!igualSeguro(req.headers.get('x-processiq-code') || '', CODIGO)) {
    return error('Codigo de acceso incorrecto', 401, cors);
  }
  if (+(req.headers.get('content-length') || 0) > MAX_BODY) {
    return error('El documento es demasiado grande para una sola llamada', 413, cors);
  }

  let texto: string;
  try { texto = await req.text(); } catch { return error('Cuerpo invalido', 400, cors); }
  if (Buffer.byteLength(texto) > MAX_BODY) {
    return error('El documento es demasiado grande para una sola llamada', 413, cors);
  }
  let body: any;
  try { body = JSON.parse(texto); } catch { return error('Cuerpo JSON invalido', 400, cors); }
  if (!body || !MODELOS.has(body.model)) return error('Modelo no permitido: ' + (body && body.model), 400, cors);
  body.max_tokens = Math.min(Math.max(1, +body.max_tokens || 1024), MAX_TOKENS);
  if (body.fallbacks !== undefined && body.fallbacks !== 'default') delete body.fallbacks;

  let r: Response;
  try {
    r = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: Object.assign(
        { 'content-type': 'application/json', 'x-api-key': CLAVE, 'anthropic-version': '2023-06-01' },
        body.fallbacks ? { 'anthropic-beta': 'server-side-fallback-2026-07-01' } : {}
      ),
      body: JSON.stringify(body),
      signal: req.signal
    });
  } catch {
    return error('No se pudo contactar con Anthropic desde el intermediario', 502, cors);
  }
  // Un 401 de Anthropic significa que falla la CLAVE CENTRAL, no el codigo del usuario.
  if (r.status === 401) return error('Anthropic rechazo la clave central del intermediario', 502, cors);

  const salida = new Headers(cors);
  const contentType = r.headers.get('content-type') || 'application/json';
  salida.set('content-type', contentType);
  if (contentType.includes('event-stream')) salida.set('cache-control', 'no-cache');

  if (r.ok && r.body) {
    const [aCliente, aRegistro] = r.body.tee();
    const esStreaming = contentType.includes('event-stream');
    // En segundo plano: no bloquea ni puede romper la respuesta.
    extraerUso(aRegistro, esStreaming).then((uso) => registrarGasto(body.model, uso)).catch(() => {});
    return new Response(aCliente, { status: r.status, headers: salida });
  }
  return new Response(r.body, { status: r.status, headers: salida });
});

app.notFound((c) => error('Ruta no encontrada', 404, cabecerasCors(origenPermitido(c.req.raw))));

if (process.env.NODE_ENV !== 'test') {
  serve({ fetch: app.fetch, port: PUERTO }, (info) => {
    console.info(JSON.stringify({
      evento: 'arranque', puerto: info.port, configurado: !!(CLAVE && CODIGO), origenes: ORIGENES
    }));
  });
}
