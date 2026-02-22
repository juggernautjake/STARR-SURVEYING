# Property Research & Analysis + Plat Drawing Renderer — Implementation Plan

## Feature Overview

An AI-powered property research and analysis system that lets users upload deeds, records, and plat drawings (or search by address), extracts structured data via AI, flags discrepancies, and renders a new drawing from the vetted information — all within the existing STARR-SURVEYING Next.js/Supabase platform.

---

## Phase 1: Database Schema & Core Data Models

**Goal**: Create all tables needed to store research projects, uploaded documents, extracted data, discrepancies, drawing specs, and templates.

### Step 1.1 — `research_projects` table
Stores top-level metadata for each research session (project name, property address, status, created_by, etc.).

### Step 1.2 — `research_documents` table
Stores uploaded files and links (file_name, file_url, file_type, mime_type, source_type [upload|link|search], page_count, raw_text_extracted, project_id FK).

### Step 1.3 — `extracted_data_points` table
Stores every piece of information AI pulls from documents:
- `document_id` FK, `project_id` FK
- `data_type` (bearing, distance, monument, owner, legal_description, area, easement, setback, boundary_call, etc.)
- `value` (jsonb — flexible schema per data_type)
- `raw_text` (exact text from document it was pulled from)
- `source_location` (page number, paragraph, line, bounding box for images)
- `confidence` (AI confidence 0-1)
- `is_verified` (boolean — user has reviewed)

### Step 1.4 — `discrepancies` table
Stores flagged issues:
- `project_id` FK
- `data_point_ids` (uuid[] — the conflicting data points)
- `type` (enum: unclear, uncertain, discrepancy, contradiction, error)
- `likely_cause` (enum: clerical_error, drawing_error, surveying_error, transcription_error, ambiguous_language, unknown)
- `severity` (enum: info, low, medium, high, critical)
- `description`, `ai_explanation`
- `resolution_status` (enum: unresolved, user_resolved, accepted_as_is, overridden)
- `resolution_notes`, `resolved_by`, `resolved_at`

### Step 1.5 — `analysis_templates` table
Stores user-defined filter/display presets:
- `name`, `description`, `created_by`
- `filters` (jsonb — which data types to extract/display, checkboxes state)
- `is_default` (boolean)

### Step 1.6 — `rendered_drawings` table
Stores generated drawings:
- `project_id` FK
- `drawing_data` (jsonb — all geometry, labels, symbology)
- `drawing_settings` (jsonb — colors, line weights, text sizes, symbology config)
- `confidence_score` (decimal — overall accuracy %)
- `comparison_notes` (jsonb — AI comparison results)
- `version` (integer — track revisions)
- `svg_output`, `png_output` (text/bytea — rendered outputs)

### Step 1.7 — `drawing_templates` table
Stores reusable drawing specification presets:
- `name`, `description`, `created_by`
- `settings` (jsonb — line styles, colors, text formatting, symbology, layout)
- `is_default` (boolean)

### Step 1.8 — Migration SQL file
Single migration file: `seeds/090_research_analysis.sql` with all CREATE TABLE IF NOT EXISTS statements, indexes, and RLS policies.

---

## Phase 2: File Upload & Document Processing Pipeline

**Goal**: Let users upload deeds, plats, and records; extract raw text/image data from them.

### Step 2.1 — File upload API endpoint
`POST /api/admin/research/upload`
- Accept PDF, images (PNG/JPG/TIFF), DOC/DOCX
- Store in Supabase Storage bucket `research-documents`
- Create `research_documents` record
- Return document ID

### Step 2.2 — Text extraction service
`lib/research/textExtractor.ts`
- PDF text extraction (pdf-parse or similar library)
- OCR for scanned documents and images (Tesseract.js or Claude Vision API)
- Store extracted raw text in `research_documents.raw_text_extracted`

### Step 2.3 — Image/drawing analysis service
`lib/research/drawingAnalyzer.ts`
- Send plat images to Claude Vision API
- Extract: boundary lines, bearings, distances, monuments, labels, scale, north arrow
- Return structured JSON of drawing elements

