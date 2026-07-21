// lib/dnd/spells/mechanics.ts — how spellcasting actually WORKS, with worked examples.
//
// The catalog next door says what each spell does. This says how the machinery around it
// resolves: what a slot is, how upcasting differs from cantrip scaling, when concentration
// breaks, what a somatic component costs you if your hands are full. These are the questions
// players actually ask mid-session, and the answers are what the AI needs in order to explain
// a rule rather than restate a spell's text.
//
// Every entry pairs a RULE with a WORKED EXAMPLE using concrete numbers, because the numbers
// are where people get it wrong — "half damage on a save" and "DC 10 or half the damage,
// whichever is higher" both sound obvious until you have to apply them to a 22-damage hit.
//
// HOUSE STYLE: paraphrased mechanics, attributed via `source`, never verbatim rulebook prose.
// The examples are original — invented scenarios illustrating the rule, not book text.

export type MechanicTopic =
  | 'slots' | 'scaling' | 'concentration' | 'components'
  | 'resolution' | 'targeting' | 'preparation' | 'ritual';

export interface SpellMechanic {
  key: string;
  title: string;
  topic: MechanicTopic;
  /** The rule itself, paraphrased. */
  rule: string;
  /** A concrete worked example with real numbers. */
  example: string;
  /** Traps and edge cases people get wrong. */
  gotchas?: string[];
  editionNote?: string;
  source: string;
}

const PHB = 'PHB 2024';

