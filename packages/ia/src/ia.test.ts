import { describe, expect, it, vi } from 'vitest';
import type { Nodo } from '@processiq/dominio';
import {
  GEN_MAX_TOKENS, PRECIOS_IA, PROMPT_GENERACION, REGLAS_FUSION, clasificarErrorIa, combinarFuentes, estimarCosteGeneracion, extraerJson,
  fmtUsd, interpretarPains, llamarClaude, marcarErrorIa, promptGeneracion, resumenProcesoParaIa, timeoutGeneracion, usd, validarEspecGeneracion
} from './index.js';

// --------------------------------------------------------------- SSE falso
function sse(eventos: object[]): string {
  return eventos.map((e: any) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
}
const respuestaTexto = (texto: string, extra: object[] = [], stop = 'end_turn') => sse([
  { type: 'message_start', message: { model: 'claude-opus-5', usage: { input_tokens: 100 } } },
  ...extra,
  { type: 'content_block_delta', delta: { type: 'text_delta', text: texto } },
  { type: 'message_delta', delta: { stop_reason: stop }, usage: { output_tokens: 50 } }
]);
const flujo = (texto: string, status = 200) => new Response(texto, { status, headers: { 'content-type': 'text/event-stream' } });
const entorno = (f: typeof fetch) => ({ proxyPorDefecto: 'https://mbc.ejemplo/ia', host: 'mbc.ejemplo', fetch: f, esperar: async () => {} });
const equipo = { modo: 'equipo', codigo: 'c0d1go', model: 'claude-opus-5' };

describe('llamarClaude', () => {
  it('modo equipo: va al intermediario con el código, en streaming y con respaldo en Opus', async () => {
    const f = vi.fn(async () => flujo(respuestaTexto('hola')));
    const uso = vi.fn();
    const r = await llamarClaude('pregunta', { system: 'S', effort: 'high', maxTokens: 8000, onUsage: uso }, equipo, entorno(f as never));
    expect(r).toBe('hola');
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://mbc.ejemplo/ia/v1/messages');
    expect(init.headers).toEqual({ 'content-type': 'application/json', 'x-processiq-code': 'c0d1go' });
    expect(JSON.parse(String(init.body))).toEqual({
      model: 'claude-opus-5', max_tokens: 8000, messages: [{ role: 'user', content: 'pregunta' }],
      system: 'S', output_config: { effort: 'high' }, fallbacks: 'default', stream: true
    });
    expect(uso).toHaveBeenCalledWith({ modelo: 'claude-opus-5', entrada: 100, salida: 50 });
  });

  it('el uso separa los tokens de la caché de prompts (dentro de la entrada), solo si los hubo', async () => {
    const f = vi.fn(async () => flujo(sse([
      { type: 'message_start', message: { model: 'claude-opus-5', usage: {
        input_tokens: 200, cache_creation_input_tokens: 300, cache_read_input_tokens: 500,
        cache_creation: { ephemeral_5m_input_tokens: 200, ephemeral_1h_input_tokens: 100 }, output_tokens: 1 } } },
      { type: 'content_block_delta', delta: { type: 'text_delta', text: 'ok' } },
      // message_delta repite el uso acumulado: no se suma dos veces
      { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: {
        input_tokens: 200, cache_creation_input_tokens: 300, cache_read_input_tokens: 500, output_tokens: 40 } }
    ])));
    const uso = vi.fn();
    await llamarClaude('p', { onUsage: uso }, equipo, entorno(f as never));
    const u = { modelo: 'claude-opus-5', entrada: 1000, salida: 40, cacheEscritura: 300, cacheEscritura1h: 100, cacheLectura: 500 };
    expect(uso).toHaveBeenCalledExactlyOnceWith(u);
    expect(usd(u.entrada, u.salida, u.modelo, u)).toBeCloseTo((200 * 5 + 200 * 6.25 + 100 * 10 + 500 * 0.5 + 40 * 25) / 1e6, 12);
    // Sin caché, el uso es el de siempre: ni siquiera aparecen los campos (también con ceros)
    const g = vi.fn(async () => flujo(sse([
      { type: 'message_start', message: { model: 'claude-opus-5', usage: { input_tokens: 100, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } } },
      { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 50 } }
    ])));
    const uso2 = vi.fn();
    await llamarClaude('p', { onUsage: uso2 }, equipo, entorno(g as never));
    expect(uso2).toHaveBeenCalledExactlyOnceWith({ modelo: 'claude-opus-5', entrada: 100, salida: 50 });
  });

  it('clave propia: directo a Anthropic con la cabecera beta del respaldo', async () => {
    const f = vi.fn(async () => flujo(respuestaTexto('x')));
    await llamarClaude('p', {}, { key: 'sk-ant-x', model: 'claude-opus-5' }, entorno(f as never));
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect((init.headers as Record<string, string>)['anthropic-beta']).toBe('server-side-fallback-2026-07-01');
  });

  it('un bloque de respaldo descarta el texto recibido antes', async () => {
    const f = async () => flujo(sse([
      { type: 'content_block_delta', delta: { type: 'text_delta', text: 'basura' } },
      { type: 'content_block_start', content_block: { type: 'fallback' } },
      { type: 'content_block_delta', delta: { type: 'text_delta', text: 'bueno' } }
    ]));
    expect(await llamarClaude('p', {}, equipo, entorno(f as never))).toBe('bueno');
  });

  it('reintenta una vez ante un fallo de red', async () => {
    let n = 0;
    const f = async () => { if (++n === 1) throw new TypeError('Failed to fetch'); return flujo(respuestaTexto('ok')); };
    expect(await llamarClaude('p', {}, equipo, entorno(f as never))).toBe('ok');
    expect(n).toBe(2);
  });

  it('dos fallos de red: mensaje sin suponer la red del usuario', async () => {
    const f = async () => { throw new TypeError('Failed to fetch'); };
    await expect(llamarClaude('p', {}, equipo, entorno(f as never))).rejects.toThrow(/tras dos intentos/);
  });

  it('traduce 401, 403 y 429', async () => {
    const con = (s: number) => async () => new Response('{}', { status: s });
    await expect(llamarClaude('p', {}, equipo, entorno(con(401) as never))).rejects.toThrow('Código de acceso del equipo incorrecto (401)');
    await expect(llamarClaude('p', {}, equipo, entorno(con(403) as never))).rejects.toThrow('(mbc.ejemplo no esta en ALLOWED_ORIGINS)');
    await expect(llamarClaude('p', {}, equipo, entorno(con(429) as never))).rejects.toThrow('Límite de uso alcanzado (429)');
  });

  it('max_tokens y refusal dan mensajes claros (y el uso se informa igual)', async () => {
    const uso = vi.fn();
    const f = async () => flujo(respuestaTexto('{"a":', [], 'max_tokens'));
    await expect(llamarClaude('p', { maxTokens: 64000, onUsage: uso }, equipo, entorno(f as never))).rejects.toThrow(/64,000 tokens/);
    expect(uso).toHaveBeenCalled();
    const g = async () => flujo(respuestaTexto('', [], 'refusal'));
    await expect(llamarClaude('p', {}, equipo, entorno(g as never))).rejects.toThrow(/rechazó la solicitud/);
  });

  it('exige código o clave', async () => {
    await expect(llamarClaude('p', {}, { modo: 'equipo' }, entorno(fetch))).rejects.toThrow(/código de acceso/);
    await expect(llamarClaude('p', {}, {}, entorno(fetch))).rejects.toThrow(/API key/);
  });
});

