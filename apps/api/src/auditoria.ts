// Registro de auditoría: quién hizo qué, sobre qué y cuándo, y en qué organización.
import type { Context } from 'hono';
import { sql } from 'drizzle-orm';
import { auditoria, type BaseDeDatos } from '@processiq/db';
import type { Entorno } from './contexto.js';
import { esUuid } from './validar.js';

export interface EventoAuditoria {
  accion: string;
  entidad: string;
  entidadId: string | null;
  detalle?: Record<string, unknown>;
  /** Autor. Nulo en las entradas fallidas y en la línea de comandos. */
  usuarioId: string | null;
  /**
   * Si no se indica: la del autor o, sin autor, la de la cuenta afectada
   * (entidad «usuario»). Queda nula si no hay ninguna (un correo que no existe).
   */
  organizacionId?: string | null;
  ip?: string | null;
}

/** Inserta un evento. Lo usan las rutas (con `registrar`) y la línea de comandos. */
export async function registrarEvento(db: BaseDeDatos, e: EventoAuditoria): Promise<void> {
  const cuenta = e.usuarioId ?? (e.entidad === 'usuario' ? e.entidadId : null);
  const organizacionId = e.organizacionId !== undefined ? e.organizacionId
    : cuenta && esUuid(cuenta)
      ? sql`(select u.organizacion_id from usuarios u where u.id = ${cuenta}::uuid)`
      : null;
  await db.insert(auditoria).values({
    usuarioId: e.usuarioId, organizacionId, accion: e.accion, entidad: e.entidad, entidadId: e.entidadId,
    detalle: e.detalle ?? {}, ip: e.ip ?? null
  });
}

export async function registrar(
  c: Context<Entorno>, accion: string, entidad: string, entidadId: string | null, detalle: Record<string, unknown> = {},
  usuarioId?: string | null
): Promise<void> {
  const usuario = c.get('usuario');
  const autor = usuarioId !== undefined ? usuarioId : (usuario?.id ?? null);
  await registrarEvento(c.get('db'), {
    usuarioId: autor, accion, entidad, entidadId, detalle, ip: c.get('ip'),
    // Con sesión la organización ya se conoce; sin ella (entrar), la busca registrarEvento
    organizacionId: usuario && autor === usuario.id ? usuario.organizacionId : undefined
  });
}
