// __tests__/dnd/roll-effects.test.ts — the roll's "what affected it" source names, driving the tray's
// red-penalty display. Names the advantage/disadvantage sources for a roll target from the ledger.
import { describe, it, expect } from 'vitest';
import { buildLedger } from '@/lib/dnd/effects/ledger';
import { blankCharacter } from '@/app/dnd/_sheet/data/blank';
import { rollEffectSources } from '@/app/dnd/_sheet/lib/roll-effects';

describe('rollEffectSources — names the adv/disadvantage sources on a roll', () => {
  it('surfaces a folded condition as the disadvantage source (Poisoned → attack_roll)', () => {
    const c = blankCharacter('C');
    c.combat = { ...c.combat, conditions: ['Poisoned'] };
    const led = buildLedger(c, { system: 'dnd5e-2024', foldConditions: true });
    const src = rollEffectSources(led, 'attack_roll');
    expect(src.disadvantage).toContain('Poisoned');
    expect(src.advantage).toEqual([]);
  });

  it('unions across the several targets a roll consults + de-dupes (a save reads <ability>_saves + all_saves)', () => {
    const c = blankCharacter('C');
    c.combat = { ...c.combat, conditions: ['Restrained'] }; // Restrained → dex_saves disadvantage
    const led = buildLedger(c, { system: 'dnd5e-2024', foldConditions: true });
    expect(rollEffectSources(led, 'dex_saves', 'all_saves').disadvantage).toContain('Restrained');
    // a str save is NOT restrained-disadvantaged
    expect(rollEffectSources(led, 'str_saves', 'all_saves').disadvantage).not.toContain('Restrained');
  });

  it('surfaces an advantage source separately (Invisible → attack advantage, not a penalty)', () => {
    const c = blankCharacter('C');
    c.combat = { ...c.combat, conditions: ['Invisible'] };
    const led = buildLedger(c, { system: 'dnd5e-2024', foldConditions: true });
    const src = rollEffectSources(led, 'attack_roll');
    expect(src.advantage).toContain('Invisible');
    expect(src.disadvantage).toEqual([]);
  });

  it('is empty when the vanilla roller is on (conditions not folded)', () => {
    const c = blankCharacter('C');
    c.combat = { ...c.combat, conditions: ['Poisoned'] };
    const led = buildLedger(c, { system: 'dnd5e-2024' }); // foldConditions off
    expect(rollEffectSources(led, 'attack_roll')).toEqual({ advantage: [], disadvantage: [] });
  });
});
