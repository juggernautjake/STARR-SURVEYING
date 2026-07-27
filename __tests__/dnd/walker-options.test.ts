// __tests__/dnd/walker-options.test.ts — the picker offers what the gate can refuse (slot plan S6g).
//
// THE BUG THIS PINS, in one sentence: an escape hatch only appears once the server refuses a pick, so a
// picker that offers exactly the set the server accepts makes its own hatch unreachable.
//
// S6f found that on the 5e walker. Auditing the other two for the same shape found it WORSE:
//   · PF2's `FeatInput` filtered on `f.level <= choice.level` — and the level floor is `pf2FeatEligibility`'s
//     FIRST refusal, so the most common PF2 refusal could not be reached from the walker at all.
//   · IG's `optionsFor` returned the plan's own subclass-scoped list — and "not a <subclass> power" is
//     `igPowerEligibility`'s ONLY refusal for powers, so IG's gate could never fire from the walker either.
// Both walkers had rendered "+ Take it anyway" since S6c/S6d. Neither could get to it.
//
// These are BEHAVIOURAL tests against the real catalog and the real eligibility cores, not greps. That is
// deliberate: every one of these defects survived a green suite whose tests asserted the gate EXISTED. The
// gates were all fine. What was wrong was what reached them.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pf2WalkerFeatOptions, igOtherSubclassOptions, MAX_OUT_OF_REACH } from '@/lib/dnd/slots/walker-options';
import { PF2_ALL_FEATS } from '@/lib/dnd/systems/pathfinder2e/data';
import { pf2FeatEligibility } from '@/lib/dnd/systems/pathfinder2e/eligibility';
import { igPowerEligibility } from '@/lib/dnd/systems/intuitive-games/eligibility';
import { IG_CLASS_DETAILS } from '@/lib/dnd/systems/intuitive-games/content';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const PF2_UI = read('app/dnd/_ui/PF2LevelBuilder.tsx');
const IG_UI = read('app/dnd/_ui/IGLevelBuilder.tsx');

// A class the catalog actually carries feats for, so these tests fail on a real regression rather than on
// an empty list. Fighter is one of the better-covered classes per PF2_CATALOG_STATUS.
const CLASS = 'Fighter';

describe('PF2: the level floor is SHOWN, not enforced by the picker', () => {
  it('offers higher-level class feats at a low-level slot', () => {
    const { legal, higher } = pf2WalkerFeatOptions('class', 2, CLASS);
    expect(legal.length).toBeGreaterThan(0);
    // The whole point: before S6g this list was empty by construction.
    expect(higher.length).toBeGreaterThan(0);
    expect(higher.every((f) => f.level > 2)).toBe(true);
  });

  it('and the gate really does refuse them — so the hatch is now reachable', () => {
    const { higher } = pf2WalkerFeatOptions('class', 2, CLASS);
    const target = higher[0];
    const def = PF2_ALL_FEATS.find((f) => f.name === target.name && f.level === target.level)!;
    const elig = pf2FeatEligibility(def, { className: CLASS, level: 2, featNames: [] });
    expect(elig.ok).toBe(false);
    expect(elig.reason ?? '').toMatch(/level-\d+ feat/);
  });

  it('everything in the LEGAL group passes the level check, so nothing is mislabelled', () => {
    // The mirror risk of S6f's War Caster bug: marking a legal pick as blocked would push the player
    // through the hatch and badge the character Altered vanilla for a legal choice.
    const { legal } = pf2WalkerFeatOptions('class', 6, CLASS);
    for (const name of legal) {
      const lowest = Math.min(...PF2_ALL_FEATS.filter((f) => f.name === name).map((f) => f.level));
      expect(lowest).toBeLessThanOrEqual(6);
    }
  });

  it('never puts one feat in BOTH groups', () => {
    // A feat that appears twice — once takeable, once "blocked" — would let a player file an exception
    // against a pick they can legally make. A wrong flag is worse than no flag (S6e).
    const { legal, higher } = pf2WalkerFeatOptions('class', 4, CLASS);
    const overlap = higher.map((f) => f.name).filter((n) => legal.includes(n));
    expect(overlap).toEqual([]);
  });

  it('keeps CLASS scoping as a filter, because that set is unbounded', () => {
    // The deliberate asymmetry. ~500 class feats exist; offering every other class's as refusals would be
    // a dropdown of 500 things you can't have. S6b already ruled on this for the PF2 content picker.
    const { legal, higher } = pf2WalkerFeatOptions('class', 20, CLASS);
    const offered = new Set([...legal, ...higher.map((f) => f.name)]);
    const foreign = PF2_ALL_FEATS.filter(
      (f) => f.track === 'class' && f.className && f.className.toLowerCase() !== CLASS.toLowerCase() && !offered.has(f.name),
    );
    expect(foreign.length).toBeGreaterThan(0);
    expect(offered.size).toBeLessThan(PF2_ALL_FEATS.filter((f) => f.track === 'class').length);
  });

  it('a level-20 slot has nothing left above it', () => {
    expect(pf2WalkerFeatOptions('class', 20, CLASS).higher).toEqual([]);
  });

  it('caps the out-of-reach group and SAYS how many it left out', () => {
    // The ancestry track is the one that hits the bound: the walker does not know the character's
    // ancestry, so it cannot narrow the list the way class feats narrow by class, and widening it took
    // the dropdown from 121 rows to 313. A cap is right; a SILENT cap is not — a truncated list that
    // says nothing reads as the whole catalog.
    const r = pf2WalkerFeatOptions('ancestry', 3, CLASS);
    expect(r.higher.length).toBeLessThanOrEqual(MAX_OUT_OF_REACH);
    expect(r.higherOmitted).toBeGreaterThan(0);
    expect(PF2_UI).toContain('higherOmitted');
    expect(PF2_UI).toContain('aren’t listed');
  });

  it('keeps the NEAREST levels when it caps, not an arbitrary slice', () => {
    const r = pf2WalkerFeatOptions('ancestry', 3, CLASS);
    const levels = r.higher.map((f) => f.level);
    expect(levels).toEqual([...levels].sort((a, b) => a - b));
    // Nothing kept may be further off than something dropped.
    expect(Math.max(...levels)).toBeLessThanOrEqual(20);
  });

  it('reports nothing omitted when the group fits', () => {
    expect(pf2WalkerFeatOptions('class', 2, CLASS).higherOmitted).toBe(0);
  });
});