export const SPELL_MECHANICS: SpellMechanic[] = [
  // ── Slots and scaling ─────────────────────────────────────────────────────
  {
    key: 'spell-slots', title: 'Spell slots', topic: 'slots',
    rule: 'Casting a levelled spell expends a slot of that level or higher. Slots are a separate resource from which spells you know or have prepared, and you regain all of them on a long rest.',
    example: 'A 5th-level Wizard has four 1st-level, three 2nd-level, and two 3rd-level slots. Casting Magic Missile (1st) three times leaves one 1st-level slot. She can still cast it a fourth time by spending a 2nd- or 3rd-level slot — it just costs more than it needs to, and the spell gets stronger for it.',
    gotchas: [
      'Knowing or preparing a spell costs nothing by itself — only casting spends a slot.',
      'Cantrips never use slots and can be cast at will.',
    ],
    source: PHB,
  },
  {
    key: 'upcasting', title: 'Upcasting (casting at a higher level)', topic: 'scaling',
    rule: 'Spending a slot above a spell\'s base level strengthens it only if the spell says so, in its higher-level entry. A spell with no such entry gains nothing from the bigger slot.',
    example: 'Magic Missile fires three darts at 1st level and one more per level above that. Cast with a 3rd-level slot it fires five darts — 5 × (1d4 + 1). Shield, by contrast, gives +5 AC no matter what slot you burn, so upcasting it is pure waste.',
    gotchas: [
      'Upcasting is a choice made at cast time, not a property of the spell.',
      'A spell that only extends its duration when upcast (Hex, Hunter\'s Mark) gets no extra damage from the larger slot.',
    ],
    source: PHB,
  },
  {
    key: 'cantrip-scaling', title: 'Cantrip scaling', topic: 'scaling',
    rule: 'Cantrips get stronger at fixed CHARACTER levels — 5, 11, and 17 — not from spell slots and not from your level in the casting class.',
    example: 'A Wizard\'s Fire Bolt deals 1d10 at levels 1–4, 2d10 at 5–10, 3d10 at 11–16, and 4d10 at 17+. A Fighter 4 / Wizard 1 is character level 5, so their Fire Bolt already deals 2d10 despite only one level of Wizard.',
    gotchas: ['This is the trap in multiclassing: cantrips scale off total character level, while spell slots and prepared counts come from class levels.'],
    source: PHB,
  },

  // ── Resolution ────────────────────────────────────────────────────────────
  {
    key: 'spell-save-dc', title: 'Spell save DC', topic: 'resolution',
    rule: 'Your spell save DC is 8 + your proficiency bonus + your spellcasting ability modifier. It is the number a target must meet or beat on its saving throw.',
    example: 'A 5th-level Cleric with Wisdom 18 (+4) has proficiency +3, so her save DC is 8 + 3 + 4 = 15. A goblin she targets with Sacred Flame rolls a Dexterity save: a 14 fails and takes the damage, a 15 succeeds and takes none.',
    gotchas: [
      'Each class uses its own ability — a Cleric/Wizard has two different save DCs, one per class.',
      'A target meeting the DC exactly SUCCEEDS; saves succeed on a tie.',
    ],
    source: PHB,
  },
  {
    key: 'spell-attack-bonus', title: 'Spell attack rolls', topic: 'resolution',
    rule: 'Your spell attack bonus is your proficiency bonus + your spellcasting ability modifier. Roll d20 + that against the target\'s AC, exactly like a weapon attack — including advantage, disadvantage, and critical hits.',
    example: 'The same Cleric (prof +3, Wis +4) attacks with Guiding Bolt at +7. Against AC 15 she needs an 8 or better. On a natural 20 the spell crits, doubling its damage dice: 8d6 radiant rather than 4d6.',
    gotchas: [
      'Spells that make an attack roll can crit; spells that call for a saving throw never do.',
      'Cover raises the target\'s AC against spell attacks, but does not help against most saving-throw spells.',
    ],
    source: PHB,
  },
  {
    key: 'save-for-half', title: 'Half damage on a successful save', topic: 'resolution',
    rule: 'Many damaging spells deal half damage on a successful save. Roll the damage once for all targets, then halve it for each one that succeeded, rounding down.',
    example: 'Burning Hands rolls 3d6 and comes up 11. Three goblins are caught: two fail their Dexterity saves and take 11 each; the third succeeds and takes 5 (11 halved, rounded down).',
    gotchas: [
      'You roll the dice ONCE for the whole area, not per target.',
      'Rounding is always down, so 1 point halved is 0.',
    ],
    source: PHB,
  },

  // ── Concentration ─────────────────────────────────────────────────────────
  {
    key: 'concentration', title: 'Concentration', topic: 'concentration',
    rule: 'You can concentrate on only one spell at a time. Casting a second concentration spell ends the first immediately, even if the new spell fails.',
    example: 'A Druid concentrating on Faerie Fire (1 minute) casts Fog Cloud, which also needs concentration. Faerie Fire ends the instant Fog Cloud is cast — 40 seconds of duration wasted, the outlines vanish, and the enemies stop being easy to hit.',
    gotchas: [
      'Ending concentration is free and requires no action.',
      'You can cast NON-concentration spells freely while concentrating.',
      'Being Incapacitated, or dying, ends concentration.',
    ],
    source: PHB,
  },
  {
    key: 'concentration-save', title: 'Losing concentration to damage', topic: 'concentration',
    rule: 'When you take damage while concentrating, make a Constitution saving throw: DC 10, or half the damage taken, whichever is HIGHER. Fail and the spell ends.',
    example: 'A Wizard concentrating on Fog Cloud takes 22 damage from a hit. Half of 22 is 11, which beats 10, so the DC is 11. Later he takes 9 damage — half is 4, below 10, so that DC is 10.',
    gotchas: [
      'Each separate instance of damage forces its own save — two hits in a round means two saves.',
      'War Caster grants advantage on these saves; Constitution save proficiency helps a great deal for a concentration-heavy caster.',
    ],
    source: PHB,
  },

  // ── Components ────────────────────────────────────────────────────────────
  {
    key: 'components-vsm', title: 'Verbal, Somatic, and Material components', topic: 'components',
    rule: 'V means you must speak audibly, S means you need a free hand to gesture, and M means you need the listed material — or a component pouch or spellcasting focus in its place.',
    example: 'A Wizard holding a longsword in 1 hand and a shield on the other tries to cast Shield (V, S). Both hands are occupied, so he cannot make the somatic gesture — unless he stows something, or holds an arcane focus in 1 hand, which can serve for both the material component and the gesture.',
    gotchas: [
      'Being Silenced or Gagged blocks V spells; being Restrained or bound blocks S spells.',
      'A single free hand can both hold a focus and perform somatic components.',
    ],
    source: PHB,
  },
  {
    key: 'costly-materials', title: 'Materials with a gold cost', topic: 'components',
    rule: 'A material component with a stated gold-piece cost must actually be possessed — a focus or component pouch will NOT substitute for it. If the spell says the component is consumed, it is destroyed on casting and must be replaced.',
    example: 'Identify needs a pearl worth 100+ GP, but does not consume it — the same pearl works forever. Find Familiar needs 10 GP of incense and DOES consume it, so every casting costs another 10 GP.',
    gotchas: [
      'This is the real limiter on revival and divination magic — the gold, not the slot.',
      '"Consumed" appears in the component line; if it is absent, the component is reusable.',
    ],
    source: PHB,
  },

  // ── Targeting ─────────────────────────────────────────────────────────────
  {
    key: 'areas-of-effect', title: 'Areas of effect', topic: 'targeting',
    rule: 'Area spells use one of a fixed set of shapes: cone, cube, cylinder, emanation, line, or sphere. The spell\'s point of origin determines what is caught, and a creature must be inside the area to be affected.',
    example: 'Burning Hands is a 15-foot cone from your hands: every creature in that wedge saves. Fog Cloud is a 20-foot-radius sphere centred on a point you pick up to 120 feet away — you can place it around enemies without standing next to them.',
    gotchas: [
      'An EMANATION moves with its source and, in 2024, does not affect creatures already inside it when it appears until they enter or start a turn there.',
      'You generally need a clear path to the point of origin — you cannot centre a sphere behind a closed door.',
    ],
    editionNote: 'The 2024 rules formalised these six shapes and introduced Emanation as a distinct type.',
    source: PHB,
  },
  {
    key: 'targeting-yourself', title: 'Choosing targets and hitting allies', topic: 'targeting',
    rule: 'Unless a spell says "creatures you choose" or "enemies", an area affects EVERYONE in it, allies and yourself included.',
    example: 'A Fireball centred on a melee brawl catches your own Barbarian in its 20-foot radius; he rolls a Dexterity save like anyone else and takes 8d6 on a failure. Word of Radiance, by contrast, says creatures of your choice — so the Barbarian standing 5 feet away is simply left out.',
    gotchas: ['Read the target line carefully: "each creature" and "creatures you choose" behave completely differently in a crowded room.'],
    source: PHB,
  },

  // ── Preparation and ritual ────────────────────────────────────────────────
  {
    key: 'prepared-vs-known', title: 'Prepared spells vs spells known', topic: 'preparation',
    rule: 'Prepared casters choose a fresh list after a long rest from their whole class list; known casters have a fixed repertoire that changes only on level-up. Either way, the number of spells you can cast is limited by slots, not by list size.',
    example: 'A Cleric with Wisdom 18 at 5th level prepares Wisdom modifier + Cleric level = 4 + 5 = 9 spells today, chosen from the entire Cleric list, and can swap them all tomorrow. A Sorcerer knows a shorter fixed list and swaps only one spell per level-up.',
    gotchas: [
      'Preparing a spell does not reserve a slot for it — you can cast the same prepared spell repeatedly until slots run out.',
      'Cantrips are always available and are not part of the prepared count.',
    ],
    editionNote: '2024 moved most classes toward the prepared model and made swapping more forgiving than in 2014.',
    source: PHB,
  },
  {
    key: 'ritual-casting', title: 'Ritual casting', topic: 'ritual',
    rule: 'A spell tagged as a ritual can be cast without expending a slot by taking 10 minutes longer than its normal casting time. It must still be prepared or known, and the ritual version cannot be upcast.',
    example: 'Detect Magic normally takes an action and a 1st-level slot. Cast as a ritual it takes 10 minutes and 1 action of casting time but costs no slot at all — ideal before opening a suspicious chest, useless mid-combat.',
    gotchas: [
      'Ritual casting is free in slots but expensive in time — it is an exploration tool, not a combat one.',
      'Not every caster can ritual cast; the class feature has to grant it.',
    ],
    source: PHB,
  },
];

