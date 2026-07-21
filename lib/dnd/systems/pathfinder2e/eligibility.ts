// lib/dnd/systems/pathfinder2e/eligibility.ts — can THIS PF2 character take THIS feat or spell?
//
// PF2 buildout S2, and the piece that makes the rest enforceable. The Area MV audit found PF2 had
// "nothing to gate": no feat carried a level, and no edit op could add content. Feat levels arrive
// with `PF2FeatFull` (S1); this turns them into a decision.
//
// PF2's schedule is STRICT and entirely unlike 5e's. A 5e character gets a feat at a handful of ASI
// levels and the class list is the only other constraint. A PF2 character gets four separate feat
// tracks on four different schedules, and a feat's level is a hard floor on all of them. That is
// why a level comparison is not enough and this file exists.
//
// FAILS CLOSED on a missing class, like the 5e core and unlike the IG one — a PF2 class list IS
// complete, so absence means bad input rather than absent data. (IG's parent classes genuinely
// carry no power list, which is why that core fails open. The asymmetry is deliberate; see
// systems/intuitive-games/eligibility.ts.)
import type { PF2FeatFull, PF2SpellFull, PF2Prereq, PF2FeatTrack } from './defs';
import type { PF2AttributeKey } from './model';
import { pf2Class } from './content';
import { pf2SpellSlots } from './rules';

export interface PF2EligibilityContext {
  className: string;
  ancestry?: string;
  level: number;
  /** Attribute scores, for attribute prerequisites. */
  attributes?: Partial<Record<PF2AttributeKey, number>>;
  /** Skill proficiency ranks by skill name, for skill prerequisites. */
  skills?: Record<string, 'untrained' | 'trained' | 'expert' | 'master' | 'legendary'>;
  /** Feat names already held — blocks retaking a non-repeatable feat, and satisfies feat prereqs. */
  featNames?: string[];
  /** The character's spell tradition, when they cast. */
  tradition?: string;
  /** Override for the highest spell rank the character can cast, when the sheet knows better than
   *  the class table (a multiclass archetype, or a DM adjustment). */
  maxSpellRank?: number;
}

export interface PF2Eligibility {
  ok: boolean;
  reason?: string;
}

const norm = (s: unknown) => String(s ?? '').trim().toLowerCase();

const RANK_ORDER = ['untrained', 'trained', 'expert', 'master', 'legendary'] as const;
const rankAtLeast = (have: string | undefined, need: string) =>
  RANK_ORDER.indexOf((have ?? 'untrained') as typeof RANK_ORDER[number]) >= RANK_ORDER.indexOf(need as typeof RANK_ORDER[number]);

// ── The feat-slot schedule ────────────────────────────────────────────────────────────────────

/** The levels at which each track grants a feat.
 *
 *  Class feats vary BY CLASS — most get them at even levels, but a few (Alchemist, Fighter) differ
 *  at level 1 — so the class table is consulted first and this is the fallback. Ancestry, skill and
 *  general schedules are uniform across classes. */
const ANCESTRY_FEAT_LEVELS = [1, 5, 9, 13, 17];
const SKILL_FEAT_LEVELS = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20];
const GENERAL_FEAT_LEVELS = [3, 7, 11, 15, 19];
const CLASS_FEAT_LEVELS_DEFAULT = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20];

/** Which levels grant a feat on this track, up to and including `throughLevel`. */
export function pf2FeatLevelsFor(track: PF2FeatTrack, throughLevel: number, classFeatLevels?: number[]): number[] {
  const table =
    track === 'ancestry' ? ANCESTRY_FEAT_LEVELS
      : track === 'skill' ? SKILL_FEAT_LEVELS
        : track === 'general' ? GENERAL_FEAT_LEVELS
          // Archetype feats are taken WITH class-feat slots, so they follow the class schedule.
          : (classFeatLevels ?? CLASS_FEAT_LEVELS_DEFAULT);
  return table.filter((l) => l <= throughLevel);
}

