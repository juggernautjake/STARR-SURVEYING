// lib/research/cross-validation.service.ts — Cross-validation tracker & evidence graph
//
// Every piece of extracted data gets a unique DataAtom — a tagged, traceable unit
// of information with a source, confidence, and validation state. DataAtoms are
// cross-checked against each other: when two atoms from different sources agree,
// both get a confidence boost. When they conflict, both get flagged.
//
// The validation graph tracks:
//   - What was found (the value)
//   - Where it was found (source document, method, location)
//   - How confident we are (0–100)
//   - What confirms it (atom IDs that agree)
//   - What contradicts it (atom IDs that conflict)
//   - Resolution status (unvalidated → confirmed / conflicted / overridden)

import { callAI } from './ai-client';
import type { PromptKey } from './prompts';

// ── Data Atom ────────────────────────────────────────────────────────────────

/** Categories of information we track and cross-validate */
export type AtomCategory =
  | 'property_id'        // CAD property ID
  | 'owner_name'         // Current owner
  | 'situs_address'      // Property address
  | 'legal_description'  // Full legal description text
  | 'lot_number'         // Lot number (e.g. "Lot 7")
  | 'block_number'       // Block number (e.g. "Block 2")
  | 'subdivision_name'   // Subdivision name
  | 'abstract_number'    // Abstract survey number
  | 'survey_name'        // Original survey name
  | 'acreage'            // Stated acreage
  | 'deed_reference'     // Deed volume/page
  | 'plat_reference'     // Plat cabinet/slide or volume/page
  | 'bearing'            // Individual bearing call
  | 'distance'           // Individual distance call
  | 'boundary_call'      // Combined bearing + distance
  | 'monument'           // Monument description
  | 'point_of_beginning' // POB description
  | 'easement'           // Easement description
  | 'flood_zone'         // FEMA flood zone
  | 'city_name'          // City / jurisdiction
  | 'school_district'    // School district
  | 'market_value'       // Market value
  | 'land_value'         // Land value
  | 'improvement_value'  // Improvement value
  | 'lot_identification' // Which lot the address is on (from visual comparison)
  | 'pin_location'       // Geocoded pin coordinates
  | 'parcel_geometry'    // Parcel boundary geometry
  | 'other';

/** Source method that produced this atom */
export type AtomSource =
  | 'arcgis_query'       // Bell CAD ArcGIS FeatureServer query
  | 'trueautomation_api' // TrueAutomation JSON API
  | 'esearch_html'       // eSearch portal HTML scrape
  | 'deed_text'          // Extracted from deed document text
  | 'plat_text'          // Extracted from plat document text
  | 'plat_image'         // Extracted from plat image via OCR/Vision
  | 'survey_text'        // Extracted from survey document
  | 'google_maps'        // Google Maps geocoding/imagery
  | 'nominatim'          // Nominatim geocoding
  | 'usgs_imagery'       // USGS satellite/topo
  | 'fema_service'       // FEMA flood zone service
  | 'ai_vision'          // AI visual analysis of images
  | 'ai_extraction'      // AI text extraction/parsing
  | 'ai_comparison'      // AI cross-comparison analysis
  | 'user_input'         // User-provided data
  | 'manual_entry';      // Manually entered by researcher

/** Validation state of a DataAtom */
export type ValidationState =
  | 'unvalidated'  // Not yet checked against other sources
  | 'confirmed'    // Confirmed by at least one other independent source
  | 'conflicted'   // Conflicts with another source (needs resolution)
  | 'overridden'   // User manually overrode the value
  | 'rejected';    // Determined to be incorrect

/** Severity of a conflict between two atoms */
export type ConflictSeverity =
  | 'trivial'      // Formatting difference only (no real conflict)
  | 'minor'        // Small difference, likely rounding (e.g. 1.23 vs 1.24 acres)
  | 'moderate'     // Meaningful difference that needs human review
  | 'major'        // Significant conflict — one source is wrong
  | 'critical';    // Contradictory values — must be resolved before proceeding

