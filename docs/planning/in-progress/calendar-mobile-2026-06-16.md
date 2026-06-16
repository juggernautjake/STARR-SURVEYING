# Calendar mobile polish — 2026-06-16

> **Goal.** Make `/admin/calendar` actually usable on a phone — not
> just "renders without breaking" but "is the best way to check
> tomorrow's field schedule on the way to a job". The calendar polish
> plan that just shipped (P1–P6) was desktop-focused; this plan is
> phone-first.
>
> **Direction.** Reorganize the cramped 11-item toolbar for phone,
> add touch swipe gestures for prev/next nav, optimize each view for
> portrait, ensure every interactive target hits 44pt per Apple HIG.
> No data-flow changes — additive only.
>
> **Constraint.** Keep desktop perfect. Every phone rule lives inside
> a `@media (max-width: 768px)` block; desktop behaviour stays
> byte-identical.

## What the audit found

Visible problems on a phone today:
1. **Toolbar.** 11 elements (3-button view switcher + month select +
   year select + prev/today/next + fullscreen + print + ?). On a
   320–390 px wide screen, that wraps into a chaotic 3–4 row mess.
2. **Touch targets.** Most nav buttons are 36 px tall — below the
   Apple HIG 44 pt minimum.
3. **Week view density.** 7 columns × hour rows on a phone is
   illegible — columns are ~40 px wide.
4. **Day view header.** No swipe; you have to thumb to the top-right
   "→" button to advance.
5. **Cheat sheet.** Modal sized for desktop; on a phone the
   `min(440px, 100%)` makes it readable, but the close-button hit
   area is small.
6. **No native mobile patterns** — no swipe-to-navigate, no
   long-press menus, no pull-to-refresh.

## What this plan ships

| Piece | Status | Slice |
|---|---|---|
| Phone-friendly toolbar layout | MISSING | **M1** |
| 44pt touch targets on every interactive | MISSING | **M1** |
| Swipe-left/right to nav prev/next | MISSING | **M2** |
| Week view phone optimization (3-day window) | MISSING | **M3** |
| Day view phone polish (large hour rows + sticky day header) | MISSING | **M4** |
| Cheat sheet modal mobile sizing | MISSING | **M5** |

## Phase M — Mobile

**M1 shipped 2026-06-16** — phone toolbar + 44pt targets.
- `app/admin/styles/Calendar.css` `@media (max-width: 768px)`
  block extended:
  - `.calendar-page__header` switches to
    `flex-direction: column` so the title sits above the nav.
  - Title scales to `--text-xl` to fit comfortably.
  - `.calendar-page__nav` becomes full-width with
    `justify-content: space-between` so prev / next anchor at the
    edges of the row — the thumb naturally lands on them.
  - `.calendar-page__view-switcher` flexes to its own line
    (`flex: 1 1 100%`) so it doesn't compete with the nav row;
    each pill takes `flex: 1` with `min-height: 44px`.
  - Month + year pickers hide on phone — prev/next is the better
    gesture on small screens, and M2's swipe wires the same nav.
  - Every nav button forces `min-height: 44px` + `min-width: 44px`
    (Apple HIG + glove-friendly).
  - Trailing action triplet (fullscreen + print + cheat sheet)
    collapses into 44×44 icon-only squares via
    `flex: 0 0 44px`.
  - Prev / today / next get `flex: 1 1 auto` so they share the
    middle row evenly.
- Source-locked by
  `__tests__/calendar/m1-mobile-toolbar.test.ts` (8 assertions:
  header stack, nav row width + space-between, view switcher
  full-width + 44pt, picker hide, universal 44pt floor, icon-only
  trailing buttons, prev/today/next flex-fill).

Full suite after M1: 8557 green (+8).

### M1 — Phone toolbar + 44pt targets
- Reorganize the toolbar into two stacked rows on phone:
  - Row 1: title + view switcher (full-width pill set)
  - Row 2: prev / today / next + fullscreen + print + ?
- Drop the month / year picker selects on phone — replaced by big
  prev/next which is the natural pattern anyway. (Picker stays on
  desktop.)
