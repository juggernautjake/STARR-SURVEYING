// lib/dnd/systems/intuitive-games/rules-gate.ts — the IG rules gate (IG S2).
//
// The IG counterpart of lib/dnd/rules-gate.ts. IG edits never reach that one: the AI route's IG
// branch returns before the shared mechanics path, and even if it didn't, `findSpellForSystem`
// and `resolveFeat` are 2024-only, so the shared gate would no-op on IG content.
//
// Same contract as the 5e side, so the two systems can't drift into behaving differently:
//   · vanilla → REFUSED, with a reason
//   · custom  → allowed, marked
//   · DM      → allowed, marked as a grant
//
// Gates only what IG's content model honestly supports — powers and specializations. Stances are
// NOT gated (a level-1 trait may be taken as "a new stance", so holding one off your class list
// is legal play) and feats are NOT gated (their prerequisites are free English prose). See
// eligibility.ts for the full reasoning; those omissions are decisions, not gaps.
import type { IGCharacter } from './model';
import type { IGEdit } from './edit';
import { igPowerEligibility, igSpecializationEligibility, type IGEligibilityContext } from './eligibility';

export interface IGGateContext {
  /** Do the character's rules BIND? False for a DM and for a custom character. */
  enforce: boolean;
  unboundReason?: 'dm-grant' | 'custom-character';
}

export interface IGGateResult {
  /** The edit to apply, or null when it was refused. */
  edit: IGEdit | null;
  /** Why it was refused, for reporting back — a silent refusal reads as the AI ignoring you. */
  refusal?: string;
  /** Why it was off-rules but allowed, for marking. */
  offRules?: string;
}

/** The eligibility context for a character, read from the sheet itself. */
export function igContextFor(ig: IGCharacter): IGEligibilityContext {
  return {
    className: ig.identity?.className ?? '',
    subclass: ig.identity?.subclass ?? '',
    level: ig.identity?.level ?? 1,
    // Stored singular on the sheet; the core takes a list because a character gains a greater
    // specialization at level 8.
    specializations: [ig.identity?.specialization ?? ''].filter(Boolean),
    knownPowers: ig.powers ?? [],
  };
}

/** Check one IG edit against the character's rules. */
export function gateIgEdit(ig: IGCharacter, edit: IGEdit, ctx: IGGateContext): IGGateResult {
  // Only content-ADDING ops can be off-rules. Damage, healing, conditions and stance changes are
  // play, not character construction, and gating them would break the sheet mid-combat.
  if (edit.op !== 'add_power') return { edit };

  const elig = igPowerEligibility(edit.name, igContextFor(ig));
  if (elig.ok) return { edit };

  if (ctx.enforce) {
    return { edit: null, refusal: `${edit.name}: ${elig.reason} This is a vanilla character — build a custom one, or have the DM grant it.` };
  }
  return {
    edit,
    offRules: ctx.unboundReason === 'dm-grant' ? `granted by the DM — ${elig.reason}` : elig.reason,
  };
}

/** Record on the character WHY a held element was outside its class and level (IG S3).
 *
 *  Pure and immutable, like every other IG edit. An empty reason CLEARS the entry rather than
 *  storing a blank, so a marker can't linger as a truthy-but-meaningless flag after the content
 *  that earned it becomes legal (a level-up can do exactly that). */
export function markIgOffRules(ig: IGCharacter, name: string, reason?: string): IGCharacter {
  const key = name.trim();
  if (!key) return ig;
  const next = { ...(ig.offRules ?? {}) };
  if (reason && reason.trim()) next[key] = reason.trim();
  else delete next[key];
  if (Object.keys(next).length === 0) {
    // Drop the field entirely when empty, so an ordinary character's stored data is unchanged by
    // this feature existing.
    const { offRules: _drop, ...rest } = ig;
    return rest as IGCharacter;
  }
  return { ...ig, offRules: next };
}

/** Check the picks a build is about to assemble.
 *
 *  The build route already flags custom content and defers to the vanilla-only CAMPAIGN gate at
 *  submission. That gate answers a different question: `igIsVanilla` is name-in-catalog only, so
 *  "Entangle on an Arcanist" classifies as vanilla book content and passes submission untouched.
 *  It asks *is this from the book*; this asks *may this character have it* — the same distinction
 *  drawn for `provenance.ts` on the 5e side. Both are needed; neither substitutes for the other. */
export function gateIgPicks(
  picks: { className?: string; subclass?: string; level?: number; specialization?: string; powers?: string[] },
  ctx: IGGateContext,
): { refused: { name: string; reason: string }[]; offRules: Record<string, string> } {
  const refused: { name: string; reason: string }[] = [];
  const offRules: Record<string, string> = {};

  const eligCtx: IGEligibilityContext = {
    className: picks.className ?? '',
    subclass: picks.subclass ?? '',
    level: picks.level ?? 1,
    specializations: [picks.specialization ?? ''].filter(Boolean),
    // Deliberately NOT seeded with picks.powers: every power in this build is under review, so
    // treating them as already-known would make the whole set vacuously legal.
    knownPowers: [],
  };

  for (const power of picks.powers ?? []) {
    const elig = igPowerEligibility(power, eligCtx);
    if (elig.ok) continue;
    if (ctx.enforce) refused.push({ name: power, reason: elig.reason ?? 'not available to this character' });
    else offRules[power] = ctx.unboundReason === 'dm-grant' ? `granted by the DM — ${elig.reason}` : (elig.reason ?? '');
  }

  if (picks.specialization) {
    const elig = igSpecializationEligibility(picks.specialization, eligCtx);
    if (!elig.ok) {
      if (ctx.enforce) refused.push({ name: picks.specialization, reason: elig.reason ?? 'not available to this character' });
      else offRules[picks.specialization] = ctx.unboundReason === 'dm-grant' ? `granted by the DM — ${elig.reason}` : (elig.reason ?? '');
    }
  }

  return { refused, offRules };
}

/** Check a specialization the builder or an edit is about to set. Separate from `gateIgEdit`
 *  because specialization is an identity field, not an `IGEdit` op. */
export function gateIgSpecialization(ig: IGCharacter, spec: string, ctx: IGGateContext): IGGateResult {
  const elig = igSpecializationEligibility(spec, igContextFor(ig));
  if (elig.ok) return { edit: null };
  if (ctx.enforce) return { edit: null, refusal: `${spec}: ${elig.reason}` };
  return {
    edit: null,
    offRules: ctx.unboundReason === 'dm-grant' ? `granted by the DM — ${elig.reason}` : elig.reason,
  };
}
