// Portado del MVP 3.8.9 (app.js) sin cambios de lógica — fase 1.
import { $ } from '../dom.js';
import { runIngest } from '../ingesta/flujo.js';
import { cancelIngestJob, ingestAbort } from '../ingesta/formatos.js';
import { addFilesAsSources } from '../ingesta/fuentes.js';
import { openModal } from '../ui/modal.js';
import { escapeHtml } from '../util.js';
import { AI_MODELS, PROXY_POR_DEFECTO, aiConfig, aiReady, callClaude, saveAiConfig } from './motor.js';
import { iaRemota } from './remota.js';

// ----------- Panel de Ajustes de IA (BYOK) -----------
function openAiSettings() {
  // En un proceso de proyecto la IA la gestiona el servidor: solo se informa
  const remota = iaRemota();
  if (remota) {
    openModal('IA del proyecto', remota.htmlAjustes(), () => {});
    // Como cada diálogo del editor, pone su propio texto (el anterior queda puesto)
    const ok = $('#modalOk'); if (ok) ok.textContent = 'Entendido';
    return;
  }
  const cfg = aiConfig();
  const modo = cfg.modo || (cfg.key ? 'propia' : 'equipo');
  const esc = s => String(s == null ? '' : s).replace(/"/g, '&quot;');
  const opts = AI_MODELS.map(m => `<option value="${m.id}"${(cfg.model || 'claude-opus-5') === m.id ? ' selected' : ''}>${m.label}</option>`).join('');
  const html = `
      <div class="ai-settings">
        <p class="panel-hint">ProcessIQ usa el <b>API de Anthropic (Claude)</b>. En <b>modo equipo</b> la clave vive en el intermediario de MBC y en este navegador solo se guarda tu código de acceso. Con <b>tu propia API key</b>, la key se guarda solo en este navegador y va directo a Anthropic.</p>
        <label>Modo
          <select id="aiModo">
            <option value="equipo"${modo === 'equipo' ? ' selected' : ''}>Clave del equipo (intermediario MBC)</option>
            <option value="propia"${modo === 'propia' ? ' selected' : ''}>Mi propia API key</option>
          </select>
        </label>
        <div id="aiBloqueEquipo">
          <label>Código de acceso del equipo
            <input type="password" id="aiCodigo" value="${esc(cfg.codigo || '')}" autocomplete="off" />
          </label>
          <label>Dirección del intermediario
            <input type="text" id="aiProxy" value="${esc(cfg.proxyUrl || PROXY_POR_DEFECTO)}" autocomplete="off" />
          </label>
          <p class="ai-hint">El código te lo da quien administra ProcessIQ. La clave de Anthropic vive en el intermediario: tu navegador nunca la ve.</p>
        </div>
        <div id="aiBloquePropia">
        <label>API key de Anthropic
          <input type="password" id="aiKey" placeholder="sk-ant-..." value="${esc(cfg.key || '')}" autocomplete="off" />
        </label>
        <p class="ai-hint">La obtienes en <b>console.anthropic.com → API Keys</b>. Empieza con <code>sk-ant-</code>.</p>
        </div>
        <label>Modelo
          <select id="aiModel">${opts}</select>
        </label>
        <div class="ai-actions-row">
          <button id="aiTest" class="btn btn-ghost btn-mini" type="button">Probar conexión</button>
          <span id="aiTestStatus" class="ai-test-status"></span>
        </div>
        <p class="ai-hint" style="margin-top:10px">⚠️ Modo BYOK: úsalo para trabajo interno o demos. Para un link público compartido, conviene un proxy con la key en el servidor.</p>
      </div>`;
  function leerFormIa() {
    return { key: ($('#aiKey').value || '').trim(), model: $('#aiModel').value,
             modo: $('#aiModo').value, codigo: ($('#aiCodigo').value || '').trim(),
             proxyUrl: ($('#aiProxy').value || '').trim() };
  }
  openModal('⚙ Ajustes de IA (Claude)', html, () => {
    saveAiConfig(leerFormIa());
    updateAiUi();
  });
  const ok = $('#modalOk'); if (ok) ok.textContent = 'Guardar';
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
    st.textContent = '⏳ Probando…'; st.className = 'ai-test-status';
    try {
      const r = await callClaude('Responde solo con la palabra: OK', { maxTokens: 256, effort: 'low' });
      st.textContent = /ok/i.test(r) ? '✓ Conexión correcta' : '✓ Respondió: ' + r.slice(0, 20);
      st.className = 'ai-test-status ok';
    } catch (e) {
      st.textContent = '✕ ' + e.message; st.className = 'ai-test-status err';
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
    el.innerHTML = remota.lista()
      ? 'Se interpretará con <b>IA en el servidor</b>: reconstruye actividades, roles y decisiones, y el resultado se guarda en el proyecto.'
      : 'La IA del servidor no está disponible ahora; se usará el <b>modo básico</b> por palabras clave.';
    el.className = remota.lista() ? 'ingest-mode on' : 'ingest-mode';
    return;
  }
  if (aiReady()) {
    const m = (aiConfig().model || 'claude-opus-5').replace('claude-', '').replace('-5', ' 5');
    el.innerHTML = `Se interpretará con <b>IA (${escapeHtml(m)})</b>: reconstruye actividades, roles y decisiones.`;
    el.className = 'ingest-mode on';
  } else {
    el.innerHTML = `Se interpretará con <b>IA (Claude)</b> usando la clave del equipo. Al generar te pediremos el código de acceso; sin él seguirá el <b>modo básico</b> por palabras clave.`;
    el.className = 'ingest-mode';
  }
}

export { attachAiListeners, openAiSettings, updateAiUi };
