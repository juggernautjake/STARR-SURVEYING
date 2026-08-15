// lib/cad/styles/types.ts — Phase 3 style type definitions

// ─── SYMBOL TYPES ───────────────────────────────────────────────────────────

export interface SymbolPath {
  type: 'PATH' | 'CIRCLE' | 'RECT' | 'TEXT';
  // For PATH:
  d?: string;
  // For CIRCLE:
  cx?: number; cy?: number; r?: number;
  // For RECT:
  x?: number; y?: number; width?: number; height?: number;
  // For TEXT:
  text?: string; tx?: number; ty?: number;
  fontSize?: number;
  // Styling per path element
  fill: string | 'INHERIT' | 'NONE';
  stroke: string | 'INHERIT' | 'NONE';
  strokeWidth: number;
}

export interface SymbolDefinition {
  id: string;
  name: string;
  category: 'MONUMENT_FOUND' | 'MONUMENT_SET' | 'MONUMENT_CALC' | 'CONTROL' | 'UTILITY'
           | 'VEGETATION' | 'STRUCTURE' | 'FENCE_INLINE' | 'CURVE' | 'GENERIC' | 'CUSTOM';
  paths: SymbolPath[];
  insertionPoint: { x: number; y: number };
  defaultSize: number;   // mm at 1:1 paper scale
  minSize: number;
  maxSize: number;
  colorMode: 'FIXED' | 'LAYER' | 'CODE';
  fixedColor: string | null;
  defaultRotation: number;
  rotatable: boolean;
  isBuiltIn: boolean;
  isEditable: boolean;
  assignedCodes: string[];
}

// ─── LINE TYPE TYPES ─────────────────────────────────────────────────────────

export interface InlineSymbolConfig {
  symbolId: string;
  interval: number;
  /** FIXED: every `interval` feet. SCALE_DEPENDENT: spacing derived
   *  from the plot scale. AT_VERTICES: one symbol on every line
   *  vertex (e.g. fence shots, telephone poles at each shot). */
  intervalMode: 'FIXED' | 'SCALE_DEPENDENT' | 'AT_VERTICES';
  scaleReferenceInterval: number;
  scaleReferenceScale: number;
  symbolSize: number;
  symbolRotation: 'ALONG_LINE' | 'FIXED' | 'PERPENDICULAR';
  offset: number;
  side: 'LEFT' | 'RIGHT' | 'CENTER' | 'BOTH';
}

export interface LineTypeDefinition {
  id: string;
  name: string;
  category: 'BASIC' | 'FENCE' | 'UTILITY' | 'SPECIALTY' | 'PATTERN' | 'CUSTOM';
  dashPattern: number[];
  /** Optional plotted line weight in mm; null/undefined inherits the
   *  layer/feature weight. Lets a line type carry its own thickness. */
  lineWeight?: number | null;
  /** Optional fixed stroke color (hex). null/undefined inherits. */
  color?: string | null;
  inlineSymbols: InlineSymbolConfig[];
  specialRenderer: 'NONE' | 'WAVY' | 'ZIGZAG';
  isBuiltIn: boolean;
  isEditable: boolean;
  assignedCodes: string[];
}

// ─── TEXT STYLE TYPES ────────────────────────────────────────────────────────

/**
 * C18 — a NAMED text style, the third style axis beside line types and symbols.
 *
 * Before this the entire font model was `TextLabelStyle.fontFamily: string`, set per label (and
 * per layer, per label kind, in `LayerDisplayPreferences`). Nothing was named, so "the bearing
 * font" existed only as an identical set of values repeated at every place that made a label, and
 * changing it meant finding every one of them.
 *
 * Deliberately shaped like `LineTypeDefinition` and `SymbolDefinition` — same `id`/`name`/
 * `category`/`isBuiltIn`/`isEditable`/`assignedCodes` spine — because C20 gives all three one
 * editor per axis and C22 drives all three from field codes. A fourth shape here would be a fourth
 * thing for those slices to special-case.
 *
 * **What is deliberately NOT here: colour.** A text style in AutoCAD carries the typography and
 * nothing else; colour comes from the entity or the layer. Putting colour in the style would give
 * every label two places that set its colour and no rule for which wins.
 */
