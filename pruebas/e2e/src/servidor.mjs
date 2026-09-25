// Servidor de las pruebas E2E: hace lo mismo que Caddy en el servidor real.
// - /api/*         -> la API (PUERTO_API)
// - /proyectos/... -> proyectos/index.html si no es un archivo (rutas del shell)
// - el resto       -> archivos de apps/web/dist
import { createServer, request } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { PUERTO_API, PUERTO_WEB, RAIZ } from './entorno.mjs';

const DIST = join(RAIZ, 'apps', 'web', 'dist');
const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json',
  '.map': 'application/json', '.woff2': 'font/woff2'
};

function aLaApi(req, res) {
  const proxy = request({ host: '127.0.0.1', port: PUERTO_API, path: req.url, method: req.method, headers: req.headers }, (r) => {
    res.writeHead(r.statusCode ?? 502, r.headers);
    r.pipe(res);
  });
  proxy.on('error', () => { res.writeHead(502).end('API no disponible'); });
  req.pipe(proxy);
}

createServer(async (req, res) => {
  const ruta = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
  if (ruta.startsWith('/api/')) return aLaApi(req, res);
  try {
    let archivo = normalize(join(DIST, ruta));
    if (!archivo.startsWith(DIST)) { res.writeHead(403).end(); return; }
    if (/^\/proyectos(\/|$)/.test(ruta) && !extname(ruta)) archivo = join(DIST, 'proyectos', 'index.html');
    if ((await stat(archivo).catch(() => null))?.isDirectory()) archivo = join(archivo, 'index.html');
    const datos = await readFile(archivo);
    res.writeHead(200, { 'content-type': TIPOS[extname(archivo)] || 'application/octet-stream' }).end(datos);
  } catch {
    res.writeHead(404).end('no encontrado');
  }
}).listen(PUERTO_WEB, '127.0.0.1', () => console.log(`E2E: web en http://127.0.0.1:${PUERTO_WEB} (API en :${PUERTO_API})`));
