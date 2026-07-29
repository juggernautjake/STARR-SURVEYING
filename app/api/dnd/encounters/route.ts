// app/api/dnd/encounters/route.ts — the encounters you run (P6-14).
//
// GET ?dm=1 → every encounter in a campaign this caller DMs, newest campaign first, labelled well enough
// to choose between in a dropdown.
//
// There was no way to LIST encounters at all: every route was `/encounters/[id]/…`, so anything wanting to
// offer "which fight?" had to already know the id. That is fine when you arrived from a session page and
// nowhere else — which is exactly why a creature in the Studio could not be sent to a fight.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession } from '@/lib/dnd/auth';

export async function GET(req: NextRequest) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  // DM-scoped only, and not because of a `?dm=1` parameter — because adding a combatant is a DM action and
  // a list a player cannot act on is a list that only tells them what fights exist. The parameter is
  // accepted for symmetry with the other routes and does not widen anything.
  const { data: dmRows } = await supabaseAdmin
    .from('dnd_campaign_members')
    .select('campaign_id')
    .eq('user_id', session.userId)
    .eq('role', 'dm');
  const campaignIds = ((dmRows ?? []) as { campaign_id: string }[]).map((r) => r.campaign_id);
  if (!campaignIds.length) return NextResponse.json({ encounters: [] });

  const { data: campRows } = await supabaseAdmin
    .from('dnd_campaigns').select('id, name').in('id', campaignIds);
  const campaignName = new Map(((campRows ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));

  const { data: sessionRows } = await supabaseAdmin
    .from('dnd_sessions').select('id, title, campaign_id').in('campaign_id', campaignIds);
  const sessions = (sessionRows ?? []) as { id: string; title: string; campaign_id: string }[];
  if (!sessions.length) return NextResponse.json({ encounters: [] });
  const sessionById = new Map(sessions.map((s) => [s.id, s]));

  const { data: encRows, error } = await supabaseAdmin
    .from('dnd_encounters')
    .select('id, name, status, session_id, created_at')
    .in('session_id', sessions.map((s) => s.id))
    // Newest first: the fight you are about to run is the one you just made.
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const encounters = ((encRows ?? []) as { id: string; name: string | null; status: string; session_id: string }[])
    // A finished fight is not somewhere you add a monster. Kept out rather than shown greyed: this list
    // exists to be picked from.
    .filter((e) => e.status !== 'done')
    .map((e) => {
      const sess = sessionById.get(e.session_id);
      return {
        id: e.id,
        name: e.name || 'Encounter',
        status: e.status,
        sessionTitle: sess?.title ?? null,
        campaignName: sess ? campaignName.get(sess.campaign_id) ?? null : null,
      };
    });

  return NextResponse.json({ encounters });
}