describe('extraerJson', () => {
  it('tolera fences y prosa', () => {
    expect(extraerJson('Aquí va:\n```json\n{"a":1}\n```\nfin')).toEqual({ a: 1 });
    expect(extraerJson('prefijo {"b":[1,2]} sufijo')).toEqual({ b: [1, 2] });
  });
  it('falla con respuestas vacías o sin JSON', () => {
    expect(() => extraerJson('')).toThrow('Respuesta vacía');
    expect(() => extraerJson('sin llaves')).toThrow('no devolvió JSON');
  });
});

describe('costes', () => {
  it('usd y formato', () => {
    expect(usd(1_000_000, 1_000_000, 'claude-sonnet-5')).toBe(12);
    expect(fmtUsd(0.0291)).toBe('US$ 0.029');
    expect(fmtUsd(1.234)).toBe('US$ 1.23');
  });

  it('la caché de prompts se cobra a su precio: escribir 1,25 × (2 × con TTL de 1 h) y leer 0,1 × la entrada', () => {
    // Sin caché, igual que antes (también con los campos a cero o nulos)
    expect(usd(1000, 500, 'claude-opus-5', {})).toBe(usd(1000, 500, 'claude-opus-5'));
    expect(usd(1000, 500, 'claude-opus-5', null)).toBe(usd(1000, 500, 'claude-opus-5'));
    // 1 M de entrada: 200 k normales, 300 k escritos (100 k con TTL de 1 h) y 500 k leídos; sin salida
    const cache = { cacheEscritura: 300_000, cacheEscritura1h: 100_000, cacheLectura: 500_000 };
    expect(usd(1_000_000, 0, 'claude-opus-5', cache)).toBeCloseTo(0.2 * 5 + 0.2 * 6.25 + 0.1 * 10 + 0.5 * 0.5, 9);
    expect(usd(1_000_000, 0, 'claude-sonnet-5', cache)).toBeCloseTo(0.2 * 2 + 0.2 * 2.5 + 0.1 * 4 + 0.5 * 0.2, 9);
    expect(usd(1_000_000, 0, 'claude-haiku-4-5', cache)).toBeCloseTo(0.2 * 1 + 0.2 * 1.25 + 0.1 * 2 + 0.5 * 0.1, 9);
    // Los multiplicadores de la documentación de Anthropic, en los tres modelos
    for (const p of Object.values(PRECIOS_IA)) {
      expect(p.escrituraCache).toBeCloseTo(p.entrada * 1.25, 9);
      expect(p.escrituraCache1h).toBeCloseTo(p.entrada * 2, 9);
      expect(p.lecturaCache).toBeCloseTo(p.entrada * 0.1, 9);
    }
    // Todo leído de la caché: una décima parte; un dato incoherente (más caché que entrada) no da negativos
    expect(usd(1000, 0, 'claude-opus-5', { cacheLectura: 1000 })).toBeCloseTo(usd(1000, 0, 'claude-opus-5') / 10, 12);
    expect(usd(100, 0, 'claude-opus-5', { cacheLectura: 1000 })).toBeGreaterThan(0);
  });

  it('estimación inicial sin historial y máximo exacto', () => {
    const e = estimarCosteGeneracion(30000, 2, 'claude-opus-5', [], 180000);
    expect(e.entrada).toBe(Math.round((30000 + PROMPT_GENERACION.length + 800) / 3));
    expect(e.salida).toEqual([10000, 30000]);
    expect(e.muestras).toBe(0);
    expect(e.tope).toBeCloseTo(usd(e.entrada, GEN_MAX_TOKENS, 'claude-opus-5'));
  });

  it('se calibra con ejecuciones reales del mismo nivel y modelo', () => {
    const h = [{ fecha: '', modelo: 'claude-opus-5', nivel: 2, chars: 40000, entrada: 10000, salida: 20000, usd: 0 }];
    const e = estimarCosteGeneracion(40000 - PROMPT_GENERACION.length - 800, 2, 'claude-opus-5', h, 180000);
    expect(e.entrada).toBe(10000);            // 4 car/token observados
    expect(e.salida).toEqual([14000, 26000]); // ratio 2 ± 30 %
    expect(e.muestras).toBe(1);
  });
});

