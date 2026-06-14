// __tests__/cad/ui/layer-panel-feature-eyes.test.ts
//
// cad-fill-rotation Slice 2 — locks the per-feature eye toggle the
// LayerPanel renders on each row inside an expanded layer. The toggle
// is two-way bound to Feature.hidden so right-click "Hide Element"
// (FeatureContextMenu → drawingStore.hideFeature) auto-updates the
// icon, and clicking the eye writes back through the same store.
//
// Source-regex on LayerPanel.tsx since the panel's full render needs
// a zustand store + drag handlers + selection mock to mount under
// jsdom — overkill for a contract that lives in 30 lines of JSX.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'app', 'admin', 'cad', 'components', 'LayerPanel.tsx'),
  'utf8',
);

describe('LayerPanel — per-feature eye toggle', () => {
  it('does NOT filter out hidden features from the layer tree (so the eye is reachable)', () => {
    // The filter used to be `.filter((f) => f.layerId === layer.id && !f.hidden)`
    // which made hidden features disappear from the tree with no way
    // to bring them back from here. The new filter drops the hidden
    // clause.
    expect(SRC).toMatch(/Object\.values\(doc\.features\)\.filter\(\(f\) => f\.layerId === layer\.id\)/);
    expect(SRC).not.toMatch(/f\.layerId === layer\.id && !f\.hidden/);
  });

  it('reads isHidden from feat.hidden on each row', () => {
    expect(SRC).toMatch(/const isHidden = feat\.hidden === true;/);
  });

  it('renders the eye button with a per-feature data-testid', () => {
    expect(SRC).toContain('data-testid={`layer-panel-feature-eye-${feat.id}`}');
  });

  it('shows the open Eye icon when visible, EyeOff when hidden', () => {
    expect(SRC).toMatch(/isHidden \? <EyeOff size=\{10\} \/> : <Eye size=\{10\} \/>/);
  });

  it('eye click toggles hideFeature / unhideFeature and stops propagation', () => {
    // P6d dropped the `const store = useDrawingStore()` whole-store
    // subscription, so callbacks now read the store via
    // `useDrawingStore.getState().X`. The regex accepts either form.
    const store = '(store|useDrawingStore\\.getState\\(\\))';
    expect(SRC).toMatch(
      new RegExp(
        `e\\.stopPropagation\\(\\);\\s*if \\(isHidden\\) ${store}\\.unhideFeature\\(feat\\.id\\);\\s*else ${store}\\.hideFeature\\(feat\\.id\\);`,
      ),
    );
  });

  it('row carries data-hidden so a future regression test can read state without rendering', () => {
    expect(SRC).toContain(`data-hidden={isHidden ? 'true' : 'false'}`);
  });

  it('hidden rows dim + italicize so the tree reads "this one is off"', () => {
    expect(SRC).toMatch(/isHidden\s*\?\s*'text-gray-600 italic'/);
  });
});

describe('LayerPanel — two-way binding with the right-click Hide flow', () => {
  // The right-click flow already calls drawingStore.hideFeature(id);
  // the LayerPanel re-reads doc.features on every render via the
  // store hook, so flipping `hidden` on the store auto-rerenders the
  // matching row's eye icon. Lock the source-side reads that make
  // this two-way binding work (no manual subscription needed in the
  // panel — it's the store's reactive subscription).
  it('the layer panel reads features from the same drawing-store the right-click flow writes to', () => {
    expect(SRC).toMatch(/useDrawingStore\b/);
  });
});
