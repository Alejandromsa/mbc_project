// Esquema de la base de datos (Postgres) — docs/arquitectura.md §7.
// Las migraciones SQL se generan con drizzle-kit desde este archivo
// (pnpm --filter @processiq/db generar) y se versionan en migraciones/.
import { sql } from 'drizzle-orm';
import {
  bigserial, boolean, doublePrecision, index, integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, unique, uuid
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

export const tipoEjecucionIa = pgEnum('tipo_ejecucion_ia', ['generacion', 'pains', 'tarea']);
export const estadoEjecucionIa = pgEnum('estado_ejecucion_ia', ['en_cola', 'ejecutando', 'completada', 'fallida', 'cancelada']);

/**
 * Una llamada de IA hecha por el servidor (docs/arquitectura.md §8). La fila
 * es también el trabajo de la cola: el worker toma las «en_cola» con
 * SKIP LOCKED y avisa de los cambios con NOTIFY.
 */
export const ejecucionesIa = pgTable('ejecuciones_ia', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizacionId: uuid('organizacion_id').notNull().references(() => organizaciones.id),
  procesoId: uuid('proceso_id').notNull().references(() => procesos.id, { onDelete: 'cascade' }),
  usuarioId: uuid('usuario_id').notNull().references(() => usuarios.id),
  tipo: tipoEjecucionIa('tipo').notNull(),
  /** Solo en tipo «tarea»: cuál (kpis, raci, tobe…; TAREAS_IA de @processiq/ia). */
  tarea: text('tarea'),
  modelo: text('modelo').notNull(),
  estado: estadoEjecucionIa('estado').notNull().default('en_cola'),
  /**
   * Parámetros (nivel, roles, fuentes con nombre y tamaño…). El texto de las
   * fuentes va en `texto` y se borra al terminar: no se conservan documentos
   * del cliente más de lo necesario.
   */
  parametros: jsonb('parametros').notNull().default(sql`'{}'::jsonb`),
  texto: text('texto'),
  /** Caracteres recibidos de la IA (progreso). */
  progreso: integer('progreso').notNull().default(0),
  /** generacion: la especificación del proceso; tarea: { markdown }; pains: { datos }. */
  resultado: jsonb('resultado'),
  error: text('error'),
  intentos: integer('intentos').notNull().default(0),
  /** No se toma de la cola antes de esta hora (espera entre reintentos). */
  disponibleEn: timestamp('disponible_en', { withTimezone: true }).notNull().defaultNow(),
  cancelar: boolean('cancelar').notNull().default(false),
  tokensEntrada: integer('tokens_entrada').notNull().default(0),
  tokensSalida: integer('tokens_salida').notNull().default(0),
  costeUsd: doublePrecision('coste_usd').notNull().default(0),
  /** Generación ya dibujada y guardada en el proyecto (o descartada por el usuario). */
  revisionId: uuid('revision_id').references(() => revisiones.id, { onDelete: 'set null' }),
  descartada: boolean('descartada').notNull().default(false),
  creadoEn: creado(),
  iniciadoEn: timestamp('iniciado_en', { withTimezone: true }),
  terminadoEn: timestamp('terminado_en', { withTimezone: true }),
  /** Latido del worker mientras ejecuta: si se detiene, la ejecución vuelve a la cola. */
  actualizadoEn: timestamp('actualizado_en', { withTimezone: true }).notNull().defaultNow()
}, (t) => [
  index('ejecuciones_ia_cola_idx').on(t.estado, t.disponibleEn),
  index('ejecuciones_ia_proceso_idx').on(t.procesoId),
  index('ejecuciones_ia_consumo_idx').on(t.organizacionId, t.creadoEn)
]);

// ------------------------------------------------------------- catálogos
// Administrables por organización (fase 2.4). Al crear la organización se
// siembran con los del MVP (@processiq/dominio); en el editor libre se siguen
// usando esos valores por defecto.

