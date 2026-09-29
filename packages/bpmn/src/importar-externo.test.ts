// Lectura de BPMN de otras herramientas, con fixtures inventados que imitan la
// forma de Bizagi, Signavio y Camunda (sin datos de clientes).
import { describe, expect, it } from 'vitest';
import { DOMParser } from '@xmldom/xmldom';
import { EXECUTION_TYPES, FORMAS_POR_DEFECTO, type Nodo } from '@processiq/dominio';
import { EJECUCION_DE_TAREA, generarBpmnXml, leerBpmn, type LectorXml, type ResultadoLectura } from './index.js';
import bizagi from './__fixtures__/bizagi-reclamos.bpmn?raw';
import signavio from './__fixtures__/signavio-compras.bpmn?raw';
import camunda from './__fixtures__/camunda-alta-cliente.bpmn?raw';

const leerXml: LectorXml = (xml) => new DOMParser({ onError: () => {} }).parseFromString(xml, 'application/xml') as never;
const leer = (xml: string, siguienteId = 1) => leerBpmn(xml, { siguienteId, formas: FORMAS_POR_DEFECTO, leerXml });

/** Nodo por etiqueta (falla si no está o está repetida). */
function nodo(r: ResultadoLectura, label: string): Nodo {
  const ns = r.nodos.filter((n) => n.label === label);
  expect(ns, `nodo «${label}»`).toHaveLength(1);
  return ns[0]!;
}
/** Aristas como «origen -> destino [etiqueta]». */
function flujos(r: ResultadoLectura): string[] {
  const lbl = Object.fromEntries(r.nodos.map((n) => [n.id, n.label]));
  return r.aristas.map((a) => `${lbl[a.from]} -> ${lbl[a.to]}` + (a.label ? ` [${a.label}]` : ''));
}
const sinDiagrama = (xml: string) => xml.replace(/<([\w]+:)?BPMNDiagram[\s\S]*?<\/([\w]+:)?BPMNDiagram>/g, '');

