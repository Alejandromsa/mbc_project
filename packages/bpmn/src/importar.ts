// Importador BPMN 2.0 nativo (sin librerías). Portado del MVP 3.8.9
// (importBpmnXml): aquí solo se LEE el XML; aplicar el resultado al proceso
// abierto (reinicio, layout, simulación) es cosa de la app.
import type { Arista, FormaPorDefecto, Nodo, TipoNodo } from '@processiq/dominio';

/** Lo mínimo del DOM que usa el importador (DOMParser del navegador o @xmldom/xmldom). */
interface ElementoXml {
  localName: string | null;
  getAttribute(nombre: string): string | null;
}
interface DocumentoXml {
  getElementsByTagName(tag: string): ArrayLike<ElementoXml>;
  querySelector?(sel: string): unknown;
}
export type LectorXml = (xml: string) => DocumentoXml;

export interface OpcionesLectura {
  /** Primer número libre para ids (state.nextId). */
  siguienteId: number;
  formas: Readonly<Record<string, FormaPorDefecto>>;
  /** Por defecto, el DOMParser del entorno. */
  leerXml?: LectorXml;
}

export interface ResultadoLectura {
  nodos: Nodo[];
  aristas: Arista[];
  /** Nombre del <process>, vacío si no tiene. */
  nombreProceso: string;
  siguienteId: number;
  conteo: { count: number; tasks: number; gateways: number; events: number; flows: number };
}

const lectorPorDefecto: LectorXml = (xml) => {
  const P = (globalThis as { DOMParser?: new () => { parseFromString(s: string, t: string): DocumentoXml } }).DOMParser;
  if (!P) throw new Error('No hay DOMParser en este entorno: pasa opciones.leerXml.');
  return new P().parseFromString(xml, 'application/xml');
};

const TAREAS = ['task', 'userTask', 'serviceTask', 'manualTask', 'sendTask', 'receiveTask', 'scriptTask', 'businessRuleTask', 'callActivity', 'subProcess'];
const COMPUERTAS = ['exclusiveGateway', 'parallelGateway', 'inclusiveGateway', 'complexGateway', 'eventBasedGateway'];
const INICIOS = ['startEvent'], FINES = ['endEvent'];
const INTERMEDIOS = ['intermediateCatchEvent', 'intermediateThrowEvent', 'boundaryEvent'];

const ejecucionDe = (tag: string) => ({
  userTask: 'manual', serviceTask: 'system', manualTask: 'manual',
  sendTask: 'email', receiveTask: 'email', scriptTask: 'automatic', businessRuleTask: 'system'
} as Record<string, string>)[tag] || 'manual';
const tipoGateway = (tag: string) => ({
  exclusiveGateway: 'exclusive', parallelGateway: 'parallel', inclusiveGateway: 'inclusive',
  complexGateway: 'inclusive', eventBasedGateway: 'exclusive'
} as Record<string, string>)[tag] || 'exclusive';

/**
 * Lee un BPMN 2.0 y devuelve nodos y aristas con ids nuevos (n1, n2… desde
 * `siguienteId`). Tolera cualquier prefijo de namespace. Lanza si el XML no es válido.
 */
export function leerBpmn(xmlString: string, opciones: OpcionesLectura): ResultadoLectura {
  const doc = (opciones.leerXml ?? lectorPorDefecto)(xmlString);
  const hayError = typeof doc.querySelector === 'function'
    ? !!doc.querySelector('parsererror')
    : doc.getElementsByTagName('parsererror').length > 0;
  if (hayError) throw new Error('El XML no es válido.');
  const local = (tag: string) => Array.from(doc.getElementsByTagName('*')).filter((el) => el.localName === tag);

  const { formas } = opciones;
  let siguienteId = opciones.siguienteId;
  const nodos: Nodo[] = [], aristas: Arista[] = [];
  const idMap: Record<string, string> = {};
  let tasks = 0, gateways = 0, events = 0;

  const agregar = (el: ElementoXml, type: TipoNodo, extra: { exec?: string; gatewayType?: string; eventType?: string; throw?: boolean }) => {
    const def = formas[type] || formas.task!;
    const bpmnId = el.getAttribute('id') || ('bp' + siguienteId);
    const label = (el.getAttribute('name') || '').trim() || (type === 'start' ? 'Inicio' : type === 'end' ? 'Fin' : def.label);
    // El orden de las claves es el del MVP: se nota en el JSON exportado.
    const node = {
      id: 'n' + (siguienteId++), type, x: 0, y: 0, w: def.w, h: def.h,
      label, executionType: type === 'task' || type === 'system' ? (extra.exec || 'manual') : '',
      gatewayType: extra.gatewayType, eventType: extra.eventType, throw: extra.throw,
      activityCode: '', owner: '', system: '', time: '', volume: '', va: '',
      sla: '', docsIn: '', docsOut: '', rules: '', notes: '', pains: []
    } as unknown as Nodo;
    idMap[bpmnId] = node.id;
    nodos.push(node);
    return node;
  };

  TAREAS.forEach((tag) => local(tag).forEach((el) => {
    const nd = agregar(el, 'task', { exec: ejecucionDe(tag) });
    if (tag === 'subProcess' || tag === 'callActivity') nd.marker = 'subprocess';
    tasks++;
  }));
  COMPUERTAS.forEach((tag) => local(tag).forEach((el) => { agregar(el, 'decision', { gatewayType: tipoGateway(tag) }); gateways++; }));
  INICIOS.forEach((tag) => local(tag).forEach((el) => { agregar(el, 'start', {}); events++; }));
  FINES.forEach((tag) => local(tag).forEach((el) => { agregar(el, 'end', {}); events++; }));
  INTERMEDIOS.forEach((tag) => local(tag).forEach((el) => {
    agregar(el, 'intermediate', { throw: tag === 'intermediateThrowEvent' || undefined }); events++;
  }));

  let flows = 0;
  local('sequenceFlow').forEach((el) => {
    const from = idMap[el.getAttribute('sourceRef') ?? ''];
    const to = idMap[el.getAttribute('targetRef') ?? ''];
    if (!from || !to) return;
    const label = (el.getAttribute('name') || '').trim();
    aristas.push({ id: 'e' + (siguienteId++), from, to, label });
    flows++;
  });

  const proc = local('process')[0];
  const nombreProceso = (proc && (proc.getAttribute('name') || '').trim()) || '';
  return {
    nodos, aristas, nombreProceso, siguienteId,
    conteo: { count: tasks + gateways + events, tasks, gateways, events, flows }
  };
}
