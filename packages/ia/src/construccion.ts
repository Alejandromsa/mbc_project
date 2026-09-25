// Construcción de los textos que se envían a la IA e interpretación de sus
// respuestas. Portado del MVP 3.8.9 (aiBuildProcess, processDigestForAi,
// combinedSourceText, aiAnalyzePains) sin cambios en los textos.
import { ordenDeFlujo, type Arista, type MetaProceso, type Nodo, type Pain } from '@processiq/dominio';
import { REGLAS_FUSION } from './prompts.js';

const NL = '\n';

// ------------------------------------------------------------ generación
const PROFUNDIDAD: Readonly<Record<number, string>> = {
  1: 'El consultor presentara esto a un comite. Prioriza hitos de negocio y decisiones que cambian el resultado; aun asi etiqueta con nivel 3 los pasos operativos que el texto mencione.',
  2: 'Detalle habitual de un levantamiento: la actividad que ejecuta cada rol de principio a fin.',
  3: 'Levantamiento exhaustivo: recoge cada paso operativo que el texto mencione, incluidos sistemas y validaciones intermedias.'
};

export interface OpcionesGeneracion {
  /** Persona -> rol, de las transcripciones (el rol es el carril, nunca el nombre). */
  roles?: Record<string, string> | null;
  /** Nivel de detalle pedido (1, 2 o 3). */
  vista?: number;
  /** Hay más de una fuente: se añaden las reglas de fusión. */
  variasFuentes: boolean;
  /** Tope de caracteres del contenido. */
  maxChars: number;
}

/** Mensaje de usuario de la generación de un proceso a partir de un texto. */
export function promptGeneracion(texto: string, etiqueta: string | undefined, o: OpcionesGeneracion): string {
  let roles = '';
  if (o.roles && Object.keys(o.roles).length) {
    roles = NL + NL + '=== QUIEN ES QUIEN (usa el ROL como owner/carril, nunca el nombre) ===' + NL +
      Object.entries(o.roles).map((e) => e[0] + ' = ' + e[1]).join(NL) + NL +
      'Persona no listada: no la conviertas en carril; asigna la actividad al rol que corresponda por contexto.';
  }
  const merge = o.variasFuentes ? REGLAS_FUSION : '';
  const prof = o.vista ? (NL + NL + '=== PROFUNDIDAD PEDIDA ===' + NL + PROFUNDIDAD[o.vista]) : '';
  return `Reconstruye el proceso descrito en el siguiente ${etiqueta || 'documento'} como JSON BPMN según el formato indicado.${merge}${roles}${prof}\n\n=== CONTENIDO ===\n${String(texto).slice(0, o.maxChars)}`;
}

/**
 * Límite de inactividad según el tamaño del prompt: con documentos grandes la
 * IA tarda más en soltar el primer dato. 90 s + 0,5 s por cada 1 000
 * caracteres, con techo de 3 minutos.
 */
export function timeoutGeneracion(prompt: string): number {
  return Math.min(180000, 90000 + Math.floor(prompt.length / 1000) * 500);
}

// ------------------------------------------------------ resumen del proceso
export interface ProcesoParaIa {
  meta: Pick<MetaProceso, 'name' | 'industry' | 'macroprocess'>;
  nodes: readonly Nodo[];
  edges: readonly Arista[];
  lanes?: { list?: string[]; laneOf?: Record<string, string> } | null;
}

