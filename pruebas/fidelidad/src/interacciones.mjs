// Escenarios de interacción: copiloto, comandos en lenguaje natural, deshacer,
// minería de event logs, ingesta de texto, importación BPMN e IA simulada.
// Todos se ejecutan igual en las dos apps y devuelven artefactos de texto.

export const URL_IA = 'https://ia.prueba.invalid';

const esperar = (page, ms) => page.waitForTimeout(ms);

async function asentar(page) {
  await page.evaluate(() => new Promise((r) =>
    requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 300)))));
}

/** Estado observable del diagrama: resumen, SVG y modelo (sin descargar archivos). */
export async function estadoDiagrama(page) {
  return page.evaluate(() => ({
    resumen: JSON.stringify({ snapshot: window.ProcessIQ.snapshot(), calidad: window.ProcessIQ.quality() }, null, 2),
    svg: window.ProcessIQ.svg()
  }));
}

async function mensajesDesde(page, desde) {
  return page.evaluate((n) => Array.from(document.querySelectorAll('#copilotMessages > .copilot-msg'))
    .slice(n).map((m) => m.outerHTML).join('\n'), desde);
}
const contarMensajes = (page) => page.evaluate(() => document.querySelectorAll('#copilotMessages > .copilot-msg').length);

async function modalAbierto(page) {
  return page.evaluate(() => {
    const m = document.querySelector('#modal');
    if (!m || m.hidden || getComputedStyle(m).display === 'none') return null;
    return { titulo: document.querySelector('#modalTitle')?.textContent ?? '', cuerpo: document.querySelector('#modalBody')?.innerHTML ?? '' };
  });
}
const cerrarModal = (page) => page.evaluate(() => document.querySelector('#modalCancel')?.click());

// ---------------------------------------------------------------- copiloto
export const ACCIONES_COPILOTO = [
  'detect-pains', 'suggest-kpis', 'propose-tobe', 'raci', 'sipoc', 'impact-effort', 'whatif',
  'automation', 'bottleneck', 'variants', 'value-map', 'backlog', 'exec-summary',
  'merge-gateways', 'autofit', 'relayout'
];

export async function capturarCopiloto(page, demo) {
  const a = {};
  for (const accion of ACCIONES_COPILOTO) {
    await page.evaluate((d) => window.ProcessIQ[d](), demo);
    await asentar(page);
    const antes = await contarMensajes(page);
    await page.evaluate((ac) => document.querySelector(`.copilot-action[data-action="${ac}"]`).click(), accion);
    await esperar(page, 900);
    a[`${accion}/mensajes.html`] = await mensajesDesde(page, antes);
    const modal = await modalAbierto(page);
    a[`${accion}/modal.html`] = modal ? modal.titulo + '\n' + modal.cuerpo : '(sin modal)';
    if (modal) { await cerrarModal(page); await esperar(page, 150); }
    const e = await estadoDiagrama(page);
    a[`${accion}/resumen.json`] = e.resumen;
    a[`${accion}/diagrama.svg`] = e.svg;
  }
  return a;
}

// ------------------------------------------- comandos en lenguaje natural
export const COMANDOS = [
  'agregar Validar identidad después de Registrar reclamo',
  'renombrar Investigar caso a Analizar caso',
  'conectar Aprobar resolución con Notificar al cliente',
  'marcar Notificar al cliente como automático',
  'eliminar Validar identidad',
  'Levanta el proceso de gestión de reclamos para un banco'
];

export async function capturarComandos(page) {
  const a = {};
  await page.evaluate(() => window.ProcessIQ.loadDemo());
  await asentar(page);
  let i = 0;
  for (const cmd of COMANDOS) {
    const antes = await contarMensajes(page);
    await page.evaluate((c) => {
      document.querySelector('#copilotPrompt').value = c;
      document.querySelector('#btnCopilotSend').click();
    }, cmd);
    await esperar(page, 900);
    const modal = await modalAbierto(page);
    // Un comando puede abrir la ingesta (p. ej. "Levanta el proceso..."): tras
    // elegir en el diálogo se deja terminar la generación y el auto-encuadre.
    if (modal) { a[`cmd-${i}/modal.html`] = modal.titulo + '\n' + modal.cuerpo; await cerrarModal(page); await esperar(page, 1500); }
    a[`cmd-${i}/mensajes.html`] = await mensajesDesde(page, antes);
    const e = await estadoDiagrama(page);
    a[`cmd-${i}/resumen.json`] = e.resumen;
    a[`cmd-${i}/diagrama.svg`] = e.svg;
    i++;
  }
  // Deshacer dos veces y rehacer una (botones del lienzo)
  for (const [paso, boton] of [['deshacer-1', '#btnUndo'], ['deshacer-2', '#btnUndo'], ['rehacer-1', '#btnRedo']]) {
    await page.evaluate((b) => document.querySelector(b).click(), boton);
    await asentar(page);
    const e = await estadoDiagrama(page);
    a[`${paso}/resumen.json`] = e.resumen;
    a[`${paso}/diagrama.svg`] = e.svg;
  }
  return a;
}

