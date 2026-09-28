# ProcessIQ — Arquitectura de producto

> **Estado:** propuesta para aprobación · 25-sep-2026.
> Describe la arquitectura para pasar ProcessIQ de MVP a producto: cuentas de usuario, proyectos compartidos, versiones, IA robusta, operación con entornos y copias de seguridad. No describe lo que existe hoy (ver §2).

---

## 1. Marco

### Objetivo

Convertir ProcessIQ en la plataforma de procesos de MBC. Cada consultor trabaja dentro de un **proyecto** de cliente; cada proceso tiene **revisiones** con autor, fuentes, ejecuciones de IA y aprobación. El ciclo sigue siendo *Levantar → Diagramar → Diagnosticar → Reingenierizar → Presentar*, pero ahora trazable, compartido y operado como un servicio.

### Restricciones

- **Lo que hoy funciona se mantiene tal cual** mientras se construye la plataforma: la web en GitHub Pages (`procesos.mbc-latam.com`), el Worker de Cloudflare (`api.mbc-latam.com`) y el DNS de `mbc-latam.com` en Cloudflare.
- **No se añaden servicios nuevos en Cloudflare.** Solo se crean en su DNS los registros que la plataforma necesite.
- **Sin Azure por ahora**, porque no hay suscripción para el proyecto. Todo se diseña **portable**, para poder moverlo a Azure cuando exista esa suscripción sin rediseñar.

### Principios

1. **Un solo lenguaje (TypeScript)** y un solo modelo de dominio, compartido por web, API, worker e IA.
2. **Monolito modular:** una API y un worker, con un módulo por dominio o iniciativa y fronteras comprobadas automáticamente. Varios equipos, un solo despliegue que operar; nada de microservicios.
3. **Portar, no reescribir, el motor de diagrama.** El auto-layout por carriles, los niveles de detalle y el export PPTX con conectores anclados son el valor diferencial y ya están medidos (`bench/`). Se trasladan a módulos con pruebas; no se sustituyen por otra librería.
4. **Local primero en el editor.** Se puede editar y exportar sin red (talleres en planta); la sincronización llega al recuperar la conexión.
5. **Los documentos del cliente se procesan en el navegador.** Al servidor llega el texto extraído; los originales solo se suben si el usuario lo pide.
6. **Medir antes y después.** Ningún cambio de layout, export o prompt se publica sin pasar el banco de calidad y la evaluación de IA.

---

## 2. Punto de partida (septiembre de 2026)

| Pieza | Hoy | Límite para producto |
|---|---|---|
| Web | `index.html` + `app.js` (~10.500 líneas en un IIFE) + `styles.css`, sin build, en GitHub Pages | Imposible de probar por partes; sin tests automáticos; sin cabeceras de seguridad. |
| Datos | `localStorage` del navegador | Un proceso por navegador; sin compartir, sin versiones ni copia de seguridad. |
| Usuarios | No hay; un código de equipo compartido | Sin trazabilidad por persona ni permisos. |
| IA | El navegador arma los prompts y llama a Claude en streaming vía el Worker (o con clave propia, BYOK) | Un corte de red pierde la generación (errores reportados en v3.8.9); el Worker acepta cualquier prompt de quien tenga el código. |
| Catálogos | KPIs, temas PPTX y reglas del Playbook escritos en el código | Cambiarlos exige un despliegue. |
| Calidad | `bench/harness.js` manual en la consola | No bloquea regresiones. |
| Operación | Despliegue manual con 4 pasos (`HANDOFF.md` §8) | Sin entornos, monitorización ni copias de seguridad. |

---

## 3. Vista general

```text
             Consultores · Managers · Socios · Administradores
                          │ HTTPS · inicio de sesión Entra ID (OIDC)
┌─────────────────────────▼─────────────────────────────────────────┐
│ Navegador                                                          │
│  SPA ProcessIQ: shell (React) + motor de diagrama (TS, SVG)        │
│  Web Workers: extracción de documentos · auto-layout               │
│  IndexedDB: copia local y cola de cambios sin conexión             │
└─────────────────────────┬─────────────────────────────────────────┘
                          │ REST (JSON) · SSE para progreso
┌─────────────────────────▼─────────────────────────────────────────┐
│ Servicio web (contenedor Node)       procesos.mbc-latam.com        │
│  sirve la SPA + API /api/*                                         │
│  auth · proyectos · procesos · revisiones · fuentes · catálogos    │
│  exportaciones · IA (encola) · auditoría                           │
└───────┬───────────────────────┬───────────────────────┬───────────┘
        │ SQL                    │ API S3                 │ cola (pg-boss)
┌───────▼─────────┐   ┌──────────▼─────────┐   ┌──────────▼──────────┐
│ PostgreSQL      │   │ Almacén de archivos│   │ Worker (contenedor  │
│ datos + cola +  │   │ exports, fuentes   │   │ Node): IA, exports  │
│ LISTEN/NOTIFY   │   │ opcionales         │   │ en lote, OCR, purgas│
└─────────────────┘   └────────────────────┘   └──────────┬──────────┘
                                                          │
                                  ┌───────────────────────┼───────────┐
                                  ▼                       ▼           ▼
                           API de Anthropic            Pulse        Sentry
                           (Claude)                    (gasto IA)   (errores)

Sin cambios: DNS de mbc-latam.com y Worker api.mbc-latam.com en Cloudflare
(sigue sirviendo a Radar de Prospectos) · Umami (analítica).
```

