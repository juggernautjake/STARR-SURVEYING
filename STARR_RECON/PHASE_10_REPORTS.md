# Phase 10: Production Reports, Exports & CLI Interface

## Overview

Phase 10 is the capstone delivery phase of the STARR RECON pipeline. It consumes all outputs from Phases 1–9 and generates professional deliverables: PDF reports, DXF CAD drawings, SVG/PNG boundary renderings, legal descriptions, and a unified CLI that orchestrates the full pipeline.

## Current State of the Codebase

**Phase Status: ✅ COMPLETE v1.2** _(as of March 2026)_

All Phase 10 modules have been implemented and hardened with v1.2 type-safety fixes.

### v1.2 Changes

- **Build fix** (`master-orchestrator.ts`): `data.confidence?.overallScore` → `data.confidence?.overallConfidence?.score`; `data.confidence?.overallGrade` → `data.confidence?.overallConfidence?.grade` — these properties do not exist on `ConfidenceReport`; the correct path is through the nested `overallConfidence: OverallConfidence` object
- **Build fix** (`master-orchestrator.ts`): `data.purchases?.billing?.totalSpent` → `data.purchases?.billing?.totalCharged` — `PurchaseBillingSummary` uses `totalCharged` not `totalSpent`
- **Build fix** (`master-orchestrator.ts`): Confidence fallback object now uses correct `ConfidenceReport` shape (`overallConfidence: { score, grade, label, summary }`) cast via `as ConfidenceReport`; also added `import type { ConfidenceReport }` 
- **Build fix** (`dxf-exporter.ts`): Same `overallScore`/`overallGrade` → `overallConfidence?.score`/`overallConfidence?.grade` fix
- **Build fix** (`legal-description-generator.ts`): Same `overallScore`/`overallGrade` fix
- **Build fix** (`pdf-generator.ts`): All `overallScore`/`overallGrade` fixed; `purchased` field → `purchases`; `vendor` → `source`; `totalSpent`/`budget`/`remainingBudget` → `totalCharged`/`taxOrFees`/`remainingBalance`; removed non-existent sub-score fields (`documentQuality`, `extractionConfidence`, `crossValidation`, `closureAnalysis`, `monumentEvidence`) — replaced with computed averages from actual `callConfidence[]`, `lotConfidence[]`, `boundaryConfidence[]` arrays; `conf.flags` → derived from `conf.discrepancies` (unresolved ones)
- **Refactor** (`pdf-generator.ts`): Extracted `avgScore()` helper method to replace 3× duplicated averaging logic; severity lookup tables replace nested ternary chains
- **Dependencies**: Added `pdfkit`, `@types/pdfkit`, `@resvg/resvg-js` to root `package.json` so Next.js type-checking can resolve these modules in the worker
- **Test fix** (`__tests__/recon/phase10-reports.test.ts`): Test 28 now uses `{ overallConfidence: { score: 85, grade: 'A', ... } }` shape instead of invalid `{ overallScore, overallGrade }`

### v1.1 Changes

- **Bug fix**: `SVGBoundaryRenderer` constructor now receives `config` parameter (was missing in `MasterOrchestrator.generateDeliverables()`)
- **Bug fix**: `svgRenderer.render()` now receives correct `{model, confidence, discovery, rowData, crossValidation}` shape (was incorrectly passed `ProjectData` + `ReportConfig` directly)
- **Bug fix**: `loadCheckpoint()` wraps `JSON.parse` in try/catch — corrupt checkpoint files now reset to fresh start instead of crashing the pipeline
- **Bug fix**: `loadProjectData.loadJson()` wraps `JSON.parse` in try/catch — corrupt phase output files return `null` instead of throwing
- **Bug fix**: `getStatus()` guards `fs.readdirSync` with try/catch for non-existent deliverable directories
- **Bug fix**: `listProjects()` guards each `fs.statSync` with try/catch for race conditions
- **PipelineLogger**: Replaces all bare `console.log/warn/error` calls in `master-orchestrator.ts` (consistent with Phases 6–9)
- **PipelineLogger**: Added to `report-routes.ts` for all route handlers
- **Rate limiting**: `routeRateLimit` added to all Phase 10 Express routes (POST: 5/min, GET: 60/min), implemented locally in `report-routes.ts` to avoid circular imports
- **JSON.parse safety**: GET routes in `report-routes.ts` now use `safeReadJson()` helper with try/catch — corrupt manifest files return 500 instead of crashing
- **Empty projectId guard**: Both POST routes validate `projectId.trim()` and return 400 if empty
- **`PNGRasterizer.extractWidth()`**: Changed from `private` to public for testability
- **`report-routes.ts` refactor**: Rate limiting is self-contained via local `routeRateLimit()` function

