// __tests__/cad/ui/layer-prefs-update-live-store.test.ts
//
// cad-ux-cleanup-pass Slice 10 — `LayerPreferencesPanel.update()`
// derives `mergedPrefs` from the LIVE drawing store layer rather
// than the closure-captured `prefs` snapshot. Without this, a
// rapid double-toggle (the second click fires before the panel has
// re-rendered with the first click's state) saw stale prefs in
// the merge and silently dropped the change — the user-reported
// "had to toggle twice for the change to take effect" desync.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(
  path.join(
    __dirname, '..', '..', '..', 'app', 'admin', 'cad', 'components',
    'LayerPreferencesPanel.tsx',
  ),
  'utf8',
);

describe('LayerPreferencesPanel.update — reads live store state', () => {
  it('pulls the live store with getState() inside update()', () => {
    expect(SRC).toMatch(
      /function update\(partial: Partial<LayerDisplayPreferences>\) \{[\s\S]*?const ds = useDrawingStore\.getState\(\)/,
    );
  });

  it('reads displayPreferences off the LIVE layer record (not closure prefs)', () => {
    expect(SRC).toMatch(
      /const livePrefs = ds\.document\.layers\[layerId\]\?\.displayPreferences/,
    );
  });

  it('builds basePrefs from DEFAULTS spread + live prefs (not the captured snapshot)', () => {
    expect(SRC).toMatch(
      /const basePrefs: LayerDisplayPreferences = \{\s*\n\s*\.\.\.DEFAULT_LAYER_DISPLAY_PREFERENCES,\s*\n\s*\.\.\.\(livePrefs \?\? \{\}\),/,
    );
  });

  it('merges the user-supplied partial onto basePrefs (not onto the stale snapshot)', () => {
    expect(SRC).toMatch(
      /const mergedPrefs: LayerDisplayPreferences = \{\s*\n\s*\.\.\.basePrefs,\s*\n\s*\.\.\.partial,/,
    );
  });

  it('uses the LIVE layer record when regenerating labels', () => {
    expect(SRC).toMatch(
      /regenerateLayerLabels\(features, \{ \.\.\.liveLayer, displayPreferences: mergedPrefs \}, displayPrefs\)/,
    );
  });
});
