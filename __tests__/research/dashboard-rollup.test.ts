// __tests__/research/dashboard-rollup.test.ts
//
// §9.8 (data layer) tests for slice 17.

import { describe, it, expect } from 'vitest';
import {
  rollupAdapterDashboard,
  type AdapterRowForDashboard,
  type HealthCheckRow,
  type PendingProposalRow,
} from '@/lib/research/dashboard-rollup';

const NOW = new Date('2026-06-21T12:00:00Z');

const hoursAgo = (h: number) =>
  new Date(NOW.getTime() - h * 3_600_000).toISOString();

const adapter = (overrides: Partial<AdapterRowForDashboard> = {}): AdapterRowForDashboard => ({
  id: 'a1',
  county_id: 'c1',
  county_name: 'Bell',
  county_fips: '48027',
  metro_tier: 2,
  site_type: 'clerk_deeds',
  status: 'active',
  vendor_key: 'publicsearch_clerk',
  base_url: 'https://bell.publicsearch.us/x',
  last_verified_at: hoursAgo(2),
  ...overrides,
});

const check = (overrides: Partial<HealthCheckRow> = {}): HealthCheckRow => ({
  id: 'h1',
  adapter_id: 'a1',
  ran_at: hoursAgo(2),
  status: 'healthy',
  diff_summary: 'healthy',
  ...overrides,
});

const proposal = (overrides: Partial<PendingProposalRow> = {}): PendingProposalRow => ({
  id: 'p1',
  adapter_id: 'a1',
  confidence: 0.9,
  rationale: 'AI proposed an updated selector',
  created_at: hoursAgo(1),
  status: 'proposed',
  ...overrides,
});

describe('rollupAdapterDashboard — effective_status', () => {
  it('uses the most-recent check status when checks exist', () => {
    const out = rollupAdapterDashboard(
      [adapter()],
      [check({ status: 'broken', ran_at: hoursAgo(1) }), check({ status: 'healthy', ran_at: hoursAgo(48) })],
      [],
      NOW,
    );
    expect(out[0]!.effective_status).toBe('broken');
  });

  it('falls back to no_record when there are no recent checks', () => {
    const out = rollupAdapterDashboard([adapter({ status: 'active', last_verified_at: null })], [], [], NOW);
    expect(out[0]!.effective_status).toBe('no_record');
    expect(out[0]!.confidence_band).toBe('unknown');
  });

  it('reflects broken/quarantined row status when no checks exist', () => {
    const out = rollupAdapterDashboard(
      [adapter({ status: 'quarantined', last_verified_at: null })],
      [],
      [],
      NOW,
    );
    expect(out[0]!.effective_status).toBe('broken');
  });
});

describe('rollupAdapterDashboard — confidence_band', () => {
  it('healthy when the most-recent check passed', () => {
    const out = rollupAdapterDashboard([adapter()], [check()], [], NOW);
    expect(out[0]!.confidence_band).toBe('green');
  });

  it('yellow on a single failure', () => {
    const out = rollupAdapterDashboard(
      [adapter()],
      [check({ status: 'broken' }), check({ status: 'healthy', ran_at: hoursAgo(48) })],
      [],
      NOW,
    );
    expect(out[0]!.confidence_band).toBe('yellow');
  });

  it('red after 3 consecutive failures', () => {
    const out = rollupAdapterDashboard(
      [adapter()],
      [
        check({ status: 'broken', ran_at: hoursAgo(1) }),
        check({ status: 'broken', ran_at: hoursAgo(25) }),
        check({ status: 'error',  ran_at: hoursAgo(49) }),
      ],
      [],
      NOW,
    );
    expect(out[0]!.confidence_band).toBe('red');
  });

  it('respects a custom redBandFailureCount', () => {
    const out = rollupAdapterDashboard(
      [adapter()],
      [check({ status: 'broken' })],
      [],
      NOW,
      { redBandFailureCount: 1 },
    );
    expect(out[0]!.confidence_band).toBe('red');
  });
});

