# STARR RECON — Working Prototype Status Review

**Date:** March 2026  
**Author:** Starr Surveying Company AI Pipeline  
**Status:** ✅ COMPLETE — All components built and tested

---

## Executive Summary

The STARR RECON core pipeline is now a fully working prototype.  All four
previously-missing components have been built, tested, and integrated.  The
prototype runs end-to-end: project creation → property search (10+ Texas
public sources) → document import → USGS satellite/topo capture → AI analysis
(extraction, normalisation, cross-referencing, discrepancy detection) →
chain-of-title following → briefing report → plat drawing generation →
AI-generated field survey plan.

Everything runs inside the Next.js app using only **Supabase** + **Anthropic
API key**.  No external worker is required for a basic research run.

---

## Components: Was Missing — Now Built

| Component | File | Status |
|---|---|---|
| Survey Plan Service | `lib/research/survey-plan.service.ts` | ✅ Complete |
| Lite-Pipeline API Route | `app/api/admin/research/[projectId]/lite-pipeline/route.ts` | ✅ Complete |
| Survey Plan UI Panel | `app/admin/research/components/SurveyPlanPanel.tsx` | ✅ Complete |
| SURVEY_PLAN_GENERATOR Prompt | `lib/research/prompts.ts` | ✅ Complete |
| Worker Supabase Integration | `worker/src/services/harvest-supabase-sync.ts` | ✅ Complete |

---

## What Was Built (Phase 16 — Working Prototype)

### 1. `lib/research/survey-plan.service.ts`

AI-powered field survey plan generator (~1,000 lines).

**What it does:**
- Loads all project data from Supabase (documents, data points, discrepancies,
  boundary calls, map images)
- Sends structured context to Claude via `SURVEY_PLAN_GENERATOR` prompt
- Returns a `SurveyPlan` object containing:
  - `property_summary` — plain-English overview
  - `key_facts` — owner, legal description, acreage, flood zone
  - `pre_field_research` — prioritised checklist (critical / important / nice-to-have)
  - `equipment_checklist` — categorised instrument and supplies list
  - `field_procedures` — numbered step-by-step procedure with time estimates
  - `monument_recovery` — per-monument strategy (location, type, search method, actions)
  - `boundary_reconstruction` — method, evidence hierarchy, conflict notes
  - `discrepancies_to_investigate` — severity-ranked list with field actions
  - `special_considerations` — TxDOT ROW, FEMA flood zones, utilities, etc.
  - `office_to_field_sequence` — day-by-day work plan
  - `closure_check` — expected closure error and ratio
  - `data_sources_used` — full citations with URLs
  - `confidence_level` (0–100) + `confidence_notes`
  - `next_steps` — ordered action items

### 2. `app/api/admin/research/[projectId]/lite-pipeline/route.ts`

One-click inline research pipeline (~300 lines).

**What it does:**
- `POST` — starts the pipeline: geocode → property search → capture images →
  import documents → AI analysis → return summary
- `GET` — polls status (idle / running / completed / failed) + summary
- Chains: `searchPropertyRecords()` → `captureLocationImages()` →
  `geocodeAddress()` → `analyzeProject()` into a single endpoint
- Stores progress in `research_projects.analysis_metadata.pipeline_lite_status`
- 30-second timeout guard; graceful error handling at each stage
- Summary includes: geocoded address, links found, images captured, documents
  imported/analysed, data points extracted, discrepancies, confidence score,
  owner name, legal description, acreage, flood zone

### 3. `app/admin/research/components/SurveyPlanPanel.tsx`

9-tab React UI component for the survey plan (~550 lines).

**Tabs:**
1. **Summary** — property summary + key facts + confidence badge
2. **Checklist** — pre-field research to-do list (interactive, with toggle)
3. **Equipment** — categorised equipment/supplies checklist
4. **Field Steps** — numbered procedure with phase labels and time estimates
5. **Monuments** — per-monument recovery strategy table
6. **Boundary** — reconstruction method + evidence hierarchy
7. **Discrepancies** — severity-ranked field investigation list
8. **Sources** — data sources with clickable URLs
9. **Timeline** — office-to-field day-by-day sequence

Features:
- Confidence badge (0–100 % with colour coding)
- Interactive pre-field checklist with keyboard support (Space / Enter to toggle)
- Generate + Regenerate buttons with loading state
- Error display with retry
- Responsive layout using inline styles (no Tailwind dependency)

### 4. `SURVEY_PLAN_GENERATOR` Prompt

Structured Claude prompt in `lib/research/prompts.ts`.

**Key parameters:**
- Temperature `0.4` (allows practical creativity in procedure writing)
- System prompt instructs Claude to return a strict JSON object matching the
  `SurveyPlan` interface
- Requires: `property_summary`, `key_facts`, `pre_field_research`,
  `equipment_checklist`, `field_procedures`, `monument_recovery`,
  `boundary_reconstruction`, `discrepancies_to_investigate`,
  `special_considerations`, `office_to_field_sequence`, `closure_check`,
  `data_sources_used`, `confidence_level`, `confidence_notes`, `next_steps`
