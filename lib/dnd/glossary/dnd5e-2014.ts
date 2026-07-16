// lib/dnd/glossary/dnd5e-2014.ts — terms as the 2014 Player's Handbook defines them.
//
// The shared file holds everything both editions define identically. THIS file holds the ones the
// 2024 revision changed — Exhaustion, Grappled, Prone, Surprise, Unconscious, Inspiration, feats,
// the Ranger/Sorcerer identities. Keeping them apart is the point: "how does exhaustion work" has
// two different correct answers depending on which book is on the table.
import type { SystemGlossary } from './types';
import { DND5E_SHARED_GLOSSARY } from './dnd5e-shared';

const EDITION_2014: SystemGlossary = [
  {
    term: 'Exhaustion',
    kind: 'condition',
    short: '2014: six levels, each with its own escalating penalty, from disadvantage on checks up to death at 6.',
    body: 'In the **2014** rules Exhaustion is measured in **six levels**, and each level adds its own distinct effect **cumulatively**:\n\n· **1** — Disadvantage on **ability checks**\n· **2** — **Speed halved**\n· **3** — Disadvantage on **attack rolls and saving throws**\n· **4** — **Hit point maximum halved**\n· **5** — **Speed reduced to 0**\n· **6** — **Death**\n\nThis is the tiered "staircase" version. It is NOT the 2024 rules, where every level is a flat −2 to d20 rolls.\n\nA **long rest** removes **one level**, provided you have eaten and drunk. Effects that give exhaustion stack levels, and there is no partial recovery.',
    seeAlso: ['Long Rest'],
    aliases: ['exhausted', 'exhaustion levels'],
  },
  {
    term: 'Grappled',
    kind: 'condition',
    short: '2014: speed 0. Escaping is a contested Athletics/Acrobatics check.',
    body: 'A **Grappled** creature has its **speed reduced to 0** and cannot benefit from any bonus to speed.\n\nThat is the entire condition in 2014 — it does **not** impose disadvantage on attacks (that is the 2024 version).\n\nGrappling is a **special melee attack**: use one attack of your Attack action to make a **Strength (Athletics) check contested by the target\'s Strength (Athletics) or Dexterity (Acrobatics)**, its choice. The target must be no more than one size larger than you.\n\nEscaping costs the grappled creature an **action** to repeat the same contest. The grapple ends if you are Incapacitated, or if an effect moves either of you apart.',
    seeAlso: ['Restrained', 'Prone'],
    aliases: ['grapple', 'grappling'],
  },
  {
    term: 'Prone',
    kind: 'condition',
    short: '2014: crawl at half speed; your attacks have disadvantage; melee attacks against you have advantage, ranged have disadvantage.',
    body: 'A **Prone** creature:\n\n· can only **crawl** (each foot costs an extra foot of movement) unless it stands up\n· has **disadvantage** on its attack rolls\n· is attacked with **advantage** if the attacker is **within 5 feet**, and with **disadvantage** otherwise\n\nStanding up costs **half your speed**. That ranged clause is the reason going prone against archers is a real tactic.\n\nYou can **knock a creature prone** with a **Shove** — one attack from your Attack action, a Strength (Athletics) check contested by the target\'s Athletics or Acrobatics.',
    seeAlso: ['Grappled', 'Advantage'],
    aliases: ['prone', 'knocked down', 'shove'],
  },
  {
    term: 'Unconscious',
    kind: 'condition',
    short: '2014: incapacitated, prone, drop everything, auto-fail STR/DEX saves; melee hits within 5 ft are critical.',
    body: 'An **Unconscious** creature:\n\n· is **Incapacitated**, **cannot move or speak**, and is **unaware of its surroundings**\n· **drops whatever it is holding** and falls **Prone**\n· **automatically fails Strength and Dexterity saving throws**\n· is attacked with **advantage**\n· **any attack that hits it from within 5 feet is a critical hit**\n\nThis is why a downed character next to an enemy is in genuine danger: each hit is a crit, and a hit at 0 HP costs **two** death save failures.',
    seeAlso: ['Death Saving Throw', 'Incapacitated', 'Prone'],
    aliases: ['unconscious', 'knocked out', 'ko'],
  },
  {
    term: 'Surprise',
    kind: 'mechanic',
    short: '2014: a surprised creature cannot move or act on its first turn, and cannot react until that turn ends.',
    body: 'In **2014**, surprise is a **condition of the first round**, not an initiative modifier.\n\nThe DM compares each hiding creature\'s **Dexterity (Stealth)** to the **passive Perception** of each opponent. Any creature that fails to notice a threat is **surprised** at the start of the encounter.\n\nA surprised creature **cannot move or take an action on its first turn**, and **cannot take a reaction until that turn ends**. Note it is per-creature: some of the party can be surprised while others are not.\n\nThis is NOT the 2024 rule, which instead gives surprised creatures **disadvantage on their initiative roll** and lets them act normally.',
    seeAlso: ['Initiative'],
    aliases: ['surprised', 'surprise round', 'ambush'],
  },
  {
    term: 'Inspiration',
    kind: 'mechanic',
    short: '2014: a binary you-have-it-or-not token, spent for advantage on any one d20 roll.',
    body: '**Inspiration** in 2014 is a simple flag: you either **have it or you do not** — you cannot stockpile it.\n\nThe DM grants it for playing to your **personality trait, ideal, bond or flaw**. Spend it to give yourself **advantage on one attack roll, saving throw or ability check**.\n\nYou can also **give your inspiration to another player** who you feel earned it. In 2024 this is renamed **Heroic Inspiration** and works by letting you **reroll** a d20 instead.',
    seeAlso: ['Advantage'],
    aliases: ['inspiration point', 'bardic'],
  },
  {
    term: 'Feat',
    kind: 'feature',
    short: '2014: an OPTIONAL rule — you trade an entire Ability Score Improvement for one.',
    body: 'Feats in 2014 are explicitly an **optional rule** the DM must allow, and there is no free one at level 1.\n\nWhen a class grants an **Ability Score Improvement** (typically levels **4, 8, 12, 16, 19**), you may instead take **one feat**. It is the whole ASI — you give up +2 to one ability or +1 to two.\n\nSome feats grant a **+1 ability increase** alongside their benefit ("half feats"), which softens the trade. There are no **Origin feats**, no **Epic Boons** at 19, and no feat categories — that structure is the 2024 revision.',
    seeAlso: ['Ability Score Improvement'],
    aliases: ['feats'],
  },
  {
    term: 'Ability Score Improvement',
    kind: 'feature',
    short: '2014: at 4/8/12/16/19, raise one ability by 2 or two abilities by 1 — or take a feat instead.',
    body: 'Most classes grant an **Ability Score Improvement** at levels **4, 8, 12, 16 and 19**. Fighters get extra ones at **6 and 14**; Rogues get one at **10**.\n\nYou may **increase one ability score by 2**, or **two ability scores by 1 each**. No score can exceed **20** this way.\n\nIf your table uses the optional **feat** rule, you can take a feat instead. Multiclassing uses **class** levels for ASIs, not character level — a common way to lose them by accident.',
    seeAlso: ['Feat', 'Proficiency Bonus'],
    aliases: ['asi'],
  },
  {
    term: 'Ranger',
    kind: 'class',
    short: '2014: a half-caster with Favored Enemy and Natural Explorer — the edition’s most-criticised class.',
    body: 'The **2014 Ranger** is a d10 half-caster with **Favored Enemy** and **Natural Explorer** at level 1.\n\nBoth are famously narrow: they key to a **chosen creature type or terrain** and do nothing outside it. This is the class the designers themselves revisited repeatedly (Tasha\'s offers replacement options like Deft Explorer and Favored Foe).\n\n· **Hit die** d10 · **Key ability** DEX (or STR) · **Saves** STR & DEX\n· **Fighting Style** at 2, **spellcasting** from 2 (WIS, half-caster)\n· **Extra Attack** at 5, **Land\'s Stride** at 8, **Hide in Plain Sight** at 10\n\nThe 2024 Ranger drops Favored Enemy entirely and gives Hunter\'s Mark for free — a genuinely different class.',
    seeAlso: ['Feat'],
    aliases: ['favored enemy', 'natural explorer'],
  },
  {
    term: 'Skill',
    kind: 'mechanic',
    short: 'The 18 skills, each tied to one ability by default.',
    body: 'There are **18 skills**, each with a default governing ability:\n\n· **STR** — Athletics\n· **DEX** — Acrobatics, Sleight of Hand, Stealth\n· **INT** — Arcana, History, Investigation, Nature, Religion\n· **WIS** — Animal Handling, Insight, Medicine, Perception, Survival\n· **CHA** — Deception, Intimidation, Performance, Persuasion\n\nProficiency in a skill adds your **proficiency bonus** to checks made with it. **Constitution has no skills** — it is the only ability that never has one.\n\nThe pairing is a default, not a law: the DM can call for **Strength (Intimidation)** or **Intelligence (Perception)** when the fiction fits.',
    seeAlso: ['Proficiency Bonus', 'Expertise', 'Ability Check'],
    aliases: ['skills', 'skill list'],
  },
  {
    term: 'Passive Perception',
    kind: 'term',
    short: '10 + your Perception modifier — what you notice without looking.',
    body: '**Passive Perception** = **10 + your Wisdom (Perception) modifier** (including proficiency and Expertise if you have them).\n\nIt is a **floor, not a roll**: it is what you notice without actively searching. Advantage on Perception adds **+5**; disadvantage subtracts **5**.\n\nThe DM compares a hiding creature\'s **Stealth check** against it, usually without telling you — which is exactly why it is passive.',
    seeAlso: ['Skill', 'Surprise'],
    aliases: ['passive perception', 'pp', 'passive'],
  },
];

export const DND5E_2014_GLOSSARY: SystemGlossary = [...DND5E_SHARED_GLOSSARY, ...EDITION_2014];