describe('rollupAdapterDashboard — pending proposals', () => {
  it('counts only proposed-status proposals', () => {
    const out = rollupAdapterDashboard(
      [adapter()],
      [check()],
      [
        proposal({ status: 'proposed' }),
        proposal({ id: 'p2', status: 'applied' }),
        proposal({ id: 'p3', status: 'rejected' }),
      ],
      NOW,
    );
    expect(out[0]!.pending_proposal_count).toBe(1);
  });

  it('reports the highest pending confidence', () => {
    const out = rollupAdapterDashboard(
      [adapter()],
      [check()],
      [
        proposal({ confidence: 0.6 }),
        proposal({ id: 'p2', confidence: 0.95 }),
        proposal({ id: 'p3', confidence: 0.8 }),
      ],
      NOW,
    );
    expect(out[0]!.best_pending_confidence).toBe(0.95);
  });

  it('clamps confidence into [0,1] before reporting', () => {
    const out = rollupAdapterDashboard(
      [adapter()],
      [check()],
      [proposal({ confidence: 1.5 })],
      NOW,
    );
    expect(out[0]!.best_pending_confidence).toBe(1);
  });

  it('reports null best_pending_confidence when there are no proposed proposals', () => {
    const out = rollupAdapterDashboard([adapter()], [check()], [], NOW);
    expect(out[0]!.best_pending_confidence).toBeNull();
  });
});

describe('rollupAdapterDashboard — window filtering', () => {
  it('drops checks older than recentWindowHours', () => {
    const out = rollupAdapterDashboard(
      [adapter()],
      [check({ status: 'broken', ran_at: hoursAgo(300) })],
      [],
      NOW,
      { recentWindowHours: 168 },
    );
    expect(out[0]!.effective_status).toBe('no_record');
  });

  it('keeps checks inside the window', () => {
    const out = rollupAdapterDashboard(
      [adapter()],
      [check({ status: 'broken', ran_at: hoursAgo(24) })],
      [],
      NOW,
      { recentWindowHours: 168 },
    );
    expect(out[0]!.effective_status).toBe('broken');
  });
});

describe('rollupAdapterDashboard — priority sort', () => {
  it('broken-with-proposals beats broken-without beats degraded beats healthy', () => {
    const out = rollupAdapterDashboard(
      [
        adapter({ id: 'healthy', base_url: 'https://h.com' }),
        adapter({ id: 'degraded', base_url: 'https://d.com' }),
        adapter({ id: 'broken_no_proposal', base_url: 'https://b1.com' }),
        adapter({ id: 'broken_with_proposal', base_url: 'https://b2.com' }),
      ],
      [
        check({ adapter_id: 'healthy', status: 'healthy' }),
        check({ adapter_id: 'degraded', status: 'degraded' }),
        check({ adapter_id: 'broken_no_proposal', status: 'broken' }),
        check({ adapter_id: 'broken_with_proposal', status: 'broken' }),
      ],
      [proposal({ adapter_id: 'broken_with_proposal' })],
      NOW,
    );
    expect(out.map((e) => e.adapter_id)).toEqual([
      'broken_with_proposal',
      'broken_no_proposal',
      'degraded',
      'healthy',
    ]);
  });

  it('promotes never-checked adapters above merely-healthy ones', () => {
    const out = rollupAdapterDashboard(
      [
        adapter({ id: 'healthy',  base_url: 'https://h.com' }),
        adapter({ id: 'untested', base_url: 'https://u.com', last_verified_at: null }),
      ],
      [check({ adapter_id: 'healthy', status: 'healthy' })],
      [],
      NOW,
    );
    expect(out.map((e) => e.adapter_id)).toEqual(['untested', 'healthy']);
  });
});

describe('rollupAdapterDashboard — passthrough fields', () => {
  it('preserves county, FIPS, tier, vendor, base_url, site_type on every row', () => {
    const [e] = rollupAdapterDashboard([adapter()], [check()], [], NOW);
    expect(e!.county_name).toBe('Bell');
    expect(e!.county_fips).toBe('48027');
    expect(e!.metro_tier).toBe(2);
    expect(e!.vendor_key).toBe('publicsearch_clerk');
    expect(e!.base_url).toBe('https://bell.publicsearch.us/x');
    expect(e!.site_type).toBe('clerk_deeds');
  });

  it('reports hours_since_last_check from the most-recent check (or last_verified_at)', () => {
    const out = rollupAdapterDashboard(
      [adapter({ last_verified_at: hoursAgo(48) })],
      [check({ ran_at: hoursAgo(3) })],
      [],
      NOW,
    );
    expect(out[0]!.hours_since_last_check).toBeCloseTo(3, 1);
  });
});
