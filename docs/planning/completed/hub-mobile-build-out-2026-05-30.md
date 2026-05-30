# Hub Mobile Build-Out — 2026-05-30

*Opened 2026-05-30 in response to the user's brief: "make sure the
widgets render well on mobile devices. We need the widget positioning
and size to translate to phone screens and similar devices … fully build
out the hub for mobile screens." Scope confirmed via question: **Foundation
only** (the user picked the smallest sensible scope — fix the broken
parts, don't ship a mobile editor) **plus grid + header polish**.*

## What the user has on mobile today (audit, 2026-05-30)

- `lib/hub/grid-math.ts` already collapses to **1 column at <640px** —
  every widget renders full-width 1×h stacked in saved order. **Good.**
- `lib/hub/components/WidgetGrid.tsx` makes cells **square** —
  `effectiveRowHeight = cellW`. On a 375px phone the column width IS
  the viewport, so a 1×1 widget is **~375px tall**. A `h=4` desktop
  widget becomes **~1500px tall**. The page is "one widget per
  screen-height" — the user has to scroll past every tile individually.
  **The core defect.**
- The widget body keys off `sizeBucket(w, h)`. On mobile, the grid
  passes `{w: 1, h: original_h}` → `sizeBucket(1, h)` returns **tiny**
  for h ≤ 2. So widgets render their tiny mode (a single stat) at full
  viewport width — looks wrong (a 375px-wide tile with one number in
  the middle). **The content-fit defect.**
- `WidgetCell` sets `overflow: hidden`. Lists that would scroll within
  the card on desktop just clip at the (huge) mobile row height.
  **The scroll defect.**
- `MobileBanner` already nudges users to "open on desktop to customize",
  matching the edit-on-desktop-only policy. **Kept.**
- `HubGreeting` uses `flex-wrap` so the heading + actions reflow already,
  but role pills can overflow on phones with many roles. **Polish needed.**

## Goals

1. Fix the row-height defect so a stacked mobile hub is **scannable** —
   not one-widget-per-screen-height, not so tall that the list of
   widgets reads as separate pages.
2. Fix the content-fit defect so widgets render their **small/medium**
   bucket on mobile (meaningful content + counts + first few rows),
   not their tiny stat-only bucket.
3. Fix the scroll defect so long widget content (assignments list,
   schedule, messages) **scrolls inside the card** instead of clipping
   or pushing the card to giant heights.
4. Polish the hub page header so the greeting + role pills + edit
   button row collapses sanely on phones.

## Out of scope (deferred)

- Mobile widget reorder / hide / add. (User picked "Foundation only".)
- A 2-column tablet pass (only 1-col mobile + 4-col tablet + 8-col
  desktop today; that's fine for now).
- A redesign of the customize-hub catalog UI for phones.

## Slices

### Slice 1 — Mobile row heights (the core fix) ✅ shipped 2026-05-30

- Added `MOBILE_BASE_ROW_PX = 88` to `lib/hub/grid-math.ts`.
- `WidgetGrid` now branches: `breakpoint === 1` →
  `gridAutoRows: minmax(${MOBILE_BASE_ROW_PX}px, max-content)`; 4/8-col
  desktop + tablet still use `${effectiveRowHeight}px` (square cells).
- Result: a 1×1 widget on mobile is 88 px tall instead of viewport-tall;
  a 1×4 is 352 px tall (4 × 88) instead of 1500+ px; widgets whose
  content needs more height expand via `max-content` (the next slices
  upgrade what fits there).
- 3 specs added; full hub suite (1672) green; typecheck + lint clean.

### Slice 2 — Mobile bucket override ✅ shipped 2026-05-30

- Added the pure `mobileSizeOverride(size, breakpoint)` helper to
  `grid-math.ts`. Returns the size unchanged on desktop / tablet; at
  `breakpoint === 1` returns `{w: 2, h: max(h, 2)}` so the area math
  in `sizeBucket` lands in `small` (area ≤ 6) or `medium` (area ≤ 12)
  instead of the `tiny` (area ≤ 2) bucket every full-width widget
  currently fell into.
- `WidgetGrid` passes the post-override size to `<MemoWidgetRender>`.
  Per-widget bodies didn't need to change — every widget already has
  a `small` and `medium` render that's the canonical content target
  for mobile.
- Bucket progression on mobile: `h=1→small`, `h=2→small`, `h=3→small`,
  `h=4→medium`, `h=6→medium`. Lists + counts unlocked at every saved
  desktop height.
- 6 specs added (override math + bucket landing + the source-regex
  wiring); full hub suite (1677) green; typecheck + lint clean.

### Slice 3 — Mobile scroll inside the card ✅ shipped 2026-05-30

- `WidgetCell.cellStyle.overflow` is now
  `breakpoint === 1 ? 'auto' : 'hidden'`. Desktop / tablet keep the
  strict-grid clip (a widget can never visually spill past its cell);
  mobile cards scroll their content internally so a 10-row assignments
  list reads as a scrollable card instead of clipping or stretching
  the row track to ~1000 px via `max-content`.
- The Slice-3 readonly test's literal-overflow regex relaxed to the
  string `'hidden'` (it's still there — just inside the ternary). The
  "no edit-mode outline" assertion is unchanged.
- 1 spec added; full hub suite (1678) green; typecheck + lint clean.

### Slice 4 — Header polish + role-pill scroll fallback ✅ shipped 2026-05-30

- Added a phone-only (`@media (max-width: 640px)`) block to
  `app/admin/me/AdminMe.css` on top of the existing 768 px stack rule:
  - `.hub-page` padding tightened to `1.25rem 0.75rem` so widget cards
    fill the full width without inset shadow margins.
  - `.hub-panel` padding + radius tightened so the greeting card
    doesn't eat a third of a 375 px screen before the canvas starts.
  - `.hub-greeting__heading` font-size drops to `1.35rem` (from
    `var(--text-2xl)` ≈ 1.5 rem) — fits "Good evening, Jacob" on one
    line at 360 px.
  - `.hub-greeting__role-pills-list` becomes a **swipeable horizontal
    strip** (`flex-wrap: nowrap; overflow-x: auto`), scrollbar hidden
    on both Firefox + WebKit. A surveyor with 6 + roles no longer
    gets a 4-line pill stack pushing the widget canvas off the fold.
  - Each `.hub-greeting__role-pill` is pinned at `flex: 0 0 auto` so
    the strip never squashes them.
- The Customize-Hub button stays hidden on mobile per the existing
  `useIsMobile` gate in `EditMode.tsx`. Edit on desktop is the policy.
- 6 specs added (balanced-brace block slicer + each polish rule);
  full hub suite (1684) green; typecheck + lint clean.

## All slices shipped — hub-mobile-build-out complete (2026-05-30)

Four slices: 88 px mobile row base (replaced viewport-tall square
cells), bucket override to `small`/`medium` (so widgets render lists +
counts instead of single stats), in-card scroll on mobile (long content
scrolls inside the card instead of clipping or stretching), and the
phone-only greeting polish (slimmer card + swipeable role-pill strip).
The saved-layout shape is unchanged; desktop and mobile read the same
layout row. Edit stays desktop-only per the user's "Foundation only"
scope answer.

## Guardrails

- Don't change the saved-layout shape (`{x,y,w,h,customization}`).
  Desktop layouts continue to load and render on mobile.
- Don't change widget bodies (every widget body already handles tiny
  → xlarge; the bucket override does the work).
- Per slice: typecheck + lint + commit + push + annotate this doc.
- Edit-on-desktop-only stays the policy (consistent with the user's
  "Foundation only" answer).

## TL;DR

Four small slices: row heights, content-sized widgets via a bucket
override, in-card scroll, header polish. The user's saved layout
already drives the mobile order; we're just fixing the three defects
that make today's mobile render look broken.
