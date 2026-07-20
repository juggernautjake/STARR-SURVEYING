// lib/dnd/spells/dnd5e-2024.ts — the 2024 Player's Handbook spell catalog as structured data.
//
// Until now the repo had NO shared 5e spell library: the only spell records in existence were the
// ~26 hand-authored ones living inside individual character fixtures (Donata's 18, the streamer's 8),
// which nothing else could reuse. This is the shared catalog those should eventually draw from.
//
// HOUSE STYLE (same as system-rules.ts, feats/, backgrounds/): each record is concise MECHANICAL
// FACTS + numbers — level, school, casting time, range, components, duration, concentration, ritual,
// class lists — plus a SHORT PARAPHRASED effect summary. Never verbatim rulebook prose. Game mechanics
// aren't copyrightable; the book's expression of them is, and we don't reproduce it. Every record
// carries `source` so its origin is attributable, per the repo's attribution convention.
//
// GROUND RULE 2 — NEVER INVENTED. Every entry here is real published 2024 content. A spell whose
// details we aren't sure of is LEFT OUT rather than guessed: this catalog feeds a builder that
// computes from it, so a wrong record is worse than an absent one. The catalog is therefore
// INCREMENTAL and does not yet claim to be the complete ~400-spell list — `SPELL_CATALOG_STATUS`
// below records that honestly so no caller mistakes it for exhaustive.
//
// 2024 vs 2014: several of these are new in 2024 (Elementalism, Sorcerous Burst, Starry Wisp) and
// several changed (True Strike is now a weapon-attack cantrip; Chill Touch became a melee spell
// attack). Where a spell differs between editions, `editionNote` says so — that difference is
// exactly the kind of thing a 2014 assumption silently carries into a 2024 sheet.

export type SpellSchool =
  | 'Abjuration' | 'Conjuration' | 'Divination' | 'Enchantment'
  | 'Evocation' | 'Illusion' | 'Necromancy' | 'Transmutation';

export const SPELL_SCHOOLS: SpellSchool[] = [
  'Abjuration', 'Conjuration', 'Divination', 'Enchantment',
  'Evocation', 'Illusion', 'Necromancy', 'Transmutation',
];

/** 0 = cantrip. Mirrors `SpellLevel` in the sheet's own types. */
export type SpellCatalogLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

/** The classes whose 2024 spell lists we track. */
export type SpellClass =
  | 'Bard' | 'Cleric' | 'Druid' | 'Paladin' | 'Ranger' | 'Sorcerer' | 'Warlock' | 'Wizard';

export interface SpellDef {
  /** Stable kebab-case identifier, e.g. 'fire-bolt'. */
  key: string;
  name: string;
  level: SpellCatalogLevel;
  school: SpellSchool;
  /** e.g. '1 action', '1 bonus action', '1 reaction', '1 minute', '10 minutes'. */
  castTime: string;
  /** e.g. 'Self', 'Touch', '60 feet', 'Self (15-foot cone)'. */
  range: string;
  /** Component letters only, e.g. 'V, S, M'. */
  components: string;
  /** What the M component is, when there is one. */
  material?: string;
  /** e.g. 'Instantaneous', '1 minute', 'Until dispelled'. */
  duration: string;
  concentration?: boolean;
  ritual?: boolean;
  /** Class spell lists this appears on in the 2024 PHB. */
  classes: SpellClass[];
  /** SHORT paraphrase of what it does — mechanics, not the book's wording. */
  summary: string;
  /** Scaling at higher levels / higher character level, paraphrased. */
  higher?: string;
  /** Called out when the 2024 version differs meaningfully from 2014. */
  editionNote?: string;
  source: string;
}

const PHB = 'PHB 2024';

