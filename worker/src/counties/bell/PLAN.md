# Bell County Property Research System — Complete Plan

## Vision

A single "Initiate Research & Analysis" button that autonomously searches every
Bell County online resource, downloads and OCR-analyzes every document it finds,
screenshots every page it visits for future system improvement, and produces a
structured, reviewable report — all without user intervention. The system then
helps the surveyor build a job-ready field plan with a custom plat drawing.

---

## 1. User-Facing Workflow (3 stages)

### Stage 1 — Input & Upload

The user lands on one clean form:

| Field | Required | Notes |
|-------|----------|-------|
| Property Address | optional | Street, city, zip |
| Property ID / CAD Account # | optional | Bell CAD prop_id |
| Owner Name | optional | Current or historical |
| Instrument Number | optional | Deed instrument # |
| File Uploads | optional | PDFs, images, field notes, anything |
| Survey Type | optional | Boundary, ALTA, Topo, Subdivision, Easement, ROW, As-Built |
| Job Purpose | optional | Sale, refinance, construction, dispute, etc. |

At least one identifying field must be provided. A large **"Initiate Research &
Analysis"** button fires the entire pipeline. No configure step. No per-document
analysis buttons. One click.

### Stage 2 — Research & Analysis (automated, ~5–30 min)

The UI shows:
- A progress animation
- A live scrolling log of every action: URLs hit, documents found, screenshots
  taken, AI analysis steps, errors encountered
- A running count: documents found, pages captured, screenshots taken,
  AI analyses completed
- Estimated time remaining (rough)

Under the hood, the system runs every scraper, analyzer, and enrichment module
in the Bell County folder. See Section 3 for the full list.

### Stage 3 — Review & Job Preparation

The screen presents **collapsible toggle sections** (all collapsed by default):

#### 3A — Deeds & Records Summary
- Full deed chain from newest to oldest
- For each deed: recording date, instrument #, volume/page, grantor → grantee,
  document type, confidence rating
- Inline screenshots of every deed page (with links to source)
- AI-generated narrative summary of ownership history
- Highlighted discrepancies (e.g., gap in chain, conflicting legal descriptions)

#### 3B — Plat Summary
- All plat images found (current + historical)
- AI analysis of each plat: lot dimensions, bearings, monuments called,
  easements shown, right-of-way widths, adjacent lot info
- Side-by-side comparison if multiple plats exist
- Cross-validation against deed calls
- Confidence rating per plat

#### 3C — Easements, FEMA & TxDOT
- FEMA flood zone determination with map screenshot
- TxDOT ROW findings: width, CSJ, highway classification
- Utility easements found in deed records
- Pipeline/railroad easements
- Restrictive covenants
- Screenshots + links for each source

#### 3D — Property Details (CAD/GIS)
- Owner name, mailing address
- Legal description, acreage
- Property type, exemptions
- Tax year, appraised value
- Parcel boundary from GIS (coordinates)
- Aerial/satellite screenshot from GIS viewer

#### 3E — All Researched Links
- Every URL visited during research, hyperlinked
- Grouped by source (Bell CAD, County Clerk, FEMA, TxDOT, etc.)
- Status indicator: data found / no data / error

#### 3F — Discrepancies & Confidence
- Every conflict detected across all sources
- Each item scored: source reliability, data usefulness, cross-validation status
- Confidence rating system:
  - **High (90-100%)**: Data confirmed by 2+ independent sources
  - **Medium (60-89%)**: Data from one trusted source, uncontradicted
  - **Low (30-59%)**: Data from one source with possible issues
  - **Unverified (<30%)**: Data could not be confirmed
- AI recommendation on which data to trust

#### 3G — Adjacent Properties (optional, second run)
- User clicks "Research Adjacent Properties"
- System identifies all neighboring parcels from GIS
- Runs the same full research pipeline on each
- Each adjacent property gets its own set of toggles
- Helps surveyor understand context: shared boundaries, easements, ROW

#### 3H — AI System Improvement Notes
- Screenshots of every page visited with AI annotations
- AI observations: "This page has a searchable table we're not parsing",
  "This dropdown has additional filter options", "This URL pattern could
  be used for direct document access"
- Suggestions for improving scraping coverage

### Stage 4 — Job Preparation & Export

