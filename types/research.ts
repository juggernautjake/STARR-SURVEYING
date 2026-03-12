// types/research.ts — TypeScript interfaces for AI Property Research feature

// ── Workflow ─────────────────────────────────────────────────────────────────

export type WorkflowStep = 'upload' | 'configure' | 'analyzing' | 'review' | 'drawing' | 'verifying' | 'complete';

export const WORKFLOW_STEPS: { key: WorkflowStep; label: string; number: number }[] = [
  { key: 'upload', label: 'Upload', number: 1 },
  { key: 'configure', label: 'Configure', number: 2 },
  { key: 'analyzing', label: 'Analyze', number: 3 },
  { key: 'review', label: 'Review', number: 4 },
  { key: 'drawing', label: 'Draw', number: 5 },
  { key: 'verifying', label: 'Verify', number: 6 },
  { key: 'complete', label: 'Export', number: 7 },
];

// ── 4-Stage Pipeline (user-facing UI) ────────────────────────────────────────

/** The four high-level pipeline stages shown to the user in the stepper UI. */
export type PipelineStage = 'upload' | 'research' | 'review' | 'jobprep';

export interface PipelineStageInfo {
  key: PipelineStage;
  number: number;
  label: string;
  icon: string;
  description: string;
  /** The primary WorkflowStep this stage maps to (used for revert navigation) */
  primaryStep: WorkflowStep;
}

export const PIPELINE_STAGES: PipelineStageInfo[] = [
  {
    key: 'upload',
    number: 1,
    label: 'Property Information',
    icon: '📤',
    description: 'Upload documents and provide property information',
    primaryStep: 'upload',
  },
  {
    key: 'research',
    number: 2,
    label: 'Research & Analysis',
    icon: '🔬',
    description: 'Automated research from 10+ sources and AI data extraction',
    primaryStep: 'configure',
  },
  {
    key: 'review',
    number: 3,
    label: 'Review',
    icon: '📋',
    description: 'Review results, summaries, discrepancies, and source links',
    primaryStep: 'review',
  },
  {
    key: 'jobprep',
    number: 4,
    label: 'Job Prep',
    icon: '🏗️',
    description: 'AI drawing, field plan, and final printable job document',
    primaryStep: 'drawing',
  },
];

/** Maps a low-level WorkflowStep (DB status) to the user-facing PipelineStage. */
export function workflowStepToStage(step: WorkflowStep): PipelineStage {
  switch (step) {
    case 'upload':
      return 'upload';
    case 'configure':
    case 'analyzing':
      return 'research';
    case 'review':
      return 'review';
    case 'drawing':
    case 'verifying':
    case 'complete':
      return 'jobprep';
    default:
      return 'upload';
  }
}

// ── Research Project ─────────────────────────────────────────────────────────

export interface ResearchProject {
  id: string;
  created_by: string;
  job_id?: string | null;
  name: string;
  description?: string | null;
  property_address?: string | null;
  county?: string | null;
  state: string;
  parcel_id?: string | null;
  legal_description_summary?: string | null;
  status: WorkflowStep;
  analysis_template_id?: string | null;
  analysis_filters: Record<string, boolean>;
  analysis_metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
  archived_at?: string | null;
}

// ── Document Types ───────────────────────────────────────────────────────────

export type DocumentSourceType = 'user_upload' | 'property_search' | 'linked_reference' | 'manual_entry';

export type DocumentType =
  | 'deed' | 'plat' | 'survey' | 'legal_description'
  | 'title_commitment' | 'easement' | 'restrictive_covenant'
  | 'field_notes' | 'subdivision_plat' | 'metes_and_bounds'
  | 'county_record' | 'appraisal_record' | 'aerial_photo'
  | 'topo_map' | 'utility_map' | 'other';

export type ProcessingStatus = 'pending' | 'extracting' | 'extracted' | 'analyzing' | 'analyzed' | 'error';

