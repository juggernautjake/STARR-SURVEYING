// __tests__/cad/ui/label-background-render.test.ts
//
// Slice 233 of cad-label-backgrounds-and-textured-fills-2026-05-30.md.
// Locks the source-level wiring of the opt-in label background render
// path: a dedicated labelBackgroundLayer between featureLayer and
// labelLayer, a labelBackgrounds Map<string, Graphics>, a
// drawLabelBackgroundRect helper, and the per-render-path branch that
// gets/creates/clears a Graphics under each label whose
// backgroundColor opted in. fs.readFileSync regex assertions on
// CanvasViewport.tsx since the SSR snapshot caching blocks
// interactive zustand assertions.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'app', 'admin', 'cad', 'components', 'CanvasViewport.tsx'),
  'utf8',
);

describe('Slice 233 — labelBackgroundLayer wired into drawingRotContainer', () => {
  it('declares labelBackgroundLayer in the pixi state shape', () => {
    expect(SRC).toMatch(/labelBackgroundLayer: import\('pixi\.js'\)\.Container;/);
  });

  it('constructs labelBackgroundLayer before labelLayer in the bootstrap', () => {
    expect(SRC).toMatch(/const labelBackgroundLayer = new PIXI\.Container\(\);\s*\n\s*const labelLayer = new PIXI\.Container\(\);/);
  });

  it('adds labelBackgroundLayer to drawingRotContainer between featureLayer and labelLayer', () => {
    expect(SRC).toMatch(/drawingRotContainer\.addChild\(gridLayer, featureLayer, labelBackgroundLayer, labelLayer, selectionLayer, snapLayer, toolPreviewLayer\);/);
  });
});

describe('Slice 233 — labelBackgrounds Map declared + initialized', () => {
  it('pixi state shape declares labelBackgrounds map keyed by string -> Graphics', () => {
    expect(SRC).toMatch(/labelBackgrounds: Map<string, import\('pixi\.js'\)\.Graphics>;/);
  });

  it('initial pixi state seeds labelBackgrounds as an empty Map', () => {
    expect(SRC).toMatch(/labelBackgrounds: new Map\(\),/);
  });
});

describe('Slice 233 — drawLabelBackgroundRect helper', () => {
  it('declares a helper that takes Graphics + Text + padding + colors', () => {
    expect(SRC).toMatch(/function drawLabelBackgroundRect\(\s*g: import\('pixi\.js'\)\.Graphics,\s*textObj: import\('pixi\.js'\)\.Text,\s*padding: number,\s*bgColor: string \| null,\s*borderColor: string \| null,\s*borderWidth: number \| null,\s*fillAlpha: number = 1,\s*\)/);
  });

  it('reads textObj.getLocalBounds() and pads the rect on every side', () => {
    expect(SRC).toMatch(/const bounds = textObj\.getLocalBounds\(\);[\s\S]*?const x = bounds\.x - padding;[\s\S]*?const y = bounds\.y - padding;[\s\S]*?const w = bounds\.width \+ padding \* 2;[\s\S]*?const h = bounds\.height \+ padding \* 2;/);
  });

  it('positions + rotates the rect Graphics to track the text in screen space', () => {
    expect(SRC).toMatch(/g\.position\.set\(textObj\.position\.x, textObj\.position\.y\);\s*\n\s*g\.rotation = textObj\.rotation;/);
  });
});

describe('Slice 233 — renderAreaAnnotations background branch', () => {
  it('uses an `area:` key into labelBackgrounds for AREA_LABEL annotations', () => {
    expect(SRC).toMatch(/const bgKey = `area:\$\{ann\.id\}`;/);
  });

  it('skips the rect when ann.backgroundColor is null + cleans up any existing rect', () => {
    expect(SRC).toMatch(/if \(ann\.backgroundColor\) \{[\s\S]*?drawLabelBackgroundRect\([\s\S]*?\} else \{[\s\S]*?const existing = pixi\.labelBackgrounds\.get\(bgKey\);[\s\S]*?if \(existing\) \{[\s\S]*?pixi\.labelBackgroundLayer\.removeChild\(existing\);[\s\S]*?pixi\.labelBackgrounds\.delete\(bgKey\);/);
  });

  it('passes ann.borderColor only when ann.borderVisible is true', () => {
    expect(SRC).toMatch(/ann\.borderVisible \? ann\.borderColor : null,\s*ann\.borderVisible \? 1 : null/);
  });

  it('removes the area-label background rect from labelBackgrounds when the annotation is GC-ed', () => {
    expect(SRC).toMatch(/pixi\.areaLabelTexts\.delete\(id\);[\s\S]*?const bgKey = `area:\$\{id\}`;[\s\S]*?pixi\.labelBackgrounds\.delete\(bgKey\);/);
  });
});

describe('Slice 233 — renderLabels per-feature TextLabel background branch', () => {
  it('uses a `label:` key into labelBackgrounds for per-feature TextLabels', () => {
    expect(SRC).toMatch(/const bgKey = `label:\$\{labelKey\}`;/);
  });

  it('reads style.padding / style.backgroundColor / style.borderColor / style.borderWidth', () => {
    // The call wraps each field in a conditional now (explicit per-label bg vs
    // the hover-highlight pill), so match the field references without
    // requiring a trailing comma immediately after each.
    expect(SRC).toMatch(/drawLabelBackgroundRect\([\s\S]*?bgGfx,[\s\S]*?textObj,[\s\S]*?label\.style\.padding[\s\S]*?label\.style\.backgroundColor[\s\S]*?label\.style\.borderColor[\s\S]*?label\.style\.borderWidth[\s\S]*?\);/);
  });

  it('cleans up the rect when the label leaves the layer-visible set', () => {
    expect(SRC).toMatch(/pixi\.labelTexts\.delete\(key\);[\s\S]*?const bgKey = `label:\$\{key\}`;[\s\S]*?pixi\.labelBackgrounds\.delete\(bgKey\);/);
  });

  it('hides the rect when the label is viewport-culled but kept', () => {
    expect(SRC).toMatch(/textObj\.visible = false;\s*\n\s*const bg = pixi\.labelBackgrounds\.get\(`label:\$\{key\}`\);\s*\n\s*if \(bg\) bg\.visible = false;/);
  });
});