After review, the user provides additional job context:

| Field | Purpose |
|-------|---------|
| Survey Type | Boundary, ALTA, Topo, etc. |
| Purpose | Sale, refinance, construction, dispute |
| Special Instructions | "Check for encroachments along north line" |
| Include Screenshots | Multi-select from research phase |

The system generates:

1. **Survey Plan Document** (multi-page PDF):
   - Property summary with metes & bounds
   - Aerial/satellite screenshot
   - Most recent plat screenshot
   - AI-prepared plat drawing with selectable layers:
     - Property boundary with bearings/distances
     - Easements
     - Improvements (if known)
     - Flood zones
     - Adjacent lot lines
     - Monuments
     - ROW lines
   - Easement & encumbrance summary
   - Step-by-step field plan:
     - Starting point and how to find it
     - Each point of interest with coordinates
     - Bearing and distance between points
     - What to look for at each point (monuments, improvements, fences)
     - Shots to take (traverse, topo, improvement corners)
     - Specific calculations needed
   - All selected screenshots
   - Contact information and recording references

2. **Raw Data Export** (JSON):
   - Everything the system found, for future reference

---

## 2. File Structure

```
worker/src/counties/bell/
├── PLAN.md                          # This document
├── index.ts                         # Entry point — single function: runBellCountyResearch()
├── config/
│   ├── endpoints.ts                 # All Bell County URLs, API endpoints, credentials
│   └── field-maps.ts                # GIS field name mappings, eSearch field names
├── types/
│   ├── index.ts                     # All Bell County specific types
│   ├── research-input.ts            # Input form types
│   ├── research-result.ts           # Full result types with toggles
│   └── confidence.ts                # Confidence scoring types
├── scrapers/
│   ├── cad-scraper.ts               # Bell CAD eSearch (HTTP + Playwright + Vision)
│   ├── clerk-scraper.ts             # Kofile PublicSearch + Henschen (deeds, records)
│   ├── gis-scraper.ts               # ArcGIS FeatureServer (parcel data, boundaries)
│   ├── plat-scraper.ts              # County plat repository + Kofile plat docs
│   ├── fema-scraper.ts              # FEMA flood zone maps
│   ├── txdot-scraper.ts             # TxDOT ROW data via ArcGIS
│   ├── tax-scraper.ts               # Bell County tax records
│   └── screenshot-collector.ts      # Captures + annotates screenshots of every page
├── analyzers/
│   ├── deed-analyzer.ts             # AI deed chain analysis
│   ├── plat-analyzer.ts             # AI plat image analysis (dimensions, bearings, etc.)
│   ├── discrepancy-detector.ts      # Cross-source conflict detection
│   ├── confidence-scorer.ts         # Source reliability + cross-validation scoring
│   ├── site-intelligence.ts         # AI analysis of site screenshots for system improvement
│   └── adjacent-analyzer.ts         # Adjacent property research orchestration
├── reports/
│   ├── report-builder.ts            # Assembles all toggle sections
│   ├── survey-plan-generator.ts     # Generates the multi-page field plan PDF
│   ├── plat-drawing-generator.ts    # AI-assisted plat drawing with layers
│   └── export-service.ts            # PDF and JSON export
├── utils/
│   ├── html-parser.ts               # Shared HTML parsing utilities for Bell County sites
│   ├── session-manager.ts           # Cookie/session management for Bell County sites
│   └── retry.ts                     # Retry with exponential backoff
├── screenshots/                     # Runtime: captured screenshots stored here
│   └── .gitkeep
└── orchestrator.ts                  # Master orchestrator — runs all scrapers + analyzers
```

---

## 3. Research Pipeline (What Runs When User Clicks the Button)

### Phase 1 — Identify the Property (0–30s)

Parallel execution:

1. **Geocode** the address (Census API → Nominatim fallback)
2. **Bell CAD eSearch** — try HTTP API with all address variants
3. **ArcGIS spatial query** — use geocoded coords to find parcel(s)
4. **If instrument # provided** — search clerk directly

Merge results: We now have prop_id, owner name, legal description, acreage,
deed references, GIS parcel geometry, situs address.

### Phase 2 — Scrape Everything (30s–10min)

All scrapers run concurrently:

