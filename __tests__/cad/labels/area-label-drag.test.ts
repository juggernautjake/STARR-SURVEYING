// __tests__/cad/labels/area-label-drag.test.ts
//
// Slice 230 of cad-area-calculation-multi-unit-2026-05-29.md. Locks
// the source-level wiring of the drag-to-move pipeline for AREA_LABEL
// annotations in CanvasViewport — hit-test helper, drag-state ref,
// pointer-down grab, pointer-move position commit, pointer-up clear,
// and the hover cursor change. Source-level regex assertions keep
// this immune to the useSyncExternalStore SSR-snapshot caching that
// blocks interactive zustand assertions.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'app', 'admin', 'cad', 'components', 'CanvasViewport.tsx'),
  'utf8',
);

describe('Slice 230 — area-label drag state', () => {
  it('declares an areaLabelDragRef alongside labelDragRef', () => {
    expect(SRC).toMatch(/const areaLabelDragRef = useRef<\{\s*annotationId: string;\s*startWorld: Point2D;\s*startPosition: Point2D;\s*\} \| null>\(null\);/);
  });
});

describe('Slice 230 — hitTestAreaLabel helper', () => {
  it('defines hitTestAreaLabel(sx, sy) returning { annotationId } | null', () => {
    expect(SRC).toMatch(/function hitTestAreaLabel\(sx: number, sy: number\): \{ annotationId: string \} \| null \{/);
  });

  it('iterates pixi.areaLabelTexts and tests Pixi bounds', () => {
    expect(SRC).toMatch(/for \(const \[id, textObj\] of pixi\.areaLabelTexts\) \{/);
    expect(SRC).toMatch(/const b = textObj\.getBounds\(\);/);
    expect(SRC).toMatch(/return \{ annotationId: id \};/);
  });

  it('skips invisible Pixi text objects', () => {
    // Ensures hidden area labels (Slice 231 Hide path) don't accidentally
    // remain grabbable when the surveyor has chosen to hide them.
    expect(SRC).toMatch(/if \(!textObj\.visible\) continue;[\s\S]*?for \(const \[id, textObj\] of pixi\.areaLabelTexts\)/);
  });
});

describe('Slice 230 — SELECT pointer-down grabs the area label first', () => {
  it('runs hitTestAreaLabel before hitTestLabel inside the SELECT pointer-down branch', () => {
    expect(SRC).toMatch(/const areaLabelHit = hitTestAreaLabel\(sx, sy\);[\s\S]*?const labelHit = hitTestLabel\(sx, sy\);/);
  });

  it('initializes areaLabelDragRef.current with the captured world position + annotation position', () => {
    expect(SRC).toMatch(/areaLabelDragRef\.current = \{[\s\S]*?annotationId: ann\.id,[\s\S]*?startWorld: \{ x: wx, y: wy \},[\s\S]*?startPosition: \{ x: ann\.position\.x, y: ann\.position\.y \},[\s\S]*?\};/);
  });

  it('sets the grabbing cursor on grab', () => {
    expect(SRC).toMatch(/areaLabelDragRef\.current = \{[\s\S]*?\};\s*\n\s*setCursorStyle\('grabbing'\);/);
  });

  it('only grabs annotations whose type === AREA_LABEL (defensive type-narrowing)', () => {
    expect(SRC).toMatch(/if \(ann && ann\.type === 'AREA_LABEL'\) \{/);
  });
});

describe('Slice 230 — pointer-move writes the live position through the annotation store', () => {
  it('reads from areaLabelDragRef.current and computes delta = world - startWorld', () => {
    expect(SRC).toMatch(/if \(areaLabelDragRef\.current\) \{[\s\S]*?const \{ annotationId, startWorld, startPosition \} = areaLabelDragRef\.current;[\s\S]*?const \{ wx, wy \} = screenToDrawingWorld\(sx, sy\);/);
  });

  it('calls useAnnotationStore.updateAnnotation with the new position', () => {
    expect(SRC).toMatch(/useAnnotationStore\.getState\(\)\.updateAnnotation\(annotationId, \{[\s\S]*?position: \{ x: startPosition\.x \+ \(wx - startWorld\.x\), y: startPosition\.y \+ \(wy - startWorld\.y\) \},/);
  });

  it('runs the area-label move branch BEFORE the regular labelDragRef branch', () => {
    // Locks ordering so the area-label drag never accidentally falls
    // through to the per-feature text-label code path (which writes
    // offset, not position).
    expect(SRC).toMatch(/if \(areaLabelDragRef\.current\) \{[\s\S]*?return;\s*\}\s*\n\s*\n\s*\/\/ Label drag update\s*\n\s*if \(labelDragRef\.current\) \{/);
  });
});

describe('Slice 230 — pointer-up commits + clears the drag ref', () => {
  it('clears areaLabelDragRef.current and resets cursor to the tool default', () => {
    expect(SRC).toMatch(/if \(areaLabelDragRef\.current\) \{\s*\n\s*areaLabelDragRef\.current = null;\s*\n\s*setCursorStyle\(TOOL_CURSORS\[toolState\.activeTool\] \?\? 'default'\);\s*\n\s*return;\s*\n\s*\}/);
  });
});

describe('Slice 230 — hover cursor flips to grab over an area label', () => {
  it('reuses hitTestAreaLabel inside the SELECT-mode hover cursor block', () => {
    expect(SRC).toMatch(/\} else if \(hitTestAreaLabel\(sx, sy\)\) \{[\s\S]*?setCursorStyle\('grab'\);/);
  });
});