describe('IG: other subclasses’ powers are offered, marked', () => {
  // A subclass with a real catalogued power list, taken from the data rather than hard-coded so this
  // follows the catalog if it grows.
  const withPowers = IG_CLASS_DETAILS.find((d) => (d.powers?.length ?? 0) > 0)!;

  it('offers powers beyond the subclass’s own list', () => {
    const others = igOtherSubclassOptions('subclass-power', withPowers.powers ?? []);
    expect(others.length).toBeGreaterThan(0);
  });

  it('and the gate refuses them — the hatch is reachable', () => {
    const others = igOtherSubclassOptions('subclass-power', withPowers.powers ?? []);
    const ctx = { subclass: withPowers.name, className: withPowers.name, level: 3, knownPowers: [] };
    // At least one offered power must actually be refused. Not all will be: IG power names overlap
    // heavily across subclasses, and a shared name IS legal here.
    const refused = others.filter((p) => !igPowerEligibility(p, ctx).ok);
    expect(refused.length).toBeGreaterThan(0);
    expect(igPowerEligibility(refused[0], ctx).reason ?? '').toContain('is not a');
  });

  it('never re-offers something already on the subclass’s own list', () => {
    // Two rows recording the same thing, one of them labelled "needs an exception", would be a trap.
    const mine = withPowers.powers ?? [];
    const others = igOtherSubclassOptions('subclass-power', mine);
    const mineKeys = new Set(mine.map((p) => p.trim().toLowerCase()));
    expect(others.filter((o) => mineKeys.has(o.trim().toLowerCase()))).toEqual([]);
  });

  it('dedupes specializations on the key the SERVER compares, not the raw string', () => {
    // Specializations are stored as prose with a parenthetical — "Dabbler (gain subclass powers from
    // other classes)". `igSpecializationEligibility` compares on the part before the paren, so two
    // printings of one specialization must not appear as two options.
    const spec = IG_CLASS_DETAILS.find((d) => (d.specializations?.length ?? 0) > 0)!;
    const others = igOtherSubclassOptions('specialization', spec.specializations ?? []);
    const keys = others.map((s) => s.split('(')[0].trim().toLowerCase());
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('is scoped to the two kinds the route actually gates', () => {
    // Widening a kind the server does not gate would offer an exception that is never recorded — the
    // limit S6 stated for the 5e hatch and S6c restated for IG.
    expect(igOtherSubclassOptions('feat-general', [])).toEqual([]);
    expect(igOtherSubclassOptions('capstone', [])).toEqual([]);
    expect(igOtherSubclassOptions('skill-proficiency', [])).toEqual([]);
    expect(igOtherSubclassOptions('trait', [])).toEqual([]);
  });
});

describe('the offered-but-illegal picks stay SELECTABLE in both walkers', () => {
  // The subtle wrong fix, and the reason this is pinned in both files. A `disabled` option greys the pick
  // correctly and STILL leaves "+ Take it anyway" unreachable — it would look like the bug was fixed while
  // the defect (an unreachable hatch) survived untouched.
  it('PF2 renders its out-of-reach group without disabling it', () => {
    const group = PF2_UI.slice(PF2_UI.indexOf('higher.length > 0'));
    const end = group.indexOf('</optgroup>');
    expect(end).toBeGreaterThan(0);
    expect(group.slice(0, end)).not.toContain('disabled');
  });

  it('IG renders its out-of-reach group without disabling it', () => {
    const group = IG_UI.slice(IG_UI.indexOf('others.length > 0'));
    const end = group.indexOf('</optgroup>');
    expect(end).toBeGreaterThan(0);
    expect(group.slice(0, end)).not.toContain('disabled');
  });

  it('neither walker has regrown the filter that caused this', () => {
    expect(PF2_UI).not.toContain('f.level <= choice.level');
    expect(PF2_UI).toContain('pf2WalkerFeatOptions');
    expect(IG_UI).toContain('igOtherSubclassOptions');
  });
});

describe('IG’s missing-data path is NOT rerouted through the hatch', () => {
  it('keeps free text for a subclass with no catalogued list', () => {
    // Champion has no entry in IG_CLASS_DETAILS, so its own powers are UNKNOWN — not exceptions. Offering
    // "every other subclass's powers, needs an exception" there would push a player to flag a legal pick
    // as altered vanilla to get past a gap in OUR data. Free text stays the answer for missing data.
    expect(IG_UI).toContain('Type your choice…');
    const emptyBranch = IG_UI.slice(IG_UI.indexOf('if (!opts.length)'));
    expect(emptyBranch.slice(0, emptyBranch.indexOf('return ('))).not.toContain('others');
  });
});
