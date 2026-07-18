import { describe, it, expect } from 'vitest';
import { isIGCharacter, blankIGCharacter } from '@/lib/dnd/systems/intuitive-games/model';
import { isPF2Character } from '@/lib/dnd/systems/pathfinder2e/model';

// The adjudication chat route routes a character's sidecar to the RIGHT rules digest by these type guards:
// data.ig → igCharacterDigest, data.pf2e → pf2CharacterDigest. A false positive would feed one system's
// rules to another character (a Ground-Rule-1 cross-system leak at the AI adjudication layer). The guards
// were tested only positively; this pins the NEGATIVE / cross-system rejection they rely on. The distinctive
// field is what keys each: IG has `abilities`, PF2 has `attributes` + `skills[]`, 5e has `meta` (not `identity`).

const igChar = blankIGCharacter('Router Test');
const pf2Shaped = { identity: { name: 'x' }, attributes: {}, skills: [], combat: {} }; // PF2's distinctive shape
const fiveEShaped = { meta: { name: 'x' }, abilities: {}, combat: {} };                  // 5e uses meta, not identity

describe('isIGCharacter routes ONLY an IG sidecar', () => {
  it('accepts a real IG character', () => {
    expect(isIGCharacter(igChar)).toBe(true);
  });
  it('rejects a PF2 sidecar (has identity+combat but attributes, not abilities)', () => {
    expect(isIGCharacter(pf2Shaped)).toBe(false);
  });
  it('rejects a 5e-shaped object (has abilities+combat but meta, not identity)', () => {
    expect(isIGCharacter(fiveEShaped)).toBe(false);
  });
  it('rejects nullish / empty / non-object inputs', () => {
    for (const v of [null, undefined, {}, 'ig', 42, []]) expect(isIGCharacter(v)).toBe(false);
  });
});

describe('isPF2Character routes ONLY a PF2 sidecar', () => {
  it('accepts a PF2-shaped sidecar', () => {
    expect(isPF2Character(pf2Shaped)).toBe(true);
  });
  it('rejects an IG character (has abilities, not attributes; no skills[])', () => {
    expect(isPF2Character(igChar)).toBe(false);
  });
  it('rejects nullish / empty / non-object inputs', () => {
    for (const v of [null, undefined, {}, 'pf2', 42, []]) expect(isPF2Character(v)).toBe(false);
  });
});

describe('the two systems never both claim the same sidecar (mutual exclusion)', () => {
  it('an IG character is IG and NOT PF2; a PF2 sidecar is PF2 and NOT IG', () => {
    expect([isIGCharacter(igChar), isPF2Character(igChar)]).toEqual([true, false]);
    expect([isIGCharacter(pf2Shaped), isPF2Character(pf2Shaped)]).toEqual([false, true]);
  });
});
