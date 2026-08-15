// __tests__/hub/grid-editor-typing-guard.test.ts
//
// admin-ui-alignment-2026-08-14 — the hub editor's layout shortcuts are window-level, and until
// this guard they fired while the surveyor was typing:
//
//   - Backspace to fix a typo in the widget Title field (or in a Quick Actions link label) removed
//     the selected widget from the layout.
//   - ← / → to move the caret inside a text field slid the widget across the grid.
//
// The guard is one predicate, so it is tested as one. The suite runs under the node environment —
// there is no `document` and no `HTMLElement` — which is exactly why the predicate duck-types its
// target instead of reaching for `instanceof`.

import { describe, it, expect } from 'vitest';
import { isTypingTarget } from '@/lib/hub/components/GridEditor';

const el = (tagName: string, extra: Record<string, unknown> = {}) =>
  ({ tagName, ...extra }) as unknown as EventTarget;

describe('isTypingTarget', () => {
  it('claims the keystroke for text-entry elements', () => {
    for (const tag of ['INPUT', 'TEXTAREA', 'SELECT']) {
      expect(isTypingTarget(el(tag)), tag).toBe(true);
    }
  });

  it('claims it for a contenteditable region', () => {
    expect(isTypingTarget(el('DIV', { isContentEditable: true }))).toBe(true);
  });

  it('leaves ordinary layout elements to the shortcuts', () => {
    expect(isTypingTarget(el('DIV'))).toBe(false);
    expect(isTypingTarget(el('BUTTON'))).toBe(false);
    expect(isTypingTarget(el('DIV', { isContentEditable: false }))).toBe(false);
  });

  it('never throws on a null or non-element target', () => {
    expect(isTypingTarget(null)).toBe(false);
    expect(isTypingTarget({} as EventTarget)).toBe(false);
    expect(isTypingTarget(el(''))).toBe(false);
  });
});
