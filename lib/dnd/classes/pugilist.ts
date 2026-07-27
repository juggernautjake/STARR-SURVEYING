// lib/dnd/classes/pugilist.ts — THE PUGILIST, as a real ClassDefinition in both 5e editions.
//
// Created by **Benjamin Hoffman** (Sterling Vermin Adventuring Co.). Shipped here as public homebrew,
// credited to its author and to Andrew & Jacob, who brought it to this table (owner 2026-07-27).
//
// SOURCING. Everything below is transcribed from material the owner supplied on 2026-07-27: the full 2014
// class text (levels 1–20 table, every feature, all seven Fight Clubs) and the 2024 revision's level
// schedule and feature set. Where the 2024 text was summarised rather than reproduced, the feature is
// named with the summary as its body and marked so — a named feature at the right level is useful; an
// invented rules text is not (Ground Rule 3).
//
// WHY TWO EDITIONS. The 2014 and 2024 Pugilists are genuinely different classes, not a reskin:
//
//   |                | 2014                          | 2024                                      |
//   |----------------|-------------------------------|-------------------------------------------|
//   | hit die        | d8                            | d10                                       |
//   | Fisticuffs die | 1d6 → 1d12                    | 1d8 → 2d6                                 |
//   | subclass level | 3 ("Fight Club", 7 options)   | 3 (6 options, incl. Street Saint)         |
//   | Bloodied…      | level 3                       | level 2                                   |
//   | Haymaker       | disadvantage, max damage      | spend Moxie, refunded on a hit            |
//
// Modelling both is the same reason the repo keeps 2014 and 2024 class data apart everywhere else: a
// player on either edition should get THEIR Pugilist, not the other one wearing its name.
import type { ClassDefinition, SubclassDefinition } from './types';

const AUTHOR = { authorName: 'Benjamin Hoffman (Sterling Vermin) · brought to this table by Andrew & Jacob' };

/** The Fisticuffs die by level (2014): 1d6 → 1d8 @5 → 1d10 @11 → 1d12 @17. */
const FISTICUFFS_2014 = (lvl: number) => (lvl >= 17 ? '1d12' : lvl >= 11 ? '1d10' : lvl >= 5 ? '1d8' : '1d6');
/** 2024: 1d8 → 1d10 @5 → 1d12 @11 → 2d6 @17. */
const FISTICUFFS_2024 = (lvl: number) => (lvl >= 17 ? '2d6' : lvl >= 11 ? '1d12' : lvl >= 5 ? '1d10' : '1d8');

/** Moxie points per level, 2014 table: — 2 2 3 3 4 4 5 5 6 6 7 7 8 8 9 9 10 10 12. */
// Indexed 1-20 (element 0 unused), which is the shape validateClassDefinition requires.
const MOXIE_2014 = [0, 0, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 12];

const SKILLS = ['Acrobatics', 'Athletics', 'Deception', 'Intimidation', 'Perception', 'Sleight of Hand', 'Stealth'];

