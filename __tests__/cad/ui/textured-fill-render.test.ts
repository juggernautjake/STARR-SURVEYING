// __tests__/cad/ui/textured-fill-render.test.ts
//
// Slice 236 of cad-label-backgrounds-and-textured-fills-2026-05-30.md.
// Locks the source-level wiring of the textured-polygon render path:
// per-feature texture Graphics + polygon-shaped mask, the
// drawFillPatternForPolygon dispatcher, the hashSeed helper that
// seeds the pattern generator deterministically per feature, the
// import wiring, and the GC sweep that drops both Graphics when a
// feature leaves the visible set. fs.readFileSync regex assertions on
// CanvasViewport.tsx since the SSR snapshot caching blocks
// interactive zustand assertions.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'app', 'admin', 'cad', 'components', 'CanvasViewport.tsx'),
  'utf8',
);

describe('Slice 236 — fill-pattern generators imported', () => {
  it('imports generateFillPattern + FillPatternConfig from the pure-helper module', () => {
    // cad-fills Slice 1 — the import now also pulls in patternLineWeight
    // (the thickness-aware stroke-weight helper).
    expect(SRC).toMatch(/import \{ generateFillPattern, patternLineWeight, type FillPatternConfig \} from '@\/lib\/cad\/styles\/fill-patterns';/);
  });
});

describe('Slice 236 — featureTextures Map wired into pixi state', () => {
  it('pixi state shape declares featureTextures with { tex, mask } entries', () => {
    expect(SRC).toMatch(/featureTextures: Map<string, \{ tex: import\('pixi\.js'\)\.Graphics; mask: import\('pixi\.js'\)\.Graphics \}>;/);
  });

  it('initial pixi state seeds featureTextures as an empty Map', () => {
    expect(SRC).toMatch(/featureTextures: new Map\(\),/);
  });
});

describe('Slice 236 — drawFillPatternForPolygon helper', () => {
  it('declares the helper with the polygon-render contract', () => {
    expect(SRC).toMatch(/function drawFillPatternForPolygon\(\s*feature: Feature,\s*screenPts: ReadonlyArray<\{ x: number; y: number \}>,\s*alpha: number,\s*\)/);
  });

  it('no-ops for undefined / SOLID / NONE fillPattern while clearing any stale Graphics', () => {
    expect(SRC).toMatch(/if \(!pattern \|\| pattern === 'SOLID' \|\| pattern === 'NONE'\) \{[\s\S]*?existing\.tex\.clear\(\);[\s\S]*?existing\.mask\.clear\(\);[\s\S]*?return;\s*\}/);
  });

  it('computes the polygon screen-space bounding rect (minX/minY/maxX/maxY → width/height)', () => {
    expect(SRC).toMatch(/let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;[\s\S]*?const width = Math\.max\(0, maxX - minX\);[\s\S]*?const height = Math\.max\(0, maxY - minY\);/);
  });

  it('builds the polygon mask shape with beginFill + moveTo + lineTo + closePath + endFill', () => {
    expect(SRC).toMatch(/entry\.mask\.beginFill\(0xffffff, 1\);[\s\S]*?entry\.mask\.moveTo\(screenPts\[0\]\.x, screenPts\[0\]\.y\);[\s\S]*?entry\.mask\.lineTo\([\s\S]*?entry\.mask\.closePath\(\);[\s\S]*?entry\.mask\.endFill\(\);/);
  });

  it('applies the mask to the texture Graphics on creation', () => {
    expect(SRC).toMatch(/tex\.mask = mask;/);
  });

  it('routes the FillPatternConfig through generateFillPattern with a per-feature seed', () => {
    // cad-fills Slice 1 — cfg now also carries `scale` (pattern thickness).
    expect(SRC).toMatch(/const cfg: FillPatternConfig = \{\s*pattern,\s*density: feature\.style\.patternDensity \?\? 1,\s*seed: hashSeed\(feature\.id\),[\s\S]*?scale: feature\.style\.patternScale \?\? 1,\s*\};/);
    expect(SRC).toMatch(/const \{ dots, lines \} = generateFillPattern\(width, height, cfg\);/);
  });

  it('walks dots via drawCircle and lines via moveTo/lineTo, offset by (minX, minY)', () => {
    expect(SRC).toMatch(/for \(const d of dots\) entry\.tex\.drawCircle\(minX \+ d\.x, minY \+ d\.y, d\.r\);/);
    expect(SRC).toMatch(/for \(const ln of lines\) \{[\s\S]*?entry\.tex\.moveTo\(minX \+ ln\.x1, minY \+ ln\.y1\);[\s\S]*?entry\.tex\.lineTo\(minX \+ ln\.x2, minY \+ ln\.y2\);/);
  });

  it('falls back to feature.style.color when patternColor is null', () => {
    expect(SRC).toMatch(/const patternColorHex = feature\.style\.patternColor \?\? feature\.style\.color \?\? '#000000';/);
  });
});

describe('Slice 236 — hashSeed helper', () => {
  it('declares hashSeed taking a feature id', () => {
    expect(SRC).toMatch(/function hashSeed\(id: string\): number/);
  });

  it('uses FNV-1a-style constants (0x811c9dc5 init, 0x01000193 prime)', () => {
    expect(SRC).toMatch(/let h = 0x811c9dc5;[\s\S]*?h = Math\.imul\(h, 0x01000193\);/);
  });
});

describe('Slice 236 — POLYGON render branch invokes the texture helper', () => {
  it('calls drawFillPatternForPolygon after the fillColor block, before the stroke', () => {
    expect(SRC).toMatch(/g\.endFill\(\);[\s\S]*?\}\s*\}[\s\S]*?drawFillPatternForPolygon\(feature, screenPts, alpha\);[\s\S]*?screenPts\.push\(screenPts\[0\]\);[\s\S]*?renderLineWithType\(g, lineType, screenPts/);
  });
});

describe('Slice 236 — GC sweep drops texture + mask when a feature is removed', () => {
  it('cleans up featureTextures when the feature drops out of visibleIds', () => {
    expect(SRC).toMatch(/pixi\.featureGraphics\.delete\(id\);[\s\S]*?const tx = pixi\.featureTextures\.get\(id\);[\s\S]*?tx\.tex\.parent\?\.removeChild\(tx\.tex\);[\s\S]*?tx\.mask\.parent\?\.removeChild\(tx\.mask\);[\s\S]*?pixi\.featureTextures\.delete\(id\);/);
  });

  it('hides texture + mask alongside the feature Graphics when viewport-culled', () => {
    expect(SRC).toMatch(/g\.visible = false;\s*\n\s*const tx = pixi\.featureTextures\.get\(id\);\s*\n\s*if \(tx\) \{ tx\.tex\.visible = false; tx\.mask\.visible = false; \}/);
  });
});
