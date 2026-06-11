// __tests__/cad/ui/box-select-direction-hint.test.ts
//
// cad-ux-cleanup-pass Slice 12 — box-select rectangle color-codes by
// drag direction (blue = window / left-to-right, green = crossing /
// right-to-left), and the StatusBar shows a matching caption while
// dragging. The new `boxSelectColorHint` setting (default true) lets
// the surveyor opt out — the rectangle then renders in a single
// neutral color and the caption is suppressed.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.join(__dirname, '..', '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('CanvasViewport — box-select color hint', () => {
  const SRC = read('app/admin/cad/components/CanvasViewport.tsx');

  it('honors docSettings.boxSelectColorHint (default true)', () => {
    expect(SRC).toMatch(/const colorHint = docSettings\.boxSelectColorHint !== false/);
  });

  it('renders blue for window, green for crossing when hint is on; neutral when off', () => {
    expect(SRC).toMatch(/colorHint\s*\?\s*\(isWindowSelect \? 0x0044ff : 0x00aa00\)\s*:\s*0x0088ff/);
  });

  it('broadcasts the live direction (WINDOW / CROSSING / null) on cad:boxSelectMode', () => {
    expect(SRC).toMatch(/boxSelectModeRef = useRef<'WINDOW' \| 'CROSSING' \| null>\(null\)/);
    expect(SRC).toMatch(/cad:boxSelectMode/);
    // Per-frame thrash guard.
    expect(SRC).toMatch(/boxSelectLastEmittedRef/);
  });

  it('suppresses the caption broadcast when colorHint is off', () => {
    expect(SRC).toMatch(
      /if \(colorHint\) \{\s*\n\s*boxSelectModeRef\.current = isWindowSelect \? 'WINDOW' : 'CROSSING'/,
    );
  });
});

describe('StatusBar — direction caption renders while dragging', () => {
  const SRC = read('app/admin/cad/components/StatusBar.tsx');

  it('subscribes to cad:boxSelectMode and stores the live mode', () => {
    expect(SRC).toMatch(/useState<'WINDOW' \| 'CROSSING' \| null>\(null\)/);
    expect(SRC).toMatch(/window\.addEventListener\('cad:boxSelectMode'/);
  });

  it('renders distinct WINDOW (blue) and CROSSING (green) labels with helpful titles', () => {
    expect(SRC).toMatch(/data-testid="status-box-select-mode"[\s\S]*?WINDOW \(encloses fully\)/);
    expect(SRC).toMatch(/data-testid="status-box-select-mode"[\s\S]*?CROSSING \(intersects\)/);
  });
});

describe('SettingsDialog — opt-out toggle wired', () => {
  const SRC = read('app/admin/cad/components/SettingsDialog.tsx');

  it('renders a Box Select Direction Hint toggle bound to drawingStore.updateSettings', () => {
    expect(SRC).toMatch(/Box Select Direction Hint/);
    expect(SRC).toMatch(/boxSelectColorHint: v/);
    expect(SRC).toMatch(/settings\.boxSelectColorHint !== false/);
  });
});

describe('DrawingSettings — boxSelectColorHint field declared', () => {
  const SRC = read('lib/cad/types.ts');
  it('boxSelectColorHint is an optional boolean (default treated as true)', () => {
    expect(SRC).toMatch(/boxSelectColorHint\?: boolean/);
  });
});
