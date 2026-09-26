// Carga los datos de prueba en el Postgres de DESARROLLO (docs/runbooks/servidor-local.md):
//   pnpm --filter @processiq/api semilla                 cuentas y proyectos de prueba
//   pnpm --filter @processiq/api semilla --desde-cero    además vacía la base antes (la crea si no existe)
// Se niega a correr contra otra base que no esté en localhost: las cuentas de
// prueba tienen una contraseña conocida y no deben existir en el servidor.
import { parseArgs } from 'node:util';
import { aplicarMigraciones, conectar } from '@processiq/db';
import { CLAVE_PRUEBA, CUENTAS_PRUEBA, correoPrueba, sembrar } from './semilla.js';

const { values } = parseArgs({ options: { 'desde-cero': { type: 'boolean', default: false } } });
const url = process.env.DATABASE_URL;
if (!url) { console.error('Falta DATABASE_URL (copiar .env.dev.example a .env.dev).'); process.exit(1); }
const destino = new URL(url);
const host = destino.hostname;
if (!['localhost', '127.0.0.1', '[::1]'].includes(host) || process.env.NODE_ENV === 'production') {
  console.error(`La semilla solo se ejecuta contra un Postgres local de desarrollo; DATABASE_URL apunta a "${host}".`);
  process.exit(1);
}

if (values['desde-cero']) {
  // La base puede no existir todavía (p. ej. la de las pruebas E2E): se crea desde la base "postgres"
  const nombre = destino.pathname.slice(1);
  const admin = new URL(url);
  admin.pathname = '/postgres';
  const c = conectar(admin.toString(), { max: 1 });
  try {
    const { rowCount } = await c.pool.query('select 1 from pg_database where datname = $1', [nombre]);
    if (!rowCount) await c.pool.query(`create database "${nombre.replaceAll('"', '""')}"`);
  } finally {
    await c.cerrar();
  }
}

const conexion = conectar(url, { max: 2 });
try {
  if (values['desde-cero']) {
    await conexion.pool.query('drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;');
  }
  await aplicarMigraciones(conexion.db, process.env.CARPETA_MIGRACIONES || undefined);
  await sembrar(conexion.db, url);
  console.log(`Datos de prueba cargados en ${host}${values['desde-cero'] ? ' (base vaciada antes)' : ''}. Contraseña de todas las cuentas: ${CLAVE_PRUEBA}\n`);
  for (const c of CUENTAS_PRUEBA) {
    const rol = c.rol + (c.enProyecto ? ` · ${c.enProyecto} en el proyecto` : '');
    console.log(`  ${correoPrueba(c.usuario).padEnd(28)} ${rol.padEnd(40)} ${c.para}`);
  }
  console.log('\nProyecto "Siniestros — Seguros Andinos (prueba)":');
  console.log('  Gestión de siniestros   v1 aprobada · v2 en revisión · v3 borrador');
  console.log('  Venta de lotes urbanos  v1 borrador');
  console.log('  Proceso sin revisiones');
  console.log('Proyecto "Proyecto archivado (prueba)": archivado, solo lectura.');
} catch (e) {
  console.error((e as Error).message);
  process.exitCode = 1;
} finally {
  await conexion.cerrar();
}
