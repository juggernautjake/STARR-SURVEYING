// lib/research/criteria-triggers.ts — Criteria-based trigger & review system
//
// Defines a structured framework of "trigger rules" that fire when specific
// criteria are met during the research pipeline. When a trigger fires, it
// instructs the AI and code on what action to take — re-compare data, zoom
// deeper into GIS, cross-reference with a previously analyzed resource, etc.
//
// The trigger system operates on the ValidationGraph and accumulated analysis
// results, checking conditions after each pipeline phase completes.
//
// Trigger categories:
//   PROPERTY_ID_FOUND    — We found a property ID; verify lot/parcel uses it
//   LOT_IDENTIFIED       — Lot was identified; verify address matches that lot
//   DEED_FOUND           — Deed info found; compare with plat info
//   PLAT_FOUND           — Plat info found; compare with GIS data
//   ADDRESS_MISMATCH     — Address on lot doesn't match search address
//   LOT_CONFLICT         — Multiple sources disagree on lot number
//   ACREAGE_MISMATCH     — Computed acreage differs from stated
//   NEW_SOURCE_AVAILABLE — A new resource was analyzed; compare with all prior
//   CONFIDENCE_LOW       — Overall confidence dropped below threshold
//   ZOOM_NEEDED          — GIS data too coarse; need to zoom in further

import { PipelineLogger } from './pipeline-logger';
import type { ValidationGraph, AtomCategory, DataAtom } from './cross-validation.service';

// ── Types ────────────────────────────────────────────────────────────────────

export type TriggerAction =
  | 'REVIEW_PROPERTY_ID'
  | 'REVIEW_LOT_AGAINST_ADDRESS'
  | 'COMPARE_DEED_TO_PLAT'
  | 'COMPARE_PLAT_TO_GIS'
  | 'COMPARE_NEW_TO_ALL'
  | 'ZOOM_GIS_DEEPER'
  | 'RECAPTURE_MAP'
  | 'RESOLVE_LOT_CONFLICT'
  | 'RESOLVE_ACREAGE_MISMATCH'
  | 'FLAG_FOR_HUMAN_REVIEW'
  | 'VERIFY_ADDRESS_ON_LOT'
  | 'CROSS_CHECK_DEED_LEGAL_DESC'
  | 'RE_ANALYZE_WITH_CONTEXT'
  | 'SKIP_NO_ACTION';

export type TriggerPriority = 'critical' | 'high' | 'medium' | 'low';

export interface TriggerRule {
  /** Unique rule ID */
  id: string;
  /** Human-readable description */
  description: string;
  /** When this trigger can fire */
  fires_after: string[];
  /** Priority determines execution order */
  priority: TriggerPriority;
  /** The action to take when triggered */
  action: TriggerAction;
  /** Detailed instructions for what the action should do */
  action_instructions: string;
  /** Function that evaluates the condition */
  evaluate: (ctx: TriggerContext) => TriggerResult;
}

export interface TriggerContext {
  /** The current validation graph */
  graph: ValidationGraph;
  /** What phase just completed */
  completed_phase: string;
  /** Address being searched */
  address: string;
  /** Known property ID (if any) */
  property_id?: string;
  /** Lot identified so far */
  identified_lot?: string;
  /** Block identified so far */
  identified_block?: string;
  /** Subdivision identified so far */
  identified_subdivision?: string;
  /** Number of resources analyzed so far */
  resources_analyzed: number;
  /** Current GIS zoom level */
  current_zoom_level?: number;
  /** Whether we have satellite imagery */
  has_satellite_imagery: boolean;
  /** Whether we have GIS parcel data */
  has_gis_data: boolean;
  /** Whether we have plat documents */
  has_plat: boolean;
  /** Whether we have deed documents */
  has_deed: boolean;
  /** All accumulated resource labels */
  resource_labels: string[];
  /** Overall confidence so far */
  confidence: number;
}

