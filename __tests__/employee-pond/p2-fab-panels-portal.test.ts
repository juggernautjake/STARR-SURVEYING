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

  it("wraps the panel render in createPortal(<panel>, document.body)", () => {
    expect(SRC).toMatch(/\{isOpen && typeof document !== 'undefined' && createPortal\(\s*\n\s*<div className="messenger-panel"/);
    expect(SRC).toMatch(/<\/div>,\s*\n\s*document\.body,\s*\n\s*\)\}/);
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

  it("wraps the discussion-panel render in createPortal(<panel>, document.body)", () => {
    expect(SRC).toMatch(/\{isOpen && typeof document !== 'undefined' && createPortal\(\s*\n\s*<div className="discussion-panel"/);
  });

  it("closes the portal call with document.body as the target", () => {
    expect(SRC).toMatch(/<\/div>,\s*\n\s*document\.body,\s*\n\s*\)\}/);
  });
});
