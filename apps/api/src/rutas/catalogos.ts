// Catálogos administrables: KPIs, verbos del Playbook y temas PPTX de cliente.
// Los lee cualquiera con sesión (el editor los usa en los procesos de
// proyectos); solo los administradores los cambian.
import { Hono } from 'hono';
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { kpis, temasPptx, verbosPlaybook } from '@processiq/db';
import { registrar } from '../auditoria.js';
import { catalogosParaEditor } from '../catalogos.js';
import { ErrorHttp, type Entorno } from '../contexto.js';
import { exigirAdmin } from '../permisos.js';
import { cuerpo, esUuid } from '../validar.js';

const texto = (max: number) => z.string().trim().max(max);

const KpiEsquema = z.object({
  industria: texto(80).min(1),
  macroproceso: texto(80).default(''),
  nombre: texto(160).min(1),
  unidad: texto(40).default(''),
  benchmark: texto(120).default(''),
  descripcion: texto(600).default('')
});
const CambioKpiEsquema = KpiEsquema.partial().extend({ activo: z.boolean().optional() })
  .refine((v) => Object.keys(v).length > 0, 'Nada que cambiar');

const VERBO = /^[a-záéíóúüñ]{2,30}$/;
const VerboEsquema = z.object({
  tipo: z.enum(['permitido', 'prohibido']),
  motivo: texto(200).default('')
}).refine((v) => v.tipo === 'permitido' || v.motivo.length > 0, 'Un verbo prohibido necesita el motivo que verá el consultor.');

// Tema de cliente para el export PPTX: la forma de TEMAS_PPTX (packages/exportar/src/pptx.ts)
const Hex = z.string().regex(/^[0-9A-Fa-f]{6}$/, 'color en hexadecimal de 6 dígitos, sin #');
const Imagen = z.string().max(2_000_000, 'imagen demasiado grande (máximo ~1,5 MB)')
  .regex(/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/, 'imagen PNG o JPEG en data URI');
export const DefinicionTemaEsquema = z.object({
  nombre: texto(60).min(1), autor: texto(120), pie: texto(60),
  dk1: Hex, lt2: Hex, acento: Hex, gris: Hex, antetitulo: Hex, sep: Hex, chipRol: Hex, teal: Hex,
  rosa: Hex, verde: Hex, arena: Hex, circulo: Hex,
  font: texto(60).min(1), fontTitulo: texto(60).min(1),
  logo: Imagen, logoInv: Imagen, foto: Imagen.optional(),
  logoW: z.number().positive().max(6), logoH: z.number().positive().max(3),
  portada: z.enum(['mbc', 'bbva']), portadaFondo: Hex, portadaTexto: Hex, portadaSub: Hex,
  cierre: z.boolean()
}).strict();
/** Los temas del código no se pueden redefinir desde la base. */
const CLAVES_RESERVADAS = new Set(['mbc', 'bbva']);
const TemaEsquema = z.object({
  clave: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,30}$/, 'clave de 2 a 30 caracteres: minúsculas, números y guiones'),
  definicion: DefinicionTemaEsquema
});
const CambioTemaEsquema = z.object({ definicion: DefinicionTemaEsquema.optional(), activo: z.boolean().optional() })
  .refine((v) => Object.keys(v).length > 0, 'Nada que cambiar');

