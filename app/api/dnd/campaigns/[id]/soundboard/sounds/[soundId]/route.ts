// app/api/dnd/campaigns/[id]/soundboard/sounds/[soundId]/route.ts — edit/remove a
// sound (Phase H6/H7). PATCH sets volume/loop/label; DELETE removes it. DM-only.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession, getCampaignRole } from '@/lib/dnd/auth';

export async function PATCH(req: NextRequest, { params }: { params: { id: string; soundId: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  if ((await getCampaignRole(params.id)) !== 'dm') return NextResponse.json({ error: 'Only the DM can edit sounds.' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  if (body.volume != null) patch.volume = Math.max(0, Math.min(1, Number(body.volume)));
  if (typeof body.loop === 'boolean') patch.loop = body.loop;
  if (body.label != null) patch.label = String(body.label).slice(0, 60);
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('dnd_sounds')
    .update(patch)
    .eq('id', params.soundId)
    .eq('campaign_id', params.id)
    .select('id, tab_id, label, url, kind, volume, loop, sort_order')
    .single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Could not update sound.' }, { status: 500 });
  return NextResponse.json({ sound: data });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string; soundId: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  if ((await getCampaignRole(params.id)) !== 'dm') return NextResponse.json({ error: 'Only the DM can remove sounds.' }, { status: 403 });

  const { error } = await supabaseAdmin.from('dnd_sounds').delete().eq('id', params.soundId).eq('campaign_id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
