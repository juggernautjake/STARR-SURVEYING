# STARR CAD — Phase 2: Data Import & Point Code System

**Version:** 1.0 | **Date:** March 2026 | **Phase:** 2 of 7

**Goal:** Import field data from any format (CSV, RW5, JobXML), automatically classify every point by its dual-code (alpha + numeric), parse point names for fnd/set/calc suffixes with fuzzy matching and recalculation detection, group related points (calc/set/found), build auto-connected line strings from B/E suffixes, and validate all data.

**Duration:** 4–6 weeks | **Depends On:** Phase 1 (canvas, features, selection, undo, layers, file I/O)

---

## Table of Contents

1. [Phase 2 Architecture Changes](#1-phase-2-architecture-changes)
2. [SurveyPoint Data Model](#2-surveypoint-data-model)
3. [Master Point Code Library](#3-master-point-code-library)
4. [Dual-Code Lookup Engine](#4-dual-code-lookup-engine)
5. [Code Suffix Parser (B/E/A Line Control)](#5-code-suffix-parser-bea-line-control)
6. [Point Name Suffix Intelligence (fnd/set/calc)](#6-point-name-suffix-intelligence-fndsetcalc)
7. [Point Grouping Logic (calc/set/found Relationships)](#7-point-grouping-logic-calcsetfound-relationships)
8. [Auto-Connect Engine (Line String Builder)](#8-auto-connect-engine-line-string-builder)
9. [Auto-Spline Designation](#9-auto-spline-designation)
10. [CSV/TXT Import System](#10-csvtxt-import-system)
11. [RW5 (Carlson) Import Parser](#11-rw5-carlson-import-parser)
12. [JobXML (Trimble) Import Parser](#12-jobxml-trimble-import-parser)
13. [Import Pipeline (Unified)](#13-import-pipeline-unified)
14. [Data Validation System](#14-data-validation-system)
15. [Simplified Export & Code Collapse Map](#15-simplified-export--code-collapse-map)
16. [Code Display Toggle](#16-code-display-toggle)
17. [State Management (New & Updated Stores)](#17-state-management-new--updated-stores)
18. [Point Table Panel UI](#18-point-table-panel-ui)
19. [Import Dialog UI](#19-import-dialog-ui)
20. [Canvas Rendering Updates](#20-canvas-rendering-updates)
21. [Acceptance Tests](#21-acceptance-tests)
22. [Build Order (Implementation Sequence)](#22-build-order-implementation-sequence)

---

## 1. Phase 2 Architecture Changes

### 1.1 New Packages

```
packages/
├── codes/                           # NEW — Point code library + parsers
│   ├── src/
│   │   ├── code-library.ts          # Master code definitions (all 157+)
│   │   ├── code-lookup.ts           # Dual-code lookup engine
│   │   ├── code-suffix-parser.ts    # B/E/A/BA/EA/CA suffix parser
│   │   ├── name-suffix-parser.ts    # fnd/set/calc fuzzy matching
│   │   ├── point-grouping.ts        # calc/set/found group logic
│   │   ├── auto-connect.ts          # Line string builder
│   │   ├── collapse-map.ts          # Simplified export code mapping
│   │   └── types.ts                 # Code-specific types
│   ├── __tests__/
│   │   ├── code-lookup.test.ts
│   │   ├── code-suffix-parser.test.ts
│   │   ├── name-suffix-parser.test.ts
│   │   ├── point-grouping.test.ts
│   │   └── auto-connect.test.ts
│   ├── package.json
│   └── tsconfig.json
│
├── import/                          # NEW — File import parsers
│   ├── src/
│   │   ├── csv-parser.ts            # CSV/TXT import
│   │   ├── rw5-parser.ts            # RW5 (Carlson) import
│   │   ├── jobxml-parser.ts         # JobXML (Trimble) import
│   │   ├── import-pipeline.ts       # Unified import orchestration
│   │   ├── validation.ts            # Data validation rules
│   │   ├── presets.ts               # Saved import presets
│   │   └── types.ts                 # Import-specific types
│   ├── __tests__/
│   │   ├── csv-parser.test.ts
│   │   ├── rw5-parser.test.ts
│   │   ├── jobxml-parser.test.ts
│   │   └── validation.test.ts
│   ├── package.json
│   └── tsconfig.json
```

### 1.2 Updated Packages

```
packages/core/src/
  ├── types.ts                       # UPDATED — add SurveyPoint, all code types
  └── constants.ts                   # UPDATED — add default code-to-layer map

packages/store/src/
  ├── point-store.ts                 # NEW — SurveyPoint CRUD + queries
  ├── import-store.ts                # NEW — Import dialog state
  └── drawing-store.ts               # UPDATED — wire point store into features

apps/web/components/
  ├── panels/
  │   ├── PointTablePanel.tsx        # NEW — Sortable/filterable point table
  │   └── PointGroupPanel.tsx        # NEW — calc/set/found group viewer
  ├── import/
  │   ├── ImportDialog.tsx           # NEW — Import file wizard
  │   ├── ColumnMapper.tsx           # NEW — Column assignment UI
  │   ├── ImportPreview.tsx          # NEW — Preview imported points
  │   └── ValidationReport.tsx       # NEW — Show validation issues
  └── toolbar/
      └── ToolBar.tsx                # UPDATED — add Import button
```

### 1.3 New Dependencies

```
packages/import:
  - fast-xml-parser (for JobXML)
  - papaparse (for CSV parsing — already available in artifacts)
  - @starr-cad/core, @starr-cad/codes

packages/codes:
  - (no runtime deps — pure TypeScript)
  - vitest (dev)
```

---

## 2. SurveyPoint Data Model

Phase 1 used a generic `Feature` with `Point2D` geometry for points. Phase 2 introduces `SurveyPoint` as a first-class entity that wraps richer survey data. Features still exist — a `SurveyPoint` generates one or more Features (the point symbol, line connections, etc.).

```typescript
// packages/core/src/types.ts — ADD these types

// ─── SURVEY POINT ───

export interface SurveyPoint {
  id: string;                          // UUID

  // Identity
  pointNumber: number;                 // Original point number from field file
  pointName: string;                   // Full name as entered (e.g., "20set", "35fnd", "100")

  // Parsed name components
  parsedName: ParsedPointName;

  // Coordinates (survey/world space, feet)
  northing: number;                    // Y
  easting: number;                     // X
  elevation: number | null;            // Z (null if 2D)

  // Code information
  rawCode: string;                     // Exactly as entered: "742B", "FN03", "309"
  parsedCode: ParsedPointCode;         // Decomposed into components
  resolvedAlphaCode: string;           // Looked up alpha: "FN03"
  resolvedNumericCode: string;         // Looked up numeric: "742"
  codeSuffix: CodeSuffix | null;       // B, E, C, A, BA, EA, CA
  codeDefinition: PointCodeDefinition | null;  // Full definition from library (null if unrecognized)

  // Monument intelligence
  monumentAction: MonumentAction | null;  // FOUND, SET, CALCULATED — from name suffix or expanded code

  // Metadata
  description: string;                 // Additional text beyond code
  rawRecord: string;                   // Original line from import file (for debugging)
  importSource: string;                // File name the point came from

  // Drawing relationships
  layerId: string;                     // Auto-assigned from code, editable
  featureId: string;                   // The POINT feature this creates on canvas
  lineStringIds: string[];             // Line strings this point belongs to

  // Validation
  validationIssues: ValidationIssue[]; // Problems detected during import

  // AI state (Phase 6 populates these)
  confidence: number;                  // 0-100 (default: -1 meaning "not scored")
  isAccepted: boolean;                 // Default: true (user can reject AI-placed points)
}

// ─── PARSED NAME ───

export interface ParsedPointName {
  baseNumber: number;                  // e.g., 20 from "20set"
  suffix: string;                      // Raw suffix text: "set", "fnd", "cald"
  normalizedSuffix: PointNameSuffix;   // FOUND | SET | CALCULATED | NONE
  suffixVariant: string;               // Exact variant matched (tracks typos)
  suffixConfidence: number;            // 0–1 how confident the match is
  isRecalc: boolean;                   // true for cald, cale, calf, etc.
  recalcSequence: number;              // 0 = original calc, 1 = first recalc (cald), etc.
}

export type PointNameSuffix = 'FOUND' | 'SET' | 'CALCULATED' | 'NONE';

// ─── PARSED CODE ───

export interface ParsedPointCode {
  rawCode: string;                     // Original input
  baseCode: string;                    // Code with suffix stripped: "742" from "742B"
  isNumeric: boolean;                  // true if base is numeric
  isAlpha: boolean;                    // true if base is alpha (like "FN03")
  suffix: CodeSuffix | null;           // Line control suffix
  isValid: boolean;                    // true if base code exists in library
  isLineCode: boolean;                 // Does this code connect in lines?
  isAutoSpline: boolean;               // Auto-fit spline instead of straight?
}

export type CodeSuffix = 'B' | 'E' | 'C' | 'A' | 'BA' | 'EA' | 'CA';

// ─── MONUMENT ACTION ───

export type MonumentAction = 'FOUND' | 'SET' | 'CALCULATED' | 'UNKNOWN';

// ─── POINT CODE DEFINITION ───

export type CodeCategory =
  | 'BOUNDARY_CONTROL'   // BC01–BC27: Iron rods, pipes, caps, concrete monuments
  | 'SURVEY_CONTROL'     // SC01–SC06: Control points, benchmarks
  | 'PROPERTY_LINES'     // PL01–PL09: Boundary, easement, building line, ROW, flood, etc.
  | 'STRUCTURES'         // ST01–ST12: Buildings, walls, driveways, patios, pools
  | 'FENCES'             // FN01–FN15: All fence types
  | 'UTILITIES'          // UT01–UT30: Water, sewer, gas, electric, communication
  | 'VEGETATION'         // VG01–VG08: Trees, shrubs, hedges, edge of woods
  | 'TOPOGRAPHY'         // TP01–TP11: Ground shots, elevation, contours, water features
  | 'TRANSPORTATION'     // TR01–TR08: Centerlines, edges of pavement, curb, sidewalk
  | 'CURVES'             // CV01–CV10: PC, PT, PI, RP, MPC, POC, PCC, PRC, TS, ST
  | 'MISCELLANEOUS';     // MS01–MS10: Generic, temporary, reference

export interface PointCodeDefinition {
  alphaCode: string;                   // "FN03"
  numericCode: string;                 // "742"
  description: string;                 // "Chain Link Fence"

  category: CodeCategory;
  subcategory: string;                 // e.g., "Iron Rod" under BOUNDARY_CONTROL

  // Drawing behavior
  connectType: 'POINT' | 'LINE';      // Does this code connect in line strings?
  isAutoSpline: boolean;               // Auto-fit spline for natural features?

  // Default style assignments (Phase 3 uses these; Phase 2 stores them)
  defaultSymbolId: string;             // Symbol to render (e.g., "MON_IRF_CIRCLE")
  defaultLineTypeId: string;           // Line type (e.g., "FENCE_CHAIN_LINK")
  defaultColor: string;                // Hex color
  defaultLineWeight: number;           // mm
  defaultLayerId: string;              // Which layer this code maps to
  defaultLabelFormat: string;          // Label template: "{code}" or "{elevation}" etc.

  // Simplified export
  simplifiedCode: string;              // Base code for dad-mode (e.g., "309" for all 1/2" IR variants)
  simplifiedDescription: string;       // Simplified description
  collapses: boolean;                  // true if this code maps to a different simplified code

  // Monument action (only for BOUNDARY_CONTROL codes)
  monumentAction: MonumentAction | null;  // FOUND, SET, CALCULATED, or null for non-monument codes

  // Monument details (for BC codes)
  monumentSize: string | null;         // "3/8\"", "1/2\"", "5/8\"", "3/4\"", etc.
  monumentType: string | null;         // "Iron Rod", "Iron Pipe", "Concrete", "Cap/Disk", etc.

  // Metadata
  isBuiltIn: boolean;                  // Shipped with app (true) or user-created (false)
  isNew: boolean;                      // Was this added in the expanded system (not in dad's original)?
  notes: string;
}

// ─── LINE STRING ───

export interface LineString {
  id: string;
  codeBase: string;                    // The base code for this string
  pointIds: string[];                  // SurveyPoint IDs in order
  isClosed: boolean;                   // Last point connects to first
  segments: LineSegmentType[];         // Type per segment (between consecutive points)
  featureId: string | null;            // The Feature created from this line string
}

export type LineSegmentType = 'STRAIGHT' | 'ARC' | 'SPLINE';

// ─── POINT GROUP ───

export interface PointGroup {
  baseNumber: number;
  allPoints: SurveyPoint[];           // Every point in this group
  calculated: SurveyPoint[];          // calc, cald, cale, ...
  found: SurveyPoint | null;          // The found point (if any)
  set: SurveyPoint | null;            // The set point (if any)
  none: SurveyPoint[];                // Points with no suffix (just the number)

  // Resolved
  finalPoint: SurveyPoint;            // The one that gets drawn
  finalSource: 'SET' | 'FOUND' | 'CALCULATED' | 'NONE';  // Why this one was chosen

  // Quality metrics
  calcSetDelta: number | null;        // Distance between latest calc and set (feet)
  calcFoundDelta: number | null;      // Distance between latest calc and found (feet)
  hasBothCalcAndField: boolean;       // true if we have calc + (set or found)
  deltaWarning: boolean;              // true if delta exceeds threshold (0.10')
}

// ─── VALIDATION ───

export interface ValidationIssue {
  type: ValidationIssueType;
  severity: 'INFO' | 'WARNING' | 'ERROR';
  pointId: string;
  message: string;
  autoFixable: boolean;                // Can be resolved automatically
  autoFixAction?: string;              // Description of auto-fix
}

export type ValidationIssueType =
  | 'DUPLICATE_POINT_NUMBER'           // Two points have the same number
  | 'ZERO_COORDINATES'                 // Northing or easting is exactly 0
  | 'UNRECOGNIZED_CODE'                // Code not found in library
  | 'AMBIGUOUS_CODE'                   // Code matches multiple definitions
  | 'MISSING_ELEVATION'                // Elevation is null when expected
  | 'COORDINATE_OUTLIER'               // Point is far from the cluster centroid
  | 'DUPLICATE_COORDINATES'            // Two different points at the exact same location
  | 'ORPHAN_END_SUFFIX'               // E/EA suffix with no matching B/BA
  | 'ORPHAN_BEGIN_SUFFIX'             // B/BA with no corresponding E (line never ended)
  | 'SINGLE_POINT_LINE'               // Line code with only one point (no connection possible)
  | 'MIXED_CODES_IN_SEQUENCE'          // Adjacent points have same suffix position but different codes
  | 'NAME_SUFFIX_AMBIGUOUS'            // Point name suffix couldn't be matched with high confidence
  | 'CALC_WITHOUT_FIELD';             // Calculated point has no corresponding set or found
```

---

## 3. Master Point Code Library

The complete code library, organized by category. This ships as a static data file built into the app.

```typescript
// packages/codes/src/code-library.ts

import type { PointCodeDefinition, CodeCategory } from '@starr-cad/core';

export const MASTER_CODE_LIBRARY: PointCodeDefinition[] = [

  // ═══════════════════════════════════════════════════════════════
  // BOUNDARY CONTROL — Monuments (BC01–BC27)
  // ═══════════════════════════════════════════════════════════════

  // 3/8" Iron Rod
  { alphaCode: 'BC01', numericCode: '308', description: '3/8" Iron Rod Found',
    category: 'BOUNDARY_CONTROL', subcategory: 'Iron Rod',
    connectType: 'POINT', isAutoSpline: false,
    defaultSymbolId: 'MON_IR_038_FOUND', defaultLineTypeId: '', defaultColor: '#000000',
    defaultLineWeight: 0, defaultLayerId: 'BOUNDARY-MON', defaultLabelFormat: '3/8" IRF',
    simplifiedCode: '308', simplifiedDescription: '3/8" Iron Rod', collapses: false,
    monumentAction: 'FOUND', monumentSize: '3/8"', monumentType: 'Iron Rod',
    isBuiltIn: true, isNew: false, notes: '' },
  { alphaCode: 'BC33', numericCode: '315', description: '3/8" Iron Rod Set',
    category: 'BOUNDARY_CONTROL', subcategory: 'Iron Rod',
    connectType: 'POINT', isAutoSpline: false,
    defaultSymbolId: 'MON_IR_038_SET', defaultLineTypeId: '', defaultColor: '#FF0000',
    defaultLineWeight: 0, defaultLayerId: 'BOUNDARY-MON', defaultLabelFormat: '3/8" IRS',
    simplifiedCode: '308', simplifiedDescription: '3/8" Iron Rod', collapses: true,
    monumentAction: 'SET', monumentSize: '3/8"', monumentType: 'Iron Rod',
    isBuiltIn: true, isNew: true, notes: 'Expanded code — collapses to 308 in simplified export' },
  { alphaCode: 'BC09', numericCode: '327', description: '3/8" Iron Rod Calculated',
    category: 'BOUNDARY_CONTROL', subcategory: 'Iron Rod',
    connectType: 'POINT', isAutoSpline: false,
    defaultSymbolId: 'MON_IR_038_CALC', defaultLineTypeId: '', defaultColor: '#FF00FF',
    defaultLineWeight: 0, defaultLayerId: 'BOUNDARY-MON', defaultLabelFormat: '3/8" IRC',
    simplifiedCode: '308', simplifiedDescription: '3/8" Iron Rod', collapses: true,
    monumentAction: 'CALCULATED', monumentSize: '3/8"', monumentType: 'Iron Rod',
    isBuiltIn: true, isNew: true, notes: 'Expanded code — collapses to 308' },

  // 1/2" Iron Rod
  { alphaCode: 'BC02', numericCode: '309', description: '1/2" Iron Rod Found',
    category: 'BOUNDARY_CONTROL', subcategory: 'Iron Rod',
    connectType: 'POINT', isAutoSpline: false,
    defaultSymbolId: 'MON_IR_050_FOUND', defaultLineTypeId: '', defaultColor: '#000000',
    defaultLineWeight: 0, defaultLayerId: 'BOUNDARY-MON', defaultLabelFormat: '1/2" IRF',
    simplifiedCode: '309', simplifiedDescription: '1/2" Iron Rod', collapses: false,
    monumentAction: 'FOUND', monumentSize: '1/2"', monumentType: 'Iron Rod',
    isBuiltIn: true, isNew: false, notes: 'Most common rod size in Bell County' },
  { alphaCode: 'BC06', numericCode: '317', description: '1/2" Iron Rod Set',
    category: 'BOUNDARY_CONTROL', subcategory: 'Iron Rod',
    connectType: 'POINT', isAutoSpline: false,
    defaultSymbolId: 'MON_IR_050_SET', defaultLineTypeId: '', defaultColor: '#FF0000',
    defaultLineWeight: 0, defaultLayerId: 'BOUNDARY-MON', defaultLabelFormat: '1/2" IRS',
    simplifiedCode: '309', simplifiedDescription: '1/2" Iron Rod', collapses: true,
    monumentAction: 'SET', monumentSize: '1/2"', monumentType: 'Iron Rod',
    isBuiltIn: true, isNew: true, notes: 'Collapses to 309' },
  { alphaCode: 'BC10', numericCode: '328', description: '1/2" Iron Rod Calculated',
    category: 'BOUNDARY_CONTROL', subcategory: 'Iron Rod',
    connectType: 'POINT', isAutoSpline: false,
    defaultSymbolId: 'MON_IR_050_CALC', defaultLineTypeId: '', defaultColor: '#FF00FF',
    defaultLineWeight: 0, defaultLayerId: 'BOUNDARY-MON', defaultLabelFormat: '1/2" IRC',
    simplifiedCode: '309', simplifiedDescription: '1/2" Iron Rod', collapses: true,
    monumentAction: 'CALCULATED', monumentSize: '1/2"', monumentType: 'Iron Rod',
    isBuiltIn: true, isNew: true, notes: 'Collapses to 309' },

  // 5/8" Iron Rod
  { alphaCode: 'BC03', numericCode: '310', description: '5/8" Iron Rod Found',
    category: 'BOUNDARY_CONTROL', subcategory: 'Iron Rod',
    connectType: 'POINT', isAutoSpline: false,
    defaultSymbolId: 'MON_IR_058_FOUND', defaultLineTypeId: '', defaultColor: '#000000',
    defaultLineWeight: 0, defaultLayerId: 'BOUNDARY-MON', defaultLabelFormat: '5/8" IRF',
    simplifiedCode: '310', simplifiedDescription: '5/8" Iron Rod', collapses: false,
    monumentAction: 'FOUND', monumentSize: '5/8"', monumentType: 'Iron Rod',
    isBuiltIn: true, isNew: false, notes: '' },
  { alphaCode: 'BC07', numericCode: '318', description: '5/8" Iron Rod Set',
    category: 'BOUNDARY_CONTROL', subcategory: 'Iron Rod',
    connectType: 'POINT', isAutoSpline: false,
    defaultSymbolId: 'MON_IR_058_SET', defaultLineTypeId: '', defaultColor: '#FF0000',
    defaultLineWeight: 0, defaultLayerId: 'BOUNDARY-MON', defaultLabelFormat: '5/8" IRS',
    simplifiedCode: '310', simplifiedDescription: '5/8" Iron Rod', collapses: true,
    monumentAction: 'SET', monumentSize: '5/8"', monumentType: 'Iron Rod',
    isBuiltIn: true, isNew: true, notes: '' },
  { alphaCode: 'BC11', numericCode: '329', description: '5/8" Iron Rod Calculated',
    category: 'BOUNDARY_CONTROL', subcategory: 'Iron Rod',
    connectType: 'POINT', isAutoSpline: false,
    defaultSymbolId: 'MON_IR_058_CALC', defaultLineTypeId: '', defaultColor: '#FF00FF',
    defaultLineWeight: 0, defaultLayerId: 'BOUNDARY-MON', defaultLabelFormat: '5/8" IRC',
    simplifiedCode: '310', simplifiedDescription: '5/8" Iron Rod', collapses: true,
    monumentAction: 'CALCULATED', monumentSize: '5/8"', monumentType: 'Iron Rod',
    isBuiltIn: true, isNew: true, notes: '' },

  // 3/4" Iron Rod
  { alphaCode: 'BC04', numericCode: '311', description: '3/4" Iron Rod Found',
    category: 'BOUNDARY_CONTROL', subcategory: 'Iron Rod',
    connectType: 'POINT', isAutoSpline: false,
    defaultSymbolId: 'MON_IR_075_FOUND', defaultLineTypeId: '', defaultColor: '#000000',
    defaultLineWeight: 0, defaultLayerId: 'BOUNDARY-MON', defaultLabelFormat: '3/4" IRF',
    simplifiedCode: '311', simplifiedDescription: '3/4" Iron Rod', collapses: false,
    monumentAction: 'FOUND', monumentSize: '3/4"', monumentType: 'Iron Rod',
    isBuiltIn: true, isNew: false, notes: '' },
  { alphaCode: 'BC08', numericCode: '319', description: '3/4" Iron Rod Set',
    category: 'BOUNDARY_CONTROL', subcategory: 'Iron Rod',
    connectType: 'POINT', isAutoSpline: false,
    defaultSymbolId: 'MON_IR_075_SET', defaultLineTypeId: '', defaultColor: '#FF0000',
    defaultLineWeight: 0, defaultLayerId: 'BOUNDARY-MON', defaultLabelFormat: '3/4" IRS',
    simplifiedCode: '311', simplifiedDescription: '3/4" Iron Rod', collapses: true,
    monumentAction: 'SET', monumentSize: '3/4"', monumentType: 'Iron Rod',
    isBuiltIn: true, isNew: true, notes: '' },
  { alphaCode: 'BC12', numericCode: '330', description: '3/4" Iron Rod Calculated',
    category: 'BOUNDARY_CONTROL', subcategory: 'Iron Rod',
    connectType: 'POINT', isAutoSpline: false,
    defaultSymbolId: 'MON_IR_075_CALC', defaultLineTypeId: '', defaultColor: '#FF00FF',
    defaultLineWeight: 0, defaultLayerId: 'BOUNDARY-MON', defaultLabelFormat: '3/4" IRC',
    simplifiedCode: '311', simplifiedDescription: '3/4" Iron Rod', collapses: true,
    monumentAction: 'CALCULATED', monumentSize: '3/4"', monumentType: 'Iron Rod',
    isBuiltIn: true, isNew: true, notes: '' },

  // Iron Pipe
  { alphaCode: 'BC13', numericCode: '312', description: 'Iron Pipe Found',
    category: 'BOUNDARY_CONTROL', subcategory: 'Iron Pipe',
    connectType: 'POINT', isAutoSpline: false,
    defaultSymbolId: 'MON_IP_FOUND', defaultLineTypeId: '', defaultColor: '#000000',
    defaultLineWeight: 0, defaultLayerId: 'BOUNDARY-MON', defaultLabelFormat: 'IPF',
    simplifiedCode: '312', simplifiedDescription: 'Iron Pipe', collapses: false,
    monumentAction: 'FOUND', monumentSize: null, monumentType: 'Iron Pipe',
    isBuiltIn: true, isNew: false, notes: '' },
  { alphaCode: 'BC14', numericCode: '331', description: 'Iron Pipe Set',
    category: 'BOUNDARY_CONTROL', subcategory: 'Iron Pipe',
    connectType: 'POINT', isAutoSpline: false,
    defaultSymbolId: 'MON_IP_SET', defaultLineTypeId: '', defaultColor: '#FF0000',
    defaultLineWeight: 0, defaultLayerId: 'BOUNDARY-MON', defaultLabelFormat: 'IPS',
    simplifiedCode: '312', simplifiedDescription: 'Iron Pipe', collapses: true,
    monumentAction: 'SET', monumentSize: null, monumentType: 'Iron Pipe',
    isBuiltIn: true, isNew: true, notes: '' },
  { alphaCode: 'BC15', numericCode: '332', description: 'Iron Pipe Calculated',
    category: 'BOUNDARY_CONTROL', subcategory: 'Iron Pipe',
    connectType: 'POINT', isAutoSpline: false,
    defaultSymbolId: 'MON_IP_CALC', defaultLineTypeId: '', defaultColor: '#FF00FF',
    defaultLineWeight: 0, defaultLayerId: 'BOUNDARY-MON', defaultLabelFormat: 'IPC',
    simplifiedCode: '312', simplifiedDescription: 'Iron Pipe', collapses: true,
    monumentAction: 'CALCULATED', monumentSize: null, monumentType: 'Iron Pipe',
    isBuiltIn: true, isNew: true, notes: '' },

  // Concrete Monument
  { alphaCode: 'BC16', numericCode: '313', description: 'Concrete Monument Found',
    category: 'BOUNDARY_CONTROL', subcategory: 'Concrete',
    connectType: 'POINT', isAutoSpline: false,
    defaultSymbolId: 'MON_CONC_FOUND', defaultLineTypeId: '', defaultColor: '#000000',
    defaultLineWeight: 0, defaultLayerId: 'BOUNDARY-MON', defaultLabelFormat: 'CMF',
    simplifiedCode: '313', simplifiedDescription: 'Concrete Monument', collapses: false,
    monumentAction: 'FOUND', monumentSize: null, monumentType: 'Concrete',
    isBuiltIn: true, isNew: false, notes: '' },
  { alphaCode: 'BC17', numericCode: '333', description: 'Concrete Monument Set',
    category: 'BOUNDARY_CONTROL', subcategory: 'Concrete',
    connectType: 'POINT', isAutoSpline: false,
    defaultSymbolId: 'MON_CONC_SET', defaultLineTypeId: '', defaultColor: '#FF0000',
    defaultLineWeight: 0, defaultLayerId: 'BOUNDARY-MON', defaultLabelFormat: 'CMS',
    simplifiedCode: '313', simplifiedDescription: 'Concrete Monument', collapses: true,
    monumentAction: 'SET', monumentSize: null, monumentType: 'Concrete',
    isBuiltIn: true, isNew: true, notes: '' },
  { alphaCode: 'BC18', numericCode: '334', description: 'Concrete Monument Calculated',
    category: 'BOUNDARY_CONTROL', subcategory: 'Concrete',
    connectType: 'POINT', isAutoSpline: false,
    defaultSymbolId: 'MON_CONC_CALC', defaultLineTypeId: '', defaultColor: '#FF00FF',
    defaultLineWeight: 0, defaultLayerId: 'BOUNDARY-MON', defaultLabelFormat: 'CMC',
    simplifiedCode: '313', simplifiedDescription: 'Concrete Monument', collapses: true,
    monumentAction: 'CALCULATED', monumentSize: null, monumentType: 'Concrete',
    isBuiltIn: true, isNew: true, notes: '' },

  // Cap/Disk, PK Nail, Mag Nail, Railroad Spike, Witness Post
  { alphaCode: 'BC19', numericCode: '314', description: 'Cap/Disk Found', category: 'BOUNDARY_CONTROL', subcategory: 'Cap/Disk', connectType: 'POINT', isAutoSpline: false, defaultSymbolId: 'MON_CAP_FOUND', defaultLineTypeId: '', defaultColor: '#000000', defaultLineWeight: 0, defaultLayerId: 'BOUNDARY-MON', defaultLabelFormat: 'C/D F', simplifiedCode: '314', simplifiedDescription: 'Cap/Disk', collapses: false, monumentAction: 'FOUND', monumentSize: null, monumentType: 'Cap/Disk', isBuiltIn: true, isNew: false, notes: '' },
  { alphaCode: 'BC20', numericCode: '335', description: 'Cap/Disk Set', category: 'BOUNDARY_CONTROL', subcategory: 'Cap/Disk', connectType: 'POINT', isAutoSpline: false, defaultSymbolId: 'MON_CAP_SET', defaultLineTypeId: '', defaultColor: '#FF0000', defaultLineWeight: 0, defaultLayerId: 'BOUNDARY-MON', defaultLabelFormat: 'C/D S', simplifiedCode: '314', simplifiedDescription: 'Cap/Disk', collapses: true, monumentAction: 'SET', monumentSize: null, monumentType: 'Cap/Disk', isBuiltIn: true, isNew: true, notes: '' },
  { alphaCode: 'BC21', numericCode: '336', description: 'Cap/Disk Calculated', category: 'BOUNDARY_CONTROL', subcategory: 'Cap/Disk', connectType: 'POINT', isAutoSpline: false, defaultSymbolId: 'MON_CAP_CALC', defaultLineTypeId: '', defaultColor: '#FF00FF', defaultLineWeight: 0, defaultLayerId: 'BOUNDARY-MON', defaultLabelFormat: 'C/D C', simplifiedCode: '314', simplifiedDescription: 'Cap/Disk', collapses: true, monumentAction: 'CALCULATED', monumentSize: null, monumentType: 'Cap/Disk', isBuiltIn: true, isNew: true, notes: '' },

  { alphaCode: 'BC22', numericCode: '338', description: 'PK Nail Found', category: 'BOUNDARY_CONTROL', subcategory: 'PK Nail', connectType: 'POINT', isAutoSpline: false, defaultSymbolId: 'MON_PKNAIL_FOUND', defaultLineTypeId: '', defaultColor: '#000000', defaultLineWeight: 0, defaultLayerId: 'BOUNDARY-MON', defaultLabelFormat: 'PKN F', simplifiedCode: '338', simplifiedDescription: 'PK Nail', collapses: false, monumentAction: 'FOUND', monumentSize: null, monumentType: 'PK Nail', isBuiltIn: true, isNew: false, notes: '' },
  { alphaCode: 'BC23', numericCode: '339', description: 'PK Nail Set', category: 'BOUNDARY_CONTROL', subcategory: 'PK Nail', connectType: 'POINT', isAutoSpline: false, defaultSymbolId: 'MON_PKNAIL_SET', defaultLineTypeId: '', defaultColor: '#FF0000', defaultLineWeight: 0, defaultLayerId: 'BOUNDARY-MON', defaultLabelFormat: 'PKN S', simplifiedCode: '338', simplifiedDescription: 'PK Nail', collapses: true, monumentAction: 'SET', monumentSize: null, monumentType: 'PK Nail', isBuiltIn: true, isNew: true, notes: '' },

  { alphaCode: 'BC24', numericCode: '340', description: 'Mag Nail Found', category: 'BOUNDARY_CONTROL', subcategory: 'Mag Nail', connectType: 'POINT', isAutoSpline: false, defaultSymbolId: 'MON_MAGNAIL_FOUND', defaultLineTypeId: '', defaultColor: '#000000', defaultLineWeight: 0, defaultLayerId: 'BOUNDARY-MON', defaultLabelFormat: 'MN F', simplifiedCode: '340', simplifiedDescription: 'Mag Nail', collapses: false, monumentAction: 'FOUND', monumentSize: null, monumentType: 'Mag Nail', isBuiltIn: true, isNew: false, notes: '' },
  { alphaCode: 'BC25', numericCode: '345', description: 'Mag Nail Set', category: 'BOUNDARY_CONTROL', subcategory: 'Mag Nail', connectType: 'POINT', isAutoSpline: false, defaultSymbolId: 'MON_MAGNAIL_SET', defaultLineTypeId: '', defaultColor: '#FF0000', defaultLineWeight: 0, defaultLayerId: 'BOUNDARY-MON', defaultLabelFormat: 'MN S', simplifiedCode: '340', simplifiedDescription: 'Mag Nail', collapses: true, monumentAction: 'SET', monumentSize: null, monumentType: 'Mag Nail', isBuiltIn: true, isNew: true, notes: '' },

  { alphaCode: 'BC26', numericCode: '341', description: 'Railroad Spike', category: 'BOUNDARY_CONTROL', subcategory: 'Spike', connectType: 'POINT', isAutoSpline: false, defaultSymbolId: 'MON_RRSPIKE', defaultLineTypeId: '', defaultColor: '#000000', defaultLineWeight: 0, defaultLayerId: 'BOUNDARY-MON', defaultLabelFormat: 'RR Spike', simplifiedCode: '341', simplifiedDescription: 'Railroad Spike', collapses: false, monumentAction: null, monumentSize: null, monumentType: 'Railroad Spike', isBuiltIn: true, isNew: true, notes: '' },
  { alphaCode: 'BC27', numericCode: '342', description: 'Witness Post', category: 'BOUNDARY_CONTROL', subcategory: 'Witness', connectType: 'POINT', isAutoSpline: false, defaultSymbolId: 'MON_WITNESS', defaultLineTypeId: '', defaultColor: '#008000', defaultLineWeight: 0, defaultLayerId: 'BOUNDARY-MON', defaultLabelFormat: 'WP', simplifiedCode: '342', simplifiedDescription: 'Witness Post', collapses: false, monumentAction: null, monumentSize: null, monumentType: 'Witness Post', isBuiltIn: true, isNew: true, notes: '' },
  { alphaCode: 'BC05', numericCode: '316', description: 'Fence Corner Post', category: 'BOUNDARY_CONTROL', subcategory: 'Fence Post', connectType: 'POINT', isAutoSpline: false, defaultSymbolId: 'MON_FENCEPOST', defaultLineTypeId: '', defaultColor: '#000000', defaultLineWeight: 0, defaultLayerId: 'BOUNDARY-MON', defaultLabelFormat: 'FCP', simplifiedCode: '316', simplifiedDescription: 'Fence Corner Post', collapses: false, monumentAction: 'FOUND', monumentSize: null, monumentType: 'Fence Post', isBuiltIn: true, isNew: false, notes: '' },

  // ═══════════════════════════════════════════════════════════════
  // SURVEY CONTROL (SC01–SC06)
  // ═══════════════════════════════════════════════════════════════
  { alphaCode: 'SC01', numericCode: '300', description: 'Control Point', category: 'SURVEY_CONTROL', subcategory: 'Control', connectType: 'POINT', isAutoSpline: false, defaultSymbolId: 'CTRL_TRIANGLE', defaultLineTypeId: '', defaultColor: '#FF0000', defaultLineWeight: 0, defaultLayerId: 'CONTROL', defaultLabelFormat: 'CP {num}', simplifiedCode: '300', simplifiedDescription: 'Control Point', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: '' },
  { alphaCode: 'SC02', numericCode: '301', description: 'Benchmark', category: 'SURVEY_CONTROL', subcategory: 'Benchmark', connectType: 'POINT', isAutoSpline: false, defaultSymbolId: 'CTRL_BENCHMARK', defaultLineTypeId: '', defaultColor: '#FF0000', defaultLineWeight: 0, defaultLayerId: 'CONTROL', defaultLabelFormat: 'BM {num}', simplifiedCode: '301', simplifiedDescription: 'Benchmark', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: '' },
  { alphaCode: 'SC03', numericCode: '302', description: 'GPS Base Point', category: 'SURVEY_CONTROL', subcategory: 'GPS', connectType: 'POINT', isAutoSpline: false, defaultSymbolId: 'CTRL_GPS', defaultLineTypeId: '', defaultColor: '#FF0000', defaultLineWeight: 0, defaultLayerId: 'CONTROL', defaultLabelFormat: 'GPS {num}', simplifiedCode: '302', simplifiedDescription: 'GPS Base', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: '' },
  { alphaCode: 'SC04', numericCode: '303', description: 'Traverse Point', category: 'SURVEY_CONTROL', subcategory: 'Traverse', connectType: 'POINT', isAutoSpline: false, defaultSymbolId: 'CTRL_TRAVERSE', defaultLineTypeId: '', defaultColor: '#FF0000', defaultLineWeight: 0, defaultLayerId: 'CONTROL', defaultLabelFormat: 'TP {num}', simplifiedCode: '303', simplifiedDescription: 'Traverse Point', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: '' },
  { alphaCode: 'SC05', numericCode: '304', description: 'Reference Point', category: 'SURVEY_CONTROL', subcategory: 'Reference', connectType: 'POINT', isAutoSpline: false, defaultSymbolId: 'CTRL_REFERENCE', defaultLineTypeId: '', defaultColor: '#FF0000', defaultLineWeight: 0, defaultLayerId: 'CONTROL', defaultLabelFormat: 'REF {num}', simplifiedCode: '304', simplifiedDescription: 'Reference Point', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: '' },
  { alphaCode: 'SC06', numericCode: '305', description: 'Temporary Benchmark', category: 'SURVEY_CONTROL', subcategory: 'Benchmark', connectType: 'POINT', isAutoSpline: false, defaultSymbolId: 'CTRL_TBM', defaultLineTypeId: '', defaultColor: '#FF0000', defaultLineWeight: 0, defaultLayerId: 'CONTROL', defaultLabelFormat: 'TBM {num}', simplifiedCode: '305', simplifiedDescription: 'Temp Benchmark', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: '' },

  // ═══════════════════════════════════════════════════════════════
  // PROPERTY LINES (PL01–PL09) — LINE codes
  // ═══════════════════════════════════════════════════════════════
  { alphaCode: 'PL01', numericCode: '350', description: 'Property/Boundary Line', category: 'PROPERTY_LINES', subcategory: 'Boundary', connectType: 'LINE', isAutoSpline: false, defaultSymbolId: '', defaultLineTypeId: 'SOLID', defaultColor: '#000000', defaultLineWeight: 0.35, defaultLayerId: 'BOUNDARY', defaultLabelFormat: '', simplifiedCode: '350', simplifiedDescription: 'Boundary Line', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: 'Primary boundary — thickest line' },
  { alphaCode: 'PL02', numericCode: '351', description: 'Easement Line', category: 'PROPERTY_LINES', subcategory: 'Easement', connectType: 'LINE', isAutoSpline: false, defaultSymbolId: '', defaultLineTypeId: 'DASHED', defaultColor: '#000000', defaultLineWeight: 0.25, defaultLayerId: 'EASEMENT', defaultLabelFormat: '', simplifiedCode: '351', simplifiedDescription: 'Easement', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: '' },
  { alphaCode: 'PL03', numericCode: '352', description: 'Building Setback Line', category: 'PROPERTY_LINES', subcategory: 'Building Line', connectType: 'LINE', isAutoSpline: false, defaultSymbolId: '', defaultLineTypeId: 'DASH_DOT', defaultColor: '#808080', defaultLineWeight: 0.18, defaultLayerId: 'BUILDING-LINE', defaultLabelFormat: 'BSL', simplifiedCode: '352', simplifiedDescription: 'Building Line', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: '' },
  { alphaCode: 'PL04', numericCode: '353', description: 'Right-of-Way Line', category: 'PROPERTY_LINES', subcategory: 'ROW', connectType: 'LINE', isAutoSpline: false, defaultSymbolId: '', defaultLineTypeId: 'SOLID', defaultColor: '#000000', defaultLineWeight: 0.30, defaultLayerId: 'ROW', defaultLabelFormat: 'ROW', simplifiedCode: '353', simplifiedDescription: 'ROW', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: '' },
  { alphaCode: 'PL05', numericCode: '354', description: 'Centerline', category: 'PROPERTY_LINES', subcategory: 'Centerline', connectType: 'LINE', isAutoSpline: false, defaultSymbolId: '', defaultLineTypeId: 'CENTER', defaultColor: '#808080', defaultLineWeight: 0.18, defaultLayerId: 'ROW', defaultLabelFormat: 'CL', simplifiedCode: '354', simplifiedDescription: 'Centerline', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: '' },
  { alphaCode: 'PL06', numericCode: '355', description: 'Lot Line', category: 'PROPERTY_LINES', subcategory: 'Lot', connectType: 'LINE', isAutoSpline: false, defaultSymbolId: '', defaultLineTypeId: 'SOLID', defaultColor: '#000000', defaultLineWeight: 0.25, defaultLayerId: 'BOUNDARY', defaultLabelFormat: '', simplifiedCode: '355', simplifiedDescription: 'Lot Line', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: '' },
  { alphaCode: 'PL07', numericCode: '356', description: 'Flood Zone Line', category: 'PROPERTY_LINES', subcategory: 'Flood', connectType: 'LINE', isAutoSpline: false, defaultSymbolId: '', defaultLineTypeId: 'DASHED', defaultColor: '#0000FF', defaultLineWeight: 0.25, defaultLayerId: 'FLOOD', defaultLabelFormat: 'FZ', simplifiedCode: '356', simplifiedDescription: 'Flood Zone', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: '' },
  { alphaCode: 'PL08', numericCode: '357', description: 'Contour Major', category: 'PROPERTY_LINES', subcategory: 'Contour', connectType: 'LINE', isAutoSpline: true, defaultSymbolId: '', defaultLineTypeId: 'SOLID', defaultColor: '#8B4513', defaultLineWeight: 0.25, defaultLayerId: 'TOPO', defaultLabelFormat: '{elevation}', simplifiedCode: '357', simplifiedDescription: 'Contour Major', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: 'Auto-spline' },
  { alphaCode: 'PL09', numericCode: '358', description: 'Contour Minor', category: 'PROPERTY_LINES', subcategory: 'Contour', connectType: 'LINE', isAutoSpline: true, defaultSymbolId: '', defaultLineTypeId: 'SOLID', defaultColor: '#8B4513', defaultLineWeight: 0.13, defaultLayerId: 'TOPO', defaultLabelFormat: '{elevation}', simplifiedCode: '358', simplifiedDescription: 'Contour Minor', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: 'Auto-spline' },

  // ═══════════════════════════════════════════════════════════════
  // FENCES (FN01–FN15) — LINE codes with inline symbols
  // ═══════════════════════════════════════════════════════════════
  { alphaCode: 'FN01', numericCode: '740', description: 'Barbed Wire Fence', category: 'FENCES', subcategory: 'Wire', connectType: 'LINE', isAutoSpline: false, defaultSymbolId: '', defaultLineTypeId: 'FENCE_BARBED_WIRE', defaultColor: '#000000', defaultLineWeight: 0.25, defaultLayerId: 'FENCE', defaultLabelFormat: 'BW', simplifiedCode: '740', simplifiedDescription: 'Barbed Wire', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: '' },
  { alphaCode: 'FN02', numericCode: '741', description: 'Woven Wire Fence', category: 'FENCES', subcategory: 'Wire', connectType: 'LINE', isAutoSpline: false, defaultSymbolId: '', defaultLineTypeId: 'FENCE_WOVEN_WIRE', defaultColor: '#000000', defaultLineWeight: 0.25, defaultLayerId: 'FENCE', defaultLabelFormat: 'WW', simplifiedCode: '741', simplifiedDescription: 'Woven Wire', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: '' },
  { alphaCode: 'FN03', numericCode: '742', description: 'Chain Link Fence', category: 'FENCES', subcategory: 'Metal', connectType: 'LINE', isAutoSpline: false, defaultSymbolId: '', defaultLineTypeId: 'FENCE_CHAIN_LINK', defaultColor: '#000000', defaultLineWeight: 0.25, defaultLayerId: 'FENCE', defaultLabelFormat: 'CLF', simplifiedCode: '742', simplifiedDescription: 'Chain Link', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: '' },
  { alphaCode: 'FN04', numericCode: '743', description: 'Metal/Iron Fence', category: 'FENCES', subcategory: 'Metal', connectType: 'LINE', isAutoSpline: false, defaultSymbolId: '', defaultLineTypeId: 'FENCE_METAL_IRON', defaultColor: '#000000', defaultLineWeight: 0.25, defaultLayerId: 'FENCE', defaultLabelFormat: 'MF', simplifiedCode: '743', simplifiedDescription: 'Metal Fence', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: '' },
  { alphaCode: 'FN05', numericCode: '744', description: 'Wood Privacy Fence', category: 'FENCES', subcategory: 'Wood', connectType: 'LINE', isAutoSpline: false, defaultSymbolId: '', defaultLineTypeId: 'FENCE_WOOD_PRIVACY', defaultColor: '#000000', defaultLineWeight: 0.25, defaultLayerId: 'FENCE', defaultLabelFormat: 'WPF', simplifiedCode: '744', simplifiedDescription: 'Wood Privacy', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: '' },
  { alphaCode: 'FN06', numericCode: '745', description: 'Wood Picket Fence', category: 'FENCES', subcategory: 'Wood', connectType: 'LINE', isAutoSpline: false, defaultSymbolId: '', defaultLineTypeId: 'FENCE_WOOD_PICKET', defaultColor: '#000000', defaultLineWeight: 0.25, defaultLayerId: 'FENCE', defaultLabelFormat: 'WK', simplifiedCode: '745', simplifiedDescription: 'Wood Picket', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: '' },
  { alphaCode: 'FN07', numericCode: '746', description: 'Split Rail Fence', category: 'FENCES', subcategory: 'Wood', connectType: 'LINE', isAutoSpline: false, defaultSymbolId: '', defaultLineTypeId: 'FENCE_SPLIT_RAIL', defaultColor: '#000000', defaultLineWeight: 0.25, defaultLayerId: 'FENCE', defaultLabelFormat: 'SR', simplifiedCode: '746', simplifiedDescription: 'Split Rail', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: '' },
  { alphaCode: 'FN08', numericCode: '747', description: 'Block/Masonry Wall', category: 'FENCES', subcategory: 'Wall', connectType: 'LINE', isAutoSpline: false, defaultSymbolId: '', defaultLineTypeId: 'FENCE_BLOCK_WALL', defaultColor: '#000000', defaultLineWeight: 0.35, defaultLayerId: 'FENCE', defaultLabelFormat: 'BLK', simplifiedCode: '747', simplifiedDescription: 'Block Wall', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: '' },
  { alphaCode: 'FN09', numericCode: '748', description: 'Pipe Fence', category: 'FENCES', subcategory: 'Metal', connectType: 'LINE', isAutoSpline: false, defaultSymbolId: '', defaultLineTypeId: 'FENCE_PIPE', defaultColor: '#000000', defaultLineWeight: 0.25, defaultLayerId: 'FENCE', defaultLabelFormat: 'PF', simplifiedCode: '748', simplifiedDescription: 'Pipe Fence', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: '' },
  { alphaCode: 'FN10', numericCode: '749', description: 'Cable Fence', category: 'FENCES', subcategory: 'Wire', connectType: 'LINE', isAutoSpline: false, defaultSymbolId: '', defaultLineTypeId: 'FENCE_CABLE', defaultColor: '#000000', defaultLineWeight: 0.25, defaultLayerId: 'FENCE', defaultLabelFormat: 'CF', simplifiedCode: '749', simplifiedDescription: 'Cable Fence', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: '' },
  { alphaCode: 'FN11', numericCode: '750', description: 'Electric Fence', category: 'FENCES', subcategory: 'Wire', connectType: 'LINE', isAutoSpline: false, defaultSymbolId: '', defaultLineTypeId: 'FENCE_ELECTRIC', defaultColor: '#FF0000', defaultLineWeight: 0.25, defaultLayerId: 'FENCE', defaultLabelFormat: 'EF', simplifiedCode: '750', simplifiedDescription: 'Electric Fence', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: '' },
  { alphaCode: 'FN12', numericCode: '751', description: 'Guardrail', category: 'FENCES', subcategory: 'Metal', connectType: 'LINE', isAutoSpline: false, defaultSymbolId: '', defaultLineTypeId: 'FENCE_GUARDRAIL', defaultColor: '#808080', defaultLineWeight: 0.30, defaultLayerId: 'FENCE', defaultLabelFormat: 'GR', simplifiedCode: '751', simplifiedDescription: 'Guardrail', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: '' },
  { alphaCode: 'FN13', numericCode: '752', description: 'Retaining Wall', category: 'FENCES', subcategory: 'Wall', connectType: 'LINE', isAutoSpline: false, defaultSymbolId: '', defaultLineTypeId: 'RETAINING_WALL', defaultColor: '#000000', defaultLineWeight: 0.35, defaultLayerId: 'FENCE', defaultLabelFormat: 'RW', simplifiedCode: '752', simplifiedDescription: 'Retaining Wall', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: '' },
  { alphaCode: 'FN14', numericCode: '753', description: 'Hedge/Living Fence', category: 'FENCES', subcategory: 'Natural', connectType: 'LINE', isAutoSpline: true, defaultSymbolId: '', defaultLineTypeId: 'HEDGE', defaultColor: '#008000', defaultLineWeight: 0.25, defaultLayerId: 'FENCE', defaultLabelFormat: 'HDG', simplifiedCode: '753', simplifiedDescription: 'Hedge', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: 'Auto-spline' },
  { alphaCode: 'FN15', numericCode: '754', description: 'Fence (Generic/Unknown)', category: 'FENCES', subcategory: 'Generic', connectType: 'LINE', isAutoSpline: false, defaultSymbolId: '', defaultLineTypeId: 'DASHED', defaultColor: '#000000', defaultLineWeight: 0.25, defaultLayerId: 'FENCE', defaultLabelFormat: 'FNC', simplifiedCode: '754', simplifiedDescription: 'Fence Generic', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: '' },

  // ═══════════════════════════════════════════════════════════════
  // STRUCTURES (ST01–ST12) — mostly LINE codes
  // ═══════════════════════════════════════════════════════════════
  { alphaCode: 'ST01', numericCode: '500', description: 'Building/House', category: 'STRUCTURES', subcategory: 'Building', connectType: 'LINE', isAutoSpline: false, defaultSymbolId: '', defaultLineTypeId: 'SOLID', defaultColor: '#000000', defaultLineWeight: 0.25, defaultLayerId: 'STRUCTURES', defaultLabelFormat: '', simplifiedCode: '500', simplifiedDescription: 'Building', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: '' },
  { alphaCode: 'ST02', numericCode: '501', description: 'Garage/Carport', category: 'STRUCTURES', subcategory: 'Building', connectType: 'LINE', isAutoSpline: false, defaultSymbolId: '', defaultLineTypeId: 'SOLID', defaultColor: '#000000', defaultLineWeight: 0.25, defaultLayerId: 'STRUCTURES', defaultLabelFormat: 'GAR', simplifiedCode: '501', simplifiedDescription: 'Garage', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: '' },
  { alphaCode: 'ST03', numericCode: '502', description: 'Shed/Outbuilding', category: 'STRUCTURES', subcategory: 'Building', connectType: 'LINE', isAutoSpline: false, defaultSymbolId: '', defaultLineTypeId: 'SOLID', defaultColor: '#000000', defaultLineWeight: 0.25, defaultLayerId: 'STRUCTURES', defaultLabelFormat: 'SHED', simplifiedCode: '502', simplifiedDescription: 'Shed', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: '' },
  { alphaCode: 'ST04', numericCode: '503', description: 'Driveway', category: 'STRUCTURES', subcategory: 'Paving', connectType: 'LINE', isAutoSpline: false, defaultSymbolId: '', defaultLineTypeId: 'SOLID', defaultColor: '#808080', defaultLineWeight: 0.18, defaultLayerId: 'STRUCTURES', defaultLabelFormat: 'DWY', simplifiedCode: '503', simplifiedDescription: 'Driveway', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: '' },
  { alphaCode: 'ST05', numericCode: '504', description: 'Sidewalk', category: 'STRUCTURES', subcategory: 'Paving', connectType: 'LINE', isAutoSpline: false, defaultSymbolId: '', defaultLineTypeId: 'SOLID', defaultColor: '#808080', defaultLineWeight: 0.18, defaultLayerId: 'STRUCTURES', defaultLabelFormat: 'SW', simplifiedCode: '504', simplifiedDescription: 'Sidewalk', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: '' },
  { alphaCode: 'ST06', numericCode: '505', description: 'Patio/Deck', category: 'STRUCTURES', subcategory: 'Paving', connectType: 'LINE', isAutoSpline: false, defaultSymbolId: '', defaultLineTypeId: 'SOLID', defaultColor: '#808080', defaultLineWeight: 0.18, defaultLayerId: 'STRUCTURES', defaultLabelFormat: 'PAT', simplifiedCode: '505', simplifiedDescription: 'Patio', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: '' },
  { alphaCode: 'ST07', numericCode: '506', description: 'Pool', category: 'STRUCTURES', subcategory: 'Water', connectType: 'LINE', isAutoSpline: false, defaultSymbolId: '', defaultLineTypeId: 'SOLID', defaultColor: '#0000FF', defaultLineWeight: 0.25, defaultLayerId: 'STRUCTURES', defaultLabelFormat: 'POOL', simplifiedCode: '506', simplifiedDescription: 'Pool', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: '' },
  { alphaCode: 'ST08', numericCode: '507', description: 'Retaining Wall (structural)', category: 'STRUCTURES', subcategory: 'Wall', connectType: 'LINE', isAutoSpline: false, defaultSymbolId: '', defaultLineTypeId: 'RETAINING_WALL', defaultColor: '#000000', defaultLineWeight: 0.35, defaultLayerId: 'STRUCTURES', defaultLabelFormat: 'RW', simplifiedCode: '507', simplifiedDescription: 'Ret Wall', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: '' },
  { alphaCode: 'ST09', numericCode: '508', description: 'A/C Unit', category: 'STRUCTURES', subcategory: 'Mechanical', connectType: 'POINT', isAutoSpline: false, defaultSymbolId: 'STRUCT_AC', defaultLineTypeId: '', defaultColor: '#808080', defaultLineWeight: 0, defaultLayerId: 'STRUCTURES', defaultLabelFormat: 'A/C', simplifiedCode: '508', simplifiedDescription: 'A/C', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: '' },
  { alphaCode: 'ST10', numericCode: '509', description: 'Mailbox', category: 'STRUCTURES', subcategory: 'Misc', connectType: 'POINT', isAutoSpline: false, defaultSymbolId: 'STRUCT_MAILBOX', defaultLineTypeId: '', defaultColor: '#000000', defaultLineWeight: 0, defaultLayerId: 'STRUCTURES', defaultLabelFormat: 'MB', simplifiedCode: '509', simplifiedDescription: 'Mailbox', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: '' },
  { alphaCode: 'ST11', numericCode: '510', description: 'Sign', category: 'STRUCTURES', subcategory: 'Misc', connectType: 'POINT', isAutoSpline: false, defaultSymbolId: 'STRUCT_SIGN', defaultLineTypeId: '', defaultColor: '#000000', defaultLineWeight: 0, defaultLayerId: 'STRUCTURES', defaultLabelFormat: 'SIGN', simplifiedCode: '510', simplifiedDescription: 'Sign', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: '' },
  { alphaCode: 'ST12', numericCode: '511', description: 'Flag/Marker', category: 'STRUCTURES', subcategory: 'Misc', connectType: 'POINT', isAutoSpline: false, defaultSymbolId: 'STRUCT_FLAG', defaultLineTypeId: '', defaultColor: '#FF8000', defaultLineWeight: 0, defaultLayerId: 'STRUCTURES', defaultLabelFormat: 'FLG', simplifiedCode: '511', simplifiedDescription: 'Flag', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: '' },

  // ═══════════════════════════════════════════════════════════════
  // UTILITIES (UT01–UT30)
  // ═══════════════════════════════════════════════════════════════
  // Water
  { alphaCode: 'UT01', numericCode: '600', description: 'Water Meter', category: 'UTILITIES', subcategory: 'Water', connectType: 'POINT', isAutoSpline: false, defaultSymbolId: 'UTIL_WATER_METER', defaultLineTypeId: '', defaultColor: '#0000FF', defaultLineWeight: 0, defaultLayerId: 'UTILITY-WATER', defaultLabelFormat: 'WM', simplifiedCode: '600', simplifiedDescription: 'Water Meter', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: '' },
  { alphaCode: 'UT02', numericCode: '601', description: 'Water Valve', category: 'UTILITIES', subcategory: 'Water', connectType: 'POINT', isAutoSpline: false, defaultSymbolId: 'UTIL_WATER_VALVE', defaultLineTypeId: '', defaultColor: '#0000FF', defaultLineWeight: 0, defaultLayerId: 'UTILITY-WATER', defaultLabelFormat: 'WV', simplifiedCode: '601', simplifiedDescription: 'Water Valve', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: '' },
  { alphaCode: 'UT03', numericCode: '602', description: 'Fire Hydrant', category: 'UTILITIES', subcategory: 'Water', connectType: 'POINT', isAutoSpline: false, defaultSymbolId: 'UTIL_HYDRANT', defaultLineTypeId: '', defaultColor: '#FF0000', defaultLineWeight: 0, defaultLayerId: 'UTILITY-WATER', defaultLabelFormat: 'FH', simplifiedCode: '602', simplifiedDescription: 'Fire Hydrant', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: '' },
  { alphaCode: 'UT04', numericCode: '603', description: 'Water Line', category: 'UTILITIES', subcategory: 'Water', connectType: 'LINE', isAutoSpline: false, defaultSymbolId: '', defaultLineTypeId: 'DASHED', defaultColor: '#0000FF', defaultLineWeight: 0.25, defaultLayerId: 'UTILITY-WATER', defaultLabelFormat: 'W', simplifiedCode: '603', simplifiedDescription: 'Water Line', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: '' },
  { alphaCode: 'UT05', numericCode: '604', description: 'Cleanout', category: 'UTILITIES', subcategory: 'Sewer', connectType: 'POINT', isAutoSpline: false, defaultSymbolId: 'UTIL_CLEANOUT', defaultLineTypeId: '', defaultColor: '#008000', defaultLineWeight: 0, defaultLayerId: 'UTILITY-SEWER', defaultLabelFormat: 'CO', simplifiedCode: '604', simplifiedDescription: 'Cleanout', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: '' },
  // Sewer
  { alphaCode: 'UT06', numericCode: '610', description: 'Manhole', category: 'UTILITIES', subcategory: 'Sewer', connectType: 'POINT', isAutoSpline: false, defaultSymbolId: 'UTIL_MANHOLE', defaultLineTypeId: '', defaultColor: '#008000', defaultLineWeight: 0, defaultLayerId: 'UTILITY-SEWER', defaultLabelFormat: 'MH', simplifiedCode: '610', simplifiedDescription: 'Manhole', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: '' },
  { alphaCode: 'UT07', numericCode: '611', description: 'Sewer Line', category: 'UTILITIES', subcategory: 'Sewer', connectType: 'LINE', isAutoSpline: false, defaultSymbolId: '', defaultLineTypeId: 'DASHED', defaultColor: '#008000', defaultLineWeight: 0.25, defaultLayerId: 'UTILITY-SEWER', defaultLabelFormat: 'SS', simplifiedCode: '611', simplifiedDescription: 'Sewer Line', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: '' },
  // Gas
  { alphaCode: 'UT08', numericCode: '620', description: 'Gas Meter', category: 'UTILITIES', subcategory: 'Gas', connectType: 'POINT', isAutoSpline: false, defaultSymbolId: 'UTIL_GAS_METER', defaultLineTypeId: '', defaultColor: '#FFD700', defaultLineWeight: 0, defaultLayerId: 'UTILITY-GAS', defaultLabelFormat: 'GM', simplifiedCode: '620', simplifiedDescription: 'Gas Meter', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: '' },
  { alphaCode: 'UT09', numericCode: '621', description: 'Gas Valve', category: 'UTILITIES', subcategory: 'Gas', connectType: 'POINT', isAutoSpline: false, defaultSymbolId: 'UTIL_GAS_VALVE', defaultLineTypeId: '', defaultColor: '#FFD700', defaultLineWeight: 0, defaultLayerId: 'UTILITY-GAS', defaultLabelFormat: 'GV', simplifiedCode: '621', simplifiedDescription: 'Gas Valve', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: '' },
  { alphaCode: 'UT10', numericCode: '622', description: 'Gas Line', category: 'UTILITIES', subcategory: 'Gas', connectType: 'LINE', isAutoSpline: false, defaultSymbolId: '', defaultLineTypeId: 'DASHED', defaultColor: '#FFD700', defaultLineWeight: 0.25, defaultLayerId: 'UTILITY-GAS', defaultLabelFormat: 'G', simplifiedCode: '622', simplifiedDescription: 'Gas Line', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: '' },
  // Electric
  { alphaCode: 'UT11', numericCode: '640', description: 'Electric Meter', category: 'UTILITIES', subcategory: 'Electric', connectType: 'POINT', isAutoSpline: false, defaultSymbolId: 'UTIL_ELEC_METER', defaultLineTypeId: '', defaultColor: '#FF8C00', defaultLineWeight: 0, defaultLayerId: 'UTILITY-ELEC', defaultLabelFormat: 'EM', simplifiedCode: '640', simplifiedDescription: 'Elec Meter', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: '' },
  { alphaCode: 'UT12', numericCode: '641', description: 'Power Pole', category: 'UTILITIES', subcategory: 'Electric', connectType: 'POINT', isAutoSpline: false, defaultSymbolId: 'UTIL_POWER_POLE', defaultLineTypeId: '', defaultColor: '#FF8C00', defaultLineWeight: 0, defaultLayerId: 'UTILITY-ELEC', defaultLabelFormat: 'PP', simplifiedCode: '641', simplifiedDescription: 'Power Pole', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: '' },
  { alphaCode: 'UT13', numericCode: '642', description: 'Transformer', category: 'UTILITIES', subcategory: 'Electric', connectType: 'POINT', isAutoSpline: false, defaultSymbolId: 'UTIL_TRANSFORMER', defaultLineTypeId: '', defaultColor: '#FF8C00', defaultLineWeight: 0, defaultLayerId: 'UTILITY-ELEC', defaultLabelFormat: 'XFMR', simplifiedCode: '642', simplifiedDescription: 'Transformer', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: '' },
  { alphaCode: 'UT14', numericCode: '643', description: 'Guy Wire Anchor', category: 'UTILITIES', subcategory: 'Electric', connectType: 'POINT', isAutoSpline: false, defaultSymbolId: 'UTIL_GUY_ANCHOR', defaultLineTypeId: '', defaultColor: '#FF8C00', defaultLineWeight: 0, defaultLayerId: 'UTILITY-ELEC', defaultLabelFormat: 'GW', simplifiedCode: '643', simplifiedDescription: 'Guy Wire', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: '' },
  { alphaCode: 'UT15', numericCode: '644', description: 'Overhead Electric Line', category: 'UTILITIES', subcategory: 'Electric', connectType: 'LINE', isAutoSpline: false, defaultSymbolId: '', defaultLineTypeId: 'OVERHEAD_POWER', defaultColor: '#FF8C00', defaultLineWeight: 0.18, defaultLayerId: 'UTILITY-ELEC', defaultLabelFormat: 'OHE', simplifiedCode: '644', simplifiedDescription: 'OHE Line', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: '' },
  { alphaCode: 'UT16', numericCode: '645', description: 'Underground Electric Line', category: 'UTILITIES', subcategory: 'Electric', connectType: 'LINE', isAutoSpline: false, defaultSymbolId: '', defaultLineTypeId: 'DASHED', defaultColor: '#FF8C00', defaultLineWeight: 0.18, defaultLayerId: 'UTILITY-ELEC', defaultLabelFormat: 'UGE', simplifiedCode: '645', simplifiedDescription: 'UG Elec', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: '' },
  // Communication
  { alphaCode: 'UT17', numericCode: '650', description: 'Telephone Pedestal', category: 'UTILITIES', subcategory: 'Communication', connectType: 'POINT', isAutoSpline: false, defaultSymbolId: 'UTIL_TEL_PED', defaultLineTypeId: '', defaultColor: '#800080', defaultLineWeight: 0, defaultLayerId: 'UTILITY-COMM', defaultLabelFormat: 'TEL', simplifiedCode: '650', simplifiedDescription: 'Tel Ped', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: '' },
  { alphaCode: 'UT18', numericCode: '651', description: 'Cable TV Pedestal', category: 'UTILITIES', subcategory: 'Communication', connectType: 'POINT', isAutoSpline: false, defaultSymbolId: 'UTIL_CABLE_PED', defaultLineTypeId: '', defaultColor: '#800080', defaultLineWeight: 0, defaultLayerId: 'UTILITY-COMM', defaultLabelFormat: 'CATV', simplifiedCode: '651', simplifiedDescription: 'Cable Ped', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: '' },
  // Storm Drain
  { alphaCode: 'UT19', numericCode: '660', description: 'Storm Drain Inlet', category: 'UTILITIES', subcategory: 'Storm', connectType: 'POINT', isAutoSpline: false, defaultSymbolId: 'UTIL_STORM_INLET', defaultLineTypeId: '', defaultColor: '#4169E1', defaultLineWeight: 0, defaultLayerId: 'UTILITY-WATER', defaultLabelFormat: 'SDI', simplifiedCode: '660', simplifiedDescription: 'Storm Inlet', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: '' },
  { alphaCode: 'UT20', numericCode: '661', description: 'Storm Drain Line', category: 'UTILITIES', subcategory: 'Storm', connectType: 'LINE', isAutoSpline: false, defaultSymbolId: '', defaultLineTypeId: 'DASHED', defaultColor: '#4169E1', defaultLineWeight: 0.25, defaultLayerId: 'UTILITY-WATER', defaultLabelFormat: 'SD', simplifiedCode: '661', simplifiedDescription: 'Storm Line', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: '' },

  // ═══════════════════════════════════════════════════════════════
  // VEGETATION (VG01–VG08)
  // ═══════════════════════════════════════════════════════════════
  { alphaCode: 'VG01', numericCode: '720', description: 'Tree (Deciduous)', category: 'VEGETATION', subcategory: 'Trees', connectType: 'POINT', isAutoSpline: false, defaultSymbolId: 'VEG_TREE_DECID', defaultLineTypeId: '', defaultColor: '#008000', defaultLineWeight: 0, defaultLayerId: 'VEGETATION', defaultLabelFormat: '{desc}', simplifiedCode: '720', simplifiedDescription: 'Tree', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: 'Description field: species and diameter' },
  { alphaCode: 'VG02', numericCode: '721', description: 'Tree (Evergreen)', category: 'VEGETATION', subcategory: 'Trees', connectType: 'POINT', isAutoSpline: false, defaultSymbolId: 'VEG_TREE_EVERG', defaultLineTypeId: '', defaultColor: '#006400', defaultLineWeight: 0, defaultLayerId: 'VEGETATION', defaultLabelFormat: '{desc}', simplifiedCode: '721', simplifiedDescription: 'Evergreen', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: '' },
  { alphaCode: 'VG03', numericCode: '722', description: 'Tree (Palm)', category: 'VEGETATION', subcategory: 'Trees', connectType: 'POINT', isAutoSpline: false, defaultSymbolId: 'VEG_TREE_PALM', defaultLineTypeId: '', defaultColor: '#008000', defaultLineWeight: 0, defaultLayerId: 'VEGETATION', defaultLabelFormat: '{desc}', simplifiedCode: '722', simplifiedDescription: 'Palm', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: 'Rare in Bell County but exists' },
  { alphaCode: 'VG04', numericCode: '723', description: 'Shrub/Bush', category: 'VEGETATION', subcategory: 'Shrub', connectType: 'POINT', isAutoSpline: false, defaultSymbolId: 'VEG_SHRUB', defaultLineTypeId: '', defaultColor: '#228B22', defaultLineWeight: 0, defaultLayerId: 'VEGETATION', defaultLabelFormat: 'SHRUB', simplifiedCode: '723', simplifiedDescription: 'Shrub', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: '' },
  { alphaCode: 'VG05', numericCode: '724', description: 'Flower Bed', category: 'VEGETATION', subcategory: 'Bed', connectType: 'LINE', isAutoSpline: false, defaultSymbolId: '', defaultLineTypeId: 'SOLID', defaultColor: '#228B22', defaultLineWeight: 0.18, defaultLayerId: 'VEGETATION', defaultLabelFormat: 'FB', simplifiedCode: '724', simplifiedDescription: 'Flower Bed', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: '' },
  { alphaCode: 'VG06', numericCode: '725', description: 'Tree Line', category: 'VEGETATION', subcategory: 'Trees', connectType: 'LINE', isAutoSpline: false, defaultSymbolId: '', defaultLineTypeId: 'SOLID', defaultColor: '#008000', defaultLineWeight: 0.18, defaultLayerId: 'VEGETATION', defaultLabelFormat: 'TL', simplifiedCode: '725', simplifiedDescription: 'Tree Line', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: '' },
  { alphaCode: 'VG07', numericCode: '729', description: 'Edge of Woods', category: 'VEGETATION', subcategory: 'Trees', connectType: 'LINE', isAutoSpline: true, defaultSymbolId: '', defaultLineTypeId: 'SOLID', defaultColor: '#008000', defaultLineWeight: 0.18, defaultLayerId: 'VEGETATION', defaultLabelFormat: 'EOW', simplifiedCode: '729', simplifiedDescription: 'Edge of Woods', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: 'Auto-spline' },
  { alphaCode: 'VG08', numericCode: '726', description: 'Stump', category: 'VEGETATION', subcategory: 'Trees', connectType: 'POINT', isAutoSpline: false, defaultSymbolId: 'VEG_STUMP', defaultLineTypeId: '', defaultColor: '#8B4513', defaultLineWeight: 0, defaultLayerId: 'VEGETATION', defaultLabelFormat: 'STMP', simplifiedCode: '726', simplifiedDescription: 'Stump', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: '' },

  // ═══════════════════════════════════════════════════════════════
  // TOPOGRAPHY (TP01–TP11)
  // ═══════════════════════════════════════════════════════════════
  { alphaCode: 'TP01', numericCode: '625', description: 'Ground Shot', category: 'TOPOGRAPHY', subcategory: 'Ground', connectType: 'POINT', isAutoSpline: false, defaultSymbolId: 'TOPO_X', defaultLineTypeId: '', defaultColor: '#8B4513', defaultLineWeight: 0, defaultLayerId: 'TOPO', defaultLabelFormat: '{elevation}', simplifiedCode: '625', simplifiedDescription: 'Ground Shot', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: '' },
  { alphaCode: 'TP02', numericCode: '626', description: 'Top of Bank', category: 'TOPOGRAPHY', subcategory: 'Bank', connectType: 'LINE', isAutoSpline: false, defaultSymbolId: '', defaultLineTypeId: 'SOLID', defaultColor: '#8B4513', defaultLineWeight: 0.18, defaultLayerId: 'TOPO', defaultLabelFormat: 'TB', simplifiedCode: '626', simplifiedDescription: 'Top Bank', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: '' },
  { alphaCode: 'TP03', numericCode: '627', description: 'Bottom of Bank', category: 'TOPOGRAPHY', subcategory: 'Bank', connectType: 'LINE', isAutoSpline: false, defaultSymbolId: '', defaultLineTypeId: 'SOLID', defaultColor: '#8B4513', defaultLineWeight: 0.18, defaultLayerId: 'TOPO', defaultLabelFormat: 'BB', simplifiedCode: '627', simplifiedDescription: 'Bot Bank', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: '' },
  { alphaCode: 'TP04', numericCode: '628', description: 'Ridge Line', category: 'TOPOGRAPHY', subcategory: 'Ridge', connectType: 'LINE', isAutoSpline: false, defaultSymbolId: '', defaultLineTypeId: 'SOLID', defaultColor: '#A0522D', defaultLineWeight: 0.18, defaultLayerId: 'TOPO', defaultLabelFormat: 'RDG', simplifiedCode: '628', simplifiedDescription: 'Ridge', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: '' },
  { alphaCode: 'TP05', numericCode: '629', description: 'Drainage/Swale', category: 'TOPOGRAPHY', subcategory: 'Drainage', connectType: 'LINE', isAutoSpline: false, defaultSymbolId: '', defaultLineTypeId: 'SOLID', defaultColor: '#4169E1', defaultLineWeight: 0.18, defaultLayerId: 'TOPO', defaultLabelFormat: 'SWL', simplifiedCode: '629', simplifiedDescription: 'Swale', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: '' },
  { alphaCode: 'TP06', numericCode: '630', description: 'Ditch/Channel', category: 'TOPOGRAPHY', subcategory: 'Drainage', connectType: 'LINE', isAutoSpline: true, defaultSymbolId: '', defaultLineTypeId: 'SOLID', defaultColor: '#4169E1', defaultLineWeight: 0.18, defaultLayerId: 'TOPO', defaultLabelFormat: 'DCH', simplifiedCode: '630', simplifiedDescription: 'Ditch', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: 'Auto-spline' },
  { alphaCode: 'TP07', numericCode: '632', description: 'Stream/Creek', category: 'TOPOGRAPHY', subcategory: 'Water', connectType: 'LINE', isAutoSpline: true, defaultSymbolId: '', defaultLineTypeId: 'CREEK_WAVY', defaultColor: '#0000FF', defaultLineWeight: 0.25, defaultLayerId: 'WATER-FEATURES', defaultLabelFormat: '', simplifiedCode: '632', simplifiedDescription: 'Creek', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: 'Auto-spline' },
  { alphaCode: 'TP08', numericCode: '633', description: 'River', category: 'TOPOGRAPHY', subcategory: 'Water', connectType: 'LINE', isAutoSpline: true, defaultSymbolId: '', defaultLineTypeId: 'SOLID', defaultColor: '#0000FF', defaultLineWeight: 0.35, defaultLayerId: 'WATER-FEATURES', defaultLabelFormat: '', simplifiedCode: '633', simplifiedDescription: 'River', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: 'Auto-spline' },
  { alphaCode: 'TP09', numericCode: '634', description: 'Pond Edge', category: 'TOPOGRAPHY', subcategory: 'Water', connectType: 'LINE', isAutoSpline: true, defaultSymbolId: '', defaultLineTypeId: 'SOLID', defaultColor: '#0000FF', defaultLineWeight: 0.25, defaultLayerId: 'WATER-FEATURES', defaultLabelFormat: 'POND', simplifiedCode: '634', simplifiedDescription: 'Pond', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: 'Auto-spline' },
  { alphaCode: 'TP10', numericCode: '635', description: 'Lake Edge', category: 'TOPOGRAPHY', subcategory: 'Water', connectType: 'LINE', isAutoSpline: true, defaultSymbolId: '', defaultLineTypeId: 'SOLID', defaultColor: '#0000FF', defaultLineWeight: 0.35, defaultLayerId: 'WATER-FEATURES', defaultLabelFormat: 'LAKE', simplifiedCode: '635', simplifiedDescription: 'Lake', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: 'Auto-spline' },
  { alphaCode: 'TP11', numericCode: '370', description: 'Wetland Edge', category: 'TOPOGRAPHY', subcategory: 'Water', connectType: 'LINE', isAutoSpline: true, defaultSymbolId: '', defaultLineTypeId: 'DASHED', defaultColor: '#0000FF', defaultLineWeight: 0.25, defaultLayerId: 'WATER-FEATURES', defaultLabelFormat: 'WET', simplifiedCode: '370', simplifiedDescription: 'Wetland', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: 'Auto-spline' },

  // ═══════════════════════════════════════════════════════════════
  // TRANSPORTATION (TR01–TR08)
  // ═══════════════════════════════════════════════════════════════
  { alphaCode: 'TR01', numericCode: '700', description: 'Road Centerline', category: 'TRANSPORTATION', subcategory: 'Centerline', connectType: 'LINE', isAutoSpline: false, defaultSymbolId: '', defaultLineTypeId: 'CENTER', defaultColor: '#808080', defaultLineWeight: 0.18, defaultLayerId: 'TRANSPORTATION', defaultLabelFormat: 'CL', simplifiedCode: '700', simplifiedDescription: 'Road CL', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: '' },
  { alphaCode: 'TR02', numericCode: '701', description: 'Edge of Pavement', category: 'TRANSPORTATION', subcategory: 'Pavement', connectType: 'LINE', isAutoSpline: false, defaultSymbolId: '', defaultLineTypeId: 'SOLID', defaultColor: '#808080', defaultLineWeight: 0.25, defaultLayerId: 'TRANSPORTATION', defaultLabelFormat: 'EP', simplifiedCode: '701', simplifiedDescription: 'Edge Pave', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: '' },
  { alphaCode: 'TR03', numericCode: '702', description: 'Curb Face', category: 'TRANSPORTATION', subcategory: 'Curb', connectType: 'LINE', isAutoSpline: false, defaultSymbolId: '', defaultLineTypeId: 'SOLID', defaultColor: '#808080', defaultLineWeight: 0.25, defaultLayerId: 'TRANSPORTATION', defaultLabelFormat: 'CF', simplifiedCode: '702', simplifiedDescription: 'Curb Face', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: '' },
  { alphaCode: 'TR04', numericCode: '703', description: 'Back of Curb', category: 'TRANSPORTATION', subcategory: 'Curb', connectType: 'LINE', isAutoSpline: false, defaultSymbolId: '', defaultLineTypeId: 'SOLID', defaultColor: '#808080', defaultLineWeight: 0.18, defaultLayerId: 'TRANSPORTATION', defaultLabelFormat: 'BC', simplifiedCode: '703', simplifiedDescription: 'Back Curb', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: '' },
  { alphaCode: 'TR05', numericCode: '704', description: 'Gutter Flow Line', category: 'TRANSPORTATION', subcategory: 'Curb', connectType: 'LINE', isAutoSpline: false, defaultSymbolId: '', defaultLineTypeId: 'SOLID', defaultColor: '#808080', defaultLineWeight: 0.13, defaultLayerId: 'TRANSPORTATION', defaultLabelFormat: 'GFL', simplifiedCode: '704', simplifiedDescription: 'Gutter', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: '' },
  { alphaCode: 'TR06', numericCode: '705', description: 'Sidewalk Edge', category: 'TRANSPORTATION', subcategory: 'Pedestrian', connectType: 'LINE', isAutoSpline: false, defaultSymbolId: '', defaultLineTypeId: 'SOLID', defaultColor: '#C0C0C0', defaultLineWeight: 0.18, defaultLayerId: 'TRANSPORTATION', defaultLabelFormat: 'SW', simplifiedCode: '705', simplifiedDescription: 'Sidewalk', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: '' },
  { alphaCode: 'TR07', numericCode: '706', description: 'Gravel Road Edge', category: 'TRANSPORTATION', subcategory: 'Pavement', connectType: 'LINE', isAutoSpline: false, defaultSymbolId: '', defaultLineTypeId: 'DOTTED', defaultColor: '#808080', defaultLineWeight: 0.18, defaultLayerId: 'TRANSPORTATION', defaultLabelFormat: 'GR', simplifiedCode: '706', simplifiedDescription: 'Gravel Edge', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: '' },
  { alphaCode: 'TR08', numericCode: '707', description: 'Railroad', category: 'TRANSPORTATION', subcategory: 'Rail', connectType: 'LINE', isAutoSpline: false, defaultSymbolId: '', defaultLineTypeId: 'RAILROAD', defaultColor: '#000000', defaultLineWeight: 0.25, defaultLayerId: 'TRANSPORTATION', defaultLabelFormat: 'RR', simplifiedCode: '707', simplifiedDescription: 'Railroad', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: '' },

  // ═══════════════════════════════════════════════════════════════
  // CURVE POINTS (CV01–CV10)
  // ═══════════════════════════════════════════════════════════════
  { alphaCode: 'CV01', numericCode: '390', description: 'Point of Curvature (PC)', category: 'CURVES', subcategory: 'Curve', connectType: 'POINT', isAutoSpline: false, defaultSymbolId: 'CURVE_PC', defaultLineTypeId: '', defaultColor: '#000000', defaultLineWeight: 0, defaultLayerId: 'BOUNDARY-MON', defaultLabelFormat: 'PC', simplifiedCode: '390', simplifiedDescription: 'PC', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: true, notes: '' },
  { alphaCode: 'CV02', numericCode: '391', description: 'Point of Tangency (PT)', category: 'CURVES', subcategory: 'Curve', connectType: 'POINT', isAutoSpline: false, defaultSymbolId: 'CURVE_PT', defaultLineTypeId: '', defaultColor: '#000000', defaultLineWeight: 0, defaultLayerId: 'BOUNDARY-MON', defaultLabelFormat: 'PT', simplifiedCode: '391', simplifiedDescription: 'PT', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: true, notes: '' },
  { alphaCode: 'CV03', numericCode: '392', description: 'Point of Intersection (PI)', category: 'CURVES', subcategory: 'Curve', connectType: 'POINT', isAutoSpline: false, defaultSymbolId: 'CURVE_PI', defaultLineTypeId: '', defaultColor: '#808080', defaultLineWeight: 0, defaultLayerId: 'CURVE-DATA', defaultLabelFormat: 'PI', simplifiedCode: '392', simplifiedDescription: 'PI', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: true, notes: '' },
  { alphaCode: 'CV04', numericCode: '393', description: 'Radius Point (RP)', category: 'CURVES', subcategory: 'Curve', connectType: 'POINT', isAutoSpline: false, defaultSymbolId: 'CURVE_RP', defaultLineTypeId: '', defaultColor: '#808080', defaultLineWeight: 0, defaultLayerId: 'CURVE-DATA', defaultLabelFormat: 'RP', simplifiedCode: '393', simplifiedDescription: 'RP', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: true, notes: '' },
  { alphaCode: 'CV05', numericCode: '394', description: 'Mid-Point of Curve (MPC)', category: 'CURVES', subcategory: 'Curve', connectType: 'POINT', isAutoSpline: false, defaultSymbolId: 'CURVE_MPC', defaultLineTypeId: '', defaultColor: '#000000', defaultLineWeight: 0, defaultLayerId: 'CURVE-DATA', defaultLabelFormat: 'MPC', simplifiedCode: '394', simplifiedDescription: 'MPC', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: true, notes: '' },
  { alphaCode: 'CV06', numericCode: '395', description: 'Point on Curve (POC)', category: 'CURVES', subcategory: 'Curve', connectType: 'POINT', isAutoSpline: false, defaultSymbolId: 'CURVE_POC', defaultLineTypeId: '', defaultColor: '#000000', defaultLineWeight: 0, defaultLayerId: 'CURVE-DATA', defaultLabelFormat: 'POC', simplifiedCode: '395', simplifiedDescription: 'POC', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: true, notes: '' },
  { alphaCode: 'CV07', numericCode: '396', description: 'Point of Compound Curve (PCC)', category: 'CURVES', subcategory: 'Curve', connectType: 'POINT', isAutoSpline: false, defaultSymbolId: 'CURVE_PCC', defaultLineTypeId: '', defaultColor: '#000000', defaultLineWeight: 0, defaultLayerId: 'CURVE-DATA', defaultLabelFormat: 'PCC', simplifiedCode: '396', simplifiedDescription: 'PCC', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: true, notes: '' },
  { alphaCode: 'CV08', numericCode: '397', description: 'Point of Reverse Curve (PRC)', category: 'CURVES', subcategory: 'Curve', connectType: 'POINT', isAutoSpline: false, defaultSymbolId: 'CURVE_PRC', defaultLineTypeId: '', defaultColor: '#000000', defaultLineWeight: 0, defaultLayerId: 'CURVE-DATA', defaultLabelFormat: 'PRC', simplifiedCode: '397', simplifiedDescription: 'PRC', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: true, notes: '' },
  { alphaCode: 'CV09', numericCode: '398', description: 'Tangent-to-Spiral (TS)', category: 'CURVES', subcategory: 'Spiral', connectType: 'POINT', isAutoSpline: false, defaultSymbolId: 'CURVE_TS', defaultLineTypeId: '', defaultColor: '#000000', defaultLineWeight: 0, defaultLayerId: 'CURVE-DATA', defaultLabelFormat: 'TS', simplifiedCode: '398', simplifiedDescription: 'TS', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: true, notes: '' },
  { alphaCode: 'CV10', numericCode: '399', description: 'Spiral-to-Tangent (ST)', category: 'CURVES', subcategory: 'Spiral', connectType: 'POINT', isAutoSpline: false, defaultSymbolId: 'CURVE_ST', defaultLineTypeId: '', defaultColor: '#000000', defaultLineWeight: 0, defaultLayerId: 'CURVE-DATA', defaultLabelFormat: 'ST', simplifiedCode: '399', simplifiedDescription: 'ST', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: true, notes: '' },

  // ═══════════════════════════════════════════════════════════════
  // MISCELLANEOUS (MS01–MS10)
  // ═══════════════════════════════════════════════════════════════
  { alphaCode: 'MS01', numericCode: '900', description: 'Generic Point', category: 'MISCELLANEOUS', subcategory: 'Generic', connectType: 'POINT', isAutoSpline: false, defaultSymbolId: 'MISC_DOT', defaultLineTypeId: '', defaultColor: '#000000', defaultLineWeight: 0, defaultLayerId: 'MISC', defaultLabelFormat: '{desc}', simplifiedCode: '900', simplifiedDescription: 'Generic', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: '' },
  { alphaCode: 'MS02', numericCode: '901', description: 'Generic Line', category: 'MISCELLANEOUS', subcategory: 'Generic', connectType: 'LINE', isAutoSpline: false, defaultSymbolId: '', defaultLineTypeId: 'SOLID', defaultColor: '#000000', defaultLineWeight: 0.18, defaultLayerId: 'MISC', defaultLabelFormat: '', simplifiedCode: '901', simplifiedDescription: 'Generic Line', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: '' },
  { alphaCode: 'MS03', numericCode: '902', description: 'Temporary/Construction', category: 'MISCELLANEOUS', subcategory: 'Temp', connectType: 'POINT', isAutoSpline: false, defaultSymbolId: 'MISC_TEMP', defaultLineTypeId: '', defaultColor: '#FF8000', defaultLineWeight: 0, defaultLayerId: 'MISC', defaultLabelFormat: 'TEMP', simplifiedCode: '902', simplifiedDescription: 'Temp', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: '' },
  { alphaCode: 'MS04', numericCode: '903', description: 'Photo Point', category: 'MISCELLANEOUS', subcategory: 'Reference', connectType: 'POINT', isAutoSpline: false, defaultSymbolId: 'MISC_PHOTO', defaultLineTypeId: '', defaultColor: '#800080', defaultLineWeight: 0, defaultLayerId: 'MISC', defaultLabelFormat: 'PHOTO', simplifiedCode: '903', simplifiedDescription: 'Photo', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: '' },
  { alphaCode: 'MS05', numericCode: '904', description: 'Spot Elevation', category: 'MISCELLANEOUS', subcategory: 'Elevation', connectType: 'POINT', isAutoSpline: false, defaultSymbolId: 'MISC_SPOT_ELEV', defaultLineTypeId: '', defaultColor: '#8B4513', defaultLineWeight: 0, defaultLayerId: 'TOPO', defaultLabelFormat: '{elevation}', simplifiedCode: '904', simplifiedDescription: 'Spot Elev', collapses: false, monumentAction: null, monumentSize: null, monumentType: null, isBuiltIn: true, isNew: false, notes: '' },
];

// Quick access: total count
// BOUNDARY_CONTROL: 30 codes (12 rod sizes × found/set/calc, + pipe, concrete, cap, pk nail, mag nail, rr spike, witness, fence post)
// SURVEY_CONTROL: 6
// PROPERTY_LINES: 9
// FENCES: 15
// STRUCTURES: 12
// UTILITIES: 20
// VEGETATION: 8
// TOPOGRAPHY: 11
// TRANSPORTATION: 8
// CURVES: 10
// MISCELLANEOUS: 5
// TOTAL: ~134 built-in (expandable by user)
```

---

## 4. Dual-Code Lookup Engine

The lookup engine supports bidirectional resolution: alpha → numeric and numeric → alpha.

```typescript
// packages/codes/src/code-lookup.ts

import { MASTER_CODE_LIBRARY } from './code-library';
import type { PointCodeDefinition } from '@starr-cad/core';

// Pre-built lookup indexes (computed once at startup)
const byAlpha = new Map<string, PointCodeDefinition>();
const byNumeric = new Map<string, PointCodeDefinition>();
const byEitherUpper = new Map<string, PointCodeDefinition>();

export function initCodeLookup(
  customCodes: PointCodeDefinition[] = []
): void {
  byAlpha.clear();
  byNumeric.clear();
  byEitherUpper.clear();

  const allCodes = [...MASTER_CODE_LIBRARY, ...customCodes];

  for (const code of allCodes) {
    byAlpha.set(code.alphaCode.toUpperCase(), code);
    byNumeric.set(code.numericCode, code);
    // Both keys point to same definition for universal lookup
    byEitherUpper.set(code.alphaCode.toUpperCase(), code);
    byEitherUpper.set(code.numericCode, code);
  }
}

/** Look up a code by either alpha or numeric form */
export function lookupCode(code: string): PointCodeDefinition | null {
  return byEitherUpper.get(code.toUpperCase()) ?? null;
}

/** Look up by alpha code only */
export function lookupByAlpha(alpha: string): PointCodeDefinition | null {
  return byAlpha.get(alpha.toUpperCase()) ?? null;
}

/** Look up by numeric code only */
export function lookupByNumeric(numeric: string): PointCodeDefinition | null {
  return byNumeric.get(numeric) ?? null;
}

/** Get the alpha code for a numeric code */
export function numericToAlpha(numeric: string): string | null {
  return byNumeric.get(numeric)?.alphaCode ?? null;
}

/** Get the numeric code for an alpha code */
export function alphaToNumeric(alpha: string): string | null {
  return byAlpha.get(alpha.toUpperCase())?.numericCode ?? null;
}

/** Get all codes in a category */
export function getCodesByCategory(category: CodeCategory): PointCodeDefinition[] {
  return [...byAlpha.values()].filter(c => c.category === category);
}

/** Get all codes */
export function getAllCodes(): PointCodeDefinition[] {
  return [...byAlpha.values()];
}

/** Check if a string is a valid code (alpha or numeric) */
export function isValidCode(code: string): boolean {
  return byEitherUpper.has(code.toUpperCase());
}

/** Fuzzy code lookup — try exact match first, then partial matches */
export function fuzzyLookupCode(input: string): { code: PointCodeDefinition | null; confidence: number } {
  const upper = input.toUpperCase().trim();

  // Exact match
  const exact = byEitherUpper.get(upper);
  if (exact) return { code: exact, confidence: 1.0 };

  // Try removing leading zeros from numeric (e.g., "0309" → "309")
  const stripped = upper.replace(/^0+/, '');
  const strippedMatch = byEitherUpper.get(stripped);
  if (strippedMatch) return { code: strippedMatch, confidence: 0.95 };

  // Try as partial match (prefix) — only if unambiguous
  const prefixMatches = [...byEitherUpper.entries()]
    .filter(([key]) => key.startsWith(upper))
    .map(([_, code]) => code);
  if (prefixMatches.length === 1) return { code: prefixMatches[0], confidence: 0.7 };

  return { code: null, confidence: 0 };
}
```

---

## 5. Code Suffix Parser (B/E/A Line Control)

This strips the B/E/C/A/BA/EA/CA suffix from a raw code to get the base code and line-control instruction.

```typescript
// packages/codes/src/code-suffix-parser.ts

import type { CodeSuffix, ParsedPointCode } from '@starr-cad/core';
import { lookupCode, isValidCode } from './code-lookup';

/** Ordered from longest suffix to shortest to avoid ambiguity */
const SUFFIX_ORDER: [string, CodeSuffix][] = [
  ['BA', 'BA'],   // Begin Arc
  ['EA', 'EA'],   // End Arc
  ['CA', 'CA'],   // Close with Arc
  ['B', 'B'],     // Begin Line
  ['E', 'E'],     // End Line
  ['C', 'C'],     // Close Line
  ['A', 'A'],     // Arc continuation
];

export function parseCodeWithSuffix(rawCode: string): ParsedPointCode {
  const upper = rawCode.toUpperCase().trim();

  // Try stripping each suffix from the end
  for (const [suffStr, suffix] of SUFFIX_ORDER) {
    if (upper.endsWith(suffStr)) {
      const base = upper.slice(0, -suffStr.length);

      // Verify the base is a valid code in the library
      if (isValidCode(base)) {
        const def = lookupCode(base)!;
        return {
          rawCode,
          baseCode: base,
          isNumeric: /^\d+$/.test(base),
          isAlpha: /^[A-Z]/.test(base),
          suffix,
          isValid: true,
          isLineCode: def.connectType === 'LINE',
          isAutoSpline: def.isAutoSpline,
        };
      }
    }
  }

  // No suffix found — try the whole string as a code
  const def = lookupCode(upper);
  return {
    rawCode,
    baseCode: upper,
    isNumeric: /^\d+$/.test(upper),
    isAlpha: /^[A-Z]/.test(upper),
    suffix: null,
    isValid: def !== null,
    isLineCode: def?.connectType === 'LINE' ?? false,
    isAutoSpline: def?.isAutoSpline ?? false,
  };
}
```

---

## 6. Point Name Suffix Intelligence (fnd/set/calc)

This is the critical system for understanding what happened at each monument. The point NAME carries the context.

```typescript
// packages/codes/src/name-suffix-parser.ts

import type { ParsedPointName, PointNameSuffix, MonumentAction } from '@starr-cad/core';

interface SuffixPattern {
  regex: RegExp;
  action: PointNameSuffix;
  confidence: number;
  recalcMode: 'none' | 'dynamic';
}

/**
 * Ordered from most specific to least specific.
 *
 * Dad's conventions:
 *   "fnd" = found an existing monument
 *   "set" = set a new monument
 *   "calc" = calculated position (stakeout target)
 *
 * Recalculations increment the last letter:
 *   calc → cald → cale → calf → calg → ...
 *
 * Common typos:
 *   "fne" for "fnd", "ste" for "set", "clac" for "calc"
 *
 * Sometimes only a single letter:
 *   "20f" (probably found), "20s" (probably set)
 *   — these get low confidence
 */
const SUFFIX_PATTERNS: SuffixPattern[] = [
  // ── FOUND ──
  { regex: /^(.*?)(\d+)(found)$/i,   action: 'FOUND',      confidence: 1.0, recalcMode: 'none' },
  { regex: /^(.*?)(\d+)(foun)$/i,    action: 'FOUND',      confidence: 1.0, recalcMode: 'none' },
  { regex: /^(.*?)(\d+)(fnd)$/i,     action: 'FOUND',      confidence: 1.0, recalcMode: 'none' },
  { regex: /^(.*?)(\d+)(fne)$/i,     action: 'FOUND',      confidence: 0.95, recalcMode: 'none' }, // Typo: e→d
  { regex: /^(.*?)(\d+)(foud)$/i,    action: 'FOUND',      confidence: 0.95, recalcMode: 'none' }, // Typo: missing n
  { regex: /^(.*?)(\d+)(fd)$/i,      action: 'FOUND',      confidence: 0.9, recalcMode: 'none' },

  // ── SET ──
  { regex: /^(.*?)(\d+)(set)$/i,     action: 'SET',        confidence: 1.0, recalcMode: 'none' },
  { regex: /^(.*?)(\d+)(ste)$/i,     action: 'SET',        confidence: 0.95, recalcMode: 'none' }, // Typo: transposed
  { regex: /^(.*?)(\d+)(sed)$/i,     action: 'SET',        confidence: 0.9, recalcMode: 'none' },  // Typo: d→t
  { regex: /^(.*?)(\d+)(st)$/i,      action: 'SET',        confidence: 0.85, recalcMode: 'none' },

  // ── CALCULATED (base) ──
  { regex: /^(.*?)(\d+)(calculated)$/i, action: 'CALCULATED', confidence: 1.0, recalcMode: 'none' },
  { regex: /^(.*?)(\d+)(calculate)$/i,  action: 'CALCULATED', confidence: 1.0, recalcMode: 'none' },
  { regex: /^(.*?)(\d+)(calc)$/i,       action: 'CALCULATED', confidence: 1.0, recalcMode: 'none' },
  { regex: /^(.*?)(\d+)(clac)$/i,       action: 'CALCULATED', confidence: 0.95, recalcMode: 'none' }, // Typo
  { regex: /^(.*?)(\d+)(calx)$/i,       action: 'CALCULATED', confidence: 0.9, recalcMode: 'none' },  // Typo

  // ── CALCULATED (recalculations: cald, cale, calf, ...) ──
  { regex: /^(.*?)(\d+)(cal[d-z])$/i,   action: 'CALCULATED', confidence: 0.95, recalcMode: 'dynamic' },

  // ── LOW-CONFIDENCE SINGLE-LETTER MATCHES ──
  { regex: /^(.*?)(\d+)(f)$/i,          action: 'FOUND',      confidence: 0.5, recalcMode: 'none' },
  { regex: /^(.*?)(\d+)(s)$/i,          action: 'SET',        confidence: 0.5, recalcMode: 'none' },
  { regex: /^(.*?)(\d+)(c)$/i,          action: 'CALCULATED', confidence: 0.4, recalcMode: 'none' },
];

export function parsePointName(name: string): ParsedPointName {
  const trimmed = name.trim();

  // Try each pattern from most specific to least
  for (const pattern of SUFFIX_PATTERNS) {
    const match = trimmed.match(pattern.regex);
    if (match) {
      const baseNumber = parseInt(match[2]);
      const suffixText = match[3];

      // Recalculation sequence detection
      let recalcSeq = 0;
      let isRecalc = false;
      if (pattern.recalcMode === 'dynamic') {
        const lastChar = suffixText.charAt(suffixText.length - 1).toLowerCase();
        recalcSeq = lastChar.charCodeAt(0) - 'c'.charCodeAt(0); // d=1, e=2, f=3...
        isRecalc = true;
      }

      return {
        baseNumber,
        suffix: suffixText,
        normalizedSuffix: pattern.action,
        suffixVariant: suffixText,
        suffixConfidence: pattern.confidence,
        isRecalc,
        recalcSequence: recalcSeq,
      };
    }
  }

  // No suffix — try to extract just a number
  const numMatch = trimmed.match(/^(\d+)$/);
  if (numMatch) {
    return {
      baseNumber: parseInt(numMatch[1]),
      suffix: '',
      normalizedSuffix: 'NONE',
      suffixVariant: '',
      suffixConfidence: 1.0,
      isRecalc: false,
      recalcSequence: 0,
    };
  }

  // Non-standard name (has letters but doesn't match patterns)
  // Try to extract a leading or trailing number
  const leadingNum = trimmed.match(/^(\d+)/);
  const trailingNum = trimmed.match(/(\d+)$/);
  const bestNum = leadingNum ? parseInt(leadingNum[1]) : (trailingNum ? parseInt(trailingNum[1]) : 0);

  return {
    baseNumber: bestNum,
    suffix: trimmed.replace(/\d+/g, ''),
    normalizedSuffix: 'NONE',
    suffixVariant: trimmed,
    suffixConfidence: 0,
    isRecalc: false,
    recalcSequence: 0,
  };
}

/** Determine monument action: from expanded code OR from point name suffix */
export function resolveMonumentAction(
  codeDefinition: PointCodeDefinition | null,
  parsedName: ParsedPointName,
): MonumentAction | null {
  // Priority 1: If the code itself specifies an action (expanded codes like BC06, BC10)
  if (codeDefinition?.monumentAction) {
    return codeDefinition.monumentAction;
  }

  // Priority 2: If the code is a monument type but uses simplified code (309, 310, etc.)
  // then the point NAME suffix determines the action
  if (codeDefinition?.category === 'BOUNDARY_CONTROL') {
    switch (parsedName.normalizedSuffix) {
      case 'FOUND': return 'FOUND';
      case 'SET': return 'SET';
      case 'CALCULATED': return 'CALCULATED';
      default: return 'UNKNOWN'; // Monument code but no suffix — ambiguous
    }
  }

  // Not a monument code — no action
  return null;
}
```

---

## 7. Point Grouping Logic (calc/set/found Relationships)

```typescript
// packages/codes/src/point-grouping.ts

import type { SurveyPoint, PointGroup } from '@starr-cad/core';
import { distance } from '@starr-cad/geometry';

const DELTA_WARNING_THRESHOLD = 0.10; // feet

export function groupPointsByBaseName(points: SurveyPoint[]): Map<number, PointGroup> {
  const groups = new Map<number, PointGroup>();

  for (const pt of points) {
    const base = pt.parsedName.baseNumber;
    if (base === 0) continue; // Non-standard name — skip grouping

    if (!groups.has(base)) {
      groups.set(base, {
        baseNumber: base,
        allPoints: [],
        calculated: [],
        found: null,
        set: null,
        none: [],
        finalPoint: pt,
        finalSource: 'NONE',
        calcSetDelta: null,
        calcFoundDelta: null,
        hasBothCalcAndField: false,
        deltaWarning: false,
      });
    }

    const group = groups.get(base)!;
    group.allPoints.push(pt);

    switch (pt.parsedName.normalizedSuffix) {
      case 'CALCULATED':
        group.calculated.push(pt);
        break;
      case 'FOUND':
        group.found = pt;
        break;
      case 'SET':
        group.set = pt;
        break;
      case 'NONE':
        group.none.push(pt);
        break;
    }
  }

  // Resolve final points and compute deltas
  for (const group of groups.values()) {
    // Sort calculated points by recalc sequence (latest first)
    group.calculated.sort((a, b) => b.parsedName.recalcSequence - a.parsedName.recalcSequence);

    // Priority: SET > FOUND > latest CALC > NONE
    if (group.set) {
      group.finalPoint = group.set;
      group.finalSource = 'SET';
    } else if (group.found) {
      group.finalPoint = group.found;
      group.finalSource = 'FOUND';
    } else if (group.calculated.length > 0) {
      group.finalPoint = group.calculated[0]; // Latest recalc
      group.finalSource = 'CALCULATED';
    } else if (group.none.length > 0) {
      group.finalPoint = group.none[0];
      group.finalSource = 'NONE';
    }

    // Compute deltas between latest calc and field points
    const latestCalc = group.calculated.length > 0 ? group.calculated[0] : null;

    if (latestCalc && group.set) {
      group.calcSetDelta = distance(
        { x: latestCalc.easting, y: latestCalc.northing },
        { x: group.set.easting, y: group.set.northing }
      );
      group.hasBothCalcAndField = true;
    }

    if (latestCalc && group.found) {
      group.calcFoundDelta = distance(
        { x: latestCalc.easting, y: latestCalc.northing },
        { x: group.found.easting, y: group.found.northing }
      );
      group.hasBothCalcAndField = true;
    }

    // Delta warning: if calc-to-field exceeds threshold
    group.deltaWarning =
      (group.calcSetDelta !== null && group.calcSetDelta > DELTA_WARNING_THRESHOLD) ||
      (group.calcFoundDelta !== null && group.calcFoundDelta > DELTA_WARNING_THRESHOLD);
  }

  return groups;
}

/**
 * For a given point group, determine which points should be visible on the drawing.
 *
 * Default behavior:
 *   - Draw the FINAL point (set > found > calc)
 *   - Optionally show all points with faded styling (user preference)
 *
 * In "show all positions" mode:
 *   - CALC points: magenta target symbol, 50% opacity
 *   - FOUND points: solid symbol, full opacity
 *   - SET points: open symbol, full opacity
 *   - Final point: full opacity, normal styling
 */
export function getVisibleGroupPoints(
  group: PointGroup,
  showAllPositions: boolean,
): { point: SurveyPoint; isFinal: boolean; opacity: number }[] {
  if (!showAllPositions) {
    return [{ point: group.finalPoint, isFinal: true, opacity: 1.0 }];
  }

  const result: { point: SurveyPoint; isFinal: boolean; opacity: number }[] = [];

  for (const pt of group.allPoints) {
    const isFinal = pt.id === group.finalPoint.id;
    result.push({
      point: pt,
      isFinal,
      opacity: isFinal ? 1.0 : 0.4,
    });
  }

  return result;
}
```

---

## 8. Auto-Connect Engine (Line String Builder)

```typescript
// packages/codes/src/auto-connect.ts

import type { SurveyPoint, LineString, LineSegmentType, CodeSuffix } from '@starr-cad/core';
import { generateId } from '@starr-cad/core';
import { lookupCode } from './code-lookup';

export function buildLineStrings(points: SurveyPoint[]): LineString[] {
  const strings: LineString[] = [];
  let current: LineString | null = null;

  for (const point of points) {
    const baseCode = point.parsedCode.baseCode;
    const suffix = point.codeSuffix;
    const codeDef = lookupCode(baseCode);

    // Skip point-only codes — they never connect
    if (!codeDef || codeDef.connectType === 'POINT') {
      // Don't reset current — point codes are "invisible" to line building
      continue;
    }

    switch (suffix) {
      case 'B':
        // Begin new straight line string
        current = {
          id: generateId(), codeBase: baseCode, pointIds: [point.id],
          isClosed: false, segments: [], featureId: null,
        };
        strings.push(current);
        break;

      case 'BA':
        // Begin new line string starting with an arc
        current = {
          id: generateId(), codeBase: baseCode, pointIds: [point.id],
          isClosed: false, segments: [], featureId: null,
        };
        strings.push(current);
        // First segment will be ARC (marked when next point arrives)
        break;

      case null:
        // No suffix — continue current if same code, or start new implicitly
        if (current && current.codeBase === baseCode) {
          current.pointIds.push(point.id);
          // Segment type depends on whether previous suffix was BA or A
          const prevSuffix = getPreviousPointSuffix(points, point, current);
          current.segments.push(prevSuffix === 'BA' || prevSuffix === 'A' ? 'ARC' : 'STRAIGHT');
        } else {
          // Different code or no current — start a new implicit line string
          current = {
            id: generateId(), codeBase: baseCode, pointIds: [point.id],
            isClosed: false, segments: [], featureId: null,
          };
          strings.push(current);
        }
        break;

      case 'A':
        // Arc continuation
        if (current && current.codeBase === baseCode) {
          current.pointIds.push(point.id);
          current.segments.push('ARC');
        }
        break;

      case 'EA':
        // End arc section (line continues as straight after this)
        if (current && current.codeBase === baseCode) {
          current.pointIds.push(point.id);
          current.segments.push('ARC');
          // Don't close — line continues, but arcs stop
        }
        break;

      case 'E':
        // End line string
        if (current && current.codeBase === baseCode) {
          current.pointIds.push(point.id);
          current.segments.push('STRAIGHT');
        }
        current = null;
        break;

      case 'C':
        // Close with straight line
        if (current && current.codeBase === baseCode) {
          current.pointIds.push(point.id);
          current.segments.push('STRAIGHT');
          current.isClosed = true;
        }
        current = null;
        break;

      case 'CA':
        // Close with arc
        if (current && current.codeBase === baseCode) {
          current.pointIds.push(point.id);
          current.segments.push('ARC');
          current.isClosed = true;
        }
        current = null;
        break;
    }
  }

  return strings;
}

function getPreviousPointSuffix(
  allPoints: SurveyPoint[],
  currentPoint: SurveyPoint,
  lineString: LineString,
): CodeSuffix | null {
  if (lineString.pointIds.length < 2) return null;
  const prevId = lineString.pointIds[lineString.pointIds.length - 2];
  const prevPoint = allPoints.find(p => p.id === prevId);
  return prevPoint?.codeSuffix ?? null;
}
```

---

## 9. Auto-Spline Designation

```typescript
// packages/codes/src/auto-connect.ts (continued)

const AUTO_SPLINE_CODES = new Set([
  // Numeric
  '632', '633', '634', '635', '630',   // Stream, River, Pond, Lake, Ditch
  '370',                                 // Wetland
  '729',                                 // Edge of Woods
  '357', '358',                          // Contour Major, Minor
  '753',                                 // Hedge
  // Alpha
  'TP06', 'TP07', 'TP08', 'TP09', 'TP10', 'TP11',
  'VG07', 'FN14',
  'PL08', 'PL09',
]);

export function isAutoSplineCode(baseCode: string): boolean {
  return AUTO_SPLINE_CODES.has(baseCode.toUpperCase());
}

/**
 * After buildLineStrings(), mark line strings that should be spline-fit.
 * This doesn't change the LineString — it sets a flag that Phase 4's
 * rendering will use to fit splines instead of straight segments.
 */
export function markAutoSplineStrings(lineStrings: LineString[]): void {
  for (const ls of lineStrings) {
    if (isAutoSplineCode(ls.codeBase)) {
      // Replace all STRAIGHT segments with SPLINE
      ls.segments = ls.segments.map(s => s === 'STRAIGHT' ? 'SPLINE' as LineSegmentType : s);
    }
  }
}
```

---

## 10. CSV/TXT Import System

```typescript
// packages/import/src/csv-parser.ts

import type { ParsedImportRow } from './types';

export interface CSVImportConfig {
  delimiter: ',' | '\t' | ' ' | '|' | ';';
  hasHeader: boolean;
  skipRows: number;                    // Skip N rows from top (after header)
  encoding: 'utf-8' | 'ascii' | 'latin1';

  // Column mapping (0-based index, -1 = not present)
  columns: {
    pointNumber: number;
    northing: number;
    easting: number;
    elevation: number;                 // -1 if no elevation column
    description: number;               // Contains code + optional description text
  };

  coordinateOrder: 'NE' | 'EN';       // Which order the N/E columns actually are

  // Code extraction from description
  codePosition: 'FIRST_WORD' | 'ENTIRE_FIELD' | 'CUSTOM_REGEX';
  codeRegex?: string;                  // Custom regex for extracting code from description

  // Preset
  presetName: string | null;
  presetId: string | null;
}

export interface ImportPreset {
  id: string;
  name: string;                        // "Carlson SurvCE", "Trimble TSC7", "TxDOT Standard"
  config: CSVImportConfig;
  description: string;
  isBuiltIn: boolean;
}

// Built-in presets for common equipment
export const BUILT_IN_PRESETS: ImportPreset[] = [
  {
    id: 'carlson-survce',
    name: 'Carlson SurvCE (N,E,Z,Desc)',
    config: {
      delimiter: ',', hasHeader: false, skipRows: 0, encoding: 'utf-8',
      columns: { pointNumber: 0, northing: 1, easting: 2, elevation: 3, description: 4 },
      coordinateOrder: 'NE', codePosition: 'FIRST_WORD', presetName: 'Carlson SurvCE', presetId: 'carlson-survce',
    },
    description: 'Standard Carlson SurvCE export: PtNum, N, E, Elev, Code+Desc',
    isBuiltIn: true,
  },
  {
    id: 'trimble-pnezd',
    name: 'Trimble PNEZD',
    config: {
      delimiter: ',', hasHeader: false, skipRows: 0, encoding: 'utf-8',
      columns: { pointNumber: 0, northing: 1, easting: 2, elevation: 3, description: 4 },
      coordinateOrder: 'NE', codePosition: 'FIRST_WORD', presetName: 'Trimble PNEZD', presetId: 'trimble-pnezd',
    },
    description: 'Standard Trimble PNEZD format',
    isBuiltIn: true,
  },
  {
    id: 'generic-penzd',
    name: 'Generic PENZD',
    config: {
      delimiter: ',', hasHeader: false, skipRows: 0, encoding: 'utf-8',
      columns: { pointNumber: 0, northing: 2, easting: 1, elevation: 3, description: 4 },
      coordinateOrder: 'EN', codePosition: 'FIRST_WORD', presetName: 'Generic PENZD', presetId: 'generic-penzd',
    },
    description: 'Easting first, then Northing',
    isBuiltIn: true,
  },
];

export function parseCSV(text: string, config: CSVImportConfig): ParsedImportRow[] {
  const rows: ParsedImportRow[] = [];
  const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');

  let startRow = config.hasHeader ? 1 : 0;
  startRow += config.skipRows;

  for (let i = startRow; i < lines.length; i++) {
    const line = lines[i];
    const cols = splitLine(line, config.delimiter);

    if (cols.length < Math.max(
      config.columns.pointNumber,
      config.columns.northing,
      config.columns.easting,
      config.columns.description,
    ) + 1) {
      rows.push({ lineNumber: i + 1, rawLine: line, error: 'Insufficient columns', data: null });
      continue;
    }

    const ptNum = parseInt(cols[config.columns.pointNumber]);
    const n = parseFloat(cols[config.columns.northing]);
    const e = parseFloat(cols[config.columns.easting]);
    const z = config.columns.elevation >= 0 ? parseFloat(cols[config.columns.elevation]) : null;
    const desc = cols[config.columns.description]?.trim() ?? '';

    if (isNaN(ptNum) || isNaN(n) || isNaN(e)) {
      rows.push({ lineNumber: i + 1, rawLine: line, error: 'Invalid numeric value', data: null });
      continue;
    }

    // Swap N/E if coordinate order is EN
    const northing = config.coordinateOrder === 'NE' ? n : e;
    const easting = config.coordinateOrder === 'NE' ? e : n;

    // Extract code from description
    const { code, remainder } = extractCode(desc, config);

    rows.push({
      lineNumber: i + 1,
      rawLine: line,
      error: null,
      data: {
        pointNumber: ptNum,
        pointName: cols[config.columns.pointNumber].trim(), // Original text (may be "20set")
        northing,
        easting,
        elevation: z !== null && !isNaN(z) ? z : null,
        rawCode: code,
        description: remainder,
      },
    });
  }

  return rows;
}

function splitLine(line: string, delimiter: string): string[] {
  // Handle quoted fields (CSV standard)
  if (delimiter === ',') {
    // Use simple CSV parsing that handles quoted commas
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (const char of line) {
      if (char === '"') { inQuotes = !inQuotes; }
      else if (char === ',' && !inQuotes) { result.push(current); current = ''; }
      else { current += char; }
    }
    result.push(current);
    return result;
  }
  return line.split(delimiter);
}

function extractCode(
  description: string,
  config: CSVImportConfig,
): { code: string; remainder: string } {
  if (config.codePosition === 'ENTIRE_FIELD') {
    return { code: description, remainder: '' };
  }
  if (config.codePosition === 'CUSTOM_REGEX' && config.codeRegex) {
    const match = description.match(new RegExp(config.codeRegex));
    if (match) {
      return { code: match[1] || match[0], remainder: description.replace(match[0], '').trim() };
    }
  }
  // Default: FIRST_WORD
  const spaceIdx = description.indexOf(' ');
  if (spaceIdx === -1) return { code: description, remainder: '' };
  return {
    code: description.substring(0, spaceIdx),
    remainder: description.substring(spaceIdx + 1).trim(),
  };
}
```

---

## 11. RW5 (Carlson) Import Parser

```typescript
// packages/import/src/rw5-parser.ts

/**
 * RW5 is a Carlson SurvCE raw data format. Each line starts with a
 * two-letter record type.
 *
 * Key record types:
 *   SP = Store Point (the main record we care about)
 *     SP,PN1,N 1234.5678,E 5678.1234,EL100.000,--20set 742B
 *
 *   Other types (ignored in Phase 2, potentially useful later):
 *   JB = Job info
 *   MO = Mode settings
 *   OC = Occupy point
 *   LS = Line of Sight / backsight
 *   SS = Sideshot
 *   TR = Traverse
 *   BD = Bearing-Distance
 */

import type { ParsedImportRow } from './types';

export function parseRW5(text: string): ParsedImportRow[] {
  const rows: ParsedImportRow[] = [];
  const lines = text.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('--')) continue; // Comment or blank

    // Only process SP (Store Point) records
    if (!line.startsWith('SP,')) continue;

    try {
      // Format: SP,PN{number},N {northing},E {easting},EL{elevation},--{name} {code}
      const parts = line.split(',');

      // Point number: "PN1" → 1
      const pnPart = parts.find(p => p.startsWith('PN'));
      const ptNum = pnPart ? parseInt(pnPart.substring(2)) : 0;

      // Northing: "N 1234.5678"
      const nPart = parts.find(p => p.trimStart().startsWith('N '));
      const northing = nPart ? parseFloat(nPart.trim().substring(2)) : 0;

      // Easting: "E 5678.1234"
      const ePart = parts.find(p => p.trimStart().startsWith('E '));
      const easting = ePart ? parseFloat(ePart.trim().substring(2)) : 0;

      // Elevation: "EL100.000"
      const elPart = parts.find(p => p.trimStart().startsWith('EL'));
      const elevation = elPart ? parseFloat(elPart.trim().substring(2)) : null;

      // Description: "--20set 742B" → name="20set", code="742B"
      const descPart = parts.find(p => p.trimStart().startsWith('--'));
      let pointName = ptNum.toString();
      let rawCode = '';
      let description = '';

      if (descPart) {
        const descText = descPart.trim().substring(2).trim(); // Strip leading "--"
        const words = descText.split(/\s+/);
        if (words.length >= 2) {
          pointName = words[0];
          rawCode = words[1];
          description = words.slice(2).join(' ');
        } else if (words.length === 1) {
          // Could be just a code or just a name
          if (/^\d+[a-zA-Z]*$/.test(words[0])) {
            rawCode = words[0];
          } else {
            pointName = words[0];
          }
        }
      }

      rows.push({
        lineNumber: i + 1,
        rawLine: line,
        error: null,
        data: {
          pointNumber: ptNum,
          pointName,
          northing,
          easting,
          elevation: elevation !== null && !isNaN(elevation) ? elevation : null,
          rawCode,
          description,
        },
      });
    } catch (err) {
      rows.push({ lineNumber: i + 1, rawLine: line, error: `Parse error: ${err}`, data: null });
    }
  }

  return rows;
}
```

---

## 12. JobXML (Trimble) Import Parser

```typescript
// packages/import/src/jobxml-parser.ts

/**
 * JobXML is Trimble's XML-based survey data format.
 * Key elements:
 *   <JOBFile> root
 *     <Reductions>
 *       <Point>
 *         <Name>20set</Name>
 *         <Code>742B</Code>
 *         <Grid><North>N</North><East>E</East><Elevation>Z</Elevation></Grid>
 *       </Point>
 */

import type { ParsedImportRow } from './types';

export function parseJobXML(xmlText: string): ParsedImportRow[] {
  // Use fast-xml-parser for parsing
  // In browser without the library, use DOMParser as fallback
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'application/xml');
  const rows: ParsedImportRow[] = [];

  const points = doc.querySelectorAll('Point');
  let lineNum = 0;

  points.forEach((ptEl) => {
    lineNum++;
    try {
      const name = ptEl.querySelector('Name')?.textContent?.trim() ?? '';
      const code = ptEl.querySelector('Code')?.textContent?.trim() ?? '';
      const northEl = ptEl.querySelector('Grid > North, Grid North, North');
      const eastEl = ptEl.querySelector('Grid > East, Grid East, East');
      const elevEl = ptEl.querySelector('Grid > Elevation, Grid Elevation, Elevation');

      const northing = northEl ? parseFloat(northEl.textContent ?? '0') : 0;
      const easting = eastEl ? parseFloat(eastEl.textContent ?? '0') : 0;
      const elevation = elevEl ? parseFloat(elevEl.textContent ?? '0') : null;

      // Extract point number from Name (might be "20set" → 20, or just "100" → 100)
      const numMatch = name.match(/^(\d+)/);
      const ptNum = numMatch ? parseInt(numMatch[1]) : lineNum;

      rows.push({
        lineNumber: lineNum,
        rawLine: ptEl.outerHTML.substring(0, 200), // First 200 chars for debugging
        error: null,
        data: {
          pointNumber: ptNum,
          pointName: name,
          northing,
          easting,
          elevation: elevation !== null && !isNaN(elevation) ? elevation : null,
          rawCode: code,
          description: '',
        },
      });
    } catch (err) {
      rows.push({ lineNumber: lineNum, rawLine: '', error: `XML parse error: ${err}`, data: null });
    }
  });

  return rows;
}
```

---

## 13. Import Pipeline (Unified)

The import pipeline takes parsed rows from any format and creates fully classified SurveyPoints.

```typescript
// packages/import/src/import-pipeline.ts

import type { SurveyPoint, PointGroup, LineString, ValidationIssue } from '@starr-cad/core';
import { generateId } from '@starr-cad/core';
import { parseCodeWithSuffix } from '@starr-cad/codes';
import { parsePointName, resolveMonumentAction } from '@starr-cad/codes';
import { lookupCode } from '@starr-cad/codes';
import { groupPointsByBaseName } from '@starr-cad/codes';
import { buildLineStrings, markAutoSplineStrings } from '@starr-cad/codes';
import { validatePoints } from './validation';
import type { ParsedImportRow } from './types';

export interface ImportResult {
  points: SurveyPoint[];
  lineStrings: LineString[];
  pointGroups: Map<number, PointGroup>;
  validationIssues: ValidationIssue[];
  stats: ImportStats;
}

export interface ImportStats {
  totalRows: number;
  parsedSuccessfully: number;
  parseErrors: number;
  recognizedCodes: number;
  unrecognizedCodes: number;
  pointCodeCount: number;       // Codes with connectType 'POINT'
  lineCodeCount: number;        // Codes with connectType 'LINE'
  lineStringsBuilt: number;
  pointGroupsFound: number;
  groupsWithCalcAndField: number;
  deltaWarnings: number;
  monumentsFound: number;
  monumentsSet: number;
  monumentsCalculated: number;
}

export function processImport(
  parsedRows: ParsedImportRow[],
  sourceFileName: string,
): ImportResult {
  const points: SurveyPoint[] = [];
  const stats: ImportStats = {
    totalRows: parsedRows.length,
    parsedSuccessfully: 0, parseErrors: 0,
    recognizedCodes: 0, unrecognizedCodes: 0,
    pointCodeCount: 0, lineCodeCount: 0,
    lineStringsBuilt: 0, pointGroupsFound: 0,
    groupsWithCalcAndField: 0, deltaWarnings: 0,
    monumentsFound: 0, monumentsSet: 0, monumentsCalculated: 0,
  };

  // ── Step 1: Convert parsed rows to SurveyPoints ──
  for (const row of parsedRows) {
    if (row.error || !row.data) {
      stats.parseErrors++;
      continue;
    }
    stats.parsedSuccessfully++;

    const d = row.data;
    const parsedCode = parseCodeWithSuffix(d.rawCode);
    const codeDef = lookupCode(parsedCode.baseCode);
    const parsedName = parsePointName(d.pointName);

    if (codeDef) stats.recognizedCodes++;
    else stats.unrecognizedCodes++;
    if (codeDef?.connectType === 'POINT') stats.pointCodeCount++;
    if (codeDef?.connectType === 'LINE') stats.lineCodeCount++;

    const monumentAction = resolveMonumentAction(codeDef, parsedName);
    if (monumentAction === 'FOUND') stats.monumentsFound++;
    if (monumentAction === 'SET') stats.monumentsSet++;
    if (monumentAction === 'CALCULATED') stats.monumentsCalculated++;

    const surveyPoint: SurveyPoint = {
      id: generateId(),
      pointNumber: d.pointNumber,
      pointName: d.pointName,
      parsedName,
      northing: d.northing,
      easting: d.easting,
      elevation: d.elevation,
      rawCode: d.rawCode,
      parsedCode,
      resolvedAlphaCode: codeDef?.alphaCode ?? parsedCode.baseCode,
      resolvedNumericCode: codeDef?.numericCode ?? parsedCode.baseCode,
      codeSuffix: parsedCode.suffix,
      codeDefinition: codeDef,
      monumentAction,
      description: d.description,
      rawRecord: row.rawLine,
      importSource: sourceFileName,
      layerId: codeDef?.defaultLayerId ?? 'MISC',
      featureId: '',  // Assigned when Feature is created
      lineStringIds: [],
      validationIssues: [],
      confidence: -1,
      isAccepted: true,
    };

    points.push(surveyPoint);
  }

  // ── Step 2: Build line strings from B/E suffixes ──
  const lineStrings = buildLineStrings(points);
  markAutoSplineStrings(lineStrings);
  stats.lineStringsBuilt = lineStrings.length;

  // Wire points back to their line strings
  for (const ls of lineStrings) {
    for (const ptId of ls.pointIds) {
      const pt = points.find(p => p.id === ptId);
      if (pt) pt.lineStringIds.push(ls.id);
    }
  }

  // ── Step 3: Group points by base name (calc/set/found) ──
  const pointGroups = groupPointsByBaseName(points);
  stats.pointGroupsFound = pointGroups.size;
  for (const group of pointGroups.values()) {
    if (group.hasBothCalcAndField) stats.groupsWithCalcAndField++;
    if (group.deltaWarning) stats.deltaWarnings++;
  }

  // ── Step 4: Validate ──
  const validationIssues = validatePoints(points, lineStrings, pointGroups);
  for (const issue of validationIssues) {
    const pt = points.find(p => p.id === issue.pointId);
    if (pt) pt.validationIssues.push(issue);
  }

  return { points, lineStrings, pointGroups, validationIssues, stats };
}
```

---

## 14. Data Validation System

> **Note:** Full validation rule implementations will be detailed in a subsequent update. The `validatePoints` function signature used by the Import Pipeline (Section 13) is:

```typescript
// packages/import/src/validation.ts

import type { SurveyPoint, LineString, PointGroup, ValidationIssue, ValidationIssueType } from '@starr-cad/core';

export function validatePoints(
  points: SurveyPoint[],
  lineStrings: LineString[],
  pointGroups: Map<number, PointGroup>,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  // Rules applied (see Acceptance Tests §Validation for the full list):
  //   DUPLICATE_POINT_NUMBER  — WARNING, autoFixable: false
  //   ZERO_COORDINATES        — ERROR,   autoFixable: false
  //   UNRECOGNIZED_CODE       — WARNING, autoFixable: false
  //   COORDINATE_OUTLIER      — WARNING, autoFixable: false
  //   SINGLE_POINT_LINE       — WARNING, autoFixable: false
  //   NAME_SUFFIX_AMBIGUOUS   — INFO,    autoFixable: false (suffixConfidence < 0.7)
  //   CALC_WITHOUT_FIELD      — INFO,    autoFixable: false
  //   ORPHAN_END_SUFFIX       — WARNING, autoFixable: false
  //   ORPHAN_BEGIN_SUFFIX     — WARNING, autoFixable: false
  return issues;
}
```

---

## 15. Simplified Export & Code Collapse Map

```typescript
// packages/codes/src/collapse-map.ts

import { MASTER_CODE_LIBRARY } from './code-library';

// Build the collapse map: expandedNumeric → simplifiedNumeric
const COLLAPSE_MAP = new Map<string, string>();

for (const code of MASTER_CODE_LIBRARY) {
  if (code.collapses && code.numericCode !== code.simplifiedCode) {
    COLLAPSE_MAP.set(code.numericCode, code.simplifiedCode);
  }
}

/** Get the simplified (dad-mode) code for a numeric code */
export function getSimplifiedCode(numericCode: string): string {
  return COLLAPSE_MAP.get(numericCode) ?? numericCode;
}

/** Check if a code will collapse in simplified export */
export function willCollapse(numericCode: string): boolean {
  return COLLAPSE_MAP.has(numericCode);
}

/** Get all collapse mappings (for UI display) */
export function getCollapseTable(): { from: string; to: string; description: string }[] {
  const result: { from: string; to: string; description: string }[] = [];
  for (const code of MASTER_CODE_LIBRARY) {
    if (code.collapses) {
      result.push({
        from: `${code.alphaCode}/${code.numericCode} (${code.description})`,
        to: `${code.simplifiedCode} (${code.simplifiedDescription})`,
        description: `${code.description} → ${code.simplifiedDescription}`,
      });
    }
  }
  return result;
}

// Codes that collapse (16 total):
// 315 (3/8" IR Set) → 308     327 (3/8" IR Calc) → 308
// 317 (1/2" IR Set) → 309     328 (1/2" IR Calc) → 309
// 318 (5/8" IR Set) → 310     329 (5/8" IR Calc) → 310
// 319 (3/4" IR Set) → 311     330 (3/4" IR Calc) → 311
// 331 (IP Set) → 312          332 (IP Calc) → 312
// 333 (CM Set) → 313          334 (CM Calc) → 313
// 335 (C/D Set) → 314         336 (C/D Calc) → 314
// 339 (PKN Set) → 338         345 (MN Set) → 340
```

---

## 16. Code Display Toggle

```typescript
// A global preference stored in DrawingSettings (updated in Phase 2):

// Add to DrawingSettings:
export interface DrawingSettings {
  // ... (Phase 1 fields)
  codeDisplayMode: 'ALPHA' | 'NUMERIC';  // NEW
}

// Usage: wherever a code is displayed, check this setting:
function getDisplayCode(point: SurveyPoint, mode: 'ALPHA' | 'NUMERIC'): string {
  const base = mode === 'ALPHA' ? point.resolvedAlphaCode : point.resolvedNumericCode;
  const suffix = point.codeSuffix ?? '';
  return base + suffix;
}
```

---

## 17. State Management (New & Updated Stores)

### 17.1 Point Store

```typescript
// packages/store/src/point-store.ts

interface PointStore {
  // State
  points: Record<string, SurveyPoint>;
  lineStrings: Record<string, LineString>;
  pointGroups: Map<number, PointGroup>;
  showAllGroupPositions: boolean;      // Toggle to see calc/set/found overlay

  // Actions
  importPoints: (result: ImportResult) => void;
  addPoint: (point: SurveyPoint) => void;
  removePoint: (pointId: string) => void;
  updatePoint: (pointId: string, updates: Partial<SurveyPoint>) => void;
  clearAllPoints: () => void;

  // Queries
  getPoint: (id: string) => SurveyPoint | undefined;
  getPointByNumber: (num: number) => SurveyPoint | undefined;
  getPointsByCode: (baseCode: string) => SurveyPoint[];
  getPointsByLayer: (layerId: string) => SurveyPoint[];
  getPointGroup: (baseNumber: number) => PointGroup | undefined;
  getAllPoints: () => SurveyPoint[];
  getPointCount: () => number;

  // Sorting/filtering for point table
  getSortedPoints: (sortBy: string, direction: 'asc' | 'desc', filter?: string) => SurveyPoint[];

  // Toggle
  setShowAllGroupPositions: (show: boolean) => void;
}
```

### 17.2 Import Store

```typescript
// packages/store/src/import-store.ts

interface ImportStore {
  // Dialog state
  isOpen: boolean;
  step: 'FILE_SELECT' | 'COLUMN_MAPPING' | 'PREVIEW' | 'VALIDATION' | 'COMPLETE';

  // File
  file: File | null;
  fileType: 'CSV' | 'TXT' | 'RW5' | 'JOBXML' | null;
  rawText: string;

  // Config
  config: CSVImportConfig;
  selectedPreset: ImportPreset | null;
  customPresets: ImportPreset[];

  // Preview
  previewRows: ParsedImportRow[];
  previewLimit: number;  // Show first N rows (default: 50)

  // Results
  importResult: ImportResult | null;

  // Actions
  openDialog: () => void;
  closeDialog: () => void;
  setFile: (file: File) => void;
  setConfig: (config: Partial<CSVImportConfig>) => void;
  selectPreset: (preset: ImportPreset) => void;
  saveCustomPreset: (name: string) => void;
  parsePreview: () => void;
  executeImport: () => void;
  nextStep: () => void;
  prevStep: () => void;
}
```

---

## 18. Point Table Panel UI

A dockable panel (bottom or side) showing all imported points in a sortable, filterable table.

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Points (234 total)   [Filter: ________]  [Code ▼ Alpha]  [Show Groups] │
├─────┬─────────┬──────────┬──────────┬──────┬────────┬───────┬──────────┤
│  #  │  Name   │ Northing │ Easting  │ Elev │  Code  │Action │ Issues   │
├─────┼─────────┼──────────┼──────────┼──────┼────────┼───────┼──────────┤
│   1 │ 1       │ 2145000  │  598000  │ 820  │ SC01   │  —    │          │
│  20 │ 20calc  │ 2145123  │  598234  │ 815  │ BC02   │ CALC  │          │
│  20 │ 20cald  │ 2145123  │  598234  │ 815  │ BC02   │ CALC² │          │
│  20 │ 20set   │ 2145124  │  598235  │ 815  │ BC06   │ SET ★ │ Δ=0.05' │
│  21 │ 21fnd   │ 2145200  │  598300  │ 818  │ BC02   │ FOUND │          │
│  35 │ 35      │ 2145150  │  598180  │ 812  │ FN03B  │  —    │          │
│  36 │ 36      │ 2145160  │  598190  │ 813  │ FN03   │  —    │          │
│  37 │ 37      │ 2145170  │  598200  │ 814  │ FN03E  │  —    │          │
│  50 │ 50      │ 2145000  │  598100  │  —   │ VG01   │  —    │ No elev  │
└─────┴─────────┴──────────┴──────────┴──────┴────────┴───────┴──────────┘
│ Click row to select on canvas │ Right-click for context menu            │
└──────────────────────────────────────────────────────────────────────────┘
```

**Legend:**
- Action column: `FOUND`, `SET`, `CALC`, `CALC²` (recalc), `—` (none)
- `★` = final/drawn point in a group
- `Δ` = calc-to-field delta distance
- Issues: validation warnings shown as small colored badges

**Features:**
- Click column header to sort (ascending/descending toggle)
- Type in filter box to search by name, code, or description
- Click a row → selects that point on the canvas and zooms to it
- Right-click → context menu: Edit Point, Change Code, Change Layer, Delete
- "Code ▼" dropdown toggles between Alpha and Numeric code display
- "Show Groups" toggle shows/hides the calc/set/found group relationships
- Color coding: rows with validation errors highlighted in soft red/yellow
- Point groups: rows belonging to the same base number get a left-border color stripe
- `★` icon marks the "final" (drawn) point in each group

---

## 19. Import Dialog UI

A multi-step wizard dialog:

### Step 1: File Select
- Drag-and-drop zone or file picker
- Auto-detect file type from extension (`.csv`, `.txt`, `.rw5`, `.jxl`)
- Show first 10 lines of raw file text
- Preset selector dropdown (built-in + user-saved)

### Step 2: Column Mapping *(CSV/TXT only — RW5 and JobXML skip this)*
- Visual column mapper: shows the first 5 data rows as a table
- Click a column header → assign it (Point Number, Northing, Easting, Elevation, Description)
- Coordinate order toggle (N,E vs E,N)
- Delimiter selector (comma, tab, space, pipe)
- Header row toggle
- Code extraction mode selector

### Step 3: Preview
- Shows first 50 parsed points in a mini table
- Point Name, Coordinates, Code (resolved to alpha), Suffix, Action, Layer
- Color-coded rows for issues (red = error, yellow = warning)
- Stats summary: `"234 points parsed, 2 errors, 12 unrecognized codes"`

### Step 4: Validation Report
- Grouped by issue type
- Expandable sections: `"3 duplicate point numbers"`, `"12 unrecognized codes"`, etc.
- "Import Anyway" button (imports everything, issues become warnings)
- "Fix and Re-import" button (goes back to adjust)

### Step 5: Complete
- Summary stats (final counts, point groups, line strings built, etc.)
- "View Point Table" button
- "Zoom to Imported Points" button

---

## 20. Canvas Rendering Updates

Phase 2 updates the Phase 1 renderer to handle `SurveyPoint`s:

- Each `SurveyPoint` creates a `POINT` Feature on the canvas (same as Phase 1)
- Point rendering: still a simple cross/dot in Phase 2 (Phase 3 upgrades to symbols)
- Point color: use code's `defaultColor` if available, else layer color
- Line strings: create `POLYLINE` Features from each `LineString`'s points
- Line string color: use code's `defaultColor`
- Points in hidden layers (`layer.visible === false`) are not rendered
- The code display toggle updates visible labels (just the code text near each point)
- Point labels: small text showing the code (alpha or numeric) near each point

---

## 21. Acceptance Tests

**Phase 2 Status: ✅ COMPLETE** — All acceptance tests pass. Implementation lives in `lib/cad/codes/` (code library, lookup, suffix parsing, grouping, auto-connect), `lib/cad/import/` (CSV/RW5/JobXML parsers, pipeline, validation), `lib/cad/store/` (point-store, import-store), and `app/admin/cad/components/` (ImportDialog, PointTablePanel). Accessible at `/admin/cad` via File → Import.

### Code System
- [x] All 134+ built-in codes load correctly (152 codes in `code-library.ts`)
- [x] Alpha-to-numeric lookup works for every code (`lookupByAlpha` in `code-lookup.ts`)
- [x] Numeric-to-alpha lookup works for every code (`lookupByNumeric` in `code-lookup.ts`)
- [x] Code suffix parser correctly strips `B`, `E`, `C`, `A`, `BA`, `EA`, `CA` (`code-suffix-parser.ts`)
- [x] Suffix parser doesn't strip letters that aren't suffixes (e.g., `"309"` stays `"309"`)
- [x] Code suffix parser validates the base code exists before accepting the suffix

### Point Name Intelligence
- [x] `"20fnd"` → `baseNumber=20`, `FOUND`, `confidence=1.0`
- [x] `"20fne"` → `baseNumber=20`, `FOUND`, `confidence=0.95` (typo detected)
- [x] `"20set"` → `baseNumber=20`, `SET`, `confidence=1.0`
- [x] `"20ste"` → `baseNumber=20`, `SET`, `confidence=0.95` (typo detected)
- [x] `"20calc"` → `baseNumber=20`, `CALCULATED`, `recalcSeq=0`
- [x] `"20cald"` → `baseNumber=20`, `CALCULATED`, `recalcSeq=1`, `isRecalc=true`
- [x] `"20cale"` → `baseNumber=20`, `CALCULATED`, `recalcSeq=2`, `isRecalc=true`
- [x] `"20calf"` → `baseNumber=20`, `CALCULATED`, `recalcSeq=3`, `isRecalc=true`
- [x] `"100"` → `baseNumber=100`, `NONE` (no suffix)
- [x] `"20f"` → `baseNumber=20`, `FOUND`, `confidence=0.5` (low confidence flagged)

### Point Grouping
- [x] Points `20calc`, `20cald`, `20set` group together under `baseNumber=20`
- [x] `SET` chosen as `finalPoint` when present
- [x] `FOUND` chosen when no `SET` exists
- [x] Latest recalc chosen when only `CALC`s exist
- [x] `calcSetDelta` computed correctly
- [x] `deltaWarning=true` when delta > `0.10'`
- [x] Points without matching base numbers are NOT grouped

### CSV Import
- [x] Standard PNEZD CSV imports correctly
- [x] Tab-delimited file imports correctly
- [x] Files with headers detected and skipped
- [x] Column mapper correctly assigns columns
- [x] Coordinate order swap (EN vs NE) works
- [x] Code extracted from description field's first word
- [x] Import presets load and apply correctly
- [x] Custom preset can be saved and loaded

### RW5 Import
- [x] `SP` records parsed correctly (`PN`, `N`, `E`, `EL`, description)
- [x] Non-SP records (`JB`, `MO`, `OC`) are skipped
- [x] Point name extracted from description
- [x] Code extracted from description

### JobXML Import
- [x] Point elements parsed with `Name`, `Code`, `Grid` coordinates
- [x] Elevation parsed correctly
- [x] Missing elevation handled (`null`)

### Auto-Connect
- [x] `"742B"` starts a new line string
- [x] `"742"` (no suffix) continues the line string
- [x] `"742E"` ends the line string
- [x] `"742C"` closes the line string
- [x] `"742BA"` starts with arc
- [x] `"742A"` continues as arc segment
- [x] `"742EA"` ends arc section (bug fixed: now correctly terminates line string)
- [x] `"742CA"` closes with arc
- [x] Auto-spline codes (`632`, `634`, `729`, etc.) mark segments as `SPLINE` (now also uses code library `isAutoSpline` flag, covering numeric codes `508`, `509`, `730`, `751`)
- [x] Line strings create `POLYLINE` features on the canvas

### Validation
- [x] Duplicate point numbers flagged as `WARNING`
- [x] Zero coordinates flagged as `ERROR`
- [x] Unrecognized codes flagged as `WARNING`
- [x] Coordinate outliers detected
- [x] Single-point line strings flagged
- [x] Low-confidence name suffixes flagged as `INFO`
- [x] Calc-only points (no set/found) flagged as `INFO`

### Point Table
- [x] All imported points displayed in table
- [x] Sort by any column works
- [x] Filter by text works (searches name, code, description)
- [x] Click row → selects point on canvas
- [x] Code display toggle switches alpha ↔ numeric
- [x] Point groups shown with color-coded stripes
- [x] Final point marked with `★`

### Simplified Export
- [x] Export with collapse ON: `317→309`, `328→309`, etc.
- [x] Export with collapse OFF: codes unchanged
- [x] Point names preserved exactly (fnd, set, calc stay)
- [x] B/E suffixes optionally preserved
- [x] Output matches expected CSV format

---

## 22. Build Order (Implementation Sequence)

### Week 1: Code System Foundation
1. Create `packages/codes` package with `tsconfig` and `package.json`
2. Define all types in `packages/core/src/types.ts` (`SurveyPoint`, `PointCodeDefinition`, etc.)
3. Build `code-library.ts` with all 134+ code definitions
4. Build `code-lookup.ts` (alpha↔numeric bidirectional lookup, fuzzy matching)
5. Build `code-suffix-parser.ts` (`B/E/A/BA/EA/CA` stripping)
6. Write unit tests for lookup and suffix parsing (30+ test cases)

### Week 2: Name Intelligence & Grouping
1. Build `name-suffix-parser.ts` (fnd/set/calc fuzzy matching, recalc detection)
2. Write unit tests for name parser (all patterns from acceptance tests above)
3. Build `point-grouping.ts` (group by base number, resolve final, compute deltas)
4. Write unit tests for grouping (calc+set, calc+found, calc-only, no-suffix, delta warnings)
5. Build `auto-connect.ts` (line string builder from B/E suffixes)
6. Build auto-spline designation
7. Write unit tests for auto-connect (10+ scenarios)

### Week 3: Import Parsers
1. Create `packages/import` package
2. Build `csv-parser.ts` with column mapping and preset system
3. Build `rw5-parser.ts` (SP record parsing)
4. Build `jobxml-parser.ts` (XML Point element parsing)
5. Build `import-pipeline.ts` (unified: parse → classify → group → validate)
6. Build `validation.ts` (all 8 validation rules)
7. Write tests for each parser with sample data files
8. Build `collapse-map.ts` for simplified export

### Week 4: State & UI Integration
1. Create `point-store.ts` in `packages/store`
2. Create `import-store.ts` in `packages/store`
3. Update `drawing-store.ts` to wire `SurveyPoint`s into Features
4. Build `ImportDialog` component (5-step wizard)
5. Build `ColumnMapper` component
6. Build `ImportPreview` component
7. Build `ValidationReport` component
8. Wire Import button into toolbar

### Week 5: Point Table & Canvas
1. Build `PointTablePanel` component (sortable, filterable table)
2. Build `PointGroupPanel` component (calc/set/found viewer)
3. Add code display toggle to settings
4. Update canvas renderer to color points by code's `defaultColor`
5. Update canvas to render line strings as polylines from auto-connect
6. Add point labels (code text near each point)
7. Wire point table click → canvas selection + zoom

### Week 6: Polish & Testing
1. Build simplified export function
2. Test import with real Starr Surveying field files
3. Handle edge cases (empty files, single-point files, all-calc files)
4. Run ALL acceptance tests from Section 21
5. Fix any failures
6. Performance test with 5,000+ point file
7. Document any deviations from spec

---

### Copilot Session Template

> I am building Starr CAD Phase 2 — Data Import & Point Code System. Phase 1 (CAD engine core with PixiJS canvas, selection, undo, snap, layers, file I/O) is complete. I am now adding field data import (CSV, RW5, JobXML), a 134-code dual-code library (alpha ↔ numeric), point name suffix intelligence that fuzzy-matches fnd/set/calc variants and detects recalculations (cald, cale, calf), point grouping that resolves calc/set/found relationships, and auto-connect logic that builds line strings from B/E suffixes. The full Phase 2 spec is in `STARR_CAD_PHASE_2_DATA_IMPORT.md`. All types are defined in Section 2. I am currently working on **[CURRENT TASK from Build Order]**.

---

*End of Phase 2 Specification*

*Starr Surveying Company — Belton, Texas — March 2026*
