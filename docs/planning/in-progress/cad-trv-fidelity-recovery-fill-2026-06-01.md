# TRV import fidelity + recovery render + fill/line/symbol upgrades — 2026-06-01

*User request (verbatim, condensed):*

> Recovery is broken — when I recover a document the **layers show up
> but the page and drawings don't render at all**. Fix this.
>
> TRV import works much better but there are **stray lines**. Add a way
> to **see what's hidden**, and make imported traverses **hide the same
> elements** the TRV hides.
>
> Restructure the import: **one main TRV drawing layer containing each
> traverse as a sublayer** (boundary, building, road, telephone poles,
> water meter, electric meter, sidewalk, driveway, …) — each traverse
> with its points + drawing info + elements — **plus one TRV point
> layer that just contains all the points**.
>
> **Real names** in the layer manager: points show `Point <name>
> <code>` (e.g. `20fnd`, `309`); text shows `Text "content…"`.
>
> All **survey labeling text** must be shown + **editable like the text
> tool**. **Capture text formatting** from the TRV. If text is tethered
> to an element/traverse, it goes in that traverse layer; otherwise a
> separate text layer.
>
> **Fill**: bump density for 1:1, add a good **grass** infill, make
> patterns consistent. Add **fill color AND background color** (black
> lines on grey), with **separate background + texture opacity**
> sliders (with value inputs).
>
> **Clean up the lines** to look like the PDF / Traverse PC. Import
> **line types (dashed, etc.) and symbols**; create line art / symbols
> where missing, else assign existing. Match the TRV as closely as
> possible.

Reference sample: Hillsboro First Church of the Nazarene
(`__tests__/fixtures/trv/hillsboro-nazarene.trv`) + the user's PDF/TPC
screenshots. Builds on the completed
`docs/planning/completed/cad-trv-drawing-element-rendering-2026-06-01.md`.

---

## Research findings (verified 2026-06-01)

### Recovery
Both recovery entry points — the crash-recovery dialog
(`CADLayout.tsx:957`) and `RecentRecoveriesDialog.tsx:74` — route
through `validateAndMigrateDocument(payload.document)` →
`drawingStore.loadDocument(doc)` → (200 ms later)
`window.dispatchEvent('cad:zoomExtents')`. All three are correct in
code: `performAutosave` (`CADLayout.tsx:834`) writes the FULL
`drawingStore.document`; `validateAndMigrateDocument`
(`lib/cad/validate.ts:37`) preserves `features` + `settings`;
`loadDocument` (`drawing-store.ts:309`) sets the whole doc + active
layer. So the bug is a RUNTIME reaction issue, not data loss. Leads:
(a) the Pixi canvas may subscribe to the store separately from React
and miss the `loadDocument` set — verify the render loop re-inits /
redraws on document replacement (paper + features); (b) `cad:zoomExtents`
(`CanvasViewport.tsx:~12260`) fits to live `getAllFeatures()` — confirm
it runs AFTER the new doc is in the render and fits BOTH paper +
features for a recovered doc; (c) confirm the paper (`renderPaper`,
`CanvasViewport.tsx:1585`) reacts to the recovered `settings.paperOrigin
/ paperSize`.