describe('construcción de prompts', () => {
  it('generación: fusión, roles y profundidad', () => {
    const p = promptGeneracion('TEXTO', 'texto pegado', { roles: { 'Ana': 'Legal' }, vista: 1, variasFuentes: true, maxChars: 3 });
    expect(p.startsWith('Reconstruye el proceso descrito en el siguiente texto pegado como JSON BPMN')).toBe(true);
    expect(p).toContain(REGLAS_FUSION);
    expect(p).toContain('Ana = Legal');
    expect(p).toContain('=== PROFUNDIDAD PEDIDA ===\nEl consultor presentara esto a un comite.');
    expect(p.endsWith('=== CONTENIDO ===\nTEX')).toBe(true);
  });

  it('timeout según tamaño, con techo de 3 minutos', () => {
    expect(timeoutGeneracion('x'.repeat(2500))).toBe(91000);
    expect(timeoutGeneracion('x'.repeat(90000))).toBe(135000);
    expect(timeoutGeneracion('x'.repeat(10_000_000))).toBe(180000);
  });

  it('fuentes: reparto justo del presupuesto', () => {
    const f = (id: string, n: number) => ({ id, tipo: 'documento', nombre: id, texto: 'x'.repeat(n), chars: n });
    const out = combinarFuentes([f('a', 10), f('b', 100), f('c', 100)], 110);
    const partes = out.split('\n\n');
    expect(partes.map((p) => p.split('\n')[1]!.length)).toEqual([10, 50, 50]);
    expect(out.startsWith('=== FUENTE 1 de 3: "a" (documento) ===')).toBe(true);
    expect(combinarFuentes([f('solo', 5)], 1)).toBe('xxxxx');
  });

  it('resumen del proceso en orden de flujo', () => {
    const n = (id: string, type: Nodo['type'], label: string, extra: Partial<Nodo> = {}): Nodo => ({ id, type, x: 0, y: 0, w: 1, h: 1, label, ...extra });
    const r = resumenProcesoParaIa({
      meta: { name: 'P', industry: '', macroprocess: 'O2C' },
      nodes: [n('b', 'end', 'Fin'), n('a', 'start', 'Inicio', { owner: 'Cliente' })],
      edges: [{ id: 'e', from: 'a', to: 'b', label: 'Sí' }],
      lanes: { list: ['Cliente'], laneOf: {} }
    });
    expect(r).toBe('PROCESO: P\nINDUSTRIA: no indicada\nMACROPROCESO: O2C\nROLES/CARRILES: Cliente\n\nACTIVIDADES:\n' +
      'id=a - tipo=start - actividad=Inicio - rol=Cliente - salidas: Sí -> Fin\nid=b - tipo=end - actividad=Fin - rol=sin asignar');
  });

  it('pains: ignora nodos inexistentes y duplicados, acota valores', () => {
    const nodes: Nodo[] = [{ id: 'n1', type: 'task', x: 0, y: 0, w: 1, h: 1, label: 'A',
      pains: [{ id: 'p0', category: 'wait', description: 'Espera', severity: 3, frequency: 3 }] }];
    const r = interpretarPains({
      detectados: [
        { nodo: 'n1', descripcion: 'espera' },                                 // duplicado (sin mayúsculas)
        { nodo: 'n9', descripcion: 'X' },                                      // nodo inexistente
        { nodo: 'n1', descripcion: 'Reproceso', severidad: 9, frecuencia: 0 },
        { nodo: 'n1', descripcion: 'reproceso' }                               // duplicado dentro de la respuesta
      ],
      sectoriales: new Array(10).fill({ titulo: 'H' })
    }, nodes, 20);
    expect(r.agregados).toEqual([{ nodoId: 'n1', pain: {
      id: 'p20', category: 'manual', description: 'Reproceso', evidence: '', impact: '', severity: 5, frequency: 3, source: 'ia'
    } }]);
    expect(r.sectoriales).toHaveLength(8);
    expect(r.siguienteId).toBe(21);
  });
});

