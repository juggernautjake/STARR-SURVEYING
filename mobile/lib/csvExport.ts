/**
 * CSV builder for timesheet exports.
 *
 * Pure function — no RN imports — so it can be unit-tested in
 * isolation and reused server-side later if we ever generate the
 * same export from the worker.
 *
 * Format chosen for max accountant-friendliness:
 *   - one row per job_time_entries row
 *   - log_date column = the daily_time_logs.log_date the entry rolls
 *     up under (local YYYY-MM-DD)
 *   - started_at / ended_at = full ISO-8601 with TZ offset so
 *     re-parsing is unambiguous
 *   - duration_minutes = integer
 *   - status = the daily_time_logs.status that wraps the entry
 *
 * RFC 4180 escaping: any value containing a comma, double-quote, or
 * newline is wrapped in double-quotes, with embedded double-quotes
 * doubled.
 */
import type { TimesheetDay, TimesheetEntry } from './timesheet';

const HEADERS = [
  'log_date',
  'job',
  'entry_type',
  'started_at',
  'ended_at',
  'duration_minutes',
  'status',
  'notes',
] as const;

export function buildTimesheetCsv(days: TimesheetDay[]): string {
  const rows: string[] = [HEADERS.join(',')];

  // Newest first matches the on-screen order; CSV consumers can
  // re-sort. Important: don't drop the header even if `days` is
  // empty so a zero-row export still has the column list.
  for (const day of days) {
    for (const entry of day.entries) {
      rows.push(buildRow(day, entry));
    }
  }

  return rows.join('\n') + '\n';
}

function buildRow(day: TimesheetDay, entry: TimesheetEntry): string {
  const cells = [
    day.date,
    entry.jobName ?? entryTypeLabel(entry.entryType),
    entry.entryType ?? '',
    entry.startedAt ?? '',
    entry.endedAt ?? '',
    entry.durationMinutes != null ? String(entry.durationMinutes) : '',
    day.status ?? '',
    // notes column intentionally last so multi-line notes don't
    // confuse readers who look at the first few columns
    '',
  ];
  return cells.map(escapeCell).join(',');
}

function entryTypeLabel(type: string | null | undefined): string {
  switch (type) {
    case 'on_site':
      return 'On site';
    case 'travel':
      return 'Travel';
    case 'office':
      return 'Office';
    case 'overhead':
      return 'Overhead';
    default:
      return '';
  }
}

function escapeCell(value: string): string {
  // RFC 4180: wrap in quotes if the value contains a separator,
  // quote, or newline. Inside the wrap, double the quotes.
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Suggested filename for the export. Caller passes to share.ts.
 *
 * Format: `starr-field-timesheet-{userPart}-{from}_to_{to}.csv`
 *   userPart : email-safe portion before @
 *   from/to  : YYYY-MM-DD bounds of the export window
 */
export function suggestedCsvFilename(
  userEmail: string | null | undefined,
  from: string,
  to: string
): string {
  const userPart = (userEmail ?? 'me').split('@')[0].replace(/[^a-z0-9_-]/gi, '');
  return `starr-field-timesheet-${userPart}-${from}_to_${to}.csv`;
}
