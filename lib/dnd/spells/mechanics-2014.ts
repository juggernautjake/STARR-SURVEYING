// lib/dnd/spells/mechanics-2014.ts — how spellcasting WORKS in the 2014 edition, with worked examples.
//
// This is the SIBLING of mechanics.ts, not a variant of it — the same relationship dnd5e-2014.ts
// has to dnd5e-2024.ts, and for the same reason. It would have been shorter to add an `edition`
// flag to the 2024 entries and branch inside each `rule` string, and that would have been the
// wrong shape: the two editions disagree about the SET of rules, not just their numbers. 2024 has
// an area shape 2014 does not (Emanation). 2014 has a per-class ritual-casting patchwork that 2024
// flattened. A single record cannot honestly carry both, and a reader of a merged file could never
// tell which half applied to the sheet in front of them. Ground Rule 1 — content is reached through
// a per-system dispatcher, never by widening one system's module — settles it: two files, one
// `spellMechanicsFor()` in mechanics.ts, and a 2014 sheet that can never be handed a 2024 fact.
//
// Nothing here was copied from mechanics.ts. Every rule was re-derived from the 2014 sources below
// and every worked example is freshly invented for this file, so where the two editions genuinely
// agree (the concentration save is DC 10 or half the damage in both) the agreement is a verified
// finding rather than an assumption inherited by copy-paste.
//
// LICENSING BASIS — SRD 5.1, released by Wizards of the Coast under CC-BY-4.0, cross-checked
// against Wizards' own free 2014 Basic Rules PDF. Mechanics are paraphrased in our own words;
// only numbers and rules-term names are reproduced, and those are facts, not expression. The
// worked EXAMPLES are original scenarios written for this file — no book text is transcribed.
// Deliberately NOT used: D&D Beyond, Roll20, or 5e.tools — licensed or contested redistribution.
//
// GROUND RULE 2 — NEVER INVENTED. Where a 2014 rule could not be confirmed in a clean source, the
// ENTRY IS ABSENT rather than guessed, and where a 2014/2024 difference could not be confirmed,
// `editionNote` is OMITTED rather than asserted. An `editionNote` in this file is a claim that the
// editions actually differ, and every one of them was checked in both directions.
//
// THE LOAD-BEARING DIFFERENCES, for anyone tempted to sync this file to the 2024 one:
//   · Areas of effect: 2014 has FIVE shapes — cone, cube, cylinder, line, sphere. Emanation is a
//     2024 invention and must never appear here.
//   · Prepared vs known: 2014's split is hard. Prepared = Cleric, Druid, Paladin, Wizard.
//     Known = Bard, Ranger, Sorcerer, Warlock, who swap exactly one spell per level-up.
//   · Ritual casting: 2014 grants it per class, on different terms. The Wizard casts rituals from
//     the spellbook WITHOUT preparing them; the Cleric and Druid must have the ritual prepared;
//     the Bard rituals anything it knows; the Sorcerer, Paladin, and Ranger cannot ritual at all.
import type { SpellMechanic } from './mechanics';

/** SRD 5.1, published by Wizards of the Coast under CC-BY-4.0. */
const SRD = 'SRD 5.1';

