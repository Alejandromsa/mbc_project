// Portado del MVP 3.8.9 (app.js) sin cambios de lógica — fase 1.
import { runSimulation } from '../analitica/simulador.js';
import { copilotPost } from '../copiloto/copiloto.js';
import { $ } from '../dom.js';
import { SHAPE_DEFAULTS, state } from '../estado.js';
import { resetState } from '../historial.js';
import { autoLayout } from '../layout/auto-layout.js';
import { activateTab } from '../paneles/cajon.js';
import { persist } from '../persistencia.js';
import { ensureDecisionBranches } from '../proceso/operaciones.js';

// Proceso demo completo pre-poblado (para presentaciones a cliente)
function loadDemoProcess() {
  resetState();
  state.meta = { name: 'Gestión de Reclamos — Banca Minorista', industry: 'Banca', macroprocess: 'Servicio', client: '', owner: '' };
  $('#processName').value = state.meta.name;
  $('#processIndustry').value = 'Banca';
  $('#processMacro').value = 'Servicio';

  const T = [
    { type: 'start', label: 'Reclamo recibido', owner: 'Cliente' },
    { type: 'task', label: 'Registrar reclamo', owner: 'Asesor Call Center', system: 'CRM', exec: 'system', time: 8, vol: 1200, va: 'BVA' },
    { type: 'decision', label: '¿Resuelve en 1ra línea?', owner: 'Asesor Call Center' },
    { type: 'task', label: 'Resolver y cerrar', owner: 'Asesor Call Center', exec: 'phone', time: 12, vol: 720, va: 'VA',
      pains: [{ category: 'rework', description: 'Reapertura por solución incompleta', severity: 3, frequency: 3 }] },
    { type: 'task', label: 'Escalar a back office', owner: 'Asesor Call Center', system: 'Workflow', exec: 'system', time: 5, vol: 480, va: 'NVA',
      pains: [{ category: 'handoff', description: 'Pérdida de contexto en traspaso a BO', severity: 5, frequency: 4 }] },
    { type: 'task', label: 'Investigar caso', owner: 'Analista Back Office', exec: 'manual', time: 45, vol: 480, va: 'VA',
      pains: [{ category: 'wait', description: 'Espera de información de otras áreas', severity: 4, frequency: 4 }] },
    { type: 'task', label: 'Aprobar resolución', owner: 'Jefe Back Office', exec: 'manual', time: 15, vol: 480, va: 'BVA' },
    { type: 'task', label: 'Notificar al cliente', owner: 'Asesor Call Center', exec: 'email', time: 6, vol: 1200, va: 'VA' },
    { type: 'end', label: 'Reclamo resuelto', owner: 'Cliente' }
  ];

  const created = [];
  let x = 80, y = 100;
  T.forEach(t => {
    const def = SHAPE_DEFAULTS[t.type];
    const node = {
      id: 'n' + (state.nextId++), type: t.type, x, y, w: def.w, h: def.h,
      label: t.label, executionType: t.exec || (t.type === 'task' ? 'manual' : ''),
      activityCode: '', owner: t.owner || '', system: t.system || '',
      time: t.time != null ? String(t.time) : '', volume: t.vol != null ? String(t.vol) : '', va: t.va || '',
      sla: '', docsIn: '', docsOut: '', rules: '', notes: '', pains: (t.pains || []).map(p => ({ id: 'p' + (state.nextId++), ...p }))
    };
    state.nodes.push(node); created.push(node);
    x += def.w + 60;
  });
  // Conexión lineal + rama de decisión
  for (let i = 0; i < created.length - 1; i++) {
    if (created[i].type === 'decision') {
      state.edges.push({ id: 'e' + (state.nextId++), from: created[i].id, to: created[i + 1].id, label: 'Sí' });
      // rama No → escalar (created[i+2])
      if (created[i + 2]) state.edges.push({ id: 'e' + (state.nextId++), from: created[i].id, to: created[i + 2].id, label: 'No' });
      // saltar la conexión lineal del "resolver" hacia "escalar" para evitar duplicado
      state.edges.push({ id: 'e' + (state.nextId++), from: created[i + 1].id, to: created[created.length - 1].id, label: '' });
      i++; // ya conectamos i+1
    } else {
      state.edges.push({ id: 'e' + (state.nextId++), from: created[i].id, to: created[i + 1].id, label: '' });
    }
  }

  // KPIs capturados (gap vs benchmark) para la demo
  state._kpiValues = {
    'bnk-03': { name: 'First Contact Resolution (FCR)', unit: '%', benchmark: '> 75%', value: '60', gap: '-15 pp', source: 'Dashboard CRM Q1' },
    'per-ind-01': { name: 'Tiempo de respuesta reclamo (Indecopi)', unit: 'días hábiles', benchmark: '≤ 30 días', value: '34', gap: '+4 días', source: 'Reporte Compliance' }
  };

  ensureDecisionBranches();
  persist();
  autoLayout();
  runSimulation();
  persist();   // guarda los resultados de simulación
  activateTab('copilot');
  copilotPost('ai',
    `**Proceso demo cargado: Gestión de Reclamos — Banca Minorista.**\n\n` +
    `Incluye: 7 actividades con tipos BPMN, 4 pain points (1 crítico: handoff a BO), 2 KPIs con gap vs benchmark (FCR 60% vs >75%, Indecopi 34 vs ≤30 días), tiempos y volúmenes para el simulador.\n\n` +
    `Prueba: **Detecta pains**, **Matriz impacto-esfuerzo**, **✨ To-Be IA**, o exporta a **PPTX/Word**. Ideal para mostrar el flujo completo a un cliente.`);
}

// Proceso COMPLEJO de prueba: Originación de Crédito Hipotecario (8 actores, ~23 nodos, loop)
function loadComplexDemo() {
  resetState();
  state.meta = { name: 'Originación de Crédito Hipotecario', industry: 'Banca', macroprocess: 'O2C', client: '', owner: '' };
  $('#processName').value = state.meta.name;
  $('#processIndustry').value = 'Banca';
  $('#processMacro').value = 'O2C';

  // k = clave local para definir edges
  const N = [
    { k: 's',   type: 'start', label: 'Solicitud hipoteca recibida', owner: 'Cliente' },
    { k: 'a1',  type: 'task',  label: 'Presentar documentación', owner: 'Cliente', exec: 'document', time: 20, vol: 600, va: 'BVA',
      pains: [{ category: 'handoff', description: 'Documentos entregados en físico, sin trazabilidad digital', severity: 3, frequency: 4 }] },
    { k: 'a2',  type: 'task',  label: 'Registrar solicitud', owner: 'Ejecutivo Comercial', system: 'CRM', exec: 'system', time: 12, vol: 600, va: 'BVA' },
    { k: 'a3',  type: 'task',  label: 'Validar documentación', owner: 'Ejecutivo Comercial', exec: 'manual', time: 15, vol: 600, va: 'NVA',
      pains: [{ category: 'rework', description: 'Documentación incompleta genera reprocesos', severity: 4, frequency: 5 }] },
    { k: 'd1',  type: 'decision', label: '¿Documentación completa?', owner: 'Ejecutivo Comercial' },
    { k: 'a4',  type: 'task',  label: 'Solicitar subsanación', owner: 'Ejecutivo Comercial', exec: 'email', time: 8, vol: 240, va: 'NVA',
      pains: [{ category: 'wait', description: 'Espera de respuesta del cliente alarga el ciclo', severity: 3, frequency: 4 }] },
    { k: 'a5',  type: 'task',  label: 'Verificar antecedentes', owner: 'Analista de Crédito', system: 'Centrales', exec: 'system', time: 18, vol: 540, va: 'VA' },
    { k: 'a6',  type: 'task',  label: 'Evaluar capacidad pago', owner: 'Analista de Crédito', system: 'Scoring', exec: 'ai', time: 30, vol: 540, va: 'VA' },
    { k: 'd2',  type: 'decision', label: '¿Cumple política de riesgo?', owner: 'Analista de Crédito' },
    { k: 'a7',  type: 'task',  label: 'Programar tasación', owner: 'Tasador', exec: 'email', time: 8, vol: 420, va: 'NVA',
      pains: [{ category: 'handoff', description: 'Coordinación manual con perito externo', severity: 4, frequency: 4 }] },
    { k: 'a8',  type: 'task',  label: 'Tasar inmueble', owner: 'Tasador', exec: 'manual', time: 120, vol: 420, va: 'VA',
      pains: [{ category: 'wait', description: 'Disponibilidad del perito: 3-5 días de espera', severity: 5, frequency: 5 }] },
    { k: 'a9',  type: 'task',  label: 'Emitir informe tasación', owner: 'Tasador', exec: 'document', time: 30, vol: 420, va: 'BVA' },
    { k: 'a10', type: 'task',  label: 'Analizar riesgo crediticio', owner: 'Riesgos', exec: 'system', time: 45, vol: 420, va: 'VA' },
    { k: 'd3',  type: 'decision', label: '¿Monto supera umbral comité?', owner: 'Riesgos' },
    { k: 'a11', type: 'task',  label: 'Evaluar en comité', owner: 'Comité de Crédito', exec: 'manual', time: 60, vol: 200, va: 'BVA',
      pains: [{ category: 'wait', description: 'Comité sesiona 1 vez/semana: cuello de botella', severity: 5, frequency: 4 }] },
    { k: 'd4',  type: 'decision', label: '¿Aprobado por comité?', owner: 'Comité de Crédito' },
    { k: 'a12', type: 'task',  label: 'Revisar título propiedad', owner: 'Legal', exec: 'manual', time: 90, vol: 380, va: 'BVA',
      pains: [{ category: 'control', description: 'Revisión legal duplica validaciones de Riesgos', severity: 3, frequency: 3 }] },
    { k: 'a13', type: 'task',  label: 'Elaborar minuta y contrato', owner: 'Legal', exec: 'document', time: 60, vol: 380, va: 'VA' },
    { k: 'a14', type: 'task',  label: 'Constituir hipoteca', owner: 'Operaciones', system: 'Core', exec: 'system', time: 40, vol: 380, va: 'VA' },
    { k: 'a15', type: 'task',  label: 'Desembolsar crédito', owner: 'Operaciones', system: 'Core', exec: 'automatic', time: 5, vol: 380, va: 'VA' },
    { k: 'a16', type: 'task',  label: 'Notificar al cliente', owner: 'Operaciones', exec: 'email', time: 6, vol: 600, va: 'VA' },
    { k: 'e1',  type: 'end',   label: 'Crédito desembolsado', owner: 'Cliente' },
    { k: 'e2',  type: 'end',   label: 'Solicitud rechazada', owner: 'Cliente' }
  ];
  const E = [
    ['s','a1'], ['a1','a2'], ['a2','a3'], ['a3','d1'],
    ['d1','a5','Sí'], ['d1','a4','No'], ['a4','a3'],          // loop de reproceso
    ['a5','a6'], ['a6','d2'],
    ['d2','a7','Sí'], ['d2','e2','No'],
    ['a7','a8'], ['a8','a9'], ['a9','a10'], ['a10','d3'],
    ['d3','a11','Sí'], ['d3','a12','No'],
    ['a11','d4'], ['d4','a12','Sí'], ['d4','e2','No'],
    ['a12','a13'], ['a13','a14'], ['a14','a15'], ['a15','a16'], ['a16','e1']
  ];

  const idMap = {};
  N.forEach(t => {
    const def = SHAPE_DEFAULTS[t.type];
    const node = {
      id: 'n' + (state.nextId++), type: t.type, x: 0, y: 0, w: def.w, h: def.h,
      label: t.label, executionType: t.exec || (t.type === 'task' ? 'manual' : ''),
      activityCode: '', owner: t.owner || '', system: t.system || '',
      time: t.time != null ? String(t.time) : '', volume: t.vol != null ? String(t.vol) : '', va: t.va || '',
      sla: '', docsIn: '', docsOut: '', rules: '', notes: '', pains: (t.pains || []).map(p => ({ id: 'p' + (state.nextId++), ...p }))
    };
    idMap[t.k] = node.id;
    state.nodes.push(node);
  });
  E.forEach(([a, b, lbl]) => {
    state.edges.push({ id: 'e' + (state.nextId++), from: idMap[a], to: idMap[b], label: lbl || '' });
  });

  state._kpiValues = {
    'bnk-02': { name: 'Time-to-Yes', unit: 'horas', benchmark: '< 24h banca minorista', value: '120', gap: '+96 h', source: 'Reporte Comercial' },
    'bnk-01': { name: 'Tasa de aprobación de créditos', unit: '%', benchmark: '65-75%', value: '52', gap: '-13 pp', source: 'Dashboard Riesgos' }
  };

  ensureDecisionBranches();
  persist();
  autoLayout();
  runSimulation();
  persist();
  activateTab('copilot');
  const tasks = state.nodes.filter(n => n.type === 'task').length;
  const lanes = (state._lanes?.list || []).length;
  copilotPost('ai',
    `**Proceso COMPLEJO cargado: Originación de Crédito Hipotecario.**\n\n` +
    `${tasks} actividades · ${lanes} actores (swimlanes) · 4 decisiones · 1 loop de reproceso · 2 ends (aprobado/rechazado).\n` +
    `Pains críticos: tasación (espera 3-5 días) y comité (sesiona 1x/semana). KPIs con gap: Time-to-Yes 120h vs <24h, aprobación 52% vs 65-75%.\n\n` +
    `Es un caso de stress: prueba **🔴 Cuello de botella**, **🔬 What-If**, **🤖 Automatización**, **📋 Backlog** y exporta a **PPTX** (multi-slide) para medir el rendimiento.`);
}