// ---------------------------------------------------------------- minería
export async function capturarMineria(page) {
  const a = {};
  await page.evaluate(() => document.querySelector('#btnCsvSample').click());
  await esperar(page, 400);
  a['vista-previa.html'] = await page.evaluate(() =>
    (document.querySelector('#csvPreview')?.innerHTML ?? '') + '\n' + (document.querySelector('#csvMapping')?.innerHTML ?? ''));
  const antes = await contarMensajes(page);
  await page.evaluate(() => document.querySelector('#btnIngestCsv').click());
  await esperar(page, 1200);
  a['mensajes.html'] = await mensajesDesde(page, antes);
  let e = await estadoDiagrama(page);
  a['resumen.json'] = e.resumen;
  a['diagrama.svg'] = e.svg;
  const antes2 = await contarMensajes(page);
  await page.evaluate(() => document.querySelector('.copilot-action[data-action="variants"]').click());
  await esperar(page, 900);
  a['variantes/mensajes.html'] = await mensajesDesde(page, antes2);
  const modal = await modalAbierto(page);
  a['variantes/modal.html'] = modal ? modal.titulo + '\n' + modal.cuerpo : '(sin modal)';
  return a;
}

// ------------------------------------------------ ingesta de texto sin IA
export const TEXTOS = {
  reclamos: `El cliente presenta su reclamo por teléfono al call center. El asesor registra el reclamo en el CRM y valida la identidad del cliente.
Si el reclamo es simple, el asesor lo resuelve en la llamada y envía la confirmación por correo.
En caso contrario, escala el caso al back office. El analista de back office investiga el caso en SAP y solicita información a Operaciones.
El jefe de back office aprueba la resolución. ¿Procede el abono? Si procede, Tesorería realiza el abono en el Core bancario.
Finalmente el asesor notifica al cliente y cierra el reclamo.`,
  compras: `1. El solicitante crea la solicitud de compra en el ERP.
2. El jefe de área revisa y aprueba la solicitud.
3. Compras cotiza con tres proveedores y elige la mejor oferta.
4. Si el monto supera 10.000 soles, Gerencia Financiera autoriza la compra.
5. Compras emite la orden de compra y la envía al proveedor por correo.
6. Almacén recibe la mercadería y verifica la guía de remisión.
7. Cuentas por pagar registra la factura y programa el pago.`,
  // Estilo que el intérprete básico reconoce mejor: primera persona, una acción por frase.
  primeraPersona: `Recibo la solicitud del cliente por correo. Registro los datos en el CRM.
Reviso los documentos adjuntos y verifico la identidad del cliente.
Si el cliente cumple los requisitos, apruebo la solicitud en SAP.
Si no cumple, rechazo la solicitud y notifico al cliente.
¿El monto supera el límite? Escalo el caso al jefe de riesgos.
Genero el contrato y lo envío al cliente para su firma.
Archivo el expediente en SharePoint y cierro el caso.`,
  transcripcion: `María López: Buenos días, les explico cómo hacemos el onboarding.
Carlos Pérez: Primero recibimos la ficha del nuevo colaborador desde Recursos Humanos.
María López: Luego TI crea el usuario en el Active Directory y asigna la laptop.
Carlos Pérez: Si el colaborador es de ventas, además se le da acceso a Salesforce.
Ana Torres: Legal valida el contrato firmado y lo archiva en OnBase.
María López: Al final el jefe directo da la bienvenida y agenda la inducción.`
};

export async function capturarTextoBasico(page, clave) {
  const a = {};
  const texto = TEXTOS[clave];
  a['participantes.json'] = JSON.stringify(await page.evaluate((t) => window.ProcessIQ.detectParticipants(t), texto), null, 2);
  await page.evaluate((t) => { document.querySelector('#notesInput').value = t; }, texto);
  const antes = await contarMensajes(page);
  await page.evaluate(() => { window.ProcessIQ.runIngest(); });
  await page.waitForFunction(() => document.querySelector('#modalCancel')?.textContent === 'Modo básico', null, { timeout: 10_000 });
  const modal = await modalAbierto(page);
  a['dialogo-codigo.html'] = modal ? modal.titulo + '\n' + modal.cuerpo : '(sin modal)';
  await cerrarModal(page);
  await esperar(page, 1500);
  a['mensajes.html'] = await mensajesDesde(page, antes);
  const e = await estadoDiagrama(page);
  a['resumen.json'] = e.resumen;
  a['diagrama.svg'] = e.svg;
  return a;
}

