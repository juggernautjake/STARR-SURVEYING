# Hub grid — 8×8 square cells + per-widget responsive formatting

*Opened 2026-05-29 as a direct follow-up to
`hub-editor-performance-and-ux-2026-05-29.md` (Slices 198–208).*

## What the user asked for

> "The widget editor is splitting the page into 10×4. I want it to
> be 8×8, but still fill up the space. Make every widget format its
> contents properly based on the width and height of the widget.
> Some widgets should have a limitation on how small they are. If a
> widget is one square tall and wide, it should actually render as
> one square. If 2 wide × 1 tall, then twice the width of its
> height. I want the width and height shown in the editor to
> actually represent what is seen on the page. Refactor the
> formatting. Focus on making widgets be well formatted no matter
> what configuration or size. Dynamic formatting for each defined
> widget."

Five concrete asks:

1. **Grid becomes 8 columns × up to 8 rows** instead of 12×4.
2. **Cells are square** — a 1×1 widget renders as a literal square,
   a 2×1 is twice the width of its height.
3. **Grid still fills the available width** (so cell width scales
   with the canvas; the row height tracks it).
4. **Editor preview matches on-page reality** — the SizeGridPicker
   shows the same proportions the user will see in the canvas.
5. **Per-widget dynamic formatting** — every widget already buckets
   its render via `sizeBucket()`, but several widgets either render
   the same content for every bucket or overflow at small sizes.

## What already exists (no need to rebuild)

| Piece | Where it lives |
|-------|----------------|
| 12-col grid math | `lib/hub/grid-math.ts` (lines 18, 27, 38) |
| Fixed `DEFAULT_ROW_HEIGHT = 64px` | `lib/hub/components/WidgetGrid.tsx` line 64 |
| Container ResizeObserver → `cellW` | `WidgetGrid.tsx` lines 95–110 (Slice 202) |
| SizeGridPicker (12×4 hardcoded) | `lib/hub/components/settings/SizeGridPicker.tsx` |
| `sizeBucket(w, h)` 5-bucket area-based | `lib/hub/size-bucket.ts` |
| 43 widgets sized for 12-col | `lib/hub/widgets/<id>/index.tsx` |

## Phases + slices

### Phase 34 — 8×8 grid + square cells (Slice 209)

#### Slice 209 — 8-col grid, square cells, rescaled widgets ✅ shipped
- **Scope:** Five changes in one cohesive commit because they have
  to land together — a half-shipped state leaves the editor broken.
  (a) `grid-math.ts`: `GridBreakpoint` becomes `8 | 4 | 1`,
  thresholds rebalanced; `collapseLayout` halves widths into 4-col,
  stacks into 1-col. (b) `WidgetGrid.tsx`: `rowHeight = cellW`
  (computed from container width / cols) so cells are literally
  square; the prop default + the SortableWidgetCell + drag ghost
  pixel math all use the dynamic value. (c) `SizeGridPicker`:
  defaults to 8×8, the visual proportions match the rendered cell.
  (d) `LayoutTab` fallback maxSize updated. (e) Every widget's
  `defaultSize / minSize / maxSize` rescaled with this mapping:
  `12 → 8`, `8 → 6`, `6 → 4`, `4 → 3`, `3 → 2`, `2 → 2`. (f)
  `size-bucket.ts` thresholds rebalanced so a 1×1 lands in tiny and
  4×4 still lands in medium. (g) Add a minimum-size guard on
  widgets that don't render usefully below 2×1 (e.g. table-style
  widgets get minSize.w bumped to 2).
- **Files:** `lib/hub/grid-math.ts`, `lib/hub/components/WidgetGrid.tsx`,
  `lib/hub/components/settings/SizeGridPicker.tsx`,
  `lib/hub/components/settings/LayoutTab.tsx`,
  `lib/hub/size-bucket.ts`, all 36 widget `index.tsx` files,
  `__tests__/hub/grid-math.test.ts` (extend),
  `__tests__/hub/grid-8x8.test.ts` (new).
- **Done when:** Canvas renders an 8-col grid with square cells;
  the SizeGridPicker shows the same proportions; every widget's
  default/min/max sizes are in 8-col units.
