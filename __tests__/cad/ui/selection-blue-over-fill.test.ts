// __tests__/cad/ui/selection-blue-over-fill.test.ts
//
// cad-fill-stacking Slice 2 — locks the two source-level changes that
// keep the "selected polygon" visual unmistakably blue while the user
// is editing a fill pattern (the earlier complaint: the polygon read
// as grey, not the selection blue):
//
//   1. The "Fill enclosed area" multi-select action seeds the new
//      polygon's fillColor to the same selection blue (#0088ff)
//      rather than inheriting the source-line color (often null →
//      grey from the layer default).
//   2. drawFeature's selection-outline stroke gets +1 px of weight
//      when the feature has an active fillPattern, so the blue
//      outline reads cleanly over a textured fill (dots / hatches /
//      brick / wave).

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const PROPERTY_PANEL_SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'app', 'admin', 'cad', 'components', 'PropertyPanel.tsx'),
  'utf8',
);

const CANVAS_SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'app', 'admin', 'cad', 'components', 'CanvasViewport.tsx'),
  'utf8',
);

describe('Fill enclosed area — seeds fillColor to the selection blue', () => {
  it('seededFillColor constant pins the new polygon fill to the selection blue (#0088ff)', () => {
    expect(PROPERTY_PANEL_SRC).toMatch(/const seededFillColor = '#0088ff';/);
  });

  it('the polygon style assignment uses seededFillColor (not the inherited baseColor)', () => {
    expect(PROPERTY_PANEL_SRC).toMatch(/fillColor: seededFillColor,\s*fillOpacity: 0\.25,/);
  });
});

describe('Selection outline weight — bumps over a textured fill so the blue reads', () => {
  it('detects an active fill pattern (skipping NONE / SOLID) before bumping the stroke', () => {
    expect(CANVAS_SRC).toMatch(/const hasFillPattern = !!feature\.style\.fillPattern[\s\S]*?feature\.style\.fillPattern !== 'NONE'[\s\S]*?feature\.style\.fillPattern !== 'SOLID';/);
  });

  it('adds +1 px to the selection line weight when a fill pattern is active', () => {
    expect(CANVAS_SRC).toMatch(/const selLineW = hasFillPattern \? baseSelLineW \+ 1 : baseSelLineW;/);
  });
});
