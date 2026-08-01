// __tests__/dnd/roller-history-collapse.test.ts — history starts collapsed on a short window (D7-4).
//
// The enumeration here is the point. D7-2 found a fourth roll log its own guard had not listed; D7-3 found
// a fourth stage whose token three stylesheets read and one did not. Both were the same shape of mistake:
// a change applied to three of four call sites, with nothing to notice the fourth. All four rollers
// declared `useState(true)` on their own line, so this slice was that mistake waiting to happen again.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HISTORY_COLLAPSE_BELOW_PX } from '@/app/dnd/_sheet/components/rollers/useHistoryOpen';
import { ROLLER_IDEAL_H, rollerSize } from '@/app/dnd/_sheet/lib/floating';

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');

/** Every roller that renders a roll history. The same four `roller-history-cap.test.ts` enumerates. */
const ROLLERS = [
  { name: 'Dice Core', file: 'app/dnd/_sheet/components/DiceTray.tsx' },
  { name: 'Sigil Stack', file: 'app/dnd/_sheet/components/rollers/SigilStack.tsx' },
  { name: 'Roll Board', file: 'app/dnd/_sheet/components/rollers/RollBoard.tsx' },
  { name: 'Impact', file: 'app/dnd/_sheet/components/rollers/ImpactRoller.tsx' },
];

describe('all four rollers share ONE history-open rule', () => {
  it.each(ROLLERS)('$name uses the hook', ({ file }) => {
    const src = read(file);
    expect(src).toMatch(/const \[histOpen, setHistOpen\] = useHistoryOpen\(\)/);
    expect(src).toMatch(/import \{ useHistoryOpen \}/);
  });

  it('and none of them still hard-codes the old default', () => {
    // The line this slice replaced. If it reappears anywhere, one roller has drifted back.
    for (const { name, file } of ROLLERS) {
      expect(read(file), `${name} must not re-declare histOpen`).not.toMatch(/useState\(true\)[^\n]*histOpen|histOpen[^\n]*useState\(true\)/);
    }
  });
});

describe('the threshold is derived from what the content needs, not picked', () => {
  it('sits above the measured content minimum, so it only fires when history could not be read anyway', () => {
    // Content needs 508–575 with both scrollers at their floor (D7-5). Below ~640 the history could only
    // ever be a 48px sliver, and a collapsed section with a visible header beats a slot too small to read
    // one entry in.
    expect(HISTORY_COLLAPSE_BELOW_PX).toBeGreaterThan(575);
    expect(HISTORY_COLLAPSE_BELOW_PX).toBeLessThan(ROLLER_IDEAL_H);
  });

  it('fires on a 360×640 phone — the case D7-3 could not close', () => {
    const TOP = 70; // FALLBACK_TOP + EDGE, what safeTop returns with no document
    expect(rollerSize(360, 640, TOP).h).toBeLessThan(HISTORY_COLLAPSE_BELOW_PX);
  });

  it('does NOT fire on a desktop, where everything fits with history open', () => {
    const TOP = 70;
    expect(rollerSize(1440, 900, TOP).h).toBeGreaterThanOrEqual(HISTORY_COLLAPSE_BELOW_PX);
    expect(rollerSize(1920, 1080, TOP).h).toBeGreaterThanOrEqual(HISTORY_COLLAPSE_BELOW_PX);
  });
});

describe('the hook cannot fight the player', () => {
  const src = read('app/dnd/_sheet/components/rollers/useHistoryOpen.ts');

  it('starts OPEN, so the server and the client agree on first paint', () => {
    // `useState(() => window.innerHeight < X)` is the obvious version and cannot work: `window` does not
    // exist during the server render, and initialising from it produces a hydration mismatch.
    expect(src).toMatch(/useState\(true\)/);
  });

  it('collapses on mount only — never on resize', () => {
    // A rule that re-collapsed whenever the window was short would close the history the player had just
    // deliberately opened, on every rotation. Correct on paper, infuriating in the hand.
    const effect = src.match(/useEffect\(\(\) => \{[\s\S]*?\}, \[\]\)/);
    expect(effect, 'the effect must have an EMPTY dependency array').not.toBeNull();
    expect(src).not.toMatch(/addEventListener\(['"]resize/);
  });

  it('asks about the WINDOW, not the viewport', () => {
    // `rollerSize` already folds in the viewport, the header inset and the edge margin, so this asks the
    // question that matters — "is the box the roller lives in too small" — rather than inferring it.
    //
    // Comments are stripped before asserting. The first version of this test read the whole file and
    // failed on the hook's own note explaining why `window.innerHeight` is the WRONG signal — a guard
    // tripping over the prose that documents it. Assert against code.
    const code = src
      .split('\n')
      .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
      .join('\n');
    expect(code).toMatch(/currentRollerSize\(\)\.h/);
    expect(code).not.toMatch(/window\.innerHeight\s*</);
  });
});
