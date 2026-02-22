# Property Research & Analysis + Plat Drawing Renderer — Implementation Plan

## Feature Overview

An AI-powered property research and analysis system that lets users upload deeds, records, and plat drawings (or search by address), extracts structured data via AI, flags discrepancies, and renders a new interactive drawing from the vetted information. Every element in the rendered drawing carries its own attributes, confidence score, source hyperlinks, and AI-written report — viewable through multiple filtered visualization modes.

---

## Phase 1: Database Schema & Core Data Models

**Goal**: Create all tables needed to store research projects, uploaded documents, extracted data, drawing elements, discrepancies, and templates.

### Step 1.1 — `research_projects` table
Stores top-level metadata for each research session (project name, property address, status, created_by, etc.).

### Step 1.2 — `research_documents` table
Stores uploaded files and links:
- `file_name`, `file_url`, `file_type`, `mime_type`
- `source_type` (enum: upload, link, search)
- `page_count`, `raw_text_extracted`
- `project_id` FK
- `processing_status` (enum: pending, processing, extracted, error)

### Step 1.3 — `extracted_data_points` table
Stores every piece of information AI pulls from documents:
- `document_id` FK, `project_id` FK
- `data_type` (bearing, distance, monument, owner, legal_description, area, easement, setback, boundary_call, curve_data, road, fence, building, utility, etc.)
- `value` (jsonb — flexible schema per data_type)
- `raw_text` (exact text from document it was pulled from)
- `source_location` (jsonb — page number, paragraph, line, bounding box for images)
- `confidence` (decimal 0-1 — AI confidence)
- `is_verified` (boolean — user has reviewed)

### Step 1.4 — `drawing_elements` table
Stores every individual element in a rendered drawing with its own identity:
- `id` uuid PK
- `drawing_id` FK → `rendered_drawings`
- `project_id` FK
- `element_type` (enum: boundary_line, easement_line, setback_line, road_line, fence_line, building_outline, utility_line, curve, monument_symbol, text_label, bearing_label, distance_label, area_label, north_arrow, scale_bar, title_block, legend_item, hatch_pattern, dimension_line)
- `feature_class` (enum: property_boundary, road, concrete, building, fence, easement, setback, utility, water, vegetation, monument, annotation — used for filtered views)
- `geometry` (jsonb — coordinates, control points, radii, etc.)
- `attributes` (jsonb — all domain-specific attributes for this element):
  ```jsonb
  {
    "bearing": "N 45°30'15\" E",
    "distance": 150.25,
    "distance_unit": "feet",
    "curve_radius": null,
    "monument_type": "iron_rod",
    "monument_condition": "found",
    "label_text": "N 45°30'15\" E  150.25'",
    "owner": "Smith",
    "recording_ref": "Vol. 123, Pg. 456",
    "called_for_by": ["deed", "plat"],
    ...
  }
  ```
- `style` (jsonb — rendering style for this specific element):
  ```jsonb
  {
    "stroke_color": "#000000",
    "stroke_width": 2,
    "stroke_dash": "solid",
    "fill_color": null,
    "fill_pattern": null,
    "font_size": 10,
    "font_family": "Arial",
    "text_color": "#000000",
    "text_rotation": 0,
    "symbol_size": 8,
    "opacity": 1.0
  }
  ```
