// __tests__/dnd/bestiary-open5e.test.ts — the third source shape (Open5e v2 + the v1 action fallback).
//
// EVERY FIXTURE BELOW IS COPIED FROM A LIVE RESPONSE, not composed from what the schema ought to look
// like. That rule is the one this module exists because of: B1-3 lost `senses`, `saves` and `skills` on
// 334 of 334 creatures to a fixture that guessed the publisher's shape, and B2-3 refused two legitimate
// images to an allowlist written against SPDX names the source does not use. A fixture author writes the
// shape they expect; only the real publication carries the shape the publisher chose.
import { describe, it, expect } from 'vitest';
import {
  entriesFor,
  open5eCreatureToRow,
  open5eDamage,
  open5eIsRedistributable,
  open5eLicenceLabel,
  open5eSaves,
  open5eSenses,
  open5eSkills,
  open5eSpeed,
  open5eUses,
  parseAttackFromProse,
  v1FallbackEntries,
} from '@/lib/dnd/bestiary/import-open5e';

const PROV = {
  source: 'Tome of Beasts 1 (2023 Edition)',
  licence: 'OGL-1.0a',
  attribution: 'Tome of Beasts 1 (2023 Edition). © Kobold Press. Used under OGL-1.0a.',
  slugPrefix: 'tob1',
  system: 'dnd5e-2014',
};

/** Verbatim from https://api.open5e.com/v2/creatures/?document__key=tob-2023 — trimmed, never reshaped. */
const ABOMINABLE_BEAUTY = {
  key: 'tob-2023_abominable-beauty',
  name: 'Abominable Beauty',
  type: { name: 'Fey', key: 'fey' },
  size: { name: 'Medium', key: 'medium' },
  challenge_rating: 11,
  speed: { walk: 30, unit: 'feet' },
  speed_all: { unit: 'feet', walk: 30, hover: false, fly: 0, burrow: 0, climb: 15, swim: 15 },
  alignment: 'Neutral Evil',
  languages: { as_string: 'Common, Draconic, Elvish, Sylvan', data: [{ name: 'Common' }] },
  armor_class: 18,
  armor_detail: 'natural armor',
  hit_points: 187,
  hit_dice: '22d8 + 88',
  experience_points: 7200,
  ability_scores: { strength: 17, dexterity: 18, constitution: 18, intelligence: 17, wisdom: 16, charisma: 26 },
  saving_throws: { dexterity: 8, constitution: 8, charisma: 12 },
  saving_throws_all: { strength: 3, dexterity: 8, constitution: 8, intelligence: 3, wisdom: 3, charisma: 12 },
  skill_bonuses: { deception: 12, perception: 7, performance: 12, persuasion: 12 },
  skill_bonuses_all: { acrobatics: 4, animal_handling: 3, deception: 12, sleight_of_hand: 4 },
  passive_perception: 17,
  resistances_and_immunities: {
    damage_immunities_display: 'fire',
    damage_resistances_display: '',
    damage_vulnerabilities_display: '',
    condition_immunities_display: '',
  },
  normal_sight_range: 10560,
  darkvision_range: null,
  blindsight_range: null,
  tremorsense_range: null,
  truesight_range: null,
  actions: [
    {
      name: 'Deafening Voice',
      desc: 'The abominable beauty speaks a lilting incantation.',
      attacks: [], action_type: 'ACTION', order_in_statblock: 3,
      legendary_action_cost: null, usage_limits: { type: 'RECHARGE_ON_ROLL', param: 5 },
    },
    {
      name: 'Multiattack',
      desc: 'The abominable beauty uses Blinding Gaze. She then makes two Slam attacks.',
      attacks: [], action_type: 'ACTION', order_in_statblock: 0,
      legendary_action_cost: null, usage_limits: null,
    },
    {
      name: 'Slam',
      desc: 'Melee Weapon Attack: +8 to hit, reach 5 ft., one target. Hit: 8 (1d8 + 4) bludgeoning damage plus 21 (6d6) fire damage.',
      attacks: [{
        name: 'Slam attack', attack_type: 'WEAPON', to_hit_mod: 8, reach: 5,
        damage_die_count: 1, damage_die_type: 'D8', damage_bonus: 4, damage_type: null,
        extra_damage_die_count: 6, extra_damage_die_type: 'D6', extra_damage_bonus: 0,
        extra_damage_type: { name: 'Fire', key: 'fire' },
      }],
      action_type: 'ACTION', order_in_statblock: 1, legendary_action_cost: null, usage_limits: null,
    },
  ],
  traits: [{ name: 'Burning Touch', desc: 'When the abominable beauty hits with a Slam attack…' }],
  environments: [],
};