/**
 * A DataAtom is the smallest trackable unit of extracted information.
 * Every piece of data we extract gets an atom with full provenance.
 */
export interface DataAtom {
  /** Unique identifier: `atom_{category}_{source}_{timestamp}_{random}` */
  id: string;
  /** What kind of data this is */
  category: AtomCategory;
  /** The extracted value (string representation) */
  value: string;
  /** Structured/normalized value for comparison */
  normalized: Record<string, unknown> | null;
  /** Where this data came from */
  source: AtomSource;
  /** Source document ID (if applicable) */
  source_document_id: string | null;
  /** Specific location within the source (page, section, field name) */
  source_location: string | null;
  /** The URL or endpoint that produced this data */
  source_url: string | null;
  /** Extraction method detail (e.g. "ArcGIS query prop_id=12345") */
  extraction_method: string;
  /** Confidence in this individual extraction (0–100) */
  confidence: number;
  /** Why this confidence level */
  confidence_reasoning: string;
  /** Current validation state */
  validation_state: ValidationState;
  /** IDs of atoms that confirm this value */
  confirmed_by: string[];
  /** IDs of atoms that conflict with this value */
  conflicted_by: string[];
  /** ISO timestamp when this atom was created */
  created_at: string;
  /** Pipeline step that created this atom (e.g. "step_5c_arcgis", "step_6_ai_extraction") */
  pipeline_step: string;
}

/**
 * A conflict record between two DataAtoms.
 */
export interface AtomConflict {
  /** Unique conflict ID */
  id: string;
  /** The two atoms that conflict */
  atom_a_id: string;
  atom_b_id: string;
  /** Category of data in conflict */
  category: AtomCategory;
  /** How severe is the conflict */
  severity: ConflictSeverity;
  /** What exactly differs */
  description: string;
  /** AI-generated analysis of the conflict */
  analysis: string | null;
  /** AI recommendation for resolution */
  recommendation: string | null;
  /** Whether this has been resolved */
  resolved: boolean;
  /** How it was resolved (if resolved) */
  resolution: string | null;
  /** Which atom was chosen as correct (if resolved) */
  chosen_atom_id: string | null;
}

/**
 * A confirmation record between two DataAtoms.
 */
export interface AtomConfirmation {
  /** The two atoms that agree */
  atom_a_id: string;
  atom_b_id: string;
  /** Category of data confirmed */
  category: AtomCategory;
  /** How closely they match (0–100) */
  match_score: number;
  /** Description of how they match */
  description: string;
}

/**
 * The full validation graph for a research project.
 */
export interface ValidationGraph {
  /** All tracked data atoms */
  atoms: DataAtom[];
  /** All detected conflicts */
  conflicts: AtomConflict[];
  /** All detected confirmations */
  confirmations: AtomConfirmation[];
  /** Summary statistics */
  summary: {
    total_atoms: number;
    confirmed_count: number;
    conflicted_count: number;
    unvalidated_count: number;
    overall_confidence: number;
    categories_with_conflicts: AtomCategory[];
    critical_conflicts: number;
  };
}

// ── Atom Factory ─────────────────────────────────────────────────────────────

let atomCounter = 0;

/**
 * Create a new DataAtom with a unique ID.
 */
export function createAtom(params: {
  category: AtomCategory;
  value: string;
  normalized?: Record<string, unknown> | null;
  source: AtomSource;
  source_document_id?: string | null;
  source_location?: string | null;
  source_url?: string | null;
  extraction_method: string;
  confidence: number;
  confidence_reasoning: string;
  pipeline_step: string;
}): DataAtom {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 6);
  atomCounter++;

  return {
    id: `atom_${params.category}_${params.source}_${ts}_${rand}_${atomCounter}`,
    category: params.category,
    value: params.value,
    normalized: params.normalized ?? null,
    source: params.source,
    source_document_id: params.source_document_id ?? null,
    source_location: params.source_location ?? null,
    source_url: params.source_url ?? null,
    extraction_method: params.extraction_method,
    confidence: Math.max(0, Math.min(100, params.confidence)),
    confidence_reasoning: params.confidence_reasoning,
    validation_state: 'unvalidated',
    confirmed_by: [],
    conflicted_by: [],
    created_at: new Date().toISOString(),
    pipeline_step: params.pipeline_step,
  };
}

