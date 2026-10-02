// Versión de los prompts (ejecuciones_ia.version_prompt): huella estable de
// sistema, plantilla y parámetros de cada tipo de ejecución.
import { describe, expect, it } from 'vitest';
import {
  GEN_MAX_TOKENS, LLAMADAS_IA, LLAMADA_MATRIZ, MAX_TOKENS_MATRIZ, PROMPT_GENERACION, PROMPT_MATRICES, PROMPT_PAINS,
  PROMPT_REPARACION, ROL_ANALISTA, TAREAS_IA, TIPOS_MATRIZ_IA, huellaTexto, llamadaReparacionMatriz, sistemaReparacionMatriz,
  versionPrompt
} from './index.js';

describe('versión de los prompts', () => {
  it('huellaTexto: 12 caracteres hexadecimales, estable y distinta con un solo carácter de diferencia', () => {
    expect(huellaTexto('')).toMatch(/^[0-9a-f]{12}$/);
    expect(huellaTexto(PROMPT_GENERACION)).toBe(huellaTexto(PROMPT_GENERACION.slice()));
    expect(huellaTexto(PROMPT_GENERACION)).not.toBe(huellaTexto(PROMPT_GENERACION + ' '));
    expect(huellaTexto('a')).not.toBe(huellaTexto('b'));
    expect(huellaTexto('Añadir')).not.toBe(huellaTexto('Anadir'));
  });

  it('una por tipo de ejecución: generación, dolores, cada tarea del copiloto y cada matriz', () => {
    const versiones = [
      versionPrompt('generacion'), versionPrompt('pains'),
      ...Object.keys(TAREAS_IA).map((t) => versionPrompt('tarea', t)),
      ...TIPOS_MATRIZ_IA.map((t) => versionPrompt('tarea', t))
    ];
    for (const v of versiones) expect(v).toMatch(/^[0-9a-f]{12}$/);
    expect(new Set(versiones).size).toBe(versiones.length);
    // La tarea de generación y de dolores no dependen de `tarea`
    expect(versionPrompt('generacion', 'raci')).toBe(versionPrompt('generacion'));
    // Lo que no es una ejecución conocida no tiene versión
    expect(versionPrompt('tarea')).toBeNull();
    expect(versionPrompt('tarea', 'inventada')).toBeNull();
    expect(versionPrompt('tarea', 'constructor')).toBeNull();
    expect(versionPrompt('otra')).toBeNull();
  });

  it('los parámetros del servidor son los de siempre (también entran en la versión)', () => {
    expect(LLAMADAS_IA).toEqual({
      generacion: { system: PROMPT_GENERACION, effort: 'medium', maxTokens: GEN_MAX_TOKENS },
      reparacion: { system: PROMPT_REPARACION, effort: 'low', maxTokens: GEN_MAX_TOKENS, timeoutMs: 120_000, reparacion: true },
      pains: { system: PROMPT_PAINS, effort: 'high', maxTokens: 8000 },
      tarea: { system: ROL_ANALISTA, effort: 'high', maxTokens: 8000 }
    });
    expect(LLAMADA_MATRIZ).toEqual({ system: PROMPT_MATRICES, effort: 'high', maxTokens: MAX_TOKENS_MATRIZ });
    expect(llamadaReparacionMatriz('matriz-raci')).toEqual({
      system: sistemaReparacionMatriz('matriz-raci'), effort: 'low', maxTokens: MAX_TOKENS_MATRIZ, timeoutMs: 120_000, reparacion: true
    });
  });

  // Si esta prueba falla, cambió un prompt, su plantilla, el resumen del proceso o los parámetros
  // de una llamada. Es intencional solo si se cambió a propósito (y pasó la evaluación de IA,
  // docs/arquitectura.md §8): actualiza aquí las huellas en el mismo PR (vitest run -u) y
  // anótalo en docs/tecnica/ia.md §3.2. Desde ese momento, las ejecuciones nuevas llevan la huella nueva.
  it('las huellas actuales (cambian solo si cambia cómo se pregunta)', () => {
    const actuales = Object.fromEntries([
      ['generacion', versionPrompt('generacion')], ['pains', versionPrompt('pains')],
      ...Object.keys(TAREAS_IA).map((t) => [t, versionPrompt('tarea', t)]),
      ...TIPOS_MATRIZ_IA.map((t) => [t, versionPrompt('tarea', t)])
    ]);
    expect(actuales).toMatchInlineSnapshot(`
      {
        "automation": "b710f94b75a8",
        "backlog": "b26956106e83",
        "bottleneck": "efa67cef2b99",
        "exec-summary": "adf339547bf4",
        "generacion": "e4da075ec104",
        "impact-effort": "4a397aafb67c",
        "matriz-raci": "f3ec07811977",
        "matriz-sipoc": "3b0c4073e30a",
        "pains": "2d28ee4d8616",
        "propose-tobe": "ab770cf1b677",
        "raci": "2b3a9749d4dd",
        "sipoc": "7bc59bf8f980",
        "suggest-kpis": "79cb2e34467a",
      }
    `);
  });
});
