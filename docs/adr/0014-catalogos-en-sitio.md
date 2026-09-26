# 14. Los catálogos de la organización se aplican reemplazando en sitio los del dominio

**Estado:** vigente. **Fecha:** 26-sep-2026.

## Contexto
El editor portado del MVP lee los catálogos (KPIs, verbos del Playbook, temas PPTX) de constantes compartidas: `KPI_LIBRARY`, `VERBS_*` y `TEMAS_PPTX`. Las usa por referencia en tres sitios: la interfaz (`window.*`), el linter (`validarProceso`) y el export PPTX. Pasar el catálogo como parámetro obligaría a reescribir código portado que la fidelidad protege byte a byte.

## Decisión
En los procesos de un proyecto, el editor pide `GET /api/catalogos` y **reemplaza el contenido** de esas constantes, sin reasignarlas (`plataforma/catalogos.js`). Los tres consumidores ven los catálogos de la organización sin cambios. En el editor libre no se llama y todo sigue con los de fábrica.

## Consecuencias
- Cero cambios en el código portado; la fidelidad sigue en 32/32.
- Es estado global del módulo: una página abre un solo proceso, así que no hay mezcla. Si algún día un mismo editor abriera procesos de organizaciones distintas, habría que pasar el catálogo como parámetro.
