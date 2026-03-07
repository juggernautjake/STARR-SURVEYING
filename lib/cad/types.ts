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

// ─── DISPLAY PREFERENCES ───

export type LinearUnit = 'FT' | 'IN' | 'MILE' | 'M' | 'CM' | 'MM';
export type LinearFormat = 'DECIMAL' | 'FRACTION';
export type AreaUnit = 'SQ_FT' | 'ACRES' | 'SQ_M' | 'HECTARES';
export type AngleFormat = 'DMS' | 'DECIMAL_DEG';
export type BearingFormat = 'QUADRANT' | 'AZIMUTH';
export type CoordMode = 'NE' | 'XY';

/**
 * User-configurable display preferences for units, formats, and coordinate mode.
 * Stored in DrawingSettings so preferences persist per drawing.
 */
export interface DisplayPreferences {
  /** Distance unit for all linear measurements. Default: 'FT' */
  linearUnit: LinearUnit;
  /** Decimal vs. fraction representation of linear values. Default: 'DECIMAL' */
  linearFormat: LinearFormat;
  /** Number of decimal places (or denominator size for fractions). Default: 3 */
  linearDecimalPlaces: number;
  /** Area unit. Default: 'SQ_FT' */
  areaUnit: AreaUnit;
  /** DMS vs. decimal-degree display for angles. Default: 'DMS' */
  angleFormat: AngleFormat;
  /** Quadrant (N xx°xx'xx" E) vs. azimuth (0–360). Default: 'QUADRANT' */
  bearingFormat: BearingFormat;
  /** Whether to show Northing/Easting labels or plain X/Y. Default: 'NE' */
  coordMode: CoordMode;
  /**
   * World-space origin offset for coordinate display.
   * Displayed Northing = worldY + originNorthing
   * Displayed Easting  = worldX + originEasting
   * Set automatically when importing survey data with real-world coordinates.
   */
  originNorthing: number;
  originEasting: number;
}

// --- DRAWING DOCUMENT ---

/** A raster or vector image stored in the project (full-resolution, referenced by IMAGE features). */
export interface ProjectImage {
  id: string;
  name: string;           // Original filename or user label
  dataUrl: string;        // Full-resolution base64 data URL
  originalWidth: number;  // Native pixel width
  originalHeight: number; // Native pixel height
  addedAt: string;        // ISO 8601 timestamp
}

/**
 * A named group of features on the same layer.  Features in a group
 * move / rotate / scale together when any member is manipulated.
 * Users can ungroup at any time via the right-click context menu.
 */
