// app/api/twilio/receptionist/machine/route.ts — the answering machine's steps (owner, 2026-09-15).
//
//   ?step=recorded&n=<saved so far>&ask=<asks so far>   a <Record> ended → "Is there anything else?"
//   ?step=else&n=…&ask=…                                the answer to that → goodbye, record again, or noted
//
// The words and the decisions are lib/receptionist/answering-machine.ts; this route only keeps the
// call record in step with them. A recording's words arrive later on the voicemail route (`?part=`),
// which transcribes, analyses and tells the owners, as it always has for voicemail.
//
// Who is told what:
//   left a recording            → the voicemail route texts the owners when the transcript lands
//   only SAID something         → at goodbye, the call is analysed and the owners told (finishCall)
//   said nothing at all         → at goodbye, "called and didn't leave a message"
//   test calls                  → nobody, ever (is_test on the row)
//
// PUBLIC BY DESIGN: Twilio-signed, like the other receptionist routes.
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { validTwilioSignature, publicUrlOf, twilioParams } from '@/lib/twilio/signature';
import { twimlResponse } from '@/lib/twilio/twiml';
import { afterAnythingElse, afterRecording, MACHINE_LINES } from '@/lib/receptionist/answering-machine';
import { appendTurns, getCallBySid, updateCall } from '@/lib/receptionist/calls';
import { finishCall } from '@/lib/receptionist/finish';
import { notifyOwners } from '@/lib/receptionist/notify';
import { defer } from '@/lib/server/defer';

export const dynamic = 'force-dynamic';

const int = (v: string | null, max: number): number => Math.max(0, Math.min(max, Number.parseInt(v ?? '', 10) || 0));

export async function POST(request: Request): Promise<Response> {
  const params = await twilioParams(request);
  const url = publicUrlOf(request);
  if (!validTwilioSignature(url, params, request.headers.get('x-twilio-signature'))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const q = new URL(url).searchParams;
  const step = q.get('step');
  const voiceId = q.get('v');
  const n = int(q.get('n'), 20);
  const ask = int(q.get('ask'), 20);
  const callSid = params.CallSid ?? '';
  const from = params.From ?? '';

  // ── a recording ended ──
  if (step === 'recorded') {
    const seconds = Number(params.RecordingDuration) || 0;
    const saved = Boolean(params.RecordingUrl) && seconds > 0;
    if (callSid) {
      // What was said just before this recording, then the recording itself, so the transcript on
      // /admin/calls reads in order. The message's words replace nothing: they land in voicemail_text.
      await appendTurns(supabaseAdmin, callSid, [
        { role: 'assistant', text: n === 0 && ask === 0 ? MACHINE_LINES.greeting : MACHINE_LINES.goAhead },
        { role: 'caller', text: saved ? `(Recorded message ${n + 1}, ${seconds} seconds.)` : '(No message recorded.)' },
      ]);
      if (saved) {
        await updateCall(supabaseAdmin, callSid, {
          answered_by: 'voicemail',
          // The first message is the call's recording; later ones are transcribed into the same voicemail text.
          ...(n === 0 ? { recording_sid: params.RecordingSid ?? null, recording_url: params.RecordingUrl ?? null, recording_duration: seconds, recording_source: 'voicemail' } : {}),
        });
      }
    }
    return twimlResponse(afterRecording(n + (saved ? 1 : 0), saved, ask, voiceId));
  }

  // ── the answer to "is there anything else?" ──
  if (step === 'else') {
    const heard = (params.SpeechResult ?? '').trim();
    const outcome = afterAnythingElse(heard, n, ask, voiceId);
    if (callSid) {
      await appendTurns(supabaseAdmin, callSid, [
        ...(heard ? [{ role: 'caller' as const, text: heard }] : []),
        { role: 'assistant' as const, text: outcome.line },
      ]);
      // Something said out loud counts as a message too.
      if (outcome.kind === 'noted') await updateCall(supabaseAdmin, callSid, { answered_by: 'voicemail' });
    }

    if (outcome.kind === 'goodbye' && callSid) {
      defer((async () => {
        const call = await updateCall(supabaseAdmin, callSid, { status: 'completed', ended_at: new Date().toISOString() });
        if (!call || n > 0) return; // a recording's own transcript callback tells the owners
        const spoke = (call.transcript ?? []).some((t) => t.role === 'caller' && t.text && !t.text.startsWith('('));
        if (spoke) {
          const said = (call.transcript ?? []).filter((t) => t.role === 'caller' && !t.text.startsWith('(')).map((t) => t.text).join(' ');
          await finishCall(callSid, from, { facts: {}, turns: (call.transcript ?? []).filter((t): t is { role: 'caller' | 'assistant'; text: string } => t.role !== 'owner') }, said.slice(0, 300));
          return;
        }
        await updateCall(supabaseAdmin, callSid, { answered_by: 'none' });
        if (call.is_test || call.notified_at) return;
        await notifyOwners({ from, facts: {}, summary: "Called, but didn't leave a message.", callId: call.id, answeredBy: 'none', call });
        await updateCall(supabaseAdmin, callSid, { notified_at: new Date().toISOString() });
      })(), 'answering machine goodbye');
    }
    return twimlResponse(outcome.twiml);
  }

  return NextResponse.json({ error: 'unknown step' }, { status: 400 });
}
