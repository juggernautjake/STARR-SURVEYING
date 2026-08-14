// app/api/twilio/voice/route.ts — slices I2/I3 of
// docs/planning/completed/PHONE_CALLS_AND_VOICEMAIL_2026-08-14.md
//
// The number in the Twilio console points here. This is the whole of "a call comes in": decide
// whether the office is open, ring it or take a message, and write down that it happened.
//
// ── THE CALLER GETS AN ANSWER EVEN WHEN WE ARE BROKEN ───────────────────────────────────────────
//
// Everything after the signature check is wrapped, and any failure falls through to a working
// voicemail document. The database being down, the settings being corrupt, a bug in the hours rule —
// none of those are reasons for a customer to hear dead air. A missed message is recoverable; a
// caller who concludes the number is disconnected is not.
//
// That is also why the row is written AFTER the TwiML is chosen: the greeting does not depend on the
// insert succeeding.
import { NextRequest } from 'next/server';
import { readTwilioWebhook, twimlResponse, webhookUrl } from '@/lib/phone/webhook';
import { loadPhoneHours } from '@/lib/phone/settings';
import { isOpenAt } from '@/lib/phone/hours';
import { readTwilioConfig } from '@/lib/phone/config';
import { afterHoursTwiml, inHoursTwiml, twimlDocument, say } from '@/lib/phone/twiml';
import { registerCall, applyCallerMatch, markVoicemail } from '@/lib/phone/calls';

// Never prerendered, never cached: the answer depends on the clock.
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const result = await readTwilioWebhook(req, 'voice');

  if (!result.ok) {
    // A forged or misconfigured request gets a valid TwiML hangup rather than a 403 body. Twilio
    // retries a non-2xx, so a bare error would have an attacker's forged request replayed at us
    // several more times — and a genuine caller behind a misconfigured signature would hear the
    // silence of an unparseable response instead of a sentence.
    return twimlResponse(
      twimlDocument(say('We are unable to take your call right now. Goodbye.'), '<Hangup/>'),
      200,
    );
  }

  const { params, callSid } = result.data;

  try {
    const hours = await loadPhoneHours();
    const open = isOpenAt(new Date(), hours);
    const cfg = readTwilioConfig();

    const urls = {
      recordAction: webhookUrl('/api/twilio/voicemail') ?? undefined,
      recordingStatusCallback: webhookUrl('/api/twilio/recording') ?? undefined,
      dialAction: webhookUrl('/api/twilio/dial-status') ?? undefined,
    };

    const xml = open.open
      ? inHoursTwiml({
          greeting: hours.greeting,
          forwardTo: hours.forwardTo,
          ringSeconds: hours.ringSeconds,
          // Show the business number to whoever we ring, not the customer's — otherwise the office
          // cannot tell a forwarded business call from a personal one.
          callerId: cfg.fromNumber ?? undefined,
          // What the caller hears when the ringing produces nobody. The after-hours wording says
          // "our office is closed", which is false during opening hours — and flatly wrong when
          // there is simply nobody configured to ring, which is the state of a deployment that has
          // not finished being set up.
          fallbackGreeting:
            hours.forwardTo.length === 0
              ? `${hours.greeting} Nobody is available to take your call right now. Please leave your name, number, and a short message after the tone, and we will call you back.`
              : 'Nobody is available to take your call right now. Please leave your name, number, and a short message after the tone, and we will call you back.',
          urls,
        })
      : afterHoursTwiml(hours.afterHoursGreeting, urls);

    // Bookkeeping after the decision, and deliberately not awaited as a group: a slow match must not
    // delay the response, because Twilio times the webhook out at 15 seconds and a timeout means the
    // caller hears nothing at all.
    if (callSid) {
      void (async () => {
        try {
          await registerCall({
            callSid,
            direction: 'inbound',
            from: params.From ?? null,
            to: params.To ?? null,
            callerName: params.CallerName || null,
            status: 'ringing',
          });
          if (!open.open) await markVoicemail(callSid, open.reason ?? 'outside_hours');
          await applyCallerMatch(callSid, params.From ?? null);
        } catch (err) {
          console.error('[twilio/voice] bookkeeping failed', err);
        }
      })();
    }

    return twimlResponse(xml);
  } catch (err) {
    // The safety net described in the header.
    console.error('[twilio/voice] falling back to plain voicemail', err);
    // Firm-neutral on purpose: this path runs when settings could not be read, so it cannot know
    // whose greeting to give — and naming the wrong firm to a caller is worse than naming none.
    return twimlResponse(
      afterHoursTwiml(
        'Thank you for calling. Please leave your name, number, and a short message after the tone.',
        { recordingStatusCallback: webhookUrl('/api/twilio/recording') ?? undefined },
      ),
    );
  }
}

/** Twilio only ever POSTs here; a GET is somebody poking at the URL. Say so plainly. */
export async function GET() {
  return twimlResponse(twimlDocument(say('This endpoint accepts calls from Twilio only.'), '<Hangup/>'), 405);
}
