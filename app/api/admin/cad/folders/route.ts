// app/api/admin/cad/folders/route.ts
// CRUD endpoints for the shared CAD folder tree.
//
// GET    /api/admin/cad/folders          — list every folder (shared)
// POST   /api/admin/cad/folders          — create { name, parent_id? }
// PATCH  /api/admin/cad/folders          — rename / move { id, name?, parent_id? }
// DELETE /api/admin/cad/folders?id=<id>  — delete a folder (subfolders cascade;
//                                          drawings fall back to the root)
//
// Folders are a shared workspace — any authenticated CAD user can manage them.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';

interface FolderRow {
  id: string;
  parent_id: string | null;
  name: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

const SELECT_COLS = 'id, parent_id, name, created_by, created_at, updated_at';

// ─── GET ──────────────────────────────────────────────────────────────────

export const GET = withErrorHandler(async () => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { data, error } = await supabaseAdmin
    .from('cad_folders')
    .select(SELECT_COLS)
    .order('name', { ascending: true });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ folders: data ?? [] });
});

// ─── POST — create ──────────────────────────────────────────────────────────

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const body = await req.json() as { name?: string; parent_id?: string | null };
  const name = (body.name ?? '').trim();
  if (!name) {
    return NextResponse.json({ error: 'Missing required field: name' }, { status: 400 });
  }
  const { data, error } = await supabaseAdmin
    .from('cad_folders')
    .insert({
      name,
      parent_id: body.parent_id ?? null,
      created_by: session.user.email,
    })
    .select(SELECT_COLS)
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ folder: data }, { status: 201 });
});

// ─── PATCH — rename / move ────────────────────────────────────────────────────

export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const body = await req.json() as { id?: string; name?: string; parent_id?: string | null };
  if (!body.id) {
    return NextResponse.json({ error: 'Missing required field: id' }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (typeof body.name === 'string') {
    if (!body.name.trim()) {
      return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 });
    }
    patch.name = body.name.trim();
  }

  if ('parent_id' in body) {
    const newParent = body.parent_id ?? null;
    if (newParent === body.id) {
      return NextResponse.json({ error: 'A folder cannot be its own parent' }, { status: 400 });
    }
    // Reject moving a folder into one of its own descendants (would create a
    // cycle / orphan the subtree).
    if (newParent) {
      const { data: all } = await supabaseAdmin
        .from('cad_folders')
        .select('id, parent_id');
      const rows = (all ?? []) as { id: string; parent_id: string | null }[];
      const byId = new Map<string, string | null>(rows.map((f) => [f.id, f.parent_id]));
      let cursor: string | null = newParent;
      while (cursor) {
        if (cursor === body.id) {
          return NextResponse.json({ error: 'Cannot move a folder into itself' }, { status: 400 });
        }
        cursor = byId.get(cursor) ?? null;
      }
    }
    patch.parent_id = newParent;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('cad_folders')
    .update(patch)
    .eq('id', body.id)
    .select(SELECT_COLS)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Folder not found' }, { status: 404 });
  return NextResponse.json({ folder: data as FolderRow });
});

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
  // Subfolders cascade (FK ON DELETE CASCADE); drawings in the deleted subtree
  // fall back to the root (FK ON DELETE SET NULL) so files are never lost.
  const { error } = await supabaseAdmin
    .from('cad_folders')
    .delete()
    .eq('id', id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
});