describe('modo servidor (worker de la API)', () => {
  const servidor = { modo: 'servidor', key: 'sk-ant-servidor', model: 'claude-sonnet-5' };

  it('va a la URL configurada con la clave, sin la cabecera de acceso directo del navegador', async () => {
    const f = vi.fn(async () => flujo(respuestaTexto('ok')));
    const r = await llamarClaude('p', { maxTokens: 100 }, servidor, { ...entorno(f as never), urlApi: 'http://127.0.0.1:9999/' });
    expect(r).toBe('ok');
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://127.0.0.1:9999/v1/messages');
    expect(init.headers).toEqual({ 'content-type': 'application/json', 'x-api-key': 'sk-ant-servidor', 'anthropic-version': '2023-06-01' });
  });

  it('sin clave o con clave inválida, mensajes para quien administra el servidor', async () => {
    await expect(llamarClaude('p', {}, { modo: 'servidor' }, entorno(vi.fn() as never))).rejects.toThrow('ANTHROPIC_API_KEY');
    const f = vi.fn(async () => new Response('{}', { status: 401 }));
    await expect(llamarClaude('p', {}, servidor, entorno(f as never))).rejects.toThrow('clave de Anthropic del servidor');
  });
});

// --------------------------------------------------- respuestas cortadas a mitad
const INICIO = sse([
  { type: 'message_start', message: { model: 'claude-opus-5', usage: { input_tokens: 700 } } },
  { type: 'content_block_delta', delta: { type: 'text_delta', text: '{"nodes":' } }
]);
/** Llega el inicio de la respuesta y después se corta la red o no llega nada más hasta que se aborta. */
function cortada(corte: 'red' | 'colgada', inicio = INICIO) {
  return async (_url: string, init: RequestInit) => {
    let n = 0;
    return new Response(new ReadableStream<Uint8Array>({
      pull(ctrl) {
        if (n++ === 0) { ctrl.enqueue(new TextEncoder().encode(inicio)); return; }
        if (corte === 'red') { ctrl.error(new TypeError('terminated')); return; }
        return new Promise<void>((listo) => init.signal!.addEventListener('abort', () => {
          ctrl.error(Object.assign(new Error('abortada'), { name: 'AbortError' }));
          listo();
        }));
      }
    }), { status: 200, headers: { 'content-type': 'text/event-stream' } });
  };
}
/** El error con el que falla la promesa. */
async function falloDe(p: Promise<unknown>): Promise<Error & { claseIa?: string }> {
  try { await p; } catch (e) { return e as Error; }
  throw new Error('la llamada no falló');
}

