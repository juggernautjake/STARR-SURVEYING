// __tests__/cad/ui/survey-info-layer-hide.test.ts
//
// cad-fill-rotation Slice 3 — locks the source-level wiring that
// makes the SURVEY-INFO layer's eye toggle ACTUALLY hide the paper
// furniture (title block + scale bar + signature block + north arrow
// + legend + certification + notes). Those overlays are paper-fixed
// canvas Graphics, not real Feature rows on the layer, so they need
// an explicit gate — without it the layer's eye was dead.
//
// Source-regex on CanvasViewport.tsx since renderTitleBlock lives
// inside a multi-thousand-line Pixi component; runtime assertions
// would need the full canvas + zustand stores + react-dom mount.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'app', 'admin', 'cad', 'components', 'CanvasViewport.tsx'),
  'utf8',
);

describe('renderTitleBlock — SURVEY-INFO layer visibility gates the overlay', () => {
  it('reads the SURVEY-INFO layer from drawingStore.document.layers', () => {
    expect(SRC).toMatch(/const surveyInfoLayer = drawingStore\.document\.layers\['SURVEY-INFO'\];/);
  });

  it('derives a tbVisible flag from the layer\'s visible field (default true when the layer is missing)', () => {
    expect(SRC).toMatch(/const tbVisible = surveyInfoLayer \? surveyInfoLayer\.visible !== false : true;/);
  });

  it('sets pixi.titleBlockLayer.visible so every TB child element hides in one shot', () => {
    expect(SRC).toMatch(/pixi\.titleBlockLayer\.visible = tbVisible;/);
  });

  it('early-returns when hidden so the rest of renderTitleBlock skips its work', () => {
    expect(SRC).toMatch(/if \(!tbVisible\)\s*\{[\s\S]*?return;\s*\}/);
  });

  it('clears tbBoundsRef when hidden so an invisible overlay can\'t capture clicks or context menus', () => {
    expect(SRC).toMatch(/if \(!tbVisible\)\s*\{[\s\S]*?tbBoundsRef\.current = \{[\s\S]*?northArrow: null[\s\S]*?titleBlock: null[\s\S]*?scaleBar: null[\s\S]*?signatureBlock: null[\s\S]*?officialSealLabel: null[\s\S]*?certification: null[\s\S]*?notes: null,\s*\};/);
  });
});
