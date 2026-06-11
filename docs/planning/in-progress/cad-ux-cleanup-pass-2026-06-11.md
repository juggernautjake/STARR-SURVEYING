# CAD UX cleanup pass — 2026-06-11

*User session notes:*
> "Just from putzing around a bit — here are notes I noticed" (full list
> at the bottom of this doc.) The asks span quality-of-life polish,
> rendering correctness, hotkey conflicts, label dedup, layer panel
> behavior, import naming, and a couple of perf hotspots.

User-confirmed answers (2026-06-11):
- **Extraneous** = points AND layers.
- **Move points / master file** = filter source to the master points file
  only; duplicate layers must not appear as a source.
- **POINT_CODE vs POINT_DESCRIPTION duplicates** = auto-hide when the two
  labels would render identical text; keep both toggles otherwise.
- **`s` hotkey chord** = plain `s` is instant Select, Scale + Spline move
  off the `s` prefix (so the chord HUD never blocks tool changes).

## Constraints baked into every slice
- Stay on branch `claude/gifted-ramanujan-lQaEI`. Slice = tsc + lint +
  test + commit + push, per the established workflow.
- Every new command, toggle, and setting must be **AI-controllable**:
  - tool/UI actions ride the existing `BindableAction` registry in
    `lib/cad/hotkeys/registry.ts` so they show up in the command palette
    and the AI tool registry can fire them.
  - persistent flags live in `doc.settings` / `layer.displayPreferences`
    so the AI tool registry can read + update them via the existing
    `updateSettings` / `updateLayer` writers.
- Source-lock tests for the canvas paths; pure unit tests for store /
  parser / hotkey changes (matches the rest of this codebase).

## Menus + settings surface to update
- **`LayerPanel` row context menu** — add "Quick-add points…", "Move
  points from master into this layer…", and keep "Duplicate layer" /
  "Rename" / "Delete" intact.
- **`FeatureContextMenu`** (right-click on a feature) — confirm "Move to
  layer →" submenu exists; add a small "Show on layer panel" item that
  scrolls the panel to the feature without expanding its layer (paired
  with the Slice 1 panel-expand fix).
- **Hotkey settings page (`KeyboardShortcutOverlay`)** — surface the new
  bindings for Select / Scale / Spline so the user can see + remap them.
- **Generic right-click on the canvas** (`PickModeContextMenu` / new
  background menu) — add "Refresh canvas" wired to the new
  regenerate command from Slice 11.
- **`SettingsDialog`** — add a "Box-select direction hint" toggle so the
  blue/green convention can be silenced when the surveyor doesn't want it
  (Slice 12 ships the hint + the toggle).

## Slices

### Slice 1 — Layer panel selection-sync: less invasive
**File:** `app/admin/cad/components/LayerPanel.tsx` (the `useEffect`
keyed on `selectionKey` around L117–144 — added in the prior
selection-sync work).

**Today:** every selection change unions new layer/group ids into the
expanded sets and never collapses them, so the panel ratchets open until
the user manually collapses each row.

**Fix:**
1. Track an `autoExpanded` set so the effect only inserts ids that the
   USER hasn't already collapsed (collapsing once disables auto-expand
   for that id until next session).
2. On selection CLEAR (`selectedIds.size === 0`), collapse every id we
   added via auto-expand. User-expanded ids stay open.
3. Scroll the focused feature row into view without forcing the layer
   open when it's already in the viewport — `IntersectionObserver` or a
   single `getBoundingClientRect` check.

**Tests:** `__tests__/cad/ui/layer-panel-selection-sync.test.ts` —
extend with: (a) collapsing an auto-expanded layer suppresses re-expand
for the same id; (b) clearing selection collapses only auto-expanded ids;
(c) source-lock the IntersectionObserver / scroll guard.

### Slice 2 — TRV duplicate point names: keep the original
**File:** `lib/cad/io/trv-to-drawing.ts` (the `pointKey` builder around
L143).

**Today:** point IDs are computed `trv-point:${trvId}` and the second
`22fnd` silently overwrites the first.

