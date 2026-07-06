// app/api/dnd/messages/route.ts — messaging model + send/list per channel (F1).
// Channels: party (all members), dm_broadcast (DM→all), direct/group (sender +
// listed recipients). Realtime delivery (F2) + UI (F3+) build on this.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession, getCampaignRole } from '@/lib/dnd/auth';

const CHANNELS = ['party', 'dm_broadcast', 'direct', 'group'];

export async function POST(req: NextRequest) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  try {
    const { campaignId, channel, body, toUserIds, imageUrl, isReveal } = await req.json();
    if (!campaignId) return NextResponse.json({ error: 'campaignId is required.' }, { status: 400 });
    if (!CHANNELS.includes(channel)) return NextResponse.json({ error: 'Invalid channel.' }, { status: 400 });
    if (!String(body ?? '').trim() && !imageUrl) return NextResponse.json({ error: 'Message body or image is required.' }, { status: 400 });

    const role = await getCampaignRole(String(campaignId));
    if (role === null) return NextResponse.json({ error: 'Not a member of this campaign.' }, { status: 403 });
    if (channel === 'dm_broadcast' && role !== 'dm') {
      return NextResponse.json({ error: 'Only the DM can broadcast.' }, { status: 403 });
    }
    const recipients: string[] = Array.isArray(toUserIds) ? toUserIds.map(String) : [];
    if ((channel === 'direct' || channel === 'group') && recipients.length === 0) {
      return NextResponse.json({ error: 'Direct/group messages need at least one recipient.' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('dnd_messages')
      .insert({
        campaign_id: campaignId,
        channel,
        from_user_id: session.userId,
        to_user_ids: recipients,
        body: body ? String(body) : null,
        image_url: imageUrl ?? null,
        is_reveal: !!isReveal,
      })
      .select('*')
      .single();
    if (error || !data) return NextResponse.json({ error: error?.message ?? 'Could not send message.' }, { status: 500 });
    return NextResponse.json({ message: data });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Send failed.' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const campaignId = req.nextUrl.searchParams.get('campaignId');
  const channel = req.nextUrl.searchParams.get('channel') ?? 'party';
  const limit = Math.min(200, Math.max(1, Number(req.nextUrl.searchParams.get('limit') ?? 100)));
  if (!campaignId) return NextResponse.json({ error: 'campaignId is required.' }, { status: 400 });
  if (!CHANNELS.includes(channel)) return NextResponse.json({ error: 'Invalid channel.' }, { status: 400 });

  const role = await getCampaignRole(campaignId);
  if (role === null) return NextResponse.json({ error: 'Not a member of this campaign.' }, { status: 403 });

  let query = supabaseAdmin
    .from('dnd_messages')
    .select('*')
    .eq('campaign_id', campaignId)
    .eq('channel', channel)
    .order('created_at', { ascending: true })
    .limit(limit);

  // party + dm_broadcast are visible to all members; direct/group only to the
  // sender or a listed recipient.
  if (channel === 'direct' || channel === 'group') {
    query = query.or(`from_user_id.eq.${session.userId},to_user_ids.cs.{${session.userId}}`);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ messages: data ?? [] });
}