/** Biblioteca de KPIs. `codigo` es el id que guardan los procesos (kpiValues): no cambia nunca. */
export const kpis = pgTable('kpis', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizacionId: uuid('organizacion_id').notNull().references(() => organizaciones.id),
  codigo: text('codigo').notNull(),
  industria: text('industria').notNull(),
  macroproceso: text('macroproceso').notNull().default(''),
  nombre: text('nombre').notNull(),
  unidad: text('unidad').notNull().default(''),
  benchmark: text('benchmark').notNull().default(''),
  descripcion: text('descripcion').notNull().default(''),
  /** Los desactivados no se ofrecen, pero los procesos que ya los usan los conservan. */
  activo: boolean('activo').notNull().default(true),
  creadoEn: creado(),
  actualizadoEn: timestamp('actualizado_en', { withTimezone: true }).notNull().defaultNow()
}, (t) => [unique('kpis_org_codigo_uq').on(t.organizacionId, t.codigo)]);

export const tipoVerbo = pgEnum('tipo_verbo', ['permitido', 'prohibido']);

/** Verbos del Playbook MBB: los prohibidos llevan el motivo que ve el consultor. */
export const verbosPlaybook = pgTable('verbos_playbook', {
  organizacionId: uuid('organizacion_id').notNull().references(() => organizaciones.id),
  verbo: text('verbo').notNull(),
  tipo: tipoVerbo('tipo').notNull(),
  motivo: text('motivo').notNull().default(''),
  actualizadoEn: timestamp('actualizado_en', { withTimezone: true }).notNull().defaultNow()
}, (t) => [primaryKey({ columns: [t.organizacionId, t.verbo] })]);

/**
 * Temas de cliente para el export PPTX, además de los del código (mbc, bbva).
 * `definicion` tiene la misma forma que TEMAS_PPTX de @processiq/exportar
 * (paleta, tipografías, logotipos en data URI, carátula).
 */
export const temasPptx = pgTable('temas_pptx', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizacionId: uuid('organizacion_id').notNull().references(() => organizaciones.id),
  clave: text('clave').notNull(),
  nombre: text('nombre').notNull(),
  definicion: jsonb('definicion').notNull(),
  activo: boolean('activo').notNull().default(true),
  creadoEn: creado(),
  actualizadoEn: timestamp('actualizado_en', { withTimezone: true }).notNull().defaultNow()
}, (t) => [unique('temas_pptx_org_clave_uq').on(t.organizacionId, t.clave)]);

/**
 * Plantillas de proceso: un proceso completo (contenido v1) del que se parte
 * al crear otro en un proyecto. Se crean desde una revisión, sin lo que es de
 * un cliente concreto (cliente, personas de la gobernanza, historial de la
 * ficha y valores medidos de KPI).
 */
export const plantillasProceso = pgTable('plantillas_proceso', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizacionId: uuid('organizacion_id').notNull().references(() => organizaciones.id),
  nombre: text('nombre').notNull(),
  descripcion: text('descripcion').notNull().default(''),
  industria: text('industria').notNull().default(''),
  contenido: jsonb('contenido').notNull(),
  schemaVersion: integer('schema_version').notNull(),
  /** Tareas, eventos y demás elementos del diagrama: orienta al elegirla sin cargar el contenido. */
  nodos: integer('nodos').notNull().default(0),
  activo: boolean('activo').notNull().default(true),
  creadoPor: uuid('creado_por').references(() => usuarios.id, { onDelete: 'set null' }),
  /** Revisión de la que salió (se conserva la plantilla aunque se borre). */
  origenRevisionId: uuid('origen_revision_id').references(() => revisiones.id, { onDelete: 'set null' }),
  creadoEn: creado(),
  actualizadoEn: timestamp('actualizado_en', { withTimezone: true }).notNull().defaultNow()
}, (t) => [unique('plantillas_proceso_org_nombre_uq').on(t.organizacionId, t.nombre)]);

// ------------------------------------------------------------- observabilidad
// Sin servicios externos (fase 2.4b): los errores y los latidos quedan en la
// base y los ve el administrador en la pantalla «Sistema».

