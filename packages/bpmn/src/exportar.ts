// Export BPMN 2.0 XML (compatible con Bizagi, Camunda, Signavio y ARIS).
// Portado del MVP 3.8.9 (generateBpmnXml) sin cambios en la salida.
import { centroNodo, type Arista, type MetaProceso, type Nodo } from '@processiq/dominio';

/** Carriles calculados por el auto-layout (state._lanes del MVP). */
export interface CarrilesBpmn {
  list?: string[];
  laneOf?: Record<string, string>;
}

export interface ProcesoBpmn {
  meta: Pick<MetaProceso, 'name' | 'industry' | 'macroprocess'>;
  nodes: readonly Nodo[];
  edges: readonly Arista[];
  lanes?: CarrilesBpmn | null;
}

const esc = (s: unknown) => String(s || '').replace(/[<>&"']/g, (c) =>
  ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' } as Record<string, string>)[c]!);

// Nodo de ProcessIQ -> elemento BPMN (respeta gateway, evento y tipo de tarea)
function tipoBpmn(n: Nodo): string {
  const t = n.type;
  if (t === 'start') return 'startEvent';
  if (t === 'end') return 'endEvent';
  if (t === 'intermediate') return n.throw ? 'intermediateThrowEvent' : 'intermediateCatchEvent';
  if (t === 'decision') {
    return n.gatewayType === 'parallel' ? 'parallelGateway'
         : n.gatewayType === 'inclusive' ? 'inclusiveGateway'
         : 'exclusiveGateway';
  }
  if (t === 'document' || t === 'data') return 'dataStoreReference';
  // Tareas: el tipo de ejecución decide el subtipo BPMN. 'receive', 'ia',
  // 'script' y 'user' no existen en el catálogo actual; se conservan por datos antiguos.
  const ex = n.executionType as string | undefined;
  if (t === 'system' || ex === 'automatic' || ex === 'system') return 'serviceTask';
  if (ex === 'manual') return 'manualTask';
  if (ex === 'email' || ex === 'send') return 'sendTask';
  if (ex === 'receive') return 'receiveTask';
  if (ex === 'ia' || ex === 'script') return 'scriptTask';
  if (ex === 'user') return 'userTask';
  return 'task';
}

// Definición de evento (timer/message/error/signal/terminate) en inicio, fin e intermedio
function definicionEvento(n: Nodo): string {
  if (n.type === 'end' && n.terminate) return '      <bpmn:terminateEventDefinition />\n';
  const ev = n.eventType;
  if (!ev || ev === 'none') return '';
  const map: Record<string, string> = {
    message: 'messageEventDefinition', timer: 'timerEventDefinition',
    error: 'errorEventDefinition', signal: 'signalEventDefinition'
  };
  return map[ev] ? `      <bpmn:${map[ev]} />\n` : '';
}

// Características de bucle para los marcadores de actividad
function caracteristicasBucle(n: Nodo): string {
  if (n.marker === 'loop') return '      <bpmn:standardLoopCharacteristics />\n';
  if (n.marker === 'multiinstance') return '      <bpmn:multiInstanceLoopCharacteristics isSequential="false" />\n';
  if (n.marker === 'multiinstance-seq') return '      <bpmn:multiInstanceLoopCharacteristics isSequential="true" />\n';
  return '';
}

const esEvento = (t: string) => t === 'start' || t === 'end' || t === 'intermediate';

/**
 * Genera el documento BPMN 2.0 con flujo, carriles (laneSet) y diagrama (DI).
 * @param idProceso id del elemento <bpmn:process>; el MVP usa 'Process_' + Date.now()
 */
export function generarBpmnXml(proceso: ProcesoBpmn, idProceso: string): string {
  const { meta, nodes, edges } = proceso;
  const procId = idProceso;
  const planeId = 'Plane_' + procId;
  const nodoPorId = (id: string) => nodes.find((n) => n.id === id);

  // incoming/outgoing por nodo
  const incoming: Record<string, string[]> = {}, outgoing: Record<string, string[]> = {};
  edges.forEach((e) => {
    (outgoing[e.from] = outgoing[e.from] || []).push(e.id);
    (incoming[e.to] = incoming[e.to] || []).push(e.id);
  });

  // ============ FLOW ELEMENTS ============
  let processBody = '';
  nodes.forEach((n) => {
    const t = tipoBpmn(n);
    const ins = (incoming[n.id] || []).map((id) => `      <bpmn:incoming>${id}</bpmn:incoming>`).join('\n');
    const outs = (outgoing[n.id] || []).map((id) => `      <bpmn:outgoing>${id}</bpmn:outgoing>`).join('\n');

    let docs = '';
    if (n.pains && n.pains.length > 0) {
      const painsText = n.pains.map((p) =>
        `[${p.category}|sev${p.severity}|frec${p.frequency}] ${p.description}`
      ).join(' || ');
      docs = `      <bpmn:documentation>Pains: ${esc(painsText)}</bpmn:documentation>\n`;
    }
    if (n.owner || n.system || n.time || n.volume) {
      const metaLine = `Owner: ${n.owner || '-'} | System: ${n.system || '-'} | Time(min): ${n.time || '-'} | Volume: ${n.volume || '-'}`;
      docs += `      <bpmn:documentation>${esc(metaLine)}</bpmn:documentation>\n`;
    }

    processBody += `    <bpmn:${t} id="${n.id}" name="${esc(n.label)}">\n`;
    processBody += docs;
    if (ins) processBody += ins + '\n';
    if (outs) processBody += outs + '\n';
    if (esEvento(n.type)) processBody += definicionEvento(n);
    else processBody += caracteristicasBucle(n);
    processBody += `    </bpmn:${t}>\n`;
  });
  // Eventos de borde, adjuntos a su tarea. Datos antiguos guardan boundary como texto.
  nodes.forEach((n) => {
    const b = n.boundary as { type?: string; interrupting?: boolean } | string | null | undefined;
    if (!b) return;
    const bt = typeof b === 'string' ? b : (b.type || 'timer');
    const interrupting = (typeof b === 'object') ? b.interrupting !== false : true;
    const defMap: Record<string, string> = { timer: 'timerEventDefinition', error: 'errorEventDefinition', message: 'messageEventDefinition' };
    processBody += `    <bpmn:boundaryEvent id="${n.id}_be" name="${esc(bt)}" attachedToRef="${n.id}" cancelActivity="${interrupting}">\n` +
                   `      <bpmn:${defMap[bt] || 'timerEventDefinition'} />\n` +
                   `    </bpmn:boundaryEvent>\n`;
  });

  edges.forEach((e) => {
    processBody += `    <bpmn:sequenceFlow id="${e.id}" sourceRef="${e.from}" targetRef="${e.to}"${e.label ? ` name="${esc(e.label)}"` : ''} />\n`;
  });

  // ============ SWIMLANES (laneSet por responsable) ============
  const laneList = proceso.lanes?.list ?? [];
  const laneOf = proceso.lanes?.laneOf ?? {};
  if (laneList.length > 0) {
    let laneSetXml = '    <bpmn:laneSet id="LaneSet_1">\n';
    laneList.forEach((laneName, li) => {
      const refs: string[] = [];
      nodes.forEach((n) => {
        if ((laneOf[n.id] || '') === laneName) {
          refs.push(`        <bpmn:flowNodeRef>${n.id}</bpmn:flowNodeRef>`);
          if (n.boundary) refs.push(`        <bpmn:flowNodeRef>${n.id}_be</bpmn:flowNodeRef>`);
        }
      });
      laneSetXml += `      <bpmn:lane id="Lane_${li + 1}" name="${esc(laneName)}">\n` +
                    (refs.length ? refs.join('\n') + '\n' : '') +
                    `      </bpmn:lane>\n`;
    });
    laneSetXml += '    </bpmn:laneSet>\n';
    processBody = laneSetXml + processBody;   // el laneSet va antes de los flowElements (esquema BPMN)
  }

  // ============ BPMN DI (visual interchange) ============
  let diShapes = '';
  if (laneList.length > 0) {
    const allMaxX = Math.max(...nodes.map((n) => n.x + n.w), 0);
    laneList.forEach((laneName, li) => {
      const ms = nodes.filter((n) => (laneOf[n.id] || '') === laneName);
      if (!ms.length) return;
      const y0 = Math.min(...ms.map((n) => n.y)) - 18;
      const y1 = Math.max(...ms.map((n) => n.y + n.h)) + 18;
      diShapes += `      <bpmndi:BPMNShape id="Lane_${li + 1}_di" bpmnElement="Lane_${li + 1}" isHorizontal="true">\n` +
                  `        <dc:Bounds x="0" y="${Math.round(y0)}" width="${Math.round(allMaxX + 40)}" height="${Math.round(y1 - y0)}" />\n` +
                  `      </bpmndi:BPMNShape>\n`;
    });
  }
  nodes.forEach((n) => {
    diShapes += `      <bpmndi:BPMNShape id="${n.id}_di" bpmnElement="${n.id}">\n` +
                `        <dc:Bounds x="${Math.round(n.x)}" y="${Math.round(n.y)}" width="${Math.round(n.w)}" height="${Math.round(n.h)}" />\n` +
                `      </bpmndi:BPMNShape>\n`;
    // El evento de borde va sobre la esquina inferior izquierda de la tarea (como en el lienzo)
    if (n.boundary) {
      diShapes += `      <bpmndi:BPMNShape id="${n.id}_be_di" bpmnElement="${n.id}_be">\n` +
                  `        <dc:Bounds x="${Math.round(n.x - 2)}" y="${Math.round(n.y + n.h - 18)}" width="22" height="22" />\n` +
                  `      </bpmndi:BPMNShape>\n`;
    }
  });
  let diEdges = '';
  edges.forEach((e) => {
    const a = nodoPorId(e.from), b = nodoPorId(e.to);
    if (!a || !b) return;
    const p1 = centroNodo(a), p2 = centroNodo(b);
    diEdges += `      <bpmndi:BPMNEdge id="${e.id}_di" bpmnElement="${e.id}">\n` +
               `        <di:waypoint x="${Math.round(p1.x)}" y="${Math.round(p1.y)}" />\n` +
               `        <di:waypoint x="${Math.round(p2.x)}" y="${Math.round(p2.y)}" />\n` +
               `      </bpmndi:BPMNEdge>\n`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  id="Definitions_${procId}" targetNamespace="http://processiq.minsait/bpmn"
  exporter="ProcessIQ" exporterVersion="0.3">
  <bpmn:process id="${procId}" name="${esc(meta.name || 'Proceso ProcessIQ')}" isExecutable="false">
    <bpmn:documentation>Industria: ${esc(meta.industry)} | Macroproceso: ${esc(meta.macroprocess)}</bpmn:documentation>
${processBody}  </bpmn:process>
  <bpmndi:BPMNDiagram id="Diagram_${procId}">
    <bpmndi:BPMNPlane id="${planeId}" bpmnElement="${procId}">
${diShapes}${diEdges}    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;
}
