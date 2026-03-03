// worker/src/types/index.ts — All TypeScript interfaces for the Starr Research Pipeline

// ── Pipeline Input/Output ──────────────────────────

export interface PipelineInput {
  projectId: string;
  address: string;
  county: string;
  state: string;
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
  log: LayerAttempt[];
  duration_ms: number;
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
    unit: 'feet' | 'varas' | 'chains' | 'meters';
  } | null;
  curve: {
    radius: { raw: string; value: number };
    arcLength: { raw: string; value: number } | null;
    chordBearing: { raw: string; decimalDegrees: number } | null;
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
}

// ── Address Normalization ──────────────────────────

export interface AddressVariant {
  streetNumber: string;
  streetName: string;
  format: string;
  query?: string;
}

export interface ParsedAddress {
  streetNumber: string;
  streetName: string;
  streetType: string;
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
}
