// app/api/dnd/sessions/[id]/ai-notes/route.ts — AI prep assistant (Phase I4). The DM
// asks for plot hooks / lore / an NPC idea / a twist; Claude drafts concise prep the
// client appends to the session's private DM notes. DM-gated. Returns text only —
// the client owns where it lands (so the DM can review before it's saved).
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession, getCampaignRole } from '@/lib/dnd/auth';
import { dndComplete, dndAiConfigured } from '@/lib/dnd/ai';

const SYSTEM =
  "You are a Dungeon Master's creative prep assistant. Given a request, produce concise, " +
  'immediately usable prep material for the DM\'s private notes — plot hooks, lore, NPCs, ' +
  'locations, or twists. Prefer a short markdown-lite bulleted list over prose. Be specific ' +
  'and evocative but brief (a few bullets). Do not add preamble or a sign-off.';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  if (!dndAiConfigured()) return NextResponse.json({ error: 'AI is not configured.' }, { status: 503 });

  const { data: sess } = await supabaseAdmin.from('dnd_sessions').select('campaign_id, title').eq('id', params.id).maybeSingle();
  const s = sess as { campaign_id: string; title: string | null } | null;
  if (!s) return NextResponse.json({ error: 'Session not found.' }, { status: 404 });
  if ((await getCampaignRole(s.campaign_id)) !== 'dm') return NextResponse.json({ error: 'Only the DM can generate prep.' }, { status: 403 });

  const { prompt } = await req.json().catch(() => ({}));
  if (!prompt || !String(prompt).trim()) return NextResponse.json({ error: 'A request is required.' }, { status: 400 });

  try {
    const text = await dndComplete({
      system: SYSTEM,
      user: `Session: ${s.title ?? 'Untitled'}\n\nRequest: ${String(prompt).trim()}`,
      maxTokens: 900,
      temperature: 0.9,
    });
    return NextResponse.json({ text });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'AI generation failed.' }, { status: 502 });
  }
}
