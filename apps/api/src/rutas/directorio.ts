// Directorio de la organización: lo mínimo para elegir a quién añadir a un
// proyecto (id, nombre y correo de las cuentas activas). Cualquier usuario con
// sesión; la gestión de cuentas sigue siendo solo de administradores (usuarios.ts).
import { Hono } from 'hono';
import { and, asc, eq } from 'drizzle-orm';
import { usuarios } from '@processiq/db';
import type { Entorno } from '../contexto.js';

export function rutasDirectorio() {
  const r = new Hono<Entorno>();

  r.get('/', async (c) => {
    const lista = await c.get('db').select({ id: usuarios.id, nombre: usuarios.nombre, email: usuarios.email })
      .from(usuarios)
      .where(and(eq(usuarios.organizacionId, c.get('usuario').organizacionId), eq(usuarios.activo, true)))
      .orderBy(asc(usuarios.nombre));
    return c.json({ usuarios: lista });
  });

  return r;
}
