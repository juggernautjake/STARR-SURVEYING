// app/api/dnd/characters/[id]/stream/direct/route.ts — AI chat director (Phase J12).
// The DM describes, in plain language, what the patron chat should generally be saying
// (e.g. "tell her she's pretty but she's about to get busted up"); the AI writes a burst
// of DISTINCT, in-character Twitch-chat lines matching that intent/tone and posts them
// as random viewers so they weave into the live feed. DM/owner-gated. Falls back to the
// procedural spam generator if the AI is unconfigured or errors, so it always produces
// something.
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
  if (!access.isDM && !access.isOwner) return NextResponse.json({ error: 'Only the DM or owner can direct chat.' }, { status: 403 });

  const { directive, count } = await req.json().catch(() => ({}));
  if (!directive || !String(directive).trim()) return NextResponse.json({ error: 'A directive is required.' }, { status: 400 });
  const n = Math.min(40, Math.max(4, Number(count) || 16));

  let lines: string[] | null = null;
  let aiUsed = false;
  if (dndAiConfigured()) {
    try {
      const out = await dndCompleteJSON<string[]>({
        system:
          'You are the live Twitch chat for a streamer — a flood of rowdy, hyped, DUMB little messages. ' +
          "Given the director's note about what chat should be saying, write a burst of chat lines that match it. " +
          'STYLE RULES (important): keep them SHORT, GOOFY and DUMB — like real chat, not sentences a writer would craft. ' +
          'Most lines 2–7 words. NO fancy vocabulary, NO descriptive prose, NO complete grammar. Lots of ALL CAPS, emojis, ' +
          'typos, slang, repeated letters, and reactions. Each line is a different random viewer so vary the energy. ' +
          'Clean-ish (PG-13): playful cartoon roasting only — no slurs, nothing sexual, no real threats. ' +
          'Examples of the exact vibe (for a note like "she is pretty but about to get beat up"): ' +
          '["YOU GORGEOUS!! FOR NOW 💀","not pretty for long lmaooo","SHE FINNA GET BUSSED UP","pretty lil nose bout to be GONE","W face L future 😭","runnnn girl RUN","cute!! ok bye 👋","she cooked chat","10/10 gonna be 2/10 soon 💀💀"]. ' +
          'Return ONLY a JSON array of strings, each under 60 chars.',
        user: `Director's note: "${String(directive).trim()}". Write ${n} short dumb chat lines matching it.`,
        maxTokens: 700,
        temperature: 1,
      });
      if (Array.isArray(out) && out.length >= 3) {
        lines = out.slice(0, n).map((s) => String(s).slice(0, 240));
        aiUsed = true;
      }
    } catch {
      /* fall through to procedural */
    }
  }
  if (!lines) lines = spamVariations(String(directive), n);

  const crowd = makeUsernames(lines.length, Math.floor(Math.random() * 100000));
  const rows = lines.map((body, i) => ({
    character_id: params.id,
    username: crowd[i].name,
    body,
    badges: crowd[i].badges,
    color: crowd[i].color,
  }));
  const { error } = await supabaseAdmin.from('dnd_stream_messages').insert(rows);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, count: rows.length, aiUsed });
}
