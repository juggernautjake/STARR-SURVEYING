// lib/cad/ai-engine/types.ts
// All TypeScript types for the Phase 6 AI Drawing Engine.
// These supplement the core CAD types (lib/cad/types.ts) with AI-pipeline-
// specific concepts: classification flags, confidence scoring, deed parsing,
// reconciliation, the review queue, job payloads, and the AI Zustand store.

import type {
  SurveyPoint,
  PointGroup,
  Feature,
  LineString,
  PointCodeDefinition,
  ClosureResult,
  Traverse,
} from '../types';
import type { AnnotationBase } from '../labels/annotation-types';
import type { SymbolDefinition, LineTypeDefinition } from '../styles/types';

// ─── RE-EXPORTS ──────────────────────────────────────────────────────────────

export type { ClosureResult, Traverse };

// ─── STAGE 1: POINT CLASSIFICATION ──────────────────────────────────────────

/** Flags raised during point classification.  Multiple flags may be set on one point. */
export type ClassificationFlag =
  | 'UNRECOGNIZED_CODE'
  | 'AMBIGUOUS_CODE'
  | 'DUPLICATE_POINT_NUMBER'
  | 'COORDINATE_OUTLIER'
  | 'ELEVATION_ANOMALY'
  | 'SUFFIX_PARSE_ERROR'
  | 'NAME_SUFFIX_AMBIGUOUS'
  | 'ZERO_COORDINATES'
  | 'MONUMENT_NO_ACTION'
  | 'CALC_WITHOUT_FIELD';

/** Enriched view of a single survey point after Stage 1 analysis. */
export interface ClassificationResult {
  point:           SurveyPoint;
  resolvedCode:    PointCodeDefinition | null;
  monumentAction:  import('../types').MonumentAction | null;
  codeSuffix:      string | null;          // B / E / A / BA / EA / CA
  isLineStart:     boolean;
  isLineEnd:       boolean;
  isArcPoint:      boolean;
  isAutoSplinePoint: boolean;
  flags:           ClassificationFlag[];
  flagMessages:    string[];
}

// ─── STAGE 2: FEATURE ASSEMBLY ───────────────────────────────────────────────

export type AssemblyWarningType =
  | 'UNCLOSED_BOUNDARY'
  | 'SINGLE_POINT_LINE'
  | 'MIXED_CODES_IN_SEQUENCE'
  | 'GAP_IN_SEQUENCE'
  | 'SELF_INTERSECTION'
  | 'ARC_INSUFFICIENT_POINTS'
  | 'SPLINE_TOO_FEW_POINTS'
  | 'DUPLICATE_POSITION';

export interface AssemblyWarning {
  type:     AssemblyWarningType;
  pointIds: string[];
  message:  string;
  severity: 'INFO' | 'WARNING' | 'ERROR';
}

export interface AssemblyStats {
  totalPoints:            number;
  pointFeaturesCreated:   number;
  lineStringsBuilt:       number;
  closedPolygonsDetected: number;
  arcsFound:              number;
  splinesBuilt:           number;
  mixedGeometryCount:     number;
  orphanedPointCount:     number;
  warningCount:           number;
}

export interface FeatureAssemblyResult {
  lineStrings:            LineString[];
  pointFeatures:          Feature[];
  closedPolygons:         Feature[];
  curveFeatures:          Feature[];
  splineFeatures:         Feature[];
  mixedGeometryFeatures:  Feature[];
  orphanedPoints:         SurveyPoint[];
  warnings:               AssemblyWarning[];
  stats:                  AssemblyStats;
}

// ─── ARC FITTING ─────────────────────────────────────────────────────────────

/** A fitted arc from the Kasa circle-fit algorithm. */
export interface ArcDefinition {
  center:     import('../types').Point2D;  // Circle center
  radius:     number;                      // Feet
  startAngle: number;                      // Radians from center to first point
  endAngle:   number;                      // Radians from center to last point
  direction:  'CW' | 'CCW';               // Arc sweep direction
  /** First curve point (PC) */
  pc:         import('../types').Point2D;
  /** Last curve point (PT) */
  pt:         import('../types').Point2D;
  /** Mid-curve point used for direction detection */
  mpc:        import('../types').Point2D;
  /** Point of intersection (PI) — approximate */
  pi:         import('../types').Point2D;
}

