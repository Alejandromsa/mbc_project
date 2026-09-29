// Importador BPMN 2.0 nativo (sin librerías): aquí solo se LEE el XML; aplicar
// el resultado al proceso abierto (reinicio, layout, simulación) es cosa de la app.
//
// Dos lecturas:
// - BPMN exportado por el propio ProcessIQ (`exporter="ProcessIQ"`): la del MVP 3.8.9
//   (importBpmnXml), portada sin cambios. Exportar y volver a importar da lo mismo
//   que en el MVP, y la fidelidad lo compara byte a byte.
// - BPMN de otra herramienta (Bizagi, Signavio, Camunda, bpmn.io…): la lectura
//   completa de importar-externo.ts (carriles, pools, subprocesos, posiciones, tipos).
import type { Arista, FormaPorDefecto, Nodo, TipoNodo } from '@processiq/dominio';
import { leerBpmnExterno } from './importar-externo.js';
import type { DocumentoXml, ElementoXml } from './xml.js';

export type LectorXml = (xml: string) => DocumentoXml;

export interface OpcionesLectura {
  /** Primer número libre para ids (state.nextId). */
  siguienteId: number;
  formas: Readonly<Record<string, FormaPorDefecto>>;
  /** Por defecto, el DOMParser del entorno. */
  leerXml?: LectorXml;
}

export interface ConteoLectura { count: number; tasks: number; gateways: number; events: number; flows: number }

export interface ResultadoLectura {
  nodos: Nodo[];
  aristas: Arista[];
  /** Nombre del <process>, vacío si no tiene. */
  nombreProceso: string;
  siguienteId: number;
  conteo: ConteoLectura;
  /** `processiq`: lo exportó este editor y se leyó como en el MVP. `externo`: lectura completa. */
  origen: 'processiq' | 'externo';
  /** Carriles (responsables) del archivo, en su orden. Vacío en la lectura del MVP. */
  carriles: string[];
  /** Subprocesos con contenido: se ven desplegados en el nivel Detalle y plegados en Actividad y Ejecutivo. */
  subprocesos: number;
  /** Lo que no se pudo representar tal cual, en frases para la persona. Vacío en la lectura del MVP. */
  avisos: string[];
}

const lectorPorDefecto: LectorXml = (xml) => {
  const P = (globalThis as { DOMParser?: new () => { parseFromString(s: string, t: string): DocumentoXml } }).DOMParser;
  if (!P) throw new Error('No hay DOMParser en este entorno: pasa opciones.leerXml.');
  return new P().parseFromString(xml, 'application/xml');
};

const NO_ES_XML = 'El archivo no es un XML válido: puede estar incompleto o no ser un diagrama BPMN.';

/**
 * Lee un BPMN 2.0 y devuelve nodos y aristas con ids nuevos (n1, n2… desde
 * `siguienteId`). Tolera cualquier prefijo de namespace. Lanza, sin tocar nada,
 * si el XML no es válido, si no es un BPMN 2.0 o si un BPMN de otra herramienta
 * no trae actividades, eventos ni compuertas.
 */
export function leerBpmn(xmlString: string, opciones: OpcionesLectura): ResultadoLectura {
  let doc: DocumentoXml;
  // @xmldom/xmldom lanza con un XML mal formado; el navegador devuelve un <parsererror>
  try { doc = (opciones.leerXml ?? lectorPorDefecto)(xmlString); } catch { throw new Error(NO_ES_XML); }
  const hayError = typeof doc.querySelector === 'function'
    ? !!doc.querySelector('parsererror')
    : doc.getElementsByTagName('parsererror').length > 0;
  if (hayError) throw new Error(NO_ES_XML);

  const raiz = doc.documentElement;
  if (!raiz || raiz.localName !== 'definitions') {
    const nombre = (raiz && raiz.localName) || '';
    if (nombre === 'Package') {
      throw new Error('El archivo es XPDL (el formato antiguo de Bizagi y otras herramientas), no BPMN 2.0. Expórtalo de nuevo como BPMN 2.0.');
    }
    throw new Error('El archivo es XML, pero no es un diagrama BPMN 2.0: su elemento principal es <' + nombre + '> y debería ser <definitions>.');
  }
  if ((raiz.getAttribute('exporter') || '').trim() === 'ProcessIQ') return leerComoMvp(doc, opciones);
  return leerBpmnExterno(doc, opciones);
}

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
 * La lectura del MVP 3.8.9, sin cambios: plana (también los elementos de dentro
 * de un subProcess), sin carriles ni posiciones, nodos en (0, 0) y sin `owner`.
 */
function leerComoMvp(doc: DocumentoXml, opciones: OpcionesLectura): ResultadoLectura {
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
    conteo: { count: tasks + gateways + events, tasks, gateways, events, flows },
    origen: 'processiq', carriles: [], subprocesos: 0, avisos: []
  };
}
