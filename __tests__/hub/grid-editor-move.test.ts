// __tests__/hub/grid-editor-move.test.ts
//
// Slice 9 of employee-hub-overhaul-2026-05-30.md. Locks the pointer
// pipeline that grafts grid-reflow into GridEditor: drag-threshold-
// gated start, applyMoveWithPush on pointermove for the live preview,
// commitDrop on pointerup, window-level listener attach + cleanup,
// the render path using moveDrag.previewLayout's live x/y, the lift +
// no-transition styling, and the un-touched resize pipeline. Source-
// regex assertions on GridEditor.tsx because the modal's render path
// hits the same useSyncExternalStore/SSR-snapshot caching limitation
// the other modal specs work around.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', 'lib', 'hub', 'components', 'GridEditor.tsx'),
  'utf8',
);

describe('Slice 9 — grid-reflow imports', () => {
  it('imports applyMoveWithPush and commitDrop from the Slice-8 module', () => {
    expect(SRC).toMatch(
      /import \{ applyMoveWithPush, commitDrop \} from '@\/lib\/hub\/grid-reflow';/,
    );
  });

  it('imports the WidgetInstance type for the preview-layout state shape', () => {
    expect(SRC).toMatch(/import type \{ WidgetInstance \} from '@\/lib\/hub\/types';/);
  });
});

describe('Slice 9 — moveDrag state', () => {
  it('declares a moveDrag useState carrying { id, previewLayout }', () => {
    expect(SRC).toMatch(
      /const \[moveDrag, setMoveDrag\] = useState<\{ id: string; previewLayout: WidgetInstance\[\] \} \| null>\(null\);/,
    );
  });
});

describe('Slice 9 — startMove pipeline', () => {
  it('declares a startMove function taking the React pointer event + the widget', () => {
    expect(SRC).toMatch(
      /function startMove\(\s*e: React\.PointerEvent<HTMLDivElement>,\s*inst: WidgetInstance,\s*\)/,
    );
  });

  it('captures the pointer + reads the grid container ref', () => {
    expect(SRC).toMatch(/setPointerCapture\?\.\(e\.pointerId\)/);
    expect(SRC).toMatch(/const gridEl = gridContainerRef\.current;/);
  });

  it('records the start client coords + uses a 6px drag threshold', () => {
    expect(SRC).toMatch(/const startClientX = e\.clientX;/);
    expect(SRC).toMatch(/const startClientY = e\.clientY;/);
    expect(SRC).toMatch(/const DRAG_THRESHOLD_PX = 6;/);
  });

  it('skips startMove when the surveyor has a widget armed for placement', () => {
    expect(SRC).toMatch(/function startMove\([\s\S]*?\) \{[\s\S]*?if \(selected\) return;/);
  });
});

describe('Slice 9 — pointer-move drives the live reflow preview', () => {
  it('runs applyMoveWithPush against the live draftWidgets at every threshold-passing tick', () => {
    expect(SRC).toMatch(
      /const current = useHubStore\.getState\(\)\.draftWidgets \?\? \[\];[\s\S]*?const preview = applyMoveWithPush\(current, inst\.id, target, HUB_GRID_COLS\);[\s\S]*?setMoveDrag\(\{ id: inst\.id, previewLayout: preview \}\);/,
    );
  });

  it('clears the click-selection once the drag threshold is exceeded', () => {
    expect(SRC).toMatch(
      /if \(Math\.abs\(dx\) < DRAG_THRESHOLD_PX && Math\.abs\(dy\) < DRAG_THRESHOLD_PX\) return;[\s\S]*?didDrag = true;[\s\S]*?setSelectedPlacedId\(null\);/,
    );
  });
});

describe('Slice 9 — pointer-up commits or treats as click', () => {
  it('uses commitDrop + setDraftWidgets when a real drag happened', () => {
    expect(SRC).toMatch(
      /const committed = commitDrop\(current, inst\.id, target, HUB_GRID_COLS\);[\s\S]*?setDraftWidgets\(committed\);/,
    );
  });

  it('falls back to the click-toggle when no drag occurred', () => {
    expect(SRC).toMatch(
      /if \(!didDrag\) \{[\s\S]*?setSelectedPlacedId\(selectedPlacedId === inst\.id \? null : inst\.id\);[\s\S]*?setMoveDrag\(null\);[\s\S]*?return;[\s\S]*?\}/,
    );
  });

  it('removes all window-level listeners before deciding', () => {
    expect(SRC).toMatch(
      /window\.removeEventListener\('pointermove', handleMove\);[\s\S]*?window\.removeEventListener\('pointerup', handleUp\);[\s\S]*?window\.removeEventListener\('pointercancel', handleUp\);/,
    );
  });
});

describe('Slice 9 — pointer listeners are attached at window scope', () => {
  it('attaches pointermove + pointerup + pointercancel on window', () => {
    expect(SRC).toMatch(/window\.addEventListener\('pointermove', handleMove\);/);
    expect(SRC).toMatch(/window\.addEventListener\('pointerup', handleUp\);/);
    expect(SRC).toMatch(/window\.addEventListener\('pointercancel', handleUp\);/);
  });
});

describe('Slice 9 — render reads liveX / liveY from moveDrag.previewLayout', () => {
  it('looks up the moving widget + its cascaded siblings in the preview list', () => {
    expect(SRC).toMatch(/const previewSlot = moveDrag\?\.previewLayout\.find\(\(w\) => w\.id === inst\.id\);/);
    expect(SRC).toMatch(/const liveX = previewSlot\?\.x \?\? inst\.x;/);
    expect(SRC).toMatch(/const liveY = previewSlot\?\.y \?\? inst\.y;/);
  });

  it('paints the dragged widget with z-index lift + grabbing cursor + no transition', () => {
    expect(SRC).toMatch(/const isMoving = moveDrag\?\.id === inst\.id;/);
    expect(SRC).toMatch(/\.\.\.\(isMoving \? \{ zIndex: 5, cursor: 'grabbing' \} : null\)/);
    expect(SRC).toMatch(/transition: isMoving \? 'none' : undefined/);
  });

  it('wires startMove onto the painted-widget onPointerDown', () => {
    expect(SRC).toMatch(/onPointerDown=\{\(e\) => \{[\s\S]*?startMove\(e, inst\);[\s\S]*?\}\}/);
  });
});

describe('Slice 9 — the resize pipeline survives untouched', () => {
  it('startResize still exists + still wires from the corner button', () => {
    expect(SRC).toMatch(/function startResize\(/);
    expect(SRC).toMatch(/onPointerDown=\{\(e\) => startResize\(e, inst\)\}/);
  });

  it('resize still uses its own setResizeTarget state (not muxed through moveDrag)', () => {
    expect(SRC).toMatch(/setResizeTarget\(\{ id: inst\.id, w: target\.w, h: target\.h \}\);/);
  });
});