describe('licence gate', () => {
  it('accepts a document that states a licence we can redistribute under', () => {
    expect(open5eIsRedistributable([{ key: 'ogl-10a', name: 'OPEN GAME LICENSE Version 1.0a' }])).toBe(true);
    expect(open5eIsRedistributable([{ key: 'cc-by-40' }])).toBe(true);
  });

  it('accepts a dual-licensed document on either licence', () => {
    // The lesson B1-5 paid for: requiring the FIRST stated licence to be the right one refused a genuine
    // Monster Core creature whose six items carried both OGL and ORC.
    expect(open5eIsRedistributable([{ key: 'cc-by-40' }, { key: 'ogl-10a' }])).toBe(true);
  });

  it('refuses a document that states no licence, because unstated is unknown', () => {
    expect(open5eIsRedistributable([])).toBe(false);
    expect(open5eIsRedistributable(undefined)).toBe(false);
    expect(open5eIsRedistributable([{ name: 'All rights reserved' }])).toBe(false);
  });

  it('names every licence on the row when a document is dual-licensed', () => {
    // Which of the two we rely on is not ours to decide for a downstream reader.
    expect(open5eLicenceLabel([{ key: 'cc-by-40' }, { key: 'ogl-10a' }])).toBe('CC-BY-4.0 / OGL-1.0a');
  });
});

describe('the lines Open5e publishes as numbers', () => {
  it('composes a senses line from the range integers', () => {
    // The trap: the other two sources publish a senses STRING. Here there is no prose anywhere, so a
    // reader looking for one finds nothing and every creature silently loses its darkvision.
    expect(open5eSenses({ darkvision_range: 120, blindsight_range: 30, passive_perception: 15 }))
      .toBe('blindsight 30 ft., darkvision 120 ft., passive Perception 15');
  });

  it('does not print normal sight, which is 10560 on things that merely have eyes', () => {
    expect(open5eSenses(ABOMINABLE_BEAUTY as never)).toBe('passive Perception 17');
  });

  it('prints only the speeds a creature has', () => {
    // `speed_all` is DERIVED, not a superset: it zero-fills the modes a creature lacks AND fills in 5e's
    // default half-speed climb and swim for everything with legs. The Abominable Beauty's own `speed` is
    // walk 30 alone, while `speed_all` reads climb 15, swim 15, crawl 15 — so a reader that took the
    // fuller-looking object would print two movement modes this creature does not have, on 2,494 rows.
    expect(open5eSpeed(ABOMINABLE_BEAUTY as never)).toBe('30 ft.');
    expect(open5eSpeed({ speed: { walk: 20, climb: 20, unit: 'feet' } })).toBe('20 ft., climb 20 ft.');
  });

  it('marks a flier that hovers', () => {
    expect(open5eSpeed({ speed: { walk: 0, fly: 60, unit: 'feet' }, speed_all: { hover: true } }))
      .toBe('fly 60 ft. (hover)');
  });

  it('prints the proficient saves, not the zero-filled ones', () => {
    // `saving_throws_all` gives every ability a number. Printed, it states six proficient saves on a
    // creature the book gives three — an inflation of exactly the kind G5 forbids inventing.
    expect(open5eSaves(ABOMINABLE_BEAUTY as never)).toBe('DEX +8, CON +8, CHA +12');
  });

  it('prints skills with their printed names', () => {
    expect(open5eSkills(ABOMINABLE_BEAUTY as never)).toBe('Deception +12, Perception +7, Performance +12, Persuasion +12');
    expect(open5eSkills({ skill_bonuses: { animal_handling: 3, sleight_of_hand: 4 } }))
      .toBe('Animal Handling +3, Sleight of Hand +4');
  });
});

describe('actions', () => {
  it('orders by the source\'s own order_in_statblock, so Multiattack comes first', () => {
    // The array arrives ALPHABETICAL, which buries Multiattack in the middle where it means nothing.
    const entries = entriesFor(ABOMINABLE_BEAUTY as never);
    const actions = entries.filter((e) => e.kind === 'action').map((e) => e.name);
    expect(actions[0]).toBe('Multiattack');
  });

  it('carries the structured attack across so the entry is rollable', () => {
    const slam = entriesFor(ABOMINABLE_BEAUTY as never).find((e) => e.name === 'Slam');
    expect(slam?.toHit).toBe('+8');
    expect(slam?.damage).toBe('1d8 + 4 plus 6d6 fire');
  });

  it('reads a recharge as the resource it is', () => {
    // "Recharge 5-6" is a thing a DM spends mid-fight, not a label — hence its own field.
    expect(open5eUses({ type: 'RECHARGE_ON_ROLL', param: 5 })).toBe('Recharge 5-6');
    expect(open5eUses({ type: 'RECHARGE_ON_ROLL', param: 6 })).toBe('Recharge 6');
    expect(open5eUses({ type: 'PER_DAY', param: 3 })).toBe('3/Day');
    expect(open5eUses(null)).toBeUndefined();
  });

  it('prints both halves of a two-damage-type attack', () => {
    expect(open5eDamage({
      damage_die_count: 1, damage_die_type: 'D8', damage_bonus: 4, damage_type: { name: 'Bludgeoning' },
      extra_damage_die_count: 6, extra_damage_die_type: 'D6', extra_damage_bonus: 0, extra_damage_type: { name: 'Fire' },
    })).toBe('1d8 + 4 bludgeoning plus 6d6 fire');
  });
});

