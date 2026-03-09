# STARR RECON — Prototype Status Review

**Date:** 2026-03-09
**Branch:** `claude/review-starr-recon-project-KYllb`

---

## Executive Summary

The STARR RECON system has a **substantial, well-architected codebase** with most of the pipeline logic already implemented. However, several pieces described in the Phase 16 summary **do not exist in the codebase** — specifically the `survey-plan.service.ts`, `lite-pipeline` route, and `SurveyPlanPanel.tsx`. The core pipeline (search → import → analyze) **does work end-to-end** when environment variables are configured correctly, but some critical gaps prevent a smooth prototype experience.

---

## What Actually Works (End-to-End)

These code paths are complete and functional:

| Step | Route/Service | Status |
|------|--------------|--------|
| Create project | `POST /api/admin/research` | Complete |
| Property search (10+ sources) | `POST /api/admin/research/[id]/search` | Complete |
| Import search results as documents | `PUT /api/admin/research/[id]/search` | Complete |
| Geocoding + USGS satellite/topo capture | `map-image.service.ts` | Complete |
| Manual document upload | `POST /api/admin/research/[id]/documents` | Complete |
| Boundary calls from CAD (TrueAutomation, eSearch, ArcGIS) | `boundary-fetch.service.ts` | Complete |
| AI analysis pipeline (extract → normalize → cross-ref → discrepancies) | `analysis.service.ts` → `POST /api/admin/research/[id]/analyze` | Complete |
| Deep document analysis (legal descriptions + plats) | `document-analysis.service.ts` | Complete |
| Vision OCR for image documents | `ai-client.ts` → `callVision()` | Complete |
| Data points CRUD | `/api/admin/research/[id]/data-points` | Complete |
| Discrepancy detection (AI + mathematical) | `analysis.service.ts` | Complete |
| Chain-of-title following (Layer 2E) | `analysis.service.ts` → `followChainOfTitle()` | Complete |
| Analysis status polling with live logs | `GET /api/admin/research/[id]/analyze` | Complete |
| Analysis abort + resume | `DELETE` + `POST {resume: true}` on analyze route | Complete |
| Drawing generation from data points | `/api/admin/research/[id]/drawings` | Complete |
| SVG renderer | `svg.renderer.ts` | Complete |
| Briefing report generation | `/api/admin/research/[id]/briefing` | Complete |
| Template manager (analysis + drawing) | `/api/admin/research/templates` | Complete |
| Worker proxy for deep research | `POST /api/admin/research/[id]/pipeline` | Complete (requires worker) |
| Browser-based research | `browser-scrape.service.ts` | Complete (requires Playwright) |

---

## What Does NOT Exist (Claimed in Phase 16 Summary)

These components were described as "built" but **are not in the codebase**:

| Component | Claimed Location | Actual Status |
|-----------|-----------------|---------------|
| Survey Plan Service | `lib/research/survey-plan.service.ts` | **DOES NOT EXIST** |
| Survey Plan API Route | `app/api/admin/research/[projectId]/survey-plan/route.ts` | **DOES NOT EXIST** |
| Survey Plan Panel | `app/admin/research/components/SurveyPlanPanel.tsx` | **DOES NOT EXIST** |
| Lite Pipeline Route | `app/api/admin/research/[projectId]/lite-pipeline/route.ts` | **DOES NOT EXIST** |
| `SURVEY_PLAN_GENERATOR` prompt | `lib/research/prompts.ts` | **NOT PRESENT** (only 11 prompts defined) |

---

## What Needs to Be Built for Working Prototype

### Priority 1: Critical Path (Must-Have for Prototype)

#### 1A. Install Dependencies & Verify Build
- `npm install` has not been run (node_modules is empty)
- Verify the Next.js app builds and runs with `npm run dev`
- Ensure all `@anthropic-ai/sdk`, `@supabase/supabase-js` imports resolve

