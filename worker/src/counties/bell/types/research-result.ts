/**
 * Bell County Research Result — the full output of the research pipeline.
 * This powers the toggle sections in the Review stage.
 */

import type { ConfidenceRating } from './confidence.js';

// ── Top-Level Result ─────────────────────────────────────────────────

export interface BellResearchResult {
  /** Unique research ID */
  researchId: string;
  /** Input that triggered this research */
  projectId: string;
  /** When research started */
  startedAt: string;
  /** When research completed */
  completedAt: string;
  /** Total duration in milliseconds */
  durationMs: number;

  // ── Resolved Property Identity ─────────────────────────────────────
  property: ResolvedProperty;

  // ── Toggle Sections ────────────────────────────────────────────────
  deedsAndRecords: DeedsAndRecordsSection;
  plats: PlatSection;
  easementsAndEncumbrances: EasementsSection;
  propertyDetails: PropertyDetailsSection;
  researchedLinks: ResearchedLink[];
  discrepancies: DiscrepancyItem[];
  adjacentProperties: AdjacentProperty[];
  siteIntelligence: SiteIntelligenceNote[];
  /** GIS screenshot quality analysis report */
  gisQualityReport?: {
    summary: string;
    checks: Array<{
      label: string;
      qualityScore: number;
      zoomAssessment: string;
      whatIsShown: string;
      recommendations: string[];
    }>;
    actionableAdjustments: string[];
  } | null;

  // ── Research Completeness Summary ──────────────────────────────────
  /** Clear summary of what was found and what was not found */
  researchCompleteness?: ResearchCompleteness | null;

  // ── Metadata ───────────────────────────────────────────────────────
  /** All screenshots captured during research */
  screenshots: ScreenshotCapture[];
  /** Errors encountered (non-fatal) */
  errors: ResearchError[];
  /** AI token usage summary */
  aiUsage: AiUsageSummary;
  /** Overall confidence in the research completeness */
  overallConfidence: ConfidenceRating;
  /** True if the pipeline detected that AI credits were depleted */
  creditDepleted?: boolean;
}

// ── Resolved Property ────────────────────────────────────────────────

export interface ResolvedProperty {
  propertyId: string;
  ownerName: string;
  legalDescription: string;
  acreage: number | null;
  situsAddress: string;
  mailingAddress?: string;
  propertyType?: string;
  /** Lot number from legal description (e.g., "5") */
  lotNumber?: string | null;
  /** Block number from legal description (e.g., "3") */
  blockNumber?: string | null;
  /** Subdivision name extracted from legal description */
  subdivisionName?: string | null;
  /** Abstract number from GIS or legal description (e.g., "12", "488") */
  abstractNumber?: string | null;
  /** Survey name from legal description (e.g., "A. Manchaca") */
  surveyName?: string | null;
  /** GIS parcel boundary as [lon, lat] coordinate rings */
  parcelBoundary?: number[][][];
  /** Geocoded centroid */
  lat: number;
  lon: number;
  /** Map/geo ID references */
  mapId?: string;
  geoId?: string;
}

// ── Section: Deeds & Records ─────────────────────────────────────────

export interface DeedsAndRecordsSection {
  /** AI-generated narrative summary of ownership history */
  summary: string;
  /** All deed records, newest first */
  records: DeedRecord[];
  /** The complete chain of title, if reconstructable */
  chainOfTitle: ChainLink[];
  confidence: ConfidenceRating;
}

export interface DeedRecord {
  instrumentNumber: string | null;
  volume: string | null;
  page: string | null;
  recordingDate: string | null;
  documentType: string;
  grantor: string | null;
  grantee: string | null;
  legalDescription: string | null;
  /** AI-extracted summary of the deed contents */
  aiSummary: string | null;
  /** Screenshot(s) of the deed pages */
  pageImages: string[];
  /** Link to source document online */
  sourceUrl: string | null;
  /** Where this record was found */
  source: string;
  confidence: ConfidenceRating;

