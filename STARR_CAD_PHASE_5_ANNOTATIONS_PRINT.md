# STARR CAD — Phase 5: Annotations, Dimensions, Templates & Print

**Version:** 1.1 | **Date:** March 2026 | **Phase:** 5 of 8

**Phase 5 Status: ✅ COMPLETE** — All annotation types, auto-annotation engine, label optimizer, template system (standard notes, certification, legend, sheet border, default templates, print engine), Zustand stores (annotation-store, template-store), and React UI components (AnnotationPanel, CertificationEditor, StandardNotesEditor, PrintDialog) are implemented. 139 new unit tests across 6 new test files + 1 templates test file. 597 total CAD tests pass.

**What Has Been Built:**
- ✅ `TitleBlockConfig` type — complete definition with north arrow, scale bar, signature block, draggable positions, per-element scale/rotation, custom field labels (`lib/cad/types.ts`)
- ✅ `TitleBlockPanel.tsx` — config panel with north arrow style, scale bar settings, metadata fields, visibility toggles (241 lines)
- ✅ `TitleBlockEditorModal.tsx` — per-element editor for scale, rotation, custom field label overrides
- ✅ `ScaleBarEditorModal.tsx` — segment count, units, length, scale, rotation with SVG live preview
- ✅ Title block PIXI rendering in `CanvasViewport.tsx` — 5 north arrow styles (SIMPLE, COMPASS_ROSE, DETAILED, TRADITIONAL, STARR), checkered graphic scale bar, drag support for all 6 elements
- ✅ `generate-labels.ts` — `generateLabelsForFeature()` produces TextLabel instances for a single feature (bearing, distance, area, elevation, point name, coords); `regenerateLayerLabels()` batch-regenerates all features on a layer
- ✅ `TextLabel` / `TextLabelKind` types and `LayerDisplayPreferences` in `lib/cad/types.ts`
- ✅ `FeatureLabelPreferencesPanel.tsx` — per-layer label visibility toggles (bearing, distance, name, etc.)
- ✅ `lib/cad/labels/annotation-types.ts` — 6 annotation interfaces (BearingDistanceDimension, CurveDataAnnotation, MonumentLabel, AreaAnnotation, TextAnnotation, LeaderAnnotation)
- ✅ `lib/cad/labels/bearing-dim.ts` — `createBearingDimension()`, `computeBearingDimPlacement()`, DEFAULT_BEARING_DIM_CONFIG
- ✅ `lib/cad/labels/curve-label.ts` — `buildCurveDataLines()`, `createCurveDataAnnotation()`, `computeCurveLabelPosition()`, DEFAULT_CURVE_DATA_CONFIG
- ✅ `lib/cad/labels/monument-label.ts` — `getMonumentText()`, `createMonumentLabel()`, `computeMonumentLabelPosition()`, `pickBestOffsetAngle()`
- ✅ `lib/cad/labels/area-label.ts` — `computeCentroid()`, `buildAreaText()`, `createAreaAnnotation()`, DEFAULT_AREA_LABEL_CONFIG
- ✅ `lib/cad/labels/auto-annotate.ts` — `autoAnnotate()` one-pass engine with bearing-dims, curve data, monument labels, area labels; DEFAULT_AUTO_ANNOTATE_CONFIG
- ✅ `lib/cad/labels/label-optimizer.ts` — `optimizeLabels()` simulated-annealing optimizer with flip/slide/shrink/leader-add strategies, probabilistic acceptance
- ✅ `lib/cad/templates/types.ts` — PaperSize, PAPER_DIMENSIONS, DrawingTemplate, PrintConfig, all sub-config interfaces
- ✅ `lib/cad/templates/standard-notes.ts` — 24+ standard survey notes (basis of bearing, monuments, survey type, datum, flood zone, utilities), `getDefaultNotes()`, `formatNoteText()`
- ✅ `lib/cad/templates/certification.ts` — DEFAULT_CERTIFICATION_TEXT, `formatCertificationText()`, DEFAULT_CERTIFICATION_CONFIG
- ✅ `lib/cad/templates/legend.ts` — `autoPopulateLegend()`, DEFAULT_LEGEND_CONFIG
- ✅ `lib/cad/templates/sheet-border.ts` — `computeTitleBlockBounds()`, `computeDrawableArea()`, DEFAULT_BORDER_CONFIG
- ✅ `lib/cad/templates/default-templates.ts` — STARR_SURVEYING_TEMPLATE (Tabloid/Landscape/50), LETTER_TEMPLATE, ARCH_D_TEMPLATE, STARR_COMPANY_INFO
- ✅ `lib/cad/templates/print-engine.ts` — `computePrintTransform()`, `buildPrintTitle()`, DEFAULT_PRINT_CONFIG
- ✅ `lib/cad/store/annotation-store.ts` — Zustand store: CRUD, autoAnnotateAll, runOptimizer, queries
- ✅ `lib/cad/store/template-store.ts` — Zustand store: active template management, print config, custom template save/delete
- ✅ `app/admin/cad/components/AnnotationPanel.tsx` — 3-tab panel (Annotations count / Auto-Annotate / Optimizer stats+Run)
- ✅ `app/admin/cad/components/CertificationEditor.tsx` — RPLS certification block editor
- ✅ `app/admin/cad/components/StandardNotesEditor.tsx` — Standard notes selector grouped by category + custom notes
- ✅ `app/admin/cad/components/PrintDialog.tsx` — Full print/export modal (paper, scale, elements, PDF/PNG stubs)

**What Still Needs to Be Built (Phase 6+):**
- Phase 6: AI Drawing Engine (auto-drafting from field data)
- Phase 7: Final Delivery — Editor Integration, RPLS Workflow & Export
- Phase 8: UX Completeness — Controls, Hotkeys, Tooltips & Settings

**Goal:** Everything needed to produce a finished, printable survey drawing. Bearing/distance labels on every line, curve data on every arc, monument callouts, area labels, title block, north arrow, scale bar, legend, certification block, standard notes, label collision detection, and a full print/plot system with PDF output.

**Duration:** 5–7 weeks | **Depends On:** Phase 4 (curves have data to label, traverses have closures, areas computed)

---

## Table of Contents

