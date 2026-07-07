// app/api/dnd/sessions/[id]/encounters/route.ts — encounters for a session (G4).
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession, getCampaignRole } from '@/lib/dnd/auth';

async function sessionCampaign(sessionId: string): Promise<string | null> {
  const { data } = await supabaseAdmin.from('dnd_sessions').select('campaign_id').eq('id', sessionId).maybeSingle();
  return (data as { campaign_id: string } | null)?.campaign_id ?? null;
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const campaignId = await sessionCampaign(params.id);
  if (!campaignId) return NextResponse.json({ error: 'Session not found.' }, { status: 404 });
  if ((await getCampaignRole(campaignId)) !== 'dm') return NextResponse.json({ error: 'Only the DM can create encounters.' }, { status: 403 });

  const { name } = await req.json().catch(() => ({}));
  const { data, error } = await supabaseAdmin
    .from('dnd_encounters')
    .insert({ session_id: params.id, name: name ? String(name) : null })
    .select('*')
    .single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Could not create encounter.' }, { status: 500 });
  return NextResponse.json({ encounter: data });
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const campaignId = await sessionCampaign(params.id);
  if (!campaignId) return NextResponse.json({ error: 'Session not found.' }, { status: 404 });
  if ((await getCampaignRole(campaignId)) === null) return NextResponse.json({ error: 'No access.' }, { status: 403 });

  const { data, error } = await supabaseAdmin
    .from('dnd_encounters')
    .select('id, name, round, current_turn_index, status, created_at')
    .eq('session_id', params.id)
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ encounters: data ?? [] });
}
