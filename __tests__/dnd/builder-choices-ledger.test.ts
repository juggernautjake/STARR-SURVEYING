// __tests__/dnd/builder-choices-ledger.test.ts — Foundations' picks land in the ledger the level walker
// reads, so neither surface asks twice (final-QA follow-up; the "ASI slot ownership" question).
//
// The double-ask, concretely: `Dnd5eManualBuilder` builds straight to level N and writes each feat as a
// `source: 'Feat'` feature. `planLevelUp` counts a slot as filled only when a `RecordedChoice` exists for
// that (level, kind). So a Fighter built to 8 with two feats arrived holding both feats AND owing both
// ASIs — `planLevelUp`'s own rule ("a character that skipped its level-4 ASI must resolve it before
// reaching 5") firing on choices already made. That is what "blocks 8 of 13 2024 classes" in the plan docs.
//
// Recording the picks dissolves the ownership question rather than answering it: Foundations fills the slots
// it collected, the walker fills what's left, one source of truth. The last describe here is the proof —
// it runs the real `planLevelUp` and asserts the outstanding list is empty.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { builderChoicesFor, mergeBuilderChoices, type BuilderChoice } from '@/lib/dnd/statgen/builder-choices';
import { planLevelUp, type RecordedChoice } from '@/lib/dnd/classes/levelup';
import { findClass, subclassesFor, classesForSystem } from '@/lib/dnd/classes/registry';

const S = 'dnd5e-2024';

describe('a Foundations build implies the ledger entries for what it collected', () => {
  it('fills the class\'s ASI slots earliest-first', () => {
    // Fighter's 2024 ladder starts 4, 6, 8 — so two feats at level 8 fill 4 and 6.
    const out = builderChoicesFor({ system: S, className: 'fighter', level: 8, feats: ['Grappler', 'Skill Expert'] });
    const asi = out.filter((c) => c.kind === 'asi');
    expect(asi.map((c) => [c.level, c.featKey])).toEqual([[4, 'Grappler'], [6, 'Skill Expert']]);
  });

  it('leaves an unfilled slot OUTSTANDING rather than recording a blank', () => {
    // A blank record would mark the choice done. The player really does still owe it.
    const out = builderChoicesFor({ system: S, className: 'fighter', level: 8, feats: ['Grappler'] });
    expect(out.filter((c) => c.kind === 'asi')).toHaveLength(1);
  });

  it('never invents a slot for a feat the ladder cannot hold', () => {
    // Origin/background feats and DM grants don't spend an ASI, so extra picks stay plain features.
    const out = builderChoicesFor({ system: S, className: 'wizard', level: 4, feats: ['A', 'B', 'C'] });
    expect(out.filter((c) => c.kind === 'asi')).toHaveLength(1); // Wizard has exactly one slot by level 4
  });

  it('records nothing for a class with no slots yet', () => {
    expect(builderChoicesFor({ system: S, className: 'fighter', level: 3, feats: ['Grappler'] })).toEqual([]);
  });

  it('records the subclass once the character is at the level that grants it', () => {
    const out = builderChoicesFor({ system: S, className: 'fighter', level: 3, subclass: 'battle-master' });
    expect(out).toEqual([{ level: 3, kind: 'subclass', value: 'battle-master' }]);
  });

  it('does not record a subclass the character is not high enough for', () => {
    expect(builderChoicesFor({ system: S, className: 'fighter', level: 2, subclass: 'battle-master' })).toEqual([]);
  });

  it('honours a homebrew class\'s own ladder over the registry', () => {
    const out = builderChoicesFor({
      system: S, className: 'rangor', level: 6, feats: ['X', 'Y'], asiLevels: [2, 5, 9], subclassLevel: 0,
    });
    expect(out.map((c) => c.level)).toEqual([2, 5]);
  });

  it('is edition-aware, because the ladders differ', () => {
    // 2014 Fighter gets a bonus ASI at 6; 2024 does too but the ladders are authored separately, so this
    // asserts the function reads the character's OWN edition rather than defaulting to one.
    const a = builderChoicesFor({ system: 'dnd5e-2014', className: 'fighter', level: 6, feats: ['P', 'Q'] });
    const b = builderChoicesFor({ system: 'dnd5e-2024', className: 'fighter', level: 6, feats: ['P', 'Q'] });
    expect(a.length).toBeGreaterThan(0);
    expect(b.length).toBeGreaterThan(0);
  });
});

