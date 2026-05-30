# CAD area calculation — closed shapes + multi-unit (sq in / sq m / sq yd / sq mi / sq km / sq cm / sq mm)

*Opened 2026-05-29 mid-session in response to the user's pivot:
"Make sure that with closed shapes and shapes formed by polygons
we have a way to accurately calculate the sq footage and acreage.
We should be able to calculate the area in square inches and
square meters too, and really any unit. Please make sure this is
working."*

## What the user asked for

1. **Accurate area** for closed shapes — POLYGON (the existing
   path) AND CIRCLE, ELLIPSE, ARC (closed), and POLYLINE that
   closes back to its start.
2. **Square inches** + **square meters** as first-class display
   units.
3. **"Really any unit"** — sq in, sq ft, sq yd, sq mi, sq cm, sq m,
   sq km, plus the existing acres / hectares.
4. Make sure it's actually working (i.e. accessible from the UI,
   not just buried in a parser).
5. **Render the area label on the page** + **be moveable** (mid-
   session follow-up). The annotation store + `AreaAnnotation`
   type already exist; needs a trigger to place one + a drag-to-
   move handler.

## What already exists

| Piece | Where it lives |
|-------|----------------|
| Shoelace area for vertex lists | `lib/cad/geometry/area.ts` |
| `AreaUnit = 'SQ_FT' \| 'ACRES' \| 'SQ_M' \| 'HECTARES'` | `lib/cad/types.ts` + `units/parse-area.ts` |
| `parseArea("12.5 sq m")` | `lib/cad/units/parse-area.ts` |
| `formatArea(sqft, prefs)` (sq-ft / acres / sq-m / hectares only) | `lib/cad/geometry/units.ts:278` |
| Per-feature area on POLYGON in PropertyPanel | `app/admin/cad/components/PropertyPanel.tsx` |
| Area label generation (`computeAreaFromPoints2D`) | `lib/cad/labels/area-label.ts` |
| GeoJSON writer area | `lib/cad/delivery/geojson-writer.ts` |

## What's missing

- `AreaUnit` enum doesn't include `SQ_IN`, `SQ_YD`, `SQ_MI`,
  `SQ_CM`, `SQ_MM`, `SQ_KM`. The parser/formatter can't accept or
  emit those today.
- `computeAreaFromPoints2D` only handles vertex lists. CIRCLE
  (π·r²), ELLIPSE (π·a·b), ARC (closed sector), and POLYLINE
  (closed via first ≈ last vertex check) have no dispatcher.
- No `computeFeatureArea(feature)` that picks the right
  formula based on the feature's geometry type.
- PropertyPanel's area readout only renders for POLYGON — no
  area shown when the user selects a closed CIRCLE / ELLIPSE.

## Phases + slices

### Phase 42 — Multi-unit area + closed-shape dispatcher (Slice 227 of the in-progress arc)

#### Slice 227 — Extend AreaUnit with sq-in / sq-yd / sq-mi / sq-cm / sq-mm / sq-km + `computeFeatureArea` dispatcher ✅ shipped
- **Done:** Widened `AreaUnit` (both in `lib/cad/types.ts` and `lib/cad/units/parse-area.ts`, kept in sync) to include `SQ_IN`, `SQ_YD`, `SQ_MI`, `SQ_MM`, `SQ_CM`, `SQ_KM` alongside the existing `SQ_FT` / `SQ_M` / `ACRES` / `HECTARES`. Conversion multipliers derived from the US-survey-foot definition (`1 ft = 0.3048 m` exact) plus the linear ratios (12 in / ft, 3 ft / yd, 5280 ft / mi, 10 mm / cm, 100 cm / m, 1000 m / km) so the squared multipliers round-trip identity through `sqftTo(toSqft(x, u), u)`. `parseArea`'s suffix table accepts every conventional spelling — `"sq in" / "in²" / "in2" / "square inches"`, `"sq yd" / "yd²" / "sy" / "square yards"`, `"sq mi" / "mi²"`, `"sq mm" / "mm²"`, `"sq cm" / "cm²"`, `"sq km" / "km²"`, plus `"sf" / "sqft" / "ft²"`, `"m²"`, `"ac" / "acres"`, `"ha" / "hectares"`. New `UNIT_LABEL` table exports the canonical Unicode abbreviation per unit. `geometry/units.ts` got matching constants (`SQFT_TO_SQIN = 144`, `SQFT_TO_SQYD = 1/9`, etc.) and the `sqFtToAreaUnit` + `areaUnitLabel` switches now cover all 10 units so the surveyor's `prefs.areaUnit` selection flows end-to-end through the display pipeline. New `computeFeatureArea(feature)` in `geometry/area.ts` dispatches on geometry type: POLYGON → shoelace on vertices (existing helper); CIRCLE → `π·r²`; ELLIPSE → `π·a·b` (rotation-invariant — verified); POLYLINE → shoelace ONLY if `isVertexLoopClosed(verts)` (first vertex ≈ last vertex within 1e-6 ft tolerance), else 0; MIXED_GEOMETRY → same closed-loop test; LINE / POINT / open POLYLINE / SPLINE / TEXT / IMAGE → 0 with `geometryKind: 'NONE'`. The result carries the new `geometryKind` discriminator so callsite UI can label "10,000 sq ft (POLYGON)" vs "πr² = 314.16 sq ft (CIRCLE)" etc. 74 new vitest specs across two files lock the unit multipliers + abbreviation table + parser suffixes (25 spellings) + sqft↔unit round-trip identity (10 units) + per-geometry-kind dispatch including the rotation-invariant ELLIPSE check + closed-vs-open POLYLINE branches + the tolerance value on `isVertexLoopClosed`. 1595 CAD specs green. `tsc` + `eslint` clean.