### Step 2.4 — Document upload UI component
`app/admin/components/ResearchUploader.tsx`
- Drag-and-drop file upload zone
- File type validation and preview
- Upload progress indicator
- List of uploaded documents with status (pending, processing, extracted, error)

---

## Phase 3: Property Search & Document Discovery

**Goal**: Let users search by property address to find related public records and documents.

### Step 3.1 — Property search API endpoint
`POST /api/admin/research/search`
- Accept property address or parcel ID
- Query county appraisal district APIs (where available)
- Search public deed records databases
- Return list of potentially related documents/links with descriptions

### Step 3.2 — County data integration service
`lib/research/countySearch.ts`
- Integration with Texas county appraisal districts (start with Bell County)
- CAD (Central Appraisal District) property lookup
- County clerk deed record search
- Return standardized results regardless of county source

### Step 3.3 — Search results UI
`app/admin/components/PropertySearch.tsx`
- Address/parcel input field
- Results list with checkboxes for selection
- "Add to project" button to pull selected documents into the project
- Preview capability for found documents

---

## Phase 4: AI Analysis Engine

**Goal**: AI reads all documents and extracts structured, actionable surveying data.

### Step 4.1 — Analysis orchestrator
`lib/research/analysisEngine.ts`
- Coordinates the full analysis pipeline
- Sends documents to Claude API with surveying-domain system prompt
- Extracts all data types: legal descriptions, metes & bounds, bearings, distances, monuments, owners, dates, recording info, easements, setbacks, areas, call sequences
- Stores results as `extracted_data_points`

### Step 4.2 — Surveying-domain AI prompts
`lib/research/prompts.ts`
- System prompt with deep surveying knowledge (Texas property law, metes & bounds, bearing notation, monument types, deed terminology)
- Extraction prompt templates for different document types (deed, plat, field notes, title commitment)
- Comparison prompt for cross-referencing multiple documents
- Discrepancy detection prompt

### Step 4.3 — Analysis API endpoint
`POST /api/admin/research/analyze`
- Accept project_id and analysis template/filters
- Trigger full analysis pipeline
- Return job ID for polling (analysis may take 30-120 seconds)

`GET /api/admin/research/analyze/status?jobId=xxx`
- Poll for analysis completion
- Return progress percentage and current step

### Step 4.4 — Analysis filter/template selection UI
`app/admin/components/AnalysisConfig.tsx`
- Template dropdown (saved presets)
- Checkbox groups organized by category:
  - **Property Info**: legal description, owner history, recording info, parcel ID
  - **Boundary Data**: bearings, distances, curves, call sequence, closure
  - **Monuments**: found, called for, type, condition
  - **Encumbrances**: easements, setbacks, restrictions, liens
  - **Area**: acreage, lot dimensions, block info
  - **Improvements**: structures, fences, utilities
  - **Plat Info**: subdivision name, lot/block, filing info
- "Save as template" button
- "Select All" / "Deselect All" toggle

---

## Phase 5: Results Display & Discrepancy Management

**Goal**: Display extracted data in a clear, organized format with source attribution and discrepancy flagging.

### Step 5.1 — Results display page
`app/admin/research/[projectId]/results/page.tsx`
- Organized sections matching the filter categories
- Each data point shows:
  - The extracted value (formatted for the data type)
  - Info button (i) that expands to show exact source text, document name, page/location
  - Confidence indicator (high/medium/low)
  - Verification checkbox (user confirms accuracy)

### Step 5.2 — Discrepancy panel
`app/admin/components/DiscrepancyPanel.tsx`
- List of all flagged issues, sorted by severity
- Each discrepancy shows:
  - Severity badge (color-coded): info (gray), low (blue), medium (yellow), high (orange), critical (red)
  - Type label: "Unclear" / "Uncertain" / "Discrepancy" / "Contradiction" / "Error"
  - Likely cause: "Clerical Error" / "Drawing Error" / "Surveying Error" / etc.
  - The conflicting data points side by side
  - Source references for each conflicting value
  - AI explanation of the issue
