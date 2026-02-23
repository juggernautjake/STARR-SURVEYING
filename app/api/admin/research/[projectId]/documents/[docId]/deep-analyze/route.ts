// app/api/admin/research/[projectId]/documents/[docId]/deep-analyze/route.ts
// Runs a deep AI analysis (LEGAL_DESCRIPTION_ANALYZER or PLAT_ANALYZER) on a single document.
// This is a supplementary analysis beyond the standard DATA_EXTRACTOR pipeline.
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { deepAnalyzeDocument } from '@/lib/research/document-analysis.service';
import type { DocumentType } from '@/types/research';

function extractIds(req: NextRequest): { projectId: string | null; docId: string | null } {
  const parts = req.nextUrl.pathname.split('/');
  // Path: /api/admin/research/[projectId]/documents/[docId]/deep-analyze
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
 * Selects LEGAL_DESCRIPTION_ANALYZER for deeds, legal descriptions, metes-and-bounds, etc.
 * Selects PLAT_ANALYZER for plats and subdivision plats.
 *
 * Returns a DeepDocumentAnalysis object. Does NOT store the result in the database —
 * the caller can use the response to display results and optionally trigger further processing.
 */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { projectId, docId } = extractIds(req);
  if (!projectId || !docId) {
    return NextResponse.json({ error: 'Project ID and Document ID are required' }, { status: 400 });
  }

  // Verify project exists
  const { data: project, error: projError } = await supabaseAdmin
    .from('research_projects')
    .select('id')
    .eq('id', projectId)
    .single();

  if (projError || !project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  // Load the document
  const { data: doc, error: docError } = await supabaseAdmin
    .from('research_documents')
    .select('id, document_type, document_label, extracted_text, processing_status')
    .eq('id', docId)
    .eq('research_project_id', projectId)
    .single();

  if (docError || !doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }

  if (!doc.extracted_text || doc.extracted_text.trim().length < 20) {
    return NextResponse.json(
      { error: 'Document has no extracted text. Process the document first before running deep analysis.' },
      { status: 422 },
    );
  }

  const result = await deepAnalyzeDocument(
    docId,
    doc.extracted_text,
    doc.document_type as DocumentType | null,
    doc.document_label,
  );

  return NextResponse.json(result);
}, { routeName: 'research/documents/deep-analyze' });
