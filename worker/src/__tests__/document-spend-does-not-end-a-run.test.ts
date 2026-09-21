/**
 * Buying a document must not end the run.
 *
 * Job 26144, 2026-09-21, 17:56 — the whole failure in one run record:
 *
 *     stop_reason     budget_reached
 *     cost_usd        10.00
 *     budget_summary  "Finished at the $2.00 cost limit you set."
 *
 * The run identified the parcel, found the 1979 VILLAGE GREEN plat, bought it for $10 — all
 * correct — and the cost watchdog, reading TOTAL spend, aborted against a $2 ceiling meant for AI
 * calls. The free clerk index was never searched. 2m21s, ten dollars, nothing read.
 *
 * Owner: "even if the spend limit is reached for purchasing documents, we still should be searching
 * the free websites and stuff... The research pipeline should not just end as soon as the budget
 * limit is reached."
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordUsage, spendForRun, documentSpendForRun, nonDocumentSpendForRun, resetRunSpend,
} from '../infra/usage.js';

const P = 'proj-26144';

describe('the two meters', () => {
  beforeEach(() => resetRunSpend(P));

  it('a document purchase counts against documents, not against the run ceiling', async () => {
    await recordUsage({ projectId: P, eventType: 'document_purchase', costUsd: 10 } as never);
    expect(documentSpendForRun(P)).toBe(10);
    expect(spendForRun(P)).toBe(10);
    // The number the cost watchdog reads. A $2 ceiling survives a $10 plat.
    expect(nonDocumentSpendForRun(P)).toBe(0);
  });

  it('keeps counting AI, OCR and captcha against the run ceiling', async () => {
    await recordUsage({ projectId: P, eventType: 'ocr', costUsd: 0.25 } as never);
    await recordUsage({ projectId: P, eventType: 'captcha', costUsd: 0.1 } as never);
    expect(nonDocumentSpendForRun(P)).toBeCloseTo(0.35, 6);
    expect(documentSpendForRun(P)).toBe(0);
  });

  it('separates them when a run does both', async () => {
    await recordUsage({ projectId: P, eventType: 'document_purchase', costUsd: 10 } as never);
    await recordUsage({ projectId: P, eventType: 'ocr', costUsd: 0.5 } as never);
    expect(spendForRun(P)).toBeCloseTo(10.5, 6);
    expect(documentSpendForRun(P)).toBe(10);
    // $0.50 of a $2 ceiling — the run keeps going, which is the entire point.
    expect(nonDocumentSpendForRun(P)).toBeCloseTo(0.5, 6);
  });

  it('forgets both when a run is reset', async () => {
    await recordUsage({ projectId: P, eventType: 'document_purchase', costUsd: 10 } as never);
    resetRunSpend(P);
    expect(spendForRun(P)).toBe(0);
    expect(documentSpendForRun(P)).toBe(0);
    expect(nonDocumentSpendForRun(P)).toBe(0);
  });

  it('never reports a negative ceiling spend', async () => {
    // Defensive: the two maps are written together, but a subtraction that can go negative would
    // silently hand the watchdog a number that can never trip.
    await recordUsage({ projectId: P, eventType: 'document_purchase', costUsd: 3 } as never);
    expect(nonDocumentSpendForRun(P)).toBeGreaterThanOrEqual(0);
  });
});
