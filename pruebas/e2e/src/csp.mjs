// Cabeceras de seguridad del sitio para el servidor de la E2E, leídas del
// bloque (cabeceras-seguridad) de infra/Caddyfile: así toda la E2E corre con la
// misma Content-Security-Policy y la misma Permissions-Policy que producción.
//
// Solo en las pruebas, la CSP lleva además `report-uri`: el navegador envía
// cada violación (también las de los workers, como el de pdf.js) a
// RUTA_INFORMES_CSP, y el servidor las guarda para csp.spec.mjs y para la
// comprobación final de toda la corrida (comprobar-csp.mjs).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BASE, RAIZ } from './entorno.mjs';

export const RUTA_INFORMES_CSP = '/__informes-csp';

/** Los documentos cuya URL lleva esta marca violan la CSP a propósito (controles de csp.spec.mjs). */
export const MARCA_CONTROL = 'control-csp';

/** { nombre: valor } de las cabeceras que Caddy añade a todas las respuestas. */
export function cabecerasDeCaddy() {
  const caddyfile = readFileSync(join(RAIZ, 'infra', 'Caddyfile'), 'utf8');
  const bloque = caddyfile.match(/\(cabeceras-seguridad\)\s*\{\s*header\s*\{([^}]*)\}/);
  if (!bloque) throw new Error('infra/Caddyfile: no encuentro el bloque (cabeceras-seguridad)');
  const cabeceras = {};
  for (const linea of bloque[1].split('\n')) {
    const m = linea.match(/^\s*([A-Za-z][A-Za-z-]*)\s+"([^"]*)"\s*$/);
    if (m) cabeceras[m[1]] = m[2];
  }
  if (!cabeceras['Content-Security-Policy'] && !cabeceras['Content-Security-Policy-Report-Only']) {
    throw new Error('infra/Caddyfile: el bloque (cabeceras-seguridad) no tiene Content-Security-Policy');
  }
  return cabeceras;
}

/** Las de Caddy, con `report-uri` en la CSP (sea obligatoria o de solo informe). */
export function cabecerasDePrueba() {
  const cabeceras = cabecerasDeCaddy();
  for (const nombre of ['Content-Security-Policy', 'Content-Security-Policy-Report-Only']) {
    if (cabeceras[nombre]) cabeceras[nombre] += `; report-uri ${RUTA_INFORMES_CSP}`;
  }
  return cabeceras;
}

/** Atiende RUTA_INFORMES_CSP: POST (el navegador informa) y GET (las pruebas consultan). */
export function atenderInformes(req, res, informes) {
  if (req.method === 'GET') {
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(informes));
    return;
  }
  let cuerpo = '';
  req.on('data', (t) => { cuerpo += t; });
  req.on('end', () => {
    try {
      const informe = JSON.parse(cuerpo)['csp-report'] ?? {};
      const i = {
        documento: informe['document-uri'] ?? '',
        directiva: informe['effective-directive'] ?? informe['violated-directive'] ?? '',
        bloqueado: informe['blocked-uri'] ?? '',
        archivo: informe['source-file'] ?? '',
        linea: informe['line-number'] ?? null,
        disposicion: informe.disposition ?? ''
      };
      informes.push(i);
      console.error(`CSP (${i.disposicion}): ${i.directiva} bloquea «${i.bloqueado}» en ${i.documento}` +
        (i.archivo ? ` (${i.archivo}:${i.linea})` : ''));
    } catch {
      console.error('CSP: informe ilegible: ' + cuerpo.slice(0, 200));
    }
    res.writeHead(204).end();
  });
}

/** Violaciones registradas por el servidor de la E2E (para las pruebas). */
export async function informesCsp() {
  const r = await fetch(BASE + RUTA_INFORMES_CSP);
  return r.json();
}
