// app/api/admin/phone/calls/[id]/transcribe/route.ts — slices T2/T3 of
// docs/planning/completed/PHONE_CALLS_AND_VOICEMAIL_2026-08-14.md
//
// Re-run the AI over one call. The same request the receipt queue grew — the first pass is
// sometimes wrong, and a person looking at a wrong summary needs a way to ask again.
//
// `force` re-buys the transcript; without it only the summary is regenerated over the transcript
// already stored. That split matters because the two cost very different amounts, and "the summary
// missed the callback number" does not need the audio read again.
import { NextRequest, NextResponse } from 'next/server';
import { auth, isAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/apiErrorHandler';
import { transcribeCall, canTranscribeInProcess } from '@/lib/phone/transcribe';
import { idFromPath } from '@/lib/phone/route-params';

export const maxDuration = 300;

export const POST = withErrorHandler(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdmin(session.user.roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const id = idFromPath(req.url, 1);
  if (!id) return NextResponse.json({ error: 'Bad call id.' }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as { force?: boolean };

  if (body.force) {
    if (!canTranscribeInProcess()) {
      // Honest rather than optimistic: clearing the transcript and queueing would work, but the
      // person clicking expects a result now, and silently deferring to a worker they cannot see
      // reads as the button being broken.
      return NextResponse.json(
        {
          error:
            'This deployment cannot transcribe directly — OPENAI_API_KEY is not set here, so audio ' +
            'is transcribed by the worker. The summary can still be re-run.',
          code: 'transcription_not_local',
        },
        { status: 503 },
      );
    }
    await supabaseAdmin
      .from('calls')
      .update({ transcript: null, transcript_status: 'queued' })
      .eq('id', id);
  }

  const result = await transcribeCall(id);
  const status = result.status === 'failed' ? 500 : 200;
  return NextResponse.json(result, { status });
}, { routeName: 'admin/phone/calls/[id]/transcribe' });
