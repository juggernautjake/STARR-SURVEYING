// lib/mileage/period.ts
//
// hub-widget-excellence-15 — mileage-tracker. Pure period→window helper
// behind the new `?summary=1&period=` mode of /api/admin/mileage. Maps
// the widget's `today | week | month` choice into the `?from=&to=` YYYY-
// MM-DD pair the existing endpoint already accepts. UTC-bucketed (the
// endpoint computes UTC days too). Dependency-free → unit-tested in node.

export type MileagePeriod = 'today' | 'week' | 'month';

const DAY_MS = 86_400_000;

const utcDateString = (d: Date): string => d.toISOString().slice(0, 10);

/** {from, to} as YYYY-MM-DD inclusive for the given period, anchored on
 *  `now`. Week = the last 7 UTC days (today plus the 6 preceding);
 *  month = the last 30 UTC days. Matches how the surveyor reads
 *  "this week" / "this month" on a rolling counter (one number on a
 *  hub tile shouldn't change at midnight Sunday vs Monday). */
export function mileagePeriodWindow(
  period: MileagePeriod,
  now: Date = new Date(),
): { from: string; to: string } {
  const today = utcDateString(now);
  if (period === 'today') return { from: today, to: today };
  const back = period === 'week' ? 6 : 29;
  const from = utcDateString(new Date(now.getTime() - back * DAY_MS));
  return { from, to: today };
}
