// Portado del MVP 3.8.9 (app.js) sin cambios de lógica — fase 1.
import { $ } from '../dom.js';
import { locale, tr } from '../i18n.js';
import { openModal } from '../ui/modal.js';
import { updateAiUi } from './ajustes.js';
import { GEN_MAX_TOKENS, aiConfig, estimarCosteGeneracion, fmtUsd, saveAiConfig } from './motor.js';
import { iaRemota } from './remota.js';

// Modal: profundidad del levantamiento. NO decide QUE se genera --siempre se
// genera el proceso completo-- sino con cuanto detalle lo mira la IA y en que
// vista se abre. Elegir mal no cuesta nada: el selector de nivel cambia la
// vista al instante y sin volver a llamar a la IA.
// Pide el codigo de acceso del equipo la primera vez que se ingesta.
// Resuelve con el codigo, o con '' si el usuario elige el modo basico (boton,
// Esc o clic fuera: el MutationObserver cubre los cierres que no pasan por
// los botones, para que la ingesta nunca se quede esperando).
function pedirCodigoEquipo() {
  // En un proceso de proyecto no hay código de equipo: la IA es la del servidor
  const remota = iaRemota();
  if (remota) { remota.avisarNoDisponible(); return Promise.resolve(''); }
  return new Promise(resolve => {
    const modal = $('#modal'), ok = $('#modalOk'), cancel = $('#modalCancel');
    const txtOk = ok ? ok.textContent : '', txtCancel = cancel ? cancel.textContent : '';
    let hecho = false, obs = null;
    const fin = (v) => {
      if (hecho) return;
      hecho = true;
      if (obs) obs.disconnect();
      if (ok) ok.textContent = txtOk;
      if (cancel) cancel.textContent = txtCancel;
      resolve(v);
    };
    const html =
      '<p class="panel-hint">' + tr('codigo.intro') + '</p>' +
      '<label>' + tr('codigo.etiqueta') + '<input type="password" id="ingestCodigo" autocomplete="off" /></label>' +
      '<p class="ai-hint">' + tr('codigo.sinCodigo') + '</p>';
    openModal(tr('codigo.titulo'), html, () => fin((($('#ingestCodigo') || {}).value || '').trim()));
    if (ok) ok.textContent = tr('codigo.usarIa');
    if (cancel) {
      cancel.textContent = tr('codigo.modoBasico');
      const prev = cancel.onclick;
      cancel.onclick = (e) => { fin(''); if (prev) prev(e); };
    }
    if (modal) {
      obs = new MutationObserver(() => { if (modal.hidden) setTimeout(() => fin(''), 0); });
      obs.observe(modal, { attributes: true, attributeFilter: ['hidden'] });
    }
  });
}

function askProfundidad(info) {
  const chars = (info && info.chars) || 0;
  return new Promise(resolve => {
    const html =
      '<p class="panel-hint">' + tr('profundidad.intro') + '</p>' +
      '<div class="prof-opts">' +
      '<label class="prof-opt"><input type="radio" name="prof" value="1" />' +
      '<span><b>' + tr('nivel.ejecutivo') + '</b><small>' + tr('profundidad.ejecutivo') + '</small></span></label>' +
      '<label class="prof-opt"><input type="radio" name="prof" value="2" checked />' +
      '<span><b>' + tr('nivel.actividad') + '</b><small>' + tr('profundidad.actividad') + '</small></span></label>' +
      '<label class="prof-opt"><input type="radio" name="prof" value="3" />' +
      '<span><b>' + tr('nivel.detalle') + '</b><small>' + tr('profundidad.detalle') + '</small></span></label>' +
      '</div>' +
      // v3.8.7: el modelo se elige AQUI, viendo lo que cuesta cada uno (antes
      // solo estaba en Ajustes de IA). Se guarda como preferencia del navegador.
      (chars ? (() => {
        const actual = aiConfig().model === 'claude-sonnet-5' ? 'claude-sonnet-5' : 'claude-opus-5';
        const opcion = (id, titulo, texto) =>
          '<label class="prof-opt"><input type="radio" name="modelo" value="' + id + '"' + (actual === id ? ' checked' : '') + ' />' +
          '<span><b>' + titulo + '</b><small>' + texto + '</small><em class="pm-coste" data-modelo="' + id + '"></em></span></label>';
        return '<div class="prof-modelo"><div class="pm-titulo">' + tr('profundidad.modelo') + '</div><div class="prof-opts">' +
          opcion('claude-opus-5', 'Claude Opus 5', tr('profundidad.opus')) +
          opcion('claude-sonnet-5', 'Claude Sonnet 5', tr('profundidad.sonnet')) +
          '</div></div><div id="profCoste" class="prof-coste"></div>';
      })() : '');
    openModal(chars ? tr('profundidad.tituloModelo') : tr('profundidad.titulo'), html, () => {
      const sel = document.querySelector('#modalBody input[name="prof"]:checked');
      const mod = document.querySelector('#modalBody input[name="modelo"]:checked');
      if (mod) {
        const c = aiConfig();
        if (c.model !== mod.value) { saveAiConfig(Object.assign({}, c, { model: mod.value })); updateAiUi(); }
      }
      resolve(sel ? +sel.value : 2);
    });
    // v3.8.6: coste estimado de ESTA ejecucion, antes de gastar; cambia con el nivel
    const pintarCoste = () => {
      const box = $('#profCoste');
      if (!box) return;
      const sel = document.querySelector('#modalBody input[name="prof"]:checked');
      const nivel = sel ? +sel.value : 2;
      const mod = document.querySelector('#modalBody input[name="modelo"]:checked');
      const e = estimarCosteGeneracion(chars, nivel, mod ? mod.value : undefined);
      // Rango de cada modelo en su tarjeta, para comparar antes de elegir
      document.querySelectorAll('#modalBody .pm-coste').forEach(el => {
        const x = estimarCosteGeneracion(chars, nivel, el.dataset.modelo);
        el.textContent = tr('profundidad.estimado', { min: fmtUsd(x.min), max: fmtUsd(x.max) });
      });
      box.innerHTML =
        '<div class="pc-cifra">' + tr('profundidad.costeEstimado', { min: fmtUsd(e.min), max: fmtUsd(e.max) }) + '</div>' +
        '<small>' + tr('profundidad.costeDetalle', {
          tope: fmtUsd(e.tope), tokens: GEN_MAX_TOKENS.toLocaleString(locale()), modelo: e.precio.nombre,
          entrada: e.precio.entrada, salida: e.precio.salida, tokensEntrada: e.entrada.toLocaleString(locale())
        }) + ' ' +
        (e.muestras ? tr(e.muestras === 1 ? 'profundidad.ajustadoUna' : 'profundidad.ajustadoVarias', { n: e.muestras })
                    : tr('profundidad.inicial')) + '</small>';
    };
    pintarCoste();
    document.querySelectorAll('#modalBody input[name="prof"], #modalBody input[name="modelo"]').forEach(r => r.addEventListener('change', pintarCoste));
    const ok = $('#modalOk'); if (ok) ok.textContent = tr('profundidad.generar');
    const cancel = $('#modalCancel');
    if (cancel) { const prev = cancel.onclick; cancel.onclick = (e) => { resolve(2); if (prev) prev(e); }; }
  });
}

export { askProfundidad, pedirCodigoEquipo };
