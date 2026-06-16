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

### P4 — Keyboard shortcuts cheat sheet
- A small `?` button at the right end of the nav row.
- Press `?` (no modifiers) OR click the button → opens a modal
  listing every shortcut already wired (← → t f m w d). Modal closes
  on Esc / click outside / `?`.
- Source-locked: button presence, key handler, modal contents.

### P5 — Print stylesheet
- `@media print` block: hide the nav row, hide the legend, expand
  cells to full grid height, force black-on-white text, keep phase
  accent strips visible.
- A "Print" button next to fullscreen calls `window.print()`. Open
  the calendar in print-preview and a clean month view comes out.

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

## TL;DR

| Surface | Status |
|---|---|
| Calendar wiring | **DONE** (previous plan) |
| Hover lift + view fade-in + today pulse | **MISSING → P1** |
| Skeleton loader | **MISSING → P2** |
| Empty states | **MISSING → P3** |
| Keyboard cheat sheet | **MISSING → P4** |
| Print stylesheet | **MISSING → P5** |
| Refresh indicator | **MISSING → P6** |
