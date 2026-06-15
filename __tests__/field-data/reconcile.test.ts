// __tests__/field-data/reconcile.test.ts
//
// mobile-and-customer-query-gap Slice D1 — late-binding mobile photos to
// imported TRV points. Locks the two binding paths + the no-throw
// contract so a partial reconcile never sinks the surrounding import.

import { describe, it, expect, vi } from 'vitest';
import {
  reconcileOrphanFieldMedia,
  type NewPointRef,
} from '@/lib/field-data/reconcile';

interface UpdateChain {
  update: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  is: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
}

function makeClient(opts: {
  updateResults: Record<string, { data: { id: string }[] | null; error: { message: string } | null }>;
  orphanCount?: number;
}): {
  client: { from: ReturnType<typeof vi.fn> };
  chain: UpdateChain;
} {
  const { updateResults, orphanCount = 0 } = opts;

  const select = vi.fn();
  const is = vi.fn().mockReturnValue({ select });
  const eqPointName = vi.fn().mockReturnValue({ is });
  const eqJobId = vi.fn().mockReturnValue({ eq: eqPointName });
  const update = vi.fn().mockReturnValue({ eq: eqJobId });

  // select dispatches based on the last point_name eq'd
  select.mockImplementation((_cols: string) => {
    const pn = eqPointName.mock.lastCall?.[1] as string | undefined;
    const result = pn ? updateResults[pn] : undefined;
    return Promise.resolve(result ?? { data: [], error: null });
  });

  const orphanSelect = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      is: vi.fn().mockResolvedValue({ count: orphanCount, error: null }),
    }),
  });

  const from = vi.fn((tableName: string) => {
    if (tableName !== 'field_media') throw new Error(`unexpected table ${tableName}`);
    // First call sequence is an update; a later one is the orphan count
    // (head: true). Differentiate by checking if `update` has been
    // called more than expected so we can reuse the same `from` ref.
    return {
      update,
      select: orphanSelect,
    };
  });

  return {
    client: { from },
    chain: { update, eq: eqJobId, is, select },
  };
}

describe('reconcileOrphanFieldMedia — happy path', () => {
  it('binds orphan media by (job_id, point_name)', async () => {
    const { client } = makeClient({
      updateResults: {
        'BM-01': { data: [{ id: 'm1' }, { id: 'm2' }], error: null },
        'IR-02': { data: [{ id: 'm3' }], error: null },
      },
      orphanCount: 0,
    });
    const points: NewPointRef[] = [
      { id: 'p1', name: 'BM-01' },
      { id: 'p2', name: 'IR-02' },
    ];
    const result = await reconcileOrphanFieldMedia(client as never, {
      jobId: 'JOB-1',
      points,
    });
    expect(result.attached).toBe(3);
    expect(result.attachedByPointId).toEqual({ p1: 2, p2: 1 });
    expect(result.unmatchedOrphans).toBe(0);
  });

  it('returns zero + does not throw when no points to reconcile', async () => {
    const { client } = makeClient({ updateResults: {}, orphanCount: 4 });
    const result = await reconcileOrphanFieldMedia(client as never, {
      jobId: 'JOB-1',
      points: [],
    });
    expect(result.attached).toBe(0);
    expect(result.unmatchedOrphans).toBe(4);
  });

  it('skips points with empty name (defensive guard)', async () => {
    const { client, chain } = makeClient({
      updateResults: {
        '': { data: [{ id: 'should-not-be-called' }], error: null },
      },
    });
    await reconcileOrphanFieldMedia(client as never, {
      jobId: 'JOB-1',
      points: [{ id: 'p1', name: '' }],
    });
    expect(chain.update).not.toHaveBeenCalled();
  });
});

describe('reconcileOrphanFieldMedia — error paths', () => {
  it('continues past a per-point UPDATE error', async () => {
    const { client } = makeClient({
      updateResults: {
        'BAD': { data: null, error: { message: 'rls denied' } },
        'GOOD': { data: [{ id: 'm1' }], error: null },
      },
    });
    const result = await reconcileOrphanFieldMedia(client as never, {
      jobId: 'JOB-1',
      points: [
        { id: 'p1', name: 'BAD' },
        { id: 'p2', name: 'GOOD' },
      ],
    });
    expect(result.attached).toBe(1);
    expect(result.attachedByPointId).toEqual({ p2: 1 });
  });

  it('never throws on synchronous client failure', async () => {
    const from = vi.fn(() => {
      throw new Error('network down');
    });
    const result = await reconcileOrphanFieldMedia({ from } as never, {
      jobId: 'JOB-1',
      points: [{ id: 'p1', name: 'BM-01' }],
    });
    expect(result.attached).toBe(0);
  });
});

describe('reconcile schema — Slice D1 seed', () => {
  const fs = require('node:fs') as typeof import('node:fs');
  const path = require('node:path') as typeof import('node:path');
  const SEED = fs.readFileSync(
    path.join(__dirname, '..', '..', 'seeds', '293_field_media_point_name.sql'),
    'utf8',
  );

  it('adds the point_name column to field_media', () => {
    expect(SEED).toMatch(/ALTER TABLE field_media[\s\S]*?ADD COLUMN IF NOT EXISTS point_name TEXT/);
  });

  it('creates a partial index keyed on (job_id, point_name) for orphans only', () => {
    expect(SEED).toMatch(/idx_field_media_orphan_by_point_name/);
    expect(SEED).toMatch(/WHERE data_point_id IS NULL/);
  });
});