// ── Cross-Validation Engine ──────────────────────────────────────────────────

/**
 * Compare two string values for approximate equality.
 * Handles common variations: case, whitespace, abbreviations, punctuation.
 */
function normalizeForComparison(value: string): string {
  return value
    .toUpperCase()
    .replace(/[.,;:'"()\-\/\\]/g, ' ')
    .replace(/\b(STREET|ST)\b/g, 'ST')
    .replace(/\b(DRIVE|DR)\b/g, 'DR')
    .replace(/\b(AVENUE|AVE)\b/g, 'AVE')
    .replace(/\b(BOULEVARD|BLVD)\b/g, 'BLVD')
    .replace(/\b(ROAD|RD)\b/g, 'RD')
    .replace(/\b(LANE|LN)\b/g, 'LN')
    .replace(/\b(LOT|LT)\b/g, 'LT')
    .replace(/\b(BLOCK|BLK)\b/g, 'BLK')
    .replace(/\b(VOLUME|VOL)\b/g, 'VOL')
    .replace(/\b(PAGE|PG)\b/g, 'PG')
    .replace(/\b(CABINET|CAB)\b/g, 'CAB')
    .replace(/\b(SLIDE|SLD)\b/g, 'SLD')
    .replace(/\b(ADDITION|ADDN|ADD)\b/g, 'ADD')
    .replace(/\b(SUBDIVISION|SUBD|SUB)\b/g, 'SUB')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Compare two numeric values with tolerance.
 */
function numericMatch(a: string, b: string, tolerancePercent = 2): { match: boolean; diff: number } {
  const numA = parseFloat(a);
  const numB = parseFloat(b);
  if (isNaN(numA) || isNaN(numB)) return { match: false, diff: Infinity };
  const diff = Math.abs(numA - numB);
  const avg = (Math.abs(numA) + Math.abs(numB)) / 2;
  const pctDiff = avg > 0 ? (diff / avg) * 100 : (diff === 0 ? 0 : 100);
  return { match: pctDiff <= tolerancePercent, diff: pctDiff };
}

/**
 * Determine conflict severity based on category and difference.
 */
function assessConflictSeverity(
  category: AtomCategory,
  atomA: DataAtom,
  atomB: DataAtom,
): { severity: ConflictSeverity; description: string } {
  const normA = normalizeForComparison(atomA.value);
  const normB = normalizeForComparison(atomB.value);

  // Exact match after normalization — trivial
  if (normA === normB) {
    return { severity: 'trivial', description: 'Values match after normalization (formatting difference only)' };
  }

  // Numeric categories: check tolerance
  const numericCategories: AtomCategory[] = ['acreage', 'market_value', 'land_value', 'improvement_value'];
  if (numericCategories.includes(category)) {
    const { match, diff } = numericMatch(atomA.value, atomB.value);
    if (match) {
      return { severity: 'minor', description: `Numeric values differ by ${diff.toFixed(2)}% (within tolerance)` };
    }
    if (diff < 10) {
      return { severity: 'moderate', description: `Numeric values differ by ${diff.toFixed(2)}%` };
    }
    return { severity: 'major', description: `Numeric values differ by ${diff.toFixed(2)}% — significant discrepancy` };
  }

  // Identity categories: any difference is significant
  const identityCategories: AtomCategory[] = ['property_id', 'lot_number', 'block_number', 'lot_identification'];
  if (identityCategories.includes(category)) {
    return { severity: 'critical', description: `${category} values differ: "${atomA.value}" vs "${atomB.value}" — must be resolved` };
  }

  // Substring match — moderate
  if (normA.includes(normB) || normB.includes(normA)) {
    return { severity: 'minor', description: 'One value is a subset of the other' };
  }

  // Default
  return { severity: 'moderate', description: `Values differ: "${atomA.value}" vs "${atomB.value}"` };
}

/**
 * Run cross-validation across all atoms in the graph.
 * Compares every pair of atoms with the same category from different sources.
 * Updates validation states, confirmed_by, and conflicted_by arrays.
 */
export function crossValidateAtoms(graph: ValidationGraph): void {
  // Group atoms by category
  const byCategory = new Map<AtomCategory, DataAtom[]>();
  for (const atom of graph.atoms) {
    const list = byCategory.get(atom.category) || [];
    list.push(atom);
    byCategory.set(atom.category, list);
  }

  // Compare atoms within each category
  for (const [category, atoms] of byCategory) {
    for (let i = 0; i < atoms.length; i++) {
      for (let j = i + 1; j < atoms.length; j++) {
        const a = atoms[i];
        const b = atoms[j];

        // Skip same-source comparisons
        if (a.source === b.source && a.source_document_id === b.source_document_id) continue;

        const normA = normalizeForComparison(a.value);
        const normB = normalizeForComparison(b.value);

        // Check numeric match for numeric categories
        const numericCategories: AtomCategory[] = ['acreage', 'market_value', 'land_value', 'improvement_value'];
        let isMatch = normA === normB;
        let matchScore = isMatch ? 100 : 0;

        if (!isMatch && numericCategories.includes(category)) {
          const { match, diff } = numericMatch(a.value, b.value);
          isMatch = match;
          matchScore = match ? Math.max(0, 100 - diff * 10) : 0;
        }

        // Substring containment
        if (!isMatch && (normA.includes(normB) || normB.includes(normA))) {
          isMatch = true;
          const shorter = Math.min(normA.length, normB.length);
          const longer = Math.max(normA.length, normB.length);
          matchScore = Math.round((shorter / longer) * 90);
        }

        if (isMatch) {
          // Confirmation
          a.confirmed_by.push(b.id);
          b.confirmed_by.push(a.id);
          a.validation_state = 'confirmed';
          b.validation_state = 'confirmed';
          // Boost confidence slightly for confirmation
          a.confidence = Math.min(100, a.confidence + 5);
          b.confidence = Math.min(100, b.confidence + 5);

          graph.confirmations.push({
            atom_a_id: a.id,
            atom_b_id: b.id,
            category,
            match_score: matchScore,
            description: `"${a.value}" matches "${b.value}" (sources: ${a.source} vs ${b.source})`,
          });
        } else {
          // Conflict
          const { severity, description } = assessConflictSeverity(category, a, b);

          // Don't flag trivial conflicts
          if (severity === 'trivial') continue;

          a.conflicted_by.push(b.id);
          b.conflicted_by.push(a.id);
          if (a.validation_state !== 'confirmed') a.validation_state = 'conflicted';
          if (b.validation_state !== 'confirmed') b.validation_state = 'conflicted';
          // Reduce confidence for conflicts
          const penalty = severity === 'critical' ? 20 : severity === 'major' ? 15 : severity === 'moderate' ? 10 : 5;
          a.confidence = Math.max(0, a.confidence - penalty);
          b.confidence = Math.max(0, b.confidence - penalty);

          graph.conflicts.push({
            id: `conflict_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            atom_a_id: a.id,
            atom_b_id: b.id,
            category,
            severity,
            description,
            analysis: null,
            recommendation: null,
            resolved: false,
            resolution: null,
            chosen_atom_id: null,
          });
        }
      }
    }
  }

  // Update summary
  graph.summary = computeGraphSummary(graph);
}

/**
 * Compute summary statistics for the validation graph.
 */
function computeGraphSummary(graph: ValidationGraph): ValidationGraph['summary'] {
  const total = graph.atoms.length;
  const confirmed = graph.atoms.filter(a => a.validation_state === 'confirmed').length;
  const conflicted = graph.atoms.filter(a => a.validation_state === 'conflicted').length;
  const unvalidated = graph.atoms.filter(a => a.validation_state === 'unvalidated').length;

  const categoriesWithConflicts = [...new Set(
    graph.conflicts.filter(c => !c.resolved).map(c => c.category),
  )];

  const criticalConflicts = graph.conflicts.filter(
    c => !c.resolved && (c.severity === 'critical' || c.severity === 'major'),
  ).length;

  // Overall confidence: weighted average of all atom confidences,
  // penalized by unresolved critical conflicts
  const avgConfidence = total > 0
    ? graph.atoms.reduce((sum, a) => sum + a.confidence, 0) / total
    : 0;
  const conflictPenalty = criticalConflicts * 5;
  const overall = Math.max(0, Math.min(100, avgConfidence - conflictPenalty));

  return {
    total_atoms: total,
    confirmed_count: confirmed,
    conflicted_count: conflicted,
    unvalidated_count: unvalidated,
    overall_confidence: Math.round(overall),
    categories_with_conflicts: categoriesWithConflicts,
    critical_conflicts: criticalConflicts,
  };
}

/**
 * Create an empty validation graph.
 */
export function createValidationGraph(): ValidationGraph {
  return {
    atoms: [],
    conflicts: [],
    confirmations: [],
    summary: {
      total_atoms: 0,
      confirmed_count: 0,
      conflicted_count: 0,
      unvalidated_count: 0,
      overall_confidence: 0,
      categories_with_conflicts: [],
      critical_conflicts: 0,
    },
  };
}

/**
 * Add an atom to the graph and immediately cross-validate it
 * against all existing atoms of the same category.
 */
export function addAtomAndValidate(graph: ValidationGraph, atom: DataAtom): void {
  graph.atoms.push(atom);
  // Re-run full cross-validation (efficient enough for typical graph sizes < 500 atoms)
  graph.conflicts = [];
  graph.confirmations = [];
  for (const a of graph.atoms) {
    a.confirmed_by = [];
    a.conflicted_by = [];
    a.validation_state = 'unvalidated';
  }
  crossValidateAtoms(graph);
}

// ── AI-Powered Conflict Analysis ─────────────────────────────────────────────

/**
 * Use AI to analyze unresolved conflicts and recommend resolutions.
 * Only analyzes moderate/major/critical conflicts.
 */
export async function analyzeConflictsWithAI(
  graph: ValidationGraph,
): Promise<void> {
  const unresolvedConflicts = graph.conflicts.filter(
    c => !c.resolved && c.severity !== 'trivial' && c.severity !== 'minor',
  );

  if (unresolvedConflicts.length === 0) return;

  // Build a summary of all conflicts for the AI
  const conflictDescriptions = unresolvedConflicts.map(c => {
    const atomA = graph.atoms.find(a => a.id === c.atom_a_id);
    const atomB = graph.atoms.find(a => a.id === c.atom_b_id);
    if (!atomA || !atomB) return null;

    return {
      conflict_id: c.id,
      category: c.category,
      severity: c.severity,
      value_a: atomA.value,
      source_a: atomA.source,
      confidence_a: atomA.confidence,
      method_a: atomA.extraction_method,
      confirmations_a: atomA.confirmed_by.length,
      value_b: atomB.value,
      source_b: atomB.source,
      confidence_b: atomB.confidence,
      method_b: atomB.extraction_method,
      confirmations_b: atomB.confirmed_by.length,
      description: c.description,
    };
  }).filter(Boolean);

  try {
    const result = await callAI({
      promptKey: 'CROSS_REFERENCE_ANALYZER' as PromptKey,
      userContent: [
        'Analyze these data conflicts found during property research cross-validation.',
        'For each conflict, determine which value is more likely correct and why.',
        'Consider source reliability (official records > scraped data > AI extraction),',
        'number of independent confirmations, and the nature of the discrepancy.',
        '',
        'Return a JSON object: { "analyses": [{ "conflict_id": "...", "analysis": "...",',
        '"recommendation": "...", "preferred_value": "a" or "b" or "neither" }] }',
        '',
        JSON.stringify(conflictDescriptions, null, 2),
      ].join('\n'),
      maxTokens: 4096,
      timeoutMs: 60_000,
    });

    const data = result.response as {
      analyses?: Array<{
        conflict_id: string;
        analysis: string;
        recommendation: string;
        preferred_value?: 'a' | 'b' | 'neither';
      }>;
    };

    if (Array.isArray(data?.analyses)) {
      for (const analysis of data.analyses) {
        const conflict = graph.conflicts.find(c => c.id === analysis.conflict_id);
        if (conflict) {
          conflict.analysis = analysis.analysis;
          conflict.recommendation = analysis.recommendation;
        }
      }
    }
  } catch {
    // AI analysis is non-critical — conflicts still stand without AI analysis
  }
}

// ── Convenience: Extract atoms from Bell CAD ArcGIS data ─────────────────────

/**
 * Create DataAtoms from a Bell CAD ArcGIS parcel context.
 * This is the entry point for populating the validation graph
 * with data from the ArcGIS FeatureServer.
 */
export function atomsFromArcGisParcel(
  parcel: {
    prop_id: number;
    file_as_name: string;
    situs_address: string;
    legal_acreage: number | null;
    full_legal_description: string;
    tract_or_lot: string | null;
    block: string | null;
    abs_subdv_cd: string | null;
    market: number | null;
    land_val: number | null;
    imprv_val: number | null;
    deed_reference: string;
    geo_id: string | null;
    school: string | null;
    city: string | null;
  },
  context?: {
    abstract?: { anum: string | null; survey_name: string | null } | null;
    subdivision?: { code: string | null; description: string | null } | null;
    city_name?: string | null;
    school_district?: string | null;
    flood_zones?: Array<{ fld_zone: string | null }>;
  } | null,
): DataAtom[] {
  const atoms: DataAtom[] = [];
  const step = 'arcgis_parcel_fetch';
  const src: AtomSource = 'arcgis_query';
  const method = `ArcGIS FeatureServer query prop_id=${parcel.prop_id}`;
  const baseConf = 88; // ArcGIS is an official county data source

  atoms.push(createAtom({
    category: 'property_id', value: String(parcel.prop_id),
    source: src, extraction_method: method,
    confidence: 95, confidence_reasoning: 'Direct query result from official county GIS',
    pipeline_step: step,
  }));

  if (parcel.file_as_name) {
    atoms.push(createAtom({
      category: 'owner_name', value: parcel.file_as_name,
      source: src, extraction_method: method,
      confidence: baseConf, confidence_reasoning: 'Owner name from county GIS database',
      pipeline_step: step,
    }));
  }

  if (parcel.situs_address) {
    atoms.push(createAtom({
      category: 'situs_address', value: parcel.situs_address,
      source: src, extraction_method: method,
      confidence: baseConf, confidence_reasoning: 'Situs address from county GIS',
      pipeline_step: step,
    }));
  }

  if (parcel.full_legal_description) {
    atoms.push(createAtom({
      category: 'legal_description', value: parcel.full_legal_description,
      source: src, extraction_method: method,
      confidence: 82, confidence_reasoning: 'Legal description from GIS — may be abbreviated',
      pipeline_step: step,
    }));
  }

  if (parcel.tract_or_lot) {
    atoms.push(createAtom({
      category: 'lot_number', value: parcel.tract_or_lot,
      source: src, extraction_method: method,
      confidence: baseConf, confidence_reasoning: 'Lot/tract from county GIS database',
      pipeline_step: step,
    }));
  }

  if (parcel.block) {
    atoms.push(createAtom({
      category: 'block_number', value: parcel.block,
      source: src, extraction_method: method,
      confidence: baseConf, confidence_reasoning: 'Block number from county GIS database',
      pipeline_step: step,
    }));
  }

  if (parcel.legal_acreage != null) {
    atoms.push(createAtom({
      category: 'acreage', value: String(parcel.legal_acreage),
      normalized: { value: parcel.legal_acreage, unit: 'acres' },
      source: src, extraction_method: method,
      confidence: baseConf, confidence_reasoning: 'Legal acreage from county GIS',
      pipeline_step: step,
    }));
  }

  if (parcel.deed_reference) {
    atoms.push(createAtom({
      category: 'deed_reference', value: parcel.deed_reference,
      source: src, extraction_method: method,
      confidence: baseConf, confidence_reasoning: 'Deed reference from county GIS',
      pipeline_step: step,
    }));
  }

  if (parcel.market != null) {
    atoms.push(createAtom({
      category: 'market_value', value: String(parcel.market),
      normalized: { value: parcel.market, currency: 'USD' },
      source: src, extraction_method: method,
      confidence: baseConf, confidence_reasoning: 'Market value from county appraisal',
      pipeline_step: step,
    }));
  }

  if (parcel.city) {
    atoms.push(createAtom({
      category: 'city_name', value: parcel.city,
      source: src, extraction_method: method,
      confidence: baseConf, confidence_reasoning: 'City from parcel attributes',
      pipeline_step: step,
    }));
  }

  if (parcel.school) {
    atoms.push(createAtom({
      category: 'school_district', value: parcel.school,
      source: src, extraction_method: method,
      confidence: baseConf, confidence_reasoning: 'School district from parcel attributes',
      pipeline_step: step,
    }));
  }

  // Context layers
  if (context?.abstract?.anum) {
    atoms.push(createAtom({
      category: 'abstract_number', value: context.abstract.anum,
      source: src, extraction_method: 'ArcGIS spatial query — Abstracts layer',
      confidence: 90, confidence_reasoning: 'Abstract from spatial overlay on county GIS',
      pipeline_step: step,
    }));
  }

  if (context?.abstract?.survey_name) {
    atoms.push(createAtom({
      category: 'survey_name', value: context.abstract.survey_name,
      source: src, extraction_method: 'ArcGIS spatial query — Abstracts layer',
      confidence: 90, confidence_reasoning: 'Survey name from spatial overlay on county GIS',
      pipeline_step: step,
    }));
  }

  if (context?.subdivision?.description) {
    atoms.push(createAtom({
      category: 'subdivision_name', value: context.subdivision.description,
      source: src, extraction_method: 'ArcGIS spatial query — Subdivisions layer',
      confidence: 90, confidence_reasoning: 'Subdivision from spatial overlay on county GIS',
      pipeline_step: step,
    }));
  }

  if (context?.city_name) {
    atoms.push(createAtom({
      category: 'city_name', value: context.city_name,
      source: 'arcgis_query', extraction_method: 'ArcGIS spatial query — City Limits layer',
      confidence: 92, confidence_reasoning: 'City from official city limits boundary overlay',
      pipeline_step: step,
    }));
  }

  if (context?.school_district) {
    atoms.push(createAtom({
      category: 'school_district', value: context.school_district,
      source: 'arcgis_query', extraction_method: 'ArcGIS spatial query — School Districts layer',
      confidence: 92, confidence_reasoning: 'School district from boundary overlay',
      pipeline_step: step,
    }));
  }

  if (context?.flood_zones) {
    for (const fz of context.flood_zones) {
      if (fz.fld_zone) {
        atoms.push(createAtom({
          category: 'flood_zone', value: fz.fld_zone,
          source: 'fema_service', extraction_method: 'FEMA NFHL spatial query',
          confidence: 90, confidence_reasoning: 'FEMA flood zone from official NFHL service',
          pipeline_step: step,
        }));
      }
    }
  }

  return atoms;
}
