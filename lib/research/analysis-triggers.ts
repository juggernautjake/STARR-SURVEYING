// lib/research/analysis-triggers.ts — Criteria-based trigger system for cross-validation
//
// Defines a set of triggers that fire automatically when certain data is discovered
// during the research pipeline. Each trigger specifies:
//   - A condition (what data must be present)
//   - An action (what validation/comparison to perform)
//   - A priority (when to run relative to other triggers)
//
// This ensures the AI and code know exactly what to do when specific markers/criteria
// are met — e.g., when a property ID is found, verify the lot matches; when deed info
// is found, compare against plat info; when satellite imagery is captured, compare
// physical features against GIS boundaries.

import type { DataAtom, AtomCategory, ValidationGraph, ValidationLog } from './cross-validation.service';

// ── Trigger Definitions ─────────────────────────────────────────────────────

export type TriggerCondition =
  | 'property_id_found'            // A property ID was extracted
  | 'lot_number_found'             // A lot number was identified
  | 'lot_number_confirmed'         // Lot number confirmed by 2+ sources
  | 'lot_number_conflicted'        // Lot number conflicts between sources
  | 'address_matched'              // User address matches a parcel address
  | 'address_mismatched'           // User address doesn't match any parcel
  | 'deed_info_found'              // Deed reference or legal description found
  | 'plat_info_found'              // Plat reference or lot layout found
  | 'satellite_imagery_captured'   // Satellite/aerial images captured
  | 'pin_location_determined'      // Geocoded pin position established
  | 'boundary_calls_found'         // Metes & bounds data extracted
  | 'acreage_found'                // Acreage data extracted
  | 'acreage_conflicted'           // Acreage differs between sources
  | 'adjacent_lots_found'          // Adjacent lot data discovered
  | 'easement_found'               // Easement data found
  | 'flood_zone_found'             // Flood zone determined
  | 'multiple_sources_analyzed'    // 3+ resources analyzed
  | 'critical_conflict_detected'   // Any critical conflict found
  | 'high_confidence_reached';     // Overall confidence >= 85%

export interface AnalysisTrigger {
  /** Unique trigger ID */
  id: string;
  /** Human-readable description */
  description: string;
  /** What condition activates this trigger */
  condition: TriggerCondition;
  /** Priority: higher = runs first (1-10) */
  priority: number;
  /** Categories to cross-check when triggered */
  cross_check_categories: AtomCategory[];
  /** AI instruction for what to review */
  ai_instruction: string;
  /** Whether this trigger should halt the pipeline if a critical issue is found */
  halt_on_critical: boolean;
}

/**
 * Master list of analysis triggers. These define the systematic rules for
 * what the AI and code should do when specific criteria are met.
 */
