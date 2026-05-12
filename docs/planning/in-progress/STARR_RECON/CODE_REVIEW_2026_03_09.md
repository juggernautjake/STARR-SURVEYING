# STARR RECON — Code Review

**Date:** 2026-03-09
**Reviewer:** Claude (Opus 4.6)
**Scope:** Complete review of all STARR RECON / property research code

> **Findings ledger (added 2026-05-12):** the §Issues Found prose
> below identifies 11 specific bugs. Per-finding status is tracked
> here so the planning-doc loop knows when this snapshot has
> served its purpose:
>
> - [ ] **#1 (critical)** `comparison.service.ts` calculates closure in canvas pixel space (lines 162-188) — needs survey-space traverse data instead of transformed drawing elements.
> - [ ] **#2 (critical)** AI responses cast without runtime validation (`document-analysis.service.ts:66`) — add Zod between AI responses and the data pipeline.
> - [x] **#3 (important)** `listDrawings()` N+1 fixed — replaced the per-drawing COUNT loop with a single `IN (drawing_ids)` `SELECT drawing_id FROM drawing_elements` projecting only the FK column, then tally in memory (uses the existing FK index on `drawing_elements.drawing_id`). Two queries total — the drawing list + one element-row fetch — for any N. PostgREST embedded-aggregate quirks sidestepped.
> - [x] **#4 (important)** In-memory search cache removed from `property-search.service.ts`. The 100-entry LRU + 15-min TTL was dead weight on Vercel serverless (every invocation got fresh memory, so the cache always missed). Both `getCachedResult` and `setCachedResult` call sites in `searchPropertyRecords` are gone; the orphaned helpers and `searchCache` Map are deleted. Re-introduce as Redis or Supabase RPC if/when search latency becomes a measured pain point. The worker-side pipeline uses different code paths and is unaffected.
> - [x] **#5 (important)** Document text truncation raised — `MAX_DOCUMENT_TEXT_CHARS = 50_000` named constant added; both `analyzeLegalDescription` and `analyzePlat` use it now. Claude's 200 K context leaves headroom for system prompt + multi-doc context buckets. Docs over 50 K (rare; subdivision plats with chained exhibits) still need chunked analysis — tracked as a follow-up.
> - [ ] **#6 (important)** No rate limiting on `POST lite-pipeline` — add per-project + per-hour AI budget.
> - [ ] **#7 (important)** `buildCallSequence()` Strategy 3 fragile (`drawing.service.ts:400-416`) — validate traverse closure before accepting.
> - [x] **#8 (important)** `comparison.service.ts:386-388` confidence breakdown — `computeConfidenceBreakdown` now takes `MathCheckSummary` and maps `area_difference_acres` → `area_accuracy` (7-tier ladder: < 0.001 ac → 100, < 1.0 ac → 40, ≥ 1.0 ac → 25) and `closure_precision` → `closure_quality` (TBPELS-aware ladder: ≥ 10K → 100, ≥ 1K → 75, < 100 → 25). Null checks (no math data) preserve the 75 neutral default the old hardcode used as a fallback.
> - [x] **#9 (minor)** Unused `drawingIds` variable in `listDrawings()` — fixed; line 590 removed.
> - [x] **#10 (minor)** Duplicate section numbering in `geometry.engine.ts` — renumbered (5 callouts, 6 POB, 7 coordinate labels).
> - [ ] **#11 (minor)** `export.service.ts` PDF rasterizes SVG → PNG — consider svg2pdf.js for true vector PDFs.
>
> When every box is [x], move this doc to `docs/planning/completed/STARR_RECON/`.

---

## Scope of Review

Every file in the STARR RECON system was read and analyzed:

| Area | Files | Lines |
|------|-------|-------|
| `lib/research/` (services) | 19 | ~14,400 |
| `types/research.ts` | 1 | 753 |
| `app/admin/research/` (UI) | ~35 | ~27,800 |
| `app/api/admin/research/` (API routes) | ~35 | ~7,700 |
| `__tests__/recon/` (tests) | 22 | ~19,200 |
| `worker/src/` (DigitalOcean worker) | ~120 | large |
| `seeds/090_research_tables.sql` | 1 | ~350 |
| `STARR_RECON/` (phase docs) | 24 | documentation |

**Total:** ~250+ files, ~70,000+ lines of code dedicated to property research.

---

## Overall Verdict

**The STARR RECON codebase IS capable of performing property research well for its target market (Central Texas surveying).** The pipeline from address input to AI-analyzed survey plan is complete and architecturally sound. The surveying math is correct, the confidence scoring is sophisticated, and the AI integration is production-grade with proper error handling.