// ── Cantrips ────────────────────────────────────────────────────────────────
const CANTRIPS: SpellDef[] = [
  { key: 'acid-splash', name: 'Acid Splash', level: 0, school: 'Evocation', castTime: '1 action', range: '60 feet', components: 'V, S', duration: 'Instantaneous', classes: ['Sorcerer', 'Wizard'],
    summary: 'Choose creatures in a 5-foot-radius sphere; each makes a Dexterity save or takes 1d6 acid damage.', higher: 'Damage increases at levels 5, 11, and 17.',
    editionNote: '2024 targets a 5-foot-radius sphere rather than one or two adjacent creatures.', source: PHB },
  { key: 'blade-ward', name: 'Blade Ward', level: 0, school: 'Abjuration', castTime: '1 action', range: 'Self', components: 'V, S', duration: '1 minute', concentration: true, classes: ['Bard', 'Sorcerer', 'Warlock', 'Wizard'],
    summary: 'Attack rolls against you have disadvantage while the spell lasts.',
    editionNote: '2024 lasts 1 minute with concentration; the 2014 version lasted 1 round and granted resistance instead.', source: PHB },
  { key: 'chill-touch', name: 'Chill Touch', level: 0, school: 'Necromancy', castTime: '1 action', range: 'Touch', components: 'V, S', duration: 'Instantaneous', classes: ['Sorcerer', 'Warlock', 'Wizard'],
    summary: 'Melee spell attack; on a hit, 1d10 necrotic damage and the target can\'t regain hit points until the end of your next turn.', higher: 'Damage increases at levels 5, 11, and 17.',
    editionNote: '2024 is a melee spell attack; 2014 was a ranged attack at 120 feet.', source: PHB },
  { key: 'dancing-lights', name: 'Dancing Lights', level: 0, school: 'Illusion', castTime: '1 action', range: '120 feet', components: 'V, S, M', material: 'a bit of phosphorus', duration: '1 minute', concentration: true, classes: ['Bard', 'Druid', 'Sorcerer', 'Wizard'],
    summary: 'Create up to four torch-sized lights (or one glowing humanoid form) that you can move as a bonus action.', source: PHB },
  { key: 'druidcraft', name: 'Druidcraft', level: 0, school: 'Transmutation', castTime: '1 action', range: '30 feet', components: 'V, S', duration: 'Instantaneous', classes: ['Druid'],
    summary: 'Minor nature effects: predict the weather, bloom a flower, light or snuff a small flame, or make a harmless sensory effect.', source: PHB },
  { key: 'eldritch-blast', name: 'Eldritch Blast', level: 0, school: 'Evocation', castTime: '1 action', range: '120 feet', components: 'V, S', duration: 'Instantaneous', classes: ['Warlock'],
    summary: 'Ranged spell attack for 1d10 force damage.', higher: 'Fires additional beams at levels 5, 11, and 17; each is a separate attack.', source: PHB },
  { key: 'elementalism', name: 'Elementalism', level: 0, school: 'Transmutation', castTime: '1 action', range: '30 feet', components: 'V, S', duration: 'Instantaneous', classes: ['Druid', 'Sorcerer', 'Wizard'],
    summary: 'Small elemental effects: douse or light a flame, chill or warm objects, part mist, make earth tremble, or clean or soil an object.',
    editionNote: 'New in 2024.', source: PHB },
  { key: 'fire-bolt', name: 'Fire Bolt', level: 0, school: 'Evocation', castTime: '1 action', range: '120 feet', components: 'V, S', duration: 'Instantaneous', classes: ['Sorcerer', 'Wizard'],
    summary: 'Ranged spell attack for 1d10 fire damage; unattended flammable objects ignite.', higher: 'Damage increases at levels 5, 11, and 17.', source: PHB },
  { key: 'guidance', name: 'Guidance', level: 0, school: 'Divination', castTime: '1 action', range: 'Touch', components: 'V, S', duration: '1 minute', concentration: true, classes: ['Cleric', 'Druid'],
    summary: 'Once before the spell ends, the target adds 1d4 to one ability check of its choice.',
    editionNote: '2024 lasts 1 minute and is used reactively; 2014 required the target to spend it within 1 minute of casting.', source: PHB },
  { key: 'light', name: 'Light', level: 0, school: 'Evocation', castTime: '1 action', range: 'Touch', components: 'V, M', material: 'a firefly or phosphorescent moss', duration: '1 hour', classes: ['Bard', 'Cleric', 'Sorcerer', 'Wizard'],
    summary: 'An object sheds bright light in a 20-foot radius and dim light for 20 feet beyond. An unwilling creature can make a Dexterity save to avoid it.', source: PHB },
  { key: 'mage-hand', name: 'Mage Hand', level: 0, school: 'Conjuration', castTime: '1 action', range: '30 feet', components: 'V, S', duration: '1 minute', classes: ['Bard', 'Sorcerer', 'Warlock', 'Wizard'],
    summary: 'A spectral hand manipulates objects, opens containers, and carries up to 10 pounds. It can\'t attack or activate magic items.', source: PHB },
  { key: 'mending', name: 'Mending', level: 0, school: 'Transmutation', castTime: '1 minute', range: 'Touch', components: 'V, S, M', material: 'two lodestones', duration: 'Instantaneous', classes: ['Bard', 'Cleric', 'Druid', 'Sorcerer', 'Wizard'],
    summary: 'Repair a single break or tear in an object no larger than 1 foot in any dimension. Does not restore magic.', source: PHB },
  { key: 'message', name: 'Message', level: 0, school: 'Transmutation', castTime: '1 action', range: '120 feet', components: 'V, S, M', material: 'a copper wire', duration: '1 round', classes: ['Bard', 'Sorcerer', 'Wizard'],
    summary: 'Whisper a message to a creature you can see; only it hears, and it can whisper back.', source: PHB },
  { key: 'mind-sliver', name: 'Mind Sliver', level: 0, school: 'Enchantment', castTime: '1 action', range: '60 feet', components: 'V', duration: '1 round', classes: ['Sorcerer', 'Warlock', 'Wizard'],
    summary: 'Intelligence save or 1d6 psychic damage and the target subtracts 1d4 from its next saving throw before your next turn ends.', higher: 'Damage increases at levels 5, 11, and 17.', source: PHB },
  { key: 'minor-illusion', name: 'Minor Illusion', level: 0, school: 'Illusion', castTime: '1 action', range: '30 feet', components: 'S, M', material: 'a bit of fleece', duration: '1 minute', classes: ['Bard', 'Sorcerer', 'Warlock', 'Wizard'],
    summary: 'Create either a sound or an image of an object (no larger than a 5-foot cube). Investigation check against your save DC reveals it.', source: PHB },
  { key: 'poison-spray', name: 'Poison Spray', level: 0, school: 'Necromancy', castTime: '1 action', range: '30 feet', components: 'V, S', duration: 'Instantaneous', classes: ['Druid', 'Sorcerer', 'Warlock', 'Wizard'],
    summary: 'Constitution save or 1d12 poison damage.', higher: 'Damage increases at levels 5, 11, and 17.',
    editionNote: '2024 has a 30-foot range; 2014 was 10 feet.', source: PHB },
  { key: 'prestidigitation', name: 'Prestidigitation', level: 0, school: 'Transmutation', castTime: '1 action', range: '10 feet', components: 'V, S', duration: '1 hour', classes: ['Bard', 'Sorcerer', 'Warlock', 'Wizard'],
    summary: 'Minor magical tricks: a sensory effect, light or snuff a small flame, clean or soil an object, chill/warm/flavor food, or make a small mark or trinket.', source: PHB },
  { key: 'produce-flame', name: 'Produce Flame', level: 0, school: 'Conjuration', castTime: '1 action', range: 'Self', components: 'V, S', duration: '10 minutes', classes: ['Druid'],
    summary: 'A flame in your hand sheds light; you can hurl it as a ranged spell attack for 1d8 fire damage.', higher: 'Damage increases at levels 5, 11, and 17.', source: PHB },
  { key: 'ray-of-frost', name: 'Ray of Frost', level: 0, school: 'Evocation', castTime: '1 action', range: '60 feet', components: 'V, S', duration: 'Instantaneous', classes: ['Sorcerer', 'Wizard'],
    summary: 'Ranged spell attack for 1d8 cold damage; the target\'s speed drops by 10 feet until your next turn ends.', higher: 'Damage increases at levels 5, 11, and 17.', source: PHB },
  { key: 'resistance', name: 'Resistance', level: 0, school: 'Abjuration', castTime: '1 action', range: 'Touch', components: 'V, S', duration: '1 minute', concentration: true, classes: ['Cleric', 'Druid'],
    summary: 'Once before the spell ends, the target adds 1d4 to one saving throw of its choice.', source: PHB },
  { key: 'sacred-flame', name: 'Sacred Flame', level: 0, school: 'Evocation', castTime: '1 action', range: '60 feet', components: 'V, S', duration: 'Instantaneous', classes: ['Cleric'],
    summary: 'Dexterity save or 1d8 radiant damage. Cover does not help the target.', higher: 'Damage increases at levels 5, 11, and 17.', source: PHB },
  { key: 'shillelagh', name: 'Shillelagh', level: 0, school: 'Transmutation', castTime: '1 bonus action', range: 'Self', components: 'V, S, M', material: 'mistletoe', duration: '1 minute', classes: ['Druid'],
    summary: 'A club or quarterstaff you hold uses your spellcasting ability for attack and damage and deals 1d8 force damage.', higher: 'Damage increases at levels 5, 11, and 17.',
    editionNote: '2024 deals force damage and scales with level; 2014 dealt bludgeoning at a flat 1d8.', source: PHB },
  { key: 'shocking-grasp', name: 'Shocking Grasp', level: 0, school: 'Evocation', castTime: '1 action', range: 'Touch', components: 'V, S', duration: 'Instantaneous', classes: ['Sorcerer', 'Wizard'],
    summary: 'Melee spell attack for 1d8 lightning damage; the target can\'t take reactions until its next turn. Advantage if the target wears metal armor.', higher: 'Damage increases at levels 5, 11, and 17.', source: PHB },
  { key: 'sorcerous-burst', name: 'Sorcerous Burst', level: 0, school: 'Evocation', castTime: '1 action', range: '120 feet', components: 'V, S', duration: 'Instantaneous', classes: ['Sorcerer'],
    summary: 'Ranged spell attack for 1d8 damage of a type you choose from your sorcerous origin\'s options; a maximum roll lets the damage cascade.', higher: 'Damage increases at levels 5, 11, and 17.',
    editionNote: 'New in 2024.', source: PHB },
  { key: 'spare-the-dying', name: 'Spare the Dying', level: 0, school: 'Necromancy', castTime: '1 bonus action', range: '15 feet', components: 'V, S', duration: 'Instantaneous', classes: ['Cleric', 'Druid'],
    summary: 'Stabilize a creature at 0 hit points.',
    editionNote: '2024 is a bonus action at 15 feet; 2014 was an action at touch range.', source: PHB },
  { key: 'starry-wisp', name: 'Starry Wisp', level: 0, school: 'Evocation', castTime: '1 action', range: '60 feet', components: 'V, S', duration: 'Instantaneous', classes: ['Bard', 'Druid'],
    summary: 'Ranged spell attack for 1d8 radiant damage; the target emits dim light and can\'t benefit from being Invisible until your next turn ends.', higher: 'Damage increases at levels 5, 11, and 17.',
    editionNote: 'New in 2024.', source: PHB },
  { key: 'thaumaturgy', name: 'Thaumaturgy', level: 0, school: 'Transmutation', castTime: '1 action', range: '30 feet', components: 'V', duration: '1 minute', classes: ['Cleric'],
    summary: 'Minor wonders: a booming voice, flickering flames, tremors, an ominous sound, or doors flying open.', source: PHB },
  { key: 'thorn-whip', name: 'Thorn Whip', level: 0, school: 'Transmutation', castTime: '1 action', range: '30 feet', components: 'V, S, M', material: 'a thorn', duration: 'Instantaneous', classes: ['Druid'],
    summary: 'Melee spell attack at 30 feet for 1d6 piercing damage; you can pull a Large or smaller target up to 10 feet toward you.', higher: 'Damage increases at levels 5, 11, and 17.', source: PHB },
  { key: 'thunderclap', name: 'Thunderclap', level: 0, school: 'Evocation', castTime: '1 action', range: 'Self (5-foot radius)', components: 'S', duration: 'Instantaneous', classes: ['Bard', 'Druid', 'Sorcerer', 'Warlock', 'Wizard'],
    summary: 'Each creature within 5 feet makes a Constitution save or takes 1d6 thunder damage. Audible out to 100 feet.', higher: 'Damage increases at levels 5, 11, and 17.', source: PHB },
  { key: 'toll-the-dead', name: 'Toll the Dead', level: 0, school: 'Necromancy', castTime: '1 action', range: '60 feet', components: 'V, S', duration: 'Instantaneous', classes: ['Cleric', 'Warlock', 'Wizard'],
    summary: 'Wisdom save or 1d8 necrotic damage — 1d12 instead if the target is already missing hit points.', higher: 'Damage increases at levels 5, 11, and 17.', source: PHB },
  { key: 'true-strike', name: 'True Strike', level: 0, school: 'Divination', castTime: '1 action', range: 'Self', components: 'S, M', material: 'a weapon with which you have proficiency', duration: 'Instantaneous', classes: ['Bard', 'Sorcerer', 'Warlock', 'Wizard'],
    summary: 'Make one attack with the weapon, using your spellcasting ability for the attack and damage; it deals radiant damage instead of its normal type.', higher: 'Extra radiant damage at levels 5, 11, and 17.',
    editionNote: 'Completely redesigned in 2024 — it is now a weapon attack. The 2014 version spent a turn to gain advantage and was widely considered a trap.', source: PHB },
  { key: 'vicious-mockery', name: 'Vicious Mockery', level: 0, school: 'Enchantment', castTime: '1 action', range: '60 feet', components: 'V', duration: 'Instantaneous', classes: ['Bard'],
    summary: 'Wisdom save or 1d6 psychic damage and disadvantage on its next attack roll before your next turn ends.', higher: 'Damage increases at levels 5, 11, and 17.', source: PHB },
  { key: 'word-of-radiance', name: 'Word of Radiance', level: 0, school: 'Evocation', castTime: '1 action', range: 'Self (5-foot radius)', components: 'V, M', material: 'a sunburst symbol', duration: 'Instantaneous', classes: ['Cleric'],
    summary: 'Creatures of your choice within 5 feet make a Constitution save or take 1d6 radiant damage.', higher: 'Damage increases at levels 5, 11, and 17.', source: PHB },
];

