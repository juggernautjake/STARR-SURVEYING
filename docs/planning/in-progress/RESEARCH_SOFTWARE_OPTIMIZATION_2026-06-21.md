# Property-Research Software — Analysis & Optimization Roadmap

**Date:** 2026-06-21
**Author:** automated deep analysis (R1 of `SITEWIDE_UI_CONSISTENCY_AUDIT_2026-06-20.md`)
**Status:** Part I = strategic analysis + roadmap. **Part II (§7–§11) is the
fleshed-out, build-ready specification** for the three user-priority pillars —
self-healing adapters, one-screen site registration, and relevance-scoped
extraction — written so we can start building soon. Every Part II item is a
checkbox so we can verify we cover all of it. Productization/pricing decisions
(R-D) remain user-gated, not auto-queued.

**To activate the build:** move this doc (or the §11 slice list as its own
phase doc) into `docs/planning/in-progress/` and the stop-hook loop will build
the slices in order. Outward-facing slices (live scheduled polling of county
sites, auto-applying scraper changes) are explicitly **GATED** behind a feature
flag + human review — see §9 guardrails.

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

---

# Part II — Build specification (the three priority pillars)

> User directive (2026-06-21): the research subsystem must be **perfect and
> self-healing**. Counties change their websites and our access methods must
> adapt. We need (1) AI that **regularly checks county sites** with Playwright +
> OCR + whatever else helps, detects breakage, and **proposes/auto-applies
> fixes**; (2) a **clean, simple way to register new county / CAD / property /
> deed / plat / legal-description sites** so they're fully integrated and
> AI-scrapable; and (3) AI that is **excellent at weeding** — extracting only
> data about **our subject property and its surrounding/adjoining properties**,
> never unrelated parcels. This part specifies all three so we can build them.

## Slice log

### Slice 4 — §10.2 (deed-call half) Adjoiner extraction from legal prose ✅ (2026-06-21)
`lib/research/adjoiner-extraction.ts` ships `extractDeedCallAdjoiners(legal)` —
pure NLP that pulls adjoiner references out of Texas deed prose and emits
entries shaped like `RelevanceContext.adjoiners[number]` (`source:
'deed_call'`). Five pattern families, each conservative:

  - **Named tracts / properties** — `the John Smith tract`,
    `land owned by Mary Jones`. Filtered through a `COMMON_NOUNS_BLOCKLIST`
    so "the South boundary tract" never plucks "South boundary" as an
    owner.
  - **Lot / Block** — `Lot 7 Block A`, `Lots 4-6 Block C` →
    `legal_reference: 'LOT 7 BLOCK A'`.
  - **Abstract / survey number** — `A-1234`, `Abstract 1234` →
    `legal_reference: 'ABSTRACT 1234'`.
  - **Named survey** — `the J. Smith Survey` → `owner: 'J. Smith'`.
  - **Deed citation** — `Vol. 1234, Pg. 567`, `Doc. 2024-12345` →
    `legal_reference: 'VOL 1234 PG 567'` / `'DOC 2024-12345'`.

Multi-mention dedup collapses repeated references on a normalized
fingerprint (`normalizeOwnerName` from slice 3) and concatenates the
evidence strings so a reviewer can see every location an adjoiner
appeared.

Source-locked with 17 tests in
`__tests__/research/adjoiner-extraction.test.ts`, including a realistic
end-to-end Texas legal description that exercises every pattern family in
one run. 76/76 research tests pass; clean tsc.

Conservative-by-design: false negatives are tolerated, false positives are
bugs. The GIS-adjacency half of §10.2 (polygon-touching query against the
CAD parcel layer) ships in a follow-up slice because it needs either a
pure polygon-intersection algorithm or a network call to the county
ArcGIS endpoint — both deserve their own slice.

