// lib/dnd/glossary/coverage.ts — what a tooltip can ask for, per system, and whether an article exists.
//
// CX-12, owner's ask verbatim: "every condition and stance and skill and everything" must have tooltip
// text. That is a coverage claim, and a coverage claim is only worth anything if something FAILS when
// it stops being true — otherwise the next person to add a condition silently reintroduces the empty
// tooltip. So this module computes the DEMAND SURFACE (every term a tooltip could be handed) from each
// system's own content, and `__tests__/dnd/glossary-coverage.test.ts` fails on any term with no article.
//
// THE SHAPE IS BORROWED ON PURPOSE. `PF2_CATALOG_STATUS` / `PF2_KNOWN_GAPS` in
// systems/pathfinder2e/data/index.ts established the honest-coverage pattern this repo uses: counts
// derived from the arrays rather than hand-typed, `complete: false` wherever it is, a `note` saying
// what is missing, and gaps recorded in the repo next to the data instead of in a chat log. This
// mirrors it so the two read the same way.
//
// WHY THE DEMAND IS COMPUTED, NOT LISTED. A hand-written list of "terms we should cover" is a second
// copy of the condition list, the skill list and the stance list, and it goes stale the moment any of
// them changes — at which point the coverage test passes while the sheet shows an empty tooltip, which
// is worse than having no test. Every list below is read from the system's own source of truth.
//
// STRICT SYSTEM SCOPING. Each system's demand is built ONLY from that system's own content, and
// coverage is checked ONLY against that system's own glossary. There is no cross-system fallback,
// deliberately: a 2014 sheet resolving a term against 2024 text is the edition bleed CX-16/CX-17
// spent a session removing, and a coverage helper is an easy place to reintroduce it.
import { glossaryFor } from './index';
import { DAMAGE_TYPES } from '@/lib/dnd/term-index';
import { systemConditions, systemSkills } from '@/lib/dnd/system-rules';
import { PF2_CONDITIONS } from '@/lib/dnd/systems/pathfinder2e/data';
import { PF2_SKILLS } from '@/lib/dnd/systems/pathfinder2e/content';
import { PF2_GLOSSARY_GAPS } from './pathfinder2e-derived';
import {
  IG_CONDITIONS, IG_STANCE_DEFS, IG_DAMAGE_TYPE_DATA,
} from '@/lib/dnd/systems/intuitive-games/content';
import { IG_GLOSSARY_GAPS } from './intuitive-games-derived';

/** The four systems the platform treats as fully built out — the ones CX-12 covers. */
export const GLOSSARY_COVERAGE_SYSTEMS = ['dnd5e-2024', 'dnd5e-2014', 'pathfinder2e', 'intuitive-games'] as const;
export type GlossaryCoverageSystem = (typeof GLOSSARY_COVERAGE_SYSTEMS)[number];

/** The categories of term a sheet tooltip can be handed. `stance` is IG-only and that is correct —
 *  no other system here has stances, and manufacturing an empty category for the others would make
 *  the status object read as though something were missing. */
export type DemandKind = 'condition' | 'skill' | 'damage' | 'stance';

export interface GlossaryDemand {
  kind: DemandKind;
  /** The term exactly as a tooltip would ask for it. */
  term: string;
}

/**
 * Damage-type terms carry a " Damage" suffix throughout the glossaries, and the demand matches that.
 *
 * The reason is a real collision rather than a style choice: a bare `Poison` entry would win an
 * exact-TERM lookup over the **Poisoned** condition's `poison` alias, so hovering "poison" in
 * "poisoned by the spider" would open the damage-type article. Naming the entries `Poison Damage`
 * keeps both reachable and keeps the bare word pointing at the condition, which is what a reader
 * hovering a rules sentence almost always means.
 */
const asDamageTerm = (type: string) => `${type.charAt(0).toUpperCase()}${type.slice(1)} Damage`;

/** IG names its damage types in groups — "Elemental (Acid / Fire / Cold / Electricity / Sonic)" — and a
 *  tooltip is handed the member, not the group. Split into both, matching the derived articles. */
function igDamageTerms(): string[] {
  const out: string[] = [];
  for (const d of IG_DAMAGE_TYPE_DATA) {
    const m = d.name.match(/^([^(]+?)\s*\(([^)]+)\)$/);
    out.push(asDamageTerm((m ? m[1] : d.name).trim()));
    if (m) for (const member of m[2].split('/').map((s) => s.trim()).filter(Boolean)) {
      out.push(asDamageTerm(member));
    }
  }
  return out;
}

