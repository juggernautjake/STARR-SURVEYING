// __tests__/hub/grid-model.test.ts
//
// Slice 7 of employee-hub-overhaul-2026-05-30.md. Locks the
// single-source-of-truth grid model: HUB_GRID_COLS = 8 governs both
// the modal editor (GRID_EDITOR_COLS aliases it) and the
// breakpointForWidth desktop branch, so the modal's paints land in
// the same cells the canvas renders. Pure helpers
// (clampRectToGrid / isInsideGrid / gridRectToPixels) are covered
// with fixed inputs, and source-regex assertions on the production
// files lock the call-site imports.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import {
  HUB_DESKTOP_BREAKPOINT,
  HUB_EDITOR_ROWS,
  HUB_GRID_COLS,
  clampRectToGrid,
  gridRectToPixels,
  isInsideGrid,
} from '@/lib/hub/grid-model';
import { breakpointForWidth } from '@/lib/hub/grid-math';
import {
  GRID_EDITOR_COLS,
  GRID_EDITOR_ROWS,
} from '@/lib/hub/components/GridEditor';

describe('Slice 7 — shared grid model constants', () => {
  it('HUB_GRID_COLS is 8 (the saved-layout column count)', () => {
    expect(HUB_GRID_COLS).toBe(8);
  });

  it('HUB_EDITOR_ROWS is 12 (the modal editor row cap — 8 wide × 12 tall)', () => {
    expect(HUB_EDITOR_ROWS).toBe(12);
  });

  it('GRID_EDITOR_COLS / ROWS in GridEditor re-export the shared constants', () => {
    expect(GRID_EDITOR_COLS).toBe(HUB_GRID_COLS);
    expect(GRID_EDITOR_ROWS).toBe(HUB_EDITOR_ROWS);
  });

  it('the desktop breakpoint agrees with HUB_GRID_COLS', () => {
    expect(HUB_DESKTOP_BREAKPOINT).toBe(HUB_GRID_COLS);
    expect(breakpointForWidth(2000)).toBe(HUB_GRID_COLS);
    expect(breakpointForWidth(1024)).toBe(HUB_GRID_COLS);
  });
});

describe('Slice 7 — clampRectToGrid', () => {
  it('passes through a rect that already fits', () => {
    expect(clampRectToGrid({ x: 1, y: 1, w: 2, h: 2 })).toEqual({ x: 1, y: 1, w: 2, h: 2 });
  });

  it('clamps negative coordinates to 0', () => {
    expect(clampRectToGrid({ x: -3, y: -1, w: 2, h: 2 })).toEqual({ x: 0, y: 0, w: 2, h: 2 });
  });

  it('clamps overflow so the right/bottom edges stay inside the grid', () => {
    // x=7, w=4 would overflow cols=8 → x snaps left to fit.
    const out = clampRectToGrid({ x: 7, y: 7, w: 4, h: 4 }, 8, 8);
    expect(out.x + out.w).toBeLessThanOrEqual(8);
    expect(out.y + out.h).toBeLessThanOrEqual(8);
    expect(out.w).toBe(4);
    expect(out.h).toBe(4);
  });

  it('caps w/h to the grid dimensions', () => {
    const out = clampRectToGrid({ x: 0, y: 0, w: 20, h: 20 }, 8, 8);
    expect(out.w).toBe(8);
    expect(out.h).toBe(8);
  });

  it('floors w/h to integers and never returns < 1', () => {
    const out = clampRectToGrid({ x: 0, y: 0, w: 0.4, h: -2 });
    expect(out.w).toBeGreaterThanOrEqual(1);
    expect(out.h).toBeGreaterThanOrEqual(1);
  });
});

