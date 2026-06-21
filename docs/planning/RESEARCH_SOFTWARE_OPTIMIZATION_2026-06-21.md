# Property-Research Software — Analysis & Optimization Roadmap

**Date:** 2026-06-21
**Author:** automated deep analysis (R1 of `SITEWIDE_UI_CONSISTENCY_AUDIT_2026-06-20.md`)
**Status:** analysis + roadmap. **No feature build in this artifact.** Each
roadmap phase below is a candidate for its own `in-progress/` phase doc once
the user prioritizes it. Productization, pricing, and county-integration
scale-out are business decisions — they are intentionally NOT queued for the
autonomous stop-hook loop.

---

## 0. Goal (user intent)

Turn the in-house property-research subsystem into a **packageable, sellable
SaaS product** for Texas land-surveying firms, with **maximal integration into
Texas county systems** (CAD/appraisal, county clerk deed records, GLO, GIS).
The product ingests deeds / plats / legal descriptions, uses AI to extract
boundary data, reconciles conflicting sources, and produces a verified,
drawable, exportable survey boundary — compressing hours of manual records
research into minutes.

---

## 1. Current state (grounded in the code)

### 1.1 Architecture at a glance

```
Upload/Fetch ──► Extract (OCR + parse) ──► AI data extraction ──► Reconcile ──►
   Review ──► Draw (SVG) ──► Verify (drawing vs source) ──► Export (DWG/DXF/PDF)
```

Seven-stage pipeline keyed on `research_projects.status`
(`upload → configure → analyzing → review → drawing → verifying → complete`).

- **UI:** `app/admin/research/**` — list page, `[projectId]` hub (tabbed),
  `/boundary` interactive SVG viewer, `/documents`, `/report` (mobile field
  view), `/coverage`, `/testing` lab, plus `research/library`, `research/pipeline`,
  `research/billing`. ~25 panel components; `DrawingCanvas.tsx` (~110 KB) is the
  largest.
- **API:** `app/api/admin/research/[projectId]/**` — documents, analyze,
  pipeline (DigitalOcean worker), data-points, discrepancies, drawings,
  boundary, boundary-calls, chain-of-title, verify-lot, bell-cad-gis,
  flood-zone, topo, browser-fetch, export-to-cad, survey-plan, share, versions.
- **AI:** `lib/research/**` — Claude Sonnet 4.5 (`claude-sonnet-4-5-20250929`),
  temperature 0.0, via `@anthropic-ai/sdk`. ~12 specialized prompts
  (DOCUMENT_CLASSIFIER, OCR_EXTRACTOR, DATA_EXTRACTOR, LEGAL_DESCRIPTION_ANALYZER,
  PLAT_ANALYZER, CROSS_REFERENCE_ANALYZER, BOUNDARY_EXTRACTOR, DRAWING_COMPARATOR,
  SURVEY_PLAN_GENERATOR, FINAL_COHERENCE_REVIEWER, AERIAL_IMAGE_ANALYZER).
  Retry w/ exponential backoff; typed `AIServiceError` taxonomy.
- **Data model:** `research_projects`, `research_documents`,
  `extracted_data_points` (normalized JSONB per category),
  `discrepancies`, `rendered_drawings`, `drawing_elements`,
  `analysis_templates`, `drawing_templates`. Storage bucket
  `research_documents`.

### 1.2 What genuinely works today

- **Document ingestion + OCR** with sophisticated tiling (2×2 / 3×3 with
  overlap, 150–300 DPI page render via `sharp`, Playwright fallback) for large
  scanned plats. pdf-parse fast-path for text-layer PDFs; mammoth for DOCX.
- **Structured extraction** of metes-and-bounds calls (bearing+distance pairs
  kept atomic — a correct and non-obvious design choice), monuments, easements,
  lot/block, deed references, with per-point confidence + source attribution
  (page, bbox, excerpt).
- **Boundary reconciliation + closure math** — `/boundary` walks the traverse
  (bearing+distance → x,y), computes closure error, grades confidence A–F.
- **Discrepancy detection** across documents with severity + probable-cause
  taxonomy (clerical/transcription/datum/age/OCR/etc.).
- **Drawing generation + editing** — SVG element model with feature classes,
  confidence per element, user-edit tracking; export to DWG/DXF/PDF.