describe('llamadas cortadas a mitad', () => {
  const servidor = { modo: 'servidor', key: 'sk-ant-servidor', model: 'claude-opus-5' };

  it('corte de red: onUsoParcial recibe la entrada de message_start; onUsage no se llama', async () => {
    const uso = vi.fn(), parcial = vi.fn();
    const e = await falloDe(llamarClaude('p', { onUsage: uso, onUsoParcial: parcial }, servidor, entorno(cortada('red') as never)));
    expect(e.message).toBe('Se cortó la conexión mientras la IA respondía (terminated).');
    expect(parcial).toHaveBeenCalledExactlyOnceWith({ modelo: 'claude-opus-5', entrada: 700, salida: 0 });
    expect(uso).not.toHaveBeenCalled();
  });

  it('inactividad y cancelación también informan lo recibido, con la salida de message_delta si llegó', async () => {
    const parcial = vi.fn();
    const conSalida = INICIO + sse([{ type: 'message_delta', delta: {}, usage: { output_tokens: 40 } }]);
    const e = await falloDe(llamarClaude('p', { timeoutMs: 30, onUsoParcial: parcial }, servidor, entorno(cortada('colgada', conSalida) as never)));
    expect(e.message).toMatch(/^La IA dejó de responder durante 0 s y se canceló/);
    expect(parcial).toHaveBeenCalledExactlyOnceWith({ modelo: 'claude-opus-5', entrada: 700, salida: 40 });

    const ctrl = new AbortController();
    const cancelada = vi.fn();
    const p = llamarClaude('p', { onUsoParcial: cancelada }, servidor,
      { ...entorno(cortada('colgada') as never), senalCancelacion: ctrl.signal, cancelado: () => ctrl.signal.aborted });
    setTimeout(() => ctrl.abort(), 20);
    expect((await falloDe(p)).message).toBe('CANCELLED');
    expect(cancelada).toHaveBeenCalledExactlyOnceWith({ modelo: 'claude-opus-5', entrada: 700, salida: 0 });
  });

  it('el editor (sin onUsoParcial) se comporta igual que antes: nada que informar', async () => {
    const uso = vi.fn();
    const e = await falloDe(llamarClaude('p', { onUsage: uso }, equipo, entorno(cortada('red') as never)));
    expect(e.message).toBe('Se cortó la conexión mientras la IA respondía (terminated).');
    expect(uso).not.toHaveBeenCalled();
  });

  it('un fallo antes de la respuesta no informa uso: no hubo consumo', async () => {
    const parcial = vi.fn();
    await falloDe(llamarClaude('p', { onUsoParcial: parcial }, servidor, entorno((async () => new Response('{}', { status: 529 })) as never)));
    expect(parcial).not.toHaveBeenCalled();
  });
});

