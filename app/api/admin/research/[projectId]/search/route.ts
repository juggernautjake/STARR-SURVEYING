// app/api/admin/research/[projectId]/search/route.ts — Property search & import
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { searchPropertyRecords } from '@/lib/research/property-search.service';
import { processDocument } from '@/lib/research/document.service';
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
    .select('id, property_address, county, state')
    .eq('id', projectId)
    .single();

  if (projError || !project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const body = await req.json() as PropertySearchRequest;

  // Merge project data with search request (request fields take priority)
  const searchReq: PropertySearchRequest = {
    address: body.address || project.property_address || undefined,
    county: body.county || project.county || undefined,
    parcel_id: body.parcel_id || undefined,
    owner_name: body.owner_name || undefined,
    legal_description: body.legal_description || undefined,
  };

  if (!searchReq.address && !searchReq.county && !searchReq.parcel_id) {
    return NextResponse.json({
      error: 'At least one of address, county, or parcel_id is required',
    }, { status: 400 });
  }

  const results = await searchPropertyRecords(searchReq);

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
    .select('id, status')
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
  };

  if (!body.results?.length) {
    return NextResponse.json({ error: 'No results selected for import' }, { status: 400 });
  }

  const imported: string[] = [];

  for (const result of body.results) {
    // Create a research_documents row for each imported result
    const { data: doc, error: docError } = await supabaseAdmin
      .from('research_documents')
      .insert({
        research_project_id: projectId,
        source_type: 'property_search',
        document_type: result.document_type || 'other',
        document_label: result.title,
        source_url: result.url,
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
      imported.push(doc.id);

      // Mark as extracted immediately since we have the reference info
      await supabaseAdmin.from('research_documents').update({
        processing_status: 'extracted',
        updated_at: new Date().toISOString(),
      }).eq('id', doc.id);
    }
  }

  // Update project document count
  const { count } = await supabaseAdmin
    .from('research_documents')
    .select('id', { count: 'exact', head: true })
    .eq('research_project_id', projectId);

  return NextResponse.json({
    imported: imported.length,
    document_ids: imported,
    total_documents: count || 0,
  });
}, { routeName: 'research/search/import' });
