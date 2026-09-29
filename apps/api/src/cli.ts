// Línea de comandos de administración (dentro del contenedor de la API):
//   node dist/cli.js crear-usuario --email ana@mbc.pe --nombre "Ana Ruiz" [--rol admin|consultor|lector]
//   node dist/cli.js restablecer-clave --email ana@mbc.pe
// La contraseña temporal se muestra una sola vez y debe cambiarse al entrar.
// Cada cambio queda en la auditoría como «cli.<entidad>.<acción>», sin autor
// (usuarioId nulo) y con detalle.origen = 'cli'.
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { eq } from 'drizzle-orm';
import { aplicarMigraciones, conectar, sesiones, usuarios, type BaseDeDatos } from '@processiq/db';
import { registrarEvento } from './auditoria.js';
import { crearUsuario } from './organizacion.js';
import { claveTemporal, hashearClave } from './seguridad.js';

/** Ejecuta un comando y devuelve lo que hay que mostrar. Lanza un Error con el mensaje para la persona. */
export async function ejecutarCli(db: BaseDeDatos, argumentos: string[]): Promise<string> {
  const { positionals, values } = parseArgs({
    args: argumentos,
    allowPositionals: true,
    options: { email: { type: 'string' }, nombre: { type: 'string' }, rol: { type: 'string', default: 'consultor' } }
  });
  const comando = positionals[0];
  if (comando === 'crear-usuario') {
    if (!values.email || !values.nombre) throw new Error('Uso: crear-usuario --email correo --nombre "Nombre" [--rol admin|consultor|lector]');
    if (!['admin', 'consultor', 'lector'].includes(values.rol!)) throw new Error('--rol debe ser admin, consultor o lector');
    const r = await crearUsuario(db, { email: values.email, nombre: values.nombre, rol: values.rol as 'admin' });
    await registrarEvento(db, {
      usuarioId: null, accion: 'cli.usuario.alta', entidad: 'usuario', entidadId: r.usuario.id,
      detalle: { origen: 'cli', email: r.usuario.email, rol: values.rol }
    });
    return `Usuario creado: ${r.usuario.email} (${values.rol})\nContraseña temporal: ${r.claveTemporal}\nSe pedirá cambiarla al entrar.`;
  }
  if (comando === 'restablecer-clave') {
    if (!values.email) throw new Error('Uso: restablecer-clave --email correo');
    const email = values.email.trim().toLowerCase();
    const temporal = claveTemporal();
    const [u] = await db.update(usuarios).set({ hashClave: await hashearClave(temporal), debeCambiarClave: true })
      .where(eq(usuarios.email, email)).returning({ id: usuarios.id });
    if (!u) throw new Error('No existe un usuario con ese correo.');
    await db.delete(sesiones).where(eq(sesiones.usuarioId, u.id));
    await registrarEvento(db, {
      usuarioId: null, accion: 'cli.usuario.restablecer_clave', entidad: 'usuario', entidadId: u.id,
      detalle: { origen: 'cli', email }
    });
    return `Contraseña temporal: ${temporal}\nSe pedirá cambiarla al entrar.`;
  }
  throw new Error('Comandos: crear-usuario, restablecer-clave');
}

/** ¿Se ejecuta este archivo (node dist/cli.js) o lo importa una prueba? */
function esPrincipal(): boolean {
  if (!process.argv[1]) return false;
  try { return import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href; } catch { return false; }
}

if (esPrincipal()) {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error('Falta DATABASE_URL'); process.exit(1); }
  const conexion = conectar(url, { max: 1 });
  try {
    await aplicarMigraciones(conexion.db, process.env.CARPETA_MIGRACIONES || undefined);
    console.log(await ejecutarCli(conexion.db, process.argv.slice(2)));
  } catch (e) {
    console.error((e as Error).message);
    process.exitCode = 1;
  } finally {
    await conexion.cerrar();
  }
}