// Proceso COMPLEJO 2: Onboarding de Personal — con gateway PARALELO (fork/join), 7 actores
function loadComplexDemo2() {
  resetState();
  state.meta = { name: 'Onboarding de Personal Nuevo', industry: 'Transversal', macroprocess: 'H2R', client: '', owner: '' };
  $('#processName').value = state.meta.name;
  $('#processIndustry').value = 'Transversal';
  $('#processMacro').value = 'H2R';

  const N = [
    { k: 's',   type: 'start', label: 'Candidato seleccionado', owner: 'RRHH' },
    { k: 'a1',  type: 'task',  label: 'Enviar oferta laboral', owner: 'RRHH', exec: 'email', time: 10, vol: 100, va: 'VA' },
    { k: 'd1',  type: 'decision', label: '¿Oferta aceptada?', owner: 'RRHH', gateway: 'exclusive' },
    { k: 'erej',type: 'end',   label: 'Vacante reabierta', owner: 'RRHH' },
    { k: 'a2',  type: 'task',  label: 'Recopilar documentación', owner: 'Empleado', exec: 'document', time: 30, vol: 80, va: 'BVA',
      pains: [{ category: 'wait', description: 'Demora del candidato en enviar documentos', severity: 3, frequency: 4 }] },
    { k: 'a3',  type: 'task',  label: 'Registrar en sistema RRHH', owner: 'RRHH', system: 'Workday', exec: 'system', time: 15, vol: 80, va: 'BVA' },
    { k: 'g1',  type: 'decision', label: 'Iniciar provisión en paralelo', owner: 'RRHH', gateway: 'parallel' },
    { k: 'bit', type: 'task',  label: 'Crear usuario y correo', owner: 'IT', system: 'Active Directory', exec: 'system', time: 20, vol: 80, va: 'VA' },
    { k: 'bleg',type: 'task',  label: 'Preparar contrato', owner: 'Legal', exec: 'document', time: 45, vol: 80, va: 'VA',
      pains: [{ category: 'manual', description: 'Contrato redactado manualmente sin plantilla', severity: 3, frequency: 4 }] },
    { k: 'bfin',type: 'task',  label: 'Dar de alta en nómina', owner: 'Finanzas', system: 'SAP HR', exec: 'system', time: 25, vol: 80, va: 'BVA' },
    { k: 'bseg',type: 'task',  label: 'Asignar accesos físicos', owner: 'Seguridad', exec: 'manual', time: 15, vol: 80, va: 'BVA' },
    { k: 'g2',  type: 'decision', label: 'Sincronizar provisión', owner: 'RRHH', gateway: 'parallel' },
    { k: 'a4',  type: 'task',  label: 'Asignar equipo y puesto', owner: 'IT', exec: 'manual', time: 30, vol: 80, va: 'VA' },
    { k: 'a5',  type: 'task',  label: 'Firmar contrato', owner: 'Empleado', exec: 'document', time: 20, vol: 80, va: 'VA' },
    { k: 'a6',  type: 'task',  label: 'Programar inducción', owner: 'RRHH', exec: 'email', time: 10, vol: 80, va: 'BVA' },
    { k: 'a7',  type: 'task',  label: 'Realizar inducción Día 1', owner: 'Manager', exec: 'phone', time: 120, vol: 80, va: 'VA',
      pains: [{ category: 'handoff', description: 'Inducción sin material estandarizado por área', severity: 4, frequency: 3 }] },
    { k: 'a8',  type: 'task',  label: 'Asignar plan capacitación', owner: 'Manager', exec: 'ai', time: 30, vol: 80, va: 'VA' },
    { k: 'a9',  type: 'task',  label: 'Validar onboarding completo', owner: 'RRHH', exec: 'system', time: 15, vol: 80, va: 'BVA' },
    { k: 'e1',  type: 'end',   label: 'Empleado activo', owner: 'Empleado' }
  ];
  const E = [
    ['s','a1'], ['a1','d1'], ['d1','a2','Sí'], ['d1','erej','No'],
    ['a2','a3'], ['a3','g1'],
    ['g1','bit'], ['g1','bleg'], ['g1','bfin'], ['g1','bseg'],   // fork paralelo
    ['bit','g2'], ['bleg','g2'], ['bfin','g2'], ['bseg','g2'],   // join paralelo
    ['g2','a4'], ['a4','a5'], ['a5','a6'], ['a6','a7'], ['a7','a8'], ['a8','a9'], ['a9','e1']
  ];

  const idMap = {};
  N.forEach(t => {
    const def = SHAPE_DEFAULTS[t.type];
    const node = {
      id: 'n' + (state.nextId++), type: t.type, x: 0, y: 0, w: def.w, h: def.h,
      label: t.label, executionType: t.exec || (t.type === 'task' ? 'manual' : ''),
      gatewayType: t.gateway || undefined, activityCode: '',
      owner: t.owner || '', system: t.system || '',
      time: t.time != null ? String(t.time) : '', volume: t.vol != null ? String(t.vol) : '', va: t.va || '',
      sla: '', docsIn: '', docsOut: '', rules: '', notes: '', pains: (t.pains || []).map(p => ({ id: 'p' + (state.nextId++), ...p }))
    };
    idMap[t.k] = node.id;
    state.nodes.push(node);
  });
  E.forEach(([a, b, lbl]) => state.edges.push({ id: 'e' + (state.nextId++), from: idMap[a], to: idMap[b], label: lbl || '' }));

  state._kpiValues = {
    'trv-04': { name: 'Time-to-hire', unit: 'días', benchmark: '< 30 días', value: '45', gap: '+15 días', source: 'Dashboard RRHH' }
  };

  ensureDecisionBranches();
  persist();
  autoLayout();
  runSimulation();
  persist();
  activateTab('copilot');
  copilotPost('ai',
    `**Proceso cargado: Onboarding de Personal Nuevo** (nomenclatura BPMN completa).\n\n` +
    `7 actores · 16 actividades · gateway **exclusivo** (¿oferta aceptada?) + gateway **paralelo** ＋ (fork: IT/Legal/Finanzas/Seguridad en paralelo, luego join).\n` +
    `Formas BPMN: eventos (▶/■), tareas con marcador de tipo (User/Service/Send/Manual/Script-IA/Documental), gateways con marca (✕ exclusivo / ＋ paralelo).\n\n` +
    `El gateway paralelo muestra cómo 4 áreas provisionan al nuevo empleado simultáneamente. Edita el tipo de gateway en **Props** de cualquier decisión.`);
}

