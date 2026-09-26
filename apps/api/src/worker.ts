// Worker de IA (docs/arquitectura.md §8): ejecuta la cola de ejecuciones_ia.
// Mismo código e imagen que la API; en Docker es el servicio «worker».
//   node dist/worker.js        (producción)
//   pnpm --filter @processiq/api worker   (desarrollo, con .env.dev)
// Las migraciones las aplica la API: el worker arranca después.
import { conectar } from '@processiq/db';
import { leerConfigWorker } from './config.js';
import { CANAL_COLA, Escucha, despertador } from './ia/avisos.js';
import { reencolarHuerfanas, tomarSiguiente } from './ia/cola.js';
import { ejecutar } from './ia/ejecutar.js';

const cfg = leerConfigWorker();
const conexion = conectar(cfg.databaseUrl, { max: cfg.concurrencia + 2 });
const log = (datos: Record<string, unknown>) => console.info(JSON.stringify({ servicio: 'processiq-worker', ...datos }));

if (!cfg.claveAnthropic) log({ evento: 'aviso', mensaje: 'Sin ANTHROPIC_API_KEY: las ejecuciones fallarán hasta configurarla (la API no encola sin ella).' });

let apagando = false;
const reloj = despertador();
const escucha = new Escucha(cfg.databaseUrl, [CANAL_COLA]);
escucha.suscribir(CANAL_COLA, () => reloj.despertar());
await escucha.iniciar();

const reportarGasto = (u: { modelo: string; entrada: number; salida: number; ejecucionId: string }) => {
  log({ evento: 'gasto_ia', modelo: u.modelo, inputTokens: u.entrada, outputTokens: u.salida, ejecucionId: u.ejecucionId });
  if (!cfg.pulseUrl) return;
  fetch(cfg.pulseUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cfg.pulseToken ? { authorization: 'Bearer ' + cfg.pulseToken } : {}) },
    body: JSON.stringify({ tool: 'processiq', provider: 'anthropic', model: u.modelo, inputTokens: u.entrada, outputTokens: u.salida, origen: 'servidor' })
  }).catch(() => { /* el registro de gasto nunca debe afectar a la ejecución */ });
};

const dependencias = {
  db: conexion.db, claveAnthropic: cfg.claveAnthropic, urlAnthropic: cfg.urlAnthropic,
  apagando: () => apagando, reportarGasto
};

async function bucle(n: number) {
  while (!apagando) {
    const e = await tomarSiguiente(conexion.db).catch((err) => { log({ evento: 'error', mensaje: String(err) }); return null; });
    if (!e) { await reloj.esperar(10_000); continue; }
    const t0 = Date.now();
    log({ evento: 'inicio', trabajador: n, ejecucionId: e.id, tipo: e.tipo, intento: e.intentos });
    await ejecutar(dependencias, e).catch((err) => log({ evento: 'error', ejecucionId: e.id, mensaje: String(err) }));
    log({ evento: 'fin', trabajador: n, ejecucionId: e.id, segundos: Math.round((Date.now() - t0) / 1000) });
    reloj.despertar();   // por si hay más en cola para los demás
  }
}

const reencoladas = await reencolarHuerfanas(conexion.db);
if (reencoladas) log({ evento: 'reencoladas', cantidad: reencoladas });
const huerfanas = setInterval(() => { reencolarHuerfanas(conexion.db).catch(() => {}); }, 60_000);
log({ evento: 'arranque', concurrencia: cfg.concurrencia });
const bucles = Array.from({ length: cfg.concurrencia }, (_, i) => bucle(i + 1));

// Parada ordenada: lo que esté a medias vuelve a la cola sin contar el intento
for (const senal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(senal, async () => {
    apagando = true;
    reloj.despertar();
    clearInterval(huerfanas);
    await Promise.race([Promise.all(bucles), new Promise((r) => setTimeout(r, 15_000))]);
    await escucha.cerrar();
    await conexion.cerrar();
    process.exit(0);
  });
}
