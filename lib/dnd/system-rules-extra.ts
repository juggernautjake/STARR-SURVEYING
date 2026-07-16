// lib/dnd/system-rules-extra.ts — additional game systems for the rules library.
//
// Same contract as system-rules.ts (which merges these into SYSTEM_RULES): concise MECHANICAL
// FACTS + numbers, paraphrased (never verbatim rulebook prose), attributed to a source book, and
// keyed strictly by system so nothing crosses editions.
//
// These six deliberately stretch the model well past d20:
//   · Call of Cthulhu 7e  — percentile (d100 roll-under), no levels, no classes
//   · Blades in the Dark  — d6 dice pool, position/effect, no levels, playbooks
//   · Cyberpunk RED       — d10 + STAT + SKILL, no levels, Roles
//   · Shadowrun 6e        — d6 dice pool (hits on 5–6), Attribute+Skill, no levels
//   · Pathfinder 1e       — the classic 3.x-derived d20 (BAB, saves, skill ranks)
//   · Starfinder 1e       — PF1-derived d20 in space (Stamina/HP, Resolve)
//
// Where a field cannot honestly apply (a hit die in CoC, a proficiency bonus in Blades) it is
// null / levelMin === levelMax === 1, and `keyFacts` says so explicitly — that is what stops the
// AI from inventing d20 scaffolding for a system that has none.
import type { SystemRules } from './system-rules';

// ── Call of Cthulhu 7e ────────────────────────────────────────────────────────────────────
const CALL_OF_CTHULHU_7E: SystemRules = {
  key: 'coc7e',
  label: 'Call of Cthulhu 7e',
  source: 'Call of Cthulhu Keeper Rulebook (7th Edition)',
  ability: {
    abilities: ['STR', 'CON', 'SIZ', 'DEX', 'APP', 'INT', 'POW', 'EDU', 'LUCK'],
    generation:
      'Characteristics are PERCENTAGES (0–99), not 3–18 scores. Roll or point-buy: STR/CON/DEX/APP/POW are 3d6×5; SIZ and INT are (2d6+6)×5; EDU is (2d6+6)×5. Luck is 3d6×5 and is a spendable pool. The common point-buy spread is 460 points across the eight characteristics (max 80 each at creation).',
    range: 'Characteristics run 0–99 (creation values are typically 15–90). EDU can grow past 90 via improvement checks but is capped at 99.',
    scoreMax: 99,
    scoreMin: 0,
    modifier:
      'There is NO modifier table. The characteristic IS the target number. Its Half value and Fifth value are used for Hard and Extreme difficulty. Damage Bonus and Build come from STR+SIZ; Move rate comes from comparing STR/DEX to SIZ.',
    scoreBased: true,
  },
  proficiency:
    'No proficiency bonus. Every skill is its own percentage (its base value plus points spent). Occupation skill points = EDU×4 (some occupations use other formulas); personal interest points = INT×2. Skills improve between scenarios: any skill you succeeded with is marked, then rolls above its current value to gain 1d10 points.',
  profBonusByLevel: null,
  levelMin: 1,
  levelMax: 1,
  advancement:
    'There are NO character levels and no XP. Investigators improve individual skills via the mark-and-check system between scenarios, and may gain or lose Sanity, Luck and Credit Rating.',
  saves:
    'No saving throws. Threats are resisted with characteristic rolls (a CON roll vs poison, a POW roll vs magic) or an opposed roll on the resistance table. Sanity checks are POW-based rolls against your current Sanity.',
  coreResolution:
    'Roll d100 and try to roll UNDER the skill/characteristic — low is good. Success ≤ the value; Hard success ≤ half the value; Extreme success ≤ one fifth. 01 is always a critical; 100 (and 96–99 when the skill is under 50) is a fumble. Bonus/Penalty dice add an extra tens die, taking the better/worse result instead of adding modifiers.',
  actionEconomy:
    'One action and one movement per turn, in DEX order (highest first). Combat is a chain of opposed rolls: an attacker rolls their weapon skill and the defender chooses to Fight Back, Dodge, or take the hit. There are no attacks of opportunity, no action/bonus-action split.',
  rest:
    'Hit points return slowly: 1 per day of rest, or faster with a successful First Aid/Medicine roll. A Major Wound needs a successful CON roll each day to begin healing. Sanity is regained only in small amounts, through downtime and self-help — never a "long rest".',
  progressionCadence:
    'Improvement happens BETWEEN scenarios, not at levels: roll above each marked skill to gain 1d10 points; make an EDU improvement check; Luck can be spent and recovered. Sanity lost to the Mythos is largely permanent, and Cthulhu Mythos skill permanently lowers your maximum Sanity (99 − Cthulhu Mythos).',
  keyFacts: [
    'This is a ROLL-UNDER d100 system: you want a LOW roll. Never model it with d20, AC, or a proficiency bonus.',
    'There are no levels, no classes, and no hit dice. Occupations are packages of skills, not classes — never give an investigator a "level".',
    'Hit points = (CON + SIZ) ÷ 10, rounded down. Sanity starts equal to POW; maximum Sanity is 99 − your Cthulhu Mythos skill.',
    'Difficulty is expressed by the target, not a DC: Regular = the skill, Hard = half, Extreme = one fifth.',
    'Investigators are fragile and mortal. Do not import d20 healing, resurrection, or hit-point scaling.',
    'Luck is a spendable pool that can push a failed roll up to a success (never on damage or Sanity rolls).',
  ],
  content: {
    skills: [
      { name: 'Accounting', ability: 'EDU' }, { name: 'Anthropology', ability: 'EDU' }, { name: 'Appraise', ability: 'EDU' },
      { name: 'Archaeology', ability: 'EDU' }, { name: 'Charm', ability: 'APP' }, { name: 'Climb', ability: 'STR' },
      { name: 'Credit Rating', ability: 'EDU' }, { name: 'Cthulhu Mythos', ability: 'INT' }, { name: 'Disguise', ability: 'APP' },
      { name: 'Dodge', ability: 'DEX' }, { name: 'Drive Auto', ability: 'DEX' }, { name: 'Fast Talk', ability: 'APP' },
      { name: 'Fighting (Brawl)', ability: 'STR' }, { name: 'Firearms (Handgun)', ability: 'DEX' }, { name: 'Firearms (Rifle/Shotgun)', ability: 'DEX' },
      { name: 'First Aid', ability: 'EDU' }, { name: 'History', ability: 'EDU' }, { name: 'Intimidate', ability: 'POW' },
      { name: 'Jump', ability: 'STR' }, { name: 'Language (Other)', ability: 'EDU' }, { name: 'Language (Own)', ability: 'EDU' },
      { name: 'Law', ability: 'EDU' }, { name: 'Library Use', ability: 'EDU' }, { name: 'Listen', ability: 'POW' },
      { name: 'Locksmith', ability: 'DEX' }, { name: 'Mechanical Repair', ability: 'EDU' }, { name: 'Medicine', ability: 'EDU' },
      { name: 'Natural World', ability: 'EDU' }, { name: 'Navigate', ability: 'EDU' }, { name: 'Occult', ability: 'EDU' },
      { name: 'Persuade', ability: 'APP' }, { name: 'Pilot', ability: 'DEX' }, { name: 'Psychoanalysis', ability: 'EDU' },
      { name: 'Psychology', ability: 'INT' }, { name: 'Ride', ability: 'DEX' }, { name: 'Science', ability: 'EDU' },
      { name: 'Sleight of Hand', ability: 'DEX' }, { name: 'Spot Hidden', ability: 'POW' }, { name: 'Stealth', ability: 'DEX' },
      { name: 'Survival', ability: 'EDU' }, { name: 'Swim', ability: 'STR' }, { name: 'Throw', ability: 'DEX' },
      { name: 'Track', ability: 'INT' },
    ],
    // CoC has NO classes. Occupations are the closest analogue — skill packages with a
    // Credit Rating band and an occupation-points formula. hitDie/hpPerLevel are null and
    // `caster` is 'none' because none of those concepts exist in this system.
    classes: [
      { name: 'Antiquarian', keyAbility: 'EDU', hitDie: null, hpPerLevel: null, saves: [], caster: 'none' },
      { name: 'Author', keyAbility: 'EDU', hitDie: null, hpPerLevel: null, saves: [], caster: 'none' },
      { name: 'Detective', keyAbility: 'EDU', hitDie: null, hpPerLevel: null, saves: [], caster: 'none' },
      { name: 'Dilettante', keyAbility: 'APP', hitDie: null, hpPerLevel: null, saves: [], caster: 'none' },
      { name: 'Doctor of Medicine', keyAbility: 'EDU', hitDie: null, hpPerLevel: null, saves: [], caster: 'none' },
      { name: 'Journalist', keyAbility: 'EDU', hitDie: null, hpPerLevel: null, saves: [], caster: 'none' },
      { name: 'Librarian', keyAbility: 'EDU', hitDie: null, hpPerLevel: null, saves: [], caster: 'none' },
      { name: 'Occultist', keyAbility: 'EDU', hitDie: null, hpPerLevel: null, saves: [], caster: 'none' },
      { name: 'Parapsychologist', keyAbility: 'EDU', hitDie: null, hpPerLevel: null, saves: [], caster: 'none' },
      { name: 'Police Detective', keyAbility: 'EDU', hitDie: null, hpPerLevel: null, saves: [], caster: 'none' },
      { name: 'Private Investigator', keyAbility: 'EDU', hitDie: null, hpPerLevel: null, saves: [], caster: 'none' },
      { name: 'Professor', keyAbility: 'EDU', hitDie: null, hpPerLevel: null, saves: [], caster: 'none' },
    ],
    // Investigators are ordinary humans — there is no species/ancestry choice.
    species: ['Human'],
    conditions: ['Dying', 'Major Wound', 'Unconscious', 'Temporary Insanity', 'Indefinite Insanity', 'Bout of Madness', 'Phobia', 'Mania', 'Poisoned', 'Prone'],
    // "Feats" do not exist; these are the signature rules/pushes an investigator actually uses.
    sampleFeats: ['Push the Roll', 'Spend Luck', 'Fight Back', 'Dodge', 'Outmanoeuvre', 'First Aid', 'Psychoanalysis', 'Credit Rating spend'],
  },
};

