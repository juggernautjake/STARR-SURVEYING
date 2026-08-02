// app/api/admin/research/[projectId]/documents/[docId]/annotations/route.ts — markup that survives
// closing the viewer (plan R24).
//
// The viewer has had a drawing canvas since it was written and nothing ever persisted it. These
// routes store the strokes in their own table: the original file is never re-encoded and never
// written to, so the download stays byte-identical to what was fetched from the county.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { supabaseAdmin } from '@/lib/supabase';
import {
  summariseAnnotations,
  toLayer,
  validateStrokes,
  type AnnotationRow,
  type Stroke,
} from '@/lib/research/document-annotations';

function extractIds(req: NextRequest): { projectId: string | null; docId: string | null } {
  const after = req.nextUrl.pathname.split('/research/')[1];
  if (!after) return { projectId: null, docId: null };
  const parts = after.split('/');
  // [projectId, "documents", docId, "annotations"]
  return { projectId: parts[0] || null, docId: parts[2] || null };
}

/* GET — every layer on this document, all pages. */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { projectId, docId } = extractIds(req);
  if (!projectId || !docId) return NextResponse.json({ error: 'Project and document required' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('document_annotations')
    .select('*')
    .eq('research_project_id', projectId)
    .eq('document_id', docId)
    .order('layer_order', { ascending: true });

  // A failed read is not "no markup". Rendering an empty canvas would tell a surveyor their work is
  // gone — the exact fear this feature exists to remove.
  if (error) {
    return NextResponse.json(
      { error: 'The saved markup could not be read. This is not the same as there being none.' },
      { status: 500 },
    );
  }

  const layers = ((data ?? []) as AnnotationRow[]).map(toLayer);
  return NextResponse.json(
    { layers, summary: summariseAnnotations(layers) },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}, { routeName: 'research/document-annotations' });

/* PUT — save one layer for one page. Upsert, so re-saving after two more strokes replaces the layer
 * rather than appending a duplicate row. */
export const PUT = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { projectId, docId } = extractIds(req);
  if (!projectId || !docId) return NextResponse.json({ error: 'Project and document required' }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as {
    page?: number;
    layerName?: string;
    layerColor?: string | null;
    layerOrder?: number;
    visible?: boolean;
    strokes?: Stroke[];
  };

  const page = Number.isInteger(body.page) ? body.page! : 0;
  const layerName = (body.layerName ?? 'Markup').trim() || 'Markup';

  const invalid = validateStrokes(body.strokes ?? []);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  // The document must belong to this project — otherwise the project id in the path is decoration
  // and anyone could annotate any document by guessing an id.
  const { data: doc } = await supabaseAdmin
    .from('research_documents')
    .select('id')
    .eq('id', docId)
    .eq('research_project_id', projectId)
    .single();
  if (!doc) return NextResponse.json({ error: 'Document not found in this project' }, { status: 404 });

  const { data, error } = await supabaseAdmin
    .from('document_annotations')
    .upsert({
      research_project_id: projectId,
      document_id: docId,
      page,
      layer_name: layerName,
      layer_color: body.layerColor ?? null,
      layer_order: body.layerOrder ?? 0,
      visible: body.visible ?? true,
      strokes: body.strokes ?? [],
      author_email: session.user.email,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'document_id,page,layer_name,author_email' })
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: `The markup could not be saved: ${error.message}` }, { status: 500 });

  return NextResponse.json({ layer: toLayer(data as AnnotationRow) });
}, { routeName: 'research/document-annotations-save' });