| Scraper | Source | What It Gets |
|---------|--------|-------------|
| `clerk-scraper` | bell.tx.publicsearch.us | All deeds, easements, plats, restrictions for this owner + instrument chain |
| `plat-scraper` | County plat repo + Kofile | Plat PDFs/images, subdivision plats |
| `fema-scraper` | FEMA NFHL | Flood zone designation, FIRM panel |
| `txdot-scraper` | TxDOT ArcGIS | ROW width, CSJ, highway class |
| `tax-scraper` | Bell CAD detail pages | Full tax record, exemptions, improvements |
| `screenshot-collector` | All of the above | Full-page screenshots of every page visited |

Each scraper:
- Captures a screenshot of every page it visits
- Logs every URL it accesses
- Saves raw HTML for debugging
- Records timing for each request

### Phase 3 — AI Analysis (5–15min)

Sequential + parallel analysis:

1. **Deed chain reconstruction** — order all deeds chronologically, extract
   grantor/grantee chains, legal descriptions, instrument references
2. **Plat analysis** — AI vision reads plat images: lot lines, dimensions,
   bearings, monuments, easements, curves, right-of-way
3. **Cross-validation** — compare deed calls vs plat dimensions, check for
   internal consistency, flag discrepancies
4. **Easement compilation** — extract all easements from deeds, plats, TxDOT
5. **Site intelligence** — AI reviews all screenshots for system improvement hints
6. **Confidence scoring** — rate every piece of data

### Phase 4 — Report Assembly (10–30s)

Build the structured result with all toggle sections.

---

## 4. Bell County Data Sources — Complete Reference

### 4.1 Bell Central Appraisal District (CAD)

| Resource | URL | Method |
|----------|-----|--------|
| eSearch Home | https://esearch.bellcad.org | HTTP + Playwright |
| eSearch API | https://esearch.bellcad.org/search/result?keywords=... | GET with session cookie |
| Property Detail | https://esearch.bellcad.org/Property/View/{propId}?ownerId={ownerId} | GET |
| GIS Viewer | https://gis.bisclient.com/bellcad/ | Reference only |
| ArcGIS FeatureServer | https://utility.arcgis.com/usrsvcs/servers/6efa79e05bde4b98851880b45f63ea52/rest/services/BellCADWebService/FeatureServer/0 | REST API |

**GIS Field Names** (all lowercase):
- `prop_id`, `prop_id_text` — Property ID
- `file_as_name` — Owner name
- `legal_desc`, `legal_desc2` — Legal description
- `legal_acreage` — Acreage
- `situs_num`, `situs_street_prefx`, `situs_street`, `situs_street_sufix` — Address components
- `situs_city`, `situs_state`, `situs_zip` — Address components
- `Number` — Deed instrument number
- `Volume`, `Page` — Deed volume/page
- `Deed_Date` — Deed date
- `map_id`, `geo_id` — Map references
- `abs_subdv_cd` — Abstract/subdivision code
- `hood_cd` — Neighborhood code
- `school`, `city`, `county` — Jurisdictions

### 4.2 Bell County Clerk (Kofile/GovOS PublicSearch)

| Resource | URL | Method |
|----------|-----|--------|
| PublicSearch Home | https://bell.tx.publicsearch.us | Playwright SPA |
| Search Results | https://bell.tx.publicsearch.us/results?... | Playwright SPA |
| Document Viewer | https://bell.tx.publicsearch.us/doc/{instrumentId} | Playwright |
| SuperSearch | https://bell.tx.publicsearch.us/supersearch | POST (full-text OCR) |
| FIPS Code | 48027 | — |

**Document Types Available**: Warranty Deed, Deed of Trust, Release of Lien,
Plat, Easement, Right-of-Way, Restrictive Covenant, Lis Pendens, Mechanic's
Lien, Abstract of Judgment, Power of Attorney, Affidavit, Survey, and more.

**Rate Limits**: 6000ms between image downloads. Max 3 concurrent fetches.
Images are watermarked previews (free) or $1/page unwatermarked.

### 4.3 Henschen & Associates (Alternative Clerk Portal)

| Resource | URL | Method |
|----------|-----|--------|
| Recorder Portal | https://www.bellcountytx.com/recorder | HTTP |
| Credential Env | HENSCHEN_PAY_BELL_* | — |
| Rate Limit | 15 RPM | — |

