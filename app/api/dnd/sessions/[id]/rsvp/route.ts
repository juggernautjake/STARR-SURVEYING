// app/api/dnd/sessions/[id]/rsvp/route.ts — mark yourself going / not going / maybe (P3-5).
//
// GET returns the tally plus the caller's own answer; POST sets it. Any member may answer for THEMSELVES
// only — there is no `userId` in the body on purpose, so the route cannot be used to RSVP on someone
// else's behalf, and no permission check beyond membership is needed to make that safe.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession, getCampaignRole } from '@/lib/dnd/auth';
import { enforceRateLimit } from '@/lib/dnd/rate-limit';
import { normalizeRsvp, tallyRsvps, type RsvpRow } from '@/lib/dnd/rsvp';

/** The campaign a session belongs to, or null. */
async function sessionCampaign(sessionId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('dnd_sessions')
    .select('campaign_id')
    .eq('id', sessionId)
    .maybeSingle();
  return (data as { campaign_id: string } | null)?.campaign_id ?? null;
}

/** Every member of a campaign — the denominator that makes "haven't answered" possible. */
async function memberIds(campaignId: string): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from('dnd_campaign_members')
    .select('user_id')
    .eq('campaign_id', campaignId);
  return ((data ?? []) as { user_id: string }[]).map((m) => m.user_id);
}

async function loadRsvps(sessionId: string): Promise<RsvpRow[]> {
  const { data } = await supabaseAdmin
    .from('dnd_session_rsvps')
    .select('user_id, status')
    .eq('session_id', sessionId);
  return (data ?? []) as RsvpRow[];
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const campaignId = await sessionCampaign(params.id);
  if (!campaignId) return NextResponse.json({ error: 'Session not found.' }, { status: 404 });
  if ((await getCampaignRole(campaignId)) === null) {
    return NextResponse.json({ error: 'Not a member of this campaign.' }, { status: 403 });
  }

  const [rows, members] = await Promise.all([loadRsvps(params.id), memberIds(campaignId)]);
  const mine = rows.find((r) => r.user_id === session.userId);
  return NextResponse.json({
    tally: tallyRsvps(rows, members),
    mine: normalizeRsvp(mine?.status) ?? null,
  });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const campaignId = await sessionCampaign(params.id);
  if (!campaignId) return NextResponse.json({ error: 'Session not found.' }, { status: 404 });
  if ((await getCampaignRole(campaignId)) === null) {
    return NextResponse.json({ error: 'Not a member of this campaign.' }, { status: 403 });
  }

  const limited = await enforceRateLimit('write', session.userId);
  if (limited) return limited;

  const body = await req.json().catch(() => ({}));
  const status = normalizeRsvp(body?.status);

  if (status === null) {
    // Clearing IS a valid action, and distinct from answering "no" — a player who changes their mind back
    // to undecided should not be counted as declining. `null` deletes the row.
    await supabaseAdmin.from('dnd_session_rsvps').delete().eq('session_id', params.id).eq('user_id', session.userId);
  } else {
    // Upsert on the unique (session_id, user_id) pair, so changing an answer UPDATES rather than appending
    // — otherwise the tally drifts upward with every reconsideration.
    const { error } = await supabaseAdmin.from('dnd_session_rsvps').upsert(
      { session_id: params.id, user_id: session.userId, status, updated_at: new Date().toISOString() },
      { onConflict: 'session_id,user_id' },
    );
    if (error) {
      return NextResponse.json(
        { error: 'Could not save your answer. If this persists, the RSVP migration may not be applied.' },
        { status: 500 },
      );
    }
  }

  const [rows, members] = await Promise.all([loadRsvps(params.id), memberIds(campaignId)]);
  return NextResponse.json({ ok: true, tally: tallyRsvps(rows, members), mine: status });
}
