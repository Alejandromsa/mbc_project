// Portado del MVP 3.8.9 (app.js) sin cambios de lógica — fase 1.
import { $ } from '../dom.js';
import { traducirDe, traducirError, tr } from '../i18n.js';
import { runIngest } from '../ingesta/flujo.js';
import { cancelIngestJob, ingestAbort } from '../ingesta/formatos.js';
import { addFilesAsSources } from '../ingesta/fuentes.js';
import { openModal } from '../ui/modal.js';
import { MODELOS_EN } from '../textos/en.js';
import { escapeHtml } from '../util.js';
import { AI_MODELS, PROXY_POR_DEFECTO, aiConfig, aiReady, callClaude, saveAiConfig } from './motor.js';
import { iaRemota } from './remota.js';

// ----------- Panel de Ajustes de IA (BYOK) -----------
function openAiSettings() {
  // En un proceso de proyecto la IA la gestiona el servidor: solo se informa
  const remota = iaRemota();
  if (remota) {
    openModal(tr('ajustesIa.proyecto'), remota.htmlAjustes(), () => {});
    // Como cada diálogo del editor, pone su propio texto (el anterior queda puesto)
    const ok = $('#modalOk'); if (ok) ok.textContent = tr('ajustesIa.entendido');
    return;
  }
  const cfg = aiConfig();
  const modo = cfg.modo || (cfg.key ? 'propia' : 'equipo');
  const esc = s => String(s == null ? '' : s).replace(/"/g, '&quot;');
  const opts = AI_MODELS.map(m => `<option value="${m.id}"${(cfg.model || 'claude-opus-5') === m.id ? ' selected' : ''}>${traducirDe(MODELOS_EN, m.label, m.id)}</option>`).join('');
  const html = `
      <div class="ai-settings">
        <p class="panel-hint">${tr('ajustesIa.intro')}</p>
        <label>${tr('ajustesIa.modo')}
          <select id="aiModo">
            <option value="equipo"${modo === 'equipo' ? ' selected' : ''}>${tr('ajustesIa.modoEquipo')}</option>
            <option value="propia"${modo === 'propia' ? ' selected' : ''}>${tr('ajustesIa.modoPropia')}</option>
          </select>
        </label>
        <div id="aiBloqueEquipo">
          <label>${tr('codigo.etiqueta')}
            <input type="password" id="aiCodigo" value="${esc(cfg.codigo || '')}" autocomplete="off" />
          </label>
          <label>${tr('ajustesIa.direccion')}
            <input type="text" id="aiProxy" value="${esc(cfg.proxyUrl || PROXY_POR_DEFECTO)}" autocomplete="off" />
          </label>
          <p class="ai-hint">${tr('ajustesIa.codigoPista')}</p>
        </div>
        <div id="aiBloquePropia">
        <label>${tr('ajustesIa.apiKey')}
          <input type="password" id="aiKey" placeholder="sk-ant-..." value="${esc(cfg.key || '')}" autocomplete="off" />
        </label>
        <p class="ai-hint">${tr('ajustesIa.apiKeyPista')}</p>
        </div>
        <label>${tr('ajustesIa.modelo')}
          <select id="aiModel">${opts}</select>
        </label>
        <div class="ai-actions-row">
          <button id="aiTest" class="btn btn-ghost btn-mini" type="button">${tr('ajustesIa.probar')}</button>
          <span id="aiTestStatus" class="ai-test-status"></span>
        </div>
        <p class="ai-hint" style="margin-top:10px">${tr('ajustesIa.byok')}</p>
      </div>`;
  function leerFormIa() {
    return { key: ($('#aiKey').value || '').trim(), model: $('#aiModel').value,
             modo: $('#aiModo').value, codigo: ($('#aiCodigo').value || '').trim(),
             proxyUrl: ($('#aiProxy').value || '').trim() };
  }
  openModal(tr('ajustesIa.titulo'), html, () => {
    saveAiConfig(leerFormIa());
    updateAiUi();
  });
  const ok = $('#modalOk'); if (ok) ok.textContent = tr('ajustesIa.guardar');
  const selModo = $('#aiModo');
  const pintarModo = () => {
    const eq = selModo.value === 'equipo';
    $('#aiBloqueEquipo').hidden = !eq; $('#aiBloquePropia').hidden = eq;
  };
  if (selModo) { selModo.addEventListener('change', pintarModo); pintarModo(); }
  const test = $('#aiTest');
  if (test) test.addEventListener('click', async () => {
    const st = $('#aiTestStatus');
    const prev = aiConfig();
    saveAiConfig(leerFormIa());
    st.textContent = tr('ajustesIa.probando'); st.className = 'ai-test-status';
    try {
      const r = await callClaude('Responde solo con la palabra: OK', { maxTokens: 256, effort: 'low' });
      st.textContent = /ok/i.test(r) ? tr('ajustesIa.correcta') : tr('ajustesIa.respondio', { texto: r.slice(0, 20) });
      st.className = 'ai-test-status ok';
    } catch (e) {
      st.textContent = '✕ ' + traducirError(e.message); st.className = 'ai-test-status err';
      saveAiConfig(prev);
    }
  });
}

// Refleja en la UI si la IA está configurada (badge en el botón)
function updateAiUi() {
  const b = $('#btnAiSettings');
  if (b) b.classList.toggle('ai-on', aiReady());
  updateAiModeHint();
}

function attachAiListeners() {
  const gear = $('#btnAiSettings');
  if (gear) gear.addEventListener('click', openAiSettings);

  // Botón único: "Generar proceso" (usa el texto pegado)
  const go = $('#btnIngestGo');
  if (go) go.addEventListener('click', () => runIngest(null));

  const addSrc = $('#btnAddSource');
  if (addSrc) addSrc.addEventListener('click', () => { if (!ingestAbort) $('#docFileInput').click(); });

  const cancel = $('#btnIngestCancel');
  if (cancel) cancel.addEventListener('click', cancelIngestJob);

  // Zona de arrastrar y soltar (el gesto principal)
  const dz = $('#dropZone'), fi = $('#docFileInput');
  if (dz && fi) {
    const pick = () => { if (!ingestAbort) fi.click(); };
    dz.addEventListener('click', pick);
    dz.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
    ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, (e) => {
      e.preventDefault(); e.stopPropagation(); dz.classList.add('over');
    }));
    ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, (e) => {
      e.preventDefault(); e.stopPropagation();
      if (ev === 'dragleave' && dz.contains(e.relatedTarget)) return;
      dz.classList.remove('over');
    }));
    dz.addEventListener('drop', (e) => {
      const files = e.dataTransfer && e.dataTransfer.files;
      if (files && files.length) addFilesAsSources(files);
    });
  }
  updateAiModeHint();
}

// Aclara qué motor se usará al pulsar "Generar proceso"
function updateAiModeHint() {
  const el = $('#ingestAiMode');
  if (!el) return;
  const remota = iaRemota();
  if (remota) {
    el.innerHTML = remota.lista() ? tr('modoIa.servidor') : tr('modoIa.servidorNo');
    el.className = remota.lista() ? 'ingest-mode on' : 'ingest-mode';
    return;
  }
  if (aiReady()) {
    const m = (aiConfig().model || 'claude-opus-5').replace('claude-', '').replace('-5', ' 5');
    el.innerHTML = tr('modoIa.modelo', { modelo: escapeHtml(m) });
    el.className = 'ingest-mode on';
  } else {
    el.innerHTML = tr('modoIa.equipo');
    el.className = 'ingest-mode';
  }
}

export { attachAiListeners, openAiSettings, updateAiUi };
