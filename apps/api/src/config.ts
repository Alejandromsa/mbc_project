// Configuración de la API desde variables de entorno.

export interface Config {
  /** postgres://usuario:clave@host:puerto/base */
  databaseUrl: string;
  /** Origen público de la web (https://mbc.asissoft.com): se exige en el Origin de las escrituras. */
  origenPublico: string;
  puerto: number;
  /** Duración de una sesión, en horas. */
  horasSesion: number;
  /** Ruta de las migraciones SQL (en la imagen Docker van junto al bundle). */
  carpetaMigraciones?: string;
}

export function leerConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const databaseUrl = (env.DATABASE_URL ?? '').trim();
  const origenPublico = (env.ORIGEN_PUBLICO ?? '').trim().replace(/\/+$/, '');
  if (!databaseUrl) throw new Error('Falta DATABASE_URL');
  if (!/^https?:\/\/[^/]+$/.test(origenPublico)) throw new Error('ORIGEN_PUBLICO debe ser un origen como https://mbc.asissoft.com');
  return {
    databaseUrl,
    origenPublico,
    puerto: Number(env.PORT ?? 8080),
    horasSesion: Number(env.HORAS_SESION ?? 12),
    carpetaMigraciones: env.CARPETA_MIGRACIONES || undefined
  };
}
