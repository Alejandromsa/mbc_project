import { beforeAll, describe, expect, it, vi } from 'vitest';

const ORIGEN = 'https://mbc.ejemplo.test';
let app: { request: (input: string, init?: RequestInit) => Promise<Response> };
let extraerUso: typeof import('./index.js').extraerUso;

beforeAll(async () => {
  process.env.ANTHROPIC_API_KEY = ' sk-ant-' + 'x'.repeat(90) + '\n';
  process.env.ACCESS_CODE = ' codigo-equipo ';
  process.env.ALLOWED_ORIGINS = ORIGEN + ', https://otro.test';
  ({ app, extraerUso } = await import('./index.js'));
});

const post = (cuerpo: unknown, cabeceras: Record<string, string> = {}) =>
  app.request('/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', Origin: ORIGEN, 'x-processiq-code': 'codigo-equipo', ...cabeceras },
    body: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo)
  });

describe('intermediario', () => {
  it('health informa configuracion sin revelar secretos (y recorta espacios)', async () => {
    const r = await app.request('/health');
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({
      ok: true, servicio: 'processiq-intermediario', configurado: true, formatoClave: 'ok'
    });
  });

  it('rechaza origenes no permitidos', async () => {
    const r = await post({ model: 'claude-sonnet-5' }, { Origin: 'https://malicioso.test' });
    expect(r.status).toBe(403);
  });

  it('rechaza un codigo incorrecto', async () => {
    const r = await post({ model: 'claude-sonnet-5' }, { 'x-processiq-code': 'otro' });
    expect(r.status).toBe(401);
  });

  it('rechaza modelos fuera de la lista', async () => {
    const r = await post({ model: 'gpt-x' });
    expect(r.status).toBe(400);
  });

  it('rechaza JSON invalido', async () => {
    const r = await post('{no es json');
    expect(r.status).toBe(400);
  });

  it('topa max_tokens, filtra fallbacks y reenvia la respuesta de Anthropic', async () => {
    const espia = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: 1, usage: { input_tokens: 3, output_tokens: 4 } }), {
        status: 200, headers: { 'content-type': 'application/json' }
      })
    );
    const r = await post({ model: 'claude-opus-5', max_tokens: 999999, fallbacks: 'otro', messages: [] });
    expect(r.status).toBe(200);
    expect(r.headers.get('access-control-allow-origin')).toBe(ORIGEN);
    expect(await r.json()).toMatchObject({ ok: 1 });
    const [, init] = espia.mock.calls[0]!;
    const enviado = JSON.parse(String(init!.body));
    expect(enviado.max_tokens).toBe(64000);
    expect(enviado.fallbacks).toBeUndefined();
    expect((init!.headers as Record<string, string>)['x-api-key']).toBe('sk-ant-' + 'x'.repeat(90));
    espia.mockRestore();
  });

  it('un 401 de Anthropic se traduce a 502 (falla la clave central, no el usuario)', async () => {
    const espia = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 401 }));
    const r = await post({ model: 'claude-sonnet-5', messages: [] });
    expect(r.status).toBe(502);
    espia.mockRestore();
  });

  it('deja pasar cache_control tal cual (la cache de prompts la decide quien llama)', async () => {
    const espia = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{"ok":1}', { status: 200, headers: { 'content-type': 'application/json' } })
    );
    const system = [{ type: 'text', text: 'S', cache_control: { type: 'ephemeral' } }];
    expect((await post({ model: 'claude-opus-5', max_tokens: 10, system, cache_control: { type: 'ephemeral' }, messages: [] })).status).toBe(200);
    const enviado = JSON.parse(String(espia.mock.calls[0]![1]!.body));
    expect(enviado.system).toEqual(system);
    expect(enviado.cache_control).toEqual({ type: 'ephemeral' });
    espia.mockRestore();
  });
});

describe('gasto informado (extraerUso)', () => {
  const flujo = (texto: string) => new Response(texto).body!;
  const sse = (eventos: object[]) => eventos.map((e: any) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');

  it('sin cache, lo de siempre: la entrada de message_start y la salida final de message_delta', async () => {
    const uso = await extraerUso(flujo(sse([
      { type: 'message_start', message: { usage: { input_tokens: 1200, output_tokens: 1 } } },
      { type: 'message_delta', usage: { output_tokens: 300 } },
      { type: 'message_delta', usage: { output_tokens: 900 } }
    ])), true);
    expect(uso).toEqual({ inputTokens: 1200, outputTokens: 900 });
  });

  it('con cache de prompts: la entrada total y, aparte, lo escrito y lo leido (sin sumar dos veces)', async () => {
    const usage = {
      input_tokens: 200, cache_creation_input_tokens: 300, cache_read_input_tokens: 500,
      cache_creation: { ephemeral_5m_input_tokens: 200, ephemeral_1h_input_tokens: 100 }
    };
    const uso = await extraerUso(flujo(sse([
      { type: 'message_start', message: { usage: { ...usage, output_tokens: 1 } } },
      { type: 'message_delta', usage: { ...usage, output_tokens: 40 } }
    ])), true);
    expect(uso).toEqual({
      inputTokens: 1000, outputTokens: 40, cacheCreationInputTokens: 300, cacheCreation1hInputTokens: 100, cacheReadInputTokens: 500
    });
    // Respuesta sin streaming: igual
    expect(await extraerUso(flujo(JSON.stringify({ usage: { ...usage, output_tokens: 40 } })), false)).toEqual(uso);
  });

  it('sin uso, o con algo que no se puede leer: nada que informar', async () => {
    expect(await extraerUso(flujo(sse([{ type: 'ping' }])), true)).toBeNull();
    expect(await extraerUso(flujo('{"ok":1}'), false)).toBeNull();
    expect(await extraerUso(flujo('no es json'), false)).toBeNull();
  });
});