### 4.4 FEMA National Flood Hazard Layer

| Resource | URL | Method |
|----------|-----|--------|
| NFHL ArcGIS | https://hazards.fema.gov/gis/nfhl/rest/services/public/NFHL/MapServer | REST API |
| Flood Zones Layer | Layer 28 (S_Fld_Haz_Ar) | Spatial query |
| FIRM Panels Layer | Layer 3 (S_FIRM_Pan) | Spatial query |

**Key Fields**: `FLD_ZONE` (A, AE, X, etc.), `ZONE_SUBTY`, `SFHA_TF` (in/out
of Special Flood Hazard Area), `FIRM_PAN` (FIRM panel number).

### 4.5 TxDOT Right-of-Way

| Resource | URL | Method |
|----------|-----|--------|
| ROW Parcels | https://services.arcgis.com/KTcxiTD9dsQw4r7Z/arcgis/rest/services/TxDOT_ROW/FeatureServer/0 | REST API |
| Roadway Centerlines | https://services.arcgis.com/KTcxiTD9dsQw4r7Z/arcgis/rest/services/TxDOT_Roadways/FeatureServer/0 | REST API |

### 4.6 Additional Sources (Future)

| Source | Purpose |
|--------|---------|
| Texas GLO Land Grants | Original land patent / abstract history |
| Bell County GIS Portal | Additional spatial data layers |
| USGS Topo Maps | Historical survey reference |
| Google Maps/Earth | Aerial imagery for improvement identification |
| OpenStreetMap | Road and feature reference |

---

## 5. Confidence Rating System

Every piece of data gets a confidence score based on three factors:

### 5.1 Source Reliability (0–40 points)

| Source | Base Score | Reasoning |
|--------|-----------|-----------|
| County Clerk Official Records | 40 | Legal documents of record |
| Bell CAD Property Records | 35 | Official tax authority |
| ArcGIS GIS Data | 30 | Derived from official records |
| TxDOT ROW Data | 35 | State agency official data |
| FEMA NFHL | 35 | Federal agency official data |
| AI OCR Extraction | 15 | Depends on document quality |
| Watermarked Preview | 10 | Low quality, may miss details |

### 5.2 Data Usefulness (0–30 points)

- Contains specific measurements (bearings, distances): +30
- Contains legal description: +25
- Contains instrument references: +20
- Contains dates: +15
- Contains names only: +10
- Illegible or partial: +5

### 5.3 Cross-Validation (0–30 points)

- Confirmed by 3+ independent sources: +30
- Confirmed by 2 sources: +20
- Confirmed by 1 other source: +10
- Uncontradicted (only source): +5
- Contradicted by another source: -10

**Final Score** = Source Reliability + Data Usefulness + Cross-Validation
Mapped to confidence tiers: High (70+), Medium (45–69), Low (25–44), Unverified (<25)

---

## 6. Multi-Server / Distributed Agent Architecture

### 6.1 Why Multiple Servers?

The full research pipeline involves:
- 5-10 websites to scrape, some requiring Playwright browsers
- 10-50 document pages to download and OCR
- 20-100 AI vision calls for screenshots + document analysis
- Each browser instance uses ~200-500MB RAM
- AI API calls have rate limits

A single server can do this in 15-30 minutes. With multiple servers working
in parallel, we can cut this to 3-5 minutes.

### 6.2 Recommended Architecture

```
┌─────────────────────────────────────────────────┐
│              ORCHESTRATOR (Primary)              │
│  - Receives research request                     │
│  - Splits work into tasks                        │
│  - Assigns tasks to workers                      │
│  - Merges results                                │
│  - Runs final AI analysis                        │
│  - Builds report                                 │
│  API: POST /research/bell/start                  │
│  WS:  /research/bell/progress                    │
└────────────┬────────────┬────────────┬───────────┘
             │            │            │
     ┌───────▼──┐  ┌──────▼───┐  ┌────▼─────┐
     │ Worker 1 │  │ Worker 2 │  │ Worker 3 │
     │ CAD+GIS  │  │  Clerk   │  │ FEMA+DOT │
     │ scraping │  │ scraping │  │ + AI OCR  │
     └──────────┘  └──────────┘  └──────────┘
```

