import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Las pruebas comparten una base Postgres real: un archivo cada vez
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000
  }
});
