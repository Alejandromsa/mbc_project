// Tipos de la extracción de documentos (la implementación está en extraccion.ts).

export interface ArchivoEntrada {
  name: string;
  size: number;
}

/** Lo que la extracción necesita del entorno (navegador, Web Worker o servidor). */
export interface EntornoExtraccion {
  /** Mensaje y porcentaje de avance (null = indeterminado). */
  progreso(mensaje: string, porcentaje: number | null): void;
  /** Cede el hilo para que la interfaz no se congele. */
  ceder(): Promise<void>;
  /** Lanza Error('CANCELLED') si el usuario canceló. */
  comprobarCancelado(): void;
  leer(archivo: ArchivoEntrada, como: 'text' | 'arraybuffer'): Promise<any>;
  /** Cargadores diferidos de las librerías (mammoth 1.13.0, pdf.js 4.7.76, JSZip 3.10.1). */
  mammoth(): Promise<{ extractRawText(o: { arrayBuffer: ArrayBuffer }): Promise<{ value: string }> }>;
  pdfjs(): Promise<any>;
  jszip(): Promise<any>;
  /** Importa un BPMN al proceso abierto y devuelve el conteo de elementos. */
  importarBpmn(xml: string): { count: number; [k: string]: unknown } | null;
}

export type TextoExtraido =
  | { kind: 'bpmn'; result: { count: number; [k: string]: unknown }; name: string }
  | { kind: 'text'; text: string; name: string };
