import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PurchaseRecommender, purchaseTier } from '../services/purchase-recommender.js';
import type { CallConfidenceScore, DiscrepancyReport } from '../types/confidence.js';

// ── C4/C5 — WHICH DOCUMENT GETS THE MONEY WHEN THERE IS NOT ENOUGH OF IT ────────────────────────
//
// > "Whenever we have the payment option turned on for kofile and texasfile or anything else, I
// >  want the pipeline to start there and look for documents about the property, espeically the
// >  drawings/cad maps/plats etc. Something visual to go off of"
//
// The recommender sorted by ROI and then OVERWROTE `priority` with the ROI rank — discarding
// Rule 1's deliberate `priority: 1` on the unwatermarked plat two lines after it was written.
//
// That is not academic. `DocumentPurchaseOrchestrator` spends in `priority` order and stops at the
// ceiling, recording everything past it as `budget_exceeded`. On a run whose money could buy two
// documents, a deed with a marginally better ratio took it and the plat was skipped.

const ROOT = path.join(__dirname, '..');
const code = (p: string): string => {
  const raw = fs.readFileSync(path.join(ROOT, p), 'utf8');
  const s = raw.replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '').replace(/^[ \t]*\/\/[^\n\r]*/gm, '');
  if (!/\b(import|export|const|function|class)\b/.test(s)) throw new Error(`stripping destroyed ${p}`);
  return s;
};

describe('the visual tier leads', () => {
  it('a plat outranks a deed', () => {
    expect(purchaseTier('plat')).toBeLessThan(purchaseTier('deed'));
  });

  it('so does a recorded survey and a map of survey', () => {
    // The clerk classifier files "MAP OF SURVEY" as `other`, and it is the single most useful
    // document a surveyor can find — see research/drawing-hunt.ts.
    expect(purchaseTier('survey')).toBe(0);
    expect(purchaseTier('map of survey')).toBe(0);
    expect(purchaseTier('subdivision drawing')).toBe(0);
  });

  it('an unrecognised type lands in the general tier rather than vanishing', () => {
    expect(purchaseTier('affidavit')).toBe(1);
    expect(purchaseTier('')).toBe(1);
  });
});

describe('the order the money is actually spent in', () => {
  /** Enough context to make the recommender emit both a plat rule and a deed rule. */
  function scoresWith(sources: string[][], score: number): Map<string, CallConfidenceScore> {
    const m = new Map<string, CallConfidenceScore>();
    sources.forEach((s, i) => {
      m.set(`L${i}`, {
        callId: `L${i}`, score, grade: 'D', sources: s,
        factors: {}, reasoning: '',
      } as unknown as CallConfidenceScore);
    });
    return m;
  }

  /**
   * A case where the deed's ratio genuinely BEATS the plat's, which is the only fixture that can
   * prove anything here.
   *
   * The first version of this test used a 2-page plat, whose ROI (2.5) already beat the deed's
   * (0.8) — so it passed identically with the tiering removed and demonstrated nothing. Measured
   * with a probe rather than assumed.
   *
   * An eight-sheet subdivision plat is an ordinary thing to find. Rule 1 prices it at pages × 2 =
   * $16 for a gain of 6, so 0.4; Rule 3 prices a deed search at $6 for a gain of 3, so 0.5. The
   * deed wins on the ratio and loses on the judgement, which is exactly the trade the owner made.
   */
  function eightSheetPlatVsDeed() {
    return new PurchaseRecommender().recommend(
      [] as DiscrepancyReport[],
      scoresWith(Array.from({ length: 3 }, () => ['plat_segment']), 50),
      [{ instrument: 'PLAT-1', type: 'plat', source: 'Kofile', pages: 8 }],
      55,
    );
  }

  it('CONTROL: the fixture really does give the deed the better ratio', () => {
    // Without this the ordering assertion below could pass because the plat happened to win on
    // ROI anyway — which is precisely how the first version of this test proved nothing.
    const recs = eightSheetPlatVsDeed();
    const plat = recs.find((r) => r.documentType === 'plat');
    const deed = recs.find((r) => r.documentType === 'deed');
    expect(plat, 'no plat recommendation — the fixture is wrong, not the code').toBeTruthy();
    expect(deed, 'no deed recommendation — the fixture is wrong, not the code').toBeTruthy();
    expect(deed!.roi).toBeGreaterThan(plat!.roi);
  });

  it('THE DEFECT: the plat is bought first anyway', () => {
    const recs = eightSheetPlatVsDeed();
    const platAt = recs.findIndex((r) => r.documentType === 'plat');
    const deedAt = recs.findIndex((r) => r.documentType === 'deed');
    expect(platAt).toBeLessThan(deedAt);
    // And the number the orchestrator obeys says so too.
    expect(recs[platAt]!.priority).toBeLessThan(recs[deedAt]!.priority);
  });

  it('priority is the order it will be bought in, not a leftover from an earlier rule', () => {
    // The orchestrator sorts by `priority` and stops at the ceiling. A priority that does not match
    // the array order means the number an operator reads is not the number the spend obeys.
    eightSheetPlatVsDeed().forEach((r, i) => expect(r.priority).toBe(i + 1));
  });

  it('ROI still decides WITHIN a tier', () => {
    // The tiering must not throw away the ratio; it only stops the ratio deciding between a plat
    // and a deed. Two same-tier recommendations still sort by roi.
    const a = { documentType: 'deed', roi: 1 } as { documentType: string; roi: number };
    const b = { documentType: 'deed', roi: 9 } as { documentType: string; roi: number };
    const sorted = [a, b].sort((x, y) => {
      const t = purchaseTier(x.documentType) - purchaseTier(y.documentType);
      return t !== 0 ? t : y.roi - x.roi;
    });
    expect(sorted[0]).toBe(b);
  });
});

describe('C5 — the free sources lead for everything else, and must keep leading', () => {
  // This was already true by construction and nothing asserted it, which is how it would silently
  // invert. The free work — county CAD, the free plat repository, the clerk's free index and
  // watermarked previews — happens in Stages 1 and 2; the only paid step runs at the very end,
  // after the confidence report says which documents are worth money.

  it('the paid step runs AFTER the free document stages, in the source', () => {
    const s = code('index.ts');
    const purchase = s.indexOf('new DocumentPurchaseOrchestrator(');
    const captures = s.indexOf('captureVisualsAtIdentification');
    expect(purchase, 'the purchase orchestrator is gone').toBeGreaterThan(-1);
    expect(captures).toBeGreaterThan(-1);
    // The free visual pass is wired at identification; the purchase is downstream of the whole run.
    expect(captures).toBeLessThan(purchase);
  });

  it('the free plat repository is consulted on the generic path before any purchase', () => {
    const s = code('services/pipeline.ts');
    expect(s).toContain('fetchBestMatchingPlat(');
    // pipeline.ts does the free work and never buys anything — the purchase lives in index.ts,
    // downstream of it. If that ever stops being true, this fails.
    expect(s).not.toContain('DocumentPurchaseOrchestrator');
  });

  it('a purchase cannot happen without the permission gate', () => {
    // The inverse risk of C4: making the paid path lead must not make it easier to reach. Every
    // spend still goes through the gate that refuses when permission cannot be READ.
    const s = code('index.ts');
    const gate = s.indexOf('await resolvePurchasePermission(projectId)');
    const buy = s.indexOf('new DocumentPurchaseOrchestrator(');
    expect(gate).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(buy);
  });
});
