// Consultas del portafolio. Solo LEE las tablas del núcleo (regla 5 de
// docs/equipo/README.md), siempre filtradas por la organización del usuario y
// por los proyectos en los que participa (el administrador, todos).
import { and, desc, eq, inArray, type SQL } from 'drizzle-orm';
import { miembrosProyecto, procesos, proyectos, revisiones, verbosPlaybook, type BaseDeDatos } from '@processiq/db';
import { migrarProyecto, type CatalogoVerbos } from '@processiq/dominio';
import { ErrorHttp, type UsuarioSesion } from '../../contexto.js';
import {
  agregarIndicadores, avanceVacio, calcularIndicadores, sumarAvance,
  type Avance, type EstadoRevision, type Indicadores, type IndicadoresCliente
} from './indicadores.js';

export interface Opciones {
  /** Incluir los proyectos archivados (por defecto no cuentan). */
  archivados: boolean;
}

interface ProyectoVisible { id: string; nombre: string; cliente: string; archivado: boolean; creadoEn: Date }
interface ProcesoFila { id: string; proyectoId: string; nombre: string; actualizadoEn: Date }

export interface ResumenCliente {
  /** Nombre del cliente tal como se escribe en los proyectos ('' = proyectos sin cliente). */
  cliente: string;
  proyectos: number;
  procesos: number;
  avance: Avance;
  /** Última actualización de un proceso (o creación de un proyecto, si no tiene procesos). */
  actualizadoEn: string | null;
}

export interface ProcesoDetalle {
  id: string;
  nombre: string;
  actualizadoEn: string;
  ultimaRevision: { id: string; numero: number; estado: EstadoRevision; creadaEn: string } | null;
  /** Indicadores de la última revisión; null si no tiene revisiones o su contenido no es válido. */
  indicadores: (Omit<Indicadores, 'pains'> & { pains: Omit<Indicadores['pains'], 'lista'> }) | null;
  /** La última revisión existe pero su contenido no pasa `migrarProyecto`. */
  contenidoInvalido: boolean;
}

export interface DetalleCliente {
  cliente: string;
  resumen: Omit<ResumenCliente, 'cliente'>;
  indicadores: IndicadoresCliente;
  proyectos: { id: string; nombre: string; archivado: boolean; procesos: ProcesoDetalle[] }[];
}

/**
 * Clave con la que se agrupan los clientes: sin mayúsculas, tildes ni espacios
 * repetidos («Seguros Andinos» y «seguros  andinos» son el mismo cliente).
 */
export function claveCliente(cliente: string): string {
  return cliente.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('es').replace(/\s+/g, ' ').trim();
}

const porNombre = (a: string, b: string) => a.localeCompare(b, 'es', { sensitivity: 'base' });

/** Proyectos de la organización que el usuario puede leer (miembro con cualquier rol; el administrador, todos). */
async function proyectosVisibles(db: BaseDeDatos, u: UsuarioSesion, o: Opciones): Promise<ProyectoVisible[]> {
  const columnas = {
    id: proyectos.id, nombre: proyectos.nombre, cliente: proyectos.cliente, archivado: proyectos.archivado, creadoEn: proyectos.creadoEn
  };
  const filtros: SQL[] = [eq(proyectos.organizacionId, u.organizacionId)];
  if (!o.archivados) filtros.push(eq(proyectos.archivado, false));
  if (u.rol === 'admin') return db.select(columnas).from(proyectos).where(and(...filtros)).orderBy(proyectos.creadoEn);
  return db.select(columnas).from(proyectos)
    .innerJoin(miembrosProyecto, and(eq(miembrosProyecto.proyectoId, proyectos.id), eq(miembrosProyecto.usuarioId, u.id)))
    .where(and(...filtros)).orderBy(proyectos.creadoEn);
}