export interface FeatureGroup {
  id: string;
  name: string;
  /** All members must share this layerId. */
  layerId: string;
  featureIds: string[];
}

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

  /** Named feature groups (same-layer only). featureGroupId -> FeatureGroup. */
  featureGroups: Record<string, FeatureGroup>;

  // Phase 3 additions
  layerGroups: Record<string, import('./styles/types').LayerGroup>;
  layerGroupOrder: string[];
  customSymbols: import('./styles/types').SymbolDefinition[];
  customLineTypes: import('./styles/types').LineTypeDefinition[];
  codeStyleOverrides: Record<string, Partial<import('./styles/types').CodeStyleMapping>>;
  globalStyleConfig: import('./styles/types').GlobalStyleConfig;

  /** Project-level image library. IMAGE features reference images by id. */
  projectImages: Record<string, ProjectImage>;

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

  // Selection behavior for grouped elements (polylines, polygon groups)
  // 'GROUP_FIRST' = first click selects entire group, then click again to select individual segment
  // 'ELEMENT_FIRST' = first click selects individual segment, right-click > "Select Group" for whole group
  groupSelectMode: 'GROUP_FIRST' | 'ELEMENT_FIRST';

  // Box selection (rectangle drag) behavior:
  // 'CROSSING_EXPAND_GROUPS' = any overlap selects, and expands to full polyline/polygon groups
  // 'CROSSING_INDIVIDUAL' = any overlap selects individual elements only (no group expansion)
  // 'WINDOW_FULL_ONLY' = only elements/groups fully enclosed in the rectangle are selected
  boxSelectMode: 'CROSSING_EXPAND_GROUPS' | 'CROSSING_INDIVIDUAL' | 'WINDOW_FULL_ONLY';

  // Paper
  paperSize: 'LETTER' | 'TABLOID' | 'ARCH_C' | 'ARCH_D' | 'ARCH_E';
  paperOrientation: 'PORTRAIT' | 'LANDSCAPE';
  drawingScale: number; // e.g., 50 for 1"=50'
  codeDisplayMode: 'ALPHA' | 'NUMERIC';

  // Interaction & Viewport
  zoomSpeed: number;           // Multiplier for scroll zoom (0.5=slow, 1.0=default, 2.0=fast)
  zoomTowardCursor: boolean;   // true = zoom centers on cursor, false = zoom centers on viewport center
  invertScrollZoom: boolean;   // true = scroll up zooms out (inverted), false = scroll up zooms in (natural)
  panSpeed: number;            // Multiplier for pan sensitivity (0.5=slow, 1.0=default, 2.0=fast)
  dragThreshold: number;       // Pixels of movement before a click becomes a drag (default: 5)

  // Grip & Handle appearance
  gripSize: number;            // Size of selection grip squares in pixels (3–12, default: 6)
  gripColor: string;           // Grip square color, default matches selectionColor
  gripFillColor: string;       // Grip square fill color (default: '#ffffff')

  // Hover & highlight
  hoverGlowEnabled: boolean;   // Show multi-layer glow on hover (default: true)
  hoverGlowIntensity: number;  // Glow intensity multiplier 0.5–2.0 (default: 1.0)
  selectionLineWidth: number;  // Width of selection outline in pixels (default: 1.5)

  // Labels & annotations display
  showPointLabels: boolean;    // Show labels on point features (default: true)
  showLineLabels: boolean;     // Show bearing/distance labels on lines (default: true)
  showDimensions: boolean;     // Show dimension annotations (default: true)

  // Cursor
  cursorCrosshairSize: number; // Size of crosshair cursor in pixels (16–48, default: 24)
  showCursorCoordinates: boolean; // Show coordinate readout near cursor (default: false)

  // Auto-save
  autoSaveEnabled: boolean;    // Enable periodic auto-save (default: true)
  autoSaveIntervalSec: number; // Seconds between auto-saves (30–600, default: 120)

  // User display preferences (units, bearings, coordinates)
  displayPreferences: DisplayPreferences;

  // Drawing view rotation (visual only — does not alter survey data or bearings)
  drawingRotationDeg: number; // Degrees CW on screen (default: 0)

  // Title block / survey info overlay
  titleBlock: TitleBlockConfig;
}

// ─── TITLE BLOCK ───

export type NorthArrowStyle = 'SIMPLE' | 'COMPASS_ROSE' | 'DETAILED' | 'TRADITIONAL' | 'STARR';
export type InfoBoxStyle = 'STANDARD' | 'MINIMAL' | 'DETAILED';

/** Configuration for the survey title block rendered on the drawing paper. */
export interface TitleBlockConfig {
  /** Show or hide the entire title block. Default: true */
  visible: boolean;
  northArrowStyle: NorthArrowStyle;
  /** Size of the north arrow symbol in paper inches. Default: 1.5 */
  northArrowSizeIn: number;
  infoBoxStyle: InfoBoxStyle;

  // Survey metadata fields shown in the info box
  firmName: string;
  surveyorName: string;
  surveyorLicense: string;
  projectName: string;
  projectNumber: string;
  clientName: string;
  surveyDate: string;
  /** Label shown for the scale, e.g. "1\" = 50'". Auto-populated if blank. */
  scaleLabel: string;
  sheetNumber: string;
  totalSheets: string;
  notes: string;
  /** Type of survey shown in the title block header, e.g. "BOUNDARY SURVEY". Default: "BOUNDARY SURVEY" */
  surveyType?: string;

