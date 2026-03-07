# Phase 11: Product Expansion, Statewide Coverage & Subscription Platform

**Starr Software — AI Property Research Pipeline Phase**

**Duration:** Weeks 31–52+ (ongoing)
**Depends On:** All Phases 1–10
**Status:** 🟡 IN PROGRESS v1.2 — Core infrastructure, data source clients, billing, batch, chain-of-title, exports, WebSocket, analytics, and clerk registry are complete with 153 unit tests. Web frontend, Supabase schema, and statewide CAD/clerk adapter implementation remain.

**Goal:** Transform the 10-phase research pipeline from a single-user CLI tool into a subscription-grade SaaS product that covers all 254 Texas counties, integrates every available government data source, processes payments for document purchases on behalf of users, delivers interactive web-based reports through Starr Compass, and operates with production-grade reliability.

This phase addresses every gap, missing data source, UX consideration, and infrastructure requirement needed to sell this as a standalone subscription product or integrated Starr Compass feature that saves surveyors, title companies, and real estate professionals hours of manual research per property.

**Deliverable:** A complete product-grade research platform with multi-tenant user management, Stripe billing, statewide county coverage, 10+ government data source integrations, real-time progress UI, interactive web reports, batch processing, a statewide document cache, and production infrastructure.

---

## Current State of Phase 11 — v1.2 (March 2026)

**Phase Status: 🟡 IN PROGRESS**

### v1.2 Changes (March 2026)

- **Bug fix:** `progress-server.ts` — `new URL(req.url!, ...)` was called without a try/catch; a malformed WebSocket URL could crash the connection handler. Wrapped in try/catch and returns close code 4003. Also added: `IncomingMessage` typing for `req`, projectId format validation (`/^[a-zA-Z0-9_-]{1,128}$/` — rejects path-traversal chars), per-socket error handler, server-level `'error'` handler, initial `isAlive = true` on connect, and replaced `console.log` with a structured timestamp logger.
- **Bug fix:** `stripe-billing.ts` — Module-level `new Stripe('')` was called at import time with an empty key if `STRIPE_SECRET_KEY` was not set, causing a silent misconfiguration. Converted to a lazy `getStripe()` factory. Added `requireEnv()` helper that throws a descriptive error when a required env var is absent. `createSubscription` and `createCheckoutSession` now call `requireEnv(priceEnvVar)` instead of falling through with an empty price ID. `verifyWebhook` now calls `requireEnv('STRIPE_WEBHOOK_SECRET')` and wraps `constructEvent` in a try/catch that re-throws as a descriptive `Error`.
- **Bug fix:** `nrcs-soil-client.ts` — Centroid `[lon, lat]` and polygon coordinates were used directly in WKT query strings without validation. Added `validateCoordinates()` which rejects NaN, out-of-range WGS84 values, and polygons with fewer than 3 points. Called at the top of `querySoilData()` before any network requests.
- **Bug fix:** `worker/src/index.ts` — `GET /research/clerk-registry/:county` accepted any string as the county parameter. Added length limit (≤ 64 chars) and character-class validation (`/^[a-zA-Z\s'-]+$/`) to prevent abuse. Also added `.trim()` before lookup.
- **New tests:** 19 additional unit tests (135–153) covering: NRCSSoilClient coordinate validation (7 tests), BillingService env/webhook validation (5 tests), subscription tier edge cases (7 tests). Total: **153 Phase 11 tests**.
- **Test count:** 1301 total tests pass (1282 prior + 19 new Phase 11 v1.2).

### v1.1 Changes (March 2026)

- **Bug fix:** `chain-builder.ts` — `traceChain()` had infinite-loop risk when `grantor` was an empty string (`.includes('')` matches everything). Fixed with explicit empty-string guard and same-grantor guard.
- **Bug fix:** `ai-guardrails.ts` — `validateBearing()` regex required seconds, rejecting valid Texas deed formats like `N 45°30' E` (no seconds). Made seconds optional; supports `DD°MM'SS"`, `DD°MM'`, and `DD°` formats.
- **Bug fix:** `batch-processor.ts` — CSV parser did not strip `\r` from Windows CRLF line endings, producing trailing carriage-returns in field values. Fixed. Also added `try/catch` to `loadBatch()` for corrupt JSON files.
- **Bug fix:** `usage-tracker.ts` — `loadEvents()` did not wrap `fs.readFileSync()` in try/catch. Added per-file error protection.
- **New:** `worker/src/adapters/clerk-registry.ts` — FIPS/county-name to clerk system routing. Maps 17 representative Texas counties; gracefully falls back to TexasFile aggregator for any unregistered county. Exported functions: `getClerkByFIPS`, `getClerkByCountyName`, `getCountiesForSystem`, `getAdapterCoverage`, `requiresManualRetrieval`.
- **New:** Phase 11 API routes added to `worker/src/index.ts`:
  - `POST /research/flood-zone` — FEMA NFHL flood zone query
  - `GET  /research/flood-zone/:projectId` — Retrieve flood zone result
  - `POST /research/chain-of-title` — Deep chain of title
  - `GET  /research/chain-of-title/:projectId` — Retrieve chain of title
  - `POST /research/batch` — Create batch research job
  - `GET  /research/batch/:batchId` — Check batch status
  - `GET  /research/clerk-registry/:county` — Lookup clerk system for county
- **New:** `__tests__/recon/phase11-expansion.test.ts` — 134 unit tests covering all Phase 11 pure-logic modules.
- **Dependencies added:** `bullmq@^5.0.0`, `ioredis@^5.3.0`, `stripe@^14.0.0` added to root `package.json` (required for job queue and billing modules).
- **Test count:** 1282 total tests pass (1148 prior + 134 Phase 11).

### Built Foundation Code

