// app/api/admin/research/[projectId]/verify-lot/route.ts
// Parcel-level lot verification pipeline.
//
// POST — Runs the full lot identification and cross-validation pipeline:
//   1. Geocode the address
//   2. Query Bell CAD ArcGIS for parcel data
//   3. Capture map images at multiple zoom levels (Google Maps pin + ArcGIS overlay)
//   4. Find existing plat/survey document images for the project
//   5. Use AI Vision to compare map pins against CAD GIS and plat images
//   6. Cross-validate every extracted data point
//   7. Analyze conflicts with AI and return results
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import {
  searchAndFetchParcelContext,
  type BellCadParcelContext,
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
  crossValidateAtoms,
  analyzeConflictsWithAI,
  type ValidationGraph,
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

  const steps: string[] = [];
  const graph = createValidationGraph();

  // ── Step 1: Query Bell CAD ArcGIS for parcel context ─────────────────────

  steps.push('Querying Bell CAD ArcGIS for parcel data...');

  let arcgisContext: BellCadParcelContext | null = null;
  let searchMethod = 'none';

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
    steps.push(`ArcGIS search succeeded via ${searchMethod}`);

    // Create DataAtoms from ArcGIS parcel data
    if (arcgisContext.parcel) {
      const arcgisAtoms = atomsFromArcGisParcel(arcgisContext.parcel, {
        abstract: arcgisContext.abstract,
        subdivision: arcgisContext.subdivision,
        city_name: arcgisContext.city_name,
        school_district: arcgisContext.school_district,
        flood_zones: arcgisContext.flood_zones,
      });
      for (const atom of arcgisAtoms) {
        addAtomAndValidate(graph, atom);
      }
      steps.push(`Created ${arcgisAtoms.length} data atoms from ArcGIS`);
    }
  } catch (err) {
    steps.push(`ArcGIS search failed: ${err instanceof Error ? err.message : String(err)}`);
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
  addAtomAndValidate(graph, addressAtom);

  // ── Step 3: Capture map images at multiple zoom levels ───────────────────

  steps.push('Capturing map images at lot-level and block-level zoom...');

  let mapCapture: MultiZoomCapture | null = null;
  try {
    mapCapture = await captureMultiZoomMaps(
      projectId,
      body.address,
      // ArcGIS geometry is state plane coords — let Nominatim geocode instead
      null,
    );
    steps.push(
      `Captured ${mapCapture.allDocumentIds.length} map images (lot + block level)`,
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
    steps.push(`Map capture failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // ── Step 4: Find existing plat/survey document images ────────────────────

  steps.push('Searching for existing plat and survey documents...');

  const platDocIds: string[] = [];
  try {
    const { data: platDocs } = await supabaseAdmin
      .from('research_documents')
      .select('id')
      .eq('research_project_id', projectId)
      .in('document_type', ['plat', 'subdivision_plat'])
      .not('storage_path', 'is', null)
      .order('created_at', { ascending: false })
      .limit(4);

    if (platDocs && platDocs.length > 0) {
      platDocIds.push(...platDocs.map((d: { id: string }) => d.id));
      steps.push(`Found ${platDocIds.length} plat document(s) for comparison`);
    } else {
      steps.push('No plat documents found for this project');
    }
  } catch (err) {
    steps.push(`Plat document search failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // ── Step 5: Run AI Vision lot identification ─────────────────────────────

  steps.push('Running AI Vision analysis on captured images...');

  let lotResult: LotIdentificationResult | null = null;
  try {
    lotResult = await identifyLotFromImages(
      body.address,
      {
        streetPinDocId: mapCapture?.lotLevel.streetPinDocId ?? null,
        satellitePinDocId: mapCapture?.lotLevel.satellitePinDocId ?? null,
        cadGisDocId: mapCapture?.lotLevel.cadGisDocId ?? null,
        platDocIds: platDocIds.length > 0 ? platDocIds : undefined,
      },
      graph,
    );
    steps.push(
      `Lot identification complete: lot=${lotResult.lot_number || 'unknown'}, ` +
      `block=${lotResult.block_number || 'unknown'}, ` +
      `confidence=${lotResult.confidence}%`,
    );
    steps.push(...lotResult.steps);
  } catch (err) {
    steps.push(`Vision analysis failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // ── Step 6: Final cross-validation pass ──────────────────────────────────

  steps.push('Running final cross-validation across all data atoms...');
  crossValidateAtoms(graph);

  // Analyze moderate+ conflicts with AI
  const unresolvedConflicts = graph.conflicts.filter(
    (c) => !c.resolved && (c.severity === 'moderate' || c.severity === 'major' || c.severity === 'critical'),
  );

  if (unresolvedConflicts.length > 0) {
    steps.push(`Analyzing ${unresolvedConflicts.length} unresolved conflicts with AI...`);
    try {
      await analyzeConflictsWithAI(graph);
      steps.push('AI conflict analysis complete');
    } catch (err) {
      steps.push(`AI conflict analysis failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ── Step 7: Optionally save results to project metadata ──────────────────

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
        verified_at: new Date().toISOString(),
      };

      await supabaseAdmin
        .from('research_projects')
        .update({ analysis_metadata: metadata })
        .eq('id', projectId);
      steps.push('Saved verification results to project metadata');
    } catch (err) {
      steps.push(`Failed to save to project: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ── Build response ───────────────────────────────────────────────────────

  return NextResponse.json({
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
    arcgis: arcgisContext
      ? {
          search_method: searchMethod,
          prop_id: arcgisContext.parcel?.prop_id ?? null,
          owner: arcgisContext.parcel?.file_as_name ?? null,
          address: arcgisContext.parcel?.situs_address ?? null,
          acreage: arcgisContext.parcel?.legal_acreage ?? null,
          legal_description: arcgisContext.parcel?.full_legal_description ?? null,
          abstract: arcgisContext.abstract
            ? { anum: arcgisContext.abstract.anum, survey_name: arcgisContext.abstract.survey_name }
            : null,
          subdivision: arcgisContext.subdivision
            ? { code: arcgisContext.subdivision.code, description: arcgisContext.subdivision.description }
            : null,
          flood_zones: arcgisContext.flood_zones.map((z) => z.fld_zone).filter(Boolean),
        }
      : null,
    map_images: {
      lot_level: mapCapture?.lotLevel.documentIds ?? [],
      block_level: mapCapture?.blockLevel.documentIds ?? [],
      total: mapCapture?.allDocumentIds.length ?? 0,
    },
    plat_documents_used: platDocIds,
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
        recommendation: c.recommendation,
        resolved: c.resolved,
        resolution: c.resolution,
      })),
      confirmations_count: graph.confirmations.length,
    },
    image_analyses: lotResult?.image_analyses
      ? Object.fromEntries(
          Object.entries(lotResult.image_analyses).map(([key, analysis]) => [
            key,
            analysis
              ? {
                  description: analysis.description,
                  lot_numbers_visible: analysis.lot_numbers_visible,
                  block_numbers_visible: analysis.block_numbers_visible,
                  streets_visible: analysis.streets_visible,
                  pin_position: analysis.pin_position,
                  confidence: analysis.confidence,
                }
              : null,
          ]),
        )
      : null,
    steps,
    saved: !!body.save_to_project,
  });
});

// ── Helpers ──────────────────────────────────────────────────────────────────

/** ArcGIS geometry uses WKID 2277 (state plane), not WGS84. Return null for now. */
function extractCentroid(
  _geometry: Record<string, unknown>,
): null {
  // ArcGIS Bell CAD uses WKID 2277 (NAD83 Texas North Central, US Feet).
  // These are NOT lat/lon — they're state plane coordinates.
  // Let the map capture service geocode via Nominatim instead.
  return null;
}
