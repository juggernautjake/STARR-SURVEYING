// lib/research/self-heal-planner.ts
//
// §9.6 of
// docs/planning/in-progress/RESEARCH_SOFTWARE_OPTIMIZATION_2026-06-21.md.
//
// "When a live extraction fails mid-project, quarantine the adapter
// (status=quarantined), run §9.4 immediately, and surface 'we're
// repairing <county> — your run will retry' rather than failing
// silently."
//
// This pure planner takes the failure event + the adapter's current
// state + recent health-check rows and returns the full coordinated
// response: do we quarantine, do we trigger an immediate diagnose
// pass, what do we tell the user, and what's the retry policy.
//
// The route handler that executes the plan calls into:
//   - research_site_adapters (status update — §7.3)
//   - research_adapter_health_checks (the failure-triggered run — §9.3)
//   - the §9.4 agent (via the queue planned here)
// All of which are real-world side effects. The plan itself is
// pure → testable, previewable on the §9.8 dashboard, and replayable
// in the audit trail.

import type { CanaryDiff } from './canary-diff';

/** Subset of `research_site_adapters` the planner reads. */
export interface AdapterStateForHealing {
  id: string;
  status:
    | 'draft' | 'active' | 'degraded' | 'broken' | 'quarantined' | 'retired';
  /** ISO timestamp; null when never. */
  last_verified_at: string | null;
  /** Friendly county name + access surface — used to build the
   *  user-facing message ("we're repairing Bell County clerk
   *  records"). */
  county_name?: string;
  site_type_label?: string;
}

/** The trigger event from the live pipeline. */
export interface LiveExtractionFailure {
  /** What the adapter run returned (when it returned anything). */
  canary_diff?: CanaryDiff | null;
  /** Free-form error message, e.g. "HTTP 503" or "selector
   *  #propertyId not found". The planner reads this for keyword
   *  triggers (captcha, rate-limit, auth) that escalate the
   *  user-facing message. */
  error_message?: string | null;
  /** When did the failure happen. */
  occurred_at: string;
}

/** Recent health-check rollup the planner uses to detect chronic
 *  vs. transient failures. */
export interface RecentHealthCheck {
  ran_at: string;
  status: 'healthy' | 'degraded' | 'broken' | 'no_record' | 'error';
}

export interface SelfHealOptions {
  /** Look-back window for "recent" health checks. Default 7 days. */
  recentWindowHours?: number;
  /** Number of consecutive broken/error checks within the window
   *  that escalates the response from "single failure → diagnose"
   *  to "chronic failure → suggest manual review". Default 3. */
  chronicFailureCount?: number;
  /** When true (the §9.7 schedule flag is on), the planner trusts
   *  the scheduled cadence to also run the diagnose pass instead
   *  of triggering an immediate one. Lets the user dial back I/O
   *  pressure on county portals during a known outage. */
  scheduledChecksRunning?: boolean;
}

export type RetryStrategy =
  | 'after_immediate_check'  // wait for the just-queued check, then retry
  | 'after_review'           // a human must approve the §9.4 proposal first
  | 'manual';                // don't retry; user has to re-kick

export interface SelfHealPlan {
  /** Update research_site_adapters.status to this value (when not
   *  null). null = leave status as-is. */
  quarantine_to: 'quarantined' | null;
  /** Write a failure-triggered row into
   *  research_adapter_health_checks now. */
  log_failure_check: boolean;
  /** Trigger the §9.4 diagnose-and-repair agent now (vs. trust the
   *  next scheduled tick). */
  trigger_immediate_diagnose: boolean;
  retry: RetryStrategy;
  /** Plain-text message to surface to the user. Already includes
   *  the county / site-type label when available. */
  user_message: string;
  /** Why the planner picked these actions. Stamps into the audit
   *  trail row. */
  rationale: string;
  /** Escalation flag — when true the route handler should ALSO
   *  notify ops via the existing alert pipeline (chronic failures
   *  + auth/captcha walls deserve a human). */
  escalate_to_ops: boolean;
}

