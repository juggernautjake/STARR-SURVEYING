/**
 * What the run found and did not buy is a FINDING, not a failure.
 *
 * Job 26144 found five buyable documents, could afford one, bought the 1979 VILLAGE GREEN plat, and
 * reported the other four as though they did not exist. `budget_exceeded` has never left the
 * worker — `paid-documents.ts` even calls it "a third, different thing" and then nothing treats it
 * as one.
 *
 * Owner: "It should list other found documents that can be purchased, but it should not purchase
 * them unless the user wants to after the run is complete."
 */

import { describe, it, expect } from 'vitest';
import {
  offerable, deferredTotalUsd, deferredNotice, bySource,
  type DeferredPurchase,
} from '@/lib/research/deferred-purchases';

const d = (over: Partial<DeferredPurchase> = {}): DeferredPurchase => ({
  label: 'VILLAGE GREEN 3.00 AC', source: 'texasfile',
  estimatedCostUsd: 10, reason: 'budget_exceeded', ...over,
});

describe('which deferrals are an offer', () => {
  it('offers what the operator can still choose to buy', () => {
    expect(offerable([d(), d({ reason: 'paid_disabled' })])).toHaveLength(2);
  });

  it('never offers to sell back a document we already hold free', () => {
    // The single worst thing this list could do.
    expect(offerable([d({ reason: 'free_copy_held' })])).toHaveLength(0);
  });

  it('leaves a missing vendor login out of the list', () => {
    // Not actionable from a shopping list; that belongs in the configuration notice, next to the fix.
    expect(offerable([d({ reason: 'no_vendor_credentials' })])).toHaveLength(0);
  });
});

describe('what it would cost', () => {
  it('adds the offer up', () => {
    expect(deferredTotalUsd([d({ estimatedCostUsd: 10 }), d({ estimatedCostUsd: 3 })])).toBe(13);
  });

  it('refuses a total when any price is unknown', () => {
    // A per-page vendor with an unknown page count. Half a total reads as a whole one.
    expect(deferredTotalUsd([d({ estimatedCostUsd: 10 }), d({ estimatedCostUsd: null })])).toBeNull();
  });

  it('has no total when there is nothing to offer', () => {
    expect(deferredTotalUsd([])).toBeNull();
    expect(deferredTotalUsd([d({ reason: 'free_copy_held' })])).toBeNull();
  });
});

describe('the sentence', () => {
  it('offers rather than apologises', () => {
    const s = deferredNotice([d(), d({ estimatedCostUsd: 3 })])!;
    expect(s).toContain('2 more documents can be bought');
    expect(s).toContain('$13.00');
    expect(s).toContain('reached its document budget');
    // The run did what it was told. It must not read as a failure.
    expect(s).not.toMatch(/fail|error|could not|unable/i);
    expect(s).toContain('when you are ready');
  });

  it('counts one document as one', () => {
    expect(deferredNotice([d()])).toContain('1 more document can be bought');
  });

  it('says nothing when there is nothing to offer', () => {
    expect(deferredNotice([])).toBeNull();
    expect(deferredNotice([d({ reason: 'free_copy_held' })])).toBeNull();
  });

  it('names the right cause when paid documents were simply off', () => {
    expect(deferredNotice([d({ reason: 'paid_disabled' })])).toContain('switched off for this run');
  });

  it('omits a price it cannot vouch for', () => {
    const s = deferredNotice([d({ estimatedCostUsd: null })])!;
    expect(s).not.toContain('$');
    expect(s).toContain('1 more document can be bought');
  });
});

describe('bySource', () => {
  it('groups the offer by where it would be bought', () => {
    const g = bySource([d(), d({ source: 'kofile' }), d({ reason: 'free_copy_held' })]);
    expect([...g.keys()].sort()).toEqual(['kofile', 'texasfile']);
    expect(g.get('texasfile')).toHaveLength(1);
  });
});
