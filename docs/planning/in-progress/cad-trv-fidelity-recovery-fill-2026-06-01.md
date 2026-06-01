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

> **DONE (2026-06-01).** Root cause: the render + data paths are correct
> (autosave writes the full doc, `validateAndMigrateDocument` preserves
> features+settings, `loadDocument` loads it, the RAF render loop reads
> live state) — but recovery dispatched `cad:zoomExtents`, which fits the
> raw feature bbox. A recovered TRV doc's geometry sits at survey
> coordinates (~3.3M, 10.7M) while the camera is still at the origin
> default, so viewport culling dropped every feature and the paper
> rendered off-screen → "page + drawings didn't render at all". Fix:
> both recovery handlers (`CADLayout.tsx` Restore + `RecentRecoveriesDialog.tsx`)
> now dispatch `cad:zoomToPaper` (frames the content-sized paper, robust
> against stray outliers — the same pattern TRV import uses). Regression
> test `recovery-render.test.ts` locks the data path (JSON round-trip
> preserves features + paperOrigin) + the reframe wiring. Suite 2524
> green.
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

> **INVESTIGATION (2026-06-01) — larger than one slice; split needed.**
> Findings from reading the live code: (1) NO store action exists to
> add a `LayerGroup` (only `DEFAULT_LAYER_GROUPS` at store init) — need
> an `addLayerGroup` action. (2) `LayerPanel` does NOT render
> `LayerGroup` containers of layers; its "groups" are FEATURE groups
> (`doc.featureGroups` filtered by `g.layerId === layer.id`) nested
> INSIDE each layer. So "traverse sublayers under a Drawing group"
> needs NEW LayerPanel UI to render LayerGroup containers with member
> layers. (3) `TrvMappingResult` (`trv-to-drawing.ts:54`) returns only
> `{layers, features, notes}`; the consumer (`MenuBar.tsx:310,485`)
> applies layers via `addLayer` (respects `layer.groupId`) + features
> via `addFeatures`, but applies NO groups. (4) Many tests assert the
> current 2-layer structure (`layerCount === 2`, ids `trv-drawing:`/
> `trv-points:`) and will need migration. Each traverse polyline
> already carries `properties.name = t.name` + `trvPointRefs`.
> **Split plan:** 2a — `trvToDrawing` emits one named Layer per
> traverse (linework) + a catch-all "<prefix> — Drawing" layer
> (connectors/shapes/text/mirrors) + the "<prefix> — Points" layer;
> return + apply (flat, no group yet); migrate the affected tests.
> 2b — add `addLayerGroup` + a "Drawing" LayerGroup, parent the
> traverse layers via `groupId`, and build the LayerPanel LayerGroup-
> container UI. 2c — per-traverse point mirrors ("each traverse with
> its points"). Not yet shipped.
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

> **DONE (2026-06-01).** Extracted a pure `featureRowLabel`
> (`lib/cad/feature-row-label.ts`) and wired both LayerPanel feature-row
> spans to it. POINTs now read `Point <pointName> · <code>` (e.g.
> `Point 309 · 20fnd`, from `properties.pointName` + `properties.code`
> that `mapPoint` already stamps); TEXT reads `Text "<≤24-char snippet>"`
> from `geometry.textContent` (multi-line collapsed); other types keep
> `TYPE – name`. Unit test `feature-row-label.test.ts`. Suite 2539 green.
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

> **DONE (2026-06-01) — construction/duplicate traverses import
> hidden.** Investigation: the TRV has no per-layer visibility bit (the
> `86` records are TPC's static layer LIBRARY) and the `31`/`51` flag
> bitmasks are unconfirmed — BUT the traverse NAMES reliably reveal
> TPC's non-plotted working artifacts: `Copy-…`, `DUP-…`, parallel
> offsets `Right/Left N Feet-…`, and `… offsets` (CSV master-lists were
> already points-only). These are the "stray lines." `isConstructionTraverse`
> detects them and `trvToDrawing` imports their features with
> `hidden:true` (+ `properties.trvConstruction`) — parity with TPC, no
> stray lines — while keeping them in the doc + Layers panel (eye-off,
> toggleable; `getVisibleFeatures` already filters `hidden`). The panel
> already lists hidden features with a per-feature eye, so the "show
> hidden" affordance exists. Hidden ≠ dropped, so round-trip is
> unaffected. Hillsboro: 11 construction traverses hidden. Tests in
> `trv-construction-hidden.test.ts`. Suite 2556 green.
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

> **PARTIAL (2026-06-01) — GRASS pattern done.** Added a dedicated
> `GRASS` `FillPattern`: `generateGrassTufts` (upward 3-blade tufts on a
> seeded jittered grid) in `fill-patterns.ts`, wired into the dispatcher
> + the FillPattern union (`types.ts`) + the PropertyPanel picker
> ("Pattern → Grass"). TPC "Grass"/"Forest" fills now map to `GRASS`
> (was dense `DOT_GRAVEL`) in `trv-fill-patterns.ts`. Tests:
> `fill-patterns.test.ts` (deterministic, 3 blades/tuft, denser→more),
> picker + TPC-mapping tests updated. Suite 2542 green.
> **6c DONE (2026-06-01) — import density boost.** Natural-texture TPC
> fills now import a touch denser for closer 1:1 with the PDF: Gravel/
> Concrete/Earth/Clay `DOT_GRAVEL` 1→1.5, Cross/Diagonal-Cross
> `CROSSHATCH` 1→1.4, Brick 1→1.25, Water/Swamp `WAVE` 1→1.25 (Sand
> stays 2; large-confetti 0.5). Import-only (render/UI untouched);
> density stays per-feature editable. Test added in
> `trv-line-curve-fidelity.test.ts`. Suite 2543 green.
>
> **6b FINDING (2026-06-01) — capability already exists via fillStack.**
> The PropertyPanel infill editor uses the `fillStack` model where EACH
> layer already has an independent `color` + `opacity` + pattern, so
> "black lines on grey with separate opacities" is achievable TODAY by
> stacking a SOLID grey layer (its own opacity) under a LINES black
> layer (its own opacity) — and the param sliders already pair a range
> with a numeric value input. So 6b is a UX-clarity task (a simpler
> "background color + background opacity / texture color + texture
> opacity" framing over the stack), NOT a missing capability. Deferred
> as UX polish until prioritized; document inline so it isn't re-scoped
> as a data-model gap.
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

> **PARTIAL (2026-06-01) — point-symbol RENDERING wired.** The symbol
> library + renderer existed but POINT features always drew a bare
> crosshair (`style.symbolId` was ignored). The POINT draw path in
> `CanvasViewport` now renders the assigned symbol via
> `findSymbol` + `renderSymbol` (monument / utility / vegetation glyph,
> sized by `symbolSize`, rotated by `symbolRotation`, falling back to
> the crosshair when no/unknown symbol). Test
> `point-symbol-render.test.ts` locks the wiring + verifies a library
> monument glyph draws. Suite 2547 green.
> **(a) DONE (2026-06-01) — code→symbol assignment.** `mapPoint` now
> assigns `style.symbolId` when the TRV feature code (first token of the
> `1,…` description) EXACTLY matches a symbol's `assignedCodes` (e.g.
> `309` → `MON_IR_050_FOUND`). Exact-match only, so free-form
> descriptions never mis-assign; unmatched points keep the crosshair.
> Test `trv-point-symbol-assign.test.ts`. Suite 2551 green.
> **(b) Remaining — line-type import.** Decode TPC `51` field1 codes
> (0/6/10/39/40) to `linetype-library` dash types + assign the
> `lineTypeId` to the traverse polyline. BLOCKED on ground truth: a
> single sample isn't enough to map a code→dash pattern without risking
> wrong styling on other files (per the Slice 6 line-type note). Needs
> cross-file confirmation (pair each code with its plotted PDF) before
> mapping; SOLID stays the safe default + records round-trip verbatim.
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

### Slice 9 — Don't prompt to save an untouched new drawing on exit
*Added 2026-06-01 (user follow-up).*
> **DONE (2026-06-01).** Root cause: the store starts `isDirty:false`
> and both guards (Exit button `if (drawingStore.isDirty)`,
> `useUnsavedChangesGuard` `if (!isDirty) return`) already gate on it —
> but `NewDrawingDialog.handleCreate` builds the doc via
> `newDocument`/`updateSettings`/`addLayer`, each flipping `isDirty`
> true, so a freshly-created untouched drawing looked unsaved. Fix:
> `handleCreate` now calls `drawingStore.markClean()` after setup (before
> close); the next real edit re-flags dirty. Regression test
> `new-drawing-clean.test.ts` (store dirty lifecycle + the
> create/exit/beforeunload wiring). Suite 2532 green. Opening a fresh CAD instance and
exiting without drawing anything must NOT prompt to save. Only prompt
when the drawing has actually changed. The store already tracks
`isDirty` (`drawing-store.ts`), and the nav guard reads
`useDrawingStore.getState().isDirty` (`CADLayout.tsx:570`) — but a brand
new doc may start dirty, or the exit button (`MenuBar.tsx:1268`) may not
consult `isDirty`. Action: ensure a pristine new drawing starts
`isDirty:false` and stays clean until a real edit; gate BOTH the exit
button and the `beforeunload`/router nav guard on `isDirty`. Test: a new
doc is not dirty; exit with no edits doesn't prompt; an edit flips dirty
and exit prompts.

### Slice 10 — Exit returns to the page the user came from
*Added 2026-06-01 (user follow-up).*
> **DONE (2026-06-01).** Root cause: `useCadReturnPathTracker` only
> recorded the single non-CAD → `/admin/cad` CLIENT-SIDE transition via
> a `prev` ref. A hard page load into CAD (fresh URL / refresh / full
> nav) mounts the tracker with `prev=null`, so the transition was never
> seen and Exit always fell back to the research-cad menu. Fix: the
> tracker now continuously records EVERY non-CAD admin path to
> sessionStorage, so the page the user was on right before CAD is
> always on file (written while still on it, surviving a hard nav). The
> Exit button + `getCadReturnPath` fallback are unchanged. Test added to
> `cad-return-path.test.ts`. Suite green. The Exit button currently routes to
the research/CAD menu instead of the previous page. There's a
`returnTo` concept (`MenuBar.tsx:1268-1281` `cad-exit-return-path`).
Action: capture the actual referring page on CAD entry (e.g. stash
`document.referrer`/the prior in-app route in sessionStorage when
navigating INTO the CAD, or use router history) and make Exit navigate
back to that exact page; fall back to the menu only when no prior page
is known. Test: entering from page X and clicking Exit returns to X.

### Slice 11 — Working bug-report system (floating-menu button)
*Added 2026-06-01 (user follow-up).* The "Report a bug" button in the
bottom-right floating menu (with calculator / handbook / messages) is
broken. Build a full bug-reporting flow:
- Clicking it opens a MODAL: a free-text context field (what happened /
  when), a page selector (dropdown of app pages, defaulting to / able to
  pick the CURRENT page), optional severity, and submit/cancel.
- On submit, persist the report for admin review (find the existing
  data layer — Supabase/API route; mirror how other admin records are
  stored) and ALERT the admin (notification/inbox row, matching the
  existing admin-alert mechanism).
- Wire the floating-menu button to open the modal. Locate the floating
  menu component (search `handbook`, `calculator`, `messages`, "Report
  a bug" in `app/admin/`), the admin notification/alert system, and the
  persistence layer first.
- Tests: modal opens from the button; submit validates + writes a
  report record + raises an admin alert; page selector includes the
  current page.

### Slice 12 — Blue buttons must have white text
*Added 2026-06-01 (user follow-up).*
> **DONE (2026-06-01).** Audited solid-blue buttons site-wide. The
> marketing-site CSS blue buttons (`var(--brand-blue)` in Home/Contact/
> ServiceArea/etc.) already set `color:#FFFFFF`. The real offenders
> were CAD Tailwind buttons that set a blue (or red danger) fill but no
> text color, so the label inherited dark text: the SHARED
> `ConfirmDialog` confirm button (high impact — used by many CAD
> modals), `AnnotationPanel` (×2), `StandardNotesEditor`, `PrintDialog`
> — all now `text-white`. Regression test `blue-button-contrast.test.ts`
> locks it. (A non-CAD bg-blue match in `billing/page.tsx` is a chart
> bar, not a button — left alone.)

### Slice 13 — Unify all CAD modals/messages to Starr CAD styling (kill native confirm/alert)
*Added 2026-06-01 (user follow-up).*
> **PARTIAL (2026-06-01) — import popups done.** Converted the
> TRV/data IMPORT popups the user explicitly disliked (both the Open
> and Import flows in `MenuBar.tsx`) from native `window.confirm`/
> `alert` to the existing Starr-styled `confirmAction` modal: the
> import-summary preview, the title-block-apply prompt, and the
> parse-failure error all now render in the themed `ConfirmDialog`
> (added `whitespace-pre-line` so the multi-line count/notes summary
> displays cleanly). Test updated in `trv-io.test.ts` (import uses
> `confirmAction`, no `window.confirm` in `importTrv`). Suite 2532
> green.
>
> **MenuBar DONE (2026-06-01).** Added `alertAction` (single-button
> Starr info-modal, via a new `hideCancel` on `ConfirmDialog`). Every
> native `window.confirm`/`alert` in `MenuBar.tsx` is now converted: the
> Exit-button unsaved-changes prompt → `confirmAction` (danger Leave/
> Stay), and all ~16 save/export/import `alert`s → `alertAction`.
> MenuBar has ZERO native popups left (locked by
> `starr-modals-unify.test.ts`). Suite 2562 green. **Remaining
> (follow-up):** audit the other native `confirm`/`alert` calls in the
> rest of `app/admin/cad/` (CanvasViewport etc.) + non-CAD admin and
> route them through `confirmAction`/`alertAction` too.
>
> **DIALOG COMPONENTS DONE (2026-06-01).** Converted every native
> `alert`/`confirm` in `FileManagerDialog` (12), `SaveToDBDialog` (4),
> `SealImageUploader` (3), `ExportLayersDialog` (2), and `LineTypePicker`
> (1) to `alertAction`/`confirmAction`; the recovery-failure `alert` in
> `CADLayout` too. `starr-modals-unify.test.ts` now locks zero native
> popups across all these components. Suite 2562 green.
>
> **CAD APP COMPLETE (2026-06-01).** Converted the last two hook calls
> (`useKeyboard` open-file alert → `alertAction`; `useHotkeys` replay
> confirm → `confirmAction` via promise-chain since the dispatcher is
> sync). `CanvasViewport` was already native-modal-free. `app/admin/cad/`
> now has ZERO native `window.confirm`/`alert` (verified by grep). Only
> non-CAD admin areas remain for a future pass. Suite 2567 green. Replace the native
`window.confirm` / `window.alert` popups (48 in `app/admin/cad/`),
especially the TRV/data IMPORT confirmation popups in `MenuBar.tsx`
(Open + Import flows) the user dislikes, with the existing custom
Starr-styled modal system (`ConfirmDialog` / `confirmAction` +
`ModalFrame`). Action: build/extend a promise-based confirm + an
info/alert modal on `ModalFrame`; route every CAD `window.confirm`/
`alert` through them; replace the import-confirm `window.confirm` with
a styled import-summary modal (counts + notes + the title-block-apply
prompt in one Starr-themed dialog). Audit non-CAD admin areas for the
same. Tests: import flow uses the styled modal (no `window.confirm` in
the import path); a source-lock that `app/admin/cad/` has no
`window.confirm(`/`window.alert(` left in user-facing paths.

### Slice 14 — Generic calculator + expandable, proportionally-scaling calculator modals
*Added 2026-06-01 (user follow-up).* The floating-menu calculator
button opens specific surveying calculators; the user wants:
- A NEW **"Generic Calculator"** as the default — a simple
  Windows-calculator-style arithmetic calc (digits, + − × ÷, %, ±, .,
  C/CE, ⌫, =, decimal chaining) that's easy to use for quick sums.
- The calculator MODAL must be **expandable/resizable**, and EVERY
  calculator (generic + the existing specific ones) must **scale up
  proportionally** with the window — keep aspect/proportions, just grow.
- Expanding must NOT break any calculator's layout/formatting.
- Action: locate the calculator launcher + modal host (search
  `calculator`, the floating menu, the calculator registry/list), add
  the GenericCalculator component, register it as the default, make the
  modal `ModalFrame` resizable, and make each calculator's root use a
  proportional scaling container (CSS transform: scale / container
  units / aspect-ratio box) so children grow together. Do THREE full
  passes over styling/formatting + verify expand doesn't break any
  calculator. Tests: generic calc arithmetic (chained ops, %, ±,
  clear, divide-by-zero guard); the modal exposes a resize affordance;
  each calculator renders inside the proportional scaler.

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
