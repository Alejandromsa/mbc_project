// Colaboración en tiempo real (ADR 21): el latido de presencia de esta pestaña y
// los eventos en vivo de un proceso (quién lo tiene abierto y con qué revisión, la
// última revisión y el estado de cada una).
// Lo usan la página del proceso del shell y el editor en modo proyecto
// (app/plataforma/colaboracion.js). La vista del invitado (?invitado=) no lo usa.
import { ErrorApi, pedir, type EstadoRevision } from './api';

export type EstadoPresencia = 'viendo' | 'editando';
export type LugarPresencia = 'editor' | 'shell';

/** Una revisión que alguien tiene abierta en el editor. Con `ultima: false`, ya hay una más nueva. */
export interface RevisionAbierta { id: string; numero: number; ultima: boolean }

/** Una persona que tiene abierto el proceso (la API junta todas sus pestañas). */
export interface Presente {
  usuarioId: string;
  nombre: string;
  estado: EstadoPresencia;
  lugares: LugarPresencia[];
  desde: string;
  /** Revisiones que tiene abiertas en el editor, de la más antigua a la más nueva (vacía si solo está en el shell). */
  revisiones: RevisionAbierta[];
  /** Es quien mira: el editor y el shell no se muestran a sí mismos. */
  yo: boolean;
}

/** La última revisión del proceso, tal como llega por el SSE. */
export interface RevisionEnVivo {
  id: string; numero: number; autorId: string; autor: string; mensaje: string; estado: EstadoRevision; creadaEn: string;
}

/** Estado de una revisión del proceso, tal como llega en el evento `estado` del SSE. */
export interface EstadoEnVivo { id: string; numero: number; estado: EstadoRevision }

/** Cada cuánto late una pestaña abierta. La API da la presencia por caducada a los 60 s sin latido. */
export const LATIDO_MS = 20_000;
/** Si el SSE se cierra del todo (p. ej. un 502 al reiniciar la API), se vuelve a abrir pasado este tiempo. */
const REABRIR_MS = 10_000;

export interface ConexionColaboracion {
  /** Da el latido ya (p. ej. porque cambió el estado: empezó o dejó de editar). */
  latir(): void;
  /** Deja de latir, cierra el SSE y borra la presencia de esta pestaña. */
  cerrar(): void;
}

const q = (v: string) => encodeURIComponent(v);

function nuevaPestana(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return Array.from({ length: 4 }, () => Math.random().toString(36).slice(2, 10)).join('');
}

/** Tras un aviso de revisión, cuánto se espera para ver si esta pestaña abrió otra (p. ej. acaba de guardar). */
const REVISAR_REVISION_MS = 1500;

/**
 * Empieza a latir y a escuchar los eventos del proceso. `estado` y `revision` (la
 * revisión abierta, en el editor) se consultan en cada latido; `alPresencia`,
 * `alRevision` y `alEstado` reciben el estado completo al conectar y cada vez que
 * cambia (también tras una reconexión).
 */
