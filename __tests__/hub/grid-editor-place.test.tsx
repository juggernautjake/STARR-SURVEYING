// __tests__/hub/grid-editor-place.test.tsx
//
// Slice 223 of hub-grid-editor-and-banner-green-2026-05-29.md. Locks
// the pure placement helpers (rectFromAnchors / clampRectToEnvelope /
// overlapsAny / generatePlacementId) and the SSR-render of the armed
// grid (cells switch to crosshair cursor + accent tint when a widget
// type is selected).
//
// Slice P2 (grid-editor-single-click-and-8x12-2026-05-30) replaced the
// two-click "paint a rectangle" placement with single-click drop at
// the widget's default size. rectFromAnchors stays exported as a pure
// helper (still unit-tested below) but is no longer wired into the
// placement handler. The single-click handler wiring is locked in
// grid-editor-single-click-place.test.ts.

import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import * as ReactDOMServer from 'react-dom/server';

import GridEditor, {
  rectFromAnchors,
  clampRectToEnvelope,
  overlapsAny,
  generatePlacementId,
} from '@/lib/hub/components/GridEditor';
import { useHubStore } from '@/lib/hub/hub-store';
import '@/lib/hub/widgets/register-all';

beforeEach(() => {
  useHubStore.getState().cancelEdit();
});

describe('rectFromAnchors — two-click placement geometry', () => {
  it('top-left → bottom-right produces the obvious rectangle', () => {
    expect(rectFromAnchors({ x: 1, y: 1 }, { x: 4, y: 3 })).toEqual({
      x: 1, y: 1, w: 4, h: 3,
    });
  });

  it('bottom-right → top-left produces the same rectangle (order-insensitive)', () => {
    expect(rectFromAnchors({ x: 4, y: 3 }, { x: 1, y: 1 })).toEqual({
      x: 1, y: 1, w: 4, h: 3,
    });
  });

  it('single-cell click + same cell click = 1×1 rect', () => {
    expect(rectFromAnchors({ x: 2, y: 2 }, { x: 2, y: 2 })).toEqual({
      x: 2, y: 2, w: 1, h: 1,
    });
  });

  it('clamps coordinates to the 8×12 grid (negative + out-of-range)', () => {
    expect(rectFromAnchors({ x: -3, y: -5 }, { x: 99, y: 99 })).toEqual({
      x: 0, y: 0, w: 8, h: 12,
    });
  });

  it('honors a custom grid size when provided', () => {
    expect(rectFromAnchors({ x: 0, y: 0 }, { x: 11, y: 5 }, 4, 4)).toEqual({
      x: 0, y: 0, w: 4, h: 4,
    });
  });
});

describe('clampRectToEnvelope — widget min/max envelope', () => {
  const MIN = { w: 2, h: 2 };
  const MAX = { w: 6, h: 6 };

  it('grows a too-small rect up to the widget min size', () => {
    expect(clampRectToEnvelope({ x: 0, y: 0, w: 1, h: 1 }, MIN, MAX)).toEqual({
      x: 0, y: 0, w: 2, h: 2,
    });
  });

  it('shrinks a too-big rect down to the widget max size', () => {
    expect(clampRectToEnvelope({ x: 0, y: 0, w: 8, h: 8 }, MIN, MAX)).toEqual({
      x: 0, y: 0, w: 6, h: 6,
    });
  });

  it('respects min/max in a single dimension independently', () => {
    expect(clampRectToEnvelope({ x: 0, y: 0, w: 1, h: 8 }, MIN, MAX)).toEqual({
      x: 0, y: 0, w: 2, h: 6,
    });
  });

  it('shifts x left so the widget still fits inside the 8×12 grid', () => {
    // A clamped 6-wide widget anchored at x=5 would extend to x=11;
    // the function pulls x back to 2 (so x+w = 8). y=5 + h=6 = 11 ≤ 12
    // so y stays put now that the grid is 12 tall.
    expect(clampRectToEnvelope({ x: 5, y: 5, w: 8, h: 8 }, MIN, MAX)).toEqual({
      x: 2, y: 5, w: 6, h: 6,
    });
  });
});

describe('overlapsAny — collision detection', () => {
  const EXISTING = [
    { x: 0, y: 0, w: 4, h: 3 },
    { x: 4, y: 0, w: 2, h: 2 },
  ];

  it('returns true when the candidate overlaps any existing widget', () => {
    expect(overlapsAny({ x: 2, y: 1, w: 2, h: 2 }, EXISTING)).toBe(true);
  });

  it('returns false when the candidate fits in a gap', () => {
    expect(overlapsAny({ x: 0, y: 4, w: 4, h: 2 }, EXISTING)).toBe(false);
  });

  it('returns false against an empty existing list', () => {
    expect(overlapsAny({ x: 0, y: 0, w: 8, h: 8 }, [])).toBe(false);
  });

  it('edge-touching does NOT count as overlap', () => {
    // The widget at (0,0,4,3) ends at x=4 / y=3 — a candidate at
    // (4,3,2,2) sits right next to it without overlapping.
    expect(overlapsAny({ x: 4, y: 3, w: 2, h: 2 }, EXISTING)).toBe(false);
  });
});

describe('generatePlacementId — fresh id every call', () => {
  it('returns a non-empty string', () => {
    expect(typeof generatePlacementId()).toBe('string');
    expect(generatePlacementId().length).toBeGreaterThan(8);
  });

  it('each call produces a different id', () => {
    const a = generatePlacementId();
    const b = generatePlacementId();
    expect(a).not.toBe(b);
  });
});

describe('GridEditor — armed grid SSR render', () => {
  it('grid container marks itself data-placing=false when no widget is selected', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      <GridEditor open onClose={() => {}} roles={[]} />,
    );
    expect(html).toContain('data-placing="false"');
    // None of the cells should declare role="button" yet.
    expect(html).not.toContain('aria-label="Grid cell 1, 1" role="button"');
  });

  it('palette entries include the searchable input + listbox role', () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      <GridEditor open onClose={() => {}} roles={[]} />,
    );
    // Sanity that the palette is still wired alongside the placement
    // surface — without it the slice 222 contract regresses.
    expect(html).toContain('aria-label="Available widgets"');
    expect(html).toContain('role="listbox"');
  });
});
