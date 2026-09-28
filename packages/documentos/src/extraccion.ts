// Portado tal cual del MVP 3.8.9 (extractFileText y los lectores de PDF y
// PowerPoint); la interfaz pública está tipada en extraccion-tipos.ts.
// Las pruebas de fidelidad cargan un .docx, un .pdf, un .pptx y un .txt en ambas apps.
import type { ArchivoEntrada, EntornoExtraccion, TextoExtraido } from './extraccion-tipos.js';

// Lo que se usa de pdf.js 4.7.76 y de JSZip 3.10.1: el entorno los carga bajo
// demanda y los entrega sin tipos (extraccion-tipos.ts).
interface ElementoTextoPdf { str: string; transform?: [number, number, number, number, number, number] }
interface PaginaPdf { getTextContent(): Promise<{ items: ElementoTextoPdf[] }> }
interface DocumentoPdf { numPages: number; getPage(numero: number): Promise<PaginaPdf> }
interface PdfJs { getDocument(o: { data: ArrayBuffer }): { promise: Promise<DocumentoPdf> } }
interface ZipLeido { files: Record<string, { async(tipo: 'string'): Promise<string> }> }
interface JSZipEstatico { loadAsync(datos: ArrayBuffer): Promise<ZipLeido> }

/** Por encima de este tamaño se avisa antes de intentar leer (evita colgar el navegador). */
export const MAX_ARCHIVO_MB = 40;
/** Tope de páginas de PDF que se extraen. */
export const MAX_PAGINAS_PDF = 120;

/**
 * Texto de un documento (Word, PDF, PowerPoint, texto) o importación directa de un BPMN.
 * Informa el avance, cede el hilo y respeta la cancelación del entorno.
 */
export async function extraerTexto(file: ArchivoEntrada, e: EntornoExtraccion): Promise<TextoExtraido> {
  const name = file.name || 'documento';
  const ext = (name.split('.').pop() || '').toLowerCase();

  // Guardia de tamaño: avisa ANTES de intentar y colgar el navegador
  const mb = file.size / (1024 * 1024);
  if (mb > MAX_ARCHIVO_MB) {
    throw new Error('El archivo pesa ' + mb.toFixed(1) + ' MB (máximo ' + MAX_ARCHIVO_MB + ' MB). Divídelo o exporta solo el capítulo del proceso.');
  }
  // ---- BPMN / XML: import directo del diagrama ----
  if (ext === 'bpmn' || ext === 'xml') {
    e.progreso('Importando diagrama BPMN...', 40);
    await e.ceder();
    const xml = await e.leer(file, 'text');
    const res = e.importarBpmn(xml);
    if (!res || !res.count) throw new Error('No se encontraron elementos BPMN (actividades, eventos o compuertas) en el archivo.');
    return { kind: 'bpmn', result: res, name };
  }

  // ---- Formatos que se convierten a texto ----
  {
    let text = '';
    if (ext === 'txt' || ext === 'md' || ext === 'csv' || ext === 'text') {
      e.progreso('Leyendo el archivo...', 30);
      await e.ceder();
      text = await e.leer(file, 'text');
    } else if (ext === 'docx') {
      e.progreso('Abriendo el documento Word...', 15);
      await e.ceder();
      const mammoth = await e.mammoth();
      e.comprobarCancelado();
      e.progreso('Extrayendo texto del Word...', 45);
      await e.ceder();
      const buf = await e.leer(file, 'arraybuffer');
      const out = await mammoth.extractRawText({ arrayBuffer: buf });
      text = out.value || '';
    } else if (ext === 'doc') {
      // .doc binario antiguo: intento de lectura best-effort (texto embebido)
      const raw = await e.leer(file, 'text');
      text = raw.replace(/[^\x09\x0A\x0D\x20-\x7E -ɏ]+/g, ' ').replace(/\s{3,}/g, '\n').trim();
      if (text.length < 40) throw new Error('El formato .doc antiguo no se pudo leer. Guárdalo como .docx o PDF y reintenta.');
    } else if (ext === 'pdf') {
      text = await textoDePdf(file, e);
    } else if (ext === 'pptx') {
      e.progreso('Abriendo la presentación...', 15);
      await e.ceder();
      text = await textoDePptx(file, e);
    } else if (ext === 'ppt') {
      throw new Error('El formato .ppt antiguo no es compatible. Guárdalo como .pptx y reintenta.');
    } else {
      throw new Error('Formato no soportado: .' + ext + '. Admite Word, PDF, PowerPoint, texto y BPMN.');
    }

    text = (text || '').trim();
    if (!text) throw new Error('No se pudo extraer texto del documento.');
    return { kind: 'text', text, name };
  }
}

