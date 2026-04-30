# AI Property Research & Plat Drawing Renderer — Implementation Plan

**Starr Surveying · Admin Dashboard Feature Module**
**Version 3.1 · February 2026**

> This document is the complete, step-by-step implementation plan for the AI-powered property research analysis and plat drawing renderer feature. It is written for use as a Claude Code instruction document. Each phase is self-contained and can be built independently. Work through them in order — each phase depends on the ones before it.
>
> **Important:** This plan has been adapted to match the actual STARR-SURVEYING codebase architecture — a single Next.js 14 app (not a monorepo) using Supabase/PostgreSQL, NextAuth, Tailwind CSS, and the Anthropic SDK.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Phase 1: Database Schema](#phase-1-database-schema)
- [Phase 2: File Upload & Document Processing Pipeline](#phase-2-file-upload--document-processing-pipeline)
- [Phase 3: Property Search & Document Discovery](#phase-3-property-search--document-discovery)
- [Phase 4: AI Analysis Engine](#phase-4-ai-analysis-engine)
- [Phase 5: Results Display & Discrepancy Management](#phase-5-results-display--discrepancy-management)
- [Phase 6: Drawing Data Model & Element System](#phase-6-drawing-data-model--element-system)
- [Phase 7: Drawing Renderer & Canvas Engine](#phase-7-drawing-renderer--canvas-engine)
- [Phase 8: Drawing View Modes & Visualization](#phase-8-drawing-view-modes--visualization)
- [Phase 9: Comparison Engine & Confidence Scoring](#phase-9-comparison-engine--confidence-scoring)
- [Phase 10: Workflow UI & Integration](#phase-10-workflow-ui--integration)
- [Phase 11: API Routes](#phase-11-api-routes)
- [Phase 12: Drawing Templates & Export](#phase-12-drawing-templates--export)
- [Phase 13: AI Parameterization & Consistency](#phase-13-ai-parameterization--consistency)
- [Phase 14: Standalone / White-Label Prep](#phase-14-standalone--white-label-prep)
- [Phase 15: Dependencies & DevOps](#phase-15-dependencies--devops)

---

## Architecture Overview

### Where This Feature Lives in the Codebase

This feature follows the existing STARR-SURVEYING conventions — a single Next.js 14 App Router project with Supabase, NextAuth, and Tailwind CSS.

```
STARR-SURVEYING/
├── app/
│   └── admin/
│       └── research/                      ← NEW: all research UI pages
│           ├── page.tsx                   ← project list
│           ├── new/page.tsx               ← create new research project
│           ├── components/                ← research-specific components
│           │   ├── SourceDocumentViewer.tsx
│           │   ├── DrawingCanvas.tsx
│           │   ├── DrawingViewToolbar.tsx
│           │   ├── ElementDetailPanel.tsx
│           │   ├── DiscrepancyCard.tsx
│           │   └── WorkflowStepper.tsx
│           └── [projectId]/
│               ├── page.tsx               ← project hub (7-step workflow)
│               ├── upload/page.tsx
│               ├── configure/page.tsx
│               ├── analyze/page.tsx
│               ├── review/page.tsx
│               ├── draw/page.tsx
│               ├── verify/page.tsx
│               └── export/page.tsx
│   └── api/
│       └── admin/
│           └── research/                  ← NEW: Next.js Route Handlers
│               ├── route.ts              ← GET (list) + POST (create) projects
│               ├── [projectId]/
│               │   ├── route.ts          ← GET + PATCH + DELETE project
│               │   ├── documents/
│               │   │   ├── route.ts      ← GET (list) + POST (upload) documents
│               │   │   ├── manual/route.ts ← POST manual entry
│               │   │   └── [docId]/
│               │   │       ├── route.ts  ← GET + DELETE document
│               │   │       └── content/route.ts ← GET extracted text / signed URL
│               │   ├── search/
│               │   │   ├── route.ts      ← POST property search
│               │   │   └── import/route.ts ← POST import selected results
│               │   ├── analyze/
│               │   │   ├── route.ts      ← POST start analysis
│               │   │   └── status/route.ts ← GET analysis progress
│               │   ├── data-points/
│               │   │   ├── route.ts      ← GET all extracted data points
│               │   │   └── [dpId]/route.ts ← GET single data point
│               │   ├── discrepancies/
│               │   │   ├── route.ts      ← GET all discrepancies
│               │   │   └── [dId]/route.ts ← PATCH resolve discrepancy
│               │   └── drawings/
│               │       ├── route.ts      ← POST (render) + GET (list) drawings
│               │       └── [drawingId]/
│               │           ├── route.ts  ← GET drawing metadata
│               │           ├── elements/
│               │           │   ├── route.ts ← GET all elements
│               │           │   └── [eId]/route.ts ← PATCH update element
│               │           ├── svg/route.ts ← GET rendered SVG
│               │           ├── compare/route.ts ← POST run comparison
│               │           └── export/route.ts ← POST export to format
│               └── templates/
│                   ├── analysis/route.ts  ← GET + POST analysis templates
│                   ├── drawing/route.ts   ← GET + POST drawing templates
│                   └── [type]/[id]/route.ts ← PATCH + DELETE template
├── lib/
│   └── research/                          ← NEW: business logic & services
│       ├── analysis.service.ts
│       ├── document.service.ts
│       ├── drawing.service.ts
│       ├── comparison.service.ts
│       ├── search.service.ts
│       ├── geometry.engine.ts             ← bearing/distance → coordinate math
│       ├── normalization.ts               ← deterministic data normalization
│       ├── svg.renderer.ts                ← SVG generation engine
│       ├── prompts.ts                     ← versioned AI system prompts
│       └── ai-client.ts                   ← Claude API wrapper
├── types/
│   └── research.ts                        ← NEW: TypeScript interfaces
├── seeds/
│   └── 090_research_tables.sql            ← NEW: all research tables + seed data
```

**Conventions this follows from the existing codebase:**
- UI pages under `app/admin/` (matches `app/admin/jobs/`, `app/admin/learn/`, etc.)
- API routes under `app/api/admin/` (matches `app/api/admin/jobs/`, `app/api/admin/learn/`, etc.)
- Business logic in `lib/` (matches `lib/auth.ts`, `lib/problemEngine.ts`, etc.)
- Types in `types/` (matches `types/index.ts`, `types/next-auth.d.ts`)
- Database seeds in `seeds/` with numeric prefix ordering
- Auth via `auth()` from `@/lib/auth` + `withErrorHandler()` from `@/lib/apiErrorHandler`
- Supabase client via `supabaseAdmin` from `@/lib/supabase`

### Tech Stack for This Feature

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | Next.js 14 App Router, React 18, Tailwind CSS | UI pages and components |
| Canvas | Fabric.js | Interactive drawing editor |
| SVG Renderer | Custom TypeScript engine | Geometry → SVG conversion |
| AI | `@anthropic-ai/sdk` (^0.74.0, already installed) | Document analysis, data extraction, confidence scoring |
| PDF Processing | pdf-parse + sharp | Text extraction from PDFs, image processing |
| OCR | Claude Vision API | Reading scanned documents and plat drawings |
| Database | Supabase (PostgreSQL) | All project, document, element, and drawing data |
| File Storage | Supabase Storage or AWS S3 | Uploaded documents and rendered drawings |
| Export | jspdf + dxf-writer | PDF and DXF export of rendered drawings |
| API | Next.js Route Handlers (`app/api/`) | All backend endpoints |
| Auth | NextAuth v5 (already configured) | Session management, role-based access |

### Data Flow Summary

```
User uploads files / searches property
        ↓
Document Processing Pipeline
  - PDF text extraction (pdf-parse)
  - Image OCR (Claude Vision)
  - Structured data normalization
        ↓
AI Analysis Engine (Claude API)
  - Parameterized system prompts (surveying domain)
  - Extracts bearings, distances, monuments, calls, easements, legal descriptions
  - Flags discrepancies with severity and probable cause
  - Generates per-element confidence scores and AI reports
        ↓
Results Display
  - Formatted data with source attribution
  - Discrepancy cards with severity indicators
  - User resolution workflow
        ↓
Drawing Renderer
  - Geometry engine converts calls → coordinates
  - SVG renderer draws lines, text, symbols, patterns
  - Fabric.js canvas for interactive editing
  - 5 view modes (Standard, Feature, Confidence, Discrepancy, Custom)
        ↓
Comparison & Confidence
  - AI compares rendered drawing to source documents
  - Per-element and overall confidence percentages
  - Persisting issues list
        ↓
Export
  - SVG / PNG / PDF / DXF
  - Template-based formatting
```

---

## Phase 1: Database Schema

**Seed file:** `seeds/090_research_tables.sql`

**Prerequisite:** Existing tables from seeds 000-080 (`registered_users`, `jobs`, `learning_modules`, etc.)

> **Note on multi-tenancy:** The current STARR-SURVEYING app is single-tenant (one company). The schema below includes `organization_id` columns as UUID placeholders for future white-label/multi-tenant support (Phase 14). For now, use a hardcoded default org UUID or simply leave these nullable. The `created_by` column references the `registered_users` table which is the actual user table in this codebase. The `users(id)` references in SQL below should be read as `registered_users(id)` — adjust the FK target when implementing.

### 1.1 research_projects

The top-level container for a property research session. One project = one property being researched.

```sql
CREATE TABLE research_projects (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    project_id      UUID REFERENCES projects(id) ON DELETE SET NULL,  -- optional link to a Compass project
    created_by      UUID NOT NULL REFERENCES users(id),
    name            TEXT NOT NULL,
    description     TEXT,
    property_address TEXT,
    county          TEXT,
    state           TEXT DEFAULT 'TX',
    parcel_id       TEXT,                          -- county appraisal district parcel ID
    legal_description_summary TEXT,                -- one-liner for quick reference

    -- Workflow state
    status          TEXT NOT NULL DEFAULT 'upload'
                    CHECK (status IN ('upload','configure','analyzing','review','drawing','verifying','complete')),
    
    -- AI analysis configuration (set during configure step)
    analysis_template_id UUID REFERENCES analysis_templates(id),
    analysis_filters JSONB DEFAULT '{}',           -- checkbox selections for what to extract
    
    -- Metadata
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at    TIMESTAMPTZ,
    archived_at     TIMESTAMPTZ
);

CREATE INDEX idx_research_projects_org ON research_projects(organization_id);
CREATE INDEX idx_research_projects_status ON research_projects(status);
CREATE INDEX idx_research_projects_created_by ON research_projects(created_by);
```

### 1.2 research_documents

Every file uploaded or discovered during research. Tracks processing state.

```sql
CREATE TABLE research_documents (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    research_project_id UUID NOT NULL REFERENCES research_projects(id) ON DELETE CASCADE,
    
    -- Source info
    source_type     TEXT NOT NULL CHECK (source_type IN (
                        'user_upload',      -- user uploaded directly
                        'property_search',  -- found via property search
                        'linked_reference', -- referenced by another document
                        'manual_entry'      -- user typed in content directly
                    )),
    original_filename TEXT,
    file_type       TEXT,                          -- pdf, png, jpg, tiff, docx, txt
    file_size_bytes BIGINT,
    s3_key          TEXT,                          -- S3 storage path
    s3_url          TEXT,                          -- pre-signed URL (refreshed on access)
    source_url      TEXT,                          -- if discovered from web
    
    -- Document classification
    document_type   TEXT CHECK (document_type IN (
                        'deed',
                        'plat',
                        'survey',
                        'legal_description',
                        'title_commitment',
                        'easement',
                        'restrictive_covenant',
                        'field_notes',
                        'subdivision_plat',
                        'metes_and_bounds',
                        'county_record',
                        'appraisal_record',
                        'aerial_photo',
                        'topo_map',
                        'utility_map',
                        'other'
                    )),
    document_label  TEXT,                          -- user-friendly name
    
    -- Processing pipeline state
    processing_status TEXT NOT NULL DEFAULT 'pending'
                    CHECK (processing_status IN ('pending','extracting','extracted','analyzing','analyzed','error')),
    processing_error TEXT,
    
    -- Extracted raw content
    extracted_text  TEXT,                          -- full text extraction
    extracted_text_method TEXT,                    -- 'pdf-parse', 'ocr-vision', 'manual'
    page_count      INTEGER,
    
    -- OCR-specific data (for scanned docs / plat images)
    ocr_confidence  DECIMAL(5,2),                 -- overall OCR confidence 0-100
    ocr_regions     JSONB,                        -- bounding boxes for each text region
    
    -- Metadata
    recorded_date   DATE,                         -- when the document was originally recorded
    recording_info  TEXT,                          -- volume, page, clerk file number
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_research_docs_project ON research_documents(research_project_id);
CREATE INDEX idx_research_docs_type ON research_documents(document_type);
CREATE INDEX idx_research_docs_status ON research_documents(processing_status);
```

### 1.3 extracted_data_points

Every piece of usable data the AI pulls from the documents. Each row is one atomic fact.

```sql
CREATE TABLE extracted_data_points (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    research_project_id UUID NOT NULL REFERENCES research_projects(id) ON DELETE CASCADE,
    document_id     UUID NOT NULL REFERENCES research_documents(id) ON DELETE CASCADE,
    
    -- What was extracted
    data_category   TEXT NOT NULL CHECK (data_category IN (
                        'bearing',            -- N 45° 30' 15" E
                        'distance',           -- 150.00 feet
                        'call',               -- bearing + distance combo
                        'monument',           -- iron rod, concrete monument, etc.
                        'point_of_beginning', -- POB location
                        'curve_data',         -- radius, arc length, chord bearing, delta
                        'area',               -- acreage / square footage
                        'boundary_description', -- "along the north line of Lot 5"
                        'easement',           -- utility, drainage, access
                        'setback',            -- building setback lines
                        'right_of_way',       -- road ROW widths
                        'adjoiner',           -- adjacent property owner / description
                        'recording_reference', -- Vol. 123, Pg. 456
                        'date_reference',     -- "dated March 15, 2019"
                        'surveyor_info',      -- RPLS name, number, firm
                        'legal_description',  -- full metes & bounds text
                        'lot_block',          -- Lot 5, Block A
                        'subdivision_name',   -- "Sunset Heights, Phase 2"
                        'coordinate',         -- state plane or GPS coordinate
                        'elevation',          -- elevation/benchmark data
                        'zoning',             -- zoning classification
                        'flood_zone',         -- FEMA flood zone designation
                        'utility_info',       -- utility locations/types
                        'annotation',         -- general text note from drawing
                        'symbol',             -- map symbols (north arrow, scale, etc.)
                        'other'
                    )),
    
    -- The extracted value
    raw_value       TEXT NOT NULL,                 -- exact text as it appears in the document
    normalized_value JSONB,                        -- machine-readable normalized form (see Phase 4)
    display_value   TEXT,                          -- human-friendly formatted version
    unit            TEXT,                          -- feet, meters, acres, etc.
    
    -- Source attribution (for the info button)
    source_page     INTEGER,                       -- page number in the document
    source_location TEXT,                           -- "paragraph 3", "call sequence line 7"
    source_bounding_box JSONB,                     -- {x, y, width, height} for OCR regions
    source_text_excerpt TEXT,                       -- the surrounding text context (2-3 sentences)
    
    -- Ordering for sequential data (call sequences)
    sequence_order  INTEGER,                       -- position in a call sequence (1, 2, 3...)
    sequence_group  TEXT,                           -- groups related calls ("main_boundary", "easement_1")
    
    -- Confidence
    extraction_confidence DECIMAL(5,2),            -- 0-100, how confident the AI is in the extraction
    confidence_reasoning TEXT,                      -- why this confidence score
    
    -- Metadata
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_data_points_project ON extracted_data_points(research_project_id);
CREATE INDEX idx_data_points_document ON extracted_data_points(document_id);
CREATE INDEX idx_data_points_category ON extracted_data_points(data_category);
CREATE INDEX idx_data_points_sequence ON extracted_data_points(sequence_group, sequence_order);
```

### 1.4 discrepancies

Every issue, contradiction, or uncertainty found during analysis. Each discrepancy links to the data points involved.

```sql
CREATE TABLE discrepancies (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    research_project_id UUID NOT NULL REFERENCES research_projects(id) ON DELETE CASCADE,
    
    -- Severity classification
    severity        TEXT NOT NULL CHECK (severity IN (
                        'info',           -- FYI, no action needed
                        'unclear',        -- text is ambiguous but probably fine
                        'uncertain',      -- could be interpreted multiple ways
                        'discrepancy',    -- two sources disagree
                        'contradiction',  -- two sources directly contradict
                        'error'           -- almost certainly wrong
                    )),
    
    -- Probable cause
    probable_cause  TEXT CHECK (probable_cause IN (
                        'clerical_error',      -- typo, transposition
                        'drawing_error',       -- drafting mistake on plat
                        'surveying_error',     -- field measurement issue
                        'transcription_error', -- error copying from one doc to another
                        'rounding_difference', -- minor rounding in different docs
                        'datum_difference',    -- different coordinate datums used
                        'age_difference',      -- older vs newer survey standards
                        'legal_ambiguity',     -- genuinely ambiguous legal language
                        'missing_information', -- referenced data not available
                        'ocr_uncertainty',     -- OCR could not read clearly
                        'unknown'
                    )),
    
    -- Description
    title           TEXT NOT NULL,                  -- short summary: "Bearing discrepancy on Line 3"
    description     TEXT NOT NULL,                  -- detailed AI explanation
    ai_recommendation TEXT,                         -- what the AI suggests doing about it
    
    -- Linked data points
    data_point_ids  UUID[] NOT NULL,               -- the extracted_data_points involved
    document_ids    UUID[] NOT NULL,               -- the documents involved
    
    -- Impact assessment
    affects_boundary BOOLEAN DEFAULT false,         -- does this affect property boundary?
    affects_area     BOOLEAN DEFAULT false,         -- does this affect calculated area?
    affects_closure  BOOLEAN DEFAULT false,         -- does this affect traverse closure?
    estimated_impact TEXT,                          -- "~0.5 ft difference" or "changes area by 0.02 acres"
    
    -- Resolution
    resolution_status TEXT NOT NULL DEFAULT 'open'
                    CHECK (resolution_status IN ('open','reviewing','resolved','accepted','deferred')),
    resolved_by     UUID REFERENCES users(id),
    resolution_notes TEXT,                          -- what the user decided
    resolved_value  JSONB,                          -- the corrected value if applicable
    resolved_at     TIMESTAMPTZ,
    
    -- Metadata
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_discrepancies_project ON discrepancies(research_project_id);
CREATE INDEX idx_discrepancies_severity ON discrepancies(severity);
CREATE INDEX idx_discrepancies_status ON discrepancies(resolution_status);
```

### 1.5 analysis_templates

Saved configurations for what data to extract and how to display it.

```sql
CREATE TABLE analysis_templates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    created_by      UUID NOT NULL REFERENCES users(id),
    
    name            TEXT NOT NULL,
    description     TEXT,
    is_default      BOOLEAN DEFAULT false,
    is_system       BOOLEAN DEFAULT false,         -- system-provided templates
    
    -- What to extract (filter checkboxes)
    extract_config  JSONB NOT NULL DEFAULT '{
        "bearings_distances": true,
        "monuments": true,
        "curve_data": true,
        "point_of_beginning": true,
        "easements": true,
        "setbacks": true,
        "right_of_way": true,
        "adjoiners": true,
        "area_calculations": true,
        "recording_references": true,
        "surveyor_info": true,
        "legal_description": true,
        "lot_block_subdivision": true,
        "coordinates": false,
        "elevations": false,
        "zoning": false,
        "flood_zone": false,
        "utilities": false
    }',
    
    -- How to display results
    display_config  JSONB NOT NULL DEFAULT '{
        "group_by": "category",
        "sort_order": "sequence",
        "show_confidence": true,
        "show_source_attribution": true,
        "highlight_discrepancies": true,
        "collapse_low_confidence": false
    }',
    
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_analysis_templates_org ON analysis_templates(organization_id);
```

### 1.6 drawing_elements

**This is the core of the drawing system.** Every line, symbol, label, and shape in a rendered drawing is its own record with full attributes, confidence, source references, and an AI-written report.

```sql
CREATE TABLE drawing_elements (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    drawing_id      UUID NOT NULL REFERENCES rendered_drawings(id) ON DELETE CASCADE,
    
    -- Element type and classification
    element_type    TEXT NOT NULL CHECK (element_type IN (
                        'line',           -- straight boundary line
                        'curve',          -- arc / curve segment
                        'polyline',       -- multi-segment line
                        'polygon',        -- closed shape (building, lot)
                        'point',          -- monument, POB, control point
                        'label',          -- text annotation
                        'dimension',      -- distance / bearing label on a line
                        'symbol',         -- north arrow, scale bar, legend item
                        'hatch',          -- fill pattern (building footprint, water, etc.)
                        'callout'         -- leader line with text
                    )),
    
    -- Feature classification (determines color/style in Feature view)
    feature_class   TEXT NOT NULL CHECK (feature_class IN (
                        'property_boundary',
                        'easement',
                        'setback',
                        'right_of_way',
                        'road',
                        'concrete',
                        'building',
                        'fence',
                        'utility',
                        'water_feature',
                        'tree_line',
                        'contour',
                        'lot_line',
                        'centerline',
                        'monument',
                        'control_point',
                        'annotation',
                        'title_block',
                        'other'
                    )),
    
    -- Geometry (SVG path data + coordinate arrays)
    geometry        JSONB NOT NULL,
    -- For lines: { "type": "line", "start": [x,y], "end": [x,y] }
    -- For curves: { "type": "curve", "center": [x,y], "radius": r, "startAngle": a, "endAngle": b, "direction": "cw"|"ccw" }
    -- For polygons: { "type": "polygon", "points": [[x,y], ...] }
    -- For points: { "type": "point", "position": [x,y] }
    -- For labels: { "type": "label", "position": [x,y], "anchor": "start"|"middle"|"end" }
    svg_path        TEXT,                          -- pre-computed SVG path string for fast rendering
    
    -- Surveying attributes (the actual data this element represents)
    attributes      JSONB NOT NULL DEFAULT '{}',
    -- For lines: { "bearing": "N 45° 30' 15\" E", "distance": 150.00, "distance_unit": "feet" }
    -- For curves: { "radius": 200.00, "arc_length": 85.50, "chord_bearing": "N 30° 00' 00\" E", "chord_distance": 84.20, "delta": "24° 30' 00\"", "direction": "right" }
    -- For monuments: { "type": "iron_rod", "size": "1/2 inch", "cap": "RPLS 12345", "condition": "found" }
    -- For labels: { "text": "150.00'", "rotation": 45.5 }
    
    -- Style properties (independently configurable per element)
    style           JSONB NOT NULL DEFAULT '{
        "stroke": "#000000",
        "strokeWidth": 1,
        "strokeDasharray": "",
        "fill": "none",
        "opacity": 1,
        "fontSize": 10,
        "fontFamily": "Arial"
    }',
    
    -- Feature-view style overrides (applied when Feature Classification view is active)
    feature_style   JSONB,                        -- auto-populated based on feature_class
    
    -- Layer and ordering
    layer           TEXT DEFAULT 'default',        -- drawing layer name
    z_index         INTEGER DEFAULT 0,             -- render order
    visible         BOOLEAN DEFAULT true,
    locked          BOOLEAN DEFAULT false,
    
    -- CONFIDENCE SYSTEM
    confidence_score DECIMAL(5,2) NOT NULL DEFAULT 0,  -- 0-100%
    confidence_factors JSONB DEFAULT '{}',
    -- {
    --   "source_quality": 85,        -- how clear/reliable the source doc is
    --   "extraction_certainty": 90,  -- how confident the AI was in reading the value
    --   "cross_reference_match": 95, -- does it match other documents?
    --   "geometric_consistency": 88, -- does it fit with adjacent elements?
    --   "closure_contribution": 92   -- how well does it contribute to traverse closure?
    -- }
    
    -- AI-WRITTEN REPORT (2-5 sentences explaining this element)
    ai_report       TEXT NOT NULL,
    -- Example: "This line represents the south boundary of Lot 5, Block A. The bearing
    -- N 89° 45' 30\" E and distance 150.00' were extracted from the deed recorded in
    -- Vol. 3456, Pg. 789 (page 2, paragraph 4). The same call appears on the 2019 plat
    -- with a matching bearing but a distance of 149.98', which is within typical rounding
    -- tolerance. Confidence is high at 94%."
    
    -- SOURCE REFERENCES (clickable hyperlinks to source documents)
    source_references JSONB NOT NULL DEFAULT '[]',
    -- [
    --   {
    --     "document_id": "uuid-here",
    --     "document_label": "Deed Vol. 3456 Pg. 789",
    --     "page": 2,
    --     "location": "Paragraph 4, Line 7",
    --     "excerpt": "thence N 89° 45' 30\" E, a distance of 150.00 feet to an iron rod found",
    --     "bounding_box": { "x": 120, "y": 340, "width": 480, "height": 20 }
    --   }
    -- ]
    
    -- Linked data points and discrepancies
    data_point_ids  UUID[],                        -- extracted_data_points this element was built from
    discrepancy_ids UUID[],                        -- any discrepancies affecting this element
    
    -- User modifications
    user_modified   BOOLEAN DEFAULT false,
    original_geometry JSONB,                       -- geometry before user edit (for undo)
    original_attributes JSONB,                     -- attributes before user edit
    modification_notes TEXT,                        -- why the user changed it
    
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_drawing_elements_drawing ON drawing_elements(drawing_id);
CREATE INDEX idx_drawing_elements_type ON drawing_elements(element_type);
CREATE INDEX idx_drawing_elements_feature ON drawing_elements(feature_class);
CREATE INDEX idx_drawing_elements_confidence ON drawing_elements(confidence_score);
CREATE INDEX idx_drawing_elements_layer ON drawing_elements(layer);
```

### 1.7 rendered_drawings

A complete rendered drawing produced from the analyzed data.

```sql
CREATE TABLE rendered_drawings (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    research_project_id UUID NOT NULL REFERENCES research_projects(id) ON DELETE CASCADE,
    created_by      UUID NOT NULL REFERENCES users(id),
    
    name            TEXT NOT NULL,
    version         INTEGER NOT NULL DEFAULT 1,
    
    -- Drawing configuration
    drawing_template_id UUID REFERENCES drawing_templates(id),
    canvas_config   JSONB NOT NULL DEFAULT '{
        "width": 3400,
        "height": 4400,
        "scale": 100,
        "units": "feet",
        "paper_size": "24x36",
        "orientation": "landscape",
        "background": "#FFFFFF",
        "grid_visible": false,
        "grid_spacing": 50
    }',
    
    -- Title block info
    title_block     JSONB DEFAULT '{}',
    -- {
    --   "project_name": "Sunset Heights Phase 2",
    --   "sheet_title": "Boundary Survey",
    --   "date": "2026-02-22",
    --   "scale": "1\" = 100'",
    --   "drawn_by": "AI Renderer",
    --   "checked_by": "",
    --   "firm_name": "Starr Surveying",
    --   "firm_address": "Belton, Texas",
    --   "rpls_name": "",
    --   "rpls_number": "",
    --   "sheet_number": "1 of 1"
    -- }
    
    -- Overall confidence
    overall_confidence DECIMAL(5,2),               -- weighted average of all element confidences
    confidence_breakdown JSONB,                    -- per-category breakdown
    
    -- Comparison results (populated after verify step)
    comparison_results JSONB,
    persisting_issues JSONB,                       -- issues that remain after drawing
    
    -- Export files
    svg_s3_key      TEXT,
    png_s3_key      TEXT,
    pdf_s3_key      TEXT,
    dxf_s3_key      TEXT,
    
    -- State
    status          TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','rendering','rendered','verified','exported','final')),
    
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_rendered_drawings_project ON rendered_drawings(research_project_id);
```

### 1.8 drawing_templates

Saved drawing format specifications that users can reuse.

```sql
CREATE TABLE drawing_templates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    created_by      UUID NOT NULL REFERENCES users(id),
    
    name            TEXT NOT NULL,
    description     TEXT,
    is_default      BOOLEAN DEFAULT false,
    is_system       BOOLEAN DEFAULT false,
    
    -- Canvas settings
    canvas_config   JSONB NOT NULL,
    
    -- Style rules for each feature class
    feature_styles  JSONB NOT NULL DEFAULT '{
        "property_boundary": { "stroke": "#000000", "strokeWidth": 2, "strokeDasharray": "" },
        "easement":          { "stroke": "#CC0000", "strokeWidth": 1.5, "strokeDasharray": "10,5" },
        "setback":           { "stroke": "#0066CC", "strokeWidth": 1, "strokeDasharray": "5,5" },
        "right_of_way":      { "stroke": "#996633", "strokeWidth": 1.5, "strokeDasharray": "" },
        "road":              { "stroke": "#8B7355", "strokeWidth": 2, "strokeDasharray": "", "fill": "#F5F0E8" },
        "concrete":          { "stroke": "#999999", "strokeWidth": 1, "strokeDasharray": "", "fill": "#E0E0E0" },
        "building":          { "stroke": "#333333", "strokeWidth": 1.5, "strokeDasharray": "", "fill": "#D4E6F1" },
        "fence":             { "stroke": "#228B22", "strokeWidth": 1, "strokeDasharray": "3,3" },
        "utility":           { "stroke": "#FF6600", "strokeWidth": 1, "strokeDasharray": "8,3,2,3" },
        "water_feature":     { "stroke": "#0088CC", "strokeWidth": 1, "strokeDasharray": "", "fill": "#CCE5FF" },
        "tree_line":         { "stroke": "#006400", "strokeWidth": 1, "strokeDasharray": "" },
        "contour":           { "stroke": "#CD853F", "strokeWidth": 0.5, "strokeDasharray": "" },
        "lot_line":          { "stroke": "#666666", "strokeWidth": 1, "strokeDasharray": "5,5" },
        "centerline":        { "stroke": "#000000", "strokeWidth": 0.5, "strokeDasharray": "15,5,5,5" },
        "monument":          { "stroke": "#FF0000", "strokeWidth": 1 },
        "control_point":     { "stroke": "#FF00FF", "strokeWidth": 1 },
        "annotation":        { "stroke": "#000000", "fontSize": 8, "fontFamily": "Arial" },
        "title_block":       { "stroke": "#000000", "strokeWidth": 1.5 }
    }',
    
    -- Title block template
    title_block_config JSONB,
    
    -- Labeling rules
    label_config    JSONB NOT NULL DEFAULT '{
        "show_bearings": true,
        "show_distances": true,
        "show_curve_data": true,
        "show_monuments": true,
        "show_lot_numbers": true,
        "show_dimensions": true,
        "show_area": true,
        "bearing_format": "dms",
        "distance_precision": 2,
        "font_size_primary": 8,
        "font_size_secondary": 6,
        "label_offset": 10
    }',
    
    -- Confidence view color scale
    confidence_colors JSONB NOT NULL DEFAULT '{
        "high":   { "min": 90, "color": "#00AA00" },
        "medium": { "min": 70, "color": "#CCAA00" },
        "low":    { "min": 50, "color": "#FF6600" },
        "critical": { "min": 0, "color": "#CC0000" }
    }',
    
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_drawing_templates_org ON drawing_templates(organization_id);
```

### 1.9 Phase 1 Deliverables Checklist

- [ ] Seed file `seeds/090_research_tables.sql` created and runs cleanly in Supabase
- [ ] All 8 tables created with correct foreign keys and indexes
- [ ] FK references adapted: `users(id)` → `registered_users(id)`, `organization_id` nullable for single-tenant
- [ ] TypeScript row types added to `types/research.ts`
- [ ] Zod validation schemas added to `types/research.schemas.ts` (optional — can defer to Phase 11)
- [ ] Seed data: 3 system analysis templates (Full Survey, Boundary Only, Deed Research)
- [ ] Seed data: 2 system drawing templates (Standard B&W, Professional Color)
- [ ] SQL runs successfully via Supabase SQL Editor or `psql`

---

## Phase 2: File Upload & Document Processing Pipeline

### 2.1 Upload API Endpoint

**File:** `app/api/admin/research/[projectId]/documents/route.ts`

The upload endpoint accepts multipart form data, stores files in Supabase Storage (or S3), creates `research_documents` records, and triggers the processing pipeline.

> **Auth pattern:** All API routes follow the existing pattern from the codebase — wrap with `withErrorHandler()` from `@/lib/apiErrorHandler`, check session with `auth()` from `@/lib/auth`, and use `supabaseAdmin` from `@/lib/supabase` for database queries. See `app/api/admin/learn/ai-grade/route.ts` for the reference implementation.

```
POST /api/research/:projectId/documents
Content-Type: multipart/form-data

Body: file (binary), document_type (optional), document_label (optional)

Response: { document: ResearchDocument, processingJobId: string }
```

**Accepted file types:** PDF, PNG, JPG, JPEG, TIFF, DOCX, TXT

**Max file size:** 50MB per file, 500MB total per project

**S3 path convention:** `research/{orgId}/{projectId}/{documentId}/{originalFilename}`

### 2.2 Document Processing Pipeline

Processing happens asynchronously after upload. The pipeline has three stages:

**Stage 1: Text Extraction**

```typescript
// lib/research/document.service.ts

async function extractText(document: ResearchDocument): Promise<string> {
    switch (document.file_type) {
        case 'pdf':
            // Use pdf-parse for text-based PDFs
            const pdfText = await pdfParse(fileBuffer);
            if (pdfText.text.trim().length > 50) {
                return pdfText.text; // method: 'pdf-parse'
            }
            // Fall through to OCR for scanned PDFs
        
        case 'png':
        case 'jpg':
        case 'jpeg':
        case 'tiff':
            // Use Claude Vision for OCR
            return await ocrWithVision(fileBuffer, document.file_type); // method: 'ocr-vision'
        
        case 'docx':
            // Use mammoth for DOCX text extraction
            return await mammoth.extractRawText({ buffer: fileBuffer });
        
        case 'txt':
            return fileBuffer.toString('utf-8');
    }
}
```

**Stage 2: Document Classification**

If the user didn't specify the `document_type`, the AI classifies it:

```typescript
async function classifyDocument(extractedText: string): Promise<string> {
    const response = await claudeClient.analyze({
        system: PROMPTS.DOCUMENT_CLASSIFIER,  // see Phase 13
        user: `Classify this document:\n\n${extractedText.substring(0, 3000)}`
    });
    return response.document_type; // one of the document_type enum values
}
```

**Stage 3: OCR Region Mapping (for scanned documents)**

For plat drawings and scanned documents, Claude Vision returns bounding box regions for each piece of text, enabling the source-hyperlink feature later.

```typescript
async function ocrWithVision(fileBuffer: Buffer, fileType: string): Promise<OcrResult> {
    // Convert to base64 for Claude Vision
    const base64 = fileBuffer.toString('base64');
    
    const response = await claudeClient.analyze({
        system: PROMPTS.OCR_EXTRACTOR,  // see Phase 13
        user: [
            { type: 'image', source: { type: 'base64', media_type: `image/${fileType}`, data: base64 } },
            { type: 'text', text: 'Extract all text from this document. Return each text region with its bounding box coordinates and the text content.' }
        ]
    });
    
    return {
        fullText: response.full_text,
        regions: response.regions,  // [{ text, bbox: {x,y,w,h}, confidence }]
        overallConfidence: response.confidence
    };
}
```

### 2.3 Manual Entry Support

Users can also type in information directly (e.g., reading from a physical document):

```
POST /api/research/:projectId/documents/manual
Content-Type: application/json

Body: {
    document_type: "deed",
    document_label: "Deed from County Clerk - read in person",
    content: "Beginning at an iron rod found at the northeast corner of Lot 5..."
}
```

This creates a `research_documents` record with `source_type: 'manual_entry'` and stores the content directly in `extracted_text`.

### 2.4 Phase 2 Deliverables Checklist

- [ ] Upload endpoint accepts all file types and stores to S3
- [ ] pdf-parse extracts text from text-based PDFs
- [ ] Claude Vision OCR extracts text and bounding boxes from scanned docs
- [ ] mammoth extracts text from DOCX files
- [ ] AI document classifier categorizes untyped uploads
- [ ] Manual entry endpoint works
- [ ] Processing status updates in real-time (via polling or WebSocket)
- [ ] Error handling: corrupt files, oversized files, unsupported types
- [ ] All processing is async and does not block the API response

---

## Phase 3: Property Search & Document Discovery

### 3.1 Address Search Endpoint

When the user enters a property address instead of (or in addition to) uploading files, the system searches for related public records.

```
POST /api/research/:projectId/search
Content-Type: application/json

Body: {
    address: "1234 Main St, Belton, TX 76513",
    county: "Bell",
    parcel_id: "R12345"  // optional
}

Response: {
    results: [
        {
            source: "bell_county_cad",
            title: "Bell County Appraisal District - Property Detail",
            url: "https://propaccess.trueautomation.com/...",
            document_type: "appraisal_record",
            relevance: 0.95,
            description: "Property details, legal description, and improvement data"
        },
        {
            source: "county_clerk",
            title: "Deed - Vol. 3456, Pg. 789",
            url: "...",
            document_type: "deed",
            relevance: 0.88,
            description: "Warranty deed recorded 03/15/2019"
        },
        // ... more results
    ]
}
```

### 3.2 Data Sources to Integrate

Texas-specific sources for Phase 1:

| Source | Data Available | Integration Method |
|--------|---------------|-------------------|
| County Appraisal Districts | Legal descriptions, improvement data, parcel maps, ownership history | Web scraping / API where available |
| County Clerk Records | Deeds, plats, easements, restrictive covenants | Web portal search |
| TNRIS (Texas Natural Resources Info System) | Aerial imagery, topo maps, flood data | Public API |
| FEMA Map Service | Flood zone data | REST API |
| USGS | Topographic maps, elevation data | Public API |
| TxDOT | ROW maps, highway plans | Public downloads |

**Important:** Some county clerks charge per-page fees for document access. The system should display the link/source and let the user decide whether to pull the document, rather than auto-downloading paid content.

### 3.3 User Selection Flow

After search results are displayed, the user selects which documents to import:

1. User reviews search results with source, type, relevance score, and description
2. User checks the ones they want to include
3. System fetches/downloads selected documents
4. Documents enter the same processing pipeline as uploads (Phase 2)

### 3.4 Phase 3 Deliverables Checklist

- [ ] Address search endpoint returns relevant results from at least 2 Texas sources
- [ ] County Appraisal District integration for Bell County (home county, test case)
- [ ] FEMA flood zone lookup working
- [ ] Results include relevance scores, source attribution, and document type classification
- [ ] User can select results to import into the project
- [ ] Selected documents enter the Phase 2 processing pipeline automatically
- [ ] Rate limiting and caching for external API calls
- [ ] User sees clear indication of which sources may have costs

---

## Phase 4: AI Analysis Engine

This is the core value of the feature. The AI reads all processed documents and extracts every piece of usable surveying data.

### 4.1 Analysis Orchestration

```typescript
// lib/research/analysis.service.ts

async function analyzeProject(projectId: string, config: AnalysisConfig): Promise<AnalysisResult> {
    // 1. Load all processed documents
    const documents = await getProcessedDocuments(projectId);
    
    // 2. Build the analysis context
    const context = buildAnalysisContext(documents, config);
    
    // 3. Run extraction pass (per document)
    const extractions = [];
    for (const doc of documents) {
        const result = await extractFromDocument(doc, config);
        extractions.push(result);
    }
    
    // 4. Run cross-reference pass (across all documents)
    const crossRefResult = await crossReferenceExtractions(extractions, config);
    
    // 5. Normalize all values
    const normalized = normalizeAllValues(crossRefResult.dataPoints);
    
    // 6. Detect discrepancies
    const discrepancies = await detectDiscrepancies(normalized, documents);
    
    // 7. Calculate confidence scores
    const scored = await calculateConfidence(normalized, discrepancies);
    
    // 8. Store results
    await storeExtractionResults(projectId, scored, discrepancies);
    
    return { dataPoints: scored, discrepancies };
}
```

### 4.2 Per-Document Extraction

Each document gets its own extraction pass with a domain-specific prompt:

```typescript
async function extractFromDocument(doc: ResearchDocument, config: AnalysisConfig): Promise<ExtractionResult> {
    const prompt = buildExtractionPrompt(doc, config);
    
    const response = await claudeClient.analyze({
        system: PROMPTS.DATA_EXTRACTOR,     // see Phase 13
        user: prompt,
        temperature: 0.0,                   // CRITICAL: deterministic extraction
        max_tokens: 8192
    });
    
    return parseExtractionResponse(response);
}
```

### 4.3 Data Normalization

All extracted values are converted to a machine-readable normalized form so the drawing renderer can use them. This is a code function, NOT an AI call — it must be deterministic.

```typescript
// lib/research/normalization.ts

interface NormalizedBearing {
    quadrant: 'NE' | 'NW' | 'SE' | 'SW';
    degrees: number;
    minutes: number;
    seconds: number;
    decimal_degrees: number;   // computed: degrees + minutes/60 + seconds/3600
    azimuth: number;           // computed: 0-360 from north
    raw_text: string;          // original text from document
}

interface NormalizedDistance {
    value: number;
    unit: 'feet' | 'meters' | 'chains' | 'varas' | 'rods';
    value_in_feet: number;     // always convert to feet for geometry
    raw_text: string;
}

interface NormalizedCurveData {
    radius: number;
    arc_length: number;
    chord_bearing: NormalizedBearing;
    chord_distance: NormalizedDistance;
    delta_angle: { degrees: number; minutes: number; seconds: number; decimal_degrees: number };
    direction: 'left' | 'right';  // concave direction
    tangent_length?: number;
}

interface NormalizedCall {
    type: 'line' | 'curve';
    bearing?: NormalizedBearing;
    distance?: NormalizedDistance;
    curve?: NormalizedCurveData;
    monument_at_end?: NormalizedMonument;
    to_description?: string;     // "to an iron rod found at the NE corner of Lot 5"
}

// Conversion constants
const VARAS_TO_FEET = 2.777778;
const CHAINS_TO_FEET = 66.0;
const RODS_TO_FEET = 16.5;
const METERS_TO_FEET = 3.28084;

function normalizeBearing(raw: string): NormalizedBearing {
    // Parse: "N 45° 30' 15\" E", "N45-30-15E", "N 45 30 15 E", etc.
    const regex = /([NS])\s*(\d+)[°\s-]+(\d+)['\s-]+(\d+(?:\.\d+)?)["\s]*([EW])/i;
    const match = raw.match(regex);
    if (!match) throw new NormalizationError(`Cannot parse bearing: ${raw}`);
    
    const [, ns, deg, min, sec, ew] = match;
    const degrees = parseInt(deg);
    const minutes = parseInt(min);
    const seconds = parseFloat(sec);
    const decimal = degrees + minutes / 60 + seconds / 3600;
    
    let azimuth: number;
    const quadrant = `${ns.toUpperCase()}${ew.toUpperCase()}` as 'NE' | 'NW' | 'SE' | 'SW';
    switch (quadrant) {
        case 'NE': azimuth = decimal; break;
        case 'SE': azimuth = 180 - decimal; break;
        case 'SW': azimuth = 180 + decimal; break;
        case 'NW': azimuth = 360 - decimal; break;
    }
    
    return { quadrant, degrees, minutes, seconds, decimal_degrees: decimal, azimuth, raw_text: raw };
}
```

### 4.4 Cross-Reference Pass

After individual extraction, the AI compares data across all documents:

```typescript
async function crossReferenceExtractions(
    extractions: ExtractionResult[],
    config: AnalysisConfig
): Promise<CrossReferenceResult> {
    // Build a summary of all extracted data grouped by semantic meaning
    const summary = buildCrossReferenceSummary(extractions);
    
    const response = await claudeClient.analyze({
        system: PROMPTS.CROSS_REFERENCE_ANALYZER,  // see Phase 13
        user: `Compare these extractions from ${extractions.length} documents and identify any discrepancies, contradictions, or confirmations:\n\n${JSON.stringify(summary)}`,
        temperature: 0.0
    });
    
    return parseCrossReferenceResponse(response);
}
```

### 4.5 Discrepancy Detection

Discrepancies are detected by both the AI (semantic analysis) and deterministic code (mathematical checks):

**AI-detected discrepancies:**
- Contradictory legal descriptions between documents
- Inconsistent surveyor references
- Ambiguous monument descriptions
- Missing information referenced by other documents

**Code-detected discrepancies (deterministic):**
- Bearing/distance mismatches between documents (beyond tolerance)
- Traverse non-closure (misclosure distance and ratio)
- Area calculation inconsistencies
- Curve data that doesn't compute (arc ≠ radius × delta)

```typescript
function detectMathDiscrepancies(dataPoints: NormalizedDataPoint[]): Discrepancy[] {
    const discrepancies: Discrepancy[] = [];
    
    // Check traverse closure
    const closureResult = calculateTraverseClosure(dataPoints);
    if (closureResult.misclosure > 0.1) { // more than 0.1 feet
        discrepancies.push({
            severity: closureResult.ratio < 10000 ? 'error' : closureResult.ratio < 25000 ? 'discrepancy' : 'info',
            probable_cause: closureResult.ratio < 10000 ? 'surveying_error' : 'rounding_difference',
            title: `Traverse misclosure: ${closureResult.misclosure.toFixed(3)} ft (1:${Math.round(closureResult.ratio)})`,
            description: `The boundary calls do not close. Misclosure distance is ${closureResult.misclosure.toFixed(3)} feet with a precision ratio of 1:${Math.round(closureResult.ratio)}. Texas minimum standard for rural surveys is 1:10,000; for urban surveys 1:25,000.`,
            affects_boundary: true,
            affects_area: true,
            affects_closure: true
        });
    }
    
    // Check curve data consistency
    for (const dp of dataPoints.filter(d => d.data_category === 'curve_data')) {
        const curve = dp.normalized_value as NormalizedCurveData;
        const computedArc = curve.radius * (curve.delta_angle.decimal_degrees * Math.PI / 180);
        if (Math.abs(computedArc - curve.arc_length) > 0.05) {
            discrepancies.push({
                severity: 'discrepancy',
                probable_cause: 'rounding_difference',
                title: `Curve data inconsistency`,
                description: `Arc length ${curve.arc_length} doesn't match computed arc from radius and delta (${computedArc.toFixed(2)}). Difference: ${Math.abs(computedArc - curve.arc_length).toFixed(3)} feet.`
            });
        }
    }
    
    return discrepancies;
}
```

### 4.6 Phase 4 Deliverables Checklist

- [ ] Per-document extraction produces structured `extracted_data_points` records
- [ ] Normalization converts all bearings, distances, curves to standard format
- [ ] Cross-reference pass compares data across documents
- [ ] AI discrepancy detection works with severity classification and probable cause
- [ ] Mathematical discrepancy detection: traverse closure, curve data validation, area check
- [ ] All results stored in database with source attribution
- [ ] Extraction is deterministic (temperature=0) and produces consistent results
- [ ] Processing handles Texas-specific units (varas, chains) correctly
- [ ] Error handling for malformed/unreadable documents

---

## Phase 5: Results Display & Discrepancy Management

### 5.1 Results Page Layout

The review page (`/admin/research/[projectId]/review`) displays:

1. **Data summary cards** — grouped by category (Boundary Calls, Monuments, Easements, etc.)
2. **Each data point** has:
   - The formatted value
   - A confidence badge (green/yellow/red)
   - An **info button (ℹ️)** that expands to show:
     - Exact source text excerpt
     - Document name and page number
     - Clickable link that opens the source document viewer at the exact location
     - AI explanation of how the value was extracted
3. **Discrepancy panel** — sorted by severity (errors first, info last)
4. **Filters sidebar** — show/hide categories based on analysis template

### 5.2 Discrepancy Cards

Each discrepancy card shows:

```
┌─────────────────────────────────────────────────┐
│ 🔴 ERROR — Bearing discrepancy on Line 3        │
│                                                   │
│ Probable cause: Transcription error               │
│                                                   │
│ The deed (Vol. 3456, Pg. 789) states             │
│ N 89° 45' 30" E but the plat shows              │
│ N 89° 45' 30" W — opposite direction.            │
│                                                   │
│ ⚠️ Affects: Boundary, Area, Closure              │
│                                                   │
│ AI Recommendation: The plat bearing is more       │
│ likely correct based on the adjacent calls and    │
│ the traverse closure analysis.                    │
│                                                   │
│ [View in Deed] [View in Plat] [Resolve ▼]       │
│                                                   │
│ Resolution: ○ Accept deed value                   │
│             ○ Accept plat value                   │
│             ○ Enter corrected value: [____]       │
│             ○ Defer — needs field verification    │
│             ○ Accept as-is with note              │
│             Note: [________________________]     │
│                                                   │
│             [Save Resolution]                     │
└─────────────────────────────────────────────────┘
```

### 5.3 Source Document Viewer Component

When the user clicks "View in Deed" or the info-button hyperlink:

```typescript
// app/admin/research/components/SourceDocumentViewer.tsx

interface SourceDocumentViewerProps {
    documentId: string;
    page: number;
    boundingBox?: { x: number; y: number; width: number; height: number };
    highlightText?: string;
}

// For PDFs: renders the PDF page with a highlight overlay on the bounding box
// For images: displays the image with a red rectangle around the relevant region
// For text: shows the full text with the relevant excerpt highlighted in yellow
```

### 5.4 Phase 5 Deliverables Checklist

- [ ] Review page displays all extracted data grouped by category
- [ ] Each data point has an expandable info panel with source attribution
- [ ] Clickable source links open the document at the correct location
- [ ] Discrepancy cards display with correct severity colors and icons
- [ ] Resolution workflow: select resolution type, add notes, save
- [ ] Resolved discrepancies update the `resolved_value` and mark resolved
- [ ] Filter sidebar matches the analysis template configuration
- [ ] Source Document Viewer component works for PDF, image, and text documents
- [ ] Real-time updates when another team member resolves a discrepancy

## Phase 6: Drawing Data Model & Element System

### 6.1 Geometry Engine — Calls to Coordinates

The geometry engine converts surveying calls (bearing + distance) into screen coordinates. This is pure math — no AI involved. It must be deterministic.

```typescript
// lib/research/geometry.engine.ts

interface Point2D { x: number; y: number; }

interface TraverseResult {
    points: Point2D[];                    // computed coordinates for each call endpoint
    elements: DrawingElementInput[];      // element data ready for DB insert
    closure: {
        misclosure_ft: number;
        precision_ratio: number;          // e.g., 25000 means 1:25,000
        adjusted_points?: Point2D[];      // Compass Rule adjusted coordinates
    };
}

function computeTraverse(calls: NormalizedCall[], pob: Point2D): TraverseResult {
    const points: Point2D[] = [pob];
    let current = { ...pob };
    
    for (const call of calls) {
        if (call.type === 'line') {
            const azimuthRad = call.bearing!.azimuth * Math.PI / 180;
            const dx = call.distance!.value_in_feet * Math.sin(azimuthRad);
            const dy = call.distance!.value_in_feet * Math.cos(azimuthRad);
            current = { x: current.x + dx, y: current.y + dy };
            points.push({ ...current });
        } else if (call.type === 'curve') {
            const curvePoints = computeCurvePoints(current, call.curve!);
            points.push(...curvePoints.intermediatePoints);
            current = curvePoints.endpoint;
            points.push({ ...current });
        }
    }
    
    // Calculate closure
    const closingDx = pob.x - current.x;
    const closingDy = pob.y - current.y;
    const misclosure = Math.sqrt(closingDx * closingDx + closingDy * closingDy);
    const perimeter = calculatePerimeter(calls);
    const ratio = perimeter / misclosure;
    
    // Apply Compass Rule adjustment if misclosure is small enough
    let adjustedPoints: Point2D[] | undefined;
    if (ratio > 5000) { // only adjust if precision is better than 1:5,000
        adjustedPoints = applyCompassRule(points, closingDx, closingDy, calls);
    }
    
    return {
        points: adjustedPoints || points,
        elements: buildElementsFromPoints(points, calls, adjustedPoints),
        closure: { misclosure_ft: misclosure, precision_ratio: ratio, adjusted_points: adjustedPoints }
    };
}

function computeCurvePoints(
    startPoint: Point2D,
    curve: NormalizedCurveData
): { intermediatePoints: Point2D[]; endpoint: Point2D } {
    // Calculate center point from start point, radius, and curve direction
    const chordAzimuth = curve.chord_bearing.azimuth * Math.PI / 180;
    const deltaRad = curve.delta_angle.decimal_degrees * Math.PI / 180;
    
    // Determine center offset direction based on curve direction (left/right)
    const offsetAngle = curve.direction === 'right'
        ? chordAzimuth + Math.PI / 2
        : chordAzimuth - Math.PI / 2;
    
    // Generate intermediate points for smooth curve rendering
    const numSegments = Math.max(8, Math.ceil(curve.delta_angle.decimal_degrees / 5));
    const points: Point2D[] = [];
    
    for (let i = 1; i <= numSegments; i++) {
        const fraction = i / numSegments;
        const angle = deltaRad * fraction;
        // ... compute intermediate point on arc
        points.push(computeArcPoint(startPoint, curve, angle));
    }
    
    return { intermediatePoints: points.slice(0, -1), endpoint: points[points.length - 1] };
}

// Compass Rule: distributes closure error proportionally across all traverse legs
function applyCompassRule(
    points: Point2D[],
    closingDx: number,
    closingDy: number,
    calls: NormalizedCall[]
): Point2D[] {
    const totalDistance = calculatePerimeter(calls);
    let cumulativeDistance = 0;
    
    return points.map((point, i) => {
        if (i === 0) return point; // POB stays fixed
        cumulativeDistance += calls[i - 1].distance?.value_in_feet || 0;
        const proportion = cumulativeDistance / totalDistance;
        return {
            x: point.x + closingDx * proportion,
            y: point.y + closingDy * proportion
        };
    });
}
```

### 6.2 Building Drawing Elements from Analyzed Data

Each traverse leg, monument, label, and annotation becomes a `drawing_elements` row:

```typescript
function buildElementsFromAnalysis(
    traverseResult: TraverseResult,
    dataPoints: ExtractedDataPoint[],
    discrepancies: Discrepancy[],
    config: DrawingConfig
): DrawingElementInput[] {
    const elements: DrawingElementInput[] = [];
    
    // 1. Boundary lines from traverse
    traverseResult.points.forEach((point, i) => {
        if (i === 0) return;
        const call = dataPoints.find(dp => dp.sequence_order === i && dp.data_category === 'call');
        
        elements.push({
            element_type: 'line',
            feature_class: 'property_boundary',
            geometry: {
                type: 'line',
                start: [traverseResult.points[i - 1].x, traverseResult.points[i - 1].y],
                end: [point.x, point.y]
            },
            attributes: {
                bearing: call?.normalized_value?.bearing,
                distance: call?.normalized_value?.distance
            },
            confidence_score: call?.extraction_confidence || 0,
            confidence_factors: computeConfidenceFactors(call, discrepancies),
            ai_report: generateElementReport(call, discrepancies),
            source_references: buildSourceReferences(call),
            data_point_ids: call ? [call.id] : [],
            discrepancy_ids: findRelatedDiscrepancies(call, discrepancies)
        });
    });
    
    // 2. Monuments at each point
    const monuments = dataPoints.filter(dp => dp.data_category === 'monument');
    monuments.forEach(mon => {
        const pointIndex = mon.sequence_order;  // which traverse point this monument is at
        if (pointIndex !== undefined && traverseResult.points[pointIndex]) {
            elements.push({
                element_type: 'point',
                feature_class: 'monument',
                geometry: {
                    type: 'point',
                    position: [traverseResult.points[pointIndex].x, traverseResult.points[pointIndex].y]
                },
                attributes: mon.normalized_value,
                confidence_score: mon.extraction_confidence || 0,
                ai_report: `Monument: ${mon.display_value}. ${mon.normalized_value?.condition === 'found' ? 'This monument was found in place.' : 'This monument was set/called for but field verification status is unknown.'}`,
                source_references: buildSourceReferences(mon),
                data_point_ids: [mon.id]
            });
        }
    });
    
    // 3. Bearing/distance labels on each line
    elements.filter(e => e.element_type === 'line' && e.feature_class === 'property_boundary')
        .forEach(lineElement => {
            if (config.label_config.show_bearings && lineElement.attributes.bearing) {
                elements.push(createBearingLabel(lineElement));
            }
            if (config.label_config.show_distances && lineElement.attributes.distance) {
                elements.push(createDistanceLabel(lineElement));
            }
        });
    
    // 4. Easement lines
    const easements = dataPoints.filter(dp => dp.data_category === 'easement');
    easements.forEach(easement => {
        elements.push(buildEasementElement(easement, traverseResult));
    });
    
    // 5. Other features: setbacks, ROW, buildings, fences, etc.
    // Each feature class follows the same pattern:
    // - Find relevant data points
    // - Compute geometry
    // - Build element with attributes, confidence, AI report, source refs
    
    return elements;
}
```

### 6.3 Per-Element Confidence Scoring

Every drawing element gets a confidence score from 0-100, computed from five weighted factors:

```typescript
interface ConfidenceFactors {
    source_quality: number;         // 0-100: how clear/reliable was the source document?
    extraction_certainty: number;   // 0-100: how confident was the AI in reading the value?
    cross_reference_match: number;  // 0-100: do other documents confirm this?
    geometric_consistency: number;  // 0-100: does it fit with adjacent elements?
    closure_contribution: number;   // 0-100: how well does it contribute to closure?
}

const CONFIDENCE_WEIGHTS = {
    source_quality: 0.15,
    extraction_certainty: 0.25,
    cross_reference_match: 0.30,
    geometric_consistency: 0.20,
    closure_contribution: 0.10
};

function computeElementConfidence(factors: ConfidenceFactors): number {
    return Math.round(
        factors.source_quality * CONFIDENCE_WEIGHTS.source_quality +
        factors.extraction_certainty * CONFIDENCE_WEIGHTS.extraction_certainty +
        factors.cross_reference_match * CONFIDENCE_WEIGHTS.cross_reference_match +
        factors.geometric_consistency * CONFIDENCE_WEIGHTS.geometric_consistency +
        factors.closure_contribution * CONFIDENCE_WEIGHTS.closure_contribution
    );
}
```

### 6.4 Per-Element AI Report Generation

Each element gets a 2-5 sentence AI-written report explaining where the data came from and why it received its confidence score:

```typescript
async function generateElementReports(
    elements: DrawingElementInput[],
    dataPoints: ExtractedDataPoint[],
    discrepancies: Discrepancy[]
): Promise<void> {
    // Batch all elements into a single AI call for efficiency
    const response = await claudeClient.analyze({
        system: PROMPTS.ELEMENT_REPORT_WRITER,  // see Phase 13
        user: JSON.stringify({
            elements: elements.map(e => ({
                type: e.element_type,
                feature: e.feature_class,
                attributes: e.attributes,
                confidence: e.confidence_score,
                confidence_factors: e.confidence_factors,
                sources: e.source_references,
                discrepancies: e.discrepancy_ids.length
            }))
        }),
        temperature: 0.1  // slight creativity for natural language, but mostly deterministic
    });
    
    // Each element gets its own report back
    const reports = response.reports;
    elements.forEach((el, i) => {
        el.ai_report = reports[i];
    });
}
```

### 6.5 Phase 6 Deliverables Checklist

- [ ] Geometry engine converts bearing/distance calls to (x,y) coordinates
- [ ] Curve computation handles radius, arc, chord, delta correctly
- [ ] Compass Rule adjustment works for traverse closure
- [ ] All traverse legs become `drawing_elements` rows with full attributes
- [ ] Monuments, labels, easements, and other features become elements
- [ ] Per-element confidence score computed from 5 weighted factors
- [ ] AI-written report generated for every element
- [ ] Source references include document ID, page, location, excerpt, bounding box
- [ ] Element geometry stored as both structured JSON and pre-computed SVG paths

---

## Phase 7: Drawing Renderer & Canvas Engine

### 7.1 SVG Renderer

The SVG renderer converts `drawing_elements` into a complete SVG document. This runs both server-side (for export) and client-side (for display).

```typescript
// lib/research/svg.renderer.ts

function renderDrawingSVG(
    drawing: RenderedDrawing,
    elements: DrawingElement[],
    viewMode: ViewMode,
    options: RenderOptions
): string {
    const { width, height, scale, units } = drawing.canvas_config;
    
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;
    
    // Add defs (patterns, markers, gradients)
    svg += renderDefs(elements, viewMode);
    
    // Render layers in z-index order
    const sortedElements = [...elements].sort((a, b) => a.z_index - b.z_index);
    
    for (const element of sortedElements) {
        if (!element.visible) continue;
        const style = getElementStyle(element, viewMode);
        svg += renderElement(element, style, viewMode);
    }
    
    // Title block
    if (options.showTitleBlock && drawing.title_block) {
        svg += renderTitleBlock(drawing.title_block, width, height);
    }
    
    // North arrow and scale bar
    if (options.showNorthArrow) svg += renderNorthArrow(width, height);
    if (options.showScaleBar) svg += renderScaleBar(scale, units, width, height);
    
    // Legend (for Feature Classification view)
    if (viewMode === 'feature' && options.showLegend) {
        svg += renderFeatureLegend(elements);
    }
    
    // Confidence color bar (for Confidence view)
    if (viewMode === 'confidence' && options.showConfidenceBar) {
        svg += renderConfidenceBar();
    }
    
    svg += '</svg>';
    return svg;
}

function renderElement(element: DrawingElement, style: ElementStyle, viewMode: ViewMode): string {
    // Add data attributes for interactivity (click handling in Fabric.js)
    const dataAttrs = `data-element-id="${element.id}" data-feature="${element.feature_class}" data-confidence="${element.confidence_score}"`;
    
    switch (element.element_type) {
        case 'line':
            return `<line ${dataAttrs} x1="${element.geometry.start[0]}" y1="${element.geometry.start[1]}" x2="${element.geometry.end[0]}" y2="${element.geometry.end[1]}" stroke="${style.stroke}" stroke-width="${style.strokeWidth}" stroke-dasharray="${style.strokeDasharray || ''}" opacity="${style.opacity}" />`;
        
        case 'curve':
            return `<path ${dataAttrs} d="${element.svg_path}" stroke="${style.stroke}" stroke-width="${style.strokeWidth}" fill="none" opacity="${style.opacity}" />`;
        
        case 'polygon':
            const pointStr = element.geometry.points.map((p: number[]) => `${p[0]},${p[1]}`).join(' ');
            return `<polygon ${dataAttrs} points="${pointStr}" stroke="${style.stroke}" stroke-width="${style.strokeWidth}" fill="${style.fill}" opacity="${style.opacity}" />`;
        
        case 'point':
            return renderMonumentSymbol(element, style, dataAttrs);
        
        case 'label':
            return `<text ${dataAttrs} x="${element.geometry.position[0]}" y="${element.geometry.position[1]}" font-size="${style.fontSize}" font-family="${style.fontFamily}" fill="${style.stroke}" transform="rotate(${element.attributes.rotation || 0}, ${element.geometry.position[0]}, ${element.geometry.position[1]})">${element.attributes.text}</text>`;
        
        case 'hatch':
            return `<polygon ${dataAttrs} points="${element.geometry.points.map((p: number[]) => `${p[0]},${p[1]}`).join(' ')}" fill="url(#${element.attributes.pattern})" stroke="${style.stroke}" />`;
        
        default:
            return '';
    }
}
```

### 7.2 Fabric.js Interactive Canvas

The client-side canvas uses Fabric.js for interactive editing:

```typescript
// app/admin/research/components/DrawingCanvas.tsx

interface DrawingCanvasProps {
    drawing: RenderedDrawing;
    elements: DrawingElement[];
    viewMode: ViewMode;
    onElementClick: (element: DrawingElement) => void;
    onElementModified: (elementId: string, changes: Partial<DrawingElement>) => void;
}

// Key interactions:
// - Click any element → opens ElementDetailPanel
// - Hover → shows tooltip with element name and confidence
// - Drag (when unlocked) → repositions element and marks as user_modified
// - Scroll → zoom in/out
// - Right-click → context menu (lock/unlock, hide, view details, edit attributes)
```

### 7.3 Phase 7 Deliverables Checklist

- [ ] SVG renderer produces valid SVG from all element types
- [ ] Line rendering with correct stroke, dash, width, color
- [ ] Curve rendering with smooth SVG arc paths
- [ ] Polygon rendering with fill patterns and hatching
- [ ] Monument symbols render correctly (circle, square, triangle variants)
- [ ] Text labels with rotation and proper positioning
- [ ] Fabric.js canvas loads SVG and enables interaction
- [ ] Click events on elements work and pass element ID to parent
- [ ] Pan, zoom, and scroll work smoothly
- [ ] Element editing (drag, resize) marks as `user_modified`
- [ ] Title block, north arrow, and scale bar render correctly

---

## Phase 8: Drawing View Modes & Visualization

### 8.1 The Five View Modes

```typescript
type ViewMode = 'standard' | 'feature' | 'confidence' | 'discrepancy' | 'custom';
```

**Standard (Black & White)**
- All elements render in black on white background
- Classic survey plat appearance
- Line weights vary by element type (boundary heavier than labels)
- Default view for printing and export

**Feature Classification**
- Each element is colored by its `feature_class`
- A **legend/key sidebar** displays all active feature classes with their colors
- Colors come from the drawing template's `feature_styles` configuration
- Example mapping:
  - Property boundary: black, 2pt solid
  - Road: brown, 2pt solid with tan fill
  - Building: dark gray, 1.5pt solid with light blue fill
  - Fence: green, 1pt dashed
  - Easement: red, 1.5pt long-dash
  - Utility: orange, 1pt dash-dot-dot
  - Water: blue, 1pt solid with light blue fill
  - Concrete: gray, 1pt solid with light gray fill

**Confidence Heat Map**
- Each element is colored on a green-to-red gradient based on `confidence_score`
  - 90-100%: solid green (#00AA00)
  - 70-89%: yellow-green (#88AA00) to yellow (#CCAA00)
  - 50-69%: orange (#FF6600)
  - Below 50%: red (#CC0000)
- Elements with unresolved discrepancies get a **pulsing red outline** (CSS animation)
- A **confidence color bar** is shown at the bottom of the drawing
- Clicking a low-confidence element immediately opens its AI report

**Discrepancy View**
- All elements without discrepancies are grayed out (opacity: 0.15)
- Elements with discrepancies are highlighted in their severity color:
  - Error: red
  - Contradiction: dark orange
  - Discrepancy: orange
  - Uncertain: yellow
  - Unclear: light yellow
  - Info: light blue
- Each highlighted element shows a small severity icon badge

**Custom View**
- User defines their own color rules
- Saveable as drawing template presets
- Example custom rules:
  - "Color all elements from deed documents in blue"
  - "Color all elements from plat documents in green"
  - "Highlight all elements modified by user in purple"
  - "Show only boundary lines and monuments"

### 8.2 View Mode Toolbar

```typescript
// app/admin/research/components/DrawingViewToolbar.tsx

// Renders as a horizontal toolbar above the canvas:
// [Standard] [Feature ▼] [Confidence] [Discrepancy] [Custom ▼]
// 
// Feature dropdown: toggles individual feature classes on/off
// Custom dropdown: shows saved presets and "Create new" option
// 
// Additional controls:
// - Legend toggle (show/hide sidebar legend)
// - Confidence filter slider (hide elements below threshold)
// - Layer visibility toggles
// - Grid toggle
// - Snap-to-grid toggle
```

### 8.3 Element Detail Panel

When the user clicks any element on the canvas:

```typescript
// app/admin/research/components/ElementDetailPanel.tsx

// Slides in from the right side. Shows:
//
// ┌───────────────────────────────────────┐
// │ Line — Property Boundary              │ ← element_type + feature_class
// │ Confidence: 94% ████████████░░ │ ← color-coded bar
// │                                       │
// │ ── Attributes ──                      │
// │ Bearing:  N 89° 45' 30" E           │
// │ Distance: 150.00 feet                │
// │ Monument: Iron rod found (1/2")      │
// │                                       │
// │ ── AI Report ──                       │
// │ This line represents the south        │
// │ boundary of Lot 5, Block A. The       │
// │ bearing and distance were extracted    │
// │ from the deed recorded in Vol. 3456,  │
// │ Pg. 789. The plat confirms with a     │
// │ 0.02' rounding difference.            │
// │                                       │
// │ ── Sources ──                         │
// │ 📄 Deed Vol. 3456 Pg. 789 → p.2 ¶4  │ ← clickable
// │ 📄 Plat 2019-001234 → Sheet 1        │ ← clickable
// │                                       │
// │ ── Confidence Factors ──              │
// │ Source quality:      85%              │
// │ Extraction:          90%              │
// │ Cross-reference:     95%              │
// │ Geometric:           88%              │
// │ Closure:             92%              │
// │                                       │
// │ ── Discrepancies (1) ──               │
// │ ⚠️ Rounding difference (info)         │ ← clickable
// │                                       │
// │ ── User Notes ──                      │
// │ [Add a note...]                       │
// │                                       │
// │ [Edit Attributes] [Lock] [Hide]       │
// └───────────────────────────────────────┘
```

Clicking a source reference opens the **Source Document Viewer** (Phase 5.3) at the exact page and bounding box.

### 8.4 Phase 8 Deliverables Checklist

- [ ] Standard B&W view renders all elements in black
- [ ] Feature Classification view colors elements by feature_class
- [ ] Feature legend sidebar renders with correct colors and labels
- [ ] Confidence Heat Map colors elements on green-to-red gradient
- [ ] Pulsing red outline on elements with unresolved discrepancies
- [ ] Confidence color bar renders at bottom
- [ ] Discrepancy View grays out non-issues, highlights issues by severity
- [ ] Custom View supports user-defined color rules
- [ ] Custom view presets save and load correctly
- [ ] View mode toolbar switches modes instantly (no re-render flicker)
- [ ] Element Detail Panel opens on click with all sections
- [ ] Source reference links open Source Document Viewer at correct location
- [ ] Confidence filter slider hides elements below threshold
- [ ] Layer visibility toggles work

---

## Phase 9: Comparison Engine & Confidence Scoring

### 9.1 Drawing-to-Source Comparison

After the drawing is rendered, the AI compares the rendered drawing back against all source documents:

```typescript
async function compareDrawingToSources(
    drawing: RenderedDrawing,
    elements: DrawingElement[],
    documents: ResearchDocument[],
    dataPoints: ExtractedDataPoint[]
): Promise<ComparisonResult> {
    // 1. Mathematical checks (deterministic)
    const mathChecks = runMathematicalComparison(elements, dataPoints);
    
    // 2. AI semantic comparison
    const aiComparison = await claudeClient.analyze({
        system: PROMPTS.DRAWING_COMPARATOR,   // see Phase 13
        user: JSON.stringify({
            drawing_summary: summarizeDrawing(elements),
            source_data: summarizeSourceData(dataPoints, documents),
            math_check_results: mathChecks
        }),
        temperature: 0.0
    });
    
    // 3. Compute overall confidence
    const overallConfidence = computeOverallConfidence(elements, mathChecks, aiComparison);
    
    return {
        overall_confidence: overallConfidence,
        confidence_breakdown: {
            boundary_accuracy: computeCategoryConfidence(elements, 'property_boundary'),
            monument_accuracy: computeCategoryConfidence(elements, 'monument'),
            easement_accuracy: computeCategoryConfidence(elements, 'easement'),
            area_accuracy: computeAreaConfidence(elements, dataPoints),
            closure_quality: mathChecks.closurePrecision
        },
        persisting_issues: aiComparison.persisting_issues,
        comparison_notes: aiComparison.notes
    };
}
```

### 9.2 Mathematical Comparison Checks

```typescript
function runMathematicalComparison(
    elements: DrawingElement[],
    dataPoints: ExtractedDataPoint[]
): MathCheckResult {
    return {
        // Does the rendered boundary match the traverse?
        closurePrecision: recalculateClosure(elements),
        
        // Does the computed area match the stated area?
        areaComparison: compareAreas(elements, dataPoints),
        
        // Do all bearings/distances match the source data?
        callVerification: verifyAllCalls(elements, dataPoints),
        
        // Do curve parameters compute correctly?
        curveVerification: verifyAllCurves(elements, dataPoints),
        
        // Do adjacent lines share endpoints exactly?
        continuityCheck: checkLineContinuity(elements)
    };
}
```

### 9.3 Overall Confidence Calculation

```typescript
function computeOverallConfidence(
    elements: DrawingElement[],
    mathChecks: MathCheckResult,
    aiComparison: AIComparisonResult
): number {
    // Weighted average of:
    // 40% — average element confidence scores
    // 25% — mathematical verification results
    // 20% — AI comparison assessment
    // 15% — discrepancy resolution completeness
    
    const avgElementConfidence = elements.reduce((sum, e) => sum + e.confidence_score, 0) / elements.length;
    const mathScore = mathChecks.overallScore;
    const aiScore = aiComparison.confidence_assessment;
    const resolutionScore = computeResolutionCompleteness(elements);
    
    return Math.round(
        avgElementConfidence * 0.40 +
        mathScore * 0.25 +
        aiScore * 0.20 +
        resolutionScore * 0.15
    );
}
```

### 9.4 Phase 9 Deliverables Checklist

- [ ] Mathematical comparison runs all checks (closure, area, calls, curves, continuity)
- [ ] AI comparison analyzes drawing against source documents
- [ ] Overall confidence percentage computed from weighted factors
- [ ] Per-category confidence breakdown available
- [ ] Persisting issues list generated with severity and description
- [ ] Verify page displays confidence score prominently
- [ ] Confidence breakdown shown as a chart/visual
- [ ] Persisting issues list shown with resolution options
- [ ] User can iterate: modify drawing → re-verify → updated confidence

---

## Phase 10: Workflow UI & Integration

### 10.1 Seven-Step Workflow

The research project follows a linear workflow with the ability to go back to any previous step:

```
Step 1: Upload      → Upload files and/or search by property address
Step 2: Configure   → Select analysis template or customize filter checkboxes
Step 3: Analyze     → AI processes all documents (shows progress bar)
Step 4: Review      → View extracted data, resolve discrepancies
Step 5: Draw        → Render drawing, interact with canvas, edit elements
Step 6: Verify      → AI compares drawing to sources, shows confidence score
Step 7: Export      → Export to SVG/PNG/PDF/DXF, save to project documents
```

### 10.2 Project Hub Page

```
/admin/research/[projectId]

┌──────────────────────────────────────────────────────────────────┐
│  Property Research: 1234 Main St, Belton, TX                     │
│  Status: Review (Step 4 of 7)                                    │
│                                                                    │
│  ① Upload  ② Configure  ③ Analyze  ④ Review  ⑤ Draw  ⑥ Verify  ⑦ Export │
│  ✅ Done    ✅ Done      ✅ Done    ● Active   ○ ---   ○ ---    ○ ---   │
│                                                                    │
│  [Continue to Review →]                                           │
│                                                                    │
│  ── Quick Stats ──                                                │
│  Documents: 5 uploaded, 3 from search                             │
│  Data points: 47 extracted                                        │
│  Discrepancies: 3 (1 error, 1 discrepancy, 1 info)              │
│  Resolved: 1 of 3                                                 │
└──────────────────────────────────────────────────────────────────┘
```

### 10.3 Sidebar Integration

Add to the admin sidebar navigation (same pattern as existing `/admin/jobs`, `/admin/learn` entries):

```typescript
// In the admin sidebar component, add alongside existing nav items like Jobs, Learn, etc.
{
    label: 'Property Research',
    icon: SearchIcon,  // or MagnifyingGlassIcon from heroicons
    href: '/admin/research',
    children: [
        { label: 'All Projects', href: '/admin/research' },
        { label: 'New Research', href: '/admin/research/new' },
        { label: 'Templates', href: '/admin/research/templates' }
    ]
}
```

Also add to `middleware.ts` ADMIN_ONLY_ROUTES (admin-only access for now):
```typescript
const ADMIN_ONLY_ROUTES = [
  // ... existing routes ...
  '/admin/research',        // Property Research
];
```

### 10.4 Phase 10 Deliverables Checklist

- [ ] Project list page at `/admin/research` with search, filter, sort
- [ ] New project creation page with name, address, description fields
- [ ] Project hub page with 7-step workflow visualization
- [ ] Each step has its own page under `/admin/research/[projectId]/[step]`
- [ ] Workflow state tracked in `research_projects.status`
- [ ] Back navigation allowed to any completed step
- [ ] Step completion validation (can't skip to Draw without Analyze)
- [ ] Sidebar navigation added to admin dashboard (matching existing Jobs/Learn pattern)
- [ ] Route added to `ADMIN_ONLY_ROUTES` in `middleware.ts`

---

## Phase 11: API Routes

### 11.1 Complete Route List

All routes use Next.js Route Handlers under `app/api/admin/research/` and follow the existing patterns in the codebase (see `app/api/admin/jobs/route.ts`, `app/api/admin/learn/ai-grade/route.ts` for reference).

**Pattern for every route:**
```typescript
import { auth } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { supabaseAdmin } from '@/lib/supabase';

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // ... route logic using supabaseAdmin
}, { routeName: 'research/...' });
```

**Projects**
```
GET    /api/research                          → List all research projects for the org
POST   /api/research                          → Create new research project
GET    /api/research/:projectId               → Get project details + stats
PATCH  /api/research/:projectId               → Update project (name, status, etc.)
DELETE /api/research/:projectId               → Soft-delete (archive) project
```

**Documents**
```
POST   /api/research/:projectId/documents           → Upload file(s)
POST   /api/research/:projectId/documents/manual     → Create manual entry document
GET    /api/research/:projectId/documents            → List all documents
GET    /api/research/:projectId/documents/:docId     → Get document details
DELETE /api/research/:projectId/documents/:docId     → Remove document from project
GET    /api/research/:projectId/documents/:docId/content → Get extracted text / signed URL
```

**Property Search**
```
POST   /api/research/:projectId/search               → Search for property records
POST   /api/research/:projectId/search/import         → Import selected search results
```

**Analysis**
```
POST   /api/research/:projectId/analyze               → Start AI analysis
GET    /api/research/:projectId/analyze/status         → Get analysis progress
GET    /api/research/:projectId/data-points            → List all extracted data points
GET    /api/research/:projectId/data-points/:dpId      → Get single data point with source
```

**Discrepancies**
```
GET    /api/research/:projectId/discrepancies          → List all discrepancies
PATCH  /api/research/:projectId/discrepancies/:dId     → Resolve/update discrepancy
```

**Drawings**
```
POST   /api/research/:projectId/drawings               → Render new drawing
GET    /api/research/:projectId/drawings                → List drawings (versions)
GET    /api/research/:projectId/drawings/:drawingId     → Get drawing metadata
GET    /api/research/:projectId/drawings/:drawingId/elements → Get all elements
PATCH  /api/research/:projectId/drawings/:drawingId/elements/:eId → Update element
GET    /api/research/:projectId/drawings/:drawingId/svg → Get rendered SVG
POST   /api/research/:projectId/drawings/:drawingId/compare → Run comparison
POST   /api/research/:projectId/drawings/:drawingId/export  → Export to format
```

**Templates**
```
GET    /api/research/templates/analysis          → List analysis templates
POST   /api/research/templates/analysis          → Create analysis template
GET    /api/research/templates/drawing           → List drawing templates
POST   /api/research/templates/drawing           → Create drawing template
PATCH  /api/research/templates/:type/:id         → Update template
DELETE /api/research/templates/:type/:id         → Delete template
```

### 11.2 Phase 11 Deliverables Checklist

- [ ] All 25+ endpoints implemented as Next.js Route Handlers with `withErrorHandler()` wrapper
- [ ] Auth check via `auth()` on every endpoint, role check via `isAdmin()` from `@/lib/auth`
- [ ] Request validation with Zod schemas (or inline validation matching existing API patterns)
- [ ] Pagination on list endpoints (offset-based, matching existing `?page=1&limit=20` pattern)
- [ ] Error responses follow existing `{ error: string }` format
- [ ] Rate limiting on analysis and search endpoints
- [ ] File upload size limits enforced via Next.js config (`next.config.js`)
- [ ] Route added to `ADMIN_ONLY_ROUTES` in `middleware.ts`

---

## Phase 12: Drawing Templates & Export

### 12.1 Template Management

Users can create, save, and reuse drawing templates that control:
- Paper size and orientation
- Feature class color/style mapping
- Label configuration (what to show, font sizes, precision)
- Title block layout
- Confidence view color scale
- Custom view presets

Templates are stored in `drawing_templates` and scoped to the organization.

### 12.2 Export Formats

```typescript
async function exportDrawing(
    drawing: RenderedDrawing,
    elements: DrawingElement[],
    format: 'svg' | 'png' | 'pdf' | 'dxf'
): Promise<Buffer> {
    switch (format) {
        case 'svg':
            return Buffer.from(renderDrawingSVG(drawing, elements, 'standard', { showTitleBlock: true }));
        
        case 'png':
            // Render SVG then convert with sharp
            const svg = renderDrawingSVG(drawing, elements, 'standard', { showTitleBlock: true });
            return await sharp(Buffer.from(svg)).png({ quality: 95 }).toBuffer();
        
        case 'pdf':
            // Use jspdf to create PDF with SVG embedded
            return await renderToPdf(drawing, elements);
        
        case 'dxf':
            // Use dxf-writer to create AutoCAD DXF
            return await renderToDxf(drawing, elements);
    }
}
```

### 12.3 DXF Export (AutoCAD Compatibility)

Surveyors frequently need to open drawings in AutoCAD or Civil 3D. The DXF export maps feature classes to AutoCAD layers:

```typescript
function renderToDxf(drawing: RenderedDrawing, elements: DrawingElement[]): Buffer {
    const dxf = new DxfWriter();
    
    // Create layers for each feature class
    dxf.addLayer('BOUNDARY', 7);     // white (standard AutoCAD convention)
    dxf.addLayer('EASEMENT', 1);     // red
    dxf.addLayer('SETBACK', 5);      // blue
    dxf.addLayer('ROW', 8);          // gray
    dxf.addLayer('BUILDING', 4);     // cyan
    dxf.addLayer('FENCE', 3);        // green
    dxf.addLayer('MONUMENT', 1);     // red
    dxf.addLayer('LABELS', 7);       // white
    
    for (const element of elements) {
        const layer = featureClassToLayer(element.feature_class);
        switch (element.element_type) {
            case 'line':
                dxf.addLine(element.geometry.start, element.geometry.end, layer);
                break;
            case 'curve':
                dxf.addArc(/* ... */);
                break;
            case 'label':
                dxf.addText(element.attributes.text, element.geometry.position, element.style.fontSize, layer);
                break;
            // ... other element types
        }
    }
    
    return dxf.toBuffer();
}
```

### 12.4 Phase 12 Deliverables Checklist

- [ ] Drawing template CRUD (create, list, update, delete)
- [ ] System templates provided (Standard B&W, Professional Color)
- [ ] Template preview renders a thumbnail
- [ ] SVG export works with title block
- [ ] PNG export at print quality (300 DPI minimum)
- [ ] PDF export with proper paper size and margins
- [ ] DXF export with AutoCAD-compatible layers
- [ ] Export files stored in S3 and available for download
- [ ] User can select which view mode to export

---

## Phase 13: AI Parameterization & Consistency

**This is critical for producing consistent, reliable results.** All AI calls use parameterized system prompts with zero or near-zero temperature. The prompts are version-controlled and never change between user sessions.

### 13.1 Prompt Registry

All prompts live in one file with version numbers:

```typescript
// lib/research/prompts.ts

export const PROMPTS = {
    // Version all prompts — when you change a prompt, increment the version
    // and log it in the research_projects.analysis_metadata
    
    DOCUMENT_CLASSIFIER: {
        version: '1.0.0',
        temperature: 0.0,
        system: `You are a Texas land surveying document classifier. You will be given the text content of a document and must classify it into exactly one of these categories:

deed, plat, survey, legal_description, title_commitment, easement, restrictive_covenant, field_notes, subdivision_plat, metes_and_bounds, county_record, appraisal_record, aerial_photo, topo_map, utility_map, other

RULES:
1. Respond with ONLY a JSON object: { "document_type": "category", "confidence": 0-100, "reasoning": "one sentence" }
2. If the document contains a metes and bounds legal description with bearings and distances, classify as "metes_and_bounds" even if it is inside a deed.
3. If the document is a recorded plat or subdivision plat with lot lines, classify as "subdivision_plat" if it shows lots, or "plat" if it is a boundary survey.
4. "survey" is for completed survey documents that include a surveyor's certification.
5. If uncertain, use "other" with a low confidence score.`
    },
    
    OCR_EXTRACTOR: {
        version: '1.0.0',
        temperature: 0.0,
        system: `You are an OCR specialist for Texas land surveying documents. You will be given an image of a document (deed, plat, survey, field notes, etc.).

TASK: Extract ALL text visible in the document. For each text region, provide:
1. The text content (exact as written, including abbreviations and symbols)
2. The approximate bounding box as { "x": percent_from_left, "y": percent_from_top, "width": percent_width, "height": percent_height } (all values 0-100)
3. Your confidence in the OCR reading (0-100)

CRITICAL RULES:
- Preserve all symbols: °, ', ", ½, ¼
- Preserve all abbreviations: N, S, E, W, ft, Blk, Lt
- If a character is unclear, provide your best reading and note it with [?]
- For bearing notation, ensure degree/minute/second symbols are correct
- For distances, preserve decimal precision exactly as shown

RESPONSE FORMAT:
{
    "full_text": "complete extracted text in reading order",
    "regions": [
        { "text": "N 45° 30' 15\" E", "bbox": { "x": 10, "y": 20, "width": 15, "height": 2 }, "confidence": 95 }
    ],
    "overall_confidence": 90,
    "notes": "any issues encountered during extraction"
}`
    },
    
    DATA_EXTRACTOR: {
        version: '1.0.0',
        temperature: 0.0,
        system: `You are a Texas Registered Professional Land Surveyor (RPLS) analyzing documents for data extraction. You will be given the full text of a surveying-related document and a configuration specifying what data categories to extract.

TASK: Extract every piece of usable surveying data from this document. For each data point, provide:

1. data_category: one of [bearing, distance, call, monument, point_of_beginning, curve_data, area, boundary_description, easement, setback, right_of_way, adjoiner, recording_reference, date_reference, surveyor_info, legal_description, lot_block, subdivision_name, coordinate, elevation, zoning, flood_zone, utility_info, annotation, symbol, other]

2. raw_value: the EXACT text as it appears in the document

3. normalized_value: a structured JSON object with parsed values:
   - For bearings: { "quadrant": "NE", "degrees": 45, "minutes": 30, "seconds": 15 }
   - For distances: { "value": 150.00, "unit": "feet" }
   - For calls: { "bearing": {...}, "distance": {...}, "monument_at_end": "iron rod found" }
   - For curve data: { "radius": 200.00, "arc_length": 85.50, "chord_bearing": {...}, "chord_distance": {...}, "delta": {...}, "direction": "right" }
   - For monuments: { "type": "iron_rod", "size": "1/2 inch", "cap": "RPLS 12345", "condition": "found" }
   - For area: { "value": 1.234, "unit": "acres" }

4. display_value: human-friendly formatted version

5. source_page: page number (1-indexed)
6. source_location: description of where on the page ("paragraph 3, line 2", "call sequence line 7")
7. source_text_excerpt: 1-3 sentences of surrounding context

8. sequence_order: for call sequences, the position number (1, 2, 3...). Null for non-sequential data.
9. sequence_group: for call sequences, a group name ("main_boundary", "easement_1", "lot_5_boundary")

10. extraction_confidence: 0-100 confidence in the accuracy of this extraction
11. confidence_reasoning: one sentence explaining the confidence score

CRITICAL RULES:
- Extract EVERY piece of data, even if it seems redundant with other documents
- Preserve exact text — do not "fix" perceived errors (the discrepancy system handles that)
- For Texas documents, be aware of varas (1 vara = 2.777778 feet) and Spanish land grants
- Call sequences must be in the correct order (follow the legal description's path)
- If a call sequence mentions "thence" it indicates the next leg of the traverse
- "POB" or "Point of Beginning" marks the start of a boundary traverse
- Monument condition is critical: "found" vs "set" vs "called for" have different meanings
- If the document references other documents (e.g., "as described in Vol. 1234, Pg. 567"), extract the recording reference

RESPONSE FORMAT:
{
    "data_points": [ { all fields above } ],
    "document_summary": "2-3 sentence summary of what this document describes",
    "extraction_notes": "any issues or ambiguities encountered"
}`
    },
    
    CROSS_REFERENCE_ANALYZER: {
        version: '1.0.0',
        temperature: 0.0,
        system: `You are a Texas RPLS performing a cross-reference analysis of data extracted from multiple surveying documents for the same property.

TASK: Compare all extracted data points across documents. For each comparison:

1. CONFIRMATIONS: Data points from different documents that agree (same bearing, same distance, same monument)
2. DISCREPANCIES: Data points that disagree, with severity classification:
   - "info": Minor formatting difference, no practical impact
   - "unclear": Text is ambiguous but one interpretation is likely
   - "uncertain": Could reasonably be interpreted multiple ways
   - "discrepancy": Two documents disagree on a value
   - "contradiction": Two documents directly contradict each other
   - "error": Almost certainly a mistake

3. For each discrepancy, determine the PROBABLE CAUSE:
   - "clerical_error": Typo, transposition (e.g., "N 45°" vs "N 54°")
   - "drawing_error": Drafting mistake on plat (label in wrong place, wrong line)
   - "surveying_error": Field measurement issue
   - "transcription_error": Error copying from one document to another
   - "rounding_difference": Minor rounding (149.98 vs 150.00)
   - "datum_difference": Different coordinate datums
   - "age_difference": Older vs newer survey standards
   - "legal_ambiguity": Genuinely ambiguous legal language
   - "missing_information": Referenced data not available
   - "ocr_uncertainty": OCR could not read clearly

4. For each discrepancy, provide:
   - title: short summary (10 words max)
   - description: detailed explanation (2-4 sentences)
   - ai_recommendation: what you recommend the surveyor do about it
   - affects_boundary: boolean
   - affects_area: boolean
   - affects_closure: boolean
   - estimated_impact: quantified if possible ("~0.5 ft", "changes area by 0.02 acres")

CRITICAL RULES:
- Do NOT mark formatting differences as errors (e.g., "N 45° 30'" vs "N45°30'" is info, not a discrepancy)
- Bearing differences of less than 5 arc-seconds are typically rounding and should be "info"
- Distance differences of less than 0.05 feet are typically rounding and should be "info"
- A bearing going the wrong direction (E vs W) is always an "error"
- Area calculations should account for rounding — differences under 0.01 acres are typically "info"
- Always specify which documents disagree and include the exact values from each

RESPONSE FORMAT:
{
    "confirmations": [ { "description": "...", "data_point_ids": [...] } ],
    "discrepancies": [ { all fields above } ],
    "overall_assessment": "2-3 sentence summary of the cross-reference analysis"
}`
    },
    
    ELEMENT_REPORT_WRITER: {
        version: '1.0.0',
        temperature: 0.1,
        system: `You are writing brief analysis reports for individual elements of a property survey drawing. Each element is a line, curve, monument, label, or other feature.

For each element, write a 2-5 sentence report that explains:
1. What this element represents in the property survey
2. Where the underlying data came from (which document, which page/section)
3. Whether other documents confirm or contradict this data
4. Why the confidence score is what it is

STYLE:
- Write in third person, professional surveying tone
- Be specific: cite exact document references, bearings, distances
- If confidence is below 80%, explain specifically what lowers it
- If there are discrepancies, mention them and their severity

RESPONSE FORMAT:
{ "reports": ["report for element 0", "report for element 1", ...] }`
    },
    
    DRAWING_COMPARATOR: {
        version: '1.0.0',
        temperature: 0.0,
        system: `You are a Texas RPLS reviewing a rendered drawing against its source documents. Your job is to verify that the drawing accurately represents the source data and to identify any remaining issues.

COMPARE:
1. Does every boundary call in the source documents appear as a line element in the drawing?
2. Do the bearings and distances on the drawing match the source documents?
3. Are all monuments shown at the correct locations?
4. Are easements, setbacks, and ROW lines positioned correctly?
5. Does the computed area match the stated area?
6. Is the traverse closure within acceptable limits?
7. Are there any elements in the drawing that do NOT have a source document backing?

RESPOND WITH:
{
    "confidence_assessment": 0-100,
    "persisting_issues": [
        {
            "severity": "info|unclear|uncertain|discrepancy|contradiction|error",
            "title": "short description",
            "description": "detailed explanation",
            "recommendation": "what to do about it"
        }
    ],
    "notes": "overall assessment of drawing accuracy (2-3 sentences)"
}`
    }
};
```

### 13.2 AI Client Wrapper

All AI calls go through a single wrapper that enforces consistency:

```typescript
// lib/research/ai-client.ts

interface AICallOptions {
    promptKey: keyof typeof PROMPTS;
    userContent: string | Array<{ type: string; [key: string]: any }>;
    maxTokens?: number;
    overrideTemperature?: number;  // only used for testing
}

interface AICallResult {
    response: any;
    promptVersion: string;
    model: string;
    tokensUsed: { input: number; output: number };
    latencyMs: number;
}

async function callAI(options: AICallOptions): Promise<AICallResult> {
    const prompt = PROMPTS[options.promptKey];
    const startTime = Date.now();
    
    const response = await anthropicClient.messages.create({
        model: 'claude-sonnet-4-5-20250929',       // LOCKED — do not change without testing
        max_tokens: options.maxTokens || 8192,
        temperature: options.overrideTemperature ?? prompt.temperature,
        system: prompt.system,
        messages: [{ role: 'user', content: options.userContent }]
    });
    
    const result = parseResponse(response);
    
    // Log for audit and debugging
    await logAICall({
        promptKey: options.promptKey,
        promptVersion: prompt.version,
        model: 'claude-sonnet-4-5-20250929',
        tokensUsed: { input: response.usage.input_tokens, output: response.usage.output_tokens },
        latencyMs: Date.now() - startTime,
        success: true
    });
    
    return {
        response: result,
        promptVersion: prompt.version,
        model: 'claude-sonnet-4-5-20250929',
        tokensUsed: { input: response.usage.input_tokens, output: response.usage.output_tokens },
        latencyMs: Date.now() - startTime
    };
}
```

### 13.3 Consistency Guarantees

| Guarantee | Implementation |
|-----------|---------------|
| **Same input → same extraction** | Temperature 0.0 for all extraction/analysis prompts |
| **Prompt versioning** | Every prompt has a version string; logged with every AI call |
| **Model pinned** | `claude-sonnet-4-5-20250929` hardcoded; model changes require full regression testing |
| **Normalization is code, not AI** | Bearing/distance/curve parsing is deterministic TypeScript — AI extracts raw text, code normalizes it |
| **Discrepancy thresholds are code** | Tolerance values (5 arc-seconds, 0.05 feet, etc.) are constants in code, not in prompts |
| **Reproducible analysis** | Each research project stores the prompt versions used; re-running analysis with the same prompts produces the same results |
| **Structured output** | All AI responses are JSON; the wrapper validates response shape before returning |

### 13.4 Phase 13 Deliverables Checklist

- [ ] All 6 system prompts written and version-numbered
- [ ] AI client wrapper enforces temperature, model, and logging
- [ ] Every AI call is logged with prompt version, model, tokens, latency
- [ ] Normalization is 100% code, not AI
- [ ] Discrepancy thresholds are named constants in a config file
- [ ] Prompt versions are stored on each research project for reproducibility
- [ ] JSON response validation on every AI response
- [ ] Error handling and retry logic for AI API failures

---

## Phase 14: Standalone / White-Label Prep

### 14.1 Abstraction Layers

To sell this as a standalone product to other surveying firms, civil engineering firms, and education institutions:

```typescript
// lib/research/white-label.config.ts

interface WhiteLabelConfig {
    // Branding
    companyName: string;           // "Starr Surveying" → "Acme Engineering"
    productName: string;           // "Starr Recon" → "Acme Research Tool"
    logoUrl: string;
    primaryColor: string;
    
    // Terminology
    terms: {
        project: string;           // "Research Project" → "Investigation"
        document: string;          // "Document" → "Record"
        drawing: string;           // "Drawing" → "Plat"
        discrepancy: string;       // "Discrepancy" → "Issue"
    };
    
    // Feature flags
    features: {
        propertySearch: boolean;   // disable if customer handles their own research
        aiAnalysis: boolean;       // core feature, usually always on
        drawingRenderer: boolean;  // can be sold separately
        dxfExport: boolean;        // premium feature
        confidenceScoring: boolean;
        multiUserCollaboration: boolean;
    };
    
    // Jurisdiction
    jurisdiction: {
        state: string;             // "TX" → "CA", "FL", etc.
        surveyStandards: string;   // which state minimum standards to use
        units: 'feet' | 'meters';
        dataSources: DataSourceConfig[];  // which county/state APIs to use
    };
}
```

### 14.2 Education Mode

For SIT/RPLS training at trade schools and universities:

```typescript
interface EducationConfig extends WhiteLabelConfig {
    educationMode: true;
    
    features: {
        // All base features plus:
        practiceProjects: boolean;       // sample projects with known answers
        gradingRubric: boolean;          // auto-grade student analysis accuracy
        studentProgress: boolean;        // track student competency over time
        instructorDashboard: boolean;    // instructor sees all student work
        hintsEnabled: boolean;           // AI provides hints instead of answers
        stepByStepMode: boolean;         // forces students through each step
        timeLimits: boolean;             // timed exercises
    };
    
    grading: {
        extractionAccuracy: number;      // weight for data extraction accuracy
        discrepancyDetection: number;    // weight for finding issues
        resolutionQuality: number;       // weight for resolution decisions
        drawingAccuracy: number;         // weight for drawing quality
    };
}
```

### 14.3 Phase 14 Deliverables Checklist

- [ ] White-label config schema defined
- [ ] All UI text uses config values instead of hardcoded strings
- [ ] Logo and colors configurable via config
- [ ] Feature flags gate all optional features
- [ ] State/jurisdiction is configurable (prompts adapt to local standards)
- [ ] Education mode config schema defined
- [ ] Practice project framework (sample data with known-correct answers)
- [ ] Auto-grading engine compares student work to known answers
- [ ] Instructor dashboard shows student progress
- [ ] All of the above is designed but implementation can be phased

---

## Phase 15: Dependencies & DevOps

### 15.1 New Dependencies

Add to `package.json` (the single project-level package.json):
```json
{
    "dependencies": {
        "pdf-parse": "^1.1.1",
        "sharp": "^0.33.0",
        "mammoth": "^1.8.0",
        "dxf-writer": "^2.0.0",
        "jspdf": "^2.5.1",
        "fabric": "^6.0.0"
    }
}
```

> **Note:** `@anthropic-ai/sdk` is already installed at `^0.74.0` — do NOT downgrade it. The existing `app/api/admin/learn/ai-grade/route.ts` already uses this SDK successfully.

### 15.2 Environment Variables

Add to `.env.example` (which already exists in the project root):
```env
# AI Property Research (Phase 2+)
# ANTHROPIC_API_KEY is already defined in .env.example — reuse it
RESEARCH_AI_MODEL=claude-sonnet-4-5-20250929
RESEARCH_MAX_FILE_SIZE_MB=50
RESEARCH_MAX_PROJECT_STORAGE_MB=500

# File Storage — use Supabase Storage or S3
# If using Supabase Storage, no extra env vars needed (uses NEXT_PUBLIC_SUPABASE_URL)
# If using S3:
# RESEARCH_S3_BUCKET=starr-research-documents
# RESEARCH_S3_REGION=us-east-1
# AWS_ACCESS_KEY_ID=...
# AWS_SECRET_ACCESS_KEY=...

# Property Search APIs (Phase 3)
TNRIS_API_KEY=...
FEMA_API_KEY=...
```

### 15.3 Implementation Priority Order

If building this incrementally, the recommended order is:

```
Priority 1 (Foundation):
  Phase 1  — Database schema (everything depends on this)
  Phase 2  — File upload & processing (need docs before analysis)
  Phase 13 — AI prompts (write prompts before implementing analysis)

Priority 2 (Core Value):
  Phase 4  — AI analysis engine (the core feature)
  Phase 5  — Results display (users need to see results)
  Phase 11 — API routes (connects frontend to backend)

Priority 3 (Drawing):
  Phase 6  — Drawing data model & element system
  Phase 7  — Drawing renderer & canvas
  Phase 8  — View modes & visualization

Priority 4 (Verification):
  Phase 9  — Comparison engine & confidence scoring
  Phase 10 — Workflow UI (ties everything together)
  Phase 12 — Templates & export

Priority 5 (Scale):
  Phase 3  — Property search (nice-to-have, not blocking)
  Phase 14 — White-label prep (future revenue)
  Phase 15 — DevOps (ongoing)
```

### 15.4 Phase 15 Deliverables Checklist

- [ ] All npm dependencies installed and version-locked
- [ ] Environment variables documented and added to `.env.example`
- [ ] Docker Compose updated with any new services
- [ ] CI pipeline handles new dependencies
- [ ] S3 bucket created for research documents
- [ ] API rate limiting configured for AI endpoints
- [ ] Monitoring/alerting for AI API costs and usage

---

## Appendix A: TypeScript Interfaces

These go in `types/research.ts` (alongside existing `types/index.ts` and `types/next-auth.d.ts`):

```typescript
// Core project types
export interface ResearchProject { /* matches research_projects table */ }
export interface ResearchDocument { /* matches research_documents table */ }
export interface ExtractedDataPoint { /* matches extracted_data_points table */ }
export interface Discrepancy { /* matches discrepancies table */ }
export interface AnalysisTemplate { /* matches analysis_templates table */ }
export interface RenderedDrawing { /* matches rendered_drawings table */ }
export interface DrawingElement { /* matches drawing_elements table */ }
export interface DrawingTemplate { /* matches drawing_templates table */ }

// Normalized value types
export interface NormalizedBearing { /* see Phase 4.3 */ }
export interface NormalizedDistance { /* see Phase 4.3 */ }
export interface NormalizedCurveData { /* see Phase 4.3 */ }
export interface NormalizedCall { /* see Phase 4.3 */ }
export interface NormalizedMonument { type: string; size?: string; cap?: string; condition: 'found' | 'set' | 'called_for'; }

// Geometry types
export interface Point2D { x: number; y: number; }
export interface ElementGeometry { type: string; [key: string]: any; }
export interface ElementStyle { stroke: string; strokeWidth: number; strokeDasharray?: string; fill?: string; opacity: number; fontSize?: number; fontFamily?: string; }

// Confidence types
export interface ConfidenceFactors { source_quality: number; extraction_certainty: number; cross_reference_match: number; geometric_consistency: number; closure_contribution: number; }

// Source reference (for info button / hyperlinks)
export interface SourceReference { document_id: string; document_label: string; page: number; location: string; excerpt: string; bounding_box?: { x: number; y: number; width: number; height: number; }; }

// View modes
export type ViewMode = 'standard' | 'feature' | 'confidence' | 'discrepancy' | 'custom';

// Workflow steps
export type WorkflowStep = 'upload' | 'configure' | 'analyzing' | 'review' | 'drawing' | 'verifying' | 'complete';

// API request/response types
export interface CreateResearchProjectRequest { name: string; description?: string; property_address?: string; county?: string; state?: string; }
export interface StartAnalysisRequest { template_id?: string; filters?: Record<string, boolean>; }
export interface ResolveDiscrepancyRequest { resolution_status: string; resolution_notes?: string; resolved_value?: any; }
export interface RenderDrawingRequest { template_id?: string; name: string; canvas_config?: any; title_block?: any; }
export interface ExportDrawingRequest { format: 'svg' | 'png' | 'pdf' | 'dxf'; view_mode?: ViewMode; options?: any; }
```

---

## Appendix B: Middleware & Route Protection

Add research routes to the existing middleware role protection in `middleware.ts`:

```typescript
// In middleware.ts — add to ADMIN_ONLY_ROUTES array
const ADMIN_ONLY_ROUTES = [
  // ... existing routes ...
  '/admin/research',
];
```

> **Note:** The existing codebase does not have a `feature_modules` table or feature-gating system. For Phase 14 (white-label), we may introduce one. For now, route protection via `middleware.ts` + `auth()` role checks is sufficient and consistent with the rest of the app.

---

**End of Implementation Plan**

*This document should be used as the primary reference when implementing each phase. Each phase section is self-contained and provides the database schemas, TypeScript interfaces, algorithm descriptions, API contracts, and acceptance criteria needed to build that phase independently.*
