// Portado del MVP 3.8.9 (app.js) sin cambios de lógica — fase 1.
import { $ } from '../dom.js';
import { maybeFitOnLoad } from '../lienzo/zoom.js';
import { openModal } from '../ui/modal.js';
import { loadComplexDemo, loadComplexDemo10, loadComplexDemo11, loadComplexDemo12, loadComplexDemo2, loadComplexDemo3, loadComplexDemo4, loadComplexDemo5, loadComplexDemo6, loadComplexDemo7, loadComplexDemo8, loadComplexDemo9, loadDemoProcess } from './ejemplos.js';
import { loadFichaVentaLotes } from './venta-lotes.js';

// Selector de ejemplos pre-cargados
function openExamplesModal() {
  const examples = [
    { fn: loadFichaVentaLotes, t: '★ Ficha: Venta de Lotes Urbanos (Centenario)', d: 'Ficha corporativa completa · 29 actividades · 4 roles · 2 loops + 3 ramas de firma · export a Ficha de Proceso (Word)' },
    { fn: loadDemoProcess,   t: 'Gestión de Reclamos (Banca)', d: 'Simple · 7 actividades · 4 actores · pains + KPIs + simulación' },
    { fn: loadComplexDemo,   t: 'Originación de Crédito Hipotecario', d: 'Complejo · 23 nodos · 8 actores · loop de reproceso · cuello de botella' },
    { fn: loadComplexDemo2,  t: 'Onboarding de Personal', d: 'Gateway paralelo ＋ · 7 actores · fork/join (IT/Legal/Finanzas/Seguridad)' },
    { fn: loadComplexDemo3,  t: 'Devolución y Reembolso (Retail)', d: 'Eventos BPMN · timer ⏱ + mensaje ✉ + error ⚡ · 5 actores' },
    { fn: loadComplexDemo4,  t: 'Gestión de Siniestros (Seguros)', d: 'BPMN avanzado · gateway inclusivo ○ · marcadores loop/multi-instancia/subproceso · 7 actores' },
    { fn: loadComplexDemo5,  t: 'Atención de Emergencia (Salud)', d: 'Señal ▲ broadcast · gateway paralelo ＋ fork/join · timer ⏱ · 6 actores' },
    { fn: loadComplexDemo6,  t: 'Orden a Despacho (Manufactura)', d: 'Evento de terminación ⬤ · make-to-stock vs make-to-order · gateway paralelo ＋ · 7 actores' },
    { fn: loadComplexDemo7,  t: 'Avería Telecom T2R (Telecom)', d: 'Escalamiento L1→L2→campo · timer SLA ⏱ · marcadores BPMN · export PPTX con iconografía · 5 actores' },
    { fn: loadComplexDemo8,  t: 'Licencia Municipal (Sector Público)', d: 'Plazo legal TUPA ⏱ · 2 fines de error · leyenda BPMN en PPTX · 6 actores' },
    { fn: loadComplexDemo9,  t: 'Nuevo Suministro Eléctrico (Utilities)', d: 'Gateway paralelo ＋ · terminación ⬤ · timer ⏱ · todos los elementos BPMN · 6 actores' },
    { fn: loadComplexDemo10, t: 'Procure-to-Pay P2P (Transversal)', d: '3-way match (subproceso ⊞) · 2 fines de error · timer ⏱ · proceso cross-funcional · 7 actores' },
    { fn: loadComplexDemo11, t: '★ Crédito PYME — showcase (Banca)', d: 'TODOS los elementos BPMN: doc ▤ + data ▱ + XOR/AND/OR + señal ▲ + terminación ⬤ + timer ⏱ + 3 marcadores · 9 actores, 27 nodos' },
    { fn: loadComplexDemo12, t: 'Fulfillment E-commerce SLA (Retail)', d: 'Eventos de borde ◎ (boundary timer no-interrumpente) para escalamiento por SLA · 6 actores' }
  ];
  const html = `<p class="panel-hint">Elige un proceso de ejemplo pre-cargado (con pains, KPIs y simulación) para explorar las capacidades.</p>
      <div class="examples-list">${examples.map((e, i) =>
        `<button class="example-item" data-ex="${i}"><span class="example-t">${e.t}</span><span class="example-d">${e.d}</span></button>`).join('')}</div>`;
  openModal('Procesos de ejemplo', html, () => {});
  setTimeout(() => {
    document.querySelectorAll('.example-item').forEach(b => b.addEventListener('click', () => {
      examples[+b.dataset.ex].fn();
      $('#modal').hidden = true;
      maybeFitOnLoad();   // si el proceso es más ancho que la pantalla, encuádralo para verlo completo
    }));
  }, 50);
}

export { openExamplesModal };
