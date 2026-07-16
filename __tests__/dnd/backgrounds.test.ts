// __tests__/dnd/backgrounds.test.ts — 2024 backgrounds data (Slice 4).
//
// Two invariants the doc names: "every background's feat exists" (now checkable — the Origin feats
// shipped) and the 2024 reshaping rule that the BACKGROUND, not the species, carries the ability score
// increases. Plus structural checks so a typo in a skill or feat key can't slip in silently.
import { describe, it, expect } from 'vitest';
import { BACKGROUNDS_2024, findBackground } from '@/lib/dnd/backgrounds/dnd5e-2024';
import { findFeat } from '@/lib/dnd/feats/dnd5e-2024';
import { SKILLS, ABILITIES } from '@/app/dnd/_sheet/rules/dnd';

const SKILL_KEYS = new Set(SKILLS.map((s) => s.key));
const ABILITY_KEYS = new Set(ABILITIES.map((a) => a.key));

describe('2024 backgrounds', () => {
  it('there are 16, with unique keys and the full PHB list', () => {
    expect(BACKGROUNDS_2024).toHaveLength(16);
    const keys = BACKGROUNDS_2024.map((b) => b.key);
    expect(new Set(keys).size).toBe(16);
    for (const name of ['Acolyte', 'Artisan', 'Charlatan', 'Criminal', 'Entertainer', 'Farmer', 'Guard', 'Guide', 'Hermit', 'Merchant', 'Noble', 'Sage', 'Sailor', 'Scribe', 'Soldier', 'Wayfarer']) {
      expect(BACKGROUNDS_2024.map((b) => b.name)).toContain(name);
    }
  });

  it("every background's Origin feat exists in the feats data", () => {
    for (const bg of BACKGROUNDS_2024) {
      const feat = findFeat(bg.originFeat);
      expect(feat, `${bg.name} → ${bg.originFeat}`).toBeDefined();
      expect(feat!.category).toBe('origin'); // a background always grants an ORIGIN feat
    }
  });

  it('carries the ability-score increases (the 2024 rule) — exactly 3 distinct valid abilities each', () => {
    for (const bg of BACKGROUNDS_2024) {
      expect(bg.abilityScores, bg.name).toHaveLength(3);
      expect(new Set(bg.abilityScores).size).toBe(3); // distinct
      for (const a of bg.abilityScores) expect(ABILITY_KEYS.has(a), `${bg.name}: ${a}`).toBe(true);
    }
  });

  it('grants exactly two valid skill proficiencies and one tool', () => {
    for (const bg of BACKGROUNDS_2024) {
      expect(bg.skillProficiencies, bg.name).toHaveLength(2);
      for (const s of bg.skillProficiencies) expect(SKILL_KEYS.has(s), `${bg.name}: ${s}`).toBe(true);
      expect(bg.toolProficiency.length).toBeGreaterThan(0);
      expect(bg.equipment).toContain('50 GP'); // the option-B gold line is always present
    }
  });

  it('a Magic Initiate background names which spell list to use', () => {
    for (const bg of BACKGROUNDS_2024) {
      if (bg.originFeat === 'magic-initiate') {
        expect(['arcane', 'divine', 'primal'], bg.name).toContain(bg.spellList);
      }
    }
    // spot-check the canonical three
    expect(findBackground('acolyte')?.spellList).toBe('divine');
    expect(findBackground('guide')?.spellList).toBe('primal');
    expect(findBackground('sage')?.spellList).toBe('arcane');
  });
});

describe('the sheet surfaces the 2024 background as a rules-grounded picker (Slice 4 creation UI)', () => {
  const read = (p: string) => require('node:fs').readFileSync(require('node:path').join(process.cwd(), p), 'utf8');
  const BIO = read('app/dnd/_sheet/components/Bio.tsx');

  it('offers a 2024 background dropdown from BACKGROUNDS_2024 with a custom escape hatch', () => {
    expect(BIO).toContain('BACKGROUNDS_2024');
    expect(BIO).toContain("system === 'dnd5e-2024'");
    expect(BIO).toContain('✎ Custom…');
    expect(BIO).toContain('setBackground');
  });

  it('shows what the background grants (abilities, Origin feat, skills, tool, equipment)', () => {
    expect(BIO).toContain('Ability Scores:');
    expect(BIO).toContain('Origin Feat:');
    expect(BIO).toContain('bg.skillProficiencies');
    expect(BIO).toContain('bg.toolProficiency');
    expect(BIO).toContain('bgFeatName');
  });

  it('applies the +2/+1 (or +1/+1/+1) spread to the sheet, reversibly (the Slice 4 follow-up)', () => {
    // The spread is validated and applied through the tested core, and stored so switching reverses it.
    expect(BIO).toContain('validateAbilityAssignment');
    expect(BIO).toContain('reconcileBackgroundIncreases');
    expect(BIO).toContain('backgroundAbilities');
    expect(BIO).toContain('applySpread');
  });
});
