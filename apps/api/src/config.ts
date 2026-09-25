// Configuración de la API y del worker de IA desde variables de entorno.
import { PRECIOS_IA } from '@processiq/ia';

/** IA en el servidor (docs/arquitectura.md §8). */
export interface ConfigIaServidor {
  /** ¿Tiene el servidor clave de Anthropic? (la usa el worker; la API solo lo informa y no encola sin ella) */
  configurada: boolean;
  /** Modelos que se pueden elegir al generar un proceso. */
  modelosPermitidos: string[];
  /** Modelo de los análisis (pains y tareas del copiloto). */
  modeloAnalisis: string;
  /** Tope de gasto de la organización por mes calendario (US$, precio de lista). */
  presupuestoMensualUsd: number;
  /** Tope de gasto de cada persona por mes calendario (US$). */
  limiteUsuarioMensualUsd: number;
}

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
  ia: ConfigIaServidor;
}

const numero = (valor: string | undefined, porDefecto: number, nombre: string) => {
  if (valor === undefined || valor.trim() === '') return porDefecto;
  const n = Number(valor);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${nombre} debe ser un número positivo`);
  return n;
};

function modelo(id: string, nombre: string): string {
  if (!PRECIOS_IA[id]) throw new Error(`${nombre}: modelo desconocido "${id}" (conocidos: ${Object.keys(PRECIOS_IA).join(', ')})`);
  return id;
}

export function leerConfigIa(env: NodeJS.ProcessEnv = process.env): ConfigIaServidor {
  const permitidos = (env.MODELOS_IA_PERMITIDOS || 'claude-opus-5,claude-sonnet-5')
    .split(',').map((m) => m.trim()).filter(Boolean).map((m) => modelo(m, 'MODELOS_IA_PERMITIDOS'));
  return {
    configurada: !!(env.ANTHROPIC_API_KEY ?? '').trim(),
    modelosPermitidos: permitidos,
    modeloAnalisis: modelo((env.MODELO_IA_ANALISIS || 'claude-sonnet-5').trim(), 'MODELO_IA_ANALISIS'),
    presupuestoMensualUsd: numero(env.PRESUPUESTO_IA_MENSUAL_USD, 100, 'PRESUPUESTO_IA_MENSUAL_USD'),
    limiteUsuarioMensualUsd: numero(env.LIMITE_IA_USUARIO_MENSUAL_USD, 25, 'LIMITE_IA_USUARIO_MENSUAL_USD')
  };
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
    carpetaMigraciones: env.CARPETA_MIGRACIONES || undefined,
    ia: leerConfigIa(env)
  };
}

/** Worker de IA: ejecuta la cola de ejecuciones_ia. */
export interface ConfigWorker {
  databaseUrl: string;
  claveAnthropic: string;
  /** Base de la API de Anthropic (solo para pruebas con un servidor falso). */
  urlAnthropic?: string;
  /** Ejecuciones a la vez. */
  concurrencia: number;
  pulseUrl?: string;
  pulseToken?: string;
}

export function leerConfigWorker(env: NodeJS.ProcessEnv = process.env): ConfigWorker {
  const databaseUrl = (env.DATABASE_URL ?? '').trim();
  if (!databaseUrl) throw new Error('Falta DATABASE_URL');
  return {
    databaseUrl,
    claveAnthropic: (env.ANTHROPIC_API_KEY ?? '').trim(),
    urlAnthropic: (env.ANTHROPIC_BASE_URL ?? '').trim() || undefined,
    concurrencia: Math.max(1, Math.floor(numero(env.IA_CONCURRENCIA, 2, 'IA_CONCURRENCIA'))),
    pulseUrl: (env.PULSE_URL ?? '').trim() || undefined,
    pulseToken: (env.PULSE_TOKEN ?? '').trim() || undefined
  };
}
