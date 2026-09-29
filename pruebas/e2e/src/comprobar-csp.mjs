// Al terminar toda la E2E (globalTeardown): ninguna prueba debe haber violado
// la CSP, aunque la violación no la haya roto. El servidor de la web registra
// cada una (src/csp.mjs); solo se descuentan los controles de csp.spec.mjs.
import { MARCA_CONTROL, informesCsp } from './csp.mjs';

export default async function comprobarCsp() {
  let informes;
  try {
    informes = await informesCsp();
  } catch {
    // Si el servidor no llegó a arrancar, la corrida ya falló por eso
    console.error('comprobar-csp: el servidor de la web no responde; no se revisan las violaciones de la CSP.');
    return;
  }
  informes = informes.filter((i) => !i.documento.includes(MARCA_CONTROL));
  if (informes.length) {
    throw new Error(`La E2E violó la Content-Security-Policy ${informes.length} vez/veces:\n` +
      informes.map((i) => `  - ${i.directiva} bloquea «${i.bloqueado}» en ${i.documento}${i.archivo ? ` (${i.archivo}:${i.linea})` : ''}`).join('\n') +
      '\nRevisa infra/Caddyfile y docs/tecnica/seguridad.md §9.');
  }
}
