// app/api/admin/research/[projectId]/verify-lot/route.ts
// Parcel-level lot verification pipeline.
//
// POST — Runs the full lot identification and cross-validation pipeline:
//   1. Query Bell CAD ArcGIS for parcel data + adjacent lots
//   2. Add user-provided address as a data atom
//   3. Capture map images at multiple zoom levels (Google Maps pin + ArcGIS overlay)
//   4. Find existing plat/survey/deed document images for the project
//   5. Use AI Vision to compare map pins against CAD GIS and plat images
//   6. Search existing extracted data for the identified lot + adjacent lots
//   7. Final cross-validation with structured logging
//   8. AI conflict analysis for unresolved issues
//   9. Optionally save results
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { PipelineLogger } from '@/lib/research/pipeline-logger';
import {
  searchAndFetchParcelContext,
  queryParcelByAddress,
  type BellCadParcelContext,
  type BellCadParcel,
} from '@/lib/research/bell-cad-arcgis.service';
import {
  captureMultiZoomMaps,
  type MultiZoomCapture,
} from '@/lib/research/parcel-map-capture.service';
import {
  createValidationGraph,
  createAtom,
  atomsFromArcGisParcel,
  addAtomAndValidate,
  addAtomsBatch,
  crossValidateAtoms,
  analyzeConflictsWithAI,
  type ValidationLog,
} from '@/lib/research/cross-validation.service';
import {
  identifyLotFromImages,
  type LotIdentificationResult,
} from '@/lib/research/visual-lot-identifier.service';

function extractProjectId(req: NextRequest): string | null {
  const parts = req.nextUrl.pathname.split('/research/')[1]?.split('/');
  return parts?.[0] || null;
}