- `confidence` (decimal 0-1 — AI confidence for this specific element)
- `ai_report` (text — AI-written explanation of where this element's data comes from, why the confidence score is what it is, and any concerns)
- `source_data_point_ids` (uuid[] — links back to `extracted_data_points` that produced this element)
- `source_references` (jsonb[] — direct hyperlink-style references to source documents):
  ```jsonb
  [
    {
      "document_id": "uuid",
      "document_name": "Deed Vol 123 Pg 456.pdf",
      "page": 2,
      "line": "14-16",
      "excerpt": "thence N 45°30'15\" E, a distance of 150.25 feet to an iron rod found...",
      "bounding_box": { "x": 120, "y": 340, "w": 400, "h": 60 }
    }
  ]
  ```
- `discrepancy_ids` (uuid[] — links to related discrepancies)
- `is_user_modified` (boolean — user manually edited this element)
- `user_notes` (text — optional user annotation)
- `layer` (text — which drawing layer this belongs to)
- `z_index` (integer — stacking order)
- `is_visible` (boolean — can be toggled off)
- `created_at`, `updated_at`

### Step 1.5 — `discrepancies` table
Stores flagged issues:
- `project_id` FK
- `data_point_ids` (uuid[] — the conflicting data points)
- `drawing_element_ids` (uuid[] — affected drawing elements)
- `type` (enum: unclear, uncertain, discrepancy, contradiction, error)
- `likely_cause` (enum: clerical_error, drawing_error, surveying_error, transcription_error, ambiguous_language, unknown)
- `severity` (enum: info, low, medium, high, critical)
- `description`, `ai_explanation`
- `resolution_status` (enum: unresolved, user_resolved, accepted_as_is, overridden)
- `resolution_notes`, `resolved_by`, `resolved_at`

### Step 1.6 — `analysis_templates` table
Stores user-defined filter/display presets:
- `name`, `description`, `created_by`
- `filters` (jsonb — which data types to extract/display, checkboxes state)
- `is_default` (boolean)

### Step 1.7 — `rendered_drawings` table
Stores generated drawings:
- `project_id` FK
- `drawing_settings` (jsonb — global drawing config: scale, paper size, title block, legend)
- `view_configs` (jsonb — saved view mode configurations, see Phase 6A)
- `confidence_score` (decimal — overall accuracy %)
- `confidence_breakdown` (jsonb — per-category breakdown)
- `comparison_notes` (jsonb — AI comparison results)
- `version` (integer — track revisions)
- `svg_output` (text — current rendered SVG)
- `created_at`, `updated_at`

### Step 1.8 — `drawing_templates` table
Stores reusable drawing specification presets:
- `name`, `description`, `created_by`
- `settings` (jsonb — line styles, colors, text formatting, symbology, layout)
- `view_presets` (jsonb — which view modes and their configurations)
- `is_default` (boolean)

### Step 1.9 — `drawing_view_presets` table
Stores named view mode configurations that users can save and reuse:
- `id` uuid PK
- `template_id` FK → `drawing_templates` (nullable — can be standalone)
- `name` (text — e.g., "Feature Classification", "Confidence Heat Map", "Standard B&W")
- `view_type` (enum: standard, feature_class, confidence, custom)
- `style_rules` (jsonb — the color/pattern mapping rules for this view)
- `legend_config` (jsonb — what shows in the legend for this view)
- `created_by`, `is_builtin`

### Step 1.10 — Migration SQL file
Single migration file: `seeds/090_research_analysis.sql` with all CREATE TABLE IF NOT EXISTS statements, indexes (on project_id, drawing_id, element_type, feature_class, confidence), and RLS policies.

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
- Preserve page/line/paragraph location metadata for source linking

### Step 2.3 — Image/drawing analysis service
`lib/research/drawingAnalyzer.ts`
- Send plat images to Claude Vision API
- Extract: boundary lines, bearings, distances, monuments, labels, scale, north arrow, roads, buildings, fences, easements, utilities
- For each extracted element, record bounding box coordinates on the source image
- Return structured JSON of drawing elements with source locations

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
- Extracts all data types: legal descriptions, metes & bounds, bearings, distances, monuments, owners, dates, recording info, easements, setbacks, areas, call sequences, roads, fences, buildings, utilities, curves
- For every extracted piece of data, AI must also output:
  - Exact source text (verbatim quote)
  - Document name and page/line/paragraph location
  - Confidence score (0-1) with reasoning
  - Feature classification (boundary, road, fence, building, etc.)
- Stores results as `extracted_data_points`

### Step 4.2 — Surveying-domain AI prompts
`lib/research/prompts.ts`
- System prompt with deep surveying knowledge (Texas property law, metes & bounds, bearing notation, monument types, deed terminology)
- Extraction prompt templates for different document types (deed, plat, field notes, title commitment)
- Comparison prompt for cross-referencing multiple documents
- Discrepancy detection prompt
- **Element report prompt**: For each drawing element, generate a brief report explaining where the data came from, cross-references found, and confidence justification

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
  - **Improvements**: structures, fences, utilities, roads
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
  - Confidence indicator (high/medium/low with numeric %)
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
  - Link to view full document at the exact page/location (scrolls to or highlights the relevant section)

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

## Phase 6: Drawing Element Model & Renderer Engine

**Goal**: Render a property plat/drawing where every single element is its own entity with full attributes, confidence, source links, and AI report.

### Step 6.1 — Drawing element builder
`lib/research/elementBuilder.ts`
- Converts `extracted_data_points` into `drawing_elements`
- For each data point that represents something drawable:
  - Create a `drawing_element` record
  - Assign `element_type` and `feature_class`
  - Compute geometry (coordinates from bearing/distance/curve data)
  - Copy `confidence` from source data point(s)
  - If element derives from multiple data points, compute weighted confidence
  - Link `source_data_point_ids` and build `source_references` array
  - Generate `ai_report` via Claude:
    - Where the information came from (document names, pages, exact text)
    - Whether multiple sources agree or conflict
    - Why the confidence score is what it is
    - Any caveats or concerns
  - Assign default `style` based on `feature_class` and the active drawing template

### Step 6.2 — Geometry computation engine
`lib/research/geometry.ts`
- Convert bearing/distance calls to coordinate pairs
- Handle curves (arc, radius, chord, delta angle, tangent length)
- Calculate closure error and area
- Support Texas coordinate systems (State Plane, UTM)
- Rotation and translation for best-fit display
- All computations produce per-segment confidence based on input data quality

### Step 6.3 — SVG drawing renderer
`lib/research/drawingRenderer.ts`
- Generate SVG from `drawing_elements` array
- Every SVG element gets a `data-element-id` attribute for click targeting
- Render elements by type:
  - **Lines**: property boundaries, easement lines, setback lines, road edges, fence lines, utility lines (various styles: solid, dashed, dotted, dash-dot, double-line for roads)
  - **Curves**: arcs with radius, delta, chord annotations
  - **Text**: bearings, distances, labels, owner names, lot/block numbers, areas, road names
  - **Symbols**: monuments (iron rod, iron pipe, concrete, stone, PK nail, cap, mag nail, RR spike, etc.), north arrow, scale bar, utility symbols
  - **Patterns**: hatching for easements, cross-hatch for buildings, stipple for concrete, tree symbols for vegetation
  - **Colors**: configurable per element type and per feature class
  - **Line weights**: configurable per element type
- Auto-layout text to avoid overlaps
- Scale calculation and display
- Legend generation based on active view mode
- Every element is rendered as an interactive SVG group (`<g>`) for click handling

### Step 6.4 — Drawing view modes system
`lib/research/viewModes.ts`

Four built-in view modes, plus custom:

#### View Mode 1: Standard (Black & White)
- Classic survey plat appearance
- All lines black, white background
- Standard line weight hierarchy (boundary > easement > setback > other)
- No fill colors
- Traditional monument symbols

#### View Mode 2: Feature Classification
- Color-codes elements by `feature_class`:

  | Feature Class | Color | Line Pattern | Fill |
  |--------------|-------|-------------|------|
  | property_boundary | Black (#000) | Solid, heavy | — |
  | road | Brown (#8B4513) | Double-line | Light tan fill |
  | concrete | Gray (#808080) | Solid | Light gray fill |
  | building | Dark Blue (#1a237e) | Solid | Blue hatch |
  | fence | Dark Green (#2e7d32) | Dash-dot-dot | — |
  | easement | Red (#c62828) | Dashed | Red diagonal hatch |
  | setback | Orange (#e65100) | Dotted | — |
  | utility | Purple (#6a1b9a) | Dashed, thin | — |
  | water | Blue (#1565c0) | Wavy | Light blue fill |
  | vegetation | Green (#388e3c) | — | Tree symbols |
  | monument | Red (#d32f2f) | — | Symbol only |
  | annotation | Dark Gray (#424242) | — | Text only |

- Legend panel on the side showing color/pattern key
- Feature class toggles (show/hide individual classes)

#### View Mode 3: Confidence Heat Map
- Color-codes every element by its `confidence` score:

  | Confidence Range | Color | Meaning |
  |-----------------|-------|---------|
  | 95-100% | Dark Green (#1b5e20) | Very high confidence |
  | 85-94% | Green (#4caf50) | High confidence |
  | 70-84% | Yellow-Green (#cddc39) | Moderate-high confidence |
  | 50-69% | Yellow (#ffeb3b) | Moderate confidence |
  | 30-49% | Orange (#ff9800) | Low confidence |
  | 10-29% | Red-Orange (#ff5722) | Very low confidence |
  | 0-9% | Red (#d32f2f) | Extremely low / likely error |

- Elements with unresolved discrepancies get a pulsing red outline
- Legend on the side showing the confidence color scale
- Hovering shows the exact confidence % tooltip
- Clicking an element in this view immediately opens the AI report + discrepancy panel for that element

#### View Mode 4: Discrepancy View
- All elements default to light gray
- Elements with discrepancies are highlighted by severity:
  - Critical: solid red fill with red outline
  - High: orange outline, orange fill
  - Medium: yellow outline
  - Low: blue dotted outline
  - Info: small gray info icon
- Discrepancy count badge on each affected element
- Click to open resolution workflow

#### View Mode 5: Custom
- User defines their own color/pattern rules
- Can map any attribute to any visual property
- Save as reusable `drawing_view_preset`

### Step 6.5 — Interactive drawing canvas
`app/admin/components/DrawingCanvas.tsx`
- Render the SVG drawing on an interactive canvas (Fabric.js or Konva.js, or direct SVG with D3.js for interactions)
- **Pan and zoom** controls (scroll wheel, pinch, buttons)
- **View mode switcher** toolbar (tabs or dropdown for Standard / Feature Class / Confidence / Discrepancy / Custom)
- **Legend panel** (collapsible sidebar showing the active view's color/pattern key with toggles)
- **Click-to-inspect any element**:
  - Click any line, symbol, label, or shape
  - Opens an **Element Detail Panel** (slide-in from right) showing:
    - Element type and feature class
    - All attributes (bearing, distance, monument type, etc.)
    - **Confidence score** (large, color-coded percentage)
    - **AI Report** (2-5 sentence explanation):
      - Where the data came from
      - Which documents/pages support it
      - Whether multiple sources agree
      - Why the confidence is what it is
      - Any concerns or caveats
    - **Source References** (clickable hyperlinks):
      - Each reference shows: document name, page, and excerpt
      - Clicking opens the source document viewer scrolled to the exact location
      - For plat images, clicking highlights the bounding box on the source image
    - **Discrepancies** (if any): list of related discrepancies with severity badges, with link to resolve
    - **User notes** field (editable)
    - **Verification** toggle (mark as user-verified)
- **Edit mode** (toggle):
  - Drag to reposition labels/text
  - Modify bearing/distance values (recalculates geometry, flags as user_modified)
  - Add/remove elements
  - Change individual element styles (override view mode)
- **Measurement tool** (click two points to get distance/bearing)
- **Layer toggles** (by feature class — show/hide boundaries, easements, roads, etc.)
- **Filter bar**: quick filter by confidence range (slider: "Show only elements below 80% confidence")

### Step 6.6 — Element detail panel component
`app/admin/components/ElementDetailPanel.tsx`
- Slide-in panel (right side) triggered by clicking any drawing element
- Sections:
  1. **Header**: element type icon + feature class badge + confidence % (color-coded)
  2. **Attributes table**: key-value list of all element attributes
  3. **AI Report**: expandable section with the AI-written narrative
  4. **Source References**: list of clickable document links
     - Each shows: document icon, name, "Page X, Lines Y-Z"
     - Click opens document viewer at that location
     - Excerpt shown inline with highlight
  5. **Discrepancies**: list of linked discrepancies (if any)
     - Severity badge, type, brief description
     - "Resolve" button opens discrepancy resolution flow
  6. **History**: if user modified this element, show original vs. current values
  7. **User Notes**: editable text area
  8. **Actions**: verify, edit, flag for review, delete

### Step 6.7 — Source document viewer
`app/admin/components/SourceDocumentViewer.tsx`
- Modal or split-view that opens a source document
- For PDFs: render the specific page with the relevant text highlighted
- For images/plats: display the image with a bounding box overlay highlighting the relevant area
- Navigation: prev/next page, zoom, scroll
- "Back to drawing" button returns to the canvas with the element selected

### Step 6.8 — Drawing settings panel
`app/admin/components/DrawingSettings.tsx`
- **Global settings**: scale, paper size, title block configuration, border style
- **Per-feature-class defaults**: default line style, color, weight, dash pattern for each feature class
- **Text formatting**: font family, sizes by element type, color, rotation behavior
- **Symbol library**: select monument symbol styles, sizes
- **View mode configuration**: customize the color mappings for Feature Class and Confidence views
- **Legend settings**: position, size, which items to include
- Template save/load (save current settings as a `drawing_template`)

### Step 6.9 — Drawing export
- Export as SVG (vector, scalable) — includes all view mode styling
- Export as PNG (raster, configurable DPI: 150, 300, 600)
- Export as PDF (with title block, legend, and optional AI report summary)
- Export element report as PDF/CSV (table of all elements with their attributes, confidence, and AI notes)
- Future: DXF export for CAD software compatibility

---

## Phase 7: Drawing Comparison & Confidence Scoring

**Goal**: AI compares the rendered drawing against source documents and provides per-element and overall confidence scores.

### Step 7.1 — Per-element confidence computation
`lib/research/confidenceScorer.ts`
- For each `drawing_element`, compute confidence based on:
  - Number of source documents that agree on this element's data
  - Quality/type of source (recorded deed > unrecorded plat > field notes > verbal)
  - Whether the data was OCR'd vs. direct text extraction
  - Whether there are any discrepancies involving this element
  - Mathematical verification (does the bearing/distance fit the closure?)
  - AI's own extraction confidence
- Weighted formula produces a 0-100% score per element
- Generate AI report text per element explaining the score

### Step 7.2 — Overall drawing confidence
- Aggregate per-element scores into an overall drawing confidence
- Weighted by element importance:
  - Boundary lines (high weight)
  - Monuments (high weight)
  - Easements (medium weight)
  - Closure error (high weight — mathematical)
  - Area agreement (medium weight)
  - Non-boundary features like fences, roads (low weight)
- Breakdown by category for radar/bar chart display

### Step 7.3 — Comparison engine
`lib/research/comparisonEngine.ts`
- Compare rendered geometry against extracted plat data
- Verify all deed calls are represented (flag missing calls)
- Check closure error is within acceptable tolerance
- Compare rendered area vs. deed area vs. plat area
- Overlay comparison with source plat images (if available)
- For each comparison check, produce a pass/fail/warn result with explanation

### Step 7.4 — Comparison results UI
`app/admin/research/[projectId]/drawing/page.tsx`
- **Overall confidence score**: prominent percentage with color (green > 90%, yellow 70-90%, red < 70%)
- **Breakdown chart**: radar or bar chart using Recharts showing confidence by category
- **Per-element confidence**: switch to Confidence view mode on the drawing to see heat map
- **Persisting issues list**: unresolved discrepancies, missing calls, closure errors
- **Side-by-side comparison**: rendered drawing vs. source plat image
- **AI improvement suggestions**: specific recommendations to improve confidence
- **Element report export**: downloadable PDF/CSV of all elements with confidence scores and AI notes

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
  5. **Draw** — Render and interact with the drawing (view modes, inspect elements)
  6. **Verify** — Review confidence scores and final comparison
  7. **Export** — Download final drawing, reports, and element data
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

### Step 9.5 — Drawing & Elements
- `POST /api/admin/research/drawing/render` — Generate drawing (creates drawing + all elements)
- `GET /api/admin/research/drawing/[id]` — Get drawing with all elements
- `PUT /api/admin/research/drawing/[id]` — Update drawing settings
- `GET /api/admin/research/drawing/[id]/elements` — Get all elements for a drawing
- `GET /api/admin/research/drawing/[id]/elements/[elementId]` — Get single element detail (attributes, confidence, AI report, sources)
- `PUT /api/admin/research/drawing/[id]/elements/[elementId]` — Update element (user edits)
- `POST /api/admin/research/drawing/[id]/export` — Export drawing (SVG/PNG/PDF)
- `POST /api/admin/research/drawing/[id]/export-report` — Export element report (PDF/CSV)

### Step 9.6 — View Modes
- `GET /api/admin/research/drawing/[id]/view-config` — Get view mode configurations
- `PUT /api/admin/research/drawing/[id]/view-config` — Update view mode settings
- `POST /api/admin/research/view-presets` — Save a custom view preset
- `GET /api/admin/research/view-presets` — List saved view presets

### Step 9.7 — Templates
- CRUD for analysis_templates
- CRUD for drawing_templates (includes view mode presets)

### Step 9.8 — Search
- `POST /api/admin/research/search` — Property search
- `POST /api/admin/research/search/import` — Import selected search results

### Step 9.9 — Comparison & Confidence
- `POST /api/admin/research/compare` — Run AI comparison
- `GET /api/admin/research/confidence?projectId=xxx` — Get overall + per-element confidence
- `GET /api/admin/research/confidence/elements?drawingId=xxx` — Get confidence breakdown by element

---

## Phase 10: New Dependencies

### Step 10.1 — Install required packages
```
npm install pdf-parse           # PDF text extraction
npm install fabric              # Canvas drawing (Fabric.js) — or konva/react-konva
npm install sharp               # Image processing for exports
npm install @anthropic-ai/sdk   # Already installed — Claude AI
npm install d3                  # SVG manipulation and interaction (optional, for direct SVG approach)
npm install uuid                # UUID generation (may already be available)
```

Optional/future:
```
npm install tesseract.js        # Client-side OCR (if needed beyond Claude Vision)
npm install jspdf               # PDF export generation
npm install dxf-writer          # DXF export for CAD compatibility
npm install pdfjs-dist          # In-browser PDF rendering for source document viewer
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
- View mode color schemes configurable per tenant
- Export API could be consumed by external desktop apps (Electron, Tauri)

---

## Implementation Order (Recommended)

| Priority | Phase | Description | Complexity |
|----------|-------|-------------|-----------|
| 1 | Phase 1 | Database schema (including `drawing_elements` and `drawing_view_presets`) | Medium |
| 2 | Phase 2 | File upload & text extraction | Medium |
| 3 | Phase 4 | AI analysis engine (core value) | High |
| 4 | Phase 5 | Results display & discrepancy management | Medium |
| 5 | Phase 6 Steps 6.1-6.3 | Element builder + geometry + SVG renderer | High |
| 6 | Phase 6 Step 6.4 | View modes system (Standard, Feature Class, Confidence, Discrepancy) | High |
| 7 | Phase 6 Steps 6.5-6.6 | Interactive canvas + element detail panel | High |
| 8 | Phase 6 Step 6.7 | Source document viewer with hyperlinks | Medium |
| 9 | Phase 7 | Per-element confidence scoring + comparison + AI reports | High |
| 10 | Phase 6 Steps 6.8-6.9 | Drawing settings + export | Medium |
| 11 | Phase 8 | Workflow UI (ties it together) | Medium |
| 12 | Phase 9 | API routes | Medium |
| 13 | Phase 3 | Property search (enhancement) | Medium |
| 14 | Phase 10 | Dependencies | Low |
| 15 | Phase 11 | Standalone prep | Low |

---

## File Structure (New Files)

```
lib/research/
├── analysisEngine.ts          # AI analysis orchestrator
├── comparisonEngine.ts        # Drawing vs. source comparison
├── confidenceScorer.ts        # Per-element + overall confidence calculator
├── countySearch.ts            # County records API integration
├── discrepancyDetector.ts     # Cross-document conflict detection
├── drawingAnalyzer.ts         # Plat/drawing image analysis via AI
├── drawingRenderer.ts         # SVG generation from drawing_elements
├── elementBuilder.ts          # Converts data_points → drawing_elements with AI reports
├── geometry.ts                # Bearing/distance → coordinates math
├── prompts.ts                 # AI system, extraction, report, and comparison prompts
├── textExtractor.ts           # PDF/OCR text extraction
├── types.ts                   # TypeScript interfaces for all data models
├── viewModes.ts               # View mode definitions, style rule engine, legend builder
└── repositories/
    ├── projectRepo.ts         # DB operations for projects
    ├── documentRepo.ts        # DB operations for documents
    ├── dataPointRepo.ts       # DB operations for extracted data
    ├── discrepancyRepo.ts     # DB operations for discrepancies
    ├── drawingRepo.ts         # DB operations for drawings
    └── elementRepo.ts         # DB operations for drawing_elements

app/admin/research/
├── page.tsx                   # Project list
└── [projectId]/
    ├── page.tsx               # Project workflow hub
    ├── results/
    │   └── page.tsx           # Analysis results & discrepancy review
    └── drawing/
        └── page.tsx           # Drawing render, view modes, compare, export

app/admin/components/
├── AnalysisConfig.tsx         # Filter checkboxes & template picker
├── DiscrepancyPanel.tsx       # Discrepancy list & resolution controls
├── DrawingCanvas.tsx          # Interactive SVG/canvas with view mode switching
├── DrawingSettings.tsx        # Drawing style configuration & template save/load
├── DrawingViewToolbar.tsx     # View mode tabs + legend toggle + filter controls
├── ElementDetailPanel.tsx     # Slide-in panel: attributes, confidence, AI report, sources
├── PropertySearch.tsx         # Address search & document discovery
├── ResearchUploader.tsx       # File upload component
├── SourceDocumentViewer.tsx   # Modal viewer for source docs with highlight/scroll-to
└── SourceInfo.tsx             # Inline popover for quick source attribution

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
│   │   └── route.ts           # POST (generate drawing + elements)
│   ├── [id]/
│   │   ├── route.ts           # GET, PUT (drawing)
│   │   ├── elements/
│   │   │   ├── route.ts       # GET (all elements)
│   │   │   └── [elementId]/
│   │   │       └── route.ts   # GET, PUT (single element detail)
│   │   ├── view-config/
│   │   │   └── route.ts       # GET, PUT (view mode settings)
│   │   ├── export/
│   │   │   └── route.ts       # POST (SVG/PNG/PDF)
│   │   └── export-report/
│   │       └── route.ts       # POST (element report PDF/CSV)
├── search/
│   ├── route.ts               # POST (search)
│   └── import/
│       └── route.ts           # POST (import results)
├── compare/
│   └── route.ts               # POST (run comparison)
├── confidence/
│   ├── route.ts               # GET (overall score)
│   └── elements/
│       └── route.ts           # GET (per-element breakdown)
├── view-presets/
│   └── route.ts               # GET (list), POST (save)
├── templates/
│   ├── analysis/
│   │   └── route.ts           # CRUD analysis templates
│   └── drawing/
│       └── route.ts           # CRUD drawing templates (includes view presets)

seeds/
└── 090_research_analysis.sql  # Schema migration for all research tables
```
