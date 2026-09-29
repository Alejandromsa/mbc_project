// Lo mínimo del DOM que usa el importador. Lo cumplen el DOMParser del navegador
// y @xmldom/xmldom (las pruebas en Node): sin tipos del DOM, que este paquete no carga.

export interface NodoXml {
  nodeType: number;
}

export interface ElementoXml extends NodoXml {
  localName: string | null;
  namespaceURI?: string | null;
  textContent?: string | null;
  childNodes?: ArrayLike<NodoXml>;
  getAttribute(nombre: string): string | null;
}

export interface DocumentoXml {
  documentElement?: ElementoXml | null;
  getElementsByTagName(tag: string): ArrayLike<ElementoXml>;
  querySelector?(sel: string): unknown;
}

/** Elementos hijos directos, en el orden del archivo (sin texto ni comentarios). */
export function hijos(el: ElementoXml): ElementoXml[] {
  const lista = el.childNodes;
  if (!lista) return [];
  return Array.from(lista).filter((n): n is ElementoXml => n.nodeType === 1);
}

/** Texto en una sola línea: los nombres de Bizagi y Signavio traen saltos y espacios dobles. */
export function normalizar(s: string | null | undefined): string {
  return String(s ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * Referencia a otro elemento sin prefijo: los atributos QName (`attachedToRef`,
 * `processRef`, `bpmnElement`…) pueden venir como `tns:Tarea_1`. Un id nunca lleva «:».
 */
export function refLocal(s: string | null | undefined): string {
  const v = String(s ?? '').trim();
  const i = v.indexOf(':');
  return i >= 0 ? v.slice(i + 1) : v;
}