  // ── Moveable element positions (paper-inch from paper bottom-left; null = use default) ──
  /** North arrow box position (bottom-left corner, paper inches from paper BL). null = top-right default. */
  northArrowPos?: { x: number; y: number } | null;
  /** Title block position (bottom-left corner, paper inches from paper BL). null = bottom-right default. */
  titleBlockPos?: { x: number; y: number } | null;
  /** Scale bar position (bottom-left corner, paper inches from paper BL). null = bottom-center default. */
  scaleBarPos?: { x: number; y: number } | null;
  /** Signature/seal block position (bottom-left corner, paper inches from paper BL). null = bottom-left default. */
  signatureBlockPos?: { x: number; y: number } | null;
  /** "OFFICIAL SEAL" label position (bottom-left, paper inches from paper BL). null = inside signature block. */
  officialSealLabelPos?: { x: number; y: number } | null;

  // ── Scale bar ──
  /** Show the checkered graphic scale bar. Default: true */
  scaleBarVisible?: boolean;
  /** Length of the scale bar in paper inches. Default: 2.0 */
  scaleBarLengthIn?: number;
  /** Number of checkered segments in the scale bar. Default: 4 */
  scaleBarSegments?: number;
  /** Units label shown below the scale bar. Default: "FEET" */
  scaleBarUnits?: string;

  // ── Per-element scale factors (multiplied on top of intrinsic sizing; default 1.0) ──
  // Clamped to [TB_ELEM_SCALE_MIN, TB_ELEM_SCALE_MAX] (0.5 – 2.5) at render time.
  /** Scale multiplier for the title block box. Default: 1.0 */
  titleBlockScale?: number;
  /** Scale multiplier for the signature/seal block. Default: 1.0 */
  signatureBlockScale?: number;
  /** Scale multiplier for the graphic scale bar. Default: 1.0 */
  scaleBarScale?: number;
  /** Scale multiplier for the north arrow symbol. Default: 1.0 */
  northArrowScale?: number;

  // ── Per-element rotation in degrees (clockwise on screen; default 0) ──
  /** Rotation in degrees for the title block box. Default: 0 */
  titleBlockRotationDeg?: number;
  /** Rotation in degrees for the signature/seal block. Default: 0 */
  signatureBlockRotationDeg?: number;
  /** Rotation in degrees for the graphic scale bar. Default: 0 */
  scaleBarRotationDeg?: number;
  /** Rotation offset in degrees for the north arrow (added to drawing rotation). Default: 0 */
  northArrowRotationOffsetDeg?: number;

  // ── Custom field labels shown in the title block data rows ──
  // Keys match the drawCell label argument; value overrides the displayed label.
  fieldLabels?: Partial<{
    project:    string;
    jobNo:      string;
    client:     string;
    date:       string;
    preparedBy: string;
    licenseNo:  string;
    scale:      string;
    sheet:      string;
  }>;
}

// --- FEATURES ---

export type FeatureType = 'POINT' | 'LINE' | 'POLYLINE' | 'POLYGON' | 'CIRCLE' | 'ELLIPSE' | 'ARC' | 'SPLINE' | 'TEXT' | 'MIXED_GEOMETRY' | 'IMAGE';

export interface Feature {
  id: string;
  type: FeatureType;
  geometry: FeatureGeometry;
  layerId: string;
  style: FeatureStyle;
  properties: Record<string, string | number | boolean>;

  /** ID of the FeatureGroup this feature belongs to, or null/undefined if ungrouped. */
  featureGroupId?: string | null;

  /** Text labels generated from layer display preferences. */
  textLabels?: TextLabel[];
  /** Hidden by user (right-click hide). Feature still exists but is not rendered. */
  hidden?: boolean;
}

export interface FeatureGeometry {
  type: FeatureType;
  point?: Point2D;
  start?: Point2D;
  end?: Point2D;
  vertices?: Point2D[];

  // ── True curve parametric data ──
  /** Circle: center + radius (type='POLYGON', shapeType='CIRCLE') */
  circle?: CircleGeometry;
  /** Ellipse: center + radii + rotation (type='POLYGON', shapeType='ELLIPSE') */
  ellipse?: EllipseGeometry;
  /** Arc: center + radius + angles (type='ARC') */
  arc?: ArcGeometry;
  /** Cubic bezier spline segments (type='SPLINE') */
  spline?: SplineGeometry;

