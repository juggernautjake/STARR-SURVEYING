// worker/src/types/reports.ts — Phase 10: Production Reports, Exports & CLI
// All TypeScript interfaces for the report generation pipeline.
//
// Spec §10.3 — Data Model: Inputs and Outputs

import type { ConfidenceReport } from './confidence.js';
import type { PurchaseReport } from './purchase.js';

// ── Unified Project Data (all Phase 1-9 outputs) ───────────────────────────

/**
 * ProjectData — the unified model that report generators consume.
 * Loaded from all Phase 1-9 outputs by the ProjectDataLoader.
 */
export interface ProjectData {
  projectId: string;
  address: string;
  county: string;
  state: 'TX';
  createdAt: string;
  completedAt: string;
  pipelineVersion: string;

  // Phase 1: Property Discovery
  discovery: {
    propertyId: string;
    ownerName: string;
    legalDescription: string;
    acreage: number;
    situs: string;
    subdivision: string | null;
    lot: string | null;
    block: string | null;
    cadUrl: string;
    cadSource: string;
  };

  // Phase 2: Document Harvesting
  documents: {
    target: ReportHarvestedDocument[];
    adjacent: { ownerName: string; documents: ReportHarvestedDocument[] }[];
    txdot: ReportHarvestedDocument[];
  };

  // Phase 3: AI Extraction (raw JSON)
  intelligence: any;

  // Phase 4: Subdivision (null if standalone tract)
  subdivision: any | null;

  // Phase 5: Adjacent Properties
  crossValidation: any;

  // Phase 6: TxDOT ROW
  rowData: any;

  // Phase 7: Reconciled Boundary
  reconciliation: any;

  // Phase 8: Confidence
  confidence: ConfidenceReport;

  // Phase 9: Purchases (null if no purchases made)
  purchases: PurchaseReport | null;

  // Phase 9 updated reconciliation (null if no purchases)
  reconciliationV2: any | null;
}

export interface ReportHarvestedDocument {
  type: 'plat' | 'deed' | 'easement' | 'restriction' | 'row_map';
  instrument: string;
  recordingDate: string;
  pages: number;
  imagePaths: string[];
  source: string;
  isWatermarked: boolean;
  isOfficial: boolean;
}

// ── Report Configuration ────────────────────────────────────────────────────

export type ReportFormat = 'pdf' | 'dxf' | 'svg' | 'png' | 'json' | 'txt';

export interface ReportConfig {
  formats: ReportFormat[];
  outputDir: string;

  // PDF options
  pdf: {
    pageSize: 'letter' | 'tabloid';
    includeSourceThumbnails: boolean;
    includeAppendix: boolean;
    companyName: string;
    companyAddress: string;
    rpls: string;
    logoPath: string | null;
  };

  // DXF options
  dxf: {
    coordinateSystem: 'nad83_tx_central';
    units: 'us_survey_feet';
    includeAdjacent: boolean;
    includeROW: boolean;
    includeEasements: boolean;
    includeMonuments: boolean;
    includeLabels: boolean;
  };

  // SVG/PNG options
  drawing: {
    width: number;
    height: number;
    dpi: number;
    showConfidenceColors: boolean;
    showAdjacentLabels: boolean;
    showROW: boolean;
    showEasements: boolean;
    showLotLabels: boolean;
    showBearingLabels: boolean;
    showDistanceLabels: boolean;
    showCurveAnnotations: boolean;
    showMonuments: boolean;
    showNorthArrow: boolean;
    showScaleBar: boolean;
    showLegend: boolean;
    backgroundColor: string;
    boundaryColor: string;
    lotLineColor: string;
    easementColor: string;
    rowColor: string;
    adjacentColor: string;
  };
}

// ── Report Output ───────────────────────────────────────────────────────────

export interface ReportManifest {
  projectId: string;
  generatedAt: string;
  outputDir: string;

  deliverables: {
    pdf: string | null;
    dxf: string | null;
    svg: string | null;
    png: string | null;
    json: string | null;
    txt: string | null;
  };

  sourceDocuments: string[];

  metadata: {
    propertyName: string;
    address: string;
    overallConfidence: number;
    overallGrade: string;
    totalCalls: number;
    reconciledCalls: number;
    closureRatio: string;
    totalDocumentCost: number;
    pipelineDuration: number;
    phaseDurations: { phase: number; name: string; seconds: number }[];
  };
}

// ── Pipeline Orchestration ──────────────────────────────────────────────────

export interface PipelineOptions {
  address: string;
  county?: string;
  projectId?: string;
  budget?: number;
  autoPurchase?: boolean;
  outputDir: string;
  formats: ReportFormat[];
  reportConfig?: Partial<ReportConfig>;
  resumeFromPhase?: number;
  skipPhases?: number[];
  onProgress?: (phase: number, name: string, status: string) => void;
}

export interface CheckpointData {
  projectId: string;
  completedPhases: number[];
  phaseOutputs: Record<number, string>;
  phaseDurations: Record<number, number>;
  startedAt: string;
  lastUpdated: string;
}

// ── Drawing Helpers ─────────────────────────────────────────────────────────

export interface Point2D {
  x: number;
  y: number;
  northing: number;
  easting: number;
}

export interface DrawingExtent {
  minN: number;
  maxN: number;
  minE: number;
  maxE: number;
  rangeN: number;
  rangeE: number;
  scaleFactor: number;
  paddingLeft: number;
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
}

// ── Default Report Config Factory ───────────────────────────────────────────

export function defaultReportConfig(
  overrides?: Partial<ReportConfig>,
): ReportConfig {
  const config: ReportConfig = {
    formats: ['pdf', 'dxf', 'svg'],
    outputDir: '/tmp/deliverables',
    pdf: {
      pageSize: 'letter',
      includeSourceThumbnails: true,
      includeAppendix: true,
      companyName: process.env.COMPANY_NAME || 'Starr Surveying Company',
      companyAddress: process.env.COMPANY_ADDRESS || 'Belton, Texas',
      rpls: process.env.COMPANY_RPLS || '',
      logoPath: process.env.COMPANY_LOGO_PATH || null,
    },
    dxf: {
      coordinateSystem: 'nad83_tx_central',
      units: 'us_survey_feet',
      includeAdjacent: true,
      includeROW: true,
      includeEasements: true,
      includeMonuments: true,
      includeLabels: true,
    },
    drawing: {
      width: 1200,
      height: 900,
      dpi: parseInt(process.env.DEFAULT_DPI || '300'),
      showConfidenceColors: true,
      showAdjacentLabels: true,
      showROW: true,
      showEasements: true,
      showLotLabels: true,
      showBearingLabels: true,
      showDistanceLabels: true,
      showCurveAnnotations: true,
      showMonuments: true,
      showNorthArrow: true,
      showScaleBar: true,
      showLegend: true,
      backgroundColor: '#FFFFFF',
      boundaryColor: '#000000',
      lotLineColor: '#333333',
      easementColor: '#0066CC',
      rowColor: '#CC0000',
      adjacentColor: '#666666',
    },
  };

  if (overrides) {
    if (overrides.formats) config.formats = overrides.formats;
    if (overrides.outputDir) config.outputDir = overrides.outputDir;
    if (overrides.pdf) Object.assign(config.pdf, overrides.pdf);
    if (overrides.dxf) Object.assign(config.dxf, overrides.dxf);
    if (overrides.drawing) Object.assign(config.drawing, overrides.drawing);
  }

  return config;
}