// ── Blades in the Dark ────────────────────────────────────────────────────────────────────
const BLADES_IN_THE_DARK: SystemRules = {
  key: 'blades',
  label: 'Blades in the Dark',
  source: 'Blades in the Dark (John Harper, Evil Hat)',
  ability: {
    abilities: ['Insight', 'Prowess', 'Resolve'],
    generation:
      'You do not have ability scores. You have three ATTRIBUTES — Insight, Prowess, Resolve — each of which is simply how many of its action ratings are rated 1+. You distribute action dots instead: your playbook gives 1 starting dot, your heritage/background/vice choices shape the fiction, and you add 4 more dots (max 2 in any single action at creation).',
    range: 'Action ratings run 0–4 dots (0–2 at creation). An attribute rating is 0–4 — the count of its actions with at least one dot.',
    scoreMax: 4,
    scoreMin: 0,
    modifier:
      'There is no modifier. Your action rating IS the number of d6 you roll. Attribute ratings are used only for resistance rolls.',
    scoreBased: false,
  },
  proficiency:
    'No proficiency bonus. Competence is the action rating (0–4 dots) = the size of your d6 pool. With 0 dots you roll 2d6 and take the WORST result.',
  profBonusByLevel: null,
  levelMin: 1,
  levelMax: 1,
  advancement:
    'There are NO levels. You mark XP on your playbook and attribute tracks (from desperate rolls, expressing your beliefs/heritage/vice, and playbook triggers); filling a track buys a new action dot or a special ability. Crews advance separately with their own XP, tier and upgrades.',
  saves:
    'No saving throws. You RESIST consequences: choose an attribute (Insight/Prowess/Resolve), roll that many d6, and reduce or avoid the consequence — you take 6 minus your highest die in STRESS (a critical reduces stress by 1 instead).',
  coreResolution:
    'Roll a pool of d6 equal to your action rating and read the SINGLE HIGHEST die: 6 = full success; 4–5 = success with a consequence; 1–3 = failure/bad outcome. Two or more 6s = a critical (improved effect). With a 0-dot pool, roll 2d6 and take the LOWEST. Every roll is framed by POSITION (controlled / risky / desperate) and EFFECT (limited / standard / great).',
  actionEconomy:
    'There are no turns, initiative, or action counts. Play moves conversationally through the fiction; the GM frames a position and effect, and you roll an action when the outcome is uncertain. Scores use flashbacks (spend stress) instead of planning, and the engagement roll starts the score in medias res.',
  rest:
    'No hit points and no resting. Harm is recorded on a 4-level track (lesser / moderate / severe / fatal) and healed during DOWNTIME with a long-term healing clock. Stress clears via a downtime Vice indulgence; overflowing stress (past 9) means TRAUMA and the character is permanently changed — at 4 traumas they retire.',
  progressionCadence:
    'Advancement is per-downtime, not per-level: mark XP, fill a track, take an action dot or a special ability. Downtime gives 2 free activities (plus more for coin): Long-Term Project, Recover, Reduce Heat, Train, Indulge Vice, Acquire Asset.',
  keyFacts: [
    'There are NO levels, hit points, classes, or armor class. Never model Blades with d20 scaffolding.',
    'Read only the HIGHEST die in the pool — dice are never summed.',
    'Position (controlled/risky/desperate) and Effect (limited/standard/great) are set BEFORE the roll and are the real dials.',
    'Stress is the core currency: push yourself (+1d), assist, flashback, or resist — but 9 stress = trauma.',
    'Harm is a 4-level track with fictional descriptors, not numeric damage.',
    'Playbooks (Cutter, Hound, Leech…) are not classes and do not level — they are XP triggers plus a special-ability list.',
  ],
  content: {
    // Blades' 12 actions are its "skills", grouped under the three attributes.
    skills: [
      { name: 'Hunt', ability: 'Insight' }, { name: 'Study', ability: 'Insight' }, { name: 'Survey', ability: 'Insight' }, { name: 'Tinker', ability: 'Insight' },
      { name: 'Finesse', ability: 'Prowess' }, { name: 'Prowl', ability: 'Prowess' }, { name: 'Skirmish', ability: 'Prowess' }, { name: 'Wreck', ability: 'Prowess' },
      { name: 'Attune', ability: 'Resolve' }, { name: 'Command', ability: 'Resolve' }, { name: 'Consort', ability: 'Resolve' }, { name: 'Sway', ability: 'Resolve' },
    ],
    // Playbooks, NOT classes: no hit die, no HP/level, no saves, no casting.
    classes: [
      { name: 'Cutter', keyAbility: 'Prowess', hitDie: null, hpPerLevel: null, saves: [], caster: 'none' },
      { name: 'Hound', keyAbility: 'Insight', hitDie: null, hpPerLevel: null, saves: [], caster: 'none' },
      { name: 'Leech', keyAbility: 'Insight', hitDie: null, hpPerLevel: null, saves: [], caster: 'none' },
      { name: 'Lurk', keyAbility: 'Prowess', hitDie: null, hpPerLevel: null, saves: [], caster: 'none' },
      { name: 'Slide', keyAbility: 'Resolve', hitDie: null, hpPerLevel: null, saves: [], caster: 'none' },
      { name: 'Spider', keyAbility: 'Resolve', hitDie: null, hpPerLevel: null, saves: [], caster: 'none' },
      { name: 'Whisper', keyAbility: 'Resolve', hitDie: null, hpPerLevel: null, saves: [], caster: 'none' },
    ],
    // Heritages (where you're from), Blades' nearest analogue to species — all human.
    species: ['Akoros', 'The Dagger Isles', 'Iruvia', 'Severos', 'Skovlan', 'Tycheros'],
    conditions: ['Lesser Harm', 'Moderate Harm', 'Severe Harm', 'Fatal Harm', 'Stress', 'Trauma (Cold)', 'Trauma (Haunted)', 'Trauma (Obsessed)', 'Trauma (Paranoid)', 'Trauma (Reckless)', 'Trauma (Soft)', 'Trauma (Unstable)', 'Trauma (Vicious)', 'Heat', 'Wanted'],
    // Special abilities, Blades' analogue to feats.
    sampleFeats: ['Battleborn', 'Bodyguard', 'Ghost Fighter', 'Sharpshooter', 'Survivor', 'Rook’s Gambit', 'Mesmerism', 'Compel', 'Tempest', 'Not to be Trifled With'],
  },
};

