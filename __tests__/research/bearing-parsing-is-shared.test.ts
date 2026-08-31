// __tests__/research/bearing-parsing-is-shared.test.ts
//
// ── `N 30° 15' E` DID NOT PARSE ─────────────────────────────────────────────────────────────────
//
// `lib/cad/geometry/bearing.ts` required seconds. A quadrant bearing written to the minute — an
// entirely ordinary deed call — returned `null`.
//
// The research boundary route had grown its OWN parser accepting `(\d{0,2})` seconds, precisely
// because the shared one would not take them. That route collapses an unparseable leg to a
// zero-length segment, so **a plat with minute-precision calls drew a boundary with sides missing,
// and said nothing about it.** On the CAD side the same input is rejected at entry.
//
// Found by sweeping for duplicated geometry after the previous slice duplicated some itself. The
// two parsers were not merely redundant — they disagreed, and the narrower one was the shared one.
//
// ── WIDENED, NOT REPLACED ───────────────────────────────────────────────────────────────────────
//
// Every string that parsed before parses identically; the only new acceptances are ones that should
// always have worked. That is what makes this safe to do to code five CAD components depend on, and
// the existing 35 bearing tests passing unchanged is the evidence.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parseBearing } from '../../lib/cad/geometry/bearing';

describe('bearings written to the minute', () => {
  it('parses without seconds', () => {
    // The case that returned null. 30°15' is 30.25°.
    expect(parseBearing(`N 30° 15' E`)).toBeCloseTo(30.25, 6);
    expect(parseBearing(`N 30°15' E`)).toBeCloseTo(30.25, 6);
  });

  it('treats the missing seconds as zero, not as a guess', () => {
    expect(parseBearing(`N 30° 15' E`)).toBe(parseBearing(`N 30° 15' 00" E`));
  });

  it('works in every quadrant', () => {
    expect(parseBearing(`N 30° 15' E`)).toBeCloseTo(30.25, 6);
    expect(parseBearing(`S 30° 15' E`)).toBeCloseTo(149.75, 6);
    expect(parseBearing(`S 30° 15' W`)).toBeCloseTo(210.25, 6);
    expect(parseBearing(`N 30° 15' W`)).toBeCloseTo(329.75, 6);
  });
});

describe('nothing that parsed before changed', () => {
  it('still parses full DMS quadrant bearings identically', () => {
    // The widening must be strictly permissive. If any of these moved, five CAD components that
    // depend on this function would silently start drawing something else.
    expect(parseBearing(`N 30°15'20" E`)).toBeCloseTo(30.2555556, 6);
    expect(parseBearing(`S 45°00'00" W`)).toBeCloseTo(225, 6);
    expect(parseBearing(`N 30 15 20 E`)).toBeCloseTo(30.2555556, 6);
    expect(parseBearing(`N30°15'20"E`)).toBeCloseTo(30.2555556, 6);
  });

  it('still parses azimuth DMS and decimals', () => {
    expect(parseBearing(`135°30'00"`)).toBeCloseTo(135.5, 5);
    expect(parseBearing('90')).toBeCloseTo(90, 6);
  });

  it('still rejects what is not a bearing', () => {
    expect(parseBearing('not a bearing')).toBeNull();
    expect(parseBearing('')).toBeNull();
  });

  it('rejects trailing junk — the research parser did not', () => {
    // The second, unintended difference between the two: the route's regex was unanchored, so
    // `N 30°15'20" E and more` parsed happily. Consolidating makes this stricter, which is right —
    // a bearing with text after it is not a bearing, and silently taking the prefix is how a
    // mis-OCR'd call becomes a confident wrong number.
    expect(parseBearing(`N 30°15'20" E and more`)).toBeNull();
  });
});

describe('the research route uses the shared parser', () => {
  const ROUTE = fs.readFileSync(
    path.join(process.cwd(), 'app/api/admin/research/[projectId]/boundary/route.ts'),
    'utf8',
  );

  it('imports it', () => {
    expect(ROUTE).toContain("from '@/lib/cad/geometry/bearing'");
  });

  it('and CALLS it', () => {
    // Importing is not using. A mutation replacing the body with `bearing ? 0 : null` passed the
    // import check and the no-old-code check together — every leg would have come out due north
    // and nothing in this file would have noticed.
    expect(ROUTE).toContain('parseBearing(bearing)');
  });

  it('no longer carries its own quadrant arithmetic', async () => {
    // The signature of the copy: the four quadrant branches. Two parsers that disagree is worse
    // than one that is too strict, because only one of them gets fixed.
    const { stripComments } = await import('../../scripts/audit-starr-assumptions.mjs');
    const code = stripComments(ROUTE);
    expect(code).toContain('parseBearingToDecimal');          // control: the stripper kept the code
    expect(code, 'a local quadrant-to-azimuth conversion is back').not.toContain("ns === 'S' && ew === 'W'");
    expect(code).not.toContain('180 + quad');
  });
});
