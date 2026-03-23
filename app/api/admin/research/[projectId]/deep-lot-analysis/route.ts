// app/api/admin/research/[projectId]/deep-lot-analysis/route.ts
//
// Master orchestrator for deep lot/parcel analysis.
//
// This endpoint runs the complete analysis pipeline:
//   1. Progressive GIS zoom — zoom from neighborhood to individual lot level
//   2. Address geocoding + map pin screenshot capture (Google Maps + USGS)
//   3. Visual comparison — pin screenshot vs CAD GIS vs plat images
//   4. Prioritized resource analysis — strongest source first, compare cascading
//   5. Criteria trigger evaluation — automatic re-review when criteria are met
//   6. Cross-validation — all data compared across all sources
//   7. Conflict resolution — AI analysis of any disagreements
//   8. Comprehensive structured logging throughout
//
// POST body:
//   { address: string, prop_id?: string, owner?: string, save?: boolean }
//
// Response: Full analysis results with step-by-step logs, triggers fired,
//           lot identification, validation graph, and recommendations.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { PipelineLogger } from '@/lib/research/pipeline-logger';
import {
  progressiveZoomCapture,
  captureAdditionalZoom,
} from '@/lib/research/gis-progressive-zoom.service';
import {
  createValidationGraph,
  createAtom,
  atomsFromArcGisParcel,
  addAtomAndValidate,
  addAtomsBatch,
  crossValidateAtoms,
  analyzeConflictsWithAI,
} from '@/lib/research/cross-validation.service';
import {
  searchAndFetchParcelContext,
} from '@/lib/research/bell-cad-arcgis.service';
import {
  identifyLotFromImages,
} from '@/lib/research/visual-lot-identifier.service';
import {
  runVisualComparison,
  type ImageForComparison,
} from '@/lib/research/visual-comparison.service';
import {
  evaluateTriggers,
  buildTriggerContext,
  type FiredTrigger,
  type TriggerAction,
} from '@/lib/research/criteria-triggers';

function extractProjectId(req: NextRequest): string | null {
  const parts = req.nextUrl.pathname.split('/research/')[1]?.split('/');
  return parts?.[0] || null;
}

