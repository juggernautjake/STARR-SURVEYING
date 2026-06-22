// lib/research/health-check-scheduler.ts
//
// §9.7 (kernel) of
// docs/planning/completed/RESEARCH_SOFTWARE_OPTIMIZATION_2026-06-21.md.
//
// Pure decision function: given the list of registered adapters,
// their last-verified timestamps, and the active scheduling policy,
// return the subset that should run a health check NOW. The cron
// (or DO worker, or manual button on the dashboard) is just a
// wrapper that fetches the inputs + executes the returned plan.
//
// Kept separate from the cron so:
//   - the scheduling decision is testable in isolation with frozen
//     time inputs
//   - the §9.8 dashboard can preview "what would the next run
//     check?" without actually executing
//   - the per-host concurrency cap (§9.9 guardrail) can be reasoned
//     about without spinning up real I/O
//
// Pure — no DB, no network, no Date.now() at module scope (the
// caller passes `now`).

/** Subset of `research_site_adapters` the scheduler reads. */
export interface SchedulableAdapter {
  id: string;
  base_url: string;
  /** From the `research_adapter_status_enum` in seed 370. */
  status:
    | 'draft' | 'active' | 'degraded' | 'broken' | 'quarantined' | 'retired';
  /** ISO timestamp; null when the adapter has never been checked. */
  last_verified_at: string | null;
  /** 1..4 from `research_counties.metro_tier`, looked up via the
   *  adapter's county FK. The scheduler treats null as tier 4
   *  (most relaxed cadence) so an unscored county never gets
   *  hammered. */
  metro_tier: number | null;
}

export interface SchedulerPolicy {
  /** Cadence in hours per metro tier. Tier 1 (top metros) is
   *  checked daily; tier 4 (rural) is bi-weekly. Lower tier
   *  numbers = more aggressive cadence per the §9.7 spec. */
  cadence_hours_by_tier: Record<1 | 2 | 3 | 4, number>;
  /** Maximum number of adapters scheduled per host in one batch.
   *  §9.9 guardrail — don't hammer the same county portal with
   *  parallel checks. */
  per_host_concurrency_cap: number;
  /** Maximum total adapters scheduled in one batch (budget cap so
   *  a single tick can't accidentally enqueue every adapter at
   *  once). */
  batch_cap: number;
  /** Random-jitter window in seconds added to every "next due"
   *  calculation so a thundering herd of adapters that landed on
   *  the same minute don't fire simultaneously. */
  jitter_seconds: number;
  /** Skip these statuses entirely. */
  skip_statuses: ReadonlySet<SchedulableAdapter['status']>;
}

/** Defaults that match the spec: review-required, conservative.
 *  Numbers correspond to the metro tiers seeded in slice 14. */
export const DEFAULT_SCHEDULER_POLICY: SchedulerPolicy = {
  cadence_hours_by_tier: {
    1: 24,   // daily
    2: 84,   // ~twice-weekly (3.5 days)
    3: 168,  // weekly
    4: 336,  // bi-weekly
  },
  per_host_concurrency_cap: 2,
  batch_cap: 50,
  jitter_seconds: 600,
  skip_statuses: new Set(['draft', 'retired']),
};

export interface ScheduledCheck {
  adapter_id: string;
  /** Why we picked this adapter (for the §9.8 dashboard preview
   *  and the audit trail). */
  reason: 'never_checked' | 'tier_due' | 'failed_priority';
  /** Hours since the adapter was last verified — null when never
   *  checked. Helps surface "this adapter has been stale for 9
   *  days" in the dashboard. */
  hours_since_last: number | null;
  /** Cadence we matched against (hours). */
  cadence_hours: number;
}

export interface PlanResult {
  scheduled: ScheduledCheck[];
  /** Adapters that were eligible but bumped out by the per-host or
   *  per-batch caps. The cron should pick these up on the next
   *  tick. */
  deferred: Array<{ adapter_id: string; reason: 'host_cap' | 'batch_cap' }>;
  /** Adapters skipped because of status (draft/retired). */
  skipped: Array<{ adapter_id: string; reason: 'status' | 'not_yet_due' }>;
}

