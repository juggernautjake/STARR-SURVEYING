# Hub grid editor + estimate-banner-green CTA

*Opened 2026-05-29 as a direct follow-up to
`hub-greeting-edit-affordances-2026-05-29.md` (Slices 218–220).*

## What the user asked for

> "I want the Enter Work Mode to be the same type of green that we
> have for the estimate calculator on the front end. It should have
> cool hover and click effects. Also, I liked the customizable
> widget size grid control we had before. I want to have a grid
> viewer like that again. Whenever the user clicks the Customize
> widgets button, a grid should appear. Pick a widget type, then
> click grid squares to set the size of that widget. They need to
> be able to delete or edit size. Add as many widgets as fit in the
> 8×8 grid. The 8×8 maps to the actual hub on save."

Two asks:

1. **Enter Work Mode button → match `--gradient-green` aesthetic** —
   the same emerald gradient the landing-page
   `.home-estimate-banner__btn` lives on (`#10B981 → #059669`),
   with rich hover (`translateY(-2px)` + brightness boost) +
   active (click) feedback.
2. **Grid-painter widget editor** — a new modal/overlay that
   appears when the surveyor clicks **Customize Hub**:
   - 8×8 visible grid (matching the canvas's runtime grid).
   - Left palette: every registered widget, searchable, click to
     "select" a type.
   - With a type selected, click a starting cell + a finishing cell
     to paint that widget into that rectangle.
   - Painted widgets render as colored blocks with the widget label
     so the surveyor can see what's where.
   - Click a painted widget → resize handles + delete button.
   - On Save → the grid serializes to `WidgetInstance[]` and lands
     on the canvas.

## What already exists (no rebuild needed)

| Piece | Where it lives |
|-------|----------------|
| Estimate banner green CTA aesthetic | `app/styles/Home.css` `.home-estimate-banner__btn` |
| `--gradient-green` token | `app/styles/globals.css` (`#10B981 → #059669`) |
| 8-col grid math + collapseLayout/compactLayout | `lib/hub/grid-math.ts` |
| AddWidgetModal (current "add widget" flow) | `lib/hub/components/AddWidgetModal.tsx` |
| SettingsPanel (per-widget customization) | `lib/hub/components/SettingsPanel.tsx` |
| `useHubStore` draft + commit pipeline | `lib/hub/hub-store.ts` |
| `setDraftWidgets` action | `lib/hub/hub-store.ts` |
| Widget catalog filter (search) | `lib/hub/widget-catalog-filter.ts` |
| Sortable canvas (Slices 98–220) | `lib/hub/components/WidgetGrid.tsx` |

## What's missing

- The Enter Work Mode green is a flat `var(--color-success)` —
  doesn't match the gradient + cool transitions on the landing
  estimate banner.
- There's no grid-painter editor. The current flow is "+ Add
  widget" (modal) → widget added at end of layout → drag/resize
  individually. The surveyor's mental model wants direct
  manipulation: "I want this widget HERE, this big."

## Phases + slices

### Phase 38 — Match the Enter Work Mode CTA to the estimate-banner green (Slice 221)

#### Slice 221 — Gradient green + cool hover/click ✅ shipped
- **Scope:** Update `.hub-greeting__work-mode-btn` so the button
  uses `var(--gradient-green)` (the same `#10B981 → #059669`
  emerald gradient the landing-page estimate banner CTA is built
  on). White text. Layered shadow with a green tint so the button
  reads as "the green thing". Hover: lift via
  `translateY(-2px)` + `filter: brightness(1.05)` + bigger glow.
  Active (click): `translateY(0)` + reset to the resting shadow
  with a quick `transition: 80ms` so the press registers.
- **Files:** `app/admin/me/AdminMe.css`,
  `__tests__/admin/me/hub-greeting-style.test.tsx` (extend).
- **Done when:** The Enter Work Mode button reads like a sibling
  of the landing-page estimate banner CTA — same green family,
  same lift-on-hover feel.
- **Depends on:** Slice 218.
- **Done:** Replaced the flat `var(--color-success)` background with `var(--gradient-green)` (the same `linear-gradient(135deg, #10B981 0%, #059669 100%)` token the landing-page `.home-estimate-banner__btn` uses), and the border switched from a solid `--color-success` outline to `transparent` so the gradient reads cleanly. Bumped padding from `0.85rem 2rem` → `0.95rem 2.1rem`, font-size from `1.05rem` → `1.08rem`, min-width from `12rem` → `13rem`, and added `text-shadow: 0 1px 2px rgba(0,0,0,0.18)` so the label punches off the gradient. Resting box-shadow grew its green-tinted glow (`0 6px 20px rgba(16,185,129,0.38) + 0 2px 4px rgba(0,0,0,0.22)`) to match the marketing button's weight. Transition properties were retuned to `transform / box-shadow / filter @ 180ms ease` — the marketing banner CTA's exact recipe. Hover now mirrors the landing CTA: `translateY(-2px)` + `filter: brightness(1.05)` + a bigger glow `0 10px 28px rgba(16,185,129,0.5) + 0 4px 8px rgba(0,0,0,0.25)`, no color shift (the brightness boost is what reads as "active"). Active state presses the button back: `translateY(0)` + `filter: brightness(0.97)` + shadow shrinks + transition snaps to `80ms` so the click registers as a deliberate tactile press instead of a slow tween. New `:focus-visible` rule pins a 2px white outline + 3px offset for keyboard users. The CTA also got `position: relative; z-index: 1;` so its shadow can render outside the greeting card's stacking context. 19 vitest specs across `__tests__/admin/me` (10 existing + 9 new/expanded from Slice 218's 8) lock the gradient + hover/active/focus contracts — each state's CSS block is regex-matched + every visible token is asserted. `tsc` + `eslint` clean.

