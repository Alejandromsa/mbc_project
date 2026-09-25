// Validación de cuerpos JSON con Zod y mensajes en español.
import type { Context } from 'hono';
import type { z } from 'zod';
import { ErrorHttp } from './contexto.js';

export async function cuerpo<T extends z.ZodType>(c: Context, esquema: T): Promise<z.infer<T>> {
  let datos: unknown;
  try { datos = await c.req.json(); } catch { throw new ErrorHttp(400, 'El cuerpo no es JSON válido.'); }
  const r = esquema.safeParse(datos);
  if (!r.success) {
    throw new ErrorHttp(400, 'Datos inválidos.', 'VALIDACION', r.error.issues.map((i) => `${i.path.join('.') || '(cuerpo)'}: ${i.message}`));
  }
  return r.data;
}

export const esUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
