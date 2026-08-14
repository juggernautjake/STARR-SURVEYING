// lib/notifications/job-stage.ts
//
// Slice 2d of hub-widget-excellence-03-notifications, reduced to one function on 2026-08-14 by
// slice N3 of docs/planning/in-progress/JOB_LIFECYCLE_AND_BRIEFINGS_2026-08-14.md.
//
// ── resolveStageRecipients IS GONE, DELIBERATELY ────────────────────────────────────────────────
//
// It answered "who is on this job" for exactly one event, from a plain list of `job_team` emails —
// which meant it notified people who had been REMOVED from the job and people who had DECLINED it,
// because it never learned about `removed_at` or `declined_at`, and it missed the lead RPLS when
// nobody had added them to the crew list.
//
// `jobRecipients` in ./job-event.ts is the generalisation, and it is now the ONLY answer to that
// question (D6). This file keeps its export list short on purpose: leaving a superseded resolver
// exported and tested is an invitation for the next route to use it, which is precisely the drift
// the one-notifier rule exists to prevent.

/** True only when the stage genuinely changed (both stages present and
 *  different) — guards against notifying on a no-op "set to same stage".
 *
 *  Kept here rather than folded into the notifier: this is about what counts as a transition on
 *  THIS route, not about who hears about one. */
export function isStageTransition(
  fromStage: string | null | undefined,
  toStage: string | null | undefined,
): boolean {
  const from = fromStage?.trim();
  const to = toStage?.trim();
  return !!from && !!to && from !== to;
}
