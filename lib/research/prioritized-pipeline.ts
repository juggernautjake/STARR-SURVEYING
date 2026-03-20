// lib/research/prioritized-pipeline.ts — Prioritized resource analysis pipeline
//
// Analyzes resources in order of expected information richness, building
// a cumulative baseline of knowledge. Each resource's findings are
// immediately cross-validated against everything found so far.
//
// Pipeline strategy:
//   1. Start with the richest data source (ArcGIS parcel data — structured, reliable)
//   2. Move to the next richest (deed documents, plat documents)
//   3. Analyze visual sources (map screenshots, satellite imagery)
//   4. Fill gaps with secondary sources (tax records, flood maps)
//   5. After each resource, run triggered cross-validation reviews
//
// This ensures:
//   - The strongest baseline is established first
//   - Each subsequent resource is compared against all prior data
//   - Conflicts are detected early (before wasting time on low-value sources)
//   - The AI knows what to look for based on what was already found

import {
  addAtomAndValidate,
  crossValidateAtoms,
  type DataAtom,
  type ValidationGraph,
  type ValidationLog,
} from './cross-validation.service';
import {
  analyzeResource,
  type AnalysisInput,
  type AnalysisResult,
} from './resource-analyzer';
import {
  evaluateTriggers,
  buildTriggerReviewPrompt,
  type TriggerResult,
} from './analysis-triggers';
import type { ResourceExtractionReport } from './extraction-objectives';
import { callAI } from './ai-client';
import type { PromptKey } from './prompts';

// ── Resource Priority Rankings ─────────────────────────────────────────────

/**
 * Priority rankings for resource types. Higher = analyzed first.
 * These are based on typical information density and reliability.
 */
const RESOURCE_PRIORITY: Record<string, number> = {
  // Tier 1: Richest structured data (analyze first to establish baseline)
  parcel_data: 100,        // ArcGIS parcel query — structured, reliable, fast
  esearch_portal: 95,      // eSearch property record — structured, detailed

  // Tier 2: Legal documents (authoritative, dense information)
  deed_document: 85,       // Deed — legal description, lot/block, grantor/grantee
  plat_document: 90,       // Plat — lot layout, dimensions, easements (most authoritative for lots)
  survey_document: 88,     // Survey — metes & bounds, monuments, bearings
  field_notes: 82,         // Field notes — survey details

  // Tier 3: Visual sources (good for verification, not primary data)
  gis_map: 75,             // GIS map screenshot — parcel boundaries, lot numbers
  aerial_imagery: 70,      // Aerial/satellite — physical features, lot shape
  street_map: 65,          // Street map — pin location, address context

  // Tier 4: Secondary/supplementary sources
  title_document: 60,      // Title commitment — chain of title, encumbrances
  tax_record: 55,          // Tax record — valuation, owner
  easement_document: 50,   // Easement instrument — specific easement details
  county_record: 45,       // County clerk records
  flood_map: 40,           // Flood zone map
  right_of_way: 35,        // ROW data

  // Default
  any: 10,
};

/**
 * Sort analysis inputs by priority (highest first).
 */
export function sortByPriority(inputs: AnalysisInput[]): AnalysisInput[] {
  return [...inputs].sort((a, b) => {
    const prioA = RESOURCE_PRIORITY[a.resource_type] ?? 10;
    const prioB = RESOURCE_PRIORITY[b.resource_type] ?? 10;
    return prioB - prioA;
  });
}

// ── Prioritized Pipeline ─────────────────────────────────────────────────

