// lib/dnd/glossary/pathfinder1e.ts — Pathfinder First Edition rules glossary.
//
// PF1 is the 3.x-derived d20: Base Attack Bonus, iterative attacks, skill ranks, typed bonuses,
// confirmed criticals, Flat-Footed as a real condition, and a standard/move/full-round action
// economy. It has NO proficiency bonus, NO advantage/disadvantage, NO three-action economy, and NO
// degrees of success — never import those from PF2 or 5e.
import type { SystemGlossary } from './types';

export const PATHFINDER1E_GLOSSARY: SystemGlossary = [
  // ── Core numbers ──────────────────────────────────────────────────────────────────────────
  {
    term: 'Base Attack Bonus',
    kind: 'mechanic',
    short: 'The class-driven attack number that grows with level and hands you extra attacks at +6, +11, and +16.',
    body:
      '**Base Attack Bonus (BAB)** is the flat attack number your class levels give you. There are three progressions:\n\n· **Good (full)** — BAB equals your level. Fighter, Barbarian, Paladin, Ranger, Cavalier, Gunslinger.\n· **Average (¾)** — BAB is ¾ of your level, rounded down. Cleric, Druid, Rogue, Bard, Monk, Alchemist, Inquisitor, Magus, Summoner.\n· **Poor (½)** — BAB is ½ of your level, rounded down. Wizard, Sorcerer, Witch, Oracle.\n\nYour **attack roll** = d20 + BAB + Strength modifier (melee) or Dexterity modifier (ranged) + size + weapon enhancement + other typed bonuses.\n\nIn a **multiclass** character, BAB from each class **adds together** (fractions are dropped per class first, in the standard rules): Fighter 3/Wizard 4 has BAB +3 + 2 = +5.\n\nBAB is also the backbone of **CMB**, **CMD**, iterative attacks, and a great many feat prerequisites (Power Attack needs BAB +1, Improved Trip-style feats often need BAB +1 or more). PF1 has **no proficiency bonus** — BAB is where the attack math lives.',
    seeAlso: ['Iterative Attacks', 'Combat Maneuver Bonus', 'Combat Maneuver Defense', 'Feats at Odd Levels'],
    aliases: ['BAB', 'base attack', 'attack bonus'],
  },
  {
    term: 'Iterative Attacks',
    kind: 'mechanic',
    short: 'At BAB +6, +11, and +16 you gain extra attacks at −5, −10, and −15 — but only on a full attack.',
    body:
      'Once your **Base Attack Bonus** hits certain thresholds, a **full attack** gives you additional swings:\n\n· **BAB +6** — a second attack at **BAB −5**\n· **BAB +11** — a third attack at **BAB −10**\n· **BAB +16** — a fourth attack at **BAB −15**\n\nA 16th-level Fighter (BAB +16) attacks at **+16/+11/+6/+1** before any other modifiers.\n\nThe hard restriction: **iterative attacks only exist as part of a full attack action**, which takes your **entire round**. If you move more than a 5-foot step, you get **one attack** (a standard action) and nothing else. This "move or full attack" tension is the defining tactical problem of PF1 martial play, and the reason Pounce, Lunge, and Vital Strike exist.\n\nNote what iteratives are **not**: they aren\'t off-hand attacks (two-weapon fighting adds those separately, via feats), and they aren\'t natural attacks (which are all made at full BAB as part of a full attack, at −5 if secondary).\n\nA **haste** effect grants **one extra attack at your highest bonus** during a full attack — not a whole extra iterative set.',
    seeAlso: ['Base Attack Bonus', 'Full-Round Action', 'Standard Action'],
    aliases: ['iteratives', 'extra attacks', 'full attack routine', '+6/+1'],
  },
  {
    term: 'Saving Throws',
    kind: 'mechanic',
    short: 'Three saves — Fortitude, Reflex, Will — on a good (2 + ½ level) or poor (⅓ level) progression.',
    body:
      'PF1 has exactly **three saving throws**, never six per-ability saves:\n\n· **Fortitude** — Constitution. Poison, disease, energy drain, massive trauma.\n· **Reflex** — Dexterity. Fireballs, traps, anything you dodge.\n· **Will** — Wisdom. Charms, fear, illusions, mind-affecting magic.\n\nEach class rates each save as **good** or **poor**:\n\n· **Good save** = **2 + ½ × class level** (rounded down) → +2 at 1st, +6 at 8th, +12 at 20th\n· **Poor save** = **⅓ × class level** (rounded down) → +0 at 1st, +2 at 8th, +6 at 20th\n\nAdd the governing ability modifier plus any typed bonuses (**resistance** bonuses from cloaks are the classic). In a multiclass character, each class\'s save contributions are **added together**, which is why a 1st-level dip into a good-Fort class is worth +2 forever.\n\nA save is a straight d20 vs the effect\'s DC — **natural 1 always fails, natural 20 always succeeds**, regardless of the numbers. There are no degrees of success: most effects define their own "half damage on a successful save" or similar rider.',
    seeAlso: ['Typed Bonuses', 'Concentration Check', 'Base Attack Bonus'],
    aliases: ['saves', 'fortitude', 'reflex', 'will', 'save'],
  },
  {
    term: 'Skill Ranks',
    kind: 'mechanic',
    short: 'You buy ranks (max = character level) and get a flat +3 the first time you put a rank in a class skill.',
    body:
      'Each level you gain **skill ranks equal to your class\'s skill ranks per level + your Intelligence modifier** (minimum 1 per level). Humans get **+1 rank per level** as a racial bonus. Favored class bonuses can add more.\n\n· **Maximum ranks in any one skill = your total character level.** You cannot over-invest.\n· A **class skill** in which you have **at least 1 rank** gets a **+3 class-skill bonus**. It is a flat, one-time +3 — not per rank, and you get **nothing** for a class skill with 0 ranks.\n\nSo a 5th-level Rogue with 5 ranks in Stealth (a class skill) and Dex +4 has **5 + 3 + 4 = +12**. The same 5 ranks in a cross-class skill would be just **+9**.\n\nSkill checks = **d20 + ranks + class-skill bonus + ability modifier + typed bonuses** (competence from items, circumstance, racial). Some skills are **trained only** — you can\'t attempt them at all with 0 ranks (Disable Device, Handle Animal, Knowledge, Linguistics, Sleight of Hand, Spellcraft, Use Magic Device).\n\n**Armor check penalty** applies to Str- and Dex-based skills (Acrobatics, Climb, Escape Artist, Fly, Ride, Sleight of Hand, Stealth, Swim), and doubles for Swim.',
    seeAlso: ['Typed Bonuses', 'Base Attack Bonus'],
    aliases: ['skills', 'ranks', 'class skill', 'skill points', 'cross-class'],
  },
  {
    term: 'Combat Maneuver Bonus',
    kind: 'mechanic',
    short: 'CMB = BAB + Str + size; the attack roll you make to trip, grapple, disarm, bull rush, and so on.',
    body:
      '**CMB = Base Attack Bonus + Strength modifier + special size modifier.**\n\nThe size modifier is **not** the normal size bonus to attacks — bigger is better here: Small **−1**, Medium **+0**, Large **+1**, Huge **+2**, Gargantuan **+4**, Colossal **+8** (and the inverse going down).\n\nTo perform a **combat maneuver** you roll **d20 + CMB** against the target\'s **CMD**. The maneuvers are:\n\n· **Bull Rush**, **Dirty Trick**, **Disarm**, **Drag**, **Grapple**, **Overrun**, **Reposition**, **Steal**, **Sunder**, **Trip**\n\nMost of these **provoke an attack of opportunity** from the target unless you have the corresponding **Improved** feat (Improved Trip, Improved Grapple, etc.), which also grants **+2 to CMB** for that maneuver. The **Greater** version adds another **+2** and grants a free attack of opportunity when you succeed.\n\nExceeding the CMD by **5 or more** upgrades many maneuvers (a Trip by 5+ doesn\'t do more, but Bull Rush and Drag push an extra 5 feet per 5 points). A **Finesse**-based character can use Dex instead of Str for CMB on trips and disarms via **Agile Maneuvers** or **Weapon Finesse** + specific feats.',
    seeAlso: ['Combat Maneuver Defense', 'Base Attack Bonus', 'Attack of Opportunity', 'Grappled'],
    aliases: ['CMB', 'combat maneuver', 'trip', 'grapple check', 'disarm'],
  },
  {
    term: 'Combat Maneuver Defense',
    kind: 'mechanic',
    short: 'CMD = 10 + BAB + Str + Dex + size; the DC someone must beat to trip, grapple, or disarm you.',
    body:
      '**CMD = 10 + Base Attack Bonus + Strength modifier + Dexterity modifier + special size modifier.**\n\nIt uses the **same size modifier as CMB** (Small −1, Large +1, Huge +2…). It is a **static DC**, not a roll — the attacker rolls, you don\'t.\n\nWhat also applies to CMD:\n\n· Any **circumstance**, **deflection**, **dodge**, **insight**, **luck**, **morale**, **profane**, and **sacred** bonuses to **AC** also apply to CMD.\n· **Armor**, **shield**, and **natural armor** bonuses do **not** — a suit of full plate does nothing to stop a trip.\n· A **Flat-Footed** creature loses its **Dexterity bonus** to CMD (and its dodge bonuses).\n\nSpecial cases worth remembering: creatures with **more than two legs** get **+4 to CMD against Trip** (and quadrupeds are correspondingly hard to knock down); creatures that can\'t be tripped at all (oozes, most flying creatures) simply can\'t be. **Grappled** creatures take a **−4 to Dexterity** which flows through into their CMD.\n\nYour CMD against a specific maneuver can be raised by feats like **Improved Trip**, which gives **+2 to CMD** against that same maneuver.',
    seeAlso: ['Combat Maneuver Bonus', 'Flat-Footed', 'Grappled', 'Touch AC'],
    aliases: ['CMD', 'maneuver defense'],
  },
  {
    term: 'Touch AC',
    kind: 'term',
    short: 'Your AC ignoring armor, shield, and natural armor — what touch attacks and most rays target.',
    body:
      '**Touch AC = 10 + Dexterity modifier + size modifier + deflection + dodge + insight/luck/etc.**\n\nIt **excludes** your **armor bonus**, **shield bonus**, and **natural armor bonus**. Everything else that improves AC still applies — a *ring of protection* (deflection) and the Dodge feat both count.\n\nWhat targets it: **ranged touch attacks** (*scorching ray*, *acid splash*, most offensive evocations that require an attack roll), **melee touch attacks** (*shocking grasp*, *inflict wounds* delivered by touch), incorporeal creatures\' attacks, and a handful of special maneuvers.\n\nThis is why a knight in full plate with AC 26 can have a **Touch AC of 11** and be trivially hit by rays — the classic PF1 trap. High-level casters exploit it relentlessly, and the counters are **deflection** bonuses, **dodge** bonuses, high Dex, concealment, and *mirror image*.\n\nA creature that is both **Flat-Footed** and being touch-attacked loses its Dex to touch AC as well — that stacks to a **flat-footed touch AC** that is often just 10 + size + deflection.',
    seeAlso: ['Flat-Footed AC', 'Flat-Footed', 'Combat Maneuver Defense'],
    aliases: ['touch attack', 'touch AC', 'ranged touch'],
  },
  {
    term: 'Flat-Footed AC',
    kind: 'term',
    short: 'Your AC without your Dexterity bonus or dodge bonuses — what you have before you act in combat.',
    body:
      '**Flat-Footed AC = your normal AC minus your Dexterity bonus and minus any dodge bonuses.**\n\nYou keep your **armor**, **shield**, **natural armor**, **deflection**, and size — you just lose the part that comes from actively reacting.\n\nNote the asymmetry: a **negative** Dexterity modifier still applies to your flat-footed AC (you don\'t get to drop a penalty), and the **Dodge** feat\'s +1 goes away because dodge bonuses require awareness. **Uncanny Dodge** (Rogue 4, Barbarian 2) means you **never lose your Dex bonus to AC** for being flat-footed — the standard defense.\n\nThis is a distinct number from the **Flat-Footed condition**, though the condition is what usually produces it. You can also be denied Dex to AC without technically being flat-footed (e.g. stunned, blinded against an unseen attacker) — the effect on your AC is the same, and **Sneak Attack** keys off "denied your Dexterity bonus", not off the condition name.\n\nStack it with a touch attack and you get a **flat-footed touch AC**, the softest defense in the game.',
    seeAlso: ['Flat-Footed', 'Touch AC', 'Combat Maneuver Defense'],
    aliases: ['flat footed AC', 'FFAC', 'denied dex'],
  },
  {
    term: 'Attack of Opportunity',
    kind: 'action',
    short: 'A free attack, once per round, when someone provokes in a square you threaten.',
    body:
      'You get **one attack of opportunity per round** (more with **Combat Reflexes**: 1 + your Dexterity modifier, and it lets you take them while flat-footed). It costs no action from your turn and is made at your **full base attack bonus**.\n\nIt triggers when a creature in a square you **threaten** does something provoking:\n\n· **Moving out of a threatened square** — but **not** a 5-foot step, and not a withdraw from the square you started in\n· **Casting a spell** in a threatened square (avoided by **casting defensively**)\n· **Making a ranged attack**\n· **Standing up from prone**\n· Most **combat maneuvers** (unless you have the Improved feat)\n· Drinking a potion, retrieving a stored item, using many skills (Heal, Disable Device, Sleight of Hand, Use Magic Device)\n\nAn AoO resolves **before** the action that provoked it. You can only take one per provoking action, and you must be **able to act** — a flat-footed creature **cannot** take AoOs at all (unless it has Combat Reflexes).\n\nThe attack is a **single melee attack** at your highest bonus, not a full attack.',
    seeAlso: ['Threatened Square', 'Flat-Footed', 'Combat Maneuver Bonus', 'Concentration Check'],
    aliases: ['AoO', 'attacks of opportunity', 'opportunity attack', 'provoke'],
  },
  {
    term: 'Threatened Square',
    kind: 'term',
    short: 'Any square you could make a melee attack into — the zone in which you get attacks of opportunity.',
    body:
      'You **threaten** every square into which you could make a **melee attack**, even if it isn\'t currently your turn.\n\n· A Medium creature with a normal melee weapon threatens the **8 adjacent squares** (5-foot reach).\n· A **reach weapon** (longspear, glaive, whip) threatens squares **10 feet** away — but **not** adjacent squares. That donut hole is why reach builds pair the weapon with **Combat Reflexes** and a way to cover the gap.\n· A Large creature with a normal weapon threatens 10 feet; with a reach weapon, 20 feet.\n\nYou must be **able to act** and **wielding a weapon** (or have a natural/unarmed attack that doesn\'t provoke) to threaten. A creature that is **flat-footed**, **stunned**, **paralyzed**, or otherwise unable to act threatens nothing.\n\nThreatening is also what enables **flanking**: two allies threatening a target from **opposite sides** each get **+2 on melee attacks**, and the target is flanked (which lets a Rogue apply **Sneak Attack**). Note that flanking does **not** make the target flat-footed — a common misremembering.',
    seeAlso: ['Attack of Opportunity', 'Flat-Footed', 'Combat Maneuver Bonus'],
    aliases: ['threaten', 'threatened', 'reach', 'flanking'],
  },
  {
    term: 'Standard Action',
    kind: 'action',
    short: 'The main thing you do on your turn: one attack, one spell, or one activity — usually paired with a move.',
    body:
      'A normal round gives you **one standard action + one move action** (or a full-round action instead of both), plus a **swift** and any number of **free** actions.\n\nA **standard action** covers:\n\n· **Attack** — a **single** melee or ranged attack, at your highest bonus. No iteratives.\n· **Cast a spell** with a casting time of 1 standard action (most spells)\n· **Activate a magic item**, use most **special abilities**\n· **Total defense** — +4 dodge bonus to AC until your next turn, no attacks\n· **Aid another** — +2 to an ally\'s attack or AC against one target\n\nYou may take a **move action in place of a standard action** — so you can move twice, or move and draw and open a door.\n\nThe standard/move split is what makes **charging** and **spring attack** valuable: they let you move meaningfully *and* attack. And it is why **full attacks** are so restrictive — they consume the whole round.',
    seeAlso: ['Move Action', 'Full-Round Action', 'Swift Action', 'Iterative Attacks'],
    aliases: ['standard', 'standard action', 'action'],
  },
  {
    term: 'Move Action',
    kind: 'action',
    short: 'Move up to your speed, or do something that takes about as long — draw, stand up, open a door.',
    body:
      'You get **one move action** per round in addition to your standard action (and you can swap your standard action for a second move action).\n\nMove actions include:\n\n· **Move** up to your **speed** — provokes attacks of opportunity from every threatened square you leave\n· **Draw or sheathe a weapon** (drawing is a **free action** if your BAB is **+1 or higher**)\n· **Stand up from prone** — **provokes**\n· **Ready or loose a shield**, retrieve a stored item (provokes), open a door, mount a horse\n· **Direct** or **redirect** an active spell\n\nThe **5-foot step** is not a move action at all — it is a special free movement that **does not provoke**, and you can take it in any round in which you **do not otherwise move**. It is the single most important tactical option in PF1: it is how a full-attacking martial repositions, and how a caster escapes a threatened square.\n\n**Withdraw** is a full-round action that makes the **first square** you leave not provoke. Moving through **difficult terrain** costs double; **running** (×4 speed) is a full-round action and makes you lose your Dex bonus to AC.',
    seeAlso: ['Standard Action', 'Full-Round Action', 'Attack of Opportunity', 'Prone'],
    aliases: ['move', 'move action', '5-foot step', 'five foot step'],
  },
  {
    term: 'Full-Round Action',
    kind: 'action',
    short: 'Consumes your whole round — a full attack, a charge, a withdraw, or a long spell.',
    body:
      'A **full-round action** uses up your **entire round**: your standard *and* your move action. You may still take a **5-foot step** as part of it (unless the action itself includes movement), plus swift and free actions.\n\nThe important ones:\n\n· **Full attack** — the only way to use your **iterative attacks** at BAB +6/+11/+16, plus off-hand and natural attacks. You may **not** move (a 5-foot step is fine).\n· **Charge** — move up to **twice your speed** in a straight line to the nearest space from which you can attack, then make **one** attack at **+2**, and take **−2 to AC** until your next turn. No iteratives.\n· **Withdraw** — move up to twice your speed; the **first square** you leave doesn\'t provoke.\n· **Run** — move **×4** speed in a straight line; you lose your Dexterity bonus to AC.\n· **Coup de grace** — kill a **Helpless** target: an automatic hit, automatic critical, and the victim must make a **Fortitude save (DC 10 + damage dealt)** or die outright. It **provokes**.\n· **Full-round casting** — spells with a 1-round casting time complete just before your next turn.\n\n"Move or full attack" is the central tension of PF1 combat; **Pounce** (charge and full attack) is the most prized ability in the game for exactly this reason.',
    seeAlso: ['Standard Action', 'Move Action', 'Iterative Attacks', 'Helpless'],
    aliases: ['full round', 'full attack', 'charge', 'coup de grace', 'withdraw'],
  },
  {
    term: 'Swift Action',
    kind: 'action',
    short: 'A near-instant action, once per round — quickened spells, many class abilities, and judgment-style toggles.',
    body:
      'A **swift action** takes almost no time. You get **one per round**, and it does **not** cost you your standard or move.\n\nTypical uses:\n\n· Casting a **quickened** spell (Quicken Spell metamagic, +4 spell levels) — **one per round maximum**, hard rule\n· Activating a **judgment** (Inquisitor), **arcane pool** (Magus), **smite evil** (Paladin), or **rage** (Barbarian, on the turn you start it)\n· Many **stances** and short buff toggles\n\nAn **immediate action** is the same speed but can be taken **when it isn\'t your turn** — *feather fall*, the Paladin\'s divine grace-style reactions, a Magus\'s counter. The catch: **an immediate action and a swift action share the same budget**. If you use an immediate action, you **cannot take a swift action on your next turn**; and you cannot take an immediate action if you\'ve already used your swift action this round.\n\n**Free actions** are unlimited within reason (talking, dropping an item, drawing with BAB +1) but the GM may cap them. PF1 has **no bonus action** — that is a 5e concept.',
    seeAlso: ['Standard Action', 'Move Action', 'Full-Round Action'],
    aliases: ['swift', 'immediate action', 'free action', 'quickened'],
  },
  {
    term: 'Typed Bonuses',
    kind: 'mechanic',
    short: 'Bonuses have types; two of the same type do not stack — you take the highest. Dodge and circumstance are the exceptions.',
    body:
      'Nearly every bonus in PF1 carries a **type**, and **two bonuses of the same type do not stack** — you take the **highest** one only.\n\nThe types: **alchemical, armor, circumstance, competence, deflection, dodge, enhancement, inherent, insight, luck, morale, natural armor, profane, racial, resistance, sacred, shield, size, trait**.\n\nThe rules to memorize:\n\n· **Same type ⇒ take the highest.** A +2 morale bonus and a +4 morale bonus give +4, not +6.\n· **Dodge bonuses ALWAYS stack** — with each other and with everything. (Dodge feat + fighting defensively + a haste dodge bonus all add up.) But they are lost whenever you lose your Dexterity bonus to AC.\n· **Circumstance bonuses stack** with each other if they come from **different circumstances**.\n· **Untyped bonuses stack** with everything, including other untyped bonuses.\n· **Penalties always stack**, regardless of type — except two penalties from the same *source* or same named effect.\n\nThis is why *bull\'s strength* (enhancement) doesn\'t stack with a *belt of giant strength* (enhancement), why *bless* (morale) doesn\'t stack with *good hope* (morale), and why players hunt for oddly-typed bonuses. There is no advantage/disadvantage in PF1 — this stacking arithmetic *is* the system.',
    seeAlso: ['Skill Ranks', 'Saving Throws', 'Touch AC', 'Flat-Footed AC'],
    aliases: ['bonus types', 'stacking', 'does it stack', 'dodge bonus', 'enhancement'],
  },
  {
    term: 'Confirming a Critical',
    kind: 'mechanic',
    short: 'A natural roll in the weapon\'s threat range only threatens; you roll again to confirm before it becomes a crit.',
    body:
      'A critical hit takes **two rolls** in PF1.\n\n**1. Threaten.** Roll a natural result inside the weapon\'s **threat range** (see Threat Range) *and* have that roll hit the target\'s AC. If it wouldn\'t have hit, there is no threat at all.\n\n**2. Confirm.** Immediately make a **second attack roll** with all the same modifiers. If **that** roll also hits the target\'s AC, it is a **critical hit**. If it misses, you deal **normal damage** — the hit still lands, it just isn\'t a crit.\n\nOn a confirmed crit you multiply damage by the weapon\'s **multiplier** (×2, ×3, ×4). Multiplying means rolling the dice that many times and adding: a ×2 crit with a longsword is **2d8 + 2× your Strength bonus**. **Precision damage** (Sneak Attack) and **extra energy dice** (flaming) are **never multiplied** — they are rolled once and added.\n\n· **Critical Focus** feat: **+4 to confirmation rolls**.\n· Creatures **immune to critical hits** (undead, constructs, oozes, elementals, plants, swarms) simply take normal damage.\n· A **natural 1 on the confirmation roll** is not an automatic failure to confirm — confirmation rolls do not auto-miss on a 1 in the same way, but they do use the normal "does it beat AC" test.\n\nThis two-roll structure is a hallmark of PF1 — **Starfinder deliberately removed it**.',
    seeAlso: ['Threat Range', 'Base Attack Bonus', 'Iterative Attacks'],
    aliases: ['confirm crit', 'critical confirmation', 'crit', 'critical hit'],
  },
  {
    term: 'Threat Range',
    kind: 'term',
    short: 'The natural rolls on which a weapon threatens a crit — 20, 19–20, or 18–20 depending on the weapon.',
    body:
      'Every weapon has a **threat range** and a **critical multiplier**, written together like **19–20/×2** or **20/×3**.\n\n· **20/×2** — most simple weapons; club, mace, spear\n· **19–20/×2** — longsword, scimitar, rapier, heavy/light crossbow\n· **18–20/×2** — falchion, keen scimitar, kukri, rapier with Improved Critical\n· **20/×3** — battleaxe, warhammer, longbow, halberd\n· **20/×4** — scythe, pick\n\n**Improved Critical** (a feat) and the **keen** weapon property both **double the threat range** — 19–20 becomes 17–20, 20 becomes 19–20. Critically: **they do not stack with each other** (this is the most-argued rule in the book, and the answer is no). Neither ever changes the **multiplier**.\n\nMath in practice: a falchion (18–20/×2) crits often for moderate extra damage; a scythe (20/×4) crits rarely for enormous damage. Feats like **Critical Focus**, **Staggering Critical**, and **Bleeding Critical** favor the wide-range weapons because they trigger on any confirmed crit.\n\nA roll inside the threat range still has to **hit** and still has to **confirm**.',
    seeAlso: ['Confirming a Critical', 'Base Attack Bonus'],
    aliases: ['crit range', 'threat', '19-20', 'keen', 'critical multiplier'],
  },
  {
    term: 'Feats at Odd Levels',
    kind: 'mechanic',
    short: 'Every character gets a feat at 1st level and every odd level after — 11 feats by 20th, plus class bonus feats.',
    body:
      'Every character gains a **feat at 1st level and at every odd character level**: 1, 3, 5, 7, 9, 11, 13, 15, 17, 19. That is **11 feats** by 20th level from level progression alone.\n\nOn top of that:\n\n· **Humans** get a **bonus feat at 1st level**.\n· **Fighters** get a **bonus combat feat at 1st level and every even level** (2, 4, 6…20) — **11 more**, which is the class\'s whole identity.\n· **Wizards** get bonus item-creation/metamagic feats at 5th, 10th, 15th, 20th; **Monks**, **Rangers** (via combat styles), and others get bonus feats from restricted lists.\n\nFeat **prerequisites** are strictly enforced and commonly chain: **Power Attack** needs Str 13 and BAB +1; **Improved Two-Weapon Fighting** needs Dex 17 and BAB +6. You must meet every prerequisite continuously — lose the Strength and you lose the feat\'s use.\n\nNote the **cadence differences**: feats at **odd** levels, ability increases at **4/8/12/16/20**. They never collide, and there is **no "feat or ASI" choice** — you get both, on their own schedules. Do not model PF1 with 5e\'s ASI-or-feat trade.',
    seeAlso: ['Ability Score Increase', 'Base Attack Bonus', 'Combat Maneuver Bonus'],
    aliases: ['feats', 'feat progression', 'bonus feat', 'combat feat'],
  },
  {
    term: 'Ability Score Increase',
    kind: 'mechanic',
    short: '+1 to a single ability score at 4th, 8th, 12th, 16th, and 20th level — five points total.',
    body:
      'At **4th, 8th, 12th, 16th, and 20th level** you increase **one ability score of your choice by +1**. That is **five total points** across a full career.\n\nThat is the whole rule, and it is deliberately small. It is **not** 5e\'s +2 ASI, and it is **not** a choice between an ability increase and a feat — **feats come separately, at every odd level**.\n\nBecause modifiers only move every **two** points, players almost always dump all five into their primary score to convert them into modifiers: an 18 becomes 19 (still +4) at 4th, then 20 (+5) at 8th, then 21 (+5) at 12th, then 22 (+6) at 16th, then 23 (+6) at 20th. Putting a point into an **odd** score does nothing until the next one lands.\n\nThe real ability growth in PF1 comes from **gear**, not levels:\n\n· **Enhancement** bonuses from belts and headbands: **+2 / +4 / +6** (these do not stack with each other — take the highest).\n· **Inherent** bonuses from *wish* or a *tome/manual*: up to **+5**, and these **do** stack with enhancement.\n\nThere is no hard cap on ability scores in play.',
    seeAlso: ['Feats at Odd Levels', 'Typed Bonuses'],
    aliases: ['ASI', 'ability increase', 'stat bump', 'ability score'],
  },
  {
    term: 'Spell Levels',
    kind: 'term',
    short: 'Spells run 0 (cantrips/orisons) to 9th level, and slots are per level per day.',
    body:
      'PF1 spells are rated **level 0 through 9**. Level 0 spells are **cantrips** (arcane) or **orisons** (divine) and are cast **at will** — unlimited, but they do **not** scale with your level the way 5e cantrips do.\n\n· **Full casters** (Wizard, Cleric, Druid, Sorcerer, Oracle, Witch) reach **9th-level spells at 17th character level**.\n· **6-level casters** (Bard, Inquisitor, Magus, Summoner, Alchemist extracts) top out at **6th-level spells at 16th level**.\n· **4-level casters** (Paladin, Ranger) top out at **4th** and don\'t begin casting until **4th level**.\n\nYour **spells per day** come from a class table plus **bonus slots for a high casting ability** (Int for Wizard/Magus, Wis for Cleric/Druid/Ranger, Cha for Sorcerer/Bard/Paladin/Oracle). You need a casting ability score of at least **10 + the spell\'s level** to cast that level at all.\n\n**Save DC = 10 + spell level + your casting ability modifier** (plus Spell Focus, etc.). Note it uses the **spell\'s level**, not your character level — a 1st-level *charm person* from a 20th-level wizard is still DC 11 + Int.\n\n**Metamagic** feats raise a spell\'s effective slot level (Quicken +4, Empower +2, Extend +1). For a **prepared** caster this is decided at preparation; for a **spontaneous** caster it costs a **full-round action** to cast instead of a standard.',
    seeAlso: ['Prepared vs Spontaneous', 'Concentration Check', 'Saving Throws'],
    aliases: ['spell level', 'spell slots', 'cantrip', 'orison', 'metamagic', 'spell DC'],
  },
  {
    term: 'Prepared vs Spontaneous',
    kind: 'mechanic',
    short: 'Prepared casters lock in specific spells each morning; spontaneous casters know few spells but cast them freely from slots.',
    body:
      'PF1\'s two casting models are genuinely different classes of thing.\n\n**Prepared** — Wizard, Cleric, Druid, Paladin, Ranger, Witch, Magus, Alchemist:\n\n· Each morning you spend **1 hour** preparing, choosing **exactly which spell goes in each slot**. A slot holding *fireball* casts *fireball* and nothing else.\n· A **Wizard** prepares from their **spellbook** (2 new spells free per level; more can be scribed at cost). A **Cleric** or **Druid** prepares from their **entire class list** — they know everything, they just have to guess right each morning.\n· Clerics and Druids can **spontaneously convert** any prepared spell of that level into a **cure/inflict** spell (or *summon nature\'s ally* for Druids) — the pressure valve for a bad guess.\n\n**Spontaneous** — Sorcerer, Bard, Oracle, Summoner:\n\n· You know a **small fixed list** of **spells known** and can cast **any of them** using any slot of that level. Total flexibility within a narrow list.\n· You gain new spells known on a slow table and can **swap** one out at set levels (4th, 6th, and every even level after for Sorcerers).\n· You get spell levels **one character level later** than prepared casters, and applying **metamagic** costs a **full-round action**.\n\nThe trade: prepared casters are more versatile per *campaign*; spontaneous casters are more flexible per *round*.',
    seeAlso: ['Spell Levels', 'Concentration Check'],
    aliases: ['prepared caster', 'spontaneous caster', 'spellbook', 'spells known', 'vancian'],
  },
  {
    term: 'Concentration Check',
    kind: 'mechanic',
    short: 'd20 + caster level + casting ability modifier, rolled to avoid losing a spell when something disrupts you.',
    body:
      'When something threatens to disrupt a spell you are casting, roll **d20 + your caster level + your casting ability modifier** against a DC. Fail and the **spell is lost** — slot spent, nothing happens.\n\nThe DCs you actually meet at the table:\n\n· **Damaged while casting** — **DC 10 + damage dealt + spell level**. This is what an attack of opportunity does to you.\n· **Casting defensively** (to avoid provoking) — **DC 15 + double the spell\'s level**. A 3rd-level spell needs a **DC 21**.\n· **Grappled or pinned** — **DC 10 + the grappler\'s CMB + spell level**.\n· **Entangled** — **DC 15 + spell level**.\n· **Vigorous motion** (a bouncing wagon, a rough sea) — **DC 10 + spell level**; **violent motion** — **DC 15 + spell level**.\n· **Continuous damage** (bleed, acid) — **DC 10 + half the damage dealt in the last round + spell level**.\n\n**Combat Casting** gives **+4** to concentration checks made to cast defensively or while grappled. Note the DC uses the **spell\'s level**, so casting your big spells defensively gets harder as you level, while your bonus grows — it is a race the caster generally wins by about 8th level.',
    seeAlso: ['Spell Levels', 'Attack of Opportunity', 'Grappled', 'Entangled', 'Pinned'],
    aliases: ['concentration', 'casting defensively', 'lose the spell', 'disrupt'],
  },

  // ── Conditions ────────────────────────────────────────────────────────────────────────────
  {
    term: 'Blinded',
    kind: 'condition',
    short: 'You can\'t see: −2 AC, lose Dex to AC, −4 on Str/Dex skills, and every opponent has total concealment.',
    body:
      'You cannot see at all.\n\n· **−2 penalty to AC**, and you **lose your Dexterity bonus to AC**.\n· **−4 penalty** on most **Strength- and Dexterity-based skill checks** and on **opposed Perception** checks.\n· All opponents have **total concealment** against you — a **50% miss chance** on every attack you make, and you must guess their square.\n· You **move at half speed** unless you succeed at a **DC 10 Acrobatics** check; failing that check means you fall prone. You cannot **run** or **charge**.\n· You **can\'t use gaze attacks** and are **immune** to them.\n\nBecause you lose your Dex bonus to AC, blinded characters are **denied their Dexterity bonus** — which means Rogues can **Sneak Attack** them freely.\n\nA creature that is blinded and **cannot** perceive its attacker at all is effectively helpless against precision damage. *Blindsense*, *blindsight*, *tremorsense*, and the Blind-Fight feat are the standard counters — Blind-Fight lets you reroll the miss chance.',
    seeAlso: ['Dazzled', 'Deafened', 'Flat-Footed', 'Flat-Footed AC'],
    aliases: ['blind', 'blinded'],
  },
  {
    term: 'Confused',
    kind: 'condition',
    short: 'You roll on a d% table each round: act normally, babble, hurt yourself, or attack the nearest creature.',
    body:
      'You cannot act rationally. **At the start of each of your turns, roll d%**:\n\n· **01–25** — **act normally**\n· **26–50** — **do nothing but babble incoherently**\n· **51–75** — **deal damage to yourself** with the item in hand\n· **76–100** — **attack the nearest creature** (for this purpose, a familiar or animal companion counts as part of you)\n\nThe override: **if a confused creature is attacked, it attacks the creature that last damaged it on its next turn**, ignoring the table entirely. That means confusion effectively turns into "attacks whoever hit it last", which is a real tactical lever — and a real risk if that\'s you.\n\nA confused creature that **can\'t reach** the creature it wants to attack will **move toward it**, or attack whatever else is nearest. A confused creature **does not make attacks of opportunity** against any creature it isn\'t already targeting this way.\n\n*Confusion* is a mind-affecting compulsion — **immune creatures** (undead, constructs, plants, oozes, vermin) are unaffected, as is anything with **protection from evil**-style compulsion defenses.',
    seeAlso: ['Dazed', 'Fascinated', 'Panicked'],
    aliases: ['confusion', 'confused'],
  },
  {
    term: 'Cowering',
    kind: 'condition',
    short: 'Frozen in terror: no actions at all, no Dex bonus to AC, and attackers get +2 to hit you.',
    body:
      'You are **frozen in fear** and can **take no actions** whatsoever.\n\n· You **lose your Dexterity bonus to AC**.\n· Attackers gain a **+2 bonus on attack rolls** against you.\n\nThat is the whole condition, and it is brutal: it is a total lockout, worse than **Panicked** in the short term because you cannot even run.\n\nWhere it comes from: a **Panicked** creature that is **cornered** (cannot flee) **cowers** instead. Some fear effects impose it directly on a badly-failed save. The **fear ladder** in PF1 runs **Shaken → Frightened → Panicked**, with **Cowering** as the trapped-and-out-of-options end state.\n\nBecause you lose Dex to AC, you are open to **Sneak Attack**. You are **not**, however, **Helpless** — a cowering creature cannot be **coup de graced**. That is the one mercy.\n\nAll of it is **mind-affecting**: immune creatures and *remove fear* shut it down.',
    seeAlso: ['Panicked', 'Frightened', 'Shaken', 'Helpless'],
    aliases: ['cower', 'cowering'],
  },
  {
    term: 'Dazed',
    kind: 'condition',
    short: 'You can take no actions for the duration — but your AC is untouched.',
    body:
      'You are **stunned into inaction** but not physically compromised.\n\n· You **can take no actions** — no standard, no move, no swift, no free, no attacks of opportunity.\n· You take **no penalty to AC**, and you **keep your Dexterity bonus**.\n\nThat second line is the whole difference from **Stunned**: a dazed creature is not any easier to hit, is not denied Dex, and therefore is **not** open to Sneak Attack. You just lose your turn.\n\n**Duration is almost always 1 round.** *Daze* (a 0-level spell) only affects a **humanoid creature of 4 HD or less** — that HD cap is why it never scales. *Hideous laughter*, *color spray*, and various weapon crit effects daze for a round or two.\n\nDazed is **mind-affecting** in most incarnations, so it doesn\'t work on undead, constructs, oozes, plants, or vermin. Getting dazed for a single round costs you exactly one turn — irritating, rarely fatal.',
    seeAlso: ['Stunned', 'Staggered', 'Confused'],
    aliases: ['daze', 'dazed'],
  },
  {
    term: 'Dazzled',
    kind: 'condition',
    short: '−1 on attack rolls and sight-based Perception checks. The mildest condition in the game.',
    body:
      'Your eyes are washed out by light.\n\n· **−1 penalty on attack rolls**.\n· **−1 penalty on sight-based Perception checks**.\n\nThat is genuinely all of it — dazzled is the **weakest condition in PF1**, and it exists mostly as a rider on light effects, *flare*, *color spray* on high-HD targets, and the sunlight sensitivities of subterranean creatures.\n\nIt does **not** affect AC, does not impose a miss chance, and does not deny you Dex. Do not confuse it with **Blinded**.\n\nCreatures with **light sensitivity** are **dazzled** in bright light or a *daylight* spell; creatures with **light blindness** are **blinded for 1 round** on sudden exposure and **dazzled** while it persists — that distinction matters when you\'re fighting drow, orcs, or grimlocks and reach for a sunrod.',
    seeAlso: ['Blinded', 'Deafened'],
    aliases: ['dazzle', 'dazzled'],
  },
  {
    term: 'Deafened',
    kind: 'condition',
    short: '−4 on initiative, auto-fail hearing Perception, and a 20% spell failure chance on verbal components.',
    body:
      'You cannot hear.\n\n· **−4 penalty on initiative** checks.\n· You **automatically fail Perception checks based on sound**.\n· **−4 penalty on opposed Perception checks**.\n· **20% chance of spell failure** when casting a spell with a **verbal component**.\n\nThat last one is the one people forget, and it is unique to PF1\'s treatment: a deafened caster genuinely fumbles one spell in five, because they can\'t hear themselves speak the incantation. Roll it every time.\n\nDeafness also blocks **language-dependent** effects that rely on hearing and gives you **immunity to sonic effects that require hearing** (a banshee\'s wail, a bard\'s *fascinate*).\n\n**Silence** does not deafen — it prevents sound in an area, which stops verbal components outright (100%, not 20%) and blocks hearing while inside. Two different rules; don\'t merge them.\n\n*Remove blindness/deafness* (3rd level) is the cure; the condition is otherwise permanent from causes like a deafening burst.',
    seeAlso: ['Blinded', 'Dazzled', 'Concentration Check', 'Spell Levels'],
    aliases: ['deaf', 'deafened'],
  },
  {
    term: 'Dying',
    kind: 'condition',
    short: 'Unconscious at negative HP, losing 1 HP per round, and dead when you hit negative your Constitution score.',
    body:
      'You are at **negative Hit Points**, **Unconscious**, and bleeding out.\n\n· You **die when your HP reaches a negative value equal to your Constitution score** — a Con 14 character dies at **−14**. This is the whole reason Constitution matters twice.\n· At the **start of each of your turns**, you **lose 1 Hit Point** — unless you stabilize.\n\n**Stabilizing**, two ways:\n\n· **Yourself** — each round, before losing that HP, make a **DC 10 Constitution check**, adding your **current (negative) HP total** as a penalty. At −4 HP with Con +2, that is d20 + 2 − 4 vs DC 10 — you need a 12. Success means you **stabilize** (still unconscious, no longer losing HP, at 0 HP effectively for stability purposes). Failure means you lose another HP.\n· **An ally** — a **DC 15 Heal check** as a **standard action** stabilizes you, as does **any** magical healing or a single point of cure magic.\n\nA **stabilized** character has a **10% chance each hour** of regaining consciousness at **0 HP** and being **Disabled**; otherwise it stays unconscious until healed. At exactly **0 HP** you are **Disabled** — conscious, but limited to a **single move or standard action** per round, and taking a standard action costs you **1 HP** and drops you back to dying.',
    seeAlso: ['Unconscious', 'Helpless', 'Staggered', 'Full-Round Action'],
    aliases: ['dying', 'bleeding out', 'negative HP', 'stabilize', 'disabled'],
  },
  {
    term: 'Entangled',
    kind: 'condition',
    short: 'Half speed, −2 attack, −4 Dex, no running or charging — and casting needs a DC 15 + spell level concentration check.',
    body:
      'You are caught in a net, webs, vines, or a *tanglefoot bag*.\n\n· **Move at half speed**; you **cannot run or charge**.\n· **−2 penalty on all attack rolls**.\n· **−4 penalty to Dexterity** — which flows through to your AC, your Reflex saves, and every Dex-based skill.\n· If the entangling effect is **anchored to an immobile object**, you **cannot move at all** until you break free.\n· Casting a spell while entangled requires a **concentration check, DC 15 + the spell\'s level**.\n\nNote it is **−4 to Dexterity (the score)**, not a flat −2 to AC — so it costs you **−2 AC** in practice (two points of score = one point of modifier), and it can\'t drop your Dex below 1.\n\nEscaping: usually an **Escape Artist** or **Strength** check against the effect\'s DC, or destroying the entangling material (*web* can be burned; a *tanglefoot bag* has a listed DC). *Freedom of movement* prevents the condition entirely.',
    seeAlso: ['Grappled', 'Pinned', 'Concentration Check', 'Staggered'],
    aliases: ['entangle', 'entangled', 'webbed', 'net'],
  },
  {
    term: 'Exhausted',
    kind: 'condition',
    short: 'Half speed and −6 to Strength and Dexterity; an hour of rest downgrades it to Fatigued.',
    body:
      'You are utterly spent — the second rung of the fatigue ladder.\n\n· **Move at half speed**.\n· **−6 penalty to Strength** and **−6 penalty to Dexterity**.\n\nThat Dex hit means roughly **−3 to AC**, **−3 Reflex**, **−3 to ranged attacks**; the Str hit means **−3 to melee attacks and damage**. It is a serious debuff, and it is why a Barbarian coming down off **Rage** (which leaves them fatigued, or exhausted with certain rage powers) is genuinely vulnerable.\n\n**Recovering**: **1 hour of complete rest** downgrades exhausted to **Fatigued**. Getting rid of the fatigued condition then requires **8 hours of rest**.\n\n**Stacking rule**: an effect that would make an already-**fatigued** creature fatigued instead makes it **exhausted**. Something that exhausts an already-exhausted creature does nothing further — there is no third rung.\n\nCreatures **immune to fatigue** (and to exhaustion) include undead and constructs. *Restoration* and *heal* clear it; a *lesser restoration* only downgrades it.',
    seeAlso: ['Fatigued', 'Staggered', 'Nauseated'],
    aliases: ['exhaustion', 'exhausted'],
  },
  {
    term: 'Fascinated',
    kind: 'condition',
    short: 'Transfixed: no actions but staring, −4 on reactive skill checks, and any obvious threat breaks it.',
    body:
      'You are entranced by something.\n\n· You **can take no actions** other than paying attention to the fascinating effect.\n· **−4 penalty on skill checks made as reactions** — Perception, most notably.\n\nWhat ends it:\n\n· Any **potential threat** (an ally drawing a weapon, a hostile creature approaching within 30 feet) lets you attempt a **new saving throw** against the effect.\n· Any **obvious threat** — someone attacking you, someone casting a spell at you — **automatically breaks** the effect immediately.\n· An **ally can shake you out of it** with a **standard action**.\n\nSo fascination is a setup and social tool, not a combat lock: it cannot survive the first blow. A bard\'s *fascinate* performance affects creatures within 90 feet who can see and hear them, one creature per 3 bard levels beyond 1st, with a **Will save (DC 10 + ½ bard level + Cha)** to resist.\n\nFascinated is **mind-affecting**, so undead, constructs, plants, oozes, and vermin ignore it entirely.',
    seeAlso: ['Confused', 'Cowering', 'Dazed'],
    aliases: ['fascinate', 'fascinated', 'entranced'],
  },
  {
    term: 'Fatigued',
    kind: 'condition',
    short: 'No running or charging, and −2 to Strength and Dexterity; 8 hours of rest clears it.',
    body:
      'You are tired — the first rung of the fatigue ladder.\n\n· You **cannot run or charge**.\n· **−2 penalty to Strength** and **−2 penalty to Dexterity**.\n\nA −2 to the *score* means roughly **−1 to AC**, **−1 Reflex**, **−1 to attacks and damage**. Mild, but it never goes away on its own during an adventuring day.\n\n**Recovering**: **8 hours of complete rest**. Nothing shorter works in the core rules; *lesser restoration* removes it, as does *restoration* and *heal*.\n\n**Stacking**: doing anything that would fatigue an already-**fatigued** creature makes it **Exhausted** instead. This is the trap on Barbarian **Rage** — end rage, become fatigued (for a number of rounds equal to 2× the rounds you raged), then rage again in the same fight and you come out **exhausted**.\n\nCommon sources: **Rage**, forced marches, going without sleep, some spells and poisons, and the **hustle** rules for overland travel. Undead and constructs are **immune**.',
    seeAlso: ['Exhausted', 'Staggered'],
    aliases: ['fatigue', 'fatigued', 'tired'],
  },
  {
    term: 'Flat-Footed',
    kind: 'condition',
    short: 'Caught unready: you lose your Dexterity bonus to AC and can\'t make attacks of opportunity.',
    body:
      'You have not yet reacted to the situation.\n\n· You **lose your Dexterity bonus to AC** (and any **dodge** bonuses).\n· You **cannot make attacks of opportunity**.\n\n**When you\'re flat-footed**: at the **start of a combat, before your first turn** in the initiative order. This is why winning initiative is so valuable — everyone below you in the order is flat-footed when you act. You\'re also flat-footed while **climbing**, while **pinned**, and whenever an effect says so.\n\n**Sneak Attack** triggers on a target that is **denied its Dexterity bonus to AC**, which is exactly what this condition does — the round-one Rogue alpha strike is the whole reason this condition matters.\n\n**Counters**: **Uncanny Dodge** (Rogue 4, Barbarian 2) means you **retain your Dex bonus to AC** even when flat-footed or caught unaware; **Improved Uncanny Dodge** additionally means you can\'t be flanked by rogues of insufficient level. **Combat Reflexes** lets you make attacks of opportunity **even while flat-footed**.\n\nThis condition produces your **Flat-Footed AC**, a real number you should have written on your sheet. Note that PF2 renamed this concept to **Off-Guard** — in PF1 it is Flat-Footed and it is a full condition, not just an AC penalty.',
    seeAlso: ['Flat-Footed AC', 'Touch AC', 'Attack of Opportunity', 'Helpless'],
    aliases: ['flat footed', 'flatfooted', 'denied dex', 'caught off guard'],
  },
  {
    term: 'Frightened',
    kind: 'condition',
    short: '−2 on attacks, saves, skills and ability checks, and you must flee if you can.',
    body:
      'The middle rung of the **fear ladder**.\n\n· **−2 penalty** on **attack rolls**, **saving throws**, **skill checks**, and **ability checks**.\n· You **must flee** from the source of your fear, by the most expedient route, for as long as it lasts.\n· If you are **cornered** and cannot flee, you **may fight** — you keep the −2 but you are allowed to act normally otherwise.\n\nSo frightened is **Shaken plus compulsory flight**. It is not as total as **Panicked**, which also drops your gear and takes away your ability to fight even when cornered.\n\n**The fear ladder stacks upward**: an effect that makes an already-**Shaken** creature shaken instead makes it **Frightened**. Frightened + another fear effect → **Panicked**. Panicked and cornered → **Cowering**.\n\nAll of it is **mind-affecting fear**. Paladins are **immune to fear** from 3rd level via **aura of courage**, which also gives allies within 10 feet a **+4 morale bonus on saves against fear**. *Remove fear* likewise grants a **+4 morale bonus on saves vs fear** and suppresses the condition.',
    seeAlso: ['Shaken', 'Panicked', 'Cowering'],
    aliases: ['fear', 'frightened', 'afraid'],
  },
  {
    term: 'Grappled',
    kind: 'condition',
    short: 'Held: −4 Dex, −2 to attacks and CMB, can\'t move, no two-handed actions, and casting needs a check.',
    body:
      'You are being held by another creature (or effect).\n\n· **−4 penalty to Dexterity** — flowing into AC, Reflex, and Dex skills.\n· **−2 penalty on all attack rolls** and **combat maneuver checks**, **except** checks made to **grapple** or **escape**.\n· You **cannot move** (unless your grappler moves you, or you succeed at escaping).\n· You **cannot take any action that requires two hands**.\n· You **cannot make attacks of opportunity**.\n· Casting a spell requires a **concentration check, DC 10 + the grappler\'s CMB + the spell\'s level**, and you **cannot cast any spell with a somatic component** unless you succeed at that check.\n\n**Escaping**: as a **standard action**, either a **CMB check** or an **Escape Artist check** against the grappler\'s **CMD**. Success ends the condition.\n\n**Important**: the **grappler is also grappled** in PF1 (both creatures gain the condition) — unless it has **Greater Grapple** or the **grab** ability with the right rider. That mutual penalty is the balancing cost, and it is what makes **Improved Grapple** and monk builds worth the feat investment.\n\nMaintaining a grapple on your turn is a **standard action** (a CMB check vs the target\'s CMD); succeeding by 5+ lets you **Pin** instead.',
    seeAlso: ['Pinned', 'Entangled', 'Combat Maneuver Bonus', 'Combat Maneuver Defense', 'Concentration Check'],
    aliases: ['grapple', 'grappled', 'grab'],
  },
  {
    term: 'Helpless',
    kind: 'condition',
    short: 'Paralyzed, bound, sleeping, or unconscious: your Dex is treated as 0 and you can be coup de graced.',
    body:
      '**Helpless** is the umbrella state for a creature that is **paralyzed, held, bound, sleeping, unconscious, or otherwise at an attacker\'s mercy**.\n\n· Your **Dexterity is treated as 0** — a **−5 modifier** to AC, Reflex saves, and everything else Dex touches.\n· **Melee attackers get a +4 bonus on attack rolls** against you (this stacks with the −5 Dex, so a helpless target is roughly **9 points easier** to hit in melee).\n· **Ranged attackers get no bonus** beyond the Dex loss.\n· You can be **coup de graced**.\n\n**Coup de grace** is the reason this condition is terrifying: a **full-round action** that **provokes**, delivers an **automatic hit** and an **automatic critical hit**, and then forces the victim to make a **Fortitude save (DC 10 + the damage dealt)** or **die outright**, regardless of remaining HP. Rogues add **Sneak Attack** to it.\n\nA creature that is **Cowering**, **Stunned**, or **Flat-Footed** is **not** helpless — those deny Dex or block actions but don\'t permit a coup de grace. Only true helplessness does.\n\nThis is why *hold person*, *sleep*, and *color spray* remain among the deadliest low-level spells in the game.',
    seeAlso: ['Paralyzed', 'Unconscious', 'Full-Round Action', 'Flat-Footed'],
    aliases: ['helpless', 'coup de grace', 'coup', 'at your mercy'],
  },
  {
    term: 'Nauseated',
    kind: 'condition',
    short: 'You can do nothing but take a single move action each round — no attacks, no spells, no concentration.',
    body:
      'You are so sick you can barely function.\n\n· You are **unable to attack, cast spells, concentrate on spells**, or do **anything else requiring attention**.\n· **The only action you can take is a single move action per turn.**\n\nThat is a near-total lockout. Nauseated is one of the most crippling non-lethal conditions in PF1 — strictly worse than **Staggered**, because staggered at least lets you take a standard action.\n\nCommon sources: **stinking cloud** (a Fortitude save each round while inside, and you stay nauseated for **1d4+1 rounds** after leaving), many poisons, ghoul-like stenches, **troglodyte stench**, and *contagion*.\n\n**Immunities matter enormously here**: creatures immune to poison and most **stench** effects are unaffected, as are undead and constructs. *Delay poison* does not help against stinking cloud (it isn\'t poison), but **holding your breath** does not help either — stinking cloud is an inhaled effect but the save is required each round you are in it.\n\n*Neutralize poison*, *heal*, and *restoration* clear it depending on the source; **Sickened** is the milder cousin.',
    seeAlso: ['Sickened', 'Staggered', 'Dazed'],
    aliases: ['nausea', 'nauseated', 'stinking cloud'],
  },
  {
    term: 'Panicked',
    kind: 'condition',
    short: 'You drop everything and run: −2 to saves, skills and ability checks, and you can\'t fight even if cornered.',
    body:
      'The worst rung of the fear ladder short of cowering.\n\n· You **drop everything you are holding**.\n· You **flee at top speed** from the source of your fear, and from anything else that threatens you along the way.\n· **−2 penalty** on **saving throws**, **skill checks**, and **ability checks**.\n· You **can\'t take any other actions** while fleeing — though you **may** use spells or abilities that **help you flee** (*expeditious retreat*, *dimension door*).\n· **If cornered** and unable to flee, you **Cower** instead. You do **not** get to fight.\n\nThat last rule is the key difference from **Frightened**, which lets a cornered creature fight. A panicked party member is out of the fight entirely and has just littered the floor with their weapon.\n\nNote the penalty list: panicked does **not** give −2 on **attack rolls**, because a panicked creature isn\'t supposed to be attacking at all.\n\nSources: *fear* (4th level), a dragon\'s frightful presence on a bad roll, and any fear effect stacked on top of an already-**Frightened** creature. **Mind-affecting** — Paladins and the fearless are immune.',
    seeAlso: ['Frightened', 'Cowering', 'Shaken'],
    aliases: ['panic', 'panicked'],
  },
  {
    term: 'Paralyzed',
    kind: 'condition',
    short: 'Str and Dex drop to 0: you are frozen, helpless, and can only take purely mental actions.',
    body:
      'Your body will not obey you.\n\n· **Strength and Dexterity are reduced to 0**. You are **helpless** and treated as such (**−5 to AC** from Dex 0, melee attackers get **+4**, and you can be **coup de graced**).\n· You **cannot move or take physical actions**. You **can** take **purely mental actions** — casting a spell with **no verbal, somatic, material, or focus components** is technically possible; nearly nothing qualifies.\n· A **winged creature that is paralyzed while flying falls**, taking falling damage.\n· You can still **perceive** everything happening around you, which is the horror of it.\n\nA paralyzed creature is **not** unconscious — it is fully aware. It can be moved by allies, but its own body is dead weight.\n\n**Sources**: *hold person* / *hold monster* (Will save each round to break free, one attempt at the end of each of your turns), ghoul paralysis (Fortitude negates; **elves are immune to ghoul paralysis** specifically), carrion crawler tentacles, and many poisons.\n\n**Counters**: *freedom of movement* prevents it outright and is the single best defense in the game against it; *remove paralysis* cures it.',
    seeAlso: ['Helpless', 'Unconscious', 'Petrified', 'Full-Round Action'],
    aliases: ['paralysis', 'paralyzed', 'hold person'],
  },
  {
    term: 'Petrified',
    kind: 'condition',
    short: 'You are turned to stone: unconscious, inert, and destroyed for good if your pieces are lost.',
    body:
      'You have been **turned to solid stone**.\n\n· You are **unconscious** and completely **inert**. You cannot act, perceive, or be affected by anything that requires a living body.\n· Your statue has **hardness 8** and the hit points of a stone object of your size.\n· **If the statue is broken or damaged, and the pieces are not recovered**, the creature **has that damage or those missing parts when it is restored** — and a shattered statue whose pieces are lost **cannot be restored at all**.\n\nThat last clause is what makes petrification so much worse than death in PF1: a dead body can be *raised*; a shattered statue that has been swept into a river is simply gone.\n\n· Petrified creatures **do not age**, do not need to eat or breathe, and do not deteriorate.\n\n**Sources**: a medusa\'s gaze (**Fortitude negates**), a basilisk\'s gaze, a cockatrice\'s bite, *flesh to stone*.\n\n**Cures**: *stone to flesh* (6th) turns the statue back, though the subject must then make a **DC 15 Fortitude save** or die from the shock. *Break enchantment* and *greater restoration* also work. Carry a mirror.',
    seeAlso: ['Paralyzed', 'Helpless', 'Unconscious'],
    aliases: ['petrify', 'petrified', 'turned to stone', 'medusa'],
  },
  {
    term: 'Pinned',
    kind: 'condition',
    short: 'Tightly bound: can\'t move, flat-footed, an extra −4 to AC, and limited to verbal and mental actions.',
    body:
      'You are being held **immobile**, not merely grabbed — the upgrade a grappler gets by beating your CMD by **5 or more**.\n\n· You **cannot move** and are **Flat-Footed** (lose Dex to AC).\n· You take an **additional −4 penalty to AC** on top of that.\n· You are limited to **purely verbal and mental actions** — you **cannot** make attacks with weapons.\n· You **cannot cast any spell requiring a somatic or material component**, and casting anything at all requires a **concentration check, DC 10 + the pinner\'s CMB + the spell\'s level**.\n· You **can** attempt to **free yourself**: a **CMB** or **Escape Artist** check as a **standard action** against the pinner\'s **CMD**, which downgrades you to merely **Grappled**, not free.\n\nSo escaping a pin is a **two-step process**: pinned → grappled → free. That is two standard actions minimum, and the grappler gets to re-establish in between.\n\nA **pinned** creature is **not Helpless** — it cannot be coup de graced. But **Tie Up** (a further grapple check against a pinned creature) leaves you bound with rope, and a **bound** creature *is* helpless.\n\nUnlike grappled, the **pinner is not itself pinned** — it just has to keep spending actions to maintain.',
    seeAlso: ['Grappled', 'Flat-Footed', 'Helpless', 'Combat Maneuver Defense', 'Concentration Check'],
    aliases: ['pin', 'pinned', 'tie up'],
  },
  {
    term: 'Prone',
    kind: 'condition',
    short: 'On the ground: −4 to melee attacks, −4 AC vs melee, +4 AC vs ranged, and standing up provokes.',
    body:
      'You are lying on the ground.\n\n· **−4 penalty on melee attack rolls**.\n· You **cannot use a ranged weapon** — **except a crossbow**, which you may fire while prone.\n· **−4 penalty to AC against melee attacks**.\n· **+4 bonus to AC against ranged attacks**.\n\nThat split is the whole tactical story: prone is **bad in melee, good against archers**. Archers and crossbowmen deliberately go prone; anyone in a knife fight desperately wants to get up.\n\n**Standing up** is a **move action** that **provokes attacks of opportunity**. That is the trap of **Trip**: the tripper gets a free swing the moment you get up, which is why Improved Trip and a reach weapon are such a punishing pairing.\n\n**Crawling** moves you 5 feet as a **move action** and **provokes**.\n\nA **Trip** is a combat maneuver (CMB vs CMD). Creatures with **more than two legs** get **+4 CMD against trip**; many creatures **can\'t be tripped at all**.',
    seeAlso: ['Move Action', 'Attack of Opportunity', 'Combat Maneuver Bonus', 'Combat Maneuver Defense'],
    aliases: ['prone', 'knocked down', 'trip', 'tripped'],
  },
  {
    term: 'Shaken',
    kind: 'condition',
    short: '−2 on attack rolls, saving throws, skill checks, and ability checks. The bottom rung of the fear ladder.',
    body:
      'You are rattled.\n\n· **−2 penalty** on **attack rolls**, **saving throws**, **skill checks**, and **ability checks**.\n\nThat is the entire condition — no forced movement, no lost actions. You fight on, just worse. It is the most common fear result and the most commonly applied debuff in the game.\n\nCompare the ladder:\n\n· **Shaken** — −2, keep fighting\n· **Frightened** — −2, **must flee** (may fight if cornered)\n· **Panicked** — drop everything, **flee**, −2 to saves/skills/ability checks (**not** attacks), cower if cornered\n· **Cowering** — no actions, lose Dex, attackers get +2\n\n**Stacking upward**: shaken + another shaken effect = **Frightened**. This is how a party stacks fear — the Intimidating Prowess barbarian **Demoralizes** (Intimidate vs **DC 10 + target HD + Wis mod**) for **1 round** shaken (+1 round per 5 by which you beat the DC), and a second source escalates it.\n\n**Mind-affecting fear.** A **Cornugon Smash**-style build makes every Power Attack apply it. *Remove fear* gives **+4 morale on fear saves** and suppresses it.',
    seeAlso: ['Frightened', 'Panicked', 'Cowering', 'Sickened'],
    aliases: ['shaken', 'demoralize', 'intimidate'],
  },
  {
    term: 'Sickened',
    kind: 'condition',
    short: '−2 on attack rolls, weapon damage rolls, saves, skill checks, and ability checks.',
    body:
      'You feel ill.\n\n· **−2 penalty** on **attack rolls**, **weapon damage rolls**, **saving throws**, **skill checks**, and **ability checks**.\n\nIt is **Shaken plus a damage penalty** — the −2 to **weapon damage rolls** is the one difference, and it is why sickened and shaken **stack** with each other (they are different conditions with untyped penalties from different sources; penalties always stack).\n\nSickened is **not** the same as **Nauseated**, which is a near-total lockout. Nauseated is the severe version; an effect that sickens an already-sickened creature does **not** escalate to nauseated (unlike the fear ladder) unless the effect says so.\n\n**Sources**: many poisons, disease, the **Sickening Critical** feat, and a great many alchemist discoveries and bombs.\n\nThe −2 to damage applies to **weapon damage** only — not spell damage, not Sneak Attack dice as a separate roll (it applies once to the total weapon damage roll).',
    seeAlso: ['Nauseated', 'Shaken', 'Fatigued'],
    aliases: ['sick', 'sickened'],
  },
  {
    term: 'Staggered',
    kind: 'condition',
    short: 'You may take a single move OR standard action each round — not both.',
    body:
      'You are reeling.\n\n· You may take **a single move action or a single standard action each round** — **not both**. You cannot take a **full-round action**.\n· You **may still take free, swift, and immediate actions**.\n· You **can** take a **5-foot step** if you use your action for a standard action.\n\nThe practical effect: **no full attacks, ever**. A staggered martial character loses their entire iterative routine, which for a high-level Fighter is a bigger loss than most direct damage. Staggered is one of the most efficient debuffs in the game for exactly that reason.\n\n**The nonlethal rule**: a creature whose **nonlethal damage exactly equals its current Hit Points** is **staggered**. Exceed it and the creature falls **unconscious**. This is how brawling and subdual work.\n\n**Sources**: *slow* (which also gives −1 attack, −1 AC, −1 Reflex and halves speed), the **Staggering Critical** feat, being at exactly 0 hit points (**Disabled**, functionally similar), many poisons, and *waves of fatigue*-adjacent effects.\n\nCompare **Nauseated** (move action only) and **Dazed** (no actions at all).',
    seeAlso: ['Nauseated', 'Dazed', 'Full-Round Action', 'Iterative Attacks', 'Dying'],
    aliases: ['stagger', 'staggered', 'slow', 'nonlethal'],
  },
  {
    term: 'Stunned',
    kind: 'condition',
    short: 'You drop what you\'re holding, can take no actions, take −2 to AC, and lose your Dex bonus.',
    body:
      'You have been rocked.\n\n· You **drop everything held**.\n· You **can take no actions**.\n· **−2 penalty to AC**.\n· You **lose your Dexterity bonus to AC**.\n\nThe combination of "−2 AC" **and** "lose Dex to AC" makes a stunned character enormously easier to hit — and losing Dex means Rogues can **Sneak Attack** them. Dropping your weapon means that even after the stun ends, you spend a **move action** picking it up (which provokes) or fight unarmed.\n\nThis is what separates **Stunned** from **Dazed**: dazed costs you your actions only; stunned costs you your actions, your AC, your Dex, and your gear.\n\n**Sources**: a Monk\'s **Stunning Fist** (Fortitude save, **DC 10 + ½ monk level + Wis modifier**, stunned for **1 round**), *power word stun*, **Staggering/Stunning Critical** feats, and taking **50+ damage from a single hit** in some optional rules.\n\nDuration is usually **1 round**, occasionally 1d4. Stunned is not **Helpless** — no coup de grace.',
    seeAlso: ['Dazed', 'Staggered', 'Flat-Footed', 'Helpless'],
    aliases: ['stun', 'stunned', 'stunning fist'],
  },
  {
    term: 'Unconscious',
    kind: 'condition',
    short: 'Knocked out and helpless — the state of being at negative HP or asleep.',
    body:
      'You are **knocked out and helpless**. That short definition carries all the weight, because **Helpless** is what actually hurts:\n\n· Your **Dexterity is treated as 0** (**−5** to AC).\n· **Melee attackers get +4 to hit** you.\n· You can be **coup de graced** — an automatic critical hit and a **Fortitude save (DC 10 + damage) or die**.\n\nYou perceive nothing and can take no actions of any kind.\n\n**How you get here**:\n\n· **Hit points below 0** — you are unconscious **and Dying**, losing 1 HP per round until you stabilize or die at **negative your Constitution score**.\n· **Nonlethal damage exceeding your current hit points** — you fall unconscious but are **not** dying. You wake when your nonlethal damage drops below your HP (nonlethal heals at **1 point per hour per character level**).\n· **Sleep**, magical or natural. *Sleep* (1st level) affects **4 HD** of creatures, HD 4 or less each; elves are **immune**.\n\nAt exactly **0 HP** you are not unconscious — you are **Disabled**: conscious, staggered-like, one move or standard action per round, and taking a standard action costs you **1 HP**.',
    seeAlso: ['Dying', 'Helpless', 'Staggered', 'Paralyzed'],
    aliases: ['unconscious', 'knocked out', 'KO', 'asleep', 'sleeping'],
  },
];
