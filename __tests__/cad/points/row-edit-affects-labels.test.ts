// __tests__/cad/points/row-edit-affects-labels.test.ts
//
// cad-domain-audit Slice P — `rowEditAffectsLabels` tells the
// PointDataViewer when an inline edit changes a value the layer's
// display labels render from, so the caller can regenerate the
// touched feature's labels on the spot. Previously the property
// write committed but no `regenerateLayerLabels` follow-up ran, so a
// code / description edit didn't show on the canvas until the
// surveyor toggled the layer prefs.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  rowEditAffectsLabels,
  type PointRowField,
} from '@/lib/cad/points/point-rows';

describe('rowEditAffectsLabels — pure predicate', () => {
  it('returns true for every editable PointRowField (today they all touch labels)', () => {
    const fields: PointRowField[] = ['northing', 'easting', 'elevation', 'code', 'description'];
    for (const f of fields) {
      expect(rowEditAffectsLabels(f)).toBe(true);
    }
  });

  it('returns false for an unknown field (defensive default)', () => {
    expect(rowEditAffectsLabels('bogus' as PointRowField)).toBe(false);
  });
});

describe('PointDataViewer — regenerates labels after a label-affecting edit', () => {
  const SRC = fs.readFileSync(
    path.join(
      __dirname, '..', '..', '..', 'app', 'admin', 'cad', 'components',
      'PointDataViewer.tsx',
    ),
    'utf8',
  );

  it('imports the predicate + generateLabelsForFeature', () => {
    expect(SRC).toMatch(/rowEditAffectsLabels,/);
    expect(SRC).toMatch(/import \{ generateLabelsForFeature \} from '@\/lib\/cad\/labels'/);
  });

  it('runs generateLabelsForFeature with the LIVE post-edit feature + layer', () => {
    expect(SRC).toMatch(
      /if \(rowEditAffectsLabels\(field as PointRowField\)\) \{[\s\S]*?const ds = useDrawingStore\.getState\(\);[\s\S]*?const liveFeature = liveDoc\.features\[row\.id\];[\s\S]*?const labels = generateLabelsForFeature\(/,
    );
  });

  it('writes the regenerated labels through ds.setFeatureTextLabels', () => {
    expect(SRC).toMatch(/ds\.setFeatureTextLabels\(row\.id, labels\)/);
  });
});
