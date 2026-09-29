// Conocimiento: búsqueda sobre los procesos de la organización y comparativo
// con el marco APQC (docs/iniciativas/conocimiento.md). Montado en /api/conocimiento.
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { registrar } from '../../auditoria.js';
import { ErrorHttp, type Entorno } from '../../contexto.js';
import { exigirAdmin } from '../../permisos.js';
import { accesoProceso } from '../../rutas/procesos.js';
import { cuerpo } from '../../validar.js';
import { interpretarMarco, MAX_ELEMENTOS, resumenMarco } from './marco.js';
import { buscar, comparativo, marcoDe, parecidos, reemplazarMarco, UMBRAL_COMPARATIVO } from './servicio.js';

const BuscarEsquema = z.object({
  q: z.string().trim().max(200).default(''),
  limite: z.coerce.number().int().min(1).max(50).default(20)
});
const LimiteEsquema = z.object({ limite: z.coerce.number().int().min(1).max(50).default(10) });
const UmbralEsquema = z.object({ umbral: z.coerce.number().min(0.1).max(0.9).default(UMBRAL_COMPARATIVO) });
/** El CSV llega como texto (la web lo lee del archivo). El límite de 8 MB de la API ya acota el tamaño. */
const CsvEsquema = z.object({ csv: z.string().min(1).max(8 * 1024 * 1024) });

/** Parámetros de la URL validados con Zod (400 con el detalle, como `cuerpo()`). */
function parametros<T extends z.ZodType>(c: Context, esquema: T): z.infer<T> {
  const r = esquema.safeParse(c.req.query());
  if (!r.success) {
    throw new ErrorHttp(400, 'Datos inválidos.', 'VALIDACION', r.error.issues.map((i) => `${i.path.join('.') || '(consulta)'}: ${i.message}`));
  }
  return r.data;
}

export function rutasConocimiento() {
  const r = new Hono<Entorno>();

  // Buscar entre los procesos a los que tengo acceso (indexa antes lo que falte)
  r.get('/buscar', async (c) => {
    const { q, limite } = parametros(c, BuscarEsquema);
    if (q.length < 2) throw new ErrorHttp(400, 'Escribe al menos dos letras para buscar.', 'CONOCIMIENTO_CONSULTA_CORTA');
    return c.json(await buscar(c.get('db'), c.get('usuario'), q, limite));
  });

  r.get('/procesos/:id/parecidos', async (c) => {
    const db = c.get('db'), yo = c.get('usuario');
    const { proceso } = await accesoProceso(db, yo, c.req.param('id'), 'leer');
    const { limite } = parametros(c, LimiteEsquema);
    const res = await parecidos(db, yo, proceso.id, limite);
    return c.json({ ...res, procesoId: proceso.id, nombre: proceso.nombre });
  });

  r.get('/procesos/:id/comparativo', async (c) => {
    const db = c.get('db'), yo = c.get('usuario');
    const { proceso } = await accesoProceso(db, yo, c.req.param('id'), 'leer');
    const { umbral } = parametros(c, UmbralEsquema);
    return c.json(await comparativo(db, yo, proceso.id, umbral));
  });

  // Marco de la organización: lo ve cualquiera; lo importa un administrador
  r.get('/marco', async (c) => {
    const { elementos, importadoEn } = await marcoDe(c.get('db'), c.get('usuario').organizacionId);
    return c.json({ ...resumenMarco(elementos), importadoEn });
  });

  // Vista previa: lee y valida el CSV sin guardar nada
  r.post('/marco/vista-previa', async (c) => {
    exigirAdmin(c.get('usuario'));
    const { csv } = await cuerpo(c, CsvEsquema);
    const { elementos, errores, avisos } = interpretarMarco(csv);
    return c.json({
      valido: errores.length === 0, errores, avisos, ...resumenMarco(elementos),
      muestra: elementos.slice(0, 6).map(({ codigo, nombre, nivel }) => ({ codigo, nombre, nivel }))
    });
  });

  // Importar: reemplaza el marco de la organización entero
  r.put('/marco', async (c) => {
    const yo = c.get('usuario');
    exigirAdmin(yo);
    const { csv } = await cuerpo(c, CsvEsquema);
    const { elementos, errores, avisos } = interpretarMarco(csv);
    if (errores.length) throw new ErrorHttp(400, 'El CSV del marco tiene errores: no se importó nada.', 'CONOCIMIENTO_MARCO_INVALIDO', errores);
    if (elementos.length > MAX_ELEMENTOS) throw new ErrorHttp(400, `El marco no puede pasar de ${MAX_ELEMENTOS} elementos.`, 'CONOCIMIENTO_MARCO_INVALIDO');
    const reemplazados = await reemplazarMarco(c.get('db'), yo.organizacionId, elementos);
    const resumen = resumenMarco(elementos);
    await registrar(c, 'conocimiento.marco.importacion', 'conocimiento_marco', null, {
      elementos: resumen.elementos, categorias: resumen.categorias.length, reemplazados
    });
    return c.json({ ...resumen, avisos, reemplazados });
  });

  return r;
}
