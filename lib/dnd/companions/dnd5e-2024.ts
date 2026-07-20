// lib/dnd/companions/dnd5e-2024.ts — familiars, steeds, and beast companions for 5e 2024.
//
// The repo had NO 5e creature or companion model at all: Intuitive Games has a full one
// (lib/dnd/systems/intuitive-games/companions.ts, the structural precedent this mirrors), but
// on the 5e side Find Familiar / Find Steed / the Beast Master companion existed only as prose
// inside class feature text, with nothing structured for a sheet to render or compute from.
//
// HOUSE STYLE: paraphrased mechanical facts + numbers, attributed via `source`, never verbatim
// rulebook prose.
//
// GROUND RULE 2 — NEVER INVENTED. Note what this module does and does not claim. The RULES
// (how a familiar acts, what a steed is, how a Primal Companion works) and the FORM OPTION
// LISTS are catalogued. Per-creature statblock NUMBERS — a bat's AC, an owl's hit points — are
// deliberately NOT here: getting those wrong would feed bad math into a sheet that computes
// from them, and they are a large body of data to transcribe accurately. `COMPANION_STATBLOCK_STATUS`
// says so explicitly so nothing mistakes their absence for "this creature has no stats".

export type CompanionKind = 'familiar' | 'steed' | 'primal-companion' | 'wild-shape';

/** What a summoned spirit's creature type may be — 2024 lets the caster choose. */
export type SpiritType = 'Celestial' | 'Fey' | 'Fiend';

export const SPIRIT_TYPES: SpiritType[] = ['Celestial', 'Fey', 'Fiend'];

export interface CompanionRuleSet {
  kind: CompanionKind;
  name: string;
  /** The feature or spell that grants it. */
  grantedBy: string;
  /** Classes that can get it by default. */
  classes: string[];
  /** The mechanical rules, one paraphrased fact per entry. */
  rules: string[];
  editionNote?: string;
  source: string;
}

/** A form a familiar or companion can take. Movement is the mechanically load-bearing part
 *  (it decides what the creature can scout), so it is recorded; full statblocks are not. */
export interface CompanionForm {
  name: string;
  /** e.g. 'flying', 'swimming', 'climbing', 'burrowing', or '' for ordinary ground movement. */
  movement: string;
  /** Why you would pick it — the scouting/utility niche, paraphrased. */
  note?: string;
}

const PHB = 'PHB 2024';

// ── Find Familiar ───────────────────────────────────────────────────────────
export const FIND_FAMILIAR_RULES: CompanionRuleSet = {
  kind: 'familiar',
  name: 'Familiar',
  grantedBy: 'Find Familiar (1st-level Conjuration ritual)',
  classes: ['Wizard'],
  rules: [
    'The familiar is a spirit that takes an animal form you choose; its creature type is Celestial, Fey, or Fiend (your choice), not Beast.',
    'It acts independently but always obeys your commands, and it rolls its own initiative.',
    'It cannot attack, but it can take other actions normally.',
    'While it is within 100 feet of you, you can communicate telepathically and can see through its senses as an action.',
    'It can deliver a spell you cast with a range of Touch, using its reaction, as if it had cast the spell.',
    'If it drops to 0 hit points it vanishes rather than dying, and you can bring it back by recasting the ritual.',
    'You can dismiss it to a pocket dimension and recall it as an action.',
    'You can have only one familiar at a time.',
  ],
  editionNote: 'In 2024 the familiar is explicitly a Celestial, Fey, or Fiend spirit and the touch-spell delivery is a reaction.',
  source: PHB,
};

/** The animal forms Find Familiar offers. Movement is what usually decides the pick. */
export const FAMILIAR_FORMS: CompanionForm[] = [
  { name: 'Bat', movement: 'flying', note: 'Blindsight — useful in darkness.' },
  { name: 'Cat', movement: 'climbing', note: 'Keen smell; unobtrusive indoors.' },
  { name: 'Crab', movement: 'swimming', note: 'Can breathe underwater.' },
  { name: 'Frog', movement: 'swimming', note: 'Amphibious; also called a toad.' },
  { name: 'Hawk', movement: 'flying', note: 'Keen sight — the standard aerial scout.' },
  { name: 'Lizard', movement: 'climbing' },
  { name: 'Octopus', movement: 'swimming', note: 'Underwater scouting; can grapple small objects.' },
  { name: 'Owl', movement: 'flying', note: 'Flyby, so it can deliver touch spells without provoking.' },
  { name: 'Poisonous Snake', movement: 'swimming' },
  { name: 'Quipper', movement: 'swimming', note: 'Water only.' },
  { name: 'Rat', movement: '', note: 'Keen smell; fits through small gaps.' },
  { name: 'Raven', movement: 'flying', note: 'Mimicry — can repeat sounds it has heard.' },
  { name: 'Sea Horse', movement: 'swimming', note: 'Water only.' },
  { name: 'Spider', movement: 'climbing', note: 'Web sense; climbs sheer surfaces.' },
  { name: 'Weasel', movement: '', note: 'Keen hearing and smell.' },
];

