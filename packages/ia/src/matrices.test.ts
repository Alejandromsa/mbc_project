// Matrices RACI y SIPOC con IA (divergencia D11): esquema, validación contra el
// proceso, reparación y errores. La IA se simula con un `llamar` falso.
import { describe, expect, it, vi } from 'vitest';
import {
  MAX_CHARS_REPARACION, MAX_ROLES_RACI, MATRICES_IA, PROMPT_MATRICES, TAREAS_IA, actividadesRaci, clasificarErrorIa,
  esTipoMatrizIa, llamarClaude, matrizDeTarea, pedirMatrizIa, promptReparacionMatriz, promptTarea, sistemaReparacionMatriz,
  validarMatrizIa, type LlamarIa
} from './index.js';

const ACTIVIDADES = ['n2', 'n3', 'n4'];
const RESUMEN = 'PROCESO: Reclamos\nROLES/CARRILES: Mesa de ayuda, Analista\n\nACTIVIDADES:\nid=n2 - tipo=task - actividad=Registrar';
const CTX = { resumen: RESUMEN, actividades: ACTIVIDADES };
const RACI = { n2: { 'Mesa de ayuda': 'R/A', Analista: 'I' }, n3: { Analista: 'R/A' }, n4: { Analista: 'R', Supervisor: 'A' } };
const SIPOC = {
  suppliers: 'Cliente, Mesa de ayuda', inputs: 'Reclamo, Póliza', process: 'Registrar, Evaluar, Resolver',
  outputs: 'Resolución', customers: 'Cliente'
};

/** `llamar` falso: devuelve las respuestas en orden y guarda las llamadas. */
function falso(...respuestas: (string | Error)[]) {
  let i = 0;
  return vi.fn<LlamarIa>(async () => {
    const r = respuestas[Math.min(i++, respuestas.length - 1)]!;
    if (r instanceof Error) throw r;
    return r;
  });
}
async function falloDe(p: Promise<unknown>): Promise<Error> {
  try { await p; } catch (e) { return e as Error; }
  throw new Error('no falló');
}

describe('matrices: qué tareas y qué actividades', () => {
  it('RACI y SIPOC tienen matriz; las demás tareas y las claves del prototipo no', () => {
    expect(matrizDeTarea('raci')).toBe('matriz-raci');
    expect(matrizDeTarea('sipoc')).toBe('matriz-sipoc');
    for (const t of ['suggest-kpis', 'propose-tobe', 'constructor', 'toString', '__proto__']) expect(matrizDeTarea(t)).toBeUndefined();
    expect(esTipoMatrizIa('matriz-raci')).toBe(true);
    for (const t of ['raci', 'toString', 'constructor', 42, null]) expect(esTipoMatrizIa(t)).toBe(false);
    // Cada matriz sustituye a una tarea que existe (su informe es el respaldo)
    for (const def of Object.values(MATRICES_IA)) expect(Object.hasOwn(TAREAS_IA, def.tarea)).toBe(true);
  });

  it('las filas de la RACI son las tareas, las de sistema y las decisiones, como en la matriz del editor', () => {
    const nodos = ['start', 'task', 'system', 'decision', 'document', 'data', 'intermediate', 'end'].map((type, i) => ({ id: 'n' + i, type }));
    expect(actividadesRaci(nodos)).toEqual(['n1', 'n2', 'n3']);
  });
});

