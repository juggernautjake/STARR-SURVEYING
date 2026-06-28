// __tests__/cad/image-selection-highlight.test.ts
//
// Source-lock for the IMAGE selection / hover / drag UX in CanvasViewport.
//
// Background: rotated images used to show NO selection box and NO hover
// outline (the renderSelection + drawGeomOutline switches had no IMAGE case),
// so a selected/rotated image gave almost no visual feedback and the highlight
// never tracked the rotation. The body-drag also left the original at full
// opacity beside its ghost ("two copies"). These tests pin the fixes so they
// can't silently regress. The rotation math itself is covered by
// image-geometry.test.ts; here we assert the renderer uses it.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.join(__dirname, '..', '..');
const SRC = fs.readFileSync(
  path.join(repoRoot, 'app/admin/cad/components/CanvasViewport.tsx'),
  'utf8',
);

/** Body of the `drawGeomOutline` hover helper. */
function hoverOutlineBlock(): string {
  const start = SRC.indexOf('const drawGeomOutline');
  expect(start).toBeGreaterThan(-1);
  // Ends at the `};` that closes the arrow function.
  const end = SRC.indexOf('};', start);
  return SRC.slice(start, end);
}

/** Body of the selection-highlight loop (`for (const featureId of selectedIds)`). */
function selectionBlock(): string {
  const start = SRC.indexOf('// Draw selection highlights');
  expect(start).toBeGreaterThan(-1);
  const end = SRC.indexOf('// Grip squares at vertices', start);
  return SRC.slice(start, end);
}

describe('CanvasViewport — IMAGE selection highlight (rotation-aware)', () => {
  it('the selection-highlight switch has an IMAGE case', () => {
    expect(selectionBlock()).toMatch(/case 'IMAGE':/);
  });

  it('the selection box is built from the rotated corners (imageCorners)', () => {
    const block = selectionBlock();
    // imageCorners(...) destructured into bl/br/tr/tl inside the IMAGE case.
    expect(block).toMatch(/case 'IMAGE':[\s\S]*?imageCorners\(geom\.image\)/);
    expect(block).toMatch(/const \{ bl, br, tr, tl \} = imageCorners/);
  });
});

describe('CanvasViewport — IMAGE hover outline (rotation-aware)', () => {
  it('the hover drawGeomOutline switch has an IMAGE case', () => {
    expect(hoverOutlineBlock()).toMatch(/case 'IMAGE':/);
  });

  it('the hover outline is built from the rotated corners (imageCorners)', () => {
    expect(hoverOutlineBlock()).toMatch(/case 'IMAGE':[\s\S]*?imageCorners\(geom\.image\)/);
  });
});

describe('CanvasViewport — IMAGE body-drag clarity', () => {
  it('fades the in-place original while its body is being dragged (no double image)', () => {
    // renderImageFeatures dims the real sprite when this feature is the one
    // being body-dragged, so only the ghost reads at the cursor.
    expect(SRC).toMatch(/beingBodyDragged/);
    expect(SRC).toMatch(/bodyDrag\?\.featureId === feature\.id && bodyDrag\.moved/);
    expect(SRC).toMatch(/sprite\.alpha = beingBodyDragged \?/);
  });

  it('cancels a body-drag when the cursor leaves the canvas (no stuck-faded image)', () => {
    // onMouseLeave must clear the body-drag ref + ghost so the dimmed original
    // restores and never gets orphaned (mouseup is bound to the canvas only).
    const start = SRC.indexOf('onMouseLeave');
    expect(start).toBeGreaterThan(-1);
    const block = SRC.slice(start, start + 600);
    expect(block).toMatch(/if \(imageBodyDragRef\.current\) \{[\s\S]*?imageBodyDragRef\.current = null;[\s\S]*?destroyImageGhost\(\);/);
  });
});

describe('CanvasViewport — IMAGE drags never snap (no stray snap glyph)', () => {
  it('image resize uses the RAW cursor point, not the snapped one', () => {
    // The IMAGE grip-resize maps a raw screenToDrawingWorld point into the
    // image local frame — NOT the shared snapped `worldPt` — so a corner can't
    // jump to a distant survey point.
    expect(SRC).toMatch(/const rawWorld = screenToDrawingWorld\(sx, sy\);[\s\S]{0,120}worldToImageLocal\(startImg, \{ x: rawWorld\.wx, y: rawWorld\.wy \}\)/);
  });

  it('image resize / rotate / body-drag each clear the snap indicator', () => {
    // snapResultRef is cleared in all three image drag paths so the yellow
    // NEAREST glyph never appears away from the image. Each path is marked with
    // a unique "Images never snap" comment immediately above its clear.
    expect(SRC).toMatch(/Images never snap to survey geometry . clear any snap/); // rotate
    expect(SRC).toMatch(/Images never snap to survey geometry: resize follows the RAW/); // resize
    expect(SRC).toMatch(/Images never snap . drop any snap glyph/); // body-drag
    // pre-existing snap clears (1) + the three image paths = at least 4.
    const clears = SRC.match(/snapResultRef\.current = null;/g) ?? [];
    expect(clears.length).toBeGreaterThanOrEqual(4);
  });
});
