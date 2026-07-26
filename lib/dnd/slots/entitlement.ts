// lib/dnd/slots/entitlement.ts — the ESCAPE HATCH's decision core (slot plan S6).
//
// Slices S1–S5 bounded every builder to what its class and level actually grant, which was the owner's
// complaint ("we shouldn't be able to give 10 different feats to a character at level 2"). This is the other
// half of the same directive, and it must not undo the first:
//
//   > "…but we will have buttons that the user can click to add other feats or custom stuff. Like with the
//   > feats … maybe we have talked with our dm and he has given us permission to use a cross-class feat that
//   > we would not normally get."
//
// So a blocked pick stops being a dead end and becomes a decision the character RECORDS.
//
// ── Why this is not `Provenance` ───────────────────────────────────────────────────────────────────────
// `lib/dnd/provenance.ts` already has `'vanilla' | 'custom' | 'dm-granted'`, and the plan doc proposed
// folding this into a single widened union. That would have conflated two independent axes:
//
//   · CONTENT     — is this thing in the book?          → `Provenance` (already shipped)
//   · ENTITLEMENT — was this character allowed it HERE?  → this module
//
// They cross. A cross-class feat taken with the DM's blessing is *vanilla content* the character was *not
// entitled to*. A homebrew feat taken in a legal slot is *custom content* the character *was* entitled to.
// One union cannot say both, and the badge the owner asked for ("it needs to be clear something is not the
// usual") is specifically about the second axis — every element on an altered-vanilla sheet may well be
// straight out of the book.
import type { SheetVariantKind } from '../system-variants';

/** Whether a character was entitled to a pick at the slot it occupies. */
export type Entitlement = 'entitled' | 'expanded' | 'dm-granted';

/** A recorded departure from the rules: what was taken, and what the rules said about it. */
export interface SlotException {
  /** The thing taken. */
  name: string;
  /** The RULES' objection, verbatim — so the badge can name the reason, not just the fact. */
  reason: string;
  /** Never `'entitled'`: an exception exists precisely because the character was not. */
  entitlement: Exclude<Entitlement, 'entitled'>;
  /** The slot it was taken against, when the surface knows it. */
  level?: number;
  /**
   * The DM's ruling on THIS pick — the owner's ask: *"the DM would need to be able to review all of the
   * non-vanilla facets of the character and deny or approve them."*
   *
   * Absent = not yet reviewed, which is different from approved and must read differently. Lives on the
   * exception rather than in a side table so the ruling travels with the pick: rebuild the character, fork
   * a variant, take it into another campaign, and the DM's decision goes with it instead of being
   * orphaned by an id that no longer resolves.
   *
   * A DENIAL does not delete the pick. Silently removing a player's content is the failure this codebase
   * refuses everywhere else, and a denial the player never sees explains nothing — so the pick stays,
   * marked, and both sides can see exactly what was refused and why.
   */
  review?: ExceptionReview;
}

export interface ExceptionReview {
  decision: 'approved' | 'denied';
  /** Who ruled, for the record. */
  by?: string;
  /** ISO timestamp. */
  at?: string;
  /** The DM's note — required for a denial by the UI, since "no" without a reason is not reviewable. */
  note?: string;
}

/** What the "take it anyway" control should offer for the current actor and character. */
export interface UnlockOffer {
  /** False when there is nothing to escape. */
  offered: boolean;
  /** What accepting stamps on the pick. */
  stamps: Exclude<Entitlement, 'entitled'>;
  /** Button text. */
  label: string;
  /** The sentence under it — what accepting COSTS, which is the part a player must not be surprised by. */
  blurb: string;
}

/**
 * Whether to offer the hatch, and what accepting means.
 *
 * Mirrors `unboundReasonFor`: a DM's pick is `dm-granted`, a player's is `expanded`. On a CUSTOM character
 * the rules never bound in the first place, so there is nothing to unlock and no exception to record —
 * offering one there would put an "exception" badge on a sheet that never claimed to be legal.
 */
export function unlockOffer(ctx: { isDM?: boolean; kind: SheetVariantKind }): UnlockOffer {
  const stamps: Exclude<Entitlement, 'entitled'> = ctx.isDM ? 'dm-granted' : 'expanded';
  if (!isBoundKind(ctx.kind)) {
    return { offered: false, stamps, label: '', blurb: '' };
  }
  return {
    offered: true,
    stamps,
    label: ctx.isDM ? '+ Grant it anyway' : '+ Take it anyway',
    blurb: ctx.isDM
      ? 'Recorded as DM-granted, and named on the sheet.'
      : 'Recorded as an exception — this character will read "Altered vanilla" and name it.',
  };
}

/** The rules bind on everything except a character that has stopped claiming to follow them. */
function isBoundKind(kind: SheetVariantKind): boolean {
  return kind !== 'custom';
}

/**
 * The character's badge, given its exceptions.
 *
 * Derived rather than stored, so it cannot drift from the picks that justify it — and so REMOVING the
 * cross-class feat takes the character back to plain vanilla instead of leaving a scar. `custom` is
 * absorbing: a character that has stopped claiming to be rules-legal does not get promoted to
 * "altered vanilla" just because it happens to hold no exceptions.
 *
 * Callers must pass the character's WHOLE exception set, not one surface's — see `exceptionsIn`.
 */