| Componente | Responsabilidad | Tecnología | Dónde corre |
|---|---|---|---|
| SPA | Interfaz, editor, exports inmediatos, trabajo sin red | Vite + React (shell) + motor propio en TypeScript | Servida por el servicio web |
| Servicio web | API REST, sesión, permisos, SSE de progreso | Node LTS + Hono | Contenedor en PaaS |
| Worker | Jobs: generación con IA, análisis, exports en lote, OCR, limpieza | Node LTS + pg-boss | Contenedor en PaaS |
| PostgreSQL | Datos, cola de jobs, notificaciones | Postgres gestionado | Supabase |
| Almacén de archivos | Entregables exportados, fuentes guardadas a pedido | S3-compatible | Supabase Storage |
| IA | Modelos Claude | SDK oficial de Anthropic | API de Anthropic |

---

## 4. Plataforma e infraestructura

### Cómputo: contenedores Docker en un PaaS

Recomendado: **Render**. Servicio web, worker en segundo plano, tareas programadas, entornos de vista previa por PR e infraestructura como código (`render.yaml`) en un solo proveedor.

- **Por qué contenedores y no funciones serverless.** Una generación con IA dura minutos y el worker debe correr sin límite de duración. Además, una imagen Docker se mueve tal cual a **Azure Container Apps** cuando haya suscripción.
- **Alternativas equivalentes:** Railway o Fly.io. La arquitectura no cambia.
- **Verificar en la cotización:** plan de pago con despliegues sin corte, entornos de vista previa y región (EE. UU. Este es aceptable: la API de Anthropic también está en EE. UU.).

### Datos: Supabase (Postgres + Storage), región São Paulo

- Postgres estándar con **recuperación a un punto en el tiempo (PITR)**, y almacenamiento con **API S3**. Ambos son portables: a Azure Database for PostgreSQL y a Blob Storage detrás de la misma interfaz de almacenamiento.
- La región São Paulo mantiene los datos de clientes peruanos en Sudamérica. Confirmar con Legal el encaje con la Ley 29733 de protección de datos personales.
- **Solo se usa como base de datos y almacenamiento.** La autenticación y la lógica viven en nuestra API, para no atarse al proveedor.

### Red y dominios

- `procesos.mbc-latam.com` pasa de GitHub Pages al servicio web **en el corte a producción** (§13, fase 3); hasta entonces sigue como hoy.
- **La SPA y la API comparten origen:** sin CORS y con CSP propia.
- Los registros nuevos se crean en la zona DNS existente de Cloudflare como **solo DNS**.
- Se reutiliza el mismo nombre de host para no abrir otro "dominio nuevo" ante el proxy corporativo (Netskope). El pedido pendiente a TI para `*.mbc-latam.com` sigue valiendo.

### Lo que sigue igual

| Pieza | Situación |
|---|---|
| Worker `api.mbc-latam.com` (Cloudflare) | Sin cambios. Tras el corte, ProcessIQ deja de usarlo y sigue sirviendo a Radar de Prospectos. |
| DNS de `mbc-latam.com` (Cloudflare) | Sin cambios; solo se editan registros. |
| Pulse | Recibe el gasto de IA desde el worker, igual que hoy desde el Worker de Cloudflare. |
| Umami | Sin cambios. |

### Etapa actual: servidor propio (mientras no haya PaaS)

Hasta que se contraten el PaaS y la base de datos gestionada, la plataforma corre en un **PC propio con IP pública fija**, con los mismos contenedores Docker que irán al PaaS. Mudarla después es cambiar dónde corren esas imágenes, no rediseñar.

| Pieza | Etapa actual | Destino (arriba) |
|---|---|---|
| Cómputo | Docker Desktop en el PC servidor (`docker compose`) | Render (o Railway / Fly.io; Azure Container Apps cuando haya suscripción) |
| HTTPS y dominio | Caddy: certificado de Let's Encrypt por TLS-ALPN (el puerto 80 del PC lo ocupa IIS) | Lo gestiona el PaaS |
| Dominio | `mbc.asissoft.com`, configurable en `.env` (`DOMINIO`) | `procesos.mbc-latam.com` en el corte (fase 3) |
| Web | Caddy sirve el build estático | La sirve el servicio web |
| IA | Intermediario Node propio con el contrato del Worker (`/ia/v1/messages`); la clave vive en `.env` | Endpoints de negocio en la API (fase 2) |
| Datos | **Postgres 17 en Docker** en el mismo PC (volumen). Sin sesión, el editor sigue guardando en el navegador, como en el MVP | Supabase o Postgres gestionado |
| Identidad | **Cuentas locales** (correo y contraseña, scrypt) creadas por un administrador | Entra ID cuando TI registre la aplicación |
| Copias de seguridad | `pg_dump` diario a una carpeta del PC (14 copias), que hay que copiar fuera del equipo | PITR del proveedor |
| Entornos | Local de cada desarrollador; **staging y producción en este servidor** (ADR 16) | Vista previa por PR, staging y producción |

Límites que asume esta etapa:

- **Disponibilidad de un PC:** si se apaga, se suspende o se cierra Docker Desktop, el servicio cae. No es apta para datos de clientes sin copias de seguridad fuera del equipo.
- **Red corporativa:** Netskope bloquea los dominios "recién observados"; TI debe habilitar `mbc.asissoft.com`.
- **Intermediario genérico:** con el código de equipo se puede enviar cualquier prompt con la clave de la empresa. Tope de gasto en la consola de Anthropic y rotación del código hasta que existan los endpoints de negocio.

Operación diaria, puesta en marcha y cambio de dominio: `docs/runbooks/servidor-local.md`.

---

## 5. Stack y organización del código