### Layer model
`LayerGroup` (`lib/cad/styles/types.ts:77`) is FLAT — `{id, name,
collapsed, sortOrder}`, no nesting. But `Layer.groupId → LayerGroup`
(`lib/cad/types.ts`) gives exactly ONE level of grouping, which is all
we need: a "Drawing" LayerGroup containing N per-traverse Layers, plus
a separate "Points" Layer. `LayerPanel.tsx` already renders groups with
their member layers. (`parentGroupId` exists only on `FeatureGroup`,
not `LayerGroup` — don't confuse them.)

### TRV import (current)
`trv-to-drawing.ts` returns TWO flat synthetic layers
(`trv-drawing:<prefix>` + `trv-points:<prefix>`); every feature's
`layerId` is rewritten to one of them; points are mirrored onto the
Drawing layer (`trvPointMirror`). Traverses have a `name` field
(`TrvTraverse.name`, often "BOUNDARY", "sw adjoiner line", a CSV name,
etc.); a file has ~5–45 traverses. Derived echoes (`trvDerived`:
connectors / element polylines / element text) already round-trip
byte-stably.

### Text
`TEXT` features render via `renderTextFeatures`
(`CanvasViewport.tsx:4224`) reading `properties.fontSize / fontFamily /
fontWeight / fontStyle / textAlign` + `style.color`. The text tool
creates `{type:'TEXT', geometry:{type:'TEXT', point, textContent}}`.
World `28,5` text already becomes editable TEXT features
(`trvElementKind:'ELEMENT_TEXT'`). BUT point/line/area labels
(`28,12/15/14`) are stored as METADATA STRINGS
(`properties.label/description/trvSegmentLabels/trvAreaLabel`), not
editable TEXT features.

### Layer-panel naming
Feature rows show `{feat.type}{properties.name ? ' – '+name : ''}`
(`LayerPanel.tsx:~960`). TRV points carry `properties.pointName` +
`label/description` but no `name`; rows show only `POINT`. TEXT rows
show only `TEXT` (content lives in `geometry.textContent`).

### Fill
`FillPattern` (14 values, `types.ts:582`) + `FeatureStyle` fill fields:
`fillColor, fillOpacity, fillPattern, patternColor, patternDensity,
patternScale, patternRotation, brick*/wave*/patternDash*`, `fillStack`.
Rendered via `generateFillPattern` (`lib/cad/styles/fill-patterns.ts`)
+ `drawFillPatternForPolygon` (`CanvasViewport.tsx:3741`). GAPS: NO
fill **background color**, NO **separate background/texture opacity**,
NO dedicated **grass** pattern (TPC grass→`DOT_GRAVEL` density 2). TPC
mapping in `trv-fill-patterns.ts` (47 names) / `trv-fill-styling.ts`.

### Line types + symbols
Rich catalogs already exist: `linetype-library.ts` (38 line types incl.
DASHED, FENCE_*, UTIL_*, CREEK_WAVY), `linetype-renderer.ts`
(`renderDashedLine`, world-feet dashes), `symbol-library.ts` (monuments,
fences, utility, vegetation), `symbol-renderer.ts`. GAPS: (a)
`decodeTrvLineStyle` only maps TPC `51` field1 `-43→FENCE_BARBED_WIRE`,
else SOLID (codes 0/6/10/39/40 unmapped); (b) **point symbols are NOT
rendered in the viewport** (points draw a hardcoded crosshair,
`CanvasViewport.tsx:~2002`; `style.symbolId` is ignored); (c) TRV points
get no code→symbol assignment.

---

## Slices

> Build order is priority order. Each slice: `npx tsc --noEmit`, the
> relevant `npx vitest run __tests__/...`, `npm run lint`, then commit +
> push with footer `https://claude.ai/code/session_017DegH8Gdk2dSMUDdu9LUEx`.
> Keep the byte-stable TRV round-trip (`trvDerived` exclusion) intact in
> every slice. Annotate this doc per slice; move to `completed/` when all
> are shipped or explicitly deferred.

### Slice 1 — Fix file-recovery rendering (URGENT)
- Reproduce: import a TRV (or draw), let autosave fire, reload, click
  Restore — confirm layers populate but paper + features don't render.
- Diagnose against the leads above. Most likely fix areas: ensure
  `loadDocument` triggers a full Pixi resync (paper + features), and
  that `cad:zoomExtents` fires AFTER the doc is live and frames paper +
  features. If the canvas keys Pixi re-init on a React effect, make
  `loadDocument` (or a `cad:documentReplaced` event) force a rebuild.
- Add a regression test: a unit test that `validateAndMigrateDocument`
  round-trips a TRV-imported doc without dropping features/settings
  (lock the data path), plus a source-level assertion that both
  recovery handlers dispatch `cad:zoomExtents` after `loadDocument`.
- Acceptance: recovering a TRV-imported doc shows the paper + all
  linework/points/text immediately, framed in view.

### Slice 2 — TRV import: per-traverse layers under a Drawing group + one Points layer
- In `trv-to-drawing.ts`, replace the two flat layers with:
  - One `LayerGroup` "<prefix> — Drawing" (the collapsible container).
  - One `Layer` per traverse, `groupId` = that group, named from
    `TrvTraverse.name` (fallback "Traverse N"). Each traverse layer
    holds its polyline/polygon + that traverse's drawing elements
    (connectors/shapes) + tethered text + a MIRROR of its points.
  - One `Layer` "<prefix> — Points" (group null or its own group)
    holding the CANONICAL copy of every point.
  - Drawing elements whose owning traverse can't be determined → a
    catch-all "<prefix> — Drawing (misc)" layer in the group.
- Keep the `trvDerived` / `trvPointMirror` round-trip contract: the
  canonical point (Points layer) owns the TRV slot; per-traverse point
  copies are mirrors; export stays byte-stable.
- `LayerPanel` already renders a group + member layers; verify the
  group shows the traverse layers as children and the Points layer
  separately.
- Tests: a Hillsboro integration asserting N traverse layers grouped
  under one Drawing group + one Points layer with all points; round-trip
  byte-stable (extend `trv-derived-roundtrip.test.ts`).

### Slice 3 — Real element names in the Layer panel
- `LayerPanel` feature-row label: for `POINT`, show `Point <pointName>
  <code>` (e.g. `Point 309`, `Point 20fnd`) using `properties.pointName`
  + the point CODE (`properties.code`/`description` first token). For
  `TEXT`, show `Text "<first ~24 chars of geometry.textContent>…"`. For
  other types keep `<type> – <name>` when a name exists.
- Ensure `mapPoint` stamps a stable `pointName` + `code` so the row can
  read them; ensure TEXT features expose `geometry.textContent`.
- Tests: a LayerPanel source/unit test for the three label forms.

### Slice 4 — Survey labels as editable TEXT elements + tethering + formatting
- Convert point/line/area labels (`28,12/15/14`) from metadata strings
  into real editable `TEXT` features (like the text tool), placed at the
  TPC label coordinates, carrying captured formatting (font size/family/
  weight/style/justification) from the TRV styling so they match the
  PDF (compare the screenshots: TPC uses smaller, tighter text). Decode
  the label font from the paired `29`/`51` styling where available.
- Tethering: if a label is tied to a point/segment/traverse, put the
  TEXT feature in that traverse's layer (Slice 2) and link it
  (`properties.trvTetheredTo`). If the owner is unknown, drop it on a
  "<prefix> — Text / Annotations" layer.
- Keep these TEXT features `trvDerived` so round-trip stays byte-stable
  (the verbatim `28` block remains the source).
- Tests: labels become TEXT features with the right text + placement +
  layer; formatting fields populated; round-trip byte-stable.

### Slice 5 — Hidden-element parity + a "show hidden" affordance
- Parse TRV per-element/per-traverse HIDDEN state (investigate which
  records carry visibility — e.g. layer/traverse styling flags, the
  `86` layer `visible` bit, or a per-element flag) and apply it: imported
  features that TPC hides import with `feature.hidden = true` (and/or the
  owning traverse layer `visible=false`). This kills the "stray lines"
  by hiding what TPC hid.
- Layer panel already has per-feature eye toggles; ensure hidden
  imported features show as hidden (eye-off) and can be toggled. Confirm
  the panel lists hidden features (don't filter them out).
- Tests: a fixture where a TRV element is flagged hidden imports with
  `hidden=true`; the panel shows it hideable.

### Slice 6 — Fill: background color + separate opacities + density + grass + consistency
- `FeatureStyle`: add `fillBackgroundColor?: string | null` and
  `fillBackgroundOpacity?: number` (texture opacity stays `fillOpacity`).
  Render the background as a solid fill UNDER the pattern in
  `drawFillPatternForPolygon` (`CanvasViewport.tsx:3741`).
- Infill UI panel: add a background-color picker + TWO opacity controls
  (background + texture) as **sliders with numeric value inputs**; keep
  the existing pattern color/density/scale/rotation.
- Add a dedicated **`GRASS`** `FillPattern` (tufts / short v-strokes) in
  `fill-patterns.ts`; map TPC grass/forest names to it in
  `trv-fill-patterns.ts`. Bump default hatch/dot DENSITY so imports read
  closer to 1:1 with the PDF (tune `DOT_GRAVEL`, `LINES`, `CROSSHATCH`
  spacing). Make density consistent across patterns.
- Tests: new style fields default + render-config wiring; GRASS pattern
  generates primitives; TPC grass→GRASS mapping; density unit checks.

### Slice 7 — Import line types + point symbols
- Line types: ground-truth the TPC `51` field1 codes (0/6/10/39/40)
  against the PDF (e.g. adjoiner = dashed) and map them to the existing
  catalog (`DASHED`, etc.) in `decodeTrvLineStyle`; assign the decoded
  `lineTypeId` to the traverse polyline. Create any missing line art in
  `linetype-library.ts` only when no existing type fits.
- Point symbols: render `style.symbolId` on POINT features in
  `CanvasViewport` (the symbol library + renderer exist; wire the point
  draw path to use them, falling back to the crosshair). Assign symbols
  to imported points by code via `PointCodeDefinition.defaultSymbolId`
  (monument codes → IR/IP symbols, etc.).
- Tests: a TPC line code maps to a dashed type; a coded point gets its
  symbol; the point render path reads `symbolId`.

### Slice 8 — Line cleanup / visual fidelity pass
- Compare a rendered Hillsboro import to the PDF/TPC screenshots and
  tighten: line weights, dedup near-duplicate overlapping segments
  (the "stray lines" remainder), label sizing/placement, and infill
  density so the output reads like the PDF. Keep changes additive +
  test-locked where feasible.

---

## Deferrals (revisit, documented per the README rubric)
- Geometric paper-space placement of title-block `28,5`/`28,6` (needs
  the TPC paper transform — carried over from the prior plan).
- Edit-through round-trip of `28` drawing elements (FUTURE).

## TL;DR
Fix recovery rendering first; then restructure TRV import into a
Drawing group of per-traverse layers + one Points layer; show real
point/text names; turn survey labels into editable, formatted,
tethered TEXT; honor TPC hidden state to kill stray lines; upgrade
fills (background color + dual opacity sliders + grass + denser, more
consistent patterns); and import line types + point symbols — all while
keeping the byte-stable `trvDerived` round-trip.