export const ANALYSIS_TRIGGERS: AnalysisTrigger[] = [
  // ── Property ID Triggers ────────────────────────────────────────────────
  {
    id: 'verify_lot_matches_propid',
    description: 'When a property ID is found, verify the identified lot/block uses that property ID',
    condition: 'property_id_found',
    priority: 10,
    cross_check_categories: ['property_id', 'lot_number', 'block_number', 'situs_address'],
    ai_instruction: `A property ID has been found. Cross-check:
1. Does the lot number we identified correspond to this property ID in the CAD system?
2. Does the situs address on this property ID match the user's input address?
3. If there's a mismatch, which source is more authoritative?
Flag any discrepancy as CRITICAL.`,
    halt_on_critical: true,
  },
  {
    id: 'verify_address_on_correct_lot',
    description: 'When address is confirmed, verify it maps to the correct lot/parcel',
    condition: 'address_matched',
    priority: 9,
    cross_check_categories: ['situs_address', 'lot_number', 'property_id', 'pin_location'],
    ai_instruction: `The user's address has been matched to a parcel. Verify:
1. Does the geocoded pin location fall within this parcel's boundaries?
2. Do adjacent parcels have logically sequential addresses?
3. Is the address on the correct side of the street (odd/even)?`,
    halt_on_critical: true,
  },
  {
    id: 'investigate_address_mismatch',
    description: 'When address doesn\'t match, investigate why and look for the correct parcel',
    condition: 'address_mismatched',
    priority: 10,
    cross_check_categories: ['situs_address', 'lot_number', 'property_id', 'owner_name'],
    ai_instruction: `ADDRESS MISMATCH DETECTED. The user's address does not match the parcel we found. Investigate:
1. Is the address simply formatted differently (abbreviations, unit numbers)?
2. Is the parcel the correct one but with an outdated address in the system?
3. Could the address be on an adjacent parcel instead?
4. Should we search for a different parcel?
This is a CRITICAL finding that must be resolved.`,
    halt_on_critical: true,
  },

  // ── Lot/Block Triggers ─────────────────────────────────────────────────
  {
    id: 'confirm_lot_across_sources',
    description: 'When lot is confirmed by 2+ sources, lock it in and boost confidence',
    condition: 'lot_number_confirmed',
    priority: 8,
    cross_check_categories: ['lot_number', 'block_number', 'subdivision_name'],
    ai_instruction: `Lot number has been confirmed by multiple sources. Review:
1. All sources agree on lot number — record this as high-confidence.
2. Do the block number and subdivision also match across all sources?
3. Update the lot identification with maximum confidence.`,
    halt_on_critical: false,
  },
  {
    id: 'resolve_lot_conflict',
    description: 'When lot numbers conflict between sources, determine which is correct',
    condition: 'lot_number_conflicted',
    priority: 10,
    cross_check_categories: ['lot_number', 'block_number', 'subdivision_name', 'property_id', 'situs_address'],
    ai_instruction: `LOT NUMBER CONFLICT. Different sources report different lot numbers. Resolve:
1. Which source is most authoritative? (Plat > CAD GIS > AI vision > address pattern)
2. Could this be a replat where lot numbers changed?
3. Does the property ID help disambiguate?
4. Check if adjacent lot data helps determine the correct lot.
This MUST be resolved — the wrong lot means the wrong property gets surveyed.`,
    halt_on_critical: true,
  },

  // ── Deed/Plat Cross-Check Triggers ─────────────────────────────────────
  {
    id: 'compare_deed_to_plat',
    description: 'When deed info is found, compare against plat info',
    condition: 'deed_info_found',
    priority: 7,
    cross_check_categories: ['deed_reference', 'legal_description', 'lot_number', 'block_number', 'acreage', 'easement', 'grantor', 'grantee'],
    ai_instruction: `Deed information has been extracted. Cross-reference with plat data:
1. Does the deed's lot/block match the plat's lot/block?
2. Does the deed's legal description reference the correct subdivision?
3. Are the acreages consistent between deed and plat?
4. Does the deed mention easements that appear on the plat?
5. Do the deed's metes & bounds match the plat's dimensions?
Any mismatch between deed and plat is significant — note it.`,
    halt_on_critical: false,
  },
  {
    id: 'compare_plat_to_gis',
    description: 'When plat info is found, compare against GIS/CAD data',
    condition: 'plat_info_found',
    priority: 7,
    cross_check_categories: ['lot_number', 'block_number', 'subdivision_name', 'acreage', 'easement', 'distance'],
    ai_instruction: `Plat information has been extracted. Cross-reference with GIS data:
1. Does the plat's lot layout match the GIS parcel boundaries?
2. Are lot dimensions from the plat consistent with GIS shape measurements?
3. Does the plat's subdivision name match the GIS subdivision code?
4. Are there easements on the plat that should appear in GIS?
The plat is the authoritative legal document — trust it over GIS when they conflict.`,
    halt_on_critical: false,
  },

  // ── Imagery Comparison Triggers ────────────────────────────────────────
  {
    id: 'compare_satellite_to_gis',
    description: 'When satellite imagery is captured, compare physical features against GIS boundaries',
    condition: 'satellite_imagery_captured',
    priority: 6,
    cross_check_categories: ['pin_location', 'lot_number', 'parcel_geometry'],
    ai_instruction: `Satellite imagery has been captured. Compare with GIS data:
1. Does the pin location fall on the correct parcel?
2. Do visible fence lines / property boundaries align with GIS boundaries?
3. Do building footprints fit within the identified lot?
4. Are driveways and access points consistent with the lot's street frontage?`,
    halt_on_critical: false,
  },
  {
    id: 'verify_pin_on_correct_lot',
    description: 'When pin location is determined, verify it lands on the correct lot',
    condition: 'pin_location_determined',
    priority: 8,
    cross_check_categories: ['pin_location', 'lot_number', 'situs_address', 'property_id'],
    ai_instruction: `A geocoded pin position has been established. Verify:
1. Does the pin fall within the boundaries of the identified lot?
2. If the pin is offset, how far and in which direction?
3. Google Maps sometimes places pins on the wrong lot — check by comparing
   the building footprint at the pin to the known lot dimensions.`,
    halt_on_critical: false,
  },

  // ── Boundary & Survey Triggers ─────────────────────────────────────────
  {
    id: 'verify_boundary_closure',
    description: 'When boundary calls are found, check mathematical closure',
    condition: 'boundary_calls_found',
    priority: 7,
    cross_check_categories: ['bearing', 'distance', 'boundary_call', 'point_of_beginning', 'acreage'],
    ai_instruction: `Metes and bounds boundary calls have been extracted. Verify:
1. Do the calls form a closed traverse back to the POB?
2. What is the closure error / precision ratio?
3. Does the computed area match the stated acreage?
4. Are all bearings and distances in consistent units?
5. Are there any gaps or overlaps in the boundary description?`,
    halt_on_critical: false,
  },
  {
    id: 'compare_acreage_sources',
    description: 'When acreage conflicts, determine which is correct',
    condition: 'acreage_conflicted',
    priority: 6,
    cross_check_categories: ['acreage', 'distance', 'boundary_call'],
    ai_instruction: `Acreage values differ between sources. Analyze:
1. What is the source of each acreage value? (Deed stated, GIS computed, plat stated, tax record)
2. Is one computed from geometry while the other is a legal description?
3. A small difference (<5%) is normal. A large difference (>10%) is a red flag.
4. The survey/plat computed area is most reliable, followed by deed stated, then GIS.`,
    halt_on_critical: false,
  },

  // ── Adjacent Lot Triggers ──────────────────────────────────────────────
  {
    id: 'verify_lot_in_context',
    description: 'When adjacent lots are found, verify our lot fits the pattern',
    condition: 'adjacent_lots_found',
    priority: 5,
    cross_check_categories: ['lot_number', 'block_number', 'situs_address', 'adjacent_lot'],
    ai_instruction: `Adjacent lot data has been discovered. Use it to verify our lot identification:
1. Do the adjacent lot numbers follow a logical sequence around our lot?
2. Do adjacent addresses follow the expected numbering pattern?
3. Is our lot roughly the same size as adjacent lots (unless it's known to be different)?
4. Adjacent lot data provides strong independent confirmation of lot identity.`,
    halt_on_critical: false,
  },

  // ── Easement & Flood Triggers ──────────────────────────────────────────
  {
    id: 'cross_check_easements',
    description: 'When easement data is found, compare across all sources',
    condition: 'easement_found',
    priority: 5,
    cross_check_categories: ['easement', 'right_of_way', 'setback_line'],
    ai_instruction: `Easement information has been found. Cross-check:
1. Do easements from the plat match those referenced in the deed?
2. Are utility easement widths consistent across sources?
3. Do GIS layers show easements in the same locations as the plat?
4. Are building setback lines consistent with the plat?`,
    halt_on_critical: false,
  },

  // ── Pipeline-Level Triggers ────────────────────────────────────────────
  {
    id: 'multi_source_reconciliation',
    description: 'After 3+ resources analyzed, run comprehensive reconciliation',
    condition: 'multiple_sources_analyzed',
    priority: 3,
    cross_check_categories: ['lot_number', 'block_number', 'subdivision_name', 'acreage', 'property_id', 'situs_address'],
    ai_instruction: `Multiple resources have been analyzed. Run a comprehensive reconciliation:
1. Which data points are confirmed by 2+ independent sources?
2. Which data points only come from a single source (lower confidence)?
3. Are there any remaining conflicts that need resolution?
4. What key data is still missing that we should look for?
5. Rate overall confidence in the lot identification.`,
    halt_on_critical: false,
  },
  {
    id: 'critical_conflict_escalation',
    description: 'When a critical conflict is detected, escalate and attempt resolution',
    condition: 'critical_conflict_detected',
    priority: 10,
    cross_check_categories: ['lot_number', 'block_number', 'property_id', 'situs_address'],
    ai_instruction: `CRITICAL CONFLICT DETECTED. This must be resolved before proceeding:
1. Identify which atoms are in conflict.
2. Rank sources by reliability: Official records > Plat > Deed > CAD GIS > AI Vision > Geocoding.
3. Check if additional data in the graph can resolve the conflict.
4. If unresolvable, flag for manual review and explain what's needed.`,
    halt_on_critical: true,
  },
  {
    id: 'confidence_milestone',
    description: 'When high confidence is reached, generate a confidence summary',
    condition: 'high_confidence_reached',
    priority: 1,
    cross_check_categories: ['lot_number', 'block_number', 'subdivision_name', 'property_id'],
    ai_instruction: `High confidence (>=85%) has been reached. Generate a summary:
1. List all confirmed data points with their sources.
2. Note any remaining minor conflicts or gaps.
3. State the final lot identification with confidence level.
4. Recommend whether additional verification is needed.`,
    halt_on_critical: false,
  },
];

