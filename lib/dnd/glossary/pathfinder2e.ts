// lib/dnd/glossary/pathfinder2e.ts — Pathfinder Second Edition (Remaster) rules glossary.
//
// Remaster terminology throughout: Off-Guard (not Flat-Footed), Reactive Strike (not Attack of
// Opportunity), spell RANKS (not levels), attribute modifiers (not scores). PF2 has no Base Attack
// Bonus, no advantage/disadvantage, and no per-ability saves — do not import those from other d20s.
import type { SystemGlossary } from './types';

export const PATHFINDER2E_GLOSSARY: SystemGlossary = [
  // ── Core resolution ───────────────────────────────────────────────────────────────────────
  {
    term: 'Degrees of Success',
    kind: 'mechanic',
    short: 'Every d20 roll in PF2 lands on one of four outcomes — critical success, success, failure, or critical failure — not just hit or miss.',
    body:
      'Compare your **d20 + modifiers** to the DC and read the result on a four-step ladder:\n\n· Beat the DC by **10 or more** → **critical success**\n· Meet or beat the DC → **success**\n· Miss the DC → **failure**\n· Miss the DC by **10 or more** → **critical failure**\n\nThen apply the die itself: a **natural 20** improves the degree by one step, and a **natural 1** worsens it by one step. This is applied *after* comparing to the DC, so a natural 20 that still missed the DC is only a failure, and a natural 1 that beat the DC by 10 is still a success. On an attack roll, a critical success means a **critical hit** — double damage.\n\nThis is why the natural 20 is not automatically special in PF2 the way it is in 5e: it is a one-step bump, not an auto-crit. A level-1 fighter rolling a nat 20 against a DC 40 wall of stone still just fails.\n\nAlmost every subsystem hangs off this ladder — saves, skills, Recall Knowledge, Treat Wounds, Escape. When a rule says "on a success" it means exactly this step and nothing looser.',
    seeAlso: ['Basic Save', 'Armor Class', 'Level-Based DC', 'Incapacitation'],
    aliases: ['degree of success', 'crit success', 'critical failure', 'crit fail', 'four degrees'],
  },
  {
    term: 'Three-Action Economy',
    kind: 'mechanic',
    short: 'On your turn you get three actions to spend however you like, plus one reaction and any number of free actions.',
    body:
      'Each turn you have **3 actions**, **1 reaction**, and **free actions**. There is no "bonus action", no separate move-then-attack structure, and no action/move split — moving, attacking, drinking a potion, and casting are all just actions you spend from the same pool of three.\n\nCommon costs:\n\n· **Strike** — 1 action\n· **Stride** (move your Speed) — 1 action\n· **Step** (5 feet, does not trigger reactions) — 1 action\n· Most spells — **2 actions** (verbal + somatic); some are 1 or 3\n· **Raise a Shield**, **Interact** (draw, open, pick up) — 1 action each\n\nActivities that take more than one action are written with an action cost (e.g. a 2-action activity) and you must have all of the actions left to start it. Reactions have a **trigger** and are used on other creatures\' turns.\n\nThe cost of a third Strike is not the action — it\'s the **Multiple Attack Penalty**. Three Strikes at −0/−5/−10 is usually worse than two Strikes plus something useful.',
    seeAlso: ['Multiple Attack Penalty', 'Reactive Strike', 'Quickened', 'Slowed', 'Stunned', 'Encounter Mode'],
    aliases: ['three action', '3 action economy', 'actions per turn', 'action economy'],
  },
  {
    term: 'Proficiency Rank',
    kind: 'mechanic',
    short: 'Five ranks — Untrained, Trained, Expert, Master, Legendary — that set a bonus AND decide whether your level is added at all.',
    body:
      'Your bonus on any proficient roll is **level + rank bonus + attribute modifier + item/status/circumstance bonuses**.\n\n· **Untrained** — +0, **and your level is not added**\n· **Trained** — +2 + level\n· **Expert** — +4 + level\n· **Master** — +6 + level\n· **Legendary** — +8 + level\n\nAdding your level is the single most important number in PF2 math: a 10th-level Trained character has +12 before their attribute, while an Untrained one has +0. That gap is why untrained characters simply cannot attempt high-level tasks, and why monsters of a few levels above the party are genuinely dangerous.\n\nProficiency applies to everything: skills, saves, AC, attack rolls with each weapon category, spell attacks and spell DCs, even Perception. Classes raise specific ones on a fixed schedule, and **skill increases** (at 3rd, 5th, 7th and every odd level after) let you push a skill one rank higher, with Master gated behind 7th level and Legendary behind 15th.\n\nA **DC** built from proficiency is 10 + the same total (e.g. your spell DC = 10 + level + rank + key attribute).',
    seeAlso: ['Level-Based DC', 'Armor Class', 'Attribute Boost', 'Saving Throw'],
    aliases: ['proficiency', 'trained', 'expert', 'master', 'legendary', 'untrained', 'ranks'],
  },
  {
    term: 'Multiple Attack Penalty',
    kind: 'mechanic',
    short: 'Your second attack in a turn takes −5 and your third and later take −10 (−4/−8 with an agile weapon).',
    body:
      'Every attack roll you make on your turn after the first takes the **Multiple Attack Penalty (MAP)**:\n\n· 1st attack — **−0**\n· 2nd attack — **−5**\n· 3rd and beyond — **−10**\n\nIf the attack is made with a weapon with the **agile** trait, the penalty is **−4 / −8** instead. The trait of the weapon you are *currently swinging* decides the size of the penalty, not the one you swung before — so a sword-then-dagger sequence takes −4 on the dagger.\n\nMAP counts *attack rolls*, not Strikes specifically: spell attack rolls and attack-roll maneuvers like **Trip**, **Grapple**, **Shove** and **Disarm** all count only if they use an attack roll — the skill-based versions (Athletics vs a DC) still increment MAP because they have the **attack** trait. Anything with the attack trait raises it.\n\nMAP **resets at the start of your turn**, so reactions like a Reactive Strike on someone else\'s turn are made at full MAP-free bonus. Fighters and others with **Agile Grace**-style features can reduce it (e.g. to −4/−8, or −3/−6 with agile).',
    seeAlso: ['Three-Action Economy', 'Reactive Strike', 'Degrees of Success'],
    aliases: ['MAP', 'multiple attack', 'attack penalty', 'iterative'],
  },
  {
    term: 'Armor Class',
    kind: 'term',
    short: 'The DC an attacker must hit; 10 + Dex (capped by your armor) + proficiency + level + item bonus.',
    body:
      '**AC = 10 + Dexterity modifier (up to the armor\'s Dex cap) + proficiency bonus + your level + the armor\'s item bonus + any other bonuses/penalties.**\n\nThere is **one AC** in PF2 — no touch AC, no flat-footed AC. Attacks all compare to the same number, and beating it by 10 is a critical hit.\n\nArmor trades Dex for item bonus: light armors have a small item bonus and a generous **Dex cap**, heavy armors have a large item bonus and a Dex cap as low as +0. Unarmored (explorer\'s clothing) is +0 item with no cap. Because your **level** and **proficiency rank** are in AC, an unproficient character\'s AC falls behind fast.\n\nBonuses to AC come in types that do not stack with themselves — take only the highest **item**, highest **status**, and highest **circumstance** bonus. **Raise a Shield** gives a +2 circumstance bonus (most shields) until your next turn. **Cover** gives +2 (standard) or +4 (greater) circumstance.\n\nPenalties stack the same way: **Off-Guard** is a −2 circumstance penalty, **Clumsy N** is a −N status penalty, and **Frightened N** applies −N to AC as a DC.',
    seeAlso: ['Off-Guard', 'Clumsy', 'Proficiency Rank', 'Degrees of Success'],
    aliases: ['AC', 'armour class', 'defense'],
  },
  {
    term: 'Saving Throw',
    kind: 'mechanic',
    short: 'Three saves — Fortitude, Reflex, Will — each level + proficiency + Con, Dex, or Wis.',
    body:
      'PF2 has exactly **three saving throws**, never six per-ability saves:\n\n· **Fortitude** — Constitution. Poison, disease, raw physical trauma.\n· **Reflex** — Dexterity. Fireballs, traps, area effects you can dodge.\n· **Will** — Wisdom. Fear, charm, illusions, mental attacks.\n\nEach is **level + proficiency rank bonus + the governing attribute modifier**. Classes train them at different ranks and raise them at set levels; **Monk** is the only class that reaches Expert in all three early (its saves are famously good). Successful saves are read on the four-step ladder like any other roll.\n\nAt high proficiency you get save-upgrade features: **Great Fortitude**/**Evasion**/**Resolve**-style class features turn a *success* into a *critical success* on that save, which on a **basic save** means taking no damage at all.\n\nThe save\'s **DC is set by the effect** (a spell DC, a monster\'s DC, or a level-based DC), never by the saver.',
    seeAlso: ['Basic Save', 'Proficiency Rank', 'Degrees of Success', 'Level-Based DC'],
    aliases: ['saves', 'fortitude', 'reflex', 'will', 'save'],
  },
  {
    term: 'Basic Save',
    kind: 'mechanic',
    short: 'A shorthand for the standard damage-save ladder: none / half / full / double.',
    body:
      'When an effect says "**basic Reflex save**" (or Fortitude/Will), it means the standard damage ladder:\n\n· **Critical success** — you take **no damage**\n· **Success** — you take **half damage**\n· **Failure** — you take **full damage**\n· **Critical failure** — you take **double damage**\n\nThat is the entire rule; the spell doesn\'t have to restate it. *Fireball* deals 6d6 with a basic Reflex save, so a crit success takes 0 and a crit failure takes 12d6.\n\nBecause the ladder is four steps, save-upgrade features are enormous here: **Evasion** (success → critical success on Reflex) converts every half-damage result into zero.\n\nA save that is **not** basic spells out its own four outcomes — read them, because riders like Frightened or Slowed usually only land on failure and worsen on critical failure.',
    seeAlso: ['Saving Throw', 'Degrees of Success', 'Incapacitation'],
    aliases: ['basic reflex', 'basic fortitude', 'basic will', 'basic saving throw'],
  },
  {
    term: 'Level-Based DC',
    kind: 'mechanic',
    short: 'The GM sets most DCs from the level of the thing being attempted, running from 14 at level 0 to 40 at level 20.',
    body:
      'PF2 DCs come from a table keyed to the **level of the task, creature, or item** — not from a feel. Anchors:\n\n· Level 0 → **DC 14** · Level 1 → **DC 15** · Level 2 → **DC 16**\n· Level 5 → **DC 20** · Level 10 → **DC 27**\n· Level 15 → **DC 34** · Level 20 → **DC 40**\n\nThe table climbs by about 1 per level with an extra +1 every third level. On top of that the GM applies a **difficulty adjustment**: incredibly easy −10, very easy −5, easy −2, hard **+2**, very hard **+5**, incredibly hard **+10**.\n\nThere is also a **simple DC** track for tasks with no natural level, keyed to the rank you\'d expect of someone who can do it: Untrained **10**, Trained **15**, Expert **20**, Master **30**, Legendary **40**.\n\nRecall Knowledge about a creature uses that creature\'s level DC, usually with an adjustment for how obscure it is. This is why the DC of "identify the goblin" and "identify the demon lord" are so far apart.',
    seeAlso: ['Proficiency Rank', 'Recall Knowledge', 'Degrees of Success'],
    aliases: ['DC by level', 'level based DC', 'simple DC', 'difficulty class'],
  },
  {
    term: 'Attribute Boost',
    kind: 'mechanic',
    short: 'At 1st level and again at 5th, 10th, 15th, and 20th you raise four different attribute modifiers by 1 each.',
    body:
      'The Remaster works in **attribute modifiers** directly (no 3–18 score). Everything starts at **+0** and boosts push it up: an ancestry\'s boosts and flaw, a background\'s **2 boosts**, your class\'s **key attribute** boost, and **4 free boosts** — no two free boosts to the same attribute. The practical level-1 ceiling in your key attribute is **+4**.\n\nAt levels **5, 10, 15, and 20** you get **four attribute boosts**, each to a *different* attribute. Each is +1 — **except** that a boost applied to a modifier already at **+4 or higher** is only a **partial boost**, and it takes **two partial boosts** to raise that modifier by 1.\n\nSo a key attribute that starts at +4 goes: boost at 5th (partial), 10th → **+5**, 15th (partial), 20th → **+6**. An **apex item** (17th-level gear) can push one attribute to **+7**, the practical cap.\n\nThis is deliberate: the game expects your attack attribute to be roughly +4 → +6 across 20 levels, and lets the other three boosts broaden your character rather than max one stat.',
    seeAlso: ['Proficiency Rank', 'Saving Throw'],
    aliases: ['attribute boosts', 'ability boost', 'ASI', 'attribute increase', 'partial boost'],
  },
  {
    term: 'Hero Point',
    kind: 'mechanic',
    short: 'A metacurrency: spend 1 to reroll a check, or spend them all to cheat death.',
    body:
      'You start each session with **1 Hero Point**, and the GM hands out more (typically 1 per hour of play) for heroic, clever, or entertaining play. You can hold at most **3** at a time, and any unspent Hero Points are **lost at the end of the session** — they do not bank.\n\nTwo uses:\n\n· **Spend 1 Hero Point** — reroll a check you just made. You are stuck with the new result, even if it is worse. This is a free action, and you must do it before the GM reveals the outcome.\n· **Spend ALL your Hero Points (minimum 1)** — when you are **Dying**, you lose the Dying condition and are restored to **1 Hit Point** (you keep **Wounded**). You can do this even though Dying normally lets you take no actions.\n\nOnly you can spend your own Hero Points, and only on your own rolls. Because a reroll is "reroll the whole check", it re-reads on the degrees-of-success ladder — a reroll can turn a critical failure into a critical success.',
    seeAlso: ['Dying', 'Wounded', 'Degrees of Success'],
    aliases: ['hero points', 'HP metacurrency', 'reroll'],
  },
  {
    term: 'Focus Point',
    kind: 'mechanic',
    short: 'A small pool (max 3) that fuels focus spells, refilled by Refocusing for 10 minutes.',
    body:
      'Focus spells are the always-there magic of a class or subclass — a cleric\'s domain spell, a druid\'s order spell, a bard\'s composition, a monk\'s ki spell. They cost **1 Focus Point** and do not use spell slots.\n\nYour **focus pool** starts at **1 point** when you gain your first focus spell and grows to a maximum of **3** as you take more feats that grant them. Focus spells are **automatically heightened** to half your level rounded up — a 9th-level character casts theirs at **rank 5** with no slot juggling.\n\n· **Refocus** — a **10-minute** activity that restores **1 Focus Point**. You must do something thematically tied to your source (pray, commune with nature, practise forms).\n· Refocus is the reason PF2 exploration has a natural rhythm: after every fight, spend 10 minutes and you get a point back.\n\nA full night\'s rest and daily preparations refill the whole pool. Focus points never exceed 3, so hoarding is not a strategy.',
    seeAlso: ['Spell Rank', 'Exploration Mode', 'Treat Wounds'],
    aliases: ['focus points', 'refocus', 'focus spell', 'focus pool'],
  },
  {
    term: 'Spell Rank',
    kind: 'term',
    short: 'PF2 spells have ranks 1–10, deliberately named so they never get confused with character levels.',
    body:
      'Spells are rated by **rank 1 through 10**, and slots are per rank. Player characters get slots up to **rank 10** only at 19th level; rank 10 is otherwise the territory of the world\'s most powerful magic. **Cantrips** are rank-less at-will spells that **automatically heighten to half your level, rounded up**.\n\n**Heightening** is central: casting a spell in a higher-rank slot makes it stronger, and each spell lists its own heightened entry (either "Heightened (+1)" for an incremental scale or a specific rank). A rank-1 *magic missile* heightened to rank 3 throws three missiles.\n\nMost spells cost **2 actions** to cast (verbal + somatic components). Some are 1 action, some 3, and a few are longer activities. A spell\'s DC and attack roll use your class\'s spellcasting proficiency + key attribute + level.\n\nRemaster note: the word "level" is reserved for *creatures and characters*, so never write "3rd-level spell" — it is a **rank-3 spell**. Spell traditions are **arcane, divine, occult, primal**, not schools.',
    seeAlso: ['Focus Point', 'Proficiency Rank', 'Incapacitation'],
    aliases: ['spell ranks', 'spell level', 'cantrip', 'heightened', 'heighten'],
  },
  {
    term: 'Incapacitation',
    kind: 'mechanic',
    short: 'A trait that makes save-or-lose effects unreliable against higher-level creatures.',
    body:
      'An effect with the **incapacitation** trait (sleep, paralysis, banishment, most "you lose your turn" magic) checks the target\'s level against the effect\'s level:\n\n· If the target\'s **level is more than double** the effect\'s level, the target\'s outcome **improves by one degree of success**.\n\nFor a spell, the effect\'s level is **twice its rank** — a rank-3 *slow* counts as level 6, so a level-7+ creature gets the one-step improvement. In practice: a critical failure becomes a failure, a failure becomes a success.\n\nThis cuts both ways. A boss with a rank-5 incapacitation spell (effect level 10) still lands fully on level-10 PCs; it only softens against level-11+ targets. And a low-rank *sleep* is worthless against a boss — heighten it or pick something else.\n\nIt is a **trait**, so it appears on monster abilities and items too, not just spells. Always check for it before assuming your save-or-suck landed.',
    seeAlso: ['Spell Rank', 'Degrees of Success', 'Saving Throw', 'Unconscious'],
    aliases: ['incapacitation trait', 'incap'],
  },
  {
    term: 'Reactive Strike',
    kind: 'action',
    short: 'The Remaster name for Attack of Opportunity — a reaction to swing at someone who moves, manipulates, or shoots in your reach.',
    body:
      '**Reactive Strike** is a **reaction**. Trigger: a creature **within your reach** uses a **manipulate** action, uses a **move** action, makes a **ranged attack**, or leaves a square during a move action.\n\nEffect: make a melee **Strike** against that creature. The Strike is made at **no Multiple Attack Penalty** (MAP resets on your turn, and this happens on theirs), and the penalty it does apply does not count toward your next turn.\n\n· If the Strike is a **critical hit** and the trigger was a **manipulate** action, that action is **disrupted** — it fails and its costs are wasted.\n· **Step** (5 feet) is not a move action that triggers it; **Stride** is. This is exactly why Step exists.\n\nCrucially, **not everyone has this**. Unlike PF1 or 5e, PF2 characters have no reactive attack by default — **Fighter** gets it at 1st level, **Champion** at 6th, and others only via specific feats (Barbarian, Ranger, some ancestries). Most monsters do not have it either, and the ones that do are worth respecting.\n\nRemaster renamed it from **Attack of Opportunity**; the mechanics are unchanged.',
    seeAlso: ['Three-Action Economy', 'Multiple Attack Penalty', 'Encounter Mode'],
    aliases: ['AoO', 'attack of opportunity', 'opportunity attack', 'reactive strike'],
  },
  {
    term: 'Recall Knowledge',
    kind: 'action',
    short: 'A single action to ask the GM what you know about a creature, place, or thing — usually a secret check.',
    body:
      '**Recall Knowledge** is a **single action** with the **concentrate** and **secret** traits. You attempt a skill check against a DC set by the subject\'s **level** (with an adjustment if it is obscure).\n\nThe skill depends on the subject:\n\n· **Arcana** — arcane theories, magical beasts, constructs, dragons\n· **Nature** — animals, plants, fey, beasts, the natural world\n· **Religion** — undead, celestials, fiends, divine matters\n· **Occultism** — aberrations, esoterica, spirits\n· **Society** — humanoids, settlements, history, legal codes\n· **Crafting**, **Medicine**, **Lore (X)** — items, ailments, and anything a narrow Lore covers\n\nOutcomes: **critical success** — you learn the answer plus additional information; **success** — one useful piece of information (traditionally its best-known attribute, or a weakness/resistance); **failure** — nothing; **critical failure** — you get **incorrect** information, and because the check is **secret** you won\'t know it\'s wrong.\n\nBecause it is secret, the GM rolls it. You can usually retry, but the GM may raise the DC or rule that you\'ve exhausted what you could recall.',
    seeAlso: ['Level-Based DC', 'Degrees of Success', 'Exploration Mode'],
    aliases: ['recall knowledge', 'RK', 'knowledge check', 'identify creature'],
  },
  {
    term: 'Treat Wounds',
    kind: 'action',
    short: 'A 10-minute Medicine activity that heals a big chunk of HP out of combat, once per hour per patient.',
    body:
      '**Treat Wounds** requires **Medicine** (Trained) and takes **10 minutes**. The base DC is **15**:\n\n· **Critical success** — patient regains **4d8** HP and loses the **Wounded** condition\n· **Success** — patient regains **2d8** HP and loses **Wounded**\n· **Failure** — no effect\n· **Critical failure** — the patient takes **1d8 damage**\n\nYou can raise the DC for more healing if your rank allows: **DC 20** for **+10 HP** (Expert), **DC 30** for **+30 HP** (Master), **DC 40** for **+50 HP** (Legendary). Raising the DC is optional and chosen before you roll.\n\nA creature is **immune to Treat Wounds for 1 hour** afterwards (from anyone). The **Continual Recovery** skill feat drops that to **10 minutes**, and **Battle Medicine** turns it into a single action usable in combat, once per patient per day.\n\nThis is why PF2 parties do not need a dedicated healer to keep pace: with Medicine and 10-minute breaks, a party heals to full between fights, exactly matching the **Refocus** cadence.',
    seeAlso: ['Wounded', 'Dying', 'Focus Point', 'Exploration Mode'],
    aliases: ['treat wounds', 'medicine heal', 'battle medicine'],
  },
  {
    term: 'Encounter Mode',
    kind: 'mechanic',
    short: 'Structured play: initiative, rounds, and three actions a turn.',
    body:
      '**Encounter mode** turns on the moment precision matters — combat, a chase, a tense negotiation the GM wants to time. Play breaks into **rounds** (6 seconds each) and every creature takes a **turn** of **3 actions + 1 reaction**.\n\n· **Initiative** is rolled with whatever skill the situation calls for — usually **Perception**, but **Stealth** if you\'re sneaking in and **Deception** if you\'re opening with a lie. Highest goes first; PCs win ties against NPCs.\n· **Delay** (free action) drops you to a later point in the order permanently; **Ready** (2 actions) sets a trigger for a single action.\n· At the **start** of your turn you regain your actions, MAP resets, and conditions like **Slowed** and **Stunned** take their bite. At the **end** of your turn, **Frightened** ticks down by 1.\n\nExploration activities stop the instant encounter mode starts — whatever you were doing when initiative was rolled shapes your first turn.',
    seeAlso: ['Three-Action Economy', 'Exploration Mode', 'Downtime Mode', 'Multiple Attack Penalty'],
    aliases: ['encounter', 'combat mode', 'initiative', 'rounds'],
  },
  {
    term: 'Exploration Mode',
    kind: 'mechanic',
    short: 'Between fights: you pick one exploration activity and travel at a pace, with time tracked in minutes.',
    body:
      '**Exploration mode** covers moving through the world when there is no round-by-round pressure. You declare **one exploration activity** you are doing while you travel, and it costs you your readiness for other things:\n\n· **Search** — you look for hidden things and traps; you move at half Speed to get the full benefit\n· **Scout** — +1 circumstance bonus to your party\'s initiative\n· **Avoid Notice** — travel using **Stealth**; you roll Stealth for initiative\n· **Detect Magic**, **Investigate**, **Follow the Expert** (borrow an expert ally\'s proficiency), **Repeat a Spell**, **Defend**, **Cover Tracks**\n\nOne activity at a time — this is the trade-off the mode exists to force. The rogue can Search *or* Scout, not both.\n\n**Travel speed** is tracked (25 ft Speed ≈ 20 miles/day); **Refocus** and **Treat Wounds** happen here, both in 10-minute chunks. **Fatigued** blocks exploration activities entirely while you travel.',
    seeAlso: ['Encounter Mode', 'Downtime Mode', 'Treat Wounds', 'Focus Point', 'Fatigued'],
    aliases: ['exploration', 'exploration activity', 'travel'],
  },
  {
    term: 'Downtime Mode',
    kind: 'mechanic',
    short: 'Days or weeks of low-stakes time: craft, earn income, retrain, or run a business.',
    body:
      '**Downtime mode** is the loosest scale — days, weeks, or months pass between adventures. It exists so long-term projects have real rules instead of GM fiat.\n\nCommon downtime activities:\n\n· **Earn Income** — attempt a **Crafting**, **Performance**, **Lore**, or other skill check against a **level-based DC** for the task you found; success pays a per-day rate from the Income Earned table, scaled by your proficiency rank. A critical success pays at the next level up.\n· **Craft** — 4 days of setup, then pay materials and reduce the cost further with additional days.\n· **Retrain** — swap a feat, skill increase, or class choice over days or weeks of practice, with GM approval.\n· **Subsist**, **Treat Disease**, **Create Forgery**, running a business.\n\nDowntime is where your **daily preparations** reset everything: full HP recovery over a night, all spell slots, the whole **focus pool**, and **Doomed** ticking down by 1.',
    seeAlso: ['Exploration Mode', 'Encounter Mode', 'Level-Based DC', 'Doomed'],
    aliases: ['downtime', 'earn income', 'retrain', 'crafting'],
  },

  // ── Conditions ────────────────────────────────────────────────────────────────────────────
  {
    term: 'Blinded',
    kind: 'condition',
    short: 'You cannot see: everything is unseen to you, all terrain is difficult terrain, and sight-based Perception auto-crit-fails.',
    body:
      'You **can\'t see at all**. Mechanically:\n\n· You **automatically critically fail** Perception checks that require sight.\n· If vision was your only precise sense, you take a **−4 status penalty to Perception** overall.\n· **All terrain is difficult terrain** for you (movement costs double).\n· Everything is **undetected** to you unless you have another precise sense; you can Seek to make things **hidden** to you (needing a DC 11 flat check to target).\n· You are **immune to visual effects** — gaze attacks and blinding light do nothing.\n\nBlinded **overrides Dazzled**: while blinded, dazzled has no additional effect.\n\nA blinded creature is not automatically Off-Guard, but a creature it can\'t see is effectively hidden or undetected to it, which usually makes *the blinded creature* Off-Guard to attackers it can\'t perceive. Note the mirror: being unable to see an attacker is what makes you off-guard to it, not the blinded condition itself.',
    seeAlso: ['Dazzled', 'Concealed', 'Off-Guard', 'Deafened'],
    aliases: ['blind', 'blinded'],
  },
  {
    term: 'Clumsy',
    kind: 'condition',
    short: 'Clumsy N gives a −N status penalty to everything Dexterity-based, including AC and Reflex saves.',
    body:
      '**Clumsy N** applies a **status penalty equal to N** to all your **Dexterity-based** checks and DCs. Concretely, that means:\n\n· **AC**\n· **Reflex saves**\n· **Ranged attack rolls** and any Dex-based attack rolls (finesse weapons using Dex)\n· **Acrobatics**, **Stealth**, and **Thievery** checks\n\nClumsy 2 on a rogue is brutal: −2 AC, −2 Reflex, −2 to hit with their rapier, −2 Stealth, all at once.\n\nIt is a **status penalty**, so it does not stack with other status penalties — take the worst. It stacks fine with a **circumstance** penalty like **Off-Guard**\'s −2, which is why an off-guard clumsy 2 creature is at −4 AC.\n\nSources usually state a duration or a way to end it; Clumsy from a spell ends with the spell.',
    seeAlso: ['Enfeebled', 'Stupefied', 'Drained', 'Off-Guard', 'Armor Class'],
    aliases: ['clumsy 1', 'clumsy 2', 'clumsy n'],
  },
  {
    term: 'Concealed',
    kind: 'condition',
    short: 'You are hard to see: attacks against you require a DC 5 flat check to avoid missing.',
    body:
      'You are **concealed** when fog, dim light, or a similar effect makes you hard to make out but does not hide you outright — the attacker knows exactly where you are.\n\n· A creature targeting you must succeed at a **DC 5 flat check** or the attack, spell, or effect **misses/fails**. The flat check is rolled *after* the attack roll hits, and it is a plain d20 with no modifiers.\n· Concealed does **not** make you undetected or hidden — you can still be targeted normally.\n· Concealment does **not** hide you well enough to **Hide**; to become **hidden** you need cover or greater concealment plus a Stealth check.\n\nCompare: **hidden** creatures require a **DC 11** flat check and are **Off-Guard** to the seeker; **undetected** creatures can\'t be targeted at all.\n\n**Dazzled** makes everything concealed *to you*; **Concealed** is a property *of you*.',
    seeAlso: ['Dazzled', 'Blinded', 'Off-Guard'],
    aliases: ['concealment', 'concealed', 'DC 5 flat check'],
  },
  {
    term: 'Confused',
    kind: 'condition',
    short: 'You attack randomly, are off-guard, and can escape it with a DC 11 flat check when damaged.',
    body:
      'You are **confused** — you can\'t think straight and lash out at whatever is nearest.\n\n· You are **Off-Guard**.\n· You **don\'t treat anyone as an ally** (you can be affected by allies\' area effects and they get no protection from you).\n· You **can\'t Delay, Ready, or use reactions**.\n· You must use **all your actions to Strike or cast a damaging spell**, choosing the target **randomly** among the creatures nearest to you. If you can\'t attack anything, you **babble incoherently**, wasting your actions.\n\n**Ending it**: each time you **take damage from an attack or spell**, you can attempt a **DC 11 flat check** — on a success, the confused condition **ends**. That is the whole out: a friendly slap can genuinely snap someone out of it, but only about half the time.\n\nDuration otherwise runs as the source states. Because you can\'t use reactions, a confused Fighter loses their Reactive Strike.',
    seeAlso: ['Off-Guard', 'Fascinated', 'Frightened', 'Stupefied'],
    aliases: ['confusion', 'confused'],
  },
  {
    term: 'Dazzled',
    kind: 'condition',
    short: 'Your vision is washed out: all creatures and objects are concealed from you.',
    body:
      'While **dazzled**, **all creatures and objects are Concealed from you** — which means every time you target something with an attack or effect that requires seeing it, you must succeed at a **DC 5 flat check** or it fails.\n\nThat is the entire effect: no penalty to your rolls, just a **DC 5 flat check** (a 20% failure rate) on everything you aim at. It doesn\'t affect your AC and it doesn\'t make you off-guard.\n\n· **Blinded overrides Dazzled** — if you are blinded, dazzled adds nothing.\n· If you have a **precise non-visual sense** (like a bat\'s echolocation), dazzled is irrelevant for anything that sense can perceive.\n\nDazzled is the common rider on light-based effects and *color spray*-style spells, and the standard consequence of failing a save against a sudden flash.',
    seeAlso: ['Blinded', 'Concealed'],
    aliases: ['dazzle', 'dazzled'],
  },
  {
    term: 'Deafened',
    kind: 'condition',
    short: 'You can\'t hear: sound-based Perception auto-crit-fails, and auditory actions need a DC 5 flat check.',
    body:
      'You **can\'t hear**.\n\n· You **automatically critically fail** Perception checks that require hearing.\n· You take a **−2 status penalty to Perception** for checks that involve sound but also rely on other senses — this includes **initiative** rolled with Perception.\n· If you perform an action with the **auditory** trait, you must succeed at a **DC 5 flat check** or the action is **lost** (its actions and costs are wasted). Bardic compositions, verbal-only shouts, and Demoralize are the usual victims.\n· You are **immune to auditory effects** — a banshee\'s wail or a bard\'s fear song simply cannot touch you.\n\nThat last point makes deafness situationally *desirable*: earplugs are a real tactic against auditory monsters. It also does **not** stop spellcasting: verbal components are the *caster* speaking, not the caster hearing. A deafened wizard casts fine.',
    seeAlso: ['Blinded', 'Stupefied'],
    aliases: ['deaf', 'deafened'],
  },
  {
    term: 'Doomed',
    kind: 'condition',
    short: 'Doomed N lowers the Dying value at which you die, from 4 down to 4 − N.',
    body:
      '**Doomed N** means the **Dying value at which you die is reduced by N**.\n\nNormally you die at **Dying 4**. With **Doomed 1** you die at **Dying 3**; with **Doomed 2** you die at **Dying 2**; **Doomed 3** kills you the instant you reach **Dying 1** — that is, the moment you drop.\n\nIt is otherwise invisible: doomed has **no other mechanical effect**. No penalties, no rolls. It just moves the goalposts on your death, and players routinely forget it is on until it kills them.\n\n**Removing it**: the doomed value **decreases by 1 each time you make your daily preparations** (i.e. after a full night\'s rest). Nothing else removes it short of magic that says so. Doomed 3 is therefore a three-day problem.\n\nIt is the classic rider on death effects, negative-energy bosses, and the *doom*-style curses of the truly unpleasant.',
    seeAlso: ['Dying', 'Wounded', 'Unconscious'],
    aliases: ['doomed 1', 'doomed 2', 'doomed n', 'doom'],
  },
  {
    term: 'Drained',
    kind: 'condition',
    short: 'Drained N costs you level × N Hit Points, lowers your maximum HP by the same amount, and penalizes Constitution checks.',
    body:
      '**Drained N** is life-force loss, and it hits three ways at once:\n\n· A **−N status penalty** to **Constitution-based checks** — most importantly **Fortitude saves**.\n· You **lose Hit Points equal to your level × N**, immediately.\n· Your **maximum Hit Points are reduced by the same amount** for as long as drained lasts.\n\nA 6th-level character hit with **Drained 2** loses **12 HP** and has their maximum lowered by 12. If drained increases later, you only lose the *difference* in HP.\n\n**Recovering**: the drained value **decreases by 1 each time you get a full night\'s rest**. When it does, your **maximum HP goes back up** — but you **do not** automatically regain those Hit Points. You have to heal them normally.\n\nThat asymmetry is the sting: drained is not a debuff you sleep off in one night, it is a hole you must both wait out *and* heal out. It is the signature effect of undead, vampires, and wights.',
    seeAlso: ['Clumsy', 'Enfeebled', 'Stupefied', 'Wounded', 'Treat Wounds'],
    aliases: ['drained 1', 'drained 2', 'drained n', 'drain'],
  },
  {
    term: 'Dying',
    kind: 'condition',
    short: 'Dying N means you are unconscious at 0 HP and rolling recovery checks; at Dying 4 you die.',
    body:
      'You are at **0 Hit Points**, **Unconscious**, and bleeding out. **Dying** always has a value of at least 1, and at **Dying 4 you die** (sooner if **Doomed**).\n\nWhen you drop to 0 HP you gain **Dying 1** — or **Dying 2** if the hit that dropped you was a **critical hit** or you were already Wounded. If you have **Wounded N**, add N to the Dying value you would gain.\n\n**Recovery check** — at the **start of each of your turns** while dying, roll a **flat check against DC 10 + your dying value**:\n\n· **Critical success** — dying **decreases by 2**\n· **Success** — dying **decreases by 1**\n· **Failure** — dying **increases by 1**\n· **Critical failure** — dying **increases by 2**\n\nTaking damage while dying increases the value by **1** (or **2** from a critical hit or a critical failure on a save). If your dying value ever reaches **0**, you lose the dying condition, stay **Unconscious** at 0 HP, and gain **Wounded 1** (or +1 to existing Wounded). Any healing that brings you to **1 HP or more** removes dying immediately — and also gives you **Wounded**.\n\nSpending **all your Hero Points** (min 1) restores you to 1 HP and ends dying.',
    seeAlso: ['Wounded', 'Doomed', 'Unconscious', 'Hero Point', 'Treat Wounds'],
    aliases: ['dying 1', 'dying n', 'bleeding out', 'death', 'recovery check'],
  },
  {
    term: 'Enfeebled',
    kind: 'condition',
    short: 'Enfeebled N gives a −N status penalty to everything Strength-based, including melee damage.',
    body:
      '**Enfeebled N** applies a **status penalty equal to N** to all your **Strength-based** checks and DCs:\n\n· **Melee attack rolls** that use Strength\n· **Strength-based damage rolls** — this is the one that hurts\n· **Athletics** checks (and therefore Trip, Grapple, Shove, Disarm)\n\nA Strength-based fighter with **Enfeebled 2** is at −2 to hit and −2 damage per swing, plus −2 on every maneuver.\n\nIt does **not** affect your Bulk limit or carrying capacity, and it does **not** touch finesse attacks made with Dexterity — an enfeebled rogue attacking with a Dex-based rapier is only losing their Strength damage (which they mostly don\'t have).\n\nStatus penalties don\'t stack with each other; take the highest. Enfeebled is the classic rider on poisons, shadows, and *ray of enfeeblement*-style magic.',
    seeAlso: ['Clumsy', 'Drained', 'Stupefied'],
    aliases: ['enfeebled 1', 'enfeebled 2', 'enfeebled n', 'enfeeble'],
  },
  {
    term: 'Fascinated',
    kind: 'condition',
    short: 'You are transfixed: −2 to Perception and skill checks, and you can\'t concentrate on anything but the fascinating thing.',
    body:
      'Something has your complete attention.\n\n· **−2 status penalty** to **Perception** and **skill checks**.\n· You **can\'t use actions with the concentrate trait** unless the action (or its subject) is **related to the fascinating subject**. That blocks most spellcasting, Recall Knowledge, Seek, and a great deal else.\n\n**Ending it**: the condition **ends immediately if a creature uses hostile actions against you or your allies**. So a fascinated party snaps out the moment the ambush begins — fascination is a *setup* effect, not a combat lock.\n\nOtherwise it lasts as long as its source specifies. Note that fascinated does **not** stop you moving, does not make you off-guard, and doesn\'t stop you Striking — it is far milder than 5e-style charm. Bards\' performances, sirens, and hypnotic patterns are the usual sources.',
    seeAlso: ['Confused', 'Frightened', 'Stupefied'],
    aliases: ['fascinate', 'fascinated'],
  },
  {
    term: 'Fatigued',
    kind: 'condition',
    short: '−1 status penalty to AC and saves, and you can\'t use exploration activities while traveling.',
    body:
      'You are worn out.\n\n· **−1 status penalty** to **AC** and to **all saving throws**.\n· You **can\'t use exploration activities** while traveling — no Searching, no Scouting, no Avoiding Notice. You just walk.\n\nThat is all. Unlike PF1\'s ladder, PF2\'s fatigued is a **single flat step** with no "exhausted" above it and no Strength/Dexterity damage.\n\n**Recovering**: fatigued ends after you **get a full night\'s rest**. It doesn\'t tick down or partially recover — it is binary and it needs sleep. Effects that impose it (forced marches, some poisons, casting past your limits, staying awake too long) all clear the same way.\n\nBecause the exploration-activity block is the practical half of the condition, a fatigued party is a party that gets ambushed.',
    seeAlso: ['Exploration Mode', 'Drained', 'Slowed'],
    aliases: ['fatigue', 'fatigued', 'exhausted', 'tired'],
  },
  {
    term: 'Fleeing',
    kind: 'condition',
    short: 'You must spend all your actions running away from the source, and you can\'t Delay or Ready.',
    body:
      'You are **compelled to run**.\n\n· You must spend **your actions** trying to **escape the source of the fleeing condition** as expediently as possible — take the most direct route away, use your full movement.\n· You **can\'t Delay or Ready**.\n· The source is specified by the effect; if it isn\'t obvious, you flee from its origin.\n\nThe condition **doesn\'t forbid other actions once escape is genuinely impossible** — a cornered creature that literally cannot get further away can act — but as long as running is an option, running is what you do.\n\nUnlike **Frightened**, fleeing carries **no numeric penalty** to your rolls; it steals your turn rather than weakening it. The two often arrive together (a critical failure on a fear save is commonly "frightened 3 and fleeing for 1 round"), but they are separate conditions with separate durations.\n\nFleeing always has a stated duration — read it, because it usually ends much sooner than the frightened that came with it.',
    seeAlso: ['Frightened', 'Confused', 'Encounter Mode'],
    aliases: ['flee', 'fleeing', 'run away'],
  },
  {
    term: 'Frightened',
    kind: 'condition',
    short: 'Frightened N is a −N status penalty to ALL checks and DCs, and it ticks down by 1 at the end of each of your turns.',
    body:
      '**Frightened N** applies a **status penalty equal to N** to **every check and DC you have** — attack rolls, saves, skills, Perception, your AC, your spell DC. It is the broadest debuff in the game, which is why the Intimidation skill is worth building for.\n\n· **At the end of each of your turns, the value decreases by 1.** Frightened 3 lasts about three of your turns and is gone; it is a fading spike, not a lasting condition.\n· Some effects say frightened **can\'t drop below** a value while a condition persists (e.g. "while you remain within the aura"), which suspends the tick-down at that floor.\n\n**Demoralize** (Intimidation vs the target\'s Will DC) inflicts frightened 1, or **frightened 2** on a critical success; the target is then **temporarily immune for 10 minutes**.\n\nStatus penalties don\'t stack — frightened 2 and a −1 status penalty from something else means you take −2, not −3. Frightened is often paired with **Fleeing** on a critical failure.',
    seeAlso: ['Fleeing', 'Fascinated', 'Confused', 'Armor Class'],
    aliases: ['frightened 1', 'frightened 2', 'frightened n', 'fear', 'demoralize', 'shaken'],
  },
  {
    term: 'Grabbed',
    kind: 'condition',
    short: 'You are Immobilized and Off-Guard, and manipulate actions need a DC 5 flat check.',
    body:
      'Something is **holding on to you**.\n\n· You are **Immobilized** (no actions with the **move** trait).\n· You are **Off-Guard** (−2 circumstance penalty to AC).\n· If you attempt a **manipulate** action while grabbed, you must succeed at a **DC 5 flat check** or the action is **lost**. That includes most spellcasting with somatic components, drawing items, and drinking potions.\n\n**Getting out**: use **Escape** (a single action, **attack** trait so it raises your MAP) — roll your unarmed attack modifier, Acrobatics, or Athletics against the grabber\'s DC (usually its Athletics DC or a listed escape DC). Success ends grabbed. Alternatively the grabber\'s condition may end if it is knocked out or lets go, or you can **Force Open** / use other listed escapes.\n\nGrabbed is what a successful **Grapple** (Athletics vs Fortitude DC) inflicts on a success; a **critical success** on Grapple inflicts **Restrained** instead, which is stricter still.',
    seeAlso: ['Immobilized', 'Off-Guard', 'Prone'],
    aliases: ['grab', 'grabbed', 'grapple', 'grappled'],
  },
  {
    term: 'Immobilized',
    kind: 'condition',
    short: 'You can\'t take any action with the move trait — you can act, you just can\'t go anywhere.',
    body:
      'You **can\'t use any action that has the move trait**. That covers **Stride**, **Step**, **Crawl**, **Leap**, **Fly**, **Climb**, **Swim**, and **Burrow**.\n\nYou can still Strike, cast, Interact, Seek, use reactions — everything that isn\'t movement is fine. This is not paralysis.\n\n· If you are immobilized by something **holding you in place** (a grasping vine, a grabbing monster) and another creature tries to **Move** you, that creature must succeed at a check against the **DC of the immobilizing effect**.\n· Immobilized does **not** by itself make you Off-Guard. **Grabbed** does, because grabbed bundles immobilized *plus* off-guard.\n\nThe usual escape is whatever the source specifies — Escape, Athletics to Force Open, or simply ending the effect. Being immobilized while **Restrained** is much worse: restrained also blocks manipulate actions entirely except to Escape.',
    seeAlso: ['Grabbed', 'Prone', 'Slowed'],
    aliases: ['immobilize', 'immobilized', 'restrained', 'held'],
  },
  {
    term: 'Off-Guard',
    kind: 'condition',
    short: 'A −2 circumstance penalty to AC — the Remaster\'s name for what used to be called Flat-Footed.',
    body:
      '**Off-Guard** gives you a **−2 circumstance penalty to AC**. That is the whole condition.\n\nThe Remaster **renamed Flat-Footed to Off-Guard**; the mechanics are identical. If you are reading a pre-Remaster book, "flat-footed" means exactly this. **PF2 has no "flat-footed AC"** as a separate defense — there is one AC, and off-guard modifies it.\n\nCommon sources:\n\n· Being **Flanked** — two enemies on opposite sides of you, both able to act and threatening\n· Being attacked by a creature you can\'t see (it is **hidden** or **undetected** to you)\n· **Prone**, **Grabbed**, **Restrained**, **Confused**, **Unconscious**, and being caught **before you act** in an encounter (via a successful Stealth-based ambush)\n· Rogue and swashbuckler feats that engineer it deliberately\n\nIt matters far beyond the −2: **Sneak Attack** requires the target to be off-guard, and a −2 to AC is also a −2 on the crit threshold, so it converts near-misses into hits and hits into crits.\n\nIt is a **circumstance** penalty, so it stacks with status penalties like **Clumsy**, but not with another circumstance penalty to AC.',
    seeAlso: ['Armor Class', 'Prone', 'Grabbed', 'Clumsy', 'Blinded'],
    aliases: ['flat-footed', 'flat footed', 'off guard', 'offguard', 'flatfooted'],
  },
  {
    term: 'Prone',
    kind: 'condition',
    short: 'You\'re on the ground: off-guard, −2 to attacks, and the only movement you have is Crawl or Stand.',
    body:
      'You are lying on the ground.\n\n· You are **Off-Guard** (−2 circumstance penalty to AC).\n· You take a **−2 circumstance penalty to attack rolls**.\n· The only move actions you can use are **Crawl** (1 action, 5 feet) and **Stand** (1 action, ends prone). **Stand** does not provoke unless something says so, but it costs you a full action.\n· You can **Take Cover** while prone to gain **greater cover** (+4 circumstance to AC) against ranged attacks — hunkering down behind the terrain. That is the reason to *stay* prone.\n· If you are prone while **Climbing** or **Flying**, you **fall**.\n\nA critical success on **Trip** (Athletics vs Reflex DC) knocks a creature prone **and** deals 1d6 bludgeoning; a success just knocks it prone. Note that PF2, unlike some d20s, gives no bonus to melee attackers against prone targets beyond the off-guard −2 to AC.',
    seeAlso: ['Off-Guard', 'Immobilized', 'Unconscious', 'Three-Action Economy'],
    aliases: ['prone', 'knocked down', 'trip', 'knocked prone'],
  },
  {
    term: 'Quickened',
    kind: 'condition',
    short: 'You get 1 extra action at the start of your turn — usually restricted to a specific use.',
    body:
      'You gain **1 additional action at the start of your turn each round**, giving you 4 instead of 3.\n\nThe critical fine print: **most effects that grant quickened restrict what the extra action can be used for**. *Haste* gives an action usable only to **Stride** or **Strike**. A quickening effect from a class feature may only allow a specific activity. Read the source — an unrestricted extra action is rare and very strong.\n\n· Quickened conditions from **different sources do not stack**: you don\'t accumulate extra actions from two haste effects. If two sources give you quickened, you have **one** extra action, and you can use it for **either** of the allowed purposes.\n· The action appears at the **start of your turn**. If something ends quickened mid-turn, you don\'t lose an action you already spent.\n· If you are also **Slowed**, the two partially cancel: apply quickened\'s extra action, then subtract the slowed value from your total.\n\nQuickened is the mirror of **Slowed** and the reason *haste* remains a premier buff.',
    seeAlso: ['Slowed', 'Stunned', 'Three-Action Economy'],
    aliases: ['quicken', 'quickened', 'haste', 'extra action'],
  },
  {
    term: 'Sickened',
    kind: 'condition',
    short: 'Sickened N is a −N status penalty to all checks and DCs; you can spend an action retching to try to shake it off.',
    body:
      '**Sickened N** applies a **status penalty equal to N** to **all your checks and DCs** — the same breadth as Frightened.\n\n· You **can\'t willingly ingest anything** — no potions, no elixirs, no food. This is the difference that makes sickened nastier than it looks: your alchemist can\'t drink their own healing.\n· **Unlike Frightened, sickened does not tick down on its own.**\n\n**Shaking it off**: spend a **single action retching** (it has the manipulate trait) to attempt a **Fortitude save** against the DC of the sickening effect. On a **success** the value **decreases by 1**; on a **critical success** it decreases by **2**. Failing costs you the action for nothing, and a critical failure has no extra penalty. You can try again on later turns.\n\nSo sickened 2 typically costs you two turns\' worth of actions and two Fortitude saves to clear. It is the standard rider on poisons, diseases, and revolting creatures.',
    seeAlso: ['Frightened', 'Drained', 'Saving Throw'],
    aliases: ['sickened 1', 'sickened 2', 'sickened n', 'nauseated', 'retch'],
  },
  {
    term: 'Slowed',
    kind: 'condition',
    short: 'Slowed N means you lose N actions at the start of each of your turns, every turn, until it ends.',
    body:
      '**Slowed N**: at the **start of your turn**, you **lose N actions**. Slowed 1 leaves you with 2 actions; slowed 2 leaves you with 1.\n\n· It **cannot** be used to reduce your **reaction** or your **free actions** — those are untouched.\n· It applies **every turn** for the condition\'s whole duration. This is the key difference from **Stunned**, which has a total pool that drains away.\n· If you are also **Quickened**, add the extra action first, then subtract: quickened + slowed 1 leaves you with 3 actions.\n· **Stunned overrides Slowed**: if both apply on the same turn, use stunned and ignore slowed for that turn.\n\nSlowed 1 for a minute is a bigger deal than it reads — it is a permanent ~33% cut to your turn for the whole fight. The rank-3 spell *slow* is a genuine boss-fight answer, though it carries the **Incapacitation** trait.',
    seeAlso: ['Stunned', 'Quickened', 'Three-Action Economy', 'Incapacitation'],
    aliases: ['slowed 1', 'slowed 2', 'slowed n', 'slow'],
  },
  {
    term: 'Stunned',
    kind: 'condition',
    short: 'Stunned N is a pool of actions you lose — as you lose them, the value drains to 0 and it ends.',
    body:
      '**Stunned N** makes you **lose actions**, but unlike Slowed it has a **total value that reduces as you lose them**.\n\n· At the start of your turn, you lose actions equal to your stunned value, and **stunned decreases by that many**. Stunned 3 on a normal turn: you lose all 3 actions and stunned drops to 0 — you have lost exactly one turn.\n· If your stunned value exceeds your remaining actions, the leftover carries into your next turn. Stunned 5 costs you your whole turn (3), then 2 more actions next turn.\n· It **can\'t** eat your **reaction** or free actions.\n· **Stunned overrides Slowed** on any given turn — apply stunned, ignore slowed.\n\nSome effects instead say "**stunned for 1 minute**" (a duration, not a value). That version costs you **all** your actions for the whole duration — a much worse thing wearing the same name. Read which one you got.\n\nStunned is the signature crit rider of the monk\'s **Stunning Fist** and many big monsters.',
    seeAlso: ['Slowed', 'Quickened', 'Three-Action Economy'],
    aliases: ['stunned 1', 'stunned 3', 'stunned n', 'stun'],
  },
  {
    term: 'Stupefied',
    kind: 'condition',
    short: 'Stupefied N penalizes all mental checks by N and forces a DC 5 + N flat check to cast a spell.',
    body:
      '**Stupefied N** applies a **status penalty equal to N** to all **Intelligence-, Wisdom-, and Charisma-based** checks and DCs:\n\n· **Will saves**\n· **Perception**\n· **Spell attack rolls** and your **spell DC**\n· Int/Wis/Cha skills (Arcana, Nature, Religion, Occultism, Society, Medicine, Deception, Diplomacy, Intimidation, Performance, Crafting, Survival, Lore)\n\nAnd the part that actually decides fights:\n\n· **When you Cast a Spell, you must succeed at a flat check of DC 5 + your stupefied value or the spell is lost** (actions and slot wasted). Stupefied 2 means a **DC 7** flat check — a 30% chance to fritter away a spell slot on every single cast.\n\nThat makes stupefied the premier anti-caster condition. Status penalties don\'t stack; take the highest. It is the common rider on mind-affecting attacks, certain poisons, and *feeblemind*-style magic.',
    seeAlso: ['Clumsy', 'Enfeebled', 'Drained', 'Spell Rank', 'Saving Throw'],
    aliases: ['stupefied 1', 'stupefied 2', 'stupefied n', 'stupefy'],
  },
  {
    term: 'Unconscious',
    kind: 'condition',
    short: 'You can\'t act: −4 to AC, Perception, and Reflex saves, plus blinded, off-guard, and prone.',
    body:
      'You are **asleep or knocked out** and **can\'t act at all**.\n\n· **−4 status penalty** to **AC**, **Perception**, and **Reflex saves**.\n· You are **Blinded** and **Off-Guard**.\n· When you gain the condition you **fall Prone** and **drop what you are holding** — unless the cause was falling asleep normally.\n\n**If you are at 0 Hit Points**, you are unconscious *because* you are **Dying**, and you can\'t wake up until you are healed to at least 1 HP or your dying condition ends (which leaves you unconscious at 0 HP until someone heals or roused you).\n\n**If you have more than 0 Hit Points** (e.g. magical sleep, a nonlethal knockout), you wake when you **take damage**, when someone spends actions to **rouse** you, or when the effect\'s duration ends. A creature waking this way loses the condition immediately.\n\nAn unconscious creature at 0 HP that takes damage has its **Dying value increase**, which is why finishing blows on downed characters are so lethal.',
    seeAlso: ['Dying', 'Prone', 'Blinded', 'Off-Guard', 'Wounded'],
    aliases: ['unconscious', 'knocked out', 'asleep', 'KO'],
  },
  {
    term: 'Wounded',
    kind: 'condition',
    short: 'Wounded N makes every future drop worse: you gain Dying at a value increased by N.',
    body:
      '**Wounded N** does nothing right now — it makes your **next** trip to 0 HP worse.\n\n· **If you gain the Dying condition while wounded, increase your dying value by your wounded value.** Wounded 2 means you start at **Dying 3** instead of Dying 1 — one bad recovery check from death.\n\n**Gaining it**: whenever you **lose the Dying condition**, you become **Wounded 1**, or your wounded value **increases by 1** if you already had it. This is unavoidable: every time the party picks you up, you get more fragile.\n\n**Removing it**:\n\n· Someone successfully **Treats your Wounds** (Medicine, 10 minutes) — success or critical success removes wounded entirely.\n· Or you are **restored to full Hit Points** and **rest for 10 minutes**.\n\nThis is the death spiral PF2 deliberately builds in: the second and third time you go down in a day are far more dangerous than the first, and Medicine is the pressure valve. Compare **Doomed**, which lowers the death threshold instead of raising the starting value.',
    seeAlso: ['Dying', 'Doomed', 'Treat Wounds', 'Unconscious', 'Hero Point'],
    aliases: ['wounded 1', 'wounded n', 'wound'],
  },

  // ── The basic actions of the three-action economy ────────────────────────────────────────────
  // Each of these costs a set number of the three actions you get on your turn. Most Strikes, Stride
  // and Step are the bread and butter; the skill actions below use a skill's proficiency.
  {
    term: 'Strike',
    kind: 'action',
    short: 'One action: make one attack. Your 2nd Strike this turn takes −5, your 3rd −10 (the Multiple Attack Penalty).',
    body:
      '**Strike** is one action ◆: attack one target with a weapon or unarmed attack. Roll **d20 + attack modifier vs the target\'s AC**, reading the four **Degrees of Success** (a nat 20 or beating the DC by 10 is a **critical hit** for double damage).\n\nBecause it is one action, you can Strike up to **three times** in a turn — but each Strike after the first takes the **Multiple Attack Penalty**: **−5** on the second, **−10** on the third (−4/−8 with an agile weapon). Spreading attacks across targets, or trading a third Strike for a maneuver, is the core tactical choice.',
    seeAlso: ['Multiple Attack Penalty', 'Degrees of Success', 'Three-Action Economy', 'Off-Guard'],
    aliases: ['strike', 'attack action', 'make an attack'],
  },
  {
    term: 'Stride',
    kind: 'action',
    short: 'One action: move up to your Speed. Provokes Reactive Strikes from foes that have it.',
    body:
      '**Stride** is one action ◆: move up to your **Speed**. You can Stride up to three times in a turn to cover a lot of ground.\n\nMoving out of a foe\'s reach can trigger a **Reactive Strike** (formerly Attack of Opportunity) — but only creatures that specifically have that reaction get one, which in PF2 is far rarer than in D&D. To move away safely from those, use **Step**.',
    seeAlso: ['Step', 'Reactive Strike', 'Three-Action Economy'],
    aliases: ['stride', 'move', 'movement'],
  },
  {
    term: 'Step',
    kind: 'action',
    short: 'One action: move 5 feet without triggering reactions like Reactive Strike.',
    body:
      '**Step** is one action ◆: move **5 feet** (or 10 with some feats). Unlike Stride, stepping **does not trigger** reactions that are set off by movement, such as **Reactive Strike**.\n\nIt is how you disengage from a dangerous melee foe and still have two actions left to act. You cannot Step into difficult terrain.',
    seeAlso: ['Stride', 'Reactive Strike'],
    aliases: ['step', 'five foot step'],
  },
  {
    term: 'Interact',
    kind: 'action',
    short: 'One action: manipulate an object — draw or stow a weapon, open a door, retrieve an item.',
    body:
      '**Interact** is one action ◆ to manipulate the environment or your gear: **draw or sheathe a weapon**, retrieve an item from your pack, open an unlocked door, pick up an object, and so on.\n\nUnlike D&D\'s "free object interaction," in PF2 each of these **costs an action** — drawing a weapon and attacking is two actions, which is a real part of the turn\'s budget.',
    seeAlso: ['Three-Action Economy', 'Bulk'],
    aliases: ['interact', 'draw weapon', 'manipulate'],
  },
  {
    term: 'Raise a Shield',
    kind: 'action',
    short: 'One action: gain your shield\'s +1 (or more) circumstance bonus to AC until your next turn.',
    body:
      '**Raise a Shield** is one action ◆ (requires a shield): you gain the shield\'s **circumstance bonus to AC** (usually **+1**, +2 for a tower shield) until the start of your next turn.\n\nOnly while raised can you use the **Shield Block** reaction to reduce damage. So the shield loop is: Raise ◆ each turn, then Block ↺ when hit. A raised shield is what makes a defender actually harder to hit.',
    seeAlso: ['Armor Class', 'Reactive Strike'],
    aliases: ['raise a shield', 'raise shield', 'shield block'],
  },
  {
    term: 'Seek',
    kind: 'action',
    short: 'One action: Perception check to find hidden/undetected creatures or objects in an area.',
    body:
      '**Seek** is one action ◆: make a **Perception check** to notice hidden or undetected creatures, or to search an area for objects. On a success you pin down a creature\'s location (making a Hidden creature merely Concealed, or an Undetected one Hidden).\n\nSeek is the active counterpart to a foe\'s **Hide** and **Sneak**, and how you deal with invisibility and ambushes.',
    seeAlso: ['Concealed', 'Off-Guard', 'Recall Knowledge'],
    aliases: ['seek', 'search', 'perception'],
  },
  {
    term: 'Demoralize',
    kind: 'action',
    short: 'One action: Intimidation vs Will DC to make a foe Frightened 1 (2 on a crit).',
    body:
      '**Demoralize** is one action ◆ (Intimidation): choose a foe within 30 feet and roll **Intimidation vs its Will DC**.\n\n· **Critical success** — it becomes **Frightened 2**.\n· **Success** — it becomes **Frightened 1**.\n\nFrightened is a status penalty to everything, so this is a strong "off-turn debuff" a face character throws out. You take a **−4** penalty if you do not share a language, and a target is temporarily immune for **10 minutes** after you try.',
    seeAlso: ['Frightened', 'Off-Guard', 'Recall Knowledge'],
    aliases: ['demoralize', 'intimidate'],
  },
  {
    term: 'Grapple',
    kind: 'action',
    short: 'One action: Athletics vs Fortitude DC to make a foe Grabbed (Restrained on a crit).',
    body:
      '**Grapple** is one action ◆ (Athletics, one free hand): roll **Athletics vs the target\'s Fortitude DC**.\n\n· **Critical success** — the target is **Restrained** until your next turn ends.\n· **Success** — the target is **Grabbed** until your next turn ends.\n· **Critical failure** — you fall Prone or the target can Grapple you.\n\nGrabbed/Restrained impose the **Off-Guard** condition, setting the foe up for allies. Maintaining a grab means grappling again each round.',
    seeAlso: ['Grabbed', 'Immobilized', 'Off-Guard', 'Escape'],
    aliases: ['grapple', 'grab', 'wrestle'],
  },
  {
    term: 'Trip',
    kind: 'action',
    short: 'One action: Athletics vs Reflex DC to knock a foe Prone.',
    body:
      '**Trip** is one action ◆ (Athletics): roll **Athletics vs the target\'s Reflex DC** against a foe within reach.\n\n· **Critical success** — the target falls **Prone** and takes **1d6 bludgeoning**.\n· **Success** — the target falls **Prone**.\n· **Critical failure** — you fall Prone.\n\nProne foes are **Off-Guard** and must spend an action to stand (which can trigger a Reactive Strike). Trip → Strike is a classic martial combo.',
    seeAlso: ['Prone', 'Off-Guard', 'Shove'],
    aliases: ['trip', 'knock down'],
  },
  {
    term: 'Shove',
    kind: 'action',
    short: 'One action: Athletics vs Fortitude DC to push a foe 5 feet (10 on a crit).',
    body:
      '**Shove** is one action ◆ (Athletics): roll **Athletics vs the target\'s Fortitude DC**.\n\n· **Critical success** — push the target **10 feet** and you can Stride after it.\n· **Success** — push the target **5 feet**.\n\nShoving a foe off a ledge, out of an ally\'s reach, or into hazardous terrain is the main use. It moves the target, so it can set off movement-triggered reactions.',
    seeAlso: ['Trip', 'Reactive Strike'],
    aliases: ['shove', 'push'],
  },
  {
    term: 'Escape',
    kind: 'action',
    short: 'One action: break free of Grabbed/Restrained/Immobilized — Unarmed, Athletics, or Acrobatics vs the DC.',
    body:
      '**Escape** is one action ◆ used to get out of the **Grabbed, Restrained, or Immobilized** conditions. Roll your **unarmed attack modifier, Athletics, or Acrobatics** (whichever is best) against the effect\'s DC.\n\n· **Success** — you are free of the condition.\n· **Critical success** — free, plus you can Step for free.\n\nIt is a check, not an attack, so it does not take the Multiple Attack Penalty.',
    seeAlso: ['Grabbed', 'Immobilized', 'Grapple'],
    aliases: ['escape', 'break free'],
  },
  {
    term: 'Aid',
    kind: 'action',
    short: 'Reaction: help an ally\'s check you Prepared for — a success grants them a +1 (or more) circumstance bonus.',
    body:
      '**Aid** is a **reaction** ↺, but you must set it up first: on a previous turn, **Ready to Aid** (an action) and name the check you will help. When your ally attempts it, you roll a check (the DM sets the DC, usually a flat 20 or the same DC).\n\n· **Success** — your ally gets a **+1 circumstance bonus** (+2 if you are a master, +3 legendary).\n· **Critical success** — a larger bonus; **Critical failure** — a −1 penalty.\n\nIt is the teamwork action, and it scales with how good the helper actually is.',
    seeAlso: ['Three-Action Economy', 'Proficiency Rank'],
    aliases: ['aid', 'help', 'assist'],
  },

  // ── Core mechanics ───────────────────────────────────────────────────────────────────────────
  {
    term: 'Flat Check',
    kind: 'mechanic',
    short: 'A d20 roll against a flat DC (no modifiers) to resolve pure chance — a Concealed target, Persistent Damage recovery.',
    body:
      'A **flat check** is a **d20 roll with no modifiers** against a flat DC, used when the outcome is pure luck rather than skill.\n\nThe common ones:\n· **DC 5** — attacking a **Concealed** target (miss on a failure).\n· **DC 11** — attacking a **Hidden** target, or ending **Persistent Damage**.\n· Recovering from being off-balance, targeting through Concealment, and similar.\n\nBecause nothing modifies it, a flat check is the game\'s honest coin-flip.',
    seeAlso: ['Concealed', 'Persistent Damage', 'Degrees of Success'],
    aliases: ['flat check', 'flat dc'],
  },
  {
    term: 'Persistent Damage',
    kind: 'mechanic',
    short: 'Damage that repeats at the end of each of your turns until a DC 15 flat check ends it.',
    body:
      '**Persistent Damage** (bleed, fire, acid…) is dealt again **at the end of each of your turns**. After taking it, attempt a **DC 15 flat check** — on a success it **ends**.\n\nYou or an ally can help: taking a reasonable action to address it (dousing flames, binding a wound) gives you **assisted recovery**, letting you roll the flat check at the start of your turn instead / at a lower DC. It is PF2\'s answer to "damage over time" and can quietly kill a downed character.',
    seeAlso: ['Flat Check', 'Dying', 'Treat Wounds'],
    aliases: ['persistent damage', 'bleed', 'dot', 'damage over time'],
  },
  {
    term: 'Bulk',
    kind: 'mechanic',
    short: 'PF2\'s encumbrance unit: carry (5 + STR mod) Bulk freely; over that you\'re Encumbered; at (10 + STR) you\'re maxed.',
    body:
      '**Bulk** measures how heavy and unwieldy your gear is. You carry up to **5 + your Strength modifier** Bulk with no penalty. Carrying more, up to **10 + your Strength modifier**, makes you **Encumbered** (Clumsy 1 and −10 feet Speed). You cannot carry beyond that maximum.\n\n· Ten **Light** items (marked **L**) = 1 Bulk; negligible items have no Bulk.\n· A typical one-handed weapon is 1 Bulk; heavy armor 4.\n\nIt keeps inventory honest without tracking pounds.',
    seeAlso: ['Interact', 'Clumsy'],
    aliases: ['bulk', 'encumbrance', 'carrying capacity', 'encumbered'],
  },
  {
    term: 'Free Action & Reaction',
    kind: 'mechanic',
    short: 'Beyond your 3 actions: Free Actions (⬦, cost nothing) and one Reaction (↺) per round, taken on a trigger.',
    body:
      'On top of your **three actions** each turn, PF2 has two other kinds:\n\n· **Free Action** (⬦) — costs none of your three. Some have a **trigger** (like an action, but free); others can be taken any time it is your turn. You can take as many as their triggers allow.\n· **Reaction** (↺) — you get **one per round**, and it happens **on a trigger, even on another creature\'s turn** (Shield Block, Reactive Strike, Aid). Once spent, you have none until the start of your next turn.\n\nAn **Activity** (like a two-action spell or Sudden Charge) is a single thing that uses **multiple actions** together, noted ◆◆ or ◆◆◆.',
    seeAlso: ['Three-Action Economy', 'Reactive Strike', 'Raise a Shield'],
    aliases: ['free action', 'reaction', 'activity', 'trigger'],
  },

  // ── The core classes (Player Core) — each at HP/level, key attribute, and signature mechanic ────
  {
    term: 'Alchemist',
    kind: 'class',
    short: '8 HP/level, Key INT. Crafts infused reagents into bombs, elixirs, and mutagens each day via a research field.',
    body:
      'The **Alchemist** (Key attribute **Intelligence**, **8 HP/level**, expert **Fortitude**) makes chemistry a martial art. Each day you get **infused reagents** (level × 2 + INT) to craft **bombs, elixirs, mutagens, and poisons** for free with **Quick Alchemy**.\n\nYour **Research Field** — Bomber, Chirurgeon, Mutagenist, or Toxicologist — shapes what you excel at, and you gain a stream of **class feats** to expand your formula book.',
    seeAlso: ['Three-Action Economy', 'Strike', 'Attribute Boost'],
    aliases: ['alchemist', 'bomber', 'chirurgeon', 'mutagenist'],
  },
  {
    term: 'Barbarian',
    kind: 'class',
    short: '12 HP/level, Key STR. Enters a Rage for bonus damage and temp HP, shaped by an animal/elemental Instinct.',
    body:
      'The **Barbarian** (Key **Strength**, **12 HP/level** — the toughest — expert **Fortitude**) **Rages** (one action ◆) for **bonus damage** and **temporary HP**, at the cost of **−1 AC** and no concentration actions.\n\nYour **Instinct** (Animal, Dragon, Fury, Giant, or Spirit) sets your rage\'s flavor and special abilities. Rage lasts until combat ends or you spend a turn not attacking, then needs a round to recharge.',
    seeAlso: ['Strike', 'Off-Guard', 'Three-Action Economy'],
    aliases: ['barbarian', 'rage', 'instinct'],
  },
  {
    term: 'Bard',
    kind: 'class',
    short: '8 HP/level, Key CHA. A spontaneous occult caster whose Compositions (via a Muse) buff allies and debuff foes.',
    body:
      'The **Bard** (Key **Charisma**, **8 HP/level**, expert **Will**) is a **spontaneous occult** caster who performs **compositions** — most famously **Inspire Courage**, a one-action ◆ cantrip granting allies a status bonus to attacks, damage, and fear saves.\n\nYour **Muse** (Enigma, Maestro, Polymath, or Warrior) grants a bonus focus spell and shapes your feats. You cast from a fixed **spell repertoire** using spell slots.',
    seeAlso: ['Focus Point', 'Spell Rank', 'Recall Knowledge'],
    aliases: ['bard', 'muse', 'composition', 'inspire courage'],
  },
  {
    term: 'Champion',
    kind: 'class',
    short: '10 HP/level, Key STR (or DEX). A heavy-armor holy/unholy warrior with a Reaction tied to a cause and deity.',
    body:
      'The **Champion** (Key **Strength** or Dexterity, **10 HP/level**, expert **Fortitude**, heavy armor) swears to a **deity and a cause** (e.g. **Paladin**, Redeemer, Liberator) that grants a signature **Champion\'s Reaction** — Retributive Strike punishes a foe that harms an ally nearby.\n\nYou channel **Focus** spells (Lay on Hands), gain **Devotion** feats, and eventually a **Blessed Shield / Divine Ally**. Your alignment/edict determines which cause you can take.',
    seeAlso: ['Reactive Strike', 'Raise a Shield', 'Focus Point'],
    aliases: ['champion', 'paladin', 'cause', 'retributive strike'],
  },
  {
    term: 'Cleric',
    kind: 'class',
    short: '8 HP/level, Key WIS. A prepared divine caster with a Divine Font (extra heal/harm slots) shaped by a Doctrine.',
    body:
      'The **Cleric** (Key **Wisdom**, **8 HP/level**, expert **Will**) is a **prepared divine** caster serving a deity. Your **Divine Font** grants extra spell slots of **Heal** or **Harm** (CHA-mod many per day).\n\nYour **Doctrine** — **Cloistered Cleric** (more spellcasting) or **Warpriest** (armor + martial weapons + a resolute front line) — sets your proficiencies. You gain your deity\'s favored weapon and domain focus spells.',
    seeAlso: ['Spell Rank', 'Focus Point', 'Basic Save'],
    aliases: ['cleric', 'divine font', 'doctrine', 'warpriest'],
  },
  {
    term: 'Druid',
    kind: 'class',
    short: '8 HP/level, Key WIS. A prepared primal caster bound to a nature Order and an anathema against despoiling the wild.',
    body:
      'The **Druid** (Key **Wisdom**, **8 HP/level**, expert **Will**) is a **prepared primal** caster sworn to the natural world (an **anathema** forbids using metal armor and teaching druidry to outsiders).\n\nYour **Order** — **Animal** (companion), **Leaf** (plants/healing), **Storm**, **Wild** (Wild Shape), or **Untamed** — grants an order spell and feats. Focus spells (Order Spells) and a beast/plant theme define your play.',
    seeAlso: ['Spell Rank', 'Focus Point', 'Recall Knowledge'],
    aliases: ['druid', 'order', 'wild shape', 'animal companion'],
  },
  {
    term: 'Fighter',
    kind: 'class',
    short: '10 HP/level, Key STR (or DEX). The best attack proficiency in the game, a chosen weapon group, and Reactive Strike at 1.',
    body:
      'The **Fighter** (Key **Strength** or Dexterity, **10 HP/level**, expert **Reflex & Fortitude**) has the **highest attack proficiency** in the game — reaching **legendary** — so it hits more and crits more (a crit is beating AC by 10).\n\nIt gets **Reactive Strike** (Attack of Opportunity) at level 1 (most classes never do), picks a **weapon group** to master, and has the deepest pool of **combat feats** (Power Attack, Double Slice, press attacks). The pure martial baseline every other martial is measured against.',
    seeAlso: ['Strike', 'Reactive Strike', 'Multiple Attack Penalty'],
    aliases: ['fighter', 'reactive strike', 'weapon mastery'],
  },
  {
    term: 'Monk',
    kind: 'class',
    short: '10 HP/level, Key STR or DEX. Unarmored Defense, powerful Flurry unarmed strikes, and stances; expert in all three saves.',
    body:
      'The **Monk** (Key **Strength** or Dexterity, **10 HP/level**, expert in **all three saves** — uniquely) fights with **Flurry of Blows** (two unarmed Strikes for one action ◆, sharing one Multiple Attack Penalty) and **Powerful Fist** (d6+ unarmed dice).\n\nMonk **stances** (Crane, Mountain, Tiger, Wolf, Dragon…) change your unarmed attack and grant bonuses. Some monks take **ki spells** (Ki Strike, Wholeness of Body) as focus spells. Great mobility and saves, no armor.',
    seeAlso: ['Strike', 'Three-Action Economy', 'Basic Save'],
    aliases: ['monk', 'flurry of blows', 'stance', 'ki'],
  },
  {
    term: 'Oracle',
    kind: 'class',
    short: '8 HP/level, Key CHA. A spontaneous divine caster who channels a Mystery — power that deepens as a Curse worsens.',
    body:
      'The **Oracle** (Key **Charisma**, **8 HP/level**, expert **Will**) is a **spontaneous divine** caster who draws on a **Mystery** (Battle, Bones, Cosmos, Flames, Life, Lore, Tempest…). Casting your mystery\'s **revelation** focus spells advances your **Curse**, which grants escalating power alongside escalating drawbacks.\n\nManaging how deep into your curse to go each fight is the Oracle\'s signature tension.',
    seeAlso: ['Focus Point', 'Spell Rank', 'Doomed'],
    aliases: ['oracle', 'mystery', 'curse', 'revelation'],
  },
  {
    term: 'Ranger',
    kind: 'class',
    short: '10 HP/level, Key DEX or STR. Marks Hunt Prey to reduce its Multiple Attack Penalty and Seek/Track it better.',
    body:
      'The **Ranger** (Key **Dexterity** or Strength, **10 HP/level**, expert **Fortitude & Reflex**) uses **Hunt Prey** (one action ◆) to mark a target: against it your **Multiple Attack Penalty is reduced** (via a **Hunter\'s Edge** — Flurry, Precision, or Outwit) and you track and Seek it better.\n\nRangers can take an **animal companion**, snares, and archery or two-weapon feats. A flexible martial that shines when it focuses fire.',
    seeAlso: ['Multiple Attack Penalty', 'Strike', 'Seek'],
    aliases: ['ranger', 'hunt prey', 'hunter\'s edge'],
  },
  {
    term: 'Rogue',
    kind: 'class',
    short: '8 HP/level, Key varies by Racket. Sneak Attack vs off-guard foes, more skills than anyone, and Reflex mastery.',
    body:
      'The **Rogue** (Key attribute set by its **Racket**, **8 HP/level**, expert **Reflex**) deals **Sneak Attack** (1d6, rising to 4d6) whenever it hits an **Off-Guard** target — so it sets foes off-guard by flanking, feinting, or hiding.\n\nIt has **more trained skills than any class** and gains **Skill Increases** every level. Its **Racket** — Ruffian (STR), Scoundrel (CHA), Thief (DEX), Mastermind (INT)… — sets its key attribute and a signature trick. **Surprise Attack** makes foes off-guard in the first round.',
    seeAlso: ['Off-Guard', 'Seek', 'Recall Knowledge'],
    aliases: ['rogue', 'sneak attack', 'racket', 'thief'],
  },
  {
    term: 'Sorcerer',
    kind: 'class',
    short: '6 HP/level, Key CHA. A spontaneous caster whose Bloodline sets its spell tradition and grants bloodline focus spells.',
    body:
      'The **Sorcerer** (Key **Charisma**, **6 HP/level**, expert **Will**) is a **spontaneous** caster whose magic is innate. Its **Bloodline** (Draconic, Angelic, Imperial, Undead, Elemental…) sets which of the **four traditions** (arcane, divine, occult, primal) it casts and grants **bloodline focus spells** plus a granted spell added to its repertoire at each rank.\n\nMore spell slots per rank than a Wizard, but a smaller known repertoire — flexibility of casting for a narrower list.',
    seeAlso: ['Spell Rank', 'Focus Point', 'Basic Save'],
    aliases: ['sorcerer', 'bloodline'],
  },
  {
    term: 'Witch',
    kind: 'class',
    short: '6 HP/level, Key INT. A prepared caster who serves a Patron and channels its magic through a spellcasting Familiar.',
    body:
      'The **Witch** (Key **Intelligence**, **6 HP/level**, expert **Will**) is a **prepared** caster granted magic by a mysterious **Patron**. Its power flows through a **familiar** that stores the day\'s spells and grants abilities; the patron sets your spell **tradition** and a **hex** cantrip focus spell.\n\nWitches lean on debilitating hexes and versatile prepared spellcasting — lose the familiar and you lose access to your day\'s magic, so protecting it matters.',
    seeAlso: ['Spell Rank', 'Focus Point', 'Recall Knowledge'],
    aliases: ['witch', 'patron', 'familiar', 'hex'],
  },
  {
    term: 'Wizard',
    kind: 'class',
    short: '6 HP/level, Key INT. The prepared arcane scholar — a spellbook, an arcane school or thesis, and the widest arcane list.',
    body:
      'The **Wizard** (Key **Intelligence**, **6 HP/level**, expert **Will**) is the **prepared arcane** scholar. It prepares spells each day from a **spellbook** it can expand by copying scrolls and other books.\n\nYour **Arcane Thesis** (Improved Familiar Attunement, Metamagical Experimentation, Spell Blending, Spell Substitution, Staff Nexus) tunes how you cast, and your **Arcane School / curriculum** grants **school focus spells** and an extra prepared slot per rank. The deepest, most flexible spell list in the game.',
    seeAlso: ['Spell Rank', 'Focus Point', 'Recall Knowledge'],
    aliases: ['wizard', 'arcane thesis', 'arcane school', 'spellbook'],
  },
];
