// __tests__/dnd/feat-eligibility-2014.test.ts — a 2014 character is judged by 2014's feat rule.
//
// Slice 14-S6b (DND5E_2014_BUILDOUT_2026-07-21). The bug this pins is a SHAPE bug rather than a
// visible one: `feats/eligibility.ts` is 2024-typed by construction — origin / general /
// fighting-style / epic-boon TRACKS — and every gate above it called into that type for every
// system. 2014 has none of those tracks. Its whole rule is: *a feat is taken in place of an Ability
// Score Improvement, at the levels the character's class grants one.*
//
// The 2014 catalog holds exactly one feat (Grappler — all the SRD 5.1 contains), so the practical
// exposure through catalogued content is tiny. THE HOMEBREW CASE IS WHERE IT BITES, and it has its
// own section below: under 2024's shape an uncatalogued feat falls straight through the gate, so
// authoring one would have been a way to hand a level-3 2014 character a feat 2014 never grants.
//
// Everything here asserts BEHAVIOUR — verdicts and reasons — not source text, so it guards the fix
// rather than describing it (the lesson recorded in CX-17's resolution note).
import { describe, it, expect } from 'vitest';
import { featEligibilityForSystem, hasFeatGate, featEligibility } from '@/lib/dnd/feats/eligibility';
import { FEATS_2014 } from '@/lib/dnd/feats/dnd5e-2014';
import { findFeat } from '@/lib/dnd/feats/dnd5e-2024';
import { validateChoice } from '@/lib/dnd/classes/levelup';
import { gateEdits, type RulesGateContext } from '@/lib/dnd/rules-gate';
import { applySheetEdits, type SheetEdit } from '@/lib/dnd/sheet-edits';
import { classesForSystem } from '@/lib/dnd/classes/registry';
import type { Character } from '@/app/dnd/_sheet/types';

const D2014 = 'dnd5e-2014';
const D2024 = 'dnd5e-2024';
const STRONG = { str: 16, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };

/** A 2014 Wizard's ASI levels, read from the class data rather than retyped here — if the class
 *  table ever changes, this test follows it instead of pinning a stale copy. */
const WIZARD_ASI = classesForSystem(D2014).find((c) => c.key === 'wizard')!.asiLevels;

describe('2014 feats are gated by 2014’s schedule', () => {
  it('the catalog is the one feat the SRD contains, so the schedule is what does the work', () => {
    expect(FEATS_2014.map((f) => f.key)).toEqual(['grappler']);
    expect(WIZARD_ASI).toContain(4);
  });

  it('allows a catalogued feat at a level the class grants an ASI', () => {
    for (const level of WIZARD_ASI) {
      const v = featEligibilityForSystem(D2014, 'grappler', {
        slot: 'asi', level, className: 'Wizard', abilities: STRONG,
      });
      expect(v.ok, `level ${level} is an ASI level`).toBe(true);
      expect(v.name).toBe('Grappler');
    }
  });

  it('refuses it at a level that grants no ASI — there is nothing to trade for it', () => {
    const v = featEligibilityForSystem(D2014, 'grappler', {
      slot: 'asi', level: 3, className: 'Wizard', abilities: STRONG,
    });
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/Ability Score Improvement/);
    expect(v.reason).toMatch(/Level 3 is not one of them/);
  });

  it('reads the schedule from the CHARACTER’S OWN class, not a fixed table', () => {
    // A 2014 Fighter gains ASIs at 6 and 14 where a Wizard does not. Same feat, same level,
    // opposite verdicts — which is only possible if the class is actually being consulted.
    const at = (className: string, level: number) =>
      featEligibilityForSystem(D2014, 'grappler', { slot: 'asi', level, className, abilities: STRONG }).ok;
    expect(at('Fighter', 6)).toBe(true);
    expect(at('Wizard', 6)).toBe(false);
  });

  it('honours a caller-supplied schedule, so a homebrew class is not judged by a class it isn’t', () => {
    const v = featEligibilityForSystem(D2014, 'grappler', {
      slot: 'asi', level: 5, className: 'Bone Singer', asiLevels: [5, 10, 15], abilities: STRONG,
    });
    expect(v.ok).toBe(true);
  });

  it('skips the schedule check when the class cannot be resolved at all', () => {
    // Refusing on MISSING DATA would block a legal pick, and a player cannot work around a wrong
    // refusal. Permissive here, and the caller that knows better passes `asiLevels`.
    expect(featEligibilityForSystem(D2014, 'grappler', {
      slot: 'asi', level: 3, className: '', abilities: STRONG,
    }).ok).toBe(true);
  });

  it('still enforces the feat’s own prerequisite and non-repeatability', () => {
    const weak = featEligibilityForSystem(D2014, 'grappler', {
      slot: 'asi', level: 4, className: 'Wizard', abilities: { ...STRONG, str: 12 },
    });
    expect(weak.ok).toBe(false);
    expect(weak.reason).toMatch(/STR 13\+/);

    const again = featEligibilityForSystem(D2014, 'Grappler', {
      slot: 'asi', level: 8, className: 'Wizard', abilities: STRONG, takenFeatureNames: ['Grappler'],
    });
    expect(again.ok).toBe(false);
    expect(again.reason).toMatch(/already have Grappler/);
  });
});