| Module | File | Status | Tests |
|--------|------|--------|-------|
| FEMA NFHL Integration | `worker/src/sources/fema-nfhl-client.ts` | ✅ Complete | Live API (unit tests mock-free) |
| Texas GLO Integration | `worker/src/sources/glo-client.ts` | ✅ Complete | Live API |
| TCEQ Integration | `worker/src/sources/tceq-client.ts` | ✅ Complete | Live API |
| Texas RRC Integration | `worker/src/sources/rrc-client.ts` | ✅ Complete | Live API |
| USDA NRCS Soil Survey | `worker/src/sources/nrcs-soil-client.ts` | ✅ Complete | Live API |
| Retry/Circuit Breaker | `worker/src/infra/resilience.ts` | ✅ Complete + Tested | Tests 77–89 |
| AI Response Validation | `worker/src/infra/ai-guardrails.ts` | ✅ Complete + Tested | Tests 1–30 |
| BullMQ Job Queue | `worker/src/infra/job-queue.ts` | ✅ Complete | Requires Redis |
| Pino Structured Logging | `worker/src/lib/logger.ts` | ✅ Complete | Used across pipeline |
| Rate Limiter | `worker/src/lib/rate-limiter.ts` | ✅ Complete | Used across pipeline |
| Stripe Billing | `worker/src/billing/stripe-billing.ts` | ✅ Complete + Tested | Tests 142–146 |
| Subscription Tiers | `worker/src/billing/subscription-tiers.ts` | ✅ Complete + Tested | Tests 31–49, 147–153 |
| Usage/Token Tracking | `worker/src/analytics/usage-tracker.ts` | ✅ Complete + Tested | Tests 116–123 |
| Batch Processing | `worker/src/batch/batch-processor.ts` | ✅ Complete + Tested | Tests 90–101 |
| Chain of Title | `worker/src/chain-of-title/chain-builder.ts` | ✅ Complete + Tested | Tests 102–115 |
| RW5 Survey Export | `worker/src/exports/rw5-exporter.ts` | ✅ Complete + Tested | Tests 50–58 |
| Trimble JobXML Export | `worker/src/exports/jobxml-exporter.ts` | ✅ Complete + Tested | Tests 59–66 |
| WebSocket Progress Server | `worker/src/websocket/progress-server.ts` | ✅ Complete + Hardened | Requires HTTP server |
| AI Prompt Registry | `worker/src/ai/prompt-registry.ts` | ✅ Complete + Tested | Tests 124–134 |
| Phase 11 TypeScript Types | `worker/src/types/expansion.ts` | ✅ Complete | Used across all modules |
| Clerk Registry | `worker/src/adapters/clerk-registry.ts` | ✅ Complete + Tested | Tests 67–76 |

### Not Yet Built (High Priority)

| Item | Severity | Notes |
|------|----------|-------|
| HCAD adapter (Harris County / Houston) | Critical | Largest TX county; needed for statewide coverage |
| TAD adapter (Tarrant County / Fort Worth) | Critical | 2nd largest metro; needed for statewide coverage |
| Henschen clerk adapter (~40 counties) | Critical | Second most common TX clerk system after Kofile |
| iDocket clerk adapter (~20 counties) | High | Third major TX clerk system |
| Web frontend (research dashboard) | Critical | No browser-based UI exists yet |
| Supabase schema migrations | Critical | `research_projects` table not yet created |
| Interactive boundary viewer (React/SVG) | High | Phase 11 UX requirement |
| Document library UI | High | Phase 11 UX requirement |
| USGS topographic data client | Medium | |
| TX Comptroller tax data client | Medium | |
| CSV exporter | Medium | `csv-exporter.ts` referenced in roadmap but not built |
| Schema validation (Zod) between phases | High | Phase-boundary I/O validation |

### What Needs External Input (Cannot Be Fully Implemented Without)

| Item | Missing Information |
|------|---------------------|
| FEMA NFHL live URL verification | ArcGIS REST layer indices may have changed — need live test against FEMA servers |
| GLO ArcGIS live URL | `gisweb.glo.texas.gov/glomapserver` URL needs live verification |
| TCEQ GIS service URLs | Service paths need verification against current TCEQ ArcGIS portal |
| RRC GIS service URLs | `gis.rrc.texas.gov` path needs verification |
| Stripe price IDs | `STRIPE_PRICE_SURVEYOR_PRO` and `STRIPE_PRICE_FIRM_UNLIMITED` env vars need real Stripe dashboard values |
| Redis connection | BullMQ job queue requires running Redis; `REDIS_URL` env var |
| Supabase credentials | `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` for multi-tenant user storage |
| Henschen adapter URLs | Per-county URLs for ~40 Henschen counties |
| iDocket session pattern | iDocket SPA authentication flow needs investigation |
| HCAD account number search | Harris County Appraisal District uses account numbers, not addresses |
| WebSocket auth | Production Supabase JWT validation in `validateToken()` of progress-server.ts |
| NRCS SDA SQL | SDA tabular query may need schema updates for current NRCS data model |

### Gap Analysis Updates

The comprehensive gap analysis in §11.1 below was written before the Phase 11 foundation code was built. Many items listed as "Critical" gaps (retry/circuit breaker, structured logging, AI response validation, job queue, Stripe billing, batch processing) have since been addressed in v1.1. The remaining critical gaps are: statewide CAD/clerk adapter implementation, web frontend, and Supabase schema.

---

## 11.1 Comprehensive Gap Analysis — All 10 Phases

After auditing all 15,000+ lines across Phases 1–10, the following gaps have been identified. They are organized by category, with severity ratings and the phases they impact.

### 11.1.1 Missing Government Data Sources

These are high-value data sources that surveyors, title companies, and real estate professionals need — and that the current pipeline does not touch.

