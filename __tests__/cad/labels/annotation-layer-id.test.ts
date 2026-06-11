// __tests__/cad/labels/annotation-layer-id.test.ts
//
// cad-domain-audit Slice H — every annotation / recon writer stamps
// the canonical ANNOTATION_LAYER_ID (resolves to the always-seeded
// SURVEY-INFO layer) instead of the phantom 'ANNOTATION' /
// 'TITLE-BLOCK' ids that were removed from the default seed. Future
// authors should reuse this constant; this test guards against
// regressions sneaking the old hardcoded strings back in.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  ANNOTATION_LAYER_ID,
  PHASE3_DEFAULT_LAYERS,
} from '@/lib/cad/styles/default-layers';

const root = path.join(__dirname, '..', '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

describe('ANNOTATION_LAYER_ID — canonical home for annotation writers', () => {
  it('resolves to a layer that is actually pre-seeded', () => {
    const seededIds = PHASE3_DEFAULT_LAYERS.map((l) => l.id);
    expect(seededIds).toContain(ANNOTATION_LAYER_ID);
  });

  it('resolves to SURVEY-INFO (the documented annotation home)', () => {
    expect(ANNOTATION_LAYER_ID).toBe('SURVEY-INFO');
  });
});

describe('label / recon writers stop hardcoding the phantom ids', () => {
  const FILES = [
    'lib/cad/labels/area-label.ts',
    'lib/cad/labels/bearing-dim.ts',
    'lib/cad/labels/monument-label.ts',
    'lib/cad/labels/curve-label.ts',
    'lib/cad/recon-to-cad.ts',
  ];
  for (const file of FILES) {
    it(`${file} imports ANNOTATION_LAYER_ID`, () => {
      expect(read(file)).toMatch(/ANNOTATION_LAYER_ID/);
    });
    it(`${file} no longer stamps the phantom 'ANNOTATION' / 'TITLE-BLOCK' literal`, () => {
      const src = read(file);
      // Only the constant declaration itself is allowed to reference
      // those strings; the writers must go through the constant.
      expect(src).not.toMatch(/layerId:\s*'ANNOTATION'/);
      expect(src).not.toMatch(/layerId:\s*'TITLE-BLOCK'/);
    });
  }
});