### Implemented Files

| File | Purpose | Status |
|------|---------|--------|
| `worker/src/reports/svg-renderer.ts` | Module 1: SVG boundary drawing with confidence colors, monuments, labels | ✅ Complete |
| `worker/src/reports/png-rasterizer.ts` | Module 2: SVG → high-resolution PNG (resvg-js, rsvg-convert, Inkscape, ImageMagick fallback chain) | ✅ Complete |
| `worker/src/reports/dxf-exporter.ts` | Module 3: DXF R2010 CAD export (13 layers, AutoCAD Civil 3D compatible) | ✅ Complete |
| `worker/src/reports/pdf-generator.ts` | Module 4: Multi-section PDF report via pdfkit | ✅ Complete |
| `worker/src/reports/legal-description-generator.ts` | Module 5: Texas-standard metes & bounds legal description generator | ✅ Complete |
| `worker/src/orchestrator/master-orchestrator.ts` | Module 6: Full 9-phase pipeline orchestrator with checkpoint/resume | ✅ Complete |
| `worker/src/cli/starr-research.ts` | Module 7: Commander.js CLI (run, report, status, list, clean) | ✅ Complete |
| `worker/src/routes/report-routes.ts` | Express API routes for report generation and deliverable access | ✅ Complete |
| `worker/src/types/reports.ts` | Phase 10 TypeScript types (`ProjectData`, `ReportManifest`, etc.) | ✅ Complete |
| `worker/report.sh` | Interactive CLI wrapper | ✅ Complete |
| `__tests__/recon/phase10-reports.test.ts` | Unit tests: 84 tests covering all pure-logic aspects | ✅ Complete |

### API Endpoints

All report routes are live via `createReportRoutes()` in `worker/src/index.ts`:
- `POST /research/run` — Start full pipeline (HTTP 202)
- `GET /research/run/:projectId` — Check pipeline status
- `POST /research/report` — Generate reports from existing data
- `GET /research/deliverables/:projectId` — List deliverables
- `GET /research/download/:projectId/:format` — Download specific deliverable

---

## Architecture

```
Phase 1-9 Outputs
       │
       ▼
┌──────────────────────────────────────────────────────────┐
│              Master Orchestrator (Module 6)               │
│   Checkpoint/Resume · Phase Sequencing · Error Tolerance  │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  ┌────────────┐  ┌────────────┐  ┌────────────────────┐ │
│  │ SVG Render │→ │ PNG Raster │  │  DXF CAD Export    │ │
│  │ (Module 1) │  │ (Module 2) │  │  (Module 3)        │ │
│  └────────────┘  └────────────┘  └────────────────────┘ │
│                                                          │
│  ┌────────────┐  ┌──────────────────────────────────────┐│
│  │ PDF Report │  │  Legal Description Generator         ││
│  │ (Module 4) │  │  (Module 5)                          ││
│  └────────────┘  └──────────────────────────────────────┘│
│                                                          │
├──────────────────────────────────────────────────────────┤
│  CLI (Module 7) · Express Routes · Deliverable Manifest  │
└──────────────────────────────────────────────────────────┘
```

## Modules

### Module 1: SVG Boundary Renderer (`worker/src/reports/svg-renderer.ts`)

Generates vector SVG boundary drawings with:
- Confidence color-coded boundary lines (green ≥80%, yellow ≥60%, orange ≥40%, red <40%)
- 8 monument symbol types (IRF, IRS, IPF, IPS, CONC, MAG, PKnail, UNKNOWN)
- Bearing and distance labels rotated to follow line direction
- Curve arcs with proper SVG arc path computation
- Lot labels with acreage at centroids
- North arrow, auto-scaled scale bar, and legend
- Confidence summary box with overall grade and closure ratio
- Adjacent property labels, ROW lines, and easement overlays
- Coordinate system: NAD83 TX Central Zone → local SVG with Y-axis flip

### Module 2: PNG Rasterizer (`worker/src/reports/png-rasterizer.ts`)

Converts SVG to high-resolution PNG with cascading fallback:
1. **resvg-js** (preferred) — pure Rust, no system dependencies
2. **rsvg-convert** (librsvg) — fast native renderer
3. **Inkscape CLI** — full SVG spec compliance
4. **ImageMagick convert** — last resort

