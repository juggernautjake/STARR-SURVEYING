// lib/notifications/job-stage.ts
//
// Slice 2d of hub-widget-excellence-03-notifications. Pure helpers for
// the job-stage-change notification: who gets notified + whether the
// change is real. Dependency-free + unit-testable; the route passes the
// recipients to the existing `notifyJobStageUpdate` helper.

/**
 * The crew to notify about a stage change: the job-team emails, de-duped
 * (case-insensitive, first-seen casing kept), with empties dropped and
 * the actor who made the change excluded (they already know).
 */
export function resolveStageRecipients(
  teamEmails: ReadonlyArray<string | null | undefined>,
  actorEmail: string | null | undefined,
): string[] {
  const actor = actorEmail?.trim().toLowerCase() ?? '';
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of teamEmails) {
    const email = raw?.trim();
    if (!email) continue;
    const key = email.toLowerCase();
    if (key === actor || seen.has(key)) continue;
    seen.add(key);
    out.push(email);
  }
  return out;
}

/** True only when the stage genuinely changed (both stages present and
 *  different) — guards against notifying on a no-op "set to same stage". */
export function isStageTransition(
  fromStage: string | null | undefined,
  toStage: string | null | undefined,
): boolean {
  const from = fromStage?.trim();
  const to = toStage?.trim();
  return !!from && !!to && from !== to;
}
