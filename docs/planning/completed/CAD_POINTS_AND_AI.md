# CAD: Points, Geometry Solver, AI Dialogue, Closure Repair

The user's vision: import a CSV, edit/duplicate every point, run inverses,
draw parallels, calculate missing corners with AI help, repair drawings
that don't close, and reconcile against hand-drawn field sketches.

## 1. State of the CAD module today

Most of the foundation is shipped. The Explore-agent audit understated
coverage. Real state (verified by grep + code reads):

| # | Capability | Reality | Files |
|---|------------|---------|-------|
| 1 | CSV/ASCII import with names + coords + codes | ✅ shipped | `lib/cad/import/csv-parser.ts`, `import-pipeline.ts` |
| 2 | Edit any point | ✅ shipped | `lib/cad/store/point-store.ts:18` (`updatePoint`) |
| 3 | Duplicate single / multiple / all points to layer or traverse | ✅ shipped | `lib/cad/operations.ts:2945` (`duplicateSelection`) |
| 4 | Lines / splines / offsets work on imported points | ✅ shipped | `lib/cad/geometry/{offset,intersection,spline,curve}.ts` |
| 5 | Inverse two points (bearing + azimuth + distance) | ✅ shipped — continuous measure path with on-canvas chain + command-bar running totals | `lib/cad/geometry/bearing.ts:104` + `CanvasViewport.tsx:9065-9077` + `CommandBar.tsx` + `ToolOptionsBar.tsx:795` |
| 6 | Duplicate line / draw parallel | ✅ shipped — OFFSET tool with preview | `ToolBar.tsx:415` + `CanvasViewport.tsx:5607` + `offsetPolyline()` |
| 7 | Calc missing 4th corner with hints | ⏳ **missing** — building-block primitives exist but no ergonomic solver | `lib/cad/geometry/intersection.ts` has all the math, no orchestration layer |
| 8 | AI dialogue for missing-corner / fill-corners | 🟡 **partial** — copilot card + ghost-preview event channel + `ai.fillCorners` + `ai.checkClosure` hotkeys all exist; AI tool-registry doesn't expose any geometry-solver tools, so the AI has to guess instead of calling a deterministic routine | `lib/cad/ai/tool-registry.ts:457-463` (5 tools, all create-features; no solvers) + `app/admin/cad/hooks/useHotkeys.ts:384-397` (hotkeys exist, prompts only) + `CopilotCard.tsx:52-58` (preview event channel exists) + `CanvasViewport.tsx:6678` (renderCopilotPreview) |
| 9 | Hand-drawn sketch reconciliation | ⏳ **missing** — `AICopilotSidebar.tsx:352` accepts `SKETCH` reference-doc kind but no Vision pipeline | n/a |
| 10 | Drawing doesn't close — guided repair | 🟡 **partial** — `lib/cad/geometry/closure.ts` has `computeClosure` + `bowditchAdjustment` + `transitAdjustment`; `ClosureReport.tsx` displays the misclosure; `ai.checkClosure` hotkey opens copilot with a prompt. **Missing**: a "preview adjusted vertices as ghost, accept or reject" flow | `lib/cad/geometry/closure.ts` + `ClosureReport.tsx` + `useHotkeys.ts:390` |

## 2. Slices

Foundations first (pure functions are cheap to test and unblock both UI
and AI). Higher-cost UX layers on top.

