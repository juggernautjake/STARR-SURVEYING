import { describe, it, expect } from 'vitest';
import type { Spell, SpellcastingInfo } from '@/app/dnd/_sheet/types';

// Slice 1 of DND_SPELLS_AND_ABILITIES: lock the spell/spellcasting model. Type-level guards
// (compilation) + light runtime asserts that the fields round-trip.

describe('spell data model', () => {
  it('models a spell-attack spell (Guiding Bolt → 4d6 radiant) with a display alias', () => {
    const guidingBolt: Spell = {
      id: 'guiding-bolt', name: 'Guiding Bolt', alias: 'Spotlight', level: 1, school: 'Evocation',
      prepared: true, castTime: '1 action', range: '120 ft', components: 'V, S', duration: 'Instant',
      description: 'A flash of light streaks toward a creature; the next attacker has advantage.',
      attack: true, damage: [{ dice: '4d6', type: 'radiant' }], higher: '+1d6 per slot level above 1st',
    };
    expect(guidingBolt.level).toBe(1);
    expect(guidingBolt.damage?.[0]).toEqual({ dice: '4d6', type: 'radiant' });
    expect(guidingBolt.attack).toBe(true);
  });

  it('models a save-based cantrip (Sacred Flame → 1d8 radiant, DEX save)', () => {
    const sacredFlame: Spell = {
      id: 'sacred-flame', name: 'Sacred Flame', level: 0, school: 'Evocation', description: 'Radiant flame descends.',
      save: { ability: 'dex', effect: 'no damage on a success' }, damage: [{ dice: '1d8', type: 'radiant' }],
    };
    expect(sacredFlame.level).toBe(0); // cantrip
    expect(sacredFlame.save?.ability).toBe('dex');
  });

  it('models a healing spell + spellcasting slots', () => {
    const healingWord: Spell = { id: 'healing-word', name: 'Healing Word', alias: 'Wellness Shot', level: 1, description: 'A word of comfort heals.', heal: '1d4', alwaysPrepared: false, prepared: true };
    const casting: SpellcastingInfo = { ability: 'wis', preparedCap: 6, slots: { 1: { max: 4, current: 4 }, 2: { max: 2, current: 2 } } };
    expect(healingWord.heal).toBe('1d4');
    expect(casting.slots?.[1]?.max).toBe(4);
    expect(casting.ability).toBe('wis');
  });
});
