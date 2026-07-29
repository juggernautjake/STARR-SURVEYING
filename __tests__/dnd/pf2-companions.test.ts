// __tests__/dnd/pf2-companions.test.ts — PF2 animal companions and familiars (P5-4, audit C-7).
//
// Companions existed for 5e 2024 and Intuitive Games only. PF2 has more companion content than either and
// none of it was reachable as anything but individual feat rows.
//
// The thing these tests actually guard is the DERIVATION. Every rule string in the module is the `effect`
// of a feat already catalogued with its own book attribution — nothing is authored — and that is checked
// in both directions here, because a hand-written companion rule looks exactly as plausible as a correct
// one and there is no way to tell them apart six months later.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  PF2_ANIMAL_COMPANION_STEPS, PF2_FAMILIAR_STEPS, PF2_COMPANION_RULE_SETS, PF2_COMPANION_STATUS,
  PF2_ANIMAL_COMPANION_CLASSES, PF2_FAMILIAR_CLASSES,
  pf2AnimalCompanionLadder, pf2FamiliarFeats, pf2CompanionsForClass,
} from '@/lib/dnd/companions/pathfinder2e';
import { PF2_FEATS_CLASS_ARCHETYPE } from '@/lib/dnd/systems/pathfinder2e/data/feats-class';
import { companionSetsFor } from '@/lib/dnd/companions';
import { systemRulesEntries } from '@/lib/dnd/system-rules-entries';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('every rule comes from a catalogued feat — nothing is authored here', () => {
  const featEffects = new Map(PF2_FEATS_CLASS_ARCHETYPE.map((f) => [`${f.name}|${f.className ?? ''}`, f.effect]));

  it('each step’s text is its feat’s own effect, character for character', () => {
    for (const s of [...PF2_ANIMAL_COMPANION_STEPS, ...PF2_FAMILIAR_STEPS]) {
      expect(featEffects.get(`${s.feat}|${s.className}`), `${s.className} ${s.feat}`).toBe(s.effect);
    }
  });

  it('and each carries the feat’s own source, not a source chosen here', () => {
    const sources = new Map(PF2_FEATS_CLASS_ARCHETYPE.map((f) => [`${f.name}|${f.className ?? ''}`, f.source]));
    for (const s of [...PF2_ANIMAL_COMPANION_STEPS, ...PF2_FAMILIAR_STEPS]) {
      expect(s.source).toBe(sources.get(`${s.feat}|${s.className}`));
    }
  });

  it('the module contains no prose rule of its own', () => {
    // The strongest version of the check: the file must not carry a sentence describing how a companion
    // works outside a comment. If a future edit adds one, it belongs in `feats-class.ts` with a book.
    const src = read('lib/dnd/companions/pathfinder2e.ts');
    const codeOnly = src.split(/\r?\n/).filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/*'));
    // `rules:` is only ever built by `rulesFrom(...)`, never a literal array of strings.
    expect(codeOnly.join('\n')).not.toMatch(/rules:\s*\[\s*'/);
    expect(codeOnly.join('\n')).toMatch(/rules: rulesFrom\(/);
  });
});

describe('the ladder', () => {
  it('climbs 1 → 4 → 8 for a Druid', () => {
    const ladder = pf2AnimalCompanionLadder('Druid');
    expect(ladder.map((s) => [s.level, s.feat])).toEqual([
      [1, 'Animal Companion'],
      [4, 'Mature Animal Companion'],
      [8, 'Incredible Companion'],
    ]);
  });

  it('is ordered by the feats’ OWN levels, not by a list written here', () => {
    const levels = PF2_ANIMAL_COMPANION_STEPS.map((s) => s.level);
    expect([...levels].sort((a, b) => a - b)).toEqual(levels);
  });

  it('and the classes are derived from who actually has the level-1 feat', () => {
    expect(PF2_ANIMAL_COMPANION_CLASSES).toEqual(['Druid', 'Ranger']);
    expect(PF2_FAMILIAR_CLASSES).toEqual(['Alchemist', 'Druid', 'Sorcerer', 'Wizard']);
  });

  it('a class with no companion gets NOTHING, not the generic ladder', () => {
    // "Every class has the same ladder" is exactly the plausible default that becomes a rules error on a
    // sheet — a Fighter shown an animal companion they cannot take.
    expect(pf2AnimalCompanionLadder('Fighter')).toEqual([]);
    expect(pf2FamiliarFeats('Barbarian')).toEqual([]);
    expect(pf2CompanionsForClass('Fighter')).toEqual([]);
    expect(pf2CompanionsForClass('')).toEqual([]);
  });

  it('and lookup is case-insensitive, since callers pass whatever the sheet stored', () => {
    expect(pf2AnimalCompanionLadder('druid')).toHaveLength(3);
    expect(pf2CompanionsForClass('WIZARD').map((c) => c.kind)).toEqual(['familiar']);
  });

  it('a Druid gets BOTH kinds — the only class that does', () => {
    expect(pf2CompanionsForClass('Druid').map((c) => c.kind).sort()).toEqual(['familiar', 'primal-companion']);
  });
});

describe('the coverage statement is honest, and derivation is what made it so', () => {
  it('the ladder is NOT claimed complete, because Specialized Companion has no feat row', () => {
    // The rules have a fourth rung around level 14. There is no feat for it in `feats-class.ts`, so there
    // is none here. An AUTHORED ladder would have listed four rungs from memory and looked finished —
    // deriving it is the only reason this gap is visible at all.
    expect(PF2_COMPANION_STATUS.laddersComplete).toBe(false);
    expect(PF2_COMPANION_STATUS.ladderTopRung).toMatch(/Incredible Companion/);
    expect(PF2_ANIMAL_COMPANION_STEPS.some((s) => s.feat === 'Specialized Companion')).toBe(false);
  });

  it('and names each thing it does not carry', () => {
    expect(PF2_COMPANION_STATUS.animalTypesCatalogued).toBe(false);
    expect(PF2_COMPANION_STATUS.familiarAbilitiesCatalogued).toBe(false);
    expect(PF2_COMPANION_STATUS.eidolonCatalogued).toBe(false);
    expect(PF2_COMPANION_STATUS.note).toMatch(/eidolon/i);
  });
});

describe('IT IS WIRED — the repeated defect of this audit is working code with no door', () => {
  it('grounding no longer answers "companion" for 2024 only', () => {
    // The dispatch moved to `companions/index.ts` in P5-5, once a third caller wanted it. That is the
    // point of asserting behaviour where it can: `companionSetsFor` is imported here rather than pinned
    // by source, so this test follows the code instead of the file it happened to live in.
    expect(read('lib/dnd/grounding.ts')).toContain("companionSetsFor(system)");
    expect(companionSetsFor('pathfinder2e')).toBe(PF2_COMPANION_RULE_SETS);
    // And it must never fall back to another system's sets — answering a PF2 question with 5e's familiar
    // rules is worse than answering nothing.
    expect(companionSetsFor('starfinder1e')).toEqual([]);
    expect(companionSetsFor('')).toEqual([]);
  });

  it('the query matches the RUNGS, not just the set name', () => {
    // All four rungs live under one set called "Animal Companion", so "how does my companion mature" has
    // to reach the level-4 rung through the rule text or it finds nothing useful.
    expect(read('lib/dnd/grounding.ts')).toContain('${c.rules.join(\' \')}`.toLowerCase()');
  });

  it('and the rules store projects them for pathfinder2e', () => {
    const entries = systemRulesEntries('pathfinder2e');
    const companion = entries.filter((e) => /Animal Companion|Familiar/.test(e.name));
    expect(companion.length).toBeGreaterThan(0);
    expect(companion[0].body).toMatch(/Available to:/);
  });

  it('and 2024’s entries are untouched by the new branch', () => {
    const entries = systemRulesEntries('dnd5e-2024');
    expect(entries.some((e) => e.name.startsWith('Familiar ('))).toBe(true);
  });

  it('a system with no catalogued companions still gets none', () => {
    // 2014 gained its own sets in P5-5, so it is no longer the example here. Intuitive Games has a
    // companion model of its own with a different shape and is deliberately not adapted into this one.
    expect(companionSetsFor('intuitive-games')).toEqual([]);
    expect(systemRulesEntries('intuitive-games').some((e) => e.name.includes('Companion ('))).toBe(false);
  });

  it('and PF2’s ladders never leak into another system’s entries', () => {
    // The failure this guards is not "nothing appears" but "the WRONG thing appears" — a 2014 player
    // reading Pathfinder's Incredible Companion would have no way to know it was not theirs.
    for (const sys of ['dnd5e-2014', 'dnd5e-2024'] as const) {
      const bodies = systemRulesEntries(sys).map((e) => e.body).join('\n');
      expect(bodies, sys).not.toMatch(/Incredible Companion/);
    }
  });
});
