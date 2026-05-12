# STARR CAD — Complete Implementation Specification

> **Status — archived as historical specification (2026-05-12).** Superseded
> by [`STARR_CAD_MASTER_PLAN.md`](../in-progress/STARR_CAD_MASTER_PLAN.md)
> (2026-04-30). The master plan is the new single source of truth for the
> CAD + AI plat system; per-phase detail docs in `STARR_CAD/` carry the
> implementation specs. This doc remains for historical context — Phases 1–5
> detail here is still authoritative for those phases (cross-linked from the
> master) — but Phase 6+ scope has moved to the master plan, which adds:
> document ingestion, the calculation methods registry, calculated-points /
> monument recovery, and the conversational basis-selection workspace. Do
> not extend this doc; open PRs against the master.
>
> **Section absorption map** (where each section's content now lives):
>
> | This doc § | Owner going forward |
> |---|---|
> | §1 Project overview + architecture | [`STARR_CAD_MASTER_PLAN.md`](../in-progress/STARR_CAD_MASTER_PLAN.md) §3 |
> | §2 Tech stack + project structure | Master plan §16 |
> | §3 Core data models | [`STARR_CAD/STARR_CAD_PHASE_1_ENGINE_CORE.md`](../completed/STARR_CAD/STARR_CAD_PHASE_1_ENGINE_CORE.md) (shipped) |
> | §4 Coordinate system + math engine | Phase 1 (shipped) |
> | §5 Rendering engine | Phase 1 (shipped) |
> | §6 Layer system | [`STARR_CAD_PHASE_3_STYLES_SYMBOLS.md`](./STARR_CAD_PHASE_3_STYLES_SYMBOLS.md) (shipped) |
> | §7 Point code system | Phase 3 |
> | §8 Symbol system + symbol editor | Phase 3 |
> | §9 Line type system + line editor | Phase 3 |
> | §10 Styling + theme engine | Phase 3 |
> | §11 Curve + arc geometry | [`STARR_CAD/STARR_CAD_PHASE_4_GEOMETRY_TOOLS.md`](../completed/STARR_CAD/STARR_CAD_PHASE_4_GEOMETRY_TOOLS.md) (shipped) |
> | §12 Spline system | Phase 4 (shipped) |
> | §13 Offset engine | Phase 4 (shipped) |
> | §14 Survey tools (traverse, closure, legal-desc) | Phase 4 (shipped) · master plan §10 (calculation registry) |
> | §15 File import + export | [`STARR_CAD/STARR_CAD_PHASE_2_DATA_IMPORT.md`](../completed/STARR_CAD/STARR_CAD_PHASE_2_DATA_IMPORT.md) (shipped) · [`STARR_CAD/STARR_CAD_PHASE_7_FINAL.md`](../in-progress/STARR_CAD/STARR_CAD_PHASE_7_FINAL.md) |
> | §16 AI drawing engine | [`STARR_CAD_PHASE_6_AI_ENGINE.md`](./STARR_CAD_PHASE_6_AI_ENGINE.md) (shipped) · master plan §6-§8 |
> | §17 Point-name suffix intelligence | Phase 3 |
> | §18 Confidence rating system | Phase 6 |
> | §19 Template system | [`STARR_CAD/STARR_CAD_PHASE_5_ANNOTATIONS_PRINT.md`](../in-progress/STARR_CAD/STARR_CAD_PHASE_5_ANNOTATIONS_PRINT.md) · master plan §5 (template hierarchy) |
> | §20 UI/UX specification | [`STARR_CAD/STARR_CAD_PHASE_8_UX_CONTROLS.md`](../in-progress/STARR_CAD/STARR_CAD_PHASE_8_UX_CONTROLS.md) |
> | §21 Keyboard shortcuts + command system | Phase 8 |
> | §22 Development phases | Master plan §17 |
> | §23 Appendices A-H | Various phases (referenced inline) |

**Version:** 1.0 | **Date:** March 2026 | **Company:** Starr Surveying Company, Belton, TX

**Purpose (historical):** When written, this was intended as the single source of truth for building Starr CAD. The master plan now owns that role; this doc is retained for the per-phase context it provides on Phases 1–5.

---

## Table of Contents

1. [Project Overview & Architecture](#1-project-overview--architecture)
2. [Technology Stack & Project Structure](#2-technology-stack--project-structure)
3. [Core Data Models](#3-core-data-models)
4. [Coordinate System & Math Engine](#4-coordinate-system--math-engine)
5. [Rendering Engine](#5-rendering-engine)
6. [Layer System](#6-layer-system)
7. [Point Code System](#7-point-code-system)
8. [Symbol System & Symbol Editor](#8-symbol-system--symbol-editor)
9. [Line Type System & Line Editor](#9-line-type-system--line-editor)
10. [Styling & Theme Engine](#10-styling--theme-engine)
11. [Curve & Arc Geometry](#11-curve--arc-geometry)
12. [Spline System](#12-spline-system)
13. [Offset Engine](#13-offset-engine)
14. [Survey Tools](#14-survey-tools)
15. [File Import & Export](#15-file-import--export)
16. [AI Drawing Engine](#16-ai-drawing-engine)
17. [Point Name Suffix Intelligence](#17-point-name-suffix-intelligence)
18. [Confidence Rating System](#18-confidence-rating-system)
19. [Template System](#19-template-system)
20. [UI/UX Specification](#20-uiux-specification)
21. [Keyboard Shortcuts & Command System](#21-keyboard-shortcuts--command-system)
22. [Development Phases](#22-development-phases)
23. [Appendices](#appendices)

---

## 1. Project Overview & Architecture

### 1.1 What Starr CAD Is

Starr CAD is a purpose-built 2D survey drafting application that turns field survey data into finished survey drawings. It combines three systems:

- **A lightweight CAD engine** optimized for survey geometry: points, lines, arcs, curves, splines, symbols, labels, and dimensions
- **A standardized point code system** with dual-code display (alpha-prefix for readability, numeric for data collector entry)
- **An AI drawing engine** that interprets coded field data, deed/record information, and field notes to produce review-ready drawings with confidence ratings

### 1.2 Architecture Overview

```
+-----------------------------------------------------+
|                    ELECTRON SHELL                     |
|  (Desktop wrapper for offline capability)             |
+-----------------------------------------------------+
|                    REACT + NEXT.JS                    |
|  +----------+ +----------+ +----------+ +---------+  |
|  | Canvas   | | Layer    | | Property | | Command |  |
|  | Viewport | | Panel    | | Panel    | | Bar     |  |
|  +----+-----+ +----+-----+ +----+-----+ +----+----+  |
|       |            |            |             |       |
|  +----+------------+------------+-------------+----+  |
|  |              STATE MANAGEMENT (Zustand)         |  |
|  |  Drawing State | Selection | Tools | UI State   |  |
|  +----+-----------------------------------------+--+  |
|       |                                         |     |
|  +----+------------------+  +-------------------+--+  |
|  |   GEOMETRY ENGINE     |  |   RENDERING ENGINE   |  |
|  |   (TypeScript)        |  |   (PixiJS + Canvas)  |  |
|  |                       |  |                       |  |
|  | - CoordinateMath      |  | - ViewportManager     |  |
|  | - CurveCalc           |  | - LayerRenderer       |  |
|  | - SplineEngine        |  | - SymbolRenderer      |  |
|  | - ClosureCalc         |  | - LabelEngine         |  |
|  | - OffsetEngine        |  | - SelectionOverlay    |  |
|  | - TraverseCalc        |  | - SnapIndicator       |  |
|  +----+------------------+  +-----------------------+  |
|       |                                               |
|  +----+----------------------------------------------+ |
|  |              DATA LAYER                           | |
|  |  DrawingDocument | PointCodeLibrary | Styles      | |
|  |  UndoStack | TemplateStore | AIEngine             | |
|  +-------------------+------------------------------+ |
+----------------------+--------------------------------+
|  +-------------------+------------------------------+ |
|  |           PERSISTENCE & SYNC                     | |
|  |  .starr files (local) | Supabase (cloud sync)   | |
|  |  DXF export | PDF export | CSV import            | |
|  +--------------------------------------------------+ |
+-------------------------------------------------------+
```

### 1.3 Key Architectural Decisions

- **Y-Up coordinate system:** Survey coordinates use Y-up (northing increases upward). The rendering engine transforms to screen coordinates (Y-down) at the viewport level. All internal math uses survey coordinates.
- **Non-destructive editing:** Every operation is undoable. Layer visibility does not delete data. AI elements can be accepted/modified/rejected individually.
- **Point code driven:** The point code is the atomic unit. Every code maps deterministically to a symbol, line type, color, layer, and label format.
- **Offline-first:** The CAD engine works entirely offline. AI features require connectivity but are not required for core drawing.
- **Dual-code display:** Every point code has both an alpha-prefix (e.g., FN03) and a numeric (e.g., 742) representation. The UI can toggle between them. The data layer stores both.

---

## 2. Technology Stack & Project Structure

### 2.1 Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| Framework | Next.js (React) | 14+ |
| Language | TypeScript | 5.x (strict mode) |
| Rendering | PixiJS (WebGL + Canvas fallback) | 7.x |
| State | Zustand | 4.x |
| Desktop | Electron | 28+ |
| Database (cloud) | Supabase (PostgreSQL) | -- |
| Local Storage | IndexedDB via Dexie.js | -- |
| AI Engine | Anthropic Claude API | claude-sonnet-4-20250514 |
| Math | mathjs (for precise arithmetic) | -- |
| Geometry | Custom TypeScript library | -- |
| Testing | Vitest + Playwright | -- |

### 2.2 Project Structure

```
starr-cad/
├── apps/
│   ├── web/                    # Next.js web application
│   │   ├── app/                # App router pages
│   │   ├── components/
│   │   │   ├── canvas/         # Viewport, rendering, interaction
│   │   │   ├── panels/         # Layer panel, property panel, code panel
│   │   │   ├── toolbar/        # Tool buttons, mode indicators
│   │   │   ├── dialogs/        # Curve entry, symbol editor, settings
│   │   │   ├── command/        # Command bar (bottom)
│   │   │   └── review/         # AI review queue, confidence display
│   │   └── hooks/              # React hooks for tools, selection, etc.
│   └── desktop/                # Electron wrapper
│       ├── main.ts
│       └── preload.ts
│
├── packages/
│   ├── core/                   # Core data models and types
│   ├── geometry/               # Math and geometry engine
│   ├── point-codes/            # Point code library and mapping
│   ├── symbols/                # Symbol library and editor
│   ├── line-types/             # Line type library and editor
│   ├── rendering/              # PixiJS rendering engine
│   ├── ai-engine/              # AI drawing automation
│   ├── file-io/                # Import/export
│   └── store/                  # Zustand state management
│
├── STARR_CAD_IMPLEMENTATION.md  # THIS FILE
├── package.json
├── tsconfig.json
└── turbo.json
```

---

## 3. Core Data Models

### 3.1 DrawingDocument

The root container for all drawing data.

```typescript
interface DrawingDocument {
  id: string;
  name: string;
  created: Date;
  modified: Date;
  author: string;

  coordinateSystem: CoordinateSystemConfig;

  layers: Layer[];
  features: Map<string, Feature>;
  points: Map<string, SurveyPoint>;
  traverses: Traverse[];
  annotations: Annotation[];

  pointCodeLibrary: PointCodeLibrary;
  symbolLibrary: SymbolLibrary;
  lineTypeLibrary: LineTypeLibrary;
  styleConfig: StyleConfig;
  template: DrawingTemplate;

  aiSession: AIDrawingSession | null;

  undoStack: UndoEntry[];
  redoStack: UndoEntry[];
}

interface CoordinateSystemConfig {
  zone: 'TX_CENTRAL' | 'TX_NORTH_CENTRAL' | 'TX_NORTH'
      | 'TX_SOUTH_CENTRAL' | 'TX_SOUTH';
  datum: 'NAD83';
  units: 'US_SURVEY_FEET' | 'INTERNATIONAL_FEET' | 'METERS';
  scaleFactor: number;  // Combined scale factor (grid-to-ground)
}
```

### 3.2 SurveyPoint

The fundamental data unit. Every field shot becomes a SurveyPoint.

```typescript
interface SurveyPoint {
  id: string;
  pointNumber: number;
  pointName: string;             // Full name as entered (e.g., "20set", "35fnd")
  parsedName: ParsedPointName;

  northing: number;
  easting: number;
  elevation: number | null;

  rawCode: string;               // Exactly as entered in the field
  parsedCode: ParsedPointCode;
  resolvedAlphaCode: string;
  resolvedNumericCode: string;
  codeSuffix: CodeSuffix | null;

  monumentAction: MonumentAction | null;
  description: string;
  timestamp: Date | null;
  rawRecord: string;

  layerId: string;
  symbolId: string;
  labelConfig: PointLabelConfig;

  confidence: number;            // 0-100
  aiFlags: AIFlag[];
  isAccepted: boolean;

  featureIds: string[];
  traverseIds: string[];
}
```

### 3.3 Feature

A Feature is a drawn element composed of one or more points.

```typescript
type FeatureType =
  | 'POINT' | 'LINE' | 'POLYLINE' | 'ARC' | 'CURVE'
  | 'SPLINE' | 'POLYGON' | 'CLOSED_CURVE' | 'CLOSED_SPLINE'
  | 'TEXT' | 'DIMENSION' | 'LEADER' | 'HATCH';

interface Feature {
  id: string;
  type: FeatureType;
  geometry: FeatureGeometry;
  pointIds: string[];
  styleOverride: Partial<FeatureStyle> | null;
  pointCode: string;
  layerId: string;
  confidence: number;
  aiFlags: AIFlag[];
  isAccepted: boolean;
  properties: Record<string, any>;
}
```

### 3.4 Layer

```typescript
interface Layer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  frozen: boolean;
  style: LayerStyle;
  parentGroupId: string | null;
  sortOrder: number;
  isDefault: boolean;
  isProtected: boolean;
  featureCount: number;
  autoAssignCodes: string[];
}
```

---

## 4. Coordinate System & Math Engine

### 4.1 Coordinate System

All internal coordinates use the survey coordinate system:
- **X axis** = Easting (increases to the right/east)
- **Y axis** = Northing (increases upward/north)
- **Z axis** = Elevation (increases upward)
- **Units:** US Survey Feet (default for Texas Central Zone)
- **Datum:** NAD83
- **State Plane Zone:** Texas Central (4203)

### 4.2 Bearing System

All bearings stored internally as decimal degrees from north, clockwise (azimuth). Display format: Quadrant bearing (N 45 30'15" E).

```typescript
interface Bearing {
  azimuth: number;           // Decimal degrees, 0-360
  quadrant: string;          // Display string
  dms: { degrees: number; minutes: number; seconds: number };
}
```

### 4.3 Precision Rules

- **Coordinates:** IEEE 754 double precision. Display to 3 decimal places (feet).
- **Bearings:** Decimal degrees (double). Display as DMS to nearest second.
- **Distances:** Double. Display to 2 decimal places, configurable 0-4.
- **Areas:** Coordinate method (double-area formula). Display in square feet AND acres.
- **Curve parameters:** Compute all from stored values; never accumulate rounding errors.

---

## 5. Rendering Engine

### 5.1 Scale-Dependent Rendering

| Zoom Level | Behavior |
|-----------|----------|
| Very zoomed out (< 10 px/ft) | Points as dots, no labels, simplified lines |
| Normal (10-50 px/ft) | Full symbols, labels visible, line types rendered |
| Zoomed in (50-200 px/ft) | Full detail, snap indicators, grid visible |
| Very zoomed in (> 200 px/ft) | Construction points visible, tangent handles on splines |

### 5.2 Rendering Order

1. Grid (if visible)
2. Features by layer order (bottom to top): Fill/hatch -> Lines -> Point symbols
3. Annotations (text, dimensions, leaders)
4. Selection overlay
5. Snap indicator
6. Tool preview
7. AI confidence highlights

---

## 6. Layer System

### 6.1 Default Layers (22 Layers)

| Name | Color | Weight | Line Type | Codes |
|------|-------|--------|-----------|-------|
| BOUNDARY | #000000 | 0.50 | SOLID | PL01, PL06 |
| BOUNDARY-MON | #000000 | 0.00 | SOLID | BC01-BC27 |
| EASEMENT | #27AE60 | 0.35 | DASHED | PL02 |
| BUILDING-LINE | #2980B9 | 0.25 | DASH_DOT | PL03 |
| ROW | #E74C3C | 0.50 | DASHED_HEAVY | PL04, PL05 |
| FLOOD | #00BCD4 | 0.25 | DASH_DOT_DOT | PL07 |
| CONTROL | #2980B9 | 0.00 | SOLID | SC01-SC14 |
| STRUCTURES | #7F8C8D | 0.35 | SOLID | ST01-ST18 |
| FENCE | #E67E22 | 0.25 | PER_CODE | FN01-FN17 |
| UTILITY-WATER | #3498DB | 0.25 | DASHED | UT01-UT07 |
| UTILITY-SEWER | #27AE60 | 0.25 | DASHED | UT08-UT18 |
| UTILITY-GAS | #F1C40F | 0.25 | DASHED | UT19-UT21 |
| UTILITY-ELEC | #E67E22 | 0.25 | DASHED | UT22-UT31 |
| UTILITY-COMM | #8E44AD | 0.25 | DASHED | UT32-UT35 |
| VEGETATION | #27AE60 | 0.15 | VARIES | VG01-VG09 |
| TOPO | #8B4513 | 0.15 | SOLID | TP01, PL08, PL09 |
| WATER-FEATURES | #00BCD4 | 0.25 | VARIES | TP02-TP13 |
| TRANSPORTATION | #7F8C8D | 0.35 | SOLID | TR01-TR08 |
| ANNOTATION | #000000 | 0.00 | SOLID | -- |
| TITLE-BLOCK | #000000 | 0.00 | SOLID | -- |
| REFERENCE | #9B59B6 | 0.00 | SOLID | PL10, MS04, MS05 |
| MISC | #000000 | 0.00 | SOLID | MS01-MS06 |

### 6.2 Style Cascade

Style resolution order (first non-null wins):
1. Feature-level override (set manually by user)
2. Point-code default (defined in point code library)
3. Layer style (the layer's default style settings)
4. Global default (application-wide fallback)

---

## 7. Point Code System

### 7.1 Code Suffix Parsing

The suffix parser extracts line-control suffixes from raw codes:

| Suffix | Meaning |
|--------|---------|
| B | Begin Line |
| E | End Line |
| C | Close Line |
| A | Arc Point (continuation) |
| BA | Begin Arc |
| EA | End Arc |
| CA | Close with Arc |

### 7.2 Auto-Connect Logic

Points with line codes are automatically connected into line strings based on B/E suffix logic. Same code without suffix extends the current line string. Different code starts a new string.

### 7.3 Auto-Spline Codes

These codes automatically fit a spline instead of straight line segments:
- Stream, River, Pond, Lake, Ditch (632-635, 630)
- Wetland (370)
- Edge of Woods (729)
- Contour Major/Minor (357, 358)

### 7.4 Code Display Toggle

Global toggle: "Show Alpha Codes" / "Show Numeric Codes". Affects point labels, code columns, command bar suggestions, and export format. Data always stores BOTH codes.

---

## 8. Symbol System & Symbol Editor

### 8.1 Symbol Categories

- **Monuments - FOUND** (solid/filled symbols, black)
- **Monuments - SET** (open/outline symbols, red)
- **Monuments - CALCULATED** (target/crosshair symbols, magenta)
- **Survey Control** (triangles, benchmarks)
- **Utilities** (fire hydrant, valve, meter, manhole, etc.)
- **Vegetation** (deciduous, evergreen, brush)
- **Transportation** (light pole, sign, mailbox)
- **Fence elements** (corner post, end post, gate)
- **Curve points** (PC, PT, PI)
- **Generic** (point, cross, question mark)

### 8.2 Symbol Editor

Modal dialog with:
- Grid-based drawing canvas (32x32 default)
- Drawing tools: Line, Circle, Arc, Rectangle, Polygon, Freehand, Text
- Properties: Name, Category, Insertion point, Size, Color mode
- Live preview at various sizes and backgrounds
- Import/Export SVG

---

## 9. Line Type System & Line Editor

### 9.1 Built-In Line Types

**Basic:** SOLID, DASHED, DASHED_HEAVY, DOTTED, DASH_DOT, DASH_DOT_DOT, CENTER, PHANTOM

**Fence Types (12):** Each has a solid base line with unique inline symbols at scale-dependent intervals:
- Barbed Wire, Chain Link, Wood Privacy, Wood Picket, Cable, Block, Woven Wire, Split Rail, Metal/Iron, Pipe, Electric (dashed base), Guardrail

**Specialty:** Retaining Wall (hatch ticks), Overhead Power (dashed + ticks), Railroad (crossties), Creek Wavy, Hedge Line

### 9.2 Line Type Editor

Visual editor with dash pattern bars, inline symbol configuration (symbol, interval, size, rotation, side, offset), and code assignment.

---

## 10. Styling & Theme Engine

Global style configuration covers: code display mode, background, fonts, bearing/distance format and precision, area display units, symbol sizing mode, snap settings, selection appearance, and default print settings.

---

## 11. Curve & Arc Geometry

### 11.1 Curve Parameter Calculator

Any 2-3 sufficient inputs compute all outputs: Radius (R), Central angle (Delta), Arc length (L), Chord distance (C), Chord bearing (CB), Tangent distance (T), External distance (E), Mid-ordinate (M), Degree of curve (D).

**7 Input Methods:**
1. R + Delta + direction + (PC or PT)
2. R + L + direction + (PC or PT)
3. R + C + direction + (PC or PT)
4. Three points on arc
5. PC + tangent bearing + R + direction
6. Full data block (cross-validate)
7. Two tangent bearings + R

### 11.2 Curb Return Presets

| Preset | Radius |
|--------|--------|
| Residential Standard | 25' |
| Residential Wide | 30' |
| Commercial Standard | 35' |
| Commercial Wide | 50' |
| Cul-de-sac | 40'-50' |
| Driveway Apron | 5'-10' |
| ADA Ramp Flare | 3' |

---

## 12. Spline System

### 12.1 Fit-Point Spline (Fusion 360 Style)

Click to place fit points, drag tangent handles to adjust curvature. Alt+drag breaks symmetry. Right-click for Delete/Insert/Corner operations. Ctrl+click on spline to insert point.

### 12.2 Spline-to-Arc Conversion

For legal descriptions, splines are converted to tangent-continuous arcs using bi-arc fitting within configurable tolerance (default 0.01').

---

## 13. Offset Engine

Parallel geometry at specified distance with corner handling (miter, round, chamfer). Optional parametric link (offset updates when source changes, breakable).

**Presets:** Utility easement (7.5'/10'), drainage easement (15'/20'), front setback (25'), side setback (5'/7.5'), rear setback (10'/20'), ROW from centerline (25'/30'), curb face (0.5'), gutter (1.5').

---

## 14. Survey Tools

### 14.1 Traverse & Closure

```typescript
interface ClosureResult {
  linearError: number;
  angularError: number;
  precisionRatio: string;        // e.g., "1:15,000"
  errorNorth: number;
  errorEast: number;
  adjusted: boolean;
  adjustmentMethod: 'COMPASS' | 'TRANSIT' | 'CRANDALL' | 'NONE';
}
```

### 14.2 Legal Description Generator

Generates metes-and-bounds or lot-and-block format with configurable bearing/distance precision, monument descriptions, curve data, basis of bearings, and datum statement.

---

## 15. File Import & Export

### 15.1 Import Formats

| Format | Source |
|--------|--------|
| CSV/TXT | Any total station with configurable column mapper |
| RW5 | Carlson |
| JobXML | Trimble |
| DXF | AutoCAD |
| PDF/Image | Deed documents (AI extraction) |

### 15.2 Export Formats

| Format | Purpose |
|--------|---------|
| .starr | Native format (gzipped JSON) |
| DXF | AutoCAD-compatible with blocks, line types, layer mapping |
| PDF | Vector, print-quality |
| CSV (simplified) | Dad-mode: collapse monument codes, preserve point names |
| CSV (full) | Both alpha and numeric codes |

### 15.3 Simplified Export (Dad Mode)

Collapses expanded monument codes back to base codes. Preserves B/E/A suffixes. Point NAME is NEVER modified (fnd/set/calc stays).

---

## 16. AI Drawing Engine

### 16.1 6-Stage Pipeline

```
Stage 1: Point Classification
    |
Stage 2: Feature Assembly (lines, polygons, curves, splines)
    |
Stage 3: Deed/Record Reconciliation
    |
Stage 4: Intelligent Placement (symbols, labels, scale, orientation)
    |
Stage 5: Label Optimization (collision detection, repositioning)
    |
Stage 6: Confidence Scoring & Review Queue
```

### 16.2 Stage 2: Feature Assembly

Uses `buildLineStrings()` from point code suffix logic. Additional processing:
- Arc fitting (3+ consecutive A-suffix points -> best-fit arc via Kasa algebraic circle fit)
- Spline fitting (auto-spline codes -> Catmull-Rom interpolation -> cubic Bezier segments)
- Unclosed boundary detection (first/last points within 1.0' for PL01/PL06 codes)
- Mixed geometry features (straight + arc segments from BA/EA suffixes)

### 16.3 Stage 3: Deed/Record Reconciliation

Matches deed calls to field measurements:
- Bearing tolerance: 60 seconds (1 minute)
- Distance tolerance: 0.50'
- Computes closure for both field and record traverses
- Adjusts confidence: matching lines +15-20 pts, mismatches -10-20 pts

### 16.4 Stage 4: Intelligent Placement

Auto-selects paper size, scale, and orientation by scoring each candidate combination for fill ratio. Prefers larger scale > smaller paper > landscape. Also tries rotating at bearing of longest boundary line.

### 16.5 Stage 5: Label Optimization

Simulated annealing with force-directed repositioning. Priority order: boundary B/D labels > monument labels > curve data > area/lot labels > utility/structure labels.

Collision resolution strategies (in order): flip side, slide along line, add leader, reduce font, stack vertically, abbreviate, flag for manual placement.

### 16.6 AI API Integration

Processing runs via a DigitalOcean worker (no time limits). Input: points, deed data, field notes, user prompt, template, code library. Output: features, annotations, placement config, point groups, reconciliation results, review queue.

---

## 17. Point Name Suffix Intelligence

### 17.1 Suffix Patterns

- **FOUND:** fnd, fne, foun, found, foud, fd (and single-letter `f`)
- **SET:** set, ste, st, sed (and single-letter `s`)
- **CALCULATED:** calc, clac, calx (base), cal[d-z] (recalculations)

Recalculation detection: `calc` -> `cald` -> `cale` -> `calf` etc. The last letter increments for each recalculation.

### 17.2 Point Grouping Logic

Points with the same base number are grouped. Resolution priority:
1. **SET** exists -> use SET position (this is where the rod IS)
2. **FOUND** exists -> use FOUND position
3. Only **CALC** exists -> use CALC but flag as "not field-verified"

Computes delta distances between calc/set and calc/found for QA.

### 17.3 Symbol Selection from Point Name

| Name Suffix | Symbol Variant | Color |
|-------------|---------------|-------|
| FOUND | Solid/filled | Black |
| SET | Open/outline | Red |
| CALCULATED | Target/crosshair | Magenta |

---

## 18. Confidence Rating System

### 18.1 Score Tiers

| Tier | Score | Visual | Behavior |
|------|-------|--------|----------|
| 5 stars | 95-100% | No highlight | Auto-placed. No review needed. |
| 4 stars | 80-94% | Yellow glow | Auto-placed. Listed in review queue. |
| 3 stars | 60-79% | Orange glow | Placed tentatively. Requires review. |
| 2 stars | 40-59% | Red glow | Placed tentatively. User MUST specify. |
| 1 star | 0-39% | NOT placed | Listed in unresolved queue for manual entry. |

### 18.2 Score Factors

| Factor | Weight | Description |
|--------|--------|-------------|
| Code clarity | 0.25 | Recognized? Ambiguous? |
| Coordinate validity | 0.20 | Non-zero? Within bounds? No duplicates? |
| Deed/record match | 0.25 | From reconciliation call comparisons |
| Contextual consistency | 0.15 | Fence inside building? Water on hilltop? |
| Closure quality | 0.10 | 1:15000+ = 1.0, 1:5000 = 0.5 |
| Curve data completeness | 0.05 | All params consistent? PC/PT shot? |

---

## 19. Template System

Templates define: paper size, orientation, margins, scale, title block layout, north arrow placement, scale bar, legend, certification block, and standard notes.

Default template: Starr Surveying, Tabloid landscape, 1"=50'.

---

## 20. UI/UX Specification

### 20.1 Main Layout

```
+----------------------------------------------------------+
| Menu Bar: File | Edit | View | Draw | Tools | AI | Help  |
+--------+----------------------------------------+--------+
|        |                                        |        |
| Tool   |          CANVAS VIEWPORT               | Props  |
| Bar    |                                        | Panel  |
|        |          (Drawing Area)                 |        |
| (Left) |                                        |(Right) |
|        |                                        |        |
| Layer  |                                        |        |
| Panel  |                                        |        |
|        |                                        |        |
+--------+----------------------------------------+--------+
| Command Bar: [                                         ] |
| Status: X: 598234.123  Y: 2145678.456  Scale: 1"=50'   |
+----------------------------------------------------------+
```

### 20.2 AI Review Queue UI

Left panel: scrollable list grouped by confidence tier (color-coded headers). Click item -> zooms to element + highlights it. Buttons: Accept, Modify, Reject.

For point groups: shows calc/set/found positions with delta distances, lets user pick which position to use.

Top bar: progress indicator with batch actions ("Accept All 5-star", "Accept All >= 4-star").

Bottom: AI prompt input for re-processing instructions.

---

## 21. Keyboard Shortcuts & Command System

### 21.1 Global Shortcuts

| Shortcut | Action |
|----------|--------|
| Ctrl+Z | Undo |
| Ctrl+Y / Ctrl+Shift+Z | Redo |
| Ctrl+S | Save |
| Ctrl+Shift+S | Save As |
| Ctrl+O | Open |
| Ctrl+N | New Drawing |
| Ctrl+P | Print/Plot |
| Ctrl+A | Select All (unlocked layers) |
| Escape | Cancel / Deselect |
| Delete | Delete selection |
| Space | Pan mode (hold) |
| Scroll | Zoom |
| Z then E | Zoom Extents |
| Z then S | Zoom to Selection |

### 21.2 Drawing Tool Shortcuts

| Shortcut | Tool |
|----------|------|
| L | Line |
| P then L | Polyline |
| C then A | Curve (3-point arc) |
| C then R | Curve (radius + delta) |
| C then D | Curve Data Entry (full block) |
| F | Fillet / Curb Return |
| S then P | Spline (fit-point) |
| O | Offset |
| M | Move |
| C then O | Copy |
| R then O | Rotate |
| M then I | Mirror |
| T then R | Trim |
| E then X | Extend |
| D then I | Dimension (bearing/distance) |
| T then X | Text |
| L then D | Leader |

### 21.3 Modifier Keys

| Modifier | Effect |
|----------|--------|
| Shift | Constrain to horizontal/vertical/45 degrees |
| Ctrl | Snap override (temporary disable) |
| Alt | Break spline tangent symmetry |
| Tab | Cycle between input fields |
| R | Toggle right/left curve direction |
| F3 | Toggle snap on/off |

---

## 22. Development Phases

| Phase | Focus | Duration | Running Total |
|-------|-------|----------|---------------|
| 1 | CAD Engine Core | 6-8 wks | 6-8 wks |
| 2 | Point Code & Styling | 4-6 wks | 10-14 wks |
| 3 | Layer System, Symbols, Line Types & Editors | 5-7 wks | 15-21 wks |
| 4 | Geometry Tools (Curves, Splines, Offsets, Survey Math) | 7-9 wks | 22-30 wks |
| 5 | Annotations, Dimensions, Templates & Print | 5-7 wks | 27-37 wks |
| 6 | AI Drawing Engine | 8-10 wks | 35-47 wks |
| 7 | File Export, Integration, Desktop App & Polish | 5-7 wks | 40-54 wks |

Each phase has its own detailed spec file. See `STARR_CAD_PHASE_ROADMAP.md` for the full roadmap and `./STARR_CAD/STARR_CAD_PHASE_1_ENGINE_CORE.md` for the first phase's complete implementation spec.

---

## Appendices

### Appendix A: Undo/Redo System

```typescript
type UndoOperation =
  | { type: 'ADD_FEATURE'; feature: Feature }
  | { type: 'REMOVE_FEATURE'; featureId: string }
  | { type: 'MODIFY_FEATURE'; featureId: string;
      before: Partial<Feature>; after: Partial<Feature> }
  | { type: 'ADD_POINT'; point: SurveyPoint }
  | { type: 'REMOVE_POINT'; pointId: string }
  | { type: 'MODIFY_POINT'; pointId: string;
      before: Partial<SurveyPoint>; after: Partial<SurveyPoint> }
  | { type: 'ADD_LAYER'; layer: Layer }
  | { type: 'REMOVE_LAYER'; layerId: string }
  | { type: 'MODIFY_LAYER'; layerId: string;
      before: Partial<Layer>; after: Partial<Layer> }
  | { type: 'MODIFY_STYLE'; target: string;
      before: Partial<FeatureStyle>; after: Partial<FeatureStyle> }
  | { type: 'BATCH'; ops: UndoOperation[] };
```

**Rules:**
- Unlimited undo depth (limited only by memory, max 500 entries)
- Redo stack clears on new action
- Compound operations are a single undo entry
- AI placement is a single undo entry
- Consecutive similar operations within 500ms merge

### Appendix B: Selection System

- **REPLACE** (default): click = select only this
- **ADD** (Shift+click): add to selection
- **REMOVE** (Ctrl+click): remove from selection
- **TOGGLE** (Shift+Ctrl+click): toggle
- **WINDOW** (left-to-right drag): only fully enclosed features
- **CROSSING** (right-to-left drag): any feature touching the box

Hit testing priority: points > line endpoints > lines > fill areas/polygons. Repeated clicks on overlapping features cycle through candidates.

### Appendix C: Snap System

| Snap Type | Indicator | Color |
|-----------|-----------|-------|
| ENDPOINT | Square | Green |
| MIDPOINT | Triangle | Green |
| INTERSECTION | Cross | Red |
| NEAREST | Diamond | Yellow |
| CENTER | Circle | Cyan |
| PERPENDICULAR | Square | Magenta |
| TANGENT | Circle | Magenta |
| QUADRANT | Diamond | Cyan |
| NODE | Cross | Green |
| GRID | Cross | Gray |

Performance: spatial index (R-tree or grid) for nearby feature lookup. Only test visible, unlocked, unfrozen layers.

### Appendix D: Property Panel

Shows and edits properties of the current selection:
- **Single point:** Point number, name, coordinates, code, description, layer, symbol, monument action, confidence
- **Single feature:** Type, point count, length, area, code, layer, style properties, curve data (if arc), spline degree (if spline)
- **Multi-feature:** Count, types, common properties, batch editing

### Appendix E: Print / Plot System

Paper sizes: Letter (8.5x11"), Tabloid (11x17"), Arch C (18x24"), Arch D (24x36"), Arch E (36x48").

Plot styles: As Displayed, Monochrome, Grayscale. Output: PDF, Printer, PNG, SVG. Print preview: WYSIWYG with red boundary showing printable area.

### Appendix F: .starr File Format Schema

```typescript
interface StarrFileV1 {
  version: '1.0';
  application: 'starr-cad';
  created: string;           // ISO 8601
  modified: string;
  author: string;

  coordinateSystem: CoordinateSystemConfig;

  layers: Layer[];
  layerGroups: LayerGroup[];
  points: SurveyPoint[];
  features: Feature[];
  traverses: Traverse[];
  annotations: Annotation[];

  customSymbols: SymbolDefinition[];
  customLineTypes: LineTypeDefinition[];
  customCodes: PointCodeDefinition[];
  codeStyleOverrides: CodeStyleMapping[];

  template: DrawingTemplate;
  styleConfig: GlobalStyleConfig;

  aiSession: AISessionData | null;
}
```

### Appendix G: Grid System

Major grid at configurable spacing (default 100'). Minor grid at `major / divisions` (default 10'). Styles: DOTS, LINES, CROSSHAIRS. Auto-scale: adjusts spacing based on zoom to prevent clutter. Origin marker at (0,0).

### Appendix H: DXF Import/Export

| Feature Type | DXF Entity |
|-------------|------------|
| POINT | INSERT (block ref) + POINT |
| LINE | LINE |
| POLYLINE | LWPOLYLINE |
| ARC | ARC |
| CURVE (mixed) | LWPOLYLINE with bulge factors |
| SPLINE | SPLINE |
| POLYGON | LWPOLYLINE (closed) |
| TEXT | MTEXT |
| DIMENSION | Custom block with text + lines |
| LEADER | LEADER or MLEADER |
| HATCH | HATCH |

---

*End of Starr CAD Implementation Specification*

*Starr Surveying Company — Belton, Texas — March 2026*
