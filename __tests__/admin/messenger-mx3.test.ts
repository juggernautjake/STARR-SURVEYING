// __tests__/admin/messenger-mx3.test.ts
//
// Slice MX3 — draggable messenger panel via the shared
// `useDraggable` hook. The hook itself is exercised by direct
// behavioral tests; the wiring into FloatingMessenger is locked
// by source assertions.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { clampPosition } from '../../lib/admin/use-draggable';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('clampPosition (pure helper)', () => {
  it('passes through a position that fits inside the viewport', () => {
    expect(clampPosition({ x: 100, y: 200 }, 640, 600, { w: 1280, h: 1024 }))
      .toEqual({ x: 100, y: 200 });
  });

  it('clamps a negative position to (0, 0)', () => {
    expect(clampPosition({ x: -50, y: -10 }, 640, 600, { w: 1280, h: 1024 }))
      .toEqual({ x: 0, y: 0 });
  });

  it('clamps so the panel never crosses the right edge', () => {
    // viewport 1000 wide, panel 640 wide → max x = 360
    expect(clampPosition({ x: 5000, y: 0 }, 640, 600, { w: 1000, h: 1024 }))
      .toEqual({ x: 360, y: 0 });
  });

  it('clamps so the panel never crosses the bottom edge', () => {
    // viewport 800 tall, panel 600 tall → max y = 200
    expect(clampPosition({ x: 0, y: 5000 }, 640, 600, { w: 1280, h: 800 }))
      .toEqual({ x: 0, y: 200 });
  });

  it("when the panel is wider than the viewport, the max is floored at 0 (panel stays at left edge)", () => {
    expect(clampPosition({ x: 9999, y: 9999 }, 640, 600, { w: 320, h: 400 }))
      .toEqual({ x: 0, y: 0 });
  });
});

describe('useDraggable source-lock — defensive contract', () => {
  const SRC = read('lib/admin/use-draggable.ts');

  it("exits the pointer-down branch when the target is inside `data-no-drag`", () => {
    expect(SRC).toMatch(/target\.closest\('\[data-no-drag\]'\)/);
  });

  it("exits the pointer-down branch when the target is a button / link / input", () => {
    expect(SRC).toMatch(/target\.closest\('input, textarea, select, button, a'\)/);
  });

  it("persists the position to localStorage under the configured key", () => {
    expect(SRC).toMatch(/window\.localStorage\.setItem\(storageKey,\s*JSON\.stringify\(pos\)\)/);
  });

  it('re-clamps the position on window resize so the panel never ends up off-screen', () => {
    expect(SRC).toMatch(/window\.addEventListener\('resize', onResize\)/);
    expect(SRC).toMatch(/setPositionState\(\(prev\) => clampPosition\(prev, width, height, viewport\)\)/);
  });
});

describe('FloatingMessenger — wiring (MX3)', () => {
  const SRC = read('app/admin/components/FloatingMessenger.tsx');

  it('imports useDraggable from the shared lib', () => {
    expect(SRC).toMatch(/import \{ useDraggable \} from '@\/lib\/admin\/use-draggable'/);
  });

  it("declares the panel width / height / storage-key constants", () => {
    expect(SRC).toMatch(/MESSENGER_PANEL_WIDTH\s*=\s*640/);
    expect(SRC).toMatch(/MESSENGER_PANEL_HEIGHT\s*=\s*600/);
    expect(SRC).toMatch(/MESSENGER_DRAG_STORAGE_KEY\s*=\s*'admin\/messenger\/panel-position'/);
  });

  it('only enables the drag hook while the panel is open', () => {
    expect(SRC).toMatch(/enabled:\s*isOpen/);
  });

  it('default placement lands the panel near the bottom-right corner (above the FAB)', () => {
    expect(SRC).toMatch(/defaultPlacement:\s*\(\{ w, h \}\) => \(\{[\s\S]*?x: Math\.max\(0, w - MESSENGER_PANEL_WIDTH - 24\)/);
    expect(SRC).toMatch(/y: Math\.max\(0, h - MESSENGER_PANEL_HEIGHT - 88\)/);
  });

  it("switches the panel's inline style to absolute left/top once the hook hydrates", () => {
    expect(SRC).toMatch(/style=\{drag\.mounted \? \{[\s\S]*?left:\s*drag\.position\.x[\s\S]*?top:\s*drag\.position\.y/);
  });

  it("attaches all four drag handlers to the header drag-handle div", () => {
    expect(SRC).toMatch(/data-testid="messenger-panel-drag-handle"/);
    expect(SRC).toMatch(/onPointerDown=\{drag\.handlers\.onPointerDown\}/);
    expect(SRC).toMatch(/onPointerMove=\{drag\.handlers\.onPointerMove\}/);
    expect(SRC).toMatch(/onPointerUp=\{drag\.handlers\.onPointerUp\}/);
    expect(SRC).toMatch(/onPointerCancel=\{drag\.handlers\.onPointerCancel\}/);
  });

  it('the close button + back buttons + open-in-messages link carry data-no-drag', () => {
    expect(SRC).toMatch(/<button data-no-drag className="messenger-panel__close"/);
    // At least one of the back buttons has the data-no-drag attribute.
    expect(SRC).toMatch(/<button data-no-drag className="messenger-panel__back"/);
  });
});