// Proceso COMPLEJO 3: Gestión de Devolución y Reembolso — con EVENTOS BPMN (timer/mensaje/error)
function loadComplexDemo3() {
  resetState();
  state.meta = { name: 'Gestión de Devolución y Reembolso', industry: 'Retail', macroprocess: 'Devoluciones', client: '', owner: '' };
  $('#processName').value = state.meta.name;
  $('#processIndustry').value = 'Retail';
  $('#processMacro').value = 'Devoluciones';

  const N = [
    { k: 's',   type: 'start', label: 'Solicitud de devolución', owner: 'Cliente', event: 'message' },
    { k: 'a1',  type: 'task',  label: 'Validar política de devolución', owner: 'Atención al Cliente', system: 'CRM', exec: 'system', time: 10, vol: 500, va: 'BVA' },
    { k: 'd1',  type: 'decision', label: '¿Aplica devolución?', owner: 'Atención al Cliente', gateway: 'exclusive' },
    { k: 'erej',type: 'end',   label: 'Devolución rechazada', owner: 'Atención al Cliente', event: 'error' },
    { k: 'a2',  type: 'task',  label: 'Generar guía de retorno', owner: 'Atención al Cliente', system: 'WMS', exec: 'system', time: 8, vol: 400, va: 'VA' },
    { k: 'a3',  type: 'task',  label: 'Enviar instrucciones', owner: 'Atención al Cliente', exec: 'email', time: 5, vol: 400, va: 'VA' },
    { k: 'iv1', type: 'intermediate', label: 'Esperar envío (5 días)', owner: 'Cliente', event: 'timer' },
    { k: 'iv2', type: 'intermediate', label: 'Recibir paquete devuelto', owner: 'Almacén', event: 'message' },
    { k: 'a4',  type: 'task',  label: 'Inspeccionar producto', owner: 'Calidad', exec: 'manual', time: 20, vol: 400, va: 'VA',
      pains: [{ category: 'wait', description: 'Cola de inspección en picos de devolución', severity: 4, frequency: 4 }] },
    { k: 'd2',  type: 'decision', label: '¿Producto conforme?', owner: 'Calidad', gateway: 'exclusive' },
    { k: 'a5',  type: 'task',  label: 'Registrar producto dañado', owner: 'Calidad', system: 'WMS', exec: 'system', time: 10, vol: 80, va: 'NVA' },
    { k: 'a6',  type: 'task',  label: 'Reingresar a inventario', owner: 'Almacén', system: 'WMS', exec: 'system', time: 12, vol: 320, va: 'BVA' },
    { k: 'a7',  type: 'task',  label: 'Autorizar reembolso', owner: 'Finanzas', exec: 'manual', time: 15, vol: 400, va: 'BVA',
      pains: [{ category: 'control', description: 'Autorización manual aunque el monto sea bajo', severity: 3, frequency: 5 }] },
    { k: 'a8',  type: 'task',  label: 'Procesar reembolso', owner: 'Finanzas', system: 'Pasarela', exec: 'automatic', time: 5, vol: 400, va: 'VA' },
    { k: 'iv3', type: 'intermediate', label: 'Esperar liquidación (48h)', owner: 'Finanzas', event: 'timer' },
    { k: 'a9',  type: 'task',  label: 'Notificar reembolso', owner: 'Atención al Cliente', exec: 'email', time: 4, vol: 400, va: 'VA' },
    { k: 'e1',  type: 'end',   label: 'Reembolso confirmado', owner: 'Cliente', event: 'message' }
  ];
  const E = [
    ['s','a1'], ['a1','d1'], ['d1','a2','Sí'], ['d1','erej','No'],
    ['a2','a3'], ['a3','iv1'], ['iv1','iv2'], ['iv2','a4'], ['a4','d2'],
    ['d2','a6','Conforme'], ['d2','a5','No conforme'],
    ['a6','a7'], ['a5','a7'],
    ['a7','a8'], ['a8','iv3'], ['iv3','a9'], ['a9','e1']
  ];

  const idMap = {};
  N.forEach(t => {
    const def = SHAPE_DEFAULTS[t.type];
    const node = {
      id: 'n' + (state.nextId++), type: t.type, x: 0, y: 0, w: def.w, h: def.h,
      label: t.label, executionType: t.exec || (t.type === 'task' ? 'manual' : ''),
      gatewayType: t.gateway || undefined, eventType: t.event || undefined, activityCode: '',
      owner: t.owner || '', system: t.system || '',
      time: t.time != null ? String(t.time) : '', volume: t.vol != null ? String(t.vol) : '', va: t.va || '',
      sla: '', docsIn: '', docsOut: '', rules: '', notes: '', pains: (t.pains || []).map(p => ({ id: 'p' + (state.nextId++), ...p }))
    };
    idMap[t.k] = node.id;
    state.nodes.push(node);
  });
  E.forEach(([a, b, lbl]) => state.edges.push({ id: 'e' + (state.nextId++), from: idMap[a], to: idMap[b], label: lbl || '' }));

  state._kpiValues = {
    'ret-07': { name: 'Tasa de devolución', unit: '%', benchmark: '< 8% retail físico', value: '11', gap: '+3 pp', source: 'Dashboard Comercial' }
  };

  ensureDecisionBranches();
  persist();
  autoLayout();
  runSimulation();
  persist();
  activateTab('copilot');
  copilotPost('ai',
    `**Proceso cargado: Gestión de Devolución y Reembolso** (eventos BPMN completos).\n\n` +
    `5 actores · 13 actividades · **3 eventos intermedios**: 2 timer ⏱ (esperar envío 5 días, liquidación 48h) + 1 mensaje ✉ (recibir paquete). Evento inicio de **mensaje** ✉, fin de **error** ⚡ y fin de **mensaje** ✉.\n\n` +
    `Nomenclatura BPMN: eventos catch (outline) vs throw (relleno), evento intermedio = doble anillo. Los timers modelan las **esperas (lead time)** del proceso — fuente directa de mejora.`);
}

function loadComplexDemo4() {
  resetState();
  state.meta = { name: 'Gestión de Siniestros de Seguros', industry: 'Seguros', macroprocess: 'Siniestros', client: '', owner: '' };
  $('#processName').value = state.meta.name;
  $('#processIndustry').value = 'Seguros';
  $('#processMacro').value = 'Siniestros';

  const N = [
    { k: 's',   type: 'start', label: 'Aviso de siniestro', owner: 'Asegurado', event: 'message' },
    { k: 'a1',  type: 'task',  label: 'Registrar siniestro', owner: 'Contact Center', system: 'Core Seguros', exec: 'system', time: 8, vol: 1200, va: 'BVA' },
    { k: 'a2',  type: 'task',  label: 'Validar póliza vigente', owner: 'Contact Center', system: 'Core Seguros', exec: 'system', time: 5, vol: 1200, va: 'VA' },
    { k: 'd1',  type: 'decision', label: '¿Póliza cubre el siniestro?', owner: 'Suscripción', gateway: 'exclusive' },
    { k: 'erej',type: 'end',   label: 'Siniestro rechazado', owner: 'Suscripción', event: 'error' },
    { k: 'g1',  type: 'decision', label: '¿Qué acciones aplican?', owner: 'Analista de Siniestros', gateway: 'inclusive' },
    { k: 'a3',  type: 'task',  label: 'Solicitar documentación', owner: 'Analista de Siniestros', exec: 'email', time: 10, vol: 1000, va: 'BVA', marker: 'loop',
      pains: [{ category: 'rework', description: 'Reenvíos por documentación incompleta del asegurado', severity: 4, frequency: 4 }] },
    { k: 'a4',  type: 'task',  label: 'Activar peritaje', owner: 'Perito', exec: 'manual', time: 45, vol: 700, va: 'VA' },
    { k: 'a5',  type: 'task',  label: 'Cotizar talleres', owner: 'Perito', exec: 'manual', time: 30, vol: 700, va: 'BVA', marker: 'multiinstance' },
    { k: 'iv1', type: 'intermediate', label: 'Esperar informe pericial', owner: 'Perito', event: 'timer' },
    { k: 'a6',  type: 'task',  label: 'Evaluar cobertura', owner: 'Analista de Siniestros', system: 'Core Seguros', exec: 'manual', time: 25, vol: 1000, va: 'VA', marker: 'subprocess' },
    { k: 'd2',  type: 'decision', label: '¿Indemnización procede?', owner: 'Analista de Siniestros', gateway: 'exclusive' },
    { k: 'a7',  type: 'task',  label: 'Liquidar reserva', owner: 'Analista de Siniestros', system: 'Core Seguros', exec: 'system', time: 8, vol: 200, va: 'NVA' },
    { k: 'a8',  type: 'task',  label: 'Autorizar pago', owner: 'Jefe de Siniestros', exec: 'manual', time: 15, vol: 800, va: 'BVA',
      pains: [{ category: 'control', description: 'Autorización manual aun en montos menores al umbral', severity: 3, frequency: 5 }] },
    { k: 'a9',  type: 'task',  label: 'Ejecutar pago', owner: 'Tesorería', system: 'ERP', exec: 'automatic', time: 5, vol: 800, va: 'VA' },
    { k: 'iv2', type: 'intermediate', label: 'Esperar abono (48h)', owner: 'Tesorería', event: 'timer' },
    { k: 'a10', type: 'task',  label: 'Notificar al asegurado', owner: 'Contact Center', exec: 'email', time: 4, vol: 800, va: 'VA' },
    { k: 'e1',  type: 'end',   label: 'Siniestro indemnizado', owner: 'Asegurado', event: 'message' }
  ];
  const E = [
    ['s','a1'], ['a1','a2'], ['a2','d1'],
    ['d1','g1','Sí'], ['d1','erej','No'],
    ['g1','a3','Documentos'], ['g1','a4','Peritaje'],
    ['a3','a6'], ['a4','a5'], ['a5','iv1'], ['iv1','a6'],
    ['a6','d2'], ['d2','a7','No procede'], ['d2','a8','Procede'],
    ['a7','a10'], ['a8','a9'], ['a9','iv2'], ['iv2','a10'], ['a10','e1']
  ];

  const idMap = {};
  N.forEach(t => {
    const def = SHAPE_DEFAULTS[t.type];
    const node = {
      id: 'n' + (state.nextId++), type: t.type, x: 0, y: 0, w: def.w, h: def.h,
      label: t.label, executionType: t.exec || (t.type === 'task' ? 'manual' : ''),
      gatewayType: t.gateway || undefined, eventType: t.event || undefined, marker: t.marker || '', activityCode: '',
      owner: t.owner || '', system: t.system || '',
      time: t.time != null ? String(t.time) : '', volume: t.vol != null ? String(t.vol) : '', va: t.va || '',
      sla: '', docsIn: '', docsOut: '', rules: '', notes: '', pains: (t.pains || []).map(p => ({ id: 'p' + (state.nextId++), ...p }))
    };
    idMap[t.k] = node.id;
    state.nodes.push(node);
  });
  E.forEach(([a, b, lbl]) => state.edges.push({ id: 'e' + (state.nextId++), from: idMap[a], to: idMap[b], label: lbl || '' }));

  state._kpiValues = {
    'seg-03': { name: 'Lead time de siniestro', unit: 'días', benchmark: '< 7 días (P50 mercado)', value: '12', gap: '+5 días', source: 'Core Seguros' }
  };

  ensureDecisionBranches();
  persist();
  autoLayout();
  runSimulation();
  persist();
  activateTab('copilot');
  copilotPost('ai',
    `**Proceso cargado: Gestión de Siniestros de Seguros** (BPMN avanzado).\n\n` +
    `7 actores · 14 actividades · **gateway inclusivo ○ (OR)** que abre documentación y/o peritaje en paralelo · **2 timers ⏱** (informe pericial, abono 48h) · inicio de **mensaje ✉**, fin de **error ⚡** y fin de **mensaje ✉**.\n\n` +
    `**Marcadores de actividad BPMN**: *Solicitar documentación* = ↻ loop (reenvíos), *Cotizar talleres* = ‖ multi-instancia (varios talleres), *Evaluar cobertura* = ⊞ subproceso. Estos marcadores hacen explícito el patrón de ejecución — clave para dimensionar automatización y SLA.`);
}