/** Pure. Decide which adapters need a check at `now`. */
export function planScheduledChecks(
  adapters: SchedulableAdapter[],
  now: Date,
  policy: SchedulerPolicy = DEFAULT_SCHEDULER_POLICY,
): PlanResult {
  const scheduled: ScheduledCheck[] = [];
  const deferred: PlanResult['deferred'] = [];
  const skipped: PlanResult['skipped'] = [];

  // Score every adapter — eligible ones get a priority sort key,
  // ineligible ones land in `skipped`.
  type Eligible = ScheduledCheck & { host: string; priority: number };
  const eligible: Eligible[] = [];

  for (const a of adapters) {
    if (policy.skip_statuses.has(a.status)) {
      skipped.push({ adapter_id: a.id, reason: 'status' });
      continue;
    }

    const tier = (a.metro_tier ?? 4) as 1 | 2 | 3 | 4;
    const cadenceHours = policy.cadence_hours_by_tier[tier] ?? policy.cadence_hours_by_tier[4];

    // Failure-triggered self-heal (§9.6) priority — broken or
    // quarantined adapters jump the queue regardless of cadence.
    if (a.status === 'broken' || a.status === 'quarantined') {
      eligible.push({
        adapter_id: a.id,
        reason: 'failed_priority',
        hours_since_last: hoursSince(a.last_verified_at, now),
        cadence_hours: cadenceHours,
        host: hostOf(a.base_url),
        priority: 1000, // beats every cadence-driven entry
      });
      continue;
    }

    const hoursSinceLast = hoursSince(a.last_verified_at, now);
    if (hoursSinceLast === null) {
      eligible.push({
        adapter_id: a.id,
        reason: 'never_checked',
        hours_since_last: null,
        cadence_hours: cadenceHours,
        host: hostOf(a.base_url),
        priority: 500, // beats cadence-only, loses to failed
      });
      continue;
    }

    // Cadence check, with jitter applied symmetrically so we don't
    // bias toward early firing.
    const jitterHours = policy.jitter_seconds / 3600;
    if (hoursSinceLast >= cadenceHours - jitterHours / 2) {
      eligible.push({
        adapter_id: a.id,
        reason: 'tier_due',
        hours_since_last: hoursSinceLast,
        cadence_hours: cadenceHours,
        host: hostOf(a.base_url),
        // Adapters that are MORE overdue rank higher so we drain
        // the backlog first.
        priority: 100 + (hoursSinceLast - cadenceHours),
      });
    } else {
      skipped.push({ adapter_id: a.id, reason: 'not_yet_due' });
    }
  }

  // Sort eligible high-priority-first; ties broken by adapter_id
  // for determinism.
  eligible.sort((a, b) => (b.priority - a.priority) || a.adapter_id.localeCompare(b.adapter_id));

  // Apply per-host concurrency cap + batch cap.
  const hostCounts = new Map<string, number>();
  for (const e of eligible) {
    if (scheduled.length >= policy.batch_cap) {
      deferred.push({ adapter_id: e.adapter_id, reason: 'batch_cap' });
      continue;
    }
    const used = hostCounts.get(e.host) ?? 0;
    if (used >= policy.per_host_concurrency_cap) {
      deferred.push({ adapter_id: e.adapter_id, reason: 'host_cap' });
      continue;
    }
    hostCounts.set(e.host, used + 1);
    scheduled.push({
      adapter_id: e.adapter_id,
      reason: e.reason,
      hours_since_last: e.hours_since_last,
      cadence_hours: e.cadence_hours,
    });
  }

  return { scheduled, deferred, skipped };
}

// ── Internals ────────────────────────────────────────────────────

function hoursSince(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return (now.getTime() - t) / 3_600_000;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}
