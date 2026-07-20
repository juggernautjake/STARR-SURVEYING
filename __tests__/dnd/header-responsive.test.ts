// __tests__/dnd/header-responsive.test.ts — the /dnd header nav dropdown. It's a React-state dropdown (not a
// <details>, which couldn't close on an outside click and lingered open across client-side navigations). This
// source-anchors that the menu: is a click-to-open dropdown driven by state, closes when a nav item is picked
// (the Link still routes), closes on an outside click + Escape, and closes on every route change — plus the CSS
// that shows it as a dropdown on all sizes and the full nav (Library / +Character / +Campaign / +Map / sign-in-out).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const header = readFileSync(join(process.cwd(), 'app/dnd/_ui/DndHeader.tsx'), 'utf8');
const css = readFileSync(join(process.cwd(), 'app/dnd/_ui/hextech.module.css'), 'utf8');

describe('DnD header nav dropdown', () => {
  it('is a state-driven dropdown: a toggle button + a data-open menu container', () => {
    expect(header).toContain("'use client'");
    expect(header).toMatch(/useState\(false\)/);
    expect(header).toContain('className={styles.siteMenu}');
    expect(header).toContain("data-open={open ? 'true' : 'false'}");
    expect(header).toMatch(/<button[\s\S]*?className=\{styles\.siteMenuToggle\}/);
    expect(header).toContain('<nav className={styles.siteNav}');
  });

  it('shows the signed-in user name on the toggle (falls back to "Menu" when signed out)', () => {
    expect(header).toContain("{userName || 'Menu'}");
    expect(header).toMatch(/className=\{styles\.siteMenuLabel\}/);
  });

  it('picking a nav item routes AND closes the menu (no preventDefault; setOpen(false) on click)', () => {
    // Every nav Link wires onClick={() => setOpen(false)} — the Link still navigates.
    expect((header.match(/onClick=\{\(\) => setOpen\(false\)\}/g) || []).length).toBeGreaterThanOrEqual(4);
  });

  it('closes on an outside click, on Escape, and on every route change', () => {
    expect(header).toContain("usePathname");
    expect(header).toMatch(/useEffect\(\(\) => \{ setOpen\(false\); \}, \[pathname\]\)/);
    expect(header).toContain("addEventListener('mousedown'");
    expect(header).toMatch(/e\.key === 'Escape'/);
    expect(header).toMatch(/!menuRef\.current\.contains\(e\.target as Node\)/);
  });

  it('keeps Log out + the "Signed in as" name reachable inside the menu', () => {
    expect(header).toContain('<LogoutButton />');
    expect(header).toContain('Signed in as');
  });

  it('CSS shows the menu as a dropdown on ALL sizes, revealed by data-open', () => {
    expect(css).toMatch(/\.siteMenuToggle\s*\{[^}]*display:\s*inline-flex/);
    expect(css).toMatch(/\.siteNav\s*\{[\s\S]*?display:\s*none/);
    expect(css).toContain(".siteMenu[data-open='true'] .siteNav");
    expect(css).toMatch(/@media \(max-width: 640px\)/);
  });

  it('offers the full nav — Library, +Character, +Campaign, +Map, sign-in/out', () => {
    for (const item of ['Library', '＋ Character', '＋ Campaign', '＋ Map']) expect(header).toContain(item);
    // Relabelled 2026-07-20: the signed-out menu now says "Log in / Create account", because
    // the library is public and a first-time visitor arriving on a shared link needs to know
    // they can make an account, not just sign into an existing one.
    expect(header).toContain('Log in / Create account');
    expect(header).toContain('<LogoutButton />');
  });
});