- **Real county integrations:** Bell County ArcGIS (parcels/abstracts/
  subdivisions/lot-lines), TrueAutomation (propaccess), eSearch CAD,
  publicsearch.us (Tyler), FEMA flood maps. Auto-detects Bell County from
  address (31 cities, 36 ZIPs).

### 1.3 What's stubbed / half-built (the gap to "product")

| Area | State | Evidence |
|------|-------|----------|
| County clerk deed records statewide | Only eSearch/TrueAutomation/publicsearch adapters; no per-county clerk coverage | `boundary-fetch.service.ts` TODOs |
| TxGLO (historical survey/abstract) | Listed as a source, **no integration** | `RESEARCH_SOURCES` list |
| USGS topo / TNRIS GIS | Endpoint stub only | `topo/route.ts` placeholder |
| Large-doc chunking | Text truncated at 50K chars | `document-analysis.service.ts` comment |
| Per-field AI response schema validation | Coarse array/string guards only | CODE_REVIEW_2026_03_09 finding #2 |
| Drawing verification (drawing-vs-source) | Framework + prompt exist; visual-comparison logic incomplete | `comparison.service.ts`, `VerificationPanel` |
| `sharp` PDF rendering | Fragile (depends on libvips PDF support varying by build) | extraction pipeline |
| Multi-tenancy / per-customer isolation | Research tables not obviously org-scoped for external sale | data model |

---

## 2. The product thesis & the moat

For a sellable Texas product, **the AI extraction is table-stakes; the county
integration breadth is the moat.** Any competitor can call Claude on a PDF.
What's hard and defensible is: *given a Texas address or parcel ID, reliably
pull the deed chain, the CAD parcel geometry/legal, the recorded plat, and the
adjoiners — across 254 counties that each use different vendors.*

Texas county records are fragmented across a handful of vendors. Covering the
**vendors** rather than the counties one-by-one is the leverage:

- **Tyler Technologies / publicsearch.us** — many county-clerk official-records
  search portals. (adapter exists)
- **TrueAutomation / Trueprodigy (propaccess)** — large share of CAD appraisal
  sites. (adapter exists)
- **eSearch / ESearch (Harris-style)** — appraisal districts. (adapter exists)
- **Pritchard & Abbott, Capitol Appraisal, BIS Consulting/ArcGIS** — CAD GIS.
  (Bell/BIS ArcGIS done; pattern generalizes)
- **kofile / county-specific official-records** — clerk deed images.
- **TxGLO GLORI / Land Grant database** — original survey/abstract source of
  truth for senior rights. (not integrated — high value)

**Coverage strategy:** build a **vendor-adapter registry** keyed by detected
portal, plus a **county → {appraisal vendor, clerk vendor, GIS endpoint}
manifest**. Onboarding a new county becomes a config row + adapter reuse, not a
new integration. This is the single highest-leverage investment for "maximal
Texas-county integration."

---

## 3. Optimization roadmap (prioritized)

Ordered by **value ÷ cost**. Each phase = a future `in-progress/` phase doc.

