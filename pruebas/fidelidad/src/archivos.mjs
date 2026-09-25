// Archivos de prueba para la ingesta (Word, PDF, PowerPoint y texto), generados
// al vuelo: no hay binarios versionados ni datos de clientes.
import JSZip from 'jszip';
import { PDFDocument, StandardFonts } from 'pdf-lib';

const PARRAFOS_WORD = [
  'Procedimiento de atención de reclamos',
  'Recibo el reclamo del cliente por correo y lo registro en el CRM.',
  'Reviso la documentación adjunta y verifico la identidad del cliente.',
  'Si el reclamo procede, apruebo el abono en SAP y notifico al cliente.',
  'Si no procede, rechazo el reclamo y envío la respuesta por correo.'
];

const LINEAS_PDF = [
  'Manual de compras - version 2',
  'El solicitante crea la solicitud de compra en el ERP.',
  'Reviso la solicitud y verifico el presupuesto disponible.',
  'Si el monto supera el limite, escalo el caso a la gerencia.',
  'Genero la orden de compra y la envio al proveedor.'
];

const LAMINAS_PPTX = [
  ['Proceso de onboarding', 'Recibo la ficha del colaborador desde RRHH.'],
  ['Accesos', 'Registro el usuario en el sistema y asigno la laptop.', 'Notifico al jefe directo & al colaborador.']
];

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function docx() {
  const z = new JSZip();
  z.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '</Types>');
  z.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    '</Relationships>');
  z.file('word/document.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
    PARRAFOS_WORD.map((p) => `<w:p><w:r><w:t xml:space="preserve">${esc(p)}</w:t></w:r></w:p>`).join('') +
    '</w:body></w:document>');
  return z.generateAsync({ type: 'nodebuffer' });
}

async function pdf() {
  const doc = await PDFDocument.create();
  doc.setCreationDate(new Date('2026-09-25T12:00:00Z'));
  doc.setModificationDate(new Date('2026-09-25T12:00:00Z'));
  const fuente = await doc.embedFont(StandardFonts.Helvetica);
  const pagina = doc.addPage([595, 842]);
  LINEAS_PDF.forEach((l, i) => pagina.drawText(l, { x: 50, y: 780 - i * 22, size: 12, font: fuente }));
  return Buffer.from(await doc.save());
}

async function pptx() {
  const z = new JSZip();
  LAMINAS_PPTX.forEach((textos, i) => {
    z.file(`ppt/slides/slide${i + 1}.xml`, '<?xml version="1.0" encoding="UTF-8"?><p:sld xmlns:p="p" xmlns:a="a"><p:cSld><p:spTree>' +
      textos.map((t) => `<p:sp><p:txBody><a:p><a:r><a:t>${esc(t)}</a:t></a:r></a:p></p:txBody></p:sp>`).join('') +
      '</p:spTree></p:cSld></p:sld>');
  });
  return z.generateAsync({ type: 'nodebuffer' });
}

const TRANSCRIPCION = `Ana Ruiz: Primero recibo la solicitud por el portal.
Luis Soto: Luego reviso los datos y valido la firma.
Ana Ruiz: Si falta algo, solicito la información al cliente.
Luis Soto: Al final archivo el expediente.`;

/** Archivos para setInputFiles: { name, mimeType, buffer }[] */
export async function archivosDeIngesta() {
  return [
    { name: 'procedimiento-reclamos.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: await docx() },
    { name: 'manual-compras.pdf', mimeType: 'application/pdf', buffer: await pdf() },
    { name: 'onboarding.pptx', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', buffer: await pptx() },
    { name: 'transcripcion-reunion.txt', mimeType: 'text/plain', buffer: Buffer.from(TRANSCRIPCION, 'utf8') }
  ];
}
