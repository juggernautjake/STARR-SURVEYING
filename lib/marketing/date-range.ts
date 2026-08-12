// lib/marketing/date-range.ts — the period an advertising view is showing.
//
// Owner, 2026-08-11:
//   *"I want the advertising analysis elements to show all of the results … for the current month by
//   default, and it should switch on the first of the month to the new month every month."*
//   *"I also want the user … to be able to change the time frame to review any month, or even the
//   current full year or past years. We should also be able to narrow it down to weeks and even
//   individual days."*
//
// ── WHY THE CLOCK IS AN ARGUMENT ────────────────────────────────────────────────────────────────
//
// Every function here takes `now`. That is the whole reason "it should switch on the first of the
// month" is testable at all: a module that reads `new Date()` internally can only be tested on the
// day you happen to run the suite, and the rollover — the one behaviour the owner explicitly asked
// for — is exactly the case you cannot reach.
//
// It also rules out the failure this is most likely to have: a range computed once at module scope
// is frozen at the moment the server started. A long-running instance would then serve last month
// for weeks, and nothing would look broken — the page renders, the numbers are real, they are just
// answering a question nobody asked.
//
// ── LOCAL DATES, NOT UTC ────────────────────────────────────────────────────────────────────────
//
// "This month" means the month it is where the person is standing. Using UTC would put a Texas user
// into next month for the last six hours of every day, so on the 31st at 7pm they would be shown an
// empty "next month" and reasonably conclude the dashboard was broken. All boundaries are computed
// in local time and formatted as `YYYY-MM-DD`, which is what the APIs already take.

export type Granularity = 'hour' | 'day' | 'week' | 'month';

export type PresetId =
  | 'today'
  | 'yesterday'
  | 'this-week'
  | 'last-week'
  | 'this-month'
  | 'last-month'
  | 'this-year'
  | 'last-year'
  | 'custom';

export interface DateRange {
  /** Inclusive start, `YYYY-MM-DD` local. */
  from: string;
  /** Inclusive end, `YYYY-MM-DD` local. */
  to: string;
  /** Which preset produced it, or 'custom'. */
  preset: PresetId;
  /** Human label for the header — "August 2026", "Week of 4 Aug", "2026". */
  label: string;
}

/** The default. Named rather than inlined so "what does the page open on?" has one answer. */
export const DEFAULT_PRESET: PresetId = 'this-month';

// ── Formatting ──────────────────────────────────────────────────────────────────────────────────

/** `YYYY-MM-DD` in LOCAL time. `toISOString()` would convert to UTC and shift the date. */
export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Parse `YYYY-MM-DD` as a LOCAL date. `new Date('2026-08-01')` parses as UTC midnight, which is the
 *  previous day in every western timezone — the classic off-by-one in this exact kind of code. */
export function fromIsoDate(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// ── Boundaries ──────────────────────────────────────────────────────────────────────────────────

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
/** Day 0 of the NEXT month is the last day of this one — correct for February and leap years
 *  without a table. */
const endOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0);

/** Weeks start Monday. A business looking at "this week" means the working week, and a Sunday start
 *  splits every Monday-to-Friday campaign across two buckets. */
function startOfWeek(d: Date): Date {
  const s = startOfDay(d);
  const dow = (s.getDay() + 6) % 7; // Mon=0 … Sun=6
  return addDays(s, -dow);
}

// ── Presets ─────────────────────────────────────────────────────────────────────────────────────

/**
 * Resolve a preset against a clock.
 *
 * `custom` has no meaning without explicit dates, so it falls back to the default rather than
 * returning something empty — a preset that resolves to nothing renders as "no data", which is
 * indistinguishable from a real empty month.
 */
export function resolvePreset(preset: PresetId, now: Date): DateRange {
  switch (preset) {
    case 'today': {
      const iso = toIsoDate(now);
      return { from: iso, to: iso, preset, label: 'Today' };
    }
    case 'yesterday': {
      const y = addDays(now, -1);
      const iso = toIsoDate(y);
      return { from: iso, to: iso, preset, label: 'Yesterday' };
    }
    case 'this-week': {
      const s = startOfWeek(now);
      return {
        from: toIsoDate(s), to: toIsoDate(addDays(s, 6)), preset,
        label: `Week of ${s.getDate()} ${MONTHS[s.getMonth()].slice(0, 3)}`,
      };
    }
    case 'last-week': {
      const s = addDays(startOfWeek(now), -7);
      return {
        from: toIsoDate(s), to: toIsoDate(addDays(s, 6)), preset,
        label: `Week of ${s.getDate()} ${MONTHS[s.getMonth()].slice(0, 3)}`,
      };
    }
    case 'last-month': {
      const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return {
        from: toIsoDate(s), to: toIsoDate(endOfMonth(s)), preset,
        label: `${MONTHS[s.getMonth()]} ${s.getFullYear()}`,
      };
    }
    case 'this-year': {
      const s = new Date(now.getFullYear(), 0, 1);
      return {
        from: toIsoDate(s), to: toIsoDate(new Date(now.getFullYear(), 11, 31)), preset,
        label: String(now.getFullYear()),
      };
    }
    case 'last-year': {
      const y = now.getFullYear() - 1;
      return {
        from: toIsoDate(new Date(y, 0, 1)), to: toIsoDate(new Date(y, 11, 31)), preset,
        label: String(y),
      };
    }
    case 'this-month':
    case 'custom':
    default: {
      const s = startOfMonth(now);
      return {
        from: toIsoDate(s), to: toIsoDate(endOfMonth(s)), preset: 'this-month',
        label: `${MONTHS[s.getMonth()]} ${s.getFullYear()}`,
      };
    }
  }
}

