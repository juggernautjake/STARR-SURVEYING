// __tests__/dnd/companions-2014.test.ts — familiars, steeds, beast companions and Wild Shape for 5e 2014
// (P5-5, audit C-7).
//
// 2014 had no companion module, so a 2014 character asking "what can my familiar do" got either silence
// or — through a UI that did not check the edition — 2024's answer.
//
// WHAT THESE TESTS ARE REALLY FOR: proving the 2024 list was not copied. That is the obvious shortcut and
// it is wrong in exactly the places a player looks the rule up for. The differences are asserted
// explicitly below, against BOTH modules at once, so a future "tidy these into one file" fails here.
import { describe, it, expect } from 'vitest';
import {
  COMPANION_RULE_SETS_2014, COMPANION_STATBLOCK_STATUS_2014, companionsForClass2014,
  FIND_FAMILIAR_RULES_2014, RANGERS_COMPANION_RULES_2014, WILD_SHAPE_RULES_2014,
} from '@/lib/dnd/companions/dnd5e-2014';
import { COMPANION_RULE_SETS } from '@/lib/dnd/companions/dnd5e-2024';
import { companionSetsFor, companionsForClass } from '@/lib/dnd/companions';
import { findSpell2014 } from '@/lib/dnd/spells/dnd5e-2014';
import { RANGER_SUBCLASSES_2014 } from '@/lib/dnd/classes/dnd5e-2014/ranger';
import { systemRulesEntries } from '@/lib/dnd/system-rules-entries';
import { termIndexFor } from '@/lib/dnd/term-index';

describe('every rule is derived from 2014 text already in the repo', () => {
  it('the familiar’s rule IS the 2014 Find Familiar summary', () => {
    expect(FIND_FAMILIAR_RULES_2014.rules[0]).toBe(findSpell2014('find-familiar')!.summary);
    expect(FIND_FAMILIAR_RULES_2014.classes).toEqual(findSpell2014('find-familiar')!.classes);
  });

  it('the Beast Master’s rules ARE its four subclass features, at their own levels', () => {
    const bm = RANGER_SUBCLASSES_2014.find((s) => s.key === 'beast-master')!;
    expect(RANGERS_COMPANION_RULES_2014.rules).toHaveLength(bm.features.length);
    // 3/7/11/15 — and reading them off the subclass is what keeps them there. These levels are the single
    // most likely 2014/2024 confusion in this whole area.
    expect(RANGERS_COMPANION_RULES_2014.rules.map((r) => r.match(/level (\d+)/)![1])).toEqual(['3', '7', '11', '15']);
  });

  it('and markdown emphasis is stripped, because these go into a grounding payload', () => {
    // The class bodies are written for a sheet. `**four times your Ranger level**` in an AI prompt or a
    // search index is noise at best.
    for (const set of COMPANION_RULE_SETS_2014) {
      for (const r of set.rules) {
        expect(r, set.name).not.toContain('**');
        expect(r, set.name).not.toContain('\n');
      }
    }
  });

  it('every set has rules and a source — an empty one would silently describe a companion with nothing', () => {
    for (const set of COMPANION_RULE_SETS_2014) {
      expect(set.rules.length, set.name).toBeGreaterThan(0);
      expect(set.source, set.name).toBeTruthy();
    }
  });
});