#### Slice 228 — Surface multi-unit area in PropertyPanel for every closed shape ✅ shipped
- **Done:** Replaced the POLYGON-only `A: {sqft} sq ft ({acres} ac)` readout with a generic Area block driven by `computeFeatureArea(feature)`. The block is mounted as a sibling of the geometry section (carries `data-testid="property-panel-area"`) and only renders when `squareFeet > 0` — so open shapes (LINE / open POLYLINE / POINT / SPLINE / TEXT / IMAGE) stay quiet. Header line labels which formula produced the value: `shoelace` for POLYGON, `π·r²` for CIRCLE, `π·a·b` for ELLIPSE, `closed polyline` and `closed mixed` for the wrapping POLYLINE / MIXED_GEOMETRY paths — so the surveyor can see at a glance why two visually-similar shapes report different areas. Primary value reads `{userVal.toFixed(min(dp+2, 4))} {areaUnitLabel(displayPrefs)}` so the surveyor's `prefs.areaUnit` setting flows through; secondary line always reads `{sqft} sq ft · {acres} ac`; when the preferred unit is neither SQ_FT nor ACRES, an extra `· {m²}` reading appends so the metric system is one glance away even when the surveyor's primary preference is, say, sq inches. The POLYGON section kept its perimeter line (`P: ...`) — Slice 228 only swapped the `A:` row. New `computeFeatureArea` import replaced the old `computeAreaFromPoints2D` import (only callsite removed); `sqFtToAreaUnit` + `areaUnitLabel` imported from `geometry/units`. 10 vitest specs lock the source-level contracts: imports swapped correctly, generic data-testid present, `if (a.squareFeet <= 0) return null;` early-return, primary line uses display preferences, secondary line shows sq-ft + acres, m² fallback gated on the non-sf-non-ac preference, the per-geometryKind formula labels (`shoelace` / `π·r²` / `π·a·b` / `closed polyline` / `closed mixed`), perimeter line preserved, old POLYGON-specific `A:` row removed. 1605 CAD specs green. `tsc` + `eslint` clean.

---

