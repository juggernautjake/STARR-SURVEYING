// app/dnd/_sheet/data/donata.ts — Donata Dime's full sheet (bespoke MLM cleric).
// A Dimetrodon Saurian (Tyrasaur lineage) Cleric 3 on the homebrew "Abundance Domain"
// whose deity is Mighty Mojo, founder-prophet of the MLM "Mighty Mojo's Mighty Magic
// Maguffins." Backline support; every class feature is a reskinned pyramid-scheme
// mechanic. She levels by climbing the company, not by fighting — and has been stuck at
// Level 3 for six years with unshakable faith. Built on the blank skeleton so it stays a
// valid Character; pure data (safe server-side). See docs/planning/completed/DND_DONATA_DIME.
import type { Character } from '../types';
import { blankCharacter } from './blank';

export function donataDime(name: string): Character {
  const c = blankCharacter(name);

  c.meta = {
    name,
    kicker: 'GROUND FLOOR // ABUNDANCE CLERIC 💎',
    role: 'Backline Support · #1 Earner (self-declared)',
    species: 'Saurian (Dimetrodon · Tyrasaur)',
    className: 'Cleric',
    subclass: 'Abundance Domain — the Mighty Mojo Method',
    level: 3,
    chips: [
      { text: 'Boss Babe of Krayta', tone: 'pink' },
      { text: 'Abundance Domain', tone: 'teal' },
      { text: 'Saurian · Tyrasaur', tone: 'gold' },
      { text: 'Lawful Delusional · Acolyte' },
      { text: 'Rank: Mojo Maker (Lvl 3, Yr 6)' },
    ],
  };

  // Ability scores from her uploaded sheet. (Her CHA is only 11 — the confidence is free.)
  c.abilities = { str: 14, dex: 14, con: 14, int: 10, wis: 16, cha: 11 };
  c.primaryAbilities = ['wis'];

  // Cleric saves: WIS + CHA.
  c.saves.wis = { proficient: true, misc: 0 };
  c.saves.cha = { proficient: true, misc: 0 };

  // The closer's toolkit (Persuasion, Deception, Insight, Religion, Medicine).
  for (const k of ['persuasion', 'deception', 'insight', 'religion', 'medicine'] as const) {
    c.skills[k] = { prof: 'proficient', misc: 0 };
  }

  c.combat = {
    ...c.combat,
    ac: 16,
    acNote: 'Breastplate (medium, +2 Dex)',
    speed: 30,
    speedNote: 'Darkvision 60 ft',
    initiativeMisc: 0,
    maxHp: 24,
    currentHp: 24,
    hitDiceSize: 8,
    hitDiceTotal: 3,
    hitDiceRemaining: 3,
    // Spell Save DC 13 / Spell Attack +5 (WIS).
    saveDCOverride: 13,
  };

  c.resources = [
    { id: 'slot1', name: '1st-Level Spell Slots', max: 4, current: 4, color: 'pink', resetOn: 'long', note: 'Cleric spellcasting (WIS · DC 13 · Atk +5)' },
    { id: 'slot2', name: '2nd-Level Spell Slots', max: 2, current: 2, color: 'teal', resetOn: 'long', note: 'Cleric spellcasting' },
    { id: 'channel', name: 'Channel Downline (Channel Divinity)', max: 2, current: 2, color: 'gold', resetOn: 'short', note: 'Recruitment Pitch · Manifest a Maguffin · Divine Spark' },
    { id: 'starterkit', name: 'Starter Kit (free Sanctuary 1/day)', max: 1, current: 1, color: 'gold', resetOn: 'long', note: 'Magic Initiate origin feat — “VIP Protection”' },
  ];

  c.attacks = [
    { id: 'guidingbolt', name: 'Guiding Bolt — “Spotlight ✨”', ability: 'wis', proficient: true, range: '120 ft', damage: '4d6', damageType: 'radiant', notes: 'Ranged spell attack (+5). On a hit, the next attacker vs the target has advantage. 1st-level slot.' },
    { id: 'sacredflame', name: 'Sacred Flame — “Karmic Refund”', ability: 'wis', proficient: true, range: '60 ft', damage: '1d8', damageType: 'radiant', saveBased: true, saveAbility: 'dex', notes: 'Cantrip. DEX save (DC 13) or take radiant. Ignores cover. For haters and chargeback-havers.' },
    { id: 'tollthedead', name: 'Toll the Dead — “One-Star Review”', ability: 'wis', proficient: true, range: '60 ft', damage: '1d8', damageType: 'necrotic', saveBased: true, saveAbility: 'wis', notes: 'Cantrip. WIS save (DC 13); 1d12 instead of 1d8 if the target is already wounded.' },
    { id: 'shortbow', name: 'Shortbow', ability: 'dex', proficient: true, range: '80/320', damage: '1d6', damageType: 'piercing', notes: 'Her backline weapon of choice — leadership means never being in melee.' },
    { id: 'claw', name: 'Claw Strike (Tyrasaur)', ability: 'str', proficient: true, range: 'Melee 5 ft', damage: '1d6', damageType: 'slashing', notes: 'Saurian natural weapon. Rarely used — she prefers to let the downline get their claws dirty.' },
    { id: 'dagger', name: 'Dagger', ability: 'dex', proficient: true, range: 'Melee / Thrown 20/60', damage: '1d4', damageType: 'piercing', notes: 'Finesse, light, thrown. Also opens Maguffin crates.' },
  ];

  c.features = [
    {
      id: 'spellcasting', name: 'Spellcasting (Cleric)', level: '1', source: 'Class', tone: 'gold',
      body: [
        'You cast Cleric spells using **Wisdom** (Spell Save **DC 13**, Spell Attack **+5**). Slots: **4× 1st**, **2× 2nd**. You prepare **6** spells (WIS mod + level); your Domain spells are always prepared for free.',
        '*Cantrips:* Guidance (“Affirmation”), Sacred Flame (“Karmic Refund”), Toll the Dead (“One-Star Review”), Thaumaturgy (“Razzle-Dazzle”).',
        '*Prepared:* Bless (“Blessed & Highly Favored”), Healing Word (“Wellness Shot”), Guiding Bolt (“Spotlight”), Command (“Just Say Yes”), Aid (“Team Support”), Prayer of Healing (“Self-Care Sunday”). *Swap option:* Hold Person (“Analysis Paralysis”).',
      ],
    },
    {
      id: 'divineorder', name: 'Divine Order — Thaumaturge', level: '1', source: 'Class', tone: 'teal',
      body: [
        'You chose the caster path: **one extra cantrip**, and you add your **Wisdom modifier (+3)** to Intelligence (**Arcana**) and (**Religion**) checks.',
        'In practice: she can explain the “science” of any Maguffin, at length, to anyone who makes the mistake of standing still.',
      ],
    },
    {
      id: 'channeldownline', name: 'Channel Divinity — “Channel Downline”', level: '2', source: 'Class', tone: 'pink',
      body: [
        'Her divine power runs on recruits. **2 uses**, regained on a **short or long rest**. Beyond Divine Spark she has two options:',
        '**Recruitment Pitch** *(Magic action)* — each creature of your choice within **30 ft** makes a **WIS save (DC 13)** or is **Charmed** for 1 minute and treats you as a beloved sponsor: it has disadvantage on attacks against you and your recruits. It repeats the save at the end of each of its turns and whenever it takes damage.',
        '**Manifest a Maguffin** *(Bonus action)* — conjure a dazzling Magic Maguffin for an ally within 30 ft: they gain **Temp HP = 1d8 + 3**. ✨ It **expires at the end of your next turn** whether used or not. The product does not actually work.',
      ],
      use: { label: 'Manifest a Maguffin (Temp HP)', resourceId: 'channel', roll: '1d8+3', rollKind: 'temp' },
    },
    {
      id: 'abundance', name: 'Abundance Domain — Sponsorship', level: '3', source: 'Signature', tone: 'pink',
      body: [
        '**Domain Spells** (always prepared): *Charm Person* (“Hey Hun 💎”), *Heroism* (“You’re a Boss Babe!”), *Suggestion* (“It basically sells itself”), *Enthrall* (“The Zoom Party”).',
        '**Sponsorship** — designate allies as your **downline**. Once per turn, when a downline ally within **30 ft** makes an attack roll, ability check, or save, you can add **1d4** to it (branded Bless). When they **succeed**, you skim a **commission**: gain 2 temporary HP, *or* move 5 ft without provoking opportunity attacks.',
        'The more your team grinds, the stronger you get. Pyramid economics, as a class feature.',
      ],
      use: { label: 'Sponsor an ally (+1d4)', roll: '1d4', rollKind: 'raw' },
    },
    {
      id: 'saurian', name: 'Saurian — Tyrasaur Lineage', source: 'Species', tone: 'gold',
      body: [
        '**Claw Strikes** — your unarmed strikes are claws dealing **1d6 slashing** (your lineage’s natural weapon).',
        '**Predatory Instinct** — you have **advantage** on checks to perceive or investigate **creatures**. She clocks your income bracket, your insecurities, and whether you’d look *amazing* in Harmony Wraps.',
        '**Dimetrodon Sail** — your iridescent, Harmonyte-lit sail flares when you’re closing. Cosmetic, but it photographs *gorgeously*. Speed 30 · Medium · **Darkvision 60 ft** · omnivore.',
        '**Child of the Harmony** — a dinosaur-folk of the crystal-jungle capital world **Krayta**, heir of the galaxy’s oldest power, the **Saurok Dynasty**. Saurians channel **the Harmony**, the source of all life energy — which the company insists is *actually* proprietary **Mojo™**.',
      ],
    },
    {
      id: 'starterkit', name: 'Magic Initiate (Cleric) — “Starter Kit Training”', level: '1', source: 'Feat (Acolyte)', tone: 'teal',
      body: [
        'Your Acolyte origin feat: **2 bonus cantrips** — *Light* (“Spotlight”) and *Mending* (“Fix the Returns”) — and one free **1st-level** spell, **Sanctuary** (“VIP Protection”), castable **1×/long rest** without a slot (or with a slot thereafter).',
        'Naturally, she wards **herself** first.',
      ],
      use: { label: 'Cast Sanctuary', resourceId: 'starterkit', note: 'WIS save DC 13 or the attacker must choose a new target' },
    },
    {
      id: 'ranklevel', name: 'Rank = Level (leveling mechanic)', source: 'Table Rule', tone: 'gold',
      body: [
        'Donata gains **no XP from combat**. She levels **only by climbing the company**: meet a rank’s objectives (recruits signed, personal & team volume, staying “Active”) → **Andrew (DM) approves the promotion** → she levels up and gains that level’s cleric features.',
        'She has been **Level 3 (“Mojo Maker”) for six years.** Net earnings: −18,400 gp. Recruits retained: 0. Faith: **100%.** Her business cards say “Grand Maguffin Matriarch.” The company records say “Mojo Maker.” She has never noticed the gap. Bless her heart.',
      ],
    },
    {
      id: 'acolyte', name: 'Acolyte — MLM Founder (Background)', source: 'Background',
      body: ['Devout disciple of **Mighty Mojo**, founder-prophet of **Mighty Mojo’s Mighty Magic Maguffins**. Proficiencies: **Insight**, **Religion** (i.e. the comp plan, which she knows like scripture). Gear: a gilded M⁵ holy pendant, a scrying-crystal for 11pm “Hey girl, long time!” sendings, and saddlebags of unsold Mojo Dust.'],
    },
  ];

  c.inventory = [
    { id: 'breastplate', name: 'Breastplate', desc: 'Medium armor — AC 14 + Dex (max 2) = AC 16.', qty: 1, tags: ['equipped'] },
    { id: 'shortbow', name: 'Shortbow', desc: 'Ranged, 1d6 piercing (80/320). The backline queen’s tool.', qty: 1, tags: ['weapon', 'equipped'] },
    { id: 'dagger', name: 'Dagger', desc: 'Finesse, light, thrown (20/60). 1d4 piercing.', qty: 1, tags: ['weapon'] },
    { id: 'shortsword', name: 'Shortsword', desc: 'Martial, 1d6 piercing. For emergencies.', qty: 1, tags: ['weapon'] },
    { id: 'symbol', name: 'M⁵ Holy Pendant', desc: 'Gilded “Mighty Mojo’s Mighty Magic Maguffins” pendant — her spellcasting focus. Catches the light just so.', qty: 1, tags: ['equipped', 'tech'] },
    { id: 'crystal', name: 'Scrying-Crystal (“phone”)', desc: 'For sendings, promo reels, and the group chat she runs.', qty: 1, tags: ['tech'] },
    { id: 'mojodust', name: 'Mojo Dust™ (inventory)', desc: '“Activated” Harmonyte glitter. Non-refundable. Weightless on the spirit, crushing on the saddle.', qty: 4000, tags: ['consumable', 'flavor'] },
    { id: 'catalog', name: 'The Product Catalog', desc: 'Spark Serum™, Harmony Wraps™, Mojo Shake™, Lucky Luminites™ — “it basically sells itself.”', qty: 1, tags: ['flavor'] },
    { id: 'ledger', name: 'Founder’s Ledger', desc: 'Meticulous. Deeply, tragically in the red (−18,400 gp).', qty: 1, tags: ['flavor'] },
  ];

  // She's broke. "notes" (credits) near zero; the ledger tells the real story.
  c.currency = { credits: 7, harmonyte: 0, scrip: 0 };

  c.bio = {
    intro: [
      '**Donata Dime** — a **Dimetrodon Saurian** (Tyrasaur) Cleric whose god is a pyramid scheme. Six years in the “business,” zero gold of profit, and radiantly, invincibly certain that *next quarter is her quarter.*',
      'She doesn’t heal you, hun. She *invests* in you. Ground floor, baby. 💎',
    ],
    appearance: [
      'Purple-and-magenta scales, a friendly toothy grin, AR goggles pushed up on her brow, and an iridescent Dimetrodon sail laced with lavender-tangerine **Harmonyte** that flares whenever she’s closing a sale.',
      'Backpack of samples, belt of scroll-tubes, a branded travel mug, and a scrying-crystal always half-raised for the promo reel. Every outfit is “on-brand.”',
    ],
    personality: [
      'Radiantly, relentlessly, **invincibly** upbeat. Every hello is a lead; every setback is “a lesson”; every rock bottom is “a launchpad.” She love-bombs strangers and means every word.',
      'Genuinely kind, genuinely generous, genuinely convinced the scam is a calling. The tragedy is that she’d be a wonderful person if someone hadn’t sold her a Founder’s Bundle.',
    ],
    background:
      'Acolyte of Mighty Mojo. She answered a mass “sending” from the founder-prophet six years ago (“I’m looking for 5 driven queens!”), bought the 999 gp Founder’s Bundle, and never looked back — or up, at the org chart. She has recruited many Maguffins and retained none. She is stuck at rank “Mojo Maker,” but her faith has never wavered. Proficiencies: Insight, Religion, Persuasion, Deception, Medicine.',
    playTips: [
      'Play **backline**: Bless the party, Healing Word from range (“Wellness Shot”), Guiding Bolt for “Spotlight” damage, Sanctuary on yourself. Let the team do the fighting — you’re *management*.',
      'Open a hard fight with **Recruitment Pitch** (Channel Divinity) to Charm the front line, then lean on **Sponsorship**: add 1d4 to a downline ally and skim your commission when they land the hit.',
      '**Manifest a Maguffin** is flashy temp HP that lapses in a round — use it right before an ally expects to get hit, not as a heal.',
      '**Predatory Instinct** (advantage to read creatures) makes her the party’s people-reader — spot the lie, the mark, the leverage. Her CHA is only 11, so lean on proficiency + the domain, not raw charm.',
      'Remember the leveling mechanic: **she levels by hitting company objectives**, adjudicated by the DM — recruits, volume, staying “Active.” Roleplay the grind.',
    ],
  };

  c.balance = {
    synergies: [
      'Sponsorship + any hard-hitting frontliner = a reliable +1d4 and a steady drip of commission temp HP / free repositioning.',
      'Recruitment Pitch (mass Charm) neutralizes a front line while the party focuses fire.',
      'Full cleric support kit — Bless, Aid, Healing Word, Prayer of Healing, Sanctuary — from a safe 30–120 ft.',
      'Predatory Instinct makes her the social/scouting lens: advantage to read any creature.',
    ],
    weaknesses: [
      'CHA 11 — her “charisma” is proficiency and delusion, not talent; contested social rolls can go badly.',
      'Manifest a Maguffin temp HP expires after one round — mistime it and it does nothing (on brand).',
      'Backline and squishy-ish for a cleric; if the front line breaks, she’s exposed.',
      'Concentration on Bless / Suggestion / Hold Person — one solid hit ends the buff.',
      'Will absolutely try to recruit the villain mid-combat.',
    ],
  };

  // Cleric progression, relabelled so column 3 shows her COMPANY RANK (= her level).
  c.progressionMeta = {
    title: 'Progression · Cleric 1–3 (Rank = Level)',
    lead: 'She levels by climbing the company, not by fighting. Column 3 is the rank that unlocks each level. The highlighted row is where she has sat for six years.',
    col3: 'Company Rank',
    col4: 'Slots',
  };
  c.progression = [
    { level: 1, prof: '+2', col3: 'Prospect → Sparkler', col4: '2 · Lv1', features: 'Spellcasting, Divine Order (Thaumaturge), Saurian traits, Magic Initiate' },
    { level: 2, prof: '+2', col3: 'Sparkler', col4: '3 · Lv1', features: 'Channel Divinity — Channel Downline (2 uses)' },
    { level: 3, prof: '+2', col3: 'Mojo Maker (Yr 6)', col4: '4·L1 / 2·L2', features: 'Abundance Domain — Sponsorship, domain spells', here: true },
  ];

  c.dmNote = 'Backline MLM cleric; her deity is the pyramid-scheme founder Mighty Mojo. She levels by hitting company objectives (recruits / volume), which YOU adjudicate as promotions — she has been stuck at Lvl 3 for six years. The MY DOWNLINE / RANK = LEVEL panels track it. Both Sarah (owner) and you (DM) can edit this sheet.';
  // ── Spellcasting (Cleric · WIS · Spell save DC 13 · Spell attack +5) ──
  c.spellcasting = { ability: 'wis', preparedCap: 6, slots: { 1: { max: 4, current: 4 }, 2: { max: 2, current: 2 } } };
  c.spells = [
    // Cantrips
    { id: 'guidance', name: 'Guidance', alias: 'Affirmation', level: 0, school: 'Divination', prepared: true, castTime: '1 action', range: 'Touch', components: 'V, S', duration: 'Conc, 1 min', concentration: true, description: 'Touch a willing creature; once before the spell ends it adds **1d4** to one ability check.' },
    { id: 'sacred-flame', name: 'Sacred Flame', alias: 'Karmic Refund', level: 0, school: 'Evocation', prepared: true, castTime: '1 action', range: '60 ft', components: 'V, S', duration: 'Instant', description: 'Radiant flame descends on a creature. Ignores cover.', save: { ability: 'dex', effect: 'no damage on a save' }, damage: [{ dice: '1d8', type: 'radiant' }], higher: '2d8 at Lv5, 3d8 at Lv11, 4d8 at Lv17.' },
    { id: 'toll-the-dead', name: 'Toll the Dead', alias: 'One-Star Review', level: 0, school: 'Necromancy', prepared: true, castTime: '1 action', range: '60 ft', components: 'V, S', duration: 'Instant', description: 'A dolorous bell tolls. Deals **1d12** instead of 1d8 if the target is already wounded.', save: { ability: 'wis', effect: 'no damage on a save' }, damage: [{ dice: '1d8', type: 'necrotic' }], higher: 'Die scales at Lv5/11/17.' },
    { id: 'thaumaturgy', name: 'Thaumaturgy', alias: 'Razzle-Dazzle', level: 0, school: 'Transmutation', prepared: true, castTime: '1 action', range: '30 ft', components: 'V', duration: 'Up to 1 min', description: 'A minor wonder: booming voice, flickering lights, tremors — for closing the sale.' },
    { id: 'light', name: 'Light', alias: 'Spotlight', level: 0, school: 'Evocation', prepared: true, castTime: '1 action', range: 'Touch', components: 'V, M', duration: '1 hour', description: 'An object sheds bright light in a 20-ft radius (Magic Initiate).' },
    { id: 'mending', name: 'Mending', alias: 'Fix the Returns', level: 0, school: 'Transmutation', prepared: true, castTime: '1 min', range: 'Touch', components: 'V, S, M', duration: 'Instant', description: 'Repairs a single break or tear in an object (Magic Initiate).' },
    // 1st level
    { id: 'bless', name: 'Bless', alias: 'Blessed & Highly Favored', level: 1, school: 'Enchantment', prepared: true, castTime: '1 action', range: '30 ft', components: 'V, S, M', duration: 'Conc, 1 min', concentration: true, description: 'Up to three creatures add **1d4** to attack rolls and saving throws.' },
    { id: 'healing-word', name: 'Healing Word', alias: 'Wellness Shot', level: 1, school: 'Abjuration', prepared: true, castTime: '1 bonus action', range: '60 ft', components: 'V', duration: 'Instant', description: 'A word of comfort heals a creature you can see.', heal: '1d4', higher: '+1d4 per slot level above 1st.' },
    { id: 'guiding-bolt', name: 'Guiding Bolt', alias: 'Spotlight', level: 1, school: 'Evocation', prepared: true, castTime: '1 action', range: '120 ft', components: 'V, S', duration: '1 round', description: 'A flash of light streaks toward a creature; the next attack against it has advantage.', attack: true, damage: [{ dice: '4d6', type: 'radiant' }], higher: '+1d6 per slot level above 1st.' },
    { id: 'command', name: 'Command', alias: 'Just Say Yes', level: 1, school: 'Enchantment', prepared: true, castTime: '1 action', range: '60 ft', components: 'V', duration: '1 round', description: 'Speak a one-word command a creature must obey.', save: { ability: 'wis', effect: 'unaffected on a save' } },
    { id: 'charm-person', name: 'Charm Person', alias: 'Hey Hun 💎', level: 1, school: 'Enchantment', alwaysPrepared: true, castTime: '1 action', range: '30 ft', components: 'V, S', duration: '1 hour', description: 'Domain spell. Charms a humanoid, who regards you as a friendly acquaintance.', save: { ability: 'wis', effect: 'unaffected on a save' } },
    { id: 'heroism', name: 'Heroism', alias: "You're a Boss Babe!", level: 1, school: 'Enchantment', alwaysPrepared: true, castTime: '1 action', range: 'Touch', components: 'V, S', duration: 'Conc, 1 min', concentration: true, description: 'Domain spell. A creature is immune to Frightened and gains temp HP = your WIS mod each turn.' },
    { id: 'sanctuary', name: 'Sanctuary', alias: 'VIP Protection', level: 1, school: 'Abjuration', alwaysPrepared: true, castTime: '1 bonus action', range: '30 ft', components: 'V, S, M', duration: '1 min', description: 'Feat (Magic Initiate). Attackers must make a WIS save or choose a new target. Free 1×/long rest.', save: { ability: 'wis', effect: 'may attack the warded creature on a save' } },
    // 2nd level
    { id: 'aid', name: 'Aid', alias: 'Team Support', level: 2, school: 'Abjuration', prepared: true, castTime: '1 action', range: '30 ft', components: 'V, S, M', duration: '8 hours', description: 'Up to three creatures gain **+5 max & current HP** for the duration.', higher: '+5 HP per slot level above 2nd.' },
    { id: 'prayer-of-healing', name: 'Prayer of Healing', alias: 'Self-Care Sunday', level: 2, school: 'Abjuration', prepared: true, castTime: '10 min', range: '30 ft', components: 'V', duration: 'Instant', description: 'Up to six creatures regain hit points.', heal: '2d8', higher: '+1d8 per slot level above 2nd.' },
    { id: 'suggestion', name: 'Suggestion', alias: 'It basically sells itself', level: 2, school: 'Enchantment', alwaysPrepared: true, castTime: '1 action', range: '30 ft', components: 'V, M', duration: 'Conc, 8 hours', concentration: true, description: 'Domain spell. Suggest a reasonable course of activity a creature pursues.', save: { ability: 'wis', effect: 'unaffected on a save' } },
    { id: 'enthrall', name: 'Enthrall', alias: 'The Zoom Party', level: 2, school: 'Enchantment', alwaysPrepared: true, castTime: '1 action', range: '60 ft', components: 'V, S', duration: '1 min', description: 'Domain spell. Creatures have disadvantage on Perception checks to notice anything but you.', save: { ability: 'wis', effect: 'unaffected on a save' } },
    { id: 'hold-person', name: 'Hold Person', alias: 'Analysis Paralysis', level: 2, school: 'Enchantment', prepared: false, castTime: '1 action', range: '60 ft', components: 'V, S, M', duration: 'Conc, 1 min', concentration: true, description: 'Swap option. Paralyzes a humanoid; it repeats the save each turn.', save: { ability: 'wis', effect: 'unaffected on a save' } },
  ];

  return c;
}
