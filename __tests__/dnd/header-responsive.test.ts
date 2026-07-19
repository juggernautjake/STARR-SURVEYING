// __tests__/dnd/header-responsive.test.ts — MOB1. The owner flagged the /dnd header as the worst mobile
// offender: "put the menu items into a dropdown… see the user's name and log them out." This source-anchors
// that the header collapses into a native <details> dropdown (server-component-safe, no client JS), that the
// toggle surfaces the signed-in name, and that Log out lives inside — plus the CSS that hides the toggle on
// desktop and turns it into a dropdown on mobile. A refactor that dropped any of those fails here.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const header = readFileSync(join(process.cwd(), 'app/dnd/_ui/DndHeader.tsx'), 'utf8');
const css = readFileSync(join(process.cwd(), 'app/dnd/_ui/hextech.module.css'), 'utf8');

describe('DnD header collapses to a dropdown on mobile (MOB1)', () => {
  it('wraps the nav in a native <details>/<summary> so it needs no client JS', () => {
    expect(header).toMatch(/<details className=\{styles\.siteMenu\}>/);
    expect(header).toMatch(/<summary className=\{styles\.siteMenuToggle\}/);
    expect(header).toContain('<nav className={styles.siteNav}>');
  });

  it('shows the signed-in user name on the toggle (falls back to "Menu" when signed out)', () => {
    expect(header).toContain('{userName || \'Menu\'}');
    expect(header).toMatch(/className=\{styles\.siteMenuLabel\}/);
  });

  it('keeps Log out reachable inside the menu and the "Signed in as" name', () => {
    expect(header).toContain('<LogoutButton />');
    expect(header).toContain('Signed in as');
  });

  it('closes the mobile dropdown after picking a nav item (client onClick removes [open])', () => {
    expect(header).toContain("'use client'");
    expect(header).toMatch(/closest\('details'\)\?\.removeAttribute\('open'\)/);
    // every nav Link inside the menu wires the close handler
    expect((header.match(/onClick=\{closeMenu\}/g) || []).length).toBeGreaterThanOrEqual(4);
  });

  it('CSS makes the menu a working dropdown on ALL sizes (fix: a closed <details> did not render an inline desktop nav)', () => {
    // The toggle is a visible button on desktop too (inline-flex), not display:none — that hid the whole menu.
    expect(css).toMatch(/\.siteMenuToggle\s*\{[^}]*display:\s*inline-flex/);
    // The nav is a dropdown hidden until open, revealed by the open menu — the same pattern on every size.
    expect(css).toMatch(/\.siteNav\s*\{[\s\S]*?display:\s*none/);
    expect(css).toContain('.siteMenu[open] .siteNav');
    expect(css).toMatch(/@media \(max-width: 640px\)/);
  });

  it('offers the full nav — Library, +Character, +Campaign, +Map, and sign-in/out', () => {
    for (const item of ['Library', '＋ Character', '＋ Campaign', '＋ Map']) expect(header).toContain(item);
    // sign in (signed-out) OR the LogoutButton (signed-in) are both present in the menu.
    expect(header).toContain('Sign in');
    expect(header).toContain('<LogoutButton />');
  });
});