export const SPELL_MECHANICS_2014: SpellMechanic[] = [
  // ── Slots and scaling ─────────────────────────────────────────────────────
  {
    key: 'spell-slots-2014', title: 'Spell slots', topic: 'slots',
    rule: 'Casting a spell of 1st level or higher expends a slot of that level or higher. Slots are a separate resource from the spells you know or have prepared, and finishing a long rest restores all of them.',
    example: 'A 4th-level Druid has four 1st-level and three 2nd-level slots. She casts Entangle (1st) twice and Moonbeam (2nd) once, leaving two 1st-level and two 2nd-level slots. Nothing about that spends her prepared list — she can cast Entangle again with either remaining slot level.',
    gotchas: [
      'Preparing or knowing a spell costs nothing on its own; only casting spends a slot.',
      'Cantrips never consume a slot and are cast at will.',
      'The Warlock is the exception to the shape of the table: Pact Magic gives few slots that are ALL the same level, and they come back on a short rest as well as a long one.',
    ],
    source: SRD,
  },
  {
    key: 'upcasting-2014', title: 'Upcasting (casting at a higher level)', topic: 'scaling',
    rule: 'When you spend a slot above a spell\'s own level, the spell is cast at the slot\'s level — but it only does more if its "At Higher Levels" entry says so. A spell without that entry gains nothing from the larger slot.',
    example: 'Cure Wounds heals 1d8 + your spellcasting modifier, plus another 1d8 per slot level above 1st. A Cleric with Wisdom +3 casting it from a 3rd-level slot heals 3d8 + 3. Feather Fall has no higher-level entry, so spending a 4th-level slot on it does exactly what a 1st-level slot would — a wasted slot.',
    gotchas: [
      'Upcasting is decided at the moment of casting, not baked into the spell.',
      'Some spells scale only their duration or their number of targets when upcast — read the entry before assuming more dice.',
    ],
    source: SRD,
  },
  {
    key: 'cantrip-scaling-2014', title: 'Cantrip scaling', topic: 'scaling',
    rule: 'Damaging cantrips get stronger at fixed CHARACTER levels — 5th, 11th, and 17th — not from spell slots and not from your level in the class that granted them.',
    example: 'Fire Bolt deals 1d10 at character levels 1–4, 2d10 at 5–10, 3d10 at 11–16, and 4d10 at 17+. A Rogue 4 / Wizard 1 is character level 5, so their Fire Bolt already rolls 2d10 on the strength of one Wizard level.',
    gotchas: [
      'This is the multiclass trap: cantrip damage keys off TOTAL character level, while slots and prepared counts key off class levels.',
      'Upcasting does not exist for cantrips — there is no slot to spend, so the level bands are the only scaling they get.',
    ],
    source: SRD,
  },

  // ── Resolution ────────────────────────────────────────────────────────────
  {
    key: 'spell-save-dc-2014', title: 'Spell save DC', topic: 'resolution',
    rule: 'Your spell save DC is 8 + your proficiency bonus + your spellcasting ability modifier. A target must meet or beat it on the saving throw the spell calls for.',
    example: 'A 7th-level Druid with Wisdom 16 (+3) has proficiency +3, so her save DC is 8 + 3 + 3 = 14. An orc caught in her Entangle makes a Strength save: a 13 fails and the orc is restrained, a 14 succeeds and it walks free.',
    gotchas: [
      'The ability is fixed per class — Intelligence for a Wizard, Wisdom for a Cleric or Druid, Charisma for a Bard, Sorcerer, Warlock, or Paladin. A multiclassed caster carries a separate DC for each class.',
      'A save that ties the DC SUCCEEDS. Saves are met-or-beat.',
    ],
    source: SRD,
  },
  {
    key: 'spell-attack-bonus-2014', title: 'Spell attack rolls', topic: 'resolution',
    rule: 'Your spell attack modifier is your proficiency bonus + your spellcasting ability modifier. Roll d20 + that against the target\'s AC, resolving it like any other attack — advantage, disadvantage, and critical hits all apply.',
    example: 'A 3rd-level Warlock with Charisma 16 (+3) and proficiency +2 attacks at +5 with Eldritch Blast. Against a bandit captain\'s AC 15 he needs a 10 or better. A natural 20 crits and doubles the damage dice: 2d10 force instead of 1d10.',
    gotchas: [
      'Only spells that make an attack roll can crit — a saving-throw spell never does, however badly the target rolls.',
      'Half and three-quarters cover raise AC against a spell attack, but do nothing against a spell that calls for a saving throw.',
    ],
    source: SRD,
  },
  {
    key: 'save-for-half-2014', title: 'Half damage on a successful save', topic: 'resolution',
    rule: 'Many damaging spells deal half damage to a target that succeeds on its save. Roll the damage once for the whole effect, then halve it for each creature that saved, rounding down.',
    example: 'A Wizard drops a Fireball and rolls 8d6 for a total of 27. Four bandits are in the radius: three fail their Dexterity saves and take 27 each; the fourth succeeds and takes 13 (27 halved, rounded down).',
    gotchas: [
      'The dice are rolled ONCE for the area, not separately per target.',
      'Rounding is always down, so 1 damage halved is 0.',
      'Not every save-based spell has a half-damage clause — some are all-or-nothing, and the spell text is what decides.',
    ],
    source: SRD,
  },
  {
    key: 'bonus-action-casting-2014', title: 'Casting a spell as a bonus action', topic: 'resolution',
    rule: 'A spell with a bonus-action casting time can only be cast if you have not already used your bonus action that turn — and having cast it, the only other spell you may cast on that same turn is a cantrip with a casting time of 1 action.',
    example: 'A Sorcerer bonus-action casts Healing Word to pick an ally up off the floor. That turn she cannot follow it with Fireball, because Fireball is a 3rd-level spell rather than a cantrip. She can still cast Fire Bolt with her action, since that is a cantrip cast with an action.',
    gotchas: [
      'The restriction is about the TURN, not the round — a reaction spell such as Shield on someone else\'s turn is unaffected.',
      'Ordering does not rescue it: casting Fireball first still blocks the bonus-action Healing Word afterwards.',
    ],
    source: SRD,
  },

  // ── Concentration ─────────────────────────────────────────────────────────
  {
    key: 'concentration-2014', title: 'Concentration', topic: 'concentration',
    rule: 'You can concentrate on only one spell at a time. Casting a second spell that requires concentration ends the first the moment you cast it, and no benefit of the first spell lingers.',
    example: 'A Bard concentrating on Bless (1 minute, three allies each adding 1d4 to attacks and saves) casts Hold Person, which also needs concentration. Bless ends instantly — the three allies lose their d4s that same turn, whether or not Hold Person\'s target fails its save.',
    gotchas: [
      'Dropping concentration voluntarily is free and takes no action.',
      'Non-concentration spells can be cast freely while concentrating — casting Magic Missile does not endanger your Bless.',
      'Becoming Incapacitated, or dying, ends concentration outright with no save.',
    ],
    source: SRD,
  },
  {
    key: 'concentration-save-2014', title: 'Losing concentration to damage', topic: 'concentration',
    rule: 'Whenever you take damage while concentrating, make a Constitution saving throw to keep the spell: the DC is 10, or half the damage taken, whichever is HIGHER. On a failure the spell ends.',
    example: 'A Druid concentrating on Call Lightning takes 22 damage from an ogre\'s greatclub. Half of 22 is 11, which beats 10, so she saves against DC 11. Later a goblin arrow deals 6 — half is 3, which is under 10, so that save is against DC 10, the floor.',
    gotchas: [
      'Every separate instance of damage forces its own save. Two hits from a multiattack are two saves, not one.',
      'The floor means small hits are never free — a 2-damage dart still demands a DC 10 Constitution save.',
      'The War Caster feat grants advantage on these saves, and Constitution save proficiency is worth a great deal to a concentration-heavy caster.',
    ],
    source: SRD,
  },

  // ── Components ────────────────────────────────────────────────────────────
  {
    key: 'components-vsm-2014', title: 'Verbal, Somatic, and Material components', topic: 'components',
    rule: 'V means you must chant audibly, S means you must have free use of at least one hand to gesture, and M means you need the listed material — for which a component pouch or a spellcasting focus normally substitutes.',
    example: 'A Cleric with a mace in 1 hand and a shield strapped to the other tries to cast Cure Wounds (V, S). Neither of his 2 hands is free, so the somatic component fails. Stowing the mace solves it: the 1 free hand can both hold his holy symbol and make the gesture, and the spell goes off for 1d8 + 3.',
    gotchas: [
      'A hand holding a focus still counts as free for somatic components — one hand can do both jobs, but it cannot also be holding a weapon.',
      'Being gagged or caught in a Silence effect blocks V spells; being bound or Restrained can block S spells.',
      'A shield does not count as a free hand unless the focus is emblazoned on it.',
    ],
    source: SRD,
  },
  {
    key: 'costly-materials-2014', title: 'Materials with a gold cost', topic: 'components',
    rule: 'When a material component lists a gold-piece cost, you must actually possess that component — a focus or component pouch will NOT stand in for it. If the spell says the component is consumed, it is destroyed by the casting and has to be replaced before the next one.',
    example: 'Revivify calls for 300 GP of diamonds and consumes them, so raising two fallen allies over a campaign costs 600 GP in gems on top of the slots. Identify needs a pearl worth at least 100 GP but does not consume it — buy the pearl once and it serves for every casting thereafter.',
    gotchas: [
      'The gold, not the spell slot, is the real brake on revival and high-end divination magic.',
      'Read the component line for the word "consumed"; without it, the component survives and is reusable.',
      'A party that cannot buy diamonds cannot cast Revivify, no matter how many slots the Cleric has left.',
    ],
    source: SRD,
  },

  // ── Targeting ─────────────────────────────────────────────────────────────
  {
    key: 'areas-of-effect-2014', title: 'Areas of effect', topic: 'targeting',
    rule: 'An area spell takes one of five shapes: cone, cube, cylinder, line, or sphere. Each is measured from a point of origin the spell specifies, and a creature must be inside the area to be affected by it.',
    example: 'Burning Hands is a 15-foot cone spreading from your fingertips, so you must stand close enough that the wedge covers your targets. Fireball is a 20-foot-radius sphere centred on a point up to 150 feet away — you place it among the enemies while standing well clear of your own blast.',
    gotchas: [
      'A cone\'s width at any point equals its distance from you, so a 15-foot cone is 15 feet across at its far edge.',
      'A cylinder\'s radius is measured from the centre of its circular base, and its height is stated separately.',
      'You need a clear path to the point of origin — you cannot centre a sphere on the far side of a closed door.',
    ],
    editionNote: '2014 defines five area shapes — cone, cube, cylinder, line, sphere. 2024 added Emanation as a sixth shape that moves with its source; it does not exist in 2014, and no 2014 spell uses it.',
    source: SRD,
  },
  {
    key: 'targeting-clear-path-2014', title: 'Choosing targets, clear paths, and hitting allies', topic: 'targeting',
    rule: 'To target a creature or point you must have a clear path to it, so it cannot be behind total cover. Unless the spell says "creatures of your choice", an area affects EVERY creature in it — allies, and you, included.',
    example: 'A Wizard centres a Fireball on a hobgoblin who is trading blows with the party\'s Fighter. The Fighter is inside the 20-foot radius, so he rolls a Dexterity save against DC 15 like everyone else and eats 8d6 on a failure. Bless, by contrast, names creatures of your choice, so it simply skips the enemies standing next to them.',
    gotchas: [
      'Total cover blocks targeting entirely; half and three-quarters cover only raise AC and Dexterity saves.',
      'If you are inside an area of a spell you cast, you are affected by it unless the spell excludes you.',
      '"Each creature in the area" and "creatures of your choice" behave completely differently in a crowded room — read the target line before you throw the spell.',
    ],
    source: SRD,
  },

  // ── Preparation and ritual ────────────────────────────────────────────────
  {
    key: 'prepared-vs-known-2014', title: 'Prepared spells vs spells known', topic: 'preparation',
    rule: 'The 2014 classes fall into two camps. PREPARED casters — Cleric, Druid, Paladin, Wizard — pick a fresh list after each long rest and can change it wholesale. KNOWN casters — Bard, Ranger, Sorcerer, Warlock — have a fixed repertoire set by their class table, and may replace exactly one spell when they gain a level.',
    example: 'A 5th-level Cleric with Wisdom 16 (+3) prepares Wisdom modifier + Cleric level = 3 + 5 = 8 spells from the entire Cleric list, and can swap all eight tomorrow. A 5th-level Sorcerer knows six spells, full stop, and on reaching 6th level may trade one of them for another — the other five are hers until she levels again.',
    gotchas: [
      'The Wizard prepares from its SPELLBOOK, not from the whole class list — Intelligence modifier + Wizard level, drawn only from spells it has scribed.',
      'The Paladin uses a half-caster formula: Charisma modifier + half its Paladin level rounded down, minimum one spell.',
      'Preparing a spell does not reserve a slot for it — a prepared spell can be cast over and over until the slots run dry.',
      'Cantrips are known permanently and sit outside the prepared count entirely.',
    ],
    editionNote: '2014 splits the classes hard into prepared (Cleric, Druid, Paladin, Wizard) and known (Bard, Ranger, Sorcerer, Warlock), with known casters swapping just one spell per level-up. 2024 moved most classes toward the prepared model and made changing spells considerably more forgiving.',
    source: SRD,
  },
  {
    key: 'ritual-casting-2014', title: 'Ritual casting', topic: 'ritual',
    rule: 'A spell with the ritual tag can be cast without spending a slot by taking 10 minutes longer than its normal casting time — but only if a class feature grants you ritual casting, and 2014 grants it on different terms to each class.',
    example: 'A Wizard and a Cleric both want Detect Magic, which normally costs a 1st-level slot and 1 action. As a ritual it costs no slot at all and takes 10 minutes instead. The Wizard casts it straight from her spellbook even though she prepared Shield and Magic Missile today. The Cleric cannot — he did not prepare Detect Magic this morning, so the ritual is unavailable to him until after his next long rest.',
    gotchas: [
      'Wizard: rituals are cast from the SPELLBOOK and need not be prepared — the class\'s standout advantage.',
      'Cleric and Druid: the ritual must be among the spells they PREPARED that day.',
      'Bard: any known spell with the ritual tag can be ritualled.',
      'Sorcerer, Paladin, and Ranger get no ritual casting at all; the Warlock gets it only through the Book of Ancient Secrets invocation, which requires Pact of the Tome.',
      'A ritual cannot be cast at a higher level — no slot is spent, so there is nothing to upcast with.',
      'Ten extra minutes makes ritual casting an exploration tool. It is never a combat option.',
    ],
    editionNote: '2014 hands out ritual casting class by class on uneven terms — the Wizard rituals from the spellbook unprepared, the Cleric and Druid only from prepared spells, and several classes not at all. 2024 regularised ritual casting rather than keeping this per-class patchwork.',
    source: SRD,
  },
];
