// lib/cad/types.ts — Core TypeScript types for the Starr CAD engine

/** Generate a unique ID. Use for all entities. */
export function generateId(): string {
  return crypto.randomUUID();
}

// --- GEOMETRY PRIMITIVES ---

export interface Point2D {
  x: number; // Easting in survey coords, or screen X
  y: number; // Northing in survey coords, or screen Y
}

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

// --- DRAWING DOCUMENT ---

export interface DrawingDocument {
  id: string;
  name: string;
  created: string; // ISO 8601
  modified: string;
  author: string;

  // Content
  features: Record<string, Feature>; // featureId -> Feature
  layers: Record<string, Layer>; // layerId -> Layer
  layerOrder: string[]; // Layer IDs in render order (bottom to top)

  // Phase 3 additions
  layerGroups: Record<string, import('./styles/types').LayerGroup>;
  layerGroupOrder: string[];
  customSymbols: import('./styles/types').SymbolDefinition[];
  customLineTypes: import('./styles/types').LineTypeDefinition[];
  codeStyleOverrides: Record<string, Partial<import('./styles/types').CodeStyleMapping>>;
  globalStyleConfig: import('./styles/types').GlobalStyleConfig;

  // Configuration
  settings: DrawingSettings;
}

export interface DrawingSettings {
  units: 'FEET';

  // Grid
  gridVisible: boolean;
  gridMajorSpacing: number; // World units (default: 100)
  gridMinorDivisions: number; // Subdivisions per major (default: 10)
  gridStyle: 'DOTS' | 'LINES' | 'CROSSHAIRS';

  // Snap
  snapEnabled: boolean;
  snapTypes: SnapType[];
  snapRadius: number; // Screen pixels (default: 15)

  // Display
  backgroundColor: string; // Hex (default: "#FFFFFF")

  // Display colors (UI customization)
  selectionColor: string;  // Hex, default '#0088ff'
  hoverColor: string;      // Hex, default '#66aaff'
  gridMajorColor: string;  // Hex, default '#c8c8c8'
  gridMinorColor: string;  // Hex, default '#e8e8e8'

  // Paper
  paperSize: 'LETTER' | 'TABLOID' | 'ARCH_C' | 'ARCH_D' | 'ARCH_E';
  paperOrientation: 'PORTRAIT' | 'LANDSCAPE';
  drawingScale: number; // e.g., 50 for 1"=50'
  codeDisplayMode: 'ALPHA' | 'NUMERIC';
}

// --- FEATURES ---

export type FeatureType = 'POINT' | 'LINE' | 'POLYLINE' | 'POLYGON';

export interface Feature {
  id: string;
  type: FeatureType;
  geometry: FeatureGeometry;
  layerId: string;
  style: FeatureStyle;
  properties: Record<string, string | number | boolean>;
}

export interface FeatureGeometry {
  type: FeatureType;
  point?: Point2D;
  start?: Point2D;
  end?: Point2D;
  vertices?: Point2D[];
}

export interface FeatureStyle {
  color: string | null;       // null = inherit from cascade
  lineWeight: number | null;  // null = inherit
  opacity: number;            // 0–1, always present

  // Phase 3 additions
  lineTypeId: string | null;
  symbolId: string | null;
  symbolSize: number | null;
  symbolRotation: number;
  labelVisible: boolean | null;
  labelFormat: string | null;
  labelOffset: { x: number; y: number };
  isOverride: boolean;
}

// --- LAYERS ---

export interface Layer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  frozen: boolean;
  color: string;
  lineWeight: number;
  lineTypeId: string;
  opacity: number;
  groupId: string | null;
  sortOrder: number;
  isDefault: boolean;
  isProtected: boolean;
  autoAssignCodes: string[];
  featureCount?: number;
}

// --- SNAP ---

export type SnapType =
  | 'ENDPOINT'
  | 'MIDPOINT'
  | 'INTERSECTION'
  | 'NEAREST'
  | 'CENTER'
  | 'PERPENDICULAR'
  | 'GRID';

export interface SnapResult {
  point: Point2D; // World coordinates
  type: SnapType;
  featureId: string | null; // null for GRID snaps
  vertexIndex?: number; // Which vertex (for ENDPOINT)
  distance: number; // Screen distance from cursor to snap point
}

// --- SELECTION ---

export type SelectionMode = 'REPLACE' | 'ADD' | 'REMOVE' | 'TOGGLE';

export type BoxSelectMode = 'WINDOW' | 'CROSSING';

// --- TOOLS ---

export type ToolType =
  | 'SELECT'
  | 'PAN'
  | 'DRAW_POINT'
  | 'DRAW_LINE'
  | 'DRAW_POLYLINE'
  | 'DRAW_POLYGON'
  | 'DRAW_RECTANGLE'
  | 'DRAW_REGULAR_POLYGON'
  | 'DRAW_CIRCLE'
  | 'MOVE'
  | 'COPY'
  | 'ROTATE'
  | 'MIRROR'
  | 'SCALE'
  | 'ERASE';

export interface ToolState {
  activeTool: ToolType;

  // Drawing tool state
  drawingPoints: Point2D[]; // Points collected so far for current draw operation
  previewPoint: Point2D | null; // Current mouse position (snapped) for live preview

  // Move/copy state
  basePoint: Point2D | null;
  displacement: Point2D | null;

  // Rotate state
  rotateCenter: Point2D | null;
  rotateAngle: number;

  // Scale state
  scaleFactor: number;

  // Regular polygon state
  regularPolygonSides: number; // 3–20, used by DRAW_REGULAR_POLYGON