async function procesosDe(db: BaseDeDatos, proyectoIds: string[]): Promise<ProcesoFila[]> {
  if (proyectoIds.length === 0) return [];
  return db.select({ id: procesos.id, proyectoId: procesos.proyectoId, nombre: procesos.nombre, actualizadoEn: procesos.actualizadoEn })
    .from(procesos).where(inArray(procesos.proyectoId, proyectoIds));
}

/** Estado de la última revisión de cada proceso (sin el contenido). */
async function estadosUltimas(db: BaseDeDatos, procesoIds: string[]): Promise<Map<string, EstadoRevision>> {
  if (procesoIds.length === 0) return new Map();
  const filas = await db.selectDistinctOn([revisiones.procesoId], { procesoId: revisiones.procesoId, estado: revisiones.estado })
    .from(revisiones).where(inArray(revisiones.procesoId, procesoIds))
    .orderBy(revisiones.procesoId, desc(revisiones.numero));
  return new Map(filas.map((f) => [f.procesoId, f.estado]));
}

interface UltimaRevision { procesoId: string; id: string; numero: number; estado: EstadoRevision; creadaEn: Date; contenido: unknown }

/** Última revisión de cada proceso, con su contenido. */
async function ultimasConContenido(db: BaseDeDatos, procesoIds: string[]): Promise<Map<string, UltimaRevision>> {
  if (procesoIds.length === 0) return new Map();
  const filas = await db.selectDistinctOn([revisiones.procesoId], {
    procesoId: revisiones.procesoId, id: revisiones.id, numero: revisiones.numero, estado: revisiones.estado,
    creadaEn: revisiones.creadaEn, contenido: revisiones.contenido
  }).from(revisiones).where(inArray(revisiones.procesoId, procesoIds))
    .orderBy(revisiones.procesoId, desc(revisiones.numero));
  return new Map(filas.map((f) => [f.procesoId, f]));
}

/** Verbos del Playbook de la organización (los mismos que usa el editor en modo proyecto). */
async function catalogoVerbos(db: BaseDeDatos, organizacionId: string): Promise<CatalogoVerbos | undefined> {
  const filas = await db.select({ verbo: verbosPlaybook.verbo, tipo: verbosPlaybook.tipo, motivo: verbosPlaybook.motivo })
    .from(verbosPlaybook).where(eq(verbosPlaybook.organizacionId, organizacionId));
  if (filas.length === 0) return undefined;   // sin catálogo propio: los de @processiq/dominio
  return {
    permitidos: filas.filter((f) => f.tipo === 'permitido').map((f) => f.verbo),
    prohibidos: Object.fromEntries(filas.filter((f) => f.tipo === 'prohibido').map((f) => [f.verbo, f.motivo]))
  };
}

interface Grupo { clave: string; cliente: string; proyectos: ProyectoVisible[] }

/**
 * Agrupa los proyectos por cliente. El nombre que se muestra es la grafía más
 * usada; a igualdad, la del proyecto más antiguo (llegan ordenados por fecha).
 */
function agrupar(lista: ProyectoVisible[]): Grupo[] {
  const grupos = new Map<string, { proyectos: ProyectoVisible[]; grafias: Map<string, number> }>();
  for (const p of lista) {
    const clave = claveCliente(p.cliente);
    const g = grupos.get(clave) ?? { proyectos: [], grafias: new Map<string, number>() };
    g.proyectos.push(p);
    const grafia = p.cliente.trim();
    g.grafias.set(grafia, (g.grafias.get(grafia) ?? 0) + 1);
    grupos.set(clave, g);
  }
  return [...grupos].map(([clave, g]) => {
    let cliente = '', veces = 0;
    for (const [grafia, n] of g.grafias) if (n > veces) { cliente = grafia; veces = n; }
    return { clave, cliente, proyectos: g.proyectos };
  });
}

