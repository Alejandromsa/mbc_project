// Lectura completa de un BPMN 2.0 de otra herramienta (Bizagi, Signavio, Camunda,
// bpmn.io…). Conserva lo que la lectura del MVP pierde:
// - carriles (`laneSet`/`lane`/`flowNodeRef`, también anidados) y pools
//   (`participant`) como `owner`, que es como el editor asigna carriles;
// - subprocesos con contenido: su contenido entra en el flujo y se pliega con los
//   niveles de detalle (`nivel`/`padre`), sin perder ningún elemento;
// - tipos de tarea, definiciones de evento, compuertas, marcadores de bucle,
//   eventos de borde, datos, documentación y anotaciones;
// - posiciones (`bpmndi`): solo para el orden de lectura y como respaldo del carril.
// Las coordenadas las sigue poniendo el auto-layout por carriles de la app.
import type { FormaPorDefecto, Nodo, Pain, TipoNodo } from '@processiq/dominio';
import type { ConteoLectura, OpcionesLectura, ResultadoLectura } from './importar.js';
import { hijos, normalizar, refLocal, type DocumentoXml, type ElementoXml } from './xml.js';

/**
 * Tarea BPMN -> tipo de ejecución del editor. Sale del campo `bpmn` del catálogo
 * EXECUTION_TYPES (User Task = system, Service Task = automatic, Script Task = ai,
 * Receive Task = email, Send Task = send, Manual Task = manual). Business Rule
 * Task no está en el catálogo: la evalúa un motor de reglas, así que es automática.
 */
export const EJECUCION_DE_TAREA: Readonly<Record<string, string>> = {
  task: 'manual', manualTask: 'manual', userTask: 'system', serviceTask: 'automatic',
  scriptTask: 'ai', receiveTask: 'email', sendTask: 'send', businessRuleTask: 'automatic'
};
const SUBPROCESOS = new Set(['subProcess', 'adHocSubProcess', 'transaction']);
const COMPUERTAS: Readonly<Record<string, 'exclusive' | 'parallel' | 'inclusive'>> = {
  exclusiveGateway: 'exclusive', parallelGateway: 'parallel', inclusiveGateway: 'inclusive',
  // El dominio solo tiene tres tipos: como en el MVP, la compleja se lee inclusiva y la
  // basada en eventos, exclusiva (elige un solo camino)
  complexGateway: 'inclusive', eventBasedGateway: 'exclusive'
};
const EVENTOS = new Set(['startEvent', 'endEvent', 'intermediateCatchEvent', 'intermediateThrowEvent', 'boundaryEvent']);
const DEFINICIONES: Readonly<Record<string, string>> = {
  messageEventDefinition: 'message', timerEventDefinition: 'timer', errorEventDefinition: 'error',
  signalEventDefinition: 'signal', terminateEventDefinition: 'terminate', escalationEventDefinition: 'escalation',
  conditionalEventDefinition: 'conditional', compensateEventDefinition: 'compensate',
  cancelEventDefinition: 'cancel', linkEventDefinition: 'link'
};
const EVENTO_DEL_DOMINIO = new Set(['message', 'timer', 'error', 'signal']);
const NOMBRE_DEFINICION: Readonly<Record<string, string>> = {
  escalation: 'escalamiento', conditional: 'condicional', compensate: 'compensación',
  cancel: 'cancelación', multiple: 'múltiple'
};
/** Hijos de un proceso o subproceso que se leen aparte o que no hace falta leer. */
const SILENCIO = new Set([
  'documentation', 'extensionElements', 'laneSet', 'ioSpecification', 'property', 'dataObject',
  'dataObjectReference', 'dataStoreReference', 'dataInput', 'dataOutput', 'inputSet', 'outputSet',
  'auditing', 'monitoring', 'resourceRole', 'performer', 'humanPerformer', 'potentialOwner',
  'correlationSubscription', 'supports', 'incoming', 'outgoing', 'standardLoopCharacteristics',
  'multiInstanceLoopCharacteristics', 'completionCondition', 'textAnnotation', 'association'
]);

/**
 * Con posiciones, los nodos de cada contenedor se numeran de izquierda a derecha
 * (y de arriba abajo) como en el dibujo original, y no en el orden del archivo.
 * Medido con `ProcessIQ.quality()`: ver docs/tecnica/paquetes.md §5.3.
 */
