// Registro de auditoría: quién hizo qué, sobre qué y cuándo.
import type { Context } from 'hono';
import { auditoria } from '@processiq/db';
import type { Entorno } from './contexto.js';

export async function registrar(
  c: Context<Entorno>, accion: string, entidad: string, entidadId: string | null, detalle: Record<string, unknown> = {},
  usuarioId?: string | null
): Promise<void> {
  const usuario = c.get('usuario');
  await c.get('db').insert(auditoria).values({
    usuarioId: usuarioId !== undefined ? usuarioId : (usuario?.id ?? null),
    accion, entidad, entidadId, detalle, ip: c.get('ip')
  });
}
