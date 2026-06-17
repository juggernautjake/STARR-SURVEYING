// __tests__/employee-pond/fab-modal-backdrop.test.ts
//
// Slice fab-modal-fix-2026-06-17 — user reported the messaging
// interface and "Flag an Issue" interface "are not rendering their
// modals at all" even after the earlier P2 portal fix. To make the
// open state unambiguous regardless of any downstream CSS
// regression, both FAB panels now render inside a backdrop overlay
// with explicit inline-style defensive guards:
//
//   - The overlay covers the full viewport with a translucent
//     dimming layer (rgba(15, 23, 42, 0.32)) so the user always
//     sees SOMETHING happen when they click the FAB.
//   - Clicking the overlay (outside the panel) closes the panel.
//   - The panel itself stops propagation so clicks inside don't
//     bubble to the backdrop's onClick close handler.
//   - Inline styles guarantee position: fixed, white background,
//     and a very high z-index (9000+) so external CSS can't make
//     the modal invisible.
//
// This is the contract we want to keep stable; if a future
// refactor removes the backdrop or the defensive inline styles
// the test should fail loudly.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('FloatingMessenger — visible backdrop modal contract', () => {
  const SRC = read('app/admin/components/FloatingMessenger.tsx');

  it('renders a .messenger-overlay wrapper around the panel', () => {
    expect(SRC).toMatch(/className="messenger-overlay"/);
    expect(SRC).toMatch(/data-testid="messenger-overlay"/);
  });

  it('the overlay has defensive inline styles (position: fixed, full inset, dim background, high z-index)', () => {
    expect(SRC).toMatch(/className="messenger-overlay"[\s\S]*?style=\{\{[\s\S]*?position:\s*'fixed'[\s\S]*?inset:\s*0[\s\S]*?zIndex:\s*9000[\s\S]*?background:\s*'rgba\(15, 23, 42, 0\.32\)'/);
  });

  it('clicking the overlay (outside the panel) closes the panel', () => {
    expect(SRC).toMatch(/className="messenger-overlay"[\s\S]*?onClick=\{\(\)\s*=>\s*setIsOpen\(false\)\}/);
  });

  it('the inner .messenger-panel has defensive inline styles + stops click propagation', () => {
    expect(SRC).toMatch(/className="messenger-panel"[\s\S]*?onClick=\{\(e\)\s*=>\s*e\.stopPropagation\(\)\}/);
    expect(SRC).toMatch(/className="messenger-panel"[\s\S]*?position:\s*'fixed'[\s\S]*?background:\s*'#FFFFFF'/);
  });
});

describe('DiscussionThreadButton — visible backdrop modal contract', () => {
  const SRC = read('app/admin/components/DiscussionThreadButton.tsx');

  it('renders a .discussion-overlay wrapper around the panel', () => {
    expect(SRC).toMatch(/className="discussion-overlay"/);
    expect(SRC).toMatch(/data-testid="discussion-overlay"/);
  });

  it('the overlay has defensive inline styles (position: fixed, full inset, dim background, high z-index)', () => {
    expect(SRC).toMatch(/className="discussion-overlay"[\s\S]*?style=\{\{[\s\S]*?position:\s*'fixed'[\s\S]*?inset:\s*0[\s\S]*?zIndex:\s*9000[\s\S]*?background:\s*'rgba\(15, 23, 42, 0\.32\)'/);
  });

  it('clicking the overlay (outside the panel) closes the panel', () => {
    expect(SRC).toMatch(/className="discussion-overlay"[\s\S]*?onClick=\{\(\)\s*=>\s*setIsOpen\(false\)\}/);
  });

  it('the inner .discussion-panel has defensive inline styles + stops click propagation', () => {
    expect(SRC).toMatch(/className="discussion-panel"[\s\S]*?onClick=\{\(e\)\s*=>\s*e\.stopPropagation\(\)\}/);
    expect(SRC).toMatch(/className="discussion-panel"[\s\S]*?position:\s*'fixed'[\s\S]*?background:\s*'#FFFFFF'/);
  });
});