**Fix:** when mapping points, walk the source list once and assign:
- first occurrence of a name → unchanged (`22fnd`)
- Nth duplicate → `${name}:${N-1}` (so the *second* gets `:1`, third
  `:2`, etc., matching the user's expected sort order).

Preserve the round-trip contract: track the rename in a
`trvDerived.renamedPointKeys` echo so the writer can restore the
verbatim source on export. (Out-of-scope for this slice if the verbatim
TRV already round-trips identical bytes — a tracked echo is enough.)

**Tests:** new `__tests__/cad/io/trv-duplicate-point-names.test.ts` with
a synthetic fixture: 3 points named `22fnd`. Assert resulting feature
ids `trv-point:22fnd`, `trv-point:22fnd:1`, `trv-point:22fnd:2`, and
that the layer/group panel sorts them in that order.

### Slice 3 — Move-points search: comma multi-search + master-only source
**File:** `app/admin/cad/components/NewLayerDialog.tsx` (also wherever
the "Move points into this layer" flow lives — likely
`LayerTransferDialog.tsx`).

**Today:** the search is a single substring match; commas are part of the
query and never match.

**Fix (search):** split the query on commas, trim each token, and match
any token (OR). Keep substring semantics so partial names work. A token
that's empty (e.g. trailing comma) is ignored.

**Fix (source filter):** add a `sourceMode` toggle defaulting to
`MASTER_ONLY`:
- `MASTER_ONLY` — the source pool is the canonical master points file
  (POINT features that originated from the imported TRV/CSV, i.e. NOT
  on a layer the user spawned via "Duplicate Layer"). Implemented by
  flagging duplicate-layer features at creation time (`layer.duplicateOf:
  string | null` already exists or is added in Slice 7) and excluding
  any feature whose layer has a non-null `duplicateOf`.
- `ALL_LAYERS` — the legacy unfiltered pool, available for power-users
  who explicitly want to pull from a duplicate.

**Tests:**
- `__tests__/cad/ui/move-points-search.test.ts` — comma split returns
  the union; whitespace trimmed; empty tokens ignored.
- `__tests__/cad/ui/move-points-source-filter.test.ts` — MASTER_ONLY
  excludes points on duplicate layers; ALL_LAYERS includes them.

### Slice 4 — Color picker shows a real swatch
**File:** `app/admin/cad/components/NewLayerDialog.tsx` (and any other
swatch sites — likely `PropertyPanel.tsx` per the user note).

**Today:** native `<input type="color">` with `bg-transparent` shows the
browser's default "dot in a box" instead of the chosen color.

**Fix:** wrap the native input in a label that paints its background
from the current value, so the visible swatch IS the chosen color. The
native picker still opens on click; only the rendering changes.

```tsx
<label
  className="h-7 w-10 rounded border border-gray-600 cursor-pointer"
  style={{ backgroundColor: color }}
>
  <input
    type="color"
    value={color}
    onChange={(e) => onChange(e.target.value)}
    className="opacity-0 w-full h-full cursor-pointer"
  />
</label>
```

Audit `LayerPanel`, `PropertyPanel`, `LayerPreferencesPanel`,
`CertificationEditor` for other broken swatches and apply the same
pattern. Extract into a small `<ColorSwatchInput>` so every site is
consistent.

**Tests:** snapshot/source-lock on the swatch wrapper structure (every
use site renders the `style={{ backgroundColor: ... }}` form).

### Slice 5 — Hotkey: `s` = instant Select; move Scale + Spline off `s`
**File:** `lib/cad/hotkeys/registry.ts` + `app/admin/cad/hooks/useHotkeys.ts`
(+ engine if needed).

**Today:** `s` is a chord prefix. `s c` = Scale, `s p` = Spline. Plain
`s` waits 6 s before firing Select; the chord HUD has no visible
dismiss.

**Fix:**
1. Rebind in the default preset:
   - `s` → `tool.select` (no chord, fires on keydown)
   - `SC` (shift-chord, two-key but caps-distinct from `s`) → `tool.scale`
   - `SP` (same form) → `tool.spline`
   - leave AutoCAD preset alone (it's opt-in).
2. Wire Escape to call `engine.flushPending()` + clear the buffered
   prefix so the chord HUD goes away on demand.
3. Update the chord HUD overlay (already emitted on
   `cad:chordPrefixChanged`) to render a small "Esc to cancel" hint when
   a prefix is buffered.
4. Refresh `KeyboardShortcutOverlay` so the user sees the new bindings.

**Tests:** `__tests__/cad/hotkeys/select-instant.test.ts` — plain `s`
fires `tool.select` synchronously (no chord delay); Esc clears a buffered
prefix; new chord forms resolve.

### Slice 6 — POINT_CODE / POINT_DESCRIPTION dedup when identical
**File:** `lib/cad/labels/generate-labels.ts` (around L196–232).

**Today:** for points where `code == description` (the common TRV case
where the importer sets both from `p.description`), both labels render
the same text side-by-side.

**Fix:** when generating labels for a feature, if `showPointCodes` and
`showPointDescriptions` are both on AND the resolved code text equals
the description text (case-insensitive trim), emit only the CODE label
and skip the DESCRIPTION. Toggles still work as expected for the rare
points where the two truly differ — no behavior change there.

Surface the result on the feature so the AI can read it: include the
suppressed-duplicate kind in a `meta` field on the resolved label so
downstream tools know why the description didn't render.

**Tests:** `__tests__/cad/labels/dedup-identical-code-description.test.ts`
— code-eq-description suppresses DESCRIPTION; code-ne-description keeps
both; toggles still work independently.

### Slice 7 — Don't create an empty "Layer 1" on a fresh drawing + duplicate-layer phantom-points fix
**Files:** `lib/cad/styles/default-layers.ts`, `lib/cad/store/drawing-store.ts`,
`app/admin/cad/components/LayerPanel.tsx` (the duplicate-layer action
around L284–308).

**Today:**
- A new drawing always ships with `SURVEY-INFO` (protected, holds
  furniture) AND `DEFAULT` ("Layer 1", empty). The DEFAULT layer is
  invisible noise on first open.
- Duplicate-layer copies all features via `transferSelectionToLayer(…,
  keepOriginals: true)`. The user reports +5 phantom points after a
  duplicate — likely text labels / derived features being counted, or
  the transfer is over-selecting.

**Fix (empty Layer 1):** drop `DEFAULT` from the default ship set. The
new-drawing flow creates `DEFAULT` lazily on first geometry placement
(or first AI tool that needs an active layer) so the active-layer
contract is preserved. AI-controllable: expose `ensureDefaultLayer` as a
bindable so any tool can call it.

**Fix (phantom points):** trace the +5 — likely (a) the layer-feature
count includes `textLabels[]` entries, or (b) the duplicate transfer
also pulls auto-generated derived features (the `trvDerived` echoes or
the area-label TEXT). Audit `transferSelectionToLayer` to copy only
canonical features and skip anything with `properties.derived === true`
or whose `trvElementKind` is `'ELEMENT_TEXT'` auto-spawn.

Add a layer-feature-count selector that reports both `featureCount` and
`labelCount` so the count next to the layer name is honest.

**Tests:**
- `__tests__/cad/store/new-drawing-default-layers.test.ts` — new doc
  has SURVEY-INFO only; placing the first feature lazily creates
  DEFAULT.
- `__tests__/cad/store/duplicate-layer-fidelity.test.ts` — given a
  layer with N canonical features + M derived labels, the duplicate
  ends up with N canonical features and zero spurious adds.

### Slice 8 — Quick-add points to an existing layer
**Files:** `app/admin/cad/components/LayerPanel.tsx`,
`app/admin/cad/components/LayerTransferDialog.tsx` (probably).

**Add:**
- A small `+` button on each layer row (next to the eye / lock icons)
  that opens the existing transfer dialog pre-targeted at this layer.
- A right-click menu item "Quick-add points…" with the same effect.
- A new bindable action `layer.quickAdd` so the AI / command palette
  can target a specific layer by id.

**AI-controllable:** the AI tool registry already has a
`moveFeaturesToLayer` helper — extend it so a "target layer id" plus a
"source point name list" yields the same outcome the dialog does.

**Tests:** `__tests__/cad/ui/quick-add-points-to-layer.test.ts` —
clicking `+` opens the dialog with `targetLayerId` pre-set; the
right-click menu fires the same event; the bindable action does too.

### Slice 9 — Point-label drag grouping: siblings move together
**File:** `app/admin/cad/components/CanvasViewport.tsx` (L9614–9621 and
the commit code at L11945–11950).

**Today:** when `pointLabelGrouping === 'GROUPED'` and the surveyor
drags a POINT_NAME / POINT_CODE / POINT_DESCRIPTION label, the handler
*records* sibling label ids in `labelDragRef.current.siblings` but the
move / commit logic never applies the drag delta to them. Symptom: name
moves alone, code/description stay behind.

**Fix:**
1. During the drag-update tick, apply the same `(dx, dy)` delta the
   primary label gets to every sibling in `siblings`, persisting it
   through the same `label.offset` mutation path.
2. On commit, write the updated offsets for the siblings too (one
   `updateFeature` per affected label, batched into a single undo entry
   keyed by `dragSession`).
3. On Escape / drop-cancel, restore every sibling's original offset.

`INDEPENDENT` mode keeps today's behavior.

**Tests:** `__tests__/cad/ui/point-label-drag-grouping.test.ts` —
source-lock the sibling-move + commit + undo paths.

### Slice 10 — Layer display preferences sync (random toggle / out-of-sync state)
**File:** `app/admin/cad/components/LayerPreferencesPanel.tsx` +
`lib/cad/labels/regenerate-layer-labels.ts` (or wherever
`regenerateLayerLabels` lives).

**Today:** the toggles update `layer.displayPreferences.*` and call
`regenerateLayerLabels()`. User reports the visible state of labels
desyncs from the toggle (point names showed when set to off; toggling
on then off didn't change anything until the second toggle).

**Investigation:**
1. Audit whether `regenerateLayerLabels` is idempotent. If a label is
   created with `visible: true` and the toggle goes off, the regen must
   either delete the label or flip its `visible`. A re-run that *adds*
   the label back regardless is the most likely root cause.
2. Audit `textLabels[]` for stale entries with `visible: false` that the
   render path still draws (the slice-6 dedup may interact here).
3. Audit `useEffect` deps in the preferences panel for stale closures
   that re-emit the previous value.

**Fix:** make `regenerateLayerLabels` derive the visible set from the
current `displayPreferences` (declarative), not append/remove
imperatively. Each toggle is a single store write → declarative regen →
single render. Add a defensive `key` that includes the prefs hash so
React-level memoization can't lock to a stale state.

**Tests:** `__tests__/cad/labels/preferences-sync.test.ts` — every
toggle combination produces the expected set of visible labels (no
"toggle twice to see effect").

### Slice 11 — Manual canvas regenerate + perceived-lag pass
**Files:** `app/admin/cad/components/CanvasViewport.tsx`,
`app/admin/cad/hooks/useHotkeys.ts`, `lib/cad/hotkeys/registry.ts`,
right-click background menu.

**Today:** the user reports occasional noticeable delay between making a
change and seeing it on the drawing. Root cause is probably one of:
(a) a render pass that re-tessellates everything when it only needs
to re-tessellate the changed feature; (b) a debounce that's tuned too
long; (c) a `useEffect` chain with stale state.

**Fix in two parts:**
1. **Escape hatch:** add a bindable `view.regenerate` action (`R` key by
   default, F5 fallback) that flushes every pending render queue, calls
   `requestAnimationFrame(() => renderFeatures())`, and clears the LOD /
   simplify caches. Expose it on the canvas right-click context menu as
   "Refresh canvas" and add a corresponding AI tool entry.
2. **Investigation pass:** instrument the canvas renderer with simple
   `performance.now()` markers under a debug flag. Identify the top 1–2
   slowest re-renders after a typical change (label edit, fill change,
   point move) and shrink the re-tessellation scope to just the touched
   features.

**Tests:** `__tests__/cad/ui/regenerate-action.test.ts` — `view.regenerate`
dispatches `cad:regenerateCanvas`; the canvas listener clears the LOD
cache; the right-click menu item fires the same event.

### Slice 12 — Box-select direction hint + opt-out
**File:** `app/admin/cad/components/CanvasViewport.tsx` (box-select
render at L~4402), `SettingsDialog.tsx`.

**Today:** box-select is blue (window, left-to-right) vs green
(crossing, right-to-left). Standard CAD convention but undocumented —
the surveyor reads it as "east vs west".

**Fix:**
1. Show a tiny status-bar caption while box-selecting: "Window
   (encloses fully)" or "Crossing (intersects)". Disappears the moment
   the drag ends. No extra clicks, no modal, just a quick legend that
   teaches the convention.
2. Add a `boxSelectColorHint: boolean` doc-setting (default true).
   Surface it in `SettingsDialog` under Interaction → Box select. When
   off, render the box in a single neutral color (no semantic
   distinction).
3. AI-controllable via `updateSettings({ boxSelectColorHint: false })`.

**Tests:** `__tests__/cad/ui/box-select-direction-hint.test.ts` — the
caption text reflects the drag direction; the setting hides the hint.

### Slice 13 — Scale tool: behavior with extreme survey sizes
**Files:** `lib/cad/operations/scale.ts` (or whichever module owns the
Scale tool), `app/admin/cad/components/CanvasViewport.tsx` tool handlers.

**Today:** the user reports the Scale function feels "limited /
finnicky depending on survey properties like size". Most likely
culprits:
1. Scale base-point picking is in screen pixels, so on a giant survey
   the snap radius becomes a tiny fraction of a world foot and the user
   can't grab the right base point.
2. Scale factor input is clamped or rounded in a way that breaks at
   very small or very large factors (e.g. `0.001` or `1000`).
3. The preview re-renders every mouse-move without a debounce.

**Fix:**
1. Make snap radius for Scale's base + reference picks a constant
   *world-unit* distance scaled by zoom (mirror the world-constant fill
   pattern fix from the prior session).
2. Audit the factor clamp; widen to `1e-4 … 1e4` (the surveyor will
   never legitimately exceed that) and replace `parseFloat`-loses-
   precision paths with a string-typed input.
3. Throttle the live preview to 60 Hz via `requestAnimationFrame`.

**Tests:** `__tests__/cad/operations/scale-extremes.test.ts` — scaling
by 0.005 on a 50000-ft survey produces the correct vertex deltas
without snapping the base point to the wrong vertex; scale-by-1000 ditto.

## Order + risk

Recommended slice order (lowest-risk first → bigger investigations
last):

1. Slice 2 (TRV dup naming) — pure import code.
2. Slice 4 (color swatch) — markup-only.
3. Slice 6 (code/desc dedup) — pure label-generation helper.
4. Slice 5 (hotkey rebind + Esc) — registry + engine.
5. Slice 3 (move-points search + master filter) — dialog + store.
6. Slice 8 (quick-add to layer) — UI surfaces + action.
7. Slice 1 (less-invasive panel expand) — UI behavior.
8. Slice 7 (empty Layer 1 + duplicate phantom points) — store + tests.
9. Slice 9 (label drag grouping) — canvas drag commit.
10. Slice 12 (box-select hint + opt-out) — small UI.
11. Slice 10 (display-prefs sync) — needs targeted investigation.
12. Slice 11 (regenerate + lag pass) — perf, broader.
13. Slice 13 (scale tool) — perf + behavior, broader.

## Original user-session notes (for traceability)

- Need feature to add/quick-add items/points to layer after creation
- Occasionally noticeable delay between making changes and them being
  reflected on the drawing — need a refresh/regenerate tool
- Box select is blue / green based on direction — is the distinction
  necessary?
- New survey generates an empty "Layer1"
- Color picker doesn't preview the color (shows a dot in a box)
- Move-points search ignores commas → can only search one name
- Need to separate moving points into a layer from the master points
  file vs duplicate layers
- Scale function feels limited / finnicky depending on survey size
- Program possibly creating extraneous points + layers
- Dragging a point name doesn't move the code / description with it
- POINT_CODE + POINT_DESCRIPTION render duplicates on most points
- Selecting points expands the layer panel too aggressively
- Layer display-pref toggles desync from the on-canvas state
- `s` hotkey overrides Select with Scale / Spline chord
- Duplicating a layer adds 5 phantom points
- TRV duplicate names import as `22fnd:1, 22fnd:2` instead of leaving
  the original as `22fnd` + numbering dups from `:1`

## TL;DR
Thirteen targeted slices clean up the small UX papercuts (color swatch,
move-points search, label dedup, hotkey conflict, panel auto-expand,
TRV duplicate naming, quick-add to layer, box-select hint), fix the two
correctness bugs (point-label drag grouping, layer display-prefs
desync, empty "Layer 1" + duplicate phantom points), and open
investigations on the two perf / behavior items (canvas regenerate /
lag, Scale tool extremes). Every new command + flag is AI-controllable
through the existing bindable / settings surface; menus updated:
LayerPanel row context menu, FeatureContextMenu, KeyboardShortcutOverlay,
canvas right-click, SettingsDialog.
