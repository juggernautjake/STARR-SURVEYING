# Starr CAD — full audit, UX overhaul, and performance program

**Opened 2026-08-03** at the owner's request. This is the planning doc for a multi-session
initiative; it is deliberately opened rather than attempted in one pass, for the reason recorded in
§0.

---

## 0. Why this is a plan and not a slice

The owner's ask, in one paragraph, spans: a complete catalogue of the software via Playwright and
OCR; a gap analysis; a UI/UX condensation pass; a performance program covering load time, render
time on change, and an intermittent freeze that costs unsaved work; COGO calculators
(bearing/distance, distance/distance, bearing/bearing); AI that can drive the program to draw and
calculate; and comparison of a drawing against prior surveys for the same lot.

That is six programs, not one task. **The freeze in particular must not be guessed at** — "it kind of
freezes and dies sometimes and we have to refresh, which can cause us to lose stuff" is a symptom
with at least four plausible causes (an unbounded listener set, a render loop that never settles, an
undo stack that grows without limit, or a canvas/WebGL context leak). Each has a different fix and
three of the four are made *worse* by the obvious remedy for another. It needs a profile, not a
hypothesis.

**The scale.** 106 components under `app/admin/cad/components/`, 242 modules under `lib/cad/`, and
**55 planning docs in `docs/planning/completed/`** — this subsystem is mature and heavily documented
already. Any catalogue that ignores those 55 docs will re-derive decisions that were made
deliberately, which is how a "cleanup" undoes a fix.

---

## 1. What exists (skeleton — to be completed in S1)

| area | where |
|---|---|
| UI components | `app/admin/cad/components/` — 106 files |
| Domain + geometry | `lib/cad/geometry`, `lib/cad/calculators`, `lib/cad/codes` |
| AI | `lib/cad/ai`, `lib/cad/ai-engine` (incl. `deed-parser.ts`) |
| I/O | `lib/cad/import`, `lib/cad/export`, `lib/cad/delivery` (DXF, GeoJSON, PDF) |
| Prior art | 55 completed docs, incl. `cad-domain-audit-2026-06-11`, `cad-calculator-suite-2026-05-31`, `cad-desktop-tauri-and-perf-2026-06-14` |

**Read `cad-domain-audit-2026-06-11.md` and `cad-desktop-tauri-and-perf-2026-06-14.md` before
starting S1.** A performance pass already happened; repeating it without reading it wastes the
session and risks reverting it.

---

## 2. Slices

Each is sized to be shipped and verified independently, in the order that makes the next one cheaper.

