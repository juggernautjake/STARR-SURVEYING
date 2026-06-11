// __tests__/cad/ui/layer-transfer-dialog-master-pool.test.ts
//
// cad-domain-audit Slice A — LayerTransferDialog reuses the Slice 3
// master-only source filter that NewLayerDialog already had, so
// duplicate-layer copies + TRV mirror twins no longer leak into the
// transfer flow. Adds a Feature-level `isMasterPointFeature` helper to
// `move-points-filters.ts` and wires a MASTER_ONLY / ALL_LAYERS toggle
// into the dialog (default MASTER_ONLY).

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { isMasterPointFeature } from '@/lib/cad/points/move-points-filters';
import type { Feature, Layer } from '@/lib/cad/types';

function mkFeature(over: Partial<Feature> = {}): Feature {
  return {
    id: 'p',
    type: 'POINT',
    geometry: { type: 'POINT', point: { x: 0, y: 0 } },
    layerId: 'L',
    style: {
      color: null, lineWeight: null, opacity: 1, lineTypeId: null,
      symbolId: null, symbolSize: null, symbolRotation: 0,
      labelVisible: null, labelFormat: null, labelOffset: { x: 0, y: 0 },
      isOverride: false,
    },
    properties: {},
    ...over,
  };
}

function mkLayer(id: string, over: Partial<Layer> = {}): Layer {
  return {
    id, name: id, visible: true, locked: false, frozen: false,
    color: '#000', lineWeight: 0.25, lineTypeId: 'SOLID', opacity: 1,
    groupId: null, sortOrder: 0, isDefault: false, isProtected: false,
    autoAssignCodes: [],
    ...over,
  };
}

describe('isMasterPointFeature — feature-level master check', () => {
  it('canonical feature on a canonical layer → master', () => {
    expect(
      isMasterPointFeature(mkFeature({ layerId: 'L' }), { L: mkLayer('L') }),
    ).toBe(true);
  });

  it('feature carries trvPointMirror → NOT master', () => {
    expect(
      isMasterPointFeature(
        mkFeature({ properties: { trvPointMirror: true } }),
        { L: mkLayer('L') },
      ),
    ).toBe(false);
  });

  it('feature on a duplicate layer → NOT master', () => {
    expect(
      isMasterPointFeature(
        mkFeature({ layerId: 'Ldup' }),
        { L: mkLayer('L'), Ldup: mkLayer('Ldup', { duplicateOf: 'L' }) },
      ),
    ).toBe(false);
  });
});

describe('LayerTransferDialog — master-pool wiring (source-locked)', () => {
  const SRC = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'app', 'admin', 'cad', 'components', 'LayerTransferDialog.tsx'),
    'utf8',
  );

  it('imports the feature-level master helper + the source-mode type', () => {
    expect(SRC).toMatch(/import \{\s*isMasterPointFeature,\s*type MovePointsSourceMode,\s*\} from '@\/lib\/cad\/points\/move-points-filters'/);
  });

  it('defaults the pool toggle to MASTER_ONLY', () => {
    expect(SRC).toMatch(/useState<MovePointsSourceMode>\('MASTER_ONLY'\)/);
  });

  it('runs the catalog through isMasterPointFeature when the pool is MASTER_ONLY', () => {
    expect(SRC).toMatch(/pointPoolMode === 'MASTER_ONLY'/);
    expect(SRC).toMatch(/features\.filter\(\(f\) => isMasterPointFeature\(f, drawingStore\.document\.layers\)\)/);
  });

  it('renders MASTER_ONLY / ALL_LAYERS pool toggle buttons', () => {
    expect(SRC).toMatch(/onClick=\{\(\) => setPointPoolMode\('MASTER_ONLY'\)\}/);
    expect(SRC).toMatch(/onClick=\{\(\) => setPointPoolMode\('ALL_LAYERS'\)\}/);
    expect(SRC).toMatch(/>\s*Master file\s*</);
    expect(SRC).toMatch(/>\s*All layers\s*</);
  });
});
