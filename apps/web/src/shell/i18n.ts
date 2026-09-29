// Idioma de la plataforma (/proyectos/): español, el de siempre y por defecto, e
// inglés. Sin dependencias: diccionarios tipados, `useT()` y formatos con Intl.
// El editor (/) no pasa por aquí y sigue en español.
//
// - El español es la fuente de verdad. El diccionario inglés tiene el tipo
//   `Traduccion<typeof es>`: si le falta una clave, una variable `{x}` o una
//   etiqueta `<x>` del español, no compila.
// - `t('clave', { variables })` devuelve texto; `t.rico(…)` admite etiquetas
//   (`<strong>`, `<em>`, `<code>` y las que se pasen, como un enlace).
// - Plurales: `{ uno: 'Un proceso', otros: '{n} procesos', cero?: 'Ningún proceso' }`,
//   elegidos con Intl.PluralRules según la variable `n`.
// - La preferencia se guarda en localStorage (`processiq.idioma`). Sin ella, español,
//   aunque el navegador esté en inglés: el equipo y las pruebas cuentan con él.
import { createElement, Fragment, useSyncExternalStore, type ReactNode } from 'react';
import type { EstadoRevision, RolOrganizacion, RolProyecto } from './api';
import { LOCALES, fecha, numero, textosDominio, type Idioma } from './formato';
import { es } from './textos/es';
import { en } from './textos/en';

export type { Idioma } from './formato';
export const IDIOMAS: readonly Idioma[] = ['es', 'en'];
export const CLAVE_IDIOMA = 'processiq.idioma';

// ---------------------------------------------------------------- Idioma elegido

function guardado(): Idioma {
  try { return localStorage.getItem(CLAVE_IDIOMA) === 'en' ? 'en' : 'es'; } catch { return 'es'; }
}

let actual: Idioma = guardado();
const oyentes = new Set<() => void>();

function avisar() {
  document.documentElement.lang = actual;
  for (const f of oyentes) f();
}

export const idiomaActual = (): Idioma => actual;

/** Cambia el idioma de todo el shell y lo recuerda en este navegador. */
export function cambiarIdioma(idioma: Idioma): void {
  if (idioma === actual) return;
  actual = idioma;
  try { localStorage.setItem(CLAVE_IDIOMA, idioma); } catch { /* sin almacenamiento: vale para esta página */ }
  avisar();
}

/** Pone `<html lang>` acorde al idioma guardado (main.tsx, al arrancar). */
export function aplicarIdioma(): void {
  document.documentElement.lang = actual;
}

// Otra pestaña cambió el idioma: esta lo sigue
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== CLAVE_IDIOMA) return;
    const nuevo = guardado();
    if (nuevo !== actual) { actual = nuevo; avisar(); }
  });
}

function suscribir(f: () => void) {
  oyentes.add(f);
  return () => { oyentes.delete(f); };
}

/** El idioma actual; el componente se vuelve a pintar al cambiarlo. */
export function useIdioma(): Idioma {
  return useSyncExternalStore(suscribir, idiomaActual);
}

// ---------------------------------------------------------------- Tipos de los diccionarios

export interface Plural { readonly uno: string; readonly otros: string; readonly cero?: string }
export type Texto = string | Plural;
export type Diccionario = Readonly<Record<string, Texto>>;

/** Variables de un texto: 'Hola, {nombre}' -> 'nombre'. */
type Variables<S, A extends string = never> = S extends `${string}{${infer V}}${infer R}` ? Variables<R, A | V> : A;
/** Etiquetas de un texto: 'en <enlace>Proyectos</enlace>' -> 'enlace'. */
type Etiquetas<S, A extends string = never> = S extends `${string}<${infer E}>${infer R}`
  ? (E extends `/${string}` ? Etiquetas<R, A> : Etiquetas<R, A | E>)
  : A;
type VariablesDe<T> = T extends Plural ? 'n' | Variables<T['uno']> | Variables<T['otros']> | Variables<T['cero']> : Variables<T>;
type EtiquetasDe<T> = T extends Plural ? Etiquetas<T['uno']> | Etiquetas<T['otros']> | Etiquetas<T['cero']> : Etiquetas<T>;

type UnionAInterseccion<U> = (U extends unknown ? (x: U) => void : never) extends (x: infer I) => void ? I : never;
/** Un texto que contiene cada una de las marcas (`{x}` o `<x>`). */
type Contiene<M extends string> = [M] extends [never] ? string : UnionAInterseccion<M extends string ? `${string}${M}${string}` : never>;
type Marcas<S> = `{${Variables<S>}}` | `<${Etiquetas<S>}>`;
type TraduccionDe<T> = T extends Plural
  ? { readonly uno: Contiene<Marcas<T['uno']>>; readonly otros: Contiene<Marcas<T['otros']>>; readonly cero?: string }
  : Contiene<Marcas<T>>;

/** La traducción de un diccionario: las mismas claves, con las mismas variables y etiquetas. */
export type Traduccion<Es extends Diccionario> = { readonly [K in keyof Es]: TraduccionDe<Es[K]> };

// ---------------------------------------------------------------- Traductor

export type Valor = string | number;
export type Envoltorio = (contenido: ReactNode) => ReactNode;
/** Etiquetas que no hace falta pasar a `t.rico`. */
type EtiquetaComun = 'strong' | 'em' | 'code';

