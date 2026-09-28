// Cliente de la API de la plataforma (mismo origen: /api). Lo usan el shell de
// proyectos y la integración del editor (src/app/plataforma). La API es la que
// decide los permisos; aquí solo se tipan sus respuestas (apps/api/src/rutas).

export type RolOrganizacion = 'admin' | 'consultor' | 'lector';
export type RolProyecto = 'propietario' | 'editor' | 'revisor' | 'lector';
export type EstadoRevision = 'borrador' | 'en_revision' | 'aprobada';

export interface Usuario {
  id: string; email: string; nombre: string; rol: RolOrganizacion; debeCambiarClave: boolean;
}
export interface UsuarioAdmin extends Usuario {
  activo: boolean; creadoEn: string; ultimoAcceso: string | null;
}
export interface Persona { id: string; nombre: string; email: string }

export interface Proyecto {
  id: string; nombre: string; cliente: string; descripcion: string; archivado: boolean; creadoEn: string; rol: RolProyecto;
}
export interface Miembro { usuarioId: string; nombre: string; email: string; rol: RolProyecto }

export interface ResumenRevision { id: string; numero: number; estado: EstadoRevision }
export interface Proceso {
  id: string; proyectoId: string; nombre: string; creadoPor: string; creadoEn: string; actualizadoEn: string;
  ultimaRevision?: ResumenRevision | null;
}
export interface Revision extends ResumenRevision {
  procesoId: string; padreId: string | null; autorId: string; autor: string; mensaje: string;
  schemaVersion: number; creadaEn: string; contenido?: unknown;
}
export interface EventoAuditoria {
  id: number | string; accion: string; entidad: string; entidadId: string | null;
  detalle: unknown; ip: string | null; creadoEn: string; usuario: string | null;
}

export type EstadoEjecucionIa = 'en_cola' | 'ejecutando' | 'completada' | 'fallida' | 'cancelada';
export interface EjecucionIa {
  id: string; procesoId: string; usuarioId: string; tipo: 'generacion' | 'pains' | 'tarea'; tarea: string | null;
  modelo: string; estado: EstadoEjecucionIa; parametros: Record<string, unknown>; progreso: number;
  resultado?: any; error: string | null; intentos: number; tokensEntrada: number; tokensSalida: number; costeUsd: number;
  revisionId: string | null; descartada: boolean; creadoEn: string; iniciadoEn: string | null; terminadoEn: string | null;
}
export interface EstadoIa {
  configurada: boolean;
  modelos: { id: string; label: string; precio: { entrada: number; salida: number; nombre: string } }[];
  modeloAnalisis: string;
  presupuesto: { mensualUsd: number; gastadoUsd: number; limiteUsuarioUsd: number; gastadoUsuarioUsd: number };
}
export interface ConsumoIa {
  mes: { gastadoUsd: number; presupuestoUsd: number; limiteUsuarioUsd: number };
  porUsuario: { usuarioId: string; nombre: string; email: string; ejecuciones: number; costeUsd: number }[];
  recientes: (Pick<EjecucionIa, 'id' | 'procesoId' | 'tipo' | 'tarea' | 'modelo' | 'estado' | 'error' | 'intentos' | 'tokensEntrada' | 'tokensSalida' | 'costeUsd' | 'creadoEn' | 'terminadoEn'> & { usuario: string })[];
}

