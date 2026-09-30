// Idioma del editor: español (el de siempre y por defecto) e inglés.
//
// - Mismo idioma que la plataforma: la clave `processiq.idioma` del shell
//   (shell/i18n.ts). Sin ella, español, aunque el navegador esté en inglés. Si otra
//   pestaña (el shell u otro editor) lo cambia, este editor lo sigue sin recargar.
// - `tr('clave', { variables })` devuelve el texto en el idioma actual. El español
//   (textos/es.js) es la fuente de verdad: es el texto que había, byte a byte, y es
//   lo que compara la fidelidad con el MVP. `{x}` se sustituye con String(valor), como
//   la concatenación a la que reemplaza: los números no se formatean aquí (para eso,
//   `locale()` con toLocaleString, igual que antes con 'es-PE').
// - El HTML estático de index.html se traduce con la tabla de textos/html.js (selector,
//   dónde está el texto y clave), sin atributos en el HTML. **En español no se toca el
//   DOM**: solo se aplica al pasar a inglés, y al volver se restaura el original exacto.
// - Al cambiar de idioma, cada módulo vuelve a pintar lo suyo (`alCambiarIdioma`).
//
// Qué NO se traduce: las exportaciones (PPTX, Word, Ficha, BPMN, SVG, JSON), el
// lienzo (es el diagrama que se exporta), los prompts y las respuestas de la IA, los
// ejemplos, los catálogos (KPIs, verbos del Playbook, industrias, macroprocesos) y
// los textos que el editor escribe dentro del proceso (etiquetas de nodos nuevos,
// ramas Sí/No…): son datos.
import { CATEGORIAS_PAIN_EN, EJECUCION_EN, ERRORES_EN, TAREAS_IA_EN, en } from './textos/en.js';
import { es } from './textos/es.js';
import { ENLACES_HTML } from './textos/html.js';
import './i18n.css';

export const CLAVE_IDIOMA = 'processiq.idioma';
const LOCALES = { es: 'es-PE', en: 'en-US' };
const NOMBRES = { es: 'Español', en: 'English' };

function guardado() {
  try { return localStorage.getItem(CLAVE_IDIOMA) === 'en' ? 'en' : 'es'; } catch { return 'es'; }
}

let actual = guardado();
const oyentes = [];

/** 'es' o 'en'. */
export const idioma = () => actual;
export const enIngles = () => actual === 'en';
/** Configuración regional para toLocaleString: 'es-PE' (la de siempre) o 'en-US'. */
export const locale = () => LOCALES[actual];

/** El texto de `clave` en el idioma actual, con sus variables `{x}`. */
export function tr(clave, vars) {
  let s = (actual === 'en' ? en : es)[clave];
  if (s === undefined) s = es[clave];
  if (s === undefined) return clave;
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, k) => (Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : m));
}

/**
 * Texto que viene de un paquete (en español): en inglés, su traducción si se conoce.
 * `mapa` es un objeto (texto o id -> inglés) o una lista de [regex, (m) => inglés].
 */
export function traducirDe(mapa, texto, id) {
  if (actual !== 'en' || texto == null) return texto;
  if (Array.isArray(mapa)) {
    for (const [patron, f] of mapa) {
      const m = patron.exec(String(texto));
      if (m) return f(m);
    }
    return texto;
  }
  const k = id !== undefined ? id : texto;
  return Object.prototype.hasOwnProperty.call(mapa, k) ? mapa[k] : texto;
}

// Catálogos del dominio con id fijo: en inglés, su etiqueta de textos/en.js
const deMapa = (mapa, id, campo, espanol) => {
  const v = actual === 'en' && mapa[id];
  return v ? (campo ? v[campo] : v) : espanol;
};
/** Tipo de ejecución (EXECUTION_TYPES): etiqueta y ayuda. */
export const etiquetaEjecucion = (tipo) => deMapa(EJECUCION_EN, tipo.id, 'label', tipo.label);
export const ayudaEjecucion = (tipo) => deMapa(EJECUCION_EN, tipo.id, 'desc', tipo.desc);
/** Categoría de pain point (PAIN_CATEGORIES). */
export const etiquetaPain = (cat) => deMapa(CATEGORIAS_PAIN_EN, cat.id, null, cat.label);
/** Tarea de IA del copiloto (TAREAS_IA), por su clave. */
export const etiquetaTarea = (clave, tarea) => deMapa(TAREAS_IA_EN, clave, null, tarea.etiqueta);

/** Mensaje de error de un paquete (IA, lectura de documentos, BPMN): en inglés, si se conoce. */
export const traducirError = (mensaje) => traducirDe(ERRORES_EN, mensaje);

/** `f` vuelve a pintar lo suyo cuando cambia el idioma. */
export function alCambiarIdioma(f) { oyentes.push(f); }

