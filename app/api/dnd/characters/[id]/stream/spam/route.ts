// app/api/dnd/characters/[id]/stream/spam/route.ts — Spam Chat (Phase J5). The DM
// enters a phrase; the AI drafts a burst of stylized variations (falling back to the
// procedural generator on any failure), each posted as a stream line from a random
// viewer so the chat floods. DM/owner-gated.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getDndSession, getCampaignRole } from '@/lib/dnd/auth';
import { dndCompleteJSON, dndAiConfigured } from '@/lib/dnd/ai';
import { spamVariations } from '@/lib/dnd/stream-spam';
import { makeUsernames } from '@/lib/dnd/stream-names';

async function characterAccess(id: string, userId: string) {
  const { data } = await supabaseAdmin.from('dnd_characters').select('campaign_id, owner_user_id').eq('id', id).maybeSingle();
  const row = data as { campaign_id: string; owner_user_id: string | null } | null;
  if (!row) return null;
  const role = await getCampaignRole(row.campaign_id);
  return { isDM: role === 'dm', isOwner: row.owner_user_id === userId };
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const access = await characterAccess(params.id, session.userId);
  if (!access) return NextResponse.json({ error: 'Character not found.' }, { status: 404 });
  if (!access.isDM && !access.isOwner) return NextResponse.json({ error: 'Only the DM or owner can spam chat.' }, { status: 403 });

  const { phrase, count } = await req.json().catch(() => ({}));
  if (!phrase || !String(phrase).trim()) return NextResponse.json({ error: 'A phrase is required.' }, { status: 400 });
  const n = Math.min(40, Math.max(3, Number(count) || 18));

  // AI variations, with the procedural generator as a guaranteed fallback.
  let variations: string[] | null = null;
  if (dndAiConfigured()) {
    try {
      const out = await dndCompleteJSON<string[]>({
        system:
          'You generate live-chat spam for a fantasy-world streamer: short stylized variations of a phrase — case flips, ' +
          'emoji, char repeats, and hyped reactions. HARD RULES: completely CLEAN (NO profanity/cussing of any kind, ' +
          'no slurs, nothing sexual, no threats, and NO taking the Lord\'s name in vain / religious references like ' +
          '"god"/"omg"/"gosh"); and IN-WORLD only — never reference D&D, dice, rolls, the DM, or any game mechanic. ' +
          'Return ONLY a JSON array of strings, each under 60 chars.',
        user: `Give me ${n} clean, hyped spam variations of: "${String(phrase).trim()}"`,
        maxTokens: 800,
        temperature: 1,
      });
      if (Array.isArray(out) && out.length >= 3) variations = out.slice(0, n).map((s) => String(s).slice(0, 240));
    } catch {
      /* fall through to procedural */
    }
  }
  if (!variations) variations = spamVariations(String(phrase), n);

  const crowd = makeUsernames(variations.length, Math.floor(Math.random() * 100000));
  const rows = variations.map((body, i) => ({
    character_id: params.id,
    username: crowd[i].name,
    body,
    badges: crowd[i].badges,
    color: crowd[i].color,
  }));
  const { error } = await supabaseAdmin.from('dnd_stream_messages').insert(rows);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, count: rows.length });
}
