// Ejecución de un trabajo de IA en el worker: arma el prompt de @processiq/ia,
// llama a Claude en streaming, valida (con una reparación si hace falta),
// reintenta lo pasajero, registra tokens y coste y avisa de cada cambio.
import { eq, sql } from 'drizzle-orm';
import { ejecucionesIa, type BaseDeDatos } from '@processiq/db';
import {
  GEN_MAX_TOKENS, MAX_CHARS_REPARACION, PROMPT_GENERACION, PROMPT_PAINS, PROMPT_REPARACION, ROL_ANALISTA, TAREAS_IA,
  clasificarErrorIa, extraerJson, llamarClaude, promptGeneracion, promptReparacion, promptTarea, timeoutGeneracion,
  usd, validarEspecGeneracion, type OpcionesLlamada, type UsoIa
} from '@processiq/ia';
import { CANAL_EJECUCION, avisar } from './avisos.js';
import type { EjecucionIa } from './cola.js';

/** Intentos por ejecución ante errores pasajeros (red, 429, sobrecarga). */
export const MAX_INTENTOS = 3;
/** Espera antes del reintento n (segundos). */
const ESPERAS_S = [15, 60];
/** Máximo de caracteres de fuentes que recibe la IA (el mismo que el editor, MAX_AI_CHARS). */
export const MAX_CHARS_FUENTES = 180_000;

export interface ParametrosGeneracion {
  etiqueta: string;
  vista: 1 | 2 | 3;
  roles?: Record<string, string> | null;
  variasFuentes?: boolean;
  fuentes?: { nombre: string; tipo: string; caracteres: number }[];
}

export interface DependenciasIa {
  db: BaseDeDatos;
  claveAnthropic: string;
  urlAnthropic?: string | undefined;
  /** Pruebas: fetch y espera falsos. */
  fetch?: typeof fetch;
  esperar?: (ms: number) => Promise<void>;
  /** Cada cuánto se mira si pidieron cancelar (y se da el latido). */
  intervaloVigilanciaMs?: number;
  /** El worker se está apagando: lo que esté a medias vuelve a la cola sin contar el intento. */
  apagando?: () => boolean;
  /** Gasto de cada llamada (log y Pulse). */
  reportarGasto?: (uso: UsoIa & { ejecucionId: string }) => void;
}

type Llamar = (prompt: string, opts: OpcionesLlamada) => Promise<string>;

async function generar(llamar: Llamar, e: EjecucionIa): Promise<unknown> {
  const p = e.parametros as ParametrosGeneracion;
  const prompt = promptGeneracion(e.texto ?? '', p.etiqueta, {
    roles: p.roles ?? undefined, vista: p.vista, variasFuentes: !!p.variasFuentes, maxChars: MAX_CHARS_FUENTES
  });
  const respuesta = await llamar(prompt, { system: PROMPT_GENERACION, effort: 'medium', maxTokens: GEN_MAX_TOKENS, timeoutMs: timeoutGeneracion(prompt) });
  let problema: string;
  try {
    const v = validarEspecGeneracion(extraerJson(respuesta));
    if (v.ok) return v.spec;
    problema = v.errores.join('; ');
  } catch (err) {
    problema = (err as Error).message;
  }
  // Una sola reparación, y solo si la respuesta no es enorme
  if (respuesta.length > MAX_CHARS_REPARACION) {
    throw new Error(`La IA devolvió una respuesta que no se pudo interpretar (${problema}).`);
  }
  const reparada = await llamar(promptReparacion(respuesta, problema), { system: PROMPT_REPARACION, effort: 'low', maxTokens: GEN_MAX_TOKENS, timeoutMs: 120_000 });
  let v2;
  try { v2 = validarEspecGeneracion(extraerJson(reparada)); } catch (err) { v2 = { ok: false as const, errores: [(err as Error).message] }; }
  if (!v2.ok) throw new Error(`La IA devolvió un proceso que no se pudo interpretar ni reparar: ${v2.errores.join('; ')}`);
  return v2.spec;
}

async function analizar(llamar: Llamar, e: EjecucionIa): Promise<unknown> {
  if (e.tipo === 'pains') {
    const respuesta = await llamar(e.texto ?? '', { system: PROMPT_PAINS, effort: 'high', maxTokens: 8000 });
    return { datos: extraerJson(respuesta) };
  }
  const tarea = e.tarea && Object.hasOwn(TAREAS_IA, e.tarea) ? TAREAS_IA[e.tarea] : undefined;
  if (!tarea) throw new Error(`Tarea de IA desconocida: ${e.tarea}`);
  const markdown = await llamar(promptTarea(tarea.prompt, e.texto ?? ''), { system: ROL_ANALISTA, effort: 'high', maxTokens: 8000 });
  return { markdown };
}