export interface ResearchDocument {
  id: string;
  research_project_id: string;
  source_type: DocumentSourceType;
  original_filename?: string | null;
  file_type?: string | null;
  file_size_bytes?: number | null;
  storage_path?: string | null;
  storage_url?: string | null;
  /** Public URL of PDF bundled from page images (set by worker pipeline) */
  pages_pdf_url?: string | null;
  source_url?: string | null;
  document_type?: DocumentType | null;
  document_label?: string | null;
  processing_status: ProcessingStatus;
  processing_error?: string | null;
  extracted_text?: string | null;
  extracted_text_method?: string | null;
  page_count?: number | null;
  ocr_confidence?: number | null;
  ocr_regions?: OcrRegion[] | null;
  recorded_date?: string | null;
  recording_info?: string | null;
  created_at: string;
  updated_at: string;
}

export interface OcrRegion {
  text: string;
  bbox: { x: number; y: number; width: number; height: number };
  confidence: number;
}

// ── Document Type Labels (for UI) ────────────────────────────────────────────

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, { label: string; icon: string }> = {
  deed:                 { label: 'Deed', icon: '📜' },
  plat:                 { label: 'Plat', icon: '🗺️' },
  survey:               { label: 'Survey', icon: '📐' },
  legal_description:    { label: 'Legal Description', icon: '⚖️' },
  title_commitment:     { label: 'Title Commitment', icon: '📋' },
  easement:             { label: 'Easement', icon: '🛤️' },
  restrictive_covenant: { label: 'Restrictive Covenant', icon: '📄' },
  field_notes:          { label: 'Field Notes', icon: '📓' },
  subdivision_plat:     { label: 'Subdivision Plat', icon: '🏘️' },
  metes_and_bounds:     { label: 'Metes & Bounds', icon: '📏' },
  county_record:        { label: 'County Record', icon: '🏛️' },
  appraisal_record:     { label: 'Appraisal Record', icon: '💰' },
  aerial_photo:         { label: 'Aerial Photo', icon: '🛩️' },
  topo_map:             { label: 'Topo Map', icon: '🏔️' },
  utility_map:          { label: 'Utility Map', icon: '⚡' },
  other:                { label: 'Other', icon: '📎' },
};

// ── Extracted Data Points ────────────────────────────────────────────────────

export type DataCategory =
  | 'bearing' | 'distance' | 'call' | 'monument'
  | 'point_of_beginning' | 'curve_data' | 'area'
  | 'boundary_description' | 'easement' | 'setback'
  | 'right_of_way' | 'adjoiner' | 'recording_reference'
  | 'date_reference' | 'surveyor_info' | 'legal_description'
  | 'lot_block' | 'subdivision_name' | 'coordinate'
  | 'elevation' | 'zoning' | 'flood_zone' | 'utility_info'
  | 'annotation' | 'symbol' | 'other';

export interface ExtractedDataPoint {
  id: string;
  research_project_id: string;
  document_id: string;
  data_category: DataCategory;
  raw_value: string;
  normalized_value?: Record<string, unknown> | null;
  display_value?: string | null;
  unit?: string | null;
  source_page?: number | null;
  source_location?: string | null;
  source_bounding_box?: { x: number; y: number; width: number; height: number } | null;
  source_text_excerpt?: string | null;
  sequence_order?: number | null;
  sequence_group?: string | null;
  extraction_confidence?: number | null;
  confidence_reasoning?: string | null;
  created_at: string;
  updated_at: string;
}

// ── Discrepancies ────────────────────────────────────────────────────────────

export type DiscrepancySeverity = 'info' | 'unclear' | 'uncertain' | 'discrepancy' | 'contradiction' | 'error';
export type ProbableCause =
  | 'clerical_error' | 'drawing_error' | 'surveying_error'
  | 'transcription_error' | 'rounding_difference'
  | 'datum_difference' | 'age_difference' | 'legal_ambiguity'
  | 'missing_information' | 'ocr_uncertainty' | 'unknown';