/** Cambia el idioma del editor (y el de la plataforma: es la misma clave). */
export function cambiarIdioma(nuevo) {
  if (nuevo !== 'es' && nuevo !== 'en') return;
  try { localStorage.setItem(CLAVE_IDIOMA, nuevo); } catch { /* sin almacenamiento: vale para esta página */ }
  if (nuevo === actual) return;
  actual = nuevo;
  aplicar();
}

function aplicar() {
  aplicarHtml();
  document.documentElement.lang = actual;
  pintarSelector();
  for (const f of oyentes) {
    try { f(actual); } catch (e) { console.error('[ProcessIQ] idioma:', e); }
  }
}

// =================== HTML estático (textos/html.js) ===================

const LETRA = /\S/;
const normal = (s) => s.replace(/\s+/g, ' ').trim();
/** Originales de lo que se tradujo: elemento -> { destino: valor exacto }. */
const originales = new Map();
let tituloOriginal = null;

function nodoTexto(el, n) {
  let i = 0;
  for (const nodo of el.childNodes) {
    if (nodo.nodeType === 3 && LETRA.test(nodo.nodeValue)) { if (i === n) return nodo; i++; }
  }
  return null;
}

function leer(el, dest) {
  if (dest.startsWith('attr:')) return el.getAttribute(dest.slice(5));
  if (dest === 'html') return el.innerHTML;
  const nodo = nodoTexto(el, Number(dest.split(':')[1] || 0));
  return nodo ? nodo.nodeValue : null;
}

function escribir(el, dest, valor, exacto) {
  if (dest.startsWith('attr:')) { el.setAttribute(dest.slice(5), valor); return; }
  if (dest === 'html') { el.innerHTML = valor; return; }
  const nodo = nodoTexto(el, Number(dest.split(':')[1] || 0));
  if (!nodo) return;
  if (exacto) { nodo.nodeValue = valor; return; }
  // Se conservan los espacios de alrededor (separan el texto de los elementos vecinos)
  const m = /^(\s*)[\s\S]*?(\s*)$/.exec(nodo.nodeValue);
  nodo.nodeValue = m[1] + valor + m[2];
}

const comparable = (valor, dest) => (dest.startsWith('attr:') ? valor : normal(valor));

function aplicarHtml() {
  for (const [sel, dest, clave] of ENLACES_HTML) {
    for (const el of document.querySelectorAll(sel)) {
      const valor = leer(el, dest);
      if (valor === null) continue;
      if (actual === 'en') {
        if (comparable(valor, dest) !== es[clave]) continue;   // el JS ya lo cambió: lo pinta su módulo
        const guardados = originales.get(el) || {};
        guardados[dest] = valor;
        originales.set(el, guardados);
        escribir(el, dest, en[clave], false);
      } else {
        const guardados = originales.get(el);
        if (!guardados || !(dest in guardados)) continue;
        if (comparable(valor, dest) === en[clave]) escribir(el, dest, guardados[dest], true);
        delete guardados[dest];
      }
    }
  }
  if (actual === 'en') {
    if (tituloOriginal === null) tituloOriginal = document.title;
    if (document.title === tituloOriginal) document.title = en['html.titulo'];
  } else if (tituloOriginal !== null && document.title === en['html.titulo']) {
    document.title = tituloOriginal;
  }
}

// =================== Selector «ES / EN» ===================

let selector = null;

function crearSelector() {
  selector = document.createElement('div');
  selector.className = 'piq-idioma';
  selector.setAttribute('role', 'group');
  for (const i of ['es', 'en']) {
    const b = document.createElement('button');
    b.type = 'button';
    b.lang = i;
    b.dataset.idioma = i;
    b.textContent = i.toUpperCase();
    b.title = NOMBRES[i];
    b.setAttribute('aria-label', NOMBRES[i]);
    b.addEventListener('click', () => cambiarIdioma(i));
    selector.appendChild(b);
  }
  pintarSelector();
  return selector;
}

function pintarSelector() {
  if (!selector) return;
  selector.setAttribute('aria-label', tr('idioma.grupo'));
  selector.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.idioma === actual)));
}

// Otra pestaña (el shell u otro editor) cambió el idioma: este editor lo sigue
window.addEventListener('storage', (e) => {
  if (e.key !== CLAVE_IDIOMA && e.key !== null) return;
  const nuevo = guardado();
  if (nuevo !== actual) { actual = nuevo; aplicar(); }
});

// Antes que init() (inicio.js registra el suyo después: este módulo se evalúa antes):
// así el editor ya pinta en su idioma. En español solo se añade el selector.
document.addEventListener('DOMContentLoaded', () => {
  const cabecera = document.querySelector('.app-header');
  if (cabecera) cabecera.appendChild(crearSelector());
  if (actual === 'en') {
    aplicarHtml();
    document.documentElement.lang = 'en';
  }
});
