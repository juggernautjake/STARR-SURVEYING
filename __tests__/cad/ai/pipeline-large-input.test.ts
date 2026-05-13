// __tests__/cad/ai/pipeline-large-input.test.ts
//
// Phase 6 §1923 — Worker handles 500+ point files without crash.
// The in-process pipeline is what the API route invokes; this
// test seeds 500 deterministic BC01 monument points + 100 PL01
// boundary points and verifies the full pipeline returns without
// throwing.

import { describe, it, expect } from 'vitest';
import { runAIPipeline } from '@/lib/cad/ai-engine/pipeline';
import { lookupCode } from '@/lib/cad/codes/code-lookup';
import type { AIJobPayload } from '@/lib/cad/ai-engine/types';
import type { SurveyPoint } from '@/lib/cad/types';

function mk(args: {
  id: string;
  pointNumber: number;
  baseCode: string;
  suffix?: 'B' | 'E' | null;
  easting: number;
  northing: number;
}): SurveyPoint {
  const rawCode = args.suffix ? `${args.baseCode}${args.suffix}` : args.baseCode;
  return {
    id: args.id,
    pointNumber: args.pointNumber,
    pointName: String(args.pointNumber),
    parsedName: {
      baseNumber: args.pointNumber,
      suffix: '',
      normalizedSuffix: 'NONE',
      suffixVariant: '',
      suffixConfidence: 1,
      isRecalc: false,
      recalcSequence: 0,
    },
    northing: args.northing,
    easting: args.easting,
    elevation: null,
    rawCode,
    parsedCode: {
      rawCode,
      baseCode: args.baseCode,
      isNumeric: false,
      isAlpha: true,
      suffix: args.suffix ?? null,
      isValid: true,
      isLineCode: args.baseCode === 'PL01',
      isAutoSpline: false,
    },
    resolvedAlphaCode: args.baseCode,
    resolvedNumericCode: '',
    codeSuffix: args.suffix ?? null,
    codeDefinition: lookupCode(args.baseCode),
    monumentAction: null,
    description: '',
    rawRecord: '',
    importSource: 'test',
    layerId: '0',
    featureId: '',
    lineStringIds: [],
    validationIssues: [],
    confidence: 1,
    isAccepted: true,
  };
}

describe('Phase 6 §1923 — pipeline handles 500+ point files', () => {
  it('runs to completion on 600 points without crashing', async () => {
    const points: SurveyPoint[] = [];
    // 500 BC01 monument points scattered in a 1000x1000 ft grid.
    for (let i = 0; i < 500; i++) {
      points.push(
        mk({
          id: `m${i}`,
          pointNumber: 1 + i,
          baseCode: 'BC01',
          easting: (i % 25) * 40,
          northing: Math.floor(i / 25) * 40,
        }),
      );
    }
    // 100 PL01 boundary points forming 25 line strings of 4 vertices.
    for (let i = 0; i < 100; i++) {
      const lineIx = Math.floor(i / 4);
      const vertIx = i % 4;
      const suffix: 'B' | 'E' | null =
        vertIx === 0 ? 'B' : vertIx === 3 ? 'E' : null;
      points.push(
        mk({
          id: `b${i}`,
          pointNumber: 1000 + i,
          baseCode: 'PL01',
          suffix,
          easting: lineIx * 50 + vertIx * 10,
          northing: lineIx * 50 + vertIx * 10,
        }),
      );
    }

    const payload: AIJobPayload = {
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
    };

    const result = await runAIPipeline(payload, () => {});
    expect(result.features.length).toBeGreaterThan(0);
    expect(result.reviewQueue.summary.totalElements).toBeGreaterThan(0);
    expect(result.warnings).toBeInstanceOf(Array);
    // Sanity: the pipeline shouldn't take more than 30 seconds
    // on this size in test mode (CI runs much faster, but the
    // ceiling prevents a regression making it 10x slower).
    expect(result.processingTimeMs).toBeLessThan(30_000);
  });
});
