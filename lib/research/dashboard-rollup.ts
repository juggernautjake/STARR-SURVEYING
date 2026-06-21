// lib/research/dashboard-rollup.ts
//
// §9.8 (data layer) of
// docs/planning/in-progress/RESEARCH_SOFTWARE_OPTIMIZATION_2026-06-21.md.
//
// Pure aggregator. Takes raw rows from the seed-371 health tables
// (research_adapter_health_checks, research_adapter_change_proposals)
// + the seed-370 adapter rows and returns the shape the §9.8 health
// dashboard table renders: one entry per (county × site_type) with
// effective status, last-checked timestamp, pending-review count,
// and a confidence band the customer-facing "is my county working"
// view can show as a green/yellow/red light.
//
// Pure → previewable on the dashboard, reusable from the cron
// reporting endpoint, testable with frozen inputs.

export type HealthStatus =
  | 'healthy' | 'degraded' | 'broken' | 'no_record' | 'error';

/** Subset of `research_site_adapters` the rollup reads. */
export interface AdapterRowForDashboard {
  id: string;
  county_id: string;
  county_name?: string;
  county_fips?: string;
  metro_tier?: number | null;
  site_type:
    | 'appraisal_cad' | 'clerk_deeds' | 'plat_records' | 'gis_parcels'
    | 'legal_description' | 'flood_fema' | 'survey_glo' | 'misc';
  status:
    | 'draft' | 'active' | 'degraded' | 'broken' | 'quarantined' | 'retired';
  vendor_key?: string | null;
  base_url: string;
  last_verified_at: string | null;
}

/** Subset of `research_adapter_health_checks`. */
export interface HealthCheckRow {
  id: string;
  adapter_id: string;
  ran_at: string;
  status: HealthStatus;
  diff_summary: string | null;
}

/** Subset of `research_adapter_change_proposals`. */
export interface PendingProposalRow {
  id: string;
  adapter_id: string;
  confidence: number;
  rationale: string;
  created_at: string;
  status: 'proposed' | 'approved' | 'rejected' | 'applied' | 'superseded';
}

/** One row in the dashboard rollup — what the §9.8 table renders. */
export interface DashboardEntry {
  adapter_id: string;
  county_id: string;
  county_name?: string;
  county_fips?: string;
  metro_tier?: number | null;
  site_type: AdapterRowForDashboard['site_type'];
  vendor_key?: string | null;
  base_url: string;

  /** The customer-facing "green/yellow/red" verdict — separate from
   *  the row-level `adapter.status` field so the dashboard can
   *  reflect the LIVE health-check verdict instead of a stale
   *  cached `status`. */
  effective_status: HealthStatus;
  /** ISO timestamp of the most recent check. null when there's
   *  never been a check. */
  last_checked_at: string | null;
  /** Hours between `last_checked_at` and `now`. */
  hours_since_last_check: number | null;
  /** Most recent diff summary string ("broken: 2 missing
   *  (owner.display_name, legal.text)"). Surfaces in the hover
   *  detail. */
  last_diff_summary: string | null;
  /** Count of `proposed`-status change proposals awaiting human
   *  review. Drives the §9.8 "Pending repair proposals" column. */
  pending_proposal_count: number;
  /** Highest confidence of any pending proposal — lets the
   *  dashboard surface "we have a 95%-confident fix waiting for
   *  you" prominently. */
  best_pending_confidence: number | null;
  /** Confidence band the customer-facing view uses for the green/
   *  yellow/red light. Distinct from `effective_status` because a
   *  one-time failure shouldn't flip the light when the prior
   *  history was clean. */
  confidence_band: 'green' | 'yellow' | 'red' | 'unknown';
  /** Composite priority score the dashboard sorts by — broken
   *  adapters with proposals waiting bubble to the top. */
  priority: number;
}

export interface RollupOptions {
  /** Look-back window for "recent" checks that drive
   *  `effective_status`. Default 168 hours (7 days). */
  recentWindowHours?: number;
  /** Number of consecutive failures within the window that pulls
   *  the confidence band from yellow to red. Default 3. */
  redBandFailureCount?: number;
}

