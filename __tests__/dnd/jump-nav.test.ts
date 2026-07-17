// __tests__/dnd/jump-nav.test.ts — Slice 37: in-page jump links must scroll WITHOUT pushing a hash history
// entry, so browser Back leaves the page in one press instead of "jumping up and down" the same page.
// Source-anchored (client component + a routing behavior).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const NAV = fs.readFileSync(path.join(process.cwd(), 'app/dnd/_ui/JumpNav.tsx'), 'utf8');
const PAGE = fs.readFileSync(path.join(process.cwd(), 'app/dnd/library/[key]/page.tsx'), 'utf8');

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
});
