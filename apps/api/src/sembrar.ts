// Carga los datos de prueba en el Postgres de DESARROLLO (docs/runbooks/servidor-local.md):
//   pnpm --filter @processiq/api semilla
// Se niega a correr contra otra base que no esté en localhost: las cuentas de
// prueba tienen una contraseña conocida y no deben existir en el servidor.
import { aplicarMigraciones, conectar } from '@processiq/db';
import { CLAVE_PRUEBA, CUENTAS_PRUEBA, correoPrueba, sembrar } from './semilla.js';

const url = process.env.DATABASE_URL;
if (!url) { console.error('Falta DATABASE_URL (copiar .env.dev.example a .env.dev).'); process.exit(1); }
const host = new URL(url).hostname;
if (!['localhost', '127.0.0.1', '[::1]'].includes(host) || process.env.NODE_ENV === 'production') {
  console.error(`La semilla solo se ejecuta contra un Postgres local de desarrollo; DATABASE_URL apunta a "${host}".`);
  process.exit(1);
}

const conexion = conectar(url, { max: 2 });
try {
  await aplicarMigraciones(conexion.db, process.env.CARPETA_MIGRACIONES || undefined);
  await sembrar(conexion.db, url);
  console.log(`Datos de prueba cargados en ${host}. Contraseña de todas las cuentas: ${CLAVE_PRUEBA}\n`);
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
