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

async function pedir<T>(metodo: string, ruta: string, cuerpo?: unknown): Promise<T> {
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
  crearProceso: (proyectoId: string, datos: { nombre: string; contenido?: unknown; mensaje?: string }) =>
    pedir<{ proceso: Proceso; revision: ResumenRevision | null }>('POST', `/proyectos/${q(proyectoId)}/procesos`, datos),
  proceso: (id: string) => pedir<{ proceso: Proceso; rol: RolProyecto; revisiones: Revision[] }>('GET', `/procesos/${q(id)}`),
  renombrarProceso: (id: string, nombre: string) => pedir<{ proceso: Proceso }>('PATCH', `/procesos/${q(id)}`, { nombre }),
  guardarRevision: (procesoId: string, datos: { contenido: unknown; mensaje: string; padreId: string | null }) =>
    pedir<{ revision: ResumenRevision & { padreId: string | null; creadaEn: string }; conflicto: boolean; ultimaAnterior: { id: string; numero: number } | null }>(
      'POST', `/procesos/${q(procesoId)}/revisiones`, datos),
  revision: (id: string) => pedir<{ revision: Revision }>('GET', `/revisiones/${q(id)}`),
  cambiarEstado: (id: string, estado: EstadoRevision) =>
    pedir<{ revision: { id: string; estado: EstadoRevision } }>('POST', `/revisiones/${q(id)}/estado`, { estado }),

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
