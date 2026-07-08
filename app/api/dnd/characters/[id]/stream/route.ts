// app/api/dnd/characters/[id]/stream/route.ts — streamer-chat state (Phase J2). Each
// character can "go live" with a fake stream overlay: is_live, viewer_count, chat_speed.
// GET returns the state (default if none); PATCH (DM or owner) toggles live / sets the
// viewer count + speed. The chat panel (J3) and spam/polls (J5/J7) build on this.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession, getCampaignRole } from '@/lib/dnd/auth';

const DEFAULT_STATE = {
  is_live: false, viewer_count: 0, chat_speed: 3, engagement: 50,
  dc_mode: 'auto', dc_manual: null, moods: [] as string[],
  focus_topic: null, focus_until: null, focus_intensity: 3,
  ai_mood_lines: {}, ai_lines_at: null, last_activity_at: null, end_warning_at: null,
  donations_enabled: false, generosity: 'off', kibbles_earned: 0,
};
const COLS =
  'is_live, viewer_count, chat_speed, engagement, active_spam, dc_mode, dc_manual, moods, ' +
  'focus_topic, focus_until, focus_intensity, ai_mood_lines, ai_lines_at, last_activity_at, end_warning_at, ' +
  'donations_enabled, generosity, kibbles_earned, updated_at';

async function characterAccess(id: string, userId: string) {
  const { data } = await supabaseAdmin.from('dnd_characters').select('campaign_id, owner_user_id').eq('id', id).maybeSingle();
  const row = data as { campaign_id: string; owner_user_id: string | null } | null;
  if (!row) return null;
  const role = await getCampaignRole(row.campaign_id);
  return { role, isDM: role === 'dm', isOwner: row.owner_user_id === userId, isMember: role !== null };
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const access = await characterAccess(params.id, session.userId);
  if (!access) return NextResponse.json({ error: 'Character not found.' }, { status: 404 });
  if (!access.isMember) return NextResponse.json({ error: 'No access.' }, { status: 403 });

  const { data } = await supabaseAdmin.from('dnd_stream_state').select(COLS).eq('character_id', params.id).maybeSingle();
  return NextResponse.json({ stream: data ?? { ...DEFAULT_STATE, active_spam: null } });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const access = await characterAccess(params.id, session.userId);
  if (!access) return NextResponse.json({ error: 'Character not found.' }, { status: 404 });
  if (!access.isDM && !access.isOwner) return NextResponse.json({ error: 'Only the DM or owner can control the stream.' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = { character_id: params.id, updated_at: new Date().toISOString() };
  if (typeof body.isLive === 'boolean') patch.is_live = body.isLive;
  // Clamp to [0, 9e15] — a bigint column, but capped under JS's exact-integer limit
  // (2^53) so quadrillion-scale counts round-trip precisely.
  if (body.viewerCount != null) patch.viewer_count = Math.max(0, Math.min(9e15, Math.round(Number(body.viewerCount)) || 0));
  // chat_speed is now a pause flag: 0 = ambient paused for everyone, >0 = running (the
  // pace itself is viewer-driven). Allow 0 explicitly (don't let `|| 3` swallow it).
  if (body.chatSpeed != null) {
    const cs = Math.round(Number(body.chatSpeed));
    patch.chat_speed = Number.isFinite(cs) ? Math.max(0, Math.min(10, cs)) : 3;
  }
  if (body.engagement != null) patch.engagement = Math.max(0, Math.min(100, Math.round(Number(body.engagement)) || 0));

  // Resist-DC mode (K): 'auto' blends viewers+engagement; 'manual' pins an exact 2–25.
  if (body.dcMode === 'auto' || body.dcMode === 'manual') patch.dc_mode = body.dcMode;
  if (body.dcManual !== undefined) {
    patch.dc_manual = body.dcManual == null ? null : Math.max(2, Math.min(25, Math.round(Number(body.dcManual)) || 2));
  }
  // Chat moods (K): array of known-shaped mood ids (validated client-side + by the pool builder).
  if (Array.isArray(body.moods)) {
    patch.moods = body.moods.filter((m: unknown) => typeof m === 'string').slice(0, 12);
  }
  // Aggressive-focus window (K): topic + when it ends + 1–5 intensity. Null topic clears it.
  if (body.focusTopic !== undefined) patch.focus_topic = body.focusTopic ? String(body.focusTopic).slice(0, 240) : null;
  if (body.focusUntil !== undefined) patch.focus_until = body.focusUntil ? new Date(body.focusUntil).toISOString() : null;
  if (body.focusIntensity != null) patch.focus_intensity = Math.max(1, Math.min(5, Math.round(Number(body.focusIntensity)) || 3));
  // AI mood-line cache refresh (K) + idle auto-end bookkeeping.
  if (body.aiMoodLines !== undefined && body.aiMoodLines && typeof body.aiMoodLines === 'object') {
    patch.ai_mood_lines = body.aiMoodLines;
    patch.ai_lines_at = new Date().toISOString();
  }
  if (body.touchActivity) patch.last_activity_at = new Date().toISOString();
  if (body.endWarningAt !== undefined) patch.end_warning_at = body.endWarningAt ? new Date(body.endWarningAt).toISOString() : null;
  // Donations/superchats (R): off by default; the DM flips them on + picks generosity.
  if (typeof body.donationsEnabled === 'boolean') patch.donations_enabled = body.donationsEnabled;
  if (['off', 'stingy', 'normal', 'generous', 'overgiving'].includes(body.generosity)) patch.generosity = body.generosity;
  if (body.kibblesEarned != null) patch.kibbles_earned = Math.max(0, Math.floor(Number(body.kibblesEarned)) || 0);

  if (Object.keys(patch).length <= 2) return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });
  // Any DM action counts as engagement for the idle auto-end clock (unless already set above).
  if (patch.last_activity_at === undefined) patch.last_activity_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from('dnd_stream_state')
    .upsert(patch, { onConflict: 'character_id' })
    .select(COLS)
    .single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Update failed.' }, { status: 500 });
  return NextResponse.json({ stream: data });
}
