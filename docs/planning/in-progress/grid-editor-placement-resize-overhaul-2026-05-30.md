# Grid editor placement + resize overhaul

*Opened 2026-05-30. Follow-up to `employee-hub-overhaul-2026-05-30.md`
(completed) addressing user feedback that the modal grid editor's
placement + resize still feel broken.*

## What the user reported (verbatim)

> The resizing of the widgets in the grid editor is better, but it is
> still kinda broken. I need to be able to place the widgets wherever
> there is free space, and that will totally effect how they are
> rendered. Even if I arrange them in a [way] that leaves a bunch of
> open tiles and empty space, make it actually represent that. Also,
> All of the tiles are favoring towards the upper left side of the
> grid, and once they are there I can't really move them. Also, I want
> the widget editing buttons to show up on the widget on mouse hover.
> Right now I have to click on a widget to see the delete, widget
> settings, and resize interactables, but I want them to pop up right
> whenever my mouse is over the widget, and disappear whenever my mouse
> leaves the widget. Also, if I attempt to make a widget larger, as I
> drag the widget bigger, it should push any immediately adjacent
> widgets that are in the way of the direction I am enlarging the
> widget out of the way, and then whenever I let go of the click it
> should stay like that. Please consider how to make the widget
> resizing and placement better and more customizeable.

## Root-cause diagnosis (read from the live code)

1. **Upper-left gravity + "can't move them".** `commitDrop()` in
   `lib/hub/grid-reflow.ts` runs `compactLayout()` on every drop, which
   re-packs every widget toward (0,0). So no matter where you drop a
   widget, the board snaps back to the top-left — which also reads as
   "I can't move them," because the move is immediately undone by the
   compaction.
2. **Empty space not represented.** Same root cause — `compactLayout`
   collapses every gap. The hub render (`WidgetGrid`) already honors
   absolute `x/y` (it places each cell with
   `gridRow: ${y+1} / span h`), so once compaction is gone, the layout
   you paint is the layout you get, empty tiles and all.
3. **Controls require a click.** In `GridEditor`, the delete / options
   / resize buttons are gated behind `isSelected` (a click toggles
   `selectedPlacedId`). The user wants them on hover.
4. **Resize doesn't push neighbors.** `startResize` →
   `computeResizedRect` just clamps the new size and then *aborts the
   commit if the result would overlap a sibling* (the
   `if (overlapsAny(candidate, siblings)) return;` guard). So growing
   into an occupied cell silently no-ops instead of pushing.

## User design decisions (answered 2026-05-30)

- **Free placement:** *Trim only leading empty rows.* Widgets stay
  exactly where dropped (real gaps between/beside them preserved), but
  if the entire top of the grid is empty, slide everything up so the
  dashboard doesn't open with a blank band.
- **Resize push direction:** *Flow push.* Pushed neighbors move in the
  drag direction until there's no more room for them in that row, at
  which point they drop to the next row — potentially pushing widgets
  that were already on the next row. (A reading-order reflow seeded
  from the resized widget's new footprint.)
- **Hover controls:** *Hover + selection + focus.* Show the controls
  while the mouse is over the widget, AND while it's click-selected,
  AND while it has keyboard focus (so mouse, keyboard, and touch all
  have an affordance).

## Phases + slices

### Phase G1 — Kill the gravity (free placement)

#### Slice G1 — Drop commits to the exact dropped position; trim only leading rows ✅ shipped 2026-05-30
- **Scope:** Replace `compactLayout` inside `commitDrop` with a
  push-then-trim model: the moving widget lands exactly at its
  (clamped) target, overlapping neighbors get pushed (existing
  `applyMoveWithPush` down-push for moves), then a new pure helper
  `trimLeadingRows(layout)` subtracts the minimum `y` from every widget
  so a fully-empty top band collapses but interior gaps stay. Remove
  the `nearestAvailable` snap from the move drop (push already frees
  the target). Keep `nearestAvailable` exported (palette add still uses
  the idea of "find a free slot").
- **Files:** `lib/hub/grid-reflow.ts`,
  `__tests__/hub/grid-reflow.test.ts` (+ `grid-editor-drop-commit`
  source regex if the call shape changes).
- **Done when:** Dropping a widget at row 5 with rows 0–4 empty keeps
  it near row 5 (only a fully-empty top band trims); interior gaps
  survive; no overlaps. Pure helper unit-tested.
- **Shipped:** `commitDrop` now does `applyMoveWithPush` →
  `trimLeadingRows` (no `compactLayout`). The moving widget lands
  EXACTLY at its dropped target; overlapped neighbors push down;
  interior gaps + free tiles survive; only a wholly-empty top band
  collapses. New `trimLeadingRows` pure helper (subtracts `min(y)`;
  no-op when a widget already sits on row 0 or layout is empty; only
  `y` shifts). `compactLayout` import dropped from `grid-reflow.ts`.
  `commitDrop` call shape unchanged, so the `grid-editor-drop-commit`
  source regex still matches untouched. Reworked the reflow spec's
  commitDrop block (exact-target, gap-preservation, leading-trim,
  neighbor-push) + added a `trimLeadingRows` block — 25 reflow specs
  green; 1380 hub specs green; typecheck + lint clean.

### Phase G2 — Hover affordances

#### Slice G2 — Per-widget controls on hover + selection + focus
- **Scope:** In `GridEditor`, track a `hoveredPlacedId` (pointer
  enter/leave on the placed-widget div) and reveal the delete/options/
  resize cluster when `hovered || selected || focused`. Keep the
  click-select highlight for the drag/keyboard model. Ensure the
  controls don't flicker mid-drag (suppress hover reveal while
  `moveDrag`/`resizeTarget` is active for a *different* widget).
