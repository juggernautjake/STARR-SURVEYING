// __tests__/cad/ai/deed-parser.test.ts
//
// Phase 6 Stage-3 prep — deed call regex parser unit tests for
// `parseCallsRegex` in `lib/cad/ai-engine/deed-parser.ts`. Covers
// §1887 in `STARR_CAD_PHASE_6_AI_ENGINE.md`:
//   §1887 — Regex parser extracts correct bearings/distances from
//           standard format

import { describe, it, expect } from 'vitest';
import { parseCallsRegex, extractMonument } from '@/lib/cad/ai-engine/deed-parser';

describe('Phase 6 Stage 3 — Deed Call Regex Parser', () => {
  it('§1887 — extracts a single LINE call from standard THENCE format', () => {
    const text = `
      BEGINNING at a 1/2" iron rod found marking the SW corner of Lot 4.
      THENCE N 45°30'15" E, a distance of 234.56 feet to a 1/2" iron rod set;
      to the POINT OF BEGINNING.
    `;
    const result = parseCallsRegex(text);
    expect(result.calls).toHaveLength(1);
    const call = result.calls[0];
    expect(call.type).toBe('LINE');
    expect(call.bearing).toBeCloseTo(45.504166, 4); // N 45°30'15" E = 45.5042° az
    expect(call.distance).toBe(234.56);
    expect(call.monument).toMatch(/iron rod set/i);
    expect(result.confidence).toBe(1.0);
  });

  it('§1887 — extracts multiple THENCE calls in sequence', () => {
    const text = `
      BEGINNING at the SW corner.
      THENCE N 00°00'00" E, a distance of 100.00 feet to corner #2;
      THENCE S 89°59'45" E, a distance of 200.00 feet to corner #3;
      THENCE S 00°00'15" W, a distance of 100.00 feet to corner #4;
      THENCE N 89°59'45" W, a distance of 200.00 feet to the POINT OF BEGINNING.
    `;
    const result = parseCallsRegex(text);
    expect(result.calls).toHaveLength(4);
    expect(result.calls[0].distance).toBe(100);
    expect(result.calls[1].distance).toBe(200);
    expect(result.calls[2].distance).toBe(100);
    expect(result.calls[3].distance).toBe(200);
    // Sequential indices
    expect(result.calls.map((c) => c.index)).toEqual([0, 1, 2, 3]);
  });

  it('§1887 — extracts CURVE call with radius + arc-length + delta', () => {
    const text = `
      THENCE along a curve to the right having a radius of 500.00 feet,
      a central angle of 15°00'00", an arc length of 130.90 feet,
      and a chord bearing of N 67°30'00" E with chord distance of 130.52 feet
      to a 1/2" iron rod set.
    `;
    const result = parseCallsRegex(text);
    expect(result.calls).toHaveLength(1);
    const call = result.calls[0];
    expect(call.type).toBe('CURVE');
    expect(call.curveData?.radius).toBe(500);
    expect(call.curveData?.arcLength).toBe(130.9);
    expect(call.curveData?.chordDistance).toBe(130.52);
    expect(call.bearing).toBeNull();
  });

  it('§1887 — handles unparseable THENCE blocks without crashing', () => {
    const text = `
      THENCE wandering vaguely north for a bit
      THENCE N 30°00'00" E, a distance of 50.00 feet to corner.
    `;
    const result = parseCallsRegex(text);
    // First block has text but no recognisable call → preserved with nulls
    // Second block parses cleanly
    expect(result.calls.length).toBeGreaterThanOrEqual(1);
    const lineCall = result.calls.find((c) => c.bearing !== null);
    expect(lineCall).toBeDefined();
    expect(lineCall!.distance).toBe(50);
  });

  it('§1887 — returns empty calls + 0 confidence for non-deed text', () => {
    const result = parseCallsRegex('This is not a deed.');
    expect(result.calls).toHaveLength(0);
    expect(result.confidence).toBe(0);
  });

  // ── extractMonument helper (related coverage) ─────────────────────────────

  it('extractMonument — finds "iron rod" mentions', () => {
    const m = extractMonument('THENCE ... to a 1/2" iron rod set at the corner.');
    expect(m).toMatch(/iron rod/i);
  });
});