### Stack

| Capa | Elección | Motivo |
|---|---|---|
| Lenguaje | TypeScript `strict` | Un solo modelo de dominio de punta a punta |
| Monorepo | pnpm workspaces + Turborepo | Paquetes compartidos entre web, API y worker; builds incrementales |
| Esquemas y validación | Zod | Valida en web, API e IA; genera el JSON Schema de la salida estructurada de Claude |
| Web | Vite + React + TanStack Query | Shell de la aplicación (proyectos, catálogos, administración) |
| Editor | Motor propio en TypeScript sobre SVG (portado de `app.js`) | Es el diferencial; React solo lo monta |
| API | Hono sobre Node | Ligera y portable a cualquier runtime |
| Base de datos | Drizzle ORM + migraciones versionadas | SQL explícito, tipos generados |
| Jobs | Cola sobre Postgres (tabla de ejecuciones con `SKIP LOCKED`) | Reintentos, cancelación y latido, sin Redis ni dependencias nuevas |
| Progreso en vivo | SSE + `LISTEN/NOTIFY` de Postgres | Sin broker adicional |
| Autenticación | OIDC con Entra ID (`openid-client`), cookie de sesión `httpOnly` | Cuentas corporativas; sesiones en Postgres |
| IA | `@anthropic-ai/sdk` | Streaming, salida estructurada, caché de prompts |
| Documentos | pdf.js, mammoth, JSZip en Web Worker | Igual que hoy, fuera del hilo principal |
| Exports | pptxgenjs + post-proceso JSZip, BPMN y Word | El mismo código corre en navegador y en el worker |
| Pruebas | Vitest, Playwright | Unidad, integración, E2E y banco de calidad |
| Observabilidad | pino (logs JSON), Sentry, health checks | Errores y trazas en web, API y worker |
| Calidad de código | ESLint, Prettier, commits convencionales | Orden y revisiones consistentes |

### Repositorios: qué va junto y qué va aparte

Con varios equipos sumando aplicaciones, la pregunta no es "monorepo sí o no", sino **qué debe cambiar junto**. Criterio:

| Va en el monorepo `processiq` si… | Va en un repositorio propio si… |
|---|---|
| Usa el modelo de procesos (`packages/dominio`) o el motor de diagrama | Solo consume datos de ProcessIQ, y lo hace por su API |
| Un cambio suyo puede obligar a tocar a la vez la API, el worker o el esquema | Tiene su propia base de datos y su propio ciclo de versiones |
| La usan los mismos usuarios, dentro del mismo flujo de trabajo | Es otro producto (Radar de Prospectos, Pulse, futuros "IQ") |
| Quien trabaja en ella puede ver el resto del código | Quien trabaja en ella no debe ver el resto (p. ej. un proveedor externo) |

**Por qué el núcleo va en un monorepo.** Si el modelo de dominio viviera en un paquete versionado que consumen varios repositorios, cada cambio de esquema exigiría publicar una versión y actualizar cada repo por separado. Con varios equipos cambiando el mismo modelo en paralelo, las versiones se desalinean y los errores aparecen en producción en lugar de en el PR. En el monorepo, un cambio de esquema y sus efectos en web, API, worker e IA van en el mismo PR, y la CI los prueba juntos.

**Límite a tener en cuenta:** GitHub no permite restringir la *lectura* por carpeta. `CODEOWNERS` controla quién aprueba, no quién ve. Si un equipo no debe ver prompts, fixtures u otro código, su iniciativa va en un repositorio propio.

### Cómo trabajan varios equipos en el monorepo

- **Dueños por carpeta (`CODEOWNERS`).**
  - Un **equipo de plataforma** es dueño de `packages/dominio`, `packages/db`, `packages/ia`, `infra/` y la CI.
  - Cada equipo de iniciativa es dueño de sus módulos.
  - Un cambio en `dominio` o `db` requiere la aprobación de plataforma.
- **Una iniciativa es un módulo, no una app nueva, por defecto:**
  - web: `apps/web/src/modulos/<iniciativa>/` (rutas y pantallas propias dentro del mismo shell, con el mismo inicio de sesión y la misma navegación);
  - API: `apps/api/src/modulos/<iniciativa>/` (rutas, servicios y tablas propias);
  - worker: `apps/worker/src/modulos/<iniciativa>/` (jobs).

  Solo se crea una app aparte en `apps/<nombre>/` si tiene usuarios distintos o debe desplegarse por separado (p. ej. un portal donde el cliente revisa sus procesos).
- **Fronteras comprobadas en la CI** (eslint-plugin-boundaries o dependency-cruiser):
  - un módulo solo usa de otro lo que este exporta en su `index.ts`;
  - cada módulo es dueño de sus tablas: ningún módulo lee ni escribe las tablas de otro, sino que le pide los datos por su interfaz;
  - `packages/*` nunca importan de `apps/*`.
- **CI solo sobre lo afectado.** Turborepo, con caché remota, construye y prueba solo lo que cambia el PR y lo que depende de ello, así que el tiempo de CI no crece con el número de equipos.
- **Despliegue independiente.** Cada app tiene su propia imagen y su propio despliegue; un equipo publica sin esperar a los demás. Mismo repositorio no significa mismo despliegue.
- **Una sola versión de cada base:** TypeScript, React y las librerías comunes, con un único lockfile. Las actualizaciones mayores las coordina plataforma.
- **Cambios de esquema** con un ADR breve y compatibles hacia atrás durante al menos una versión, para no romper a un equipo a mitad de su trabajo.

### Integración con productos en otros repositorios

