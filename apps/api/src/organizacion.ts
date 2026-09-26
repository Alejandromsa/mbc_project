// Organización por defecto: por ahora hay una sola (docs/arquitectura.md §7).
import { asc, eq } from 'drizzle-orm';
import { organizaciones, usuarios, type BaseDeDatos } from '@processiq/db';
import { asegurarCatalogos } from './catalogos.js';
import { claveTemporal, hashearClave } from './seguridad.js';

export async function asegurarOrganizacion(db: BaseDeDatos, nombre = 'MBC'): Promise<string> {
  const [org] = await db.select({ id: organizaciones.id }).from(organizaciones).orderBy(asc(organizaciones.creadoEn)).limit(1);
  if (org) return org.id;
  const [nueva] = await db.insert(organizaciones).values({ nombre }).returning({ id: organizaciones.id });
  await asegurarCatalogos(db, nueva!.id);   // KPIs y verbos del MVP como punto de partida
  return nueva!.id;
}

/** Alta de un usuario con contraseña temporal (la usa la línea de comandos para el primer administrador). */
export async function crearUsuario(db: BaseDeDatos, datos: { email: string; nombre: string; rol: 'admin' | 'consultor' | 'lector' }) {
  const organizacionId = await asegurarOrganizacion(db);
  const email = datos.email.trim().toLowerCase();
  const [existe] = await db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.email, email)).limit(1);
  if (existe) throw new Error(`Ya existe un usuario con el correo ${email}.`);
  const temporal = claveTemporal();
  const [u] = await db.insert(usuarios).values({
    organizacionId, email, nombre: datos.nombre.trim(), rol: datos.rol, hashClave: await hashearClave(temporal), debeCambiarClave: true
  }).returning({ id: usuarios.id, email: usuarios.email });
  return { usuario: u!, claveTemporal: temporal };
}