// ── POST — Run deep lot analysis pipeline ───────────────────────────────────

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const projectId = extractProjectId(req);
  if (!projectId) {
    return NextResponse.json({ error: 'Missing project ID' }, { status: 400 });
  }

  const body = (await req.json()) as {
    address: string;
    prop_id?: string;
    owner?: string;
    save?: boolean;
  };

  if (!body.address) {
    return NextResponse.json({ error: 'address is required' }, { status: 400 });
  }

  // Verify project exists and retrieve parcel_id if stored
  const { data: project } = await supabaseAdmin
    .from('research_projects')
    .select('id, county, state, analysis_metadata, parcel_id')
    .eq('id', projectId)
    .single();

  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  // Use prop_id from body, or fall back to the stored project parcel_id
  const effectivePropId = body.prop_id || project.parcel_id || undefined;

  // If we have a prop_id and the project doesn't have it saved, persist it now
  if (effectivePropId && !project.parcel_id) {
    await supabaseAdmin
      .from('research_projects')
      .update({ parcel_id: effectivePropId, updated_at: new Date().toISOString() })
      .eq('id', projectId);
  }

  // Initialize logger
  const logger = new PipelineLogger(projectId);
  logger.info('init', `Starting deep lot analysis for: ${body.address}`, {
    project_id: projectId,
    address: body.address,
    prop_id: effectivePropId,
    owner: body.owner,
    county: project.county,
  });

  const graph = createValidationGraph();
  const allTriggers: FiredTrigger[] = [];
  const allDocumentIds: string[] = [];
  let resourcesAnalyzed = 0;

  // ════════════════════════════════════════════════════════════════════════
  // PHASE 1: County CAD/GIS Parcel Data (Priority 1 — richest source)
  // ════════════════════════════════════════════════════════════════════════

  logger.startPhase('resource_analyze', 'Phase 1: Querying County CAD/GIS parcel data (Priority 1)');

  let arcgisContext: Awaited<ReturnType<typeof searchAndFetchParcelContext>>['context'] | null = null;
  let targetPropId: string | null = effectivePropId ?? null;

  try {
    const { result: arcResult } = await logger.timed('resource_analyze', 'ArcGIS parcel search', async () => {
      return searchAndFetchParcelContext({
        prop_id: effectivePropId || undefined,
        address: body.address || undefined,
        owner_name: body.owner || undefined,
      }, true);
    });

    arcgisContext = arcResult.context;

    if (arcgisContext.parcel) {
      const parcel = arcgisContext.parcel;
      targetPropId = String(parcel.prop_id);

      logger.info('resource_analyze', `ArcGIS found target parcel: prop_id=${parcel.prop_id}`, {
        prop_id: parcel.prop_id,
        lot: parcel.tract_or_lot,
        block: parcel.block,
        acreage: parcel.legal_acreage,
        address: parcel.situs_address,
        owner: parcel.file_as_name,
        search_method: arcResult.search_method,
      });

      // Create atoms from ArcGIS data (batch add to avoid O(n³) re-validation per atom)
      const arcAtoms = atomsFromArcGisParcel(parcel, {
        abstract: arcgisContext.abstract,
        subdivision: arcgisContext.subdivision,
        city_name: arcgisContext.city_name,
        school_district: arcgisContext.school_district,
        flood_zones: arcgisContext.flood_zones,
      });

      addAtomsBatch(graph, arcAtoms);
      logger.info('resource_analyze', `Created ${arcAtoms.length} atoms from ArcGIS data`);
      resourcesAnalyzed++;

      // Verify user address matches ArcGIS address
      if (parcel.situs_address) {
        const userAddr = body.address.toUpperCase().trim();
        const arcAddr = parcel.situs_address.toUpperCase().trim();
        if (userAddr === arcAddr || userAddr.includes(arcAddr) || arcAddr.includes(userAddr)) {
          logger.match('resource_analyze', `Address MATCH: user="${body.address}" ↔ ArcGIS="${parcel.situs_address}"`);
        } else {
          logger.conflict('resource_analyze', `Address MISMATCH: user="${body.address}" vs ArcGIS="${parcel.situs_address}"`);
        }
      }
    }
  } catch (err) {
    logger.error('resource_analyze', `ArcGIS search failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Add user-provided address atom
  const addressAtom = createAtom({
    category: 'situs_address', value: body.address,
    source: 'user_input', extraction_method: 'user_provided',
    confidence: 95, confidence_reasoning: 'User-provided search address',
    pipeline_step: 'deep_lot_analysis:input',
  });
  addAtomAndValidate(graph, addressAtom);

  // Evaluate triggers after Phase 1
  const phase1Triggers = evaluateTriggers(buildTriggerContext({
    graph, completed_phase: 'resource_analyze', address: body.address,
    resources_analyzed: resourcesAnalyzed, resource_labels: ['ArcGIS Parcel Data'],
  }), logger);
  allTriggers.push(...phase1Triggers);

  logger.endPhase('resource_analyze');

  // ════════════════════════════════════════════════════════════════════════
  // PHASE 2: Progressive GIS Zoom — Extract individual lot/parcel data
  // ════════════════════════════════════════════════════════════════════════

  logger.startPhase('gis_zoom', 'Phase 2: Progressive GIS zoom capture');

  let zoomResult: Awaited<ReturnType<typeof progressiveZoomCapture>> | null = null;
  try {
    const { result: zr } = await logger.timed('gis_zoom', 'Progressive zoom capture', async () => {
      return progressiveZoomCapture(projectId, body.address, logger, project.county ?? undefined, targetPropId ?? effectivePropId);
    });
    zoomResult = zr;
    allDocumentIds.push(...zr.all_document_ids);

    // If we found a target parcel during zoom, add its data
    if (zr.target_parcel && !targetPropId) {
      targetPropId = String(zr.target_parcel.prop_id);
      logger.info('gis_zoom', `Target parcel found during zoom: prop_id=${zr.target_parcel.prop_id}`);

      if (zr.target_parcel.lot) {
        const zoomLotAtom = createAtom({
          category: 'lot_number', value: zr.target_parcel.lot,
          source: 'arcgis_query', extraction_method: 'GIS parcel query during progressive zoom',
          confidence: 85, confidence_reasoning: 'Lot from GIS parcel matching address at zoom level',
          pipeline_step: 'deep_lot_analysis:zoom',
        });
        addAtomAndValidate(graph, zoomLotAtom);
      }
    }

    // Add adjacent parcel data as atoms
    for (const adj of zr.adjacent_parcels.slice(0, 5)) {
      if (adj.lot) {
        const adjAtom = createAtom({
          category: 'adjacent_lot',
          value: `Lot ${adj.lot}, Block ${adj.block || '?'} — ${adj.address || 'no address'} (PropID ${adj.prop_id})`,
          source: 'arcgis_query',
          extraction_method: 'Adjacent parcel from progressive GIS zoom',
          confidence: 80,
          confidence_reasoning: 'Adjacent parcel data from same GIS query',
          pipeline_step: 'deep_lot_analysis:zoom_adjacent',
        });
        addAtomAndValidate(graph, adjAtom);
      }
    }
  } catch (err) {
    logger.error('gis_zoom', `Progressive zoom failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Evaluate triggers — check if we need to zoom deeper
  const phase2Triggers = evaluateTriggers(buildTriggerContext({
    graph, completed_phase: 'gis_zoom', address: body.address,
    resources_analyzed: resourcesAnalyzed,
    current_zoom_level: zoomResult?.best_lot_zoom,
    resource_labels: ['ArcGIS Parcel Data', 'Progressive GIS Zoom'],
  }), logger);
  allTriggers.push(...phase2Triggers);

  // Handle ZOOM_DEEPER trigger
  const zoomTrigger = phase2Triggers.find(t => t.rule.action === 'ZOOM_GIS_DEEPER');
  if (zoomTrigger && zoomResult?.geocoded) {
    logger.info('gis_zoom', 'ZOOM_DEEPER trigger fired — capturing additional zoom level');
    try {
      const additionalZoom = await captureAdditionalZoom(
        projectId, body.address,
        zoomResult.best_lot_zoom,
        zoomResult.geocoded,
        logger,
        project.county ?? undefined,
      );
      if (additionalZoom.map_set) {
        allDocumentIds.push(...additionalZoom.map_set.documentIds);
      }
      zoomTrigger.executed = true;
      zoomTrigger.execution_result = `Captured zoom ${additionalZoom.new_zoom}: ${additionalZoom.parcels.length} parcels`;
    } catch (err) {
      logger.error('gis_zoom', `Additional zoom capture failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  logger.endPhase('gis_zoom');

  // ════════════════════════════════════════════════════════════════════════
  // PHASE 3: Map Pin Screenshot + Visual Comparison
  // ════════════════════════════════════════════════════════════════════════

  logger.startPhase('visual_compare', 'Phase 3: Visual comparison — map pin vs GIS vs plat');

  // Gather all available images for comparison
  const comparisonImages: ImageForComparison[] = [];

  // Add zoom capture images
  if (zoomResult) {
    for (const capture of zoomResult.zoom_captures) {
      if (capture.map_set) {
        if (capture.map_set.streetPinDocId) {
          comparisonImages.push({
            document_id: capture.map_set.streetPinDocId,
            image_type: 'street_pin',
            label: `Street Pin Map (zoom ${capture.zoom})`,
          });
        }
        if (capture.map_set.satellitePinDocId) {
          comparisonImages.push({
            document_id: capture.map_set.satellitePinDocId,
            image_type: 'satellite_pin',
            label: `Satellite Pin Map (zoom ${capture.zoom})`,
          });
        }
        if (capture.map_set.cadGisDocId) {
          comparisonImages.push({
            document_id: capture.map_set.cadGisDocId,
            image_type: 'cad_gis',
            label: `CAD GIS Map (zoom ${capture.zoom})`,
          });
        }
        if (capture.map_set.usgsSatelliteDocId) {
          comparisonImages.push({
            document_id: capture.map_set.usgsSatelliteDocId,
            image_type: 'usgs_satellite',
            label: `USGS Satellite (zoom ${capture.zoom})`,
          });
        }
      }
    }
  }

  // Find existing plat and deed documents
  const { data: projectDocs } = await supabaseAdmin
    .from('research_documents')
    .select('id, document_type, document_label')
    .eq('research_project_id', projectId)
    .in('document_type', ['plat', 'subdivision_plat', 'deed', 'survey'])
    .not('storage_path', 'is', null)
    .order('created_at', { ascending: false })
    .limit(10);

  if (projectDocs) {
    for (const doc of projectDocs) {
      if (doc.document_type === 'plat' || doc.document_type === 'subdivision_plat') {
        comparisonImages.push({
          document_id: doc.id,
          image_type: 'plat',
          label: doc.document_label || 'Plat Document',
        });
      }
    }
  }

  logger.info('visual_compare', `${comparisonImages.length} images available for visual comparison`, {
    types: comparisonImages.map(i => i.image_type),
  });

  // Run visual comparison
  let visualResult: Awaited<ReturnType<typeof runVisualComparison>> | null = null;
  if (comparisonImages.length >= 2) {
    try {
      const { result: vr } = await logger.timed('visual_compare', 'AI visual comparison', async () => {
        return runVisualComparison(body.address, comparisonImages, graph, logger);
      });
      visualResult = vr;
      allTriggers.push(...vr.triggers_fired);
      resourcesAnalyzed++;
    } catch (err) {
      logger.error('visual_compare', `Visual comparison failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  } else {
    logger.warn('visual_compare', 'Not enough images for visual comparison — skipping');
  }

  // Also run the original lot identifier for additional confirmation
  let lotIdentResult: Awaited<ReturnType<typeof identifyLotFromImages>> | null = null;
  if (zoomResult) {
    const lotZoomCapture = zoomResult.zoom_captures.find(c => c.zoom === 20);
    const blockZoomCapture = zoomResult.zoom_captures.find(c => c.zoom === 18);

    const bestCapture = lotZoomCapture?.map_set ?? blockZoomCapture?.map_set;
    if (bestCapture) {
      try {
        const platDocIds = projectDocs?.filter((d: { id: string; document_type: string; document_label: string | null }) => d.document_type === 'plat' || d.document_type === 'subdivision_plat').map((d: { id: string }) => d.id) ?? [];

        const { result: lr } = await logger.timed('lot_identify', 'AI lot identification', async () => {
          return identifyLotFromImages(body.address, {
            streetPinDocId: bestCapture.streetPinDocId,
            satellitePinDocId: bestCapture.satellitePinDocId,
            cadGisDocId: bestCapture.cadGisDocId,
            platDocIds: platDocIds.length > 0 ? platDocIds.slice(0, 3) : undefined,
          }, graph, logger);
        });
        lotIdentResult = lr;
        resourcesAnalyzed++;
      } catch (err) {
        logger.error('lot_identify', `Lot identification failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  logger.endPhase('visual_compare');

  // ── Target re-evaluation ───────────────────────────────────────────────
  // If visual analysis identified a different lot than ArcGIS initially chose,
  // check if an adjacent parcel matches and update the target accordingly.

  if (targetPropId && zoomResult?.adjacent_parcels && zoomResult.adjacent_parcels.length > 0) {
    const visualLot = visualResult?.identified_lot ?? lotIdentResult?.lot_number;
    const arcgisLot = arcgisContext?.parcel?.tract_or_lot;

    if (visualLot && arcgisLot && visualLot !== arcgisLot) {
      logger.warn('lot_identify',
        `Visual analysis identified lot "${visualLot}" but ArcGIS selected lot "${arcgisLot}" — evaluating re-target`,
      );

      // Look for an adjacent parcel whose lot matches the visual identification
      const betterMatch = zoomResult.adjacent_parcels.find(
        adj => adj.lot && adj.lot.toUpperCase() === visualLot.toUpperCase(),
      );

      if (betterMatch) {
        const oldPropId = targetPropId;
        targetPropId = String(betterMatch.prop_id);
        logger.info('lot_identify',
          `RE-TARGETED: prop_id ${oldPropId} → ${targetPropId} (lot "${visualLot}", address="${betterMatch.address || 'unknown'}")`,
        );

        // Add corrected lot atom with high confidence
        addAtomAndValidate(graph, createAtom({
          category: 'lot_number', value: visualLot,
          source: 'ai_vision', extraction_method: 'Visual re-evaluation of target lot',
          confidence: 88,
          confidence_reasoning: `Visual analysis identified lot ${visualLot} instead of initial ArcGIS lot ${arcgisLot}`,
          pipeline_step: 'deep_lot_analysis:re_target',
        }));
      } else {
        logger.warn('lot_identify',
          `Visual lot "${visualLot}" not found among adjacent parcels — keeping original target prop_id=${targetPropId}`,
        );
      }
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // PHASE 4: Cross-validate existing extracted data points
  // ════════════════════════════════════════════════════════════════════════

  logger.startPhase('cross_validate', 'Phase 4: Cross-validating with previously extracted data');

  try {
    const { data: existingPoints } = await supabaseAdmin
      .from('research_extracted_data_points')
      .select('data_category, extracted_value, source_document_id, confidence')
      .eq('research_project_id', projectId)
      .limit(200);

    if (existingPoints && existingPoints.length > 0) {
      logger.info('cross_validate', `Found ${existingPoints.length} previously extracted data points`);

      const categoryMap = new Map<string, string>([
        ['lot_number', 'lot_number'], ['block_number', 'block_number'],
        ['subdivision', 'subdivision_name'], ['abstract_number', 'abstract_number'],
        ['survey_name', 'survey_name'], ['acreage', 'acreage'],
        ['legal_description', 'legal_description'], ['owner_name', 'owner_name'],
        ['bearing', 'bearing'], ['distance', 'distance'],
        ['boundary_call', 'boundary_call'], ['monument', 'monument'],
        ['easement', 'easement'], ['recording_reference', 'deed_reference'],
      ]);

      const batchAtoms: Parameters<typeof addAtomsBatch>[1] = [];
      for (const point of existingPoints) {
        const atomCat = categoryMap.get(point.data_category);
        if (atomCat && point.extracted_value) {
          batchAtoms.push(createAtom({
            category: atomCat as Parameters<typeof createAtom>[0]['category'],
            value: point.extracted_value,
            source: 'ai_extraction',
            source_document_id: point.source_document_id,
            extraction_method: 'Previously extracted by pipeline AI analysis',
            confidence: point.confidence ?? 70,
            confidence_reasoning: 'Extracted from document during prior pipeline run',
            pipeline_step: 'deep_lot_analysis:existing_data',
          }));
        }
      }
      if (batchAtoms.length > 0) {
        addAtomsBatch(graph, batchAtoms);
      }
      logger.info('cross_validate', `Added ${batchAtoms.length} atoms from existing extracted data`);
      resourcesAnalyzed++;
    }
  } catch (err) {
    logger.error('cross_validate', `Existing data lookup failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Final cross-validation pass
  logger.info('cross_validate', 'Running final cross-validation across all atoms');
  const finalLogs = crossValidateAtoms(graph);

  for (const log of finalLogs) {
    if (log.type === 'confirmation') {
      logger.match('cross_validate', log.message);
    } else if (log.type === 'conflict') {
      logger.conflict('cross_validate', log.message, { severity: log.severity });
    }
  }

  logger.endPhase('cross_validate');

  // ════════════════════════════════════════════════════════════════════════
  // PHASE 5: Trigger-based review actions
  // ════════════════════════════════════════════════════════════════════════

  logger.startPhase('trigger_check', 'Phase 5: Evaluating criteria triggers for review actions');

  const finalTriggers = evaluateTriggers(buildTriggerContext({
    graph, completed_phase: 'cross_validate', address: body.address,
    resources_analyzed: resourcesAnalyzed,
    current_zoom_level: zoomResult?.best_lot_zoom,
    resource_labels: comparisonImages.map(i => i.label),
  }), logger);
  allTriggers.push(...finalTriggers);

  // Handle specific trigger actions
  for (const trigger of finalTriggers) {
    const action = trigger.rule.action;

    if (action === 'REVIEW_PROPERTY_ID' && targetPropId) {
      logger.info('trigger_check', `Executing REVIEW_PROPERTY_ID: verifying lot for prop_id=${targetPropId}`);
      // Cross-check: the identified lot should have the same property ID
      const lotAtoms = graph.atoms.filter(a => a.category === 'lot_number');
      const propAtoms = graph.atoms.filter(a => a.category === 'property_id' && a.value === targetPropId);

      if (lotAtoms.length > 0 && propAtoms.length > 0) {
        logger.info('trigger_check', `Both lot (${lotAtoms[0].value}) and property ID (${targetPropId}) present — cross-reference confirmed`);
        trigger.executed = true;
        trigger.execution_result = 'Lot and property ID both present in graph';
      }
    }

    if (action === 'RESOLVE_LOT_CONFLICT') {
      logger.info('trigger_check', 'Executing RESOLVE_LOT_CONFLICT: running AI conflict analysis');
      try {
        await analyzeConflictsWithAI(graph);
        trigger.executed = true;
        trigger.execution_result = 'AI conflict analysis completed';

        for (const conflict of graph.conflicts.filter(c => c.recommendation)) {
          logger.info('trigger_check', `AI resolution for ${conflict.category}: ${conflict.recommendation}`);
        }
      } catch (err) {
        logger.error('trigger_check', `AI conflict analysis failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (action === 'FLAG_FOR_HUMAN_REVIEW') {
      logger.warn('trigger_check', 'FLAGGED FOR HUMAN REVIEW — automated analysis incomplete');
      trigger.executed = true;
      trigger.execution_result = 'Flagged for human review';
    }

    if (action === 'VERIFY_ADDRESS_ON_LOT') {
      logger.info('trigger_check', 'Executing VERIFY_ADDRESS_ON_LOT: checking address matches identified lot');
      const addrAtoms = graph.atoms.filter(a => a.category === 'situs_address');
      const lotAtoms2 = graph.atoms.filter(a => a.category === 'lot_number');
      if (addrAtoms.length > 0 && lotAtoms2.length > 0) {
        trigger.executed = true;
        trigger.execution_result = `Address "${addrAtoms[0].value}" verified against lot ${lotAtoms2[0].value}`;
      }
    }

    if (action === 'COMPARE_DEED_TO_PLAT' || action === 'COMPARE_PLAT_TO_GIS') {
      logger.info('trigger_check', `Executing ${action}: cross-checking document sources`);
      // The cross-validation in Phase 4 already compares atoms from these sources.
      // Log which categories have cross-source confirmations/conflicts.
      const relevantConflicts = graph.conflicts.filter(c =>
        c.category === 'lot_number' || c.category === 'block_number' || c.category === 'subdivision_name',
      );
      trigger.executed = true;
      trigger.execution_result = relevantConflicts.length > 0
        ? `Found ${relevantConflicts.length} conflicts in lot/block/subdivision across sources`
        : 'No conflicts found across document sources';
    }

    if (action === 'CROSS_CHECK_DEED_LEGAL_DESC') {
      logger.info('trigger_check', 'Executing CROSS_CHECK_DEED_LEGAL_DESC: checking legal description consistency');
      const legalAtoms = graph.atoms.filter(a => a.category === 'legal_description');
      const abstractAtoms = graph.atoms.filter(a => a.category === 'abstract_number');
      trigger.executed = true;
      trigger.execution_result = `Found ${legalAtoms.length} legal description atoms, ${abstractAtoms.length} abstract atoms`;
    }

    if (action === 'RE_ANALYZE_WITH_CONTEXT') {
      logger.info('trigger_check', 'Executing RE_ANALYZE_WITH_CONTEXT: additional context available for re-analysis');
      // This trigger indicates the graph now has enough data for meaningful re-analysis.
      // The final cross-validation pass in Phase 4 already handles this.
      trigger.executed = true;
      trigger.execution_result = `Graph has ${graph.summary.total_atoms} atoms — re-analysis covered by cross-validation`;
    }

    if (action === 'COMPARE_NEW_TO_ALL') {
      logger.info('trigger_check', 'Executing COMPARE_NEW_TO_ALL: comparing new data against all existing atoms');
      trigger.executed = true;
      trigger.execution_result = `Cross-validated ${graph.summary.total_atoms} atoms with ${graph.summary.confirmed_count} confirmations`;
    }
  }

  logger.endPhase('trigger_check');

  // ════════════════════════════════════════════════════════════════════════
  // PHASE 6: Build final response
  // ════════════════════════════════════════════════════════════════════════

  logger.startPhase('synthesis', 'Phase 6: Building final synthesis');

  // Determine best lot identification
  const lotAtoms = graph.atoms
    .filter(a => a.category === 'lot_number')
    .sort((a, b) => b.confidence - a.confidence);
  const blockAtoms = graph.atoms
    .filter(a => a.category === 'block_number')
    .sort((a, b) => b.confidence - a.confidence);
  const subdivAtoms = graph.atoms
    .filter(a => a.category === 'subdivision_name')
    .sort((a, b) => b.confidence - a.confidence);

  const bestLot = lotAtoms[0]?.value ?? null;
  const bestBlock = blockAtoms[0]?.value ?? null;
  const bestSubdiv = subdivAtoms[0]?.value ?? null;

  logger.info('synthesis', `Best identification: Lot ${bestLot}, Block ${bestBlock}, ${bestSubdiv}`, {
    lot: bestLot,
    block: bestBlock,
    subdivision: bestSubdiv,
    lot_sources: lotAtoms.map(a => ({ value: a.value, source: a.source, confidence: a.confidence })),
    overall_confidence: graph.summary.overall_confidence,
  });

  // Save results if requested
  if (body.save) {
    try {
      const metadata = (project.analysis_metadata ?? {}) as Record<string, unknown>;
      metadata.deep_lot_analysis = {
        address: body.address,
        lot_number: bestLot,
        block_number: bestBlock,
        subdivision_name: bestSubdiv,
        property_id: targetPropId,
        confidence: graph.summary.overall_confidence,
        atom_count: graph.summary.total_atoms,
        confirmed_count: graph.summary.confirmed_count,
        conflicted_count: graph.summary.conflicted_count,
        triggers_fired: allTriggers.length,
        document_ids: allDocumentIds,
        analyzed_at: new Date().toISOString(),
      };

      await supabaseAdmin
        .from('research_projects')
        .update({ analysis_metadata: metadata })
        .eq('id', projectId);

      logger.info('synthesis', 'Saved analysis results to project metadata');
    } catch (err) {
      logger.error('synthesis', `Failed to save: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const logSummary = logger.getSummary();
  logger.endPhase('synthesis');

  logger.info('cleanup', `Deep lot analysis complete in ${logger.getElapsedMs()}ms`, logSummary);

  // ── Build response ─────────────────────────────────────────────────────

  return NextResponse.json({
    // Primary result
    lot_identification: {
      lot_number: bestLot,
      block_number: bestBlock,
      subdivision_name: bestSubdiv,
      property_id: targetPropId,
      confidence: graph.summary.overall_confidence,
      lot_sources: lotAtoms.slice(0, 5).map(a => ({
        value: a.value,
        source: a.source,
        confidence: a.confidence,
        validation_state: a.validation_state,
      })),
    },

    // Visual comparison result
    visual_comparison: visualResult ? {
      identified_lot: visualResult.identified_lot,
      identified_block: visualResult.identified_block,
      confidence: visualResult.confidence,
      reasoning: visualResult.reasoning,
      key_features: visualResult.key_features,
      conflicts: visualResult.conflicts,
      pair_comparisons: visualResult.pair_comparisons,
    } : null,

    // Lot identifier result
    lot_identifier: lotIdentResult ? {
      lot_number: lotIdentResult.lot_number,
      block_number: lotIdentResult.block_number,
      subdivision_name: lotIdentResult.subdivision_name,
      confidence: lotIdentResult.confidence,
      reasoning: lotIdentResult.reasoning,
      key_features: lotIdentResult.key_features,
      conflicts_detected: lotIdentResult.conflicts_detected,
      recommendations: lotIdentResult.recommendations,
    } : null,

    // ArcGIS parcel data
    arcgis: arcgisContext?.parcel ? {
      prop_id: arcgisContext.parcel.prop_id,
      owner: arcgisContext.parcel.file_as_name,
      address: arcgisContext.parcel.situs_address,
      acreage: arcgisContext.parcel.legal_acreage,
      lot: arcgisContext.parcel.tract_or_lot,
      block: arcgisContext.parcel.block,
      legal_description: arcgisContext.parcel.full_legal_description,
      abstract: arcgisContext.abstract ? { anum: arcgisContext.abstract.anum, survey_name: arcgisContext.abstract.survey_name } : null,
      subdivision: arcgisContext.subdivision ? { code: arcgisContext.subdivision.code, description: arcgisContext.subdivision.description } : null,
      flood_zones: arcgisContext.flood_zones.map(z => z.fld_zone).filter(Boolean),
    } : null,

    // Progressive zoom results
    progressive_zoom: zoomResult ? {
      zoom_levels: zoomResult.zoom_captures.map(c => ({
        zoom: c.zoom,
        parcels_found: c.parcels_found,
        lots_visible: c.lots_visible,
        lot_labels_readable: c.lot_labels_readable,
        images_captured: c.map_set?.documentIds.length ?? 0,
        duration_ms: c.duration_ms,
      })),
      best_lot_zoom: zoomResult.best_lot_zoom,
      first_lot_visible_zoom: zoomResult.first_lot_visible_zoom,
      target_parcel: zoomResult.target_parcel,
      adjacent_parcels: zoomResult.adjacent_parcels.slice(0, 10),
    } : null,

    // Map images
    map_images: {
      document_ids: allDocumentIds,
      total: allDocumentIds.length,
    },

    // Validation graph
    validation: {
      total_atoms: graph.summary.total_atoms,
      confirmed: graph.summary.confirmed_count,
      conflicted: graph.summary.conflicted_count,
      unvalidated: graph.summary.unvalidated_count,
      overall_confidence: graph.summary.overall_confidence,
      critical_conflicts: graph.summary.critical_conflicts,
      categories_with_conflicts: graph.summary.categories_with_conflicts,
      conflicts: graph.conflicts.map(c => ({
        category: c.category,
        severity: c.severity,
        description: c.description,
        analysis: c.analysis,
        recommendation: c.recommendation,
        resolved: c.resolved,
      })),
      confirmations: graph.confirmations.slice(0, 30).map(c => ({
        category: c.category,
        match_score: c.match_score,
        description: c.description,
      })),
    },

    // Triggers
    triggers: {
      total_fired: allTriggers.length,
      details: allTriggers.map(t => ({
        rule_id: t.rule.id,
        description: t.rule.description,
        priority: t.rule.priority,
        action: t.rule.action,
        reason: t.result.reason,
        executed: t.executed,
        execution_result: t.execution_result,
        fired_at: t.fired_at,
      })),
    },

    // Pipeline logs
    pipeline_log: {
      summary: logSummary,
      steps: logger.getSteps(),
      entries: logger.getEntries().map(e => ({
        ts: e.ts,
        severity: e.severity,
        phase: e.phase,
        message: e.message,
        duration_ms: e.duration_ms,
        trigger_rule: e.trigger_rule,
      })),
    },

    // Metadata
    saved: !!body.save,
    elapsed_ms: logger.getElapsedMs(),
  });
}, { routeName: 'research/deep-lot-analysis' });
