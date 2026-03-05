// worker/src/types/index.ts — All TypeScript interfaces for the Starr Research Pipeline

// ── Pipeline Input/Output ──────────────────────────

export interface PipelineInput {
  projectId: string;
  address: string;
  county: string;
  state: string;
  /** If the user already knows the CAD property ID, skip address search */
  propertyId?: string;
  /** If the user knows the owner name, use it for direct search */
  ownerName?: string;
  /** User-uploaded files to process alongside online-retrieved documents */
  userFiles?: UserFile[];
}

export interface PipelineResult {
  projectId: string;
  status: 'complete' | 'partial' | 'failed';
  propertyId: string | null;
  geoId: string | null;
  ownerName: string | null;
  legalDescription: string | null;
  acreage: number | null;
  documents: DocumentResult[];
  boundary: BoundaryDescription | null;
  validation: ValidationResult | null;
  /** Phase 3.5: Geometric reconciliation — visual geometry vs OCR text */
  reconciliation?: import('./services/geo-reconcile.js').ReconciliationResult;
  log: LayerAttempt[];
  duration_ms: number;
  /** Search diagnostics: which variants were tried, which hit */
  searchDiagnostics?: SearchDiagnostics;
}

// ── User File Upload ─────────────────────────────────

export interface UserFile {
  filename: string;
  mimeType: string;
  /** base64-encoded file data */
  data: string;
  /** Size in bytes */
  size: number;
  /** User-provided description or notes about this file */
  description?: string;
}

// ── Search Diagnostics ───────────────────────────────

export interface SearchDiagnostics {
  /** All address variants that were generated */
  variantsGenerated: AddressVariant[];
  /** Which variants were actually tried against the CAD */
  variantsTried: Array<{ variant: AddressVariant; resultCount: number; hitPropertyId: string | null }>;
  /** Partial search attempts */
  partialSearches: Array<{ query: string; resultCount: number }>;
  /** Total time spent searching */
  searchDuration_ms: number;
}

// ── Stage 1: Property Identification ───────────────

export interface PropertyIdResult {
  propertyId: string;
  geoId: string | null;
  ownerName: string | null;
  legalDescription: string | null;
  acreage: number | null;
  propertyType: string | null;
  situsAddress: string | null;
  source: string;
  layer: string;
  /** Confidence score 0-1 for how well the result matches the input */
  matchConfidence: number;
  /** Validation notes (mismatches, concerns) */
  validationNotes: string[];
}

// ── Property Result Validation ───────────────────────

export interface PropertyValidation {
  /** Does the returned street number match the input? */
  streetNumberMatch: boolean;
  /** Does the returned street name match (fuzzy)? */
  streetNameMatch: boolean;
  /** Does the returned city match? */
  cityMatch: boolean | null;
  /** Is the acreage within a reasonable range? */
  acreageReasonable: boolean | null;
  /** Is the owner name non-empty and parseable? */
  ownerNameValid: boolean;
  /** Are there multiple results — could be ambiguous? */
  multipleResults: boolean;
  /** Computed match confidence 0-1 */
  confidence: number;
  /** Issues found */
  issues: string[];
}

// ── Stage 2: Documents ─────────────────────────────

export interface DocumentRef {
  instrumentNumber: string | null;
  volume: string | null;
  page: string | null;
  documentType: string;
  recordingDate: string | null;
  grantors: string[];
  grantees: string[];
  source: string;
  url: string | null;
}

export interface DocumentResult {
  ref: DocumentRef;
  textContent: string | null;
  imageBase64: string | null;
  imageFormat: 'png' | 'jpg' | 'tiff' | 'pdf' | null;
  ocrText: string | null;
  extractedData: ExtractedBoundaryData | null;
  /** Whether this came from user upload vs online retrieval */
  fromUserUpload?: boolean;
  /** Processing errors that occurred */
  processingErrors?: string[];
  /** High-resolution screenshots of each page of the document */
  pageScreenshots?: PageScreenshot[];
}

/** A single page screenshot captured from a document viewer */
export interface PageScreenshot {
  pageNumber: number;
  /** base64-encoded PNG image at highest available resolution */
  imageBase64: string;
  width: number;
  height: number;
}

// ── Stage 3: AI Extraction ─────────────────────────

export interface ExtractedBoundaryData {
  type: 'metes_and_bounds' | 'lot_and_block' | 'hybrid' | 'reference_only';
  datum: 'NAD83' | 'NAD27' | 'unknown';
  pointOfBeginning: {
    description: string;
    referenceMonument: string | null;
  };
  calls: BoundaryCall[];
  references: DocumentReference[];
  area: { raw: string; value: number | null; unit: string } | null;
  lotBlock: {
    lot: string;
    block: string;
    subdivision: string;
    phase: string | null;
    cabinet: string | null;
    slide: string | null;
  } | null;
  confidence: number;
  warnings: string[];
  /** Number of verification passes completed */
  verificationPasses?: number;
  /** Was this result confirmed by multiple extraction passes? */
  verified?: boolean;
}