describe('clase de los errores de llamarClaude', () => {
  const servidor = { modo: 'servidor', key: 'sk-ant-servidor', model: 'claude-opus-5' };
  const con = (status: number, cuerpo = '{}') => (async () => new Response(cuerpo, { status })) as never;
  const clase = async (f: never, opts = {}, cfg: object = servidor, extra = {}) => {
    const e = await falloDe(llamarClaude('p', opts, cfg, { ...entorno(f), ...extra }));
    return { mensaje: e.message, clase: e.claseIa };
  };

  it('marca la clase en el error sin cambiar el mensaje', async () => {
    expect(await clase(con(529, '{"error":{"message":"Overloaded"}}'))).toEqual({ mensaje: 'Error 529: Overloaded', clase: 'transitorio' });
    expect(await clase(con(500, '{"error":{"message":"Internal"}}'))).toEqual({ mensaje: 'Error 500: Internal', clase: 'transitorio' });
    expect(await clase(con(429))).toEqual({ mensaje: 'Límite de uso alcanzado (429). Espera unos segundos y reintenta.', clase: 'transitorio' });
    expect(await clase(con(401))).toEqual({ mensaje: 'La clave de Anthropic del servidor no es válida o fue revocada (401): revisa ANTHROPIC_API_KEY.', clase: 'definitivo' });
    expect(await clase(con(400, '{"error":{"message":"bad"}}'))).toEqual({ mensaje: 'Error 400: bad', clase: 'definitivo' });
    expect((await clase((async () => { throw new TypeError('Failed to fetch'); }) as never)).clase).toBe('transitorio');
    expect((await clase(cortada('red') as never)).clase).toBe('transitorio');
    expect((await clase(cortada('colgada') as never, { timeoutMs: 30 })).clase).toBe('transitorio');
    expect((await clase((async () => flujo(respuestaTexto('', [], 'refusal'))) as never)).clase).toBe('definitivo');
    expect((await clase((async () => flujo(respuestaTexto('{', [], 'max_tokens'))) as never)).clase).toBe('definitivo');
    expect((await clase(vi.fn() as never, {}, { modo: 'servidor' })).clase).toBe('definitivo');
    expect(await clase(cortada('colgada') as never, { timeoutMs: 30 }, servidor, { cancelado: () => true }))
      .toEqual({ mensaje: 'CANCELLED', clase: 'cancelado' });
  });

  it('errores a mitad del stream: por el tipo del evento; sin tipo, sin marca (decide el texto)', async () => {
    const conError = (error: object) => (async () => flujo(respuestaTexto('x', [{ type: 'error', error }]))) as never;
    expect(await clase(conError({ type: 'overloaded_error', message: 'Overloaded' })))
      .toEqual({ mensaje: 'La IA devolvió un error a mitad de la respuesta: Overloaded', clase: 'transitorio' });
    expect((await clase(conError({ type: 'api_error', message: 'Internal server error' }))).clase).toBe('transitorio');
    expect((await clase(conError({ type: 'invalid_request_error', message: 'mal' }))).clase).toBe('definitivo');
    expect((await clase(conError({ message: 'raro' }))).clase).toBeUndefined();
  });

  it('la marca no se enumera: el error se serializa y se copia igual que antes', async () => {
    const e = await falloDe(llamarClaude('p', {}, servidor, entorno(con(529))));
    expect(Object.keys(e)).toEqual([]);
    expect(JSON.stringify(e)).toBe('{}');
    expect({ ...e }).toEqual({});
  });
});