type VarsDe<Es, En, K extends keyof Es & keyof En> = VariablesDe<Es[K]> | VariablesDe<En[K]>;
type EtiqsDe<Es, En, K extends keyof Es & keyof En> = Exclude<EtiquetasDe<Es[K]> | EtiquetasDe<En[K]>, EtiquetaComun>;
type ArgsTexto<V extends string> = [V] extends [never] ? [] : [variables: Record<V, Valor>];
type ArgsRico<V extends string, E extends string> = [E] extends [never]
  ? ([V] extends [never] ? [] : [variables: Record<V, Valor>])
  : [variables: Record<V, Valor>, etiquetas: Record<E, Envoltorio>];

export interface Traductor<Es extends Diccionario, En extends Traduccion<Es>> {
  /** El texto de la clave en el idioma actual, con sus variables. */
  <K extends keyof Es & keyof En & string>(clave: K, ...args: ArgsTexto<VarsDe<Es, En, K>>): string;
  /** Igual, pero con etiquetas: `<strong>`, `<em>` y `<code>` salen solas; el resto (p. ej. un enlace) se pasa. */
  rico<K extends keyof Es & keyof En & string>(clave: K, ...args: ArgsRico<VarsDe<Es, En, K>, EtiqsDe<Es, En, K>>): ReactNode;
  readonly idioma: Idioma;
  /** Configuración regional de Intl (es-PE, en-US). */
  readonly locale: string;
  fecha(iso: string | null | undefined): string;
  numero(n: number, opciones?: Intl.NumberFormatOptions): string;
  estado(e: EstadoRevision): string;
  rolProyecto(r: RolProyecto): string;
  rolOrganizacion(r: RolOrganizacion): string;
}

const COMUNES: Record<EtiquetaComun, Envoltorio> = {
  strong: (c) => createElement('strong', null, c),
  em: (c) => createElement('em', null, c),
  code: (c) => createElement('code', null, c)
};

function crearTraductor<Es extends Diccionario, En extends Traduccion<Es>>(es: Es, en: En, idioma: Idioma): Traductor<Es, En> {
  const dic = (idioma === 'en' ? en : es) as unknown as Diccionario;
  const locale = LOCALES[idioma];
  const reglas = new Intl.PluralRules(locale);
  const dominio = textosDominio(idioma);

  const formatear = (v: Valor) => (typeof v === 'number' ? numero(v, idioma) : v);
  const interpolar = (s: string, vars: Record<string, Valor> | undefined) =>
    vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? formatear(vars[k]!) : m)) : s;

  function plantilla(clave: string, vars: Record<string, Valor> | undefined): string {
    const texto = dic[clave] ?? (es as Diccionario)[clave];
    if (texto === undefined) return clave;
    if (typeof texto === 'string') return texto;
    const n = Number(vars?.n ?? 0);
    if (n === 0 && texto.cero !== undefined) return texto.cero;
    return reglas.select(n) === 'one' ? texto.uno : texto.otros;
  }

  const t = (clave: string, vars?: Record<string, Valor>) => interpolar(plantilla(clave, vars), vars);

  // Las etiquetas se separan antes de sustituir las variables: un nombre con «<b>» sigue siendo texto
  const rico = (clave: string, vars?: Record<string, Valor>, etiquetas?: Record<string, Envoltorio>): ReactNode => {
    const s = plantilla(clave, vars);
    const partes: ReactNode[] = [];
    const patron = /<([a-zA-Z]+)>([\s\S]*?)<\/\1>/g;
    let desde = 0;
    for (let m = patron.exec(s); m; m = patron.exec(s)) {
      if (m.index > desde) partes.push(interpolar(s.slice(desde, m.index), vars));
      const dentro = interpolar(m[2]!, vars);
      const envolver = etiquetas?.[m[1]!] ?? COMUNES[m[1] as EtiquetaComun];
      partes.push(envolver ? envolver(dentro) : dentro);
      desde = patron.lastIndex;
    }
    if (desde < s.length) partes.push(interpolar(s.slice(desde), vars));
    return createElement(Fragment, null, ...partes);
  };

  return Object.assign(t, {
    rico,
    idioma,
    locale,
    fecha: (iso: string | null | undefined) => fecha(iso, idioma),
    numero: (n: number, opciones?: Intl.NumberFormatOptions) => numero(n, idioma, opciones),
    estado: (e: EstadoRevision) => dominio.estados[e],
    rolProyecto: (r: RolProyecto) => dominio.rolesProyecto[r],
    rolOrganizacion: (r: RolOrganizacion) => dominio.rolesOrganizacion[r]
  }) as Traductor<Es, En>;
}

/**
 * Crea el `useT()` de un diccionario: el del shell (abajo) y el de cada módulo
 * de iniciativa (`modulos/<clave>/textos.ts`), que traduce sus propias pantallas.
 */
export function definirTextos<Es extends Diccionario, En extends Traduccion<Es>>(es: Es, en: En): () => Traductor<Es, En> {
  const porIdioma = new Map<Idioma, Traductor<Es, En>>();
  const de = (idioma: Idioma) => {
    let t = porIdioma.get(idioma);
    if (!t) porIdioma.set(idioma, (t = crearTraductor(es, en, idioma)));
    return t;
  };
  return function useT() {
    return de(useIdioma());
  };
}

/** Textos del shell (textos/es.ts y textos/en.ts). */
export const useT = definirTextos(es, en);
export type TraductorShell = ReturnType<typeof useT>;