---

## Strengths

### 1. End-to-End Pipeline is Complete

The "One-Click Research" flow chains everything together:

```
Address → Geocode → Property Search (10+ sources) →
Document Import → AI Analysis → Cross-Reference →
Discrepancy Detection → Drawing Generation →
Verification → Survey Plan → Export
```

This is all wired up through the `lite-pipeline` API route. A user can go from a Bell County address to a field-ready survey plan.

### 2. Texas County Coverage is Extensive

- **15 TrueAutomation counties** with JSON API integration (Bell, Coryell, McLennan, Falls, Milam, Lampasas, Travis, Bastrop, etc.)
- **3 eSearch CAD portals** (Bell, Hays, Williamson)
- **33 publicsearch.us county clerk portals** for deed research
- **Bell County ArcGIS** with fallback endpoints
- City-to-county inference for Central Texas cities (Temple, Belton, Killeen, Waco, etc.)
- FEMA NFHL, USGS, TxDOT RPAM, Texas GLO, TCEQ, RRC, NRCS sources

### 3. AI Architecture is Production-Grade

- **`ai-client.ts`**: Centralized wrapper with model pinning, retry with exponential backoff, timeout handling, and proper error classification (`AIServiceError` with categories: rate_limited, usage_exhausted, authentication, connectivity, etc.)
- **12 versioned prompts** in `prompts.ts` with specific temperature settings and strict JSON output formatting
- **JSON parsing is resilient**: 3-strategy parser (strip fences → extract first object → extract first array → fall back to raw)
- **Vision API support** for OCR on scanned documents

### 4. Surveying Math is Correct

- **`normalization.ts`**: Pure, deterministic functions for bearings (quadrant notation with DMS), distances (feet, meters, chains, varas, rods), DMS parsing, traverse closure, and area calculation via Shoelace formula. Bearing-to-azimuth conversion is correct for all four quadrants.
- **`geometry.engine.ts`**: Full traverse computation with Compass Rule adjustment (applied when precision > 1:5000). Curve computation handles chord bearing, delta angle, and arc length properly.
- **Varas-to-feet conversion** (2.777778) — correct for Texas historic surveys.

### 5. Multi-Layered Confidence Scoring

Two independent scoring systems:

**Element-level** (`confidence.ts`):
- 5-factor weighted score: source_quality (20%), extraction_certainty (25%), cross_reference_match (25%), geometric_consistency (20%), closure_contribution (10%)
- Document type reliability tiers (survey=95, deed=85, appraisal=55)
- Document age penalties, OCR readability bonuses, discrepancy severity deductions

**Multi-source** (`multi-source-confidence.ts`):
- 4-level hierarchy: per-call → per-lot → per-boundary → overall property
- Additive formula with base (10/25/40 by source count), agreement bonus (0/15/30), quality bonus, and deductions
- "Penalized by weakest link" — a single bad boundary drags the overall score down
- 5-symbol surveyor notation: CONFIRMED, DEDUCED, UNCONFIRMED, DISCREPANCY, CRITICAL

### 6. Drawing/SVG Rendering is Comprehensive

- Full SVG renderer with 10 element types (line, curve, polygon, point, label, dimension, symbol, hatch, callout, polyline)
- Monument symbols vary by type: circle (iron rod), square (concrete), triangle (PK nail), diamond (other)
- "Found" monuments get crosshairs
- Title block, north arrow, scale bar, feature legend, confidence color bar
- 4 view modes: standard, feature classification, confidence heat map, discrepancy highlighting
- Export to PNG (300 DPI via resvg-js), PDF (jsPDF), DXF (AutoCAD-compatible), SVG, JSON

### 7. Database Schema is Well-Designed

8 tables with proper FK cascading, JSONB columns for flexible metadata, CHECK constraints on status enums, and appropriate indexes.

### 8. Test Coverage is Exceptional

22 phase-specific test files with ~19,200 lines of tests (2,117 tests reported passing).

---

## Issues Found

### CRITICAL (Must Fix Before Production)

#### 1. `comparison.service.ts` calculates closure in canvas pixel space

After `createDrawing()` runs, all element coordinates are transformed to canvas pixels (via `surveyToCanvas()`). The `compareDrawingToSources` function then calculates closure from these pixel coordinates, producing meaningless closure ratios and acreage values.

