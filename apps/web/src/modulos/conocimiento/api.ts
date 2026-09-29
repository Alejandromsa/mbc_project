// Cliente tipado de /api/conocimiento (apps/api/src/modulos/conocimiento).
// Usa pedir() del shell: errores, sesión y red se tratan igual en toda la web.
import { pedir, type EstadoRevision } from '../../shell/api';

export type Campo = 'nombre' | 'actividad' | 'sistema' | 'rol' | 'elemento' | 'ficha';

export interface ProcesoEncontrado {
  procesoId: string;
  nombre: string;
  proyecto: { id: string; nombre: string; cliente: string; archivado: boolean };
  revision: { id: string; numero: number; estado: EstadoRevision };
  /** 0 a 1 */
  parecido: number;
}

export interface ResultadoBusqueda extends ProcesoEncontrado {
  extracto: { campo: Campo; texto: string; etiqueta?: string };
}

export interface ProcesoParecido extends ProcesoEncontrado {
  enComun: { actividades: string[]; sistemas: string[]; roles: string[] };
}

export interface Parecidos {
  procesoId: string;
  nombre: string;
  /** null si el proceso aún no tiene revisiones (no está en el índice). */
  proceso: ProcesoEncontrado | null;
  parecidos: ProcesoParecido[];
}

export interface CoberturaCategoria {
  codigo: string;
  nombre: string;
  actividades: number;
  grupos: number;
  gruposCubiertos: { codigo: string; nombre: string; actividades: number }[];
  gruposFaltantes: { codigo: string; nombre: string }[];
  cobertura: number | null;
}

export interface Comparativo {
  marco: { elementos: number };
  revision: { id: string; numero: number } | null;
  umbral: number;
  actividades: {
    id: string; texto: string; rol: string; sistema: string;
    elemento: { codigo: string; nombre: string; nivel: number } | null;
    parecido: number | null;
  }[];
  categorias: CoberturaCategoria[];
}

export interface ResumenMarco {
  elementos: number;
  porNivel: Record<string, number>;
  categorias: { codigo: string; nombre: string; elementos: number }[];
}

export interface VistaPrevia extends ResumenMarco {
  valido: boolean;
  errores: string[];
  avisos: string[];
  muestra: { codigo: string; nombre: string; nivel: number }[];
}

const q = (v: string) => encodeURIComponent(v);

export const apiConocimiento = {
  buscar: (texto: string) => pedir<{ terminos: string[]; resultados: ResultadoBusqueda[] }>('GET', `/conocimiento/buscar?q=${q(texto)}`),
  parecidos: (procesoId: string) => pedir<Parecidos>('GET', `/conocimiento/procesos/${q(procesoId)}/parecidos`),
  comparativo: (procesoId: string, umbral: number) =>
    pedir<Comparativo>('GET', `/conocimiento/procesos/${q(procesoId)}/comparativo?umbral=${umbral}`),
  marco: () => pedir<ResumenMarco & { importadoEn: string | null }>('GET', '/conocimiento/marco'),
  vistaPrevia: (csv: string) => pedir<VistaPrevia>('POST', '/conocimiento/marco/vista-previa', { csv }),
  importarMarco: (csv: string) => pedir<ResumenMarco & { avisos: string[]; reemplazados: number }>('PUT', '/conocimiento/marco', { csv })
};