- **Files:** `lib/hub/components/GridEditor.tsx`,
  `__tests__/hub/grid-editor-hover-controls.test.ts` (new, source
  regex).
- **Done when:** Controls appear on mouse-over, on click-select, and on
  keyboard focus; disappear when the mouse leaves (unless selected/
  focused).

### Phase G3 — Resize with directional flow-push

#### Slice G3 — Pure `applyResizeWithPush` helper (flow-push semantics)
- **Scope:** New pure helper in `grid-reflow.ts`:
  `applyResizeWithPush(layout, id, newRect, cols)` — set the resized
  widget to `newRect`, then displace every overlapping neighbor in the
  grow direction (right when width grew, down when height grew). When a
  rightward push would exceed `cols`, wrap the neighbor to the next row
  and cascade-resolve downstream overlaps in reading order. No
  compaction. Deterministic + total.
- **Files:** `lib/hub/grid-reflow.ts`,
  `__tests__/hub/grid-resize-push.test.ts` (new, fixed fixtures).
- **Done when:** Growing a widget into a neighbor pushes the neighbor
  out (direction-aware, wrap-to-next-row) with no overlaps + in
  bounds; shrinking never moves anyone. Helper unit-tested.

#### Slice G4 — Wire resize to the push helper (live preview + commit)
- **Scope:** Rework `startResize` in `GridEditor` to drive a live
  preview through `applyResizeWithPush` on every pointer-move (so the
  surveyor watches neighbors shift as they drag the corner), and on
  pointer-up commit the pushed layout via `setDraftWidgets` (no
  compaction, then `trimLeadingRows`). Drop the
  `if (overlapsAny) return;` no-op guard. Render the pushed neighbors'
  live positions during the resize the same way the move preview does.
- **Files:** `lib/hub/components/GridEditor.tsx`,
  `__tests__/hub/grid-editor-resize.test.tsx` (update),
  `grid-editor-resize-push-wire.test.ts` (new source regex).
- **Done when:** Dragging a corner bigger pushes adjacent widgets live
  + the arrangement persists on release; resize never silently no-ops.

### Phase G3b — Keyboard movement

#### Slice G4b — Arrow-key move of the selected widget (with push)
- **Scope (user follow-up 2026-05-30):** *"If I click on a widget, I
  can then also choose to use the arrow keys on the keyboard to move it
  around, which would cause the other widgets to move dynamically if
  they are in the way."* When a placed widget is selected
  (`selectedPlacedId`), arrow keys nudge it one cell in that direction.
  Each nudge runs through `applyMoveWithPush` so neighbors shift
  dynamically, then `trimLeadingRows`, then commits via
  `setDraftWidgets`. Clamp at the grid edges (left/top can't go below
  0; right clamps to `cols`). `preventDefault` so the modal doesn't
  scroll. Keep Delete/Backspace (already wired) + Esc behavior intact;
  arrows only act when a widget is selected and no
  drag/resize/placement is in flight.
- **Files:** `lib/hub/components/GridEditor.tsx` (extend the existing
  `onKey` handler), `__tests__/hub/grid-editor-keyboard-move.test.ts`
  (new, source regex on the arrow-key branch + the push/trim/commit
  wiring).
- **Done when:** Selecting a widget + pressing arrows moves it one cell
  per press; blocked neighbors shift out of the way; the widget can't
  leave the grid.

### Phase G4 — QA

#### Slice G5 — Sweep + move doc to completed
- **Scope:** Full typecheck + lint + hub suite green; manual checklist
  (free placement keeps gaps, hover controls, resize push feel). Move
  this doc to `docs/planning/completed/`.
- **Done when:** All checks green; doc moved.

## Guardrails

- Pure grid math stays in `lib/hub/grid-reflow.ts` with deterministic
  fixed-fixture tests (the SSR snapshot-caching limitation blocks
  interactive store-mutation render assertions, so GridEditor wiring is
  locked via `fs.readFileSync` source-regex specs).
- Don't reintroduce compaction anywhere in the move/resize commit
  paths — free placement is the whole point.
- Old saved layouts still load via the Slice-5 normalizer; nothing here
  changes the persisted shape (still `{x,y,w,h}` per widget).