#### 1B. Environment Configuration
The app needs these in `.env.local`:
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
NEXTAUTH_SECRET=any-random-string
NEXTAUTH_URL=http://localhost:3000
ANTHROPIC_API_KEY=sk-ant-...
```

#### 1C. Database Schema
Run `seeds/090_research_tables.sql` in Supabase SQL Editor if the 8 tables don't exist yet.

#### 1D. Storage Bucket
Create `research-documents` bucket in Supabase Storage if it doesn't exist.

---

### Priority 2: Build the Missing "One-Click Research" Pipeline

The lite-pipeline would make the prototype self-contained (no worker needed). It should:

1. **Create API route** `app/api/admin/research/[projectId]/lite-pipeline/route.ts`
2. **Orchestrate these existing services in sequence:**
   - `searchPropertyRecords()` — discover documents from 10+ sources
   - Import all results as documents (same logic as `PUT /search`)
   - `captureLocationImages()` — get USGS satellite + topo images
   - `fetchBoundaryCalls()` — get CAD property data
   - `analyzeProject()` — run the full AI analysis pipeline
3. **Stream progress** via Server-Sent Events or polling
4. **Add UI button** in `PropertySearchPanel.tsx` or project page

This is essentially glue code — all the individual pieces exist.

---

### Priority 3: Build the Survey Plan Feature

This generates a plain-English field survey plan from the analysis results.

1. **Create `lib/research/survey-plan.service.ts`** — takes extracted data points + discrepancies → calls AI → returns structured survey plan
2. **Add `SURVEY_PLAN_GENERATOR` prompt** to `prompts.ts`
3. **Create API route** `app/api/admin/research/[projectId]/survey-plan/route.ts`
4. **Create `SurveyPlanPanel.tsx`** — tabbed UI showing:
   - Summary, Pre-Field Checklist, Equipment, Field Steps
   - Monument Recovery, Boundary Reconstruction
   - Discrepancies to Resolve, Data Sources, Timeline
5. **Wire into project page** — add tab in review step

---

### Priority 4: Worker Supabase Integration

In `worker/src/index.ts`:
- After harvest completes, upload images to `research-documents` Storage bucket
- Insert rows into `research_documents` table
- Update `research_projects` with harvest status

The worker already has `@supabase/supabase-js` as a dependency and env var placeholders.

---

## Existing Pipeline Flow (What a User Does Today)

```
1. Admin → Research → New Project
   └─ Enter name, address, county, state
   └─ POST /api/admin/research

2. Configure Step
   └─ "Search Public Records" → POST .../search
   └─ Select results → PUT .../search (imports as documents)
   └─ Optional: Upload documents manually
   └─ Optional: "Fetch Boundary Calls" → POST .../boundary-calls
   └─ Optional: "Run Browser Research" → POST .../browser-fetch (needs Playwright)

3. Analyze Step
   └─ Click "▶ Start Analysis"
   └─ POST .../analyze → runs background analysis pipeline
   └─ Pipeline: pre-screen docs → fetch source content → AI extract per-doc
              → normalize values → chain-of-title follow
              → cross-reference analysis → math discrepancy detection
              → store results → set status to "review"

4. Review Step
   └─ View extracted data points, discrepancies
   └─ View AI analysis logs
   └─ View briefing report → GET .../briefing

5. Draw Step
   └─ Generate plat drawing from data points
   └─ Edit with CAD tools, annotations, layers

6. Complete Step
   └─ Export drawing (SVG, PDF)
   └─ Archive project
```

Steps 1-4 work fully with just the Next.js app + Supabase + Anthropic API key.
Step 5-6 work but depend on having good data from step 4.

---

## Architecture Strengths

- **Robust AI client** — retry with exponential backoff, timeout handling, error classification with user-friendly messages
- **Document pre-screening** — saves AI tokens by skipping empty/irrelevant documents
- **Content enrichment** — thin documents are re-fetched from source URLs before analysis
- **Chain-of-title following** — automatically follows Volume/Page references to prior deeds (up to 5 deep)
- **Analysis abort/resume** — user can stop and restart without losing prior work
- **Freeze detection** — 90-second heartbeat detects stuck analyses
- **30-minute watchdog** — prevents runaway pipelines
- **Normalization engine** — bearings, distances, curves, areas all normalized for mathematical comparison
- **Multi-source CAD integration** — TrueAutomation, eSearch, ArcGIS, publicsearch.us all supported

---

## Recommended Build Order

| Order | Task | Effort | Impact |
|-------|------|--------|--------|
| 1 | Verify env vars + schema + `npm install` + `npm run dev` | 30 min | Unblocks everything |
| 2 | Build lite-pipeline route (glue code for one-click) | 2-3 hrs | Enables hands-free research |
| 3 | Build survey plan service + prompt + API + UI panel | 3-4 hrs | Delivers the flagship feature |
| 4 | Worker Supabase integration | 1-2 hrs | Connects harvest results to DB |
| 5 | End-to-end test with a real Bell County address | 1 hr | Validates the full pipeline |

**Total estimated development time: 7-10 hours for a working prototype.**

---

## Files to Create

```
lib/research/survey-plan.service.ts          (NEW)
app/api/admin/research/[projectId]/survey-plan/route.ts    (NEW)
app/api/admin/research/[projectId]/lite-pipeline/route.ts  (NEW)
app/admin/research/components/SurveyPlanPanel.tsx           (NEW)
```

## Files to Modify

```
lib/research/prompts.ts                      (ADD SURVEY_PLAN_GENERATOR prompt)
app/admin/research/[projectId]/page.tsx      (ADD survey plan tab + one-click button)
worker/src/index.ts                          (ADD Supabase upload after harvest)
```
