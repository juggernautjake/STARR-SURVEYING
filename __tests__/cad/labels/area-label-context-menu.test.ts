// __tests__/cad/labels/area-label-context-menu.test.ts
//
// Slice 231 of cad-area-calculation-multi-unit-2026-05-29.md. Locks
// the source-level wiring of the right-click context menu on rendered
// AREA_LABEL annotations — Hide / Re-center / Change format
// (SQFT, ACRES, BOTH) / Delete. Source-level regex assertions on
// CanvasViewport.tsx, immune to the useSyncExternalStore SSR
// snapshot caching that blocks interactive zustand assertions.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'app', 'admin', 'cad', 'components', 'CanvasViewport.tsx'),
  'utf8',
);

describe('Slice 231 — area-label context-menu state + handler wiring', () => {
  it('imports pickFeatureCentroid + buildAreaText from the area-label module', () => {
    expect(SRC).toMatch(/import \{ pickFeatureCentroid, buildAreaText \} from '@\/lib\/cad\/labels\/area-label';/);
  });

  it('declares the areaLabelContextMenu state with { x, y, annotationId }', () => {
    expect(SRC).toMatch(/const \[areaLabelContextMenu, setAreaLabelContextMenu\] = useState<\{\s*x: number; y: number;\s*annotationId: string;\s*\} \| null>\(null\);/);
  });

  it('handleContextMenu checks hitTestAreaLabel BEFORE hitTestTBElement', () => {
    expect(SRC).toMatch(/const areaLabelCtxHit = hitTestAreaLabel\(sx, sy\);[\s\S]*?if \(areaLabelCtxHit\) \{[\s\S]*?setAreaLabelContextMenu\(\{ x: e\.clientX, y: e\.clientY, annotationId: areaLabelCtxHit\.annotationId \}\);[\s\S]*?return;\s*\}[\s\S]*?const tbHitElem = hitTestTBElement\(sx, sy\);/);
  });
});

describe('Slice 231 — context-menu JSX', () => {
  it('renders the menu container with the testid + click-away overlay', () => {
    expect(SRC).toContain('data-testid="area-label-context-menu"');
    // Click-away closes the menu so a plain left-click anywhere
    // dismisses it without committing an action.
    expect(SRC).toMatch(/onClick=\{close\}/);
  });

  it('Hide button calls updateAnnotation with { visible: false }', () => {
    expect(SRC).toContain('data-testid="area-label-ctx-hide"');
    expect(SRC).toMatch(/annStore\.updateAnnotation\(ann\.id, \{ visible: false \} as Partial<AreaAnnotation>\);/);
  });

  it('Re-center button looks up the linked feature, runs pickFeatureCentroid, and writes position', () => {
    expect(SRC).toContain('data-testid="area-label-ctx-recenter"');
    // P6k widened — CanvasViewport's `drawingStore.X(...)` callbacks
    // route through `useDrawingStore.getState().X(...)`.
    expect(SRC).toMatch(/const linked = (drawingStore|useDrawingStore\.getState\(\))\.getFeature\(ann\.linkedFeatureId\);/);
    expect(SRC).toMatch(/const c = pickFeatureCentroid\(linked\);/);
    expect(SRC).toMatch(/annStore\.updateAnnotation\(ann\.id, \{ position: c \} as Partial<AreaAnnotation>\);/);
  });

  it('Change-format actions cover SQFT, ACRES, BOTH + rebuild the text via buildAreaText', () => {
    expect(SRC).toContain('data-testid="area-label-ctx-format-sqft"');
    expect(SRC).toContain('data-testid="area-label-ctx-format-acres"');
    expect(SRC).toContain('data-testid="area-label-ctx-format-both"');
    expect(SRC).toMatch(/const setFormat = \(fmt: AreaAnnotation\['format'\]\) => \{[\s\S]*?const newText = buildAreaText\(ann\.areaSqFt, fmt, ann\.lotNumber \?\? undefined, ann\.blockNumber \?\? undefined\);[\s\S]*?annStore\.updateAnnotation\(ann\.id, \{ format: fmt, text: newText \} as Partial<AreaAnnotation>\);/);
  });

  it('format buttons highlight the currently-active format in blue', () => {
    // Indicates to the surveyor which format is currently in effect —
    // the active button gets a `text-blue-300` class instead of the
    // default `text-gray-200`.
    expect(SRC).toMatch(/ann\.format === 'SQFT' \? 'text-blue-300' : 'text-gray-200'/);
    expect(SRC).toMatch(/ann\.format === 'ACRES' \? 'text-blue-300' : 'text-gray-200'/);
    expect(SRC).toMatch(/ann\.format === 'BOTH' \? 'text-blue-300' : 'text-gray-200'/);
  });

  it('Delete button calls removeAnnotation', () => {
    expect(SRC).toContain('data-testid="area-label-ctx-delete"');
    expect(SRC).toMatch(/annStore\.removeAnnotation\(ann\.id\);/);
  });

  it('every action button closes the menu after firing', () => {
    // close() is the canonical setter for the null state. Each action
    // ends with close() so the menu doesn't linger after an action.
    expect(SRC).toMatch(/const close = \(\) => setAreaLabelContextMenu\(null\);/);
  });

  it('defensively bails out when the annotation under the menu is no longer in the store', () => {
    // If, between right-click and action, something deleted the
    // annotation (e.g. a parallel undo), the menu should render
    // nothing rather than crashing on undefined.
    expect(SRC).toMatch(/if \(!ann \|\| ann\.type !== 'AREA_LABEL'\) return null;/);
  });
});