// ── Trigger Evaluation Engine ─────────────────────────────────────────────

export interface TriggerResult {
  trigger_id: string;
  condition: TriggerCondition;
  fired: boolean;
  description: string;
  ai_instruction: string;
  cross_check_categories: AtomCategory[];
  findings: string[];
  halt_recommended: boolean;
}

/**
 * Evaluate which triggers should fire based on the current state of the
 * validation graph. Returns all triggers that match, sorted by priority.
 */
export function evaluateTriggers(
  graph: ValidationGraph,
  previouslyFired: Set<string> = new Set(),
): TriggerResult[] {
  const results: TriggerResult[] = [];
  const conditions = detectConditions(graph);

  console.log(`[analysis-triggers] Evaluating ${ANALYSIS_TRIGGERS.length} triggers against ${conditions.size} active conditions`);
  console.log(`[analysis-triggers] Active conditions: ${[...conditions].join(', ')}`);

  for (const trigger of ANALYSIS_TRIGGERS) {
    // Skip triggers that already fired (avoid re-firing)
    if (previouslyFired.has(trigger.id)) continue;

    if (conditions.has(trigger.condition)) {
      const findings = buildTriggerFindings(trigger, graph);

      results.push({
        trigger_id: trigger.id,
        condition: trigger.condition,
        fired: true,
        description: trigger.description,
        ai_instruction: trigger.ai_instruction,
        cross_check_categories: trigger.cross_check_categories,
        findings,
        halt_recommended: trigger.halt_on_critical && hasRelevantCriticalConflict(trigger, graph),
      });

      console.log(`[analysis-triggers] FIRED: ${trigger.id} — ${trigger.description}`);
    }
  }

  // Sort by priority (highest first)
  results.sort((a, b) => {
    const trigA = ANALYSIS_TRIGGERS.find(t => t.id === a.trigger_id)!;
    const trigB = ANALYSIS_TRIGGERS.find(t => t.id === b.trigger_id)!;
    return trigB.priority - trigA.priority;
  });

  console.log(`[analysis-triggers] ${results.length} triggers fired out of ${ANALYSIS_TRIGGERS.length} total`);
  return results;
}

