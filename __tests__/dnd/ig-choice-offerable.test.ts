// __tests__/dnd/ig-choice-offerable.test.ts — the IG half of "a demanded choice must be offerable"
// (final-QA walkthrough, slice 7).
//
// The 5e level walker had two choices it demanded but could not present (Fighting Style, Epic Boon). IG is
// mostly immune by design: `igPlanLevelUp` deliberately omits the big lists and `IGLevelBuilder.optionsFor`
// sources feats/skills/traits from the IG catalogs instead. But that fallback covers four kinds, and the
// planner can emit SEVEN without options — so three kinds fell through to an empty dropdown.
//
// In practice that is one subclass: **Champion** is listed in the taxonomy as a Fighter subclass but has no
// entry in `IG_CLASS_DETAILS`, so it has no powers or specializations to offer at levels 3/4/5/7/8/9.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { igPlanLevelUp } from '@/lib/dnd/systems/intuitive-games/levelup';
import { IG_CLASS_TAXONOMY } from '@/lib/dnd/systems/intuitive-games/taxonomy';
import { IG_CLASS_DETAILS } from '@/lib/dnd/systems/intuitive-games/content';

const SUBCLASSES = IG_CLASS_TAXONOMY.flatMap((t: { subclasses?: string[] }) => t.subclasses ?? []);
const detailNames = new Set(IG_CLASS_DETAILS.map((d) => d.name.toLowerCase()));

describe('the IG taxonomy and the IG catalog agree — or the UI admits they do not', () => {
  it('names the subclasses that have no catalog entry, so the gap is visible here and not to a player', () => {
    // Documentation-as-test. It asserted a known gap of exactly ['Champion'] until 2026-07-27, when
    // Champion's real data was captured from the published site and catalogued — so the gap is now EMPTY.
    // It keeps its second job: adding a NEW subclass to the taxonomy without catalog data fails here,
    // which is the point. The list is asserted rather than the count, so a swap cannot hide in a total.
    const missing = SUBCLASSES.filter((s) => !detailNames.has(s.toLowerCase())).sort();
    expect(missing).toEqual([]);
  });

  it('every OTHER subclass can offer every choice it demands', () => {
    const dead: string[] = [];
    for (const sub of SUBCLASSES.filter((s) => detailNames.has(s.toLowerCase()))) {
      for (const o of igPlanLevelUp({ subclass: sub, to: 10 }).outstanding) {
        // The kinds IGLevelBuilder.optionsFor fills from the catalogs; those legitimately arrive bare.
        if (['ability-boosts', 'trait', 'feat-general', 'feat-combat', 'skill-proficiency'].includes(o.kind)) continue;
        if (!o.options?.length) dead.push(`${sub}/${o.kind}@${o.level}`);
      }
    }
    expect(dead).toEqual([]);
  });
});

describe('a choice with no options is never a dead dropdown', () => {
  const SRC = readFileSync(join(process.cwd(), 'app/dnd/_ui/IGLevelBuilder.tsx'), 'utf8');

  it('PickOne falls back to a typed value plus an explanation', () => {
    // Not an empty <select>: an explanatory note and a free-text input, because the IG catalog is
    // transcribed from the published site and inventing the missing list would be worse than admitting it.
    expect(SRC).toMatch(/if \(!opts\.length\)/);
    expect(SRC).toContain('don’t have a catalogued list');
    expect(SRC).toMatch(/placeholder="Type your choice…"/);
  });

  it('the typed value still records like a picked one', () => {
    // Both branches call the same onPick with a trimmed non-empty string, which is all the walker needs
    // to consider the choice satisfied.
    expect(SRC.match(/onPick\(value\.trim\(\)\)/g)?.length).toBe(2);
  });
});