// ── 1st level ───────────────────────────────────────────────────────────────
const LEVEL_1: SpellDef[] = [
  { key: 'alarm', name: 'Alarm', level: 1, school: 'Abjuration', castTime: '1 minute', range: '30 feet', components: 'V, S, M', material: 'a bell and silver wire', duration: '8 hours', ritual: true, classes: ['Ranger', 'Wizard'],
    summary: 'Ward a 20-foot cube; you get a mental or audible alert when a creature you did not designate enters it.', source: PHB },
  { key: 'bless', name: 'Bless', level: 1, school: 'Enchantment', castTime: '1 action', range: '30 feet', components: 'V, S, M', material: 'a sprinkling of holy water', duration: '1 minute', concentration: true, classes: ['Cleric', 'Paladin'],
    summary: 'Up to three creatures add 1d4 to attack rolls and saving throws.', higher: 'One additional target per slot level above 1st.', source: PHB },
  { key: 'burning-hands', name: 'Burning Hands', level: 1, school: 'Evocation', castTime: '1 action', range: 'Self (15-foot cone)', components: 'V, S', duration: 'Instantaneous', classes: ['Sorcerer', 'Wizard'],
    summary: 'Dexterity save or 3d6 fire damage, half on a success. Ignites unattended flammable objects.', higher: '+1d6 per slot level above 1st.', source: PHB },
  { key: 'charm-person', name: 'Charm Person', level: 1, school: 'Enchantment', castTime: '1 action', range: '30 feet', components: 'V, S', duration: '1 hour', classes: ['Bard', 'Druid', 'Sorcerer', 'Warlock', 'Wizard'],
    summary: 'Wisdom save or the target is Charmed by you and regards you as friendly; it knows it was charmed when the spell ends. Advantage on the save if you or your allies are fighting it.', higher: 'One additional target per slot level above 1st.', source: PHB },
  { key: 'command', name: 'Command', level: 1, school: 'Enchantment', castTime: '1 action', range: '60 feet', components: 'V', duration: '1 round', classes: ['Bard', 'Cleric', 'Paladin', 'Warlock'],
    summary: 'Wisdom save or the target obeys a one-word command on its next turn (Approach, Drop, Flee, Grovel, or Halt).', higher: 'One additional target per slot level above 1st.', source: PHB },
  { key: 'cure-wounds', name: 'Cure Wounds', level: 1, school: 'Abjuration', castTime: '1 action', range: 'Touch', components: 'V, S', duration: 'Instantaneous', classes: ['Bard', 'Cleric', 'Druid', 'Paladin', 'Ranger'],
    summary: 'A creature you touch regains 2d8 + your spellcasting ability modifier hit points.', higher: '+2d8 per slot level above 1st.',
    editionNote: '2024 heals 2d8 (up from 1d8) and is Abjuration rather than Evocation.', source: PHB },
  { key: 'detect-magic', name: 'Detect Magic', level: 1, school: 'Divination', castTime: '1 action', range: 'Self', components: 'V, S', duration: '10 minutes', concentration: true, ritual: true, classes: ['Bard', 'Cleric', 'Druid', 'Paladin', 'Ranger', 'Sorcerer', 'Warlock', 'Wizard'],
    summary: 'Sense magic within 30 feet; an action lets you see a faint aura and learn its school.', source: PHB },
  { key: 'disguise-self', name: 'Disguise Self', level: 1, school: 'Illusion', castTime: '1 action', range: 'Self', components: 'V, S', duration: '1 hour', classes: ['Bard', 'Sorcerer', 'Wizard'],
    summary: 'Change your appearance, clothing, and gear illusorily. Physical inspection or an Investigation check against your save DC reveals it.', source: PHB },
  { key: 'dissonant-whispers', name: 'Dissonant Whispers', level: 1, school: 'Enchantment', castTime: '1 action', range: '60 feet', components: 'V', duration: 'Instantaneous', classes: ['Bard'],
    summary: 'Wisdom save or 3d6 psychic damage and the target must use its reaction to move away; half damage and no movement on a success.', higher: '+1d6 per slot level above 1st.', source: PHB },
  { key: 'faerie-fire', name: 'Faerie Fire', level: 1, school: 'Evocation', castTime: '1 action', range: '60 feet', components: 'V', duration: '1 minute', concentration: true, classes: ['Bard', 'Druid'],
    summary: 'Objects and creatures in a 20-foot cube are outlined in light (Dexterity save to avoid); attacks against them have advantage and they can\'t benefit from being Invisible.', source: PHB },
  { key: 'false-life', name: 'False Life', level: 1, school: 'Necromancy', castTime: '1 action', range: 'Self', components: 'V, S, M', material: 'a drop of alcohol', duration: '1 hour', classes: ['Sorcerer', 'Wizard'],
    summary: 'Gain 2d4 + 4 temporary hit points.', higher: '+5 temporary hit points per slot level above 1st.', source: PHB },
  { key: 'feather-fall', name: 'Feather Fall', level: 1, school: 'Transmutation', castTime: '1 reaction', range: '60 feet', components: 'V, M', material: 'a small feather or piece of down', duration: '1 minute', classes: ['Bard', 'Sorcerer', 'Wizard'],
    summary: 'Up to five falling creatures descend at 60 feet per round and take no falling damage. Cast as a reaction when a creature falls.', source: PHB },
  { key: 'find-familiar', name: 'Find Familiar', level: 1, school: 'Conjuration', castTime: '1 hour', range: '10 feet', components: 'V, S, M', material: 'burning incense worth 10+ GP, consumed', duration: 'Instantaneous', ritual: true, classes: ['Wizard'],
    summary: 'Summon a spirit that takes an animal form of your choice as your familiar. It obeys you, shares its senses on command, can deliver your touch spells, and reappears after a 1-hour ritual if it drops to 0 hit points.', source: PHB },
  { key: 'fog-cloud', name: 'Fog Cloud', level: 1, school: 'Conjuration', castTime: '1 action', range: '120 feet', components: 'V, S', duration: '1 hour', concentration: true, classes: ['Druid', 'Ranger', 'Sorcerer', 'Wizard'],
    summary: 'A 20-foot-radius sphere of fog heavily obscures the area; wind of 10+ mph disperses it.', higher: '+20 feet radius per slot level above 1st.', source: PHB },
  { key: 'guiding-bolt', name: 'Guiding Bolt', level: 1, school: 'Evocation', castTime: '1 action', range: '120 feet', components: 'V, S', duration: '1 round', classes: ['Cleric'],
    summary: 'Ranged spell attack for 4d6 radiant damage; the next attack roll against the target before your next turn ends has advantage.', higher: '+1d6 per slot level above 1st.', source: PHB },
  { key: 'healing-word', name: 'Healing Word', level: 1, school: 'Abjuration', castTime: '1 bonus action', range: '60 feet', components: 'V', duration: 'Instantaneous', classes: ['Bard', 'Cleric', 'Druid'],
    summary: 'A creature you can see regains 2d4 + your spellcasting ability modifier hit points.', higher: '+2d4 per slot level above 1st.',
    editionNote: '2024 heals 2d4 (up from 1d4) and is Abjuration rather than Evocation.', source: PHB },
  { key: 'hex', name: 'Hex', level: 1, school: 'Enchantment', castTime: '1 bonus action', range: '90 feet', components: 'V, S, M', material: 'the petrified eye of a newt', duration: '1 hour', concentration: true, classes: ['Warlock'],
    summary: 'Your attacks against the target deal an extra 1d6 necrotic damage, and it has disadvantage on ability checks with one ability you choose. Moves to a new target if the original dies.', higher: 'Longer duration at 3rd and 5th level slots.', source: PHB },
  { key: 'hunters-mark', name: "Hunter's Mark", level: 1, school: 'Divination', castTime: '1 bonus action', range: '90 feet', components: 'V', duration: '1 hour', concentration: true, classes: ['Ranger'],
    summary: 'Your attacks against the marked target deal an extra 1d6 damage, and you have advantage on Perception and Survival checks to find it. Moves to a new target if the original dies.', higher: 'Longer duration at 3rd and 5th level slots.', source: PHB },
  { key: 'identify', name: 'Identify', level: 1, school: 'Divination', castTime: '1 minute', range: 'Touch', components: 'V, S, M', material: 'a pearl worth 100+ GP', duration: 'Instantaneous', ritual: true, classes: ['Bard', 'Wizard'],
    summary: 'Learn an item\'s properties, whether it requires attunement, and what spells affect it.', source: PHB },
  { key: 'inflict-wounds', name: 'Inflict Wounds', level: 1, school: 'Necromancy', castTime: '1 action', range: 'Touch', components: 'V, S', duration: 'Instantaneous', classes: ['Cleric'],
    summary: 'Constitution save or 2d10 necrotic damage, half on a success.', higher: '+1d10 per slot level above 1st.',
    editionNote: '2024 is a Constitution save for 2d10; 2014 was a melee spell attack for 3d10.', source: PHB },
  { key: 'mage-armor', name: 'Mage Armor', level: 1, school: 'Abjuration', castTime: '1 action', range: 'Touch', components: 'V, S, M', material: 'a piece of cured leather', duration: '8 hours', classes: ['Sorcerer', 'Wizard'],
    summary: 'An unarmored creature\'s base AC becomes 13 + its Dexterity modifier.', source: PHB },
  { key: 'magic-missile', name: 'Magic Missile', level: 1, school: 'Evocation', castTime: '1 action', range: '120 feet', components: 'V, S', duration: 'Instantaneous', classes: ['Sorcerer', 'Wizard'],
    summary: 'Three darts each automatically hit for 1d4 + 1 force damage; you divide them among targets you can see.', higher: 'One additional dart per slot level above 1st.', source: PHB },
  { key: 'protection-from-evil-and-good', name: 'Protection from Evil and Good', level: 1, school: 'Abjuration', castTime: '1 action', range: 'Touch', components: 'V, S, M', material: 'holy water or powdered silver and iron, consumed', duration: '10 minutes', concentration: true, classes: ['Cleric', 'Druid', 'Paladin', 'Warlock', 'Wizard'],
    summary: 'Aberrations, celestials, elementals, fey, fiends, and undead have disadvantage on attacks against the target, which also can\'t be Charmed, Frightened, or possessed by them.', source: PHB },
  { key: 'shield', name: 'Shield', level: 1, school: 'Abjuration', castTime: '1 reaction', range: 'Self', components: 'V, S', duration: '1 round', classes: ['Sorcerer', 'Wizard'],
    summary: 'Cast when hit or targeted by Magic Missile: +5 AC until your next turn starts, including against the triggering attack, and no damage from Magic Missile.', source: PHB },
  { key: 'shield-of-faith', name: 'Shield of Faith', level: 1, school: 'Abjuration', castTime: '1 bonus action', range: '60 feet', components: 'V, S, M', material: 'a small parchment with holy text', duration: '10 minutes', concentration: true, classes: ['Cleric', 'Paladin'],
    summary: '+2 AC to a creature you can see.', source: PHB },
  { key: 'silent-image', name: 'Silent Image', level: 1, school: 'Illusion', castTime: '1 action', range: '60 feet', components: 'V, S, M', material: 'a bit of fleece', duration: '10 minutes', concentration: true, classes: ['Bard', 'Sorcerer', 'Wizard'],
    summary: 'A purely visual illusion no larger than a 15-foot cube that you can move. Investigation against your save DC reveals it.', source: PHB },
  { key: 'sleep', name: 'Sleep', level: 1, school: 'Enchantment', castTime: '1 action', range: '60 feet', components: 'V, S, M', material: 'a pinch of sand or rose petals', duration: '1 minute', concentration: true, classes: ['Bard', 'Sorcerer', 'Wizard'],
    summary: 'Creatures in a 5-foot-radius sphere make a Wisdom save or gain the Incapacitated condition and fall unconscious until the spell ends or they take damage.', higher: 'Larger radius at higher slot levels.',
    editionNote: 'Redesigned in 2024 — a Wisdom save rather than the 2014 hit-point-total pool.', source: PHB },
  { key: 'thunderwave', name: 'Thunderwave', level: 1, school: 'Evocation', castTime: '1 action', range: 'Self (15-foot cube)', components: 'V, S', duration: 'Instantaneous', classes: ['Bard', 'Druid', 'Sorcerer', 'Wizard'],
    summary: 'Constitution save or 2d8 thunder damage and pushed 10 feet away; half damage and no push on a success.', higher: '+1d8 per slot level above 1st.', source: PHB },
];

