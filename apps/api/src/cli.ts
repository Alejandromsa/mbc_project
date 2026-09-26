// Línea de comandos de administración (dentro del contenedor de la API):
//   node dist/cli.js crear-usuario --email ana@mbc.pe --nombre "Ana Ruiz" [--rol admin|consultor|lector]
//   node dist/cli.js restablecer-clave --email ana@mbc.pe
// La contraseña temporal se muestra una sola vez y debe cambiarse al entrar.
import { parseArgs } from 'node:util';
import { eq } from 'drizzle-orm';
import { aplicarMigraciones, conectar, sesiones, usuarios } from '@processiq/db';
import { crearUsuario } from './organizacion.js';
import { claveTemporal, hashearClave } from './seguridad.js';

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { email: { type: 'string' }, nombre: { type: 'string' }, rol: { type: 'string', default: 'consultor' } }
});
const comando = positionals[0];
const url = process.env.DATABASE_URL;
if (!url) { console.error('Falta DATABASE_URL'); process.exit(1); }

const conexion = conectar(url, { max: 1 });
try {
  await aplicarMigraciones(conexion.db, process.env.CARPETA_MIGRACIONES || undefined);
  if (comando === 'crear-usuario') {
    if (!values.email || !values.nombre) throw new Error('Uso: crear-usuario --email correo --nombre "Nombre" [--rol admin|consultor|lector]');
    if (!['admin', 'consultor', 'lector'].includes(values.rol!)) throw new Error('--rol debe ser admin, consultor o lector');
    const r = await crearUsuario(conexion.db, { email: values.email, nombre: values.nombre, rol: values.rol as 'admin' });
    console.log(`Usuario creado: ${r.usuario.email} (${values.rol})\nContraseña temporal: ${r.claveTemporal}\nSe pedirá cambiarla al entrar.`);
  } else if (comando === 'restablecer-clave') {
    if (!values.email) throw new Error('Uso: restablecer-clave --email correo');
    const temporal = claveTemporal();
    const [u] = await conexion.db.update(usuarios).set({ hashClave: await hashearClave(temporal), debeCambiarClave: true })
      .where(eq(usuarios.email, values.email.trim().toLowerCase())).returning({ id: usuarios.id });
    if (!u) throw new Error('No existe un usuario con ese correo.');
    await conexion.db.delete(sesiones).where(eq(sesiones.usuarioId, u.id));
    console.log(`Contraseña temporal: ${temporal}\nSe pedirá cambiarla al entrar.`);
  } else {
    throw new Error('Comandos: crear-usuario, restablecer-clave');
  }
} catch (e) {
  console.error((e as Error).message);
  process.exitCode = 1;
} finally {
  await conexion.cerrar();
}