### 6.3 Implementation Options

#### Option A: Single Server (Current — Cheapest)
- **Cost**: $12-24/mo (DigitalOcean 2-4GB droplet)
- **Speed**: 15-30 minutes per research
- **Pros**: Simple deployment, no coordination overhead
- **Cons**: Slower, sequential where it could be parallel
- **Best for**: Getting started, low volume

#### Option B: Task Queue + Worker Pool (Recommended)
- **Infrastructure**: 1 orchestrator + 2-3 workers (spin up on demand)
- **Queue**: BullMQ with Redis (or Supabase Realtime for simplicity)
- **Cost**: $24-48/mo base + ~$0.05 per research (on-demand workers)
- **Speed**: 3-8 minutes per research
- **How it works**:
  1. Orchestrator receives request, creates task queue
  2. Worker pool picks up tasks (CAD scraping, clerk scraping, etc.)
  3. Results stream back via Redis pub/sub or Supabase Realtime
  4. Orchestrator merges results when all workers complete
  5. Workers auto-scale: spin up for research, shut down when idle
- **Pros**: Fast, cost-efficient (pay for compute only when researching)
- **Cons**: More complex deployment, needs Redis or equivalent

#### Option C: Serverless Functions (Future Scale)
- **Infrastructure**: Vercel/AWS Lambda for scrapers, dedicated box for Playwright
- **Cost**: Pay per invocation (~$0.01-0.05 per research)
- **Speed**: 2-5 minutes per research
- **Pros**: Infinite scale, zero idle cost
- **Cons**: Cold starts, 10s timeout on some platforms, Playwright needs
  special handling (container-based Lambda)

### 6.4 Recommendation

**Start with Option A** (single server) to validate the system works end-to-end.
The code should be structured to support Option B later:
- Each scraper is an independent module with a clean interface
- Results use a standard format that can be serialized/deserialized
- The orchestrator uses `Promise.allSettled()` for parallel execution
- Progress events use an EventEmitter pattern (easily replaceable with Redis pub/sub)

When volume justifies it, migrate to Option B by:
1. Adding a Redis instance ($6/mo on DigitalOcean)
2. Moving each scraper to its own worker process
3. Using BullMQ for task distribution
4. Adding auto-scaling rules for worker droplets

---

## 7. Key Design Decisions

### 7.1 County Isolation

Every county gets its own folder under `worker/src/counties/{county}/`.
This is critical because:

- Each county uses different clerk systems (Kofile, Henschen, Fidlar, Tyler, iDocket)
- CAD systems vary (BIS, TAD, HCAD, TrueAutomation)
- URLs change without warning
- Field names differ across GIS systems
- Document viewer UIs differ (canvas, image, iframe)
- Rate limits and access patterns differ

When Bell County changes their clerk system or URL, we fix ONE folder.
No risk of breaking other counties.

### 7.2 Router Pattern

```typescript
// worker/src/counties/router.ts
export async function runCountyResearch(county: string, input: ResearchInput) {
  switch (county.toLowerCase()) {
    case 'bell':
      return (await import('./bell')).runBellCountyResearch(input);
    // Future counties:
    // case 'williamson': return (await import('./williamson')).run(input);
    // case 'travis':     return (await import('./travis')).run(input);
    default:
      throw new Error(`County "${county}" not yet supported`);
  }
}
```

### 7.3 Screenshot-Everything Strategy

Every page visited gets a full-page screenshot. This serves three purposes:

1. **User verification** — the user can see exactly what the system saw
2. **System improvement** — AI analyzes screenshots for features we're not yet
   exploiting (new search options, better URLs, additional data fields)
3. **Audit trail** — if something goes wrong, we can see what happened

Screenshots are stored as base64 PNGs in the research result and optionally
uploaded to Supabase Storage for persistence.

### 7.4 One-Button Philosophy

The current system has too many steps and per-document analysis buttons.
The new system:

- **Upload stage**: Enter info → click one button
- **No configure stage**: The system figures out what to search
- **No per-document analysis**: AI analyzes everything automatically
- **Review stage**: All results organized in toggles
- **Job prep stage**: AI generates the field plan

---

## 8. Data Flow Summary

