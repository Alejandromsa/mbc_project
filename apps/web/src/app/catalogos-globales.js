// Catálogos del MVP publicados en window.* para app.js (legado).
// Los datos viven en @processiq/dominio (packages/dominio/src/catalogos.ts).
import {
  KPI_LIBRARY, PAIN_CATEGORIES, INDUSTRIES, EXECUTION_TYPES,
  VERBS_ALLOWED, VERBS_FORBIDDEN, MACROPROCESSES
} from '@processiq/dominio';

Object.assign(window, {
  KPI_LIBRARY, PAIN_CATEGORIES, INDUSTRIES, EXECUTION_TYPES,
  VERBS_ALLOWED, VERBS_FORBIDDEN, MACROPROCESSES
});
