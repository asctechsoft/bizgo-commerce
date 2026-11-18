import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [
    // SWC emits decorator metadata, which Nest's constructor DI requires (esbuild does not).
    swc.vite({
      module: { type: 'es6' },
      jsc: {
        target: 'es2022',
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
    }),
  ],
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
    server: { deps: { inline: [/@bizgo\//] } },
  },
});