- **Depends on:** Slice 202.
- **Done:** Seven coordinated changes in one cohesive commit because the grid + the picker + the widget catalog have to stay in lockstep. (a) `grid-math.ts`: `GridBreakpoint` flipped from `12 | 6 | 1` to `8 | 4 | 1`; `breakpointForWidth` thresholds shifted to 1024px / 640px (matched to the new 8 × ~128px cell size); `collapseLayout` halves widths into 4-col and stacks into 1-col. (b) `WidgetGrid.tsx`: cells are now square — `effectiveRowHeight = cellW` derived from the ResizeObserver's container width, falling back to a constant 140px (or the legacy `rowHeight` prop) before the first observation. A 1×1 widget renders as a literal square; a 2×1 is twice the width of its height. `gridAutoRows` uses the dynamic value. All `compactLayout(_, 12)` calls (in HubCanvas, LayoutTab, AddWidgetModal, WidgetGrid's own drag-end + the unknown-widget fallback) updated to `(_, 8)`. (c) `SizeGridPicker`: defaults to 8×8 + cells use `aspectRatio: 1/1` so the picker visualizes the same shape the user will see in the canvas. (d) `LayoutTab` fallback maxSize updated to `{ w: 8, h: 8 }`. (e) Every widget's `defaultSize / minSize / maxSize` rescaled with a tokenized batch script (avoids the chain-substitution bug): `12 → 8`, `8 → 6`, `6 → 4`, `4 → 3`, `3 → 2`, `2 → 2`. The first attempt chained `(12,4) → (8,6) → (6,6)` and was reverted before re-running with proper tokens. (f) `size-bucket.ts` thresholds rebalanced from `3 / 6 / 12 / 24` to `2 / 6 / 12 / 20` so a 1×1 lands in tiny + a 4×4 still lands in large. (g) `use-element-size.ts` INITIAL breakpoint flipped to 8 to match. The breakpoint thresholds plus the area thresholds were verified against every shipped widget by a new contract test that walks `allWidgets()` and asserts each definition's default/min/max fits the 8×8 envelope + `min ≤ default ≤ max`. Updated 12 widget test files (the registry test for each widget that pinned a 12-col size, plus the Phase-18 wide-composite asserter), the grid-math suite, the use-element-size suite, the size-bucket suite, and the SizeGridPicker render suite to match the new envelope. 167 new specs in `__tests__/hub/grid-8x8.test.ts` lock the breakpoint surface + every widget definition. 851 hub specs green. `tsc` + `eslint` clean.

### Phase 35 — Per-widget responsive formatting (Slices 210+)

Reserved for follow-up slices once Slice 209 lands. Each slice
picks 3-5 widgets at a time, audits their render at every bucket
(tiny → xlarge), and adds bucket-specific layout where the
existing code renders the same thing or overflows. This phased
approach keeps each slice reviewable. The doc closes only when all
36 widgets have been verified at every bucket.

#### Slice 210 — pending-receipts + monthly-revenue + team-status (the 3 visible-on-screenshot widgets) ✅ shipped
- **Scope:** Audit the three widgets in the user's first hub
  screenshot (`pending-receipts`, `monthly-revenue`,
  `team-status`) at every bucket and add bucket-aware rendering
  where they currently render the same thing or overflow.
- **Files:** `lib/hub/widgets/pending-receipts/index.tsx`,
  `lib/hub/widgets/monthly-revenue/index.tsx`,
  `lib/hub/widgets/team-status/index.tsx`,
  `__tests__/hub/widgets-responsive-210.test.ts`.
- **Done when:** Each widget reads cleanly at every bucket
  including 1×1; the visible-on-screenshot widgets no longer
  share the same generic look at every size.
- **Depends on:** Slice 209.
- **Done:** `pending-receipts` now branches on bucket — tiny renders a centered counter card (count + "pending" label + total dollar amount, no list); small/medium/large/xlarge render a vertical list with ellipsis-truncated vendor names, a `+ N more` row when items overflow the cap, and an optional submitter column at medium+ (small drops it to keep the row from wrapping at narrow cells). The cap was tightened to `0 / 3 / 6 / 12 / 24` so the list never overflows the container. minSize lowered to 1×1 so the tiny mode is reachable. `monthly-revenue` got bucket-aware typography via the new `amountStyleForBucket(bucket)` helper (`clamp(1.5rem, 3.5vw, 2.25rem)` at tiny through `2.5rem` at xlarge) so the dollar amount reads at every size; tiny mode shows a compact dollar value (`$1.2K` / `$3.8M`) via a new `formatCompact` helper plus a triangle trend indicator. Medium+ shows the goal progress bar; small omits it to save vertical space. minSize lowered to 1×1 + defaultSize tightened to 2×2 so the widget reads as a stat card by default. `team-status` got an explicit tiny branch (counter + "clocked in" label, same pattern as pending-receipts) for both the empty + the populated state, and minSize lowered to 1×1 so the tiny bucket is reachable. The grouped render for `groupBy !== 'none'` no longer needs to special-case `bucket !== 'tiny'` because tiny is handled above. 12 vitest specs lock the helpers: `receiptsCap` returns 0 at tiny + grows monotonically across buckets + fits the bucket envelope; `formatCompact` round-trips small values verbatim + abbreviates thousands as K + millions as M; `amountStyleForBucket` returns a distinct fontSize per bucket + always returns the success color; the three widgets' minSize is `1×1` so the tiny bucket is actually pickable. 863 hub specs green. `tsc` + `eslint` clean.

#### Slice 211 — hours-this-week + pto-balance + today-schedule (stat-card pattern) ✅ shipped
- **Scope:** Apply the bucket-aware stat pattern from Slice 210 to
  the three other dashboard-style widgets in the persona default
  layout. Extract the shared helpers so future stat widgets stay
  consistent.
