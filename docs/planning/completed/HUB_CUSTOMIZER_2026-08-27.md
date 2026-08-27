# Hub Customizer — categories, search and disclosure — 2026-08-27

**Status:** ALL SIX SHIPPED 2026-08-27 · opened 2026-08-27 · owner's notes, verbatim, plus what the code actually
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

### H1 — Sort widgets into categories ✅ categorisation was already done; the outcome shipped with H2

> Declutter the screen and cut the time it takes to find a specific widget.
>
> **Outcome:** every widget belongs to exactly one category, and the hub opens showing categories
> rather than a wall of widgets.

Every widget already belongs to exactly one category. What is missing is the second half — the hub
opening on categories — which H2 delivers. Nothing to build here beyond confirming no widget is
uncategorised, which a test now asserts.

### H2 — Category boxes with drop-down widget lists ✅

> Once widgets are sorted, each category is a box with a dropdown containing its widgets.
>
> **Behaviour when a category is selected:**
> - The other categories slide down out of the way
> - The selected category expands in place, filling the freed space
> - Its widgets display in a drop-down underneath itself

### H3 — Search widgets by category tags, not one flat list ✅

> Searching should not scan every widget across every category.
>
> **Instead:** each category carries the tags of its own widgets.
> - Categories with no matching keyword or phrase are hidden entirely
> - Within a matching category, widgets whose tags do not match are also hidden
> - Only relevant categories and relevant widgets remain on screen

### H4 — Auto-open categories that match a search ✅

> A category surfaced by a search should already be open. The user should not have to click into a
> category to see why it matched.

### H5 — Fade widgets and categories in and out — never pop ✅

> Keywords update in real time as the user types, so things are constantly appearing and
> disappearing.
>
> **Requirement:** a slight fade in / fade out on both widgets and categories. Without it the screen
> looks like items are popping in and out of existence — jittery and cheap-looking.

### H6 — Remember open/closed state across a search ✅

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

| | Item | What ships | Status |
|---|---|---|---|
| S1 | H1, H3 | Category-level tag aggregation + a filter returning categories with their surviving widgets. | ✅ 2026-08-27 |
| S2 | H4, H6 | `lib/hub/category-disclosure.ts` — the derived-state model above. | ✅ 2026-08-27 |
| S3 | H2, H5 | Collapsible boxes with fade transitions — in GridEditor, the palette that is actually mounted. See §5. | ✅ 2026-08-27 |

**All six shipped 2026-08-27.** `lib/hub/widget-catalog-filter.ts` (+`buildCategorySections`,
`categoryTags`, `categoryMatches`, `widgetTags`, `CATEGORY_ORDER`), `lib/hub/category-disclosure.ts`,
and `lib/hub/components/AddWidgetModal.tsx` rebuilt around them. 34 new tests; 1,959 hub tests green;
`tsc` and `next lint` clean.

### What the catalog does now

Opens on **11 closed boxes instead of 54 tiles**, each showing its own count so a closed box still
says how much is inside. Opening one pushes the rest down. The old filter-tab row is gone — a
single-selection filter and a set of openable boxes answered the same question twice, and the tabs
were the half that could only ever show you one category at a time.

Searching hides whole boxes and narrows the tiles inside the survivors; a narrowed box reads
"3 of 12" so a shortened list never looks like a category that lost widgets. A category matching on
its own **name** keeps everything in it — "cad" means *show me the CAD things*, not *CAD things whose
description also says cad*.

### Three things worth not re-deriving

**Disclosure stays two pieces of state.** The owner's worked example is a test, verbatim, and it
passes because clearing a search restores the previous state *by construction* — the search never
writes to user intent. Collapsing them back into one open-set reintroduces every edge case: searching
while searching, backspacing one character at a time, closing a box mid-search.

**Category tags are derived, never declared.** A hand-maintained tag list per category is a second
source of truth that goes stale the first time somebody adds a widget and forgets — and the failure
is silent, because a missing tag looks exactly like a search with no results.

**Role and bundle gating runs BEFORE the count is taken.** Otherwise a closed box advertises tiles
that vanish when you open it, which is worse than not showing them.

### Two bugs found while testing, one of them mine

**The query and the tags were normalised differently.** `widgetTags` splits on every non-alphanumeric
character, so "Today's Schedule" is stored as `today`, `s`, `schedule`. The matcher split the query on
whitespace alone, leaving the apostrophe attached — so **typing a widget's own label into the search
box returned nothing**. Found by a test that searches every widget's first label word against its own
category. Fixed by splitting the query the same way.

