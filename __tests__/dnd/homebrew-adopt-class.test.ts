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

import { adoptHomebrew } from '@/lib/dnd/homebrew/adopt';
import { blankCharacter } from '@/app/dnd/_sheet/data/blank';
import type { Character } from '@/app/dnd/_sheet/types';

describe('adoptHomebrew — the top-level router (H4/H5)', () => {
  it('routes each kind onto the right character field, immutably', () => {
    const base = blankCharacter('Hero') as Character;
    const cls = adoptHomebrew(base, classPiece)!;
    expect(cls.adopted).toBe('class');
    expect(cls.char.homebrewClasses?.map((c) => c.key)).toContain('hb-brawler');
    expect(base.homebrewClasses ?? []).toEqual([]); // input not mutated

    const feat = adoptHomebrew(base, featPiece)!;
    expect(feat.adopted).toBe('feat');
    expect(feat.char.homebrewFeats?.map((f) => f.key)).toContain('hb-lucky');

    const belt: HomebrewContent = { id: 'hb-belt', kind: 'item', name: 'Belt', system: 'dnd5e-2024', creator: { name: 'J' }, status: 'approved', payload: { effects: [{ target: 'ability_str', operation: 'set', value: 19 }] } };
    const eff = adoptHomebrew(base, belt)!;
    expect(eff.adopted).toBe('effect');
    expect(eff.char.activeEffects?.map((e) => e.id)).toContain('hb-hb-belt');
  });
  it('is idempotent — re-adopting replaces the prior copy, never duplicates', () => {
    let c = blankCharacter('Hero') as Character;
    c = adoptHomebrew(c, classPiece)!.char;
    c = adoptHomebrew(c, classPiece)!.char; // adopt the SAME class again
    expect(c.homebrewClasses?.filter((x) => x.key === 'hb-brawler')).toHaveLength(1);
  });
  it('returns null for a pure-prose / invalid piece (nothing adoptable)', () => {
    const prose: HomebrewContent = { id: 'p', kind: 'stance', name: 'Cool Pose', system: 'dnd5e-2024', creator: { name: 'J' }, status: 'approved' };
    expect(adoptHomebrew(blankCharacter('H') as Character, prose)).toBeNull();
  });
});

import { validateHomebrewPayload } from '@/lib/dnd/homebrew/adopt';

describe('validateHomebrewPayload — author-time payload errors (H3)', () => {
  it('a prose-only piece (no payload) is valid', () => {
    expect(validateHomebrewPayload({ id: 'p', kind: 'stance', name: 'Pose', system: 'dnd5e-2024', creator: { name: 'J' }, status: 'draft' })).toEqual([]);
  });
  it('a valid class payload has no errors; a broken/mismatched one is explained', () => {
    expect(validateHomebrewPayload(classPiece)).toEqual([]); // engine-valid fixture
    const wrongSystem = validateHomebrewPayload({ ...classPiece, system: 'pathfinder2e' });
    expect(wrongSystem.some((e) => /never valid outside its own system/.test(e))).toBe(true);
    const broken = validateHomebrewPayload({ ...classPiece, payload: { key: 'x', name: 'X', system: 'dnd5e-2024', hitDie: 8 } });
    expect(broken.length).toBeGreaterThan(0); // validateClassDefinition surfaced the missing pieces
  });
  it('a feat with a bad category / missing body is explained', () => {
    const bad = validateHomebrewPayload({ ...featPiece, payload: { key: 'k', name: 'N', system: 'dnd5e-2024', category: 'bogus', body: '' } as never });
    expect(bad.some((e) => /not a valid feat category/.test(e))).toBe(true);
    expect(bad.some((e) => /needs rules text/.test(e))).toBe(true);
  });
  it('an item with an invalid effect payload flags the offending effect', () => {
    const item: HomebrewContent = { id: 'i', kind: 'item', name: 'X', system: 'dnd5e-2024', creator: { name: 'J' }, status: 'draft', payload: { effects: [{ target: 'not_real', operation: 'bogus' }] } };
    expect(validateHomebrewPayload(item).some((e) => /^Effect 1:/.test(e))).toBe(true);
    const good: HomebrewContent = { ...item, payload: { effects: [{ target: 'ac', operation: 'add', value: 1 }] } };
    expect(validateHomebrewPayload(good)).toEqual([]);
  });
});
