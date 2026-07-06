// app/api/dnd/characters/[id]/route.ts — load/save a single character (Phase C4).
// GET: read (owner/DM, or campaign/public per visibility). PATCH: save the sheet
// `data` (+ a whitelist of top-level fields) — owner or DM only.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getCharacterAccess } from '@/lib/dnd/characters';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const res = await getCharacterAccess(params.id);
  if (!res.access) return NextResponse.json({ error: res.error }, { status: res.status });
  const { character, isOwner, isDM } = res.access;
  return NextResponse.json({ character, access: { isOwner, isDM, canWrite: res.access.canWrite } });
}

// Fields a PATCH may set. `data` is the whole sheet state (the primary payload);
// the rest cover media/descriptions/theme edits. Unknown keys are ignored.
const WRITABLE = ['data', 'bio', 'name', 'theme', 'art_url', 'token_url', 'visibility', 'quick_stats', 'is_library'] as const;

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const res = await getCharacterAccess(params.id);
  if (!res.access) return NextResponse.json({ error: res.error }, { status: res.status });
  if (!res.access.canWrite) {
    return NextResponse.json({ error: 'You cannot edit this character.' }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  for (const key of WRITABLE) {
    if (key in body) patch[key] = body[key];
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No writable fields in body.' }, { status: 400 });
  }
  if ('name' in patch && !String(patch.name ?? '').trim()) {
    return NextResponse.json({ error: 'name cannot be empty.' }, { status: 400 });
  }
  if ('visibility' in patch && !['private', 'campaign', 'public'].includes(String(patch.visibility))) {
    return NextResponse.json({ error: 'Invalid visibility.' }, { status: 400 });
  }
  patch.updated_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from('dnd_characters')
    .update(patch)
    .eq('id', params.id)
    .select('*')
    .single();
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Could not save character.' }, { status: 500 });
  }
  return NextResponse.json({ character: data });
}
