// __tests__/cad/ui/layer-panel-empty-default-and-duplicate.test.ts
//
// cad-ux-cleanup-pass Slice 7 — two related cleanups in LayerPanel:
//
//  * Hide the seeded "Layer 1" while it's still empty + carrying its
//    default name (so a fresh drawing doesn't open with a useless
//    extra row). The layer stays in the document so activeLayerId +
//    every existing layer-style fallback keep working; only the
//    panel rendering filters it out.
//
//  * Drop TRV mirror twins (`properties.trvPointMirror`) and any
//    derived auto-spawn (`properties.trvDerived`) when collecting the
//    feature set the "Duplicate layer" action transfers — those echoes
//    are what produced the "+5 phantom points" the surveyor saw on
//    the new layer.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'app', 'admin', 'cad', 'components', 'LayerPanel.tsx'),
  'utf8',
);

describe('LayerPanel — empty seeded DEFAULT layer hidden until used', () => {
  it('declares an isHideableSeededDefault heuristic keyed on id + count + name', () => {
    expect(SRC).toMatch(/function isHideableSeededDefault\(l: Layer\): boolean/);
    expect(SRC).toMatch(/if \(l\.id !== 'DEFAULT'\) return false/);
    expect(SRC).toMatch(/if \(\(featureCountByLayer\.get\(l\.id\) \?\? 0\) > 0\) return false/);
    expect(SRC).toMatch(/if \(l\.name !== 'Layer 1'\) return false/);
  });

  it('runs the hide heuristic BEFORE the search-text filter, with the active layer always shown', () => {
    expect(SRC).toMatch(/const visibleLayers = layers\.filter\(\(l\) => l\.id === activeLayerId \|\| !isHideableSeededDefault\(l\)\)/);
    expect(SRC).toMatch(/visibleLayers\.filter\(\(l\) => l\.name\.toLowerCase\(\)\.includes\(filterTrim\) \|\| l\.id === activeLayerId\)/);
  });

  it('feature counts are indexed once per render so the hide check + downstream UI agree', () => {
    expect(SRC).toMatch(/const featureCountByLayer = new Map<string, number>\(\)/);
    expect(SRC).toMatch(/featureCountByLayer\.set\(f\.layerId, \(featureCountByLayer\.get\(f\.layerId\) \?\? 0\) \+ 1\)/);
  });
});

describe('LayerPanel — Duplicate layer skips mirror + derived features', () => {
  it('the transfer-set filter excludes trvPointMirror twins', () => {
    expect(SRC).toMatch(/!f\.properties\.trvPointMirror/);
  });
  it('the transfer-set filter excludes trvDerived auto-spawns', () => {
    expect(SRC).toMatch(/!f\.properties\.trvDerived/);
  });
});