- **API pública versionada** (`/api/v1/…`) con especificación OpenAPI generada desde los esquemas Zod. Los cambios incompatibles solo se publican en una versión nueva (`/api/v2`).
- **Credenciales por aplicación** para las llamadas entre servicios (client credentials de Entra ID), nunca cuentas de usuario compartidas.
- **Webhooks** para eventos (revisión aprobada, generación terminada) cuando otra aplicación los necesite.
- **Código compartido entre productos** (componentes visuales MBC, cliente de Pulse, cliente de autenticación): paquetes versionados publicados en GitHub Packages desde un repositorio `mbc-plataforma`, nunca copiados a mano. Ese repositorio se crea cuando un segundo producto necesite de verdad alguna de esas piezas.

### Estructura del monorepo

```text
processiq/
├── apps/
│   ├── web/          SPA: shell React; src/modulos/<iniciativa>/
│   ├── api/          servicio web: auth, permisos, SSE; src/modulos/<iniciativa>/
│   ├── worker/       jobs: IA, exports en lote, OCR, purgas; src/modulos/<iniciativa>/
│   └── <app>/        solo si tiene usuarios o despliegue propios (p. ej. portal de cliente)
├── packages/
│   ├── dominio/      tipos, esquemas Zod, migraciones de esquema, validación, Lint MBB, niveles
│   ├── motor/        auto-layout, ruteo, render SVG, interacción del lienzo
│   ├── bpmn/         importar/exportar BPMN 2.0
│   ├── exportar/     PPTX (temas), Word, Ficha, SVG/PNG
│   ├── documentos/   extracción de Word/PDF/PPTX/texto, participantes
│   ├── mining/       event logs → proceso (alpha-miner), variantes
│   ├── analitica/    simulador, what-if, cuello de botella, automatización, mapa de valor
│   ├── ia/           prompts versionados, esquemas de salida, cliente Claude, reparación
│   └── db/           esquema Drizzle, migraciones, semillas (los 13 demos)
├── bench/            banco de calidad (fixtures reales fuera del repo)
├── infra/            render.yaml, Dockerfiles, docker-compose de desarrollo
├── docs/             arquitectura, ADR, runbooks
└── CODEOWNERS        dueños por carpeta
```

**Regla de dependencias:**

- `dominio` no depende de nada.
- `motor`, `bpmn`, `exportar`, `mining`, `analitica` e `ia` dependen solo de `dominio`.
- Las apps dependen de los paquetes, nunca al revés.
- Ningún paquete toca el DOM, salvo `motor` (render) y `web`.

**Repositorio:** privado y nuevo, `processiq`. El repo actual sigue publicando el MVP hasta el corte y queda como referencia histórica. Los prompts, la lógica de servidor y los fixtures de evaluación no deben estar en un repositorio público.

---

## 6. Modelo de dominio

El objeto `state` de `app.js` se formaliza en `packages/dominio`:

- **Proceso:** meta (nombre, industria, macroproceso, cliente, dueño) y Ficha (12 bloques, incluida la gobernanza Dueño / Editor / Revisor / Aprobador).
- **Diagrama:** nodos (tarea, evento, gateway, documento, dato, sistema; con tipo de ejecución, marcadores, eventos de borde y nivel/padre), aristas y carriles.
- **Diagnóstico:** vistas As-Is / To-Be, pains, KPIs y datos del simulador.
- **Relevamiento:** fuentes y `sourceRefs` (de qué fuente y fragmento sale cada nodo generado).

Decisiones:

- **Esquema JSON versionado** (`schemaVersion`) con **migraciones** encadenadas. La versión 0 es el formato actual de `processiq.v1` y del export JSON, así que todo lo que los consultores tengan hoy se puede importar.
- **Una revisión = un documento JSON completo** validado por Zod. Es el contrato único entre navegador, servidor, IA y exports.
- **Las reglas del Playbook MBB** (hoy la pestaña Lint) son validaciones del dominio y se ejecutan igual en el navegador y en el servidor.

---

## 7. Datos y persistencia

### Tablas principales (PostgreSQL)

| Grupo | Tablas |
|---|---|
| Identidad | `usuarios`, `sesiones`, `organizaciones`, `miembros_organizacion` (admin, consultor, lector) |
| Trabajo | `clientes`, `proyectos`, `miembros_proyecto` (propietario, editor, revisor, lector) |
| Procesos | `procesos`, `revisiones` (JSONB, `schema_version`, revisión padre, autor, mensaje, estado) |
| Relevamiento | `fuentes` (metadatos, texto extraído, original opcional en almacén), `fragmentos` (para `sourceRefs`) |
| IA | `ejecuciones_ia` (tipo, modelo, versión de prompt, tokens, coste, duración, estado, error) |
| Entregables | `exportaciones` (tipo, tema, revisión de origen, archivo en almacén) |
| Catálogos | `kpis`, `temas_pptx`, `verbos_playbook`, `plantillas` (editables por administradores) |
| Control | `auditoria`, `jobs` (pg-boss) |

- Se crean `organizaciones` desde el principio (una por país o práctica de MBC LATAM) para no rehacer permisos después; al inicio habrá una sola.
- **El grafo va en JSONB** dentro de la revisión. Nodos y aristas no se normalizan en tablas propias hasta que una consulta entre procesos lo pida (p. ej. "procesos que usan SAP"); mientras tanto bastan índices sobre el JSONB.
- **Estados de una revisión:** `borrador → en revisión → aprobada`, alineados con la gobernanza de la Ficha. Una revisión aprobada no se edita: se crea una nueva.
- **Retención:**
  - El texto de las fuentes se borra al cerrar el proyecto, salvo que se marque para conservar.
  - Los originales solo existen si el usuario los subió.
  - Borrar un proyecto borra sus fuentes, exportaciones y archivos.

