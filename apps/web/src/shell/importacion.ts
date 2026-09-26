// Importación asistida (fase 3): lo que cada consultor tiene en el editor libre
// de ESTE navegador (localStorage «processiq.v1», el mismo origen que el shell)
// o en archivos JSON exportados desde el editor.

export const CLAVE_EDITOR_LIBRE = 'processiq.v1';
const CLAVE_DESCARTADO = 'processiq.importacion.descartado';

export interface ProcesoLocal {
  nombre: string;
  nodos: number;
  industria: string;
  guardadoEn: string | null;
  contenido: Record<string, unknown>;
}

function resumen(contenido: Record<string, any>): ProcesoLocal {
  const meta = contenido.meta ?? {};
  return {
    nombre: String(meta.name || '').trim(),
    nodos: Array.isArray(contenido.nodes) ? contenido.nodes.length : 0,
    industria: String(meta.industry || ''),
    guardadoEn: typeof contenido.savedAt === 'string' ? contenido.savedAt : typeof contenido.exportedAt === 'string' ? contenido.exportedAt : null,
    contenido
  };
}

/** El proceso del editor libre de este navegador, si tiene algo dibujado. */
export function procesoDelEditorLibre(): ProcesoLocal | null {
  try {
    const crudo = localStorage.getItem(CLAVE_EDITOR_LIBRE);
    if (!crudo) return null;
    const p = resumen(JSON.parse(crudo));
    return p.nodos > 0 ? p : null;
  } catch {
    return null;
  }
}

/** Un archivo JSON exportado desde el editor («Exportar → JSON»). */
export async function procesoDeArchivo(archivo: File): Promise<ProcesoLocal> {
  let contenido: unknown;
  try { contenido = JSON.parse(await archivo.text()); } catch { throw new Error('No es un JSON válido.'); }
  if (!contenido || typeof contenido !== 'object' || !Array.isArray((contenido as any).nodes)) {
    throw new Error('No parece un proceso exportado desde el editor (falta la lista de elementos).');
  }
  const p = resumen(contenido as Record<string, unknown>);
  if (!p.nombre) p.nombre = archivo.name.replace(/\.json$/i, '');
  return p;
}

/** ¿Hay que ofrecer la importación en la lista de proyectos? (no si ya la descartó para ESTE guardado) */
export function ofrecerImportacion(p: ProcesoLocal | null): boolean {
  if (!p) return false;
  try { return localStorage.getItem(CLAVE_DESCARTADO) !== (p.guardadoEn ?? 'sin-fecha'); } catch { return true; }
}

export function descartarOferta(p: ProcesoLocal): void {
  try { localStorage.setItem(CLAVE_DESCARTADO, p.guardadoEn ?? 'sin-fecha'); } catch { /* sin almacenamiento */ }
}

export function vaciarEditorLibre(): void {
  try { localStorage.removeItem(CLAVE_EDITOR_LIBRE); } catch { /* sin almacenamiento */ }
}