| # | Data Source | What It Provides | Why It Matters | Severity |
|---|-----------|-----------------|---------------|----------|
| 1 | FEMA NFHL (National Flood Hazard Layer) | Flood zone designations (A, AE, X, VE), base flood elevations, FIRM panel IDs, floodway boundaries | Every mortgage lender requires flood zone determination. Surveyors need BFE for elevation certificates. Flood zones affect property value, insurance costs, and building restrictions. This is one of the most-requested data points in any property report. | Critical |
| 2 | Texas GLO (General Land Office) | Original land grants, Spanish/Mexican-era surveys, abstract survey boundaries, patent records, vacancy determinations | Texas property law traces back to original land grants. Abstract survey references (e.g., "WILLIAM HARTRICK SURVEY, A-488") are in every legal description but never verified against the GLO archive. Vacancy determinations can affect ownership. | High |
| 3 | TCEQ (TX Commission on Environmental Quality) | Underground storage tank (UST) locations, contamination sites, Superfund boundaries, water quality permits, remediation status | Environmental contamination materially affects property value and lender requirements. A gas station UST leak on an adjacent property can create liability for the target property. Phase I ESA reports need this data. | High |
| 4 | Texas Railroad Commission (RRC) | Oil/gas well locations, pipeline easements, drilling permits, well plugging status, pipeline right-of-way widths | Pipeline easements restrict development. Active wells require setback distances. Abandoned/unplugged wells create liability. West Texas and Eagle Ford Shale properties are especially affected. | High |
| 5 | USDA NRCS Web Soil Survey | Soil classifications, hydric soils, permeability, shrink-swell potential, USCS classification, depth to bedrock | Foundation design, septic system feasibility, stormwater management, and flood risk all depend on soil data. Expansive soils (common in Central Texas) cause structural damage — surveyors and engineers need this. | Medium |
| 6 | USGS National Map | Topographic contours, elevation data (NED/3DEP), hydrography (streams, rivers, lakes), land cover | Terrain context for the property. Drainage patterns affect easement placement and flood risk. | Medium |
| 7 | TX Comptroller | Property tax rates, exemptions, tax delinquency, appraised vs market value history | Tax delinquency flags potential liens. Tax rate data is needed for development feasibility. | Medium |
| 8 | County Plat Records (beyond current county clerk) | Subdivision plats filed with the county, HOA/CCR recordings, utility easement dedications, public improvement district (PID) boundaries | Current Phase 2 retrieves individual deeds/plats by instrument number. It does not search for ALL recordings affecting a property (easement grants to utility companies, maintenance agreements, deed restrictions, CC&Rs). | High |
| 9 | Texas Natural Resources Information System (TNRIS) | LiDAR point clouds, aerial imagery, parcel boundaries, address points, historic aerials | High-resolution imagery and LiDAR provide independent elevation verification. Historic aerials show property changes over time. | Low |
| 10 | USPS Address Validation | Standardized addresses, delivery point validation, ZIP+4, carrier route | Current Phase 1 geocoding sometimes fails on rural addresses. USPS validation would improve address normalization. | Low |

### 11.1.2 Statewide Coverage Gaps

| # | Gap | Current State | Required State | Severity |
|---|-----|---------------|---------------|----------|
| 1 | CAD Adapters | Only BIS Consultants adapter is fully implemented. Tyler, TrueAutomation, HCAD, TAD listed but not coded. | Need working adapters for all 7 major CAD vendors covering 200+ counties. The remaining ~50 counties use smaller vendors that need a generic Playwright scraping adapter. | Critical |
| 2 | County Clerk Adapters | Only Kofile/PublicSearch adapter is implemented. TexasFile adapter exists for purchases but not free document browsing. | Need adapters for Kofile (~80 counties), Henschen (~40), iDocket (~20), FidlarTechnologies (~15), custom systems (Harris, Dallas, Tarrant, Bexar). Some counties still use microfilm — need a "not available" graceful fallback. | Critical |
| 3 | County-Specific Quirks | Bell County-centric assumptions (e.g., road naming patterns, CAD field names, clerk URL patterns). | Each county has different field names, URL structures, search interfaces, and data formats. Need a county configuration registry with per-county overrides. | High |
| 4 | Cross-County Properties | Not handled. | A property can straddle two counties (e.g., Williamson/Bell county line). Need detection of county-line properties and dual-county research execution. | Medium |

### 11.1.3 Product & UX Gaps

| # | Gap | Current State | Required State | Severity |
|---|-----|---------------|---------------|----------|
| 1 | No User Authentication | CLI tool with API keys. No concept of users, sessions, or roles. | Multi-tenant user system with Supabase Auth. Users sign up, subscribe, and manage their research projects through Starr Compass. | Critical |
| 2 | No Subscription Billing | No payment processing. Document purchases use hard-coded credentials. | Stripe integration for monthly subscriptions (tiers), per-report purchases, and document purchase pass-through billing. | Critical |
| 3 | No Web Frontend | CLI-only. No browser-based UI. | Full Starr Compass integration: search bar, real-time progress dashboard, interactive boundary viewer, report gallery, document library. | Critical |
| 4 | No Real-Time Progress | Phase 10 mentions WebSocket but doesn't implement it. Users must poll /status endpoint. | WebSocket or Server-Sent Events (SSE) push real-time phase progress, per-call extraction results, and confidence updates to the browser as the pipeline runs. | High |
| 5 | No Interactive Report Viewer | PDF is static. User can't click on a boundary call to see sources, can't toggle layers, can't zoom. | Browser-based interactive boundary viewer built in React (canvas or SVG). Click a call → see all source readings. Toggle confidence colors. Show/hide layers. Measure distances. | High |
| 6 | No Document Library | Purchased documents are saved as files on the droplet. No catalog, no re-download, no search. | User-facing document library in Starr Compass. Browse all retrieved and purchased documents. Preview, download, annotate. Track which documents were used in which reports. | High |
| 7 | No Batch Processing | One property at a time. | Developers and title companies need to research 10-500 properties in a single batch job (e.g., all lots in a new subdivision, or all properties in a foreclosure portfolio). | Medium |
| 8 | No Notifications | No email/SMS when research completes. | Email notification with report summary and download link when pipeline finishes. SMS option for critical alerts (e.g., "purchase requires manual approval"). | Medium |
| 9 | No Mobile-Friendly Output | PDF and DXF are desktop-centric. | Responsive web report that works on phone/tablet. Field surveyors need to pull up research results on their phone at the property. | Medium |
| 10 | No Collaboration/Sharing | Reports are per-user with no sharing mechanism. | Share reports with clients, team members, or external parties via link. Permission levels: view-only, download, annotate. | Medium |

### 11.1.4 Infrastructure & Reliability Gaps

