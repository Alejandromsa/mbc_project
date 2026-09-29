-- Añadido a mano: drizzle no genera extensiones ni funciones (ADR 19).
-- pg_trgm y unaccent vienen con la imagen postgres:17-alpine (servidor, desarrollo
-- y CI) y son extensiones «trusted»: basta con ser dueño de la base.
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public;--> statement-breakpoint
-- unaccent() es STABLE y un índice solo admite funciones IMMUTABLE: se envuelve.
-- Todo va calificado con public.: desde Postgres 17, CREATE INDEX, REINDEX,
-- VACUUM y ANALYZE ejecutan las funciones del índice con un search_path seguro
-- (pg_catalog, pg_temp), y pg_restore con uno vacío. Sin calificar, esta misma
-- migración falla con «function unaccent(text) does not exist».
CREATE OR REPLACE FUNCTION public.conocimiento_normalizar(texto text) RETURNS text
	LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
	AS $$ SELECT lower(public.unaccent('public.unaccent'::regdictionary, texto)) $$;--> statement-breakpoint
CREATE TABLE "conocimiento_indice" (
	"proceso_id" uuid PRIMARY KEY NOT NULL,
	"revision_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"texto" text NOT NULL,
	"texto_parecido" text NOT NULL,
	"fragmentos" jsonb NOT NULL,
	"indexado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conocimiento_marco" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"codigo" text NOT NULL,
	"nombre" text NOT NULL,
	"descripcion" text DEFAULT '' NOT NULL,
	"nivel" integer NOT NULL,
	"orden" integer NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conocimiento_marco_org_codigo_uq" UNIQUE("organizacion_id","codigo")
);
--> statement-breakpoint
ALTER TABLE "conocimiento_indice" ADD CONSTRAINT "conocimiento_indice_proceso_id_procesos_id_fk" FOREIGN KEY ("proceso_id") REFERENCES "public"."procesos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conocimiento_indice" ADD CONSTRAINT "conocimiento_indice_revision_id_revisiones_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."revisiones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conocimiento_marco" ADD CONSTRAINT "conocimiento_marco_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conocimiento_indice_texto_idx" ON "conocimiento_indice" USING gin (conocimiento_normalizar("texto") gin_trgm_ops);