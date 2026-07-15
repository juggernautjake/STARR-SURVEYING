// app/api/dnd/characters/[id]/answer/route.ts — the user answers the AI builder's open design
// questions (Phase V, Slice 5). Answers are stored as a source note so a re-ingest incorporates
// them, and the open-questions list is cleared. Owner/DM-gated. Client re-runs /ingest after.
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { supabaseAdmin, ensureStorageBucket } from '@/lib/supabase';
import { getDndSession, getCampaignRole } from '@/lib/dnd/auth';

const BUCKET = 'dnd-media';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getDndSession();
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const { data: ch } = await supabaseAdmin.from('dnd_characters').select('id, campaign_id, owner_user_id').eq('id', params.id).maybeSingle();
  if (!ch) return NextResponse.json({ error: 'Character not found.' }, { status: 404 });
  const row = ch as { id: string; campaign_id: string | null; owner_user_id: string | null };
  const isDM = row.campaign_id ? (await getCampaignRole(row.campaign_id)) === 'dm' : false;
  if (!isDM && row.owner_user_id !== session.userId) return NextResponse.json({ error: 'You cannot edit this character.' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const answers = (Array.isArray(body?.answers) ? body.answers : []) as { question?: string; answer?: string }[];
  const lines = answers
    .map((a) => ({ q: String(a?.question ?? '').trim(), a: String(a?.answer ?? '').trim() }))
    .filter((x) => x.a)
    .map((x) => `Q: ${x.q}\nA: ${x.a}`);
  if (!lines.length) return NextResponse.json({ error: 'No answers provided.' }, { status: 400 });

  // Store the resolutions as a source note the next ingest will read.
  try {
    await ensureStorageBucket(BUCKET, { public: true });
    const key = `imports/${params.id}/answers-${crypto.randomUUID()}.txt`;
    const text = `DESIGN DECISIONS RESOLVED BY THE USER (authoritative — prefer these over the source files):\n\n${lines.join('\n\n')}`;
    const { error: sErr } = await supabaseAdmin.storage.from(BUCKET).upload(key, Buffer.from(text, 'utf8'), { contentType: 'text/plain', upsert: true });
    if (!sErr) {
      const url = supabaseAdmin.storage.from(BUCKET).getPublicUrl(key).data.publicUrl;
      await supabaseAdmin.from('dnd_character_uploads').insert({ character_id: params.id, url, filename: 'design-answers.txt', mime: 'text/plain', kind: 'source' });
    }
  } catch {
    /* storage unavailable — still clear the questions below so the user isn't stuck */
  }

  await supabaseAdmin.from('dnd_characters').update({ build_questions: [] }).eq('id', params.id);
  return NextResponse.json({ ok: true, resolved: lines.length });
}
