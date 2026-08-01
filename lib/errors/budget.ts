// lib/errors/budget.ts — is anything on fire, and would anyone know? (E1-3)
//
// The analysis: *"`/admin/error-log` exists; is anyone looking at it, and does anything alert?"* The
// viewer was real and the answer to both was no — errors were recorded faithfully into `error_reports`
// and then waited to be visited.
//
// ── A BUDGET, NOT A THRESHOLD ──────────────────────────────────────────────────────────────────────
//
// "Alert when errors > N" is the shape that gets muted. A small app throws a handful of errors a week
// from bots hitting dead URLs, and an alarm that fires on those is an alarm somebody turns off in month
// two — after which nothing works and everything looks fine.
//
// So this reports a BUDGET: how many errors in the window, how many of them are unresolved, and how that
// compares to the same window before it. **The signal that matters is the CHANGE.** Forty errors a week,
// steady, is a known quantity. Forty this week against six last week is a deploy that broke something,
// and it is the only one of the two worth interrupting anyone for.
//
// Pure and total: no I/O, no clock. `asOf` is passed in.

export interface ErrorRow {
  id: string;
  created_at: string;
  severity: string | null;
  /** Set when someone has marked it dealt with. */
  resolved_at?: string | null;
  route_path?: string | null;
  api_endpoint?: string | null;
  error_message?: string | null;
}

/** Severities that mean "a person should look", as opposed to noise. */
export const LOUD_SEVERITIES = new Set(['critical', 'high', 'error', 'fatal']);

export interface Budget {
  windowDays: number;
  total: number;
  unresolved: number;
  loud: number;
  /** The same-length window immediately before this one. */
  previousTotal: number;
  /** `total - previousTotal`. Positive is worse. */
  change: number;
  /** True when the change is big enough to be a signal rather than noise. */
  spiking: boolean;
  /** The routes producing the most errors, worst first. */
  topRoutes: Array<{ route: string; count: number }>;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A spike is RELATIVE and has a floor.
 *
 * Relative, because doubling from three to six is noise and doubling from forty to eighty is an
 * incident. And a floor, because going from zero to two errors is an infinite proportional increase and
 * means nothing at all — without it, the quietest possible week produces the loudest possible alarm.
 */
export const SPIKE_FLOOR = 5;
export const SPIKE_RATIO = 2;

export function errorBudget(
  rows: readonly ErrorRow[],
  opts: { asOf: number; windowDays?: number },
): Budget {
  const windowDays = opts.windowDays ?? 7;
  const since = opts.asOf - windowDays * DAY_MS;
  const previousSince = since - windowDays * DAY_MS;

  const at = (r: ErrorRow) => Date.parse(r.created_at);
  const current = rows.filter((r) => { const t = at(r); return Number.isFinite(t) && t >= since; });
  const previous = rows.filter((r) => { const t = at(r); return Number.isFinite(t) && t >= previousSince && t < since; });

  const counts = new Map<string, number>();
  for (const r of current) {
    // Grouped by ROUTE rather than by message: ten different stack traces from one broken endpoint are
    // one problem, and a list keyed on the message would show them as ten.
    const key = r.api_endpoint || r.route_path || '(unknown)';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const total = current.length;
  const previousTotal = previous.length;

  return {
    windowDays,
    total,
    unresolved: current.filter((r) => !r.resolved_at).length,
    loud: current.filter((r) => LOUD_SEVERITIES.has((r.severity ?? '').toLowerCase())).length,
    previousTotal,
    change: total - previousTotal,
    spiking: total >= SPIKE_FLOOR && total >= Math.max(1, previousTotal) * SPIKE_RATIO,
    topRoutes: [...counts.entries()]
      .map(([route, count]) => ({ route, count }))
      .sort((a, b) => b.count - a.count || a.route.localeCompare(b.route))
      .slice(0, 5),
  };
}

/** One sentence, written so that the quiet case is genuinely reassuring rather than merely silent. */
export function describeBudget(b: Budget): string {
  if (b.total === 0) return `No errors recorded in the last ${b.windowDays} days.`;
  const direction = b.change === 0 ? 'the same as' : b.change > 0 ? `up ${b.change} on` : `down ${-b.change} on`;
  const spike = b.spiking ? ' — that is a jump worth looking at today.' : '';
  return `${b.total} error${b.total === 1 ? '' : 's'} in the last ${b.windowDays} days `
    + `(${b.unresolved} unresolved), ${direction} the ${b.windowDays} before${spike}`;
}
