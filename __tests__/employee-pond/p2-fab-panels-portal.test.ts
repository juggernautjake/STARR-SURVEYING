// __tests__/employee-pond/p2-fab-panels-portal.test.ts
//
// employee-pond polish — both FAB pop-up panels (FloatingMessenger
// + DiscussionThreadButton) must portal their panel to <body> so
// they escape the FAB pill's flex / overflow / opacity-transition
// context. Without the portal, the panels render INSIDE
// .fab-menu__buttons (which has max-width + overflow: hidden +
// opacity transitions) and end up clipped — the user saw a
// "green card expanding with just an input field".

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('FloatingMessenger — panel portals to document.body', () => {
  const SRC = read('app/admin/components/FloatingMessenger.tsx');

  it("imports createPortal from react-dom", () => {
    expect(SRC).toMatch(/import \{ createPortal \} from 'react-dom'/);
  });

  it("wraps the panel render in createPortal(<overlay + panel>, document.body)", () => {
    // Slice fab-modal-fix-2026-06-17 — added a messenger-overlay
    // backdrop wrapper around the .messenger-panel so the modal
    // has a visible dimmed-page state. The portal's first child
    // is now the overlay; the panel sits inside it.
    expect(SRC).toMatch(/\{isOpen && typeof document !== 'undefined' && createPortal\(\s*\n\s*<div\s+className="messenger-overlay"/);
    expect(SRC).toMatch(/className="messenger-panel"/);
    expect(SRC).toMatch(/document\.body,\s*\n\s*\)\}/);
  });

  it("guards against SSR (typeof document !== 'undefined')", () => {
    expect(SRC).toMatch(/typeof document !== 'undefined' && createPortal/);
  });
});

describe('DiscussionThreadButton (Flag an Issue) — panel portals to document.body', () => {
  const SRC = read('app/admin/components/DiscussionThreadButton.tsx');

  it("imports createPortal from react-dom", () => {
    expect(SRC).toMatch(/import \{ createPortal \} from 'react-dom'/);
  });

  it("wraps the discussion-panel render in createPortal(<overlay + panel>, document.body)", () => {
    // Slice fab-modal-fix-2026-06-17 — added a discussion-overlay
    // backdrop wrapper around .discussion-panel. The portal's
    // first child is now the overlay; the panel sits inside it.
    expect(SRC).toMatch(/\{isOpen && typeof document !== 'undefined' && createPortal\(\s*\n\s*<div\s+className="discussion-overlay"/);
    expect(SRC).toMatch(/className="discussion-panel"/);
  });

  it("closes the portal call with document.body as the target", () => {
    expect(SRC).toMatch(/document\.body,\s*\n\s*\)\}/);
  });
});
