// Portado tal cual del MVP 3.8.9 (cuerpo, estilos y documento de la Ficha de Proceso).
import { KPI_LIBRARY } from '@processiq/dominio';
import type { ValorKpi } from '@processiq/dominio';
import type { EstadoExportable } from './tipos.js';
import { derivarFicha } from './word.js';

// ============================================================
// FICHA DE PROCESO — documento corporativo completo (formato Minsait/cliente)
// Estructura de 12 bloques inspirada en el estándar PR-DU-COM-* (Centenario):
// cabecera de gobernanza, código/versión, objetivo, alcance, indicadores,
// responsabilidades, procedimiento (diagrama), detalle de actividades,
// sistemas, términos clave, anexos y control de cambios.
// ============================================================
export interface OpcionesFicha {
  embedDiagram?: boolean;
  svgDiagrama?: () => string;
}

/**
 * Cuerpo HTML de la Ficha de Proceso.
 * @param opts { embedDiagram?: boolean (por defecto true), svgDiagrama?: () => string }
 *   svgDiagrama devuelve el SVG del lienzo; solo se llama si hay que incrustarlo.
 */
export function cuerpoFicha(state: EstadoExportable, opts?: OpcionesFicha) {
  opts = opts || {};
  const embedDiagram = opts.embedDiagram !== false;
  const meta = state.meta;
  const d = derivarFicha(state);
  const f = d.f;
  const esc = (s: unknown) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' } as Record<string, string>)[c]!);
  // Convierte texto con saltos (notas del nodo) en <li> por línea o en párrafos
  const richText = (s: unknown) => {
    if (!s) return '';
    const lines = String(s).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length <= 1) return `<span>${esc(lines[0] || '')}</span>`;
    return '<ul class="tight">' + lines.map(l => `<li>${esc(l)}</li>`).join('') + '</ul>';
  };
  const fechaLarga = new Date().toLocaleDateString('es-PE', { year: 'numeric', month: 'long', day: 'numeric' });

  // ── Cabecera de gobernanza ──
  const govRows = (f.gobernanza || []).length
    ? f.gobernanza.map(g => `<tr>
          <td><b>${esc(g.rol || '')}</b></td><td>${esc(g.cargo || '')}</td>
          <td>${esc(g.nombre || '')}</td><td style="text-align:center">${esc(g.fecha || '')}</td></tr>`).join('')
    : `<tr><td colspan="4" class="muted">Sin responsables de gobernanza documental registrados (edítalos en la pestaña Ficha).</td></tr>`;

  // ── Indicadores (valores capturados o librería KPI) ──
  let indicadoresRows = '';
  const kv: Record<string, ValorKpi> = state._kpiValues || {};
  if (Object.keys(kv).length) {
    indicadoresRows = Object.values(kv).map(k => `<tr>
        <td>${esc(k.name)}</td><td style="text-align:center">${esc(k.unit || '')}</td>
        <td>${esc(k.benchmark || '')}</td><td style="text-align:center">${esc(k.value || '—')}</td>
        <td style="text-align:center">${esc(k.gap || '—')}</td></tr>`).join('');
  } else {
    const kpis = KPI_LIBRARY.filter(k => !meta.industry || k.industry === meta.industry || k.industry === 'Transversal').slice(0, 6);
    indicadoresRows = kpis.length
      ? kpis.map(k => `<tr><td>${esc(k.name)}</td><td style="text-align:center">${esc(k.unit)}</td><td>${esc(k.benchmark)}</td><td style="text-align:center">—</td><td style="text-align:center">—</td></tr>`).join('')
      : `<tr><td colspan="5" class="muted">N/A</td></tr>`;
  }

  // ── Responsabilidades ──
  let respBody;
  if (state._raci && Object.keys(state._raci).length) {
    const roles = [...new Set(Object.values(state._raci).flatMap(r => Object.keys(r)))];
    const rtasks = state.nodes.filter(n => state._raci![n.id]);
    respBody = `<table><tr><th>Actividad</th>${roles.map(r => `<th style="text-align:center">${esc(r)}</th>`).join('')}</tr>
        ${rtasks.map(t => `<tr><td>${esc(t.label)}</td>${roles.map(r => `<td style="text-align:center"><b>${esc(state._raci![t.id]![r] || '')}</b></td>`).join('')}</tr>`).join('')}</table>
        <p class="muted">R = Responsable · A = Accountable · C = Consultado · I = Informado</p>`;
  } else if (d.responsables.length) {
    respBody = '<ul class="tight">' + d.responsables.map(r => `<li><b>${esc(r)}</b></li>`).join('') + '</ul>';
  } else {
    respBody = '<p class="muted">N/A</p>';
  }

  // ── Procedimiento: diagrama ──
  let diagrama = '<p class="muted">Ver diagrama en la herramienta ProcessIQ.</p>';
  if (embedDiagram && state.nodes.length) {
    // Sin svgDiagrama la llamada lanza y queda el texto por defecto (como en el MVP).
    try {
      const svg = opts.svgDiagrama!();
      diagrama = `<div class="diagram">${svg}</div>`;
    } catch (_) {}
  }

  // ── Detalle de actividades ──
  const actRows = d.activities.map(a => {
    const ruteo = a.ruteo && a.ruteo.length
      ? `<div class="ruteo"><b>Ruteo:</b><ul class="tight">${a.ruteo.map(r => `<li>${esc(r)}</li>`).join('')}</ul></div>` : '';
    const desc = a.descripcion ? richText(a.descripcion) : '<span class="muted">—</span>';
    return `<tr>
        <td style="text-align:center;font-weight:700;color:${'#FF0054'}">${a.num}</td>
        <td><b>${esc(a.label)}</b>${a.sistema ? `<div class="sysbadge">🖥️ ${esc(a.sistema)}</div>` : ''}</td>
        <td>${esc(a.responsable || '—')}</td>
        <td>${desc}${ruteo}</td>
      </tr>`;
  }).join('');

  // ── Sistemas ──
  const sysRows = d.sistemas.length
    ? d.sistemas.map(s => `<tr><td><b>${esc(s.nombre)}</b></td><td>${esc(s.uso || '')}</td></tr>`).join('')
    : `<tr><td colspan="2" class="muted">N/A</td></tr>`;

  // ── Términos clave ──
  const termRows = (f.terminos || []).length
    ? f.terminos.map(t => `<tr><td style="width:22%"><b>${esc(t.termino)}</b></td><td>${esc(t.definicion)}</td></tr>`).join('')
    : `<tr><td colspan="2" class="muted">N/A</td></tr>`;

  // ── Anexos ──
  const anexoRows = (f.anexos || []).length
    ? f.anexos.map(a => `<tr><td style="width:22%"><b>${esc(a.codigo || '')}</b></td><td>${esc(a.nombre || '')}</td></tr>`).join('')
    : `<tr><td colspan="2" class="muted">N/A</td></tr>`;

  // ── Control de cambios ──
  const cambioRows = (f.cambios || []).length
    ? f.cambios.map(c => `<tr><td style="text-align:center">${esc(c.version || '')}</td><td style="text-align:center">${esc(c.fecha || '')}</td><td>${esc(c.descripcion || '')}</td></tr>`).join('')
    : `<tr><td colspan="3" class="muted">Sin historial de cambios.</td></tr>`;

  return `
  <div class="ficha-cover">
    <p class="tag">MBC BUSINESS CONSULTING · PERÚ${meta.client ? ' · ' + esc(meta.client) : ''}</p>
    <div class="ficha-code">${esc(f.code || '—')}${f.version ? ` &nbsp;·&nbsp; v${esc(f.version)}` : ''}</div>
    <h1>${esc(meta.name || 'Ficha de Proceso')}</h1>
    <p class="muted">Ficha de proceso &nbsp;·&nbsp; ${esc(meta.macroprocess || '')}${meta.industry ? ' · ' + esc(meta.industry) : ''} &nbsp;·&nbsp; ${esc(fechaLarga)}</p>
  </div>

  <table class="gov">
    <tr><th>Función</th><th>Cargo</th><th>Nombre</th><th style="text-align:center">Fecha</th></tr>
    ${govRows}
  </table>

  <h2>1. Objetivo</h2>
  ${f.objetivo ? `<p>${esc(f.objetivo)}</p>` : '<p class="muted">Describir el objetivo del proceso (pestaña Ficha).</p>'}

  <h2>2. Alcance</h2>
  <table class="kv">
    <tr><td class="k">Áreas involucradas</td><td>${esc(f.alcanceAreas) || (d.responsables.join(', ') || '—')}</td></tr>
    <tr><td class="k">Inicia con</td><td>${esc(d.alcanceDesde) || '—'}</td></tr>
    <tr><td class="k">Termina con</td><td>${esc(d.alcanceHasta) || '—'}</td></tr>
    ${f.alcanceIncluye ? `<tr><td class="k">Incluye / excluye</td><td>${esc(f.alcanceIncluye)}</td></tr>` : ''}
  </table>

  <h2>3. Indicadores</h2>
  <table>
    <tr><th>Indicador</th><th style="text-align:center">Unidad</th><th>Meta / Benchmark</th><th style="text-align:center">Valor actual</th><th style="text-align:center">Gap</th></tr>
    ${indicadoresRows}
  </table>

  <h2>4. Responsabilidades</h2>
  ${respBody}

  ${f.descripcion ? `<h2>5. Descripción</h2><p>${esc(f.descripcion)}</p>` : ''}

  <h2>6. Procedimiento</h2>
  <p><b>${esc(f.code || '')}</b> ${esc(meta.name || '')}</p>
  ${diagrama}

  <h2>7. Detalle de las Actividades</h2>
  <table class="acts">
    <tr><th style="width:36px;text-align:center">N°</th><th style="width:26%">Actividad</th><th style="width:20%">Responsable</th><th>Descripción y ruteo</th></tr>
    ${actRows || '<tr><td colspan="4" class="muted">Sin actividades modeladas.</td></tr>'}
  </table>

  <h2>8. Sistemas</h2>
  <table><tr><th style="width:22%">Sistema</th><th>Uso en el proceso</th></tr>${sysRows}</table>

  <h2>9. Términos Clave</h2>
  <table>${termRows}</table>

  <h2>10. Anexos</h2>
  <table>${anexoRows}</table>

  <h2>11. Control de Cambios</h2>
  <table><tr><th style="width:60px;text-align:center">Versión</th><th style="width:120px;text-align:center">Fecha</th><th>Descripción del cambio</th></tr>${cambioRows}</table>

  <p class="muted foot">Ficha generada con ProcessIQ · MBC Business Consulting · ${esc(fechaLarga)}</p>`;
}

