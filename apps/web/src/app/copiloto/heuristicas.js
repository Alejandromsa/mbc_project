// Portado del MVP 3.8.9 (app.js) sin cambios de lógica — fase 1.
import { SHAPE_DEFAULTS, state } from '../estado.js';
import { ingestarDescripcion } from '../ingesta/flujo.js';
import { autoLayout } from '../layout/auto-layout.js';
import { getNode } from '../lienzo/interaccion.js';
import { render } from '../lienzo/render.js';
import { persist } from '../persistencia.js';
import { ensureDecisionBranches } from '../proceso/operaciones.js';
import { tryNlCommand } from './comandos.js';
import { copilotPost } from './copiloto.js';

// -------- Mock generation: detecta verbos comunes para crear actividades --------
function generateProcessFromDescription(desc) {
  const lower = desc.toLowerCase();
  let template;
  if (lower.includes('reclamo') || lower.includes('queja')) {
    template = [
      { type: 'start',    label: 'Reclamo recibido' },
      { type: 'task',     label: 'Registrar reclamo en CRM', owner: 'Asesor Call Center', system: 'CRM', executionType: 'system' },
      { type: 'decision', label: '¿Se resuelve en primera línea?' },
      { type: 'task',     label: 'Resolver y cerrar caso', owner: 'Asesor Call Center', executionType: 'phone' },
      { type: 'task',     label: 'Escalar a back office', owner: 'Asesor Call Center', system: 'Workflow', executionType: 'system' },
      { type: 'task',     label: 'Investigar caso', owner: 'Analista Back Office', executionType: 'manual' },
      { type: 'task',     label: 'Aprobar resolución', owner: 'Jefe Back Office', executionType: 'manual' },
      { type: 'task',     label: 'Notificar al cliente', owner: 'Asesor Call Center', executionType: 'email' },
      { type: 'end',      label: 'Reclamo resuelto a favor cliente' },
      { type: 'end',      label: 'Reclamo desestimado' }
    ];
  } else if (lower.includes('cobranza') || lower.includes('o2c') || lower.includes('ventas')) {
    template = [
      { type: 'start',    label: 'Pedido recibido' },
      { type: 'task',     label: 'Validar crédito del cliente', owner: 'Riesgos', system: 'ERP', executionType: 'system' },
      { type: 'task',     label: 'Registrar pedido', owner: 'Comercial', system: 'ERP', executionType: 'system' },
      { type: 'task',     label: 'Despachar mercadería', owner: 'Logística', system: 'WMS', executionType: 'system' },
      { type: 'task',     label: 'Emitir factura', owner: 'Facturación', system: 'ERP', executionType: 'automatic' },
      { type: 'task',     label: 'Aplicar cobro', owner: 'Tesorería', executionType: 'manual' },
      { type: 'end',      label: 'Cobro aplicado' }
    ];
  } else if (lower.includes('compra') || lower.includes('p2p') || lower.includes('proveedor')) {
    template = [
      { type: 'start',    label: 'Necesidad identificada' },
      { type: 'task',     label: 'Crear requisición', owner: 'Solicitante', system: 'ERP', executionType: 'system' },
      { type: 'task',     label: 'Aprobar requisición', owner: 'Gerencia', executionType: 'manual' },
      { type: 'task',     label: 'Emitir orden de compra', owner: 'Compras', system: 'ERP', executionType: 'system' },
      { type: 'task',     label: 'Recibir bien o servicio', owner: 'Almacén', system: 'WMS', executionType: 'system' },
      { type: 'task',     label: 'Conciliar 3-way match', owner: 'Cuentas por Pagar', executionType: 'manual' },
      { type: 'task',     label: 'Liberar pago a proveedor', owner: 'Tesorería', system: 'ERP', executionType: 'system' },
      { type: 'end',      label: 'Pago liberado' }
    ];
  } else if (lower.includes('onboarding') || lower.includes('alta de cliente') || lower.includes('kyc')) {
    template = [
      { type: 'start',    label: 'Cliente solicita alta' },
      { type: 'task',     label: 'Capturar datos del cliente', owner: 'Comercial', system: 'CRM', executionType: 'system' },
      { type: 'task',     label: 'Validar identidad y AML', owner: 'Compliance', system: 'KYC Tool', executionType: 'ai' },
      { type: 'decision', label: '¿KYC aprobado?' },
      { type: 'task',     label: 'Notificar rechazo al cliente', owner: 'Compliance', executionType: 'email' },
      { type: 'task',     label: 'Crear cliente en core bancario', owner: 'Operaciones', system: 'Core', executionType: 'automatic' },
      { type: 'task',     label: 'Activar productos contratados', owner: 'Operaciones', system: 'Core', executionType: 'system' },
      { type: 'end',      label: 'Cliente activo' },
      { type: 'end',      label: 'Cliente rechazado por KYC' }
    ];
  } else {
    template = [
      { type: 'start',    label: 'Solicitud recibida' },
      { type: 'task',     label: 'Validar requisitos', executionType: 'manual' },
      { type: 'task',     label: 'Registrar caso', executionType: 'system' },
      { type: 'decision', label: '¿Cumple criterios?' },
      { type: 'task',     label: 'Procesar aprobación', executionType: 'system' },
      { type: 'task',     label: 'Notificar rechazo', executionType: 'email' },
      { type: 'end',      label: 'Caso aprobado' },
      { type: 'end',      label: 'Caso rechazado' }
    ];
  }

  // Limpia y dibuja
  state.nodes = [];
  state.edges = [];
  state.selectedNodeId = null;
  let x = 80, y = 100;
  const created = [];
  template.forEach((t, idx) => {
    const def = SHAPE_DEFAULTS[t.type];
    const defaultExec = t.type === 'system' ? 'system' : (t.type === 'task' ? 'manual' : '');
    const node = {
      id: 'n' + (state.nextId++),
      type: t.type,
      x, y,
      w: def.w, h: def.h,
      label: t.label,
      executionType: t.executionType || defaultExec,
      owner: t.owner || '', system: t.system || '',
      time: '', volume: '', va: '',
      sla: '', docsIn: '', docsOut: '', rules: '', notes: '', pains: []
    };
    state.nodes.push(node);
    created.push(node);
    x += def.w + 60;
    if ((idx + 1) % 5 === 0) { x = 80; y += 140; }
  });

  // Conecta linealmente (sin encadenar end → end)
  for (let i = 0; i < created.length - 1; i++) {
    if (created[i + 1].type === 'end' && created[i].type === 'end') continue;
    state.edges.push({ id: 'e' + (state.nextId++), from: created[i].id, to: created[i + 1].id, label: '' });
  }

  // Reconecta ends huérfanos desde el último gateway disponible (rama "No")
  const inDegMap = {};
  state.edges.forEach(e => inDegMap[e.to] = (inDegMap[e.to] || 0) + 1);
  created.forEach((n, idx) => {
    if (n.type !== 'end' || inDegMap[n.id]) return;
    for (let j = idx - 1; j >= 0; j--) {
      if (created[j].type === 'decision') {
        state.edges.push({ id: 'e' + (state.nextId++), from: created[j].id, to: n.id, label: 'No' });
        // Etiqueta también la rama positiva del gateway si está vacía
        const positiveBranch = state.edges.find(e => e.from === created[j].id && !e.label && e.to !== n.id);
        if (positiveBranch) positiveBranch.label = 'Sí';
        break;
      }
    }
  });

  ensureDecisionBranches();
  persist();
  autoLayout();  // ← aplica top-to-bottom MBB
  render();
  copilotPost('ai',
    `He generado un proceso as-is con **${created.length} actividades** basado en patrones APQC PCF + playbook MBB.\n\n` +
    `Sugerencias inmediatas:\n` +
    `• Completa los **responsables** y **sistemas soporte** en cada actividad.\n` +
    `• Captura **pain points** (handoffs, esperas, reprocesos) — son el insumo del diagnóstico.\n` +
    `• Revisa la pestaña **KPIs** para vincular indicadores sectoriales.\n\n` +
    `¿Quieres que detecte pains típicos del sector?`);
}

