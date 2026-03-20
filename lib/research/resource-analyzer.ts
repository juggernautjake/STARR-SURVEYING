// lib/research/resource-analyzer.ts — Deep per-resource analysis engine
//
// Analyzes each resource (screenshot, document, data query result) against the
// full extraction objectives checklist. Uses AI vision + OCR + programmatic
// methods to extract every possible data point, then generates a summary.

import { callAI } from './ai-client';
import {
  type ResourceType,
  type ObjectiveOutcome,
  type ResourceExtractionReport,
  getObjectivesForResource,
  buildExtractionPrompt,
  calculateExtractionScore,
} from './extraction-objectives';
import type { DataAtom, AtomCategory, AtomSource } from './cross-validation.service';

// ── Types ────────────────────────────────────────────────────────────────────

export interface AnalysisInput {
  /** Unique ID for this resource (artifact ID, URL, etc.) */
  resource_id: string;
  /** Human-readable label */
  resource_label: string;
  /** Resource type for objective selection */
  resource_type: ResourceType;
  /** Image data: base64 or URL for visual analysis */
  image_data?: string;
  /** Image media type (e.g., 'image/png') */
  image_media_type?: string;
  /** Text content (OCR output, document text, query results) */
  text_content?: string;
  /** Structured data already extracted (e.g., ArcGIS parcel attributes) */
  structured_data?: Record<string, unknown>;
  /** Source URL */
  source_url?: string;
  /** What pipeline step produced this resource */
  pipeline_step?: string;
}

export interface AnalysisResult {
  /** The full extraction report for this resource */
  report: ResourceExtractionReport;
  /** DataAtoms created from this resource's extractions */
  atoms: DataAtom[];
  /** Raw AI response for debugging */
  raw_ai_response?: string;
}

// ── AI Analysis Prompt ───────────────────────────────────────────────────────

function buildAnalysisSystemPrompt(resourceType: ResourceType): string {
  const extractionObjectives = buildExtractionPrompt(resourceType);

  return `You are a Texas Registered Professional Land Surveyor (RPLS) conducting an exhaustive analysis of a surveying resource. Your job is to extract EVERY piece of useful information.

${extractionObjectives}

## ANALYSIS INSTRUCTIONS:

1. **Examine the entire resource** — scan every region, label, dimension, text block, and visual element.
2. **For each extraction objective**, report whether the information was found, not found, partially found, or not applicable.
3. **Extract exact values** — preserve original notation, units, symbols, abbreviations.
4. **Note interesting observations** — anything unusual, noteworthy, or potentially important even if not in the objectives list.
5. **Generate a detailed summary** — describe what this resource shows, what key data was extracted, and what could NOT be found.

## RESPONSE FORMAT (JSON):

{
  "objectives": [
    {
      "objective_id": "lot_number",
      "result": "found",
      "extracted_values": ["Lot 7"],
      "confidence": 95,
      "notes": "Clearly labeled on parcel"
    },
    {
      "objective_id": "easements",
      "result": "not_found",
      "extracted_values": [],
      "confidence": 0,
      "notes": "No easement lines or labels visible at this zoom level"
    }
  ],
  "summary": "This GIS map screenshot shows the parcel at 123 Oak St with clear lot/block labels. The target lot (Lot 7, Block 2) is highlighted in yellow. Adjacent lots 6 and 8 are visible with their property IDs. Street frontage appears to be approximately 100 feet. No easements or setback lines are shown in this layer view.",
  "interesting_findings": [
    "The lot appears to be irregularly shaped on the north side, possibly following a creek",
    "Property ID 123456 has a different lot numbering style than surrounding parcels",
    "There appears to be an unlabeled narrow strip between lots 7 and 8"
  ],
  "all_text_visible": ["Lot 7", "Block 2", "Oak Hills Subdivision", "123 Oak St"],
  "all_dimensions_visible": ["100.00'", "140.52'"],
  "all_labels_visible": ["PropID: 123456", "0.321 ac"]
}

CRITICAL: You MUST include an entry for EVERY objective ID that is applicable to this resource type. Do not skip any.
For image resources, describe what you see in extreme detail including colors, line styles, labels, and spatial relationships.`;
}

