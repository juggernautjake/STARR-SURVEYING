// __tests__/cad/ui/layer-prefs-reset-regen.test.ts
//
// cad-domain-audit Slice G — LayerPreferencesPanel.resetToDefaults
// regenerates every label on the layer so the canvas immediately
// reflects the reset (text + visibility), instead of waiting for the
// surveyor to nudge any other toggle. Mirrors the `update()`
// companion above it.
//
// Source-locked (the panel is a React/zustand component).

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

describe('LayerPreferencesPanel.resetToDefaults — regenerates labels', () => {
  it('still writes DEFAULT_LAYER_DISPLAY_PREFERENCES to the layer first', () => {
    expect(SRC).toMatch(
      /function resetToDefaults\(\)[\s\S]*?store\.updateLayerDisplayPreferences\(\s*layerId,\s*\{ \.\.\.DEFAULT_LAYER_DISPLAY_PREFERENCES \}\)/,
    );
  });

  it('regenerates labels through DEFAULT_LAYER_DISPLAY_PREFERENCES after the reset', () => {
    expect(SRC).toMatch(
      /resetToDefaults[\s\S]*?regenerateLayerLabels\(\s*features,\s*\{ \.\.\.layer, displayPreferences: \{ \.\.\.DEFAULT_LAYER_DISPLAY_PREFERENCES \} \},/,
    );
  });

  it('writes the regenerated labels back through setFeatureTextLabels', () => {
    expect(SRC).toMatch(
      /resetToDefaults[\s\S]*?labelMap\.forEach\(\(labels, featureId\) => \{\s*\n\s*store\.setFeatureTextLabels\(featureId, labels\);\s*\n\s*\}\)/,
    );
  });
});
