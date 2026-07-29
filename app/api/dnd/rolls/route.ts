// app/api/dnd/rolls/route.ts — the shared roll log (Phase G10). POST records a roll
// to the campaign feed; GET lists the recent feed. Member-gated. Every sheet /
// quick-sheet / quick-action / DM roll posts here (posters ping the realtime
// channel so the feed updates live).
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession, getCampaignRole } from '@/lib/dnd/auth';
import { sendToDiscord, rollToDiscordMessage } from '@/lib/dnd/discord';

export async function POST(req: NextRequest) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  try {
    const { campaignId, sessionId, characterId, actorName, label, formula, result, breakdown, crit, fumble } = await req.json();
    if (!campaignId) return NextResponse.json({ error: 'campaignId is required.' }, { status: 400 });
    if (!label || !String(label).trim()) return NextResponse.json({ error: 'label is required.' }, { status: 400 });
    if ((await getCampaignRole(String(campaignId))) === null) {
      return NextResponse.json({ error: 'Not a member of this campaign.' }, { status: 403 });
    }

    const { data, error } = await supabaseAdmin
      .from('dnd_roll_log')
      .insert({
        campaign_id: campaignId,
        session_id: sessionId ?? null,
        character_id: characterId ?? null,
        actor_name: actorName ? String(actorName) : null,
        label: String(label),
        formula: formula ? String(formula) : null,
        result: result == null ? null : Number(result),
        breakdown: breakdown ? String(breakdown) : null,
        crit: !!crit,
        fumble: !!fumble,
      })
      .select('*')
      .single();
    if (error || !data) return NextResponse.json({ error: error?.message ?? 'Could not record roll.' }, { status: 500 });

    // Mirror to Discord, if the DM configured a webhook (P10-4). AFTER the insert, so the shared log is
    // authoritative and Discord is a copy — and fire-and-forget, so a roll never waits on, or fails
    // because of, someone else's chat service. Same rule as `publishRoll`, for the same reason.
    //
    // The webhook column is read here and NOWHERE ELSE on a read path: it is a credential, and the only
    // thing that should ever hold it is the code about to use it.
    try {
      const { data: camp } = await supabaseAdmin
        .from('dnd_campaigns').select('discord_webhook_url').eq('id', campaignId).maybeSingle();
      const hook = (camp as { discord_webhook_url?: string | null } | null)?.discord_webhook_url;
      if (hook) {
        sendToDiscord(hook, rollToDiscordMessage({
          actorName, label: String(label), result: result == null ? null : Number(result),
          breakdown: breakdown ? String(breakdown) : null, crit: !!crit, fumble: !!fumble,
        }));
      }
    } catch {
      /* the column may not exist until seed 461 is applied — a roll must not care */
    }

    return NextResponse.json({ roll: data });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Post failed.' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const campaignId = req.nextUrl.searchParams.get('campaignId');
  const sessionId = req.nextUrl.searchParams.get('sessionId');
  const characterId = req.nextUrl.searchParams.get('characterId');
  const limit = Math.min(200, Math.max(1, Number(req.nextUrl.searchParams.get('limit') ?? 60)));
  if (!campaignId) return NextResponse.json({ error: 'campaignId is required.' }, { status: 400 });
  if ((await getCampaignRole(campaignId)) === null) return NextResponse.json({ error: 'Not a member of this campaign.' }, { status: 403 });

  let query = supabaseAdmin.from('dnd_roll_log').select('*').eq('campaign_id', campaignId).order('created_at', { ascending: false }).limit(limit);
  if (sessionId) query = query.eq('session_id', sessionId);
  if (characterId) query = query.eq('character_id', characterId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rolls: data ?? [] });
}
