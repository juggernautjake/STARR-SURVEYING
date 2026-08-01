// lib/dnd/maps/discovery.ts — finding the hidden thing. M6-1.
//
// The plan: *"A `hidden` object carries `{ skill, dc, description, reveals }`. **The player's map payload
// does not contain it.** When a player rolls the relevant check … the server compares and, on success,
// writes a `map_discovery` and pushes the reveal. A client that never received the secret cannot leak
// it."*
//
// ── THE COMPARISON HAPPENS HERE BECAUSE IT CANNOT HAPPEN THERE ─────────────────────────────────────
//
// `loadMapObjects` already refuses to send a `dm`-visibility object to a player, and every hidden object
// is one. That is the whole reason this module exists on the server: the DC is a secret too. A payload
// that said *"there is a thing here, DC 18"* would let a player read the DC in devtools and decide
// whether the search was worth an action — which is the same leak as sending the object, one step
// removed.
//
// So a player sends **a roll**, and the server answers **what that roll found**. Never a list to filter.
//
// ── SUCCESS IS `total >= dc`, AND EQUAL MEETS IT ───────────────────────────────────────────────────
//
// Every system in this app treats a check as passing when it EQUALS the DC. Getting this wrong by one is
// the single most common off-by-one in tabletop software, and it is invisible: the puzzle just seems a
// little harder than the DM set.
//
// ── A MISS IS NOT AN ERROR ─────────────────────────────────────────────────────────────────────────
//
// Rolling a 9 against DC 15 is an ordinary outcome and the answer is "you find nothing" — not a failure
// status, not an empty error. The route returns 200 with an empty `found`, and the player learns exactly
// what a player at a table learns: nothing.
//
// Pure and total: no I/O, no clock, no randomness.

/** What a `hidden` object's `data` blob carries. Every field optional — a DM may still be authoring it. */
export interface HiddenSpec {
  /** 'perception' | 'investigation' | 'survival' | … — free text, matched case-insensitively. */
  skill?: string | null;
  dc?: number | null;
  /** Read-aloud text shown to whoever finds it (M6-3). */
  description?: string | null;
  /** Object ids this reveals in addition to itself. */
  reveals?: unknown;
}

export interface HiddenObject {
  id: string;
  label: string | null;
  description: string | null;
  data: unknown;
}

export type SkipReason = 'no-dc' | 'wrong-skill' | 'already-found' | 'failed';

export interface Outcome {
  objectId: string;
  found: boolean;
  reason?: SkipReason;
  /** Only ever populated on a find. */
  reveal?: { label: string | null; description: string | null; reveals: string[] };
}

/** Parse the blob without trusting it. A half-authored hidden object must not crash a search. */
export function readHiddenSpec(data: unknown): HiddenSpec {
  const d = (data ?? {}) as Record<string, unknown>;
  const dc = typeof d.dc === 'number' && Number.isFinite(d.dc) ? d.dc : null;
  return {
    skill: typeof d.skill === 'string' && d.skill.trim() ? d.skill.trim() : null,
    dc,
    description: typeof d.description === 'string' && d.description.trim() ? d.description.trim() : null,
    reveals: d.reveals,
  };
}

/** `reveals` may be a single id, an array, or absent. Normalised, and non-strings dropped. */
export function readReveals(raw: unknown): string[] {
  if (typeof raw === 'string') return raw.trim() ? [raw.trim()] : [];
  if (!Array.isArray(raw)) return [];
  return raw.filter((r): r is string => typeof r === 'string' && r.trim() !== '').map((r) => r.trim());
}

/** Do two skill names refer to the same check? Case- and whitespace-insensitive; nothing cleverer. */
export function sameSkill(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Decide one hidden object against one roll.
 *
 * Exported per-object rather than only in bulk so a single case can be reasoned about — and because the
 * route needs the REASON for each miss to keep an honest DM log, while the player only ever learns the
 * finds.
 */
export function evaluateHidden(
  object: HiddenObject,
  args: { skill: string; total: number; alreadyFound: boolean },
): Outcome {
  const spec = readHiddenSpec(object.data);

  // Already found: not a failure, and not something to write twice. The unique constraint on
  // `dnd_map_discoveries` would refuse the second write anyway; saying so here keeps the log truthful.
  if (args.alreadyFound) return { objectId: object.id, found: false, reason: 'already-found' };

  // A hidden object with no DC is one the DM has not finished authoring. It must NOT be findable by
  // default — a half-written secret revealing itself to the first person who searches is worse than one
  // that never reveals at all, because the DM never learns it was unfinished.
  //
  // `== null` catches undefined as well as null: `readHiddenSpec` returns null, but a caller passing a
  // hand-built spec could leave the field off entirely, and "absent" and "null" mean the same thing here.
  const dc = spec.dc;
  if (dc == null) return { objectId: object.id, found: false, reason: 'no-dc' };

  // A Perception search does not find the thing that wanted Investigation.
  if (spec.skill && !sameSkill(spec.skill, args.skill)) {
    return { objectId: object.id, found: false, reason: 'wrong-skill' };
  }

  // Equal meets it. See the header — this is the classic off-by-one and it is silent.
  if (args.total < dc) return { objectId: object.id, found: false, reason: 'failed' };

  return {
    objectId: object.id,
    found: true,
    reveal: {
      label: object.label,
      // The object's own `description` column is the read-aloud text (M6-3); the blob's is a fallback for
      // objects authored before that column was used.
      description: object.description ?? spec.description ?? null,
      reveals: readReveals(spec.reveals),
    },
  };
}

export interface SearchResult {
  outcomes: Outcome[];
  /** What the PLAYER is told: only the finds. */
  found: Array<{ objectId: string; label: string | null; description: string | null }>;
  /** Every object id to mark discovered — the found ones plus whatever they reveal. */
  toRecord: string[];
  /** Counts per reason, for the DM's log. Never sent to a player: `failed: 3` tells them where to look. */
  misses: Record<SkipReason, number>;
}

/** Evaluate a whole node's hidden objects against one roll. */
export function search(
  objects: HiddenObject[],
  args: { skill: string; total: number; alreadyFound: ReadonlySet<string> },
): SearchResult {
  const outcomes = objects.map((o) => evaluateHidden(o, {
    skill: args.skill, total: args.total, alreadyFound: args.alreadyFound.has(o.id),
  }));

  const misses: Record<SkipReason, number> = { 'no-dc': 0, 'wrong-skill': 0, 'already-found': 0, failed: 0 };
  for (const o of outcomes) if (!o.found && o.reason) misses[o.reason] += 1;

  const hits = outcomes.filter((o) => o.found);
  // A revealed id is recorded even if it is not itself a hidden object — the DM said "finding this shows
  // that", and the map's job is to obey rather than to second-guess which ids are eligible.
  const toRecord = [...new Set(hits.flatMap((h) => [h.objectId, ...(h.reveal?.reveals ?? [])]))];

  return {
    outcomes,
    found: hits.map((h) => ({ objectId: h.objectId, label: h.reveal!.label, description: h.reveal!.description })),
    toRecord,
    misses,
  };
}
