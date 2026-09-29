CREATE TABLE "invitados_comentarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enlace_id" uuid NOT NULL,
	"revision_id" uuid NOT NULL,
	"elemento_id" text,
	"elemento_etiqueta" text,
	"nombre" text NOT NULL,
	"texto" text NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"resuelto_en" timestamp with time zone,
	"resuelto_por" uuid
);
--> statement-breakpoint
CREATE TABLE "invitados_enlaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizacion_id" uuid NOT NULL,
	"proyecto_id" uuid NOT NULL,
	"proceso_id" uuid NOT NULL,
	"revision_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"destinatario" text NOT NULL,
	"admite_comentarios" boolean DEFAULT true NOT NULL,
	"caduca_en" timestamp with time zone NOT NULL,
	"revocado_en" timestamp with time zone,
	"revocado_por" uuid,
	"creado_por" uuid NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"ultimo_acceso" timestamp with time zone,
	CONSTRAINT "invitados_enlaces_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "invitados_comentarios" ADD CONSTRAINT "invitados_comentarios_enlace_id_invitados_enlaces_id_fk" FOREIGN KEY ("enlace_id") REFERENCES "public"."invitados_enlaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitados_comentarios" ADD CONSTRAINT "invitados_comentarios_revision_id_revisiones_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."revisiones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitados_comentarios" ADD CONSTRAINT "invitados_comentarios_resuelto_por_usuarios_id_fk" FOREIGN KEY ("resuelto_por") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitados_enlaces" ADD CONSTRAINT "invitados_enlaces_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitados_enlaces" ADD CONSTRAINT "invitados_enlaces_proyecto_id_proyectos_id_fk" FOREIGN KEY ("proyecto_id") REFERENCES "public"."proyectos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitados_enlaces" ADD CONSTRAINT "invitados_enlaces_proceso_id_procesos_id_fk" FOREIGN KEY ("proceso_id") REFERENCES "public"."procesos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitados_enlaces" ADD CONSTRAINT "invitados_enlaces_revision_id_revisiones_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."revisiones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitados_enlaces" ADD CONSTRAINT "invitados_enlaces_revocado_por_usuarios_id_fk" FOREIGN KEY ("revocado_por") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitados_enlaces" ADD CONSTRAINT "invitados_enlaces_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invitados_comentarios_enlace_idx" ON "invitados_comentarios" USING btree ("enlace_id");--> statement-breakpoint
CREATE INDEX "invitados_comentarios_revision_idx" ON "invitados_comentarios" USING btree ("revision_id");--> statement-breakpoint
CREATE INDEX "invitados_enlaces_proceso_idx" ON "invitados_enlaces" USING btree ("proceso_id");--> statement-breakpoint
CREATE INDEX "invitados_enlaces_revision_idx" ON "invitados_enlaces" USING btree ("revision_id");