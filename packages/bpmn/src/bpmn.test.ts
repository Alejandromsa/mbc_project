import { describe, expect, it } from 'vitest';
import { DOMParser } from '@xmldom/xmldom';
import { FORMAS_POR_DEFECTO, type Arista, type Nodo } from '@processiq/dominio';
import { generarBpmnXml, leerBpmn, type LectorXml } from './index.js';

const leerXml: LectorXml = (xml) => new DOMParser().parseFromString(xml, 'application/xml') as never;

const nodo = (id: string, type: Nodo['type'], extra: Partial<Nodo> = {}): Nodo => ({
  id, type, x: 100 * Number(id.slice(1)), y: 50, w: FORMAS_POR_DEFECTO[type].w, h: FORMAS_POR_DEFECTO[type].h,
  label: extra.label ?? id, owner: 'Rol A', ...extra
});

const nodes: Nodo[] = [
  nodo('n1', 'start', { label: 'Inicio', eventType: 'message' }),
  nodo('n2', 'task', { label: 'Registrar <solicitud> & "datos"', executionType: 'system', system: 'CRM', time: '10', volume: '500',
    pains: [{ id: 'p1', category: 'rework', description: 'Reproceso', severity: 4, frequency: 3 }],
    boundary: { type: 'timer', interrupting: false } }),
  nodo('n3', 'decision', { label: '¿Aprobado?', gatewayType: 'parallel', owner: 'Rol B' }),
  nodo('n4', 'task', { label: 'Revisar', executionType: 'manual', marker: 'multiinstance-seq', owner: 'Rol B' }),
  nodo('n5', 'intermediate', { label: 'Avisar', eventType: 'signal', throw: true }),
  nodo('n6', 'end', { label: 'Fin', terminate: true })
];
const edges: Arista[] = [
  { id: 'e7', from: 'n1', to: 'n2', label: '' },
  { id: 'e8', from: 'n2', to: 'n3', label: '' },
  { id: 'e9', from: 'n3', to: 'n4', label: 'Sí' },
  { id: 'e10', from: 'n4', to: 'n5', label: '' },
  { id: 'e11', from: 'n5', to: 'n6', label: '' }
];
const lanes = { list: ['Rol A', 'Rol B'], laneOf: { n1: 'Rol A', n2: 'Rol A', n3: 'Rol B', n4: 'Rol B', n5: 'Rol A', n6: 'Rol A' } };
const proceso = { meta: { name: 'Proceso & prueba', industry: 'Banca', macroprocess: 'O2C' }, nodes, edges, lanes };

describe('generarBpmnXml', () => {
  const xml = generarBpmnXml(proceso, 'Process_1');

  it('produce XML bien formado', () => {
    const errores: string[] = [];
    new DOMParser({ onError: (_nivel: string, msg: string) => { errores.push(msg); } }).parseFromString(xml, 'application/xml');
    expect(errores).toEqual([]);
  });

  it('mapea cada nodo a su elemento BPMN', () => {
    expect(xml).toContain('<bpmn:startEvent id="n1" name="Inicio">');
    expect(xml).toContain('<bpmn:messageEventDefinition />');
    expect(xml).toContain('<bpmn:serviceTask id="n2"');
    expect(xml).toContain('<bpmn:parallelGateway id="n3"');
    expect(xml).toContain('<bpmn:multiInstanceLoopCharacteristics isSequential="true" />');
    expect(xml).toContain('<bpmn:intermediateThrowEvent id="n5"');
    expect(xml).toContain('<bpmn:terminateEventDefinition />');
  });

  it('escapa textos y documenta pains y metadatos', () => {
    expect(xml).toContain('name="Registrar &lt;solicitud&gt; &amp; &quot;datos&quot;"');
    expect(xml).toContain('Pains: [rework|sev4|frec3] Reproceso');
    expect(xml).toContain('Owner: Rol A | System: CRM | Time(min): 10 | Volume: 500');
  });

  it('incluye evento de borde, carriles y DI', () => {
    expect(xml).toContain('<bpmn:boundaryEvent id="n2_be" name="timer" attachedToRef="n2" cancelActivity="false">');
    expect(xml).toContain('<bpmn:lane id="Lane_2" name="Rol B">');
    expect(xml).toContain('<bpmn:flowNodeRef>n2_be</bpmn:flowNodeRef>');
    expect(xml).toContain('<bpmndi:BPMNShape id="n2_be_di" bpmnElement="n2_be">');
    expect(xml).toContain('<bpmndi:BPMNEdge id="e9_di" bpmnElement="e9">');
  });

  it('sin carriles no emite laneSet', () => {
    expect(generarBpmnXml({ ...proceso, lanes: null }, 'P')).not.toContain('laneSet');
  });
});

describe('leerBpmn', () => {
  it('ida y vuelta: conserva tipos, compuertas, eventos y flujos', () => {
    const xml = generarBpmnXml(proceso, 'Process_1');
    const r = leerBpmn(xml, { siguienteId: 1, formas: FORMAS_POR_DEFECTO, leerXml });
    // 6 nodos + el evento de borde (se importa como intermedio)
    expect(r.conteo).toEqual({ count: 7, tasks: 2, gateways: 1, events: 4, flows: 5 });
    expect(r.nombreProceso).toBe('Proceso & prueba');
    const porNombre = Object.fromEntries(r.nodos.map((n) => [n.label, n]));
    expect(porNombre['¿Aprobado?']!.gatewayType).toBe('parallel');
    expect(porNombre['Avisar']!.throw).toBe(true);
    expect(porNombre['Registrar <solicitud> & "datos"']!.executionType).toBe('system');
    expect(r.aristas.find((a) => a.label === 'Sí')).toBeTruthy();
  });

  it('numera ids desde siguienteId, nodos primero y aristas después', () => {
    const r = leerBpmn(generarBpmnXml(proceso, 'P'), { siguienteId: 10, formas: FORMAS_POR_DEFECTO, leerXml });
    expect(r.nodos[0]!.id).toBe('n10');
    expect(r.aristas[0]!.id).toBe('e17');
    expect(r.siguienteId).toBe(22);
  });

  it('subprocesos y callActivity llevan marcador de subproceso', () => {
    const xml = `<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"><process id="p">
      <subProcess id="s1" name="Sub"/><callActivity id="c1" name="Llamada"/></process></definitions>`;
    const r = leerBpmn(xml, { siguienteId: 1, formas: FORMAS_POR_DEFECTO, leerXml });
    expect(r.nodos.map((n) => n.marker)).toEqual(['subprocess', 'subprocess']);
  });

  it('un XML sin elementos BPMN devuelve conteo 0', () => {
    const r = leerBpmn('<raiz/>', { siguienteId: 1, formas: FORMAS_POR_DEFECTO, leerXml });
    expect(r.conteo.count).toBe(0);
  });
});