- **S0b. What the previous perf pass already established** — read this before S2 or S4.
  **DONE 2026-08-03**, by finally reading `cad-desktop-tauri-and-perf-2026-06-14.md` (1,265 lines).

  Its Phase 2 was a six-slice renderer pass, and most of it **shipped**:

  | slice | state |
  |---|---|
  | P1 spatial index for feature bounds | DONE — `lib/cad/spatial/feature-index.ts`, a hand-rolled uniform grid |
  | P2 viewport culling in the render loop | DONE |
  | P3 / P3b dirty-region tessellation, store + renderer | DONE — this is the guard I mistakenly reported as absent |
  | P4 / P4b non-blocking label regen, chunked + worker | shipped |
  | P5 LOD threshold tuning + lazy label render | shipped |
  | **P6 React boundary audit** | **only ONE cut done** |
  | N1 profiling harness | **complete and reachable** — see below |
  | Phase 3 native Rust/wgpu renderer | deliberately deferred, **profiling-gated** |

  ### ▶ The real open lead for the freeze is P6, not the render loop

  The previous author's own hypothesis, written in that doc: *"`CanvasViewport.tsx` is 14,431 lines —
  almost certainly re-renders the world on every store tick."* Only the first boundary cut shipped
  (the status-bar cursor pill, moved to its own memoized component with per-field selectors). **The
  audit itself was never completed** — and the file has since grown to **15,403 lines**.

  That is a far better-grounded lead than the one I invented, and it comes from someone who had
  profiled the thing. It also fits the symptom better than a render-loop theory: a React reconcile
  storm on every store tick blocks the main thread in bursts tied to *interaction*, which is what
  "freezes while I am working and I have to refresh" describes.

  **The named technique is already in the doc**: split via `useSyncExternalStore` selectors with
  shallow equality; lift `cursorWorld`, `zoom` and `isBoxSelecting` into their own selectors so a
  cursor move does not reconcile the whole canvas component; memoize `MenuBar` / `LayerPanel` /
  `PropertyPanel` keyed by the selection-id set rather than raw `selectedIds`. Measure with the React
  Profiler on a fixture and record the delta.

  ### ▶ THE MEASUREMENT APPARATUS IS ALREADY COMPLETE — there is no excuse for guessing

  I wrote, one paragraph above, that the fixtures "were planned and I have found no evidence they
  were built", then checked. **They are built.** `lib/cad/perf/fixtures.ts` exports
  `FIXTURE_SIZES = { small: 1_000, medium: 50_000, large: 200_000 }`, `generateSyntheticFeatures` and
  `generateNamedFixture` with a fixed seed — and `PerfOverlay.tsx` imports them and generates a
  fixture on demand.

  So the full loop exists and is reachable **today**, with no build step:

  > `Ctrl+Alt+P` → generate the **large (200,000-feature)** fixture → read p50 / p95 / p99 and the
  > per-phase breakdown from the live histogram.

  That makes every performance question in this program answerable in minutes. It also means both of
  today's wrong mechanisms — mine about the dirty check, and my near-miss about the missing fixtures —
  were produced by reading code when a measurement was one keystroke away.

  **That is the finding of this slice, and it is worth more than either theory:** the reason this
  subsystem keeps attracting confident wrong analysis is that its instrumentation is invisible unless
  you go looking. Nothing in the UI advertises `Ctrl+Alt+P`. Anyone who does not know the hotkey
  reasons from source, and reasoning from source is what produced two errors here in one session.

  **First action for S2, before any code is read again:** run the large fixture and paste the
  histogram into this document. Whatever it says, it settles the argument.

  ### S0c — the overlay is now discoverable. **DONE 2026-08-03.**

  The one fix this finding actually justified, and it needed no reasoning about rendering internals:
  `view.perfOverlay` is registered in `DEFAULT_ACTIONS`, so the **command palette lists it**.
  `Ctrl+Alt+P` still works — a second door, not a moved one — and dispatch uses the same `CustomEvent`
  pattern as `view.regenerate`, leaving `PerfOverlay` owning its own state.

  Its description says what it is *for*: *"Live render-time histogram (p50/p95/p99 per phase) with
  synthetic 1k / 50k / 200k fixtures — measure before theorising about performance."* A bare
  "Performance Overlay" in a list of forty actions stays hidden in practice.

  Tested that the original keydown handler survives and that **both** listeners are removed on
  unmount — a leaked window listener is precisely the bug class this overlay helps find.

- **S1. The catalogue.** Drive the CAD editor with Playwright: every menu, panel, dialog and tool,
  screenshotted, with what it does and what it operates on. Cross-referenced against the 55 completed
  docs so a documented decision is recorded as a decision, not as a gap.
  *Acceptance:* a reader who has never opened the software can name every tool and say what it edits.

