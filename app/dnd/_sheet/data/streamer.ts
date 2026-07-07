// app/dnd/_sheet/data/streamer.ts — the streamer NPC's full sheet (§6.9).
// xxRainbowKittenUwU37xx (AKA Cleoar J.): an Isotron (code-based lifeform) Warlock 3
// with the bespoke "Streamer / Pact of the Patreon" subclass, whose patron is the
// chat. Transcribed from the player's provided sheet + spell/class/race doc. Built on
// the blank skeleton so it stays a valid Character; pure data (safe server-side).
import type { Character } from '../types';
import { blankCharacter } from './blank';

export function streamerCharacter(name: string): Character {
  const c = blankCharacter(name);

  c.meta = {
    name,
    kicker: 'LIVE // PATRON-BOUND STREAMER',
    role: '',
    species: 'Isotron',
    className: 'Warlock',
    subclass: 'Pact of the Patreon',
    level: 3,
    chips: [
      { text: 'Streamer', tone: 'pink' },
      { text: 'Pact of the Patreon', tone: 'teal' },
      { text: 'Isotron', tone: 'gold' },
      { text: 'Chaotic Good · Noble' },
    ],
  };

  // Ability scores from the sheet.
  c.abilities = { str: 9, dex: 9, con: 10, int: 11, wis: 12, cha: 14 };
  c.primaryAbilities = ['cha'];

  // Warlock saves: WIS + CHA.
  c.saves.wis = { proficient: true, misc: 0 };
  c.saves.cha = { proficient: true, misc: 0 };

  // Proficient skills (from the sheet).
  for (const k of ['animal', 'arcana', 'history', 'investigation', 'perception', 'performance', 'persuasion'] as const) {
    c.skills[k] = { prof: 'proficient', misc: 0 };
  }
  // Isotron "Digisoul": expertise in Computer checks (custom skill).
  c.customSkills = [{ id: 'computer', label: 'Computer', ability: 'int', prof: 'expertise', misc: 0 }];

  c.combat = {
    ...c.combat,
    ac: 11,
    acNote: 'Leather Armor',
    speed: 30,
    initiativeMisc: 0,
    maxHp: 20,
    currentHp: 20,
    hitDiceSize: 8,
    hitDiceTotal: 3,
    hitDiceRemaining: 3,
    // Sheet lists Spell Save DC 14 / Spell Attack +4.
    saveDCOverride: 14,
  };

  c.resources = [
    { id: 'pact', name: 'Pact Magic (Lv 2 slots)', max: 2, current: 2, color: 'pink', resetOn: 'short', note: 'Two 2nd-level slots; regained on a short or long rest' },
    { id: 'cunning', name: 'Magical Cunning', max: 1, current: 1, color: 'teal', resetOn: 'long', note: '1-min rite: regain up to half your Pact slots' },
    { id: 'techtalk', name: 'Speak with Technology', max: 2, current: 2, color: 'gold', resetOn: 'short', note: 'Isotron: talk to any computerized device for 10 min' },
  ];

  c.attacks = [
    { id: 'eblast', name: 'Eldritch Blast', ability: 'cha', proficient: true, range: '120 ft', damage: '1d10', damageType: 'force', notes: 'Ranged spell attack. Agonizing Blast adds CHA to damage. Repelling Blast pushes 10 ft on a hit.' },
    { id: 'vmockery', name: 'Vicious Mockery', ability: 'cha', proficient: true, range: '60 ft', damage: '1d6', damageType: 'psychic', saveBased: true, saveAbility: 'wis', notes: 'Cantrip. On a failed WIS save (DC 14): disadvantage on its next attack.' },
    { id: 'hex', name: 'Hex (rider)', ability: 'cha', proficient: true, range: '90 ft', damage: '1d6', damageType: 'necrotic', notes: 'Bonus action to curse a target; +1d6 necrotic whenever you hit it. Concentration.' },
    { id: 'sickle', name: 'Sickle', ability: 'str', proficient: true, range: 'Melee 5 ft', damage: '1d4', damageType: 'slashing', notes: 'Simple weapon.' },
    { id: 'dagger', name: 'Dagger', ability: 'dex', proficient: true, range: 'Melee / Thrown 20/60', damage: '1d4', damageType: 'piercing', notes: 'Finesse, light, thrown. ×2 carried.' },
  ];

  c.features = [
    {
      id: 'pactmagic', name: 'Pact Magic', level: '1', source: 'Class', tone: 'gold',
      body: [
        'You cast Warlock spells using **Charisma** (Spell Save DC 14, Spell Attack +4). You have **2 spell slots**, both **2nd level**, regained on a short or long rest.',
        '*Cantrips:* Eldritch Blast, Vicious Mockery, Minor Illusion, Mage Hand, Message.',
        '*Prepared:* Disguise Self, Expeditious Retreat, Illusory Script, Hex, Suggestion.',
      ],
    },
    {
      id: 'invocations', name: 'Eldritch Invocations', level: '1–2', source: 'Class', tone: 'teal',
      body: [
        '**Agonizing Blast** — add your Charisma modifier to *Eldritch Blast* damage.',
        '**Repelling Blast** — push a creature up to 10 ft on an *Eldritch Blast* hit.',
        '**Mask of Many Faces** — cast *Disguise Self* at will without a spell slot.',
      ],
    },
    {
      id: 'cunning', name: 'Magical Cunning', level: '2', source: 'Class',
      body: ['Spend 1 minute on an esoteric rite to regain expended Pact Magic slots (up to half your maximum, rounded up). Once per long rest.'],
    },
    {
      id: 'patreon', name: 'Pact of the Patreon — Streamer Subclass', level: '3', source: 'Signature', tone: 'pink',
      body: [
        '**Camera Focus** — after you hit a target with *Eldritch Blast* or a leveled damage spell, it makes a Charisma save vs your spell DC or becomes **On Camera**: −1d4 to Charisma/Wisdom saves you cause, and it can’t turn invisible. Only one creature is On Camera at a time.',
        '**Ask Chat** — cast a chaotic version of *Identify*; make a Wisdom save against the chat to learn whether the info is actually true.',
        '*Expanded spells:* Vicious Mockery, Minor Illusion; (Lv 5) Suggestion, Enthrall.',
      ],
    },
    {
      id: 'isotron', name: 'Isotron — Code-Based Lifeform', source: 'Species', tone: 'gold',
      body: [
        '**Code-Based Life Form** — immune to physical **poison** damage, but **vulnerable to lightning**.',
        '**Digisoul** — proficiency (expertise) in all **Computer** checks.',
        '**Hypergrid Attunement** — you always have *Message* prepared, and can **Speak with Technology** twice per short/long rest (communicate with any computerized device for 10 minutes).',
      ],
    },
    {
      id: 'noble', name: 'Streamer (Noble Background)', source: 'Background',
      body: ['You broadcast to a devoted audience across the planes. Proficiencies: **History**, **Persuasion**, **Dice**, and **any Computer activity**. Gear: fine clothes, a signature perfume, and 44 gp of donations.'],
    },
  ];

  c.inventory = [
    { id: 'leather', name: 'Leather Armor', desc: 'Light armor — AC 11 + DEX.', qty: 1, tags: ['equipped'] },
    { id: 'sickle', name: 'Sickle', desc: 'Simple melee weapon, 1d4 slashing.', qty: 1, tags: ['weapon'] },
    { id: 'dagger', name: 'Dagger', desc: 'Finesse, light, thrown (20/60). 1d4 piercing.', qty: 2, tags: ['weapon'] },
    { id: 'orb', name: 'Arcane Focus (Orb)', desc: 'Spellcasting focus for your Warlock spells.', qty: 1, tags: ['equipped', 'tech'] },
    { id: 'book', name: 'Book of Occult Lore', desc: 'Notes on the pact and the Feed.', qty: 1, tags: ['flavor'] },
    { id: 'pack', name: "Scholar's Pack", desc: 'Backpack, books, ink, parchment, a little bell.', qty: 1, tags: ['flavor'] },
    { id: 'clothes', name: 'Fine Clothes', desc: 'On-brand streamer fit.', qty: 1, tags: ['flavor'] },
    { id: 'perfume', name: 'Perfume', desc: 'Signature scent.', qty: 1, tags: ['flavor'] },
  ];

  c.currency = { credits: 44, harmonyte: 0, scrip: 0 };

  c.bio = {
    intro: [
      '**xxRainbowKittenUwU37xx** (AKA *Cleoar J.*) — an **Isotron** code-based lifeform who streams from inside the Feed. Her patron is literally **the chat**.',
      'Bubblegum pixels, cat-ear headset, chaotic-good energy at all hours. The more hyped the audience, the harder it is to resist what they demand.',
    ],
    appearance: [
      'A translucent, faintly-pixelated cat-girl rendered in bubblegum light — cat-ear headset, an oversized hoodie that flickers with subscriber emotes, and a soft CRT scanline haze around the edges of her.',
      'Her irises are tiny loading-spinners when she is thinking; little hearts and *UwU*s bloom in the air above her whenever the chat spikes. Flip her **Style** to blue and the whole rig recolors to electric cyan.',
    ],
    personality: [
      'Relentlessly upbeat on-stream, genuinely kind off it. Lives for the bit. Would do almost anything for the audience — which is the problem, because the audience is her god.',
      'Chaotic good: she *wants* to do the right thing, but a hyped-enough chat can talk her into just about anything (see the influence meter + the resist save).',
    ],
    background:
      'Streamer (Noble). She was a stray process loose in the Feed until a handful of viewers started watching — and paying. Every donation made her a little more real, until she bootstrapped herself into a person with a face, a name, and a following across the planes. The chat granted her power through the Pact of the Patreon; the chat expects a show. Proficiencies: History, Persuasion, Dice, and any Computer activity.',
    playTips: [
      'Open with **Hex** (bonus action) then **Eldritch Blast** — Agonizing Blast adds CHA to each beam, Repelling Blast shoves 10 ft. Poke, curse, and control from 120 ft.',
      '**Camera Focus** one priority target after a blast, then lean on **Vicious Mockery** and **Suggestion** to steer the fight.',
      '**Mask of Many Faces** (at-will *Disguise Self*) is your whole social/utility kit — infiltrate, grift, or slip away.',
      'Mind the **influence meter**: the more hyped chat is, the higher the DC to resist their demands. Spend Pact slots freely — **Magical Cunning** buys one refill per day.',
    ],
  };

  c.balance = {
    synergies: [
      'Agonizing + Repelling Blast turns a single cantrip into reliable ranged damage *and* battlefield control.',
      'Hex stacks +1d6 on every Eldritch Blast beam and slaps disadvantage on an ability of your choice.',
      'Digisoul expertise + Speak with Technology makes her the party face for anything computerized.',
      'Mask of Many Faces = infinite disguises for social play and infiltration.',
    ],
    weaknesses: [
      'Fragile: AC 11, 20 HP, STR & DEX 9 — she folds in melee.',
      'Vulnerable to **lightning** (code-based lifeform).',
      'Only **2 Pact slots**; once they are gone she leans on cantrips (Magical Cunning refills once per long rest).',
      'Concentration-dependent (Hex / Suggestion) on a low-HP body — one solid hit can drop the curse.',
    ],
  };

  // Warlock progression (relabelled columns via progressionMeta so it isn't barbarian).
  c.progressionMeta = { title: 'Progression · Warlock 1–3', lead: 'Her Pact-of-the-Patreon Warlock progression. The highlighted row is her current level.', col3: 'Cantrips', col4: 'Slots' };
  c.progression = [
    { level: 1, prof: '+2', rages: '4', rageDmg: '1 · Lv1', features: 'Pact Magic, Eldritch Invocations (Agonizing + Repelling Blast), Isotron traits' },
    { level: 2, prof: '+2', rages: '4', rageDmg: '2 · Lv1', features: 'Magical Cunning, 3rd invocation (Mask of Many Faces)' },
    { level: 3, prof: '+2', rages: '5', rageDmg: '2 · Lv2', features: 'Pact of the Patreon subclass — Camera Focus, Ask Chat', here: true },
  ];

  // Default to the pink colorway; the Style switch flips to blue.
  c.skinVariant = 'pink';

  c.dmNote = 'live now — her patron is the chat. Use the STREAM // Chat panel to run viewers, engagement, alerts, and the AI chat director; the influence meter sets the DC she must beat to resist chat’s demands.';
  return c;
}