- **Files:** new `lib/hub/widgets/_shared/stat-bucket.ts`,
  `lib/hub/widgets/hours-this-week/index.tsx`,
  `lib/hub/widgets/pto-balance/index.tsx`,
  `lib/hub/widgets/today-schedule/index.tsx`,
  `__tests__/hub/widgets-responsive-211.test.ts`.
- **Done when:** All three reach the tiny bucket cleanly + use a
  single shared helper for stat-card typography.
- **Depends on:** Slice 210.
- **Done:** New `lib/hub/widgets/_shared/stat-bucket.ts` centralizes the bucket-scaled stat typography that monthly-revenue introduced inline. `statNumberStyle(bucket, color?)` returns a CSS object with `clamp(1.25rem, 3vw, 2rem)` at tiny through `2.5rem` at xlarge plus the standard single-line truncation bundle (`overflow: hidden`, `white-space: nowrap`, `text-overflow: ellipsis`) so a long value can never wrap. `tinyStatWrapStyle()` + `tinyStatLabelStyle()` produce the centered flex column + uppercase muted-label pair every tiny stat card uses. Each helper returns a fresh object so callers can spread additional fields. `hours-this-week` now branches on bucket — tiny renders `{total}h` centered with an "of {goal}h" label, no bar chart; small renders the existing number + chart with the new bucket-aware font; medium+ keeps the optional per-job breakdown. minSize lowered to 1×1. Empty state at tiny shows `0h / this week`. `pto-balance` got the same treatment — tiny renders just the formatted balance + "PTO" label in success color; small+ keeps the accrual + last-accrued lines + the optional history list. minSize lowered to 1×1. Empty state at tiny shows an em-dash + "PTO" label. `today-schedule` got a tiny event-count mode (`{count} event{s} today`), empty state at tiny shows `0 / today`. minSize lowered to 1×1. The redundant `bucket !== 'tiny'` guard on the per-event time/location line was removed because tiny is now handled above. 10 vitest specs lock the shared helpers (distinct fontSize per bucket, fontWeight 700 + line-height 1.1 for every bucket, single-line truncation invariant, default color + override path, fresh-object guarantee, label uppercase + muted) plus the 3 widgets' lowered minSize. The pto-balance + today-schedule registry tests were updated to assert the new 1×1 floor + matching defaultSize. 873 hub specs green. `tsc` + `eslint` clean.

#### Slice 212 — bucket-aware rendering for the 3 widgets that had ZERO size logic ✅ shipped
- **Scope:** Audit + bucket-enable `streak-counter`,
  `mileage-tracker`, and `sun-calculator` — the only 3 widgets in
  the catalog that didn't import `sizeBucket` at all. Apply the
  shared stat-bucket helpers from Slice 211.
- **Files:** `lib/hub/widgets/streak-counter/index.tsx`,
  `lib/hub/widgets/mileage-tracker/index.tsx`,
  `lib/hub/widgets/sun-calculator/index.tsx`,
  `__tests__/hub/widgets-responsive-212.test.ts`.
- **Done when:** Each widget renders cleanly at 1×1 and uses the
  shared `statNumberStyle(bucket)` helper for its main number.
- **Depends on:** Slice 211.
- **Done:** All three widgets adopted the shared `_shared/stat-bucket` helpers + got tiny + non-tiny branches. `streak-counter`: tiny renders `{count}🔥 days` centered; small+ keeps the existing two-line layout but with `statNumberStyle(bucket)` so the count scales from 1.25rem at tiny through 2.5rem at xlarge. Empty state at tiny shows `0🔥 days` so the cell never goes blank. `mileage-tracker`: tiny renders the rounded mile count + a short period label ("today" / "this wk" / "this mo") via a new `periodLabel(period)` helper; small+ keeps the existing trip + reimbursement line. Empty state at tiny shows `— miles`. `sun-calculator`: tiny renders just the `{daylight_hours}h daylight` stat; small+ keeps the sunrise/sunset pair with a bucket-scaled font (`var(--hub-font-base)` at small through `1.75rem` at xlarge) and hides the location label at small to save horizontal space. All three minSize lowered from 2×1 to 1×1 so the tiny bucket is reachable. 7 vitest specs lock the new contracts (3 lowered-minSize checks + 3 periodLabel branches + 1 maxSize-stays-within-envelope assertion). 880 hub specs green. `tsc` + `eslint` clean.

**Remaining audit work (Slices 213+):** Every widget in the
catalog now imports `sizeBucket` — no "no bucket logic at all"
widgets remain. The remaining audit is incremental polish per
widget (column-drop on overflow, alternate layouts at xlarge,
empty-state tiny modes for the few list widgets that still show
the full empty illustration at 1×1).

---

## TL;DR

- One large cohesive slice to flip the grid to 8×8 + square cells
  + rescale every widget definition.
- Per-widget responsive audit follows as smaller slices.
