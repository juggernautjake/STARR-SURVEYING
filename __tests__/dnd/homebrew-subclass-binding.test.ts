// __tests__/dnd/homebrew-subclass-binding.test.ts — an authored subclass reaches its class (P12-5).
//
// The Studio has always REQUIRED a `parentClass` on the subclass kind, and nothing anywhere read it: a
// repo-wide search for the field found exactly one hit, its own declaration. Worse than unwired — the
// adopt path accepted `kind: 'subclass'` in `homebrewToCharacterClass` and stored the payload in
// `char.homebrewClasses`, so "Way of the Open Hand" became a standalone class you take levels in rather
// than an option under Monk.
//
// These are unit tests on the converter because that is where the binding lives; `char.homebrewSubclasses`
// is the store the level walker already reads via `subclassesFor(system, classKey, extra)`.
import { describe, it, expect } from 'vitest';
import { homebrewToCharacterClass, homebrewToCharacterSubclass, adoptHomebrew } from '@/lib/dnd/homebrew/adopt';
import type { HomebrewContent } from '@/lib/dnd/homebrew/model';
import type { Character } from '@/app/dnd/_sheet/types';

const CANDIDATES = [{ key: 'monk', name: 'Monk' }, { key: 'wizard', name: 'Wizard' }];

const piece = (payload: unknown, kind: 'subclass' | 'class' = 'subclass'): HomebrewContent => ({
  id: 'hb-1', kind, name: 'Way of the Open Hand', system: 'dnd5e-2024',
  creator: { id: 'u1', name: 'Perrin' },
  status: 'published', summary: '', description: '', tags: [], payload,
  createdAt: '2026-07-29T00:00:00Z', updatedAt: '2026-07-29T00:00:00Z',
} as unknown as HomebrewContent);

const body = {
  key: 'open-hand', name: 'Way of the Open Hand', system: 'dnd5e-2024',
  features: [{ level: 3, name: 'Open Hand Technique', body: 'Flurry gains riders.', subclass: true }],
};

describe('the parent binding', () => {
  it('resolves a free-text parent by NAME', () => {
    const sub = homebrewToCharacterSubclass(piece({ ...body, parentClass: 'Monk' }), CANDIDATES);
    expect(sub?.classKey).toBe('monk');
  });

  it('resolves it by KEY, and forgives case and spacing', () => {
    // `parentClass` is free text a human typed into a form. Being strict about spelling here would reject
    // pieces that are perfectly unambiguous.
    for (const p of ['monk', 'MONK', '  Monk  ']) {
      expect(homebrewToCharacterSubclass(piece({ ...body, parentClass: p }), CANDIDATES)?.classKey).toBe('monk');
    }
  });

  it('prefers an explicit `classKey` over the free-text field', () => {
    const sub = homebrewToCharacterSubclass(piece({ ...body, classKey: 'wizard', parentClass: 'Monk' }), CANDIDATES);
    expect(sub?.classKey).toBe('wizard');
  });

  it('REFUSES an unresolvable parent rather than guessing', () => {
    // The important negative. Defaulting to the first class, or keeping the raw string as a key, would
    // quietly give someone another class's features — a wrong binding is worse than a refused one,
    // because the refusal is visible and the mis-binding is not.
    expect(homebrewToCharacterSubclass(piece({ ...body, parentClass: 'Bard' }), CANDIDATES)).toBeNull();
    expect(homebrewToCharacterSubclass(piece({ ...body, parentClass: '' }), CANDIDATES)).toBeNull();
    expect(homebrewToCharacterSubclass(piece({ ...body }), CANDIDATES)).toBeNull();
  });

  it('refuses a system mismatch, like the class converter does', () => {
    const cross = piece({ ...body, system: 'pathfinder2e', parentClass: 'Monk' });
    expect(homebrewToCharacterSubclass(cross, CANDIDATES)).toBeNull();
  });

  it('stamps the creator as the author', () => {
    expect(homebrewToCharacterSubclass(piece({ ...body, parentClass: 'Monk' }), CANDIDATES)?.custom?.authorName).toBe('Perrin');
  });
});

describe('a subclass is no longer adopted as a class', () => {
  it('`homebrewToCharacterClass` rejects the subclass kind outright', () => {
    // The regression that matters. This used to return a ClassDefinition, which is how a subclass ended
    // up in `homebrewClasses` as something you could take levels in.
    expect(homebrewToCharacterClass(piece({ ...body, parentClass: 'Monk', hitDie: 8 }))).toBeNull();
  });

  it('`adoptHomebrew` files it under homebrewSubclasses, bound to its class', () => {
    const char = { homebrewClasses: [], homebrewSubclasses: [] } as unknown as Character;
    const out = adoptHomebrew(char, piece({ ...body, parentClass: 'Monk' }));
    expect(out?.adopted).toBe('subclass');
    expect(out?.char.homebrewSubclasses?.[0]?.classKey).toBe('monk');
    // And nothing leaked into the class list, which is the whole bug.
    expect(out?.char.homebrewClasses ?? []).toHaveLength(0);
  });

  it('re-adopting replaces rather than duplicates', () => {
    const char = { homebrewClasses: [], homebrewSubclasses: [] } as unknown as Character;
    const once = adoptHomebrew(char, piece({ ...body, parentClass: 'Monk' }))!.char;
    const twice = adoptHomebrew(once, piece({ ...body, parentClass: 'Monk' }))!.char;
    expect(twice.homebrewSubclasses).toHaveLength(1);
  });

  it('a homebrew subclass OF a homebrew class resolves', () => {
    // The candidate list is the system's classes PLUS whatever homebrew classes are already on the sheet,
    // so authoring a class and then a subclass for it works end to end.
    const char = {
      homebrewClasses: [{ key: 'runeblade', name: 'Runeblade' }],
      homebrewSubclasses: [],
    } as unknown as Character;
    const out = adoptHomebrew(char, piece({ ...body, key: 'ember', name: 'Ember Path', parentClass: 'Runeblade' }));
    expect(out?.adopted).toBe('subclass');
    expect(out?.char.homebrewSubclasses?.[0]?.classKey).toBe('runeblade');
  });
});