describe('THE 2024 LIST WAS NOT REUSED', () => {
  it('no rule string is shared between the two editions', () => {
    const rules2024 = new Set(COMPANION_RULE_SETS.flatMap((c) => c.rules));
    for (const r of COMPANION_RULE_SETS_2014.flatMap((c) => c.rules)) {
      expect(rules2024.has(r), r.slice(0, 60)).toBe(false);
    }
  });

  it('and the differences that matter are actually present', () => {
    // 2024 made touch-spell delivery a Reaction; 2014's familiar uses its reaction only in the 2024 text.
    const f2024 = COMPANION_RULE_SETS.find((c) => c.kind === 'familiar')!;
    expect(f2024.rules.join(' ')).toMatch(/reaction/i);
    expect(FIND_FAMILIAR_RULES_2014.rules.join(' ')).not.toMatch(/reaction/i);

    // 2024 Wild Shape is a Bonus Action granting temporary hit points; 2014 replaces your statistics.
    const w2024 = COMPANION_RULE_SETS.find((c) => c.kind === 'wild-shape')!;
    expect(w2024.rules.join(' ')).toMatch(/temporary hit points/i);
    expect(WILD_SHAPE_RULES_2014.rules.join(' ')).toMatch(/replaced by the beast/i);
  });

  it('2014 has a STEED and 2024’s primal companion has forms — the shapes genuinely differ', () => {
    expect(COMPANION_RULE_SETS_2014.map((c) => c.kind).sort())
      .toEqual(['familiar', 'primal-companion', 'steed', 'wild-shape']);
    // The Beast Master is a beast of CR 1/4 or lower; 2024 replaced it with three fixed shapes.
    expect(RANGERS_COMPANION_RULES_2014.rules.join(' ')).toMatch(/challenge rating of 1\/4/);
  });
});

describe('the coverage statement admits the one thing 2014 cannot have', () => {
  it('form lists are NOT complete, and the reason is the rules’ own', () => {
    // 2024 enumerates familiar forms and the three Primal Companion shapes. 2014 defines both by a
    // CONSTRAINT — "any beast of CR 1/4 or lower" — so any list here would be a choice made by the file
    // rather than by the book.
    expect(COMPANION_STATBLOCK_STATUS_2014.formListsComplete).toBe(false);
    expect(COMPANION_STATBLOCK_STATUS_2014.note).toMatch(/constraint/i);
    expect(COMPANION_STATBLOCK_STATUS_2014.statblocksComplete).toBe(false);
  });
});

describe('per-class access', () => {
  it('a 2014 Wizard gets a familiar, a Paladin a steed, a Ranger a companion, a Druid Wild Shape', () => {
    expect(companionsForClass2014('Wizard').map((c) => c.kind)).toEqual(['familiar']);
    expect(companionsForClass2014('Paladin').map((c) => c.kind)).toEqual(['steed']);
    expect(companionsForClass2014('Ranger').map((c) => c.kind)).toEqual(['primal-companion']);
    expect(companionsForClass2014('Druid').map((c) => c.kind)).toEqual(['wild-shape']);
  });

  it('and a Fighter gets nothing', () => {
    expect(companionsForClass2014('Fighter')).toEqual([]);
    expect(companionsForClass('dnd5e-2014', 'Fighter')).toEqual([]);
    expect(companionsForClass('dnd5e-2014', '')).toEqual([]);
  });
});

describe('one dispatch, three callers', () => {
  it('companionSetsFor knows 2014 now', () => {
    expect(companionSetsFor('dnd5e-2014')).toBe(COMPANION_RULE_SETS_2014);
  });

  it('the rules store projects them', () => {
    const entries = systemRulesEntries('dnd5e-2014');
    const names = entries.map((e) => e.name);
    expect(names.some((n) => n.startsWith('Familiar ('))).toBe(true);
    expect(names.some((n) => n.startsWith('Steed ('))).toBe(true);
    expect(names.some((n) => n.startsWith("Ranger's Companion ("))).toBe(true);
  });

  it('the term index links them', () => {
    const terms = termIndexFor('dnd5e-2014').filter((t) => t.kind === 'companion');
    expect(terms.map((t) => t.term).sort()).toEqual(['Familiar', "Ranger's Companion", 'Steed', 'Wild Shape']);
    for (const t of terms) expect(t.short.length, t.term).toBeGreaterThan(10);
  });

  it('and 2024 kept all four of its own', () => {
    expect(termIndexFor('dnd5e-2024').filter((t) => t.kind === 'companion').length).toBe(COMPANION_RULE_SETS.length);
  });

  it('a system with none catalogued gets none from any of the three', () => {
    expect(companionSetsFor('starfinder1e')).toEqual([]);
    expect(termIndexFor('starfinder1e').filter((t) => t.kind === 'companion')).toEqual([]);
  });
});
