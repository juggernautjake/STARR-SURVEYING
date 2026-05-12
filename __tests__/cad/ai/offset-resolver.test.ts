// __tests__/cad/ai/offset-resolver.test.ts
//
// Phase 6 §26 — Dynamic Offset Resolution.
// Covers acceptance items in
// `docs/planning/in-progress/STARR_CAD/STARR_CAD_PHASE_6_AI_ENGINE.md`:
//
//   §3069 — Offset in code suffix `BC02_10R` parsed: 10' right
//   §3071 — Perpendicular left  → 90° CCW of bearing at correct distance
//   §3072 — Perpendicular right → 90° CW  of bearing at correct distance
//   §3073 — Companion pair (`35` + `35off`) detected
//   §3074 — Ambiguous offset (no reference bearing) → flagged
//   §3076 — True positions replace offset positions in assembly
//
// §3070 (offset in description "10L BC02") is intentionally NOT
// tested — the description-text path is documented in
// `offset-resolver.ts:18` as a follow-up slice, so it's marked
// deferred in the planning doc.

import { describe, it, expect } from 'vitest';
import {
  resolveOffsetsSync,
  detectSuffixOffsets,
  detectCompanionPairs,
  applyOffset,
} from '@/lib/cad/ai-engine/offset-resolver';
import type { SurveyPoint } from '@/lib/cad/types';

// ── Minimal fixture factory ──────────────────────────────────────────────────

