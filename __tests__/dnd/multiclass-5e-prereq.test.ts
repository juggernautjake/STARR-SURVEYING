// __tests__/dnd/multiclass-5e-prereq.test.ts — MC-5e-3: 5e multiclass entry prerequisites (PHB).
import { describe, it, expect } from 'vitest';
import { multiclassPrereqFor, meetsMulticlassPrereq } from '@/lib/dnd/classes/engine';

describe('5e multiclass prerequisites (MC-5e-3)', () => {
  it('gives the PHB ability prereq per class (13 in the listed ability)', () => {
    expect(multiclassPrereqFor('wizard')).toEqual({ abilities: ['int'], mode: 'all', minScore: 13 });
    expect(multiclassPrereqFor('fighter')).toEqual({ abilities: ['str', 'dex'], mode: 'any', minScore: 13 });
    expect(multiclassPrereqFor('paladin')).toEqual({ abilities: ['str', 'cha'], mode: 'all', minScore: 13 });
  });

  it('an unknown/homebrew class has no prereq (custom escape hatch)', () => {
    expect(multiclassPrereqFor('my-homebrew-class')).toBeNull();
    expect(meetsMulticlassPrereq('my-homebrew-class', { str: 8 })).toBe(true);
  });

  it("'all' mode needs 13 in EVERY listed ability (Paladin: STR and CHA)", () => {
    expect(meetsMulticlassPrereq('paladin', { str: 13, cha: 13 })).toBe(true);
    expect(meetsMulticlassPrereq('paladin', { str: 13, cha: 12 })).toBe(false);
    expect(meetsMulticlassPrereq('paladin', { str: 12, cha: 15 })).toBe(false);
  });

  it("'any' mode needs 13 in AT LEAST ONE (Fighter: STR or DEX)", () => {
    expect(meetsMulticlassPrereq('fighter', { str: 13, dex: 8 })).toBe(true);
    expect(meetsMulticlassPrereq('fighter', { str: 8, dex: 14 })).toBe(true);
    expect(meetsMulticlassPrereq('fighter', { str: 12, dex: 12 })).toBe(false);
  });

  it('tolerates a system-prefixed key', () => {
    expect(multiclassPrereqFor('dnd5e-2024:wizard')?.abilities).toEqual(['int']);
  });
});