describe('2014 is specifically NOT judged by 2024’s slot categories', () => {
  it('refuses the 2024-only slots with a 2014 reason, not a category reason', () => {
    for (const slot of ['origin', 'fighting-style'] as const) {
      const v = featEligibilityForSystem(D2014, 'grappler', {
        slot, level: 1, className: 'Wizard', abilities: STRONG,
      });
      expect(v.ok, `2014 has no ${slot} route`).toBe(false);
      // The refusal names 2014's actual rule. It must NOT read like 2024's category check, which
      // would be the tell that the wrong edition's shape is doing the judging.
      expect(v.reason).toMatch(/in place of an Ability Score Improvement/i);
      expect(v.reason).not.toMatch(/can't be taken through/);
    }
  });

  it('gives the SAME feat ref different reasons under each edition', () => {
    const ctx = { slot: 'origin' as const, level: 1, className: 'Wizard', abilities: STRONG };
    const r14 = featEligibilityForSystem(D2014, 'grappler', ctx);
    const r24 = featEligibilityForSystem(D2024, 'grappler', ctx);
    expect(r14.ok).toBe(false);
    expect(r24.ok).toBe(false);
    // 2024 refuses because Grappler is a GENERAL feat and an Origin slot grants Origin feats.
    expect(r24.reason).toMatch(/General feat/);
    expect(r14.reason).not.toEqual(r24.reason);
  });

  it('does not apply 2024’s level-19 Epic Boon tier to a 2014 sheet', () => {
    // 2014 classes grant an ASI at 19 and 2024 classes do not (19 is 2024's Epic Boon level), so a
    // 2014 character taking a feat at 19 is legal — and would be judged by an entirely different
    // rule if the 2024 gate were doing the work.
    expect(WIZARD_ASI).toContain(19);
    expect(featEligibilityForSystem(D2014, 'grappler', {
      slot: 'asi', level: 19, className: 'Wizard', abilities: STRONG,
    }).ok).toBe(true);
  });

  it('does not resolve 2024’s catalog for a 2014 character', () => {
    // Lucky is a 2024 ORIGIN feat and is not in the 2014 catalog. A 2014 character must not be
    // refused by 2024's origin rule for a feat their edition has never heard of — it is homebrew
    // to them, and homebrew is flagged by the caller, not blocked here.
    expect(findFeat('lucky')?.category).toBe('origin');
    expect(featEligibilityForSystem(D2014, 'lucky', {
      slot: 'asi', level: 4, className: 'Wizard', abilities: STRONG,
    }).ok).toBe(true);
    // The 2024 gate, unchanged, still refuses it at an ASI slot.
    expect(featEligibility(findFeat('lucky')!, { slot: 'asi', level: 4, abilities: STRONG }).ok).toBe(false);
  });
});

describe('the homebrew case — where the wrong shape would actually bite', () => {
  const HOMEBREW = 'stormwarden-adept'; // in no catalog, in any edition

  it('gates a homebrew 2014 feat by the ASI schedule, because that asks about the CHARACTER', () => {
    const early = featEligibilityForSystem(D2014, HOMEBREW, {
      slot: 'asi', level: 3, className: 'Wizard', abilities: STRONG,
    });
    expect(early.ok).toBe(false);
    expect(early.reason).toMatch(/Level 3 is not one of them/);
    // Named by the raw ref, since there is no catalogued name to report.
    expect(early.name).toBeUndefined();

    expect(featEligibilityForSystem(D2014, HOMEBREW, {
      slot: 'asi', level: 4, className: 'Wizard', abilities: STRONG,
    }).ok).toBe(true);
  });

  it('still refuses a homebrew feat through a slot 2014 does not have', () => {
    const v = featEligibilityForSystem(D2014, HOMEBREW, { slot: 'origin', level: 1, className: 'Wizard' });
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/in place of an Ability Score Improvement/i);
  });

  it('2024 lets the same homebrew ref through, and that asymmetry is deliberate', () => {
    // 2024's slot rule is a question about the feat's CATEGORY, and an uncatalogued feat has none —
    // there is nothing to check. 2014's is a question about the character's class, which is
    // knowable either way. Same escape hatch, different amount of it, for a real reason.
    expect(featEligibilityForSystem(D2024, HOMEBREW, { slot: 'origin', level: 3 }).ok).toBe(true);
  });
});