### En el navegador

- **IndexedDB** guarda la copia de trabajo y una **cola de cambios** mientras no hay conexión. Al volver la red se sube como revisión en borrador.
- **Conflictos:** si alguien guardó antes (revisión padre distinta), se conservan ambas y se avisa. No hay edición simultánea en tiempo real en esta etapa.

### Copias de seguridad

- **PITR** de Postgres activo y copia diaria del almacén de archivos.
- **Objetivo propuesto:** pérdida máxima (RPO) de 1 hora y recuperación (RTO) en 4 horas.
- **Prueba de restauración** trimestral, documentada en un runbook.

---

## 8. IA en producción

### Generaciones como jobs durables

La generación ya no depende de que el navegador mantenga abierta la conexión:

1. El navegador extrae el texto de los documentos (Web Worker) y lo envía como fuentes del proceso.
2. `POST /api/ia/generaciones` con el proceso, las fuentes, el nivel y el modelo. Crea una `ejecucion_ia`, la encola y devuelve su id.
3. El worker ejecuta el job:
   - arma el prompt de la versión vigente y llama a Claude en streaming con **salida estructurada** y **caché de prompts**;
   - publica el progreso por `NOTIFY`;
   - valida el resultado contra el esquema Zod, intenta **una reparación** si falla y guarda el resultado como **revisión en borrador** con `sourceRefs`;
   - registra tokens y coste y los reporta a Pulse.
4. El navegador sigue el progreso por `GET /api/ia/generaciones/{id}/eventos` (SSE que se reconecta con `Last-Event-ID`). Si se cierra la pestaña, el resultado queda en el proyecto.

**Reintentos:** automáticos con espera creciente ante cortes de red, 429 o sobrecarga. La cancelación marca el job y el worker aborta la llamada. Esto resuelve de raíz los cortes y tiempos de espera reportados en v3.8.9.

**Cómo quedó implementado (fase 2.3):**
- **La cola es la tabla `ejecuciones_ia`.**
  - El worker toma las filas `en_cola` con `FOR UPDATE SKIP LOCKED`, da un latido mientras ejecuta y reencola las que se quedan sin latido.
  - Los avisos van por `LISTEN/NOTIFY`: `ia_cola` despierta al worker e `ia_ejecucion` alimenta el SSE.
  - Se cumple el ADR 4 (Postgres como cola, sin Redis) sin añadir pg-boss: la ejecución ya es el trabajo y hay una pieza menos.
- **Resultado de una generación.**
  - El worker guarda la especificación del proceso ya validada, y el editor la dibuja con el mismo código que el MVP (`buildProcessFromAiSpec` + auto-layout) y la guarda sola como revisión enlazada a la ejecución.
  - Si la pestaña se cerró, el editor ofrece dibujarla al volver a abrir el proceso.
  - Llevar el dibujo al servidor queda para cuando el auto-layout viva entero en `packages/motor`.
- **Reintentos:** hasta 3 intentos, con esperas de 15 s y 60 s. Una sola reparación del JSON.
- **Privacidad de las fuentes:** el texto de las fuentes se borra de la base al terminar; quedan el nombre y el tamaño de cada una.
- **Topes y modelos:** presupuesto mensual por organización y límite por persona (US$, `.env`); modelos permitidos y modelo de análisis configurables.
- **Modo básico:** el editor sin proyecto (`/`) sigue llamando a la IA como el MVP (intermediario o clave propia), así que ese modo no cambia.

### Endpoints de negocio

| Endpoint | Sustituye a |
|---|---|
| `POST /api/ia/generaciones` | `aiBuildProcess()` |
| `POST /api/ia/analisis/pains` | `aiAnalyzePains()` |
| `POST /api/ia/analisis/{tipo}` (kpis, to-be, raci, impacto-esfuerzo, automatizacion, backlog, resumen-ejecutivo, sipoc, cuello-botella) | `runAiTask()` |

El cliente nunca envía prompts. El servidor decide modelo (entre los permitidos), prompt, esquema, `max_tokens` y esfuerzo.

### Gobierno de la IA

- **Registro de prompts:** cada prompt vive en `packages/ia` con versión. Cambiarlo exige pasar la evaluación (§10).
- **Modelo por tarea:** Opus para generar el proceso; Sonnet por defecto para análisis más acotados. El usuario puede elegir modelo al generar (como hoy), dentro de una lista permitida.
- **Costes:**
  - estimación previa (como hoy) y coste real por ejecución;
  - **presupuesto mensual** por organización y límite por usuario;
  - tope de gasto en la consola de Anthropic como red final.
- **Modo básico** (heurístico, sin IA ni red): se mantiene.
- **Clave propia (BYOK):** desaparece en la plataforma. La clave solo existe en el servidor.
- **Política de datos:** acordar con Legal/Seguridad qué puede enviarse a Anthropic y en qué términos. La interfaz muestra qué fuentes se envían en cada ejecución.

---

## 9. Seguridad