/** Catálogos con la forma de @processiq/dominio (lo que usa el editor). */
export interface Catalogos {
  kpis: { id: string; industry: string; macroprocess: string; name: string; unit: string; benchmark: string; description: string }[];
  verbos: { permitidos: string[]; prohibidos: Record<string, string> };
  temas: { clave: string; nombre: string; definicion: DefinicionTema }[];
}
export interface KpiAdmin {
  id: string; codigo: string; industria: string; macroproceso: string; nombre: string; unidad: string;
  benchmark: string; descripcion: string; activo: boolean; creadoEn: string; actualizadoEn: string;
}
export interface VerboAdmin { verbo: string; tipo: 'permitido' | 'prohibido'; motivo: string }
/** Tema PPTX (misma forma que TEMAS_PPTX de @processiq/exportar). */
export interface DefinicionTema {
  nombre: string; autor: string; pie: string;
  dk1: string; lt2: string; acento: string; gris: string; antetitulo: string; sep: string; chipRol: string; teal: string;
  rosa: string; verde: string; arena: string; circulo: string;
  font: string; fontTitulo: string; logo: string; logoInv: string; foto?: string; logoW: number; logoH: number;
  portada: 'mbc' | 'bbva'; portadaFondo: string; portadaTexto: string; portadaSub: string; cierre: boolean;
}
export interface TemaAdmin { id: string; clave: string; nombre: string; definicion: DefinicionTema; activo: boolean; actualizadoEn: string }
/** Plantilla de proceso (sin el contenido): se elige al crear un proceso. */
export interface Plantilla {
  id: string; nombre: string; descripcion: string; industria: string; nodos: number; activo: boolean;
  autor: string | null; creadoEn: string; actualizadoEn: string;
}

export interface EstadoSistema {
  version: string;
  api: { arrancadaEn: string; segundosActiva: number; node: string };
  baseDeDatos: { latenciaMs: number; tamanoBytes: number; migraciones: number };
  worker: { ultimoLatido: string | null; segundosSinLatido: number | null; vivo: boolean; detalle: Record<string, unknown> | null };
  ia: { configurada: boolean; enCola: number; ejecutando: number; fallidas24h: number; completadas24h: number };
  respaldos: { visible: false } | {
    visible: true; cantidad: number; ultimo: { archivo: string; bytes: number; fecha: string } | null;
    horasDesdeUltimo: number | null; disco: { libreBytes: number; totalBytes: number } | null;
  };
  errores: { ultimas24h: number; ultimaHora: number; grupos: GrupoError[] };
  avisos: { nivel: 'atencion' | 'error'; texto: string }[];
}
export interface GrupoError { huella: string; origen: string; mensaje: string; veces: number; ultima: string; ruta: string | null; pila: string | null }
export interface RepeticionError {
  id: number; origen: string; mensaje: string; pila: string | null; ruta: string | null; agente: string | null;
  detalle: Record<string, unknown>; creadoEn: string; usuario: string | null;
}

export class ErrorApi extends Error {
  readonly estado: number;
  readonly codigo: string | undefined;
  readonly detalles: unknown;
  constructor(estado: number, mensaje: string, codigo?: string, detalles?: unknown) {
    super(mensaje);
    this.estado = estado;
    this.codigo = codigo;
    this.detalles = detalles;
  }
}

/** Petición a la API con los errores, la sesión y la red tratados igual en todo el shell (también en los módulos de iniciativa). */
export async function pedir<T>(metodo: string, ruta: string, cuerpo?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch('/api' + ruta, {
      method: metodo,
      credentials: 'same-origin',
      headers: cuerpo === undefined ? {} : { 'content-type': 'application/json' },
      body: cuerpo === undefined ? null : JSON.stringify(cuerpo)
    });
  } catch {
    throw new ErrorApi(0, 'No hay conexión con el servidor. Revisa tu red e inténtalo de nuevo.', 'RED');
  }
  if (res.status === 204) return undefined as T;
  const texto = await res.text();
  let json: any = null;
  try { json = texto ? JSON.parse(texto) : null; } catch { /* respuesta que no es JSON (p. ej. un 502 del proxy) */ }
  if (!res.ok) {
    throw new ErrorApi(res.status, json?.error?.mensaje ?? `El servidor respondió con un error (${res.status}).`, json?.error?.codigo, json?.error?.detalles);
  }
  return json as T;
}

const q = (id: string) => encodeURIComponent(id);

