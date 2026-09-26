import { describe, expect, it, vi } from 'vitest';
import type { Nodo } from '@processiq/dominio';
import {
  GEN_MAX_TOKENS, PROMPT_GENERACION, REGLAS_FUSION, clasificarErrorIa, combinarFuentes, estimarCosteGeneracion, extraerJson,
  fmtUsd, interpretarPains, llamarClaude, promptGeneracion, resumenProcesoParaIa, timeoutGeneracion, usd, validarEspecGeneracion
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
});
