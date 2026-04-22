# Closure Tolerance — Standards & Pipeline Gates

**Last Updated:** April 2026
**Spec ref:** Phase 7 (Geometric Reconciliation), Phase 8 (Confidence Scoring)

---

## 1. What Closure Means

A boundary survey traverses a closed polygon. Compute each call (bearing + distance) into northing/easting deltas, sum them, and ideally you return to the point of beginning with zero residual. In the real world there is always a residual — the **error of closure**.

**Linear closure ratio** = `perimeter / error_distance`. A ratio of **1:10,000** means the residual error is 1 foot per 10,000 feet of perimeter. Higher denominator = tighter closure.

---

## 2. Industry Standards

| Survey class | Linear closure | Angular closure | Use case |
|---|---|---|---|
| Class A — urban / suburban | **1:10,000** (0.01%) | 10″√N | Most platted lots, urban boundaries, ALTA-adjacent work |
| Class B — rural | **1:7,500** (0.013%) | 15″√N | Rural acreage, ag tracts, ranch boundaries |
| Ordinary boundary | **1:5,000** (0.02%) | 30″√N | Anything you'd sign your name to as a "boundary survey" |
| Topographic / construction | 1:2,500–1:5,000 | 30″√N+ | Not boundary work; lower bar acceptable |
| **ALTA / NSPS positional tolerance** | 0.07 ft + 50 ppm (~1:14,000+) | — | ALTA Land Title Surveys |

Source convergence: Texas Board of Professional Engineers and Land Surveyors (TBPELS) chapter 663 manual of practice; ALTA/NSPS 2021 Standards.

**Key takeaway:** anything looser than **1:5,000** is below the floor for a usable boundary closure. Anything tighter than **1:10,000** is silently good. Between the two is a grey zone that depends on the survey's intended use (rural ag = fine, urban platted lot = marginal).

---

## 3. Pipeline Gates — How We Use This

Three tiers, implemented in `worker/src/lib/closure-tolerance.ts` and consumed by:
- `worker/src/services/traverse-closure.ts` (computes the ratio)
- `worker/src/services/confidence-scoring-engine.ts` (incorporates into overall confidence)
- the new mid-pipeline gate 7 ("Closure Tolerance Gate") added in Phase B

| Tier | Ratio range | Pipeline behavior |
|---|---|---|
| **excellent** | ≥ 1:10,000 | Silent pass. No flag, full confidence. |
| **acceptable** | 1:5,000 to 1:10,000 | Pass with `closure_warn` note attached to the boundary record. Surfaced in the report under "items to verify in the field." |
| **marginal** | 1:2,500 to 1:5,000 | Soft fail. Boundary appears in the report but with an amber "closure below standard" banner. Pipeline does not auto-publish; requires reviewer click-through. |
| **poor** | < 1:2,500 | Hard fail. Block from final report. Force manual review. Most likely cause: extraction error in one or more bearing/distance calls, or supersession/replat not yet found. |

The thresholds align with the existing 4-tier classification already in `traverse-closure.ts` (50000 / 15000 / 5000 / below) — we keep those numbers but rename them so the names match the report banners surveyors will see.

### Mapping to the existing in-code thresholds

| Existing label in `traverse-closure.ts` | Existing ratio | New tier name | Pipeline action |
|---|---|---|---|
| `excellent` | ≥ 50,000 | `excellent` | silent pass |
| `acceptable` | ≥ 15,000 | `excellent` | silent pass |
| `marginal` | ≥ 5,000 | `acceptable` | pass with `closure_warn` |
| `poor` | < 5,000 | `marginal` or `poor` (split at 2,500) | soft or hard fail |

So the existing `acceptable` (≥15,000) and `excellent` (≥50,000) are **both** above the industry "excellent" floor of 1:10,000. The existing `marginal` (≥5,000) lines up with the industry `acceptable` band of 1:5,000–1:10,000. The existing `poor` (<5,000) is split into our new `marginal` and `poor`.

---

## 4. Why Not Tighter?

We considered using ALTA's 1:14,000 floor (0.07 ft + 50 ppm) as the silent-pass threshold. Rejected because:

1. RECON pulls call data from recorded deeds, which were often surveyed decades ago to looser standards. Demanding ALTA closure on a 1980s deed will fail every gate.
2. Old M&B descriptions frequently round bearings to the nearest minute (or even the nearest 5 minutes) and distances to the nearest foot. The intrinsic precision floor of the input data is well below ALTA tolerance.
3. ALTA tolerance is for *new field measurements*, not for *re-tracing recorded calls*. We are doing the latter.

If a customer specifically needs ALTA-grade output, that's an additive requirement applied to the new field measurements they (or Starr) take, not to the deed re-tracing the pipeline does.

---

## 5. Configuration Override

A county can override the default thresholds via `worker/src/infra/county-config-registry.ts`. Some counties have more accurate older survey records than others; rural counties may want to relax the marginal threshold. Defaults live in `closure-tolerance.ts`; per-county overrides extend them. No global override — it must be county-scoped to prevent accidental loosening.
