// __tests__/dnd/ig-builder-slots.test.ts — IG Foundations picks are bounded by the scraped schedule (S5).
//
// IG was the worst of the three builders the owner reported: flat `Chips` over the ENTIRE catalog — every
// stance, power, feat and weapon type — with an unbounded toggle and no notion of level, while
// `IG_LEVEL_SCHEDULE` (scraped verbatim from Brendan's site) says exactly what each level grants.
//
// The one number here that is NOT from the site is the level-1 feat allowance: the schedule starts at level
// 2, and level 1 is described as including "starting feats" without a count. We allow exactly one and err
// PERMISSIVE, because a cap one too generous still bounds the list while a cap one too tight blocks a legal
// build. That single assumption is called out in the module header and in the plan doc's open questions.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  igSlots, igFeatBudget, igPowerBudget, igBuilderChoicesFor, mergeIgBuilderChoices,
} from '@/lib/dnd/systems/intuitive-games/builder-choices';
import { igPlanLevelUp, type IGRecordedChoice } from '@/lib/dnd/systems/intuitive-games/levelup';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const SUB = 'Freebooter'; // a fully-catalogued Fighter subclass

describe('the scraped schedule defines the budgets', () => {
  it('a level-2 character cannot hold ten feats', () => {
    // The owner's exact example. Level 2 grants one General feat; +1 for the level-1 allowance.
    expect(igFeatBudget(SUB, 2)).toBe(2);
  });

  it('budgets grow with level, one feat per level', () => {
    expect(igFeatBudget(SUB, 5)).toBe(igFeatBudget(SUB, 4) + 1);
    expect(igFeatBudget(SUB, 10)).toBe(10); // levels 2..10 grant nine, plus the level-1 allowance
  });

  it('powers follow the site exactly: one at level 1, then the schedule', () => {
    // "Subclass — choose one at level 1, granting a single class power of your choice."
    expect(igPowerBudget(SUB, 1)).toBe(1);
    expect(igPowerBudget(SUB, 2)).toBe(1);   // level 2 grants a trait + defensive power + feat, no power
    expect(igPowerBudget(SUB, 3)).toBe(2);   // level 3 grants a subclass power
    // …and the level-6 UNIQUE power is not counted, because `PLAYER_CHOICE` doesn't include it: it is
    // granted, not chosen. (My first expectation here said 4 and was wrong about the schedule, not the code.)
    expect(igPowerBudget(SUB, 6)).toBe(3);   // the chosen powers at 3 and 5, plus level 1
  });

  it('no subclass chosen yet → no schedule to enforce', () => {
    expect(igSlots(undefined, 5)).toEqual([]);
  });

  it('only PLAYER-CHOICE gains become slots — automatic grants are not choices', () => {
    // Improved stances and the manifestation are granted, not chosen; they must never appear as slots.
    const kinds = new Set(igSlots(SUB, 10).map((s) => s.kind));
    expect(kinds.has('improved-stances')).toBe(false);
    expect(kinds.has('manifestation')).toBe(false);
    expect(kinds.has('feat-general')).toBe(true);
  });
});

describe('picks are attributed to the level that granted them', () => {
  it('fills feat slots earliest-first, keeping the general/combat kind', () => {
    const out = igBuilderChoicesFor({ subclass: SUB, level: 4, feats: ['Level 1 Feat', 'A', 'B', 'C'] });
    const feats = out.filter((c) => c.kind === 'feat-general' || c.kind === 'feat-combat');
    expect(feats.map((f) => [f.level, f.kind, f.value])).toEqual([
      [2, 'feat-general', 'A'],
      [3, 'feat-combat', 'B'],
      [4, 'feat-general', 'C'],
    ]);
  });

  it('leaves the level-1 pick UNRECORDED rather than filing it against level 2', () => {
    // The schedule starts at 2. Claiming a level-2 choice was made when it wasn't would tell the walker to
    // stop asking for it.
    const out = igBuilderChoicesFor({ subclass: SUB, level: 3, feats: ['Only One'] });
    expect(out.filter((c) => c.kind.startsWith('feat'))).toEqual([]);
  });

  it('records the specialization at the level that grants it', () => {
    const out = igBuilderChoicesFor({ subclass: SUB, level: 6, specialization: 'Virtuoso' });
    expect(out.find((c) => c.kind === 'specialization')).toMatchObject({ level: 4, value: 'Virtuoso' });
  });

  it('does not record a specialization the character is too low for', () => {
    expect(igBuilderChoicesFor({ subclass: SUB, level: 3, specialization: 'Virtuoso' })).toEqual([]);
  });

  it('never invents a slot for more picks than the schedule grants', () => {
    const many = Array.from({ length: 20 }, (_, i) => `Feat ${i}`);
    const out = igBuilderChoicesFor({ subclass: SUB, level: 3, feats: many });
    expect(out.filter((c) => c.kind.startsWith('feat')).length).toBe(2); // levels 2 and 3
  });
});