function resumir(grupo: Grupo, lista: ProcesoFila[], estado: (procesoId: string) => EstadoRevision | null): Omit<ResumenCliente, 'cliente'> {
  const avance = avanceVacio();
  lista.forEach((p) => sumarAvance(avance, estado(p.id)));
  const fechas = lista.length ? lista.map((p) => p.actualizadoEn) : grupo.proyectos.map((p) => p.creadoEn);
  const ultima = fechas.reduce<Date | null>((m, f) => (!m || f > m ? f : m), null);
  return { proyectos: grupo.proyectos.length, procesos: lista.length, avance, actualizadoEn: ultima ? ultima.toISOString() : null };
}

/** Clientes con nombre por orden alfabético; los proyectos sin cliente, al final. */
const ordenClientes = (a: { cliente: string }, b: { cliente: string }) =>
  (a.cliente === '' ? 1 : 0) - (b.cliente === '' ? 1 : 0) || porNombre(a.cliente, b.cliente);

export async function resumenClientes(db: BaseDeDatos, u: UsuarioSesion, o: Opciones): Promise<ResumenCliente[]> {
  const visibles = await proyectosVisibles(db, u, o);
  const lista = await procesosDe(db, visibles.map((p) => p.id));
  const estados = await estadosUltimas(db, lista.map((p) => p.id));
  return agrupar(visibles).map((g) => {
    const ids = new Set(g.proyectos.map((p) => p.id));
    return { cliente: g.cliente, ...resumir(g, lista.filter((p) => ids.has(p.proyectoId)), (id) => estados.get(id) ?? null) };
  }).sort(ordenClientes);
}

export async function detalleCliente(db: BaseDeDatos, u: UsuarioSesion, nombre: string, o: Opciones): Promise<DetalleCliente> {
  const clave = claveCliente(nombre);
  const grupo = agrupar(await proyectosVisibles(db, u, o)).find((g) => g.clave === clave);
  // Sin proyectos visibles de ese cliente: 404, igual que un proyecto sin acceso (no delata que existe)
  if (!grupo) throw new ErrorHttp(404, 'Cliente no encontrado.', 'PORTAFOLIO_CLIENTE_NO_ENCONTRADO');
  const lista = await procesosDe(db, grupo.proyectos.map((p) => p.id));
  const ultimas = await ultimasConContenido(db, lista.map((p) => p.id));
  const catalogo = await catalogoVerbos(db, u.organizacionId);

  const conIndicadores: { id: string; nombre: string; indicadores: Indicadores }[] = [];
  const detalle = new Map<string, ProcesoDetalle>();
  for (const p of lista) {
    const ultima = ultimas.get(p.id);
    let indicadores: Indicadores | null = null;
    if (ultima) {
      const r = migrarProyecto(ultima.contenido);
      if (r.ok) {
        indicadores = calcularIndicadores(r.proyecto, catalogo);
        conIndicadores.push({ id: p.id, nombre: p.nombre, indicadores });
      }
    }
    detalle.set(p.id, {
      id: p.id, nombre: p.nombre, actualizadoEn: p.actualizadoEn.toISOString(),
      ultimaRevision: ultima ? { id: ultima.id, numero: ultima.numero, estado: ultima.estado, creadaEn: ultima.creadaEn.toISOString() } : null,
      indicadores: indicadores && { ...indicadores, pains: { total: indicadores.pains.total, puntuacion: indicadores.pains.puntuacion, maxima: indicadores.pains.maxima } },
      contenidoInvalido: !!ultima && !indicadores
    });
  }

  return {
    cliente: grupo.cliente,
    resumen: resumir(grupo, lista, (id) => ultimas.get(id)?.estado ?? null),
    indicadores: agregarIndicadores(conIndicadores, 10),
    proyectos: [...grupo.proyectos].sort((a, b) => porNombre(a.nombre, b.nombre)).map((pr) => ({
      id: pr.id, nombre: pr.nombre, archivado: pr.archivado,
      procesos: lista.filter((p) => p.proyectoId === pr.id).sort((a, b) => porNombre(a.nombre, b.nombre)).map((p) => detalle.get(p.id)!)
    }))
  };
}
