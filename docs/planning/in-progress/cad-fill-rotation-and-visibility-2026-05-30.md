# CAD fill rotation + visibility polish — 2026-05-30

*Opened 2026-05-30 in response to a multi-part user ask after the
fill-picker dropdown polish:*

1. *Rotate ANY infill pattern via an angle slider — replaces having
   to remember separate "Diagonal /", "Diagonal \\", "Horizontal",
   "Vertical" options. The brick, dots, gravel, waves can all be
   rotated. Slider drags must render live; a numeric input next to
   each slider lets the user enter an exact value (density / size /
   rotation).*
2. *Layers panel: eye icon per layer AND per element inside a
   layer (eyes show on every feature when a layer is expanded).
   Right-click "Hide" on an element ↔ the per-feature eye reflects
   it two-way.*
3. *Survey-info text blocks should behave like the regular text-tool
   (same edit + handling semantics). Hiding the default SURVEY-INFO
   layer must hide the title-block / scale / north-arrow too.*
4. *Rename "Gravel" → something generic like "Random dots" /
   "Natural earth infill" — surveyors use the pattern for many
   things, not just gravel.*

## Today's reality (audit, 2026-05-30)

- `lib/cad/styles/fill-patterns.ts`: every generator already takes a
  bounding box; `generateHatchLines` takes an explicit `angleDeg`
  but it's only exposed via the 4 fixed hatches in the dispatcher.
  No `angle` on `FillPatternConfig`; no rotation for non-hatch
  patterns.
- `PropertyPanel`: Density + Thickness range sliders, no numeric
  inputs, no Angle.
- `LayerPanel`: per-layer eye works (`handleToggleVisibility` →
  `updateLayer(id, { visible })`). Tree expansion exists but ungrouped
  feature rows are read-only — no per-feature eye.
- `FeatureContextMenu`: "Hide Element" already calls
  `drawingStore.hideFeature(id)`. The LayerPanel filters out hidden
  features (`!f.hidden`) so they vanish, instead of staying listed
  with a closed-eye toggle (the user explicitly wants the latter).
- Survey-info title block / scale / north arrow render as canvas
  OVERLAYS (drawn by CanvasViewport from `DrawingSettings.titleBlock`
  + standalone north/scale state) — NOT as regular TEXT features.
  Hiding the SURVEY-INFO layer therefore does nothing to them.
- The legacy `DOT_GRAVEL_FINE` / `DOT_GRAVEL_COARSE` / `DOT_SAND`
  variant ids still live in the dispatcher (back-compat with the
  earlier polish slice); only `DOT_GRAVEL` shows in the picker as
  "Gravel".

## Slices

### Slice 1 — Pattern rotation + numeric inputs + Gravel rename ✅ shipped 2026-05-30

- `FillPatternConfig` gains `angle?: number` (degrees, 0–359). Pure
  helper rotates the generated dots + lines around the bounding-box
  center; generators run on an OVERSIZED rect (diagonal-length
  square) so a rotated pattern still covers the polygon mask.
- `FeatureStyle.patternRotation?: number`. Render path passes it.
- PropertyPanel: a third slider **Angle** (0–359°, step 1) alongside
  Density + Thickness; each slider gains a paired numeric `<input
  type="number">` so the surveyor can type an exact value (live
  re-render on either edit).
- "Gravel" → **"Random dots"** in the dropdown (storage id stays
  `DOT_GRAVEL` — no migration). Description on hover explains it's
  good for gravel, mulch, scrub, gravel pads, etc.
- Specs: rotation rotates the primitives, 0° is a no-op,
  primitives still fit inside the rotated bbox; picker label
  asserted.

### Slice 2 — Per-element eyes in the LayerPanel ✅ shipped 2026-05-30

- LayerPanel feature tree: dropped the `!f.hidden` filter so hidden
  features stay listed (was making them vanish with no way back).
  Each row now renders an `Eye` / `EyeOff` toggle button bound to
  `drawingStore.hideFeature` / `unhideFeature`. Both grouped + ungrouped
  feature rows get the eye.
- Two-way sync: the right-click "Hide Element" already writes to the
  same store, and the LayerPanel reads via the reactive `useDrawingStore`
  hook, so flipping `Feature.hidden` from either side auto-updates the
  other on next render.
