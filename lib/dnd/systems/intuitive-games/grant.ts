// lib/dnd/systems/intuitive-games/grant.ts — giving a library entry to an Intuitive Games character.
//
// WHY THIS EXISTS (CX-13). The library's "give to a character" button resolved every IG section —
// powers, defensive powers, feats, stances — to the shared grant kind `feature`, which
// `buildGrantEdits` delivers as an `add_feature` op against the 5e-shaped `Character` blob. An IG
// character's real model is the SIDECAR at `data.ig`, edited through `applyIgEdit` and judged by
// `gateIgEdit`. So a granted IG power landed somewhere the IG sheet does not read, was never seen
// by IG's gate, and was never marked with its provenance. Three problems in one write:
//
//   1. WRONG MODEL — the power was not in `ig.powers`, so the IG sheet's power list, its digest,
//      its AI grounding and its provenance badges all continued to say the character did not have
//      it. (It was not invisible: the shared sheet renders below the IG sheet, so the feature DID
//      appear there. It appeared as a 5e feature on a sheet that is not the character's, which is a
//      different failure from disappearing, and arguably a worse one — it looks like it worked.)
//   2. UNGATED — `buildGrantEdits`' `feature` arm checks nothing at all. Every rule IG-S1/S2 built
//      lives in `gateIgEdit`, which this path never called, so the library was a way to put an
//      off-list power on a VANILLA character that the sheet's own picker would have refused.
//   3. UNMARKED — a DM grant is legitimately unbound but must land MARKED (`offRules`, rendered as
//      ⚑ beside the power). Nothing marked it.
//
// The fix is not to teach `library-grant.ts` about IG — that would widen a 5e-shaped module into a
// second system (Ground Rule 1: a per-system dispatcher, never a widened module). It is to give IG
// grants their own kinds and route them through IG's OWN edit path, so the grant is applied,
// gated and marked by exactly the code the sheet and the AI already use. There is then only one
// place that decides what an IG character may hold, which is the only way two paths cannot drift.
import type { IGCharacter } from './model';
import type { IGEdit } from './edit';

/** The grant kinds that deliver into the IG sidecar.
 *
 *  Namespaced (`ig-…`) rather than reusing `feature`, because the four IG sections land in four
 *  DIFFERENT fields of the model — powers, the single defensive-power slot, the feat buckets, the
 *  known-stance set. One shared kind cannot say which, which is precisely how all four ended up
 *  collapsed into `add_feature`. */
export type IGGrantKind = 'ig-power' | 'ig-defensive-power' | 'ig-feat' | 'ig-stance';

export const IG_GRANT_KINDS: readonly IGGrantKind[] = ['ig-power', 'ig-defensive-power', 'ig-feat', 'ig-stance'];

export function isIGGrantKind(kind: unknown): kind is IGGrantKind {
  return typeof kind === 'string' && (IG_GRANT_KINDS as readonly string[]).includes(kind);
}

/** How each kind reads in a message to the player. */
const KIND_NOUN: Record<IGGrantKind, string> = {
  'ig-power': 'power',
  'ig-defensive-power': 'defensive power',
  'ig-feat': 'feat',
  'ig-stance': 'stance',
};

export function igGrantNoun(kind: IGGrantKind): string {
  return KIND_NOUN[kind];
}

/**
 * The IG edit that delivers this grant, or null when the kind is not IG's to hold.
 *
 * `condition` is included and is NOT an `ig-…` kind, because a condition is grantable to every
 * system and the library offers it from one shared section. Routing it here when the TARGET is an
 * IG character is the same bug as the powers one and matters mechanically rather than cosmetically:
 * `igResolveAttackInPlay` reads `ig.combat.conditions`, so a condition written to the shared blob
 * is a penalty the character visibly has and their rolls never pay.
 *
 * Everything else 5e-shaped (items, weapons, armour, spells, glossary features) is deliberately
 * left to `buildGrantEdits`. IG has no free-form feature list to hold a glossary article, and its
 * equipment is named slots rather than an inventory, so there is no faithful landing spot — and the
 * shared sheet that renders below the IG sheet is a real, if imperfect, place for them to live.
 */
export function igGrantEdit(kind: string, name: string): IGEdit | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  switch (kind) {
    case 'ig-power': return { op: 'add_power', name: trimmed };
    // One defensive power (a reaction), so a grant SETS the slot. The summary names what it
    // displaced — a grant that silently overwrites a choice the player made would otherwise be
    // indistinguishable from one that added to it.
    case 'ig-defensive-power': return { op: 'set_defensive_power', name: trimmed };
    case 'ig-feat': return { op: 'add_feat', name: trimmed };
    // `add_stance`, not `set_active_stance`: being GIVEN a stance teaches it, and dropping the
    // character into it would change their combat posture from a library page.
    case 'ig-stance': return { op: 'add_stance', name: trimmed };
    case 'condition': return { op: 'add_condition', name: trimmed };
    default: return null;
  }
}

/**
 * What the grant did, in one sentence, read against the character AS IT WAS.
 *
 * Takes the BEFORE state on purpose: the two facts worth reporting — that the character already had
 * this, and what a defensive power replaced — are both unrecoverable once the edit has been applied.
 */
export function describeIgGrant(edit: IGEdit, before: IGCharacter, offRules?: string): string {
  const eq = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  // The gate's reasons are whole sentences and already end in a full stop, so the trailing period
  // is trimmed rather than doubled ("…not a Arcanist power..").
  const mark = offRules ? ` — off-rules: ${offRules.replace(/\.\s*$/, '')}` : '';
  switch (edit.op) {
    case 'add_power':
      return before.powers.some((p) => eq(p, edit.name))
        ? `${edit.name} was already among this character's powers — nothing changed.`
        : `Granted the power ${edit.name}${mark}.`;
    case 'set_defensive_power': {
      const prev = before.combat.defensivePower;
      return prev && !eq(prev, edit.name)
        ? `Set the defensive power to ${edit.name}, replacing ${prev} (a character has only one).`
        : `Set the defensive power to ${edit.name}.`;
    }
    case 'add_feat': {
      const held = [...before.feats.general, ...before.feats.combat].some((f) => eq(f, edit.name));
      return held ? `${edit.name} was already one of this character's feats — nothing changed.` : `Granted the feat ${edit.name}.`;
    }
    case 'add_stance':
      return before.stances.some((s) => eq(s, edit.name))
        ? `${edit.name} Stance was already known — nothing changed.`
        : `Learned the ${edit.name} Stance. Enter it from the sheet when you want it active.`;
    case 'add_condition':
      return before.combat.conditions.some((c) => eq(c, edit.name))
        ? `${edit.name} was already in effect — nothing changed.`
        : `Applied the condition ${edit.name}.`;
    default:
      return 'Granted.';
  }
}
