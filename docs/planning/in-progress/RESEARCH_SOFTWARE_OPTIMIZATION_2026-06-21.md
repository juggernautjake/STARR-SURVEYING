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

### Slice 16 — §9.6 Failure-triggered self-heal planner ✅ (2026-06-21)
`lib/research/self-heal-planner.ts` ships `planSelfHealResponse(failure,
adapter, recent, opts?)` — the pure orchestrator that turns a live
extraction failure into a coordinated response: quarantine the adapter,
log a failure-triggered health-check row, queue the §9.4 diagnose-and-
repair agent, set the right retry strategy, and surface a friendly
user-facing message instead of failing silently.

  Decision walk (in order):
    1. Adapter already `quarantined` / `broken` → don't re-quarantine,
       but still log the failure (history reflects every real hit) +
       trigger diagnose unless the scheduled tick is already running.
       Retry waits for the §9.4 proposal to be approved.
    2. Adapter `retired` / `draft` → live pipeline shouldn't have used
       it; flag ops, no quarantine, retry is manual.
    3. Active / degraded — the standard self-heal trigger:
       - quarantine
       - log + trigger diagnose
       - **wall hit** (captcha / auth / 401 / 403 / 429 / rate limit
         keyword) → escalate to ops + route to human review
       - **chronic** (≥3 broken/error checks in the last 7 days) →
         same review-path
       - otherwise → retry after the diagnose check completes
       - friendly user-facing message tailored to the case
         ("captcha wall", "repeated failures", "temporary issue")
         with the county + site-type label woven in when available.

  Time + window inputs are parameters (`failure.occurred_at`,
  `recentWindowHours`), no `Date.now()` at module scope — so tests
  freeze time deterministically and the §9.8 dashboard can preview
  "what would happen if this adapter failed right now?"

  Source-locked with 12 tests in
  `__tests__/research/self-heal-planner.test.ts` covering: standard
  active-adapter quarantine + diagnose, scheduled-tick deference,
  captcha / auth / rate-limit / 401-403-429 escalation, chronic-
  failure detection within the look-back window, custom
  `chronicFailureCount`, already-quarantined no-re-quarantine + still-
  log path, broken/retired/draft handling, and friendly-message
  composition (county label woven in, retry suffix always present).

241/241 research tests pass; clean tsc.

### Slice 15 — §9.7 (kernel) Health-check scheduler ✅ (2026-06-21)
`lib/research/health-check-scheduler.ts` ships
`planScheduledChecks(adapters, now, policy?)` — the pure decision
function the §9.7 cron (or DO worker, or manual "run checks now"
button) wraps. Given the registered adapters + their last-verified
timestamps + the active policy, returns exactly which adapters need a
check NOW, ranked by priority, capped by host + batch.

  Three result buckets:
    - `scheduled` — adapters the caller should hit immediately, with
      `reason` (`never_checked` / `tier_due` / `failed_priority`)
      and the hours-since-last gap for the §9.8 dashboard.
    - `deferred` — eligible adapters bumped by `per_host_concurrency_cap`
      or `batch_cap` (cron picks them up on the next tick — §9.9
      guardrail against hammering county portals).
    - `skipped` — `draft` / `retired` status, OR cadence not yet
      reached.

  Priority sort (high to low):
    1. `failed_priority` (1000) — `broken` / `quarantined` adapters
       jump the queue regardless of cadence. §9.6 wires the
       failure-triggered self-heal into this path.
    2. `never_checked` (500) — adapters that registered but haven't
       had their first check.
    3. `tier_due` (100 + overdue hours) — more-overdue adapters rank
       above just-due ones so the backlog drains first.
    4. Alphabetical adapter_id as the final tiebreaker so two
       identical runs produce identical schedules.

  `DEFAULT_SCHEDULER_POLICY` matches the spec:
    - tier-1 cadence 24 h, tier-2 84 h (~twice-weekly), tier-3 168 h
      (weekly), tier-4 336 h (bi-weekly)
    - `per_host_concurrency_cap` = 2
    - `batch_cap` = 50
    - `jitter_seconds` = 600
    - `skip_statuses` = {draft, retired}

  Time injection: `now` is a parameter, not `new Date()` at module
  scope, so vitest can freeze it for deterministic assertions.

  Source-locked with 16 tests in
  `__tests__/research/health-check-scheduler.test.ts` covering cadence
  per-tier, null-tier defaults to 4, never-checked + status-skip
  paths, broken/quarantined queue-jumping, host + batch caps,
  more-overdue-first ordering, alphabetical-id tiebreaker, and the
  `DEFAULT_SCHEDULER_POLICY` locked invariants (strictly-increasing
  cadence, draft/retired skipped, conservative concurrency).

