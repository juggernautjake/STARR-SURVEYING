// __tests__/cad/ui/fill-stack-render-walk.test.ts
//
// cad-fill-stacking Slice 6b — locks the multi-layer render walk in
// CanvasViewport. When `feature.style.fillStack` is set, the renderer
// delegates to `drawFillStackForPolygon`, which walks the resolved
// stack bottom-to-top and draws every layer onto the same masked
// Graphics. The legacy single-pattern code path stays intact for
// features that haven't adopted the stacked model — pixel-identical
// to today, locked by textured-fill-render.test.ts.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'app', 'admin', 'cad', 'components', 'CanvasViewport.tsx'),
  'utf8',
);

describe('CanvasViewport — fillStack branch in drawFillPatternForPolygon', () => {
  it('imports resolveVisibleFillLayers from fill-stack', () => {
    expect(SRC).toMatch(/import \{ resolveVisibleFillLayers \} from '@\/lib\/cad\/styles\/fill-stack';/);
  });

  it('the draw entrypoint short-circuits to the stack walker when fillStack is set', () => {
    expect(SRC).toMatch(
      /if \(Array\.isArray\(feature\.style\.fillStack\)\)\s*\{\s*drawFillStackForPolygon\(feature, screenPts\);\s*return;\s*\}/,
    );
  });
});

describe('CanvasViewport — drawFillStackForPolygon walker', () => {
  it('declares drawFillStackForPolygon(feature, screenPts)', () => {
    expect(SRC).toMatch(/function drawFillStackForPolygon\(\s*feature: Feature,\s*screenPts: ReadonlyArray<\{ x: number; y: number \}>,\s*\)/);
  });

  it('resolves the visible layers from feature.style', () => {
    expect(SRC).toMatch(/const layers = resolveVisibleFillLayers\(feature\.style\);/);
  });

  it('iterates the resolved layers in array order (bottom-to-top draw)', () => {
    expect(SRC).toMatch(/for \(const layer of layers\)/);
  });

  it('routes SOLID layers to drawRect on the bbox', () => {
    expect(SRC).toMatch(/if \(layer\.pattern === 'SOLID'\)[\s\S]*?entry\.tex\.drawRect\(minX, minY, width, height\)/);
  });

  it('builds a per-layer FillPatternConfig from the layer fields', () => {
    expect(SRC).toMatch(/pattern: layer\.pattern,/);
    expect(SRC).toMatch(/density: layer\.density \* PATTERN_DENSITY_MULT,/);
    expect(SRC).toMatch(/scale: layer\.scale \* PATTERN_SIZE_MULT,/);
    expect(SRC).toMatch(/angle: layer\.rotation,/);
  });

  it('seeds the pattern with a feature+pattern-derived hash so different layers stipple differently', () => {
    expect(SRC).toMatch(/seed: hashSeed\(feature\.id \+ ':' \+ layer\.pattern\),/);
  });

  it('strokes/fills each layer with its own opacity (not the outer alpha)', () => {
    expect(SRC).toMatch(/const layerAlpha = Math\.max\(0, Math\.min\(1, layer\.opacity\)\);/);
    expect(SRC).toMatch(/entry\.tex\.beginFill\(colorInt, layerAlpha\)/);
    // cad-trv-fidelity — line weight scaled by zoom (world-constant).
    expect(SRC).toMatch(/entry\.tex\.lineStyle\(patternLineWeight\(layer\.scale \* PATTERN_SIZE_MULT\) \* ps, colorInt, layerAlpha\)/);
  });

  it('clears the texture entry when the resolved stack is empty (so removing every layer wipes the fill)', () => {
    expect(SRC).toMatch(/if \(layers\.length === 0\)[\s\S]*?existing\.tex\.clear\(\); existing\.mask\.clear\(\)/);
  });
});