#### Slice 229 — Place + render area-label annotation (trigger + canvas render path) ✅ shipped
- **Done:** Two new helpers in `lib/cad/labels/area-label.ts`. `pickFeatureCentroid(feature)` returns the natural centroid for any closed geometry — CIRCLE / ELLIPSE center, vertex average for POLYGON / POLYLINE / MIXED_GEOMETRY, `{0,0}` for open / centroid-less kinds. `createAreaLabelForFeature(feature, config?, lot?, blk?)` is a feature-aware factory that runs `computeFeatureArea(feature)` (Slice 227's dispatcher), returns `null` when the result is zero (open shapes, degenerate radii, etc.), otherwise builds the `AreaAnnotation` with `isManuallyPlaced: true` + `isAutoGenerated: false` so the auto-annotate pipeline doesn't regenerate it. PropertyPanel got a "📐 Place area label on canvas" button inside the Slice-228 area block (gated by the same `squareFeet > 0` early-return); clicking calls the factory + `useAnnotationStore.getState().addAnnotation(ann)`. CanvasViewport got: (a) `useAnnotationStore` added to the store import block + `AreaAnnotation` type import; (b) a new `areaLabelTexts: Map<string, Pixi.Text>` field on the Pixi state (initialized to `new Map()`); (c) `renderAreaAnnotations()` function placed next to `renderLabels()` that iterates `annStore.annotations`, skips non-AREA_LABEL + hidden entries, draws each as a Pixi `Text` on the labelLayer at `w2s(position.x, position.y)` with font-size derived from `(ann.fontSize / 72) * drawingScale * zoom` clamped to `[MIN_LABEL_FONT_SIZE_PX, MAX_LABEL_FONT_SIZE_PX]`, and reuses+updates existing Text objects via the Map so per-frame churn is zero; (d) a GC sweep that destroys any Text whose annotation was removed from the store this frame so the canvas doesn't leak; (e) `renderAreaAnnotations()` wired into the per-frame pipeline between `renderLabels()` and `renderTextFeatures()`. 21 vitest specs lock the helpers + wiring: 5 `pickFeatureCentroid` cases (CIRCLE/ELLIPSE/POLYGON/POLYLINE/open fallback), 8 `createAreaLabelForFeature` cases (null on open + degenerate, POLYGON/CIRCLE/ELLIPSE/closed POLYLINE positions, custom config honoring, DEFAULT_AREA_LABEL_CONFIG fallback, manual-placement flags), 3 PropertyPanel wiring contracts (imports, button + testid, click handler signature), 5 CanvasViewport wiring contracts (annotation store import, areaLabelTexts Map field + init, renderAreaAnnotations function + invocation sandwich, GC sweep, type+visibility filters). 1626 CAD specs green. `tsc` + `eslint` clean.

#### Slice 230 — Drag-to-move the area label ✅ shipped
- **Done:** New `areaLabelDragRef = useRef<{ annotationId; startWorld: Point2D; startPosition: Point2D } | null>(null)` mirrors the existing `labelDragRef` shape but holds an annotation id + the absolute `position` (not an offset). New `hitTestAreaLabel(sx, sy)` walks `pixi.areaLabelTexts`, skips invisible texts (so the Slice-231 Hide path naturally stays un-grabbable), and returns the annotation id whose Pixi Text bounds contain the cursor. SELECT pointer-down runs `hitTestAreaLabel` BEFORE `hitTestLabel`, narrows the store entry to `AreaAnnotation`, captures the world cursor + the annotation's current position, and switches the cursor to `'grabbing'`. Pointer-move branch (placed above the existing label-drag branch so the area-label drag never falls through to the per-feature `textLabel` offset code path) writes `position = startPosition + (cursorWorld - startWorld)` via `useAnnotationStore.getState().updateAnnotation(annotationId, { position })` so the Slice 229 render pass picks up the new spot on the next frame. Pointer-up clears `areaLabelDragRef.current` + resets the cursor to the active tool's default. Hover branch flips the SELECT-mode cursor to `'grab'` over an area label so the affordance is obvious before the surveyor clicks. 13 vitest specs in `__tests__/cad/labels/area-label-drag.test.ts` lock all six wiring points via `fs.readFileSync` regex (drag-ref declaration shape, hitTestAreaLabel signature + bounds loop + invisible skip, pointer-down-area-before-label ordering + ref initializer shape + grabbing cursor + type-narrowing guard, pointer-move delta math + updateAnnotation call + before-labelDrag ordering, pointer-up ref-clear + cursor reset, hover cursor `else if (hitTestAreaLabel(sx, sy)) → 'grab'`). 1639 CAD specs green. `tsc` + `eslint` clean.

#### Slice 231 — Right-click context menu on the area label
- **Scope:** Right-click on a rendered area label surfaces a menu with **Hide**, **Re-center**, **Change format (sq ft / acres / both)**, **Delete**. Hide flips `ann.visible`; Re-center pushes the position back to `pickFeatureCentroid(linkedFeature)`; Delete calls `useAnnotationStore.removeAnnotation`. (Captured but not yet shipped.)

---

## TL;DR

- Slice 227 widens the unit + dispatcher layer so every closed
  geometry can report area in any common surveying unit.
- Slice 228 surfaces the result in the property panel.
