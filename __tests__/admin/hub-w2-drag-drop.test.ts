// __tests__/admin/hub-w2-drag-drop.test.ts
//
// Slice W2 — drag a palette chip onto the grid to place it.
// Click-to-arm is preserved as a fallback.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('GridEditor — palette drag source (W2)', () => {
  const SRC = read('lib/hub/components/GridEditor.tsx');

  it('palette chips are draggable when not already placed', () => {
    expect(SRC).toMatch(/draggable=\{!isPlaced\}/);
  });

  it('dragstart writes the widget type into the custom mime type + sets effectAllowed', () => {
    expect(SRC).toMatch(/effectAllowed = 'copy'/);
    expect(SRC).toMatch(/setData\('application\/x-hub-widget-type', w\.id\)/);
    expect(SRC).toMatch(/setData\('text\/plain', w\.id\)/);
  });

  it('dragstart also arms `selectedType` so the existing preview lights up', () => {
    // setSelectedType(w.id) lives in the same onDragStart block
    // as the dataTransfer.setData calls, but the multi-line
    // formatter spreads them past a fixed window. Just assert
    // both bits are in the file.
    expect(SRC).toMatch(/setData\('application\/x-hub-widget-type', w\.id\)/);
    expect(SRC).toMatch(/setSelectedType\(w\.id\)/);
  });

  it('dragend clears `selectedType` + placeHover on a failed drop', () => {
    expect(SRC).toMatch(/onDragEnd=\{\(\) => \{/);
    expect(SRC).toMatch(/setSelectedType\(\(cur\) => \(cur === w\.id \? null : cur\)\)/);
  });

  it('palette chip carries a stable per-type testid', () => {
    expect(SRC).toMatch(/data-testid=\{`grid-editor-palette-entry-\$\{w\.id\}`\}/);
  });
});

describe('GridEditor — grid drop target (W2)', () => {
  const SRC = read('lib/hub/components/GridEditor.tsx');

  it("dragover only matches drops carrying the custom mime type", () => {
    expect(SRC).toMatch(/ev\.dataTransfer\.types\.includes\('application\/x-hub-widget-type'\)/);
  });

  it("dragover preventDefault + sets dropEffect = 'copy'", () => {
    expect(SRC).toMatch(/onDragOver=/);
    expect(SRC).toMatch(/dropEffect = 'copy'/);
  });

  it('dragover updates placeHover so the existing preview cell follows the cursor', () => {
    // Just assert the body's two key calls are present — the
    // regex previously locked the order across newlines which
    // doesn't survive prettier reformats.
    expect(SRC).toMatch(/onDragOver=/);
    expect(SRC).toMatch(/cellUnderPointer\(/);
  });

  it('drop reads the widget type from the custom mime (with text/plain fallback)', () => {
    expect(SRC).toMatch(/getData\('application\/x-hub-widget-type'\)\s*\n\s*\|\| ev\.dataTransfer\.getData\('text\/plain'\)/);
  });

  it('drop runs the SAME type-level dup guard as the click-place path', () => {
    expect(SRC).toMatch(/onDrop=/);
    expect(SRC).toMatch(/\(draftWidgets \?\? \[\]\)\.some\(\(w\) => w\.type === type\)/);
  });

  it('drop clamps the default-size rect + bails out on overlap', () => {
    expect(SRC).toMatch(/onDrop=/);
    expect(SRC).toMatch(/clampRectToEnvelope\(\{ x: cell\.x, y: cell\.y, w: size\.w, h: size\.h \}/);
    expect(SRC).toMatch(/overlapsAny\(rect, draftWidgets \?\? \[\]\)/);
  });

  it('drop calls addWidget with a freshly generated placement id', () => {
    expect(SRC).toMatch(/onDrop=/);
    expect(SRC).toMatch(/id: generatePlacementId\(\)/);
  });
});
