// __tests__/dnd/roll-tone-degrees.test.ts — S9: a degrees roller must not contradict itself.
//
// THE BUG (found 2026-07-27 auditing the per-system roller maths at the owner's request: *"make sure the
// math is being done and displayed correctly for each dice roller and system"*). Both bespoke rollers —
// PF2 and IG, the two systems that use four-step degrees — seeded the banner tone from the NATURAL face and
// then let only the critical degrees override it:
//
//     let tone = r.critical ? 'crit' : r.fumble ? 'fumble' : 'normal';
//     if (r.degree === 'critical-success') tone = 'crit';
//     else if (r.degree === 'critical-failure') tone = 'fumble';
//
// That double-counts the die. `fourStepDegree` has ALREADY spent the natural 20/1 — it is what shifted the
// degree one step — so reading it a second time produces a banner that contradicts its own text. A natural
// 20 is not a critical success in PF2 or IG; it is one step better than you rolled.
//
// The arithmetic was never wrong. Only the presentation was, which is exactly the class of defect the
// request named, and the reason this file asserts the two together.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveD20Roll, rollTone, fourStepDegree } from '@/lib/dnd/roll';

const SYSTEMS = ['pathfinder2e', 'intuitive-games'] as const;

describe('the maths, which was already right — pinned so the fix cannot drift it', () => {
  it('four-step thresholds: +10 crits, meet succeeds, −10 crit-fails', () => {
    expect(fourStepDegree(30, 20)).toBe('critical-success');
    expect(fourStepDegree(20, 20)).toBe('success');
    expect(fourStepDegree(19, 20)).toBe('failure');
    expect(fourStepDegree(10, 20)).toBe('critical-failure');
  });

  it('a natural 20 improves by ONE step, and a natural 1 worsens by one', () => {
    expect(fourStepDegree(10, 20, 20)).toBe('failure');          // critical-failure, bumped once
    expect(fourStepDegree(19, 20, 20)).toBe('success');          // failure, bumped once
    expect(fourStepDegree(30, 20, 1)).toBe('success');           // critical-success, dropped once
    expect(fourStepDegree(20, 20, 1)).toBe('failure');           // success, dropped once
  });

  it('and the shift is clamped at both ends', () => {
    expect(fourStepDegree(30, 20, 20)).toBe('critical-success'); // already top
    expect(fourStepDegree(1, 20, 1)).toBe('critical-failure');   // already bottom
  });
});

describe('THE DEFECT — the banner used to contradict its own text', () => {
  for (const system of SYSTEMS) {
    it(`${system}: a natural 20 that is still a FAILURE is not toned as a crit`, () => {
      // +0 vs DC 35 → total 20, a critical failure bumped one step to Failure. The old code styled this
      // as a crit: the roller celebrating a miss.
      const r = resolveD20Roll({ natural: 20, modifier: 0, dc: 35, system });
      expect(r.degree).toBe('failure');
      expect(r.critical).toBe(true);          // the face IS a 20 — still reported, as "NAT 20"
      expect(rollTone(r)).toBe('normal');     // …but it does not decide the tone
    });

    it(`${system}: a natural 20 that yields a plain SUCCESS is not toned as a crit either`, () => {
      const r = resolveD20Roll({ natural: 20, modifier: 0, dc: 25, system });
      expect(r.degree).toBe('success');
      expect(rollTone(r)).toBe('normal');
    });

    it(`${system}: a natural 1 that is still a SUCCESS is not toned as a fumble`, () => {
      // +20 vs DC 5 → total 21, a critical success dropped one step to Success. The old code styled this
      // as a fumble: the roller mourning a hit.
      const r = resolveD20Roll({ natural: 1, modifier: 20, dc: 5, system });
      expect(r.degree).toBe('success');
      expect(r.fumble).toBe(true);
      expect(rollTone(r)).toBe('normal');
    });

    it(`${system}: the genuine critical degrees still tone`, () => {
      expect(rollTone(resolveD20Roll({ natural: 15, modifier: 20, dc: 20, system }))).toBe('crit');
      expect(rollTone(resolveD20Roll({ natural: 2, modifier: 0, dc: 20, system }))).toBe('fumble');
    });
  }
});

describe('outside a degrees system the natural face IS the answer', () => {
  it('5e with a DC tones by nat 20 / nat 1, because it has no degree', () => {
    const crit = resolveD20Roll({ natural: 20, modifier: 0, dc: 30, system: 'dnd5e-2024' });
    expect(crit.degree).toBeUndefined();
    expect(crit.success).toBe(false);   // 20 < 30 — 5e checks are meet-or-beat
    expect(rollTone(crit)).toBe('crit');
    expect(rollTone(resolveD20Roll({ natural: 1, modifier: 0, dc: 5, system: 'dnd5e-2024' }))).toBe('fumble');
  });

  it('and a degrees system with NO DC also falls back to the face', () => {
    // No target means no degree to read, so the die is all there is to report.
    const r = resolveD20Roll({ natural: 20, modifier: 3, system: 'pathfinder2e' });
    expect(r.degree).toBeUndefined();
    expect(rollTone(r)).toBe('crit');
  });
});

describe('both rollers read the shared decision, rather than repeating it', () => {
  // The identical wrong line in two files is what made this a pair of bugs instead of one. Asserting the
  // call site is the only way this stays a single rule.
  const PF2 = readFileSync(join(process.cwd(), 'app/dnd/_ui/pf2/usePf2Panels.tsx'), 'utf8');
  const IG = readFileSync(join(process.cwd(), 'app/dnd/_ui/ig/useIgPanels.tsx'), 'utf8');

  for (const [name, src] of [['PF2', PF2], ['IG', IG]] as const) {
    it(`${name} derives its banner tone from rollTone`, () => {
      expect(src).toContain('const tone = rollTone(r);');
      expect(src, 'the old seeded-from-the-face line came back').not.toMatch(/let tone[^=]*=\s*r\.critical \?/);
    });

    it(`${name}'s animated roller agrees with its banner`, () => {
      // Previously `crit: r.critical || r.degree === 'critical-success'` — the same double-count, so the
      // animation could celebrate while the text below it read "Failure".
      expect(src).toContain("crit: tone === 'crit',");
      expect(src).toContain("fumble: tone === 'fumble',");
    });
  }
});