describe('BPMN con forma de Bizagi (sin prefijos, carriles, subproceso desplegado)', () => {
  const r = leer(bizagi);

  it('lee el proceso con la lectura completa', () => {
    expect(r.origen).toBe('externo');
    expect(r.nombreProceso).toBe('Atención de reclamos');
    expect(r.conteo).toEqual({ count: 15, tasks: 9, gateways: 2, events: 4, flows: 16 });
    expect(r.subprocesos).toBe(1);
    expect(r.carriles).toEqual(['Cliente', 'Mesa de ayuda', 'Analista de reclamos', 'Supervisor']);
  });

  it('cada elemento toma el carril que lo referencia; el contenido del subproceso, el de su posición', () => {
    expect(nodo(r, 'Reclamo recibido').owner).toBe('Cliente');
    expect(nodo(r, 'Registrar reclamo').owner).toBe('Mesa de ayuda');
    expect(nodo(r, 'Evaluar reclamo').owner).toBe('Analista de reclamos');
    expect(nodo(r, 'Consultar historial del cliente').owner).toBe('Analista de reclamos');
    expect(nodo(r, 'Escalar al supervisor').owner).toBe('Supervisor');
  });

  it('el subproceso queda con su marcador y su contenido, con nivel y padre para plegarlo', () => {
    const sub = nodo(r, 'Evaluar reclamo');
    expect(sub.marker).toBe('subprocess');
    expect(sub.nivel).toBe(1);
    for (const l of ['Revisar antecedentes', 'Consultar historial del cliente', '¿Procede?', 'Calcular compensación', 'Redactar rechazo']) {
      expect(nodo(r, l)).toMatchObject({ nivel: 3, padre: sub.id });
    }
    expect(r.nodos.filter((n) => n.nivel === 1)).toHaveLength(10);
  });

  it('el contenido entra en el flujo: sin los inicios y fines internos ni la convergencia', () => {
    expect(flujos(r)).toEqual([
      'Reclamo recibido -> Registrar reclamo',
      'Registrar reclamo -> ¿Reclamo completo?',
      '¿Reclamo completo? -> Solicitar información faltante [No]',
      '¿Reclamo completo? -> Evaluar reclamo [Sí]',
      'Solicitar información faltante -> Información recibida',
      // La caja del subproceso empieza antes (x) que «Información recibida»: su contenido va detrás de ella
      'Evaluar reclamo -> Revisar antecedentes',
      'Evaluar reclamo -> Escalar al supervisor [5 días hábiles]',
      'Revisar antecedentes -> Consultar historial del cliente',
      'Consultar historial del cliente -> ¿Procede?',
      '¿Procede? -> Calcular compensación [Sí]',
      '¿Procede? -> Redactar rechazo [No]',
      'Calcular compensación -> Notificar resultado al cliente',
      'Redactar rechazo -> Notificar resultado al cliente',
      'Información recibida -> Registrar reclamo',
      'Escalar al supervisor -> Reclamo escalado',
      'Notificar resultado al cliente -> Reclamo atendido'
    ]);
  });

  it('tipos de tarea y de evento, evento de borde, datos, documentación y anotaciones', () => {
    expect(nodo(r, 'Reclamo recibido').eventType).toBe('message');
    expect(nodo(r, 'Información recibida')).toMatchObject({ type: 'intermediate', eventType: 'message' });
    expect(nodo(r, 'Registrar reclamo').executionType).toBe('system');
    expect(nodo(r, 'Solicitar información faltante').executionType).toBe('send');
    expect(nodo(r, 'Revisar antecedentes').executionType).toBe('manual');
    expect(nodo(r, 'Consultar historial del cliente')).toMatchObject({ executionType: 'automatic', system: 'CRM' });
    expect(nodo(r, 'Calcular compensación').executionType).toBe('ai');
    expect(nodo(r, 'Evaluar reclamo').boundary).toEqual({ type: 'timer', interrupting: false });
    const registrar = nodo(r, 'Registrar reclamo');
    expect(registrar.docsOut).toBe('Ficha del reclamo');
    expect(registrar.notes).toBe('El operador completa la ficha con los datos del cliente.\nRegistrar en menos de 2 horas');
  });

  it('avisa de lo que no representa', () => {
    expect(r.avisos).toEqual([
      'Se ignoraron elementos que el editor no representa: group (1).',
      '1 compuerta exclusiva de convergencia se dibuja como convergencia implícita: el editor no admite una compuerta exclusiva con una sola salida.',
      'Los objetos y almacenes de datos pasan a los documentos de entrada y salida y al sistema de cada actividad.'
    ]);
  });
});

