// lib/dnd/rules-gate.ts — the rules gate for edits that arrive from OUTSIDE a builder (Area MV).
//
// The pickers enforce eligibility in the picker. That is necessary and not sufficient: an edit can
// reach a sheet without passing through any picker at all — the AI's `add_spell` op and the
// library grant route both write the same vocabulary. Enforcing only in the UI means going around
// the UI goes around the rules, which is how a level-4 vanilla Wizard ended up able to hold Wish.
//
// So this filters a validated SheetEdit[] against the character's OWN class and level, refusing
// what a vanilla character may not have. Pure — the routes stay thin and the decision is testable
// without a database or a model call.
//
// WHAT IT DOES NOT DO. It refuses; it never rewrites an edit into something legal. Silently
// downgrading "add Wish" to "add Magic Missile" would be worse than either allowing or refusing
// it, because the player would be told they got something they did not get.
import type { SheetEdit } from './sheet-edits';
import { spellEligibility } from './spells/eligibility';
import { findSpellForSystem } from './spells';

export interface RulesGateContext {
  /** The character's game system. */
  system: string;
  /** Do the rules BIND? False for a DM (granting off-curve content is their job) and for a custom
   *  character (the escape hatch). When false, nothing is refused — edits are only MARKED. */
  enforce: boolean;
  /** Recorded on anything off-rules that is allowed through, so it is never indistinguishable
   *  from a normal class pick. */
  unboundReason?: 'dm-grant' | 'custom-character';
  className: string;
  level: number;
  /** Spells already on the sheet — a subclass list or an earlier grant must not read as illegal
   *  the second time it is looked at. */
  knownSpells: string[];
  /** The character's real highest slot, when it differs from what the class alone would give. */
  maxSpellLevel?: number;
}

export interface RulesGateResult {
  /** The edits that may proceed — refused ones removed, allowed-but-off-rules ones marked. */
  edits: SheetEdit[];
  /** What was refused and why, for reporting back. A refusal the user is not told about reads as
   *  the AI ignoring them. */
  refused: { name: string; reason: string }[];
}

/** Filter a batch of edits against the character's rules.
 *
 *  Only `add_spell` is gated today — it is the op the reported bug travelled through, and the one
 *  with a real eligibility core behind it. Feats arrive as `add_feature`, which carries no feat
 *  key and so cannot be reliably resolved back to a catalog feat here; that gap is real and is
 *  recorded in the planning doc rather than papered over with name-matching that would refuse
 *  legitimate homebrew features. */
export function gateEdits(edits: SheetEdit[], ctx: RulesGateContext): RulesGateResult {
  const refused: { name: string; reason: string }[] = [];
  const out: SheetEdit[] = [];

  for (const e of edits) {
    if (e.op !== 'add_spell') { out.push(e); continue; }

    // Judged against the CATALOG entry, not the AI's own description of the spell — otherwise a
    // model could declare Wish to be a level-1 Wizard spell and walk straight through the gate.
    // A spell that isn't in the catalog is homebrew and passes: refusing it would block the
    // legitimate case of authoring something new, and it carries no claim to be official.
    const def = findSpellForSystem(ctx.system, e.name);
    if (!def) { out.push(e); continue; }

    const elig = spellEligibility(def, {
      system: ctx.system,
      className: ctx.className,
      level: ctx.level,
      extraSpells: ctx.knownSpells,
      ...(ctx.maxSpellLevel != null ? { maxSpellLevel: ctx.maxSpellLevel } : {}),
    });

    if (elig.ok) { out.push(e); continue; }

    if (ctx.enforce) {
      refused.push({ name: def.name, reason: elig.reason ?? 'not available to this character' });
      continue;
    }

    out.push({
      ...e,
      offRules: ctx.unboundReason === 'dm-grant' ? `granted by the DM — ${elig.reason}` : elig.reason,
    });
  }

  return { edits: out, refused };
}

/** One line explaining what the gate refused, for the summary shown to the user. */
export function refusalSummary(refused: { name: string; reason: string }[]): string | null {
  if (!refused.length) return null;
  return `⚠ Not added — this is a vanilla character, so it can only take what its class and level grant: ${
    refused.map((r) => `${r.name} (${r.reason})`).join('; ')
  }. Build a custom character, or have the DM grant it.`;
}