export interface PipelineStepResult {
  /** Resource that was analyzed */
  resource_id: string;
  resource_label: string;
  resource_type: string;
  /** Priority rank */
  priority: number;
  /** Analysis result */
  report: ResourceExtractionReport;
  /** New atoms created */
  atoms_created: number;
  /** Atoms confirmed during cross-validation */
  atoms_confirmed: number;
  /** New conflicts detected */
  new_conflicts: number;
  /** Triggers fired after this resource */
  triggers_fired: string[];
  /** Validation logs from this step */
  validation_logs: ValidationLog[];
  /** Cumulative graph state after this step */
  cumulative_confidence: number;
  /** Step timing */
  duration_ms: number;
  /** Step log messages */
  step_log: string[];
}

export interface PipelineResult {
  /** Per-step results in execution order */
  steps: PipelineStepResult[];
  /** All reports */
  reports: ResourceExtractionReport[];
  /** All atoms created */
  total_atoms: number;
  /** All triggers fired */
  all_triggers: TriggerResult[];
  /** Final graph state */
  final_confidence: number;
  /** AI trigger review responses */
  trigger_reviews: Array<{ trigger_ids: string[]; review: string }>;
  /** Pipeline log */
  pipeline_log: string[];
}

/**
 * Run the prioritized analysis pipeline.
 *
 * Resources are analyzed in order of information richness. After each resource:
 * 1. Its atoms are added to the validation graph
 * 2. Cross-validation runs against all prior data
 * 3. Triggers are evaluated and fired
 * 4. The AI reviews any triggered cross-check instructions
 *
 * This ensures the strongest baseline is established first and each
 * subsequent resource is compared against cumulative knowledge.
 */
