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
  created_at: string;
  updated_at: string;
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
  opacity: number;
  fontSize?: number;
  fontFamily?: string;
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
  | 'usgs';            // USGS topo/elevation

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