function loadComplexDemo5() {
  resetState();
  state.meta = { name: 'Atención Hospitalaria de Emergencia', industry: 'Salud', macroprocess: 'Atención', client: '', owner: '' };
  $('#processName').value = state.meta.name;
  $('#processIndustry').value = 'Salud';
  $('#processMacro').value = 'Atención';

  const N = [
    { k: 's',   type: 'start', label: 'Llegada del paciente', owner: 'Paciente', event: 'message' },
    { k: 'a1',  type: 'task',  label: 'Registrar admisión', owner: 'Admisión', system: 'HIS', exec: 'system', time: 6, vol: 3000, va: 'BVA' },
    { k: 'g1',  type: 'decision', label: 'Iniciar atención', owner: 'Triaje', gateway: 'parallel' },
    { k: 'a2',  type: 'task',  label: 'Clasificar en triaje', owner: 'Triaje', exec: 'manual', time: 7, vol: 3000, va: 'VA' },
    { k: 'a3',  type: 'task',  label: 'Tomar signos vitales', owner: 'Triaje', system: 'Monitor', exec: 'manual', time: 5, vol: 3000, va: 'VA' },
    { k: 'g2',  type: 'decision', label: 'Consolidar triaje', owner: 'Triaje', gateway: 'parallel' },
    { k: 'd1',  type: 'decision', label: '¿Nivel de urgencia?', owner: 'Médico de Emergencia', gateway: 'exclusive' },
    { k: 'sig', type: 'intermediate', label: 'Difundir código rojo', owner: 'Médico de Emergencia', event: 'signal', throw: true },
    { k: 'a4',  type: 'task',  label: 'Estabilizar paciente', owner: 'Médico de Emergencia', exec: 'manual', time: 40, vol: 600, va: 'VA', marker: 'subprocess',
      pains: [{ category: 'wait', description: 'Falta de camas críticas en horas pico', severity: 5, frequency: 4 }] },
    { k: 'a5',  type: 'task',  label: 'Asignar sala de espera', owner: 'Admisión', exec: 'manual', time: 3, vol: 2400, va: 'NVA' },
    { k: 'a6',  type: 'task',  label: 'Evaluar al paciente', owner: 'Médico de Emergencia', system: 'HIS', exec: 'manual', time: 18, vol: 3000, va: 'VA' },
    { k: 'a7',  type: 'task',  label: 'Solicitar exámenes', owner: 'Médico de Emergencia', system: 'LIS', exec: 'system', time: 5, vol: 2200, va: 'BVA' },
    { k: 'a8',  type: 'task',  label: 'Procesar muestras', owner: 'Laboratorio', system: 'LIS', exec: 'automatic', time: 25, vol: 2200, va: 'VA', marker: 'multiinstance' },
    { k: 'iv1', type: 'intermediate', label: 'Esperar resultados', owner: 'Laboratorio', event: 'timer' },
    { k: 'a9',  type: 'task',  label: 'Interpretar resultados', owner: 'Médico de Emergencia', exec: 'manual', time: 12, vol: 2200, va: 'VA', marker: 'loop',
      pains: [{ category: 'rework', description: 'Reevaluación por resultados incompletos o diferidos', severity: 3, frequency: 3 }] },
    { k: 'd2',  type: 'decision', label: '¿Requiere hospitalización?', owner: 'Médico de Emergencia', gateway: 'exclusive' },
    { k: 'a10', type: 'task',  label: 'Gestionar internamiento', owner: 'Admisión', system: 'HIS', exec: 'system', time: 15, vol: 700, va: 'BVA' },
    { k: 'a11', type: 'task',  label: 'Indicar tratamiento', owner: 'Médico de Emergencia', exec: 'manual', time: 8, vol: 1500, va: 'VA' },
    { k: 'a12', type: 'task',  label: 'Dispensar medicación', owner: 'Farmacia', system: 'HIS', exec: 'system', time: 6, vol: 1500, va: 'VA' },
    { k: 'eder',type: 'end',   label: 'Derivar a otro centro', owner: 'Médico de Emergencia', event: 'error' },
    { k: 'e1',  type: 'end',   label: 'Paciente dado de alta', owner: 'Paciente', event: 'message' }
  ];
  const E = [
    ['s','a1'], ['a1','g1'],
    ['g1','a2'], ['g1','a3'],
    ['a2','g2'], ['a3','g2'],
    ['g2','d1'],
    ['d1','sig','Crítico I-II'], ['d1','a5','Estándar III-V'],
    ['sig','a4'], ['a4','a6'], ['a5','a6'],
    ['a6','a7'], ['a7','a8'], ['a8','iv1'], ['iv1','a9'], ['a9','d2'],
    ['d2','a10','Sí'], ['d2','a11','No'],
    ['a10','eder'], ['a11','a12'], ['a12','e1']
  ];

  const idMap = {};
  N.forEach(t => {
    const def = SHAPE_DEFAULTS[t.type];
    const node = {
      id: 'n' + (state.nextId++), type: t.type, x: 0, y: 0, w: def.w, h: def.h,
      label: t.label, executionType: t.exec || (t.type === 'task' ? 'manual' : ''),
      gatewayType: t.gateway || undefined, eventType: t.event || undefined, throw: t.throw || undefined,
      marker: t.marker || '', activityCode: '',
      owner: t.owner || '', system: t.system || '',
      time: t.time != null ? String(t.time) : '', volume: t.vol != null ? String(t.vol) : '', va: t.va || '',
      sla: '', docsIn: '', docsOut: '', rules: '', notes: '', pains: (t.pains || []).map(p => ({ id: 'p' + (state.nextId++), ...p }))
    };
    idMap[t.k] = node.id;
    state.nodes.push(node);
  });
  E.forEach(([a, b, lbl]) => state.edges.push({ id: 'e' + (state.nextId++), from: idMap[a], to: idMap[b], label: lbl || '' }));

  state._kpiValues = {
    'hlt-01': { name: 'Tiempo de espera en emergencia', unit: 'minutos', benchmark: '< 30 min triaje', value: '52', gap: '+22 min', source: 'HIS' }
  };

  ensureDecisionBranches();
  persist();
  autoLayout();
  runSimulation();
  persist();
  activateTab('copilot');
  copilotPost('ai',
    `**Proceso cargado: Atención Hospitalaria de Emergencia** (BPMN completo).\n\n` +
    `6 actores · 16 actividades · **gateway paralelo ＋** (triaje + signos vitales en simultáneo, fork/join) · gateways exclusivos · **evento de señal ▲ (throw, relleno)** que difunde el *código rojo* a todo el equipo · timer ⏱ (esperar resultados) · inicio de **mensaje ✉**, fin de **error ⚡** (derivación) y fin de **mensaje ✉** (alta).\n\n` +
    `**Marcadores**: *Estabilizar paciente* = ⊞ subproceso, *Procesar muestras* = ‖ multi-instancia, *Interpretar resultados* = ↻ loop. El evento de señal modela un **broadcast** (1→N) — distinto del mensaje (1→1). El tiempo puerta-médico (52 min vs <30) es el cuello visible.`);
}

function loadComplexDemo6() {
  resetState();
  state.meta = { name: 'Orden de Producción a Despacho', industry: 'Manufactura', macroprocess: 'Producción', client: '', owner: '' };
  $('#processName').value = state.meta.name;
  $('#processIndustry').value = 'Manufactura';
  $('#processMacro').value = 'Producción';

  const N = [
    { k: 's',   type: 'start', label: 'Recepción de orden de compra', owner: 'Cliente', event: 'message' },
    { k: 'a1',  type: 'task',  label: 'Registrar pedido', owner: 'Comercial', system: 'ERP', exec: 'system', time: 8, vol: 900, va: 'BVA' },
    { k: 'd0',  type: 'decision', label: '¿Crédito aprobado?', owner: 'Comercial', gateway: 'exclusive' },
    { k: 'eterm',type: 'end',  label: 'Orden cancelada', owner: 'Comercial', terminate: true },
    { k: 'd1',  type: 'decision', label: '¿Hay stock disponible?', owner: 'Planificación', gateway: 'exclusive' },
    { k: 'a2',  type: 'task',  label: 'Reservar inventario', owner: 'Almacén', system: 'WMS', exec: 'system', time: 6, vol: 350, va: 'VA' },
    { k: 'a3',  type: 'task',  label: 'Planificar producción', owner: 'Planificación', system: 'MRP', exec: 'system', time: 25, vol: 550, va: 'VA' },
    { k: 'g1',  type: 'decision', label: 'Lanzar aprovisionamiento', owner: 'Planificación', gateway: 'parallel' },
    { k: 'a4',  type: 'task',  label: 'Comprar insumos', owner: 'Almacén', exec: 'email', time: 12, vol: 550, va: 'BVA' },
    { k: 'iv1', type: 'intermediate', label: 'Esperar materiales', owner: 'Almacén', event: 'timer' },
    { k: 'a5',  type: 'task',  label: 'Recepcionar materiales', owner: 'Almacén', system: 'WMS', exec: 'system', time: 10, vol: 550, va: 'BVA' },
    { k: 'a6',  type: 'task',  label: 'Preparar línea', owner: 'Producción', exec: 'manual', time: 40, vol: 550, va: 'BVA',
      pains: [{ category: 'wait', description: 'Setup largo por cambios de formato (SMED no aplicado)', severity: 4, frequency: 4 }] },
    { k: 'g2',  type: 'decision', label: 'Sincronizar producción', owner: 'Producción', gateway: 'parallel' },
    { k: 'a7',  type: 'task',  label: 'Fabricar lote', owner: 'Producción', exec: 'manual', time: 120, vol: 550, va: 'VA', marker: 'subprocess' },
    { k: 'a8',  type: 'task',  label: 'Inspeccionar calidad', owner: 'Calidad', exec: 'manual', time: 18, vol: 550, va: 'BVA', marker: 'multiinstance' },
    { k: 'd2',  type: 'decision', label: '¿Lote conforme?', owner: 'Calidad', gateway: 'exclusive' },
    { k: 'a9',  type: 'task',  label: 'Reprocesar lote', owner: 'Producción', exec: 'manual', time: 35, vol: 70, va: 'NVA', marker: 'loop',
      pains: [{ category: 'rework', description: 'Reprocesos por defectos de calibración', severity: 3, frequency: 3 }] },
    { k: 'a10', type: 'task',  label: 'Empacar producto', owner: 'Producción', system: 'MES', exec: 'system', time: 15, vol: 550, va: 'VA' },
    { k: 'a11', type: 'task',  label: 'Despachar pedido', owner: 'Despacho', system: 'WMS', exec: 'system', time: 12, vol: 900, va: 'VA' },
    { k: 'e1',  type: 'end',   label: 'Pedido entregado', owner: 'Cliente', event: 'message' }
  ];
  const E = [
    ['s','a1'], ['a1','d0'],
    ['d0','d1','Sí'], ['d0','eterm','No'],
    ['d1','a2','Sí'], ['d1','a3','No'],
    ['a3','g1'], ['g1','a4'], ['g1','a6'],
    ['a4','iv1'], ['iv1','a5'], ['a5','g2'], ['a6','g2'],
    ['g2','a7'], ['a7','a8'], ['a8','d2'],
    ['d2','a10','Conforme'], ['d2','a9','No conforme'],
    ['a9','a10'], ['a10','a11'], ['a2','a11'], ['a11','e1']
  ];

  const idMap = {};
  N.forEach(t => {
    const def = SHAPE_DEFAULTS[t.type];
    const node = {
      id: 'n' + (state.nextId++), type: t.type, x: 0, y: 0, w: def.w, h: def.h,
      label: t.label, executionType: t.exec || (t.type === 'task' ? 'manual' : ''),
      gatewayType: t.gateway || undefined, eventType: t.event || undefined, throw: t.throw || undefined,
      terminate: t.terminate || undefined, marker: t.marker || '', activityCode: '',
      owner: t.owner || '', system: t.system || '',
      time: t.time != null ? String(t.time) : '', volume: t.vol != null ? String(t.vol) : '', va: t.va || '',
      sla: '', docsIn: '', docsOut: '', rules: '', notes: '', pains: (t.pains || []).map(p => ({ id: 'p' + (state.nextId++), ...p }))
    };
    idMap[t.k] = node.id;
    state.nodes.push(node);
  });
  E.forEach(([a, b, lbl]) => state.edges.push({ id: 'e' + (state.nextId++), from: idMap[a], to: idMap[b], label: lbl || '' }));

  ensureDecisionBranches();
  persist();
  autoLayout();
  runSimulation();
  persist();
  activateTab('copilot');
  copilotPost('ai',
    `**Proceso cargado: Orden de Producción a Despacho** (Manufactura — BPMN completo).\n\n` +
    `7 actores · 15 actividades · **gateway paralelo ＋** (compra de insumos ∥ preparación de línea, fork/join) · gateways exclusivos (crédito, stock, calidad) · **evento de terminación ⬤** (*Orden cancelada* — corta toda la instancia, distinto de un fin normal) · timer ⏱ (esperar materiales) · inicio y fin de **mensaje ✉**.\n\n` +
    `**Marcadores**: *Fabricar lote* = ⊞ subproceso, *Inspeccionar calidad* = ‖ multi-instancia, *Reprocesar lote* = ↻ loop. El **make-to-stock** (hay stock → despacho directo) y **make-to-order** (sin stock → planificar + producir) conviven como dos rutas que convergen en *Despachar*.`);
}

