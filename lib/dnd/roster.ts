// lib/dnd/roster.ts — the campaign roster role (Slice 30): a character is a PC, a special NPC, or a generic
// NPC. This is EDITORIAL, not mechanical — the same `Character` on the same engine, just triaged differently,
// so "promote a generic NPC to a PC" is a one-field change, never a rebuild.
//
// Before this, the "effective role" fallback (a legacy character predating the column reads from is_npc) was
// hand-inlined at four call sites — two of which skipped the validity check, so a corrupt stored role could
// slip through. This is the single source: valid role wins, else derive from is_npc.

export const ROSTER_ROLES = ['pc', 'special_npc', 'generic_npc'] as const;
export type RosterRole = (typeof ROSTER_ROLES)[number];

/** True for exactly the three known roster roles — the validity gate the PATCH route enforces. */
export function isRosterRole(v: unknown): v is RosterRole {
  return typeof v === 'string' && (ROSTER_ROLES as readonly string[]).includes(v);
}

/**
 * A character's effective roster role. A valid stored `roster_role` wins; otherwise a legacy character (the
 * column is null, or holds a corrupt value) reads from `is_npc` — an NPC → `generic_npc`, everything else →
 * `pc`. So every pre-roster character reads as a `pc` unless it was already flagged an NPC (Slice 30 back-compat).
 */
export function rosterRoleOf(rosterRole: string | null | undefined, isNpc: boolean | null | undefined): RosterRole {
  if (isRosterRole(rosterRole)) return rosterRole;
  return isNpc ? 'generic_npc' : 'pc';
}
