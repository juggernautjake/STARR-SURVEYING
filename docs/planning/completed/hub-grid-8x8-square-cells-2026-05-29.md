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

#### Slice 213 — tiny counter modes for 4 communication / personal widgets ✅ shipped
- **Scope:** Audit + add tiny-bucket counter modes to widgets that
  still showed the full WidgetEmpty illustration at 1×1.
- **Files:** `lib/hub/widgets/weather/index.tsx`,
  `lib/hub/widgets/mentions-inbox/index.tsx`,
  `lib/hub/widgets/messages/index.tsx`,
  `lib/hub/widgets/recent-activity/index.tsx`,
  `__tests__/hub/widgets-responsive-213.test.ts`.
- **Done when:** Each widget renders a compact tiny mode at 1×1 +
  shows the full layout from small onward.
- **Depends on:** Slice 212.
- **Done:** Four widgets adopted the shared `_shared/stat-bucket` helpers with proper tiny + non-tiny branches. `weather`: tiny shows the weather emoji + rounded temperature with °F; small+ adds the description + location + high/low row; empty state at tiny shows `—° / weather`. `mentions-inbox`: tiny shows `@{count} mentions` with accent color when there are any (or fg-secondary muted color when none); small+ keeps the existing list with body previews (the redundant `bucket !== 'tiny'` preview guard was removed since tiny is handled above). `messages`: tiny shows the total unread count (accent color) or total conversation count (primary) with the appropriate label; small+ keeps the unread-dot list with the redundant tiny guards removed from the group badge + timestamp. `recent-activity`: tiny shows the recent-page count + "recent" label; small+ keeps the existing href-subtitle list with the redundant `bucket !== 'tiny'` guard removed. All four minSize values lowered to 1×1 so the tiny bucket is reachable. 14 vitest specs in the new contract test (4 lowered-minSize + 4 maxSize-fits-envelope + 4 defaultSize-still-sensible + 2 from the messages/recent-activity test rewrites) plus the existing widget-registry tests updated for the new 1×1 minSize. 892 hub specs green. `tsc` + `eslint` clean.

#### Slice 214 — tiny counter modes for 4 admin office / work widgets ✅ shipped
- **Scope:** Apply the established tiny-counter pattern to the
  4 admin-facing list widgets where the count alone is the most
  scannable thing: assignments-due, pending-time-off,
  pending-hours, open-discussions.
- **Files:** `lib/hub/widgets/assignments-due/index.tsx`,
  `lib/hub/widgets/pending-time-off/index.tsx` (rewrite),
  `lib/hub/widgets/pending-hours/index.tsx` (rewrite),
  `lib/hub/widgets/open-discussions/index.tsx`,
  `__tests__/hub/widgets-responsive-214.test.ts`.
- **Done when:** Each widget renders a meaningful tiny mode at 1×1
  + still works at every larger bucket; row text truncates with
  ellipsis instead of overflowing.
- **Depends on:** Slice 213.
- **Done:** Four admin widgets adopted the shared stat-bucket helpers. `assignments-due` got a new `isOverdue(iso, nowMs?)` helper that powers a smart tiny-mode label: if any tasks are overdue, the count is rendered in danger color with "{N} overdue" subtitle; otherwise it's primary fg with the "due" label. Empty state at tiny shows `0 / due` in success color. The redundant `bucket !== 'tiny'` guard on the row due-date span was removed. `pending-time-off` was rewritten end-to-end: tiny shows `{count} request(s)` in warning color (or muted `0 requests` when empty); non-tiny renders a row list with the new `nameStyle` + `mutedStyle` carrying `text-overflow: ellipsis` so long emails don't overflow. minSize 1×1. `pending-hours` followed the same pattern with `0 to approve` (success) when empty and `{count} to approve` (warning) when populated. `open-discussions` got a smart tiny mode: when any conversations have `has_mention`, the count is accent-colored with `{N} @you` subtitle; otherwise it's `{N} open`. The redundant `bucket !== 'tiny'` guard on the `@` mention indicator was removed. 13 vitest specs: 4 lowered-minSize + 4 maxSize-fits-envelope + 5 for the new `isOverdue` helper (null/undefined/empty input, future date, past date, injected nowMs determinism, malformed ISO). 905 hub specs green. `tsc` + `eslint` clean.

