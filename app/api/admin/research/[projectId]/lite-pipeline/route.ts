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
  status: 'idle' | 'running' | 'completed' | 'failed';
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
    source_type: 'url_import' as const,
    source_url: r.url,
    document_type: r.document_type || 'other',
    document_label: r.title,
    original_filename: null,
    has_text: false,
    has_image: false,
    has_ocr: false,
    ocr_confidence: null,
    analysis_status: 'pending' as const,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    metadata: {
      source: r.source,
      source_name: r.source_name,
      relevance: r.relevance,
      is_property_specific: r.is_property_specific,
      description: r.description,
      has_cost: r.has_cost,
    },
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
    // ── Stage 1: Geocode ─────────────────────────────────────────────────
    await setStatus(projectId, { status: 'running', stage: 'Geocoding address…', started_at: startedAt });

    const geo = await geocodeAddress(address);
    if (geo) {
      summary.geocoded_address = geo.display_name;
      summary.geocoded_lat = geo.lat;
      summary.geocoded_lon = geo.lon;
      summary.location_preview_url = buildPreviewUrl(geo.lat, geo.lon);
    }

    // ── Stage 2: Property Record Search ─────────────────────────────────
    await setStatus(projectId, { stage: 'Searching county records, FEMA, TxDOT…' });

    const searchReq: PropertySearchRequest = {
      address,
      county: county || undefined,
      parcel_id: parcelId || undefined,
      owner_name: ownerName || undefined,
    };

    const searchResults = await searchPropertyRecords(searchReq);
    summary.links_found = searchResults.results.length;
    summary.sources_searched = (searchResults.sources_searched || [])
      .filter(s => s.status === 'success')
      .map(s => s.name);

    // Patch USGS TopoView URLs with geocoded coords
    if (geo) {
      for (const r of searchResults.results) {
        if (r.source === 'usgs' && r.url.includes('ngmdb.usgs.gov/topoview')) {
          r.url = `https://ngmdb.usgs.gov/topoview/viewer/#14/${geo.lat.toFixed(5)}/${geo.lon.toFixed(5)}`;
        }
      }
      searchResults.geocoded_lat = geo.lat;
      searchResults.geocoded_lon = geo.lon;
      searchResults.location_preview_url = summary.location_preview_url || undefined;
    }

    // ── Stage 3: Import discovered records ───────────────────────────────
    await setStatus(projectId, { stage: 'Importing property records…' });
    const importedCount = await importSearchResults(projectId, searchResults);
    summary.documents_imported += importedCount;

    // Persist address-normalization data back to the project if we got it
    if (searchResults.address_normalized || (geo && !county)) {
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

    // ── Stage 4: Capture satellite + topo map images ─────────────────────
    await setStatus(projectId, { stage: 'Capturing satellite and topo map images…' });
    const imageResult = await captureLocationImages(projectId, address);
    summary.map_images_captured = imageResult.documentIds.length;
    summary.documents_imported += imageResult.documentIds.length;
    if (!summary.geocoded_lat && imageResult.geocoded) {
      summary.geocoded_lat = imageResult.geocoded.lat;
      summary.geocoded_lon = imageResult.geocoded.lon;
      summary.geocoded_address = imageResult.geocoded.display_name;
      summary.location_preview_url = imageResult.previewUrl || undefined;
    }

    // Advance project status to 'configure' so analysis can start
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

    // ── Stage 5: Run AI Analysis ─────────────────────────────────────────
    if (!process.env.ANTHROPIC_API_KEY) {
      await setStatus(projectId, {
        stage: 'Skipping AI analysis — ANTHROPIC_API_KEY not set',
        status: 'completed',
        completed_at: new Date().toISOString(),
        summary: {
          ...summary,
          confidence_score: 10,
        },
      });
      return;
    }

    await setStatus(projectId, { stage: 'Running AI analysis on imported documents…' });

    // analyzeProject manages its own status updates; it is a long-running async operation.
    // We call it and wait — it will update the project status to 'review' when done.
    await analyzeProject(projectId, { extractCategories: {} });

    // ── Stage 6: Collect final stats ─────────────────────────────────────
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
    const confidence = dpCount >= 30 ? 85 : dpCount >= 15 ? 70 : dpCount >= 5 ? 55 : 30;
    summary.confidence_score = confidence;

    // Count total docs analyzed
    const { count: analyzedCount } = await supabaseAdmin
      .from('research_documents')
      .select('id', { count: 'exact', head: true })
      .eq('research_project_id', projectId)
      .eq('analysis_status', 'analyzed');
    summary.documents_analyzed = analyzedCount || 0;

    // Merge analysis_metadata with pipeline_lite_status carefully
    const existingMeta = (projRes.data?.analysis_metadata as Record<string, unknown>) || {};

    await supabaseAdmin
      .from('research_projects')
      .update({
        analysis_metadata: {
          ...existingMeta,
          pipeline_lite_status: {
            status: 'completed',
            stage: 'Complete',
            started_at: startedAt,
            completed_at: new Date().toISOString(),
            summary,
          },
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', projectId);

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
