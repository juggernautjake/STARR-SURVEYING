// app/api/admin/research/[projectId]/boundary-calls/route.ts — Fetch boundary calls from county CAD
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { fetchBoundaryCalls } from '@/lib/research/boundary-fetch.service';
import type { BoundaryFetchRequest } from '@/types/research';

function extractProjectId(req: NextRequest): string | null {
  const parts = req.nextUrl.pathname.split('/research/')[1]?.split('/');
  return parts?.[0] || null;
}

/**
 * POST — Fetch boundary calls from the county appraisal district for a property.
 *
 * Body: { address?, county?, parcel_id?, state? }
 *
 * The service will:
 *  1. Look up the property in the county CAD (via TrueAutomation API where available)
 *  2. Retrieve the legal description
 *  3. Use AI to parse the metes-and-bounds boundary calls
 *
 * Allow 2–3 minutes — the AI extraction may take up to 90 seconds.
 */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projectId = extractProjectId(req);
  if (!projectId) return NextResponse.json({ error: 'Project ID required' }, { status: 400 });

  // Verify project exists
  const { data: project, error: projError } = await supabaseAdmin
    .from('research_projects')
    .select('id, property_address, county, state, parcel_id')
    .eq('id', projectId)
    .single();

  if (projError || !project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const body = await req.json() as BoundaryFetchRequest;

  // Merge project defaults with request overrides
  const fetchReq: BoundaryFetchRequest = {
    address: body.address ?? project.property_address ?? undefined,
    county:  body.county  ?? project.county          ?? undefined,
    parcel_id: body.parcel_id ?? project.parcel_id   ?? undefined,
    owner_name: body.owner_name ?? undefined,
    state:   body.state   ?? project.state           ?? 'TX',
  };

  if (!fetchReq.address && !fetchReq.parcel_id && !fetchReq.owner_name) {
    return NextResponse.json(
      { error: 'At least one of address, parcel_id, or owner_name is required' },
      { status: 400 },
    );
  }

  const result = await fetchBoundaryCalls(fetchReq);

  // If we discovered a property_id and the project doesn't have one yet, save it
  if (result.property_id && !project.parcel_id) {
    await supabaseAdmin
      .from('research_projects')
      .update({ parcel_id: result.property_id, updated_at: new Date().toISOString() })
      .eq('id', projectId);
  }

  // If we have a legal description, save it as a research document for downstream analysis
  if (result.legal_description && result.success) {
    const docLabel = result.property?.owner_name
      ? `CAD Legal Description — ${result.property.owner_name}`
      : `CAD Legal Description`;

    const { data: existingDoc } = await supabaseAdmin
      .from('research_documents')
      .select('id')
      .eq('research_project_id', projectId)
      .eq('source_type', 'property_search')
      .eq('document_type', 'legal_description')
      .eq('document_label', docLabel)
      .maybeSingle();

    if (!existingDoc) {
      await supabaseAdmin.from('research_documents').insert({
        research_project_id: projectId,
        source_type: 'property_search',
        document_type: 'legal_description',
        document_label: docLabel,
        source_url: result.source_url ?? null,
        processing_status: 'extracted',
        extracted_text: [
          result.property?.owner_name    ? `Owner: ${result.property.owner_name}` : '',
          result.property?.property_address ? `Address: ${result.property.property_address}` : '',
          result.property?.acreage       ? `Acreage: ${result.property.acreage} acres` : '',
          result.property?.deed_reference ? `Deed Reference: ${result.property.deed_reference}` : '',
          '',
          'LEGAL DESCRIPTION:',
          result.legal_description,
        ].filter(Boolean).join('\n'),
        extracted_text_method: 'property_search',
        recording_info: result.property?.deed_reference ?? null,
      });
    }
  }

  return NextResponse.json(result);
}, { routeName: 'research/boundary-calls' });
