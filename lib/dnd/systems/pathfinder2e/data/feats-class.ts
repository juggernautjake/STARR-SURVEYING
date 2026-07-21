// lib/dnd/systems/pathfinder2e/data/feats-class.ts — the CLASS and ARCHETYPE feat catalog.
//
// The other two tracks a PF2 character spends slots on. Class feats arrive on a schedule set by the
// class (most classes: every even level; a few, notably Fighter and Alchemist, also get one at 1st),
// and a class feat belongs to exactly one class. Archetype feats are taken WITH class-feat slots,
// which is why eligibility.ts runs them off the class schedule rather than a fifth table.
//
// LICENSING: PF2 mechanics are ORC-licensed, which expressly permits reproducing rules mechanics.
// Reserved Material — Paizo trademarks, deities, characters, locations, lore, art — must never appear
// here. Every entry carries `source`. Mechanical facts and numbers, PARAPHRASED; never verbatim
// rulebook prose. Remaster terminology and Remaster levels throughout.
//
// GROUND RULE 3 — NEVER INVENT A FEAT, A LEVEL, A CLASS ASSIGNMENT, OR A PREREQUISITE. eligibility.ts
// turns `level`, `className`, `archetype` and `prereqs` into a hard gate. A wrong level makes the
// builder refuse a legal pick or permit an illegal one; a feat filed under the wrong class is
// invisible to the class that owns it and wrongly offered to one that does not. Where any of those
// was not known with confidence the entry is OMITTED ENTIRELY rather than guessed, and the omission
// is recorded in `PF2_FEATS_CLASS_GAPS` at the bottom. This catalog is deliberately not padded.
//
// HOW PREREQUISITES ARE AUTHORED (same contract as feats-general-skill.ts — see its header):
//   • `prereqs` is CHECKED and its entries are ANDed. Unconditional level/feat/skill/attribute
//     requirements go here.
//   • `prereqText` is DISPLAYED and never enforced. DISJUNCTIONS ("Strength +2 or Dexterity +2") and
//     requirements that name a CLASS FEATURE rather than a feat ("you have the Debilitating Strike
//     class feature", "you have a subclass that grants X") live here — the array is an AND and there
//     is no `feature` prereq kind, so structuring either would block legal picks.
//   • ATTRIBUTE values are MODIFIERS, not scores. Every multiclass dedication's legacy "Strength 14"
//     is authored as `{ kind: 'attribute', attribute: 'STR', value: 2 }`.
//   • `className` is NOT set as a `{ kind: 'class' }` prereq — the gate scopes class feats off the
//     `className` field directly (eligibility.ts step 2), so duplicating it would only add a second
//     failure message.
//   • Archetype feats carry `archetype` set to the Dedication's bare name, because the gate looks for
//     a held feat literally named "<archetype> Dedication" (step 5). "Fighter Dedication" therefore
//     has `archetype: 'Fighter'`, and so does "Basic Maneuver".
//
// SUBCLASS-GATED FEATS: many class feats require a particular subclass (a barbarian instinct, a
// druid order, a bard muse, a rogue racket, a champion cause). The Remaster renamed several of those
// subclasses, and there is no subclass prereq kind, so those requirements are carried in `prereqText`
// where they are visible but unenforced. Feats whose subclass gate could not be stated confidently in
// Remaster terms were omitted outright.
import type { PF2FeatFull } from '../defs';

// ══ CLASS FEATS ═══════════════════════════════════════════════════════════════════════════════════
// Grouped by class, ascending by level within each class. `className` must match the `name` field of
// the corresponding entry in PF2_CLASSES (content.ts) exactly — the gate compares them case-folded,
// but nothing normalises a typo.

