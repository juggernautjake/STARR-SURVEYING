// lib/dnd/glossary/dnd5e-shared.ts — the terms the 2014 and 2024 editions define IDENTICALLY.
//
// Kept in one place so the two editions can't drift apart by accident, but note what is NOT here:
// anything the editions changed (Exhaustion, Grappled, Prone, Surprise, Inspiration, feats,
// Unconscious) lives in the per-edition files, because getting those confused is exactly the
// mistake this library exists to prevent.
import type { GlossaryEntry, SystemGlossary } from './types';

// ── The 18 skills, built from one scaffold ───────────────────────────────────────────
//
// A scaffold rather than 18 hand-written bodies, because every skill article says the same three
// things — governing ability, what you roll it for, how proficiency and Expertise apply — and only
// the middle one differs. Eighteen independently-worded copies of the proficiency paragraph is
// eighteen chances for one of them to be subtly wrong, and no way to fix them all at once.
//
// SOURCE: SRD 5.1 (CC-BY-4.0) skill descriptions, paraphrased to mechanical facts. `uses` are the
// canonical examples the SRD itself gives; where the SRD offers no specific number, none is stated.
interface SkillArticle {
  name: string;
  /** The default governing ability. The DM can pair a skill with a different one — see `Ability Check`. */
  ability: 'Strength' | 'Dexterity' | 'Intelligence' | 'Wisdom' | 'Charisma';
  /** One line for the `short` — what the skill is FOR. */
  purpose: string;
  /** The canonical uses, rendered as bullets. */
  uses: string[];
  /** A rule specific to this skill that players get wrong, where there is one. */
  note?: string;
  aliases?: string[];
}

