// Prueba de humo contra un entorno desplegado (docs/runbooks/despliegue.md). La
// lanza infra/promover.sh antes de pasar una versión a producción, con una cuenta
// de administrador temporal que se desactiva al terminar. A mano:
//   BASE=https://staging.… CORREO=… CLAVE_TEMPORAL=… node infra/humo.mjs
// Crea un proyecto «Humo …» (queda archivado), dos procesos y una plantilla (se
// borra). No imprime credenciales. Sale con 1 si falla alguna comprobación.
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

const BASE = process.env.BASE;
if (!BASE || !process.env.CORREO || !process.env.CLAVE_TEMPORAL) {
  console.error('Faltan BASE, CORREO o CLAVE_TEMPORAL.');
  process.exit(2);
}
const FIXTURE = new URL('../packages/dominio/src/__fixtures__/mvp-3.8.9-siniestros.json', import.meta.url);
let cookie = '';
let fallos = 0;

async function pedir(metodo, ruta, cuerpo) {
  const headers = { origin: BASE };
  if (cookie) headers.cookie = cookie;
  if (cuerpo !== undefined) headers['content-type'] = 'application/json';
  const r = await fetch(BASE + ruta, { method: metodo, headers, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
  const sc = r.headers.get('set-cookie');
  if (sc) cookie = sc.split(';')[0];
  const t = await r.text();
  return { status: r.status, json: t ? JSON.parse(t) : null };
}
function comprobar(nombre, ok, detalle = '') {
  console.log(`${ok ? 'OK   ' : 'FALLA'} ${nombre}${ok ? '' : ' ' + detalle}`);
  if (!ok) fallos++;
}

const nueva = 'Humo-' + randomBytes(12).toString('base64url') + '-2026';
let r = await pedir('POST', '/api/sesion', { email: process.env.CORREO, clave: process.env.CLAVE_TEMPORAL });
comprobar('entrar con la clave temporal', r.status === 200, r.status);
r = await pedir('POST', '/api/sesion/clave', { actual: process.env.CLAVE_TEMPORAL, nueva });
comprobar('cambiar la clave temporal', r.status === 200 || r.status === 204, JSON.stringify(r.json));

const sello = new Date().toISOString().slice(0, 16);
r = await pedir('POST', '/api/proyectos', { nombre: `Humo ${sello}`, cliente: 'Cliente Demo (humo)' });
comprobar('crear proyecto', r.status === 201, r.status);
const proyecto = r.json.proyecto;
r = await pedir('POST', `/api/proyectos/${proyecto.id}/procesos`, { nombre: 'Siniestros (humo)', contenido: JSON.parse(readFileSync(FIXTURE, 'utf8')) });
comprobar('crear proceso con contenido', r.status === 201 && r.json.revision?.numero === 1, r.status);
const revisionId = r.json.revision.id;
const procesoHumo = r.json.proceso.id;

r = await pedir('POST', '/api/catalogos/plantillas', { revisionId, nombre: `Humo ${sello}` });
comprobar('guardar la revisión como plantilla', r.status === 201 && r.json.plantilla.nodos > 5, JSON.stringify(r.json));
const plantillaId = r.json.plantilla?.id;
r = await pedir('POST', `/api/proyectos/${proyecto.id}/procesos`, { nombre: 'Desde plantilla (humo)', plantillaId });
comprobar('crear proceso desde la plantilla', r.status === 201, r.status);
r = await pedir('GET', `/api/revisiones/${r.json.revision.id}`);
comprobar('la v1 lleva el nombre y el cliente del proyecto',
  r.json.revision.contenido.meta.name === 'Desde plantilla (humo)' && r.json.revision.contenido.meta.client === 'Cliente Demo (humo)');

// Corrección del KPI: ocultar no borra sus campos
r = await pedir('GET', '/api/catalogos/kpis');
const kpi = r.json.kpis.find((k) => k.activo && k.unidad);
await pedir('PATCH', `/api/catalogos/kpis/${kpi.id}`, { activo: false });
r = await pedir('GET', '/api/catalogos/kpis');
const tras = r.json.kpis.find((k) => k.id === kpi.id);
comprobar('ocultar un KPI conserva sus campos', !tras.activo && tras.unidad === kpi.unidad && tras.descripcion === kpi.descripcion);
await pedir('PATCH', `/api/catalogos/kpis/${kpi.id}`, { activo: true });

// Portafolio (módulo): el cliente del proyecto de humo aparece con sus dos procesos
r = await pedir('GET', '/api/portafolio/clientes');
const cli = r.status === 200 ? r.json.clientes.find((c) => c.cliente === 'Cliente Demo (humo)') : null;
comprobar('portafolio: el cliente aparece con sus procesos', !!cli && cli.procesos === 2, r.status);
r = await pedir('GET', `/api/portafolio/cliente?nombre=${encodeURIComponent('Cliente Demo (humo)')}`);
comprobar('portafolio: detalle con indicadores', r.status === 200 && r.json.proyectos?.[0]?.procesos?.some((p) => p.indicadores), r.status);

// Conocimiento (módulo): la búsqueda indexa y encuentra el proceso de humo; parecidos responde
r = await pedir('GET', `/api/conocimiento/buscar?q=${encodeURIComponent('siniestro')}`);
const encontrados = r.status === 200 ? JSON.stringify(r.json) : '';
comprobar('conocimiento: la búsqueda encuentra el proceso de humo', encontrados.includes('Siniestros (humo)'), r.status);
r = await pedir('GET', `/api/conocimiento/procesos/${procesoHumo}/parecidos`);
comprobar('conocimiento: parecidos responde', r.status === 200, r.status);

// Invitados (módulo): enlace, lectura y comentario SIN cookie, y 404 tras revocar
r = await pedir('POST', `/api/invitados/revisiones/${revisionId}/enlaces`, { destinatario: 'Cliente de humo' });
comprobar('invitados: crear enlace', r.status === 201 && !!r.json.token, r.status);
const token = r.json.token, enlaceId = r.json.enlace?.id;
const sinSesion = (metodo, ruta, cuerpo) => fetch(BASE + ruta, {
  method: metodo, headers: { origin: BASE, ...(cuerpo ? { 'content-type': 'application/json' } : {}) },
  body: cuerpo ? JSON.stringify(cuerpo) : undefined
});
let rp = await sinSesion('GET', `/api/publico/invitados/${token}`);
comprobar('invitados: el invitado lee la revisión sin sesión', rp.status === 200 && (await rp.json()).revision?.contenido?.nodes?.length > 0, rp.status);
rp = await sinSesion('POST', `/api/publico/invitados/${token}/comentarios`, { nombre: 'Humo', texto: 'Comentario de humo' });
comprobar('invitados: el invitado comenta', rp.status === 201 || rp.status === 200, rp.status);
r = await pedir('POST', `/api/invitados/enlaces/${enlaceId}/revocar`);
rp = await sinSesion('GET', `/api/publico/invitados/${token}`);
comprobar('invitados: el enlace revocado da 404', rp.status === 404, rp.status);
rp = await sinSesion('GET', '/api/proyectos');
comprobar('sin sesión, el resto de la API sigue cerrado', rp.status === 401, rp.status);

// Colaboración (núcleo): latido, lista de presentes y salida
const pestana = 'humo' + randomBytes(6).toString('hex');
r = await pedir('PUT', `/api/procesos/${procesoHumo}/presencia`, { pestana, lugar: 'shell', estado: 'viendo' });
comprobar('colaboración: latido de presencia', r.status === 200 || r.status === 204, r.status);
r = await pedir('GET', `/api/procesos/${procesoHumo}/presencia`);
comprobar('colaboración: lista de presentes', r.status === 200 && Array.isArray(r.json.presencias), r.status);
r = await pedir('DELETE', `/api/procesos/${procesoHumo}/presencia?pestana=${pestana}`);
comprobar('colaboración: salir', r.status === 200 || r.status === 204, r.status);

// Sesiones: la lista incluye la actual y no expone el token
r = await pedir('GET', '/api/sesion/lista');
const sesiones = r.status === 200 ? (r.json.sesiones ?? r.json) : [];
comprobar('sesiones: la lista incluye la actual', Array.isArray(sesiones) && sesiones.some((s) => s.actual), r.status);
comprobar('sesiones: sin token ni hash', !/token|hash/i.test(JSON.stringify(r.json ?? {})));

// IA: el estado responde (con o sin clave)
r = await pedir('GET', '/api/ia/estado');
comprobar('IA: estado responde', r.status === 200, r.status);

// Limpieza
r = await pedir('DELETE', `/api/catalogos/plantillas/${plantillaId}`);
comprobar('borrar la plantilla de humo', r.status === 204, r.status);
r = await pedir('PATCH', `/api/proyectos/${proyecto.id}`, { archivado: true });
comprobar('archivar el proyecto de humo', r.status === 200, r.status);
r = await pedir('GET', '/api/sistema');
comprobar('«Sistema» responde y el worker late', r.status === 200 && r.json.worker?.vivo === true, JSON.stringify(r.json?.worker));
await pedir('DELETE', '/api/sesion');
console.log(fallos ? `${fallos} comprobaciones fallidas` : 'Humo OK');
process.exit(fallos ? 1 : 0);
