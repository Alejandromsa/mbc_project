// Portafolio: estado de los procesos por cliente (docs/iniciativas/portafolio.md).
// Solo lectura: no escribe en ninguna tabla, así que no hay nada que auditar.
import { Hono, type Context } from 'hono';
import type { Entorno } from '../../contexto.js';
import { detalleCliente, resumenClientes, type Opciones } from './servicio.js';

const opciones = (c: Context<Entorno>): Opciones => ({ archivados: c.req.query('archivados') === '1' });

export function rutasPortafolio() {
  const r = new Hono<Entorno>();

  // Clientes de los proyectos que puedo ver, con el avance de sus procesos
  r.get('/clientes', async (c) => {
    return c.json({ clientes: await resumenClientes(c.get('db'), c.get('usuario'), opciones(c)) });
  });

  // Un cliente: sus proyectos y procesos, con los indicadores de la última revisión.
  // El nombre va en la consulta (?nombre=), porque es texto libre; vacío = proyectos sin cliente.
  r.get('/cliente', async (c) => {
    return c.json(await detalleCliente(c.get('db'), c.get('usuario'), c.req.query('nombre') ?? '', opciones(c)));
  });

  return r;
}
