// __tests__/research/self-heal-planner.test.ts
//
// §9.6 tests for slice 16.

import { describe, it, expect } from 'vitest';
import {
  planSelfHealResponse,
  type AdapterStateForHealing,
  type LiveExtractionFailure,
  type RecentHealthCheck,
} from '@/lib/research/self-heal-planner';

const NOW = '2026-06-21T12:00:00Z';

const failure = (overrides: Partial<LiveExtractionFailure> = {}): LiveExtractionFailure => ({
  occurred_at: NOW,
  ...overrides,
});

const adapter = (overrides: Partial<AdapterStateForHealing> = {}): AdapterStateForHealing => ({
  id: 'A1',
  status: 'active',
  last_verified_at: '2026-06-20T12:00:00Z',
  county_name: 'Bell',
  site_type_label: 'clerk records',
  ...overrides,
});

function hoursAgo(h: number): string {
  return new Date(Date.parse(NOW) - h * 3_600_000).toISOString();
}

describe('planSelfHealResponse — active adapter, single failure', () => {
  it('quarantines + queues a diagnose + tells the user we are working on it', () => {
    const plan = planSelfHealResponse(failure(), adapter(), []);
    expect(plan.quarantine_to).toBe('quarantined');
    expect(plan.log_failure_check).toBe(true);
    expect(plan.trigger_immediate_diagnose).toBe(true);
    expect(plan.retry).toBe('after_immediate_check');
    expect(plan.escalate_to_ops).toBe(false);
    expect(plan.user_message).toMatch(/Bell clerk records/);
    expect(plan.user_message).toMatch(/temporary/i);
  });

  it('trusts the scheduled tick when scheduledChecksRunning=true', () => {
    const plan = planSelfHealResponse(failure(), adapter(), [], { scheduledChecksRunning: true });
    expect(plan.trigger_immediate_diagnose).toBe(false);
    // Still quarantines so subsequent runs don't pick up a busted adapter.
    expect(plan.quarantine_to).toBe('quarantined');
  });
});

describe('planSelfHealResponse — portal protection (wall)', () => {
  it('escalates + routes to human review when the error mentions captcha', () => {
    const plan = planSelfHealResponse(
      failure({ error_message: 'page returned captcha challenge' }),
      adapter(),
    );
    expect(plan.retry).toBe('after_review');
    expect(plan.escalate_to_ops).toBe(true);
    expect(plan.user_message).toMatch(/captcha/i);
    expect(plan.rationale).toMatch(/captcha/);
  });

  it('escalates on auth / rate-limit / 401 / 403 / 429 signals', () => {
    for (const errMsg of ['HTTP 401 Unauthorized', 'HTTP 403 Forbidden', 'HTTP 429 Too Many Requests', 'auth required']) {
      const plan = planSelfHealResponse(failure({ error_message: errMsg }), adapter());
      expect(plan.escalate_to_ops).toBe(true);
      expect(plan.retry).toBe('after_review');
    }
  });
});

describe('planSelfHealResponse — chronic failures', () => {
  it('routes to human review when 3+ broken/error checks happened in the last 7 days', () => {
    const recent: RecentHealthCheck[] = [
      { ran_at: hoursAgo(12),  status: 'broken' },
      { ran_at: hoursAgo(36),  status: 'error' },
      { ran_at: hoursAgo(72),  status: 'broken' },
    ];
    const plan = planSelfHealResponse(failure(), adapter(), recent);
    expect(plan.retry).toBe('after_review');
    expect(plan.escalate_to_ops).toBe(true);
    expect(plan.rationale).toMatch(/chronic/);
    expect(plan.user_message).toMatch(/repeatedly/i);
  });

  it('ignores broken checks older than the window', () => {
    const recent: RecentHealthCheck[] = [
      { ran_at: hoursAgo(200), status: 'broken' },
      { ran_at: hoursAgo(300), status: 'broken' },
      { ran_at: hoursAgo(400), status: 'broken' },
    ];
    const plan = planSelfHealResponse(failure(), adapter(), recent, { recentWindowHours: 168 });
    // None within 7 days → not chronic → standard quarantine path.
    expect(plan.retry).toBe('after_immediate_check');
    expect(plan.escalate_to_ops).toBe(false);
  });

  it('respects a custom chronicFailureCount', () => {
    const recent: RecentHealthCheck[] = [
      { ran_at: hoursAgo(12), status: 'broken' },
    ];
    const plan = planSelfHealResponse(failure(), adapter(), recent, { chronicFailureCount: 1 });
    expect(plan.retry).toBe('after_review');
  });
});

describe('planSelfHealResponse — already-failing adapter', () => {
  it('does NOT re-quarantine when adapter is already quarantined', () => {
    const plan = planSelfHealResponse(failure(), adapter({ status: 'quarantined' }), []);
    expect(plan.quarantine_to).toBeNull();
    expect(plan.log_failure_check).toBe(true);
    expect(plan.retry).toBe('after_review');
  });

  it('handles broken adapter the same way (no re-quarantine, log + diagnose)', () => {
    const plan = planSelfHealResponse(failure(), adapter({ status: 'broken' }), []);
    expect(plan.quarantine_to).toBeNull();
    expect(plan.rationale).toMatch(/already in broken/);
  });
});

describe('planSelfHealResponse — retired / draft adapter', () => {
  it('flags retired adapters in the pipeline as an ops issue', () => {
    const plan = planSelfHealResponse(failure(), adapter({ status: 'retired' }), []);
    expect(plan.quarantine_to).toBeNull();
    expect(plan.trigger_immediate_diagnose).toBe(false);
    expect(plan.retry).toBe('manual');
    expect(plan.escalate_to_ops).toBe(true);
    expect(plan.rationale).toMatch(/live pipeline shouldn't/);
  });

  it('flags draft adapters in the pipeline as an ops issue', () => {
    const plan = planSelfHealResponse(failure(), adapter({ status: 'draft' }), []);
    expect(plan.escalate_to_ops).toBe(true);
    expect(plan.retry).toBe('manual');
  });
});

describe('planSelfHealResponse — friendly message composition', () => {
  it('omits the "for X" suffix when adapter has no county/site labels', () => {
    const plan = planSelfHealResponse(
      failure(),
      adapter({ county_name: undefined, site_type_label: undefined }),
    );
    expect(plan.user_message).not.toMatch(/ for /);
  });

  it('always tells the user retry behavior matches the retry strategy', () => {
    const a = planSelfHealResponse(failure(), adapter(), []);
    expect(a.user_message).toMatch(/retry/i);
  });
});
