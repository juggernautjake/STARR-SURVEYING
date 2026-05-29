// __tests__/cad/ui/cert-notes-hit-bounds.test.ts
//
// Slice 226 of cad-cert-notes-context-menu-2026-05-29.md. Locks the
// pure hit-test contract for the title-block + paper-furniture
// element bounds: priority ordering, miss reporting, and the new
// cert + notes branches that surface the right-click menu.

import { describe, it, expect } from 'vitest';
import { hitTestTBElementPure, type TBElementBounds } from '@/app/admin/cad/components/CanvasViewport';

function rect(x: number, y: number, w: number, h: number) {
  return { screenX: x, screenY: y, w, h };
}

function bounds(over: Partial<TBElementBounds> = {}): TBElementBounds {
  return {
    northArrow: null,
    titleBlock: null,
    scaleBar: null,
    signatureBlock: null,
    officialSealLabel: null,
    certification: null,
    notes: null,
    ...over,
  };
}

describe('hitTestTBElementPure — hits + misses', () => {
  it('returns null when every rect is null', () => {
    expect(hitTestTBElementPure(50, 50, bounds())).toBeNull();
  });

  it('hits the certification block (Slice 226)', () => {
    expect(
      hitTestTBElementPure(120, 220, bounds({ certification: rect(100, 200, 200, 80) })),
    ).toBe('certification');
  });

  it('hits the survey notes block (Slice 226)', () => {
    expect(
      hitTestTBElementPure(20, 320, bounds({ notes: rect(10, 300, 220, 120) })),
    ).toBe('notes');
  });

  it('reports null for a point just outside the cert rect', () => {
    expect(
      hitTestTBElementPure(99, 199, bounds({ certification: rect(100, 200, 50, 50) })),
    ).toBeNull();
    expect(
      hitTestTBElementPure(151, 200, bounds({ certification: rect(100, 200, 50, 50) })),
    ).toBeNull();
  });

  it('hits the cell exactly at the right/bottom edge (≤ is inclusive)', () => {
    expect(
      hitTestTBElementPure(150, 250, bounds({ certification: rect(100, 200, 50, 50) })),
    ).toBe('certification');
  });
});

describe('hitTestTBElementPure — priority ordering', () => {
  it('northArrow wins over a co-located titleBlock', () => {
    expect(
      hitTestTBElementPure(
        110, 110,
        bounds({
          northArrow: rect(100, 100, 80, 80),
          titleBlock: rect(100, 100, 80, 80),
        }),
      ),
    ).toBe('northArrow');
  });

  it('officialSealLabel wins over its containing signatureBlock', () => {
    expect(
      hitTestTBElementPure(
        50, 50,
        bounds({
          signatureBlock:    rect(0, 0, 200, 200),
          officialSealLabel: rect(40, 40, 30, 30),
        }),
      ),
    ).toBe('officialSealLabel');
  });

  it('Cert + Notes sit BELOW the more-specific TB elements in priority', () => {
    // When a cert rect overlaps the title block, the title block
    // takes priority so the user can still grab the more-specific
    // element. Locks the Slice-226 ordering decision.
    expect(
      hitTestTBElementPure(
        150, 150,
        bounds({
          titleBlock:    rect(100, 100, 200, 200),
          certification: rect(100, 100, 200, 200),
        }),
      ),
    ).toBe('titleBlock');
  });

  it('Notes is tested after Certification (deterministic order)', () => {
    expect(
      hitTestTBElementPure(
        150, 150,
        bounds({
          certification: rect(100, 100, 200, 200),
          notes:         rect(100, 100, 200, 200),
        }),
      ),
    ).toBe('certification');
  });
});

describe('hitTestTBElementPure — empty / outside paper-furniture rects', () => {
  it('falls through to null when the hit point is outside both blocks', () => {
    expect(
      hitTestTBElementPure(
        999, 999,
        bounds({
          certification: rect(0, 0, 100, 100),
          notes:         rect(200, 200, 100, 100),
        }),
      ),
    ).toBeNull();
  });
});