Configurable DPI (default 300).

### Module 3: DXF Exporter (`worker/src/reports/dxf-exporter.ts`)

Generates DXF R2010 (AC1027) CAD files compatible with AutoCAD Civil 3D:

**13 Layers:**
| Layer | ACI Color | Line Type | Content |
|-------|-----------|-----------|---------|
| BOUNDARY | 7 (White) | CONTINUOUS | Subject property boundary |
| BOUNDARY-TEXT | 7 | CONTINUOUS | Bearing/distance labels |
| LOTS | 4 (Cyan) | CONTINUOUS | Subdivision lot lines |
| LOT-TEXT | 4 | CONTINUOUS | Lot/block labels |
| EASEMENTS | 5 (Blue) | DASHED | Easement lines |
| EASEMENT-TEXT | 5 | CONTINUOUS | Easement labels |
| ROW | 1 (Red) | DASHDOT | Right-of-way lines |
| ROW-TEXT | 1 | CONTINUOUS | ROW labels |
| ADJACENT | 8 (Gray) | CONTINUOUS | Adjacent boundaries |
| ADJACENT-TEXT | 8 | CONTINUOUS | Adjacent owner labels |
| MONUMENTS | 3 (Green) | CONTINUOUS | Survey monuments |
| CONFIDENCE | 2 (Yellow) | CONTINUOUS | Confidence annotations |
| TITLE | 7 (White) | CONTINUOUS | Title block |

**Monument Block Definitions:**
- IRF: Circle with cross
- IRS: Circle with X
- IPF/IPS: Double circle
- CONC: Square
- MAG: Triangle
- PKNAIL: Diamond

**Coordinate System:** NAD83 Texas Central Zone (EPSG:4203), US Survey Feet.

### Module 4: PDF Report Generator (`worker/src/reports/pdf-generator.ts`)

Multi-section professional report via pdfkit:

1. **Cover Page** — Company logo, property address, owner, acreage, confidence badge
2. **Executive Summary** — Key metrics table, document counts, purchase summary
3. **Boundary Call Table** — All reconciled calls with bearing, distance, confidence color
4. **Confidence Matrix** — Score breakdown with visual bars, flags and warnings
5. **Source Documents** — Catalog of all analyzed documents with metadata
6. **Drawing Page** — Embedded PNG boundary drawing
7. **Purchase Summary** — Document purchase results and billing (if Phase 9 ran)
8. **Appendix** — Technical details, coordinate system, disclaimer

### Module 5: Legal Description Generator (`worker/src/reports/legal-description-generator.ts`)

Generates Texas-standard metes & bounds legal descriptions:
- BEGINNING at point with monument description and coordinates
- THENCE calls with bearing, distance, monument at destination
- Curve calls with radius, central angle, arc length, chord bearing/distance
- Adjacent owner references and ROW line references
- CONTAINING acreage with closure ratio
- Standard disclaimer noting AI-assisted research

### Module 6: Master Orchestrator (`worker/src/orchestrator/master-orchestrator.ts`)

Full 9-phase pipeline orchestrator:
- **Checkpoint/Resume**: Saves progress after each phase, resumes from last completed
- **Phase Sequencing**: Proper dependency ordering (Phase 1 → 2 → 3 → etc.)
- **Error Tolerance**: Non-critical phases (4, 5, 6, 9) can fail without stopping pipeline
- **Async Polling**: Handles HTTP 202 responses with polling for completion
- **Deliverable Generation**: After pipeline completes, generates all requested formats
- **Manifest**: JSON manifest with all deliverable paths and metadata

**Critical vs Non-Critical Phases:**
| Phase | Name | Critical |
|-------|------|----------|
| 1 | Property Discovery | Yes |
| 2 | Document Harvesting | Yes |
| 3 | AI Extraction | Yes |
| 4 | Subdivision Analysis | No |
| 5 | Adjacent Properties | No |
| 6 | TxDOT ROW | No |
| 7 | Boundary Reconciliation | Yes |
| 8 | Confidence Scoring | Yes |
| 9 | Document Purchase | No |

### Module 7: CLI Interface (`worker/src/cli/starr-research.ts`)

Commander.js CLI with subcommands:

```bash
# Run full pipeline
starr-research run --address "123 Main St" --county "Bell" --budget 50

# Generate reports from existing data
starr-research report --project STARR-ABC12345

# Check status
starr-research status --project STARR-ABC12345

# List all projects
starr-research list

# Clean project data
starr-research clean --project STARR-ABC12345
```