// ------------------------------------------------------- importación BPMN
export async function xmlBpmnDeDemo(page, demo) {
  await page.evaluate((d) => window.ProcessIQ[d](), demo);
  await asentar(page);
  return page.evaluate(() => window.ProcessIQ.generateBpmnXml());
}

export async function capturarImportBpmn(page, xml) {
  const a = {};
  a['resultado.json'] = JSON.stringify(await page.evaluate((x) => window.ProcessIQ.importBpmnXml(x), xml), null, 2);
  await asentar(page);
  const e = await estadoDiagrama(page);
  a['resumen.json'] = e.resumen;
  a['diagrama.svg'] = e.svg;
  a['reexportado.bpmn'] = await page.evaluate(() => window.ProcessIQ.generateBpmnXml());
  return a;
}

// ------------------------------------------------------ IA (simulada)
export const CONFIG_IA = { modo: 'equipo', codigo: 'codigo-prueba', proxyUrl: URL_IA, model: 'claude-opus-5' };

export const SPEC_IA = {
  meta: { name: 'Atención de solicitudes de crédito', industry: 'Banca', macroprocess: 'O2C' },
  ficha: { code: 'PR-CRE-01', objetivo: 'Evaluar y desembolsar créditos de consumo en menos de 48 horas.' },
  nodes: [
    { k: 's', type: 'start', label: 'Solicitud recibida', owner: 'Cliente', nivel: 1 },
    { k: 'a1', type: 'task', label: 'Registrar solicitud', owner: 'Ejecutivo', system: 'CRM', exec: 'system', nivel: 2 },
    { k: 'a1a', type: 'task', label: 'Capturar datos del cliente', owner: 'Ejecutivo', system: 'CRM', exec: 'system', nivel: 3, padre: 'a1' },
    { k: 'a1b', type: 'task', label: 'Adjuntar sustentos', owner: 'Ejecutivo', exec: 'document', nivel: 3, padre: 'a1' },
    { k: 'a2', type: 'task', label: 'Evaluar capacidad de pago', owner: 'Analista de Riesgos', system: 'Scoring', exec: 'ai', nivel: 2 },
    { k: 'd1', type: 'decision', label: '¿Aprobado?', owner: 'Analista de Riesgos', nivel: 1 },
    { k: 'a3', type: 'task', label: 'Desembolsar crédito', owner: 'Operaciones', system: 'Core', exec: 'automatic', nivel: 2 },
    { k: 'a4', type: 'task', label: 'Comunicar rechazo', owner: 'Ejecutivo', exec: 'email', nivel: 2 },
    { k: 'e1', type: 'end', label: 'Crédito desembolsado', owner: 'Cliente', nivel: 1 },
    { k: 'e2', type: 'end', label: 'Solicitud rechazada', owner: 'Cliente', nivel: 1 }
  ],
  edges: [
    { from: 's', to: 'a1a' }, { from: 'a1a', to: 'a1b' }, { from: 'a1b', to: 'a2' }, { from: 'a2', to: 'd1' },
    { from: 'd1', to: 'a3', label: 'Sí' }, { from: 'd1', to: 'a4', label: 'No' },
    { from: 'a3', to: 'e1' }, { from: 'a4', to: 'e2' }
  ]
};

const PAINS_IA = {
  detectados: [
    { nodo: 'n3', categoria: 'rework', descripcion: 'La documentación incompleta obliga a subsanar.', evidencia: 'Loop de subsanación.', severidad: 4, frecuencia: 5, impacto: 'Alarga el ciclo.' },
    { nodo: 'n8', categoria: 'wait', descripcion: 'Espera del perito.', evidencia: 'Tasación manual.', severidad: 5, frecuencia: 4, impacto: 'Retrasa el desembolso.' }
  ],
  sectoriales: [
    { titulo: 'Fraude documental', descripcion: 'Documentos adulterados.', donde: 'Validación', senal: 'Tasa de rechazos por fraude', severidad: 3 }
  ]
};

