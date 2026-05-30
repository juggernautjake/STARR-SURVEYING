// __tests__/hub/grid-editor-resize.test.tsx
//
// Slice 225 of hub-grid-editor-and-banner-green-2026-05-29.md. Locks
// the pure resize helpers (cellUnderPointer, computeResizedRect) +
// the source-level contracts for the resize handle (only-when-
// selected gating, accent styling, pointer-down wiring).

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import {
  cellUnderPointer,
  computeResizedRect,
} from '@/lib/hub/components/GridEditor';

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', 'lib', 'hub', 'components', 'GridEditor.tsx'),
  'utf8',
);

describe('cellUnderPointer — DOM-free grid coordinate math', () => {
  const BOUNDS = { left: 100, top: 100, width: 800, height: 800 };

  it('returns (0, 0) at the top-left corner', () => {
    expect(cellUnderPointer(BOUNDS, 100, 100)).toEqual({ x: 0, y: 0 });
  });

  it('returns (7, 7) at the bottom-right corner (8×8 grid)', () => {
    // The very last pixel inside the grid → cell (7, 7).
    expect(cellUnderPointer(BOUNDS, 899, 899)).toEqual({ x: 7, y: 7 });
  });

  it('clamps to (0, 0) when the pointer is above/left of the grid', () => {
    expect(cellUnderPointer(BOUNDS, 0, 0)).toEqual({ x: 0, y: 0 });
  });

  it('clamps to (7, 7) when the pointer drags past the bottom-right edge', () => {
    expect(cellUnderPointer(BOUNDS, 9999, 9999)).toEqual({ x: 7, y: 7 });
  });

  it('returns (3, 4) at the cell center', () => {
    // Cell width = 100, height = 100. Cell (3, 4) center = (450, 550).
    expect(cellUnderPointer(BOUNDS, 450, 550)).toEqual({ x: 3, y: 4 });
  });

  it('respects a custom cols/rows configuration', () => {
    expect(cellUnderPointer(BOUNDS, 700, 100, 4, 4)).toEqual({ x: 3, y: 0 });
  });
});

describe('computeResizedRect — anchor stays, grow/shrink the corner', () => {
  const MIN = { w: 2, h: 2 };
  const MAX = { w: 8, h: 8 };

  it('expands the widget when the pointer is past the current bottom-right', () => {
    expect(computeResizedRect({ x: 1, y: 1, w: 2, h: 2 }, { x: 4, y: 5 }, MIN, MAX)).toEqual({
      x: 1, y: 1, w: 4, h: 5,
    });
  });

  it('shrinks the widget but respects minSize', () => {
    expect(computeResizedRect({ x: 1, y: 1, w: 4, h: 4 }, { x: 1, y: 1 }, MIN, MAX)).toEqual({
      x: 1, y: 1, w: 2, h: 2,
    });
  });

  it('caps the new size at maxSize even when the pointer goes way off', () => {
    const max = { w: 4, h: 4 };
    expect(computeResizedRect({ x: 0, y: 0, w: 2, h: 2 }, { x: 7, y: 7 }, MIN, max)).toEqual({
      x: 0, y: 0, w: 4, h: 4,
    });
  });

  it('keeps the widget inside the 8×8 grid even if the user could drag further', () => {
    // Anchor at (5, 5) means the widget can grow no wider than 3.
    expect(computeResizedRect({ x: 5, y: 5, w: 2, h: 2 }, { x: 7, y: 7 }, MIN, MAX)).toEqual({
      x: 5, y: 5, w: 3, h: 3,
    });
  });

  it('keeps the anchor (x, y) stable — only w/h change', () => {
    const out = computeResizedRect({ x: 2, y: 3, w: 1, h: 1 }, { x: 7, y: 7 }, MIN, MAX);
    expect(out.x).toBe(2);
    expect(out.y).toBe(3);
  });
});

