import { describe, it, expect } from 'vitest';
import { assemblePF2VanillaCharacter } from '@/lib/dnd/systems/pathfinder2e/builder';
import { isPF2Character } from '@/lib/dnd/systems/pathfinder2e/model';
import { pf2MaxHp, pf2ArmorClass } from '@/lib/dnd/systems/pathfinder2e/rules';
import { summarizeCharacterProvenance } from '@/lib/dnd/provenance';

// The seam the pf2-build route persists and the character page reads: a shared-engine Character
// projection + the authoritative pf2e sidecar. buildPF2Character is tested elsewhere; this covers the
// projection + the two things the route actually does with it (isPF2Character guard, provenance).

describe('assemblePF2VanillaCharacter — the route/sheet seam', () => {
  const picks = {
    name: 'Seelah', level: 3, ancestry: 'Human', heritage: 'Versatile', background: 'Warrior',
    className: 'Champion', subclass: 'Paladin', deity: 'Iomedae', keyAttribute: 'STR' as const,
    attributes: { STR: 4, DEX: 0, CON: 2, INT: 0, WIS: 1, CHA: 3 }, armor: 'Breastplate', weapon: 'Longsword',
    trainedSkills: ['Diplomacy'],
  };
  const char = assemblePF2VanillaCharacter(picks);

  it('produces a pf2e sidecar that passes the page guard', () => {
    expect(isPF2Character(char.pf2e)).toBe(true);
  });

  it('projects identity onto the shared meta', () => {
    expect(char.meta.species).toBe('Human');
    expect(char.meta.className).toBe('Champion');
    expect(char.meta.subclass).toBe('Paladin');
    expect(char.meta.level).toBe(3);
    // Heritage/background/deity ride as chips (Human has no dedicated meta fields for them).
    expect(char.meta.chips.map((c) => c.text)).toEqual(expect.arrayContaining([
      'Heritage: Versatile', 'Background: Warrior', 'Deity: Iomedae',
    ]));
  });

  it('maps PF2 modifiers onto 5e-style ability scores (10 + 2×mod)', () => {
    expect(char.abilities.str).toBe(18); // +4
    expect(char.abilities.cha).toBe(16); // +3
    expect(char.abilities.dex).toBe(10); // +0
  });

  it('the projected headline numbers match the rules engine (not guessed)', () => {
    expect(char.combat.maxHp).toBe(pf2MaxHp(char.pf2e));
    expect(char.combat.ac).toBe(pf2ArmorClass(char.pf2e));
    expect(char.combat.acNote).toMatch(/Class DC/);
  });

  it('projects the weapon Strike into the shared attacks list', () => {
    expect(char.attacks.some((a) => a.name === 'Longsword')).toBe(true);
    expect(char.attacks.some((a) => a.name === 'Fist')).toBe(true);
  });

  it('records the kinded pf2Build block for later reference', () => {
    expect(char.pf2Build).toMatchObject({ ancestry: 'Human', className: 'Champion', subclass: 'Paladin' });
  });

  it('survives the route’s provenance pass without throwing and classifies vanilla content', () => {
    const summary = summarizeCharacterProvenance(char, 'pathfinder2e');
    expect(Array.isArray(summary.vanilla)).toBe(true);
    expect(Array.isArray(summary.custom)).toBe(true);
    // The Human ancestry + Champion class are vanilla PF2 content, so at least one element is tagged vanilla.
    expect(summary.vanilla.length).toBeGreaterThan(0);
  });

  it('a bare-minimum pick set still assembles a valid character', () => {
    const c = assemblePF2VanillaCharacter({ className: 'Fighter' });
    expect(isPF2Character(c.pf2e)).toBe(true);
    expect(c.combat.maxHp).toBeGreaterThan(0);
  });
});