// ── Cyberpunk RED ─────────────────────────────────────────────────────────────────────────
const CYBERPUNK_RED: SystemRules = {
  key: 'cyberpunk-red',
  label: 'Cyberpunk RED',
  source: 'Cyberpunk RED Core Rulebook (R. Talsorian Games)',
  ability: {
    abilities: ['INT', 'REF', 'DEX', 'TECH', 'COOL', 'WILL', 'LUCK', 'MOVE', 'BODY', 'EMP'],
    generation:
      'Ten STATS rated 2–8 at creation. Streetrats/Edgerunner templates hand you an array; Complete Package point-buy gives 62 points (Street Rat) or 62–80 depending on the campaign power level, minimum 2 and maximum 8 in any stat.',
    range: 'Stats run 2–8 at creation (humans cap at 10 in play). Cyberware can raise some stats; EMP drops as you install more cyberware (Humanity Loss ÷ 10).',
    scoreMax: 10,
    scoreMin: 1,
    modifier:
      'There is no modifier table — the STAT is added directly. A check is 1d10 + STAT + SKILL (+ any modifiers).',
    scoreBased: true,
  },
  proficiency:
    'No proficiency bonus. Every skill has its own level 0–10 bought with points; the skill level is added directly. Skills above 6 cost double to raise. Role Abilities (e.g. Solo’s Combat Awareness) have their own 1–10 rank.',
  profBonusByLevel: null,
  levelMin: 1,
  levelMax: 1,
  advancement:
    'There are NO levels. You earn IMPROVEMENT POINTS (IP) and spend them per-skill (cost scales with the target level × its difficulty multiplier); your Role Ability rank is raised the same way. Reputation is tracked separately.',
  saves:
    'No saving throws. You resist with a stat/skill check (e.g. Resist Torture/Drugs), or with armor Stopping Power reducing incoming damage.',
  coreResolution:
    'Roll 1d10 + STAT + SKILL vs a DV (Difficulty Value) or an opposed roll. A natural 10 EXPLODES (roll again and add); a natural 1 CRITICALLY FAILS (roll again and subtract). Note this is a single d10, not a d20.',
  actionEconomy:
    'Each turn you get one MOVE action and one ACTION (you may swap the action for a second move). Initiative is 1d10 + REF, no re-roll each round. There are no bonus actions or reactions in the 5e sense.',
  rest:
    'Hit points return with rest and First Aid/Paramedic checks: you recover BODY-based HP per day of rest. Being Mortally Wounded requires a Death Save (roll d10 under BODY, cumulative penalty) and stabilisation — there is no magical healing.',
  progressionCadence:
    'Improvement is continuous via IP spends, not level-ups. Cyberware installation costs money, surgery time and HUMANITY; if Humanity drops to 0 you go cyberpsycho. Empathy = current Humanity ÷ 10.',
  keyFacts: [
    'The core roll is 1d10 + STAT + SKILL — never d20, and there is no proficiency bonus.',
    'There are no levels, no classes, and no hit dice. Roles (Solo, Netrunner, Fixer…) are jobs with a signature Role Ability.',
    'Hit points = 10 + (5 × the average of BODY and WILL, rounded up). Seriously Wounded at half HP; Mortally Wounded at 0.',
    'Armor has Stopping Power that SUBTRACTS from damage and ablates as it is hit — there is no armor class.',
    'Cyberware costs Humanity; Empathy is Humanity ÷ 10. At 0 Humanity the character is lost to cyberpsychosis.',
    'Natural 10 explodes upward and natural 1 explodes downward — do not model 5e crit rules.',
  ],
  content: {
    skills: [
      { name: 'Athletics', ability: 'DEX' }, { name: 'Brawling', ability: 'DEX' }, { name: 'Concentration', ability: 'WILL' },
      { name: 'Conversation', ability: 'EMP' }, { name: 'Cryptography', ability: 'INT' }, { name: 'Education', ability: 'INT' },
      { name: 'Evasion', ability: 'DEX' }, { name: 'First Aid', ability: 'TECH' }, { name: 'Handgun', ability: 'REF' },
      { name: 'Human Perception', ability: 'EMP' }, { name: 'Interface', ability: 'INT' }, { name: 'Interrogation', ability: 'COOL' },
      { name: 'Local Expert', ability: 'INT' }, { name: 'Melee Weapon', ability: 'DEX' }, { name: 'Perception', ability: 'INT' },
      { name: 'Persuasion', ability: 'COOL' }, { name: 'Pick Lock', ability: 'TECH' }, { name: 'Shoulder Arms', ability: 'REF' },
      { name: 'Stealth', ability: 'DEX' }, { name: 'Streetwise', ability: 'COOL' }, { name: 'Tactics', ability: 'INT' },
      { name: 'Tech Weapon', ability: 'TECH' }, { name: 'Basic Tech', ability: 'TECH' }, { name: 'Drive Land Vehicle', ability: 'REF' },
      { name: 'Wardrobe & Style', ability: 'COOL' }, { name: 'Trading', ability: 'COOL' }, { name: 'Resist Torture/Drugs', ability: 'WILL' },
    ],
    // ROLES, not classes — each has a signature Role Ability; no hit die, no saves, no casting.
    classes: [
      { name: 'Rockerboy', keyAbility: 'COOL', hitDie: null, hpPerLevel: null, saves: [], caster: 'none' },
      { name: 'Solo', keyAbility: 'REF', hitDie: null, hpPerLevel: null, saves: [], caster: 'none' },
      { name: 'Netrunner', keyAbility: 'INT', hitDie: null, hpPerLevel: null, saves: [], caster: 'none' },
      { name: 'Tech', keyAbility: 'TECH', hitDie: null, hpPerLevel: null, saves: [], caster: 'none' },
      { name: 'Medtech', keyAbility: 'TECH', hitDie: null, hpPerLevel: null, saves: [], caster: 'none' },
      { name: 'Media', keyAbility: 'INT', hitDie: null, hpPerLevel: null, saves: [], caster: 'none' },
      { name: 'Exec', keyAbility: 'COOL', hitDie: null, hpPerLevel: null, saves: [], caster: 'none' },
      { name: 'Lawman', keyAbility: 'COOL', hitDie: null, hpPerLevel: null, saves: [], caster: 'none' },
      { name: 'Fixer', keyAbility: 'COOL', hitDie: null, hpPerLevel: null, saves: [], caster: 'none' },
      { name: 'Nomad', keyAbility: 'REF', hitDie: null, hpPerLevel: null, saves: [], caster: 'none' },
    ],
    species: ['Human'],
    conditions: ['Seriously Wounded', 'Mortally Wounded', 'Dead', 'Stunned', 'Prone', 'Grappled', 'Blinded', 'Deafened', 'Drugged', 'On Fire', 'Cyberpsychosis'],
    // Role Abilities — the closest analogue to feats.
    sampleFeats: ['Combat Awareness (Solo)', 'Interface (Netrunner)', 'Maker (Tech)', 'Medicine (Medtech)', 'Charismatic Impact (Rockerboy)', 'Credibility (Media)', 'Teamwork (Exec)', 'Backup (Lawman)', 'Operator (Fixer)', 'Moto (Nomad)'],
  },
};