// ─── STAGE 3: DEED PARSING & RECONCILIATION ─────────────────────────────────

export interface DeedData {
  source: 'LEGAL_DESCRIPTION' | 'PLAT_IMAGE' | 'DEED_PDF' | 'MANUAL_ENTRY';
  rawText:           string;
  calls:             DeedCall[];
  curves:            DeedCurve[];
  basisOfBearings:   string | null;
  beginningMonument: string | null;
  county:            string | null;
  survey:            string | null;
  abstract:          string | null;
  volume:            string | null;
  page:              string | null;
}

export interface DeedCall {
  index:     number;
  type:      'LINE' | 'CURVE';
  /** Azimuth in decimal degrees (0–360).  null if parse failed. */
  bearing:   number | null;
  /** Distance in feet.  null if parse failed. */
  distance:  number | null;
  curveData: DeedCurve | null;
  /** Monument text, e.g. "a 5/8 inch iron rod found" */
  monument:  string | null;
  rawText:   string;
}

export interface DeedCurve {
  radius:        number | null;
  arcLength:     number | null;
  chordBearing:  number | null;
  chordDistance: number | null;
  /** Central angle in decimal degrees */
  deltaAngle:    number | null;
  direction:     'LEFT' | 'RIGHT' | null;
}

export interface CallComparison {
  deedCallIndex:           number;
  fieldLegIndex:           number;
  fieldBearing:            number | null;   // Azimuth degrees
  fieldDistance:           number | null;
  recordBearing:           number | null;
  recordDistance:          number | null;
  /** Difference in arc-seconds */
  bearingDiff:             number | null;
  /** Difference in feet */
  distanceDiff:            number | null;
  bearingOk:               boolean;         // Within 60 seconds
  distanceOk:              boolean;         // Within 0.50'
  overallMatch:            boolean;
  /** 0.0–1.0 per call (0.5 bearing + 0.5 distance) */
  confidenceContribution:  number;
}

export type DiscrepancyType =
  | 'BEARING_MISMATCH'
  | 'DISTANCE_MISMATCH'
  | 'MONUMENT_NOT_FOUND'
  | 'EXTRA_MONUMENT'
  | 'CURVE_MISMATCH'
  | 'CLOSURE_POOR'
  | 'CALL_COUNT_MISMATCH'
  | 'BEGINNING_MONUMENT_NOT_FOUND';

export type DiscrepancySeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface Discrepancy {
  type:        DiscrepancyType;
  severity:    DiscrepancySeverity;
  callIndex:   number | null;
  message:     string;
  fieldValue:  string;
  recordValue: string;
  difference:  string;
}

export interface ReconciliationResult {
  fieldTraverse:     Traverse;
  recordTraverse:    Traverse;
  callComparisons:   CallComparison[];
  fieldClosure:      ClosureResult;
  recordClosure:     ClosureResult | null;
  discrepancies:     Discrepancy[];
  /** 0–100 */
  overallMatchScore: number;
  /** featureId → ±adjustment applied to deed-record-match factor */
  confidenceAdjustments: Map<string, number>;
}

// ─── STAGE 4: PLACEMENT ──────────────────────────────────────────────────────

export interface PlacementConfig {
  /** Paper size in inches: [width, height] */
  paperSize:      [number, number];
  /** Drawing scale denominator (e.g. 40 for 1"=40') */
  scale:          number;
  /** World-space rotation applied to the entire drawing (radians) */
  rotation:       number;
  /** World origin offset so the drawing fits the paper */
  originOffset:   import('../types').Point2D;
  /** Margins in inches: [top, right, bottom, left] */
  margins:        [number, number, number, number];
  /** Auto-selected (true) or user-specified (false) */
  autoSelected:   boolean;
}

// ─── STAGE 6: CONFIDENCE SCORING ─────────────────────────────────────────────

