# AI Drawing Assistant — Master Plan

Status: **in progress** · Owner: CAD/AI · Last audit: 2026-05-26

## 1. Vision

Make the in-CAD AI a *fully functional drawing assistant* that understands a
natural-language prompt and **executes real edits in the drawing** — creating,
editing, transforming, styling, and composing geometry — with enough spatial
awareness to place and orient everything correctly. The bar: a surveyor can say
"fit squares to these pillar shots," "draw the fence along these points," "make
this boundary a smooth closed curve," or even "draw a stylized Batman emblem"
and the AI drives the drawing tools to do it well.

Success criteria:
- The AI can produce **any** drawing expressible with the app's primitives.
- Edits are **accurate** (correct coordinates, scale, orientation), **safe**
  (one undo step, validated), and **reviewable** (Apply gate, clear summary).
- The AI has **full situational awareness**: it knows the coordinates of
  points/lines/shapes, their midpoints/endpoints/centers, the active layer,
  units, and scale.

## 1a. Capability summary (for QA)

Shipped & unit-tested (1,180+ CAD tests green):
- **Build**: POINT/LINE/POLYLINE/POLYGON/SPLINE(closed)/CIRCLE/ELLIPSE/ARC/
  TEXT via `add`; exact best-fit RECTANGLE/CIRCLE/LINE/CURVE via `fit`.
- **Edit**: `modify` (reshape + restyle), `transform` (translate/rotate/
  scale about centroid or pivot; no-op skipped), `deleteIds`.
- **Style**: color, area `fill` (all closed shapes), opacity, lineWeight,
  `lineType` (incl. fence inline symbols), point `symbol`, layers
  (auto-create + `createLayers`).
- **Awareness**: selection digest (coords, endpoints/midpoints/centroids,
  centers, length/area, line bearing+azimuth) + snapshot `linework` catalog
  of unselected shapes + codes/layers.
- **Safety**: degenerate-geometry rejection, one batch undo per action
  (verified reversible), parse-safety against malformed JSON, Apply gate.
- **Loop**: created features auto-select for iterative refinement.
- **Anti-hallucination**: `docs/ai-reference/*` + injected `REFERENCE_DIGEST`.

