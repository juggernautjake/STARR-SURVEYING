// __tests__/research/traverse-geometry.test.ts
//
// ── WHAT THIS FILE USED TO BE, AND WHY IT IS SMALLER NOW ────────────────────────────────────────
//
// The previous slice pulled the traverse maths out of `page.tsx` and wrote seventeen tests for it.
// The maths was correct and the tests were good. The module was still a **mistake**: this repository
// already had `lib/cad/geometry/bearing.ts` — `forwardPoint`, `inverseBearingDistance`,
// `azimuthToQuadrant`, `formatBearing` — with its own tests and five CAD components using it.
//
// So that slice fixed "untested" by introducing "duplicated", which is the worse of the two. A
// second copy of a coordinate convention drifts, and the page's copy is the one that runs. The
// commit message for that very slice said so about `azimuthToBearingSimple`.
//
// Found by grepping `Math.sin(rad)` across the repo while chasing a THIRD copy inside
// `handleUpdateVertex` — the search that should have run before any of it was written.
//
// What is tested here now is what is actually this page's: **when** a traverse should close, and
// **that the page uses the shared geometry** rather than growing another copy. The maths itself is
// covered by `__tests__/cad/geometry/bearing.test.ts`, where it belongs.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { CLOSED_TOLERANCE, needsClosing } from '../../app/admin/research/[projectId]/_sections/traverse-geometry';
import { forwardPoint, inverseBearingDistance } from '../../lib/cad/geometry/bearing';

describe('needsClosing — a decision, not geometry', () => {
  it('refuses fewer than three vertices', () => {
    // Two points are a line; closing them retraces the same leg backwards, and the report shows a
    // second leg lying on top of the first.
    expect(needsClosing([])).toBe(false);
    expect(needsClosing([{ x: 0, y: 0 }])).toBe(false);
    expect(needsClosing([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBe(false);
  });

  it('is true for an open figure', () => {
    expect(needsClosing([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }])).toBe(true);
  });

  it('is false when it already closes', () => {
    // A zero-length leg puts a duplicate vertex on the first corner, and the deliverable shows a
    // leg of 0.00 feet.
    expect(needsClosing([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 0 }])).toBe(false);
  });

  it('treats within-tolerance as closed', () => {
    const v = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: CLOSED_TOLERANCE / 2, y: 0 }];
    expect(needsClosing(v)).toBe(false);
  });

  it('measures the gap with the shared inverse, not its own', () => {
    // The one line of geometry left in this module delegates. If it grew its own distance formula
    // the two would drift, which is the whole reason this file shrank.
    const src = fs.readFileSync(
      path.join(process.cwd(), 'app/admin/research/[projectId]/_sections/traverse-geometry.ts'),
      'utf8',
    );
    expect(src).toContain("from '@/lib/cad/geometry/bearing'");
    expect(src, 'a local distance formula is how the copies started').not.toContain('Math.sqrt');
  });
});

describe('the round trip, as a property of the shared geometry', () => {
  it('closing a leg and walking it lands on the first corner', () => {
    // Kept from the previous slice because it is the assertion that catches a sign or
    // argument-order slip even when the individual numbers look plausible. It now exercises the
    // CANONICAL functions, which is what the page calls.
    const first = { x: 12.5, y: -3.25 };
    const last = { x: -40, y: 88 };
    const leg = inverseBearingDistance(first, last);
    // `inverseBearingDistance(from, to)` gives the leg FROM first TO last, so walking it from
    // `first` must arrive at `last`.
    const there = forwardPoint(first, leg.azimuth, leg.distance);
    expect(there.x).toBeCloseTo(last.x, 6);
    expect(there.y).toBeCloseTo(last.y, 6);
  });
});

describe('the page uses the shared geometry, and has no copy of its own', () => {
  const PAGE = fs.readFileSync(
    path.join(process.cwd(), 'app/admin/research/[projectId]/page.tsx'),
    'utf8',
  );

  it('imports it from the CAD library', () => {
    expect(PAGE).toContain("from '@/lib/cad/geometry/bearing'");
  });

  it('adds a leg, closes a traverse and edits a vertex through it', () => {
    // Three call sites; the third — `handleUpdateVertex` — was a separate copy of the same maths
    // and is what led to finding the duplication at all.
    expect(PAGE.split('forwardPoint(').length - 1, 'both forward call sites should use it')
      .toBeGreaterThanOrEqual(2);
    expect(PAGE).toContain('inverseBearingDistance(coordVertices[0]');
  });

  it('carries no local azimuth-to-coordinate maths', async () => {
    // The signature of every copy: `Math.sin(rad)` on the easting. Three of them lived in this
    // file. A fourth must not appear.
    const { stripComments } = await import('../../scripts/audit-starr-assumptions.mjs');
    const code = stripComments(PAGE);
    expect(code).toContain('function handleCloseTraverse');   // control: the stripper kept the code
    expect(code, 'a local copy of the azimuth maths is back').not.toContain('Math.sin(rad)');
    expect(code).not.toContain('azimuthToBearingSimple');
  });

  it('shows bearings the way the rest of the product does', () => {
    // The page rendered `N 30° 0' 0" E` while every CAD surface rendered `N 30°00'00" E`. One
    // product, two bearing formats, is a defect of its own — and the survey-standard zero-padded
    // form is the one five other components already use.
    expect(PAGE).toContain('formatBearing(leg.azimuth)');
  });
});
