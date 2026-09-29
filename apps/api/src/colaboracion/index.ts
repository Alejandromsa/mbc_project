// Colaboración en tiempo real (núcleo; docs/iniciativas/colaboracion.md, ADR 21):
// lo único que importa el resto de la API.
//   rutasColaboracion()  -> /api/procesos/:id/presencia y /api/procesos/:id/eventos
//   CANAL_PROCESOS       -> canal LISTEN/NOTIFY que escucha la API (servidor.ts)
//   avisarProceso()      -> NOTIFY al guardar una revisión (rutas/procesos.ts)
export { rutasColaboracion, type OpcionesColaboracion } from './rutas.js';
export { CANAL_PROCESOS, avisarProceso } from './avisos.js';
