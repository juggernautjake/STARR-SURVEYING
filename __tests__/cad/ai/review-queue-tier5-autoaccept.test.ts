// __tests__/cad/ai/review-queue-tier5-autoaccept.test.ts
//
// Phase 6 §1909-1910 — Tier-5 auto-accept + every other tier starts
// as PENDING. Validates the `stubReviewQueue` builder behaviour
// exposed indirectly through `runAIPipeline`'s output. We exercise
// the builder by stitching the same inputs the pipeline would
// pass: one feature per target tier, paired with a synthetic
// ConfidenceScore.
//
// We can't import the private `stubReviewQueue` directly, so we
// hit it via the public surface by constructing the smallest
// possible scenario and walking the resulting `AIReviewQueue`.

import { describe, it, expect } from 'vitest';
import { runAIPipeline } from '@/lib/cad/ai-engine/pipeline';
import type { SurveyPoint } from '@/lib/cad/types';

function pt(args: {
  id: string;
  pointNumber: number;
  baseCode?: string;
  easting: number;
  northing: number;
}): SurveyPoint {
  const rawCode = args.baseCode ?? 'BC01';
  return {
    id: args.id,
    pointNumber: args.pointNumber,
    pointName: String(args.pointNumber),
    parsedName: {
      baseNumber: args.pointNumber,
      suffix: '',
      normalizedSuffix: 'NONE',
      suffixVariant: '',
      suffixConfidence: 1.0,
      isRecalc: false,
      recalcSequence: 0,
    },
    northing: args.northing,
    easting: args.easting,
    elevation: null,
    rawCode,
    parsedCode: {
      rawCode,
      baseCode: args.baseCode ?? 'BC01',
      isNumeric: false,
      isAlpha: true,
      suffix: null,
      isValid: true,
      isLineCode: false,
      isAutoSpline: false,
    },
    resolvedAlphaCode: args.baseCode ?? 'BC01',
    resolvedNumericCode: '308',
    codeSuffix: null,
    codeDefinition: null,
    monumentAction: null,
    description: '',
    rawRecord: '',
    importSource: 'test',
    layerId: '0',
    featureId: '',
    lineStringIds: [],
    validationIssues: [],
    confidence: 1.0,
    isAccepted: true,
  };
}

describe('Phase 6 §1909-1910 — review queue tier-5 auto-accept', () => {
  it('every emitted review item starts in either ACCEPTED (tier 5) or PENDING (tiers 1-4)', async () => {
    // Three monument points → three POINT features. Stage-6
    // confidence currently produces tier 4-5 for clean BC01
    // points; the actual tier depends on the score, so we
    // verify the invariant rather than a specific count.
    const points = [
      pt({ id: 'p1', pointNumber: 1, easting: 0, northing: 0 }),
      pt({ id: 'p2', pointNumber: 2, easting: 100, northing: 0 }),
      pt({ id: 'p3', pointNumber: 3, easting: 100, northing: 100 }),
    ];
    const result = await runAIPipeline(
      {
        points,
        deedData: null,
        fieldNotes: null,
        userPrompt: null,
        answers: [],
        templateId: null,
        coordinateSystem: 'NAD83_TX_CENTRAL',
        codeLibrary: [],
        customSymbols: [],
        customLineTypes: [],
        autoSelectScale: false,
        autoSelectOrientation: false,
        generateLabels: false,
        optimizeLabels: false,
        includeConfidenceScoring: true,
      },
      () => {}, // no-op progress
    );

    expect(result.reviewQueue).toBeDefined();
    let acceptedFromTier5 = 0;
    let pendingFromOther = 0;
    let mismatched = 0;
    for (const tier of [5, 4, 3, 2, 1] as const) {
      for (const item of result.reviewQueue.tiers[tier]) {
        if (tier === 5 && item.status === 'ACCEPTED') {
          acceptedFromTier5 += 1;
        } else if (tier !== 5 && item.status === 'PENDING') {
          pendingFromOther += 1;
        } else {
          mismatched += 1;
        }
      }
    }
    // Every item must fall into one of the two correct buckets.
    expect(mismatched).toBe(0);
    // Sum should match the total of features emitted.
    expect(acceptedFromTier5 + pendingFromOther).toBe(
      result.reviewQueue.summary.totalElements,
    );
    // Summary counts should agree with what we walked.
    expect(result.reviewQueue.summary.acceptedCount).toBe(acceptedFromTier5);
    expect(result.reviewQueue.summary.pendingCount).toBe(pendingFromOther);
  });
});