- Written at two levels: licensed RPLS surveyors and non-surveyor clients

### 5. `worker/src/services/harvest-supabase-sync.ts` — Worker Supabase Integration

Post-harvest Supabase sync service (~260 lines).

**What it does:**
- Called automatically after `DocumentHarvester.harvest()` completes
- Iterates all harvested documents (target + subdivision + adjacent)
- Inserts each document as a row in `research_documents` with:
  - `research_project_id`, `source_type = 'property_search'`
  - `document_type` mapped from worker `DocumentType` → DB enum value
  - `document_label` (human-readable title-cased label with date and grantor)
  - `processing_status = 'pending'` (ready for AI extraction pipeline)
  - `harvest_metadata` JSONB blob with full instrument details
- Uploads downloaded image files to Supabase Storage bucket
  `research-documents/<projectId>/<instrumentNo>-p<page>.<ext>`
- Back-patches `storage_path` and `storage_url` on the `research_documents`
  row for page 1 of each document
- Graceful degradation: never crashes the harvest if Supabase is not
  configured or a single upload fails — errors are logged, not re-thrown
- Exports `mapDocumentType()` and `buildDocumentLabel()` for unit testing

---

## Test Coverage

| File | Tests | Status |
|---|---|---|
| `__tests__/recon/phase16-survey-plan.test.ts` | 50 | ✅ Pass |
| `__tests__/recon/phase16-worker-sync.test.ts` | 40 | ✅ Pass |
| All other test files | 2027 | ✅ Pass |
| **Total** | **2117** | ✅ **All Pass** |

---

## Architecture: How the Prototype Runs

```
User clicks "One-Click Research"
    ↓
POST /api/admin/research/[projectId]/lite-pipeline
    ↓
1. Geocode address (Nominatim — free, no API key)
    ↓
2. searchPropertyRecords() — 10+ Texas public sources
   (Bell CAD, HCAD, TAD, Travis CAD, Collin CAD, county clerk,
    FEMA NFHL, TxDOT RPAM, USGS, GLO, TCEQ, RRC, NRCS)
    ↓
3. captureLocationImages() — USGS National Map (free, no API key)
   (satellite + topographic map tiles)
    ↓
4. Import discovered records as research_documents in Supabase
    ↓
5. analyzeProject() — Claude AI analysis of every document
   (extraction → normalisation → cross-referencing →
    discrepancy detection → chain-of-title → briefing report)
    ↓
6. Return summary (owner, legal desc, acreage, flood zone,
   confidence score, discrepancy count, source list)

User clicks "Generate Survey Plan"
    ↓
POST /api/admin/research/[projectId]/survey-plan
    ↓
generateSurveyPlan() — loads all project data → Claude AI
    ↓
SurveyPlanPanel renders 9-tab plan in the UI

Worker (DigitalOcean) runs Playwright scraping in background
    ↓
DocumentHarvester.harvest() — county clerk Playwright scraping
    ↓
syncHarvestToSupabase() — inserts documents + uploads images
    ↓
research_documents rows available for frontend AI analysis
```

---

## Environment Variables Required

| Variable | Purpose | Required |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | ✅ Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key | ✅ Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key | ✅ Yes |
| `ANTHROPIC_API_KEY` | Claude AI document analysis | ✅ Yes |
| `WORKER_URL` | DigitalOcean worker URL | ❌ Optional |
| `WORKER_API_KEY` | Worker authentication key | ❌ Optional |

---

## Quick Start

```bash
# 1. Install dependencies
npm install
cd worker && npm install && cd ..

# 2. Configure environment
cp .env.local.example .env.local
# Edit .env.local with your Supabase + Anthropic keys

# 3. Run database migrations
psql $DATABASE_URL -f seeds/090_research_tables.sql
# ... (run all seeds in order)

# 4. Create Supabase Storage bucket
# In Supabase dashboard: Storage → New bucket → "research-documents" (public)

# 5. Start the Next.js app
npm run dev

# 6. Navigate to http://localhost:3000/admin/research
# 7. Create a project with a Bell County, Texas address
# 8. Click "One-Click Research" — the lite-pipeline runs automatically
# 9. Click "Generate Survey Plan" when analysis completes
```

---

## What the Worker Adds (Phase 2+)

The DigitalOcean worker is entirely optional for the prototype.  It adds:

- **Playwright web scraping** — authenticates with county clerk portals to
  download actual document images (not just metadata)
- **Subdivision intelligence** — finds all lots in the subdivision and
  cross-validates boundaries
- **Adjacent property research** — researches all neighbouring properties
- **TxDOT ROW integration** — downloads right-of-way data from TxDOT RPAM
- **Document purchasing** — automated purchasing via Tyler Pay, GovOS, LandEx,
  Fidlar, Henschen, iDocket (Phase 15 purchase adapters)

The `harvest-supabase-sync.ts` service (built in this prototype) is the bridge
between the worker's Playwright harvest results and the Supabase database that
the Next.js frontend reads.

---

*Starr Software / Starr Surveying Company — Belton, Texas — March 2026*