/** A specific month, for the month/year pickers. `month` is 1-12. */
export function monthRange(year: number, month: number): DateRange {
  const s = new Date(year, month - 1, 1);
  return {
    from: toIsoDate(s), to: toIsoDate(endOfMonth(s)), preset: 'custom',
    label: `${MONTHS[s.getMonth()]} ${year}`,
  };
}

/** A whole year. */
export function yearRange(year: number): DateRange {
  return {
    from: toIsoDate(new Date(year, 0, 1)), to: toIsoDate(new Date(year, 11, 31)),
    preset: 'custom', label: String(year),
  };
}

/** An explicit from/to. Reversed inputs are swapped rather than rejected: somebody picking the end
 *  date first is not making an error worth an error message. */
export function customRange(from: string, to: string): DateRange | null {
  const a = fromIsoDate(from);
  const b = fromIsoDate(to);
  if (!a || !b) return null;
  const [lo, hi] = a <= b ? [a, b] : [b, a];
  return {
    from: toIsoDate(lo), to: toIsoDate(hi), preset: 'custom',
    label: `${toIsoDate(lo)} → ${toIsoDate(hi)}`,
  };
}

// ── Granularity ─────────────────────────────────────────────────────────────────────────────────

/**
 * How to bucket a chart over this range.
 *
 * A year plotted per-day is 365 unreadable bars; a single day plotted per-day is one. The caller
 * must also SAY which bucket it used — an unlabelled axis is how a monthly total gets read as a
 * daily one, which is the kind of misreading that changes what somebody spends.
 */
export function granularityFor(range: DateRange): Granularity {
  const a = fromIsoDate(range.from);
  const b = fromIsoDate(range.to);
  if (!a || !b) return 'day';
  const days = Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1;
  if (days <= 1) return 'hour';
  if (days <= 62) return 'day';
  if (days <= 190) return 'week';
  return 'month';
}

export function granularityLabel(g: Granularity): string {
  return { hour: 'by hour', day: 'by day', week: 'by week', month: 'by month' }[g];
}

// ── URL round-trip ──────────────────────────────────────────────────────────────────────────────
//
// The range lives in the URL so a reload keeps it and "look at last March" is a link somebody sends
// rather than four words of instructions.

/** Read a range out of URL params. Anything unparseable falls back to the default, so a hand-edited
 *  or truncated link lands on a useful page instead of an empty one. */
export function rangeFromParams(
  params: { get(key: string): string | null },
  now: Date,
): DateRange {
  const preset = params.get('preset');
  const from = params.get('from');
  const to = params.get('to');

  if (preset === 'custom' && from && to) {
    return customRange(from, to) ?? resolvePreset(DEFAULT_PRESET, now);
  }
  const known: PresetId[] = [
    'today', 'yesterday', 'this-week', 'last-week',
    'this-month', 'last-month', 'this-year', 'last-year',
  ];
  if (preset && (known as string[]).includes(preset)) {
    return resolvePreset(preset as PresetId, now);
  }
  // No preset but explicit dates — a link built by hand, or by an older version of this page.
  if (from && to) return customRange(from, to) ?? resolvePreset(DEFAULT_PRESET, now);
  return resolvePreset(DEFAULT_PRESET, now);
}

/**
 * Serialise a range for the URL.
 *
 * A preset is stored by NAME, not by the dates it resolved to. That is what keeps the owner's
 * rollover working: a bookmark of `?preset=this-month` shows September in September, whereas
 * `?from=2026-08-01&to=2026-08-31` would pin that bookmark to August for ever. Custom ranges are
 * the opposite — they mean specific dates and are stored as such.
 *
 * The default preset serialises to nothing, so the clean URL is the common case.
 */
export function rangeToParams(range: DateRange): Record<string, string> {
  if (range.preset === 'custom') {
    return { preset: 'custom', from: range.from, to: range.to };
  }
  if (range.preset === DEFAULT_PRESET) return {};
  return { preset: range.preset };
}

/** `?preset=…` query string (without the `?`), or '' for the default. */
export function rangeToQuery(range: DateRange): string {
  const params = rangeToParams(range);
  const entries = Object.entries(params);
  return entries.length === 0
    ? ''
    : entries.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
}

/** The presets offered in the UI, in the order they are shown. */
export const PRESET_OPTIONS: Array<{ id: PresetId; label: string }> = [
  { id: 'this-month', label: 'This month' },
  { id: 'last-month', label: 'Last month' },
  { id: 'this-week', label: 'This week' },
  { id: 'last-week', label: 'Last week' },
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'this-year', label: 'This year' },
  { id: 'last-year', label: 'Last year' },
];