**`roles: []` is "no roles", not "every role"** — it gates away every widget declaring `allowedRoles`,
and makes 4 of the 11 categories vanish. That is correct behaviour that looked exactly like a broken
filter, and it produced three wrong assertions before a control assertion caught the real problem:
`allWidgets()` returns **0** unless `lib/hub/widgets/register-all` is imported, because every widget
registers itself from its own module. Without that control, twenty tests would have passed against an
empty catalog. A test now pins the gating difference so the next reader does not repeat it.


## 4. Not in scope

- The widget **grid** (drag, resize, reflow) is untouched. This is the catalog only.
- Re-categorising any widget. The 11 categories and their memberships are the owner's, not mine to
  change; if a widget is in the wrong box that is a separate, one-line note.

---

## 5. Correction — the first attempt landed on a component nothing mounts

**`AddWidgetModal` has no consumers.** `HubCanvas`'s own header says so: *"The old in-header
add-widget button, the AddWidgetModal mount, and the floating EditModeBar are gone"* — Slice 2 of the
hub overhaul retired it. The live palette is the left rail inside **`GridEditor`** (desktop) and
`MobileEditor` (mobile).

The first pass rebuilt the modal, and its wiring tests asserted *the modal imports the new modules* —
which was true, and useless. **They never checked that anything imports the modal.** The test stopped
one level short of the question that mattered, and only opening the hub in a browser revealed it:
clicking Customize Hub produced a completely different picker.

Redirected to `GridEditor`. `CATEGORY_LABELS` moved out of the modal into `widget-catalog-filter.ts`
so both surfaces read the same names. The chip markup — drag source, custom drag ghost sized to the
widget's grid footprint, ✓-placed state, duplicate-widget event, tooltip — is byte-identical; only
the structure around it changed.

### Three things the browser found that the tests could not

**The palette cannot open fully collapsed.** Three existing tests assert it renders widget entries at
rest, and that is this surface's contract rather than an accident: a left rail whose only purpose is
adding widgets, showing nothing until you click, is a regression. The first category opens by
default — still ~12 chips instead of 54.

**Opening one category hid the other ten.** Personal holds 12 chips, which pushed every remaining
header below the fold in a 621px rail — so the boxes cost you the overview they were meant to give.
The open list now scrolls inside itself (`maxHeight: 260`). Measured: **7 of 11 headers visible,
up from 1.**

**The caret rendered as a barely-visible dot** at 10px, and it is the affordance that says the row
opens. Now 12px in the primary ink.

### One a11y correction

A single `role="listbox"` cannot contain group headers — `role="option"` must be a direct child. So
each category carries its own listbox named for it, and the container keeps `role="group"
aria-label="Available widgets"` so the palette still has its accessible name. That also kept two
existing assertions passing on their own terms rather than being re-baselined.

### Verified in the browser, at 1440px

11 categories · one open · 12 chips instead of 54 · the group label intact. And **the owner's worked
example driven through the real UI**: Personal and CAD open → search "weather" → only Personal shown
and open → clear → Personal and CAD open again, exactly as before. `restoredExactly: true`.

`AddWidgetModal` is left as it is — improved but still unmounted. Deleting a retired component is a
separate decision, and it is now the better of the two if anyone ever remounts a catalog modal.


---

## 6. Mobile — the third surface

There are three widget-picking surfaces and the first pass did one. `MobileEditor` was the worst of
them: every addable widget in one column, on the smallest screen, **with no search field at all**.

Same collapsible categories, same disclosure model, plus the search it was missing. Two things fixed
that were not part of the ask: every row printed the **raw category slug** (mobile users were reading
*"time-pay"* and *"plat-subdivision"*, capitalised by CSS so it looked deliberate) — the header names
the category now and that line shows the widget description instead; and counts are taken **after**
already-placed widgets are removed, so Personal reads 9 rather than 12.

All eleven start **closed** here, unlike the desktop rail — a full-screen sheet fits all eleven
headers at once, so closed gives the whole map in one screen. Different surface, different right
answer.

Driven at 390px: 11 categories, search present, no raw slugs, 44px thumb targets, and the worked
example again — CAD and Learning open, search, clear, both open again. `restoredExactly: true`.
