// lib/dnd/glossary/intuitive-games.ts — the searchable library for Intuitive Games (intuitivegames.net).
//
// IG has a rich builder-side content module (systems/intuitive-games/content.ts) and a rules engine
// (systems/intuitive-games/rules.ts), but the LIBRARY search + Ask-the-Librarian read from the
// glossary. This file gives IG the same searchable, fully-explained articles the other focus systems
// have — authored from the engine's own numbers (igProficiency = level, igDegreeOfSuccess, igSaveTotal,
// igMaxHp) and the content module, so nothing here is invented (Ground Rule 3).
import type { SystemGlossary } from './types';

export const INTUITIVE_GAMES_GLOSSARY: SystemGlossary = [
  {
    term: 'Core Roll',
    kind: 'mechanic',
    short: 'Roll d20 + ability modifier + proficiency (your level) + misc vs a DC, then read the Degrees of Success.',
    body:
      'Intuitive Games resolves almost everything with **d20 + your ability modifier + proficiency + misc modifiers** against a **DC**, and reads the result on four **Degrees of Success**.\n\n· **Proficiency equals your level** — there is no separate proficiency-bonus table (see **Proficiency**).\n· A **natural 20** steps your result up one degree; a **natural 1** steps it down one.\n\nIt is a d20 system for levels **1–10** with a **three-action economy** and a strong stance/positioning game.',
    seeAlso: ['Degrees of Success', 'Proficiency', 'Three-Action Economy'],
    aliases: ['core roll', 'd20', 'check', 'roll'],
  },
  {
    term: 'Degrees of Success',
    kind: 'mechanic',
    short: 'Beat the DC by 10 = critical success; meet it = success; miss by 10 = critical failure; else failure.',
    body:
      'Every roll reads on **four degrees**, from your total vs the DC:\n\n· **Critical success** — total is **DC + 10 or higher**.\n· **Success** — total is **DC or higher**.\n· **Failure** — total is **below the DC**.\n· **Critical failure** — total is **DC − 10 or lower**.\n\nThen adjust by the die: a **natural 20 steps up one degree**, a **natural 1 steps down one**. So a nat 20 that only meets the DC becomes a critical success, and a nat 1 on a clear success drops to a plain success.',
    seeAlso: ['Core Roll', 'Attack', 'Saving Throw'],
    aliases: ['degrees of success', 'critical success', 'critical failure', 'crit'],
  },
  {
    term: 'Three-Action Economy',
    kind: 'mechanic',
    short: 'Each turn you have three actions to spend, plus one Reaction and free actions. Actions cost Single/Double/Triple.',
    body:
      'On your turn you have **three actions**, plus **one Reaction** and any **free actions**. Each thing you do lists its cost:\n\n· **Single (◆)** — Attack, Interact, Stride, Step, Support Ally, a Combat Skill, Direct Companion Creature.\n· **Double (◆◆)** — Redistribution, some boosted Combat Skills.\n· **Triple (◆◆◆)** — big feat activities.\n· **Reaction (↺)** — a Defensive Power, Attack of Opportunity (and feats like Parry, Bodyguard).\n· **Free** — Talking, Quick Draw.\n\nSpreading three Single actions across attacks, movement and maneuvers — and holding your Reaction — is the core tactical decision.',
    seeAlso: ['Attack', 'Stride', 'Step', 'Combat Skills', 'Attack of Opportunity'],
    aliases: ['action economy', 'three actions', 'three-action economy', 'actions'],
  },
  {
    term: 'Proficiency',
    kind: 'mechanic',
    short: 'Your proficiency bonus IS your level — no separate table. It is added to rolls you are trained in.',
    body:
      'In Intuitive Games, **your proficiency equals your character level** (minimum 1). Where D&D looks up a proficiency bonus and Pathfinder adds a rank, IG just adds your **level** to anything you are proficient/trained in.\n\nBecause levels run **1–10**, this keeps the math tight: a level-10 expert adds +10 to their trained rolls. Saves and skills add their **rank** on top of level (see **Saving Throw**).',
    seeAlso: ['Core Roll', 'Saving Throw', 'Combat Skills'],
    aliases: ['proficiency', 'proficiency bonus', 'training'],
  },
  {
    term: 'Saving Throw',
    kind: 'term',
    short: 'Three saves (Fortitude/Reflex/Will). Total = save rank + your level + governing ability modifier + misc.',
    body:
      'IG uses **three saving throws** — **Fortitude, Reflex, and Will**. Your bonus to a save is:\n\n**save rank + your level + the governing ability modifier + misc**.\n\nSo saves scale with level automatically (proficiency = level), with the **rank** you have invested and your ability modifier on top. You roll d20 + that total vs the effect\'s DC and read the Degrees of Success.',
    seeAlso: ['Core Roll', 'Degrees of Success', 'Proficiency'],
    aliases: ['saving throw', 'save', 'fortitude', 'reflex', 'will'],
  },
  {
    term: 'Hit Points',
    kind: 'term',
    short: 'Max HP = your Class + Background HP, plus your Constitution modifier × your level.',
    body:
      'Your **maximum Hit Points** = **(Class + Background HP) + (Constitution modifier × your level)**.\n\nBecause the Constitution part multiplies by level, CON is a steady contributor all the way to level 10, not just a one-time bonus. At 0 HP you are in danger of the death spiral — the **Death Spiral** action (a feat) and defensive play exist to manage it.',
    seeAlso: ['Saving Throw', 'Stances'],
    aliases: ['hit points', 'hp', 'health'],
  },
  {
    term: 'Attack',
    kind: 'action',
    short: 'A Single action: d20 + ability mod + proficiency (+ focus/bonuses) vs the target; read the Degrees of Success.',
    body:
      'An **Attack** is a **Single action ◆**. Your attack bonus = **ability modifier + proficiency (your level, if proficient) + weapon focus + other bonuses**. Roll against the target\'s defense and read the **Degrees of Success** — a **critical success** (beat by 10, or a nat 20 stepping up) means extra effect.\n\nWith three actions you can attack multiple times, or trade attacks for movement, a **Combat Skill**, or **Support Ally**.',
    seeAlso: ['Degrees of Success', 'Three-Action Economy', 'Combat Skills', 'Stances'],
    aliases: ['attack', 'strike', 'make an attack'],
  },
  {
    term: 'Stride',
    kind: 'action',
    short: 'A Single action: move up to your Speed.',
    body: 'A **Stride** is a **Single action ◆**: move up to your **Speed**. You can Stride more than once in a turn to cover ground, but moving out of a foe\'s reach can provoke an **Attack of Opportunity** from those who have that reaction — use **Step** to move safely.',
    seeAlso: ['Step', 'Attack of Opportunity', 'Three-Action Economy'],
    aliases: ['stride', 'move', 'movement'],
  },
  {
    term: 'Step',
    kind: 'action',
    short: 'A Single action: a careful short move that does not provoke Attacks of Opportunity.',
    body: 'A **Step** is a **Single action ◆**: a short, careful move that **does not provoke Attacks of Opportunity**. It is how you disengage from a dangerous foe and still have actions left to act. A **Mobile** or **Shifting** stance changes how movement and reactions interact around you.',
    seeAlso: ['Stride', 'Attack of Opportunity', 'Stances'],
    aliases: ['step', 'careful step'],
  },
  {
    term: 'Combat Skills',
    kind: 'action',
    short: 'A Single (or Double) action: a maneuver — Trip, Grapple, Disarm, Feint, Shove/Reposition, Sunder, Steal, Dirty Trick, Overrun.',
    body:
      'A **Combat Skill** is a maneuver you attempt in place of an attack, usually a **Single action ◆** (some can be pushed to **Double ◆◆** for a stronger effect). The set:\n\n· **Trip, Grapple, Disarm, Feint, Reposition, Overrun, Steal, Sunder, Dirty Trick**.\n\nYou roll your trained combat-skill check and read the **Degrees of Success** against the target — a critical success is a bigger effect, a critical failure can rebound on you. Several **stances** (Menacing, Precise) boost combat skills.',
    seeAlso: ['Attack', 'Degrees of Success', 'Stances'],
    aliases: ['combat skills', 'maneuver', 'trip', 'grapple', 'disarm', 'feint', 'sunder', 'overrun'],
  },
  {
    term: 'Support Ally',
    kind: 'action',
    short: 'A Single action: aid an ally, granting a bonus or setting up teamwork (flanking, shared benefits).',
    body: 'A **Support Ally** is a **Single action ◆** to help a nearby ally — granting a bonus, enabling a shared benefit, or setting up teamwork like flanking. Stances such as **Supportive** and **Welcoming** amplify how much your support gives, making a dedicated helper genuinely valuable in the three-action economy.',
    seeAlso: ['Stances', 'Three-Action Economy'],
    aliases: ['support ally', 'aid', 'help', 'assist'],
  },
  {
    term: 'Attack of Opportunity',
    kind: 'action',
    short: 'A Reaction: strike a foe that leaves your reach or drops its guard — if you have the reaction.',
    body: 'An **Attack of Opportunity** is a **Reaction ↺**: you strike a foe that provokes (typically by leaving your reach with a **Stride**). You get **one Reaction per round**, refreshed at the start of your turn. Not everyone has it — it is a specific reaction — and **Step** avoids provoking it. **Defensive Powers** are the other common use of your Reaction.',
    seeAlso: ['Stride', 'Step', 'Three-Action Economy', 'Stances'],
    aliases: ['attack of opportunity', 'aoo', 'reactive strike', 'reaction'],
  },
  {
    term: 'Stances',
    kind: 'mechanic',
    short: 'A positioning mode you adopt in combat, each with an A benefit and a stronger B benefit — the heart of IG tactics.',
    body:
      'A **Stance** is a combat posture you take, shaping how you fight for as long as you hold it. Each has an **A benefit** and a stronger **B benefit** (unlocked as you advance). The ten:\n\n· **Offensive** — advantage on attacks, disadvantage on Reflex (B: +½ level to damage).\n· **Defensive** — disadvantage on attacks, advantage on Reflex (B: Damage Reduction = ½ level).\n· **Neutral** — deny enemies stance/flanking bonuses against you (B: ignore theirs).\n· **Mobile** — moving into a threatened area no longer provokes (B: you never provoke).\n· **Shifting** — you can\'t be flanked (B: a missed attack against you provokes).\n· **Welcoming / Supportive** — teamwork and shared benefits with allies.\n· **Swarming / Precise / Menacing** — flanking, Sneak Attack, and combat-skill boosts.\n\nChoosing and switching stances to match the moment is the signature IG decision.',
    seeAlso: ['Three-Action Economy', 'Attack', 'Combat Skills'],
    aliases: ['stance', 'stances', 'offensive', 'defensive', 'mobile'],
  },
  {
    term: 'Subclasses',
    kind: 'class',
    short: 'The IG advanced paths: Arcanist, Summoner, Champion, Witch, Shifter.',
    body: 'Intuitive Games characters specialize through subclasses — **Arcanist, Summoner, Champion, Witch, and Shifter** — each shaping the powers, spells, and role a character grows into across levels 1–10. Spellcasters draw on seven schools (Abjuration, Conjuration, Divination, Enchantment, Evocation, Illusion, Transmutation) and manage **Powers** and **Defensive Powers** as their resources.',
    seeAlso: ['Stances', 'Hit Points', 'Powers'],
    aliases: ['subclass', 'subclasses', 'arcanist', 'summoner', 'champion', 'witch', 'shifter'],
  },
  {
    term: 'Interact',
    kind: 'action',
    short: 'A Single action: manipulate an object — draw or stow gear, open a door, pick something up.',
    body: 'An **Interact** is a **Single action ◆** to manipulate the environment or your equipment: draw or sheathe a weapon, retrieve an item, open a door. Like Pathfinder and unlike D&D, most object handling **costs an action** — so drawing and attacking is two of your three. The **Quick Draw** feat makes drawing a weapon free.',
    seeAlso: ['Three-Action Economy', 'Weapon Classes'],
    aliases: ['interact', 'draw weapon', 'manipulate', 'use object'],
  },
  {
    term: 'Redistribution',
    kind: 'action',
    short: 'A Double action: reallocate your resources/positioning — the two-action tactical reset.',
    body: 'A **Redistribution** is a **Double action ◆◆**: you spend two of your three actions to reallocate resources or reposition in a way a single action cannot. It is one of the few things worth two actions on a turn, so taking it means committing most of your turn to setup rather than attacks.',
    seeAlso: ['Three-Action Economy', 'Stances'],
    aliases: ['redistribution', 'reallocate'],
  },
  {
    term: 'Flanking',
    kind: 'mechanic',
    short: 'Attacking a foe your ally also threatens grants a bonus — and several stances amplify it.',
    body: 'When you and an ally threaten a foe from opposite sides, you are **flanking** it, gaining an attack bonus (and enabling effects like **Sneak Attack**). IG builds a whole stance game around this: **Swarming** gives advantage/attack bonuses while flanking, **Supportive** lets you count as flanking to help allies, and **Shifting** makes you immune to being flanked.',
    seeAlso: ['Stances', 'Sneak Attack', 'Attack'],
    aliases: ['flanking', 'flank'],
  },
  {
    term: 'Sneak Attack',
    kind: 'feature',
    short: 'Extra precision damage (starts +1d6) against a flanked or off-balance foe — the Precise stance grants it.',
    body: 'A **Sneak Attack** deals extra precision damage — **+1d6** — when you hit a foe that is **flanked** or **Unconscious, Entangled, Paralyzed, or Blinded**. In IG this is tied to the **Precise** stance: its A benefit grants Sneak Attack (+1d6) and its B benefit raises it to **+2d6**. It rewards positioning and setup over raw attack count.',
    seeAlso: ['Flanking', 'Stances', 'Attack'],
    aliases: ['sneak attack', 'precision damage'],
  },
  {
    term: 'Powers',
    kind: 'mechanic',
    short: 'The active abilities and spells a character can use, managed as a resource by casting/martial subclasses.',
    body: 'A **Power** is an active ability — a spell, a martial technique, or a class feature — that a character can bring to bear on their turn. Casters (Arcanist, Witch, Summoner) draw on the seven **spell schools**; martial and hybrid builds have their own power lists. Powers are tracked and spent as a resource, distinct from **Defensive Powers**, which are used as Reactions.',
    seeAlso: ['Defensive Powers', 'Subclasses', 'Three-Action Economy'],
    aliases: ['power', 'powers', 'spell', 'ability'],
  },
  {
    term: 'Defensive Powers',
    kind: 'mechanic',
    short: 'Reaction abilities used to protect yourself or an ally when a trigger occurs — they spend your Reaction.',
    body: 'A **Defensive Power** is used as a **Reaction ↺** — it triggers off an event (often being attacked) to reduce harm or protect an ally. Because you have **one Reaction per round**, choosing between a Defensive Power, an **Attack of Opportunity**, or a reaction feat (Parry, Bodyguard, Martyr) is a real decision every round.',
    seeAlso: ['Powers', 'Attack of Opportunity', 'Three-Action Economy'],
    aliases: ['defensive power', 'defensive powers', 'reaction ability'],
  },
  {
    term: 'Advantage & Disadvantage',
    kind: 'mechanic',
    short: 'Roll two d20 and take the higher (advantage) or lower (disadvantage) — granted by stances and positioning.',
    body: 'When you have **advantage**, roll **two d20s and take the higher**; with **disadvantage**, take the **lower**. IG hands these out through the stance game and positioning: **Offensive** stance gives advantage on attacks (disadvantage on Reflex saves), **Defensive** the reverse, and **Menacing** advantage on combat skills. They do not stack — you either have it or you do not.',
    seeAlso: ['Core Roll', 'Stances', 'Attack'],
    aliases: ['advantage', 'disadvantage'],
  },
  {
    term: 'Damage Reduction',
    kind: 'mechanic',
    short: 'Subtract a flat amount from incoming damage — the Defensive stance grants DR equal to half your level.',
    body: '**Damage Reduction (DR)** subtracts a flat value from each instance of incoming damage before it reduces your Hit Points. In IG the **Defensive** stance\'s B benefit grants **DR equal to half your level**, turning a defender into a genuine wall as levels climb. DR from different sources generally does not stack; take the best.',
    seeAlso: ['Stances', 'Hit Points'],
    aliases: ['damage reduction', 'dr'],
  },
  {
    term: 'Weapon Classes',
    kind: 'term',
    short: 'Weapons are grouped Light, One-Handed, Two-Handed, Heavy, or Ranged, and deal Slashing, Piercing, or Bludgeoning.',
    body: 'IG groups weapons into five **classes** — **Light, One-Handed, Two-Handed, Heavy, and Ranged** — each crossed with a **damage type**: **Slashing, Piercing, or Bludgeoning**. The class sets the weapon\'s action cost, reach, and how it interacts with feats like **Quick Draw** and **Parry**; the damage type matters against resistances and certain defenses.',
    seeAlso: ['Attack', 'Interact'],
    aliases: ['weapon class', 'weapon classes', 'light', 'two-handed', 'ranged', 'damage type'],
  },
  {
    term: 'Feats',
    kind: 'feature',
    short: 'Chosen options in categories (General, Combat, …) that add abilities — some grant new actions or Reactions.',
    body: 'A **Feat** is a chosen option that grants a new ability. IG sorts them into categories — **General** (Toughness, Versatile, Boundless Stamina…) and **Combat** (Quick Draw, Parry, Bodyguard, Martyr…) among them. Several feats hand you new entries in the action economy: **Parry/Bodyguard/Martyr/Relentless** are Reactions, **Death Spiral** is a Triple action, **Quick Draw** is free.',
    seeAlso: ['Three-Action Economy', 'Defensive Powers', 'Attack of Opportunity'],
    aliases: ['feat', 'feats', 'quick draw', 'parry', 'toughness'],
  },
  {
    term: 'Ability Scores',
    kind: 'stat',
    short: 'The same six as D&D (STR/DEX/CON/INT/WIS/CHA); their modifier feeds the core roll, saves, and HP.',
    body: 'IG uses the six familiar ability scores — **Strength, Dexterity, Constitution, Intelligence, Wisdom, Charisma** — each giving a **modifier** that feeds your rolls. The modifier adds to the **core roll**, to the relevant **saving throw** (with rank + level), and Constitution multiplies into your **Hit Points** each level. Scores are set at creation and rise as you advance.',
    seeAlso: ['Core Roll', 'Saving Throw', 'Hit Points'],
    aliases: ['ability scores', 'abilities', 'stats', 'attributes'],
  },
];