// ── Core Analysis Function ───────────────────────────────────────────────────

/**
 * Perform deep analysis of a single resource against all extraction objectives.
 *
 * @param input - The resource to analyze
 * @returns Analysis result with extraction report, atoms, and raw AI response
 */
export async function analyzeResource(input: AnalysisInput): Promise<AnalysisResult> {
  const objectives = getObjectivesForResource(input.resource_type);
  const systemPrompt = buildAnalysisSystemPrompt(input.resource_type);

  // Build the user content based on what's available
  const userParts: Array<{ type: string; [key: string]: unknown }> = [];

  // Add image if available
  if (input.image_data) {
    const mediaType = input.image_media_type || 'image/png';
    // Check if it's a URL or base64
    if (input.image_data.startsWith('http')) {
      userParts.push({
        type: 'image',
        source: { type: 'url', url: input.image_data },
      });
    } else {
      userParts.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: mediaType,
          data: input.image_data,
        },
      });
    }
  }

  // Build text context
  const textSections: string[] = [];
  textSections.push(`RESOURCE: ${input.resource_label}`);
  textSections.push(`TYPE: ${input.resource_type}`);
  if (input.source_url) textSections.push(`SOURCE URL: ${input.source_url}`);

  if (input.text_content) {
    textSections.push(`\n--- DOCUMENT TEXT ---\n${input.text_content}`);
  }

  if (input.structured_data) {
    textSections.push(`\n--- STRUCTURED DATA ---\n${JSON.stringify(input.structured_data, null, 2)}`);
  }

  textSections.push(`\nAnalyze this resource against ALL ${objectives.length} extraction objectives. Return JSON response.`);

  userParts.push({ type: 'text', text: textSections.join('\n') });

  // Call AI
  let aiResponse: string = '';
  let parsedResponse: {
    objectives?: ObjectiveOutcome[];
    summary?: string;
    interesting_findings?: string[];
    all_text_visible?: string[];
    all_dimensions_visible?: string[];
    all_labels_visible?: string[];
  } = {};

  try {
    const result = await callAI({
      promptKey: 'DATA_EXTRACTOR',
      userContent: userParts as unknown as Parameters<typeof callAI>[0]['userContent'],
      maxTokens: 8192,
      timeoutMs: 180_000,
    });

    aiResponse = result.raw;

    // Parse JSON from response (handle markdown code blocks)
    const jsonMatch = aiResponse.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/) || [null, aiResponse];
    const jsonStr = jsonMatch[1] || aiResponse;
    parsedResponse = JSON.parse(jsonStr.trim());
  } catch (err) {
    // If AI fails, create a fallback report with all objectives as not_found
    console.error(`[resource-analyzer] AI analysis failed for ${input.resource_id}:`, err);
    parsedResponse = {
      objectives: objectives.map(obj => ({
        objective_id: obj.id,
        result: 'not_found' as const,
        extracted_values: [],
        confidence: 0,
        notes: `AI analysis failed: ${err instanceof Error ? err.message : 'unknown error'}`,
      })),
      summary: `Analysis failed for ${input.resource_label}. Manual review required.`,
      interesting_findings: [],
    };
  }

  // Map AI response objectives to our full objectives list (fill gaps)
  const aiObjectiveMap = new Map(
    (parsedResponse.objectives || []).map(o => [o.objective_id, o]),
  );

  const fullOutcomes: ObjectiveOutcome[] = objectives.map(obj => {
    const aiResult = aiObjectiveMap.get(obj.id);
    if (aiResult) return aiResult;
    return {
      objective_id: obj.id,
      result: 'not_found' as const,
      extracted_values: [],
      confidence: 0,
      notes: 'Not reported by AI analysis',
    };
  });

  // Calculate extraction score
  const score = calculateExtractionScore(fullOutcomes, input.resource_type);

  // Build atoms from found objectives
  const atoms = buildAtomsFromOutcomes(fullOutcomes, input);

  // Build the final report
  const report: ResourceExtractionReport = {
    resource_id: input.resource_id,
    resource_label: input.resource_label,
    resource_type: input.resource_type,
    timestamp: new Date().toISOString(),
    objectives: fullOutcomes,
    summary: parsedResponse.summary || `No summary generated for ${input.resource_label}`,
    interesting_findings: parsedResponse.interesting_findings || [],
    extraction_score: score,
  };

  return {
    report,
    atoms,
    raw_ai_response: aiResponse,
  };
}

