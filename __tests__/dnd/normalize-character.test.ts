// __tests__/dnd/normalize-character.test.ts — a partial/AI-built character must normalize to a
// complete one so no sheet tab crashes with "Cannot read properties of undefined (reading 'map')".
import { describe, it, expect } from 'vitest';
import { normalizeCharacter } from '@/app/dnd/_sheet/data/blank';

describe('normalizeCharacter', () => {
  it('fills every array the sheet tabs .map() over, from a minimal character', () => {
    const c = normalizeCharacter({ meta: { name: 'Kaelen' }, abilities: { str: 14 } });
    // top-level arrays the tabs iterate
    for (const k of ['attacks', 'forms', 'features', 'progression', 'inventory', 'resources', 'customSkills', 'primaryAbilities'] as const) {
      expect(Array.isArray((c as unknown as Record<string, unknown>)[k]), k).toBe(true);
    }
    expect(Array.isArray(c.meta.chips)).toBe(true);
    expect(Array.isArray(c.balance.synergies)).toBe(true);
    expect(Array.isArray(c.balance.weaknesses)).toBe(true);
    expect(c.meta.name).toBe('Kaelen');
    expect(c.abilities.str).toBe(14); // provided value preserved
  });

  it('tolerates junk / wrong-typed fields without throwing', () => {
    const c = normalizeCharacter({ meta: { name: 'X', chips: 'nope' }, attacks: 'bad', balance: null } as unknown);
    expect(Array.isArray(c.meta.chips)).toBe(true);
    expect(Array.isArray(c.attacks)).toBe(true);
    expect(Array.isArray(c.balance.synergies)).toBe(true);
  });

  it('handles an empty/undefined input', () => {
    const c = normalizeCharacter(undefined);
    expect(c.meta.name).toBeTruthy();
    expect(Array.isArray(c.inventory)).toBe(true);
  });
});
