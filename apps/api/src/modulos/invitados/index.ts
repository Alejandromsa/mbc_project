// Módulo «invitados»: lo único que importa el resto de la API.
//   rutasInvitados()         -> /api/invitados (con sesión: enlaces y comentarios del equipo)
//   rutasPublicasInvitados() -> /api/publico/invitados (sin sesión: lo que usa el invitado con su token)
export { rutasInvitados } from './rutas.js';
export { rutasPublicasInvitados } from './publico.js';
