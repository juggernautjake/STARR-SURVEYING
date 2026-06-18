// __tests__/admin/floating-popup-styles-fix.test.ts
//
// floating-popup-styles-fix-2026-06-18 — the FloatingMessenger
// + DiscussionThreadButton popups render on EVERY admin page
// (they're mounted in AdminLayoutClient.tsx), but their
// stylesheets used to be scoped to /admin/messages and
// /admin/discussions. Result: opening either popup from
// /admin/calendar (or any other admin route) produced an
// unstyled column-collapsed layout with no rounded corners,
// no padding, conversations laid out horizontally, etc.
//
// This spec locks the fix: AdminMessaging.css + AdminDiscussions.css
// are imported in AdminLayoutClient.tsx so they load globally,
// and the duplicate pre-MX1 .messenger-panel__header rule that
// re-skinned the header back to the navy bar is gone.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

describe('AdminLayoutClient global popup-style imports', () => {
  const SRC = read('app/admin/components/AdminLayoutClient.tsx');

  it("imports AdminMessaging.css so the FloatingMessenger styles load globally", () => {
    expect(SRC).toMatch(/import '\.\.\/styles\/AdminMessaging\.css'/);
  });

  it("imports AdminDiscussions.css so the DiscussionThreadButton styles load globally", () => {
    expect(SRC).toMatch(/import '\.\.\/styles\/AdminDiscussions\.css'/);
  });
});

describe('AdminMessaging.css cascade — MX1 header polish wins', () => {
  const CSS = read('app/admin/styles/AdminMessaging.css');

  it('drops the duplicate pre-MX1 .messenger-panel__header navy-bar rule', () => {
    // The old rule set the header background to var(--color-brand-navy)
    // with white text. After the fix, the only place those colours show
    // up against the header should be inside a comment.
    const noisyHeaderRule = /\.messenger-panel__header \{[^}]*background:var\(--color-brand-navy\)/;
    expect(CSS).not.toMatch(noisyHeaderRule);
  });

  it("keeps the MX1 header polish — gradient background + 16px corner radius", () => {
    expect(CSS).toMatch(/\.messenger-panel__header \{[\s\S]*?background: linear-gradient\(180deg, #FAFBFF 0%, #FFFFFF 100%\)/);
    expect(CSS).toMatch(/\.messenger-panel \{[\s\S]*?border-radius: 16px/);
  });
});
