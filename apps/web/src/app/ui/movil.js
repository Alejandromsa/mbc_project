// Portado del MVP 3.8.9 (app.js) sin cambios de lógica — fase 1.
import { $ } from '../dom.js';

// Aviso para pantallas estrechas (link público abierto en móvil)
function attachMobileNotice() {
  const notice = $('#mobileNotice');
  if (!notice) return;
  if (window.innerWidth < 720) notice.hidden = false;
  const cont = $('#btnMobileContinue');
  if (cont) cont.addEventListener('click', () => { notice.hidden = true; });
}

export { attachMobileNotice };
