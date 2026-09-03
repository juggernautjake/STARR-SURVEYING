// worker/src/types/index.ts — All TypeScript interfaces for the Starr Research Pipeline

// ── Pipeline Input/Output ──────────────────────────

export interface PipelineInput {
  projectId: string;
  address: string;
  /** The address in separate fields, as the operator entered it (seed 624). See
   *  `research/address-parts.ts` for why the flattened `address` above is not enough. */
  addressParts?: import('../research/address-parts.js').AddressParts;
  county: string;
  state: string;
  /** If the user already knows the CAD property ID, skip address search */
  propertyId?: string;
  /** If the user knows the owner name, use it for direct search */
  ownerName?: string;
  /**
   * A deed/instrument number the operator already has (seed 625).
   *
   * `CountyResearchInput` has carried this since the worker was written and the Bell orchestrator
   * SEEDS its known-identifiers cascade from it — but nothing ever supplied one, so the cascade
   * began from nothing in every run. Declared here as well so the generic pipeline can be given
   * the same starting point rather than the value existing on one path only.
   */
  instrumentNumber?: string;
  /**
   * Free text the operator wrote about this property — intake notes, per-run notes, and any
   * note the attachment step left behind, joined by the app into one string.
   *
   * Read by Stage 5, which is the run's one AI pass over everything it found. A note like "the
   * fence is not the line" changes how a synthesis reads a boundary; it was typed into the create
   * form, stored, shown back to the operator, and never reached any code that could use it.
   */
  operatorNotes?: string;
  /**
   * Stop this run.
   *
   * Aborted between stages, never inside one — the reasoning is the same as the Bell
   * orchestrator's: stopping between leaves a coherent partial result, stopping mid-stage leaves
   * half a chain of title. `signal.reason` carries WHICH kind of stop this was (see
   * `research/abort-reason.ts`), which is why the run that hit its budget ceiling on 2026-09-03
   * reported itself as the operator pressing cancel.
   *
   * Optional because a direct caller (a test, a one-off script) has nothing to cancel with.
   * Absent means the run cannot be stopped early, which is the behaviour every non-Bell county
   * had until this field existed.
   */
  signal?: AbortSignal;
  /** User-uploaded files to process alongside online-retrieved documents */
  userFiles?: UserFile[];
  /**
   * Called the moment a document is found, before the run finishes — B2.
   *
   * The owner's requirement was explicit: "I don't want the research worker to compile the
   * files/documents all slowly over time and then upload them in a big group." The Bell orchestrator
   * had honoured that since it was written, at seven incremental call sites. The GENERIC pipeline
   * never did: it accumulated everything in `documents[]`, and the caller waited for the run to end,
   * DELETED the project's previous `property_search` rows, and bulk-inserted.
   *
   * So the guarantee held for one county and silently did not hold for the other forty.
   *
   * Fire-and-forget by contract. A filing failure must never abort research that is already
   * succeeding — the tally records it and the run log says so (see B1).
   */
  onDocument?: (doc: DocumentResult) => void;
}

export interface PipelineResult {
  projectId: string;
  /**
   * How many documents the run actually filed, when `documents` below could not be enumerated.
   *
   * The abort/crash path builds a result with `documents: []` because it has no objects to put
   * there — and the status endpoint reports `result.documents.length`, so an aborted run said
   * "Documents: none retrieved" on the same screen as a panel reading 19. The documents were real
   * and already in the database; only this object had never counted them.
   */
  filedDocumentCount?: number;
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
   * Stage 4: the boundary read as a SURVEY rather than as a record — monuments as objects,
   * corner-to-corner inverses, curve self-checks, units converted, closure read as evidence about
   * our own OCR, and a drawing.
   *
   * Produced by `survey-reading.ts`, which exists because the nine Phase I modules that do all of
   * the above had no production caller at all: every import of every one came from a sibling module
   * or its own test file. Present on every run that reaches Stage 4, including ones with no
   * traversable description — in that case it carries `notTraversable` and says why.
   */
  surveyReading?: import('../services/survey-reading.js').SurveyReading;
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
  /**
   * Document-retrieval steps that FAILED during Stage 2, one message each.
   *
   * These used to be `logger.warn` only, so a run whose clerk searches all failed could still
   * report `status: 'complete'` on the strength of CAD data alone. A reviewer would see a finished
   * research run and no reason to doubt its document set (plan R39).
   *
   * A non-empty list downgrades `complete` to `partial` — the same rule the adjoiner worker uses.
   */
  retrievalFailures?: string[];
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
  /** The `research_documents` row this document was filed as, set by `fileGenericDocumentNow`.
   *  Present so a later stage can patch the row with what it learned — filing happens before
   *  anything reads the document, and until this existed the id was discarded at two layers. */
  documentRowId?: string;
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
  /** Which layer produced the coordinates. `google` is the paid last resort, reached only when
   *  the two free providers found nothing — which for rural Texas FM and ranch roads is common. */
  source: 'nominatim' | 'census' | 'google' | 'manual';
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

  /** The `research_runs` row this pipeline is writing to, and its ordinal within the project.
   *
   *  Absent only when the run record could not be written (Supabase down). Everything that files a
   *  document during the run stamps it with this, which is what makes "17 new documents" mean
   *  documents THIS run found rather than every document the project has ever held. */
  runId?: string | null;
  runNumber?: number | null;

  /**
   * Why the abort signal was raised, when it was.
   *
   * ── THE BUG THIS FIELD EXISTS TO KILL ────────────────────────────────────────────────────────
   *
   * Two call sites abort a run — the budget ceiling and a person pressing cancel — and the status
   * endpoint could see only `signal.aborted`, so it answered both with:
   *
   *     { status: 'failed', failureReason: 'Pipeline cancelled by user' }
   *
   * A run that finished early because it reached its $2.00 or 25-minute ceiling is not a failure
   * and was not cancelled by anybody. Operators were shown "Research Failed — Pipeline cancelled by
   * user" beside a budget bar reading "Finished in 2 minutes for $0.02", for the same run.
   */
  stopReason?: { kind: 'budget' | 'cancelled' | 'error'; message: string } | null;

  /** The settings this run was given, so the status endpoint can report what it was asked to do. */
  settings?: Record<string, unknown>;
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
