// __tests__/cad/ui/canvas-coords-pill.test.ts
//
// cad-desktop-tauri-and-perf Slice P6f — React boundary audit.
// The permanent N/E coordinate tracker that lived inline in
// CanvasViewport (and forced the 14k-line component to subscribe
// to the entire viewport store) is now a memoized sub-component.
// CanvasViewport's parallel viewport-store subscription is gone
// — every other access lives in a callback or the rAF loop and
// reads via `useViewportStore.getState()`.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.join(__dirname, '..', '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('CanvasCoordsPill — extracted memo sub-component', () => {
  const SRC = read('app/admin/cad/components/CanvasCoordsPill.tsx');

  it('is wrapped in React.memo so prop-equal re-renders short-circuit', () => {
    expect(SRC).toMatch(/import \{ memo \} from 'react'/);
    expect(SRC).toMatch(/const CanvasCoordsPill = memo\(CanvasCoordsPillInner\)/);
    expect(SRC).toMatch(/CanvasCoordsPill\.displayName = 'CanvasCoordsPill'/);
  });

  it('subscribes to cursor + display preferences via per-field selectors', () => {
    expect(SRC).toMatch(/useViewportStore\(\(s\) => s\.cursorWorld\)/);
    expect(SRC).toMatch(/useDrawingStore\(\(s\) => s\.document\.settings\.displayPreferences\)/);
  });

  it('falls back to DEFAULT_DISPLAY_PREFERENCES when the doc has no overrides', () => {
    expect(SRC).toMatch(/\?\?\s*\n?\s*DEFAULT_DISPLAY_PREFERENCES/);
  });

  it('renders the N/E pill via formatCoordinates(cursor.x, cursor.y, prefs)', () => {
    expect(SRC).toMatch(/formatCoordinates\(cursorWorld\.x, cursorWorld\.y, dispPrefs\)/);
  });
});

describe('CanvasViewport — P6f viewport-store subscription gone', () => {
  const SRC = read('app/admin/cad/components/CanvasViewport.tsx');

  it('drops `const viewportStore = useViewportStore();`', () => {
    expect(SRC).not.toMatch(/const viewportStore = useViewportStore\(\);/);
  });

  it('drops the render-time `const cursorWorld = viewportStore.cursorWorld;` read', () => {
    expect(SRC).not.toMatch(/const cursorWorld = viewportStore\.cursorWorld/);
  });

  it('mounts <CanvasCoordsPill /> + drops the inline N/E IIFE JSX', () => {
    expect(SRC).toMatch(/<CanvasCoordsPill \/>/);
    expect(SRC).not.toMatch(/const dispPrefs = useDrawingStore\.getState\(\)\.document\.settings\.displayPreferences \?\? DEFAULT_DISPLAY_PREFERENCES;/);
  });

  it('imports the extracted pill', () => {
    expect(SRC).toMatch(/import CanvasCoordsPill from '\.\/CanvasCoordsPill'/);
  });

  it('every former `viewportStore.X` callback now reads via `useViewportStore.getState()`', () => {
    expect(SRC).not.toMatch(/(?:^|[^a-zA-Z_.])viewportStore\.[a-zA-Z]/);
    // Sample some hot paths to confirm the new call form lands.
    expect(SRC).toMatch(/useViewportStore\.getState\(\)\.zoom/);
    expect(SRC).toMatch(/useViewportStore\.getState\(\)\.worldToScreen/);
    expect(SRC).toMatch(/useViewportStore\.getState\(\)\.setCursorWorld/);
  });
});
