// Never paying for the same page twice (research plan R13).
//
// Purchases were tracked in `/tmp/billing/<project>.json` — a directory the worker container wipes
// on restart, invisible to the app, scoped to one project. So nothing could answer the question that
// saves money ("do we already own this?") and a second run on the same property bought the same deed
// again at $1.00 a page.
//
// The tests that matter here are about IDENTITY. A deed is the same deed whichever vendor sold it
// and whichever project paid, and the county writes its number a dozen ways.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { countyKey, instrumentKey, summariseSavings } from '../services/purchase-ledger.js';
import { choosePlatform, mayPurchaseFrom } from '../services/platform-choice.js';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

describe('a document is the same document however it is written down', () => {
  it('treats the county’s many spellings of one instrument number as one document', () => {
    // Comparing these literally is a duplicate charge on every run.
    const forms = ['2019-12345', '201912345', '2019/12345', ' 2019-12345 ', 'Doc# 2019-12345'];
    const keys = new Set(forms.map(instrumentKey));
    expect(keys.size).toBe(1);
  });

  it('keeps genuinely different instruments apart', () => {
    expect(instrumentKey('2019-12345')).not.toBe(instrumentKey('2019-12346'));
    expect(instrumentKey('V123P456')).not.toBe(instrumentKey('V123P457'));
  });

  it('normalises FIPS so one county does not become two libraries', () => {
    expect(countyKey('48027')).toBe('48027');
    expect(countyKey('8027')).toBe('08027');
    // A name is not silently dropped — it gets a stable key of its own.
    expect(countyKey(' Bell ')).toBe('bell');
  });
});

describe('the guard lives in the database, not only in code', () => {
  const seed = read('../seeds/531_research_document_purchases.sql');

  it('makes a duplicate completed purchase impossible', () => {
    // A code-side check loses the race between two concurrent runs on the same county — and this is
    // exactly the workload that runs concurrently.
    expect(seed).toMatch(/CREATE UNIQUE INDEX[\s\S]*research_document_purchases[\s\S]*county_fips, instrument_key/);
  });

  it('keys on the county and instrument, NOT the vendor', () => {
    // The same deed from Tyler and from TexasFile is one document; keying on the platform would
    // happily buy it twice.
    const idx = seed.slice(seed.indexOf('idx_doc_purchases_owned'));
    expect(idx.slice(0, 200)).not.toContain('platform_id');
  });

  it('lets a failed attempt be retried', () => {
    // A failure is a record, not a claim of ownership. A total unique index would permanently
    // poison an instrument we still need.
    expect(seed).toMatch(/idx_doc_purchases_owned[\s\S]{0,200}WHERE status = 'completed'/);
  });
});

describe('the ledger and the cost view are the same money', () => {
  const src = read('src/services/purchase-ledger.ts');

  it('emits a usage event for every purchase', () => {
    // R4 made model spend visible. A $1.00 page that never reached research_usage_events was money
    // the cost view could not see, so a run's reported spend was quietly wrong.
    expect(src).toContain('recordUsage');
    expect(src).toContain("eventType: 'document_purchase'");
  });

  it('records the spend before the bookkeeping row', () => {
    // The money left the account whether or not our row saves.
    const fn = src.slice(src.indexOf('export async function recordPurchase'));
    expect(fn.indexOf('recordUsage')).toBeLessThan(fn.indexOf('.insert('));
  });

  it('surfaces the winner when two runs race for one document', () => {
    // The index stopped the second ROW, not the second CHARGE — the caller can still use the file.
    expect(src).toContain('23505');
    expect(src).toContain('duplicateOf');
  });
});

describe('a lookup failure is not a clean miss', () => {
  it('says so, because the run will proceed and may pay twice', () => {
    const src = read('src/services/purchase-ledger.ts');
    expect(src).toContain('lookupFailed');

    const orch = read('src/services/document-purchase-orchestrator.ts');
    expect(orch).toContain('risks paying twice');
  });

  it('checks the library before opening a vendor session', () => {
    const orch = read('src/services/document-purchase-orchestrator.ts');
    expect(orch.indexOf('findOwned(countyFIPS')).toBeLessThan(orch.indexOf('Purchase from appropriate vendor'));
  });
});