describe('especificación de la generación', () => {
  it('valida la forma mínima que dibuja el editor', () => {
    expect(validarEspecGeneracion({ nodes: [{ k: 'a1', type: 'task', label: 'Registrar' }], edges: [{ from: 'a1', to: 'a2' }] }).ok).toBe(true);
    const r = validarEspecGeneracion({ nodes: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errores[0]).toContain('no devolvió actividades');
    expect(validarEspecGeneracion({ nodes: [{ label: 'sin k' }] }).ok).toBe(false);
  });

  it('clasifica los errores: se reintenta solo lo pasajero', () => {
    expect(clasificarErrorIa(new Error('CANCELLED'))).toBe('cancelado');
    expect(clasificarErrorIa(new Error('Error 529: Overloaded'))).toBe('transitorio');
    expect(clasificarErrorIa(new Error('Límite de uso alcanzado (429). Espera unos segundos y reintenta.'))).toBe('transitorio');
    expect(clasificarErrorIa(new Error('No se pudo conectar con Anthropic tras dos intentos.'))).toBe('transitorio');
    expect(clasificarErrorIa(new Error('La clave de Anthropic del servidor no es válida o fue revocada (401)'))).toBe('definitivo');
    expect(clasificarErrorIa(new Error('El modelo rechazó la solicitud por políticas de seguridad.'))).toBe('definitivo');
  });

  it('manda la clase marcada en el error; el texto solo si no la trae', () => {
    // La marca gana aunque el texto diga otra cosa
    expect(clasificarErrorIa(marcarErrorIa(new Error('Error 529: Overloaded'), 'definitivo'))).toBe('definitivo');
    expect(clasificarErrorIa(marcarErrorIa(new Error('Un mensaje cualquiera'), 'transitorio'))).toBe('transitorio');
    expect(clasificarErrorIa(marcarErrorIa(new Error('otro'), 'cancelado'))).toBe('cancelado');
    // Una marca que no es una clase conocida se ignora
    expect(clasificarErrorIa(Object.assign(new Error('Error 503: x'), { claseIa: 'rara' }))).toBe('transitorio');
    expect(clasificarErrorIa('Se cortó la conexión mientras la IA respondía')).toBe('transitorio');
    expect(clasificarErrorIa(null)).toBe('definitivo');
  });

  it('los errores de llamarClaude se clasifican por su marca', async () => {
    const f = async () => new Response('{"error":{"type":"invalid_request_error","message":"overloaded es una palabra del cuerpo"}}', { status: 400 });
    const e = await falloDe(llamarClaude('p', {}, equipo, entorno(f as never)));
    // Por el texto sería «transitorio» (contiene «overloaded»); el estado 400 lo marca definitivo
    expect(e.message).toBe('Error 400: overloaded es una palabra del cuerpo');
    expect(clasificarErrorIa(e)).toBe('definitivo');
  });
});
