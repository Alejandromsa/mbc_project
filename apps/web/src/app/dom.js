// Portado del MVP 3.8.9 (app.js) sin cambios de lógica — fase 1.

// =================== DOM ===================
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const canvas = $('#canvas');
const nodesLayer = $('#nodesLayer');
const edgesLayer = $('#edgesLayer');
const swimlanesLayer = $('#swimlanesLayer');
const laneHeadersLayer = $('#laneHeadersLayer');
const canvasHint = $('#canvasHint');

export { $, $$, canvas, canvasHint, edgesLayer, laneHeadersLayer, nodesLayer, swimlanesLayer };
