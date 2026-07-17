import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    // A localStorage/sessionStorage shim so zustand `persist` stores don't throw
    // under the node environment (see vitest.setup.ts).
    setupFiles: ['./vitest.setup.ts'],
    // The mobile pre-flight script is a native ESM `.mjs` with a `#!` shebang; let
    // Node import it directly rather than Vite's transform (which trips on the shebang).
    server: { deps: { external: [/mobile[\\/]scripts[\\/].*\.mjs$/] } },
    include: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
    // worker/** is excluded so `npm test` at the repo root doesn't double-run
    // the worker test suite (which has its own `cd worker && npm test`).
    // `**/node_modules/**` (not just the top-level dir) so third-party test
    // files under nested installs (e.g. mobile/node_modules) aren't collected.
    // `.claude/worktrees/**` holds throwaway git worktrees (stale duplicate
    // test copies); excluding it stops them double-running + reporting stale
    // failures against the live tree.
    exclude: ['**/node_modules/**', '.next', 'worker/**', '.claude/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