**Options:**
- `-a, --address` — Property address (required for `run`)
- `-c, --county` — County name
- `-p, --project` — Project ID
- `-b, --budget` — Document purchase budget (default $50)
- `--auto-purchase` — Auto-approve purchases
- `-o, --output` — Output directory
- `-f, --formats` — Output formats (comma-separated)
- `--resume-from` — Resume from specific phase
- `--skip` — Skip specific phases
- `--page-size` — PDF page size (letter/tabloid)
- `--dpi` — PNG/DXF DPI

## Express API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/research/run` | Start full pipeline (returns 202) |
| GET | `/research/run/:projectId` | Check pipeline status |
| POST | `/research/report` | Generate reports from existing data |
| GET | `/research/deliverables/:projectId` | List deliverables |
| GET | `/research/download/:projectId/:format` | Download specific deliverable |

## File Structure

```
worker/
├── src/
│   ├── types/
│   │   └── reports.ts              ← TypeScript interfaces
│   ├── reports/
│   │   ├── svg-renderer.ts         ← Module 1: SVG boundary drawing
│   │   ├── png-rasterizer.ts       ← Module 2: SVG → PNG
│   │   ├── dxf-exporter.ts         ← Module 3: DXF CAD export
│   │   ├── pdf-generator.ts        ← Module 4: PDF report
│   │   └── legal-description-generator.ts ← Module 5: Legal description
│   ├── orchestrator/
│   │   └── master-orchestrator.ts   ← Module 6: Pipeline orchestrator
│   ├── cli/
│   │   └── starr-research.ts       ← Module 7: CLI interface
│   ├── routes/
│   │   └── report-routes.ts        ← Express API routes
│   └── index.ts                    ← Updated with report routes
├── report.sh                       ← Interactive CLI wrapper
```

## Output Structure

```
/tmp/deliverables/{projectId}/
├── {projectId}_report.pdf          ← Professional PDF report
├── {projectId}_boundary.dxf        ← AutoCAD-compatible DXF
├── {projectId}_boundary.svg        ← Vector boundary drawing
├── {projectId}_boundary.png        ← High-res raster (300 DPI)
├── {projectId}_legal_description.txt ← Texas-standard legal description
├── {projectId}_data.json           ← Complete project data export
└── {projectId}_manifest.json       ← Deliverable manifest
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `COMPANY_NAME` | Starr Surveying Company | PDF report company name |
| `COMPANY_ADDRESS` | Belton, Texas | PDF report company address |
| `COMPANY_RPLS` | (empty) | RPLS license number |
| `COMPANY_LOGO_PATH` | null | Path to company logo image |
| `DEFAULT_DPI` | 300 | Default DPI for PNG rendering |
| `PIPELINE_VERSION` | 1.0.0 | Pipeline version string |

## Dependencies

```json
{
  "pdfkit": "^0.13.0",
  "@resvg/resvg-js": "^2.6.0",
  "commander": "^11.0.0"
}
```

## Acceptance Criteria

1. SVG renders boundary with confidence colors, monuments, labels, and annotations
2. PNG rasterizes SVG at configurable DPI with cascading renderer fallback
3. DXF exports 13-layer drawing compatible with AutoCAD Civil 3D
4. PDF generates multi-section professional report with all boundary data
5. Legal description follows Texas THENCE/POB standard format
6. Master orchestrator runs full 9-phase pipeline with checkpoint/resume
7. Non-critical phases (4, 5, 6, 9) can fail without stopping pipeline
8. CLI provides run, report, status, list, and clean subcommands
9. Express routes provide REST API for pipeline execution and deliverable access
10. All deliverables written to configurable output directory
11. Manifest JSON tracks all generated files and metadata
12. Report includes purchase summary when Phase 9 data is available

---

## What Needs External Input / Cannot Be Fully Implemented Without More Info

The following aspects cannot be completed without external resources or decisions:

### PDF Generation (`pdf-generator.ts`)
- **pdfkit package** ✅ installed in root `package.json` (`pdfkit ^0.17.2`, `@types/pdfkit ^0.17.5`) — v1.2 fix
- `writeCoverPage()`, `writeDrawingPage()` reference `svgPath.replace(/.svg$/, '.png')` — the PNG path convention assumes the rasterizer writes to the same directory; if the user changes the output path, this breaks
- **Logo embedding** (`config.pdf.logoPath`) is a placeholder — requires actual logo file path to be set via `COMPANY_LOGO_PATH` env var

### PNG Rasterization (`png-rasterizer.ts`)
- **`@resvg/resvg-js`** ✅ installed in root `package.json` (`@resvg/resvg-js ^2.6.2`) — v1.2 fix; also installed in `worker/package.json` for runtime use
- Fallback to `rsvg-convert`, `inkscape`, `convert` (ImageMagick) requires those tools to be installed on the server
- Without any of these installed, PNG generation fails silently (deliverable is `null` in manifest)

### CLI (`starr-research.ts`)
- **`commander` package** must be installed in `worker/package.json`
- The CLI's `--base-url` defaults to `http://localhost:3100` — in production this must be set to the actual worker API URL
- `process.env.COMPANY_NAME`, `COMPANY_ADDRESS`, `COMPANY_RPLS`, `COMPANY_LOGO_PATH` must be configured for PDF branding