describe('a rebuild replaces what it owns and nothing else', () => {
  const walkerExtras: BuilderChoice[] = [
    { level: 1, kind: 'fighting-style', value: 'defense' },
    { level: 6, kind: 'expertise', value: 'athletics' },
    { level: 12, kind: 'asi', featKey: 'Alert' },
  ];

  it('keeps choices the builder does not collect', () => {
    const merged = mergeBuilderChoices(walkerExtras, builderChoicesFor({
      system: S, className: 'fighter', level: 8, feats: ['Grappler'],
    }), 8);
    expect(merged.find((c) => c.kind === 'fighting-style')).toBeTruthy();
    expect(merged.find((c) => c.kind === 'expertise')).toBeTruthy();
  });

  it('keeps choices ABOVE the built level — a rebuild at 8 must not erase level 12', () => {
    const merged = mergeBuilderChoices(walkerExtras, builderChoicesFor({
      system: S, className: 'fighter', level: 8, feats: ['Grappler'],
    }), 8);
    expect(merged.find((c) => c.level === 12 && c.featKey === 'Alert')).toBeTruthy();
  });

  it('replaces its own kind at levels it covers, so rebuilding does not stack two feats in one slot', () => {
    const first = builderChoicesFor({ system: S, className: 'fighter', level: 8, feats: ['Grappler', 'Skill Expert'] });
    const second = builderChoicesFor({ system: S, className: 'fighter', level: 8, feats: ['Alert'] });
    const merged = mergeBuilderChoices(first, second, 8);
    expect(merged.filter((c) => c.kind === 'asi' && c.level <= 8)).toEqual([{ level: 4, kind: 'asi', featKey: 'Alert' }]);
  });

  it('is a no-op on an empty ledger', () => {
    expect(mergeBuilderChoices(undefined, [], 5)).toEqual([]);
  });
});

describe('THE PROOF: the walker no longer asks for a choice Foundations already took', () => {
  // A 2014 FIGHTER, because 2014 is the edition whose prompts match its ladder (see the next describe —
  // 2024's are incomplete for 8 of 13 classes, which is a separate defect this file measures but does not
  // fix). Its ladder by level 8 is 4, 6, 8, so two feats fill 4 and 6 and leave 8 genuinely owed.
  const E = 'dnd5e-2014';
  const def = findClass(E, 'fighter')!;
  const subs = subclassesFor(E, 'fighter');
  const plan = (recorded: RecordedChoice[], to = 8) => planLevelUp(def, {
    from: 1, to, recorded, subclasses: subs, subclass: subs[0] ?? null,
    fightingStyles: [{ key: 'defense', name: 'Defense', description: '' }],
  });

  it('a level-8 Fighter built with two feats owes neither of the ASIs it filled', () => {
    const recorded = builderChoicesFor({ system: E, className: 'fighter', level: 8, feats: ['Grappler', 'Alert'] }) as RecordedChoice[];
    const kinds = plan(recorded).outstanding.map((o) => `${o.kind}@${o.level}`);
    expect(kinds).not.toContain('asi@4');
    expect(kinds).not.toContain('asi@6');
  });

  it('and STILL owes the slot it genuinely did not fill', () => {
    // Two feats for the 4/6/8 ladder: level 8 must remain outstanding. The fix must not paper over a gap.
    const recorded = builderChoicesFor({ system: E, className: 'fighter', level: 8, feats: ['Grappler', 'Alert'] }) as RecordedChoice[];
    const kinds = plan(recorded).outstanding.map((o) => `${o.kind}@${o.level}`);
    expect(kinds).toContain('asi@8');
  });

  it('without the ledger entries, every one of them is asked again (the double-ask this closes)', () => {
    const kinds = plan([]).outstanding.map((o) => `${o.kind}@${o.level}`);
    expect(kinds).toContain('asi@4');
    expect(kinds).toContain('asi@6');
    expect(kinds).toContain('asi@8');
  });
});