// ── Find Steed ──────────────────────────────────────────────────────────────
export const FIND_STEED_RULES: CompanionRuleSet = {
  kind: 'steed',
  name: 'Steed',
  grantedBy: 'Find Steed (2nd-level Conjuration)',
  classes: ['Paladin'],
  rules: [
    'Summons a spirit that takes the form of a loyal mount; its creature type is Celestial, Fey, or Fiend (your choice).',
    'The steed can be Medium or Large, chosen when you cast the spell.',
    'It has an intelligent bond with you and understands the languages you speak.',
    'While mounted on it, any spell you cast that targets only yourself can also target the steed.',
    'If it drops to 0 hit points it vanishes rather than dying; recasting the spell restores it.',
    'You can dismiss it as an action.',
  ],
  editionNote: '2024 lets you pick the steed’s size and improves how shared spells work compared with 2014.',
  source: PHB,
};

// ── Beast Master's Primal Companion ─────────────────────────────────────────
export const PRIMAL_COMPANION_RULES: CompanionRuleSet = {
  kind: 'primal-companion',
  name: 'Primal Companion',
  grantedBy: 'Beast Master subclass (Ranger 3)',
  classes: ['Ranger'],
  rules: [
    'You magically summon a primal beast; you choose its shape when you gain the feature and can change it on a long rest.',
    'The beast is an ally that obeys your commands and acts on your initiative, taking its turn immediately after yours.',
    'It can move and use its reaction on its own; it takes an action only if you use a Bonus Action to command it.',
    'Its hit points, attack bonus, and damage scale with your Ranger level rather than being a fixed statblock.',
    'If it drops to 0 hit points you can revive it by expending a spell slot, and it returns after a long rest.',
    'You can summon it without a spell slot a limited number of times per long rest.',
  ],
  editionNote: 'The 2024 Beast Master uses the scaling Beast of the Land/Sea/Sky companion rather than choosing a real Beast statblock as in the original 2014 subclass.',
  source: PHB,
};

/** The three Primal Companion shapes. */
export const PRIMAL_COMPANION_FORMS: CompanionForm[] = [
  { name: 'Beast of the Land', movement: '', note: 'Ground brawler; can knock a target prone with its strike.' },
  { name: 'Beast of the Sea', movement: 'swimming', note: 'Amphibious; can grapple with its strike.' },
  { name: 'Beast of the Sky', movement: 'flying', note: 'Fast flyer, fewer hit points — a harasser and scout.' },
];

// ── Wild Shape ──────────────────────────────────────────────────────────────
export const WILD_SHAPE_RULES: CompanionRuleSet = {
  kind: 'wild-shape',
  name: 'Wild Shape',
  grantedBy: 'Druid 2',
  classes: ['Druid'],
  rules: [
    'As a Bonus Action you transform into a Beast form you know, for a number of hours equal to half your Druid level.',
    'You keep your mental ability scores, your proficiency bonus, and your class features that do not require your own body.',
    'You take on the form’s physical statistics; you gain temporary hit points rather than replacing your own hit point total.',
    'You revert when the duration ends, when you drop to 0 temporary hit points, or as a Bonus Action.',
    'The forms available to you are limited by your Druid level, and you learn additional forms as you level.',
  ],
  editionNote: '2024 Wild Shape grants temporary hit points and is a Bonus Action by default, rather than replacing your hit points as in 2014.',
  source: PHB,
};

export const COMPANION_RULE_SETS: CompanionRuleSet[] = [
  FIND_FAMILIAR_RULES,
  FIND_STEED_RULES,
  PRIMAL_COMPANION_RULES,
  WILD_SHAPE_RULES,
];

/** Honest coverage statement — see the Ground Rule 2 note at the top of this file. */
export const COMPANION_STATBLOCK_STATUS = {
  rulesComplete: true,
  statblocksComplete: false,
  note: 'Companion RULES and form options are catalogued. Per-creature statblock numbers (AC, hit points, attacks) are not yet catalogued — their absence does not mean the creature has no stats.',
} as const;

const RULES_BY_KIND = new Map(COMPANION_RULE_SETS.map((r) => [r.kind, r]));

export function companionRules2024(kind: CompanionKind): CompanionRuleSet | undefined {
  return RULES_BY_KIND.get(kind);
}

/** The companion options a class can access by default. Unknown classes get [] (never invented). */
export function companionsForClass2024(cls: string): CompanionRuleSet[] {
  return COMPANION_RULE_SETS.filter((r) => r.classes.includes(cls));
}

/** The form options for a companion kind, or [] when the kind has no fixed form list. */
export function companionForms2024(kind: CompanionKind): CompanionForm[] {
  switch (kind) {
    case 'familiar': return FAMILIAR_FORMS;
    case 'primal-companion': return PRIMAL_COMPANION_FORMS;
    default: return [];
  }
}