// ── Shadowrun 6e ──────────────────────────────────────────────────────────────────────────
const SHADOWRUN_6E: SystemRules = {
  key: 'shadowrun6e',
  label: 'Shadowrun 6e',
  source: 'Shadowrun, Sixth World Core Rulebook',
  ability: {
    abilities: ['BOD', 'AGI', 'REA', 'STR', 'WIL', 'LOG', 'INT', 'CHA', 'EDG', 'ESS', 'MAG', 'RES'],
    generation:
      'Attributes are rated 1–6 for most metahumans (metatype raises some maxima). Characters are built with PRIORITY assignment (A–E across Metatype, Attributes, Magic/Resonance, Skills and Resources) or an optional point-buy. Essence starts at 6 and drops as cyberware is installed; Magic/Resonance exist only for Awakened/Emerged characters.',
    range: 'Natural attributes are 1–6 (up to 9+ for some metatypes); augmented values may exceed the natural maximum by up to +4.',
    scoreMax: 9,
    scoreMin: 1,
    modifier:
      'There is no modifier. The attribute IS a count of dice. A test pool = Attribute + Skill (+ modifiers), each die rolled separately.',
    scoreBased: true,
  },
  proficiency:
    'No proficiency bonus. Skills are rated 1–6 (specializations +2 dice, expertise +3) and are ADDED to an attribute to size the dice pool. An untrained skill defaults to the attribute alone at a penalty.',
  profBonusByLevel: null,
  levelMin: 1,
  levelMax: 1,
  advancement:
    'There are NO levels. You earn KARMA and spend it to raise skills and attributes (cost = new rating × a multiplier), buy qualities, or learn spells. Nuyen buys gear, cyberware and lifestyle.',
  saves:
    'No saving throws. You resist with a dice-pool test: damage resistance is BODY (+ armor), drain from spellcasting is resisted with WIL + (LOG/CHA depending on tradition), and opposed tests replace most "saves".',
  coreResolution:
    'Roll a pool of d6 equal to Attribute + Skill; each 5 or 6 is a HIT. Beat the threshold (or the opponent’s hits) to succeed — dice are counted, never summed. A glitch is more than half the dice showing 1s; with zero hits that is a CRITICAL glitch. EDGE is earned and spent for bonuses; the Attack/Defense Rating comparison awards Edge each combat round.',
  actionEconomy:
    'Each combat round you get one MAJOR action and one MINOR action (more minors from high Initiative). Initiative = REA + INT + 1d6, and Initiative Score no longer buys extra passes the way earlier editions did.',
  rest:
    'Two damage tracks — PHYSICAL and STUN — each with boxes based on BOD/WIL. Stun heals in about an hour of rest, physical damage over days; a First Aid or Medicine test speeds it up. Overflowing the physical track means dying.',
  progressionCadence:
    'Continuous Karma spend, not level-ups. Cyberware costs ESSENCE, and losing Essence permanently lowers a magician’s MAGIC — the core cyber-vs-magic trade-off of the setting.',
  keyFacts: [
    'The core roll is a d6 dice POOL counting hits on 5–6 — never d20, and dice are never summed.',
    'There are no levels, no classes and no hit dice. Archetypes (Street Samurai, Decker…) are just build concepts.',
    'Two condition tracks: Physical (8 + BOD÷2 boxes) and Stun (8 + WIL÷2). Damage does not come off one HP number.',
    'Essence loss from cyberware permanently reduces MAGIC — augmentation and magic are in direct tension.',
    'A glitch (over half the dice are 1s) can happen even on a success; zero hits plus a glitch is a critical glitch.',
    'Edge is a per-round earned currency driven by comparing Attack Rating vs Defense Rating.',
  ],
  content: {
    skills: [
      { name: 'Astral', ability: 'INT' }, { name: 'Athletics', ability: 'AGI' }, { name: 'Biotech', ability: 'LOG' },
      { name: 'Close Combat', ability: 'AGI' }, { name: 'Con', ability: 'CHA' }, { name: 'Conjuring', ability: 'MAG' },
      { name: 'Cracking', ability: 'LOG' }, { name: 'Electronics', ability: 'LOG' }, { name: 'Enchanting', ability: 'MAG' },
      { name: 'Engineering', ability: 'LOG' }, { name: 'Exotic Weapons', ability: 'AGI' }, { name: 'Firearms', ability: 'AGI' },
      { name: 'Influence', ability: 'CHA' }, { name: 'Outdoors', ability: 'INT' }, { name: 'Perception', ability: 'INT' },
      { name: 'Piloting', ability: 'REA' }, { name: 'Sorcery', ability: 'MAG' }, { name: 'Stealth', ability: 'AGI' },
      { name: 'Tasking', ability: 'RES' },
    ],
    // Archetypes, not classes.
    classes: [
      { name: 'Street Samurai', keyAbility: 'AGI', hitDie: null, hpPerLevel: null, saves: [], caster: 'none' },
      { name: 'Decker', keyAbility: 'LOG', hitDie: null, hpPerLevel: null, saves: [], caster: 'none' },
      { name: 'Technomancer', keyAbility: 'RES', hitDie: null, hpPerLevel: null, saves: [], caster: 'none' },
      { name: 'Rigger', keyAbility: 'REA', hitDie: null, hpPerLevel: null, saves: [], caster: 'none' },
      { name: 'Mage', keyAbility: 'MAG', hitDie: null, hpPerLevel: null, saves: [], caster: 'spontaneous' },
      { name: 'Shaman', keyAbility: 'MAG', hitDie: null, hpPerLevel: null, saves: [], caster: 'spontaneous' },
      { name: 'Adept', keyAbility: 'MAG', hitDie: null, hpPerLevel: null, saves: [], caster: 'none' },
      { name: 'Face', keyAbility: 'CHA', hitDie: null, hpPerLevel: null, saves: [], caster: 'none' },
    ],
    species: ['Human', 'Elf', 'Dwarf', 'Ork', 'Troll'],
    conditions: ['Physical Damage', 'Stun Damage', 'Wound Modifier', 'Glitched', 'Critical Glitch', 'Prone', 'Blinded', 'Deafened', 'Fatigued', 'Dying', 'Drain', 'Fading'],
    // Qualities — the closest analogue to feats.
    sampleFeats: ['Ambidextrous', 'Analytical Mind', 'Blandness', 'Catlike', 'Exceptional Attribute', 'Guts', 'Home Ground', 'Toughness', 'Codeslinger', 'Focused Concentration'],
  },
};

