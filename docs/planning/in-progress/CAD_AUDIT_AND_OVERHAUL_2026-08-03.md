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

- **S3. Guard against losing work.** Independent of S2's cause: a refresh should not lose a drawing.
  Autosave/restore is worth doing even once the freeze is fixed, because a browser tab can always die.

- **S4. Load and render at scale.** Many layers, many images, many geometries. Measure first — frame
  time on change, time-to-first-render by element count — then act. Likely candidates: virtualise the
  layer/point tables, batch canvas invalidation, avoid full re-render on a single-element edit.

- **S5. UI condensation.** Only after S1, because condensing menus without a catalogue is rearranging
  what you have not read. Target: fewer top-level surfaces, tools grouped by task rather than by
  implementation.

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

## 4. Not started

Every slice above. This document is S0.
