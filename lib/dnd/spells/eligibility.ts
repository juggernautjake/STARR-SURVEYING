// lib/dnd/spells/eligibility.ts — whether a character may legally take a spell.
//
// S1 of VANILLA_RULES_ENFORCEMENT_2026-07-20. Mirrors `feats/eligibility.ts`, which already does
// this job for feats: a pure decision plus a REASON, so a builder can block an illegal choice
// and still explain itself.
//
// The gap this closes: a level-4 vanilla Wizard could add Wish. The spell picker warned; nothing
// blocked. The library grant path and the AI `add_spell` op checked nothing at all.
//
// WHAT THIS DELIBERATELY DOES NOT DO. It answers "is this a legal pick for this character's own
// class progression". It does not try to know every way a spell can legitimately reach a sheet —
// a scroll, an item, a DM's gift, a subclass's expanded list. Those are handled by the CALLER
// choosing not to consult it (a DM grant) or by passing `extraSpells` (a subclass list). Trying
// to encode every exception here would make the core wrong in the other direction: blocking
// legal choices, which is worse than permissiveness because the player cannot work around it.

import type { SpellDef } from './index';
import { classesForSystem } from '../classes/registry';

export interface SpellContext {
  system: string;
  /** The character's class name, as shown on the sheet. */
  className: string;
  /** Total character level. */
  level: number;
  /** Spells the character may take BEYOND their class list — a subclass's expanded list, a
   *  feat's grant, a pact boon. Matched by name, case-insensitive. */
  extraSpells?: string[];
  /** Overrides the computed slot ceiling. Use when the sheet's own slot table is authoritative
   *  (a multiclass character, or one a DM has adjusted). */
  maxSpellLevel?: number;
}

export interface SpellEligibility {
  ok: boolean;
  reason?: string;
}

/** The highest spell level this class can cast at this character level, from the class's own
 *  slot table — never `level / 2`, because half-casters and pact casters progress differently
 *  and the arithmetic shortcut is wrong for both. */
export function maxSpellLevelFor(system: string, className: string, level: number): number {
  const cls = classesForSystem(system).find((c) => c.name.toLowerCase() === className.trim().toLowerCase());
  const sc = cls?.spellcasting;
  if (!sc) return 0;

  // Warlock: pact slots are a single rank that climbs on its own schedule.
  if (sc.pactRank?.length) {
    return Math.max(0, Number(sc.pactRank[Math.min(level, sc.pactRank.length - 1)]) || 0);
  }

  const row = sc.slots?.[Math.max(1, Math.min(20, level))];
  if (!row) return 0;
  // row is [_, r1..r9]; the highest index holding a non-zero count is the ceiling.
  let top = 0;
  for (let i = 1; i <= 9; i++) if ((Number(row[i]) || 0) > 0) top = i;
  return top;
}

/** Whether a class's spell list includes this spell. */
export function onClassList(spell: SpellDef, className: string): boolean {
  const want = className.trim().toLowerCase();
  return spell.classes.some((c) => c.toLowerCase() === want);
}

/** Is this a legal pick for this character, and if not, why?
 *
 *  Cantrips are never slot-gated — a caster who knows a cantrip can always cast it — but they ARE
 *  class-gated, so a Wizard still cannot take Sacred Flame. */
export function spellEligibility(spell: SpellDef, ctx: SpellContext): SpellEligibility {
  const cls = (ctx.className ?? '').trim();
  if (!cls) {
    return { ok: false, reason: 'This character has no class set, so there is no spell list to check against.' };
  }

  // An explicitly granted spell is legal regardless of list — that is what the grant means.
  const granted = (ctx.extraSpells ?? []).some((n) => n.trim().toLowerCase() === spell.name.trim().toLowerCase());

  if (!granted && !onClassList(spell, cls)) {
    return { ok: false, reason: `${spell.name} is not on the ${cls} spell list (it belongs to ${spell.classes.join(', ')}).` };
  }

  if (spell.level === 0) return { ok: true };

  const ceiling = ctx.maxSpellLevel ?? maxSpellLevelFor(ctx.system, cls, ctx.level);
  if (ceiling <= 0) {
    return { ok: false, reason: `A ${cls} has no spell slots at level ${ctx.level}.` };
  }
  if (spell.level > ceiling) {
    return {
      ok: false,
      reason: `${spell.name} is a level-${spell.level} spell; a ${cls} at character level ${ctx.level} can cast up to level ${ceiling}.`,
    };
  }

  return { ok: true };
}

/** Every spell in a pool this character may legally take. */
export function eligibleSpells(pool: SpellDef[], ctx: SpellContext): SpellDef[] {
  return pool.filter((s) => spellEligibility(s, ctx).ok);
}

/** Convenience for a builder: eligibility for each spell, keeping the ineligible ones so they can
 *  be shown greyed WITH their reason rather than silently vanishing from the list. */
export function annotateEligibility(
  pool: SpellDef[],
  ctx: SpellContext,
): { spell: SpellDef; eligibility: SpellEligibility }[] {
  return pool.map((spell) => ({ spell, eligibility: spellEligibility(spell, ctx) }));
}
