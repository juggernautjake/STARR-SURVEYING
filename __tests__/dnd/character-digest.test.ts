// __tests__/dnd/character-digest.test.ts — the facts block the librarian adjudicates from.
//
// The failure mode this guards against is the one that makes a rules bot worthless: answering
// "can I do X?" about a GENERIC character instead of THIS one, or inventing a feature/resource
// the sheet never had. So the digest must (a) carry the real numbers, (b) state absences
// explicitly, and (c) never contain anything the sheet doesn't say.
import { describe, it, expect } from 'vitest';
import { characterDigest, adjudicationInstruction } from '@/lib/dnd/character-digest';
import { blankCharacter } from '@/app/dnd/_sheet/data/blank';
import type { Character } from '@/app/dnd/_sheet/types';

function fixture(): Character {
  const c = blankCharacter('Rangor');
  c.meta = { ...c.meta, species: 'Ragnar', className: 'Barbarian', subclass: 'Path of the Juggernaut', level: 7 };
  c.abilities = { ...c.abilities, str: 18, dex: 14, con: 16, int: 8, wis: 12, cha: 10 };
  c.combat = { ...c.combat, ac: 17, maxHp: 68, currentHp: 41, tempHp: 5, speed: 30, exhaustion: 1, conditions: ['grappled'] } as Character['combat'];
  c.saves = { ...c.saves, str: { proficient: true, misc: 0 }, con: { proficient: true, misc: 0 } };
  c.skills = { ...c.skills, athletics: { prof: 'expertise', misc: 0 }, survival: { prof: 'proficient', misc: 0 } };
  c.resources = [{ id: 'r1', name: 'Momentum', current: 2, max: 4, resetOn: 'long' }] as Character['resources'];
  c.attacks = [{ id: 'a1', name: 'Cross Counter', range: 'melee 5 ft', damage: '1d8+4', damageType: 'bludgeoning' }] as Character['attacks'];
  c.features = [
    { id: 'f1', name: 'Living Momentum', source: 'Ragnar', body: ['Once per turn, when you move 10 feet in a straight line you gain a stacking bonus.'], unlockLevel: 1 },
    { id: 'f2', name: 'Unstoppable Force', source: 'Ragnar', body: ['You cannot be knocked prone while conscious.'], unlockLevel: 1 },
    { id: 'f3', name: 'Not Yet Yours', source: 'Barbarian', body: ['A level 20 capstone.'], unlockLevel: 20 },
  ] as Character['features'];
  return c;
}

describe('characterDigest carries the sheet, not a generic character', () => {
  const d = characterDigest(fixture(), 'dnd-5e-2024');

  it('names the character, its build and its system', () => {
    expect(d).toContain('NAME: Rangor');
    expect(d).toContain('Barbarian');
    expect(d).toContain('Path of the Juggernaut');
    expect(d).toContain('LEVEL: 7');
  });

  it('carries ability scores WITH their modifiers (the numbers rulings turn on)', () => {
    expect(d).toMatch(/STR 18 \(\+4\)/);
    expect(d).toMatch(/INT 8 \(-1\)/);
  });

  it('carries current state, not just maximums — an in-play ruling needs what is true now', () => {
    expect(d).toContain('HP 41/68 (+5 temp)');
    expect(d).toContain('AC 17');
    expect(d).toContain('Exhaustion 1');
  });

  it('states conditions explicitly, including their absence', () => {
    expect(characterDigest(fixture(), 'dnd-5e-2024')).toContain('CONDITIONS: grappled');
    // The absence of a condition is itself a fact a ruling can hinge on, so it must be stated
    // rather than left to the model to infer from silence.
    expect(characterDigest(blankCharacter('Nobody'), 'dnd-5e-2024')).toContain('CONDITIONS: none');
  });

  it('carries proficiencies, resources and attacks', () => {
    expect(d).toMatch(/SAVE PROFICIENCIES: .*STR.*CON/);
    expect(d).toContain('athletics (expertise)');
    expect(d).toContain('Momentum 2/4');
    expect(d).toContain('Cross Counter');
  });

  it('lists only the features the character actually HAS at its level', () => {
    expect(d).toContain('Living Momentum');
    expect(d).toContain('Unstoppable Force');
    // Level 20 feature on a level 7 character: handing this to the AI invites a ruling that
    // grants a power the player has not earned.
    expect(d).not.toContain('Not Yet Yours');
  });

  it('bounds the prompt on a big sheet, and says so rather than truncating silently', () => {
    const c = fixture();
    c.features = Array.from({ length: 40 }, (_, i) => ({
      id: `f${i}`, name: `Feature ${i}`, body: ['x'], unlockLevel: 1,
    })) as Character['features'];
    const big = characterDigest(c, 'dnd-5e-2024', { maxFeatures: 5 });
    expect(big).toContain('Feature 0');
    expect(big).not.toContain('Feature 30');
    expect(big).toContain('(+35 more not listed)');
  });

  it('omits bio prose — it is not evidence for a ruling and it burns context', () => {
    const c = fixture();
    c.bio = { ...c.bio, background: 'ZZBACKSTORYZZ', intro: ['ZZINTROZZ'] };
    const out = characterDigest(c, 'dnd-5e-2024');
    expect(out).not.toContain('ZZBACKSTORYZZ');
    expect(out).not.toContain('ZZINTROZZ');
  });
});

describe('adjudicationInstruction demands honesty over confidence', () => {
  const i = adjudicationInstruction('Rangor', 'D&D 5e (2024)');

  it('pins the ruling to the named character', () => {
    expect(i).toContain('Rangor');
    expect(i).toMatch(/ACTUAL numbers/);
  });

  it('requires the model to concede when the rules do not settle it', () => {
    // The whole point: a confident wrong ruling is worse than "the rules do not say".
    expect(i).toMatch(/do not settle it, SAY SO/);
    expect(i).toMatch(/DM's call/);
  });

  it('forbids inventing anything the sheet does not have', () => {
    expect(i).toMatch(/Never invent a feature, a number, or a resource/);
  });
});
