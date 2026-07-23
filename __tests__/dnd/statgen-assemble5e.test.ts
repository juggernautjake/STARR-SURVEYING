// __tests__/dnd/statgen-assemble5e.test.ts — the 5e picks → character-patch assembler (MB-2b).
//
// Runs against the real class catalog, so it proves the KEY→label + primary-ability mapping the sheet reads.
import { describe, it, expect } from 'vitest';
import { assembleDnd5e } from '@/lib/dnd/statgen/assemble5e';
import { classesForSystem, subclassesFor } from '@/lib/dnd/classes/registry';

const abilities = { str: 17, dex: 14, con: 14, int: 8, wis: 12, cha: 10 };

describe('assembleDnd5e', () => {
  it('resolves the class KEY to its display label and pulls primary abilities', () => {
    const fighter = classesForSystem('dnd5e-2024').find((c) => c.name === 'Fighter')!;
    const out = assembleDnd5e({ system: 'dnd5e-2024', level: 5, className: fighter.key, abilities });
    expect(out.meta.className).toBe('Fighter');
    expect(out.primaryAbilities).toEqual(fighter.primaryAbility);
    expect(out.meta.level).toBe(5);
    expect(out.abilities).toEqual(abilities);
  });

  it('resolves the subclass KEY to its label', () => {
    const fighter = classesForSystem('dnd5e-2024').find((c) => c.name === 'Fighter')!;
    const sub = subclassesFor('dnd5e-2024', fighter.key)[0];
    const out = assembleDnd5e({ system: 'dnd5e-2024', level: 3, className: fighter.key, subclass: sub.key, abilities });
    expect(out.meta.subclass).toBe(sub.name);
  });

  it('keeps the 2024 background + its spread for reversibility', () => {
    const out = assembleDnd5e({
      system: 'dnd5e-2024', level: 1, className: 'fighter', abilities,
      background: 'Soldier', backgroundAbilities: { str: 2, con: 1 },
    });
    expect(out.meta.background).toBe('Soldier');
    expect(out.meta.backgroundAbilities).toEqual({ str: 2, con: 1 });
  });

  it('records chosen feats as sheet features', () => {
    const out = assembleDnd5e({ system: 'dnd5e-2024', level: 4, className: 'fighter', abilities, feats: ['Alert', 'Tough'] });
    expect(out.feats.map((f) => f.name)).toEqual(['Alert', 'Tough']);
  });

  it('clamps the level to 1–20 and defaults the name', () => {
    expect(assembleDnd5e({ system: 'dnd5e-2024', level: 99, abilities }).meta.level).toBe(20);
    expect(assembleDnd5e({ system: 'dnd5e-2024', level: 0, abilities }).meta.level).toBe(1);
    expect(assembleDnd5e({ system: 'dnd5e-2024', level: 1, abilities }).meta.name).toBe('New character');
  });

  it('falls back to the raw key for an unknown class rather than losing it', () => {
    const out = assembleDnd5e({ system: 'dnd5e-2024', level: 1, className: 'homebrew-thing', abilities });
    expect(out.meta.className).toBe('homebrew-thing');
    expect(out.primaryAbilities).toEqual([]);
  });
});