/** Pure. Roll the inputs into a dashboard-ready entry per adapter. */
export function rollupAdapterDashboard(
  adapters: AdapterRowForDashboard[],
  recentChecks: HealthCheckRow[],
  pendingProposals: PendingProposalRow[],
  now: Date,
  opts: RollupOptions = {},
): DashboardEntry[] {
  const windowHours = opts.recentWindowHours ?? 168;
  const redCount = opts.redBandFailureCount ?? 3;
  const windowMs = windowHours * 3_600_000;
  const cutoff = now.getTime() - windowMs;

  // Group inputs by adapter_id for O(N) rollup.
  const checksByAdapter = groupBy(recentChecks, (c) => c.adapter_id);
  const proposalsByAdapter = groupBy(
    pendingProposals.filter((p) => p.status === 'proposed'),
    (p) => p.adapter_id,
  );

  const out: DashboardEntry[] = [];
  for (const a of adapters) {
    const checks = (checksByAdapter.get(a.id) ?? [])
      .filter((c) => Date.parse(c.ran_at) >= cutoff)
      .sort((x, y) => Date.parse(y.ran_at) - Date.parse(x.ran_at));
    const proposals = proposalsByAdapter.get(a.id) ?? [];

    const last = checks[0] ?? null;
    const effectiveStatus = pickEffectiveStatus(checks, a.status);
    const lastCheckedAt = last?.ran_at ?? a.last_verified_at ?? null;
    const hoursSince = lastCheckedAt
      ? (now.getTime() - Date.parse(lastCheckedAt)) / 3_600_000
      : null;

    const failureRun = consecutiveFailures(checks);
    const confidenceBand = pickConfidenceBand(effectiveStatus, failureRun, redCount, checks.length);
    const pendingProposalCount = proposals.length;
    const bestPendingConfidence = proposals.length > 0
      ? Math.max(...proposals.map((p) => clamp01(p.confidence)))
      : null;

    const priority = pickPriority(effectiveStatus, pendingProposalCount, hoursSince);

    out.push({
      adapter_id: a.id,
      county_id: a.county_id,
      county_name: a.county_name,
      county_fips: a.county_fips,
      metro_tier: a.metro_tier ?? null,
      site_type: a.site_type,
      vendor_key: a.vendor_key ?? null,
      base_url: a.base_url,
      effective_status: effectiveStatus,
      last_checked_at: lastCheckedAt,
      hours_since_last_check: hoursSince,
      last_diff_summary: last?.diff_summary ?? null,
      pending_proposal_count: pendingProposalCount,
      best_pending_confidence: bestPendingConfidence,
      confidence_band: confidenceBand,
      priority,
    });
  }

  out.sort((x, y) => y.priority - x.priority);
  return out;
}

// ── Internals ────────────────────────────────────────────────────

function groupBy<T, K>(items: readonly T[], key: (item: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = m.get(k);
    if (list) list.push(item); else m.set(k, [item]);
  }
  return m;
}

/** The customer cares about the LIVE verdict, not a stale cached
 *  status. Prefer the most-recent check; fall back to the adapter
 *  row's `status` if there are no recent checks (newly-registered
 *  adapter). */
function pickEffectiveStatus(
  checks: HealthCheckRow[],
  rowStatus: AdapterRowForDashboard['status'],
): HealthStatus {
  if (checks.length === 0) {
    if (rowStatus === 'broken' || rowStatus === 'quarantined') return 'broken';
    if (rowStatus === 'degraded') return 'degraded';
    return 'no_record';
  }
  return checks[0]!.status;
}

function consecutiveFailures(checks: HealthCheckRow[]): number {
  let n = 0;
  for (const c of checks) {
    if (c.status === 'broken' || c.status === 'error') n += 1;
    else break;
  }
  return n;
}

function pickConfidenceBand(
  effective: HealthStatus,
  failureRun: number,
  redCount: number,
  totalChecks: number,
): DashboardEntry['confidence_band'] {
  if (effective === 'no_record') return 'unknown';
  if (effective === 'broken' || effective === 'error') {
    return failureRun >= redCount ? 'red' : 'yellow';
  }
  if (effective === 'degraded') return totalChecks > 1 ? 'yellow' : 'green';
  return 'green';
}

function pickPriority(
  effective: HealthStatus,
  pendingProposalCount: number,
  hoursSinceLastCheck: number | null,
): number {
  // Broken + has pending proposal → highest (reviewer can fix it
  // RIGHT NOW). Broken without proposal → next. Degraded → after.
  // Healthy → low. `no_record` falls in the middle (someone needs
  // to seed a canary).
  const statusWeight: Record<HealthStatus, number> = {
    broken: 1000,
    error: 1000,
    degraded: 200,
    no_record: 100,
    healthy: 10,
  };
  let p = statusWeight[effective];
  if (pendingProposalCount > 0) p += 500;
  // Stale checks deserve a nudge — the dashboard should highlight
  // adapters that haven't been verified in a while.
  if (hoursSinceLastCheck === null) p += 50;
  else if (hoursSinceLastCheck > 168) p += 25;
  return p;
}

function clamp01(n: number): number {
  if (Number.isNaN(n) || n < 0) return 0;
  if (n > 1) return 1;
  return n;
}