- Force every button + select to `min-height: 44px` on phone.
- Nav row layout via flexbox `justify-content: space-between` so the
  hand naturally reaches prev/next at the edges.
- Title gets `font-size: var(--text-xl)` to fit comfortably.

**M2 shipped 2026-06-16** — touch swipe gestures + edge ghost
indicators.
- `app/admin/calendar/page.tsx`:
  - `swipeDx` state tracks horizontal drag delta in px.
  - Pointer-event-based effect on the calendar root: pointerdown
    records start (x, y, time); pointermove updates `swipeDx`
    once motion clearly horizontal (>20 px AND |dx| > |dy|);
    pointerup checks the threshold contract and fires
    `goPrev()` (right swipe) or `goNext()` (left swipe).
  - Constants: `SWIPE_THRESHOLD_PX = 50`, `SWIPE_MAX_MS = 300`,
    `GHOST_REVEAL_PX = 20`.
  - Skips mouse pointer types so desktop UX is unchanged.
  - Skips gestures that start on a button / link / input /
    select / textarea / dialog so nested interactives keep
    their own click handling.
  - Effect depends on `goPrev, goNext` so it rebinds when the
    view changes (those callbacks close over `view`).
  - Two edge-ghost spans (◀ / ▶) with stable testIDs +
    `aria-hidden`. Opacity ramps via inline style based on
    `swipeDx` direction + magnitude; ghost reveals once
    `|swipeDx| > 20` and grows to full opacity at 100 px.
- `app/admin/styles/Calendar.css`:
  - `.calendar-page__swipe-ghost` is a 56 px brand-navy
    circle, `position: fixed`, `pointer-events: none`.
  - Desktop: `display: none` so the gesture stays invisible.
  - Phone (`max-width: 768px`): `display: flex`.
  - Reduced-motion: opacity transition disabled (still works,
    just no fade).
  - Print stylesheet hides the ghosts.
- Source-locked by
  `__tests__/calendar/m2-swipe-gestures.test.ts` (18
  assertions: state declaration, all four pointer listeners,
  mouse skip, interactive-target skip, threshold constants,
  horizontal dominance contract, direction → goPrev/goNext
  mapping, effect deps, ghost testIDs + aria-hidden, opacity
  ramps in both directions, CSS position + brand fill +
  desktop hide + phone show + pointer-events guard +
  reduced-motion + print hide).

Full suite after M2: 8575 green (+18).

### M2 — Swipe gestures
- Pointer-event based swipe handler on the calendar root.
- Threshold: 50 px horizontal travel + <300 ms duration + |dy| < dx.
- Left swipe → `goNext`; right swipe → `goPrev`.
- Visual hint: a small ◀ / ▶ ghost icon fades in at the edge during
  the drag (≥ 20 px travel) so the user knows the gesture is
  registering.
- Respects `prefers-reduced-motion` (no edge-ghost animation; swipe
  still works).

**M3 shipped 2026-06-16** — week view phone optimization via
horizontal scroll-snap (replaced the planned "3-day window + day-
pill nav" since horizontal scroll feels more native and reuses
the existing 7-day data model).
- `app/admin/calendar/page.tsx`:
  - Week wrapper carries `data-swipe-skip="true"` so the M2
    page-level swipe gesture doesn't double-fire when the user
    scrolls horizontally inside the week body.
  - M2's `isInteractive` skip list extended to include
    `[data-swipe-skip="true"]` so any future surface can opt out
    of the page-level swipe by adopting the same attribute.
- `app/admin/styles/Calendar.css` `@media (max-width: 768px)`:
  - `.calendar-week` becomes the horizontal scroll container:
    `overflow-x: auto`, `scroll-snap-type: x mandatory`,
    iOS momentum scroll.
  - All three inner sections (`__header`, `__all-day`, `__body`)
    share `grid-template-columns: 4rem repeat(7, 30vw)` so 3.3
    days fit in the viewport at a time + the grid actually
    overflows for scrolling (`width: max-content`). Sections
    scroll together as siblings of the scroll parent.
  - Hour gutter is `position: sticky; left: 0` with opaque
    `--color-bg-card` background so labels stay anchored as
    the user pans through days.
  - Day headers + day columns + all-day cells get
    `scroll-snap-align: start` so the scroll lands on day
    boundaries (no half-day windows).
  - Hour rows fatten to `minmax(3rem, 1fr)` on body, day col,
    and gutter so a timed event is thumb-tappable.
  - Today's day-col outline gets `outline-offset: -3px` so it
    stays visible inside the scrolling parent.
  - Print stylesheet resets the scroll: `overflow-x: visible`
    on the wrapper, `grid-template-columns: 4rem repeat(7, 1fr)`
    on the sections, and `position: static` on the hour
    gutter so all 7 days print side-by-side as designed.
