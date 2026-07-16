// __tests__/dnd/feat-eligibility.test.ts — rules-legal feat granting (Slice 4 / builder correctness).
//
// The directive: a character only gets a feat when the rules grant it, unless building custom. This
// pins the pure gate — the right category for the slot, level + ability prerequisites, no retaking a
// non-repeatable feat — plus the custom escape hatch (unknown keys pass).
import { describe, it, expect } from 'vitest';
import { featEligibility, eligibleFeats, validateFeatKey } from '@/lib/dnd/feats/eligibility';
import {
  FEATS_2024,
  GENERAL_FEATS_2024,
  ORIGIN_FEATS_2024,
  FIGHTING_STYLE_FEATS_2024,
  findFeat,
} from '@/lib/dnd/feats/dnd5e-2024';

const abilities = { str: 15, dex: 12, con: 14, int: 10, wis: 13, cha: 8 };

describe('the slot gates the feat category', () => {
  it('an ASI slot grants General feats, not Origin or Fighting Style feats', () => {
    expect(featEligibility(findFeat('resilient')!, { slot: 'asi', level: 4, abilities }).ok).toBe(true);
    const origin = featEligibility(findFeat('lucky')!, { slot: 'asi', level: 4, abilities });
    expect(origin.ok).toBe(false);
    expect(origin.reason).toMatch(/Origin feat can't be taken/);
    expect(featEligibility(findFeat('fs-archery')!, { slot: 'asi', level: 4, abilities }).ok).toBe(false);
  });

  it('an origin slot grants Origin feats, not General feats', () => {
    expect(featEligibility(findFeat('alert')!, { slot: 'origin', level: 1, abilities }).ok).toBe(true);
    expect(featEligibility(findFeat('resilient')!, { slot: 'origin', level: 1, abilities }).ok).toBe(false);
  });

  it('a fighting-style slot grants Fighting Style feats only', () => {
    expect(featEligibility(findFeat('fs-dueling')!, { slot: 'fighting-style', level: 1 }).ok).toBe(true);
    expect(featEligibility(findFeat('alert')!, { slot: 'fighting-style', level: 1 }).ok).toBe(false);
  });
});

describe('prerequisites', () => {
  it('honours minLevel — General feats need level 4', () => {
    expect(featEligibility(findFeat('resilient')!, { slot: 'asi', level: 3, abilities }).ok).toBe(false);
    expect(featEligibility(findFeat('resilient')!, { slot: 'asi', level: 4, abilities }).ok).toBe(true);
  });

  it('honours ability prerequisites — Grappler needs STR 13', () => {
    expect(featEligibility(findFeat('grappler')!, { slot: 'asi', level: 4, abilities: { ...abilities, str: 12 } }).ok).toBe(false);
    expect(featEligibility(findFeat('grappler')!, { slot: 'asi', level: 4, abilities: { ...abilities, str: 13 } }).ok).toBe(true);
  });

  it('honours a needs prerequisite — War Caster needs spellcasting', () => {
    expect(featEligibility(findFeat('war-caster')!, { slot: 'asi', level: 4, abilities }).ok).toBe(false);
    expect(featEligibility(findFeat('war-caster')!, { slot: 'asi', level: 4, abilities, has: ['spellcasting'] }).ok).toBe(true);
  });
});

describe('repeatability', () => {
  it('blocks retaking a non-repeatable feat, allows a repeatable one', () => {
    expect(featEligibility(findFeat('resilient')!, { slot: 'asi', level: 4, abilities, takenFeatKeys: ['resilient'] }).ok).toBe(false);
    // Ability Score Improvement is repeatable.
    expect(featEligibility(findFeat('ability-score-improvement')!, { slot: 'asi', level: 8, abilities, takenFeatKeys: ['ability-score-improvement'] }).ok).toBe(true);
  });
});

describe('eligibleFeats + validateFeatKey', () => {
  it('eligibleFeats returns exactly the legal General feats for an ASI slot', () => {
    const legal = eligibleFeats({ slot: 'asi', level: 4, abilities }, FEATS_2024).map((f) => f.key);
    // every returned feat is General (or Epic Boon), never Origin/Fighting Style
    for (const key of legal) {
      const cat = findFeat(key)!.category;
      expect(['general', 'epic-boon']).toContain(cat);
    }
    expect(legal).toContain('resilient');
    // grappler is out — STR 15 meets its STR 13, so actually IN; war-caster out (no spellcasting)
    expect(legal).toContain('grappler');
    expect(legal).not.toContain('war-caster');
  });

  it('validateFeatKey lets unknown/custom feats through (the explicit-custom escape hatch)', () => {
    expect(validateFeatKey('totally-homebrew', { slot: 'asi', level: 4 }).ok).toBe(true);
    expect(validateFeatKey('lucky', { slot: 'asi', level: 4 }).ok).toBe(false); // known + illegal here
  });
});

describe('General feat data', () => {
  it('every General feat requires level 4 and (mostly) grants an ability increase', () => {
    for (const feat of GENERAL_FEATS_2024) {
      expect(feat.category).toBe('general');
      expect(feat.prerequisites?.some((p) => p.minLevel === 4), feat.name).toBe(true);
      expect(feat.abilityIncrease, feat.name).toBeDefined();
    }
  });

  it('the three categories are disjoint', () => {
    const o = new Set(ORIGIN_FEATS_2024.map((f) => f.key));
    const fs = new Set(FIGHTING_STYLE_FEATS_2024.map((f) => f.key));
    for (const g of GENERAL_FEATS_2024) {
      expect(o.has(g.key)).toBe(false);
      expect(fs.has(g.key)).toBe(false);
    }
  });
});

describe('the level builder offers only rules-legal feats (UI wiring)', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const LB = fs.readFileSync(path.join(process.cwd(), 'app/dnd/_ui/LevelBuilder.tsx'), 'utf8');
  it('replaced the free-text feat input with a filtered dropdown + custom escape hatch', () => {
    expect(LB).toContain('asiFeatChoices(system, current.level)');
    expect(LB).toContain('✎ Custom feat…');
    // the old free-text "take a feat instead — its name" input is gone
    expect(LB).not.toContain('take a feat instead — its name');
  });
  it('guards the __custom__ sentinel from being recorded as a feat', () => {
    expect(LB).toContain("choice.featKey === '__custom__'");
  });
  it('only offers General/Epic feats, gated by level — never Origin', () => {
    expect(LB).toContain("f.category !== 'general'");
    expect(LB).toContain("f.category === 'epic-boon' && level >= 19");
  });
});
