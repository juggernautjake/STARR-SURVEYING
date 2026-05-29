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

---

## TL;DR

- One large cohesive slice to flip the grid to 8×8 + square cells
  + rescale every widget definition.
- Per-widget responsive audit follows as smaller slices.
