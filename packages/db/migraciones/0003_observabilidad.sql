CREATE TYPE "public"."origen_error" AS ENUM('api', 'web', 'editor', 'worker');--> statement-breakpoint
CREATE TABLE "errores" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"origen" "origen_error" NOT NULL,
	"mensaje" text NOT NULL,
	"pila" text,
	"ruta" text,
	"huella" text NOT NULL,
	"usuario_id" uuid,
	"agente" text,
	"detalle" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "latidos" (
	"servicio" text PRIMARY KEY NOT NULL,
	"detalle" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "errores_creado_idx" ON "errores" USING btree ("creado_en");--> statement-breakpoint
CREATE INDEX "errores_huella_idx" ON "errores" USING btree ("huella");