function detectPainsMock() {
  if (state.nodes.length === 0) { copilotPost('ai', 'No hay un diagrama aún. Genera o dibuja un proceso primero.'); return; }
  const handoffs = countHandoffs();
  const decisions = state.nodes.filter(n => n.type === 'decision').length;
  const manual = state.nodes.filter(n => n.type === 'task' && !n.system).length;

  let msg = `**Diagnóstico automático del as-is**\n\n`;
  msg += `• **${handoffs} handoff(s)** detectados entre roles distintos. Cada handoff agrega ~10-15% de lead time y riesgo de pérdida de información.\n`;
  msg += `• **${decisions} punto(s) de decisión**. Si carecen de criterios documentados, son fuente de variabilidad e inequidad.\n`;
  msg += `• **${manual} actividad(es) sin sistema soporte** — candidatas a automatización (RPA / workflow).\n\n`;
  msg += `**Pain points típicos del sector ${state.meta.industry || '(define industria)'}:**\n`;
  if (state.meta.industry === 'Banca') {
    msg += `• Reproceso por documentación incompleta del cliente.\n• Tiempos de respuesta heterogéneos según canal.\n• Validaciones manuales duplicadas entre frontline y back office.`;
  } else if (state.meta.industry === 'Retail') {
    msg += `• Quiebres de stock por baja sincronización tienda-CD.\n• Devoluciones sin trazabilidad financiera.\n• Promociones ejecutadas con desfase entre canales.`;
  } else if (state.meta.industry === 'Manufactura') {
    msg += `• Paradas no planificadas por mantenimiento reactivo.\n• Inventario en proceso sobre-dimensionado.\n• Calidad detectada al final de línea, no en estación.`;
  } else if (state.meta.industry === 'Sector Público') {
    msg += `• Trámites con múltiples ventanillas (one-stop-shop ausente).\n• Documentación física que duplica registros digitales.\n• Plazos TUPA incumplidos por handoffs inter-áreas.`;
  } else {
    msg += `• Define la industria del proceso para sugerencias específicas.`;
  }
  copilotPost('ai', msg);
}

