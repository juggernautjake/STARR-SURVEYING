// __tests__/design/lopsided-capture.test.ts — C14g. A capture that is a fraction of its other
// viewport was taken too early, and five stored defaults were exactly that.
//
// ── WHY THIS IS PINNED AT ALL ───────────────────────────────────────────────────────────────────
//
// The guard was shipped after a live verification — `connection-uploads` went from 28 desktop
// elements to 283 — and a one-off demonstration is not a regression test. The specific things worth
// holding are the ones that were WRONG before anybody noticed:
//
//   · the check must run BEFORE the record is stored. Afterwards it is an observation about a bad
//     row that is already the locked default, which is the same shape as the dev-error guard.
//   · it must run at BOTH capture sites. All five bad records were per-STATE, and the state branch
//     is the one this plan has twice found running without a rule the route branch had.
//   · the threshold must stay generous. A page really does differ between 1440 and 390 — a table
//     becomes cards, a rail collapses — and a guard that fires on honest layout would re-capture
//     constantly and teach people to ignore it.
//
// These are source-level assertions because the tracer is a script, not a module: the same approach
// `dossier-per-state` and `dev-error-is-not-a-page` already take for this file.

import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { code } from '../helpers/source';

const TRACER = fs.readFileSync(path.join(process.cwd(), 'scripts/trace-defaults.mjs'), 'utf8');
const SRC = code(TRACER);

describe('a half-drawn capture is not a design', () => {
  it('re-takes the short viewport instead of storing it', () => {
    expect(SRC).toMatch(/async function recaptureIfLopsided\(captures, reopen, label\)/);
    // The better reading wins: this failure only ever makes a capture too SMALL, because nothing
    // renders extra elements by waiting.
    expect(SRC).toMatch(/if \(again\.length > before\)/);
  });

  it('runs at BOTH capture sites — the route and every state', () => {
    // All five lopsided records were per-state. The state branch has twice in this plan been found
    // missing a rule the route branch had: the dev-error guard, and the change report.
    expect(SRC.match(/await recaptureIfLopsided\(/g) ?? []).toHaveLength(2);
  });

  it('and runs BEFORE the record is written, not after', () => {
    // After the POST it is an observation about a row that is already the locked default.
    const stateBlock = SRC.slice(SRC.indexOf('const stateCaptures = {}'));
    const guardAt = stateBlock.indexOf('recaptureIfLopsided');
    const postAt = stateBlock.indexOf('/api/admin/design/import');
    expect(guardAt).toBeGreaterThan(-1);
    expect(postAt).toBeGreaterThan(-1);
    expect(guardAt).toBeLessThan(postAt);
  });

  it('uses the SHARED rule, not a copy of the threshold', () => {
    // The numbers were spelled out here — `hi < 10 || lo === 0 || hi / lo < 3` — and this test
    // pinned them. Then the studio needed the same rule for its `lopsided-default` gap, and a
    // second copy of a threshold is the shape this plan has spent a day removing: two definitions
    // that agree until somebody changes one. The record this tool refuses to store and the chip a
    // person sees must not be able to disagree about what "lopsided" means.
    expect(SRC).toMatch(/import \{[^}]*isLopsided[^}]*\} from '\.\.\/lib\/design\/lopsided\.ts'/);
    expect(SRC).toMatch(/if \(!isLopsided\(d, m\)\) return captures;/);
    // And the numbers must not creep back in beside it.
    expect(SRC).not.toMatch(/hi \/ lo < 3/);
  });

  it('and says so when a second reading is no better, rather than swallowing it', () => {
    // Then the asymmetry is real and belongs to the page. A guard that silently gives up leaves
    // somebody believing the tool handled it.
    expect(SRC).toMatch(/the difference looks real/);
  });
});