/** PF2 has no canonical damage-type list anywhere in the repo — `damage` on a spell is free text — so
 *  the demand is the set the derived module authored, each of which was confirmed to appear as a
 *  damage type in the repo's own PF2 content before it was written. See PF2_GLOSSARY_GAPS for the
 *  types deliberately left out. */
const PF2_DAMAGE_DEMAND = [
  'Bludgeoning', 'Piercing', 'Slashing', 'Acid', 'Cold', 'Electricity', 'Fire', 'Sonic',
  'Vitality', 'Void', 'Force', 'Mental', 'Poison', 'Bleed', 'Precision',
].map(asDamageTerm);

/** Every term a tooltip could ask for, for one system, read from that system's own content. */
export function glossaryDemandFor(system: GlossaryCoverageSystem): GlossaryDemand[] {
  const out: GlossaryDemand[] = [];
  const add = (kind: DemandKind, terms: readonly string[]) => {
    for (const term of terms) out.push({ kind, term });
  };

  if (system === 'pathfinder2e') {
    // The FULL 42-condition catalog, not the 25 in `systemConditions` — the sheet can display any
    // condition the catalog knows, and the shorter list is the builder's chip roster, not the ceiling.
    add('condition', PF2_CONDITIONS.map((c) => c.name));
    // Lore is PF2's open-ended 17th skill: written per character, so it is correctly absent from
    // PF2_SKILLS, but a sheet still prints the word and a tooltip still needs an article for it.
    add('skill', [...PF2_SKILLS.map((s) => s.name), 'Lore']);
    add('damage', PF2_DAMAGE_DEMAND);
  } else if (system === 'intuitive-games') {
    add('condition', IG_CONDITIONS.map((c) => c.name));
    // Bare stance names, because that is what a character sheet stores in `stance`. The articles are
    // titled "Offensive Stance" and carry the bare name as an alias, so the lookup resolves.
    add('stance', IG_STANCE_DEFS.map((s) => s.name));
    add('skill', systemSkills(system).map((s) => s.name));
    add('damage', igDamageTerms());
  } else {
    // Both 5e editions. Conditions, skills and damage types are identical between them — which is why
    // their articles live in dnd5e-shared.ts — but the demand is still computed PER EDITION rather than
    // once, so that an edition which diverges later is checked against its own content automatically.
    add('condition', systemConditions(system));
    add('skill', systemSkills(system).map((s) => s.name));
    add('damage', DAMAGE_TYPES.map((d) => asDamageTerm(d.term)));
  }
  return out;
}

/**
 * Does this system's glossary define an article for this term?
 *
 * EXACT term or EXACT alias only — `findTerm`'s prefix fallback is deliberately not used here. Prefix
 * matching is right for a human typing into a search box and wrong for a coverage check: it would
 * report "Prone" as covered by an article called "Pronouncement", and a coverage test that accepts a
 * near-miss is a coverage test that certifies empty tooltips.
 */
export function glossaryHasArticle(system: string, term: string): boolean {
  const q = term.trim().toLowerCase();
  if (!q) return false;
  return glossaryFor(system).some(
    (e) => e.term.trim().toLowerCase() === q || (e.aliases ?? []).some((a) => a.trim().toLowerCase() === q),
  );
}

export interface GlossaryCoverage {
  system: GlossaryCoverageSystem;
  demanded: number;
  covered: number;
  /** Every demanded term with no article. Empty is the only passing state. */
  missing: GlossaryDemand[];
  /** Per-category totals, so a regression names the category it broke. */
  byKind: Record<DemandKind, { demanded: number; covered: number }>;
}

/** Compute one system's coverage. Pure; safe to call from a test, a status page, or a script. */
export function glossaryCoverageFor(system: GlossaryCoverageSystem): GlossaryCoverage {
  const demand = glossaryDemandFor(system);
  const byKind = {} as Record<DemandKind, { demanded: number; covered: number }>;
  const missing: GlossaryDemand[] = [];
  for (const d of demand) {
    const slot = (byKind[d.kind] ??= { demanded: 0, covered: 0 });
    slot.demanded += 1;
    if (glossaryHasArticle(system, d.term)) slot.covered += 1;
    else missing.push(d);
  }
  return {
    system,
    demanded: demand.length,
    covered: demand.length - missing.length,
    missing,
    byKind,
  };
}

