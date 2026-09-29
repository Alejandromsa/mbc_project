// Indicadores del diagnóstico calculados del contenido v1 de una revisión.
// Funciones puras: no leen la base ni el reloj.
import { validarProceso, type CatalogoVerbos, type ProyectoV1, type Severidad } from '@processiq/dominio';

export type EstadoRevision = 'borrador' | 'en_revision' | 'aprobada';

/** Cuántos procesos tienen su última revisión en cada estado (o ninguna). */
export interface Avance { aprobados: number; enRevision: number; borradores: number; sinRevisiones: number }

export type ConteoHallazgos = Record<Severidad, number> & { total: number };

export interface ResumenPains {
  total: number;
  /** Suma de severidad × frecuencia de todos los pains. */
  puntuacion: number;
  /** El pain de mayor severidad × frecuencia (0 si no hay). */
  maxima: number;
}

export interface Pain {
  actividad: string;
  categoria: string;
  descripcion: string;
  severidad: number;
  frecuencia: number;
  /** Severidad × frecuencia (1 a 25). */
  puntuacion: number;
}

export interface Indicadores {
  /** Nodos por tipo BPMN (task, system, decision, start, end…). */
  porTipo: Record<string, number>;
  /** Actividades = tareas manuales y de sistema (task + system). */
  actividades: number;
  /** Responsables distintos (cada uno es un carril), ordenados. */
  roles: string[];
  /** Tipo de ejecución de las actividades; `sin_tipo` si no lo tienen. */
  ejecucion: Record<string, number>;
  pains: ResumenPains & { lista: Pain[] };
  kpis: { definidos: number; conValor: number };
  hallazgos: ConteoHallazgos;
}

const esActividad = (tipo: string) => tipo === 'task' || tipo === 'system';
const sumar = (r: Record<string, number>, clave: string, n = 1) => { r[clave] = (r[clave] ?? 0) + n; };

export const avanceVacio = (): Avance => ({ aprobados: 0, enRevision: 0, borradores: 0, sinRevisiones: 0 });

export function sumarAvance(a: Avance, estado: EstadoRevision | null): void {
  if (estado === 'aprobada') a.aprobados++;
  else if (estado === 'en_revision') a.enRevision++;
  else if (estado === 'borrador') a.borradores++;
  else a.sinRevisiones++;
}

const hallazgosVacios = (): ConteoHallazgos => ({ critical: 0, high: 0, medium: 0, low: 0, total: 0 });

/**
 * Indicadores de un proceso. `catalogo` son los verbos del Playbook de la
 * organización; sin él, los de @processiq/dominio.
 */
export function calcularIndicadores(p: ProyectoV1, catalogo?: CatalogoVerbos): Indicadores {
  const porTipo: Record<string, number> = {};
  const ejecucion: Record<string, number> = {};
  const roles = new Set<string>();
  const lista: Pain[] = [];
  for (const n of p.nodes) {
    sumar(porTipo, n.type);
    const responsable = (n.owner ?? '').trim();
    if (responsable) roles.add(responsable);
    if (esActividad(n.type)) sumar(ejecucion, n.executionType || 'sin_tipo');
    for (const pain of n.pains ?? []) {
      lista.push({
        actividad: n.label, categoria: pain.category, descripcion: pain.description,
        severidad: pain.severity, frecuencia: pain.frequency, puntuacion: pain.severity * pain.frequency
      });
    }
  }
  lista.sort((a, b) => b.puntuacion - a.puntuacion);

  const valores = Object.values(p.kpiValues ?? {});
  const hallazgos = hallazgosVacios();
  for (const h of validarProceso(p.nodes, p.edges, catalogo)) { hallazgos[h.sev]++; hallazgos.total++; }

  return {
    porTipo,
    actividades: p.nodes.filter((n) => esActividad(n.type)).length,
    roles: [...roles].sort((a, b) => a.localeCompare(b, 'es')),
    ejecucion,
    pains: {
      total: lista.length,
      puntuacion: lista.reduce((s, x) => s + x.puntuacion, 0),
      maxima: lista[0]?.puntuacion ?? 0,
      lista
    },
    kpis: {
      definidos: valores.length,
      conValor: valores.filter((v) => String(v?.value ?? '').trim() !== '').length
    },
    hallazgos
  };
}

export interface PainDeProceso extends Pain { procesoId: string; proceso: string }

export interface IndicadoresCliente {
  /** Procesos con una revisión legible (los que suman a los indicadores). */
  procesosConContenido: number;
  porTipo: Record<string, number>;
  actividades: number;
  /** Responsables distintos entre todos los procesos. */
  roles: number;
  ejecucion: Record<string, number>;
  pains: ResumenPains;
  /** Los pains de mayor puntuación del cliente, con su proceso. */
  painsPrincipales: PainDeProceso[];
  kpis: { definidos: number; conValor: number };
  hallazgos: ConteoHallazgos;
}

/** Suma los indicadores de los procesos de un cliente. */
export function agregarIndicadores(procesos: { id: string; nombre: string; indicadores: Indicadores }[], principales = 5): IndicadoresCliente {
  const porTipo: Record<string, number> = {};
  const ejecucion: Record<string, number> = {};
  const roles = new Set<string>();
  const pains: PainDeProceso[] = [];
  const kpis = { definidos: 0, conValor: 0 };
  const hallazgos = hallazgosVacios();
  let actividades = 0, puntuacion = 0;
  for (const { id, nombre, indicadores: i } of procesos) {
    for (const [k, n] of Object.entries(i.porTipo)) sumar(porTipo, k, n);
    for (const [k, n] of Object.entries(i.ejecucion)) sumar(ejecucion, k, n);
    i.roles.forEach((r) => roles.add(r.toLocaleLowerCase('es')));
    actividades += i.actividades;
    puntuacion += i.pains.puntuacion;
    i.pains.lista.forEach((p) => pains.push({ ...p, procesoId: id, proceso: nombre }));
    kpis.definidos += i.kpis.definidos;
    kpis.conValor += i.kpis.conValor;
    for (const s of ['critical', 'high', 'medium', 'low', 'total'] as const) hallazgos[s] += i.hallazgos[s];
  }
  // Orden estable: puntuación, después proceso y actividad
  pains.sort((a, b) => b.puntuacion - a.puntuacion || a.proceso.localeCompare(b.proceso, 'es') || a.actividad.localeCompare(b.actividad, 'es'));
  return {
    procesosConContenido: procesos.length,
    porTipo, actividades, roles: roles.size, ejecucion,
    pains: { total: pains.length, puntuacion, maxima: pains[0]?.puntuacion ?? 0 },
    painsPrincipales: pains.slice(0, principales),
    kpis, hallazgos
  };
}
