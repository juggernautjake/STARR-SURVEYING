// __tests__/cad/ui/menu-bar-store-selectors.test.ts
//
// cad-desktop-tauri-and-perf Slice P6c — MenuBar React-boundary
// audit. Both `useToolStore` and `useViewportStore` were called
// without selectors before this slice, so cursor / drawing-points
// ticks woke the entire menu bar even though it never reads a
// render-time field off either store. Per-action selectors fix
// the leak; this test source-locks the wiring.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'app', 'admin', 'cad', 'components', 'MenuBar.tsx'),
  'utf8',
);

describe('MenuBar — P6c per-action selectors', () => {
  it('drops the whole-store `useToolStore()` + `useViewportStore()` subscriptions', () => {
    expect(SRC).not.toMatch(/const toolStore = useToolStore\(\);/);
    expect(SRC).not.toMatch(/const viewportStore = useViewportStore\(\);/);
  });

  it('subscribes only to the actions actually used in callbacks', () => {
    expect(SRC).toMatch(/const setTool = useToolStore\(\(s\) => s\.setTool\);/);
    expect(SRC).toMatch(/const zoomToExtents = useViewportStore\(\(s\) => s\.zoomToExtents\);/);
  });

  it('renames the local "Zoom Extents" handler so it does not shadow the selector', () => {
    expect(SRC).toMatch(/function handleZoomExtents\(\)/);
    expect(SRC).toMatch(/action: handleZoomExtents/);
  });

  it('rewires every former `toolStore.setTool(...)` + `viewportStore.zoomToExtents(...)` call site', () => {
    expect(SRC).not.toMatch(/toolStore\./);
    expect(SRC).not.toMatch(/viewportStore\./);
  });
});