describe('validación de la RACI', () => {
  it('acepta la forma de state._raci y normaliza las letras', () => {
    const r = validarMatrizIa('matriz-raci', {
      n2: { 'Mesa de ayuda': 'r/a', Analista: ' i ' },
      n3: { Analista: 'A/R', Supervisor: 'r, a' },
      n4: { Analista: 'R', Supervisor: 'A', Cliente: '-', Legal: null, ' Riesgos ': 'c' }
    }, ACTIVIDADES);
    expect(r).toEqual({
      ok: true,
      matriz: {
        n2: { 'Mesa de ayuda': 'R/A', Analista: 'I' },
        n3: { Analista: 'R/A', Supervisor: 'R/A' },
        n4: { Analista: 'R', Supervisor: 'A', Cliente: '', Legal: '', Riesgos: 'C' }
      }
    });
  });

  it('descarta las filas que no son actividades del proceso (eventos, id inventados)', () => {
    const r = validarMatrizIa('matriz-raci', { n1: { Cliente: 'R' }, n2: { Analista: 'R/A' }, x9: { Analista: 'R' } }, ACTIVIDADES);
    expect(r).toEqual({ ok: true, matriz: { n2: { Analista: 'R/A' } } });
  });

  it('sin ninguna actividad conocida, el error dice qué id usar (para la reparación)', () => {
    const r = validarMatrizIa('matriz-raci', { 'Registrar reclamo': { Analista: 'R/A' } }, ACTIVIDADES);
    expect(r).toEqual({ ok: false, errores: ['ninguna clave es el id de una actividad del proceso; usa estos id: n2, n3, n4'] });
  });

  it('rechaza letras desconocidas, formas que no son la de la matriz, filas vacías y demasiados roles', () => {
    const letra = validarMatrizIa('matriz-raci', { n2: { Analista: 'X' } }, ACTIVIDADES);
    expect(letra.ok).toBe(false);
    if (!letra.ok) expect(letra.errores).toEqual(['n2.Analista: la letra debe ser R, A, R/A, C o I']);
    expect(validarMatrizIa('matriz-raci', [{ n2: { Analista: 'R' } }], ACTIVIDADES).ok).toBe(false);
    expect(validarMatrizIa('matriz-raci', { n2: ['R'] }, ACTIVIDADES).ok).toBe(false);
    expect(validarMatrizIa('matriz-raci', { n2: { Analista: 7 } }, ACTIVIDADES).ok).toBe(false);
    expect(validarMatrizIa('matriz-raci', { n2: { Analista: '' } }, ACTIVIDADES))
      .toEqual({ ok: false, errores: ['la matriz no asigna ninguna letra'] });
    const muchos = Object.fromEntries(Array.from({ length: MAX_ROLES_RACI + 1 }, (_, i) => ['Rol ' + i, i ? 'I' : 'R/A']));
    const r = validarMatrizIa('matriz-raci', { n2: muchos }, ACTIVIDADES);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errores[0]).toContain(`tiene ${MAX_ROLES_RACI + 1} roles`);
  });

  it('un rol llamado __proto__ no toca el prototipo', () => {
    const datos = JSON.parse('{"n2":{"__proto__":"R","Analista":"R/A"}}');
    const r = validarMatrizIa('matriz-raci', datos, ACTIVIDADES);
    expect(r).toEqual({ ok: true, matriz: { n2: { Analista: 'R/A' } } });
    expect(({} as Record<string, unknown>).R).toBeUndefined();
  });
});

describe('validación del SIPOC', () => {
  it('acepta la forma de state._sipoc; recorta, une listas con comas y quita claves de más', () => {
    const r = validarMatrizIa('matriz-sipoc', { ...SIPOC, suppliers: '  Cliente, Mesa de ayuda ', inputs: ['Reclamo', ' Póliza ', ''], ctqs: 'no va' });
    expect(r).toEqual({ ok: true, matriz: SIPOC });
  });

  it('cada columna es obligatoria y es un texto', () => {
    const vacia = validarMatrizIa('matriz-sipoc', { ...SIPOC, outputs: '  ' });
    expect(vacia).toEqual({ ok: false, errores: ['outputs: está vacía'] });
    const falta = validarMatrizIa('matriz-sipoc', { suppliers: 'Cliente' });
    expect(falta.ok).toBe(false);
    if (!falta.ok) expect(falta.errores.map((e) => e.split(':')[0])).toEqual(['inputs', 'process', 'outputs', 'customers']);
    expect(validarMatrizIa('matriz-sipoc', { ...SIPOC, process: { pasos: 3 } }).ok).toBe(false);
    expect(validarMatrizIa('matriz-sipoc', 'SIPOC').ok).toBe(false);
  });
});

