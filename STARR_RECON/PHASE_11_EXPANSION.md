# Phase 11: Product Expansion, Statewide Coverage & Subscription Platform

## Overview

Phase 11 transforms the 10-phase research pipeline from a single-user CLI tool into a subscription-grade SaaS product that covers all 254 Texas counties, integrates every available government data source, processes payments for document purchases on behalf of users, delivers interactive web-based reports through Starr Compass, and operates with production-grade reliability.

**Duration:** Weeks 31–52+ (ongoing)
**Depends On:** All Phases 1–10
**Deliverable:** A complete product-grade research platform with multi-tenant user management, Stripe billing, statewide county coverage, 10+ government data source integrations, real-time progress UI, interactive web reports, batch processing, and production infrastructure.

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

## Modules

### Module A: FEMA Flood Zone Integration (`worker/src/sources/fema-nfhl-client.ts`)

Queries FEMA National Flood Hazard Layer for:
- Flood zone designations (A, AE, V, VE, X, D)
- FIRM panel identification
- Base Flood Elevation (BFE) from nearest BFE line
- LOMA/LOMR records (Letters of Map Amendment/Revision)
- Risk assessment summary (high/moderate/low/undetermined)

**API:** FEMA NFHL ArcGIS REST (public, free, nationwide)

### Module B: Texas GLO Land Grant Integration (`worker/src/sources/glo-client.ts`)

Queries Texas General Land Office for:
- Original land grant / patent records
- Abstract survey boundaries (polygon geometry)
- Original grantee, grant date, grant type
- Adjacent abstract surveys
- Vacancy risk assessment

**API:** GLO ArcGIS REST (public, free)

### Module C: TCEQ Environmental Data (`worker/src/sources/tceq-client.ts`)

Queries Texas Commission on Environmental Quality for:
- Underground Storage Tanks (USTs) within search radius
- Contamination sites (Superfund, VCP, brownfield)
- Environmental permits
- Phase I ESA recommendation based on proximity

**API:** TCEQ ArcGIS REST (public, free)

### Module D: Texas Railroad Commission (`worker/src/sources/rrc-client.ts`)

Queries Texas RRC for:
- Oil/gas well locations, status, depth, operator
- Pipeline locations, commodity, diameter, setbacks
- Easement width estimates
- Mineral rights notes

**API:** RRC GIS Viewer ArcGIS REST (public, free)

### Module E: USDA NRCS Soil Data (`worker/src/sources/nrcs-soil-client.ts`)

Queries USDA Soil Data Access for:
- Soil classifications, map unit descriptions
- Hydrologic group, hydric soils, drainage class
- Shrink-swell potential (critical for Central Texas)
- Septic suitability, foundation rating, road subgrade
- Depth to bedrock, water table depth

**API:** SDA REST (public, free)

### Module G: Subscription & Payment Platform (`worker/src/billing/`)

**Subscription Tiers:**
| Tier | Price | Reports/Mo | Doc Purchases | Batch | Exports |
|------|-------|-----------|---------------|-------|---------|
| Free Trial | $0 | 2 | No | No | PDF only |
| Surveyor Pro | $99/mo | 25 | Yes (+$0.50/pg) | No | All except RW5/JobXML |
| Firm Unlimited | $299/mo | Unlimited | Yes (+$0.25/pg) | Yes | All |
| Enterprise | Custom | Unlimited | Yes (no markup) | Yes | All |

**Per-Report Purchases:**
- Basic Report: $29 (CAD + free clerk + FEMA)
- Full Report: $79 (all data sources)
- Premium Report: $149 (all sources + $25 document budget)

**Stripe Integration:** Customer creation, subscription management, per-report charges, document purchase pass-through billing, webhook handling.

### Module H: WebSocket Progress Server (`worker/src/websocket/progress-server.ts`)

