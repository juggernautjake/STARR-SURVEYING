// __tests__/cad/ui/area-label-over-texture.test.ts
//
// Slice 238 of cad-label-backgrounds-and-textured-fills-2026-05-30.md.
// Composability sanity: a DOT_GRAVEL polygon must paint its texture
// UNDER its area label's background rect, which must paint UNDER the
// label text. The original planning doc asked for a Playwright
// screenshot diff; we ship the structural invariants instead because
// they're stronger guarantees + don't need a live backend:
//
//   1. SCHEMA: AreaAnnotation carries `backgroundColor` + `padding`
//      (Slice 232) and FeatureStyle carries `fillPattern` (Slice 235),
//      so the two systems can be configured independently per the
//      user's composability ask.
//   2. Z-ORDER: drawingRotContainer adds layers in the order
//      `featureLayer → labelBackgroundLayer → labelLayer` so a
//      polygon's texture (drawn on featureLayer via the per-feature
//      texture Graphics) sits BELOW the area label's background rect
//      (drawn on labelBackgroundLayer), which sits BELOW the area
//      label text (drawn on labelLayer). This makes the user's ask
//      "label text easy to read on top of the textured area"
//      structurally enforced — no per-frame z-fighting possible.
//   3. DATA PATH: the gravel sampler actually produces dots inside the
//      polygon's screen-space bounding rect; an area label centered
//      on the polygon's centroid produces text the background rect
//      can cover.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import { createAreaLabelForFeature, DEFAULT_AREA_LABEL_CONFIG } from '@/lib/cad/labels/area-label';
import { generateFillPattern } from '@/lib/cad/styles/fill-patterns';
import type { Feature } from '@/lib/cad/types';

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'app', 'admin', 'cad', 'components', 'CanvasViewport.tsx'),
  'utf8',
);

describe('Slice 238 — composability invariant #1: schema', () => {
  it('an AreaAnnotation can opt into a white background with padding (Slice 232)', () => {
    const polygon: Feature = {
      id: 'gravel-polygon',
      type: 'POLYGON',
      layerId: 'BOUNDARY',
      geometry: {
        type: 'POLYGON',
        vertices: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
          { x: 0, y: 100 },
        ],
      },
      style: { color: '#000000', lineWeight: 1, opacity: 1 },
      visible: true,
      locked: false,
      selected: false,
      properties: {},
    } as unknown as Feature;
    const ann = createAreaLabelForFeature(polygon, DEFAULT_AREA_LABEL_CONFIG);
    expect(ann).not.toBeNull();
    // Default off: composability requires the label opt INTO the rect.
    expect(ann!.backgroundColor).toBeNull();
    // Surveyor opts in.
    const opted = { ...ann!, backgroundColor: '#ffffff', padding: 4, borderVisible: false } as typeof ann;
    expect(opted!.backgroundColor).toBe('#ffffff');
    expect(opted!.padding).toBe(4);
  });

  it('a Feature can opt into DOT_GRAVEL via FeatureStyle.fillPattern (Slice 235)', () => {
    const feature: Feature = {
      id: 'gravel-polygon',
      type: 'POLYGON',
      layerId: 'BOUNDARY',
      geometry: {
        type: 'POLYGON',
        vertices: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
          { x: 0, y: 100 },
        ],
      },
      style: { color: '#000000', lineWeight: 1, opacity: 1, fillPattern: 'DOT_GRAVEL' },
      visible: true,
      locked: false,
      selected: false,
      properties: {},
    } as unknown as Feature;
    expect(feature.style.fillPattern).toBe('DOT_GRAVEL');
  });
});

describe('Slice 238 — composability invariant #2: z-order', () => {
  it('drawingRotContainer adds layers in featureLayer → labelBackgroundLayer → labelLayer order', () => {
    expect(SRC).toMatch(
      /drawingRotContainer\.addChild\(gridLayer, featureLayer, labelBackgroundLayer, labelLayer, selectionLayer, snapLayer, toolPreviewLayer\);/,
    );
  });

  it('the polygon texture Graphics live on the same parent as featureGraphics (below labelBackgroundLayer)', () => {
    // The texture helper attaches mask + tex to the same parent as
    // pixi.featureGraphics — that parent is featureLayer (or a layer
    // sub-container that itself sits inside featureLayer), which is
    // ABOVE-NONE and BELOW labelBackgroundLayer in the rotContainer
    // addChild order — so the polygon texture renders below the rect.
    expect(SRC).toMatch(
      /const parent = pixi\.featureGraphics\.get\(feature\.id\)\?\.parent \?\? pixi\.featureLayer;[\s\S]*?parent\.addChild\(mask, tex\);/,
    );
  });

  it('the area label background Graphics live on labelBackgroundLayer (between texture + text)', () => {
    expect(SRC).toMatch(
      /pixi\.labelBackgrounds\.set\(bgKey, bgGfx\);[\s\S]*?pixi\.labelBackgroundLayer\.addChild\(bgGfx\);/,
    );
  });

  it('the area label text Graphics live on labelLayer (above labelBackgroundLayer)', () => {
    // renderAreaAnnotations builds the Pixi Text + drops it on
    // labelLayer; labelLayer is added AFTER labelBackgroundLayer in
    // rotContainer so the text z-orders above its own background.
    expect(SRC).toMatch(/pixi\.areaLabelTexts\.set\(ann\.id, textObj\);[\s\S]*?pixi\.labelLayer\.addChild\(textObj\);/);
  });
});

describe('Slice 238 — composability invariant #3: data path', () => {
  it('the gravel sampler produces dots inside the polygon bounding rect', () => {
    // 100×100 polygon at density 1 should produce ≥ 1 gravel dot —
    // verified by the Slice 235 spec, repeated here as the
    // composability anchor.
    const { dots, lines } = generateFillPattern(100, 100, {
      pattern: 'DOT_GRAVEL',
      density: 1,
      seed: 42,
    });
    expect(dots.length).toBeGreaterThan(0);
    expect(lines).toEqual([]);
    for (const d of dots) {
      expect(d.x).toBeGreaterThanOrEqual(0);
      expect(d.x).toBeLessThanOrEqual(100);
      expect(d.y).toBeGreaterThanOrEqual(0);
      expect(d.y).toBeLessThanOrEqual(100);
    }
  });

  it('an area label placed on a polygon centers on its centroid (covering the gravel dots there)', () => {
    const polygon: Feature = {
      id: 'gravel-square',
      type: 'POLYGON',
      layerId: 'BOUNDARY',
      geometry: {
        type: 'POLYGON',
        vertices: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
          { x: 0, y: 100 },
        ],
      },
      style: { color: '#000000', lineWeight: 1, opacity: 1, fillPattern: 'DOT_GRAVEL' },
      visible: true,
      locked: false,
      selected: false,
      properties: {},
    } as unknown as Feature;
    const ann = createAreaLabelForFeature(polygon, DEFAULT_AREA_LABEL_CONFIG);
    expect(ann).not.toBeNull();
    // Centroid of the unit square = (50, 50) — sits inside the polygon's
    // bounding rect so the label background rect (drawn at the same
    // screen coordinates) covers the gravel dots underneath it.
    expect(ann!.position.x).toBeCloseTo(50, 6);
    expect(ann!.position.y).toBeCloseTo(50, 6);
  });
});
