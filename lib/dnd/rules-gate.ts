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
import { type SheetEdit } from './sheet-edits';
import { spellEligibility } from './spells/eligibility';
import { findSpellForSystem } from './spells';
import { featEligibilityForSystem } from './feats/eligibility';
import type { AbilityKey } from '@/app/dnd/_sheet/rules/dnd';

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
  /** Ability scores, for feat prerequisites (Grappler wants Strength 13). */
  abilities?: Partial<Record<AbilityKey, number>>;
  /** Feature names already on the sheet — resolved to feat keys so a non-repeatable feat can't be
   *  taken twice. */
  featureNames?: string[];
  /** Whether the character casts spells, for feats that require it. */
  hasSpellcasting?: boolean;
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
 *  Gates `add_spell` and `add_feat` — the two ops that name catalog content and therefore CAN be
 *  checked. `add_feature` stays deliberately ungated: it is free-form prose, so "the Grappler
 *  feat" and "a homebrew feature called Grappler" are indistinguishable once written, and
 *  name-matching would refuse legitimate homebrew. That is why `add_feat` exists (S7). */
export function gateEdits(edits: SheetEdit[], ctx: RulesGateContext): RulesGateResult {
  const refused: { name: string; reason: string }[] = [];
  const out: SheetEdit[] = [];

  for (const e of edits) {
    if (e.op === 'add_feat') {
      // Gateable precisely BECAUSE the op names a catalog feat (S7). `add_feature` deliberately
      // stays ungated: it is free-form prose, and name-matching it against the catalog would
      // refuse legitimate homebrew that happens to share a name.
      // SCOPED TO THE CHARACTER'S SYSTEM. This resolved against FEATS_2024 for every system until
      // 2026-07-21, and the eligibility check below is 2024-shaped by construction — it asks about
      // an `asi` slot, which is a 2024 structure that neither Pathfinder 2e nor Intuitive Games
      // has, and which 2014 reaches by a different route entirely.
      //
      // The concrete harm: Alert, Lucky, Great Weapon Fighting and Two-Weapon Fighting all exist
      // in BOTH 2024 and Intuitive Games. A vanilla IG character asking for Alert resolved the 5e
      // feat — an ORIGIN feat, against a slot defaulting to `asi` — and was REFUSED a feat its own
      // game grants freely. Non-5e systems fall through ungated here — which is correct, not a
      // hole: PF2 and IG each have their own gate (`systems/*/rules-gate.ts`) that knows their
      // rules, and this one judging them was the bug.
      //
      // 14-S6b: resolution AND judgement now happen inside `featEligibilityForSystem`, which keys
      // BOTH off the character's system. Doing them separately here was what left 2014 half-wired
      // — the resolve was scoped while the judgement was 2024-shaped by construction, so a 2014
      // character was about to be held to 2024's origin/fighting-style/ASI-tier tracks. 2014's
      // actual rule (a feat replaces an ASI, at the levels its class grants one) needs the class
      // name and the level, which is why both are passed rather than just the level.
      const v = featEligibilityForSystem(ctx.system, e.feat, {
        slot: e.slot ?? 'asi',
        level: ctx.level,
        className: ctx.className,
        ...(ctx.abilities ? { abilities: ctx.abilities } : {}),
        // Names, not keys: each system's gate resolves them against its own catalog, so this call
        // site never has to know which catalog is in play.
        takenFeatureNames: ctx.featureNames ?? [],
        has: ctx.hasSpellcasting ? ['spellcasting'] : [],
      });

      if (v.ok) { out.push(e); continue; }
      // The catalogued name when it resolved, the raw ref when it did not — a refusal naming a
      // string the player never typed reads as the machine talking to itself.
      const shown = v.name ?? e.feat;
      if (ctx.enforce) {
        refused.push({ name: shown, reason: v.reason ?? 'not available to this character' });
        continue;
      }
      out.push({
        ...e,
        offRules: ctx.unboundReason === 'dm-grant' ? `granted by the DM — ${v.reason}` : v.reason,
      });
      continue;
    }

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