  // ── Structured Boundary Data (for procedural drawing) ────────────
  /** Metes and bounds calls extracted from the deed, in sequence from POB */
  boundaryCalls?: BoundaryCall[];
  /** Point of Beginning description */
  pointOfBeginning?: PointOfBeginning | null;
  /** Total acreage stated in the deed */
  statedAcreage?: number | null;
  /** Whether the boundary description closes back to POB */
  closureStatus?: 'closed' | 'open' | 'unknown';
  /** Computed corner coordinates from POB + sequential calls (for drawing) */
  computedTraverse?: ComputedTraverse | null;
}

/** Computed XY coordinates for each corner of the property boundary */
export interface ComputedTraverse {
  /** Corner coordinates in local coordinate system (feet from POB) */
  corners: { x: number; y: number; sequence: number; monument: string | null }[];
  /** Closure error in feet (distance from last point back to POB) */
  closureErrorFt: number;
  /** Closure error as ratio (1:N where N = perimeter/error) */
  closureRatio: string;
  /** Total perimeter in feet */
  perimeterFt: number;
  /** Computed area in square feet */
  computedAreaSqFt: number;
  /** Computed area in acres */
  computedAreaAcres: number;
}

/** A single bearing/distance call in a metes-and-bounds description */
export interface BoundaryCall {
  /** Sequence number (1 = first call from POB) */
  sequence: number;
  /** Raw bearing text exactly as written (e.g., "N 45°30'15\" E") */
  bearingRaw: string;
  /** Decimal degrees from north, clockwise (0-360). null if not parseable. */
  bearingDegrees: number | null;
  /** Distance value */
  distance: number;
  /** Distance unit (feet, varas, meters, chains) */
  distanceUnit: 'feet' | 'varas' | 'meters' | 'chains';
  /** Monument description at this corner (e.g., "1/2\" iron rod found") */
  monument: string | null;
  /** What the call runs along (e.g., "south line of Lot 12", "center of creek") */
  along: string | null;
  /** Curve data if this call is an arc */
  curve?: CurveData | null;
  /** Whether this call returns to POB */
  returnsToPOB?: boolean;
}

/** Curve parameters for arc calls */
export interface CurveData {
  radius: number;
  arcLength: number;
  chordBearing: string | null;
  chordDistance: number | null;
  deltaAngle: string | null;
  direction: 'left' | 'right' | null;
}

/** Point of Beginning for a metes-and-bounds description */
export interface PointOfBeginning {
  /** Full POB description as written in the deed */
  description: string;
  /** Reference monument or point (e.g., "the southeast corner of said Abstract 643") */
  referencePoint: string | null;
  /** Bearing from reference point to POB */
  bearingFromReference: string | null;
  /** Distance from reference point to POB */
  distanceFromReference: string | null;
  /** RPLS number if a survey monument is referenced */
  rplsNumber: string | null;
}

/** Research completeness summary — what was found and what was not */
export interface ResearchCompleteness {
  /** Items that were successfully found */
  found: ResearchItem[];
  /** Items that were NOT found (gaps in research) */
  notFound: ResearchItem[];
  /** Items that were partially found (some data missing) */
  partial: ResearchItem[];
  /** Plain-English summary of research completeness */
  summary: string;
}

export interface ResearchItem {
  /** Category of the data item */
  category: 'deed' | 'plat' | 'chain_of_title' | 'boundary' | 'easement' | 'adjacent' | 'flood' | 'row' | 'gis' | 'aerial';
  /** What was being searched for */
  label: string;
  /** What was actually found (or why it wasn't) */
  detail: string;
  /** Instrument number or source reference */
  reference?: string | null;
}

export interface ChainLink {
  order: number;
  instrumentNumber: string | null;
  date: string | null;
  from: string;
  to: string;
  type: string;
}

// ── Section: Plats ───────────────────────────────────────────────────