### Slice 3 — §10.1 + §10.3 Subject anchor + relevance classification ✅ (2026-06-21)
`lib/research/relevance.ts` ships the pure helpers that decide, for every
extracted datum, whether it's about the **subject** property, an **adjoiner**,
or someone **unrelated** — the AI's "weed through and keep only what matters"
contract from the user directive:

  - `resolveSubjectAnchors(subject)` — ranks the project subject's identities
    strongest-first (`parcel_id` → `geometry_centroid` → `legal_description`
    → `owner` → `address`); strength weights 1.0 → 0.45.
  - `classifyRelevance(candidate, context)` — returns the
    `RelevanceClassification` from the canonical schema. Subject-anchor
    matching walks anchors strongest-first; adjoiner matching falls through
    on parcel_id (0.95) / owner (0.6) / legal_reference (0.7). Returns
    `unknown` when the project has no usable anchor (§10.6 surfaces
    disambiguation to the user); returns `unrelated` when nothing matched.
  - `filterRelevantRecords(records, context)` — batch convenience: classify
    every `CanonicalProperty`, drop unrelated, stamp `relevance` onto each
    kept record. Returns `dropped_count` so the UI can show "we excluded N
    unrelated parcels".

  Normalization helpers handle the cosmetic vendor variance that breaks
  naive equality:
    - `normalizeParcelId('R-00012345')` → `'R12345'` (drops punctuation +
      leading zeros from each numeric run, even after a letter prefix).
    - `normalizeOwnerName('SMITH JOHN & MARY ETUX')` matches
      `'Smith, Mary John'` (drops ETUX/JR/TRUSTEE/INC/&; sorts tokens so
      first/last order doesn't matter).
    - `normalizeAddress(...)` collapses Road/St./Ave/Drive/Blvd/Highway
      variants.
    - `legalReferenceMatches(a, b)` requires (1) at least one shared strong
      token (LOT:42, BLOCK:A, ABSTRACT:1234) AND (2) no conflict on a
      shared key — so `LOT 4 BLOCK A` does NOT match `LOT 7 BLOCK A`.
  Geometry helper: `haversineMeters` + `geojsonCentroid` for the 25 m
  same-parcel bucket on centroid matching.

  Source-locked with 27 tests in `__tests__/research/relevance.test.ts`
  covering anchor ranking, all subject/adjoiner/unrelated/unknown classifier
  branches, normalization round-trips, the legal-reference shared-token
  AND no-conflict semantics, the geometry helper (great-circle + symmetry),
  and `filterRelevantRecords` purity (no input mutation).

  Zero runtime deps; no DB or network calls. Future slice §10.2 builds the
  GIS-adjacency + deed-call adjoiner-resolution that produces the
  `RelevanceContext.adjoiners` array these helpers consume.

### Slice 2 — §7.1–7.4 Registry tables + vendor template seed ✅ (2026-06-21)
`seeds/370_research_adapter_registry.sql` creates the four registry tables
(`research_counties`, `research_data_vendors`, `research_site_adapters`,
`research_county_data_sources`) + the supporting enums
(`research_adapter_status_enum`, `research_site_type_enum`,
`research_coverage_enum`) + `updated_at` triggers. Idempotent
(`CREATE TABLE IF NOT EXISTS`, `ON CONFLICT … DO NOTHING`, `DO $$ … EXCEPTION
WHEN duplicate_object`). Seeds the four working vendor templates
(`bell_cad_arcgis`, `trueautomation_propaccess`, `esearch_cad`,
`publicsearch_clerk`) with their `url_fingerprints` (host/path regexes the §8.2
auto-detect uses), `config_template` (flow steps + selectors for browser-based
vendors; endpoint shapes for arcgis_rest), and `field_map_template`
(`CanonicalFieldMap` shape from §7.5) — so registering a new county that uses
one of these vendors is now a config row, not a code change. Seeds the 10
Texas counties already integrated or near-term targets (Bell + the top-9
metros) so the FKs resolve immediately; the full 254-county seed lands in a
future small data slice. Source-locked with 12 tests in
`__tests__/research/adapter-registry-schema.test.ts` covering table+column
shape, idempotency, enum membership, and per-template field-map content (Bell
must map `parcel_id` / `owner.display_name` / `acreage` / `legal.text`).

### Slice 1 — §7.5 Canonical schema ✅ (2026-06-21)
`lib/research/canonical-schema.ts` ships the pure TypeScript ontology every
vendor adapter will map INTO: `CanonicalProperty` + sub-shapes (`CanonicalOwner`,
`CanonicalAddress`, `CanonicalLegal`, `CanonicalDeedReference`,
`CanonicalPlatReference`, `CanonicalParcelGeometry`, `CanonicalValuation`), the
attribution wrapper (`CanonicalValue<T>` / `CanonicalAttribution`) so we never
lose evidence chains, the relevance-tagging contract for §10
(`RelevanceTag`, `RelevanceContext`, `RelevanceClassification`,
`tagRelevance()`), and the JSON-serializable vendor-field-map shape
(`CanonicalFieldMap`, `CanonicalFieldMapping`) that §7.2 stores in
`data_vendors.field_map_template`. Source-locked with 14 tests in
`__tests__/research/canonical-schema.test.ts` (contract surface + relevance-tag
membership + transform-set membership + vendor membership + pure helpers).
Zero runtime deps; importable from server routes, workers, and tests freely.
**No DB changes in this slice** — registry tables (§7.1–7.4) land next.

## 7. Shared foundation — adapter & coverage data model

Everything below sits on a small registry. Build this first; the three pillars
all consume it.

- [x] **7.1 `research_counties`** ✅ (2026-06-21, Slice 2) — table created;
  seed includes the 10 Texas counties already integrated or near-term
  targets (Bell + top-9 metros). Full 254-county seed deferred to a small
  data-only follow-up so this schema migration stays auditable.
- [x] **7.2 `research_data_vendors`** ✅ (2026-06-21, Slice 2) — table created
  with all four working vendor templates seeded (`bell_cad_arcgis`,
  `trueautomation_propaccess`, `esearch_cad`, `publicsearch_clerk`) including
  url_fingerprints + config_template + CanonicalFieldMap-shaped
  field_map_template.
- [x] **7.3 `research_site_adapters`** ✅ (2026-06-21, Slice 2) — table created
  with `research_adapter_status_enum` (draft/active/degraded/broken/quarantined
  /retired) and `research_site_type_enum`. UNIQUE(county_id, site_type) by
  default; relaxable when a county legitimately needs two portals of the
  same type.
- [x] **7.4 `research_county_data_sources`** ✅ (2026-06-21, Slice 2) — table
  created with `research_coverage_enum`. Bell CAD seeded as 'partial'
  (CAD-only, no clerk/plat). `/admin/research/coverage` repoint lands when
  that route's next slice ships.
- [x] **7.5 Canonical schema** ✅ (2026-06-21, Slice 1) —
  `lib/research/canonical-schema.ts` ships the pure TypeScript ontology every
  adapter maps INTO + `tagRelevance()` helper + JSON-serializable
  `CanonicalFieldMap` shape for §7.2 templates. Source-locked
  (`__tests__/research/canonical-schema.test.ts`, 14 tests). Per-adapter
  re-expression onto the schema is verified in a future slice once the
  registry tables (§7.1–7.4) land — the schema itself covers every field the
  four working adapters produce.

## 8. Pillar A — One-screen site registration

**Goal:** a surveyor (or us) registers a new county portal in minutes, confirms
a real property extracts correctly, and it auto-enrolls into health monitoring.

- [ ] **8.1 Registration route + wizard** — `/admin/research/sites` (list) and
  `/admin/research/sites/new` (wizard). Step 1: paste portal URL, pick county +
  `site_type`.
- [ ] **8.2 Vendor auto-detection** — match the pasted URL/host (and a quick
  fetched-HTML fingerprint) against `data_vendors.url_fingerprints`. On match,
  **pre-fill** `config` + `field_map` from the vendor template (this is the
  reuse leverage — most new counties are an existing vendor with new params).
  Show "Detected: Tyler / publicsearch.us — reusing template" with the few
  county-specific params left to fill (client id, court/precinct, layer ids).
- [ ] **8.3 AI site probe** — for unknown vendors (or to verify a known one),
  an agent drives Playwright: open the site, locate the **search form**, submit
  the test query, identify the **result list** and **detail page**, and read the
  available fields (DOM + OCR for canvas/image-rendered portals like some
  ArcGIS/printed-record viewers). Output: a proposed `config` (selectors/
  endpoints/flow) + proposed `field_map` onto the canonical schema.
- [ ] **8.4 Test-property confirm** — user supplies a known address/parcel; the
  draft adapter runs end-to-end and shows extracted fields **side-by-side with
  the live page** (Playwright screenshot + parsed values) for the user to
  confirm/correct each mapping. Inline editing of a selector/field re-runs the
  probe on that field only.
- [ ] **8.5 Save + auto-enroll** — on confirm: adapter saved `active`; the test
  property is stored as the adapter's **canary golden record** (§9.2); the
  `county_data_sources` coverage rollup updates; the adapter appears on the
  coverage dashboard.
- [ ] **8.6 Generic Playwright fallback** — for portals with no vendor match,
  §8.3's probe builds a bespoke `browser_playwright` adapter from the captured
  flow (recorded steps + selectors), so even oddball county sites are
  registrable without code changes.
- [ ] **8.7 Acceptance** — (a) registering a known-vendor county = pick county +
  paste URL + 1–2 params + confirm test property, < 5 min, **no code change**;
  (b) an unknown portal is registrable via probe + confirm; (c) every saved
  adapter has a canary and a coverage row.

## 9. Pillar B — Self-healing monitoring & auto-repair

**Goal:** AI regularly checks every registered site, detects when a county
changed its website / our access broke, diagnoses the change, and
proposes (or, when safe, auto-applies) an updated adapter — so coverage heals
itself.

- [ ] **9.1 Three-layer change detection** per adapter run:
  - **Structural** — HTTP status + a DOM-structure hash (stable subset:
    form/anchor/table skeleton) vs the recorded baseline. Divergence → flag.
  - **Visual** — Playwright screenshot vs baseline; AI-vision compares "same
    page/layout?" (catches CSS/redesign + captcha/interstitial walls). OCR the
    page when it's image/canvas-rendered.
  - **Semantic/data** — run the real extraction against the canary and compare
    to the golden record. Missing/changed canonical fields → strongest breakage
    signal.
- [ ] **9.2 Canary golden records** — `adapter_canaries` (`adapter_id`,
  `query_input`, `expected_fields` JSONB, `baseline_dom_hash`,
  `baseline_screenshot_ref`, `captured_at`). Seeded at registration (§8.5);
  re-baselined on approved repairs.
- [ ] **9.3 `adapter_health_checks`** — timestamped results (`adapter_id`,
  `ran_at`, `status` healthy/degraded/broken, `layer_results` JSONB, `diff_summary`,
  `screenshot_ref`, `cost_tokens`). Powers history + alerting.
- [ ] **9.4 AI diagnose + repair agent** — on a failed check: load the current
  page (Playwright snapshot + screenshot + DOM), compare to last-known-good
  `config`, **diagnose the change** (e.g. "search moved GET→POST", "result
  table column renamed", "now requires session cookie", "added captcha"),
  **propose an updated `config`/`field_map`**, and **test the proposal against
  the canary**. Store as `adapter_change_proposals` (`adapter_id`, `diff`,
  `rationale`, `confidence`, `canary_test_result`, `status`
  proposed/approved/rejected/applied).
- [ ] **9.5 Apply policy (GATED)** — a proposal that **passes the canary golden
  check** with confidence ≥ threshold may **auto-apply** *only when the
  `RESEARCH_SELF_HEAL_AUTOAPPLY` flag is on*; otherwise it waits in a review
  queue. All applies (auto or manual) are versioned + reversible (keep prior
  `config`), and logged to the audit trail. Default: **review-required**.
- [ ] **9.6 Failure-triggered self-heal** — when a *live* extraction fails
  mid-project, quarantine the adapter (`status=quarantined`), run §9.4
  immediately, and surface "we're repairing <county> — your run will retry"
  rather than failing silently.
- [ ] **9.7 Scheduled cadence (GATED)** — a cron (`/api/cron/adapter-health` or
  the DO worker) checks adapters by `metro_tier` (tier-1 daily, others weekly),
  jittered + rate-limited per host. Behind `RESEARCH_SELF_HEAL_SCHEDULE` flag so
  we don't hammer government sites until we choose to. Respect robots/ToS +
  per-host concurrency caps (§ guardrails).
- [ ] **9.8 Health dashboard** — extend `/admin/research/coverage`: per county ×
  site_type health (healthy/degraded/broken), pending repair proposals with a
  one-click review (diff + canary result + approve/reject), and last-checked
  timestamps. This is also the customer-facing "is my county working" view.
- [ ] **9.9 Guardrails (outward-facing — non-negotiable)** —
  (a) per-host rate limit + backoff + jitter; (b) respect robots.txt/ToS, honor
  blocks; (c) a global kill-switch env flag; (d) **never** auto-solve captchas
  or auth — flag for human; (e) all auto-applies reversible + audited;
  (f) PII from records is access-controlled + retention-bounded.
- [ ] **9.10 Acceptance** — simulate a site change (swap a selector / move an
  endpoint on a fixture portal): the scheduled check flips the adapter to
  `broken`, the agent produces a proposal that **passes the canary**, and (flag
  on) it auto-applies + re-baselines, or (flag off) it lands in the review queue
  with a clear diff. No silent breakage.

## 10. Pillar C — Relevance-scoped extraction (subject + adjoiners only)

**Goal:** from any document or portal page — which often contain dozens of
unrelated parcels — extract **only** data about the subject property and its
surrounding/adjoining properties, and tag every datum's relevance.

- [x] **10.1 Subject anchor** ✅ (2026-06-21, Slice 3, partial) —
  `resolveSubjectAnchors()` in `lib/research/relevance.ts` ranks every
  available identity strongest-first (parcel_id → centroid → legal → owner
  → address). The DB persistence of the anchor on `research_projects` /
  `project_subject` lands in a subsequent slice that wires the helpers into
  the project route handlers; the contract surface (function signature
  + RelevanceContext shape) is locked first so route changes don't churn
  the algorithm.
- [~] **10.2 Adjoiner resolution** — deed-call half ✅ (2026-06-21, Slice 4):
  `lib/research/adjoiner-extraction.ts` covers named tracts / Lot-Block /
  abstract / named survey / deed-citation patterns. GIS-adjacency half
  (polygon-touching query) + `project_adjoiners` table persistence land
  in a follow-up slice.
- [x] **10.3 Relevance-gated extraction** ✅ (2026-06-21, Slice 3, partial) —
  `classifyRelevance()` + `filterRelevantRecords()` in
  `lib/research/relevance.ts` are the contract every extractor will use to
  tag a datum subject/adjoiner/unrelated/unknown. Adding the `relevance` +
  `parcel_ref` columns to the existing `extracted_data_points` table + the
  AI-prompt change that instructs the model to ask for the tag at extraction
  time lands in a follow-up slice that touches the live pipeline.
- [ ] **10.4 Two-pass for large multi-parcel docs** — for subdivision plats /
  multi-tract deeds: **Pass 1 (cheap, Haiku)** segments the doc and locates only
  the regions/lots matching the relevance set; **Pass 2 (Sonnet)** deep-extracts
  only those segments. Avoids both cost blow-up and irrelevant-data bleed on
  100-lot plats.
- [ ] **10.5 Spatial result filtering** — when a portal returns many parcels
  (e.g. a street search → 30 hits), rank by proximity/identity to the subject
  anchor and pursue only the subject + true adjoiners; discard the rest before
  any expensive deep analysis.
- [ ] **10.6 Disambiguation surfacing** — when multiple parcels plausibly match
  the subject (common owner, similar address) and the anchor can't decide,
  **surface the ambiguity to the user** with the candidates rather than guessing
  silently; the user's pick strengthens the anchor.
- [ ] **10.7 Acceptance** — given a multi-parcel plat fixture, the system
  extracts calls for the subject + its adjoiners and **provably excludes**
  unrelated lots; every extracted datum carries a `relevance` tag and
  `parcel_ref`; an audit view shows what was excluded and why.

## 11. Build order (slice sequence)

Smallest-meaningful-first, each independently shippable + testable:

1. **§7.1–7.5** registry + canonical schema + seed existing adapters as vendor
   templates. *(foundation; no outward calls)*
2. **§10.1–10.3** subject anchor + adjoiner resolution + relevance tagging.
   *(biggest extraction-quality win; mostly internal)*
3. **§8.1–8.5** registration wizard + vendor auto-detect + test-property
   confirm. *(unlocks no-code county onboarding)*
4. **§9.1–9.4 + 9.8** health-check framework + canaries + diagnose/propose +
   dashboard, **review-required** (flags off). *(self-healing scaffolding, safe)*
5. **§10.4–10.6** two-pass + spatial filter + disambiguation. *(polish
   relevance at scale)*
6. **§8.6** generic Playwright fallback for unknown vendors.
7. **§9.5–9.7** auto-apply + scheduled polling — **GATED**, enable per §9.9
   guardrails only after 1–5 are proven. *(the outward-facing, riskiest bits
   last)*

> Build 1–6 freely; **7 is the only part that touches the outside world on a
> schedule / mutates scrapers automatically** — keep it flagged off until we
> deliberately turn it on per the guardrails.
