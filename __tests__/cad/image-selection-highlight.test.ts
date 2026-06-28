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
});