// ── 2014 ────────────────────────────────────────────────────────────────────────────────────────
export const PUGILIST_2014: ClassDefinition = {
  key: 'pugilist',
  name: 'Pugilist',
  system: 'dnd5e-2014',
  custom: AUTHOR,
  hitDie: 8,
  primaryAbility: ['str'],
  savingThrows: ['str', 'con'],
  skillChoices: { count: 2, from: SKILLS },
  armorProficiencies: ['Light armor'],
  weaponProficiencies: ['Simple weapons', 'Improvised weapons', 'Whip', 'Derringer'],
  toolProficiencies: ["One artisan's tools, gaming set, or thieves' tools of your choice"],
  asiLevels: [4, 8, 12, 16, 19],
  subclassLevel: 3,
  subclassLabel: 'Fight Club',
  resources: [{
    id: 'moxie',
    name: 'Moxie Points',
    perLevel: MOXIE_2014,
    resetOn: 'short',
    note: 'Also fully restored by Bloodied But Unbowed.',
  }],
  startingEquipment: [
    '(a) leather armor or (b) any simple weapon',
    "(a) a dungeoneer's pack or (b) an explorer's pack",
    "(a) a set of artisan's tools, (b) a gaming set, or (c) thieves' tools",
  ],
  description:
    'A scrappy, streetwise brawler who fights with fists, bar stools and sheer refusal to stay down. '
    + 'Pugilists tap into moxie — not mystic energy, but determination forged over a lifetime of hardship.',
  features: [
    { level: 1, name: 'Fisticuffs', body: `While unarmed or using only pugilist weapons (simple melee weapons without the two-handed property, whips, and improvised weapons), wearing light or no armor and no shield: roll ${FISTICUFFS_2014(1)} in place of the normal damage of your unarmed strike or pugilist weapon (rising to 1d8 at 5th, 1d10 at 11th, 1d12 at 17th). When you take the Attack action with one, you can make one unarmed strike or grapple as a bonus action. You may not use a weapon's finesse property while using it as a pugilist weapon.` },
    { level: 1, name: 'Iron Chin', body: 'While wearing light or no armor and not wielding a shield, your AC equals 12 + your Constitution modifier.' },
    { level: 2, name: 'Moxie', body: 'You gain moxie points (see the Moxie resource). You start knowing three moxie features — Brace Up, The Old One-Two, and Stick and Move — and regain all expended points on a short or long rest.\n\n**Brace Up.** Bonus action, 1 point: roll your Fisticuffs die + your pugilist level + your Constitution modifier and gain that many temporary hit points.\n\n**The Old One-Two.** Immediately after the Attack action, 1 point: make two unarmed strikes as a bonus action.\n\n**Stick and Move.** Bonus action, 1 point: make a shove attack or take the Dash action.' },
    { level: 2, name: 'Street Smart', body: 'Carousing, shadowboxing and sparring count as light activity for resting. After carousing in a settlement for 8 hours or more, you know all its public locations as if born there and cannot be lost by non-magical means within it.' },
    { level: 3, name: 'Bloodied But Unbowed', body: 'When damage reduces you to half your maximum hit points or less, you can use your reaction to gain temporary hit points equal to your pugilist level + your Constitution modifier, and regain all expended moxie points. Once per short or long rest.' },
    { level: 3, name: 'Fight Club', body: 'Choose the fight club that exemplifies your style. It grants features at 3rd, 6th, 11th and 17th level.', choice: 'subclass', subclass: true },
    { level: 4, name: 'Ability Score Improvement', body: 'Increase one ability score by 2, or two scores by 1 each (maximum 20).', choice: 'asi' },
    { level: 4, name: 'Dig Deep', body: 'Bonus action: gain resistance to bludgeoning, piercing and slashing damage for 1 minute. At the end of that minute you gain a level of exhaustion.' },
    { level: 5, name: 'Extra Attack', body: 'You can attack twice, instead of once, whenever you take the Attack action on your turn.' },
    { level: 5, name: 'Haymaker', body: 'Before an attack that does not already have disadvantage, declare you are swinging wild. All your weapon attack rolls until the end of the turn have disadvantage, and when you deal damage with a pugilist weapon or unarmed strike you use the maximum die result instead of rolling.' },
    { level: 6, name: 'Moxie-Fueled Fists', body: 'Your unarmed strikes count as magical for overcoming resistance and immunity to non-magical attacks and damage.' },
    { level: 7, name: 'Fancy Footwork', body: 'You gain proficiency in Dexterity saving throws.' },
    { level: 7, name: 'Shake It Off', body: 'You can use your action to end one effect on yourself causing you to be charmed or frightened.' },
    { level: 8, name: 'Ability Score Improvement', body: 'Increase one ability score by 2, or two scores by 1 each (maximum 20).', choice: 'asi' },
    { level: 9, name: 'Down But Not Out', body: 'When you use Bloodied But Unbowed you can also use this feature: add your proficiency bonus to your damage with unarmed attacks and pugilist weapons for 1 minute. Once per long rest.' },
    { level: 10, name: 'School of Hard Knocks', body: 'You have resistance to psychic damage and advantage on saving throws against effects that would stun or knock you unconscious.' },
    { level: 12, name: 'Ability Score Improvement', body: 'Increase one ability score by 2, or two scores by 1 each (maximum 20).', choice: 'asi' },
    { level: 13, name: 'Rabble Rouser', body: 'After a long rest spent carousing in a settlement, you have advantage on Charisma (Persuasion) and Charisma (Intimidation) rolls against the people who live there.' },
    { level: 14, name: 'Unbreakable', body: 'You have advantage on Strength, Dexterity and Constitution saving throws. When you fail a saving throw, you can spend 1 moxie point to reroll it and take the second result.' },
    { level: 15, name: 'Herculean', body: 'Your carrying capacity is doubled; damage you deal to inanimate objects with a melee weapon or unarmed strike is doubled; your standing jump distance equals your running-start jump distance.' },
    { level: 16, name: 'Ability Score Improvement', body: 'Increase one ability score by 2, or two scores by 1 each (maximum 20).', choice: 'asi' },
    { level: 18, name: 'Fighting Spirit', body: 'When you have 4 levels of exhaustion or fewer and are reduced to 0 hit points, you regain half your maximum hit points, half your maximum moxie points, and gain a level of exhaustion. Once per long rest.' },
    { level: 19, name: 'Ability Score Improvement', body: 'Increase one ability score by 2, or two scores by 1 each (maximum 20).', choice: 'asi' },
    { level: 20, name: 'Peak Physical Condition', body: 'Your Strength and Constitution scores increase by 2, to a maximum of 22. On a long rest you recover 2 levels of exhaustion instead of 1, and regain all expended hit dice instead of half.' },
  ],
};

