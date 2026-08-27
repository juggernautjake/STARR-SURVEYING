# Hub Customizer — categories, search and disclosure — 2026-08-27

**Status:** IN PROGRESS · opened 2026-08-27 · owner's notes, verbatim, plus what the code actually
does today.

The Add-Widget catalog opens on a wall of widgets. The owner's six items below are one coherent
change: make the catalog open as **categories**, let a category expand in place, and make search
operate on categories rather than on one flat list — without the screen flickering, and without
losing which boxes the user had open.

---

## 0. Premise check — what already exists

Written before building anything, because half of item 1 was already done and building it again would
have been the fourth time in this repo that a parked note turned out to have a false premise.

| Claim | Reality in `main` |
|---|---|
| Widgets are not categorised | **False.** `WidgetCategory` has 11 values, every widget in `lib/hub/widgets/` declares exactly one, and `groupByCategory()` already exists in `widget-catalog-filter.ts`. |
| The hub opens on a wall of widgets | **True**, and this is the real complaint. `category === 'all'` renders *every* widget grouped under always-open headings — 55 tiles. Grouping without collapsing is still a wall. |
| Search is flat | **True.** `scoreEntry()` matches each widget on id/label/description/category, then the survivors are grouped. Categories are a rendering detail, not a search unit. |
| Categories can be opened and closed | **False.** No open/closed state exists anywhere. The tab row is a single-selection *filter*, which is a different interaction. |

**So item 1's categorisation is done and item 1's stated OUTCOME is not.** The outcome — "the hub
opens showing categories rather than a wall" — is delivered by item 2, and the rest follow from
there.

---

## 1. The items, as written

### H1 — Sort widgets into categories ◐ categorisation already done, outcome pending

> Declutter the screen and cut the time it takes to find a specific widget.
>
> **Outcome:** every widget belongs to exactly one category, and the hub opens showing categories
> rather than a wall of widgets.

Every widget already belongs to exactly one category. What is missing is the second half — the hub
opening on categories — which H2 delivers. Nothing to build here beyond confirming no widget is
uncategorised, which a test now asserts.

### H2 — Category boxes with drop-down widget lists ☐

> Once widgets are sorted, each category is a box with a dropdown containing its widgets.
>
> **Behaviour when a category is selected:**
> - The other categories slide down out of the way
> - The selected category expands in place, filling the freed space
> - Its widgets display in a drop-down underneath itself

### H3 — Search widgets by category tags, not one flat list ☐

> Searching should not scan every widget across every category.
>
> **Instead:** each category carries the tags of its own widgets.
> - Categories with no matching keyword or phrase are hidden entirely
> - Within a matching category, widgets whose tags do not match are also hidden
> - Only relevant categories and relevant widgets remain on screen

### H4 — Auto-open categories that match a search ☐

> A category surfaced by a search should already be open. The user should not have to click into a
> category to see why it matched.

### H5 — Fade widgets and categories in and out — never pop ☐

> Keywords update in real time as the user types, so things are constantly appearing and
> disappearing.
>
> **Requirement:** a slight fade in / fade out on both widgets and categories. Without it the screen
> looks like items are popping in and out of existence — jittery and cheap-looking.

### H6 — Remember open/closed state across a search ☐

> Category open/closed state must survive a search and be restored when the search is cleared.
>
> **Worked example:**
> - Categories 1 and 2 are open, Category 3 is closed
> - User searches; results narrow to Category 2 only
> - User deletes the search
> - **Expected:** 1 and 2 are open again, 3 is still closed — exactly as before the search

---

## 2. The one design decision worth writing down

H4 and H6 pull in opposite directions if disclosure is stored as a single piece of state. A search
opens matching categories; clearing the search has to put back exactly what the user had. Implemented
naively — search *mutates* the open set, clearing tries to *undo* the mutation — this needs a
snapshot, and every edge case (search while searching, backspacing to empty, a category the user
closed *during* a search) becomes a separate bug.

**So user intent and search-derived disclosure are stored separately, and the displayed state is
derived from both:**

```
displayedOpen(category) =
  searchActive ? categoryMatchesSearch(category)
               : userOpened.has(category)
```

Clearing the search restores the previous state **by construction** rather than by undoing anything —
there is nothing to undo, because the user's set was never written to. This is the part to keep if
the UI is ever rebuilt.

---

## 3. Slices

| | Item | What ships |
|---|---|---|
| S1 | H1, H3 | Category-level tag aggregation + a filter that returns categories with their surviving widgets, hiding non-matching categories entirely. Pure, tested. |
| S2 | H4, H6 | `lib/hub/category-disclosure.ts` — the derived-state model above. Pure, tested against the owner's worked example verbatim. |
| S3 | H2, H5 | The modal rewritten as collapsible category boxes with fade transitions and `prefers-reduced-motion` respected. |

---

## 4. Not in scope

- The widget **grid** (drag, resize, reflow) is untouched. This is the catalog only.
- Re-categorising any widget. The 11 categories and their memberships are the owner's, not mine to
  change; if a widget is in the wrong box that is a separate, one-line note.
