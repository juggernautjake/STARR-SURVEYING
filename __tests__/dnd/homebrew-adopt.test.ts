// __tests__/dnd/homebrew-adopt.test.ts — Area H5. A posted homebrew piece with a mechanical payload
// round-trips to REAL effects the sheet's ledger resolves, and its creator attribution persists.
import { describe, it, expect } from 'vitest';
import { homebrewPayloadEffects, homebrewToActiveEffect } from '@/lib/dnd/homebrew/adopt';
import { buildLedger } from '@/lib/dnd/effects/ledger';
import { blankCharacter } from '@/app/dnd/_sheet/data/blank';
import type { Character } from '@/app/dnd/_sheet/types';
import type { HomebrewContent } from '@/lib/dnd/homebrew/model';

const belt: HomebrewContent = {
  id: 'hb-belt', kind: 'item', name: 'Belt of the Homebrew Bear', system: 'dnd5e-2024',
  creator: { name: 'Jacob' }, status: 'approved', summary: 'Sets STR to 19.',
  payload: { effects: [{ target: 'ability_str', operation: 'set', value: 19 }] },
};

describe('homebrew payload → effects (H5)', () => {
  it('extracts valid effects and drops invalid ones at the boundary', () => {
    expect(homebrewPayloadEffects(belt)).toEqual([{ target: 'ability_str', operation: 'set', value: 19 }]);
    // a bare Effect[] payload works too
    expect(homebrewPayloadEffects({ ...belt, payload: [{ target: 'ac', operation: 'add', value: 1 }] })).toHaveLength(1);
    // an invalid effect is refused, never coerced
    expect(homebrewPayloadEffects({ ...belt, payload: { effects: [{ target: 'not_a_real_target', operation: 'nonsense' }] } })).toEqual([]);
    // pure-prose homebrew grants nothing
    expect(homebrewPayloadEffects({ ...belt, payload: undefined })).toEqual([]);
  });
});

describe('adopt round-trip: the ledger resolves the real number (H5)', () => {
  it('turns a piece into an ActiveEffect whose bonus the ledger resolves, attribution intact', () => {
    const ae = homebrewToActiveEffect(belt)!;
    expect(ae).not.toBeNull();
    expect(ae.source).toBe('Homebrew · by Jacob'); // creator attribution persists
    // adopt it onto a character
    const c = blankCharacter('T') as Character;
    c.activeEffects = [ae];
    const led = buildLedger(c);
    expect(led.value('ability_str')).toBe(19);                       // the homebrew number is REAL, resolved
    expect(led.sources.map((s) => s.name)).toContain('Belt of the Homebrew Bear');
  });
  it('a pure-prose piece adopts to nothing (no fake effect injected)', () => {
    expect(homebrewToActiveEffect({ ...belt, id: 'p', payload: undefined })).toBeNull();
  });
});
