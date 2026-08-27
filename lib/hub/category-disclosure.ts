// lib/hub/category-disclosure.ts — which category boxes are open, and why
//
// H4 and H6 of HUB_CUSTOMIZER_2026-08-27.md pull in opposite directions:
//
//   H4  a category surfaced by a search should already be open
//   H6  open/closed state must survive a search and be restored when it is cleared
//
// ── WHY THIS IS A MODULE AND NOT THREE useState CALLS ───────────────────────────────────────────
//
// The obvious implementation stores one open-set and has the search MUTATE it: typing opens the
// matches, clearing tries to put back what was there. That needs a snapshot taken at exactly the
// right moment, and then every edge becomes its own bug — searching while already searching,
// backspacing to empty one character at a time, closing a category *during* a search, or the search
// term changing so the previously-opened set is now the wrong one to restore.
//
// **So user intent is never written to by the search.** Two pieces of state, and what the screen
// shows is derived from both:
//
//     displayedOpen(category) = searchActive ? categoryMatched(category)
//                                            : userOpened.has(category)
//
// Clearing the search restores the user's state BY CONSTRUCTION — there is nothing to undo, because
// nothing was overwritten. The owner's worked example (1 and 2 open, 3 closed; search narrows to 2;
// clear; 1 and 2 open again and 3 still closed) is not a case that had to be handled. It falls out.
//
// The one genuinely interesting question left is what a *click during a search* means, and the
// answer is below.

/** The state a caller owns. Everything else here is derived. */
export interface DisclosureState {
  /** Categories the user has opened, when not searching. The search never writes to this. */
  userOpened: ReadonlySet<string>;
  /**
   * Categories the user has explicitly toggled *while a search was active*, mapped to the state they
   * toggled to.
   *
   * Needed because during a search the displayed state comes from the match, so a plain click would
   * be immediately overridden by the next keystroke's re-derivation. This is a short-lived override
   * that is cleared when the search is, and it deliberately does NOT leak into `userOpened` — a box
   * you collapsed to see past it while searching is not a statement about how you want the catalog
   * to sit afterwards.
   */
  searchOverrides: ReadonlyMap<string, boolean>;
}

export function emptyDisclosure(): DisclosureState {
  return { userOpened: new Set(), searchOverrides: new Map() };
}

/** A search is "active" only once it is non-blank. Whitespace is not a query. */
export function isSearchActive(search: string): boolean {
  return search.trim().length > 0;
}

/**
 * Is this category's box open right now?
 *
 * `matched` is whether the search surfaced it — ignored entirely when no search is active, which is
 * what makes clearing the search a no-op on the user's own state.
 */
export function isCategoryOpen(
  state: DisclosureState,
  category: string,
  opts: { searchActive: boolean; matched: boolean },
): boolean {
  if (!opts.searchActive) return state.userOpened.has(category);
  const override = state.searchOverrides.get(category);
  if (override !== undefined) return override;
  // H4 — surfaced by a search means already open. Nobody should have to click a category to find out
  // why it matched.
  return opts.matched;
}

/**
 * Toggle one category.
 *
 * Which half of the state this writes to depends on whether a search is running, and that is the
 * whole point: a click while searching is about *this search*, and a click otherwise is about how
 * the user wants their catalog to sit.
 */
export function toggleCategory(
  state: DisclosureState,
  category: string,
  opts: { searchActive: boolean; matched: boolean },
): DisclosureState {
  const currentlyOpen = isCategoryOpen(state, category, opts);

  if (opts.searchActive) {
    const searchOverrides = new Map(state.searchOverrides);
    searchOverrides.set(category, !currentlyOpen);
    // `userOpened` passes through untouched — this is the line H6 depends on.
    return { userOpened: state.userOpened, searchOverrides };
  }

  const userOpened = new Set(state.userOpened);
  if (currentlyOpen) userOpened.delete(category);
  else userOpened.add(category);
  return { userOpened, searchOverrides: state.searchOverrides };
}

/**
 * Call when the search term changes.
 *
 * Overrides are per-search: they are dropped the moment the term changes, because "I closed
 * Equipment to see past it" was a statement about the results of *that* query and means nothing
 * about the next one. Returns the same object when nothing changed, so React can skip the render.
 */
export function onSearchChanged(state: DisclosureState, nextSearch: string, prevSearch: string): DisclosureState {
  if (nextSearch === prevSearch) return state;
  if (state.searchOverrides.size === 0) return state;
  return { userOpened: state.userOpened, searchOverrides: new Map() };
}

/** Open every category — the "expand all" affordance. Only meaningful outside a search. */
export function openAll(state: DisclosureState, categories: readonly string[]): DisclosureState {
  return { userOpened: new Set(categories), searchOverrides: state.searchOverrides };
}

/** Close every category. This is the state the catalog should OPEN in: H1's outcome is that the hub
 *  shows categories rather than a wall of widgets, and a wall of open boxes is still a wall. */
export function closeAll(state: DisclosureState): DisclosureState {
  return { userOpened: new Set(), searchOverrides: state.searchOverrides };
}
