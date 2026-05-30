// __tests__/hub/single-editor-entry.test.ts
//
// Slice 2 of employee-hub-overhaul-2026-05-30.md. Locks the
// consolidation of the two editing surfaces down to the single
// centered modal opened by one on-page button. Source-regex on
// HubCanvas.tsx since the interactive store-mutation render path hits
// the zustand/SSR snapshot-caching limitation.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', 'lib', 'hub', 'components', 'HubCanvas.tsx'),
  'utf8',
);

describe('Slice 2 — single modal-editor entry point', () => {
  it('clicking the entry button just enters edit mode (modal is driven by isEditMode)', () => {
    expect(SRC).toMatch(
      /const openEditor = useCallback\(\(\) => \{[\s\S]*?enterEditMode\(\);[\s\S]*?\}, \[enterEditMode\]\);/,
    );
  });

  it('no parallel local-useState gridEditorOpen mirror exists', () => {
    // The modal-open flag must derive from isEditMode (the store) so
    // every path that flips edit mode (in-canvas button + the
    // AdminTopBar ?edit=1 deep-link) opens the modal in one click.
    expect(SRC).not.toMatch(/gridEditorOpen/);
    expect(SRC).not.toMatch(/setGridEditorOpen/);
  });

  it('GridEditor mounts with open={isEditMode}', () => {
    expect(SRC).toMatch(/<GridEditor[\s\S]*?open=\{isEditMode\}/);
  });

  it('renders exactly one entry button (data-testid="open-grid-editor")', () => {
    const matches = SRC.match(/data-testid="open-grid-editor"/g) ?? [];
    expect(matches).toHaveLength(1);
  });

  it('the entry button calls openEditor', () => {
    expect(SRC).toMatch(/onClick=\{openEditor\}/);
  });

  it('hides the entry button while already editing', () => {
    expect(SRC).toMatch(/\{!isEditMode && \(/);
  });
});

describe('Slice 2 — the redundant editing surfaces are removed', () => {
  it('no longer renders an in-header "+ Add widget" button', () => {
    expect(SRC).not.toMatch(/\+ Add widget/);
  });

  it('no longer renders the old "▦ Grid editor" button label', () => {
    expect(SRC).not.toMatch(/▦ Grid editor/);
  });

  it('no longer mounts AddWidgetModal (the modal palette adds widgets)', () => {
    expect(SRC).not.toMatch(/<AddWidgetModal/);
    expect(SRC).not.toMatch(/import AddWidgetModal/);
  });

  it('no longer mounts the floating EditModeBar (modal footer commits)', () => {
    expect(SRC).not.toMatch(/<EditModeBar/);
    expect(SRC).not.toMatch(/CustomizeHubButton, EditModeBar/);
  });

  it('drops the now-unused addOpen state', () => {
    expect(SRC).not.toMatch(/setAddOpen/);
  });
});

describe('Slice 2 — modal close leaves edit mode consistent', () => {
  it('closeEditor cancels a stranded edit session (modal visibility follows isEditMode)', () => {
    expect(SRC).toMatch(
      /const closeEditor = useCallback\(\(\) => \{[\s\S]*?if \(useHubStore\.getState\(\)\.isEditMode\) cancelEdit\(\);[\s\S]*?\}, \[cancelEdit\]\);/,
    );
  });

  it('wires GridEditor onClose to closeEditor', () => {
    expect(SRC).toMatch(/<GridEditor[\s\S]*?onClose=\{closeEditor\}/);
  });
});