// ── Pathfinder 1e ─────────────────────────────────────────────────────────────────────────
const PATHFINDER_1E: SystemRules = {
  key: 'pathfinder1e',
  label: 'Pathfinder 1e',
  source: 'Pathfinder Roleplaying Game Core Rulebook',
  ability: {
    abilities: ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'],
    generation:
      'Six ability SCORES. Standard point-buy is 15 points (High Fantasy 20, Epic 25) on the 7–18 purchase table before racial modifiers; alternatively roll 4d6 drop lowest. Races apply +2/−2 style modifiers (or a +2 to one score of choice).',
    range: 'Scores typically 7–18 at creation before racial modifiers (racials can push a starting score to 20). There is no hard cap in play — items, levels and inherent bonuses raise scores further.',
    scoreMax: 50,
    scoreMin: 1,
    modifier: 'Modifier = (score − 10) ÷ 2, rounded down — the classic 3.x formula.',
    scoreBased: true,
  },
  proficiency:
    'NO proficiency bonus — that is a 5e concept. PF1 uses BASE ATTACK BONUS (good = level, average = ¾ level, poor = ½ level) plus SKILL RANKS: you get (class skill ranks + INT mod) per level, max ranks = character level, and a class skill with at least 1 rank gets a +3 class-skill bonus. Weapon/armor proficiency is a binary feat-like property, not a scaling number.',
  profBonusByLevel: null,
  levelMin: 1,
  levelMax: 20,
  advancement:
    'Levels 1–20 on a slow/medium/fast XP track (or milestone). Iterative attacks arrive at BAB +6/+11/+16 as part of a full attack.',
  saves:
    'THREE saving throws — Fortitude, Reflex, Will — each a good (2 + ½ level) or poor (⅓ level) progression plus CON/DEX/WIS. There are no per-ability saves.',
  coreResolution:
    'Roll d20 + modifiers vs a DC or an opponent’s Armor Class. Natural 20 on an attack threatens a critical (confirm with a second attack roll); natural 1 always misses. No advantage/disadvantage — PF1 stacks explicit typed bonuses (circumstance, morale, enhancement…) which do not stack with themselves.',
  actionEconomy:
    'Per round: one standard + one move (or a full-round action), plus a swift and a free action, and one immediate action per round. Attacks of opportunity are driven by threatened squares and provoking actions. There is no bonus action.',
  rest:
    'A night’s rest restores 1 HP per character level (full bed rest 2/level) and lets casters re-prepare. Ability damage heals 1/day. Healing magic is the fast route; there is no short-rest hit-dice mechanic.',
  progressionCadence:
    'Ability score increase: +1 to ONE ability at levels 4, 8, 12, 16, 20. Feats at every ODD level (1,3,5…19) plus bonus feats from race/class. Skill ranks every level. This differs from 5e: never give PF1 a +2 ASI at 4th.',
  keyFacts: [
    'PF1 has NO proficiency bonus and NO advantage/disadvantage — use BAB, skill ranks and typed bonuses.',
    'Feats come at every odd level; ability increases are +1 at 4/8/12/16/20 (not 5e’s +2 ASI).',
    'Three saves (Fort/Ref/Will), not six.',
    'Criticals must be CONFIRMED with a second roll, and weapons have their own threat range and multiplier (e.g. 18–20/×2).',
    'Skills use ranks capped at character level, with a +3 class-skill bonus once you have a rank in it.',
    'Do NOT import 5e concepts (short rests, hit dice spending, cantrip scaling, bounded accuracy).',
  ],
  content: {
    skills: [
      { name: 'Acrobatics', ability: 'DEX' }, { name: 'Appraise', ability: 'INT' }, { name: 'Bluff', ability: 'CHA' },
      { name: 'Climb', ability: 'STR' }, { name: 'Craft', ability: 'INT' }, { name: 'Diplomacy', ability: 'CHA' },
      { name: 'Disable Device', ability: 'DEX' }, { name: 'Disguise', ability: 'CHA' }, { name: 'Escape Artist', ability: 'DEX' },
      { name: 'Fly', ability: 'DEX' }, { name: 'Handle Animal', ability: 'CHA' }, { name: 'Heal', ability: 'WIS' },
      { name: 'Intimidate', ability: 'CHA' }, { name: 'Knowledge (Arcana)', ability: 'INT' }, { name: 'Knowledge (Dungeoneering)', ability: 'INT' },
      { name: 'Knowledge (Local)', ability: 'INT' }, { name: 'Knowledge (Nature)', ability: 'INT' }, { name: 'Knowledge (Religion)', ability: 'INT' },
      { name: 'Linguistics', ability: 'INT' }, { name: 'Perception', ability: 'WIS' }, { name: 'Perform', ability: 'CHA' },
      { name: 'Profession', ability: 'WIS' }, { name: 'Ride', ability: 'DEX' }, { name: 'Sense Motive', ability: 'WIS' },
      { name: 'Sleight of Hand', ability: 'DEX' }, { name: 'Spellcraft', ability: 'INT' }, { name: 'Stealth', ability: 'DEX' },
      { name: 'Survival', ability: 'WIS' }, { name: 'Swim', ability: 'STR' }, { name: 'Use Magic Device', ability: 'CHA' },
    ],
    classes: [
      { name: 'Barbarian', keyAbility: 'STR', hitDie: 12, hpPerLevel: null, saves: ['Fortitude'], caster: 'none' },
      { name: 'Bard', keyAbility: 'CHA', hitDie: 8, hpPerLevel: null, saves: ['Reflex', 'Will'], caster: 'spontaneous' },
      { name: 'Cleric', keyAbility: 'WIS', hitDie: 8, hpPerLevel: null, saves: ['Fortitude', 'Will'], caster: 'prepared' },
      { name: 'Druid', keyAbility: 'WIS', hitDie: 8, hpPerLevel: null, saves: ['Fortitude', 'Will'], caster: 'prepared' },
      { name: 'Fighter', keyAbility: 'STR', hitDie: 10, hpPerLevel: null, saves: ['Fortitude'], caster: 'none' },
      { name: 'Monk', keyAbility: 'WIS', hitDie: 8, hpPerLevel: null, saves: ['Fortitude', 'Reflex', 'Will'], caster: 'none' },
      { name: 'Paladin', keyAbility: 'CHA', hitDie: 10, hpPerLevel: null, saves: ['Fortitude', 'Will'], caster: 'prepared' },
      { name: 'Ranger', keyAbility: 'DEX', hitDie: 10, hpPerLevel: null, saves: ['Fortitude', 'Reflex'], caster: 'prepared' },
      { name: 'Rogue', keyAbility: 'DEX', hitDie: 8, hpPerLevel: null, saves: ['Reflex'], caster: 'none' },
      { name: 'Sorcerer', keyAbility: 'CHA', hitDie: 6, hpPerLevel: null, saves: ['Will'], caster: 'spontaneous' },
      { name: 'Wizard', keyAbility: 'INT', hitDie: 6, hpPerLevel: null, saves: ['Will'], caster: 'prepared' },
      { name: 'Alchemist', keyAbility: 'INT', hitDie: 8, hpPerLevel: null, saves: ['Fortitude', 'Reflex'], caster: 'prepared' },
      { name: 'Cavalier', keyAbility: 'STR', hitDie: 10, hpPerLevel: null, saves: ['Fortitude'], caster: 'none' },
      { name: 'Inquisitor', keyAbility: 'WIS', hitDie: 8, hpPerLevel: null, saves: ['Fortitude', 'Will'], caster: 'prepared' },
      { name: 'Oracle', keyAbility: 'CHA', hitDie: 8, hpPerLevel: null, saves: ['Will'], caster: 'spontaneous' },
      { name: 'Summoner', keyAbility: 'CHA', hitDie: 8, hpPerLevel: null, saves: ['Will'], caster: 'spontaneous' },
      { name: 'Witch', keyAbility: 'INT', hitDie: 6, hpPerLevel: null, saves: ['Will'], caster: 'prepared' },
      { name: 'Magus', keyAbility: 'INT', hitDie: 8, hpPerLevel: null, saves: ['Fortitude', 'Will'], caster: 'prepared' },
      { name: 'Gunslinger', keyAbility: 'DEX', hitDie: 10, hpPerLevel: null, saves: ['Fortitude', 'Reflex'], caster: 'none' },
    ],
    species: ['Human', 'Dwarf', 'Elf', 'Gnome', 'Half-Elf', 'Half-Orc', 'Halfling', 'Aasimar', 'Tiefling', 'Goblin'],
    conditions: ['Blinded', 'Confused', 'Cowering', 'Dazed', 'Dazzled', 'Deafened', 'Dying', 'Entangled', 'Exhausted', 'Fascinated', 'Fatigued', 'Flat-Footed', 'Frightened', 'Grappled', 'Helpless', 'Nauseated', 'Panicked', 'Paralyzed', 'Petrified', 'Pinned', 'Prone', 'Shaken', 'Sickened', 'Staggered', 'Stunned', 'Unconscious'],
    sampleFeats: ['Power Attack', 'Weapon Finesse', 'Combat Expertise', 'Dodge', 'Toughness', 'Improved Initiative', 'Point-Blank Shot', 'Precise Shot', 'Spell Focus', 'Vital Strike', 'Weapon Focus', 'Great Cleave'],
  },
};

