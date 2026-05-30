// __tests__/hub/grid-editor-drop-commit.test.ts
//
// Slice 10 of employee-hub-overhaul-2026-05-30.md. Locks the cancel
// + commit semantics on the GridEditor drag pipeline:
//   - commit on pointer-up INSIDE the grid → setDraftWidgets
//   - cancel on pointer-cancel → no draftWidgets touch
//   - cancel on Esc mid-drag → no draftWidgets touch
//   - cancel on drop OUTSIDE the grid → no draftWidgets touch
// Source-regex assertions because the modal's render path hits the
// SSR-snapshot caching limitation other modal specs work around.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', 'lib', 'hub', 'components', 'GridEditor.tsx'),
  'utf8',
);

describe('Slice 10 — cancelMoveRef exposes drag teardown', () => {
  it('declares cancelMoveRef at component scope', () => {
    expect(SRC).toMatch(/const cancelMoveRef = useRef<\(\(\) => void\) \| null>\(null\);/);
  });

  it('startMove installs its teardown into cancelMoveRef', () => {
    expect(SRC).toMatch(/cancelMoveRef\.current = teardown;/);
  });

  it('teardown clears cancelMoveRef before returning', () => {
    expect(SRC).toMatch(
      /function teardown\(\) \{[\s\S]*?cancelMoveRef\.current = null;[\s\S]*?setMoveDrag\(null\);[\s\S]*?\}/,
    );
  });
});

describe('Slice 10 — pointer-cancel restores pre-drag layout', () => {
  it('handlePointerCancel just runs teardown (no commit)', () => {
    expect(SRC).toMatch(
      /function handlePointerCancel\(_ev: PointerEvent\) \{\s*teardown\(\);\s*\}/,
    );
  });

  it('pointercancel listener wires to the dedicated cancel handler', () => {
    // The move pipeline's pointercancel uses handlePointerCancel
    // (Slice 10's split). The pre-existing resize pipeline still
    // routes its own pointercancel through its own handleUp — that's
    // out of scope here.
    expect(SRC).toMatch(/window\.addEventListener\('pointercancel', handlePointerCancel\);/);
  });
});

describe('Slice 10 — drop-outside-the-grid cancels', () => {
  it('handleUp checks the pointer is inside the grid container before committing', () => {
    expect(SRC).toMatch(
      /const rect = gridEl!\.getBoundingClientRect\(\);[\s\S]*?const inside =[\s\S]*?ev\.clientX >= rect\.left &&[\s\S]*?ev\.clientX <= rect\.right &&[\s\S]*?ev\.clientY >= rect\.top &&[\s\S]*?ev\.clientY <= rect\.bottom;/,
    );
  });

  it('routes through teardown (not commitDrop) when the drop landed outside', () => {
    expect(SRC).toMatch(
      /if \(!inside\) \{\s*teardown\(\);\s*return;\s*\}/,
    );
  });
});

describe('Slice 10 — mid-drag Esc cancels the move (highest priority)', () => {
  it('the modal-level Esc cascade checks cancelMoveRef FIRST', () => {
    // Locks the priority order: cancel-move > disarm-placement
    // (Slice P2 replaced the place-anchor branch with selectedType) >
    // painted-selection > onClose.
    expect(SRC).toMatch(
      /if \(e\.key === 'Escape'\) \{[\s\S]*?if \(cancelMoveRef\.current\) \{[\s\S]*?cancelMoveRef\.current\(\);[\s\S]*?\} else if \(selectedType\)/,
    );
  });

  it('mid-drag Esc preventDefaults so the modal close handler does NOT also fire', () => {
    expect(SRC).toMatch(
      /if \(cancelMoveRef\.current\) \{\s*e\.preventDefault\(\);\s*cancelMoveRef\.current\(\);/,
    );
  });
});

describe('Slice 10 — commit path (pointer-up inside the grid)', () => {
  it('still calls commitDrop + setDraftWidgets when the drop is inside', () => {
    expect(SRC).toMatch(
      /const cell = pointerToCell\(ev\.clientX, ev\.clientY\);[\s\S]*?const committed = commitDrop\(current, inst\.id, target, HUB_GRID_COLS\);[\s\S]*?teardown\(\);[\s\S]*?setDraftWidgets\(committed\);/,
    );
  });

  it('teardown runs BEFORE setDraftWidgets so the preview clears in the same tick', () => {
    expect(SRC).toMatch(/teardown\(\);\s*setDraftWidgets\(committed\);/);
  });
});

describe('Slice 10 — teardown is idempotent + standalone', () => {
  it('teardown removes all three window listeners', () => {
    expect(SRC).toMatch(/window\.removeEventListener\('pointermove', handleMove\);/);
    expect(SRC).toMatch(/window\.removeEventListener\('pointerup', handleUp\);/);
    expect(SRC).toMatch(/window\.removeEventListener\('pointercancel', handlePointerCancel\);/);
  });
});
