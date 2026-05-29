// __tests__/hub/widget-grid-edit-affordances.test.tsx
//
// Slice 219 of hub-greeting-edit-affordances-2026-05-29.md. Locks
// the edit-mode chrome that makes drag + resize + remove obvious
// without needing the surveyor to hover-hunt for tiny corners:
//   - dashed accent outline on every cell in edit mode
//   - bigger accent drag handle (28×28) with the standard ⋮⋮ glyph
//   - new remove (✕) button next to the drag handle
//   - removeWidget action wired into the cell header

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', 'lib', 'hub', 'components', 'WidgetGrid.tsx'),
  'utf8',
);

describe('Slice 219 — edit-mode cell outline', () => {
  it('cells get a dashed accent outline when editMode is on (no drop-target highlight)', () => {
    expect(SRC).toMatch(/editMode\s*\?\s*['"]2px dashed var\(--theme-accent/);
  });

  it('outline-offset stays -2px in edit mode so the ring sits inside the cell', () => {
    expect(SRC).toMatch(/editMode\s*\?\s*['"]-2px['"]/);
  });

  it('the cell switches to overflow: visible in edit mode so the resize grip is not clipped', () => {
    expect(SRC).toMatch(/overflow:\s*editMode\s*\?\s*['"]visible['"]/);
  });
});

describe('Slice 219 — DragHandle is bigger + accent-colored', () => {
  it('drag handle uses a 28×28 box', () => {
    expect(SRC).toMatch(/width:\s*28,[\s\S]*?height:\s*28,/);
  });

  it('drag handle uses the accent background + white glyph', () => {
    expect(SRC).toMatch(/background:\s*['"]var\(--theme-accent[^"]*\)/);
    expect(SRC).toMatch(/color:\s*['"]var\(--theme-accent-fg/);
  });

  it('drag handle keeps the ⋮⋮ glyph + grab cursor', () => {
    expect(SRC).toMatch(/⋮⋮/);
    expect(SRC).toMatch(/cursor:\s*['"]grab['"]/);
  });
});

describe('Slice 219 — RemoveButton', () => {
  it('renders a ✕ glyph with the danger color', () => {
    expect(SRC).toMatch(/✕/);
    expect(SRC).toMatch(/color:\s*['"]var\(--theme-danger/);
  });

  it('stops propagation on pointer-down so a click does not trigger the grid click delegate', () => {
    expect(SRC).toMatch(/onPointerDown=\{\(e\)\s*=>\s*\{\s*e\.stopPropagation\(\);\s*\}/);
  });

  it('calls onRemove with the widget id', () => {
    expect(SRC).toMatch(/RemoveButton onRemove=\{\(\) => removeWidget\(instanceId\)\}/);
  });

  it('aria-label is "Remove widget" for screen-reader users', () => {
    expect(SRC).toMatch(/aria-label="Remove widget"/);
  });
});

describe('Slice 219 — CellEditActions composes both handles', () => {
  it('exists as a composed flex group rendered into WidgetFrame.headerAction', () => {
    expect(SRC).toMatch(/function CellEditActions\b/);
    expect(SRC).toMatch(/<CellEditActions\s+instanceId=\{instance\.id\}/);
  });

  it('only renders the DragHandle when dragListeners are provided', () => {
    expect(SRC).toMatch(/dragListeners\s*&&\s*<DragHandle/);
  });

  it('always renders the RemoveButton (no drag-listener guard)', () => {
    // <RemoveButton ... /> sits outside any `{dragListeners && ...}`
    // gate so the surveyor can remove a widget even before the dnd-kit
    // sortable wrapper has hydrated.
    expect(SRC).toMatch(/<RemoveButton onRemove=/);
  });

  it('pulls removeWidget from the shared useHubActions hook', () => {
    expect(SRC).toMatch(/useHubActions\(\)/);
    expect(SRC).toMatch(/import \{ useHubActions \} from '@\/lib\/hub\/use-hub-actions';/);
  });
});
