// app/api/admin/research/[projectId]/lite-pipeline/route.ts
//
// Inline "lite" research pipeline — runs entirely within the Next.js API server
// without requiring an external DigitalOcean worker.
//
// What it does in sequence:
//   1. Geocode the property address (Nominatim — free, no API key)
//   2. Search all public property record sources (county CAD, clerk, FEMA, TxDOT, USGS, GLO, RRC)
//   3. Capture satellite + topo map images from USGS National Map (free, no API key)
//   4. Import all discovered records as research_documents
//   5. Run AI analysis on every document (requires ANTHROPIC_API_KEY)
//   6. Return a summary with key facts, links, discrepancy count, and confidence level
//
// This endpoint is the recommended starting point for a "one-click" prototype workflow:
//   POST /api/admin/research/[projectId]/lite-pipeline
//   → poll GET /api/admin/research/[projectId]/lite-pipeline until status !== "running"
//
// REQUIREMENTS:
//   - ANTHROPIC_API_KEY — for AI document analysis (required)
//   - No other external services needed for a basic run
//
// OPTIONAL (adds more data but not required):
//   - WORKER_URL + WORKER_API_KEY — enables the full DigitalOcean pipeline (Playwright scraping)
//
// STATUS TRACKING:
//   Progress is stored in research_projects.analysis_metadata as pipeline_lite_status.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { searchPropertyRecords } from '@/lib/research/property-search.service';
import { captureLocationImages, geocodeAddress, buildPreviewUrl } from '@/lib/research/map-image.service';
import { analyzeProject } from '@/lib/research/analysis.service';
import type { PropertySearchRequest } from '@/types/research';

function extractProjectId(req: NextRequest): string | null {
  const afterResearch = req.nextUrl.pathname.split('/research/')[1];
  if (!afterResearch) return null;
  return afterResearch.split('/')[0] || null;
}

// ── Status helpers ────────────────────────────────────────────────────────────

interface LitePipelineStatus {
  status: 'idle' | 'running' | 'completed' | 'partial' | 'failed';
  stage?: string;
  started_at?: string;
  completed_at?: string;
  error?: string;
  summary?: LitePipelineSummary;
}

interface LitePipelineSummary {
  geocoded_address?: string;
  geocoded_lat?: number;
  geocoded_lon?: number;
  location_preview_url?: string;
  links_found: number;
  map_images_captured: number;
  documents_imported: number;
  documents_analyzed: number;
  data_points_extracted: number;
  discrepancies_found: number;
  sources_searched: string[];
  confidence_score?: number;
  owner_name?: string;
  legal_description?: string;
  acreage?: string;
  flood_zone?: string;
}

async function getStatus(projectId: string): Promise<LitePipelineStatus> {
  const { data: project } = await supabaseAdmin
    .from('research_projects')
    .select('analysis_metadata')
    .eq('id', projectId)
    .single();

  const meta = (project?.analysis_metadata as Record<string, unknown>) || {};
  const stored = meta.pipeline_lite_status as LitePipelineStatus | undefined;
  return stored || { status: 'idle' };
}