export async function runPrioritizedPipeline(
  inputs: AnalysisInput[],
  graph: ValidationGraph,
  options: {
    /** Run AI trigger reviews (slower but more thorough) */
    runTriggerReviews?: boolean;
    /** Maximum resources to analyze (for partial runs) */
    maxResources?: number;
    /** Callback for progress updates */
    onProgress?: (step: number, total: number, label: string) => void;
  } = {},
): Promise<PipelineResult> {
  const { runTriggerReviews = true, maxResources, onProgress } = options;

  const sorted = sortByPriority(inputs);
  const toAnalyze = maxResources ? sorted.slice(0, maxResources) : sorted;
  const pipelineLog: string[] = [];
  const allTriggers: TriggerResult[] = [];
  const triggerReviews: PipelineResult['trigger_reviews'] = [];
  const firedTriggerIds = new Set<string>();
  const steps: PipelineStepResult[] = [];
  const reports: ResourceExtractionReport[] = [];

  pipelineLog.push(`[pipeline] Starting prioritized analysis of ${toAnalyze.length} resources`);
  pipelineLog.push(`[pipeline] Analysis order: ${toAnalyze.map(i => `${i.resource_type}(${RESOURCE_PRIORITY[i.resource_type] ?? 10})`).join(' → ')}`);
  pipelineLog.push(`[pipeline] Initial graph: ${graph.summary.total_atoms} atoms, ${graph.summary.overall_confidence}% confidence`);

  for (let i = 0; i < toAnalyze.length; i++) {
    const input = toAnalyze[i];
    const stepStart = Date.now();
    const stepLog: string[] = [];
    const priority = RESOURCE_PRIORITY[input.resource_type] ?? 10;

    pipelineLog.push(`\n[pipeline] ═══ Step ${i + 1}/${toAnalyze.length}: ${input.resource_label} (${input.resource_type}, priority=${priority}) ═══`);
    stepLog.push(`Analyzing ${input.resource_label} (${input.resource_type}, priority=${priority})`);

    if (onProgress) {
      onProgress(i + 1, toAnalyze.length, input.resource_label);
    }

    // ── Analyze the resource ──────────────────────────────────────────
    let result: AnalysisResult;
    try {
      result = await analyzeResource(input);
      stepLog.push(`Extracted ${result.report.extraction_score.total_found}/${result.report.extraction_score.total_applicable} objectives (${result.report.extraction_score.percentage}%)`);
      pipelineLog.push(`[pipeline] Extracted ${result.report.extraction_score.total_found} data points, ${result.atoms.length} atoms`);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      stepLog.push(`Analysis FAILED: ${errMsg}`);
      pipelineLog.push(`[pipeline] FAILED: ${errMsg}`);
      continue;
    }

    reports.push(result.report);

    // ── Add atoms to graph with cross-validation ──────────────────────
    let newConfirmations = 0;
    let newConflicts = 0;
    const validationLogs: ValidationLog[] = [];

    const prevConfirmed = graph.summary.confirmed_count;
    const prevConflicted = graph.summary.conflicted_count;

    for (const atom of result.atoms) {
      const logs = addAtomAndValidate(graph, atom);
      validationLogs.push(...logs);
    }

    newConfirmations = graph.summary.confirmed_count - prevConfirmed;
    newConflicts = graph.summary.conflicted_count - prevConflicted;

    if (newConfirmations > 0) {
      stepLog.push(`CONFIRMED: ${newConfirmations} new confirmations against prior data`);
      pipelineLog.push(`[pipeline] +${newConfirmations} confirmations`);
    }
    if (newConflicts > 0) {
      stepLog.push(`CONFLICT: ${newConflicts} new conflicts detected`);
      pipelineLog.push(`[pipeline] +${newConflicts} conflicts detected`);
    }

    stepLog.push(`Cumulative: ${graph.summary.total_atoms} atoms, ${graph.summary.confirmed_count} confirmed, ${graph.summary.conflicted_count} conflicted, confidence=${graph.summary.overall_confidence}%`);

    // ── Evaluate triggers ─────────────────────────────────────────────
    const triggeredNow = evaluateTriggers(graph, firedTriggerIds);
    const triggeredIds = triggeredNow.map(t => t.trigger_id);
    allTriggers.push(...triggeredNow);

    for (const t of triggeredNow) {
      firedTriggerIds.add(t.trigger_id);
      stepLog.push(`TRIGGER FIRED: ${t.trigger_id} — ${t.description}`);
      pipelineLog.push(`[pipeline] Trigger: ${t.trigger_id}`);

      if (t.halt_recommended) {
        stepLog.push(`⚠ HALT RECOMMENDED: ${t.trigger_id} found critical issue requiring resolution`);
        pipelineLog.push(`[pipeline] HALT recommended by trigger ${t.trigger_id}`);
      }
    }

    // ── Run AI trigger review (if enabled and triggers fired) ─────────
    if (runTriggerReviews && triggeredNow.length > 0) {
      const reviewPrompt = buildTriggerReviewPrompt(triggeredNow, graph);
      if (reviewPrompt) {
        try {
          stepLog.push(`Running AI review for ${triggeredNow.length} triggered checks...`);
          const reviewResult = await callAI({
            promptKey: 'CROSS_REFERENCE_ANALYZER' as PromptKey,
            userContent: [
              'You are a Texas Registered Professional Land Surveyor reviewing cross-validation triggers.',
              'Analyze the following triggered checks and provide your findings for each.',
              '',
              reviewPrompt,
              '',
              'For each trigger, provide:',
              '1. Your analysis of the findings',
              '2. Whether the data is consistent or has issues',
              '3. Recommended actions if any',
              '',
              'Respond in plain text, organized by trigger.',
            ].join('\n'),
            maxTokens: 4096,
            timeoutMs: 120_000,
          });

          const reviewText = typeof reviewResult.response === 'string'
            ? reviewResult.response
            : reviewResult.raw || 'No review generated';

          triggerReviews.push({
            trigger_ids: triggeredIds,
            review: reviewText,
          });
          stepLog.push(`AI trigger review complete (${reviewText.length} chars)`);
          pipelineLog.push(`[pipeline] AI trigger review completed`);
        } catch (err) {
          stepLog.push(`AI trigger review failed: ${err instanceof Error ? err.message : String(err)}`);
          pipelineLog.push(`[pipeline] AI trigger review failed (non-critical)`);
        }
      }
    }

    const duration = Date.now() - stepStart;

    steps.push({
      resource_id: input.resource_id,
      resource_label: input.resource_label,
      resource_type: input.resource_type,
      priority,
      report: result.report,
      atoms_created: result.atoms.length,
      atoms_confirmed: newConfirmations,
      new_conflicts: newConflicts,
      triggers_fired: triggeredIds,
      validation_logs: validationLogs.filter(l => l.type === 'confirmation' || l.type === 'conflict'),
      cumulative_confidence: graph.summary.overall_confidence,
      duration_ms: duration,
      step_log: stepLog,
    });

    pipelineLog.push(`[pipeline] Step ${i + 1} complete in ${duration}ms — confidence now ${graph.summary.overall_confidence}%`);
  }

  // ── Final cross-validation pass ──────────────────────────────────────
  pipelineLog.push('\n[pipeline] ═══ Final cross-validation pass ═══');
  const finalLogs = crossValidateAtoms(graph);
  pipelineLog.push(`[pipeline] Final: ${graph.summary.total_atoms} atoms, ${graph.summary.confirmed_count} confirmed, ${graph.summary.conflicted_count} conflicted`);
  pipelineLog.push(`[pipeline] Overall confidence: ${graph.summary.overall_confidence}%`);

  return {
    steps,
    reports,
    total_atoms: graph.summary.total_atoms,
    all_triggers: allTriggers,
    final_confidence: graph.summary.overall_confidence,
    trigger_reviews: triggerReviews,
    pipeline_log: pipelineLog,
  };
}

