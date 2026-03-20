// lib/research/prioritized-pipeline.service.ts — Prioritized resource analysis pipeline
//
// Analyzes resources in order from the most information-rich to the least.
// After each resource is analyzed, its data is compared against ALL previously
// analyzed resources. This cascading comparison builds progressively stronger
// confidence as each new source either confirms or conflicts with prior data.
//
// Resource Priority Order (most → least information-rich):
//   1. County CAD/GIS Parcel Data (ArcGIS) — most structured, most fields
//   2. Property Tax/eSearch Records — owner, address, legal desc, values
//   3. Recorded Plat Documents — authoritative lot numbers, dimensions
//   4. Deed Documents — legal description, chain of title, lot/block
//   5. Satellite + Aerial Imagery — physical lot boundaries, building positions
//   6. Google Maps Street/Pin — address pin location verification
//   7. Flood Zone / FEMA Data — flood zone classification
//   8. Additional County Records — supplementary data
//
// After each resource:
//   → Extract all data atoms
//   → Cross-validate against every prior atom
//   → Run criteria triggers
//   → Log every comparison result
//   → If conflicts found → flag for resolution before proceeding

import { PipelineLogger } from './pipeline-logger';
import {
  createValidationGraph,
  addAtomAndValidate,
  crossValidateAtoms,
  analyzeConflictsWithAI,
  type ValidationGraph,
  type DataAtom,
  type ValidationLog,
} from './cross-validation.service';
import {
  evaluateTriggers,
  buildTriggerContext,
  type FiredTrigger,
} from './criteria-triggers';
import type { ResourceExtractionReport } from './extraction-objectives';

// ── Types ────────────────────────────────────────────────────────────────────

export type ResourcePriority = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export interface PrioritizedResource {
  /** Unique resource identifier */
  id: string;
  /** Human-readable label */
  label: string;
  /** Resource type for extraction objectives */
  type: string;
  /** Priority rank (1 = highest, 8 = lowest) */
  priority: ResourcePriority;
  /** Why this priority */
  priority_reason: string;
  /** Data atoms already extracted from this resource */
  atoms: DataAtom[];
  /** Extraction report (if available) */
  report?: ResourceExtractionReport;
}

export interface ComparisonResult {
  /** Resource just analyzed */
  current_resource: string;
  /** Resource compared against */
  compared_against: string;
  /** Number of matches found */
  matches: number;
  /** Number of conflicts found */
  conflicts: number;
  /** Details of key matches */
  match_details: string[];
  /** Details of key conflicts */
  conflict_details: string[];
}

export interface PipelinePhaseResult {
  /** The resource analyzed in this phase */
  resource: PrioritizedResource;
  /** New atoms created from this resource */
  new_atoms_count: number;
  /** Comparison results against all prior resources */
  comparisons: ComparisonResult[];
  /** Triggers that fired after this phase */
  triggers_fired: FiredTrigger[];
  /** Validation logs from cross-validation */
  validation_logs: ValidationLog[];
  /** Updated graph summary after this phase */
  graph_summary: ValidationGraph['summary'];
  /** Duration of this phase in ms */
  duration_ms: number;
}

export interface PrioritizedPipelineResult {
  /** Phase-by-phase results */
  phases: PipelinePhaseResult[];
  /** Final validation graph */
  final_graph: ValidationGraph;
  /** All triggers that fired during the pipeline */
  all_triggers: FiredTrigger[];
  /** Overall confidence after all phases */
  overall_confidence: number;
  /** Total resources analyzed */
  resources_analyzed: number;
  /** Total duration */
  total_duration_ms: number;
}

// ── Resource Priority Classification ─────────────────────────────────────────

/**
 * Assign priority to a resource based on its type and expected information density.
 */