export function conectarColaboracion(o: {
  procesoId: string;
  lugar: LugarPresencia;
  estado?: () => EstadoPresencia;
  revision?: () => string | null | undefined;
  alPresencia?: (lista: Presente[]) => void;
  alRevision?: (revision: RevisionEnVivo | null) => void;
  alEstado?: (revisiones: EstadoEnVivo[]) => void;
}): ConexionColaboracion {
  const pestana = nuevaPestana();
  const base = `/procesos/${q(o.procesoId)}`;
  let activa = false;
  let latido: ReturnType<typeof setInterval> | undefined;
  let reabrir: ReturnType<typeof setTimeout> | undefined;
  let revisarRevision: ReturnType<typeof setTimeout> | undefined;
  let eventos: EventSource | null = null;
  let revisionEnviada: string | null = null;

  const revisionAbierta = () => (o.revision ? o.revision() ?? null : null);

  function latir() {
    if (!activa) return;
    const estado = o.estado ? o.estado() : 'viendo';
    const revisionId = revisionAbierta();
    revisionEnviada = revisionId;
    pedir('PUT', `${base}/presencia`, { pestana, lugar: o.lugar, estado, revisionId }).catch((e: unknown) => {
      // Sin sesión o sin acceso: se deja de latir y de escuchar (no hay nada que reintentar)
      if (e instanceof ErrorApi && [401, 403, 404].includes(e.estado)) detener();
    });
  }

  /**
   * Si esta pestaña pasó a otra revisión (guardó una nueva sin cambiar de estado), late ya:
   * los demás ven enseguida que tiene la última. El aviso de su propio guardado puede
   * llegar antes que la respuesta de la API, así que se mira un poco después.
   */
  function alAvisoDeRevision() {
    if (!o.revision) return;
    clearTimeout(revisarRevision);
    revisarRevision = setTimeout(() => { if (revisionAbierta() !== revisionEnviada) latir(); }, REVISAR_REVISION_MS);
  }

  function abrirEventos() {
    if (!activa || typeof EventSource === 'undefined') return;
    const es = new EventSource(`/api${base}/eventos?pestana=${q(pestana)}`);
    eventos = es;
    es.addEventListener('presencia', (ev) => {
      try { o.alPresencia?.(JSON.parse((ev as MessageEvent<string>).data).presencias); } catch { /* evento mal formado */ }
    });
    es.addEventListener('revision', (ev) => {
      try { o.alRevision?.(JSON.parse((ev as MessageEvent<string>).data).revision); } catch { /* evento mal formado */ }
      alAvisoDeRevision();
    });
    es.addEventListener('estado', (ev) => {
      try { o.alEstado?.(JSON.parse((ev as MessageEvent<string>).data).revisiones); } catch { /* evento mal formado */ }
    });
    // Ante un corte de red, EventSource reconecta solo. Si la respuesta no fue un SSE
    // (API reiniciándose, 401, 404), se cierra del todo: se reintenta más tarde y, si
    // era la sesión o el acceso, el latido lo detecta y lo detiene.
    es.onerror = () => {
      if (es.readyState !== EventSource.CLOSED || eventos !== es) return;
      eventos = null;
      clearTimeout(reabrir);
      reabrir = setTimeout(abrirEventos, REABRIR_MS);
    };
  }

  function iniciar() {
    if (activa) return;
    activa = true;
    latir();
    abrirEventos();
    latido = setInterval(latir, LATIDO_MS);
  }

  function detener() {
    activa = false;
    clearInterval(latido);
    clearTimeout(reabrir);
    clearTimeout(revisarRevision);
    eventos?.close();
    eventos = null;
  }

  function cerrar() {
    const estaba = activa;
    detener();
    if (!estaba) return;
    // keepalive: llega aunque la página se esté cerrando. Si no llega, la presencia caduca sola.
    fetch(`/api${base}/presencia?pestana=${q(pestana)}`, { method: 'DELETE', credentials: 'same-origin', keepalive: true }).catch(() => {});
  }

  // Al volver a la pestaña, un latido enseguida (en segundo plano los temporizadores van más lentos)
  const alCambiarVisibilidad = () => { if (document.visibilityState === 'visible') latir(); };
  // pagehide: se cierra la pestaña o se navega a otra página. Si vuelve desde la caché del navegador, se reanuda.
  const alOcultarPagina = () => cerrar();
  const alMostrarPagina = (ev: PageTransitionEvent) => { if (ev.persisted) iniciar(); };
  document.addEventListener('visibilitychange', alCambiarVisibilidad);
  window.addEventListener('pagehide', alOcultarPagina);
  window.addEventListener('pageshow', alMostrarPagina);
  iniciar();

  return {
    latir,
    cerrar() {
      document.removeEventListener('visibilitychange', alCambiarVisibilidad);
      window.removeEventListener('pagehide', alOcultarPagina);
      window.removeEventListener('pageshow', alMostrarPagina);
      cerrar();
    }
  };
}

const PARTICULAS = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e', 'da', 'do', 'dos', 'van', 'von']);

/** Iniciales para el avatar: «Ana Torres» -> «AT», «Editor de Prueba» -> «EP», «Ana» -> «AN». */
export function iniciales(nombre: string): string {
  const palabras = nombre.trim().split(/\s+/).filter((p) => p && !PARTICULAS.has(p.toLowerCase()));
  if (palabras.length === 0) return '?';
  if (palabras.length === 1) return palabras[0]!.slice(0, 2).toUpperCase();
  return (palabras[0]![0]! + palabras[palabras.length - 1]![0]!).toUpperCase();
}

/** Nombre de pila, para los avisos cortos: «Ana Torres» -> «Ana». */
export function nombreCorto(nombre: string): string {
  return nombre.trim().split(/\s+/)[0] || nombre;
}

/** Texto de dónde está alguien: «en el editor», «en la página del proceso» o ambos. */
export function dondeEsta(p: Presente): string {
  if (p.lugares.includes('editor') && p.lugares.includes('shell')) return 'en el editor y en la página del proceso';
  return p.lugares.includes('editor') ? 'en el editor' : 'en la página del proceso';
}
