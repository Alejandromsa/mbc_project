// Permisos: rol en la organización + rol en el proyecto.
//
//   capacidad     propietario  editor  revisor  lector
//   leer               ✓          ✓       ✓        ✓
//   escribir           ✓          ✓                     crear procesos, guardar revisiones, enviar a revisión
//   aprobar            ✓                  ✓             aprobar o devolver una revisión en revisión
//   administrar        ✓                                datos del proyecto, miembros, archivar
//
// El administrador de la organización tiene todas las capacidades en sus proyectos.
import { and, eq } from 'drizzle-orm';
import { miembrosProyecto, proyectos } from '@processiq/db';
import type { BaseDeDatos } from '@processiq/db';
import { ErrorHttp, type RolProyecto, type UsuarioSesion } from './contexto.js';

export type Capacidad = 'leer' | 'escribir' | 'aprobar' | 'administrar';

const CAPACIDADES: Record<RolProyecto, Capacidad[]> = {
  propietario: ['leer', 'escribir', 'aprobar', 'administrar'],
  editor: ['leer', 'escribir'],
  revisor: ['leer', 'aprobar'],
  lector: ['leer']
};

export function puede(rol: RolProyecto | null, capacidad: Capacidad): boolean {
  return !!rol && CAPACIDADES[rol].includes(capacidad);
}

export function exigirAdmin(u: UsuarioSesion): void {
  if (u.rol !== 'admin') throw new ErrorHttp(403, 'Solo un administrador puede hacer esto.', 'PERMISO');
}

/**
 * Proyecto y rol efectivo del usuario. Si no tiene acceso responde 404 (no
 * delata que el proyecto existe); si tiene acceso pero no la capacidad, 403.
 */
export async function accesoProyecto(db: BaseDeDatos, u: UsuarioSesion, proyectoId: string, capacidad: Capacidad) {
  const [p] = await db.select().from(proyectos)
    .where(and(eq(proyectos.id, proyectoId), eq(proyectos.organizacionId, u.organizacionId))).limit(1);
  if (!p) throw new ErrorHttp(404, 'Proyecto no encontrado.');
  let rol: RolProyecto | null = null;
  if (u.rol === 'admin') rol = 'propietario';
  else {
    const [m] = await db.select().from(miembrosProyecto)
      .where(and(eq(miembrosProyecto.proyectoId, proyectoId), eq(miembrosProyecto.usuarioId, u.id))).limit(1);
    rol = m?.rol ?? null;
  }
  if (!rol) throw new ErrorHttp(404, 'Proyecto no encontrado.');
  if (!puede(rol, capacidad)) throw new ErrorHttp(403, 'Tu rol en este proyecto no permite esta acción.', 'PERMISO');
  if (p.archivado && capacidad === 'escribir') throw new ErrorHttp(409, 'El proyecto está archivado.', 'ARCHIVADO');
  return { proyecto: p, rol };
}