function countHandoffs() {
  let count = 0;
  state.edges.forEach(e => {
    const a = getNode(e.from), b = getNode(e.to);
    if (a && b && a.owner && b.owner && a.owner !== b.owner) count++;
  });
  return count;
}

function suggestKpisMock() {
  const ind = state.meta.industry;
  const mac = state.meta.macroprocess;
  let kpis = window.KPI_LIBRARY.filter(k => (k.industry === ind || k.industry === 'Transversal') && (!mac || k.macroprocess === mac)).slice(0, 5);
  if (kpis.length === 0) kpis = window.KPI_LIBRARY.slice(0, 5);
  let msg = `**KPIs recomendados** para ${ind || 'tu proceso'}${mac ? ' (' + mac + ')' : ''}:\n\n`;
  kpis.forEach(k => {
    msg += `• **${k.name}** (${k.unit}) — benchmark: ${k.benchmark}\n`;
  });
  msg += `\nRevisa la pestaña **KPIs** para ver la librería completa y hacer click en cada uno para agregarlo al diagnóstico.`;
  copilotPost('ai', msg);
}

function proposeToBeMock() {
  if (state.nodes.length === 0) { copilotPost('ai', 'Necesito un diagrama as-is para proponer el to-be.'); return; }
  const manual = state.nodes.filter(n => n.type === 'task' && !n.system);
  const handoffs = countHandoffs();
  let totalPains = 0;
  state.nodes.forEach(n => totalPains += (n.pains?.length || 0));

  let msg = `**Propuesta de reingeniería (to-be)**\n\n`;
  msg += `Lectura del as-is: ${state.nodes.length} actividades, ${handoffs} handoffs entre roles, ${manual.length} sin sistema, ${totalPains} pains capturados.\n\n`;
  msg += `**Palancas sugeridas:**\n`;
  msg += `1. **Automatización RPA** en las ${manual.length} actividades sin sistema soporte → ahorro estimado 0.3-0.5 FTE por actividad de alto volumen.\n`;
  msg += `2. **Eliminar handoffs** mediante célula multifuncional o workflow orquestado → reducción 20-30% en lead time.\n`;
  msg += `3. **Self-service / canal digital** en las actividades de captura → reducción 40-60% en errores de origen.\n`;
  msg += `4. **Reglas de decisión codificadas** (DMN / motor de reglas) en los puntos de gateway → consistencia y trazabilidad.\n`;
  msg += `5. **KPIs en tiempo real** con dashboard único → ciclos de mejora mensuales en lugar de trimestrales.\n\n`;
  msg += `**Beneficios estimados** (rango referencia industria):\n`;
  msg += `• Lead time: -35% a -50%\n• FTE liberados: 15-25% de la dotación actual\n• Calidad (errores): -60%\n• CSAT/NPS: +10 a +20 puntos\n\n`;
  msg += `Dime "dibuja el to-be" si quieres que genere la versión optimizada en un nuevo lienzo.`;
  copilotPost('ai', msg);
}

