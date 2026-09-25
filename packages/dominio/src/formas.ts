import type { TipoNodo } from './modelo.js';

export interface FormaPorDefecto {
  w: number;
  h: number;
  label: string;
}

/** Tamaño y etiqueta inicial de cada forma (en px del lienzo). */
export const FORMAS_POR_DEFECTO: Readonly<Record<TipoNodo, FormaPorDefecto>> = {
  start:        { w: 54,  h: 54,  label: 'Inicio' },
  end:          { w: 54,  h: 54,  label: 'Fin' },
  intermediate: { w: 54,  h: 54,  label: 'Evento' },
  task:         { w: 158, h: 76,  label: 'Actividad' },
  decision:     { w: 110, h: 80,  label: '¿Decisión?' },
  document:     { w: 110, h: 70,  label: 'Documento' },
  data:         { w: 110, h: 60,  label: 'Data' },
  system:       { w: 158, h: 76,  label: 'Sistema' }
};
