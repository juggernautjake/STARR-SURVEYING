// app/api/admin/cad/point-files/route.ts
//
// cad-branching — shared point-file library. Uploaded coordinate files
// (CSV / TXT / RW5 / …) live here so EVERY CAD user can pull one and start a
// new survey from scratch. Readable by all authenticated users; a file can
// only be removed by whoever uploaded it.
//
//   GET    /api/admin/cad/point-files          — list (metadata only)
//   GET    /api/admin/cad/point-files?id=<id>   — one file incl. raw content
//   POST   /api/admin/cad/point-files          — add a file to the library
//   DELETE /api/admin/cad/point-files?id=<id>   — remove (uploader only)

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB — point files are small text files
const LIST_COLS = 'id, name, description, uploaded_by, format, point_count, byte_size, job_id, created_at';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (id) {
    const { data, error } = await supabaseAdmin
      .from('cad_point_files')
      .select('*')
      .eq('id', id)
      .single();
    if (error) return NextResponse.json({ error: 'Point file not found' }, { status: 404 });
    return NextResponse.json({ file: data });
  }

  const { data, error } = await supabaseAdmin
    .from('cad_point_files')
    .select(LIST_COLS)
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ files: data ?? [] });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await req.json()) as {
    name?: string;
    description?: string;
    content?: string;
    format?: string;
    point_count?: number;
    job_id?: string | null;
  };

  if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
    return NextResponse.json({ error: 'Missing required field: name' }, { status: 400 });
  }
  if (typeof body.content !== 'string' || !body.content.length) {
    return NextResponse.json({ error: 'Missing required field: content' }, { status: 400 });
  }
  const byteSize = Buffer.byteLength(body.content, 'utf8');
  if (byteSize > MAX_BYTES) {
    return NextResponse.json({ error: 'Point file is too large (max 5 MB)' }, { status: 413 });
  }
  const format = (body.format || 'CSV').toUpperCase().slice(0, 8);

  const { data, error } = await supabaseAdmin
    .from('cad_point_files')
    .insert({
      name: body.name.trim(),
      description: body.description?.trim() || null,
      content: body.content,
      format,
      point_count: Number.isFinite(body.point_count) ? Math.max(0, Math.round(body.point_count as number)) : 0,
      byte_size: byteSize,
      job_id: body.job_id ?? null,
      uploaded_by: session.user.email,
    })
    .select(LIST_COLS)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ file: data }, { status: 201 });
});

export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing required query param: id' }, { status: 400 });

  // Only the uploader may remove their file from the shared library.
  const { data: existing } = await supabaseAdmin
    .from('cad_point_files')
    .select('id, uploaded_by')
    .eq('id', id)
    .maybeSingle();
  if (!existing) return NextResponse.json({ error: 'Point file not found' }, { status: 404 });
  if (existing.uploaded_by !== session.user.email) {
    return NextResponse.json({ error: 'Only the uploader can remove this file' }, { status: 403 });
  }

  const { error } = await supabaseAdmin.from('cad_point_files').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
});