// ── Starfinder 1e ─────────────────────────────────────────────────────────────────────────
const STARFINDER_1E: SystemRules = {
  key: 'starfinder1e',
  label: 'Starfinder 1e',
  source: 'Starfinder Core Rulebook (Paizo)',
  ability: {
    abilities: ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'],
    generation:
      'Six ability SCORES built with a 10-point buy from a base of 10 (each +1 costs 1 point up to 16, then 2 points), then apply your race’s ability adjustments and your theme’s +1. Every score starts at 10 — there is no rolling in the default rules.',
    range: 'Scores start around 10–18 after race/theme. Ability increases at 5th, 10th, 15th and 20th raise FOUR abilities each (+2 if the score is 16 or lower, otherwise +1).',
    scoreMax: 30,
    scoreMin: 1,
    modifier: 'Modifier = (score − 10) ÷ 2, rounded down.',
    scoreBased: true,
  },
  proficiency:
    'NO 5e-style proficiency bonus. Starfinder uses BASE ATTACK BONUS (full = level, ¾ = 0.75×level) plus SKILL RANKS (class ranks + INT mod per level, max ranks = level, +3 for a class skill with at least 1 rank). Weapon/armor proficiency is binary.',
  profBonusByLevel: null,
  levelMin: 1,
  levelMax: 20,
  advancement:
    'Levels 1–20 on an XP track (or milestone). Each level grants class features, skill ranks, and a Stamina/HP increase.',
  saves:
    'THREE saving throws — Fortitude, Reflex, Will — good (2 + ½ level) or poor (⅓ level) plus CON/DEX/WIS.',
  coreResolution:
    'Roll d20 + modifiers vs a DC, an Armor Class (EAC or KAC), or an opposed roll. Natural 20 on an attack is an automatic hit and a critical — Starfinder does NOT confirm crits (unlike PF1) — and natural 1 is an automatic miss. No advantage/disadvantage.',
  actionEconomy:
    'Per round: one standard + one move + one swift (or a full action), plus one reaction. Starship combat runs a separate phase-based turn structure with defined roles (pilot, gunner, engineer, science officer, captain).',
  rest:
    'TWO pools: STAMINA POINTS absorb damage first and are fully restored by a 10-minute rest that costs 1 Resolve Point; HIT POINTS only heal overnight (or with magic/tech). Resolve Points refresh on a full night’s rest and also fuel stabilising when dying.',
  progressionCadence:
    'Ability increases at 5/10/15/20 apply to FOUR abilities at once (+2 if ≤16, else +1) — not a 5e ASI and not PF1’s single +1 at 4/8/12/16/20. Feats at every ODD level (1,3,5…19), plus class/theme bonus feats.',
  keyFacts: [
    'Two armor classes: EAC (Energy) and KAC (Kinetic) — an attack targets one of them. There is no single AC.',
    'Stamina + Hit Points are separate pools; Resolve Points gate the 10-minute Stamina refresh and stabilising.',
    'Ability increases hit FOUR abilities at 5/10/15/20 (+2 if the score is 16 or lower, else +1).',
    'Criticals are NOT confirmed (unlike Pathfinder 1e) — a natural 20 that hits simply crits, often with a weapon critical effect (burn, bleed, knockdown).',
    'No proficiency bonus and no advantage/disadvantage — use BAB, ranks and typed bonuses.',
    'Solarians and Soldiers are non-casters; Mystic and Technomancer are the full casters, and spells only go to 6th level.',
  ],
  content: {
    skills: [
      { name: 'Acrobatics', ability: 'DEX' }, { name: 'Athletics', ability: 'STR' }, { name: 'Bluff', ability: 'CHA' },
      { name: 'Computers', ability: 'INT' }, { name: 'Culture', ability: 'INT' }, { name: 'Diplomacy', ability: 'CHA' },
      { name: 'Disguise', ability: 'CHA' }, { name: 'Engineering', ability: 'INT' }, { name: 'Intimidate', ability: 'CHA' },
      { name: 'Life Science', ability: 'INT' }, { name: 'Medicine', ability: 'INT' }, { name: 'Mysticism', ability: 'WIS' },
      { name: 'Perception', ability: 'WIS' }, { name: 'Physical Science', ability: 'INT' }, { name: 'Piloting', ability: 'DEX' },
      { name: 'Profession', ability: 'WIS' }, { name: 'Sense Motive', ability: 'WIS' }, { name: 'Sleight of Hand', ability: 'DEX' },
      { name: 'Stealth', ability: 'DEX' }, { name: 'Survival', ability: 'WIS' },
    ],
    // Starfinder classes use Stamina/level + HP/level; `hpPerLevel` carries the HP figure.
    classes: [
      { name: 'Envoy', keyAbility: 'CHA', hitDie: null, hpPerLevel: 6, saves: ['Reflex', 'Will'], caster: 'none' },
      { name: 'Mechanic', keyAbility: 'INT', hitDie: null, hpPerLevel: 6, saves: ['Fortitude', 'Reflex'], caster: 'none' },
      { name: 'Mystic', keyAbility: 'WIS', hitDie: null, hpPerLevel: 6, saves: ['Will'], caster: 'spontaneous' },
      { name: 'Operative', keyAbility: 'DEX', hitDie: null, hpPerLevel: 6, saves: ['Reflex', 'Will'], caster: 'none' },
      { name: 'Solarian', keyAbility: 'CHA', hitDie: null, hpPerLevel: 7, saves: ['Fortitude'], caster: 'none' },
      { name: 'Soldier', keyAbility: 'STR', hitDie: null, hpPerLevel: 7, saves: ['Fortitude'], caster: 'none' },
      { name: 'Technomancer', keyAbility: 'INT', hitDie: null, hpPerLevel: 5, saves: ['Will'], caster: 'spontaneous' },
      { name: 'Biohacker', keyAbility: 'INT', hitDie: null, hpPerLevel: 7, saves: ['Fortitude', 'Reflex'], caster: 'none' },
      { name: 'Vanguard', keyAbility: 'CON', hitDie: null, hpPerLevel: 7, saves: ['Fortitude', 'Will'], caster: 'none' },
      { name: 'Witchwarper', keyAbility: 'CHA', hitDie: null, hpPerLevel: 5, saves: ['Reflex'], caster: 'spontaneous' },
    ],
    species: ['Android', 'Human', 'Kasatha', 'Lashunta', 'Shirren', 'Vesk', 'Ysoki', 'Dwarf', 'Elf', 'Half-Elf', 'Half-Orc', 'Gnome', 'Halfling'],
    conditions: ['Asleep', 'Bleeding', 'Blinded', 'Broken', 'Burning', 'Confused', 'Cowering', 'Dazed', 'Dazzled', 'Deafened', 'Dying', 'Encumbered', 'Entangled', 'Exhausted', 'Fatigued', 'Flat-Footed', 'Frightened', 'Grappled', 'Nauseated', 'Off-Kilter', 'Off-Target', 'Panicked', 'Paralyzed', 'Pinned', 'Prone', 'Shaken', 'Sickened', 'Staggered', 'Stunned', 'Unconscious'],
    sampleFeats: ['Weapon Focus', 'Improved Initiative', 'Toughness', 'Barricade', 'Cleave', 'Deadly Aim', 'Mobility', 'Opening Volley', 'Shot on the Run', 'Spell Focus', 'Versatile Specialization', 'Great Fortitude'],
  },
};

/** The systems defined in this module, merged into SYSTEM_RULES by system-rules.ts. */
export const EXTRA_SYSTEM_RULES: Record<string, SystemRules> = {
  coc7e: CALL_OF_CTHULHU_7E,
  blades: BLADES_IN_THE_DARK,
  'cyberpunk-red': CYBERPUNK_RED,
  shadowrun6e: SHADOWRUN_6E,
  pathfinder1e: PATHFINDER_1E,
  starfinder1e: STARFINDER_1E,
};
