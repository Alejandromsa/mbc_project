// Esquema de la base de datos (Postgres) — docs/arquitectura.md §7.
// Las migraciones SQL se generan con drizzle-kit desde este archivo
// (pnpm --filter @processiq/db generar) y se versionan en migraciones/.
import { sql } from 'drizzle-orm';
import {
  bigserial, boolean, index, integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, unique, uuid
} from 'drizzle-orm/pg-core';

export const rolOrganizacion = pgEnum('rol_organizacion', ['admin', 'consultor', 'lector']);
export const rolProyecto = pgEnum('rol_proyecto', ['propietario', 'editor', 'revisor', 'lector']);
export const estadoRevision = pgEnum('estado_revision', ['borrador', 'en_revision', 'aprobada']);

const creado = () => timestamp('creado_en', { withTimezone: true }).notNull().defaultNow();

/** Una por país o práctica de MBC; al inicio hay una sola. */
export const organizaciones = pgTable('organizaciones', {
  id: uuid('id').primaryKey().defaultRandom(),
  nombre: text('nombre').notNull(),
  creadoEn: creado()
});

export const usuarios = pgTable('usuarios', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizacionId: uuid('organizacion_id').notNull().references(() => organizaciones.id),
  /** Siempre en minúsculas (lo garantiza la API). */
  email: text('email').notNull().unique(),
  nombre: text('nombre').notNull(),
  /** scrypt: "scrypt$N$r$p$sal$hash" (cuentas locales). Con Entra ID quedará vacío. */
  hashClave: text('hash_clave').notNull(),
  rol: rolOrganizacion('rol').notNull().default('consultor'),
  activo: boolean('activo').notNull().default(true),
  /** Las contraseñas temporales (alta o restablecimiento) obligan a cambiarla al entrar. */
  debeCambiarClave: boolean('debe_cambiar_clave').notNull().default(true),
  creadoEn: creado(),
  ultimoAcceso: timestamp('ultimo_acceso', { withTimezone: true })
});

export const sesiones = pgTable('sesiones', {
  id: uuid('id').primaryKey().defaultRandom(),
  usuarioId: uuid('usuario_id').notNull().references(() => usuarios.id, { onDelete: 'cascade' }),
  /** SHA-256 del token de la cookie: una fuga de la base no expone sesiones. */
  tokenHash: text('token_hash').notNull().unique(),
  creadaEn: timestamp('creada_en', { withTimezone: true }).notNull().defaultNow(),
  expiraEn: timestamp('expira_en', { withTimezone: true }).notNull(),
  ip: text('ip'),
  agente: text('agente')
}, (t) => [index('sesiones_usuario_idx').on(t.usuarioId)]);

export const proyectos = pgTable('proyectos', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizacionId: uuid('organizacion_id').notNull().references(() => organizaciones.id),
  nombre: text('nombre').notNull(),
  cliente: text('cliente').notNull().default(''),
  descripcion: text('descripcion').notNull().default(''),
  creadoPor: uuid('creado_por').notNull().references(() => usuarios.id),
  creadoEn: creado(),
  archivado: boolean('archivado').notNull().default(false)
});

export const miembrosProyecto = pgTable('miembros_proyecto', {
  proyectoId: uuid('proyecto_id').notNull().references(() => proyectos.id, { onDelete: 'cascade' }),
  usuarioId: uuid('usuario_id').notNull().references(() => usuarios.id, { onDelete: 'cascade' }),
  rol: rolProyecto('rol').notNull()
}, (t) => [primaryKey({ columns: [t.proyectoId, t.usuarioId] })]);

export const procesos = pgTable('procesos', {
  id: uuid('id').primaryKey().defaultRandom(),
  proyectoId: uuid('proyecto_id').notNull().references(() => proyectos.id, { onDelete: 'cascade' }),
  nombre: text('nombre').notNull(),
  creadoPor: uuid('creado_por').notNull().references(() => usuarios.id),
  creadoEn: creado(),
  actualizadoEn: timestamp('actualizado_en', { withTimezone: true }).notNull().defaultNow()
}, (t) => [index('procesos_proyecto_idx').on(t.proyectoId)]);

/** Una revisión = el proceso completo (JSON v1 del dominio). Las aprobadas no se editan. */
export const revisiones = pgTable('revisiones', {
  id: uuid('id').primaryKey().defaultRandom(),
  procesoId: uuid('proceso_id').notNull().references(() => procesos.id, { onDelete: 'cascade' }),
  /** Correlativo dentro del proceso (1, 2, 3…). */
  numero: integer('numero').notNull(),
  /** Revisión sobre la que se trabajó; si no es la última, hubo edición en paralelo. */
  padreId: uuid('padre_id'),
  autorId: uuid('autor_id').notNull().references(() => usuarios.id),
  mensaje: text('mensaje').notNull().default(''),
  estado: estadoRevision('estado').notNull().default('borrador'),
  schemaVersion: integer('schema_version').notNull(),
  contenido: jsonb('contenido').notNull(),
  creadaEn: timestamp('creada_en', { withTimezone: true }).notNull().defaultNow()
}, (t) => [
  unique('revisiones_proceso_numero_uq').on(t.procesoId, t.numero),
  index('revisiones_proceso_idx').on(t.procesoId)
]);

/** Quién hizo qué y cuándo. Solo se inserta. */
export const auditoria = pgTable('auditoria', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  usuarioId: uuid('usuario_id'),
  accion: text('accion').notNull(),
  entidad: text('entidad').notNull(),
  entidadId: text('entidad_id'),
  detalle: jsonb('detalle').notNull().default(sql`'{}'::jsonb`),
  ip: text('ip'),
  creadoEn: creado()
}, (t) => [index('auditoria_entidad_idx').on(t.entidad, t.entidadId)]);