### DXF Coordinate System
- DXF output uses NAD83 Texas Central Zone (4203) as coordinate system hint but does not project raw lat/lng to State Plane coordinates — it uses the northing/easting from `reconciliation.corners` which must already be in State Plane US Survey Feet. If corners come in decimal degrees, a proj4/PROJ transformation step is needed before DXF export.

### Legal Description
- `formatAcreage()` is a placeholder — returns `'the acreage hereinabove described'` instead of a computed value. The actual acreage computation (from boundary closure polygon area) requires a proper Shoelace/Gauss algorithm applied to the reconciled corners in State Plane coordinates.
- POB reference tie (`recon.pobReference`) must be populated by Phase 7 reconciliation — if not set, the POB description omits the reference tie.

### Report Routes Background Execution
- `POST /research/run` returns `202 Accepted` and runs the pipeline in the background. In the current Node.js single-process model, background execution uses `async/await` in the request handler. For production, a proper job queue (BullMQ, pg-boss, etc.) should be used to persist job state across server restarts.

---

## Phase 11 Setup

Phase 11 is the **Field Operations Interface** — the bridge from AI research to actual survey fieldwork.

### Anticipated Phase 11 Scope

| Module | Purpose |
|--------|---------|
| Field Visit Planner | Generates prioritized monument search list from confidence scores |
| GPS Export | Creates LandXML / GPX waypoint files for field navigation |
| Field Notes Template | Auto-fills RPLS field notes from reconciled boundary data |
| Discrepancy Resolution Tracker | Links unresolved discrepancies to specific field tasks |
| Monument Verification Matrix | Before/after tracking of found vs. set monuments |
| Boundary Certificate Generator | Draft RPLS boundary survey certificate from Phase 10 legal description |
| Phase 11 Express Routes | `POST /research/field`, `GET /research/field/:projectId` |

### Data Available for Phase 11 (from Phase 10 outputs)

Phase 10 exports the following data that Phase 11 will consume:

```typescript
// From manifest.metadata (ReportManifest)
metadata.overallConfidence   // Overall confidence score
metadata.closureRatio        // Closure quality
metadata.phaseDurations      // Audit trail

// From ProjectData (all phases merged)
data.reconciliation.corners        // GPS-quality survey corners
data.reconciliation.monuments      // Monument descriptions
data.confidence.callConfidence     // Per-call scores (prioritize field search)
data.confidence.discrepancySummary // What needs field resolution
data.surveyorDecision              // readyForField flag + estimatedFieldTime
data.purchases                     // Acquired documents for field use
```

### Phase 11 Integration Point

Phase 10 already provides the `PipelineOptions.onProgress` callback and the `ReportManifest` output structure. Phase 11 can register for progress events and consume the manifest as its input.

The master orchestrator's `PHASES` array should be extended with:
```typescript
{ phase: 10, name: 'Report Generation',  endpoint: '/research/report',  critical: false },
{ phase: 11, name: 'Field Operations',   endpoint: '/research/field',   critical: false },
```

Phase 11 is non-critical — if field data export fails, the pipeline still delivers Phase 10 reports.

### Files to Create for Phase 11

```
worker/src/services/field-visit-planner.ts
worker/src/services/gps-exporter.ts           ← LandXML + GPX
worker/src/services/field-notes-generator.ts
worker/src/services/discrepancy-tracker.ts
worker/src/services/monument-verification.ts
worker/src/routes/field-routes.ts
worker/field.sh
__tests__/recon/phase11-field.test.ts
STARR_RECON/PHASE_11_FIELD_OPERATIONS.md
```
