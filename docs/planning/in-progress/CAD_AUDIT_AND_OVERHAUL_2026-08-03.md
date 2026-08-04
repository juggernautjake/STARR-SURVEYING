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
  | P1 spatial index for feature bounds | BUILT, never wired — see the 2026-08-04 addendum in that doc. `lib/cad/spatial/feature-index.ts` has no importer; the renderer uses `geometry/spatial-index.ts` via `geometry/lod.ts` |
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

  #### ✅ S6 CLOSED 2026-08-03 — every item already existed; S6a was the only work it needed

  S6 asked for "bearing/distance, distance/distance, bearing/bearing intersections; inverse; area;
  curve solving". Checked each against the code **and against a UI caller**, because in this repo the
  interesting question is never whether the maths exists — it is whether anything reaches it.

  | S6 item | implementation | reached from |
  |---|---|---|
  | dist–dist, brg–dist, brg–brg, 4th corner, parallel | `geometry/cogo.ts`, `geometry/solver.ts` | `CalcPointDialog` — now in **Survey** as well as AI (S6a) |
  | inverse | `INVERSE` tool | Survey → *Inverse (Bearing & Distance)* `INV`; also `CommandBar` |
  | area | `geometry/area.ts` (`computeArea`, `computeAreaFromPoints2D`, `computeFeatureArea`) + `area-measurement.ts` | `CanvasViewport`, `featureTooltip`, `HiddenItemsPanel` |
  | curve solving | `geometry/curve.ts` (`computeCurve`, `circleThrough3Points`, `crossValidateCurve`), `compound-curve.ts`, `curve-fit.ts` | `CurveCalculator` / `CurveCalculatorBody`, Survey → *Curve Calculator…* `CC` |
  | closure + adjustment (bonus) | `geometry/closure.ts` — `computeClosure`, `bowditchAdjustment`, `transitAdjustment`, `vertexClosure` | `CloseDrawingDialog`, now in Survey too (S6a) |

  `crossValidateCurve` is worth naming: the curve solver checks its own answer against an independent
  derivation. That is more than the slice asked for.

  **So the entire slice was one menu entry.** The COGO the owner asked for was written, tested and
  wired — and filed under AI, where a surveyor would not look. Nothing needed building; something
  needed *finding*. This is the sixth item this program has called missing and found present, and the
  cost of not checking would have been rebuilding a validated curve solver.

- **S7. The spreadsheet surface.** Editable numeric tables per layer, new points from typed
  coordinates, round-tripping to the drawing.

  #### ✅ S7a DONE 2026-08-03 — typed coordinates now land where they were typed (a real bug, found in passing)

  S7 asks for "editable numeric tables per layer, new points from typed coordinates, round-tripping
  to the drawing". Checking the premise first, as usual: **most of it already exists.**
  `PointDataViewer.tsx` (788 lines) is an editable table that filters by layer and writes back
  through `updateFeature`, and `PointTablePanel.tsx` sits beside it. What is missing is a create
  path — and looking for that turned up something worse.

  ### ▶ The defect: coordinate entry ignored the app's own display convention

  `formatCoordinates` does two things to a world point before showing it:

  1. **adds the origin offset** — `displayed northing = worldY + originNorthing`, and the origin is
     set *automatically whenever survey data with real-world coordinates is imported*;
  2. **orders and labels the pair by `coordMode`** — **N then E by default**, not X then Y.

  **Nothing undid either.** The command bar took a typed `a,b` straight into `{ x: a, y: b }` world
  feet. So on any drawing with a real-world origin, a surveyor could read a northing off the status
  bar, type it back, and get a point that is **not where they typed it** — displaced by the origin,
  and with the axes swapped if they typed in the order the app was showing them.

  Both failures are silent. The drawing looks fine, the number looks accepted, and the point is in
  the wrong place. And it stays invisible on a scratch drawing, because the origin is 0 there — **it
  only bites once a survey import sets a real-world origin, which is exactly when the coordinates
  matter.** A Texas state-plane northing is around ten million feet; the error is not subtle when it
  finally appears.

  `coordinatesFromDisplay` in `lib/cad/geometry/units.ts` is the missing inverse, sitting beside the
  formatter it mirrors so the pair cannot drift. Note the order of operations: display unit → feet
  **then** remove the origin. Reversed, it subtracts feet from a value still in metres, which is the
  obvious way to get this subtly wrong and is pinned by a test.

  **The round-trip test is the one that matters** — format a world point, read the two displayed
  numbers back, and require the same point. It runs against a real state-plane origin, in both
  coordinate modes, and in metres.

  ### ⚠ This is a deliberate behaviour change, and the owner should know

  In **NE mode (the default)** the command bar now reads the first value as the **northing**. Anyone
  who had learned to type `x,y` there will find the axes swapped from what they are used to. The
  change is still right — the app displays `N: … E: …` and input should match what it displays — but
  it is a change to shipped behaviour rather than a pure fix, so it is called out rather than buried.
  `@dx,dy` relative entries are deliberately untouched: a displacement has no origin to remove.

  9 tests. **S7b — the create path** (add a point by typing coordinates into the table) is what S7
  originally asked for and still needs doing; it now has a correct conversion to build on.

- **S8. Draw from research.** Take the boundary the research platform already produces —
  `SurveyReading` now carries calls, monuments, curves, features and per-finding confidence — and
  render an editable drawing from it. **This is the natural join between the two halves of the
  platform and the reason the research work this session ended where it did.**

  #### ✅ S8a DONE 2026-08-03 — the reading becomes geometry (the pure half)

  `lib/cad/import/from-survey-reading.ts`. The research worker walks a deed's calls and produces a
  coordinate per corner, the monuments it found, the watercourses/roads/easements the sheet also
  shows, and a confidence per finding. **Nothing in CAD could consume any of it** — a surveyor
  re-typed calls by hand into a drawing the research side had already computed.

  **Structurally typed, importing nothing from `worker/`.** The two projects have separate tsconfigs
  and separate builds, and a cross-project type import is how the production build breaks while every
  test stays green — which has happened here three times (`resolve.extensionAlias`). The input is
  declared as the shape it needs; the worker's real `SurveyReading` satisfies it structurally and
  neither build learns about the other. A test asserts no `worker/` import.

  **The honesty rules ARE the design, because a drawing is the easiest place in this product to
  render an unknown as an answer.** A closed polygon looks authoritative regardless of what built it.

  | rule | why |
  |---|---|
  | **An incomplete traverse stays an open POLYLINE** | A boundary drawn from 8 of 10 calls is not a boundary with two gaps — it is a different shape that looks finished. Only a traverse with zero unusable calls closes into a POLYGON. |
  | **Every unusable call is named with its reason** | `TraverseResult.unusable` exists because the worker refuses to skip a call quietly; the drawing must not undo that. |
  | **Coordinates are relative and say so on each feature** | The worker starts at (0,0) and is explicit that state-plane position needs a measured tie. Lost in translation, a record sketch becomes a located survey. |
  | **Confidence rides along** | A low-confidence call is still a low-confidence line after it becomes geometry. |
  | **FOUND vs SET is preserved** | A found monument controls the corner; a set one is an opinion. |
  | **Water / roads / easements are reported, never drawn** | The reading records *that* a 30 ft easement exists, not where it runs. Drawing it somewhere is invention — the difference between "we know there is an easement" and "here is the easement", and only the first is true. |
  | **`notDrawn` is required, not optional** | A caller that ignores it presents an incomplete figure as a complete one. |

  A non-traversable description (lot-and-block, reference-only) returns no features **and says why** —
  an empty result with no explanation reads as "we found nothing".

  16 tests. **What is NOT done:** wiring this into the CAD UI — an import action, a layer choice, and
  a panel showing `notDrawn` before anything lands on the canvas. That is **S8b**, and it needs a
  browser, which this session could not keep connected. Shipping the pure half alone is the risk this
  repo names most often, so S8b should be next in CAD rather than later.

  #### ✅ S8b DONE 2026-08-03 — and it is reachable, which was the whole risk

  S8a built the adapter and nothing called it. **File → Import → "📐 Import Research Reading (boundary
  from a deed)…"** now does. Listed among the other imports because that is where a surveyor looks
  for *bring something in* — not under a research-specific menu they would have to know exists.

  **Three decisions that differ from the other importers, each deliberate:**

  1. **It ADDS; it does not replace.** `importFromDxf` / `importFromGeoJSON` call `loadDocument`,
     which throws the current drawing away. Correct for "open a DXF", **catastrophic here**: a deed
     boundary is brought *into* a drawing already in progress, and replacing would silently destroy
     the surveyor's work. Pinned by a test that fails if `loadDocument` appears on this path.
  2. **Omissions are confirmed BEFORE anything lands.** The other importers log warnings to the
     console. Here the omissions *are* the safety property — S8a's design is that a drawing must
     never present an incomplete figure as complete — so putting them where only a developer looks
     would defeat it. The dialog names every undrawn item, says the boundary is left **OPEN** when a
     call could not be used, and states that coordinates are **not tied to the state plane**.
     Watched failing: moving `addFeatures` above the confirm fails the ordering test.
  3. **A wrong file is refused by name.** Parsing arbitrary JSON and producing an empty drawing would
     read as *"this deed had no boundary"* rather than *"you picked the wrong file"*. The check is
     for the **presence** of `traverse`, not its truthiness — `traverse: null` is the legitimate
     shape for a lot-and-block description, and a truthiness check would reject exactly the documents
     that need the explanation.

  9 tests, plus the 16 from S8a.

  ### ⚠ What is NOT verified: the visual pass

  Source tests prove the wiring, not the rendering. Nobody has opened this menu, picked a file, and
  read the dialog — the dev server and Playwright would not stay connected for the second half of
  this session (Playwright refused local connections that Node's `fetch` completed, across four
  ports). **This repo's standing rule is that UI slices are driven in a browser before being ticked,
  and that did not happen here.** Recorded rather than glossed, because the failure this rule exists
  to catch — a green suite missing a rendering bug — is exactly the one that would survive.

  **First thing to do with a working browser:** open `/admin/cad`, File → Import → Import Research
  Reading, feed it a reading with at least one `unusable` call, and confirm the dialog lists it and
  the boundary comes in **open**.

- **S9. Compare against a prior survey.** Given a previous survey for the same lot, overlay and
  report differences. Depends on S8 and on the rotation work already shipped
  (`lib/research/rotation.service.ts`), which is what makes two surveys on different bases
  comparable at all.