228/228 research tests pass; clean tsc.

### Slice 14 — §7.1 Full 254-county Texas seed ✅ (2026-06-21)
`seeds/372_research_counties_texas_full.sql` completes §7.1's "Seed all
254 up front (static data)" acceptance. Every odd Texas county FIPS
48001-48507 is present, tagged by metro tier 1-4 for the §9.7 scheduled
health-check cadence (tier 1 = daily, tier 4 = bi-weekly when §9.7
lights up).

  - Tier 1 (12 rows): the top metros ≥1M MSA pop (Harris, Dallas,
    Tarrant, Bexar, Travis, Collin, Denton, Fort Bend, Hidalgo,
    El Paso, Williamson, Montgomery).
  - Tier 2 (22 rows): mid metros 200K-1M (Cameron, Bell, Brazoria,
    Galveston, Lubbock, Nueces, McLennan, Webb, Brazos, Smith, Ellis,
    Hays, Johnson, Comal, Jefferson, Tom Green, Taylor, Midland,
    Ector, Wichita, Potter, Randall).
  - Tier 3 (44 rows): small cities 50K-200K.
  - Tier 4 (176 rows): rural.

  Idempotent — re-running over slice 2's seed-370 10-county subset is
  safe (those FIPS skip via `ON CONFLICT (fips) DO NOTHING`).

  Source-locked with 7 tests in
  `__tests__/research/counties-seed.test.ts`:
    - Exactly 254 rows
    - Every odd FIPS in `48001..48507` present (catches typos +
      missing counties)
    - Every key metro by name
    - Tier 1 covers the canonical top-10 metros
    - Tier values are 1-4 only
    - Transaction wrap + idempotency
    - No duplicate FIPS codes

  Registering Hood County (FIPS 48221) or Llano County (FIPS 48299)
  through the §8 wizard now just resolves the existing row instead
  of failing on a missing FK.

213/213 research tests pass; clean tsc.

### Slice 13 — §10.4 (first pass) Document segmentation ✅ (2026-06-21)
`lib/research/document-segmentation.ts` ships
`segmentMultiParcelDocument(text, context, opts?)` — the cheap first
pass that lets the expensive deep extractor only run on the document
slices that matter.

  Large legal docs (100-lot plats, multi-tract deeds, bulk clerk
  dumps) would blow up token cost AND bleed unrelated parcels into
  the boundary if we naively fed the whole thing at the AI extractor.
  This pass splits the document on deterministic deed-call markers
  (BEGINNING, `LOT N BLOCK X`, TRACT N, A-NNNN, Vol/Pg), scores each
  segment by overlap with the relevance context, and drops everything
  below the score floor.

  Key correctness fix during testing: tokens are emitted as composite
  identifiers (`LOT-BLOCK:4-A`, `ABSTRACT:1234`, `DOC:VOL-100-PG-4`)
  — never bare `LOT:4` or `BLOCK:A` alone — so two parcels in the
  same subdivision (Lot 4 and Lot 30 of Block A) don't match each
  other on the shared BLOCK token. Composite keys carry the
  identifying signal; bare halves don't.

  Scoring:
    - subject-token overlap = 1.0 per hit
    - adjoiner-token overlap = 0.5 per hit
    - normalized by `(refTokens.size + 1)` so a long segment with
      many random references can't dominate by hit-volume.
    - markerless fallback: treat the whole document as one segment.

  Output: top-N segments sorted high-to-low with byte-offset spans
  pointing back into the original document so the §10.4 expensive
  pass can re-locate them, plus the slice-4 references the segment
  contains (lets the deep extractor anchor on the already-extracted
  signals).

  Source-locked with 9 tests in
  `__tests__/research/document-segmentation.test.ts` including a
  6-parcel subdivision-plat fixture that exercises: BEGINNING-marker
  segmentation, subject-first ranking, adjoiner-promotion, score-
  floor dropping, limit honoring, slice-4 reference attachment, byte-
  offset span integrity, empty-input safety, markerless-singleton
  fallback, and the "no overlap = nothing kept" path.