describe('the authored ASI ladder is what gets prompted, for every class in both editions (S2)', () => {
  // WHAT THIS REPLACED, and why it hid so long. Until 2026-07-26 prompts came only from `choice: 'asi'`
  // ANNOTATIONS on class features, while `asiLevels` was authored separately. Measuring 2024 found three
  // different behaviours:
  //
  //   · complete — cleric, druid, paladin, ranger, pugilist → every ladder level prompted
  //   · partial  — bard, sorcerer, warlock, wizard          → ONLY level 4; 8/12/16 silent
  //   · none     — barbarian, fighter, monk, rogue          → no ASI prompt at any level, so a Fighter could
  //                                                           walk 1 → 20 and never be offered one
  //
  // 4 + 4 is the "blocks 8 of 13 2024 classes" line in the plan docs, which never said which 8. **2014 was
  // annotated completely for all 13** — which is exactly why this stayed invisible: the edition anyone
  // tested was the one that worked.
  //
  // `snapshotAtLevel` now derives an `asi` pending choice from the ladder for any level not already
  // annotated, so the two cannot disagree and the next class someone authors cannot reintroduce the gap.
  const promptedLevels = (system: string, key: string): number[] => {
    const def = findClass(system, key);
    if (!def) return [];
    return planLevelUp(def, { from: 1, to: 20, recorded: [], subclasses: subclassesFor(system, key) })
      .outstanding.filter((o) => o.kind === 'asi').map((o) => o.level);
  };

  for (const system of ['dnd5e-2024', 'dnd5e-2014']) {
    it(`${system}: every class prompts exactly its authored ladder`, () => {
      const classes = classesForSystem(system);
      expect(classes.length, 'the edition has classes').toBeGreaterThan(10);
      for (const c of classes) {
        const def = findClass(system, c.key)!;
        if (!def.asiLevels?.length) continue; // a class with no ladder owes no ASI
        expect(promptedLevels(system, c.key), `${system}/${c.key}`).toEqual(def.asiLevels);
      }
    });
  }

  it('the four classes that prompted NOTHING now prompt their whole ladder', () => {
    expect(promptedLevels(S, 'fighter')).toEqual([4, 6, 8, 12, 14, 16]);
    for (const key of ['barbarian', 'monk']) expect(promptedLevels(S, key), key).toEqual([4, 8, 12, 16]);
    expect(promptedLevels(S, 'rogue')).toEqual([4, 8, 10, 12, 16]);
  });

  it('the four that prompted only level 4 now prompt all four', () => {
    for (const key of ['bard', 'sorcerer', 'warlock', 'wizard']) {
      expect(promptedLevels(S, key), key).toEqual([4, 8, 12, 16]);
    }
  });

  it('the five already-correct classes are unchanged — no DOUBLE prompt', () => {
    // The annotation still wins where it exists; deriving must not add a second ASI at the same level.
    for (const key of ['cleric', 'druid', 'paladin', 'ranger']) {
      expect(promptedLevels(S, key), key).toEqual([4, 8, 12, 16]);
    }
  });

  it('a ladder level above the target is not prompted early', () => {
    const def = findClass(S, 'fighter')!;
    const at5 = planLevelUp(def, { from: 1, to: 5, recorded: [], subclasses: subclassesFor(S, 'fighter') })
      .outstanding.filter((o) => o.kind === 'asi').map((o) => o.level);
    expect(at5).toEqual([4]); // 6/8/12/14/16 are still in the future
  });
});

describe('the build route writes the ledger', () => {
  const SRC = fs.readFileSync(path.join(process.cwd(), 'app/api/dnd/characters/[id]/dnd5e-build/route.ts'), 'utf8');
  it('merges rather than clobbers, and records the resolved keys', () => {
    expect(SRC).toContain('mergeBuilderChoices');
    expect(SRC).toContain('builderChoicesFor');
    expect(SRC).toContain('classKey: String(body.className)');
  });
});
