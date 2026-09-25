// Datos de prueba para DESARROLLO: una cuenta por cada rol y caso de acceso, y
// un proyecto con procesos y revisiones en todos los estados. Proyectos,
// procesos y revisiones se crean a través de la propia API (mismas
// validaciones, numeración y auditoría que en uso real).
// Repetible: restablece las cuentas y rehace los proyectos de prueba.
// Punto de entrada con la protección contra producción: sembrar.ts.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { inArray } from 'drizzle-orm';
import { proyectos, sesiones, usuarios, type BaseDeDatos } from '@processiq/db';
import { crearApp } from './app.js';
import { leerConfigIa, type Config } from './config.js';
import { asegurarOrganizacion } from './organizacion.js';
import { hashearClave } from './seguridad.js';

export const CLAVE_PRUEBA = 'Prueba-ProcessIQ-2026';
/** Dominio reservado (RFC 2606): nunca coincide con un correo real. */
export const DOMINIO_PRUEBA = 'processiq.test';
const ORIGEN = 'http://localhost:5173';

type RolOrganizacion = 'admin' | 'consultor' | 'lector';
type RolProyecto = 'propietario' | 'editor' | 'revisor' | 'lector';

export const CUENTAS_PRUEBA: { usuario: string; nombre: string; rol: RolOrganizacion; enProyecto?: RolProyecto; temporal?: boolean; inactivo?: boolean; para: string }[] = [
  { usuario: 'admin', nombre: 'Admin de Prueba', rol: 'admin', para: 'usuarios, auditoría y todos los proyectos' },
  { usuario: 'propietario', nombre: 'Propietario de Prueba', rol: 'consultor', enProyecto: 'propietario', para: 'crea proyectos y gestiona miembros' },
  { usuario: 'editor', nombre: 'Editor de Prueba', rol: 'consultor', enProyecto: 'editor', para: 'guarda revisiones y las envía a revisión' },
  { usuario: 'revisor', nombre: 'Revisor de Prueba', rol: 'consultor', enProyecto: 'revisor', para: 'aprueba o devuelve revisiones' },
  { usuario: 'lector', nombre: 'Lector de Prueba', rol: 'lector', enProyecto: 'lector', para: 'solo lee; no puede crear proyectos' },
  { usuario: 'externo', nombre: 'Externo de Prueba', rol: 'consultor', para: 'sin acceso al proyecto de prueba (404)' },
  { usuario: 'nuevo', nombre: 'Nuevo de Prueba', rol: 'consultor', temporal: true, para: 'debe cambiar la contraseña al entrar' },
  { usuario: 'inactivo', nombre: 'Inactivo de Prueba', rol: 'consultor', inactivo: true, para: 'desactivado: no puede entrar' }
];

export const correoPrueba = (usuario: string) => `${usuario}@${DOMINIO_PRUEBA}`;

async function fixture(nombre: string): Promise<Record<string, any>> {
  const ruta = fileURLToPath(new URL(`../../../packages/dominio/src/__fixtures__/${nombre}`, import.meta.url));
  return JSON.parse(await readFile(ruta, 'utf8'));
}

