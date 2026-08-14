// app/api/twilio/dial-status/route.ts — slice I3 of
// docs/planning/in-progress/PHONE_CALLS_AND_VOICEMAIL_2026-08-14.md
//
// Where `<Dial action="…">` posts once the ringing stops. It exists to answer one question: did a
// person pick up?
//
// ── WHY THE ANSWER ISN'T OBVIOUS ────────────────────────────────────────────────────────────────
//
// `DialCallStatus` is 'completed' both when somebody answered and talked for ten minutes, and when
// the office's own mobile voicemail answered after four rings. The second case is the failure this
// whole feature exists to fix — a message sitting on a personal phone that nobody transcribes,
// summarises or files.
//
// We cannot reliably tell those apart from Twilio's status alone. What we can do is not pretend:
// a 'completed' dial ends the TwiML here (returning nothing continues the parent document, which
// would then record a second voicemail after a real conversation), and anything else falls through
// to our own voicemail.
import { NextRequest } from 'next/server';
import { readTwilioWebhook, twimlResponse, webhookUrl } from '@/lib/phone/webhook';
import { loadPhoneHours } from '@/lib/phone/settings';
import { afterHoursTwiml, twimlDocument } from '@/lib/phone/twiml';
import { updateCallBySid, markVoicemail } from '@/lib/phone/calls';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const result = await readTwilioWebhook(req, 'dial-status');
  if (!result.ok) return twimlResponse(twimlDocument('<Hangup/>'), 200);

  const { params, callSid } = result.data;
  const dialStatus = params.DialCallStatus ?? '';

  try {
    if (dialStatus === 'completed' || dialStatus === 'answered') {
      if (callSid) {
        await updateCallBySid(callSid, {
          status: 'completed',
          answered_at: new Date().toISOString(),
          handled_by: params.DialCallSid ? `twilio:${params.DialCallSid}` : null,
        });
      }
      // An empty <Response/> ends the call cleanly. Returning nothing at all would resume the
      // parent document and put the caller into voicemail after they had just finished talking to
      // somebody — the kind of bug a customer reports and nobody can reproduce.
      return twimlResponse(twimlDocument());
    }

    // busy / no-answer / failed / canceled — take a message.
    if (callSid) await markVoicemail(callSid, 'no_answer');
    const hours = await loadPhoneHours();
    return twimlResponse(
      afterHoursTwiml(hours.afterHoursGreeting, {
        recordAction: webhookUrl('/api/twilio/voicemail') ?? undefined,
        recordingStatusCallback: webhookUrl('/api/twilio/recording') ?? undefined,
      }),
    );
  } catch (err) {
    console.error('[twilio/dial-status] falling back to voicemail', err);
    return twimlResponse(
      afterHoursTwiml('Please leave your name, number, and a short message after the tone.', {
        recordingStatusCallback: webhookUrl('/api/twilio/recording') ?? undefined,
      }),
    );
  }
}