export interface TriggerResult {
  /** Whether the trigger should fire */
  fired: boolean;
  /** Why it fired (or why not) */
  reason: string;
  /** Additional context for the action */
  context?: Record<string, unknown>;
}

export interface FiredTrigger {
  rule: TriggerRule;
  result: TriggerResult;
  fired_at: string;
  /** Whether the action was executed */
  executed: boolean;
  /** Result of executing the action */
  execution_result?: string;
}

// ── Trigger Rules Registry ───────────────────────────────────────────────────

export const TRIGGER_RULES: TriggerRule[] = [
  // ── Property ID Found ──────────────────────────────────────────────────
  {
    id: 'PROP_ID_VERIFY_LOT',
    description: 'When a property ID is found, verify the identified lot/parcel uses that property ID',
    fires_after: ['resource_analyze', 'cross_validate', 'lot_identify'],
    priority: 'critical',
    action: 'REVIEW_PROPERTY_ID',
    action_instructions: `When we find or confirm a property ID:
      1. Look up all lot_number atoms in the graph
      2. Check if any lot atom is linked to this property ID
      3. If the identified lot does NOT match the property ID's lot → flag as CRITICAL conflict
      4. If they match → boost confidence on both the property ID and lot number
      5. Query ArcGIS with the property ID to get authoritative lot/block data
      6. Compare ArcGIS lot data against ALL other lot sources`,
    evaluate: (ctx) => {
      const propIdAtoms = ctx.graph.atoms.filter(a => a.category === 'property_id');
      const lotAtoms = ctx.graph.atoms.filter(a => a.category === 'lot_number');

      if (propIdAtoms.length === 0) {
        return { fired: false, reason: 'No property ID found yet' };
      }
      if (lotAtoms.length === 0) {
        return { fired: true, reason: 'Property ID found but no lot number yet — need to verify', context: { prop_ids: propIdAtoms.map(a => a.value) } };
      }

      // Check if property ID and lot are from different sources (need cross-check)
      const propSources = new Set(propIdAtoms.map(a => a.source));
      const lotSources = new Set(lotAtoms.map(a => a.source));
      const sharedSources = [...propSources].filter(s => lotSources.has(s));

      if (sharedSources.length === 0) {
        return {
          fired: true,
          reason: 'Property ID and lot number are from different sources — cross-check needed',
          context: { prop_sources: [...propSources], lot_sources: [...lotSources] },
        };
      }

      return { fired: false, reason: 'Property ID and lot number already cross-referenced' };
    },
  },

  // ── Lot Identified — Verify Address ────────────────────────────────────
  {
    id: 'LOT_VERIFY_ADDRESS',
    description: 'When a lot is identified, verify the search address shows up on that specific lot',
    fires_after: ['lot_identify', 'visual_compare'],
    priority: 'critical',
    action: 'VERIFY_ADDRESS_ON_LOT',
    action_instructions: `When a lot is identified:
      1. Get all situs_address atoms for the identified lot's property ID
      2. Compare the search address to the situs address on the lot
      3. If they match → confirm lot identification
      4. If they DON'T match → the pin may be on the wrong lot
         a. Check adjacent lots for the correct address
         b. If found on an adjacent lot → update lot identification
         c. If not found → flag for human review
      5. Verify the map pin screenshot shows the pin on the identified lot`,
    evaluate: (ctx) => {
      if (!ctx.identified_lot) {
        return { fired: false, reason: 'No lot identified yet' };
      }

      const addressAtoms = ctx.graph.atoms.filter(a => a.category === 'situs_address');
      const lotIdAtoms = ctx.graph.atoms.filter(a => a.category === 'lot_identification');

      if (addressAtoms.length === 0) {
        return { fired: true, reason: 'Lot identified but no address data to verify against', context: { lot: ctx.identified_lot } };
      }

      // Check if any address atom conflicts
      const conflicts = ctx.graph.conflicts.filter(c =>
        c.category === 'situs_address' && !c.resolved,
      );

      if (conflicts.length > 0) {
        return {
          fired: true,
          reason: `Address conflicts detected — need to verify which address belongs to lot ${ctx.identified_lot}`,
          context: { lot: ctx.identified_lot, conflict_count: conflicts.length },
        };
      }

      return { fired: false, reason: 'Address verification already confirmed' };
    },
  },

  // ── Deed Found — Compare to Plat ──────────────────────────────────────
  {
    id: 'DEED_VS_PLAT',
    description: 'When deed information is found, compare it against plat information',
    fires_after: ['resource_analyze', 'cross_validate'],
    priority: 'high',
    action: 'COMPARE_DEED_TO_PLAT',
    action_instructions: `When deed data is available alongside plat data:
      1. Compare lot numbers: deed lot vs plat lot
      2. Compare block numbers: deed block vs plat block
      3. Compare subdivision names: deed subdivision vs plat subdivision
      4. Compare legal descriptions: deed calls vs plat dimensions
      5. Compare acreage: deed stated area vs plat computed area
      6. Check if deed references this specific plat (cabinet/slide)
      7. Look for replat history — lot numbers may have changed
      8. Flag any discrepancies as HIGH priority
      9. If deed and plat agree on lot/block → boost confidence significantly`,
    evaluate: (ctx) => {
      if (!ctx.has_deed || !ctx.has_plat) {
        return { fired: false, reason: `Need both deed (${ctx.has_deed}) and plat (${ctx.has_plat}) data` };
      }

      const deedSources = ctx.graph.atoms.filter(a => a.source === 'deed_text');
      const platSources = ctx.graph.atoms.filter(a => a.source === 'plat_text' || a.source === 'plat_image');

      if (deedSources.length === 0 || platSources.length === 0) {
        return { fired: false, reason: 'No actual deed or plat atoms extracted yet' };
      }

      // Check if deed and plat have been cross-validated already
      const deedLots = deedSources.filter(a => a.category === 'lot_number');
      const platLots = platSources.filter(a => a.category === 'lot_number');

      if (deedLots.length > 0 && platLots.length > 0) {
        const anyConfirmed = deedLots.some(d =>
          d.confirmed_by.some(cId =>
            platLots.some(p => p.id === cId),
          ),
        );

        if (!anyConfirmed) {
          return {
            fired: true,
            reason: 'Deed and plat lot numbers not yet cross-validated',
            context: {
              deed_lots: deedLots.map(a => a.value),
              plat_lots: platLots.map(a => a.value),
            },
          };
        }
      }

      return { fired: false, reason: 'Deed and plat already cross-validated' };
    },
  },

  // ── Plat Found — Compare to GIS ───────────────────────────────────────
  {
    id: 'PLAT_VS_GIS',
    description: 'When plat info is found, compare it against GIS/CAD parcel data',
    fires_after: ['resource_analyze', 'cross_validate'],
    priority: 'high',
    action: 'COMPARE_PLAT_TO_GIS',
    action_instructions: `When plat data is available alongside GIS parcel data:
      1. Compare lot numbers: plat lot numbering vs GIS lot field
      2. Compare acreage: plat stated area vs GIS legal_acreage
      3. Compare dimensions: plat dimensions vs GIS geometry-derived dimensions
      4. Compare subdivision name: plat header vs GIS subdivision code/description
      5. Verify lot shapes match between plat layout and GIS boundaries
      6. Check for renumbering: plat may show original lots that were later replated
      7. If GIS has geometry, compute area and compare to plat stated area
      8. Flag any discrepancies for review`,
    evaluate: (ctx) => {
      if (!ctx.has_plat || !ctx.has_gis_data) {
        return { fired: false, reason: `Need both plat (${ctx.has_plat}) and GIS (${ctx.has_gis_data}) data` };
      }

      const gisSources = ctx.graph.atoms.filter(a => a.source === 'arcgis_query');
      const platSources = ctx.graph.atoms.filter(a => a.source === 'plat_text' || a.source === 'plat_image');

      if (gisSources.length === 0 || platSources.length === 0) {
        return { fired: false, reason: 'No actual GIS or plat atoms extracted yet' };
      }

      // Check for acreage discrepancies
      const gisAcreage = gisSources.filter(a => a.category === 'acreage');
      const platAcreage = platSources.filter(a => a.category === 'acreage');

      if (gisAcreage.length > 0 && platAcreage.length > 0) {
        const gisVal = parseFloat(gisAcreage[0].value);
        const platVal = parseFloat(platAcreage[0].value);
        if (!isNaN(gisVal) && !isNaN(platVal)) {
          const pctDiff = Math.abs(gisVal - platVal) / Math.max(gisVal, platVal) * 100;
          if (pctDiff > 5) {
            return {
              fired: true,
              reason: `Acreage discrepancy: GIS=${gisVal} vs plat=${platVal} (${pctDiff.toFixed(1)}% difference)`,
              context: { gis_acreage: gisVal, plat_acreage: platVal, pct_diff: pctDiff },
            };
          }
        }
      }

      return { fired: false, reason: 'GIS and plat data are consistent' };
    },
  },

  // ── Satellite + GIS — Verify Address on Correct Lot ────────────────────
  {
    id: 'SATELLITE_GIS_VERIFY',
    description: 'When satellite imagery and GIS data are both available, verify address appears on correct lot/parcel',
    fires_after: ['map_capture', 'visual_compare', 'lot_identify'],
    priority: 'critical',
    action: 'VERIFY_ADDRESS_ON_LOT',
    action_instructions: `When satellite imagery and GIS parcel data are both available:
      1. Identify the building/structure on the satellite image at the pin location
      2. Overlay this position against the GIS parcel boundaries
      3. Determine which parcel polygon contains the pin/building
      4. Get the lot number, block, and address for that parcel from GIS
      5. Compare the GIS situs address to the search address
      6. If the building is clearly within the parcel boundary → confirm lot
      7. If the building straddles two parcels → flag as needing survey clarification
      8. If the pin is in a different parcel than expected → investigate
      9. Check that the parcel with the matching address has a building consistent with satellite`,
    evaluate: (ctx) => {
      if (!ctx.has_satellite_imagery || !ctx.has_gis_data) {
        return { fired: false, reason: `Need both satellite imagery (${ctx.has_satellite_imagery}) and GIS data (${ctx.has_gis_data})` };
      }

      // Fire if we haven't confirmed lot identification yet
      if (!ctx.identified_lot) {
        return { fired: true, reason: 'Satellite and GIS available but lot not yet identified' };
      }

      // Fire if confidence is below threshold
      if (ctx.confidence < 70) {
        return {
          fired: true,
          reason: `Lot identified (${ctx.identified_lot}) but confidence is low (${ctx.confidence}%) — re-verify with imagery`,
          context: { lot: ctx.identified_lot, confidence: ctx.confidence },
        };
      }

      return { fired: false, reason: 'Lot identification already confirmed with adequate confidence' };
    },
  },

  // ── New Source — Compare Against All Prior Sources ─────────────────────
  {
    id: 'NEW_SOURCE_CROSS_CHECK',
    description: 'Each time a new resource is analyzed, compare its data against ALL previously extracted data',
    fires_after: ['resource_analyze'],
    priority: 'high',
    action: 'COMPARE_NEW_TO_ALL',
    action_instructions: `After analyzing each new resource:
      1. Get all new atoms created from the latest resource
      2. For each new atom, find all existing atoms in the same category
      3. Compare values — exact match, approximate match, or conflict
      4. For matches: confirm both atoms (boost confidence)
      5. For conflicts: create a conflict record with severity assessment
      6. For unique data (no existing atoms in that category): mark as unvalidated
      7. Update overall confidence based on new cross-validation results
      8. Log every comparison result (match, partial match, or conflict)
      9. If a critical conflict is found (e.g., lot number disagrees), halt and flag`,
    evaluate: (ctx) => {
      if (ctx.resources_analyzed < 2) {
        return { fired: false, reason: 'Need at least 2 resources to cross-check' };
      }

      // Check if there are any unvalidated atoms (atoms from only one source)
      const unvalidated = ctx.graph.atoms.filter(a => a.validation_state === 'unvalidated');
      if (unvalidated.length > 0) {
        return {
          fired: true,
          reason: `${unvalidated.length} atoms still unvalidated after ${ctx.resources_analyzed} resources`,
          context: {
            unvalidated_categories: [...new Set(unvalidated.map(a => a.category))],
            resources_analyzed: ctx.resources_analyzed,
          },
        };
      }

      return { fired: false, reason: 'All atoms have been cross-validated' };
    },
  },

  // ── GIS Zoom Needed ────────────────────────────────────────────────────
  {
    id: 'ZOOM_DEEPER',
    description: 'When GIS data at current zoom level does not show individual lots/parcels, zoom in further',
    fires_after: ['gis_zoom', 'map_capture'],
    priority: 'high',
    action: 'ZOOM_GIS_DEEPER',
    action_instructions: `When the current GIS zoom level doesn't resolve individual parcels:
      1. Check if lot numbers are visible in the captured GIS image
      2. If no lot numbers visible at zoom 18, try zoom 19
      3. If no lot numbers visible at zoom 19, try zoom 20
      4. If no lot numbers visible at zoom 20, try zoom 21 (max zoom)
      5. At each zoom level, re-query the ArcGIS parcel layer for lot data
      6. Once individual lots are visible, capture the image and proceed
      7. Also check if subdivision labels become visible at tighter zoom
      8. Log each zoom attempt and what was/wasn't visible`,
    evaluate: (ctx) => {
      if (!ctx.has_gis_data) {
        return { fired: false, reason: 'No GIS data yet' };
      }

      const currentZoom = ctx.current_zoom_level ?? 18;
      const lotAtoms = ctx.graph.atoms.filter(a =>
        a.category === 'lot_number' && a.source === 'ai_vision',
      );

      if (lotAtoms.length === 0 && currentZoom < 21) {
        return {
          fired: true,
          reason: `No lot numbers visible from GIS at zoom ${currentZoom} — need to zoom in`,
          context: { current_zoom: currentZoom, suggested_zoom: Math.min(currentZoom + 1, 21) },
        };
      }

      return { fired: false, reason: 'Lot numbers already visible from GIS data' };
    },
  },

  // ── Lot Conflict Resolution ────────────────────────────────────────────
  {
    id: 'LOT_CONFLICT_RESOLVE',
    description: 'When multiple sources disagree on lot number, trigger deep comparison',
    fires_after: ['cross_validate', 'resource_analyze'],
    priority: 'critical',
    action: 'RESOLVE_LOT_CONFLICT',
    action_instructions: `When lot number conflicts are detected:
      1. List every lot number atom with its source, confidence, and extraction method
      2. Rank sources by authority: recorded plat > deed > ArcGIS > AI vision > geocoding
      3. Check if conflict is due to replat (lot numbers changed over time)
      4. Check if conflict is due to phase differences (Phase 1 vs Phase 2 of same subdivision)
      5. Check adjacent lot numbering patterns to determine which makes sense
      6. If the address falls between two lots, check building position on satellite
      7. Document the resolution and the reasoning
      8. Set the winning lot number atom to confirmed, reject the losing one`,
    evaluate: (ctx) => {
      const lotConflicts = ctx.graph.conflicts.filter(
        c => c.category === 'lot_number' && !c.resolved,
      );

      if (lotConflicts.length === 0) {
        return { fired: false, reason: 'No unresolved lot number conflicts' };
      }

      const criticalConflicts = lotConflicts.filter(c => c.severity === 'critical' || c.severity === 'major');
      if (criticalConflicts.length > 0) {
        return {
          fired: true,
          reason: `${criticalConflicts.length} critical/major lot number conflict(s) need resolution`,
          context: {
            conflicts: criticalConflicts.map(c => ({
              id: c.id,
              description: c.description,
              severity: c.severity,
            })),
          },
        };
      }

      return { fired: false, reason: 'Lot conflicts are minor/trivial' };
    },
  },

  // ── Confidence Drop ────────────────────────────────────────────────────
  {
    id: 'LOW_CONFIDENCE',
    description: 'When overall confidence drops below 60%, trigger additional verification',
    fires_after: ['cross_validate', 'lot_identify', 'resource_analyze'],
    priority: 'high',
    action: 'RE_ANALYZE_WITH_CONTEXT',
    action_instructions: `When confidence is below the threshold:
      1. Identify which categories have the lowest confidence
      2. Determine which additional sources might help (e.g., missing plat, missing deed)
      3. If map images exist but lot wasn't identified → try different zoom levels
      4. If lot was identified but with low confidence → capture additional context maps
      5. If no satellite imagery → capture it
      6. If no GIS data → try different search queries
      7. Recommend specific next steps to improve confidence`,
    evaluate: (ctx) => {
      if (ctx.confidence >= 60) {
        return { fired: false, reason: `Confidence ${ctx.confidence}% is above 60% threshold` };
      }

      if (ctx.resources_analyzed < 2) {
        return { fired: false, reason: 'Not enough resources analyzed yet — too early to judge' };
      }

      return {
        fired: true,
        reason: `Overall confidence ${ctx.confidence}% is below 60% threshold after ${ctx.resources_analyzed} resources`,
        context: {
          confidence: ctx.confidence,
          resources_analyzed: ctx.resources_analyzed,
          has_satellite: ctx.has_satellite_imagery,
          has_gis: ctx.has_gis_data,
          has_plat: ctx.has_plat,
          has_deed: ctx.has_deed,
        },
      };
    },
  },

  // ── Deed Legal Description Cross-Check ─────────────────────────────────
  {
    id: 'DEED_LEGAL_DESC_CHECK',
    description: 'When deed data includes a legal description, cross-check with GIS and plat legal descriptions',
    fires_after: ['resource_analyze', 'cross_validate'],
    priority: 'high',
    action: 'CROSS_CHECK_DEED_LEGAL_DESC',
    action_instructions: `When a legal description is extracted from a deed:
      1. Parse the legal description for lot, block, subdivision references
      2. Compare parsed references against lot_number, block_number, subdivision_name atoms
      3. If the deed says "Lot 7, Block 2, Oak Hills Addition" but GIS says Lot 8 → CRITICAL
      4. Extract any metes & bounds calls from the legal description
      5. Compare boundary calls against any plat dimensions
      6. If the deed references a plat (Cabinet/Slide), verify we have that plat
      7. If not, note it as a data gap for field survey reference`,
    evaluate: (ctx) => {
      const legalDescAtoms = ctx.graph.atoms.filter(a => a.category === 'legal_description');
      if (legalDescAtoms.length === 0) {
        return { fired: false, reason: 'No legal description atoms found' };
      }

      const lotAtoms = ctx.graph.atoms.filter(a => a.category === 'lot_number');
      const blockAtoms = ctx.graph.atoms.filter(a => a.category === 'block_number');

      // Fire if we have a legal description but haven't cross-checked it with lot/block
      if (lotAtoms.length > 0) {
        const legalDescSources = new Set(legalDescAtoms.map(a => a.source));
        const lotSources = new Set(lotAtoms.map(a => a.source));
        const overlap = [...legalDescSources].some(s => lotSources.has(s));

        if (!overlap) {
          return {
            fired: true,
            reason: 'Legal description and lot number from different sources — need cross-check',
            context: {
              legal_desc_sources: [...legalDescSources],
              lot_sources: [...lotSources],
            },
          };
        }
      }

      return { fired: false, reason: 'Legal description already cross-referenced' };
    },
  },
];