describe('pedirMatrizIa', () => {
  it('una llamada con el sistema de las matrices y el resumen del proceso; devuelve la matriz validada', async () => {
    const llamar = falso('```json\n' + JSON.stringify(RACI) + '\n```');
    expect(await pedirMatrizIa('matriz-raci', CTX, llamar)).toEqual(RACI);
    expect(llamar).toHaveBeenCalledTimes(1);
    const [prompt, opts] = llamar.mock.calls[0]!;
    expect(prompt).toBe(promptTarea(MATRICES_IA['matriz-raci'].instruccion, RESUMEN));
    expect(prompt).toContain('=== PROCESO A ANALIZAR ===');
    expect(opts).toEqual({ system: PROMPT_MATRICES, effort: 'high', maxTokens: 8000 });
  });

  it('el SIPOC igual, con su instrucción', async () => {
    const llamar = falso(JSON.stringify(SIPOC));
    expect(await pedirMatrizIa('matriz-sipoc', CTX, llamar)).toEqual(SIPOC);
    expect(llamar.mock.calls[0]![0]).toContain('Construye el SIPOC del proceso');
  });

  it('una respuesta que no vale se repara una vez, con el problema y el proceso', async () => {
    const llamar = falso('| Actividad | Analista |\n|---|---|\n| Registrar | R |', JSON.stringify(RACI));
    expect(await pedirMatrizIa('matriz-raci', CTX, llamar)).toEqual(RACI);
    expect(llamar).toHaveBeenCalledTimes(2);
    const [prompt, opts] = llamar.mock.calls[1]!;
    expect(prompt).toBe(promptReparacionMatriz('| Actividad | Analista |\n|---|---|\n| Registrar | R |', 'La IA no devolvió JSON.', RESUMEN));
    expect(prompt).toContain('=== RESPUESTA A CORREGIR ===');
    expect(prompt.endsWith('=== PROCESO ===\n' + RESUMEN)).toBe(true);
    expect(opts).toEqual({ system: sistemaReparacionMatriz('matriz-raci'), effort: 'low', maxTokens: 8000, timeoutMs: 120_000 });
    expect(opts.system).toContain(MATRICES_IA['matriz-raci'].forma);
  });

  it('también repara una matriz con id que no son del proceso', async () => {
    const llamar = falso(JSON.stringify({ 'Registrar reclamo': { Analista: 'R/A' } }), JSON.stringify({ n2: { Analista: 'R/A' } }));
    expect(await pedirMatrizIa('matriz-raci', CTX, llamar)).toEqual({ n2: { Analista: 'R/A' } });
    expect(llamar.mock.calls[1]![0]).toContain('Problema detectado: ninguna clave es el id de una actividad del proceso; usa estos id: n2, n3, n4');
  });

  it('si la reparación tampoco vale, falla con un error definitivo', async () => {
    const llamar = falso('no es JSON', '{"n2": {"Analista": "Z"}}');
    const e = await falloDe(pedirMatrizIa('matriz-raci', CTX, llamar));
    expect(e.message).toBe('La IA devolvió una matriz que no se pudo interpretar ni reparar: n2.Analista: la letra debe ser R, A, R/A, C o I');
    expect(clasificarErrorIa(e)).toBe('definitivo');
    expect(llamar).toHaveBeenCalledTimes(2);
  });

  it('una respuesta enorme no se repara: falla sin gastar otra llamada', async () => {
    const llamar = falso('x'.repeat(MAX_CHARS_REPARACION + 1));
    const e = await falloDe(pedirMatrizIa('matriz-sipoc', CTX, llamar));
    expect(e.message).toBe('La IA devolvió una matriz que no se pudo interpretar (La IA no devolvió JSON.).');
    expect(clasificarErrorIa(e)).toBe('definitivo');
    expect(llamar).toHaveBeenCalledTimes(1);
  });

  it('los errores de la llamada pasan tal cual, con su clase (el worker reintenta lo pasajero)', async () => {
    const e = await falloDe(pedirMatrizIa('matriz-raci', CTX, falso(new Error('Error 529: Overloaded'))));
    expect(e.message).toBe('Error 529: Overloaded');
    expect(clasificarErrorIa(e)).toBe('transitorio');
  });

  it('con llamarClaude: la petición lleva el sistema, el esfuerzo y el tope de las tareas', async () => {
    const sse = (texto: string) => [
      { type: 'message_start', message: { model: 'claude-opus-5', usage: { input_tokens: 100 } } },
      { type: 'content_block_delta', delta: { type: 'text_delta', text: texto } },
      { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 50 } }
    ].map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
    const f = vi.fn(async () => new Response(sse(JSON.stringify(SIPOC)), { status: 200, headers: { 'content-type': 'text/event-stream' } }));
    const entorno = { proxyPorDefecto: 'https://mbc.ejemplo/ia', host: 'mbc.ejemplo', fetch: f as never, esperar: async () => {} };
    const llamar: LlamarIa = (prompt, opts) => llamarClaude(prompt, opts, { modo: 'equipo', codigo: 'c0d1go', model: 'claude-opus-5' }, entorno);
    expect(await pedirMatrizIa('matriz-sipoc', CTX, llamar)).toEqual(SIPOC);
    const cuerpo = JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(cuerpo).toMatchObject({ model: 'claude-opus-5', max_tokens: 8000, system: PROMPT_MATRICES, output_config: { effort: 'high' }, stream: true });
    expect(cuerpo.messages[0].content).toBe(promptTarea(MATRICES_IA['matriz-sipoc'].instruccion, RESUMEN));
  });
});
