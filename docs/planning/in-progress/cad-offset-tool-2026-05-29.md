# CAD Offset Tool — interactive distance + units + linked re-edit

*Opened 2026-05-29.*

## What the user asked for

> "I need to be able to program the offset. I need to be able to right
> click on a line and there needs to be a 'create offset' option. Or
> if I use the offset tool and click on a line, there needs to be a
> way to specifically set a value for the distance. I also need to
> set the units for the offset. If I am using the offset tool on a
> line or shape, there should be a field that appear that I can type
> a number into and I can choose the units. Also, if an offset
> already exists and I click on it, it needs to reference the
> line/shape it was based off of, and it needs to show the value for
> how offset it is from the original line/shape, and I need to be
> able to edit the value and it needs to render the change in real
> time dynamically."

Three concrete asks:

1. **Right-click → "Create offset"** on a line/shape.
2. **Offset tool → click a line/shape → numeric input + unit picker** appears; commit creates the offset.
3. **Click an existing offset** → it knows its source feature, shows the
   stored distance + unit, lets the user edit, and re-renders live.

## What already exists (no need to rebuild)

| Piece | Where it lives |
|-------|----------------|
| `OFFSET` tool in the ToolType union | `lib/cad/types.ts` line 546 |
| Tool state for offset (sourceId, distance, side, corner handling, mode, segment mode, bearing) | `lib/cad/store/tool-store.ts` lines 90-103, 244-264 |
| Parallel-curve offset engine (`offsetPolyline`, `offsetArc`, `offsetCircle`, `offsetEllipse`, `offsetSpline`) with MITER/ROUND/CHAMFER corner handling | `lib/cad/geometry/offset.ts` |
| 12 surveyor presets (UE 7.5', setbacks, ROW, curb, gutter…) | `lib/cad/geometry/offset.ts` lines 15-28 |
| Operations: `offsetSelectionByDistance(distance)` + `applyInteractiveOffset(config)` (3-mode support: PARALLEL / SCALE / TRANSLATE) | `lib/cad/operations.ts` lines 3480, 3595 |
| Numeric-input panel precedent (perpendicular tool) — floating panel that opens once a source is locked, types straight into tool-store, canvas previews live | `app/admin/cad/components/OnLineOffsetPanel.tsx` |
| Right-click context menu with a `MenuItemDef` registration shape + an existing flat "Offset Copy…" entry using `window.prompt()` | `app/admin/cad/components/FeatureContextMenu.tsx` lines 84-94, 387-392, 643 |
| PropertyPanel right-rail inspector for the selected feature | `app/admin/cad/components/PropertyPanel.tsx` |
| Drawing-wide linear unit (`linearUnit: 'FT' \| 'IN' \| 'MILE' \| 'M' \| 'CM' \| 'MM'`) + `parse-length()` parser | `lib/cad/types.ts` line 35, `lib/cad/geometry/units/parse-length.ts` |
| Feature.properties is a free-form `Record<string, string \| number \| boolean>` so we can stash `offsetSourceId`, `offsetDistance`, `offsetUnit` without a schema migration | `lib/cad/types.ts` line 335 |
| Linked-instance subscriber pattern (auto-regenerate a feature when its source mutates) for layer duplicates | `lib/cad/operations/linked-instances.ts` |
| Pixi rendering layer + `toolPreviewLayer` for live previews | `app/admin/cad/components/CanvasViewport.tsx` |

## What's missing

- A non-prompt numeric input that opens when the OFFSET tool has a
  source feature picked (or when the right-click "Create offset" entry
  fires).
- A per-input unit selector — today the offset distance is always
  interpreted in the drawing's `linearUnit`.
- A way to mark a feature as "this is an offset of feature X with
  distance D in unit U" so the inspector can surface that fact + the
  link is durable across save/load.
- An "Offset" section in `PropertyPanel.tsx` that surfaces when the
  selected feature was tagged as an offset, with an editable distance
  field that re-runs the offset engine on commit.
- A propagator that watches the source feature and regenerates the
  offset when the source moves / vertices change (mirrors
  `linked-instances.ts` but scoped to offset metadata).

## Phases + slices

### Phase 1 — Floating offset panel + right-click entry (Slices 1–3)

#### Slice 1 — OffsetPanel component (distance + unit + commit) ✅ shipped
- **Scope:** New floating panel `app/admin/cad/components/OffsetPanel.tsx` modeled on `OnLineOffsetPanel`. Distance number input (autofocus + select-on-open), unit `<select>` (FT / IN / MILE / M / CM / MM, defaulting to the drawing's `linearUnit`), side toggle (LEFT / RIGHT / BOTH), corner-handling dropdown (MITER / ROUND / CHAMFER), Cancel + Apply buttons. Writes values straight to `useToolStore` so the canvas preview reads them every frame. Apply calls a new helper `applyOffsetFromPanel(state, displayPreferences)` that converts the entered distance from the chosen unit to feet, builds an `OffsetConfig`, and invokes the existing `applyInteractiveOffset` so the new offset feature lands in the drawing.
- **Files:** `app/admin/cad/components/OffsetPanel.tsx`, `lib/cad/operations/apply-offset-from-panel.ts`, `app/admin/cad/components/CanvasViewport.tsx`, `__tests__/cad/operations/apply-offset-from-panel.test.ts`
- **Done when:** With the OFFSET tool active + a source line selected, the panel renders with a real distance input + working units selector; Apply creates a parallel-offset feature next to the source.
- **Depends on:** —
- **Done:** New pure helper `lib/cad/operations/apply-offset-from-panel.ts` exposes `distanceToFeet(distance, unit)` (multiplies through the same constants `parse-length.ts` uses — FT/IN/MILE/M/CM/MM — and returns `null` on zero, negative, NaN, or Infinity inputs) plus `applyOffsetFromPanel({sourceId, distance, unit, side, cornerHandling})` which short-circuits when the source id is missing or the distance can't convert, then hands off to the existing `applyInteractiveOffset(sourceId, distanceFeet, side, corner, {mode: 'PARALLEL'})` operation. New floating panel `app/admin/cad/components/OffsetPanel.tsx` mirrors the `OnLineOffsetPanel` UX: 288px-wide dark panel docked to the bottom-left, distance number input (auto-select after 80ms), unit `<select>` defaulting to the drawing's `displayPreferences.linearUnit` (read once from `useDrawingStore`), feet-equivalent preview ("= 3.811 ft") when the user picks a non-FT unit, side select (Left/Right/Both) bound to `useToolStore.setOffsetSide`, corner handling select bound to `useToolStore.setOffsetCornerHandling`, Apply (Enter) + Cancel (Esc) buttons. Apply button is disabled until both the source id is set + the distance is positive-finite. Distance + unit are tracked in a local ref so the surveyor can swap units without losing what they typed; on every change the panel mirrors the feet-equivalent into `useToolStore.setOffsetDistance` so the canvas preview pipeline keeps working. `CanvasViewport` mounts the panel right next to the existing `OnLineOffsetPanel` mount, gated on `activeTool === 'OFFSET' && offsetSourceId !== null`. Commit + Cancel both call `setOffsetSourceId(null)` so the panel unmounts cleanly. 17 vitest specs lock the helper: all 6 unit conversions with anchor values (12in → 1ft, 1mi → 5280ft, 1m → 1/0.3048ft, etc.), every rejection path (zero/negative/NaN/Infinity, missing sourceId), and the happy-path engine call shape (correct distance, side, corner, mode=PARALLEL). React-side panel interactivity will be exercised by the Phase 3 Playwright spec (Slice 7). `tsc` + `eslint` clean.

#### Slice 2 — Right-click "Create offset" → opens the panel ✅ shipped
- **Scope:** Replace the existing "Offset Copy…" entry in `FeatureContextMenu.tsx` (which uses `window.prompt()`) with a "Create offset…" entry that (a) activates the OFFSET tool via `useToolStore.setTool('OFFSET')`, (b) presets `offsetSourceId` to the right-clicked feature's id, and (c) emits a `cad:open-offset-panel` custom event that `CanvasViewport` listens for and uses to mount `OffsetPanel`. Single-source workflow — no flat prompt anymore.
- **Files:** `app/admin/cad/components/FeatureContextMenu.tsx`, `lib/cad/operations/activate-offset-tool.ts`, `__tests__/cad/operations/activate-offset-tool.test.ts`
- **Done when:** Right-click a line → "Create offset…" → the floating panel from Slice 1 opens with the line preset as the source.
- **Depends on:** Slice 1
- **Done:** Slice-1's panel already mounts on `activeTool === 'OFFSET' && offsetSourceId !== null`, so the custom-event indirection the original scope called for wasn't actually needed — the menu just has to set those two tool-store fields and the panel auto-mounts. New helper `lib/cad/operations/activate-offset-tool.ts` exports `activateOffsetTool(sourceId)` which (a) calls `useToolStore.setTool('OFFSET')` then (b) `setOffsetSourceId(sourceId)` — the order matters because `setTool` cycles through `defaultToolState` and resets the source id to null along the way. Returns `false` on empty/null/undefined sourceId so the context menu doesn't accidentally enter OFFSET with no target. `FeatureContextMenu.tsx`'s old `handleOffset` (which called `window.prompt` + `offsetSelectionByDistance`) is replaced with `handleCreateOffset` that just calls the helper; the menu item's label is now "Create offset…" and it's disabled when `featureId` is null (right-click happened on empty space). The unused `offsetSelectionByDistance` import was removed in the same edit to keep lint quiet. 6 vitest specs lock the helper: flips activeTool, sets source id, assigns source AFTER tool switch (proves the ordering invariant against a leftover pre-seeded value), and all three rejection paths (null/undefined/empty string leave the tool + source untouched). `tsc` + `eslint` clean.

#### Slice 3 — Tag offsets with `offsetSourceId` / `offsetDistance` / `offsetUnit`
- **Scope:** `applyInteractiveOffset` already creates the new feature; have it also write three properties so the offset is identifiable after creation: `offsetSourceId` (the source feature's id), `offsetDistance` (the distance the user typed, in whatever unit they chose), `offsetUnit` (the chosen unit token, e.g. `'FT'`). New helper `isOffsetFeature(feature)` + `getOffsetMetadata(feature)` exported from `lib/cad/operations/offset-metadata.ts` so the inspector + the propagator can pick them up. Save/load already round-trip `properties` via the existing JSON serialization, so no schema change.
- **Files:** `lib/cad/operations.ts` (extend `applyInteractiveOffset`), `lib/cad/operations/offset-metadata.ts`, `__tests__/cad/operations/offset-metadata.test.ts`
- **Done when:** After committing an offset, the new feature carries the three properties; the helpers correctly identify it as an offset of a specific source at a specific distance/unit.
- **Depends on:** Slice 1

### Phase 2 — Edit an existing offset (Slices 4–6)

#### Slice 4 — PropertyPanel "Offset Source" section
- **Scope:** Extend `PropertyPanel.tsx` so when the selected feature has `properties.offsetSourceId`, it renders a new "Offset Source" section between the geometry section + the coordinates section: source feature label (clickable to select the source), distance number input pre-filled with `properties.offsetDistance`, unit `<select>` pre-filled with `properties.offsetUnit`. Read-only when the source feature has been deleted (handled gracefully).
- **Files:** `app/admin/cad/components/PropertyPanel.tsx`, `__tests__/cad/components/property-panel-offset.test.tsx`
- **Done when:** Selecting a feature that carries the Slice-3 properties shows the new section with the right values; non-offset features don't show it.
- **Depends on:** Slice 3

#### Slice 5 — Distance edit recomputes the offset live
- **Scope:** The distance input + unit selector in the Slice-4 section live-update the selected feature's geometry. Each commit (input blur or Enter) calls `recomputeOffsetFeature(feature, newDistance, newUnit)` which (a) reads the source feature by id, (b) re-runs the offset engine with the new distance, (c) replaces the selected feature's `geometry` in-place via `useDrawingStore.updateFeature`, (d) updates the saved `offsetDistance` + `offsetUnit` properties. Single undo entry per commit. Cancel discards the edit.
- **Files:** `lib/cad/operations/recompute-offset-feature.ts`, `app/admin/cad/components/PropertyPanel.tsx`, `__tests__/cad/operations/recompute-offset-feature.test.ts`
- **Done when:** Typing 12 → 15 in the distance field repositions the offset feature 3 ft farther from the source without remounting; undo restores the previous distance.
- **Depends on:** Slice 4

#### Slice 6 — Source-mutation propagator
- **Scope:** New `lib/cad/operations/offset-propagator.ts` mounted at app boot (mirrors `linked-instances.ts`) that subscribes to `useDrawingStore` mutations + watches every offset feature for its `offsetSourceId`. When a source feature's geometry changes (move, vertex edit, scale, etc.), every linked offset gets regenerated via the same `recomputeOffsetFeature` helper from Slice 5. A `_propagating` re-entry guard prevents the propagator's own writes from triggering another pass. Detached offsets (`offsetSourceId` set but source deleted) stop propagating + render a stale-link warning in the PropertyPanel.
- **Files:** `lib/cad/operations/offset-propagator.ts`, `app/admin/cad/page.tsx` (or wherever the CAD shell mounts subscribers), `__tests__/cad/operations/offset-propagator.test.ts`
- **Done when:** Moving the source line repositions every offset that points at it in real time; deleting the source surfaces the stale-link warning in the PropertyPanel.
- **Depends on:** Slice 5

### Phase 3 — Polish (Slices 7–8)

#### Slice 7 — Playwright smoke: right-click → create offset → edit → live update
- **Scope:** New `e2e/cad-offset-tool.spec.ts` that opens the CAD editor, draws a line, right-clicks it, picks "Create offset…", enters a distance + unit, clicks Apply, asserts a second parallel line renders, selects the new offset, edits the distance in the PropertyPanel, asserts the offset repositions in the same render frame.
- **Files:** `e2e/cad-offset-tool.spec.ts`
- **Done when:** `npm run e2e -- --grep cad-offset-tool` passes against a dev server.
- **Depends on:** Slice 5

#### Slice 8 — Vitest coverage for offset metadata + the propagator
- **Scope:** Fill in any coverage gaps the slices above didn't already cover — focused on the propagator's re-entry guard, the stale-link path, the unit-conversion edge cases (FT ↔ M ↔ MM round-trips), and a fuzz test for the offset engine with random distances in random units.
- **Files:** `__tests__/cad/operations/offset-propagator.test.ts` (extend), `__tests__/cad/geometry/offset-units.test.ts`
- **Done when:** Coverage report shows the offset path at ≥85% for the new code; `npx vitest run` reports 0 failures.
- **Depends on:** Slice 6

---

## Cross-cutting reminders (same workflow as the customizable-hub doc)

1. Implement → `npm run type-check && npm run lint` clean.
2. Add tests inside the slice (vitest specs for logic, Playwright for UI flows).
3. Annotate THIS doc with the completion note + commit hash.
4. Commit only the files the slice touched (`git add <specific>`).
5. Push to `claude/gifted-ramanujan-lQaEI`.
6. When every slice is shipped, MOVE this doc to `docs/planning/completed/`.

---

## TL;DR

- 8 slices covering the three user asks (right-click entry, numeric +
  unit panel, editable + live-linked offsets).
- Most of the engine + state machine + context menu + property panel
  already exist; the work is mostly wiring + a new floating panel
  component + a subscriber for live propagation.
- Phase 1 is the user-facing surface; Phase 2 is the "click an
  existing offset to edit it" loop; Phase 3 is verification.