export interface PlatSection {
  /** AI-generated summary of plat analysis */
  summary: string;
  /** All plat records found */
  plats: PlatRecord[];
  /** Cross-validation notes (plat vs deed comparisons) */
  crossValidation: string[];
  confidence: ConfidenceRating;
}

export interface PlatRecord {
  /** Plat name or reference */
  name: string;
  /** Recording date */
  date: string | null;
  instrumentNumber: string | null;
  /** Plat page images (base64 PNG) */
  images: string[];
  /** AI analysis of the plat drawing */
  aiAnalysis: PlatAnalysis | null;
  sourceUrl: string | null;
  source: string;
  confidence: ConfidenceRating;
}

export interface PlatAnalysis {
  /** Lot dimensions extracted from plat */
  lotDimensions: string[];
  /** Bearings and distances (raw text strings for backward compat) */
  bearingsAndDistances: string[];
  /** Monuments called on the plat */
  monuments: string[];
  /** Easements shown on the plat */
  easements: string[];
  /** Curves (arc data — raw text strings) */
  curves: string[];
  /** Right-of-way widths */
  rowWidths: string[];
  /** Adjacent lot/tract references */
  adjacentReferences: string[];
  /** Notable changes from previous plats */
  changesFromPrevious: string[];
  /** Full AI narrative */
  narrative: string;
  /** Target lot identification (which lot on this plat is the target property) */
  targetLot?: {
    /** Lot number/label identified */
    lotId: string | null;
    /** Confidence 0-100 */
    confidence: number;
    /** How it was identified (data-match, ai-visual, fallback) */
    method: string;
    /** Detailed reasoning */
    reasoning: string;
  } | null;

  // ── Structured boundary data (compatible with DeedRecord.boundaryCalls) ──
  /**
   * Structured boundary calls for the TARGET LOT on this plat.
   * Uses the same BoundaryCall format as deed records, enabling
   * cross-validation between deed and plat boundary descriptions.
   * Populated by parsing bearingsAndDistances[] into structured form.
   */
  structuredCalls?: BoundaryCall[];
  /** Point of Beginning from plat (if identified for target lot) */
  pointOfBeginning?: PointOfBeginning | null;
}

// ── Section: Easements & Encumbrances ────────────────────────────────

export interface EasementsSection {
  fema: FemaFloodInfo | null;
  txdot: TxDotRowInfo | null;
  easements: EasementRecord[];
  restrictiveCovenants: string[];
  /** AI summary of all easements and encumbrances */
  summary: string;
  confidence: ConfidenceRating;
}

export interface EasementRecord {
  type: string;
  description: string;
  instrumentNumber: string | null;
  width?: string;
  location?: string;
  /** Screenshot or document image */
  image: string | null;
  sourceUrl: string | null;
  source: string;
  confidence: ConfidenceRating;
}

export interface FemaFloodInfo {
  floodZone: string;
  zoneSubtype: string | null;
  inSFHA: boolean;
  firmPanel: string | null;
  effectiveDate: string | null;
  /** Screenshot of FEMA flood map */
  mapScreenshot: string | null;
  sourceUrl: string;
  confidence: ConfidenceRating;
}

export interface TxDotRowInfo {
  rowWidth: number | null;
  csjNumber: string | null;
  highwayName: string | null;
  highwayClass: string | null;
  district: string | null;
  acquisitionDate: string | null;
  /** Screenshot of TxDOT ROW map */
  mapScreenshot: string | null;
  sourceUrl: string;
  confidence: ConfidenceRating;
}

// ── Section: Property Details ────────────────────────────────────────

export interface PropertyDetailsSection {
  /** Raw CAD record data */
  cadData: Record<string, unknown>;
  /** GIS attribute data */
  gisData: Record<string, unknown>;
  /** Aerial screenshot from GIS viewer */
  aerialScreenshot: string | null;
  /** Tax information */
  taxInfo: TaxInfo | null;
  confidence: ConfidenceRating;
}