async function setStatus(projectId: string, update: Partial<LitePipelineStatus>) {
  // Merge with existing metadata to avoid overwriting other fields
  const { data: current } = await supabaseAdmin
    .from('research_projects')
    .select('analysis_metadata')
    .eq('id', projectId)
    .single();

  const existingMeta = (current?.analysis_metadata as Record<string, unknown>) || {};
  const existingStatus = (existingMeta.pipeline_lite_status as LitePipelineStatus) || {};

  await supabaseAdmin
    .from('research_projects')
    .update({
      analysis_metadata: {
        ...existingMeta,
        pipeline_lite_status: { ...existingStatus, ...update },
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', projectId);
}

// ── Import search results ─────────────────────────────────────────────────────

async function importSearchResults(
  projectId: string,
  results: Awaited<ReturnType<typeof searchPropertyRecords>>,
): Promise<number> {
  if (!results.results || results.results.length === 0) return 0;

  // Take all property-specific results + top-relevance general results
  const toImport = results.results
    .filter(r => r.relevance >= 0.55)
    .slice(0, 30); // cap at 30 links per run

  if (toImport.length === 0) return 0;

  const rows = toImport.map(r => ({
    research_project_id: projectId,
    source_type: 'property_search' as const,
    source_url: r.url,
    document_type: r.document_type || 'other',
    document_label: r.title,
    original_filename: null,
    processing_status: 'extracted' as const,
    extracted_text: `Source: ${r.source_name}\nTitle: ${r.title}\nURL: ${r.url}\n\n${r.description}`,
    extracted_text_method: 'property_search',
    recording_info: `Discovered via ${r.source_name}`,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));

  // Upsert — skip any URLs already imported for this project
  // The composite UNIQUE constraint on (research_project_id, source_url) is required for this upsert.
  // It is created by the seeds that set up the research_documents table (seeds/001... or equivalent).
  const { data, error } = await supabaseAdmin
    .from('research_documents')
    .upsert(rows, { onConflict: 'research_project_id,source_url', ignoreDuplicates: true })
    .select('id');

  if (error) {
    console.warn('[LitePipeline] Document import error:', error.message);
    return 0;
  }

  return data?.length || 0;
}

// ── Background pipeline runner ────────────────────────────────────────────────

async function runLitePipeline(
  projectId: string,
  address: string,
  county: string,
  state: string,
  ownerName?: string,
  parcelId?: string,
): Promise<void> {
  const startedAt = new Date().toISOString();

  // Save the parcel_id to the project upfront so all downstream services can use it
  if (parcelId) {
    try {
      await supabaseAdmin
        .from('research_projects')
        .update({ parcel_id: parcelId, updated_at: new Date().toISOString() })
        .eq('id', projectId);
    } catch { /* non-fatal */ }
  }

  const summary: LitePipelineSummary = {
    links_found: 0,
    map_images_captured: 0,
    documents_imported: 0,
    documents_analyzed: 0,
    data_points_extracted: 0,
    discrepancies_found: 0,
    sources_searched: [],
  };

  try {
    // ── Stage 1: Get property coordinates ──────────────────────────────
    // Prefer parcel centroid from Bell CAD (exact), fall back to address geocoding.
    await setStatus(projectId, { status: 'running', stage: parcelId ? 'Looking up parcel coordinates…' : 'Geocoding address…', started_at: startedAt });

    try {
      let geo: { lat: number; lon: number; display_name: string } | null = null;

      // Try direct parcel centroid lookup (uses shared utility)
      if (parcelId) {
        try {
          const { fetchParcelCentroidWgs84 } = await import('@/lib/research/bell-cad-arcgis.service');
          const centroid = await fetchParcelCentroidWgs84(parcelId);
          if (centroid) {
            geo = { lat: centroid.lat, lon: centroid.lon, display_name: `Property ${parcelId} — ${address}` };
            console.info(`[LitePipeline] Using parcel centroid for prop_id=${parcelId}: ${geo.lat.toFixed(6)}, ${geo.lon.toFixed(6)}`);
          }
        } catch (err) {
          console.warn(`[LitePipeline] Parcel centroid lookup failed for prop_id=${parcelId}:`, err instanceof Error ? err.message : err);
        }
      }

      // Fall back to address geocoding if parcel lookup didn't work
      if (!geo) {
        geo = await geocodeAddress(address);
      }

      if (geo) {
        summary.geocoded_address = geo.display_name;
        summary.geocoded_lat = geo.lat;
        summary.geocoded_lon = geo.lon;
        summary.location_preview_url = buildPreviewUrl(geo.lat, geo.lon);
      }
    } catch (stageErr) {
      console.warn('[LitePipeline] Stage 1 geocode failed (continuing):', stageErr instanceof Error ? stageErr.message : stageErr);
    }

    // ── Stage 2: Property Record Search ─────────────────────────────────
    await setStatus(projectId, { stage: 'Searching county records, FEMA, TxDOT…' });

    let searchResults: Awaited<ReturnType<typeof searchPropertyRecords>> = {
      results: [],
      sources_searched: [],
      total: 0,
    };
    try {
      const searchReq: PropertySearchRequest = {
        address,
        county: county || undefined,
        parcel_id: parcelId || undefined,
        owner_name: ownerName || undefined,
      };

      searchResults = await searchPropertyRecords(searchReq);
      summary.links_found = searchResults.results.length;
      summary.sources_searched = (searchResults.sources_searched || [])
        .filter(s => s.status === 'success')
        .map(s => s.name);

      // Patch USGS TopoView URLs with geocoded coords
      if (summary.geocoded_lat && summary.geocoded_lon) {
        for (const r of searchResults.results) {
          if (r.source === 'usgs' && r.url.includes('ngmdb.usgs.gov/topoview')) {
            r.url = `https://ngmdb.usgs.gov/topoview/viewer/#14/${summary.geocoded_lat.toFixed(5)}/${summary.geocoded_lon.toFixed(5)}`;
          }
        }
        searchResults.geocoded_lat = summary.geocoded_lat;
        searchResults.geocoded_lon = summary.geocoded_lon;
        searchResults.location_preview_url = summary.location_preview_url || undefined;
      }
    } catch (stageErr) {
      console.warn('[LitePipeline] Stage 2 property search failed (continuing):', stageErr instanceof Error ? stageErr.message : stageErr);
    }

    // ── Stage 3: Import discovered records ───────────────────────────────
    await setStatus(projectId, { stage: 'Importing property records…' });
    try {
      const importedCount = await importSearchResults(projectId, searchResults);
      summary.documents_imported += importedCount;

      // Persist address-normalization data back to the project if we got it
      if (searchResults.address_normalized || (summary.geocoded_lat && !county)) {
        const updates: Record<string, unknown> = {};
        if (searchResults.address_normalized) {
          updates.property_address = searchResults.address_normalized;
        }
        if (Object.keys(updates).length > 0) {
          await supabaseAdmin
            .from('research_projects')
            .update({ ...updates, updated_at: new Date().toISOString() })
            .eq('id', projectId);
        }
      }
    } catch (stageErr) {
      console.warn('[LitePipeline] Stage 3 import failed (continuing):', stageErr instanceof Error ? stageErr.message : stageErr);
    }

    // ── Stage 3b: Fetch CAD parcel context using property ID ────────────
    // When parcelId is available, query Bell CAD ArcGIS for the full parcel
    // context: deed references, legal description, plat info, adjacent parcels,
    // abstracts, flood zones, etc. This gives us structured property data
    // before the AI analysis even starts.
    if (parcelId) {
      await setStatus(projectId, { stage: 'Fetching CAD parcel data, deed & plat references…' });
      try {
        const { fetchBoundaryCalls } = await import('@/lib/research/boundary-fetch.service');
        const boundaryResult = await fetchBoundaryCalls({
          address,
          county: county || undefined,
          parcel_id: parcelId,
        });

        if (boundaryResult.success || boundaryResult.property_id) {
          // Store the boundary data as a research document for AI analysis
          const boundaryText = [
            `Property ID: ${boundaryResult.property_id ?? parcelId}`,
            boundaryResult.property?.owner_name ? `Owner: ${boundaryResult.property.owner_name}` : '',
            boundaryResult.legal_description ? `Legal Description: ${boundaryResult.legal_description}` : '',
            boundaryResult.property?.acreage ? `Acreage: ${boundaryResult.property.acreage}` : '',
            boundaryResult.cad_property_url ? `CAD URL: ${boundaryResult.cad_property_url}` : '',
            boundaryResult.deed_search_url ? `Deed Search: ${boundaryResult.deed_search_url}` : '',
            boundaryResult.boundary_calls?.length
              ? `\nBoundary Calls (${boundaryResult.boundary_calls.length}):\n${boundaryResult.boundary_calls.map(
                  (c, i) => `  ${i + 1}. ${c.bearing ?? ''} ${c.distance ? `${c.distance} ${c.distance_unit ?? 'ft'}` : ''} ${c.type === 'curve' ? `(curve R=${c.radius ?? '?'})` : ''}`.trim()
                ).join('\n')}`
              : '',
            boundaryResult.search_steps?.length
              ? `\nResearch Steps:\n${boundaryResult.search_steps.join('\n')}`
              : '',
          ].filter(Boolean).join('\n');

          if (boundaryText.length > 50) {
            const { data: doc } = await supabaseAdmin
              .from('research_documents')
              .insert({
                research_project_id: projectId,
                source_type: 'property_search',
                document_type: 'parcel_data',
                document_label: `CAD Property Data — ${parcelId}`,
                source_url: boundaryResult.cad_property_url || boundaryResult.source_url || null,
                processing_status: 'extracted',
                extracted_text: boundaryText,
                extracted_text_method: 'boundary_fetch',
                recording_info: `Bell CAD parcel data for prop_id=${parcelId}`,
              })
              .select('id')
              .single();
            if (doc) summary.documents_imported++;
          }

          // Extract key summary fields
          if (boundaryResult.property?.owner_name) {
            summary.owner_name = boundaryResult.property.owner_name;
          }
          if (boundaryResult.legal_description) {
            summary.legal_description = boundaryResult.legal_description.substring(0, 200);
          }
          if (boundaryResult.property?.acreage) {
            summary.acreage = String(boundaryResult.property.acreage);
          }
        }
      } catch (stageErr) {
        console.warn('[LitePipeline] Stage 3b CAD fetch failed (continuing):', stageErr instanceof Error ? stageErr.message : stageErr);
      }
    }

    // ── Stage 4: Capture satellite + topo map images ─────────────────────
    await setStatus(projectId, { stage: 'Capturing satellite and topo map images…' });
    try {
      const imageResult = await captureLocationImages(projectId, address, parcelId || undefined);
      summary.map_images_captured = imageResult.documentIds.length;
      summary.documents_imported += imageResult.documentIds.length;
      if (!summary.geocoded_lat && imageResult.geocoded) {
        summary.geocoded_lat = imageResult.geocoded.lat;
        summary.geocoded_lon = imageResult.geocoded.lon;
        summary.geocoded_address = imageResult.geocoded.display_name;
        summary.location_preview_url = imageResult.previewUrl || undefined;
      }
    } catch (stageErr) {
      console.warn('[LitePipeline] Stage 4 image capture failed (continuing):', stageErr instanceof Error ? stageErr.message : stageErr);
    }

    // Advance project status to 'configure' so analysis can start
    try {
      const { data: currentProject } = await supabaseAdmin
        .from('research_projects')
        .select('status')
        .eq('id', projectId)
        .single();

      if (currentProject?.status === 'upload') {
        await supabaseAdmin
          .from('research_projects')
          .update({ status: 'configure', updated_at: new Date().toISOString() })
          .eq('id', projectId);
      }
    } catch (stageErr) {
      console.warn('[LitePipeline] Status advance failed (continuing):', stageErr instanceof Error ? stageErr.message : stageErr);
    }

    // ── Stage 5: Run AI Analysis ─────────────────────────────────────────
    if (!process.env.ANTHROPIC_API_KEY) {
      await setStatus(projectId, { stage: 'Skipping AI analysis — ANTHROPIC_API_KEY not set (collecting remaining stats…)' });
      // Don't exit — fall through to Stage 6 to collect whatever stats we have
    } else {
      await setStatus(projectId, { stage: 'Running AI analysis on imported documents…' });

      try {
        // analyzeProject manages its own status updates; it is a long-running async operation.
        // We call it and wait — it will update the project status to 'review' when done.
        await analyzeProject(projectId, { extractCategories: {} });
      } catch (stageErr) {
        console.warn('[LitePipeline] Stage 5 AI analysis failed (collecting stats):', stageErr instanceof Error ? stageErr.message : stageErr);
        // Continue to Stage 6 — we still want to collect whatever partial data exists
      }
    }

    // ── Stage 6: Collect final stats ─────────────────────────────────────
    await setStatus(projectId, { stage: 'Collecting final statistics…' });

    try {
      const [dpRes, discRes, projRes] = await Promise.all([
        supabaseAdmin
          .from('extracted_data_points')
          .select('id', { count: 'exact', head: true })
          .eq('research_project_id', projectId),
        supabaseAdmin
          .from('discrepancies')
          .select('id', { count: 'exact', head: true })
          .eq('research_project_id', projectId),
        supabaseAdmin
          .from('research_projects')
          .select('analysis_metadata')
          .eq('id', projectId)
          .single(),
      ]);

      summary.data_points_extracted = dpRes.count || 0;
      summary.discrepancies_found = discRes.count || 0;

      // Pull owner/legal/area from extracted data points for the summary
      const { data: keyPoints } = await supabaseAdmin
        .from('extracted_data_points')
        .select('data_category, display_value, raw_value')
        .eq('research_project_id', projectId)
        .in('data_category', ['legal_description', 'area', 'flood_zone'])
        .limit(3);

      for (const dp of keyPoints || []) {
        if (dp.data_category === 'legal_description') summary.legal_description = (dp.display_value || dp.raw_value)?.slice(0, 500);
        if (dp.data_category === 'area') summary.acreage = dp.display_value || dp.raw_value;
        if (dp.data_category === 'flood_zone') summary.flood_zone = dp.display_value || dp.raw_value;
      }

      // Compute a rough confidence score from how much data we have
      const dpCount = summary.data_points_extracted;
      // If AI was skipped (no API key), cap confidence at 25 to signal limited analysis
      const maxConf = process.env.ANTHROPIC_API_KEY ? 85 : 25;
      const confidence = dpCount >= 30 ? maxConf : dpCount >= 15 ? Math.min(70, maxConf) : dpCount >= 5 ? Math.min(55, maxConf) : Math.min(30, maxConf);
      summary.confidence_score = confidence;

      // Count total docs analyzed
      const { count: analyzedCount } = await supabaseAdmin
        .from('research_documents')
        .select('id', { count: 'exact', head: true })
        .eq('research_project_id', projectId)
        .eq('processing_status', 'analyzed');
      summary.documents_analyzed = analyzedCount || 0;

      // Mark as 'partial' when AI analysis was skipped; 'completed' when fully done
      const finalStatus: LitePipelineStatus['status'] = process.env.ANTHROPIC_API_KEY ? 'completed' : 'partial';

      // Merge analysis_metadata with pipeline_lite_status carefully
      const existingMeta = (projRes.data?.analysis_metadata as Record<string, unknown>) || {};

      await supabaseAdmin
        .from('research_projects')
        .update({
          analysis_metadata: {
            ...existingMeta,
            pipeline_lite_status: {
              status: finalStatus,
              stage: process.env.ANTHROPIC_API_KEY ? 'Complete' : 'Complete (AI analysis skipped — ANTHROPIC_API_KEY not set)',
              started_at: startedAt,
              completed_at: new Date().toISOString(),
              summary,
            },
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', projectId);
    } catch (stageErr) {
      console.warn('[LitePipeline] Stage 6 stats collection failed:', stageErr instanceof Error ? stageErr.message : stageErr);
      // Even if stats fail, mark as completed with whatever summary we have
      await setStatus(projectId, {
        status: 'completed',
        stage: 'Complete (partial stats)',
        completed_at: new Date().toISOString(),
        summary,
      });
    }

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[LitePipeline] Pipeline failed for', projectId, ':', message);

    await setStatus(projectId, {
      status: 'failed',
      stage: 'Pipeline failed',
      completed_at: new Date().toISOString(),
      error: message,
      summary,
    });
  }
}

// ── Route handlers ────────────────────────────────────────────────────────────

/**
 * POST — Start the lite pipeline for a project.
 * Runs asynchronously; poll GET to check status.
 */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projectId = extractProjectId(req);
  if (!projectId) return NextResponse.json({ error: 'Project ID required' }, { status: 400 });

  const { data: project, error: projError } = await supabaseAdmin
    .from('research_projects')
    .select('id, property_address, county, state, analysis_metadata')
    .eq('id', projectId)
    .single();

  if (projError || !project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  // Prevent duplicate runs
  const current = await getStatus(projectId);
  if (current.status === 'running') {
    return NextResponse.json({
      message: 'Pipeline is already running',
      status: 'running',
      stage: current.stage,
    }, { status: 202 });
  }

  const body = await req.json().catch(() => ({})) as {
    address?: string;
    county?: string;
    owner_name?: string;
    parcel_id?: string;
  };

  const address = body.address || project.property_address || '';
  const county  = body.county  || project.county  || '';
  const state   = project.state || 'TX';

  if (!address && !county) {
    return NextResponse.json({
      error: 'Property address or county is required to start research',
    }, { status: 400 });
  }

  // Launch pipeline in the background — don't await
  runLitePipeline(
    projectId,
    address,
    county,
    state,
    body.owner_name || undefined,
    body.parcel_id || undefined,
  ).catch(err => {
    console.error('[LitePipeline] Unexpected top-level error for', projectId, ':', err instanceof Error ? err.message : err);
  });

  return NextResponse.json({
    message: 'Lite research pipeline started',
    projectId,
    status: 'running',
    pollUrl: `/api/admin/research/${projectId}/lite-pipeline`,
  }, { status: 202 });
}, { routeName: 'research/lite-pipeline/start' });

/**
 * GET — Poll the lite pipeline status.
 */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projectId = extractProjectId(req);
  if (!projectId) return NextResponse.json({ error: 'Project ID required' }, { status: 400 });

  const { data: project, error: projError } = await supabaseAdmin
    .from('research_projects')
    .select('id')
    .eq('id', projectId)
    .single();

  if (projError || !project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const pipelineStatus = await getStatus(projectId);
  return NextResponse.json(pipelineStatus);
}, { routeName: 'research/lite-pipeline/status' });
