# Calendar polish — 2026-06-16

> **Goal.** The job calendar at `/admin/calendar` shipped fully wired
> (see `docs/planning/completed/job-calendar-2026-06-16.md`). This plan
> layers polish on top: motion + animation that signals interaction,
> better loading + empty states, a keyboard cheat sheet, a print
> stylesheet, and a fullscreen-mode refresh indicator.
>
> **Constraint.** Every effect must be additive — no behavior changes
> to the calendar's data flow or routing. Pure CSS / small UI-only
> React additions. Source-locked at the same level as the original
> calendar slices so a future motion-reduction refactor can lift them
> behind `prefers-reduced-motion` without ripping out structure.
>
> **Counterpart.** Anything that touches the admin styling contract
> (`docs/admin-styling-contract.md`) must use canonical tokens.

## What exists today

From the just-shipped job-calendar plan:
- `/admin/calendar/page.tsx` — Month / Week / Day views, view switcher,
  year/month dropdowns, fullscreen toggle, phase legend with visibility
  toggles, prev/today/next nav.
- `app/admin/styles/Calendar.css` — all calendar styling, including the
  big-screen `data-display-mode='big-screen'` mode.
- `lib/calendar/{month-grid, week-grid, phase-event, phase-reminder,
  lead-to-job}.ts` — all pure helpers, source-locked.
- `__tests__/calendar/` — 170 assertions across the seven calendar
  slices.

## What this plan ships

| Piece | Status | Slice |
|---|---|---|
| Hover lift + transitions on event pills | MISSING | **P1** |
| View-switch fade-in for the new view | MISSING | **P1** |
| Today-cell pulse / soft ring animation | MISSING | **P1** |
| Legend chip filtered-state transition | MISSING | **P1** |
| `prefers-reduced-motion` honor | MISSING | **P1** |
| Skeleton loader during fetch (instead of bare grid) | MISSING | **P2** |
| Per-view empty states (no events this month/week/day) | MISSING | **P3** |
| Keyboard shortcuts cheat sheet (press `?` to open) | MISSING | **P4** |
| Print stylesheet for monthly schedule | MISSING | **P5** |
| Auto-refresh indicator in fullscreen mode | MISSING | **P6** |

## Phase P — Calendar polish

**P1 shipped 2026-06-16** — motion + transitions in
`app/admin/styles/Calendar.css`:
- Event pills: 1px lift on hover via `translateY(-1px)` + soft
  brand-navy shadow. 120ms ease for hover, transitions on
  transform / background-color / box-shadow.
- Month cells: subtle shadow + border transition on hover so a
  busy grid telegraphs interactivity without visual noise.
- View-switch fade-in: `@keyframes calendar-view-fade-in`
  (opacity 0→1, 2px translateY) applied to every grid container
  (`.calendar-month__grid`, `.calendar-week`, `.calendar-day`).
- Today pulse: `@keyframes calendar-today-pulse` — a soft ring
  (rgba brand-navy 12%) that breathes every 4s. Slowed to 6s in
  fullscreen big-screen mode so a wall TV reads quieter at
  distance. Applied to both the month cell AND the week day
  column.
- Legend chip transition: opacity + line-through cross-fade
  (160ms / 200ms easings).
- Brand-navy `:focus-visible` rings on every nav row interactive
  (nav buttons, view switcher, picker selects, legend chips).
- Vestibular-safe `@media (prefers-reduced-motion: reduce)`
  block collapses every transition + animation to ~0ms and
  disables the hover-lift transform so the OS preference always
  wins.
- Source-locked by `__tests__/calendar/p1-animations.test.ts` (14
  assertions: hover transitions, view-fade keyframes + targets,
  today pulse on month + week + big-screen, legend chip
  transition, focus-ring set, reduced-motion block + hover-lift
  disable, no-drift token check).

Full suite after P1: 8479 green (+14).

### P1 — Animations + transitions
- Event pill hover: 2-px lift via `transform: translateY(-1px)` +
  shadow appears. Smooth 120ms ease.
- View switcher: the new view fades in via a short opacity ramp
  keyed off the `data-view` attribute changing. Pure CSS animation.
