// app/api/admin/research/[projectId]/search/route.ts — Property search & import
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { searchPropertyRecords } from '@/lib/research/property-search.service';
import { geocodeAddress, buildPreviewUrl, captureLocationImages, type GeoCandidate } from '@/lib/research/map-image.service';
import type { PropertySearchRequest } from '@/types/research';

function extractProjectId(req: NextRequest): string | null {
  const parts = req.nextUrl.pathname.split('/research/')[1]?.split('/');
  return parts?.[0] || null;
}

/* POST — Search external sources for property records */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projectId = extractProjectId(req);
  if (!projectId) return NextResponse.json({ error: 'Project ID required' }, { status: 400 });

  // Verify project exists and belongs to valid scope
  const { data: project, error: projError } = await supabaseAdmin
    .from('research_projects')
    .select('id, property_address, county, state, parcel_id')
    .eq('id', projectId)
    .single();

  if (projError || !project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const body = await req.json() as PropertySearchRequest;

  // Save parcel_id to project if provided and not already stored
  if (body.parcel_id && !project.parcel_id) {
    await supabaseAdmin
      .from('research_projects')
      .update({ parcel_id: body.parcel_id, updated_at: new Date().toISOString() })
      .eq('id', projectId);
  }

  // Merge project data with search request (request fields take priority)
  const searchReq: PropertySearchRequest = {
    address: body.address || project.property_address || undefined,
    county: body.county || project.county || undefined,
    parcel_id: body.parcel_id || undefined,
    owner_name: body.owner_name || undefined,
    legal_description: body.legal_description || undefined,
  };

  if (!searchReq.parcel_id) {
    return NextResponse.json({
      error: 'Property ID is required. You can find it on the county CAD website (e.g. Bell CAD eSearch).',
    }, { status: 400 });
  }
  if (!searchReq.address && !searchReq.county) {
    return NextResponse.json({
      error: 'Enter a property address or county along with the Property ID.',
    }, { status: 400 });
  }

  // Run property search + location lookup in parallel (location is non-fatal).
  // When parcel_id is available, use Bell CAD centroid (exact) instead of Nominatim geocoding.
  const [results, geo] = await Promise.all([
    searchPropertyRecords(searchReq),
    (async () => {
      // Try parcel centroid first
      if (searchReq.parcel_id) {
        try {
          const params = new URLSearchParams({
            where: `prop_id = ${Number(searchReq.parcel_id)}`,
            outFields: 'PROP_ID',
            returnGeometry: 'true',
            outSR: '4326',
            f: 'json',
          });
          const res = await fetch(
            `https://services7.arcgis.com/EHW2HuuyZNO7DZct/arcgis/rest/services/BellCADWebService/FeatureServer/0/query?${params}`,
            { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; STARR-Surveying/1.0)' }, signal: AbortSignal.timeout(15_000) },
          );
          if (res.ok) {
            const data = await res.json();
            const ring = data?.features?.[0]?.geometry?.rings?.[0];
            if (ring && ring.length > 0) {
              let sLon = 0, sLat = 0;
              const n = (ring.length > 1 && ring[0][0] === ring[ring.length - 1][0]) ? ring.length - 1 : ring.length;
              for (let i = 0; i < n; i++) { sLon += ring[i][0]; sLat += ring[i][1]; }
              return { lat: sLat / n, lon: sLon / n, display_name: `Property ${searchReq.parcel_id}` };
            }
          }
        } catch { /* fall through to geocoding */ }
      }
      // Fall back to address geocoding
      return searchReq.address ? geocodeAddress(searchReq.address) : null;
    })(),
  ]);

  // Attach location and preview URL to the response
  if (geo) {
    results.geocoded_lat = geo.lat;
    results.geocoded_lon = geo.lon;
    results.location_preview_url = buildPreviewUrl(geo.lat, geo.lon);

    // Patch USGS TopoView URLs — replace placeholder lat/lon with actual geocoded coordinates
    for (const r of results.results) {
      if (r.source === 'usgs' && r.url.includes('ngmdb.usgs.gov/topoview')) {
        r.url = `https://ngmdb.usgs.gov/topoview/viewer/#14/${geo.lat.toFixed(5)}/${geo.lon.toFixed(5)}`;
        r.description = r.description.replace(/geocoded location/i, `${geo.lat.toFixed(5)}, ${geo.lon.toFixed(5)}`);
      }
    }
  }

  return NextResponse.json(results);
}, { routeName: 'research/search' });