export async function ejecutar(dep: DependenciasIa, e: EjecucionIa): Promise<void> {
  const { db } = dep;
  const ctrl = new AbortController();
  let cancelado = false;
  const uso = { entrada: 0, salida: 0, usd: 0 };
  let ultimoAvisoProgreso = 0;

  const actualizar = async (cambios: Partial<typeof ejecucionesIa.$inferInsert>) => {
    await db.update(ejecucionesIa).set({ ...cambios, actualizadoEn: new Date() }).where(eq(ejecucionesIa.id, e.id));
    await avisar(db, CANAL_EJECUCION, e.id);
  };
  await avisar(db, CANAL_EJECUCION, e.id);   // ya está «ejecutando»

  // Vigilancia: ¿pidieron cancelar? De paso, latido para que no se crea huérfana.
  const vigilancia = setInterval(async () => {
    try {
      const [f] = await db.update(ejecucionesIa).set({ actualizadoEn: new Date() })
        .where(eq(ejecucionesIa.id, e.id)).returning({ cancelar: ejecucionesIa.cancelar });
      if (f?.cancelar || dep.apagando?.()) { cancelado = !!f?.cancelar; ctrl.abort(); }
    } catch { /* la siguiente vuelta lo reintenta */ }
  }, dep.intervaloVigilanciaMs ?? 2000);

  const llamar: Llamar = (prompt, opts) => llamarClaude(prompt, {
    ...opts,
    onProgress: (caracteres) => {
      const ahora = Date.now();
      if (ahora - ultimoAvisoProgreso < 1000) return;
      ultimoAvisoProgreso = ahora;
      actualizar({ progreso: caracteres }).catch(() => {});
    },
    onUsage: (u) => {
      uso.entrada += u.entrada;
      uso.salida += u.salida;
      uso.usd += usd(u.entrada, u.salida, u.modelo);
      dep.reportarGasto?.({ ...u, ejecucionId: e.id });
    }
  }, { modo: 'servidor', key: dep.claveAnthropic, model: e.modelo }, {
    proxyPorDefecto: '', host: '', urlApi: dep.urlAnthropic,
    fetch: dep.fetch, esperar: dep.esperar,
    senalCancelacion: ctrl.signal,
    cancelado: () => cancelado || !!dep.apagando?.()
  });

  // Tokens y coste se suman: los intentos fallidos y la reparación también se cobran
  const conCoste = () => ({
    tokensEntrada: sql`${ejecucionesIa.tokensEntrada} + ${uso.entrada}`,
    tokensSalida: sql`${ejecucionesIa.tokensSalida} + ${uso.salida}`,
    costeUsd: sql`${ejecucionesIa.costeUsd} + ${uso.usd}`
  }) as unknown as Partial<typeof ejecucionesIa.$inferInsert>;

  // Al terminar (bien, mal o cancelada) no se conservan el texto de las fuentes ni los
  // nombres de los participantes de las entrevistas; un reintento sí los necesita.
  const sinDatosDeFuentes = () => ({
    texto: null,
    parametros: sql`${ejecucionesIa.parametros} - 'roles'`
  }) as unknown as Partial<typeof ejecucionesIa.$inferInsert>;

  try {
    const resultado = e.tipo === 'generacion' ? await generar(llamar, e) : await analizar(llamar, e);
    await actualizar({ ...conCoste(), estado: 'completada', resultado, error: null, ...sinDatosDeFuentes(), terminadoEn: new Date() });
  } catch (err) {
    const mensaje = (err as Error).message;
    const clase = clasificarErrorIa(err);
    if (dep.apagando?.() && !cancelado) {
      await actualizar({ ...conCoste(), estado: 'en_cola', intentos: sql`greatest(${ejecucionesIa.intentos} - 1, 0)` as unknown as number, progreso: 0, disponibleEn: new Date() });
    } else if (clase === 'cancelado' || cancelado) {
      await actualizar({ ...conCoste(), estado: 'cancelada', error: null, ...sinDatosDeFuentes(), terminadoEn: new Date() });
    } else if (clase === 'transitorio' && e.intentos < MAX_INTENTOS) {
      const espera = ESPERAS_S[e.intentos - 1] ?? ESPERAS_S[ESPERAS_S.length - 1]!;
      await actualizar({ ...conCoste(), estado: 'en_cola', progreso: 0, error: `${mensaje} (reintento ${e.intentos + 1} de ${MAX_INTENTOS})`, disponibleEn: new Date(Date.now() + espera * 1000) });
    } else {
      await actualizar({ ...conCoste(), estado: 'fallida', error: mensaje, ...sinDatosDeFuentes(), terminadoEn: new Date() });
    }
  } finally {
    clearInterval(vigilancia);
  }
}
