# STARR RECON — Inventory & Migration Plan

**Last Updated:** April 2026
**Status:** Phase 0 — pre-migration inventory
**Owner:** Jacob, Starr Surveying / Starr Software

---

## 1. Why This Document Exists

We are migrating the STARR RECON property-research pipeline off a DigitalOcean droplet onto a new infrastructure footprint (Hetzner + Cloudflare R2 + Browserbase + CapSolver). Before any of that hookup happens, we need to know exactly what is in the repository today, what works, what doesn't, and where the version drift and duplication is. This document is the canonical answer.

It is also the single source of truth for the multi-phase build plan that follows. Every other planning doc in `STARR_RECON/PHASE_*.md` is older and may not reflect the post-migration architecture — when in doubt, this doc wins.

---

## 2. Repository Layout — Two Codebases, One Repo

| Codebase | Location | Runtime | Role |
|---|---|---|---|
| **Next.js web app** | `/app`, `/lib`, `/seeds`, root `package.json` | Vercel | Public site, admin portal, learning platform, **plus** an in-process "lite" research pipeline under `app/admin/research/` and `lib/research/` |
| **Worker** | `/worker` | DigitalOcean droplet today; Hetzner tomorrow | The full RECON pipeline — Express + Playwright + BullMQ/Redis, ~120 TS files |

There are two parallel research implementations. The lite pipeline (`lib/research/`, ~30 services) runs in-process inside the Next.js app for fast turn-around; the worker runs the full 9-phase orchestrator. They overlap heavily on Bell County logic.

**Decision:** the **worker is canonical**. The Next.js lite pipeline becomes a thin client that delegates to the worker over HTTP. The lite pipeline stays available as a fallback for development without a running worker, but production traffic always goes to the worker.

---

## 3. Pipeline Status — Phase Coverage

Pulled from `STARR_RECON/STARR_RECON_PHASE_ROADMAP.md` and validated against actual files in `worker/src/services/`.

| Phase | Name | Status | Notes |
|---|---|---|---|
| 1 | Property Discovery | ✅ | `discovery-engine.ts`, `property-discovery.ts`, `cad-registry.ts` |
| 2 | Document Harvesting | ✅ | `document-harvester.ts`, `document-intelligence.ts` |
| 3 | AI Extraction | ✅ | `ai-extraction.ts`, `adaptive-vision.ts` |
| 4 | Subdivision | ✅ | `subdivision-intelligence.ts` and 5 supporting files |
| 5 | Adjacent Properties | ✅ | `adjacent-research.ts` + orchestrator + worker |
| 6 | TxDOT ROW | ✅ | `txdot-row.ts`, `row-integration-engine.ts` |
| 7 | Geometric Reconciliation | ✅ | `geometric-reconciliation-engine.ts`, `reconciliation-algorithm.ts`, `traverse-closure.ts` |
| 8 | Confidence Scoring | ✅ | `confidence-scoring-engine.ts` and 4 specialized scorers |
| 9 | Document Purchase | ✅ | `document-purchase-orchestrator.ts`, billing-tracker, watermark-comparison |
| 10 | Reports & Exports | ✅ | `worker/src/reports/` — SVG, PNG, DXF, PDF, legal description |
| 11 | Statewide Expansion | 🔨 partial | FEMA/GLO/TCEQ/RRC/NRCS clients exist; not all wired into pipeline |
| 13 | Statewide Adapters | 🔨 partial | 18 adapters present but only ~5 verified working end-to-end |
| 16 | County Config | ✅ | `worker/src/infra/county-config-registry.ts` |
| 17 | Report Sharing | ✅ | `report-share-service.ts`, `seeds/095_phase17_report_shares.sql` |
| 18 | Data Versioning | ✅ | `pipeline-version-store.ts`, `pipeline-diff-engine.ts` |
| 19 | LiDAR / Cross-County | 🔨 partial | `cross-county-resolver.ts` + seed exists |

**Self-described state from `STARR_RECON/CODE_REVIEW_2026_03_09.md`:** capable of property research for Central Texas; pipeline is end-to-end functional on Bell County and a handful of others; statewide adapter scaffolding exists but coverage is uneven.

---

## 4. County Coverage — What Actually Works Today