export function variantKindWithExceptions(current: SheetVariantKind, exceptions: SlotException[]): SheetVariantKind {
  if (current === 'custom') return 'custom';
  return exceptions.length > 0 ? 'altered-vanilla' : 'vanilla';
}

/**
 * Apply a DM ruling to every exception matching `name`, in a choice ledger. Returns a NEW array.
 *
 * Matches by name the way every picker in this repo does. Pure, and shape-only over the choice, so one
 * implementation serves all three systems' ledgers — the same reason `exceptionsIn` is shape-only.
 */
export function reviewExceptions<T extends { exception?: unknown }>(
  choices: readonly T[] | undefined | null,
  name: string,
  review: ExceptionReview,
): T[] {
  const norm = (s: unknown) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  const target = norm(name);
  if (!Array.isArray(choices) || !target) return Array.isArray(choices) ? [...choices] : [];
  return choices.map((c) => {
    const e = c?.exception as SlotException | undefined;
    if (!e || typeof e !== 'object' || norm(e.name) !== target) return c;
    return { ...c, exception: { ...e, review } };
  });
}

/** What the DM still has to look at. `pending` is the number that have had no ruling either way. */
export function reviewSummary(exceptions: readonly SlotException[]): {
  pending: number; approved: number; denied: number; allReviewed: boolean;
} {
  const approved = exceptions.filter((e) => e.review?.decision === 'approved').length;
  const denied = exceptions.filter((e) => e.review?.decision === 'denied').length;
  const pending = exceptions.length - approved - denied;
  return { pending, approved, denied, allReviewed: exceptions.length > 0 && pending === 0 };
}

/** "Magic Initiate (DM-granted, level 4)" — the badge's job is to NAME what changed. */
export function describeException(e: SlotException): string {
  const bits = [e.entitlement === 'dm-granted' ? 'DM-granted' : 'added outside the rules'];
  if (typeof e.level === 'number' && e.level > 0) bits.push(`level ${e.level}`);
  return `${e.name} (${bits.join(', ')})`;
}

/** The one-line summary under the badge. */
export function summarizeExceptions(exceptions: SlotException[]): string {
  if (!exceptions.length) return '';
  const named = exceptions.map(describeException);
  if (named.length <= 2) return named.join(' and ');
  return `${named.slice(0, 2).join(', ')} and ${named.length - 2} more`;
}

/** Shape-only view of a recorded choice, so this module stays free of every system's ledger type. */
interface ChoiceLike { level?: number; exception?: unknown }

/**
 * Every exception in a choice ledger.
 *
 * Reads the MERGED ledger rather than one request's payload, which is what makes
 * `variantKindWithExceptions` safe to apply on any single surface: rebuilding Foundations must not demote a
 * character whose exception was recorded by the level walker. Defensive about shape — these ledgers are
 * persisted JSON, so a hand-edited or older row must not throw.
 */
export function exceptionsIn(choices: readonly ChoiceLike[] | undefined | null): SlotException[] {
  if (!Array.isArray(choices)) return [];
  const out: SlotException[] = [];
  for (const c of choices) {
    const e = c?.exception;
    if (!e || typeof e !== 'object') continue;
    const rec = e as Record<string, unknown>;
    const name = typeof rec.name === 'string' ? rec.name.trim() : '';
    if (!name) continue;
    const entitlement = rec.entitlement === 'dm-granted' ? 'dm-granted' : 'expanded';
    const level = typeof rec.level === 'number' ? rec.level : typeof c?.level === 'number' ? c.level : undefined;
    out.push({
      name,
      reason: typeof rec.reason === 'string' ? rec.reason : '',
      entitlement,
      ...(level != null ? { level } : {}),
    });
  }
  return out;
}

/**
 * Split a set of refusals into the ones the player has knowingly accepted and the ones still refused.
 *
 * THE SERVER STAYS THE AUTHORITY ON *WHY*. The client only asserts intent — "I mean to take Magic Initiate
 * anyway" — and the reason recorded is the one the gate produced. Otherwise a crafted POST could record an
 * exception reading "DM approved this" for a feat the rules refused for an entirely different cause, and the
 * badge that is supposed to make the departure legible would launder it instead.
 *
 * Matching is by name, case- and space-insensitively, because that is how every picker in this repo
 * identifies a pick.
 */
export function splitAcknowledged(
  refused: readonly { name: string; reason: string }[],
  acknowledged: readonly string[] | undefined | null,
  stamps: Exclude<Entitlement, 'entitled'>,
  level?: number,
): { accepted: SlotException[]; stillRefused: { name: string; reason: string }[] } {
  const norm = (s: unknown) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  const ok = new Set((Array.isArray(acknowledged) ? acknowledged : []).map(norm));
  const accepted: SlotException[] = [];
  const stillRefused: { name: string; reason: string }[] = [];
  for (const r of refused) {
    if (ok.has(norm(r.name))) {
      accepted.push({ name: r.name, reason: r.reason, entitlement: stamps, ...(level != null ? { level } : {}) });
    } else {
      stillRefused.push(r);
    }
  }
  return { accepted, stillRefused };
}
