import { describe, it, expect } from 'vitest';
import { customFeatToFeat, eligibleHomebrewFeats } from '@/lib/dnd/feats/homebrew-adapter';
import { buildCustomFeat } from '@/lib/dnd/classes/custom';
import type { CustomFeat } from '@/lib/dnd/classes/custom';

const cf = (over: Partial<CustomFeat>): CustomFeat => buildCustomFeat({
  name: 'Skirmisher', system: 'dnd5e-2024', category: 'general', body: 'Move after you attack. It really helps.',
  custom: {}, ...over,
});

describe('customFeatToFeat', () => {
  it('maps a homebrew feat faithfully into the Feat shape', () => {
    const f = customFeatToFeat(cf({ prerequisite: 'Level 4+', abilityIncrease: ['dex'], repeatable: true }));
    expect(f.name).toBe('Skirmisher');
    expect(f.category).toBe('general');
    expect(f.system).toBe('dnd5e-2024');
    expect(f.repeatable).toBe(true);
    expect(f.prerequisites).toEqual([{ text: 'Level 4+' }]);
    expect(f.abilityIncrease).toEqual({ choices: ['dex'], amount: 1 });
    expect(f.benefit).toContain('Move after you attack');
    expect(f.summary).toBe('Move after you attack.'); // first sentence
  });
  it('omits optional fields when absent', () => {
    const f = customFeatToFeat(cf({ prerequisite: undefined, abilityIncrease: undefined }));
    expect(f.prerequisites).toBeUndefined();
    expect(f.abilityIncrease).toBeUndefined();
  });
});

describe('eligibleHomebrewFeats (mirrors asiFeatChoices categories)', () => {
  const feats = [
    cf({ name: 'Gen', category: 'general' }),
    cf({ name: 'Origin', category: 'origin' }),
    cf({ name: 'Style', category: 'fighting-style' }),
    cf({ name: 'Boon', category: 'epic-boon' }),
  ];
  it('offers general feats at any level; origin/fighting-style never', () => {
    const at5 = eligibleHomebrewFeats(feats, 5).map((f) => f.name);
    expect(at5).toContain('Gen');
    expect(at5).not.toContain('Origin');
    expect(at5).not.toContain('Style');
    expect(at5).not.toContain('Boon'); // epic boon not until 19
  });
  it('offers epic boons only at 19+', () => {
    expect(eligibleHomebrewFeats(feats, 19).map((f) => f.name)).toContain('Boon');
  });
});
