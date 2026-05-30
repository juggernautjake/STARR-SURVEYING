// __tests__/hub/grid-editor-auto-format.test.ts
//
// grid-editor-auto-format 2026-05-30 — locks the pure helpers that
// power the Auto-format button: sortAndCompactDraft + layoutsMatch.

import { describe, it, expect } from 'vitest';
import {
  sortAndCompactDraft,
  layoutsMatch,
} from '@/lib/hub/components/GridEditor';
import type { WidgetInstance } from '@/lib/hub/types';

function wi(id: string, x: number, y: number, w: number, h: number): WidgetInstance {
  return { id, type: 't', x, y, w, h, customization: undefined as never };
}

describe('sortAndCompactDraft', () => {
  it('packs a single widget at (0, 0)', () => {
    const out = sortAndCompactDraft([wi('a', 4, 9, 2, 2)], 8);
    expect(out).toEqual([{ id: 'a', type: 't', x: 0, y: 0, w: 2, h: 2, customization: undefined }]);
  });

  it('closes both vertical AND horizontal gaps (tight pack)', () => {
    // Three 3×2 widgets stacked vertically. After auto-format two fit
    // side-by-side on row 0 (cols 0-2 + cols 3-5), and the third drops
    // to row 2. That's the tightest pack against (0, 0) in a width-8
    // grid.
    const draft = [
      wi('a', 0, 0, 3, 2),
      wi('b', 0, 5, 3, 2),
      wi('c', 0, 9, 3, 2),
    ];
    const out = sortAndCompactDraft(draft, 8);
    expect(out.map((w) => `${w.id}@${w.x},${w.y}`)).toEqual([
      'a@0,0', 'b@3,0', 'c@0,2',
    ]);
  });

  it('reads in (y, then x) order — top-left first, bottom-right last', () => {
    // A is bottom-right, B is top-left — output should put B first.
    const draft = [wi('A', 5, 9, 2, 2), wi('B', 0, 0, 2, 2)];
    const out = sortAndCompactDraft(draft, 8);
    expect(out.map((w) => w.id)).toEqual(['B', 'A']);
    expect(out[0]).toMatchObject({ x: 0, y: 0 });
  });

  it('fits two widgets on the same row when they fit width-wise', () => {
    const draft = [wi('left', 0, 0, 3, 2), wi('right', 5, 0, 3, 2)];
    const out = sortAndCompactDraft(draft, 8);
    expect(out.map((w) => `${w.id}@${w.x},${w.y}`)).toEqual([
      'left@0,0', 'right@3,0',
    ]);
  });

  it('preserves each widget\'s w + h (sizes don\'t change)', () => {
    const draft = [wi('a', 4, 4, 3, 2), wi('b', 4, 9, 2, 3)];
    const out = sortAndCompactDraft(draft, 8);
    expect(out.find((w) => w.id === 'a')).toMatchObject({ w: 3, h: 2 });
    expect(out.find((w) => w.id === 'b')).toMatchObject({ w: 2, h: 3 });
  });
});

describe('layoutsMatch', () => {
  it('true when both lists have the same widgets at the same positions', () => {
    const a = [wi('x', 0, 0, 2, 2), wi('y', 3, 3, 3, 2)];
    const b = [wi('y', 3, 3, 3, 2), wi('x', 0, 0, 2, 2)]; // re-ordered
    expect(layoutsMatch(a, b)).toBe(true);
  });
  it('false when sizes change', () => {
    const a = [wi('x', 0, 0, 2, 2)];
    const b = [wi('x', 0, 0, 3, 2)];
    expect(layoutsMatch(a, b)).toBe(false);
  });
  it('false when positions change', () => {
    const a = [wi('x', 0, 0, 2, 2)];
    const b = [wi('x', 1, 0, 2, 2)];
    expect(layoutsMatch(a, b)).toBe(false);
  });
  it('false when widgets are added / removed', () => {
    const a = [wi('x', 0, 0, 2, 2)];
    const b = [wi('x', 0, 0, 2, 2), wi('y', 3, 0, 2, 2)];
    expect(layoutsMatch(a, b)).toBe(false);
  });
  it('false when ids differ', () => {
    const a = [wi('x', 0, 0, 2, 2)];
    const b = [wi('y', 0, 0, 2, 2)];
    expect(layoutsMatch(a, b)).toBe(false);
  });
});
