// __tests__/cad/ui/cert-notes-hit-bounds.test.ts
//
// Slice 226 of cad-cert-notes-context-menu-2026-05-29.md. Locks the
// pure hit-test contract for the title-block + paper-furniture
// element bounds: priority ordering, miss reporting, and the new
// cert + notes branches that surface the right-click menu.

//
// ── S19b, 2026-08-04: this import used to reach into `CanvasViewport.tsx` ────────────────────────
//
// The function was exported from a 15,000-line `'use client'` component, so this file loaded Pixi,
// the drawing store and the tooltip context to check whether a point is inside a rectangle. That is
// the second cost of a file that size — the first, named in S19a, is code inside it that cannot be
// tested at all; this is the mirror image, code that can be tested only by loading a renderer.

import { describe, it, expect } from 'vitest';
import {
  hitTestTBElementPure,
  TB_HIT_PRIORITY,
  type TBElementBounds,
} from '@/lib/cad/sheet/title-block-hit-test';

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

describe('the priority ORDER, as a sequence rather than case by case (S19b)', () => {
  // Every case above pins one pair. None of them would fail if the list were reordered in a way
  // that still happens to satisfy each pair individually — and a small target that becomes
  // permanently unclickable is exactly the bug nobody reports as a bug, because the sheet still
  // works and one thing is simply never grabbable.
  it('tests the small, specific elements before the large blocks that sit under them', () => {
    expect([...TB_HIT_PRIORITY]).toEqual([
      'northArrow',
      'titleBlock',
      'scaleBar',
      // Above its own container: the seal label lives INSIDE the signature block.
      'officialSealLabel',
      'signatureBlock',
      // Paper furniture last — these are large and would shadow everything above them.
      'certification',
      'notes',
    ]);
  });

  it('the order is the one the function actually applies', () => {
    // The list above is only documentation unless it matches behaviour. Overlap every element on one
    // point and walk the list: at each step, the winner must be the earliest element still present.
    const all = (only: string[]): TBElementBounds => ({
      northArrow: only.includes('northArrow') ? rect(0, 0, 100, 100) : null,
      titleBlock: only.includes('titleBlock') ? rect(0, 0, 100, 100) : null,
      scaleBar: only.includes('scaleBar') ? rect(0, 0, 100, 100) : null,
      signatureBlock: only.includes('signatureBlock') ? rect(0, 0, 100, 100) : null,
      officialSealLabel: only.includes('officialSealLabel') ? rect(0, 0, 100, 100) : null,
      certification: only.includes('certification') ? rect(0, 0, 100, 100) : null,
      notes: only.includes('notes') ? rect(0, 0, 100, 100) : null,
    });

    const remaining = [...TB_HIT_PRIORITY] as string[];
    while (remaining.length > 0) {
      expect(
        hitTestTBElementPure(50, 50, all(remaining)),
        `with ${remaining.join(', ')} all under the cursor, ${remaining[0]} must win`,
      ).toBe(remaining[0]);
      remaining.shift();
    }
  });
});
