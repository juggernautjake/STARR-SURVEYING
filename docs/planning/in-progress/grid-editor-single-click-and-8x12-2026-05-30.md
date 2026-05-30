# Grid editor: single-click placement + 8×12 grid

*Opened 2026-05-30. Follow-up to
`grid-editor-placement-resize-overhaul-2026-05-30.md` (completed)
addressing two more pieces of user feedback.*

## What the user reported (verbatim)

> Now, it is having a hard time placing new widgets into the grid.
> Something is off with that. I need to be able to click the widget
> type I want to add and be able to add it to an empty grid tile.
> Please make this work correctly. Also, please go ahead and make the
> grid actually be 8x12, being 8 tiles wide and 12 tiles tall.

(Plus a separate ask, already shipped: make the Enter Work Mode text
plain white and drop the spinning hover gradient.)

## Diagnosis

1. **Placement is a two-click "paint a rectangle" flow.** Today the
   surveyor arms a widget type, clicks an anchor cell, then clicks a
   second cell to define the rectangle's far corner (`rectFromAnchors`
   + `clampRectToEnvelope` + a second `handleCellPointerDown`). That's
   the friction — the user expects "click the type, click an empty
   tile, done." The widget should drop at its `defaultSize` and the
   surveyor can resize afterward with the corner handle (which already
   works well post-overhaul).
2. **Grid is 8×8.** `HUB_EDITOR_ROWS = 8` + the modal container's
   `aspectRatio: '1 / 1'`. The user wants 8 wide × 12 tall.

## Design

### Single-click placement
- Arm a widget type in the palette (unchanged).
- On **pointer-enter** of a grid cell while armed, show a live preview
  rect at `clampRectToGrid({ x, y, w: def.defaultSize.w, h:
  def.defaultSize.h })` — i.e. the default footprint anchored at the
  hovered cell, clamped so it can't hang off the right/bottom edge.
  Tint it blocked (danger) when it overlaps an existing widget.
- On **single click** of a cell while armed: if the preview isn't
  blocked, `addWidget` at the preview rect + clear the armed type (or
  keep it armed for rapid multi-add — keep armed, matching "add a
  few of the same"). Actually: clear selection after placing so a
  stray second click doesn't double-place; the surveyor re-clicks the
  palette for another. (Single-add is the safer default; revisit if
  the user wants sticky multi-add.)
- Drop the anchor/second-click machinery (`placeAnchor`,
  `rectFromAnchors`, the "is this the anchor cell" styling). Keep
  `clampRectToEnvelope` available (resize still uses min/max envelopes
  via `computeResizedRect`, but placement now uses `defaultSize`).
- Block placement when the default footprint can't fit without overlap
  at the hovered cell (preview shows blocked; click no-ops). The
  surveyor moves to an open area. (Could auto-find the nearest free
  slot via `nearestAvailable`, but explicit placement matches the
  "click an empty tile" mental model — keep it literal.)

### 8×12 grid
- `HUB_EDITOR_ROWS: 8 → 12` in `grid-model.ts`.
- Modal grid container `aspectRatio: '1 / 1' → '8 / 12'` (so cells stay
  square: 8 cols / 12 rows). Both `gridContainerStyle` +
  `gridContainerPlacingStyle`.
- The hub read-only render (`WidgetGrid`) is already row-unbounded with
  square `gridAutoRows`, so nothing there changes — a layout that uses
  up to row 12 just renders 12 rows tall.
- `clampRectToGrid` / `clampRectToEnvelope` / `cellUnderPointer` /
  `computeResizedRect` all already take `rows` defaulting to
  `GRID_EDITOR_ROWS`, so they pick up 12 automatically.
- Update `grid-model.ts`'s header comment (the "8×8 viewport" note).

## Phases + slices

### Phase P1 — 8×12 grid

#### Slice P1 — Bump editor rows to 12 + fix the modal aspect ratio ✅ shipped 2026-05-30
- **Files:** `lib/hub/grid-model.ts`,
  `lib/hub/components/GridEditor.tsx` (two aspectRatio constants +
  the header comment), `__tests__/hub/grid-model.test.ts` (update the
  rows assertion), `__tests__/hub/grid-8x8.test.ts` if it pins 8 rows.
- **Done when:** `HUB_EDITOR_ROWS === 12`; the modal renders 8 wide ×
  12 tall with square cells; helpers clamp to 12 rows; specs updated.
- **Shipped:** `HUB_EDITOR_ROWS = 12` (was 8); the modal's two grid
  containers switched `aspectRatio: '1 / 1' → '8 / 12'` + bounded by
  `height: min(100%, 1020px)` (portrait, so all 12 rows fit the modal
  body; width follows the aspect ratio, square cells). Updated the
  grid-model header comment + the GridEditor subtitle/comments from
  "8×8" to "8×12". Specs: grid-model rows assertion → 12,
  isInsideGrid bottom-overflow case → y:11; grid-editor-shell cell
  count 64 → 96 + footer `0/64` → `0/96`; grid-editor-resize
  cellUnderPointer bounds → 800×1200 (square cells) with bottom-right
  (7, 11); grid-editor-place rectFromAnchors/clampRectToEnvelope
  default-rows cases → 12. All helpers (`clampRectToGrid`,
  `clampRectToEnvelope`, `cellUnderPointer`, `computeResizedRect`)
  already defaulted `rows` to `GRID_EDITOR_ROWS`, so they picked up 12
  automatically. The hub read-only render is row-unbounded → no change
  there. 1409 hub specs green; typecheck + lint clean.

### Phase P2 — Single-click placement

#### Slice P2 — Replace two-click paint with single-click drop at defaultSize
- **Scope:** Rework `handleCellPointerDown` /
  `handleCellPointerEnter` / the `previewRect` derivation so an armed
  type previews + drops its `defaultSize` footprint at the hovered/
  clicked cell (clamped, blocked-aware). Remove `placeAnchor` +
  the anchor cell styling; keep `placeHover` (renamed conceptually to
  "the cell being previewed"). Place on single click when not blocked;
  clear the armed type after placing.
- **Files:** `lib/hub/components/GridEditor.tsx`,
  `__tests__/hub/grid-editor-place.test.tsx` (rewrite the two-click
  geometry cases for single-click drop),
  `__tests__/hub/grid-editor-single-click-place.test.ts` (new source
  regex on the handler wiring).
- **Done when:** Arming a type + clicking an empty tile places the
  widget at its default size there; hovering shows a live preview;
  clicking a blocked tile no-ops; resize-after-place still works.

### Phase P3 — QA

#### Slice P3 — Sweep + move doc to completed
- **Done when:** typecheck + lint + hub suite green; doc moved.

## Guardrails
- Don't reintroduce compaction. Free placement from the prior overhaul
  stays.
- Saved-layout shape is unchanged (`{x,y,w,h}`); old layouts load via
  the normalizer. A widget previously saved at row 9–11 now sits
  inside the editor's visible 12-row viewport instead of below it.
- Pure helpers stay unit-tested; GridEditor wiring locked via
  source-regex per the SSR snapshot-caching limitation.
