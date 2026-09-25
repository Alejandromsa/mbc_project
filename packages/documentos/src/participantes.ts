// Participantes de una transcripción (Teams/Zoom: "Nombre: texto").
// Portado del MVP 3.8.9 (detectParticipants) sin cambios de lógica.

export interface Participante {
  nombre: string;
  /** Líneas en que interviene. */
  veces: number;
  /** Texto entre paréntesis tras el nombre (suele ser el cargo). */
  pista: string;
}

/** Personas con 2+ intervenciones, las más activas primero (máximo 12). */
export function detectarParticipantes(text: string): Participante[] {
  const counts: Record<string, Participante> = {};
  const lines = String(text || '').split(/\r?\n/);
  const re = /^\s*(?:\[?\d{1,2}:\d{2}(?::\d{2})?\]?\s*)?([A-ZÁÉÍÓÚÑ][\wÀ-ſ.'-]+(?:\s+[A-ZÁÉÍÓÚÑ][\wÀ-ſ.'-]+){0,3})\s*(?:\(([^)]{2,40})\))?\s*:\s*\S/;
  const RUIDO = new Set(['nota','notas','ejemplo','objetivo','alcance','proceso','paso','pasos','resumen',
    'observacion','conclusion','importante','atencion','sistema','sistemas','actividad','actividades',
    'responsable','responsables','fecha','tema','agenda','http','https','nota1','anexo']);
  lines.forEach(l => {
    const m = l.match(re);
    if (!m) return;
    const nombre = m[1]!.trim();
    if (nombre.length < 3 || nombre.length > 48) return;
    const first = nombre.toLowerCase().split(/\s+/)[0]!;
    if (RUIDO.has(first.normalize('NFD').replace(/[̀-ͯ]/g, ''))) return;
    if (/^\d/.test(nombre)) return;
    counts[nombre] = counts[nombre] || { nombre, veces: 0, pista: '' };
    counts[nombre].veces++;
    if (m[2] && !counts[nombre].pista) counts[nombre].pista = m[2].trim();
  });
  return Object.values(counts).filter(p => p.veces >= 2)
    .sort((a, b) => b.veces - a.veces).slice(0, 12);
}

