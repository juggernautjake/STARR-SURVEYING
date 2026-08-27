// __tests__/hub/category-disclosure.test.ts
//
// H4 and H6 of HUB_CUSTOMIZER_2026-08-27.md are the two requirements that fight each other: a search
// must OPEN the categories it surfaces, and clearing the search must put back exactly what the user
// had. The owner wrote the conflict out as a worked example, and it is reproduced here verbatim as
// the first test — it is the acceptance criterion, not an illustration.
//
// The implementation's claim is that this falls out of the design rather than being handled: user
// intent and search-derived disclosure are separate, and the displayed state is derived. So the
// tests below also check the cases the owner did NOT write down — searching while searching,
// backspacing one character at a time, closing a box mid-search — because those are exactly the ones
// a snapshot-and-restore implementation gets wrong.

import { describe, it, expect } from 'vitest';
import {
  closeAll,
  emptyDisclosure,
  isCategoryOpen,
  isSearchActive,
  onSearchChanged,
  openAll,
  toggleCategory,
  type DisclosureState,
} from '@/lib/hub/category-disclosure';

/** Read the whole picture at once, the way the screen does. */
function open(state: DisclosureState, cats: string[], searchActive: boolean, matched: string[]): string[] {
  return cats.filter((c) => isCategoryOpen(state, c, { searchActive, matched: matched.includes(c) }));
}

const CATS = ['one', 'two', 'three'];

describe("the owner's worked example, verbatim", () => {
  it('restores 1 and 2 open, 3 still closed, after a search that narrowed to 2', () => {
    let s = emptyDisclosure();

    // "Categories 1 and 2 are open, Category 3 is closed"
    s = toggleCategory(s, 'one', { searchActive: false, matched: false });
    s = toggleCategory(s, 'two', { searchActive: false, matched: false });
    expect(open(s, CATS, false, [])).toEqual(['one', 'two']);

    // "User searches; results narrow to Category 2 only"
    s = onSearchChanged(s, 'wid', '');
    expect(open(s, CATS, true, ['two'])).toEqual(['two']);

    // "User deletes the search"
    s = onSearchChanged(s, '', 'wid');

    // "Expected: 1 and 2 are open again, 3 is still closed — exactly as before the search"
    expect(open(s, CATS, false, [])).toEqual(['one', 'two']);
  });
});

describe('H4 — a category surfaced by a search is already open', () => {
  it('opens matches without the user clicking, even ones they had closed', () => {
    // 'three' was never opened by the user. Surfacing it must still show its contents, or the user
    // has to click a box to find out why it matched.
    const s = emptyDisclosure();
    expect(open(s, CATS, true, ['three'])).toEqual(['three']);
  });

  it('leaves non-matching categories closed regardless of what the user had open', () => {
    let s = emptyDisclosure();
    s = toggleCategory(s, 'one', { searchActive: false, matched: false });
    // 'one' is open in the user's own state, but the search did not surface it.
    expect(open(s, CATS, true, ['two'])).toEqual(['two']);
  });
});

describe('H6 — the search never writes to what the user chose', () => {
  it('survives searching while already searching', () => {
    let s = emptyDisclosure();
    s = toggleCategory(s, 'one', { searchActive: false, matched: false });

    s = onSearchChanged(s, 'a', '');
    s = onSearchChanged(s, 'ab', 'a');
    s = onSearchChanged(s, 'abc', 'ab');
    s = onSearchChanged(s, '', 'abc');

    expect(open(s, CATS, false, [])).toEqual(['one']);
  });

  it('survives backspacing to empty one character at a time', () => {
    // The case a snapshot-based implementation usually gets wrong: there is no single "search ended"
    // moment, just a term that gets shorter.
    let s = emptyDisclosure();
    s = toggleCategory(s, 'two', { searchActive: false, matched: false });

    let prev = '';
    for (const term of ['e', 'eq', 'equ', 'eq', 'e', '']) {
      s = onSearchChanged(s, term, prev);
      prev = term;
    }
    expect(open(s, CATS, false, [])).toEqual(['two']);
  });

  it('a box closed DURING a search is not a statement about afterwards', () => {
    let s = emptyDisclosure();
    s = toggleCategory(s, 'one', { searchActive: false, matched: false });

    // Searching surfaces 'one'; the user collapses it to see past it.
    s = onSearchChanged(s, 'x', '');
    s = toggleCategory(s, 'one', { searchActive: true, matched: true });
    expect(open(s, CATS, true, ['one'])).toEqual([]);

    // Clearing must not have learned "the user wants 'one' closed".
    s = onSearchChanged(s, '', 'x');
    expect(open(s, CATS, false, [])).toEqual(['one']);
  });

  it('a box opened DURING a search likewise does not persist', () => {
    let s = emptyDisclosure();
    s = onSearchChanged(s, 'x', '');
    s = toggleCategory(s, 'three', { searchActive: true, matched: false });
    expect(open(s, CATS, true, [])).toEqual(['three']);

    s = onSearchChanged(s, '', 'x');
    expect(open(s, CATS, false, [])).toEqual([]);
  });

  it('drops overrides when the term changes, because they were about that query', () => {
    let s = emptyDisclosure();
    s = onSearchChanged(s, 'cad', '');
    s = toggleCategory(s, 'one', { searchActive: true, matched: true });
    expect(open(s, CATS, true, ['one'])).toEqual([]);

    // A different query. "I collapsed CAD's results" says nothing about the next search.
    s = onSearchChanged(s, 'time', 'cad');
    expect(open(s, CATS, true, ['one'])).toEqual(['one']);
  });
});

describe('toggling outside a search', () => {
  it('opens and closes', () => {
    let s = emptyDisclosure();
    s = toggleCategory(s, 'one', { searchActive: false, matched: false });
    expect(open(s, CATS, false, [])).toEqual(['one']);
    s = toggleCategory(s, 'one', { searchActive: false, matched: false });
    expect(open(s, CATS, false, [])).toEqual([]);
  });

  it('never mutates the state it was given', () => {
    // The caller holds this in React state; mutation would skip renders and produce the classic
    // "it only updates when something else changes" bug.
    const s = emptyDisclosure();
    const next = toggleCategory(s, 'one', { searchActive: false, matched: false });
    expect(s.userOpened.size).toBe(0);
    expect(next.userOpened.size).toBe(1);
    expect(next).not.toBe(s);
  });
});

describe('isSearchActive', () => {
  it('treats whitespace as no search — a space is not a query', () => {
    expect(isSearchActive('')).toBe(false);
    expect(isSearchActive('   ')).toBe(false);
    expect(isSearchActive(' a ')).toBe(true);
  });
});

describe('open all / close all', () => {
  it('closeAll is the state the catalog opens in — H1 wants categories, not a wall', () => {
    let s = openAll(emptyDisclosure(), CATS);
    expect(open(s, CATS, false, [])).toEqual(CATS);
    s = closeAll(s);
    expect(open(s, CATS, false, [])).toEqual([]);
  });

  it('returns the same object when a search change is a no-op', () => {
    // Cheap identity check so React can skip the render.
    const s = emptyDisclosure();
    expect(onSearchChanged(s, 'a', 'a')).toBe(s);
    expect(onSearchChanged(s, 'b', 'a')).toBe(s); // no overrides to clear
  });
});
