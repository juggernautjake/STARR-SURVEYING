/**
 * The rows one mobile clock-out becomes — pure, with no React Native imports, so it is unit-tested
 * from the repo root (__tests__/hours/mobile-hours-outbox.test.ts). Sent by lib/hoursOutbox.ts.
 */

export interface OutboxEntry {
  log_date: string;
  work_type: string;
  hours: number;
  job_id: string | null;
  description: string;
  notes: string;
  client_submission_id: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `YYYY-MM-DD` on the phone's own calendar (not UTC — after ~7pm in Texas UTC is tomorrow). */
export function localDateOf(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Split a shift at each local midnight so every row is one real day (and none exceeds 24h). */
export function splitByLocalDay(startMs: number, endMs: number): Array<{ date: string; hours: number }> {
  const out: Array<{ date: string; hours: number }> = [];
  let cursor = startMs;
  while (cursor < endMs) {
    const d = new Date(cursor);
    const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
    const end = Math.min(next, endMs);
    const hours = round2((end - cursor) / 3_600_000);
    if (hours > 0) out.push({ date: localDateOf(cursor), hours });
    cursor = end;
  }
  return out;
}

/** The rows one mobile clock-out produces. Pure — unit-tested. */
export function buildMobileEntries(input: {
  entryId: string;
  startedAt: string;
  endedAt: string;
  jobId: string | null;
  entryTypeLabel?: string | null;
}): OutboxEntry[] {
  const start = Date.parse(input.startedAt);
  const end = Date.parse(input.endedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];
  const segments = splitByLocalDay(start, end);
  const total = segments.reduce((s, x) => s + x.hours, 0);
  const notes = total > 14
    ? `⚠ ${round2(total)}h on the clock (clocked in ${new Date(start).toLocaleString()}). Possibly a missed clock-out — please check before approving.`
    : '';
  return segments.map((seg, i) => ({
    log_date: seg.date,
    work_type: 'general',
    hours: seg.hours,
    job_id: input.jobId && UUID.test(input.jobId) ? input.jobId : null,
    description: `Clock-out entry from mobile app${input.entryTypeLabel ? ` (${input.entryTypeLabel})` : ''}`,
    notes,
    client_submission_id: `mobile:${input.entryId}:${i}`,
  }));
}