// ── POST — Run full lot verification pipeline ────────────────────────────────

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
    save_to_project?: boolean;
  };

  if (!body.address) {
    return NextResponse.json(
      { error: 'address is required' },
      { status: 400 },
    );
  }

  // Verify project exists
  const { data: project } = await supabaseAdmin
    .from('research_projects')
    .select('id, county, analysis_metadata')
    .eq('id', projectId)
    .single();

  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  // County guard — this pipeline currently only supports Bell County
  const countyName = (project.county ?? '').toLowerCase().replace(/\s+county$/i, '').trim();
  if (countyName && countyName !== 'bell') {
    return NextResponse.json(
      { error: `Lot verification is currently only supported for Bell County. This project is in "${project.county}".` },
      { status: 400 },
    );
  }

  const steps: string[] = [];
  const validationLogs: ValidationLog[] = [];
  const graph = createValidationGraph();
  const logger = new PipelineLogger(projectId);

  // ── Step 1: Query Bell CAD ArcGIS for parcel context ─────────────────────

  steps.push('[Step 1] Querying Bell CAD ArcGIS for target parcel data...');

  let arcgisContext: BellCadParcelContext | null = null;
  let searchMethod = 'none';
  let targetParcel: BellCadParcel | null = null;

  try {
    const result = await searchAndFetchParcelContext(
      {
        prop_id: body.prop_id || undefined,
        address: body.address || undefined,
        owner_name: body.owner || undefined,
      },
      true, // include flood
    );
    arcgisContext = result.context;
    searchMethod = result.search_method;
    targetParcel = arcgisContext.parcel;
    steps.push(`[Step 1] ArcGIS search succeeded via ${searchMethod}`);

    // Create DataAtoms from ArcGIS parcel data (batch add for performance)
    if (targetParcel) {
      const arcgisAtoms = atomsFromArcGisParcel(targetParcel, {
        abstract: arcgisContext.abstract,
        subdivision: arcgisContext.subdivision,
        city_name: arcgisContext.city_name,
        school_district: arcgisContext.school_district,
        flood_zones: arcgisContext.flood_zones,
      });
      addAtomsBatch(graph, arcgisAtoms);
      steps.push(`[Step 1] Created ${arcgisAtoms.length} data atoms from ArcGIS`);
      steps.push(`[Step 1] Target parcel: prop_id=${targetParcel.prop_id}, lot=${targetParcel.tract_or_lot || '?'}, block=${targetParcel.block || '?'}`);
    }
  } catch (err) {
    steps.push(`[Step 1] ArcGIS search failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // ── Step 1b: Query adjacent parcels by similar address ──────────────────

  const adjacentParcels: BellCadParcel[] = [];
  if (targetParcel?.situs_address) {
    try {
      // Extract street name from address to find neighbors
      const streetMatch = targetParcel.situs_address.match(/\d+\s+(.+)/);
      if (streetMatch) {
        const streetName = streetMatch[1].trim();
        steps.push(`[Step 1b] Searching for adjacent parcels on ${streetName}...`);
        const neighbors = await queryParcelByAddress(streetName);
        // Keep parcels on the same street, different from target
        for (const n of neighbors) {
          if (n.prop_id !== targetParcel.prop_id) {
            adjacentParcels.push(n);
          }
        }
        steps.push(`[Step 1b] Found ${adjacentParcels.length} neighboring parcels on same street`);
      }
    } catch {
      steps.push('[Step 1b] Adjacent parcel search failed (non-critical)');
    }
  }

  // ── Step 2: Add address atom from user input ─────────────────────────────

  const addressAtom = createAtom({
    category: 'situs_address',
    value: body.address,
    source: 'user_input',
    extraction_method: 'user_provided',
    confidence: 95,
    confidence_reasoning: 'User-provided address',
    pipeline_step: 'verify-lot:input',
  });
  const addrLogs = addAtomAndValidate(graph, addressAtom);
  validationLogs.push(...addrLogs.filter(l => l.type === 'confirmation' || l.type === 'conflict'));

  // Log whether user address matches ArcGIS address
  if (targetParcel?.situs_address) {
    const userAddr = body.address.toUpperCase().trim();
    const arcAddr = targetParcel.situs_address.toUpperCase().trim();
    if (userAddr === arcAddr || userAddr.includes(arcAddr) || arcAddr.includes(userAddr)) {
      steps.push(`[Step 2] Address match: user-provided address matches ArcGIS situs address`);
    } else {
      steps.push(`[Step 2] ADDRESS MISMATCH: user="${body.address}" vs ArcGIS="${targetParcel.situs_address}"`);
    }
  }

  // ── Step 3: Capture map images at multiple zoom levels ───────────────────

  steps.push('[Step 3] Capturing map images at lot-level and block-level zoom...');

  let mapCapture: MultiZoomCapture | null = null;
  try {
    mapCapture = await captureMultiZoomMaps(
      projectId,
      body.address,
      null, // ArcGIS geometry is state plane coords — let Nominatim geocode
      project.county ?? undefined,
    );
    steps.push(
      `[Step 3] Captured ${mapCapture.allDocumentIds.length} map images (lot + block level)`,
    );

    // Add pin location atom if geocoded
    if (mapCapture.lotLevel.geocoded) {
      const pinAtom = createAtom({
        category: 'pin_location',
        value: `${mapCapture.lotLevel.geocoded.lat},${mapCapture.lotLevel.geocoded.lon}`,
        normalized: {
          lat: mapCapture.lotLevel.geocoded.lat,
          lon: mapCapture.lotLevel.geocoded.lon,
        },
        source: 'google_maps',
        extraction_method: 'geocoding',
        confidence: 85,
        confidence_reasoning: 'Geocoded address via Nominatim or Google',
        pipeline_step: 'verify-lot:geocode',
      });
      addAtomAndValidate(graph, pinAtom);
    }
  } catch (err) {
    steps.push(`[Step 3] Map capture failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // ── Step 4: Find existing plat/survey/deed documents ─────────────────────

  steps.push('[Step 4] Searching for existing plat, survey, and deed documents...');

  const platDocIds: string[] = [];
  const deedDocIds: string[] = [];
  try {
    const { data: projectDocs } = await supabaseAdmin
      .from('research_documents')
      .select('id, document_type, document_label')
      .eq('research_project_id', projectId)
      .in('document_type', ['plat', 'subdivision_plat', 'deed', 'survey', 'legal_description', 'field_notes'])
      .not('storage_path', 'is', null)
      .order('created_at', { ascending: false })
      .limit(20);

    if (projectDocs) {
      for (const doc of projectDocs) {
        if (doc.document_type === 'plat' || doc.document_type === 'subdivision_plat') {
          platDocIds.push(doc.id);
        } else if (doc.document_type === 'deed' || doc.document_type === 'legal_description' ||
                   doc.document_type === 'survey' || doc.document_type === 'field_notes') {
          deedDocIds.push(doc.id);
        }
      }
      steps.push(`[Step 4] Found ${platDocIds.length} plat(s), ${deedDocIds.length} deed/survey document(s)`);
    } else {
      steps.push('[Step 4] No plat or deed documents found for this project');
    }
  } catch (err) {
    steps.push(`[Step 4] Document search failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // ── Step 5: Run AI Vision lot identification ─────────────────────────────

  steps.push('[Step 5] Running AI Vision analysis on captured images...');

  let lotResult: LotIdentificationResult | null = null;
  try {
    lotResult = await identifyLotFromImages(
      body.address,
      {
        streetPinDocId: mapCapture?.lotLevel.streetPinDocId ?? null,
        satellitePinDocId: mapCapture?.lotLevel.satellitePinDocId ?? null,
        cadGisDocId: mapCapture?.lotLevel.cadGisDocId ?? null,
        platDocIds: platDocIds.length > 0 ? platDocIds.slice(0, 3) : undefined,
      },
      graph,
      logger,
    );
    steps.push(
      `[Step 5] Lot identification complete: lot=${lotResult.lot_number || 'unknown'}, ` +
      `block=${lotResult.block_number || 'unknown'}, ` +
      `subdivision=${lotResult.subdivision_name || 'unknown'}, ` +
      `confidence=${lotResult.confidence}%`,
    );
    steps.push(...lotResult.steps);
  } catch (err) {
    steps.push(`[Step 5] Vision analysis failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // ── Step 6: Cross-check lot identification against extracted data ────────

  steps.push('[Step 6] Cross-checking identified lot against existing extracted data...');

  // Pull any already-extracted data points for this project
  let existingDataPoints: Array<{
    data_category: string;
    extracted_value: string;
    source_document_id: string | null;
    confidence: number;
  }> = [];

  try {
    const { data: points } = await supabaseAdmin
      .from('research_extracted_data_points')
      .select('data_category, extracted_value, source_document_id, confidence')
      .eq('research_project_id', projectId)
      .limit(200);

    if (points && points.length > 0) {
      existingDataPoints = points;
      steps.push(`[Step 6] Found ${points.length} previously extracted data points to cross-check`);

      // Create atoms from existing data points for cross-validation
      const relevantCategories = new Map<string, string>([
        ['lot_number', 'lot_number'],
        ['block_number', 'block_number'],
        ['subdivision', 'subdivision_name'],
        ['abstract_number', 'abstract_number'],
        ['survey_name', 'survey_name'],
        ['acreage', 'acreage'],
        ['legal_description', 'legal_description'],
        ['owner_name', 'owner_name'],
        ['bearing', 'bearing'],
        ['distance', 'distance'],
        ['boundary_call', 'boundary_call'],
        ['monument', 'monument'],
        ['easement', 'easement'],
        ['recording_reference', 'deed_reference'],
      ]);

      const batchAtoms: Parameters<typeof addAtomsBatch>[1] = [];
      for (const point of points) {
        const atomCategory = relevantCategories.get(point.data_category);
        if (atomCategory && point.extracted_value) {
          batchAtoms.push(createAtom({
            category: atomCategory as Parameters<typeof createAtom>[0]['category'],
            value: point.extracted_value,
            source: 'ai_extraction',
            source_document_id: point.source_document_id,
            extraction_method: 'Previously extracted by pipeline AI analysis',
            confidence: point.confidence ?? 70,
            confidence_reasoning: 'Extracted from document during pipeline analysis',
            pipeline_step: 'verify-lot:existing-data',
          }));
        }
      }
      if (batchAtoms.length > 0) {
        addAtomsBatch(graph, batchAtoms);
      }
      steps.push(`[Step 6] Added ${batchAtoms.length} atoms from existing extracted data for cross-validation`);
    } else {
      steps.push('[Step 6] No previously extracted data points found');
    }
  } catch (err) {
    steps.push(`[Step 6] Existing data lookup failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // ── Step 6b: Check if ArcGIS lot matches AI-identified lot ──────────────

  if (lotResult?.lot_number && targetParcel?.tract_or_lot) {
    const arcgisLot = targetParcel.tract_or_lot.replace(/^0+/, '').trim();
    const aiLot = lotResult.lot_number.replace(/^0+/, '').trim();

    if (arcgisLot === aiLot) {
      steps.push(`[Step 6b] CONFIRMED: ArcGIS lot (${arcgisLot}) matches AI-identified lot (${aiLot})`);
    } else {
      steps.push(`[Step 6b] MISMATCH: ArcGIS says lot "${targetParcel.tract_or_lot}" but AI identified lot "${lotResult.lot_number}"`);
    }
  }

  if (lotResult?.block_number && targetParcel?.block) {
    const arcgisBlock = targetParcel.block.replace(/^0+/, '').trim();
    const aiBlock = lotResult.block_number.replace(/^0+/, '').trim();

    if (arcgisBlock === aiBlock) {
      steps.push(`[Step 6b] CONFIRMED: ArcGIS block (${arcgisBlock}) matches AI-identified block (${aiBlock})`);
    } else {
      steps.push(`[Step 6b] MISMATCH: ArcGIS says block "${targetParcel.block}" but AI identified block "${lotResult.block_number}"`);
    }
  }

  // ── Step 7: Final cross-validation pass with structured logging ──────────

  steps.push('[Step 7] Running final cross-validation across all data atoms...');
  const finalLogs = crossValidateAtoms(graph);
  validationLogs.push(...finalLogs);

  // Add human-readable validation log entries to steps
  for (const log of finalLogs) {
    if (log.type === 'confirmation') {
      steps.push(`[Step 7] ${log.message}`);
    } else if (log.type === 'conflict') {
      steps.push(`[Step 7] ${log.message}`);
    } else if (log.type === 'summary') {
      steps.push(`[Step 7] ${log.message}`);
    }
  }

  // ── Step 8: AI conflict analysis for unresolved issues ───────────────────

  const unresolvedConflicts = graph.conflicts.filter(
    (c) => !c.resolved && (c.severity === 'moderate' || c.severity === 'major' || c.severity === 'critical'),
  );

  if (unresolvedConflicts.length > 0) {
    steps.push(`[Step 8] Analyzing ${unresolvedConflicts.length} unresolved conflicts with AI...`);
    try {
      await analyzeConflictsWithAI(graph);
      steps.push('[Step 8] AI conflict analysis complete');

      // Log AI recommendations
      for (const conflict of graph.conflicts.filter(c => c.recommendation)) {
        steps.push(`[Step 8] AI recommendation for ${conflict.category}: ${conflict.recommendation}`);
      }
    } catch (err) {
      steps.push(`[Step 8] AI conflict analysis failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  } else {
    steps.push('[Step 8] No unresolved moderate+ conflicts — skipping AI analysis');
  }

  // ── Step 9: Optionally save results to project metadata ──────────────────

  if (body.save_to_project) {
    try {
      const metadata = (project.analysis_metadata ?? {}) as Record<string, unknown>;
      metadata.lot_verification = {
        address: body.address,
        lot_number: lotResult?.lot_number ?? null,
        block_number: lotResult?.block_number ?? null,
        subdivision_name: lotResult?.subdivision_name ?? null,
        confidence: lotResult?.confidence ?? 0,
        reasoning: lotResult?.reasoning ?? null,
        map_document_ids: mapCapture?.allDocumentIds ?? [],
        atom_count: graph.summary.total_atoms,
        conflict_count: graph.summary.critical_conflicts,
        confirmed_count: graph.summary.confirmed_count,
        adjacent_parcels: adjacentParcels.slice(0, 10).map(p => ({
          prop_id: p.prop_id,
          address: p.situs_address,
          lot: p.tract_or_lot,
          block: p.block,
          owner: p.file_as_name,
        })),
        verified_at: new Date().toISOString(),
      };

      await supabaseAdmin
        .from('research_projects')
        .update({ analysis_metadata: metadata })
        .eq('id', projectId);
      steps.push('[Step 9] Saved verification results to project metadata');
    } catch (err) {
      steps.push(`[Step 9] Failed to save to project: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ── Build response ───────────────────────────────────────────────────────

  return NextResponse.json({
    // The primary result: which lot was identified
    lot_identification: lotResult
      ? {
          lot_number: lotResult.lot_number,
          block_number: lotResult.block_number,
          subdivision_name: lotResult.subdivision_name,
          confidence: lotResult.confidence,
          reasoning: lotResult.reasoning,
          key_features: lotResult.key_features,
          conflicts_detected: lotResult.conflicts_detected,
          recommendations: lotResult.recommendations,
        }
      : null,

    // ArcGIS data for the target parcel
    arcgis: arcgisContext
      ? {
          search_method: searchMethod,
          prop_id: arcgisContext.parcel?.prop_id ?? null,
          owner: arcgisContext.parcel?.file_as_name ?? null,
          address: arcgisContext.parcel?.situs_address ?? null,
          acreage: arcgisContext.parcel?.legal_acreage ?? null,
          legal_description: arcgisContext.parcel?.full_legal_description ?? null,
          lot: arcgisContext.parcel?.tract_or_lot ?? null,
          block: arcgisContext.parcel?.block ?? null,
          abstract: arcgisContext.abstract
            ? { anum: arcgisContext.abstract.anum, survey_name: arcgisContext.abstract.survey_name }
            : null,
          subdivision: arcgisContext.subdivision
            ? { code: arcgisContext.subdivision.code, description: arcgisContext.subdivision.description }
            : null,
          flood_zones: arcgisContext.flood_zones.map((z) => z.fld_zone).filter(Boolean),
        }
      : null,

    // Adjacent parcels for context
    adjacent_parcels: adjacentParcels.slice(0, 10).map(p => ({
      prop_id: p.prop_id,
      address: p.situs_address,
      lot: p.tract_or_lot,
      block: p.block,
      owner: p.file_as_name,
      acreage: p.legal_acreage,
    })),

    // Map images captured
    map_images: {
      lot_level: mapCapture?.lotLevel.documentIds ?? [],
      block_level: mapCapture?.blockLevel.documentIds ?? [],
      total: mapCapture?.allDocumentIds.length ?? 0,
    },

    // Documents used in analysis
    documents_used: {
      plats: platDocIds,
      deeds: deedDocIds,
      existing_data_points: existingDataPoints.length,
    },

    // Full validation graph summary
    validation: {
      total_atoms: graph.summary.total_atoms,
      confirmed: graph.summary.confirmed_count,
      conflicted: graph.summary.conflicted_count,
      unvalidated: graph.summary.unvalidated_count,
      overall_confidence: graph.summary.overall_confidence,
      critical_conflicts: graph.summary.critical_conflicts,
      categories_with_conflicts: graph.summary.categories_with_conflicts,
      conflicts: graph.conflicts.map((c) => ({
        id: c.id,
        category: c.category,
        severity: c.severity,
        description: c.description,
        analysis: c.analysis,
        recommendation: c.recommendation,
        resolved: c.resolved,
        resolution: c.resolution,
      })),
      confirmations: graph.confirmations.map((c) => ({
        category: c.category,
        match_score: c.match_score,
        description: c.description,
      })),
    },

    // Structured validation logs showing confirmations vs conflicts
    validation_logs: validationLogs.map(l => ({
      type: l.type,
      category: l.category,
      severity: l.severity,
      message: l.message,
    })),

    // Individual image analysis results
    image_analyses: lotResult?.image_analyses
      ? Object.fromEntries(
          Object.entries(lotResult.image_analyses).map(([key, analysis]) => [
            key,
            analysis
              ? {
                  description: analysis.description,
                  lot_numbers_visible: analysis.lot_numbers_visible,
                  block_numbers_visible: analysis.block_numbers_visible,
                  subdivision_names_visible: analysis.subdivision_names_visible,
                  streets_visible: analysis.streets_visible,
                  pin_position: analysis.pin_position,
                  features_near_pin: analysis.features_near_pin,
                  confidence: analysis.confidence,
                }
              : null,
          ]),
        )
      : null,

    // Step-by-step pipeline log
    steps,
    saved: !!body.save_to_project,
  });
});