export function classifyResourcePriority(
  resourceType: string,
  label?: string,
): { priority: ResourcePriority; reason: string } {
  const typeLower = resourceType.toLowerCase();
  const labelLower = (label ?? '').toLowerCase();

  // Priority 1: CAD/GIS Parcel Data — most structured, most fields
  if (typeLower.includes('parcel_data') || typeLower.includes('arcgis') ||
      labelLower.includes('arcgis') || labelLower.includes('cad gis') ||
      labelLower.includes('bell cad')) {
    return { priority: 1, reason: 'County CAD/GIS data — most structured source with property ID, lot, block, acreage, owner, legal description' };
  }

  // Priority 2: Tax/eSearch Records
  if (typeLower.includes('tax_record') || typeLower.includes('esearch') ||
      labelLower.includes('tax') || labelLower.includes('esearch') ||
      labelLower.includes('appraisal')) {
    return { priority: 2, reason: 'Tax/appraisal records — owner, address, legal description, values, deed reference' };
  }

  // Priority 3: Recorded Plat Documents
  if (typeLower.includes('plat') || labelLower.includes('plat') ||
      labelLower.includes('subdivision')) {
    return { priority: 3, reason: 'Recorded plat — authoritative lot numbering, dimensions, easements, boundaries' };
  }

  // Priority 4: Deed Documents
  if (typeLower.includes('deed') || typeLower.includes('title') ||
      labelLower.includes('deed') || labelLower.includes('title')) {
    return { priority: 4, reason: 'Deed/title document — legal description, chain of title, lot/block, grantor/grantee' };
  }

  // Priority 5: Satellite/Aerial Imagery
  if (typeLower.includes('aerial') || typeLower.includes('satellite') ||
      labelLower.includes('satellite') || labelLower.includes('aerial') ||
      labelLower.includes('usgs')) {
    return { priority: 5, reason: 'Satellite/aerial imagery — physical lot boundaries, building positions, fence lines' };
  }

  // Priority 6: Google Maps / Street Maps
  if (typeLower.includes('street_map') || typeLower.includes('google') ||
      labelLower.includes('google maps') || labelLower.includes('street pin') ||
      labelLower.includes('pin map')) {
    return { priority: 6, reason: 'Google Maps — address pin location, street context, lot position verification' };
  }

  // Priority 7: Flood Zone
  if (typeLower.includes('flood') || typeLower.includes('fema') ||
      labelLower.includes('flood') || labelLower.includes('fema')) {
    return { priority: 7, reason: 'FEMA flood zone — flood classification for the parcel' };
  }

  // Priority 8: Everything else
  return { priority: 8, reason: 'Supplementary resource — additional data for cross-validation' };
}

// ── Prioritized Pipeline Execution ───────────────────────────────────────────

/**
 * Execute the prioritized analysis pipeline.
 *
 * Resources are sorted by priority (1 = most information-rich).
 * After each resource is analyzed:
 *   1. Its atoms are added to the validation graph
 *   2. Cross-validation runs against ALL prior atoms
 *   3. Criteria triggers are evaluated
 *   4. Every match/conflict is logged
 *
 * @param resources - Pre-analyzed resources with their extracted atoms
 * @param address - The property address being researched
 * @param logger - Pipeline logger for structured logging
 * @param existingGraph - Optional existing graph to continue from
 */
