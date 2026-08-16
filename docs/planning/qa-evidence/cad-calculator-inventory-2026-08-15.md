# CAD calculator inventory — C27

**Measured 2026-08-15** with `scripts/cad-calculator-audit.mjs`. Audit only; no behaviour changed.

The slice asks for "what exists against what a surveyor expects. Gap list." The instrument answers
the first half; the second half is judgement and is marked as such below.

---

## How it was measured, and what the instrument got wrong first

Extracted rather than hand-written, per C13 — 51 rows of prose about what the tools *should* do
produced a document nobody had checked against the code.

Three questions per calculation surface, because those are the three ways one can be useless:

| | |
|---|---|
| **Reachable** | can a surveyor open it without reading the source? |
| **Input** | does it take the current selection, or must every value be retyped? |
| **Writes back** | does the answer become geometry, or only text on a screen? |

**The scan needed four corrections before any of its numbers were usable**, and every one of them
produced a confident, wrong finding first:

1. **Reachability was not transitive.** Looking only at menus/hotkeys/layout reported
   `GenericCalculator`, `CalculatorPicker`, `ClosureReport` and `CurveCalculatorBody` as
   *unreachable*. All four are mounted by `CalculatorModal` / `TraversePanel` — which is how a
   modal-with-tabs is built. Corrected: every CAD component counts as a reach source. **0
   unreachable.**
2. **Write-back only looked for direct store writes.** `CalcPointDialog` computes a point and hands
   it to the AI review queue (`enqueueProposal`), which paints it dashed until accepted — a
   deliberate design, and a *stricter* write-back path than a direct one. Corrected.
3. **The lib scan was not recursive**, so `computeClosure`, `bowditchAdjustment` and
   `transitAdjustment` — the closure and bowditch engines this plan names by name — came back
   orphaned. They are called from `lib/cad/store/traverse-store.ts`, one directory down. **That
   would have been a headline finding built entirely out of the instrument's blind spot.**
4. **Then the recursive scan self-matched**, counting each engine's own `export function` line as a
   use, and reported zero orphans everywhere. Excluding the file under test fixed it. A scan that
   cannot fail is not measuring anything — the same self-match that cost C3's guard three revisions
   and the C24 inline-hex fix a second pass.

Remaining known limitation, deliberately left: orphan detection matches the bare identifier rather
than a call, because `CanvasViewport` imports all of `perpendicular-line.ts` under aliases and a
call-shaped regex called all seven exports dead. It therefore **over-reports usage**. The column is
a candidate list for a human, and a false orphan costs a slice to disprove while a missed one costs
nothing this scan would have caught anyway.

---

## What exists

### 13 calculation surfaces

| Surface | Lines | Reads selection | Writes geometry | Provenance | Undo |
|---|---|---|---|---|---|
| `IntersectDialog` | 1137 | · | ✅ | ✅ | ✅ |
| `CalcPointDialog` | 390 | ✅ | ✅ (via review queue) | · | · |
| `TraverseViewer` | 215 | · | ✅ | · | ✅ |
| `CurveCalculator` | 320 | · | · | · | · |
| `CurveCalculatorBody` | 272 | · | · | · | · |
| `OffsetPanel` | 279 | · | · | · | · |
| `TraversePanel` | 202 | · | · | · | · |
| `GenericCalculator` | 197 | · | · | · | · |
| `AreaMeasureHUD` | 166 | · | · | · | · |
| `OnLineOffsetPanel` | 139 | · | · | · | · |
| `CalculatorModal` | 48 | · | · | · | · |
| `ClosureReport` | 46 | · | · | · | · |
| `CalculatorPicker` | 41 | · | · | · | · |

`OffsetPanel` / `OnLineOffsetPanel` show "·" for write-back because they hand off to
`applyOffsetFromPanel` and `commitPerp` in `CanvasViewport` rather than writing themselves (C16).
The geometry does get created; the column is measuring the file, not the flow.

### 20 engine modules

`cogo` · `curve` · `compound-curve` · `curb-return` · `intersection` · `closure` · `traverse` ·
`area` · `area-measurement` · `offset` · `perpendicular-line` · `bearing` · `solver` · `legal-desc` ·
`boundary-loop` · `spline-to-arc` · `curve-fit` · `fit` · `orient` · `units`

---

## Findings

### F1 — Only one of thirteen surfaces records provenance

