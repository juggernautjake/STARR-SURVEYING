// __tests__/cad/ui/quick-add-points-to-layer.test.ts
//
// cad-ux-cleanup-pass Slice 8 — every "quick-add points to this
// layer" entrypoint pre-targets the existing Layer Transfer dialog
// instead of forcing the surveyor to re-pick the destination layer:
//
//   * a `+` button on each LayerPanel row
//   * a right-click "Quick-add points…" menu item on the same row
//   * a bindable `layer.quickAdd` action targeting the ACTIVE layer
//     (callable from the command palette + the AI tool registry)
//
// Wiring source-locked because the panel is React/DOM and the engine
// is fired through the existing zustand stores.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_ACTIONS } from '@/lib/cad/hotkeys/registry';

const repoRoot = path.join(__dirname, '..', '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('registry — layer.quickAdd action declared', () => {
  it('exists, is in LAYERS, and targets the CANVAS context', () => {
    const a = DEFAULT_ACTIONS.find((x) => x.id === 'layer.quickAdd');
    expect(a).toBeDefined();
    expect(a!.category).toBe('LAYERS');
    expect(a!.context).toBe('CANVAS');
    expect(a!.label).toMatch(/Quick-add Points/);
  });
});

describe('useHotkeys — layer.quickAdd dispatcher pre-targets the active layer', () => {
  const SRC = read('app/admin/cad/hooks/useHotkeys.ts');
  it('reads the active layer from drawingStore', () => {
    expect(SRC).toMatch(/case 'layer\.quickAdd':[\s\S]*?const layerId = drawingStore\.activeLayerId/);
  });
  it('sets transferStore.options.targetLayerId then dispatches cad:openLayerTransfer', () => {
    expect(SRC).toMatch(
      /useTransferStore\.getState\(\)\.setOptions\(\{ targetLayerId: layerId \}\)[\s\S]*?cad:openLayerTransfer/,
    );
  });
});

describe('LayerPanel — quick-add row affordances', () => {
  const SRC = read('app/admin/cad/components/LayerPanel.tsx');

  it('imports useTransferStore so the shared transfer dialog can be pre-targeted', () => {
    expect(SRC).toMatch(/import \{ useTransferStore \} from '@\/lib\/cad\/store'/);
  });

  it('defines quickAddToLayer that pre-sets targetLayerId and opens the dialog', () => {
    expect(SRC).toMatch(
      /function quickAddToLayer\(layerId: string\)[\s\S]*?useTransferStore\.getState\(\)\.setOptions\(\{ targetLayerId: layerId \}\)[\s\S]*?cad:openLayerTransfer/,
    );
  });

  it('renders a per-row Plus button keyed by layer id', () => {
    expect(SRC).toMatch(/data-testid=\{`layer-quick-add-\$\{layer\.id\}`\}/);
    expect(SRC).toMatch(/onClick=\{\(e\) => \{ e\.stopPropagation\(\); quickAddToLayer\(layer\.id\); \}\}/);
  });

  it('renders a "Quick-add points…" right-click menu entry', () => {
    expect(SRC).toMatch(/Quick-add points…/);
    expect(SRC).toMatch(/onClick=\{\(\) => quickAddToLayer\(contextMenu\.layerId\)\}/);
  });
});
