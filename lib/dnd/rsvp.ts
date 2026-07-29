// lib/dnd/rsvp.ts — who is coming to the next session (P3-5).
//
// P1-5 made sessions schedulable and put a "Next session" banner on the campaign hub. The obvious next
// question a table asks is "is everyone actually going to be there", and until now the answer lived in a
// group chat somewhere else.
//
// SMALL ON PURPOSE. Three states, one row per member per session, no reminders and no invitations — a
// Discord webhook is P10-4 and email does not exist here (see P2-4). Everything below is pure so the
// counting and the "do we have quorum" judgement can be asserted without a database.

export const RSVP_STATUSES = ['yes', 'no', 'maybe'] as const;
export type RsvpStatus = (typeof RSVP_STATUSES)[number];

/**
 * Normalize whatever arrived into a status, or null.
 *
 * Null means "clear my answer", which is deliberately distinct from `no`. A player who has not answered
 * yet and a player who has said they cannot come are different facts, and collapsing them would let the
 * banner claim a decision nobody made.
 */
export function normalizeRsvp(value: unknown): RsvpStatus | null {
  const v = String(value ?? '').trim().toLowerCase();
  return (RSVP_STATUSES as readonly string[]).includes(v) ? (v as RsvpStatus) : null;
}

export interface RsvpRow {
  user_id: string;
  status: string;
}

export interface RsvpTally {
  yes: number;
  no: number;
  maybe: number;
  /** Members who have not answered at all. */
  awaiting: number;
  /** Every member, answered or not. */
  members: number;
}

/**
 * Count the answers against the campaign's membership.
 *
 * `memberIds` is passed in rather than derived from the rows, because the interesting number is the one the
 * rows do NOT contain: how many people have not replied. A tally built only from RSVP rows can never say
 * "three people haven't answered", which is the single most useful thing a DM wants from this.
 */
export function tallyRsvps(rows: readonly RsvpRow[], memberIds: readonly string[]): RsvpTally {
  const members = new Set(memberIds ?? []);
  const seen = new Set<string>();
  const tally: RsvpTally = { yes: 0, no: 0, maybe: 0, awaiting: 0, members: members.size };

  for (const row of rows ?? []) {
    const status = normalizeRsvp(row.status);
    // An RSVP from someone no longer in the campaign is ignored rather than counted — they left, and their
    // old "yes" should not keep inflating the count.
    if (!status || !members.has(row.user_id) || seen.has(row.user_id)) continue;
    seen.add(row.user_id);
    tally[status] += 1;
  }
  tally.awaiting = Math.max(0, members.size - seen.size);
  return tally;
}

/**
 * A one-line summary — "4 yes · 1 no · 2 haven't answered".
 *
 * Zero counts are omitted rather than shown as "0 no", because a line full of zeroes is harder to read than
 * a short one. `awaiting` is always shown when non-zero: it is the number that prompts a nudge.
 */
export function summarizeRsvps(tally: RsvpTally): string {
  if (!tally.members) return 'No members yet.';
  const parts: string[] = [];
  if (tally.yes) parts.push(`${tally.yes} yes`);
  if (tally.no) parts.push(`${tally.no} no`);
  if (tally.maybe) parts.push(`${tally.maybe} maybe`);
  if (tally.awaiting) parts.push(`${tally.awaiting} haven’t answered`);
  return parts.length ? parts.join(' · ') : 'Nobody has answered yet.';
}

/** The label a player sees on their own answer. */
export const RSVP_LABELS: Record<RsvpStatus, string> = {
  yes: 'Going',
  no: 'Can’t make it',
  maybe: 'Maybe',
};
