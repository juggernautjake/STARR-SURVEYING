// lib/research/white-label.config.ts — White-label / standalone configuration
// Defines the configuration schema for selling this as a standalone product
// to other surveying firms, civil engineering firms, and education institutions.
//
// All UI text, feature flags, branding, and jurisdiction settings are
// configurable through this system.

// ── Core White-Label Configuration ──────────────────────────────────────────

export interface WhiteLabelConfig {
  // Branding
  branding: {
    companyName: string;
    productName: string;
    logoUrl?: string;
    faviconUrl?: string;
    primaryColor: string;
    accentColor: string;
    supportEmail?: string;
    supportUrl?: string;
  };

  // Customizable terminology — every user-facing term can be overridden
  terms: {
    project: string;         // "Research Project"
    document: string;        // "Document"
    drawing: string;         // "Drawing"
    discrepancy: string;     // "Discrepancy"
    dataPoint: string;       // "Data Point"
    analysis: string;        // "Analysis"
    verification: string;    // "Verification"
    export: string;          // "Export"
  };

  // Feature flags — gate optional/premium features
  features: {
    propertySearch: boolean;       // Phase 3 property search integration
    aiAnalysis: boolean;           // Core AI document analysis
    drawingRenderer: boolean;      // Plat drawing generation
    confidenceScoring: boolean;    // Per-element confidence system
    comparisonEngine: boolean;     // Drawing-to-source comparison
    dxfExport: boolean;            // AutoCAD DXF export (premium)
    pdfExport: boolean;            // PDF export
    pngExport: boolean;            // PNG raster export
    templateManagement: boolean;   // Custom template creation
    multiUserCollaboration: boolean;
    ocrProcessing: boolean;        // Image/scanned doc OCR
    manualDocEntry: boolean;       // Manual text entry as document
  };

  // Jurisdiction configuration — adapt to local surveying standards
  jurisdiction: {
    state: string;                 // "TX", "CA", "FL", etc.
    surveyStandards: string;       // "texas_minimum_standards", "california_plss", etc.
    defaultUnits: 'feet' | 'meters';
    defaultDatum: string;          // "NAD83", "WGS84"
    dataSources: DataSourceConfig[];
    varasSupported: boolean;       // Texas: 1 vara = 2.777778 feet
    plssSupported: boolean;        // Public Land Survey System (western states)
  };

  // Limits
  limits: {
    maxFileSize: number;           // MB
    maxProjectStorage: number;     // MB
    maxDocumentsPerProject: number;
    maxProjectsTotal: number;      // -1 for unlimited
    maxAiCallsPerDay: number;      // -1 for unlimited
  };
}

export interface DataSourceConfig {
  source: string;                  // "county_cad", "county_clerk", "fema", etc.
  enabled: boolean;
  apiKeyEnvVar?: string;           // env variable name containing API key
  baseUrl?: string;
}

// ── Education Mode Extension ────────────────────────────────────────────────

export interface EducationConfig extends WhiteLabelConfig {
  educationMode: true;

  education: {
    practiceProjects: boolean;       // sample projects with known answers
    gradingRubric: boolean;          // auto-grade student analysis accuracy
    studentProgress: boolean;        // track student competency over time
    instructorDashboard: boolean;    // instructor sees all student work
    hintsEnabled: boolean;           // AI provides hints instead of answers
    stepByStepMode: boolean;         // forces students through each step
    timeLimits: boolean;             // timed exercises
  };

  grading: {
    extractionAccuracy: number;      // weight (0-100) for data extraction accuracy
    discrepancyDetection: number;    // weight for finding issues
    resolutionQuality: number;       // weight for resolution decisions
    drawingAccuracy: number;         // weight for drawing quality
  };
}

// ── Default Configuration (Starr Surveying) ─────────────────────────────────

