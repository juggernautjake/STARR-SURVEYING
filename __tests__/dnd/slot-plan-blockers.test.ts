// __tests__/dnd/slot-plan-blockers.test.ts — the slot plan's remaining blockers, verified not asserted.
//
// WHY THIS FILE EXISTS. Three items in `SLOT_DRIVEN_CHARACTER_BUILDING` are recorded as blocked on external
// data. That was taken on trust for most of this session — and when the same trust was finally tested on
// S7c it turned out to be **half wrong and hiding a live bug** (a built Magus carried a full caster's spell
// slots while its own rules reported a ceiling of 0). The doc's sibling warns at its top that its claims go
// stale; this applies that warning to the three that remain.
//
// All three verify. The point is that they are now verified, and that each assertion **flips** the day the
// data arrives — so the blocker announces its own resolution instead of waiting to be re-read.
import { describe, it, expect } from 'vitest';
import { IG_CLASS_DETAILS } from '@/lib/dnd/systems/intuitive-games/content';
import { IG_CLASS_TAXONOMY } from '@/lib/dnd/systems/intuitive-games/taxonomy';
import { igFeatBudget } from '@/lib/dnd/systems/intuitive-games/builder-choices';
import { PREF_SHARED_ENGINE_ONLY, prefAppliesToSystem } from '@/lib/dnd/preference-options';

describe('S10 — IG Champion has no catalogued powers (blocked on the published source)', () => {
  const champion = IG_CLASS_DETAILS.find((d) => d.name.toLowerCase() === 'champion');

  it('is still absent from IG_CLASS_DETAILS', () => {
    // WHEN THIS FAILS, S10 is unblocked: the data arrived, so fill in the picker and close the item.
    expect(champion).toBeUndefined();
  });

  it('but IS selectable, which is why the gap needed handling rather than ignoring', () => {
    // A subclass a player can choose while the catalog knows nothing about it. The builder handles this
    // with free text (pinned by `walker-picker-render.test.tsx`) rather than an empty dropdown.
    expect(JSON.stringify(IG_CLASS_TAXONOMY).toLowerCase()).toContain('champion');
  });

  it('and inventing its list is the thing the codebase refuses', () => {
    // The IG catalog is SCRAPED from intuitivegames.net. Every other subclass with powers has them from
    // the site; a hand-written Champion list would be indistinguishable in the data and wrong in play.
    const withPowers = IG_CLASS_DETAILS.filter((d) => (d.powers?.length ?? 0) > 0);
    expect(withPowers.length).toBeGreaterThan(0);
    expect(withPowers.some((d) => d.name.toLowerCase() === 'champion')).toBe(false);
  });
});

describe('Q6 — the IG level-1 feat allowance is a guess, and errs permissive', () => {
  it('grants exactly one feat at level 1, above whatever the schedule gives', () => {
    // The site's schedule starts at level 2 and describes level 1 as including "starting feats" WITHOUT a
    // number. `igFeatBudget` adds 1. If the real answer is 0 or 2, this is the one line that changes.
    const atOne = igFeatBudget('Freebooter', 1);
    expect(atOne).toBe(1);
  });

  it('and the guess is permissive rather than restrictive, which is the safe direction', () => {
    // A cap one too generous still bounds the list; one too tight blocks a legal build. The budget must
    // never be 0 at level 1, or a legal starting feat would be refused outright.
    for (const sub of ['Freebooter', 'Marksman', 'Arcanist']) {
      expect(igFeatBudget(sub, 1)).toBeGreaterThan(0);
    }
  });

  it('the level-1 allowance is the ONLY unsourced number — level 2+ comes from the schedule', () => {
    // One feat per level from 2 up, so each level adds exactly one to the budget. If that ever stops
    // holding, the schedule changed and Q6 is no longer the only open number.
    const a = igFeatBudget('Freebooter', 2);
    const b = igFeatBudget('Freebooter', 3);
    expect(b - a).toBe(1);
  });
});

describe('S9 — the dice-roller BUG half is closed; only the feature question (Q4) remains', () => {
  it('both settings are shared-engine only', () => {
    expect(PREF_SHARED_ENGINE_ONLY).toContain('diceRollerStyle');
    expect(PREF_SHARED_ENGINE_ONLY).toContain('recordMode');
  });

  it('so a PF2 or IG player is not offered a control that would do nothing', () => {
    // The defect S9 originally described — two settings that silently did nothing on the bespoke sheets.
    for (const field of ['diceRollerStyle', 'recordMode'] as const) {
      expect(prefAppliesToSystem(field, 'pathfinder2e')).toBe(false);
      expect(prefAppliesToSystem(field, 'intuitive-games')).toBe(false);
    }
  });

  it('while the shared-engine systems still get them', () => {
    for (const field of ['diceRollerStyle', 'recordMode'] as const) {
      expect(prefAppliesToSystem(field, 'dnd5e-2024')).toBe(true);
      expect(prefAppliesToSystem(field, 'dnd5e-2014')).toBe(true);
    }
  });

  it('and an unknown system fails OPEN, so an ambiguous character is not shown an empty modal', () => {
    expect(prefAppliesToSystem('diceRollerStyle', undefined)).toBe(true);
  });
});