const ORDENAR_POR_POSICION = true;

// Object.hasOwn y no `in`: un elemento llamado «constructor» o «toString» no es una tarea
const de = (o: object, k: string) => Object.hasOwn(o, k);
const esNodo = (tag: string) =>
  de(EJECUCION_DE_TAREA, tag) || tag === 'callActivity' || SUBPROCESOS.has(tag) || de(COMPUERTAS, tag) || EVENTOS.has(tag);

// Metadatos que escribe el export de ProcessIQ en <documentation>: si el archivo pasó
// por otra herramienta, se recuperan en vez de quedar como notas.
const RE_METADATOS = /^Owner: (.*) \| System: (.*) \| Time\(min\): (.*) \| Volume: (.*)$/;
const RE_PAIN = /^\[([^|\]]*)\|sev(\d+)\|frec(\d+)\] (.*)$/;

interface Caja { x: number; y: number; w: number; h: number; plano: number }

type Tipo = Extract<TipoNodo, 'start' | 'end' | 'intermediate' | 'task' | 'decision'>;

interface Elemento {
  id: string;
  tag: string;
  tipo: Tipo;
  nombre: string;
  proceso: string;
  /** Subproceso con contenido que lo contiene (null = nivel superior del proceso). */
  contenedor: string | null;
  profundidad: number;
  /** Solo en subprocesos con contenido. */
  hijos: string[];
  expandido: boolean;
  exec?: string;
  gatewayType?: 'exclusive' | 'parallel' | 'inclusive';
  /** Definición de evento tal como viene, también las que el dominio no tiene. */
  definicion?: string;
  eventType?: 'message' | 'timer' | 'error' | 'signal';
  throw?: boolean;
  terminate?: boolean;
  marker?: string;
  boundary?: { type: 'timer' | 'error' | 'message'; interrupting: boolean };
  enlace?: string;
  adjuntoA?: string;
  cancela?: boolean;
  owner: string;
  metadatos?: { owner: string; system: string; time: string; volume: string };
  pains: Omit<Pain, 'id'>[];
  notas: string[];
  refsEntrada: string[];
  refsSalida: string[];
  docsIn: string[];
  docsOut: string[];
  sistemas: string[];
  quitado: boolean;
}

interface Flujo { desde: string; hacia: string; nombre: string; sintetico: boolean; quitado: boolean }

const plural = (n: number, uno: string, varios: string) => n + ' ' + (n === 1 ? uno : varios);
const sinGuion = (s: string) => (s.trim() === '-' ? '' : s.trim());

