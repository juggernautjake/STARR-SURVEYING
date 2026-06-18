// __tests__/admin/hub-grid-editor-polish.test.ts
//
// grid-editor-polish-2026-06-18 — three polish changes to the
// GridEditor that surfaced from the user's 2026-06-18 feedback:
//   1. Palette hover tooltip surfaces the widget's `description`
//      so the surveyor knows what each tile does before placing.
//   2. The "WxH" size badge is hidden at rest; only renders
//      while a resize or move gesture is actively in flight.
//   3. The HTML5 drag image is replaced with a widget-sized
//      ghost so the cursor shows the actual placed footprint
//      during a palette → grid drag.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('GridEditor polish (2026-06-18)', () => {
  const SRC = read('lib/hub/components/GridEditor.tsx');

  it('palette hover title now embeds the widget description', () => {
    expect(SRC).toMatch(/title=\{`\$\{w\.label\} — \$\{w\.description\}/);
  });

  it("placed widget's size badge is gated on isResizing || isMoving", () => {
    expect(SRC).toMatch(/\{\(isResizing \|\| isMoving\) && \(\s*\n\s*<span style=\{placedSizeStyle\} data-testid="grid-editor-placed-size">/);
  });

  it('dragStart sets a custom drag image sized to the widget footprint', () => {
    expect(SRC).toMatch(/e\.dataTransfer\.setDragImage\(ghost,/);
    expect(SRC).toMatch(/const cellW = rect\.width \/ GRID_EDITOR_COLS/);
    expect(SRC).toMatch(/const cellH = rect\.height \/ GRID_EDITOR_ROWS/);
  });

  it('drag-anchor-fix-2026-06-18 — ghost is anchored at (0,0) so the preview matches the placed widget', () => {
    // The widget's placed cell is `cellUnderPointer` → widget top-left.
    // The ghost has to share that anchor (top-left under the cursor)
    // so the user drops where they see, not down-right of where they
    // see.
    expect(SRC).toMatch(/setDragImage\(ghost, 0, 0\)/);
  });

  it('drag ghost is removed from the DOM on the next tick (no leak)', () => {
    expect(SRC).toMatch(/setTimeout\(\(\) => \{ try \{ ghost\.remove\(\)/);
  });
});

describe('Weather widget extras (weather-extras-2026-06-18)', () => {
  const SRC = read('lib/hub/widgets/weather/index.tsx');

  it("renders the feels-like / humidity / rain chips at small+", () => {
    expect(SRC).toMatch(/data-testid="weather-extras-strip"/);
    expect(SRC).toMatch(/data-testid="weather-extra-feels"/);
    expect(SRC).toMatch(/data-testid="weather-extra-humidity"/);
    expect(SRC).toMatch(/data-testid="weather-extra-rain"/);
  });

  it('each extra chip is null-safe (rendered only when the field is non-null)', () => {
    expect(SRC).toMatch(/weather\.feels_like_f != null && \(/);
    expect(SRC).toMatch(/weather\.humidity_pct != null && \(/);
    expect(SRC).toMatch(/weather\.rain_chance_pct != null && \(/);
  });

  it('forecast strip shows per-day rain chance when present', () => {
    expect(SRC).toMatch(/d\.rain_chance_pct != null && \(/);
  });
});
