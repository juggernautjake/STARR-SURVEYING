// The customization report: categorised, counted, and ordered green-above-grey.
//
// The owner's spec is precise enough to test directly: a category with a custom weapon shows
// "Weapons (1)" and sorts to the top; three custom feats show "Feats & Features (3)"; untouched
// categories are listed but grey and below. These assert that shape on the RESULT, not the render.
import { describe, expect, it } from 'vitest';
import { customizationReport, customizationTypeLabel } from '@/lib/dnd/customizations';

const cat = (r: ReturnType<typeof customizationReport>, name: string) =>
  r.categories.find((c) => c.category === name)!;

describe('customizationReport — counting', () => {
  it('counts an off-rules / homebrew weapon under Weapons with count 1', () => {
    // A weapon a custom character took past the gate carries `offRules` — the ⚑ marker — which is
    // the sheet's own signal and the one this report trusts on the heterogeneous `attacks` array
    // (where a bare name cannot be catalog-checked without misreading cantrip attacks).
    const r = customizationReport({ attacks: [{ name: 'Zorp Blaster 3000', offRules: 'homebrew weapon' }] }, 'dnd5e-2024');
    expect(cat(r, 'Weapons').count).toBe(1);
    expect(cat(r, 'Weapons').items[0].types).toContain('off-rules');
  });

  it('counts a from-scratch weapon carrying the forward-compat homebrew flag', () => {
    // When the authoring path marks a scratch-built item `homebrew`, the report already counts it.
    const r = customizationReport({ attacks: [{ name: 'Zorp Blaster 3000', homebrew: true }] }, 'dnd5e-2024');
    expect(cat(r, 'Weapons').items[0].types).toContain('homebrew');
  });

  it('counts a homebrew SPELL by catalog membership — the one array that can be checked safely', () => {
    // `spells` is homogeneous and the SRD catalog is complete, so a spell outside it is reliably
    // homebrew with no flag needed.
    const r = customizationReport({ spells: [{ name: 'Summon Interdimensional Tax Auditor' }] }, 'dnd5e-2024');
    expect(cat(r, 'Spells').count).toBe(1);
    expect(cat(r, 'Spells').items[0].types).toContain('homebrew');
  });

  it('counts three off-rules feats under Feats & Features with count 3', () => {
    const r = customizationReport(
      {
        features: [
          { name: 'Made-Up Feat A', offRules: 'homebrew' },
          { name: 'Made-Up Feat B', offRules: 'homebrew' },
          { name: 'Made-Up Feat C', offRules: 'homebrew' },
        ],
      },
      'dnd5e-2024',
    );
    expect(cat(r, 'Feats & Features').count).toBe(3);
  });

  it('counts an off-rules (⚑) element even when its name IS a real catalog entry', () => {
    // Off-rules is orthogonal to homebrew: the content is official, the character just can't
    // legally take it. A real spell name with an offRules note must still count.
    const r = customizationReport({ spells: [{ name: 'Fireball', offRules: 'not on your class list' }] }, 'dnd5e-2024');
    expect(cat(r, 'Spells').count).toBe(1);
    expect(cat(r, 'Spells').items[0].types).toContain('off-rules');
    expect(cat(r, 'Spells').items[0].detail).toBe('not on your class list');
  });

  it('counts an edited (✎) element', () => {
    const r = customizationReport({ attacks: [{ name: 'Longsword', customized: true }] }, 'dnd5e-2024');
    expect(cat(r, 'Weapons').items[0].types).toContain('edited');
  });

  it('coalesces an element that is BOTH edited and off-rules into one item with both types', () => {
    // The count is elements, not flags — an item with two reasons counts once.
    const r = customizationReport(
      { attacks: [{ name: 'Cursed Blade', customized: true, offRules: 'homebrew weapon' }] },
      'dnd5e-2024',
    );
    expect(cat(r, 'Weapons').count).toBe(1);
    expect(cat(r, 'Weapons').items[0].types.sort()).toEqual(['edited', 'off-rules']);
  });

  it('attributes a DM-granted element as granted, not homebrew', () => {
    // A DM gift is not the player inventing content, even though it is not in the vanilla catalog.
    const r = customizationReport({ features: [{ name: 'Boon of the Nine' }] }, 'dnd5e-2024', ['Boon of the Nine']);
    expect(cat(r, 'Feats & Features').items[0].types).toEqual(['granted']);
    expect(cat(r, 'Feats & Features').items[0].types).not.toContain('homebrew');
  });

  it('does NOT count vanilla content — a real, legal spell is not a customization', () => {
    const r = customizationReport({ spells: [{ name: 'Fireball' }] }, 'dnd5e-2024');
    expect(cat(r, 'Spells').count).toBe(0);
  });
});

describe('customizationReport — ordering (the owner’s green-above-grey rule)', () => {
  it('puts customized categories first, by count descending', () => {
    const r = customizationReport(
      {
        attacks: [{ name: 'Homebrew Axe', offRules: 'homebrew' }], // Weapons: 1
        features: [
          { name: 'Fake A', offRules: 'x' },
          { name: 'Fake B', offRules: 'x' },
          { name: 'Fake C', offRules: 'x' },
        ], // Feats: 3
      },
      'dnd5e-2024',
    );
    const nonEmpty = r.categories.filter((c) => c.count > 0).map((c) => c.category);
    expect(nonEmpty).toEqual(['Feats & Features', 'Weapons']); // 3 before 1
  });

  it('lists every empty category too, all beneath the customized ones', () => {
    const r = customizationReport({ attacks: [{ name: 'Homebrew Axe', offRules: 'homebrew' }] }, 'dnd5e-2024');
    const firstEmptyIndex = r.categories.findIndex((c) => c.count === 0);
    const lastNonEmptyIndex = r.categories.map((c) => c.count > 0).lastIndexOf(true);
    expect(lastNonEmptyIndex).toBeLessThan(firstEmptyIndex); // no green below a grey
    // And the grey ones are genuinely all shown, not dropped.
    expect(r.categories.length).toBeGreaterThanOrEqual(8);
    expect(r.categories.every((c) => typeof c.category === 'string')).toBe(true);
  });

  it('a totally vanilla character shows all categories grey with total 0', () => {
    const r = customizationReport({ meta: { className: 'Fighter', species: 'Human' }, spells: [{ name: 'Fireball' }] }, 'dnd5e-2024');
    expect(r.total).toBe(0);
    expect(r.categories.every((c) => c.count === 0)).toBe(true);
  });
});

describe('customizationReport — cross-system', () => {
  it('reads an Intuitive Games build block by kind, so a homebrew stance lands under Stances', () => {
    const r = customizationReport(
      { igBuild: { className: 'Freebooter', stances: ['Made-Up Stance'] } },
      'intuitive-games',
    );
    expect(cat(r, 'Stances').count).toBe(1);
    expect(cat(r, 'Stances').items[0].types).toContain('homebrew');
  });

  it('does not throw on a shape missing every field it reads', () => {
    expect(() => customizationReport({}, 'pathfinder2e')).not.toThrow();
    expect(customizationReport({}, 'pathfinder2e').total).toBe(0);
  });
});

describe('type labels', () => {
  it('gives every customization type a human label', () => {
    for (const t of ['homebrew', 'off-rules', 'edited', 'granted'] as const) {
      expect(customizationTypeLabel(t).length).toBeGreaterThan(0);
    }
  });
});