export const PF2_FEATS_CLASS: PF2FeatFull[] = [
  // ── ALCHEMIST ───────────────────────────────────────────────────────────────────────────────────
  // Alchemists take a class feat at 1st level as well as every even level.
  {
    name: 'Alchemical Familiar',
    level: 1,
    track: 'class',
    className: 'Alchemist',
    traits: ['alchemist'],
    effect:
      'You brew a living creature out of raw reagents, gaining a familiar. It uses the familiar rules, and your alchemical training counts as the spellcasting ability that governs it.',
    source: 'Player Core 2',
  },
  {
    name: 'Far Lobber',
    level: 1,
    track: 'class',
    className: 'Alchemist',
    traits: ['alchemist'],
    effect: 'Your throwing arm is trained for distance: the range increment of alchemical bombs you throw increases by 10 feet.',
    source: 'Player Core 2',
  },
  {
    name: 'Quick Bomber',
    level: 1,
    track: 'class',
    className: 'Alchemist',
    traits: ['alchemist'],
    cost: '1',
    effect: 'Draw a bomb and Strike with it as a single action, rather than spending one action to draw and another to throw.',
    source: 'Player Core 2',
  },
  {
    name: 'Poison Resistance',
    level: 2,
    track: 'class',
    className: 'Alchemist',
    traits: ['alchemist'],
    effect:
      'Years of self-experimentation harden you against toxins: you gain poison resistance equal to half your level, and a +1 status bonus to saves against poisons.',
    source: 'Player Core 2',
  },
  {
    name: 'Smoke Bomb',
    level: 2,
    track: 'class',
    className: 'Alchemist',
    traits: ['additive 1', 'alchemist'],
    cost: 'free',
    effect:
      'Modify a bomb as you make it so that, in addition to its usual effect, it fills the area around where it lands with obscuring smoke for a short time.',
    source: 'Player Core 2',
  },
  {
    name: 'Debilitating Bomb',
    level: 4,
    track: 'class',
    className: 'Alchemist',
    traits: ['additive 2', 'alchemist'],
    cost: 'free',
    effect:
      'Modify a bomb so that a creature it hits must succeed at a Fortitude save against your class DC or suffer an additional debilitating condition — such as being dazzled, deafened, or slowed — chosen as you make the bomb.',
    source: 'Player Core 2',
  },
  {
    name: 'Enduring Alchemy',
    level: 4,
    track: 'class',
    className: 'Alchemist',
    traits: ['alchemist'],
    effect:
      'Your quickly-made concoctions hold together longer: an elixir or other consumable you create with your rapid alchemy lasts until the end of your next turn rather than expiring at the end of the current one.',
    source: 'Player Core 2',
  },
  {
    name: 'Feral Mutagen',
    level: 6,
    track: 'class',
    className: 'Alchemist',
    traits: ['alchemist'],
    effect:
      'A bestial mutagen you drink grows claws and fangs you can attack with, and its penalty to Intimidation checks becomes a bonus instead.',
    source: 'Player Core 2',
  },
  {
    name: 'Powerful Alchemy',
    level: 6,
    track: 'class',
    className: 'Alchemist',
    traits: ['alchemist'],
    effect:
      'Items you make on the spot use your class DC in place of their own listed DC, so your alchemy scales with you rather than with the item.',
    source: 'Player Core 2',
  },
  {
    name: 'Sticky Bomb',
    level: 6,
    track: 'class',
    className: 'Alchemist',
    traits: ['additive 2', 'alchemist'],
    cost: 'free',
    effect:
      'Modify a bomb so that it clings to what it hits, dealing persistent damage of the bomb\'s damage type in addition to its normal effect.',
    source: 'Player Core 2',
  },
  {
    name: 'Merciful Elixir',
    level: 8,
    track: 'class',
    className: 'Alchemist',
    traits: ['additive 2', 'alchemist'],
    cost: 'free',
    effect:
      'Modify an elixir of life so that, as well as healing, it attempts to counteract the frightened or sickened condition on whoever drinks it.',
    source: 'Player Core 2',
  },
  {
    name: 'Potent Poisoner',
    level: 8,
    track: 'class',
    className: 'Alchemist',
    traits: ['alchemist'],
    prereqs: [{ kind: 'feat', name: 'Powerful Alchemy' }],
    effect: 'Poisons you craft yourself have their save DC increased, up to a ceiling set by your class DC.',
    source: 'Player Core 2',
  },
  {
    name: 'Extend Elixir',
    level: 10,
    track: 'class',
    className: 'Alchemist',
    traits: ['alchemist'],
    effect:
      'Elixirs you make that would last a minute or more instead last twice as long, letting a mutagen or similar draught cover a whole encounter and then some.',
    source: 'Player Core 2',
  },
  {
    name: 'Improbable Elixirs',
    level: 12,
    track: 'class',
    className: 'Alchemist',
    traits: ['alchemist'],
    effect:
      'You can reproduce the effect of certain potions as elixirs, learning formulas for them and brewing them with your alchemy rather than with magic.',
    repeatable: true,
    source: 'Player Core 2',
  },

  // ── BARBARIAN ───────────────────────────────────────────────────────────────────────────────────
  {
    name: 'Acute Vision',
    level: 1,
    track: 'class',
    className: 'Barbarian',
    traits: ['barbarian'],
    effect:
      'When you rage, your senses sharpen: if you have low-light vision you gain darkvision, and if you already had darkvision its range or precision improves for the duration.',
    source: 'Player Core 2',
  },
  {
    name: 'Moment of Clarity',
    level: 1,
    track: 'class',
    className: 'Barbarian',
    traits: ['barbarian', 'concentrate', 'rage'],
    cost: '1',
    effect:
      'You push through the fury for a moment, letting you use actions with the concentrate trait — which raging normally forbids — for the rest of this turn.',
    source: 'Player Core 2',
  },
  {
    name: 'Raging Intimidation',
    level: 1,
    track: 'class',
    className: 'Barbarian',
    traits: ['barbarian'],
    effect:
      'Your rage is itself a threat: while raging, your Demoralize and Scare to Death actions gain the rage trait, so you can use them mid-rage. You also gain Intimidating Glare, and later Scare to Death, as bonus feats once you meet their proficiency requirements.',
    source: 'Player Core 2',
  },
  {
    name: 'Raging Thrower',
    level: 1,
    track: 'class',
    className: 'Barbarian',
    traits: ['barbarian'],
    effect:
      'Your rage damage bonus applies to thrown weapons as well as melee ones, and thrown-weapon feats that normally require a melee Strike work with your throws.',
    source: 'Player Core 2',
  },
  {
    name: 'Sudden Charge',
    level: 1,
    track: 'class',
    className: 'Barbarian',
    traits: ['barbarian', 'flourish', 'open'],
    cost: '2',
    effect: 'Stride twice, then make a melee Strike, closing from well outside reach in a single burst.',
    source: 'Player Core 2',
  },
  {
    name: 'Brutal Bully',
    level: 2,
    track: 'class',
    className: 'Barbarian',
    traits: ['barbarian'],
    effect:
      'While raging, a successful Disarm, Grapple, Shove, or Trip you make also deals bludgeoning damage based on your Strength.',
    source: 'Player Core 2',
  },
  {
    name: 'Cleave',
    level: 2,
    track: 'class',
    className: 'Barbarian',
    traits: ['barbarian', 'rage'],
    cost: 'free',
    trigger: 'A creature adjacent to you is reduced to 0 Hit Points while you are raging.',
    effect: 'Your momentum carries the swing onward: make a melee Strike against a foe adjacent to the one that just dropped.',
    source: 'Player Core 2',
  },
  {
    name: "Giant's Stature",
    level: 2,
    track: 'class',
    className: 'Barbarian',
    traits: ['barbarian', 'polymorph', 'rage'],
    cost: '1',
    prereqText: 'You have the giant instinct.',
    effect:
      'You swell to Large size for the rest of your rage, gaining extra reach; your equipment grows with you, and you take the usual clumsy penalty for the unfamiliar bulk.',
    source: 'Player Core 2',
  },
  {
    name: 'Acute Scent',
    level: 4,
    track: 'class',
    className: 'Barbarian',
    traits: ['barbarian'],
    prereqs: [{ kind: 'feat', name: 'Acute Vision' }],
    effect: 'When you rage, you gain an imprecise scent sense out to 30 feet, or sharpen a scent sense you already had.',
    source: 'Player Core 2',
  },
  {
    name: 'Furious Finish',
    level: 4,
    track: 'class',
    className: 'Barbarian',
    traits: ['barbarian', 'rage'],
    cost: '1',
    effect:
      'Spend everything on one blow: make a Strike that deals extra damage based on how many rounds your rage had left, and your rage then ends immediately and you are fatigued until you rest.',
    source: 'Player Core 2',
  },
  {
    name: 'No Escape',
    level: 4,
    track: 'class',
    className: 'Barbarian',
    traits: ['barbarian', 'rage'],
    cost: 'reaction',
    trigger: 'A foe within reach attempts to move away from you.',
    effect: 'You Stride to stay with it, matching its movement so it cannot simply walk out of your reach.',
    source: 'Player Core 2',
  },
  {
    name: 'Second Wind',
    level: 4,
    track: 'class',
    className: 'Barbarian',
    traits: ['barbarian'],
    effect:
      'You can enter a second rage immediately after one ends, without the usual wait — but when that rage finishes you are fatigued until you rest for 10 minutes.',
    source: 'Player Core 2',
  },
  {
    name: 'Shake It Off',
    level: 4,
    track: 'class',
    className: 'Barbarian',
    traits: ['barbarian', 'concentrate', 'rage'],
    cost: '1',
    effect:
      'You growl off your nausea: reduce your frightened condition by 1, and attempt a Fortitude save to reduce or remove the sickened condition.',
    source: 'Player Core 2',
  },
  {
    name: 'Fast Movement',
    level: 6,
    track: 'class',
    className: 'Barbarian',
    traits: ['barbarian'],
    effect: 'While raging, you gain a +10-foot status bonus to your Speed.',
    source: 'Player Core 2',
  },
  {
    name: 'Raging Athlete',
    level: 6,
    track: 'class',
    className: 'Barbarian',
    traits: ['barbarian'],
    prereqs: [{ kind: 'skill', skill: 'Athletics', rank: 'expert' }],
    effect:
      'While raging, you climb and swim at your full land Speed, the DC to High Jump or Long Jump is reduced, and you jump farther than your Athletics alone would allow.',
    source: 'Player Core 2',
  },
  {
    name: 'Attack of Opportunity',
    level: 8,
    track: 'class',
    className: 'Barbarian',
    traits: ['barbarian'],
    cost: 'reaction',
    trigger: 'A creature within your reach uses a manipulate or move action, makes a ranged attack, or leaves a square during a move it takes.',
    effect:
      'You make a melee Strike against the triggering creature. If the trigger was a manipulate action and you hit, that action is disrupted.',
    source: 'Player Core 2',
  },
  {
    name: 'Furious Bully',
    level: 8,
    track: 'class',
    className: 'Barbarian',
    traits: ['barbarian'],
    effect: 'While raging, you gain a +2 circumstance bonus to Athletics checks made to attack a creature.',
    source: 'Player Core 2',
  },
  {
    name: 'Renewed Vigor',
    level: 8,
    track: 'class',
    className: 'Barbarian',
    traits: ['barbarian', 'concentrate', 'rage'],
    cost: '1',
    effect: 'You steady yourself mid-fury and gain temporary Hit Points based on your level and Constitution.',
    source: 'Player Core 2',
  },
  {
    name: 'Share Rage',
    level: 8,
    track: 'class',
    className: 'Barbarian',
    traits: ['auditory', 'barbarian', 'rage', 'visual'],
    cost: '1',
    frequency: 'once per rage',
    effect: 'An ally who can see or hear you gains the effects of a rage of their own for a round, without needing the class feature.',
    source: 'Player Core 2',
  },
  {
    name: 'Sudden Leap',
    level: 8,
    track: 'class',
    className: 'Barbarian',
    traits: ['barbarian', 'flourish'],
    cost: '2',
    effect:
      'Make a melee Strike while Leaping or High Jumping, striking mid-air at any point along the jump. You can jump further than your normal limits allow, up to your Speed.',
    source: 'Player Core 2',
  },
  {
    name: 'Thrash',
    level: 8,
    track: 'class',
    className: 'Barbarian',
    traits: ['barbarian', 'rage'],
    cost: '1',
    requirements: 'You have a creature grabbed.',
    effect:
      'You maul the creature you have hold of, dealing bludgeoning damage from your Strength and rage; a successful Fortitude save halves it.',
    source: 'Player Core 2',
  },
  {
    name: 'Come and Get Me',
    level: 10,
    track: 'class',
    className: 'Barbarian',
    traits: ['barbarian', 'concentrate', 'rage'],
    cost: '1',
    effect:
      'You open your guard to bait attacks: you are off-guard and take extra damage from hits, but every creature that hits you provokes a reaction Strike from you and you gain temporary Hit Points when you hit back.',
    source: 'Player Core 2',
  },
  {
    name: 'Vicious Evisceration',
    level: 12,
    track: 'class',
    className: 'Barbarian',
    traits: ['barbarian', 'rage'],
    cost: '2',
    effect:
      'Make a melee Strike that, on a hit, also inflicts the drained condition on the target — drained 2 on a critical hit.',
    source: 'Player Core 2',
  },
  {
    name: 'Whirlwind Strike',
    level: 12,
    track: 'class',
    className: 'Barbarian',
    traits: ['barbarian', 'flourish', 'open'],
    cost: '3',
    effect:
      'Make a melee Strike against every enemy within your reach. Each uses the same multiple attack penalty, which does not increase until all the Strikes are resolved.',
    source: 'Player Core 2',
  },
  // ── BARD ────────────────────────────────────────────────────────────────────────────────────────
  {
    name: 'Bardic Lore',
    level: 1,
    track: 'class',
    className: 'Bard',
    traits: ['bard'],
    prereqText: 'You have the enigma muse.',
    effect:
      'You become trained in a Lore covering essentially everything, usable to Recall Knowledge on any subject. Your proficiency in it rises with your other bard proficiencies.',
    source: 'Player Core',
  },
  {
    name: 'Lingering Composition',
    level: 1,
    track: 'class',
    className: 'Bard',
    traits: ['bard'],
    prereqText: 'You have the maestro muse.',
    effect:
      'You gain a focus spell that extends a composition you cast: on a successful Performance check its duration is longer than the usual single round, and longer still on a critical success.',
    source: 'Player Core',
  },
  {
    name: 'Reach Spell',
    level: 1,
    track: 'class',
    className: 'Bard',
    traits: ['bard', 'concentrate', 'metamagic'],
    cost: '1',
    effect:
      'The next spell you cast this turn has its range extended by 30 feet, or gains a 30-foot range if it would normally have to be cast on a creature you touch.',
    source: 'Player Core',
  },
  {
    name: 'Versatile Performance',
    level: 1,
    track: 'class',
    className: 'Bard',
    traits: ['bard'],
    prereqText: 'You have the polymath muse.',
    effect:
      'You can use Performance in place of Diplomacy to Make an Impression, in place of Intimidation to Demoralize, and to satisfy the requirements of feats that call for those skills.',
    source: 'Player Core',
  },
  {
    name: 'Cantrip Expansion',
    level: 2,
    track: 'class',
    className: 'Bard',
    traits: ['bard'],
    effect: 'You add two additional cantrips to your repertoire, chosen from the occult list.',
    source: 'Player Core',
  },
  {
    name: 'Esoteric Polymath',
    level: 2,
    track: 'class',
    className: 'Bard',
    traits: ['bard'],
    prereqText: 'You have the polymath muse.',
    effect:
      'You keep a spellbook of spells from any tradition. Each day you can add one spell from it to your repertoire for the day, and if it is already in your repertoire you gain an extra slot to cast it from.',
    source: 'Player Core',
  },
  {
    name: 'Inspire Competence',
    level: 2,
    track: 'class',
    className: 'Bard',
    traits: ['bard'],
    prereqText: 'You have the maestro muse.',
    effect:
      'You gain a composition cantrip that grants one ally a bonus to a skill check they are about to attempt, with the size of the bonus set by your Performance check.',
    source: 'Player Core',
  },
  {
    name: "Loremaster's Etude",
    level: 2,
    track: 'class',
    className: 'Bard',
    traits: ['bard', 'fortune'],
    cost: 'free',
    prereqText: 'You have the enigma muse.',
    effect:
      'You gain a focus spell that lets an ally about to Recall Knowledge roll the check twice and take the better result.',
    source: 'Player Core',
  },
  {
    name: 'Inspire Defense',
    level: 4,
    track: 'class',
    className: 'Bard',
    traits: ['bard'],
    effect:
      'You gain a composition cantrip that grants you and nearby allies a status bonus to AC and saving throws, plus resistance to physical damage, for a round.',
    source: 'Player Core',
  },
  {
    name: 'Melodious Spell',
    level: 4,
    track: 'class',
    className: 'Bard',
    traits: ['bard', 'concentrate', 'manipulate', 'metamagic'],
    cost: '1',
    effect:
      'You hide a spell inside a performance. Attempt a Performance check against the Perception DCs of observers; those you beat do not notice you casting at all.',
    source: 'Player Core',
  },
  {
    name: 'Triple Time',
    level: 4,
    track: 'class',
    className: 'Bard',
    traits: ['bard'],
    effect:
      'You gain a composition cantrip that grants you and nearby allies a status bonus to Speed for a round, whether in combat or on the march.',
    source: 'Player Core',
  },
  {
    name: 'Versatile Signature',
    level: 4,
    track: 'class',
    className: 'Bard',
    traits: ['bard'],
    prereqText: 'You have the polymath muse.',
    effect: 'Each day when you prepare, you can change which of your known spells are your signature spells.',
    source: 'Player Core',
  },
  {
    name: 'Dirge of Doom',
    level: 6,
    track: 'class',
    className: 'Bard',
    traits: ['bard'],
    effect: 'You gain a composition cantrip that leaves every enemy near you frightened 1 for a round.',
    source: 'Player Core',
  },
  {
    name: 'Harmonize',
    level: 6,
    track: 'class',
    className: 'Bard',
    traits: ['bard', 'concentrate', 'metamagic'],
    cost: '1',
    prereqText: 'You have the maestro muse.',
    effect:
      'The composition you cast this turn can be active at the same time as one other composition, rather than replacing it as compositions normally do.',
    source: 'Player Core',
  },
  {
    name: 'Steady Spellcasting',
    level: 6,
    track: 'class',
    className: 'Bard',
    traits: ['bard'],
    effect:
      'When a reaction would disrupt your spellcasting, attempt a flat check; on a success the spell goes off anyway.',
    source: 'Player Core',
  },
  {
    name: 'Eclectic Skill',
    level: 8,
    track: 'class',
    className: 'Bard',
    traits: ['bard'],
    prereqs: [{ kind: 'skill', skill: 'Occultism', rank: 'master' }],
    prereqText: 'You have the polymath muse.',
    effect:
      'You add your level to checks with skills you are untrained in, and can attempt checks that normally require being trained. At legendary Occultism this extends to checks requiring expert proficiency.',
    source: 'Player Core',
  },
  {
    name: 'Inspire Heroics',
    level: 8,
    track: 'class',
    className: 'Bard',
    traits: ['bard'],
    prereqText: 'You have the maestro muse.',
    effect:
      'You gain a focus spell that strengthens your courage or defense composition: on a successful Performance check the status bonus it grants increases, and increases further on a critical success.',
    source: 'Player Core',
  },
  {
    name: 'Know-It-All',
    level: 8,
    track: 'class',
    className: 'Bard',
    traits: ['bard'],
    prereqText: 'You have the enigma muse.',
    effect: 'When you succeed at a check to Recall Knowledge, you learn additional information beyond the basic answer.',
    source: 'Player Core',
  },
  {
    name: 'House of Imaginary Walls',
    level: 10,
    track: 'class',
    className: 'Bard',
    traits: ['bard'],
    effect:
      'You gain a composition cantrip that mimes an illusory wall into being; creatures that believe in it treat it as a real barrier until they disbelieve.',
    source: 'Player Core',
  },
  {
    name: 'Quickened Casting',
    level: 10,
    track: 'class',
    className: 'Bard',
    traits: ['bard', 'concentrate', 'metamagic'],
    cost: 'free',
    frequency: 'once per day',
    effect:
      'Reduce the number of actions to cast your next spell by one, provided the spell is at least two ranks below the highest rank you can cast.',
    source: 'Player Core',
  },
  {
    name: 'Allegro',
    level: 12,
    track: 'class',
    className: 'Bard',
    traits: ['bard'],
    effect: 'You gain a composition cantrip that makes one ally quickened for a round, letting them take an extra action.',
    source: 'Player Core',
  },
  {
    name: 'Eclectic Polymath',
    level: 12,
    track: 'class',
    className: 'Bard',
    traits: ['bard'],
    prereqs: [{ kind: 'feat', name: 'Esoteric Polymath' }],
    effect:
      'A spell you add to your repertoire with Esoteric Polymath stays there until you swap it out, at the cost of removing another spell of the same rank.',
    source: 'Player Core',
  },
  {
    name: 'Inspirational Focus',
    level: 12,
    track: 'class',
    className: 'Bard',
    traits: ['bard'],
    effect: 'Your maximum number of Focus Points increases by 1.',
    source: 'Player Core',
  },
  {
    name: 'Soothing Ballad',
    level: 14,
    track: 'class',
    className: 'Bard',
    traits: ['bard'],
    effect:
      'You gain a focus spell that either counteracts a fear effect on your allies, counteracts paralysis, or heals them, with the strength of the effect set by your Performance check.',
    source: 'Player Core',
  },
  {
    name: 'Effortless Concentration',
    level: 16,
    track: 'class',
    className: 'Bard',
    traits: ['bard', 'concentrate'],
    cost: 'free',
    trigger: 'Your turn begins.',
    effect: 'You Sustain a spell you have active without spending an action on it.',
    source: 'Player Core',
  },
  {
    name: 'Studious Capacity',
    level: 16,
    track: 'class',
    className: 'Bard',
    traits: ['bard'],
    prereqs: [{ kind: 'skill', skill: 'Occultism', rank: 'legendary' }],
    prereqText: 'You have the enigma muse.',
    effect:
      'Once per day you can cast a spell even though you have no slots of that rank left, so long as it is below the highest rank you can cast.',
    source: 'Player Core',
  },
  {
    name: 'Deep Lore',
    level: 18,
    track: 'class',
    className: 'Bard',
    traits: ['bard'],
    prereqs: [{ kind: 'skill', skill: 'Occultism', rank: 'legendary' }],
    effect: 'You learn one additional spell of each rank you can cast, adding them to your repertoire.',
    source: 'Player Core',
  },
  {
    name: 'Fatal Aria',
    level: 20,
    track: 'class',
    className: 'Bard',
    traits: ['bard'],
    effect:
      'You gain a focus spell whose song can kill outright: a creature well below your level dies, a stronger one takes heavy damage, and one above your level takes somewhat less.',
    source: 'Player Core',
  },
  {
    name: 'Perfect Encore',
    level: 20,
    track: 'class',
    className: 'Bard',
    traits: ['bard'],
    effect: 'You gain an additional spell slot of the highest rank you can cast.',
    source: 'Player Core',
  },

  // ── CHAMPION ────────────────────────────────────────────────────────────────────────────────────
  // Deliberately SHORT. The Remaster rebuilt the champion around causes in place of alignment-locked
  // tenets, and most of the class's feat list is gated on a specific cause whose Remaster name and
  // gating I could not state confidently. Only feats that are cause-agnostic (or whose gate is stated
  // as prose) are catalogued; see PF2_FEATS_CLASS_GAPS.
  {
    name: "Deity's Domain",
    level: 1,
    track: 'class',
    className: 'Champion',
    traits: ['champion'],
    effect:
      'Choose one domain associated with the deity or ideal you serve. You gain that domain\'s initial domain spell as a focus spell, and a focus pool if you did not already have one.',
    source: 'Player Core 2',
  },
  {
    name: 'Divine Grace',
    level: 2,
    track: 'class',
    className: 'Champion',
    traits: ['champion'],
    cost: 'reaction',
    trigger: 'You attempt a saving throw, but have not yet learned the result.',
    effect: 'You gain a +2 circumstance bonus to that saving throw.',
    source: 'Player Core 2',
  },
  {
    name: 'Aura of Courage',
    level: 4,
    track: 'class',
    className: 'Champion',
    traits: ['aura', 'champion'],
    effect:
      'You reduce your frightened condition by 1 as soon as you gain it, and whenever it decreases at the end of your turn it also decreases for allies near you.',
    source: 'Player Core 2',
  },
  {
    name: 'Mercy',
    level: 4,
    track: 'class',
    className: 'Champion',
    traits: ['champion', 'concentrate', 'metamagic'],
    cost: '1',
    effect:
      'The lay-on-hands focus spell you cast this turn also attempts to counteract the frightened or paralyzed condition on its target.',
    source: 'Player Core 2',
  },
  {
    name: 'Divine Health',
    level: 6,
    track: 'class',
    className: 'Champion',
    traits: ['champion'],
    effect:
      'You gain a +1 status bonus to saves against diseases, and a success against a disease counts as a critical success.',
    source: 'Player Core 2',
  },
  {
    name: "Advanced Deity's Domain",
    level: 8,
    track: 'class',
    className: 'Champion',
    traits: ['champion'],
    prereqs: [{ kind: 'feat', name: "Deity's Domain" }],
    effect: 'You gain the advanced domain spell of the domain you chose, as a focus spell.',
    source: 'Player Core 2',
  },
  {
    name: 'Ultimate Mercy',
    level: 20,
    track: 'class',
    className: 'Champion',
    traits: ['champion'],
    prereqs: [{ kind: 'feat', name: 'Mercy' }],
    effect:
      'Your lay on hands can restore a creature that died within the last round to life at 1 Hit Point, leaving it with the usual lasting weakness from having died.',
    source: 'Player Core 2',
  },

  // ── CLERIC ──────────────────────────────────────────────────────────────────────────────────────
  {
    name: 'Deadly Simplicity',
    level: 1,
    track: 'class',
    className: 'Cleric',
    traits: ['cleric'],
    prereqText: "Your deity's favored weapon is a simple weapon that deals less than a d6 of damage.",
    effect: "Your deity's favored weapon deals one damage die size larger in your hands.",
    source: 'Player Core',
  },
  {
    name: 'Domain Initiate',
    level: 1,
    track: 'class',
    className: 'Cleric',
    traits: ['cleric'],
    effect:
      'Choose one domain associated with your deity. You gain that domain\'s initial domain spell as a focus spell, and a focus pool if you did not already have one.',
    repeatable: true,
    source: 'Player Core',
  },
  {
    name: 'Harming Hands',
    level: 1,
    track: 'class',
    className: 'Cleric',
    traits: ['cleric'],
    prereqText: 'You have the harmful font.',
    effect: 'The harm spells you cast from your divine font use a d10 for their healing or damage die instead of a d8.',
    source: 'Player Core',
  },
  {
    name: 'Healing Hands',
    level: 1,
    track: 'class',
    className: 'Cleric',
    traits: ['cleric'],
    prereqText: 'You have the healing font.',
    effect: 'The heal spells you cast from your divine font use a d10 for their healing die instead of a d8.',
    source: 'Player Core',
  },
  {
    name: 'Communal Healing',
    level: 2,
    track: 'class',
    className: 'Cleric',
    traits: ['cleric', 'healing', 'vitality'],
    effect:
      'Whenever you cast a heal spell that targets a single creature other than yourself, you also regain Hit Points equal to the spell\'s rank.',
    source: 'Player Core',
  },
  {
    name: 'Emblazon Armament',
    level: 2,
    track: 'class',
    className: 'Cleric',
    traits: ['cleric', 'exploration'],
    effect:
      'Spend 10 minutes marking a shield or weapon with a religious symbol. An emblazoned shield gains extra Hardness; an emblazoned weapon grants a bonus to damage rolls against creatures the faith opposes.',
    source: 'Player Core',
  },
  {
    name: 'Sap Life',
    level: 2,
    track: 'class',
    className: 'Cleric',
    traits: ['cleric'],
    effect:
      'When you damage a living creature with a harm spell, you regain Hit Points equal to the spell\'s rank — more if the spell affected several creatures.',
    source: 'Player Core',
  },
  {
    name: 'Versatile Font',
    level: 2,
    track: 'class',
    className: 'Cleric',
    traits: ['cleric'],
    prereqText: 'You have the healing font or the harmful font.',
    effect:
      'Each day when you prepare, you can fill your divine font slots with either heal or harm, rather than being limited to the one your font names.',
    source: 'Player Core',
  },
  {
    name: 'Cast Down',
    level: 4,
    track: 'class',
    className: 'Cleric',
    traits: ['cleric', 'concentrate', 'metamagic'],
    cost: '1',
    effect:
      'If the heal or harm spell you cast this turn damages a creature, that creature is also knocked prone — and its Speed is reduced for a round if the spell critically failed against it.',
    source: 'Player Core',
  },
  {
    name: 'Channel Smite',
    level: 4,
    track: 'class',
    className: 'Cleric',
    traits: ['cleric', 'divine'],
    cost: '2',
    requirements: 'You have a heal or harm spell prepared.',
    effect:
      'Expend the prepared spell to make a melee Strike that, on a hit, also deals the spell\'s damage to the target with no save allowed.',
    source: 'Player Core',
  },
  {
    name: 'Divine Weapon',
    level: 4,
    track: 'class',
    className: 'Cleric',
    traits: ['cleric'],
    cost: 'free',
    frequency: 'once per turn',
    trigger: 'You finish casting a spell from a spell slot.',
    effect:
      'Until the end of your turn, a weapon you are wielding deals extra damage of a type suited to your faith.',
    source: 'Player Core',
  },
  {
    name: 'Rebuke Death',
    level: 4,
    track: 'class',
    className: 'Cleric',
    traits: ['cleric'],
    effect:
      'You gain a focus spell that heals dying creatures near you without the usual risk, and returns a dying creature to consciousness if it brings them above 0 Hit Points.',
    source: 'Player Core',
  },
  {
    name: 'Selective Energy',
    level: 4,
    track: 'class',
    className: 'Cleric',
    traits: ['cleric'],
    effect:
      'When you cast a heal or harm spell over an area, you can exclude a number of creatures from its effect based on your Charisma.',
    source: 'Player Core',
  },
  {
    name: 'Advanced Domain',
    level: 6,
    track: 'class',
    className: 'Cleric',
    traits: ['cleric'],
    prereqs: [{ kind: 'feat', name: 'Domain Initiate' }],
    effect: 'You gain the advanced domain spell of a domain you took with Domain Initiate, as a focus spell.',
    repeatable: true,
    source: 'Player Core',
  },
  {
    name: 'Steady Spellcasting',
    level: 6,
    track: 'class',
    className: 'Cleric',
    traits: ['cleric'],
    effect:
      'When a reaction would disrupt your spellcasting, attempt a flat check; on a success the spell goes off anyway.',
    source: 'Player Core',
  },
  {
    name: 'Improved Communal Healing',
    level: 8,
    track: 'class',
    className: 'Cleric',
    traits: ['cleric', 'healing', 'vitality'],
    prereqs: [{ kind: 'feat', name: 'Communal Healing' }],
    effect:
      'The Hit Points you would regain from Communal Healing can instead be given to any creature you can see within 30 feet.',
    source: 'Player Core',
  },
  {
    name: 'Maker of Miracles',
    level: 20,
    track: 'class',
    className: 'Cleric',
    traits: ['cleric'],
    prereqText: 'You have a 9th-rank divine spell slot and the miracle-granting capstone of your font.',
    effect: 'You gain an additional 10th-rank spell slot.',
    source: 'Player Core',
  },
];