export async function executePrioritizedPipeline(
  resources: PrioritizedResource[],
  address: string,
  logger: PipelineLogger,
  existingGraph?: ValidationGraph,
): Promise<PrioritizedPipelineResult> {
  const totalStart = Date.now();
  logger.startPhase('priority_rank', 'Starting prioritized resource analysis pipeline');

  const graph = existingGraph ?? createValidationGraph();
  const phases: PipelinePhaseResult[] = [];
  const allTriggers: FiredTrigger[] = [];
  const resourceLabels: string[] = [];

  // Sort resources by priority (lowest number = highest priority)
  const sorted = [...resources].sort((a, b) => a.priority - b.priority);

  logger.info('priority_rank', `Processing ${sorted.length} resources in priority order`, {
    order: sorted.map(r => ({ id: r.id, label: r.label, priority: r.priority, reason: r.priority_reason })),
  });

  for (let i = 0; i < sorted.length; i++) {
    const resource = sorted[i];
    const phaseStart = Date.now();

    logger.startPhase('resource_analyze', `[${i + 1}/${sorted.length}] Analyzing: ${resource.label} (priority ${resource.priority})`);
    logger.info('resource_analyze', `Resource ${resource.label}: ${resource.atoms.length} atoms to add`, {
      resource_id: resource.id,
      priority: resource.priority,
      priority_reason: resource.priority_reason,
      atoms_count: resource.atoms.length,
      atom_categories: [...new Set(resource.atoms.map(a => a.category))],
    });

    // Track atom count before adding
    const atomsBefore = graph.atoms.length;
    const confirmsBefore = graph.confirmations.length;
    const conflictsBefore = graph.conflicts.length;

    // Add all atoms from this resource
    const phaseLogs: ValidationLog[] = [];
    for (const atom of resource.atoms) {
      const logs = addAtomAndValidate(graph, atom);
      phaseLogs.push(...logs.filter(l => l.type === 'confirmation' || l.type === 'conflict'));
    }

    const newAtoms = graph.atoms.length - atomsBefore;
    const newConfirms = graph.confirmations.length - confirmsBefore;
    const newConflicts = graph.conflicts.length - conflictsBefore;

    // Log every new confirmation
    for (const log of phaseLogs) {
      if (log.type === 'confirmation') {
        logger.match('cross_validate',
          `${log.category}: "${log.values?.[0]}" confirmed by ${log.sources.join(' + ')}`,
          { category: log.category, sources: log.sources, values: log.values, match_score: log.matchScore },
        );
      } else if (log.type === 'conflict') {
        logger.conflict('cross_validate',
          `${log.category}: "${log.values?.[0]}" vs "${log.values?.[1]}" (${log.severity})`,
          { category: log.category, sources: log.sources, values: log.values, severity: log.severity },
        );
      }
    }

    // Build comparison results against prior resources
    const comparisons: ComparisonResult[] = [];
    for (let j = 0; j < i; j++) {
      const prior = sorted[j];
      const priorAtomIds = new Set(prior.atoms.map(a => a.id));

      // Find confirmations between current and prior resource
      const crossConfirms = graph.confirmations.filter(c =>
        (resource.atoms.some(a => a.id === c.atom_a_id) && priorAtomIds.has(c.atom_b_id)) ||
        (resource.atoms.some(a => a.id === c.atom_b_id) && priorAtomIds.has(c.atom_a_id)),
      );

      // Find conflicts between current and prior resource
      const crossConflicts = graph.conflicts.filter(c =>
        (resource.atoms.some(a => a.id === c.atom_a_id) && priorAtomIds.has(c.atom_b_id)) ||
        (resource.atoms.some(a => a.id === c.atom_b_id) && priorAtomIds.has(c.atom_a_id)),
      );

      if (crossConfirms.length > 0 || crossConflicts.length > 0) {
        const comparison: ComparisonResult = {
          current_resource: resource.label,
          compared_against: prior.label,
          matches: crossConfirms.length,
          conflicts: crossConflicts.length,
          match_details: crossConfirms.map(c => c.description),
          conflict_details: crossConflicts.map(c => c.description),
        };
        comparisons.push(comparison);

        if (crossConfirms.length > 0) {
          logger.info('cross_validate',
            `${resource.label} ↔ ${prior.label}: ${crossConfirms.length} match(es), ${crossConflicts.length} conflict(s)`,
            {
              current: resource.label,
              prior: prior.label,
              matches: crossConfirms.length,
              conflicts: crossConflicts.length,
            },
          );
        }
        if (crossConflicts.length > 0) {
          logger.warn('cross_validate',
            `CONFLICTS between ${resource.label} and ${prior.label}: ${crossConflicts.map(c => c.description).join('; ')}`,
          );
        }
      }
    }

    // Evaluate triggers after this phase
    resourceLabels.push(resource.label);
    const triggerCtx = buildTriggerContext({
      graph,
      completed_phase: 'resource_analyze',
      address,
      resources_analyzed: i + 1,
      resource_labels: resourceLabels,
    });

    const triggers = evaluateTriggers(triggerCtx, logger);
    allTriggers.push(...triggers);

    const phaseDuration = Date.now() - phaseStart;

    logger.info('resource_analyze',
      `Phase ${i + 1} complete: +${newAtoms} atoms, +${newConfirms} confirms, +${newConflicts} conflicts, ${triggers.length} triggers`,
      {
        new_atoms: newAtoms,
        new_confirms: newConfirms,
        new_conflicts: newConflicts,
        triggers_fired: triggers.length,
        overall_confidence: graph.summary.overall_confidence,
        duration_ms: phaseDuration,
      },
    );

    phases.push({
      resource,
      new_atoms_count: newAtoms,
      comparisons,
      triggers_fired: triggers,
      validation_logs: phaseLogs,
      graph_summary: { ...graph.summary },
      duration_ms: phaseDuration,
    });

    logger.endPhase('resource_analyze');
  }

  // Final cross-validation pass
  logger.startPhase('cross_validate', 'Running final cross-validation pass');
  const finalLogs = crossValidateAtoms(graph);
  logger.endPhase('cross_validate', `Final validation: ${graph.summary.total_atoms} atoms, ${graph.summary.confirmed_count} confirmed, ${graph.summary.conflicted_count} conflicted`);

  // AI conflict resolution for significant conflicts
  const significantConflicts = graph.conflicts.filter(
    c => !c.resolved && (c.severity === 'moderate' || c.severity === 'major' || c.severity === 'critical'),
  );

  if (significantConflicts.length > 0) {
    logger.info('cross_validate', `Running AI analysis on ${significantConflicts.length} significant conflicts`);
    try {
      await analyzeConflictsWithAI(graph);
      for (const conflict of graph.conflicts.filter(c => c.recommendation)) {
        logger.info('cross_validate', `AI recommendation for ${conflict.category}: ${conflict.recommendation}`);
      }
    } catch (err) {
      logger.error('cross_validate', `AI conflict analysis failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const totalDuration = Date.now() - totalStart;
  logger.endPhase('priority_rank', `Prioritized pipeline complete in ${totalDuration}ms`);

  logger.info('synthesis', 'Pipeline result summary', {
    resources_analyzed: sorted.length,
    total_atoms: graph.summary.total_atoms,
    confirmed: graph.summary.confirmed_count,
    conflicted: graph.summary.conflicted_count,
    unvalidated: graph.summary.unvalidated_count,
    overall_confidence: graph.summary.overall_confidence,
    triggers_total: allTriggers.length,
    total_duration_ms: totalDuration,
  });

  return {
    phases,
    final_graph: graph,
    all_triggers: allTriggers,
    overall_confidence: graph.summary.overall_confidence,
    resources_analyzed: sorted.length,
    total_duration_ms: totalDuration,
  };
}
