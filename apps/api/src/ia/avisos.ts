// Avisos entre la API y el worker por LISTEN/NOTIFY de Postgres (sin broker).
//   ia_cola       hay una ejecución nueva en la cola (lo escucha el worker)
//   ia_ejecucion  cambió una ejecución: estado o progreso (lo escucha la API para el SSE)
import pg from 'pg';
import { sql } from 'drizzle-orm';
import type { BaseDeDatos } from '@processiq/db';

export const CANAL_COLA = 'ia_cola';
export const CANAL_EJECUCION = 'ia_ejecucion';

export async function avisar(db: BaseDeDatos, canal: string, id: string): Promise<void> {
  await db.execute(sql`select pg_notify(${canal}, ${id})`);
}

type Oyente = (id: string) => void;

/**
 * Una conexión dedicada que escucha canales y reparte los avisos: una por
 * proceso, no una por cliente conectado. Si se cae, se reconecta sola; los
 * que esperan tienen además un sondeo periódico de respaldo.
 */
export class Escucha {
  private cliente: pg.Client | null = null;
  private readonly oyentes = new Map<string, Set<Oyente>>();
  private cerrada = false;

  constructor(private readonly url: string, private readonly canales: string[]) {}

  async iniciar(): Promise<void> {
    if (this.cerrada) return;
    const cliente = new pg.Client({ connectionString: this.url });
    cliente.on('notification', (n) => {
      if (n.payload) this.oyentes.get(n.channel)?.forEach((f) => f(n.payload!));
    });
    const reconectar = () => {
      if (this.cerrada || this.cliente !== cliente) return;
      this.cliente = null;
      cliente.removeAllListeners();
      cliente.end().catch(() => {});
      setTimeout(() => { this.iniciar().catch(() => {}); }, 2000);
    };
    cliente.on('error', reconectar);
    cliente.on('end', reconectar);
    try {
      await cliente.connect();
      for (const canal of this.canales) await cliente.query(`listen ${canal}`);
      this.cliente = cliente;
    } catch {
      this.cliente = cliente;
      reconectar();
    }
  }

  suscribir(canal: string, oyente: Oyente): () => void {
    if (!this.oyentes.has(canal)) this.oyentes.set(canal, new Set());
    this.oyentes.get(canal)!.add(oyente);
    return () => { this.oyentes.get(canal)?.delete(oyente); };
  }

  async cerrar(): Promise<void> {
    this.cerrada = true;
    const c = this.cliente;
    this.cliente = null;
    if (c) { c.removeAllListeners(); await c.end().catch(() => {}); }
  }
}

/** Espera hasta `ms` o hasta que alguien llame a despertar(). */
export function despertador() {
  let despertar: () => void = () => {};
  return {
    esperar: (ms: number) => new Promise<void>((r) => {
      const t = setTimeout(r, ms);
      despertar = () => { clearTimeout(t); r(); };
    }),
    despertar: () => despertar()
  };
}