- **S1a. The menu catalogue.** ✅ **DONE 2026-08-03.** S1 as written ("every menu, panel, dialog and
  tool") is not a slice — 106 components. Sliced by surface; this is the menu bar, taken first
  because S5 (condense menus) is blocked on it. Captured by driving the live app, not by reading
  `MenuBar.tsx`, so an item that fails to render would be absent here.

  **Seven top-level menus, ~75 items.**

  | menu | items |
  |---|---|
  | **File** | New Drawing `Ctrl+N` · Open… `Ctrl+O` · Open Saved Drawing… · File Manager… · Drawing notes… · Branches & Reviews… · Point File Library… · Recover unsaved drawings… · Save `Ctrl+S` · Save to Cloud… · Save a copy (local .starr)… · Export ▸ · Import ▸ · Review & Delivery ▸ |
  | **Edit** | Undo `Ctrl+Z` · Redo `Ctrl+Y` · Delete Selection `Del` · Select All `Ctrl+A` · Deselect All `Esc` · Send to Layer… `Ctrl+Shift+L` · Intersect Lines… `I X` · Reverse Direction · Explode (Polyline → Lines) · Smooth → Spline · Simplify polyline (0.5 ft tolerance) |
  | **View** | Zoom Extents `Z E` · Fit Drawing to Page · Move Page · Show Grid `F7` · Disable Snap `F3` · Hide Layer Panel · Hide Properties · Data tables & viewers ▸ · Project Images… `IM` · Hide Title Block |
  | **Survey** | Adjust Orientation… `OA` · Rotate Drawing View… `RV` · Title Block & North Arrow… · Code-to-Style Mapping… · Connect Points into Linework · Curve Calculator… `CC` · Calculator… `C` · Arc `A` · Spline (Fit-Point) `SF` · Spline (NURBS) `SN` · Curb Return / Fillet `CR` · Offset `OF` · Inverse (Bearing & Distance) `INV` · Forward Point `FP` |
  | **Draw** | Point `P` · Line `L` · Polyline `PL` · Polygon `PG` · Rectangle `RE` · Circle `CI` · Regular Polygon `RP` · Move `M` · Copy `CO` · Rotate `RO` · Mirror `MI` · Scale `SC` · Erase `E` |
  | **AI** | AI mode: AUTO / COPILOT / COMMAND / MANUAL · Cycle AI mode `Ctrl+Shift+M` · Run AI Drawing Engine… · Show AI review queue · AI clarifying questions… · AI drawing chat… · AI sidebar (tabs) · Calc Point… · Close Drawing (Bowditch adjust)… · Reconcile Hand Sketch… |
  | **Help** | Settings & Preferences… · Keyboard Shortcuts… · About Starr CAD |

  ### The finding that changes another slice

  **The owner asked for COGO that already exists.** The request was "bearing/distance calculations,
  distance/distance calculations, bearing/bearing calculations". `CalcPointDialog` implements
  `DIST_DIST`, `BRG_DIST`, `TWO_BEARINGS`, `FOURTH_CORNER` and `PARALLEL` over
  `lib/cad/geometry/cogo.ts` and `geometry/solver.ts` — all of it, working.

  It was filed under the **AI** menu, because the dialogue happens to deliver its answer as a
  reviewable ghost proposal. That is a detail of *how the result is presented*, and it had become the
  reason nobody could find the feature. **Classic COGO is not an AI feature; it is the oldest
  arithmetic in surveying**, and a surveyor looking for it opens Survey.

  This is the built-but-unreachable defect in its subtlest form yet: nothing missing, nothing broken,
  and the capability still effectively absent. It is also why S1 had to come before S6 — S6 would
  otherwise have rebuilt a working solver.

  ### Other observations for S5 (recorded, not acted on)

  1. **`Draw` mixes creation with modification.** Point…Regular Polygon create; Move/Copy/Rotate/
     Mirror/Scale/Erase modify. One flat list, no separator, so "Erase" sits in the menu you open to
     make things.
  2. **`File` offers three saves and four opens.** Save / Save to Cloud / Save a copy (local
     .starr); Open… / Open Saved Drawing… / File Manager… / Point File Library…. The difference
     between "Open…" and "Open Saved Drawing…" is not discoverable from the labels.
  3. **`AI` spends five entries on one setting** — four mode items plus Cycle.
  4. **`Survey` mixes computation with drawing tools.** Arc, Spline, Curb Return and Offset are draw
     tools living in Survey; Calculator and Curve Calculator are computations.
  5. **`Edit` carries geometry operations** (Explode, Smooth → Spline, Simplify) that are closer to
     Draw's modify group than to Undo/Redo/Select.

  Item 1 and item 5 point at the same reshape — a **Modify** group — which is the strongest S5
  candidate. Deliberately not acted on here: condensing menus is a behavioural change that needs the
  rest of the catalogue (panels, dialogs, the 40-action command palette) first.

- **S6a. Classic COGO reachable from Survey.** ✅ **DONE 2026-08-03.** The one-line consequence of
  the finding above: `Calc Point…` and `Close Drawing (Bowditch adjust)…` now also appear under
  **Survey**, dispatching the *same* `cad:openCalcPointDialog` / `cad:openCloseDrawingDialog` events
  — not a second implementation, which would drift from the original within a release.

  **Listed in both menus rather than moved.** The AI path is documented and someone knows where it
  lives; a "cleanup" that costs a user their muscle memory is not a cleanup.

  **Verified in the browser, not just in source.** Opened Survey in the running app, both items
  render; clicked Calc Point and the dialogue opens with Method = *Distance–distance (2 selected:
  dist from each)*, the selected-POINT counter, distance inputs, and Compute / Suggest as ghost.
  Six tests pin it, scoped to the Survey menu block specifically — the AI menu contains the same
  labels by design, so a whole-file `toContain` would have passed without the fix.

  **S6 is now much smaller than written.** What remains is verifying curve solving and area against
  the existing `Curve Calculator…` and `Calculator…`, not building intersections.

- **S2. The freeze — measured, not guessed.** Reproduce under `performance.measureUserAgentSpecificMemory`
  and a heap snapshot; instrument listener counts and the undo stack across a long session.
  *Acceptance:* the cause is NAMED with evidence, before any fix is written.
  *This is the highest-value slice: it is the only one that currently costs the owner work.*

  **Three hypotheses already ruled out (2026-08-03), cheaply, from the code:**

  | suspect | finding |
  |---|---|
  | leaked DOM listeners | `addEventListener` and `removeEventListener` occur **137 times each** in `app/admin/cad`. A balanced count is not proof every pair matches, but it rules out the usual careless case. |
  | unbounded undo stack | capped — `MAX_UNDO_STACK = 500`, applied on every push in `lib/cad/store/undo-store.ts`. |
  | undo entries holding whole-drawing snapshots | they do not. Entries are `UndoOperation[]` — deltas, not snapshots — which is the design that keeps a 500-deep stack cheap. |

  So the obvious three are already handled, and a session that starts by "fixing" them will spend
  itself confirming existing correctness. **What remains, in priority order:** a canvas/WebGL context
  or `ImageBitmap` that is never released (the owner mentions *images* specifically); a render loop
  that never settles — there are **13 `requestAnimationFrame` sites** and they are the first thing to
  instrument; and accumulation in the AI stores (`lib/cad/ai`, `ai-engine`), which hold chat and
  proposal history and are the newest code in the subsystem.

  Note the shape of the symptom: *freezes* and needs a *refresh*. That is more consistent with a
  runaway loop or a blocked main thread than with a slow leak, which would degrade rather than stop.
  Measure frame time before memory.

  ### ⚠ CORRECTION 2026-08-03 — read this before the section below

  **The claim below is substantially WRONG and is kept only because the correction is the useful
  part.** I wrote that `renderAll()` "has no early-out of any kind" and "rebuilds the entire scene"
  sixteen times a second. The loop is indeed unconditional — that part holds — but the passes inside
  it are individually guarded, and a previous perf pass built exactly the optimisation I was about to
  propose:

  | pass | guard |
  |---|---|
  | `renderFeatures` | viewport culling + a per-feature draw-state cache (feature ref, epsilon, layer colour) + the store's `dirtyFeatureIds` set. A feature is re-tessellated ONLY if one of those changed. |
  | `renderImageFeatures` | sprite/texture cache keyed by image id |
  | `renderLabels` | LOD gate — `shouldRenderLabels(worldPerPixel, lod)` |
  | `renderGrid` | early return when the grid is hidden |

  That work is `cad-desktop-tauri-and-perf` **Slices P3 and P3b**, cited in the code comments by
  name. So the per-frame cost on an unchanged scene is the guard checks and the cull, **not** a full
  scene rebuild — and "add a dirty check" is not the fix, because there is one.

  **This is exactly the failure §1 of this document warns about**, committed one slice after writing
  the warning: *"any catalogue that ignores those 55 completed docs will re-derive decisions that
  were made deliberately, which is how a cleanup undoes a fix."* I read the code, formed a
  confident mechanism, and did not read `cad-desktop-tauri-and-perf` first. Had this shipped as a
  fix rather than as a note, it would have added a second dirty layer on top of a working one.

  **What survives the correction, and is still worth measuring:** the loop does run `renderAll()`
  every frame, so the *guards themselves* — the cull, the map lookups, the dirty-set read across
  every culled feature — run at 60 fps forever, on top of whatever the unguarded passes
  (`renderSelection`, `renderToolPreview`, `renderSnapIndicator`, and the rest of the sixteen) cost.
  Whether that is enough to saturate the main thread on a large drawing is a **measurement**, and
  `Ctrl+Alt+P` answers it. Do not assume it from this document — the last confident mechanism in it
  was wrong.

  ### ~~▶ Strong candidate found 2026-08-03: the render loop has no dirty check~~ (superseded — see correction above)

  `CanvasViewport.tsx` (**15,403 lines**) starts a `requestAnimationFrame` loop that calls
  `renderAll()` **every frame, unconditionally, forever**:

  ```ts
  function renderLoop() {
    if (!pixiRef.current) return;
    try { renderAll(); } catch (err) { /* frame skipped */ }
    rafRef.current = requestAnimationFrame(renderLoop);   // always reschedules
  }
  ```

  And `renderAll()` has **no early-out of any kind** — no dirty flag, no version check, no
  comparison against last-rendered state. Every frame it rebuilds the entire scene:

  > `renderPaper`, `renderGrid`, `renderFeatures`, `renderImageFeatures`, `renderLabels`,
  > `renderAreaAnnotations`, `renderTextFeatures`, `renderSelection`, `renderInverseMeasurement`,
  > `renderSnapIndicator`, `renderToolPreview`, `renderTransferGhost`, `renderIntersectPreview`,
  > `renderCopilotPreview`, `renderTitleBlock`, `renderPaperFurniture`
  >
  > — sixteen passes, 60 times a second, whether or not anything changed.

  **This explains all three symptoms at once**, which is why it is worth stating before the profile
  rather than after: large projects load slowly, changes render slowly, and the app *freezes* on
  exactly the drawings the owner describes — many layers, many images, many geometries. Once one
  frame's `renderAll()` exceeds 16 ms, frames queue, the main thread saturates, and the tab stops
  responding. That is a freeze needing a refresh, not a leak that degrades.

  **The instrumentation to prove it already exists, and it is already reachable.** `renderAll` is
  wrapped in `measureRender` from `lib/cad/perf/render-markers.ts`, as are `renderFeatures`,
  `renderImageFeatures`, `renderLabels` and `renderSelection` individually — and `PerfOverlay.tsx`
  is **mounted in `CADLayout` and toggled with `Ctrl+Alt+P`**, showing the histogram live.

  So S2 needs no tooling built at all. Open a large drawing, press `Ctrl+Alt+P`, and read which of
  the sixteen passes dominates. **Do that before changing anything**: the fix shape depends on
  whether the cost is spread across all sixteen or concentrated in one, and that is a five-minute
  question with an answer already on screen.

  (Checked rather than assumed — this subsystem has a habit of already containing the thing you were
  about to build, which is the other half of why §1 says to read the 55 completed docs first.)

  **The fix shape, and why it is not a drive-by.** A dirty-flag or store-version gate on the loop is
  the obvious remedy, but getting it wrong means the canvas silently stops updating — worse than the
  freeze, because it looks like it worked. It touches the largest component in the codebase and must
  be verified in a browser against a real drawing with images and many layers. **It is S2's fix, not
  a slice to sneak in.**

### ▶ MEASURED 2026-08-03 — the cause is named, and it is neither of the two theories above

Ran it, finally, instead of reading it. Dev server, `/admin/cad`, command palette → *Performance
Overlay* → **Large (200,000 features)**, then **Capture 5s** for a clean steady-state window.

**Conditions: nothing selected, nothing moving, no mouse input, no images in the drawing, labels
LOD-gated off at this zoom. The scene is static. This is the app doing nothing.**

| phase | n | p50 | p95 | p99 |
|---|---|---|---|---|
| overall | 325 | 67.0 | 292.9 | 334.6 |
| `renderFeatures` | 65 | **73.0** | 107.0 | 113.1 |
| `renderImageFeatures` | 65 | **62.9** | 94.7 | 106.7 |
| `renderLabels` | 65 | **62.6** | 86.3 | 117.5 |
| `renderSelection` | 65 | 0 | 0.10 | 0.10 |
| **`renderAll`** | 65 | **269.2** | 334.6 | 423.0 |

**65 frames in a 5,324 ms window — 12 fps on a static scene.** At 269 ms per frame the main thread is
saturated: input handlers queue behind the loop, the tab stops responding, and the only way out is a
refresh. **That is the owner's freeze, reproduced on demand.**

For scale, the same overlay on an **empty** drawing: `renderAll` p50 **2.90 ms**. The cost is
essentially all a function of feature count — 200k features cost ~93× an empty sheet.

#### The smoking gun: a pass with nothing to do costs 62.9 ms

There are **no images in this fixture**, yet `renderImageFeatures` spends 62.9 ms per frame. A pass
that draws nothing cannot be slow because of drawing. `CanvasViewport.tsx:2630`:

```ts
const visibleFeatures = useDrawingStore.getState().getVisibleFeatures().filter(
  (f) => f.geometry.type === 'IMAGE' && f.geometry.image,
);
```

And `getVisibleFeatures` (`lib/cad/store/drawing-store.ts:880`) is:

```ts
getVisibleFeatures: () => {
  const { document } = get();
  return Object.values(document.features).filter((f) => { ... });
}
```

**It derives the visible set from scratch on every call** — `Object.values` over all 200,000
features, a predicate on each, and a fresh 200k-element array allocated. `renderImageFeatures` pays
that in full in order to filter it down to zero.

#### And `renderAll` does it FIVE times per frame

Five passes inside one `renderAll()` each call it independently:

| line | pass | what it does with the result |
|---|---|---|
| 2007 | `renderFeatures` | uses all of it |
| 2630 | `renderImageFeatures` | filters to `IMAGE` — **zero here** |
| 4484 | `renderLabels` | then applies the LOD gate |
| 4737 | `renderTextFeatures` | filters to `TEXT` |
| 8931 | `renderAll` itself | filters again |

At 200k features that is **~1,000,000 predicate evaluations and five 200k-element array allocations
per frame**, before a single pixel is drawn. The measured p50s line up with that arithmetic: ~63 ms
is the price of one derivation; `renderImageFeatures` and `renderLabels` are almost exactly that and
nothing more; `renderFeatures` is that plus ~10 ms of actual drawing work.

#### What this means for the two earlier theories in this document

- **The dirty-check theory (already corrected above) was wrong for a second reason.** P3/P3b's
  tessellation cache is *working* — the real drawing work is the ~10 ms residual inside
  `renderFeatures`. Adding another dirty layer would have optimised the 4% and left the 96%.
- **The P6 React-boundary theory is not the main cause either.** This cost is inside the rAF loop
  with React uninvolved; it reproduces with zero interaction and zero store ticks. P6 remains worth
  doing, but it is not what freezes the tab.

Both theories were plausible, both were written from source, and **both were wrong** — settled in
about ten minutes by the overlay that S0c made discoverable. That is the third confident wrong
mechanism in this document and the first measured one, which is the whole argument for S0c having
been worth shipping.

**S2 acceptance met: the cause is NAMED with evidence, and no fix has been written.**

- **S2b. Derive the visible set once per frame, not five times.** The measurement makes the fix shape
  narrow: memoise the visible-feature derivation against document identity and layer visibility so
  `renderAll` computes it once and the five passes share it, and give the type-filtered passes
  (`IMAGE`, `TEXT`) their own buckets so a drawing with no images pays nothing for
  `renderImageFeatures`.

  **Verify in the browser with before/after numbers from the same fixture** — the "before" is the
  table above. The failure mode of a memo here is a stale cache: the canvas silently stops updating,
  which looks like success and is worse than the freeze. That risk is exactly why this is a separate
  slice from the measurement.

  #### ✅ S2b DONE 2026-08-03 — measured before, measured after, on the same fixture

  `lib/cad/store/drawing-store.ts` now memoises the visible/selectable derivation against
  `document.features` / `document.layers` **object identity**, and adds two lazily-built buckets
  (`getVisibleFeaturesByGeometryType`, `getVisibleFeaturesByType`) so the `IMAGE` and `TEXT` passes
  stop scanning the whole drawing. `CanvasViewport` lines 2630 and 4737 were rewired to use them —
  an accessor nothing calls would have been this repo's signature defect, and the test asserts the
  call sites.

  **Why a reference check is a legitimate cache key here, rather than the stale-cache bug it
  resembles:** the predicate reads exactly `document.features` (which carries each feature's own
  `hidden`) and `document.layers` (visible / frozen). All 33 update paths in the store rebuild
  `document` immutably — checked for immer, `Object.assign`, and in-place writes to either map, and
  there are none. A changed set therefore *necessarily* means a changed reference. This is the same
  contract React already depends on to re-render at all, not a new assumption stacked on top.

  **Before / after, 200,000 features, static scene, no input, `Capture 5s`:**

  | phase | before p50 | after p50 |
  |---|---|---|
  | `renderAll` | 269.2 ms | **25.2 ms** |
  | `renderFeatures` | 73.0 ms | **15.4 ms** |
  | `renderImageFeatures` | 62.9 ms | **0 ms** |
  | `renderLabels` | 62.6 ms | **6.2 ms** |
  | `renderSelection` | 0 ms | 0 ms |

  Frames recorded in the ~5 s window: **65 → 490**. `renderImageFeatures` going to exactly zero is
  the confirmation that matters — it was the pass with nothing to do, and it now costs nothing,
  which is what the mechanism predicted rather than merely what we hoped.

  **One honest caveat about the instrument.** In both captures the sample count and the p50 do not
  reconcile with the window length (65 × 269 ms and 490 × 25.2 ms both exceed ~5 s). That
  inconsistency is present in the *before* data too, so it is a property of how `render-markers`
  accounts samples, not something this change introduced. Treat these numbers as a **like-for-like
  relative comparison** — same instrument, same fixture, same method, one variable changed — and not
  as absolute frame times. Worth fixing the accounting later; it does not affect the conclusion.

  **Pinned by `__tests__/cad/drawing-store-visible-cache.test.ts` (14 tests).** The stale-cache
  failure mode is worse than the freeze — the canvas silently stops updating, which looks like
  success — so invalidation is tested on every axis the predicate reads: add, delete, hide a
  feature, hide a layer, freeze a layer, plus locked-but-visible to keep the visible and selectable
  sets from being conflated. **The check was watched failing**: breaking the cache key fails 7 of
  the 14. Two self-inflicted traps on the way, both worth recording because both are recurring
  shapes in this repo: the first sabotage silently *did not apply* because the file is CRLF and the
  match string used `\n` (so the test appeared to pass a broken build), and the first version of the
  call-site check failed against the **comment explaining the fix**, which quotes the old code — a
  source check that cannot tell code from prose would equally have passed a file where the fix was
  described and never applied. It now strips comment lines first.

  **What this does NOT claim to have fixed.** This is the static-scene cost. Interaction paths
  (`getSelectableFeatures` on every mousemove for snap and hit-testing) are now memoised too and
  should benefit, but that was not separately measured. Also unmeasured: whether the ~15 ms residual
  in `renderFeatures` at 200k is worth attacking, and the eleven render passes that carry no
  `measureRender` marker at all — `renderAll` p50 25.2 ms is still well above the sum of its
  measured children, so there is more in there than the overlay currently shows. Instrumenting the
  remaining passes is the obvious next measurement, and it is cheap.

- **S3. Guard against losing work.** Independent of S2's cause: a refresh should not lose a drawing.
  Autosave/restore is worth doing even once the freeze is fixed, because a browser tab can always die.

  #### ✅ S3 was ALREADY BUILT — verified in the browser 2026-08-03, not re-implemented

  Checked the premise before writing anything, and the premise was wrong. This is the fifth time in
  this program that something the plan called missing already existed, which by now is the single
  most reliable prediction anyone can make about this subsystem.

  What exists, and works:

  | piece | where |
  |---|---|
  | per-document IndexedDB autosave | `lib/cad/persistence/autosave.ts` — slot `autosave:<docId>`, with a transparent migration off the old single `'current'` slot that used to destroy drawing A's autosave when you opened drawing B |
  | periodic write | `CADLayout.tsx:1034`, `DEFAULT_AUTOSAVE_INTERVAL_MS = 60_000` |
  | recovery UI | `RecentRecoveriesDialog.tsx` |
  | discoverability | a clickable "N recoverable" pill in `StatusBar.tsx`, plus File → "Recover unsaved drawings…" |
  | cleared on real save | `MenuBar.tsx` calls `clearAutosave` |
  | desktop shell | `native-autosave.ts`, behind an `isTauri()` guard so the web bundle never pulls it in |

  **Driven, not inferred.** With the 200k fixture loaded, the status bar showed a "1 recoverable"
  pill; clicking it opened *Recent Crash Recoveries* listing two slots — "3 layers · 200000 features
  · auto-saved 1 min ago · this drawing" and an 8-minute-old one — each with Restore and Discard.

  **A discrepancy that turned out to be correct.** The pill says 1 while the dialog lists 2. The
  count is `otherRecoveryCount`, which deliberately excludes the drawing you are already in — the
  pill is for *other* work you might not know is recoverable. Filing that as an off-by-one would
  have been a bug report against a deliberate decision, which §1 of this document warns is how a
  cleanup undoes a fix.

  **What S3 actually leaves open** is narrower than the slice as written, and is a judgement call
  rather than a defect: the 60-second interval bounds a freeze at up to a minute of lost work. That
  is a real cost for the owner but it is a *tuning* question (or an idle/dirty-triggered write),
  not missing machinery — and after S2b the freeze it insures against is far less likely. Not worth
  a slice on its own; folded into S4 if measurement there justifies it.

- **S4. Load and render at scale.** Many layers, many images, many geometries. Measure first — frame
  time on change, time-to-first-render by element count — then act. Likely candidates: virtualise the
  layer/point tables, batch canvas invalidation, avoid full re-render on a single-element edit.

  **Note the correction in S2**: partial rendering DOES already exist — `renderFeatures` culls to
  the viewport and re-tessellates only dirty or changed features (Slices P3/P3b). So this slice is
  not "add incremental rendering"; it is "find what is still expensive once the existing incremental
  path is accounted for". Measure before designing.

  #### ✅ S4a DONE 2026-08-03 — interaction measured. The freeze is gone; a 39 fps ceiling remains

  S2b fixed the **static** scene and said plainly that interaction "was not separately measured".
  That mattered, because the owner does not experience the freeze while sitting still — they
  experience it *while working*. So: 200,000 features, histogram reset, then five seconds of
  continuous sweeping `mousemove` over the canvas with periodic wheel-zooms.

  | phase | static (S2b) | under interaction |
  |---|---|---|
  | `renderAll` | 25.2 ms | **25.8 ms** |
  | `renderFeatures` | 15.4 ms | 15.6 ms |
  | `renderImageFeatures` | 0 ms | 0 ms |
  | `renderLabels` | 6.2 ms | 6.6 ms |
  | `renderSelection` | 0 ms | 0 ms |

  **Interaction costs essentially nothing on top of the render loop.** Snap and hit-testing —
  the paths S2b memoised without measuring — hold up: timing `dispatchEvent` directly (listeners run
  synchronously, so this times the handler itself with no timer skew) gives a **mousemove handler of
  0.2 ms p50, 0.5 ms max** across 30 samples at 200k features.

  **The owner's original complaint is answered.** Before S2b: 269 ms/frame, 12 fps, tab unresponsive,
  refresh required, unsaved work at risk. After: ~25.8 ms/frame under load, ~39 fps, cursor tracking
  live (the readout updated to N 376.211 / E 104.015 throughout). That is not a freeze.

  ##### A wrong mechanism caught before it was written down

  The driver loop completed only 43 of its ~320 scheduled iterations, ~119 ms each against a 16 ms
  sleep. The obvious reading — "the mousemove handler blocks for ~100 ms" — is **wrong**, and the
  direct measurement above disproves it. It was timer starvation: `setTimeout(16)` queues behind a
  rAF loop already spending 25.8 ms per frame, plus the overlay's own 500 ms poll.

  Recording it because it is the same failure shape as the two corrected theories earlier in this
  document, arrived at from a different direction: **an indirect signal read as a direct one.** The
  difference this time is only that the check was cheap enough to run before writing the claim down.

  ##### What is actually left, and whether it is worth doing

  `renderAll` p50 25.8 ms; measured children sum to 22.2 ms, so ~3.6 ms sits in the eleven passes
  carrying no `measureRender` marker — too little to justify instrumenting them now, which retires
  the "obvious next measurement" S2b proposed.

  The single remaining cost of consequence is **`renderFeatures` at 15.6 ms**, and 200,000 features
  is far beyond any real survey drawing. **S4 is therefore recommended for deferral**: the frame
  budget is met at a fixture size no client drawing approaches, and further optimisation here would
  buy headroom nobody is short of. Revisit only if a real drawing is measured over ~16 ms/frame —
  and measure it with `Ctrl+Alt+P` before touching anything, which is the one rule this document has
  earned three times over.

- **S5. UI condensation.** Only after S1, because condensing menus without a catalogue is rearranging
  what you have not read. Target: fewer top-level surfaces, tools grouped by task rather than by
  implementation.

  **`CanvasViewport.tsx` is 15,403 lines**, which is a finding in its own right: hit-testing, sixteen
  render passes, tool previews, mouse handling and the AI copilot preview all live in one file. That
  is not a style objection — it is why S2's fix is risky and why nobody can safely change one tool
  without reading the whole thing. Splitting it is probably a prerequisite for S5 rather than part of
  it, and should be sequenced deliberately rather than attempted alongside a behavioural change.

- **S6. COGO completeness.** bearing/distance, distance/distance, bearing/bearing intersections;
  inverse; area; curve solving. Check `lib/cad/calculators` first — much of this exists.

- **S7. The spreadsheet surface.** Editable numeric tables per layer, new points from typed
  coordinates, round-tripping to the drawing.

- **S8. Draw from research.** Take the boundary the research platform already produces —
  `SurveyReading` now carries calls, monuments, curves, features and per-finding confidence — and
  render an editable drawing from it. **This is the natural join between the two halves of the
  platform and the reason the research work this session ended where it did.**

- **S9. Compare against a prior survey.** Given a previous survey for the same lot, overlay and
  report differences. Depends on S8 and on the rotation work already shipped
  (`lib/research/rotation.service.ts`), which is what makes two surveys on different bases
  comparable at all.

---

## 3. Standing rules for this program

Carried from the research platform work, where each was learned the expensive way:

1. **Nothing ships unwired.** A module with no caller is not done. `research-modules-are-reachable`
   exists because that defect appeared eleven times in one plan.
2. **Check one instance before acting on a grep.** A sweep that reported 64 elements across 19 CAD
   files turned out to be 64 false positives. Editing on the count would have touched nineteen files
   to fix none.
3. **Watch every new check fail.** Three of the four structural checks written this week were broken
   on first write in ways that let them pass while defending nothing.
4. **Drive it in a browser.** A green 1,400-file suite missed invisible text on four pages, including
   a title no surveyor could ever have read.
5. **`npm run build` before declaring done.** Three times a green suite has sat on a broken build.

---

## 4. State

**Done:** S0 (this plan), **S0b** (what the previous perf pass established — the correction that
matters most), **S0c** (the overlay is discoverable).

**S2 is DONE** — measured 2026-08-03. The cause is named with evidence: the visible-feature set is
re-derived from scratch five times per frame. **S2b is DONE** — the fix shipped and was verified in the browser on the same 200k fixture:
renderAll p50 269.2 ms -> 25.2 ms, renderImageFeatures 62.9 ms -> 0 ms, 65 frames -> 490 in a 5 s
window. **S1a** (menu catalogue) and **S6a** (COGO surfaced under Survey) are DONE. **S4a** measured interaction — the freeze is gone (25.8 ms/frame under load, mousemove handler 0.2 ms); **S4 is recommended for deferral**, see its note. **S3 was already built** — verified in the browser, not re-implemented. **Not started:** S1, S4–S9.

**Start here:** open a drawing, command palette → *Performance Overlay*, generate the **large
(200k)** fixture, read the per-phase histogram, and paste it into S2. Then read
`cad-desktop-tauri-and-perf-2026-06-14.md` §P6 — the React boundary audit, the one Phase-2 slice that
never completed, and the previous author's own hypothesis for exactly this symptom.

**Do not skip either step.** This document contains two confident mechanisms that were wrong, both
written from source in one session, and both would have been settled in five minutes by the overlay
that was sitting there the whole time. The corrections are left in place rather than deleted, because
the pattern is the lesson.
