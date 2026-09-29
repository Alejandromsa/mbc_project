ALTER TABLE "auditoria" ADD COLUMN "organizacion_id" uuid;--> statement-breakpoint
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_organizacion_id_organizaciones_id_fk" FOREIGN KEY ("organizacion_id") REFERENCES "public"."organizaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Rellena las filas existentes (añadido a mano): la organización del autor y, sin autor (entradas fallidas), la de la cuenta afectada
UPDATE "auditoria" AS a SET "organizacion_id" = u."organizacion_id" FROM "usuarios" AS u WHERE a."usuario_id" = u."id";--> statement-breakpoint
UPDATE "auditoria" AS a SET "organizacion_id" = u."organizacion_id" FROM "usuarios" AS u WHERE a."organizacion_id" IS NULL AND a."entidad" = 'usuario' AND a."entidad_id" = u."id"::text;--> statement-breakpoint
CREATE INDEX "auditoria_organizacion_idx" ON "auditoria" USING btree ("organizacion_id","id");
