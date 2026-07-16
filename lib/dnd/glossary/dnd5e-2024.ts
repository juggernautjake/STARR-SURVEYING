// lib/dnd/glossary/dnd5e-2024.ts — terms as the 2024 Player's Handbook defines them.
//
// The shared file holds everything both editions define identically. THIS file holds what the 2024
// revision CHANGED. Every entry here is a place where quoting the 2014 book at a 2024 table (or
// vice versa) gives a genuinely wrong answer — Exhaustion and Surprise most of all.
import type { SystemGlossary } from './types';
import { DND5E_SHARED_GLOSSARY } from './dnd5e-shared';

const EDITION_2024: SystemGlossary = [
  {
    term: 'Exhaustion',
    kind: 'condition',
    short: '2024: each level is a flat −2 to d20 rolls and −5 ft speed; you die at 6.',
    body: 'The **2024** rules replace the 2014 staircase with one simple rule. While you have Exhaustion:\n\n· **−2 × your exhaustion level** to **every d20 Test** (ability checks, attack rolls, saving throws)\n· **−5 feet × your exhaustion level** to your **Speed**\n· at **level 6**, you **die**\n\nThat is all of it — no halved HP maximum, no speed-0 tier. It is a smooth ramp instead of six different rules.\n\nA **long rest** removes **one level**. This is NOT the 2014 version, where level 1 is disadvantage on checks, level 2 halves speed, level 4 halves your HP maximum, and so on.',
    seeAlso: ['Long Rest'],
    aliases: ['exhausted', 'exhaustion levels'],
  },
  {
    term: 'Grappled',
    kind: 'condition',
    short: '2024: speed 0 AND disadvantage on attacks against anyone but the grappler.',
    body: 'A **Grappled** creature:\n\n· has **Speed 0** and cannot benefit from bonuses to speed\n· has **disadvantage on attack rolls** against any target **other than the grappler**\n· **moves with the grappler** when it moves (at half speed, unless the grappler is two sizes larger)\n\nThe disadvantage clause is new in 2024 — in 2014 Grappled was speed 0 and nothing else.\n\nGrappling is now the **Unarmed Strike: Grapple** option, and the target makes a **saving throw** (STR or DEX, its choice) against **8 + your STR modifier + your proficiency bonus** — it is no longer a contested check. Escaping costs the target an action to repeat the save.',
    seeAlso: ['Prone', 'Restrained', 'Unarmed Strike'],
    aliases: ['grapple', 'grappling'],
  },
  {
    term: 'Prone',
    kind: 'condition',
    short: '2024: crawl at half speed; your attacks have disadvantage; attacks within 5 ft have advantage, beyond have disadvantage.',
    body: 'A **Prone** creature:\n\n· can only **crawl** (each foot of movement costs an extra foot) unless it stands\n· has **disadvantage** on its **attack rolls**\n· is attacked with **advantage** if the attacker is **within 5 feet**, and with **disadvantage** otherwise\n\nStanding up costs **half your Speed**.\n\nIn 2024 you knock a target prone with the **Unarmed Strike: Shove** option — the target makes a **STR or DEX save** against **8 + your STR modifier + your proficiency bonus**, rather than the 2014 contested check. Shove can instead push the target 5 feet.',
    seeAlso: ['Grappled', 'Unarmed Strike'],
    aliases: ['prone', 'knocked down', 'shove'],
  },
  {
    term: 'Unconscious',
    kind: 'condition',
    short: '2024: incapacitated, prone, drop everything, auto-fail STR/DEX saves; hits within 5 ft are critical.',
    body: 'An **Unconscious** creature:\n\n· is **Incapacitated**, **cannot move or speak**, and is **unaware of its surroundings**\n· **drops whatever it is holding** and falls **Prone**\n· **automatically fails Strength and Dexterity saving throws**\n· is attacked with **advantage**\n· **any attack that hits it from within 5 feet is a critical hit**\n\nMechanically unchanged from 2014 — but note it now sits alongside the 2024 Exhaustion rules, so a character revived at 0 HP is not carrying the old tiered penalties.',
    seeAlso: ['Death Saving Throw', 'Incapacitated', 'Exhaustion'],
    aliases: ['unconscious', 'knocked out', 'ko'],
  },
  {
    term: 'Surprise',
    kind: 'mechanic',
    short: '2024: surprise gives DISADVANTAGE ON INITIATIVE — you are not frozen for a round.',
    body: 'The **2024** rules rewrote surprise completely. A surprised creature now has **disadvantage on its Initiative roll** — and that is the entire effect.\n\nIt **acts normally on its turn**: it can move, take actions and take reactions. There is no lost round.\n\nThis is one of the biggest single changes between editions. In **2014**, a surprised creature **cannot move or act on its first turn and cannot react until that turn ends** — a full turn gone. Quoting the wrong one materially changes an ambush.',
    seeAlso: ['Initiative'],
    aliases: ['surprised', 'surprise round', 'ambush'],
  },
  {
    term: 'Heroic Inspiration',
    kind: 'mechanic',
    short: '2024: spend it to REROLL a d20 — you either have it or you do not.',
    body: '**Heroic Inspiration** (the 2024 name) lets you **reroll a d20** immediately and **must use the new roll**.\n\nThat is a real change from 2014, where Inspiration granted **advantage** on a roll you had not made yet. Rerolling after seeing the result is more reliable in practice.\n\nYou either have it or you do not — it does not stack. If you gain it while you already have it, nothing happens. **Humans** get it back on every long rest as a species trait.',
    seeAlso: ['Advantage'],
    aliases: ['inspiration', 'hero inspiration'],
  },
  {
    term: 'Weapon Mastery',
    kind: 'feature',
    short: '2024 only: martials unlock a weapon’s mastery property — Cleave, Graze, Nick, Push, Sap, Slow, Topple, Vex.',
    body: '**Weapon Mastery** is new in 2024. Martial classes gain mastery of a number of weapons and get that weapon\'s **mastery property** whenever they attack with it. The eight:\n\n· **Cleave** — a hit with a Heavy melee weapon lets you attack a second creature within 5 ft of the first\n· **Graze** — on a **miss**, deal damage equal to your ability modifier\n· **Nick** — the extra Light-weapon attack becomes part of your Attack action, not a bonus action\n· **Push** — push the target up to 10 feet away\n· **Sap** — the target has **disadvantage** on its next attack roll\n· **Slow** — reduce the target\'s Speed by 10 feet\n· **Topple** — the target makes a CON save or is knocked **Prone**\n· **Vex** — you have **advantage** on your next attack against that target\n\nFighters get the most; Barbarians, Paladins, Rangers and Rogues get some. **This does not exist in 2014 at all.**',
    seeAlso: ['Attack Roll', 'Prone'],
    aliases: ['mastery', 'weapon masteries', 'cleave', 'graze', 'vex', 'topple'],
  },
  {
    term: 'Origin Feat',
    kind: 'feature',
    short: '2024 only: every character gets a free feat at level 1, from their background.',
    body: 'In **2024**, feats are a **core rule**, not optional, and every character starts with one: your **background grants an Origin feat** at level 1.\n\nThe origin feats include **Alert**, **Healer**, **Lucky**, **Magic Initiate**, **Musician**, **Savage Attacker**, **Skilled**, **Tavern Brawler** and **Tough**.\n\nFeats are now sorted into categories — **Origin**, **General** (the ones you take with an ASI at 4/8/12/16), **Fighting Style**, and **Epic Boon** (level 19). **None of this exists in 2014**, where feats are optional and there is no free level-1 feat.',
    seeAlso: ['Feat', 'Background', 'Ability Score Improvement'],
    aliases: ['origin feats', 'level 1 feat'],
  },
  {
    term: 'Feat',
    kind: 'feature',
    short: '2024: a CORE rule, in four categories, with a free Origin feat at level 1.',
    body: 'Feats in 2024 are a **core part of character creation**, not an optional module, and they are **categorised**:\n\n· **Origin** — one free at level 1 from your **background**\n· **General** — taken in place of an **Ability Score Improvement** at **4, 8, 12, 16** (plus class extras). Each has a **prerequisite of level 4+** and nearly all grant **+1 to an ability score**\n· **Fighting Style** — now feats, granted by the martial classes\n· **Epic Boon** — taken at **level 19**, and they can push an ability score to **30**\n\nMost General feats now include their own ability bump, so taking one costs much less than the 2014 all-or-nothing ASI trade. Feats can be taken **only once** unless they say otherwise.',
    seeAlso: ['Origin Feat', 'Ability Score Improvement'],
    aliases: ['feats', 'general feat', 'epic boon'],
  },
  {
    term: 'Ability Score Improvement',
    kind: 'feature',
    short: '2024: at 4/8/12/16 (+19 Epic Boon), raise one ability by 2 or two by 1 — or take a General feat.',
    body: 'In 2024 the **Ability Score Improvement** is itself presented as a **feat** you can take at **levels 4, 8, 12 and 16** (Fighters and Rogues get extras).\n\nIt gives **+2 to one ability** or **+1 to two abilities**, to a maximum of **20**. The alternative is any **General feat** — and since most General feats carry their own +1, the choice is far less lopsided than in 2014.\n\nAt **level 19** every class takes an **Epic Boon** instead, which can raise a score to **30**. 2014 has no Epic Boons and puts its last ASI at 19.',
    seeAlso: ['Feat', 'Origin Feat'],
    aliases: ['asi'],
  },
  {
    term: 'Background',
    kind: 'feature',
    short: '2024: backgrounds now grant your ability score increases, an Origin feat, skills and a tool.',
    body: 'Backgrounds do far more work in **2024**. Each one grants:\n\n· **+3 to abilities** — either +2/+1 to two of its three listed abilities, or +1/+1/+1 across all three\n· an **Origin feat**\n· **two skill proficiencies**\n· **one tool proficiency**\n· starting **equipment** (or 50 GP)\n\nThis is the big structural change: **species no longer give ability score increases** — your background does. A 2014 character gets its +2/+1 from its race, which is exactly the wrong answer at a 2024 table.\n\nExample — **Farmer**: Strength, Constitution, Wisdom · **Tough** feat · Animal Handling and Nature · Carpenter\'s Tools.',
    seeAlso: ['Origin Feat', 'Species'],
    aliases: ['backgrounds', 'origin'],
  },
  {
    term: 'Species',
    kind: 'feature',
    short: '2024: species give traits ONLY — never ability score increases (those come from your background).',
    body: 'In 2024 the term is **species**, not race, and — the key rule — **a species grants no ability score increases**. Those come from your **background**.\n\nSpecies now give **traits only**, plus a size and a speed. Each has a **Creature Type** and most have a **Darkvision** or resistance package.\n\nThe 2024 PHB list: **Aasimar, Dragonborn, Dwarf, Elf, Gnome, Goliath, Halfling, Human, Orc, Tiefling**. Standalone **Half-Elf** and **Half-Orc** are gone (folded into Elf/Orc + background choices), while **Aasimar, Goliath and Orc** are new to the core list.\n\nHuman\'s traits: **Resourceful** (Heroic Inspiration on a long rest), **Skillful** (a free skill proficiency), **Versatile** (a free Origin feat).',
    seeAlso: ['Background', 'Heroic Inspiration'],
    aliases: ['race', 'races', 'lineage'],
  },
  {
    term: 'Unarmed Strike',
    kind: 'action',
    short: '2024: choose Damage, Grapple or Shove each time — it is no longer just a punch.',
    body: 'The 2024 **Unarmed Strike** is a menu. Each time you make one, choose **one**:\n\n· **Damage** — an attack roll; on a hit, **1 + STR modifier** bludgeoning damage\n· **Grapple** — the target makes a **STR or DEX save** vs **8 + your STR mod + your proficiency bonus** or is **Grappled**\n· **Shove** — same save; on a failure, push it **5 feet** or knock it **Prone**\n\nGrapple and Shove are **saving throws now**, not the 2014 contested Athletics checks — a real change, because it means the target\'s own skill no longer matters.\n\nThe target must be no more than **one size larger** than you, and you need a free hand.',
    seeAlso: ['Grappled', 'Prone', 'Attack Roll'],
    aliases: ['unarmed', 'punch', 'grapple', 'shove'],
  },
  {
    term: 'Skill',
    kind: 'mechanic',
    short: 'The same 18 skills as 2014, each tied to one ability by default.',
    body: 'The **18 skills** and their governing abilities are **unchanged** from 2014:\n\n· **STR** — Athletics\n· **DEX** — Acrobatics, Sleight of Hand, Stealth\n· **INT** — Arcana, History, Investigation, Nature, Religion\n· **WIS** — Animal Handling, Insight, Medicine, Perception, Survival\n· **CHA** — Deception, Intimidation, Performance, Persuasion\n\n**Constitution has no skills.** What changed is where proficiencies come from: **backgrounds** now reliably give two, and species give none.\n\nThe 2024 book leans harder on the DM choosing the ability and the skill separately — Strength (Intimidation) is explicitly supported.',
    seeAlso: ['Proficiency Bonus', 'Expertise', 'Background'],
    aliases: ['skills', 'skill list'],
  },
  {
    term: 'Passive Perception',
    kind: 'term',
    short: '10 + your Perception modifier — what you notice without looking.',
    body: '**Passive Perception** = **10 + your Wisdom (Perception) modifier**, including proficiency and Expertise.\n\nIt is a floor rather than a roll — what you notice without searching. **Advantage** on Perception adds **+5**, **disadvantage** subtracts **5**.\n\nIn 2024 it matters slightly less for ambushes than it did, because surprise now only costs you initiative advantage rather than your whole first turn.',
    seeAlso: ['Skill', 'Surprise'],
    aliases: ['passive perception', 'pp', 'passive'],
  },
];

export const DND5E_2024_GLOSSARY: SystemGlossary = [...DND5E_SHARED_GLOSSARY, ...EDITION_2024];
