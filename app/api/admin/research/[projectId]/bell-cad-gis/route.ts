// app/api/admin/research/[projectId]/bell-cad-gis/route.ts
// Bell CAD ArcGIS FeatureServer query API.
//
// GET  — Query Bell CAD parcels by prop_id, address, owner, or lat/lon.
//        Returns parcel data + related layer context (abstract, subdivision, lot lines, flood zones).
//
// POST — Fetch full parcel context for a known property ID and optionally
//         save the ArcGIS geometry to the research project's metadata.
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import {
  searchAndFetchParcelContext,
  queryParcelByPropId,
  queryParcelByAddress,
  queryParcelByOwner,
  queryParcelByPoint,
  fetchParcelContext,
  type BellCadParcel,
} from '@/lib/research/bell-cad-arcgis.service';

function extractProjectId(req: NextRequest): string | null {
  const parts = req.nextUrl.pathname.split('/research/')[1]?.split('/');
  return parts?.[0] || null;
}

// ── GET — Search parcels ─────────────────────────────────────────────────────

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const projectId = extractProjectId(req);
  if (!projectId) {
    return NextResponse.json({ error: 'Missing project ID' }, { status: 400 });
  }

  // Verify project access
  const { data: project } = await supabaseAdmin
    .from('research_projects')
    .select('id, county')
    .eq('id', projectId)
    .single();

  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  // County guard — Bell CAD GIS only supports Bell County
  const countyName = (project.county ?? '').toLowerCase().replace(/\s+county$/i, '').trim();
  if (countyName && countyName !== 'bell') {
    return NextResponse.json(
      { error: `Bell CAD GIS is only available for Bell County projects. This project is in "${project.county}".` },
      { status: 400 },
    );
  }

  const url = req.nextUrl;
  const propId = url.searchParams.get('prop_id');
  const address = url.searchParams.get('address');
  const owner = url.searchParams.get('owner');
  const lat = url.searchParams.get('lat');
  const lon = url.searchParams.get('lon');
  const includeFlood = url.searchParams.get('flood') !== 'false';

  if (!propId && !address && !owner && (!lat || !lon)) {
    return NextResponse.json(
      { error: 'Provide at least one: prop_id, address, owner, or lat+lon' },
      { status: 400 },
    );
  }

  // Use the composite search + context function
  const { context, search_method } = await searchAndFetchParcelContext(
    {
      prop_id: propId || undefined,
      address: address || undefined,
      owner_name: owner || undefined,
      lat: lat ? parseFloat(lat) : undefined,
      lon: lon ? parseFloat(lon) : undefined,
    },
    includeFlood,
  );

  return NextResponse.json({
    search_method,
    parcel: context.parcel ? sanitizeParcel(context.parcel) : null,
    abstract: context.abstract,
    subdivision: context.subdivision,
    lot_lines: context.lot_lines.map(l => ({
      plat_dim: l.plat_dim,
      metes_bound: l.metes_bound,
    })),
    city_name: context.city_name,
    school_district: context.school_district,
    flood_zones: context.flood_zones.map(z => ({
      zone: z.fld_zone,
      zone_subtype: z.zone_subtype,
      static_bfe: z.static_bfe,
      sfha: z.sfha_tf,
    })),
    near_military: context.near_military,
    has_geometry: !!(context.parcel?.geometry),
  });
});

// ── POST — Fetch context and save to project ─────────────────────────────────

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const projectId = extractProjectId(req);
  if (!projectId) {
    return NextResponse.json({ error: 'Missing project ID' }, { status: 400 });
  }

  const body = await req.json() as {
    prop_id?: string;
    address?: string;
    owner?: string;
    save_to_project?: boolean;
    include_flood?: boolean;
  };

  if (!body.prop_id && !body.address && !body.owner) {
    return NextResponse.json(
      { error: 'Provide at least one: prop_id, address, or owner' },
      { status: 400 },
    );
  }

  // Verify project ownership
  const { data: project } = await supabaseAdmin
    .from('research_projects')
    .select('id, created_by, county, analysis_metadata')
    .eq('id', projectId)
    .single();

  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  // County guard — Bell CAD GIS only supports Bell County
  const postCounty = (project.county ?? '').toLowerCase().replace(/\s+county$/i, '').trim();
  if (postCounty && postCounty !== 'bell') {
    return NextResponse.json(
      { error: `Bell CAD GIS is only available for Bell County projects. This project is in "${project.county}".` },
      { status: 400 },
    );
  }

  const { context, search_method } = await searchAndFetchParcelContext(
    {
      prop_id: body.prop_id || undefined,
      address: body.address || undefined,
      owner_name: body.owner || undefined,
    },
    body.include_flood !== false,
  );

  // Optionally save to project metadata
  if (body.save_to_project && context.parcel) {
    const metadata = (project.analysis_metadata ?? {}) as Record<string, unknown>;
    metadata.bell_cad_arcgis = {
      prop_id: context.parcel.prop_id,
      owner: context.parcel.file_as_name,
      situs_address: context.parcel.situs_address,
      acreage: context.parcel.legal_acreage,
      market_value: context.parcel.market,
      legal_description: context.parcel.full_legal_description,
      deed_reference: context.parcel.deed_reference,
      abstract: context.abstract ? {
        anum: context.abstract.anum,
        survey_name: context.abstract.survey_name,
      } : null,
      subdivision: context.subdivision ? {
        code: context.subdivision.code,
        description: context.subdivision.description,
      } : null,
      city_name: context.city_name,
      school_district: context.school_district,
      flood_zones: context.flood_zones.map(z => z.fld_zone).filter(Boolean),
      near_military: context.near_military,
      has_geometry: !!context.parcel.geometry,
      fetched_at: new Date().toISOString(),
    };

    await supabaseAdmin
      .from('research_projects')
      .update({ analysis_metadata: metadata })
      .eq('id', projectId);
  }

  return NextResponse.json({
    search_method,
    saved: body.save_to_project && !!context.parcel,
    parcel: context.parcel ? sanitizeParcel(context.parcel) : null,
    abstract: context.abstract,
    subdivision: context.subdivision,
    lot_line_count: context.lot_lines.length,
    lot_line_dimensions: context.lot_lines
      .map(l => l.plat_dim)
      .filter(Boolean),
    city_name: context.city_name,
    school_district: context.school_district,
    flood_zones: context.flood_zones.map(z => ({
      zone: z.fld_zone,
      sfha: z.sfha_tf,
    })),
    near_military: context.near_military,
    has_geometry: !!(context.parcel?.geometry),
  });
});

/** Strip large geometry data from parcel for JSON response (keep it lean) */
function sanitizeParcel(parcel: BellCadParcel) {
  return {
    prop_id: parcel.prop_id,
    prop_id_text: parcel.prop_id_text,
    file_as_name: parcel.file_as_name,
    legal_acreage: parcel.legal_acreage,
    school: parcel.school,
    city: parcel.city,
    county: parcel.county,
    legal_desc: parcel.full_legal_description,
    tract_or_lot: parcel.tract_or_lot,
    abs_subdv_cd: parcel.abs_subdv_cd,
    land_val: parcel.land_val,
    imprv_val: parcel.imprv_val,
    market: parcel.market,
    block: parcel.block,
    map_id: parcel.map_id,
    geo_id: parcel.geo_id,
    situs_address: parcel.situs_address,
    mailing_address: parcel.mailing_address,
    deed_reference: parcel.deed_reference,
    deed_date: parcel.deed_date,
    volume: parcel.volume,
    page: parcel.page,
    owner_tax_yr: parcel.owner_tax_yr,
  };
}
