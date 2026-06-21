// __tests__/research/health-check-scheduler.test.ts
//
// §9.7 kernel tests. Frozen `now` everywhere so the assertions are
// deterministic.

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SCHEDULER_POLICY,
  planScheduledChecks,
  type SchedulableAdapter,
} from '@/lib/research/health-check-scheduler';

const NOW = new Date('2026-06-21T12:00:00Z');

function hoursAgo(h: number): string {
  return new Date(NOW.getTime() - h * 3_600_000).toISOString();
}

const adapter = (overrides: Partial<SchedulableAdapter>): SchedulableAdapter => ({
  id: 'a-default',
  base_url: 'https://example.com/portal',
  status: 'active',
  last_verified_at: hoursAgo(48),
  metro_tier: 2,
  ...overrides,
});

describe('planScheduledChecks — cadence', () => {
  it('schedules tier-1 adapter ≥24h since last check', () => {
    const result = planScheduledChecks(
      [adapter({ id: 'A1', metro_tier: 1, last_verified_at: hoursAgo(25) })],
      NOW,
    );
    expect(result.scheduled.map((s) => s.adapter_id)).toEqual(['A1']);
    expect(result.scheduled[0]!.reason).toBe('tier_due');
    expect(result.scheduled[0]!.cadence_hours).toBe(24);
  });

  it('does NOT schedule a tier-1 adapter checked 1h ago', () => {
    const result = planScheduledChecks(
      [adapter({ id: 'A1', metro_tier: 1, last_verified_at: hoursAgo(1) })],
      NOW,
    );
    expect(result.scheduled).toEqual([]);
    expect(result.skipped.map((s) => s.reason)).toEqual(['not_yet_due']);
  });

  it('honours tier-4 bi-weekly cadence (336h)', () => {
    const result = planScheduledChecks(
      [adapter({ id: 'A1', metro_tier: 4, last_verified_at: hoursAgo(300) })],
      NOW,
    );
    expect(result.scheduled).toEqual([]); // not yet due
    const result2 = planScheduledChecks(
      [adapter({ id: 'A1', metro_tier: 4, last_verified_at: hoursAgo(337) })],
      NOW,
    );
    expect(result2.scheduled.map((s) => s.adapter_id)).toEqual(['A1']);
  });

  it('treats null metro_tier as tier 4 (most relaxed)', () => {
    const result = planScheduledChecks(
      [adapter({ id: 'A1', metro_tier: null, last_verified_at: hoursAgo(48) })],
      NOW,
    );
    expect(result.scheduled).toEqual([]);
  });

  it('flags never-checked adapters with reason=never_checked', () => {
    const result = planScheduledChecks(
      [adapter({ id: 'A1', last_verified_at: null })],
      NOW,
    );
    expect(result.scheduled[0]!.reason).toBe('never_checked');
    expect(result.scheduled[0]!.hours_since_last).toBeNull();
  });
});

describe('planScheduledChecks — failure priority', () => {
  it('broken adapters jump every healthy/due adapter', () => {
    const result = planScheduledChecks(
      [
        adapter({ id: 'overdue', metro_tier: 1, last_verified_at: hoursAgo(48) }),
        adapter({ id: 'broken',  status: 'broken', last_verified_at: hoursAgo(48) }),
      ],
      NOW,
    );
    expect(result.scheduled.map((s) => s.adapter_id)).toEqual(['broken', 'overdue']);
    expect(result.scheduled[0]!.reason).toBe('failed_priority');
  });

  it('quarantined adapters also jump the queue', () => {
    const result = planScheduledChecks(
      [adapter({ id: 'Q', status: 'quarantined', last_verified_at: hoursAgo(2) })],
      NOW,
    );
    expect(result.scheduled.map((s) => s.adapter_id)).toEqual(['Q']);
  });

  it('skips draft + retired adapters', () => {
    const result = planScheduledChecks(
      [
        adapter({ id: 'D', status: 'draft' }),
        adapter({ id: 'R', status: 'retired' }),
        adapter({ id: 'A', status: 'active', last_verified_at: hoursAgo(99) }),
      ],
      NOW,
    );
    expect(result.scheduled.map((s) => s.adapter_id)).toEqual(['A']);
    expect(result.skipped.find((s) => s.adapter_id === 'D')?.reason).toBe('status');
    expect(result.skipped.find((s) => s.adapter_id === 'R')?.reason).toBe('status');
  });
});

describe('planScheduledChecks — caps', () => {
  it('per_host_concurrency_cap defers extra adapters on the same host', () => {
    const sameHost = (id: string): SchedulableAdapter =>
      adapter({ id, base_url: 'https://bell.publicsearch.us/x', last_verified_at: null });
    const result = planScheduledChecks(
      [sameHost('A1'), sameHost('A2'), sameHost('A3')],
      NOW,
      { ...DEFAULT_SCHEDULER_POLICY, per_host_concurrency_cap: 2 },
    );
    expect(result.scheduled.map((s) => s.adapter_id)).toEqual(['A1', 'A2']);
    expect(result.deferred.map((d) => d.adapter_id)).toEqual(['A3']);
    expect(result.deferred[0]!.reason).toBe('host_cap');
  });

  it('batch_cap defers excess regardless of host', () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      adapter({
        id: `A${i}`,
        base_url: `https://county-${i}.example.com/p`,
        last_verified_at: null,
      }),
    );
    const result = planScheduledChecks(many, NOW, {
      ...DEFAULT_SCHEDULER_POLICY,
      batch_cap: 3,
    });
    expect(result.scheduled).toHaveLength(3);
    expect(result.deferred).toHaveLength(7);
    expect(result.deferred[0]!.reason).toBe('batch_cap');
  });
});

describe('planScheduledChecks — priority + determinism', () => {
  it('within the same priority bucket, more-overdue adapters come first', () => {
    const result = planScheduledChecks(
      [
        adapter({ id: 'A', metro_tier: 2, last_verified_at: hoursAgo(100) }),
        adapter({ id: 'B', metro_tier: 2, last_verified_at: hoursAgo(200) }),
      ],
      NOW,
    );
    expect(result.scheduled.map((s) => s.adapter_id)).toEqual(['B', 'A']);
  });

  it('ties broken by adapter_id alphabetical for deterministic order', () => {
    const result = planScheduledChecks(
      [
        adapter({ id: 'Z-id', last_verified_at: null }),
        adapter({ id: 'A-id', last_verified_at: null }),
      ],
      NOW,
    );
    expect(result.scheduled.map((s) => s.adapter_id)).toEqual(['A-id', 'Z-id']);
  });
});

describe('planScheduledChecks — DEFAULT_SCHEDULER_POLICY locked invariants', () => {
  it('cadence is strictly increasing tier 1 → tier 4', () => {
    const c = DEFAULT_SCHEDULER_POLICY.cadence_hours_by_tier;
    expect(c[1]).toBeLessThan(c[2]);
    expect(c[2]).toBeLessThan(c[3]);
    expect(c[3]).toBeLessThan(c[4]);
  });

  it('draft + retired are skipped by default (no surprise registration-time fires)', () => {
    expect(DEFAULT_SCHEDULER_POLICY.skip_statuses.has('draft')).toBe(true);
    expect(DEFAULT_SCHEDULER_POLICY.skip_statuses.has('retired')).toBe(true);
  });

  it('per_host_concurrency_cap is conservative (≤3)', () => {
    expect(DEFAULT_SCHEDULER_POLICY.per_host_concurrency_cap).toBeLessThanOrEqual(3);
  });
});