/** Estilos de la ficha: para Word (tipografía y medidas de impresión) o para la vista previa. */
export function estilosFicha(forWord: boolean) {
  const MAGENTA = '#147AFF', DARK = '#003478', GRAY = '#7A93B5';   // paleta MBC (catalogo): acento, azul marino, secundario
  return `
  ${forWord ? '@page { size: A4; margin: 1.8cm; }' : ''}
  body { font-family: 'ForFuture Sans', Calibri, 'Segoe UI', Arial, sans-serif; font-size: 11pt; color: ${DARK}; line-height: 1.4; }
  h1 { font-size: 23pt; margin: 2pt 0 4pt 0; color: ${DARK}; }
  h2 { font-size: 13.5pt; color: ${MAGENTA}; border-bottom: 2px solid ${MAGENTA}; padding-bottom: 3pt; margin: 20pt 0 8pt; }
  p { margin: 6pt 0; }
  table { border-collapse: collapse; width: 100%; margin: 8pt 0; font-size: 10pt; }
  th { background: ${DARK}; color: #fff; padding: 5pt 7pt; text-align: left; font-size: 9pt; }
  td { border: 1px solid #ccc; padding: 5pt 7pt; vertical-align: top; }
  table.acts td, table.acts th { font-size: 9.5pt; }
  tr:nth-child(even) td { background: #faf8f7; }
  ul.tight { margin: 3pt 0; padding-left: 16pt; }
  ul.tight li { margin: 1pt 0; }
  .ficha-cover { border-left: 6px solid ${MAGENTA}; padding-left: 16pt; margin-bottom: 18pt; }
  .ficha-code { font-family: Consolas, monospace; font-size: 10pt; color: ${MAGENTA}; font-weight: 700; letter-spacing: 1px; margin-top: 4pt; }
  .tag { display:inline-block; background:${MAGENTA}; color:#fff; padding:2pt 8pt; font-size:8.5pt; border-radius:3pt; letter-spacing:.5px; }
  .muted { color: ${GRAY}; font-size: 9.5pt; }
  table.kv .k { width: 28%; background:#f4f2f1; font-weight:600; }
  table.gov th { font-size: 8.5pt; }
  .sysbadge { display:inline-block; margin-top:3pt; font-size:8pt; color:${GRAY}; }
  .ruteo { margin-top:5pt; padding:4pt 7pt; background:#fff6f3; border-left:3px solid ${MAGENTA}; font-size:9pt; }
  .ruteo ul { margin:2pt 0; }
  .diagram { border:1px solid #e2e2e2; border-radius:6px; padding:10px; margin:8pt 0; overflow-x:auto; text-align:center; background:#fff; }
  .diagram svg { max-width:100%; height:auto; }
  .foot { margin-top:24pt; border-top:1px solid #ccc; padding-top:8pt; }`;
}

/** Documento completo de la ficha (HTML compatible con Word). */
export function documentoFicha(state: EstadoExportable, svgDiagrama: () => string) {
  const meta = state.meta;
  const esc = (s: unknown) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' } as Record<string, string>)[c]!);
  const body = cuerpoFicha(state, { embedDiagram: true, svgDiagrama });
  const html = `<!DOCTYPE html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>${esc((meta.name || 'Ficha') + ' — Ficha de Proceso')}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
<style>${estilosFicha(true)}</style></head>
<body>${body}</body></html>`;
  return html;
}
