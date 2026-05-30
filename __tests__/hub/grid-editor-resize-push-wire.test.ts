// __tests__/hub/grid-editor-resize-push-wire.test.ts
//
// Slice G4 of grid-editor-placement-resize-overhaul-2026-05-30.md.
// Locks the GridEditor wiring that connects the corner-drag resize to
// the Slice-G3 applyResizeWithPush helper: live push preview on every
// pointer-move, push-resolved commit on pointer-up (no more
// overlap-abort), and the import surface.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', 'lib', 'hub', 'components', 'GridEditor.tsx'),
  'utf8',
);

describe('Slice G4 — imports', () => {
  it('pulls applyResizeWithPush + trimLeadingRows from grid-reflow', () => {
    expect(SRC).toMatch(
      /import \{[^}]*applyResizeWithPush[^}]*\} from '@\/lib\/hub\/grid-reflow';/,
    );
    expect(SRC).toMatch(
      /import \{[^}]*trimLeadingRows[^}]*\} from '@\/lib\/hub\/grid-reflow';/,
    );
  });
});

describe('Slice G4 — resolve() builds the push layout from the pointer cell', () => {
  it('grows the rect via computeResizedRect then flows neighbors with applyResizeWithPush', () => {
    expect(SRC).toMatch(
      /function resolve\(ev: PointerEvent\) \{[\s\S]*?computeResizedRect\([\s\S]*?const pushed = applyResizeWithPush\(\s*current,\s*inst\.id,\s*\{ x: inst\.x, y: inst\.y, w: target\.w, h: target\.h \},\s*HUB_GRID_COLS,\s*\);[\s\S]*?return \{ target, pushed \};/,
    );
  });

  it('reads the live draft from the store inside resolve (not a stale closure)', () => {
    expect(SRC).toMatch(/const current = useHubStore\.getState\(\)\.draftWidgets \?\? \[\];/);
  });
});

describe('Slice G4 — live preview seeds with the base layout', () => {
  it('startResize initializes resizeTarget.previewLayout from the current draft', () => {
    expect(SRC).toMatch(
      /const baseLayout = useHubStore\.getState\(\)\.draftWidgets \?\? \[\];\s*setResizeTarget\(\{ id: inst\.id, w: inst\.w, h: inst\.h, previewLayout: baseLayout \}\);/,
    );
  });
});

describe('Slice G4 — commit', () => {
  it('pointer-up commits trimLeadingRows(pushed) — push resolves collisions, no abort', () => {
    expect(SRC).toMatch(/setDraftWidgets\(trimLeadingRows\(pushed\)\);/);
    expect(SRC).not.toMatch(/if \(overlapsAny\(candidate, siblings\)\) return;/);
  });

  it('still no-ops when the size is unchanged', () => {
    expect(SRC).toMatch(/if \(target\.w === inst\.w && target\.h === inst\.h\) return;/);
  });

  it('clears resizeTarget on pointer-up so the committed layout takes over', () => {
    expect(SRC).toMatch(/handleUp[\s\S]*?setResizeTarget\(null\);/);
  });
});