export interface ConfidenceFactors {
  /** How well-recognised and unambiguous the point codes are.  Weight: 0.25 */
  codeClarity:            number;
  /** Absence of zero/outlier coordinates.  Weight: 0.20 */
  coordinateValidity:     number;
  /** Agreement with the recorded deed.  Weight: 0.25 */
  deedRecordMatch:        number;
  /** Internal consistency (groups, deltas, cross-verification).  Weight: 0.15 */
  contextualConsistency:  number;
  /** Field traverse closure precision.  Weight: 0.10 */
  closureQuality:         number;
  /** Availability of full curve data (radius, delta, chord).  Weight: 0.05 */
  curveDataCompleteness:  number;
}

export interface ConfidenceScore {
  /** 0–100 overall confidence */
  score:   number;
  /** 1 (lowest) to 5 (highest) tier */
  tier:    1 | 2 | 3 | 4 | 5;
  factors: ConfidenceFactors;
  /** Human-readable explanations for each penalty or bonus */
  flags:   string[];
}

// ─── POINT GROUP REVIEW INFO ─────────────────────────────────────────────────

export interface PointGroupReviewInfo {
  baseNumber:        number;
  hasCalc:           boolean;
  hasSet:            boolean;
  hasFound:          boolean;
  finalSource:       'SET' | 'FOUND' | 'CALCULATED' | 'NONE';
  calcSetDelta:      number | null;  // Feet
  calcFoundDelta:    number | null;  // Feet
  hasDeltaWarning:   boolean;
  positionOptions: {
    label:   string;                 // "Set (used)", "Found (available)", etc.
    pointId: string;
    northing: number;
    easting:  number;
    active:  boolean;
  }[];
}

// ─── AI REVIEW QUEUE ─────────────────────────────────────────────────────────

export type ReviewItemStatus = 'PENDING' | 'ACCEPTED' | 'MODIFIED' | 'REJECTED';

export interface ReviewItem {
  id:            string;
  featureId:     string | null;    // null for unplaced tier-1 items
  pointIds:      string[];
  annotationIds: string[];

  // Display
  title:         string;
  description:   string;
  category:      string;
  confidence:    number;
  tier:          1 | 2 | 3 | 4 | 5;

  // Issues
  flags:          string[];
  discrepancies:  Discrepancy[];

  // Context
  pointGroupInfo: PointGroupReviewInfo | null;
  callComparison: CallComparison | null;

  // User state
  status:          ReviewItemStatus;
  userNote:        string | null;
  modifiedFeature: Feature | null;
}

export interface AIReviewQueue {
  tiers: {
    5: ReviewItem[];
    4: ReviewItem[];
    3: ReviewItem[];
    2: ReviewItem[];
    1: ReviewItem[];
  };
  summary: {
    totalElements:  number;
    acceptedCount:  number;
    modifiedCount:  number;
    rejectedCount:  number;
    pendingCount:   number;
  };
}

// ─── ELEMENT EXPLANATION (per-element AI chat) ───────────────────────────────

export interface ElementExplanation {
  featureId:   string;
  summary:     string;
  reasoning:   string;
  suggestions: string[];
  chatHistory: { role: 'user' | 'assistant'; content: string }[];
}

// ─── DEED OCR / IMPORT ───────────────────────────────────────────────────────

export interface DeedImportResult {
  extractedText: string;
  source:        'PDF_TEXT' | 'PDF_OCR' | 'IMAGE_OCR' | 'PASTED_TEXT';
  /** 0–1 OCR confidence */
  confidence:    number;
  pageCount:     number;
  warnings:      string[];
}

// ─── ONLINE DATA ENRICHMENT ──────────────────────────────────────────────────

export interface EnrichmentData {
  parcelId:       string | null;
  legalDescription: string | null;
  acreage:        number | null;
  femaFloodZone:  string | null;
  plssSection:    string | null;
  plssTownship:   string | null;
  plssRange:      string | null;
  elevationFt:    number | null;
  source:         string;
  retrievedAt:    string;          // ISO 8601
}

// ─── OFFSET RESOLUTION ───────────────────────────────────────────────────────

