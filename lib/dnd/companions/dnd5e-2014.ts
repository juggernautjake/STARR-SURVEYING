// lib/dnd/companions/dnd5e-2014.ts — familiars, steeds, beast companions and Wild Shape for 5e 2014
// (P5-5, audit C-7).
//
// The 2024 module (`./dnd5e-2024.ts`) has existed for a while; 2014 had nothing, so a 2014 character asking
// "what can my familiar do" got either silence or — worse — 2024's answer.
//
// THE 2024 LIST WAS NOT REUSED, AND THAT IS THE WHOLE POINT. It is the obvious move and it would have been
// wrong in the places that matter: 2024 made the familiar's touch-spell delivery a Reaction, made Wild
// Shape a Bonus Action granting temporary hit points instead of replacing your hit points, and replaced the
// Beast Master's CR-1/4 beast with the three Primal Companion shapes. Those differences are the reason a
// player looks the rules up at all. P5-6 refused to give 2014 a language list for exactly this reason; here
// the refusal is unnecessary, because 2014's own text is already in the repo.
//
// EVERYTHING IS DERIVED. Every rule string below is either a 2014 SRD spell summary from
// `../spells/dnd5e-2014.ts` or a 2014 class-feature body from `../classes/dnd5e-2014/`, each already
// carrying its own source. Nothing here states a rule that is not already in the repo with a book attached.
import { findSpell2014 } from '../spells/dnd5e-2014';
import { RANGER_SUBCLASSES_2014 } from '../classes/dnd5e-2014/ranger';
import { DRUID_2014 } from '../classes/dnd5e-2014/druid';
import type { CompanionRuleSet } from './dnd5e-2024';

const SRD = 'SRD 5.1 (2014)';

/** Markdown emphasis is for a sheet, not for a grounding payload or a search index. */
const plain = (s: string) => s.replace(/\*\*/g, '').replace(/\r?\n+/g, ' ').trim();

/** A spell's summary, as a one-entry rule list. Returns [] if the spell is not catalogued, so a missing
 *  entry produces an empty rule set rather than a companion described by nothing. */
function spellRules(key: string): { rules: string[]; source: string } {
  const sp = findSpell2014(key);
  return sp ? { rules: [plain(sp.summary)], source: sp.source ?? SRD } : { rules: [], source: SRD };
}

const familiar = spellRules('find-familiar');
const steed = spellRules('find-steed');

export const FIND_FAMILIAR_RULES_2014: CompanionRuleSet = {
  kind: 'familiar',
  name: 'Familiar',
  grantedBy: 'Find Familiar (1st-level Conjuration ritual)',
  classes: findSpell2014('find-familiar')?.classes ?? [],
  rules: familiar.rules,
  source: familiar.source,
};

export const FIND_STEED_RULES_2014: CompanionRuleSet = {
  kind: 'steed',
  name: 'Steed',
  grantedBy: 'Find Steed (2nd-level Conjuration)',
  classes: findSpell2014('find-steed')?.classes ?? [],
  rules: steed.rules,
  source: steed.source,
};

/**
 * The Beast Master's companion, as its four subclass features state it.
 *
 * Derived from the subclass rather than written out, so the LEVELS come from the same place the class page
 * reads them — 3/7/11/15 in 2014, where 2024's Primal Companion arrives at 3 and improves on a different
 * schedule. Getting that wrong is the single most likely 2014/2024 confusion in this whole area.
 */
const beastMaster = RANGER_SUBCLASSES_2014.find((s) => s.key === 'beast-master');

export const RANGERS_COMPANION_RULES_2014: CompanionRuleSet = {
  kind: 'primal-companion',
  name: "Ranger's Companion",
  grantedBy: 'the Beast Master archetype (Ranger 3)',
  classes: ['Ranger'],
  rules: (beastMaster?.features ?? []).map((f) => `${f.name} (level ${f.level}): ${plain(f.body)}`),
  source: SRD,
};

const wildShape = DRUID_2014.features.find((f) => f.name === 'Wild Shape');

export const WILD_SHAPE_RULES_2014: CompanionRuleSet = {
  kind: 'wild-shape',
  name: 'Wild Shape',
  grantedBy: 'Druid 2',
  classes: ['Druid'],
  rules: wildShape ? [plain(wildShape.body)] : [],
  source: SRD,
};

export const COMPANION_RULE_SETS_2014: CompanionRuleSet[] = [
  FIND_FAMILIAR_RULES_2014,
  FIND_STEED_RULES_2014,
  RANGERS_COMPANION_RULES_2014,
  WILD_SHAPE_RULES_2014,
];

/** The companion options a class can access by default. Unknown classes get [] — never invented. */
export function companionsForClass2014(cls: string): CompanionRuleSet[] {
  const n = cls.trim().toLowerCase();
  return COMPANION_RULE_SETS_2014.filter((r) => r.classes.some((c) => c.toLowerCase() === n));
}

/**
 * Honest coverage, and it is the same shape as 2024's for a reason: the two hardest things to catalogue
 * here are identical in both editions.
 *
 * 2014 has one gap 2024 does not — the FORM lists. 2024's Find Familiar and Primal Companion offer fixed,
 * enumerable options (that is why `FAMILIAR_FORMS` and `PRIMAL_COMPANION_FORMS` exist there). 2014's
 * familiar can be any of a list of ordinary animals, and its Beast Master companion is "any beast of CR 1/4
 * or lower" — a constraint on the whole Monster Manual rather than a list. Writing a list would mean
 * choosing which animals count, which is authoring, not cataloguing.
 */
export const COMPANION_STATBLOCK_STATUS_2014 = {
  rulesComplete: true,
  statblocksComplete: false,
  formListsComplete: false,
  note:
    'Companion RULES are catalogued, derived from the 2014 SRD spells and 2014 class features already in the repo. FORM lists are not: 2014 defines its familiar and Beast Master companion by a constraint ("any beast of CR 1/4 or lower") rather than by an enumerable list, so any list here would be a choice made by this file rather than by the book. Per-creature statblock numbers are not catalogued either — their absence does not mean the creature has no stats.',
} as const;