describe('the walker stops re-asking for what Foundations already chose', () => {
  const owedFeats = (recorded: IGRecordedChoice[], to = 4) =>
    igPlanLevelUp({ subclass: SUB, to, recorded }).outstanding.filter((o) => o.kind.startsWith('feat')).length;

  it('a full build owes no feat prompts', () => {
    const recorded = igBuilderChoicesFor({ subclass: SUB, level: 4, feats: ['L1', 'A', 'B', 'C'] });
    expect(owedFeats(recorded)).toBe(0);
  });

  it('a partial build owes exactly what is missing', () => {
    const recorded = igBuilderChoicesFor({ subclass: SUB, level: 4, feats: ['L1', 'A'] });
    expect(owedFeats(recorded)).toBe(2);
  });

  it('without the ledger every one is asked again (the bug)', () => {
    expect(owedFeats([])).toBe(3); // levels 2, 3, 4
  });
});

describe('a rebuild replaces what it owns and nothing else', () => {
  it('keeps ability boosts and traits, which Foundations does not collect', () => {
    const existing: IGRecordedChoice[] = [
      { level: 3, kind: 'ability-boosts', attributes: ['STR', 'DEX'] },
      { level: 2, kind: 'trait', value: 'Some Trait' },
    ];
    const merged = mergeIgBuilderChoices(existing, igBuilderChoicesFor({
      subclass: SUB, level: 4, feats: ['L1', 'A'],
    }), 4);
    expect(merged.find((c) => c.kind === 'ability-boosts')).toBeTruthy();
    expect(merged.find((c) => c.kind === 'trait')).toBeTruthy();
  });

  it('keeps choices above the built level', () => {
    const existing: IGRecordedChoice[] = [{ level: 7, kind: 'feat-combat', value: 'Later' }];
    const merged = mergeIgBuilderChoices(existing, igBuilderChoicesFor({
      subclass: SUB, level: 4, feats: ['L1', 'A'],
    }), 4);
    expect(merged.find((c) => c.level === 7)).toBeTruthy();
  });
});

describe('the surfaces are wired', () => {
  it('the chips enforce a budget and say why', () => {
    const ui = read('app/dnd/_ui/IGCharacterBuilder.tsx');
    expect(ui).toContain('budget != null && !active && sel.length >= budget');
    expect(ui).toContain('igFeatBudget');
    expect(ui).toContain('igPowerBudget');
  });

  it('stances and weapon types stay UNCAPPED, deliberately', () => {
    // The schedule grants a stance via the background and improves stances at 5 — there is no per-level
    // number to enforce, and inventing one would be worse than none.
    const ui = read('app/dnd/_ui/IGCharacterBuilder.tsx');
    const stances = ui.slice(ui.indexOf('const stancesBlock'), ui.indexOf('const powersBlock'));
    expect(stances).not.toContain('budget=');
  });

  it('the build route records the ledger', () => {
    const route = read('app/api/dnd/characters/[id]/ig-build/route.ts');
    expect(route).toContain('igBuilderChoicesFor');
    expect(route).toContain('mergeIgBuilderChoices');
  });
});
