// app/api/admin/research/[projectId]/documents/manual/route.ts — Manual text entry
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { processDocument } from '@/lib/research/document.service';

/* POST — Create a manual-entry document (user types in content directly) */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projectId = req.nextUrl.pathname.split('/research/')[1]?.split('/')[0];
  if (!projectId) return NextResponse.json({ error: 'Project ID required' }, { status: 400 });

  // Verify project exists
  const { data: project } = await supabaseAdmin
    .from('research_projects')
    .select('id')
    .eq('id', projectId)
    .single();

  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  const body = await req.json();
  const { document_type, document_label, content, recording_info, recorded_date } = body;

  if (!content || content.trim().length < 10) {
    return NextResponse.json({ error: 'Content must be at least 10 characters' }, { status: 400 });
  }

  // Skip if a manual entry with identical content already exists in this project
  const trimmedContent = content.trim();
  const { data: existingManual } = await supabaseAdmin
    .from('research_documents')
    .select('id')
    .eq('research_project_id', projectId)
    .eq('source_type', 'manual_entry')
    .eq('extracted_text', trimmedContent)
    .maybeSingle();
  if (existingManual) {
    return NextResponse.json({ document: existingManual }, { status: 200 });
  }

  // Create document record with text already populated
  const { data: doc, error } = await supabaseAdmin
    .from('research_documents')
    .insert({
      research_project_id: projectId,
      source_type: 'manual_entry',
      original_filename: null,
      file_type: 'txt',
      file_size_bytes: Buffer.byteLength(trimmedContent, 'utf-8'),
      document_type: document_type || null,
      document_label: document_label || 'Manual Entry',
      extracted_text: trimmedContent,
      extracted_text_method: 'manual',
      processing_status: 'extracted',
      recording_info: recording_info || null,
      recorded_date: recorded_date || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Classify document type if not provided
  if (!document_type) {
    processDocument(doc.id).catch(err => {
      console.error(`[Manual Entry] Classification failed for ${doc.id}:`, err);
    });
  }

  return NextResponse.json({ document: doc }, { status: 201 });
}, { routeName: 'research/documents/manual' });