function loadComplexDemo7() {
  resetState();
  state.meta = { name: 'Gestión de Avería Telecom (T2R)', industry: 'Telecomunicaciones', macroprocess: 'Servicio', client: '', owner: '' };
  $('#processName').value = state.meta.name;
  $('#processIndustry').value = 'Telecomunicaciones';
  $('#processMacro').value = 'Servicio';

  const N = [
    { k: 's',   type: 'start', label: 'Reporte de avería', owner: 'Cliente', event: 'message' },
    { k: 'a1',  type: 'task',  label: 'Registrar ticket', owner: 'Mesa de Ayuda', system: 'CRM', exec: 'system', time: 5, vol: 4000, va: 'BVA' },
    { k: 'a2',  type: 'task',  label: 'Diagnosticar remoto', owner: 'Mesa de Ayuda', system: 'NMS', exec: 'manual', time: 12, vol: 4000, va: 'VA' },
    { k: 'd1',  type: 'decision', label: '¿Resuelto en L1?', owner: 'Mesa de Ayuda', gateway: 'exclusive' },
    { k: 'a3',  type: 'task',  label: 'Escalar a soporte L2', owner: 'Soporte L2', system: 'CRM', exec: 'system', time: 4, vol: 2200, va: 'BVA' },
    { k: 'd2',  type: 'decision', label: '¿Requiere visita técnica?', owner: 'Soporte L2', gateway: 'exclusive' },
    { k: 'a4',  type: 'task',  label: 'Resolver remoto', owner: 'Soporte L2', system: 'NMS', exec: 'manual', time: 25, vol: 1200, va: 'VA' },
    { k: 'a5',  type: 'task',  label: 'Despachar cuadrilla', owner: 'Soporte L2', exec: 'email', time: 6, vol: 1000, va: 'BVA' },
    { k: 'iv1', type: 'intermediate', label: 'Esperar ventana SLA', owner: 'Cuadrilla de Campo', event: 'timer' },
    { k: 'a6',  type: 'task',  label: 'Atender en sitio', owner: 'Cuadrilla de Campo', exec: 'manual', time: 90, vol: 1000, va: 'VA', marker: 'subprocess',
      pains: [{ category: 'wait', description: 'Tiempos de traslado largos en zonas alejadas', severity: 4, frequency: 5 }] },
    { k: 'a7',  type: 'task',  label: 'Reemplazar equipo', owner: 'Cuadrilla de Campo', system: 'Inventario', exec: 'manual', time: 30, vol: 600, va: 'VA', marker: 'multiinstance' },
    { k: 'a8',  type: 'task',  label: 'Validar restablecimiento', owner: 'Soporte L2', system: 'NMS', exec: 'manual', time: 10, vol: 1000, va: 'BVA', marker: 'loop',
      pains: [{ category: 'rework', description: 'Reintentos por restablecimiento parcial del servicio', severity: 3, frequency: 3 }] },
    { k: 'a9',  type: 'task',  label: 'Confirmar con cliente', owner: 'Mesa de Ayuda', exec: 'email', time: 5, vol: 4000, va: 'VA' },
    { k: 'd3',  type: 'decision', label: '¿Cliente conforme?', owner: 'Mesa de Ayuda', gateway: 'exclusive' },
    { k: 'ereop',type: 'end',   label: 'Reapertura del ticket', owner: 'Mesa de Ayuda', event: 'error' },
    { k: 'a10', type: 'task',  label: 'Cerrar ticket', owner: 'Mesa de Ayuda', system: 'CRM', exec: 'system', time: 4, vol: 4000, va: 'VA' },
    { k: 'a11', type: 'task',  label: 'Aplicar créditos SLA', owner: 'Facturación', system: 'ERP', exec: 'automatic', time: 6, vol: 800, va: 'BVA' },
    { k: 'e1',  type: 'end',   label: 'Avería resuelta', owner: 'Cliente', event: 'message' }
  ];
  const E = [
    ['s','a1'], ['a1','a2'], ['a2','d1'],
    ['d1','a10','Sí'], ['d1','a3','No'],
    ['a3','d2'],
    ['d2','a4','No'], ['d2','a5','Sí'],
    ['a4','a9'],
    ['a5','iv1'], ['iv1','a6'], ['a6','a7'], ['a7','a8'], ['a8','a9'],
    ['a9','d3'],
    ['d3','a10','Sí'], ['d3','ereop','No'],
    ['a10','a11'], ['a11','e1']
  ];

  const idMap = {};
  N.forEach(t => {
    const def = SHAPE_DEFAULTS[t.type];
    const node = {
      id: 'n' + (state.nextId++), type: t.type, x: 0, y: 0, w: def.w, h: def.h,
      label: t.label, executionType: t.exec || (t.type === 'task' ? 'manual' : ''),
      gatewayType: t.gateway || undefined, eventType: t.event || undefined, throw: t.throw || undefined,
      terminate: t.terminate || undefined, marker: t.marker || '', activityCode: '',
      owner: t.owner || '', system: t.system || '',
      time: t.time != null ? String(t.time) : '', volume: t.vol != null ? String(t.vol) : '', va: t.va || '',
      sla: '', docsIn: '', docsOut: '', rules: '', notes: '', pains: (t.pains || []).map(p => ({ id: 'p' + (state.nextId++), ...p }))
    };
    idMap[t.k] = node.id;
    state.nodes.push(node);
  });
  E.forEach(([a, b, lbl]) => state.edges.push({ id: 'e' + (state.nextId++), from: idMap[a], to: idMap[b], label: lbl || '' }));

  state._kpiValues = {
    'tel-01': { name: 'MTTR (tiempo medio de reparación)', unit: 'horas', benchmark: '< 8 h (avería masiva < 4 h)', value: '14', gap: '+6 h', source: 'CRM/NMS' }
  };

  ensureDecisionBranches();
  persist();
  autoLayout();
  runSimulation();
  persist();
  activateTab('copilot');
  copilotPost('ai',
    `**Proceso cargado: Gestión de Avería Telecom (Trouble-to-Resolve)** (BPMN completo).\n\n` +
    `5 actores · 14 actividades · escalamiento **L1 → L2 → campo** con gateways exclusivos (¿resuelto en L1? ¿requiere visita? ¿cliente conforme?) · timer ⏱ (ventana SLA) · inicio de **mensaje ✉**, fin de **error ⚡** (reapertura) y fin de **mensaje ✉** (resuelta).\n\n` +
    `**Marcadores**: *Atender en sitio* = ⊞ subproceso, *Reemplazar equipo* = ‖ multi-instancia, *Validar restablecimiento* = ↻ loop. El **MTTR (14 h vs <8 h)** y el traslado a zonas alejadas son los cuellos visibles. Todos estos elementos ahora también se **exportan a PPTX** con su iconografía BPMN.`);
}