describe('the dispatcher itself', () => {
  it('owns both 5e editions and no other system', () => {
    expect(hasFeatGate(D2014)).toBe(true);
    expect(hasFeatGate(D2024)).toBe(true);
    for (const sys of ['pathfinder2e', 'intuitive-games', 'blorpwave']) {
      expect(hasFeatGate(sys), `${sys} owns its own gate`).toBe(false);
      // Falls THROUGH to that gate — it does not fail open here, it simply is not judged here.
      expect(featEligibilityForSystem(sys, 'alert', { slot: 'origin', level: 1 }).ok).toBe(true);
    }
  });
});

describe('the call sites are wired', () => {
  const base: RulesGateContext = {
    system: D2014, enforce: true, className: 'Wizard', level: 3, knownSpells: [],
    abilities: STRONG, featureNames: [], hasSpellcasting: true,
  };
  const addGrappler: SheetEdit = { op: 'add_feat', feat: 'Grappler' };

  it('rules-gate refuses a 2014 feat at a non-ASI level, and names it', () => {
    const r = gateEdits([addGrappler], base);
    expect(r.edits).toHaveLength(0);
    expect(r.refused[0]?.name).toBe('Grappler');
    expect(r.refused[0]?.reason).toMatch(/Ability Score Improvement/);
  });

  it('rules-gate allows it at an ASI level, and the apply actually writes it', () => {
    const r = gateEdits([addGrappler], { ...base, level: 4 });
    expect(r.refused).toHaveLength(0);
    expect(r.edits).toHaveLength(1);

    const blank = { features: [] } as unknown as Character;
    const next = applySheetEdits(blank, r.edits, { system: D2014 });
    const written = next.features.find((f) => f.name === 'Grappler');
    expect(written).toBeTruthy();
    // Bare "Feat" — 2014 has no track to label it with, and a 2024 word must not appear here.
    expect(written?.source).toBe('Feat');
    expect(written?.source).not.toMatch(/Origin|General|Epic Boon|Fighting Style/);
    expect(written?.body?.[0]).toBe(FEATS_2014[0]!.benefit);
  });

  it('rules-gate MARKS rather than refuses when the rules do not bind (DM grant)', () => {
    const r = gateEdits([addGrappler], { ...base, enforce: false, unboundReason: 'dm-grant' });
    expect(r.refused).toHaveLength(0);
    const marked = r.edits[0] as Extract<SheetEdit, { op: 'add_feat' }>;
    expect(marked.offRules).toMatch(/granted by the DM/);
  });

  it('the level-up validator judges a 2014 ASI-slot feat by 2014’s schedule', () => {
    const at = (level: number, featKey: string) =>
      validateChoice({ level, kind: 'asi', featKey }, {
        system: D2014, className: 'Wizard', abilities: { ...STRONG }, takenFeatKeys: [], has: [],
      });
    expect(at(4, 'grappler').ok).toBe(true);
    expect(at(3, 'grappler').ok).toBe(false);
    // And the homebrew case through the same door.
    expect(at(3, 'stormwarden-adept').ok).toBe(false);
    expect(at(4, 'stormwarden-adept').ok).toBe(true);
  });
});
