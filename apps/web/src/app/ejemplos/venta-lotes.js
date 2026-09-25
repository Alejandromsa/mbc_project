// Portado del MVP 3.8.9 (app.js) sin cambios de lógica — fase 1.
import { runSimulation } from '../analitica/simulador.js';
import { copilotPost } from '../copiloto/copiloto.js';
import { $ } from '../dom.js';
import { SHAPE_DEFAULTS, state } from '../estado.js';
import { resetState } from '../historial.js';
import { autoLayout } from '../layout/auto-layout.js';
import { activateTab } from '../paneles/cajon.js';
import { renderFichaTab } from '../paneles/ficha.js';
import { persist } from '../persistencia.js';
import { ensureDecisionBranches } from '../proceso/operaciones.js';

// ============================================================
// DEMO DE ENTRENAMIENTO — Ficha real: Venta de Lotes Urbanos (Centenario, PR-DU-COM-02)
// ~33 nodos, 4 roles, compuertas de 2 y 3 vías, dos loops (descuento y observaciones DD)
// y tres ramas de firma que convergen. Valida que el flujo se arma correcto y que
// la ficha corporativa se genera completa desde el modelo.
// ============================================================
function loadFichaVentaLotes() {
  resetState();
  state.meta = { name: 'Venta de Lotes Urbanos', industry: 'Transversal', macroprocess: 'O2C', client: 'Centenario', owner: 'Jefe de Ventas (Urbanizaciones)' };
  $('#processName').value = state.meta.name;
  $('#processIndustry').value = 'Transversal';
  $('#processMacro').value = 'O2C';

  const N = [
    { k: 's',   type: 'start', label: 'Lead captado', owner: 'Cliente', event: 'message' },
    { k: 'a1',  type: 'task', label: 'Registrar y derivar lead', owner: 'Call Center', system: 'Salesforce (CRM)', exec: 'system', time: 5, vol: 3000, va: 'BVA',
      notes: 'Canales: Digital (derivación automática a Salesforce), Call Center y Presencial (caseta de ventas).\nAsignación de leads digitales automatizada según capacidad y asesores activos.\nSolicitar consentimiento de datos personales (Anexo N°7).' },
    { k: 'a2',  type: 'task', label: 'Elaborar perfil del cliente', owner: 'Asesor Inmobiliario', exec: 'manual', time: 20, vol: 2400, va: 'VA',
      notes: 'Validar identidad con DNI; búsqueda en Google y redes sociales.\nDetectar señales de alerta (denuncias, temas legales).\nConstruir propuesta a la medida del cliente.' },
    { k: 'a3',  type: 'task', label: 'Atención de cliente y presentación', owner: 'Asesor Inmobiliario', exec: 'manual', time: 30, vol: 2400, va: 'VA',
      notes: 'Presentación del asesor y de Grupo Centenario (brochure, Anexo N°8).\nConocimiento del cliente para prevención LAFT: reportar señales de alerta al Encargado de Prevención del Delito.' },
    { k: 'a4',  type: 'task', label: 'Gestionar visita al proyecto', owner: 'Asesor Inmobiliario', exec: 'manual', time: 10, vol: 2000, va: 'BVA',
      notes: 'Programar visita (fecha y hora), virtual o presencial.' },
    { k: 'd1',  type: 'decision', label: '¿Modalidad de visita?', owner: 'Asesor Inmobiliario', gateway: 'exclusive' },
    { k: 'a5',  type: 'task', label: 'Realizar exposición virtual del producto', owner: 'Asesor Inmobiliario', system: 'Zoom / Teams', exec: 'manual', time: 40, vol: 1000, va: 'VA',
      notes: 'Herramientas: visor de lotes, recorrido virtual, cotizador, brochure.\nEl visor puede diferir de SAP por estrategia comercial (registrar en Excel/SharePoint).' },
    { k: 'd2',  type: 'decision', label: '¿Cliente interesado en comprar? (virtual)', owner: 'Asesor Inmobiliario', gateway: 'exclusive' },
    { k: 'a6',  type: 'task', label: 'Presentación y recorrido presencial', owner: 'Asesor Inmobiliario', exec: 'manual', time: 60, vol: 1200, va: 'VA',
      notes: 'Recorrido estructurado por las amenidades; revisar lotes seleccionados.' },
    { k: 'd3',  type: 'decision', label: '¿Cliente interesado en comprar? (presencial)', owner: 'Asesor Inmobiliario', gateway: 'exclusive' },
    { k: 'a7',  type: 'task', label: 'Ofrecer propuesta comercial', owner: 'Asesor Inmobiliario', exec: 'manual', time: 25, vol: 1600, va: 'VA',
      notes: 'Negociación sobre lotes y modelo de financiamiento (Anexo N°9).\nMeta de ventas según Anexo N°11.',
      pains: [{ category: 'wait', description: 'Cliente pospone decisión; se pierde momentum de cierre', severity: 3, frequency: 4 }] },
    { k: 'd4',  type: 'decision', label: '¿Resultado de la negociación?', owner: 'Asesor Inmobiliario', gateway: 'exclusive' },
    { k: 'a8',  type: 'task', label: 'Gestionar nueva propuesta (descuento)', owner: 'Asesor Inmobiliario', exec: 'manual', time: 15, vol: 700, va: 'BVA',
      notes: 'Validar viabilidad según bolsa de descuentos, márgenes y precios (aprueba Jefe de Ventas).' },
    { k: 'd5',  type: 'decision', label: '¿Descuento viable?', owner: 'Jefe de Ventas', gateway: 'exclusive' },
    { k: 'a9',  type: 'task', label: 'Gestionar pago', owner: 'Asesor Inmobiliario', system: 'Salesforce (CRM)', exec: 'system', time: 20, vol: 900, va: 'VA',
      notes: 'Tipos: operación con depósito / pago 1ra cuota / al contado.\nMedios: POS, PagoEfectivo, transferencia, abono en cuenta, Web Terreno.\nProhibido efectivo (reglamento interno).' },
    { k: 'a10', type: 'task', label: 'Gestionar evaluación de debida diligencia', owner: 'Asesor Inmobiliario', system: 'Thomson Reuters', exec: 'manual', time: 30, vol: 900, va: 'BVA',
      notes: 'Sustento de debida diligencia (Política PO-IC-LEG-04).\nScoring de riesgo (Anexo N°6); régimen reforzado requiere aprobación VP y opinión de Legal.',
      pains: [{ category: 'handoff', description: 'Ida y vuelta con Legal/Cumplimiento en régimen reforzado', severity: 4, frequency: 3 }] },
    { k: 'a14', type: 'task', label: 'Solicitar contrato', owner: 'Asesor Inmobiliario', system: 'OnBase', exec: 'system', time: 10, vol: 900, va: 'BVA',
      notes: 'Cargar documentación de DD a OnBase; indicar contrato Presencial o No Presencial.\nEl Supervisor de Zona aprueba en el módulo comercial de OnBase.' },
    { k: 'a15', type: 'task', label: 'Revisar y liberar documentación de DD', owner: 'Administrador de Ventas', system: 'OnBase', exec: 'manual', time: 25, vol: 900, va: 'BVA',
      notes: 'Verifica que la documentación de debida diligencia esté completa.',
      pains: [{ category: 'rework', description: 'Devoluciones por documentación incompleta', severity: 3, frequency: 4 }] },
    { k: 'd6',  type: 'decision', label: '¿Documentación conforme?', owner: 'Administrador de Ventas', gateway: 'exclusive' },
    { k: 'a16', type: 'task', label: 'Generar contrato y anexos', owner: 'Administrador de Ventas', system: 'OnBase', exec: 'system', time: 20, vol: 850, va: 'VA',
      notes: 'Contrato (art. 78.1 Código de Protección al Consumidor), cronograma, hoja resumen, ROP, DJ LAFT, reporte Thomson Reuters, DJ conocimiento de cliente.' },
    { k: 'a17', type: 'task', label: 'Recibir contrato y gestionar aceptación', owner: 'Asesor Inmobiliario', exec: 'manual', time: 15, vol: 850, va: 'VA',
      notes: 'Entregar al comprador la información del art. 78.2 (resolución municipal, planos, características de HU, App Vecino Centenario).' },
    { k: 'd7',  type: 'decision', label: '¿Modalidad de firma?', owner: 'Asesor Inmobiliario', gateway: 'exclusive' },
    { k: 'a18', type: 'task', label: 'Tomar firma del cliente (presencial)', owner: 'Asesor Inmobiliario', exec: 'manual', time: 20, vol: 300, va: 'VA',
      notes: 'Firma de todos los documentos (excepto reporte Thomson Reuters). Incentivo de cierre según escala aprobada.' },
    { k: 'a19', type: 'task', label: 'Cargar documentación y archivar física', owner: 'Asesor Inmobiliario', system: 'OnBase', exec: 'system', time: 12, vol: 300, va: 'BVA',
      notes: 'Carga a OnBase Comercial; documentación física a Archivo máximo el día 7 de cada mes.' },
    { k: 'a20', type: 'task', label: 'Enviar contrato por correo al cliente', owner: 'Asesor Inmobiliario', exec: 'email', time: 10, vol: 350, va: 'VA',
      notes: 'Correo a ventadelotes@centenario.com.pe con confirmación de entrega y lectura. Correo de bienvenida.' },
    { k: 'a21', type: 'task', label: 'Acusar recibo y aceptar oferta', owner: 'Cliente', exec: 'manual', time: 5, vol: 350, va: 'VA',
      notes: 'Correo 1: acuse de recibo. Correo 2: aceptación con copia de DNI y declaración firmada con huella.' },
    { k: 'a22', type: 'task', label: 'Cargar correos de aceptación en OnBase', owner: 'Asesor Inmobiliario', system: 'OnBase', exec: 'system', time: 10, vol: 350, va: 'BVA',
      notes: 'Descargar correos (.msg) de oferta, acuse y aceptación, y subirlos a OnBase.' },
    { k: 'a23', type: 'task', label: 'Cargar documentos para firma electrónica', owner: 'Asesor Inmobiliario', system: 'Keynua', exec: 'system', time: 15, vol: 200, va: 'VA',
      notes: 'Separar en 2 grupos (firma de todas las partes / firma solo del cliente) y generar los flujos de firma en Keynua.' },
    { k: 'a24', type: 'task', label: 'Cargar documentos firmados en OnBase', owner: 'Asesor Inmobiliario', system: 'OnBase', exec: 'system', time: 8, vol: 200, va: 'BVA',
      notes: 'Al concluir el flujo de Keynua, descargar los documentos firmados y subirlos a OnBase Comercial.' },
    { k: 'a25', type: 'task', label: 'Publicar información en App Vecino Centenario', owner: 'Administrador de Ventas', system: 'App Vecino Centenario', exec: 'system', time: 5, vol: 850, va: 'BVA',
      notes: 'Tras el cierre de ventas en el ERP, publicar los documentos (Anexo 10) en el App Vecino Centenario.' },
    { k: 'a26', type: 'task', label: 'Enviar contrato, anexos y acta a Archivo', owner: 'Asesor Inmobiliario', exec: 'manual', time: 15, vol: 850, va: 'BVA',
      notes: 'Envío físico (valija/motorizado) máximo el día 7 de cada mes: contrato, ficha cliente y acta de entrega. Confirmación con cargo firmado.' },
    { k: 'e1',  type: 'end', label: 'Venta finalizada', owner: 'Cliente', event: 'message' },
    { k: 'eno', type: 'end', label: 'Fin — venta no concretada', owner: 'Asesor Inmobiliario', event: 'terminate', terminate: true }
  ];
  const E = [
    ['s','a1'], ['a1','a2'], ['a2','a3'], ['a3','a4'], ['a4','d1'],
    ['d1','a5','Virtual'], ['d1','a6','Presencial'],
    ['a5','d2'], ['d2','a7','Sí'], ['d2','eno','No'],
    ['a6','d3'], ['d3','a7','Sí'], ['d3','eno','No'],
    ['a7','d4'],
    ['d4','a8','Solicita descuento'], ['d4','a9','Acepta'], ['d4','eno','No continúa'],
    ['a8','d5'], ['d5','a7','Viable'], ['d5','eno','No viable'],
    ['a9','a10'], ['a10','a14'], ['a14','a15'], ['a15','d6'],
    ['d6','a14','Observaciones'], ['d6','a16','Conforme'],
    ['a16','a17'], ['a17','d7'],
    ['d7','a18','Presencial'], ['d7','a20','No presencial'], ['d7','a23','Firma electrónica'],
    ['a18','a19'], ['a19','a25'],
    ['a20','a21'], ['a21','a22'], ['a22','a25'],
    ['a23','a24'], ['a24','a25'],
    ['a25','a26'], ['a26','e1']
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
      sla: '', docsIn: '', docsOut: '', rules: '', notes: t.notes || '', pains: (t.pains || []).map(p => ({ id: 'p' + (state.nextId++), ...p }))
    };
    idMap[t.k] = node.id;
    state.nodes.push(node);
  });
  E.forEach(([a, b, lbl]) => state.edges.push({ id: 'e' + (state.nextId++), from: idMap[a], to: idMap[b], label: lbl || '' }));

  // Ficha corporativa completa (datos reales del documento PR-DU-COM-02 v6)
  state.ficha = {
    code: 'PR-DU-COM-02', version: '6',
    objetivo: 'Describir las actividades y responsabilidades del proceso de Venta de Lotes Urbanos en Centenario.',
    alcanceAreas: 'Ventas de Lotes Urbanos y Administración de Ventas',
    alcanceDesde: 'Captación de leads a través de los canales de promoción',
    alcanceHasta: 'Firma del contrato de venta y envío de la documentación a Archivo',
    alcanceIncluye: 'Abarca lotes residenciales y de segunda vivienda',
    descripcion: '',
    gobernanza: [
      { rol: 'Dueño', cargo: 'Jefe de Ventas (Urbanizaciones)', nombre: 'Carlos Manuel Ismael Rolleri Limo', fecha: '' },
      { rol: 'Editor', cargo: 'Jefe de Ventas (Urbanizaciones)', nombre: 'Carlos Manuel Ismael Rolleri Limo', fecha: '' },
      { rol: 'Revisor', cargo: '—', nombre: 'Jaime Luis Alva Hurtado', fecha: '' },
      { rol: 'Aprobador', cargo: 'Gerente Post Venta y Atención al Cliente', nombre: 'Guillermo Jorge Segura Gomi', fecha: '' },
      { rol: 'Aprobador', cargo: 'VP Desarrollo Urbano', nombre: 'Carlos Alberto Conroy Ferreccio', fecha: '' },
      { rol: 'Aprobador', cargo: 'Gerente Comercial (DU)', nombre: '', fecha: '' }
    ],
    sistemas: [
      { nombre: 'Salesforce (CRM)', uso: 'Registro de leads, oportunidades y órdenes de pago' },
      { nombre: 'ONBASE', uso: 'Gestión documental y workflow comercial' },
      { nombre: 'SAP', uso: 'ERP — cierre de venta e inventario' },
      { nombre: 'Keynua', uso: 'Firma electrónica de contratos' },
      { nombre: 'Thomson Reuters', uso: 'Debida diligencia / listas restrictivas' },
      { nombre: 'App Vecino Centenario', uso: 'Publicación de información al cliente' },
      { nombre: 'Web Terreno', uso: 'Pago de primera cuota en línea' }
    ],
    terminos: [
      { termino: 'Lead', definicion: 'Persona u organización interesada que comparte su información de contacto (correo, teléfono, redes).' },
      { termino: 'Oportunidad', definicion: 'Potencial venta de lote a un prospecto.' }
    ],
    anexos: [
      { codigo: 'Anexo N°1', nombre: 'DJ de conocimiento de clientes PN LAFT' },
      { codigo: 'Anexo N°2', nombre: 'DJ de conocimiento de clientes PJ LAFT' },
      { codigo: 'Anexo N°3', nombre: 'DJ Origen de Fondos LAFT' },
      { codigo: 'Anexo N°4', nombre: 'DJ Accionariado de PJ LAFT' },
      { codigo: 'Anexo N°5', nombre: 'Formato de Entrevista de Cliente' },
      { codigo: 'Anexo N°6', nombre: 'Scoring de Calificación de Riesgo' },
      { codigo: 'Anexo N°7', nombre: 'Guía para Privacidad y Tratamiento de Datos Personales' },
      { codigo: 'Anexo N°8', nombre: 'Información en página web y speech de ventas' },
      { codigo: 'Anexo N°9', nombre: 'Modelo de financiamiento' },
      { codigo: 'Anexo N°10', nombre: 'Entrega de información relacionada a la venta' },
      { codigo: 'Anexo N°11', nombre: 'Asignación de meta de ventas' }
    ],
    cambios: [
      { version: '1', fecha: '10/04/2023', descripcion: 'Actualización completa del documento.' },
      { version: '2', fecha: '04/10/2023', descripcion: 'Se crea el Anexo 10 (integración OnBase – App Vecino Centenario).' },
      { version: '3', fecha: '10/11/2023', descripcion: 'Se precisa la generación de órdenes de pago y registro de pagos.' },
      { version: '4', fecha: '25/03/2024', descripcion: 'Sustento de ingresos (cuota > 1/2.5 UIT); incentivos por firma de contrato.' },
      { version: '5', fecha: '29/11/2024', descripcion: 'Aprobación de recargas por correo; envío físico el día 7; firma electrónica Keynua.' },
      { version: '6', fecha: '10/02/2026', descripcion: 'Digitalización del levantamiento y ficha en ProcessIQ.' }
    ]
  };

  state._kpiValues = {
    'vl-01': { name: 'Tasa de conversión lead → venta', unit: '%', benchmark: '≥ 4%', value: '2.8', gap: '-1.2 pp', source: 'Salesforce' },
    'vl-02': { name: 'Lead time captación → firma', unit: 'días', benchmark: '≤ 30 días', value: '41', gap: '+11 días', source: 'OnBase' }
  };

  ensureDecisionBranches();
  persist();
  autoLayout();
  runSimulation();
  persist();
  activateTab('ficha');
  renderFichaTab();
  copilotPost('ai',
    `**Ficha cargada: Venta de Lotes Urbanos — Centenario (PR-DU-COM-02, v6).**\n\n` +
    `Es el ejemplo de entrenamiento real: **29 actividades · 4 roles** (Cliente, Call Center, Asesor Inmobiliario, Administración de Ventas), compuertas de 2 y 3 vías, **dos loops** (descuento no viable → renegociar; observaciones de debida diligencia → subsanar) y **tres ramas de firma** (presencial, no presencial, Keynua) que convergen antes del cierre.\n\n` +
    `La pestaña **Ficha** ya trae los metadatos corporativos (gobernanza, sistemas, términos, 11 anexos, control de cambios). Pulsa **Generar ficha** o Exportar → *Ficha de Proceso* para producir el documento Word completo con el detalle de actividades y ruteo derivado del flujo.`);
}

export { loadFichaVentaLotes };
