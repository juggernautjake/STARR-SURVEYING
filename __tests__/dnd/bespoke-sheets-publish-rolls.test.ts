// __tests__/dnd/bespoke-sheets-publish-rolls.test.ts
//
// P14 follow-up — the Pathfinder 2e and Intuitive Games sheets publish their rolls to the table feed.
//
// ── WHY THIS IS STRUCTURAL AND NOT BEHAVIOURAL ──────────────────────────────────────────────────
//
// The bug this guards already happened: the 5e store called `publishRoll` and **the bespoke sheets
// never did**, so a Pathfinder player rolled, watched it animate, and nothing ever reached the
// campaign's Recent Rolls. The panel comments still describe it, in the past tense.
//
// The fix was shipped and — per the audit note in TABLETOP_AUDIT_REMEDIATION — **typechecked without
// ever being run**, because it cannot be exercised with the data that exists: publishing is
// (correctly) skipped for a character with no campaign, and the only PF2 character and the only IG
// character are both unattached. So the live system cannot reach this path at all, and the roll
// feed's own tests cover `rollPublishBody`, which is system-agnostic and would pass either way.
//
// That leaves a real gap with no natural instrument: the wiring itself. A `commitRoll` that stops
// calling `publishRoll`, or a panel that stops handing `commitRoll` to the provider, restores the
// original silent bug — nothing throws, nothing fails, rolls just quietly stop arriving. Reading
// source is a weak check, and it is also the only check available until a PF2 character joins a
// table. Weak and honest beats absent.
//
// This asserts three links per sheet, because breaking any one reproduces the bug:
//   1. the panel imports `publishRoll`
//   2. its `commitRoll` actually calls it, passing a campaign
//   3. `commitRoll` is handed to `RollFeedProvider`, or nothing ever invokes it

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const REPO = join(__dirname, '..', '..');

const SHEETS = [
  { system: 'Pathfinder 2e', file: 'app/dnd/_ui/pf2/usePf2Panels.tsx' },
  { system: 'Intuitive Games', file: 'app/dnd/_ui/ig/useIgPanels.tsx' },
];

describe('the bespoke sheets publish rolls to the campaign feed', () => {
  it('finds both panel files', () => {
    // Renaming a panel would otherwise empty this suite out silently, which is the same class of
    // failure it exists to catch.
    for (const { system, file } of SHEETS) {
      expect(existsSync(join(REPO, file)), `${system}: ${file} moved or was renamed`).toBe(true);
    }
  });

  for (const { system, file } of SHEETS) {
    describe(system, () => {
      const src = readFileSync(join(REPO, file), 'utf8');

      it('imports publishRoll', () => {
        expect(
          /import\s*\{[^}]*publishRoll[^}]*\}\s*from\s*'@\/lib\/dnd\/roll-publish'/.test(src),
          `${file} no longer imports publishRoll — rolls cannot reach the feed`,
        ).toBe(true);
      });

      it('calls publishRoll from commitRoll, with a campaign', () => {
        // `publishRoll` returns void and swallows its own failures by design, so a call that is
        // never made is indistinguishable at runtime from one that succeeded.
        const commit = src.match(/const commitRoll = useCallback\(([\s\S]{0,600}?)\n {2}\}, \[/);
        expect(commit, `${file}: commitRoll is gone or no longer a useCallback`).toBeTruthy();

        const body = commit![1];
        expect(body, `${file}: commitRoll no longer calls publishRoll — this is the original bug`)
          .toContain('publishRoll(');
        expect(body, `${file}: publishRoll called without campaignId — rollPublishBody returns null`)
          .toContain('campaignId');
      });

      it('hands commitRoll to the roll feed provider', () => {
        // Defined but never passed = defined but never called. The panel would compile, the sheet
        // would render, and the feed would stay empty.
        expect(
          /<RollFeedProvider[\s\S]{0,200}?commitRoll/.test(src),
          `${file}: commitRoll is not given to RollFeedProvider, so nothing invokes it`,
        ).toBe(true);
      });
    });
  }

  it('still skips publishing when there is no campaign', () => {
    // The other half of the rule, and the reason the live data cannot exercise any of the above: a
    // roll with no table is not a feed event. Asserted here so a future "fix" for the untestability
    // does not simply remove the guard and start posting orphan rolls.
    for (const { system, file } of SHEETS) {
      const src = readFileSync(join(REPO, file), 'utf8');
      const commit = src.match(/const commitRoll = useCallback\(([\s\S]{0,600}?)\n {2}\}, \[/);
      expect(commit![1], `${system}: commitRoll no longer bails when there is no campaign`)
        .toMatch(/if\s*\(!campaignId\)\s*return/);
    }
  });
});