| # | Gap | Current State | Required State | Severity |
|---|-----|---------------|---------------|----------|
| 1 | No Retry/Circuit Breaker Pattern | Network requests to county sites have zero retry. A transient 503 kills the pipeline. | Exponential backoff retries (3 attempts) on all external requests. Circuit breakers per county site that trip after 3 consecutive failures and auto-reset after 2 minutes. | Critical |
| 2 | No AI Response Validation | AI returns JSON that gets parsed directly. No verification that bearings are in 0-90° range, distances are positive, or quadrants are consistent. A hallucinated bearing propagates undetected. | JSON Schema validation on every AI response. Surveying-domain guardrails: bearing range checks, distance sanity checks, coordinate system validation, duplicate call detection. | Critical |
| 3 | No Schema Validation Between Phases | Phase 4 assumes Phase 3 output has the exact shape it expects. A missing field causes a runtime crash. | Zod schema validation at every phase boundary. Phase N validates Phase N-1 output before starting. Clear error messages for missing or malformed data. | High |
| 4 | No Automated Test Suite | Zero unit tests. Bearing math, Compass Rule, traverse closure — all untested. | 200+ unit tests covering: bearing parsing, azimuth conversion, traverse closure, Compass Rule, curve geometry, coordinate transforms, address normalization, DXF output validity. | High |
| 5 | No Structured Logging | console.log with no log levels, no correlation IDs, no structured output. | Pino-based structured JSON logging. Correlation ID per research project, per phase, per external request. Log levels: trace/debug/info/warn/error. | High |
| 6 | No Concurrent User Handling | Single-user CLI tool. No queue management for multiple simultaneous pipeline runs. | BullMQ job queue with Redis backend. Max 3 concurrent pipeline runs. Priority queue (paid users first). Rate limiting per county site across all concurrent jobs. | High |
| 7 | No Project Locking | Two simultaneous runs for the same project corrupt shared state in /tmp/analysis/. | File-based or Redis-based project locks. Reject duplicate runs with a clear error. | Medium |
| 8 | No AI Cost Tracking | Claude API calls aren't metered. A 50-lot subdivision could burn $30 in Claude tokens with no visibility. | Track input/output tokens per AI call, per phase, per project. Running cost counter. Budget alerts. | Medium |
| 9 | No Health Monitoring | No health endpoint, no resource monitoring, no alerting. | /health endpoint with database, Redis, and disk checks. Prometheus metrics export. AlertManager rules for disk >90%, memory >85%, failed pipeline count. | Medium |
| 10 | No Data Versioning | Phase 9 overwrites Phase 7 output. No way to compare pre-purchase vs post-purchase reconciliation. | Version every phase output: reconciled_boundary_v1.json, reconciled_boundary_v2.json. Diffing tool to show what changed. | Medium |
| 11 | No Cleanup Policy | /tmp fills up. Old projects never expire. | Configurable retention policy: keep projects for 90 days, then archive to S3 (retain indefinitely), delete local files. | Low |
| 12 | No Idempotency | Re-running Phase 2 downloads duplicate copies of documents already harvested. | Idempotency checks: hash document images, skip re-download if identical. Phase resume skips already-completed steps. | Medium |

### 11.1.5 Data Quality & Analysis Gaps