/* PUT — Import selected search results as project documents */
export const PUT = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projectId = extractProjectId(req);
  if (!projectId) return NextResponse.json({ error: 'Project ID required' }, { status: 400 });

  // Verify project exists
  const { data: project, error: projError } = await supabaseAdmin
    .from('research_projects')
    .select('id, status, property_address')
    .eq('id', projectId)
    .single();

  if (projError || !project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const body = await req.json() as {
    results: {
      source: string;
      source_name: string;
      title: string;
      url: string;
      document_type: string;
      description: string;
    }[];
    address?: string;
  };

  if (!body.results?.length) {
    return NextResponse.json({ error: 'No results selected for import' }, { status: 400 });
  }

  // Use a Set to track unique document IDs — prevents double-counting when two
  // selected results share the same source URL (e.g. TNRIS always uses the same
  // static URL, some Bell CAD results share a base URL).  Previously a plain
  // array was used, so duplicate IDs inflated `imported.length` and the success
  // message said e.g. "20 imported" while only 18–19 unique documents existed.
  const importedIds = new Set<string>();
  let newCount = 0;
  let alreadyExistedCount = 0;

  for (const result of body.results) {
    // Skip URL-based dedup check when result.url is empty — an empty-string
    // .eq() would match rows with source_url='' and a null .eq() in Supabase
    // resolves to IS NULL which could match unrelated documents.
    if (result.url) {
      const { data: existingResult } = await supabaseAdmin
        .from('research_documents')
        .select('id')
        .eq('research_project_id', projectId)
        .eq('source_url', result.url)
        .maybeSingle();
      if (existingResult) {
        importedIds.add(existingResult.id);
        alreadyExistedCount++;
        continue;
      }
    }

    // Create a research_documents row for each imported result
    const { data: doc, error: docError } = await supabaseAdmin
      .from('research_documents')
      .insert({
        research_project_id: projectId,
        source_type: 'property_search',
        document_type: result.document_type || 'other',
        document_label: result.title,
        source_url: result.url || null,
        original_filename: null,
        file_type: null,
        file_size_bytes: null,
        processing_status: 'pending',
        extracted_text: `Source: ${result.source_name}\nTitle: ${result.title}\nURL: ${result.url}\n\n${result.description}`,
        extracted_text_method: 'property_search',
        recording_info: `Discovered via ${result.source_name}`,
      })
      .select('id')
      .single();

    if (!docError && doc) {
      importedIds.add(doc.id);
      newCount++;

      // Mark as extracted immediately since we have the reference info
      await supabaseAdmin.from('research_documents').update({
        processing_status: 'extracted',
        updated_at: new Date().toISOString(),
      }).eq('id', doc.id);
    }
  }

  // Fire-and-forget: capture satellite + topo map images for the address.
  // These run async — we don't wait for them to avoid blocking the response.
  const addressToCapture = body.address || project.property_address;
  if (addressToCapture) {
    // Deliberately not awaited — runs in background and stores images as project documents
    captureLocationImages(projectId, addressToCapture).then(imageResult => {
      if (imageResult.documentIds.length > 0) {
        const locInfo = imageResult.geocoded
          ? `at ${imageResult.geocoded.lat.toFixed(4)}, ${imageResult.geocoded.lon.toFixed(4)}`
          : '(geocoding failed)';
        const multiInfo = imageResult.multipleLocations
          ? ` (${imageResult.candidates.length} candidate locations — satellite images captured for each)`
          : '';
        console.info(
          `[Search Import] Stored ${imageResult.documentIds.length} map image(s) for project ${projectId} ${locInfo}${multiInfo}`,
        );
      }
    }).catch(err => {
      console.warn('[Search Import] Map image capture failed (non-fatal):', err instanceof Error ? err.message : err);
    });
  }

  // Update project document count
  const { count } = await supabaseAdmin
    .from('research_documents')
    .select('id', { count: 'exact', head: true })
    .eq('research_project_id', projectId);

  return NextResponse.json({
    imported: importedIds.size,
    new_count: newCount,
    already_existed_count: alreadyExistedCount,
    document_ids: [...importedIds],
    total_documents: count || 0,
    map_images_queued: !!addressToCapture,
  });
}, { routeName: 'research/search/import' });
