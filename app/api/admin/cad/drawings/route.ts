// app/api/admin/cad/drawings/route.ts
// CRUD endpoints for persisting STARR CAD drawings in the database.
//
// GET    /api/admin/cad/drawings          — list all drawings owned by the user
// GET    /api/admin/cad/drawings?id=<id>  — fetch a single drawing by id
// POST   /api/admin/cad/drawings          — create / upsert a drawing
// DELETE /api/admin/cad/drawings?id=<id>  — delete a drawing

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

// ─── GET ────────────────────────────────────────────────────────────────────

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (id) {
    // Return a single drawing (full document payload)
    const { data, error } = await supabaseAdmin
      .from('cad_drawings')
      .select('*')
      .eq('id', id)
      .eq('created_by', session.user.email)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return NextResponse.json({ drawing: data });
  }

  // Return list — only metadata columns, not the full document JSONB
  const { data, error } = await supabaseAdmin
    .from('cad_drawings')
    .select('id, name, description, feature_count, layer_count, job_id, created_at, updated_at')
    .eq('created_by', session.user.email)
    .order('updated_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ drawings: data ?? [] });
});

// ─── POST ────────────────────────────────────────────────────────────────────

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json() as {
    id?: string;
    name: string;
    description?: string;
    document: unknown;
    job_id?: string | null;
    version?: string;
    feature_count?: number;
    layer_count?: number;
  };

  if (!body.name || typeof body.name !== 'string') {
    return NextResponse.json({ error: 'Missing required field: name' }, { status: 400 });
  }
  if (!body.document || typeof body.document !== 'object') {
    return NextResponse.json({ error: 'Missing required field: document' }, { status: 400 });
  }

  const payload = {
    created_by: session.user.email,
    name: body.name.trim(),
    description: body.description?.trim() ?? null,
    document: body.document,
    version: body.version ?? '1.0',
    application: 'starr-cad',
    feature_count: body.feature_count ?? 0,
    layer_count: body.layer_count ?? 0,
    job_id: body.job_id ?? null,
  };

  if (body.id) {
    // Update existing
    const { data, error } = await supabaseAdmin
      .from('cad_drawings')
      .update(payload)
      .eq('id', body.id)
      .eq('created_by', session.user.email)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ drawing: data });
  }

  // Insert new
  const { data, error } = await supabaseAdmin
    .from('cad_drawings')
    .insert(payload)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ drawing: data }, { status: 201 });
});

// ─── DELETE ──────────────────────────────────────────────────────────────────

export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'Missing required query param: id' }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from('cad_drawings')
    .delete()
    .eq('id', id)
    .eq('created_by', session.user.email);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
});