// ── Programmatic Analysis ────────────────────────────────────────────────────

/**
 * Perform programmatic analysis of structured parcel data (no AI needed).
 * Extracts all available fields from ArcGIS/CAD query results.
 */
export function analyzeStructuredParcelData(
  data: Record<string, unknown>,
  resourceId: string,
  resourceLabel: string,
  pipelineStep: string,
): AnalysisResult {
  const objectives = getObjectivesForResource('parcel_data');
  const outcomes: ObjectiveOutcome[] = [];
  const atoms: DataAtom[] = [];
  const findings: string[] = [];

  // Map of objective_id -> extraction logic
  const extractors: Record<string, { check: () => string | null; atom_cat: AtomCategory }> = {
    property_id: { check: () => data.prop_id != null ? String(data.prop_id) : null, atom_cat: 'property_id' },
    owner_name: { check: () => data.file_as_name ? String(data.file_as_name) : null, atom_cat: 'owner_name' },
    situs_address: { check: () => data.situs_address ? String(data.situs_address) : null, atom_cat: 'situs_address' },
    lot_number: { check: () => data.tract_or_lot ? String(data.tract_or_lot) : null, atom_cat: 'lot_number' },
    block_number: { check: () => data.block ? String(data.block) : null, atom_cat: 'block_number' },
    subdivision_name: { check: () => data.abs_subdv_cd ? String(data.abs_subdv_cd) : null, atom_cat: 'subdivision_name' },
    abstract_number: { check: () => data.abstract_number ? String(data.abstract_number) : null, atom_cat: 'abstract_number' },
    acreage: { check: () => data.legal_acreage != null ? String(data.legal_acreage) : null, atom_cat: 'acreage' },
    deed_reference: { check: () => data.deed_reference ? String(data.deed_reference) : null, atom_cat: 'deed_reference' },
    legal_description: { check: () => data.full_legal_description ? String(data.full_legal_description) : null, atom_cat: 'legal_description' },
    market_value: { check: () => data.market != null ? String(data.market) : null, atom_cat: 'market_value' },
    land_value: { check: () => data.land_val != null ? String(data.land_val) : null, atom_cat: 'land_value' },
    improvement_value: { check: () => data.imprv_val != null ? String(data.imprv_val) : null, atom_cat: 'improvement_value' },
    city_name: { check: () => data.city ? String(data.city) : null, atom_cat: 'city_name' },
    school_district: { check: () => data.school ? String(data.school) : null, atom_cat: 'school_district' },
    flood_zone: { check: () => data.flood_zone ? String(data.flood_zone) : null, atom_cat: 'flood_zone' },
    deed_date: { check: () => data.deed_date ? String(data.deed_date) : null, atom_cat: 'deed_date' },
    street_names: { check: () => data.situs_street ? String(data.situs_street) : null, atom_cat: 'street_name' },
  };

  // Check shape data
  const shapeAreaSqft = data.shape_area_sqft as number | null;
  const shapeLengthFt = data.shape_length_ft as number | null;

  if (shapeAreaSqft) {
    const computedAcres = (shapeAreaSqft / 43560).toFixed(4);
    findings.push(`Computed area from geometry: ${shapeAreaSqft.toLocaleString()} sq ft (${computedAcres} acres)`);

    // Cross-check against stated acreage
    const statedAcreage = data.legal_acreage as number | null;
    if (statedAcreage) {
      const diff = Math.abs(Number(computedAcres) - statedAcreage);
      const pctDiff = (diff / statedAcreage) * 100;
      if (pctDiff > 5) {
        findings.push(`WARNING: Stated acreage (${statedAcreage}) differs from computed (${computedAcres}) by ${pctDiff.toFixed(1)}%`);
      } else {
        findings.push(`Computed acreage matches stated acreage within ${pctDiff.toFixed(1)}%`);
      }
    }
  }

  if (shapeLengthFt) {
    findings.push(`Parcel perimeter from geometry: ${shapeLengthFt.toLocaleString()} linear feet`);
    atoms.push(createAtom('distance', `${shapeLengthFt.toFixed(2)} ft (perimeter)`, 'arcgis_query', resourceId, pipelineStep));
  }

  // Create atom for computed acreage from geometry
  if (shapeAreaSqft) {
    const computedAcres = (shapeAreaSqft / 43560).toFixed(4);
    atoms.push(createAtom('acreage', `${computedAcres} acres (computed from geometry)`, 'arcgis_query', resourceId, `${pipelineStep}:geometry`));
  }

  // Check for derived URLs
  for (const urlField of ['esearch_url', 'gis_map_url', 'market_analysis_url', 'tax_statement_url']) {
    if (data[urlField]) {
      findings.push(`Available URL: ${urlField} = ${data[urlField]}`);
    }
  }

  // Run all extractors
  for (const obj of objectives) {
    const extractor = extractors[obj.id];
    if (extractor) {
      const value = extractor.check();
      if (value) {
        outcomes.push({
          objective_id: obj.id,
          result: 'found',
          extracted_values: [value],
          confidence: 90,
          notes: 'Extracted programmatically from structured data',
        });
        atoms.push(createAtom(extractor.atom_cat, value, 'arcgis_query', resourceId, pipelineStep));
      } else {
        outcomes.push({
          objective_id: obj.id,
          result: 'not_found',
          extracted_values: [],
          confidence: 0,
          notes: null,
        });
      }
    } else {
      outcomes.push({
        objective_id: obj.id,
        result: 'not_applicable',
        extracted_values: [],
        confidence: 0,
        notes: null,
      });
    }
  }

  // Add shape-related outcomes
  outcomes.push({
    objective_id: 'shape_perimeter',
    result: shapeLengthFt ? 'found' : 'not_found',
    extracted_values: shapeLengthFt ? [`${shapeLengthFt.toFixed(2)} ft`] : [],
    confidence: shapeLengthFt ? 95 : 0,
    notes: shapeLengthFt ? 'From Shape__Length geometry attribute' : null,
  });

  const score = calculateExtractionScore(outcomes, 'parcel_data');

  const foundItems = outcomes.filter(o => o.result === 'found').map(o => {
    const obj = objectives.find(ob => ob.id === o.objective_id);
    return `${obj?.label || o.objective_id}: ${o.extracted_values.join(', ')}`;
  });

  const report: ResourceExtractionReport = {
    resource_id: resourceId,
    resource_label: resourceLabel,
    resource_type: 'parcel_data',
    timestamp: new Date().toISOString(),
    objectives: outcomes,
    summary: `Structured parcel data analysis for ${resourceLabel}. Extracted ${score.total_found}/${score.total_applicable} data points (${score.percentage}%). Key data: ${foundItems.slice(0, 5).join('; ')}.`,
    interesting_findings: findings,
    extraction_score: score,
  };

  return { report, atoms };
}