/** The catalog. Ordered by level, then name. */
export const SPELLS_2024: SpellDef[] = [...CANTRIPS, ...LEVEL_1];

/** Honest coverage statement. The 2024 PHB has roughly 400 spells; this catalog is built in
 *  verified tranches so that nothing in it is guessed. Callers that need to tell a user
 *  "no such spell" versus "not catalogued yet" should read this rather than assume. */
export const SPELL_CATALOG_STATUS = {
  complete: false,
  levelsComplete: [0, 1] as SpellCatalogLevel[],
  note: 'Cantrips and 1st-level spells catalogued. Higher levels land in later tranches; a spell missing from this list is not yet catalogued, not necessarily nonexistent.',
} as const;

const BY_KEY = new Map(SPELLS_2024.map((s) => [s.key, s]));
const BY_NAME = new Map(SPELLS_2024.map((s) => [s.name.toLowerCase(), s]));

/** Resolve a 2024 spell by key. */
export function findSpell2024(key: string): SpellDef | undefined {
  return BY_KEY.get(key);
}

/** Resolve a 2024 spell by display name (case-insensitive). */
export function findSpellByName2024(name: string | null | undefined): SpellDef | undefined {
  if (!name) return undefined;
  return BY_NAME.get(name.trim().toLowerCase());
}

export function spellsAtLevel2024(level: SpellCatalogLevel): SpellDef[] {
  return SPELLS_2024.filter((s) => s.level === level);
}

/** Every catalogued spell on a class's 2024 list. */
export function spellsForClass2024(cls: SpellClass): SpellDef[] {
  return SPELLS_2024.filter((s) => s.classes.includes(cls));
}