206/206 research tests pass; clean tsc.

### Slice 12 — §10.5 + §10.6 Spatial filter + disambiguation ✅ (2026-06-21)
`lib/research/spatial-filter.ts` ships the cost + correctness gate that
sits in front of the §10.4 deep extractor: when a portal returns N
parcels we keep only the subject + its adjoiners, ranked by composite
relevance, and surface disambiguation to the user when the leader isn't
clearly winning.

  - `rankAndFilterCandidates(candidates, context, opts?)` — composes
    slice 3's `classifyRelevance` with a proximity bonus (polygon-to-
    polygon when both shapes are present via slice 5's
    `arePolygonsAdjacent`; centroid-to-centroid haversine fallback).
    Composite score = `confidence × tag_weight + proximity_bonus`,
    where the tag weights are `subject=1.0`, `adjoiner=0.7`,
    `unknown=0.3`, `unrelated=0`. Proximity bonus = +0.15 at ≤50 m,
    linearly falling to 0 at ≥500 m. Drops everything below
    `scoreFloor` (default 0.05); cap with `limit` for cost control.
  - `disambiguateSubject(ranked, opts?)` — eligible candidates are
    `subject` + `unknown` tagged (adjoiners are surrounding, not
    target). Auto-pick when the leader's absolute score ≥ 0.6 AND
    the runner-up is more than 0.15 below; otherwise return `chosen:
    null` + the top-N candidates for the UI to surface to the user.
    The user's pick strengthens the anchor for the rest of the
    project.
  - `rankAndDisambiguate(candidates, context, …)` — convenience
    wrapper that runs both in sequence so the route handler can call
    one function and get `{ ranked, disambiguation }` back.

  Source-locked with 13 tests in
  `__tests__/research/spatial-filter.test.ts`: drops `unrelated`,
  subject-above-adjoiner ordering, limit honoring, proximity-bonus
  re-ranking when geometry is available, empty-result on score-floor
  miss, input immutability, disambiguation auto-pick + surfacing +
  no-eligible-candidate cases, `maxCandidates` cap, custom
  `ambiguityGap`, and the composed `rankAndDisambiguate` flow.

196/196 research tests pass; clean tsc.

### Slice 11 — §9.5 + §9.9 Apply policy + reversible swap ✅ (2026-06-21)
`lib/research/apply-policy.ts` ships the safe-by-default policy engine that
decides what happens to a §9.4 change proposal — auto-apply, queue for human
review, or reject — plus the pure state-transition helpers that perform the
swap reversibly per §9.9.

  - `decideApplyAction(proposal, policy?)` → `{ action, rationale }`.
    Action is one of `auto_apply` / `queue_for_review` / `reject`. Strict
    walk:
      1. canary failed + `require_canary_pass` → **reject**
      2. confidence below the reviewer threshold → **reject**
      3. canary not yet tested → **queue_for_review**
      4. `RESEARCH_SELF_HEAL_AUTOAPPLY` flag OFF → **queue_for_review**
      5. confidence below the auto-apply threshold → **queue_for_review**
      6. otherwise → **auto_apply**.
  - `DEFAULT_APPLY_POLICY` — locked safe-by-default: `autoapply_enabled=
    false`, `autoapply_confidence_threshold=0.9`,
    `reviewer_confidence_threshold=0.5`, `require_canary_pass=true`. The
    source-lock test asserts these values so flipping the default to
    auto-apply is a deliberate change, not an accident.
  - `applyProposalToAdapter(current, proposal)` → `{ next,
    snapshot_for_rollback }`. Pure transform: returns the next adapter
    state matching the proposal AND a deep-cloned snapshot of the
    current state (the caller writes this to `prior_config` /
    `prior_field_map` on the proposal row so rollback is one row update).
  - `rollbackProposal(proposal)` → returns the captured prior state as a
    deep clone. Restores the adapter to its pre-apply config when a
    repair turns out to be wrong.

  Input sanitization: confidence clamps to `[0,1]` with NaN → 0 → reject
  path so a buggy agent that emits Infinity or NaN can't game the policy.
  All transforms are JSON-clone-based — no input mutation — so the
  caller can pass the live db row without defensive copying.

  Source-locked with 17 tests in `__tests__/research/apply-policy.test.ts`
  covering: default-policy safety (no auto-apply, canary-failed rejected,
  low-confidence rejected, canary-pending queued), flag-on auto-apply
  path, the lenient `require_canary_pass=false` override, confidence
  clamping + NaN handling, snapshot-for-rollback equality, input
  immutability, deep-clone independence of the rolled-back result, and
  the locked `DEFAULT_APPLY_POLICY` invariants.

