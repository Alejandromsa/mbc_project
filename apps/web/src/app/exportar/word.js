// Informe Word y derivación de la Ficha: el contenido lo arma @processiq/exportar;
// aquí se valida y se descarga.
import { construirInformeWord, derivarFicha } from '@processiq/exportar';
import { state } from '../estado.js';
import { tr } from '../i18n.js';
import { download, filename } from './archivos.js';

// Ficha derivada del grafo (actividades con ruteo, sistemas, responsables, alcance)
function deriveFicha() {
  return derivarFicha(state);
}

function exportWord() {
  if (state.nodes.length === 0) { alert(tr('exportar.sinProcesoWord')); return; }
  download('﻿' + construirInformeWord(state), filename('doc'), 'application/msword');
}

export { deriveFicha, exportWord };
