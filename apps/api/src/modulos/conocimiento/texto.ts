// Texto buscable de un proceso (contenido v1 de @processiq/dominio): nombre,
// actividades, sistemas, roles (carriles) y ficha. Solo lectura del contenido:
// no depende de la base y se prueba sin ella.
import type { ProyectoV1 } from '@processiq/dominio';

export type Campo = 'nombre' | 'actividad' | 'sistema' | 'rol' | 'elemento' | 'ficha';

/** Un trozo del proceso con el campo del que sale (para el extracto de los resultados). */
export interface Fragmento {
  campo: Campo;
  texto: string;
  /** Solo en la ficha: qué parte es (Objetivo, Alcance…). */
  etiqueta?: string;
}

/** Actividad del diagrama: tareas y actividades de sistema. */
export interface Actividad {
  id: string;
  texto: string;
  rol: string;
  sistema: string;
}

export interface TextoProceso {
  fragmentos: Fragmento[];
  /** Todo lo buscable, un fragmento por línea. */
  texto: string;
  /**
   * Con lo que se comparan procesos entre sí, ya normalizado: nombre, objeto de
   * cada actividad (sin el verbo), sistemas y roles, sin palabras vacías ni ficha.
   * Los verbos («registrar», «gestionar»…) y la ficha los comparten procesos que
   * no se parecen en nada y tapaban lo que sí distingue a uno de otro.
   */
  textoParecido: string;
}

const TIPOS_ACTIVIDAD = new Set(['task', 'system']);
/** Límite por fragmento: una descripción enorme no debe dominar el índice. */
const MAX_FRAGMENTO = 2000;
export const PALABRAS_VACIAS = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y', 'o', 'e', 'u', 'en', 'a', 'al', 'por', 'para', 'con', 'sin', 'un', 'una', 'que', 'se', 'su', 'sus', 'lo']);

const limpio = (v: unknown): string =>
  typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, MAX_FRAGMENTO) : '';

