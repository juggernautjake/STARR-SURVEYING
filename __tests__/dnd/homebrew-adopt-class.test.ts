// __tests__/dnd/homebrew-adopt-class.test.ts — Area H4/H5 (non-effect adoption). A homebrew class/feat piece
// converts to the ClassDefinition / CustomFeat the character store holds, validated + attributed.
import { describe, it, expect } from 'vitest';
import { homebrewToCharacterClass, homebrewToCharacterFeat } from '@/lib/dnd/homebrew/adopt';
import { validateClassDefinition } from '@/lib/dnd/classes/engine';
import { FIGHTER_2024 } from '@/lib/dnd/classes/dnd5e-2024/fighter';
import type { HomebrewContent } from '@/lib/dnd/homebrew/model';
import type { CustomFeat } from '@/lib/dnd/classes/custom';

// A real, engine-valid class as the payload (renamed so it reads as homebrew, same system).
const homebrewClassDef = { ...FIGHTER_2024, key: 'hb-brawler', name: 'Brawler' };
const classPiece: HomebrewContent = {
  id: 'hb-c', kind: 'class', name: 'Brawler', system: 'dnd5e-2024',
  creator: { name: 'Jacob' }, status: 'approved', payload: homebrewClassDef,
};

describe('homebrewToCharacterClass (H4/H5)', () => {
  it('adopts a structurally-valid class, stamping the creator as author', () => {
    expect(validateClassDefinition(homebrewClassDef)).toEqual([]); // fixture is engine-valid
    const def = homebrewToCharacterClass(classPiece)!;
    expect(def).not.toBeNull();
    expect(def.name).toBe('Brawler');
    expect(def.custom?.authorName).toBe('Jacob'); // attribution stamped
  });
  it('refuses a system mismatch, a non-class kind, and an invalid class payload', () => {
    expect(homebrewToCharacterClass({ ...classPiece, system: 'pathfinder2e' })).toBeNull(); // class def is 2024
    expect(homebrewToCharacterClass({ ...classPiece, kind: 'feat' })).toBeNull();
    expect(homebrewToCharacterClass({ ...classPiece, payload: { key: 'x', name: 'X', system: 'dnd5e-2024', hitDie: 8 } })).toBeNull(); // fails validateClassDefinition
    expect(homebrewToCharacterClass({ ...classPiece, payload: undefined })).toBeNull();
  });
});

const featPayload: CustomFeat = {
  key: 'hb-lucky', name: 'Extra Lucky', system: 'dnd5e-2024', category: 'general',
  body: 'You reroll one die per rest.', custom: {},
};
const featPiece: HomebrewContent = {
  id: 'hb-f', kind: 'feat', name: 'Extra Lucky', system: 'dnd5e-2024',
  creator: { name: 'Sam' }, status: 'approved', payload: featPayload,
};

describe('homebrewToCharacterFeat (H4/H5)', () => {
  it('adopts a valid feat with a real category, stamping the author', () => {
    const f = homebrewToCharacterFeat(featPiece)!;
    expect(f.name).toBe('Extra Lucky');
    expect(f.category).toBe('general');
    expect(f.custom.authorName).toBe('Sam');
  });
  it('refuses a bad category, a system mismatch, and a non-feat kind', () => {
    expect(homebrewToCharacterFeat({ ...featPiece, payload: { ...featPayload, category: 'bogus' } })).toBeNull();
    expect(homebrewToCharacterFeat({ ...featPiece, system: 'pathfinder2e' })).toBeNull();
    expect(homebrewToCharacterFeat({ ...featPiece, kind: 'class' })).toBeNull();
  });
});