**File:** `lib/research/comparison.service.ts` lines 162-188
**Fix:** Use the original survey-space traverse data for verification, not transformed drawing elements.

#### 2. No runtime validation of AI responses

AI responses are cast directly without validation:
```typescript
return result.response as LegalDescriptionAnalysis; // document-analysis.service.ts:66
```

If Claude returns malformed data (degrees > 90, missing fields, wrong types), it flows into traverse computation unchecked. `normalizeBearing()` validates ranges but is only called in the `buildCallSequence` path, not when AI returns pre-normalized JSON.

**Fix:** Add Zod or runtime validation between AI responses and the data pipeline.

### IMPORTANT (Should Fix)

#### 3. `listDrawings()` has N+1 query problem

Each drawing triggers a separate COUNT query for element count. With many drawings this becomes slow.

**File:** `lib/research/drawing.service.ts` lines 578-606
**Fix:** Single query with subquery or JOIN.

#### 4. In-memory search cache won't work in serverless

```typescript
const searchCache = new Map<string, { ... }>();
```

On Vercel (serverless), each invocation gets fresh memory. This cache provides no benefit.

**File:** `lib/research/property-search.service.ts`
**Fix:** Use Redis or Supabase for caching if deploying to Vercel.

#### 5. Document text truncated at 18,000 characters

```typescript
text.substring(0, 18000)
```

With Claude's 200K context window, 18K chars is very conservative. Long legal descriptions or subdivision plats could lose critical data.

**File:** `lib/research/document-analysis.service.ts`
**Fix:** Raise to 50K+ or implement chunked analysis.

#### 6. No rate limiting on lite-pipeline endpoint

The `POST lite-pipeline` chains geocoding, property search, image capture, and AI analysis in one request with no per-user rate limiting. A user spamming this could burn through API credits.

**Fix:** Add per-project and per-hour AI call budget.

#### 7. `buildCallSequence()` Strategy 3 is fragile

When pairing bearings and distances by positional order, a single missed extraction causes all subsequent pairings to be wrong, producing a completely incorrect traverse.

**File:** `lib/research/drawing.service.ts` lines 400-416
**Fix:** Add a validation step that checks if the resulting traverse closure is reasonable before accepting Strategy 3 results.

#### 8. `comparison.service.ts` confidence breakdown is hardcoded

```typescript
area_accuracy: 75,    // always 75 regardless of math results
closure_quality: 75,  // always 75 regardless of math results
```

These should use actual `mathChecks.closure_precision` and `mathChecks.area_difference_acres`.

**File:** `lib/research/comparison.service.ts` lines 386-388

### MINOR

#### 9. Unused variable in `listDrawings()`

`drawingIds` is computed but never used (line 590 of `drawing.service.ts`).

#### 10. Duplicate section numbering in `geometry.engine.ts`

Comments label both "Other consideration callouts" and "Point of Beginning label" as section 5.

#### 11. PDF export rasterizes SVG

`export.service.ts` rasterizes SVG to PNG then embeds in jsPDF. This produces a rasterized PDF, not vector. For surveying deliverables, vector PDFs are preferable.

**Fix:** Consider svg2pdf.js for true vector PDF output.

---

## Architecture Quality

| Aspect | Rating | Notes |
|--------|--------|-------|
| Type Safety | Excellent | Comprehensive TypeScript interfaces, union types for enums |
| Separation of Concerns | Excellent | Clean split: normalization (pure math) / AI client / services / routes / UI |
| Error Handling | Very Good | AIServiceError classification, graceful degradation throughout |
| Data Flow | Very Good | Clear pipeline: documents → extraction → normalization → cross-reference → drawing → verification |
| Test Coverage | Excellent | 22 test files, ~2,100 tests, covering all phases |
| Surveying Accuracy | Correct | Bearing/azimuth, traverse, closure, Compass Rule, Shoelace — all mathematically sound |
| Scalability | Good | Batch element inserts; but in-memory cache and N+1 queries need work |
| Security | Needs Audit | Input sanitization exists; auth enforcement across all routes needs verification |
| Documentation | Excellent | 24 phase documents, thorough header comments on every service file |

---

## Conclusion

The STARR RECON codebase is **production-capable** with the fixes noted above. The 2 critical issues (pixel-space closure and unvalidated AI responses) should be addressed first, followed by the important items. None of these undermine the fundamental architecture — they are production-hardening tasks.

The system represents a substantial, well-engineered piece of surveying software that can genuinely streamline property research for Starr Surveying.

---

*Starr Surveying Company — Belton, Texas — March 2026*
