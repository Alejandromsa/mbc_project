# 13. La cola de IA es la tabla de ejecuciones

**Estado:** vigente. **Fecha:** 25-sep-2026. Concreta el ADR 4.

## Contexto
El ADR 4 fija Postgres como cola, sin Redis, y proponía pg-boss. Cada ejecución de IA ya necesita su propia fila (estado, progreso, coste, resultado) para mostrarla y auditarla.

## Decisión
La fila de `ejecuciones_ia` **es** el trabajo:
- **Tomar un trabajo:** `UPDATE … WHERE id = (SELECT … FOR UPDATE SKIP LOCKED LIMIT 1)`. Así dos workers nunca toman el mismo.
- **Reintentos:** con `disponible_en`, sin cambiar de tabla.
- **Latido:** `actualizado_en`. Las ejecuciones sin latido vuelven a la cola.
- **Avisos por `LISTEN/NOTIFY`:** `ia_cola` despierta al worker e `ia_ejecucion` alimenta el SSE de progreso.

Alternativa descartada: pg-boss. Añade su propio esquema y una segunda fuente de verdad sobre el estado de cada ejecución.

## Consecuencias
- Una dependencia menos y una sola tabla que consultar para progreso, consumo y auditoría.
- Si aparecen trabajos de otro tipo (exportaciones pesadas, correos), se reevalúa pg-boss para colas genéricas.
