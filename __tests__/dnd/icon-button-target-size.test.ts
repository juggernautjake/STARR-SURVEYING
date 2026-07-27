// __tests__/dnd/icon-button-target-size.test.ts — the icon-only controls that were measured too small
// keep their minimum target size.
//
// Slice 88, pinning slices 86–87. WCAG 2.5.8 (AA) puts the floor at 24×24 CSS px, with an exception for a
// target that has 24px of clear space around it. Measured at 360px on the three live sheets:
//
//     Perrin 5e    88 targets   16 under 24×24   0 failing  — all clear on spacing (33–35px)
//     Orin PF2     55 targets   11 under          4 failing — Dying/Wounded steppers, 19×18, 21px apart
//     Vashti IG   121 targets   13 under          2 failing — edit 18×19 and remove 12×13, 15px apart
//
// The IG ones were the worst: `Remove Toughness` and `Remove Weapon Focus` measured **9×13px**. A
// destructive control nine pixels wide, sitting beside a non-destructive one.
//
// WHY THIS FILE IS SCOPED TO TWO FILES AND NOT A BLANKET RULE. There are ~30 icon-only buttons across
// `app/dnd`, and asserting the minimum on all of them would fail for ones that are perfectly fine — many
// sit inside a padded `.btn` class and already exceed 24px, and the 5e sheet's 16 undersized targets are
// *conformant* via the spacing exception. Slice 85 is the precedent: a scan found 200+ column-less grids
// and fixing them all would have been speculative, because the one measured blowout was caused by its
// CONTENT, not by the pattern. So this guards the controls that were measured failing, in the files they
// live in, and says plainly that it is not a universal rule.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/** The two panel files whose icon buttons were measured below the floor and fixed. */
const FIXED = {
  'app/dnd/_ui/pf2/usePf2Panels.tsx': 6,
  'app/dnd/_ui/ig/useIgPanels.tsx': 7,
} as const;

describe('the measured-too-small icon buttons keep their floor', () => {
  for (const [file, count] of Object.entries(FIXED)) {
    it(`${file} declares the 24px minimum on all ${count}`, () => {
      const src = read(file);
      const found = src.split('minWidth: 24, minHeight: 24').length - 1;
      expect(found, `${file} should carry ${count} minimum-size declarations`).toBe(count);
    });
  }

  it('the PF2 dying/wounded steppers specifically — the ones tapped in the worst moment', () => {
    const src = read('app/dnd/_ui/pf2/usePf2Panels.tsx');
    for (const label of ['Increase dying', 'Decrease dying', 'Increase wounded', 'Decrease wounded']) {
      const i = src.indexOf(`aria-label="${label}"`);
      expect(i, `${label} button missing`).toBeGreaterThan(-1);
      // The style object follows on the same JSX element; take the rest of that line.
      const line = src.slice(i, src.indexOf('\n', i));
      expect(line, `${label} lost its minimum size`).toContain('minWidth: 24, minHeight: 24');
    }
  });

  it('the IG remove buttons — destructive, and the smallest measured at 9×13', () => {
    const src = read('app/dnd/_ui/ig/useIgPanels.tsx');
    // Line-based on purpose. An attribute-spanning regex (`[^>]*`) cannot work here: every one of these
    // carries an `onClick={() => …}` and the arrow's `>` ends the character class early. That is not
    // hypothetical — the first version of this test matched ZERO buttons, and the only reason it was
    // caught is the non-empty floor asserted below, which slice 75 added after a guard that could not
    // fail was found being cited as evidence.
    const removeLines = src.split('\n').filter((l) => /aria-label=\{`Remove /.test(l) && l.includes('>×</button>'));
    expect(removeLines.length, 'no remove buttons found — did the markup change?').toBeGreaterThanOrEqual(4);
    for (const line of removeLines) {
      expect(line, `a remove button lost its minimum size: ${line.trim().slice(0, 70)}`)
        .toContain('minWidth: 24, minHeight: 24');
    }
  });
});

describe('what is deliberately NOT asserted, and why', () => {
  it('the Tip badge stays 15×15 — conformant via spacing, and changing it is a design call', () => {
    // Slice 86 measured all 13 `?` badges at 33–35px clear of their nearest neighbour, so they pass.
    // Enlarging them would change every tooltip badge in the app: a decision, not a correction.
    expect(read('app/dnd/_ui/Tip.tsx')).toMatch(/width: 15, height: 15, borderRadius: '50%'/);
  });

  it('and no blanket rule is imposed on every icon button in app/dnd', () => {
    // Stated as an assertion so the choice is visible rather than an omission someone "fixes" later.
    // If a future slice MEASURES more of them failing, extend FIXED above rather than globbing.
    expect(Object.keys(FIXED)).toHaveLength(2);
  });
});
