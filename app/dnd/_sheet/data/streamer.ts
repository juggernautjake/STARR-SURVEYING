// app/dnd/_sheet/data/streamer.ts — a real, fully-statted streamer character
// (§6.9). Used to seed xxRainbowKittenUwU37xx: a peppy, bright-pink magical-girl
// broadcaster whose patron is literally the chat. Built on the blank skeleton so it
// stays a valid Character; pure data, safe to import server-side (seeds).
import type { Character } from '../types';
import { blankCharacter } from './blank';

export function streamerCharacter(name: string): Character {
  const c = blankCharacter(name);

  c.meta = {
    name,
    kicker: 'LIVE // PATRON-BOUND STREAMER',
    role: '',
    species: 'Fae-Touched Tiefling',
    className: 'Bard',
    subclass: 'College of Glamour',
    level: 5,
    chips: [
      { text: 'Streamer', tone: 'pink' },
      { text: 'Chaos Gremlin', tone: 'teal' },
      { text: 'Patron: The Chat', tone: 'gold' },
      { text: 'uwu' },
    ],
  };

  // CHA-forward performer with a nimble streamer's reflexes.
  c.abilities = { str: 8, dex: 15, con: 14, int: 10, wis: 12, cha: 18 };
  c.primaryAbilities = ['cha'];

  // Bard save proficiencies: DEX + CHA.
  c.saves.dex = { proficient: true, misc: 0 };
  c.saves.cha = { proficient: true, misc: 0 };

  // On-brand skills: doubled Performance/Persuasion (Expertise), plus the streamer kit.
  c.skills.performance = { prof: 'expertise', misc: 0 };
  c.skills.persuasion = { prof: 'expertise', misc: 0 };
  c.skills.deception = { prof: 'proficient', misc: 0 };
  c.skills.acrobatics = { prof: 'proficient', misc: 0 };
  c.skills.perception = { prof: 'proficient', misc: 0 };

  c.combat = {
    ...c.combat,
    ac: 15,
    acNote: 'Mage Armor (13 + DEX)',
    speed: 30,
    initiativeMisc: 0,
    maxHp: 38,
    currentHp: 38,
    hitDiceSize: 8,
    hitDiceTotal: 5,
    hitDiceRemaining: 5,
  };

  c.resources = [
    { id: 'bardic', name: 'Bardic Inspiration (d8)', max: 4, current: 4, color: 'pink', resetOn: 'short', note: 'Bonus action: hand a viewer a d8 to add to a roll' },
    { id: 'slot1', name: 'Spell Slots · 1st', max: 4, current: 4, color: 'teal', resetOn: 'long' },
    { id: 'slot2', name: 'Spell Slots · 2nd', max: 3, current: 3, color: 'teal', resetOn: 'long' },
    { id: 'slot3', name: 'Spell Slots · 3rd', max: 2, current: 2, color: 'gold', resetOn: 'long' },
  ];

  c.attacks = [
    { id: 'rapier', name: 'Rapier', ability: 'dex', proficient: true, range: 'Melee 5 ft', damage: '1d8', damageType: 'piercing', notes: 'Finesse — a very cute rapier' },
    { id: 'vicious', name: 'Vicious Mockery', ability: 'cha', proficient: true, range: '60 ft', damage: '2d4', damageType: 'psychic', saveBased: true, saveAbility: 'wis', notes: 'Cantrip. On a failed WIS save the target also has disadvantage on its next attack.' },
    { id: 'whispers', name: 'Dissonant Whispers', ability: 'cha', proficient: true, range: '60 ft', damage: '3d6', damageType: 'psychic', saveBased: true, saveAbility: 'wis', notes: '1st-level spell. On a failed WIS save the target must flee.' },
  ];

  c.features = [
    { id: 'inspo', name: 'Bardic Inspiration', level: '1', source: 'Class', tone: 'pink', body: ['Bonus action: give a creature a **d8** to add to one attack, check, or save within 10 minutes. Regained on a short or long rest (Font of Inspiration).'] },
    { id: 'mantle', name: 'Mantle of Inspiration', level: '3', source: 'College of Glamour', tone: 'gold', body: ['Spend a use of Bardic Inspiration to grant nearby allies **temporary HP** and let each immediately use its reaction to move without provoking — a hype-train getaway.'] },
    { id: 'enthrall', name: 'Enthralling Performance', level: '3', source: 'College of Glamour', tone: 'teal', body: ['After performing for 1 minute, charm up to *Charisma-mod* humanoids who fail a Wisdom save vs your spell DC. The ultimate audience capture.'] },
    { id: 'joat', name: 'Jack of All Trades', level: '2', source: 'Class', body: ['Add **half** your proficiency bonus to any ability check that doesn’t already include it.'] },
    { id: 'song', name: 'Song of Rest', level: '2', source: 'Class', body: ['Allies who spend Hit Dice at the end of a short rest each regain an extra **1d6** HP — the cozy between-stream break.'] },
    { id: 'font', name: 'Font of Inspiration', level: '5', source: 'Class', body: ['You regain **all** expended Bardic Inspiration on a short **or** long rest.'] },
  ];

  c.bio = {
    intro: [
      'xxRainbowKittenUwU37xx broadcasts to the Feywild-and-Beyond from a bedroom that is somehow *inside* your monitor — bubblegum hair, cat-ear headset, and chaotic-good energy at all hours.',
      'Her patron is literally **the chat**. The more hyped the viewers, the harder it is to resist what they demand: donations, dares, and the occasional cursed decision, all narrated with a peppy "slayyy 💖".',
    ],
    appearance: [],
    personality: [],
    background: '',
    playTips: [],
  };

  c.dmNote = 'live now';
  return c;
}