describe('Slice 7 — isInsideGrid', () => {
  it('true for a rect that fits inside the default 8×12 grid', () => {
    expect(isInsideGrid({ x: 0, y: 0, w: 8, h: 12 })).toBe(true);
    expect(isInsideGrid({ x: 3, y: 3, w: 2, h: 2 })).toBe(true);
  });

  it('false for negatives, overflow, or sub-unit sizes', () => {
    expect(isInsideGrid({ x: -1, y: 0, w: 2, h: 2 })).toBe(false);
    expect(isInsideGrid({ x: 7, y: 0, w: 2, h: 2 })).toBe(false); // right overflow (cols=8)
    expect(isInsideGrid({ x: 0, y: 11, w: 2, h: 2 })).toBe(false); // bottom overflow (rows=12)
    expect(isInsideGrid({ x: 0, y: 0, w: 0, h: 1 })).toBe(false);
  });
});

describe('Slice 7 — gridRectToPixels', () => {
  it('zero-gap layout multiplies coordinates by the cell size', () => {
    const out = gridRectToPixels({ x: 2, y: 3, w: 4, h: 2 }, 100, 0);
    expect(out).toEqual({ x: 200, y: 300, w: 400, h: 200 });
  });

  it('honors the gap between cells (cell width 100, gap 8) for w/h', () => {
    const out = gridRectToPixels({ x: 0, y: 0, w: 3, h: 2 }, 100, 8);
    // w=3 cells → 3*100 + 2*8 = 316
    expect(out.w).toBe(316);
    // h=2 cells → 2*100 + 1*8 = 208
    expect(out.h).toBe(208);
  });

  it('positions account for both the cell + gap', () => {
    const out = gridRectToPixels({ x: 2, y: 1, w: 1, h: 1 }, 100, 8);
    // x=2 → 2 * (100 + 8) = 216
    expect(out.x).toBe(216);
    expect(out.y).toBe(108);
  });

  it('a 1×1 rect at zero gap has dimensions equal to the cell size', () => {
    const out = gridRectToPixels({ x: 0, y: 0, w: 1, h: 1 }, 64);
    expect(out).toEqual({ x: 0, y: 0, w: 64, h: 64 });
  });
});

describe('Slice 7 — call-site imports go through grid-model', () => {
  const MOBILE_EDITOR = fs.readFileSync(
    path.join(__dirname, '..', '..', 'lib', 'hub', 'components', 'MobileEditor.tsx'),
    'utf8',
  );
  const GRID_EDITOR = fs.readFileSync(
    path.join(__dirname, '..', '..', 'lib', 'hub', 'components', 'GridEditor.tsx'),
    'utf8',
  );

  it('MobileEditor takes the column count from grid-model, not from a literal', () => {
    expect(MOBILE_EDITOR).toMatch(/import \{ HUB_GRID_COLS \} from '@\/lib\/hub\/grid-model';/);
    expect(MOBILE_EDITOR).toMatch(/Math\.min\(HUB_GRID_COLS,/);
    expect(MOBILE_EDITOR).not.toMatch(/Math\.min\(8,/);
  });

  // This block has now been trimmed twice by deletions, and the pattern is worth naming: Slice 17
  // removed LayoutTab with the SettingsPanel rail, and 2026-08-27 removed AddWidgetModal, which the
  // hub overhaul had retired long before. Each time the CALL SITE went and the RULE stayed — the
  // column count comes from grid-model, never from a literal 8 — so the assertion moves to whichever
  // surfaces are still mounted rather than being dropped along with the file it happened to sit on.

  it('GridEditor re-exports its constants from grid-model (no magic 8 literal)', () => {
    expect(GRID_EDITOR).toMatch(/import \{ HUB_EDITOR_ROWS, HUB_GRID_COLS \} from '@\/lib\/hub\/grid-model';/);
    expect(GRID_EDITOR).toMatch(/export const GRID_EDITOR_COLS = HUB_GRID_COLS;/);
    expect(GRID_EDITOR).toMatch(/export const GRID_EDITOR_ROWS = HUB_EDITOR_ROWS;/);
  });
});
