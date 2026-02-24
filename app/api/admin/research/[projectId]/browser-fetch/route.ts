// app/api/admin/research/[projectId]/browser-fetch/route.ts
//
// POST — Trigger active browser-based property research.
//
// Launches a headless Chromium session that:
//   1. Navigates to the county CAD e-search portal
//   2. Tries every address variant until results appear
//   3. Screenshots results and extracts the property ID
//   4. Opens the county clerk deed search with the property ID
//   5. Screenshots each deed document page
//   6. Uses Claude vision to extract boundary data from screenshots
//   7. Stores all screenshots as research documents on the project
//
// The caller receives:
//   - propertyId (or null)
//   - legalDescription (or null)
//   - documentIds[] — newly created research_documents rows
//   - steps[] — step-by-step log for debugging
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { runBrowserPropertyResearch } from '@/lib/research/browser-scrape.service';
import { generateAddressVariants } from '@/lib/research/boundary-fetch.service';

function extractProjectId(req: NextRequest): string | null {
  const parts = req.nextUrl.pathname.split('/research/')[1]?.split('/');
  return parts?.[0] ?? null;
}

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projectId = extractProjectId(req);
  if (!projectId) return NextResponse.json({ error: 'Project ID required' }, { status: 400 });

  // Load project for address / county / parcel_id
  const { data: project, error: projError } = await supabaseAdmin
    .from('research_projects')
    .select('id, property_address, county, parcel_id')
    .eq('id', projectId)
    .single();

  if (projError || !project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const address = project.property_address;
  if (!address) {
    return NextResponse.json(
      { error: 'Project must have a property address to run browser research.' },
      { status: 400 },
    );
  }

  // Allow caller to override the county or property ID
  let body: { county?: string; propertyId?: string } = {};
  try { body = await req.json(); } catch { /* no body */ }

  const countyRaw = (body.county ?? project.county ?? '').toLowerCase().replace(/\s+county\s*$/i, '').trim();
  const countyKey = countyRaw.replace(/\s+/g, '_');
  const knownPropertyId = body.propertyId ?? project.parcel_id ?? undefined;

  // Generate address variants to try
  const variants = generateAddressVariants(address);

  const result = await runBrowserPropertyResearch({
    projectId,
    address,
    addressVariants: variants,
    countyKey,
    knownPropertyId,
  });

  if (!result) {
    return NextResponse.json(
      {
        error: 'Property research could not be completed. Check server logs for details.',
        steps: ['Research returned no result'],
      },
      { status: 503 },
    );
  }

  // If we found a property ID and the project doesn't have one yet, save it
  if (result.propertyId && !project.parcel_id) {
    await supabaseAdmin
      .from('research_projects')
      .update({ parcel_id: result.propertyId, updated_at: new Date().toISOString() })
      .eq('id', projectId);
  }

  return NextResponse.json({
    propertyId: result.propertyId,
    legalDescription: result.legalDescription,
    ownerName: result.ownerName,
    deedReference: result.deedReference,
    documentCount: result.documentIds.length,
    documentIds: result.documentIds,
    steps: result.steps,
  });
}, { routeName: 'research/browser-fetch' });