export const DEFAULT_CONFIG: WhiteLabelConfig = {
  branding: {
    companyName: 'Starr Surveying',
    productName: 'Property Research',
    primaryColor: '#2563EB',
    accentColor: '#059669',
    supportEmail: 'support@starr-surveying.com',
  },

  terms: {
    project: 'Research Project',
    document: 'Document',
    drawing: 'Drawing',
    discrepancy: 'Discrepancy',
    dataPoint: 'Data Point',
    analysis: 'Analysis',
    verification: 'Verification',
    export: 'Export',
  },

  features: {
    propertySearch: true,
    aiAnalysis: true,
    drawingRenderer: true,
    confidenceScoring: true,
    comparisonEngine: true,
    dxfExport: false,         // not yet implemented
    pdfExport: false,         // not yet implemented
    pngExport: false,         // not yet implemented
    templateManagement: true,
    multiUserCollaboration: false,
    ocrProcessing: true,
    manualDocEntry: true,
  },

  jurisdiction: {
    state: 'TX',
    surveyStandards: 'texas_minimum_standards',
    defaultUnits: 'feet',
    defaultDatum: 'NAD83',
    dataSources: [
      { source: 'county_cad', enabled: true },
      { source: 'county_clerk', enabled: true },
      { source: 'fema', enabled: true, apiKeyEnvVar: 'FEMA_API_KEY' },
      { source: 'tnris', enabled: true, apiKeyEnvVar: 'TNRIS_API_KEY' },
      { source: 'txdot', enabled: true },
      { source: 'usgs', enabled: true },
    ],
    varasSupported: true,
    plssSupported: false,
  },

  limits: {
    maxFileSize: parseInt(process.env.RESEARCH_MAX_FILE_SIZE_MB || '50'),
    maxProjectStorage: parseInt(process.env.RESEARCH_MAX_PROJECT_STORAGE_MB || '500'),
    maxDocumentsPerProject: 50,
    maxProjectsTotal: -1,
    maxAiCallsPerDay: -1,
  },
};

// ── Example Education Config ────────────────────────────────────────────────

export const EXAMPLE_EDUCATION_CONFIG: EducationConfig = {
  ...DEFAULT_CONFIG,
  educationMode: true,

  branding: {
    ...DEFAULT_CONFIG.branding,
    companyName: 'Texas A&M',
    productName: 'Surveying Lab',
  },

  features: {
    ...DEFAULT_CONFIG.features,
    propertySearch: false,           // students use provided documents
    dxfExport: false,
    multiUserCollaboration: false,
  },

  education: {
    practiceProjects: true,
    gradingRubric: true,
    studentProgress: true,
    instructorDashboard: true,
    hintsEnabled: true,
    stepByStepMode: true,
    timeLimits: false,
  },

  grading: {
    extractionAccuracy: 30,
    discrepancyDetection: 25,
    resolutionQuality: 20,
    drawingAccuracy: 25,
  },
};

// ── Config Helper ───────────────────────────────────────────────────────────

let _activeConfig: WhiteLabelConfig = DEFAULT_CONFIG;

/**
 * Get the active white-label configuration.
 * In a multi-tenant setup, this would be loaded per-organization.
 */
export function getConfig(): WhiteLabelConfig {
  return _activeConfig;
}

/**
 * Override the active configuration (for testing or multi-tenant setup).
 */
export function setConfig(config: WhiteLabelConfig): void {
  _activeConfig = config;
}

/**
 * Check if a feature is enabled in the current configuration.
 */
export function isFeatureEnabled(feature: keyof WhiteLabelConfig['features']): boolean {
  return _activeConfig.features[feature] ?? false;
}

/**
 * Get a localized term from the current configuration.
 */
export function getTerm(key: keyof WhiteLabelConfig['terms']): string {
  return _activeConfig.terms[key] || key;
}

/**
 * Check if the current configuration is education mode.
 */
export function isEducationMode(): boolean {
  return 'educationMode' in _activeConfig && (_activeConfig as EducationConfig).educationMode === true;
}