  /** Text geometry: used when type='TEXT' */
  textContent?: string;    // The text string
  textRotation?: number;   // Rotation in radians (0 = horizontal)
  textWidth?: number;      // Width in world units (0 = auto)

  /** Image geometry: used when type='IMAGE' */
  image?: ImageGeometry;
}

/**
 * Geometry for an IMAGE feature. The image is positioned/sized in world coordinates.
 * The original bitmap is stored separately in DrawingDocument.projectImages.
 */
export interface ImageGeometry {
  /** References DrawingDocument.projectImages[imageId] */
  imageId: string;
  /** Bottom-left anchor in world coordinates */
  position: Point2D;
  /** Display width in world units */
  width: number;
  /** Display height in world units */
  height: number;
  /** Rotation in radians, CCW positive (math convention) */
  rotation: number;
  /** Mirror horizontally (flip left-right) */
  mirrorX: boolean;
  /** Mirror vertically (flip top-bottom) */
  mirrorY: boolean;
}

/** A mathematically perfect circle defined by center and radius. */
export interface CircleGeometry {
  center: Point2D;
  radius: number;
}

/** A mathematically perfect ellipse defined by center, semi-axes, and rotation. */
export interface EllipseGeometry {
  center: Point2D;
  radiusX: number;         // Semi-major axis (before rotation)
  radiusY: number;         // Semi-minor axis (before rotation)
  rotation: number;        // Rotation in radians (0 = axes aligned with world axes)
}

/** A circular arc defined by center, radius, and angular span. */
export interface ArcGeometry {
  center: Point2D;
  radius: number;
  startAngle: number;      // Radians, measured from east (math convention)
  endAngle: number;        // Radians
  anticlockwise: boolean;  // true = CCW, false = CW
}

/** A cubic bezier spline with one or more segments. */
export interface SplineGeometry {
  /** Control points: for N segments, there are 3N+1 points.
   *  Segment i uses points[3i], points[3i+1], points[3i+2], points[3i+3]. */
  controlPoints: Point2D[];
  /** Whether the spline forms a closed loop. */
  isClosed: boolean;
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

  /** Per-layer view rotation in degrees (CW on screen). null = use drawing-level rotation. */
  rotationDeg?: number | null;

  /** Per-layer display preferences for attribute labels. */
  displayPreferences?: LayerDisplayPreferences;
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
  | 'BOX_SELECT'
  | 'PAN'
  | 'DRAW_POINT'
  | 'DRAW_LINE'
  | 'DRAW_POLYLINE'
  | 'DRAW_POLYGON'
  | 'DRAW_RECTANGLE'
  | 'DRAW_REGULAR_POLYGON'
  | 'DRAW_CIRCLE'
  | 'DRAW_CIRCLE_EDGE'
  | 'DRAW_ELLIPSE'
  | 'DRAW_ELLIPSE_EDGE'
  | 'MOVE'
  | 'COPY'
  | 'ROTATE'
  | 'MIRROR'
  | 'SCALE'
  | 'ERASE'
  | 'DRAW_ARC'
  | 'DRAW_SPLINE_FIT'
  | 'DRAW_SPLINE_CONTROL'
  | 'DRAW_CURVED_LINE'
  | 'CURB_RETURN'
  | 'OFFSET'
  | 'INVERSE'
  | 'FORWARD_POINT'
  | 'DRAW_TEXT'
  | 'DRAW_IMAGE';

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

  // Per-session drawing style overrides (apply when creating line/polyline features)
  drawStyle: {
    color: string | null;       // null = use active layer color
    lineWeight: number | null;  // null = use active layer weight
    opacity: number | null;     // null = use active layer opacity
    lineType: string;           // 'SOLID' | 'DASHED' | 'DOTTED' | 'DOT_DASH' | 'LONG_DASH'
  };

