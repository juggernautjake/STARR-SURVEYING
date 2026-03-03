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
  intervalMode: 'FIXED' | 'SCALE_DEPENDENT';
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
  category: 'BASIC' | 'FENCE' | 'UTILITY' | 'SPECIALTY' | 'CUSTOM';
  dashPattern: number[];
  inlineSymbols: InlineSymbolConfig[];
  specialRenderer: 'NONE' | 'WAVY' | 'ZIGZAG';
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
