# Perpendicular / On-Line Offset Line Tool

**Status:** IN-PROGRESS
**Goal:** A drawing tool that starts locked onto an existing line and extends a
new line off it — perpendicular (90°) by default, or at a fixed angle measured
off the base line, or at an absolute azimuth — with the length set by dragging
or typed numerically, and the far endpoint optionally snapping onto a second
line.

**Resolves (user report):** "I need a tool that draws a perpendicular line to
another line at any point along that line. When my cursor gets close to a line
it should lock to that line and let me slide along it or anchor to a point.
Default 90°; after the first click I drag away to set distance. Numerical
inputs for length, and a bearing/azimuth input for a fixed angle off the line.
If I drag the far end near another line, it should snap onto it."

---

## Decisions locked with the user

- **Replace** the existing `PERPENDICULAR` tool (currently point→line foot-of-
  perpendicular) with this on-line workflow. The old behavior is removed.
- Numeric inputs live in a **floating panel at the cursor** (like the
  rotate/scale `InteractiveOpPanel`), not the ToolOptionsBar.

---

## Current state

- `ToolType` union includes `'PERPENDICULAR'` — `lib/cad/types.ts:519`.
- Existing tool state: `perpendicularSourcePoint: Point2D | null` —
  `lib/cad/types.ts:749`; setter in `tool-store.ts`.
- Existing click handling (point→line): `CanvasViewport.tsx` `handleMouseDown`
  `case 'PERPENDICULAR'` ~`8993-9032`, plus `dropPerpendicular(...)` helper and
  hover handling ~`4985`.
- ToolOptionsBar perpendicular section ~`898`; label map `2126`.
- Toolbar button + hotkey: `ToolBar.tsx`, `useHotkeys.ts`.
- Reusable geometry/snap: `findSnapPoint` (`geometry/snap.ts:61`),
  `closestPointOnSegment` (`geometry/point.ts:46`), `lineLineIntersection`
  (`geometry/intersection.ts:4`), transforms `screenToDrawingWorld`
  (`CanvasViewport.tsx:1323`), bearing helpers (`geometry/bearing.ts`).
- Feature creation: `createFeature('LINE', [a,b])` (`CanvasViewport.tsx:7249`),
  commit via `finishFeature` (`7380`) → `drawingStore.addFeature` +
  `undoStore.pushUndo`.

### Already shipped

- [x] Pure geometry core `lib/cad/geometry/perpendicular-line.ts`
  (`unitVector`, `rotate`, `offsetDirection`, `offsetEndpoint`,
  `projectedLength`, `cursorSide`, `directionFromAzimuth`,
  `azimuthOfDirection`) + 12 unit tests.

---

## Design

**Interaction states** (tracked in tool-store, replacing
`perpendicularSourcePoint`):

- `IDLE` — no start point. On mouse-move, hit-test nearby lines; if within snap
  tolerance, lock a candidate start onto the segment (`closestPointOnSegment`)
  and remember the base segment endpoints + its unit direction. Endpoint snap
  (`findSnapPoint` ENDPOINT) lets the user anchor to a vertex instead of
  sliding. Preview: highlight the base line + a marker at the locked point.
- `EXTENDING` — first click commits the start point on the base line and stores
  `baseDir`. Default offset direction = perpendicular (`offsetDirection(baseDir,
  90, side)`); `side` follows `cursorSide`. Drag sets length via
  `projectedLength`. A second line near the moving endpoint snaps it (intersection
  of the offset ray with candidate segments, or `findSnapPoint`). The floating
  panel shows live length + bearing; typing either overrides the drag. Second
  click (or Enter in the panel) commits a `LINE` feature; Esc/right-click cancels.

**Angle semantics:** the panel's angle field is "angle off the base line"
(default 90). An optional toggle interprets the field as absolute azimuth via
`directionFromAzimuth`. Length field in display units → feet via `units.ts`.

**Floating panel:** new component `OnLineOffsetPanel.tsx` modeled on
`InteractiveOpPanel` — controlled length + angle/azimuth fields, live preview
on change, Enter commits, Esc cancels, positioned near the cursor and
viewport-clamped.

---

## Action items

- [x] Geometry core + unit tests (`perpendicular-line.ts`).
- [ ] Tool-store: replace `perpendicularSourcePoint` with the new state
  (`baseLineId`, `startPoint`, `baseDir`, `angleOffDeg`, `useAzimuth`,
  `lengthFeet`, `side`) + setters + reset; update `defaultToolState`.
- [ ] `types.ts`: update the `ToolState` fields and doc comments for the
  replaced tool.
- [ ] CanvasViewport `IDLE` hover: base-line locking + endpoint anchoring +
  preview highlight (replace the old source-point hover).
- [ ] CanvasViewport `EXTENDING`: perpendicular-by-default drag-to-length,
  cursor-side, commit on click, cancel on Esc/right-click (replace the old
  `case 'PERPENDICULAR'` + remove `dropPerpendicular` usage).
- [ ] Preview rendering in `renderToolPreview()` for both states.
- [ ] `OnLineOffsetPanel.tsx` floating numeric panel (length + angle/azimuth),
  wired to live preview + commit/cancel.
- [ ] Far-endpoint snapping onto a second line while extending.
- [ ] ToolOptionsBar: remove the now-obsolete perpendicular options (inputs
  moved to the floating panel); keep the tool label.
- [ ] Update Toolbar button copy/description + cursor + hotkey to the new
  behavior.
- [ ] Remove the dead `dropPerpendicular` helper if nothing else uses it.

---

## Definition of done

Selecting the tool, hovering a line locks the start point; clicking anchors it;
dragging draws a perpendicular line whose length follows the cursor; the
floating panel sets exact length and angle/azimuth; the far end snaps onto a
nearby second line; clicking/Enter commits a LINE with correct bearing+distance
properties and an undo entry. The old point→line behavior is gone.

## Risks / verification

- Geometry is unit-tested. Canvas interaction can only be confirmed in a
  browser, which this environment can't drive — each interaction slice will be
  type-checked + linted and reasoned through; flagged for manual QA.
- Risk: large `CanvasViewport.tsx`. Mitigate by keeping new logic in small
  helpers and the geometry module, touching the handlers minimally.
