// Estado del sistema y registro de errores de la web (fase 2.4b).
//   POST /api/errores          la web y el editor informan de sus errores (pública, con límite por IP)
//   GET  /api/sistema          estado para el administrador, con avisos
//   GET  /api/sistema/errores/:huella   las últimas repeticiones de un error
import { readdir, stat, statfs } from 'node:fs/promises';
import { join } from 'node:path';
import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { and, desc, eq, gt, sql } from 'drizzle-orm';
import { z } from 'zod';
import { errores, latidos, sesiones, usuarios } from '@processiq/db';
import { ErrorHttp, type Entorno } from '../contexto.js';
import { registrarError } from '../observabilidad.js';
import { exigirAdmin } from '../permisos.js';
import { COOKIE_SESION, hashToken } from '../seguridad.js';
import { cuerpo } from '../validar.js';

const ARRANQUE = new Date();
/** Sin latido del worker durante más de esto, se avisa. */
const WORKER_MUERTO_S = 120;
const RESPALDO_VIEJO_H = 26;

const ErrorClienteEsquema = z.object({
  origen: z.enum(['web', 'editor']),
  mensaje: z.string().max(2000),
  pila: z.string().max(8000).optional(),
  url: z.string().max(500).optional(),
  detalle: z.record(z.string(), z.unknown()).optional()
    .refine((d) => !d || JSON.stringify(d).length <= 4000, 'detalle demasiado grande')
});

/** Límite de informes de error por IP: un navegador en bucle no llena la base. */
class LimiteInformes {
  private readonly cuentas = new Map<string, { n: number; desde: number }>();
  constructor(private readonly max = 20, private readonly ventanaMs = 60_000) {}
  permitir(ip: string): boolean {
    const ahora = Date.now();
    const c = this.cuentas.get(ip);
    if (!c || ahora - c.desde > this.ventanaMs) { this.cuentas.set(ip, { n: 1, desde: ahora }); return true; }
    c.n++;
    if (this.cuentas.size > 5000) this.cuentas.clear();
    return c.n <= this.max;
  }
}

async function respaldos(carpeta: string | undefined) {
  if (!carpeta) return { visible: false as const };
  try {
    const nombres = (await readdir(carpeta)).filter((n) => /^processiq-.*\.dump$/.test(n));
    const archivos = await Promise.all(nombres.map(async (n) => {
      const s = await stat(join(carpeta, n));
      return { archivo: n, bytes: s.size, fecha: s.mtime.toISOString() };
    }));
    archivos.sort((a, b) => b.fecha.localeCompare(a.fecha));
    let disco: { libreBytes: number; totalBytes: number } | null = null;
    try {
      const f = await statfs(carpeta);
      disco = { libreBytes: f.bavail * f.bsize, totalBytes: f.blocks * f.bsize };
    } catch { /* sin statfs en este sistema */ }
    const ultimo = archivos[0] ?? null;
    return {
      visible: true as const, cantidad: archivos.length, ultimo,
      horasDesdeUltimo: ultimo ? (Date.now() - new Date(ultimo.fecha).getTime()) / 3_600_000 : null,
      disco
    };
  } catch {
    return { visible: false as const };
  }
}

