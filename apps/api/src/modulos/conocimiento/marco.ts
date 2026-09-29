// Marco de referencia (APQC PCF u otro con la misma forma): lectura del CSV,
// validación y cobertura de un proceso por categoría de nivel 1. Sin base de
// datos: se prueba aparte y lo usan las rutas.
import { normalizar } from './texto.js';

export interface ElementoMarco {
  codigo: string;
  nombre: string;
  descripcion: string;
  nivel: number;
  orden: number;
}

export interface LecturaMarco {
  elementos: ElementoMarco[];
  errores: string[];
  avisos: string[];
}

export const MAX_ELEMENTOS = 20_000;
const MAX_NOMBRE = 500;
const MAX_DESCRIPCION = 4000;
const MAX_ERRORES = 30;

/** Cabeceras aceptadas (sin tildes ni mayúsculas): las del APQC en inglés y en español, y las propias. */
const COLUMNAS = {
  codigo: ['codigo', 'code', 'hierarchy id', 'hierarchyid', 'hierarchy', 'id jerarquico', 'id de jerarquia', 'jerarquia', 'codigo jerarquico'],
  nombre: ['nombre', 'name', 'element name', 'elemento', 'element', 'nombre del elemento', 'proceso', 'process', 'titulo', 'title'],
  descripcion: ['descripcion', 'description', 'element description', 'descripcion del elemento', 'definicion', 'definition']
} as const;

/**
 * CSV a filas (RFC 4180): comillas dobles con "" dentro, saltos de línea dentro
 * de comillas, fin de línea CRLF o LF y BOM. El separador (coma, punto y coma o
 * tabulador) se deduce de la cabecera: Excel en español guarda con «;».
 */
export function leerCsv(texto: string): string[][] {
  if (texto.charCodeAt(0) === 0xfeff) texto = texto.slice(1);
  const primera = texto.slice(0, texto.search(/\r|\n|$/));
  const cuenta = (c: string) => primera.split(c).length - 1;
  const sep = [';', '\t', ','].reduce((a, b) => (cuenta(b) > cuenta(a) ? b : a), ',');

  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = '';
  let comillas = false;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i]!;
    if (comillas) {
      if (ch === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i++; } else comillas = false;
      } else campo += ch;
    } else if (ch === '"' && campo === '') {
      comillas = true;
    } else if (ch === sep) {
      fila.push(campo); campo = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && texto[i + 1] === '\n') i++;
      fila.push(campo); filas.push(fila); fila = []; campo = '';
    } else campo += ch;
  }
  if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila); }
  return filas;
}

const cabecera = (v: string) => normalizar(v).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Segmentos numéricos de un código jerárquico («1.2.3» -> [1, 2, 3]); null si no lo es. */
export function segmentos(codigo: string): number[] | null {
  if (!/^\d+(\.\d+)*$/.test(codigo)) return null;
  return codigo.split('.').map(Number);
}

/** Nivel según el código: 1.0 (o 1) -> 1; 1.2 -> 2; 1.2.3 -> 3… */
export function nivelDe(segs: number[]): number {
  if (segs.length === 1 || (segs.length === 2 && segs[1] === 0)) return 1;
  return segs.length;
}

/** Orden natural de códigos (1.2 antes que 1.10). */
export function compararCodigos(a: string, b: string): number {
  const x = segmentos(a) ?? [], y = segmentos(b) ?? [];
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? -1) - (y[i] ?? -1);
    if (d) return d;
  }
  return 0;
}

/** Clave de la categoría de nivel 1 («4») y del grupo de nivel 2 («4.2»), si lo tiene. */
export function ubicacion(codigo: string): { categoria: string; grupo: string | null } {
  const segs = segmentos(codigo) ?? [0];
  const nivel = nivelDe(segs);
  return { categoria: String(segs[0]), grupo: nivel >= 2 ? `${segs[0]}.${segs[1]}` : null };
}