/** How many feats of each track a character of this level is owed. Used by the builder to show
 *  "2 of 3 class feats chosen" — it is a budget, not a gate, and is deliberately NOT enforced as a
 *  hard cap here: a DM grant or an archetype can legitimately add feats beyond the schedule. */
export function pf2FeatBudget(level: number, classFeatLevels?: number[]): Record<PF2FeatTrack, number> {
  return {
    ancestry: pf2FeatLevelsFor('ancestry', level).length,
    skill: pf2FeatLevelsFor('skill', level).length,
    general: pf2FeatLevelsFor('general', level).length,
    class: pf2FeatLevelsFor('class', level, classFeatLevels).length,
    archetype: pf2FeatLevelsFor('class', level, classFeatLevels).length,
  };
}

// ── Prerequisites ─────────────────────────────────────────────────────────────────────────────

/** Check one structured prerequisite. Anything unstructured lives in `prereqText` and is never
 *  enforced — refusing on unparsed English would block legal choices, which is the worse failure. */
function prereqHolds(p: PF2Prereq, ctx: PF2EligibilityContext): { ok: boolean; reason?: string } {
  switch (p.kind) {
    case 'level':
      return ctx.level >= p.value ? { ok: true } : { ok: false, reason: `requires level ${p.value}` };
    case 'attribute': {
      const have = ctx.attributes?.[p.attribute];
      // Unknown scores must not refuse: a sheet mid-build has none set yet.
      if (have == null) return { ok: true };
      return have >= p.value ? { ok: true } : { ok: false, reason: `requires ${p.attribute} ${p.value}` };
    }
    case 'skill': {
      if (!ctx.skills) return { ok: true }; // nothing to judge against
      return rankAtLeast(ctx.skills[p.skill], p.rank)
        ? { ok: true }
        : { ok: false, reason: `requires ${p.rank} in ${p.skill}` };
    }
    case 'feat':
      return (ctx.featNames ?? []).some((f) => norm(f) === norm(p.name))
        ? { ok: true }
        : { ok: false, reason: `requires the ${p.name} feat` };
    case 'class':
      return norm(ctx.className) === norm(p.name) ? { ok: true } : { ok: false, reason: `is a ${p.name} feat` };
    case 'ancestry':
      return norm(ctx.ancestry) === norm(p.name) ? { ok: true } : { ok: false, reason: `is a ${p.name} feat` };
  }
}

// ── Feats ─────────────────────────────────────────────────────────────────────────────────────

/** May this character take this feat? */
export function pf2FeatEligibility(feat: PF2FeatFull, ctx: PF2EligibilityContext): PF2Eligibility {
  // 1. Level floor — the check PF2 could not make before feats carried a level.
  if (ctx.level < feat.level) {
    return { ok: false, reason: `${feat.name} is a level-${feat.level} feat; this character is level ${ctx.level}.` };
  }

  // 2. Class scoping. A class feat belongs to its class and nobody else's.
  if (feat.track === 'class' && feat.className) {
    if (!ctx.className) return { ok: false, reason: `${feat.name} is a ${feat.className} feat, and no class is set.` };
    if (norm(feat.className) !== norm(ctx.className)) {
      return { ok: false, reason: `${feat.name} is a ${feat.className} feat, not a ${ctx.className} one.` };
    }
  }

  // 3. Ancestry scoping.
  if (feat.track === 'ancestry' && feat.ancestry && ctx.ancestry && norm(feat.ancestry) !== norm(ctx.ancestry)) {
    return { ok: false, reason: `${feat.name} is a ${feat.ancestry} feat, not a ${ctx.ancestry} one.` };
  }

  // 4. Already taken, and not repeatable.
  if (!feat.repeatable && (ctx.featNames ?? []).some((f) => norm(f) === norm(feat.name))) {
    return { ok: false, reason: `${feat.name} is already taken and can't be taken again.` };
  }

  // 5. Archetype feats need their Dedication first — the rule that makes archetypes a commitment
  //    rather than a free pick.
  if (feat.track === 'archetype' && feat.archetype && !norm(feat.name).endsWith('dedication')) {
    const ded = `${feat.archetype} Dedication`;
    if (!(ctx.featNames ?? []).some((f) => norm(f) === norm(ded))) {
      return { ok: false, reason: `${feat.name} requires the ${ded} feat first.` };
    }
  }

  // 6. Structured prerequisites.
  for (const p of feat.prereqs ?? []) {
    const v = prereqHolds(p, ctx);
    if (!v.ok) return { ok: false, reason: `${feat.name} ${v.reason}.` };
  }

  return { ok: true };
}