export const api = {
  // Sesión
  sesion: () => pedir<{ usuario: Usuario }>('GET', '/sesion'),
  entrar: (email: string, clave: string) => pedir<{ usuario: Usuario }>('POST', '/sesion', { email, clave }),
  salir: () => pedir<void>('DELETE', '/sesion'),
  cambiarClave: (actual: string, nueva: string) => pedir<void>('POST', '/sesion/clave', { actual, nueva }),

  // Proyectos
  proyectos: () => pedir<{ proyectos: Proyecto[] }>('GET', '/proyectos'),
  crearProyecto: (datos: { nombre: string; cliente: string; descripcion: string }) =>
    pedir<{ proyecto: Proyecto }>('POST', '/proyectos', datos),
  proyecto: (id: string) => pedir<{ proyecto: Proyecto; miembros: Miembro[]; procesos: Proceso[] }>('GET', `/proyectos/${q(id)}`),
  cambiarProyecto: (id: string, cambios: Partial<Pick<Proyecto, 'nombre' | 'cliente' | 'descripcion' | 'archivado'>>) =>
    pedir<{ proyecto: Proyecto }>('PATCH', `/proyectos/${q(id)}`, cambios),
  ponerMiembro: (id: string, usuarioId: string, rol: RolProyecto) =>
    pedir<{ ok: true }>('PUT', `/proyectos/${q(id)}/miembros/${q(usuarioId)}`, { rol }),
  quitarMiembro: (id: string, usuarioId: string) => pedir<void>('DELETE', `/proyectos/${q(id)}/miembros/${q(usuarioId)}`),
  directorio: () => pedir<{ usuarios: Persona[] }>('GET', '/directorio'),

  // Procesos y revisiones
  crearProceso: (proyectoId: string, datos: { nombre: string; contenido?: unknown; plantillaId?: string; mensaje?: string }) =>
    pedir<{ proceso: Proceso; revision: ResumenRevision | null }>('POST', `/proyectos/${q(proyectoId)}/procesos`, datos),
  proceso: (id: string) => pedir<{ proceso: Proceso; rol: RolProyecto; revisiones: Revision[] }>('GET', `/procesos/${q(id)}`),
  renombrarProceso: (id: string, nombre: string) => pedir<{ proceso: Proceso }>('PATCH', `/procesos/${q(id)}`, { nombre }),
  guardarRevision: (procesoId: string, datos: { contenido: unknown; mensaje: string; padreId: string | null; ejecucionIaId?: string | null }) =>
    pedir<{ revision: ResumenRevision & { padreId: string | null; creadaEn: string }; conflicto: boolean; ultimaAnterior: { id: string; numero: number } | null }>(
      'POST', `/procesos/${q(procesoId)}/revisiones`, datos),
  revision: (id: string) => pedir<{ revision: Revision }>('GET', `/revisiones/${q(id)}`),
  cambiarEstado: (id: string, estado: EstadoRevision) =>
    pedir<{ revision: { id: string; estado: EstadoRevision } }>('POST', `/revisiones/${q(id)}/estado`, { estado }),

  // IA en el servidor (el cliente envía datos, nunca prompts)
  estadoIa: () => pedir<EstadoIa>('GET', '/ia/estado'),
  generarIa: (datos: {
    procesoId: string; texto: string; etiqueta: string; vista: 1 | 2 | 3; roles?: Record<string, string> | null;
    variasFuentes: boolean; fuentes: { nombre: string; tipo: string; caracteres: number }[]; modelo?: string;
  }) => pedir<{ ejecucion: EjecucionIa }>('POST', '/ia/generaciones', datos),
  analizarIa: (datos: { procesoId: string; tipo: string; contenido: unknown }) => pedir<{ ejecucion: EjecucionIa }>('POST', '/ia/analisis', datos),
  ejecucionIa: (id: string) => pedir<{ ejecucion: EjecucionIa }>('GET', `/ia/ejecuciones/${q(id)}`),
  cancelarIa: (id: string) => pedir<{ ejecucion: EjecucionIa }>('POST', `/ia/ejecuciones/${q(id)}/cancelar`),
  descartarIa: (id: string) => pedir<{ ejecucion: EjecucionIa }>('POST', `/ia/ejecuciones/${q(id)}/descartar`),
  iaDelProceso: (procesoId: string) => pedir<{ ejecuciones: EjecucionIa[]; pendientes: EjecucionIa[] }>('GET', `/ia/procesos/${q(procesoId)}`),
  consumoIa: () => pedir<ConsumoIa>('GET', '/ia/consumo'),
  /** URL del progreso en vivo (SSE) de una ejecución. */
  eventosIa: (id: string) => `/api/ia/ejecuciones/${q(id)}/eventos`,

  // Catálogos (lectura: cualquiera; cambios: administradores)
  catalogos: () => pedir<Catalogos>('GET', '/catalogos'),
  kpisAdmin: () => pedir<{ kpis: KpiAdmin[] }>('GET', '/catalogos/kpis'),
  crearKpi: (d: Pick<KpiAdmin, 'industria' | 'macroproceso' | 'nombre' | 'unidad' | 'benchmark' | 'descripcion'>) =>
    pedir<{ kpi: KpiAdmin }>('POST', '/catalogos/kpis', d),
  cambiarKpi: (id: string, cambios: Partial<Pick<KpiAdmin, 'industria' | 'macroproceso' | 'nombre' | 'unidad' | 'benchmark' | 'descripcion' | 'activo'>>) =>
    pedir<{ kpi: KpiAdmin }>('PATCH', `/catalogos/kpis/${q(id)}`, cambios),
  verbosAdmin: () => pedir<{ verbos: VerboAdmin[] }>('GET', '/catalogos/verbos'),
  ponerVerbo: (verbo: string, d: { tipo: VerboAdmin['tipo']; motivo?: string }) => pedir<{ verbo: VerboAdmin }>('PUT', `/catalogos/verbos/${q(verbo)}`, d),
  quitarVerbo: (verbo: string) => pedir<void>('DELETE', `/catalogos/verbos/${q(verbo)}`),
  temasAdmin: () => pedir<{ temas: TemaAdmin[] }>('GET', '/catalogos/temas'),
  crearTema: (clave: string, definicion: DefinicionTema) => pedir<{ tema: TemaAdmin }>('POST', '/catalogos/temas', { clave, definicion }),
  cambiarTema: (id: string, cambios: { definicion?: DefinicionTema; activo?: boolean }) => pedir<{ tema: TemaAdmin }>('PATCH', `/catalogos/temas/${q(id)}`, cambios),
  borrarTema: (id: string) => pedir<void>('DELETE', `/catalogos/temas/${q(id)}`),
  plantillas: () => pedir<{ plantillas: Plantilla[] }>('GET', '/catalogos/plantillas'),
  crearPlantilla: (d: { revisionId: string; nombre: string; descripcion?: string; industria?: string }) =>
    pedir<{ plantilla: Plantilla }>('POST', '/catalogos/plantillas', d),
  cambiarPlantilla: (id: string, cambios: Partial<Pick<Plantilla, 'nombre' | 'descripcion' | 'industria' | 'activo'>>) =>
    pedir<{ plantilla: Plantilla }>('PATCH', `/catalogos/plantillas/${q(id)}`, cambios),
  borrarPlantilla: (id: string) => pedir<void>('DELETE', `/catalogos/plantillas/${q(id)}`),

  // Estado del sistema (administradores)
  sistema: () => pedir<EstadoSistema>('GET', '/sistema'),
  repeticionesError: (huella: string) => pedir<{ repeticiones: RepeticionError[] }>('GET', `/sistema/errores/${q(huella)}`),

  // Administración
  usuarios: () => pedir<{ usuarios: UsuarioAdmin[] }>('GET', '/usuarios'),
  crearUsuario: (datos: { email: string; nombre: string; rol: RolOrganizacion }) =>
    pedir<{ usuario: UsuarioAdmin; claveTemporal: string }>('POST', '/usuarios', datos),
  cambiarUsuario: (id: string, cambios: Partial<Pick<UsuarioAdmin, 'nombre' | 'rol' | 'activo'>>) =>
    pedir<{ usuario: UsuarioAdmin }>('PATCH', `/usuarios/${q(id)}`, cambios),
  restablecerClave: (id: string) => pedir<{ claveTemporal: string }>('POST', `/usuarios/${q(id)}/restablecer-clave`),
  auditoria: (filtros: { entidad?: string; entidadId?: string; limite?: number }) => {
    const p = new URLSearchParams();
    if (filtros.entidad) p.set('entidad', filtros.entidad);
    if (filtros.entidadId) p.set('entidadId', filtros.entidadId);
    if (filtros.limite) p.set('limite', String(filtros.limite));
    return pedir<{ eventos: EventoAuditoria[] }>('GET', `/auditoria${p.size ? '?' + p : ''}`);
  }
};
