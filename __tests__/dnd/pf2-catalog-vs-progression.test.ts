// __tests__/dnd/pf2-catalog-vs-progression.test.ts — the PF2 builder catalog and the level progressions
// disagree about how many classes exist (final-QA walkthrough, slice 16).
//
// Driving the PF2 Foundations builder showed a class dropdown of **14**. Slice 7's probe had walked **20**
// class progressions, all of them producing complete, correct 20-level ladders. Six classes therefore have
// full level data and no way to be chosen.
//
// This is NOT the same defect as IG's Champion. Champion was OFFERED and then had an empty dropdown — a
// dead end in the player's face. These six are simply absent: nothing misleads anyone, they just cannot be
// built yet. So the fix is data, not code, and it is data I will not invent: a `PF2ClassDef` needs key
// attribute, HP per level, trained-skill count, fixed skills, initial proficiencies (perception, three
// saves, defense, attacks) and the subclass list — published Paizo rules for Player Core 2 / Secrets of
// Magic / Dark Archive / Rage of Elements. Ground Rule 3: authoring those from memory would produce sheets
// a player would trust and shouldn't.
//
// Documentation-as-test: it asserts the gap EXACTLY. Add a class's real data and this fails, and you
// update the list. Add a progression without catalog data and it fails too, which is the point.
import { describe, it, expect } from 'vitest';
import { PF2_CLASS_PROGRESSIONS } from '@/lib/dnd/systems/pathfinder2e/data';
import { PF2_CLASSES, pf2Class } from '@/lib/dnd/systems/pathfinder2e/content';
import { pf2LevelBreakdown } from '@/lib/dnd/systems/pathfinder2e/levelup';

const progressionNames = (PF2_CLASS_PROGRESSIONS as { className: string }[]).map((p) => p.className);
const catalogNames = PF2_CLASSES.map((c) => c.name);

describe('PF2: which classes can actually be built', () => {
  it('names the classes with level data but no builder entry', () => {
    // Magus and Summoner left this list on 2026-08-02, when the owner decided the catalogue means
    // ALL PUBLISHED rather than the Remaster core. The remaining four are the same situation and
    // the same one-entry fix — the ladders below prove it.
    const buildable = progressionNames.filter((n) => catalogNames.includes(n));
    const notBuildable = progressionNames.filter((n) => !catalogNames.includes(n)).sort();
    expect(buildable.length).toBe(16);
    expect(notBuildable).toEqual(['Investigator', 'Kineticist', 'Swashbuckler', 'Thaumaturge']);
  });

  it('every builder class has level data — the gap runs one way only', () => {
    // The reverse would be worse: a class you can pick and then cannot advance.
    for (const n of catalogNames) {
      expect(progressionNames, `${n} is offered by the builder but has no progression`).toContain(n);
    }
  });

  it('the unbuildable four still have COMPLETE ladders, so only the catalog entry is missing', () => {
    // Worth pinning: the expensive half of the work is already done and correct. Whoever adds a
    // `PF2ClassDef` gets a working class immediately — which is exactly how Magus and Summoner went
    // in on 2026-08-02. Two entries, no new machinery, and this test is the reason we knew that in
    // advance rather than discovering it mid-change.
    for (const n of ['Investigator', 'Kineticist', 'Swashbuckler', 'Thaumaturge']) {
      const steps = pf2LevelBreakdown(n, 20);
      expect(steps, `${n} ladder`).toHaveLength(20);
      expect(steps.some((s) => s.features.length > 0), `${n} has no features`).toBe(true);
      expect(pf2Class(n), `${n} should have no catalog entry yet`).toBeNull();
    }
  });

  it('a catalogued class resolves for the builder’s derived values', () => {
    const fighter = pf2Class('Fighter')!;
    expect(fighter.hpPerLevel).toBe(10);
    expect(fighter.keyAttribute).toEqual(['STR', 'DEX']);
    expect(fighter.initial.attacks).toBe('expert');   // the PF2 Fighter's signature: expert attacks at 1
  });

  it('an empty subclass list is legitimate, not a missing entry', () => {
    // The PF2 Fighter genuinely has no subclass — no Research Field, no Doctrine, no Order. A test that
    // demanded `subclassOptions.length > 0` for every class would be asserting a rule that isn't one.
    expect(pf2Class('Fighter')!.subclassOptions).toEqual([]);
    expect(pf2Class('Alchemist')!.subclassOptions.length).toBeGreaterThan(0);   // …but this one does
  });
});