  // Offset tool state
  offsetSourceId: string | null;   // Feature being offset (null = awaiting selection)
  offsetDistance: number;          // Distance; 0 = dynamic (follow cursor)
  offsetSide: 'LEFT' | 'RIGHT' | 'BOTH'; // Which side(s) to create offset on
  offsetCornerHandling: 'MITER' | 'ROUND' | 'CHAMFER'; // Corner join style
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

// ─── TEXT LABEL STYLE ───

/** Font/style configuration for text labels displayed on the canvas. */
export interface TextLabelStyle {
  fontFamily: string;        // e.g. 'Arial', 'Courier New', 'serif'
  fontSize: number;          // Points (default 10)
  fontWeight: 'normal' | 'bold';
  fontStyle: 'normal' | 'italic';
  color: string | null;      // null = inherit layer color
  backgroundColor: string | null; // null = transparent
  borderColor: string | null;
  padding: number;           // px around text (default 2)
}

/** A moveable text annotation tied to a specific feature element. */
export interface TextLabel {
  id: string;
  featureId: string;          // The feature this label describes
  kind: TextLabelKind;        // What attribute the label shows
  text: string;               // Current rendered text content
  /** Position offset from the anchor point in world units. */
  offset: Point2D;
  /** Rotation in radians. null = auto-orient along line. */
  rotation: number | null;
  style: TextLabelStyle;
  visible: boolean;           // false = hidden by user
  /** Scale multiplier for resizing (default 1). */
  scale: number;
  /** Whether the user has manually repositioned this label. */
  userPositioned: boolean;
}

export type TextLabelKind =
  | 'BEARING'
  | 'DISTANCE'
  | 'AREA'
  | 'POINT_NAME'
  | 'POINT_DESCRIPTION'
  | 'POINT_ELEVATION'
  | 'POINT_COORDINATES'
  | 'LINE_LENGTH'
  | 'PERIMETER'
  | 'CUSTOM';

// ─── LAYER DISPLAY PREFERENCES ───

/**
 * Per-layer display preferences controlling which attribute labels are shown
 * and how they are styled for all features on that layer.
 */
export interface LayerDisplayPreferences {
  // ── What to show on lines ──
  showBearings: boolean;
  showDistances: boolean;
  showLineLabels: boolean;

  // ── What to show on points ──
  showPointNames: boolean;
  showPointDescriptions: boolean;
  showPointElevations: boolean;
  showPointCoordinates: boolean;

  // ── What to show on closed shapes / polygons ──
  showArea: boolean;
  showPerimeter: boolean;

  // ── Text style defaults for this layer's labels ──
  bearingTextStyle: TextLabelStyle;
  distanceTextStyle: TextLabelStyle;
  areaTextStyle: TextLabelStyle;
  pointNameTextStyle: TextLabelStyle;
  pointDescriptionTextStyle: TextLabelStyle;
  pointElevationTextStyle: TextLabelStyle;
  pointCoordinateTextStyle: TextLabelStyle;

  // ── Point label positioning ──
  /** Offset of point labels from point center in world units. */
  pointLabelOffset: Point2D;
  /** Whether point labels should auto-rotate (default false = upright). */
  pointLabelAutoRotate: boolean;

  // ── Line label positioning ──
  /** Gap between bearing text and line in world units. */
  bearingTextGap: number;
  /** Gap between distance text and line in world units. */
  distanceTextGap: number;

  // ── Per-layer format overrides (null = inherit from drawing-level preferences) ──
  /** Override the bearing format for this layer (null = use drawing default). */
  bearingFormatOverride: BearingFormat | null;
  /** Override the angle format for this layer. */
  angleFormatOverride: AngleFormat | null;
  /** Override the linear unit for this layer. */
  linearUnitOverride: LinearUnit | null;
  /** Override the linear format for this layer. */
  linearFormatOverride: LinearFormat | null;
  /** Override the decimal places for this layer. */
  linearDecimalPlacesOverride: number | null;
  /** Override the area unit for this layer. */
  areaUnitOverride: AreaUnit | null;
  /** Override the coordinate mode for this layer. */
  coordModeOverride: CoordMode | null;
}

// ─── PHASE 4: GEOMETRY TYPES ───

export interface ArcDefinition {
  center: Point2D;
  radius: number;
  startAngle: number;       // Radians, measured from east (math convention)
  endAngle: number;         // Radians
  direction: 'CW' | 'CCW';

