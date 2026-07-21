// lib/dnd/systems/pathfinder2e/rules-gate.ts — the PF2 rules gate (PF2 buildout S13).
//
// Completes Area MV across all three systems. The original audit found PF2 had "nothing to gate",
// which was true for two reasons that S1/S2/S13 have now removed: no feat carried a level, and no
// edit op could add content at all. Both exist now, so the door exists — and a door needs a lock.
//
// Same contract as `lib/dnd/rules-gate.ts` (5e) and `intuitive-games/rules-gate.ts`, deliberately,
// so three systems cannot drift into three different ideas of what "vanilla" means:
//   · vanilla → REFUSED, with a reason
//   · custom  → allowed, marked
//   · DM      → allowed, marked as a grant
import type { PF2Character } from './model';
import type { PF2Edit } from './edit';
import { pf2FeatEligibility, pf2SpellEligibility, type PF2EligibilityContext } from './eligibility';
import type { PF2FeatFull, PF2SpellFull } from './defs';

export interface PF2GateContext {
  /** Do the character's rules BIND? False for a DM and for a custom character. */
  enforce: boolean;
  unboundReason?: 'dm-grant' | 'custom-character';
}

export interface PF2GateResult {
  /** The edit to apply, or null when it was refused. */
  edit: PF2Edit | null;
  refusal?: string;
  offRules?: string;
}

/** Build the eligibility context from the character sheet itself — never from the request. */
export function pf2ContextFor(pf2: PF2Character): PF2EligibilityContext {
  const skills: Record<string, 'untrained' | 'trained' | 'expert' | 'master' | 'legendary'> = {};
  for (const s of pf2.skills ?? []) skills[s.name] = s.rank;
  return {
    className: pf2.identity?.className ?? '',
    ancestry: pf2.identity?.ancestry ?? '',
    level: pf2.identity?.level ?? 1,
    attributes: pf2.attributes ?? {},
    skills,
    featNames: (pf2.feats ?? []).map((f) => f.name),
    ...(pf2.spellcasting?.tradition && pf2.spellcasting.tradition !== 'none'
      ? { tradition: pf2.spellcasting.tradition }
      : {}),
  };
}

/** Check one PF2 edit against the character's rules.
 *
 *  Only content-ADDING ops are gated. Damage, healing, conditions and the death track are PLAY, not
 *  character construction — refusing them would break the sheet mid-combat, a far worse failure
 *  than an off-list feat. Same boundary as the IG gate. */
export function gatePf2Edit(
  pf2: PF2Character,
  edit: PF2Edit,
  ctx: PF2GateContext,
  catalog?: { feats?: PF2FeatFull[]; spells?: PF2SpellFull[] },
): PF2GateResult {
  // Only ACQUISITION is gated. `update_spell`/`update_feat` retune something the character already
  // legitimately holds, which is a customisation rather than a fresh acquisition — re-gating it
  // would mean a level-4 wizard who was legitimately granted a rank-5 spell could never edit its
  // text afterwards, and would see the grant refused back at them (S15).
  if (edit.op !== 'add_feat' && edit.op !== 'add_spell') return { edit };

  const eligCtx = pf2ContextFor(pf2);
  const mark = (reason?: string) =>
    ctx.unboundReason === 'dm-grant' ? `granted by the DM — ${reason}` : reason;

  if (edit.op === 'add_feat') {
    // Judged against the CATALOG entry, not the edit's own claimed level — otherwise a model could
    // declare a level-20 feat to be level 1 and walk straight through the gate. A feat the catalog
    // does not know is homebrew: it makes no claim to be official content, and refusing it would
    // block authoring something new rather than the exploit being closed.
    const def = (catalog?.feats ?? []).find((f) => f.name.toLowerCase() === edit.name.trim().toLowerCase());
    if (!def) return { edit };

    const elig = pf2FeatEligibility(def, eligCtx);
    if (elig.ok) return { edit };
    if (ctx.enforce) {
      return {
        edit: null,
        refusal: `${elig.reason} This is a vanilla character — build a custom one, or have the DM grant it.`,
      };
    }
    return { edit: { ...edit, offRules: mark(elig.reason) }, offRules: mark(elig.reason) };
  }

  // add_spell
  const def = (catalog?.spells ?? []).find((s) => s.name.toLowerCase() === edit.name.trim().toLowerCase());
  if (!def) return { edit };

  const elig = pf2SpellEligibility(def, eligCtx);
  if (elig.ok) return { edit };
  if (ctx.enforce) {
    return {
      edit: null,
      refusal: `${elig.reason} This is a vanilla character — build a custom one, or have the DM grant it.`,
    };
  }
  return { edit: { ...edit, offRules: mark(elig.reason) }, offRules: mark(elig.reason) };
}

/** Check the feats and spells a BUILD is about to assemble (S16).
 *
 *  The build path needs its own entry point because picks arrive as bare names before any character
 *  exists to judge them against — the eligibility context is assembled from the picks themselves
 *  rather than read off a saved sheet. */
export function gatePf2Picks(
  picks: { className?: string; ancestry?: string; level?: number; feats?: string[]; spells?: string[] },
  ctx: PF2GateContext,
  catalog: { feats?: PF2FeatFull[]; spells?: PF2SpellFull[] },
  tradition?: string,
): { refused: { name: string; reason: string }[]; offRules: Record<string, string> } {
  const refused: { name: string; reason: string }[] = [];
  const offRules: Record<string, string> = {};

  const eligCtx: PF2EligibilityContext = {
    className: picks.className ?? '',
    ancestry: picks.ancestry ?? '',
    level: picks.level ?? 1,
    // Deliberately NOT seeded with picks.feats: every feat in this build is under review, so
    // treating them as already-held would let them satisfy each other's prerequisites and make the
    // whole set vacuously legal. Same reasoning as the IG build gate.
    featNames: [],
    ...(tradition ? { tradition } : {}),
  };

  const mark = (reason?: string) =>
    ctx.unboundReason === 'dm-grant' ? `granted by the DM — ${reason}` : (reason ?? '');

  for (const name of picks.feats ?? []) {
    // Homebrew (not in the catalog) is skipped: it never claimed to be official content, so
    // refusing it would block authoring rather than close a hole.
    const def = (catalog.feats ?? []).find((f) => f.name.toLowerCase() === name.trim().toLowerCase());
    if (!def) continue;
    const elig = pf2FeatEligibility(def, eligCtx);
    if (elig.ok) continue;
    if (ctx.enforce) refused.push({ name: def.name, reason: elig.reason ?? 'not available to this character' });
    else offRules[def.name] = mark(elig.reason);
  }

  for (const name of picks.spells ?? []) {
    const def = (catalog.spells ?? []).find((s) => s.name.toLowerCase() === name.trim().toLowerCase());
    if (!def) continue;
    const elig = pf2SpellEligibility(def, eligCtx);
    if (elig.ok) continue;
    if (ctx.enforce) refused.push({ name: def.name, reason: elig.reason ?? 'not available to this character' });
    else offRules[def.name] = mark(elig.reason);
  }

  return { refused, offRules };
}