/** Lee y valida el CSV del marco. Con errores no se importa nada. */
export function interpretarMarco(texto: string): LecturaMarco {
  const errores: string[] = [];
  const avisos: string[] = [];
  const filas = leerCsv(texto);
  const iCab = filas.findIndex((f) => f.some((c) => c.trim() !== ''));
  if (iCab < 0) return { elementos: [], errores: ['El archivo está vacío.'], avisos };

  const nombres = filas[iCab]!.map(cabecera);
  const columna = (opciones: readonly string[]) => nombres.findIndex((n) => opciones.includes(n));
  const col = { codigo: columna(COLUMNAS.codigo), nombre: columna(COLUMNAS.nombre), descripcion: columna(COLUMNAS.descripcion) };
  if (col.codigo < 0 || col.nombre < 0) {
    const vistas = filas[iCab]!.map((c) => c.trim()).filter(Boolean).slice(0, 8).join(', ');
    return {
      elementos: [], avisos,
      errores: [`Faltan columnas: el CSV debe tener «Código» y «Nombre» (o «Hierarchy ID» y «Name», como el APQC). Columnas encontradas: ${vistas || 'ninguna'}.`]
    };
  }

  const elementos: ElementoMarco[] = [];
  const filaDe = new Map<string, number>();
  const error = (m: string) => { if (errores.length < MAX_ERRORES) errores.push(m); else if (errores.length === MAX_ERRORES) errores.push('… y más errores.'); };
  for (let i = iCab + 1; i < filas.length; i++) {
    const f = filas[i]!;
    const n = i + 1; // fila del archivo, contando la cabecera
    const codigo = (f[col.codigo] ?? '').trim().replace(/\.$/, '');
    const nombre = (f[col.nombre] ?? '').replace(/\s+/g, ' ').trim();
    const descripcion = col.descripcion >= 0 ? (f[col.descripcion] ?? '').replace(/\s+/g, ' ').trim() : '';
    if (!codigo && !nombre) continue;
    const segs = segmentos(codigo);
    if (!segs) { error(`Fila ${n}: el código «${codigo.slice(0, 40)}» no es jerárquico (por ejemplo 1.0, 1.2 o 1.2.3).`); continue; }
    if (!nombre) { error(`Fila ${n}: el elemento ${codigo} no tiene nombre.`); continue; }
    if (nombre.length > MAX_NOMBRE) { error(`Fila ${n}: el nombre de ${codigo} pasa de ${MAX_NOMBRE} caracteres.`); continue; }
    if (descripcion.length > MAX_DESCRIPCION) { error(`Fila ${n}: la descripción de ${codigo} pasa de ${MAX_DESCRIPCION} caracteres.`); continue; }
    const nivel = nivelDe(segs);
    // 1 y 1.0 son la misma categoría
    const clave = nivel === 1 ? String(segs[0]) : segs.join('.');
    const previa = filaDe.get(clave);
    if (previa !== undefined) { error(`Fila ${n}: el código ${codigo} está repetido (fila ${previa}).`); continue; }
    filaDe.set(clave, n);
    elementos.push({ codigo: nivel === 1 ? `${segs[0]}.0` : segs.join('.'), nombre, descripcion, nivel, orden: elementos.length });
  }
  if (!elementos.length && !errores.length) errores.push('El archivo no tiene elementos: solo la cabecera.');
  if (elementos.length > MAX_ELEMENTOS) errores.push(`El marco tiene ${elementos.length} elementos; el máximo es ${MAX_ELEMENTOS}.`);

  // Huecos en la jerarquía: se importan igual, pero se avisa
  const categorias = new Set(elementos.filter((e) => e.nivel === 1).map((e) => ubicacion(e.codigo).categoria));
  const huerfanas = new Set(elementos.map((e) => ubicacion(e.codigo).categoria).filter((c) => !categorias.has(c)));
  if (huerfanas.size) {
    avisos.push(`Hay elementos de categorías sin fila de nivel 1 (${[...huerfanas].slice(0, 6).map((c) => `${c}.0`).join(', ')}): en el comparativo aparecerán sin nombre.`);
  }
  return { elementos, errores, avisos };
}

