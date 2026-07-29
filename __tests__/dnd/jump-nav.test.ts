// __tests__/dnd/jump-nav.test.ts — Slice 37: in-page jump links must scroll WITHOUT pushing a hash history
// entry, so browser Back leaves the page in one press instead of "jumping up and down" the same page.
// Source-anchored (client component + a routing behavior).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const NAV = fs.readFileSync(path.join(process.cwd(), 'app/dnd/_ui/JumpNav.tsx'), 'utf8');
const PAGE = fs.readFileSync(path.join(process.cwd(), 'app/dnd/library/[key]/page.tsx'), 'utf8');
const MAP_STUDIO = fs.readFileSync(path.join(process.cwd(), 'public/dnd/maps/map-studio.html'), 'utf8');

/** Source with comments stripped. Recurring rule in this repo, and it bit again here: this file asserted
 *  `NAV` contained 'scrollIntoView', and when P11-8 replaced that call with an offset `window.scrollTo`
 *  the assertion still PASSED — the only remaining occurrence was in a comment explaining why the call had
 *  been removed. A source assertion that reads prose is testing the documentation. */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('JumpNav does not pollute history (Slice 37)', () => {
  it('scrolls the target into view + REPLACES the hash rather than pushing a new entry', () => {
    const nav = code(NAV);
    expect(nav).toContain('e.preventDefault()'); // the default #anchor push is prevented
    // "Scrolls the target into view" is the GUARANTEE; `scrollIntoView` was merely how it was done until
    // the bar became sticky, which made that call park the heading underneath it. Either mechanism is
    // fine — doing neither is not.
    expect(nav).toMatch(/scrollIntoView|window\.scrollTo\(/);
    expect(nav).toContain("history.replaceState(null, '', `#${id}`)"); // replace, not push
    expect(nav).not.toContain('pushState');
  });

  it('sticks to the top, and offsets the jump by its own height', () => {
    // P11-8. The library pages run to eighteen viewports (Pathfinder 2e measured 15,204px), so an index
    // that scrolls away is reachable only from the top. Sticky and offset are one change: made sticky
    // without the offset, every jump would hide the heading it just took you to.
    expect(code(NAV)).toContain('styles.jumpNav');
    expect(code(NAV)).toMatch(/getBoundingClientRect\(\)\.height/);
    const css = fs.readFileSync(path.join(process.cwd(), 'app/dnd/_ui/hextech.module.css'), 'utf8');
    expect(css).toMatch(/\.jumpNav \{[^}]*position: sticky/s);
  });

  it('gives the jumped-to section FOCUS, not just scroll', () => {
    // Keyboard parity, named in the brief. Scrolling alone leaves focus on the link, so the next Tab
    // carries on through the index instead of entering the section the user asked for.
    expect(code(NAV)).toContain("setAttribute('tabindex', '-1')");
    expect(code(NAV)).toMatch(/focus\(\{ preventScroll: true \}\)/);
  });

  it('meets a 44px touch target on a coarse pointer', () => {
    // The pills measured 28px. Raised only under `pointer: coarse` — the problem is a fingertip, and
    // 44px pills on a desktop would turn a compact index into a wall of buttons.
    const css = fs.readFileSync(path.join(process.cwd(), 'app/dnd/_ui/hextech.module.css'), 'utf8');
    const coarse = css.slice(css.indexOf('@media (pointer: coarse)'));
    expect(coarse).toMatch(/\.jumpNavItem \{[^}]*min-height: 44px/s);
  });

  it('the library page uses JumpNav instead of raw #anchor links', () => {
    expect(PAGE).toContain('<JumpNav');
    // the old inline hash-anchor jump nav is gone
    expect(PAGE).not.toMatch(/href=\{`#\$\{s\.id\}`\}/);
  });

  // The Slice-37 audit ruled the map studio OUT as a history polluter because its URL-sync uses
  // replaceState (no new entry). Pin that so a change to pushState — which would reintroduce the
  // "Back needs several presses" bug on the map page — fails here instead of in the field.
  it('the map studio syncs its URL with replaceState, never pushState', () => {
    expect(MAP_STUDIO).toContain('history.replaceState('); // the URL-state sync the audit relied on
    expect(MAP_STUDIO).not.toContain('history.pushState(');
  });
});