- Source-locked by `__tests__/calendar/m3-week-view-phone.test.ts`
  (12 assertions: data-swipe-skip on the wrapper, M2 selector
  update, scroll-snap on .calendar-week, shared column template
  with width: max-content, sticky hour gutter, scroll-snap-align
  on day siblings, fat hour rows on body/day-col/gutter,
  today-outline visibility fix, all three print resets).

Full suite after M3: 8601 green (+12).

### M3 — Week view phone optimization
- On phone, week view drops to a 3-day window centered on today (or
  on the focused day if not today).
- A small "day-pill" sub-nav above the grid lets the user pick which
  3-day window to show.
- Hour rows get bigger height (3rem each) so timed events have room.

**M4 shipped 2026-06-16** — day view phone polish.
- `app/admin/calendar/page.tsx` `renderDay()`:
  - New `.calendar-day__day-header` block above the all-day
    strip. Shows weekday (uppercased label), date numeral, and
    a `Today` pill when `dayCell.isToday`. Stable testID
    (`calendar-day-header`) + `data-today` attribute mirror
    isToday for the styling hook.
- `app/admin/styles/Calendar.css`:
  - Header surface: card background, brand-navy left border +
    brand-navy date when today, right-aligned brand-navy
    "Today" pill.
  - **Phone**:
    - `position: sticky; top: 0` so the date stays visible
      while the user scrolls the hour grid (the page title
      scrolls out of view on a phone; this keeps orientation).
    - Date numeral scales to `--text-2xl`.
    - All-day cell flips to `flex-direction: row` with
      `overflow-x: auto` + iOS momentum scroll so multiple
      chips don't break the layout.
    - Hour rows fatten to `minmax(3.5rem, 1fr)` on both the
      day column AND the gutter — a thumb can reach a 30-min
      event without zooming.
    - Day body grid: hour gutter shrinks from 4 rem to 3 rem
      so events get more horizontal room.
  - Print: header reverts to `position: static` (no floating
    on paper).
- Source-locked by `__tests__/calendar/m4-day-view-phone.test.ts`
  (14 assertions: header markup + testID, data-today + weekday
  + date + Today pill, header CSS surface, today brand-navy
  styling, pill on-brand colors, phone sticky position, phone
  date scaling, phone fat hour rows, gutter shrink, all-day
  row scroll, print reset, no-drift token check).

Full suite after M4: 8589 green (+14).

### M4 — Day view phone polish
- Sticky day header (weekday + date) at the top while scrolling.
- 3.5rem hour rows on phone.
- All-day strip becomes a horizontally scrollable chip list when it
  overflows.

### M5 — Cheat sheet mobile sizing
- Modal goes full-screen on phone (no backdrop padding).
- Close button is 44pt × 44pt.
- Bottom inset for home-bar phones.

## Slice order

1. **M1** — toolbar + 44pt (largest visible win; unblocks every
   other interaction)
2. **M2** — swipe gestures (biggest native-feel win)
3. **M4** — day view phone polish (lowest risk, daily-use win)
4. **M3** — week view 3-day window (more involved — touches view
   rendering)
5. **M5** — cheat sheet polish (small cleanup, low priority)

## TL;DR

| Surface | Status |
|---|---|
| Calendar wiring + polish | **DONE** (prior plans) |
| Mobile toolbar + 44pt targets | **MISSING → M1** |
| Swipe gestures | **MISSING → M2** |
| Week view phone optimization | **MISSING → M3** |
| Day view phone polish | **MISSING → M4** |
| Cheat sheet mobile sizing | **MISSING → M5** |
