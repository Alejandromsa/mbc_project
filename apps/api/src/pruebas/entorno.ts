// Utilidades de las pruebas de integración: Postgres real (TEST_DATABASE_URL,
// por defecto el de desarrollo en el puerto 5440) y un cliente con cookies.
import { eq } from 'drizzle-orm';
import { aplicarMigraciones, conectar, usuarios, type Conexion } from '@processiq/db';
import { crearApp } from '../app.js';
import type { Config } from '../config.js';
import { asegurarOrganizacion } from '../organizacion.js';
import { hashearClave } from '../seguridad.js';

export const URL_PRUEBAS = process.env.TEST_DATABASE_URL ?? 'postgres://processiq:processiq@localhost:5440/processiq_pruebas';
export const ORIGEN = 'https://mbc.prueba';
export const CLAVE = 'una-clave-larga-2026';

export const config: Config = {
  databaseUrl: URL_PRUEBAS, origenPublico: ORIGEN, puerto: 0, horasSesion: 12,
  ia: { configurada: true, modelosPermitidos: ['claude-opus-5', 'claude-sonnet-5'], modeloAnalisis: 'claude-sonnet-5', presupuestoMensualUsd: 100, limiteUsuarioMensualUsd: 25 }
};

let conexion: Conexion;

/** Crea la base de pruebas si no existe (en un Postgres de desarrollo recién creado). */
async function asegurarBaseDePruebas(): Promise<void> {
  const url = new URL(URL_PRUEBAS);
  const nombre = url.pathname.slice(1);
  url.pathname = '/postgres';
  const admin = conectar(url.toString(), { max: 1 });
  try {
    const { rowCount } = await admin.pool.query('select 1 from pg_database where datname = $1', [nombre]);
    if (!rowCount) await admin.pool.query(`create database "${nombre.replaceAll('"', '""')}"`);
  } finally {
    await admin.cerrar();
  }
}

/** Base limpia: borra los esquemas y aplica las migraciones desde cero. */
export async function prepararBase(): Promise<Conexion> {
  await asegurarBaseDePruebas();
  conexion = conectar(URL_PRUEBAS, { max: 4 });
  await conexion.pool.query('drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;');
  await aplicarMigraciones(conexion.db);
  return conexion;
}

export async function vaciar(): Promise<void> {
  await conexion.pool.query('truncate organizaciones, usuarios, sesiones, proyectos, miembros_proyecto, procesos, revisiones, ejecuciones_ia, auditoria restart identity cascade');
}

export async function cerrarBase(): Promise<void> {
  await conexion?.cerrar();
}

/** Usuario activo con contraseña conocida y ya cambiada. */
export async function usuario(email: string, rol: 'admin' | 'consultor' | 'lector' = 'consultor', nombre = email.split('@')[0]!) {
  const organizacionId = await asegurarOrganizacion(conexion.db);
  const [u] = await conexion.db.insert(usuarios).values({
    organizacionId, email, nombre, rol, hashClave: await hashearClave(CLAVE), debeCambiarClave: false
  }).returning();
  return u!;
}

export async function marcarClaveTemporal(email: string) {
  await conexion.db.update(usuarios).set({ debeCambiarClave: true }).where(eq(usuarios.email, email));
}

export type Respuesta = { status: number; json: any; headers: Headers };

/**
 * Cliente HTTP contra la app (sin red) que guarda la cookie de sesión.
 * `cfg` permite probar otra configuración (p. ej. la IA sin clave).
 */
export function cliente(cfg: Config = config) {
  const app = crearApp(conexion.db, cfg, { sondeoMs: 50 });
  let cookie = '';
  const pedir = async (metodo: string, ruta: string, cuerpo?: unknown, extra: Record<string, string> = {}): Promise<Respuesta> => {
    const headers: Record<string, string> = { origin: ORIGEN, ...extra };
    if (cookie) headers.cookie = cookie;
    if (cuerpo !== undefined) headers['content-type'] = 'application/json';
    const res = await app.request(ruta, { method: metodo, headers, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) {
      const valor = setCookie.split(';')[0]!;
      cookie = /=$/.test(valor) || /Max-Age=0/i.test(setCookie) ? '' : valor;
    }
    const texto = await res.text();
    return { status: res.status, json: texto ? JSON.parse(texto) : null, headers: res.headers };
  };
  return {
    app,
    get: (ruta: string, extra?: Record<string, string>) => pedir('GET', ruta, undefined, extra),
    post: (ruta: string, cuerpo?: unknown, extra?: Record<string, string>) => pedir('POST', ruta, cuerpo ?? {}, extra),
    patch: (ruta: string, cuerpo: unknown) => pedir('PATCH', ruta, cuerpo),
    put: (ruta: string, cuerpo: unknown) => pedir('PUT', ruta, cuerpo),
    del: (ruta: string) => pedir('DELETE', ruta),
    entrar: async (email: string, clave = CLAVE) => pedir('POST', '/api/sesion', { email, clave }),
    get cookie() { return cookie; }
  };
}
