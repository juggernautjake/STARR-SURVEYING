// __tests__/dnd/jump-nav-history.test.ts — every in-sheet jump nav jumps WITHOUT pushing history.
//
// The plan doc carried a deferred check: "from a character sheet … a single Back returns to the previous page
// every time — DEFERRED (browser)". Run in a browser 2026-07-26, it FAILED on the IG sheet: `hub → sheet →
// jump → Back` landed back on the same sheet, because the jump pills were plain `<a href="#…">` and the
// browser pushes an entry for those. Back undid the hash instead of leaving the page.
//
// An earlier audit had found exactly this class and fixed it in TWO places — `JumpNav` (the library) and
// `usePf2Panels` (the PF2 sheet) — and pinned the library one with `jump-nav.test.ts`. The IG sheet was the
// third instance of the same idiom and was missed, which is precisely what a guard scoped to one file cannot
// catch. This one asserts the property across ALL of them.
//
// `replaceState` rather than "don't touch the URL": the hash is a real deep link (`#ig-vitals` re-opens that
// section), so it has to survive — it just must not become a history entry.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/** Every surface that renders the `.jumpNavItem` pill idiom. Add new ones here — that is the point. */
const NAVS = [
  ['library', 'app/dnd/_ui/JumpNav.tsx'],
  ['PF2 sheet', 'app/dnd/_ui/pf2/usePf2Panels.tsx'],
  ['IG sheet', 'app/dnd/_ui/ig/useIgPanels.tsx'],
] as const;

describe('a jump pill never pushes a history entry', () => {
  for (const [name, file] of NAVS) {
    const src = read(file);

    it(`${name}: uses replaceState, not pushState or a bare hash link`, () => {
      expect(src).toContain("history.replaceState(null, '', `#");
      expect(src).not.toContain('history.pushState');
    });

    it(`${name}: every jumpNavItem anchor carries a click handler`, () => {
      // A bare `<a href="#x" className={styles.jumpNavItem}>` is the exact shape of the bug: the browser
      // pushes the entry itself, so intercepting the click is the whole fix.
      //
      // Sliced backwards from each `jumpNavItem` to its opening `<a`, rather than matched with a regex:
      // an attribute-matching pattern like `<a[^>]*jumpNavItem` stops at the `>` inside `(e) => …`, so the
      // first version of this test reported zero anchors on all three files and looked like a real failure.
      //
      // Anchored on the real JSX attribute `className={styles.jumpNavItem}` rather than the bare word:
      // the IG file's own explanatory comment QUOTES `<a href="#…">` while describing the bug, and a
      // looser match read that prose as an anchor and failed on it. A source-grep test is only as precise
      // as the thing it greps for — which is the same lesson this whole audit keeps producing.
      const tags: string[] = [];
      for (const m of src.matchAll(/className=\{styles\.jumpNavItem\}/g)) {
        const open = src.lastIndexOf('<a', m.index);
        if (open >= 0) tags.push(src.slice(open, m.index));
      }
      expect(tags.length, `${name} should render jump pills`).toBeGreaterThan(0);
      for (const t of tags) expect(t, `bare anchor in ${name}: ${t.slice(0, 90)}`).toMatch(/onClick=/);
    });

    it(`${name}: the handler prevents the default navigation`, () => {
      expect(src).toContain('e.preventDefault()');
    });
  }

  it('all three still SET the hash, so a deep link keeps working', () => {
    for (const [, file] of NAVS) expect(read(file)).toMatch(/replaceState\(null, '', `#\$\{\w+\}`\)/);
  });
});