183/183 research tests pass; clean tsc.

### Slice 10 — §8.2 ↔ §8.5 Bridge: prefillAdapterFromTemplate ✅ (2026-06-21)
`lib/research/adapter-draft.ts` ships the pure bridge between slice 6's
vendor detection and slice 2's adapter row. Given a matched vendor
template + the pasted URL + the chosen county/site_type, returns the
`DraftAdapter` shape the §8.1 wizard saves on confirm — **with the
vendor template's `{placeholders}` already substituted from the URL**.

  - `extractUrlParts(url)` — pulls scheme / host / subdomain / parent
    domain / pathname / first path segment / query params out of any
    URL (bare hosts get a synthetic scheme added).
  - `prefillAdapterFromTemplate({vendor, base_url, county_id,
    site_type, config_overrides?})` — substitutes `{subdomain}` /
    `{parent_domain}` / `{base_url}` / `{?param}` etc. in every
    string leaf of the vendor's `config_template`, then layers
    user-supplied `config_overrides` on top (deep-merge so a user can
    override a single nested leaf without restating the whole tree).
    `field_map_template` is carried through verbatim. Bespoke
    (vendor = null) is supported for §8.3-probe adapters.
  - `unresolvedPlaceholders(config)` — returns the unique placeholder
    names a user still needs to fill in (the §8.4 confirm step
    prompts on these).

  Concrete win: a user pasting
  `https://bell.publicsearch.us/search/landrecords` and picking the
  Tyler publicsearch template gets a draft adapter whose flow step
  URL is already `https://bell.publicsearch.us/search/landrecords` —
  zero code change. Registering Hood County is then "paste the URL,
  pick Tyler publicsearch, pick clerk_deeds, confirm".

  Source-locked with 13 tests in
  `__tests__/research/adapter-draft.test.ts` covering URL-part
  extraction (scheme/host/subdomain/parent/path/params + bare hosts +
  unparseable + 2-label hosts), draft construction for known vendor +
  bespoke, placeholder substitution in deeply-nested configs,
  unknown-placeholder preservation, field-map passthrough, override
  deep-merge, and `unresolvedPlaceholders` ordering.

  166/166 research tests pass; clean tsc. Fully pure — no DB or
  network — so the wizard route can call it freely from both the
  client (for the preview) and the server (on save).