const SKILL_ARTICLES: SkillArticle[] = [
  { name: 'Athletics', ability: 'Strength', purpose: 'climbing, jumping, swimming, and the physical contests of grappling and shoving',
    uses: ['Climb a sheer or slippery surface, or one with few handholds', 'Jump an unusually long distance, or pull off a stunt mid-jump', 'Swim in treacherous water, or against a strong current'],
    // NOT stated here: how a grapple or shove resolves. That is the one part of Athletics the two
    // editions genuinely changed (2014 contests Athletics vs Athletics/Acrobatics; 2024 makes it an
    // Unarmed Strike the target saves against), so putting either version in the SHARED file would
    // hand one edition the other's rule — the exact bleed CX-16 spent a session removing. Each
    // edition's own `Grappled` article carries its own procedure.
    note: 'Athletics is also the skill behind **grappling** and **shoving** — but *how* those resolve is one of the few things the 2014 and 2024 books genuinely changed. Read your edition’s **Grappled** article for the actual procedure rather than assuming it matches the other one.' },
  { name: 'Acrobatics', ability: 'Dexterity', purpose: 'staying on your feet and moving your body precisely in difficult circumstances',
    // Deliberately no "escape a grapple" bullet: that is Acrobatics in 2014 and a Dexterity SAVE in
    // 2024, so it cannot be stated once for both editions. See the note on Athletics.
    uses: ['Keep your balance on ice, a tightrope, or a heaving deck', 'Dive, roll, somersault, or flip out of a dangerous position', 'Stay upright when the ground or the ship beneath you moves'] },
  { name: 'Sleight of Hand', ability: 'Dexterity', purpose: 'manual trickery — planting, lifting, palming and concealing',
    uses: ['Plant something on someone, or take something off them', 'Conceal an object on your person', 'Perform close-up legerdemain'],
    note: 'This is the skill for **pickpocketing**; picking a lock or disarming a trap is a Dexterity check with **thieves\' tools**, which is a tool proficiency rather than this skill.',
    aliases: ['pickpocket'] },
  { name: 'Stealth', ability: 'Dexterity', purpose: 'hiding and moving without being seen or heard',
    uses: ['Conceal yourself from enemies', 'Slip away unnoticed', 'Approach without being heard'],
    note: 'A Stealth check is normally opposed by an observer\'s **passive Perception**, and you generally cannot hide from a creature that can plainly see you. Attacking usually gives your position away.',
    aliases: ['hiding', 'sneak'] },
  { name: 'Arcana', ability: 'Intelligence', purpose: 'recalling what you know about magic itself',
    uses: ['Recall lore about spells, magic items, and eldritch symbols', 'Identify a magical tradition or the planes of existence', 'Recognise the work of a magical creature'] },
  { name: 'History', ability: 'Intelligence', purpose: 'recalling what you know about the past',
    uses: ['Recall lore about historical events and legendary people', 'Recall ancient kingdoms, past disputes, recent wars', 'Recognise a lost civilisation’s work'] },
  { name: 'Investigation', ability: 'Intelligence', purpose: 'reasoning from clues to a conclusion',
    uses: ['Deduce where a hidden object is likely to be concealed', 'Work out what kind of weapon made a wound', 'Find the weak point in a structure, or spot what is off about a forgery'],
    note: 'The line players argue about: **Perception notices, Investigation concludes.** You Perceive that a book is slightly out of line; you Investigate to work out that it opens a door.' },
  { name: 'Nature', ability: 'Intelligence', purpose: 'recalling what you know about the natural world',
    uses: ['Recall lore about terrain, plants, and animals', 'Recall the weather and the natural cycles of a region', 'Identify a natural hazard or a beast’s habits'] },
  { name: 'Religion', ability: 'Intelligence', purpose: 'recalling what you know about faiths and the divine',
    uses: ['Recall lore about deities, rites, and prayers', 'Recognise religious hierarchies and holy symbols', 'Identify the practices of a secret cult'] },
  { name: 'Animal Handling', ability: 'Wisdom', purpose: 'reading and managing animals',
    uses: ['Calm a domesticated animal, or keep a mount from spooking', 'Intuit an animal’s intentions', 'Control a mount through a difficult manoeuvre'] },
  { name: 'Insight', ability: 'Wisdom', purpose: 'reading a creature’s true intentions',
    uses: ['Determine whether someone is lying', 'Predict someone’s next move', 'Read body language, speech habits, and changes in manner'],
    note: 'Insight is usually **contested by the other creature\'s Deception**, rather than rolled against a flat DC. It tells you whether something is off — it is not a lie detector, and it does not tell you what the truth is.',
    aliases: ['sense motive'] },
  { name: 'Medicine', ability: 'Wisdom', purpose: 'diagnosing and treating injury and illness',
    uses: ['Stabilise a dying companion — DC 10', 'Diagnose an illness', 'Judge how long a body has been dead, or what killed it'],
    note: 'A **healer’s kit** stabilises a dying creature with **no check at all**, which is strictly better than this skill for that one job.' },
  { name: 'Perception', ability: 'Wisdom', purpose: 'noticing things — spotting, hearing, and sensing what is there',
    uses: ['Spot a hidden creature or object', 'Hear a whispered conversation or an approaching footstep', 'Notice a smell, a draught, or something out of place'],
    note: 'Its **passive** score — **10 + your Perception modifier** (+5 with advantage, −5 with disadvantage) — is what a hiding creature\'s Stealth is measured against, and it applies without you rolling or even asking.',
    aliases: ['spot', 'listen'] },
  { name: 'Survival', ability: 'Wisdom', purpose: 'staying alive and finding your way in the wild',
    uses: ['Follow tracks, and identify what made them', 'Hunt game, forage, and guide a party through wilderness', 'Predict the weather, or avoid quicksand and other natural hazards'] },
  { name: 'Deception', ability: 'Charisma', purpose: 'convincingly hiding the truth',
    uses: ['Tell a convincing lie, or fast-talk your way past a guard', 'Wear a disguise convincingly, or fake a document’s provenance', 'Misdirect with ambiguous but technically true words'],
    note: 'Usually **contested by the target\'s Insight**. A lie the target has every reason to disbelieve can simply fail regardless of the roll — the DM sets whether it is possible at all.',
    aliases: ['lying', 'bluff'] },
  { name: 'Intimidation', ability: 'Charisma', purpose: 'influencing someone through threat',
    uses: ['Extract information with a threat', 'Cow a hostile creature into backing down', 'Make it clear what happens if you are refused'],
    note: 'The DM may call for **Strength (Intimidation)** when you are physically looming rather than talking — the ability and the skill are chosen separately.' },
  { name: 'Performance', ability: 'Charisma', purpose: 'entertaining an audience',
    uses: ['Play music, dance, act, or tell a story to an audience', 'Hold a crowd’s attention, or turn its mood', 'Earn coin busking in a settlement'] },
  { name: 'Persuasion', ability: 'Charisma', purpose: 'influencing someone in good faith',
    uses: ['Negotiate, or ask a favour honestly', 'Influence a group with tact and social grace', 'Establish friendly relations, or defuse a confrontation'],
    note: 'Persuasion is the *honest* counterpart to Deception and Intimidation. What it can achieve depends on the target\'s attitude, not on the roll alone — no check makes a sworn enemy an ally.',
    aliases: ['diplomacy'] },
];

const SKILL_ENTRIES: GlossaryEntry[] = SKILL_ARTICLES.map((s) => ({
  term: s.name,
  kind: 'term',
  short: `A ${s.ability} skill: ${s.purpose}.`,
  body:
    `**${s.name}** is a **${s.ability}** skill — roll **d20 + your ${s.ability} modifier**, plus your ` +
    '**proficiency bonus** if you are proficient in it, and double that bonus if you have **Expertise**.\n\n' +
    'What you roll it for:\n\n' +
    s.uses.map((u) => `· ${u}`).join('\n') +
    (s.note ? `\n\n${s.note}` : '') +
    '\n\nThe ability pairing above is the **default, not a law**: the DM chooses the ability and the skill ' +
    'separately, so a Strength (Intimidation) or Intelligence (Perception) check is legitimate when the ' +
    'fiction calls for it. Being proficient in the skill still adds your bonus whichever ability is used.',
  seeAlso: ['Skill', 'Ability Check', 'Proficiency Bonus'],
  aliases: s.aliases,
}));

