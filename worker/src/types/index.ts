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
  log: LayerAttempt[];
  duration_ms: number;
  /** Phase 3.5: Geometric reconciliation — visual geometry vs OCR text */
  reconciliation?: import('../services/geo-reconcile.js').ReconciliationResult;
  /**
   * Stage 5: 7-call property validation report — text synthesis, cross-validation,
   * and final discrepancy/confidence report from property-validation-pipeline.ts.
   * Only present when the pipeline reaches Stage 5 (requires Anthropic API key).
   */
  validationReport?: import('../services/property-validation-pipeline.js').ValidationReport;
  /**
   * Stage 6: MASTER_VALIDATION_REPORT.txt text content.
   * Formatted surveyor report including traverse quality, top actions,
   * adjacent research order, discrepancy log, and all perimeter data.
   * Only present when Stage 5 succeeds and the report generator runs.
   */
  masterReportText?: string;
  /** Search diagnostics: which variants were tried, which hit */
  searchDiagnostics?: SearchDiagnostics;
  /**
   * Human-readable reason the pipeline failed (shown to the user in the frontend).
   * Includes actionable guidance, e.g., "The county appraisal website is experiencing
   * a temporary data access issue.  Please visit {url} to verify."
   */
  failureReason?: string;
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
  /**
   * Set when the CAD website itself is experiencing issues (e.g., database outages,
   * "Temporary Data Access Issue" messages).  When present, "no results" should be
   * interpreted as "unknown" rather than "property not found".
   */
  cadSiteError?: string;
  /**
   * True when the CAD site was completely unreachable (DNS failure, connection refused,
   * network timeout) rather than returning an error page.  Research continues with
   * alternative sources (county clerk, plat repository, etc.) even when this is set.
   */
  siteUnreachable?: boolean;
  /**
   * Base64-encoded PNG screenshot captured when the site was unreachable or returned
   * an error page.  Used for diagnostics and AI analysis of the failure.
   */
  failureScreenshotBase64?: string;
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
  /**
   * Instrument numbers extracted from the deed history on the CAD detail page.
   * When present these are used directly for clerk search, bypassing owner-name SPA search.
   */
  instrumentNumbers?: string[];
  /** CAD owner ID (from detail page / search results) */
  ownerId?: string;
  /** Map ID / map sheet reference (from detail page) */
  mapId?: string;
  /** Mailing address of the owner (from detail page) */
  mailingAddress?: string;
  /** Full deed history entries extracted from CAD detail page */
  deedHistory?: DeedHistoryEntry[];
}

export interface DeedHistoryEntry {
  deedDate?: string;
  type?: string;
  description?: string;
  grantor?: string;
  grantee?: string;
  volume?: string;
  page?: string;
  instrumentNumber?: string;
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
  /** Downloaded page images from Kofile image interception */
  pages?: DocumentPage[];
  ocrText: string | null;
  extractedData: ExtractedBoundaryData | null;
  /** Public URL of the PDF bundled from page images, stored in Supabase Storage */
  pagesPdfUrl?: string | null;
  /** Legacy single-image fields — populated by old pipeline path */
  imageBase64?: string | null;
  imageFormat?: 'png' | 'jpg' | 'tiff' | 'pdf' | null;
  /** Whether this came from user upload vs online retrieval */
  fromUserUpload?: boolean;
  /** Processing errors that occurred */
  processingErrors?: string[];
  /** High-resolution screenshots of each page of the document (legacy capture) */
  pageScreenshots?: PageScreenshot[];
}

/** A downloaded document page image (Kofile image interception) */
export interface DocumentPage {
  pageNumber: number;
  /** base64-encoded image data */
  imageBase64: string;
  imageFormat: 'png' | 'jpg' | 'tiff';
  width: number;
  height: number;
  signedUrl: string | null;
}

/** A single page screenshot captured from a document viewer (legacy browser capture) */
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

/** BoundaryDescription is an alias for ExtractedBoundaryData */
export type BoundaryDescription = ExtractedBoundaryData;

export interface BoundaryCall {
  sequence: number;
  /**
   * Optional string ID assigned by Phase 7 ReadingAggregator for cross-source matching.
   * When present, used instead of `sequence` for call identification.
   * Format: "PERIM_N1", "LOT1_S2", etc.
   */
  callId?: string;
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
    chordBearing: { raw: string; decimalDegrees: number; quadrant?: string } | null;
    chordDistance: { raw: string; value: number } | null;
    direction: 'left' | 'right';
    delta: { raw: string; decimalDegrees: number } | null;
  } | null;
  toPoint: string | null;
  along: string | null;
  confidence: number;
}