function loadComplexDemo8() {
  resetState();
  state.meta = { name: 'Licencia de Funcionamiento Municipal', industry: 'Sector Público', macroprocess: 'Trámites', client: '', owner: '' };
  $('#processName').value = state.meta.name;
  $('#processIndustry').value = 'Sector Público';
  $('#processMacro').value = 'Trámites';

  const N = [
    { k: 's',   type: 'start', label: 'Solicitud de licencia', owner: 'Ciudadano', event: 'message' },
    { k: 'a1',  type: 'task',  label: 'Recibir expediente', owner: 'Mesa de Partes', system: 'SGD', exec: 'system', time: 8, vol: 2000, va: 'BVA' },
    { k: 'a2',  type: 'task',  label: 'Verificar pago de tasa', owner: 'Caja', system: 'SIAF', exec: 'system', time: 5, vol: 2000, va: 'BVA' },
    { k: 'd1',  type: 'decision', label: '¿Expediente completo?', owner: 'Mesa de Partes', gateway: 'exclusive' },
    { k: 'eobs', type: 'end',  label: 'Expediente observado', owner: 'Mesa de Partes', event: 'error' },
    { k: 'a3',  type: 'task',  label: 'Evaluar requisitos', owner: 'Evaluación Técnica', exec: 'manual', time: 30, vol: 1700, va: 'VA' },
    { k: 'd2',  type: 'decision', label: '¿Requiere ITSE?', owner: 'Evaluación Técnica', gateway: 'exclusive' },
    { k: 'a4',  type: 'task',  label: 'Programar inspección', owner: 'Inspección ITSE', exec: 'email', time: 10, vol: 900, va: 'BVA' },
    { k: 'iv1', type: 'intermediate', label: 'Plazo legal (TUPA)', owner: 'Inspección ITSE', event: 'timer' },
    { k: 'a5',  type: 'task',  label: 'Inspeccionar local', owner: 'Inspección ITSE', exec: 'manual', time: 60, vol: 900, va: 'VA', marker: 'subprocess',
      pains: [{ category: 'wait', description: 'Agenda de inspectores saturada — excede plazo TUPA', severity: 5, frequency: 4 }] },
    { k: 'a6',  type: 'task',  label: 'Consolidar evaluación', owner: 'Evaluación Técnica', system: 'SGD', exec: 'manual', time: 15, vol: 1700, va: 'BVA' },
    { k: 'a7',  type: 'task',  label: 'Proyectar resolución', owner: 'Gerencia', exec: 'manual', time: 25, vol: 1700, va: 'BVA', marker: 'loop',
      pains: [{ category: 'control', description: 'Múltiples revisiones legales del proyecto de resolución', severity: 3, frequency: 4 }] },
    { k: 'd3',  type: 'decision', label: '¿Procede la licencia?', owner: 'Gerencia', gateway: 'exclusive' },
    { k: 'erej', type: 'end',  label: 'Licencia denegada', owner: 'Gerencia', event: 'error' },
    { k: 'a8',  type: 'task',  label: 'Emitir resolución', owner: 'Gerencia', system: 'SGD', exec: 'system', time: 6, vol: 1500, va: 'VA' },
    { k: 'a9',  type: 'task',  label: 'Notificar al ciudadano', owner: 'Mesa de Partes', exec: 'email', time: 5, vol: 1500, va: 'VA' },
    { k: 'e1',  type: 'end',   label: 'Licencia otorgada', owner: 'Ciudadano', event: 'message' }
  ];
  const E = [
    ['s','a1'], ['a1','a2'], ['a2','d1'],
    ['d1','a3','Sí'], ['d1','eobs','No'],
    ['a3','d2'],
    ['d2','a4','Sí'], ['d2','a6','No'],
    ['a4','iv1'], ['iv1','a5'], ['a5','a6'],
    ['a6','a7'], ['a7','d3'],
    ['d3','a8','Sí'], ['d3','erej','No'],
    ['a8','a9'], ['a9','e1']
  ];

  const idMap = {};
  N.forEach(t => {
    const def = SHAPE_DEFAULTS[t.type];
    const node = {
      id: 'n' + (state.nextId++), type: t.type, x: 0, y: 0, w: def.w, h: def.h,
      label: t.label, executionType: t.exec || (t.type === 'task' ? 'manual' : ''),
      gatewayType: t.gateway || undefined, eventType: t.event || undefined, throw: t.throw || undefined,
      terminate: t.terminate || undefined, marker: t.marker || '', activityCode: '',
      owner: t.owner || '', system: t.system || '',
      time: t.time != null ? String(t.time) : '', volume: t.vol != null ? String(t.vol) : '', va: t.va || '',
      sla: '', docsIn: '', docsOut: '', rules: '', notes: '', pains: (t.pains || []).map(p => ({ id: 'p' + (state.nextId++), ...p }))
    };
    idMap[t.k] = node.id;
    state.nodes.push(node);
  });
  E.forEach(([a, b, lbl]) => state.edges.push({ id: 'e' + (state.nextId++), from: idMap[a], to: idMap[b], label: lbl || '' }));

  state._kpiValues = {
    'gov-01': { name: 'Tiempo medio de resolución de trámite', unit: 'días hábiles', benchmark: 'según TUPA (15 d)', value: '38', gap: '+23 días', source: 'SGD' }
  };

  ensureDecisionBranches();
  persist();
  autoLayout();
  runSimulation();
  persist();
  activateTab('copilot');
  copilotPost('ai',
    `**Proceso cargado: Licencia de Funcionamiento Municipal** (Sector Público — BPMN completo).\n\n` +
    `6 actores · 13 actividades · gateways exclusivos (¿expediente completo? ¿requiere ITSE? ¿procede?) · **timer ⏱ del plazo legal TUPA** (la inspección que lo excede es el cuello: silencio administrativo) · inicio de **mensaje ✉**, dos fines de **error ⚡** (expediente observado, licencia denegada) y fin de **mensaje ✉** (otorgada).\n\n` +
    `**Marcadores**: *Inspeccionar local* = ⊞ subproceso, *Proyectar resolución* = ↻ loop. El **tiempo de resolución (38 días vs 15 TUPA)** evidencia el incumplimiento del plazo. El export a PPTX incluye además una **slide de leyenda BPMN** para que el cliente lea la nomenclatura.`);
}

function loadComplexDemo9() {
  resetState();
  state.meta = { name: 'Conexión de Nuevo Suministro Eléctrico', industry: 'Utilities', macroprocess: 'Atención', client: '', owner: '' };
  $('#processName').value = state.meta.name;
  $('#processIndustry').value = 'Utilities';
  $('#processMacro').value = 'Atención';

  const N = [
    { k: 's',   type: 'start', label: 'Solicitud de suministro', owner: 'Cliente', event: 'message' },
    { k: 'a1',  type: 'task',  label: 'Registrar solicitud', owner: 'Atención Comercial', system: 'Comercial', exec: 'system', time: 8, vol: 1500, va: 'BVA' },
    { k: 'a2',  type: 'task',  label: 'Verificar concesión', owner: 'Factibilidad Técnica', system: 'GIS', exec: 'system', time: 10, vol: 1500, va: 'VA' },
    { k: 'd1',  type: 'decision', label: '¿Factible técnicamente?', owner: 'Factibilidad Técnica', gateway: 'exclusive' },
    { k: 'erej', type: 'end',  label: 'Solicitud no factible', owner: 'Factibilidad Técnica', event: 'error' },
    { k: 'a3',  type: 'task',  label: 'Elaborar presupuesto', owner: 'Factibilidad Técnica', exec: 'manual', time: 25, vol: 1300, va: 'VA' },
    { k: 'a4',  type: 'task',  label: 'Comunicar presupuesto', owner: 'Atención Comercial', exec: 'email', time: 5, vol: 1300, va: 'BVA' },
    { k: 'iv1', type: 'intermediate', label: 'Esperar pago del cliente', owner: 'Cliente', event: 'timer' },
    { k: 'd2',  type: 'decision', label: '¿Pagó el presupuesto?', owner: 'Atención Comercial', gateway: 'exclusive' },
    { k: 'earch', type: 'end',  label: 'Solicitud archivada', owner: 'Atención Comercial', terminate: true },
    { k: 'g1',  type: 'decision', label: 'Ejecutar conexión', owner: 'Cuadrilla de Obras', gateway: 'parallel' },
    { k: 'a5',  type: 'task',  label: 'Ejecutar obra de conexión', owner: 'Cuadrilla de Obras', exec: 'manual', time: 240, vol: 1100, va: 'VA', marker: 'subprocess',
      pains: [{ category: 'wait', description: 'Demoras por permisos de vía pública y clima', severity: 4, frequency: 4 }] },
    { k: 'a6',  type: 'task',  label: 'Actualizar catastro', owner: 'Catastro GIS', system: 'GIS', exec: 'system', time: 15, vol: 1100, va: 'BVA' },
    { k: 'g2',  type: 'decision', label: 'Consolidar conexión', owner: 'Cuadrilla de Obras', gateway: 'parallel' },
    { k: 'a7',  type: 'task',  label: 'Instalar medidor', owner: 'Cuadrilla de Obras', exec: 'manual', time: 30, vol: 1100, va: 'VA' },
    { k: 'a8',  type: 'task',  label: 'Inspeccionar instalación', owner: 'Factibilidad Técnica', exec: 'manual', time: 20, vol: 1100, va: 'BVA', marker: 'loop',
      pains: [{ category: 'rework', description: 'Reinspecciones por observaciones de seguridad', severity: 3, frequency: 3 }] },
    { k: 'a9',  type: 'task',  label: 'Activar suministro', owner: 'Atención Comercial', system: 'Comercial', exec: 'system', time: 6, vol: 1100, va: 'VA' },
    { k: 'a10', type: 'task',  label: 'Crear cuenta de facturación', owner: 'Facturación', system: 'ERP', exec: 'automatic', time: 5, vol: 1100, va: 'BVA' },
    { k: 'e1',  type: 'end',   label: 'Suministro energizado', owner: 'Cliente', event: 'message' }
  ];
  const E = [
    ['s','a1'], ['a1','a2'], ['a2','d1'],
    ['d1','a3','Sí'], ['d1','erej','No'],
    ['a3','a4'], ['a4','iv1'], ['iv1','d2'],
    ['d2','g1','Sí'], ['d2','earch','No'],
    ['g1','a5'], ['g1','a6'], ['a5','g2'], ['a6','g2'],
    ['g2','a7'], ['a7','a8'], ['a8','a9'], ['a9','a10'], ['a10','e1']
  ];

  const idMap = {};
  N.forEach(t => {
    const def = SHAPE_DEFAULTS[t.type];
    const node = {
      id: 'n' + (state.nextId++), type: t.type, x: 0, y: 0, w: def.w, h: def.h,
      label: t.label, executionType: t.exec || (t.type === 'task' ? 'manual' : ''),
      gatewayType: t.gateway || undefined, eventType: t.event || undefined, throw: t.throw || undefined,
      terminate: t.terminate || undefined, marker: t.marker || '', activityCode: '',
      owner: t.owner || '', system: t.system || '',
      time: t.time != null ? String(t.time) : '', volume: t.vol != null ? String(t.vol) : '', va: t.va || '',
      sla: '', docsIn: '', docsOut: '', rules: '', notes: '', pains: (t.pains || []).map(p => ({ id: 'p' + (state.nextId++), ...p }))
    };
    idMap[t.k] = node.id;
    state.nodes.push(node);
  });
  E.forEach(([a, b, lbl]) => state.edges.push({ id: 'e' + (state.nextId++), from: idMap[a], to: idMap[b], label: lbl || '' }));

  state._kpiValues = {
    'utl-05': { name: 'Tiempo de conexión nuevo suministro', unit: 'días', benchmark: '< 7 días', value: '18', gap: '+11 días', source: 'Sistema Comercial' }
  };

  ensureDecisionBranches();
  persist();
  autoLayout();
  runSimulation();
  persist();
  activateTab('copilot');
  copilotPost('ai',
    `**Proceso cargado: Conexión de Nuevo Suministro Eléctrico** (Utilities — BPMN completo).\n\n` +
    `6 actores · 14 actividades · **gateway paralelo ＋** (obra de conexión ∥ actualización de catastro GIS, fork/join) · gateways exclusivos (factibilidad, pago) · timer ⏱ (esperar pago del cliente) · **evento de terminación ⬤** (*Solicitud archivada* si no paga) · inicio de **mensaje ✉**, fin de **error ⚡** (no factible) y fin de **mensaje ✉** (energizado).\n\n` +
    `**Marcadores**: *Ejecutar obra de conexión* = ⊞ subproceso, *Inspeccionar instalación* = ↻ loop. El **tiempo de conexión (18 días vs <7)** triplica el benchmark OSINERGMIN — la obra de conexión y sus permisos son el cuello. Abre la **Leyenda BPMN** (botón sobre el lienzo) para ver toda la nomenclatura.`);
}

