// app/api/dnd/characters/[id]/stream/mood-refresh/route.ts — periodic AI mood lines (K).
// Ambient chat is mostly procedural, but every ~15 min while live the client calls this to
// freshen the pool: for EVERY mood the AI writes new in-world lines spanning the full range
// of aggressiveness (calm → rowdy → feral), which we MERGE with a slice of the previous
// ones (some old kept) and cache on the stream state (ai_mood_lines) for buildMoodPool to
// fold in. Best-effort + DM/owner-gated.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession, getCampaignRole } from '@/lib/dnd/auth';
import { dndCompleteJSON, dndAiConfigured } from '@/lib/dnd/ai';
import { moodById } from '@/lib/dnd/stream-moods';

const KEEP_OLD = 8;   // carry this many prior lines forward
const NEW_PER = 10;   // ask the AI for this many fresh lines per mood
const CAP = 22;       // max cached lines per mood

async function access(id: string, userId: string) {
  const { data } = await supabaseAdmin.from('dnd_characters').select('campaign_id, owner_user_id').eq('id', id).maybeSingle();
  const row = data as { campaign_id: string; owner_user_id: string | null } | null;
  if (!row) return null;
  const role = await getCampaignRole(row.campaign_id);
  return { isDM: role === 'dm', isOwner: row.owner_user_id === userId };
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const a = await access(params.id, session.userId);
  if (!a) return NextResponse.json({ error: 'Character not found.' }, { status: 404 });
  if (!a.isDM && !a.isOwner) return NextResponse.json({ error: 'No access.' }, { status: 403 });
  if (!dndAiConfigured()) return NextResponse.json({ ok: false, skipped: 'ai-off' });

  const { moods } = await req.json().catch(() => ({}));
  const ids = (Array.isArray(moods) ? moods : []).filter((m: unknown) => typeof m === 'string' && moodById(m as string));
  if (ids.length === 0) return NextResponse.json({ ok: false, skipped: 'no-moods' });

  const { data: state } = await supabaseAdmin.from('dnd_stream_state').select('ai_mood_lines, ai_lines_at').eq('character_id', params.id).maybeSingle();
  // Dedupe across clients: both the DM's and the streamer's client poll for the 15-min
  // refresh, so skip if we already generated in the last ~13 min (whoever fired first wins).
  const lastAt = (state as { ai_lines_at?: string | null } | null)?.ai_lines_at;
  if (lastAt && Date.now() - new Date(lastAt).getTime() < 13 * 60 * 1000) {
    return NextResponse.json({ ok: false, skipped: 'recent' });
  }
  const prev = ((state as { ai_mood_lines?: Record<string, string[]> } | null)?.ai_mood_lines) ?? {};
  const next: Record<string, string[]> = { ...prev };

  await Promise.all(ids.map(async (id: string) => {
    const mood = moodById(id)!;
    try {
      const out = await dndCompleteJSON<string[]>({
        system:
          'You write live-chat lines for a fantasy-world streamer girl — short, goofy, hyped viewer messages. ' +
          'HARD RULES: completely CLEAN (no profanity of any kind, no slurs, nothing sexual, no threats, and NO ' +
          'religious references / taking the Lord\'s name in vain — no "god"/"omg"/"gosh"); and IN-WORLD only — ' +
          'never mention D&D, dice, rolls, the DM, or any game mechanic. Match the given MOOD. Mostly 2–7 words, ' +
          'ALL CAPS/emojis/slang welcome. Return ONLY a JSON array of strings, each under 60 chars.',
        user: `Mood: ${mood.label} — examples: ${mood.lines.slice(0, 4).join(' / ')}. Write ${NEW_PER} fresh chat lines in this mood, spanning the FULL range of aggressiveness/energy — some calm and low-key, some rowdy, some absolutely feral all-caps spam. Vary the intensity line to line.`,
        maxTokens: 500,
        temperature: 1,
      });
      const fresh = Array.isArray(out) ? out.map((s) => String(s).slice(0, 120)).filter(Boolean) : [];
      const kept = (prev[id] ?? []).slice(-KEEP_OLD);
      next[id] = Array.from(new Set([...kept, ...fresh])).slice(-CAP);
    } catch { /* keep whatever was there */ }
  }));

  const { error } = await supabaseAdmin
    .from('dnd_stream_state')
    .upsert({ character_id: params.id, ai_mood_lines: next, ai_lines_at: new Date().toISOString() }, { onConflict: 'character_id' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, moods: ids, counts: Object.fromEntries(ids.map((id: string) => [id, next[id]?.length ?? 0])) });
}
