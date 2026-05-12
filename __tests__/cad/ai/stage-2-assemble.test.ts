// __tests__/cad/ai/stage-2-assemble.test.ts
//
// Phase 6 Stage-2 Feature Assembly — unit tests for the helpers
// in `lib/cad/codes/auto-connect.ts` and the exported
// `assembleFeatures` pipeline. Covers items in
// `STARR_CAD_PHASE_6_AI_ENGINE.md`:
//
//   §1880 — Auto-spline codes produce spline features
//
// Other Stage-2 acceptance items (§1879, §1881-§1884) are exercised
// by integration tests that walk the full Phase 2 → Stage 1 → Stage 2
// pipeline — they need real classified points built by the import
// path. See `__tests__/cad/recon-to-cad.test.ts` for an example of
// the integration fixture pattern.

import { describe, it, expect } from 'vitest';
import { isAutoSplineCode } from '@/lib/cad/codes/auto-connect';

describe('Phase 6 Stage 2 — Feature Assembly helpers', () => {
  it('§1880 — isAutoSplineCode recognises the hard-coded set', () => {
    // The hard-coded set in auto-connect.ts:8 covers both alpha
    // and numeric forms for backward compatibility.
    expect(isAutoSplineCode('TP06')).toBe(true);
    expect(isAutoSplineCode('TP07')).toBe(true);
    expect(isAutoSplineCode('VG07')).toBe(true);
    expect(isAutoSplineCode('FN11')).toBe(true);
    expect(isAutoSplineCode('630')).toBe(true);
    expect(isAutoSplineCode('632')).toBe(true);
    expect(isAutoSplineCode('357')).toBe(true);
  });

  it('§1880 — isAutoSplineCode is case-insensitive', () => {
    expect(isAutoSplineCode('tp06')).toBe(true);
    expect(isAutoSplineCode('vg07')).toBe(true);
  });

  it('§1880 — isAutoSplineCode returns false for non-spline codes', () => {
    expect(isAutoSplineCode('BC02')).toBe(false);
    expect(isAutoSplineCode('IRF')).toBe(false);
    expect(isAutoSplineCode('UNKNOWN')).toBe(false);
    expect(isAutoSplineCode('')).toBe(false);
  });
});