const BY_KEY = new Map(SPELL_MECHANICS.map((m) => [m.key, m]));

export function spellMechanic(key: string): SpellMechanic | undefined {
  return BY_KEY.get(key);
}

export function spellMechanicsByTopic(topic: MechanicTopic): SpellMechanic[] {
  return SPELL_MECHANICS.filter((m) => m.topic === topic);
}

export const MECHANIC_TOPICS: MechanicTopic[] = [
  'slots', 'scaling', 'concentration', 'components', 'resolution', 'targeting', 'preparation', 'ritual',
];

// ── The system dispatcher ───────────────────────────────────────────────────
//
// Lives here rather than in ./index.ts because that module is the SPELL CATALOG dispatcher and is
// owned elsewhere; mechanics are a separate axis of content with a separate pair of modules, so
// they get their own entry point. The idiom is deliberately identical to `spellCatalog()` next
// door: switch on the system, and let the default arm return EMPTY.
//
// The import below is a value import and mechanics-2014.ts imports only a TYPE back from this
// file, so the cycle is erased at compile time and there is no runtime import loop.
import { SPELL_MECHANICS_2014 } from './mechanics-2014';

export { SPELL_MECHANICS_2014 } from './mechanics-2014';

const NO_MECHANICS: SpellMechanic[] = [];

/** The spellcasting-machinery explainers for a game system.
 *
 *  Ground Rule 2: an unknown or unmodelled system gets [] — never another system's rules. Serving
 *  the 2024 explainers to a 2014 sheet would tell a player Emanation is an area shape and that
 *  their Sorcerer can re-choose spells on a long rest, both of which are false in 2014 and neither
 *  of which the player would have any way to catch. Empty is honest; wrong is not. */
export function spellMechanicsFor(system: string | null | undefined): SpellMechanic[] {
  switch (system) {
    case 'dnd5e-2024':
      return SPELL_MECHANICS;
    case 'dnd5e-2014':
      return SPELL_MECHANICS_2014;
    default:
      return NO_MECHANICS;
  }
}
