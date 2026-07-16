// lib/dnd/glossary/starfinder1e.ts — Starfinder First Edition rules glossary.
//
// Starfinder is PF1-derived but diverges in ways that matter: two armor classes (EAC/KAC), Stamina
// Points on top of Hit Points, Resolve Points as the pacing currency, ability increases hitting FOUR
// abilities at 5/10/15/20, and — critically — NO critical confirmation roll. Do not import PF1's
// confirm-the-crit rule or PF2's three-action economy.
import type { SystemGlossary } from './types';

export const STARFINDER1E_GLOSSARY: SystemGlossary = [
  // ── Defenses & resources ──────────────────────────────────────────────────────────────────
  {
    term: 'Energy Armor Class',
    kind: 'term',
    short: 'EAC is the AC that energy weapons target — lasers, plasma, and most magic.',
    body:
      '**EAC = 10 + your armor\'s EAC bonus + Dexterity modifier (up to the armor\'s Dex cap) + size modifier + other bonuses.**\n\nAn attack targets **EAC** when it deals **energy damage** — acid, cold, electricity, fire, or sonic. In practice that means:\n\n· **Laser** weapons (fire damage), **plasma** weapons, **shock** weapons, **cryo** weapons, **sonic** weapons\n· Most **spells** that require an attack roll\n· Most **grenades** and area energy effects that call for an attack rather than a save\n\nEvery suit of armor lists **two** numbers — an **EAC bonus** and a **KAC bonus** — and **the KAC bonus is almost always higher** (typically by 1–3 points). That is the core design tension of Starfinder combat: **your EAC is your weaker defense**, so energy weapons hit more often, and kinetic weapons hit harder but land less.\n\nThis is not PF1\'s touch AC. Both EAC and KAC include your **full armor bonus** — they are two complete armor classes, not a "real" one and a stripped-down one. A creature with no armor still has both.',
    seeAlso: ['Kinetic Armor Class', 'Armor', 'Flat-Footed', 'Critical Hit'],
    aliases: ['EAC', 'energy AC', 'energy armor class'],
  },
  {
    term: 'Kinetic Armor Class',
    kind: 'term',
    short: 'KAC is the AC that physical weapons target — bullets, blades, and most combat maneuvers.',
    body:
      '**KAC = 10 + your armor\'s KAC bonus + Dexterity modifier (up to the armor\'s Dex cap) + size modifier + other bonuses.**\n\nAn attack targets **KAC** when it deals **kinetic damage** — bludgeoning, piercing, or slashing. That covers:\n\n· **Projectile** weapons (autotargeting rifles, pistols, sniper rifles), **melee** weapons\n· Unarmed strikes\n· **Combat maneuvers** — but against **KAC + 8**, not plain KAC\n\nThat last rule replaces PF1\'s entire CMB/CMD subsystem. To **Bull Rush, Dirty Trick, Disarm, Grapple, Reposition, Sunder, or Trip**, you make a normal melee attack roll against the target\'s **KAC + 8**. There is no separate maneuver bonus to track: your attack bonus *is* your maneuver bonus.\n\nBecause armor\'s **KAC bonus is typically higher than its EAC bonus**, KAC is your **stronger** defense. Kinetic weapons compensate with better damage dice and often stronger critical effects.\n\nWhen you\'re building or reading a statblock, both numbers appear side by side (e.g. "EAC 14, KAC 16"). Always check which one an attack targets before you compare the roll.',
    seeAlso: ['Energy Armor Class', 'Armor', 'Combat Maneuvers', 'Flat-Footed'],
    aliases: ['KAC', 'kinetic AC', 'kinetic armor class'],
  },
  {
    term: 'Stamina Points',
    kind: 'term',
    short: 'The first pool damage eats through — grit and stress, refilled in 10 minutes for 1 Resolve Point.',
    body:
      '**Stamina Points (SP)** represent your ability to shrug off blows: near misses, glancing hits, fatigue. **Damage always reduces Stamina Points first**, and only once SP hits 0 does it start on **Hit Points**.\n\n· Your SP total = **your class\'s Stamina per level + your Constitution modifier per level**. A Soldier (7 SP/level) with Con +3 has **10 SP at 1st level**, 20 at 2nd, and so on.\n· Excess damage from a single hit **carries over** from SP into HP — nothing is lost in the gap.\n· **Bleed damage bypasses Stamina Points entirely** and goes straight to Hit Points. So does any effect that specifies it.\n\n**Recovering SP** is the heart of Starfinder\'s pacing: spend **1 Resolve Point** and take a **10-minute rest**, and you regain **all** your Stamina Points. You can only do this if you have at least 1 RP to spend, and you must actually rest — no strenuous activity.\n\nThis means the party heals itself between fights, without a dedicated healer, at the cost of a finite daily currency. It also means the *real* damage threshold in any fight is your **Hit Points** — SP is the buffer that makes the first fight of the day cheap and the fifth one terrifying.',
    seeAlso: ['Hit Points', 'Resolve Points', 'Dying'],
    aliases: ['SP', 'stamina', 'stamina points'],
  },
  {
    term: 'Hit Points',
    kind: 'term',
    short: 'The second, harder-to-heal pool — real wounds that only come back overnight or with magic.',
    body:
      '**Hit Points (HP)** are actual injury. Damage only reaches them once your **Stamina Points** are gone.\n\n· Your HP total = **your race\'s HP** (usually **4**, sometimes 6) **+ your class\'s HP per level**. A Human (4) Soldier (7 HP/level) has **11 HP at 1st level**, and gains 7 per level after. Note that **Constitution does not add to HP** in Starfinder — it adds to **Stamina** instead. That is a deliberate reversal of PF1.\n· Dropping to **0 Hit Points** makes you **Dying** and unconscious.\n\n**Recovering HP** is deliberately slow and is what makes an adventuring day finite:\n\n· A **full night\'s rest (8 hours)** restores **HP equal to your character level**, and also refreshes your **Resolve Points**.\n· **Magic** (*mystic cure*), a **medical lab**, a **Medicine** check to treat deadly wounds, or a **serum of healing** are the fast routes.\n· The 10-minute/1-RP rest that refills all your Stamina does **nothing** for Hit Points.\n\nSo the practical rhythm: burn SP freely, spend RP to reset it between encounters, and treat every point of HP damage as a real cost that follows you to the next fight.',
    seeAlso: ['Stamina Points', 'Resolve Points', 'Dying', 'Bleeding'],
    aliases: ['HP', 'hit points', 'health'],
  },
  {
    term: 'Resolve Points',
    kind: 'mechanic',
    short: 'The daily currency that refills Stamina, keeps you alive when dying, and powers class capstones.',
    body:
      '**Resolve Points (RP)** are Starfinder\'s central meta-resource.\n\n· Your pool = **half your character level (minimum 1) + your key ability score modifier**. A 6th-level Operative with Dex +5 has **8 RP**.\n· They **refresh after a full night\'s rest (8 hours)**.\n\nThe three things they do:\n\n· **Refill Stamina** — spend **1 RP** and take a **10-minute rest** to restore **all** your Stamina Points. This is where most of your RP goes, and it is why RP is really "how many more fights can we take today?"\n· **Stay alive** — while **Dying**, you must spend **1 RP at the start of each of your turns to stabilize**. If you have none, you die. Running out of Resolve is how characters actually die in Starfinder.\n· **Power abilities** — many class features cost RP: a Solarian\'s zenith revelations, an Operative\'s tricks, and every class\'s high-level **capstone-tier** abilities. Several 20th-level capstones are explicitly fueled by (or refund) Resolve.\n\nRP can also be spent on a handful of universal options, such as taking **20 on a skill check** in some circumstances or pushing through certain conditions when a feature allows it.\n\nThe design intent is explicit: RP replaces the "healer with a wand" economy of PF1 with a self-managed budget every character controls.',
    seeAlso: ['Stamina Points', 'Dying', 'Hit Points', 'Solarian'],
    aliases: ['RP', 'resolve', 'resolve points'],
  },
  {
    term: 'Armor',
    kind: 'term',
    short: 'Every suit gives both an EAC and a KAC bonus, plus a Dex cap, and comes in light or heavy.',
    body:
      'Armor in Starfinder always lists a pair of bonuses:\n\n· **EAC Bonus** and **KAC Bonus** — added to the respective armor class. **KAC is normally 1–3 higher than EAC** on the same suit.\n· **Maximum Dex Bonus** — the cap on how much Dexterity you can add to either AC. Light armor has a generous cap; heavy armor a tight one.\n· **Armor Check Penalty** — applies to Str- and Dex-based skills.\n· **Speed Adjustment** — heavy armor typically slows you.\n· **Upgrade Slots** — how many armor upgrades (jump jets, infrared sensors, forcepacks) you can install.\n\nArmor comes in **light** and **heavy** categories (plus **powered armor** at higher levels, which sets your Strength and has its own frame). Proficiency is **binary** — you have **Light Armor Proficiency** or you don\'t, and using armor you aren\'t proficient with costs you a **−4 penalty to attacks** and applies the armor check penalty to attacks too.\n\nArmor is also gear you replace roughly every few levels rather than enchant: item level scales, and a level-6 suit simply has better numbers than a level-2 suit. There is no PF1-style "+1 enhancement bonus" treadmill.',
    seeAlso: ['Energy Armor Class', 'Kinetic Armor Class', 'Broken'],
    aliases: ['armor', 'armour', 'dex cap', 'powered armor'],
  },

  // ── Core resolution ───────────────────────────────────────────────────────────────────────
  {
    term: 'Critical Hit',
    kind: 'mechanic',
    short: 'A natural 20 that hits is a critical hit immediately — Starfinder has NO confirmation roll.',
    body:
      'A **natural 20** on an attack roll is an **automatic hit** and a **critical hit**. A **natural 1** is an **automatic miss**.\n\n**There is no confirmation roll.** This is the single biggest departure from Pathfinder 1e: you do not roll a second attack to see whether the crit "sticks". Roll a 20, it hits, it crits. Full stop.\n\nOn a critical hit you **double the damage dice and modifiers** (roll the dice twice, or equivalently double the total — the game states you roll twice and add). **Precision damage** (like an Operative\'s Trick Attack damage) and **extra damage dice from weapon fusions** are **not** multiplied.\n\nAlso unlike PF1: **weapons have no threat range**. There is no 19–20 or 18–20 weapon, no **keen** property, no **Improved Critical** feat widening the window. Every weapon crits on a natural 20 and only a natural 20.\n\nWhat weapons have instead is a **critical effect** — a rider like *burn 1d6*, *bleed 1d6*, *knockdown*, or *staggered* that triggers on any crit. That is where weapon identity lives.\n\nSome creatures and constructs are **immune to critical hits**; they take normal damage and ignore the critical effect.',
    seeAlso: ['Critical Effects', 'Base Attack Bonus', 'Kinetic Armor Class'],
    aliases: ['crit', 'critical', 'natural 20', 'no confirmation'],
  },
  {
    term: 'Critical Effects',
    kind: 'mechanic',
    short: 'A rider that fires on any critical hit — burn, bleed, knockdown, staggered, and more.',
    body:
      'Most weapons list a **critical effect** alongside their damage. It triggers **whenever you score a critical hit** — no extra roll, no confirmation.\n\nThe common ones:\n\n· **Burn Xd6** — the target gains the **Burning** condition for that much fire damage per round. Standard on **flame** and **plasma** weapons.\n· **Bleed Xd6** — the target gains the **Bleeding** condition. Crucially, **bleed damage bypasses Stamina Points** and goes straight to Hit Points, which makes bleed weapons far nastier than their dice suggest.\n· **Knockdown** — the target is knocked **Prone** (no save, no maneuver check).\n· **Staggered** — the target must succeed at a **Fortitude save** (DC = 10 + half the item\'s level + the wielder\'s key ability modifier) or be staggered for 1 round.\n· **Wound** — a Fortitude save or the target gains a lasting injury.\n· **Corrode Xd6**, **Arc Xd6**, **Deafen**, **Stunned**, **Injection DC +2**, **Severe Wound**, **Blind**.\n\nThe effect is what gives each weapon line a personality. Choosing between a laser rifle (fire, **burn**) and a sniper rifle (piercing, **bleed** or **wound**) is a choice about what your crits *do*, not just what they hit.\n\nCreatures **immune to critical hits** ignore the effect entirely.',
    seeAlso: ['Critical Hit', 'Burning', 'Bleeding', 'Prone', 'Staggered'],
    aliases: ['critical effect', 'burn', 'bleed', 'knockdown', 'wound'],
  },
  {
    term: 'Base Attack Bonus',
    kind: 'mechanic',
    short: 'The class-driven attack number — full (= level) or ¾ — and the source of iterative attacks in a full attack.',
    body:
      '**Base Attack Bonus (BAB)** is your class\'s attack progression. Starfinder has only **two**:\n\n· **Full BAB** — equal to your level. **Soldier**, **Solarian**, **Vanguard**.\n· **¾ BAB** — ¾ of your level, rounded down. **Envoy**, **Mechanic**, **Mystic**, **Operative**, **Technomancer**, **Biohacker**, **Witchwarper**.\n\nThere is **no poor (½) progression** — Starfinder deleted it, so even full casters keep up better than a PF1 wizard.\n\n**Attack roll** = d20 + BAB + Strength modifier (melee) or Dexterity modifier (ranged) + weapon\'s item bonuses + other typed bonuses. There is **no proficiency bonus** — weapon proficiency is **binary**, and attacking with a weapon you lack proficiency in costs you **−4**.\n\nBAB also drives **combat maneuvers** (a normal attack roll vs **KAC + 8**) and gunnery in **starship combat**.\n\n**Full attack**: a full action that gives you **two attacks**, each at a **−4 penalty**, regardless of your BAB. That is the crucial break from PF1 — Starfinder does **not** use the +6/+11/+16 iterative ladder. High-level Soldiers get a third attack via the **Soldier\'s Onslaught**-style class features, but the baseline is always two-at-−4.',
    seeAlso: ['Action Economy', 'Combat Maneuvers', 'Skill Ranks', 'Saving Throws'],
    aliases: ['BAB', 'base attack', 'attack bonus', 'full attack'],
  },
  {
    term: 'Saving Throws',
    kind: 'mechanic',
    short: 'Three saves — Fortitude, Reflex, Will — on a good (2 + ½ level) or poor (⅓ level) progression.',
    body:
      'Starfinder keeps PF1\'s **three saving throws**, never six per-ability saves:\n\n· **Fortitude** — Constitution. Poison, disease, radiation, vacuum, raw trauma.\n· **Reflex** — Dexterity. Grenades, explosions, area effects.\n· **Will** — Wisdom. Mind-affecting effects, fear, illusion.\n\nEach class rates each save as **good** or **poor**:\n\n· **Good save** = **2 + ½ × level**, rounded down → +2 at 1st, +6 at 8th, +12 at 20th\n· **Poor save** = **⅓ × level**, rounded down → +0 at 1st, +2 at 8th, +6 at 20th\n\nAdd the governing ability modifier and any typed bonuses (**resistance** bonuses from armor upgrades are the common one).\n\nA **natural 1 always fails and a natural 20 always succeeds** on a save. There are **no degrees of success** — effects define their own "half damage on a successful save" riders, exactly as in PF1.\n\nSave DCs from your abilities are usually **10 + half your level + your key ability modifier**; spell DCs are **10 + the spell\'s level + your key ability modifier**.',
    seeAlso: ['Base Attack Bonus', 'Ability Increases', 'Spells'],
    aliases: ['saves', 'fortitude', 'reflex', 'will', 'save DC'],
  },
  {
    term: 'Skill Ranks',
    kind: 'mechanic',
    short: 'Ranks capped at your level, plus a flat +3 the first time you rank a class skill.',
    body:
      'Each level you gain **skill ranks equal to your class\'s ranks per level + your Intelligence modifier** (minimum 1). **Humans** get **+1 rank per level**.\n\n· **Maximum ranks in one skill = your character level.**\n· A **class skill** with **at least 1 rank** gets a flat **+3 class-skill bonus** — once, not per rank, and **nothing** at 0 ranks.\n\nSkill check = **d20 + ranks + class-skill bonus + ability modifier + typed bonuses + armor check penalty**.\n\nStarfinder\'s skill list is trimmed and modernized from PF1 — **Computers**, **Engineering**, **Piloting**, **Life Science**, **Physical Science**, and **Mysticism** replace the Knowledge tree; **Athletics** merges Climb and Swim; **Culture** covers languages and societies; **Medicine** is **Intelligence**-based, not Wisdom.\n\nA character\'s **theme** grants a +1 to a specific skill and makes it a class skill — that\'s how a Scholar or Ace Pilot is expressed mechanically.\n\nSome skills are **trained only** (Computers, Culture, Engineering, Life Science, Medicine, Mysticism, Physical Science, Piloting, Sleight of Hand) — 0 ranks means you cannot attempt most of their uses at all.',
    seeAlso: ['Ability Increases', 'Base Attack Bonus', 'Starship Roles'],
    aliases: ['skills', 'ranks', 'class skill', 'skill points', 'theme'],
  },
  {
    term: 'Ability Increases',
    kind: 'mechanic',
    short: 'At 5th, 10th, 15th, and 20th you raise FOUR different abilities at once: +2 if the score is 16 or lower, else +1.',
    body:
      'At **5th, 10th, 15th, and 20th level** you apply an ability score increase to **four different ability scores**:\n\n· **+2** if the score is **16 or lower**\n· **+1** if the score is **17 or higher**\n\nAll four at once. This is unique to Starfinder — it is **not** PF1\'s single **+1 at 4/8/12/16/20**, and it is **not** 5e\'s +2 ASI-or-feat.\n\nThe consequence is deliberate: Starfinder characters are **broadly competent**. Everyone\'s secondary stats climb steadily, so the Soldier has a usable Intelligence and the Technomancer has a usable Constitution. It also means you rarely dump a stat to 8 and leave it there — the +2 threshold rewards raising your low scores.\n\nAt character creation you use a **10-point buy from a base of 10** in every score (each +1 costs **1 point up to 16**, then **2 points** each beyond), then apply your **race\'s ability adjustments** and your **theme\'s +1**.\n\nFeats are a separate track entirely: **one feat at every odd level** (1, 3, 5…19), plus class and theme bonus feats. They never trade against ability increases.',
    seeAlso: ['Skill Ranks', 'Saving Throws'],
    aliases: ['ASI', 'ability increase', 'ability score increase', 'stat bump', 'point buy'],
  },
  {
    term: 'Action Economy',
    kind: 'mechanic',
    short: 'One standard + one move + one swift per round, or a single full action — plus one reaction.',
    body:
      'Each round you get:\n\n· **1 standard action** — attack once, cast most spells, activate an item, use most class features\n· **1 move action** — move your speed, stand up (**provokes**), draw a weapon, reload, take cover\n· **1 swift action** — quick class features, some reloads\n· **1 reaction** — the *only* reaction most characters have; taken on someone else\'s turn\n· Any number of **free actions**\n\nOr, instead of the standard + move:\n\n· **1 full action** — a **full attack** (two attacks at **−4** each), a **charge**, a **withdraw**, or a long activity\n\nThis is PF1\'s structure with two important changes. **First**: Starfinder replaces PF1\'s open attack-of-opportunity system with a single **reaction**, and **Flat-Footed** specifically **prevents you from taking reactions** at all. **Second**: full attack is always **two attacks at −4**, not a BAB-driven iterative ladder.\n\nA **guarded step** (Starfinder\'s 5-foot step) lets you move 5 feet **without provoking**, as long as you don\'t otherwise move that round.\n\nStarfinder has **no three-action economy** — that is PF2. And it has **no bonus action** — that is 5e.',
    seeAlso: ['Base Attack Bonus', 'Flat-Footed', 'Combat Maneuvers', 'Prone'],
    aliases: ['actions', 'action economy', 'standard action', 'move action', 'swift action', 'reaction'],
  },
  {
    term: 'Combat Maneuvers',
    kind: 'mechanic',
    short: 'Trip, grapple, disarm and the rest are just melee attacks against the target\'s KAC + 8.',
    body:
      'Starfinder threw out PF1\'s **CMB/CMD** entirely. A combat maneuver is a **normal melee attack roll** against the target\'s **KAC + 8**.\n\nThe maneuvers:\n\n· **Bull Rush** — push the target 5 feet (plus 5 more per 5 points you beat the DC by)\n· **Dirty Trick** — inflict a condition (**blinded**, **deafened**, **entangled**, **off-target**, **sickened**) for 1 round\n· **Disarm** — knock a held item free\n· **Grapple** — the target becomes **grappled**; beat the DC by 5+ and it is **pinned** instead\n· **Reposition** — move the target to another square you threaten\n· **Sunder** — damage the target\'s equipment; enough damage makes the item **Broken**\n· **Trip** — the target falls **Prone**\n\nA maneuver **provokes** unless you have the corresponding **Improved** feat, which also grants a **+4 bonus** to the attempt (not PF1\'s +2). The **Greater** version gives another **+4**.\n\nBecause the target number is **KAC + 8**, your regular attack bonus *is* your maneuver bonus — there is no separate stat on your sheet. And because it scales off armor, maneuvers stay roughly as viable at 15th level as at 1st.\n\n**Note**: a **grappled** creature in Starfinder does **not** also grapple you back — a real simplification from PF1.',
    seeAlso: ['Kinetic Armor Class', 'Base Attack Bonus', 'Grappled', 'Pinned', 'Broken'],
    aliases: ['maneuver', 'combat maneuver', 'trip', 'grapple', 'disarm', 'CMB'],
  },
  {
    term: 'Spells',
    kind: 'mechanic',
    short: 'Only Mystics and Technomancers cast, only spontaneously, and only up to 6th-level spells.',
    body:
      'Magic in Starfinder is deliberately capped.\n\n· **Spells run 0 (cantrips) through 6th level only.** There is no 7th, 8th, or 9th level. No *wish*, no *time stop*, no *gate*, no *resurrection* as a spell. The 6th-level ceiling is arrived at around **16th level**.\n· The **full casters** are the **Mystic** (Wisdom, connection-based) and the **Technomancer** (Intelligence, magic-hacking). The **Witchwarper** (Charisma) is the third.\n· All of them are **spontaneous** casters: a small list of **spells known**, cast freely from **spell slots** of the appropriate level. There is **no prepared casting** in Starfinder — no spellbook to fill each morning.\n· **Cantrips** are cast at will.\n· **Soldier**, **Solarian**, **Operative**, **Envoy**, **Mechanic**, **Vanguard**, and **Biohacker** have **no spellcasting at all**.\n\n**Save DC = 10 + the spell\'s level + your key ability modifier.** Casting a spell in a threatened square **provokes** unless you cast defensively (a **Concentration check**).\n\nWhy the cap exists: Starfinder wanted technology to stay relevant against magic. A 6th-level spell ceiling means a Technomancer never trivially eclipses a Soldier with a good gun, and the party\'s answers to problems stay diverse.',
    seeAlso: ['Mystic', 'Technomancer', 'Saving Throws', 'Resolve Points'],
    aliases: ['spellcasting', 'spells', 'spell level', 'cantrip', 'spell slots'],
  },

  // ── Starship combat ───────────────────────────────────────────────────────────────────────
  {
    term: 'Starship Combat',
    kind: 'mechanic',
    short: 'A separate three-phase minigame where the whole party crews one ship, each in a role.',
    body:
      'Starship combat is its own subsystem with its own turn structure. The party doesn\'t roll initiative individually — **the ship** acts, and each PC contributes by taking actions in a **role**.\n\nEach round runs in **three phases**, in this order:\n\n· **Engineering phase** — the Engineer (and Science Officer, in some actions) acts. Divert power, patch damaged systems, hold it together.\n· **Helm phase** — the **Pilot** maneuvers, and the **Science Officer** acts (scan, target system, balance shields, lock on). Piloting checks determine order of movement within the phase; each ship moves and turns according to its **speed** and **maneuverability**.\n· **Gunnery phase** — the **Gunners** fire. Weapons are locked into **arcs** (forward, port, starboard, aft, turret), so where the Pilot left the ship in the Helm phase decides what the Gunners can shoot.\n\nThe **Captain** is the exception: they can act in **any phase**, encouraging or ordering a crewmate to boost their check.\n\nShips have **Hull Points**, **Shields** (allocated by quadrant — forward/port/starboard/aft), a **Power Core** budget, an **AC** and a **Target Lock** (TL) that gunnery targets, and **critical damage** thresholds that break systems as hull drops.\n\nThe phase order is the whole game: the Engineer sets up, the Pilot decides the geometry, the Gunners cash it in.',
    seeAlso: ['Starship Roles', 'Skill Ranks'],
    aliases: ['starship', 'ship combat', 'space combat', 'phases', 'hull points'],
  },
  {
    term: 'Starship Roles',
    kind: 'mechanic',
    short: 'Five crew jobs — captain, pilot, gunner, engineer, science officer — each with its own actions and skill.',
    body:
      'In starship combat every PC takes a **role**. A ship needs a minimum crew, but a PC can usually fill more than one if short-handed.\n\n· **Pilot** — acts in the **Helm phase** using **Piloting**. Moves the ship, and can attempt **stunts** (Flyby, Slide, Turn in Place, Barrel Roll, Evade, Flip and Burn) against a DC to gain position or an AC bonus. The pilot\'s roll also sets the ship\'s initiative.\n· **Gunner** — acts in the **Gunnery phase**. A gunnery check is **d20 + BAB (or ranks in Piloting) + Dexterity modifier + the ship\'s bonuses**, versus the target ship\'s **AC** (or **TL** for tracking weapons). Fire at Will splits fire at a penalty; Shoot fires one weapon.\n· **Engineer** — acts in the **Engineering phase** using **Engineering**. **Divert** power to shields/weapons/engines, **Hold It Together** (double a system\'s effective status), **Patch** a damaged system, **Overpower**.\n· **Science Officer** — acts in the **Helm phase** using **Computers**. **Scan** an enemy ship for information, **Target System** to hit a specific component, **Balance** the shields between quadrants, **Lock On** for a bonus to gunnery.\n· **Captain** — acts in **any phase**, once per round, using **Diplomacy**, **Intimidate**, or **Bluff**. **Encourage** a crewmate (+2 to their check), **Demand** (a bigger bonus, harder DC), **Taunt** the enemy crew, **Orders**.\n\nThe design goal is that everyone at the table has something to roll in a space fight, including the Envoy who cannot fly and cannot shoot.',
    seeAlso: ['Starship Combat', 'Skill Ranks', 'Envoy'],
    aliases: ['roles', 'crew', 'pilot', 'gunner', 'engineer', 'science officer', 'captain'],
  },

  // ── Class identity ────────────────────────────────────────────────────────────────────────
  {
    term: 'Solarian',
    kind: 'class',
    short: 'A star-powered warrior who manifests a solar weapon and swings between photon and graviton attunement.',
    body:
      'The **Solarian** draws power from stars and the space between them. **Charisma** is the key ability, **7 SP / 7 HP per level**, **full BAB**, good **Fortitude**.\n\n· **Solar Manifestation** — at 1st level you choose a **solar weapon** (a blade of light that you can shape as you like, dealing damage that scales with your level), a **solar armor**, or a **solar shield**. It appears and vanishes as a **standard action** (later, faster).\n· **Stellar Revelations** — your powers, split into **photon** (fire, damage, aggression) and **graviton** (gravity, control, defense) camps, plus a few that work regardless.\n\n**Attunement** is the class:\n\n· You start every combat **unattuned**.\n· Using a **photon** revelation moves you toward **photon-attuned**; a **graviton** revelation moves you toward **graviton-attuned**. It takes **two rounds of pushing the same direction** to become fully attuned to that mode.\n· **You cannot jump straight from photon to graviton** — you must pass **back through unattuned**. Swapping sides costs you time.\n· **Zenith revelations** — the class\'s big guns — require you to be **fully attuned** in the matching mode, and using one **immediately resets you to unattuned**.\n· Attunement **resets to unattuned when combat ends**.\n\nThe result is a rhythm: build up, spend the zenith, rebuild. A Solarian who wants both sides has to spend rounds swinging the pendulum, and that push-pull is the entire tactical identity of the class.',
    seeAlso: ['Resolve Points', 'Base Attack Bonus', 'Ability Increases'],
    aliases: ['solarian', 'attunement', 'solar weapon', 'photon', 'graviton', 'zenith'],
  },
  {
    term: 'Envoy',
    kind: 'class',
    short: 'The face and battlefield leader: no spells, no full BAB, but improvisations that make everyone else better.',
    body:
      'The **Envoy** is Starfinder\'s support class — a captain, a negotiator, a con artist. **Charisma** key, **6 SP / 6 HP per level**, **¾ BAB**, good **Reflex** and **Will**, **8 skill ranks per level** (the most in the game alongside the Operative).\n\n· **Envoy Improvisations** — the class\'s whole engine. You gain one at **1st level and at every even level thereafter**, choosing from a long list. Many are **expertise talents** that key off your **Expertise** die.\n· **Expertise** — you can add an **expertise die** (starting at **1d6**) to certain skill checks, and it improves at higher levels. It applies to Sense Motive at 1st, and to more skills as you take **Skill Expertise** improvisations.\n\nThe signature improvisations:\n\n· **Get \'Em** — a **move action**; allies gain a **+1 bonus to attacks** against enemies in a 60-foot area for a round. Scales up with level.\n· **Inspiring Boost** — a **standard action**; an ally who can hear you regains **Stamina Points** equal to **twice your envoy level + your Charisma modifier**. They can\'t benefit again until they take a 10-minute rest. This is the party\'s free healing, and it costs no Resolve.\n· **Clever Feint** — a **standard action** Bluff check to make a target **Flat-Footed** — which in Starfinder also strips their reaction.\n· **Dispiriting Taunt** — an Intimidate check to make a target **Shaken**.\n\nEnvoys have **no spellcasting**. They win by handing the Soldier a +1 and topping the Solarian back up.',
    seeAlso: ['Stamina Points', 'Flat-Footed', 'Starship Roles', 'Skill Ranks'],
    aliases: ['envoy', 'improvisation', 'improvisations', 'get em', 'inspiring boost'],
  },
  {
    term: 'Technomancer',
    kind: 'class',
    short: 'The arcane hacker: Intelligence-based spontaneous casting to 6th level, plus magic hacks.',
    body:
      'The **Technomancer** treats magic as code. **Intelligence** key, **5 SP / 5 HP per level** (the frailest class alongside the Witchwarper), **¾ BAB**, good **Will**.\n\n· **Spells** — **spontaneous** casting from a list of **spells known**, using spell slots. **Levels 0–6 only** — the ceiling arrives at 16th level. Cantrips at will.\n· **Spell Cache** — at 1st level you bind your magic into an object, an implant, or a tattoo. Once per day it lets you cast **any one spell you know** without expending a slot.\n· **Magic Hacks** — gained at **2nd level and every 3 levels after**, these are the class\'s tricks: **Cache Capacitor** (a persistent buff hung on your spell cache), **Fabricate Tech**, **Countertech**, **Empowered Weapon**, **Spell Sniper**.\n· **Techlore** — a scaling bonus to **Computers**, **Engineering**, and **Mysticism** checks to identify or manipulate technology.\n\nThe Technomancer is the party\'s **Computers/Engineering** specialist as well as its blaster, which is why it doubles so naturally as a starship **Engineer** or **Science Officer**.\n\nCompare the **Mystic**: same 6th-level ceiling, same spontaneous casting, but Wisdom-based, healing-focused, and drawing on a **connection** rather than on hacking reality.',
    seeAlso: ['Spells', 'Mystic', 'Starship Roles', 'Skill Ranks'],
    aliases: ['technomancer', 'magic hack', 'spell cache'],
  },
  {
    term: 'Mystic',
    kind: 'class',
    short: 'The Wisdom-based spontaneous caster with a connection — the closest thing Starfinder has to a healer.',
    body:
      'The **Mystic** channels a **connection** to something greater. **Wisdom** key, **6 SP / 6 HP per level**, **¾ BAB**, good **Will**.\n\n· **Spells** — **spontaneous** casting, **levels 0–6 only**, from a list of spells known. *Mystic cure* is the party\'s reliable Hit Point healing (Stamina refills from rest and RP; **HP** genuinely needs magic).\n· **Connection** — chosen at 1st level, it defines the character: **Healer**, **Empath**, **Mindbreaker**, **Overlord**, **Star Shaman**, **Xenodruid**, **Akashic**. Each grants a **connection power** at 1st level, bonus connection spells added to your spells known, and further powers at set levels.\n· **Healing Touch** — once per day, a **standard action** that restores a large chunk of Hit Points.\n· **Telepathic Bond** (6th) and **Mindlink** (1st) — the Mystic is also the party\'s silent comms channel.\n· **Channel Skill** — a scaling insight bonus to a small set of skills from your connection.\n\nA Mystic and a Technomancer occupy the same slot mechanically (spontaneous, ¾ BAB, 6th-level ceiling) but pull opposite: the Mystic buffs, heals, and dominates minds; the Technomancer blasts and hacks.\n\nStarfinder has **no prepared casters at all** — a Mystic never fills a spellbook.',
    seeAlso: ['Spells', 'Technomancer', 'Hit Points', 'Resolve Points'],
    aliases: ['mystic', 'connection', 'mystic cure', 'healer'],
  },
  {
    term: 'Operative',
    kind: 'class',
    short: 'The skill monster and precision striker: Trick Attack turns a skill check into extra damage.',
    body:
      'The **Operative** is the spy, scout, and sniper. **Dexterity** key, **6 SP / 6 HP per level**, **¾ BAB**, good **Reflex** and **Will**, **8 skill ranks per level**.\n\n· **Trick Attack** — the class. As a **full action**, move up to your speed and make a **skill check** (Bluff, Intimidate, or Stealth, or another your specialization allows) against a **DC of 20 + the target\'s CR**. On a success, you make a single attack that deals **+1d4 extra damage at 1st level**, scaling up steeply with level, and the target is **Flat-Footed**. This is precision damage — it is **not** multiplied on a critical hit.\n· **Operative\'s Edge** — an untyped bonus to **all skill checks and initiative**, starting at **+1** at 1st level and climbing.\n· **Specialization** — Daredevil, Detective, Explorer, Ghost, Hacker, Spy, Thief. Sets which skill you Trick Attack with and grants exploits.\n· **Operative Exploits** — gained at **2nd level and every 2 levels after**; several cost **Resolve Points**.\n· **Debilitating Trick** (4th) — your Trick Attack can also impose **Flat-Footed** or **Off-Target** on the target.\n· **Operative weapons** — a weapon property; they let you use **Dexterity** for damage as well as attack.\n\nThe Operative trades away full BAB and the full attack routine for one very good hit per round plus the best skills in the game.',
    seeAlso: ['Flat-Footed', 'Off-Target', 'Skill Ranks', 'Resolve Points', 'Critical Hit'],
    aliases: ['operative', 'trick attack', 'operative edge', 'debilitating trick'],
  },
  {
    term: 'Soldier',
    kind: 'class',
    short: 'The heavy-weapons specialist: full BAB, the toughest defenses, and fighting styles.',
    body:
      'The **Soldier** shoots things. **Strength or Dexterity** key (your choice at 1st level), **7 SP / 7 HP per level**, **full BAB**, good **Fortitude**.\n\n· **Primary Fighting Style** — chosen at 1st level and granting a style technique then and at every even level: **Arcane Assailant** (rune-etch your weapon), **Armor Storm** (heavy and powered armor), **Blitz** (+4 initiative and +2 speed, charge like a freight train), **Bombard** (grenades and heavy weapons), **Guard** (defense), **Hit-and-Run**, **Sharpshoot**.\n· **Secondary Fighting Style** at 9th — a second style, picking up its lower-level techniques.\n· **Gear Boosts** — at 1st level and every 2 levels after, permanent equipment upgrades (Armored Advantage, Bullet Barrage, Melee Striker).\n· **Weapon Specialization** — at 3rd level, add your **character level** to damage with weapons you\'re specialized in (**half your level** for small arms). Every class gets a version of this at 3rd; the Soldier\'s covers everything it uses.\n\nWith **full BAB** and a **full attack** (two attacks at **−4**), the Soldier is the class that most wants heavy weapons, the biggest armor, and a reason to stand still.\n\nNote what the Soldier is **not**: it has **no spellcasting**, and Starfinder has no Fighter-style bonus-feat firehose — the Soldier\'s customization comes from **styles and gear boosts**, not from a pile of combat feats.',
    seeAlso: ['Base Attack Bonus', 'Armor', 'Action Economy', 'Stamina Points'],
    aliases: ['soldier', 'fighting style', 'gear boost', 'weapon specialization'],
  },
  {
    term: 'Mechanic',
    kind: 'class',
    short: 'The tech expert with either a combat drone or an AI in their skull.',
    body:
      'The **Mechanic** is the engineer, hacker, and gadgeteer. **Intelligence** key, **6 SP / 6 HP per level**, **¾ BAB**, good **Fortitude** and **Reflex**.\n\n· **Artificial Intelligence** — at 1st level you choose the fork that defines the class:\n  · **Drone** — a physical companion you build and customize (**combat**, **hover**, **stealth** chassis), which levels with you, takes its own turn, and can be equipped with weapons and mods.\n  · **Exocortex** — an implanted AI that gives **you** the benefits: bonus **BAB for attacks** with your specialization (bringing you to effectively full BAB for those), a **combat tracking** feature, and memory modules.\n· **Custom Rig** — a personal toolkit (a wrist unit, glasses, implants) required for many of your hacks, and it lets you interface with computers wirelessly.\n· **Mechanic Tricks** — at 2nd level and every 2 levels after: **Overload Systems**, **Visual Data Processor**, **Remote Hack**, **Energy Shield**.\n· **Bypass** — a scaling bonus to **Computers** and **Engineering**.\n· **Overload** and **Override** — hack machines and constructs directly.\n\nThe Mechanic owns **Computers** and **Engineering**, which makes it the default starship **Engineer**. Drone Mechanics effectively bring two bodies to a fight; Exocortex Mechanics are their own gun.',
    seeAlso: ['Skill Ranks', 'Base Attack Bonus', 'Starship Roles'],
    aliases: ['mechanic', 'drone', 'exocortex', 'custom rig'],
  },

  // ── Conditions ────────────────────────────────────────────────────────────────────────────
  {
    term: 'Flat-Footed',
    kind: 'condition',
    short: 'You lose your Dexterity bonus to AC AND you cannot take reactions.',
    body:
      'You are caught unready.\n\n· You **cannot use your Dexterity bonus to AC** (both **EAC** and **KAC**).\n· You **cannot take reactions**.\n\nThat second clause is Starfinder\'s own. Since a **reaction** is the *only* off-turn action most characters have, being flat-footed shuts you out of the round entirely — there is no PF1-style "attacks of opportunity unless flat-footed" nuance to argue about.\n\n**When you\'re flat-footed**: at the **start of combat, before your first turn**; while **climbing**; while **pinned**; and whenever an ability says so.\n\n**Who inflicts it**: an **Operative**\'s **Trick Attack** makes the target flat-footed on a success; an **Envoy**\'s **Clever Feint** does it with a Bluff check; **Off-Kilter** includes it.\n\n**Counters**: the Operative\'s **Uncanny Agility** (and similar features) let you keep your Dex bonus even when flat-footed.\n\nNote the terminology: **Starfinder kept the name Flat-Footed** — it is **Pathfinder 2e** that renamed the concept to Off-Guard. And unlike PF1, there is **no separate "flat-footed AC"** you precompute, because there are already two ACs to track.',
    seeAlso: ['Off-Kilter', 'Off-Target', 'Energy Armor Class', 'Kinetic Armor Class', 'Action Economy', 'Operative'],
    aliases: ['flat footed', 'flatfooted', 'denied dex', 'off-guard'],
  },
  {
    term: 'Off-Kilter',
    kind: 'condition',
    short: 'Zero-g tumbling: −2 to attacks, flat-footed, and your only move action is righting yourself.',
    body:
      'You are **tumbling, spinning, or otherwise unable to orient yourself** — Starfinder\'s zero-gravity answer to being knocked prone.\n\n· **−2 penalty on attack rolls**.\n· You are **Flat-Footed** (no Dex to AC, **no reactions**).\n· **You cannot take move actions except to right yourself.**\n\n**Righting yourself** is a **move action**. In **zero gravity** you must be **adjacent to a fixed object** to push off from, or **succeed at a DC 20 Acrobatics check** to do it unaided by flailing. If you\'re floating in open space with nothing to grab, you can be stuck off-kilter for a long time — which is exactly the point.\n\nOff-kilter exists because **Prone** is meaningless in zero-g. The two do the same narrative job in different gravity: on a deck plate you get knocked **prone**; in the void you get knocked **off-kilter**.\n\n**Sources**: being knocked prone while in zero gravity converts to off-kilter; **Bull Rush** and some maneuvers in zero-g; ship hull breaches; certain weapon and grenade effects.\n\nIt is one of the two Starfinder-original conditions along with **Off-Target**, and it is a favorite of GMs running boarding actions.',
    seeAlso: ['Off-Target', 'Flat-Footed', 'Prone', 'Combat Maneuvers'],
    aliases: ['off kilter', 'offkilter', 'zero-g', 'tumbling'],
  },
  {
    term: 'Off-Target',
    kind: 'condition',
    short: '−2 penalty to attack rolls. That is the entire condition.',
    body:
      'You are **rattled, distracted, or badly positioned** and your aim suffers.\n\n· **−2 penalty on attack rolls**.\n\nThat is genuinely all of it — off-target is the mildest condition in Starfinder, the equivalent of PF1\'s **Dazzled** in weight. It does not touch your AC, your saves, or your skills.\n\n**Sources**: an **Operative**\'s **Debilitating Trick** can apply it instead of flat-footed; a **Dirty Trick** maneuver can inflict it for 1 round; **Off-Kilter** includes a −2 to attacks (which is the same effect, though a separate condition); a number of weapon fusions and grenades apply it.\n\nIt exists as a distinct, named condition so that effects have something small and precise to hand out — a −2 to attacks with no other baggage, stackable with everything else because condition penalties in Starfinder are untyped and stack.\n\nAlong with **Off-Kilter**, this is one of the two conditions Starfinder invented rather than inheriting from Pathfinder 1e.',
    seeAlso: ['Off-Kilter', 'Flat-Footed', 'Dazzled', 'Operative', 'Combat Maneuvers'],
    aliases: ['off target', 'offtarget'],
  },
  {
    term: 'Bleeding',
    kind: 'condition',
    short: 'Damage at the start of each of your turns that bypasses Stamina and hits Hit Points directly.',
    body:
      'You are losing blood (or hydraulic fluid).\n\n· You take the **listed damage at the beginning of each of your turns**.\n· **Bleed damage bypasses Stamina Points and reduces Hit Points directly.**\n\nThat second line is what makes bleed disproportionately dangerous. Your Stamina buffer — the thing that makes the first few hits of a fight cheap — does **nothing** here. Every point of bleed is a point of the pool you can only refill overnight or with magic.\n\n**Ending it**: a successful **Medicine check** (the DC scales with the source of the effect) or **any magical healing** removes the condition. A **medpatch** or a **serum of healing** works.\n\n**Sources**: it is a common **critical effect** on kinetic weapons — knives, sniper rifles, and anything that opens a wound. A weapon listing "**Critical — Bleed 1d6**" inflicts this on any natural 20 that hits.\n\n**Immunities**: constructs, undead, and anything **immune to critical hits** or without a circulatory system typically ignore it entirely. Check the statblock before you invest in a bleed weapon against robots.',
    seeAlso: ['Stamina Points', 'Hit Points', 'Critical Effects', 'Burning', 'Dying'],
    aliases: ['bleed', 'bleeding'],
  },
  {
    term: 'Burning',
    kind: 'condition',
    short: 'Fire damage at the start of each of your turns; a move action and a DC 15 Reflex save puts it out.',
    body:
      'You are on fire.\n\n· You take the **listed fire damage at the beginning of each of your turns**.\n\n**Putting it out**: spend a **move action** to attempt a **DC 15 Reflex save**. On a success, the condition ends. On a failure, you keep burning and you\'ve spent your move action. Jumping into water, or otherwise fully smothering the flames, ends it automatically.\n\nUnlike **Bleeding**, burn damage is normal damage — it hits **Stamina Points first**, then Hit Points.\n\n**Sources**: it is the standard **critical effect** on **flame** and **plasma** weapons ("Critical — Burn 1d6"), on incendiary grenades, and on many fire spells.\n\n**Armor matters**: if your armor has **fire resistance** or an appropriate upgrade, apply it against each tick. Some armor upgrades and the **Elemental Resistance** feats reduce burn to nothing.\n\nA practical note for the table: the DC is a flat **15** and does not scale with the source, so a high-Dex character reliably puts themselves out in one move action, while a Soldier in heavy armor may burn for several rounds. That asymmetry is intentional.',
    seeAlso: ['Bleeding', 'Critical Effects', 'Stamina Points', 'Armor'],
    aliases: ['burn', 'burning', 'on fire'],
  },
  {
    term: 'Blinded',
    kind: 'condition',
    short: 'You can\'t see: −2 AC, lose Dex to AC, −4 on Str/Dex skills, and total concealment on everything.',
    body:
      'You cannot see at all.\n\n· **−2 penalty to AC** and you **lose your Dexterity bonus to AC** — meaning you are effectively **Flat-Footed** and lose your reactions along with it.\n· **−4 penalty** on most **Strength- and Dexterity-based skill checks** and on **opposed Perception** checks.\n· All opponents have **total concealment** against you — a **50% miss chance** on your attacks, and you have to guess their square.\n· You **move at half speed** unless you succeed at a **DC 10 Acrobatics** check; you cannot **run** or **charge**.\n· You **automatically fail** Perception checks based on sight.\n\nBecause you lose Dex to AC, blinded characters are wide open to an **Operative**\'s **Trick Attack** and anything else that keys off Flat-Footed.\n\n**Sources**: a **Dirty Trick** maneuver (1 round), the **Blind** critical effect on some weapons, flash grenades, and a range of spells. **Darkvision** and **low-light vision** do **not** help against the condition — they only help against *darkness*.\n\n*Remove affliction* and a **DC 25 Medicine** check to treat it are the cures, depending on the cause.',
    seeAlso: ['Dazzled', 'Deafened', 'Flat-Footed', 'Combat Maneuvers'],
    aliases: ['blind', 'blinded'],
  },
  {
    term: 'Dazzled',
    kind: 'condition',
    short: '−1 on attack rolls and sight-based Perception checks.',
    body:
      'Your vision is washed out by glare.\n\n· **−1 penalty on attack rolls**.\n· **−1 penalty on sight-based Perception checks**.\n\nThat is the whole condition — the weakest one in the game, alongside **Off-Target** (which is a straight −2 to attacks with no Perception clause).\n\nIt does **not** affect your AC, does not deny your Dexterity bonus, and does not impose a miss chance. It is not a lesser version of **Blinded**; it is a different, much milder thing.\n\n**Sources**: flash effects, weapon fusions, **light sensitivity** on subterranean races and creatures (which are dazzled in bright light or in a *daylight* effect), and various environmental hazards — welding arcs, unfiltered starlight, a hull breach into a system\'s primary.\n\nOn a starship, dazzled crew are a real consideration during certain hazards, since the −1 flows into gunnery checks.',
    seeAlso: ['Blinded', 'Off-Target', 'Deafened'],
    aliases: ['dazzle', 'dazzled'],
  },
  {
    term: 'Deafened',
    kind: 'condition',
    short: '−4 on initiative, auto-fail hearing-based Perception, and −4 on opposed Perception.',
    body:
      'You cannot hear.\n\n· **−4 penalty on initiative** checks.\n· You **automatically fail Perception checks based on sound**.\n· **−4 penalty on opposed Perception** checks.\n\nNote what is **absent** compared to Pathfinder 1e: Starfinder\'s spells have **no verbal components** in the PF1 sense, so there is **no 20% spell failure chance** for a deafened caster. A deafened Mystic casts perfectly well.\n\nBeing deafened also cuts you off from **comm units** and audio-based team coordination, which the GM may treat as a real tactical problem — an Envoy\'s **Get \'Em** and **Inspiring Boost** require the ally to **hear** them.\n\n**Sources**: the **Deafen** critical effect on **sonic** weapons, a **Dirty Trick** maneuver, explosive decompression, and various spells. Sonic weapons are the main vector, which is why the effect shows up so often in boarding actions.\n\nA **DC 25 Medicine** check or *remove affliction* cures a lasting case; most combat instances have a stated duration of a round or two.',
    seeAlso: ['Blinded', 'Dazzled', 'Envoy', 'Critical Effects'],
    aliases: ['deaf', 'deafened'],
  },
  {
    term: 'Confused',
    kind: 'condition',
    short: 'You roll on a d% table each round: act normally, babble, hurt yourself, or attack the nearest creature.',
    body:
      'You cannot act rationally. **At the start of each of your turns, roll d%**:\n\n· **01–25** — **act normally**\n· **26–50** — **do nothing but babble incoherently**\n· **51–75** — **deal damage to yourself** with the weapon or item in hand\n· **76–100** — **attack the nearest creature**\n\nThe override that matters: **a confused creature that is attacked attacks the creature that last damaged it on its next turn**, ignoring the table. So confusion resolves into "hits whoever hit it last" the moment anyone engages — which is a genuine tactical lever and a genuine risk.\n\nA confused creature that cannot reach its intended target **moves toward it** instead.\n\n**Immunities**: confusion is **mind-affecting**, so constructs, undead, and anything immune to mind-affecting effects ignore it. That covers a large share of Starfinder\'s robot and drone opposition.\n\n**Sources**: the *confusion* spell, various mystic connection powers, some drugs and toxins, and psychic hazards.',
    seeAlso: ['Dazed', 'Fascinated', 'Panicked'],
    aliases: ['confusion', 'confused'],
  },
  {
    term: 'Cowering',
    kind: 'condition',
    short: 'Frozen in terror: no actions, flat-footed, and attackers get +2 to hit you.',
    body:
      'You are **paralyzed by fear**.\n\n· You **can take no actions** at all.\n· You are **Flat-Footed** (no Dex to AC, **no reactions**).\n· Attackers gain a **+2 bonus on attack rolls** against you.\n\nIt is a total lockout — the end state of the fear ladder when running is not an option.\n\n**Where it comes from**: a **Panicked** creature that is **cornered** and cannot flee **cowers** instead. Some fear effects impose it directly.\n\nThe Starfinder fear ladder mirrors PF1\'s: **Shaken → Frightened → Panicked**, with **Cowering** as the trapped end state.\n\nBecause it makes you Flat-Footed, a cowering target is prime for an **Operative**\'s Trick Attack. It does **not**, however, make you helpless — Starfinder has **no Helpless condition** and **no coup de grace**, so there is no instant-kill follow-up the way there is in Pathfinder 1e. That is a real and deliberate difference.\n\nAll of it is **mind-affecting**: robots don\'t cower.',
    seeAlso: ['Panicked', 'Frightened', 'Shaken', 'Flat-Footed'],
    aliases: ['cower', 'cowering'],
  },
  {
    term: 'Dazed',
    kind: 'condition',
    short: 'You can take no actions — but your AC is unaffected.',
    body:
      'You are stunned into inaction without being physically compromised.\n\n· You **can take no actions** — no standard, move, swift, free, or reaction.\n· You take **no penalty to AC** and you **keep your Dexterity bonus**.\n\nThat second line is the entire difference from **Stunned**: a dazed creature is no easier to hit and is **not** Flat-Footed, so it isn\'t exposed to Trick Attack. You simply lose your turn.\n\n**Duration is typically 1 round**, occasionally longer.\n\n**Sources**: the *daze* cantrip (limited to low-CR creatures), some weapon fusions and grenades, various mystic powers, and a handful of environmental effects.\n\nMost daze effects are **mind-affecting**, which makes them unreliable against Starfinder\'s constructs, undead, and drones — check before you build around it.\n\nCompare **Stunned** (no actions + you drop your gear + −2 AC + flat-footed) and **Staggered** (one action per round). Dazed sits at the mild end of the "you lose your turn" family.',
    seeAlso: ['Stunned', 'Staggered', 'Confused'],
    aliases: ['daze', 'dazed'],
  },
  {
    term: 'Dying',
    kind: 'condition',
    short: 'Unconscious at 0 Hit Points: spend 1 Resolve Point at the start of each turn to stabilize, or die.',
    body:
      'You have hit **0 Hit Points**. You are **unconscious** and can take no actions.\n\n· **At the start of each of your turns, you must spend 1 Resolve Point to stabilize.** If you do, you stop dying (you remain unconscious at 0 HP until healed).\n· **If you have no Resolve Points to spend — you die.**\n\nThat is the whole death rule, and it is why **Resolve Points are the real hit point total** in Starfinder. A character with 8 RP has a lot of second chances; a character who has spent all their Resolve refilling Stamina between fights has none. Managing that budget *is* the survival game.\n\n· Any healing that restores you to **1 Hit Point or more** ends the condition and wakes you.\n· **Damage taken while dying** still applies.\n\nCompare Pathfinder 1e, where you die at negative your Constitution score and stabilize on a Con check — Starfinder replaced that entire subsystem with the RP economy. There is **no negative HP track**, no bleeding out at −1 per round, and no DC 15 Heal check to stabilize a downed ally in the same way.\n\nA **Medicine** check or *mystic cure* on a dying character is the party\'s job; the character\'s own job is to have kept some Resolve in reserve.',
    seeAlso: ['Resolve Points', 'Hit Points', 'Stamina Points', 'Unconscious'],
    aliases: ['dying', 'death', 'stabilize', '0 HP', 'downed'],
  },
  {
    term: 'Unconscious',
    kind: 'condition',
    short: 'Knocked out: no actions, no awareness, and open to anything.',
    body:
      'You are **knocked out** and completely unaware of your surroundings.\n\n· You **can take no actions** of any kind.\n· You are effectively **Flat-Footed** and cannot use your Dexterity bonus to either AC.\n\n**How you get here**:\n\n· **Dropping to 0 Hit Points** — you are unconscious **and Dying**, which starts the Resolve-Point clock.\n· **Sleep**, magical or natural — see **Asleep**.\n· Various nonlethal effects.\n\n**Waking up**: healing that brings you to **1 HP or more** wakes you and ends **Dying**. A stabilized character remains unconscious at 0 HP until someone heals them.\n\nThe important Starfinder-specific point: **there is no Helpless condition and no coup de grace**. An unconscious character is in serious trouble and can be finished off with ordinary attacks, but there is **no automatic-crit, save-or-die execution move** the way there is in Pathfinder 1e. A downed PC in Starfinder is much more recoverable — the danger is running out of **Resolve**, not being executed on the floor.',
    seeAlso: ['Dying', 'Asleep', 'Resolve Points', 'Flat-Footed'],
    aliases: ['unconscious', 'knocked out', 'KO'],
  },
  {
    term: 'Asleep',
    kind: 'condition',
    short: 'Unconscious and unaware; noise or a shake wakes you.',
    body:
      'You are **asleep** — a specific flavor of **Unconscious**.\n\n· You **can take no actions** and are **unaware** of your surroundings.\n· You are effectively **Flat-Footed** and lose your Dexterity bonus to AC.\n\n**Waking up**:\n\n· **Taking damage** wakes you immediately.\n· An **ally can shake you awake** by spending an action to do so.\n· **Loud noise** may wake you — the GM may call for a **Perception** check, and a sleeping creature takes a significant penalty to notice anything.\n· A magical sleep effect ends on its own stated duration.\n\n**Immunities**: **constructs**, **undead**, and **androids** are notable — an **Android** does not sleep in the normal sense; androids **rest** but are **immune to sleep effects**, which is one of the race\'s better perks. Check the statblock, because a lot of Starfinder opposition is machinery.\n\nUnlike Pathfinder 1e, being asleep does **not** make you **Helpless** (Starfinder has no such condition), so a sleeping target **cannot be coup de graced**. It is still an extremely bad place to be caught.',
    seeAlso: ['Unconscious', 'Dying', 'Flat-Footed'],
    aliases: ['asleep', 'sleeping', 'sleep'],
  },
  {
    term: 'Broken',
    kind: 'condition',
    short: 'An item condition: gear at or below half HP works badly — weapons take −2 and deal half damage.',
    body:
      '**Broken** applies to **objects and equipment**, not creatures. An item becomes broken when its **Hit Points drop to half or below** (or when an effect says so).\n\nWhat a broken item does:\n\n· A **broken weapon** takes a **−2 penalty on attack rolls** and deals **half damage**.\n· **Broken armor** grants only **half its EAC and KAC bonuses**.\n· Broken **tools and technological items** function at reduced effectiveness or not at all, per the item\'s own description.\n· A broken item is worth substantially less and typically cannot be sold at full price.\n\n**How items break**: the **Sunder** combat maneuver (an attack against **KAC + 8**) can damage a target\'s gear; environmental hazards, some critical effects, and starship **critical damage** to systems apply it too.\n\n**Repairing**: an **Engineering** check with the right toolkit restores an item over time; the DC and duration scale with the item\'s level. A **Mechanic** with a custom rig is the party\'s answer.\n\nIn **starship combat**, the same idea appears at scale: as a ship\'s Hull Points drop past thresholds, its **systems** (weapons, engines, power core, life support, sensors) take **critical damage** and function at reduced capacity — the ship\'s version of going broken piece by piece.',
    seeAlso: ['Armor', 'Combat Maneuvers', 'Mechanic', 'Starship Combat'],
    aliases: ['broken', 'sunder', 'damaged item'],
  },
  {
    term: 'Encumbered',
    kind: 'condition',
    short: 'Carrying too much: −10 feet of speed, Dex bonus capped at +2, and −5 to Str and Dex checks.',
    body:
      'You are **carrying more than you should**. Starfinder measures carrying capacity in **bulk**, not pounds.\n\n· Your **carrying capacity** before encumbrance is **half your Strength score in bulk**. Carry more than that and you are **encumbered**.\n· You **cannot carry more than your Strength score in bulk** at all.\n\nWhile encumbered:\n\n· **Speed is reduced by 10 feet**.\n· Your **maximum Dexterity bonus to AC is capped at +2** — which hits both **EAC** and **KAC**.\n· **−5 penalty** on **Strength- and Dexterity-based checks**.\n\nBulk is deliberately coarse: most items are **1 bulk**, **light** (**L**, and **10 light items = 1 bulk**), or negligible. A heavy weapon might be 2 bulk; a suit of powered armor a great deal more.\n\nThe practical effect is that Starfinder actually enforces loadout choices — you cannot carry three heavy weapons and a full set of armor. **Powered armor** and **armor upgrades** (like a **jetpack**) can offset it; some races and feats raise the threshold.',
    seeAlso: ['Armor', 'Energy Armor Class', 'Kinetic Armor Class'],
    aliases: ['encumbered', 'encumbrance', 'bulk', 'overloaded'],
  },
  {
    term: 'Entangled',
    kind: 'condition',
    short: 'Half speed, −2 attack, −4 Dex, no running or charging.',
    body:
      'You are caught in webbing, a net, or a **riot grenade**\'s foam.\n\n· **Move at half speed**; you **cannot run or charge**.\n· **−2 penalty on all attack rolls**.\n· **−4 penalty to Dexterity** — flowing into your **EAC**, **KAC**, Reflex saves, and Dex-based skills.\n· If the entangling effect is **anchored to something immobile**, you **cannot move at all** until you break free.\n\nNote it is **−4 to the Dexterity score**, so about **−2 to AC** in practice.\n\n**Escaping**: usually an **Acrobatics** check to escape or an **Athletics** check to break out, against the effect\'s DC. Destroying the entangling material also works.\n\n**Sources**: **entangle**-style spells, **riot grenades**, the **entangle** weapon fusion, a **Dirty Trick** maneuver (1 round), and various creature abilities.\n\nUnlike PF1, entangled does **not** impose a concentration penalty on spellcasting in Starfinder\'s core presentation — casting while entangled follows the ordinary rules for casting in a threatened square.',
    seeAlso: ['Grappled', 'Pinned', 'Combat Maneuvers'],
    aliases: ['entangle', 'entangled', 'webbed', 'net'],
  },
  {
    term: 'Exhausted',
    kind: 'condition',
    short: 'The severe fatigue rung: half speed and a bigger penalty package; an hour of rest downgrades it to Fatigued.',
    body:
      'You are utterly spent — the second rung of the fatigue ladder.\n\n· **Move at half speed**.\n· You take a **penalty to AC, attack rolls, melee damage rolls, Reflex saves, and Strength- and Dexterity-based skill checks** — twice the size of the fatigued penalty.\n\nStarfinder restructured this from PF1: instead of PF1\'s **−6 to Strength and Dexterity**, it applies **direct penalties to the numbers that matter**. The effect is similar in weight; the bookkeeping is simpler (you don\'t recompute your ability modifiers mid-fight).\n\n**Recovering**: **1 hour of complete rest** downgrades exhausted to **Fatigued**. Clearing fatigued then takes a **full 8-hour rest**.\n\n**Stacking**: an effect that would fatigue an already-**fatigued** creature makes it **exhausted** instead. Exhausting an already-exhausted creature does nothing further — there is no third rung.\n\n**Immunities**: constructs, undead, and most robots. **Androids** are living creatures and *are* subject to it.\n\n**Sources**: forced marches, environmental extremes, going without rest, radiation sickness, and a number of drugs and toxins.',
    seeAlso: ['Fatigued', 'Staggered', 'Sickened'],
    aliases: ['exhaustion', 'exhausted'],
  },
  {
    term: 'Fatigued',
    kind: 'condition',
    short: 'No running or charging, plus a penalty to AC, attacks, melee damage, Reflex, and Str/Dex skills.',
    body:
      'You are tired — the first rung of the fatigue ladder.\n\n· You **cannot run or charge**.\n· You take a **penalty to AC, attack rolls, melee damage rolls, Reflex saves, and Strength- and Dexterity-based skill checks**.\n\nStarfinder expresses this as **direct penalties to the affected numbers**, rather than PF1\'s **−2 to Strength and Dexterity**. Same idea, less recomputation.\n\n**Recovering**: **8 hours of complete rest**. Nothing shorter clears it — notably, the **10-minute / 1-Resolve-Point rest** that refills all your **Stamina Points** does **nothing** for fatigue. That\'s the wall at the end of an adventuring day.\n\n**Stacking**: fatiguing an already-**fatigued** creature makes it **Exhausted**.\n\n**Immunities**: constructs, undead, and most robotic opposition are **immune to fatigue**, which matters when you\'re planning to grind a machine down.\n\n**Sources**: forced marches, sleep deprivation, hostile environments, radiation, several drugs, and some class abilities that push you past your limits.',
    seeAlso: ['Exhausted', 'Stamina Points', 'Resolve Points'],
    aliases: ['fatigue', 'fatigued', 'tired'],
  },
  {
    term: 'Frightened',
    kind: 'condition',
    short: '−2 on attacks, saves, skills and ability checks, and you must flee if you can.',
    body:
      'The middle rung of the **fear ladder**.\n\n· **−2 penalty** on **attack rolls**, **saving throws**, **skill checks**, and **ability checks**.\n· You **must flee** from the source of the fear, by the most direct route available.\n· If you are **cornered** and cannot flee, you **may fight** — you keep the −2, but you are otherwise allowed to act.\n\nSo frightened is **Shaken plus compulsory flight**, and it is strictly better than **Panicked**, which takes away your gear and your ability to fight even when trapped.\n\n**The ladder stacks upward**: shaken + shaken = **Frightened**; frightened + another fear effect = **Panicked**; panicked and cornered = **Cowering**.\n\n**Immunities**: all of it is **mind-affecting fear**, so constructs, undead, and most drones are immune. In a setting this full of robots, fear builds are noticeably less reliable than in Pathfinder — worth knowing before you invest in Intimidate as your Trick Attack skill.\n\n**Sources**: fear spells, a **Solarian**\'s or **Envoy**\'s intimidation options, and creature abilities.',
    seeAlso: ['Shaken', 'Panicked', 'Cowering'],
    aliases: ['fear', 'frightened', 'afraid'],
  },
  {
    term: 'Shaken',
    kind: 'condition',
    short: '−2 on attack rolls, saving throws, skill checks, and ability checks. The bottom rung of the fear ladder.',
    body:
      'You are rattled but functional.\n\n· **−2 penalty** on **attack rolls**, **saving throws**, **skill checks**, and **ability checks**.\n\nNo forced movement, no lost actions — you fight on, just worse. It is the most commonly applied fear result.\n\nThe ladder:\n\n· **Shaken** — −2, keep fighting\n· **Frightened** — −2, **must flee** (may fight if cornered)\n· **Panicked** — drop everything, **flee**, −2 to saves/skills/ability checks (**not** attacks), cower if cornered\n· **Cowering** — no actions, flat-footed, attackers get +2\n\n**Stacking upward**: shaken + another shaken effect = **Frightened**.\n\n**Sources**: an **Envoy**\'s **Dispiriting Taunt** (an Intimidate check, standard action) is the cleanest way to apply it; the **Intimidate** skill\'s demoralize use; various weapons and spells.\n\n**Mind-affecting** — which in a setting full of robots, drones, and undead means it fails more often than it does in Pathfinder. Check what you\'re shooting at.',
    seeAlso: ['Frightened', 'Panicked', 'Cowering', 'Envoy'],
    aliases: ['shaken', 'demoralize', 'intimidate'],
  },
  {
    term: 'Panicked',
    kind: 'condition',
    short: 'You drop everything and run: −2 to saves, skills and ability checks, and you can\'t fight even if cornered.',
    body:
      'The worst rung of the fear ladder short of cowering.\n\n· You **drop everything you are holding**.\n· You **flee at top speed** from the source of the fear and anything else that threatens you en route.\n· **−2 penalty** on **saving throws**, **skill checks**, and **ability checks**.\n· You **cannot take other actions** — though you **may** use abilities that **help you flee**.\n· **If cornered** and unable to flee, you **Cower** instead. You do **not** get to fight back.\n\nThat last rule is the key break from **Frightened**, which lets a cornered creature fight. A panicked crewmate is out of the fight *and* has just dropped a very expensive gun on the deck.\n\nNote the penalty list: panicked gives **no −2 on attack rolls**, because a panicked creature isn\'t attacking.\n\n**Sources**: strong fear effects, or any fear effect landing on an already-**Frightened** creature.\n\n**Mind-affecting** — constructs, undead, and drones are immune.',
    seeAlso: ['Frightened', 'Shaken', 'Cowering'],
    aliases: ['panic', 'panicked'],
  },
  {
    term: 'Fascinated',
    kind: 'condition',
    short: 'Transfixed: no actions but staring, −4 on reactive skill checks, and any obvious threat breaks it.',
    body:
      'Something has your complete attention.\n\n· You **can take no actions** other than paying attention to the fascinating effect.\n· **−4 penalty on skill checks made as reactions** — Perception, most importantly.\n\n**What ends it**:\n\n· Any **potential threat** (an ally drawing a weapon, a hostile creature approaching) lets you attempt a **new saving throw**.\n· Any **obvious threat** — being attacked, having a spell cast at you — **automatically breaks** the effect.\n· An **ally can shake you out of it** by spending an action.\n\nSo fascination is a **setup and social tool**, not a combat lock — it cannot survive the first shot.\n\n**Mind-affecting**, so constructs, undead, and drones ignore it.\n\n**Sources**: various mystic connection powers, some spells, and creature abilities. Note that Starfinder has no Bard, so the class-based mass-fascinate of Pathfinder isn\'t part of the baseline — the **Envoy** achieves comparable effects through Bluff, Diplomacy, and Intimidate instead.',
    seeAlso: ['Confused', 'Dazed', 'Cowering', 'Envoy'],
    aliases: ['fascinate', 'fascinated', 'entranced'],
  },
  {
    term: 'Grappled',
    kind: 'condition',
    short: 'Held: you can\'t move, take penalties to attacks and Dex, and can\'t use two-handed actions.',
    body:
      'You are being held by a creature or an effect — the result of a successful **Grapple** maneuver (an attack roll against your **KAC + 8**).\n\n· You **cannot move**.\n· You take a **penalty to attack rolls** and to your **Dexterity**, flowing into both **EAC** and **KAC**.\n· You **cannot take actions that require two hands**.\n\n**Escaping**: an **Acrobatics** check to escape, or an **Athletics** check to break free, against a DC set by the grappler (**10 + the grappler\'s KAC**, in the standard presentation). It costs you a **standard action**.\n\n**The big simplification**: in Starfinder, **the grappler is NOT also grappled**. Pathfinder 1e made grappling mutual, with both creatures taking the penalty — Starfinder dropped that entirely. There is no CMB/CMD, no maintaining-the-grapple check structure inherited from PF1; the grappler makes an attack roll against **KAC + 8** and that\'s the transaction.\n\nBeating the DC by **5 or more** on the initial Grapple inflicts **Pinned** instead, which is considerably worse.',
    seeAlso: ['Pinned', 'Combat Maneuvers', 'Kinetic Armor Class', 'Entangled'],
    aliases: ['grapple', 'grappled', 'grab'],
  },
  {
    term: 'Pinned',
    kind: 'condition',
    short: 'Held immobile: flat-footed, an extra AC penalty, and limited to verbal and mental actions.',
    body:
      'You are being held **immobile** — the upgrade a grappler gets by beating your **KAC + 8** by **5 or more**.\n\n· You **cannot move** and you are **Flat-Footed** (no Dex to AC, **no reactions**).\n· You take an **additional penalty to AC** on top of that.\n· You are limited to **purely verbal and mental actions** — you **cannot attack** with a weapon.\n· You **can** attempt to **free yourself**, which downgrades you to merely **Grappled** — not free.\n\nSo escaping a pin is a **two-step process**: pinned → grappled → free. That is at minimum two standard actions, and the pinner gets to act in between.\n\nUnlike **Grappled** in Pathfinder 1e, the **pinner is not itself pinned or grappled** in Starfinder — it just has to keep spending actions.\n\nA pinned creature is **not Helpless** — Starfinder has **no Helpless condition and no coup de grace**. Being pinned is dangerous because your allies now have to dig you out while you contribute nothing, not because someone can execute you.',
    seeAlso: ['Grappled', 'Flat-Footed', 'Combat Maneuvers', 'Kinetic Armor Class'],
    aliases: ['pin', 'pinned'],
  },
  {
    term: 'Prone',
    kind: 'condition',
    short: 'On the ground: −4 to melee attacks, −4 AC vs melee, +4 AC vs ranged, and standing up provokes.',
    body:
      'You are lying on the deck.\n\n· **−4 penalty on melee attack rolls**.\n· **−4 penalty to AC against melee attacks**.\n· **+4 bonus to AC against ranged attacks**.\n\nThat split is the whole tactical story, and in a game where **most attacks are ranged**, going prone is far more often a *good* idea than it is in Pathfinder. Snipers and heavy-weapon users drop prone deliberately.\n\n**Standing up** is a **move action** that **provokes**. **Crawling** moves you 5 feet as a move action and provokes.\n\n**Sources**: the **Trip** maneuver (an attack against **KAC + 8**), the **knockdown** critical effect (which knocks the target prone with **no save and no maneuver check** — one of the best crit riders in the game), and various area effects.\n\n**In zero gravity**, prone is meaningless — being knocked down there gives you **Off-Kilter** instead, which is materially worse because it also makes you flat-footed and strips your reactions.',
    seeAlso: ['Off-Kilter', 'Combat Maneuvers', 'Critical Effects', 'Action Economy'],
    aliases: ['prone', 'knocked down', 'trip', 'knockdown'],
  },
  {
    term: 'Nauseated',
    kind: 'condition',
    short: 'You can do nothing but take a single move action each round.',
    body:
      'You are so sick you can barely function.\n\n· You are **unable to attack, cast spells, concentrate on spells**, or do **anything else requiring attention**.\n· **The only action you can take is a single move action per turn.**\n\nA near-total lockout — strictly worse than **Staggered**, which at least permits a standard action. It is one of the most crippling non-lethal conditions in the game.\n\n**Sources**: many **poisons** and toxins, **radiation** sickness, some drugs, creature stench abilities, and certain grenades.\n\n**Immunities matter enormously**: creatures **immune to poison** shrug off most sources, and **constructs**, **undead**, and **robots** are immune outright. A large fraction of Starfinder opposition simply cannot be nauseated.\n\n**Curing it**: depends on the source — a **Medicine** check to treat the affliction, *remove affliction*, or an antitoxin. Many instances have a stated duration and just tick away.\n\n**Sickened** is the milder cousin (a −2 package rather than a lockout); an effect that sickens an already-sickened creature does **not** escalate to nauseated unless it says so.',
    seeAlso: ['Sickened', 'Staggered', 'Dazed'],
    aliases: ['nausea', 'nauseated'],
  },
  {
    term: 'Sickened',
    kind: 'condition',
    short: '−2 on attack rolls, weapon damage rolls, saves, skill checks, and ability checks.',
    body:
      'You feel ill.\n\n· **−2 penalty** on **attack rolls**, **weapon damage rolls**, **saving throws**, **skill checks**, and **ability checks**.\n\nIt is **Shaken plus a damage penalty** — the **−2 to weapon damage rolls** is the distinguishing clause, and it means sickened and shaken **stack** with each other (condition penalties are untyped and come from different sources).\n\nIt is **not** **Nauseated**, which is a near-total lockout. Sickened is the mild rung; there is no automatic escalation from one to the other.\n\n**Sources**: poisons and diseases (many afflictions inflict sickened at their first stage before progressing to something worse), radiation, a **Dirty Trick** maneuver, several **drugs**, and various creature abilities. A **Biohacker**\'s injections can inflict it.\n\n**Immunities**: constructs, undead, and anything immune to poison or to disease, depending on the source.\n\nThe −2 to **weapon damage** applies to the weapon damage roll — not to spell damage.',
    seeAlso: ['Nauseated', 'Shaken', 'Fatigued'],
    aliases: ['sick', 'sickened'],
  },
  {
    term: 'Staggered',
    kind: 'condition',
    short: 'You may take a single move OR standard action each round — and no full actions.',
    body:
      'You are reeling.\n\n· You may take **a single move action or a single standard action each round** — **not both**.\n· You **cannot take full actions**.\n· You **may still take swift, free, and reaction** actions.\n· You can take a **guarded step** if you use your action for a standard action.\n\n**No full attacks, ever** is the practical effect — and since a Soldier\'s full attack is two attacks at −4, staggering one cuts its damage roughly in half. It is one of the most efficient debuffs in the game.\n\n**Sources**: the **staggered** critical effect, which appears on a range of weapons — the target must succeed at a **Fortitude save** (**DC = 10 + half the item\'s level + the wielder\'s key ability modifier**) or be staggered for **1 round**. Also the *slow* spell, various poisons, and some environmental effects.\n\nCompare **Nauseated** (a move action only — worse), **Dazed** (no actions at all — worse still, but usually only 1 round), and **Off-Target** (just a −2 to hit).\n\nUnlike PF1, Starfinder has **no nonlethal-damage rule** that staggers you at a specific HP threshold — Stamina and Hit Points handle that job instead.',
    seeAlso: ['Nauseated', 'Dazed', 'Critical Effects', 'Action Economy', 'Base Attack Bonus'],
    aliases: ['stagger', 'staggered', 'slow'],
  },
  {
    term: 'Stunned',
    kind: 'condition',
    short: 'You drop what you\'re holding, can take no actions, take −2 to AC, and lose your Dex bonus.',
    body:
      'You have been rocked.\n\n· You **drop everything you are holding**.\n· You **can take no actions**.\n· **−2 penalty to AC** (both **EAC** and **KAC**).\n· You **lose your Dexterity bonus to AC** — so you are effectively **Flat-Footed** and have **no reactions**.\n\nThe combination is punishing: you lose your turn, you\'re much easier to hit, you\'re open to an **Operative**\'s Trick Attack, and even after it ends you\'ve got to spend a **move action** picking your gun back up off the floor.\n\nThat gear-dropping clause is what separates **Stunned** from **Dazed** — dazed only costs you actions.\n\n**Sources**: the **stunned** critical effect on **stun**-property weapons (a **Fortitude save** to resist), *stunning barrier* and similar spells, some grenades, and creature abilities. **Stun** weapons are a whole design lane in Starfinder — set to nonlethal, they\'re how you take a target alive.\n\nDuration is typically **1 round**. Stunned is **not** Helpless; Starfinder has no such condition and no coup de grace.',
    seeAlso: ['Dazed', 'Staggered', 'Flat-Footed', 'Critical Effects'],
    aliases: ['stun', 'stunned'],
  },
];