  // Key points (derived)
  pc: Point2D;    // Point of Curvature (start)
  pt: Point2D;    // Point of Tangency (end)
  mpc: Point2D;   // Mid-Point of Curve
  pi: Point2D;    // Point of Intersection (tangent intersection)
}

export interface CurveParameters {
  R: number;         // Radius
  delta: number;     // Central angle (radians)
  L: number;         // Arc length
  C: number;         // Chord distance
  CB: number;        // Chord bearing (azimuth radians)
  T: number;         // Tangent distance
  E: number;         // External distance
  M: number;         // Mid-ordinate
  D: number;         // Degree of curve (arc definition)
  direction: 'LEFT' | 'RIGHT';

  pc: Point2D;
  pt: Point2D;
  pi: Point2D;
  rp: Point2D;    // Radius point (center)
  mpc: Point2D;

  tangentInBearing: number;   // Azimuth into the curve (radians)
  tangentOutBearing: number;  // Azimuth out of the curve
}

export interface TangentHandle {
  pointIndex: number;
  leftDirection: Point2D;
  leftMagnitude: number;
  rightDirection: Point2D;
  rightMagnitude: number;
  symmetric: boolean;
  isCorner: boolean;
}

export interface FitPointSplineDefinition {
  fitPoints: Point2D[];
  tangentHandles: TangentHandle[];
  degree: number;      // 2=quadratic, 3=cubic (default)
  isClosed: boolean;
}

export interface ControlPointSplineDefinition {
  controlPoints: Point2D[];
  weights: number[];   // NURBS weights (1.0 = uniform)
  degree: number;
  isClosed: boolean;
}

export interface SpiralDefinition {
  type: 'CLOTHOID';
  length: number;
  radiusStart: number;
  radiusEnd: number;
  A: number;   // Spiral parameter: A² = R × L
  ts: Point2D; // Tangent-to-Spiral point
  sc: Point2D; // Spiral-to-Curve point
  direction: 'LEFT' | 'RIGHT';
}

export interface TraverseLeg {
  fromPointId: string;
  toPointId: string;
  bearing: number;      // Azimuth degrees
  distance: number;     // Feet
  deltaNorth: number;   // Latitude (N+, S-)
  deltaEast: number;    // Departure (E+, W-)
  isArc: boolean;
  curveData: CurveParameters | null;
}

export interface ClosureResult {
  linearError: number;
  errorNorth: number;
  errorEast: number;
  errorBearing: number;
  angularError: number;
  precisionRatio: string;
  precisionDenominator: number;
  totalDistance: number;
}

export type AdjustmentMethod = 'COMPASS' | 'TRANSIT' | 'CRANDALL' | 'NONE';

export interface AreaResult {
  squareFeet: number;
  acres: number;
  method: 'COORDINATE';
}

export interface Traverse {
  id: string;
  name: string;
  pointIds: string[];
  isClosed: boolean;
  legs: TraverseLeg[];
  closure: ClosureResult | null;
  adjustedPoints: Point2D[] | null;
  adjustmentMethod: AdjustmentMethod | null;
  area: AreaResult | null;
}

export interface OffsetConfig {
  distance: number;
  side: 'LEFT' | 'RIGHT';
  cornerHandling: 'MITER' | 'ROUND' | 'CHAMFER';
  miterLimit: number;
  maintainLink: boolean;
  targetLayerId: string | null;
}

export interface MixedSegment {
  type: 'STRAIGHT' | 'ARC' | 'SPLINE';
  arcDef?: ArcDefinition;
  splinePoints?: Point2D[];
}

export interface MixedGeometryDefinition {
  vertices: Point2D[];
  segments: MixedSegment[];
}