**CAD adapters present:** `bis-adapter`, `trueautomation-adapter`, `tyler-adapter`, `hcad-adapter`, `tad-adapter`, `generic-cad-adapter` (AI fallback), plus base `cad-adapter`.

**Clerk adapters present:** `kofile-clerk-adapter`, `henschen-clerk-adapter`, `idocket-clerk-adapter`, `countyfusion-adapter`, `tyler-clerk-adapter`, `fidlar-clerk-adapter`, `texasfile-adapter`, `bexar-clerk-adapter`, plus base `clerk-adapter` and `clerk-registry`.

**Verified end-to-end (per code review):**
- 15 TrueAutomation counties (Bell, Coryell, McLennan, Falls, Milam, Lampasas, Travis, Bastrop, etc.)
- 3 BIS eSearch CAD portals (Bell, Hays, Williamson)
- 33 publicsearch.us county clerk portals
- Bell County ArcGIS with fallback endpoints

**Source clients (`worker/src/sources/`):** FEMA NFHL, USGS, TxDOT RPAM, Texas GLO, TCEQ, TX Railroad Commission, USDA NRCS soil survey.

**Migration priority counties** for first Browserbase/CapSolver wiring (chosen because they currently hit CAPTCHA walls):
1. **Bell County** (BIS, hits reCAPTCHA on `/search/shouldUseRecaptcha`)
2. **Hays County** (Tyler/eSearch, Cloudflare-fronted)
3. **Kofile** (covers ~80 clerk counties, gates with Cloudflare Turnstile)

---

## 5. Stack Inventory — Installed vs Needed

### Already in `package.json` (root) and `worker/package.json`

| Package | Root | Worker | Notes |
|---|---|---|---|
| `playwright` | ^1.58.2 | ^1.49.0 | **VERSION DRIFT — fix in Phase 0** |
| `bullmq` | ^5.70.4 | ^5.70.4 | aligned |
| `ioredis` | ^5.10.0 | ^5.10.0 | aligned |
| `@anthropic-ai/sdk` | ^0.74.0 | ^0.74.0 | aligned |
| `@supabase/supabase-js` | 2.38.5 | ^2.38.5 | aligned |
| `stripe` | ^14.25.0 | ^17.7.0 | **VERSION DRIFT — major version skew** |
| `zod` | ^4.3.6 | ^3.24.0 | **VERSION DRIFT — major version skew** |
| `@types/node` | 20.10.5 (dev) | ^22.10.0 (dev) | **VERSION DRIFT** |
| `next` | 14.2.35 | — | web only |
| `next-auth` | ^5.0.0-beta.30 | — | web only |
| `pdfkit`, `sharp` | various | various | aligned |

### Not installed — will add in Phase A

- `@browserbasehq/sdk` — Browserbase REST + CDP control
- `@browserbasehq/stagehand` — high-level browser agent (optional, evaluate later)
- `@aws-sdk/client-s3` — Cloudflare R2 uses the S3-compatible API
- `ws` — WebSocket server for live progress + manual CAPTCHA handoff
- (Optional) `@turf/turf` — geometry helpers if `traverse-closure.ts` needs more than what's in `worker/src/lib/curve-params.ts`

### Not needed — already have equivalents

- We do **not** need a graph database (Neo4j, Memgraph). Postgres + JSONB on Supabase is sufficient for the graph schema in `seeds/200_recon_graph.sql`.
- We do **not** need a separate captcha-solver SDK. CapSolver exposes a plain HTTP API; our `worker/src/lib/captcha-solver.ts` wrapper handles it.

---

## 6. CAPTCHA Handling — Current State

**There is no CAPTCHA-solver integration in the repo.** Total existing CAPTCHA code:

1. `worker/src/lib/rate-limiter.ts` — `isCaptchaError()` regex-matches `'captcha' | 'cloudflare' | 'blocked'` in error messages and **stops retrying** when seen. That is the entire failure path.
2. `worker/src/services/bis-cad.ts` — calls `/search/shouldUseRecaptcha` on BIS portals; if true, falls through to Playwright (which has no solver either, just renders the page and gives up).
3. `worker/src/counties/bell/analyzers/screenshot-classifier.ts` — has CAPTCHA in a list of regexes used for screenshot classification, not solving.