---

  #### ✅ S9a DONE 2026-08-03 — the comparison core (`lib/cad/compare/survey-compare.ts`)

  **The one idea this exists for.** Two surveys of the same land, written forty years apart, will
  disagree about **every single bearing** and usually agree perfectly. They are on different bases of
  bearings — magnetic north in 1952, grid north in 1998, a called line from an adjoining deed. A
  naive diff reports *"18 discrepancies"* and sends a surveyor out to chase eighteen problems that do
  not exist.

  So the comparison estimates the constant rotation **first**, reports it as a **basis difference
  rather than an error**, and only then reports the residuals. What is left is the real disagreement.
  Same insight `rotation.service.ts` is built on — a rotation is a change of frame, not a discrepancy
  — applied between two records instead of between a record and a field tie. That is what the slice
  meant by depending on the rotation work.

  **The median is load-bearing, not a refinement.** The offset is the median of the per-call deltas,
  never the mean. A test proves why: with one course out by 10° (a transposed digit), a mean offset
  of 2.5° flags **all four** courses and buries the real error among three false ones; the median
  gives 0° and flags **exactly the bad one**. Mean-vs-median here is the difference between a useful
  report and a misleading one.

  **A reversed traverse is detected, not computed through.** One deed written clockwise and the other
  counter-clockwise gives deltas clustered near ±180°, and averaging those produces nonsense. It is
  reported in words instead: *"the two records appear to run in OPPOSITE directions."*

  **What it refuses to do**, each pinned by a test:

  | refusal | why |
  |---|---|
  | A missing bearing is never read as 0 | It would invent a due-north call and poison the median every other residual depends on |
  | Differing call counts are named, never truncated | Usually one record splits a line the other runs through — exactly what a surveyor needs told |
  | `median([])` returns `null`, not `0` | `0` means "same basis"; conflating it with "no data" would report agreement between records sharing no comparable course |
  | Angle deltas are wrapped into (−180, 180] | Otherwise 359° vs 1° reads as a 358° disagreement |

  Tolerances are configurable (default 1′ of bearing, 0.1 ft of distance), because a 1952 deed is not
  a 2020 survey and holding both to the same standard flags the older one for being old.

  16 tests.

  #### ✅ S9b DONE 2026-08-03 — reachable from the Survey menu (wiring tested; VISUAL pass not done)

  **Survey → "Compare with a prior survey…"** takes two research readings and reports the
  difference, leading with the basis statement. A test asserts that ordering: burying the basis
  under a list of differences would present a change of frame as eighteen errors, which is the
  exact failure S9a exists to prevent.

  **Two files rather than "current drawing vs a file"**, deliberately. Extracting courses back out
  of arbitrary drawn geometry means guessing which features are the boundary and in what order, and
  a comparison built on a guess is worse than none — it reports differences that are artefacts of
  the guess.

  `callsFromPoints` derives courses from corner coordinates rather than a `legs` array, because
  points are the one field every reading has and the field the S8a adapter already relies on, so it
  cannot drift from what was drawn. It uses `atan2(dx, dy)` — the surveying convention, clockwise
  from north. The mathematical `atan2(dy, dx)` mirrors every bearing about the 45° line, which looks
  plausible on a square and is wrong on everything else; a test pins north/east/south explicitly.
  A zero-length course gets a **null** bearing, never 0°, because 0° is due north — a real answer.

  19 tests on the core, 14 on the wiring.

  ### ⚠ The browser could not be used, and the reason is now diagnosed

  Playwright loads **example.com** fine and is refused on **127.0.0.1 and localhost**, on four
  ports, while Node's `fetch` to the same URL on the same machine returns 200. It worked earlier in
  this same session, so something changed mid-run — it is browser-side network isolation, not a
  dead port or a dead server, and no amount of restarting servers fixes it. Recorded so the next
  session does not spend the time this one did rediscovering it.

  **So S8b and S9b both have tested wiring and no visual confirmation.** That is two UI slices
  against this repo's standing rule. First thing to do with a working browser, in order: import a
  reading with an unusable call (expect the dialog to list it and the boundary to come in OPEN),
  then compare two readings on different bases (expect a basis statement, not a list of errors).

  #### ✅ S8c DONE 2026-08-04 — the visual pass ran, and the import was drawing NOTHING

  The browser worked on the next session's first attempt, so the isolation above was transient.
  What it found justifies the standing rule on its own.

  **The import added three features to a drawing that could not show any of them.** The dialog said
  *"3 feature(s) will be added"*, they were added, the log line said so — and the canvas stayed
  empty, with no `RESEARCH_*` layer anywhere in the layer panel.

  `addFeatures` does not create layers, and `getVisibleFeatures` drops any feature whose `layerId`
  is not in `document.layers`:

  ```ts
  const layer = document.layers[f.layerId];
  if (!layer) return false;      // drawing-store.ts:955-956
  ```

  So the one adapter in this codebase whose entire stated design rule is *"unusable calls are
  reported, never silently dropped"* silently dropped **everything it imported**. The other
  importers never hit this because they call `loadDocument`, which brings layers along with the
  document; S8b deliberately ADDs instead of replacing — correctly — and adding is the path where
  the layers have to be created explicitly.

  **No test could have caught it, and that is the point worth keeping.** Both halves were correct
  in isolation: the features were well-formed and the store behaved exactly as documented. Only the
  *composition* was wrong, and neither module's tests can see a composition. This is a fourth
  failure state to sit beside the three in the handoff — not *stale*, not *unreachable*, not
  *unmerged*, but **wired to something that cannot use it**.

  **The fix makes the requirement a returned value rather than an assumption.**
  `DrawFromReadingResult.requiredLayers` names the layers the emitted features reference, derived
  from what was actually emitted — so a reading whose monuments were all unplaceable leaves no empty
  "Research Monuments" layer implying we looked and found none. `researchLayersToCreate` turns those
  into layers, skipping any that exist, because a surveyor who restyled the layer and re-imports the
  same deed must not have that silently undone. A test pins the set relation *every emitted
  feature's layer is declared*, so it keeps holding when a future reading emits a third kind.

  Ordering is asserted too — layers before features. It is not cosmetic: features added first are
  invisible until something unrelated re-renders, which is worse than never drawing them because it
  is intermittent. **That assertion was watched failing** (rule 3): reversed the two statements, saw
  it go red, restored it. The first attempt to watch it fail was itself a dud — a string replace
  that silently matched nothing and "passed" — which is the same lesson one level up.

  Also fixed here: the import now dispatches `cad:zoomExtents` afterwards. The reading's coordinates
  are relative to a point of beginning at (0,0), which is essentially never where the current view
  is looking, so a correct import could still land off-screen and be indistinguishable from a failed
  one.

  **Verified in the browser, not inferred:** both layers present in the panel, boundary drawn, and
  the figure visibly OPEN with the gap at the unusable call — with the same fixture that produced
  the empty canvas.

  ### S9c — what still remains

  Overlaying the two figures on the canvas, rather than reporting the difference in a dialog. That
  is genuinely visual work and should not be attempted without a browser.


  The UI: pick a prior survey, run the comparison, and show the report beside the drawing — plus
  overlaying the two figures on the canvas. Both need a browser, which this session could not keep
  connected. **The pure half is deliberately shipped alone here rather than not at all**, but the
  same caveat as S8b applies: a core with no caller is this repo's most frequent defect, so S9b
  should be picked up promptly rather than left.

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
window. **S1a** (menu catalogue) and **S6a** (COGO surfaced under Survey) are DONE. **S6 is CLOSED** (every item already existed and is UI-reachable; S6a was all it needed). **S4a** measured interaction — the freeze is gone (25.8 ms/frame under load, mousemove handler 0.2 ms); **S4 is recommended for deferral**, see its note. **S3 was already built** — verified in the browser, not re-implemented. **S8 is DONE** — S8a the adapter, S8b the menu import that calls it (wiring tested; the VISUAL pass is still outstanding and needs a browser). **S9 is DONE** — S9a the core, S9b the Survey-menu entry (visual pass outstanding); S9c (canvas overlay) remains. **S7a is DONE** (coordinate-entry defect fixed). **Not started:** S1b+, S4 (recommended for deferral), S5, S7b (create-a-point UI), S9c (canvas overlay).

**Start here:** open a drawing, command palette → *Performance Overlay*, generate the **large
(200k)** fixture, read the per-phase histogram, and paste it into S2. Then read
`cad-desktop-tauri-and-perf-2026-06-14.md` §P6 — the React boundary audit, the one Phase-2 slice that
never completed, and the previous author's own hypothesis for exactly this symptom.

**Do not skip either step.** This document contains two confident mechanisms that were wrong, both
written from source in one session, and both would have been settled in five minutes by the overlay
that was sitting there the whole time. The corrections are left in place rather than deleted, because
the pattern is the lesson.

---

## S8d — the import landed on the grey, not on the sheet. **DONE 2026-08-04.**

S8c made the imported boundary visible. Driving it once more showed the next problem, and it is the
kind only a browser finds: the tract was drawn **entirely off the white page**.

A reading's coordinates are relative to a point of beginning at `(0,0)`, and a traverse running south
of the POB has **negative northings** — while the paper occupies `y ∈ [0, height]`. So a correctly
imported, correctly closed tract sat on the grey surround. It looked drawn, and it would have
**plotted blank**.

**The fix is about which thing moves.** `cad:fitDrawingToPage` picks a standard engineering plot
scale and repositions the **paper** over the data, leaving every coordinate, distance and bearing
untouched — it even prints *"Fit to page at 1"=40'. Coordinates unchanged."* Moving the geometry onto
the sheet instead would have falsified the survey to make the picture tidy, which is the one thing a
survey drawing may never do.

**Only when the drawing was empty.** Re-fitting the sheet under a surveyor with work in progress
silently changes their plot scale and page position; that is their decision, not an import's. A
non-empty drawing just gets `cad:zoomExtents`, and `View → Fit Drawing to Page` is there when they
want it. `wasEmpty` is read **before** `addFeatures` — reading it afterwards always says non-empty,
so the sheet would never be fitted, and a silent no-op looks exactly like working code. That ordering
is asserted.

**Verified in the browser:** tract on the sheet, north arrow, graphic scale, certification block,
survey-notes block and title block all framed at 1"=40'.

---

## S11 — the survey-info blocks lay out in paper space, not screen space. **DONE 2026-08-04.**

Two defects the owner reported as *"the text gets out of whack depending on the level of zoom"* and
*"text does weird stuff when the zoom changes and goes way out"*. Both were reproduced in the browser
before anything was changed, and they turned out to be unrelated causes with one shared theme.

### ▶ 1. Wrapping broke words, not lines

The standard-notes block wrapped by slicing every N characters:

```ts
for (let s = 0; s < text.length; s += charsPerLine) lines.push(text.slice(s, s + charsPerLine));
```

which put **"Texas State Plan / e Coordinate System"**, "as note / d on the plat", "shown on this p /
lat" and "Profess / ional Surveyors" on a plat. Not cosmetic: those notes carry the basis of bearing
and the monument description, and a hyphenless mid-word break is the kind of thing that gets a plat
sent back. Now `wrapTextToWidth` in `lib/cad/render/text-layout.ts`, shared with the certification
block, which had its own second copy of the rule; the shared one adds a hard-break fallback so a
long licence string or URL stops running past the block's edge.

