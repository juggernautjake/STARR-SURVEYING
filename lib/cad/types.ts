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
  color: string; // Hex color (e.g., "#000000")
  lineWeight: number; // Pixels on screen (default: 1)
  opacity: number; // 0-1 (default: 1)
}

// --- LAYERS ---

export interface Layer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  color: string; // Default color for features on this layer
  lineWeight: number; // Default line weight (pixels)
  opacity: number;
  isDefault: boolean; // Cannot be deleted
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
