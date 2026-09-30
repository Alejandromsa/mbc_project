// Anthropic falso para las pruebas E2E: responde /v1/messages en streaming
// (SSE) como la API real, sin red ni gasto. Además arranca el worker de IA de
// la API apuntando aquí (Playwright solo espera a servicios con URL).
//   generación (max_tokens grande) -> un proceso de 3 elementos
//   tarea del copiloto              -> markdown
//   pains                           -> JSON de dolores
//   matriz RACI o SIPOC (D12)       -> JSON con la forma de la matriz
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { PUERTO_ANTHROPIC, RAIZ, URL_BASE_DATOS } from './entorno.mjs';

const SPEC = {
  meta: { name: 'Atención de reclamos', industry: 'Seguros' },
  nodes: [
    { k: 'a1', type: 'start', label: 'Llega el reclamo', owner: 'Cliente' },
    { k: 'a2', type: 'task', label: 'Registrar el reclamo', owner: 'Mesa de ayuda', system: 'CRM' },
    { k: 'a3', type: 'end', label: 'Reclamo atendido', owner: 'Mesa de ayuda' }
  ],
  edges: [{ from: 'a1', to: 'a2' }, { from: 'a2', to: 'a3' }]
};

// Matrices del copiloto (divergencia D12): el SIPOC, fijo; la RACI, del resumen del proceso
// que llega en la petición: R/A al rol de cada actividad y la auditoría interna informada.
// ia.spec.mjs los repite (importar este archivo arrancaría el servidor y el worker).
const SIPOC_E2E = {
  suppliers: 'Asegurado, Taller afiliado', inputs: 'Denuncia del siniestro, Póliza vigente',
  process: 'Registrar, Peritar, Liquidar, Pagar', outputs: 'Indemnización pagada', customers: 'Asegurado, Reaseguros'
};
const ROL_E2E = 'Auditoría interna';
function matriz(contenido) {
  if (contenido.startsWith('Construye el SIPOC')) return SIPOC_E2E;
  const raci = {};
  for (const linea of contenido.split('\n')) {
    const id = /^id=(\S+) - tipo=(task|system|decision)\b/.exec(linea);
    const rol = / - rol=(.+?)(?= - |$)/.exec(linea);
    if (id && rol) raci[id[1]] = { [rol[1]]: 'R/A', [ROL_E2E]: 'I' };
  }
  return raci;
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const evento = (d) => `event: ${d.type}\ndata: ${JSON.stringify(d)}\n\n`;

createServer((req, res) => {
  if (req.url === '/salud') { res.writeHead(200).end('ok'); return; }
  if (req.method !== 'POST' || req.url !== '/v1/messages') { res.writeHead(404).end(); return; }
  let cuerpo = '';
  req.on('data', (c) => { cuerpo += c; });
  req.on('end', async () => {
    if (req.headers['x-api-key'] !== 'sk-ant-e2e') {
      res.writeHead(401, { 'content-type': 'application/json' }).end('{"error":{"message":"invalid x-api-key"}}');
      return;
    }
    const b = JSON.parse(cuerpo);
    const contenido = String(b.messages?.[0]?.content ?? '');
    const texto = String(b.system ?? '').includes('con la forma exacta que pide la tarea') ? JSON.stringify(matriz(contenido))
      : b.max_tokens >= 16000 ? JSON.stringify(SPEC)
      : contenido.includes('=== PROCESO A ANALIZAR ===') ? '## Análisis del servidor\n- Resultado de prueba'
      : JSON.stringify({ detectados: [], sectoriales: [{ titulo: 'Fraude en reclamos', descripcion: 'Hipótesis de prueba' }] });
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write(evento({ type: 'message_start', message: { model: b.model, usage: { input_tokens: 1200 } } }));
    // En trozos y con pausa: el editor debe mostrar el progreso
    const trozos = texto.match(/[\s\S]{1,60}/g) ?? [texto];
    for (const t of trozos) {
      res.write(evento({ type: 'content_block_delta', delta: { type: 'text_delta', text: t } }));
      await esperar(40);
    }
    res.write(evento({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 800 } }));
    res.end();
  });
}).listen(PUERTO_ANTHROPIC, '127.0.0.1', () => console.log(`E2E: Anthropic falso en :${PUERTO_ANTHROPIC}`));

// Worker de IA (tsx, sin construir) apuntando a este servidor
const worker = spawn('pnpm --filter @processiq/api exec tsx src/worker.ts', {
  cwd: RAIZ,
  shell: true,
  stdio: 'inherit',
  env: {
    ...process.env, DATABASE_URL: URL_BASE_DATOS, ANTHROPIC_API_KEY: 'sk-ant-e2e',
    ANTHROPIC_BASE_URL: `http://127.0.0.1:${PUERTO_ANTHROPIC}`, IA_CONCURRENCIA: '2', LATIDO_SEGUNDOS: '3'
  }
});
const parar = () => { worker.kill(); process.exit(0); };
process.on('SIGINT', parar);
process.on('SIGTERM', parar);
