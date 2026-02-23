// app/api/admin/research/[projectId]/documents/[docId]/deep-analyze/route.ts
// Runs a deep AI analysis on a document.
// For property_search documents (search result references with no real content), this
// endpoint first fetches live data from the source URL or runs the full boundary-fetch
// pipeline using the project's address/parcel ID before running AI analysis.
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { deepAnalyzeDocument, fetchSourceContent, buildBoundaryFetchText } from '@/lib/research/document-analysis.service';
import { fetchBoundaryCalls } from '@/lib/research/boundary-fetch.service';
import type { DocumentType } from '@/types/research';

const MIN_PROPERTY_TEXT_LENGTH = 500;

function extractIds(req: NextRequest): { projectId: string | null; docId: string | null } {
  const parts = req.nextUrl.pathname.split('/');
  const researchIdx = parts.indexOf('research');
  const documentsIdx = parts.indexOf('documents');
  return {
    projectId: researchIdx >= 0 ? (parts[researchIdx + 1] ?? null) : null,
    docId:     documentsIdx >= 0 ? (parts[documentsIdx + 1] ?? null) : null,
  };
}

/**
 * POST — Run deep AI analysis on a specific document.
 *
 * For property_search documents (imported from search results), this endpoint:
 *  1. Tries to fetch real data directly from the source URL (TrueAutomation API,
 *     eSearch HTML, publicsearch.us API, or generic HTML)
 *  2. Falls back to running the full boundary-fetch pipeline using the project's
 *     property address and/or parcel ID to get the legal description
 *  3. Updates the document's extracted_text with the real content before running AI
 *
 * For uploaded documents with extracted text, analyzes the stored text directly.
 */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { projectId, docId } = extractIds(req);
  if (!projectId || !docId) {
    return NextResponse.json({ error: 'Project ID and Document ID are required' }, { status: 400 });
  }

  // Load project + document in parallel
  const [projectRes, docRes] = await Promise.all([
    supabaseAdmin
      .from('research_projects')
      .select('id, property_address, county, parcel_id')
      .eq('id', projectId)
      .single(),
    supabaseAdmin
      .from('research_documents')
      .select('id, document_type, document_label, extracted_text, processing_status, source_type, source_url, extracted_text_method')
      .eq('id', docId)
      .eq('research_project_id', projectId)
      .single(),
  ]);

  if (projectRes.error || !projectRes.data) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }
  if (docRes.error || !docRes.data) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }

  const project = projectRes.data;
  const doc = docRes.data;

  let textToAnalyze = doc.extracted_text ?? '';
  let fetchMethod = doc.extracted_text_method ?? 'stored';

  // ── Live fetch for property_search documents ─────────────────────────────
  // These documents were imported from search results — their stored text is just
  // a short description blurb, not real property data. We need to go get the data.
  const isSearchRef = doc.source_type === 'property_search' ||
    doc.extracted_text_method === 'property_search' ||
    textToAnalyze.trim().length < MIN_PROPERTY_TEXT_LENGTH;

  if (isSearchRef) {
    // Strategy A: Fetch the actual source URL (TrueAutomation API / eSearch HTML / etc.)
    if (doc.source_url) {
      const fetched = await fetchSourceContent(doc.source_url, {
        propertyId: project.parcel_id ?? undefined,
        address: project.property_address ?? undefined,
      });
      if (fetched && fetched.text.length > 150) {
        textToAnalyze = fetched.text;
        fetchMethod = fetched.method;
      }
    }

    // Strategy B: Run the full boundary-fetch pipeline using the project's address/parcel_id.
    // This covers all 8+ resolution methods including TrueAutomation, ArcGIS, Geocoding, AI.
    if (
      textToAnalyze.trim().length < MIN_PROPERTY_TEXT_LENGTH &&
      (project.property_address || project.parcel_id)
    ) {
      const fetchResult = await fetchBoundaryCalls({
        address: project.property_address ?? undefined,
        county:  project.county          ?? undefined,
        parcel_id: project.parcel_id     ?? undefined,
      });

      if (fetchResult.legal_description) {
        textToAnalyze = buildBoundaryFetchText(fetchResult);
        fetchMethod = 'boundary-fetch-pipeline';

        // Persist the real content back to the document so future analyses are instant
        await supabaseAdmin.from('research_documents').update({
          extracted_text: textToAnalyze,
          extracted_text_method: fetchMethod,
          processing_status: 'extracted',
          updated_at: new Date().toISOString(),
        }).eq('id', docId);

        // If we found the parcel ID and the project doesn't have one yet, save it
        if (fetchResult.property_id && !project.parcel_id) {
          await supabaseAdmin
            .from('research_projects')
            .update({ parcel_id: fetchResult.property_id, updated_at: new Date().toISOString() })
            .eq('id', projectId);
        }
      } else if (fetchResult.property) {
        // Even without a legal description, we may have owner/acreage/deed-ref data worth analyzing
        textToAnalyze = buildBoundaryFetchText(fetchResult);
        fetchMethod = 'boundary-fetch-partial';
        await supabaseAdmin.from('research_documents').update({
          extracted_text: textToAnalyze,
          extracted_text_method: fetchMethod,
          updated_at: new Date().toISOString(),
        }).eq('id', docId);
      }
    }

    // Update db with freshly fetched content when source fetch succeeded
    if (fetchMethod !== (doc.extracted_text_method ?? 'stored') && doc.source_url && textToAnalyze.length > 150) {
      await supabaseAdmin.from('research_documents').update({
        extracted_text: textToAnalyze,
        extracted_text_method: fetchMethod,
        processing_status: 'extracted',
        updated_at: new Date().toISOString(),
      }).eq('id', docId);
    }
  }

  // ── Guard: must have something to analyze ────────────────────────────────
  if (!textToAnalyze || textToAnalyze.trim().length < 20) {
    return NextResponse.json(
      {
        error: [
          'Could not retrieve property data for analysis.',
          project.property_address
            ? `Address used: "${project.property_address}"`
            : 'No property address on this project.',
          'Try setting the property address on the project and running Fetch Boundary Calls first.',
        ].join(' '),
      },
      { status: 422 },
    );
  }

  const result = await deepAnalyzeDocument(
    docId,
    textToAnalyze,
    doc.document_type as DocumentType | null,
    doc.document_label,
  );

  return NextResponse.json(result);
}, { routeName: 'research/documents/deep-analyze' });
