// Tipos compartidos por las rutas: el usuario de la sesión y errores HTTP.
import type { BaseDeDatos } from '@processiq/db';
import type { Config } from './config.js';
import type { Escucha } from './ia/avisos.js';

export type RolOrganizacion = 'admin' | 'consultor' | 'lector';
export type RolProyecto = 'propietario' | 'editor' | 'revisor' | 'lector';

export interface UsuarioSesion {
  id: string;
  organizacionId: string;
  email: string;
  nombre: string;
  rol: RolOrganizacion;
  debeCambiarClave: boolean;
}

export interface Entorno {
  Variables: {
    db: BaseDeDatos;
    config: Config;
    usuario: UsuarioSesion;
    sesionId: string;
    ip: string;
    escucha: Escucha | undefined;
  };
}

/** Error con estado HTTP y código estable (para que la web reaccione sin leer el texto). */
export class ErrorHttp extends Error {
  constructor(public estado: 400 | 401 | 403 | 404 | 409 | 413 | 429, mensaje: string, public codigo?: string, public detalles?: unknown) {
    super(mensaje);
  }
}
