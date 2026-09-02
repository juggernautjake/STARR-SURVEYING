import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { decidePurchase } from '../research/purchase-gate.js';
import type { EffectiveSettings } from '../research/purchase-gate.js';

// B3 (the half that does not need money) — a skipped purchase leaves evidence.
//
// The explanation path existed at both ends and nothing joined them:
//
//   lib/research/paid-documents.ts   skipStatusFor() produces 'paid_disabled' / 'no_vendor_credentials'
//   the analyze route               counts rows with those statuses
//   paidDocumentsNotice()           returns NULL when that count is zero
//   the worker                      never wrote such a row. `research_document_purchases`: 0 rows.
//
// So the sentence "N documents behind a paywall were not retrieved" was unreachable by
// construction, and the screen said nothing about the most expensive decision a run makes.
// `skipStatusFor` had zero callers; `recordFailedPurchase` had zero callers.
//
// The remaining half of B3 — proving the PAID path runs and writes a `purchased` row — needs a
// deliberate paid run against a real property, which is the owner's call and not a test's.

const read = (...p: string[]) => fs.readFileSync(path.join(process.cwd(), ...p), 'utf8');

const settings = (over: Record<string, unknown> = {}): EffectiveSettings => ({
  source: 'run-record',
  settings: {
    allowPaidDocuments: true,
    maxCostUsd: 25,
    mode: 'paid',
    ...over,
  },
} as unknown as EffectiveSettings);

describe('a refusal carries a machine-readable status, not only a sentence', () => {
  it('CONTROL: a run that MAY buy has no skip status', () => {
    // Without this, "always return paid_disabled" would satisfy every other case here and would
    // record skip rows for runs that bought perfectly well.
    const d = decidePurchase(settings());
    expect(d.allowed).toBe(true);
    expect(d.skipStatus).toBeNull();
  });

  it('the switch being off is a deliberate instruction', () => {
    const d = decidePurchase(settings({ allowPaidDocuments: false }));
    expect(d.allowed).toBe(false);
    expect(d.skipStatus).toBe('paid_disabled');
  });

  it('a $0.00 ceiling is the same instruction', () => {
    const d = decidePurchase(settings({ maxCostUsd: 0 }));
    expect(d.skipStatus).toBe('paid_disabled');
  });

  it('free mode is the same instruction', () => {
    const d = decidePurchase(settings({ mode: 'free' }));
    expect(d.skipStatus).toBe('paid_disabled');
  });

  it('an UNREADABLE permission is its own status, not folded into "disabled"', () => {
    // The distinction that earns its own value: "you told us not to spend" is finished; "we could
    // not find out whether you had" is worth re-running once the setting reads. Collapsing them
    // would tell an operator their run is done when it is waiting on them.
    const d = decidePurchase({ source: 'unreadable', settings: {} } as unknown as EffectiveSettings);
    expect(d.allowed).toBe(false);
    expect(d.skipStatus).toBe('permission_unreadable');
  });
});

describe('the ledger can write a skip', () => {
  const ledger = read('src/services/purchase-ledger.ts');

  it('has a function for it', () => {
    expect(ledger).toContain('export async function recordSkippedPurchases(');
  });

  it('writes zero cost and does NOT emit a usage event', () => {
    // recordPurchase writes one because money moved. Nothing moved here, and a $0.00 usage event
    // would put a purchase in the cost stream that never happened.
    const at = ledger.indexOf('export async function recordSkippedPurchases(');
    const fn = ledger.slice(at, at + 1600);
    expect(fn).toContain('cost_usd: 0');
    expect(fn, 'a skip is emitting a usage event').not.toContain('recordUsage(');
  });

  it('does not throw at the caller', () => {
    const at = ledger.indexOf('export async function recordSkippedPurchases(');
    const fn = ledger.slice(at, at + 1600);
    expect(fn).toContain('catch');
  });
});

describe('the worker actually records the skip — assert the CALLER', () => {
  const index = read('src/index.ts');
  const codeOnly = index
    .split(/\r?\n/)
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
    })
    .join('\n');

  it('imports the ledger helper', () => {
    expect(codeOnly).toContain('recordSkippedPurchases');
  });

  it('calls it at the refusal site, with the decision\'s own status', () => {
    // A helper nobody calls is exactly the state `skipStatusFor` and `recordFailedPurchase` were
    // already in — both were written, neither had a caller, and the table stayed empty.
    expect(codeOnly).toContain('permission.skipStatus');
    expect(codeOnly).toContain('recordSkippedPurchases(');
  });

  it('records one row per recommended document, not one per run', () => {
    const at = codeOnly.indexOf('recordSkippedPurchases(');
    const call = codeOnly.slice(at, at + 700);
    expect(call).toContain('recommendations.map(');
  });

  it('reports a failure to record rather than swallowing it', () => {
    const at = codeOnly.indexOf('recordSkippedPurchases(');
    const call = codeOnly.slice(at, at + 900);
    expect(call).toContain('Could not record the skipped documents');
  });
});