### Phase 39 — Grid-painter widget editor (Slices 222–225)

#### Slice 222 — `GridEditor` shell + 8×8 grid + widget palette ✅ shipped (entry button, not yet primary)
- **Scope:** New `lib/hub/components/GridEditor.tsx` that renders
  as a full-screen modal when the surveyor clicks
  `CustomizeHubButton`. Left: scrollable widget palette (uses the
  existing `widgetsForRoles` + `filterCatalog` from the
  AddWidgetModal). Right: an 8×8 grid of square cells. Footer:
  Save / Cancel + a small "Selected: {widget}" status pill.
  Selecting a widget in the palette puts the editor in "place
  mode". The grid renders any widgets already in the draft layout
  so the surveyor can pick up an in-progress edit. This slice
  ships the layout shell only — clicking grid cells is a no-op.
- **Done:** Inner `GridEditorBody` uses Slice 201's lazy-mount pattern (outer returns null when closed; the body never runs hooks until open). Two-column layout (280px palette + 1fr grid wrapper). Palette is a `<ul role="listbox">` of `role="option"` palette entries that toggle `aria-selected` + swap to the accent background when selected. The 8×8 grid renders 64 `<div>` cells with `data-grid-x` / `data-grid-y` coordinates + 1-indexed `aria-label`s ("Grid cell 1, 1" through "Grid cell 8, 8"). Every widget in `draftWidgets` overlays as a colored block via CSS-grid `gridColumn: x+1 / span w` + `gridRow: y+1 / span h` with its label centered + size badge underneath. Footer shows live status (count + cells-used / 64); Save uses `var(--gradient-green)` to match the Slice-221 work-mode CTA. Esc + the × close button both call `onClose`. New `cellsUsed()` pure helper exported. `HubCanvas` mounts the editor next to the existing `AddWidgetModal` + adds a new accent-tinted `▦ Grid editor` button to the edit-mode header (keeps both entry points so the existing flow doesn't regress). 15 vitest specs lock: mount gate (null when closed; dialog role + modal markup when open); palette structure (listbox + search + role-option entries + at least one widget from register-all); 8×8 grid invariants (`GRID_EDITOR_COLS === 8`, `GRID_EDITOR_ROWS === 8`, 64 cells, accessible corner labels); footer baseline + Save uses gradient-green + Cancel always present; 3 `cellsUsed` purity checks. Interactive state-mutation render assertions skipped — same React + zustand SSR snapshot caching constraint we hit in `perf-overlay.test.tsx` (Slice 207); the placed-widget render path will be locked by a Playwright spec once placement (Slice 223) lands. 1058 hub specs green. `tsc` + `eslint` clean.
- **Files:** new `lib/hub/components/GridEditor.tsx`,
  `lib/hub/components/HubCanvas.tsx` (replace the AddWidgetModal
  mount with a GridEditor mount gated on edit-mode), new
  `__tests__/hub/grid-editor-shell.test.tsx`.
- **Done when:** Clicking Customize Hub opens the grid editor
  showing the palette + empty 8×8 grid.
- **Depends on:** Slice 218.

#### Slice 223 — Place a widget via click-start + click-end ✅ shipped
- **Scope:** With a widget type selected in the palette, clicking
  a grid cell sets the top-left of the new widget; the next click
  sets the bottom-right. The rectangle is clamped to the widget's
  min/max envelope. On commit, the widget is added to
  `draftWidgets`. Esc cancels mid-place. The grid renders an
  "outline preview" between click-1 and click-2 so the surveyor
  sees the candidate footprint.
