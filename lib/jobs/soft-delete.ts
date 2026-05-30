// lib/jobs/soft-delete.ts
//
// job-soft-delete plan Slice 1 — pure helpers for the 30-day recovery
// window. Used by the trash view (how long until a deleted job auto-
// purges) + the purge cron (Slice 2: the cutoff timestamp). Dependency-
// free → unit-tested in node.

/** Days a deleted job stays recoverable before the purge cron removes it. */
export const RECOVERY_WINDOW_DAYS = 30;

const DAY_MS = 86_400_000;

/** Whole days remaining before a job deleted at `deletedAtIso` auto-
 *  purges, given `nowMs`. Clamped at 0 (never negative — an overdue
 *  row reads as "0 days left" until the cron sweeps it). Returns null
 *  when `deletedAtIso` is missing / unparseable. */
export function daysUntilPurge(
  deletedAtIso: string | null | undefined,
  nowMs: number,
  windowDays: number = RECOVERY_WINDOW_DAYS,
): number | null {
  if (!deletedAtIso) return null;
  const deletedMs = Date.parse(deletedAtIso);
  if (!Number.isFinite(deletedMs)) return null;
  const purgeMs = deletedMs + windowDays * DAY_MS;
  return Math.max(0, Math.ceil((purgeMs - nowMs) / DAY_MS));
}

/** Whole days since a job was deleted (for "deleted N days ago"). 0 on
 *  the day of deletion. Null when unparseable. */
export function daysSinceDeleted(
  deletedAtIso: string | null | undefined,
  nowMs: number,
): number | null {
  if (!deletedAtIso) return null;
  const deletedMs = Date.parse(deletedAtIso);
  if (!Number.isFinite(deletedMs)) return null;
  return Math.max(0, Math.floor((nowMs - deletedMs) / DAY_MS));
}

/** True while a deleted job is still inside its recovery window. */
export function isRecoverable(
  deletedAtIso: string | null | undefined,
  nowMs: number,
  windowDays: number = RECOVERY_WINDOW_DAYS,
): boolean {
  const left = daysUntilPurge(deletedAtIso, nowMs, windowDays);
  return left !== null && left > 0;
}

/** The ISO cutoff for the purge cron: rows with `deleted_at` strictly
 *  older than this are past the recovery window and safe to hard-
 *  delete. */
export function purgeCutoffIso(
  nowMs: number,
  windowDays: number = RECOVERY_WINDOW_DAYS,
): string {
  return new Date(nowMs - windowDays * DAY_MS).toISOString();
}