- Resolution controls:
  - "Accept Value A" / "Accept Value B" buttons
  - "Override with custom value" input
  - "Accept as-is" (acknowledge but don't change)
  - "Add note" for explanation
  - Resolution status indicator

### Step 5.3 — Source attribution component
`app/admin/components/SourceInfo.tsx`
- Popover/modal that shows:
  - Document name and type
  - Page number / location within document
  - Exact quoted text from the source
  - Thumbnail of the relevant document area (for images/plats)
  - Link to view full document

### Step 5.4 — Discrepancy detection service
`lib/research/discrepancyDetector.ts`
- Compare extracted data points across documents
- Check bearing/distance closure (mathematical verification)
- Cross-reference legal descriptions with plat calls
- Compare areas (deed area vs. computed area from calls)
- Flag bearing notation inconsistencies (e.g., N45°30'E vs. N45°30'W)
- Detect monument conflicts
- Classify severity and likely cause using AI + rules

---

## Phase 6: Drawing Renderer Engine

**Goal**: Render a property plat/drawing from the extracted and verified data.

### Step 6.1 — Geometry computation engine
`lib/research/geometry.ts`
- Convert bearing/distance calls to coordinate pairs
- Handle curves (arc, radius, chord, delta angle)
- Calculate closure error and area
- Support Texas coordinate systems (State Plane, UTM)
- Rotation and translation for best-fit display

### Step 6.2 — SVG drawing renderer
`lib/research/drawingRenderer.ts`
- Generate SVG from computed geometry
- Render elements:
  - **Lines**: property boundaries, easement lines, setback lines (various styles: solid, dashed, dotted, dash-dot)
  - **Text**: bearings, distances, labels, owner names, lot/block numbers, areas
  - **Symbols**: monuments (iron rod, iron pipe, concrete, stone, PK nail, cap, etc.), north arrow, scale bar
  - **Patterns**: hatching for easements, shading for buildings
  - **Colors**: configurable per element type
  - **Line weights**: configurable per element type
- Auto-layout text to avoid overlaps
- Scale calculation and display

### Step 6.3 — Canvas-based interactive drawing editor
`app/admin/components/DrawingCanvas.tsx`
- Render the SVG drawing on an HTML Canvas (or use a library like Fabric.js or Konva.js)
- Pan and zoom controls
- Click-to-select elements
- Edit mode:
  - Drag to reposition labels/text
  - Modify bearing/distance values (recalculates geometry)
  - Add/remove elements
  - Change colors, line styles, text formatting
- Measurement tool (click two points to get distance/bearing)
- Layer toggling (boundaries, easements, text, monuments, etc.)

### Step 6.4 — Drawing settings panel
`app/admin/components/DrawingSettings.tsx`
- Line styles per element type (color, weight, dash pattern)
- Text formatting (font, size, color, rotation behavior)
- Symbol selection (monument types, sizes)
- Scale and paper size
- Title block configuration
- Legend toggle
- Template save/load

### Step 6.5 — Drawing export
- Export as SVG (vector, scalable)
- Export as PNG (raster, configurable DPI: 150, 300, 600)
- Export as PDF (with title block and legend)
- Future: DXF export for CAD software compatibility

---

## Phase 7: Drawing Comparison & Confidence Scoring

**Goal**: AI compares the rendered drawing against source documents and provides a confidence score.

### Step 7.1 — Comparison engine
`lib/research/comparisonEngine.ts`
- Compare rendered geometry against extracted plat data
- Verify all deed calls are represented
- Check closure error is within acceptable tolerance
- Compare rendered area vs. deed area vs. plat area
- Overlay comparison with source plat images (if available)

### Step 7.2 — Confidence scoring algorithm
`lib/research/confidenceScorer.ts`
- Weighted scoring:
  - Closure error (high weight)
  - All calls matched (high weight)
  - Area agreement (medium weight)
  - Monument consistency (medium weight)
  - Number of unresolved discrepancies (high weight)
  - Source document quality/count (low weight)
- Output: overall percentage + breakdown by category

### Step 7.3 — Comparison results UI
`app/admin/research/[projectId]/drawing/page.tsx`
- Confidence score display (prominent percentage with color: green > 90%, yellow 70-90%, red < 70%)
- Breakdown chart (radar or bar chart using Recharts)
- Persisting issues list
- Side-by-side comparison view (rendered vs. source plat)
- "Improve" suggestions from AI

---

## Phase 8: Project Workflow UI (Main Research Page)

**Goal**: Build the main page that ties the entire workflow together.

### Step 8.1 — Research project list page
`app/admin/research/page.tsx`
- List of all research projects
- Create new project button
- Filter by status, date, property
- Quick stats (total projects, in progress, completed)

### Step 8.2 — Research project detail page (workflow hub)
`app/admin/research/[projectId]/page.tsx`
- Step-by-step workflow indicator showing current stage:
  1. **Upload & Search** — Upload files and/or search for property records
  2. **Configure** — Select analysis template or set filters
  3. **Analyze** — AI processes all documents (progress bar)
  4. **Review** — View extracted data, resolve discrepancies
  5. **Draw** — Render and edit the property drawing
  6. **Verify** — Review confidence score and final comparison
  7. **Export** — Download final drawing and report
- Each step links to its respective page/panel
- Project metadata sidebar (property address, dates, document count)

### Step 8.3 — Sidebar integration
Add "Research" link to `AdminSidebar.tsx` under the appropriate section.

---

## Phase 9: API Routes

**Goal**: Create all REST API endpoints for the feature.

### Step 9.1 — Project CRUD
- `GET /api/admin/research/projects` — List projects
- `POST /api/admin/research/projects` — Create project
- `GET /api/admin/research/projects/[id]` — Get project detail
- `PUT /api/admin/research/projects/[id]` — Update project
- `DELETE /api/admin/research/projects/[id]` — Delete project

### Step 9.2 — Document management
- `POST /api/admin/research/upload` — Upload document
- `GET /api/admin/research/documents?projectId=xxx` — List documents
- `DELETE /api/admin/research/documents/[id]` — Remove document

### Step 9.3 — Analysis
- `POST /api/admin/research/analyze` — Start analysis
- `GET /api/admin/research/analyze/status` — Poll status
- `GET /api/admin/research/data-points?projectId=xxx` — Get extracted data
- `PUT /api/admin/research/data-points/[id]` — Update/verify data point

### Step 9.4 — Discrepancies
- `GET /api/admin/research/discrepancies?projectId=xxx` — List discrepancies
- `PUT /api/admin/research/discrepancies/[id]/resolve` — Resolve discrepancy

### Step 9.5 — Drawing
- `POST /api/admin/research/drawing/render` — Generate drawing
- `GET /api/admin/research/drawing/[id]` — Get drawing data
- `PUT /api/admin/research/drawing/[id]` — Update drawing (edits)
- `POST /api/admin/research/drawing/[id]/export` — Export drawing (SVG/PNG/PDF)

### Step 9.6 — Templates
- CRUD for analysis_templates
- CRUD for drawing_templates

### Step 9.7 — Search
- `POST /api/admin/research/search` — Property search
- `POST /api/admin/research/search/import` — Import selected search results

### Step 9.8 — Comparison
- `POST /api/admin/research/compare` — Run AI comparison
- `GET /api/admin/research/confidence?projectId=xxx` — Get confidence score

---

## Phase 10: New Dependencies

### Step 10.1 — Install required packages
```
npm install pdf-parse           # PDF text extraction
npm install fabric              # Canvas drawing (Fabric.js)
npm install sharp               # Image processing for exports
npm install @anthropic-ai/sdk   # Already installed — Claude AI
npm install uuid                # UUID generation (may already be available)
```

Optional/future:
```
npm install tesseract.js        # Client-side OCR (if needed beyond Claude Vision)
npm install jspdf               # PDF export generation
npm install dxf-writer          # DXF export for CAD compatibility
```

---

## Phase 11: Standalone / White-Label Preparation

**Goal**: Architect for future extraction into a standalone product.

### Step 11.1 — Module boundary
- Keep all research/analysis code under `lib/research/` and `app/admin/research/`
- Use dependency injection for AI provider (swap Claude for other providers)
- Abstract Supabase calls behind a repository layer in `lib/research/repositories/`
- Configuration-driven feature flags (which capabilities are enabled)

### Step 11.2 — White-label considerations
- All research UI components accept theme props
- No hardcoded STARR branding in research feature components
- Configurable terminology (e.g., "project" vs. "job" vs. "case")
- Export API could be consumed by external desktop apps (Electron, Tauri)

---

## Implementation Order (Recommended)

| Priority | Phase | Description | Estimated Complexity |
|----------|-------|-------------|---------------------|
| 1 | Phase 1 | Database schema | Low |
| 2 | Phase 2 | File upload & text extraction | Medium |
| 3 | Phase 4 | AI analysis engine (core value) | High |
| 4 | Phase 5 | Results display & discrepancies | Medium |
| 5 | Phase 6 | Drawing renderer | High |
| 6 | Phase 8 | Workflow UI (ties it together) | Medium |
| 7 | Phase 9 | API routes | Medium |
| 8 | Phase 3 | Property search (enhancement) | Medium |
| 9 | Phase 7 | Comparison & confidence | Medium |
| 10 | Phase 10 | Dependencies | Low |
| 11 | Phase 11 | Standalone prep | Low |

---

## File Structure (New Files)

```
lib/research/
├── analysisEngine.ts          # AI analysis orchestrator
├── comparisonEngine.ts        # Drawing vs. source comparison
├── confidenceScorer.ts        # Confidence percentage calculator
├── countySearch.ts            # County records API integration
├── discrepancyDetector.ts     # Cross-document conflict detection
├── drawingAnalyzer.ts         # Plat/drawing image analysis via AI
├── drawingRenderer.ts         # SVG generation from geometry
├── geometry.ts                # Bearing/distance → coordinates math
├── prompts.ts                 # AI system & extraction prompts
├── textExtractor.ts           # PDF/OCR text extraction
├── types.ts                   # TypeScript interfaces for all data
└── repositories/
    ├── projectRepo.ts         # DB operations for projects
    ├── documentRepo.ts        # DB operations for documents
    ├── dataPointRepo.ts       # DB operations for extracted data
    ├── discrepancyRepo.ts     # DB operations for discrepancies
    └── drawingRepo.ts         # DB operations for drawings

app/admin/research/
├── page.tsx                   # Project list
└── [projectId]/
    ├── page.tsx               # Project workflow hub
    ├── results/
    │   └── page.tsx           # Analysis results & discrepancy review
    └── drawing/
        └── page.tsx           # Drawing render, edit, compare, export

app/admin/components/
├── AnalysisConfig.tsx         # Filter checkboxes & template picker
├── DiscrepancyPanel.tsx       # Discrepancy list & resolution
├── DrawingCanvas.tsx          # Interactive drawing editor
├── DrawingSettings.tsx        # Drawing style configuration
├── PropertySearch.tsx         # Address search & document discovery
├── ResearchUploader.tsx       # File upload component
└── SourceInfo.tsx             # Source attribution popover

app/api/admin/research/
├── projects/
│   ├── route.ts               # GET (list), POST (create)
│   └── [id]/
│       └── route.ts           # GET, PUT, DELETE
├── upload/
│   └── route.ts               # POST (upload document)
├── documents/
│   ├── route.ts               # GET (list)
│   └── [id]/
│       └── route.ts           # DELETE
├── analyze/
│   ├── route.ts               # POST (start analysis)
│   └── status/
│       └── route.ts           # GET (poll status)
├── data-points/
│   ├── route.ts               # GET (list)
│   └── [id]/
│       └── route.ts           # PUT (verify/update)
├── discrepancies/
│   ├── route.ts               # GET (list)
│   └── [id]/
│       └── resolve/
│           └── route.ts       # PUT (resolve)
├── drawing/
│   ├── render/
│   │   └── route.ts           # POST (generate)
│   ├── [id]/
│   │   ├── route.ts           # GET, PUT
│   │   └── export/
│   │       └── route.ts       # POST (export)
├── search/
│   ├── route.ts               # POST (search)
│   └── import/
│       └── route.ts           # POST (import results)
├── compare/
│   └── route.ts               # POST (run comparison)
├── confidence/
│   └── route.ts               # GET (score)
├── templates/
│   ├── analysis/
│   │   └── route.ts           # CRUD analysis templates
│   └── drawing/
│       └── route.ts           # CRUD drawing templates

seeds/
└── 090_research_analysis.sql  # Schema migration
```