/** Cliente HTTP contra la app (sin red) que guarda la cookie de sesión. */
function cliente(app: ReturnType<typeof crearApp>) {
  let cookie = '';
  return async function pedir(metodo: string, ruta: string, cuerpo?: unknown): Promise<any> {
    const headers: Record<string, string> = { origin: ORIGEN };
    if (cookie) headers.cookie = cookie;
    if (cuerpo !== undefined) headers['content-type'] = 'application/json';
    const res = await app.request(ruta, { method: metodo, headers, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0]!;
    const texto = await res.text();
    const json = texto ? JSON.parse(texto) : null;
    if (!res.ok) throw new Error(`${metodo} ${ruta} -> ${res.status}: ${json?.error?.mensaje ?? texto}`);
    return json;
  };
}

export async function sembrar(db: BaseDeDatos, databaseUrl: string) {
  const organizacionId = await asegurarOrganizacion(db);

  // Cuentas: se crean o se restablecen (misma contraseña, rol y estado de siempre)
  const ids: Record<string, string> = {};
  for (const c of CUENTAS_PRUEBA) {
    const valores = {
      nombre: c.nombre, rol: c.rol, hashClave: await hashearClave(CLAVE_PRUEBA),
      activo: !c.inactivo, debeCambiarClave: !!c.temporal
    };
    const [u] = await db.insert(usuarios).values({ organizacionId, email: correoPrueba(c.usuario), ...valores })
      .onConflictDoUpdate({ target: usuarios.email, set: valores }).returning({ id: usuarios.id });
    ids[c.usuario] = u!.id;
  }
  const todos = Object.values(ids);
  await db.delete(sesiones).where(inArray(sesiones.usuarioId, todos));
  // Los proyectos de prueba se rehacen desde cero (procesos, revisiones y miembros caen en cascada)
  await db.delete(proyectos).where(inArray(proyectos.creadoPor, todos));

  const config: Config = { databaseUrl, origenPublico: ORIGEN, puerto: 0, horasSesion: 12, ia: leerConfigIa({}) };
  const app = crearApp(db, config);
  const como = async (usuario: string) => {
    const pedir = cliente(app);
    await pedir('POST', '/api/sesion', { email: correoPrueba(usuario), clave: CLAVE_PRUEBA });
    return pedir;
  };
  const propietario = await como('propietario');
  const editor = await como('editor');
  const revisor = await como('revisor');

  const { proyecto } = await propietario('POST', '/api/proyectos', {
    nombre: 'Siniestros — Seguros Andinos (prueba)',
    cliente: 'Seguros Andinos (ficticio)',
    descripcion: 'Proyecto de prueba para desarrollo: procesos con revisiones en todos los estados.'
  });
  for (const c of CUENTAS_PRUEBA) {
    if (c.enProyecto && c.enProyecto !== 'propietario') {
      await propietario('PUT', `/api/proyectos/${proyecto.id}/miembros/${ids[c.usuario]}`, { rol: c.enProyecto });
    }
  }

  // Siniestros: v1 aprobada, v2 en revisión, v3 borrador
  const siniestros = await fixture('mvp-3.8.9-siniestros.json');
  const a = await propietario('POST', `/api/proyectos/${proyecto.id}/procesos`, { nombre: 'Gestión de siniestros', contenido: siniestros });
  await propietario('POST', `/api/revisiones/${a.revision.id}/estado`, { estado: 'en_revision' });
  await revisor('POST', `/api/revisiones/${a.revision.id}/estado`, { estado: 'aprobada' });
  const v2 = await editor('POST', `/api/procesos/${a.proceso.id}/revisiones`, {
    contenido: { ...siniestros, meta: { ...siniestros.meta, owner: 'Jefatura de Siniestros' } },
    mensaje: 'Ajustes tras la entrevista con el área de siniestros', padreId: a.revision.id
  });
  await editor('POST', `/api/revisiones/${v2.revision.id}/estado`, { estado: 'en_revision' });
  await editor('POST', `/api/procesos/${a.proceso.id}/revisiones`, {
    contenido: { ...siniestros, meta: { ...siniestros.meta, owner: 'Jefatura de Siniestros', client: 'Seguros Andinos' } },
    mensaje: 'Borrador en curso', padreId: v2.revision.id
  });

  // Venta de lotes: una sola revisión en borrador; y un proceso aún sin revisiones
  await editor('POST', `/api/proyectos/${proyecto.id}/procesos`, { nombre: 'Venta de lotes urbanos', contenido: await fixture('mvp-3.8.9-venta-lotes.json') });
  await propietario('POST', `/api/proyectos/${proyecto.id}/procesos`, { nombre: 'Proceso sin revisiones' });

  // Un proyecto archivado (solo lectura)
  const archivado = await propietario('POST', '/api/proyectos', { nombre: 'Proyecto archivado (prueba)', cliente: 'Cliente antiguo (ficticio)' });
  await propietario('PATCH', `/api/proyectos/${archivado.proyecto.id}`, { archivado: true });

  return { ids, proyectoId: proyecto.id as string, procesoSiniestrosId: a.proceso.id as string, archivadoId: archivado.proyecto.id as string };
}
