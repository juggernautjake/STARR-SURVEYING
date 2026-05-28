// lib/schedule/pto-hours.ts
//
// Shared PTO-hours calc — used by the time-off page to preview the deduction
// against the requester's balance, and by the time-off PATCH handler to write
// the actual transaction on approve. Both sides must agree, hence the shared
// module.

const HOURS_PER_WORKDAY = 8;

// Mon-Fri count between two UTC instants (inclusive of any calendar day
// either timestamp falls on). All-day requests are stored as `00:00 → 23:59`
// so the raw duration would charge ~24h per calendar day and weekend days
// would be charged too; this gives a real eight-hour-per-weekday deduction.
function countWeekdaysUtc(startMs: number, endMs: number): number {
  const s = new Date(startMs);
  const e = new Date(endMs);
  const startDay = Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate());
  const endDay = Date.UTC(e.getUTCFullYear(), e.getUTCMonth(), e.getUTCDate());
  if (endDay < startDay) return 0;
  const DAY_MS = 86_400_000;
  let count = 0;
  for (let t = startDay; t <= endDay; t += DAY_MS) {
    const d = new Date(t).getUTCDay(); // 0=Sun, 6=Sat
    if (d !== 0 && d !== 6) count++;
  }
  return count;
}

export function ptoHoursForRequest(opts: {
  startTime: string | number | Date;
  endTime: string | number | Date;
  allDay: boolean;
}): number {
  const startMs = new Date(opts.startTime).getTime();
  const endMs = new Date(opts.endTime).getTime();
  if (opts.allDay) {
    return HOURS_PER_WORKDAY * countWeekdaysUtc(startMs, endMs);
  }
  return Math.max(0, (endMs - startMs) / 3_600_000);
}

export { HOURS_PER_WORKDAY };