// ── The 13 damage types ──────────────────────────────────────────────────────────────
//
// Terms are "<Type> Damage" rather than the bare word, deliberately. A bare "Poison" entry would win
// an exact-term lookup over the **Poisoned** condition's "poison" alias, and in "takes poison damage
// and is poisoned" those are two different articles a reader might want. The bare word is kept as an
// alias where it is unambiguous, and omitted where it is not.
interface DamageArticle { type: string; group: string; blurb: string; aliases?: string[] }

const DAMAGE_ARTICLES: DamageArticle[] = [
  { type: 'Bludgeoning', group: 'physical', blurb: 'Blunt force — hammers, falling, and constriction. One of the three physical damage types, and the one most often reduced by non-magical resistance on skeletons and similar creatures.', aliases: ['bludgeoning'] },
  { type: 'Piercing', group: 'physical', blurb: 'Punctures — arrows, spears, and bites. One of the three physical damage types.', aliases: ['piercing'] },
  { type: 'Slashing', group: 'physical', blurb: 'Cuts — swords and claws. One of the three physical damage types.', aliases: ['slashing'] },
  { type: 'Acid', group: 'elemental', blurb: 'Corrosive damage that eats through material — black dragon breath, oozes, and thrown vials.', aliases: ['acid'] },
  { type: 'Cold', group: 'elemental', blurb: 'Freezing damage. Creatures native to cold environments commonly resist it, and it can freeze liquids and slow what it touches.', aliases: ['cold'] },
  { type: 'Fire', group: 'elemental', blurb: 'Burning damage — the most commonly resisted type in the game. It ignites unattended flammable objects, which is as often a problem as a benefit.', aliases: ['fire'] },
  { type: 'Lightning', group: 'elemental', blurb: 'Electrical damage, frequently shaped as a line. Conducts through metal and water.', aliases: ['lightning'] },
  { type: 'Thunder', group: 'elemental', blurb: 'Concussive sound. It is audible far beyond its area, so it is a poor choice when staying quiet matters.', aliases: ['thunder'] },
  { type: 'Force', group: 'magical', blurb: 'Pure magical energy. Almost nothing resists it, which is why force damage is the most reliable damage in the game and the standard answer to incorporeal creatures.', aliases: ['force'] },
  { type: 'Necrotic', group: 'magical', blurb: 'Withering life-force. It frequently prevents or reduces healing, and undead are typically immune to it.', aliases: ['necrotic'] },
  { type: 'Radiant', group: 'magical', blurb: 'Searing divine or solar light. Undead and fiends are often vulnerable to it, and very few creatures resist it.', aliases: ['radiant'] },
  { type: 'Psychic', group: 'magical', blurb: 'Damage to the mind itself. Rarely resisted, but mindless creatures — many constructs, oozes and plants — are often immune.', aliases: ['psychic'] },
  // No bare "poison" alias: that word belongs to the Poisoned condition, which is what a reader
  // almost always means when they hover it in a rules sentence.
  { type: 'Poison', group: 'other', blurb: 'Toxic damage, very widely resisted — constructs and undead are usually outright immune, which makes it the least reliable damage type to build around. It is frequently paired with the **Poisoned** condition, but the two are separate: an effect can deal one without applying the other.' },
];

const DAMAGE_ENTRIES: GlossaryEntry[] = DAMAGE_ARTICLES.map((d) => ({
  term: `${d.type} Damage`,
  kind: 'term',
  short: `${d.type} damage — one of the 13 damage types (${d.group}).`,
  body:
    `**${d.type}** damage.\n\n${d.blurb}\n\n` +
    'A damage type never changes the attack roll or the save; it changes only what the target does with ' +
    'the damage once it lands:\n\n' +
    '· **Resistance** — the target takes **half**, rounded down\n' +
    '· **Vulnerability** — the target takes **double**\n' +
    '· **Immunity** — the target takes **none**\n\n' +
    'Resistance and vulnerability to the same type **cancel out**, and neither ever applies twice however ' +
    'many sources grant it. Halving is applied **after** every other modifier to the damage roll.',
  seeAlso: ['Damage Types & Resistance'],
  aliases: d.aliases,
}));