Real-time pipeline progress via WebSocket:
- Client connects with `?projectId=xxx&token=yyy`
- Receives phase start/complete/fail events
- Progress percentage within phases
- Pipeline completion notification
- Heartbeat ping/pong for connection health

### Module I: Batch Processing (`worker/src/batch/batch-processor.ts`)

- CSV upload with address parsing
- Creates individual pipeline jobs via BullMQ queue
- Tracks batch-level completion/failure
- Aggregate reporting across batch
- Use cases: subdivision lot research, foreclosure portfolios

### Module J: Deep Chain of Title Engine (`worker/src/chain-of-title/chain-builder.ts`)

Traces ownership backward N generations (configurable, default 5):
- Grantor/grantee chain tracing
- Boundary evolution analysis (acreage changes, road widenings)
- Measurement system transitions (varas → feet)
- Datum change detection (NAD27 → NAD83)
- Easement grant extraction from deed language
- Vacancy analysis (unaccounted acreage from parent tract)

### Module K: Production Hardening (`worker/src/infra/`)

**Circuit Breaker** (`resilience.ts`):
- Pre-configured breakers for all external services
- Configurable failure threshold, reset timeout
- States: closed → open → half-open → closed

**Retry with Backoff** (`resilience.ts`):
- Exponential backoff with jitter
- Configurable max attempts and delay limits

**AI Guardrails** (`ai-guardrails.ts`):
- Bearing validation (0-90° range, proper quadrant notation)
- Distance validation (positive, reasonable range)
- Curve parameter validation (radius, arc length, delta consistency)
- Traverse geometry validation (≥3 calls, reasonable perimeter)
- Full extraction response validation with cleaned output

**Job Queue** (`job-queue.ts`):
- BullMQ with Redis backend
- Max 3 concurrent pipeline runs
- Rate limiting: 5 jobs/minute
- Priority queue (rush jobs first)
- Job status tracking

### Module L: Analytics & AI Management (`worker/src/analytics/`, `worker/src/ai/`)

**Usage Tracker** (`usage-tracker.ts`):
- Event buffering with auto-flush
- Per-user usage summaries
- AI cost tracking per project
- County breakdown analytics
- JSONL append-only log files

**Prompt Registry** (`prompt-registry.ts`):
- Version-controlled prompt definitions
- Accuracy tracking per version
- Usage statistics (runs, tokens, cost)
- Promote/rollback workflow
- Built-in defaults for plat, deed, and easement extraction

### Module N: Survey Software Exports (`worker/src/exports/`)

**Carlson RW5** (`rw5-exporter.ts`):
- Space-delimited text format for Carlson Survey / SurvCE
- NAD83 TX Central Zone coordinates
- Boundary closure point

**Trimble JobXML** (`jobxml-exporter.ts`):
- XML format for Trimble Access / Business Center
- Coordinate system metadata
- Point codes and descriptions

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

## Acceptance Criteria

1. FEMA flood zone query returns correct zone for test properties
2. GLO abstract survey boundary is retrieved and displayed
3. TCEQ query returns UST data near test property
4. RRC query returns pipeline/well data for test property
5. NRCS soil query returns correct soil type for test property
6. Circuit breaker trips after N failures, resets after timeout
7. AI guardrails reject hallucinated bearings (>90° degrees)
8. Job queue limits concurrent pipeline runs to 3
9. Stripe subscription creation and billing works end-to-end
10. Per-report Stripe charge processes correctly
11. WebSocket progress events fire for all pipeline phases
12. Chain of title traces back ≥3 generations on test property
13. Batch processing handles 10 properties without failure
14. RW5 export imports into Carlson Survey without errors
15. JobXML export imports into Trimble Business Center
16. Retry logic recovers from transient 503 errors
17. Free trial user is limited to 2 reports/month
18. Research data is isolated between users
19. Full pipeline completes for properties in Bell, Travis, Williamson, Harris, and Bexar counties
20. Prompt registry supports version promote/rollback workflow