export type ResolutionStatus = 'open' | 'reviewing' | 'resolved' | 'accepted' | 'deferred';

export interface Discrepancy {
  id: string;
  research_project_id: string;
  severity: DiscrepancySeverity;
  probable_cause?: ProbableCause | null;
  title: string;
  description: string;
  ai_recommendation?: string | null;
  data_point_ids: string[];
  document_ids: string[];
  affects_boundary: boolean;
  affects_area: boolean;
  affects_closure: boolean;
  estimated_impact?: string | null;
  resolution_status: ResolutionStatus;
  resolved_by?: string | null;
  resolution_notes?: string | null;
  resolved_value?: Record<string, unknown> | null;
  resolved_at?: string | null;
  created_at: string;
  updated_at: string;
}

export const SEVERITY_CONFIG: Record<DiscrepancySeverity, { label: string; color: string; icon: string }> = {
  info:          { label: 'Info', color: '#3B82F6', icon: 'i' },
  unclear:       { label: 'Unclear', color: '#FBBF24', icon: '?' },
  uncertain:     { label: 'Uncertain', color: '#F59E0B', icon: '~' },
  discrepancy:   { label: 'Discrepancy', color: '#F97316', icon: '!' },
  contradiction: { label: 'Contradiction', color: '#EF4444', icon: '!!' },
  error:         { label: 'Error', color: '#DC2626', icon: 'X' },
};

// ── Analysis Templates ───────────────────────────────────────────────────────