Every Playwright launch (37 call-sites across 39 files) is `chromium.launch({ headless: true })` — local Playwright, no CDP, no remote browser, no proxy, no fingerprint management, no manual handoff path.

**This is a complete net-new build, not a fix-the-existing-solution job.** That's actually easier — no wrong abstractions to unwind.

The new abstraction is `worker/src/lib/captcha-solver.ts` (provider-agnostic interface, stub implementation today, CapSolver implementation when account exists). The new browser abstraction is `worker/src/lib/browser-factory.ts` (selects local Playwright vs Browserbase CDP via `BROWSER_BACKEND` env). All 37 `chromium.launch()` call-sites will be migrated through these abstractions in Phase A — Phase 0 only ships the new modules and refactors zero callers.

---

## 7. Schema State — Relational Today, Graph Tomorrow

`seeds/090_research_tables.sql` defines: `analysis_templates`, `drawing_templates`, `research_projects`, `research_documents`, `extracted_data_points`, `discrepancies`, `rendered_drawings`, `drawing_elements`. Plus 18 follow-on migrations through `109_*`.

This is a relational schema, not a graph. It has the *ingredients* of a graph — `extracted_data_points` references documents and projects, `discrepancies` references data points — but no node/edge abstraction.

**Phase 0 ships `seeds/200_recon_graph.sql`** — a new `recon_graph_*` namespace with:

- 12 polymorphic node types (one `recon_nodes` table with `type` discriminator + JSONB `attrs`)
- 16 edge types (`recon_edges` with `from_node_id`, `to_node_id`, `edge_type`, `confidence`, `source_document_id`)
- Indexes for graph traversal and JSONB attribute lookup

**No data is migrated in Phase 0.** A backfill script will be written in Phase A that reads existing `extracted_data_points` + `research_documents` and writes nodes/edges. Existing tables stay; the graph layer sits alongside them.

---

## 8. Frontend State

`/app/admin/research/` already exists with `[projectId]`, `billing`, `components`, `library`, `pipeline`, `testing` subroutes. `PLAN.md` describes a 7-step workflow (upload → configure → analyze → review → draw → verify → complete).

Phase C of the new build adds the 16-screen UI from the multi-device design system; Phase 0 does not touch the frontend. PC-first layout will use fluid units (rem + clamp) so the Phase C mobile pass does not require a rewrite. Trimble / Carlson / Leica data-collector compatibility is Phase F+; those generally consume `.dxf`/`.kml`/`.csv` plus vendor-specific `.rw5`/`.fbk`/`.crd`. Our existing Field Plan export already produces DXF.

---

## 9. Repo Health Flags

| Flag | Severity | Phase to fix |
|---|---|---|
| Playwright version drift (1.58 root vs 1.49 worker) | High — blocks Browserbase compat | Phase 0 |
| Stripe major-version drift (14 root vs 17 worker) | Medium — billing-tracker.ts may not work in web | Phase 0 |
| Zod major-version drift (4 root vs 3 worker) | High — schemas won't pass between layers | Phase 0 |
| `@types/node` drift (20 vs 22) | Low — only affects type-checking | Phase 0 |
| Two AI clients (`lib/research/ai-client.ts` and `worker/src/services/ai-extraction.ts`) | Medium — duplicated logic | Phase B |
| Two pipelines (lite + worker) | Medium — confusion + duplicated Bell County code | Phase A (lite becomes thin client) |
| 37 `chromium.launch()` call-sites | High — must all route through `browser-factory` | Phase A |
| Sparse worker tests (3 files in `worker/src/__tests__/`) | Medium — regression suite needs growth | ongoing |

---

## 10. Closure Tolerance — What Standard, What We Use

See `docs/CLOSURE_TOLERANCE.md` for the full reasoning. Summary:

| Survey class | Linear closure | Used in our pipeline as |
|---|---|---|
| Urban / suburban (Class A) | 1:10,000 (0.01%) | "excellent" — silent pass |
| ALTA/NSPS positional tolerance | 0.07 ft + 50 ppm (~1:14,000+) | "excellent" — silent pass |
| Most ordinary boundary work | 1:5,000 (0.02%) | "acceptable" — pass with note |
| Rural Class B floor | 1:7,500 (0.013%) | "acceptable" — pass with note |
| Anything looser | worse than 1:5,000 | **hard fail — blocked from final report, manual review required** |

