// __tests__/cad/ui/renderer-dirty-region.test.ts
//
// cad-desktop-tauri-and-perf Slice P3b — the CanvasViewport renderer
// keeps a per-feature draw-state cache and re-tessellates ONLY when
// the feature reference, LOD epsilon, or layer color changed, or
// when the id is in `useDrawingStore.dirtyFeatureIds`. After each
// render pass the renderer hands back the dirty stamps it
// processed via `clearFeatureDirty(ids)`. The
// `cad:regenerateCanvas` handler routes through
// `markAllFeaturesDirty()` so the user-facing "Refresh canvas"
// semantics from cad-ux-cleanup-pass Slice 11 stay intact.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'app', 'admin', 'cad', 'components', 'CanvasViewport.tsx'),
  'utf8',
);

describe('drawStateRef — per-feature tessellation cache', () => {
  it('declares a Map keyed by feature id with the comparison fields', () => {
    expect(SRC).toMatch(
      /const drawStateRef = useRef<\s*\n\s*Map<\s*\n\s*string,\s*\n\s*\{\s*\n\s*feature: Feature;\s*\n\s*epsilon: number;\s*\n\s*layerColor: string;\s*\n\s*pointSize: number;/,
    );
  });

  it('initialises with an empty Map (matches the freshly-mounted canvas)', () => {
    expect(SRC).toMatch(/drawStateRef = useRef<[\s\S]*?>\(new Map\(\)\)/);
  });
});

describe('renderFeatures — dirty-skip + clear loop', () => {
  it('reads the dirty set ONCE per render via getState() (avoids re-renders)', () => {
    expect(SRC).toMatch(
      /const dirtyIds = useDrawingStore\.getState\(\)\.dirtyFeatureIds;/,
    );
  });

  it('processedDirty accumulates the ids that were actually re-tessellated', () => {
    expect(SRC).toMatch(/const processedDirty: string\[\] = \[\];/);
    expect(SRC).toMatch(/if \(isDirty\) processedDirty\.push\(feature\.id\)/);
  });

  it('needsRedraw fires on identity change, dirty stamp, camera/viewport move, missing prev, epsilon change, layer-color change, or point-size change', () => {
    expect(SRC).toMatch(
      /const needsRedraw =\s*\n\s*freshlyCreated \|\|\s*\n\s*isDirty \|\|\s*\n\s*cameraMoved \|\|[^\n]*\n\s*!prev \|\|\s*\n\s*prev\.feature !== feature \|\|\s*\n\s*prev\.epsilon !== simplifyEpsilon \|\|\s*\n\s*prev\.layerColor !== layerColor \|\|\s*\n\s*prev\.pointSize !== pointSize;/,
    );
  });

  it('runs drawFeature ONLY when needsRedraw is true (the perf win)', () => {
    expect(SRC).toMatch(
      /if \(needsRedraw\) \{\s*\n\s*drawFeature\(g, feature, simplifyEpsilon\);[\s\S]*?drawStateRef\.current\.set\(feature\.id, \{[\s\S]*?feature,\s*\n\s*epsilon: simplifyEpsilon,\s*\n\s*layerColor,\s*\n\s*pointSize,\s*\n\s*\}\);/,
    );
  });

  it('drops drawState entries whose backing Graphics was destroyed', () => {
    expect(SRC).toMatch(
      /if \(drawnState\.size > pixi\.featureGraphics\.size\) \{[\s\S]*?if \(!pixi\.featureGraphics\.has\(id\)\) drawnState\.delete\(id\)/,
    );
  });

  it('hands the processed dirty ids back via clearFeatureDirty (off-screen ids stay dirty)', () => {
    expect(SRC).toMatch(
      /if \(processedDirty\.length > 0\) \{\s*\n\s*useDrawingStore\.getState\(\)\.clearFeatureDirty\(processedDirty\);/,
    );
  });
});

describe('cad:regenerateCanvas — preserves the Slice 11 semantics', () => {
  it('handler now calls markAllFeaturesDirty so the per-feature cache busts on Refresh Canvas', () => {
    expect(SRC).toMatch(
      /onRegenerateCanvas[\s\S]*?useDrawingStore\.getState\(\)\.markAllFeaturesDirty\(\)/,
    );
  });

  it('still nulls the feature-index cache (the existing Slice 11 behavior)', () => {
    expect(SRC).toMatch(/featureIndexCacheRef\.current = null;/);
  });
});