const sc = (key: string, name: string, description: string, features: [number, string, string][]): SubclassDefinition => ({
  key, name, classKey: 'pugilist', system: 'dnd5e-2014', description, custom: AUTHOR,
  features: features.map(([level, n, body]) => ({ level, name: n, body, subclass: true })),
});

/** The seven 2014 Fight Clubs, complete. */
export const PUGILIST_2014_SUBCLASSES: SubclassDefinition[] = [
  sc('arena-royale', 'Arena Royale', 'Part performer, part gladiator — pugilists who care as much about the theatrics of a fight as its outcome.', [
    [3, 'Bonus Proficiency', 'You gain proficiency in Performance, or if you already have it, in Intimidation or Persuasion.'],
    [3, 'Persona Libre', 'Create an alternate persona you can adopt or discard as a bonus action, with a striking name and a physical signifier. Unless told or seen adopting it, creatures do not know you are the same person. You have persona points equal to 3 + your Charisma modifier (minimum 1), usable in place of moxie points, and before a Charisma check you can spend one to add your Strength modifier. Usable only while your persona is adopted; regained on a long rest.'],
    [6, 'Work the Crowd', 'While in your persona, use your action to inspire fear or adoration: each creature within 30 feet that can see you must succeed on a Wisdom save (DC 8 + proficiency + Strength modifier) or be charmed (adoration) or frightened (fear) for 1 minute, repeating the save each time it takes damage from you or an ally. Once per long rest.'],
    [11, 'High Flyer', 'Your base movement increases by 10 feet, your jump distance is doubled, and you can take the Dash action as a bonus action.'],
    [17, 'Signature Move', 'Name and describe a signature move, usable while in your persona in place of one unarmed or pugilist-weapon attack. Jump up to your movement speed in any direction, attack a creature in reach with advantage, and on a hit it is a critical and the creature is stunned until the end of your next turn. On a hit, you must finish a long rest to use it again; on a miss, it returns after 1 minute.'],
  ]),
  sc('bloodhound-bruisers', 'Bloodhound Bruisers', 'Pugilists notorious for looking for trouble and finding it — highly observant, and almost supernaturally connected to their cities.', [
    [3, 'Ever Vigilant', 'You have advantage on initiative rolls, and during the first round of combat you have advantage on attack rolls against creatures who have not acted yet.'],
    [3, 'Detective Work', 'Gain proficiency with two of Insight, Investigation or Perception. When you make an Intelligence (Investigation), Wisdom (Insight) or Wisdom (Perception) check you can spend 1 moxie point for advantage.'],
    [6, 'Scrap Like a Sleuth', 'Bonus action, 2 moxie points: hone in on an enemy within 30 feet. You have advantage on weapon attacks against it and add your proficiency bonus to your AC against its attacks, for 1 minute or until you use this again.'],
    [11, 'Heart of the City', 'On a long rest in a settlement you may become familiar with it (replacing any previous). While there: you cannot be surprised and add your proficiency bonus to initiative; you have darkvision to 120 feet; Insight, Investigation and Perception checks add twice your proficiency bonus; you cannot be lost by any means; and out of combat you travel between any two points at twice your normal speed.'],
    [17, 'Eyes Wide Open', 'Bonus action, 1 moxie point: for 1 minute you have advantage on saves against being blinded or deafened, and truesight out to 30 feet.'],
  ]),
  sc('dog-and-hound', 'Dog & Hound', 'You have never had a friend you could rely on that walked on two legs — but the best four-legged friend a body could ask for.', [
    [3, 'Bonus Proficiency', 'You gain proficiency in Animal Handling, or if you already have it, in Perception or Survival.'],
    [3, "Brawler's Best Friend", "You gain a hound that fights alongside you, using a wolf's statistics. Add your proficiency bonus to its AC, saving throws, attack rolls and damage rolls. For each level after 3rd it gains an additional d8 hit die. Use a bonus action to command it to Attack, Dash, Disengage, Dodge or Help; otherwise it acts on its own to protect you and itself, and never needs a command to use its reaction. If it dies you can bond with a new canine over 8 hours."],
    [3, 'Mutt With Moxie', 'When you use Brace Up, your hound gains the same temporary hit points. When you use The Old One-Two, your hound can make one or both attacks instead of you. When you use Stick and Move, your hound can take the Dash action.'],
    [6, 'Arcanine Bite', "Your hound's attacks count as magical for overcoming resistance and immunity to non-magical attacks and damage."],
    [6, 'Coordinated Attack', 'When you take the Attack action, if your hound can see you it can use its reaction to make a melee attack.'],
    [11, "Hound's Best Friend", 'When a creature damages your hound with an attack, you can use your reaction to make an opportunity attack against it if you are within range.'],
    [17, 'Dire Hound', "Your hound uses a dire wolf's statistics instead of a wolf's, except that its size remains Medium, modified as described in Brawler's Best Friend."],
  ]),
  sc('hand-of-dread', 'Hand of Dread', 'In your darkest hour you pleaded for strength, and a dread power took notice. The pact came with strings attached.', [
    [3, 'Black Magic', 'You learn the blade ward, eldritch blast and prestidigitation cantrips, using Constitution as your spellcasting ability. You also learn one of Abyssal, Infernal or Sylvan.'],
    [3, 'Dread Hand', 'Bonus action: one limb transmogrifies for 1 minute. When you roll a 1 on an unarmed strike damage die you can reroll and must use the new roll. The first time you miss with an unarmed strike each turn you can make an additional unarmed strike as part of the same action. Immediately after the Attack action you can spend 2 moxie points to make three unarmed strikes as a bonus action. Once per short or long rest.'],
    [6, 'Deal With The Devil', 'You gain two eldritch invocations of your choice from the warlock list. When you gain a level in this class you may replace one with another you qualify for.'],
    [11, 'Grotesque Growth', 'When you use Dread Hand you can instead grow one size category for 1 minute (or the largest the space allows). While enlarged you have advantage on Strength checks and saves, your reach becomes 10 feet, and your melee weapon attacks deal an extra 1d4 damage. At the end you suffer one level of exhaustion.'],
    [17, 'Fountain of Viscera', 'Action, 6 moxie points: a creature within reach makes a Dexterity save (DC 8 + proficiency + Strength modifier), taking 100 piercing damage on a failure or 50 on a success. If reduced to 0 hit points it dies instantly, and each creature within 30 feet that can see you must succeed on a Wisdom save (same DC) or be frightened of you for 1 minute, repeating at the end of each of its turns. Once per long rest.'],
  ]),
  sc('piss-and-vinegar', 'Piss & Vinegar', 'Pugilists who revel in their reputations as heels — obscene, dirty-fighting, and proud of it.', [
    [3, 'Bonus Proficiency', 'You gain proficiency in Intimidation if you do not have it already.'],
    [3, 'Salty Salute', 'Bonus action: provoke a creature within 60 feet that can see or hear you. It makes a Wisdom save (Piss & Vinegar DC = 8 + proficiency + Charisma modifier); on a failure it takes your Fisticuffs die + your Charisma modifier in psychic damage and has disadvantage on attack rolls that do not include you as a target before the start of your next turn.'],
    [6, 'Dirty Tricks', 'Each usable once per short or long rest.\n\n**Heelstomper.** On damaging a creature with an unarmed attack, it makes a Dexterity save; on a failure you gain 1 moxie point (to your maximum) and its speed is halved for 1 minute.\n\n**Low Blow.** On damaging a creature with an unarmed attack, it makes a Strength save; on a failure you gain 1 moxie point and it is knocked prone.\n\n**Pocket Sand.** Bonus action: a creature within 5 feet makes a Constitution save; on a failure you gain 1 moxie point and it is blinded until the end of its next turn.'],
    [11, 'Mean Old Cuss', 'When you make a Charisma (Intimidation) check you can use your reaction and spend 1 moxie for advantage. When a creature saves against one of your Piss & Vinegar features, you can use your reaction and spend 1 moxie to give that roll disadvantage.'],
    [17, 'The Uncouth Art', 'When you use Salty Salute you can target a number of creatures within 60 feet up to your pugilist level. You gain 1 moxie point (to your maximum) the first time each targeted creature hits you before the start of your next turn. Once per long rest.'],
  ]),
  sc('squared-circle', 'The Squared Circle', "Pugilists who know you don't have to knock an opponent senseless to get them to submit. They just know they don't have to.", [
    [3, 'Groundwork', 'You gain additional moxie features.\n\n**Compression Lock.** When a creature succeeds at breaking a grapple with you, use your reaction and spend 1 moxie point to force a reroll; it must use the second result.\n\n**Quick Pin.** When a hostile creature’s movement provokes an opportunity attack from you, use your reaction and spend 1 moxie point to make a grapple attack instead.\n\n**To the Mat.** Bonus action, 1 moxie point: make a grapple attack against a creature in range; on a success it is also knocked prone.'],
    [6, 'Meat Shield', 'While you have an enemy grappled you gain half cover against attacks from creatures you are not grappling. When such an attack misses you, you may use your reaction and spend 1 moxie point to have that creature reroll the same attack against a creature you are grappling.'],
    [11, 'Heavyweight', 'You count as one size larger for grappling, and can move your full speed while dragging or carrying a grappled creature your size or smaller.'],
    [17, 'Clean Finish', 'While you have a creature grappled you have advantage on all attacks against it, and score a critical hit on a 19 or 20 with unarmed strikes and pugilist weapons against it.'],
  ]),
  sc('sweet-science', 'The Sweet Science', 'Pugilists who hit hard, fast and often — duelling for the entertainment of the upper classes, or for their next breath in a back alley.', [
    [3, 'Cross Counter', 'Reaction, 2 moxie points: reduce the damage of a melee weapon attack against you by 1d10 + your Strength modifier + your pugilist level. If you reduce it to 0, you can make an unarmed strike or pugilist weapon attack against a creature in range as part of the same reaction.'],
    [6, 'One, Two, Three, Floor', 'When you use The Old One-Two and hit the same creature with both attacks, spend 1 moxie point to make an additional unarmed strike against it as part of the same bonus action; on a hit the creature is knocked prone in addition to taking damage.'],
    [11, 'Float Like a Butterfly, Sting Like a Bee', 'When you reduce damage to 0 and then hit with Cross Counter, you regain 1 moxie point (to your maximum).'],
    [17, 'Knock Out', "When you hit with an unarmed strike or pugilist weapon, you can spend 1 or more moxie points to try to knock the opponent out instead of dealing damage. Roll 3d12, plus 2d12 for every moxie point after the first, and add your pugilist level; if the total is equal to or greater than the creature's remaining hit points, it falls unconscious for 10 minutes."],
  ]),
];