/**
 * Detect which conditions are currently active based on the validation graph.
 */
function detectConditions(graph: ValidationGraph): Set<TriggerCondition> {
  const conditions = new Set<TriggerCondition>();
  const atomsByCategory = new Map<AtomCategory, DataAtom[]>();

  for (const atom of graph.atoms) {
    const list = atomsByCategory.get(atom.category) || [];
    list.push(atom);
    atomsByCategory.set(atom.category, list);
  }

  // Property ID found
  if (atomsByCategory.has('property_id') && atomsByCategory.get('property_id')!.length > 0) {
    conditions.add('property_id_found');
  }

  // Lot number found / confirmed / conflicted
  const lotAtoms = atomsByCategory.get('lot_number') || [];
  if (lotAtoms.length > 0) {
    conditions.add('lot_number_found');
    if (lotAtoms.some(a => a.validation_state === 'confirmed')) {
      conditions.add('lot_number_confirmed');
    }
    if (lotAtoms.some(a => a.validation_state === 'conflicted')) {
      conditions.add('lot_number_conflicted');
    }
  }

  // Address matched/mismatched
  const addrAtoms = atomsByCategory.get('situs_address') || [];
  if (addrAtoms.length >= 2) {
    const sources = new Set(addrAtoms.map(a => a.source));
    if (sources.has('user_input') && addrAtoms.some(a => a.source !== 'user_input')) {
      const userAddr = addrAtoms.find(a => a.source === 'user_input')?.value?.toUpperCase().trim();
      const otherAddr = addrAtoms.find(a => a.source !== 'user_input')?.value?.toUpperCase().trim();
      if (userAddr && otherAddr) {
        if (userAddr === otherAddr || userAddr.includes(otherAddr) || otherAddr.includes(userAddr)) {
          conditions.add('address_matched');
        } else {
          conditions.add('address_mismatched');
        }
      }
    }
  }

  // Deed info found
  if ((atomsByCategory.get('deed_reference') || []).length > 0 ||
      (atomsByCategory.get('legal_description') || []).length > 0) {
    conditions.add('deed_info_found');
  }

  // Plat info found
  if ((atomsByCategory.get('plat_reference') || []).length > 0) {
    conditions.add('plat_info_found');
  }

  // Also check if we have plat-sourced lot numbers as proxy for plat info
  if (lotAtoms.some(a => a.source === 'plat_text' || a.source === 'plat_image')) {
    conditions.add('plat_info_found');
  }

  // Satellite imagery captured
  if (atomsByCategory.has('pin_location')) {
    conditions.add('pin_location_determined');
    // If we have pin + any image-sourced atoms, satellite was captured
    if (graph.atoms.some(a => a.source === 'ai_vision' || a.source === 'google_maps' || a.source === 'usgs_imagery')) {
      conditions.add('satellite_imagery_captured');
    }
  }

  // Boundary calls found
  if ((atomsByCategory.get('bearing') || []).length > 0 ||
      (atomsByCategory.get('boundary_call') || []).length > 0) {
    conditions.add('boundary_calls_found');
  }

  // Acreage found / conflicted
  const acreageAtoms = atomsByCategory.get('acreage') || [];
  if (acreageAtoms.length > 0) {
    conditions.add('acreage_found');
    if (acreageAtoms.some(a => a.validation_state === 'conflicted')) {
      conditions.add('acreage_conflicted');
    }
  }

  // Adjacent lots found
  if ((atomsByCategory.get('adjacent_lot') || []).length > 0) {
    conditions.add('adjacent_lots_found');
  }

  // Easement found
  if ((atomsByCategory.get('easement') || []).length > 0) {
    conditions.add('easement_found');
  }

  // Flood zone found
  if ((atomsByCategory.get('flood_zone') || []).length > 0) {
    conditions.add('flood_zone_found');
  }

  // Multiple sources analyzed (3+ unique sources)
  const uniqueSources = new Set(graph.atoms.map(a => a.source));
  if (uniqueSources.size >= 3) {
    conditions.add('multiple_sources_analyzed');
  }

  // Critical conflict detected
  if (graph.conflicts.some(c => !c.resolved && c.severity === 'critical')) {
    conditions.add('critical_conflict_detected');
  }

  // High confidence reached
  if (graph.summary.overall_confidence >= 85) {
    conditions.add('high_confidence_reached');
  }

  return conditions;
}

