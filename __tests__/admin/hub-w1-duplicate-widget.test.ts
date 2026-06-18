// __tests__/admin/hub-w1-duplicate-widget.test.ts
//
// Slice W1 (hub-cad-roles-polish-2026-06-18) — never two of the
// same widget type on the grid + UX surfaces "already added".

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('hub-store — addWidget enforces type-level uniqueness (W1)', () => {
  const SRC = read('lib/hub/hub-store.ts');

  it('rejects a second widget of the same type', () => {
    expect(SRC).toMatch(/draftWidgets\.some\(\(w\) => w\.type === widget\.type\)/);
  });

  it("fires a 'hub:duplicate-widget' CustomEvent so the UI can toast", () => {
    expect(SRC).toMatch(/new CustomEvent\('hub:duplicate-widget', \{ detail: \{ type: widget\.type \} \}\)/);
  });

  it('logs a dev-only warn pointing at the offending type', () => {
    expect(SRC).toMatch(/widget type "\$\{widget\.type\}" is already on the grid/);
  });
});

describe('GridEditor — palette + cell guard + toast (W1)', () => {
  const SRC = read('lib/hub/components/GridEditor.tsx');

  it('paints palette chips for already-placed widgets with a dedicated style', () => {
    expect(SRC).toMatch(/paletteEntryPlacedStyle/);
    expect(SRC).toMatch(/data-placed=\{isPlaced \? 'true' : undefined\}/);
  });

  it('the placed-chip style uses a soft green hue + not-allowed cursor', () => {
    expect(SRC).toMatch(/paletteEntryPlacedStyle:[\s\S]*?background:[\s\S]*?#10B981[\s\S]*?cursor:\s*'not-allowed'/);
  });

  it("clicking a placed chip fires the duplicate event without arming the placement", () => {
    expect(SRC).toMatch(/if \(isPlaced && !isSelected\) \{[\s\S]*?new CustomEvent\('hub:duplicate-widget'/);
  });

  it('the cell-pointer-down handler guards against type duplicates BEFORE addWidget', () => {
    expect(SRC).toMatch(/\(draftWidgets \?\? \[\]\)\.some\(\(w\) => w\.type === selected\.id\)[\s\S]*?return;/);
  });

  it('listens for hub:duplicate-widget at the editor level + renders a toast', () => {
    expect(SRC).toMatch(/window\.addEventListener\('hub:duplicate-widget', onDup\)/);
    expect(SRC).toMatch(/data-testid="grid-editor-duplicate-toast"/);
  });

  it('the toast auto-dismisses after a short window', () => {
    expect(SRC).toMatch(/setDuplicateToast\(null\)[\s\S]{0,80}2400/);
  });
});