export function rutasCatalogos() {
  const r = new Hono<Entorno>();

  /** Lo que usa el editor en los procesos de proyectos (solo lo activo). */
  r.get('/', async (c) => c.json(await catalogosParaEditor(c.get('db'), c.get('usuario').organizacionId)));

  // ------------------------------------------------------------ KPIs
  r.get('/kpis', async (c) => {
    exigirAdmin(c.get('usuario'));
    const lista = await c.get('db').select().from(kpis).where(eq(kpis.organizacionId, c.get('usuario').organizacionId))
      .orderBy(asc(kpis.industria), asc(kpis.macroproceso), asc(kpis.nombre));
    return c.json({ kpis: lista });
  });

  r.post('/kpis', async (c) => {
    const yo = c.get('usuario');
    exigirAdmin(yo);
    const d = await cuerpo(c, KpiEsquema);
    // Código estable y legible: prefijo de la organización + correlativo corto aleatorio
    const codigo = 'org-' + crypto.randomUUID().slice(0, 8);
    const [k] = await c.get('db').insert(kpis).values({ ...d, organizacionId: yo.organizacionId, codigo }).returning();
    await registrar(c, 'catalogo.kpi.alta', 'kpi', k!.id, { codigo, nombre: d.nombre });
    return c.json({ kpi: k }, 201);
  });

  r.patch('/kpis/:id', async (c) => {
    const yo = c.get('usuario');
    exigirAdmin(yo);
    const id = c.req.param('id');
    if (!esUuid(id)) throw new ErrorHttp(404, 'KPI no encontrado.');
    const cambios = await cuerpo(c, CambioKpiEsquema);
    const [k] = await c.get('db').update(kpis).set({ ...cambios, actualizadoEn: new Date() })
      .where(and(eq(kpis.id, id), eq(kpis.organizacionId, yo.organizacionId))).returning();
    if (!k) throw new ErrorHttp(404, 'KPI no encontrado.');
    await registrar(c, 'catalogo.kpi.cambio', 'kpi', id, cambios);
    return c.json({ kpi: k });
  });

  // ------------------------------------------------------------ Verbos del Playbook
  r.get('/verbos', async (c) => {
    exigirAdmin(c.get('usuario'));
    const lista = await c.get('db').select().from(verbosPlaybook)
      .where(eq(verbosPlaybook.organizacionId, c.get('usuario').organizacionId)).orderBy(asc(verbosPlaybook.verbo));
    return c.json({ verbos: lista });
  });

  r.put('/verbos/:verbo', async (c) => {
    const yo = c.get('usuario');
    exigirAdmin(yo);
    const verbo = decodeURIComponent(c.req.param('verbo')).trim().toLowerCase();
    if (!VERBO.test(verbo)) throw new ErrorHttp(400, 'El verbo debe ser una sola palabra en infinitivo, sin espacios ni números.', 'VALIDACION');
    const d = await cuerpo(c, VerboEsquema);
    const valores = { tipo: d.tipo, motivo: d.tipo === 'prohibido' ? d.motivo : '', actualizadoEn: new Date() };
    await c.get('db').insert(verbosPlaybook).values({ organizacionId: yo.organizacionId, verbo, ...valores })
      .onConflictDoUpdate({ target: [verbosPlaybook.organizacionId, verbosPlaybook.verbo], set: valores });
    await registrar(c, 'catalogo.verbo', 'verbo', verbo, { tipo: d.tipo });
    return c.json({ verbo: { verbo, ...valores } });
  });

  r.delete('/verbos/:verbo', async (c) => {
    const yo = c.get('usuario');
    exigirAdmin(yo);
    const verbo = decodeURIComponent(c.req.param('verbo')).trim().toLowerCase();
    const borrados = await c.get('db').delete(verbosPlaybook)
      .where(and(eq(verbosPlaybook.organizacionId, yo.organizacionId), eq(verbosPlaybook.verbo, verbo))).returning();
    if (!borrados.length) throw new ErrorHttp(404, 'Verbo no encontrado.');
    await registrar(c, 'catalogo.verbo.baja', 'verbo', verbo);
    return c.body(null, 204);
  });

  // ------------------------------------------------------------ Temas PPTX de cliente
  r.get('/temas', async (c) => {
    exigirAdmin(c.get('usuario'));
    const lista = await c.get('db').select().from(temasPptx)
      .where(eq(temasPptx.organizacionId, c.get('usuario').organizacionId)).orderBy(asc(temasPptx.nombre));
    return c.json({ temas: lista });
  });

  r.post('/temas', async (c) => {
    const yo = c.get('usuario');
    exigirAdmin(yo);
    const d = await cuerpo(c, TemaEsquema);
    if (CLAVES_RESERVADAS.has(d.clave)) throw new ErrorHttp(409, `«${d.clave}» es un tema del sistema; elige otra clave.`, 'CLAVE_RESERVADA');
    const [existe] = await c.get('db').select({ id: temasPptx.id }).from(temasPptx)
      .where(and(eq(temasPptx.organizacionId, yo.organizacionId), eq(temasPptx.clave, d.clave))).limit(1);
    if (existe) throw new ErrorHttp(409, `Ya hay un tema con la clave «${d.clave}».`, 'DUPLICADO');
    const [t] = await c.get('db').insert(temasPptx).values({
      organizacionId: yo.organizacionId, clave: d.clave, nombre: d.definicion.nombre, definicion: d.definicion
    }).returning();
    await registrar(c, 'catalogo.tema.alta', 'tema_pptx', t!.id, { clave: d.clave, nombre: d.definicion.nombre });
    return c.json({ tema: t }, 201);
  });

  r.patch('/temas/:id', async (c) => {
    const yo = c.get('usuario');
    exigirAdmin(yo);
    const id = c.req.param('id');
    if (!esUuid(id)) throw new ErrorHttp(404, 'Tema no encontrado.');
    const d = await cuerpo(c, CambioTemaEsquema);
    const [t] = await c.get('db').update(temasPptx).set({
      ...(d.definicion ? { definicion: d.definicion, nombre: d.definicion.nombre } : {}),
      ...(d.activo !== undefined ? { activo: d.activo } : {}),
      actualizadoEn: new Date()
    }).where(and(eq(temasPptx.id, id), eq(temasPptx.organizacionId, yo.organizacionId))).returning();
    if (!t) throw new ErrorHttp(404, 'Tema no encontrado.');
    await registrar(c, 'catalogo.tema.cambio', 'tema_pptx', id, { activo: d.activo, definicion: !!d.definicion });
    return c.json({ tema: t });
  });

  r.delete('/temas/:id', async (c) => {
    const yo = c.get('usuario');
    exigirAdmin(yo);
    const id = c.req.param('id');
    if (!esUuid(id)) throw new ErrorHttp(404, 'Tema no encontrado.');
    const borrados = await c.get('db').delete(temasPptx)
      .where(and(eq(temasPptx.id, id), eq(temasPptx.organizacionId, yo.organizacionId))).returning({ clave: temasPptx.clave });
    if (!borrados.length) throw new ErrorHttp(404, 'Tema no encontrado.');
    await registrar(c, 'catalogo.tema.baja', 'tema_pptx', id, { clave: borrados[0]!.clave });
    return c.body(null, 204);
  });

  return r;
}
