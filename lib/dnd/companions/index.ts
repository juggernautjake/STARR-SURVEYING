// lib/dnd/companions/index.ts — one place that answers "which companion rules does this system have?"
//
// Three callers need that answer: AI grounding, the rules/browse store projection, and the term index.
// Each had (or was about to grow) its own `if (system === …)` chain. Two copies of a dispatch is how the
// PF2 level walker ended up type-checking against a stale hand-copy of the plan shape — the copy stops
// agreeing the first time the original changes, and it fails silently.
import { COMPANION_RULE_SETS, type CompanionRuleSet, type CompanionKind } from './dnd5e-2024';
import { COMPANION_RULE_SETS_2014 } from './dnd5e-2014';
import { PF2_COMPANION_RULE_SETS } from './pathfinder2e';

export type { CompanionRuleSet, CompanionKind };

/**
 * The companion rule sets a system has, or `[]`.
 *
 * NEVER falls back to another system's. Answering a Pathfinder question with 5e's familiar rules, or a
 * 2014 one with 2024's, is worse than answering nothing — the caller can say "not catalogued", but it
 * cannot un-say a confident wrong rule. Intuitive Games has its own companion model in
 * `systems/intuitive-games/companions.ts` with a different shape, and is deliberately not adapted here.
 */
export function companionSetsFor(system: string): CompanionRuleSet[] {
  switch (system) {
    case 'dnd5e-2024': return COMPANION_RULE_SETS;
    case 'dnd5e-2014': return COMPANION_RULE_SETS_2014;
    case 'pathfinder2e': return PF2_COMPANION_RULE_SETS;
    default: return [];
  }
}

/** The companion options a class can access within a system. Unknown class or system ⇒ []. */
export function companionsForClass(system: string, cls: string): CompanionRuleSet[] {
  const n = cls.trim().toLowerCase();
  if (!n) return [];
  return companionSetsFor(system).filter((r) => r.classes.some((c) => c.toLowerCase() === n));
}
