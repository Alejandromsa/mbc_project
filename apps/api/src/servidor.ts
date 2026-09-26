// Arranque de la API: aplica migraciones, asegura la organización y sirve.
import { serve } from '@hono/node-server';
import { aplicarMigraciones, conectar } from '@processiq/db';
import { crearApp } from './app.js';
import { leerConfig } from './config.js';
import { asegurarOrganizacion } from './organizacion.js';

const config = leerConfig();
const conexion = conectar(config.databaseUrl);

await aplicarMigraciones(conexion.db, config.carpetaMigraciones);
await asegurarOrganizacion(conexion.db);

const app = crearApp(conexion.db, config);
const servidor = serve({ fetch: app.fetch, port: config.puerto }, (info) => {
  console.info(JSON.stringify({ evento: 'arranque', servicio: 'processiq-api', puerto: info.port, origen: config.origenPublico }));
});

// Parada ordenada (docker compose stop / reinicio)
for (const senal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(senal, () => {
    servidor.close(async () => { await conexion.cerrar(); process.exit(0); });
  });
}
