// Conexión a Postgres (node-postgres) y aplicación de migraciones.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import * as esquema from './esquema.js';

export type BaseDeDatos = NodePgDatabase<typeof esquema>;

export interface Conexion {
  db: BaseDeDatos;
  pool: pg.Pool;
  cerrar(): Promise<void>;
}

export function conectar(url: string, opciones: { max?: number } = {}): Conexion {
  const pool = new pg.Pool({ connectionString: url, max: opciones.max ?? 10 });
  const db = drizzle(pool, { schema: esquema });
  return { db, pool, cerrar: () => pool.end() };
}

/**
 * Carpeta de migraciones SQL. Por defecto, la del paquete; la imagen Docker de
 * la API las copia junto al bundle y pasa su ruta.
 */
export function carpetaMigraciones(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..', 'migraciones');
}

/** Aplica las migraciones pendientes (idempotente; drizzle guarda las aplicadas). */
export async function aplicarMigraciones(db: BaseDeDatos, carpeta = carpetaMigraciones()): Promise<void> {
  await migrate(db, { migrationsFolder: carpeta });
}
