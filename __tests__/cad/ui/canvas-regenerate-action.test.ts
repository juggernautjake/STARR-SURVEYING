// __tests__/cad/ui/canvas-regenerate-action.test.ts
//
// cad-ux-cleanup-pass Slice 11 — manual canvas refresh. A new
// bindable `view.regenerate` action (default F5) dispatches
// `cad:regenerateCanvas`; the CanvasViewport listener drops its LOD
// / feature-index cache and reruns renderFeatures on the next rAF.
// Same path the canvas right-click "Refresh canvas" item + the AI
// tool registry can drive, so the surveyor has an escape hatch
// whenever an edit appears stale on the canvas.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_ACTIONS } from '@/lib/cad/hotkeys/registry';

const root = path.join(__dirname, '..', '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

describe('registry — view.regenerate', () => {
  const action = DEFAULT_ACTIONS.find((a) => a.id === 'view.regenerate');

  it('exists, lives under ZOOM_PAN, default F5, CANVAS context', () => {
    expect(action).toBeDefined();
    expect(action!.category).toBe('ZOOM_PAN');
    expect(action!.defaultKey).toBe('f5');
    expect(action!.context).toBe('CANVAS');
    expect(action!.label).toMatch(/Refresh Canvas/);
  });
});

describe('useHotkeys — view.regenerate dispatcher', () => {
  const SRC = read('app/admin/cad/hooks/useHotkeys.ts');

  it('dispatches cad:regenerateCanvas and emits a status caption', () => {
    expect(SRC).toMatch(/case 'view\.regenerate':[\s\S]*?CustomEvent\('cad:regenerateCanvas'\)/);
    expect(SRC).toMatch(/'Canvas refresh requested\.'/);
  });
});

describe('CanvasViewport — cad:regenerateCanvas listener', () => {
  const SRC = read('app/admin/cad/components/CanvasViewport.tsx');

  it('clears the feature-index cache and schedules a renderFeatures rAF', () => {
    // cad-desktop-tauri-and-perf Slice P3b — the handler now also
    // calls `markAllFeaturesDirty()` so the per-feature draw-state
    // cache is busted alongside the index. Source-lock the
    // INVARIANT calls without freezing the exact body.
    expect(SRC).toMatch(/const onRegenerateCanvas = \(\) => \{/);
    expect(SRC).toMatch(/featureIndexCacheRef\.current = null;/);
    expect(SRC).toMatch(/requestAnimationFrame\(\(\) => renderFeatures\(\)\)/);
  });

  it('subscribes + unsubscribes the listener through the effect cleanup pair', () => {
    expect(SRC).toMatch(/window\.addEventListener\('cad:regenerateCanvas', onRegenerateCanvas\)/);
    expect(SRC).toMatch(/window\.removeEventListener\('cad:regenerateCanvas', onRegenerateCanvas\)/);
  });
});
