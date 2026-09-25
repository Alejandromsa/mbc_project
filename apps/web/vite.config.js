import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    // En desarrollo, /ia/* va al intermediario local (pnpm --filter @processiq/intermediario dev)
    proxy: {
      '/ia': {
        target: 'http://localhost:8787',
        rewrite: (p) => p.replace(/^\/ia/, '')
      }
    }
  },
  preview: { port: 4173 },
  build: {
    target: 'es2022',
    sourcemap: true,
    // La app lee variables CSS (getComputedStyle) y las copia a los SVG y
    // exports; el minificador pasa los colores a minusculas y los artefactos
    // dejan de ser identicos al MVP. Caddy comprime con gzip/zstd igualmente.
    cssMinify: false
  }
});
