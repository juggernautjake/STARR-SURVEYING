# CAD fills + element visibility — 2026-05-30

*Opened 2026-05-30 in response to the user's brief (paraphrased):*

1. *More infill patterns, and the ability to EDIT a pattern — make
   dots/lines thicker, brick smaller/bigger, change the spacing
   between waves + the wave frequency.*
2. *A closed polyline shape currently shows no infill option — it
   needs one.*
3. *Be able to hide elements on the active layer: whole shapes,
   individual line segments, or points.*
4. *Even with a boundary line hidden, a closed polygon must still be
   fillable for the area it would enclose if nothing were hidden.*
5. *More variety of infill — especially more "gravel" variants
   (randomly dispersed, varied-size dots) with the dots slightly
   bigger or smaller.*

## Today's reality (audit, 2026-05-30)

- Pattern catalog: `FillPattern` union in `lib/cad/types.ts` (NONE,
  DOT_UNIFORM, DOT_GRAVEL, DIAGONAL_L/R, CROSSHATCH, HORIZONTAL,
  VERTICAL, BRICK, WAVE). Pure generators in
  `lib/cad/styles/fill-patterns.ts` (well-structured, seedable,
  unit-tested). Render in `CanvasViewport.drawFillPatternForPolygon`
  (mask + textured Graphics). Fill fields on `FeatureStyle`:
  `fillColor`, `fillOpacity`, `fillPattern`, `patternColor`,
  `patternDensity` (0.25–4).
- The fill panel (`PropertyPanel`) shows swatches only — **no UI to
  edit density** (the model field exists but is unreachable) and no
  thickness control. Lines are hardcoded `lineStyle(0.6)`; gravel
  dot radius is hardcoded `meanRadius 1.5`.
- Fill is gated by `computeFeatureArea(feature).squareFeet > 0`,
  which is true for POLYGON / CIRCLE / ELLIPSE / **closed** POLYLINE
  / closed MIXED. A shape drawn as N separate LINE features (the
  user's quad in the screenshot — "Lines (4) / Points (4)") is NOT
  one closed polyline, so it gets no fill.
- Visibility: `Feature.hidden` (whole feature) + `Layer.visible` +
  `TextLabel.visible`. **No per-segment hiding.** `getVisibleFeatures`
  filters layer-visible + not-hidden. `HiddenItemsPanel` lists hidden
  features + labels.

## Slices

### Slice 1 — Richer + editable patterns ✅ shipped 2026-05-30

- `fill-patterns.ts`: added `scale` (thickness, 0.25–4) to
  `FillPatternConfig`, threaded into dot radius (DOT_UNIFORM + gravel
  family); new pure `patternLineWeight(scale)` (0.6 px baseline) the
  render uses for hatch/brick/wave stroke weight. Refactored
  `generateDotGravel` to take a `GravelOpts { meanRadius, radiusStdDev,
  cellScale }` so variants reuse one algorithm; `GRAVEL_PRESETS`
  exports the tunings.
- New gravel-family patterns on the `FillPattern` union + dispatcher +
  picker: `DOT_GRAVEL_FINE` (smaller, tighter), `DOT_GRAVEL_COARSE`
  (bigger, looser), `DOT_SAND` (tiny dense).
- `FeatureStyle.patternScale?: number` (optional; default 1 → existing
  drawings unchanged).
- `PropertyPanel`: 3 new swatches + a **Density** slider
  (→ `patternDensity`, drives dot/hatch spacing + brick course size +
  wave row-spacing/wavelength, satisfying "brick smaller/bigger" +
  "wave spacing + frequency") + a **Thickness** slider
  (→ `patternScale`, dot radius + line weight). Both shown only when a
  real pattern is active.
- `CanvasViewport`: passes `scale` into the cfg + uses
  `patternLineWeight(scale)` (replaces the hardcoded 0.6).
- Tests: `fill-patterns.test.ts` +16 cases; the two source-assertion
  render/picker tests updated for the new import + cfg shape. Full
  cad suite (1788) green; typecheck + lint clean.

**Note:** this slice covers ask #1 (edit patterns — thicker dots/lines
via Thickness; brick size + wave spacing/frequency via Density) and
ask #5 (more gravel variety — Gravel−/Gravel+/Sand). Asks #2 (fill
shapes built from separate lines), #3 (hide segments/points/shapes),
and #4 (fill ignores hidden boundary edges) are Slices 2–4.

### Slice 2 — Per-element hide: segments + points + shapes ✅ shipped 2026-05-30

- **Whole shapes / points / separate line features already hide** via
  right-click → "Hide Element(s)" (`FeatureContextMenu` →
  `drawingStore.hideFeature`), and `HiddenItemsPanel` lists + unhides
  them. So the "hide whole shapes / individual line features / points"
  part of the ask already worked; this slice adds the missing piece:
  hiding an individual **edge of one polyline/polygon**.
- New `FeatureGeometry.hiddenSegments?: number[]` (segment i = vertex
  i → i+1; a polygon's closing edge is index n−1).
- New pure `lib/cad/geometry/segment-visibility.ts`: `segmentCount`,
  `normalizeHiddenSegments`, `visibleSegmentRuns` (groups visible
  edges into continuous runs; closed shapes start the walk after a
  hidden edge so a run never wraps the seam), `toggleHiddenSegment`.
- `CanvasViewport.drawFeature`: POLYLINE + POLYGON stroke only the
  visible runs (LOD simplify skipped when edges are hidden so indices
  stay aligned). The fill mask still uses the full vertex loop.
- `PropertyPanel`: an "Edges" grid of eye toggles for a selected
  POLYLINE/POLYGON + a "Show all edges" reset.
- Tests: 18 cases in `segment-visibility.test.ts`.

### Slice 3 — Fill independent of boundary-line visibility ✅ shipped 2026-05-30

- Folded into Slice 2. `drawFillPatternForPolygon`'s mask + the solid
  fill both build from the full `screenPts` vertex loop, which is
  unaffected by `hiddenSegments` — so a polygon with a hidden boundary
  edge still fills its entire enclosed area. Confirmed in the render
  path (only the stroke loop branches on hidden edges; the fill does
  not) + locked by the "fill loop is independent of hidden edges"
  regression test in `segment-visibility.test.ts`.

### Slice 4 — Fill an area bounded by separate line features

- The hard one: let the user select N line features that form a
  closed loop + "Fill enclosed area". Build a boundary loop by
  chaining segment endpoints (within tolerance); if it closes, create
  (or update) a derived fill region the render path masks to. Likely
  a new lightweight "area fill from boundary" feature or an overlay
  that references the contributing line ids.
- Gated behind a clear affordance ("Fill enclosed area") shown when
  the selection's segments chain into a closed ring.
- Tests: the pure loop-assembly (ordered ring from unordered
  segments, tolerance, open-loop rejection).

## Out of scope / placeholder

- SVG/PDF export of the new patterns — the generators stay export-
  ready (pure), but wiring export is a separate pass.
- Per-vertex (point-on-a-polyline) hide — distinct from hiding a
  whole POINT feature; revisit only if asked.

## Guardrails

- Patterns stay deterministic per feature (seed = hash(feature.id)) so
  re-renders don't flicker.
- Existing drawings unchanged: every new field is optional with a
  baseline default (scale 1, density 1, pattern NONE).
- Per slice: typecheck + lint + commit + push + annotate this doc.

## TL;DR

Four slices: editable + richer patterns incl. gravel variants
(Slice 1, the usable core); per-element hide for segments/points/
shapes (Slice 2); fill that ignores hidden boundary edges (Slice 3);
fill an area bounded by separate line features (Slice 4, the hard
one).
