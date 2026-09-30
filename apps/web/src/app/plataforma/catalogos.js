// Catálogos de la organización en el editor (fase 2.4). En un proceso de
// proyecto, los KPIs, los verbos del Playbook y los temas PPTX de cliente son
// los que administra la organización (/api/catalogos). Se reemplazan EN SITIO
// los catálogos por defecto de @processiq/dominio y @processiq/exportar: los
// usan por referencia el editor (window.KPI_LIBRARY…), el linter
// (validarProceso) y el export PPTX, así ninguno de ellos cambia. En el editor
// libre no se llama a este módulo y todo sigue como en el MVP.
import { KPI_LIBRARY, VERBS_ALLOWED, VERBS_FORBIDDEN } from '@processiq/dominio';
import { TEMAS_PPTX } from '@processiq/exportar';
import { exportPptx } from '../exportar/pptx.js';
import { alCambiarIdioma, tr } from '../i18n.js';
import { renderKpiLibrary } from '../paneles/kpis.js';
import { runLinter } from '../validacion/lint.js';

function reemplazarLista(destino, nuevos) {
  destino.length = 0;
  nuevos.forEach((x) => destino.push(x));
}

function reemplazarObjeto(destino, nuevo) {
  Object.keys(destino).forEach((k) => { delete destino[k]; });
  Object.assign(destino, nuevo);
}

// Al cambiar de idioma se vuelven a crear los botones (clonados del de BBVA, ya traducido)
let temasDeLaOrganizacion = [];
alCambiarIdioma(() => { if (temasDeLaOrganizacion.length) botonesDeTemas(temasDeLaOrganizacion); });

/** Botones del menú Exportar para los temas de cliente de la organización. */
function botonesDeTemas(temas) {
  document.querySelectorAll('button[data-tema-organizacion]').forEach((b) => b.remove());
  const referencia = document.querySelector('button[data-export="pptx"][data-tema="bbva"]');
  if (!referencia) return;
  let anterior = referencia;
  temas.forEach((t) => {
    const b = referencia.cloneNode(true);
    b.removeAttribute('data-export');   // su propio manejador (el del menú se engancha al arrancar)
    b.dataset.temaOrganizacion = t.clave;
    const hint = b.querySelector('.export-hint');
    b.textContent = '';
    b.append(referencia.querySelector('svg').cloneNode(true), ' ' + tr('catalogos.pptxCliente', { nombre: t.nombre }) + ' ');
    if (hint) { hint.textContent = tr('catalogos.temaOrganizacion'); b.append(hint); }
    b.addEventListener('click', () => {
      document.dispatchEvent(new MouseEvent('click'));   // cierra el menú, como los botones de siempre
      exportPptx(t.clave);
    });
    anterior.after(b);
    anterior = b;
  });
}

export function aplicarCatalogos(catalogos) {
  reemplazarLista(KPI_LIBRARY, catalogos.kpis);
  reemplazarLista(VERBS_ALLOWED, catalogos.verbos.permitidos);
  reemplazarObjeto(VERBS_FORBIDDEN, catalogos.verbos.prohibidos);
  catalogos.temas.forEach((t) => { TEMAS_PPTX[t.clave] = t.definicion; });
  temasDeLaOrganizacion = catalogos.temas;
  botonesDeTemas(catalogos.temas);
  renderKpiLibrary();
  runLinter();
}