// ── 2024 SUBCLASSES THE EXISTING LINE-UP IS MISSING ─────────────────────────────────────────────
//
// `dnd5e-2024/pugilist.ts` already defines the 2024 CLASS (27 features) and ONE subclass, Sweet Science.
// The published 2024 line-up has SIX. The five below fill it in: four carried over from 2014 unchanged in
// name and function, plus Street Saint, which is new to the revision.
//
// The 2024 class itself is deliberately NOT redefined here. Discovering it already existed is exactly the
// kind of duplicate this repo has been bitten by before — two definitions of one class would disagree the
// first time either was edited.
export const PUGILIST_2024_EXTRA_SUBCLASSES: SubclassDefinition[] = [
  ...['dog-and-hound', 'hand-of-dread', 'piss-and-vinegar', 'squared-circle'].map((k) => {
    const base = PUGILIST_2014_SUBCLASSES.find((s) => s.key === k)!;
    return { ...base, system: 'dnd5e-2024' };
  }),
  {
    key: 'street-saint',
    name: 'Street Saint',
    classKey: 'pugilist',
    system: 'dnd5e-2024',
    custom: AUTHOR,
    description:
      'Pugilists who rise above the filth of their upbringing to live a life of devotion, gifted with some '
      + 'measure of divine power. New in the 2024 revision.',
    features: [{
      level: 3,
      name: 'Street Saint',
      subclass: true,
      body:
        '🚧 **Under construction.** This subclass is named in the published 2024 line-up, and is known to '
        + 'grant a Channel Divinity that can add a d4 to each attack once per Short Rest — but its full '
        + 'feature text was not in the material supplied. Named here so it is selectable and visibly '
        + 'incomplete rather than silently missing; the features fill in when the text is to hand.',
    }],
  },
];
