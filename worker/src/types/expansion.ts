// worker/src/types/expansion.ts — Phase 11: Product Expansion & Platform
// All TypeScript interfaces for FEMA, GLO, TCEQ, RRC, NRCS integrations,
// billing, batch processing, chain of title, and analytics.
//
// Spec §11.2–§11.14

// ── FEMA Flood Zone Types (Module A) ────────────────────────────────────────

export type FloodZone =
  | 'A' | 'AE' | 'AH' | 'AO' | 'AR' | 'A99'  // High risk (SFHA)
  | 'V' | 'VE'                                   // Coastal high hazard
  | 'X'                                           // Moderate to minimal risk
  | 'D'                                           // Undetermined
  | 'OPEN WATER';

export interface FloodZoneResult {
  zones: {
    zone: FloodZone;
    zoneSubtype: string;
    staticBFE: number | null;
    depthNumber: number | null;
    velocityNumber: number | null;
    arEscarpment: boolean;
    percentageOfParcel: number;
    isSpecialFloodHazardArea: boolean;
    floodInsuranceRequired: boolean;
  }[];

  firmPanel: {
    panelNumber: string;
    suffix: string;
    effectiveDate: string;
    communityName: string;
    communityNumber: string;
    countyFIPS: string;
    state: string;
  } | null;

  basFloodElevation: {
    elevation: number;
    source: string;
    distanceFromBFELine: number;
    interpolated: boolean;
  } | null;

  lomaLomr: {
    caseNumber: string;
    type: 'LOMA' | 'LOMR' | 'LOMR-F' | 'CLOMA' | 'CLOMR';
    effectiveDate: string;
    description: string;
    determinedZone: FloodZone;
    previousZone: FloodZone;
  }[];

  summary: {
    primaryZone: FloodZone;
    isInFloodplain: boolean;
    floodInsuranceRequired: boolean;
    basFloodElevation: number | null;
    firmPanelNumber: string | null;
    firmEffectiveDate: string | null;
    hasLomaLomr: boolean;
    riskLevel: 'high' | 'moderate' | 'low' | 'undetermined';
  };
}

// ── GLO Land Grant Types (Module B) ─────────────────────────────────────────

export interface GLOSurveyResult {
  abstractNumber: string;
  surveyName: string;
  originalGrantee: string;
  grantDate: string;
  grantType: string;
  originalAcreage: number;
  county: string;

  abstractBoundary: {
    type: 'Polygon';
    coordinates: number[][][];
    spatialReference: string;
  } | null;

  parcelWithinAbstract: boolean;
  abstractContainsMultipleParcels: boolean;

  adjacentAbstracts: {
    abstractNumber: string;
    surveyName: string;
    direction: 'north' | 'south' | 'east' | 'west';
  }[];

  vacancyRisk: 'none' | 'low' | 'medium' | 'high';
  vacancyNotes: string;
}

// ── TCEQ Environmental Types (Module C) ─────────────────────────────────────

export interface TCEQEnvironmentalResult {
  storageTanks: {
    facilityId: string;
    facilityName: string;
    address: string;
    distanceFromProperty: number;
    direction: string;
    tankCount: number;
    status: 'active' | 'closed' | 'leaking' | 'remediation' | 'unknown';
    substances: string[];
    leakDetected: boolean;
    remediationStatus: string;
    lastInspectionDate: string;
    isOnProperty: boolean;
  }[];

  contaminationSites: {
    siteId: string;
    siteName: string;
    programType: 'superfund' | 'vcp' | 'brownfield' | 'dry_cleaner' | 'other';
    distanceFromProperty: number;
    status: string;
    contaminants: string[];
    isOnProperty: boolean;
  }[];

  permits: {
    permitNumber: string;
    type: string;
    facilityName: string;
    distanceFromProperty: number;
    isOnProperty: boolean;
  }[];

  summary: {
    environmentalRisk: 'none' | 'low' | 'moderate' | 'high' | 'critical';
    issuesFound: number;
    nearestContaminationFeet: number | null;
    requiresPhaseIESA: boolean;
    notes: string;
  };
}

// ── RRC Oil & Gas Types (Module D) ──────────────────────────────────────────

export interface RRCResult {
  wells: {
    apiNumber: string;
    wellName: string;
    operator: string;
    wellType: 'oil' | 'gas' | 'injection' | 'disposal' | 'dry';
    status: 'active' | 'inactive' | 'plugged' | 'permitted' | 'abandoned';
    distanceFromProperty: number;
    isOnProperty: boolean;
    surfaceLatitude: number;
    surfaceLongitude: number;
    depthFeet: number;
    completionDate: string;
    plugDate: string | null;
    fieldName: string;
    leaseNumber: string;
  }[];

  pipelines: {
    pipelineId: string;
    operator: string;
    commodity: 'oil' | 'gas' | 'NGL' | 'CO2' | 'water' | 'other';
    diameter: number;
    status: 'active' | 'inactive' | 'abandoned';
    distanceFromProperty: number;
    crossesProperty: boolean;
    estimatedEasementWidth: number;
    regulatorySetback: number;
  }[];

  summary: {
    wellsOnProperty: number;
    wellsWithin500Feet: number;
    pipelinesCrossingProperty: number;
    pipelinesWithin200Feet: number;
    mineralRightsNote: string;
    setbackRestrictions: string[];
  };
}

// ── NRCS Soil Types (Module E) ──────────────────────────────────────────────

