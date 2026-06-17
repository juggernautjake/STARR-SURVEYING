// __tests__/employee-pond/fab-pill-fixes.test.ts
//
// Slice fab-modal-fix-2026-06-17 — user reported two more bugs
// on the floating-action pill at the bottom right of the admin
// shell:
//
//   1. "The little green card with in the bottom right with the
//      various button functions for field book and calculator and
//      stuff is not opening and collapsing properly, and the
//      messages button isn't even there anymore."
//   2. "the tool tips showing what each button is for is not
//      working properly either."
//
// Root causes + fixes locked here:
//
//   • Messages FAB missing: FloatingMessenger had
//     `if (pathname.startsWith('/admin/messages')) return null;`
//     which hid the button on every /admin/messages/* sub-route.
//     Now it only hides on the exact /admin/messages landing where
//     the full messenger UI is already on screen.
//   • Tooltips clipped: `.fab-menu__buttons { overflow: hidden }`
//     is needed for the max-width:0 collapse animation, but it
//     also clipped the per-button tooltips that hover above the
//     pill. Adding `overflow: visible` to the expanded state lets
//     tooltips escape; collapsed state still clips them so the
//     animation looks crisp.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('FloatingMessenger — Messages FAB stays visible on /admin/messages sub-routes', () => {
  const SRC = read('app/admin/components/FloatingMessenger.tsx');

  it('hides only on the exact /admin/messages path, not every sub-route', () => {
    expect(SRC).toMatch(/if \(pathname === '\/admin\/messages'\) return null/);
  });

  it("no longer uses pathname.startsWith('/admin/messages') as a return-null guard", () => {
    // The old startsWith() guard hid the FAB on every sub-route.
    // We accept the string in COMMENTS (the slice note explains
    // the old code) but not as an actual `if (…) return null;`
    // statement.
    expect(SRC).not.toMatch(/if \(pathname\.startsWith\('\/admin\/messages'\)\) return null/);
  });
});

describe('FAB pill — tooltips can escape the buttons container when expanded', () => {
  const CSS = read('app/admin/styles/AdminLayout.css');

  it('expanded state sets overflow: visible on .fab-menu__buttons', () => {
    expect(CSS).toMatch(
      /\.fab-menu--expanded\s+\.fab-menu__buttons\s*\{[\s\S]*?overflow:\s*visible/,
    );
  });

  it('the base .fab-menu__buttons rule still has overflow: hidden for the collapse animation', () => {
    expect(CSS).toMatch(/^\.fab-menu__buttons\s*\{[\s\S]*?overflow:\s*hidden/m);
  });

  it('collapsed state still hides the buttons (max-width: 0 + pointer-events: none)', () => {
    expect(CSS).toMatch(
      /\.fab-menu--collapsed\s+\.fab-menu__buttons\s*\{[\s\S]*?max-width:\s*0[\s\S]*?pointer-events:\s*none/,
    );
  });
});