// ── Resource Priority Estimation ──────────────────────────────────────────

/**
 * Estimate which resource types will provide the most value given current gaps.
 * Returns recommended resource types to analyze next, ordered by expected value.
 */
export function recommendNextResources(
  graph: ValidationGraph,
  availableTypes: string[],
  alreadyAnalyzed: string[],
): Array<{ type: string; reason: string; priority: number }> {
  const recommendations: Array<{ type: string; reason: string; priority: number }> = [];
  const analyzed = new Set(alreadyAnalyzed);
  const hasCategory = (cat: string) =>
    graph.atoms.some(a => a.category === cat && a.validation_state !== 'rejected');
  const isMissing = (cat: string) => !hasCategory(cat);

  for (const type of availableTypes) {
    if (analyzed.has(type)) continue;

    let priority = RESOURCE_PRIORITY[type] ?? 10;
    let reason = '';

    // Boost priority based on what's missing
    if (type === 'plat_document' && isMissing('bearing')) {
      priority += 20;
      reason = 'Missing metes & bounds data — plat is the best source';
    } else if (type === 'deed_document' && isMissing('deed_reference')) {
      priority += 15;
      reason = 'Missing deed reference — deed document needed';
    } else if (type === 'gis_map' && isMissing('lot_number')) {
      priority += 15;
      reason = 'Missing lot number — GIS map can help identify the lot';
    } else if (type === 'aerial_imagery' && isMissing('parcel_geometry')) {
      priority += 10;
      reason = 'No parcel geometry — aerial imagery can help verify lot boundaries';
    } else if (type === 'flood_map' && isMissing('flood_zone')) {
      priority += 10;
      reason = 'Missing flood zone data — flood map needed';
    } else if (type === 'street_map' && isMissing('pin_location')) {
      priority += 10;
      reason = 'No pin location — street map needed to establish address location';
    } else {
      reason = `Standard priority for ${type}`;
    }

    // Reduce priority if we already have good data for what this type provides
    if (type === 'tax_record' && hasCategory('property_id') && hasCategory('acreage') && hasCategory('market_value')) {
      priority -= 20;
      reason = 'Already have key tax/appraisal data from other sources';
    }

    recommendations.push({ type, reason, priority });
  }

  return recommendations.sort((a, b) => b.priority - a.priority);
}