export interface SoilResult {
  mapUnits: {
    musym: string;
    muname: string;
    mukey: string;
    percentOfParcel: number;
    drainageClass: string;
    hydrolicGroup: 'A' | 'B' | 'C' | 'D' | 'A/D' | 'B/D' | 'C/D';
    isHydric: boolean;
    shrinkSwellPotential: 'low' | 'moderate' | 'high' | 'very_high';
    depthToBedrockInches: number | null;
    depthToWaterTableInches: number | null;
    permeabilityInPerHour: number;
    septicSuitability: 'suitable' | 'marginal' | 'unsuitable';
    foundationRating: 'good' | 'fair' | 'poor';
    roadSubgradeRating: 'good' | 'fair' | 'poor';
    erosionFactor: number;
    windErodibility: number;
  }[];

  summary: {
    dominantSoilType: string;
    primaryConcerns: string[];
    septicFeasible: boolean;
    foundationConcerns: boolean;
    floodRiskFromSoil: boolean;
  };
}

// ── Chain of Title Types (Module J) ─────────────────────────────────────────

export interface ChainLink {
  instrument: string;
  type: 'deed' | 'plat' | 'easement' | 'restriction' | 'partition' | 'probate' | 'tax_sale';
  grantor: string;
  grantee: string;
  recordingDate: string;
  considerationAmount: number | null;
  legalDescription: string;
  acreage: number | null;
  boundaryCallsExtracted: boolean;
  boundaryChangesDetected: string[];
  measurementSystem: 'feet' | 'varas' | 'meters' | 'unknown';
  datumDetected: 'NAD83' | 'NAD27' | 'magnetic' | 'unknown';
  source: string;
  imagePaths: string[];
}

export interface ChainOfTitle {
  propertyId: string;
  chain: ChainLink[];
  depth: number;
  oldestRecord: string;

  boundaryEvolution: {
    period: string;
    changes: string[];
  }[];

  measurementSystemTransitions: {
    date: string;
    from: string;
    to: string;
  }[];

  acreageHistory: {
    date: string;
    acreage: number;
    change: number;
    reason: string;
  }[];

  easementGrants: {
    instrument: string;
    date: string;
    grantee: string;
    purpose: string;
    width: number | null;
    location: string;
  }[];

  vacancyAnalysis: {
    totalConveyedOut: number;
    parentTractSize: number;
    accountedFor: number;
    unaccountedAcreage: number;
    vacancyRisk: 'none' | 'low' | 'medium' | 'high';
  };
}

// ── Batch Processing Types (Module I) ───────────────────────────────────────

export interface BatchJob {
  batchId: string;
  userId: string;
  properties: {
    address: string;
    county?: string;
    label?: string;
  }[];
  options: {
    budget: number;
    autoPurchase: boolean;
    formats: string[];
    dataSources: string[];
    priority: 'normal' | 'rush';
  };
  status: 'queued' | 'processing' | 'complete' | 'partial' | 'failed';
  results: {
    address: string;
    projectId: string;
    status: 'complete' | 'failed' | 'pending';
    overallConfidence?: number;
    reportUrl?: string;
    error?: string;
  }[];
  createdAt: string;
  completedAt: string | null;
  totalCost: number;
}

// ── Billing & Subscription Types (Module G) ─────────────────────────────────

export type SubscriptionTier =
  | 'FREE_TRIAL'
  | 'SURVEYOR_PRO'
  | 'FIRM_UNLIMITED'
  | 'ENTERPRISE';

export interface SubscriptionTierConfig {
  name: string;
  price: number | null;
  reports_per_month: number;
  max_adjacent_properties: number;
  document_purchases: boolean;
  batch_processing: boolean;
  export_formats: string[] | 'all';
  api_access: boolean;
  support: string;
  data_sources: string[] | 'all';
  team_members?: number;
  custom_branding?: boolean;
  sla?: string;
  onboarding?: boolean;
}

export interface PerReportPricing {
  name: string;
  price: number;
  includes: string[] | 'all';
  export_formats: string[] | 'all';
  adjacent_properties: number;
  document_budget_included?: number;
}

// ── WebSocket Progress Types (Module H) ─────────────────────────────────────

export interface ProgressEvent {
  projectId: string;
  phase: number;
  phaseName: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'skipped';
  progress?: number;
  detail?: string;
  timing?: { elapsed: number; estimated: number };
  data?: any;
}

// ── Analytics Types (Module L) ──────────────────────────────────────────────

export interface ResearchEvent {
  eventType:
    | 'pipeline_started' | 'pipeline_completed' | 'pipeline_failed'
    | 'phase_completed' | 'phase_failed'
    | 'document_purchased' | 'ai_extraction' | 'report_generated'
    | 'export_downloaded';
  userId: string;
  projectId: string;
  county: string;
  timestamp: string;
  phase?: number;
  phaseName?: string;
  durationSeconds?: number;
  aiModel?: string;
  aiInputTokens?: number;
  aiOutputTokens?: number;
  aiCostEstimate?: number;
  overallConfidence?: number;
  callsExtracted?: number;
  discrepanciesFound?: number;
  documentCost?: number;
  serviceFee?: number;
}

export interface PromptVersion {
  promptId: string;
  version: number;
  systemPrompt: string;
  userPromptTemplate: string;
  model: string;
  maxTokens: number;
  temperature: number;
  deployedAt: string;
  accuracy: number;
  totalRuns: number;
  averageTokens: number;
  averageCost: number;
  status: 'active' | 'testing' | 'deprecated';
}
