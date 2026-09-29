// Cliente de /api/portafolio (apps/api/src/modulos/portafolio). Usa pedir() del
// shell: errores, sesión y red se tratan igual que en el resto de la plataforma.
import { pedir, type EstadoRevision } from '../../shell/api';

export type Severidad = 'critical' | 'high' | 'medium' | 'low';

export interface Avance { aprobados: number; enRevision: number; borradores: number; sinRevisiones: number }
export type ConteoHallazgos = Record<Severidad, number> & { total: number };
export interface ResumenPains { total: number; puntuacion: number; maxima: number }

export interface ResumenCliente {
  /** '' = proyectos sin cliente. */
  cliente: string;
  proyectos: number;
  procesos: number;
  avance: Avance;
  actualizadoEn: string | null;
}

export interface IndicadoresProceso {
  porTipo: Record<string, number>;
  actividades: number;
  roles: string[];
  ejecucion: Record<string, number>;
  pains: ResumenPains;
  kpis: { definidos: number; conValor: number };
  hallazgos: ConteoHallazgos;
}

export interface ProcesoPortafolio {
  id: string;
  nombre: string;
  actualizadoEn: string;
  ultimaRevision: { id: string; numero: number; estado: EstadoRevision; creadaEn: string } | null;
  indicadores: IndicadoresProceso | null;
  contenidoInvalido: boolean;
}

export interface PainPrincipal {
  procesoId: string; proceso: string; actividad: string; categoria: string; descripcion: string;
  severidad: number; frecuencia: number; puntuacion: number;
}

export interface DetalleCliente {
  cliente: string;
  resumen: Omit<ResumenCliente, 'cliente'>;
  indicadores: {
    procesosConContenido: number;
    porTipo: Record<string, number>;
    actividades: number;
    roles: number;
    ejecucion: Record<string, number>;
    pains: ResumenPains;
    painsPrincipales: PainPrincipal[];
    kpis: { definidos: number; conValor: number };
    hallazgos: ConteoHallazgos;
  };
  proyectos: { id: string; nombre: string; archivado: boolean; procesos: ProcesoPortafolio[] }[];
}

const conArchivados = (archivados: boolean) => (archivados ? 'archivados=1' : '');

export const apiPortafolio = {
  clientes: (archivados: boolean) =>
    pedir<{ clientes: ResumenCliente[] }>('GET', `/portafolio/clientes?${conArchivados(archivados)}`),
  cliente: (nombre: string, archivados: boolean) =>
    pedir<DetalleCliente>('GET', `/portafolio/cliente?nombre=${encodeURIComponent(nombre)}&${conArchivados(archivados)}`)
};