- **Identidad:** inicio de sesión con **Entra ID** del tenant corporativo. Requiere registrar la aplicación en ese tenant, **no una suscripción de Azure**, y la aprobación de TI.
- **Invitados externos** (p. ej. el cliente que revisa su proceso): enlace de solo lectura con caducidad. Llega en la fase 4.
- **Permisos:** rol en la organización más rol en el proyecto, comprobados en cada endpoint. Las consultas siempre filtran por proyecto.
- **Sesiones:** cookie `httpOnly`, `Secure`, `SameSite=Lax`, rotación al iniciar sesión y cierre de sesión en el servidor.
- **Cabeceras:** CSP estricta (sin scripts de terceros salvo Umami), HSTS, `frame-ancestors 'none'`. Las librerías se empaquetan desde npm: se acaba la dependencia de jsDelivr.
- **Límite de uso** por usuario y por endpoint, con contadores en Postgres.
- **Archivos:** tipos y tamaños permitidos. Los originales que se suben pasan un antivirus (ClamAV en el worker) antes de guardarse.
- **Secretos:** en las variables de entorno del PaaS, separados por entorno y rotados cada 90 días y cuando alguien deja el equipo.
- **Cadena de suministro:** Dependabot, escaneo de secretos en GitHub y `pnpm audit` en la CI.
- **Pulse:** hoy recibe el gasto sin credencial. El worker se autenticará con un secreto compartido.
- **Auditoría:** quién creó, editó, aprobó, exportó o borró qué y cuándo, en `auditoria`.

---

## 10. Calidad y pruebas

| Nivel | Qué cubre | Cuándo |
|---|---|---|
| Unidad (Vitest) | Dominio, migraciones de esquema, Lint MBB, analítica, mining | Cada PR |
| Round-trip BPMN | importar → modelo → exportar → importar sin pérdida, sobre los 13 demos | Cada PR |
| Banco de calidad | `bench/` automatizado con Playwright sobre los demos. **Falla el PR** si suben `txtSobreTxt`, `txtSobreFig` o `fueraDeLamina`, o si hay nodos sin coordenadas | Cada PR |
| Banco con procesos reales | Los BPMN de cliente, fuera del repo | Antes de cada versión, en local |
| Regresión PPTX | Abrir el `.pptx` generado y medir su XML: conectores anclados, elementos fuera de lámina, paleta del tema | Cada PR |
| Integración API | Rutas, permisos y jobs contra un Postgres real (contenedor) | Cada PR |
| E2E (Playwright) | Iniciar sesión, crear proyecto, ingestar (IA simulada), editar, aprobar, exportar | Cada PR |
| Evaluación de IA | Conjunto privado de 10–20 procesos reales (que se amplía): validez BPMN, roles, gateways, paralelismo, alucinaciones, cobertura de `sourceRefs` y coste | Al cambiar un prompt o un modelo |

---

## 11. Entornos, CI/CD y operación

| Entorno | Para qué | Datos | Clave de IA |
|---|---|---|---|
| Local | Desarrollo | `docker compose` (Postgres + MinIO) con semillas | Desarrollo, tope bajo |
| Vista previa por PR | Revisar cada cambio | Base efímera con los 13 demos | Desarrollo |
| Staging | Validación final y pruebas con usuarios | Demos y datos anonimizados | Staging |
| Producción | Uso real | Reales | Producción |

**Flujo de entrega:**

1. **PR:** la CI de GitHub Actions ejecuta lint, tipos, unidad, integración, banco, E2E y auditoría de dependencias.
2. **Fusión en `main`:** se construye **una imagen Docker por cada app afectada**, que se publica en GitHub Container Registry y se despliega a staging.
3. **Paso a producción:** se **promueve la misma imagen** tras aprobación manual. Las migraciones de base de datos corren antes de arrancar la nueva versión y deben ser compatibles hacia atrás.

**Ramas:** `main` protegida, ramas cortas `feature/*`, `fix/*` y `refactor/*`, versiones con SemVer y `CHANGELOG`.

**Operación:**

- **Monitorización:** health checks, Sentry con alertas y un panel de uso y coste de IA.
- **Runbooks** en `docs/runbooks/`: despliegue, reversión, restauración, rotación de secretos, incidente de IA.
- **Documentación:** las decisiones de arquitectura se registran como **ADR** en `docs/adr/`, y `HANDOFF.md` se reparte entre ADR y runbooks.

---

## 12. Rendimiento y eficiencia

- **Carga:** división de código por ruta, y las librerías pesadas (pptxgenjs, pdf.js, mammoth) solo cuando se usan.
- **Hilo principal libre:** extracción de documentos y auto-layout en Web Workers. Hoy el layout de 119 nodos bloquea ~0,7 s y el autoajuste prueba tres disposiciones.
- **IA más barata y rápida:**
  - caché de prompts para el prompt de sistema;
  - el modelo adecuado para cada tarea;
  - el nivel de detalle calculado localmente (cambiar de vista nunca vuelve a llamar a la IA, como hoy).
- **Exports en lote** (varios procesos o temas) en el worker, no en el navegador.
- **Objetivos propuestos:**
  - interacción del editor < 100 ms;
  - auto-layout de 150 nodos < 1 s fuera del hilo principal;
  - primera carga < 3 s;
  - disponibilidad del 99,5 % en horario laboral.

---

## 13. Hoja de ruta

El MVP actual sigue en producción, sin cambios, hasta el corte.

### Fase 1 — Fundaciones

- Monorepo, CI y entornos local y de vista previa.
- `CODEOWNERS`, reglas de fronteras entre módulos en la CI y plantilla de módulo de iniciativa, antes de que entre el segundo equipo.
- `dominio` con esquema v1 y migración desde el formato actual.
- `motor`, `bpmn`, `exportar`, `documentos`, `mining` y `analitica` portados desde `app.js`, sección por sección (sus banners STATE, RENDER, AUTO LAYOUT, EXPORT…), con pruebas.