// ── Spells ────────────────────────────────────────────────────────────────────────────────────

/** The highest spell rank this character can cast.
 *
 *  `pf2SpellSlots` takes only a LEVEL and returns the full-caster table, so it cannot be called
 *  blind — a Fighter would come back with rank-5 slots. The class definition decides first:
 *  no `spellcasting` block means no slots, full stop.
 *
 *  Ground Rule 3 applies to the gap here. Classes with REDUCED casting (Magus, Summoner) have
 *  their own smaller tables which are not modelled yet; when one appears without a declared
 *  `casterProgression`, this returns 0 rather than handing it a full caster's ceiling. A refused
 *  legal spell is visible and fixable; a silently over-generous ceiling is neither. */
export function pf2MaxSpellRank(className: string, level: number): number {
  const def = pf2Class(className);
  if (!def?.spellcasting) return 0;
  const slots = pf2SpellSlots(level);
  if (!Array.isArray(slots)) return 0;
  let max = 0;
  // Index 0 is cantrips known; ranked slots start at index 1.
  for (let rank = 1; rank < slots.length; rank++) if ((slots[rank] ?? 0) > 0) max = rank;
  return max;
}

/** May this character learn/prepare this spell? */
export function pf2SpellEligibility(spell: PF2SpellFull, ctx: PF2EligibilityContext): PF2Eligibility {
  // Focus spells come from a class or subclass feature, not a slot — judged on ownership, and
  // never on the slot ceiling (a level-1 character's focus cantrip is legal).
  if (spell.focus) {
    if (spell.focusClass && ctx.className && norm(spell.focusClass) !== norm(ctx.className)) {
      return { ok: false, reason: `${spell.name} is a ${spell.focusClass} focus spell, not a ${ctx.className} one.` };
    }
    return { ok: true };
  }

  // Tradition. A wizard casts arcane; handing them a primal spell is the PF2 equivalent of a
  // Wizard taking a Cleric spell.
  if (ctx.tradition && spell.traditions.length && !spell.traditions.some((t) => norm(t) === norm(ctx.tradition))) {
    return { ok: false, reason: `${spell.name} is not on the ${ctx.tradition} spell list.` };
  }

  if (spell.rank === 0) return { ok: true }; // cantrips are never slot-gated

  if (!ctx.className) return { ok: false, reason: `No class is set, so ${spell.name}'s rank can't be checked.` };

  const ceiling = ctx.maxSpellRank ?? pf2MaxSpellRank(ctx.className, ctx.level);
  if (ceiling <= 0) {
    return { ok: false, reason: `A ${ctx.className} at level ${ctx.level} has no spell slots.` };
  }
  if (spell.rank > ceiling) {
    return { ok: false, reason: `${spell.name} is rank ${spell.rank}; a ${ctx.className} at level ${ctx.level} can cast up to rank ${ceiling}.` };
  }
  return { ok: true };
}

/** Keep ineligible entries in the list WITH their reason, so a builder can grey them rather than
 *  hide them — same contract as the 5e core's `annotateEligibility`. */
export function annotatePF2Feats(pool: PF2FeatFull[], ctx: PF2EligibilityContext) {
  return pool.map((feat) => ({ feat, eligibility: pf2FeatEligibility(feat, ctx) }));
}

export function annotatePF2Spells(pool: PF2SpellFull[], ctx: PF2EligibilityContext) {
  return pool.map((spell) => ({ spell, eligibility: pf2SpellEligibility(spell, ctx) }));
}
