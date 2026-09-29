# Nueva iniciativa: un módulo dentro de la plataforma

Es el caso normal. La iniciativa vive dentro de la misma web y la misma API. Así usa el mismo inicio de sesión, los permisos, los proyectos, la auditoría, la observabilidad y el despliegue, sin montar nada propio.

Antes de escribir código, la reserva tiene que estar fusionada (paso 2 del [ciclo](README.md#ciclo-de-una-iniciativa)). Los nombres salen de la clave según las [convenciones](convenciones.md#nombres-que-salen-de-la-clave). En los ejemplos, la clave es `portafolio`.

## Estructura

```text
apps/api/src/modulos/portafolio/
  index.ts              lo único que importa el resto: rutasPortafolio() y, si otro módulo lo necesita, funciones públicas
  rutas.ts              endpoints (Hono)
  servicio.ts           consultas y lógica, cuando rutas.ts crece
  portafolio.test.ts    pruebas de integración contra Postgres real
  CLAUDE.md             (opcional) reglas y trampas del módulo; Claude lo lee al trabajar en esta carpeta
apps/web/src/modulos/portafolio/
  index.tsx             RutasPortafolio: las pantallas bajo /proyectos/portafolio/
  api.ts                cliente tipado de sus endpoints
  paginas/              pantallas
  estilos.css           clases con prefijo .portafolio-
packages/db/src/esquema.ts          su sección, al final
pruebas/e2e/portafolio.spec.mjs     sus flujos de punta a punta
docs/iniciativas/portafolio.md      su ficha
```

El núcleo no sigue esta estructura: es anterior y vive en `apps/api/src/rutas/`, `apps/web/src/shell/` y `apps/web/src/app/` (el editor). Tampoco existe `apps/worker/`: el worker de IA es `apps/api/src/worker.ts`.

## Puntos de registro

Son los únicos archivos de fuera de la iniciativa que se tocan. En ellos:
- se añaden **solo las líneas propias**, al final del bloque correspondiente;
- no se reordena ni se reformatea nada;
- si dos PR añaden a la vez en el mismo sitio, el conflicto se resuelve conservando ambas líneas.

| Archivo | Qué se añade |
|---|---|
| `apps/api/src/app.ts` | El import `import { rutasPortafolio } from './modulos/portafolio/index.js';` y, al final de las rutas (antes de `return app`), `app.route('/api/portafolio', rutasPortafolio());` |
| `apps/web/src/shell/main.tsx` | `<Route path="/portafolio/*?"><ConSesion><RutasPortafolio /></ConSesion></Route>`, **sin `nest`** y **antes** de la última `<Route>` (la de «no encontrada»). El router anidado se abre dentro del módulo (abajo) |
| `apps/web/src/shell/sesion.tsx` | La entrada del menú, `<EnlaceMenu href="/portafolio">{t('menu.portafolio')}</EnlaceMenu>`, después de las de otras iniciativas y antes de «Administración» |
| `apps/web/src/shell/textos/es.ts` y `en.ts` | La clave del menú: `'menu.portafolio': 'Portafolio'` y su traducción. Si falta en inglés, no compila |
| `packages/db/src/esquema.ts` | La sección `// ===== portafolio =====`, al final |
| `apps/api/src/semilla.ts` | Solo si las E2E necesitan datos: una llamada a `sembrarPortafolio()`, que vive en el módulo |
| `docker-compose.yml`, `.env.example`, `.env.staging.example` | Solo si hay variables de entorno: las `PORTAFOLIO_*` en el `environment:` de `api` (y de `worker` si las usa), con un valor por defecto |
| `docs/iniciativas/README.md` | La fila de la iniciativa y sus reservas |
| `CHANGELOG.md` | Su línea bajo `## Sin publicar` |

Cualquier otro archivo del núcleo se cambia en un PR de plataforma aparte.

## API

```ts
// apps/api/src/modulos/portafolio/rutas.ts
// Portafolio: resumen de los procesos de un cliente.
import { Hono } from 'hono';
import { z } from 'zod';
import type { Entorno } from '../../contexto.js';
import { ErrorHttp } from '../../contexto.js';
import { accesoProyecto } from '../../permisos.js';
import { registrar } from '../../auditoria.js';
import { cuerpo } from '../../validar.js';

export function rutasPortafolio() {
  const r = new Hono<Entorno>();

  r.get('/proyectos/:id/resumen', async (c) => {
    const { proyecto } = await accesoProyecto(c.get('db'), c.get('usuario'), c.req.param('id'), 'leer');
    // … consultas propias, siempre filtradas por proyecto.id
    return c.json({ resumen: { proyecto: proyecto.nombre } });
  });

  r.post('/proyectos/:id/metas', async (c) => {
    const { proyecto } = await accesoProyecto(c.get('db'), c.get('usuario'), c.req.param('id'), 'escribir');
    const d = await cuerpo(c, z.object({ nombre: z.string().trim().min(1).max(200) }));
    if (d.nombre === 'x') throw new ErrorHttp(409, 'Esa meta ya existe.', 'PORTAFOLIO_META_DUPLICADA');
    // … insertar en portafolio_metas
    await registrar(c, 'portafolio.meta.alta', 'portafolio_meta', null, { proyectoId: proyecto.id, nombre: d.nombre });
    return c.json({ ok: true }, 201);
  });

  return r;
}
```

Lo que da el núcleo, y que no se reimplementa:

| Necesidad | Usar |
|---|---|
| Usuario de la sesión | `c.get('usuario')`: id, organización, rol, correo. La sesión ya está comprobada; toda ruta es privada salvo las de `PUBLICAS` en `app.ts` (un cambio de plataforma). |
| Acceso a un proyecto | `accesoProyecto(db, usuario, proyectoId, 'leer' \| 'escribir' \| 'aprobar' \| 'administrar')`. Responde 404 si no tiene acceso y 403 si su rol no alcanza; respeta los proyectos archivados. |
| Solo administradores | `exigirAdmin(usuario)` |
| Validar el cuerpo | `cuerpo(c, esquemaZod)`: 400 con los detalles |
| Errores con mensaje | `throw new ErrorHttp(estado, 'Mensaje para la persona.', 'PORTAFOLIO_CODIGO')`. Los inesperados ya quedan en «Sistema» con su referencia. |
| Auditoría | `registrar(c, 'portafolio.entidad.accion', 'entidad', id, detalle)` en toda escritura relevante |
| Protección CSRF, límite de cuerpo, identificador de petición | Ya aplicados a todo `/api/*` |

- Todas las consultas filtran por la organización del usuario y, si aplica, por proyecto.
- Nada de roles propios: si hace falta una capacidad nueva, se habla con plataforma.
- **IA:** los prompts viven en `packages/ia` y la ejecución pasa por la cola de `ejecuciones_ia`. Un tipo nuevo de ejecución, un prompt nuevo o un cambio de modelo es un PR de plataforma. El cliente nunca envía prompts, y el presupuesto de IA es compartido.
- **Trabajos en segundo plano:** hoy el worker solo ejecuta la cola de IA. Si la iniciativa los necesita, se decide con plataforma (y con una ADR), sin montar otro contenedor ni otra cola por libre.

## Web (shell)

```tsx
// apps/web/src/modulos/portafolio/index.tsx
import { Link, Route, Router, Switch } from 'wouter';
import { Vacio, useTitulo } from '../../shell/ui';
import { Tablero } from './paginas/Tablero';
import { Cliente } from './paginas/Cliente';
import './estilos.css';

/**
 * Pantallas de Portafolio bajo /proyectos/portafolio/. main.tsx lo monta SIN nest
 * (<Route path="/portafolio/*?">) y el router anidado se abre aquí: así la cabecera
 * y el menú del shell quedan fuera y sus enlaces siguen siendo del shell.
 */
export function RutasPortafolio() {
  return (
    <Router base="/portafolio">
      <Switch>
        <Route path="/"><Tablero /></Route>
        <Route path="/cliente/:cliente">{(p) => <Cliente nombre={decodificar(p.cliente)} />}</Route>
        <Route><NoEncontrada /></Route>
      </Switch>
    </Router>
  );
}

/** wouter solo aplica decodeURI a la ruta: %2F, %26… se decodifican aquí. */
function decodificar(v: string): string {
  try { return decodeURIComponent(v); } catch { return v; }
}

/** La «no encontrada» del shell enlaza a «/», que aquí dentro es el módulo. */
function NoEncontrada() {
  useTitulo('No encontrada');
  return <Vacio>Esta página no existe. <Link href="/">Volver al portafolio</Link>.</Vacio>;
}
```

- **No montes el módulo con `nest` en `main.tsx`.** Con `nest`, `<ConSesion>` y la cabecera quedan dentro del router anidado y los enlaces del menú pasan a ser relativos al módulo: «Proyectos» llevaría a `/proyectos/portafolio/`. La E2E de cada módulo comprueba que los enlaces del menú siguen bien (lección 22i).

- **Cliente de la API:** `api.ts` propio, que usa `pedir()` de `apps/web/src/shell/api.ts` (maneja errores, sesión y red igual para todos). El `api` del núcleo no se amplía con endpoints de la iniciativa.
- **Datos:** TanStack Query, con claves que empiezan por la clave de la iniciativa (`['portafolio', …]`).
- **Componentes:** `ui.tsx` (Boton, Campo, Selector, Aviso, Dialogo, Cargando, Vacio…), `useUsuario()` y `useTitulo()`; `permisos.ts` para mostrar u ocultar botones (la API decide de verdad); `formato.ts` para fechas y roles; los colores y espacios de `src/tokens.css`.
- **Textos en dos idiomas:** la plataforma está en español e inglés ([web.md §5.10](../tecnica/web.md)). Cada módulo tiene su `textos.ts` con `definirTextos(es, en)` de `shell/i18n.ts`: el español es la fuente de verdad y el tipo `Traduccion<typeof es>` obliga a que el inglés tenga todas las claves, variables y etiquetas. En las pantallas, `useT()` y nada de texto escrito a mano en el JSX. Fechas y números con `t.fecha` y `t.numero`.
- **Estilos:** en su `estilos.css`, siempre con prefijo `.portafolio-`. No se toca `shell/estilos.css`. Ojo: `.tabla td` del shell pisa reglas sueltas como la alineación; usa un selector más específico (`.tabla td.portafolio-numero`).
- **Editor** (`apps/web/src/app/`): es código portado del MVP y está cubierto byte a byte por la fidelidad. Una iniciativa no lo toca. Si necesita un enganche en el editor, es un PR de plataforma con `pnpm fidelidad` en verde.

## Pruebas

| Qué | Dónde | Obligatorio |
|---|---|---|
| Integración de cada ruta, incluidos los casos de permiso denegado (otro proyecto, rol insuficiente, sin sesión) | `apps/api/src/modulos/<clave>/<clave>.test.ts`, con `prepararBase`, `vaciar`, `usuario` y `cliente` de `apps/api/src/pruebas/entorno.ts` | Siempre |
| Flujos de punta a punta | `pruebas/e2e/<clave>.spec.mjs`, con `reiniciarDatos()` y las cuentas de la semilla | Cada flujo nuevo |
| Captura de cada pantalla nueva o cambiada, revisada por una persona | `page.screenshot` en la E2E | Siempre: las pruebas en verde no ven el diseño |
| Fidelidad frente al MVP | `pnpm fidelidad` | Si se toca `apps/web/src/app/` o `packages/` |

## Antes de pedir revisión

- [ ] `main` traído hoy y la migración regenerada si `main` trajo otra.
- [ ] Solo cambian las carpetas de la iniciativa y sus líneas en los puntos de registro (`git diff --stat origin/main`).
- [ ] Todo nombre nuevo está reservado en el registro.
- [ ] En verde: `pnpm fronteras`, `pnpm typecheck`, `pnpm test`, `pnpm e2e` (y `pnpm fidelidad` si toca el editor o un paquete).
- [ ] Capturas de las pantallas revisadas.
- [ ] Ficha y `CHANGELOG.md` (`## Sin publicar`) al día.
- [ ] Sin datos de clientes ni secretos.