/** Written notes, kept beside the computed numbers. Each says what a reader is actually getting.
 *  Declared BEFORE the status object below, which reads it while the module is still initialising —
 *  a const declared after would be in its temporal dead zone and throw on import. */
const COVERAGE_NOTES: Record<GlossaryCoverageSystem, string> = {
  'dnd5e-2024': 'Conditions, all 18 skills and all 13 damage types resolve. Skill and damage articles are shared with 2014 because both editions define them identically — every term the editions genuinely changed stays in the per-edition file.',
  'dnd5e-2014': 'Conditions, all 18 skills and all 13 damage types resolve. Skill and damage articles are shared with 2024 because both editions define them identically — every term the editions genuinely changed stays in the per-edition file.',
  pathfinder2e: 'All 42 conditions, 16 skills plus Lore, and 15 damage types resolve. Seven skills have no catalogued skill actions and their articles say so; spirit/holy/unholy damage is not catalogued at all. See PF2_GLOSSARY_GAPS.',
  'intuitive-games': 'All 18 conditions, 10 stances, 36 skills and the damage types resolve. The skill articles are THIN by necessity: no per-skill IG rules text exists in the repo, so each states the governing ability, the check maths and the combat-skill resolution, then says plainly that the per-use breakdown is not published here. See IG_GLOSSARY_GAPS.',
};

export interface GlossaryCoverageStatus {
  /** Derived from the arrays, never hand-typed — a typed count is a lie the moment content changes. */
  demanded: number;
  covered: number;
  /** True only when EVERY demanded term resolves. No rounding up. */
  complete: boolean;
  /** What is thin about this system's coverage even when it is complete. Required when incomplete;
   *  present anyway where "complete" would otherwise overstate how much a reader is getting. */
  note?: string;
}

/**
 * Coverage as reported to anything that wants to state it honestly.
 *
 * `complete: true` here means exactly one thing: every term a tooltip can ask for resolves to an
 * article. It does NOT mean the articles are as rich as a rulebook — IG's skill articles in
 * particular are deliberately thin because the repo has no per-skill IG text to derive from, and the
 * `note` says so rather than letting a green tick imply otherwise.
 */
export const GLOSSARY_COVERAGE_STATUS: Record<GlossaryCoverageSystem, GlossaryCoverageStatus> =
  Object.fromEntries(
    GLOSSARY_COVERAGE_SYSTEMS.map((system) => {
      const c = glossaryCoverageFor(system);
      return [system, {
        demanded: c.demanded,
        covered: c.covered,
        complete: c.missing.length === 0,
        note: COVERAGE_NOTES[system],
      }];
    }),
  ) as Record<GlossaryCoverageSystem, GlossaryCoverageStatus>;


/**
 * Every gap this sweep chose to RECORD rather than fill by invention.
 *
 * The repo has repeatedly taken a reported gap over a plausible invention, because a fabricated rule
 * shown to a player as fact is far worse than an absence they can look up. Keeping the list next to
 * the data rather than in a planning doc means the next person to touch a glossary finds it.
 */
export const GLOSSARY_KNOWN_GAPS: string[] = [
  ...PF2_GLOSSARY_GAPS,
  ...IG_GLOSSARY_GAPS,
  '5e: the 18 skill articles are SRD 5.1 skill descriptions paraphrased to mechanical facts. Where the ' +
    'SRD gives no number for a use, none is stated — the DM sets the DC, and inventing a table of them ' +
    'would read as though the book had one.',
  '5e: skill and damage-type articles are shared between the 2014 and 2024 editions because both books ' +
    'define them identically. If a future edition changes one, it must MOVE to that edition\'s file — ' +
    'editing it in place would silently rewrite the other edition\'s rules.',
  '5e: the shared skill articles deliberately do NOT state how a grapple or shove resolves. It is a ' +
    'contested Athletics check in 2014 and a saving throw against an Unarmed Strike in 2024, so no ' +
    'single wording is true for both — the articles point at each edition\'s own Grappled entry ' +
    'instead of picking a winner.',
  'Coverage is checked for conditions, skills, damage types and stances only. Class features, feats, ' +
    'spells and species traits reach a tooltip through their own catalogs, not the glossary, and are ' +
    'covered by their own status objects rather than counted here.',
];

/** Is every system's tooltip coverage complete? For UI that wants to state it honestly. */
export function glossaryCoverageIsComplete(): boolean {
  return Object.values(GLOSSARY_COVERAGE_STATUS).every((s) => s.complete);
}
