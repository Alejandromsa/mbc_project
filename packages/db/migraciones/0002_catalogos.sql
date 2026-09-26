CREATE TYPE "public"."tipo_verbo" AS ENUM('permitido', 'prohibido');--> statement-breakpoint
CREATE TABLE "kpis" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"codigo" text NOT NULL,
	"industria" text NOT NULL,
	"macroproceso" text DEFAULT '' NOT NULL,
	"nombre" text NOT NULL,
	"unidad" text DEFAULT '' NOT NULL,
	"benchmark" text DEFAULT '' NOT NULL,
	"descripcion" text DEFAULT '' NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kpis_org_codigo_uq" UNIQUE("organizacion_id","codigo")
);
--> statement-breakpoint
CREATE TABLE "temas_pptx" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"clave" text NOT NULL,
	"nombre" text NOT NULL,
	"definicion" jsonb NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "temas_pptx_org_clave_uq" UNIQUE("organizacion_id","clave")
);
--> statement-breakpoint
CREATE TABLE "verbos_playbook" (
	"organizacion_id" uuid NOT NULL,
	"verbo" text NOT NULL,
	"tipo" "tipo_verbo" NOT NULL,
	"motivo" text DEFAULT '' NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verbos_playbook_organizacion_id_verbo_pk" PRIMARY KEY("organizacion_id","verbo")
);
--> statement-breakpoint
ALTER TABLE "kpis" ADD CONSTRAINT "kpis_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "temas_pptx" ADD CONSTRAINT "temas_pptx_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verbos_playbook" ADD CONSTRAINT "verbos_playbook_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;