export function leerBpmnExterno(doc: DocumentoXml, opciones: OpcionesLectura): ResultadoLectura {
  const formas: Readonly<Record<string, FormaPorDefecto>> = opciones.formas;

  // ---- Índices del documento (una sola pasada) ----
  const todos = Array.from(doc.getElementsByTagName('*'));
  const porId = new Map<string, ElementoXml>();
  const porTag = new Map<string, ElementoXml[]>();
  for (const el of todos) {
    const id = el.getAttribute('id');
    if (id && !porId.has(id)) porId.set(id, el);
    const t = el.localName || '';
    const l = porTag.get(t);
    if (l) l.push(el); else porTag.set(t, [el]);
  }
  const deTag = (t: string) => porTag.get(t) ?? [];

  // ---- Diagrama (bpmndi): cajas por elemento y plano ----
  const cajas = new Map<string, Caja>();
  deTag('BPMNPlane').forEach((plano, i) => {
    for (const s of hijos(plano)) {
      if (s.localName !== 'BPMNShape') continue;
      const b = hijos(s).find((h) => h.localName === 'Bounds');
      if (!b) continue;
      const [x, y, w, h] = ['x', 'y', 'width', 'height'].map((a) => parseFloat(b.getAttribute(a) || ''));
      const id = refLocal(s.getAttribute('bpmnElement'));
      if (id && !cajas.has(id) && [x, y, w, h].every((v) => Number.isFinite(v))) cajas.set(id, { x: x!, y: y!, w: w!, h: h!, plano: i });
    }
  });
  const centro = (c: Caja) => ({ x: c.x + c.w / 2, y: c.y + c.h / 2 });

  // ---- Pools: nombre del participante de cada proceso ----
  const poolDe = new Map<string, string>();
  const yPool = new Map<string, number>();
  for (const p of deTag('participant')) {
    const proc = refLocal(p.getAttribute('processRef'));
    if (!proc || poolDe.has(proc)) continue;
    poolDe.set(proc, normalizar(p.getAttribute('name')));
    const c = cajas.get(p.getAttribute('id') || '');
    if (c) yPool.set(proc, c.y);
  }

  // ---- Recorrido de procesos y subprocesos ----
  const E = new Map<string, Elemento>();
  const creados: Elemento[] = [];
  const raices = new Map<string, string[]>();
  const flujos: Flujo[] = [];
  const salen = new Map<string, Set<Flujo>>(), entran = new Map<string, Set<Flujo>>();
  const poner = (m: Map<string, Set<Flujo>>, k: string, f: Flujo) => { const s = m.get(k); if (s) s.add(f); else m.set(k, new Set([f])); };
  const alta = (desde: string, hacia: string, nombre: string, sintetico: boolean) => {
    const f: Flujo = { desde, hacia, nombre, sintetico, quitado: false };
    flujos.push(f); poner(salen, desde, f); poner(entran, hacia, f);
  };
  const baja = (f: Flujo) => { f.quitado = true; salen.get(f.desde)?.delete(f); entran.get(f.hacia)?.delete(f); };
  const moverDesde = (f: Flujo, id: string) => { salen.get(f.desde)?.delete(f); f.desde = id; f.sintetico = true; poner(salen, id, f); };
  const moverHacia = (f: Flujo, id: string) => { entran.get(f.hacia)?.delete(f); f.hacia = id; f.sintetico = true; poner(entran, id, f); };
  const salientes = (id: string) => [...(salen.get(id) ?? [])];
  const entrantes = (id: string) => [...(entran.get(id) ?? [])];

  const carrilDe = new Map<string, string>();
  const cajasCarril: { nombre: string; caja: Caja }[] = [];
  const conCarriles = new Set<string>();
  const leerCarriles = (laneSet: ElementoXml, heredado: string, proceso: string) => {
    for (const lane of hijos(laneSet)) {
      if (lane.localName !== 'lane') continue;
      conCarriles.add(proceso);
      const nombre = normalizar(lane.getAttribute('name')) || heredado;
      const caja = cajas.get(lane.getAttribute('id') || '');
      if (caja && nombre) cajasCarril.push({ nombre, caja });
      for (const h of hijos(lane)) {
        if (h.localName === 'flowNodeRef') { const id = refLocal(h.textContent); if (id && nombre) carrilDe.set(id, nombre); }
      }
      // Carriles anidados: después del padre, así gana el más específico
      for (const h of hijos(lane)) if (h.localName === 'childLaneSet') leerCarriles(h, nombre, proceso);
    }
  };

  const desconocidos = new Map<string, number>();
  const anotaciones = new Map<string, string>();
  const asociaciones: [string, string][] = [];
  let llamadas = 0;
  const sinEquivalente = new Set<string>();

  const leerDetalles = (el: ElementoXml, e: Elemento) => {
    const defs: string[] = [];
    for (const h of hijos(el)) {
      const t = h.localName || '';
      if (t === 'documentation') {
        const texto = normalizar(h.textContent);
        const m = RE_METADATOS.exec(texto);
        if (m) {
          e.metadatos = { owner: sinGuion(m[1]!), system: sinGuion(m[2]!), time: sinGuion(m[3]!), volume: sinGuion(m[4]!) };
        } else if (texto.startsWith('Pains: ') && texto.slice(7).split(' || ').every((p) => RE_PAIN.test(p))) {
          // El esquema v1 exige severidad y frecuencia de 1 a 5
          const escala = (v: string) => Math.min(5, Math.max(1, Number(v)));
          for (const p of texto.slice(7).split(' || ')) {
            const r = RE_PAIN.exec(p)!;
            e.pains.push({ category: r[1]!, description: r[4]!, severity: escala(r[2]!), frequency: escala(r[3]!) });
          }
        } else if (texto) e.notas.push(texto);
      } else if (de(DEFINICIONES, t)) {
        defs.push(DEFINICIONES[t]!);
        if (t === 'linkEventDefinition') e.enlace = normalizar(h.getAttribute('name'));
      } else if (t === 'eventDefinitionRef') {
        const d = porId.get(refLocal(h.textContent));
        if (d && de(DEFINICIONES, d.localName || '')) defs.push(DEFINICIONES[d.localName!]!);
      } else if (t === 'standardLoopCharacteristics') {
        if (!e.marker) e.marker = 'loop';
      } else if (t === 'multiInstanceLoopCharacteristics') {
        if (!e.marker) e.marker = h.getAttribute('isSequential') === 'true' ? 'multiinstance-seq' : 'multiinstance';
      } else if (t === 'dataInputAssociation') {
        for (const r of hijos(h)) if (r.localName === 'sourceRef') e.refsEntrada.push(refLocal(r.textContent));
      } else if (t === 'dataOutputAssociation') {
        for (const r of hijos(h)) if (r.localName === 'targetRef') e.refsSalida.push(refLocal(r.textContent));
      }
    }
    if (!defs.length) return;
    const d = defs.length > 1 ? 'multiple' : defs[0]!;
    e.definicion = d;
    if (d === 'terminate') { if (e.tipo === 'end') e.terminate = true; }
    else if (EVENTO_DEL_DOMINIO.has(d)) e.eventType = d as Elemento['eventType'];
    else if (d !== 'link') {
      e.notas.push('Evento BPMN de ' + NOMBRE_DEFINICION[d] + '.');
      sinEquivalente.add(NOMBRE_DEFINICION[d]!);
    }
  };

  const crear = (el: ElementoXml, tag: string, proceso: string, contenedor: Elemento | null, profundidad: number) => {
    let id = el.getAttribute('id') || ('sin-id-' + creados.length);
    if (E.has(id)) id = id + '#' + creados.length;       // id repetido: no se pierde el elemento
    const tipo: Tipo = tag === 'startEvent' ? 'start' : tag === 'endEvent' ? 'end'
      : EVENTOS.has(tag) ? 'intermediate' : de(COMPUERTAS, tag) ? 'decision' : 'task';
    const e: Elemento = {
      id, tag, tipo, nombre: normalizar(el.getAttribute('name')), proceso,
      contenedor: contenedor ? contenedor.id : null, profundidad, hijos: [], expandido: false,
      owner: '', pains: [], notas: [], refsEntrada: [], refsSalida: [], docsIn: [], docsOut: [], sistemas: [], quitado: false
    };
    if (de(EJECUCION_DE_TAREA, tag)) e.exec = EJECUCION_DE_TAREA[tag];
    if (tag === 'callActivity' || SUBPROCESOS.has(tag)) { e.exec = 'manual'; e.marker = 'subprocess'; }
    if (tag === 'callActivity') llamadas++;
    if (tag === 'adHocSubProcess') e.notas.push('Subproceso ad hoc: sus actividades no siguen un orden fijo.');
    if (tag === 'transaction') e.notas.push('Transacción BPMN.');
    if (de(COMPUERTAS, tag)) e.gatewayType = COMPUERTAS[tag];
    if (tag === 'intermediateThrowEvent') e.throw = true;
    if (tag === 'boundaryEvent') {
      e.adjuntoA = refLocal(el.getAttribute('attachedToRef'));
      e.cancela = el.getAttribute('cancelActivity') !== 'false';
    }
    E.set(id, e);
    creados.push(e);
    if (contenedor) contenedor.hijos.push(id);
    else { const r = raices.get(proceso); if (r) r.push(id); else raices.set(proceso, [id]); }
    leerDetalles(el, e);
    if (SUBPROCESOS.has(tag) && hijos(el).some((h) => esNodo(h.localName || ''))) {
      e.expandido = true;
      recorrer(el, proceso, e, profundidad + 1);
    }
  };

  const recorrer = (cont: ElementoXml, proceso: string, contenedor: Elemento | null, profundidad: number) => {
    for (const el of hijos(cont)) {
      const tag = el.localName || '';
      if (esNodo(tag)) crear(el, tag, proceso, contenedor, profundidad);
      else if (tag === 'sequenceFlow') {
        alta(refLocal(el.getAttribute('sourceRef')), refLocal(el.getAttribute('targetRef')), normalizar(el.getAttribute('name')), false);
      } else if (tag === 'laneSet') leerCarriles(el, poolDe.get(proceso) || '', proceso);
      else if (tag === 'textAnnotation') {
        const texto = hijos(el).filter((h) => h.localName === 'text').map((h) => normalizar(h.textContent)).join(' ');
        if (texto) anotaciones.set(el.getAttribute('id') || '', texto);
      } else if (tag === 'association') {
        asociaciones.push([refLocal(el.getAttribute('sourceRef')), refLocal(el.getAttribute('targetRef'))]);
      } else if (!SILENCIO.has(tag)) desconocidos.set(tag, (desconocidos.get(tag) || 0) + 1);
    }
  };

  const procesos = deTag('process');
  for (const p of procesos) recorrer(p, p.getAttribute('id') || '', null, 0);
  if (!creados.length) throw new Error('El BPMN no tiene actividades, eventos ni compuertas que importar.');

  // ---- Datos y anotaciones -> campos de la actividad ----
  let conDatos = 0;
  const dato = (ref: string): { nombre: string; almacen: boolean } | null => {
    const el = porId.get(ref);
    const t = el ? el.localName || '' : '';
    if (!el || !['dataObjectReference', 'dataObject', 'dataStoreReference', 'dataStore'].includes(t)) return null;
    const almacen = t.startsWith('dataStore');
    let nombre = normalizar(el.getAttribute('name'));
    if (!nombre) {
      const ref2 = el.getAttribute(almacen ? 'dataStoreRef' : 'dataObjectRef');
      const obj = ref2 ? porId.get(refLocal(ref2)) : undefined;
      nombre = obj ? normalizar(obj.getAttribute('name')) : '';
    }
    return nombre ? { nombre, almacen } : null;
  };
  const anadir = (lista: string[], v: string) => { if (!lista.includes(v)) lista.push(v); };
  for (const e of creados) {
    for (const r of e.refsEntrada) { const d = dato(r); if (d) { anadir(d.almacen ? e.sistemas : e.docsIn, d.nombre); conDatos++; } }
    for (const r of e.refsSalida) { const d = dato(r); if (d) { anadir(d.almacen ? e.sistemas : e.docsOut, d.nombre); conDatos++; } }
  }
  for (const [a, b] of asociaciones) {
    const texto = anotaciones.get(a) ?? anotaciones.get(b);
    const e = E.get(anotaciones.has(a) ? b : a);
    if (texto && e) e.notas.push(texto);
  }

  // ---- Carril de cada elemento (los contenedores se crean antes que su contenido) ----
  const carrilPorPosicion = (e: Elemento): string => {
    const c = cajas.get(e.id);
    if (!c) return '';
    const p = centro(c);
    let mejor = '', area = Infinity;
    for (const k of cajasCarril) {
      const q = k.caja;
      if (q.plano !== c.plano || p.x < q.x || p.x > q.x + q.w || p.y < q.y || p.y > q.y + q.h) continue;
      if (q.w * q.h < area) { area = q.w * q.h; mejor = k.nombre; }
    }
    return mejor;
  };
  for (const e of creados) {
    e.owner = carrilDe.get(e.id)
      || (e.metadatos ? e.metadatos.owner : '')
      || carrilPorPosicion(e)
      || (e.contenedor ? E.get(e.contenedor)!.owner : '')
      || (conCarriles.has(e.proceso) ? '' : (poolDe.get(e.proceso) || ''));
  }

  // ---- Flujos de mensaje entre pools y eventos de enlace: el editor los dibuja como flujos ----
  for (const m of deTag('messageFlow')) {
    const a = refLocal(m.getAttribute('sourceRef')), b = refLocal(m.getAttribute('targetRef'));
    if (E.has(a) && E.has(b)) alta(a, b, normalizar(m.getAttribute('name')), false);
  }
  const capturas = new Map<string, Elemento[]>();
  const claveEnlace = (e: Elemento) => e.proceso + '|' + (e.enlace || e.nombre);
  for (const e of creados) {
    if (e.definicion !== 'link' || e.tag !== 'intermediateCatchEvent') continue;
    const l = capturas.get(claveEnlace(e));
    if (l) l.push(e); else capturas.set(claveEnlace(e), [e]);
  }
  for (const e of creados) {
    if (e.definicion !== 'link' || e.tag !== 'intermediateThrowEvent') continue;
    for (const c of capturas.get(claveEnlace(e)) ?? []) alta(e.id, c.id, '', true);
  }

  // ---- Subprocesos con contenido: el contenido entra en el flujo ----
  // La caja del subproceso queda como primer paso de su contenido: recibe sus
  // entradas y enlaza con lo primero de dentro; sus salidas pasan a salir de lo
  // último de dentro. Los eventos de inicio y fin sin tipo ni nombre del
  // subproceso solo marcaban esos bordes y se quitan; con nombre quedan como hito
  // (evento intermedio). Del de fuera hacia dentro: cada uno solo mira a sus
  // hijos directos y sus propias salidas en ese momento.
  const subprocesos = creados.filter((e) => e.expandido).sort((a, b) => a.profundidad - b.profundidad);
  for (const s of subprocesos) {
    const hs = s.hijos.map((id) => E.get(id)!).filter((e) => !e.quitado && e.tag !== 'boundaryEvent');
    const deS = salientes(s.id);
    const inicios = hs.filter((e) => e.tipo === 'start');
    if (inicios.length) {
      for (const ini of inicios) {
        if (ini.definicion || ini.nombre) {
          // Disparador de un subproceso de evento (temporizador, mensaje…): evento intermedio que espera.
          // Un inicio sin tipo pero con nombre: hito (evento intermedio que lanza, sin tipo).
          ini.tipo = 'intermediate';
          if (!ini.definicion) ini.throw = true;
          alta(s.id, ini.id, '', true);
        } else {
          ini.quitado = true;
          for (const f of salientes(ini.id)) moverDesde(f, s.id);
          for (const f of entrantes(ini.id)) moverHacia(f, s.id);
        }
      }
    } else {
      for (const e of hs) if (!entrantes(e.id).length) alta(s.id, e.id, '', true);
    }
    // Sin salidas (último paso o subproceso de evento): sus fines siguen siendo fines
    if (!deS.length) continue;
    let conectados = 0;
    const conectar = (desde: string, nombre: string) => {
      for (const o of deS) alta(desde, o.hacia, nombre || o.nombre, true);
      conectados++;
    };
    const fines = hs.filter((e) => e.tipo === 'end');
    if (fines.length) {
      for (const fin of fines) {
        const d = fin.definicion;
        if (d === 'error' || d === 'cancel' || d === 'compensate') continue;   // camino de excepción: sigue siendo un fin
        if ((d && d !== 'terminate') || fin.nombre) {
          // Lanza (mensaje, señal, escalamiento…) y el subproceso termina bien: el flujo sigue.
          // Un fin sin tipo (o de terminación) con nombre queda como hito.
          fin.tipo = 'intermediate'; fin.throw = true; fin.terminate = undefined;
          conectar(fin.id, '');
        } else {
          fin.quitado = true;
          for (const f of entrantes(fin.id)) { baja(f); conectar(f.desde, f.nombre); }
        }
      }
    } else {
      for (const e of hs) if (!salientes(e.id).length) conectar(e.id, '');
    }
    if (conectados) for (const o of deS) baja(o);
  }

  // ---- Eventos de borde ----
  // El editor admite uno por actividad (temporizador, error o mensaje), dibujado
  // sobre la caja; su camino de excepción sale de la actividad. Los demás quedan
  // como evento intermedio justo después de su actividad.
  let bordesSueltos = 0;
  for (const b of creados) {
    if (b.tag !== 'boundaryEvent' || b.quitado) continue;
    const act = b.adjuntoA ? E.get(b.adjuntoA) : undefined;
    if (!act || act.quitado) continue;
    if (!b.owner) b.owner = act.owner;
    const d = b.definicion;
    if (act.tipo === 'task' && !act.boundary && (d === 'timer' || d === 'error' || d === 'message')) {
      act.boundary = { type: d, interrupting: b.cancela !== false };
      act.notas.push(...b.notas);
      b.quitado = true;
      for (const f of salientes(b.id)) { moverDesde(f, act.id); if (!f.nombre) f.nombre = b.nombre; }
      for (const f of entrantes(b.id)) baja(f);
    } else {
      bordesSueltos++;
      alta(act.id, b.id, '', true);
    }
  }

  // ---- Compuerta basada en eventos: cada rama lleva el nombre de su evento ----
  // Sin nombre, el editor rotularía las dos primeras «Sí» y «No».
  for (const g of creados) {
    if (g.quitado || g.tag !== 'eventBasedGateway') continue;
    for (const f of salientes(g.id)) if (!f.nombre) f.nombre = E.get(f.hacia)?.nombre || '';
  }

  // ---- Compuertas exclusivas con una sola salida (convergencias) ----
  // El editor le añadiría una rama «No» hacia un fin «Caso no procede» que no
  // existe (asegurarRamasDeDecision). Se dibujan como convergencia implícita,
  // que es lo que hace el editor con sus propios procesos.
  let convergencias = 0;
  for (const g of creados) {
    if (g.quitado || g.tipo !== 'decision' || g.gatewayType !== 'exclusive') continue;
    const sal = salientes(g.id);
    if (sal.length !== 1 || sal[0]!.hacia === g.id) continue;
    const destino = sal[0]!;
    g.quitado = true; convergencias++;
    baja(destino);
    for (const f of entrantes(g.id)) { moverHacia(f, destino.hacia); if (!f.nombre) f.nombre = destino.nombre; }
  }

  // ---- Orden de los nodos ----
  // Por el borde izquierdo: el centro de una caja ancha (un subproceso desplegado) queda muy a la derecha
  const ordenar = (lista: Elemento[]): Elemento[] => {
    if (!ORDENAR_POR_POSICION || lista.length < 2) return lista;
    const cs = lista.map((e) => cajas.get(e.id));
    if (cs.some((c) => !c) || cs.some((c) => c!.plano !== cs[0]!.plano)) return lista;
    return lista.map((e, i) => ({ e, c: cs[i]!, i }))
      .sort((a, b) => (a.c.x - b.c.x) || (a.c.y - b.c.y) || (a.i - b.i)).map((x) => x.e);
  };
  const salida: Elemento[] = [];
  const emitir = (ids: string[]) => {
    for (const e of ordenar(ids.map((id) => E.get(id)!))) {
      if (!e.quitado) salida.push(e);
      if (e.expandido) emitir(e.hijos);
    }
  };
  const idsProceso = procesos.map((p) => p.getAttribute('id') || '');
  const ordenProcesos = idsProceso.every((id) => yPool.has(id))
    ? idsProceso.map((id, i) => ({ id, i })).sort((a, b) => (yPool.get(a.id)! - yPool.get(b.id)!) || (a.i - b.i)).map((x) => x.id)
    : idsProceso;
  for (const id of [...new Set(ordenProcesos)]) emitir(raices.get(id) ?? []);

  // ---- Nodos y aristas del editor ----
  let siguienteId = opciones.siguienteId;
  const idDe = new Map<string, string>();
  for (const e of salida) idDe.set(e.id, 'n' + (siguienteId++));
  const conNiveles = salida.some((e) => e.expandido);
  const nodos: Nodo[] = salida.map((e) => {
    const def = formas[e.tipo] || formas.task!;
    const label = e.nombre || (e.tipo === 'start' ? 'Inicio' : e.tipo === 'end' ? 'Fin' : def.label);
    const sistemas = [e.metadatos ? e.metadatos.system : '', ...e.sistemas].filter((s, i, a) => s && a.indexOf(s) === i);
    // Mismo orden de claves que la lectura del MVP; lo nuevo va al final
    const n = {
      id: idDe.get(e.id)!, type: e.tipo, x: 0, y: 0, w: def.w, h: def.h,
      label, executionType: e.tipo === 'task' ? (e.exec || 'manual') : '',
      gatewayType: e.gatewayType, eventType: e.eventType, throw: e.throw,
      activityCode: '', owner: e.owner, system: sistemas.join(', '),
      time: e.metadatos ? e.metadatos.time : '', volume: e.metadatos ? e.metadatos.volume : '', va: '',
      sla: '', docsIn: e.docsIn.join(', '), docsOut: e.docsOut.join(', '), rules: '', notes: e.notas.join('\n'), pains: []
    } as unknown as Nodo;
    if (e.marker) n.marker = e.marker as Nodo['marker'];
    if (e.terminate) n.terminate = true;
    if (e.boundary) n.boundary = e.boundary;
    if (conNiveles) {
      // Nivel superior en el Ejecutivo; el contenido de los subprocesos, solo en el Detalle
      n.nivel = e.profundidad === 0 ? 1 : 3;
      if (e.contenedor && idDe.has(e.contenedor)) n.padre = idDe.get(e.contenedor);
    }
    return n;
  });

  // Aristas en el orden del flujo (origen y después destino), no en el del archivo,
  // que agrupa los flujos de cada subproceso dentro de él
  const posicion = new Map<string, number>();
  salida.forEach((e, i) => posicion.set(e.id, i));
  const enOrden = flujos.filter((f) => !f.quitado && posicion.has(f.desde) && posicion.has(f.hacia))
    .map((f, i) => ({ f, i }))
    .sort((a, b) => (posicion.get(a.f.desde)! - posicion.get(b.f.desde)!) || (posicion.get(a.f.hacia)! - posicion.get(b.f.hacia)!) || (a.i - b.i))
    .map((x) => x.f);
  const aristas: { id: string; from: string; to: string; label: string }[] = [];
  const vistas = new Map<string, { label: string }>();
  for (const f of enOrden) {
    const from = idDe.get(f.desde), to = idDe.get(f.hacia);
    if (!from || !to || (from === to && f.sintetico)) continue;
    const k = from + '>' + to;
    const previa = vistas.get(k);
    if (previa) { if (!previa.label && f.nombre) previa.label = f.nombre; continue; }
    const a = { id: '', from, to, label: f.nombre };
    vistas.set(k, a);
    aristas.push(a);
  }
  aristas.forEach((a) => { a.id = 'e' + (siguienteId++); });
  salida.forEach((e, i) => {
    if (e.pains.length) nodos[i]!.pains = e.pains.map((p) => ({ id: 'p' + (siguienteId++), ...p }));
  });

  // ---- Resumen para la persona ----
  const conteo: ConteoLectura = { count: 0, tasks: 0, gateways: 0, events: 0, flows: aristas.length };
  for (const n of nodos) {
    if (n.type === 'task') conteo.tasks++;
    else if (n.type === 'decision') conteo.gateways++;
    else conteo.events++;
  }
  conteo.count = conteo.tasks + conteo.gateways + conteo.events;

  const carriles = [...new Set(nodos.map((n) => n.owner || '').filter(Boolean))];
  const avisos: string[] = [];
  if (desconocidos.size) {
    avisos.push('Se ignoraron elementos que el editor no representa: ' +
      [...desconocidos].map(([t, n]) => t + ' (' + n + ')').join(', ') + '.');
  }
  if (convergencias) {
    avisos.push(plural(convergencias, 'compuerta exclusiva de convergencia se dibuja', 'compuertas exclusivas de convergencia se dibujan') +
      ' como convergencia implícita: el editor no admite una compuerta exclusiva con una sola salida.');
  }
  if (bordesSueltos) {
    avisos.push(plural(bordesSueltos, 'evento de borde queda', 'eventos de borde quedan') +
      ' como evento intermedio después de su actividad: el editor dibuja uno por actividad (temporizador, error o mensaje).');
  }
  if (sinEquivalente.size) {
    avisos.push('Los eventos de ' + [...sinEquivalente].join(', ') + ' se importan como eventos simples; el tipo queda en sus notas.');
  }
  if (llamadas) {
    avisos.push(plural(llamadas, 'llamada a otro proceso (callActivity) se importa', 'llamadas a otros procesos (callActivity) se importan') +
      ' como subproceso plegado: su contenido no está en este archivo.');
  }
  if (conDatos) avisos.push('Los objetos y almacenes de datos pasan a los documentos de entrada y salida y al sistema de cada actividad.');

  // Nombre: el del proceso con más elementos, o el de su pool
  const principal = [...idsProceso].sort((a, b) => (raices.get(b)?.length ?? 0) - (raices.get(a)?.length ?? 0))[0] ?? '';
  const nombreDe = (id: string) => normalizar(procesos.find((p) => p.getAttribute('id') === id)?.getAttribute('name'));
  const nombreProceso = nombreDe(principal) || poolDe.get(principal) || idsProceso.map(nombreDe).find(Boolean) || '';

  return {
    nodos, aristas, nombreProceso, siguienteId, conteo, origen: 'externo', carriles,
    subprocesos: salida.filter((e) => e.expandido).length, avisos
  };
}