describe('BPMN con forma de Signavio (prefijo semantic:, carriles anidados, subproceso plegado)', () => {
  const r = leer(signavio);

  it('lee el proceso del pool con contenido e ignora el pool de caja negra', () => {
    expect(r.nombreProceso).toBe('Compras de bienes');
    expect(r.conteo).toEqual({ count: 19, tasks: 11, gateways: 3, events: 5, flows: 19 });
    expect(r.subprocesos).toBe(2);
    expect(r.avisos).toEqual(['Los objetos y almacenes de datos pasan a los documentos de entrada y salida y al sistema de cada actividad.']);
  });

  it('en carriles anidados gana el más específico', () => {
    expect(r.carriles).toEqual(['Comprador', 'Jefe de compras', 'Almacén', 'Finanzas']);
    expect(nodo(r, 'Aprobar solicitud').owner).toBe('Jefe de compras');
    expect(nodo(r, 'Elaborar solicitud de compra').owner).toBe('Comprador');
  });

  it('el contenido dibujado en otro plano hereda el carril de su subproceso, también anidado', () => {
    const emitir = nodo(r, 'Emitir orden de compra'), registrar = nodo(r, 'Registrar orden en el ERP');
    expect(emitir).toMatchObject({ marker: 'subprocess', nivel: 1, owner: 'Comprador' });
    expect(registrar).toMatchObject({ marker: 'subprocess', nivel: 3, padre: emitir.id, owner: 'Comprador' });
    expect(nodo(r, 'Seleccionar proveedor')).toMatchObject({ nivel: 3, padre: emitir.id });
    expect(nodo(r, 'Generar orden')).toMatchObject({ nivel: 3, padre: registrar.id, owner: 'Comprador', docsOut: 'Orden de compra' });
    expect(nodo(r, 'Enviar orden al proveedor')).toMatchObject({ padre: registrar.id, executionType: 'send' });
  });

  it('subprocesos anidados: el de fuera enlaza con el de dentro y lo último de dentro sale del de fuera', () => {
    const f = flujos(r);
    expect(f).toContain('¿Aprobada? -> Emitir orden de compra [Sí]');
    expect(f).toContain('Emitir orden de compra -> Seleccionar proveedor');
    expect(f).toContain('Seleccionar proveedor -> Registrar orden en el ERP');
    expect(f).toContain('Registrar orden en el ERP -> Generar orden');
    expect(f.filter((x) => x.startsWith('Emitir orden de compra ->'))).toHaveLength(1);
    // El fin sin nombre de «Emitir…» se quita; el fin con nombre de «Registrar…» queda como hito y el flujo sigue
    expect(f).toContain('Enviar orden al proveedor -> Orden registrada');
    expect(f).toContain('Orden registrada -> ¿Decisión?');
    expect(nodo(r, 'Orden registrada')).toMatchObject({ type: 'intermediate', throw: true, nivel: 3, padre: nodo(r, 'Registrar orden en el ERP').id });
    expect(r.nodos.filter((n) => n.type === 'end').map((n) => n.label)).toEqual(['Solicitud rechazada', 'Compra cerrada']);
  });

  it('tipos, marcadores y eventos', () => {
    expect(nodo(r, 'Cotizar con proveedores')).toMatchObject({ marker: 'multiinstance', notes: 'Mínimo tres cotizaciones' });
    expect(nodo(r, 'Recibir mercadería').executionType).toBe('email');
    expect(nodo(r, 'Validar factura contra orden').executionType).toBe('automatic');
    expect(nodo(r, 'Plazo de pago')).toMatchObject({ type: 'intermediate', eventType: 'timer' });
    expect(nodo(r, 'Compra cerrada').terminate).toBe(true);
    expect(r.nodos.filter((n) => n.gatewayType === 'parallel')).toHaveLength(2);
  });
});

describe('BPMN con forma de Camunda (prefijo bpmn:, pool sin carriles)', () => {
  const r = leer(camunda);

  it('sin carriles, todo va al carril del pool', () => {
    expect(r.nombreProceso).toBe('Alta de cliente');
    expect(r.carriles).toEqual(['Entidad financiera']);
    expect(r.nodos.every((n) => n.owner === 'Entidad financiera')).toBe(true);
    expect(r.conteo).toEqual({ count: 24, tasks: 11, gateways: 2, events: 11, flows: 23 });
  });

  it('compuerta basada en eventos: exclusiva, con el nombre de cada evento en su rama', () => {
    expect(nodo(r, '¿Qué llega primero?').gatewayType).toBe('exclusive');
    const f = flujos(r);
    expect(f).toContain('¿Qué llega primero? -> Contrato firmado [Contrato firmado]');
    expect(f).toContain('¿Qué llega primero? -> Pasan 5 días [Pasan 5 días]');
  });

  it('evento de borde de error, convergencia implícita, enlaces y escalamiento', () => {
    expect(nodo(r, 'Crear cuenta en el core')).toMatchObject({ boundary: { type: 'error', interrupting: true }, system: 'Core bancario' });
    const f = flujos(r);
    expect(f).toContain('Crear cuenta en el core -> Crear cuenta manualmente [Error de integración]');
    expect(f).toContain('Crear cuenta en el core -> Calcular límite de crédito');
    expect(f).toContain('Crear cuenta manualmente -> Calcular límite de crédito');
    expect(f).toContain('Ir a cierre -> Cierre');
    expect(nodo(r, 'Avisar a riesgos')).toMatchObject({ type: 'intermediate', throw: true, notes: 'Evento BPMN de escalamiento.' });
    expect(r.avisos).toContain('Los eventos de escalamiento se importan como eventos simples; el tipo queda en sus notas.');
  });

  it('subproceso de evento: su disparador queda como evento intermedio y su fin sigue siendo fin', () => {
    const sub = nodo(r, 'Cancelación por el cliente');
    expect(sub.marker).toBe('subprocess');
    expect(r.aristas.some((a) => a.to === sub.id)).toBe(false);
    expect(nodo(r, 'Cliente cancela')).toMatchObject({ type: 'intermediate', eventType: 'message', padre: sub.id });
    expect(nodo(r, 'Solicitud anulada')).toMatchObject({ type: 'end', padre: sub.id });
    expect(flujos(r)).toContain('Cancelación por el cliente -> Cliente cancela');
  });

  it('tipos de tarea según el catálogo del editor', () => {
    expect(nodo(r, 'Revisar solicitud').executionType).toBe('system');
    expect(nodo(r, 'Evaluar riesgo').executionType).toBe('automatic');
    expect(nodo(r, 'Calcular límite de crédito').executionType).toBe('ai');
    expect(nodo(r, 'Esperar validación biométrica').executionType).toBe('email');
    expect(nodo(r, 'Solicitud rechazada')).toMatchObject({ type: 'end', eventType: 'message' });
    expect(nodo(r, 'Cliente dado de alta').terminate).toBe(true);
  });
});

