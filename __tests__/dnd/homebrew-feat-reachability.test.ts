// __tests__/dnd/homebrew-feat-reachability.test.ts — a saved homebrew feat is only reachable on 2024.
//
// Slice 76. Slice 74 established that per-character homebrew is wired end to end and said so plainly:
// "create homebrew, save it, use it on that character: works." That was reached by READING the code.
// This repo's recorded lesson is that reading is not enough — "a green 15k-test suite missed 3
// rendering-condition bugs", "authored but not wired is this repo's most common defect" — so the claim
// got driven in a browser, and it is true for 2024 and NOT true for the other systems.
//
// THE PATH, as it exists today:
//   1. `/dnd/characters/[id]/build/feat` renders for ANY character. The page deliberately does not show
//      or edit `system`: *"the save route derives the real one from the character … this page cannot
//      know it and must not invent it."* Reasonable on its own.
//   2. The save route accepts it, scoping to `normalizeSystem(character.system)` — so a 2014 character
//      saves a 2014 feat, successfully, flagged custom for DM review.
//   3. `levels/route.ts` adapts every saved feat via `customFeatToFeat` and passes them to the walker.
//   4. `asiFeatChoices` (LevelBuilder) opens with `if (system !== 'dnd5e-2024') return []`.
//
// So on a non-2024 character a player can open the designer, write a feat, watch the engine validate it
// live, save it, be told it is flagged for DM review — and no picker will ever offer it. Nothing in that
// flow says so. The work simply disappears.
//
// NOT FIXED HERE, and the reason is a real one rather than a hedge: the fix is to decide what 2014 does
// with feats at an ASI slot, and 2014 feats are an OPTIONAL rule in that edition. Making them appear is a
// rules decision about someone's game, which is the same line this arc has held since slice 71. What is
// recorded here is the behaviour, so the decision is made with it visible instead of discovered by a
// player whose feat vanished.
import { describe, it, expect } from 'vitest';
import { customFeatToFeat, eligibleHomebrewFeats } from '@/lib/dnd/feats/homebrew-adapter';
import type { CustomFeat } from '@/lib/dnd/classes/custom';

const feat = (over: Partial<CustomFeat> = {}): CustomFeat => ({
  key: 'hb-test',
  name: 'Cellar Door',
  category: 'general',
  system: 'dnd5e-2014',
  custom: true,
  repeatable: false,
  prerequisite: '',
  abilityIncrease: [],
  body: 'You may open a cellar door as a bonus action.',
  ...over,
} as CustomFeat);

describe('the adapter is faithful about everything except the system', () => {
  it('carries name, category, body and repeatability across', () => {
    const f = customFeatToFeat(feat({ repeatable: true }));
    expect(f.name).toBe('Cellar Door');
    expect(f.category).toBe('general');
    expect(f.benefit).toContain('cellar door');
    expect(f.repeatable).toBe(true);
  });

  it('a free-text prerequisite becomes an advisory `text` gate, not a machine-checked one', () => {
    const f = customFeatToFeat(feat({ prerequisite: 'Level 4+, Strength 13+' }));
    expect(f.prerequisites).toEqual([{ text: 'Level 4+, Strength 13+' }]);
    // No minLevel — so it cannot silently filter the feat out of a picker. Homebrew is the table's call.
    expect(f.prerequisites?.[0]).not.toHaveProperty('minLevel');
  });

  it('but it STAMPS dnd5e-2024 onto a feat the character saved as 2014', () => {
    // The literal is hardcoded, documented as "asiFeatChoices is 2024-only, so the system literal is
    // fixed here". Contained — the PERSISTED CustomFeat keeps its real system, this is the in-memory
    // adaptation only — but it means the object handed to the picker claims a system its owner is not.
    expect(feat().system).toBe('dnd5e-2014');
    expect(customFeatToFeat(feat()).system).toBe('dnd5e-2024');
  });
});

describe('category eligibility mirrors the official rule', () => {
  it('general feats are offered at any level', () => {
    expect(eligibleHomebrewFeats([feat()], 1).map((f) => f.name)).toEqual(['Cellar Door']);
  });

  it('epic boons only from 19', () => {
    const boon = [feat({ key: 'hb-boon', category: 'epic-boon' })];
    expect(eligibleHomebrewFeats(boon, 18)).toEqual([]);
    expect(eligibleHomebrewFeats(boon, 19)).toHaveLength(1);
  });

  it('origin and fighting-style feats are not ASI picks, and are excluded', () => {
    expect(eligibleHomebrewFeats([feat({ category: 'origin' })], 20)).toEqual([]);
    expect(eligibleHomebrewFeats([feat({ category: 'fighting-style' })], 20)).toEqual([]);
  });
});

describe('THE REACHABILITY GAP — pinned, not fixed', () => {
  // `asiFeatChoices` lives inside LevelBuilder.tsx and is not exported, so the gate is asserted against
  // the source. That is deliberate: the point is that the FIRST line of the function discards every
  // non-2024 system before homebrew is ever considered, and it is the shape of the gate that matters.
  const SRC = require('node:fs').readFileSync(
    require('node:path').join(process.cwd(), 'app/dnd/_ui/LevelBuilder.tsx'), 'utf8');

  it('the ASI picker returns nothing at all for a non-2024 system', () => {
    expect(SRC).toContain("if (system !== 'dnd5e-2024') return [];");
  });

  it('and the homebrew line sits AFTER that gate, so it can never run for 2014', () => {
    const gate = SRC.indexOf("if (system !== 'dnd5e-2024') return [];");
    const homebrew = SRC.indexOf('const homebrew = extra.filter(');
    expect(gate).toBeGreaterThan(-1);
    expect(homebrew).toBeGreaterThan(gate);
  });

  it('while the designer and the save route are open to every system', () => {
    // Neither restricts by system — verified as the other half of the gap, so a fix that only touched
    // the picker would still leave a 2014 player able to save something unreachable.
    const page = require('node:fs').readFileSync(
      require('node:path').join(process.cwd(), 'app/dnd/characters/[id]/build/feat/page.tsx'), 'utf8');
    expect(page).not.toContain("dnd5e-2024'");
    const route = require('node:fs').readFileSync(
      require('node:path').join(process.cwd(),
        'app/api/dnd/characters/[id]/homebrew-feat/save/route.ts'), 'utf8');
    expect(route).toContain('normalizeSystem');
    expect(route).not.toContain("!== 'dnd5e-2024'");
  });
});
