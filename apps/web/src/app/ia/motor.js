// Motor de IA de la app: configuración (localStorage), historial de costes y
// adaptador del cliente de @processiq/ia (prompts, streaming, costes).
import {
  GEN_MAX_TOKENS, MODELOS_IA, PROMPT_GENERACION, estimarCosteGeneracion as estimarCoste,
  extraerJson, fmtUsd, llamarClaude, precioModelo, usd
} from '@processiq/ia';
import { state } from '../estado.js';
import { MAX_AI_CHARS, ingestAbort, throwIfCancelled } from '../ingesta/formatos.js';

// ============================================================
// MOTOR DE IA — Anthropic API (BYOK, llamada directa desde el navegador)
// La API key la pone el usuario en Ajustes y se guarda SOLO en su navegador
// (localStorage). Nunca viaja a ningún servidor nuestro. Usa el header
// anthropic-dangerous-direct-browser-access para permitir la llamada CORS.
// ============================================================
const AI_KEY = 'processiq.ai';
// Intermediario con la clave central (apps/intermediario). Mismo origen que
// la web: Caddy enruta /ia/* al contenedor, asi el dominio no queda fijado
// en el codigo (se cambia solo en .env).
const PROXY_POR_DEFECTO = location.origin + '/ia';
const AI_MODELS = MODELOS_IA;
function aiConfig() { try { return JSON.parse(localStorage.getItem(AI_KEY)) || {}; } catch (e) { return {}; } }
function saveAiConfig(c) { try { localStorage.setItem(AI_KEY, JSON.stringify(c)); } catch (e) {} }

// ---- Coste por ejecucion (v3.8.6) ----
// Precios, estimación y formato: @processiq/ia. Aquí, el historial de este navegador.
const COSTES_KEY = 'processiq.ia.costes';
function historialCostes() { try { return JSON.parse(localStorage.getItem(COSTES_KEY)) || []; } catch (e) { return []; } }
function registrarCoste(r) {
  try { const h = historialCostes(); h.push(r); localStorage.setItem(COSTES_KEY, JSON.stringify(h.slice(-20))); } catch (e) {}
}

// Coste ANTES de generar: rango probable + máximo posible, calibrado con las
// ejecuciones reales guardadas en este navegador.
function estimarCosteGeneracion(charsTexto, nivel, modeloElegido) {
  const modelo = modeloElegido || aiConfig().model || 'claude-opus-5';
  return estimarCoste(charsTexto, nivel, modelo, historialCostes(), MAX_AI_CHARS);
}
function lineaCosteIa() {
  const c = state._ultimoCosteIa;
  return c ? '\n\nCoste de esta ejecución: **' + fmtUsd(c.usd) + '** (' + c.entrada.toLocaleString('es-PE') +
    ' tokens de entrada y ' + c.salida.toLocaleString('es-PE') + ' de salida, precio de lista de ' +
    precioModelo(c.modelo).nombre + ').' : '';
}
// Lista si hay forma de llegar a Claude: codigo de equipo (intermediario)
// o clave propia. Sin 'modo' guardado se asume clave propia (configs viejas).
function aiReady() {
  const c = aiConfig();
  return c.modo === 'equipo' ? !!(c.codigo || '').trim() : !!(c.key || '').trim();
}

// Llamada a Claude con la configuración de este navegador. El botón Cancelar
// de la ingesta aborta la llamada; se consulta en el momento del error.
function callClaude(userText, opts) {
  return llamarClaude(userText, opts, aiConfig(), {
    proxyPorDefecto: PROXY_POR_DEFECTO,
    host: location.host,
    senalCancelacion: ingestAbort ? ingestAbort.controller.signal : null,
    cancelado: () => !!(ingestAbort && ingestAbort.cancelled),
    comprobarCancelado: throwIfCancelled
  });
}

const parseJsonLoose = extraerJson;
const AI_SYSTEM = PROMPT_GENERACION;

export { AI_MODELS, AI_SYSTEM, GEN_MAX_TOKENS, PROXY_POR_DEFECTO, aiConfig, aiReady, callClaude, estimarCosteGeneracion, fmtUsd, lineaCosteIa, parseJsonLoose, registrarCoste, saveAiConfig, usd };