/** Respuesta SSE en el formato de la API de Anthropic. */
export function sse(texto, { entrada = 1200, salida = 900, modelo = 'claude-opus-5' } = {}) {
  const ev = (type, data) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
  let s = ev('message_start', { message: { id: 'msg_prueba', type: 'message', role: 'assistant', model: modelo, content: [], stop_reason: null, usage: { input_tokens: entrada, output_tokens: 1 } } });
  s += ev('content_block_start', { index: 0, content_block: { type: 'text', text: '' } });
  for (let i = 0; i < texto.length; i += 150) s += ev('content_block_delta', { index: 0, delta: { type: 'text_delta', text: texto.slice(i, i + 150) } });
  s += ev('content_block_stop', { index: 0 });
  s += ev('message_delta', { delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: salida } });
  s += ev('message_stop', {});
  return s;
}

function respuestaPara(cuerpo) {
  const sistema = JSON.stringify(cuerpo.system ?? '');
  if (sistema.includes('Reconstruyes flujos')) return JSON.stringify(SPEC_IA);
  if (sistema.includes('detectados')) return JSON.stringify(PAINS_IA);
  return '**Respuesta simulada.**\n\n| Columna A | Columna B |\n|---|---|\n| uno | dos |\n\n- Punto 1\n- Punto 2';
}

/** Configura la IA en modo equipo contra un intermediario simulado y registra las peticiones. */
export async function prepararIa(ctx, peticiones) {
  await ctx.addInitScript((c) => localStorage.setItem('processiq.ai', JSON.stringify(c)), CONFIG_IA);
  await ctx.route(URL_IA + '/**', async (route) => {
    const req = route.request();
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, GET, OPTIONS' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const cuerpo = req.postDataJSON();
    peticiones.push({ url: req.url(), cabeceras: { codigo: req.headers()['x-processiq-code'], clave: req.headers()['x-api-key'] ?? null }, cuerpo });
    await route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'text/event-stream' }, body: sse(respuestaPara(cuerpo)) });
  });
}

export async function capturarGeneracionIa(page, peticiones) {
  const a = {};
  await page.evaluate((t) => { document.querySelector('#notesInput').value = t; }, TEXTOS.compras);
  const antes = await contarMensajes(page);
  await page.evaluate(() => { window.ProcessIQ.runIngest(); });
  await page.waitForFunction(() => document.querySelector('#modalOk')?.textContent === 'Generar', null, { timeout: 10_000 });
  const modal = await modalAbierto(page);
  a['dialogo-profundidad.html'] = modal ? modal.titulo + '\n' + modal.cuerpo : '(sin modal)';
  await page.evaluate(() => document.querySelector('#modalOk').click());
  await page.waitForFunction(() => /interpretado con IA/.test(document.querySelector('#copilotMessages')?.textContent ?? ''), null, { timeout: 30_000 });
  await asentar(page);
  a['mensajes.html'] = await mensajesDesde(page, antes);
  a['peticiones.json'] = JSON.stringify(peticiones, null, 2);
  const e = await estadoDiagrama(page);
  a['resumen.json'] = e.resumen;
  a['diagrama.svg'] = e.svg;
  for (const nivel of [1, 2, 3]) {
    await page.evaluate((n) => window.ProcessIQ.nivel(n), nivel);
    await asentar(page);
    const en = await estadoDiagrama(page);
    a[`nivel-${nivel}/resumen.json`] = en.resumen;
    a[`nivel-${nivel}/diagrama.svg`] = en.svg;
  }
  a['costes.json'] = await page.evaluate(() => localStorage.getItem('processiq.ia.costes') ?? '');
  return a;
}

export async function capturarTareasIa(page, peticiones) {
  const a = {};
  await page.evaluate(() => window.ProcessIQ.loadComplex());
  await asentar(page);
  const tareas = await page.evaluate(() => window.ProcessIQ.aiTasks());
  for (const t of tareas) {
    peticiones.length = 0;
    const antes = await contarMensajes(page);
    await page.evaluate((k) => document.querySelector(`.copilot-action[data-action="${k}"]`).click(), t);
    await page.waitForFunction((n) => document.querySelectorAll('#copilotMessages > .copilot-msg').length >= n + 3, antes, { timeout: 15_000 }).catch(() => {});
    await esperar(page, 300);
    a[`${t}/mensajes.html`] = await mensajesDesde(page, antes);
    a[`${t}/peticion.json`] = JSON.stringify(peticiones, null, 2);
  }
  peticiones.length = 0;
  const antes = await contarMensajes(page);
  await page.evaluate(() => document.querySelector('.copilot-action[data-action="ai-pains"]').click());
  await esperar(page, 2500);
  a['ai-pains/mensajes.html'] = await mensajesDesde(page, antes);
  a['ai-pains/peticion.json'] = JSON.stringify(peticiones, null, 2);
  const e = await estadoDiagrama(page);
  a['ai-pains/resumen.json'] = e.resumen;
  a['ai-pains/diagrama.svg'] = e.svg;
  return a;
}
