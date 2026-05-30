// __tests__/hub/grid-editor-hover-controls.test.ts
//
// Slice G2 of grid-editor-placement-resize-overhaul-2026-05-30.md.
// Locks the source-level wiring that reveals the per-widget control
// cluster (delete / options / resize) on hover OR selection OR
// keyboard focus, instead of the old click-to-select-only gate.
// Source-regex on GridEditor.tsx because the modal's interactive
// state hits the SSR snapshot-caching limitation other hub specs
// work around.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', 'lib', 'hub', 'components', 'GridEditor.tsx'),
  'utf8',
);

describe('Slice G2 — hover + focus state', () => {
  it('tracks a hoveredPlacedId state', () => {
    expect(SRC).toMatch(
      /const \[hoveredPlacedId, setHoveredPlacedId\] = useState<string \| null>\(null\);/,
    );
  });

  it('tracks a focusedPlacedId state', () => {
    expect(SRC).toMatch(
      /const \[focusedPlacedId, setFocusedPlacedId\] = useState<string \| null>\(null\);/,
    );
  });

  it('wires pointer enter/leave on the placed widget', () => {
    expect(SRC).toMatch(/onPointerEnter=\{\(\) => setHoveredPlacedId\(inst\.id\)\}/);
    expect(SRC).toMatch(
      /onPointerLeave=\{\(\) =>\s*setHoveredPlacedId\(\(cur\) => \(cur === inst\.id \? null : cur\)\)\s*\}/,
    );
  });

  it('wires focus/blur on the placed widget', () => {
    expect(SRC).toMatch(/onFocus=\{\(\) => setFocusedPlacedId\(inst\.id\)\}/);
    expect(SRC).toMatch(
      /onBlur=\{\(\) =>\s*setFocusedPlacedId\(\(cur\) => \(cur === inst\.id \? null : cur\)\)\s*\}/,
    );
  });
});

describe('Slice G2 — controlsVisible reveal logic', () => {
  it('reveals on hover OR selection OR focus', () => {
    expect(SRC).toMatch(
      /const controlsVisible =\s*!aGestureActive &&\s*\(hoveredPlacedId === inst\.id \|\|\s*isSelected \|\|\s*focusedPlacedId === inst\.id\);/,
    );
  });

  it('suppresses the cluster while a pointer drag or resize is in flight', () => {
    expect(SRC).toMatch(
      /const aGestureActive = moveDrag !== null \|\| resizeTarget !== null;/,
    );
  });

  it('gates the control cluster on controlsVisible (not the old isSelected)', () => {
    expect(SRC).toMatch(/\{controlsVisible && \(/);
    // The old click-only gate must be gone from the cluster.
    expect(SRC).not.toMatch(/\{isSelected && \(\s*<>\s*<button[\s\S]*?Remove widget/);
  });

  it('exposes a data-controls-visible hook for styling / e2e targeting', () => {
    expect(SRC).toMatch(/data-controls-visible=\{controlsVisible \? 'true' : 'false'\}/);
  });
});
