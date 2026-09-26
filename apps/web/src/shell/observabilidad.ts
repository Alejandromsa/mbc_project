// Informe de errores del navegador a /api/errores (fase 2.4b). Lo usan el
// shell y el editor en modo proyecto; el editor libre no informa de nada.

type Origen = 'web' | 'editor';

const MAX_POR_PAGINA = 10;
const enviados = new Set<string>();

/** Informa de un error una sola vez por página (y como mucho 10). Nunca lanza. */
export function reportarError(origen: Origen, error: unknown, detalle: Record<string, unknown> = {}): void {
  try {
    const e = error instanceof Error ? error : new Error(typeof error === 'string' ? error : JSON.stringify(error));
    const clave = `${e.message}|${(e.stack ?? '').split('\n')[1] ?? ''}`;
    if (enviados.has(clave) || enviados.size >= MAX_POR_PAGINA) return;
    enviados.add(clave);
    fetch('/api/errores', {
      method: 'POST',
      credentials: 'same-origin',
      keepalive: true,   // llega aunque la página se esté cerrando
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        origen, mensaje: e.message.slice(0, 2000), pila: (e.stack ?? '').slice(0, 8000),
        url: location.pathname + location.search, detalle
      })
    }).catch(() => { /* sin red: no hay nada que hacer */ });
  } catch { /* informar de un error nunca debe provocar otro */ }
}

/** Captura los errores no controlados de la página. */
export function capturarErrores(origen: Origen): void {
  window.addEventListener('error', (ev) => {
    // Recursos que no cargan (imágenes, fuentes) no son errores de código
    if (!(ev.error instanceof Error) && !ev.message) return;
    reportarError(origen, ev.error ?? new Error(ev.message), { archivo: ev.filename, linea: ev.lineno, columna: ev.colno });
  });
  window.addEventListener('unhandledrejection', (ev) => reportarError(origen, ev.reason, { tipo: 'promesa sin capturar' }));
}