```
User Input (address/owner/instrument/files)
    │
    ▼
┌──────────────────────────────────────────────┐
│          BELL COUNTY ORCHESTRATOR             │
│                                               │
│  ┌─────────┐ ┌──────────┐ ┌──────────┐      │
│  │  CAD    │ │  Clerk   │ │   GIS    │      │
│  │ Scraper │ │ Scraper  │ │ Scraper  │      │
│  └────┬────┘ └────┬─────┘ └────┬─────┘      │
│       │           │            │              │
│  ┌────┴────┐ ┌────┴─────┐ ┌───┴──────┐      │
│  │  FEMA   │ │  TxDOT   │ │   Plat   │      │
│  │ Scraper │ │ Scraper  │ │ Scraper  │      │
│  └────┬────┘ └────┬─────┘ └────┬─────┘      │
│       │           │            │              │
│       ▼           ▼            ▼              │
│  ┌──────────────────────────────────────┐    │
│  │         SCREENSHOT COLLECTOR         │    │
│  │   (captures every page visited)      │    │
│  └──────────────┬───────────────────────┘    │
│                 │                             │
│                 ▼                             │
│  ┌──────────────────────────────────────┐    │
│  │          AI ANALYSIS ENGINE          │    │
│  │  - Deed chain reconstruction         │    │
│  │  - Plat dimension extraction         │    │
│  │  - Cross-validation                  │    │
│  │  - Confidence scoring                │    │
│  │  - Site intelligence                 │    │
│  └──────────────┬───────────────────────┘    │
│                 │                             │
│                 ▼                             │
│  ┌──────────────────────────────────────┐    │
│  │          REPORT BUILDER              │    │
│  │  - Toggle sections                   │    │
│  │  - Survey plan PDF                   │    │
│  │  - AI plat drawing                   │    │
│  └──────────────────────────────────────┘    │
└──────────────────────────────────────────────┘
    │
    ▼
BellCountyResearchResult (structured, reviewable, exportable)
```

---

## 9. Implementation Priority

### Phase 1 — Core (This PR)
1. File structure + types + config
2. CAD scraper (extract from existing bis-cad.ts)
3. GIS scraper (extract from existing bis-cad.ts)
4. Clerk scraper (extract from existing bell-clerk.ts)
5. Screenshot collector
6. Basic orchestrator
7. Basic report builder

### Phase 2 — AI Analysis
1. Deed chain analyzer
2. Plat image analyzer
3. Discrepancy detector
4. Confidence scorer
5. Enhanced report sections

### Phase 3 — Job Preparation
1. Survey plan generator
2. AI plat drawing with layers
3. PDF export
4. Step-by-step field instructions

### Phase 4 — Adjacent Properties
1. Adjacent parcel identification from GIS
2. Parallel research of neighboring properties
3. Context report generation

### Phase 5 — Multi-Server (When Needed)
1. Redis task queue
2. Worker process separation
3. Auto-scaling rules
4. Distributed progress tracking

---

## 10. Technical Notes

### Environment Variables Required
```
ANTHROPIC_API_KEY          — Claude API for AI analysis
SUPABASE_URL               — Database + storage
SUPABASE_SERVICE_KEY       — Server-side Supabase access
HENSCHEN_PAY_BELL_USER     — Henschen clerk portal (optional)
HENSCHEN_PAY_BELL_PASS     — Henschen clerk portal (optional)
```

### Rate Limits to Respect
- Bell CAD eSearch: No formal limit, but use 2s delays between requests
- Kofile PublicSearch: 6000ms between image downloads, max 3 concurrent
- Henschen: 15 requests per minute
- FEMA NFHL: No formal limit, but use reasonable delays
- TxDOT ArcGIS: No formal limit
- Claude API: Based on tier (typically 60 RPM)

### Browser Requirements
- Playwright with Chromium for SPA sites (Kofile PublicSearch)
- Headless mode with appropriate user-agent
- Session cookie management for Bell CAD eSearch

### AI Token Budget Per Research
- Estimated 50-100 AI calls per full research
- ~500K-1M input tokens (screenshots + documents)
- ~50K-100K output tokens (analysis)
- Cost: ~$5-15 per full research at current Claude pricing
- Optimization: batch similar screenshots, cache repeated queries
