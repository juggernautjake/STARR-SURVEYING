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

  it('HUB_EDITOR_ROWS is 8 (the modal editor row cap)', () => {
    expect(HUB_EDITOR_ROWS).toBe(8);
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
  it('true for a rect that fits inside the default 8×8 grid', () => {
    expect(isInsideGrid({ x: 0, y: 0, w: 8, h: 8 })).toBe(true);
    expect(isInsideGrid({ x: 3, y: 3, w: 2, h: 2 })).toBe(true);
  });

  it('false for negatives, overflow, or sub-unit sizes', () => {
    expect(isInsideGrid({ x: -1, y: 0, w: 2, h: 2 })).toBe(false);
    expect(isInsideGrid({ x: 7, y: 0, w: 2, h: 2 })).toBe(false); // right overflow
    expect(isInsideGrid({ x: 0, y: 7, w: 2, h: 2 })).toBe(false); // bottom overflow
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
  const ADD_WIDGET = fs.readFileSync(
    path.join(__dirname, '..', '..', 'lib', 'hub', 'components', 'AddWidgetModal.tsx'),
    'utf8',
  );
  const LAYOUT_TAB = fs.readFileSync(
    path.join(__dirname, '..', '..', 'lib', 'hub', 'components', 'settings', 'LayoutTab.tsx'),
    'utf8',
  );
  const GRID_EDITOR = fs.readFileSync(
    path.join(__dirname, '..', '..', 'lib', 'hub', 'components', 'GridEditor.tsx'),
    'utf8',
  );

  it('AddWidgetModal imports HUB_GRID_COLS and uses it in compactLayout', () => {
    expect(ADD_WIDGET).toMatch(/import \{ HUB_GRID_COLS \} from '@\/lib\/hub\/grid-model';/);
    expect(ADD_WIDGET).toMatch(/compactLayout\([\s\S]*?,\s*HUB_GRID_COLS\)/);
    expect(ADD_WIDGET).not.toMatch(/compactLayout\([\s\S]*?,\s*8\)/);
  });

  it('LayoutTab imports HUB_GRID_COLS and uses it in compactLayout', () => {
    expect(LAYOUT_TAB).toMatch(/import \{ HUB_GRID_COLS \} from '@\/lib\/hub\/grid-model';/);
    expect(LAYOUT_TAB).toMatch(/compactLayout\([\s\S]*?,\s*HUB_GRID_COLS\)/);
    expect(LAYOUT_TAB).not.toMatch(/compactLayout\([\s\S]*?,\s*8\)/);
  });

  it('GridEditor re-exports its constants from grid-model (no magic 8 literal)', () => {
    expect(GRID_EDITOR).toMatch(/import \{ HUB_EDITOR_ROWS, HUB_GRID_COLS \} from '@\/lib\/hub\/grid-model';/);
    expect(GRID_EDITOR).toMatch(/export const GRID_EDITOR_COLS = HUB_GRID_COLS;/);
    expect(GRID_EDITOR).toMatch(/export const GRID_EDITOR_ROWS = HUB_EDITOR_ROWS;/);
  });
});