export interface AnalysisTemplate {
  id: string;
  created_by: string;
  name: string;
  description?: string | null;
  is_default: boolean;
  is_system: boolean;
  extract_config: Record<string, boolean>;
  display_config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ── Drawing Templates ────────────────────────────────────────────────────────

export interface DrawingTemplate {
  id: string;
  created_by: string;
  name: string;
  description?: string | null;
  is_default: boolean;
  is_system: boolean;
  paper_config: Record<string, unknown>;
  feature_styles: Record<string, FeatureStyle>;
  label_config: Record<string, unknown>;
  title_block?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface FeatureStyle {
  stroke: string;
  strokeWidth: number;
  dasharray?: string;
  fill?: string;
  fontSize?: number;
}

// ── Rendered Drawings ────────────────────────────────────────────────────────

export type DrawingStatus = 'draft' | 'rendering' | 'rendered' | 'verified' | 'exported' | 'error';

export interface RenderedDrawing {
  id: string;
  research_project_id: string;
  drawing_template_id?: string | null;
  name: string;
  version: number;
  status: DrawingStatus;
  canvas_config: CanvasConfig;
  title_block?: Record<string, unknown> | null;
  overall_confidence?: number | null;
  confidence_breakdown?: Record<string, number> | null;
  comparison_notes?: string | null;
  user_annotations?: Record<string, unknown>[] | null;
  user_preferences?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  archived_at?: string | null;
}

export interface CanvasConfig {
  width: number;
  height: number;
  scale: number;
  units: string;
  origin: [number, number];
  background: string;
}

// ── Drawing Elements ─────────────────────────────────────────────────────────

export type ElementType = 'line' | 'curve' | 'polyline' | 'polygon' | 'point' | 'label' | 'dimension' | 'symbol' | 'hatch' | 'callout';

export type FeatureClass =
  | 'property_boundary' | 'easement' | 'setback'
  | 'right_of_way' | 'road' | 'concrete' | 'building'
  | 'fence' | 'utility' | 'water_feature' | 'tree_line'
  | 'contour' | 'lot_line' | 'centerline' | 'monument'
  | 'control_point' | 'annotation' | 'title_block' | 'other';

export interface DrawingElement {
  id: string;
  drawing_id: string;
  element_type: ElementType;
  feature_class: FeatureClass;
  geometry: ElementGeometry;
  svg_path?: string | null;
  attributes: Record<string, unknown>;
  style: ElementStyle;
  layer: string;
  z_index: number;
  visible: boolean;
  locked: boolean;
  confidence_score: number;
  confidence_factors: ConfidenceFactors;
  ai_report?: string | null;
  source_references: SourceReference[];
  data_point_ids: string[];
  discrepancy_ids: string[];
  user_modified: boolean;
  user_notes?: string | null;
  created_at: string;
  updated_at: string;
}

// ── Geometry Types ───────────────────────────────────────────────────────────

export interface Point2D { x: number; y: number; }

export type ElementGeometry =
  | { type: 'line'; start: [number, number]; end: [number, number] }
  | { type: 'curve'; center: [number, number]; radius: number; startAngle: number; endAngle: number; direction: 'cw' | 'ccw' }
  | { type: 'polygon'; points: [number, number][] }
  | { type: 'point'; position: [number, number] }
  | { type: 'label'; position: [number, number]; anchor: 'start' | 'middle' | 'end' };

export interface ElementStyle {
  stroke: string;
  strokeWidth: number;
  strokeDasharray?: string;
  fill?: string;
  fillPattern?: string;  // 'solid' | 'hatch-ne30' | 'hatch-nw30' | 'dots-5' | 'dots-10' | 'dots-25' | 'dots-50' | 'dots-75'
  fillColor?: string;    // explicit fill color separate from stroke color
  opacity: number;
  fontSize?: number;
  fontFamily?: string;
  rotation?: number;     // label rotation in degrees — stored in element.attributes on save, but included here so the UI can pass it through onStyleChange for routing
}

// ── Confidence ───────────────────────────────────────────────────────────────

export interface ConfidenceFactors {
  source_quality: number;
  extraction_certainty: number;
  cross_reference_match: number;
  geometric_consistency: number;
  closure_contribution: number;
}

// ── Source References ─────────────────────────────────────────────────────────

export interface SourceReference {
  document_id: string;
  document_label: string;
  page: number;
  location: string;
  excerpt: string;
  bounding_box?: { x: number; y: number; width: number; height: number };
}

// ── View Modes ───────────────────────────────────────────────────────────────

export type ViewMode = 'standard' | 'feature' | 'confidence' | 'discrepancy' | 'custom';

// ── Property Search ─────────────────────────────────────────────────────────

export type SearchSource =
  | 'county_cad'       // County Appraisal District
  | 'county_clerk'     // County Clerk records
  | 'fema'             // FEMA flood zone
  | 'tnris'            // Texas Natural Resources Information System
  | 'txdot'            // TxDOT right-of-way maps
  | 'usgs'             // USGS topo/elevation
  | 'bell_county_gis'  // Bell County GIS portal
  | 'texas_glo'        // Texas General Land Office (abstract surveys)
  | 'texas_rrc'        // Texas Railroad Commission (oil/gas infrastructure)
  | 'city_records'     // City permit/plat portals
  | 'texas_file';      // TexasFile deed/instrument search

export interface PropertySearchResult {
  id: string;
  source: SearchSource;
  source_name: string;
  title: string;
  url: string;
  document_type: DocumentType;
  relevance: number;
  description: string;
  has_cost: boolean;
  cost_note?: string;
  /** True when the URL or content is specifically about THIS property (not a generic portal link) */
  is_property_specific?: boolean;
  /** Static map image URL safe to embed in <img> directly (USGS public service) */
  preview_image_url?: string;
  metadata?: Record<string, unknown>;
}

export interface PropertySearchRequest {
  address?: string;
  county?: string;
  parcel_id?: string;
  owner_name?: string;
  legal_description?: string;
}

export interface PropertySearchResponse {
  results: PropertySearchResult[];
  sources_searched: { source: SearchSource; name: string; status: 'success' | 'error' | 'no_results'; message?: string }[];
  total: number;
  /** AI-normalized address, if normalization was run */
  address_normalized?: string;
  /** Alternate address formats/spellings the AI identified */
  address_variants?: string[];
  /** Potential address issues the AI flagged (spelling, missing components, etc.) */
  address_issues?: string[];
  /** Actionable suggestions for the researcher */
  address_suggestions?: string[];
  /** Geocoded coordinates for the address (null if geocoding failed or no address given) */
  geocoded_lat?: number | null;
  geocoded_lon?: number | null;
  /** Static satellite map preview URL for the geocoded location */
  location_preview_url?: string | null;
}

// ── Boundary Calls Fetch ─────────────────────────────────────────────────────

export interface BoundaryFetchRequest {
  address?: string;
  county?: string;
  parcel_id?: string;
  owner_name?: string;
  state?: string;
}

/** One leg of a metes-and-bounds traverse */
export interface ParsedBoundaryCall {
  sequence: number;
  type: 'line' | 'curve';
  /** Formatted bearing string, e.g. "N 45°30'00\" E" */
  bearing?: string;
  distance?: number;
  distance_unit?: string;
  // Curve data
  radius?: number;
  arc_length?: number;
  delta_angle?: string;
  chord_bearing?: string;
  chord_distance?: number;
  curve_direction?: 'left' | 'right';
  /** Raw text excerpt this call was parsed from */
  raw_text?: string;
  /** AI confidence in accuracy of this call (0–1). Null if not assessed. */
  confidence?: number | null;
}

/** Result of a mathematical traverse closure check */
export interface ClosureCheckResult {
  /** Whether the check was actually run (false if calls had insufficient data) */
  checked: boolean;
  /** True if the traverse closes within tolerance */
  closes: boolean;
  /** Linear closure error in feet (distance from end point back to POB) */
  closure_error_ft: number | null;
  /** Precision ratio expressed as "1:N" (e.g. "1:25000") — null if error is 0 */
  closure_precision: string | null;
  /** Area computed from traverse coordinates via shoelace formula (acres) */
  area_computed_acres: number | null;
  /** Total perimeter of the traverse in feet */
  total_traverse_ft: number | null;
  /** Number of calls included in the check */
  calls_used: number;
  /** Human-readable quality assessment */
  quality: 'excellent' | 'good' | 'marginal' | 'poor' | 'unchecked';
  /** Warning or explanation if the check failed or produced unexpected results */
  warning?: string;
}

/** Property record data returned from a county appraisal district */
export interface PropertyDetails {
  owner_name?: string;
  mailing_address?: string;
  property_address?: string;
  legal_description?: string;
  acreage?: number;
  land_value?: number;
  improvement_value?: number;
  total_value?: number;
  land_use?: string;
  abstract?: string;
  subdivision?: string;
  lot_block?: string;
  deed_reference?: string;
  property_id?: string;
}

export interface BoundaryFetchResult {
  success: boolean;
  source_name: string;
  source_url?: string;
  property_id?: string;
  property?: PropertyDetails;
  legal_description?: string;
  point_of_beginning?: string;
  boundary_calls?: ParsedBoundaryCall[];
  call_count?: number;
  stated_acreage?: number;
  /** Description type parsed from the legal description (metes_and_bounds / lot_block / hybrid) */
  description_type?: string;
  /** Horizontal datum referenced in the legal description (NAD83 / NAD27 / unknown) */
  datum?: string;
  /** Deed references (chain-of-title links) found within the legal description */
  deed_references?: Array<{ type: string; volume?: string; page?: string; instrument?: string; county?: string; description?: string }>;
  /** Mathematical traverse closure check result */
  closure_check?: ClosureCheckResult;
  error?: string;
  /** Direct link to this property on the county CAD e-search portal (e.g. esearch.bellcad.org/Property/View/{id}) */
  cad_property_url?: string;
  /** County clerk deed-search URL pre-loaded with this property ID (e.g. bell.tx.publicsearch.us) */
  deed_search_url?: string;
  /** Step-by-step log of what was searched/found during retrieval */
  search_steps: string[];
  /** Geocoded coordinates for this property obtained during lookup */
  geocoded_lat?: number;
  geocoded_lon?: number;
  /**
   * Structured acquisition log — records exactly what was found, which method
   * found it, and where the source document came from.  Used for the log panel
   * and for auditing the research pipeline.
   */
  acquisition_log?: AcquisitionLogEntry[];
  /**
   * Boundary calls formatted and ready for the drawing engine.
   * Each call is in the same shape as `NormalizedCall` so it can be fed
   * directly into `computeTraverse` / `buildElementsFromAnalysis`.
   */
  drawing_ready?: DrawingReadyCall[];
}

/** One structured entry in the property-research acquisition log */
export interface AcquisitionLogEntry {
  /** ISO timestamp */
  ts: string;
  /** What category of data was acquired */
  category: 'property_id' | 'legal_description' | 'deed_reference' | 'boundary_call' | 'document' | 'error' | 'info';
  /** Human-readable description of what was found */
  message: string;
  /** The specific method/source that produced the result */
  method?: string;
  /** The URL or endpoint that was queried */
  source_url?: string;
  /** The actual value found (property ID, deed vol/page, etc.) */
  value?: string;
}

/** A single boundary call ready for direct ingestion by the drawing engine */
export interface DrawingReadyCall {
  sequence: number;
  type: 'line' | 'curve';
  bearing?: string;
  bearing_degrees?: number;       // decimal azimuth for geometry engine
  distance_ft?: number;            // always in feet
  radius_ft?: number;
  arc_length_ft?: number;
  delta_angle?: string;
  chord_bearing?: string;
  chord_distance_ft?: number;
  curve_direction?: 'left' | 'right';
  monument_at_end?: string;
  raw_text?: string;
  confidence?: number | null;
}

// ── Deep Document Analysis ────────────────────────────────────────────────────

export interface DeepAnalysisCall {
  sequence: number;
  type: 'line' | 'curve';
  bearing?: string | null;
  distance?: number | null;
  distance_unit?: string;
  monument_at_end?: string | null;
  monument_condition?: string | null;
  adjoiner?: string | null;
  raw_text?: string;
  // Curve fields
  radius?: number | null;
  arc_length?: number | null;
  delta_angle?: string | null;
  chord_bearing?: string | null;
  chord_distance?: number | null;
  curve_direction?: string | null;
}

export interface DeepAnalysisEasement {
  type: string;
  width_ft?: number | null;
  description?: string;
  grantee?: string | null;
  location?: string | null;
  instrument?: string | null;
}

export interface DeepAnalysisLot {
  lot: string;
  block?: string | null;
  frontage_ft?: number | null;
  depth_ft?: number | null;
  area_sqft?: number | null;
  area_acres?: number | null;
  irregular?: boolean;
}

/** Result of AI deep-analysis on a legal description document */
export interface LegalDescriptionAnalysis {
  document_type?: string;
  identification?: {
    survey_name?: string | null;
    abstract_number?: string | null;
    county?: string | null;
    state?: string | null;
    city?: string | null;
    grantor?: string | null;
    grantee?: string | null;
    instrument_number?: string | null;
    recording_date?: string | null;
    volume?: string | null;
    page?: string | null;
  };
  tract?: {
    type?: string | null;
    stated_acreage?: number | null;
    stated_sqft?: number | null;
    lot?: string | null;
    block?: string | null;
    subdivision_name?: string | null;
    plat_reference?: string | null;
  };
  point_of_beginning?: {
    description?: string | null;
    monument_type?: string | null;
    monument_condition?: string | null;
    reference_point?: string | null;
  };
  calls?: DeepAnalysisCall[];
  closure?: string | null;
  monuments?: Array<{ description: string; location?: string | null; condition?: string | null }>;
  adjoiners?: Array<{ description: string; direction?: string | null; deed_reference?: string | null }>;
  easements?: DeepAnalysisEasement[];
  setbacks?: Array<{ type: string; distance_ft?: number | null; description?: string | null }>;
  rights_of_way?: Array<{ road_name?: string | null; width_ft?: number | null; taking_line?: string | null }>;
  deed_references?: Array<{ volume?: string | null; page?: string | null; instrument?: string | null; county?: string | null; description?: string | null }>;
  surveyor_info?: {
    company?: string | null;
    rpls_name?: string | null;
    rpls_number?: string | null;
    survey_date?: string | null;
  };
  exceptions_reservations?: string[];
  notes?: string | null;
  completeness_score?: number;
}

/** Result of AI deep-analysis on a plat document */
export interface PlatAnalysis {
  plat_type?: string;
  name?: string | null;
  replat_of?: string | null;
  county?: string | null;
  city?: string | null;
  state?: string | null;
  instrument_number?: string | null;
  volume?: string | null;
  page?: string | null;
  recording_date?: string | null;
  scale?: string | null;
  surveyor?: {
    company?: string | null;
    rpls_name?: string | null;
    rpls_number?: string | null;
    survey_date?: string | null;
  };
  total_area_acres?: number | null;
  row_dedication_acres?: number | null;
  net_area_acres?: number | null;
  lots?: DeepAnalysisLot[];
  blocks?: Array<{ block: string; lot_count?: number | null }>;
  perimeter_calls?: DeepAnalysisCall[];
  streets?: Array<{ name?: string | null; row_width_ft?: number | null; pavement_width_ft?: number | null; type?: string | null }>;
  easements?: DeepAnalysisEasement[];
  building_setback_lines?: {
    front_ft?: number | null;
    side_ft?: number | null;
    rear_ft?: number | null;
    corner_side_ft?: number | null;
    notes?: string | null;
  };
  monuments?: Array<{ type?: string | null; description?: string | null }>;
  flood_zone?: { zone?: string | null; firm_panel?: string | null; firm_date?: string | null };
  restrictions?: string[];
  certificates?: string[];
  notes?: string | null;
  completeness_score?: number;
}

export interface DeepDocumentAnalysis {
  document_id: string;
  document_type: DocumentType;
  analysis_type: 'legal_description' | 'plat' | 'unsupported';
  legal_description?: LegalDescriptionAnalysis;
  plat?: PlatAnalysis;
  analyzed_at: string;
  error?: string;
}

// ── Verification & Comparison ────────────────────────────────────────────────

export interface PersistingIssue {
  severity: DiscrepancySeverity;
  title: string;
  description: string;
  recommendation: string;
}

export interface ComparisonResult {
  overall_confidence: number;
  confidence_breakdown: {
    boundary_accuracy: number;
    monument_accuracy: number;
    easement_accuracy: number;
    area_accuracy: number;
    closure_quality: number;
  };
  persisting_issues: PersistingIssue[];
  comparison_notes: string;
  math_checks: MathCheckSummary;
  ran_at: string;
}

export interface MathCheckSummary {
  closure_precision: number | null;
  closure_misclosure_ft: number | null;
  area_computed_acres: number | null;
  area_stated_acres: number | null;
  area_difference_acres: number | null;
  calls_verified: number;
  calls_total: number;
  continuity_ok: boolean;
}

// ── Export ───────────────────────────────────────────────────────────────────

export type ExportFormat = 'svg' | 'json' | 'png' | 'pdf' | 'dxf';

export interface ExportResult {
  format: ExportFormat;
  filename: string;
  url?: string;
  blob_data?: string; // base64-encoded for client-side downloads
  size_bytes: number;
}

// ── API Request/Response Types ───────────────────────────────────────────────

export interface CreateResearchProjectRequest {
  name: string;
  description?: string;
  property_address?: string;
  county?: string;
  state?: string;
  job_id?: string;
}

export interface ResearchProjectWithStats extends ResearchProject {
  document_count?: number;
  data_point_count?: number;
  discrepancy_count?: number;
  resolved_count?: number;
}