- Today cell: soft ring pulse on the brand-navy outline (every 4s,
  subtle so it doesn't distract on a wall TV).
- Legend chip: smooth opacity + line-through cross-fade when
  toggling `data-hidden`.
- Focus rings: tighter `:focus-visible` styling on every interactive
  element (nav buttons, view switcher, legend chips, picker selects).
- Honor `@media (prefers-reduced-motion: reduce)` — every animation
  collapses to instantaneous so vestibular sensitivities are
  respected. Tests lock the presence of the media query so a future
  PR can't reintroduce always-on motion.

**P2 shipped 2026-06-16** — skeleton loader during fetch.
- `app/admin/calendar/page.tsx`:
  - Page root carries `data-fetching={loading ? 'true' :
    undefined}` so the CSS chip + sweep both key off one
    attribute on one element.
  - Loading chip rendered next to the title with
    `role="status"` + `aria-live="polite"` so screen readers
    hear "Loading" without interruption. Text mirrors the
    `loading` state so it goes blank when fetch completes.
- `app/admin/styles/Calendar.css`:
  - `@keyframes calendar-shimmer-sweep` — a translucent navy
    gradient that slides left-to-right across each grid
    container (month / week / day) while `data-loading='true'`.
    Pointer-events: none so users can still tap events
    behind the overlay.
  - `@keyframes calendar-shimmer-pulse` — the chip's leading
    8px dot pulses at brand navy 35→100% opacity.
  - Phone breakpoint hides the sweep overlay (chip alone
    carries the signal — the stacked day list doesn't have a
    clean shape for a sweep).
  - Reduced-motion fallback pauses both sweep + pulse;
    overlay collapses to a static 4% tint, chip dot stays
    visible at 100% opacity.
- Source-locked by `__tests__/calendar/p2-skeleton-loader.test.ts`
  (13 assertions: page wiring (data-fetching, chip a11y),
  sweep keyframes + targets + pointer-events guard, chip
  opacity ramp + pulse, phone hide, reduced-motion pause).

Full suite after P2: 8492 green (+13).

### P2 — Skeleton loader
- When `data-loading='true'`, the month/week/day grid renders a
  semi-translucent shimmer over each cell instead of staying empty.
- Phone breakpoint: a single shimmering "Loading…" row above the
  list instead of the grid shimmer.
- Source-locked: `data-state='loading'` block with the shimmer
  classes.

**P3 shipped 2026-06-16** — per-view empty states.
- `app/admin/calendar/page.tsx`:
  - Derives `noFetchedEvents` (window genuinely empty) +
    `allEventsHidden` (legend filters hid everything) as
    distinct conditions so the copy can match the cause.
  - `emptyKind` discriminates between the two; `emptyMessage`
    swaps the view word (month / week / day) in the no-events
    case.
  - Renders an empty-state banner ABOVE the grid (not in
    place of it) so the grid keeps its navigation context;
    a blank square otherwise reads as "broken".
  - Banner is `role="status"` + `aria-live="polite"` for
    screen readers + carries
    `data-empty-kind={'no-events' | 'all-hidden'}` for the
    CSS hook + `data-testid="calendar-empty-state"` for
    source-locking.
  - "Open a job → Schedule →" CTA renders only on the
    no-events case (the all-hidden case is fixed by the
    legend, not the jobs page) and carries
    `data-action="open-jobs-from-empty"`.
- `app/admin/styles/Calendar.css`:
  - Banner uses canonical bg-subtle + brand-navy left
    border. `[data-empty-kind='all-hidden']` flips the
    border to amber/warning so the cause is visually
    distinct from "no events".
  - CTA inverts to brand-navy bg + on-brand text on hover.
  - `@keyframes calendar-empty-fade-in` (200ms ease) so the
    banner doesn't pop after a fetch completes.
  - Phone breakpoint stacks the CTA below the message so
    neither truncates.
  - Reduced-motion fallback disables the fade.
- Source-locked by `__tests__/calendar/p3-empty-states.test.ts`
  (15 assertions: derivation logic, view-word swap, both copy
  variants, banner placement above grid, accessibility,
  conditional CTA, data-attrs, banner styling, kind-based
  border flip, hover invert, keyframes, phone stack, reduced-
  motion, no-drift token check).

Full suite after P3: 8507 green (+15).

### P3 — Per-view empty states
- Month view, no events: a friendly "📅 No scheduled phases this
  month. Open a job's Schedule tab to add some." with a link to the
  jobs page.
- Week / day view, no events: same shape, narrower copy.
- Phase legend filtered everything out: a distinct "All phases
  hidden — tap a chip above to show again" hint.

**P4 shipped 2026-06-16** — keyboard shortcuts cheat sheet
modal makes the P1-shipped shortcuts discoverable.
- `app/admin/calendar/page.tsx`:
  - `showCheatSheet` state + `?` button in the nav row
    (`data-action="toggle-cheat-sheet"`, `aria-haspopup="dialog"`,
    `aria-expanded` mirrors state).
  - Keydown handler extended: `?` toggles, `Escape` closes when
    open. `showCheatSheet` added to the effect's deps so Esc reads
    fresh state.
  - Modal renders as `role="dialog"` + `aria-modal="true"` with a
    backdrop click-outside that ONLY closes when
    `e.target === e.currentTarget` (descendant clicks survive).
  - Dynamic `Previous / next {navLabel}` row mirrors the active
    view so the hint matches what `←`/`→` actually do.
  - Lists every shortcut the calendar wires: ←, →, T, M, W, D, F,
    ?, Esc. Foot disclaimer notes the input-field skip.
- `app/admin/styles/Calendar.css`:
  - Fixed-inset backdrop (rgba navy 45%) + flex centering.
  - Inner panel: card surface, max-height 80vh + overflow scroll,
    18px y-axis brand-aware shadow, `min(440px, 100%)` width so
    a phone gets a full-width modal.
  - Two-col shortcut grid (`max-content 1fr`). `<kbd>` chips
    styled mono with a bottom-heavy double border for the keycap
    look.
  - `@keyframes calendar-cheat-fade-in` (backdrop opacity ramp) +
    `@keyframes calendar-cheat-pop-in` (panel 8px-rise + scale).
  - Reduced-motion fallback disables both modal animations.
- Source-locked by `__tests__/calendar/p4-cheat-sheet.test.ts`
  (18 assertions: state declaration, ? + Esc key handling, effect
  deps, ARIA on the button + dialog, click-outside guard, all
  nine shortcut rows present, dynamic nav-label caption,
  data-action targets, modal styling contract, kbd chip styling,
  keyframes, reduced-motion, no-drift token check).

Full suite after P4: 8525 green (+18).

### P4 — Keyboard shortcuts cheat sheet
- A small `?` button at the right end of the nav row.
- Press `?` (no modifiers) OR click the button → opens a modal
  listing every shortcut already wired (← → t f m w d). Modal closes
  on Esc / click outside / `?`.
- Source-locked: button presence, key handler, modal contents.

**P5 shipped 2026-06-16** — print stylesheet + Print button.
- `app/admin/calendar/page.tsx`:
  - 🖨 Print button in the nav row (`data-action="print-calendar"`,
    `aria-label="Print calendar"`). Calls `window.print()` guarded
    against SSR (`typeof window !== 'undefined'`).
- `app/admin/styles/Calendar.css`:
  - `@media print` block hides every on-screen-only surface
    (`.calendar-page__nav`, `.calendar-page__legend`,
    `.calendar-page__loading-chip`,
    `.calendar-page__cheat-sheet-backdrop`,
    `.calendar-page__empty`) + the admin chrome
    (`.admin-sidebar`, `.admin-topbar`).
  - Page reset: white background, black text, 11pt body type,
    0.5cm padding, header underlined, title at 18pt.
  - Month grid: 2.4cm minimum row height, page-break-inside:
    avoid on each cell so a week never splits across pages.
  - Surrounding-month days fade to #999 so the focus month
    reads on paper.
  - Event pills keep their `--phase-color` left border so color
    survives the printout; greyscale prints just see a darker
    left edge but still parse by phase.
  - Timed-event pills get a 1px black border for legibility.
  - `@page { margin: 1cm }` so the grid breathes on letter/A4.
  - Big-screen mode rules reset to printable white-on-black
    (no host-page gradient artefacts).
  - Every animation + transition paused with
    `*, *::before, *::after { animation-duration: 0s !important
    }` so the printer snapshots stable layout.
- Source-locked by `__tests__/calendar/p5-print-stylesheet.test.ts`
  (12 assertions: button ARIA + SSR-guarded handler, @media
  print declaration, full hide list for on-screen surfaces,
  admin chrome hide, page reset, page-break contract, phase-
  color border preservation, animation pause, @page margins,
  big-screen reset, surrounding-month fade).

Full suite after P5: 8537 green (+12).

### P5 — Print stylesheet
- `@media print` block: hide the nav row, hide the legend, expand
  cells to full grid height, force black-on-white text, keep phase
  accent strips visible.
- A "Print" button next to fullscreen calls `window.print()`. Open
  the calendar in print-preview and a clean month view comes out.

**P6 shipped 2026-06-16** — wall-TV refresh indicator. A small
brand-green dot in the top-right corner glows once around each
5-min auto-refresh fetch, then fades. Lets a viewer at 8 ft
confirm the calendar is alive, not frozen on stale data.
- `app/admin/calendar/page.tsx`:
  - Distinct `refreshing` state (separate from `loading`) so the
    indicator only fires around an AUTO-refresh, not the
    initial mount or a view-change refetch.
  - Auto-refresh interval flips
    `setRefreshing(true) → load().finally(() => setTimeout(() =>
    setRefreshing(false), 1200))` so the CSS glow has room to
    play out before the flag clears.
  - Page root carries
    `data-refreshing={refreshing ? 'true' : undefined}`.
  - Decorative dot element rendered with `aria-hidden` (it's a
    visual heartbeat; the existing loading chip handles
    screen-reader signaling).
- `app/admin/styles/Calendar.css`:
  - Dot is `position: fixed` top-right, `opacity: 0` by default,
    success-token green so it reads as a healthy heartbeat.
  - Visibility gated on the COMPOUND selector
    `.calendar-page[data-display-mode='big-screen'][data-refreshing='true']`
    so the dot stays invisible in normal admin use and only
    surfaces on the wall TV.
  - `@keyframes calendar-refresh-glow` — 1.2s expanding green
    ring (`box-shadow: 0 0 0 18px rgba(...,0)` at 60%) +
    `transform: scale(1.4)` peak.
  - Reduced-motion fallback keeps the dot visible (the status
    signal matters) but skips the expanding ring.
  - Print stylesheet hides the dot — wall-TV-only signal.
- Source-locked by
  `__tests__/calendar/p6-refresh-indicator.test.ts` (12
  assertions: distinct refreshing state, flag flip only inside
  auto-refresh, mount path unchanged, root data attribute, dot
  ARIA + testID, CSS position + default invisibility, success
  color, compound visibility gate, keyframes, reduced-motion
  preservation, print hide, no-drift check).

Full suite after P6: 8549 green (+12).

### P6 — Auto-refresh indicator
- In fullscreen mode only: a small pulsing dot in the corner that
  flashes briefly when the 5-min auto-refresh fires, then fades. So
  a wall-TV viewer can confirm the calendar is live, not frozen.
- Pure CSS animation triggered by a `data-refreshing='true'`
  attribute the React side flips on/off around each fetch.

## Slice order

1. **P1** — animations + transitions (biggest visible polish win)
2. **P2** — skeleton loader (perceived performance)
3. **P3** — empty states (utility — blank squares feel broken)
4. **P4** — keyboard cheat sheet (discoverability of P1 shortcuts)
5. **P5** — print stylesheet (office utility)
6. **P6** — fullscreen refresh indicator (wall-TV trust)

## TL;DR — final state (2026-06-16)

| Surface | Status |
|---|---|
| Calendar wiring | **DONE** (previous plan) |
| Hover lift + view fade-in + today pulse + reduced-motion | **SHIPPED — P1** |
| Skeleton loader sweep + loading chip | **SHIPPED — P2** |
| Per-view empty states (no-events / all-hidden) | **SHIPPED — P3** |
| Keyboard cheat sheet modal (? to open) | **SHIPPED — P4** |
| Print stylesheet + 🖨 button | **SHIPPED — P5** |
| Wall-TV refresh indicator dot | **SHIPPED — P6** |

**Total slices shipped:** P1, P2, P3, P4, P5, P6 = **6 slices, 85
source-lock assertions added, full suite went from 8465 → 8549
green (+84 from this plan).**

Every action item shipped — no deferrals needed. The doc moves to
`docs/planning/completed/` in the same commit.