function execSummaryMock() {
  const name = state.meta.name || '[Nombre del proceso]';
  const ind = state.meta.industry || '[Industria]';
  const mac = state.meta.macroprocess || '[Macroproceso]';
  const nodes = state.nodes.length;
  const handoffs = countHandoffs();
  let painsTotal = 0, painsCrit = 0;
  state.nodes.forEach(n => (n.pains || []).forEach(p => {
    painsTotal++;
    if (p.severity >= 4) painsCrit++;
  }));

  const msg =
`**RESUMEN EJECUTIVO — DIAGNÓSTICO DE PROCESO**

**Proceso:** ${name}
**Industria / Macroproceso:** ${ind} · ${mac}

**Hallazgos clave:**
• El proceso comprende ${nodes} actividades con ${handoffs} handoffs inter-rol.
• Se identificaron ${painsTotal} pain points (${painsCrit} críticos, severidad ≥ 4).
• Existe oportunidad de automatización en actividades sin sistema soporte.

**Recomendaciones priorizadas:**
1. Quick wins (0-3 meses): estandarización de criterios de decisión + eliminación de controles duplicados.
2. Mediano plazo (3-9 meses): automatización RPA/IDP en actividades manuales de alto volumen.
3. Estructural (9-18 meses): rediseño organizacional hacia células multifuncionales + dashboard en tiempo real.

**Impacto estimado:**
Lead time -40%, FTE liberados 15-25%, mejora de CSAT/NPS doble dígito.

**Próximo paso sugerido:**
Validar hallazgos con sponsor, priorizar oportunidades en matriz impacto-esfuerzo, y construir business case.`;

  copilotPost('ai', msg);
}

function mockCopilotResponse(prompt) {
  // F7: intenta interpretar como comando de edición primero
  const cmd = tryNlCommand(prompt);
  if (cmd !== null) return cmd;
  const p = prompt.toLowerCase();
  if (p.includes('hola') || p.includes('buenos') || p.includes('buenas')) return '¡Hola! ¿En qué proceso te ayudo hoy?';
  if (p.includes('genera') || p.includes('levanta') || p.includes('dibuja')) { ingestarDescripcion(prompt); return 'Interpretando tu descripción con IA…'; }
  if (p.includes('pain') || p.includes('dolor')) { detectPainsMock(); return ''; }
  if (p.includes('kpi') || p.includes('indicador')) { suggestKpisMock(); return ''; }
  if (p.includes('to-be') || p.includes('tobe') || p.includes('reingenier')) { proposeToBeMock(); return ''; }
  if (p.includes('resumen') || p.includes('ejecutivo')) { execSummaryMock(); return ''; }
  return `Entiendo tu pedido. En el MVP el copiloto trabaja con plantillas locales — al conectar Claude API en v1 daré respuestas contextualizadas a tu diagrama, industria y entregables previos del área.\n\nPrueba con las acciones rápidas arriba: generar, detectar pains, sugerir KPIs, to-be, o resumen ejecutivo.`;
}

export { countHandoffs, detectPainsMock, execSummaryMock, mockCopilotResponse, proposeToBeMock, suggestKpisMock };