`IntersectDialog` is the only one. `TraverseViewer` and `CalcPointDialog` both put geometry into the
drawing with nothing recording how it was derived.

This is C30's whole subject, and it is worse than it looks: **a calculated point that cannot say
what it was calculated from is indistinguishable from a point somebody typed**, and a survey
deliverable is exactly the place that distinction matters. It is also the prerequisite P8 needs —
AI-authored geometry has to be explainable, and there is currently no field to explain it in.

### F2 — Three curve engines exist that nothing can reach

`compound-curve.ts` exports `computeCompoundCurve`, `computeReverseCurve` and
`computeClothoidSpiral`. **Verified: none is referenced anywhere outside its own file.**

A compound curve and a reverse curve are ordinary road-alignment work, and a spiral is standard on
any highway job. The maths is written, tested and unreachable. This is the shape this document keeps
finding, and it is the single largest item for C29.

### F3 — Two COGO implementations, one of them unused

* `cogo.ts` — `distDistPoints`, `brgDistPoints`, `brgBrgPoint`, returning **both** intersection
  solutions as `Point2D[]`. The three are used only by `computeCogoSolutions` in the same file.
* `solver.ts` — `calcFourthParallelogramCorner`, `calcPointFromBearingDistance`,
  `calcPointFromTwoBearings`, `calcPointParallelToLine`. These are what `CalcPointDialog` imports.

Two vocabularies for the same job invite exactly the drift D4 called out for the AI registries. One
should win; the other should be deleted or adapted.

### F4 — Other verified orphans

| Export | Module | Note |
|---|---|---|
| `convertSplineToArcs` | `spline-to-arc.ts` | Spline → arc conversion, for CAD packages that reject splines. Real deliverable need. |
| `convexHull` | `fit.ts` | Building block; `fitOrientedRectangle` uses it internally, so this is low-value. |
| `fitSplineControlPoints` | `curve-fit.ts` | |
| `computeCorrectionFromPoints`, `orientSurveyByReferenceLine`, `orientSurveyByManualCorrection` | `orient.ts` | Higher-level wrappers; `OrientationDialog` calls the lower-level `computeOrientationCorrection` / `applyOrientationRotation` instead. |
| `azimuthOfDirection` | `perpendicular-line.ts` | |
| `snapToFootGrid`, `pointInBounds`, `isVertexLoopClosed`, `formatDelta` | various | Small utilities. |

### F5 — Two calculators, two different front doors

`CalculatorModal` hosts `GenericCalculator` and `CurveCalculatorBody` behind `CalculatorPicker`,
while `CurveCalculator` (320 lines) is a *separate* surface with its own reach. `CurveCalculator` and
`CurveCalculatorBody` are 320 and 272 lines of overlapping curve work. C28 ("one predictable place")
has to resolve which is canonical before anything is added to either.

### F6 — Only one surface reads the selection

`CalcPointDialog`. Every other calculator requires the surveyor to retype values that are already in
the drawing — which is both slow and the most likely source of a transcription error in a
deliverable. C28's "take the current selection as input" is therefore twelve surfaces of work, not
one.

---

## What a surveyor expects that is not here

Judgement, not measurement. Against a standard COGO/curve toolkit:

| Expected | State |
|---|---|
| Inverse (bearing + distance between two points) | ✅ `inverseBearingDistance`, wired |
| Point from bearing + distance | ✅ `solver.ts`, in `CalcPointDialog` |
| Bearing–bearing, distance–distance, bearing–distance intersection | ✅ engines exist; `cogo.ts` set unused (F3) |
| Line–line / line–arc / arc–arc intersection | ✅ `intersection.ts`, 14 exports, well used |
| Curve solving from any two of R/L/Δ/T/C | ✅ `curve.ts` + `CurveCalculator` |
| **Compound curve** | ⚠️ engine exists, unreachable (F2) |
| **Reverse curve** | ⚠️ engine exists, unreachable (F2) |
| **Spiral / clothoid** | ⚠️ engine exists, unreachable (F2) |
| Traverse closure + Bowditch / transit adjustment | ✅ `closure.ts`, wired through `traverse-store` |
| Area by coordinates | ✅ `area.ts` |
| Curb return | ✅ `curb-return.ts` |
| Legal description generation | ✅ `legal-desc.ts` |
| **Slope / grade / vertical curve** | ❌ nothing found |
| **Radial stakeout (from a setup point)** | ❌ nothing found |
| **Station–offset along an alignment** | ❌ nothing found |
| **Area by segments / partition a parcel to an area** | ❌ nothing found |

