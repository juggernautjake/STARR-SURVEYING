// __tests__/hub/grid-editor-selection.test.tsx
//
// Slice 224 of hub-grid-editor-and-banner-green-2026-05-29.md. Locks
// the source-level contracts for click-to-select + Delete-removes-
// selected on painted widgets in the GridEditor. Interactive flow
// (click → highlight; Delete → store mutation) lands in a future
// Playwright spec because of the React+zustand SSR snapshot cache
// limitation that's been in play since Slice 207.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', 'lib', 'hub', 'components', 'GridEditor.tsx'),
  'utf8',
);

describe('Slice 224 — selectedPlacedId state', () => {
  it('GridEditorBody holds a selectedPlacedId useState', () => {
    expect(SRC).toMatch(/const \[selectedPlacedId, setSelectedPlacedId\] = useState<string \| null>\(null\);/);
  });

  it('removeWidget action is destructured from useHubActions', () => {
    // Slice 225 appended setDraftWidgets to the same destructuring;
    // the assertion accepts both Slice-224-original and the post-
    // Slice-225 shape so the lock survives the layered slice.
    expect(SRC).toMatch(/removeWidget[^}]*\} = useHubActions\(\);/);
  });

  it('selectedPlacedId is cleared when the surveyor picks a new widget type', () => {
    // The useEffect on `selectedType` clears placeAnchor + placeHover
    // AND setSelectedPlacedId(null) — locks the "modes are mutually
    // exclusive" invariant.
    expect(SRC).toMatch(/setSelectedPlacedId\(null\);[\s\S]*?\}, \[selectedType\]\);/);
  });
});

describe('Slice 224 — painted widget is now a button', () => {
  it('placed widget renders with role="button" + tabIndex={0}', () => {
    expect(SRC).toMatch(/role="button"\s*\n\s*tabIndex=\{0\}/);
  });

  it('placed widget carries aria-pressed so screen-readers report selection', () => {
    expect(SRC).toMatch(/aria-pressed=\{isSelected\}/);
  });

  it('placed widget carries data-selected so e2e specs can assert highlight state', () => {
    expect(SRC).toMatch(/data-selected=\{isSelected \? 'true' : 'false'\}/);
  });

  it('placed widget pointer-down stops propagation (so click-to-select does NOT double as a placement anchor)', () => {
    expect(SRC).toMatch(/onPointerDown=\{\(e\) => \{[\s\S]*?e\.stopPropagation\(\);/);
  });

  it('placed widget toggles selection on click (clicking the selected widget deselects it)', () => {
    // Slice 9 moved the click-toggle into startMove's no-drag pointer-up
    // branch; it compares against the live selectedPlacedId rather than
    // the render-time isSelected.
    expect(SRC).toMatch(/setSelectedPlacedId\(selectedPlacedId === inst\.id \? null : inst\.id\)/);
  });

  it('placed widget responds to Enter + Space to toggle selection (keyboard parity)', () => {
    expect(SRC).toMatch(/if \(e\.key === 'Enter' \|\| e\.key === ' '\)/);
  });
});

describe('Slice 224 — Delete key removes the selected widget', () => {
  it('Delete and Backspace both trigger the remove path', () => {
    expect(SRC).toMatch(/if \(\(e\.key === 'Delete' \|\| e\.key === 'Backspace'\) && selectedPlacedId\)/);
  });

  it('Delete handler calls removeWidget with the selected id and clears selection', () => {
    // Single source-level assertion that the keyboard delete path is
    // wired through the store action.
    expect(SRC).toMatch(/removeWidget\(selectedPlacedId\);\s*\n\s*setSelectedPlacedId\(null\);/);
  });
});

describe('Slice 224 — inline ✕ remove button', () => {
  it('renders the ✕ button inside the per-widget control cluster', () => {
    // Slice 225 wrapped the conditional in a fragment to add the
    // resize handle alongside the delete button; Slice G2 swapped the
    // `{isSelected && (` gate for `{controlsVisible && (` so the
    // cluster shows on hover / selection / focus. The assertion
    // anchors on the controlsVisible gate + the aria-label.
    expect(SRC).toMatch(/\{controlsVisible && \([\s\S]*?aria-label="Remove widget from layout"/);
  });

  it('the button click calls removeWidget + clears selection', () => {
    // The onClick handler block runs both removeWidget(inst.id) and
    // setSelectedPlacedId(null) — locked here so a future refactor
    // can't drop the clear-after-remove behavior.
    expect(SRC).toMatch(/removeWidget\(inst\.id\);[\s\S]{0,80}setSelectedPlacedId\(null\);/);
  });

  it('the button stops propagation on both pointerdown + click', () => {
    expect(SRC).toMatch(/onPointerDown=\{\(e\) => \{ e\.stopPropagation\(\); \}\}/);
  });

  it('the button carries the standard danger styling', () => {
    const block = SRC.match(/const placedRemoveButtonStyle:[\s\S]*?\n\};/);
    expect(block).not.toBeNull();
    expect(block![0]).toMatch(/background:\s*['"]var\(--theme-danger/);
    expect(block![0]).toMatch(/color:\s*['"]#ffffff['"]/);
  });
});

describe('Slice 224 — Esc cascades through pending states', () => {
  it('first Esc clears mid-place; second clears selection; third closes', () => {
    // Match the if/else if/else chain in the source so the cascade
    // order is locked.
    expect(SRC).toMatch(/if \(placeAnchor\)[\s\S]*?else if \(selectedPlacedId\)[\s\S]*?else \{[\s\S]*?onClose\(\);/);
  });
});

describe('Slice 224 — background click deselects', () => {
  it('clicking an empty cell with nothing armed clears the painted-widget selection', () => {
    // Locks the early-return branch inside handleCellPointerDown.
    expect(SRC).toMatch(/if \(selectedPlacedId\) setSelectedPlacedId\(null\);/);
  });

  it('every grid cell now wires onPointerDown unconditionally (so background-click works without a type armed)', () => {
    expect(SRC).toMatch(/onPointerDown=\{\(\) => handleCellPointerDown\(x, y\)\}/);
  });
});

describe('Slice 224 — selected painted widget styling', () => {
  it('placedWidgetSelectedStyle exists + uses a thicker accent ring + lift + bigger shadow', () => {
    const block = SRC.match(/const placedWidgetSelectedStyle:[\s\S]*?\n\};/);
    expect(block).not.toBeNull();
    expect(block![0]).toMatch(/border:\s*['"]3px solid var\(--theme-accent/);
    expect(block![0]).toMatch(/transform:\s*['"]translateY\(-1px\)['"]/);
    expect(block![0]).toMatch(/boxShadow:[\s\S]*?rgba\(0,\s*0,\s*0,\s*0\.22\)/);
  });

  it('selected style stacks above the resting placed style (zIndex: 2)', () => {
    const block = SRC.match(/const placedWidgetSelectedStyle:[\s\S]*?\n\};/);
    expect(block![0]).toMatch(/zIndex:\s*2/);
  });
});
