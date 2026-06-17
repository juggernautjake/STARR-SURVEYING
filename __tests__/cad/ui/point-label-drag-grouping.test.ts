// __tests__/cad/ui/point-label-drag-grouping.test.ts
//
// cad-ux-cleanup-pass Slice 9 — dragging any point-label kind
// (name / code / description / elevation / coordinates) moves the
// whole stack together when `pointLabelGrouping === 'GROUPED'`. The
// original gating list only included NAME / DESCRIPTION / ELEVATION,
// so dragging the name left CODE + COORDINATES behind — the
// user-reported "code/desc don't move with the name" bug. Source-
// locked since the drag path is a Pixi/DOM handler.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'app', 'admin', 'cad', 'components', 'CanvasViewport.tsx'),
  'utf8',
);

describe('point-label drag grouping — POINT_LABEL_KINDS', () => {
  it('declares POINT_LABEL_KINDS with every point-label kind that should move together', () => {
    expect(SRC).toMatch(/const POINT_LABEL_KINDS = \[\s*\n\s*'POINT_NAME',\s*\n\s*'POINT_CODE',\s*\n\s*'POINT_DESCRIPTION',\s*\n\s*'POINT_ELEVATION',\s*\n\s*'POINT_COORDINATES',\s*\n\s*\]/);
  });

  it('gates the sibling-collection on `grouping === GROUPED` + kind membership', () => {
    expect(SRC).toMatch(
      /if \(grouping === 'GROUPED' && POINT_LABEL_KINDS\.includes\(label\.kind\)\) \{[\s\S]*?siblings = \(feature\.textLabels \?\? \[\]\)[\s\S]*?\.filter\(\(l\) => l\.id !== label\.id && POINT_LABEL_KINDS\.includes\(l\.kind\)\)/,
    );
  });

  it('the live drag handler shifts every sibling by the same (dx, dy) and marks them userPositioned', () => {
    expect(SRC).toMatch(
      // P6k widened — `drawingStore.X(...)` callbacks route through
      // `useDrawingStore.getState().X(...)`.
      /if \(siblings\) \{[\s\S]*?for \(const sib of siblings\) \{[\s\S]*?(drawingStore|useDrawingStore\.getState\(\))\.updateTextLabel\(featureId, sib\.labelId, \{\s*\n\s*offset: \{ x: sib\.startOffset\.x \+ dx, y: sib\.startOffset\.y \+ dy \},\s*\n\s*userPositioned: true,/,
    );
  });
});
