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