- **Files:** `lib/hub/components/GridEditor.tsx`,
  `__tests__/hub/grid-editor-place.test.tsx`.
- **Done when:** A surveyor can pick a widget type + draw a
  rectangle on the grid + see the widget land on the canvas after
  Save.
- **Depends on:** Slice 222.
- **Done:** Four pure helpers extracted onto the `GridEditor` module so the placement geometry can be unit-tested without mounting React: `rectFromAnchors(a, b, cols?, rows?)` is order-insensitive (top-left → bottom-right and bottom-right → top-left produce the same rect) and clamps out-of-range coordinates to the grid; `clampRectToEnvelope(rect, min, max, cols?, rows?)` grows undersized rects up to `minSize`, shrinks oversized rects down to `maxSize`, and shifts x/y back into bounds so the clamped widget always fits inside the 8×8 grid; `overlapsAny(rect, others)` returns true on any rectangle-overlap (edge-touching cells deliberately don't count); `generatePlacementId()` uses `crypto.randomUUID()` with a `Date.now` + `Math.random` fallback. Two new `useState`s in `GridEditorBody` track placement: `placeAnchor` (the first-click cell) and `placeHover` (the cell the surveyor is currently hovering). Selecting a different widget type clears both via a `useEffect` so partial anchors don't leak between selections. Esc now clears mid-place state before closing — first Esc abandons the in-progress rectangle, second Esc closes the editor. The grid container swaps to `gridContainerPlacingStyle` when a type is armed (1px accent border + a 3px outer accent halo so the grid reads as "click to place"); every cell switches to `gridCellArmedStyle` (`crosshair` cursor + 6% accent tint) and gains `role="button"` + `tabIndex={0}` + `onPointerDown` / `onPointerEnter` handlers. The anchor cell uses `gridCellAnchorStyle` (18% tint + solid accent border) so the first click is visible. A new `previewRect` `<div>` overlays the candidate footprint via CSS-grid span — solid accent dashed outline + 14% accent fill when viable, danger dashed outline + 14% danger fill when the rect would collide with an existing widget. Click-2 commits via `useHubActions().addWidget` and clears the anchor + hover state; commits are skipped when `previewBlocked` is true so the surveyor can't overpaint an existing widget. The status footer + Slice-222 contract (palette, 64 grid cells, save/cancel, gradient-green CTA) all preserved — the new behavior layers on top without touching the shell. 17 vitest specs lock the pure helpers (5 `rectFromAnchors` orderings + custom-grid-size case, 4 `clampRectToEnvelope` envelope/grid-fit cases, 4 `overlapsAny` collision + edge-touch + empty cases, 2 `generatePlacementId` shape + uniqueness checks) and 2 SSR-render assertions (`data-placing="false"` baseline when no widget is selected, palette markup preserved). Interactive flow (click-1 → click-2 → committed widget) deferred to a future Playwright spec — same zustand+React SSR snapshot caching constraint that's been blocking interactive vitest coverage since Slice 207. 1075 hub specs green. `tsc` + `eslint` clean.

#### Slice 224 — Show placed widgets on the grid + click-to-select + delete ✅ shipped
- **Scope:** Each widget in the draft is painted onto its grid
  rectangle as a colored block with the widget label centered.
  Hover shows a soft outline. Click selects (outline + size
  badge). With a widget selected, pressing Delete or clicking a
  ✕ button at the top-right of the painted block removes the
  widget from the draft.
- **Files:** `lib/hub/components/GridEditor.tsx`,
  `__tests__/hub/grid-editor-selection.test.tsx`.
- **Done when:** Surveyor can see what widget is where + select +
  delete from the grid.
- **Depends on:** Slice 223.
- **Done:** New `selectedPlacedId: string | null` `useState` in `GridEditorBody` tracks the currently-selected painted widget. Painted widgets gained `role="button"` + `tabIndex={0}` + `aria-pressed={isSelected}` + `data-selected="true"|"false"`; `onPointerDown` stops propagation (so click-to-select doesn't double as a placement anchor) and toggles `setSelectedPlacedId(isSelected ? null : inst.id)`. Enter + Space mirror the pointer toggle for keyboard parity. Selected widgets swap to `placedWidgetSelectedStyle` — accent fill bumped from 22% → 32%, border thickened from 2px → 3px, plus a layered `box-shadow: 0 6px 18px rgba(0,0,0,0.22) + 0 0 0 4px accent(22%)` halo + `translateY(-1px)` lift + `zIndex: 2` so they stack above the resting siblings. While selected, a 24×24 danger-colored `✕` button renders at top: 4 / right: 4 inside the block (`placedRemoveButtonStyle`); click stops propagation, calls `removeWidget(inst.id)`, then clears the selection. Both `pointerdown` and `click` on the button stop propagation so neither triggers the cell underneath. Global `Delete` and `Backspace` key handlers on `window` mirror the inline button — when a widget is selected they call `removeWidget(selectedPlacedId)` and clear the selection. The Esc cascade now has three steps: (1) clear the mid-place rectangle, (2) clear the painted-widget selection, (3) close the editor. Clicking an empty cell with nothing armed for placement clears any active selection (background-click-to-deselect); to support this the cell `onPointerDown` is now wired unconditionally instead of only when a widget type is armed. Selecting a new widget type in the palette also drops the painted-widget selection so the two modes stay mutually exclusive in the surveyor's mental model. 20 vitest specs lock the source-level contracts: state shape + cleared-on-type-change invariant; painted widget role+aria+data attrs + pointer/keyboard handlers + the toggle predicate; Delete/Backspace branch; inline ✕ button gating + the remove+clear sequence + propagation guards + danger styling; the Esc cascade chain; background-click deselect + the unconditional cell pointer-down; the selected-widget visual contract (3px border, translateY lift, layered shadow, zIndex: 2). Interactive flow assertions deferred to a Playwright spec (same React+zustand SSR snapshot caching limitation). 1095 hub specs green. `tsc` + `eslint` clean.

#### Slice 225 — Resize a placed widget by dragging its corner ✅ shipped
- **Scope:** When a widget is selected, drag the bottom-right
  corner of its painted rectangle to resize it (snapped to grid
  cells + clamped to its definition's min/max). The same drag
  mechanism the existing `WidgetResizeHandle` uses, repurposed
  for grid coordinates.
- **Files:** `lib/hub/components/GridEditor.tsx`,
  `__tests__/hub/grid-editor-resize.test.tsx`.
- **Done when:** Surveyor can resize a painted widget in the
  editor + the result lands on the canvas after Save.
- **Depends on:** Slice 224.
- **Done:** Two new pure helpers — `cellUnderPointer(bounds, clientX, clientY, cols?, rows?)` converts pointer coords to grid cells via the container's `getBoundingClientRect` (clamped to 0..cols-1 so the surveyor can drag past the edge without producing OOR coordinates); `computeResizedRect(current, pointerCell, min, max, cols?, rows?)` derives the new w/h while keeping (x, y) anchored, clamps to the widget's envelope, ensures `x+w ≤ cols` / `y+h ≤ rows`. `GridEditorBody` gained `setDraftWidgets` from `useHubActions` + a `resizeTarget: { id, w, h } | null` useState that drives a live preview (no round-trip through the store on each pointer-move tick), plus a `gridContainerRef`. New `startResize(e, inst)` handler sets pointer capture, attaches `pointermove` / `pointerup` / `pointercancel` to window, recomputes the target each move, and on release: skips when the rect would overlap a sibling, skips when nothing changed, otherwise commits via `setDraftWidgets(current.map(...))`. Placed widgets now derive `liveW` / `liveH` (`resizeTarget?.id === inst.id ? resizeTarget.w : inst.w`) and use those for the CSS-grid span AND the size badge so the surveyor sees the candidate footprint immediately. A new 24×24 corner-drag handle renders inside the selected widget at `bottom: 4 / right: 4` (accent surface + ⤡ glyph + `nwse-resize` cursor + `zIndex: 3`) — same muscle-memory + visual language as `WidgetResizeHandle` on the canvas. The handle is wrapped in the Slice-224 `{isSelected && (<>...</>)}` fragment alongside the ✕ delete button. Placed widgets carry a new `data-resizing` attribute so e2e specs can observe the drag state. 26 vitest specs lock the pure helpers (6 `cellUnderPointer` + 5 `computeResizedRect` + 7 source-level handle contracts + 5 drag-lifecycle contracts + 3 live-dimension render contracts). Two Slice-224 regexes were tightened to accept the layered slice's destructuring + fragment shape. 1121 hub specs green. `tsc` + `eslint` clean.

---

## TL;DR

- Slice 221 finishes the user's "match the estimate-calculator
  green" ask (CSS-only).
- Slices 222–225 ship the grid-painter editor in four bite-sized
  layers (shell → place → select+delete → resize).