export interface DocumentReference {
  /** Merged type union: supports both old ('deed','plat','easement','survey','other')
   *  and new ('volume_page','instrument','abstract_survey') classification schemes. */
  type: 'deed' | 'plat' | 'easement' | 'survey' | 'other' | 'volume_page' | 'instrument' | 'abstract_survey';
  volume: string | null;
  page: string | null;
  instrumentNumber: string | null;
  /** Legacy combined cabinet+slide field */
  cabinetSlide?: string | null;
  /** Cabinet identifier (plat cabinet) */
  cabinet?: string | null;
  /** Slide/sheet identifier */
  slide?: string | null;
  county: string | null;
  /** Legacy description field */
  description?: string | null;
  /** Abstract number (for abstract/survey references) */
  abstract?: string | null;
  /** Survey name (for abstract/survey references) */
  survey?: string | null;
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
  /** Format identifier for this variant (e.g. 'canonical', 'variation:FM RD') */
  format?: string;
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
  /** 5-digit FIPS code for the detected county (e.g. "48027" = Bell County) */
  countyFIPS: string | null;
}

// ── Logging ────────────────────────────────────────

export interface LayerAttempt {
  layer: string;
  source: string;
  method: string;
  input: string;
  status: 'success' | 'partial' | 'fail' | 'warn' | 'skip';
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
  /** AbortController to cancel the running pipeline */
  abortController?: AbortController;
}

// ── Document Purchase Record ────────────────────────
// Spec §18 Cost Tracking — every document purchase is logged with full audit trail

export type PurchaseSource = 'texasfile' | 'county_clerk' | 'txdot';
export type PurchasePaymentMethod = 'texasfile_wallet' | 'county_credit_card' | 'stripe';

export interface PurchaseRecord {
  projectId:        string;
  userId:           string;
  documentName:     string;
  instrumentNumber: string;
  source:           PurchaseSource;
  pageCount:        number;
  costPerPage:      number;
  totalCost:        number;
  paymentMethod:    PurchasePaymentMethod;
  purchaseDate:     Date;
  /** Confidence impact of adding this document: before and after scores */
  confidenceImpact: { before: number; after: number };
  /** Path in Supabase Storage where the purchased document was stored */
  downloadPath:     string;
}

// ── Storage Path Conventions ────────────────────────
// Spec §18 Document Storage — hierarchical path structure in the
// 'research-documents' Supabase Storage bucket.
//
//   research-documents/{projectId}/target/      ← target property docs
//   research-documents/{projectId}/adjacent/    ← per-neighbor docs
//   research-documents/{projectId}/txdot/       ← TxDOT ROW data
//   research-documents/{projectId}/reports/     ← generated reports

export const STORAGE_PATHS = {
  /** Target property: plat and deed documents */
  targetPlat:  (projectId: string, suffix = 'watermarked.png') =>
    `${projectId}/target/plat_${suffix}`,
  targetDeed:  (projectId: string, suffix = 'watermarked.png') =>
    `${projectId}/target/deed_${suffix}`,

  /** Adjacent property documents (one folder per owner name slug) */
  adjacentDeed: (projectId: string, ownerSlug: string, suffix = 'watermarked.png') =>
    `${projectId}/adjacent/${ownerSlug}/deed_${suffix}`,
  adjacentPlat: (projectId: string, ownerSlug: string, suffix = 'plat.pdf') =>
    `${projectId}/adjacent/${ownerSlug}/${suffix}`,

  /** TxDOT ROW data */
  txdotScreenshot: (projectId: string) =>
    `${projectId}/txdot/rpam_screenshot.png`,
  txdotRowMap:     (projectId: string) =>
    `${projectId}/txdot/row_map.pdf`,
  txdotGeoJSON:    (projectId: string) =>
    `${projectId}/txdot/row_parcels.geojson`,

  /** Generated reports */
  masterReport:      (projectId: string) =>
    `${projectId}/reports/MASTER_VALIDATION_REPORT.txt`,
  confidenceReport:  (projectId: string) =>
    `${projectId}/reports/confidence_report.json`,
  purchaseHistory:   (projectId: string) =>
    `${projectId}/reports/purchase_history.json`,
} as const;

/** Slugify an owner name for use in storage paths */
export function ownerNameToSlug(ownerName: string): string {
  return ownerName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .substring(0, 64);
}
