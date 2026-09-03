import { describe, it, expect, vi } from 'vitest';
import { toRunHealthCheck, persistRunOutcomes, type RunSourceOutcome } from '../infra/health-persistence.js';

// ── PLAN B*5b — RELIABILITY FROM REAL RUNS ─────────────────────────────────────────────────────
//
// "A run that got 0 documents from a 200-OK portal is the strongest breakage signal there is,
// and it is thrown away." It is now recorded — as `no_record`, which is visible and which never
// quarantines a county on its own, because a tract with no recorded deeds looks identical from
// here. Two real-run `error`s do flip the adapter; one real-run `healthy` clears it.

const base = (outcome: RunSourceOutcome['outcome'], detail = 'x'): RunSourceOutcome => ({
  siteId: 'cad-48027-bis', vendor: 'bis', name: 'Bell CAD eSearch', url: 'https://esearch.bellcad.org',
  outcome, detail, durationMs: 12, projectId: 'p1',
});

describe('toRunHealthCheck maps a run outcome onto the registry vocabulary', () => {
  it('found → healthy, empty → no_record, unreachable/error → error', () => {
    expect(toRunHealthCheck('a', base('found')).status).toBe('healthy');
    expect(toRunHealthCheck('a', base('empty')).status).toBe('no_record');
    expect(toRunHealthCheck('a', base('unreachable')).status).toBe('error');
    expect(toRunHealthCheck('a', base('error')).status).toBe('error');
  });

  it('is labelled as coming from a run, names the site, and keeps the project it came from', () => {
    const row = toRunHealthCheck('adapter-1', base('empty', 'answered 200 with nothing'), '2026-09-03T00:00:00Z');
    expect(row).toMatchObject({
      adapter_id: 'adapter-1', triggered_by: 'run', ran_at: '2026-09-03T00:00:00Z',
      diff_summary: 'Bell CAD eSearch (research run): answered 200 with nothing',
      error_message: null, duration_ms: 12,
    });
    expect(row.layer_results).toMatchObject({ run: { outcome: 'empty', project_id: 'p1' }, probe: { site_id: 'cad-48027-bis' } });
    expect(toRunHealthCheck('a', base('unreachable', 'fetch failed')).error_message).toBe('fetch failed');
  });
});

// A fake Supabase with just enough surface for persistHealthRows: inserts are kept, the
// "last N statuses" read answers from them, and adapter status updates are captured.
function fakeDb(adapterStatus: string) {
  const checks: Array<{ adapter_id: string; status: string; ran_at: string }> = [];
  const updates: Array<Record<string, unknown>> = [];
  const supabase = {
    from: (t: string) => ({
      insert: async (r: { adapter_id: string; status: string; ran_at: string }) => { if (t === 'research_adapter_health_checks') checks.push(r); return { error: null }; },
      update: (r: Record<string, unknown>) => ({ eq: async () => { if (t === 'research_site_adapters') updates.push(r); return { error: null }; } }),
      select: () => ({ eq: () => ({ order: () => ({ limit: async (n: number) => ({ data: [...checks].reverse().slice(0, n).map((c) => ({ status: c.status })) }) }) }) }),
    }),
  };
  const resolve = async () => ({ id: 'adapter-1', status: adapterStatus });
  return { supabase, checks, updates, resolve };
}

vi.mock('../services/pipeline.js', () => ({ getSupabase: vi.fn() }));
import { getSupabase } from '../services/pipeline.js';

describe('persistRunOutcomes applies the registry ratchet to real-run evidence', () => {
  it('a 200-with-nothing is recorded and does NOT quarantine the county, however many times', async () => {
    const db = fakeDb('active');
    vi.mocked(getSupabase).mockResolvedValue(db.supabase as never);
    for (let i = 0; i < 3; i++) await persistRunOutcomes([base('empty')], db.resolve);
    expect(db.checks.map((c) => c.status)).toEqual(['no_record', 'no_record', 'no_record']);
    expect(db.updates.some((u) => u.status === 'broken')).toBe(false);
  });

  it('two consecutive unreachable runs mark the adapter broken', async () => {
    const db = fakeDb('active');
    vi.mocked(getSupabase).mockResolvedValue(db.supabase as never);
    const first = await persistRunOutcomes([base('unreachable')], db.resolve);
    expect(first.statusChanges).toEqual([]);
    const second = await persistRunOutcomes([base('unreachable')], db.resolve);
    expect(second.statusChanges).toEqual([{ adapterId: 'adapter-1', from: 'active', to: 'broken' }]);
  });

  it('one real-run success clears a broken adapter', async () => {
    const db = fakeDb('broken');
    vi.mocked(getSupabase).mockResolvedValue(db.supabase as never);
    const r = await persistRunOutcomes([base('found')], db.resolve);
    expect(r.statusChanges).toEqual([{ adapterId: 'adapter-1', from: 'broken', to: 'active' }]);
  });

  it('a source with no registry row is reported as unmatched, not resolved to the wrong one', async () => {
    const db = fakeDb('active');
    vi.mocked(getSupabase).mockResolvedValue(db.supabase as never);
    const r = await persistRunOutcomes([base('found')], async () => null);
    expect(r.unmatched).toEqual(['cad-48027-bis']);
    expect(r.written).toBe(0);
  });
});
