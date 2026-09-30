// Portado del MVP 3.8.9 (app.js) sin cambios de lógica — fase 1.
import { detectarParticipantes } from '@processiq/documentos';
import { $ } from '../dom.js';
import { tr } from '../i18n.js';
import { openModal } from '../ui/modal.js';

// ============================================================
// PARTICIPANTES DE LA TRANSCRIPCION
// En transcripciones de Teams/Zoom cada linea viene como "Nombre: texto".
// Detectamos esos nombres, pedimos el ROL de cada persona y se lo damos a
// la IA para que los carriles del flujo sean roles reales, no nombres.
// ============================================================
const detectParticipants = detectarParticipantes;

// Modal: pide el rol de cada persona detectada. Devuelve promesa con el mapeo.
function askParticipantRoles(participantes) {
  return new Promise(resolve => {
    const esc = x => String(x == null ? '' : x).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
    const filas = participantes.map((p, i) => `
        <tr>
          <td class="pt-name">${esc(p.nombre)}<span class="pt-count">${tr('participantes.intervenciones', { n: p.veces })}</span></td>
          <td><input type="text" class="pt-role" data-i="${i}" list="rolesComunes"
                     placeholder="${tr('participantes.queRol')}" value="${esc(p.pista)}" /></td>
        </tr>`).join('');
    // Las sugerencias de rol son datos (van al prompt como carriles): siguen en español
    const html = `
        <p class="panel-hint">${tr('participantes.intro', { n: participantes.length })}</p>
        <datalist id="rolesComunes">
          <option value="Analista"><option value="Jefe de área"><option value="Gerente">
          <option value="Supervisor"><option value="Asesor comercial"><option value="Back office">
          <option value="Call center"><option value="Operaciones"><option value="Riesgos">
          <option value="Legal / Cumplimiento"><option value="Tecnología"><option value="Finanzas">
          <option value="Recursos Humanos"><option value="Cliente"><option value="Proveedor">
        </datalist>
        <table class="pt-table"><tbody>${filas}</tbody></table>
        <p class="ai-hint">${tr('participantes.enBlanco')}</p>`;
    openModal(tr('participantes.titulo'), html, () => {
      const mapa = {};
      document.querySelectorAll('#modalBody .pt-role').forEach(inp => {
        const rol = (inp.value || '').trim();
        if (rol) mapa[participantes[+inp.dataset.i].nombre] = rol;
      });
      resolve(mapa);
    });
    const ok = $('#modalOk'); if (ok) ok.textContent = tr('participantes.usar');
    const cancel = $('#modalCancel');
    if (cancel) { cancel.textContent = tr('participantes.omitir'); const prev = cancel.onclick; cancel.onclick = (e) => { resolve({}); if (prev) prev(e); }; }
  });
}

export { askParticipantRoles, detectParticipants };
