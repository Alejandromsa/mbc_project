import { beforeAll, describe, expect, it, vi } from 'vitest';

const ORIGEN = 'https://mbc.ejemplo.test';
let app: { request: (input: string, init?: RequestInit) => Promise<Response> };

beforeAll(async () => {
  process.env.ANTHROPIC_API_KEY = ' sk-ant-' + 'x'.repeat(90) + '\n';
  process.env.ACCESS_CODE = ' codigo-equipo ';
  process.env.ALLOWED_ORIGINS = ORIGEN + ', https://otro.test';
  ({ app } = await import('./index.js'));
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
});
