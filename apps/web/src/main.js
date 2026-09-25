// Punto de entrada de la web.
// Fase 1 (portado): la app del MVP 3.8.9 partida en módulos ES (src/app/), sin
// cambios de lógica; sus piezas se van moviendo a packages/* y las pruebas de
// fidelidad (pruebas/fidelidad) lo verifican contra la referencia del MVP.
// Orden: catalogos-globales publica los catálogos en window.* que usa la app.
import './app/catalogos-globales.js';
import './app/inicio.js';
