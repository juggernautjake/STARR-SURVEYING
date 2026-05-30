// __tests__/hub/grid-editor-keyboard-move.test.ts
//
// Slice G4b of grid-editor-placement-resize-overhaul-2026-05-30.md.
// Locks the arrow-key move of a selected widget: window-level key
// handler, the four arrow deltas, the in-flight-gesture guard, the
// clamp into the grid, and the commitDrop(push + trim) + setDraftWidgets
// commit. Source-regex on GridEditor.tsx.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', 'lib', 'hub', 'components', 'GridEditor.tsx'),
  'utf8',
);

describe('Slice G4b — arrow-key move deltas', () => {
  it('maps all four arrow keys to one-cell deltas', () => {
    expect(SRC).toMatch(/ArrowLeft:\s*\{ dx: -1, dy: 0 \}/);
    expect(SRC).toMatch(/ArrowRight:\s*\{ dx: 1, dy: 0 \}/);
    expect(SRC).toMatch(/ArrowUp:\s*\{ dx: 0, dy: -1 \}/);
    expect(SRC).toMatch(/ArrowDown:\s*\{ dx: 0, dy: 1 \}/);
  });
});

describe('Slice G4b — arrow move only acts on the selected widget, no gesture in flight', () => {
  it('guards on selectedPlacedId + no moveDrag/resizeTarget/placement-armed', () => {
    expect(SRC).toMatch(
      /if \(delta && selectedPlacedId && !moveDrag && !resizeTarget && !selectedType\) \{/,
    );
  });

  it('preventDefaults so the modal does not scroll on arrow press', () => {
    expect(SRC).toMatch(/if \(delta && selectedPlacedId[\s\S]*?e\.preventDefault\(\);/);
  });
});

describe('Slice G4b — clamp + commit', () => {
  it('clamps x into [0, cols - w] and y to >= 0', () => {
    expect(SRC).toMatch(
      /const nextX = Math\.max\(0, Math\.min\(HUB_GRID_COLS - self\.w, self\.x \+ delta\.dx\)\);/,
    );
    expect(SRC).toMatch(/const nextY = Math\.max\(0, self\.y \+ delta\.dy\);/);
  });

  it('no-ops when the nudge would not change position', () => {
    expect(SRC).toMatch(/if \(nextX === self\.x && nextY === self\.y\) return;/);
  });

  it('commits the nudge through commitDrop (push + trim) + setDraftWidgets', () => {
    expect(SRC).toMatch(
      /const moved = commitDrop\(\s*current,\s*selectedPlacedId,\s*\{ x: nextX, y: nextY, w: self\.w, h: self\.h \},\s*HUB_GRID_COLS,\s*\);\s*setDraftWidgets\(moved\);/,
    );
  });

  it('reads the live draft from the store, not a stale closure', () => {
    expect(SRC).toMatch(
      /const current = useHubStore\.getState\(\)\.draftWidgets \?\? \[\];[\s\S]*?const self = current\.find\(\(w\) => w\.id === selectedPlacedId\);/,
    );
  });
});

describe('Slice G4b — Enter/Space still toggle selection at the widget level', () => {
  it('the per-widget handler toggles selection on Enter/Space', () => {
    expect(SRC).toMatch(
      /function handlePlacedKeyDown\([\s\S]*?if \(e\.key === 'Enter' \|\| e\.key === ' '\) \{[\s\S]*?setSelectedPlacedId\(\(cur\) => \(cur === inst\.id \? null : inst\.id\)\);/,
    );
  });
});