/** Resumen para la vista previa y para la pantalla del marco. */
export function resumenMarco(elementos: Pick<ElementoMarco, 'codigo' | 'nombre' | 'nivel'>[]) {
  const porNivel: Record<string, number> = {};
  const porCategoria = new Map<string, number>();
  for (const e of elementos) {
    porNivel[e.nivel] = (porNivel[e.nivel] ?? 0) + 1;
    const c = ubicacion(e.codigo).categoria;
    porCategoria.set(c, (porCategoria.get(c) ?? 0) + 1);
  }
  const nombreDe = new Map(elementos.filter((e) => e.nivel === 1).map((e) => [ubicacion(e.codigo).categoria, e.nombre]));
  const categorias = [...porCategoria.entries()]
    .map(([c, n]) => ({ codigo: `${c}.0`, nombre: nombreDe.get(c) ?? `Categoría ${c}`, elementos: n }))
    .sort((a, b) => compararCodigos(a.codigo, b.codigo));
  return { elementos: elementos.length, porNivel, categorias };
}

export interface Asignacion {
  /** Código del elemento del marco más parecido a la actividad (null si ninguno supera el umbral). */
  codigo: string | null;
}

export interface CoberturaCategoria {
  codigo: string;
  nombre: string;
  /** Actividades del proceso asignadas a esta categoría. */
  actividades: number;
  /** Grupos de nivel 2 de la categoría. */
  grupos: number;
  gruposCubiertos: { codigo: string; nombre: string; actividades: number }[];
  gruposFaltantes: { codigo: string; nombre: string }[];
  /** Grupos cubiertos / grupos (null si la categoría no tiene grupos). */
  cobertura: number | null;
}

/**
 * Cobertura por categoría de nivel 1: un grupo de nivel 2 está cubierto si al
 * menos una actividad cae en él o en algo por debajo. Incluye las categorías
 * sin actividades, para ver también lo que falta.
 */
export function coberturaPorCategoria(
  elementos: Pick<ElementoMarco, 'codigo' | 'nombre' | 'nivel'>[], asignaciones: Asignacion[]
): CoberturaCategoria[] {
  const actividadesPorCategoria = new Map<string, number>();
  const actividadesPorGrupo = new Map<string, number>();
  for (const a of asignaciones) {
    if (!a.codigo) continue;
    const { categoria, grupo } = ubicacion(a.codigo);
    actividadesPorCategoria.set(categoria, (actividadesPorCategoria.get(categoria) ?? 0) + 1);
    if (grupo) actividadesPorGrupo.set(grupo, (actividadesPorGrupo.get(grupo) ?? 0) + 1);
  }
  const claves = new Set([
    ...elementos.filter((e) => e.nivel === 1).map((e) => ubicacion(e.codigo).categoria),
    ...actividadesPorCategoria.keys()
  ]);
  const nombreCategoria = new Map(elementos.filter((e) => e.nivel === 1).map((e) => [ubicacion(e.codigo).categoria, e.nombre]));
  const grupos = elementos.filter((e) => e.nivel === 2).sort((a, b) => compararCodigos(a.codigo, b.codigo));
  return [...claves].map((c) => {
    const suyos = grupos.filter((g) => ubicacion(g.codigo).categoria === c);
    const cubiertos = suyos.filter((g) => actividadesPorGrupo.has(g.codigo));
    return {
      codigo: `${c}.0`,
      nombre: nombreCategoria.get(c) ?? `Categoría ${c}`,
      actividades: actividadesPorCategoria.get(c) ?? 0,
      grupos: suyos.length,
      gruposCubiertos: cubiertos.map((g) => ({ codigo: g.codigo, nombre: g.nombre, actividades: actividadesPorGrupo.get(g.codigo)! })),
      gruposFaltantes: suyos.filter((g) => !actividadesPorGrupo.has(g.codigo)).map((g) => ({ codigo: g.codigo, nombre: g.nombre })),
      cobertura: suyos.length ? cubiertos.length / suyos.length : null
    };
  }).sort((a, b) => compararCodigos(a.codigo, b.codigo));
}
