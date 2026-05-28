// lib/schedule/recurrence.ts
//
// Minimal RRULE expander for the schedule_events.recurrence_rule field.
// Supports the subset of RFC 5545 the schedule UI exposes: FREQ
// (DAILY|WEEKLY|MONTHLY), INTERVAL, BYDAY (MO,TU,...), COUNT, UNTIL.
//
// Why a hand-rolled expander rather than a full RRULE library? Two reasons:
// (1) the surface area the UI offers is tiny, and (2) every dependency we
// add ships in the admin bundle. This handles the four UI presets — daily,
// weekdays, weekly, monthly — and any hand-typed rule that stays in that
// shape.

export interface ParsedRRule {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  interval: number;
  byDay?: number[]; // 0=Sun..6=Sat
  count?: number;
  until?: Date;
}

const WEEKDAY_MAP: Record<string, number> = {
  SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6,
};

export function parseRRule(rule: string): ParsedRRule | null {
  const parts = rule.split(';').map(s => s.trim()).filter(Boolean);
  const map: Record<string, string> = {};
  for (const p of parts) {
    const [k, v] = p.split('=');
    if (k && v) map[k.toUpperCase()] = v.toUpperCase();
  }
  const freq = map.FREQ as ParsedRRule['freq'];
  if (freq !== 'DAILY' && freq !== 'WEEKLY' && freq !== 'MONTHLY') return null;
  const interval = Math.max(1, parseInt(map.INTERVAL ?? '1', 10) || 1);
  const out: ParsedRRule = { freq, interval };
  if (map.BYDAY) {
    out.byDay = map.BYDAY.split(',').map(d => WEEKDAY_MAP[d.trim()]).filter((n): n is number => Number.isInteger(n));
  }
  if (map.COUNT) out.count = Math.max(1, parseInt(map.COUNT, 10));
  if (map.UNTIL) {
    // UNTIL is 20251231T235959Z in RFC 5545; tolerate the shorter YYYYMMDD too.
    const u = map.UNTIL;
    const iso = u.length === 8
      ? `${u.slice(0, 4)}-${u.slice(4, 6)}-${u.slice(6, 8)}T23:59:59Z`
      : `${u.slice(0, 4)}-${u.slice(4, 6)}-${u.slice(6, 8)}T${u.slice(9, 11)}:${u.slice(11, 13)}:${u.slice(13, 15)}Z`;
    const d = new Date(iso);
    if (!Number.isNaN(d.getTime())) out.until = d;
  }
  return out;
}

/**
 * Expand a recurring event into concrete occurrence windows that fall inside
 * [windowFrom, windowTo). Returns the absolute start/end times for each. The
 * caller is responsible for cloning the source event's other fields into the
 * occurrence.
 *
 * Safety caps: we bail at 366 emitted occurrences, and we never advance the
 * cursor past `windowTo` even if the rule says we should keep going.
 */
export function expandRecurrence(
  base: { start_time: string; end_time: string; recurrence_rule: string | null; recurrence_end: string | null },
  windowFrom: Date,
  windowTo: Date,
): Array<{ start_time: string; end_time: string; occurrence_index: number }> {
  if (!base.recurrence_rule) return [];
  const rule = parseRRule(base.recurrence_rule);
  if (!rule) return [];
  const start = new Date(base.start_time);
  const end = new Date(base.end_time);
  const duration = end.getTime() - start.getTime();
  if (!Number.isFinite(duration) || duration < 0) return [];

  const stop = (() => {
    const limits: Date[] = [windowTo];
    if (rule.until) limits.push(rule.until);
    if (base.recurrence_end) limits.push(new Date(base.recurrence_end));
    return new Date(Math.min(...limits.map(d => d.getTime())));
  })();

  const occurrences: Array<{ start_time: string; end_time: string; occurrence_index: number }> = [];
  let cursor = new Date(start);
  let emitted = 0;
  let safety = 0;
  const HARD_CAP = 366;

  const push = (occStart: Date, occIndex: number) => {
    if (occStart.getTime() >= stop.getTime()) return false;
    const occEnd = new Date(occStart.getTime() + duration);
    if (occEnd.getTime() <= windowFrom.getTime()) return true; // keep walking
    occurrences.push({
      start_time: occStart.toISOString(),
      end_time: occEnd.toISOString(),
      occurrence_index: occIndex,
    });
    emitted++;
    if (rule.count && emitted >= rule.count) return false;
    if (occurrences.length >= HARD_CAP) return false;
    return true;
  };

  if (rule.freq === 'WEEKLY' && rule.byDay && rule.byDay.length > 0) {
    // Walk week-by-week, emitting every weekday in BYDAY.
    while (cursor.getTime() < stop.getTime() && safety++ < HARD_CAP * 7) {
      // Emit each weekday within the current week.
      const weekStart = new Date(cursor);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      for (const dow of rule.byDay) {
        const day = new Date(weekStart);
        day.setDate(weekStart.getDate() + dow);
        day.setHours(start.getHours(), start.getMinutes(), start.getSeconds(), 0);
        if (day.getTime() < start.getTime()) continue; // skip days before the series begins
        if (!push(day, occurrences.length)) return occurrences;
      }
      cursor.setDate(cursor.getDate() + 7 * rule.interval);
    }
    return occurrences;
  }

  // Plain DAILY / WEEKLY / MONTHLY without BYDAY.
  while (cursor.getTime() < stop.getTime() && safety++ < HARD_CAP) {
    if (!push(new Date(cursor), occurrences.length)) break;
    if (rule.freq === 'DAILY') cursor.setDate(cursor.getDate() + rule.interval);
    else if (rule.freq === 'WEEKLY') cursor.setDate(cursor.getDate() + 7 * rule.interval);
    else cursor.setMonth(cursor.getMonth() + rule.interval);
  }
  return occurrences;
}