describe('the v1 fallback — 396 of Tome of Beasts 3 arrive from v2 with no actions at all', () => {
  /** Verbatim from https://api.open5e.com/v1/monsters/ahu-nixta-mechanon/ */
  const V1 = {
    slug: 'ahu-nixta-mechanon',
    actions: [
      { name: 'Multiattack', desc: 'Two Utility Arms or one Slam and one Utility Arm.' },
      { name: 'Slam', desc: 'Melee Weapon Attack: +5 to hit, 5 ft., one target, 10 (2d6+3) bludgeoning damage.' },
    ],
    bonus_actions: null,
    reactions: [{ name: 'Parry', desc: 'The mechanon adds 2 to its AC against one melee attack.' }],
    legendary_actions: null,
  };

  it('recovers the actions v2 never migrated', () => {
    const entries = v1FallbackEntries(V1 as never);
    expect(entries.filter((e) => e.kind === 'action').map((e) => e.name)).toEqual(['Multiattack', 'Slam']);
    expect(entries.find((e) => e.kind === 'reaction')?.name).toBe('Parry');
  });

  it('reads the to-hit and damage out of the prose, so a recovered attack is still rollable', () => {
    // Extraction, not invention: both numbers are stated verbatim in the text the publisher wrote.
    const slam = v1FallbackEntries(V1 as never).find((e) => e.name === 'Slam');
    expect(slam?.toHit).toBe('+5');
    expect(slam?.damage).toBe('2d6+3 bludgeoning');
  });

  it('drops the averaged number and keeps the dice', () => {
    // "10 (2d6+3)" is one hit stated twice; printing both shows a DM two numbers for one attack.
    expect(parseAttackFromProse('Hit: 10 (2d6+3) bludgeoning damage.').damage).toBe('2d6+3 bludgeoning');
    expect(parseAttackFromProse('It flails wildly.')).toEqual({});
  });

  it('fills only the kinds v2 left empty', () => {
    // THE BUG THIS TEST EXISTS FOR. The first version fell back only when v2 had nothing but traits — and
    // 205 Tome of Beasts 3 creatures have exactly one migrated entry, a Reaction. Those kept the reaction
    // and lost every attack: 205 monsters that could parry but never strike.
    const v2WithOnlyAReaction = {
      name: 'Mechanon',
      actions: [{ name: 'Parry', desc: 'v2 parry, with structure.', attacks: [], action_type: 'REACTION', order_in_statblock: 0 }],
      traits: [{ name: 'Construct Nature', desc: 'It does not require air.' }],
    };
    const entries = entriesFor(v2WithOnlyAReaction as never, V1 as never);
    expect(entries.filter((e) => e.kind === 'action').map((e) => e.name)).toEqual(['Multiattack', 'Slam']);
    // v2 wins where it has data, so the reaction is v2's and is not listed twice.
    expect(entries.filter((e) => e.kind === 'reaction')).toHaveLength(1);
    expect(entries.find((e) => e.kind === 'reaction')?.body).toBe('v2 parry, with structure.');
  });

  it('leaves a genuinely actionless creature alone', () => {
    // A Frog, a Seahorse and a Shrieker really are printed with no actions. Padding them would be the
    // same invention the fallback exists to avoid, in the opposite direction.
    expect(entriesFor({ name: 'Frog', actions: [], traits: [{ name: 'Amphibious', desc: 'It breathes both.' }] } as never, undefined))
      .toHaveLength(1);
  });
});

describe('the whole row', () => {
  const imported = open5eCreatureToRow(ABOMINABLE_BEAUTY as never, PROV)!;

  it('records provenance that a reader can act on', () => {
    expect(imported.row.licence).toBe('OGL-1.0a');
    expect(imported.row.attribution).toContain('Kobold Press');
    expect(imported.row.source).toBe('Tome of Beasts 1 (2023 Edition)');
    // The book is named in the description too, so a DM can tell a Tome of Beasts creature from an SRD
    // one without leaving the page.
    expect(imported.row.description).toContain('Tome of Beasts');
  });

  it('prefixes the slug per book, because two books name the same creature', () => {
    expect(imported.row.slug).toBe('tob1:abominable-beauty');
  });

  it('reads type and size out of the objects they arrive in', () => {
    // `type` is `{ name: "Fey", key: "fey" }` here and a bare string in both other sources. Read as a
    // string it stringifies to "[object Object]" and every creature is untyped.
    expect(imported.row.type).toBe('fey');
    expect(imported.row.size).toBe('Medium');
    expect(imported.row.tags).toEqual(['fey']);
  });

  it('carries the numbers verbatim and derives nothing it was not given', () => {
    expect(imported.row.statblock.ac).toBe(18);
    expect(imported.row.statblock.acNote).toBe('natural armor');
    expect(imported.row.statblock.hp).toBe(187);
    expect(imported.row.statblock.immunities).toBe('fire');
    // Empty display strings are absences, not empty lines.
    expect(imported.row.statblock.resistances).toBeUndefined();
    expect(imported.row.cr).toBe('11');
    expect(imported.row.cr_sort).toBe(11);
  });

  it('refuses a nameless creature rather than cataloguing a blank', () => {
    expect(open5eCreatureToRow({ armor_class: 12 }, PROV)).toBeNull();
  });
});