| # | Gap | Current State | Required State | Severity |
|---|-----|---------------|---------------|----------|
| 1 | No Deep Chain of Title | Phase 5 traces 1-2 predecessor deeds for adjacent properties. No configurable depth. No chain of title for the TARGET property. | Full chain of title engine: trace ownership backward N generations (configurable, default 5). Detect boundary changes over time (e.g., road widening took 10' from the north side in 1978). Build timeline visualization. | High |
| 2 | No Easement Catalog | Easements are mentioned in extraction prompts but not systematically cataloged. | Dedicated easement research engine: search county records for every easement grant, utility easement, drainage easement, pipeline easement, and access easement that affects the property. Extract width, purpose, grantee, recording reference. | High |
| 3 | No Encumbrance Report | No unified view of all encumbrances (liens, easements, deed restrictions, HOA requirements, tax delinquency). | Encumbrance report section: compile every recorded instrument that restricts or encumbers the property. This is the data title companies need for title commitments. | High |
| 4 | No Coordinate Tie Verification | POB coordinates are assumed from the plat/deed but never verified against a known control point. | If the plat references a monument (e.g., "beginning at a TxDOT brass cap"), attempt to find that monument's published coordinates in the TxDOT control point database or NGS datasheet. Compute coordinate discrepancy. | Medium |
| 5 | No Datum/Epoch Detection | Phases assume NAD83 but older deeds may reference NAD27 or magnetic bearings. No automatic detection or conversion. | Detect datum from document context (recording date, bearing patterns, explicit notation). Auto-convert NAD27 → NAD83 bearings using NADCON transformation. Flag magnetic bearings and estimate declination correction. | Medium |
| 6 | No Area Computation Method Comparison | Acreage is computed from coordinate geometry only. | Compute area using both coordinate method and DMD (Double Meridian Distance) method. Compare to deed/plat stated acreage. Flag discrepancies >0.5%. | Low |
| 7 | No Survey Software Export | DXF only. No export to Carlson RW5, Trimble JobXML, or Leica formats. | Export reconciled boundary to RW5 (Carlson), JobXML (Trimble), and CSV (generic). Surveyors can import directly into their data collector. | Medium |
| 8 | No AI Prompt Versioning | Extraction prompts are hard-coded. No way to A/B test, roll back, or track accuracy improvements. | Prompt registry with version numbers. Accuracy metrics per prompt version. A/B testing framework. Automatic rollback if accuracy drops below threshold. | Medium |

---

## 11.2 Module A: FEMA Flood Zone Integration

The single most impactful missing data source. Every mortgage in America requires a flood zone determination. Every elevation certificate needs the BFE. Every property report should include this.

### 11.2.1 Data Sources

| Source | API Type | Coverage | Cost |
|--------|---------|----------|------|
| FEMA NFHL MapService | ArcGIS REST (public) | Nationwide | Free |
| FEMA Flood Map Service Center | Web download (public) | FIRM panels, Letters of Map Change | Free |
| FEMA BFE (Base Flood Elevation) | ArcGIS REST query | Where BFE lines exist | Free |
| FEMA LOMA/LOMR Database | Web query | Letters of Map Amendment/Revision | Free |

### 11.2.2 FEMA NFHL Client (`worker/src/sources/fema-nfhl-client.ts`)

Queries FEMA National Flood Hazard Layer for:
- Flood zone designations (A, AE, V, VE, X, D)
- FIRM panel identification
- Base Flood Elevation (BFE) from nearest BFE line
- LOMA/LOMR records (Letters of Map Amendment/Revision)
- Risk assessment summary (high/moderate/low/undetermined)

**FEMA flood zone designations:**
- `A/AE/AH/AO/AR/A99` = Special Flood Hazard Area (1% annual chance) — high risk
- `V/VE` = Coastal high hazard
- `X` = Moderate to minimal risk (shaded/unshaded)
- `D` = Undetermined

**API:** FEMA NFHL ArcGIS REST — Layer 28 (flood zones), Layer 3 (FIRM panels), Layer 14 (BFE lines), Layer 35 (LOMA/LOMR)

---

## 11.3 Module B: Texas GLO Land Grant Integration

The Texas General Land Office maintains the original land grants and abstract survey records that form the legal foundation of every property in Texas.

### 11.3.1 Data Sources

| Source | URL | Data |
|--------|-----|------|
| GLO Land Grant Database | glo.texas.gov/land/land-management/glo-land-grants | Original patent records, abstract numbers, survey names |
| GLO GIS Viewer | gisweb.glo.texas.gov | Abstract survey boundaries (polygon geometry) |
| GLO ArcGIS REST | gisweb.glo.texas.gov/glomapserver/rest/services | Queryable feature layers for abstracts and surveys |

### 11.3.2 GLO Client (`worker/src/sources/glo-client.ts`)

Queries Texas General Land Office for:
- Original land grant / patent records
- Abstract survey boundaries (polygon geometry)
- Original grantee, grant date, grant type
- Adjacent abstract surveys
- Vacancy risk assessment

---

## 11.4 Module C: TCEQ Environmental Data (`worker/src/sources/tceq-client.ts`)

Queries Texas Commission on Environmental Quality for:
- Underground Storage Tanks (USTs) within search radius
- Contamination sites (Superfund, VCP, brownfield)
- Environmental permits
- Phase I ESA recommendation based on proximity

**Sources:**
- TCEQ Central Registry (facilities, permits)
- PST (Petroleum Storage Tank) database
- Superfund sites
- Water quality data

---

## 11.5 Module D: Texas Railroad Commission (`worker/src/sources/rrc-client.ts`)

Queries Texas RRC for:
- Oil/gas well locations, status, depth, operator
- Pipeline locations, commodity, diameter, setbacks
- Easement width estimates
- Mineral rights notes

**API:** RRC GIS Viewer ArcGIS REST (public, free)

---

## 11.6 Module E: USDA NRCS Soil Data (`worker/src/sources/nrcs-soil-client.ts`)

Queries USDA Soil Data Access for:
- Soil classifications, map unit descriptions
- Hydrologic group, hydric soils, drainage class
- Shrink-swell potential (critical for Central Texas)
- Septic suitability, foundation rating, road subgrade
- Depth to bedrock, water table depth

**API:** SDA REST (public, free)

---

## 11.7 Module F: Statewide Multi-County Adapter Expansion

### 11.7.1 CAD Adapter Build-Out Plan

Phase 1 defined the adapter interface and implemented BIS Consultants. This section specifies the remaining 6 major adapters needed for statewide coverage.

| Priority | Vendor | Counties | Population Coverage | Adapter Complexity |
|----------|--------|----------|--------------------|--------------------|
| 1 | TrueAutomation | ~80 (Travis, Dallas/DCAD, Bexar, Fort Bend) | ~35% of TX population | Medium — ASP.NET WebForms, ViewState-heavy |
| 2 | Tyler Technologies | ~50 (Williamson, Hays, Comal, Guadalupe) | ~15% of TX population | Medium — Aumentum/iasWorld, REST-ish API |
| 3 | Harris County (HCAD) | 1 (but 4.7M people) | ~16% of TX population | High — Custom legacy system, account-number based |
| 4 | Tarrant County (TAD) | 1 (2.1M people) | ~7% of TX population | Medium — Custom system |
| 5 | Capitol Appraisal Group | ~20 (smaller Central TX counties) | ~3% | Low — simpler websites |
| 6 | Pritchard & Abbott | ~30 (rural/mineral-heavy counties) | ~2% | Low — mostly mineral appraisal |
| 7 | Generic Playwright Adapter | ~70 remaining counties | ~5% | High — each site is different, uses AI to parse |

Implementation approach: Build TrueAutomation and Tyler first (covers ~50% of Texas population combined with BIS). Then HCAD/TAD. Then generic adapter with AI-assisted DOM parsing for the long tail.

### 11.7.2 County Clerk Adapter Build-Out Plan

| Priority | Vendor | Counties | Adapter Complexity |
|----------|--------|----------|--------------------|
| 1 | Kofile/PublicSearch | ~80 | Already built |
| 2 | TexasFile | All 254 (aggregator) | Partially built (purchase only, need free browsing) |
| 3 | Henschen & Associates | ~40 | Medium — server-rendered, simpler than Kofile |
| 4 | iDocket | ~20 | Medium — different SPA pattern |
| 5 | Fidlar Technologies | ~15 | Low-Medium |
| 6 | Custom Systems | Harris, Dallas, Tarrant, Bexar | High — each is unique |
| 7 | Counties with No Online Access | ~20+ (rural) | N/A — flag as "manual retrieval required" |

---

## 11.8 Module G: Subscription & Payment Platform

### 11.8.1 Pricing Model (`worker/src/billing/subscription-tiers.ts`)

**Subscription Tiers:**

| Tier | Price | Reports/Mo | Doc Purchases | Batch | Exports |
|------|-------|-----------|---------------|-------|---------|
| Free Trial | $0 | 2 | No | No | PDF only |
| Surveyor Pro | $99/mo | 25 | Yes (+$0.50/pg) | No | All except RW5/JobXML |
| Firm Unlimited | $299/mo | Unlimited | Yes (+$0.25/pg) | Yes | All |
| Enterprise | Custom | Unlimited | Yes (no markup) | Yes | All |

**Per-Report Purchases:**

| Type | Price | Includes |
|------|-------|---------|
| Basic Report | $29 | CAD + free clerk + FEMA |
| Full Report | $79 | All data sources |
| Premium Report | $149 | All sources + $25 document budget |

### 11.8.2 Stripe Integration (`worker/src/billing/stripe-billing.ts`)

- Customer creation with Supabase user ID metadata
- Subscription management (create, cancel, update)
- Per-report one-time charges via PaymentIntent
- Document purchase pass-through billing (actual cost + service fee)
- Metered usage tracking
- Webhook handling for subscription lifecycle events
- Checkout session creation for hosted payment flow
- Webhook signature verification

---

## 11.9 Module H: Starr Compass Web App Integration

### 11.9.1 Frontend Architecture

The research pipeline integrates into Starr Compass as a new top-level feature section.

```
apps/web/
├── app/
│   ├── research/
│   │   ├── page.tsx              ← Research dashboard (list all projects)
│   │   ├── new/page.tsx          ← New research form (address input)
│   │   ├── [projectId]/
│   │   │   ├── page.tsx          ← Project detail (real-time progress → report)
│   │   │   ├── report/page.tsx   ← Interactive report viewer
│   │   │   ├── boundary/page.tsx ← Interactive boundary map (canvas)
│   │   │   ├── documents/page.tsx← Document library for this project
│   │   │   └── export/page.tsx   ← Export options (PDF, DXF, etc.)
│   │   ├── library/page.tsx      ← Global document library
│   │   └── billing/page.tsx      ← Usage, invoices, subscription management
│   └── ...
├── components/
│   ├── research/
│   │   ├── ResearchDashboard.tsx     ← Card grid of projects with status badges
│   │   ├── NewResearchForm.tsx       ← Address input with autocomplete + options
│   │   ├── PipelineProgress.tsx      ← Real-time phase progress (WebSocket)
│   │   ├── PhaseStatusCard.tsx       ← Individual phase status (running/done/failed)
│   │   ├── BoundaryViewer.tsx        ← Interactive SVG/Canvas boundary viewer
│   │   ├── CallDetailPanel.tsx       ← Click a boundary call → see all sources
│   │   ├── ConfidenceDashboard.tsx   ← Visual confidence breakdown
│   │   ├── DiscrepancyList.tsx       ← Sortable discrepancy table
│   │   ├── DocumentGallery.tsx       ← Image gallery of source documents
│   │   ├── DocumentPurchaseModal.tsx ← Confirm purchases before charging
│   │   ├── FloodZoneMap.tsx          ← FEMA overlay on property boundary
│   │   ├── ChainOfTitleTimeline.tsx  ← Ownership history visualization
│   │   ├── ReportHeader.tsx          ← Property summary banner
│   │   ├── ExportMenu.tsx            ← Download format selector
│   │   └── BatchUpload.tsx           ← CSV upload for batch processing
│   └── ...
```

### 11.9.2 Real-Time Progress via WebSocket (`worker/src/websocket/progress-server.ts`)

Real-time pipeline progress via WebSocket:
- Client connects with `?projectId=xxx&token=yyy`
- Receives phase start/complete/fail events
- Progress percentage within phases
- Pipeline completion notification
- Heartbeat ping/pong for connection health

### 11.9.3 Interactive Boundary Viewer

The boundary viewer is a React component that renders the SVG boundary with interactive overlays. Unlike the static SVG/PDF, users can:

- **Click a boundary line** → Side panel shows all source readings for that call, confidence breakdown, and discrepancy details
- **Hover a corner** → Tooltip shows monument type, coordinates, and confidence
- **Toggle layers** → Show/hide: boundary, lot lines, easements, ROW, adjacent labels, flood zones, soil overlay
- **Confidence mode** → Color-code lines by confidence (green/yellow/orange/red) or show all as black
- **Measure tool** → Click two points to measure distance and bearing
- **Export** → One-click download of current view as SVG, PNG, or DXF
- **Flood zone overlay** → Semi-transparent FEMA zone polygons overlaid on boundary

---

## 11.10 Module I: Batch Processing (`worker/src/batch/batch-processor.ts`)

### 11.10.1 Batch Research Queue

Process properties sequentially (or parallel up to concurrency limit). Each property gets its own full pipeline run.

**Use cases:**
- Developer researching all 50 lots in a new subdivision
- Title company processing a foreclosure portfolio
- Surveyor preparing for a multi-property project

### 11.10.2 CSV Batch Upload

Users upload a CSV with columns: `address`, `city`, `state`, `zip`, `county`, `label`

The system parses, validates, estimates cost, and presents a confirmation before starting the batch.

---

## 11.11 Module J: Deep Chain of Title Engine (`worker/src/chain-of-title/chain-builder.ts`)

### 11.11.1 Architecture

```
TARGET PROPERTY
│
├── Current Deed (2023) — ASH FAMILY TRUST ← SMITH
│   ├── references: "being all of Lot 1..."
│   └── instrument: 2023032044
│
├── Prior Deed (2010) — SMITH ← JOHNSON
│   ├── references: "being a 12.358 acre tract..."
│   └── different legal description (unplatted at the time)
│
├── Prior Deed (1998) — JOHNSON ← WILLIAMS
│   ├── references: "part of the Wm. Hartrick Survey..."
│   └── metes and bounds description (pre-subdivision)
│
├── Prior Deed (1975) — WILLIAMS ← HARTRICK ESTATE
│   ├── varas-based measurements
│   └── references: "being 50 varas of the original grant"
│
└── LAND PATENT (1835) — Republic of Texas → William Hartrick
    └── GLO record
```

### 11.11.2 What Chain of Title Reveals

- **Boundary changes over time:** Road widenings, easement grants, lot splits
- **Measurement system transitions:** Varas → feet → metric
- **Datum changes:** NAD27 → NAD83 (explains bearing discrepancies)
- **Missing parcels:** If 100 acres was conveyed to A, and A later sold 50 acres to B and 45 acres to C, where are the remaining 5 acres? (Potential vacancy)
- **Easement grants:** "Reserved unto grantor a 20' access easement along the north line"
- **Deed restriction timelines:** When restrictions were imposed and whether they've expired

Traces ownership backward N generations (configurable, default 5):
- Grantor/grantee chain tracing
- Boundary evolution analysis (acreage changes, road widenings)
- Measurement system transitions (varas → feet)
- Datum change detection (NAD27 → NAD83)
- Easement grant extraction from deed language
- Vacancy analysis (unaccounted acreage from parent tract)

---

## 11.12 Module K: Production Hardening (`worker/src/infra/`)

These items were identified in the gap analysis (Section 11.1.4) and require implementation across the entire pipeline.

### 11.12.1 Retry & Circuit Breaker (`worker/src/infra/resilience.ts`)

Every external HTTP request (county clerk, CAD, TxDOT, FEMA, GLO, TCEQ, RRC, NRCS, Claude API) gets wrapped in a retry-with-circuit-breaker pattern.

**Circuit Breaker:**
- Pre-configured breakers for all external services
- Configurable failure threshold, reset timeout
- States: closed → open → half-open → closed

**Retry with Backoff:**
- Exponential backoff with jitter
- Configurable max attempts and delay limits

### 11.12.2 AI Response Validation (`worker/src/infra/ai-guardrails.ts`)

- Bearing validation (0-90° range, proper quadrant notation: `[N|S] DD°MM'SS" [E|W]`)
- Distance validation (positive, reasonable range)
- Curve parameter validation (radius, arc length, delta consistency)
- Traverse geometry validation (≥3 calls, reasonable perimeter, duplicate detection)
- Full extraction response validation with cleaned output

### 11.12.3 Job Queue for Concurrent Users (`worker/src/infra/job-queue.ts`)

- BullMQ with Redis backend
- Max 3 concurrent pipeline runs
- Rate limiting: 5 jobs/minute
- Priority queue (rush jobs first)
- Job status tracking

---

## 11.13 Module L: Analytics & AI Management

### 11.13.1 Usage Analytics (`worker/src/analytics/usage-tracker.ts`)

Track every research run for product analytics, accuracy measurement, and cost management.

- Event buffering with auto-flush (50 events or 30 seconds)
- Per-user usage summaries
- AI cost tracking per project
- County breakdown analytics
- JSONL append-only log files

**Event types:** `pipeline_started`, `pipeline_completed`, `pipeline_failed`, `phase_completed`, `phase_failed`, `document_purchased`, `ai_extraction`, `report_generated`, `export_downloaded`

### 11.13.2 AI Prompt Registry (`worker/src/ai/prompt-registry.ts`)

- Version-controlled prompt definitions
- Accuracy tracking per version
- Usage statistics (runs, tokens, cost)
- Promote/rollback workflow
- Built-in defaults for plat, deed, and easement extraction

**When a new prompt version is deployed:**
1. Run against 10 known-good properties (ground truth set)
2. Compare extraction accuracy against previous version
3. If accuracy >= previous version, promote to active
4. If accuracy < previous version, keep as testing and alert

---

## 11.14 Module M: Compliance, Security & Legal

### 11.14.1 Data Handling

| Concern | Policy |
|---------|--------|
| County website ToS | Comply with robots.txt. Rate limit to <1 req/3s. No scraping of non-public data. Log all access for audit. |
| Document copyright | County clerk records are public records — no copyright restriction. However, watermarked images from Kofile may have display restrictions. Purchased unwatermarked images are licensed for use. |
| User data isolation | Each user's research data is stored in their Supabase tenant. No cross-user data access except for the shared document cache (de-identified). |
| Payment data | PCI compliance via Stripe — no credit card numbers stored on Starr servers. Stripe handles all payment processing. |
| AI data | Property data sent to Claude API is subject to Anthropic's data retention policy. No PII beyond property addresses and owner names (which are public records). |
| Data retention | Research projects retained for 1 year. Users can delete their data at any time. Purchased documents retained for the user's subscription lifetime. |

### 11.14.2 Security Measures

| Layer | Measure |
|-------|---------|
| API authentication | Supabase JWT tokens for web app. API keys (bcrypt-hashed) for direct API access. |
| County credentials | Stored in environment variables (droplet) or AWS Secrets Manager (production). Never stored in database or logs. |
| Document encryption | Purchased documents encrypted at rest in Supabase Storage (AES-256). |
| Rate limiting | Per-user rate limits: 10 research requests/hour (Pro), 50/hour (Firm). Per-IP rate limits on all endpoints. |
| Audit logging | Every document purchase, every AI call, every export download logged with user ID, timestamp, and IP. |

---

## 11.15 Module N: Survey Software Exports (`worker/src/exports/`)

### 11.15.1 Carlson RW5 Export (`worker/src/exports/rw5-exporter.ts`)

- Space-delimited text format for Carlson Survey / SurvCE
- NAD83 TX Central Zone coordinates
- Boundary closure point

### 11.15.2 Trimble JobXML Export (`worker/src/exports/jobxml-exporter.ts`)

- XML format for Trimble Access / Business Center
- Coordinate system metadata
- Point codes and descriptions

---

## Architecture

```
┌─── Data Sources (Modules A-E) ────────────────────────────────────────┐
│  FEMA NFHL · TX GLO · TCEQ · TX RRC · USDA NRCS                     │
└──────────────────────────┬────────────────────────────────────────────┘
                           │
┌─── Infrastructure (Module K) ─────────────────────────────────────────┐
│  Circuit Breaker · Retry w/Backoff · AI Guardrails · BullMQ Queue    │
├──────────────────────────┼────────────────────────────────────────────┤
│  ┌── Billing (G) ──┐   ┌── Batch (I) ──┐   ┌── Chain of Title (J) ─┐│
│  │ Stripe Billing   │   │ CSV Upload    │   │ Ownership Tracing     ││
│  │ Subscriptions    │   │ Parallel Exec │   │ Vacancy Analysis      ││
│  │ Per-Report       │   │ Progress Roll │   │ Boundary Evolution    ││
│  └──────────────────┘   └───────────────┘   └───────────────────────┘│
├──────────────────────────┼────────────────────────────────────────────┤
│  ┌── WebSocket (H) ─┐   ┌── Exports (N) ─┐  ┌── Analytics (L) ────┐│
│  │ Real-time Progress│   │ Carlson RW5    │  │ Usage Tracking       ││
│  │ Phase-by-Phase    │   │ Trimble JobXML │  │ AI Prompt Registry   ││
│  │ Live Preview      │   │                │  │ Cost Management      ││
│  └──────────────────┘   └────────────────┘  └──────────────────────┘│
└──────────────────────────────────────────────────────────────────────┘
```

---

## File Structure

```
worker/src/
├── types/
│   └── expansion.ts                 ← All Phase 11 interfaces
├── sources/
│   ├── fema-nfhl-client.ts          ← Module A: FEMA flood zones
│   ├── glo-client.ts                ← Module B: TX GLO land grants
│   ├── tceq-client.ts               ← Module C: TCEQ environmental
│   ├── rrc-client.ts                ← Module D: TX Railroad Commission
│   └── nrcs-soil-client.ts          ← Module E: USDA soil data
├── infra/
│   ├── resilience.ts                ← Module K: Circuit breaker & retry
│   ├── ai-guardrails.ts             ← Module K: AI response validation
│   └── job-queue.ts                 ← Module K: BullMQ job queue
├── billing/
│   ├── subscription-tiers.ts        ← Module G: Tier definitions
│   └── stripe-billing.ts            ← Module G: Stripe integration
├── chain-of-title/
│   └── chain-builder.ts             ← Module J: Deep chain engine
├── batch/
│   └── batch-processor.ts           ← Module I: Batch processing
├── exports/
│   ├── rw5-exporter.ts              ← Module N: Carlson RW5
│   └── jobxml-exporter.ts           ← Module N: Trimble JobXML
├── websocket/
│   └── progress-server.ts           ← Module H: WebSocket progress
├── analytics/
│   └── usage-tracker.ts             ← Module L: Usage analytics
└── ai/
    └── prompt-registry.ts           ← Module L: AI prompt versioning
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `REDIS_URL` | `redis://localhost:6379` | Redis connection for BullMQ |
| `STRIPE_SECRET_KEY` | (required) | Stripe API secret key |
| `STRIPE_WEBHOOK_SECRET` | (required) | Stripe webhook signing secret |
| `STRIPE_PRICE_SURVEYOR_PRO` | (required) | Stripe price ID for Surveyor Pro |
| `STRIPE_PRICE_FIRM_UNLIMITED` | (required) | Stripe price ID for Firm Unlimited |

## Dependencies

```json
{
  "bullmq": "^5.0.0",
  "ioredis": "^5.3.0",
  "stripe": "^14.0.0",
  "ws": "^8.16.0"
}
```

---

## 11.16 Implementation Roadmap

| Week | Module | Deliverable |
|------|--------|-------------|
| 31-32 | Production Hardening (K) | Retry/circuit breaker, AI guardrails, schema validation, structured logging, job queue |
| 33-34 | FEMA Integration (A) | NFHL client, flood zone overlay in reports and boundary viewer |
| 35-36 | Statewide CAD Adapters (F) | TrueAutomation adapter, Tyler adapter (covers ~65% of TX population with existing BIS) |
| 37-38 | Statewide Clerk Adapters (F) | Henschen adapter, TexasFile free browsing, iDocket adapter |
| 39-40 | Stripe Billing (G) | Subscription tiers, per-report purchases, document pass-through billing, webhook handling |
| 41-42 | Web Frontend Phase 1 (H) | Research dashboard, new research form, pipeline progress (WebSocket), basic report viewer |
| 43-44 | Interactive Boundary Viewer (H) | Canvas/SVG viewer, click-to-inspect calls, layer toggles, confidence mode, measure tool |
| 45-46 | Additional Data Sources (B-E) | GLO, TCEQ, RRC, NRCS integrations |
| 47-48 | Chain of Title (J) | Deep chain engine, boundary evolution timeline, vacancy analysis |
| 49-50 | Batch Processing (I) | Batch queue, CSV upload, parallel execution, aggregate report |
| 51-52 | Survey Exports & Polish (N) | RW5, JobXML export, mobile-friendly report, notifications, analytics |

---

## 11.17 Acceptance Criteria

| # | Criterion | Verification |
|---|-----------|-------------|
| 1 | FEMA flood zone query returns correct zone for 10 test properties | Compare against FEMA MSC manual lookup |
| 2 | TrueAutomation CAD adapter discovers properties in Travis County | Test with 5 Travis County addresses |
| 3 | Tyler CAD adapter discovers properties in Williamson County | Test with 5 Williamson County addresses |
| 4 | HCAD adapter discovers properties in Harris County | Test with 5 Houston addresses |
| 5 | Henschen clerk adapter retrieves documents | Test in 3 Henschen counties |
| 6 | Stripe subscription creation and billing works end-to-end | Create test subscription, verify charges |
| 7 | Per-report Stripe charge processes correctly | Purchase a report, verify Stripe dashboard |
| 8 | Document purchase pass-through billing charges user correct amount | Purchase document, verify actual cost + service fee |
| 9 | WebSocket progress events fire for all 10 phases | Connect WebSocket, run pipeline, verify all events |
| 10 | Interactive boundary viewer renders correctly in Chrome/Safari/Firefox | Visual inspection across browsers |
| 11 | Click a boundary call → side panel shows all source readings | Functional test |
| 12 | Flood zone overlay renders on boundary viewer | Visual inspection |
| 13 | Chain of title traces back ≥3 generations on test property | Verify against manual title search |
| 14 | Batch processing handles 10 properties without failure | Run batch, verify all 10 complete |
| 15 | TCEQ query returns UST data near test property | Compare against TCEQ website manual search |
| 16 | RRC query returns pipeline data for Eagle Ford Shale property | Compare against RRC GIS viewer |
| 17 | NRCS soil query returns correct soil type for test property | Compare against Web Soil Survey |
| 18 | RW5 export imports into Carlson Survey without errors | Open in Carlson, verify point coordinates |
| 19 | JobXML export imports into Trimble Business Center | Open in TBC, verify point coordinates |
| 20 | Retry logic recovers from transient 503 on county clerk site | Simulate failure, verify retry succeeds |
| 21 | Circuit breaker trips after 3 failures, resets after timeout | Simulate persistent failure, verify behavior |
| 22 | AI guardrails reject hallucinated bearing (>90° degrees value) | Feed invalid AI response, verify rejection |
| 23 | Job queue limits concurrent pipeline runs to 3 | Start 5 simultaneous runs, verify 2 queued |
| 24 | User can view usage and invoices in billing dashboard | Navigate to billing page, verify data |
| 25 | Free trial user is limited to 2 reports/month | Create free account, verify limit enforced |
| 26 | Firm Unlimited user can run batch processing | Verify access control |
| 27 | Research data is isolated between users | User A cannot access User B's projects |
| 28 | Full pipeline completes for properties in Bell, Travis, Williamson, Harris, and Bexar counties | End-to-end test in each county |
| 29 | GLO abstract survey boundary is retrieved and displayed | Compare against GLO GIS viewer |
| 30 | Overall product feels seamless and intuitive to a surveyor who has never used it before | User testing with 3 surveyors unfamiliar with the tool |

---

## 11.18 Revenue Projection Model

| Metric | Conservative | Moderate | Aggressive |
|--------|-------------|----------|-----------|
| Texas RPLS count | 6,000 active | 6,000 | 6,000 |
| Addressable market | Surveyors + title companies + RE attorneys ~15,000 | ~15,000 | ~15,000 |
| Year 1 subscribers | 50 | 200 | 500 |
| Avg revenue/subscriber/month | $120 | $150 | $180 |
| Year 1 subscription revenue | $72,000 | $360,000 | $1,080,000 |
| Per-report purchases/month | 100 | 500 | 2,000 |
| Avg per-report revenue | $55 | $65 | $75 |
| Year 1 per-report revenue | $66,000 | $390,000 | $1,800,000 |
| Document pass-through margin | $5,000 | $25,000 | $100,000 |
| **Year 1 total revenue** | **$143,000** | **$775,000** | **$2,980,000** |

The key insight: every hour a surveyor spends researching a property manually costs their firm $75-150. This tool does 4-8 hours of research in 10-15 minutes. At $79/report, the ROI is immediate and obvious. The value proposition sells itself.

---

*End of Phase 11 — Product Expansion, Statewide Coverage & Subscription Platform*

*Starr Software / Starr Surveying Company — Belton, Texas — March 2026*
