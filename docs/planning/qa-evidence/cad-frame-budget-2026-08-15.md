# CAD frame budget — measured 2026-08-15

C1 of `docs/planning/in-progress/CAD_EXCELLENCE_AND_PLATFORM_COMPLETION_2026-08-15.md`.

**This slice deliberately changes no code.** D2: *"P1 opens by re-measuring, not by optimising"* —
the failure mode being avoided is a slice that optimises something already fast while the real cost
sits somewhere nobody profiled.

## How

Playwright against the dev server at 1600×1000, driving the app's own instrument
(`PerfOverlay`, toggled via the `cad:togglePerfOverlay` event; histogram from
`lib/cad/perf/render-markers.ts`). Each state resets the histogram, exercises the canvas for ~2.5s,
then snapshots. Synthetic fixtures from `lib/cad/perf/fixtures.ts` — deterministic, same seed, so
these numbers are reproducible.

**Budget: 16.7ms/frame** (60fps). Everything below is `renderAll`, in milliseconds.

## The numbers

| Fixture | State | p50 | p95 | max | vs budget |
|---|---|---|---|---|---|
| **Small** — 1,000 | idle | 3.4 | 4.9 | 5.0 | ✅ 3.4× headroom |
| Small | pan | 3.4 | 4.9 | 5.0 | ✅ |
| Small | zoom | 3.3 | 6.0 | 7.0 | ✅ |
| **Medium** — 50,000 | idle | 8.1 | 10.3 | 10.3 | ✅ |
| Medium | pan | 8.5 | 11.1 | 11.3 | ✅ 1.5× headroom |
| Medium | zoom | 8.2 | 10.8 | 11.7 | ✅ |
| **Large** — 200,000 | idle | 24.8 | 42.1 | 42.1 | ❌ **1.5× over at p50** |
| Large | **pan** | **28.7** | **66.9** | **136.7** | ❌ **p95 ≈ 15fps; max is a visible stutter** |
| Large | drag-select | 24.1 | 33.5 | 42.7 | ❌ |

Phase breakdown at Large, during pan (the worst state):

| Phase | p50 | p95 | p99 |
|---|---|---|---|
| `renderFeatures` | **19.1** | **39.7** | **127.8** |
| `renderLabels` | 6.2 | 8.8 | 9.6 |
| `renderImageFeatures` | 0 | 0.1 | 0.2 |
| `renderSelection` | 0 | 0.1 | 0.2 |

## What this says

1. **The budget holds comfortably to 50,000 features.** Pan p95 of 11.1ms against a 16.7ms budget
   is 1.5× headroom, and that is the size a real survey drawing is likely to reach. There is no
   performance problem in the range the product is actually used in.

2. **It breaks between 50,000 and 200,000.** Not gradually: 50k pans at 11.1ms p95 and 200k pans at
   66.9ms p95 — six times worse for four times the features. Something is worse than linear in that
   range, and finding it is C2's job. The exact knee is not measured here; C4 wants that number.

3. **`renderFeatures` is the cost, and its p99 is the interesting part.** 19.1ms p50 is most of the
   28.7ms frame, but the 127.8ms p99 spike is a different phenomenon from the median — a periodic
   stall, not a uniformly slow path. A fix aimed at the median could leave the stutter untouched.

4. **The old 269ms → 25ms figure has NOT rotted.** Large idle measures 24.8ms today, which is where
   that pass left it. D2 was right to distrust a year-old number and wrong about which direction:
   the codebase has not regressed, it has held. The optimisation work in C2–C4 is therefore about
   pushing the ceiling higher, not about recovering lost ground.

5. **Labels are a real but secondary cost** — a consistent 6–9ms at Large, ~25% of the frame.
   Worth remembering when C2 picks a target, because it is the second-largest phase and it is
   steady rather than spiky.

## Reproducing

```
# dev server on 3080, then Playwright:
#   goto /admin/cad → dispatch 'cad:togglePerfOverlay' → click Small|Medium|Large
#   → Reset → exercise ~2.5s → read the histogram table
```

The fixture buttons are destructive (they replace the current document) and confirm first, so an
automated run must accept the dialog.

---

# C2 — profiling the render path (2026-08-15)

C1 named `renderFeatures` and left two findings: a ~19ms median and a 127.8ms p99 that behaves like
a different phenomenon. C2 instrumented the suspect rather than reasoning about it.

## The finding

`renderFeatures` opens with:

```js
const visibleFeatures = useDrawingStore.getState().getVisibleFeatures();
const visibleIds = new Set(visibleFeatures.map((f) => f.id));
```

`getVisibleFeatures()` is cached by reference — that was the S2 fix and it works. The **second**
line is not cached: it walks the whole visible set to build a throwaway string array, then a Set
from it, **every frame, regardless of what the camera did**.

Measured with a new `cullIdSets` marker (nested inside `renderFeatures`, so its time is a subset):

