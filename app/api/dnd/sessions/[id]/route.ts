// app/api/dnd/sessions/[id]/route.ts — session detail / update (Phase E4).
// GET: any member. PATCH/DELETE: DM only (status flow prep→live→done, title, notes).
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession, getCampaignRole } from '@/lib/dnd/auth';

async function loadSession(id: string) {
  const { data } = await supabaseAdmin
    .from('dnd_sessions')
    .select('id, campaign_id, title, status, scheduled_at, sort_order, dm_notes')
    .eq('id', id)
    .maybeSingle();
  return data as { id: string; campaign_id: string; title: string; status: string; dm_notes: string | null } | null;
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = getDndSession();
  if (!auth) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const s = await loadSession(params.id);
  if (!s) return NextResponse.json({ error: 'Session not found.' }, { status: 404 });
  const role = await getCampaignRole(s.campaign_id);
  if (role === null) {
    return NextResponse.json({ error: 'No access to this session.' }, { status: 403 });
  }
  // dm_notes is DM-private — strip it for players.
  const session = role === 'dm' ? s : { ...s, dm_notes: null };
  return NextResponse.json({ session: { ...session, role } });
}

const WRITABLE = ['title', 'status', 'sort_order', 'dm_notes', 'scheduled_at'] as const;

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = getDndSession();
  if (!auth) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const s = await loadSession(params.id);
  if (!s) return NextResponse.json({ error: 'Session not found.' }, { status: 404 });
  if ((await getCampaignRole(s.campaign_id)) !== 'dm') {
    return NextResponse.json({ error: 'Only the DM can edit sessions.' }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }
  const patch: Record<string, unknown> = {};
  for (const k of WRITABLE) if (k in body) patch[k] = body[k];
  if ('status' in patch && !['prep', 'live', 'done'].includes(String(patch.status))) {
    return NextResponse.json({ error: 'Invalid status.' }, { status: 400 });
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'No writable fields.' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('dnd_sessions')
    .update(patch)
    .eq('id', params.id)
    .select('id, title, status, sort_order, dm_notes')
    .single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Could not update session.' }, { status: 500 });
  return NextResponse.json({ session: data });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = getDndSession();
  if (!auth) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const s = await loadSession(params.id);
  if (!s) return NextResponse.json({ error: 'Session not found.' }, { status: 404 });
  if ((await getCampaignRole(s.campaign_id)) !== 'dm') {
    return NextResponse.json({ error: 'Only the DM can delete sessions.' }, { status: 403 });
  }
  const { error } = await supabaseAdmin.from('dnd_sessions').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
