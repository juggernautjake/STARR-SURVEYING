// app/api/admin/notes/route.ts
// CRUD for the shared company-notes board (/admin/notes).
//
// GET    /api/admin/notes                 — list all notes (pinned first)
//          ?category=safety               — optional category filter
//          ?search=monument               — optional title/content search
// POST   /api/admin/notes                 — create { title, content?, category? }
// PATCH  /api/admin/notes                 — update { id, title?, content?, category?, is_pinned? }
// DELETE /api/admin/notes?id=<id>         — delete a note
//
// Company notes are a shared workspace — any authenticated team member can
// read and manage them (access gated here at the auth layer, like the rest
// of /api/admin). Storage: seeds/291_company_notes.sql.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

const SELECT_COLS = 'id, title, content, category, is_pinned, created_by, created_at, updated_at';
const VALID_CATEGORIES = new Set([
  'general', 'procedures', 'safety', 'equipment', 'legal', 'hr', 'training',
]);

// ─── GET ──────────────────────────────────────────────────────────────────

export const GET = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const category = searchParams.get('category');
  const search = searchParams.get('search');

  let query = supabaseAdmin
    .from('company_notes')
    .select(SELECT_COLS)
    .order('is_pinned', { ascending: false })
    .order('updated_at', { ascending: false });

  if (category && category !== 'all' && VALID_CATEGORIES.has(category)) {
    query = query.eq('category', category);
  }
  if (search && search.trim()) {
    const term = search.trim().replace(/[%,]/g, '');
    query = query.or(`title.ilike.%${term}%,content.ilike.%${term}%`);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ notes: data ?? [] });
}, { routeName: 'admin/notes' });

// ─── POST — create ──────────────────────────────────────────────────────────

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const body = await req.json() as { title?: string; content?: string; category?: string; is_pinned?: boolean };
  const title = (body.title ?? '').trim();
  if (!title) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  }
  const category = body.category && VALID_CATEGORIES.has(body.category) ? body.category : 'general';

  const { data, error } = await supabaseAdmin
    .from('company_notes')
    .insert({
      title,
      content: body.content ?? '',
      category,
      is_pinned: body.is_pinned === true,
      created_by: session.user.email,
    })
    .select(SELECT_COLS)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ note: data }, { status: 201 });
}, { routeName: 'admin/notes' });

// ─── PATCH — update / pin ─────────────────────────────────────────────────────

export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const body = await req.json() as {
    id?: string; title?: string; content?: string; category?: string; is_pinned?: boolean;
  };
  if (!body.id) {
    return NextResponse.json({ error: 'Missing required field: id' }, { status: 400 });
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.title === 'string') {
    if (!body.title.trim()) {
      return NextResponse.json({ error: 'Title cannot be empty' }, { status: 400 });
    }
    patch.title = body.title.trim();
  }
  if (typeof body.content === 'string') patch.content = body.content;
  if (typeof body.category === 'string') {
    if (!VALID_CATEGORIES.has(body.category)) {
      return NextResponse.json({ error: `Invalid category: ${body.category}` }, { status: 400 });
    }
    patch.category = body.category;
  }
  if (typeof body.is_pinned === 'boolean') patch.is_pinned = body.is_pinned;

  const { data, error } = await supabaseAdmin
    .from('company_notes')
    .update(patch)
    .eq('id', body.id)
    .select(SELECT_COLS)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Note not found' }, { status: 404 });
  return NextResponse.json({ note: data });
}, { routeName: 'admin/notes' });

// ─── DELETE ───────────────────────────────────────────────────────────────────

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
  const { error } = await supabaseAdmin.from('company_notes').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}, { routeName: 'admin/notes' });
