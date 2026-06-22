// lib/research/self-heal-sweep.ts
//
// Slice 1 of research-self-heal-slice-1-manual-sweep-2026-06-22.md.
//
// Pure reducer + per-adapter status classifier for the manual sweep
// the admin kicks off from /admin/research/self-heal. The HTTP +
// fingerprinting side-effects live in the API route; this file is
// pure so the summary math is testable without a DB or a network.

/** Outcome of probing a single adapter. The API route fills the
 *  optional details after the network call; the classifier picks the
 *  status from the inputs. */
export interface AdapterProbeInput {
  /** Network-level outcome: did we get an HTTP response at all? */
  ok: boolean;
  /** HTTP status code when the network call landed (any code). */
  http_status?: number | null;
  /** ms from request start → response end. */
  duration_ms?: number | null;
  /** Did the live page's DOM fingerprint match the canary baseline?
   *  null when the adapter has no canary yet — we can't compare. */
  fingerprint_match?: boolean | null;
  /** Error message when ok=false. */
  error?: string | null;
}

/** Status taxonomy mirrors the `research_health_status_enum` from
 *  seed 371 so the API can write classifySweepStatus(input) straight
 *  into research_adapter_health_checks.status. */
export type SweepStatus =
  | 'healthy'
  | 'degraded'
  | 'broken'
  | 'no_record'
  | 'error';

/** Pure. Classify a single probe outcome.
 *
 *  - Network failure / timeout → 'error'.
 *  - 5xx → 'broken' (the portal is offline or angry at us).
 *  - 4xx → 'degraded' (URL still answers but the page isn't what
 *    we expect — could be auth, redirect, etc.).
 *  - 2xx with fingerprint mismatch → 'degraded' (page renders but
 *    structure changed; likely cosmetic refresh, possibly real).
 *  - 2xx with no canary baseline to compare → 'no_record'.
 *  - 2xx with fingerprint match (or no fingerprint mismatch signal
 *    because we couldn't read body) → 'healthy'.
 */
export function classifySweepStatus(probe: AdapterProbeInput): SweepStatus {
  if (!probe.ok) return 'error';
  const code = probe.http_status ?? 0;
  if (code >= 500) return 'broken';
  if (code >= 400) return 'degraded';
  if (code >= 200 && code < 300) {
    if (probe.fingerprint_match === false) return 'degraded';
    if (probe.fingerprint_match === null || probe.fingerprint_match === undefined) {
      return 'no_record';
    }
    return 'healthy';
  }
  // Anything else (3xx that didn't follow, 1xx) → degraded.
  return 'degraded';
}

/** Row the dashboard renders. The API route hydrates this from
 *  the probe + adapter join. */
export interface SweepRow {
  adapter_id: string;
  county: string;
  vendor: string | null;
  site_type: string;
  base_url: string;
  status: SweepStatus;
  http_status: number | null;
  duration_ms: number | null;
  fingerprint_match: boolean | null;
  summary: string;
}

/** Summary the dashboard renders at the top of the table. */
export interface SweepSummary {
  total: number;
  healthy: number;
  degraded: number;
  broken: number;
  no_record: number;
  errored: number;
  /** Wall-clock duration of the sweep. */
  duration_ms: number;
  /** Which adapters need attention. Sorted broken → degraded →
   *  errored → no_record so the dashboard can render the head of the
   *  list as "things to look at". */
  attention: SweepRow[];
  /** Every probed adapter, in input order. */
  rows: SweepRow[];
}

const ATTENTION_RANK: Record<SweepStatus, number> = {
  broken:   1,
  degraded: 2,
  error:    3,
  no_record: 4,
  healthy:  5,
};

/** Pure. Tally + sort the per-adapter probe results. */
export function summarizeSweep(
  rows: SweepRow[],
  durationMs: number,
): SweepSummary {
  let healthy = 0, degraded = 0, broken = 0, noRecord = 0, errored = 0;
  for (const r of rows) {
    switch (r.status) {
      case 'healthy':   healthy++;   break;
      case 'degraded':  degraded++;  break;
      case 'broken':    broken++;    break;
      case 'no_record': noRecord++;  break;
      case 'error':     errored++;   break;
    }
  }
  const attention = rows
    .filter((r) => r.status !== 'healthy')
    .sort((a, b) => {
      const ra = ATTENTION_RANK[a.status] ?? 99;
      const rb = ATTENTION_RANK[b.status] ?? 99;
      return ra - rb || a.county.localeCompare(b.county);
    });
  return {
    total: rows.length,
    healthy,
    degraded,
    broken,
    no_record: noRecord,
    errored,
    duration_ms: durationMs,
    attention,
    rows,
  };
}

/** Pure. Format a one-line human summary for the dashboard hero
 *  ("12 healthy · 1 needs attention · 0 broken"). */
export function describeSweep(summary: SweepSummary): string {
  if (summary.total === 0) return 'No adapters checked.';
  if (summary.healthy === summary.total) {
    return `All ${summary.total} websites responded healthy.`;
  }
  const needsAttention =
    summary.broken + summary.degraded + summary.errored + summary.no_record;
  const parts: string[] = [];
  parts.push(`${summary.healthy} healthy`);
  if (needsAttention > 0) parts.push(`${needsAttention} need${needsAttention === 1 ? 's' : ''} attention`);
  if (summary.broken > 0)  parts.push(`${summary.broken} broken`);
  return parts.join(' · ');
}