export type BoundaryDescription = ExtractedBoundaryData;

export interface BoundaryCall {
  sequence: number;
  bearing: {
    raw: string;
    decimalDegrees: number;
    quadrant: string; // "NE", "NW", "SE", "SW"
  } | null;
  distance: {
    raw: string;
    value: number;
    unit: 'feet' | 'varas' | 'chains' | 'meters' | 'rods' | 'links';
  } | null;
  curve: {
    radius: { raw: string; value: number };
    arcLength: { raw: string; value: number } | null;
    chordBearing: { raw: string; decimalDegrees: number; quadrant: string } | null;
    chordDistance: { raw: string; value: number } | null;
    direction: 'left' | 'right';
    delta: { raw: string; decimalDegrees: number } | null;
  } | null;
  toPoint: string | null;
  along: string | null;
  confidence: number;
}

export interface DocumentReference {
  type: 'deed' | 'plat' | 'easement' | 'survey' | 'other';
  volume: string | null;
  page: string | null;
  instrumentNumber: string | null;
  cabinetSlide: string | null;
  county: string | null;
  description: string | null;
}

// ── 5-Symbol Confidence Rating ────────────────────
//
// Directly maps to the spec's five-symbol validation notation:
//   ✓ CONFIRMED  — Multiple independent sources agree, math closes
//   ~ DEDUCED    — Logically inferred from surrounding context (single source)
//   ? UNCONFIRMED — Single source, no cross-reference possible
//   ✗ DISCREPANCY — Sources disagree or math doesn't close
//   ✗✗ CRITICAL  — Major error: missing, contradictory, or geometrically impossible

export type ConfidenceSymbol = 'CONFIRMED' | 'DEDUCED' | 'UNCONFIRMED' | 'DISCREPANCY' | 'CRITICAL';

export interface ConfidenceRating {
  symbol: ConfidenceSymbol;
  /** Unicode display character(s) for the symbol */
  display: '✓' | '~' | '?' | '✗' | '✗✗';
  label: string;
  /** Numeric score 0-100 equivalent */
  score: number;
}

// ── Stage 4: Validation ────────────────────────────

export interface ValidationResult {
  closureError_ft: number | null;
  precisionRatio: string | null;
  computedArea_sqft: number | null;
  computedArea_acres: number | null;
  cadAcreage: number | null;
  areaDiscrepancy_pct: number | null;
  bearingSanity: boolean;
  distanceSanity: boolean;
  referenceComplete: boolean;
  overallQuality: 'excellent' | 'good' | 'fair' | 'poor' | 'failed';
  flags: string[];
  /** Traverse points computed from boundary calls (for drawing) */
  traversePoints?: Array<{ x: number; y: number }>;
  /** Total perimeter in feet */
  totalPerimeter_ft?: number;
  /** 5-symbol confidence rating derived from all validation checks */
  confidenceRating?: ConfidenceRating;
}

// ── Address Normalization ──────────────────────────

export interface AddressVariant {
  streetNumber: string;
  streetName: string;
  format: string;
  query?: string;
  /** Priority order — lower numbers are tried first */
  priority: number;
  /** Is this a partial/fuzzy search? */
  isPartial: boolean;
}

export interface ParsedAddress {
  streetNumber: string;
  streetName: string;
  streetType: string;
  preDirection: string | null;
  postDirection: string | null;
  unit: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
}

export interface NormalizedAddress {
  raw: string;
  canonical: string | null;
  parsed: ParsedAddress;
  geocoded: boolean;
  source: 'nominatim' | 'census' | 'manual';
  variants: AddressVariant[];
  lat: number | null;
  lon: number | null;
  /** Detected county from geocoding (may differ from user input) */
  detectedCounty: string | null;
}

// ── Logging ────────────────────────────────────────

export interface LayerAttempt {
  layer: string;
  source: string;
  method: string;
  input: string;
  status: 'success' | 'partial' | 'fail' | 'skip';
  duration_ms: number;
  dataPointsFound: number;
  error?: string;
  nextLayer?: string;
  timestamp: string;
  details?: string;
  /** Step-by-step action log for detailed diagnostics */
  steps?: string[];
}

// ── County Registry ────────────────────────────────

export interface CountyConfig {
  name: string;
  cadVendor: 'bis' | 'tyler' | 'custom';
  cadBaseUrl: string;
  clerkVendor: 'kofile' | 'tyler' | 'cott' | 'custom';
  clerkBaseUrl: string;
}

// ── Running Pipeline State ─────────────────────────

export interface ActivePipeline {
  projectId: string;
  address: string;
  county: string;
  state: string;
  startedAt: string;
  currentStage: string;
  /** When the last status update was sent */
  lastUpdate?: string;
}
