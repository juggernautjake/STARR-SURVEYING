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

#### Slice G2 — Per-widget controls on hover + selection + focus ✅ shipped 2026-05-30
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
- **Shipped:** Added `hoveredPlacedId` + `focusedPlacedId` state with
  pointer-enter/leave + focus/blur handlers on the placed-widget div.
  New `controlsVisible = !aGestureActive && (hovered || isSelected ||
  focused)` flag where `aGestureActive = moveDrag !== null ||
  resizeTarget !== null` (suppresses the cluster during any drag/resize
  so it doesn't flicker under the cursor). The button cluster's
  `{isSelected && (` gate became `{controlsVisible && (`. Added a
  `data-controls-visible` attribute for styling/e2e. Updated the
  selection + resize specs whose assertions referenced the old gate;
  new `grid-editor-hover-controls.test.ts` (11 cases). 1396 hub specs
  green. (Slice G4b — arrow-key move — shipped in the same commit; see
  its entry under Phase G3b.)

### Phase G3 — Resize with directional flow-push

#### Slice G3 — Pure `applyResizeWithPush` helper (flow-push semantics) ✅ shipped 2026-05-30
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
- **Shipped:** `applyResizeWithPush` clamps `newRect` to the columns,
  picks a flow direction (`grewW >= grewH` → horizontal, else
  vertical), then walks the other widgets in reading order (y, then x)
  and slides each conflicting one along the flow: horizontal advances
  x by 1 and wraps to `x=0, y+1` when `x + w > cols`; vertical
  advances y by 1. A blocker list (resized rect + already-settled
  widgets) makes the cascade resolve downstream collisions. Shrinking
  moves nobody (the smaller rect is a subset of the old footprint).
  Safety iteration bound guards pathological inputs. 9 fixed-fixture
  specs in `grid-resize-push.test.ts` (push-right, wrap-to-next-row,
  push-down, vertical cascade, shrink-moves-nobody, clamp, ghost-id,
  determinism).

#### Slice G4 — Wire resize to the push helper (live preview + commit) ✅ shipped 2026-05-30
- **Scope:** Rework `startResize` to drive a live preview through
  `applyResizeWithPush` on every pointer-move + commit the pushed
  layout (no compaction, then `trimLeadingRows`) on pointer-up. Drop
  the overlap-abort guard. Render pushed neighbors live.
- **Files:** `lib/hub/components/GridEditor.tsx`,
  `__tests__/hub/grid-editor-resize.test.tsx` (updated),
  `grid-editor-resize-push-wire.test.ts` (new).
- **Done when:** Dragging a corner bigger pushes adjacent widgets live
  + the arrangement persists on release; resize never silently no-ops.
- **Shipped:** `resizeTarget` now carries `previewLayout:
  WidgetInstance[]`. A `resolve(ev)` helper grows the rect via
  `computeResizedRect` then runs `applyResizeWithPush` against the live
  draft; `handleMove` writes the pushed layout into
  `resizeTarget.previewLayout`; `handleUp` commits
  `trimLeadingRows(pushed)` via `setDraftWidgets` (no-op only when w/h
  unchanged — the old "abort if it would overlap a sibling" guard is
  gone). The render now derives every widget's live geometry from
  `resizeSlot ?? moveSlot` (one source for both gestures), so pushed
  neighbors shift live during a resize the same way they do during a
  move. New `grid-editor-resize-push-wire.test.ts` (7 cases) + updated
  `grid-editor-resize.test.tsx`. Updated `grid-editor-move.test.ts`
  for the shared-import + shared-live-slot shape. 1415 hub specs
  green; typecheck + lint clean.

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

#### Slice G4b — Arrow-key move of the selected widget (with push) ✅ shipped 2026-05-30
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
- **Shipped:** Window-level arrow branch in the existing `onKey` effect
  (window-level so it fires regardless of DOM focus — `startMove`'s
  pointer-down `preventDefault` can stop the widget div from focusing
  on click). Four arrows → one-cell deltas; guards on `selectedPlacedId
  && !moveDrag && !resizeTarget && !selectedType`; clamps x into
  `[0, cols - w]`, y to `>= 0`; no-ops a zero-delta; commits via
  `commitDrop` (push + trim) → `setDraftWidgets`. `handlePlacedKeyDown`
  keeps Enter/Space → toggle selection. New
  `grid-editor-keyboard-move.test.ts` (8 cases). Effect dep array
  widened (`moveDrag, resizeTarget, selectedType, setDraftWidgets`).

### Phase G4 — QA

#### Slice G5 — Sweep + move doc to completed ✅ shipped 2026-05-30
- **Scope:** Full typecheck + lint + hub suite green; manual checklist
  (free placement keeps gaps, hover controls, resize push feel). Move
  this doc to `docs/planning/completed/`.
- **Done when:** All checks green; doc moved.
- **Shipped:** `tsc --noEmit` clean, `next lint` clean, hub + admin/me
  suites green (1434 specs across 96 files). Full repo sweep: 6042
  passing / 17 skipped — the lone red is
  `__tests__/recon/phase12-export.test.ts` (a 21s PDF-render perf test
  that passes in isolation, 31/31, and only times out under
  full-suite parallel load; unrelated to this work). While here, fixed
  a regression my Work-Mode CSS follow-up caused in the pre-existing
  `hub-greeting-style.test.tsx`: a literal `}` inside a new explanatory
  comment + the added `:link/:visited` selectors broke its brittle
  block-matching regexes. Hardened that spec to strip CSS comments +
  match declaration blocks by selector substring. Doc moved to
  `docs/planning/completed/`.

## Outcome summary

The grid editor now does what the user asked:
- **Free placement.** Widgets stay exactly where dropped; gaps + empty
  tiles render on the hub as drawn. Only a fully-empty top band trims.
  (Removed the `compactLayout` that pulled everything to the top-left.)
- **Hover controls.** Delete / Options / Resize reveal on hover OR
  selection OR keyboard focus; suppressed mid-gesture.
- **Resize pushes neighbors.** Growing a widget flows adjacent widgets
  in the drag direction (right→wrap-to-next-row, or down), live during
  the drag, and the arrangement persists on release. No more
  silent no-op when growing into an occupied cell.
- **Keyboard move.** Selecting a widget + arrow keys nudges it one cell
  with the same dynamic neighbor push.
- **Work Mode button.** Label pinned white (beats the global anchor
  color); on hover the red/white/blue conic gradient spins through the
  text to match the border ring.

## Guardrails

- Pure grid math stays in `lib/hub/grid-reflow.ts` with deterministic
  fixed-fixture tests (the SSR snapshot-caching limitation blocks
  interactive store-mutation render assertions, so GridEditor wiring is
  locked via `fs.readFileSync` source-regex specs).
- Don't reintroduce compaction anywhere in the move/resize commit
  paths — free placement is the whole point.
- Old saved layouts still load via the Slice-5 normalizer; nothing here
  changes the persisted shape (still `{x,y,w,h}` per widget).