describe('robustez', () => {
  it('cualquier prefijo de namespace (bpmn:, bpmn2:, sin prefijo) da el mismo resultado', () => {
    const base = leer(camunda);
    const bpmn2 = camunda.replace(/xmlns:bpmn="/, 'xmlns:bpmn2="').replace(/<(\/?)bpmn:/g, '<$1bpmn2:').replace(/"bpmn:tFormalExpression"/g, '"bpmn2:tFormalExpression"');
    const sinPrefijo = camunda.replace(/xmlns:bpmn="/, 'xmlns="').replace(/<(\/?)bpmn:/g, '<$1');
    expect(bpmn2).toContain('<bpmn2:process');
    expect(sinPrefijo).toContain('<process');
    for (const variante of [bpmn2, sinPrefijo]) {
      const r = leer(variante);
      expect(r.nodos).toEqual(base.nodos);
      expect(r.aristas).toEqual(base.aristas);
    }
  });

  it('elementos desconocidos se ignoran con un aviso, sin fallar', () => {
    const xml = `<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:x="urn:otra"><process id="p">
      <startEvent id="a"/><x:cosaRara id="r"/><choreographyTask id="c"/><x:cosaRara id="r2"/><task id="t" name="Revisar"/>
      <sequenceFlow id="f1" sourceRef="a" targetRef="t"/><sequenceFlow id="f2" sourceRef="t" targetRef="r"/></process></definitions>`;
    const r = leer(xml);
    expect(r.conteo).toMatchObject({ count: 2, flows: 1 });
    expect(r.avisos).toEqual(['Se ignoraron elementos que el editor no representa: cosaRara (2), choreographyTask (1).']);
    // Nombres que existen en Object.prototype no se confunden con tareas ni con definiciones de evento
    const raro = `<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"><process id="p">
      <startEvent id="a"><constructor/><toString/></startEvent><constructor id="c"/><toString id="t"/></process></definitions>`;
    const r2 = leer(raro);
    expect(r2.nodos.map((n) => `${n.type}:${n.eventType ?? ''}:${n.notes}`)).toEqual(['start::']);
    expect(r2.avisos).toEqual(['Se ignoraron elementos que el editor no representa: constructor (1), toString (1).']);
  });

  it('un XML que no es BPMN da un mensaje claro', () => {
    expect(() => leer('<raiz><dato/></raiz>')).toThrow('El archivo es XML, pero no es un diagrama BPMN 2.0: su elemento principal es <raiz> y debería ser <definitions>.');
    expect(() => leer('<Package xmlns="http://www.wfmc.org/2008/XPDL2.1"/>')).toThrow(/XPDL/);
    expect(() => leer('<definitions><process id="p"><task id="t"></process>')).toThrow('El archivo no es un XML válido');
    expect(() => leer('texto suelto')).toThrow('El archivo no es un XML válido');
    expect(() => leer('<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"><process id="p"/></definitions>'))
      .toThrow('El BPMN no tiene actividades, eventos ni compuertas que importar.');
  });

  it('sin diagrama (bpmndi) se leen los mismos elementos y carriles', () => {
    const con = leer(bizagi), sin = leer(sinDiagrama(bizagi));
    expect(sinDiagrama(bizagi)).not.toContain('BPMNShape');
    const resumen = (r: ResultadoLectura) => r.nodos.map((n) => `${n.label}|${n.owner}|${n.nivel}`).sort();
    expect(resumen(sin)).toEqual(resumen(con));
    expect(sin.conteo).toEqual(con.conteo);
  });

  it('con bpmndi, los carriles sin flowNodeRef salen de la posición, y el orden, del dibujo', () => {
    const xml = `<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:di="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC">
      <process id="p"><laneSet><lane id="l1" name="Ventas"/><lane id="l2" name="Cobranza"/></laneSet>
        <task id="t2" name="Cobrar"/><task id="t1" name="Vender"/><startEvent id="s"/>
        <sequenceFlow id="f1" sourceRef="s" targetRef="t1"/><sequenceFlow id="f2" sourceRef="t1" targetRef="t2"/></process>
      <di:BPMNDiagram><di:BPMNPlane bpmnElement="p">
        <di:BPMNShape bpmnElement="l1"><dc:Bounds x="0" y="0" width="600" height="100"/></di:BPMNShape>
        <di:BPMNShape bpmnElement="l2"><dc:Bounds x="0" y="100" width="600" height="100"/></di:BPMNShape>
        <di:BPMNShape bpmnElement="s"><dc:Bounds x="20" y="30" width="30" height="30"/></di:BPMNShape>
        <di:BPMNShape bpmnElement="t1"><dc:Bounds x="100" y="20" width="100" height="60"/></di:BPMNShape>
        <di:BPMNShape bpmnElement="t2"><dc:Bounds x="250" y="120" width="100" height="60"/></di:BPMNShape>
      </di:BPMNPlane></di:BPMNDiagram></definitions>`;
    const r = leer(xml);
    expect(r.nodos.map((n) => `${n.id} ${n.label} ${n.owner}`)).toEqual(['n1 Inicio Ventas', 'n2 Vender Ventas', 'n3 Cobrar Cobranza']);
    // Sin bpmndi: el orden del archivo, y sin carriles que asignar
    expect(leer(sinDiagrama(xml)).nodos.map((n) => `${n.label}:${n.owner}`)).toEqual(['Cobrar:', 'Vender:', 'Inicio:']);
  });

  it('archivos grandes: 3 000 actividades en 6 carriles', () => {
    const N = 3000, carriles = 6;
    const partes: string[] = [];
    const lanes = Array.from({ length: carriles }, (_, c) => `<lane id="l${c}" name="Rol ${c}">` +
      Array.from({ length: N }, (_, i) => i).filter((i) => i % carriles === c).map((i) => `<flowNodeRef>t${i}</flowNodeRef>`).join('') + '</lane>');
    partes.push(`<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"><process id="p" name="Grande"><laneSet>${lanes.join('')}</laneSet><startEvent id="s"/>`);
    for (let i = 0; i < N; i++) partes.push(`<userTask id="t${i}" name="Revisar paso ${i}"/>`);
    partes.push('<endEvent id="e"/><sequenceFlow id="fs" sourceRef="s" targetRef="t0"/>');
    for (let i = 1; i < N; i++) partes.push(`<sequenceFlow id="f${i}" sourceRef="t${i - 1}" targetRef="t${i}"/>`);
    partes.push(`<sequenceFlow id="fe" sourceRef="t${N - 1}" targetRef="e"/></process></definitions>`);
    const t0 = Date.now();
    const r = leer(partes.join(''));
    const ms = Date.now() - t0;
    expect(r.conteo).toEqual({ count: N + 2, tasks: N, gateways: 0, events: 2, flows: N + 1 });
    // El inicio y el fin no están en ningún carril: el editor les infiere el de su vecino
    expect(r.carriles).toHaveLength(carriles);
    expect(ms).toBeLessThan(10_000);
  });

  it('los ids se numeran desde siguienteId: nodos, después aristas y después pains', () => {
    const r = leer(bizagi, 40);
    expect(r.nodos[0]!.id).toBe('n40');
    expect(r.aristas[0]!.id).toBe('e55');
    expect(r.siguienteId).toBe(71);
  });
});

describe('tipos de tarea', () => {
  it('coinciden con la tarea BPMN que declara el catálogo del editor', () => {
    const bpmnDe: Record<string, string> = {
      manualTask: 'Manual Task', userTask: 'User Task', serviceTask: 'Service Task',
      scriptTask: 'Script Task', receiveTask: 'Receive Task', sendTask: 'Send Task'
    };
    for (const [tag, etiqueta] of Object.entries(bpmnDe)) {
      const tipo = EXECUTION_TYPES.find((t) => t.id === EJECUCION_DE_TAREA[tag]);
      expect(tipo?.bpmn, tag).toBe(etiqueta);
    }
  });
});

describe('BPMN exportado por ProcessIQ', () => {
  const nodes: Nodo[] = [
    { id: 'n1', type: 'start', x: 0, y: 50, w: 54, h: 54, label: 'Inicio', owner: 'Rol A' },
    { id: 'n2', type: 'task', x: 100, y: 50, w: 158, h: 76, label: 'Registrar', owner: 'Rol A', executionType: 'manual', system: 'CRM', time: '10', volume: '500',
      pains: [{ id: 'p9', category: 'rework', description: 'Reproceso | doble', severity: 4, frequency: 3 }], boundary: { type: 'timer', interrupting: false } },
    { id: 'n3', type: 'task', x: 300, y: 250, w: 158, h: 76, label: 'Aprobar', owner: 'Rol B', executionType: 'manual', marker: 'loop' },
    { id: 'n4', type: 'end', x: 500, y: 250, w: 54, h: 54, label: 'Fin', owner: 'Rol B', terminate: true }
  ];
  const proceso = {
    meta: { name: 'Proceso', industry: '', macroprocess: '' }, nodes,
    edges: [{ id: 'e5', from: 'n1', to: 'n2', label: '' }, { id: 'e6', from: 'n2', to: 'n3', label: '' }, { id: 'e7', from: 'n3', to: 'n4', label: '' }],
    lanes: { list: ['Rol A', 'Rol B'], laneOf: { n1: 'Rol A', n2: 'Rol A', n3: 'Rol B', n4: 'Rol B' } }
  };
  const xml = generarBpmnXml(proceso, 'Process_1');

  it('se lee como en el MVP: plano, sin carriles ni avisos', () => {
    const r = leer(xml);
    expect(r).toMatchObject({ origen: 'processiq', carriles: [], subprocesos: 0, avisos: [] });
    expect(r.nodos.every((n) => n.owner === '')).toBe(true);
    // El evento de borde llega como evento intermedio suelto, como en el MVP
    expect(r.conteo).toEqual({ count: 5, tasks: 2, gateways: 0, events: 3, flows: 3 });
  });

  it('si pasó por otra herramienta, recupera carriles, metadatos, pains, borde y marcadores', () => {
    const r = leer(xml.replace('exporter="ProcessIQ"', 'exporter="Camunda Modeler"'));
    expect(r.origen).toBe('externo');
    expect(r.carriles).toEqual(['Rol A', 'Rol B']);
    expect(nodo(r, 'Registrar')).toMatchObject({
      owner: 'Rol A', system: 'CRM', time: '10', volume: '500', notes: '',
      boundary: { type: 'timer', interrupting: false },
      pains: [{ id: 'p' + (r.siguienteId - 1), category: 'rework', description: 'Reproceso | doble', severity: 4, frequency: 3 }]
    });
    expect(nodo(r, 'Aprobar')).toMatchObject({ owner: 'Rol B', marker: 'loop' });
    expect(nodo(r, 'Fin').terminate).toBe(true);
    expect(r.conteo).toEqual({ count: 4, tasks: 2, gateways: 0, events: 2, flows: 3 });
  });

  it('los pains leídos de la documentación quedan dentro de la escala 1 a 5 del esquema', () => {
    const otra = xml.replace('exporter="ProcessIQ"', 'exporter="Otra"').replace('[rework|sev4|frec3]', '[rework|sev9|frec0]');
    expect(nodo(leer(otra), 'Registrar').pains).toMatchObject([{ severity: 5, frequency: 1 }]);
  });
});