export interface TextStyleDefinition {
  id: string;
  name: string;
  category: 'ANNOTATION' | 'TITLE' | 'SURVEY' | 'TABLE' | 'CUSTOM';
  fontFamily: string;
  /** Height in POINTS ON PAPER, matching `TextLabelStyle.fontSize` — the render path divides by 72
   *  and multiplies by the drawing scale, so a style is the same physical size on any plot. */
  fontSize: number;
  fontWeight: 'normal' | 'bold';
  fontStyle: 'normal' | 'italic';
  /** Horizontal stretch; 1 = the font's natural width. AutoCAD's width factor. Condensing to ~0.8
   *  is how a long call fits inside a narrow lot line without dropping the point size. */
  widthFactor: number;
  /** Slant in DEGREES, positive leaning right. AutoCAD's oblique angle, and **not** the same thing
   *  as `fontStyle: 'italic'`: italic swaps in a separately drawn typeface, oblique shears the
   *  upright one. Surveying convention leans hydrography with oblique, so both axes are needed. */
  obliqueAngle: number;
  isBuiltIn: boolean;
  isEditable: boolean;
  assignedCodes: string[];
}

// ─── LAYER GROUP ─────────────────────────────────────────────────────────────

export interface LayerGroup {
  id: string;
  name: string;
  collapsed: boolean;
  sortOrder: number;
}

// ─── STYLE CASCADE ───────────────────────────────────────────────────────────

export interface ResolvedStyle {
  color: string;
  opacity: number;
  lineTypeId: string;
  lineWeight: number;
  symbolId: string;
  symbolSize: number;
  symbolRotation: number;
  labelVisible: boolean;
  labelFormat: string;
}

// ─── CODE STYLE MAPPING ──────────────────────────────────────────────────────

export interface CodeStyleMapping {
  codeAlpha: string;
  codeNumeric: string;
  description: string;
  category: string;
  symbolId: string;
  symbolSize: number;
  symbolColor: string;
  lineTypeId: string;
  lineWeight: number;
  lineColor: string;
  labelFormat: string;
  labelVisible: boolean;
  layerId: string;
  isUserModified: boolean;
}

// ─── GLOBAL STYLE CONFIG ─────────────────────────────────────────────────────

export interface GlobalStyleConfig {
  codeDisplayMode: 'ALPHA' | 'NUMERIC';
  backgroundColor: string;
  defaultFont: string;
  defaultFontSize: number;
  bearingFormat: 'QUADRANT' | 'AZIMUTH';
  bearingPrecision: 'SECOND' | 'TENTH_SECOND';
  distancePrecision: number;
  areaDisplay: 'SQFT_AND_ACRES' | 'SQFT_ONLY' | 'ACRES_ONLY';
  symbolSizeMode: 'SCREEN' | 'WORLD';
  selectionColor: string;
  selectionLineWidth: number;
  showPointLabels: boolean;
  showLineLabels: boolean;
  defaultPaperSize: 'LETTER' | 'TABLOID' | 'ARCH_C' | 'ARCH_D' | 'ARCH_E';
  defaultOrientation: 'PORTRAIT' | 'LANDSCAPE';
  defaultScale: number;
}

export const DEFAULT_GLOBAL_STYLE_CONFIG: GlobalStyleConfig = {
  codeDisplayMode: 'ALPHA',
  backgroundColor: '#FFFFFF',
  defaultFont: 'Arial',
  defaultFontSize: 8,
  bearingFormat: 'QUADRANT',
  bearingPrecision: 'SECOND',
  distancePrecision: 2,
  areaDisplay: 'SQFT_AND_ACRES',
  symbolSizeMode: 'SCREEN',
  selectionColor: '#0088FF',
  selectionLineWidth: 1.5,
  showPointLabels: true,
  showLineLabels: true,
  defaultPaperSize: 'TABLOID',
  defaultOrientation: 'LANDSCAPE',
  defaultScale: 50,
};
