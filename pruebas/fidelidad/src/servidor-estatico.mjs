// Servidor estatico minimo (sin dependencias) para las pruebas de fidelidad.
// Uso: node src/servidor-estatico.mjs <carpeta> <puerto>
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const [, , carpeta, puerto] = process.argv;
if (!carpeta || !puerto) {
  console.error('Uso: node servidor-estatico.mjs <carpeta> <puerto>');
  process.exit(1);
}
const raiz = resolve(carpeta);
const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.map': 'application/json'
};

createServer(async (req, res) => {
  try {
    const ruta = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let archivo = normalize(join(raiz, ruta));
    if (!archivo.startsWith(raiz)) { res.writeHead(403).end(); return; }
    if ((await stat(archivo).catch(() => null))?.isDirectory()) archivo = join(archivo, 'index.html');
    const datos = await readFile(archivo);
    res.writeHead(200, { 'content-type': TIPOS[extname(archivo)] || 'application/octet-stream' }).end(datos);
  } catch {
    res.writeHead(404).end('no encontrado');
  }
}).listen(Number(puerto), '127.0.0.1', () => console.log(`sirviendo ${raiz} en http://127.0.0.1:${puerto}`));