### Phase R-A — Accuracy & trust hardening *(do first; it's what firms buy)*
A survey firm will not stake a boundary on output it can't trust. Accuracy and
provenance beat features.
1. **Per-field schema validation** on every AI response (zod/typed guards per
   `data_category` normalized_value shape) — reject/repair malformed extractions
   instead of coarse array checks. (Closes CODE_REVIEW finding #2.)
2. **Closure-driven self-correction loop** — when traverse closure exceeds
   tolerance, re-prompt the extractor with the failing calls highlighted before
   surfacing to the user. Cheap accuracy win using math you already compute.
3. **Confidence calibration** — track extracted-vs-user-corrected deltas to
   calibrate the A–F grades against reality; surface a single project-level
   "trust score" with the reasons.
4. **Golden-set regression harness** — a fixture set of real deeds/plats with
   known-correct calls; CI asserts extraction accuracy doesn't regress when
   prompts/models change. (Prereq for safely upgrading the model.)
5. **Large-document chunking** — replace the 50K-char truncation with
   section-aware chunking + merge so multi-lot plats aren't silently clipped.

### Phase R-B — County integration scale-out *(the moat)*
1. **Vendor-adapter registry** + `county_data_sources` manifest table (254-row
   target; seed the top 20 metro counties first).
2. **Generalize Bell ArcGIS** into a parameterized CAD-GIS adapter (endpoint +
   layer map per county).
3. **TxGLO integration** — original-survey/abstract lookup (senior-rights
   gold).
4. **Deed-image retrieval** from kofile/Tyler official-records → feed OCR
   pipeline automatically (today many counties only return metadata).
5. **County coverage dashboard** (`/research/coverage` already exists) becomes
   customer-facing: "your county is supported / partial / requested."

### Phase R-C — Cost & latency optimization
1. **Model tiering** — classify/triage with Haiku, reserve Sonnet for
   extraction/legal parsing; measured 3–5× cost cut on classification-heavy
   docs.
2. **Prompt-caching** the long static instruction blocks (Anthropic prompt
   cache) across the ~12 prompts — large recurring-token savings at temp 0.0.
3. **OCR cost guard** — skip Vision tiling when pdf-parse text-layer is
   sufficient (already partially done); add a confidence gate before escalating
   to the expensive 3×3 tile path.
4. **Idempotent re-runs** — hash document content so re-analysis reuses prior
   extractions unless the source changed.
5. **Worker concurrency + backpressure** on the DigitalOcean pipeline; stream
   progress (already streams logs) with per-stage cost telemetry.

### Phase R-D — Productization (sellable SaaS)
1. **Hard multi-tenant isolation** — confirm every research table is org-scoped
   + RLS; storage paths namespaced per org. (Ties into the existing
   `MULTI_TENANCY_FOUNDATION` + `CUSTOMER_PORTAL` specs and `requiredBundle`
   gating already in the route registry.)
2. **Usage metering + billing** — per-project / per-document / per-AI-call
   metering feeding a `research` bundle SKU. `research/billing` page exists as a
   starting point.
3. **Onboarding** — county selection, sample-project walkthrough, "bring your
   first deed" flow.
4. **White-label / firm branding** on exports (title blocks already
   templated via `drawing_templates`).
5. **Export fidelity** — finish DWG/DXF surveyor conventions (layers, line
   types, true-curve geometry, legal-text formatting) to CAD-import quality;
   this is a frequent eval gate for survey buyers.

### Phase R-E — AI differentiation (later)
1. **Drawing-vs-source visual verifier** — finish `DRAWING_COMPARATOR` so the
   system flags "drawn line doesn't match deed call" automatically.
2. **Chain-of-title reasoning** — senior/junior rights, gap/overlap detection,
   adjoiner reconciliation across the deed chain.
3. **Monument/field reconciliation** — ingest field-shot coordinates and
   reconcile record vs measured (closes the loop with the field-data subsystem).
4. **Natural-language project Q&A** over a project's documents + data points.

---

## 4. Technical debt & risks to retire before selling

- **`sharp` PDF rendering fragility** — pin/verify libvips PDF support in the
  deploy image, or move PDF rasterization to a dedicated service; today a build
  without PDF support silently degrades OCR.
- **`DrawingCanvas.tsx` (~110 KB)** — split + test; it's the riskiest
  single file to regress.
- **Coarse AI-response validation** (see R-A.1) — the top correctness risk.
- **County-scraping brittleness** — portal HTML changes break adapters; add
  per-adapter health checks (the `/testing` lab is the natural home) + alerting.
- **Legal/liability framing** — output must be positioned as *research
  assistance for a licensed surveyor*, never a sealed survey; bake disclaimers
  into exports.
- **PII/records handling** — deed records contain names/addresses; confirm
  retention + access policy for a multi-tenant product.

## 5. Pricing/packaging notes (for the user, not a commitment)

- Natural SKU: a **Research bundle** (already modeled via `requiredBundle` in
  the route registry) — per-seat base + metered AI/county-lookup usage.
- County coverage tiers (metro-first) make a clean upsell and align spend with
  the moat investment.
- The `/research/coverage` page is the demo centerpiece: "we already support
  your county."

## 6. Recommended immediate next slices (when prioritized)

Smallest high-value first, each shippable on its own:
1. **R-A.1** per-field AI schema validation (correctness, low cost, no UX).
2. **R-C.2** prompt-caching the static instruction blocks (cost win, no UX).
3. **R-A.2** closure-driven re-prompt (accuracy win using existing math).
4. **R-B.1** vendor-adapter registry + `county_data_sources` manifest
   (unlocks the moat; start with top-20 metro counties).

> These are recommendations. Implementation, sequencing, and the
> productization/pricing decisions in R-D require the user's direction and are
> **not** auto-queued into the stop-hook loop.
