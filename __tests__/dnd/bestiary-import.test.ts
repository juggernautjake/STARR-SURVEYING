// __tests__/dnd/bestiary-import.test.ts — SRD entry → creature row (P13-3, the pure half).
import { describe, it, expect } from 'vitest';
import { srdCreatureToRow, creatureSlug, crSort } from '@/lib/dnd/bestiary/import';

const PROV = {
  source: 'SRD 5.1', licence: 'CC-BY-4.0',
  attribution: 'This work includes material from the SRD 5.1, licensed under CC-BY-4.0.',
  slugPrefix: 'srd51', system: 'dnd5e-2014',
};

// Shaped like the 5.1 SRD as the common JSON publishers emit it.
const DRAGON = {
  name: 'Adult Red Dragon', size: 'Huge', type: 'dragon', alignment: 'chaotic evil',
  armor_class: 19, armor_desc: 'natural armor', hit_points: 256, hit_dice: '19d12+133',
  speed: '40 ft., climb 40 ft., fly 80 ft.',
  strength: 27, dexterity: 10, constitution: 25, intelligence: 16, wisdom: 13, charisma: 21,
  damage_immunities: 'fire', condition_immunities: 'frightened',
  senses: 'blindsight 60 ft., darkvision 120 ft.', languages: 'Common, Draconic',
  challenge_rating: '17',
  special_abilities: [{ name: 'Legendary Resistance', desc: 'Choose to succeed instead.' }],
  actions: [{ name: 'Bite', desc: 'Melee Weapon Attack.', attack_bonus: 14, damage_dice: '2d10+8' }],
  legendary_actions: [{ name: 'Tail Attack', desc: 'Makes a tail attack.' }],
};

describe('the transform', () => {
  const out = srdCreatureToRow(DRAGON, PROV)!;

  it('reads identity, statblock and entries', () => {
    expect(out.row.name).toBe('Adult Red Dragon');
    expect(out.row.statblock.ac).toBe(19);
    expect(out.row.statblock.acNote).toBe('natural armor');
    expect(out.row.statblock.hp).toBe(256);
    expect(out.row.statblock.abilities?.str).toBe(27);
    expect(out.row.statblock.conditionImmunities).toBe('frightened');
    expect(out.row.statblock.entries).toHaveLength(3);
  });

  it('maps each publisher key to the right entry kind', () => {
    const kinds = out.row.statblock.entries!.map((e) => e.kind);
    expect(kinds).toEqual(['trait', 'action', 'legendary']);
  });

  it('keeps toHit and damage OUT of the body, formatted as a modifier', () => {
    const bite = out.row.statblock.entries!.find((e) => e.name === 'Bite')!;
    expect(bite.toHit).toBe('+14');           // the raw JSON has the number 14
    expect(bite.damage).toBe('2d10+8');
    expect(bite.body).not.toContain('+14');
  });

  it('carries the licence through — it is not optional', () => {
    expect(out.row.source).toBe('SRD 5.1');
    expect(out.row.licence).toBe('CC-BY-4.0');
    expect(out.row.attribution).toContain('SRD 5.1');
  });

  it('composes the derived fields via deriveCreature', () => {
    // Tags, eligibility and variants all arrive from one call, so an importer cannot apply two of three.
    expect(out.row.tags).toEqual(expect.arrayContaining(['dragon', 'massive', 'boss']));
    expect(out.row.variant_eligible).toBe(true);
    expect(out.derived.variants.map((v) => v.tier)).toEqual(['weak', 'elite']);
  });
});

describe('shape tolerance', () => {
  it('accepts the nested `armor_class: [{ value }]` shape some publishers use', () => {
    const r = srdCreatureToRow({ ...DRAGON, armor_class: [{ value: 21, type: 'natural' }] }, PROV)!;
    expect(r.row.statblock.ac).toBe(21);
  });

  it('accepts camelCase keys', () => {
    const r = srdCreatureToRow({ name: 'Wolf', hitPoints: 11, challengeRating: '1/4', type: 'beast' }, PROV)!;
    expect(r.row.statblock.hp).toBe(11);
    expect(r.row.cr).toBe('1/4');
  });

  it('leaves a missing field UNDEFINED rather than defaulting it to 0', () => {
    // A defaulted AC prints a number nobody wrote, on a page a DM reads mid-combat.
    const r = srdCreatureToRow({ name: 'Ghost', type: 'undead' }, PROV)!;
    expect(r.row.statblock.ac).toBeUndefined();
    expect(r.row.statblock.hp).toBeUndefined();
  });

  it('refuses an entry with no name', () => {
    // Importing it as 'Unnamed' would put a row in the bestiary nobody can search for or fix.
    expect(srdCreatureToRow({ armor_class: 12 }, PROV)).toBeNull();
  });
});

describe('slug and sort', () => {
  it('is stable and prefixed, so a re-import UPSERTs', () => {
    expect(creatureSlug('Adult Red Dragon', 'srd51')).toBe('srd51:adult-red-dragon');
    expect(creatureSlug('  Will-o’-Wisp  ', 'srd51')).toBe('srd51:will-o-wisp');
  });

  it('sorts fractional CR correctly, and gives up honestly', () => {
    expect(crSort('1/8')).toBeCloseTo(0.125);
    expect(crSort('17')).toBe(17);
    expect(crSort('unknown')).toBeUndefined();   // NULL sorts last; 0 would claim a rank
    expect(crSort(undefined)).toBeUndefined();
  });
});
