// __tests__/every-export-is-imported.test.ts
//
// Sibling of `every-import-is-declared.test.ts`, asking the opposite question. That one catches an
// import with nothing behind it; this one catches code with nothing in front of it.
//
// ── WHY THE SECOND DIRECTION MATTERS MORE ───────────────────────────────────────────────────────
//
// A broken import fails loudly at build time. An orphaned module fails at nothing: it typechecks,
// it lints, it passes its own unit tests, and it reads exactly like code that runs. On 2026-08-27 I
// rebuilt `AddWidgetModal` — search, categories, tests, the lot — before opening a browser and
// finding that nothing mounts it. The wiring tests I had written asserted the modal imported the new
// modules; none asked whether anything imported the modal.
//
// The planning doc records the same shape at larger scale: `prioritized-pipeline.ts` and
// `.service.ts`, 764 lines between them, neither imported, and nobody can now say which was real.
//
// A count, not an allowlist — see the script. It stops the next one arriving by accident without
// pretending to know what the existing 62 are.

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

describe('no new orphaned modules', () => {
  it('every module that exports something is imported by something', () => {
    let output = '';
    let failed = false;
    try {
      output = execFileSync(
        process.execPath,
        [join(process.cwd(), 'scripts/find-orphaned-modules.mjs')],
        { encoding: 'utf8', cwd: process.cwd() },
      );
    } catch (e) {
      failed = true;
      const err = e as { stdout?: string; stderr?: string };
      output = (err.stdout ?? '') + (err.stderr ?? '');
    }

    // The ratio is printed on every run precisely so a broken scanner is visible rather than silent.
    // If it ever reads 90%, the instrument is what changed.
    expect(output, 'the scanner should report what it scanned').toMatch(/scanned \d+ modules/);
    expect(failed, output).toBe(false);
  });
});
