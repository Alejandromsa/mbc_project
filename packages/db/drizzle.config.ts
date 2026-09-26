// Configuración de drizzle-kit: genera las migraciones SQL desde src/esquema.ts.
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/esquema.ts',
  out: './migraciones'
});
