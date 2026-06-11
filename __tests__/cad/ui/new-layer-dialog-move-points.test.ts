// __tests__/cad/ui/new-layer-dialog-move-points.test.ts
//
// cad-ux-cleanup-pass Slice 3 — NewLayerDialog uses the shared
// `filterMovePointRows` helper, exposes the MASTER_ONLY / ALL_LAYERS
// source toggle (default MASTER_ONLY), and the Duplicate Layer action
// stamps `duplicateOf` on the new layer so duplicates land outside the
// master pool.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const componentsDir = path.join(__dirname, '..', '..', '..', 'app', 'admin', 'cad', 'components');
const read = (file: string) => fs.readFileSync(path.join(componentsDir, file), 'utf8');

describe('NewLayerDialog — move-points wiring', () => {
  const SRC = read('NewLayerDialog.tsx');

  it('imports the shared filter helper from move-points-filters', () => {
    expect(SRC).toMatch(/from '@\/lib\/cad\/points\/move-points-filters'/);
    expect(SRC).toMatch(/filterMovePointRows/);
  });

  it('defaults the source toggle to MASTER_ONLY', () => {
    expect(SRC).toMatch(/useState<MovePointsSourceMode>\('MASTER_ONLY'\)/);
  });

  it('runs the points list through filterMovePointRows with the live state', () => {
    expect(SRC).toMatch(
      /filterMovePointRows\(points, doc, \{ query: search, field: searchBy, sourceMode \}\)/,
    );
  });

  it('renders MASTER_ONLY / ALL_LAYERS source toggle buttons', () => {
    expect(SRC).toMatch(/onClick=\{\(\) => setSourceMode\('MASTER_ONLY'\)\}/);
    expect(SRC).toMatch(/onClick=\{\(\) => setSourceMode\('ALL_LAYERS'\)\}/);
    expect(SRC).toMatch(/>\s*Master file\s*</);
    expect(SRC).toMatch(/>\s*All layers\s*</);
  });

  it('placeholder advertises comma-separated multi-search', () => {
    expect(SRC).toMatch(/Names, comma-separated/);
    expect(SRC).toMatch(/Codes, comma-separated/);
  });
});

describe('LayerPanel — Duplicate layer stamps duplicateOf', () => {
  const SRC = read('LayerPanel.tsx');

  it('the newLayer object carries duplicateOf: layerId', () => {
    expect(SRC).toMatch(/name: `\$\{src\.name\} copy`, isDefault: false, duplicateOf: layerId/);
  });
});

describe('Layer type — duplicateOf marker declared', () => {
  const TYPES = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'lib', 'cad', 'types.ts'),
    'utf8',
  );
  it('Layer.duplicateOf is an optional string-or-null', () => {
    expect(TYPES).toMatch(/duplicateOf\?: string \| null/);
  });
});
