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

describe('cellUnderPointer — DOM-free grid coordinate math (8×12 grid)', () => {
  // 8 cols × 12 rows with square 100px cells → 800 wide × 1200 tall.
  const BOUNDS = { left: 100, top: 100, width: 800, height: 1200 };

  it('returns (0, 0) at the top-left corner', () => {
    expect(cellUnderPointer(BOUNDS, 100, 100)).toEqual({ x: 0, y: 0 });
  });

  it('returns (7, 11) at the bottom-right corner (8×12 grid)', () => {
    // The very last pixel inside the grid → cell (7, 11).
    expect(cellUnderPointer(BOUNDS, 899, 1299)).toEqual({ x: 7, y: 11 });
  });

  it('clamps to (0, 0) when the pointer is above/left of the grid', () => {
    expect(cellUnderPointer(BOUNDS, 0, 0)).toEqual({ x: 0, y: 0 });
  });

  it('clamps to (7, 11) when the pointer drags past the bottom-right edge', () => {
    expect(cellUnderPointer(BOUNDS, 9999, 9999)).toEqual({ x: 7, y: 11 });
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

  it('resizeTarget useState carries the push preview layout (Slice G4)', () => {
    expect(SRC).toMatch(
      /const \[resizeTarget, setResizeTarget\] = useState<\s*\{ id: string; w: number; h: number; previewLayout: WidgetInstance\[\] \} \| null\s*>\(null\);/,
    );
  });

  it('the corner-handle button renders inside the per-widget control cluster', () => {
    // Slice G2 gates the cluster on `{controlsVisible && ( <> ... ⤡
    // ... </> )}` (hover / selection / focus) instead of the old
    // `{isSelected && (`.
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

  it('pointer-move resolves a push layout + drives setResizeTarget for live preview (Slice G4)', () => {
    expect(SRC).toMatch(
      /const \{ target, pushed \} = resolve\(ev\);\s*setResizeTarget\(\{ id: inst\.id, w: target\.w, h: target\.h, previewLayout: pushed \}\);/,
    );
  });

  it('resolve() pushes neighbors via applyResizeWithPush (Slice G4)', () => {
    expect(SRC).toMatch(
      /const pushed = applyResizeWithPush\(\s*current,\s*inst\.id,\s*\{ x: inst\.x, y: inst\.y, w: target\.w, h: target\.h \},\s*HUB_GRID_COLS,\s*\);/,
    );
  });

  it('pointer-up commits the push-resolved layout through trimLeadingRows (Slice G4)', () => {
    expect(SRC).toMatch(/setDraftWidgets\(trimLeadingRows\(pushed\)\);/);
  });

  it('the old overlap-abort guard is gone (push resolves collisions instead of refusing)', () => {
    expect(SRC).not.toMatch(/if \(overlapsAny\(candidate, siblings\)\) return;/);
  });

  it('pointer-up no-ops when the size did not change', () => {
    expect(SRC).toMatch(/if \(target\.w === inst\.w && target\.h === inst\.h\) return;/);
  });

  it('pointer-up clears the live resizeTarget so the rendered cell snaps to the committed layout', () => {
    expect(SRC).toMatch(/setResizeTarget\(null\);/);
  });
});

describe('Slice G4 — placed widget renders from the live push preview', () => {
  it('resize preview slot drives every widget geometry (resizing one + pushed neighbors)', () => {
    expect(SRC).toMatch(/const resizeSlot = resizeTarget\?\.previewLayout\.find\(\(w\) => w\.id === inst\.id\);/);
    expect(SRC).toMatch(/const moveSlot = moveDrag\?\.previewLayout\.find\(\(w\) => w\.id === inst\.id\);/);
    expect(SRC).toMatch(/const liveSlot = resizeSlot \?\? moveSlot;/);
  });

  it('liveX/Y/W/H all fall back to the committed instance at rest', () => {
    expect(SRC).toMatch(/const liveX = liveSlot\?\.x \?\? inst\.x;/);
    expect(SRC).toMatch(/const liveY = liveSlot\?\.y \?\? inst\.y;/);
    expect(SRC).toMatch(/const liveW = liveSlot\?\.w \?\? inst\.w;/);
    expect(SRC).toMatch(/const liveH = liveSlot\?\.h \?\? inst\.h;/);
  });

  it('the gridColumn / gridRow span uses the live geometry', () => {
    expect(SRC).toMatch(/gridColumn:\s*`\$\{liveX \+ 1\} \/ span \$\{liveW\}`/);
    expect(SRC).toMatch(/gridRow:\s*`\$\{liveY \+ 1\} \/ span \$\{liveH\}`/);
  });

  it('the size badge underneath the label shows live dimensions while a gesture is active', () => {
    // grid-editor-polish-2026-06-18 — the badge is now gated on
    // `isResizing || isMoving` so the widget label takes priority
    // at rest. Still uses liveW × liveH so during the gesture the
    // surveyor sees the push-resolved size, not the committed one.
    expect(SRC).toMatch(/\{\(isResizing \|\| isMoving\) && \(/);
    expect(SRC).toMatch(/\{liveW\}×\{liveH\}/);
  });
});