### Slice 9 — §9.2 + §9.3 + §9.4 Health-check data model ✅ (2026-06-21)
`seeds/371_research_health_check_tables.sql` creates the three tables the
self-healing loop writes into. All idempotent, all FK'd back to the
`research_site_adapters` table from slice 2.

  - **`research_adapter_canaries` (§9.2)** — golden records captured at
    registration. Stores `query_input`, `expected_fields` (the slice-7
    canary-diff target), `baseline_dom_hash` + `baseline_dom_skeleton`
    (the slice-8 fingerprint), `baseline_screenshot_ref` (the §9.1
    visual-layer baseline, hooked in when Playwright lands), plus
    `is_active` so old baselines are kept on approved re-baseline
    instead of overwritten — full history in a partial index keyed on
    the active row.
  - **`research_adapter_health_checks` (§9.3)** — append-only timestamped
    check runs. `layer_results` is a structured jsonb rollup of the
    three §9.1 layers (the slice-7 + slice-8 outputs go here today; the
    visual layer joins when ready). `cost_tokens` + `duration_ms` track
    AI spend per check so the §9.7 scheduled cadence (once flagged on)
    is budgetable. Partial index on `(status IN degraded/broken/error)`
    so the §9.8 dashboard's "show me what's failing" query is O(N
    failures), not O(N runs).
  - **`research_adapter_change_proposals` (§9.4)** — AI-diagnosed repair
    proposals. `prior_config` + `prior_field_map` are snapshotted so any
    apply (auto or manual) is reversible per the §9.9 guardrails.
    `confidence` + `canary_test_passed` drive the §9.5 auto-apply gate
    (flag-gated). Lifecycle enum:
    `proposed` → `approved`/`rejected` → `applied`/`superseded`.

  Two new enums: `research_health_status_enum`
  (`healthy`/`degraded`/`broken`/`no_record`/`error`),
  `research_change_proposal_status_enum`
  (`proposed`/`approved`/`rejected`/`applied`/`superseded`).

  Health-check rows are append-only (no `updated_at` trigger — `ran_at`
  is the timeline anchor; preserving that integrity matters for the
  audit story). Canaries + proposals carry the `updated_at` trigger that
  was already created in slice 2.

  Source-locked with 16 tests in
  `__tests__/research/health-check-schema.test.ts` covering each table's
  column set, enum membership, FK + ON DELETE rules, the three partial
  indexes (active canary, failure runs, pending proposals),
  transaction-wrap, idempotency ladders, and the "don't redefine
  research_set_updated_at" hygiene check.

153/153 research tests pass; clean tsc.

### Slice 8 — §9.1 (structural-layer) DOM fingerprint ✅ (2026-06-21)
`lib/research/dom-fingerprint.ts` ships `fingerprintHtml(html)` +
`diffFingerprints(was, now)` — the structural half of §9.1's three-layer
detection. Pairs with slice 7's semantic-layer canary diff so the §9.3
health-check writer can stamp two consistent severity buckets per run.

  `fingerprintHtml` produces:
    - `hash`           — hex SHA-256 of the canonical skeleton string.
    - `skeleton`       — the canonicalized token sequence (one
                         structural element per line, attributes sorted
                         alphabetically), surfaced in the §9.8 dashboard
                         so reviewers can see exactly what changed.
    - `element_count`  — how many structural elements we captured;
                         the §9.4 agent uses this to detect "page now
                         has 0 forms" without re-parsing.

  Captures: `form`, `input`, `select`, `option`, `textarea`, `button`,
  `table`, `thead`, `tbody`, `tr`, `th`, `td`, `a`, `nav`, `header`,
  `footer`, `main`, `section`, `article`, `aside`, `iframe`, `label`,
  `fieldset`. Keeps only stable attributes (`name`, `id`, `type`, `role`,
  `href`, `action`, `method`, `value`, `placeholder`, `data-testid`,
  `data-cy`, `data-test`, `data-qa`). Drops scripts/styles/comments
  before tokenizing.

  `diffFingerprints(was, now)` returns `{ identical, similarity, removed,
  added, severity }` — Jaccard similarity on the skeleton-token multiset
  → `healthy` (≥0.95) / `degraded` (0.7–0.95) / `broken` (<0.7).
  Thresholds tuned so a small portal tweak (a few elements added or
  renamed) trips `degraded` while a complete redesign or a captcha
  interstitial replacing the search form trips `broken`.

Source-locked with 17 tests covering: text-content / random-class-hash /
whitespace / comment / script-block / attribute-order invariance;
breakage detection on disappearing fields, renamed inputs, changed form
actions, added table columns; severity bucketing for identical / small-
change / completely-different pages; per-token added/removed
diff for the §9.4 repair agent; and robustness on empty / malformed
HTML.

135/135 research tests pass; clean tsc.

**§9.1 is now structurally + semantically complete at the pure-logic
layer.** Visual layer (Playwright screenshot + AI-vision diff) lands
when the §8.3 site-probe Playwright harness is up — until then the §9.3
health-check writer can call slices 7 and 8 to produce a two-layer
verdict.

