// __tests__/dnd/jump-nav.test.ts — Slice 37: in-page jump links must scroll WITHOUT pushing a hash history
// entry, so browser Back leaves the page in one press instead of "jumping up and down" the same page.
// Source-anchored (client component + a routing behavior).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const NAV = fs.readFileSync(path.join(process.cwd(), 'app/dnd/_ui/JumpNav.tsx'), 'utf8');
const PAGE = fs.readFileSync(path.join(process.cwd(), 'app/dnd/library/[key]/page.tsx'), 'utf8');
const MAP_STUDIO = fs.readFileSync(path.join(process.cwd(), 'public/dnd/maps/map-studio.html'), 'utf8');

describe('JumpNav does not pollute history (Slice 37)', () => {
  it('scrolls into view + REPLACES the hash rather than pushing a new entry', () => {
    expect(NAV).toContain("e.preventDefault()"); // the default #anchor push is prevented
    expect(NAV).toContain('scrollIntoView');
    expect(NAV).toContain("history.replaceState(null, '', `#${id}`)"); // replace, not push
    expect(NAV).not.toContain('pushState');
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