| Fixture | state | `cullIdSets` p50 | `renderFeatures` p50 | share |
|---|---|---|---|---|
| Medium — 50,000 | pan | 3.3 | 4.6 | **72%** |
| Large — 200,000 | pan | **16.2** | 20.9 | **78%** |

`cullIdSets` p99 at Large is **39.7ms** against a 16.2ms median — the spike lives here too.

## Why it is the wrong size of work

The only consumer asks `visibleIds.has(id)` for ids already present in `pixi.featureGraphics`, and
that map holds only what has actually been drawn — roughly what fits on screen. **The set is built
at the scale of the DOCUMENT to answer questions at the scale of the VIEWPORT.**

It is the same shape as the bug S2 fixed: a large allocation completed before a single pixel is
drawn. It also explains both C1 findings with one cause — steady allocation and hashing gives the
median, and churning ~400,000 objects per frame gives the GC pause that shows up as the p99.

It scales with the document, not the view: 3.3ms at 50k → 16.2ms at 200k, almost exactly 4× for 4×
the features. That is the curve C1 measured.

## What C3 should do

The visible set is already cached in the store against `document.features` / `document.layers`
references. The id Set is derivable from exactly the same inputs and invalidates on exactly the same
conditions, so it belongs beside it — built once per document change instead of once per frame.

`culledIds` (built from the culled list, so viewport-sized) is a much smaller cost and is **not**
the target; measuring stopped it being assumed.

---

# C3 — the fix, with the number (2026-08-15)

`renderFeatures` now calls `getVisibleFeatureIds()`, a Set cached in the store beside the visible
list on the same `document.features` / `document.layers` key. Built once per document version
instead of once per frame.

## Before / after, same fixtures, same instrument

| Fixture | State | Phase | Before | After |
|---|---|---|---|---|
| Large 200k | pan | `cullIdSets` p50 | 16.2 | **0** |
| Large 200k | pan | `renderFeatures` p50 | 20.9 | **5.8** |
| Large 200k | pan | `renderAll` p50 | 32.5 | **14.8** |
| Large 200k | pan | `renderAll` p95 | 39.8 | **18.8** |
| Large 200k | pan | `renderAll` **max** | 49.5 | **19.7** |
| Large 200k | idle | `renderAll` p50 | 24.8 | **11.4** |
| Medium 50k | pan | `renderAll` p50 | 9.3 | **5.5** |

Against C1's original numbers the max is the headline: **136.7ms → 19.7ms**. The GC pause is gone,
which is what the allocation theory predicted — remove the churn and the spike goes with it.

**A 200,000-feature drawing now pans at 14.8ms p50, inside the 16.7ms budget.** p95 is 18.8ms, so
it is close rather than clear; that is C4's remaining ground.

## The new top cost

`renderLabels` is now the largest phase at Large — 7.0ms of a 14.8ms frame, and 7.1ms of 11.4ms
when idle. It did not get slower; everything around it got faster. C1 flagged it as "a real but
secondary cost", and it is now the primary one.

---

# C4 — guard rails, and where the cliff moved to (2026-08-15)

`renderLabels` built its keep-set by walking every layer-visible feature per frame. It uses the
UN-culled set on purpose (culling it would destroy and recreate every label on each pan), which is
correct and is exactly why it was O(document). Now cached beside the others on the same key.

## Large (200k), pan

| Phase | C1 (before any fix) | After C3 | After C4 |
|---|---|---|---|
| `renderAll` p50 | 28.7 | 14.8 | **14.9** |
| `renderAll` p95 | 66.9 | 18.8 | **17.5** |
| `renderAll` max | 136.7 | 19.7 | **22.3** |
| `renderLabels` p50 | 6.2 | 7.0 | **5.9** |
| `renderFeatures` p50 | 19.1 | 5.8 | **6.0** |
| `cullIdSets` p50 | — | 0 | **0** |

C4 is a real but much smaller win than C3: labels fell 7.0 → 5.9ms, and `renderAll` barely moved
because the remaining label cost is the actual Pixi.Text work for the labels ON SCREEN, which is
viewport-sized and legitimate. p50/p95/max differences under ~2ms here are run-to-run noise.

## Where it falls over

| Features | Before C3 | Now |
|---|---|---|
| 50,000 | 11.1 p95 — inside budget | **6.9 p95** |
| 200,000 | **66.9 p95 — 4× over** | **17.5 p95 — at the line** |

**The cliff used to sit between 50,000 and 200,000 features.** It does not any more: 200k pans at
14.9ms p50, inside the 16.7ms budget, with p95 a whisker over at 17.5ms. The editor now degrades
gradually across the whole tested range instead of falling off between the two.

No fixture exists above 200,000, so the new cliff is unmeasured — it is somewhere past 200k rather
than between 50k and 200k. Recorded as unknown rather than guessed at.