/** Descripción textual del proceso modelado (entrada de las tareas del copiloto y del análisis de dolores). */
export function resumenProcesoParaIa(p: ProcesoParaIa): string {
  const lane = (p.lanes && p.lanes.laneOf) || {};
  const nodo = (id: string) => p.nodes.find((n) => n.id === id);
  const lineas = ordenDeFlujo(p.nodes, p.edges).map((n) => {
    const outs = p.edges.filter((e) => e.from === n.id)
      .map((e) => { const t = nodo(e.to); return (e.label ? e.label + ' -> ' : '-> ') + (t ? t.label : '?'); });
    return [
      'id=' + n.id,
      'tipo=' + n.type + (n.gatewayType ? '/' + n.gatewayType : ''),
      'actividad=' + (n.label || ''),
      'rol=' + (lane[n.id] || n.owner || 'sin asignar'),
      n.system ? 'sistema=' + n.system : '',
      n.executionType ? 'ejecucion=' + n.executionType : '',
      n.time ? 'min=' + n.time : '',
      n.volume ? 'vol/mes=' + n.volume : '',
      n.notes ? 'detalle=' + String(n.notes).replace(/\s+/g, ' ').slice(0, 220) : '',
      outs.length ? 'salidas: ' + outs.join(' | ') : ''
    ].filter(Boolean).join(' - ');
  });
  return [
    'PROCESO: ' + (p.meta.name || 'sin nombre'),
    'INDUSTRIA: ' + (p.meta.industry || 'no indicada'),
    'MACROPROCESO: ' + (p.meta.macroprocess || 'no indicado'),
    'ROLES/CARRILES: ' + ((p.lanes && p.lanes.list) || []).join(', '),
    '', 'ACTIVIDADES:', lineas.join(NL)
  ].join(NL);
}

/** Mensaje de usuario de una tarea analítica del copiloto. */
export function promptTarea(instruccion: string, resumen: string): string {
  return instruccion + NL + NL + '=== PROCESO A ANALIZAR ===' + NL + resumen;
}

// ---------------------------------------------------------------- fuentes
export interface Fuente { id: string; tipo: string; nombre: string; texto: string; chars: number }

/**
 * Une varias fuentes con una cabecera cada una. Solo se recorta si entre
 * todas superan el tope, con reparto justo: las cortas entran enteras y el
 * resto del presupuesto se divide entre las largas.
 */
export function combinarFuentes(fuentes: readonly Fuente[], maxChars: number): string {
  if (fuentes.length === 1) return fuentes[0]!.texto;
  const tope: Record<string, number> = {};
  let presupuesto = maxChars;
  fuentes.slice().sort((a, b) => a.chars - b.chars).forEach((s, i, orden) => {
    tope[s.id] = Math.min(s.chars, Math.floor(presupuesto / (orden.length - i)));
    presupuesto -= tope[s.id]!;
  });
  return fuentes.map((s, i) =>
    '=== FUENTE ' + (i + 1) + ' de ' + fuentes.length + ': "' + s.nombre + '" (' + s.tipo + ') ===' + NL +
    s.texto.slice(0, tope[s.id])
  ).join(NL + NL);
}

// ------------------------------------------------------- dolores (pains)
export interface PainIa extends Pain {
  evidence: string;
  impact: string;
  source: 'ia';
}
export interface HipotesisSector {
  titulo?: string; descripcion?: string; donde?: string; senal?: string; severidad?: number;
}
export interface PainsInterpretados {
  /** Pains nuevos por nodo, en el orden en que llegaron. */
  agregados: { nodoId: string; pain: PainIa }[];
  sectoriales: HipotesisSector[];
  siguienteId: number;
}

/**
 * Convierte la respuesta del análisis de dolores en pains para el diagrama.
 * Ignora nodos inexistentes y descripciones ya presentes en el nodo (también
 * entre las que llegan en la misma respuesta); acota severidad y frecuencia a 1..5.
 */
export function interpretarPains(data: any, nodes: readonly Nodo[], siguienteId: number): PainsInterpretados {
  const agregados: PainsInterpretados['agregados'] = [];
  const yaEn = (n: Nodo) => [...(n.pains || []), ...agregados.filter((a) => a.nodoId === n.id).map((a) => a.pain)];
  ((data && data.detectados) || []).forEach((d: any) => {
    const n = nodes.find((x) => x.id === d.nodo);
    if (!n) return;
    const dup = yaEn(n).some((x) => (x.description || '').toLowerCase() === String(d.descripcion || '').toLowerCase());
    if (dup) return;
    agregados.push({
      nodoId: n.id,
      pain: {
        id: 'p' + (siguienteId++),
        category: d.categoria || 'manual',
        description: d.descripcion || '',
        evidence: d.evidencia || '',
        impact: d.impacto || '',
        severity: Math.max(1, Math.min(5, +d.severidad || 3)),
        frequency: Math.max(1, Math.min(5, +d.frecuencia || 3)),
        source: 'ia'
      }
    });
  });
  return { agregados, sectoriales: ((data && data.sectoriales) || []).slice(0, 8), siguienteId };
}