### ▶ 2. A legibility floor that outlived its box

Every label was sized `Math.max(boxHeight * k, N)` with **N in screen pixels** — `hFontSz`, `lblSz`,
`valSz`, `sLblSz`, `dateLblSz`, `authFontSz`, `gsLblSz`, `lblBelowSz`, and the north arrow's `N`.
The intent is right and the scope was wrong: the floor never stopped applying, so as the sheet shrank
with zoom the boxes kept shrinking and the lettering did not. **At 8% zoom the paper was a thumbnail
with "SURVEY FIRM", "GRAPHIC SCALE", "Untitled Drawing" and the north arrow's "N" drawn at full size
on top of one another, spilling well outside the paper.**

The rule that replaces it: **text on the sheet is always proportional to the sheet.** Sizes are now
what the element's own geometry implies, with no floor, and `sheetTextSize` suppresses text below
4.5 px instead of flooring it. Lettering that has stopped scaling is telling the reader it is
somewhere it is not; drawing nothing is the honest answer, and it is cheaper — each `PIXI.Text`
allocates its own canvas texture, and a thumbnail sheet does not need forty of them.

**Gated at the factory, not the call sites.** All four title-block text helpers funnel through
`mkTBTextIn`, and the legend/notes/certification blocks through `mkText`, so the gate lives in those
two functions and a label added later cannot forget it. The one path that builds a `PIXI.Text`
directly — the north arrow's legacy fallback — gates itself, with a comment saying why.

**The scale bar needed the same fix one level up.** `barH`, `lblAboveH` and `lblBelowH` had pixel
floors on the *geometry*, so the bar's box stopped shrinking too and overlapped the sheet. Found
only because the first fix left "GRAPHIC SCALE" still visible on the thumbnail — the second look is
what caught it.

**Verified in the browser at 8% / 30% / 135%:** clean thumbnail with no lettering outside the sheet
at 8%, and at 135% the notes read "Texas State **Plane**", "as **noted** on the plat", "on this
**plat**" — words intact.

---

## S12 — the editor may break, but it must not take the drawing with it. **DONE 2026-08-04.**

Owner's ask: *"make sure the CAD software doesn't freeze or get bugged out or shut down without
emergency saving."*

### ▶ First, a theory that was wrong — recorded because it was persuasive

The obvious mechanism for "it freezes and we have to refresh" is a render loop that throws and never
reschedules: one bad frame and the canvas is dead while the page stays alive. **That is not what
this code does.** `renderLoop` wraps `renderAll()` in try/catch, logs the frame, and calls
`requestAnimationFrame` unconditionally afterwards. A throwing frame is skipped, not fatal. Checked
before writing it down, per this document's own history of confident wrong mechanisms.

### ▶ Second, most of the protection already existed

`"it does not exist" is usually wrong` held again. Already present: recovery snapshots debounced
1.5 s after activity with a **15 s max-wait ceiling** so a non-stop drag spree cannot outrun them;
flushes on `visibilitychange → hidden` and `pagehide`, covering tab close, navigation, reload and OS
shutdown; a `beforeunload` guard; and WebGL `contextlost` handling that calls `preventDefault()` to
request restoration. Between them, the *exit* paths are well covered.

### ▶ What was actually missing: the paths where the editor breaks while the page stays open

| path | before |
|---|---|
| Uncaught React render error | `CADErrorBoundary` logged it. **It did not save** — while telling the user *"your most recent auto-save (if any) will be offered for recovery when you reload"* |
| Unhandled promise rejection | never reaches a React error boundary at all — no save, no UI |
| Error thrown from an event handler / `setTimeout` / rAF | same |
| WebGL context lost | restoration attempted; if it fails the drawing is stranded |

**The error-boundary case is the sharp one.** A render crash is very often caused by *the edit just
made* — which is exactly the edit still sitting inside the 1.5 s debounce window. The panel's
reassurance was a claim about a write nobody had made.

`lib/cad/persistence/emergency-save.ts` is one entry point callable from all four, because none of
them can reach the CADLayout closure that owns the routine autosave: a class error boundary, two
bare `window` listeners and a canvas event handler. It reads the store via `getState()`.

**Two deliberate differences from the routine autosave**, both load-bearing:

- **It ignores `autoSaveEnabled`.** That setting means "don't write every few seconds while I work",
  not "discard my drawing when the program crashes". A recovery snapshot only ever *offers* itself
  on reload; it never overwrites a file.
- **It never throws.** Every caller is already on a failure path. A throw from here converts a
  recoverable crash into an unrecoverable one, so failures are logged and returned, not raised.

**And the panel now states what happened instead of promising.** Three outcomes, each with the right
advice: *your work was saved*, *nothing was unsaved*, or — the one that matters — **the recovery copy
could not be written, do not reload yet, try to continue and save manually.** Telling someone their
work is safe when it is not is worse than saying nothing, and that is what the old copy did whenever
the write would have failed.

The global `error` handler skips `ResizeObserver loop` notifications, which every Chromium browser
reports as an uncaught error and which mean nothing — saving on those would write a snapshot on
every panel resize. Neither global handler swallows the event: it still reaches the console, so the
failure stays diagnosable. This only makes sure the drawing survives it.

8 tests, `npm run build` clean.

---

## Owner asks added 2026-08-04 — slices S13–S15

Recorded verbatim in intent so a later session does not re-scope them.