*Salida:* los 13 demos se ven idénticos al MVP y el banco da igual o mejor que `bench/baseline.json`.

**Estado (25-sep-2026): completada en el servidor propio.**

- Hecho:
  - los 8 paquetes (los seis previstos más `ia` y el esquema v1 en `dominio`), con 105 pruebas unitarias;
  - la comprobación de fronteras;
  - 32 escenarios de fidelidad frente al MVP (los 14 ejemplos idénticos).
- Diferencias con el MVP: `docs/fase1-divergencias.md` (un fallo del MVP corregido y las librerías servidas desde la app).
- Trabajo en equipo (28-sep-2026): guías en `docs/equipo/` (convenciones, puntos de registro, módulo o app, Claude Code) y registro de iniciativas y reservas en `docs/iniciativas/`. La estructura de módulo (`apps/*/src/modulos/<clave>/`) la estrena la primera iniciativa.
- Pendiente:
  - entornos de vista previa;
  - equipos reales en `CODEOWNERS`;
  - banco con los BPMN reales de cliente (no están en el servidor);
  - tipar los cuatro archivos portados con `@ts-nocheck`.

### Fase 2 — Plataforma

- API, Postgres, inicio de sesión con Entra ID, proyectos, revisiones con estados, fuentes y almacén.
- IA como jobs con endpoints de negocio.
- Catálogos administrables, auditoría, observabilidad y staging.

*Salida:* un proyecto piloto completo en staging con usuarios reales.

**Estado (26-sep-2026): completada**, en producción y staging en el servidor propio. Salvo:
- **Entra ID:** sustituido temporalmente por cuentas locales (ADR 12), a la espera del registro de TI.
- **Fuentes y almacén:** bloqueado por la política de datos con Legal.

Por incrementos:

- **2.1, hecho.**
  - Paquete `db` (Drizzle, migraciones SQL) y `apps/api` (Hono).
  - Cuentas locales con contraseña temporal y cambio obligatorio.
  - Proyectos con miembros y roles; procesos; revisiones numeradas con detección de conflicto y el ciclo borrador → en revisión → aprobada.
  - Auditoría y copias de seguridad diarias.
  - 22 pruebas de integración contra Postgres real, también en la CI.
  - Entra ID queda sustituido por cuentas locales hasta que TI registre la aplicación: la sesión no cambia, solo cómo se obtiene.
- **2.2, hecho.**
  - Shell en React (`/proyectos/`): acceso y cambio de contraseña, proyectos, miembros, procesos, revisiones con su flujo de aprobación, usuarios y auditoría.
  - El editor se abre sobre un proceso (`/?proceso=`, `/?revision=`) y guarda revisiones:
    - con un borrador local por proceso, que se ofrece recuperar al volver;
    - avisando si se guarda sobre una versión que ya no era la última.
  - Sin proyecto, el editor sigue igual que el MVP; lo comprueban las pruebas de fidelidad.
  - Un proyecto archivado pasa a solo lectura (tampoco se aprueba ni se cambian miembros) hasta que se reactiva.
  - 9 pruebas E2E con la web construida, la API real y Postgres, también en la CI.
- **2.3, hecho.**
  - IA en el servidor: endpoints de negocio (`/api/ia/generaciones` y `/api/ia/analisis`), una cola en Postgres y el servicio `worker` (misma imagen que la API).
  - El progreso llega por SSE; hay reintentos, reparación del JSON y cancelación.
  - Coste por ejecución, con presupuesto mensual y límite por persona, y una pantalla de consumo para administradores.
  - En modo proyecto, el editor usa la IA del servidor para generar, para los pains y para las tareas del copiloto.
  - Pruebas:
    - 10 de integración con un `fetch` que imita el streaming de Anthropic;
    - 4 E2E con un Anthropic falso y el worker real.
- **2.4a, hecho: catálogos administrables.**
  - KPIs, verbos del Playbook y temas PPTX de cliente, por organización. Se siembran con los del MVP al crear la organización.
  - Pantalla «Catálogos» para administradores. Los temas se crean duplicando MBC o BBVA y se editan colores, tipografías, logotipos y carátula.
  - En un proceso de proyecto, el editor reemplaza en sitio los catálogos por defecto de `dominio` y `exportar`, así que editor, linter y PPTX los usan sin cambios. El editor libre sigue con los de fábrica.
  - Las plantillas de proceso quedan para más adelante.
- **2.4b, hecho: observabilidad sin servicios en la nube.**
  - Los errores inesperados de la API, la web, el editor (solo en modo proyecto) y el worker se guardan en la tabla `errores`.
    - Se agrupan por huella y se purgan a los 30 días.
    - Los de la API devuelven una referencia (`X-Request-Id`) que el usuario puede citar.
  - El worker deja su latido en la tabla `latidos`.
  - Pantalla «Sistema» para administradores, con avisos automáticos (punto rojo en el menú):
    - estado de la API y de la base de datos;
    - worker y cola de IA;
    - copias de seguridad y disco;
    - errores agrupados.
  - Rotación de los logs de Docker.
  - Sentry queda descartado por ahora: es un servicio en la nube y no hay presupuesto. Las alertas por correo necesitan un servidor de correo.
- **2.4c, hecho: staging en el mismo servidor** (`https://staging.mbc.asissoft.com`, ADR 16).
  - Proyecto de Compose aparte, con base propia, detrás del Caddy de producción.
  - Imágenes etiquetadas con el commit. `infra/desplegar.sh` despliega en staging, promueve la misma imagen a producción y revierte.
  - También en este incremento: auditoría de dependencias en la CI (ADR 17), runbooks y registro de ADR (`docs/adr/`).
