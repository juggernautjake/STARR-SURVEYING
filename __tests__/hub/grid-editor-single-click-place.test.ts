// __tests__/hub/grid-editor-single-click-place.test.ts
//
// Slice P2 of grid-editor-single-click-and-8x12-2026-05-30.md. Locks
// the single-click placement wiring in GridEditor: an armed widget
// type previews its default footprint at the hovered cell + drops on
// a single click (no more two-click anchor flow). Source-regex on
// GridEditor.tsx since the modal's interactive state hits the SSR
// snapshot-caching limitation other hub specs work around.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', 'lib', 'hub', 'components', 'GridEditor.tsx'),
  'utf8',
);

describe('Slice P2 — the two-click anchor flow is gone', () => {
  it('no longer declares a placeAnchor state', () => {
    expect(SRC).not.toMatch(/placeAnchor/);
    expect(SRC).not.toMatch(/setPlaceAnchor/);
  });

  it('keeps a placeHover state for the live preview cell', () => {
    expect(SRC).toMatch(
      /const \[placeHover, setPlaceHover\] = useState<\{ x: number; y: number \} \| null>\(null\);/,
    );
  });

  it('the placement handler no longer calls rectFromAnchors', () => {
    // rectFromAnchors stays exported as a pure helper, but the preview
    // derivation must not reference it anymore.
    const preview = SRC.match(/const previewRect = \(\(\) => \{[\s\S]*?\}\)\(\);/);
    expect(preview).not.toBeNull();
    expect(preview![0]).not.toMatch(/rectFromAnchors/);
  });
});

describe('Slice P2 — preview = default footprint at the hovered cell', () => {
  it('derives the preview from selected.defaultSize anchored at placeHover, clamped', () => {
    expect(SRC).toMatch(
      /const previewRect = \(\(\) => \{[\s\S]*?if \(!selected\) return null;[\s\S]*?if \(!placeHover\) return null;[\s\S]*?const size = selected\.defaultSize;[\s\S]*?const raw = \{ x: placeHover\.x, y: placeHover\.y, w: size\.w, h: size\.h \};[\s\S]*?return clampRectToEnvelope\(raw, size, size\);/,
    );
  });

  it('still flags the preview blocked when it overlaps an existing widget', () => {
    expect(SRC).toMatch(/const previewBlocked = previewRect\s*\?\s*overlapsAny\(previewRect, draftWidgets \?\? \[\]\)\s*:\s*false;/);
  });
});

describe('Slice P2 — single click drops the widget at default size', () => {
  it('the cell pointer-down clamps the default footprint at the clicked cell', () => {
    expect(SRC).toMatch(
      /function handleCellPointerDown\(x: number, y: number\) \{[\s\S]*?const size = selected\.defaultSize;[\s\S]*?const rect = clampRectToEnvelope\(\{ x, y, w: size\.w, h: size\.h \}, size, size\);/,
    );
  });

  it('no-ops the click when the footprint would overlap (blocked tile)', () => {
    expect(SRC).toMatch(/if \(overlapsAny\(rect, draftWidgets \?\? \[\]\)\) return;[^\n]*\/\/ blocked/);
  });

  it('adds the widget at the clamped rect with the default content', () => {
    expect(SRC).toMatch(
      /addWidget\(\{[\s\S]*?type: selected\.id,[\s\S]*?x: rect\.x,[\s\S]*?y: rect\.y,[\s\S]*?w: rect\.w,[\s\S]*?h: rect\.h,[\s\S]*?customization: \{ content: selected\.defaultContent \},[\s\S]*?\}\);/,
    );
  });

  it('disarms the selected type after placing (no accidental double-drop)', () => {
    expect(SRC).toMatch(/setSelectedType\(null\);[\s\S]*?setPlaceHover\(null\);/);
  });
});

describe('Slice P2 — hover preview follows the pointer whenever armed', () => {
  it('pointer-enter sets the hovered cell when a widget is armed (no anchor needed)', () => {
    expect(SRC).toMatch(
      /function handleCellPointerEnter\(x: number, y: number\) \{[\s\S]*?if \(selected\) setPlaceHover\(\{ x, y \}\);/,
    );
  });
});

describe('Slice P2 — Escape disarms the placement type', () => {
  it('the Esc cascade disarms selectedType (replacing the old placeAnchor branch)', () => {
    expect(SRC).toMatch(
      /if \(cancelMoveRef\.current\) \{[\s\S]*?\} else if \(selectedType\) \{[\s\S]*?setSelectedType\(null\);[\s\S]*?setPlaceHover\(null\);[\s\S]*?\} else if \(selectedPlacedId\)/,
    );
  });
});
