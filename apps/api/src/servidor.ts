// Arranque de la API: aplica migraciones, asegura la organización y sirve.
import { serve } from '@hono/node-server';
import { aplicarMigraciones, conectar } from '@processiq/db';
import { crearApp } from './app.js';
import { leerConfig } from './config.js';
import { CANAL_EJECUCION, Escucha } from './ia/avisos.js';
import { asegurarCatalogos } from './catalogos.js';
import { asegurarOrganizacion } from './organizacion.js';

const config = leerConfig();
const conexion = conectar(config.databaseUrl);

await aplicarMigraciones(conexion.db, config.carpetaMigraciones);
// Catálogos del MVP también para la organización que ya existía antes de la fase 2.4
await asegurarCatalogos(conexion.db, await asegurarOrganizacion(conexion.db));

// Avisos del worker (progreso de la IA) para el SSE: una sola conexión LISTEN
const escucha = new Escucha(config.databaseUrl, [CANAL_EJECUCION]);
await escucha.iniciar();

const app = crearApp(conexion.db, config, { escucha });
const servidor = serve({ fetch: app.fetch, port: config.puerto }, (info) => {
  console.info(JSON.stringify({
    evento: 'arranque', servicio: 'processiq-api', puerto: info.port, origen: config.origenPublico,
    ia: config.ia.configurada ? 'configurada' : 'sin clave'
  }));
});

// Parada ordenada (docker compose stop / reinicio)
for (const senal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(senal, () => {
    servidor.close(async () => { await escucha.cerrar(); await conexion.cerrar(); process.exit(0); });
  });
}