export interface TaxInfo {
  taxYear: number;
  appraisedValue: number | null;
  assessedValue: number | null;
  exemptions: string[];
  taxingEntities: string[];
}

// ── Section: Links ───────────────────────────────────────────────────

export interface ResearchedLink {
  url: string;
  title: string;
  source: string;
  /** Whether data was successfully extracted from this URL */
  dataFound: boolean;
  /** Error message if the URL failed */
  error: string | null;
  /** Timestamp when this URL was visited */
  visitedAt: string;
}

// ── Section: Discrepancies ───────────────────────────────────────────

export interface DiscrepancyItem {
  category: 'legal_description' | 'acreage' | 'boundary' | 'ownership' | 'easement' | 'other';
  description: string;
  source1: string;
  source1Value: string;
  source2: string;
  source2Value: string;
  /** AI recommendation on which source to trust */
  aiRecommendation: string;
  severity: 'high' | 'medium' | 'low';
  confidence: ConfidenceRating;
}

// ── Adjacent Properties ──────────────────────────────────────────────

export interface AdjacentProperty {
  direction: string;
  propertyId: string;
  ownerName: string;
  /** Full research result (if adjacent research was run) */
  research: BellResearchResult | null;
  /** Shared boundary description */
  sharedBoundary: string | null;
}

// ── Screenshots & Site Intelligence ──────────────────────────────────

export interface ScreenshotCapture {
  /** Which scraper/phase captured this */
  source: string;
  /** URL of the page */
  url: string;
  /** Base64 PNG */
  imageBase64: string;
  /** When the screenshot was taken */
  capturedAt: string;
  /** Page title or description */
  description: string;
  /** First ~500 chars of visible page text (for classification) */
  pageText?: string;
  /** Whether this screenshot was classified as useful or misc by the AI/regex classifier */
  classification?: 'useful' | 'misc';
}

export interface SiteIntelligenceNote {
  url: string;
  screenshot: string;
  /** AI observations about the page */
  observations: string[];
  /** Suggestions for system improvement */
  suggestions: string[];
}

// ── Survey Plan (Job Preparation) ────────────────────────────────────

export interface SurveyPlan {
  /** Property summary paragraph */
  propertySummary: string;
  /** Metes and bounds description */
  metesAndBounds: string;
  /** Aerial image (base64) */
  aerialImage: string | null;
  /** Most recent plat image */
  platImage: string | null;
  /** AI-generated plat drawing layers */
  platLayers: PlatLayer[];
  /** Easement and encumbrance summary */
  easementSummary: string;
  /** Step-by-step field instructions */
  fieldSteps: FieldStep[];
  /** Recommended equipment */
  equipment: string[];
  /** Estimated field time */
  estimatedFieldTimeHours: number;
  /** Selected screenshots to include in document */
  includedScreenshots: string[];
}

export interface PlatLayer {
  name: string;
  description: string;
  enabled: boolean;
  /** SVG or canvas drawing data */
  drawingData: string;
}

export interface FieldStep {
  stepNumber: number;
  title: string;
  description: string;
  /** Coordinates (if applicable) */
  coordinates?: { lat: number; lon: number };
  /** Bearing from previous point */
  bearing?: string;
  /** Distance from previous point */
  distance?: string;
  /** What to look for at this location */
  lookFor: string[];
  /** Shots/measurements to take */
  measurements: string[];
  /** Calculations needed */
  calculations: string[];
}

// ── Toggle Section (UI Helper) ───────────────────────────────────────

export interface ToggleSection {
  id: string;
  title: string;
  /** Whether this section has data */
  hasData: boolean;
  /** Number of items in the section */
  itemCount: number;
  confidence: ConfidenceRating;
}

// ── Supporting Types ─────────────────────────────────────────────────

export interface ResearchError {
  phase: string;
  source: string;
  message: string;
  timestamp: string;
  /** Whether this error was recoverable */
  recovered: boolean;
}

export interface AiUsageSummary {
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  estimatedCostUsd: number;
}