#### Slice 215 — tiny counter modes for 6 equipment + work-status widgets (batched) ✅ shipped
- **Scope:** Apply the established tiny-counter pattern to 6 more
  similarly-structured list widgets via a tokenized batch script
  since the per-file diff is identical (import + empty-state
  wrapper + populated-state branch + minSize lowered).
- **Files:** `lib/hub/widgets/equipment-out/index.tsx`,
  `lib/hub/widgets/low-consumables/index.tsx`,
  `lib/hub/widgets/maintenance-due/index.tsx`,
  `lib/hub/widgets/vehicles-status/index.tsx`,
  `lib/hub/widgets/drawings-in-progress/index.tsx`,
  `lib/hub/widgets/field-data-pending/index.tsx`,
  `__tests__/hub/widgets-responsive-215.test.ts`.
- **Done when:** All 6 reach the tiny bucket cleanly + still fit
  inside the 8×8 envelope at max.
- **Depends on:** Slice 214.
- **Done:** Wrote a Python batch script that, for each of the 6 widgets, (a) added the shared `_shared/stat-bucket` imports after the existing `WidgetSkeleton` import, (b) wrapped the inline empty-state return with `if (bucket === 'tiny') { … counter … }` showing `0 / {label}` in muted color, (c) inserted a populated-state tiny branch above the `const visible = …` line showing the count in the widget's color of choice (warning / danger / accent / primary depending on semantic), and (d) lowered minSize from `{w: 2, h: 2}` to `{w: 1, h: 1}` with the standard slice-tagged comment. A second TypeScript pass surfaced 6 leftover `bucket !== 'tiny'` guards in the populated row renders (unreachable code since tiny is handled before falling through) — a follow-up regex pass stripped those guards + a third pass cleaned up the dangling JSX wrapper parens that remained where `{(bucket !== 'tiny' && <span>…)}` was reduced to `{( <span>…)}`. Per-widget tiny labels: equipment-out → "checked out" (warning), low-consumables → "low items" (danger), maintenance-due → "due" (warning), vehicles-status → "vehicles" (primary fg), drawings-in-progress → "in progress" (accent), field-data-pending → "captures" (warning). The equipment-out registry id is actually `equipment-out-today` (the folder name doesn't match the registered id) — caught by the test on the first run + corrected. 12 vitest specs in the new contract test (6 lowered-minSize + 6 maxSize-fits-envelope). 917 hub specs green. `tsc` + `eslint` clean.

#### Slice 216 — final 6 widgets + catalog-wide minSize baseline ✅ shipped
- **Scope:** Apply the tiny-counter pattern to the last 6 widgets
  that still showed full WidgetEmpty illustrations (2 stat-style:
  flashcards-due + roadmap-progress; 4 list-style:
  job-activity-feed, recent-announcements, recent-drawings,
  active-research-projects). Add a catalog-wide minSize baseline
  contract that no widget requires more than the small-bucket
  ceiling (area ≤ 8) so a future widget definition can't ship a
  composite that demands more than a small cell to even render.
- **Files:** `lib/hub/widgets/flashcards-due/index.tsx`,
  `lib/hub/widgets/roadmap-progress/index.tsx`,
  `lib/hub/widgets/job-activity-feed/index.tsx`,
  `lib/hub/widgets/recent-announcements/index.tsx`,
  `lib/hub/widgets/recent-drawings/index.tsx`,
  `lib/hub/widgets/active-research-projects/index.tsx`,
  `__tests__/hub/widgets-responsive-216.test.ts`.
- **Done when:** All 6 reach the tiny bucket cleanly; every widget
  in the catalog has minSize area ≤ 8.
