// app/api/twilio/receptionist/voicemail/route.ts — a recorded message.
//
// Twilio calls this twice: once when the recording ends (RecordingUrl, RecordingDuration) — we
// thank the caller and hang up — and once more when its transcription is ready
// (TranscriptionText, TranscriptionStatus). The call row gets the recording on the first call and
// the words on the second; the owners are told on the second so the message arrives with words in
// it, and if transcription fails they still get the recording link on the call page.
//
// PUBLIC BY DESIGN: Twilio-signed, like the entry route.
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { validTwilioSignature, publicUrlOf, twilioParams } from '@/lib/twilio/signature';
import { hangup, say, twiml, twimlResponse } from '@/lib/twilio/twiml';
import { readStateCookie, clearStateCookieHeader } from '@/lib/receptionist/state';
import { OWNER_NAME as OWNER } from '@/lib/receptionist/knowledge';
import { notifyOwners } from '@/lib/receptionist/notify';
import { factsToColumns, getCallBySid, updateCall } from '@/lib/receptionist/calls';
import { analyzeCall, contactColumns } from '@/lib/receptionist/analysis';
import { defer } from '@/lib/server/defer';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  const params = await twilioParams(request);
  if (!validTwilioSignature(publicUrlOf(request), params, request.headers.get('x-twilio-signature'))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const from = params.From ?? params.Caller ?? '';
  const callSid = params.CallSid ?? '';
  const state = readStateCookie(request);
  // The answering machine (2026-09-15) can take more than one message on a call; each recording's
  // transcript arrives here with its number. Message 2+ is ADDED to the voicemail text, never replaces it.
  const part = Math.max(1, Number.parseInt(new URL(publicUrlOf(request)).searchParams.get('part') ?? '', 10) || 1);

  if ('TranscriptionStatus' in params || 'TranscriptionText' in params) {
    const transcript = params.TranscriptionStatus === 'completed' ? (params.TranscriptionText ?? '').trim() : '';
    // Analysis (a slower model) and the owner alerts run after the 204 goes back; Twilio only needs
    // to know the callback was received. See lib/server/defer.ts.
    defer((async () => {
      const before = part > 1 ? await getCallBySid(supabaseAdmin, callSid) : null;
      const text = part > 1
        ? [before?.voicemail_text, transcript ? `Message ${part}: ${transcript}` : null].filter(Boolean).join('\n\n') || null
        : transcript || null;
      let call = await updateCall(supabaseAdmin, callSid, { voicemail_text: text, status: 'completed', ended_at: new Date().toISOString() });
      if (call) {
        const analysis = await analyzeCall(call);
        if (analysis) call = (await updateCall(supabaseAdmin, callSid, { ...contactColumns(call, analysis), analysis, summary: analysis.summary })) ?? call;
      }
      if (call?.is_test || state.test) { await updateCall(supabaseAdmin, callSid, { notified_at: new Date().toISOString() }); return; }
      await notifyOwners({
        from,
        facts: { ...state.facts, kind: state.facts.kind ?? (call?.kind as never) ?? 'unknown' },
        summary: part > 1
          ? (transcript ? `Another message from the same call: ${transcript.slice(0, 160)}` : 'Left another message (no transcript).')
          : call?.analysis?.summary || (transcript ? `voicemail: ${transcript.slice(0, 160)}` : 'left a voicemail (no transcript)'),
        recordingUrl: params.RecordingUrl ? `${params.RecordingUrl}.mp3` : undefined,
        transcript: transcript || undefined,
        callId: call?.id,
        answeredBy: 'voicemail',
        call,
      });
      await updateCall(supabaseAdmin, callSid, { notified_at: new Date().toISOString() });
    })(), 'voicemail wrap-up');
    return new Response(null, { status: 204 });
  }

  // Recording just finished.
  await updateCall(supabaseAdmin, callSid, {
    ...factsToColumns(state.facts),
    answered_by: 'voicemail',
    recording_sid: params.RecordingSid ?? null,
    recording_url: params.RecordingUrl ?? null,
    recording_duration: Number(params.RecordingDuration) || null,
    recording_source: 'voicemail',
  });
  if (!params.RecordingUrl) {
    defer((async () => {
      const call = await getCallBySid(supabaseAdmin, callSid);
      if (call?.is_test || state.test) return;
      await notifyOwners({ from, facts: state.facts, summary: 'Called and hung up before leaving a message.', callId: call?.id, answeredBy: 'none', call });
    })(), 'hung-up notice');
  }
  return twimlResponse(twiml(say(`Got it. ${OWNER} will get your message. Goodbye.`), hangup()), { 'set-cookie': clearStateCookieHeader() });
}