function loadComplexDemo10() {
  resetState();
  state.meta = { name: 'Procure-to-Pay (P2P)', industry: 'Transversal', macroprocess: 'P2P', client: '', owner: '' };
  $('#processName').value = state.meta.name;
  $('#processIndustry').value = 'Transversal';
  $('#processMacro').value = 'P2P';

  const N = [
    { k: 's',   type: 'start', label: 'Necesidad de compra', owner: 'Solicitante', event: 'message' },
    { k: 'a1',  type: 'task',  label: 'Crear requisición', owner: 'Solicitante', system: 'ERP', exec: 'system', time: 10, vol: 2400, va: 'BVA' },
    { k: 'd1',  type: 'decision', label: '¿Supera el umbral?', owner: 'Compras', gateway: 'exclusive' },
    { k: 'a2',  type: 'task',  label: 'Aprobar requisición', owner: 'Aprobador', exec: 'manual', time: 20, vol: 900, va: 'BVA',
      pains: [{ category: 'wait', description: 'Aprobaciones detenidas por gerentes fuera de oficina', severity: 4, frequency: 4 }] },
    { k: 'a3',  type: 'task',  label: 'Generar orden de compra', owner: 'Compras', system: 'ERP', exec: 'system', time: 12, vol: 2400, va: 'VA' },
    { k: 'a4',  type: 'task',  label: 'Enviar OC al proveedor', owner: 'Compras', exec: 'email', time: 4, vol: 2400, va: 'BVA' },
    { k: 'iv1', type: 'intermediate', label: 'Esperar entrega', owner: 'Proveedor', event: 'timer' },
    { k: 'a5',  type: 'task',  label: 'Despachar mercadería', owner: 'Proveedor', exec: 'manual', time: 30, vol: 2400, va: 'VA' },
    { k: 'a6',  type: 'task',  label: 'Recepcionar mercadería', owner: 'Almacén', system: 'WMS', exec: 'manual', time: 18, vol: 2400, va: 'BVA' },
    { k: 'd2',  type: 'decision', label: '¿Recepción conforme?', owner: 'Almacén', gateway: 'exclusive' },
    { k: 'a7',  type: 'task',  label: 'Devolver al proveedor', owner: 'Almacén', exec: 'email', time: 15, vol: 200, va: 'NVA', marker: 'loop' },
    { k: 'erech', type: 'end', label: 'Recepción rechazada', owner: 'Almacén', event: 'error' },
    { k: 'a8',  type: 'task',  label: 'Validar factura', owner: 'Cuentas por Pagar', system: 'ERP', exec: 'manual', time: 22, vol: 2200, va: 'VA', marker: 'subprocess',
      pains: [{ category: 'rework', description: 'Discrepancias OC / recepción / factura (3-way match manual)', severity: 5, frequency: 4 }] },
    { k: 'd3',  type: 'decision', label: '¿Match correcto?', owner: 'Cuentas por Pagar', gateway: 'exclusive' },
    { k: 'edisp', type: 'end', label: 'Factura en disputa', owner: 'Cuentas por Pagar', event: 'error' },
    { k: 'a9',  type: 'task',  label: 'Contabilizar factura', owner: 'Cuentas por Pagar', system: 'ERP', exec: 'system', time: 8, vol: 2000, va: 'BVA' },
    { k: 'a10', type: 'task',  label: 'Programar pago', owner: 'Tesorería', system: 'ERP', exec: 'system', time: 6, vol: 2000, va: 'VA' },
    { k: 'a11', type: 'task',  label: 'Ejecutar pago', owner: 'Tesorería', system: 'Banca', exec: 'automatic', time: 4, vol: 2000, va: 'VA' },
    { k: 'e1',  type: 'end',   label: 'Pago realizado', owner: 'Proveedor', event: 'message' }
  ];
  const E = [
    ['s','a1'], ['a1','d1'],
    ['d1','a2','Sí'], ['d1','a3','No'],
    ['a2','a3'], ['a3','a4'], ['a4','iv1'], ['iv1','a5'], ['a5','a6'], ['a6','d2'],
    ['d2','a8','Sí'], ['d2','a7','No'],
    ['a7','erech'],
    ['a8','d3'],
    ['d3','a9','Sí'], ['d3','edisp','No'],
    ['a9','a10'], ['a10','a11'], ['a11','e1']
  ];

  const idMap = {};
  N.forEach(t => {
    const def = SHAPE_DEFAULTS[t.type];
    const node = {
      id: 'n' + (state.nextId++), type: t.type, x: 0, y: 0, w: def.w, h: def.h,
      label: t.label, executionType: t.exec || (t.type === 'task' ? 'manual' : ''),
      gatewayType: t.gateway || undefined, eventType: t.event || undefined, throw: t.throw || undefined,
      terminate: t.terminate || undefined, marker: t.marker || '', activityCode: '',
      owner: t.owner || '', system: t.system || '',
      time: t.time != null ? String(t.time) : '', volume: t.vol != null ? String(t.vol) : '', va: t.va || '',
      sla: '', docsIn: '', docsOut: '', rules: '', notes: '', pains: (t.pains || []).map(p => ({ id: 'p' + (state.nextId++), ...p }))
    };
    idMap[t.k] = node.id;
    state.nodes.push(node);
  });
  E.forEach(([a, b, lbl]) => state.edges.push({ id: 'e' + (state.nextId++), from: idMap[a], to: idMap[b], label: lbl || '' }));

  state._kpiValues = {
    'tx-p2p-01': { name: 'Cycle time P2P (req → pago)', unit: 'días', benchmark: '< 10 días (best-in-class)', value: '21', gap: '+11 días', source: 'ERP' }
  };

  ensureDecisionBranches();
  persist();
  autoLayout();
  runSimulation();
  persist();
  activateTab('copilot');
  copilotPost('ai',
    `**Proceso cargado: Procure-to-Pay (P2P)** (Transversal — BPMN completo).\n\n` +
    `7 actores · 15 actividades · gateways exclusivos (umbral de aprobación, recepción conforme, 3-way match) · timer ⏱ (esperar entrega del proveedor) · inicio de **mensaje ✉**, **dos fines de error ⚡** (recepción rechazada, factura en disputa) y fin de **mensaje ✉** (pago realizado).\n\n` +
    `**Marcadores**: *Validar factura* = ⊞ subproceso (el **3-way match** OC/recepción/factura) y *Devolver al proveedor* = ↻ loop. El **cycle time P2P (21 días vs <10)** y el match manual son los cuellos. Proceso clásico **transversal** que cruza Solicitante → Compras → Aprobador → Proveedor → Almacén → Cuentas por Pagar → Tesorería.`);
}