// ── Trigger Evaluator ────────────────────────────────────────────────────────

/**
 * Evaluate all trigger rules against the current pipeline state.
 * Returns a list of triggers that fired, sorted by priority.
 */
export function evaluateTriggers(
  ctx: TriggerContext,
  logger: PipelineLogger,
): FiredTrigger[] {
  const priorityOrder: Record<TriggerPriority, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };

  const fired: FiredTrigger[] = [];

  for (const rule of TRIGGER_RULES) {
    // Only evaluate rules that fire after the completed phase
    if (!rule.fires_after.includes(ctx.completed_phase)) continue;

    try {
      const result = rule.evaluate(ctx);

      if (result.fired) {
        logger.trigger('trigger_check', rule.id, result.reason, {
          action: rule.action,
          context: result.context,
        });

        fired.push({
          rule,
          result,
          fired_at: new Date().toISOString(),
          executed: false,
        });
      } else {
        logger.debug('trigger_check', `Trigger ${rule.id} did NOT fire: ${result.reason}`);
      }
    } catch (err) {
      logger.error('trigger_check', `Trigger ${rule.id} evaluation error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Sort by priority
  fired.sort((a, b) => priorityOrder[a.rule.priority] - priorityOrder[b.rule.priority]);

  if (fired.length > 0) {
    logger.info('trigger_check', `${fired.length} trigger(s) fired after ${ctx.completed_phase}`, {
      triggers: fired.map(f => ({ id: f.rule.id, action: f.rule.action, priority: f.rule.priority })),
    });
  }

  return fired;
}

/**
 * Build a TriggerContext from the current pipeline state.
 */
export function buildTriggerContext(params: {
  graph: ValidationGraph;
  completed_phase: string;
  address: string;
  resources_analyzed: number;
  current_zoom_level?: number;
  resource_labels: string[];
}): TriggerContext {
  const { graph, completed_phase, address, resources_analyzed, current_zoom_level, resource_labels } = params;

  // Extract identified values from graph
  const lotAtoms = graph.atoms
    .filter(a => a.category === 'lot_number')
    .sort((a, b) => b.confidence - a.confidence);
  const blockAtoms = graph.atoms
    .filter(a => a.category === 'block_number')
    .sort((a, b) => b.confidence - a.confidence);
  const subdivAtoms = graph.atoms
    .filter(a => a.category === 'subdivision_name')
    .sort((a, b) => b.confidence - a.confidence);
  const propIdAtoms = graph.atoms
    .filter(a => a.category === 'property_id')
    .sort((a, b) => b.confidence - a.confidence);

  return {
    graph,
    completed_phase,
    address,
    property_id: propIdAtoms[0]?.value,
    identified_lot: lotAtoms[0]?.value,
    identified_block: blockAtoms[0]?.value,
    identified_subdivision: subdivAtoms[0]?.value,
    resources_analyzed,
    current_zoom_level,
    has_satellite_imagery: graph.atoms.some(a =>
      a.source === 'usgs_imagery' || a.source === 'google_maps' || a.source === 'ai_vision',
    ),
    has_gis_data: graph.atoms.some(a => a.source === 'arcgis_query'),
    has_plat: graph.atoms.some(a => a.source === 'plat_text' || a.source === 'plat_image'),
    has_deed: graph.atoms.some(a => a.source === 'deed_text'),
    resource_labels,
    confidence: graph.summary.overall_confidence,
  };
}

/**
 * Get a summary of all available trigger rules.
 */
export function getTriggerRulesSummary(): Array<{
  id: string;
  description: string;
  priority: TriggerPriority;
  action: TriggerAction;
}> {
  return TRIGGER_RULES.map(r => ({
    id: r.id,
    description: r.description,
    priority: r.priority,
    action: r.action,
  }));
}
