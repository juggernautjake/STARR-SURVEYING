# STARR RECON — AI Property Research Pipeline
## Master Implementation Roadmap v1.0

**Product Name:** Starr Compass — AI Property Research  
**Acronym:** STARR RECON — **S**urvey **T**itle **A**utomated **R**esearch & **R**econnaissance  
**Version:** 1.0 | **Last Updated:** March 2026  
**Maintained By:** Jacob, Starr Surveying Company, Belton, Texas (Bell County)  
**For:** AI Agent Consumption (Claude Code / GitHub Copilot / Claude.ai)

---

> **READ THIS FIRST.** This document is the single source of truth for any AI coding agent working on the STARR RECON pipeline. It tells you what exists, what doesn't, what to build next, and how every piece connects. Read all sections before writing any code.

---

## Table of Contents

1. [Project Identity](#1-project-identity)
2. [Architecture Overview](#2-architecture-overview)
3. [Tech Stack & Infrastructure](#3-tech-stack--infrastructure)
4. [Repository Structure](#4-repository-structure)
5. [The 11-Phase Pipeline — Status Dashboard](#5-the-11-phase-pipeline--status-dashboard)
6. [Phase Specifications — Where to Find Them](#6-phase-specifications--where-to-find-them)
7. [Data Flow — How Phases Connect](#7-data-flow--how-phases-connect)
8. [Core Data Models — Shared Types](#8-core-data-models--shared-types)
9. [Government Data Sources — Integration Map](#9-government-data-sources--integration-map)
10. [County Adapter Registry — Statewide Coverage](#10-county-adapter-registry--statewide-coverage)
11. [Build Order — What to Implement Next](#11-build-order--what-to-implement-next)
12. [Implementation Rules — How to Write Code](#12-implementation-rules--how-to-write-code)
13. [Testing Requirements](#13-testing-requirements)
14. [Domain Knowledge — Surveying Essentials](#14-domain-knowledge--surveying-essentials)
15. [Environment Variables Reference](#15-environment-variables-reference)
16. [File Output Structure](#16-file-output-structure)
17. [API Endpoint Reference](#17-api-endpoint-reference)
18. [CLI Command Reference](#18-cli-command-reference)
19. [Known Issues & Gotchas](#19-known-issues--gotchas)
20. [Glossary](#20-glossary)
21. [Agent Session Template](#21-agent-session-template)

---

## 1. Project Identity

| Field | Value |
|---|---|
| **Product Name** | Starr Compass — AI Property Research |
| **Code Name** | STARR RECON |
| **Company** | Starr Surveying Company, Belton, Texas (Bell County) |
| **Suite** | Part of the Starr Software monorepo (alongside STARR CAD, Compass, Forge, Orbit) |

**What It Does:** Takes ANY Texas property address, autonomously researches the property and every adjacent property across county CAD systems, county clerk records, TxDOT, FEMA, and other government databases, cross-validates all shared boundaries using multi-source AI reconciliation, and produces a confidence-scored research report with CAD-ready exports — all in 10-15 minutes.

**Who It's For:** Licensed surveyors (RPLS), title companies, real estate attorneys, and real estate developers in Texas.

**Business Model:** Subscription SaaS (Surveyor Pro $99/mo, Firm Unlimited $299/mo) + per-report purchases ($29–$149) + document purchase pass-through billing.

**Value Proposition:** Replaces 4–8 hours of manual property research per project. At $79/report, ROI is immediate for any surveyor billing $75–150/hour.

**Relationship to STARR CAD:** STARR CAD draws the boundary. STARR RECON researches it. They share the same Supabase database, same auth system, and same monorepo. A surveyor will run RECON first to gather all data, then open CAD to draft the survey plat.

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        STARR COMPASS WEB APP                        │
│                       (Next.js 14 on Vercel)                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐│
│  │ Research │  │  Report  │  │ Document │  │ Billing / Subscription││
│  │Dashboard │  │  Viewer  │  │ Library  │  │      (Stripe)        ││
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────────┬───────────┘│
│       │             │             │                    │            │
│       └─────────────┴─────────────┴────────────────────┘           │
│                           │ REST API + WebSocket                    │
└───────────────────────────┼─────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  RESEARCH WORKER (DigitalOcean Droplet)             │
│                 Ubuntu + Node.js + Playwright + Express             │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                  10-PHASE RESEARCH PIPELINE                   │  │
│  │                                                               │  │
│  │  [1] Discovery  →  [2] Harvest  →  [3] AI Extract            │  │
│  │                                         ↓                    │  │
│  │  [4] Subdivision ──┐                                         │  │
│  │  [5] Adjacent  ────┤→ [7] Reconcile → [8] Confidence         │  │
│  │  [6] TxDOT ROW ────┘                    ↓                    │  │
│  │                             [9] Purchase → (re-run 7,8)      │  │
│  │                                         ↓                    │  │
│  │                              [10] Reports & Exports           │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  External Connections:                                              │
│  ├── County CAD Systems (BIS, Tyler, TrueAutomation, HCAD, etc.)   │
│  ├── County Clerk Records (Kofile, Henschen, TexasFile, etc.)      │
│  ├── TxDOT (ArcGIS REST + RPAM Playwright)                         │
│  ├── FEMA NFHL (ArcGIS REST)                                       │
│  ├── Texas GLO (ArcGIS REST)                                       │
│  ├── TCEQ (Web scrape + API)                                       │
│  ├── TX Railroad Commission (ArcGIS REST)                          │
│  ├── USDA NRCS Soil Survey (REST API)                              │
│  └── Anthropic Claude API (AI extraction + analysis)               │
└─────────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    SUPABASE (Shared Database)                       │
│  ├── Auth (user accounts, sessions)                                 │
│  ├── PostgreSQL (projects, research data, billing records)          │
│  ├── Storage (documents, images, reports, exports)                  │
│  └── Realtime (WebSocket subscriptions for progress)               │
└─────────────────────────────────────────────────────────────────────┘
```

> **Key Architectural Principle:** Vercel serverless functions **CANNOT** run Playwright or long-running browser automation. ALL heavy processing happens on the DigitalOcean droplet. Vercel handles frontend/auth only. Supabase is the shared state between them.

---

## 3. Tech Stack & Infrastructure

| Layer | Technology | Notes |
|---|---|---|
| Frontend | Next.js 14, TypeScript, Tailwind CSS | Deployed on Vercel |
| Backend/Worker | Node.js + Express + Playwright | DigitalOcean droplet ($12/mo, Ubuntu) |
| Database | Supabase (PostgreSQL) | Shared between Vercel and droplet |
| File Storage | Supabase Storage | Documents, images, reports |
| AI | Anthropic Claude API (`claude-sonnet-4-5-20250929`) | Vision extraction + analysis |
| Browser Automation | Playwright (Chromium) | County clerk/CAD scraping |
| Payments | Stripe | Subscriptions + per-report + document pass-through |
| Job Queue | BullMQ + Redis | Concurrent pipeline management |
| Monorepo | Turborepo | Starr Software suite |
| Auth | Supabase Auth | JWT tokens |
| Logging | Pino (structured JSON) | Correlation IDs per project |
| Coordinate System | NAD83 Texas Central Zone (4203) | US Survey Feet |
| Process Manager | PM2 | Auto-restart on droplet |
| Container | Docker | Droplet deployment |

---

## 4. Repository Structure

```
starr-software/                     # Turborepo monorepo root
├── apps/
│   └── web/                        # Next.js frontend (Vercel)
│       ├── app/
│       │   ├── research/           # ← NEW: AI Research feature pages
│       │   │   ├── page.tsx        # Research dashboard
│       │   │   ├── new/page.tsx    # New research form
│       │   │   ├── [projectId]/
│       │   │   │   ├── page.tsx    # Project detail + progress
│       │   │   │   ├── report/page.tsx      # Interactive report viewer
│       │   │   │   ├── boundary/page.tsx    # Interactive boundary map
│       │   │   │   └── documents/page.tsx   # Document library
│       │   │   ├── library/page.tsx         # Global document library
│       │   │   └── billing/page.tsx         # Usage + invoices
│       │   └── ...                 # Existing Compass/Forge/Orbit pages
│       └── components/
│           └── research/           # ← NEW: Research UI components
│
├── packages/
│   ├── api/                        # Shared API utilities
│   ├── core/                       # Shared types and constants
│   └── ...                         # Existing packages
│
├── worker/                         # ← RESEARCH WORKER (deploys to droplet)
│   ├── src/
│   │   ├── index.ts                # Express server entry point (EXISTS)
│   │   ├── cli/
│   │   │   └── starr-research.ts   # CLI entry point
│   │   ├── pipeline/
│   │   │   ├── phase-1-discovery/  # Property discovery
│   │   │   ├── phase-2-harvest/    # Document harvesting
│   │   │   ├── phase-3-extraction/ # AI document intelligence
│   │   │   ├── phase-4-subdivision/# Subdivision/plat analysis
│   │   │   ├── phase-5-adjacent/   # Adjacent property research
│   │   │   ├── phase-6-txdot/      # TxDOT ROW integration
│   │   │   ├── phase-7-reconciliation/ # Geometric reconciliation
│   │   │   ├── phase-8-confidence/ # Confidence scoring
│   │   │   ├── phase-9-purchase/   # Document purchase
│   │   │   └── phase-10-reports/   # Report generation & exports
│   │   ├── sources/                # Government data source clients
│   │   │   ├── fema-nfhl-client.ts
│   │   │   ├── glo-client.ts
│   │   │   ├── tceq-client.ts
│   │   │   ├── rrc-client.ts
│   │   │   └── nrcs-soil-client.ts
│   │   ├── adapters/
│   │   │   ├── cad/                # CAD system adapters
│   │   │   │   ├── base-cad-adapter.ts
│   │   │   │   ├── bis-adapter.ts          # Bell, McLennan, Coryell, etc.
│   │   │   │   ├── trueautomation-adapter.ts # Travis, Dallas, Bexar, etc.
│   │   │   │   ├── tyler-adapter.ts        # Williamson, Hays, etc.
│   │   │   │   ├── hcad-adapter.ts         # Harris County
│   │   │   │   ├── tad-adapter.ts          # Tarrant County
│   │   │   │   └── generic-adapter.ts      # AI-assisted fallback
│   │   │   └── clerk/              # County clerk adapters
│   │   │       ├── base-clerk-adapter.ts
│   │   │       ├── kofile-adapter.ts       # ~80 counties
│   │   │       ├── henschen-adapter.ts     # ~40 counties
│   │   │       ├── idocket-adapter.ts      # ~20 counties
│   │   │       ├── texasfile-adapter.ts    # Statewide aggregator
│   │   │       └── generic-clerk-adapter.ts
│   │   ├── infra/                  # Production infrastructure
│   │   │   ├── resilience.ts       # Retry + circuit breaker
│   │   │   ├── ai-guardrails.ts    # AI response validation
│   │   │   ├── job-queue.ts        # BullMQ queue management
│   │   │   ├── logger.ts           # Pino structured logging
│   │   │   └── schema-validation.ts# Zod schemas for phase I/O
│   │   ├── billing/                # Stripe integration
│   │   │   ├── stripe-billing.ts
│   │   │   └── subscription-tiers.ts
│   │   ├── exports/                # Output format exporters
│   │   │   ├── rw5-exporter.ts     # Carlson format
│   │   │   ├── jobxml-exporter.ts  # Trimble format
│   │   │   └── csv-exporter.ts     # Generic CSV
│   │   ├── orchestrator/
│   │   │   └── master-orchestrator.ts  # Pipeline runner
│   │   ├── websocket/
│   │   │   └── progress-server.ts  # Real-time progress
│   │   └── routes/                 # Express API routes
│   │       ├── research-routes.ts
│   │       ├── report-routes.ts
│   │       └── billing-routes.ts
│   ├── package.json
│   ├── tsconfig.json
│   └── Dockerfile
│
└── STARR_RECON/                    # ← PLANNING & SPEC DOCUMENTS (this folder)
    ├── STARR_RECON_PHASE_ROADMAP.md    # THIS FILE — master overview
    ├── PHASE_01_DISCOVERY.md
    ├── PHASE_02_HARVEST.md
    ├── PHASE_03_EXTRACTION.md
    ├── PHASE_04_SUBDIVISION.md
    ├── PHASE_05_ADJACENT.md
    ├── PHASE_06_TXDOT.md
    ├── PHASE_07_RECONCILIATION.md
    ├── PHASE_08_CONFIDENCE.md
    ├── PHASE_09_PURCHASE.md
    ├── PHASE_10_REPORTS.md
    └── PHASE_11_EXPANSION.md
```

---

## 5. The 11-Phase Pipeline — Status Dashboard

### Status Key

| Symbol | Meaning |
|---|---|
| 🔴 | **NOT STARTED** — No code exists |
| 🟡 | **SPEC COMPLETE** — Full specification written, no code yet |
| 🟠 | **IN PROGRESS** — Partially implemented |
| 🟢 | **COMPLETE** — Implemented and tested |
| ⚪ | **FUTURE** — Planned for later phase |

### Phase Overview

| # | Phase | Status | Spec Lines | Dependencies | Weeks |
|---|---|---|---|---|---|
| 1 | Universal Property Discovery | 🟡 SPEC COMPLETE | 1,593 | None | 1–3 |
| 2 | Free Document Harvesting | 🟡 SPEC COMPLETE | 1,590 | Phase 1 | 4–6 |
| 3 | AI Document Intelligence | 🟡 SPEC COMPLETE | 1,636 | Phase 2 | 7–9 |
| 4 | Subdivision & Plat Intelligence | 🟡 SPEC COMPLETE | 1,361 | Phase 3 | 10–12 |
| 5 | Adjacent Property Deep Research | 🟡 SPEC COMPLETE | 1,507 | Phase 3, 4 | 13–15 |
| 6 | TxDOT ROW Integration | 🟡 SPEC COMPLETE | 1,287 | Phase 3 | 16–18 |
| 7 | Geometric Reconciliation | 🟡 SPEC COMPLETE | 1,424 | Phases 3–6 | 19–21 |
| 8 | Confidence Scoring | 🟡 SPEC COMPLETE | 1,138 | Phase 7 | 22–23 |
| 9 | Document Purchase | 🟡 SPEC COMPLETE | 1,448 | Phases 2, 3, 7, 8 | 24–26 |
| 10 | Production Reports & Exports | 🟡 SPEC COMPLETE | 1,438 | All prior | 27–30 |
| 11 | Product Expansion & Platform | 🟡 SPEC COMPLETE | 1,662 | All prior | 31–52 |
| — | **TOTAL** | — | **16,084** | — | — |

> **Current Focus:** Begin implementation starting with Phase 1. All specifications are complete. No pipeline code has been written yet.

---

### What HAS Been Built (Pre-Specification)

The following items exist from prototyping and proof-of-concept work:

- ✅ Bell CAD BIS API integration *(proof of concept — needs refactoring to match Phase 1 spec)*
- ✅ Bell County Kofile/PublicSearch Playwright scraper *(proof of concept — needs refactoring to match Phase 2 spec)*
- ✅ Adaptive Vision v2 extraction system *(proof of concept — needs refactoring to match Phase 3 spec)*
- ✅ Property validation pipeline v1 *(proof of concept — needs refactoring to match Phase 7–8 specs)*
- ✅ DigitalOcean droplet provisioned and configured *(Node.js, Playwright, Express)*
- ✅ Deployment guide written *(see `starr-worker-deploy-guide.md`)*

### What Does NOT Exist Yet

- ❌ Proper TypeScript project structure *(the `worker/` pipeline directory)*
- ❌ Any CAD adapter besides BIS
- ❌ Any clerk adapter besides Kofile
- ❌ FEMA, GLO, TCEQ, RRC, NRCS integrations
- ❌ Stripe billing
- ❌ Job queue / concurrent user handling
- ❌ Web frontend in Starr Compass
- ❌ Interactive boundary viewer
- ❌ DXF export
- ❌ Legal description generator
- ❌ Chain of title engine
- ❌ Batch processing
- ❌ Automated test suite

---

## 6. Phase Specifications — Where to Find Them

Each phase has a comprehensive specification document (1,100–1,700 lines) in `STARR_RECON/` containing: goal and deliverable description, architecture diagram, complete TypeScript data models, full implementation code for every module, Express API endpoint definitions, CLI script definitions, and an acceptance criteria checklist.

> **IMPORTANT FOR AI AGENTS:** When implementing a phase, read the **ENTIRE** specification document for that phase first. Do not skim. The specs contain complete TypeScript code that should be used as the implementation starting point.

| Phase | Specification File | Key Modules |
|---|---|---|
| 1 | `PHASE_01_DISCOVERY.md` | AddressNormalizer, CAD registry, BIS adapter, Discovery orchestrator |
| 2 | `PHASE_02_HARVEST.md` | Clerk adapter interface, Kofile adapter, Document harvester |
| 3 | `PHASE_03_EXTRACTION.md` | Adaptive Vision v2, Plat pipeline, Deed pipeline, Property context analyzer |
| 4 | `PHASE_04_SUBDIVISION.md` | Subdivision detector, Lot enumerator, Interior line analyzer, Area reconciler |
| 5 | `PHASE_05_ADJACENT.md` | Adjacent queue builder, Research worker, Cross-validation engine |
| 6 | `PHASE_06_TXDOT.md` | Road classifier, ArcGIS REST client, RPAM fallback, Road boundary resolver |
| 7 | `PHASE_07_RECONCILIATION.md` | Reading aggregator, Source weighter, Reconciliation algorithm, Traverse/Compass Rule |
| 8 | `PHASE_08_CONFIDENCE.md` | Call/lot/side/overall scorers, Discrepancy analyzer, Purchase ROI calculator |
| 9 | `PHASE_09_PURCHASE.md` | Kofile purchase adapter, TexasFile adapter, Watermark comparison, Billing tracker |
| 10 | `PHASE_10_REPORTS.md` | SVG renderer, PNG rasterizer, DXF exporter, PDF generator, Legal description, CLI |
| 11 | `PHASE_11_EXPANSION.md` | FEMA, GLO, TCEQ, RRC, NRCS clients, Stripe billing, Web frontend, Batch processing |

---

## 7. Data Flow — How Phases Connect

Phases produce and consume named JSON files. This is the canonical data contract between phases.

```
INPUT: Property address OR owner name OR property ID
         │
         ▼
┌─── Phase 1: DISCOVERY ──────────────────────────────────────────────┐
│  AddressNormalizer → CAD registry → BIS/TrueAutomation/Tyler/etc.   │
│  OUTPUT: discovery.json                                             │
│    { propertyId, owner, legalDescription, acreage,                  │
│      subdivision, deedReferences, centroid, situs }                 │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
                                  ▼
┌─── Phase 2: HARVEST ────────────────────────────────────────────────┐
│  ClerkAdapter.search() → document list → download watermarked images │
│  OUTPUT: documents.json + image files                               │
│    { harvested documents (plats, deeds, easements) with image paths }│
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
                                  ▼
┌─── Phase 3: AI EXTRACTION ──────────────────────────────────────────┐
│  Adaptive Vision v2 → plat/deed parsing → property context          │
│  OUTPUT: intelligence.json                                          │
│    PropertyIntelligence { boundary calls[], lot data, easements }   │
│  KEY TYPE: BoundaryCall { bearing, distance, type, along,           │
│                           monument, confidence, curve? }            │
└──────────┬──────────────────────┼──────────────────────┬────────────┘
           │                      │                      │
           ▼                      ▼                      ▼
┌── Phase 4 ────────┐  ┌── Phase 5 ────────────┐  ┌── Phase 6 ───────┐
│  SUBDIVISION      │  │  ADJACENT RESEARCH    │  │  TxDOT ROW       │
│  Subdivision      │  │  Identifies all       │  │  Road            │
│  detector, lot    │  │  adjacent properties, │  │  classifier,     │
│  enumerator,      │  │  runs Phases 1-3 on   │  │  ArcGIS REST,    │
│  interior lines,  │  │  each, cross-validates│  │  RPAM fallback   │
│  area reconciler  │  │  shared boundaries    │  │                  │
│  OUTPUT:          │  │  INPUT: intelligence  │  │  INPUT:          │
│  subdivision.json │  │    + subdivision.json │  │  intelligence    │
│                   │  │  OUTPUT:              │  │  OUTPUT:         │
│                   │  │  cross_validation.json│  │  row_data.json   │
└────────┬──────────┘  └───────────┬───────────┘  └──────┬───────────┘
         │                         │                      │
         │  ◀── Phases 4, 5, 6 run in PARALLEL ──────────┘
         │         (all depend only on Phase 3)
         └─────────────────────────┼──────────────────────┘
                                   │
                                   ▼
┌─── Phase 7: RECONCILIATION ─────────────────────────────────────────┐
│  INPUT: intelligence + subdivision + cross_validation + row_data    │
│  Reading aggregator → source weighting → weighted consensus          │
│  Traverse closure computation → Compass Rule adjustment             │
│  OUTPUT: reconciled_boundary.json                                   │
│    ReconciledBoundaryModel — single authoritative boundary           │
│  KEY: Fuses all sources, applies source weighting                   │
│  Source weight order: deed > plat > adjacent > geometric            │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
                                  ▼
┌─── Phase 8: CONFIDENCE ─────────────────────────────────────────────┐
│  INPUT: reconciled_boundary.json                                    │
│  4-factor call scorer → lot/side/overall scorer → discrepancy AI    │
│  OUTPUT: confidence_report.json                                     │
│    { per-call/lot/side/overall scores, discrepancies,               │
│      purchase recommendations ranked by confidence-gain-per-dollar }│
└─────────────────────────┬───────────────────────────────────────────┘
                          │
              ┌───────────┴──────────┐
              │  Low confidence?     │
              ▼                      ▼
     ┌── Phase 9 ──────┐        Continue to Phase 10
     │  PURCHASE       │
     │  INPUT:         │
     │  confidence_    │
     │  report.json    │
     │  Buy docs,      │
     │  re-extract,    │
     │  re-run 7 + 8   │
     │  OUTPUT:        │
     │  purchase_      │
     │  report.json +  │
     │  reconciled_    │
     │  boundary_v2    │
     └────────┬────────┘
              │
              ▼
┌─── Phase 10: REPORTS & EXPORTS ─────────────────────────────────────┐
│  INPUT: ALL of the above                                            │
│  SVG renderer → PNG rasterizer → DXF exporter → PDF generator      │
│  Legal description generator → JSON export                          │
│  OUTPUT: PDF report, DXF drawing, SVG/PNG boundary,                 │
│          legal description text, RW5, JobXML, JSON export           │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─── Phase 11: EXPANSION ─────────────────────────────────────────────┐
│  FEMA, GLO, TCEQ, RRC, NRCS integrations                           │
│  Stripe subscription billing                                        │
│  Starr Compass web frontend                                         │
│  BullMQ job queue + concurrent users                                │
│  Additional county adapters (statewide coverage)                    │
│  Batch processing, chain of title, enterprise features              │
└─────────────────────────────────────────────────────────────────────┘
```

### Critical Data Dependencies

- **Phase 7 is the bottleneck.** It consumes data from ALL upstream phases (3, 4, 5, 6). If any of those fail, Phase 7 must handle missing data gracefully and flag accordingly.
- **Phases 4, 5, 6 are independent of each other.** They can run in parallel after Phase 3 completes. Phase 5 optionally uses Phase 4 output but doesn't require it.
- **Phase 9 triggers a re-run of Phases 7 and 8** after purchasing documents, producing `_v2` outputs.

---

## 8. Core Data Models — Shared Types

These TypeScript interfaces are the contracts between all pipeline phases. Define them **once** in `worker/src/types/` and import everywhere. Never redefine them inline inside a phase module.

### 8.1 Boundary Call (atomic unit of all boundary data)

```typescript
// worker/src/types/boundary.ts

/**
 * A single metes-and-bounds call (one line segment of a boundary).
 * This is the atomic unit of boundary data throughout the entire pipeline.
 */
export interface BoundaryCall {
  callId:     string;    // Unique ID: "PERIM_N1", "LOT3_E2", etc.
  bearing:    string;    // "N 45°30'00\" E" — Texas surveyor bearing format
  distance:   number;    // In feet (US Survey Feet)
  unit:       'feet' | 'varas';  // Almost always feet; varas in historical deeds
  type:       'straight' | 'curve';
  along?:     string;    // "FM 436" | "John Smith property" | "20' utility easement"
  monument?:  string;    // "IRF" | "IRS" | "IPF" | "CONC" | "MAG" | "PKnail"
  confidence: number;    // 0–100

  // Curve parameters (only present if type === 'curve')
  curve?: {
    radius:        number;  // Feet
    arcLength:     number;  // Feet
    delta:         string;  // Central angle: "15°30'00\""
    chordBearing:  string;  // Chord bearing
    chordDistance: number;  // Chord distance in feet
    direction:     'left' | 'right';
  };
}
```

### 8.2 Property Identity (Phase 1 output)

```typescript
// worker/src/types/property.ts

/**
 * Property identity as discovered by Phase 1.
 * This is the primary output of Phase 1 and the primary input to Phase 2.
 */
export interface PropertyIdentity {
  propertyId:         string;
  geoId:              string;
  owner:              string;
  ownerAddress:       string;
  legalDescription:   string;
  acreage:            number;
  assessedValue:      number;
  propertyType:       'real' | 'personal' | 'mineral';
  county:             string;
  countyFIPS:         string;
  cadSystem:          string;   // "bis" | "tyler" | "trueautomation" | etc.
  isSubdivision:      boolean;
  subdivisionName:    string | null;
  totalLots:          number | null;
  lotNumber:          string | null;
  blockNumber:        string | null;
  abstractSurvey:     string;   // "WILLIAM HARTRICK SURVEY, A-488"
  relatedPropertyIds: string[];
  deedReferences: {
    instrumentNumber: string;
    type:             'deed' | 'plat' | 'easement' | 'restriction';
    date:             string;
  }[];
  centroid: { latitude: number; longitude: number };
  situs:    string;             // Full street address
}
```

### 8.3 Full Shared Type Library

The complete type library lives in `worker/src/types/`. All phases import from here.

```typescript
// worker/src/types/research.ts — Pipeline-wide shared types

export type CountyFIPS = string;        // e.g. '48027' for Bell County
export type PropertyId = string;        // County CAD property ID
export type ProjectId  = string;        // Supabase UUID

export interface LatLng {
  lat: number;
  lng: number;
}

/** NAD83 Texas Central Zone (EPSG:4203) in US Survey Feet */
export interface StatePlaneCoord {
  northing: number;   // Y in feet
  easting:  number;   // X in feet
}

export type BearingDirection = 'N' | 'S';
export type EWDirection      = 'E' | 'W';

export interface MetsCall {
  bearing:    string;         // e.g. "N 45°30'00\" E"
  degrees:    number;
  minutes:    number;
  seconds:    number;
  direction:  BearingDirection;
  ewDir:      EWDirection;
  distance:   number;         // US Survey Feet
  unit:       'feet' | 'varas' | 'chains' | 'meters';
  distFeet:   number;         // Always normalized to feet
  curveData?: CurveData;
  rawText:    string;
  confidence: number;         // 0–1 AI extraction confidence
}

export interface CurveData {
  delta:        number;  // Central angle, degrees
  radius:       number;  // Feet
  arc:          number;  // Arc length, feet
  chord:        number;  // Chord distance, feet
  chordBearing: string;
}

export type DocumentType =
  | 'deed' | 'deed_of_trust' | 'warranty_deed' | 'quitclaim_deed'
  | 'plat' | 'easement' | 'right_of_way' | 'lien'
  | 'release' | 'affidavit' | 'court_order' | 'other';

export interface ClerkDocument {
  documentId:        string;
  instrumentNumber:  string;
  county:            string;
  countyFIPS:        CountyFIPS;
  recordingDate:     Date | null;
  documentType:      DocumentType;
  grantors:          string[];
  grantees:          string[];
  legalDescription?: string;
  pageCount:         number;
  volumePage?:       { volume: string; page: string };
  previewUrl?:       string;    // Watermarked preview (free)
  isPurchased:       boolean;
  localPath?:        string;    // Path after purchase
  estimatedPrice?:   number;
  source:            string;    // Clerk system name
}

export interface ExtractionResult {
  propertyId:      PropertyId;
  documentId:      string;
  calls:           MetsCall[];
  closure:         ClosureResult;
  grantor:         string;
  grantee:         string;
  dateSigned:      Date | null;
  dateRecorded:    Date | null;
  consideration?:  number;       // Sale price if disclosed
  poiDescription:  string;       // Point of beginning description
  callbackChain:   string[];     // Deed chain: this deed → prev deed → ...
  aiModel:         string;
  confidence:      number;       // 0–1 overall extraction confidence
  rawText:         string;
}

export interface ClosureResult {
  closes:       boolean;
  closureError: number;   // Feet — distance POB to POE
  closureRatio: number;   // 1:N (e.g. 1:25000)
  areaAcres:    number;
  perimeter:    number;   // Feet
}

export interface BoundaryMatch {
  subjectCallIndex:   number;
  adjacentPropertyId: PropertyId;
  adjacentCallIndex:  number;
  bearingDelta:       number;    // Degrees difference
  distanceDelta:      number;    // Feet difference
  matchConfidence:    number;    // 0–1
  conflictType?:      'bearing_mismatch' | 'distance_mismatch' | 'gap' | 'overlap';
}

export interface ReconciliationResult {
  projectId:    ProjectId;
  matches:      BoundaryMatch[];
  conflicts:    BoundaryMatch[];
  gaps:         BoundaryGap[];
  overlapAreas: OverlapArea[];
  runAt:        Date;
}

export interface BoundaryGap {
  betweenProperties: [PropertyId, PropertyId];
  gapFeet:           number;
  location:          LatLng;
}

export interface OverlapArea {
  betweenProperties: [PropertyId, PropertyId];
  overlapSqFt:       number;
  geometry:          GeoJSONPolygon;
}

export type ConfidenceFlag =
  | 'LOW_SOURCE_COUNT' | 'DEED_CLOSURE_FAIL' | 'ADJACENT_CONFLICT'
  | 'MISSING_PLAT' | 'UNRESOLVED_EASEMENT' | 'TXDOT_ROW_UNCONFIRMED'
  | 'AI_LOW_CONFIDENCE' | 'MULTI_COUNTY';

export interface ConfidenceResult {
  projectId:      ProjectId;
  overallScore:   number;     // 0–100
  boundaryScores: BoundaryScore[];
  flags:          ConfidenceFlag[];
  recommendation: 'PROCEED' | 'PURCHASE_MORE_DOCS' | 'MANUAL_REVIEW' | 'FIELD_VERIFY';
  runAt:          Date;
}

export interface BoundaryScore {
  callIndex:   number;
  bearing:     string;
  distance:    number;
  score:       number;     // 0–100
  sourceCount: number;     // Independent sources confirming this line
  sources:     string[];   // e.g. ['deed', 'plat', 'adjacent_deed', 'cad_geometry']
}

export interface GeoJSONPolygon {
  type:        'Polygon';
  coordinates: Array<Array<[number, number]>>;  // [lng, lat] pairs
}

export interface GeoJSONFeature {
  type:       'Feature';
  geometry:   GeoJSONPolygon;
  properties: Record<string, unknown>;
}

export type PipelinePhase =
  | 'discovery' | 'harvest' | 'extraction' | 'subdivision'
  | 'adjacent' | 'txdot' | 'reconciliation' | 'confidence'
  | 'purchase' | 'reports';

export type PipelineStatus =
  | 'pending' | 'running' | 'waiting_purchase' | 'completed' | 'failed' | 'partial';

export interface PipelineState {
  projectId:     ProjectId;
  status:        PipelineStatus;
  currentPhase:  PipelinePhase;
  startedAt:     Date;
  completedAt?:  Date;
  errorMessage?: string;
  phaseResults:  Partial<Record<PipelinePhase, unknown>>;
  progressPct:   number;   // 0–100
}
```

---

## 9. Government Data Sources — Integration Map

### 9.1 Unified Source Registry

| Source | API Type | Phase | Status | Priority |
|---|---|---|---|---|
| County CAD (BIS) | REST API + Playwright | 1 | 🟠 Prototype exists | P0 |
| County CAD (TrueAutomation) | Playwright (ASP.NET WebForms) | 1 | 🔴 Not started | P1 |
| County CAD (Tyler/Aumentum) | Playwright | 1 | 🔴 Not started | P1 |
| County CAD (HCAD) | Playwright (custom) | 1 | 🔴 Not started | P2 |
| County CAD (TAD) | Playwright (custom) | 1 | 🔴 Not started | P2 |
| County Clerk (Kofile) | Playwright (SPA) | 2, 9 | 🟠 Prototype exists | P0 |
| County Clerk (TexasFile) | Playwright | 2, 9 | 🔴 Purchase adapter only | P1 |
| County Clerk (Henschen) | Playwright | 2 | 🔴 Not started | P2 |
| TxDOT RPAM (ArcGIS REST) | REST API | 6 | 🔴 Not started | P1 |
| TxDOT RPAM (Playwright fallback) | Playwright | 6 | 🔴 Not started | P1 |
| FEMA NFHL | ArcGIS REST (public) | 11 | 🔴 Not started | P1 |
| Texas GLO | ArcGIS REST (public) | 11 | 🔴 Not started | P2 |
| TCEQ | Web scrape + API | 11 | 🔴 Not started | P2 |
| TX Railroad Commission | ArcGIS REST (public) | 11 | 🔴 Not started | P2 |
| USDA NRCS Soil | REST API (public) | 11 | 🔴 Not started | P3 |
| Anthropic Claude API | REST API | 3–8 | 🟢 Working | P0 |

### 9.2 Government GIS & REST API Code Snippets

#### FEMA NFHL (Flood Zones)
```typescript
// Base URL: https://hazards.fema.gov/gis/nfhl/rest/services/public/NFHL/MapServer
// Endpoint: /28/query  (FEMA Flood Zone layer)
// Method: GET
// Key params:
//   geometry: "<lng>,<lat>,<lng>,<lat>"  (bounding box)
//   geometryType: esriGeometryEnvelope
//   spatialRel: esriSpatialRelIntersects
//   outFields: FLD_ZONE,ZONE_SUBTY,SFHA_TF,STATIC_BFE,GFID
//   f: json
//
// Response field mapping:
//   FLD_ZONE → 'AE' | 'X' | 'AH' | 'A' | 'VE' (flood zone type)
//   SFHA_TF  → 'T' | 'F'  (special flood hazard area T=yes F=no)
//   STATIC_BFE → base flood elevation in feet (may be null)

const FEMA_BASE = 'https://hazards.fema.gov/gis/nfhl/rest/services/public/NFHL/MapServer';

async function queryFloodZone(lat: number, lng: number): Promise<FEMAResult> {
  const buffer = 0.001; // ~100 feet
  const bbox   = `${lng - buffer},${lat - buffer},${lng + buffer},${lat + buffer}`;
  const url    = `${FEMA_BASE}/28/query?geometry=${bbox}&geometryType=esriGeometryEnvelope`
               + `&spatialRel=esriSpatialRelIntersects&outFields=FLD_ZONE,SFHA_TF,STATIC_BFE`
               + `&returnGeometry=false&f=json`;
  const resp = await fetch(url);
  const data = await resp.json() as { features: Array<{ attributes: Record<string, string> }> };
  if (!data.features?.length) return { floodZone: 'UNKNOWN', sfha: false };
  const attr = data.features[0].attributes;
  return {
    floodZone: attr['FLD_ZONE'] ?? 'UNKNOWN',
    sfha:      attr['SFHA_TF'] === 'T',
    bfe:       attr['STATIC_BFE'] ? parseFloat(attr['STATIC_BFE']) : undefined,
  };
}
```

#### Texas GLO (General Land Office) — Abstract Boundaries
```typescript
// Base URL: https://gisweb.glo.texas.gov/arcgis/rest/services
// Service: /LandInformation/GLO_Abstract_Boundaries/MapServer/0
// Purpose: Identify original survey abstract (e.g. "J.W. SMITH SURVEY, A-1234")
// Key params:
//   geometry: point or bounding box
//   outFields: ABSTRACT_NO,ABSTRACT_NAME,SURVEY_NAME,COUNTY,ACRES

const GLO_BASE = 'https://gisweb.glo.texas.gov/arcgis/rest/services';

async function queryAbstract(lat: number, lng: number): Promise<GLOResult> {
  const url = `${GLO_BASE}/LandInformation/GLO_Abstract_Boundaries/MapServer/0/query`
            + `?geometry=${lng},${lat}&geometryType=esriGeometryPoint`
            + `&spatialRel=esriSpatialRelIntersects`
            + `&outFields=ABSTRACT_NO,ABSTRACT_NAME,SURVEY_NAME,COUNTY,ACRES`
            + `&returnGeometry=false&f=json`;
  const resp = await fetch(url);
  const data = await resp.json() as { features: Array<{ attributes: Record<string, string> }> };
  if (!data.features?.length) return { abstractName: null, abstractNumber: null };
  const attr = data.features[0].attributes;
  return {
    abstractName:   attr['ABSTRACT_NAME'] ?? null,
    abstractNumber: attr['ABSTRACT_NO'] ?? null,
    surveyName:     attr['SURVEY_NAME'] ?? null,
    acres:          attr['ACRES'] ? parseFloat(attr['ACRES']) : undefined,
  };
}
```

#### USDA NRCS Soil Survey
```typescript
// Soil Data Access API (REST)
// URL: https://SDMDataAccess.sc.egov.usda.gov/Tabular/post.rest
// Purpose: Get soil classification, erosion risk, prime farmland designation
// Method: POST with SQL query in body

async function querySoilData(lat: number, lng: number): Promise<SoilResult> {
  const query = `
    SELECT mu.muname, mu.musym, mu.mukey,
           comp.comppct_r, comp.compname, comp.taxclname,
           comp.tfact, comp.wei, comp.weg
    FROM mapunit AS mu
    INNER JOIN component AS comp ON mu.mukey = comp.mukey
    WHERE mu.mukey IN (
      SELECT DISTINCT mukey FROM SDA_Get_Mukey_from_intersection_with_WktWgs84(
        'point(${lng} ${lat})'
      )
    )
    AND comp.majcompflag = 'Yes'
    ORDER BY comp.comppct_r DESC
  `;
  const resp = await fetch('https://SDMDataAccess.sc.egov.usda.gov/Tabular/post.rest', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    `query=${encodeURIComponent(query)}&format=json`,
  });
  const data = await resp.json() as { Table: string[][] };
  return parseSoilResponse(data);
}
```

#### TxDOT RPAM (Right-of-Way & Property Asset Management)
```typescript
// TxDOT ROW data requires Playwright automation against:
// URL: https://rpam.txdot.gov/
// Auth: Public access (no login required for basic queries)
// Purpose: Right-of-way width, ROW deed references, ROW acquisition dates
//
// Also available via ArcGIS REST:
// https://services.arcgis.com/KTcxiTD9dsQw4r7Z/arcgis/rest/services/
//   TxDOT_Roadways/FeatureServer/0/query
// Useful for: road classification, ROW width field (not always populated)

async function queryTxDOTRow(lat: number, lng: number, bufferFeet: number): Promise<TxDOTResult> {
  // Convert feet to approximate decimal degrees (Texas ~1 ft ≈ 0.0000025°)
  const bufferDeg = bufferFeet * 0.0000025;
  const bbox = `${lng - bufferDeg},${lat - bufferDeg},${lng + bufferDeg},${lat + bufferDeg}`;
  const url  = 'https://services.arcgis.com/KTcxiTD9dsQw4r7Z/arcgis/rest/services'
             + '/TxDOT_Roadways/FeatureServer/0/query'
             + `?geometry=${bbox}&geometryType=esriGeometryEnvelope`
             + '&spatialRel=esriSpatialRelIntersects'
             + '&outFields=RTE_NM,HWY_NM,F_SYSTEM,NHS,RDBD_TYPE,ROW_WD'
             + '&returnGeometry=true&f=json';
  const resp = await fetch(url);
  const data = await resp.json() as { features: TxDOTFeature[] };
  return parseTxDOTResponse(data);
}
```

#### Texas Railroad Commission (RRC)
```typescript
// ArcGIS REST — Oil/Gas wells and pipelines
// URL: https://gis.rrc.texas.gov/arcgis/rest/services/RRC/Wells/MapServer
// Layer 0: Active wells, Layer 1: Plugged wells, Layer 2: Pipelines
// Purpose: Identify oil/gas wells or pipelines on or near property (affects easements)

const RRC_BASE = 'https://gis.rrc.texas.gov/arcgis/rest/services/RRC/Wells/MapServer';

async function queryWells(lat: number, lng: number): Promise<RRCResult> {
  const buffer = 0.005; // ~500 feet
  const bbox   = `${lng - buffer},${lat - buffer},${lng + buffer},${lat + buffer}`;
  const url    = `${RRC_BASE}/0/query?geometry=${bbox}&geometryType=esriGeometryEnvelope`
               + `&spatialRel=esriSpatialRelIntersects`
               + `&outFields=API_NO,OPERATOR,WELL_TYPE,STATUS_CD,SPUD_DATE`
               + `&returnGeometry=false&f=json`;
  const resp = await fetch(url);
  const data = await resp.json() as { features: RRCFeature[] };
  return { wells: data.features.map(parseWell), queried_at: new Date() };
}
```

---

## 10. County Adapter Registry — Statewide Coverage

The goal is 100% Texas county coverage via a registry-based factory pattern. Texas has 254 counties using 8 CAD vendors and multiple clerk systems.

### 10.1 CAD System Vendors

| Vendor | Approx Counties | Key Counties | Adapter Status |
|---|---|---|---|
| BIS Consultants | 30 | Bell, McLennan, Coryell, Lampasas | 🟠 Prototype |
| TrueAutomation | 80 | Travis, Dallas, Bexar, Fort Bend, Denton | 🔴 Not started |
| Tyler Technologies | 50 | Williamson, Hays, Comal, Guadalupe | 🔴 Not started |
| Harris County (HCAD) | 1 | Harris (Houston, 4.7M people) | 🔴 Not started |
| Tarrant County (TAD) | 1 | Tarrant (Fort Worth, 2.1M people) | 🔴 Not started |
| Capitol Appraisal | 20 | Smaller Central TX counties | 🔴 Not started |
| Pritchard & Abbott | 30 | Rural/mineral counties | 🔴 Not started |
| Other/Custom | 42 | Various | 🔴 Generic adapter needed |

### 10.2 County Clerk Vendors

| Vendor | Approx Counties | Adapter Status |
|---|---|---|
| Kofile/PublicSearch | 80 | 🟠 Prototype |
| Henschen & Associates | 40 | 🔴 Not started |
| iDocket | 20 | 🔴 Not started |
| Fidlar Technologies | 15 | 🔴 Not started |
| TexasFile (aggregator) | All 254 | 🔴 Free browse not built |
| Custom systems | 15 (large counties) | 🔴 Not started |
| No online access | ~20+ (rural) | N/A — flag as manual |

### 10.3 Registry Factory Pattern

```typescript
// worker/src/adapters/cad/registry.ts

export interface CountyAdapterConfig {
  countyFIPS:   CountyFIPS;
  countyName:   string;
  cadSystem:    'BIS' | 'Tyler' | 'TrueAutomation' | 'HCAD' | 'TAD' | 'Generic';
  baseUrl:      string;
  searchUrl?:   string;
  requiresAuth: boolean;
  notes?:       string;
}

export const COUNTY_ADAPTER_REGISTRY: CountyAdapterConfig[] = [
  // ── Bell County ──────────────────────────────────────────────────
  { countyFIPS: '48027', countyName: 'Bell',     cadSystem: 'BIS',
    baseUrl: 'https://bell-cad.thecadweb.com',   requiresAuth: false },
  // ── McLennan County ──────────────────────────────────────────────
  { countyFIPS: '48309', countyName: 'McLennan', cadSystem: 'BIS',
    baseUrl: 'https://mclennan-cad.thecadweb.com', requiresAuth: false },
  // ── Travis County ────────────────────────────────────────────────
  { countyFIPS: '48453', countyName: 'Travis',   cadSystem: 'TrueAutomation',
    baseUrl: 'https://www.traviscad.org',         requiresAuth: false },
  // ── Harris County ────────────────────────────────────────────────
  { countyFIPS: '48201', countyName: 'Harris',   cadSystem: 'HCAD',
    baseUrl: 'https://hcad.org',
    searchUrl: 'https://public.hcad.org/records/details.asp', requiresAuth: false },
  // ── Tarrant County ───────────────────────────────────────────────
  { countyFIPS: '48439', countyName: 'Tarrant',  cadSystem: 'TAD',
    baseUrl: 'https://www.tad.org',               requiresAuth: false },
  // ... all 254 Texas counties ultimately
];

export function getCADAdapter(countyFIPS: CountyFIPS): BaseCADAdapter {
  const config = COUNTY_ADAPTER_REGISTRY.find(c => c.countyFIPS === countyFIPS);
  if (!config) return new GenericCADAdapter(countyFIPS);
  switch (config.cadSystem) {
    case 'BIS':            return new BISAdapter(config);
    case 'Tyler':          return new TylerAdapter(config);
    case 'TrueAutomation': return new TrueAutomationAdapter(config);
    case 'HCAD':           return new HCADAdapter(config);
    case 'TAD':            return new TADAdapter(config);
    default:               return new GenericCADAdapter(countyFIPS);
  }
}
```

---

## 11. Build Order — What to Implement Next

Implementation is organized into 5 tiers. Complete each tier before starting the next. Each task has a clear deliverable and acceptance test.

### TIER 0: Project Scaffolding *(Week 1)*

| # | Task | Deliverable | Accept When |
|---|---|---|---|
| 0.1 | Create `worker/` with proper TypeScript project | `package.json`, `tsconfig.json`, `src/` structure | `npm run build` succeeds with zero errors |
| 0.2 | Define shared types in `worker/src/types/` | `boundary.ts`, `property.ts`, `documents.ts`, `reports.ts` | All types from phase specs are defined |
| 0.3 | Set up Express server with health endpoint | `server.ts` with `/health` returning 200 | `curl localhost:3100/health` returns OK |
| 0.4 | Set up Pino structured logging | `infra/logger.ts` | Every log line is JSON with timestamp and correlation ID |
| 0.5 | Set up retry + circuit breaker utilities | `infra/resilience.ts` | Unit tests pass for retry and circuit breaker |
| 0.6 | Set up AI guardrails | `infra/ai-guardrails.ts` | Rejects bearing >90°, negative distance, invalid format |
| 0.7 | Set up Zod schema validation for phase I/O | `infra/schema-validation.ts` | Each phase output has a Zod schema |
| 0.8 | Copy POC code into proper structure | Refactor existing Bell CAD + Kofile code | Old code runs from new project structure |

### TIER 1: Core Pipeline — Phases 1–3 *(Weeks 2–6)*

| # | Task | Phase | Spec Section | Accept When |
|---|---|---|---|---|
| 1.1 | Address normalizer | 1 | §1.4 | Handles FM/RR roads, TX address quirks, generates variants |
| 1.2 | CAD system registry | 1 | §1.3 | Returns correct vendor/URL for any TX county |
| 1.3 | BIS CAD adapter (production) | 1 | §1.5 | Discovers property by address in Bell County |
| 1.4 | Discovery orchestrator | 1 | §1.6 | End-to-end: address → `PropertyIdentity` JSON |
| 1.5 | `POST /research/discover` endpoint | 1 | §1.7 | Returns 202, async produces `discovery.json` |
| 1.6 | Kofile clerk adapter (production) | 2 | §2.4 | Downloads watermarked plat/deed images from Bell County |
| 1.7 | Document harvester orchestrator | 2 | §2.5 | End-to-end: discovery → all available documents |
| 1.8 | `POST /research/harvest` endpoint | 2 | §2.6 | Returns 202, async produces `documents.json` |
| 1.9 | Adaptive Vision v2 (plat extraction) | 3 | §3.4A | Extracts all boundary calls from plat image |
| 1.10 | Deed text extraction | 3 | §3.4B | Extracts metes-and-bounds from deed image |
| 1.11 | Property context analyzer | 3 | §3.5 | Determines subdivision vs standalone, identifies context |
| 1.12 | `POST /research/extract` endpoint | 3 | §3.6 | Returns 202, async produces `intelligence.json` |

> **Milestone:** After Tier 1, the pipeline can discover a Bell County property, download its documents, and extract boundary data with AI. This is the minimum viable pipeline.

### TIER 2: Cross-Validation — Phases 4–6 *(Weeks 7–12)*

| # | Task | Phase | Spec Section | Accept When |
|---|---|---|---|---|
| 2.1 | Subdivision detector + lot enumerator | 4 | §4.3–4.4 | Identifies all lots in subdivision, enumerates each |
| 2.2 | Interior line analysis | 4 | §4.5 | Extracts shared lot boundary lines |
| 2.3 | Area reconciliation | 4 | §4.7 | Lot acreages sum to total within tolerance |
| 2.4 | Adjacent research queue builder | 5 | §5.3 | Identifies all adjacent properties from Phase 3 data |
| 2.5 | Adjacent property research worker | 5 | §5.4 | Runs Phases 1–3 on each adjacent property |
| 2.6 | Cross-validation engine | 5 | §5.5 | Compares shared boundary calls, produces match status |
| 2.7 | TxDOT ArcGIS REST client | 6 | §6.5 | Queries TxDOT ROW FeatureServer for road data |
| 2.8 | RPAM Playwright fallback | 6 | §6.6 | Screenshots RPAM map, uses AI to extract ROW |
| 2.9 | Road boundary conflict resolver | 6 | §6.8 | Resolves straight vs curved ROW conflicts |

> **Milestone:** After Tier 2, the pipeline has multi-source data for every boundary call. Ready for reconciliation.

### TIER 3: Reconciliation & Reports — Phases 7–10 *(Weeks 13–20)*

| # | Task | Phase | Spec Section | Accept When |
|---|---|---|---|---|
| 3.1 | Reading aggregator | 7 | §7.3 | Collects all readings per call from 6 source types |
| 3.2 | Source weighting | 7 | §7.4 | Correctly ranks deed > plat > adjacent > geometric |
| 3.3 | Reconciliation algorithm | 7 | §7.5 | Weighted consensus + authoritative override |
| 3.4 | Traverse closure + Compass Rule | 7 | §7.6 | Closure within 1:15,000, Compass Rule adjustment |
| 3.5 | Call-level confidence scorer | 8 | §8.3 | 4-factor model, 0–100 scores, A–F grades |
| 3.6 | Discrepancy analyzer | 8 | §8.5 | AI root-cause analysis with ≥2 causes per discrepancy |
| 3.7 | Purchase ROI calculator | 8 | §8.6 | Ranked recommendations by confidence-gain-per-dollar |
| 3.8 | Surveyor decision matrix | 8 | §8.7 | "Field-ready" vs "purchase first" determination |
| 3.9 | Kofile purchase adapter | 9 | §9.3 | Logs in, finds, purchases, downloads official images |
| 3.10 | Watermark comparison engine | 9 | §9.5 | Identifies changed vs confirmed readings |
| 3.11 | SVG boundary renderer | 10 | §10.4 | Produces valid SVG with all labels, monuments, curves |
| 3.12 | DXF exporter | 10 | §10.6 | Opens in AutoCAD Civil 3D with correct layers |
| 3.13 | PDF report generator | 10 | §10.7 | Multi-section professional report |
| 3.14 | Legal description generator | 10 | §10.8 | Texas-standard `THENCE`/POB format |
| 3.15 | Master orchestrator + CLI | 10 | §10.9–10.10 | `starr-research run --address "..."` produces all outputs |

> **Milestone:** After Tier 3, the full pipeline runs end-to-end for Bell County properties. This is **MVP**.

### TIER 4: Production & Expansion *(Weeks 21–30)*

| # | Task | Phase | Accept When |
|---|---|---|---|
| 4.1 | TrueAutomation CAD adapter | 11/F | Discovers properties in Travis County |
| 4.2 | Tyler CAD adapter | 11/F | Discovers properties in Williamson County |
| 4.3 | FEMA NFHL integration | 11/A | Returns correct flood zone for 10 test properties |
| 4.4 | Stripe subscription billing | 11/G | Creates subscriptions, charges for reports |
| 4.5 | WebSocket real-time progress | 11/H | Browser receives phase updates in real-time |
| 4.6 | Starr Compass frontend — research dashboard | 11/H | Lists projects, shows status badges |
| 4.7 | Starr Compass frontend — interactive boundary viewer | 11/H | Click calls, toggle layers, measure distances |
| 4.8 | BullMQ job queue | 11/K | 3 concurrent pipelines, priority queue |
| 4.9 | Henschen clerk adapter | 11/F | Retrieves documents from Henschen counties |
| 4.10 | HCAD adapter | 11/F | Discovers properties in Harris County |

### TIER 5: Premium Features *(Weeks 31–52)*

| # | Task | Phase | Accept When |
|---|---|---|---|
| 5.1 | GLO land grant integration | 11/B | Returns abstract survey data for test property |
| 5.2 | TCEQ environmental data | 11/C | Returns UST/contamination data near test property |
| 5.3 | RRC oil/gas data | 11/D | Returns pipeline/well data for Eagle Ford property |
| 5.4 | NRCS soil data | 11/E | Returns soil type and engineering ratings |
| 5.5 | Deep chain of title engine | 11/J | Traces 5+ generations, detects boundary changes |
| 5.6 | Batch processing | 11/I | Processes 10+ properties in a single batch |
| 5.7 | RW5 + JobXML exports | 11/N | Imports into Carlson and Trimble software |
| 5.8 | Remaining county adapters | 11/F | 90%+ of TX population covered |
| 5.9 | AI prompt versioning + accuracy tracking | 11/L | A/B test prompts, measure accuracy |
| 5.10 | Enterprise features (custom branding, SSO) | 11/G | White-label reports for firms |

---

## 12. Implementation Rules — How to Write Code

**These rules apply to ALL code in the research pipeline. Follow them strictly.**

### 12.1 General

1. **TypeScript strict mode** — `"strict": true` in tsconfig. No `any` types except where interfacing with untyped external APIs.
2. **Every external HTTP request** must use `retryWithBackoff()` from `infra/resilience.ts`.
3. **Every county website interaction** must use a `CircuitBreaker` instance.
4. **Every AI API call** must validate the response with `ai-guardrails.ts` before using the data.
5. **Every phase output** must be validated with its Zod schema before saving.
6. **Never fabricate data.** If the AI can't extract something, set it to `null` with `confidence: 0`. Never invent bearings, distances, or any data.
7. **Log everything.** Use `logger.info()` / `logger.warn()` / `logger.error()` — never `console.log`.
8. **Correlation IDs.** Every log line must include the `projectId`. Use `logger.child({ projectId })`.
9. **Idempotent phases** — Every phase must be re-runnable. If results already exist in Supabase for a `projectId`, return cached results rather than re-querying.
10. **File naming** — kebab-case for files, PascalCase for classes, camelCase for functions/variables. Prefix adapters with system name (e.g. `bis-adapter.ts`, `kofile-adapter.ts`).
11. **No secrets in code** — API keys in `.env` (never committed). Clerk credentials in Supabase Vault. Access via `process.env.VARIABLE_NAME`.

### 12.2 Surveying Domain Rules

These are non-negotiable constraints on all surveying data in the pipeline.

| Rule | Constraint |
|---|---|
| Bearing format | **ALWAYS** `[N\|S] DD°MM'SS" [E\|W]`. Degrees 0–90, minutes 0–59, seconds 0–59.99 |
| Distance unit | US Survey Feet (`1 ft = 1200/3937 meters`). **NOT** International Feet |
| Coordinate system | NAD83 Texas Central Zone (EPSG:4203), US Survey Feet |
| Vara conversion | `1 vara = 33⅓ inches = 2.7778 feet`. Convert all vara measurements before any math |
| Closure formula | `error_dist / total_perimeter = 1:XXXXX`. Acceptable: ≥ 1:15,000 |
| Compass Rule | `correction_i = −error × (cumulative_dist_i / total_perimeter)` |
| Curve math | Given any two of `{R, L, Δ, chord}`, compute the rest: `R = L / (Δ in radians)`, `chord = 2R × sin(Δ/2)` |
| Monument abbreviations | `IRF` = iron rod found, `IRS` = iron rod set, `IPF` = iron pipe found, `IPS` = iron pipe set, `CONC` = concrete monument, `MAG` = mag nail, `PKnail` = PK nail |

### 12.3 Rate Limiting Rules

| Site | Max Rate | Delay Between Pages | Circuit Breaker |
|---|---|---|---|
| County CAD (BIS API) | 5 req/s | 200 ms | 3 failures → 60 s open |
| County Clerk (Kofile) | 2 sessions | 3–5 s between navigations | 3 failures → 120 s open |
| TexasFile | 5 req/s | 1 s between downloads | 3 failures → 60 s open |
| TxDOT RPAM (ArcGIS) | 10 req/s | None needed | 3 failures → 30 s open |
| FEMA NFHL (ArcGIS) | 10 req/s | None needed | 3 failures → 30 s open |
| Claude API | Per tier limits | N/A | Built-in retry |

### 12.4 Error Handling Rules

| Scenario | Behavior |
|---|---|
| Critical phase failure (1, 2, 3, 7, 8) | Halt pipeline, surface error to user |
| Non-critical phase failure (4, 5, 6, 9) | Log and skip. Pipeline continues with available data |
| Partial success in Phase 5 | If 3 of 6 adjacent properties succeed, report partial results. Do not fail the whole phase |
| County site down | Skip that data source, note in report, suggest manual retrieval |
| AI hallucination detected | Log invalid response, retry with modified prompt (max 2 retries), then set `confidence: 0` if still invalid |

**Error type hierarchy (three types only):**
- `SourceUnavailableError` — remote system is down; continue pipeline without this source
- `DataNotFoundError` — system works but no data exists for this property; log and continue
- `PipelineError` — unrecoverable; halt pipeline and notify user

---

## 13. Testing Requirements

### 13.1 Unit Tests *(Required Before Any Phase Is Marked Complete)*

| Category | Tests | Coverage |
|---|---|---|
| Bearing math | Parse bearing string, convert to azimuth, convert back | 20+ test cases including edge cases (`N 0°00'00" E`, `S 90°00'00" W`) |
| Traverse closure | Compute ΔN/ΔE from bearing+distance, sum to closure error | 5+ known-geometry test cases |
| Compass Rule | Apply Compass Rule adjustment, verify corrections | 3+ test cases against manual calculation |
| Curve geometry | Given R+Δ compute L, given R+L compute Δ, chord computation | 10+ test cases |
| Address normalization | FM/RR roads, directional prefixes, apartment numbers, rural routes | 20+ Texas-specific test cases |
| Bearing validation | Accept valid, reject >90°, reject negative minutes, reject invalid format | 15+ test cases |
| Distance validation | Accept positive, reject negative, reject >50,000, reject zero | 10+ test cases |
| Source weighting | Verify deed > plat > adjacent > geometric ranking | 5+ test cases |
| Coordinate transform | State Plane to SVG coordinates, Y-axis flip | 5+ test cases |

### 13.2 Integration Tests *(Required Per County Adapter)*

Each CAD and clerk adapter must be tested against real county websites with known properties. Integration tests use real network calls but are **skipped in CI** unless `INTEGRATION_TEST=true`.

| Test | Properties |
|---|---|
| Bell County (BIS + Kofile) | `3779 FM 436` (Ash Trust), `2913 Oakdale Dr`, `1234 Main St Belton` |
| Travis County (TrueAutomation) | 5 Austin addresses |
| Williamson County (Tyler) | 5 Round Rock/Georgetown addresses |
| Harris County (HCAD) | 5 Houston addresses |

### 13.3 End-to-End Tests

One full pipeline run on a known property where the expected output has been manually verified.

**Test Property:** `3779 FM 436, Belton, TX 76513` (ASH FAMILY TRUST)

| Attribute | Known Value |
|---|---|
| Property type | 6-lot subdivision |
| South boundary | Borders FM 436 (TxDOT road) |
| Plat instrument | `2023032044` |
| Deed instrument | `2010043440` |
| Expected perimeter | ~14 calls |
| Expected closure | Better than 1:15,000 |

The E2E test runs nightly on the droplet via cron and produces a comparison report against this baseline.

### 13.4 Test Data Fixtures

Live in `worker/src/__tests__/fixtures/`:

```
fixtures/
├── bell-county-sample-deed.pdf       # Real Bell County warranty deed
├── bell-county-plat.pdf              # Sample subdivision plat (2023032044)
├── expected-extraction.json          # Expected Phase 3 output for the sample deed
├── expected-discovery.json           # Expected Phase 1 output for 3779 FM 436
└── expected-reconciliation.json      # Expected Phase 7 output for the test subdivision
```

### 13.5 Running Tests

```bash
# In the worker/ directory:
npm test                    # All unit tests (vitest)
npm run test:integration    # Integration tests (requires .env with real credentials)
npm run test:e2e            # Full pipeline E2E test against 3779 FM 436
npm run test:coverage       # Unit tests + coverage report (target: >80%)
```

---

## 14. Domain Knowledge — Surveying Essentials

AI agents implementing this pipeline **MUST** understand these concepts. Incorrect implementations of surveying math will produce silently wrong results.

### 14.1 Metes and Bounds

Texas properties are described by a sequential list of **calls** (bearing + distance pairs) that trace the property boundary clockwise, starting and ending at the **Point of Beginning (POB)**. If the calls are accurate, the traverse returns to the POB with zero error (perfect closure).

A real Texas deed call sequence:
```
BEGINNING at a 1/2 inch iron rod found in the north right-of-way line of
Farm-to-Market Road 2410, said point being the southwest corner of the
herein described tract;
THENCE North 89°45'22" East, with said north right-of-way line,
  a distance of 523.45 feet to a 1/2 inch iron rod set;
THENCE North 00°14'38" West, departing said right-of-way line,
  a distance of 348.20 feet to a 1/2 inch iron rod set;
...
THENCE South 00°14'38" East, a distance of 348.20 feet to the
  POINT OF BEGINNING, containing 4.19 acres of land.
```

Each `THENCE` clause is one call. The description **must close** — the last call returns to the POB.

**Old deed unit conversions (apply before any math):**

| Unit | Feet | Notes |
|---|---|---|
| Vara | 2.7778 ft | Spanish colonial unit, `33⅓ inches` |
| Chain | 66 ft | Gunter's chain, 100 links |
| Link | 0.66 ft | `1/100` of a chain |
| Rod / pole / perch | 16.5 ft | All three are the same unit |

### 14.2 Bearing Notation

```
          N
          │
    NW    │    NE
          │
  W ──────┼────── E
          │
    SW    │    SE
          │
          S
```

`"N 45°30'00" E"` means: start facing North, rotate `45°30'00"` toward East.
Equivalent azimuth = `45.5°` (clockwise from North).

**Quadrant → Azimuth conversion:**

| Quadrant | Azimuth Formula |
|---|---|
| NE | `azimuth = bearing_degrees` |
| SE | `azimuth = 180 − bearing_degrees` |
| SW | `azimuth = 180 + bearing_degrees` |
| NW | `azimuth = 360 − bearing_degrees` |

**Traverse math (ΔN and ΔE for each call):**
```
ΔN = distance × cos(azimuth_radians)
ΔE = distance × sin(azimuth_radians)
```

**Closure error:**
```
error_N = Σ(ΔN)    // Should be 0 for perfect closure
error_E = Σ(ΔE)    // Should be 0 for perfect closure
error_dist = √(error_N² + error_E²)
closure_ratio = 1 : (perimeter / error_dist)
// Acceptable: 1:15,000 or better
```

**Compass Rule correction for call i:**
```
correction_N_i = −error_N × (distance_i / total_perimeter)
correction_E_i = −error_E × (distance_i / total_perimeter)
```

### 14.3 Source Hierarchy (What Surveyors Trust)

From **most** to **least** authoritative:

| Rank | Source | Why |
|---|---|---|
| 1 | **TxDOT records** | Government agency, precise engineering data |
| 2 | **Deed descriptions** | Legal documents, metes and bounds text |
| 3 | **Recorded plats** | Certified by RPLS, but OCR may introduce errors |
| 4 | **Adjacent property deeds** | Independent measurement of shared boundary |
| 5 | **Computed/geometric analysis** | Derived from image analysis, lowest confidence |

This ranking drives the source weighting in Phase 7 reconciliation. When two sources conflict, the higher-ranked source wins unless there is overwhelming evidence from multiple lower-ranked sources.

### 14.4 Why Watermarks Matter

Texas county clerk websites show document images with **diagonal watermark text** across every page (e.g. `BELL COUNTY OFFICIAL RECORDS`). These watermarks physically obscure digits in bearings and distances. `"37"` might actually be `"39"` but the watermark covers the middle of the `9`.

This is the **primary source of extraction errors** and is the entire reason Phase 9 (Document Purchase) exists. Purchased official images have no watermarks. The confidence scoring system (Phase 8) quantifies this uncertainty and the purchase ROI calculator determines which documents are worth buying.

---

## 15. Environment Variables Reference

All variables must be set in `/root/starr-worker/.env` on the DigitalOcean droplet. **Never hardcode any value in source code.**

```bash
# ═══════════════════════════════════════
# Worker Server
# ═══════════════════════════════════════
PORT=3100
WORKER_API_KEY=your-worker-api-key
NODE_ENV=production

# ═══════════════════════════════════════
# Anthropic (AI)
# ═══════════════════════════════════════
ANTHROPIC_API_KEY=your-anthropic-api-key
# Optional model override (defaults to claude-sonnet-4-5-20250929)
# RESEARCH_AI_MODEL=claude-sonnet-4-5-20250929

# ═══════════════════════════════════════
# Supabase
# ═══════════════════════════════════════
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key

# ═══════════════════════════════════════
# County Clerk Credentials
# ═══════════════════════════════════════
KOFILE_USERNAME=starr_surveying@kofile.com
KOFILE_PASSWORD=your_password
TEXASFILE_USERNAME=starr_surveying
TEXASFILE_PASSWORD=your_password

# ═══════════════════════════════════════
# Stripe
# ═══════════════════════════════════════
STRIPE_SECRET_KEY=<your-stripe-secret-key>
STRIPE_WEBHOOK_SECRET=<your-stripe-webhook-secret>
STRIPE_PRICE_SURVEYOR_PRO=price_...
STRIPE_PRICE_FIRM_UNLIMITED=price_...

# ═══════════════════════════════════════
# Redis (BullMQ)
# ═══════════════════════════════════════
REDIS_URL=redis://localhost:6379

# ═══════════════════════════════════════
# Report Defaults
# ═══════════════════════════════════════
DEFAULT_OUTPUT_DIR=/tmp/deliverables
DEFAULT_FORMATS=pdf,dxf,svg
DEFAULT_DPI=300
DEFAULT_PAGE_SIZE=letter
COMPANY_NAME="Starr Surveying Company"
COMPANY_ADDRESS="Belton, Texas"
DEFAULT_PURCHASE_BUDGET=25.00

# ═══════════════════════════════════════
# Runtime
# ═══════════════════════════════════════
PLAYWRIGHT_HEADLESS=true
PLAYWRIGHT_MAX_BROWSERS=4
LOG_LEVEL=info
LOG_FILE=/var/log/starr-worker/worker.log
```

---

## 16. File Output Structure

After a complete pipeline run, files are organized as follows on the droplet:

```
/tmp/analysis/{projectId}/
├── checkpoint.json               ← Pipeline state (phases completed, timing)
├── discovery.json                ← Phase 1 output
├── documents.json                ← Phase 2 output
├── intelligence.json             ← Phase 3 output
├── subdivision.json              ← Phase 4 output (if applicable)
├── cross_validation.json         ← Phase 5 output
├── row_data.json                 ← Phase 6 output
├── reconciled_boundary.json      ← Phase 7 output
├── confidence_report.json        ← Phase 8 output
├── purchase_report.json          ← Phase 9 output (if applicable)
├── reconciled_boundary_v2.json   ← Phase 9 updated boundary (if applicable)
└── flood_zones.json              ← Phase 11 FEMA data

/tmp/harvested/{projectId}/
├── target/
│   ├── plat_2023032044_p1.png
│   ├── plat_2023032044_p2.png
│   ├── deed_2010043440_p1.png
│   └── deed_2010043440_p2.png
├── adjacent/{ownerSlug}/
│   ├── deed_*.png
│   └── plat_*.png
└── txdot/
    ├── rpam_screenshot.png
    └── row_parcels.geojson

/tmp/purchased/{projectId}/
├── plat_2023032044_p1_official.tiff
└── plat_2023032044_p2_official.tiff

/tmp/deliverables/{projectId}/
├── {Owner}_Survey_Research_Report.pdf
├── {Owner}_Boundary.dxf
├── {Owner}_Boundary.svg
├── {Owner}_Boundary.png
├── {Owner}_Data.json
├── {Owner}_Metes_And_Bounds.txt
├── manifest.json
└── source_documents/
    └── (copies of all source images)
```

Deliverables are also uploaded to **Supabase Storage** at `research/{projectId}/` for frontend access.

---

## 17. API Endpoint Reference

All endpoints are on the worker server (default `http://localhost:3100`). All `POST` endpoints return **202 Accepted** with a `projectId` for polling. The pipeline runs **asynchronously**.

All requests require `Authorization: Bearer {WORKER_API_KEY}`.

| Method | Endpoint | Phase | Description |
|---|---|---|---|
| `POST` | `/research/discover` | 1 | Start property discovery |
| `POST` | `/research/harvest` | 2 | Start document harvesting |
| `POST` | `/research/extract` | 3 | Start AI extraction |
| `POST` | `/research/subdivision` | 4 | Start subdivision analysis |
| `POST` | `/research/adjacent` | 5 | Start adjacent property research |
| `POST` | `/research/row` | 6 | Start TxDOT ROW integration |
| `POST` | `/research/reconcile` | 7 | Start geometric reconciliation |
| `POST` | `/research/confidence` | 8 | Start confidence scoring |
| `POST` | `/research/purchase` | 9 | Start document purchase |
| `POST` | `/research/run` | 10 | Start **full pipeline** (address → deliverables) |
| `POST` | `/research/report` | 10 | Re-generate reports from existing data |
| `GET`  | `/research/status/:projectId` | — | Poll pipeline status |
| `GET`  | `/research/deliverables/:projectId` | — | Get deliverable manifest |
| `GET`  | `/research/download/:projectId/:filename` | — | Download a deliverable file |
| `GET`  | `/health` | — | Health check |

**WebSocket** — real-time progress: `ws://{droplet-ip}:3101/{projectId}`

```typescript
// Event shapes:
{ type: 'phase_start',    phase: string, message: string }
{ type: 'phase_complete', phase: string, durationMs: number }
{ type: 'progress',       pct: number,   message: string }
{ type: 'error',          phase: string, message: string }
{ type: 'complete',       projectId: string }
```

---

## 18. CLI Command Reference

```bash
# ── Full pipeline ────────────────────────────────────────────────────
starr-research run --address "2913 Oakdale Dr, Belton, TX 76513" [options]

# Options:
#   -a, --address <addr>    Property address (REQUIRED)
#   -c, --county <county>   County name (auto-detected if omitted)
#   -p, --project <id>      Project ID (auto-generated if omitted)
#   -b, --budget <$>        Document purchase budget (default: 0)
#   --auto-purchase         Auto-purchase recommended documents
#   -o, --output <dir>      Output directory (default: /tmp/deliverables)
#   -f, --format <fmts>     Comma-separated: pdf,dxf,svg,png,json,txt
#   --resume                Resume from checkpoint
#   --skip <phases>         Comma-separated phase numbers to skip
#   --rpls <number>         RPLS number for report stamp
#   --logo <path>           Company logo for PDF
#   --page-size <size>      letter | tabloid
#   --dpi <dpi>             PNG render DPI (default: 300)

# ── Re-generate reports only ─────────────────────────────────────────
starr-research report --project <id> --format pdf,dxf,svg

# ── Check status ─────────────────────────────────────────────────────
starr-research status --project <id>

# ── List all projects ────────────────────────────────────────────────
starr-research list

# ── Clean up project data ────────────────────────────────────────────
starr-research clean --project <id> [--confirm]
```

---

## 19. Known Issues & Gotchas

| # | Issue | Workaround |
|---|---|---|
| 1 | Vercel serverless functions timeout after 10–60 s. Playwright can't run there. | ALL browser automation runs on the DigitalOcean droplet, never Vercel. |
| 2 | Kofile PublicSearch is a full SPA. Search results are rendered client-side after AJAX. | Must use Playwright `waitForSelector` on result elements. No direct API endpoint exists. |
| 3 | Bell CAD BIS API returns addresses in ALL CAPS with inconsistent formatting. | Address normalization in Phase 1 handles this. Compare normalized forms. |
| 4 | FM/RR road addresses have many variants (`"FM 436"`, `"Farm to Market 436"`, `"Farm Road 436"`). | Phase 1 address normalizer generates all variants and tries each. |
| 5 | Older deeds use varas (Spanish measurement). 1 vara = 33⅓ inches in Texas. | Convert to feet before any computation. Flag as `unit: 'varas'` for provenance. |
| 6 | NAD27 → NAD83 datum shift causes ~10–15 arc-second bearing offsets. | Detect datum from document date/context. Apply NADCON transformation if NAD27 detected. |
| 7 | County clerk sessions expire after 15–30 minutes of inactivity. | Detect 401/redirect → re-authenticate → retry the request. |
| 8 | Claude sometimes hallucinates bearings or distances, especially from watermarked images. | AI guardrails validate range and format. Re-prompt with zoomed-in crops on failure. |
| 9 | Some plats are rotated or not oriented to North. | Phase 3 adaptive vision system detects orientation from compass rose or north arrow. |
| 10 | DXF files must use ACI color codes, not RGB. | Map named colors to ACI numbers (1=red, 3=green, 5=blue, 7=white, etc.) |

---

## 20. Glossary

| Term | Definition |
|---|---|
| **RPLS** | Registered Professional Land Surveyor (Texas licensure) |
| **Metes and Bounds** | Property description method using sequential bearing/distance pairs |
| **POB** | Point of Beginning — starting point of a metes-and-bounds traverse |
| **Bearing** | Direction expressed as angle from N or S toward E or W (e.g., `N 45°30'00" E`) |
| **Traverse** | Sequence of bearing/distance pairs that traces a boundary |
| **Closure** | How well a traverse returns to its starting point (expressed as ratio `1:XXXXX`) |
| **Compass Rule** | Method of distributing closure error proportionally by cumulative distance |
| **Plat** | Legal map of a subdivision showing lots, boundaries, and dedications |
| **Instrument Number** | Unique recording number assigned when a document is filed with county clerk |
| **Vol/Pg** | Volume and page reference in county deed records (older recording system) |
| **ROW** | Right-of-Way — legal corridor for a road including pavement and shoulders |
| **FM** | Farm-to-Market Road (TxDOT designation) |
| **NAD83** | North American Datum of 1983 — current coordinate reference system |
| **NAD27** | North American Datum of 1927 — predecessor system (causes bearing offsets vs NAD83) |
| **TX Central Zone** | Texas State Plane Coordinate System zone for central Texas (Bell County) |
| **US Survey Foot** | `1 ft = 1200/3937 meters` (used in Texas surveying, differs from International Foot) |
| **Vara** | Old Spanish/Mexican measurement: 1 vara = 33⅓ inches in Texas |
| **DXF** | Drawing Exchange Format — CAD file format readable by AutoCAD |
| **ACI** | AutoCAD Color Index — numbered color system used in DXF files |
| **NFHL** | National Flood Hazard Layer (FEMA's flood zone GIS data) |
| **FIRM** | Flood Insurance Rate Map (FEMA's official flood maps) |
| **BFE** | Base Flood Elevation — elevation of 1%-annual-chance flood |
| **GLO** | Texas General Land Office — custodian of original land grant records |
| **TCEQ** | Texas Commission on Environmental Quality |
| **RRC** | Railroad Commission of Texas — regulates oil, gas, and pipelines |
| **NRCS** | Natural Resources Conservation Service — USDA soil data |
| **Kofile** | Vendor providing document management to ~80 Texas county clerks |
| **TexasFile** | Third-party service providing access to all 254 Texas county clerk records |
| **BIS** | BIS Consultants — CAD software vendor for ~30 Texas counties |
| **RPAM** | Real Property Asset Map — TxDOT's GIS viewer for ROW data |
| **Abstract** | Original Texas land grant survey area, identified by grantee name and A-XXXX number |
| **CAD** | Central Appraisal District — the county agency that maintains property tax records |
| **Deed chain** | Sequence of recorded instruments tracing property ownership back to the original grant |
| **Grantor** | The person/entity conveying (selling/giving) property in a deed |
| **Grantee** | The person/entity receiving property in a deed |
| **HCAD** | Harris County Appraisal District — Harris County's standalone CAD system |
| **TAD** | Tarrant Appraisal District — Tarrant County's CAD system |

---

## 21. Agent Session Template

When starting a new coding session on this project, begin by providing the following context to the AI agent:

```
I am building the Starr Software AI Property Research Pipeline (STARR RECON).

The full roadmap is in STARR_RECON/STARR_RECON_PHASE_ROADMAP.md — read it first.
The phase specifications are in STARR_RECON/PHASE_XX_*.md.

I am currently working on: [TASK FROM BUILD ORDER — SECTION 11]

The worker code lives in worker/src/.
All shared types are in worker/src/types/.
The specification document for this task is STARR_RECON/PHASE_XX_*.md section [SECTION NUMBER].

Please implement this task following the implementation rules in Section 12 of the roadmap.
```

---

*End of STARR RECON Master Roadmap v1.0*  
*Starr Software / Starr Surveying Company — Belton, Texas — March 2026*  
*This document is the single source of truth for AI-assisted development of the STARR RECON pipeline.*  
*Next: See individual phase spec files (`PHASE_01_DISCOVERY.md` through `PHASE_11_EXPANSION.md`)*
