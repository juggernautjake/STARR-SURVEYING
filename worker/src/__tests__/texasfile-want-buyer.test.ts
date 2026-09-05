import { describe, it, expect, vi } from 'vitest';
import {
  purchaseArgsForWant,
  buyResultFromPurchase,
  makeTexasFileWantBuyer,
  type PurchaseFn,
} from '../research/texasfile-want-buyer.js';
import type { Want } from '../research/acquisition-wantlist.js';
import type { DocumentPurchaseResult } from '../types/purchase.js';

// Plan GATHER_AND_REVIEW_SPLIT G4 — the real buyFromTexasFile the gather engine injects. This maps a
// Want onto the purchase adapter and back; a wrong mapping either searches for the wrong thing or
// mis-reports a spend, so pin both directions.

const deedWant: Want = {
  order: 1, target: 'subject', kind: 'recent_deed', documentType: 'deed',
  label: 'Subject deed', name: 'SMITH TOMMY', book: '44', page: '212', recordingDate: '2021-03-03',
};

describe('purchaseArgsForWant', () => {
  it('threads the wants keys into the adapter hints (book as volume, name, maxUsd)', () => {
    const [county, instr, docType, hints] = purchaseArgsForWant('Bell', deedWant, 6);
    expect(county).toBe('Bell');
    expect(docType).toBe('deed');
    expect(hints).toEqual({ book: '44', volume: '44', page: '212', name: 'SMITH TOMMY', maxUsd: 6 });
  });

  it('passes an empty instrument when the want has none (TexasFile searches by name/book-page)', () => {
    const [, instr] = purchaseArgsForWant('Bell', { ...deedWant, instrument: undefined }, 10);
    expect(instr).toBe('');
  });
});

describe('buyResultFromPurchase', () => {
  const base: DocumentPurchaseResult = {
    documentType: 'deed', pages: 0, paymentMethod: 'texasfile_wallet',
  };

  it('maps a purchase to a bought result carrying the real cost', () => {
    expect(buyResultFromPurchase({ ...base, status: 'purchased', pages: 3, totalCost: 3, transactionId: 'TF-17' }))
      .toEqual({ bought: true, costUsd: 3, ref: 'TF-17' });
  });

  it('maps a budget_exceeded to a budget refusal (so the engine marks skipped_budget)', () => {
    expect(buyResultFromPurchase({ ...base, status: 'budget_exceeded', error: 'earmark' }))
      .toEqual({ bought: false, costUsd: 0, reason: 'budget' });
  });

  it('maps not_available / failed to a not-found miss', () => {
    expect(buyResultFromPurchase({ ...base, status: 'not_available', error: 'no results' }).bought).toBe(false);
    expect(buyResultFromPurchase({ ...base, status: 'not_available', error: 'no results' }).reason).toBe('no results');
    expect(buyResultFromPurchase({ ...base, status: 'failed' }).reason).toBe('failed');
  });
});

describe('makeTexasFileWantBuyer', () => {
  it('calls the injected purchase fn with the mapped args and returns the mapped result', async () => {
    const purchase = vi.fn<PurchaseFn>(async () => ({
      documentType: 'deed', pages: 2, totalCost: 2, status: 'purchased',
      paymentMethod: 'texasfile_wallet', transactionId: 'TF-99',
    }));
    const buy = makeTexasFileWantBuyer({ county: 'Bell', projectId: 'p1', purchase });
    const res = await buy(deedWant, 5);
    expect(purchase).toHaveBeenCalledWith('Bell', '', 'deed', { book: '44', volume: '44', page: '212', name: 'SMITH TOMMY', maxUsd: 5 });
    expect(res).toEqual({ bought: true, costUsd: 2, ref: 'TF-99' });
  });
});
