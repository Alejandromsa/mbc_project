// Portado del MVP 3.8.9 (app.js) sin cambios de lógica — fase 1.
import { detectarParticipantes } from '@processiq/documentos';
import { $ } from '../dom.js';
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
          <td class="pt-name">${esc(p.nombre)}<span class="pt-count">${p.veces} intervenciones</span></td>
          <td><input type="text" class="pt-role" data-i="${i}" list="rolesComunes"
                     placeholder="¿Qué rol cumple?" value="${esc(p.pista)}" /></td>
        </tr>`).join('');
    const html = `
        <p class="panel-hint">Detecté <b>${participantes.length} persona(s)</b> en la transcripción. Indica el <b>rol</b> de cada una: la IA usará el rol (no el nombre) como <b>carril</b> del flujo, que es lo correcto en un proceso.</p>
        <datalist id="rolesComunes">
          <option value="Analista"><option value="Jefe de área"><option value="Gerente">
          <option value="Supervisor"><option value="Asesor comercial"><option value="Back office">
          <option value="Call center"><option value="Operaciones"><option value="Riesgos">
          <option value="Legal / Cumplimiento"><option value="Tecnología"><option value="Finanzas">
          <option value="Recursos Humanos"><option value="Cliente"><option value="Proveedor">
        </datalist>
        <table class="pt-table"><tbody>${filas}</tbody></table>
        <p class="ai-hint">Deja en blanco a quien no participe en el proceso (p. ej. el consultor que facilita la reunión): se omitirá.</p>`;
    openModal('👥 ¿Quién es quién en la reunión?', html, () => {
      const mapa = {};
      document.querySelectorAll('#modalBody .pt-role').forEach(inp => {
        const rol = (inp.value || '').trim();
        if (rol) mapa[participantes[+inp.dataset.i].nombre] = rol;
      });
      resolve(mapa);
    });
    const ok = $('#modalOk'); if (ok) ok.textContent = 'Usar estos roles';
    const cancel = $('#modalCancel');
    if (cancel) { cancel.textContent = 'Omitir'; const prev = cancel.onclick; cancel.onclick = (e) => { resolve({}); if (prev) prev(e); }; }
  });
}

export { askParticipantRoles, detectParticipants };
