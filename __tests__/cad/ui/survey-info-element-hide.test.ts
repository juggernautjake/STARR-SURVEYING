// __tests__/cad/ui/survey-info-element-hide.test.ts
//
// cad-survey-info-element-hide — each default SURVEY-INFO furniture
// element (title block box / seal+signature / graphic scale / north
// arrow) can be hidden individually from the Layers panel, on top of
// the existing whole-layer eye. Locks:
//   1. The per-element TitleBlockConfig visibility flags exist.
//   2. CanvasViewport gates each element's container on its own flag
//      (and no longer early-returns the whole overlay on tb.visible).
//   3. LayerPanel renders a per-element eye that toggles that flag.
//
// Source-regex for the canvas + panel (renderTitleBlock lives in a
// multi-thousand-line Pixi component); a runtime check covers the
// store merge.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { useDrawingStore } from '@/lib/cad/store';

const CANVAS_SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'app', 'admin', 'cad', 'components', 'CanvasViewport.tsx'),
  'utf8',
);
const PANEL_SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'app', 'admin', 'cad', 'components', 'LayerPanel.tsx'),
  'utf8',
);
const TYPES_SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'lib', 'cad', 'types.ts'),
  'utf8',
);

describe('TitleBlockConfig — per-element visibility flags', () => {
  it('declares signatureBlockVisible + northArrowVisible (scaleBarVisible + visible already existed)', () => {
    expect(TYPES_SRC).toMatch(/signatureBlockVisible\?:\s*boolean/);
    expect(TYPES_SRC).toMatch(/northArrowVisible\?:\s*boolean/);
    expect(TYPES_SRC).toMatch(/scaleBarVisible\?:\s*boolean/);
  });
});

describe('renderTitleBlock — gates each furniture element on its own flag', () => {
  it('no longer early-returns the whole overlay on the title-block box flag', () => {
    // The master "hide all" is the SURVEY-INFO layer eye; the box flag
    // must only hide the box, so the function proceeds when tb exists.
    expect(CANVAS_SRC).not.toMatch(/if \(!tb\?\.visible\) return;/);
    expect(CANVAS_SRC).toMatch(/if \(!tb\) return;/);
  });

  it('toggles the title block / signature / north arrow containers on their flags', () => {
    expect(CANVAS_SRC).toMatch(/const tbBoxVisible = tb\.visible !== false;/);
    expect(CANVAS_SRC).toMatch(/const sigVisible\s*=\s*tb\.signatureBlockVisible !== false;/);
    expect(CANVAS_SRC).toMatch(/const naVisible\s*=\s*tb\.northArrowVisible !== false;/);
    expect(CANVAS_SRC).toMatch(/pixi\.tbTitleBlockContainer\.visible = tbBoxVisible;/);
    expect(CANVAS_SRC).toMatch(/pixi\.tbSignatureContainer\.visible\s*=\s*sigVisible;/);
    expect(CANVAS_SRC).toMatch(/pixi\.tbNorthArrowContainer\.visible = naVisible;/);
  });

  it('nulls the hit-bounds of any hidden element so it can\'t capture clicks', () => {
    expect(CANVAS_SRC).toMatch(/if \(!tbBoxVisible\) tbBoundsRef\.current\.titleBlock = null;/);
    expect(CANVAS_SRC).toMatch(/if \(!naVisible\) tbBoundsRef\.current\.northArrow = null;/);
  });
});

describe('LayerPanel — per-element eye toggles under SURVEY-INFO', () => {
  it('renders a per-element eye button (templated testid) for the four furniture elements', () => {
    expect(PANEL_SRC).toContain('layer-panel-survey-info-eye-${el.key}');
    // Each element's flag key appears in the surveyElements list.
    for (const key of ['visible', 'signatureBlockVisible', 'scaleBarVisible', 'northArrowVisible']) {
      expect(PANEL_SRC).toMatch(new RegExp(`key:\\s*'${key}'`));
    }
  });

  it('toggles the element\'s flag via updateTitleBlock on click', () => {
    // P6d swapped the LayerPanel's whole-store `store` binding for
    // per-field selectors + `useDrawingStore.getState()` callbacks;
    // accept either form for the toggle call.
    expect(PANEL_SRC).toMatch(/(store|useDrawingStore\.getState\(\))\.updateTitleBlock\(\{\s*\[el\.key\]:\s*!el\.visible\s*\}\s*as Partial<TitleBlockConfig>\)/);
  });
});

describe('store.updateTitleBlock — merges the new per-element flags', () => {
  it('sets signatureBlockVisible / northArrowVisible without clobbering siblings', () => {
    const store = useDrawingStore.getState();
    store.updateTitleBlock({ signatureBlockVisible: false });
    store.updateTitleBlock({ northArrowVisible: false });
    const tb = useDrawingStore.getState().document.settings.titleBlock;
    expect(tb.signatureBlockVisible).toBe(false);
    expect(tb.northArrowVisible).toBe(false);
    // sibling flag untouched
    expect(tb.visible).not.toBe(false);
    // restore so other tests see a clean slate
    store.updateTitleBlock({ signatureBlockVisible: true, northArrowVisible: true });
  });
});