---

## Gap list for C29

Ordered by what a survey deliverable actually needs.

1. **F2 — reach the three curve engines.** Compound, reverse and spiral are written and tested and
   cannot be used. Highest value per unit of work in this list, by a wide margin.
2. **Station–offset and radial stakeout.** Both absent, both routine field work.
3. **Slope / grade / vertical curve.** Absent.
4. **Partition a parcel to a target area.** Absent, and the classic reason a surveyor opens a
   calculator at all.
5. **F3 — pick one COGO vocabulary** and delete the other.
6. **`convertSplineToArcs`** — reachable spline→arc conversion for packages that reject splines.

## For C28

* Resolve `CurveCalculator` vs `CurveCalculatorBody` (F5) before adding to either.
* Selection-as-input is twelve surfaces (F6), not a one-line change.

## For C30

* Provenance exists on exactly one surface (F1). The field itself does not exist on `Feature`, so
  C30 starts in the model, the same way P6 did.

---

## F6 revisited — "selection-as-input is twelve surfaces" (C29, closing note 2026-08-15)

It is not twelve, and the number was doing real harm: carried forward as twelve pieces of work, it
made a small job look like a project and kept it parked through five slices.

Auditing the thirteen surfaces that did not read the selection, against *what each one's input
actually is*, splits them three ways.

### Already take their input from the drawing, by a better mechanism than the selection

`IntersectDialog`, `OffsetPanel`, `OnLineOffsetPanel` — all three are driven by a **canvas pick**.
The surveyor clicks the feature on the drawing and the panel binds to it. That is a selection under
another name, and a more precise one: a pick can capture *which segment* and *which side* of a
feature was clicked, which a selection cannot express. Adding "reads the selection" to these would
be a second, worse input path competing with the working one.

### Have no selectable input at all

`CalculatorModal` and `CalculatorPicker` are chrome — a frame and a list, with no inputs.
`GenericCalculator` is a Windows-style pocket calculator over digits and operators.
`AreaMeasureHUD` reports the polygon being drawn *right now*, so its input is the in-progress
vertex list and cannot be a selection made before it started. `TraversePanel`, `TraverseViewer` and
`ClosureReport` all read the traverse store, which is the traverse the surveyor has already built —
selecting geometry would not tell them which traverse to report on.

That is **ten of the thirteen** where the gap was never a gap. The measurement counted every
surface that did not call `getSelectedFeatures`, which is not the same question as *should it*.

### Genuinely wanted it — and one of them was broken, not merely inconvenient

`CurveCalculator` and `CurveCalculatorBody` both offer a **3-point method** (PC, a point along the
arc, PT). `computeCurve` implements it completely. **Neither form had any way to enter the three
points** — no state, no inputs, and `compute()` never set `point1`/`point2`/`point3`. Choosing the
method hid the R and Direction fields, left nothing behind, and Compute answered *"Insufficient
input — provide at least R and one other parameter"*: advice for a method that does not take R.

So the carried gap and a dead method were the same work. The three points are three shots the
surveyor already has on the drawing, which makes the selection the method's natural input rather
than a shortcut for it — six coordinates read off the screen and retyped is exactly the friction
F6 was measuring. Both surfaces now read the live selection in **click order** (a `Set` preserves
insertion order, so the order is the order clicked, and the panel labels each row PC / Along arc /
PT because which point is which changes the answer). Collinear points are reported as collinear
rather than as insufficient input, and a selection of more than three is refused rather than
silently truncated to the first three — which would answer a question nobody asked and look right
doing it.

`AdvancedCurveCalculator` is the third and is left deliberately: compound, reverse and spiral
curves are solved from **design parameters** — two radii, a length, an A-value — that the drawing
does not hold. Its start position is the one thing a selection could supply, and it already accepts
a typed one; that is a convenience worth having and it is not this gap.

**Selection-as-input: 5 of 17 surfaces, and the remaining twelve are accounted for by name.** The
`usesSelection` flag in `lib/cad/calculators/registry.ts` still tracks the count, and the ratchet
still asserts that most surfaces do not read the selection — because the honest reading of that
number is now "most surfaces have no selection to read", not "most surfaces are missing something".