  // Drawing constraints
  orthoEnabled: boolean;   // Constrain movement to H/V axes (F8)
  polarEnabled: boolean;   // Polar angle tracking (F10)
  polarAngle: number;      // Degrees per polar snap increment (e.g. 45)
  copyMode: boolean;       // For MOVE/ROTATE/SCALE: keep original when true

  // Box select state
  boxStart: Point2D | null; // Screen coordinates
  boxEnd: Point2D | null;
  isBoxSelecting: boolean;
}

// --- UNDO ---

export type UndoOperationType =
  | 'ADD_FEATURE'
  | 'REMOVE_FEATURE'
  | 'MODIFY_FEATURE'
  | 'ADD_LAYER'
  | 'REMOVE_LAYER'
  | 'MODIFY_LAYER'
  | 'BATCH';

export interface UndoOperation {
  type: UndoOperationType;
  data: unknown;
}

export interface UndoEntry {
  id: string;
  description: string;
  timestamp: number;
  operations: UndoOperation[];
}

// --- COMMAND BAR ---

export interface CommandEntry {
  raw: string; // What the user typed
  parsed: ParsedCommand;
  timestamp: number;
}

export interface ParsedCommand {
  type: 'COORDINATE' | 'DISTANCE' | 'ANGLE' | 'COMMAND' | 'UNKNOWN';
  value: unknown;
}

// ─── PHASE 2: SURVEY POINT DATA MODEL ───

export type CodeSuffix = 'B' | 'E' | 'C' | 'A' | 'BA' | 'EA' | 'CA';

export type MonumentAction = 'FOUND' | 'SET' | 'CALCULATED' | 'UNKNOWN';

export type PointNameSuffix = 'FOUND' | 'SET' | 'CALCULATED' | 'NONE';

export type CodeCategory =
  | 'BOUNDARY_CONTROL'
  | 'SURVEY_CONTROL'
  | 'PROPERTY_LINES'
  | 'STRUCTURES'
  | 'FENCES'
  | 'UTILITIES'
  | 'VEGETATION'
  | 'TOPOGRAPHY'
  | 'TRANSPORTATION'
  | 'CURVES'
  | 'MISCELLANEOUS';

export type LineSegmentType = 'STRAIGHT' | 'ARC' | 'SPLINE';

export interface ParsedPointName {
  baseNumber: number;
  suffix: string;
  normalizedSuffix: PointNameSuffix;
  suffixVariant: string;
  suffixConfidence: number;
  isRecalc: boolean;
  recalcSequence: number;
}

export interface ParsedPointCode {
  rawCode: string;
  baseCode: string;
  isNumeric: boolean;
  isAlpha: boolean;
  suffix: CodeSuffix | null;
  isValid: boolean;
  isLineCode: boolean;
  isAutoSpline: boolean;
}

export interface PointCodeDefinition {
  alphaCode: string;
  numericCode: string;
  description: string;
  category: CodeCategory;
  subcategory: string;
  connectType: 'POINT' | 'LINE';
  isAutoSpline: boolean;
  defaultSymbolId: string;
  defaultLineTypeId: string;
  defaultColor: string;
  defaultLineWeight: number;
  defaultLayerId: string;
  defaultLabelFormat: string;
  simplifiedCode: string;
  simplifiedDescription: string;
  collapses: boolean;
  monumentAction: MonumentAction | null;
  monumentSize: string | null;
  monumentType: string | null;
  isBuiltIn: boolean;
  isNew: boolean;
  notes: string;
}

export interface ValidationIssue {
  type: ValidationIssueType;
  severity: 'INFO' | 'WARNING' | 'ERROR';
  pointId: string;
  message: string;
  autoFixable: boolean;
  autoFixAction?: string;
}

export type ValidationIssueType =
  | 'DUPLICATE_POINT_NUMBER'
  | 'ZERO_COORDINATES'
  | 'UNRECOGNIZED_CODE'
  | 'AMBIGUOUS_CODE'
  | 'MISSING_ELEVATION'
  | 'COORDINATE_OUTLIER'
  | 'DUPLICATE_COORDINATES'
  | 'ORPHAN_END_SUFFIX'
  | 'ORPHAN_BEGIN_SUFFIX'
  | 'SINGLE_POINT_LINE'
  | 'MIXED_CODES_IN_SEQUENCE'
  | 'NAME_SUFFIX_AMBIGUOUS'
  | 'CALC_WITHOUT_FIELD';

export interface SurveyPoint {
  id: string;
  pointNumber: number;
  pointName: string;
  parsedName: ParsedPointName;
  northing: number;
  easting: number;
  elevation: number | null;
  rawCode: string;
  parsedCode: ParsedPointCode;
  resolvedAlphaCode: string;
  resolvedNumericCode: string;
  codeSuffix: CodeSuffix | null;
  codeDefinition: PointCodeDefinition | null;
  monumentAction: MonumentAction | null;
  description: string;
  rawRecord: string;
  importSource: string;
  layerId: string;
  featureId: string;
  lineStringIds: string[];
  validationIssues: ValidationIssue[];
  confidence: number;
  isAccepted: boolean;
}

export interface LineString {
  id: string;
  codeBase: string;
  pointIds: string[];
  isClosed: boolean;
  segments: LineSegmentType[];
  featureId: string | null;
}

export interface PointGroup {
  baseNumber: number;
  allPoints: SurveyPoint[];
  calculated: SurveyPoint[];
  found: SurveyPoint | null;
  set: SurveyPoint | null;
  none: SurveyPoint[];
  finalPoint: SurveyPoint;
  finalSource: 'SET' | 'FOUND' | 'CALCULATED' | 'NONE';
  calcSetDelta: number | null;
  calcFoundDelta: number | null;
  hasBothCalcAndField: boolean;
  deltaWarning: boolean;
}