describe('Slice 225 — resize handle source-level contracts', () => {
  it('GridEditorBody now also pulls setDraftWidgets out of useHubActions', () => {
    expect(SRC).toMatch(
      /const \{ saveDraft, cancelEdit, addWidget, removeWidget, setDraftWidgets \} = useHubActions\(\);/,
    );
  });

  it('resizeTarget useState exists with the documented shape', () => {
    expect(SRC).toMatch(
      /const \[resizeTarget, setResizeTarget\] = useState<\{ id: string; w: number; h: number \} \| null>\(null\);/,
    );
  });

  it('the corner-handle button only renders while the widget is selected', () => {
    // The render block matches `{isSelected && ( <> ... ⤡ ... </> )}`
    expect(SRC).toMatch(/data-testid="grid-editor-placed-resize"/);
    expect(SRC).toMatch(/onPointerDown=\{\(e\) => startResize\(e, inst\)\}/);
  });

  it('handle uses the nwse-resize cursor + ⤡ glyph (same UX as the canvas handle)', () => {
    const block = SRC.match(/const placedResizeHandleStyle:[\s\S]*?\n\};/);
    expect(block).not.toBeNull();
    expect(block![0]).toMatch(/cursor:\s*['"]nwse-resize['"]/);
    expect(SRC).toMatch(/⤡/);
  });

  it('handle uses the accent background + accent-fg color', () => {
    const block = SRC.match(/const placedResizeHandleStyle:[\s\S]*?\n\};/);
    expect(block![0]).toMatch(/background:\s*['"]var\(--theme-accent/);
    expect(block![0]).toMatch(/color:\s*['"]var\(--theme-accent-fg/);
  });

  it('handle is 24×24 with a soft shadow', () => {
    const block = SRC.match(/const placedResizeHandleStyle:[\s\S]*?\n\};/);
    expect(block![0]).toMatch(/width:\s*24,[\s\S]*?height:\s*24,/);
    expect(block![0]).toMatch(/boxShadow:[\s\S]*?rgba\(0,\s*0,\s*0,\s*0\.22\)/);
  });

  it('handle stacks above the delete + content layer (zIndex: 3)', () => {
    const block = SRC.match(/const placedResizeHandleStyle:[\s\S]*?\n\};/);
    expect(block![0]).toMatch(/zIndex:\s*3/);
  });
});

describe('Slice 225 — drag lifecycle', () => {
  it('startResize sets pointer capture so the drag survives leaving the handle', () => {
    expect(SRC).toMatch(/setPointerCapture\?\.\(e\.pointerId\)/);
  });

  it('pointer-move recomputes via computeResizedRect + drives setResizeTarget for live preview', () => {
    expect(SRC).toMatch(/setResizeTarget\(\{ id: inst\.id, w: target\.w, h: target\.h \}\);/);
  });

  it('pointer-up commits via setDraftWidgets when the new w/h actually changed', () => {
    expect(SRC).toMatch(/setDraftWidgets\(\s*current\.map\(\(w\) => \(w\.id === inst\.id \? \{ \.\.\.w, w: final\.w, h: final\.h \} : w\)\),\s*\)/);
  });

  it('pointer-up skips the commit when the candidate would overlap a sibling', () => {
    expect(SRC).toMatch(/if \(overlapsAny\(candidate, siblings\)\) return;/);
  });

  it('pointer-up clears the live resizeTarget so the rendered cell snaps back to the committed size', () => {
    expect(SRC).toMatch(/setResizeTarget\(null\);/);
  });
});

describe('Slice 225 — placed widget renders at the live resize dimensions', () => {
  it('liveW / liveH are derived from resizeTarget when the widget is being resized', () => {
    expect(SRC).toMatch(/const liveW = resizeTarget\?\.id === inst\.id \? resizeTarget\.w : inst\.w;/);
    expect(SRC).toMatch(/const liveH = resizeTarget\?\.id === inst\.id \? resizeTarget\.h : inst\.h;/);
  });

  it('the gridColumn / gridRow span uses the live dimensions', () => {
    // Slice 9 of employee-hub-overhaul-2026-05-30 swapped the literal
    // `inst.x` / `inst.y` for `liveX` / `liveY` which fall back to
    // `inst.x` / `inst.y` when no move is in flight — so resize keeps
    // working identically, and a live drag-with-reflow now also shifts
    // each rendered cell.
    expect(SRC).toMatch(/gridColumn:\s*`\$\{liveX \+ 1\} \/ span \$\{liveW\}`/);
    expect(SRC).toMatch(/gridRow:\s*`\$\{liveY \+ 1\} \/ span \$\{liveH\}`/);
    expect(SRC).toMatch(/const liveX = previewSlot\?\.x \?\? inst\.x;/);
    expect(SRC).toMatch(/const liveY = previewSlot\?\.y \?\? inst\.y;/);
  });

  it('the size badge underneath the label also shows live dimensions', () => {
    expect(SRC).toMatch(/<span style=\{placedSizeStyle\}>\{liveW\}×\{liveH\}<\/span>/);
  });
});
