// app/api/dnd/campaigns/[id]/soundboard/route.ts — DM soundboard data (Phase H5/H6).
// GET returns the campaign's tabs + sounds (any member). POST creates a tab (DM only).
// Sound uploads live in ./sounds; deletes in ./sounds/[soundId].
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession, getCampaignRole } from '@/lib/dnd/auth';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const role = await getCampaignRole(params.id);
  if (role === null) return NextResponse.json({ error: 'Not a member of this campaign.' }, { status: 403 });

  const [{ data: tabs }, { data: sounds }] = await Promise.all([
    supabaseAdmin.from('dnd_soundboard_tabs').select('id, name, sort_order').eq('campaign_id', params.id).order('sort_order', { ascending: true }),
    supabaseAdmin.from('dnd_sounds').select('id, tab_id, label, url, kind, volume, loop, sort_order').eq('campaign_id', params.id).order('sort_order', { ascending: true }),
  ]);
  return NextResponse.json({ tabs: tabs ?? [], sounds: sounds ?? [], role });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  if ((await getCampaignRole(params.id)) !== 'dm') return NextResponse.json({ error: 'Only the DM can edit the soundboard.' }, { status: 403 });

  const { name } = await req.json().catch(() => ({}));
  if (!String(name ?? '').trim()) return NextResponse.json({ error: 'Tab name is required.' }, { status: 400 });

  const { count } = await supabaseAdmin.from('dnd_soundboard_tabs').select('id', { count: 'exact', head: true }).eq('campaign_id', params.id);
  const { data, error } = await supabaseAdmin
    .from('dnd_soundboard_tabs')
    .insert({ campaign_id: params.id, name: String(name).trim().slice(0, 40), sort_order: count ?? 0, created_by: session.userId })
    .select('id, name, sort_order')
    .single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Could not create tab.' }, { status: 500 });
  return NextResponse.json({ tab: data });
}
