// app/api/admin/files/[id]/transcript/route.ts — a video's timed transcript.
//
//   GET  → { transcript: { status, words, duration_seconds, … } | null, configured }
//   POST → transcribe it now (or again), and answer with the result.
//
// Owner, 2026-11-09: "I want to transcribe videos and have time stamps for the words" — and search
// them (lib/transcripts/model.ts searchTranscript, run in the browser on `words`).
//
// Every request makes the file's own access check (lib/transcripts/media-url.ts): somebody who
// cannot open a video cannot read what was said in it either.

import { NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import type { FileUser } from '@/lib/files/permissions';
import { fileKind } from '@/lib/files/viewer-model';
import { mediaForTranscript } from '@/lib/transcripts/media-url';
import { transcribeUrl, transcriptionConfigured, SCRIBE_MODEL } from '@/lib/transcripts/elevenlabs';

// The ceiling this request has. Scribe is quick, but an hour-long video may need the webhook mode.
export const maxDuration = 300;

const DEFAULT_ORG = '00000000-0000-0000-0000-000000000001';
/** A "processing" row older than this is a request that died (a timeout, a deploy): retry is allowed. */
const STALE_MS = 6 * 60 * 1000;
const COLUMNS = 'id, file_id, file_name, status, model, words, duration_seconds, error, requested_by, created_at, updated_at, completed_at';

async function who() {
  const session = await auth();
  if (!session?.user?.email) return null;
  const user: FileUser = { email: session.user.email, roles: session.user.roles ?? [] };
  return { user, admin: isAdmin(session.user.roles), org: session.user.activeOrgId ?? DEFAULT_ORG };
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const me = await who();
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const id = decodeURIComponent(params.id);
  const media = await mediaForTranscript(id, me.user, me.admin, false);
  if (!media.ok) return NextResponse.json({ error: media.error }, { status: media.status });

  const { data, error } = await supabaseAdmin
    .from('video_transcripts').select(COLUMNS).eq('org_id', me.org).eq('file_id', id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ transcript: data ?? null, configured: transcriptionConfigured() });
}

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const me = await who();
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const id = decodeURIComponent(params.id);
  if (!transcriptionConfigured()) {
    return NextResponse.json({ error: 'Transcription is not set up yet: no ElevenLabs key (ELEVENLABS_STT_API_KEY or ELEVENLABS_API_KEY) on the server.' }, { status: 503 });
  }
  const media = await mediaForTranscript(id, me.user, me.admin, true);
  if (!media.ok) return NextResponse.json({ error: media.error }, { status: media.status });
  const kind = fileKind(media.name, media.mime);
  if (kind !== 'video' && kind !== 'audio') return NextResponse.json({ error: 'Only videos and recordings can be transcribed.' }, { status: 400 });
  if (!media.url) return NextResponse.json({ error: 'This file cannot be transcribed.' }, { status: 400 });

  // One at a time per file: a second press while the first is still running gets told so.
  const { data: existing } = await supabaseAdmin
    .from('video_transcripts').select('status, updated_at').eq('org_id', me.org).eq('file_id', id).maybeSingle();
  if (existing?.status === 'processing' && Date.now() - new Date(existing.updated_at as string).getTime() < STALE_MS) {
    return NextResponse.json({ error: 'This video is already being transcribed. Give it a minute, then reopen it.' }, { status: 409 });
  }

  const now = new Date().toISOString();
  const { error: upErr } = await supabaseAdmin.from('video_transcripts').upsert({
    org_id: me.org, file_id: id, file_name: media.name, status: 'processing', provider: 'elevenlabs', model: SCRIBE_MODEL,
    error: null, requested_by: me.user.email, updated_at: now,
  }, { onConflict: 'org_id,file_id' });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  try {
    const t = await transcribeUrl(media.url, AbortSignal.timeout(280_000));
    const { data, error } = await supabaseAdmin.from('video_transcripts').update({
      status: 'done', words: t.words, transcript: t.text, duration_seconds: t.duration, error: null,
      updated_at: new Date().toISOString(), completed_at: new Date().toISOString(),
    }).eq('org_id', me.org).eq('file_id', id).select(COLUMNS).single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ transcript: data, configured: true });
  } catch (err) {
    const message = err instanceof Error ? (err.name === 'TimeoutError' ? 'The transcription took too long and was stopped. Try again; very long videos may need to be split.' : err.message) : String(err);
    await supabaseAdmin.from('video_transcripts').update({ status: 'failed', error: message, updated_at: new Date().toISOString() })
      .eq('org_id', me.org).eq('file_id', id);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