function pt(args: {
  id: string;
  name?: string;
  rawCode?: string;
  description?: string;
  easting?: number;
  northing?: number;
}): SurveyPoint {
  return {
    id: args.id,
    pointNumber: Number.parseInt(args.id.replace(/\D/g, ''), 10) || 1,
    pointName: args.name ?? args.id,
    parsedName: {
      baseNumber: 1,
      suffix: '',
      normalizedSuffix: 'NONE',
      suffixVariant: '',
      suffixConfidence: 1.0,
      isRecalc: false,
      recalcSequence: 0,
    },
    northing: args.northing ?? 0,
    easting: args.easting ?? 0,
    elevation: null,
    rawCode: args.rawCode ?? '',
    parsedCode: {
      rawCode: args.rawCode ?? '',
      baseCode: '',
      isNumeric: false,
      isAlpha: true,
      suffix: null,
      isValid: true,
      isLineCode: false,
      isAutoSpline: false,
    },
    resolvedAlphaCode: '',
    resolvedNumericCode: '',
    codeSuffix: null,
    codeDefinition: null,
    monumentAction: null,
    description: args.description ?? '',
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

// ─────────────────────────────────────────────────────────────────────────────

describe('Phase 6 §26 — Offset resolver', () => {
  it('§3069 — `BC02_10R` suffix yields a 10ft PERPENDICULAR_RIGHT shot', () => {
    const hits = detectSuffixOffsets([pt({ id: 'p1', rawCode: 'BC02_10R' })]);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({
      offsetPointId: 'p1',
      offsetDistance: 10,
      offsetDirection: { type: 'PERPENDICULAR_RIGHT' },
      resolutionMethod: 'SUFFIX',
      confidence: 95,
    });
  });

  it('§3069 — accepts decimal distances and case-insensitive direction', () => {
    const hits = detectSuffixOffsets([
      pt({ id: 'p1', rawCode: 'BC02_5.5l' }),
      pt({ id: 'p2', rawCode: 'BC02_2.0F' }),
      pt({ id: 'p3', rawCode: 'BC02_3.0b' }),
    ]);
    expect(hits).toHaveLength(3);
    expect(hits[0].offsetDistance).toBe(5.5);
    expect(hits[0].offsetDirection.type).toBe('PERPENDICULAR_LEFT');
    expect(hits[1].offsetDirection.type).toBe('INLINE_FORWARD');
    expect(hits[2].offsetDirection.type).toBe('INLINE_BACKWARD');
  });

  it('§3069 — rejects malformed suffixes (no distance, zero distance, unknown direction)', () => {
    const hits = detectSuffixOffsets([
      pt({ id: 'p1', rawCode: 'BC02' }),         // no offset
      pt({ id: 'p2', rawCode: 'BC02_R' }),       // missing distance
      pt({ id: 'p3', rawCode: 'BC02_0R' }),      // zero distance
      pt({ id: 'p4', rawCode: 'BC02_10X' }),     // unknown direction
    ]);
    expect(hits).toHaveLength(0);
  });

  it('§3071 — PERPENDICULAR_LEFT applies 90° CCW from reference bearing', () => {
    // Bearing N00°E (azimuth 0). Left = west = azimuth 270°.
    const origin = pt({ id: 'p1', easting: 0, northing: 0 });
    const result = applyOffset(
      origin,
      10,
      { type: 'PERPENDICULAR_LEFT' },
      0, // ref bearing = due north
    );
    expect(result.x).toBeCloseTo(-10, 6); // 10' west of origin
    expect(result.y).toBeCloseTo(0, 6);
  });

  it('§3072 — PERPENDICULAR_RIGHT applies 90° CW from reference bearing', () => {
    // Bearing N00°E (azimuth 0). Right = east = azimuth 90°.
    const origin = pt({ id: 'p1', easting: 0, northing: 0 });
    const result = applyOffset(
      origin,
      10,
      { type: 'PERPENDICULAR_RIGHT' },
      0,
    );
    expect(result.x).toBeCloseTo(10, 6);
    expect(result.y).toBeCloseTo(0, 6);
  });

  it('§3072 — PERPENDICULAR_RIGHT honours non-cardinal bearings (N45°E)', () => {
    // Bearing N45°E (azimuth 45). Right = azimuth 135°. 10' right →
    // ΔE = 10·sin(135°) ≈  7.071;  ΔN = 10·cos(135°) ≈ -7.071.
    const origin = pt({ id: 'p1', easting: 100, northing: 100 });
    const result = applyOffset(
      origin,
      10,
      { type: 'PERPENDICULAR_RIGHT' },
      45,
    );
    expect(result.x).toBeCloseTo(100 + 7.0710678, 5);
    expect(result.y).toBeCloseTo(100 - 7.0710678, 5);
  });

  it('§3073 — companion pair `35` + `35off` detected as COMPANION_PAIR', () => {
    const points = [
      pt({ id: 'a', name: '35' }),
      pt({ id: 'b', name: '35off' }),
    ];
    const hits = detectCompanionPairs(points, []);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({
      offsetPointId: 'b',
      resolutionMethod: 'COMPANION_PAIR',
      requiresUserConfirmation: true,
      confidence: 50,
    });
  });

  it('§3073 — companion pair skipped when offset already covered by suffix', () => {
    const points = [
      pt({ id: 'a', name: '35' }),
      pt({ id: 'b', name: '35off', rawCode: 'BC02_5R' }),
    ];
    const suffix = detectSuffixOffsets(points);
    const pair = detectCompanionPairs(points, suffix);
    // Suffix already covers 'b' — pair detector skips it.
    expect(suffix).toHaveLength(1);
    expect(pair).toHaveLength(0);
  });

  it('§3074 — companion pair with no neighbours → flagged ambiguous', () => {
    // Single offset shot with no non-offset neighbours → can't
    // compute a reference bearing → flagged.
    const points = [
      pt({ id: 'a', name: 'BM1' }), // only one non-offset point, not enough for a segment
      pt({ id: 'b', name: 'BM1off' }),
    ];
    const result = resolveOffsetsSync(points);
    expect(result.ambiguousShots.length).toBeGreaterThanOrEqual(1);
    expect(result.ambiguousShots[0].offsetPointId).toBe('b');
    expect(result.ambiguousShots[0].requiresUserConfirmation).toBe(true);
  });

  it('§3076 — resolved suffix offset produces a true SurveyPoint with the offset applied', () => {
    // Set up two non-offset neighbour points so a reference
    // bearing exists; offset point sits between them with
    // _10R suffix.
    const points = [
      pt({ id: 'n1', name: '1', easting: 0,    northing: 0 }),
      pt({ id: 'p1', name: '2', easting: 50,   northing: 50,  rawCode: 'BC02_10R' }),
      pt({ id: 'n2', name: '3', easting: 100,  northing: 100 }),
    ];
    const result = resolveOffsetsSync(points);
    expect(result.resolvedShots).toHaveLength(1);
    expect(result.truePoints).toHaveLength(1);
    const trueP = result.truePoints[0];
    // Neighbours form a NE bearing (azimuth 45°). PERPENDICULAR_RIGHT
    // = bearing+90° = azimuth 135°. 10' away → ΔE +7.07, ΔN -7.07.
    expect(trueP.easting).toBeCloseTo(57.0710678, 5);
    expect(trueP.northing).toBeCloseTo(42.9289322, 5);
    // The trueId on the shot links back so feature assembly can
    // swap in the true position.
    expect(result.resolvedShots[0].truePointId).toBe(trueP.id);
  });
});
