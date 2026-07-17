import { describe, it, expect } from 'vitest';
import { revertedBatchIds, latestUndoableBatch, recentBatches, recentBatchDigest, orderedBatches, restorePlan, type EditHistoryRow } from '@/lib/dnd/edit-history';

// history/undo C — deciding what "undo that" means + summarizing recent changes, purely from audit rows.
const row = (over: Partial<EditHistoryRow>): EditHistoryRow => ({
  batch_id: null, source: 'ai', field_path: null, summary: null, created_at: '2026-07-16T00:00:00Z', ...over,
});

describe('revertedBatchIds', () => {
  it('collects batch ids that have a revert-batch audit row', () => {
    const rows = [
      row({ batch_id: 'b1', source: 'ai' }),
      row({ source: 'revert', field_path: 'revert-batch:b1' }),
    ];
    expect(revertedBatchIds(rows).has('b1')).toBe(true);
    expect(revertedBatchIds(rows).has('b2')).toBe(false);
  });
});

describe('latestUndoableBatch', () => {
  it('picks the newest AI batch not already reverted', () => {
    const rows = [
      row({ batch_id: 'old', source: 'ai', created_at: '2026-07-16T01:00:00Z', summary: 'gave a feat' }),
      row({ batch_id: 'new', source: 'ai', created_at: '2026-07-16T03:00:00Z', summary: 'made all-powerful' }),
    ];
    const b = latestUndoableBatch(rows)!;
    expect(b.batchId).toBe('new');
    expect(b.summary).toBe('made all-powerful');
  });

  it('skips a batch that was already undone, falling back to the previous', () => {
    const rows = [
      row({ batch_id: 'old', source: 'ai', created_at: '2026-07-16T01:00:00Z', summary: 'gave a feat' }),
      row({ batch_id: 'new', source: 'ai', created_at: '2026-07-16T03:00:00Z', summary: 'made all-powerful' }),
      row({ source: 'revert', field_path: 'revert-batch:new', created_at: '2026-07-16T04:00:00Z' }),
    ];
    expect(latestUndoableBatch(rows)!.batchId).toBe('old');
  });

  it('returns null when nothing is undoable', () => {
    expect(latestUndoableBatch([])).toBeNull();
    expect(latestUndoableBatch([row({ batch_id: 'm', source: 'manual' })])).toBeNull();
  });
});

describe('recentBatches + digest', () => {
  const rows = [
    row({ batch_id: 'b1', source: 'ai', created_at: '2026-07-16T01:00:00Z', summary: 'A' }),
    row({ batch_id: 'b1', source: 'ai', created_at: '2026-07-16T01:00:01Z', summary: 'A' }), // same batch, dupe row
    row({ batch_id: 'b2', source: 'ai', created_at: '2026-07-16T02:00:00Z', summary: 'B' }),
    row({ source: 'revert', field_path: 'revert-batch:b2', created_at: '2026-07-16T02:30:00Z' }),
    row({ batch_id: 'b3', source: 'ai', created_at: '2026-07-16T03:00:00Z', summary: 'C' }),
  ];
  it('lists distinct un-reverted AI batches newest-first', () => {
    const list = recentBatches(rows);
    expect(list.map((b) => b.batchId)).toEqual(['b3', 'b1']); // b2 excluded (reverted), b1 de-duped
  });
  it('can include reverted batches (marked)', () => {
    const list = recentBatches(rows, 8, true);
    expect(list.find((b) => b.batchId === 'b2')!.reverted).toBe(true);
  });
  it('digest is a newest-first numbered list, empty when no history', () => {
    expect(recentBatchDigest(rows)).toMatch(/RECENT CHANGES/);
    expect(recentBatchDigest(rows).indexOf('C')).toBeLessThan(recentBatchDigest(rows).indexOf('A'));
    expect(recentBatchDigest([])).toBe('');
  });
});

describe('orderedBatches + restorePlan (point-in-time restore, D1)', () => {
  const rows: EditHistoryRow[] = [
    { batch_id: 'b1', source: 'ai', field_path: null, summary: 'first', created_at: '2026-07-16T01:00:00Z' },
    { batch_id: 'b2', source: 'ai', field_path: null, summary: 'second', created_at: '2026-07-16T02:00:00Z' },
    { batch_id: 'b3', source: 'ai', field_path: null, summary: 'third', created_at: '2026-07-16T03:00:00Z' },
    { batch_id: 'b4', source: 'ai', field_path: null, summary: 'fourth', created_at: '2026-07-16T04:00:00Z' },
  ];
  it('orders distinct AI batches oldest-first', () => {
    expect(orderedBatches(rows).map((b) => b.batchId)).toEqual(['b1', 'b2', 'b3', 'b4']);
  });
  it('restoring to b2 reverts every batch after it (b3, b4)', () => {
    expect(restorePlan(rows, 'b2').batchIds).toEqual(['b3', 'b4']);
  });
  it('restoring to the latest batch reverts nothing', () => {
    expect(restorePlan(rows, 'b4').batchIds).toEqual([]);
  });
  it('skips batches already individually reverted', () => {
    const withRevert = [...rows, { batch_id: null, source: 'revert', field_path: 'revert-batch:b3', summary: null, created_at: '2026-07-16T05:00:00Z' } as EditHistoryRow];
    expect(restorePlan(withRevert, 'b1').batchIds).toEqual(['b2', 'b4']); // b3 already undone
  });
  it('unknown target → empty plan', () => {
    expect(restorePlan(rows, 'nope').batchIds).toEqual([]);
  });
});