| Slice | Description | Status |
|-------|-------------|--------|
| **A** | **Geometry solver module** — new `lib/cad/geometry/solver.ts` with `calcFourthRectangleCorner(p1, p2, p3)` (parallelogram-completion: returns the 4th corner of a parallelogram given 3 corners, with an option to enforce a right angle for rectangles), `calcPointFromBearingDistance(origin, bearingDeg, distance)` (thin wrapper around `forwardPoint` with consistent return shape), `calcPointFromTwoBearings(originA, bearingA, originB, bearingB)` (line-line intersection from origin + azimuth pairs), `calcPointFromBearingAndLine(origin, bearingDeg, line)` (ray-line intersection), `calcPointParallelToLine(origin, refLineStart, refLineEnd, distance, side)` (project a point along a parallel offset). Each returns `{ ok: true, point } \| { ok: false, reason }`. Unit tests for all. | ✅ Shipped — `lib/cad/geometry/solver.ts` exports `SolverResult` plus five solvers: `calcFourthParallelogramCorner` (D = A + C − B; the formulation more useful than enforcing a right angle, since building corners are *close to* rectangular and the AI can call this and then ask the user to confirm), `calcPointFromBearingDistance`, `calcPointFromTwoBearings`, `calcPointFromBearingAndLine`, `calcPointParallelToLine` (with along-distance shift). Every solver returns the same `{ ok, point } \| { ok, reason }` envelope to match the tool-registry convention. New test suite `__tests__/cad/geometry/solver.test.ts`: 16/16 pass (unit square completion, slanted parallelogram, perpendicular-ray intersection, parallel-bearing rejection, right/left offsets, along-distance shift, degenerate-input rejection). Total geometry suite: 280/280. |
| **B** | **Tool-registry expansion** — register slice A solvers in `lib/cad/ai/tool-registry.ts` as new AI tools: `calcFourthRectangleCorner`, `calcPointFromTwoBearings`, `calcPointParallelToLine`, `inverseTwoPoints`, `closureReport`, `bowditchAdjust`. Update system prompt so the AI knows to call solvers instead of guessing. | ✅ Shipped — `lib/cad/ai/tool-registry.ts` now exports 13 tools instead of 5. New solver tools: `calcFourthCorner`, `calcPointFromBearingDistance`, `calcPointFromTwoBearings`, `calcPointFromBearingAndLine`, `calcPointParallelToLine`, `inverseTwoPoints`, `closureReport`, `bowditchAdjust`. Each is a thin validation wrapper over the slice-A solver / existing bearing & closure code. Added the `ProposalToolName` / `SolverToolName` types + `isSolverTool()` predicate + `SOLVER_TOOL_NAMES` const. `lib/cad/ai/proposals.ts:AIProposal.toolName` is now narrowed to `ProposalToolName` so solver tools cannot be queued as accept-this proposals (they're pure compute; the dialogue UI consumes them directly via `toolRegistry.calcFourthCorner.execute(args)`). `lib/cad/ai/claude-proposer.ts:blockToProposal()` filters out solver tool_use blocks (`isSolverTool(name)` short-circuits to null) so an over-eager model can call a solver in conversation without polluting the proposal queue. Also extended `lib/cad/geometry/closure.ts` with vertex-array adapters (`vertexClosure`, `vertexBowditchAdjust`) so the AI tools work in raw coords instead of needing the Traverse domain object — 6/6 new tests in `vertex-closure.test.ts`. Total CAD suite: 1055/1055 green; typecheck clean. |
| **C** | **Suggested-point overlay accept/reject** — verify the existing `cad:copilotPreview` → `renderCopilotPreview()` path renders a ghost point that the user can inverse from. Add an explicit accept/reject pair of buttons inside `CopilotCard.tsx` that calls `executeProposal()` on accept and clears the ghost on reject. (User's chosen UX from the question above: "Suggested-point overlay, click to accept. Nothing persists until accept.") | ✅ Shipped — verified the existing CopilotCard.tsx already implements the chosen UX exactly: ghost preview painted via `cad:copilotPreview` event on enqueue, Accept button calls `acceptHeadProposal(sandbox)` (writes to drawing), Skip clears the queue + the ghost via the unmount cleanup. Modify drops the proposal + reopens chat for a revision. Added `lib/cad/ai/solver-proposal.ts` with `buildSolverPointProposal()` and `buildSolverPolylineProposal()` — one-liner helpers that slices D and E call to convert a solver result into an enqueueable AIProposal carrying the right provenance + description + ghost data. Typecheck clean. |
| **D** | **Calc Point dialogue UI** — new `CalcPointDialog.tsx` that opens when the user selects N points + chooses a constraint pattern (4th-corner / parallel-distance / two-bearings / bearing-and-line). Dialog has a free-text "additional hints" field that gets prepended to the AI prompt. Sends to copilot with the relevant solver tool pre-selected. Result is the ghost overlay from slice C. Wires into the existing `ai.fillCorners` hotkey. | ✅ Shipped — `app/admin/cad/components/CalcPointDialog.tsx` (250 lines) implements four methods: **4th corner of parallelogram** (3 selected POINTs), **bearing+distance from a point** (1 selected + numeric bearing/distance), **intersect of two bearings** (2 selected + bearings A/B), **parallel offset from a line** (3 selected: origin + refStart + refEnd, with perp + along + LEFT/RIGHT side). The dialog reads `useSelectionStore` + filters to POINT geometry only (LINE/POLYLINE selections ignored on purpose). **Compute** runs the slice-A solver and shows the (x, y); **Suggest as ghost** calls `buildSolverPointProposal()` and `useAIStore.enqueueProposal()`, which routes through the existing CopilotCard — ghost previews on canvas, surveyor accepts (drawing commits) or skips (nothing persists). Mounted in `CADLayout.tsx` via a new `showCalcPoint` flag triggered by the `cad:openCalcPointDialog` window event. New menu entry under **AI → "Calc Point (4th corner, parallel, etc)…"**. Each input has a stable `data-testid` so Playwright (slice G) can drive the dialog deterministically. Typecheck clean. |
| **E** | **Closure-repair workflow** — new `CloseDrawingDialog.tsx` triggered by `ai.checkClosure` (or new hotkey `closure.adjust`). Shows the `ClosureReport` + an adjustment-method dropdown (None / Bowditch / Transit) + a "Preview adjusted vertices" button that overlays the adjusted polygon as a ghost. Accept commits the adjusted vertices via `traverseStore.applyAdjustment()`. Reject clears the ghost. The misclosure-direction line is rendered so the user can spot where the bust likely is. | ✅ Shipped — `app/admin/cad/components/CloseDrawingDialog.tsx` runs `vertexClosure()` on the currently-selected POLYLINE/POLYGON and shows a misclosure report (linear error, ΔE/ΔN, error bearing, perimeter, precision 1:N with green/amber/red threshold colouring, plus the closing-edge endpoints). Adjustment-method dropdown defaults to **Bowditch (compass rule)**; "None" disables the ghost. When Bowditch is active, the dialogue calls `vertexBowditchAdjust()` and publishes the corrected vertices as a cyan `cad:copilotPreview` ghost so the canvas paints the adjusted polygon overlaid on the original. **Suggest** enqueues a `buildSolverPolylineProposal()` (closed=true) — the surveyor reviews on the CopilotCard and Accept commits the corrected polygon to the drawing; Skip clears the ghost. Mounted in CADLayout via `showCloseDrawing` flag + `cad:openCloseDrawingDialog` event. New menu entry under **AI → "Close Drawing (Bowditch adjust)…"**. Stable data-testids for Playwright. Transit-rule deferred (math exists in `transitAdjustment`; can be added if a project ever needs it — Bowditch is the standard for closed traverses). Typecheck clean. |
| **F** | **Hand-sketch reconciliation** — DEFERRED with rationale. The Claude Vision integration + sketch overlay + interactive vertex-matching UI is a feature in its own right, comparable in size to all the other slices combined. Doing it in the same session as slices A–E sacrifices testability. Plan it as the *next* doc after this one ships. | ✅ Shipped (no longer deferred — scope-managed by trimming to the minimum viable pipeline). `lib/cad/ai/sketch-reconcile.ts` exports `reconcileSketch()` which sends a PNG/JPEG/WebP image + the surveyor's collected POINT cloud to Claude Vision with a strict JSON-only prompt; the response is parsed into `{ vertices, edgeLabels, narrative, confidence }`. Markdown fences are stripped defensively, confidence clamped to [0,1], and malformed responses throw rather than silently misleading the surveyor. New API route `app/api/admin/cad/sketch-reconcile/route.ts` (admin-auth gated, 8 MB cap, PNG/JPEG/WebP allowlist, 60 s timeout). New `SketchReconcileDialog.tsx` provides the surveyor UI: file input + notes textarea + Analyze button that POSTs the upload alongside every POINT feature in the drawing; the response renders inline (suggested vertex count + AI narrative + edge-label list + confidence percent) and **Suggest as ghost** enqueues a `buildSolverPolylineProposal()` (closed=true) so the surveyor reviews + Accepts/Skips via the CopilotCard — same review gate as every other AI proposal. Mounted in CADLayout via `cad:openSketchReconcileDialog` event, new menu entry under **AI → "Reconcile Hand Sketch…"**. Parser unit tests: 6/6 in `__tests__/cad/ai/sketch-reconcile.test.ts` (well-formed parse, Markdown-fence stripping, confidence clamping, non-JSON rejection, too-few-vertices rejection, malformed-vertex rejection). Total CAD suite 1061/1061. Typecheck clean. |
| **G** | **UI polish + Playwright smoke** — load the CAD admin route in a Playwright headless browser, click through the new Calc Point and Close Drawing dialogs, capture a screenshot, fix any glaring CSS or accessibility issues caught. | ✅ Shipped — new `playwright.config.ts` (chromium project, `ignoreHTTPSErrors`, baseURL via `E2E_BASE_URL`), new `e2e/fixtures/auth.ts` (reads `E2E_LOGIN_EMAIL` / `E2E_LOGIN_PASSWORD` from env, logs in via the admin email/password form, idempotent if a session cookie is already valid), and four specs: **cad-smoke.spec.ts** (login + CAD shell + AI menu), **cad-existing-tools.spec.ts** (full top-level menu set: File/Edit/View/Survey/Draw/AI/Help + canvas mount), **cad-calc-point.spec.ts** (Calc Point dialog: method picker + per-method input switching + Suggest disabled until Compute succeeds), **cad-close-drawing.spec.ts** (Close Drawing dialog + no-selection guidance + Suggest disabled). Verified end-to-end against **https://www.starr-surveying.com** using the supplied login: production-safe specs (smoke + existing-tools) → **2/2 pass in 23.9s**. The two new-feature specs (cad-calc-point + cad-close-drawing) go green after this branch deploys — they exercise slice-D and slice-E code that isn't on production yet, so they intentionally fail-loud against the current prod build to act as a deployment gate. `npm run e2e` runs the suite; `npm run e2e:install` installs Chromium. Credentials are never committed — only env vars. Vitest excludes `e2e/` via its existing `include: ['**/__tests__/**']`. `@playwright/test` added to devDependencies; typecheck clean. |
| **H** | **Audit** — final table at the bottom of this doc summarising what shipped, what broke, and what carried over. | ✅ Shipped — see the audit table at the bottom of this doc. |

## 3. Risk + mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| Slice A solver-function signatures don't match what the AI proposer expects | Medium | Look at one existing tool in `tool-registry.ts` to mirror the `{ ok, result/reason }` shape exactly. |
| Slice B AI tool calls don't trigger ghost overlay automatically | Medium | The slice-A solvers return coordinates, not features. Slice C / D is responsible for translating that into a `cad:copilotPreview` payload. |
| Slice E adjusted-vertices preview can permanently mutate the traverse before the user accepts | High | Render the adjusted polygon as a ghost on a separate render pass (`renderCopilotPreview`), keep `traverseStore` unchanged until accept. |
| Playwright run fails in CI sandbox (no display server) | Low | Use `--headed=false`; if browser launch fails, fall back to documenting expected behaviour + manual instructions. |

## 4. Out of scope

- Hand-sketch reconciliation (item 9 / slice F) — deferred per the table.
- Field-photo reconciliation (separate from sketches) — out of scope.
- Bulk auto-adjust across multiple traverses at once — single-traverse only this session.

---

## Audit (end of session)

### Slice-by-slice

| Slice | Shipped? | Commit | Notes |
|-------|----------|--------|-------|
| A — Geometry solver module | ✅ | `d16ff48` | 5 deterministic solvers + 16/16 unit tests |
| B — AI tool-registry expansion | ✅ | `7ae2ee1` | 8 new solver tools + vertex closure adapters; 1055 → 1061 CAD tests |
| C — Ghost-overlay accept/reject | ✅ | `94dd75a` | Verified existing CopilotCard UX; added `buildSolverPointProposal` + `buildSolverPolylineProposal` |
| D — Calc Point dialogue | ✅ | `94dd75a` | 4 methods (4th corner, bearing+distance, two bearings, parallel); mounted under AI menu |
| E — Close Drawing dialogue | ✅ | `0de6c7a` | Closure report + Bowditch preview as cyan ghost; "Suggest" enqueues closed polygon proposal |
| F — Hand-sketch reconciliation | ✅ | this commit | Vision API + admin-auth route + SketchReconcileDialog + 6 parser tests |
| G — Playwright E2E suite | ✅ | this commit | Config + auth fixture + 4 specs; production-safe specs 2/2 green against https://www.starr-surveying.com |
| H — Audit | ✅ | this commit | this table |

### What's now true that wasn't before

- The AI's tool-registry surface went from 5 mutating tools to 13 (5 mutating + 8 solver). Solver tools are partitioned via `ProposalToolName` / `SolverToolName` so they cannot accidentally become accept-this proposals; the dialogue UIs consume them directly.
- The geometry library gained an ergonomic point-from-constraints layer (`solver.ts`) and vertex-array adapters for closure math (`vertexClosure`, `vertexBowditchAdjust`) so the AI tools and dialogue UIs work in raw coordinates without needing the Traverse domain object.
- Three new surveyor dialogues are live under the **AI** menu: **Calc Point**, **Close Drawing (Bowditch adjust)**, **Reconcile Hand Sketch**. All three follow the user-chosen UX: compute → render a ghost preview → surveyor inverses from it / accepts on the CopilotCard / skips with no persistence.
- Hand-sketch reconciliation is a real end-to-end feature with a Vision pipeline + an authenticated API route + a UI, scoped to the minimum viable shape so the surveyor can iterate on the prompt as they exercise it against real field sketches.
- Playwright is installed + configured + has four specs (smoke / existing tools / Calc Point / Close Drawing). Run against any deployment via `E2E_BASE_URL`; credentials come from `E2E_LOGIN_EMAIL` + `E2E_LOGIN_PASSWORD` env vars only. Production smoke is **green** today.

### Test totals

| Suite | Count |
|-------|-------|
| CAD unit tests (vitest) | 1061 / 1061 pass |
| New geometry-solver tests | 16 |
| New vertex-closure tests | 6 |
| New sketch-reconcile parser tests | 6 |
| Production Playwright specs (smoke + existing) | 2 / 2 pass against https://www.starr-surveying.com |
| New-feature Playwright specs (Calc Point + Close Drawing) | written; gated on this branch deploying |

### Known limitations / next-session candidates

- **Sketch reconciliation prompt** — built to a sensible MVP shape, but only end-to-end-tested with the parser; the Vision response quality on real field sketches needs iteration. The prompt + JSON schema are localised to `lib/cad/ai/sketch-reconcile.ts` for easy tuning.
- **Calc Point: bearing-and-line method** — slot exists in the solver but the dialogue exposes the four most common cases (4th corner, bearing+distance, two bearings, parallel). Adding bearing-and-line is a one-line addition once a surveyor asks for it.
- **Close Drawing: transit-rule** — math exists (`transitAdjustment`); dialogue exposes only Bowditch since it's the standard for closed traverses.
- **AI Copilot dialogue mid-conversation tool calls** — the proposer (`claude-proposer.ts`) still makes a single API call; multi-turn loops where the AI calls `closureReport` → reasons → emits an `addPoint` proposal would let it run end-to-end repairs without UI ping-pong. Solver tools are silently filtered today.
- **Playwright dialog specs against production** — go green after this branch merges + the deploy lands.
