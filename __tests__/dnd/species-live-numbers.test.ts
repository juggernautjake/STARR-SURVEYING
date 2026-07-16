// __tests__/dnd/species-live-numbers.test.ts — a 2024 species' mechanics flow through the ledger
// as live numbers (Slice 4 follow-up). Size, creature type, darkvision and a differing walk speed
// become real, sourced values on the sheet — and NEVER leak into another game system.
import { describe, it, expect } from 'vitest';
import { speciesEffects } from '@/lib/dnd/species/apply';
import { findSpecies } from '@/lib/dnd/species/dnd5e-2024';
import { buildLedger } from '@/lib/dnd/effects/ledger';
import { blankCharacter } from '@/app/dnd/_sheet/data/blank';
import type { Character } from '@/app/dnd/_sheet/types';

const elf = findSpecies('elf')!; // Medium, speed 30, darkvision 60
const goliath = findSpecies('goliath')!; // Medium, speed 35, no darkvision
const human = findSpecies('human')!; // Small or Medium, speed 30, no darkvision

function charWith(species: string, speed = 30): Character {
  const c = blankCharacter('Test');
  c.meta.species = species;
  c.combat.speed = speed;
  return c;
}

describe('speciesEffects (the pure core)', () => {
  it('emits size + creature type always, darkvision when the species has it', () => {
    const effs = speciesEffects(elf); // baseWalk undefined → always emits speed too
    expect(effs).toContainEqual({ target: 'size', operation: 'set', value: 'Medium' });
    expect(effs).toContainEqual({ target: 'creature_type', operation: 'set', value: 'Humanoid' });
    expect(effs).toContainEqual({ target: 'grant_sense', operation: 'set', value: 'Darkvision 60 ft.' });
  });

  it('omits darkvision for a species without it', () => {
    expect(speciesEffects(goliath).some((e) => e.target === 'grant_sense')).toBe(false);
  });

  it('only emits walk speed when it differs from the stored base (no false "modified" star)', () => {
    // A 30-speed species on a default-30 sheet contributes NOTHING to speed (Slice 13 guard).
    expect(speciesEffects(elf, 30).some((e) => e.target === 'speed_walk')).toBe(false);
    // A 35-speed species does — its faster speed is real and worth showing.
    expect(speciesEffects(goliath, 30)).toContainEqual({ target: 'speed_walk', operation: 'set', value: 35 });
  });
});

describe('the ledger surfaces species mechanics on a 2024 sheet', () => {
  it('resolves size, creature type and darkvision, sourced to the species', () => {
    const led = buildLedger(charWith('elf'), { system: 'dnd5e-2024' });
    expect(led.identity('size')?.value).toBe('Medium');
    expect(led.identity('size')?.source).toBe('Elf');
    expect(led.identity('creature_type')?.value).toBe('Humanoid');
    const senses = led.explain('grant_sense').filter((c) => !c.suppressed);
    expect(senses.map((c) => String(c.effect.value))).toContain('Darkvision 60 ft.');
    expect(senses[0]?.source).toBe('Elf');
  });

  it("a Goliath's 35 speed folds into walk speed and stars it; a 30-speed elf does not", () => {
    const goli = buildLedger(charWith('goliath', 30), { system: 'dnd5e-2024' });
    expect(goli.value('speed_walk', 30)).toBe(35);
    expect(goli.isModified('speed_walk')).toBe(true);
    const elfLed = buildLedger(charWith('elf', 30), { system: 'dnd5e-2024' });
    expect(elfLed.value('speed_walk', 30)).toBe(30);
    expect(elfLed.isModified('speed_walk')).toBe(false); // no false star
  });
});

describe("a species' rules never leak into another system (Ground Rule 1)", () => {
  it('adds NO species source without the 2024 system in context', () => {
    const led = buildLedger(charWith('elf'), {}); // no system
    expect(led.identity('size')).toBeNull();
    expect(led.explain('grant_sense').length).toBe(0);
  });

  it('adds NO species source for a different system, even if the key coincides', () => {
    const led = buildLedger(charWith('elf'), { system: 'pathfinder-2e' });
    expect(led.identity('size')).toBeNull();
    expect(led.explain('grant_sense').length).toBe(0);
  });

  it('a custom/unknown species contributes nothing', () => {
    const led = buildLedger(charWith('my-homebrew-lizardfolk'), { system: 'dnd5e-2024' });
    expect(led.identity('creature_type')).toBeNull();
  });

  it('a "Small or Medium" species reports its category verbatim', () => {
    const led = buildLedger(charWith('human'), { system: 'dnd5e-2024' });
    expect(led.identity('size')?.value).toBe(human.size); // 'Small or Medium'
  });
});