/** Texto de un PDF, página a página (tope MAX_PAGINAS_PDF), con mensajes claros para PDF escaneado, protegido o dañado. */
export async function textoDePdf(file: ArchivoEntrada, e: EntornoExtraccion): Promise<string> {
  // pdf.js se carga bajo demanda (el entorno avisa si es la primera vez: tarda unos segundos)
  const pdfjsLib: PdfJs = await e.pdfjs();
  e.comprobarCancelado();
  e.progreso('Leyendo el archivo…', 3);
  await e.ceder();
  const buf = await e.leer(file, 'arraybuffer');
  e.comprobarCancelado();
  let pdf: DocumentoPdf;
  try {
    pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  } catch (e) {
    if (/password/i.test((e as Error).message || '')) throw new Error('El PDF está protegido con contraseña. Quítasela y reintenta.');
    throw new Error('El PDF está dañado o no se puede abrir. Prueba a reguardarlo desde el visor (Archivo → Guardar como) y reintenta.');
  }
  const total = pdf.numPages;
  const maxPages = Math.min(total, MAX_PAGINAS_PDF);
  const out: string[] = [];
  for (let i = 1; i <= maxPages; i++) {
    e.comprobarCancelado();
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    // Reagrupa por líneas usando la coordenada Y
    let lastY: number | null = null, line: string[] = [];
    const lines: string[] = [];
    content.items.forEach(it => {
      const y = it.transform ? Math.round(it.transform[5]) : 0;
      if (lastY !== null && Math.abs(y - lastY) > 3) { lines.push(line.join('')); line = []; }
      line.push(it.str); lastY = y;
    });
    if (line.length) lines.push(line.join(''));
    out.push(lines.join('\n'));
    // Progreso real + cede el hilo cada página para que la UI respire
    e.progreso(`Extrayendo texto… página ${i} de ${maxPages}`, 3 + (i / maxPages) * 62);
    if (i % 3 === 0 || i === maxPages) await e.ceder();
  }
  const text = out.join('\n\n').trim();
  // PDF escaneado = sin capa de texto → mensaje claro en vez de un error genérico
  if (text.replace(/\s/g, '').length < 40) {
    throw new Error(`El PDF no tiene texto seleccionable (parece escaneado o son imágenes). Necesita OCR: ábrelo en Acrobat → "Reconocer texto", o pega el texto a mano.`);
  }
  if (total > maxPages) {
    out.push(`\n[… documento truncado: se procesaron ${maxPages} de ${total} páginas]`);
    return out.join('\n\n');
  }
  return text;
}

/** Texto de un PowerPoint: los <a:t> de cada lámina, en orden. */
export async function textoDePptx(file: ArchivoEntrada, e: EntornoExtraccion): Promise<string> {
  const JSZip: JSZipEstatico = await e.jszip();
  const buf = await e.leer(file, 'arraybuffer');
  const zip = await JSZip.loadAsync(buf);
  // Ordena las slides por número (slide1.xml, slide2.xml, …)
  const slideNames = Object.keys(zip.files)
    .filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => (parseInt(a.match(/(\d+)/)![1]!, 10)) - (parseInt(b.match(/(\d+)/)![1]!, 10)));
  const out: string[] = [];
  for (let i = 0; i < slideNames.length; i++) {
    const xml = await zip.files[slideNames[i]!]!.async('string');
    // Extrae el texto de los nodos <a:t>…</a:t>
    const texts: string[] = [];
    xml.replace(/<a:t>([\s\S]*?)<\/a:t>/g, (m, t) => { texts.push(t.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')); return m; });
    const slideText = texts.join('\n').trim();
    if (slideText) out.push(`--- Slide ${i + 1} ---\n${slideText}`);
  }
  return out.join('\n\n');
}
