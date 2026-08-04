// FINANCE_TAX_AND_INTAKE Slice F4 — a stack of receipts, uploaded without losing one.
//
// The extraction pipeline is already per-receipt and reused untouched, so "bulk" needs no new API.
// What it needs is the part that is easy to get wrong: the queue, the progress, and the failure
// handling. Two failure modes, and the second is worse:
//
//   1. Promise.all rejects on the first failure and the caller has no idea which of the other
//      nineteen landed;
//   2. the error is swallowed so the batch "succeeds" — nineteen filed, one gone, green tick over
//      the lot. Nobody re-photographs a receipt they were told was uploaded.

import { describe, it, expect, vi } from 'vitest';
import {
  buildBatch, runBatch, progressOf, retryableItems, batchSummary, rejectionReason,
  MAX_RECEIPT_BYTES, type BatchItem,
} from '@/lib/finance/receipt-batch';

const f = (name: string, size = 1000, type = 'image/jpeg') => ({ name, size, type });

describe('files are screened before anything is uploaded', () => {
  it('accepts photos and PDFs', () => {
    expect(rejectionReason(f('a.jpg'))).toBeNull();
    expect(rejectionReason(f('a.pdf', 1000, 'application/pdf'))).toBeNull();
  });

  it('refuses a file over the limit, naming its size', () => {
    expect(rejectionReason(f('big.jpg', MAX_RECEIPT_BYTES + 1))).toMatch(/over the 12 MB limit/);
  });

  it('refuses an empty file and a wrong type', () => {
    expect(rejectionReason(f('x.jpg', 0))).toMatch(/empty/i);
    expect(rejectionReason(f('sheet.xlsx', 100, 'application/vnd.ms-excel'))).toMatch(/photos and PDFs/i);
  });

  it('keeps rejected files IN the list rather than dropping them', () => {
    // A file that vanishes between the picker and the list is indistinguishable from one the person
    // forgot to select — so they never re-add it.
    const items = buildBatch([f('ok.jpg'), f('huge.jpg', MAX_RECEIPT_BYTES + 1)]);
    expect(items).toHaveLength(2);
    expect(items[1].status).toBe('rejected');
    expect(items[1].error).toBeTruthy();
  });
});

describe('one bad photo does not sink the batch', () => {
  it('keeps going after a failure and finishes the rest', async () => {
    // The first failure mode, pinned. Item 2 failing must not decide the fate of items 3-5.
    const items = buildBatch([f('1.jpg'), f('2.jpg'), f('3.jpg'), f('4.jpg'), f('5.jpg')]);
    const upload = vi.fn(async (i: number) => {
      if (i === 1) throw new Error('Network timed out');
      return { receiptId: `r${i}` };
    });
    const p = await runBatch(items, upload);
    expect(p.finished).toBe(true);
    expect(p.succeeded).toBe(4);
    expect(p.failed).toBe(1);
    expect(upload).toHaveBeenCalledTimes(5);
  });

  it('never reports a batch with failures as a success', async () => {
    // The second, worse failure mode. allSucceeded is deliberately a different question from
    // finished, because conflating them is how nineteen-of-twenty gets a green tick.
    const p = await runBatch(buildBatch([f('1.jpg'), f('2.jpg')]), async (i) => {
      if (i === 0) throw new Error('nope');
      return {};
    });
    expect(p.finished).toBe(true);
    expect(p.allSucceeded).toBe(false);
  });

  it('names WHICH item failed and why', async () => {
    // "3 uploads failed" does not tell you which three, and a person cannot re-photograph an
    // unnamed receipt.
    const p = await runBatch(buildBatch([f('lumber.jpg'), f('fuel.jpg')]), async (i) => {
      if (i === 1) throw new Error('Storage rejected the file');
      return {};
    });
    const failed = p.items.find((x) => x.status === 'failed');
    expect(failed?.fileName).toBe('fuel.jpg');
    expect(failed?.error).toBe('Storage rejected the file');
  });

  it('does not attempt an upload for a rejected file', async () => {
    const upload = vi.fn(async () => ({}));
    await runBatch(buildBatch([f('huge.jpg', MAX_RECEIPT_BYTES + 1), f('ok.jpg')]), upload);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(upload).toHaveBeenCalledWith(1);
  });

  it('never throws, whatever the uploader does', async () => {
    await expect(runBatch(buildBatch([f('1.jpg')]), async () => { throw new Error('boom'); }))
      .resolves.toBeTruthy();
    // Including a non-Error rejection, which is what a thrown string gives you.
    const p = await runBatch(buildBatch([f('1.jpg')]), async () => { throw 'plain string'; });
    expect(p.items[0].error).toBe('plain string');
  });
});

describe('progress is reported as it happens', () => {
  it('reports before, during and after each item', async () => {
    const seen: Array<{ settled: number; uploading: number }> = [];
    await runBatch(buildBatch([f('1.jpg'), f('2.jpg')]), async () => ({}), (p) => {
      seen.push({ settled: p.settled, uploading: p.items.filter((i) => i.status === 'uploading').length });
    });
    // At some point exactly one item is in flight — that is what makes "4 of 20" mean four are
    // actually filed rather than four have been started.
    expect(seen.some((s) => s.uploading === 1)).toBe(true);
    expect(seen[seen.length - 1].settled).toBe(2);
  });

  it('carries the receipt id through on success, so the row can link to it', async () => {
    const p = await runBatch(buildBatch([f('1.jpg')]), async () => ({ receiptId: 'rec-77' }));
    expect(p.items[0].receiptId).toBe('rec-77');
  });
});

describe('retry offers only what retrying could fix', () => {
  it('offers failures and not rejections', () => {
    // A rejected file fails validation again; offering to retry it just repeats the refusal.
    const items: BatchItem[] = [
      { id: 'a', fileName: 'a', sizeBytes: 1, status: 'failed', error: 'timeout' },
      { id: 'b', fileName: 'b', sizeBytes: 1, status: 'rejected', error: 'too big' },
      { id: 'c', fileName: 'c', sizeBytes: 1, status: 'done' },
    ];
    expect(retryableItems(items).map((i) => i.id)).toEqual(['a']);
  });
});

describe('the summary line tells the truth', () => {
  it('says so when everything worked', () => {
    const done = buildBatch([f('1.jpg')]).map((i) => ({ ...i, status: 'done' as const }));
    expect(batchSummary(progressOf(done))).toMatch(/All 1 uploaded/);
  });

  it('says how many still need attention rather than claiming success', () => {
    const items = buildBatch([f('1.jpg'), f('2.jpg'), f('3.jpg')]);
    const mixed = [
      { ...items[0], status: 'done' as const },
      { ...items[1], status: 'done' as const },
      { ...items[2], status: 'failed' as const, error: 'x' },
    ];
    expect(batchSummary(progressOf(mixed))).toBe('2 of 3 uploaded. 1 still need attention.');
  });

  it('is explicit when nothing landed', () => {
    const items = buildBatch([f('1.jpg')]).map((i) => ({ ...i, status: 'failed' as const, error: 'x' }));
    expect(batchSummary(progressOf(items))).toMatch(/Nothing was filed/);
  });

  it('handles an empty selection', () => {
    expect(batchSummary(progressOf([]))).toBe('No files selected.');
    expect(progressOf([]).allSucceeded).toBe(false);
  });
});