export function rutasSistema() {
  const r = new Hono<Entorno>();
  const limite = new LimiteInformes();

  r.post('/errores', async (c) => {
    if (!limite.permitir(c.get('ip'))) throw new ErrorHttp(429, 'Demasiados informes de error.', 'LIMITE');
    const d = await cuerpo(c, ErrorClienteEsquema);
    // Ruta pública (también hay errores en «Entrar»): si hay sesión, se anota quién
    let usuarioId: string | null = null;
    const token = getCookie(c, COOKIE_SESION);
    if (token) {
      const [s] = await c.get('db').select({ id: sesiones.usuarioId }).from(sesiones)
        .where(and(eq(sesiones.tokenHash, hashToken(token)), gt(sesiones.expiraEn, new Date()))).limit(1);
      usuarioId = s?.id ?? null;
    }
    await registrarError(c.get('db'), {
      origen: d.origen, mensaje: d.mensaje, pila: d.pila ?? null, ruta: d.url ?? null, usuarioId,
      agente: c.req.header('user-agent') ?? null, detalle: d.detalle ?? {}
    });
    return c.body(null, 204);
  });

  r.get('/sistema', async (c) => {
    exigirAdmin(c.get('usuario'));
    const db = c.get('db'), config = c.get('config');

    const t0 = performance.now();
    const base = (await db.execute<{ tamano: string; migraciones: number }>(sql`
      select pg_database_size(current_database())::text as tamano,
             (select count(*)::int from drizzle.__drizzle_migrations) as migraciones`)).rows[0]!;
    const latenciaMs = Math.round(performance.now() - t0);

    const [w] = await db.select().from(latidos).where(eq(latidos.servicio, 'worker')).limit(1);
    const segundosSinLatido = w ? (Date.now() - w.en.getTime()) / 1000 : null;

    const ia = (await db.execute<{ en_cola: number; ejecutando: number; fallidas: number; completadas: number; espera_max_s: number | null }>(sql`
      select count(*) filter (where estado = 'en_cola')::int as en_cola,
             count(*) filter (where estado = 'ejecutando')::int as ejecutando,
             count(*) filter (where estado = 'fallida' and creado_en > now() - interval '24 hours')::int as fallidas,
             count(*) filter (where estado = 'completada' and creado_en > now() - interval '24 hours')::int as completadas,
             extract(epoch from now() - min(creado_en) filter (where estado = 'en_cola' and disponible_en <= now()))::float8 as espera_max_s
        from ejecuciones_ia`)).rows[0]!;

    const conteo = (await db.execute<{ dia: number; hora: number }>(sql`
      select count(*) filter (where creado_en > now() - interval '24 hours')::int as dia,
             count(*) filter (where creado_en > now() - interval '1 hour')::int as hora
        from errores`)).rows[0]!;
    const grupos = (await db.execute<{
      huella: string; origen: string; mensaje: string; veces: number; ultima: string; ruta: string | null; pila: string | null;
    }>(sql`
      select huella, origen,
             (array_agg(mensaje order by creado_en desc))[1] as mensaje,
             count(*)::int as veces,
             max(creado_en) as ultima,
             (array_agg(ruta order by creado_en desc))[1] as ruta,
             (array_agg(pila order by creado_en desc))[1] as pila
        from errores where creado_en > now() - interval '7 days'
       group by huella, origen order by max(creado_en) desc limit 30`)).rows;

    const copias = await respaldos(config.carpetaRespaldos);

    const avisos: { nivel: 'atencion' | 'error'; texto: string }[] = [];
    if (segundosSinLatido === null) avisos.push({ nivel: 'error', texto: 'El worker de IA no ha dado señales nunca: ¿está arrancado el servicio «worker»?' });
    else if (segundosSinLatido > WORKER_MUERTO_S) avisos.push({ nivel: 'error', texto: `El worker de IA no da señales desde hace ${Math.round(segundosSinLatido / 60)} min.` });
    if ((ia.espera_max_s ?? 0) > 300) avisos.push({ nivel: 'atencion', texto: `Hay ejecuciones de IA esperando desde hace ${Math.round((ia.espera_max_s ?? 0) / 60)} min.` });
    if (!config.ia.configurada) avisos.push({ nivel: 'atencion', texto: 'La IA del servidor no tiene clave de Anthropic (ANTHROPIC_API_KEY).' });
    if (copias.visible && !copias.ultimo) avisos.push({ nivel: 'error', texto: 'No hay ninguna copia de seguridad.' });
    if (copias.visible && copias.horasDesdeUltimo !== null && copias.horasDesdeUltimo > RESPALDO_VIEJO_H) {
      avisos.push({ nivel: 'error', texto: `La última copia de seguridad es de hace ${Math.round(copias.horasDesdeUltimo)} h.` });
    }
    if (copias.visible && copias.disco && copias.disco.libreBytes / copias.disco.totalBytes < 0.1) {
      avisos.push({ nivel: 'atencion', texto: 'Queda menos del 10 % de disco libre.' });
    }
    if (conteo.hora > 0) avisos.push({ nivel: 'atencion', texto: `${conteo.hora} error(es) en la última hora.` });
    if (latenciaMs > 500) avisos.push({ nivel: 'atencion', texto: `La base de datos responde lento (${latenciaMs} ms).` });

    return c.json({
      version: config.version ?? 'desarrollo',
      api: { arrancadaEn: ARRANQUE.toISOString(), segundosActiva: Math.round((Date.now() - ARRANQUE.getTime()) / 1000), node: process.version },
      baseDeDatos: { latenciaMs, tamanoBytes: Number(base.tamano), migraciones: base.migraciones },
      worker: { ultimoLatido: w?.en.toISOString() ?? null, segundosSinLatido, vivo: segundosSinLatido !== null && segundosSinLatido <= WORKER_MUERTO_S, detalle: w?.detalle ?? null },
      ia: { configurada: config.ia.configurada, enCola: ia.en_cola, ejecutando: ia.ejecutando, fallidas24h: ia.fallidas, completadas24h: ia.completadas },
      respaldos: copias,
      errores: { ultimas24h: conteo.dia, ultimaHora: conteo.hora, grupos },
      avisos
    });
  });

  r.get('/sistema/errores/:huella', async (c) => {
    exigirAdmin(c.get('usuario'));
    const lista = await c.get('db').select({
      id: errores.id, origen: errores.origen, mensaje: errores.mensaje, pila: errores.pila, ruta: errores.ruta,
      agente: errores.agente, detalle: errores.detalle, creadoEn: errores.creadoEn, usuario: usuarios.email
    }).from(errores).leftJoin(usuarios, eq(usuarios.id, errores.usuarioId))
      .where(eq(errores.huella, c.req.param('huella'))).orderBy(desc(errores.creadoEn)).limit(20);
    return c.json({ repeticiones: lista });
  });

  return r;
}
