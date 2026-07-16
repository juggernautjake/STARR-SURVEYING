// __tests__/dnd/form-effects.test.ts — the active form is a ledger source (Slice 15/25).
//
// A transformation (Titan form → +STR + fly speed) now overlays through the ledger like any other
// source: only the ACTIVE form contributes, the base form never does, and switching back drops the
// overlay and re-derives the character as themselves. The bespoke strikeDie / form-attack fields
// keep their own render paths — this is the ledger-resolved half only.
import { describe, it, expect } from 'vitest';
import { buildLedger, collectSources } from '@/lib/dnd/effects/ledger';
import { blankCharacter } from '@/app/dnd/_sheet/data/blank';
import type { Character, CharForm } from '@/app/dnd/_sheet/types';

function shifter(activeFormId: string): Character {
  const c = blankCharacter('Kilo');
  c.abilities = { ...c.abilities, str: 14 };
  c.forms = [
    { id: 'base', name: 'Base', subtitle: '', cls: 'f-base', unlockLevel: 1, gating: 'held', flavor: '', bullets: [] },
    {
      id: 'titan', name: 'Titan', subtitle: '', cls: 'f-titan', unlockLevel: 1, gating: 'surged', flavor: '', bullets: [],
      effects: [
        { target: 'ability_str', operation: 'set', value: 25 },
        { target: 'speed_fly', operation: 'set', value: 40 },
      ],
    },
  ] as CharForm[];
  c.activeFormId = activeFormId;
  return c;
}

describe('the active form overlays through the ledger', () => {
  it('while Titan is active, STR is 25 and a fly speed exists — as a `form` source', () => {
    const led = buildLedger(shifter('titan'));
    expect(led.value('ability_str', 14)).toBe(25);
    expect(led.value('speed_fly', 0)).toBe(40);
    const src = led.sources.find((s) => s.name === 'Titan');
    expect(src?.kind).toBe('form');
  });

  it('in the base form, the Titan effects do NOT apply (base is who you are)', () => {
    const led = buildLedger(shifter('base'));
    expect(led.isModified('ability_str')).toBe(false);
    expect(led.value('ability_str', 14)).toBe(14);
    expect(led.sources.find((s) => s.kind === 'form')).toBeUndefined();
  });

  it('only the ACTIVE form contributes — an inactive form with effects is ignored', () => {
    // activeFormId points at base; titan carries effects but is not active.
    expect(collectSources(shifter('base')).some((s) => s.name === 'Titan')).toBe(false);
    expect(collectSources(shifter('titan')).some((s) => s.name === 'Titan')).toBe(true);
  });

  it('switching back to base reverts the overlay entirely (no bookkeeping)', () => {
    const active = buildLedger(shifter('titan'));
    expect(active.value('ability_str', 14)).toBe(25);
    const reverted = buildLedger(shifter('base'));
    expect(reverted.value('ability_str', 14)).toBe(14); // exactly yourself again
  });
});