export const DND5E_SHARED_GLOSSARY: SystemGlossary = [
  // ── core mechanics ───────────────────────────────────────────────────────────────
  {
    term: 'Ability Check',
    kind: 'mechanic',
    short: 'Roll d20, add an ability modifier (plus your proficiency bonus if proficient), and compare to a DC.',
    body: 'An **ability check** tests a character against a difficulty the DM sets. Roll **d20 + the relevant ability modifier**, and add your **proficiency bonus** if you are proficient in the skill or tool being used. Meet or beat the **DC** and you succeed — there is no "beat it by 5" tier in this system.\n\nThe DM picks the ability, and the skill only narrows it. That means the same skill can ride a different ability when the fiction calls for it (a Strength (Intimidation) check to physically loom, rather than the usual Charisma (Intimidation)).\n\nTypical DCs: **5** very easy · **10** easy · **15** medium · **20** hard · **25** very hard · **30** nearly impossible.\n\nIf two characters oppose each other, both roll the relevant check and the higher total wins — a **contest**. On a tie, nothing happens: the situation stays as it was.',
    seeAlso: ['Difficulty Class (DC)', 'Proficiency Bonus', 'Advantage', 'Skill'],
    aliases: ['check', 'skill check', 'contest'],
  },
  {
    term: 'Difficulty Class (DC)',
    kind: 'term',
    short: 'The number an ability check, attack or saving throw must meet or beat to succeed.',
    body: 'The **DC** is the target number. You succeed when your total **meets or beats** it — rolling exactly the DC is a success.\n\nWhen a character forces someone else to save, the DC is derived from the character rather than picked by the DM. The two you will use constantly:\n\n· **Spell save DC** = 8 + proficiency bonus + your spellcasting ability modifier\n· **Attack roll** = d20 + proficiency bonus (if proficient) + ability modifier, compared against **AC**\n\nBecause the proficiency bonus caps at +6 and ability modifiers at +5, a character DC tops out around 19 — the "bounded accuracy" that keeps low-level threats relevant.',
    seeAlso: ['Ability Check', 'Saving Throw', 'Armor Class (AC)', 'Proficiency Bonus'],
    aliases: ['dc', 'save dc', 'spell save dc', 'difficulty'],
  },
  {
    term: 'Advantage',
    kind: 'mechanic',
    short: 'Roll two d20s and use the higher — it does not stack, and it cancels with disadvantage.',
    body: 'With **advantage** you roll **two d20s and take the higher**. With **disadvantage** you roll two and take the **lower**.\n\nThe rules that matter, and that tables get wrong:\n\n· Advantage and disadvantage **do not stack**. Three sources of advantage is still just two dice.\n· If you have **both** advantage and disadvantage from any number of sources, they **cancel completely** and you roll one d20 — you do not count them up.\n· Only the **first** d20 matters for effects keyed to the roll (a rogue only needs one of the two to hit for Sneak Attack).\n\nAdvantage is worth roughly **+3 to +5** in the middle of the d20 range, and it also roughly doubles your chance of rolling a natural 20 — which is why it is the system\'s main lever instead of stacking numeric bonuses.',
    seeAlso: ['Ability Check', 'Attack Roll', 'Saving Throw'],
    aliases: ['disadvantage', 'adv', 'dis', 'advantage and disadvantage'],
  },
  {
    term: 'Proficiency Bonus',
    kind: 'mechanic',
    short: 'A single bonus from +2 to +6 set by character level, added once to anything you are proficient with.',
    body: 'Your **proficiency bonus** comes from your **character level** (not your class level), and it is the same number for everything you are proficient in — attacks, saves, skills, tools.\n\n· Levels 1–4: **+2**\n· Levels 5–8: **+3**\n· Levels 9–12: **+4**\n· Levels 13–16: **+5**\n· Levels 17–20: **+6**\n\nIt is **never multiplied or added twice**, with one exception: **Expertise** doubles it for a specific skill or tool. If several features would add it to the same roll, it still applies once.\n\nFor a multiclassed character, add up **all** your class levels to find the bonus — this is the number that makes multiclassing far less punishing than it looks.',
    seeAlso: ['Expertise', 'Ability Check', 'Difficulty Class (DC)'],
    aliases: ['pb', 'prof bonus', 'proficiency'],
  },
  {
    term: 'Expertise',
    kind: 'feature',
    short: 'Doubles your proficiency bonus for one chosen skill or tool.',
    body: '**Expertise** doubles your **proficiency bonus** for the chosen skill or tool — so +2 becomes +4 at level 1, and +6 becomes +12 at level 17.\n\nIt applies only where you are **already proficient**; it never grants proficiency. Rogues and Bards are the classic sources, with Rangers and some subclasses getting narrower versions.\n\nExpertise is the one thing in the game that meaningfully breaks bounded accuracy: an expertise character with a good ability score reliably clears DCs no one else can touch.',
    seeAlso: ['Proficiency Bonus', 'Skill'],
    aliases: ['double proficiency'],
  },
  {
    term: 'Armor Class (AC)',
    kind: 'term',
    short: 'The number an attack roll must meet or beat to hit you.',
    body: '**AC** represents how hard you are to hit meaningfully. An attack **hits when the attack roll meets or beats** it.\n\nCommon bases (you use one, never several):\n\n· **Unarmored**: 10 + DEX modifier\n· **Light armor**: armor base + DEX modifier (uncapped)\n· **Medium armor**: armor base + DEX modifier (**max +2**)\n· **Heavy armor**: the armor\'s flat value, **no DEX at all**\n· A **shield** adds +2 on top of any of these\n\nUnarmored Defense (Barbarian, Monk) replaces the base with its own formula — it does not stack with worn armor. Multiple AC-calculating features never stack; you pick one.',
    seeAlso: ['Attack Roll', 'Difficulty Class (DC)'],
    aliases: ['ac', 'armour class', 'armor'],
  },
  {
    term: 'Attack Roll',
    kind: 'mechanic',
    short: 'd20 + ability modifier + proficiency bonus (if proficient) against the target’s AC.',
    body: 'Roll **d20 + ability modifier + proficiency bonus** (if you are proficient with the weapon) and compare against the target\'s **AC**.\n\nWhich ability:\n\n· **Melee weapon**: Strength\n· **Ranged weapon**: Dexterity\n· **Finesse weapon**: your choice of Strength or Dexterity — and the same choice applies to the damage\n· **Thrown** (non-finesse): Strength\n· **Spell attack**: your spellcasting ability\n\nA **natural 20 always hits** and is a critical; a **natural 1 always misses**, no matter the modifiers. Damage adds the same ability modifier as the attack — except most cantrips and many spells, which add nothing.',
    seeAlso: ['Armor Class (AC)', 'Critical Hit', 'Advantage'],
    aliases: ['to hit', 'attack'],
  },
  {
    term: 'Critical Hit',
    kind: 'mechanic',
    short: 'A natural 20 on an attack: roll the damage dice twice, then add the modifiers once.',
    body: 'On a **natural 20** the attack hits regardless of AC and is a **critical hit**.\n\nRoll **all of the attack\'s damage dice twice** and add them together, then add your flat modifiers **once**. A greatsword crit is 4d6 + STR, not 2×(2d6 + STR).\n\nEvery die that is part of the damage doubles — weapon dice, Sneak Attack, a Divine Smite, an elemental rider. Flat bonuses never double.\n\nOnly a natural 20 crits by default; features that widen the range (Champion Fighter, some subclasses) say so explicitly. A critical is about the roll, not the total — a 19+5 = 24 is not a crit.',
    seeAlso: ['Attack Roll', 'Advantage'],
    aliases: ['crit', 'critical', 'natural 20', 'nat 20'],
  },
  {
    term: 'Saving Throw',
    kind: 'mechanic',
    short: 'A d20 + ability modifier reaction to a threat, against a DC set by its source.',
    body: 'A **saving throw** is what you roll when something happens **to** you: a fireball, a poison, a charm. Roll **d20 + the relevant ability modifier**, adding your **proficiency bonus** only if your class grants proficiency in that save.\n\nThere is a save for **each of the six abilities**:\n\n· **STR** — being moved, restrained by force\n· **DEX** — dodging area effects; the most common by far\n· **CON** — poison, disease, holding concentration\n· **INT** — psychic assaults on the mind\n· **WIS** — charm, fear, illusions; the most common "lose your turn" save\n· **CHA** — banishment, effects on your identity\n\nEvery class gets exactly **two** save proficiencies at level 1, and multiclassing never grants more. The strong saves (DEX/CON/WIS) and the weak ones (STR/INT/CHA) are deliberately unevenly distributed.',
    seeAlso: ['Difficulty Class (DC)', 'Concentration', 'Advantage'],
    aliases: ['save', 'saves', 'saving throws', 'st'],
  },
  {
    term: 'Concentration',
    kind: 'mechanic',
    short: 'Holding a spell active — one at a time, and damage forces a CON save to keep it.',
    body: 'Many of the game\'s best spells require **concentration**, and you can only concentrate on **one at a time**. Casting a second concentration spell ends the first instantly.\n\nYou lose concentration when:\n\n· You **take damage** — make a **Constitution saving throw**, DC = **10 or half the damage taken, whichever is higher**. One save per source of damage.\n· You are **Incapacitated** or die.\n· The DM rules the environment demands it (a violent storm, etc).\n\nCasting a non-concentration spell does **not** break it, and neither does taking an action. War Caster grants advantage on these saves; Resilient (CON) adds your proficiency bonus.',
    seeAlso: ['Saving Throw', 'Spell Slot'],
    aliases: ['concentrating', 'con save'],
  },
  {
    term: 'Spell Slot',
    kind: 'mechanic',
    short: 'The resource a spell is cast with — spend a slot of the spell’s level or higher.',
    body: 'Casting a spell of level 1+ **spends a slot** of that level or higher. Casting with a higher slot **upcasts** it — but only spells that describe an "At Higher Levels" effect gain anything.\n\nKnowing or preparing a spell is separate from having a slot for it. Slots come back on a **long rest** for nearly everyone; Warlock **Pact Magic** slots are the notable exception — few slots, always at the highest level you can cast, refreshed on a **short rest**.\n\n**Cantrips** cost no slot and can be cast at will. Rituals can be cast without a slot if you have the ritual tag and the ability to do so, taking 10 minutes longer.',
    seeAlso: ['Cantrip', 'Concentration', 'Long Rest'],
    aliases: ['slots', 'spell slots', 'upcast', 'upcasting'],
  },
  {
    term: 'Cantrip',
    kind: 'mechanic',
    short: 'A level-0 spell cast at will, for free, that scales with character level.',
    body: 'A **cantrip** costs no spell slot and can be cast as often as you like. Cantrips are always "prepared" — they never take up a preparation slot.\n\nDamage cantrips scale on **character level**, not class level: they step up at levels **5, 11 and 17**. That is why a cantrip is a martial\'s worst attack and a caster\'s reliable floor.\n\nCantrip damage does **not** add your ability modifier unless the spell says so (Toll the Dead does not; Produce Flame does not; the notable exception is a melee cantrip using an attack roll with a rider).',
    seeAlso: ['Spell Slot'],
    aliases: ['cantrips', 'level 0 spell'],
  },
  {
    term: 'Initiative',
    kind: 'mechanic',
    short: 'A Dexterity check at the start of combat that sets the turn order.',
    body: '**Initiative** is a **Dexterity ability check** — d20 + DEX modifier, plus anything that adds to it. It is not a saving throw, which matters for anything keyed to "ability checks".\n\nHighest goes first; the order holds for the whole combat. The DM decides ties (commonly PCs before NPCs, or a contested roll).\n\nBecause it is an ability check, effects granting advantage on ability checks apply. Alert-style features and the Barbarian\'s Feral Instinct are the usual boosters.',
    seeAlso: ['Ability Check', 'Round'],
    aliases: ['init', 'turn order'],
  },
  {
    term: 'Round',
    kind: 'mechanic',
    short: 'Six seconds of game time in which everyone in the initiative order takes one turn.',
    body: 'A **round** is **6 seconds**. Everyone in the initiative order takes one **turn** per round; ten rounds is one minute.\n\nOn your turn you can normally take:\n\n· **one action**\n· **one bonus action** (only if something grants you one — there is no default bonus action)\n· **movement** up to your speed, which you can split around your action\n· any number of **free interactions** (drawing a weapon, opening a door)\n\nPlus **one reaction per round**, which can be used on anyone\'s turn and refreshes at the start of your turn. Durations are measured in rounds and usually tick at the start or end of a specific creature\'s turn — read which.',
    seeAlso: ['Initiative', 'Reaction'],
    aliases: ['turn', 'rounds', 'action economy'],
  },
  {
    term: 'Reaction',
    kind: 'action',
    short: 'One instant response per round, triggered by something specific.',
    body: 'A **reaction** is an instant action taken in response to a **trigger**, and you get exactly **one per round**. It refreshes at the **start of your turn**, so a reaction spent on someone else\'s turn leaves you without one until then.\n\nThe universal one is an **Opportunity Attack**: when a hostile creature you can see **leaves your reach** using its movement, you can make one melee attack against it. Note it does not trigger on a creature moving *within* your reach, or on being teleported or moved by someone else\'s force.\n\nOther common reactions: casting **Shield** or **Absorb Elements**, a Rogue\'s **Uncanny Dodge**, readying an action. The **Disengage** action prevents opportunity attacks for the turn.',
    seeAlso: ['Round', 'Opportunity Attack'],
    aliases: ['reactions'],
  },
  {
    term: 'Opportunity Attack',
    kind: 'action',
    short: 'A reaction melee attack when a creature leaves your reach on its own movement.',
    body: 'When a hostile creature **you can see** moves **out of your reach** using its own movement, you can spend your **reaction** to make **one melee attack** against it, at the moment it leaves.\n\nIt does **not** trigger when:\n\n· the creature moves **within** your reach, or toward you\n· it **Teleports**, or is moved by someone else without spending its movement\n· it takes the **Disengage** action\n· you are **Incapacitated**, or cannot see it\n\nOne attack, not your full Attack action — an Extra Attack does not apply.',
    seeAlso: ['Reaction', 'Round'],
    aliases: ['aoo', 'opportunity attacks', 'attack of opportunity'],
  },
  {
    term: 'Long Rest',
    kind: 'mechanic',
    short: 'At least 8 hours: regain all HP, half your Hit Dice, and your daily resources.',
    body: 'A **long rest** is at least **8 hours**, of which at least 6 is sleep and up to 2 can be light activity (reading, talking, keeping watch). More than 1 hour of walking, fighting or casting interrupts it — you must start over.\n\nOn completing one you regain:\n\n· **all lost hit points**\n· **half your total Hit Dice** (minimum 1)\n· all **spell slots** and most per-long-rest features\n\nYou can only benefit from **one long rest per 24 hours**, and you must have at least 1 hit point to start one.',
    seeAlso: ['Short Rest', 'Hit Dice'],
    aliases: ['long rests', 'resting'],
  },
  {
    term: 'Short Rest',
    kind: 'mechanic',
    short: 'At least 1 hour: spend Hit Dice to heal and refresh short-rest features.',
    body: 'A **short rest** is at least **1 hour** of light activity. It does **not** restore hit points on its own — you must choose to **spend Hit Dice**.\n\nFor each die spent, roll it and add your **Constitution modifier**, and regain that many hit points (minimum 0 per die). You choose how many to spend, one at a time, and can stop once you like the number.\n\nShort rests also refresh the features that say so: Warlock **Pact Magic** slots, Fighter **Second Wind** and **Action Surge**, Monk **Ki/Focus**, Bardic Inspiration at higher levels. A party that never short rests quietly starves those classes.',
    seeAlso: ['Long Rest', 'Hit Dice'],
    aliases: ['short rests'],
  },
  {
    term: 'Hit Dice',
    kind: 'mechanic',
    short: 'A per-level die you spend on a short rest to heal; you regain half of them on a long rest.',
    body: 'You have one **Hit Die per character level**, of the size your class uses (d6 Sorcerer/Wizard · d8 most · d10 Fighter/Paladin/Ranger · d12 Barbarian).\n\nSpend one on a **short rest** to roll it and regain that many HP **+ your Constitution modifier**. On a **long rest** you get back **half your total** (minimum 1) — not all of them, which is what makes a long adventuring day bite.\n\nMulticlassed characters track each class\'s dice separately, and their maximum HP at level 1 is the full die of their starting class plus CON.',
    seeAlso: ['Short Rest', 'Long Rest'],
    aliases: ['hit die', 'hd'],
  },
  {
    term: 'Death Saving Throw',
    kind: 'mechanic',
    short: 'At 0 HP: roll a d20 each turn — three successes stabilise, three failures kill.',
    body: 'At **0 hit points** you are **Unconscious** and **dying**. At the **start of each of your turns**, roll a **d20** with no modifiers of any kind — this is not an ability check and nothing adds to it unless a feature says so explicitly.\n\n· **10 or higher** = success · **9 or lower** = failure\n· **Three successes** → you **stabilise** (still unconscious at 0 HP, but no longer dying)\n· **Three failures** → you **die**\n· **Natural 20** → you regain **1 hit point** immediately and are up\n· **Natural 1** → counts as **two failures**\n\nTaking **damage while at 0 HP** costs you one failure automatically — and **two** if it was a critical hit. Damage equal to your hit point **maximum** in one blow kills you outright, no saves.\n\nAny healing, even 1 point, brings you to that many HP and clears all successes and failures.',
    seeAlso: ['Unconscious', 'Stabilize'],
    aliases: ['death save', 'death saves', 'dying', 'at 0 hp'],
  },
  {
    term: 'Stabilize',
    kind: 'action',
    short: 'A DC 10 Medicine check as an action to stop a dying creature from making death saves.',
    body: 'Use your **action** to administer first aid: a **DC 10 Wisdom (Medicine) check** on a creature at 0 HP. On a success it becomes **stable** — it stops rolling death saves and its successes/failures reset.\n\nA **healer\'s kit** stabilises with **no check at all**, spending one of its 10 uses. It is the cheapest insurance in the game.\n\nA stable creature is still **Unconscious at 0 HP**. It regains **1 hit point after 1d4 hours** if left alone. Taking any damage makes it start dying again immediately.',
    seeAlso: ['Death Saving Throw', 'Unconscious'],
    aliases: ['stabilise', 'stabilizing', 'medicine check'],
  },
  // ── conditions identical across both editions ────────────────────────────────────
  {
    term: 'Blinded',
    kind: 'condition',
    short: 'You cannot see: you auto-fail sight checks, your attacks have disadvantage, and attacks against you have advantage.',
    body: 'A **Blinded** creature:\n\n· **cannot see** and automatically **fails** any ability check requiring sight\n· has **disadvantage** on its attack rolls\n· is attacked with **advantage**\n\nBlindness does not stop you acting, moving or casting most spells — but you cannot target what you cannot see, and you may need to guess a square.',
    seeAlso: ['Advantage'],
    aliases: ['blind'],
  },
  {
    term: 'Charmed',
    kind: 'condition',
    short: 'You cannot attack the charmer, and they have advantage on social checks with you.',
    body: 'A **Charmed** creature:\n\n· **cannot attack** the charmer or target them with harmful abilities or magical effects\n· the charmer has **advantage** on any ability check to interact with it socially\n\nCharmed does not mean controlled. You keep your own mind, you act freely otherwise, and you can still attack the charmer\'s allies. Many charms end early if you or your allies harm the target.',
    seeAlso: ['Frightened'],
    aliases: ['charm'],
  },
  {
    term: 'Deafened',
    kind: 'condition',
    short: 'You cannot hear and auto-fail any check requiring hearing.',
    body: 'A **Deafened** creature **cannot hear** and automatically **fails** any ability check that requires hearing.\n\nOn its own it is mild — but it stops you hearing a verbal warning, and it interacts with effects that require hearing (a Bard\'s inspiration delivered by voice, some fear effects). It does **not** stop you casting spells with verbal components.',
    aliases: ['deaf'],
  },
  {
    term: 'Frightened',
    kind: 'condition',
    short: 'Disadvantage while the source is in sight, and you cannot willingly move closer to it.',
    body: 'A **Frightened** creature:\n\n· has **disadvantage on ability checks and attack rolls** while the **source of its fear is within line of sight**\n· **cannot willingly move closer** to the source\n\nBreak line of sight and the disadvantage stops — but the condition is still on you, so you still cannot approach. It is one of the most punishing conditions in the game because it hits both attacks and checks.',
    seeAlso: ['Charmed', 'Advantage'],
    aliases: ['fear', 'fright'],
  },
  {
    term: 'Incapacitated',
    kind: 'condition',
    short: 'You cannot take actions or reactions.',
    body: 'An **Incapacitated** creature **cannot take actions or reactions**.\n\nIt is small text with enormous reach: it is a component of Paralyzed, Petrified, Stunned and Unconscious, and it **breaks concentration** on any spell. Most "you lose your turn" effects work by applying Incapacitated underneath.\n\nNote what it does not do by itself: you can still move (unless something else stops you), and you can still speak.',
    seeAlso: ['Stunned', 'Paralyzed', 'Concentration'],
    aliases: ['incap'],
  },
  {
    term: 'Invisible',
    kind: 'condition',
    short: 'You cannot be seen without special senses: your attacks have advantage, attacks against you have disadvantage.',
    body: 'An **Invisible** creature is impossible to see without magic or a special sense. For hiding purposes it counts as **heavily obscured** — though it can still be detected by any noise it makes or tracks it leaves.\n\n· Attack rolls **against** it have **disadvantage**\n· **Its** attack rolls have **advantage**\n\nInvisible does not mean silent or undetectable, and an enemy who knows roughly where you are can still attack the space.',
    seeAlso: ['Advantage'],
    aliases: ['invisibility'],
  },
  {
    term: 'Paralyzed',
    kind: 'condition',
    short: 'Incapacitated, cannot move or speak, auto-fail STR/DEX saves, and any hit from within 5 ft is a critical.',
    body: 'A **Paralyzed** creature:\n\n· is **Incapacitated** (no actions or reactions) and **cannot move or speak**\n· **automatically fails Strength and Dexterity saving throws**\n· is attacked with **advantage**\n· **any attack that hits it from within 5 feet is a critical hit**\n\nThat last line is why Hold Person ends fights: a melee attacker beside a paralyzed target crits on every hit, doubling every damage die.',
    seeAlso: ['Incapacitated', 'Critical Hit', 'Stunned'],
    aliases: ['paralysis', 'hold person'],
  },
  {
    term: 'Petrified',
    kind: 'condition',
    short: 'Turned to stone: incapacitated, unaware, resistant to all damage, and immune to poison and disease.',
    body: 'A **Petrified** creature is transformed, along with what it is wearing and carrying, into solid inanimate substance. Its **weight ×10** and it **stops ageing**.\n\n· **Incapacitated**, **cannot move or speak**, and is **unaware of its surroundings**\n· attacked with **advantage**\n· **automatically fails Strength and Dexterity saving throws**\n· has **resistance to all damage**\n· is **immune to poison and disease** (though an existing one is only suspended, not cured)',
    seeAlso: ['Incapacitated'],
    aliases: ['petrification', 'stone'],
  },
  {
    term: 'Poisoned',
    kind: 'condition',
    short: 'Disadvantage on attack rolls and ability checks.',
    body: 'A **Poisoned** creature has **disadvantage on attack rolls and ability checks**.\n\nThat is the whole condition — it does not damage you by itself, and it does not affect saving throws. Poison damage and the Poisoned condition are separate things; an effect can deal one without applying the other.',
    seeAlso: ['Advantage'],
    aliases: ['poison'],
  },
  {
    term: 'Restrained',
    kind: 'condition',
    short: 'Speed 0, your attacks have disadvantage, attacks against you have advantage, and you have disadvantage on DEX saves.',
    body: 'A **Restrained** creature:\n\n· has its **speed reduced to 0** and cannot benefit from bonuses to speed\n· is attacked with **advantage**\n· has **disadvantage** on its own attack rolls\n· has **disadvantage on Dexterity saving throws**\n\nIt is strictly worse than Grappled, and the DEX-save clause is what makes webs and vines so dangerous next to area damage.',
    seeAlso: ['Grappled', 'Advantage'],
    aliases: ['restrain', 'webbed'],
  },
  {
    term: 'Stunned',
    kind: 'condition',
    short: 'Incapacitated, cannot move, can speak only falteringly, auto-fail STR/DEX saves, attacked with advantage.',
    body: 'A **Stunned** creature:\n\n· is **Incapacitated** (no actions or reactions) and **cannot move**\n· can **speak only falteringly**\n· **automatically fails Strength and Dexterity saving throws**\n· is attacked with **advantage**\n\nStunned is Paralyzed without the auto-crit — still a full lost turn. It breaks concentration through Incapacitated.',
    seeAlso: ['Incapacitated', 'Paralyzed'],
    aliases: ['stun', 'stunning strike'],
  },
  // ── the 18 skills ────────────────────────────────────────────────────────────────
  //
  // These live in the SHARED file, not the per-edition ones, because both editions' own `Skill`
  // articles already state that the 18 skills and their governing abilities are unchanged between
  // them — the 2024 entry says so in as many words. Shared is therefore the accurate placement and
  // the one that cannot drift: an edition-specific copy would let 2014's Athletics and 2024's
  // Athletics disagree about a rule that is identical in both books.
  //
  // What is DELIBERATELY not here: anything about where proficiency comes from. That genuinely
  // differs (2024 leans on backgrounds, 2014 spreads it across class/background/race), and each
  // edition's own `Skill` article carries it.
  ...SKILL_ENTRIES,
  // ── damage types ─────────────────────────────────────────────────────────────────
  //
  // Also shared, and for the same reason: the 13 types and what resists them are unchanged across
  // the editions. The general resistance/vulnerability arithmetic lives in each edition's own
  // `Damage Types & Resistance` article; these are the per-type entries a tooltip asks for when a
  // spell says "6d8 radiant".
  ...DAMAGE_ENTRIES,
];