- **Fuentes y almacén: bloqueado** por la decisión pendiente con Legal sobre qué documentos del cliente se guardan y durante cuánto tiempo (§15). Mientras tanto se aplica el ADR 9: los originales no salen del navegador.

### Fase 3 — Corte a producción

- Importación asistida de lo que los consultores tengan en su navegador (JSON / `localStorage`).
- `procesos.mbc-latam.com` apunta a la plataforma y se retira GitHub Pages.
- ProcessIQ deja de usar el Worker, que sigue para Radar de Prospectos.
- Runbooks y prueba de restauración hechos.

*Salida:* producción estable dos semanas sin incidentes graves.

**Estado (26-sep-2026):**
- **Importación asistida, hecha** (`/proyectos/importar`).
  - El shell lee el trabajo del editor libre del mismo navegador (`localStorage`, mismo origen) y lo crea como proceso de un proyecto.
  - También importa en lote los JSON exportados desde el editor en otros equipos.
  - La lista de proyectos avisa cuando el navegador tiene trabajo sin llevar.
  - Nada se borra del navegador salvo que el usuario lo pida.
- **Runbooks y prueba de restauración, hechos** (`docs/runbooks/`).
- **Pendientes que no dependen del código:**
  - Apuntar `procesos.mbc-latam.com`: lo decide y lo hace el dueño de ese dominio. Mientras tanto, la plataforma está en `mbc.asissoft.com`.
  - Retirar GitHub Pages y el Worker para ProcessIQ: hoy se mantienen a pedido del proyecto, y el Worker sigue para Radar de Prospectos.

### Fase 4 — Evolución del producto

- Comentarios y revisión por invitados externos.
- Portafolio de procesos por cliente y panel de indicadores.
- Colaboración en tiempo real (WebSocket; los contenedores lo permiten).
- RAG sobre entregables históricos, comparativo contra APQC PCF e interfaz en inglés.

---

## 14. Decisiones de arquitectura (resumen de ADR)

| # | Decisión | Alternativa descartada | Motivo |
|---|---|---|---|
| 1 | TypeScript en todas las capas | Backend en Python (FastAPI) | Un solo modelo de dominio; con dos lenguajes habría dos copias del esquema y de las validaciones |
| 2 | Monolito modular: un servicio web y un worker, un módulo por iniciativa | Microservicios | Varios equipos pueden trabajar en paralelo con fronteras comprobadas sin multiplicar lo que hay que operar |
| 2b | Monorepo para todo lo que comparte el modelo de procesos; repositorio propio para productos independientes | Un repositorio por aplicación; un monorepo para todo el ecosistema | Lo que comparte dominio debe cambiar en el mismo PR; lo independiente se integra por API versionada y puede tener su propio control de acceso |
| 3 | Contenedores Docker en PaaS (Render) | Funciones serverless; Azure | Jobs de varios minutos; portabilidad directa a Azure Container Apps cuando haya suscripción |
| 4 | Postgres también como cola y canal de eventos (tabla `ejecuciones_ia` con `SKIP LOCKED` + `LISTEN/NOTIFY`; pg-boss si hicieran falta colas genéricas) | Redis | Una pieza menos que operar |
| 5 | Portar el motor de diagrama propio | Reescribirlo en React o sustituirlo por bpmn-js | Es el diferencial y ya está medido; reescribirlo arriesga meses de ajuste |
| 6 | React solo para el shell | Todo vanilla | Proyectos, catálogos y administración son pantallas convencionales donde React ahorra trabajo |
| 7 | IA como jobs durables en el servidor | Llamadas desde el navegador | Resistente a cortes, trazable, con prompts y clave fuera del cliente |
| 8 | Entra ID por OIDC directo en la API | Autenticación del proveedor de base de datos | Cuentas corporativas sin atarse al proveedor |
| 9 | Extracción de documentos en el navegador | Workers de servidor para PDF/DOCX/PPTX | Los originales del cliente no salen del equipo salvo pedido expreso |
| 10 | Grafo en JSONB por revisión | Tablas normalizadas de nodos y aristas | Menos esquema que mantener; se normaliza cuando una consulta lo exija |
| 11 | Cloudflare (DNS y Worker) tal cual; nada nuevo allí | Migrar o ampliar Cloudflare | Decisión del proyecto |

---

## 15. Decisiones pendientes

| Decisión | Recomendación | Antes de |
|---|---|---|
| Proveedor de cómputo | Render, plan de pago; aprobación de Seguridad/Compras | Fase 1 (entornos de vista previa) |
| Base de datos y región | Supabase, São Paulo; confirmar con Legal la transferencia de datos | Fase 2 |
| Registro de la aplicación en Entra ID | Pedirlo a TI al iniciar la fase 1 (el trámite tarda) | Fase 2 |
| Política de datos para la IA y retención de fuentes | Acordarla con Legal/Seguridad | Fase 2 |
| Presupuesto mensual de IA y de infraestructura | Fijarlo con la cotización del PaaS y el histórico de Pulse | Fase 2 |
| Responsable de operación (despliegues, incidentes, restauraciones) | Nombrarlo | Fase 3 |
| Equipo de plataforma (dueño de dominio, base de datos, IA, infraestructura y CI) | Nombrarlo; sin él, el modelo compartido se degrada con varios equipos | Fase 1 |
| Inventario de iniciativas | Clasificar cada una con el criterio de §5 (módulo, app del monorepo o repositorio propio) y registrarla en `docs/iniciativas/README.md` | Antes de que arranque cada equipo |
