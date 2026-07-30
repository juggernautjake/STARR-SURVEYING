// __tests__/dnd/dice-pad-parity.test.ts — every system offers the same dice (D2-3, D6-2).
//
// THE BUG THIS CAUGHT. `DicePad` (the manual roller on the PF2 and IG sheets) carried its own literal die
// list, `[4, 6, 8, 12, 20, 100]`. The 5e Dice Core carries `[4, 6, 8, 10, 12, 20, 100]`. So a PF2 or IG
// player could not roll a **d10** while a 5e player could — even though `solidFor(10)` has always drawn a
// real pentagonal trapezohedron and `STANDARD_DICE` has always listed it.
//
// That is exactly the class of defect Phase D6 exists to prevent: *parity across systems, difference where
// it belongs*. Which dice exist is not a system mechanic — d10s are not a 5e concept — so a difference here
// is drift between two hand-maintained lists, not a feature. The fix was to stop maintaining two lists.
//
// This guard reads the SOURCE FILES rather than importing the components, because the components are React
// and this suite runs under `environment: 'node'` with no DOM. Reading the source is also the stricter test:
// it fails if someone reintroduces a literal, not merely if the rendered output differs.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { STANDARD_DICE } from '@/lib/dnd/dice/solids';

const ROOT = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const DICE_PAD = 'app/dnd/_sheet/components/rollers/DicePad.tsx';
const DICE_TRAY = 'app/dnd/_sheet/components/DiceTray.tsx';

/** Source with comments removed. Without this the scanner below matches the very comment that EXPLAINS the
 *  old literal — which it did on first run, reporting the fixed file as still broken. A guard that reads
 *  code must read code. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

/** The die list written as an array literal in a source file, if there is one. */
function literalDieList(source: string): number[] | null {
  const src = stripComments(source);
  // A run of comma-separated numbers starting 4,6,8 — specific enough not to match a spacing scale or an
  // rgb triple.
  const m = src.match(/\[\s*4\s*,\s*6\s*,\s*8\s*,[\d\s,]*\]/);
  if (!m) return null;
  return m[0]
    .replace(/[[\]\s]/g, '')
    .split(',')
    .filter(Boolean)
    .map(Number);
}

describe('the canonical die list', () => {
  it('includes every standard polyhedral die, d10 among them', () => {
    expect([...STANDARD_DICE]).toEqual([4, 6, 8, 10, 12, 20, 100]);
  });

  it('every die in it can actually be drawn', async () => {
    const { solidFor } = await import('@/lib/dnd/dice/solids');
    for (const n of STANDARD_DICE) {
      const s = solidFor(n);
      expect(s.faces.length, `d${n} has no faces`).toBeGreaterThan(0);
      expect(s.pips.length, `d${n} has faces but no numerals`).toBe(s.faces.length);
    }
  });
});

describe('DicePad — the PF2 / IG manual roller', () => {
  it('takes its dice from STANDARD_DICE rather than a literal of its own', () => {
    const src = read(DICE_PAD);
    expect(src).toMatch(/STANDARD_DICE/);
    expect(
      literalDieList(src),
      'DicePad has a hand-written die list again. Which dice exist is a property of the dice — import ' +
        'STANDARD_DICE from lib/dnd/dice/solids so PF2 and IG cannot silently drift from 5e again.',
    ).toBeNull();
  });

  it('therefore offers the d10 that PF2 and IG players could not previously roll', () => {
    // The regression stated as the user-visible fact rather than as an implementation detail: if someone
    // reintroduces a list without 10, the assertion above fires and this one records what was lost.
    expect([...STANDARD_DICE]).toContain(10);
  });
});

/**
 * EVERY roller, not just the two that had the bug.
 *
 * The first version of this file asserted that the 5e tray's LITERAL still equalled the constant — a
 * deliberately temporary guard, written "until the tray is migrated to the shared constant too". It was
 * measuring the wrong thing in a way that mattered: five files carried the same seven numbers (the four
 * roller panels plus DicePad), and a guard comparing two of them left three unwatched.
 *
 * D6-2 is "one stage, one look". Which dice exist is not a system mechanic and not a template's identity —
 * a Roll Board offers the same dice as a Sigil Stack — so there should be ONE list, and the assertion is
 * now that nobody has a list of their own.
 */
const ROLLERS = [
  ['DicePad (PF2 / IG manual pad)', DICE_PAD],
  ['DiceTray (5e Dice Core)', DICE_TRAY],
  ['ImpactRoller', 'app/dnd/_sheet/components/rollers/ImpactRoller.tsx'],
  ['RollBoard', 'app/dnd/_sheet/components/rollers/RollBoard.tsx'],
  ['SigilStack', 'app/dnd/_sheet/components/rollers/SigilStack.tsx'],
] as const;

describe('every roller takes its dice from the one canonical list', () => {
  for (const [label, file] of ROLLERS) {
    it(`${label} imports STANDARD_DICE`, () => {
      expect(read(file)).toMatch(/STANDARD_DICE/);
    });

    it(`${label} declares no die list of its own`, () => {
      expect(
        literalDieList(read(file)),
        `${label} has a hand-written die list again. Which dice exist is a property of the dice — import ` +
          'STANDARD_DICE from lib/dnd/dice/solids so the rollers cannot silently drift apart.',
      ).toBeNull();
    });
  }

  it('so adding or removing a die is one edit, in the module that draws them', () => {
    // The point of the migration stated as the property it buys. Five literals meant five edits and no
    // signal when one was missed — which is exactly how DicePad lost the d10.
    for (const [, file] of ROLLERS) expect(literalDieList(read(file))).toBeNull();
    expect([...STANDARD_DICE]).toContain(10);
  });
});
