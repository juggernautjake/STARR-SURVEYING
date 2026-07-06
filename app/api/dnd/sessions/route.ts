// app/api/dnd/sessions/route.ts — create a session (Phase E4). DM-only.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession, getCampaignRole } from '@/lib/dnd/auth';

export async function POST(req: NextRequest) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  try {
    const { campaignId, title } = await req.json();
    if (!campaignId) return NextResponse.json({ error: 'campaignId is required.' }, { status: 400 });
    if (!title || !String(title).trim()) return NextResponse.json({ error: 'Session title is required.' }, { status: 400 });
    if ((await getCampaignRole(String(campaignId))) !== 'dm') {
      return NextResponse.json({ error: 'Only the DM can create sessions.' }, { status: 403 });
    }

    const { count } = await supabaseAdmin
      .from('dnd_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', campaignId);

    const { data, error } = await supabaseAdmin
      .from('dnd_sessions')
      .insert({ campaign_id: campaignId, title: String(title).trim(), status: 'prep', sort_order: count ?? 0 })
      .select('id, title, status, sort_order')
      .single();
    if (error || !data) return NextResponse.json({ error: error?.message ?? 'Could not create session.' }, { status: 500 });
    return NextResponse.json({ session: data });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Create failed.' }, { status: 500 });
  }
}