export const origenError = pgEnum('origen_error', ['api', 'web', 'editor', 'worker']);

/** Errores inesperados de API, web, editor y worker. `huella` agrupa las repeticiones. Se purgan a los 30 días. */
export const errores = pgTable('errores', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  origen: origenError('origen').notNull(),
  mensaje: text('mensaje').notNull(),
  pila: text('pila'),
  /** Ruta de la API («POST /api/…») o URL de la página. */
  ruta: text('ruta'),
  huella: text('huella').notNull(),
  usuarioId: uuid('usuario_id'),
  agente: text('agente'),
  detalle: jsonb('detalle').notNull().default(sql`'{}'::jsonb`),
  creadoEn: creado()
}, (t) => [index('errores_creado_idx').on(t.creadoEn), index('errores_huella_idx').on(t.huella)]);

/** Último latido de cada servicio sin HTTP (el worker): si se detiene, la pantalla «Sistema» lo avisa. */
export const latidos = pgTable('latidos', {
  servicio: text('servicio').primaryKey(),
  detalle: jsonb('detalle').notNull().default(sql`'{}'::jsonb`),
  en: timestamp('en', { withTimezone: true }).notNull().defaultNow()
});

// ===== conocimiento =====
// Búsqueda sobre los procesos de la organización y comparativo con el marco
// APQC PCF (docs/iniciativas/conocimiento.md, ADR 19). Sin IA: pg_trgm y
// unaccent. drizzle no genera extensiones ni funciones: la migración crea a
// mano pg_trgm, unaccent y conocimiento_normalizar() antes de estas tablas.

/**
 * Texto de la última revisión de cada proceso, para buscar. Se rellena de forma
 * perezosa al buscar (las revisiones que falten o hayan cambiado) y cae en
 * cascada con su proceso y con su revisión.
 */
export const conocimientoIndice = pgTable('conocimiento_indice', {
  procesoId: uuid('proceso_id').primaryKey().references(() => procesos.id, { onDelete: 'cascade' }),
  revisionId: uuid('revision_id').notNull().references(() => revisiones.id, { onDelete: 'cascade' }),
  /** Nombre del proceso al indexarlo: si se renombra, se vuelve a indexar. */
  nombre: text('nombre').notNull(),
  /** Todo lo buscable: nombre, actividades, sistemas, roles y ficha. */
  texto: text('texto').notNull(),
  /** Nombre, actividades, sistemas y roles (sin la ficha): con él se comparan procesos entre sí. */
  textoParecido: text('texto_parecido').notNull(),
  /** Trozos con su campo ({ campo, texto, etiqueta? }): de aquí sale el extracto de cada resultado. */
  fragmentos: jsonb('fragmentos').notNull(),
  indexadoEn: timestamp('indexado_en', { withTimezone: true }).notNull().defaultNow()
}, (t) => [
  // Trigramas sobre el texto sin mayúsculas ni tildes (la función debe ser IMMUTABLE)
  index('conocimiento_indice_texto_idx').using('gin', sql`conocimiento_normalizar(${t.texto}) gin_trgm_ops`)
]);

/**
 * Marco de referencia de la organización (APQC PCF u otro con la misma forma).
 * Lo importa un administrador desde un CSV y cada importación reemplaza el
 * anterior. El nivel sale del código jerárquico (1.0 -> 1, 1.2 -> 2, 1.2.3 -> 3).
 */
export const conocimientoMarco = pgTable('conocimiento_marco', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizacionId: uuid('organizacion_id').notNull().references(() => organizaciones.id, { onDelete: 'cascade' }),
  codigo: text('codigo').notNull(),
  nombre: text('nombre').notNull(),
  descripcion: text('descripcion').notNull().default(''),
  nivel: integer('nivel').notNull(),
  /** Posición en el archivo importado. */
  orden: integer('orden').notNull(),
  creadoEn: creado()
}, (t) => [unique('conocimiento_marco_org_codigo_uq').on(t.organizacionId, t.codigo)]);
