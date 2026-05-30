// lib/learn/streak.ts
//
// hub-widget-excellence-13 — the /api/admin/learn/streak endpoint was
// missing, so the streak-counter widget always showed empty. This pure
// helper computes the current + longest consecutive-day streak from a
// set of activity dates (lesson completions / quiz attempts / clock-ins,
// per the widget's `kind`). Dependency-free + UTC-based for tests.

const DAY_MS = 86_400_000;

export interface StreakInfo {
  current_days: number;
  longest_days: number;
}

/** Whole-day number (days since the epoch, UTC) for an ISO date or
 *  datetime; null when unparseable. */
function dayNumber(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  return Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / DAY_MS);
}

/**
 * Compute the current + longest streak from activity dates.
 *  - `longest_days` = the longest run of consecutive calendar days.
 *  - `current_days` = the run ending today (or yesterday — a streak
 *    stays "current" until a full day is missed).
 */
export function computeStreak(dates: readonly string[], nowMs: number = Date.now()): StreakInfo {
  const days = [...new Set(
    dates.map(dayNumber).filter((n): n is number => n !== null),
  )].sort((a, b) => a - b);

  if (days.length === 0) return { current_days: 0, longest_days: 0 };

  // Longest consecutive run.
  let longest = 1;
  let run = 1;
  for (let i = 1; i < days.length; i += 1) {
    if (days[i] === days[i - 1] + 1) {
      run += 1;
      if (run > longest) longest = run;
    } else {
      run = 1;
    }
  }

  // Current run — must include today or yesterday to still count.
  const present = new Set(days);
  const today = Math.floor(Date.UTC(
    new Date(nowMs).getUTCFullYear(),
    new Date(nowMs).getUTCMonth(),
    new Date(nowMs).getUTCDate(),
  ) / DAY_MS);
  let anchor: number | null = present.has(today) ? today : present.has(today - 1) ? today - 1 : null;
  let current = 0;
  if (anchor !== null) {
    while (present.has(anchor)) {
      current += 1;
      anchor -= 1;
    }
  }

  return { current_days: current, longest_days: longest };
}
