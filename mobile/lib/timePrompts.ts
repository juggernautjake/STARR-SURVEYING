/**
 * "Still working?" smart prompts (plan §5.8.2).
 *
 * The biggest source of bad time data is forgetting to clock out.
 * Two scheduled notifications per clock-in catch the most common
 * forgotten-clockout windows:
 *
 *   10h after started_at  →  "You've been clocked in 10 hours
 *                              — still working?"
 *   14h after started_at  →  "14 hours clocked in — clock out?"
 *                              (escalates to a louder treatment;
 *                              by 14h it's almost certainly a
 *                              forgotten clock-out)
 *
 * Both notifications are tied to the job_time_entries.id so cancel
 * on clock-out is precise. If the user clocks back in (different
 * entry id), a fresh pair is scheduled.
 *
 * Geofence-leave prompts (third bullet in plan §5.8.2) need
 * background location and land in F6 with the location-tracking
 * surface.
 */
import { cancel, schedule } from './notifications';

const HOURS_TO_MS = 60 * 60 * 1000;
const PROMPT_AT_HOURS = [10, 14] as const;

function makeId(entryId: string, atHours: number): string {
  return `still-working-${atHours}h-${entryId}`;
}

/**
 * Schedule both 10h and 14h "still working?" notifications for an
 * active clock-in. Safe to call even if started_at is malformed —
 * silently no-ops in that case (notifications are convenience).
 */
export async function scheduleStillWorkingPrompts(
  entryId: string,
  startedAtIso: string
): Promise<void> {
  const startedMs = Date.parse(startedAtIso);
  if (!Number.isFinite(startedMs)) return;

  for (const hours of PROMPT_AT_HOURS) {
    const fireAt = new Date(startedMs + hours * HOURS_TO_MS);
    const isLate = hours >= 14;
    await schedule({
      identifier: makeId(entryId, hours),
      fireAt,
      title: isLate
        ? `${hours} hours clocked in — clock out?`
        : `Still working?`,
      body: isLate
        ? "It's been a long shift. Open Starr Field to clock out, or fix the time if you forgot earlier."
        : `You've been clocked in ${hours} hours. Tap to clock out or keep going.`,
      data: { entryId, kind: 'still-working', hours },
    });
  }
}

/**
 * Cancel both prompts for an entry. Called from clock-out and from
 * any manual edit that closes ended_at. Safe when nothing was ever
 * scheduled (permission denied at clock-in time, etc.).
 */
export async function cancelStillWorkingPrompts(entryId: string): Promise<void> {
  for (const hours of PROMPT_AT_HOURS) {
    await cancel(makeId(entryId, hours));
  }
}
