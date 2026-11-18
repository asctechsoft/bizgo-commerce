import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@bizgo/db/testing': fileURLToPath(
        new URL('../../packages/db/testing/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    globals: true,
    include: ['test/**/*.test.ts'],
    globalSetup: [
      fileURLToPath(new URL('../../packages/db/testing/global-setup.ts', import.meta.url)),
    ],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    pool: 'forks',
  },
});