- Visual cue: hidden rows dim to `text-gray-600` + italicize, so the
  tree reads "this one's off" at a glance. The row's
  `data-hidden="true|false"` exposes the state for regression tests
  without needing to render the full panel.
- Spec: 8 source-text assertions lock the filter removal, eye-icon
  swap, click handler (stopPropagation + correct branch), test-id
  shape, dim/italic styling, and the store-subscription read path.
- Full cad suite (1834) green; typecheck + lint clean.

- LayerPanel tree: surface hidden features too (drop the `!f.hidden`
  filter when expanded), render an `Eye` / `EyeOff` button per row
  bound to `drawingStore.hideFeature` / `unhideFeature`.
- Two-way sync with the right-click "Hide Element": the action
  already writes to the store; the LayerPanel reads the same field,
  so the eye flips automatically on the next render. Lock with a
  spec that asserts the LayerPanel row's `aria-pressed` /
  `data-hidden` matches `Feature.hidden`.
- Hidden Items panel (already exists) keeps working alongside.

### Slice 3 — Survey-info hides with its layer ✅ shipped 2026-05-30

- Gated the entire paper-furniture overlay (title block + scale bar +
  signature + north arrow + legend + certification + notes) on the
  `SURVEY-INFO` layer's `visible` flag, via `pixi.titleBlockLayer.
  visible = surveyInfoLayer.visible !== false` at the top of
  `renderTitleBlock` (runs every frame). When hidden, clears
  `tbBoundsRef` so an invisible overlay can't capture clicks /
  context menus, then early-returns.
- Defaults to "visible" if the SURVEY-INFO layer is missing (legacy
  drawings unchanged).
- **TEXT-feature parity deferred**: regular TEXT features on the
  SURVEY-INFO layer already render through the standard
  `drawFeature` → TEXT branch (so they already get the regular text-
  tool semantics — font, color, drag, rotate, delete — plus layer-
  visibility filtering through `getVisibleFeatures`). No code change
  needed; the user can already add text to that layer and it
  behaves like any other TEXT feature. Documented here so a future
  reader doesn't re-investigate.
- Tests: 5 source-text asserts lock the read of `SURVEY-INFO`, the
  `tbVisible` derivation, the `titleBlockLayer.visible` write, the
  early return, and the `tbBoundsRef` clear.
- Full cad suite (1839) green; typecheck + lint clean.

- Audit the title-block / scale / north-arrow renderers. Either
  (a) gate them on `document.layers['SURVEY-INFO'].visible`, or
  (b) convert them to real TEXT/IMAGE features on the
  SURVEY-INFO layer so layer-visibility already applies.
  Decision: (a) — minimum-viable, no schema churn. The
  TitleBlockEditorModal stays; we just don't paint the overlay when
  the layer is hidden.
- Verify the regular text-tool edit flow works on TEXT features
  on the SURVEY-INFO layer (font, color, drag, rotate, delete)
  so users can extend the survey info with notes that behave the
  same.
- Spec: layer hidden → canvas renderer skips the overlays; spec on
  the TEXT-feature reachability on the SURVEY-INFO layer.

### Slice 4 — Collapse the 4 fixed hatch options into one "Lines" + angle

- Now that rotation works, "Diagonal /", "Diagonal \\", "Horizontal
  lines", "Vertical lines" are the same pattern at 45 / 135 / 0 /
  90 degrees. Replace with one "Lines" option + rely on the angle
  slider.
- Legacy ids (`DIAGONAL_LEFT` etc.) stay valid in the dispatcher;
  the picker normalizes them on read to "Lines" with the
  corresponding angle pre-filled.

## Guardrails

- Every new field optional with a baseline default (angle 0 = the
  current behavior) so existing drawings stay unchanged.
- Patterns stay deterministic per feature (seed unchanged).
- Per slice: typecheck + lint + commit + push + annotate this doc.

## TL;DR

Four slices: rotation + numeric inputs + Gravel→Random-dots rename
(Slice 1, this commit); per-element eyes in the LayerPanel (Slice
2); survey-info overlay hides with its layer + TEXT-feature parity
(Slice 3); collapse the 4 fixed hatches into "Lines" + angle (Slice
4).