Needs a live browser pass (can't drive Pixi/OCR in this env): on-canvas fill
appearance, end-to-end AI chat → Apply, and the Playwright spec.

Suite state: `tsc --noEmit` clean; `__tests__/` = 3,772 passing. The only
failing file is `__tests__/recon/phase16-worker-sync.test.ts` (Supabase-mock
harvest sync) — pre-existing and unrelated to this work (different domain,
untouched here); out of scope for this doc.

Deferred (rationale inline below): DXF/PDF solid-hatch export of fills,
ghost preview, scratch/scale-normalization, OCR screenshot checks,
server-side recipe helpers, formal multi-step planner.

## 2. Architecture (current)

```
User → AIChatDock → ai-conversations-store.send()
     → POST /api/admin/cad/drawing-chat { doc, history, selectedIds }
     → handleDrawingChat() builds system prompt (snapshot + selection digest)
       → Claude returns { reply, action }
     → store.applyAction(action)
        ├─ UPDATE_TITLE_BLOCK / UPDATE_SETTING / REDRAW_LAYER / REGENERATE_PIPELINE
        └─ EDIT_DRAWING → applyEditDrawing() executes add/modify/transform/delete
```

Key files:
- `lib/cad/ai-engine/drawing-chat.ts` — request/response types, system prompt,
  snapshot + selection digest, action parser.
- `lib/cad/store/ai-conversations-store.ts` — send loop + `applyEditDrawing`.
- `app/api/admin/cad/drawing-chat/route.ts` — API surface.
- `app/admin/cad/components/AIChatDock.tsx` — chat UI + Apply gate.

## 3. Coordinate & unit conventions (contract)

- The model **sees and emits survey northing/easting (feet)** — the same frame
  shown in the snapshot and selection digest. Never a different frame.
- Client converts: `worldX = easting − originE`, `worldY = northing − originN`
  (`originN/E` from `displayPreferences`). Internal world: x=easting, y=northing.
- Angles: degrees CCW in the action schema; converted to radians internally.
- Lengths/radii/translations: feet. Line weight: mm. Opacity: 0–1.

## 4. Action schema (EDIT_DRAWING) — shipped

One action may combine all of:
- `add[]` — `POINT|LINE|POLYLINE|POLYGON|SPLINE|CIRCLE|ELLIPSE|ARC|TEXT` with
  `points[]`, plus `text`, `closed`, `radius`, `radiusX/Y`, `rotationDeg`,
  `color`, `fill`, `opacity`, `lineWeight`, `lineType`, `symbol`, `layerName`,
  `pointNumber`, `elevation`, `code`, `description`.
- `fit[]` — `{ shape:RECTANGLE|CIRCLE|LINE|CURVE, fromIds[], points[], closed,
  deleteSource, color, fill, opacity, lineWeight, layerName }`.
- `modify[]` — `{ id, points?, color?, fill?, opacity?, lineWeight?, lineType?,
  symbol?, layerName? }` (reshape / restyle / re-layer).
- `transform` — `{ ids|'SELECTION', translate{north,east}, rotateDeg, scale,
  about:'CENTROID'|{northing,easting} }` (no-op skipped).
- `createLayers[]` — `{ name, color? }`.
- `hideIds[]` / `unhideIds[]` — non-destructive visibility.
- `deleteIds[]`.

Executed as a single undoable batch; degenerate geometry is rejected and
reported; created features are auto-selected for iterative refinement.
Returns a human summary.

## 5. Phase plan

### Phase 1 — Execution foundation ✅ DONE
- [x] Selection digest in the prompt (coords/code/desc per selected feature).
- [x] `EDIT_DRAWING` action: add/modify/transform/delete, all primitives,
      styling (color/opacity/weight), closed splines, arcs, circles, ellipses.
- [x] One-batch undo, selection cleanup on delete, NE→world conversion.
- [x] Unit tests (`edit-drawing.test.ts`, `selection-digest.test.ts`).

### Phase 2 — Full situational awareness (context enrichment) ✅ DONE
Goal: the model can reason about geometry it didn't select.
- [x] Selection digest now carries **derived geometry**: line endpoints +
      midpoint + length; polyline/polygon vertices (capped 48) + centroid +
      perimeter + area; circle/ellipse/arc center + radius + area.
- [x] Snapshot exposes **layers** (names/colors) and **point codes in use**.
- [x] Non-selected features are now catalogued in the snapshot: a
      `linework` list (id, type, layer, center, length/area; capped 60) lets
      the AI target unselected shapes by id without pre-selection.
- [ ] Prompt vocabulary for offset/intersection helpers (defer — offset
      already available via transform/translate; intersection is niche).
- Acceptance: "label the midpoint of each boundary line" / "put a point at the
  centroid of these" works without the user pre-selecting every vertex.

### Phase 3 — Tool mastery & fidelity ✅ DONE
- [x] Best-fit helpers by intent (`fit` on EDIT_DRAWING): RECTANGLE
      (min-area bounding rect — recovers rotated-square orientation), CIRCLE
      (least-squares), LINE (total-least-squares), computed client-side from
      real coords. `fromIds` + `deleteSource` covers the pillar→square case.
      (`lib/cad/geometry/fit.ts`, tested in `fit.test.ts`.)
- [x] `FIT_CURVE` (best-fit smooth spline through a point set; `closed` for
      pond/lake loops) — `fit` shape "CURVE".
- [x] Text/label creation: `add` shape "TEXT" places a label (with
      rotation). Bearing/distance/area labels = AI computes the value from the
      selection digest and places it as TEXT. (Dedicated dimension-annotation
      objects deferred — separate annotation store, not undoable via the
      feature batch; a computed TEXT label covers the practical need.)
- [x] Line-type / symbol assignment via EDIT_DRAWING: `lineType` on add/
      modify (SOLID/DASHED/CENTER/FENCE_*/UTIL_POLE_LINE/…; fence types carry
      their inline symbols). Per-point `symbol` assigns a glyph
      (UTIL_POLE/VEG_TREE_DECID/MON_*/GENERIC_*) to a POINT.
- [x] Layer creation + assignment from the AI: `layerName` on add/fit
      auto-creates the layer if missing; `createLayers` pre-creates
      named/colored layers.
- Acceptance: AI fits exact shapes (not eyeballed) and styles them correctly.

### Phase 4 — Semantic / composite builders (point-code driven) 🚧 IN PROGRESS
- [x] Recipes documented (`docs/ai-reference/recipes.md`) and driven via the
      EDIT_DRAWING primitives now in place (fit, POLYGON/POLYLINE/SPLINE,
      line types incl. fence symbols, layers). The model composes
      house/fence/road/boundary from the selection digest + recipes.
- [x] Code-aware: snapshot exposes codes-in-use and each point's code/desc;
      recipes map codes→layer+style.
- [x] Label fidelity: LINE items in the digest now include `bearing`
      (app quadrant format) + `azimuthDeg`, so boundary/leg labels match the
      software exactly instead of being reformatted by the model.
- [ ] Optional: dedicated server-side recipe helpers (deferred — the
      primitives + prompt recipes already cover the cases; add only if real
      drawings expose gaps).
- Acceptance: "draw the house from these corner shots" yields a correct,
  layered, styled building.

### Phase 5 — Verification & self-correction loop 🚧 IN PROGRESS
- [x] After Apply, the just-created features are auto-selected, so the next
      turn's selection digest carries their exact geometry — the model can
      verify/refine its own output ("make the cowl sharper") on prior ids.
- [x] Pre-Apply **validation**: degenerate geometry (non-finite coords,
      zero-length lines, zero-area polygons, sub-epsilon radii, <4-pt splines)
      is rejected by `isDegenerateGeometry` and reported as "skipped N" in the
      action summary (parse layer already drops non-finite coords).
- [ ] Ghost **preview** before commit (UI; defer — needs canvas wiring).
- [x] Multi-step composition: one EDIT_DRAWING already carries many shapes
      (add[]/fit[]), and auto-select lets the model iterate across turns. A
      formal ordered-plan executor is deferred — batched + iterative covers
      complex art today; revisit only if turn limits bite.
- Acceptance: complex multi-shape drawings render correctly (validation
  catches degenerate output pre-canvas; visual correctness pending a live
  browser pass — see Phase 7).

### Phase 6 — Free-form illustration ("draw Batman") 🚧 IN PROGRESS
- [x] Stylization vocabulary: **area fills** (`fill` on add/modify →
      `style.fillColor`, rendered under the stroke for polygons),
      opacity, stroke color/weight, line types, and **z-order via layers**.
      (Canvas fill needs a browser visual check — code is guarded so unfilled
      shapes are unchanged.)
- [x] Iterative refine loop — AI-created features auto-select, so "make the
      cowl sharper" operates on the prior ids (Phase 5).
- [x] Circle/ellipse/closed-spline fill rendering (now filled under the
      stroke, guarded by fillColor).
- [ ] DXF/PDF solid-hatch export of fills (defer — export hatch is a
      separate sizeable change; on-screen fill covers the design need first).
- [x] Placement awareness: the snapshot now includes drawing `extents` (NE
      bbox) so the AI can size/position art relative to the existing drawing.
- [ ] Automatic scratch-area + scale normalization (defer — extents give the
      model what it needs to self-place; auto-normalization adds little).
- Acceptance: a recognizable, stylized illustration from a single prompt.

### Phase 7 — Visual verification harness (Playwright + OCR) 🚧 IN PROGRESS
Goal: close the loop — actually run the app, drive an AI edit, screenshot the
canvas, and check it behaved as expected; feed failures back into the plan.
- [x] Locally-runnable Playwright spec (`e2e/cad-menu-smoothness.spec.ts`):
      verifies menus stay open on mouse-leave + close on outside click, the
      Export submenu reveals on hover, and the AI drawing chat opens.
- [x] Scripted regression as the fast inner loop: canned actions →
      assert resulting document state (no model call) — this is the
      `edit-drawing` / `fit` / `selection-digest` / `parse-action` suites.
- [ ] Boot-the-app spec that applies a known EDIT_DRAWING + screenshots the
      canvas region (needs a seam to inject an action; defer until a test hook
      exists — model-in-the-loop screenshotting is flaky/expensive).
- [ ] OCR / pixel checks on the screenshot.
- Feasibility note: full live AI+Pixi+OCR is heavy/flaky in CI and needs a dev
  server + ANTHROPIC_API_KEY. Inner loop (executor + geometry unit tests)
  already gives most of the signal; Playwright/OCR is best-effort and may be
  partially deferred if the dev-server boot proves too costly here.

## 6. Safety, validation, UX
- Every AI edit is **Apply-gated** and a **single undo step** (verified: an
  add+delete batch fully reverts on one undo — `edit-drawing.test.ts`).
- Client validates coordinates (finite), shape arity, and clamps opacity.
- Summaries report exactly what changed; failures explain why.
- Never mutate on the model's word alone — the user clicks Apply.

## 7. Testing strategy
- Pure executor tests (done): NE→world, each shape, transform, delete, fit,
  degenerate-skip, layer create, line-type, label, auto-select.
- Fit-helper math (done): min-area rect / circle / line / hull.
- Parse-safety (done): malformed/hallucinated action JSON never throws and
  sub-fields are sanitized (`parse-action.test.ts`).
- Manual / Playwright: browser run-through per phase (can't drive Pixi/OCR in
  this env — Phase 7, locally runnable via the existing e2e harness).

## 8. Risk register
- **Coordinate-frame drift** — mitigated by a single NE↔world contract + tests.
- **Token bloat** from large drawings — Phase 2 summarization caps.
- **Model hallucinating ids/coords** — parser validates; unknown ids skipped.
- **Destructive edits** — Apply gate + batch undo + selection-scoped defaults.

## 10. AI reference library (anti-hallucination)
Authoritative, version-controlled references the AI consults so it computes
the way the app does and doesn't invent procedures. Lives in
`docs/ai-reference/`. When a user request matches a documented method, follow
it; only improvise for genuinely novel requests.
- [x] `coordinates.md` — NE↔world contract, units, angle conventions.
- [x] `calculations.md` — bearing/azimuth, inverse, area (shoelace), curve
      formulas (R/Δ/L/T/chord), best-fit methods used by `fit.ts`.
- [x] `actions.md` — EDIT_DRAWING schema with worked examples per intent.
- [x] `recipes.md` — house/fence/road/boundary builders from coded points.
- [x] A condensed digest of these is injected into the system prompt
      (`REFERENCE_DIGEST` in drawing-chat.ts).
- [x] `recipes.md` includes worked EDIT_DRAWING JSON per structure
      (pillar/fence/boundary+label/pond/poles) so the AI has concrete,
      copy-shaped references and doesn't guess the schema.
- [x] `context.md` documents the snapshot + selection-digest fields the AI
      receives (awareness surface) for the AI and maintainers.

## 11. Working agreement (this build window)
- Iterate via the stop hook: plan → build → test → review → refine → repeat.
- Active dev window until **4:30 AM CDT, 2026-05-26**; check the clock each
  session. After 4:30 AM: final adjustments + ensure a working state, then
  (once satisfied) complete the doc and move it to `completed/`.
- **Hard stop: no development past 5:00 AM CDT.**

## 9. Audit log
- 2026-05-26 — Phase 1 shipped (EDIT_DRAWING + selection digest).
- 2026-05-26 — Phase 2 (partial): derived geometry in the selection digest
  (endpoints/midpoints/centroids/centers/length/area) + layers & codes.
- 2026-05-26 02:5x CDT — Phase 3 (partial): `fit` helpers shipped
  (min-area RECTANGLE, least-squares CIRCLE, TLS LINE) in `lib/cad/geometry/
  fit.ts` + wired into EDIT_DRAWING; tested. Added Phase 7 (Playwright/OCR
  verification) and the AI reference library plan. Next: AI reference docs +
  inject digest into the prompt, then FIT_CURVE / labels / layer creation.
- 2026-05-26 02:50 CDT — AI reference library shipped (`docs/ai-reference/`:
  coordinates, calculations, actions, recipes) + condensed `REFERENCE_DIGEST`
  injected into the system prompt.
- 2026-05-26 03:0x CDT — Phase 3 COMPLETE: FIT_CURVE, TEXT labels, layer
  create/assign, and lineType assignment all shipped + tested. Also a UX
  fix outside this doc: dropdown menus stay open until click-away (MenuBar).
- 2026-05-26 03:1x CDT — Phase 5 (degenerate-skip + auto-select created),
  Phase 4 (line bearing/azimuth in digest), parse-safety tests, and a
  locally-runnable Playwright spec (menu smoothness + AI chat). Hardened
  coverage: transform-about-pivot, scale-about-centroid, spline reshape.
- 2026-05-26 03:2x–3x CDT — Phase 2 DONE (linework catalog), batch-undo
  integrity test, Phase 6 area fills (polygon + circle/ellipse/closed
  spline), point-symbol assignment, and reference/digest sync to the full
  capability set (fill/symbol/lineType/createLayers/FIT_CURVE/linework).
- 2026-05-26 03:5x–04:1x CDT — edit surface rounded out: move-to-layer +
  POINT survey-attr edits (number/code/desc/elevation) via modify,
  hide/unhide, point elevation on add, point symbols; awareness: active
  layer + drawing extents + selection style in snapshot/digest. Safety:
  no-op transform skip, fixed undo-of-hide, double-apply guard in chat UI,
  multi-aspect modify undo test. Hygiene: vitest excludes nested
  node_modules. Docs: context.md + worked recipe JSON; reference/digest
  kept in sync. Full AI/geometry/persistence/styles suites green (811).
</content>