### Slice 7 — §9.1 (semantic-layer) Canary diff ✅ (2026-06-21)
`lib/research/canary-diff.ts` ships `diffAgainstCanary(extracted, canary)` —
the **strongest breakage signal** in §9.1's three-layer health-check stack.
Run the live adapter against its canary input, hand the result to this
function, and get back exactly what changed since registration.

  Result shape:
    - `produced_record`  — false when the adapter handed back null /
       missing parcel_id; severity is always `broken` in that case.
    - `missing_fields`   — canary had it, adapter lost it.
    - `changed_fields`   — value drift (with path / was / now / reason).
    - `new_fields`       — adapter returns more data than the canary
       (informational, not bad).
    - `severity`         — `healthy` / `degraded` / `broken`. A change
       to any path in `BREAKING_PATHS` (parcel_id, owner.display_name,
       legal.text, situs/mailing.formatted) escalates degraded → broken.
    - `summary`          — human-readable single-line for the §9.8
       dashboard ("broken: 2 missing (owner.display_name, legal.text)").

  Path-aware normalization (reuses slice 3's helpers):
    - parcel_id   — through `normalizeParcelId` so cosmetic vendor
                    variance ("R0012345" → "R12345") doesn't trip the
                    diff.
    - owner.display_name — through `normalizeOwnerName` so "JOHN SMITH
                    ETUX" matches "SMITH JOHN".
    - numbers     — small-epsilon comparison (<0.5% diff is rounding).
    - wrapped fields — unwraps `CanonicalValue<T>` so an adapter that
                    started attaching attribution to its outputs
                    compares cleanly against a bare canary.

  Pure — no DB, no network, no Playwright. The §9.4 diagnose-and-repair
  agent will consume this diff as its strongest input signal; the §9.3
  health-check writer will stamp the typed `CanaryFieldChange[]` straight
  into the (forthcoming) `adapter_health_checks` jsonb column.

Source-locked with 14 tests in `__tests__/research/canary-diff.test.ts`
covering all three severity buckets, the cosmetic-variance no-flag cases,
non-critical field degradation, breaking-field escalation, wrapped-field
unwrapping, no-record handling, and summary text formatting.

118/118 research tests pass; clean tsc.

### Slice 6 — §8.2 Vendor auto-detection ✅ (2026-06-21)
`lib/research/vendor-detection.ts` ships `detectVendor(url, vendors)` — the
pure matcher that turns a pasted portal URL into the right vendor
template, the leverage point that makes "registering a new county is a
config row, not a code change" actually true.

  - Reads the `url_fingerprints` JSONB shape seeded in slice 2 (`host_re`
    + `path_re` rule types, regex-based, case-insensitive).
  - Returns the strongest match (best) PLUS the full ranked list so the
    §8 wizard can show a "we think it's Tyler publicsearch.us, but it
    could also be a generic ArcGIS adapter" disambiguation when more
    than one template matches.
  - Score = number of fingerprints that matched + the template's
    optional `priority`. A vendor that matches host AND path
    (ArcGIS REST query URL) beats one that matches host only.
  - Robust to malformed regexes (try/catch per fingerprint), bare hosts
    without a scheme, mixed-case URLs, empty fingerprint arrays, and
    unparseable URLs.
  - `vendorKeyAsCanonical(key)` narrows the matched key to the
    `CanonicalSource` union from slice 1 so the §8.5 save path stamps
    a typed value on the adapter row.

Source-locked with 15 tests in
`__tests__/research/vendor-detection.test.ts` covering each of the four
seeded vendor templates (Bell ArcGIS / TrueAutomation / eSearch /
publicsearch), multi-fingerprint scoring, ranking when multiple
templates match the same URL, unparseable input, case-insensitive
hosts, and bare-host parsing.

104/104 research tests pass; clean tsc.

### Slice 5 — §10.2 (GIS-adjacency half) Polygon-touching adjoiner finder ✅ (2026-06-21)
`lib/research/gis-adjacency.ts` ships the pure geometry that completes §10.2.
Given the subject's parcel polygon and a set of candidate polygons (e.g.
everything within 200 m returned by a CAD layer query), returns the subset
whose boundaries touch — those are the authoritative GIS adjoiners.

  - `arePolygonsAdjacent(a, b, opts?)` → `{ adjacent, minBoundaryDistanceMeters,
    sharedBoundaryLengthMeters }`. Tolerance defaults to
    `DEFAULT_TOLERANCE_METERS` (≈3 m) so the typical surveyor gap / overlap
    on real CAD polygons doesn't break adjacency.
  - `findGisAdjoiners(subject, candidates, opts?)` — filters a candidate
    list and sorts by `sharedBoundaryLengthMeters` descending (full-edge
    neighbours rank above corner-only ones).
  - `findGisAdjoinersFromRecords(subject, candidates, opts?)` — same but
    operates on `CanonicalProperty` records straight from the registry
    seeded in slice 2.