// ── Batch Analysis ───────────────────────────────────────────────────────────

/**
 * Analyze multiple resources in parallel (with concurrency limit).
 */
export async function analyzeResourceBatch(
  inputs: AnalysisInput[],
  concurrency = 3,
): Promise<AnalysisResult[]> {
  const results: AnalysisResult[] = [];
  const queue = [...inputs];

  async function processNext(): Promise<void> {
    while (queue.length > 0) {
      const input = queue.shift()!;
      try {
        const result = await analyzeResource(input);
        results.push(result);
      } catch (err) {
        console.error(`[resource-analyzer] Failed to analyze ${input.resource_id}:`, err);
        // Create error report
        const objectives = getObjectivesForResource(input.resource_type);
        results.push({
          report: {
            resource_id: input.resource_id,
            resource_label: input.resource_label,
            resource_type: input.resource_type,
            timestamp: new Date().toISOString(),
            objectives: objectives.map(o => ({
              objective_id: o.id,
              result: 'not_found' as const,
              extracted_values: [],
              confidence: 0,
              notes: `Analysis error: ${err instanceof Error ? err.message : 'unknown'}`,
            })),
            summary: `Failed to analyze ${input.resource_label}: ${err instanceof Error ? err.message : 'unknown error'}`,
            interesting_findings: [],
            extraction_score: calculateExtractionScore([], input.resource_type),
          },
          atoms: [],
        });
      }
    }
  }

  // Launch concurrent workers
  const workers = Array.from({ length: Math.min(concurrency, inputs.length) }, () => processNext());
  await Promise.all(workers);

  return results;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function createAtom(
  category: AtomCategory,
  value: string,
  source: AtomSource,
  sourceDocId: string,
  pipelineStep: string,
): DataAtom {
  const id = `atom_${category}_${source}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return {
    id,
    category,
    value,
    normalized: null,
    source,
    source_document_id: sourceDocId,
    source_location: null,
    source_url: null,
    extraction_method: `resource-analyzer:${source}`,
    confidence: 85,
    confidence_reasoning: 'Extracted by resource analyzer',
    validation_state: 'unvalidated',
    confirmed_by: [],
    conflicted_by: [],
    created_at: new Date().toISOString(),
    pipeline_step: pipelineStep,
  };
}

function buildAtomsFromOutcomes(
  outcomes: ObjectiveOutcome[],
  input: AnalysisInput,
): DataAtom[] {
  const atoms: DataAtom[] = [];
  const objectives = getObjectivesForResource(input.resource_type);

  for (const outcome of outcomes) {
    if (outcome.result !== 'found' && outcome.result !== 'partial') continue;
    if (outcome.extracted_values.length === 0) continue;

    const objective = objectives.find(o => o.id === outcome.objective_id);
    if (!objective) continue;

    // Create an atom for each atom_category this objective maps to
    for (const atomCat of objective.atom_categories) {
      for (const value of outcome.extracted_values) {
        const source = inferSource(input.resource_type);
        atoms.push({
          id: `atom_${atomCat}_${source}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          category: atomCat as AtomCategory,
          value,
          normalized: null,
          source,
          source_document_id: input.resource_id,
          source_location: null,
          source_url: input.source_url || null,
          extraction_method: `resource-analyzer:ai_vision:${input.resource_type}`,
          confidence: outcome.confidence,
          confidence_reasoning: outcome.notes || `Extracted from ${input.resource_type}`,
          validation_state: 'unvalidated',
          confirmed_by: [],
          conflicted_by: [],
          created_at: new Date().toISOString(),
          pipeline_step: input.pipeline_step || 'resource-analyzer',
        });
      }
    }
  }

  return atoms;
}

function inferSource(resourceType: ResourceType): AtomSource {
  switch (resourceType) {
    case 'gis_map': return 'arcgis_query';
    case 'aerial_imagery': return 'ai_vision';
    case 'plat_document': return 'plat_image';
    case 'deed_document': return 'deed_text';
    case 'survey_document': return 'survey_text';
    case 'street_map': return 'google_maps';
    case 'flood_map': return 'fema_service';
    case 'tax_record': return 'esearch_html';
    case 'parcel_data': return 'arcgis_query';
    case 'esearch_portal': return 'esearch_html';
    default: return 'ai_extraction';
  }
}
