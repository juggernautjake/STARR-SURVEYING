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
    // 20s rather than vitest's 5000ms default (2026-07-20). The suite is ~14k tests across
    // ~1000 files run in parallel, and the FIRST test in each file absorbs that file's module
    // import/init cost — measured at 1ms for later tests in a file but 1000ms+ for the first,
    // and far worse when many workers contend. Tests that are genuinely fast were therefore
    // failing intermittently on import cost alone: two identical whole-suite runs would
    // disagree, which is the worst possible state for a suite — intermittent red trains
    // everyone to ignore it, and real regressions hide in the noise.
    //
    // 20s still catches a genuinely hung test; it just stops load variance being reported as a
    // failure. Individually slow work declares its own longer timeout at the describe (see
    // __tests__/recon/phase12-export.test.ts, where PDF rendering really does take ~6s).
    testTimeout: 20_000,
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
