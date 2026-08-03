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

- **S3. Guard against losing work.** Independent of S2's cause: a refresh should not lose a drawing.
  Autosave/restore is worth doing even once the freeze is fixed, because a browser tab can always die.

- **S4. Load and render at scale.** Many layers, many images, many geometries. Measure first — frame
  time on change, time-to-first-render by element count — then act. Likely candidates: virtualise the
  layer/point tables, batch canvas invalidation, avoid full re-render on a single-element edit.

  **Note the correction in S2**: partial rendering DOES already exist — `renderFeatures` culls to
  the viewport and re-tessellates only dirty or changed features (Slices P3/P3b). So this slice is
  not "add incremental rendering"; it is "find what is still expensive once the existing incremental
  path is accounted for". Measure before designing.

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

**Not started:** S1–S9.

**Start here:** open a drawing, command palette → *Performance Overlay*, generate the **large
(200k)** fixture, read the per-phase histogram, and paste it into S2. Then read
`cad-desktop-tauri-and-perf-2026-06-14.md` §P6 — the React boundary audit, the one Phase-2 slice that
never completed, and the previous author's own hypothesis for exactly this symptom.

**Do not skip either step.** This document contains two confident mechanisms that were wrong, both
written from source in one session, and both would have been settled in five minutes by the overlay
that was sitting there the whole time. The corrections are left in place rather than deleted, because
the pattern is the lesson.