export interface OffsetResolutionResult {
  resolvedPoints:  SurveyPoint[];
  unresolvedCount: number;
  warnings:        string[];
}

// ─── AI DELIBERATION ─────────────────────────────────────────────────────────

export interface ClarifyingQuestion {
  id:       string;
  question: string;
  /** e.g. 'multiple_choice', 'yes_no', 'text', 'bearing_select' */
  type:     string;
  options:  string[] | null;
  answer:   string | null;
}

export interface DeliberationResult {
  questions:       ClarifyingQuestion[];
  answeredCount:   number;
  deliberationMs:  number;
  completedAt:     string;  // ISO 8601
}

// ─── AI JOB PAYLOAD & RESULT ─────────────────────────────────────────────────

export interface AIJobPayload {
  points:     SurveyPoint[];
  deedData:   DeedData | null;
  fieldNotes: string | null;
  userPrompt: string | null;
  /** Answers to clarifying questions from a prior deliberation round */
  answers:    ClarifyingQuestion[];

  // Drawing configuration
  templateId:               string | null;
  coordinateSystem:         string;        // e.g. "NAD83_TX_CENTRAL"
  codeLibrary:              PointCodeDefinition[];
  customSymbols:            SymbolDefinition[];
  customLineTypes:          LineTypeDefinition[];

  // Pipeline options
  autoSelectScale:          boolean;
  autoSelectOrientation:    boolean;
  generateLabels:           boolean;
  optimizeLabels:           boolean;
  includeConfidenceScoring: boolean;
}

export interface AIJobResult {
  features:      Feature[];
  annotations:   AnnotationBase[];
  placement:     PlacementConfig;

  // Intelligence
  classified:          ClassificationResult[];
  pointGroups:         PointGroup[];
  reconciliation:      ReconciliationResult | null;
  reviewQueue:         AIReviewQueue;
  /** Serialised Map<featureId, ConfidenceScore> */
  scores:              Record<string, ConfidenceScore>;
  /** Serialised Map<featureId, ElementExplanation> */
  explanations:        Record<string, ElementExplanation>;

  // Optional enrichment
  offsetResolution:    OffsetResolutionResult | null;
  enrichmentData:      EnrichmentData | null;
  deliberationResult:  DeliberationResult | null;

  // Diagnostics
  processingTimeMs: number;
  stageTimings:     Record<string, number>;
  warnings:         string[];
  /** Increments with each re-analyse call */
  version:          number;
}

// ─── AI PIPELINE STATUS ──────────────────────────────────────────────────────

export type AIPipelineStage =
  | 'idle'
  | 'classifying'
  | 'assembling'
  | 'reconciling'
  | 'placing'
  | 'labeling'
  | 'scoring'
  | 'deliberating'
  | 'done'
  | 'error';

export interface AIPipelineProgress {
  stage:           AIPipelineStage;
  stageIndex:      number;          // 0–6
  /** 0–100 */
  percent:         number;
  message:         string;
  stageTimings:    Partial<Record<AIPipelineStage, number>>;
}

// ─── AI ZUSTAND STORE INTERFACE ──────────────────────────────────────────────

export interface AIStore {
  // Job state
  status:     AIPipelineStage;
  jobId:      string | null;
  progress:   AIPipelineProgress;
  result:     AIJobResult | null;
  error:      string | null;
  jobVersion: number;

  // Review queue state (subset of result, kept separate for perf)
  reviewQueue: AIReviewQueue | null;
  selectedItemId: string | null;

  // Actions
  startJob:       (payload: AIJobPayload) => Promise<void>;
  cancelJob:      () => void;
  acceptItem:     (itemId: string) => void;
  rejectItem:     (itemId: string) => void;
  modifyItem:     (itemId: string, feature: Feature) => void;
  acceptAllTier:  (tier: 1 | 2 | 3 | 4 | 5) => void;
  rejectAllTier:  (tier: 1 | 2 | 3 | 4 | 5) => void;
  selectItem:     (itemId: string | null) => void;
  setUserNote:    (itemId: string, note: string) => void;
  applyResult:    () => void;        // Commits accepted/modified features to drawing
  reset:          () => void;
}
