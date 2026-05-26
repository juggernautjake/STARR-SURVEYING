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
- `add[]` — `POINT|LINE|POLYLINE|POLYGON|SPLINE|CIRCLE|ELLIPSE|ARC` with
  `points[]`, plus `closed`, `radius`, `radiusX/Y`, `rotationDeg`, `color`,
  `opacity`, `lineWeight`, `layerName`, `pointNumber`, `code`, `description`.
- `modify[]` — `{ id, points?, color?, opacity?, lineWeight? }`.
- `transform` — `{ ids|'SELECTION', translate{north,east}, rotateDeg, scale, about }`.
- `deleteIds[]`.

Executed as a single undoable batch; returns a human summary.

## 5. Phase plan

### Phase 1 — Execution foundation ✅ DONE
- [x] Selection digest in the prompt (coords/code/desc per selected feature).
- [x] `EDIT_DRAWING` action: add/modify/transform/delete, all primitives,
      styling (color/opacity/weight), closed splines, arcs, circles, ellipses.
- [x] One-batch undo, selection cleanup on delete, NE→world conversion.
- [x] Unit tests (`edit-drawing.test.ts`, `selection-digest.test.ts`).

### Phase 2 — Full situational awareness (context enrichment) 🚧 IN PROGRESS
Goal: the model can reason about geometry it didn't select.
- [x] Selection digest now carries **derived geometry**: line endpoints +
      midpoint + length; polyline/polygon vertices (capped 48) + centroid +
      perimeter + area; circle/ellipse/arc center + radius + area.
- [x] Snapshot exposes **layers** (names/colors) and **point codes in use**.
- [ ] Extend derived geometry to NON-selected but relevant features
      (proximity / same-layer set) with summarization + token caps.
- [ ] Prompt vocabulary for offset/intersection helpers.
- Acceptance: "label the midpoint of each boundary line" / "put a point at the
  centroid of these" works without the user pre-selecting every vertex.

### Phase 3 — Tool mastery & fidelity 🚧 IN PROGRESS
- [x] Best-fit helpers by intent (`fit` on EDIT_DRAWING): RECTANGLE
      (min-area bounding rect — recovers rotated-square orientation), CIRCLE
      (least-squares), LINE (total-least-squares), computed client-side from
      real coords. `fromIds` + `deleteSource` covers the pillar→square case.
      (`lib/cad/geometry/fit.ts`, tested in `fit.test.ts`.)
- [ ] `FIT_CURVE` (best-fit smooth spline through a point set).
- [ ] Line-type / symbol assignment via EDIT_DRAWING (dashed, fence, etc.).
- [ ] Text/label creation + bearing/distance/area annotations.
- [ ] Layer creation + assignment from the AI.
- Acceptance: AI fits exact shapes (not eyeballed) and styles them correctly.

### Phase 4 — Semantic / composite builders (point-code driven)
- [ ] Recipes that turn coded points into structures: house/building outline,
      fence (line + inline symbol), road (dual edges + centerline), boundary
      (closed polygon w/ bearings), driveway, utility runs.
- [ ] Code-aware: read `code`/`description` to choose the recipe + layer.
- Acceptance: "draw the house from these corner shots" yields a correct,
  layered, styled building.

### Phase 5 — Verification & self-correction loop
- [ ] After Apply, feed the model a post-edit digest (what now exists) so it can
      verify and propose corrections.
- [ ] Pre-Apply **validation + preview**: reject NaN/degenerate geometry, warn
      on huge/zero shapes, show a ghost preview before commit.
- [ ] Multi-step planning: allow the model to emit a short ordered plan of
      EDIT_DRAWING steps for complex art (e.g. Batman), applied sequentially.
- Acceptance: complex multi-shape drawings render correctly; bad outputs are
  caught before they hit the canvas.

### Phase 6 — Free-form illustration ("draw Batman")
- [ ] Stylization vocabulary: fills, layering/z-order, opacity, color palettes.
- [ ] A scratch/working area + scale normalization so art lands at a sane size.
- [ ] Iterative refine loop ("make the cowl sharper") operating on prior ids.
- Acceptance: a recognizable, stylized illustration from a single prompt.

### Phase 7 — Visual verification harness (Playwright + OCR)
Goal: close the loop — actually run the app, drive an AI edit, screenshot the
canvas, and check it behaved as expected; feed failures back into the plan.
- [ ] Headless Playwright spec that boots the CAD page, applies a known
      EDIT_DRAWING (e.g. fit-rectangle), screenshots the canvas region.
- [ ] OCR / pixel checks on the screenshot (point labels present, shape drawn).
- [ ] A scripted regression: feed canned actions → assert resulting document
      state (no model call needed) as the fast inner loop; Playwright as the
      slower outer loop.
- Feasibility note: full live AI+Pixi+OCR is heavy/flaky in CI and needs a dev
  server + ANTHROPIC_API_KEY. Inner loop (executor + geometry unit tests)
  already gives most of the signal; Playwright/OCR is best-effort and may be
  partially deferred if the dev-server boot proves too costly here.

## 6. Safety, validation, UX
- Every AI edit is **Apply-gated** and a **single undo step**.
- Client validates coordinates (finite), shape arity, and clamps opacity.
- Summaries report exactly what changed; failures explain why.
- Never mutate on the model's word alone — the user clicks Apply.

## 7. Testing strategy
- Pure executor tests (done): NE→world, each shape, transform, delete.
- Add: fit-helper math, composite recipes, validation rejections.
- Prompt/parse tests: malformed action JSON is parsed safely (no throws).
- Manual: browser run-through per phase (can't drive Pixi in CI).

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
- [ ] `coordinates.md` — NE↔world contract, units, angle conventions.
- [ ] `calculations.md` — bearing/azimuth, inverse, area (shoelace), curve
      formulas (R/Δ/L/T/chord), best-fit methods used by `fit.ts`.
- [ ] `actions.md` — EDIT_DRAWING schema with worked examples per intent.
- [ ] `recipes.md` — house/fence/road/boundary builders from coded points.
- [ ] A condensed digest of these is injected into the system prompt.

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
</content>