/** Pure. Plan the self-heal response for one failure event. */
export function planSelfHealResponse(
  failure: LiveExtractionFailure,
  adapter: AdapterStateForHealing,
  recent: RecentHealthCheck[] = [],
  opts: SelfHealOptions = {},
): SelfHealPlan {
  const windowHours = opts.recentWindowHours ?? 168;
  const chronicCount = opts.chronicFailureCount ?? 3;
  const scheduledRunning = !!opts.scheduledChecksRunning;

  // 1. Already in a healing state? Don't re-quarantine; do still
  //    log the failure so the health-check history reflects every
  //    real-world hit.
  if (adapter.status === 'quarantined' || adapter.status === 'broken') {
    return {
      quarantine_to: null,
      log_failure_check: true,
      trigger_immediate_diagnose: !scheduledRunning,
      retry: 'after_review',
      user_message: friendly(adapter, 'continued failure'),
      rationale: `adapter already in ${adapter.status}; logging the failure but not re-quarantining`,
      escalate_to_ops: chronicFailureDetected(recent, chronicCount, windowHours, failure.occurred_at),
    };
  }

  // 2. Retired / draft adapters shouldn't reach the live pipeline;
  //    if they did, that's a bug — log + alert ops but don't
  //    change state.
  if (adapter.status === 'retired' || adapter.status === 'draft') {
    return {
      quarantine_to: null,
      log_failure_check: true,
      trigger_immediate_diagnose: false,
      retry: 'manual',
      user_message: friendly(adapter, 'adapter not active'),
      rationale: `adapter is ${adapter.status}; live pipeline shouldn't have used it`,
      escalate_to_ops: true,
    };
  }

  // 3. Active / degraded — this is the standard self-heal trigger.
  //    Quarantine + queue diagnose + tell the user we're working on
  //    it. Walls (captcha, auth, rate limit) escalate to ops on the
  //    first hit because they need a human to clear.
  const errorMsg = (failure.error_message ?? '').toLowerCase();
  const wallHit = /(captcha|rate.?limit|429|401|403|auth)/i.test(errorMsg);
  const chronic = chronicFailureDetected(recent, chronicCount, windowHours, failure.occurred_at);

  return {
    quarantine_to: 'quarantined',
    log_failure_check: true,
    trigger_immediate_diagnose: !scheduledRunning,
    retry: wallHit || chronic ? 'after_review' : 'after_immediate_check',
    user_message: friendly(adapter, wallHit
      ? 'portal protection (captcha / auth)'
      : chronic ? 'repeated failures' : 'temporary failure'),
    rationale: wallHit
      ? 'portal returned captcha/auth/rate-limit signal; routing to human review'
      : chronic
        ? `${recent.filter((r) => r.status === 'broken' || r.status === 'error').length} broken/error checks in the last ${windowHours}h → chronic`
        : 'first failure on a healthy adapter; standard quarantine + diagnose',
    escalate_to_ops: wallHit || chronic,
  };
}

// ── Internals ────────────────────────────────────────────────────

function friendly(adapter: AdapterStateForHealing, reason: string): string {
  const subject = [adapter.county_name, adapter.site_type_label]
    .filter(Boolean)
    .join(' ')
    .trim();
  const where = subject ? ` for ${subject}` : '';
  switch (reason) {
    case 'continued failure':
      return `We're still repairing the data source${where}. Your run will retry once a fix is approved.`;
    case 'adapter not active':
      return `The data source${where} isn't active. Reach out to support — we'll re-enable it.`;
    case 'portal protection (captcha / auth)':
      return `The county portal${where} is showing a captcha or login wall. We've paused the run and flagged ops to clear it.`;
    case 'repeated failures':
      return `The data source${where} has been failing repeatedly. Routing to human review; we'll let you know when it's fixed.`;
    case 'temporary failure':
    default:
      return `We hit a temporary issue with the data source${where}. We're repairing it now and will retry your run automatically.`;
  }
}

function chronicFailureDetected(
  recent: RecentHealthCheck[],
  threshold: number,
  windowHours: number,
  now: string,
): boolean {
  if (recent.length === 0) return false;
  const nowMs = Date.parse(now);
  if (Number.isNaN(nowMs)) return false;
  const cutoff = nowMs - windowHours * 3_600_000;
  let bad = 0;
  for (const r of recent) {
    const t = Date.parse(r.ran_at);
    if (Number.isNaN(t) || t < cutoff) continue;
    if (r.status === 'broken' || r.status === 'error') bad += 1;
  }
  return bad >= threshold;
}
