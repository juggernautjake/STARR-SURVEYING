import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
    // worker/** is excluded so `npm test` at the repo root doesn't double-run
    // the worker test suite (which has its own `cd worker && npm test`).
    exclude: ['node_modules', '.next', 'worker/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