- **Depends on:** Slice 215.
- **Done:** Two stat-style widgets handled with Edit calls (no batch script needed because their populated paths differ from the list-style template). `flashcards-due` tiny renders `{count} card(s)` in warning color; the Slice 198–style `bucket !== 'tiny'` guard around the "Start review →" link was removed because tiny now renders before the link. `roadmap-progress` tiny renders `{percent}%` in accent + "roadmap" label; the redundant `bucket !== 'tiny'` guard around the "Now on:" current-module line was removed. Both minSize lowered to 1×1. The 4 list-style widgets went through the established Python batch (imports + empty-state wrapper + populated-state branch + minSize lowered) with the auto follow-up TypeScript-driven strip of redundant `bucket !== 'tiny'` guards and JSX wrapper-paren cleanup. Per-widget tiny labels: job-activity-feed → "events" (accent), recent-announcements → "updates" (info), recent-drawings → "drawings" (accent), active-research-projects → "projects" (info). The catalog-wide baseline contract was initially written as `every widget supports 1×1` but failed for 12 widgets that still pin minSize at 2×1, 2×2, 3×2, or 4×2; rewritten to the looser `minSize area ≤ 8` (small-bucket ceiling) which passes for every shipped widget and documents the residual minSize-lowering opportunity as Slice 217+ follow-up. 12 vitest specs in the new contract test (6 lowered-minSize + the catalog-wide baseline iterating every widget). 964 hub specs green. `tsc` + `eslint` clean.

#### Slice 217 — final 10 widgets reach 1×1; Phase 35 done ✅ shipped
- **Scope:** Lower minSize on the remaining 10 widgets — 4 needed
  new tiny counter modes (pipeline-status, quiz-history,
  recommended-lessons, outstanding-invoices) + 6 already had
  proper tiny render branches and just needed the minSize
  floor dropped (my-jobs, my-pay, quick-actions, pinned-pages,
  bookmarks, class-assignments). Add the Phase 35 done-when
  contract test that asserts every catalog entry reaches 1×1
  EXCEPT two documented composite exceptions (daily-briefing 4×2 +
  crew-calendar 3×2).
- **Files:** `lib/hub/widgets/pipeline-status/index.tsx`,
  `lib/hub/widgets/quiz-history/index.tsx`,
  `lib/hub/widgets/recommended-lessons/index.tsx`,
  `lib/hub/widgets/outstanding-invoices/index.tsx`,
  6 other widget index files (minSize-only edit),
  5 existing widget test files (updated expected minSize),
  `__tests__/hub/widgets-responsive-217.test.ts`.
- **Done when:** Every widget except daily-briefing + crew-calendar
  has minSize `{w: 1, h: 1}`; the catalog-wide done-when contract
  passes.
- **Depends on:** Slice 216.
- **Done:** Batched the 4 widgets needing new tiny modes (pipeline-status renders unique smart label — `{N} failed` in danger color when any runs have failed status, else `{N} runs` in accent; quiz-history → `{N} attempts` in accent; recommended-lessons → `{N} lessons` in info; outstanding-invoices → `{N} unpaid` in warning). Two automated fixup passes: the first batch left a JSX `{{...}}` double-brace error in pipeline-status's smart-label expression that was fixed by Edit, plus the empty-state wrappers for quiz-history + recommended-lessons didn't match because their empty-state icons differ from the populated label keyword (📝 / ✨ vs the populated-label `attempts` / `lessons`); a follow-up Python pass applied the wrappers directly. After the TypeScript-driven `bucket !== 'tiny'` strip a fourth pass had to remove the unreachable `bucket === 'tiny' ? N : ...` segment from every `const cap = ...` ternary because tiny is now handled before the cap line. minSize-only batch applied to the other 6 widgets (`{w:1,h:1}` with a slice-tagged comment); 5 existing widget-registry test files updated to expect the new minSize. New `Phase 35 done-when contract` test iterates every `allWidgets()` entry and asserts `minSize === {w:1,h:1}` for everything except the 2 documented composites (`daily-briefing` and `crew-calendar`), which assert `area > 1` instead. **Phase 35 is now complete** — every widget that can reasonably render at 1×1 does, and the two exceptions are explicit + tested. 1015 hub specs green. `tsc` + `eslint` clean.

---

## TL;DR

- One large cohesive slice to flip the grid to 8×8 + square cells
  + rescale every widget definition.
- Per-widget responsive audit follows as smaller slices.