Math: local-tangent-plane projection (equirectangular) anchored at the
subject's first vertex → every vertex maps to local metres with <1 cm error
at parcel scale (well below the 3 m tolerance). Planar segment-segment
distance covers the four endpoint-to-other-segment cases + a segment-
intersection short-circuit; `MultiPolygon` handled by flattening to rings.

Source-locked with 13 tests in `__tests__/research/gis-adjacency.test.ts`
covering identical-polygon, full-edge-share, corner-only, across-the-street,
small-survey-gap-within-tolerance, custom-tolerance-rejection, MultiPolygon,
empty-polygon robustness, candidate filtering, and shared-length sort
ordering. 89/89 research tests pass; clean tsc.

**§10.2 now complete.** The deed-call extractor (slice 4) and the GIS-
adjacency finder (this slice) together produce the
`RelevanceContext.adjoiners` array that `classifyRelevance()` from slice 3
consumes — the AI extractor can now anchor + weed correctly.

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

- [x] **7.1 `research_counties`** ✅ (2026-06-21, Slices 2 + 14) —
  table created in slice 2; full 254-county seed shipped in slice 14
  (seeds/372). Every odd Texas FIPS 48001-48507 is present with metro
  tier 1-4 assignments for §9.7's scheduled cadence.
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
- [x] **8.2 Vendor auto-detection** ✅ (2026-06-21, Slice 6, partial) —
  `detectVendor(url, vendors)` in `lib/research/vendor-detection.ts`
  matches a pasted URL against the seeded `url_fingerprints` and
  returns the strongest match + the full ranked list for the wizard's
  disambiguation case. Fetched-HTML fingerprint (the optional second
  signal) lands when the §8.1 wizard route is wired up; the matcher
  surface is locked first so the route handler can call it freely.
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
- [~] **8.5 Save + auto-enroll** — `prefillAdapterFromTemplate()` from
  slice 10 produces the row a save route would INSERT. Route handler
  + canary creation + coverage-rollup update land in a follow-up route
  slice once the §8.1 wizard UI is wired.
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

- [~] **9.1 Three-layer change detection** per adapter run:
  - [x] **Semantic/data** ✅ (2026-06-21, Slice 7) — `diffAgainstCanary` in
    `lib/research/canary-diff.ts` ships the strongest breakage signal.
    Path-aware normalization, severity bucketing, human-readable summary.
  - [x] **Structural** ✅ (2026-06-21, Slice 8) — `fingerprintHtml` +
    `diffFingerprints` in `lib/research/dom-fingerprint.ts`. SHA-256 over a
    canonicalized skeleton (form/anchor/table tags + stable attributes
    only), Jaccard-similarity severity bucketing.
  - [ ] **Visual** — Playwright screenshot + AI-vision diff. Needs
    Playwright orchestration + AI-vision integration; lands as its own
    slice once the §8.3 site-probe Playwright harness is up.
- [x] **9.2 Canary golden records** ✅ (2026-06-21, Slice 9) —
  `research_adapter_canaries` table shipped. Stores query input, expected
  canonical-field subset (slice-7 diff target), DOM fingerprint hash +
  skeleton (slice 8), and screenshot ref (hooks in when Playwright
  lands). `is_active` partial-index preserves baseline history.
- [x] **9.3 `research_adapter_health_checks`** ✅ (2026-06-21, Slice 9) —
  append-only audit trail. `layer_results` jsonb carries the slice-7 +
  slice-8 outputs today; visual layer fills in later. Partial index on
  failures so the §9.8 dashboard's queries stay cheap.
- [x] **9.4 AI diagnose + repair agent** ✅ (2026-06-21, Slice 9 — table
  half) — `research_adapter_change_proposals` table shipped with
  `prior_config`/`prior_field_map` snapshotted for reversibility,
  `confidence` + `canary_test_passed` for the §9.5 auto-apply gate, and
  the full `proposed → approved/rejected → applied/superseded`
  lifecycle. The agent code itself (Playwright snapshot + AI diagnose
  + canary re-test) lands once §8.3's site-probe Playwright harness is
  up; the table contract is locked first so the agent code can write
  to a typed surface from day one.
