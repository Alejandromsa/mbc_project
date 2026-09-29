CREATE TABLE "presencias" (
	"proceso_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"pestana" text NOT NULL,
	"lugar" text NOT NULL,
	"estado" text NOT NULL,
	"desde" timestamp with time zone DEFAULT now() NOT NULL,
	"ultimo_latido" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "presencias_proceso_id_usuario_id_pestana_pk" PRIMARY KEY("proceso_id","usuario_id","pestana")
);
--> statement-breakpoint
ALTER TABLE "presencias" ADD CONSTRAINT "presencias_proceso_id_procesos_id_fk" FOREIGN KEY ("proceso_id") REFERENCES "public"."procesos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presencias" ADD CONSTRAINT "presencias_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "presencias_ultimo_latido_idx" ON "presencias" USING btree ("ultimo_latido");