describe('what the library saved', () => {
  it('totals the documents not bought', () => {
    const s = summariseSavings([
      { costUsd: 3.5 } as never,
      { costUsd: 1 } as never,
    ]);
    expect(s).toEqual({ reused: 2, savedUsd: 4.5 });
  });

  it('reports nothing saved as nothing, not as unmeasured', () => {
    expect(summariseSavings([])).toEqual({ reused: 0, savedUsd: 0 });
  });
});

// ── Cheapest-first as a policy ──────────────────────────────────────────────────────────────────
//
// The registry returned platforms cost-ascending and called that the architecture. But a sorted list
// is a suggestion: the orchestrator picked a vendor by matching a recommendation's `source` string,
// so a county covered by Tyler at $0.50 was routinely billed $1.00 because the recommendation
// happened to say TexasFile.

describe('cheapest usable platform, with the reason stated', () => {
  // 48215 = Hidalgo: a Tyler county ($0.50/page) that statewide TexasFile ($1.00) also covers.
  // Bell (48027) would NOT work here — Tyler serves five Texas counties, not the Kofile ones.
  const HIDALGO = '48215';

  it('picks the cheaper platform when its credentials exist', () => {
    const c = choosePlatform(HIDALGO, { configured: ['tyler_pay', 'texasfile'], includeFree: false });
    expect(c.platform?.id).toBe('tyler_pay');
    expect(c.premiumPerPage).toBe(0);
    expect(c.reason).toContain('cheapest option');
  });

  it('names the premium and WHY it is being paid', () => {
    // "used TexasFile at $1.00 because Tyler is $0.50 but has no credentials" is an invoice line and
    // a to-do item. A silent $0.50 overpay per page is neither.
    const c = choosePlatform(HIDALGO, { configured: ['texasfile'], includeFree: false });
    expect(c.platform?.id).toBe('texasfile');
    expect(c.premiumPerPage).toBeGreaterThan(0);
    expect(c.reason).toContain('no credentials configured');
    expect(c.cheaperButUnavailable.some((x) => x.id === 'tyler_pay')).toBe(true);
  });

  it('returns nothing rather than an arbitrary vendor when none is usable', () => {
    // "We cannot buy here, and here is why" is actionable. A surprise charge from a vendor nobody
    // chose is not.
    const c = choosePlatform(HIDALGO, { configured: [], includeFree: false });
    expect(c.platform).toBeNull();
    expect(c.reason).toContain('unusable');
  });

  it('does not disqualify free sources for lacking credentials', () => {
    // Paying for a TxDOT page that is free is the most embarrassing way to lose money.
    const c = choosePlatform(HIDALGO, { configured: [] });
    expect(c.platform?.costPerPage).toBe(0);
  });
});

describe('the enforcement point', () => {
  const HIDALGO = '48215';

  it('refuses a dearer vendor when a cheaper configured one covers the county', () => {
    const d = mayPurchaseFrom(HIDALGO, 'texasfile', { configured: ['tyler_pay', 'texasfile'], includeFree: false });
    expect(d.allowed).toBe(false);
    expect(d.reason).toContain('needs a stated reason');
  });

  it('allows the policy choice itself', () => {
    expect(mayPurchaseFrom(HIDALGO, 'tyler_pay', { configured: ['tyler_pay'], includeFree: false }).allowed).toBe(true);
  });

  it('never refuses a CHEAPER purchase', () => {
    // The caller may know something the registry does not. Refusing here would be the policy working
    // against its own purpose.
    const d = mayPurchaseFrom(HIDALGO, 'tyler_pay', { configured: ['texasfile', 'tyler_pay'], includeFree: false });
    expect(d.allowed).toBe(true);
  });

  it('rejects a platform nobody has heard of', () => {
    const d = mayPurchaseFrom(HIDALGO, 'not_a_platform' as never, { configured: ['texasfile'], includeFree: false });
    expect(d.allowed).toBe(false);
  });
});