These constants live in `worker/src/lib/closure-tolerance.ts` and are imported by `traverse-closure.ts` (which already had its own 4-tier ratio classification at 50000/15000/5000 — we align).

---

## 11. Ground-Truth Regression Set — Plan

A regression set is a fixed list of properties where the correct answer is known (manually surveyed by Starr). The pipeline runs against them every week; deviations from the known answer block the deploy.

**Phased growth (we have ~zero today):**

| Phase | Size | Source | Notes |
|---|---|---|---|
| 0 (now) | 1 example fixture | Synthetic | Just to validate the harness wiring |
| A (after migration smoke-tests) | 5 properties | Dad's filing cabinet — pick 5 jobs with complete file folders | Manual entry from his PC + flash drives |
| B (intelligence layer) | 15 properties | Same source, expand | Includes one M&B, one subdivision, one rural, one disputed boundary |
| D (commercial scaffolding) | 50 properties | Mix of Bell + Hays + Williamson + 2 statewide outliers | Required before any non-Starr customer can use the system |

**Format:** YAML files in `worker/src/__tests__/regression/fixtures/<county>/<property-id>.yaml` with `address`, `expected_owner`, `expected_acreage`, `expected_chain_of_title`, `expected_documents`, `expected_adjoiners`, plus `tolerance` rules per field. The harness in `worker/src/__tests__/regression/regression-runner.ts` runs the pipeline against each fixture and reports deltas.

**Long-term:** as Starr digitizes the filing cabinets (a separate project), each digitized job becomes a candidate fixture. We do not need to do that work as part of this build — we just stand the harness up so that growing the set is mechanical.

---

## 12. Build Roadmap

### Phase 0 — Foundation (this PR, no external accounts needed)

- Inventory + naming docs (this file, `STARR_SOFTWARE_SUITE.md`, `CLOSURE_TOLERANCE.md`)
- Version pinning across root + worker
- `worker/Dockerfile` for Hetzner
- Stub `browser-factory` and `captcha-solver` modules with full interfaces
- Shared `closure-tolerance.ts` constants
- `seeds/200_recon_graph.sql` schema
- Regression-set harness scaffold + 1 example fixture
- Updated `worker/.env.example`

### Phase A — Foundation hookup (after Hetzner + R2 + Browserbase + CapSolver accounts exist)

- Provision infra (Hetzner AX42 worker, CPX41 control plane, R2 buckets)
- Containerize and deploy worker; smoke-test on Bell County
- Wire real Browserbase backend in `browser-factory`
- Wire real CapSolver backend in `captcha-solver`
- Refactor remaining 37 `chromium.launch()` call-sites through `browser-factory`
- Backfill graph from existing relational tables
- Grow regression set to 5 properties

### Phase B — Intelligence (parallel adapter cleanup)

- Stagehand discovery agent for cross-reference extraction
- Coherence service (4 pre-scrape gates)
- Mid-pipeline gates 5–8 (orphan quarantine, temporal continuity, closure ≤ 1:5,000, GIS adjoiner check)
- Post-pipeline gates 9–11 (confidence flagging, vision banner, orphan strip)
- Supersession walking + closure analysis (extend `traverse-closure.ts`)
- Grow regression set 5 → 15

### Phase C — UX

- 16-screen UI (Dashboard, Intake, Active Research, Document Viewer, Report Review, CAPTCHA Handoff, Field Plan, etc.)
- PC-first with fluid units; mobile pass at end of phase
- WebSocket-driven live progress

### Phase D — Commercial scaffolding (feature-flagged off)

- Stripe in test mode
- Tier enforcement, ceilings (80/95/100)
- 50-property regression suite
- Adapter drift detection
- Team mgmt + billing panel scaffolds

### Phase E — Starr internal validation

- Dad and crew use it on real jobs; we collect bugs and grow regression set

### Phase F — Public Go-Live

- 3–5 pilot customers, A/B price test, 30-day iteration
- Then scale

### Phase G+ — Suite expansion

- Trimble / Carlson / Leica data-collector exports (`.rw5`, `.fbk`, `.crd`)
- Additional Starr Software products (see `docs/STARR_SOFTWARE_SUITE.md`)
