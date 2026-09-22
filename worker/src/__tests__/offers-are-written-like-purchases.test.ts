// worker/src/__tests__/offers-are-written-like-purchases.test.ts
//
// An offer is a row in the same ledger as the purchase it may become, and it has to be keyed the
// same way or it cannot tell it has already been bought.
//
// ── WHAT WENT WRONG ─────────────────────────────────────────────────────────────────────────────
//
// The first `recordOffers` was written inline in `index.ts` with its own row literal. It omitted
// `instrument_key` and allowed `instrument_raw` to be null — both NOT NULL since seed 531 — so
// every insert failed 23502, the failure was a `console.warn`, and the table stayed empty. Seed 629
// records the identical failure in the identical table for `paid_disabled`, a year earlier: a
// silent writer over a constraint it cannot satisfy looks exactly like a feature that works.
//
// So this file asserts the ROW, not the call.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({
  inserted: [] as Array<Record<string, unknown>>,
  error: null as { message: string } | null,
  client: {} as unknown,
}));

vi.mock('../services/pipeline.js', () => ({
  getSupabase: async () => db.client,
}));
vi.mock('../infra/usage.js', () => ({ recordUsage: async () => undefined }));
vi.mock('../infra/run-budget.js', () => ({ notePaidPages: () => undefined }));

import { recordOffers, offerIdentity, instrumentKey } from '../services/purchase-ledger.js';

beforeEach(() => {
  db.inserted.length = 0;
  db.error = null;
  db.client = {
    from: (table: string) => {
      expect(table).toBe('research_document_purchases');
      return {
        insert: async (rows: Record<string, unknown>[]) => {
          if (db.error) return { error: db.error };
          db.inserted.push(...rows);
          return { error: null };
        },
      };
    },
  };
});

const BASE = {
  projectId: 'p-1',
  countyFips: 'Williamson',
  platformId: 'texasfile',
  costUsd: 10,
};

describe('an offer row satisfies the constraints a purchase row satisfies', () => {
  it('fills instrument_key and instrument_raw, which are NOT NULL and were both missing', async () => {
    const out = await recordOffers([{ ...BASE, instrument: '2019-12345', documentType: 'PLAT' }]);
    expect(out).toMatchObject({ recorded: 1, dropped: 0, error: null });
    const row = db.inserted[0]!;
    expect(row.instrument_raw).toBe('2019-12345');
    // The SAME key the purchase will be written with, or the library cannot match the two.
    expect(row.instrument_key).toBe(instrumentKey('2019-12345'));
    expect(row.status).toBe('offered');
    expect(row.offered_at).toEqual(expect.any(String));
  });

  it('normalises the county the way every other writer does', async () => {
    await recordOffers([{ ...BASE, instrument: 'A1' }]);
    // `countyKey` turns a name into a stable lowercase form and FIPS into 5 digits. An offer keyed
    // 'Williamson' and a purchase keyed '48491' split the library in two.
    expect(db.inserted[0]!.county_fips).toBe('williamson');
  });

  it('carries the vendor id, which is the only reason a purchase button can work tomorrow', async () => {
    await recordOffers([{ ...BASE, instrument: 'A1', vendorRef: 'guid-abc-123' }]);
    expect(db.inserted[0]!.vendor_ref).toBe('guid-abc-123');
  });

  it('never spends: no pages, and the estimate is stored as an estimate', async () => {
    await recordOffers([{ ...BASE, instrument: 'A1', costUsd: 10 }]);
    expect(db.inserted[0]!.pages).toBe(0);
    expect(db.inserted[0]!.cost_usd).toBe(10);
    // Nothing was bought, so nothing is 'completed' — the uniqueness index in seed 531 applies only
    // to completed rows, which is what lets two runs offer the same document.
    expect(db.inserted[0]!.status).not.toBe('completed');
  });
});

describe('offerIdentity — what the row says the document IS', () => {
  it('prefers the instrument number, which is what a person reads', () => {
    expect(offerIdentity({ ...BASE, instrument: '2019-12345', book: '55', page: '12' })).toBe('2019-12345');
  });

  it('falls back to book and page, which ARE the identity in the older volumes', () => {
    expect(offerIdentity({ ...BASE, instrument: null, book: '55', page: '12' })).toBe('V55 P12');
  });

  it('falls back to the vendor id, prefixed so nobody reads it as a county reference', () => {
    expect(offerIdentity({ ...BASE, book: null, vendorRef: 'guid-abc' })).toBe('REF:guid-abc');
  });

  it('is null when there is no handle at all', () => {
    expect(offerIdentity({ ...BASE })).toBeNull();
  });

  it('drops an offer with no handle rather than storing an unbuyable row', async () => {
    const out = await recordOffers([
      { ...BASE, instrument: 'A1' },
      { ...BASE },
    ]);
    expect(out).toMatchObject({ recorded: 1, dropped: 1 });
    expect(db.inserted).toHaveLength(1);
    // A purchase button with nothing to buy is worse than a document nobody was told about.
    expect(db.inserted[0]!.instrument_raw).toBe('A1');
  });
});

describe('it reports rather than swallows', () => {
  it('returns the database error instead of warning past it', async () => {
    db.error = { message: 'new row violates check constraint' };
    const out = await recordOffers([{ ...BASE, instrument: 'A1' }]);
    // The whole bug was a writer that failed quietly. The caller gets the message and logs it as an
    // error; what it must NOT do is throw, because the free record is unaffected either way.
    expect(out.error).toContain('check constraint');
    expect(out.recorded).toBe(0);
  });

  it('does nothing at all for an empty list', async () => {
    expect(await recordOffers([])).toEqual({ recorded: 0, dropped: 0, error: null });
    expect(db.inserted).toHaveLength(0);
  });
});
