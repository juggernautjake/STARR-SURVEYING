// __tests__/dnd/classes-2024-audit.test.ts — the 2024 class chassis (S6 audit).
//
// Pins the mechanical facts that define each class, and in particular the 2024 CHANGE that a
// carried-over 2014 assumption most easily breaks: every class now chooses its subclass at
// level 3. In 2014 this varied — Cleric, Sorcerer and Warlock at 1; Wizard and Druid at 2 — so
// a sheet built on 2014 habits offers subclass choices at the wrong level entirely.
//
// SCOPE, honestly stated: hit die / primary ability / saving throws / subclass level are
// verifiable and pinned here. Per-level FEATURE text across 13 classes to level 20 is not
// verified against a source — see the doc's open risk. These facts were cross-checked against
// aidedd, whose English rules pages are the 2014 edition; that is sufficient for the fields
// 2024 did NOT change (hit dice and saves), and the subclass-level change is asserted from the
// 2024 ruleset directly.
import { describe, it, expect } from 'vitest';
import { classesForSystem } from '@/lib/dnd/classes/registry';

const CLASSES = classesForSystem('dnd5e-2024');

/** The 12 official classes and their chassis. Pugilist is the repo's own homebrew addition. */
const EXPECTED: Record<string, { hitDie: number; primary: string[]; saves: string[] }> = {
  Barbarian: { hitDie: 12, primary: ['str'], saves: ['str', 'con'] },
  Bard: { hitDie: 8, primary: ['cha'], saves: ['dex', 'cha'] },
  Cleric: { hitDie: 8, primary: ['wis'], saves: ['wis', 'cha'] },
  Druid: { hitDie: 8, primary: ['wis'], saves: ['int', 'wis'] },
  Fighter: { hitDie: 10, primary: ['str', 'dex'], saves: ['str', 'con'] },
  Monk: { hitDie: 8, primary: ['dex', 'wis'], saves: ['str', 'dex'] },
  Paladin: { hitDie: 10, primary: ['str', 'cha'], saves: ['wis', 'cha'] },
  Ranger: { hitDie: 10, primary: ['dex', 'wis'], saves: ['str', 'dex'] },
  Rogue: { hitDie: 8, primary: ['dex'], saves: ['dex', 'int'] },
  Sorcerer: { hitDie: 6, primary: ['cha'], saves: ['con', 'cha'] },
  Warlock: { hitDie: 8, primary: ['cha'], saves: ['wis', 'cha'] },
  Wizard: { hitDie: 6, primary: ['int'], saves: ['int', 'wis'] },
};

describe('the 2024 class roster', () => {
  it('has all twelve official classes', () => {
    const names = CLASSES.map((c) => c.name);
    for (const n of Object.keys(EXPECTED)) expect(names, n).toContain(n);
  });

  it('gives each class its correct chassis', () => {
    for (const [name, want] of Object.entries(EXPECTED)) {
      const c = CLASSES.find((x) => x.name === name)!;
      expect(c.hitDie, `${name} hit die`).toBe(want.hitDie);
      expect([...c.primaryAbility].sort(), `${name} primary`).toEqual([...want.primary].sort());
      expect([...c.savingThrows].sort(), `${name} saves`).toEqual([...want.saves].sort());
    }
  });
});

describe('the 2024 subclass-level change', () => {
  it('every class chooses its subclass at level 3', () => {
    // THE change to get wrong. 2014: Cleric/Sorcerer/Warlock at 1, Wizard/Druid at 2, the rest
    // at 3. 2024 unified all of them at 3, so a 2014 assumption offers the choice far too early
    // for exactly the classes a new player is most likely to pick.
    for (const c of CLASSES) {
      expect(c.subclassLevel, `${c.name} subclass level`).toBe(3);
    }
  });

  it('specifically fixes the classes 2014 gave an early subclass', () => {
    for (const n of ['Cleric', 'Sorcerer', 'Warlock', 'Wizard', 'Druid']) {
      expect(CLASSES.find((c) => c.name === n)?.subclassLevel, n).toBe(3);
    }
  });
});

describe('class progression reaches the top of the table', () => {
  it('every class has class features into the high teens', () => {
    // NOT "exactly 20": in 2024 several classes take their capstone from the SUBCLASS rather
    // than the base class — the Paladin is the clear case, with class features ending at 19
    // and level 20 coming from the Oath. Asserting 20 here would have failed correct data.
    for (const c of CLASSES) {
      const top = Math.max(...c.features.map((f) => f.level));
      expect(top, `${c.name} top class-feature level`).toBeGreaterThanOrEqual(19);
    }
  });

  it('grants ASIs at 4/8/12/16, with class extras on top', () => {
    // Level 19 is deliberately NOT here. 2024 gives an EPIC BOON at 19, and this repo models
    // that as a feature (see below) rather than a free ASI — which is the better reading, since
    // an Epic Boon is a specific feat category, not an ability bump. An earlier version of this
    // test asserted 19 and was wrong about the data, not the other way round.
    for (const c of CLASSES) {
      for (const lvl of [4, 8, 12, 16]) {
        expect(c.asiLevels, `${c.name} ASI at ${lvl}`).toContain(lvl);
      }
      expect(c.asiLevels, `${c.name} should not treat 19 as an ASI`).not.toContain(19);
    }
  });

  it('gives every class an Epic Boon at level 19', () => {
    // The 2024 capstone-feat rule, uniform across all classes.
    for (const c of CLASSES) {
      const boon = c.features.find((f) => f.level === 19 && /epic boon/i.test(f.name));
      expect(boon, `${c.name} Epic Boon at 19`).toBeDefined();
    }
  });

  it('names each subclass the way its own class does', () => {
    // "Divine Domain", "Primal Path" — calling them all "subclass" loses the system's voice,
    // and the label is what the level-up UI shows the player.
    for (const c of CLASSES) {
      expect((c.subclassLabel ?? '').length, `${c.name} subclass label`).toBeGreaterThan(0);
    }
  });
});
