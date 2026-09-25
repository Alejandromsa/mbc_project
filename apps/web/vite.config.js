import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// El shell de proyectos (React) vive bajo /proyectos/ con rutas del lado del
// cliente. En desarrollo, toda ruta /proyectos/... que no pida un archivo sirve
// proyectos/index.html; en el servidor lo hace Caddy (try_files).
function rutasDelShell() {
  return {
    name: 'processiq-rutas-del-shell',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const ruta = (req.url ?? '').split('?')[0];
        if (/^\/proyectos(\/|$)/.test(ruta) && !/\.[a-z0-9]+$/i.test(ruta)) req.url = '/proyectos/index.html';
        next();
      });
    }
  };
}

export default defineConfig({
  // React solo transforma el shell (.tsx): los módulos del editor (.js) quedan
  // exactamente como en la fase 1.
  plugins: [react({ include: /\.tsx$/ }), rutasDelShell()],
  server: {
    port: 5173,
    // En desarrollo, /ia/* va al intermediario local (pnpm --filter @processiq/intermediario dev)
    proxy: {
      '/ia': {
        target: 'http://localhost:8787',
        rewrite: (p) => p.replace(/^\/ia/, '')
      },
      // API de la plataforma (pnpm --filter @processiq/api dev, puerto de .env.dev).
      // changeOrigin no: la API valida el Origin de la web (http://localhost:5173).
      '/api': { target: 'http://localhost:8790' }
    }
  },
  preview: { port: 4173 },
  build: {
    target: 'es2022',
    sourcemap: true,
    // La app lee variables CSS (getComputedStyle) y las copia a los SVG y
    // exports; el minificador pasa los colores a minusculas y los artefactos
    // dejan de ser identicos al MVP. Caddy comprime con gzip/zstd igualmente.
    cssMinify: false,
    rolldownOptions: {
      // Dos páginas: el editor (/) y el shell de proyectos (/proyectos/)
      input: {
        editor: resolve(import.meta.dirname, 'index.html'),
        proyectos: resolve(import.meta.dirname, 'proyectos/index.html')
      }
    }
  }
});
