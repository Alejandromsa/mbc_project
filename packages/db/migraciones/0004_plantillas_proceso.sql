CREATE TABLE "plantillas_proceso" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"descripcion" text DEFAULT '' NOT NULL,
	"industria" text DEFAULT '' NOT NULL,
	"contenido" jsonb NOT NULL,
	"schema_version" integer NOT NULL,
	"nodos" integer DEFAULT 0 NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_por" uuid,
	"origen_revision_id" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plantillas_proceso_org_nombre_uq" UNIQUE("organizacion_id","nombre")
);
--> statement-breakpoint
ALTER TABLE "plantillas_proceso" ADD CONSTRAINT "plantillas_proceso_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plantillas_proceso" ADD CONSTRAINT "plantillas_proceso_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plantillas_proceso" ADD CONSTRAINT "plantillas_proceso_origen_revision_id_revisiones_id_fk" FOREIGN KEY ("origen_revision_id") REFERENCES "public"."revisiones"("id") ON DELETE set null ON UPDATE no action;