- [x] **9.5 Apply policy (GATED)** ✅ (2026-06-21, Slice 11) —
  `decideApplyAction()` + `applyProposalToAdapter()` +
  `rollbackProposal()` in `lib/research/apply-policy.ts`.
  `DEFAULT_APPLY_POLICY` is locked safe-by-default (autoapply OFF,
  canary-pass required, sane thresholds). The route handler that wires
  this into the §9.4 proposal lifecycle + writes the rollback snapshot
  to the proposal row lands when the §9.8 dashboard route ships.
- [x] **9.6 Failure-triggered self-heal** ✅ (2026-06-21, Slice 16) —
  `planSelfHealResponse()` in `lib/research/self-heal-planner.ts` is the
  pure orchestrator. Quarantines the adapter, queues §9.4, picks the
  right retry strategy + friendly user message based on whether the
  failure is a wall (captcha/auth/rate-limit), chronic (≥3 broken in
  the look-back window), or a one-off. Route wiring lands when the
  live extractor pipeline gets the corresponding hook.
- [~] **9.7 Scheduled cadence (GATED)** — kernel ✅ (2026-06-21, Slice 15):
  `planScheduledChecks()` in `lib/research/health-check-scheduler.ts` is
  the deterministic decision function. The cron route + the
  `RESEARCH_SELF_HEAL_SCHEDULE` env flag that wraps it land in a
  follow-up route slice. Per-host + batch caps + jitter live on the
  kernel; the wrapper just provides the polling cadence + I/O.
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
- [x] **10.2 Adjoiner resolution** ✅ (2026-06-21):
  - Deed-call half (Slice 4): `lib/research/adjoiner-extraction.ts` covers
    named tracts / Lot-Block / abstract / named survey / deed citations.
  - GIS-adjacency half (Slice 5): `lib/research/gis-adjacency.ts` ships
    pure polygon-touching geometry + `findGisAdjoiners` / `…FromRecords`
    helpers. Local-tangent-plane projection, segment-segment distance,
    3 m default tolerance to absorb real-world surveyor gaps.
  - `project_adjoiners` table persistence + the route handler that calls
    both halves and writes the merged adjoiner set lands in a follow-up
    slice that wires these into the live extractor pipeline.
- [x] **10.3 Relevance-gated extraction** ✅ (2026-06-21, Slice 3, partial) —
  `classifyRelevance()` + `filterRelevantRecords()` in
  `lib/research/relevance.ts` are the contract every extractor will use to
  tag a datum subject/adjoiner/unrelated/unknown. Adding the `relevance` +
  `parcel_ref` columns to the existing `extracted_data_points` table + the
  AI-prompt change that instructs the model to ask for the tag at extraction
  time lands in a follow-up slice that touches the live pipeline.
- [~] **10.4 Two-pass for large multi-parcel docs** — Pass 1 ✅
  (2026-06-21, Slice 13): `segmentMultiParcelDocument()` in
  `lib/research/document-segmentation.ts` ships a deterministic, AI-free
  segmenter that splits on deed-call markers, scores each segment against
  the relevance context using composite tokens, and returns the top-N
  segments with byte-offset spans. The expensive AI pass (Pass 2 Sonnet
  deep-extract on the kept segments) lands as a route-level slice that
  also wires extracted_data_points.relevance + parcel_ref persistence
  (§10.3 follow-up).
- [x] **10.5 Spatial result filtering** ✅ (2026-06-21, Slice 12) —
  `rankAndFilterCandidates()` in `lib/research/spatial-filter.ts`
  composes the relevance classifier (slice 3) with the polygon /
  centroid proximity from slices 4/5 and a `scoreFloor` so unrelated
  parcels are dropped before the §10.4 deep extractor pays a single
  token.
- [x] **10.6 Disambiguation surfacing** ✅ (2026-06-21, Slice 12) —
  `disambiguateSubject()` auto-picks only when the leader is clearly
  ahead (score ≥ 0.6, runner-up more than 0.15 behind); otherwise
  returns `chosen: null` + the top-N candidates for the UI to surface.
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
