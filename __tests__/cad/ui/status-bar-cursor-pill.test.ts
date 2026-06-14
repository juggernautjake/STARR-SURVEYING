// __tests__/cad/ui/status-bar-cursor-pill.test.ts
//
// cad-desktop-tauri-and-perf Slice P6 — React boundary audit.
// Split the StatusBar's mousemove-driven cursor + live distance
// pill into its own memoized sub-component so the surrounding
// status bar stops reconciling on every cursor tick. Source-locked
// here.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.join(__dirname, '..', '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('StatusBarCursorPill — memoized sub-component shape', () => {
  const SRC = read('app/admin/cad/components/StatusBarCursorPill.tsx');

  it('is wrapped in React.memo so prop-equal re-renders short-circuit', () => {
    expect(SRC).toMatch(/import \{ memo \} from 'react'/);
    expect(SRC).toMatch(/const StatusBarCursorPill = memo\(StatusBarCursorPillInner\)/);
    expect(SRC).toMatch(/StatusBarCursorPill\.displayName = 'StatusBarCursorPill'/);
  });

  it('subscribes to viewport + tool store via per-field selectors (zustand bailout)', () => {
    expect(SRC).toMatch(/useViewportStore\(\(s\) => s\.cursorWorld\)/);
    expect(SRC).toMatch(/useToolStore\(\(s\) => s\.state\.activeTool\)/);
    expect(SRC).toMatch(/useToolStore\(\(s\) => s\.state\.drawingPoints\)/);
    expect(SRC).toMatch(/useToolStore\(\(s\) => s\.state\.basePoint\)/);
    expect(SRC).toMatch(/useToolStore\(\(s\) => s\.state\.rotateCenter\)/);
  });

  it('takes `prefs` as a prop (no DisplayPreferences subscription inside)', () => {
    expect(SRC).toMatch(/interface Props \{[\s\S]*?prefs: DisplayPreferences;/);
    expect(SRC).not.toMatch(/useDrawingStore\(/);
  });

  it('renders the coords pill + the conditional dist/bearing block', () => {
    expect(SRC).toMatch(/coords\.label1[\s\S]*?coords\.value1[\s\S]*?coords\.label2[\s\S]*?coords\.value2/);
    expect(SRC).toMatch(/d=\{distanceInfo\.dist\}/);
    expect(SRC).toMatch(/\{distanceInfo\.bearing\}/);
  });

  it('matches the original active-tool gating semantics', () => {
    expect(SRC).toMatch(/activeTool\.startsWith\('DRAW_'\) \|\|\s*\n\s*activeTool === 'MOVE' \|\|\s*\n\s*activeTool === 'COPY' \|\|\s*\n\s*activeTool === 'MIRROR'/);
  });
});

describe('StatusBar — parent stops reading cursor/dist state', () => {
  const SRC = read('app/admin/cad/components/StatusBar.tsx');

  it('renders the extracted pill (no inline coords/dist JSX in the parent)', () => {
    expect(SRC).toMatch(/<StatusBarCursorPill prefs=\{prefs\} \/>/);
    // The inline JSX is gone — coords + dist no longer reference
    // cursor fields directly from the parent.
    expect(SRC).not.toMatch(/d=\{distanceInfo\.dist\}/);
    expect(SRC).not.toMatch(/coords\.label1/);
  });

  it('drops the `cursor`, `drawingPoints`, `basePoint`, `rotateCenter` destructures', () => {
    expect(SRC).not.toMatch(/const cursor = viewportStore\.cursorWorld;/);
    expect(SRC).not.toMatch(/, drawingPoints,/);
    expect(SRC).not.toMatch(/, basePoint,/);
    expect(SRC).not.toMatch(/, rotateCenter,/);
  });

  it('imports the sub-component', () => {
    expect(SRC).toMatch(/import StatusBarCursorPill from '\.\/StatusBarCursorPill'/);
  });

  it('keeps the zoom read (the +/- buttons still need it)', () => {
    // P6b swapped the whole-store subscribe for a per-field
    // selector so cursor moves no longer wake the parent. The
    // value still feeds the +/- buttons; the access path moved.
    expect(SRC).toMatch(/const zoom = useViewportStore\(\(s\) => s\.zoom\);/);
  });

  it('drops the now-unused format helper imports', () => {
    // formatDistance / formatAngle / formatCoordinates moved with
    // the pill and shouldn't be in the parent's import graph.
    expect(SRC).not.toMatch(/import \{[^}]*formatDistance[^}]*\}/);
    expect(SRC).not.toMatch(/import \{[^}]*formatAngle[^}]*\}/);
    expect(SRC).not.toMatch(/import \{[^}]*formatCoordinates[^}]*\}/);
  });
});

describe('StatusBar — P6b per-field selectors (no whole-store subscriptions)', () => {
  const SRC = fs.readFileSync(
    path.join(repoRoot, 'app/admin/cad/components/StatusBar.tsx'),
    'utf8',
  );

  it('drops the four whole-store subscriptions that fired on every cursor / tool tick', () => {
    expect(SRC).not.toMatch(/const drawingStore = useDrawingStore\(\);/);
    expect(SRC).not.toMatch(/const viewportStore = useViewportStore\(\);/);
    expect(SRC).not.toMatch(/const selectionStore = useSelectionStore\(\);/);
    expect(SRC).not.toMatch(/const toolStore = useToolStore\(\);/);
  });

  it('reads drawing-store fields + actions via per-field selectors', () => {
    expect(SRC).toMatch(/const doc = useDrawingStore\(\(s\) => s\.document\);/);
    expect(SRC).toMatch(/const activeLayerId = useDrawingStore\(\(s\) => s\.activeLayerId\);/);
    expect(SRC).toMatch(/const updateSettings = useDrawingStore\(\(s\) => s\.updateSettings\);/);
    expect(SRC).toMatch(/const setActiveLayer = useDrawingStore\(\(s\) => s\.setActiveLayer\);/);
  });

  it('reads selection count off the size primitive (stable Object.is bailout)', () => {
    expect(SRC).toMatch(/const selCount = useSelectionStore\(\(s\) => s\.selectedIds\.size\);/);
    expect(SRC).not.toMatch(/selectionStore\.selectionCount\(\)/);
  });

  it('reads tool-state fields via per-field selectors so cursor-tick drawingPoints updates do not wake the bar', () => {
    expect(SRC).toMatch(/const activeTool = useToolStore\(\(s\) => s\.state\.activeTool\);/);
    expect(SRC).toMatch(/const orthoEnabled = useToolStore\(\(s\) => s\.state\.orthoEnabled\);/);
    expect(SRC).toMatch(/const polarEnabled = useToolStore\(\(s\) => s\.state\.polarEnabled\);/);
    expect(SRC).toMatch(/const polarAngle = useToolStore\(\(s\) => s\.state\.polarAngle\);/);
    expect(SRC).toMatch(/const copyMode = useToolStore\(\(s\) => s\.state\.copyMode\);/);
  });

  it('reads setZoom via a per-field selector (the +/- buttons + zoom input)', () => {
    expect(SRC).toMatch(/const setZoom = useViewportStore\(\(s\) => s\.setZoom\);/);
  });
});
