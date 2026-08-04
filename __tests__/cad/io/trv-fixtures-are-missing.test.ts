// __tests__/cad/io/trv-fixtures-are-missing.test.ts
//
// CAD_AUDIT S16c — nineteen TRV assertions are written, and every one of them silently skips.
//
// ── WHAT THIS IS ABOUT ──────────────────────────────────────────────────────────────────────────
//
// The `.TRV` importer is covered by sixteen integration test files. Each gates its real assertions
// on `it.skipIf(!fs.existsSync(sample))`, and **the sample does not exist**: `fixtures/trv/` is not
// in this repository. Ten of the files fall back to an absolute path under `/root/.claude/uploads/`,
// an ephemeral session directory — on a Windows checkout it could never have resolved even when the
// files were there.
//
// So the suite reports these as *skipped*, which reads as "deliberately not run" rather than "the
// data was lost". Nothing fails. The green tick is honest about the tests it ran and says nothing
// about the nineteen it did not.
//
// ── WHY IT MATTERS BEYOND TIDINESS ──────────────────────────────────────────────────────────────
//
// This is the **golden instrument file** the audit doc records as owner-gated, made concrete. It is
// not a nice-to-have sample: nineteen assertions about real Traverse PC output — connectors,
// construction-hidden flags, derived round-trips, fill styling, line types, text elements, traverse
// groups, two-layer restructuring — are already written and waiting for it. The ask is not "please
// find us a file", it is "nineteen tests light up the moment one lands".
//
// The four referenced files are the firm's own work, so they may still exist off-repo:
//
//   GARLAND_KREUGER_WHITE_OWL_LANE_TEMPLE_26074_MAY_25_2026(.TRV, _1, _2)
//   SKP_PROPERTY_ADVISORS_TREMONT_ST_BELTON_26065_MAY_20_2026.TRV
//
// ── WHAT THIS TEST DOES ─────────────────────────────────────────────────────────────────────────
//
// It does not un-skip anything — no data is invented, and a fabricated `.TRV` would prove the parser
// agrees with itself rather than with Traverse PC. It makes the skip **countable**: a twentieth
// silently-skipping assertion fails this file, and so does the arrival of the fixture, which is the
// moment the audit doc needs updating.

import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..', '..');
const IO_DIR = join(__dirname);

/** Every TRV integration test file. */
const trvTests = readdirSync(IO_DIR)
  .filter((f) => f.startsWith('trv-') && f.endsWith('.test.ts'))
  // Excluding THIS file. It quotes the dead upload path in its own header, so it counted itself as
  // an offender on the first run — a scan that includes the scanner is the oldest instrument bug
  // there is, and it inflated the number by exactly one.
  .filter((f) => f !== 'trv-fixtures-are-missing.test.ts');

const sourceOf = (f: string) => readFileSync(join(IO_DIR, f), 'utf8');

/** Assertions and blocks gated on a fixture existing.
 *
 *  Both forms count. Four of these files skip a whole `describe`, which hides more tests per line
 *  than an `it.skipIf` does — counting only the latter would under-report exactly where the loss is
 *  largest. */
function skipGatedCount(): number {
  return trvTests.reduce(
    (n, f) => n + [...sourceOf(f).matchAll(/(?:it|describe)\.skipIf\(/g)].length,
    0,
  );
}

/** Files that fall back to the ephemeral upload directory from a past session. */
function filesWithDeadFallback(): string[] {
  return trvTests.filter((f) => sourceOf(f).includes('/root/.claude/uploads'));
}

describe('S16c — the TRV integration tests and their missing fixture', () => {
  it('found the TRV test files', () => {
    // Vacuous-pass guard: every count below is over this list.
    expect(trvTests.length).toBeGreaterThan(10);
  });

  it('states plainly that the fixture directory is absent', () => {
    // When this fails, the fixture has arrived — and that is the moment to re-run the suite, see
    // nineteen tests actually execute, and update CAD_AUDIT's "golden instrument file" entry. A
    // failure here is good news; it is written so it cannot pass unnoticed either way.
    const present = existsSync(join(ROOT, 'fixtures', 'trv'));
    expect(
      present,
      present
        ? 'fixtures/trv now exists. Run the TRV suite: the assertions below should stop skipping. ' +
          'Then delete this test and mark the golden instrument file DONE in CAD_AUDIT.'
        : undefined,
    ).toBe(false);
  });

  it('counts the assertions that skip, so a twentieth cannot appear quietly', () => {
    // The ratchet. Adding another `skipIf` without a fixture is adding a test that cannot fail,
    // which is worse than not adding one: it raises the test count and lowers the coverage.
    expect(
      skipGatedCount(),
      'The number of fixture-gated TRV assertions changed. If you added one, the fixture still does ' +
        'not exist and your test will never run — commit a real .TRV first, or say here why the ' +
        'count moved.',
    ).toBe(19); // 15 `it.skipIf` + 4 `describe.skipIf`, measured 2026-08-04
  });

  it('records the files pointing at an upload directory that no longer exists', () => {
    // `/root/.claude/uploads/...` is a Linux path in a repo checked out on Windows, so it could not
    // have resolved here even when those uploads existed. Recorded rather than deleted: the paths
    // are the only surviving evidence of WHICH real files these tests were written against, and the
    // firm may still have them.
    expect(filesWithDeadFallback().length).toBe(10);
  });
});
