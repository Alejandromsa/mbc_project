// Consultas de Conocimiento: índice perezoso, búsqueda, procesos parecidos y
// comparativo con el marco. Lee las tablas del núcleo (procesos, revisiones,
// proyectos, miembros) filtrando SIEMPRE por la organización y el acceso del
// usuario; solo escribe en las suyas (conocimiento_*).
import { asc, desc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { conocimientoIndice, conocimientoMarco, revisiones, type BaseDeDatos } from '@processiq/db';
import type { UsuarioSesion } from '../../contexto.js';
import { coberturaPorCategoria, type ElementoMarco } from './marco.js';
import {
  actividadesDe, normalizar, PALABRAS_VACIAS, palabras, parecidoFrases, recortar, textoDeProceso, type Campo, type Fragmento
} from './texto.js';

/** Umbral de parecido por palabra al buscar (pg_trgm.word_similarity_threshold): tolera erratas («polisa»). */
export const UMBRAL_BUSQUEDA = 0.5;
/** Puntuación mínima de un resultado: descarta los que solo se parecen de lejos en cada palabra. */
export const MIN_RESULTADO = 0.5;
/** Hasta este largo, una palabra buscada tiene que aparecer entera (sin tolerancia a erratas). */
const PALABRA_CORTA = 3;
/**
 * Por debajo de este parecido entre procesos no se muestran. Es un suelo contra
 * el ruido, no una frontera: la pantalla ordena y explica qué comparten.
 */
export const MIN_PARECIDO = 0.2;
/** Dos actividades de procesos distintos cuentan como «en común» desde este parecido. */
const MIN_ACTIVIDAD_COMUN = 0.6;
/** Umbral por defecto del comparativo: parecido mínimo entre una actividad y un elemento del marco. */
export const UMBRAL_COMPARATIVO = 0.35;
/** Revisiones que se leen de una vez al indexar (su contenido puede pesar). */
const LOTE_INDEXADO = 25;

/** Palabras de la consulta, sin tildes ni palabras vacías (como mucho 8). */
export function terminosDe(consulta: string): string[] {
  const todas = palabras(consulta).filter((p) => p.length >= 2);
  const utiles = [...new Set(todas.filter((p) => !PALABRAS_VACIAS.has(p)))];
  return (utiles.length ? utiles : todas).slice(0, 8);
}

/** Proyectos que el usuario puede leer: los de su organización y, si no es administrador, solo donde es miembro. */
function conAcceso(yo: UsuarioSesion): SQL {
  return yo.rol === 'admin'
    ? sql`pr.organizacion_id = ${yo.organizacionId}`
    : sql`pr.organizacion_id = ${yo.organizacionId}
          and exists (select 1 from miembros_proyecto m where m.proyecto_id = pr.id and m.usuario_id = ${yo.id})`;
}

/**
 * Indexa (o reindexa) la última revisión de cada proceso de la organización
 * que falte en el índice o haya cambiado (revisión nueva o proceso renombrado).
 * Perezoso: se llama al buscar, sin tocar el guardado de revisiones del núcleo.
 * Devuelve cuántos procesos indexó.
 */
export async function indexarPendientes(db: BaseDeDatos, organizacionId: string): Promise<number> {
  const pendientes = (await db.execute<{ proceso_id: string; nombre: string; revision_id: string }>(sql`
    select p.id as proceso_id, p.nombre, u.id as revision_id
      from procesos p
      join proyectos pr on pr.id = p.proyecto_id
     cross join lateral (select r.id from revisiones r where r.proceso_id = p.id order by r.numero desc limit 1) u
      left join conocimiento_indice i on i.proceso_id = p.id
     where pr.organizacion_id = ${organizacionId}
       and (i.proceso_id is null or i.revision_id <> u.id or i.nombre <> p.nombre)`)).rows;

  let indexados = 0;
  for (let k = 0; k < pendientes.length; k += LOTE_INDEXADO) {
    const lote = pendientes.slice(k, k + LOTE_INDEXADO);
    const contenidos = await db.select({ id: revisiones.id, contenido: revisiones.contenido }).from(revisiones)
      .where(inArray(revisiones.id, lote.map((p) => p.revision_id)));
    const porId = new Map(contenidos.map((c) => [c.id, c.contenido as Record<string, any>]));
    const filas = lote.filter((p) => porId.has(p.revision_id)).map((p) => {
      const t = textoDeProceso(p.nombre, porId.get(p.revision_id)!);
      return { procesoId: p.proceso_id, revisionId: p.revision_id, nombre: p.nombre, texto: t.texto, textoParecido: t.textoParecido, fragmentos: t.fragmentos };
    });
    if (!filas.length) continue;
    try {
      await db.insert(conocimientoIndice).values(filas).onConflictDoUpdate({
        target: conocimientoIndice.procesoId,
        set: {
          revisionId: sql`excluded.revision_id`, nombre: sql`excluded.nombre`, texto: sql`excluded.texto`,
          textoParecido: sql`excluded.texto_parecido`, fragmentos: sql`excluded.fragmentos`, indexadoEn: sql`now()`
        }
      });
      indexados += filas.length;
    } catch (e) {
      // Un proceso borrado mientras tanto (clave foránea): el lote se reintenta en la próxima búsqueda
      if ((e as { code?: string }).code !== '23503' && (e as { cause?: { code?: string } }).cause?.code !== '23503') throw e;
    }
  }
  return indexados;
}

export interface ProcesoEncontrado {
  procesoId: string;
  nombre: string;
  proyecto: { id: string; nombre: string; cliente: string; archivado: boolean };
  revision: { id: string; numero: number; estado: string };
  /** 0 a 1 */
  parecido: number;
}

type FilaProceso = {
  proceso_id: string; nombre: string; proyecto_id: string; proyecto: string; cliente: string; archivado: boolean;
  revision_id: string; numero: number; estado: string; parecido: number;
};

const COLUMNAS_PROCESO = sql`i.proceso_id, p.nombre, p.actualizado_en, pr.id as proyecto_id, pr.nombre as proyecto, pr.cliente,
  pr.archivado, r.id as revision_id, r.numero, r.estado::text as estado`;
const UNIONES_PROCESO = sql`conocimiento_indice i
  join procesos p on p.id = i.proceso_id
  join proyectos pr on pr.id = p.proyecto_id
  join revisiones r on r.id = i.revision_id`;

const aProceso = (f: FilaProceso): ProcesoEncontrado => ({
  procesoId: f.proceso_id, nombre: f.nombre,
  proyecto: { id: f.proyecto_id, nombre: f.proyecto, cliente: f.cliente, archivado: f.archivado },
  revision: { id: f.revision_id, numero: f.numero, estado: f.estado },
  parecido: Math.round(Number(f.parecido) * 1000) / 1000
});

/** Orden de preferencia del extracto cuando dos trozos coinciden igual: el nombre ya se ve en el título. */
const PRIORIDAD = sql`case f->>'campo' when 'actividad' then 1 when 'sistema' then 2 when 'rol' then 3
  when 'elemento' then 4 when 'ficha' then 5 else 6 end`;

export interface ResultadoBusqueda extends ProcesoEncontrado {
  extracto: { campo: Campo; texto: string; etiqueta?: string };
}

/**
 * Procesos (última revisión) donde aparecen todas las palabras de la consulta,
 * con tolerancia a erratas y sin distinguir tildes ni mayúsculas, ordenados por
 * parecido. El extracto es el trozo (actividad, sistema, rol, ficha…) que mejor coincide.
 */
export async function buscar(db: BaseDeDatos, yo: UsuarioSesion, consulta: string, limite: number): Promise<{ terminos: string[]; resultados: ResultadoBusqueda[] }> {
  const terminos = terminosDe(consulta);
  if (!terminos.length) return { terminos, resultados: [] };
  await indexarPendientes(db, yo.organizacionId);

  const doc = sql`conocimiento_normalizar(i.texto)`;
  const termino = (t: string) => sql`conocimiento_normalizar(${t}::text)`;
  // Todas las palabras deben estar (operador <% con el índice de trigramas). Las
  // de tres letras o menos (SAP, ERP, CRM…) tienen tan pocos trigramas que
  // «sap» se parecería a «salud»: esas tienen que estar como palabra entera.
  const condiciones = sql.join(terminos.map((t) => t.length > PALABRA_CORTA
    ? sql`${termino(t)} <% ${doc}`
    : sql`${termino(t)} <% ${doc} and strict_word_similarity(${termino(t)}, ${doc}) >= 0.99`), sql` and `);
  const porPalabra = sql.join(terminos.map((t) => sql`word_similarity(${termino(t)}, ${doc})`), sql` + `);
  const enTrozo = sql.join(terminos.map((t) => sql`word_similarity(${termino(t)}, conocimiento_normalizar(f->>'texto'))`), sql` + `);
  const frase = termino(terminos.join(' '));

  const filas = await db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('pg_trgm.word_similarity_threshold', ${String(UMBRAL_BUSQUEDA)}, true)`);
    return (await tx.execute<FilaProceso & { campo: Campo; texto: string; etiqueta: string | null }>(sql`
      with encontrados as (
        select * from (
          select ${COLUMNAS_PROCESO}, i.fragmentos,
                 -- media entre el parecido de cada palabra y el de la frase entera
                 ((${porPalabra}) / ${terminos.length}::float8 + word_similarity(${frase}, ${doc})) / 2 as parecido,
                 similarity(${frase}, conocimiento_normalizar(p.nombre)) as parecido_nombre
            from ${UNIONES_PROCESO}
           where ${conAcceso(yo)} and ${condiciones}) c
         where c.parecido >= ${MIN_RESULTADO}
         order by c.parecido desc, c.parecido_nombre desc, c.actualizado_en desc
         limit ${limite})
      select e.proceso_id, e.nombre, e.proyecto_id, e.proyecto, e.cliente, e.archivado, e.revision_id, e.numero, e.estado,
             e.parecido, x.campo, x.texto, x.etiqueta
        from encontrados e
       cross join lateral (
         select f->>'campo' as campo, f->>'texto' as texto, f->>'etiqueta' as etiqueta
           from jsonb_array_elements(e.fragmentos) with ordinality as t(f, n)
          order by (${enTrozo}) desc, ${PRIORIDAD}, n
          limit 1) x
       order by e.parecido desc, e.parecido_nombre desc, e.actualizado_en desc`)).rows;
  });

  return {
    terminos,
    resultados: filas.map((f) => ({
      ...aProceso(f),
      extracto: { campo: f.campo, texto: recortar(f.texto, terminos), ...(f.etiqueta ? { etiqueta: f.etiqueta } : {}) }
    }))
  };
}

/** Datos del proceso para las pantallas (ya comprobado el acceso) y si está en el índice. */
async function procesoIndexado(db: BaseDeDatos, yo: UsuarioSesion, procesoId: string) {
  const [fila] = (await db.execute<FilaProceso & { fragmentos: Fragmento[] }>(sql`
    select ${COLUMNAS_PROCESO}, i.fragmentos, 1 as parecido
      from ${UNIONES_PROCESO}
     where i.proceso_id = ${procesoId} and ${conAcceso(yo)}`)).rows;
  return fila ? { proceso: aProceso(fila), fragmentos: fila.fragmentos } : null;
}

export interface ProcesoParecido extends ProcesoEncontrado {
  /**
   * Lo que comparten, con los textos del proceso de partida: sistemas y roles
   * iguales (sin tildes ni mayúsculas) y actividades iguales o casi iguales.
   */
  enComun: { actividades: string[]; sistemas: string[]; roles: string[] };
}

/**
 * Procesos parecidos a uno dado, entre los que el usuario puede ver: parecido
 * de trigramas entre sus textos de parecido (nombre, objeto de las actividades,
 * sistemas y roles), más lo que comparten, para explicar el porqué.
 */
export async function parecidos(db: BaseDeDatos, yo: UsuarioSesion, procesoId: string, limite: number) {
  await indexarPendientes(db, yo.organizacionId);
  const base = await procesoIndexado(db, yo, procesoId);
  if (!base) return { proceso: null, parecidos: [] as ProcesoParecido[] };

  // texto_parecido ya está normalizado (texto.ts): se compara tal cual
  const filas = (await db.execute<FilaProceso & { fragmentos: Fragmento[] }>(sql`
    with base as (select texto_parecido as t from conocimiento_indice where proceso_id = ${procesoId})
    select * from (
      select ${COLUMNAS_PROCESO}, i.fragmentos, similarity(base.t, i.texto_parecido) as parecido
        from ${UNIONES_PROCESO}, base
       where ${conAcceso(yo)} and i.proceso_id <> ${procesoId}) c
     where c.parecido >= ${MIN_PARECIDO}
     order by c.parecido desc, c.actualizado_en desc
     limit ${limite}`)).rows;

  const de = (fs: Fragmento[], campo: Campo) => fs.filter((f) => f.campo === campo).map((f) => f.texto);
  const propias = { actividad: de(base.fragmentos, 'actividad'), sistema: de(base.fragmentos, 'sistema'), rol: de(base.fragmentos, 'rol') };
  const iguales = (propios: string[], otros: string[]) => {
    const suyos = new Set(otros.map(normalizar));
    return propios.filter((t) => suyos.has(normalizar(t)));
  };
  const actividadesComunes = (otras: string[]) =>
    propias.actividad.filter((a) => otras.some((o) => parecidoFrases(a, o) >= MIN_ACTIVIDAD_COMUN));

  return {
    proceso: base.proceso,
    parecidos: filas.map((f): ProcesoParecido => ({
      ...aProceso(f),
      enComun: {
        actividades: actividadesComunes(de(f.fragmentos, 'actividad')),
        sistemas: iguales(propias.sistema, de(f.fragmentos, 'sistema')),
        roles: iguales(propias.rol, de(f.fragmentos, 'rol'))
      }
    }))
  };
}

export interface ActividadComparada {
  id: string;
  texto: string;
  rol: string;
  /** Elemento del marco más parecido por encima del umbral, o null. */
  elemento: { codigo: string; nombre: string; nivel: number } | null;
  parecido: number | null;
}

/**
 * Comparativo de un proceso (su última revisión) con el marco de la
 * organización: para cada actividad, el elemento más parecido por encima del
 * umbral (media entre el parecido de trigramas y el de la actividad dentro del
 * nombre del elemento; a igualdad, el más específico) y la cobertura por
 * categoría de nivel 1.
 */
export async function comparativo(db: BaseDeDatos, yo: UsuarioSesion, procesoId: string, umbral: number) {
  const elementos = await db.select({ codigo: conocimientoMarco.codigo, nombre: conocimientoMarco.nombre, nivel: conocimientoMarco.nivel })
    .from(conocimientoMarco).where(eq(conocimientoMarco.organizacionId, yo.organizacionId)).orderBy(asc(conocimientoMarco.orden));
  const [ultima] = await db.select({ id: revisiones.id, numero: revisiones.numero, contenido: revisiones.contenido }).from(revisiones)
    .where(eq(revisiones.procesoId, procesoId)).orderBy(desc(revisiones.numero)).limit(1);
  const actividades = ultima ? actividadesDe(ultima.contenido as Record<string, any>) : [];
  const revision = ultima ? { id: ultima.id, numero: ultima.numero } : null;
  if (!elementos.length || !actividades.length) {
    return { marco: { elementos: elementos.length }, revision, umbral, actividades: actividades.map((a) => ({ ...a, elemento: null, parecido: null })), categorias: [] };
  }

  const entrada = JSON.stringify(actividades.map((a, i) => ({ i, texto: a.texto })));
  const mejores = (await db.execute<{ i: number; codigo: string | null; nombre: string | null; nivel: number | null; parecido: number | null }>(sql`
    with actividades as (
      select (a->>'i')::int as i, conocimiento_normalizar(a->>'texto') as t
        from jsonb_array_elements(${entrada}::jsonb) a),
    elementos as materialized (
      select codigo, nombre, nivel, orden, conocimiento_normalizar(nombre) as n
        from conocimiento_marco where organizacion_id = ${yo.organizacionId})
    select a.i, m.codigo, m.nombre, m.nivel, m.parecido
      from actividades a
      left join lateral (
        select e.codigo, e.nombre, e.nivel, (similarity(a.t, e.n) + word_similarity(a.t, e.n)) / 2 as parecido
          from elementos e
         order by parecido desc, e.nivel desc, e.orden
         limit 1) m on m.parecido >= ${umbral}
     order by a.i`)).rows;

  const porIndice = new Map(mejores.map((m) => [Number(m.i), m]));
  const comparadas: ActividadComparada[] = actividades.map((a, i) => {
    const m = porIndice.get(i);
    return {
      ...a,
      elemento: m?.codigo ? { codigo: m.codigo, nombre: m.nombre!, nivel: m.nivel! } : null,
      parecido: m?.codigo ? Math.round(Number(m.parecido) * 1000) / 1000 : null
    };
  });
  return {
    marco: { elementos: elementos.length }, revision, umbral, actividades: comparadas,
    categorias: coberturaPorCategoria(elementos, comparadas.map((a) => ({ codigo: a.elemento?.codigo ?? null })))
  };
}

/** Elementos del marco de la organización, en el orden del archivo, y cuándo se importó. */
export async function marcoDe(db: BaseDeDatos, organizacionId: string) {
  const elementos = await db.select({ codigo: conocimientoMarco.codigo, nombre: conocimientoMarco.nombre, nivel: conocimientoMarco.nivel, creadoEn: conocimientoMarco.creadoEn })
    .from(conocimientoMarco).where(eq(conocimientoMarco.organizacionId, organizacionId)).orderBy(asc(conocimientoMarco.orden));
  return { elementos, importadoEn: elementos[0]?.creadoEn ?? null };
}

/** Reemplaza el marco de la organización (en una transacción: o todo o nada). */
export async function reemplazarMarco(db: BaseDeDatos, organizacionId: string, elementos: ElementoMarco[]): Promise<number> {
  return db.transaction(async (tx) => {
    const borrados = await tx.delete(conocimientoMarco).where(eq(conocimientoMarco.organizacionId, organizacionId)).returning({ id: conocimientoMarco.id });
    for (let k = 0; k < elementos.length; k += 1000) {
      await tx.insert(conocimientoMarco).values(elementos.slice(k, k + 1000).map((e) => ({ ...e, organizacionId })));
    }
    return borrados.length;
  });
}