/** Minúsculas y sin tildes, como conocimiento_normalizar() en Postgres (para comparar en la API). */
export function normalizar(v: string): string {
  return v.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Palabras normalizadas (letras y números), en orden. */
export const palabras = (v: string): string[] => normalizar(v).split(/[^a-z0-9]+/).filter(Boolean);

/**
 * Contenido v1 (ProyectoV1) leído de forma defensiva: la API ya lo validó al
 * guardarlo, pero aquí basta con que cada campo tenga la forma esperada.
 */
type Contenido = { [K in keyof ProyectoV1]?: unknown } & Record<string, any>;

/** Actividades en el orden del diagrama, sin los grupos que genera el nivel Ejecutivo. */
export function actividadesDe(contenido: Contenido): Actividad[] {
  const nodos = Array.isArray(contenido.nodes) ? contenido.nodes : [];
  return nodos
    .filter((n: any) => n && TIPOS_ACTIVIDAD.has(n.type) && !n._autoGen && limpio(n.label))
    .map((n: any) => ({ id: String(n.id), texto: limpio(n.label), rol: limpio(n.owner) || limpio(n.role), sistema: limpio(n.system) }));
}

/**
 * Fragmentos del proceso, sin repetir (misma frase y mismo campo). No incluye
 * nombres de personas (gobernanza) ni el cliente: solo lo que describe el proceso.
 */
export function textoDeProceso(nombreProceso: string, contenido: Contenido): TextoProceso {
  const fragmentos: Fragmento[] = [];
  const vistos = new Set<string>();
  const poner = (campo: Campo, valor: unknown, etiqueta?: string) => {
    const texto = limpio(valor);
    if (!texto) return;
    const clave = `${campo}|${normalizar(texto)}`;
    if (vistos.has(clave)) return;
    vistos.add(clave);
    fragmentos.push(etiqueta ? { campo, texto, etiqueta } : { campo, texto });
  };

  const meta = (contenido.meta ?? {}) as Record<string, unknown>;
  const ficha = (contenido.ficha ?? {}) as Record<string, any>;
  const nodos: any[] = Array.isArray(contenido.nodes) ? contenido.nodes : [];

  poner('nombre', nombreProceso);
  poner('nombre', meta.name);
  for (const a of actividadesDe(contenido)) poner('actividad', a.texto);
  for (const n of nodos) {
    if (n && !TIPOS_ACTIVIDAD.has(n.type) && !n._autoGen) poner('elemento', n.label);
  }
  for (const n of nodos) poner('sistema', n?.system);
  for (const s of Array.isArray(ficha.sistemas) ? ficha.sistemas : []) poner('sistema', s?.nombre);
  for (const n of nodos) { poner('rol', n?.owner); poner('rol', n?.role); }
  for (const g of Array.isArray(ficha.gobernanza) ? ficha.gobernanza : []) poner('rol', g?.cargo);

  poner('ficha', meta.industry, 'Industria');
  poner('ficha', meta.macroprocess, 'Macroproceso');
  poner('ficha', ficha.objetivo, 'Objetivo');
  poner('ficha', ficha.descripcion, 'Descripción');
  poner('ficha', ficha.alcanceAreas, 'Áreas');
  poner('ficha', ficha.alcanceDesde, 'Desde');
  poner('ficha', ficha.alcanceHasta, 'Hasta');
  poner('ficha', ficha.alcanceIncluye, 'Incluye');

  const utiles = (ps: string[]) => ps.filter((p) => !PALABRAS_VACIAS.has(p)).join(' ');
  const parecido = fragmentos.flatMap((f) => {
    if (f.campo === 'actividad') {
      // Playbook: «verbo + objeto». Sin el verbo queda lo que distingue a la actividad.
      const ps = palabras(f.texto);
      return [utiles(ps.length > 1 ? ps.slice(1) : ps)];
    }
    return f.campo === 'nombre' || f.campo === 'sistema' || f.campo === 'rol' ? [utiles(palabras(f.texto))] : [];
  }).filter(Boolean);

  return {
    fragmentos,
    texto: fragmentos.map((f) => f.texto).join('\n'),
    textoParecido: parecido.join('\n')
  };
}

/** Trigramas como los de pg_trgm: cada palabra con dos espacios delante y uno detrás. */
function trigramas(v: string): Set<string> {
  const r = new Set<string>();
  for (const p of palabras(v)) {
    const t = `  ${p} `;
    for (let i = 0; i + 3 <= t.length; i++) r.add(t.slice(i, i + 3));
  }
  return r;
}

/** Parecido de trigramas entre dos frases (0 a 1), como similarity() de pg_trgm. */
export function parecidoFrases(a: string, b: string): number {
  const x = trigramas(a), y = trigramas(b);
  let comunes = 0;
  for (const t of x) if (y.has(t)) comunes++;
  const union = x.size + y.size - comunes;
  return union ? comunes / union : 0;
}

/**
 * Extracto de un fragmento largo alrededor de la primera palabra buscada, para
 * que el resultado muestre dónde coincide. Los cortes llevan «…».
 */
export function recortar(texto: string, terminos: string[], largo = 180): string {
  if (texto.length <= largo) return texto;
  // Un carácter normalizado por cada carácter original: las posiciones coinciden
  const plano = texto.split('').map((ch) => (normalizar(ch) || ch)[0]).join('');
  let pos = -1;
  for (const t of terminos) {
    const i = plano.indexOf(t);
    if (i >= 0 && (pos < 0 || i < pos)) pos = i;
  }
  if (pos < 0) pos = 0;
  let inicio = Math.max(0, pos - Math.floor(largo / 3));
  const antes = texto.lastIndexOf(' ', inicio);
  if (inicio > 0 && antes > inicio - 20) inicio = antes + 1;
  let fin = Math.min(texto.length, inicio + largo);
  const despues = texto.indexOf(' ', fin);
  if (fin < texto.length && despues > 0 && despues < fin + 20) fin = despues;
  return (inicio > 0 ? '…' : '') + texto.slice(inicio, fin).trim() + (fin < texto.length ? '…' : '');
}