function loadComplexDemo11() {
  resetState();
  state.meta = { name: 'Originación de Crédito Comercial PYME', industry: 'Banca', macroprocess: 'Riesgos', client: '', owner: '' };
  $('#processName').value = state.meta.name;
  $('#processIndustry').value = 'Banca';
  $('#processMacro').value = 'Riesgos';

  const N = [
    { k: 's',   type: 'start', label: 'Solicitud de crédito', owner: 'Cliente', event: 'message' },
    { k: 'a1',  type: 'task',  label: 'Registrar solicitud', owner: 'Ejecutivo Comercial', system: 'CRM', exec: 'system', time: 10, vol: 1800, va: 'BVA' },
    { k: 'doc1',type: 'document', label: 'Expediente del cliente', owner: 'Ejecutivo Comercial' },
    { k: 'd0',  type: 'decision', label: '¿Cliente continúa?', owner: 'Ejecutivo Comercial', gateway: 'exclusive' },
    { k: 'eterm',type: 'end',  label: 'Solicitud cancelada', owner: 'Ejecutivo Comercial', terminate: true },
    { k: 'a2',  type: 'task',  label: 'Validar documentación', owner: 'Plataforma Digital', system: 'BPM', exec: 'system', time: 8, vol: 1700, va: 'VA' },
    { k: 'd1',  type: 'decision', label: '¿Documentación completa?', owner: 'Plataforma Digital', gateway: 'exclusive' },
    { k: 'a3',  type: 'task',  label: 'Subsanar documentación', owner: 'Cliente', exec: 'email', time: 20, vol: 500, va: 'NVA', marker: 'loop',
      pains: [{ category: 'rework', description: 'Reenvíos por documentación incompleta', severity: 4, frequency: 4 }] },
    { k: 'g1',  type: 'decision', label: 'Iniciar evaluación', owner: 'Análisis de Crédito', gateway: 'parallel' },
    { k: 'a4',  type: 'task',  label: 'Evaluar capacidad de pago', owner: 'Análisis de Crédito', exec: 'manual', time: 35, vol: 1500, va: 'VA', marker: 'subprocess' },
    { k: 'a5',  type: 'task',  label: 'Consultar centrales de riesgo', owner: 'Riesgos', system: 'SBS/Infocorp', exec: 'automatic', time: 6, vol: 1500, va: 'VA' },
    { k: 'data1',type: 'data', label: 'Score crediticio', owner: 'Riesgos' },
    { k: 'g2',  type: 'decision', label: 'Consolidar evaluación', owner: 'Análisis de Crédito', gateway: 'parallel' },
    { k: 'd2',  type: 'decision', label: '¿Validaciones adicionales?', owner: 'Análisis de Crédito', gateway: 'inclusive' },
    { k: 'a6',  type: 'task',  label: 'Tasar garantías', owner: 'Riesgos', exec: 'manual', time: 40, vol: 900, va: 'VA', marker: 'multiinstance',
      pains: [{ category: 'wait', description: 'Disponibilidad de peritos tasadores', severity: 3, frequency: 3 }] },
    { k: 'a7',  type: 'task',  label: 'Revisar contratos', owner: 'Legal', exec: 'manual', time: 25, vol: 700, va: 'BVA' },
    { k: 'a8',  type: 'task',  label: 'Consolidar propuesta', owner: 'Análisis de Crédito', exec: 'manual', time: 18, vol: 1500, va: 'VA' },
    { k: 'd3',  type: 'decision', label: '¿Supera umbral del comité?', owner: 'Análisis de Crédito', gateway: 'exclusive' },
    { k: 'a9',  type: 'task',  label: 'Presentar a comité', owner: 'Comité de Crédito', exec: 'manual', time: 30, vol: 600, va: 'BVA',
      pains: [{ category: 'wait', description: 'Comité sesiona solo 2 veces por semana', severity: 4, frequency: 5 }] },
    { k: 'iv1', type: 'intermediate', label: 'Esperar sesión de comité', owner: 'Comité de Crédito', event: 'timer' },
    { k: 'd4',  type: 'decision', label: '¿Crédito aprobado?', owner: 'Comité de Crédito', gateway: 'exclusive' },
    { k: 'erej',type: 'end',   label: 'Crédito denegado', owner: 'Comité de Crédito', event: 'error' },
    { k: 'a10', type: 'task',  label: 'Formalizar contrato', owner: 'Legal', exec: 'manual', time: 22, vol: 1100, va: 'VA' },
    { k: 'sig', type: 'intermediate', label: 'Difundir aprobación', owner: 'Ejecutivo Comercial', event: 'signal', throw: true },
    { k: 'a11', type: 'task',  label: 'Constituir garantías', owner: 'Operaciones', system: 'Core', exec: 'system', time: 15, vol: 1100, va: 'BVA' },
    { k: 'a12', type: 'task',  label: 'Desembolsar crédito', owner: 'Tesorería', system: 'Core', exec: 'automatic', time: 5, vol: 1100, va: 'VA' },
    { k: 'e1',  type: 'end',   label: 'Crédito desembolsado', owner: 'Cliente', event: 'message' }
  ];
  const E = [
    ['s','a1'], ['a1','doc1'], ['doc1','d0'],
    ['d0','a2','Sí'], ['d0','eterm','No'],
    ['a2','d1'],
    ['d1','g1','Sí'], ['d1','a3','No'], ['a3','a2'],
    ['g1','a4'], ['g1','a5'], ['a5','data1'], ['data1','g2'], ['a4','g2'],
    ['g2','d2'],
    ['d2','a6','Garantías'], ['d2','a7','Legal'],
    ['a6','a8'], ['a7','a8'],
    ['a8','d3'],
    ['d3','a9','Sí'], ['d3','d4','No'],
    ['a9','iv1'], ['iv1','d4'],
    ['d4','a10','Sí'], ['d4','erej','No'],
    ['a10','sig'], ['sig','a11'], ['a11','a12'], ['a12','e1']
  ];

  const idMap = {};
  N.forEach(t => {
    const def = SHAPE_DEFAULTS[t.type];
    const node = {
      id: 'n' + (state.nextId++), type: t.type, x: 0, y: 0, w: def.w, h: def.h,
      label: t.label, executionType: t.exec || (t.type === 'task' ? 'manual' : ''),
      gatewayType: t.gateway || undefined, eventType: t.event || undefined, throw: t.throw || undefined,
      terminate: t.terminate || undefined, marker: t.marker || '', activityCode: '',
      owner: t.owner || '', system: t.system || '',
      time: t.time != null ? String(t.time) : '', volume: t.vol != null ? String(t.vol) : '', va: t.va || '',
      sla: '', docsIn: '', docsOut: '', rules: '', notes: '', pains: (t.pains || []).map(p => ({ id: 'p' + (state.nextId++), ...p }))
    };
    idMap[t.k] = node.id;
    state.nodes.push(node);
  });
  E.forEach(([a, b, lbl]) => state.edges.push({ id: 'e' + (state.nextId++), from: idMap[a], to: idMap[b], label: lbl || '' }));

  state._kpiValues = {
    'per-sbs-01': { name: 'Ratio de morosidad (SBS)', unit: '%', benchmark: '< 4% sistema PE', value: '6.2', gap: '+2.2 pp', source: 'Core / SBS' }
  };

  ensureDecisionBranches();
  persist();
  autoLayout();
  runSimulation();
  persist();
  activateTab('copilot');
  copilotPost('ai',
    `**Proceso cargado: Originación de Crédito Comercial PYME** (Banca — *showcase* BPMN completo).\n\n` +
    `**9 actores · 27 nodos** — ejercita TODOS los elementos BPMN en un flujo: nodos **Documento ▤** (expediente) y **Data ▱** (score crediticio) · **gateway exclusivo ✕, paralelo ＋ (fork/join) e inclusivo ○** (garantías y/o legal) · **timer ⏱** (esperar comité) · **señal ▲ throw** (difundir aprobación) · **evento de terminación ⬤** (cancelación) · 2 fines de **error ⚡** · inicio y fin de **mensaje ✉**.\n\n` +
    `**Marcadores**: ⊞ subproceso (capacidad de pago), ‖ multi-instancia (tasar garantías), ↻ loop (subsanar). Es el ejemplo más grande: úsalo para validar que el **auto-layout se mantiene limpio a escala** (0 cruces, 0 solapamientos) y que el export PPTX parte el flujo en slides legibles.`);
}

function loadComplexDemo12() {
  resetState();
  state.meta = { name: 'Fulfillment E-commerce con SLA', industry: 'Retail', macroprocess: 'Supply Chain', client: '', owner: '' };
  $('#processName').value = state.meta.name;
  $('#processIndustry').value = 'Retail';
  $('#processMacro').value = 'Supply Chain';

  const N = [
    { k: 's',   type: 'start', label: 'Pedido confirmado', owner: 'Cliente', event: 'message' },
    { k: 'a1',  type: 'task',  label: 'Validar pago', owner: 'Pagos', system: 'Pasarela', exec: 'automatic', time: 3, vol: 5000, va: 'BVA' },
    { k: 'd1',  type: 'decision', label: '¿Pago aprobado?', owner: 'Pagos', gateway: 'exclusive' },
    { k: 'erej',type: 'end',   label: 'Pedido rechazado', owner: 'Pagos', event: 'error' },
    { k: 'a2',  type: 'task',  label: 'Preparar pedido (picking)', owner: 'Almacén', system: 'WMS', exec: 'manual', time: 25, vol: 4600, va: 'VA',
      boundary: { type: 'timer', interrupting: false },
      pains: [{ category: 'wait', description: 'Picking excede el SLA en campañas de alta demanda', severity: 4, frequency: 4 }] },
    { k: 'aesc',type: 'task',  label: 'Priorizar pedido', owner: 'Supervisor', exec: 'manual', time: 8, vol: 600, va: 'BVA' },
    { k: 'a3',  type: 'task',  label: 'Empacar y etiquetar', owner: 'Almacén', exec: 'manual', time: 10, vol: 4600, va: 'VA' },
    { k: 'a4',  type: 'task',  label: 'Asignar transportista', owner: 'Logística', system: 'TMS', exec: 'system', time: 5, vol: 4600, va: 'BVA' },
    { k: 'iv1', type: 'intermediate', label: 'Esperar recojo', owner: 'Transportista', event: 'timer' },
    { k: 'a5',  type: 'task',  label: 'Despachar a ruta', owner: 'Transportista', exec: 'manual', time: 15, vol: 4600, va: 'VA',
      boundary: { type: 'timer', interrupting: false } },
    { k: 'anot',type: 'task',  label: 'Notificar retraso', owner: 'Logística', exec: 'email', time: 4, vol: 700, va: 'BVA' },
    { k: 'a6',  type: 'task',  label: 'Entregar pedido', owner: 'Transportista', exec: 'manual', time: 20, vol: 4600, va: 'VA' },
    { k: 'd2',  type: 'decision', label: '¿Entrega exitosa?', owner: 'Transportista', gateway: 'exclusive' },
    { k: 'a7',  type: 'task',  label: 'Reprogramar entrega', owner: 'Logística', system: 'TMS', exec: 'system', time: 12, vol: 500, va: 'NVA', marker: 'loop',
      pains: [{ category: 'rework', description: 'Reintentos por cliente ausente', severity: 3, frequency: 4 }] },
    { k: 'a8',  type: 'task',  label: 'Confirmar entrega', owner: 'Logística', system: 'TMS', exec: 'system', time: 4, vol: 4400, va: 'VA' },
    { k: 'e1',  type: 'end',   label: 'Pedido entregado', owner: 'Cliente', event: 'message' }
  ];
  const E = [
    ['s','a1'], ['a1','d1'],
    ['d1','a2','Sí'], ['d1','erej','No'],
    ['a2','a3'], ['a2','aesc','SLA 2h vencido'], ['aesc','a3'],
    ['a3','a4'], ['a4','iv1'], ['iv1','a5'],
    ['a5','a6'], ['a5','anot','Demora > 24h'], ['anot','a6'],
    ['a6','d2'],
    ['d2','a8','Sí'], ['d2','a7','No'], ['a7','a6'],
    ['a8','e1']
  ];

  const idMap = {};
  N.forEach(t => {
    const def = SHAPE_DEFAULTS[t.type];
    const node = {
      id: 'n' + (state.nextId++), type: t.type, x: 0, y: 0, w: def.w, h: def.h,
      label: t.label, executionType: t.exec || (t.type === 'task' ? 'manual' : ''),
      gatewayType: t.gateway || undefined, eventType: t.event || undefined, throw: t.throw || undefined,
      terminate: t.terminate || undefined, marker: t.marker || '', boundary: t.boundary || undefined, activityCode: '',
      owner: t.owner || '', system: t.system || '',
      time: t.time != null ? String(t.time) : '', volume: t.vol != null ? String(t.vol) : '', va: t.va || '',
      sla: '', docsIn: '', docsOut: '', rules: '', notes: '', pains: (t.pains || []).map(p => ({ id: 'p' + (state.nextId++), ...p }))
    };
    idMap[t.k] = node.id;
    state.nodes.push(node);
  });
  E.forEach(([a, b, lbl]) => state.edges.push({ id: 'e' + (state.nextId++), from: idMap[a], to: idMap[b], label: lbl || '' }));

  state._kpiValues = {
    'ret-07': { name: 'Tasa de pedidos fuera de SLA', unit: '%', benchmark: '< 5%', value: '13', gap: '+8 pp', source: 'WMS/TMS' }
  };

  ensureDecisionBranches();
  persist();
  autoLayout();
  runSimulation();
  persist();
  activateTab('copilot');
  copilotPost('ai',
    `**Proceso cargado: Fulfillment E-commerce con SLA** (Retail — estrena **eventos de borde** BPMN).\n\n` +
    `6 actores · 13 actividades · **2 eventos de borde (boundary) de temporizador ⏱ no-interrumpentes** (anillo punteado) sobre tareas: *Preparar pedido* → si vence el **SLA de 2h** escala a *Priorizar pedido*; *Despachar a ruta* → si hay **demora >24h** dispara *Notificar retraso*. El flujo principal continúa en paralelo (no-interrumpente). Gateways exclusivos (pago, entrega), timer intermedio (esperar recojo), inicio/fin de **mensaje ✉**, fin de **error ⚡**, marcador ↻ loop (reprogramar).\n\n` +
    `Los **boundary events** modelan el manejo de excepciones por SLA sin romper el camino feliz — patrón clave en operaciones. La tasa fuera de SLA (13% vs <5%) es el cuello.`);
}

export { loadComplexDemo, loadComplexDemo10, loadComplexDemo11, loadComplexDemo12, loadComplexDemo2, loadComplexDemo3, loadComplexDemo4, loadComplexDemo5, loadComplexDemo6, loadComplexDemo7, loadComplexDemo8, loadComplexDemo9, loadDemoProcess };
