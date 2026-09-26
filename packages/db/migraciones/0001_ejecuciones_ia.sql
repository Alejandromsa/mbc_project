CREATE TYPE "public"."estado_ejecucion_ia" AS ENUM('en_cola', 'ejecutando', 'completada', 'fallida', 'cancelada');--> statement-breakpoint
CREATE TYPE "public"."tipo_ejecucion_ia" AS ENUM('generacion', 'pains', 'tarea');--> statement-breakpoint
CREATE TABLE "ejecuciones_ia" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"proceso_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"tipo" "tipo_ejecucion_ia" NOT NULL,
	"tarea" text,
	"modelo" text NOT NULL,
	"estado" "estado_ejecucion_ia" DEFAULT 'en_cola' NOT NULL,
	"parametros" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"texto" text,
	"progreso" integer DEFAULT 0 NOT NULL,
	"resultado" jsonb,
	"error" text,
	"intentos" integer DEFAULT 0 NOT NULL,
	"disponible_en" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelar" boolean DEFAULT false NOT NULL,
	"tokens_entrada" integer DEFAULT 0 NOT NULL,
	"tokens_salida" integer DEFAULT 0 NOT NULL,
	"coste_usd" double precision DEFAULT 0 NOT NULL,
	"revision_id" uuid,
	"descartada" boolean DEFAULT false NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"iniciado_en" timestamp with time zone,
	"terminado_en" timestamp with time zone,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ejecuciones_ia" ADD CONSTRAINT "ejecuciones_ia_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ejecuciones_ia" ADD CONSTRAINT "ejecuciones_ia_proceso_id_procesos_id_fk" FOREIGN KEY ("proceso_id") REFERENCES "public"."procesos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ejecuciones_ia" ADD CONSTRAINT "ejecuciones_ia_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ejecuciones_ia" ADD CONSTRAINT "ejecuciones_ia_revision_id_revisiones_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."revisiones"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ejecuciones_ia_cola_idx" ON "ejecuciones_ia" USING btree ("estado","disponible_en");--> statement-breakpoint
CREATE INDEX "ejecuciones_ia_proceso_idx" ON "ejecuciones_ia" USING btree ("proceso_id");--> statement-breakpoint
CREATE INDEX "ejecuciones_ia_consumo_idx" ON "ejecuciones_ia" USING btree ("organizacion_id","creado_en");