1. [Phase 5 Architecture Changes](#1-phase-5-architecture-changes)
2. [Annotation Data Model](#2-annotation-data-model)
3. [Bearing/Distance Dimension Tool](#3-bearingdistance-dimension-tool)
4. [Curve Data Annotation](#4-curve-data-annotation)
5. [Monument Labels](#5-monument-labels)
6. [Area Annotations](#6-area-annotations)
7. [Text Annotation Tool](#7-text-annotation-tool)
8. [Leader Annotation Tool](#8-leader-annotation-tool)
9. [Auto-Annotation Engine](#9-auto-annotation-engine)
10. [Label Optimization Engine (Collision Detection)](#10-label-optimization-engine-collision-detection)
11. [Template System](#11-template-system)
12. [Title Block Configurator](#12-title-block-configurator)
13. [North Arrow](#13-north-arrow)
14. [Scale Bar](#14-scale-bar)
15. [Legend](#15-legend)
16. [Certification Block](#16-certification-block)
17. [Standard Notes Library](#17-standard-notes-library)
18. [Sheet Border & Margins](#18-sheet-border--margins)
19. [Default Starr Surveying Template](#19-default-starr-surveying-template)
20. [Print / Plot System](#20-print--plot-system)
21. [Print Preview UI](#21-print-preview-ui)
22. [Annotation Rendering](#22-annotation-rendering)
23. [State Management Updates](#23-state-management-updates)
24. [Acceptance Tests](#24-acceptance-tests)
25. [Build Order (Implementation Sequence)](#25-build-order-implementation-sequence)

---

## 1. Phase 5 Architecture Changes

### 1.1 New Packages & Modules

```
packages/
├── annotations/                     # NEW — all annotation types & auto-labeling
│   ├── src/
│   │   ├── types.ts                 # All annotation interfaces
│   │   ├── bearing-dim.ts           # Bearing/distance dimension logic
│   │   ├── curve-data.ts            # Curve data annotation logic
│   │   ├── monument-label.ts        # Monument label generation
│   │   ├── area-label.ts            # Area annotation logic
│   │   ├── auto-annotate.ts         # Auto-annotation engine (one-pass generation)
│   │   ├── label-optimizer.ts       # Collision detection + simulated annealing
│   │   └── annotation-renderer.ts   # Render all annotation types to PixiJS
│   ├── __tests__/
│   └── package.json
│
├── templates/                       # NEW — template system, title block, print
│   ├── src/
│   │   ├── types.ts                 # Template, TitleBlock, NorthArrow, ScaleBar, etc.
│   │   ├── default-templates.ts     # Built-in templates (Starr Surveying default)
│   │   ├── title-block.ts           # Title block layout & rendering
│   │   ├── north-arrow.ts           # Multiple arrow styles
│   │   ├── scale-bar.ts             # Auto-scaling graphical bar
│   │   ├── legend.ts                # Auto-populated legend
│   │   ├── certification.ts         # RPLS certification block
│   │   ├── standard-notes.ts        # Note library
│   │   ├── sheet-border.ts          # Border, margins, sheet layout
│   │   └── print-engine.ts          # PDF/PNG/SVG export, print preview data
│   ├── __tests__/
│   └── package.json

apps/web/components/
├── annotations/
│   ├── BearingDimTool.tsx           # Interactive B/D placement
│   ├── CurveDataTool.tsx            # Interactive curve data placement
│   ├── TextTool.tsx                 # Text annotation placement/editing
│   ├── LeaderTool.tsx               # Leader annotation placement
│   ├── AreaLabelTool.tsx            # Area label placement
│   └── AnnotationProperties.tsx     # Edit selected annotation properties
├── template/
│   ├── TemplateChooser.tsx          # Select/preview template
│   ├── TitleBlockEditor.tsx         # Edit title block fields
│   ├── NorthArrowPicker.tsx         # Select arrow style + placement
│   ├── ScaleBarConfig.tsx           # Scale bar settings
│   ├── LegendEditor.tsx             # Legend configuration
│   ├── CertificationEditor.tsx      # Certification block text
│   ├── StandardNotesEditor.tsx      # Note selection/editing
│   └── TemplateEditor.tsx           # Full template layout editor
├── print/
│   ├── PrintDialog.tsx              # Print settings
│   ├── PrintPreview.tsx             # WYSIWYG preview
│   └── PrintToolbar.tsx             # Quick-access print controls
```

### 1.2 New Dependencies

```json
{
  "jspdf": "^2.5.1",
  "html2canvas": "^1.4.1"
}
```

jsPDF is used for client-side PDF generation. html2canvas is a fallback for rasterizing complex drawings. The primary PDF export path renders directly to a jsPDF canvas using the same geometry math that drives PixiJS.

---

## 2. Annotation Data Model

All annotations are stored in a separate array on the `DrawingDocument`. They link to features but are not features themselves — they represent labels and dimensions that live on the ANNOTATION layer by default.

```typescript
// packages/annotations/src/types.ts

export type AnnotationType =
  | 'BEARING_DISTANCE'
  | 'CURVE_DATA'
  | 'MONUMENT_LABEL'
  | 'AREA_LABEL'
  | 'TEXT'
  | 'LEADER';

export interface AnnotationBase {
  id: string;
  type: AnnotationType;
  layerId: string;                     // Default: 'ANNOTATION'
  visible: boolean;
  locked: boolean;

  // Link to source feature (annotations update when features change)
  linkedFeatureId: string | null;
  linkedSegmentIndex: number | null;   // Which segment of a polyline

  // Placement tracking
  isManuallyPlaced: boolean;           // User placed/moved — don't auto-reposition
  isAutoGenerated: boolean;            // Created by auto-annotation engine

  // Priority for label optimization (1=highest, 7=lowest)
  priority: number;
}

// ── BEARING / DISTANCE DIMENSION ──

export interface BearingDistanceDimension extends AnnotationBase {
  type: 'BEARING_DISTANCE';
  priority: 1;

  startPoint: Point2D;
  endPoint: Point2D;

  // Computed values
  bearing: number;                     // Azimuth degrees
  distance: number;                    // Feet

  // Display text
  bearingText: string;                 // "N 45°30'15\" E"
  distanceText: string;                // "150.00'"

  // Placement
  textPosition: 'ABOVE' | 'BELOW' | 'CENTERED';
  textOffset: number;                  // Perpendicular offset from line (paper inches)
  textRotation: 'ALONG_LINE' | 'HORIZONTAL' | 'UPRIGHT';
  bearingAbove: boolean;               // Bearing on top, distance below (or vice versa)

  // Style
  font: string;
  fontSize: number;                    // Points
  color: string;
  extensionLines: boolean;             // Short perpendicular ticks at endpoints
  extensionLineLength: number;         // Inches
}

// ── CURVE DATA ──

export interface CurveDataAnnotation extends AnnotationBase {
  type: 'CURVE_DATA';
  priority: 3;

  // Which parameters to display
  showRadius: boolean;
  showArcLength: boolean;
  showChordBearing: boolean;
  showChordDistance: boolean;
  showDelta: boolean;
  showTangent: boolean;

  // Computed text lines
  textLines: string[];                 // ["R = 500.00'", "L = 261.80'", ...]

  // Placement
  position: 'OUTSIDE_ARC' | 'INSIDE_ARC' | 'CUSTOM';
  customPosition: Point2D | null;
  followCurve: boolean;                // Text follows arc curvature
  leaderToArc: boolean;                // Leader line from text to arc midpoint

  // Style
  font: string;
  fontSize: number;
  color: string;
  lineSpacing: number;                 // Multiplier (1.0, 1.2, 1.5)
}

// ── MONUMENT LABEL ──

export interface MonumentLabel extends AnnotationBase {
  type: 'MONUMENT_LABEL';
  priority: 2;

  pointId: string;                     // The SurveyPoint this labels
  position: Point2D;

  // Computed text
  text: string;                        // "1/2\" IRF", "5/8\" IRS w/Cap"
  abbreviatedText: string;             // Shorter version for tight spaces

  // Placement
  offsetAngle: number;                 // Degrees from point to label (0=right, 90=up)
  offsetDistance: number;              // Paper inches from point
  hasLeader: boolean;                  // Draw leader from label to point symbol

  // Style
  font: string;
  fontSize: number;
  color: string;
}

// ── AREA LABEL ──

export interface AreaAnnotation extends AnnotationBase {
  type: 'AREA_LABEL';
  priority: 4;

  linkedFeatureId: string;             // The closed polygon / traverse

  // Computed
  areaSqFt: number;
  areaAcres: number;

  // Display
  format: 'SQFT' | 'ACRES' | 'BOTH' | 'LOT_NUMBER';
  text: string;                        // "15,234 Sq. Ft.\n0.350 Acres"
  lotNumber: string | null;
  blockNumber: string | null;

  // Placement (centroid by default)
  position: Point2D;

  // Style
  font: string;
  fontSize: number;
  color: string;
}

// ── TEXT ANNOTATION ──

export interface TextAnnotation extends AnnotationBase {
  type: 'TEXT';
  priority: 6;

  position: Point2D;
  text: string;
  multiline: boolean;

  // Style
  font: string;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  color: string;
  rotation: number;                    // Degrees
  alignment: 'LEFT' | 'CENTER' | 'RIGHT';
  verticalAlignment: 'TOP' | 'MIDDLE' | 'BOTTOM';
  backgroundColor: string | null;
  borderVisible: boolean;
  borderColor: string;
  padding: number;                     // Paper inches
}

// ── LEADER ANNOTATION ──

export interface LeaderAnnotation extends AnnotationBase {
  type: 'LEADER';
  priority: 7;

  arrowPoint: Point2D;                 // Where the arrow points (at the feature)
  textPosition: Point2D;               // Where the text box sits
  vertices: Point2D[];                 // Intermediate bend points (empty = straight)

  text: string;
  arrowStyle: 'CLOSED' | 'OPEN' | 'DOT' | 'TICK' | 'NONE';
  lineWeight: number;                  // mm

  // Style
  font: string;
  fontSize: number;
  color: string;
}
```

---

## 3. Bearing/Distance Dimension Tool

The primary annotation for boundary survey drawings. Every boundary line gets a bearing label above and a distance label below (or vice versa), oriented parallel to the line and always readable (never upside-down).

```typescript
// packages/annotations/src/bearing-dim.ts

export interface BearingDimConfig {
  bearingPrecision: 'SECOND' | 'TENTH_SECOND';
  distancePrecision: number;           // Decimal places (0-4)
  defaultPosition: 'ABOVE' | 'BELOW';
  defaultOffset: number;               // Paper inches from line (default: 0.06)
  textRotation: 'ALONG_LINE' | 'HORIZONTAL' | 'UPRIGHT';
  bearingAbove: boolean;
  extensionLines: boolean;
  font: string;
  fontSize: number;                    // Default: 7
  color: string;                       // Default: '#000000'
}

export function createBearingDimension(
  startPoint: Point2D,
  endPoint: Point2D,
  config: BearingDimConfig,
  linkedFeatureId?: string,
  segmentIndex?: number,
): BearingDistanceDimension {
  const inv = inverseBearingDistance(startPoint, endPoint);
  const bearingText = formatBearing(inv.azimuth, config.bearingPrecision);
  const distanceText = `${inv.distance.toFixed(config.distancePrecision)}'`;

  return {
    id: generateId(),
    type: 'BEARING_DISTANCE',
    layerId: 'ANNOTATION',
    visible: true,
    locked: false,
    linkedFeatureId: linkedFeatureId ?? null,
    linkedSegmentIndex: segmentIndex ?? null,
    isManuallyPlaced: false,
    isAutoGenerated: true,
    priority: 1,
    startPoint,
    endPoint,
    bearing: inv.azimuth,
    distance: inv.distance,
    bearingText,
    distanceText,
    textPosition: config.defaultPosition,
    textOffset: config.defaultOffset,
    textRotation: config.textRotation,
    bearingAbove: config.bearingAbove,
    font: config.font,
    fontSize: config.fontSize,
    color: config.color,
    extensionLines: config.extensionLines,
    extensionLineLength: 0.05,
  };
}

/**
 * Compute placement geometry for a B/D dimension.
 * Returns world-coordinate positions for bearing text and distance text,
 * a rotation angle that keeps text readable (never upside-down),
 * and an axis-aligned bounding box for collision detection.
 */
export function computeBearingDimPlacement(
  dim: BearingDistanceDimension,
  drawingScale: number,
): { bearingPos: Point2D; distancePos: Point2D; rotation: number; bbox: AABB } {

  const midX = (dim.startPoint.x + dim.endPoint.x) / 2;
  const midY = (dim.startPoint.y + dim.endPoint.y) / 2;
  const dx = dim.endPoint.x - dim.startPoint.x;
  const dy = dim.endPoint.y - dim.startPoint.y;
  const lineAngle = Math.atan2(dx, dy); // Survey convention: 0=north, CW

  // Perpendicular offset direction (left of travel direction)
  const perpX = -Math.cos(lineAngle);
  const perpY = Math.sin(lineAngle);

  const offsetWorld = dim.textOffset * drawingScale;
  const lineSpacing = (dim.fontSize / 72) * drawingScale * 1.4;
  const sign = dim.textPosition === 'ABOVE' ? 1 : -1;

  const pos1: Point2D = {
    x: midX + perpX * offsetWorld * sign,
    y: midY + perpY * offsetWorld * sign,
  };
  const pos2: Point2D = {
    x: midX + perpX * (offsetWorld + lineSpacing) * sign,
    y: midY + perpY * (offsetWorld + lineSpacing) * sign,
  };

  const bearingPos = dim.bearingAbove ? pos1 : pos2;
  const distancePos = dim.bearingAbove ? pos2 : pos1;

  // Rotation: keep text readable (flip if line runs right-to-left in screen space)
  let rotation = Math.atan2(dy, dx); // Math convention for rendering
  if (rotation > Math.PI / 2 || rotation < -Math.PI / 2) rotation += Math.PI;

  // Bounding box for collision detection
  const textLen = Math.max(dim.bearingText.length, dim.distanceText.length);
  const width = textLen * dim.fontSize * 0.55 / 72 * drawingScale;
  const height = lineSpacing * 2.8;

  return {
    bearingPos,
    distancePos,
    rotation,
    bbox: { x: midX - width / 2, y: midY - height / 2, width, height },
  };
}
```

**Interaction model:**

- **Auto mode** (default): B/D dims auto-generated for all boundary lines via the auto-annotation engine.
- **Manual mode:** Activate the B/D dimension tool (toolbar or `BD` command), click a line segment → dimension appears. Click to place on desired side.
- **Edit:** Select a B/D dimension, drag to reposition. Properties panel shows font, size, precision, offset.

---

## 4. Curve Data Annotation

```typescript
// packages/annotations/src/curve-data.ts

export interface CurveDataConfig {
  defaultFields: ('R' | 'L' | 'CB' | 'C' | 'DELTA' | 'T')[];  // Default: ['R','L','CB','C','DELTA']
  position: 'OUTSIDE_ARC' | 'INSIDE_ARC';
  followCurve: boolean;
  font: string;
  fontSize: number;                    // Default: 6
  color: string;
  lineSpacing: number;                 // Default: 1.2
  prefixStyle: 'SYMBOL' | 'ABBREVIATION';  // Δ vs "Delta"
}

export function createCurveDataAnnotation(
  curveParams: CurveParameters,
  featureId: string,
  config: CurveDataConfig,
): CurveDataAnnotation {
  const lines: string[] = [];

  const sym = config.prefixStyle === 'SYMBOL';
  for (const field of config.defaultFields) {
    switch (field) {
      case 'R':
        lines.push(`${sym ? 'R' : 'Radius'} = ${curveParams.R.toFixed(2)}'`);
        break;
      case 'L':
        lines.push(`${sym ? 'L' : 'Arc'} = ${curveParams.L.toFixed(2)}'`);
        break;
      case 'CB':
        lines.push(`${sym ? 'CB' : 'Ch. Brg.'} = ${formatBearing(curveParams.CB * 180 / Math.PI, 'SECOND')}`);
        break;
      case 'C':
        lines.push(`${sym ? 'C' : 'Chord'} = ${curveParams.C.toFixed(2)}'`);
        break;
      case 'DELTA': {
        const deg = curveParams.delta * 180 / Math.PI;
        lines.push(`${sym ? 'Δ' : 'Delta'} = ${formatDMS(deg)}`);
        break;
      }
      case 'T':
        lines.push(`${sym ? 'T' : 'Tan.'} = ${curveParams.T.toFixed(2)}'`);
        break;
    }
  }

  return {
    id: generateId(),
    type: 'CURVE_DATA',
    layerId: 'ANNOTATION',
    visible: true, locked: false,
    linkedFeatureId: featureId,
    linkedSegmentIndex: null,
    isManuallyPlaced: false,
    isAutoGenerated: true,
    priority: 3,
    showRadius: config.defaultFields.includes('R'),
    showArcLength: config.defaultFields.includes('L'),
    showChordBearing: config.defaultFields.includes('CB'),
    showChordDistance: config.defaultFields.includes('C'),
    showDelta: config.defaultFields.includes('DELTA'),
    showTangent: config.defaultFields.includes('T'),
    textLines: lines,
    position: config.position,
    customPosition: null,
    followCurve: config.followCurve,
    leaderToArc: false,
    font: config.font,
    fontSize: config.fontSize,
    color: config.color,
    lineSpacing: config.lineSpacing,
  };
}
```

**Placement logic:** Text block is positioned outside the arc (convex side) by default, centered on the arc midpoint. When `followCurve` is true, each text line is individually curved to follow the arc. When space is tight, the optimizer may switch to a leader line from the text to the arc midpoint.

---

## 5. Monument Labels

```typescript
// packages/annotations/src/monument-label.ts

export function generateMonumentLabelText(point: SurveyPoint): { text: string; abbreviated: string } {
  const def = point.codeDefinition;
  if (!def || def.category !== 'BOUNDARY_CONTROL') {
    return { text: point.rawCode, abbreviated: point.rawCode };
  }

  const action = point.monumentAction;
  const suffix = action === 'FOUND' ? 'F' : action === 'SET' ? 'S' : action === 'CALCULATED' ? 'C' : '';
  const word = action === 'FOUND' ? 'Found' : action === 'SET' ? 'Set' : action === 'CALCULATED' ? 'Calc' : '';

  const size = def.monumentSize ?? '';
  const typeMap: Record<string, [string, string]> = {
    'Iron Rod':       [`${size} IR${suffix}`,  `${size} Iron Rod ${word}`],
    'Iron Pipe':      [`IP${suffix}`,          `Iron Pipe ${word}`],
    'Concrete':       [`CM${suffix}`,          `Conc. Mon. ${word}`],
    'Cap/Disk':       [`C/D${suffix}`,         `Cap/Disk ${word}`],
    'PK Nail':        [`PKN${suffix}`,         `PK Nail ${word}`],
    'Mag Nail':       [`MN${suffix}`,          `Mag Nail ${word}`],
    'Railroad Spike': [`RRS`,                  `Railroad Spike`],
    'Witness Post':   [`WP`,                   `Witness Post`],
    'Fence Corner':   [`FCP`,                  `Fence Corner Post`],
  };

  const [abbreviated, text] = typeMap[def.monumentType ?? ''] ?? [point.rawCode, point.rawCode];
  return { text, abbreviated };
}

export function createMonumentLabel(
  point: SurveyPoint,
  config: { font: string; fontSize: number; color: string; defaultOffset: number },
): MonumentLabel {
  const { text, abbreviated } = generateMonumentLabelText(point);

  return {
    id: generateId(),
    type: 'MONUMENT_LABEL',
    layerId: 'ANNOTATION',
    visible: true, locked: false,
    linkedFeatureId: point.featureId ?? null,
    linkedSegmentIndex: null,
    isManuallyPlaced: false,
    isAutoGenerated: true,
    priority: 2,
    pointId: point.id,
    position: { x: point.easting, y: point.northing },
    text,
    abbreviatedText: abbreviated,
    offsetAngle: 45,                   // Default: upper-right of point symbol
    offsetDistance: config.defaultOffset,
    hasLeader: false,
    font: config.font,
    fontSize: config.fontSize,
    color: config.color,
  };
}
```

**Offset angle logic:** The auto-annotate engine picks the offset angle that avoids colliding with boundary lines radiating from the monument. It tests 8 candidate angles (0°, 45°, 90°, 135°, 180°, 225°, 270°, 315°) and selects the one farthest from any nearby line.

---

## 6. Area Annotations

```typescript
// packages/annotations/src/area-label.ts

export function createAreaAnnotation(
  featureId: string,
  vertices: Point2D[],
  config: { format: 'SQFT' | 'ACRES' | 'BOTH'; font: string; fontSize: number; color: string },
): AreaAnnotation {
  const area = computeAreaFromVertices(vertices);
  const centroid = computeCentroid(vertices);

  let text: string;
  switch (config.format) {
    case 'SQFT':  text = `${Math.round(area.squareFeet).toLocaleString()} Sq. Ft.`; break;
    case 'ACRES': text = `${area.acres.toFixed(4)} Acres`; break;
    case 'BOTH':  text = `${Math.round(area.squareFeet).toLocaleString()} Sq. Ft.\n${area.acres.toFixed(4)} Acres`; break;
  }

  return {
    id: generateId(),
    type: 'AREA_LABEL',
    layerId: 'ANNOTATION',
    visible: true, locked: false,
    linkedFeatureId: featureId, linkedSegmentIndex: null,
    isManuallyPlaced: false, isAutoGenerated: true,
    priority: 4,
    areaSqFt: area.squareFeet,
    areaAcres: area.acres,
    format: config.format,
    text,
    lotNumber: null,
    blockNumber: null,
    position: centroid,
    font: config.font,
    fontSize: config.fontSize,
    color: config.color,
  };
}

function computeCentroid(verts: Point2D[]): Point2D {
  let cx = 0, cy = 0;
  for (const v of verts) { cx += v.x; cy += v.y; }
  return { x: cx / verts.length, y: cy / verts.length };
}
```

---

## 7. Text Annotation Tool

Free-form text placement anywhere on the drawing.

**Interaction:**

- Activate Text tool (`T` key or toolbar).
- Click location on canvas.
- Inline text editor appears at that position (blinking cursor, handles typing).
- Type text. Enter creates a new line (multiline mode).
- Click away or press Escape to commit the text.
- Double-click an existing text annotation to re-edit in place.
- Properties panel exposes font, size, bold/italic/underline, color, rotation, alignment, background.

---

## 8. Leader Annotation Tool

Arrow pointing to a feature with text label at the other end. Used for callouts, notes, and labels that can't sit directly on the feature.

**Interaction:**

- Activate Leader tool (toolbar).
- Click the feature to mark the arrow tip.
- Click one or more intermediate bend points (optional — creates angled leader).
- Double-click at the text location.
- Inline text editor appears; type the callout text.
- Click away to commit.

Arrow styles: `CLOSED` (filled triangle), `OPEN` (two lines), `DOT` (filled circle), `TICK` (perpendicular tick), `NONE`.

---

## 9. Auto-Annotation Engine

Generates all standard annotations for a complete survey drawing in one pass.

```typescript
// packages/annotations/src/auto-annotate.ts

export interface AutoAnnotateConfig {
  bearingDim: BearingDimConfig;
  curveData: CurveDataConfig;
  monumentLabel: { font: string; fontSize: number; color: string; defaultOffset: number };
  areaLabel: { format: 'SQFT' | 'ACRES' | 'BOTH'; font: string; fontSize: number; color: string };

  // Which types to generate
  generateBearingDims: boolean;
  generateCurveData: boolean;
  generateMonumentLabels: boolean;
  generateAreaLabels: boolean;

  // Scope: which layers count as "boundary"
  boundaryLayerIds: string[];          // Default: ['BOUNDARY','EASEMENT','ROW','BUILDING-LINE']
  monumentLayerIds: string[];          // Default: ['BOUNDARY-MON']
}

export function autoAnnotate(
  features: Feature[],
  points: SurveyPoint[],
  traverses: Traverse[],
  config: AutoAnnotateConfig,
): AnnotationBase[] {
  const annotations: AnnotationBase[] = [];

  // ── 1. Bearing/distance on boundary lines ──
  if (config.generateBearingDims) {
    for (const feature of features) {
      if (!config.boundaryLayerIds.includes(feature.layerId)) continue;
      const verts = getFeatureVertices(feature);
      if (!verts || verts.length < 2) continue;

      for (let i = 0; i < verts.length - 1; i++) {
        // Skip arc segments (they get curve data instead)
        if (isArcSegment(feature, i)) continue;
        annotations.push(
          createBearingDimension(verts[i], verts[i + 1], config.bearingDim, feature.id, i)
        );
      }
    }
  }

  // ── 2. Curve data on arcs ──
  if (config.generateCurveData) {
    for (const feature of features) {
      if (feature.geometry.type === 'ARC' && feature.geometry.arcDef) {
        const params = arcToCurveParameters(feature.geometry.arcDef);
        annotations.push(createCurveDataAnnotation(params, feature.id, config.curveData));
      }
      if (feature.geometry.type === 'MIXED_GEOMETRY') {
        for (let i = 0; i < feature.geometry.segments.length; i++) {
          const seg = feature.geometry.segments[i];
          if (seg.type === 'ARC' && seg.arcDef) {
            const params = arcToCurveParameters(seg.arcDef);
            const ann = createCurveDataAnnotation(params, feature.id, config.curveData);
            ann.linkedSegmentIndex = i;
            annotations.push(ann);
          }
        }
      }
    }
  }

  // ── 3. Monument labels (only "final" point per group) ──
  if (config.generateMonumentLabels) {
    for (const point of points) {
      if (!point.codeDefinition || point.codeDefinition.category !== 'BOUNDARY_CONTROL') continue;
      annotations.push(createMonumentLabel(point, config.monumentLabel));
    }
  }

  // ── 4. Area labels for closed traverses ──
  if (config.generateAreaLabels) {
    for (const traverse of traverses) {
      if (!traverse.isClosed || !traverse.area) continue;
      const verts = traverse.pointIds.map(id => {
        const pt = points.find(p => p.id === id)!;
        return { x: pt.easting, y: pt.northing };
      });
      annotations.push(createAreaAnnotation(traverse.id, verts, config.areaLabel));
    }
  }

  return annotations;
}
```

---

## 10. Label Optimization Engine (Collision Detection)

The optimizer takes all auto-generated annotations, detects collisions between label bounding boxes, and repositions them using simulated annealing.

```typescript
// packages/annotations/src/label-optimizer.ts

export interface LabelOptConfig {
  maxIterations: number;               // Default: 2000
  startTemperature: number;            // Default: 100
  coolingRate: number;                 // Default: 0.995
  collisionPadding: number;            // Paper inches between labels (default: 0.03)
  minFontSize: number;                 // Minimum allowed (default: 5pt)
  maxLeaderLength: number;             // Paper inches (default: 1.0)
}

export interface LabelRect {
  annotationId: string;
  priority: number;
  cx: number; cy: number;             // Center in world coordinates
  halfWidth: number; halfHeight: number;
  rotation: number;
  isManuallyPlaced: boolean;
}

export interface OptimizationResult {
  placements: Map<string, LabelPlacement>;
  collisionsResolved: number;
  collisionsRemaining: number;
  iterationsUsed: number;
  flaggedForManual: string[];
}

export interface LabelPlacement {
  offsetX: number; offsetY: number;    // Delta from original position (world units)
  rotation: number;
  fontSize: number;                    // May be reduced
  strategy: 'ORIGINAL' | 'FLIPPED' | 'SLID' | 'LEADER_ADDED' | 'SHRUNK' | 'STACKED' | 'ABBREVIATED' | 'FLAGGED_MANUAL';
  hasLeader: boolean;
  leaderPoints: Point2D[];
}

/**
 * Priority tiers (higher-priority labels never move for lower):
 *   1. Boundary bearing/distance
 *   2. Monument labels
 *   3. Curve data
 *   4. Area/lot labels
 *   5. Utility/structure labels
 *   6. Text annotations
 *   7. Leader annotations (most flexible)
 *
 * Resolution strategies tried in order per collision:
 *   a. Flip to other side of associated line
 *   b. Slide along the line ±10-30%
 *   c. Add leader line, move label to nearest clear space
 *   d. Reduce font size by 1pt (only for priority ≥ 4)
 *   e. Stack bearing above distance vertically instead of side-by-side
 *   f. Use abbreviated text (only for monument labels)
 *   g. Flag for manual placement (last resort)
 */
export function optimizeLabels(
  annotations: AnnotationBase[],
  drawingScale: number,
  config: LabelOptConfig,
): OptimizationResult {

  // 1. Build bounding boxes for all annotations
  const rects = annotations.map(a => computeLabelRect(a, drawingScale));

  // 2. Sort by priority (process highest first — they stay put)
  rects.sort((a, b) => a.priority - b.priority);

  const placements = new Map<string, LabelPlacement>();
  let resolved = 0;

  // 3. Initialize placements at original positions
  for (const rect of rects) {
    placements.set(rect.annotationId, {
      offsetX: 0, offsetY: 0,
      rotation: rect.rotation,
      fontSize: getAnnotationFontSize(annotations.find(a => a.id === rect.annotationId)!),
      strategy: 'ORIGINAL',
      hasLeader: false,
      leaderPoints: [],
    });
  }

  // 4. Simulated annealing
  let temperature = config.startTemperature;

  for (let iter = 0; iter < config.maxIterations; iter++) {
    // Find all current collisions
    const collisions = findCollisions(rects, placements, config.collisionPadding);
    if (collisions.length === 0) break;

    // Pick a random collision
    const collision = collisions[Math.floor(Math.random() * collisions.length)];

    // Try to resolve it: move the lower-priority label
    const moverId = collision.rectA.priority > collision.rectB.priority
      ? collision.rectA.annotationId
      : collision.rectB.annotationId;

    // Skip manually-placed labels
    const moverRect = rects.find(r => r.annotationId === moverId)!;
    if (moverRect.isManuallyPlaced) continue;

    const annotation = annotations.find(a => a.id === moverId)!;

    // Try strategies in order
    const newPlacement = tryResolveCollision(
      annotation, moverRect, rects, placements, drawingScale, config, temperature,
    );

    if (newPlacement) {
      placements.set(moverId, newPlacement);
      resolved++;
    }

    temperature *= config.coolingRate;
  }

  // 5. Flag remaining collisions
  const remaining = findCollisions(rects, placements, config.collisionPadding);
  const flagged: string[] = [];
  for (const c of remaining) {
    const moverId = c.rectA.priority > c.rectB.priority ? c.rectA.annotationId : c.rectB.annotationId;
    if (!flagged.includes(moverId)) {
      flagged.push(moverId);
      const p = placements.get(moverId)!;
      p.strategy = 'FLAGGED_MANUAL';
      placements.set(moverId, p);
    }
  }

  return {
    placements,
    collisionsResolved: resolved,
    collisionsRemaining: remaining.length,
    iterationsUsed: config.maxIterations,
    flaggedForManual: flagged,
  };
}

function tryResolveCollision(
  annotation: AnnotationBase,
  rect: LabelRect,
  allRects: LabelRect[],
  placements: Map<string, LabelPlacement>,
  scale: number,
  config: LabelOptConfig,
  temperature: number,
): LabelPlacement | null {
  const strategies = ['FLIP', 'SLIDE', 'LEADER', 'SHRINK', 'STACK', 'ABBREVIATE'];

  for (const strategy of strategies) {
    const candidate = generateCandidatePlacement(annotation, rect, strategy, scale, config, temperature);
    if (!candidate) continue;

    // Check if candidate resolves the collision without creating new ones
    const testPlacement = new Map(placements);
    testPlacement.set(rect.annotationId, candidate);

    const newCollisions = findCollisionsForRect(rect, allRects, testPlacement, config.collisionPadding);
    if (newCollisions.length === 0) return candidate;
  }

  return null;
}

function findCollisions(
  rects: LabelRect[],
  placements: Map<string, LabelPlacement>,
  padding: number,
): { rectA: LabelRect; rectB: LabelRect }[] {
  const collisions: { rectA: LabelRect; rectB: LabelRect }[] = [];

  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      if (doRectsOverlap(rects[i], rects[j], placements, padding)) {
        collisions.push({ rectA: rects[i], rectB: rects[j] });
      }
    }
  }

  return collisions;
}

function doRectsOverlap(
  a: LabelRect,
  b: LabelRect,
  placements: Map<string, LabelPlacement>,
  padding: number,
): boolean {
  const pa = placements.get(a.annotationId)!;
  const pb = placements.get(b.annotationId)!;

  // Simple AABB test (ignoring rotation for performance — close enough for surveys)
  const ax = a.cx + pa.offsetX, ay = a.cy + pa.offsetY;
  const bx = b.cx + pb.offsetX, by = b.cy + pb.offsetY;

  return Math.abs(ax - bx) < (a.halfWidth + b.halfWidth + padding) &&
         Math.abs(ay - by) < (a.halfHeight + b.halfHeight + padding);
}
```

---

## 11. Template System

```typescript
// packages/templates/src/types.ts

export interface DrawingTemplate {
  id: string;
  name: string;
  isBuiltIn: boolean;
  isEditable: boolean;

  // Sheet definition
  paperSize: PaperSize;
  orientation: 'PORTRAIT' | 'LANDSCAPE';
  margins: { top: number; right: number; bottom: number; left: number }; // Inches
  scale: number;                       // 1" = X' (e.g., 50)

  // Element positions (paper coordinates in inches from lower-left)
  titleBlock: TitleBlockConfig;
  northArrow: NorthArrowConfig;
  scaleBar: ScaleBarConfig;
  legend: LegendConfig;
  certificationBlock: CertificationConfig;
  standardNotes: StandardNotesConfig;
  border: BorderConfig;

  // Company branding
  company: CompanyInfo;

  // Annotation defaults
  annotationDefaults: {
    bearingDim: BearingDimConfig;
    curveData: CurveDataConfig;
    monumentLabel: { font: string; fontSize: number; color: string; defaultOffset: number };
    areaLabel: { format: 'SQFT' | 'ACRES' | 'BOTH'; font: string; fontSize: number; color: string };
  };
}

export type PaperSize = 'LETTER' | 'TABLOID' | 'ARCH_C' | 'ARCH_D' | 'ARCH_E';

export const PAPER_DIMENSIONS: Record<PaperSize, { width: number; height: number }> = {
  LETTER:  { width: 8.5,  height: 11   },
  TABLOID: { width: 11,   height: 17   },
  ARCH_C:  { width: 18,   height: 24   },
  ARCH_D:  { width: 24,   height: 36   },
  ARCH_E:  { width: 36,   height: 48   },
};
```

---

## 12. Title Block Configurator

```typescript
// packages/templates/src/title-block.ts

export interface TitleBlockConfig {
  position: 'BOTTOM_RIGHT' | 'RIGHT_STRIP' | 'BOTTOM_STRIP' | 'CUSTOM';
  customBounds: { x: number; y: number; width: number; height: number } | null;

  // Content fields
  fields: {
    projectName: string;               // "BOUNDARY SURVEY"
    projectSubtitle: string;           // "LOT 5, BLOCK 2, CEDAR RIDGE ESTATES"
    projectAddress: string;            // "1234 Main St, Belton TX 76513"
    clientName: string;                // "John and Jane Doe"
    surveyDate: string;                // "March 2026"
    sheetTitle: string;                // "PLAT"
    sheetNumber: string;               // "1 OF 1"
    drawnBy: string;                   // "JDS"
    checkedBy: string;                 // "RCS"
    jobNumber: string;                 // "2026-0142"
    scaleText: string;                 // "1\" = 50'" (auto-computed from template scale)
  };

  // Layout
  showCompanyLogo: boolean;
  showCompanyInfo: boolean;
  showLicenseNumber: boolean;
  showSealPlaceholder: boolean;

  // Style
  font: string;
  borderWeight: number;                // mm
  dividerWeight: number;               // mm
}

/**
 * Render title block to jsPDF or PixiJS Graphics.
 * The title block is a structured table with company branding at top,
 * project info in the middle, and sheet info at the bottom.
 */
export function renderTitleBlock(
  ctx: RenderContext,                   // Abstraction over jsPDF or PixiJS
  config: TitleBlockConfig,
  company: CompanyInfo,
  paperSize: PaperSize,
  orientation: string,
): void {
  // Layout computed from position preset:
  // BOTTOM_RIGHT: 4"×3" box in lower-right corner
  // RIGHT_STRIP:  2.5"×full height strip on right side
  // BOTTOM_STRIP: full width × 2" strip at bottom

  const bounds = computeTitleBlockBounds(config, paperSize, orientation);

  // Draw outer border
  ctx.rect(bounds.x, bounds.y, bounds.width, bounds.height, config.borderWeight);

  // Company section (top 30%)
  if (config.showCompanyInfo) {
    const companyHeight = bounds.height * 0.3;
    ctx.divider(bounds.x, bounds.y + companyHeight, bounds.width, config.dividerWeight);

    if (config.showCompanyLogo && company.logo) {
      // Logo on left, company text on right
      ctx.image(company.logo, bounds.x + 0.1, bounds.y + 0.1, companyHeight - 0.2, companyHeight - 0.2);
    }
    ctx.text(company.name,    bounds.x + bounds.width / 2, bounds.y + 0.15, { align: 'center', fontSize: 10, bold: true });
    ctx.text(company.address, bounds.x + bounds.width / 2, bounds.y + 0.35, { align: 'center', fontSize: 7 });
    ctx.text(company.phone,   bounds.x + bounds.width / 2, bounds.y + 0.50, { align: 'center', fontSize: 7 });
    if (config.showLicenseNumber) {
      ctx.text(`RPLS #${company.licenseNumber}`, bounds.x + bounds.width / 2, bounds.y + 0.65, { align: 'center', fontSize: 7 });
    }
  }

  // Project info section (middle 40%)
  const projTop = bounds.y + bounds.height * 0.3;
  const projHeight = bounds.height * 0.4;
  ctx.divider(bounds.x, projTop + projHeight, bounds.width, config.dividerWeight);

  ctx.text(config.fields.projectName,     bounds.x + bounds.width / 2, projTop + 0.15, { align: 'center', fontSize: 9, bold: true });
  ctx.text(config.fields.projectSubtitle, bounds.x + bounds.width / 2, projTop + 0.35, { align: 'center', fontSize: 7 });
  ctx.text(config.fields.projectAddress,  bounds.x + bounds.width / 2, projTop + 0.50, { align: 'center', fontSize: 7 });
  ctx.text(`Prepared for: ${config.fields.clientName}`, bounds.x + bounds.width / 2, projTop + 0.70, { align: 'center', fontSize: 7 });

  // Sheet info section (bottom 30%) — small grid of fields
  const sheetTop = projTop + projHeight;
  const colWidth = bounds.width / 3;
  const fields = [
    ['DATE',    config.fields.surveyDate],
    ['SCALE',   config.fields.scaleText],
    ['SHEET',   config.fields.sheetNumber],
    ['JOB #',   config.fields.jobNumber],
    ['DRAWN',   config.fields.drawnBy],
    ['CHECKED', config.fields.checkedBy],
  ];
  for (let i = 0; i < fields.length; i++) {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = bounds.x + col * colWidth;
    const y = sheetTop + row * 0.35;
    ctx.text(fields[i][0], x + 0.05, y + 0.05, { fontSize: 5, color: '#666666' });
    ctx.text(fields[i][1], x + 0.05, y + 0.18, { fontSize: 7, bold: true });
    // Vertical dividers
    if (col > 0) ctx.line(x, y, x, y + 0.35, config.dividerWeight);
  }
}
```

---

## 13. North Arrow

```typescript
// packages/templates/src/north-arrow.ts

export interface NorthArrowConfig {
  style: 'SIMPLE' | 'COMPASS' | 'ORNATE' | 'MINIMAL';
  position: Point2D;                   // Paper coordinates (inches from lower-left)
  size: number;                        // Height in inches (default: 1.5)
  rotation: number;                    // Degrees (0 = true north up). Adjustable for grid north.
  showMagneticDeclination: boolean;
  magneticDeclination: number;         // Degrees east of true north
}

export const NORTH_ARROW_STYLES: Record<string, { name: string; paths: string[] }> = {
  SIMPLE: {
    name: 'Simple Arrow',
    paths: [
      'M 0 -1 L 0.3 0.6 L 0 0.3 L -0.3 0.6 Z',           // Arrow body
      // "N" text positioned above
    ],
  },
  COMPASS: {
    name: 'Compass Rose',
    paths: [
      'M 0 -1 L 0.15 0 L 0 0.15 Z',                       // North point (filled)
      'M 0 -1 L -0.15 0 L 0 0.15 Z',                      // North point (outline)
      'M 0 1 L 0.15 0 L 0 -0.15 Z',                       // South point
      'M 1 0 L 0 0.15 L -0.15 0 Z',                       // East point
      'M -1 0 L 0 -0.15 L 0.15 0 Z',                      // West point
    ],
  },
  ORNATE: {
    name: 'Ornate Traditional',
    // Detailed SVG paths for a traditional surveying north arrow
    paths: [/* ... ornate arrow paths ... */],
  },
  MINIMAL: {
    name: 'Minimal',
    paths: [
      'M 0 -0.8 L 0 0.3',                                 // Simple line
      'M -0.15 -0.5 L 0 -0.8 L 0.15 -0.5',               // Arrowhead
    ],
  },
};
```

---

## 14. Scale Bar

```typescript
// packages/templates/src/scale-bar.ts

export interface ScaleBarConfig {
  position: Point2D;                   // Paper inches from lower-left
  style: 'ALTERNATING' | 'SINGLE' | 'DOUBLE';
  width: number;                       // Total width in inches (default: 3.0)
  height: number;                      // Bar height in inches (default: 0.15)
  divisions: number;                   // Number of major divisions (default: auto)
  subdivisions: number;                // Subdivisions in first division (default: 2)
  showText: boolean;
  font: string;
  fontSize: number;
  units: 'FEET' | 'FEET_AND_INCHES';
}

/**
 * Auto-compute nice round division values based on drawing scale.
 * Example: At 1"=50', a 3" bar covers 150'. Divisions: 0, 50, 100, 150.
 */
export function computeScaleBarDivisions(scale: number, barWidthInches: number): number[] {
  const totalFeet = scale * barWidthInches;

  // Find a "nice" division: 10, 20, 25, 50, 100, 200, 250, 500, ...
  const niceNumbers = [1, 2, 2.5, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
  const targetDiv = totalFeet / 3; // Aim for ~3 major divisions
  let divValue = niceNumbers[0];
  for (const n of niceNumbers) {
    if (n <= targetDiv) divValue = n;
    else break;
  }

  const divisions: number[] = [];
  for (let v = 0; v <= totalFeet + 0.001; v += divValue) {
    divisions.push(Math.round(v * 100) / 100);
  }

  return divisions;
}
```

**Rendering:** Alternating style fills every other division with black. Labels appear below each division mark showing the footage. The first division is subdivided for finer reading. The bar auto-updates when drawing scale changes.

---

## 15. Legend

```typescript
// packages/templates/src/legend.ts

export interface LegendConfig {
  position: Point2D;
  width: number;                       // Inches
  autoPopulate: boolean;               // Scan drawing features to build legend
  columns: 1 | 2;
  showLineTypes: boolean;
  showSymbols: boolean;
  showColors: boolean;
  title: string;                       // "LEGEND" by default
  font: string;
  fontSize: number;
  entries: LegendEntry[];              // Manually added or auto-populated
}

export interface LegendEntry {
  label: string;                       // "Chain Link Fence"
  sampleType: 'LINE' | 'SYMBOL' | 'AREA';
  lineTypeId?: string;
  symbolId?: string;
  color: string;
  lineWeight?: number;
}

/**
 * Auto-populate legend entries from features present in the drawing.
 * Only includes entries for codes that actually appear.
 */
export function autoPopulateLegend(
  features: Feature[],
  codeStyleMap: Map<string, CodeStyleMapping>,
  symbolLibrary: Record<string, SymbolDefinition>,
  lineTypeLibrary: Record<string, LineTypeDefinition>,
): LegendEntry[] {
  const seenCodes = new Set<string>();
  const entries: LegendEntry[] = [];

  for (const feature of features) {
    const code = feature.metadata?.codeAlpha ?? feature.metadata?.codeNumeric;
    if (!code || seenCodes.has(code)) continue;
    seenCodes.add(code);

    const mapping = codeStyleMap.get(code);
    if (!mapping) continue;

    entries.push({
      label: mapping.description,
      sampleType: mapping.symbolId ? 'SYMBOL' : 'LINE',
      lineTypeId: mapping.lineTypeId,
      symbolId: mapping.symbolId,
      color: mapping.lineColor ?? mapping.symbolColor ?? '#000000',
      lineWeight: mapping.lineWeight,
    });
  }

  // Sort by category for clean presentation
  return entries.sort((a, b) => a.label.localeCompare(b.label));
}
```

**Rendering:** A bordered box with the title "LEGEND" at top. Each entry shows a small sample (line segment with correct line type, or point symbol) and the description text beside it. If `columns: 2`, entries wrap into a second column.

---

## 16. Certification Block

```typescript
// packages/templates/src/certification.ts

export interface CertificationConfig {
  position: Point2D;
  width: number;
  visible: boolean;

  // Text content
  certificationText: string;
  surveyorName: string;
  licenseNumber: string;
  licenseState: string;
  firmName: string;

  // Display options
  showSignatureLine: boolean;
  showDateLine: boolean;
  showSealPlaceholder: boolean;        // Circular outline for embossed/digital seal
  sealDiameter: number;               // Inches (default: 1.75)

  font: string;
  fontSize: number;
}

export const DEFAULT_CERTIFICATION_TEXT =
`I, {SURVEYOR_NAME}, a Registered Professional Land Surveyor in the State of {STATE}, do hereby certify that this plat correctly represents a survey made by me or under my supervision on the ground and that the corners and boundaries are correctly shown hereon.

This survey was performed in accordance with the current Texas Society of Professional Surveyors Standards and Specifications for a Category {CATEGORY} Condition {CONDITION} survey.

The ratio of precision of the unadjusted field traverse is {PRECISION}.`;

export function formatCertificationText(
  template: string,
  surveyorName: string,
  state: string,
  category: string,
  condition: string,
  precisionRatio: string,
): string {
  return template
    .replace('{SURVEYOR_NAME}', surveyorName)
    .replace('{STATE}', state)
    .replace('{CATEGORY}', category)
    .replace('{CONDITION}', condition)
    .replace('{PRECISION}', precisionRatio);
}
```

---

## 17. Standard Notes Library

```typescript
// packages/templates/src/standard-notes.ts

export interface StandardNotesConfig {
  position: Point2D;
  width: number;
  title: string;                       // "NOTES:" by default
  font: string;
  fontSize: number;
  selectedNoteIds: string[];           // Which notes to include
  customNotes: string[];               // User-added notes
}

export interface StandardNote {
  id: string;
  category: string;
  text: string;
  isDefault: boolean;                  // Included by default on new drawings
}

export const STANDARD_NOTES: StandardNote[] = [
  // ── Basis of Bearings ──
  { id: 'BOB_GPS',      category: 'BASIS',   text: 'Bearings are based on GPS observations referenced to the Texas Coordinate System of 1983, Central Zone (4203), NAD83.', isDefault: true },
  { id: 'BOB_MONUMENT', category: 'BASIS',   text: 'Bearings are based on the east line of the {ABSTRACT_NAME} Survey as recorded in Volume {VOL}, Page {PG} of the Deed Records of Bell County, Texas.', isDefault: false },
  { id: 'BOB_PLAT',     category: 'BASIS',   text: 'Bearings are based on the recorded plat of {SUBDIVISION_NAME}, recorded in Cabinet {CAB}, Slide {SLIDE} of the Plat Records of Bell County, Texas.', isDefault: false },

  // ── Datum ──
  { id: 'DATUM_NAD83',  category: 'DATUM',   text: 'Horizontal Datum: North American Datum of 1983 (NAD83). Vertical Datum: North American Vertical Datum of 1988 (NAVD88).', isDefault: true },
  { id: 'DATUM_LOCAL',  category: 'DATUM',   text: 'Coordinates shown are local assumed coordinates and do not reference any geodetic datum.', isDefault: false },

  // ── Units ──
  { id: 'UNITS_USSF',   category: 'UNITS',   text: 'All distances are in US Survey Feet unless otherwise noted.', isDefault: true },

  // ── Flood Zone ──
  { id: 'FLOOD_NONE',   category: 'FLOOD',   text: 'According to FEMA Flood Insurance Rate Map Community Panel No. {PANEL}, dated {DATE}, the subject property lies in Zone X (areas determined to be outside the 0.2% annual chance floodplain).', isDefault: false },
  { id: 'FLOOD_AE',     category: 'FLOOD',   text: 'According to FEMA Flood Insurance Rate Map Community Panel No. {PANEL}, dated {DATE}, a portion of the subject property lies in Zone AE (areas subject to inundation by the 1% annual chance flood).', isDefault: false },

  // ── Underground Utilities ──
  { id: 'UTIL_DISC',    category: 'UTILITY', text: 'The location of underground utilities shown hereon is approximate and was determined from surface evidence, utility records, and/or "as-built" plans. The surveyor makes no guarantee that all underground utilities are shown.', isDefault: true },

  // ── General ──
  { id: 'GEN_ENCROACH', category: 'GENERAL', text: 'No encroachments were observed unless otherwise noted.', isDefault: true },
  { id: 'GEN_TITLE',    category: 'GENERAL', text: 'Title commitment/policy furnished by {TITLE_CO}, GF No. {GF_NUMBER}, dated {DATE}. Refer to said commitment for easements and restrictions of record.', isDefault: false },
  { id: 'GEN_ACCESS',   category: 'GENERAL', text: 'This survey was conducted with the permission and at the request of the property owner.', isDefault: false },
  { id: 'GEN_IMPROVE',  category: 'GENERAL', text: 'Improvements shown were surveyed as they existed on the date of this survey.', isDefault: true },
];
```

---

## 18. Sheet Border & Margins

```typescript
// packages/templates/src/sheet-border.ts

export interface BorderConfig {
  visible: boolean;
  style: 'SINGLE' | 'DOUBLE' | 'TRIPLE';
  outerWeight: number;                 // mm (default: 0.7)
  innerWeight: number;                 // mm (default: 0.35)
  spacing: number;                     // Inches between lines for DOUBLE/TRIPLE (default: 0.05)
  tickMarks: boolean;                  // Registration tick marks at midpoints of each side
}

/**
 * Compute the drawable area inside the sheet border and margins.
 * This is the area where the survey drawing can appear.
 */
export function computeDrawableArea(
  paperSize: PaperSize,
  orientation: 'PORTRAIT' | 'LANDSCAPE',
  margins: { top: number; right: number; bottom: number; left: number },
  titleBlockBounds: { x: number; y: number; width: number; height: number } | null,
): { x: number; y: number; width: number; height: number } {
  const paper = PAPER_DIMENSIONS[paperSize];
  const w = orientation === 'LANDSCAPE' ? paper.height : paper.width;
  const h = orientation === 'LANDSCAPE' ? paper.width : paper.height;

  let area = {
    x: margins.left,
    y: margins.bottom,
    width: w - margins.left - margins.right,
    height: h - margins.top - margins.bottom,
  };

  // Subtract title block from drawable area
  if (titleBlockBounds) {
    // If title block is on the right, reduce width
    if (titleBlockBounds.x + titleBlockBounds.width >= area.x + area.width - 0.1) {
      area.width -= titleBlockBounds.width;
    }
    // If title block is on the bottom, reduce height
    if (titleBlockBounds.y <= area.y + 0.1) {
      area.y += titleBlockBounds.height;
      area.height -= titleBlockBounds.height;
    }
  }

  return area;
}
```

---

## 19. Default Starr Surveying Template

```typescript
// packages/templates/src/default-templates.ts

export const STARR_SURVEYING_TEMPLATE: DrawingTemplate = {
  id: 'starr-default',
  name: 'Starr Surveying — Tabloid Landscape',
  isBuiltIn: true,
  isEditable: false,

  paperSize: 'TABLOID',
  orientation: 'LANDSCAPE',
  margins: { top: 0.5, right: 0.5, bottom: 0.5, left: 0.5 },
  scale: 50,                           // 1" = 50'

  titleBlock: {
    position: 'BOTTOM_RIGHT',
    customBounds: null,
    fields: {
      projectName: '', projectSubtitle: '', projectAddress: '',
      clientName: '', surveyDate: '', sheetTitle: 'PLAT',
      sheetNumber: '1 OF 1', drawnBy: '', checkedBy: '',
      jobNumber: '', scaleText: "1\" = 50'",
    },
    showCompanyLogo: true,
    showCompanyInfo: true,
    showLicenseNumber: true,
    showSealPlaceholder: true,
    font: 'Arial',
    borderWeight: 0.7,
    dividerWeight: 0.35,
  },

  northArrow: {
    style: 'SIMPLE',
    position: { x: 15.5, y: 9.5 },    // Upper-right area
    size: 1.2,
    rotation: 0,
    showMagneticDeclination: false,
    magneticDeclination: 0,
  },

  scaleBar: {
    position: { x: 0.75, y: 0.65 },   // Lower-left area
    style: 'ALTERNATING',
    width: 3.0,
    height: 0.12,
    divisions: 0,                      // Auto-compute
    subdivisions: 2,
    showText: true,
    font: 'Arial',
    fontSize: 6,
    units: 'FEET',
  },

  legend: {
    position: { x: 0.75, y: 1.5 },
    width: 3.0,
    autoPopulate: true,
    columns: 1,
    showLineTypes: true,
    showSymbols: true,
    showColors: true,
    title: 'LEGEND',
    font: 'Arial',
    fontSize: 6,
    entries: [],
  },

  certificationBlock: {
    position: { x: 10.5, y: 0.6 },
    width: 5.5,
    visible: true,
    certificationText: DEFAULT_CERTIFICATION_TEXT,
    surveyorName: '',
    licenseNumber: '',
    licenseState: 'Texas',
    firmName: 'Starr Surveying Company',
    showSignatureLine: true,
    showDateLine: true,
    showSealPlaceholder: true,
    sealDiameter: 1.75,
    font: 'Arial',
    fontSize: 7,
  },

  standardNotes: {
    position: { x: 0.75, y: 5.5 },
    width: 4.0,
    title: 'NOTES:',
    font: 'Arial',
    fontSize: 6,
    selectedNoteIds: ['BOB_GPS', 'DATUM_NAD83', 'UNITS_USSF', 'UTIL_DISC', 'GEN_ENCROACH', 'GEN_IMPROVE'],
    customNotes: [],
  },

  border: {
    visible: true,
    style: 'DOUBLE',
    outerWeight: 0.7,
    innerWeight: 0.35,
    spacing: 0.05,
    tickMarks: true,
  },

  company: {
    name: 'STARR SURVEYING COMPANY',
    address: 'Belton, Texas',
    phone: '',
    licenseNumber: '',
    logo: null,
  },

  annotationDefaults: {
    bearingDim: {
      bearingPrecision: 'SECOND',
      distancePrecision: 2,
      defaultPosition: 'ABOVE',
      defaultOffset: 0.06,
      textRotation: 'ALONG_LINE',
      bearingAbove: true,
      extensionLines: false,
      font: 'Arial',
      fontSize: 7,
      color: '#000000',
    },
    curveData: {
      defaultFields: ['R', 'L', 'CB', 'C', 'DELTA'],
      position: 'OUTSIDE_ARC',
      followCurve: false,
      font: 'Arial',
      fontSize: 6,
      color: '#000000',
      lineSpacing: 1.2,
      prefixStyle: 'SYMBOL',
    },
    monumentLabel: { font: 'Arial', fontSize: 6, color: '#000000', defaultOffset: 0.08 },
    areaLabel: { format: 'BOTH', font: 'Arial', fontSize: 8, color: '#000000' },
  },
};

// Additional templates
export const LETTER_PORTRAIT_TEMPLATE: DrawingTemplate = {
  // Letter, portrait, 1"=20' for small residential lots
  id: 'letter-portrait',
  name: "Letter Portrait — 1\"=20'",
  paperSize: 'LETTER',
  orientation: 'PORTRAIT',
  scale: 20,
  // ... (same structure, scaled positions)
} as DrawingTemplate;

export const ARCH_D_TEMPLATE: DrawingTemplate = {
  // Arch D, landscape, 1"=100' for large commercial surveys
  id: 'arch-d',
  name: "Arch D Landscape — 1\"=100'",
  paperSize: 'ARCH_D',
  orientation: 'LANDSCAPE',
  scale: 100,
  // ...
} as DrawingTemplate;
```

---

## 20. Print / Plot System

```typescript
// packages/templates/src/print-engine.ts

export interface PrintConfig {
  paperSize: PaperSize;
  orientation: 'PORTRAIT' | 'LANDSCAPE';
  scale: number;
  scaleMode: 'FIXED' | 'FIT_TO_PAGE';

  // What to print
  printArea: 'EXTENTS' | 'DISPLAY' | 'WINDOW';
  windowBounds: { x: number; y: number; width: number; height: number } | null;
  centerOnPage: boolean;

  // Style overrides for print
  plotStyle: 'AS_DISPLAYED' | 'MONOCHROME' | 'GRAYSCALE';
  lineWeightScale: number;             // Multiplier (default: 1.0)

  // Layer overrides (some layers may be hidden for print)
  layerOverrides: Map<string, { visible: boolean; color?: string; weight?: number }>;

  // Template elements to include
  printBorder: boolean;
  printTitleBlock: boolean;
  printNorthArrow: boolean;
  printScaleBar: boolean;
  printLegend: boolean;
  printCertification: boolean;
  printNotes: boolean;

  // Output format
  output: 'PDF' | 'PNG' | 'SVG' | 'PRINTER';
  dpi: number;                         // For raster output (default: 300)
  pdfCompression: boolean;
}

/**
 * Generate a PDF from the current drawing.
 *
 * Pipeline:
 *   1. Compute paper dimensions and drawable area
 *   2. Compute world-to-paper transform (scale + offset)
 *   3. Render template elements (border, title block, north arrow, etc.)
 *   4. Render features (points, lines, arcs, splines) via the same geometry code
 *   5. Render annotations (B/D dims, curve data, monument labels, etc.)
 *   6. Generate output (PDF via jsPDF, PNG via canvas, SVG via string builder)
 */
export function generatePrintOutput(
  document: DrawingDocument,
  template: DrawingTemplate,
  config: PrintConfig,
): Promise<Blob> {
  // Abstract implementation — actual code uses jsPDF
}

/**
 * Compute the world-to-paper transform.
 * Maps survey coordinates (feet) to paper coordinates (inches).
 */
export function computePrintTransform(
  drawableArea: { x: number; y: number; width: number; height: number },
  featureExtents: { minX: number; minY: number; maxX: number; maxY: number },
  scale: number,
  centerOnPage: boolean,
): { offsetX: number; offsetY: number; scale: number } {
  const worldWidth = featureExtents.maxX - featureExtents.minX;
  const worldHeight = featureExtents.maxY - featureExtents.minY;

  let effectiveScale = scale;
  // FIT_TO_PAGE: compute scale to fit all features
  if (worldWidth / drawableArea.width > worldHeight / drawableArea.height) {
    effectiveScale = worldWidth / drawableArea.width;
  } else {
    effectiveScale = worldHeight / drawableArea.height;
  }

  // Paper inches per world foot = 1 / scale
  const ipp = 1 / effectiveScale;

  let offsetX = drawableArea.x;
  let offsetY = drawableArea.y;

  if (centerOnPage) {
    const drawingWidthInches = worldWidth * ipp;
    const drawingHeightInches = worldHeight * ipp;
    offsetX = drawableArea.x + (drawableArea.width - drawingWidthInches) / 2;
    offsetY = drawableArea.y + (drawableArea.height - drawingHeightInches) / 2;
  }

  return {
    offsetX: offsetX - featureExtents.minX * ipp,
    offsetY: offsetY - featureExtents.minY * ipp,
    scale: effectiveScale,
  };
}
```

---

## 21. Print Preview UI

Full WYSIWYG preview showing exactly what will print.

```
┌─ Print Preview ─────────────────────────────────────────────────────────┐
│                                                                         │
│  ┌────────── Paper (Tabloid Landscape) ──────────┐                     │
│  │ ┌────────────────────────────────────────────┐ │                     │
│  │ │                                            │ │                     │
│  │ │        SURVEY DRAWING AREA                 │ │                     │
│  │ │                                            │ │   Paper: [TABLOID▼] │
│  │ │   (features, annotations, all rendered     │ │   Orient: [LAND ▼]  │
│  │ │    at correct scale with styling)          │ │   Scale: [1"=50'▼]  │
│  │ │                                            │ │   Area: [EXTENTS▼]  │
│  │ │                                            │ │   Center: [✓]       │
│  │ │                                            │ │   Style: [AS DISP▼] │
│  │ │  ┌─────────┐                               │ │                     │
│  │ │  │ N.ARROW │        ┌──────────────────┐   │ │   ☑ Border          │
│  │ │  └─────────┘        │   TITLE BLOCK    │   │ │   ☑ Title Block     │
│  │ │  ┌─────────┐        │                  │   │ │   ☑ North Arrow     │
│  │ │  │SCALE BAR│        └──────────────────┘   │ │   ☑ Scale Bar       │
│  │ │  └─────────┘                               │ │   ☑ Legend          │
│  │ └────────────────────────────────────────────┘ │   ☑ Certification   │
│  │  (gray = margins, white = printable)           │   ☑ Notes            │
│  └────────────────────────────────────────────────┘                     │
│                                                                         │
│  [Print to PDF]  [Print to PNG]  [Print to Printer]  [Cancel]          │
└─────────────────────────────────────────────────────────────────────────┘
```

The preview is interactive: drag to reposition the drawing on the sheet. Dropdown controls update the preview in real-time. Red dashed outline shows the print boundary when using WINDOW mode.

---

## 22. Annotation Rendering

All annotations render to PixiJS for on-screen display and to jsPDF for print output. The rendering system uses an abstraction layer so the same positioning/styling logic drives both.

```typescript
// packages/annotations/src/annotation-renderer.ts

export interface RenderContext {
  // Abstraction over PixiJS (screen) or jsPDF (print)
  text(content: string, x: number, y: number, opts: TextOpts): void;
  line(x1: number, y1: number, x2: number, y2: number, weight: number): void;
  rect(x: number, y: number, w: number, h: number, weight: number): void;
  setColor(color: string): void;
  setFont(font: string, size: number, bold: boolean, italic: boolean): void;
  setRotation(angle: number, cx: number, cy: number): void;
  resetRotation(): void;
}

export function renderAnnotation(
  ctx: RenderContext,
  annotation: AnnotationBase,
  placement: LabelPlacement | null,     // From optimizer, or null for manual
  drawingScale: number,
): void {
  const offset = placement ?? {
    offsetX: 0, offsetY: 0, rotation: 0, fontSize: 0,
    strategy: 'ORIGINAL', hasLeader: false, leaderPoints: [],
  };

  switch (annotation.type) {
    case 'BEARING_DISTANCE':
      renderBearingDim(ctx, annotation as BearingDistanceDimension, offset, drawingScale);
      break;
    case 'CURVE_DATA':
      renderCurveData(ctx, annotation as CurveDataAnnotation, offset, drawingScale);
      break;
    case 'MONUMENT_LABEL':
      renderMonumentLabel(ctx, annotation as MonumentLabel, offset, drawingScale);
      break;
    case 'AREA_LABEL':
      renderAreaLabel(ctx, annotation as AreaAnnotation, offset);
      break;
    case 'TEXT':
      renderTextAnnotation(ctx, annotation as TextAnnotation, offset);
      break;
    case 'LEADER':
      renderLeader(ctx, annotation as LeaderAnnotation, offset);
      break;
  }
}

function renderBearingDim(
  ctx: RenderContext,
  dim: BearingDistanceDimension,
  placement: LabelPlacement,
  scale: number,
): void {
  const { bearingPos, distancePos, rotation } = computeBearingDimPlacement(dim, scale);

  ctx.setFont(dim.font, placement.fontSize || dim.fontSize, false, false);
  ctx.setColor(dim.color);
  ctx.setRotation(rotation, bearingPos.x + placement.offsetX, bearingPos.y + placement.offsetY);

  ctx.text(dim.bearingText,  bearingPos.x  + placement.offsetX, bearingPos.y  + placement.offsetY, { align: 'center' });
  ctx.text(dim.distanceText, distancePos.x + placement.offsetX, distancePos.y + placement.offsetY, { align: 'center' });

  ctx.resetRotation();

  // Extension lines
  if (dim.extensionLines) {
    const len = dim.extensionLineLength * scale;
    const angle = Math.atan2(dim.endPoint.y - dim.startPoint.y, dim.endPoint.x - dim.startPoint.x);
    const px = -Math.sin(angle), py = Math.cos(angle);
    ctx.line(dim.startPoint.x + px * len, dim.startPoint.y + py * len, dim.startPoint.x - px * len, dim.startPoint.y - py * len, 0.18);
    ctx.line(dim.endPoint.x  + px * len, dim.endPoint.y  + py * len, dim.endPoint.x  - px * len, dim.endPoint.y  - py * len, 0.18);
  }

  // Leader line (if optimizer added one)
  if (placement.hasLeader && placement.leaderPoints.length > 0) {
    const pts = placement.leaderPoints;
    for (let i = 0; i < pts.length - 1; i++) {
      ctx.line(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y, 0.15);
    }
  }
}
```

---

## 23. State Management Updates

### 23.1 Annotation Store (NEW)

```typescript
interface AnnotationStore {
  annotations: Record<string, AnnotationBase>;
  optimizerResult: OptimizationResult | null;

  // Actions
  addAnnotation: (annotation: AnnotationBase) => void;
  removeAnnotation: (id: string) => void;
  updateAnnotation: (id: string, updates: Partial<AnnotationBase>) => void;
  clearAllAnnotations: () => void;
  autoAnnotateAll: (config: AutoAnnotateConfig) => void;
  runOptimizer: (config: LabelOptConfig) => void;

  // Queries
  getAnnotation: (id: string) => AnnotationBase | undefined;
  getAnnotationsForFeature: (featureId: string) => AnnotationBase[];
  getAnnotationsByType: (type: AnnotationType) => AnnotationBase[];
  getAllAnnotations: () => AnnotationBase[];
  getFlaggedAnnotations: () => AnnotationBase[];
}
```

### 23.2 Template Store (NEW)

```typescript
interface TemplateStore {
  activeTemplate: DrawingTemplate;
  builtInTemplates: DrawingTemplate[];
  customTemplates: DrawingTemplate[];

  // Actions
  setActiveTemplate: (template: DrawingTemplate) => void;
  updateActiveTemplate: (updates: Partial<DrawingTemplate>) => void;
  saveCustomTemplate: (template: DrawingTemplate) => void;
  deleteCustomTemplate: (id: string) => void;
  resetToDefault: () => void;

  // Queries
  getTemplate: (id: string) => DrawingTemplate | undefined;
  getAllTemplates: () => DrawingTemplate[];
}
```

### 23.3 Print Store (NEW)

```typescript
interface PrintStore {
  config: PrintConfig;
  isPreviewOpen: boolean;
  previewData: Blob | null;

  // Actions
  updateConfig: (updates: Partial<PrintConfig>) => void;
  openPreview: () => void;
  closePreview: () => void;
  generatePreview: () => Promise<void>;
  exportPDF: () => Promise<Blob>;
  exportPNG: () => Promise<Blob>;
  print: () => Promise<void>;
}
```

---

## 24. Acceptance Tests

### Annotations

- [ ] B/D dimension: bearing and distance text correct for a known line
- [ ] B/D dimension: text stays readable (never upside-down) for lines in all 4 quadrants
- [ ] B/D dimension: text offset positions correctly above/below line
- [ ] Curve data: all 5 default fields shown for a known curve
- [ ] Curve data: positioned outside arc by default
- [ ] Monument label: `"1/2\" Iron Rod Found"` text generated for BC02 + FOUND action
- [ ] Monument label: `"5/8\" IRS"` abbreviated text for BC07 + SET action
- [ ] Area label: correct sq ft and acres for a known polygon
- [ ] Area label: positioned at centroid
- [ ] Text annotation: placed at click position, editable in-place
- [ ] Leader: arrow points to feature, text at endpoint, bends work

### Auto-Annotation

- [ ] Auto-annotate generates B/D dims for all boundary lines
- [ ] Auto-annotate generates curve data for all arcs
- [ ] Auto-annotate generates monument labels for all boundary control points
- [ ] Auto-annotate generates area labels for closed traverses
- [ ] Auto-annotate skips non-boundary layers

### Label Optimization

- [ ] Overlapping B/D dims: lower-priority one flipped to other side
- [ ] Tight space: monument label gets leader line
- [ ] Flagged annotations: unresolvable collisions flagged for manual review
- [ ] Manually-placed labels not moved by optimizer

### Template

- [ ] Starr Surveying default template loads correctly
- [ ] Paper size change updates drawable area
- [ ] Scale change updates scale bar and B/D dim positions
- [ ] Custom template saves and loads

### Title Block

- [ ] All fields render in correct positions
- [ ] Company logo displays when provided
- [ ] Seal placeholder renders as circle outline
- [ ] `BOTTOM_RIGHT` and `RIGHT_STRIP` positions work

### North Arrow

- [ ] All 4 styles render correctly
- [ ] Draggable on canvas
- [ ] Rotation adjustable
- [ ] "N" label present

### Scale Bar

- [ ] Auto-computes nice round divisions for 1"=50' (0, 50, 100, 150)
- [ ] Alternating fill pattern renders
- [ ] Updates when scale changes

### Legend

- [ ] Auto-populated from features present in drawing
- [ ] Shows correct line type samples for fence codes
- [ ] Shows correct symbol samples for monument codes
- [ ] Only includes codes actually used in the drawing

### Certification

- [ ] Text renders with correct substitutions
- [ ] Signature line renders
- [ ] Seal placeholder renders at correct diameter

### Standard Notes

- [ ] Default notes appear on new drawings
- [ ] Custom notes can be added
- [ ] Note text supports template variables (`{PANEL}`, `{DATE}`, etc.)

### Print

- [ ] PDF output matches print preview WYSIWYG
- [ ] Paper size correct in output
- [ ] Scale verified: 1" on PDF measures correct footage
- [ ] Monochrome plot style converts all colors to black
- [ ] Layer overrides applied (hidden layers not in output)
- [ ] Template elements (border, title block, etc.) render in output
- [ ] PNG output at 300 DPI
- [ ] `FIT_TO_PAGE` scales drawing to fill available space

---

## 25. Build Order (Implementation Sequence)

### Week 1: Annotation Types & Core Logic

- Create `packages/annotations` package
- Define all annotation type interfaces
- Build `bearing-dim.ts` (creation + placement computation)
- Build `curve-data.ts` (creation + text line generation)
- Build `monument-label.ts` (text generation + label creation)
- Build `area-label.ts` (centroid placement)
- Write unit tests for all annotation creators

### Week 2: Auto-Annotation & Optimizer

- Build `auto-annotate.ts` (one-pass generation engine)
- Build `label-optimizer.ts` (collision detection)
- Implement AABB overlap testing
- Implement simulated annealing loop
- Implement resolution strategies (flip, slide, leader, shrink, stack, abbreviate, flag)
- Write tests with synthetic overlapping labels
- Test optimizer with real survey data layout

### Week 3: Template System

- Create `packages/templates` package
- Define `DrawingTemplate` and all sub-config interfaces
- Build `default-templates.ts` (Starr Surveying default, Letter, Arch D)
- Build `title-block.ts` (layout computation + rendering)
- Build `north-arrow.ts` (4 styles + rendering)
- Build `scale-bar.ts` (auto-division computation + rendering)
- Build `legend.ts` (auto-populate + rendering)
- Build `certification.ts` (text template + seal placeholder)
- Build `standard-notes.ts` (note library + rendering)
- Build `sheet-border.ts` (single/double/triple border + margins)
- Write tests for template element positioning

### Week 4: Print Engine

- Build `print-engine.ts` (jsPDF integration)
- Implement world-to-paper transform
- Implement feature rendering to PDF (lines, arcs, polylines, symbols)
- Implement annotation rendering to PDF
- Implement template element rendering to PDF
- Build PNG export path (canvas rasterization)
- Build SVG export path (string builder)
- Test PDF output scale accuracy (measure 1" on paper)
- Test with Starr Surveying default template

### Week 5: UI Components

- Build annotation tools: `BearingDimTool`, `CurveDataTool`, `TextTool`, `LeaderTool`, `AreaLabelTool`
- Build `AnnotationProperties` panel (edit selected annotation)
- Build `TemplateChooser` dialog
- Build `TitleBlockEditor` dialog
- Build `NorthArrowPicker`, `ScaleBarConfig`, `LegendEditor`, `CertificationEditor`, `StandardNotesEditor`
- Build `PrintDialog` with all settings
- Build `PrintPreview` (WYSIWYG with interactive repositioning)
- Wire all tools into toolbar and menus

### Week 6–7: Integration & Polish

- Create `AnnotationStore`, `TemplateStore`, `PrintStore`
- Wire annotation rendering into the PixiJS canvas pipeline
- Wire template elements into the canvas (visible in "layout view" or always)
- Implement "Auto-Annotate" button in toolbar
- Implement "Optimize Labels" button
- Implement linked annotation updates (move feature → B/D dim updates)
- Test full workflow: import CSV → auto-annotate → optimize → print PDF
- Test with multiple templates (Tabloid, Letter, Arch D)
- Run ALL acceptance tests from Section 24
- Performance test with 200+ annotations
- Fix failures, polish UI

---

## Copilot Session Template

> I am building Starr CAD Phase 5 — Annotations, Dimensions, Templates & Print. Phases 1–4 (CAD engine, data import, styling, geometry/math) are complete. I am now building the annotation system (bearing/distance dimensions, curve data labels, monument callouts, area labels, text/leader tools), the auto-annotation engine that generates all labels in one pass, the label optimization engine (simulated annealing collision detection with flip/slide/leader/shrink/stack/abbreviate strategies), the template system (title block configurator, north arrow, scale bar, auto-populated legend, RPLS certification block, standard notes library), and the print/plot system (PDF/PNG/SVG export via jsPDF with WYSIWYG preview). The spec is in STARR_CAD_PHASE_5_ANNOTATIONS_PRINT.md. I am currently working on [CURRENT TASK from Build Order].

---

*End of Phase 5 Specification*
*Starr Surveying Company — Belton, Texas — March 2026*