- **S13. The tool palette: catalogue, mechanics, and discoverability.**
  *Ask:* "think through all of the tools that we have and consider the best way to implement them
  and the best way to reveal the tool menu so that things make sense and are well explained and easy
  to use. Please make sure the actual mechanics of the tools with the mouse controls work well."

  **S13a — the inventory.** `ToolBar.tsx` carries **51 distinct tools in 18 palette groups**, each
  already with a `label`, a `description` written as an instruction ("Click start point, then end
  point…") and mostly a keyboard shortcut. So the *explanation* layer largely exists; what has never
  been verified is whether each tool's mouse interaction actually produces geometry.

  **S13b — mechanics, driven.** For each drawing tool: activate it, perform the documented mouse
  interaction on the canvas, and assert a feature of the right type appeared. This is the slice that
  finds bugs; every browser pass this program has run has found at least one.

  **S13c — discoverability.** Only after S13b, because reorganising a palette whose tools you have
  not exercised is rearranging what you have not read. Blocked-adjacent to S5.

- **S14. Reconcile several records into one initial drawing.**
  *Ask:* "gather the distances and bearings/azimuths and points of interest from the survey drawings
  or calls and deeds and any document that we can find that has them and compare them to make sure
  they are in agreement and then we can use that to make our initial drawing."

  S9 already compares **two** readings and *reports* the difference, leading with the basis rotation
  so a change of frame is not reported as eighteen errors. S14 is the step past that: take **N**
  sources, agree them call-by-call, and emit the reconciled figure as the starting drawing — with
  every call carrying which sources agreed and which disagreed. The honesty rule from S8a governs:
  a call the sources disagree on must not be silently averaged into a confident line.

- **S15. Memory and load-time audit.**
  *Ask:* "make sure that loading and rendering times are fast and that we don't have memory leaks."
  S2b fixed the frame cost (269 → 25 ms). Not yet measured: heap growth over a long editing session,
  listener/texture accumulation, and the CAD bundle's load time. The perf overlay measures frames,
  not leaks — this needs a different instrument.

---

### ✅ S13a/S13b DONE 2026-08-04 — and they found the worst bug in the program

**S13a, the inventory.** `ToolBar.tsx` carries **51 distinct tools across 18 palette groups**. Every
one already has a `label`, an instruction-shaped `description` ("Click start point, then end point to
draw a solid line segment"), and mostly a keyboard shortcut. The *explanation* layer the owner asked
for largely exists — so S13c is about arrangement, not about writing text.

**S13b, the mechanics — and the finding.**

> **On a freshly opened `/admin/cad`, nothing you draw appears.**

The line tool showed a correct live readout — `Len: 324.937 ft · Bearing: S 74°30'07" E · ΔN 86.824
S ΔE 313.122 E` — which is what makes it so bad: the tool looks like it is working. Then no line.
Three attempts, empty canvas. **Select All reported "3 SELECTED — Editing 3 lines together."**

The features were being created, stored and selected, and never rendered.

`createFeature` stamps `layerId: activeLayerId`, and the store's **initial state** hardcoded
`activeLayerId: ''`, so every feature landed on a layer that does not exist —
and `getVisibleFeatures` drops exactly those (`if (!layer) return false`), the same predicate behind
S8c.

**The part worth keeping is that this bug was already known and already fixed — in the wrong
places.** `newDocument()` carries a comment from `cad-domain-audit` Slice D:

> *"newDocument used to leave the active layer as the empty string, so the very first geometry the
> surveyor placed landed on `layerId: ''` and was orphaned."*

That fix went into `newDocument` and `loadDocument`. It did not go into the **initial state** — the
path that runs when you just open the editor, which is the most common entry point in the whole
program. A fix applied to the derived paths and not to the default one is a distinct failure shape
from the four already catalogued here, and it survived because every test that exercised the store
called `newDocument()` first, i.e. tested its way *around* the broken path.

Also fixed: the hidden-layer and locked-layer guards in the draw handler are both written
`if (activeLayer && …)`, so an empty or dangling `activeLayerId` slipped past both. There is now a
`!activeLayer` branch — it adopts the first layer and says so, or refuses when the drawing genuinely
has no layers. Second line of defence only; the store seeding is the fix.

4 regression tests, including the one that matters: a feature stamped with the active layer survives
`getVisibleFeatures`, **and** a feature on a non-existent layer does not — without the second half,
the test would still pass if the renderer simply stopped filtering. The seeding assertion was watched
failing.

**Verified in the browser:** fresh load shows `Layer: Survey Info` instead of `Layer: —`, and a line
and a point both draw.

#### ▶ S13 correction, same day — the first fix was wrong, and the owner caught it

The fix above seeded `activeLayerId` to `layerOrder[0]`, mirroring `newDocument()`. **`layerOrder[0]`
is `SURVEY-INFO`** — the layer carrying the title block, seal, graphic scale, north arrow, notes and
certification, which exists precisely so that furniture can be toggled as one unit. Seeding it would
have quietly made the reserved layer the default target for every line a surveyor draws.

Two corrections from the owner, both now implemented:

1. *"We should not be able to add points and lines and stuff to the survey info layer. That layer is
   just reserved for placing different information blocks."*
2. *"We should have to create a 1st layer to start drawing."*

So the rule is **not** "always have an active layer". It is **never create geometry the surveyor
cannot see, and never choose the layer for them.** A new drawing starts with no active layer on
purpose; the draw handler refuses and names the next action:

> `No drawing layer is active. Pick one in the Layers panel — or use "New Layer" — then draw. Nothing was added.`
>
> `"Survey Info" is reserved for the title block and information panels — you can't draw on it. Pick or create a drawing layer in the Layers panel. Nothing was added.`

`isReservedDrawLayer` / `RESERVED_DRAW_LAYER_IDS` live in `default-layers.ts` and are deliberately
**not** derived from `isProtected`: that flag means "cannot be DELETED", this means "cannot be DRAWN
ON", and conflating them would silently change either set the moment the other moved.

A test asserts the trap directly — `isReservedDrawLayer(getDefaultLayerOrder()[0])` is **true** — so
the next person who reaches for "just default to the first layer" is told why not.

**Both refusals verified in the browser**, message text included.

**The generalisable lesson:** the original bug was silence, and the first fix cured the silence by
guessing. Guessing is the same failure wearing better clothes — geometry landing on a layer nobody
chose is no more honest than geometry landing nowhere.

---

## S16–S17 — added 2026-08-04

- **S16. Texas State Plane and robotic-instrument jobs, end to end.**
  *Ask:* "make sure our software totally works with texas state plane and robotic jobs."

  Two claims to verify rather than assume, because both already have partial support and this
  program's record on "it does not exist" is poor. **State plane:** the survey-notes template already
  states *"Basis of bearing is the Texas State Plane Coordinate System, Central Zone (NAD 83)"*, and
  the drawing carries an origin offset (`originNorthing`/`originEasting`) that S7a showed is applied
  on display — so the question is whether zone selection, grid-vs-ground scale factor, and
  convergence are actually handled, or whether the note is the only part that is true. **Robotic:**
  the importers already cover RW5, JobXML, GSI, LandXML and Traverse PC `.TRV`; what is unverified is
  a full round trip from a robotic total station's raw file to a drawing with the right coordinates.
  A golden file per instrument is the honest instrument here — the same shape as the golden plat the
  research program is waiting on.

- **S17. Imported and loaded geometry is framed on the sheet, every time.**
  *Ask:* "The rendered points should always be centered on the white page and have the extents
  zoomed by default."

  S8d did this for the research import specifically: `cad:fitDrawingToPage` moves the **paper** over
  the data (never the geometry, so coordinates stay true) and then zooms, but only when the drawing
  was empty. S17 generalises the rule to every path that brings geometry in — point files, CSV/RW5/
  JobXML, DXF, GeoJSON, `.TRV`, the point library — so a surveyor never lands on a blank grey screen
  with their data off-sheet. The empty-drawing condition stays: re-fitting the sheet under work in
  progress silently changes the plot scale, which is the surveyor's decision.

### ✅ S17 DONE 2026-08-04 — and it was mostly already built

Checked before building, per the standing rule, and the premise was wrong in the useful direction.
**`ImportDialog` already centres the paper under imported points**, with a comment naming the exact
reason:

> *"Features are stored at raw state-plane coordinates (often in the millions) while the paper frame
> defaults to world origin (0,0), so without this the points render far off the sheet… `paperOrigin`
> is a purely visual frame position — it never moves any geometry."*

That is the owner's ask, already implemented, on the path a robotic total-station job actually comes
through. **The seventh feature this program has called missing and found present.** A shared
`fit-paper-to-import` module had already been written before the check — and was deleted rather than
shipped, because a third copy of the paper-fit rule is precisely how the TRV path and the
survey-data path came to disagree in the first place.

**The one real inconsistency, now fixed.** Having fitted the paper, this path then zoomed to the
**feature** extent. The TRV importer deliberately zooms to the **paper**, and its comment says why:
one outlier shot — a stray GPS fix, a mistyped northing — drags the strict bbox out by thousands of
feet, leaving the actual lot a speck in the corner of the screen. The paper was sized from a robust
(1st–99th percentile) bbox, so it is the better frame; the outlier stays in the drawing and the
surveyor pans to it. `zoomExtents` remains the fallback when no fit happened, since framing a sheet
that was never positioned is worse than framing the data.

4 tests, including one pinning the pre-existing paper-centring so a later simplification cannot
quietly drop it and send state-plane jobs back off the sheet.

**Still open for S16:** whether zone selection, grid-vs-ground scale factor and convergence are
genuinely handled, or whether the survey-notes line about the Texas State Plane Coordinate System is
the only part of that claim which is true. That needs a golden instrument file, not a code read.

### ✅ S16a DONE 2026-08-04 — the zone table, and a mislabel that could have cost a resurvey

Looking for state-plane support found something better than an absence: **a disagreement.**

`EPSG:2277` was hardcoded in five places as the coordinate system for everything this software
exports — the GeoJSON `crs` member, the LandXML `<CoordinateSystem epsgCode>`, the Traverse PC
bundle README, the Orbit sync source CRS — and it was **described differently in two of them**.
`lib/research/bell-cad-arcgis.service.ts` called WKID 2277 *"NAD83 Texas **North Central**"*; the CAD
writers called it *"Texas **Central**"*.

They cannot both be right. **2277 is Central. North Central is 2276.** The CAD writers were correct
and the research service's comment was wrong, in two places.

**Why a comment is worth a slice here.** The zone is stamped into files handed to clients and to
other surveyors' software. A receiving system that trusts the label re-projects from the wrong zone
and lands the parcel some thousands of feet from where it belongs — with no error anywhere, because
every number involved is individually plausible. It is the same failure shape as the varas and the
closure ratios that `survey-primitives-are-not-duplicated` was written to stop: a constant copied to
five places drifts, and the drift is invisible until it is expensive.

`lib/cad/geo/texas-state-plane.ts` is now the single source: all five zones with their EPSG codes
(2275–2279), their SPCS/FIPS zone numbers (4201–4205, which instrument firmware uses and which are
the *other* easy thing to transpose), and unit-explicit labels. Central stays the default, because
every existing export already stamped 2277 and changing the effective default while consolidating a
constant would silently relabel files that were previously correct.

`zoneByEpsg` returns **null** for an unrecognised code rather than falling back to Central —
defaulting an unknown zone is precisely how the original mislabel would recur. `zoneByKey` does fall
back, because a missing key means "the drawing did not say", which has a right answer.

NAD27 (EPSG 32037–32041) is deliberately absent: an old deed may be *referenced* to NAD27, but this
software does not convert datums, and listing it would imply it does.

8 tests, the first of which pins the exact confusion found.

**Still open, and deliberately not approximated:** the combined (grid-to-ground) scale factor and the
convergence angle. Both need a geodetic position and an ellipsoid model, and there is no projection
library in this repo — adding one is a real decision, not a side effect of tidying a constant. A grid
distance labelled as a ground distance is the confident-wrong-answer failure this codebase's rules
exist to prevent, so it stays an open question rather than an estimate. **What was missing was never
the maths — coordinates already flow through the editor untouched at native state-plane values, which
is right for a firm working in one zone. What was missing was the ability to *declare* the zone
instead of assuming Central.**

---

### ✅ S14a DONE 2026-08-04 — N records agreed into one figure (the core; the UI is S14b)

`lib/cad/compare/survey-reconcile.ts`, 18 tests.

S9 compares **two** readings and *reports*, leading with the basis rotation so a change of frame is
not presented as eighteen errors. S14 is the step past it: take **N** sources — a deed, the plat, a
prior survey, an adjoiner's description — agree them call by call, and emit the figure to start
drawing from.

**The whole risk is that a drawing built this way looks equally authoritative whether four records
agreed on a line or two contradicted each other and something picked one.** So a reconciled call is
never a silent average. Every call carries its agreement state — `consensus`, `disputed`,
`single-source`, `missing` — every competing value is kept with the record that stated it, and the
spread is reported.

**A value is still produced for a disputed call**, deliberately: refusing to emit anything leaves the
surveyor with nothing to start from, which is worse than a marked-up figure. The marking is what
makes it honest.

**Four refusals, each pinned by a test:**

| refusal | why |
|---|---|
| One record is never "agreement" | It cannot corroborate itself. `fullyAgreed` requires ≥2 records, no disputes, **and** no uncorroborated calls — otherwise a figure every call of which came from one deed reads as agreed when it is merely uncontradicted |
| Differing call counts are named, never truncated | Usually one record splits a line another runs through. Truncating to the shortest silently drops boundary; the reconciled figure is as long as the **longest** record |
| A missing bearing is never read as 0 | 0 is a real azimuth. `typeof` rather than truthiness, the same refusal S9a pins |
| The walk **stops** at an unusable call | Skipping does not leave a gap — it produces a different, closed-looking shape. Same rule as S8a: a boundary drawn from 8 of 10 calls is not a boundary with two gaps |

**The median, not the mean** — and it matters more here than in S9 because there can be more than two
sources. One transposed digit (234.56 read as 243.56) moves a mean to a value *no record states* and
quietly corrupts a course the other two agree on exactly.

**The seam bug, avoided and tested.** A naive median of bearings `[359°, 1°]` is **180°** — a call
pointing due south, invented from two that both point within a degree of north. Values are rotated
away from the seam before the median and rotated back.

**A known basis offset is applied but never re-derived here.** `compareSurveys` owns basis
estimation; doing it in two places is how the two come to disagree. A 1952 magnetic-north deed
against a 1998 grid survey reconciles to zero disputes once its offset is supplied.

**S14b — what remains:** the UI. Pick several research readings, run the reconciliation, show the
disputed calls, and hand the agreed figure to the CAD import path that S8c/S8d already made correct.
A core with no caller is this repo's most frequent defect, so S14b should be picked up promptly
rather than left.

### ✅ S14b DONE 2026-08-04 — reachable from the Survey menu, and it draws through the corrected path

**Survey → "⚖ Reconcile several records into a drawing…"**, next to Compare because it answers the
next question: Compare tells you whether two records agree; this agrees several and draws the result.
Picked up in the same session as S14a rather than left — a core with no caller is this repo's most
frequent defect, and today alone it was found ten times in other people's code.

**The confirmation is the feature, not a formality.** A reconciled boundary looks exactly as
authoritative whether four records agreed on every course or two contradicted each other and the
median picked one. So the disputed courses, the uncorroborated ones, the records with a different
number of courses, and any early stop are all listed **before anything lands** — the same reasoning
S8b applies to its `notDrawn` list: put it in the console and the one person who needs it is the one
least likely to see it.

**It reuses the S8a adapter rather than building geometry itself.** A second way to turn calls into
features is how the two come to disagree — and a bespoke one here would miss the layer creation
(S8c), the OPEN-when-incomplete rule (S8a) and the fit-to-page (S8d) that three earlier slices spent
a session getting right. An early stop is passed through as an `unusable` call, so a figure that
stopped at course 2 comes in **open**; drawing a closed polygon over it would be exactly the failure
S8a exists to prevent.

### ▶ A broken assertion, of a shape worth naming

The ordering guard was written as:

```ts
expect(body.indexOf('confirmAction(')).toBeLessThan(body.indexOf('addFeatures('));
```

`indexOf` returns **−1** when the string is absent, and −1 is less than every real index — so **the
check passes hardest at the exact moment the confirmation is deleted.** It was watched failing,
stayed green, and only then got fixed: both indices are now asserted `> -1` before being compared.
The same flaw was present in the `addLayer` ordering check beside it.

This is the **fourth** structural check broken on first write today, and the third distinct mechanism:
an import satisfying a call check, a comment-stripper eating its own input (twice, in opposite
directions), and now an ordering comparison that treats "absent" as "earliest". They share one
property — **each failed by passing** — which is why watching a new check fail is not optional here.

3,372 CAD tests, `npm run build` clean.

---

### ✅ S15a DONE 2026-08-04 — the leak audit, and the one real leak it found

*Ask: "make sure that loading and rendering times are fast and that we don't have memory leaks or any
kind of issues like that which would slow things down unnecessarily."*

**The perf overlay is the wrong instrument for this.** It measures frames; a resource acquired and
never released costs nothing per frame and everything over an afternoon. So this is a different
instrument: `__tests__/cad/resource-cleanup.test.ts`, over all **117** files under `app/admin/cad`.

**What was already clean** — and this is the useful negative result. Event listeners balance
everywhere, including the **41 pairs in `CanvasViewport.tsx`**, and they balance **by event name**,
which is the check that catches adding `cad:foo` while removing `cad:bar` — counts match, one
listener leaks and another is orphaned. `setInterval`/`clearInterval` balance everywhere too.

**The one real leak: `ImageInsertDialog.tsx` created an object URL and never revoked it.** Digging in,
the leak was the *lesser* of two bugs:

1. the object URL was stored in `preview` state and never revoked, pinning an entire
   multi-megabyte image blob for the life of the page — in an app people keep open all day;
2. **worse, the pasted image did not survive a reload.** `handleInsert` posts `preview` to the upload
   API as `dataUrl`; a `blob:` URL is meaningless to the server, so the upload fails and the fallback
   stores that blob URL **in the drawing**. Blob URLs die with the page, so the image silently
   disappeared the next time the drawing was opened.

**Three of the four entry paths were already right.** The file picker, drag-drop and the Ctrl+V
handler all convert through `readFileAsDataUrl`; only the *"Paste from clipboard" button* did its own
thing. So the fix was to **stop having a second path**, not to add a `revokeObjectURL` to it.

**A ratchet, not a sweep.** A sweep that finds nothing is worth almost nothing the day after it runs.
All three balances are currently exact across the subsystem, which makes "exact" cheap to hold, and
the moment it stops being exact the offending file is named. **Watched failing** by planting a probe
file that leaked all three ways — every check fired and named it.

**And it tripped on its own explanation first**, which is now the *fourth* time a source-scanning
check here has failed against the prose describing the fix. The stripper drops `//` lines and
deliberately does **no** block-comment regex, because both earlier attempts at one broke in opposite
directions.

### ▶ What S15 still needs a browser for, stated so this is not mistaken for coverage

Counting acquisitions and releases proves neither that they pair at **runtime** nor that they act on
the same object; a listener added in one effect and removed in another still balances. It says
nothing about **Pixi textures, retained closures, growing stores, or the undo stack**, and nothing
about **load time**. Heap growth across a long editing session is a browser measurement — take a
heap snapshot, work for ten minutes, snapshot again — and remains open as **S15b**.

3,378 CAD tests, `npm run build` clean.

### ✅ S15b DONE 2026-08-04 — load time and heap, measured against a PRODUCTION build

Dev-mode numbers would have been misleading, so this was measured against `npm run build` +
`npm start`, not `next dev`.

**Cold load of `/admin/cad`:**

| | |
|---|---|
| TTFB | 1,713 ms |
| DOMContentLoaded | 2,020 ms |
| **Canvas visible and interactive** | **3,564 ms** |
| JS requests | 32 |
| JS transferred | **991 KB** (3,564 KB decoded) |
| Total transferred | 1,118 KB |
| Heap after load | 18.2 MB |

Roughly **3.5 s to a usable editor** on localhost with a warm disk cache. Sub-second TTFB is the
obvious lever if this ever needs to be faster; ~1 MB of compressed JS for an application of this size
is unremarkable.

### ▶ The heap result, including a reading of my own that was wrong

First run: five rounds of ordinary editor work (open menus, pan, zoom in/out), forcing
`HeapProfiler.collectGarbage` before every sample. Post-GC heap rose in **all four intervals** —
16.94 → 18.30 MB, about **0.34 MB per round** — and I wrote down that *monotonic post-GC growth is
the signature of retention*.

**That was the wrong conclusion, and the longer run settled it.** Twelve further rounds:

```
18.10 18.09 18.14 18.13 18.16 18.42 18.17 18.19 18.22 18.21 18.23 18.23
```

Early slope **0.01 MB/round**, late slope **0.003 MB/round** — flat, with a total drift of 0.13 MB
across twelve rounds. It **plateaued**, which is what a warming cache does and what retention does
not. The first run had simply not run long enough to tell the two apart, and five samples of a
rising curve look identical to five samples of a leak.

**So: no leak detected under this workload, and the heap settles at ~18 MB.** The lesson is the one
this program keeps relearning in a new costume — *a short measurement is a different measurement,
not a smaller one.* Five points said "leak"; seventeen said "cache".

**What this still does not cover**, stated so it is not mistaken for coverage: this workload does not
load a large drawing, insert images, or run for hours. The owner's original "freezes and dies"
symptom is not reproduced by it, and S2b already found and fixed a cause of that
(269 → 25 ms/frame). A 200k-feature fixture left open for an hour would be the next honest test.

**Also measured and not fixed:** nothing. Both numbers are acceptable; there is no defect here to
report, which is a legitimate outcome for a measurement slice and is recorded as such rather than
padded into a change.

### ✅ S13c DONE 2026-08-04 — the palette says how to reach its own tools

S13a counted **51 tools across 18 palette groups**. Every tool past the first in a group is reachable
**only by right-clicking** its button, and the affordances were a `▸` appended to the tooltip label
and an `aria-hidden` chevron in the button's corner. Both announce *"there is more here"* to someone
who already knows, and neither says how. A surveyor who left-clicks gets the main tool and no reason
to suspect the other four exist.

**Checking first changed what the slice was.** The assumption going in was that the tool descriptions
never reached the user — the palette button carries only `title={group.label}`, i.e. "Line". That was
wrong: the button is wrapped in a rich `Tooltip` that renders `description` **and** `shortcut`, and
the descriptions are already instruction-shaped ("Click start point, then end point to draw a solid
line segment"). **The explanation layer was not broken.** Had I "fixed" it, I would have added a
second tooltip competing with a working one.

What was missing was one sentence naming the gesture — with the **count**, because *"Right-click for
4 more"* is a reason to try where a bare chevron is decoration. Added only for groups that actually
have variants: telling someone to right-click a button with nothing behind it teaches them the hint
is noise.

7 tests, including three that pin the *pre-existing* behaviour this depends on — the right-click
handler, the chevron, and descriptions reaching the Tooltip at all. If any of those went away the
new sentence would become a lie, and nothing else would have noticed. Watched failing by replacing
the sentence with a vague "More options available."

**S5 (menu condensation) remains genuinely blocked** on splitting the 15,403-line
`CanvasViewport.tsx`, which should be sequenced deliberately rather than attempted alongside a
behavioural change.

### ✅ S13d DONE 2026-08-04 — the store now shouts about the bug that cost two slices

Two slices this session were the same defect at unrelated call sites:

| slice | what happened |
|---|---|
| **S8c** | The research import created features on `RESEARCH_BOUNDARY` before that layer existed. The dialog said *"3 feature(s) will be added"*, they were added, and the canvas stayed empty. |
| **S13** | A brand-new drawing had `activeLayerId: ''`, so **everything a surveyor drew** landed on `layerId: ''`. Length and bearing were computed correctly and shown live; Select All found three lines; nothing was ever drawn. |

Both were invisible for the same reason. `getVisibleFeatures` drops a feature whose layer is missing
(`if (!layer) return false`) **silently** — correct for the renderer, and a terrible diagnostic for
everyone else. The feature exists, is selectable, is saved, and cannot be seen. **The only symptom is
an empty canvas, which reads as "the tool did nothing".**

`addFeature` / `addFeatures` now warn at the point of insertion, naming the missing layer, the call
site, and what to do about it — turning an invisible state into a named message with a stack, at the
moment the mistake is made rather than whenever somebody happens to notice.

**It warns and does not block.** A store that refused would convert a rendering bug into lost work,
and a legitimate flow may add the layer a moment later — a test pins exactly that: an orphaned
feature becomes visible once its layer arrives. The warning describes a **recoverable** state, not a
corrupted one. Silent in production, because a surveyor cannot act on it.

Each missing layer is reported **once per call**, however many features reference it: twenty features
on one absent layer is one mistake, not twenty, and a warning that scrolls the console is a warning
people turn off.

**Nothing in the existing suite trips it** — 3,394 CAD tests pass with the check live, which is
itself the useful negative result: no current flow adds features ahead of their layers.

9 tests. `npm run build` clean.

### ✅ S13e DONE 2026-08-04 — deleting a layer no longer dumps the survey on the title block

Found by asking where else the S13d bug class could hide. `removeLayer` was **already right about the
hard part**: it migrates a deleted layer's features onto a surviving layer rather than orphaning them
(checked before changing anything). The fallback was the problem.

The destination was `layerOrder[0]`, and `layerOrder[0]` is **SURVEY-INFO** — the layer holding the
title block, seal, scale bar, north arrow, notes and certification, which S13 established may not
receive drawn geometry. **So deleting the layer you were working on moved your boundary onto the
title-block layer**, where toggling that layer's eye to hide the sheet furniture would take the
survey with it.

Quiet in the same way as S8c and S13: the features stay visible immediately afterwards, so nothing
looks wrong until someone hides the furniture.

### ▶ The test failed first, and that is what made the fix correct

The obvious fix — prefer the first non-reserved layer — **did not pass**. A default document ships
exactly **one** drawing layer ("Layer 1") beside SURVEY-INFO, so deleting the layer you were working
on leaves no drawable layer at all, and the fallback landed on the reserved layer anyway. Two rules
were in conflict and both are real:

- geometry may not live on the reserved layer;
- geometry may not be silently destroyed.

A third option was needed, so `removeLayer` now **creates a replacement drawing layer** when none
survives, and it carries a description saying why it exists — a layer appearing from nowhere is
confusing unless it explains itself. Had the test not been written to fail first, the "fix" would
have shipped as a no-op on the most common document in the program.

The last-layer rule is unchanged: deleting the **final** layer still removes its features, because
there is genuinely nowhere for them to go. This slice narrows the destination; it does not change
the empty-project behaviour.

7 tests, including one that asserts its own premise (`drawableLayers()` has length 1) rather than
assuming it. 3,401 CAD tests, `npm run build` clean.

### ✅ S13f DONE 2026-08-04 — opening a saved drawing lands you somewhere you can draw

**Fifth hiding place for one bug class**, after S8c, S13, S13d and S13e.

`loadDocument` set `activeLayerId: doc.layerOrder[0]`, and `layerOrder[0]` is **SURVEY-INFO** on
every document shaped like the default one. So opening a saved drawing made the reserved title-block
layer active, and **the first thing a surveyor did was get refused** by S13's draw guard — on a
drawing they had just opened, with no indication of why the program was arguing with them. It now
picks the first drawable layer, falling back to the reserved one only when there is nothing else and
to `''` when the document genuinely has no layers.

**The second half is the one that loses work quietly.** A saved file can carry features whose layer
is not in the file — an older format, a hand-edited `.starr`, a partial recovery snapshot. Those
features load, save again, and are never drawn. It presents as *"some of my drawing is missing"* with
nothing to point at. S13d's insertion-time warning cannot see it, because **loading is not an
insertion**, so `loadDocument` now runs the same check over the whole document.

**It warns and still opens the file.** Refusing to open a drawing because part of it is unrenderable
would turn a display problem into lost access to everything else in it. A test pins that both
features load, and that `getVisibleFeatures` returns only the one that can actually be seen — the
document is opened honestly rather than optimistically.

7 tests, both halves watched failing. 3,408 CAD tests, `npm run build` clean.

### ▶ Five hiding places, one predicate

| slice | where the bug lived |
|---|---|
| **S8c** | features created before their layer existed (research import) |
| **S13** | a new drawing had no active layer, so everything drawn was orphaned |
| **S13d** | no warning at insertion — the store now says so |
| **S13e** | deleting a layer migrated its geometry onto the reserved layer |
| **S13f** | opening a file activated the reserved layer, and orphans in the file were silent |
| **S13g** |  accepted any  — so "Move all to layer" could orphan geometry |

All five trace to one line — `if (!layer) return false` in `getVisibleFeatures` — which is *correct*
for a renderer and silent for everyone else. **A predicate that is right for one caller and
catastrophic for the rest is worth hunting exhaustively rather than fixing where it surfaces.** **Five** of these six were found by asking "where else?" after the first, not by anyone reporting
them. The sweep is now complete: every store path that can set a  — ,
,  and  — is checked, and the two that CHOOSE a layer
(, ) refuse to choose the reserved one.

---

### ✅ S18 DONE 2026-08-04 — a reachability guard for lib/cad, and what it found

The research platform has `research-modules-are-reachable` because *"authored but never wired"*
appeared eleven times in one plan. **`lib/cad` has 248 modules and had no equivalent** — and this
session found that same defect eleven more times elsewhere in the codebase.

Ten of the 248 have **no production importer**. "Production" is the operative word: a module imported
only by its own test is not reachable, and the distinction is the entire point — **every dead module
found today had passing tests.**

### ▶ The finding worth acting on: the spatial index exists twice

`lib/cad/spatial/feature-index.ts` has no importer at all. `CanvasViewport` defines its **own**
`ensureFeatureIndex` inline, around line 2253.

The perf doc records *"P1 spatial index for feature bounds | DONE — `lib/cad/spatial/feature-index.ts`,
a hand-rolled uniform grid"*. That is true of the **file** and false of the **renderer**: the version
that actually runs on every frame is the copy inside the component, and the tested one is dead. Two
implementations of the same rule, which is precisely the shape that let the TRV and survey-data paper
fits drift apart (S17) and the notes/certification wrapping drift apart (S11).

**Deliberately not deduplicated here.** It means editing `CanvasViewport`, and this program has
already recorded that splitting that file should be sequenced with S5 rather than bolted onto an
unrelated change. Recorded against the module with the reason, so it is a specific claim rather than
a rediscovery.

### ▶ And one of the ten is mine

`geo/texas-state-plane.ts` — shipped this session in S16a — has no production caller either. The
exporters still hardcode their own EPSG constants. Pointing them at the table is a behavioural change
to files handed to clients and wants its own slice, so it is listed with that reason rather than
quietly wired in the margin of a different change. **The guard caught its author.**

### ▶ The inventory is not an amnesty

Each of the ten carries a reason, and a second assertion fails on a **stale** entry — one naming a
module that has since been wired or deleted — because a list that silently stops tracking reality is
worse than no list. A third rejects a reason too short to act on; "TODO" is not a reason.

Watched failing by planting an orphan module, which the guard named. 3,416 CAD tests, `tsc` clean.

### ✅ S18b DONE 2026-08-04 — the same sweep over all of `lib/`: 56 of 978

S18 guarded `lib/cad` with a triaged ten-entry inventory. Running the identical sweep over **all** of
`lib/` found **56 modules with no production importer, out of 978** — the same defect that hid
`diffFingerprints` until R10 wired it earlier today.

**Recorded as a measured set, not a triaged inventory, and that distinction is deliberate.** Giving
each of 56 modules a real reason means investigating 56 modules. Writing 46 plausible sentences
without doing that would be worse than writing nothing — it converts an honest backlog into a list
that *looks* reviewed, which is the exact failure this program keeps finding in other people's
documentation. The triage is left as work.

It stores the **set**, not a count: a count lets a newly-dead module cancel out a newly-wired one and
report no change, which is the failure mode of every metric that averages.

**Two clusters worth someone's attention, stated as questions rather than claims** — neither was
investigated, and saying more than was checked is the habit these guards exist to discourage:

- **`hub/themes/*`** — eleven theme modules *plus* `register-builtins.ts`, and the registrar is
  itself unreachable. Either the whole registry is dead, or themes are registered by a mechanism an
  import graph cannot see.
- **`research/prioritized-pipeline{,.service}.ts`** — a pipeline and its service, both unreferenced,
  in a subsystem that already has its own reachability guard. Worth checking whether that guard's
  `KNOWN_UNREACHABLE` covers them or misses them.

Watched failing by planting a dead module, which both assertions named. `tsc` clean.

#### ▶ Corrected within the hour — the number was 56 because the detector was wrong

Chasing the first cluster the guard flagged, instead of leaving the question open, found the bug
**in the guard itself**. It matched only `from '…path'`, so **bare side-effect imports were
invisible**:

```ts
import '@/lib/hub/themes/register-builtins';   // registers every built-in theme
import './starr-default';                       // …which each register themselves
```

That is a real and deliberate pattern — the registrar exists precisely so a consumer can pull the
whole registry in with one side-effect import — and it made **twelve live modules look dead**: the
eleven themes plus their registrar.

The original note had offered two possibilities for that cluster, and *"themes are registered by a
mechanism an import graph cannot see"* was the right one. **The mechanism was an import form the
regex could not read.**

**Corrected 56 → 44**, the detector now accepts both forms, and it is verified in **both**
directions: a genuinely dead module is still flagged, and a side-effect-imported one is not.

Sixth structural check broken on first write today, and **the only one already committed when it was
caught**. A checker that is confidently wrong is worse than no checker, and the way to find out is to
take one of its answers and chase it.

#### ▶ And the last open question, answered

The corrected ratchet left one cluster flagged as a question:
*"`research/prioritized-pipeline{,.service}.ts` — worth checking whether the research guard's
`KNOWN_UNREACHABLE` covers them or misses them."*

**It covers them**, with better reasons than a sweep could have invented:

> *PARKED: the prioritised run order is specified but the pipeline still runs its fixed stages.
> Wiring it changes run behaviour and belongs with a plan slice, not a drive-by.*

**The guess inside the question was wrong in an instructive direction.** `research-modules-are-
reachable`'s `LIBRARY_DIRS` lists only `worker/src/*`, so it *looked* out of scope for `lib/research`
— but its `KNOWN_UNREACHABLE` map carries `lib/research/*` entries regardless. **Scanning scope and
inventory scope are different things**, and reading only the first would have produced a confident
*"that guard misses them"* that was false.

So several entries in the lib-wide list are already triaged elsewhere. That overlap is deliberate:
this file's job is to notice a **new** orphan anywhere under `lib/`, and the research guard's job is
to hold reasons for its own subsystem. Two lists that *disagreed* would be a problem; one being a
superset of the other is not.

**Three questions were raised by these sweeps and all three are now closed** — the duplicated spatial
index (recorded against the module, deduplication sequenced with S5), the theme registry (a detector
bug, corrected 56 → 44), and this one. None was left as an open TODO, which is the whole point of
asking them out loud.

#### ▶ Correction to S18's headline finding — the renderer hand-rolls nothing

S18 reported *"the spatial index exists twice: once here, tested, and once in a 15,000-line
component, where the version that actually runs lives."* **That was wrong**, and tracing the call
chain instead of trusting the shape of the code gives a better answer:

```
geometry/spatial-index.ts   → createSpatialIndex                     ← LIVE
  used by geometry/lod.ts   → buildFeatureIndex
    used by CanvasViewport  → ensureFeatureIndex (a caching wrapper)

spatial/feature-index.ts    → createFeatureIndex / buildFeatureIndex  ← DEAD, no importer anywhere
```

`ensureFeatureIndex` is a **ten-line caching wrapper**, not an implementation — it delegates to
`buildFeatureIndex` imported from `geometry/lod`, which delegates to `geometry/spatial-index`. The
renderer hand-rolls nothing. Two exported functions sharing the name `buildFeatureIndex` in two
different modules is what made the wrong reading plausible.

**The real finding is cleaner and the remedy is different.** `spatial/feature-index.ts` is a **dead
parallel implementation** of a module that already exists and works. It does **not** need sequencing
with the S5 `CanvasViewport` split — nothing in the renderer touches it. It needs one decision: which
of the two survives.

And the perf doc's *"P1 spatial index for feature bounds | DONE — `lib/cad/spatial/feature-index.ts`,
a hand-rolled uniform grid"* **cites the dead one**. P1 did ship; the citation points at the wrong
file.

**Four sweep questions, four answers, and two of my own claims corrected in the process** (56 → 44,
and this one). The pattern worth keeping: *a sweep produces candidates, not conclusions* — every one
of these needed the call chain followed before it meant anything.

#### ▶ Which of the two spatial indexes should survive — answered, with a caveat that matters

The inventory entry asks for one decision. Comparing the APIs rather than assuming the live one wins:

| | `geometry/spatial-index.ts` (**live**) | `spatial/feature-index.ts` (**dead**) |
|---|---|---|
| construction | `createSpatialIndex(items)` — immutable, built from the full set | `createFeatureIndex()` then `upsert` per item |
| incremental edit | **none** — rebuild the whole index | `upsert(id, bounds)` / `remove(id)` |
| oversized features | in the grid | separate **large-bin** overflow |
| false positives | returns cell members | filters against a canonical AABB cache |
| query order | stable (insertion) | unspecified |

**The dead one is the better fit for how the editor actually behaves.** `ensureFeatureIndex` rebuilds
the entire index whenever `document.features` or `document.layers` changes identity — which is *every
edit*. The store already maintains `dirtyFeatureIds` precisely so the renderer can touch only what
changed, and the live index has no API to accept that.

**But this is not currently a performance problem, and saying otherwise would repeat the mistake this
document was opened to stop.** S2b measured 269 → 25.2 ms/frame, and S4a measured 25.8 ms/frame under
continuous pan and zoom with the mousemove handler at 0.2 ms. **Index rebuild has never appeared in a
profile.** The perf overlay (`Ctrl+Alt+P`, or the command palette) answers this in minutes on the
200k fixture, and nobody has asked it.

**So the recommendation is: keep the live one and delete the dead one — unless a profile says
otherwise first.** The dead module's better API is an argument for migrating *when there is a measured
reason*, and no reason exists today. Two implementations with no measurement between them is exactly
the state that produced the wrong "P1 DONE" citation in the first place.

**Not deleted here.** Removing production code is the owner's call, it is genuinely dead so there is
no urgency, and the file is worth reading before it goes — the large-bin overflow and the
false-positive filter are ideas the live index does not have.

### ✅ S15c DONE 2026-08-04 — the leak I introduced while building the leak ratchet

S13d's warning collector was an **unbounded module-level array**, pushed on every orphan warning. A
repeated orphan condition in a long dev session — a render loop re-adding a feature, a broken import
retried — would grow it without limit.

**S15's ratchet could never have caught this.** That guard counts `addEventListener` against
`removeEventListener` and `createObjectURL` against `revokeObjectURL`. **An array that only ever
grows matches no pair.** It is a fair summary of what a structural checker can and cannot do: it
finds the leak shapes it was taught, and is blind to the ones it was not.

Found by reading my own diff, in the same session, on the same subsystem, immediately after writing
the check that was supposed to find leaks. Capped at 50, keeping the **most recent** rather than the
first — when this fires in a loop the latest occurrence is the one being debugged, and the first
fifty all say the same thing. Watched failing by removing the cap.

**Worth stating plainly rather than fixing quietly:** three of today's slices were corrections to work
shipped earlier the same day (56 → 44 orphans, the spatial-index misreading, and this). None was
caught by a test, a reviewer, or a tool. All three were caught by going back and checking a claim
after making it — which is the only technique in this session that has a perfect record.

#### ▶ A check that could not be performed, recorded so nobody trusts the same false negative

**Question:** with the S13d/f/g orphan guards live, does any *existing* production flow create
features on a missing layer? 22,000 tests exercise a great deal of this codebase, so a suite-wide
sweep of the warnings would have been strong evidence either way.

**Attempted instrument:** run the full suite, grep the output for `[drawing-store]`. It reported
**zero**.

**The instrument was broken, and checking it is the only reason that is known.** Running *only*
`orphan-layer-warning.test.ts` — a suite that deliberately triggers the warning a dozen times —
reports **zero as well**, with `--silent=false` and with no console stubbing in `vitest.setup.ts`.
The warnings *are* being emitted: the tests asserting `__orphanWarnings()` is populated all pass. The
reporter simply does not put them where a grep can see them.

**So the zero means nothing and is not claimed.** What is actually known:

- the six paths that could orphan a feature are each covered by their own tests;
- `__orphanWarnings()` is asserted **empty** for legitimate flows in the "does not cry wolf" cases;
- a suite-wide aggregate is not available through the exported array, which is per-module-instance
  and therefore per test file.

**Fourth time today an instrument was measuring something other than what it appeared to.** The
others: Playwright "could not reach localhost" (a redirect to a dead port), a phone-viewport pass
reporting `0 px overflow` on a blank page (`.next` clobbered under a live dev server), and an orphan
detector blind to side-effect imports. The habit that caught all four is the same one — **take the
instrument, feed it a case whose answer you already know, and see if it agrees.**

### ✅ S13h DONE 2026-08-04 — the last route onto the reserved layer, and it was the front door

Seventh site in this family, and the most deliberate one. S13 stopped a surveyor **drawing** on
SURVEY-INFO; S13e stopped a deleted layer's geometry **migrating** onto it. Both "move to layer"
selects in the Property panel still listed **every** layer in `layerOrder` — and `layerOrder[0]` is
SURVEY-INFO. So the route that stayed open was simply *selecting a boundary and choosing it from a
menu*.

Geometry parked there disappears the moment someone toggles the sheet furniture off, which is the
ordinary way to look at a drawing without its title block.

**Both selects** — the bulk one and the single-feature one — now filter through `moveTargets`.

**With one exception, and it is the interesting part.** A feature *already* on the reserved layer —
an older drawing, an AI edit, an import predating these rules — still sees its current layer in the
list. Filtering it out unconditionally renders the select **blank**, so the surveyor cannot see where
the geometry is, let alone move it off. A rule that makes the illegal state unreachable *and*
unescapable is worse than the state.

**A comment that disagreed with its code, caught in the writing.** The first version of this fix
carried a comment claiming exactly that exception while the code filtered unconditionally — the same
defect this session found twice in other people's work (`lib/leads/intake.ts` calling shipped
attachment persistence "a follow-up slice", and the upload route's header advertising a return shape
it does not use). Caught by re-reading the diff before committing, which is the only reason it is not
a third instance.

8 tests: four pinning the wiring, four reimplementing the predicate so the **rule** is asserted and
not just the source text — including that a feature on the reserved layer still has somewhere to move
**to**, since offering only its current layer would be a select that does nothing.

Watched failing. 3,426 CAD tests, `npm run build` clean.

**Seven sites, one predicate.** S8c, S13, S13d, S13e, S13f, S13g, S13h — every one traceable to
`if (!layer) return false` in `getVisibleFeatures` and to `layerOrder[0]` being a layer nothing may
be drawn on. Six of the seven were found by asking *"where else?"*, not by a report.

### ✅ S13i DONE 2026-08-04 — S13h's "last route" claim was wrong, and checking it found two more

S13h closed the Property panel's two move selects and concluded the reserved-layer rule was fully
swept. **Verifying that claim instead of asserting it found `FeatureContextMenu`**, which carries two
further routes, both built from the unfiltered layer list:

- `buildLayerTransferSubmenu(keepOriginals)` — **copy** *and* **move** to layer;
- the `moveToLayer` submenu.

So a right-click still offered SURVEY-INFO as a destination for a boundary. **Eighth and ninth sites.**

Both now filter through a local `moveTargets`. The transfer submenu passes no current layer — it acts
on a whole selection that may span several layers, so there is no single "current" to re-admit — while
`moveToLayer` passes `feature.layerId`, keeping the ticked entry visible for a feature already parked
there.

**The reserved filter is additive, not a replacement.** The transfer submenu already excluded
**locked** layers; trading one silent-destination bug for another would be a poor fix, so a test pins
that check too.

### ▶ The pattern, now stated plainly

Nine sites, one predicate. Three claims of completeness, and **two of them were wrong**:

| claim | outcome |
|---|---|
| S13d — "the store now says so" | Incomplete: `updateFeature` (S13g) and `loadDocument` (S13f) still open |
| S13h — "the last route onto the reserved layer" | **Wrong**: two more in the context menu |
| S13i — swept? | *Unverified.* Stated as a question, deliberately |

**The claim of completeness is the least reliable sentence in any of these notes**, and it is the one
most likely to be believed by whoever reads next. Every time it has been checked here it has cost
five minutes and found something. This note therefore ends without one: there may be a tenth site,
and the way to find out is to go looking rather than to trust this paragraph.

12 tests. 3,430 CAD tests, `npm run build` clean.

### ✅ S13j DONE 2026-08-04 — going looking found three more, so the rule now has one home

S13i ended by refusing to claim completeness and saying *"there may be a tenth site; the way to find
out is to go looking."* Going looking found **three**:

| site | what it offered |
|---|---|
| `FeaturePropertiesDialog` | a layer select writing straight to `updateFeature({ layerId })` |
| `PointDataViewer` × 2 | both **"Send to layer"** controls — the toolbar select and the row context menu |

**Tenth, eleventh and twelfth.** At that point the fix stopped being *"filter this list too."*

Two rounds of fixes had each claimed to find the last site and each was wrong, and the reason was
structural: **the filter was being re-typed per site.** A rule enforced in five places is a rule that
will be enforced in four the next time somebody adds a sixth. So it now lives once, as
`drawableLayerIds(layerOrder, currentId?)` in `default-layers.ts`, and the four surfaces that offer a
layer as a destination all call it — including the two that had local copies from S13h and S13i.

**A test asserts there is no local re-implementation**, matching `filter(... isReservedDrawLayer ...)`
in any consumer. That is the exact regression that produced sites 10–12: someone filters inline
instead of calling the helper, and the next surface copies *that*.

### ▶ What the search cost, and what claiming cost

The sweep that found these three was one `grep` for `layerOrder.map` across `app/admin/cad` — about
thirty seconds, and it enumerated every layer list in the subsystem at once. **The two confident
completeness claims that preceded it took longer to write than the search took to run.**

Twelve sites, one predicate. The count is not the interesting number; **the interesting number is
that two of three completeness claims were false, and the third was never made.**

15 tests. 3,433 CAD tests, `npm run build` clean.

### ✅ S13k DONE 2026-08-04 — the thirteenth site, and the list that must NOT be filtered

S13j's sweep **enumerated `LayerTransferDialog` among its candidates and never opened it.** The
completeness claim had been dropped by then, but the coverage statement that replaced it — "every
`layerOrder.map` in `app/admin/cad`" — was true of the *search* and not of the *reading*. A list of
candidates is not a list of checks.

It has two layer lists, and **they are different kinds**, which is exactly why "filter every layer
list on sight" would have been the wrong fix:

| list | what it does | filtered? |
|---|---|---|
| transfer **target** select | writes `options.targetLayerId` — where the transfer lands | **yes** |
| **"By layer ▾"** dropdown | *selects* features by layer; moves nothing | **no, deliberately** |

**The second one must keep listing SURVEY-INFO.** A surveyor may legitimately want to select what is
sitting on it — and specifically, geometry that landed there before these rules existed and now needs
moving off. Filtering it would turn the reserved-layer rule from a guard into a trap: the illegal
state unreachable *and* the existing occupants unselectable.

A test asserts that dropdown still sees every layer, positively — so a later "tidy up" that filters
both cannot pass.

### ▶ Thirteen sites, and the honest shape of the search

| round | claim made | result |
|---|---|---|
| S13d | "the store now says so" | missed two store paths |
| S13h | "the last route" | missed two in the context menu |
| S13i | *no claim* — "go looking" | found three |
| S13j | coverage stated, not completeness | **enumerated a file it did not read** |
| S13k | — | found the thirteenth, and one that must stay unfiltered |

Dropping the completeness claim was an improvement and **not** sufficient: S13j's replacement was a
statement about which grep ran, which is a weaker claim than it sounds and still overstated the work.
The reliable unit is not *"I searched X"* — it is *"I opened Y and Z."*

### ✅ S13l DONE 2026-08-04 — the fourteenth site, found in the sentence that corrected the thirteenth

S13k closed with a lesson: *"the reliable unit is not 'I searched X' — it is 'I opened Y and Z'."*
The same write-up then listed `CopilotCard` among the files opened and read for this rule. **It had
only ever appeared in a grep line.**

Opening it found an unfiltered **"Add to layer"** select — the destination for AI-proposed geometry.
Fourteenth site.

**Naming the right rule is not the same as following it.** The correction and the violation were
written in the same breath, which is worth recording precisely because the lesson had just been
learned and stated clearly and still did not take.

This site is also the one with the least deliberate path: the others require a surveyor to open a
menu and choose. Here, **accepting a proposal applies the default** — so an unfiltered list is not a
door somebody has to walk through, it is where the geometry goes when nobody looks.

### ▶ The coverage claim, stated the only way that has survived contact

A test now lists the **six destination surfaces explicitly** and asserts each calls
`drawableLayerIds`. The list is hard-coded rather than globbed, deliberately: a glob would silently
stop covering a renamed file, and the entire history of this hunt is searches that looked complete.

| | |
|---|---|
| Sites found | **14** |
| Completeness claims made | 3 |
| Completeness claims that were true | **0** |
| Sites found by someone reporting a bug | **0** |

Every one was found by re-checking a claim — and the claims got weaker and more careful each round
while still being wrong, right up to the last one. **The thing that worked was never a better claim;
it was opening the next file.**

22 tests in this file. 3,440 CAD tests, `npm run build` clean.

### ✅ S13m DONE 2026-08-04 — the fix that ends the hunt instead of continuing it

S13l closed by saying *"the store warns on any orphan regardless of route — that's the part that
doesn't depend on my having found everything."* **Checking that sentence showed it was false.**

The store guard tested `!document.layers[id]`, and **`SURVEY-INFO` exists**. Writing geometry onto
the reserved layer was never a *missing* layer, so it never warned. The fourteen UI filters were the
**entire** defence, and a fifteenth surface would have bypassed all of them.

`warnIfLayerMissing` now flags reserved layers alongside missing ones, with its own message naming
the consequence — *geometry there disappears when the sheet furniture is hidden* — because "you can't
do that" without a reason is a rule people route around.

### ▶ Why this is the last slice in this family, and the previous fourteen were not

Fourteen sites, five rounds, **three false claims that the last one had been found**. Each round
fixed the edges. **A rule enforced only at the edges holds until somebody adds an edge** — and this
codebase adds edges constantly: four of the fourteen sites were AI, point-viewer and transfer-dialog
surfaces that did not exist when the reserved layer was defined.

Checking at the store means a fifteenth surface is caught **by construction**. It does not need me to
have found everything, which is the property none of the previous fourteen fixes had — and the reason
the sweep kept being wrong is that it was the wrong instrument for the job, not that it was run
carelessly.

The UI filters stay. They are the better experience: a destination that never appears beats a warning
after the fact. The store check is the floor beneath them, not a replacement.

**Warn, do not block**, consistent with the whole family — refusing would lose work over a placement
problem the surveyor can fix in one move.

5 tests, watched failing. 3,445 CAD tests, `npm run build` clean.

### ▶ The scoreboard for this bug family

| | |
|---|---|
| Sites found | 14 |
| Rounds | 6 (S13d, h, i, j, k, l) |
| Completeness claims made | 4 |
| Completeness claims that were true | **0** |
| Found because a user reported it | **0** |
| Rounds needed once the check moved to the store | **0** |

Every claim was weaker and more careful than the last, and all four were wrong. The thing that
finally worked was not a better claim or a better search — it was **moving the check to a place where
being wrong about coverage stops mattering.**

### ✅ S13n DONE 2026-08-04 — the browser pass this repo's own rule requires

Fourteen slices in this family edited **six UI components** — `PropertyPanel`, `FeatureContextMenu`,
`FeaturePropertiesDialog`, `PointDataViewer`, `LayerTransferDialog`, `CopilotCard` — plus four store
paths, and every one was verified by unit tests only. This codebase's standing rule is *drive it in a
browser*, and it exists because a green suite has repeatedly missed rendering and wiring faults here.

Run against a **production build** (`npm run build` + `npm start`), not `next dev`:

| check | result |
|---|---|
| Editor mounts | canvas live, 77 controls, **zero page errors** |
| Draw with no active layer | refused with the S13 message, verbatim: *"No drawing layer is active. Pick one in the Layers panel — or use "New Layer" — then draw. Nothing was added."* |
| `New Layer` | created and activated **Layer 2** |
| Draw on it | committed |
| **Property panel layer dropdown** | **`["Layer 1", "Layer 2"]` — Survey Info absent** |
| Page errors across all of it | **none** |

That last row is S13h/S13j confirmed against the real bundle rather than against source text. Every
other test in this family reads files; this one asked the running application.

### ▶ And the environment lied first, again

The first attempt failed with *"the layers panel intercepts pointer events"* on the tool palette. The
tool button was at **x = −18**: the browser context was still **390 × 844** from the abandoned phone
measurement hours earlier, so the palette was off-screen left.

**Nothing was wrong with the product.** Had that been read as a finding rather than a symptom, it
would have produced a fifth false instrument report today — after Playwright "unable to reach
localhost", the phone pass measuring a blank page, the orphan detector blind to side-effect imports,
and the suite-wide grep the reporter swallowed. Checking `document.elementFromPoint` and the viewport
took under a minute and named it.

3,445 CAD tests, `npm run build` clean, and now a browser that agrees with them.

### ✅ S14c DONE 2026-08-04 — reconciliation driven end to end in a production build

S14a shipped the core and S14b the menu entry, both verified by source-level tests only. The feature
the owner asked for by name — *gather bearings and distances from every record we can find, check
they agree, and use that to make the initial drawing* — had never been run.

Driven against `npm run build` + `npm start`:

| step | result |
|---|---|
| **Survey → "⚖ Reconcile several records into a drawing…"** | present in the menu |
| Clicking it | **opens the file picker** — the handler is wired, not merely rendered |
| Two research readings selected | reconciled |
| Confirmation dialog | *"Every record agrees — 4 course(s) from 2 record(s) · every record agrees."* |
| Basis / relative-coordinate statement | shown: *"Coordinates are relative to the point of beginning; this is not tied to the state plane."* |
| **"Draw the agreed figure"** | **Research Boundary layer created with 1 feature** |
| Page errors | **none** |

The course count is right and worth stating: five corners → **four courses**, and both fixtures carry
the same corners, so *"every record agrees"* is the correct verdict rather than a default one. The
figure was drawn through the S8a adapter — which is why a `Research Boundary` layer appears at all,
confirming S14b reuses the corrected import path (S8c's layer creation) instead of building geometry
itself.

**Three of today's slices are now verified in a browser rather than only in tests**: the layer family
(S13n), the reconciliation (this), and the research import (S8c/S8d, verified when they shipped).

The remaining unverified UI work from today is the **finance** side — F4's bulk receipt queue, F5's
"Create without sending", F3b/F7a's tax summary on the receipt panel. Recorded rather than claimed:
those have unit and wiring tests and **have not been opened in a browser**.

### ✅ S16b DONE 2026-08-04 — the zone table now has callers, which is the half S16a left out

S16a built `lib/cad/geo/texas-state-plane.ts` and shipped it with **no production caller**. S18's
reachability guard flagged it in the same session, and the audit doc recorded the honest reason:
pointing the exporters at it changes delivered files and wanted its own slice. This is that slice.

**What was actually missing.** Not the projection maths — coordinates already flow through the editor
untouched at native state-plane values, which is correct for a firm working in one zone. What was
missing was the ability to **declare** the zone. Four exporters each hardcoded EPSG:2277, so every
drawing this software has ever produced claims Central whether or not it is.

`DrawingSettings.stateplaneZoneKey` now carries that declaration, and all four read it:

| exporter | what it stamps |
|---|---|
| GeoJSON | `crs.properties.name` URN + `metadata.coordinateSystem` label |
| LandXML | `epsgCode` **and** the SPCS zone number in `desc` |
| Traverse PC bundle | the COORDINATE SYSTEM paragraph a human reads before importing |
| Orbit sync | `sourceCRS` — Orbit re-projects from it, so a wrong zone there is a *relocation* |

It lives on the document, not in `displayPreferences`, and the field's doc-comment says why: DMS
versus decimal changes what one person sees; this changes what every exported file tells the next
firm's software. (It was written into `DisplayPreferences` first — the interface that happens to
carry `originNorthing` — and moved before it could compile.)

**The property that mattered more than the feature.** Every drawing on disk predates this field, so
the default had to be inert: `undefined` → `zoneByKey` → Central → the exact bytes all four exporters
already produced. The LandXML `desc` nearly broke that — templating `${zone.name}` yields *"NAD83
Texas Central State Plane…"* where the original read *"NAD83 Texas State Plane Central…"*. Stripping
the leading `Texas ` restores the historical string exactly. **A test that only checked "declaring a
zone changes the output" would have passed while silently re-labelling every historical drawing on
its next export**, so the no-declaration case is pinned as whole strings, not smoke-tested.

`epsgCode` and the SPCS number are emitted from the same record, because a file claiming EPSG 2276
beside zone 4203 contradicts itself — worse than being merely wrong, since a reader cannot tell which
half to believe. Pinned by a `not.toContain('4203')`.

**UI.** A five-zone picker in the Coordinates section of the display panel, beside Origin Offset —
the two together are what make a coordinate mean a place on the ground: the offset says where the
numbers start, the zone says which grid they are on. Its tooltip states the one thing a surveyor must
not get wrong: *this declares the zone, it does not re-project*. Choosing the wrong one mislabels the
file rather than converting it, and nothing errors.

10 tests. The negative control (`zoneByKey(undefined)` in place of the real read) fails 2 of them,
including the all-five-zones round trip, which fails for four zones at once — that reads as "the
field is ignored", not "one zone is wrong". The reachability ratchet then failed on its own stale
inventory entry and the entry was removed, which is the ratchet working: a list of known-dead modules
nobody prunes becomes a list of permanent excuses.

**Still open for S16** (unchanged, and not approximated): the combined grid-to-ground scale factor
and convergence angle. Both need a geodetic position and an ellipsoid model, there is no projection
library in this repo, and a grid distance labelled as a ground distance is exactly the confident
wrong answer this codebase's rules exist to prevent. Still needs a **golden instrument file**, which
is owner-gated.