/**
 * Build findings relevant to a specific trigger from the graph state.
 */
function buildTriggerFindings(trigger: AnalysisTrigger, graph: ValidationGraph): string[] {
  const findings: string[] = [];

  for (const category of trigger.cross_check_categories) {
    const atoms = graph.atoms.filter(a => a.category === category);
    if (atoms.length === 0) {
      findings.push(`No data found for ${category}`);
      continue;
    }

    const sources = [...new Set(atoms.map(a => a.source))];
    const confirmed = atoms.filter(a => a.validation_state === 'confirmed');
    const conflicted = atoms.filter(a => a.validation_state === 'conflicted');

    findings.push(
      `${category}: ${atoms.length} atom(s) from ${sources.join(', ')}` +
      (confirmed.length > 0 ? ` — ${confirmed.length} confirmed` : '') +
      (conflicted.length > 0 ? ` — ${conflicted.length} CONFLICTED` : ''),
    );

    // List actual values for key categories
    if (['lot_number', 'block_number', 'property_id', 'situs_address', 'subdivision_name'].includes(category)) {
      const uniqueValues = [...new Set(atoms.map(a => a.value))];
      findings.push(`  Values: ${uniqueValues.join(' | ')}`);
    }
  }

  // Check relevant conflicts
  const relevantConflicts = graph.conflicts.filter(
    c => !c.resolved && trigger.cross_check_categories.includes(c.category),
  );
  if (relevantConflicts.length > 0) {
    for (const c of relevantConflicts) {
      findings.push(`  CONFLICT [${c.severity}]: ${c.description}`);
    }
  }

  return findings;
}

