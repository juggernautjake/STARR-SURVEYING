// app/api/admin/research/[projectId]/artifacts/route.ts
// Returns all pipeline artifacts (screenshots, page images, plat images, etc.)
// with their storage URLs, organized by category for the gallery viewer.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
// Shared with full-extract, which needs the same answer about the same rows. It had its own copy of
// this logic pointed at a `research_artifacts` table that never existed (platform audit §8.4).
import { categorizeDocument, isImageFileType } from '@/lib/research/artifact-category';

function extractProjectId(req: NextRequest): string | null {
  const parts = req.nextUrl.pathname.split('/research/')[1]?.split('/');
  return parts?.[0] || null;
}

/* GET — List all viewable artifacts for a research project */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const projectId = extractProjectId(req);
  if (!projectId) {
    return NextResponse.json({ error: 'Project ID required' }, { status: 400 });
  }

  // Fetch all documents that have a storage_url (i.e., uploaded artifacts)
  const { data: docs, error } = await supabaseAdmin
    .from('research_documents')
    .select(
      'id, original_filename, file_type, file_size_bytes, storage_path, storage_url, ' +
      'pages_pdf_url, source_url, document_type, document_label, processing_status, ' +
      'extracted_text, ocr_confidence, page_count, recorded_date, recording_info, created_at',
    )
    .eq('research_project_id', projectId)
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Organize into categories
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const artifacts = (docs || []).map((doc: any) => ({
    id: doc.id,
    filename: doc.original_filename,
    fileType: doc.file_type,
    fileSize: doc.file_size_bytes,
    storageUrl: doc.storage_url,
    pagesPdfUrl: doc.pages_pdf_url,
    sourceUrl: doc.source_url,
    documentType: doc.document_type,
    label: doc.document_label || doc.original_filename,
    status: doc.processing_status,
    extractedText: doc.extracted_text ? doc.extracted_text.slice(0, 500) : null,
    ocrConfidence: doc.ocr_confidence,
    pageCount: doc.page_count,
    recordedDate: doc.recorded_date,
    recordingInfo: doc.recording_info,
    createdAt: doc.created_at,
    // Determine if this is viewable as an image
    isImage: isImageFileType(doc.file_type),
    isPdf: doc.file_type === 'pdf' || !!doc.pages_pdf_url,
    // Determine category for grouping
    category: categorizeDocument(doc.document_type, doc.storage_path, doc.document_label),
  }));

  // Filter out MISC screenshots entirely — they clutter results with
  // error pages, empty results, auth walls, and other non-useful captures.
  const useful = artifacts.filter(
    (a: { category: string }) => a.category !== 'screenshots-misc',
  );

  // Group by category
  const grouped: Record<string, typeof artifacts> = {};
  for (const a of useful) {
    const cat = a.category;
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(a);
  }

  return NextResponse.json({
    projectId,
    totalCount: useful.length,
    miscCount: artifacts.length - useful.length,
    artifacts: useful,
    grouped,
  });
}, { routeName: 'research/artifacts' });