/**
 * Check if a trigger has critical conflicts in its relevant categories.
 */
function hasRelevantCriticalConflict(trigger: AnalysisTrigger, graph: ValidationGraph): boolean {
  return graph.conflicts.some(
    c => !c.resolved && c.severity === 'critical' && trigger.cross_check_categories.includes(c.category),
  );
}

// ── Trigger-Based AI Review ───────────────────────────────────────────────

/**
 * Build a comprehensive AI review prompt from all fired triggers.
 * This combines trigger instructions and findings into a single prompt
 * that the AI can use to perform a structured review.
 */
export function buildTriggerReviewPrompt(
  triggers: TriggerResult[],
  graph: ValidationGraph,
): string {
  if (triggers.length === 0) return '';

  const sections: string[] = [];

  sections.push('# TRIGGERED ANALYSIS REVIEWS');
  sections.push('');
  sections.push('The following triggers have been activated based on data discovered during research.');
  sections.push('Review each trigger in order of priority and address the instructions.');
  sections.push('');

  for (const trigger of triggers) {
    sections.push(`## ${trigger.trigger_id.toUpperCase().replace(/_/g, ' ')}`);
    sections.push(`Condition: ${trigger.condition}`);
    sections.push(`Priority: ${ANALYSIS_TRIGGERS.find(t => t.id === trigger.trigger_id)?.priority ?? 0}/10`);
    sections.push('');
    sections.push('### Instructions:');
    sections.push(trigger.ai_instruction);
    sections.push('');
    sections.push('### Current Findings:');
    for (const f of trigger.findings) {
      sections.push(`- ${f}`);
    }
    sections.push('');
    if (trigger.halt_recommended) {
      sections.push('**WARNING: This trigger recommends HALTING the pipeline until resolved.**');
      sections.push('');
    }
    sections.push('---');
    sections.push('');
  }

  // Add graph summary
  sections.push('## CURRENT VALIDATION GRAPH SUMMARY');
  sections.push(`- Total atoms: ${graph.summary.total_atoms}`);
  sections.push(`- Confirmed: ${graph.summary.confirmed_count}`);
  sections.push(`- Conflicted: ${graph.summary.conflicted_count}`);
  sections.push(`- Unvalidated: ${graph.summary.unvalidated_count}`);
  sections.push(`- Overall confidence: ${graph.summary.overall_confidence}%`);
  sections.push(`- Critical conflicts: ${graph.summary.critical_conflicts}`);

  return sections.join('\n');
}

/**
 * Get triggers for a specific resource type being analyzed.
 * Useful for generating context-specific trigger instructions.
 */
export function getResourceTypeTriggers(resourceType: string): AnalysisTrigger[] {
  const conditionsByType: Record<string, TriggerCondition[]> = {
    deed_document: ['deed_info_found', 'property_id_found', 'lot_number_found'],
    plat_document: ['plat_info_found', 'lot_number_found', 'boundary_calls_found'],
    survey_document: ['boundary_calls_found', 'lot_number_found'],
    gis_map: ['property_id_found', 'lot_number_found', 'satellite_imagery_captured'],
    aerial_imagery: ['satellite_imagery_captured', 'pin_location_determined'],
    street_map: ['pin_location_determined', 'address_matched'],
    tax_record: ['property_id_found', 'acreage_found'],
    parcel_data: ['property_id_found', 'lot_number_found', 'acreage_found', 'adjacent_lots_found'],
  };

  const relevantConditions = conditionsByType[resourceType] || [];
  return ANALYSIS_TRIGGERS.filter(t => relevantConditions.includes(t.condition));
}
